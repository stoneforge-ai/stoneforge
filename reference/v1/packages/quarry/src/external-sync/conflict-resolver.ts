/**
 * Conflict Detection and Resolution Module
 *
 * Detects conflicts during external sync (both local and remote changed since
 * last sync) and resolves them using configurable strategies:
 *
 * - last_write_wins: Compare updatedAt timestamps, most recent wins
 * - local_wins: Stoneforge version always wins
 * - remote_wins: External version always wins
 * - manual: Tag element with sync-conflict for human resolution
 *
 * Supports field-level merge: when different fields changed on each side,
 * both changes are applied automatically. Only same-field changes are conflicts.
 *
 * @module conflict-resolver
 */

import { createHash } from 'crypto';
import type {
  Element,
  Timestamp,
  ConflictStrategy,
  ExternalSyncState,
  ExternalSyncConflict,
  ExternalTask,
  FieldMapping,
  TaskFieldMapConfig,
} from '@stoneforge/core';
import { computeContentHashSync } from '../sync/hash.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Information about a detected conflict between local and remote versions.
 * Includes details about which fields changed on each side.
 */
export interface ConflictInfo {
  /** Local element ID */
  readonly elementId: string;
  /** External item ID */
  readonly externalId: string;
  /** Provider name */
  readonly provider: string;
  /** Project/repository */
  readonly project: string;
  /** Local element's updatedAt timestamp */
  readonly localUpdatedAt: Timestamp;
  /** Remote item's updatedAt timestamp */
  readonly remoteUpdatedAt: string;
  /** Fields that changed locally (by localField name) */
  readonly localChangedFields: readonly string[];
  /** Fields that changed remotely (by externalField name) */
  readonly remoteChangedFields: readonly string[];
  /** Fields that changed on BOTH sides (true conflict) */
  readonly conflictingFields: readonly string[];
  /** Whether field-level merge can resolve some changes automatically */
  readonly canFieldMerge: boolean;
}

/**
 * Result of resolving a conflict. Contains the changes to apply
 * to the local element and/or the external item.
 */
export interface ResolvedChanges {
  /** The conflict that was resolved */
  readonly conflict: ConflictInfo;
  /** Strategy used for resolution */
  readonly strategy: ConflictStrategy;
  /** Whether the conflict was fully resolved (false if manual) */
  readonly resolved: boolean;
  /** Which side won, if resolved automatically */
  readonly winner?: 'local' | 'remote' | 'merged';
  /** Field values to apply to the local element (from remote or merged) */
  readonly localUpdates?: Record<string, unknown>;
  /** Field values to push to the external system (from local or merged) */
  readonly remoteUpdates?: Record<string, unknown>;
  /** For manual resolution: both versions stored for human review */
  readonly manualConflict?: {
    readonly local: Record<string, unknown>;
    readonly remote: Record<string, unknown>;
  };
}

/**
 * Options for conflict detection, allowing callers to provide
 * field-level change context.
 */
