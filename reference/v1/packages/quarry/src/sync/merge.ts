/**
 * Merge Strategy - Conflict resolution for sync operations
 *
 * Implements Last-Write-Wins (LWW) strategy with special handling for:
 * - Tombstones (soft deletes)
 * - Status fields (closed wins over open)
 * - Tags (set union merge)
 * - Dependencies (removal is authoritative)
 */

import type { Element, Dependency, DependencyType } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import {
  MergeResolution,
  TombstoneStatus,
  type ConflictRecord,
  type DependencyConflictRecord,
} from './types.js';
import { computeContentHashSync } from './hash.js';

// ============================================================================
// Element Merge
// ============================================================================

/**
 * Merge result for elements
 */
export interface ElementMergeResult {
  /** The winning element */
  element: Element;
  /** How the merge was resolved */
  resolution: MergeResolution;
  /** Whether local element was modified */
  localModified: boolean;
  /** Conflict record if there was a conflict */
  conflict?: ConflictRecord;
}

/**
 * Merge two versions of an element using Last-Write-Wins strategy
 *
 * Special cases:
 * - Identical content hash: Skip (no conflict)
 * - Tombstone handling: Fresh tombstone wins over live
 * - Status merge: Closed wins over open states
 * - Tags merge: Union of both tag sets
 *
 * @param local - Local element
 * @param remote - Remote element (from import)
 * @param tombstoneTtl - Tombstone TTL in milliseconds (default: 30 days)
 * @returns Merge result
 */
export function mergeElements(
  local: Element,
  remote: Element,
  tombstoneTtl: number = 30 * 24 * 60 * 60 * 1000
): ElementMergeResult {
  // Compute content hashes
  const localHash = computeContentHashSync(local);
  const remoteHash = computeContentHashSync(remote);

  // Same content - no conflict
  if (localHash.hash === remoteHash.hash) {
    return {
      element: local,
      resolution: MergeResolution.IDENTICAL,
      localModified: false,
    };
  }

  // Get tombstone status for both
  const localTombstone = getTombstoneStatus(local, tombstoneTtl);
  const remoteTombstone = getTombstoneStatus(remote, tombstoneTtl);

  // Apply tombstone merge rules
  const tombstoneResolution = resolveTombstoneConflict(localTombstone, remoteTombstone);
  if (tombstoneResolution !== null) {
    const winner = tombstoneResolution === 'local' ? local : remote;
    const resolution =
      tombstoneResolution === 'local' ? MergeResolution.LOCAL_WINS : MergeResolution.REMOTE_WINS;

    return {
      element: winner,
      resolution,
      localModified: tombstoneResolution === 'remote',
      conflict: createConflictRecord(local, remote, localHash.hash, remoteHash.hash, resolution),
    };
  }

  // Both are live elements - apply LWW with special handling
  const merged = mergeLiveElements(local, remote);

  return {
    element: merged.element,
    resolution: merged.resolution,
    localModified: merged.resolution !== MergeResolution.LOCAL_WINS,
    conflict: createConflictRecord(
      local,
      remote,
      localHash.hash,
      remoteHash.hash,
      merged.resolution
    ),
  };
}

/**
 * Merge two live (non-tombstone) elements
 */
function mergeLiveElements(
  local: Element,
  remote: Element
): { element: Element; resolution: MergeResolution } {
  // Apply status merge rules first
  const statusResolution = resolveStatusConflict(local, remote);
  if (statusResolution !== null) {
    return {
      element: statusResolution === 'local' ? local : remote,
      resolution:
        statusResolution === 'local' ? MergeResolution.LOCAL_WINS : MergeResolution.REMOTE_WINS,
    };
  }

  // LWW by updatedAt timestamp
  const localTime = new Date(local.updatedAt).getTime();
  const remoteTime = new Date(remote.updatedAt).getTime();

  if (localTime >= remoteTime) {
    // Local wins - but merge tags
    const mergedTags = mergeTags(local.tags, remote.tags);
    if (arraysEqual(mergedTags, local.tags)) {
      return {
        element: local,
        resolution: MergeResolution.LOCAL_WINS,
      };
    }
    // Tags were merged
    return {
      element: { ...local, tags: mergedTags },
      resolution: MergeResolution.TAGS_MERGED,
    };
  }

  // Remote wins - but merge tags
  const mergedTags = mergeTags(local.tags, remote.tags);
  if (arraysEqual(mergedTags, remote.tags)) {
    return {
      element: remote,
      resolution: MergeResolution.REMOTE_WINS,
    };
  }
  // Tags were merged
  return {
    element: { ...remote, tags: mergedTags },
    resolution: MergeResolution.TAGS_MERGED,
  };
}

// ============================================================================
// Tombstone Handling
// ============================================================================

/**
 * Get tombstone status for an element
 */
export function getTombstoneStatus(element: Element, ttlMs: number): TombstoneStatus {
  // Check for deletedAt field (tombstone marker)
  const record = element as unknown as Record<string, unknown>;
  const deletedAt = record.deletedAt;

  if (!deletedAt || typeof deletedAt !== 'string') {
    return TombstoneStatus.LIVE;
  }

  // Check if within TTL
  const deletedTime = new Date(deletedAt).getTime();
  const now = Date.now();
  const age = now - deletedTime;

  return age <= ttlMs ? TombstoneStatus.FRESH : TombstoneStatus.EXPIRED;
}

/**
 * Resolve conflict between elements with different tombstone statuses
 *
 * @returns 'local', 'remote', or null if both live/need further resolution
 */
