/**
 * Sync System - JSONL-based synchronization
 *
 * Provides bidirectional sync between SQLite and git-friendly JSONL format.
 */

// Types
export * from './types.js';

// Serialization
export {
  serializeElement,
  serializeDependency,
  parseElement,
  parseDependency,
  tryParseElement,
  tryParseDependency,
  serializeElements,
  serializeDependencies,
  parseElements,
  parseDependencies,
  sortElementsForExport,
  sortDependenciesForExport,
  isSerializedElement,
  isSerializedDependency,
  type ParseError,
} from './serialization.js';

// Content Hashing
export {
  computeContentHash,
  computeContentHashSync,
  hasSameContentHash,
  matchesContentHash,
} from './hash.js';

// Merge Strategy
export {
  mergeElements,
  mergeTags,
  mergeDependencies,
  getTombstoneStatus,
  type ElementMergeResult,
  type DependencyMergeResult,
} from './merge.js';

// Sync Service
export { SyncService, createSyncService } from './service.js';

// Auto Export Service
export { AutoExportService, createAutoExportService, type AutoExportOptions } from './auto-export.js';