export interface DetectConflictOptions {
  /** Field map config for field-level analysis (optional) */
  readonly fieldMapConfig?: TaskFieldMapConfig;
  /** Snapshot of local element at last push (for field-level diff) */
  readonly localBaseline?: Record<string, unknown>;
  /** Snapshot of remote item at last pull (for field-level diff) */
  readonly remoteBaseline?: Record<string, unknown>;
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect whether a conflict exists between a local element and a remote item.
 *
 * A conflict exists when BOTH of these are true:
 * - Local changed: current element content hash differs from lastPushedHash
 * - Remote changed: current external item hash differs from lastPulledHash
 *
 * If a fieldMapConfig is provided along with baselines, performs field-level
 * analysis to determine which specific fields conflict.
 *
 * @param localElement - The current local element
 * @param remoteItem - The current external item
 * @param syncState - The element's external sync state (from metadata._externalSync)
 * @param options - Optional field-level detection options
 * @returns ConflictInfo if both sides changed, or null if no conflict
 */
export function detectConflict(
  localElement: Element,
  remoteItem: ExternalTask,
  syncState: ExternalSyncState,
  options?: DetectConflictOptions
): ConflictInfo | null {
  // Check if local changed: current hash differs from lastPushedHash
  const localChanged = hasLocalChanged(localElement, syncState);

  // Check if remote changed: compute a hash of the remote item's relevant fields
  // and compare against lastPulledHash
  const remoteChanged = hasRemoteChanged(remoteItem, syncState);

  // No conflict if only one side (or neither) changed
  if (!localChanged || !remoteChanged) {
    return null;
  }

  // Both sides changed — we have a conflict
  // Perform field-level analysis if possible
  const fieldAnalysis = analyzeFieldChanges(localElement, remoteItem, options);

  return {
    elementId: localElement.id,
    externalId: remoteItem.externalId,
    provider: syncState.provider,
    project: syncState.project,
    localUpdatedAt: localElement.updatedAt,
    remoteUpdatedAt: remoteItem.updatedAt,
    localChangedFields: fieldAnalysis.localChangedFields,
    remoteChangedFields: fieldAnalysis.remoteChangedFields,
    conflictingFields: fieldAnalysis.conflictingFields,
    canFieldMerge: fieldAnalysis.canFieldMerge,
  };
}

/**
 * Check whether the local element has changed since last push.
 * Compares current content hash against the stored lastPushedHash.
 */
function hasLocalChanged(localElement: Element, syncState: ExternalSyncState): boolean {
  if (!syncState.lastPushedHash) {
    // Never pushed — consider it changed
    return true;
  }

  const currentHash = computeContentHashSync(localElement);
  return currentHash.hash !== syncState.lastPushedHash;
}

/**
 * Check whether the remote item has changed since last pull.
 * Computes a content hash of the remote item's normalized fields
 * and compares against the stored lastPulledHash.
 */
function hasRemoteChanged(remoteItem: ExternalTask, syncState: ExternalSyncState): boolean {
  if (!syncState.lastPulledHash) {
    // Never pulled — consider it changed
    return true;
  }

  const currentHash = computeExternalItemHash(remoteItem);
  return currentHash !== syncState.lastPulledHash;
}

/**
 * Compute a deterministic hash for an external item's content fields.
 * Used for change detection on the remote side.
 *
 * Normalizes the item to a consistent shape for hashing:
 * sorted keys, JSON stringified, SHA256.
 */
export function computeExternalItemHash(item: ExternalTask): string {
  // Extract the content-relevant fields (exclude volatile fields like raw)
  const hashableFields: Record<string, unknown> = {
    title: item.title,
    body: item.body ?? '',
    state: item.state,
    labels: [...item.labels].sort(),
    assignees: [...item.assignees].sort(),
  };

  // Sort keys for determinism and hash
  const sortedKeys = Object.keys(hashableFields).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sorted[key] = hashableFields[key];
  }

  const input = `external:${JSON.stringify(sorted)}`;
  return hashString(input);
}

// ============================================================================
// Field-Level Analysis
// ============================================================================

interface FieldAnalysisResult {
  localChangedFields: string[];
  remoteChangedFields: string[];
  conflictingFields: string[];
  canFieldMerge: boolean;
}

/**
 * Analyze which fields changed on each side.
 *
 * When baselines and field map config are provided, performs precise
 * field-level diffing. Otherwise, falls back to reporting the entire
 * change as a single conflict.
 */
