/**
 * Sync System Types
 *
 * Type definitions for the JSONL-based synchronization system.
 * Enables bidirectional sync between SQLite and git-friendly JSONL format.
 */

import type { Element, ElementId, Timestamp, DependencyType } from '@stoneforge/core';

// ============================================================================
// JSONL Line Types
// ============================================================================

/**
 * Serialized element for JSONL export
 * All element fields inline with ISO 8601 timestamps
 */
export interface SerializedElement {
  /** Element ID */
  id: string;
  /** Element type discriminator */
  type: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 update timestamp */
  updatedAt: string;
  /** Creator entity ID */
  createdBy: string;
  /** Tags array */
  tags: string[];
  /** Metadata object */
  metadata: Record<string, unknown>;
  /** Content hash for conflict detection */
  contentHash?: string;
  /** Document category (for document elements) */
  category?: string;
  /** Document status (for document elements) */
  status?: string;
  /** Document content type (for document elements) */
  contentType?: string;
  /** Document content (for document elements) */
  content?: string;
  /** Document version (for document elements) */
  version?: number;
  /** Type-specific fields */
  [key: string]: unknown;
}

/**
 * Serialized dependency for JSONL export
 */
export interface SerializedDependency {
  /** Blocked element ID */
  blockedId: string;
  /** Blocker element ID */
  blockerId: string;
  /** Dependency type */
  type: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Creator entity ID */
  createdBy: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Content Hashing
// ============================================================================

/**
 * Fields excluded from content hash computation
 * These fields are identity/attribution rather than content
 */
export const HASH_EXCLUDED_FIELDS = [
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'contentHash',
] as const;

/**
 * Content hash result
 */
export interface ContentHashResult {
  /** SHA256 hash of content fields, hex encoded */
  hash: string;
  /** Fields included in hash computation */
  fields: string[];
}

// ============================================================================
// Merge Strategy Types
// ============================================================================

/**
 * Merge resolution result
 */
export const MergeResolution = {
  /** Local version kept */
  LOCAL_WINS: 'local_wins',
  /** Remote version applied */
  REMOTE_WINS: 'remote_wins',
  /** Content was identical */
  IDENTICAL: 'identical',
  /** Tags merged from both */
  TAGS_MERGED: 'tags_merged',
} as const;

export type MergeResolution = (typeof MergeResolution)[keyof typeof MergeResolution];

/**
 * Conflict record for import results
 */
export interface ConflictRecord {
  /** Conflicting element ID */
  elementId: ElementId;
  /** Local content hash */
  localHash: string;
  /** Remote content hash */
  remoteHash: string;
  /** How conflict was resolved */
  resolution: MergeResolution;
  /** Local updatedAt */
  localUpdatedAt: Timestamp;
  /** Remote updatedAt */
  remoteUpdatedAt: Timestamp;
  /** When resolved */
  resolvedAt: Timestamp;
}

/**
 * Dependency conflict record
 */
export interface DependencyConflictRecord {
  /** Blocked element ID */
  blockedId: ElementId;
  /** Blocker element ID */
  blockerId: ElementId;
  /** Dependency type */
  type: DependencyType;
  /** How conflict was resolved */
  resolution: 'added' | 'removed' | 'kept';
  /** When resolved */
  resolvedAt: Timestamp;
}

// ============================================================================
// Import/Export Results
// ============================================================================

/**
 * Export result
 */
export interface ExportResult {
  /** Number of elements exported */
  elementsExported: number;
  /** Number of dependencies exported */
  dependenciesExported: number;
  /** Whether this was an incremental export */
  incremental: boolean;
  /** Path to elements file */
  elementsFile: string;
  /** Path to dependencies file */
  dependenciesFile: string;
  /** Export timestamp */
  exportedAt: Timestamp;
}

/**
 * Import result with conflict tracking
 */
export interface ImportResult {
  /** Number of elements imported */
  elementsImported: number;
  /** Number of elements skipped (identical) */
  elementsSkipped: number;
  /** Number of dependencies imported */
  dependenciesImported: number;
  /** Number of dependencies skipped */
  dependenciesSkipped: number;
  /** Element conflicts resolved */
  conflicts: ConflictRecord[];
  /** Dependency conflicts resolved */
  dependencyConflicts: DependencyConflictRecord[];
  /** Errors encountered (non-fatal) */
  errors: ImportError[];
  /** Import timestamp */
  importedAt: Timestamp;
}

/**
 * Import error record
 */
export interface ImportError {
  /** Line number in file (1-indexed) */
  line: number;
  /** File type */
  file: 'elements' | 'dependencies';
  /** Error message */
  message: string;
  /** Raw line content (truncated) */
  content?: string;
}

// ============================================================================
// Dirty Tracking
// ============================================================================

/**
 * Dirty element record
 */
export interface DirtyElement {
  /** Element ID that was modified */
  elementId: ElementId;
  /** When it was marked dirty */
  markedAt: Timestamp;
  /** Type of modification */
  operation: 'create' | 'update' | 'delete';
}

/**
 * Dirty dependency record
 */
export interface DirtyDependency {
  /** Blocked element ID */
  blockedId: ElementId;
  /** Blocker element ID */
  blockerId: ElementId;
  /** Dependency type */
  type: DependencyType;
  /** When it was marked dirty */
  markedAt: Timestamp;
  /** Type of modification */
  operation: 'create' | 'delete';
}

// ============================================================================
// Sync Status
// ============================================================================

/**
 * Current sync status
 */
export interface SyncStatus {
  /** Number of dirty elements */
  dirtyElementCount: number;
  /** Number of dirty dependencies */
  dirtyDependencyCount: number;
  /** Last export timestamp */
  lastExportAt?: Timestamp;
  /** Last import timestamp */
  lastImportAt?: Timestamp;
  /** Whether there are pending changes */
  hasPendingChanges: boolean;
}

// ============================================================================
// Export Options
// ============================================================================

/**
 * Options for export operations
 */
export interface ExportOptions {
  /** Output directory path */
  outputDir: string;
  /** Perform full export (ignore dirty tracking) */
  full?: boolean;
  /** Include ephemeral elements */
  includeEphemeral?: boolean;
  /** Elements file name override */
  elementsFile?: string;
  /** Dependencies file name override */
  dependenciesFile?: string;
}

/**
 * Options for import operations
 */
export interface ImportOptions {
  /** Input directory path */
  inputDir: string;
  /** Dry run - show what would change */
  dryRun?: boolean;
  /** Force overwrite conflicts (remote always wins) */
  force?: boolean;
  /** Elements file name override */
  elementsFile?: string;
  /** Dependencies file name override */
  dependenciesFile?: string;
}

// ============================================================================
// Tombstone Handling
// ============================================================================

/**
 * Tombstone status for merge decisions
 */
export const TombstoneStatus = {
  /** Not a tombstone (live element) */
  LIVE: 'live',
  /** Tombstone within TTL */
  FRESH: 'fresh',
  /** Tombstone past TTL */
  EXPIRED: 'expired',
} as const;

export type TombstoneStatus = (typeof TombstoneStatus)[keyof typeof TombstoneStatus];

/**
 * Element with tombstone status for merge
 */
export interface ElementWithTombstoneStatus {
  /** The element data */
  element: Element;
  /** Tombstone status */
  tombstoneStatus: TombstoneStatus;
  /** Deleted timestamp if tombstone */
  deletedAt?: Timestamp;
}

// ============================================================================
// Sort Order for Export
// ============================================================================

/**
 * Element type priority for export ordering
 * Lower number = exported first (entities first for references)
 */
export const ELEMENT_TYPE_PRIORITY: Record<string, number> = {
  entity: 0,
  document: 1,
  task: 2,
  message: 3,
  channel: 4,
  plan: 5,
  workflow: 6,
  playbook: 7,
  library: 8,
  team: 9,
};

/**
 * Get sort priority for an element type
 */
export function getTypePriority(type: string): number {
  return ELEMENT_TYPE_PRIORITY[type] ?? 100;
}
