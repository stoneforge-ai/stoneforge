/**
 * @stoneforge/storage
 *
 * SQLite storage layer for Stoneforge with multi-runtime support.
 * This package provides the unified storage interface and runtime-specific
 * backends for Bun, Node.js, and Browser environments.
 */

// Type definitions
export type {
  Row,
  QueryResult,
  MutationResult,
  StatementResult,
  PreparedStatement,
  IsolationLevel,
  TransactionOptions,
  Transaction,
  SqlitePragmas,
  StorageConfig,
  DirtyElement,
  DirtyTrackingOptions,
  Migration,
  MigrationResult,
} from './types.js';

export { DEFAULT_PRAGMAS } from './types.js';

// Backend interface
export type {
  StorageBackend,
  StorageStats,
  StorageFactory,
  AsyncStorageFactory,
} from './backend.js';

// Error mapping
export {
  SqliteResultCode,
  isBusyError,
  isConstraintError,
  isUniqueViolation,
  isForeignKeyViolation,
  isCorruptionError,
  mapStorageError,
  queryError,
  mutationError,
  connectionError,
  migrationError,
} from './errors.js';

// Unified storage factory (auto-detects runtime)
export {
  createStorage,
  createStorageAsync,
  isBunRuntime,
  isNodeRuntime,
  isBrowserRuntime,
  getRuntimeName,
} from './create-backend.js';

// NOTE: Runtime-specific backends are NOT exported from this index
// to avoid eagerly loading runtime-specific dependencies.
// For explicit backend access, import directly from the specific backend files:
//   import { BunStorageBackend, createBunStorage } from '@stoneforge/storage/bun';
//   import { NodeStorageBackend, createNodeStorage } from '@stoneforge/storage/node';
//   import { BrowserStorageBackend, createBrowserStorage } from '@stoneforge/storage/browser';

// Schema management
export {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  EXPECTED_TABLES,
  initializeSchema,
  getSchemaVersion,
  isSchemaUpToDate,
  getPendingMigrations,
  resetSchema,
  validateSchema,
  getTableColumns,
  getTableIndexes,
} from './schema.js';