function analyzeFieldChanges(
  localElement: Element,
  remoteItem: ExternalTask,
  options?: DetectConflictOptions
): FieldAnalysisResult {
  const fieldMapConfig = options?.fieldMapConfig;
  const localBaseline = options?.localBaseline;
  const remoteBaseline = options?.remoteBaseline;

  // Without field map config or baselines, we can't do field-level analysis
  if (!fieldMapConfig || !localBaseline || !remoteBaseline) {
    return {
      localChangedFields: ['*'],
      remoteChangedFields: ['*'],
      conflictingFields: ['*'],
      canFieldMerge: false,
    };
  }

  const localChangedFields: string[] = [];
  const remoteChangedFields: string[] = [];

  // Check each mapped field for changes
  for (const mapping of fieldMapConfig.fields) {
    const localField = mapping.localField;
    const externalField = mapping.externalField;

    // Check if local changed for this field
    const localCurrent = getFieldValue(localElement, localField);
    const localBaselineValue = localBaseline[localField];
    if (!deepEqual(localCurrent, localBaselineValue)) {
      localChangedFields.push(localField);
    }

    // Check if remote changed for this field
    const remoteCurrent = getExternalFieldValue(remoteItem, externalField);
    const remoteBaselineValue = remoteBaseline[externalField];
    if (!deepEqual(remoteCurrent, remoteBaselineValue)) {
      remoteChangedFields.push(externalField);
    }
  }

  // Find conflicting fields — fields that changed on BOTH sides
  // We need to map between local and external field names
  const conflictingFields = findConflictingFields(
    localChangedFields,
    remoteChangedFields,
    fieldMapConfig.fields
  );

  return {
    localChangedFields,
    remoteChangedFields,
    conflictingFields,
    // Can field-merge if at least some fields don't conflict
    canFieldMerge:
      conflictingFields.length < localChangedFields.length ||
      conflictingFields.length < remoteChangedFields.length,
  };
}

/**
 * Find fields that changed on BOTH sides by cross-referencing the
 * field mapping to identify overlapping changes.
 */