function resolveTombstoneConflict(
  local: TombstoneStatus,
  remote: TombstoneStatus
): 'local' | 'remote' | null {
  // Both live - no tombstone conflict
  if (local === TombstoneStatus.LIVE && remote === TombstoneStatus.LIVE) {
    return null;
  }

  // Fresh tombstone wins over live
  if (local === TombstoneStatus.FRESH && remote === TombstoneStatus.LIVE) {
    return 'local';
  }
  if (remote === TombstoneStatus.FRESH && local === TombstoneStatus.LIVE) {
    return 'remote';
  }

  // Expired tombstone loses to live
  if (local === TombstoneStatus.EXPIRED && remote === TombstoneStatus.LIVE) {
    return 'remote';
  }
  if (remote === TombstoneStatus.EXPIRED && local === TombstoneStatus.LIVE) {
    return 'local';
  }

  // Both tombstones - later deletedAt wins (handled by LWW in caller)
  return null;
}

// ============================================================================
// Status Merge
// ============================================================================

/**
 * Resolve status conflict - closed always wins over open states
 *
 * @returns 'local', 'remote', or null if no status-based resolution
 */
function resolveStatusConflict(local: Element, remote: Element): 'local' | 'remote' | null {
  const localStatus = (local as unknown as Record<string, unknown>).status;
  const remoteStatus = (remote as unknown as Record<string, unknown>).status;

  // Only applies to elements with status
  if (typeof localStatus !== 'string' || typeof remoteStatus !== 'string') {
    return null;
  }

  const closedStatuses = ['closed', 'tombstone'];

  const localClosed = closedStatuses.includes(localStatus);
  const remoteClosed = closedStatuses.includes(remoteStatus);

  // Closed wins over open
  if (localClosed && !remoteClosed) {
    return 'local';
  }
  if (remoteClosed && !localClosed) {
    return 'remote';
  }

  // Both same state - no status-based resolution
  return null;
}

// ============================================================================
// Tags Merge
// ============================================================================

/**
 * Merge two tag arrays using set union
 * Never loses a tag in merge
 *
 * @param localTags - Local tags
 * @param remoteTags - Remote tags
 * @returns Merged tags (sorted for determinism)
 */
export function mergeTags(localTags: string[], remoteTags: string[]): string[] {
  const merged = new Set([...localTags, ...remoteTags]);
  return [...merged].sort();
}

// ============================================================================
// Dependencies Merge
// ============================================================================

/**
 * Dependency merge result
 */
export interface DependencyMergeResult {
  /** Dependencies to keep */
  keep: Dependency[];
  /** Dependencies that were added */
  added: Dependency[];
  /** Dependencies that were removed */
  removed: Dependency[];
  /** Conflict records */
  conflicts: DependencyConflictRecord[];
}

/**
 * Dependency key for comparison
 */
function getDependencyKey(dep: Dependency): string {
  return `${dep.blockedId}|${dep.blockerId}|${dep.type}`;
}

/**
 * Merge dependencies between local and remote
 *
 * Rules:
 * - Removal is authoritative (if one side removed, it's removed)
 * - Additions from both sides kept
 * - No duplicate dependencies
 *
 * @param localDeps - Local dependencies
 * @param remoteDeps - Remote dependencies
 * @param originalDeps - Original dependencies (baseline for detecting removals)
 * @returns Merge result
 */
export function mergeDependencies(
  localDeps: Dependency[],
  remoteDeps: Dependency[],
  originalDeps: Dependency[] = []
): DependencyMergeResult {
  const localMap = new Map(localDeps.map((d) => [getDependencyKey(d), d]));
  const remoteMap = new Map(remoteDeps.map((d) => [getDependencyKey(d), d]));
  const originalMap = new Map(originalDeps.map((d) => [getDependencyKey(d), d]));

  const keep: Dependency[] = [];
  const added: Dependency[] = [];
  const removed: Dependency[] = [];
  const conflicts: DependencyConflictRecord[] = [];

  // Track all keys
  const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const key of allKeys) {
    const local = localMap.get(key);
    const remote = remoteMap.get(key);
    const original = originalMap.get(key);

    if (local && remote) {
      // Both have it - keep (prefer remote if different for consistency)
      keep.push(remote);
    } else if (local && !remote) {
      // Only local has it
      if (original) {
        // Was in original, remote removed it - honor removal
        removed.push(local);
        conflicts.push({
          blockedId: local.blockedId,
          blockerId: local.blockerId,
          type: local.type as DependencyType,
          resolution: 'removed',
          resolvedAt: createTimestamp(),
        });
      } else {
        // New in local - keep
        keep.push(local);
        added.push(local);
      }
    } else if (!local && remote) {
      // Only remote has it
      if (original) {
        // Was in original, local removed it - honor removal
        removed.push(remote);
        conflicts.push({
          blockedId: remote.blockedId,
          blockerId: remote.blockerId,
          type: remote.type as DependencyType,
          resolution: 'removed',
          resolvedAt: createTimestamp(),
        });
      } else {
        // New in remote - add
        keep.push(remote);
        added.push(remote);
        conflicts.push({
          blockedId: remote.blockedId,
          blockerId: remote.blockerId,
          type: remote.type as DependencyType,
          resolution: 'added',
          resolvedAt: createTimestamp(),
        });
      }
    }
  }

  return { keep, added, removed, conflicts };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a conflict record
 */
function createConflictRecord(
  local: Element,
  remote: Element,
  localHash: string,
  remoteHash: string,
  resolution: MergeResolution
): ConflictRecord {
  return {
    elementId: local.id,
    localHash,
    remoteHash,
    resolution,
    localUpdatedAt: local.updatedAt,
    remoteUpdatedAt: remote.updatedAt,
    resolvedAt: createTimestamp(),
  };
}

/**
 * Check if two string arrays are equal (order-sensitive)
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