function findConflictingFields(
  localChangedFields: string[],
  remoteChangedFields: string[],
  mappings: readonly FieldMapping[]
): string[] {
  const conflicting: string[] = [];

  for (const mapping of mappings) {
    const localChanged = localChangedFields.includes(mapping.localField);
    const remoteChanged = remoteChangedFields.includes(mapping.externalField);

    if (localChanged && remoteChanged) {
      // Same mapped field changed on both sides — conflict
      conflicting.push(mapping.localField);
    }
  }

  return conflicting;
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolve a conflict using the specified strategy.
 *
 * Strategies:
 * - last_write_wins: Compare updatedAt timestamps, most recent wins
 * - local_wins: Stoneforge version always takes precedence
 * - remote_wins: External version always takes precedence
 * - manual: Mark for human resolution
 *
 * When field-level merge is possible (different fields changed on each side),
 * non-conflicting fields are merged automatically regardless of strategy.
 * The strategy only applies to fields that actually conflict (same field
 * changed on both sides).
 *
 * @param conflict - The detected conflict info
 * @param strategy - The resolution strategy to apply
 * @param localElement - Current local element
 * @param remoteItem - Current remote item
 * @param options - Optional field map config for field-level merge
 * @returns ResolvedChanges describing what to apply
 */
export function resolveConflict(
  conflict: ConflictInfo,
  strategy: ConflictStrategy,
  localElement?: Element,
  remoteItem?: ExternalTask,
  options?: { fieldMapConfig?: TaskFieldMapConfig }
): ResolvedChanges {
  // If we can do field-level merge and have the elements, try it
  if (
    conflict.canFieldMerge &&
    localElement &&
    remoteItem &&
    options?.fieldMapConfig
  ) {
    return resolveWithFieldMerge(conflict, strategy, localElement, remoteItem, options.fieldMapConfig);
  }

  // Full-element resolution (no field-level merge)
  switch (strategy) {
    case 'last_write_wins':
      return resolveLastWriteWins(conflict, localElement, remoteItem);

    case 'local_wins':
      return resolveLocalWins(conflict);

    case 'remote_wins':
      return resolveRemoteWins(conflict, remoteItem);

    case 'manual':
      return resolveManual(conflict, localElement, remoteItem);

    default:
      // Exhaustive check
      return resolveManual(conflict, localElement, remoteItem);
  }
}

/**
 * Resolve a conflict using last-write-wins strategy.
 * Compares updatedAt timestamps; the most recent wins.
 */
function resolveLastWriteWins(
  conflict: ConflictInfo,
  localElement?: Element,
  remoteItem?: ExternalTask
): ResolvedChanges {
  const localTime = new Date(conflict.localUpdatedAt).getTime();
  const remoteTime = new Date(conflict.remoteUpdatedAt).getTime();

  if (localTime >= remoteTime) {
    // Local is newer or same time — local wins
    return {
      conflict,
      strategy: 'last_write_wins',
      resolved: true,
      winner: 'local',
      // No local updates needed; remote should be updated from local
      remoteUpdates: localElement ? extractPushableFields(localElement) : undefined,
    };
  } else {
    // Remote is newer — remote wins
    return {
      conflict,
      strategy: 'last_write_wins',
      resolved: true,
      winner: 'remote',
      localUpdates: remoteItem ? extractPullableFields(remoteItem) : undefined,
    };
  }
}

/**
 * Resolve a conflict with local-wins strategy.
 * Stoneforge version always takes precedence.
 */
function resolveLocalWins(conflict: ConflictInfo): ResolvedChanges {
  return {
    conflict,
    strategy: 'local_wins',
    resolved: true,
    winner: 'local',
    // Remote needs to be updated with local values; caller handles the push
  };
}

/**
 * Resolve a conflict with remote-wins strategy.
 * External version always takes precedence.
 */
function resolveRemoteWins(
  conflict: ConflictInfo,
  remoteItem?: ExternalTask
): ResolvedChanges {
  return {
    conflict,
    strategy: 'remote_wins',
    resolved: true,
    winner: 'remote',
    localUpdates: remoteItem ? extractPullableFields(remoteItem) : undefined,
  };
}

/**
 * Mark a conflict for manual resolution.
 * Stores both versions so a human can choose.
 */
function resolveManual(
  conflict: ConflictInfo,
  localElement?: Element,
  remoteItem?: ExternalTask
): ResolvedChanges {
  return {
    conflict,
    strategy: 'manual',
    resolved: false,
    manualConflict: {
      local: localElement ? extractPushableFields(localElement) : {},
      remote: remoteItem ? extractPullableFields(remoteItem) : {},
    },
  };
}

/**
 * Resolve with field-level merge.
 *
 * Non-conflicting fields are merged automatically:
 * - Fields only changed locally → keep local, push to remote
 * - Fields only changed remotely → pull remote, apply locally
 *
 * For conflicting fields (same field changed on both sides),
 * the strategy determines the winner.
 */
function resolveWithFieldMerge(
  conflict: ConflictInfo,
  strategy: ConflictStrategy,
  localElement: Element,
  remoteItem: ExternalTask,
  fieldMapConfig: TaskFieldMapConfig
): ResolvedChanges {
  const localUpdates: Record<string, unknown> = {};
  const remoteUpdates: Record<string, unknown> = {};

  // Build lookup sets for quick membership checks
  const localChangedSet = new Set(conflict.localChangedFields);
  const remoteChangedSet = new Set(conflict.remoteChangedFields);
  const conflictingSet = new Set(conflict.conflictingFields);

  for (const mapping of fieldMapConfig.fields) {
    const localField = mapping.localField;
    const externalField = mapping.externalField;

    const localChanged = localChangedSet.has(localField);
    const remoteChanged = remoteChangedSet.has(externalField);

    if (localChanged && !remoteChanged) {
      // Only local changed — push local value to remote
      const localValue = getFieldValue(localElement, localField);
      remoteUpdates[externalField] = localValue;
    } else if (remoteChanged && !localChanged) {
      // Only remote changed — pull remote value to local
      const remoteValue = getExternalFieldValue(remoteItem, externalField);
      localUpdates[localField] = remoteValue;
    } else if (conflictingSet.has(localField)) {
      // Both changed this field — apply strategy
      resolveFieldConflict(
        strategy,
        conflict,
        mapping,
        localElement,
        remoteItem,
        localUpdates,
        remoteUpdates
      );
    }
    // If neither changed, no action needed
  }

  // If strategy is manual and there are conflicting fields, mark as unresolved
  if (strategy === 'manual' && conflict.conflictingFields.length > 0) {
    const localConflictValues: Record<string, unknown> = {};
    const remoteConflictValues: Record<string, unknown> = {};

    for (const field of conflict.conflictingFields) {
      localConflictValues[field] = getFieldValue(localElement, field);
      // Find corresponding external field
      const mapping = fieldMapConfig.fields.find((m) => m.localField === field);
      if (mapping) {
        remoteConflictValues[mapping.externalField] = getExternalFieldValue(
          remoteItem,
          mapping.externalField
        );
      }
    }

    return {
      conflict,
      strategy,
      resolved: false,
      winner: 'merged',
      localUpdates: Object.keys(localUpdates).length > 0 ? localUpdates : undefined,
      remoteUpdates: Object.keys(remoteUpdates).length > 0 ? remoteUpdates : undefined,
      manualConflict: {
        local: localConflictValues,
        remote: remoteConflictValues,
      },
    };
  }

  return {
    conflict,
    strategy,
    resolved: true,
    winner: 'merged',
    localUpdates: Object.keys(localUpdates).length > 0 ? localUpdates : undefined,
    remoteUpdates: Object.keys(remoteUpdates).length > 0 ? remoteUpdates : undefined,
  };
}

/**
 * Resolve a single field conflict using the given strategy.
 */
function resolveFieldConflict(
  strategy: ConflictStrategy,
  conflict: ConflictInfo,
  mapping: FieldMapping,
  localElement: Element,
  remoteItem: ExternalTask,
  localUpdates: Record<string, unknown>,
  remoteUpdates: Record<string, unknown>
): void {
  const localValue = getFieldValue(localElement, mapping.localField);
  const remoteValue = getExternalFieldValue(remoteItem, mapping.externalField);

  switch (strategy) {
    case 'last_write_wins': {
      const localTime = new Date(conflict.localUpdatedAt).getTime();
      const remoteTime = new Date(conflict.remoteUpdatedAt).getTime();
      if (localTime >= remoteTime) {
        remoteUpdates[mapping.externalField] = localValue;
      } else {
        localUpdates[mapping.localField] = remoteValue;
      }
      break;
    }
    case 'local_wins':
      remoteUpdates[mapping.externalField] = localValue;
      break;
    case 'remote_wins':
      localUpdates[mapping.localField] = remoteValue;
      break;
    case 'manual':
      // Don't auto-resolve — handled by the caller
      break;
  }
}

// ============================================================================
// Manual Conflict Resolution
// ============================================================================

/** Tag applied to elements with unresolved sync conflicts */
export const SYNC_CONFLICT_TAG = 'sync-conflict';

/**
 * Apply manual conflict resolution metadata to an element.
 * Tags the element with 'sync-conflict' and stores both versions
 * in metadata._externalSync.conflict.
 *
 * @param element - The element to mark as conflicted
 * @param conflict - The conflict info
 * @param localValues - Local field values at time of conflict
 * @param remoteValues - Remote field values at time of conflict
 * @returns Updated metadata and tags to apply to the element
 */
export function applyManualConflict(
  element: Element,
  conflict: ConflictInfo,
  localValues: Record<string, unknown>,
  remoteValues: Record<string, unknown>
): { metadata: Record<string, unknown>; tags: string[] } {
  // Add sync-conflict tag if not already present
  const tags = element.tags.includes(SYNC_CONFLICT_TAG)
    ? [...element.tags]
    : [...element.tags, SYNC_CONFLICT_TAG];

  // Store both versions in metadata._externalSync.conflict
  const existingSyncState = element.metadata._externalSync as Record<string, unknown> | undefined;
  const metadata = {
    ...element.metadata,
    _externalSync: {
      ...existingSyncState,
      conflict: {
        local: localValues,
        remote: remoteValues,
        detectedAt: new Date().toISOString(),
        elementId: conflict.elementId,
        externalId: conflict.externalId,
        provider: conflict.provider,
        project: conflict.project,
      },
    },
  };

  return { metadata, tags };
}

/**
 * Resolve a manual conflict by choosing a side.
 * Clears the sync-conflict tag and conflict metadata.
 *
 * Returns the updates to apply to the element. The caller is
 * responsible for applying these and pushing/pulling as needed.
 *
 * @param element - The element with the conflict
 * @param keep - Which side to keep: 'local' or 'remote'
 * @returns Updated metadata, tags, and field values from the chosen side
 */
export function resolveManualConflict(
  element: Element,
  keep: 'local' | 'remote'
): {
  metadata: Record<string, unknown>;
  tags: string[];
  fieldValues: Record<string, unknown>;
} {
  // Extract the stored conflict data
  const syncState = element.metadata._externalSync as Record<string, unknown> | undefined;
  const conflictData = syncState?.conflict as
    | { local: Record<string, unknown>; remote: Record<string, unknown> }
    | undefined;

  // Get field values from the chosen side
  const fieldValues = conflictData
    ? keep === 'local'
      ? { ...conflictData.local }
      : { ...conflictData.remote }
    : {};

  // Remove sync-conflict tag
  const tags = element.tags.filter((t) => t !== SYNC_CONFLICT_TAG);

  // Remove conflict metadata, keep the rest of _externalSync
  const cleanedSyncState = { ...syncState };
  delete cleanedSyncState.conflict;

  const metadata = {
    ...element.metadata,
    _externalSync: cleanedSyncState,
  };

  return { metadata, tags, fieldValues };
}

// ============================================================================
// Conversion to ExternalSyncConflict
// ============================================================================

/**
 * Convert a ConflictInfo and ResolvedChanges into an ExternalSyncConflict
 * suitable for inclusion in sync result reports.
 *
 * @param conflict - The detected conflict info
 * @param resolved - The resolution result
 * @returns ExternalSyncConflict for reporting
 */
export function toExternalSyncConflict(
  conflict: ConflictInfo,
  resolved: ResolvedChanges
): ExternalSyncConflict {
  return {
    elementId: conflict.elementId,
    externalId: conflict.externalId,
    provider: conflict.provider,
    project: conflict.project,
    localUpdatedAt: conflict.localUpdatedAt,
    remoteUpdatedAt: conflict.remoteUpdatedAt,
    strategy: resolved.strategy,
    resolved: resolved.resolved,
    winner: resolved.winner === 'merged' ? 'local' : resolved.winner,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract pushable fields from a local element (fields relevant to external sync).
 */
function extractPushableFields(element: Element): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // Extract common sync-relevant fields
  if ('title' in element) fields.title = (element as Record<string, unknown>).title;
  if ('status' in element) fields.status = (element as Record<string, unknown>).status;
  if ('tags' in element) fields.tags = element.tags;
  if ('priority' in element) fields.priority = (element as Record<string, unknown>).priority;
  if ('taskType' in element) fields.taskType = (element as Record<string, unknown>).taskType;
  if ('assignee' in element) fields.assignee = (element as Record<string, unknown>).assignee;

  return fields;
}

/**
 * Extract pullable fields from a remote item (fields relevant to local update).
 */
function extractPullableFields(item: ExternalTask): Record<string, unknown> {
  return {
    title: item.title,
    body: item.body,
    state: item.state,
    labels: [...item.labels],
    assignees: [...item.assignees],
  };
}

/**
 * Get a field value from a local element by field name.
 */
function getFieldValue(element: Element, field: string): unknown {
  return (element as unknown as Record<string, unknown>)[field];
}

/**
 * Get a field value from an external item by field name.
 */
function getExternalFieldValue(item: ExternalTask, field: string): unknown {
  return (item as unknown as Record<string, unknown>)[field];
}

/**
 * Deep equality comparison for field values.
 * Handles primitives, arrays, and plain objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, i) => key === bKeys[i] && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Compute a simple hash of a string using SHA-256 (synchronous via crypto).
 * Uses the same approach as computeContentHashSync in the sync module.
 */
function hashString(input: string): string {
  const hash = createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
}
