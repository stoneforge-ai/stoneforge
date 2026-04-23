/**
 * @stoneforge/quarry
 *
 * Core SDK for Stoneforge - API, services, sync, and CLI.
 * This package provides the main programmatic interface to Stoneforge,
 * building on @stoneforge/core for types and @stoneforge/storage for persistence.
 *
 * Note: Types from @stoneforge/core and @stoneforge/storage are NOT re-exported here
 * to avoid naming conflicts. Import them directly:
 *   import { Task, Entity, ... } from '@stoneforge/core';
 *   import { createStorage, ... } from '@stoneforge/storage';
 */

// Re-export storage utilities for convenience
export {
  // Types
  type Row,
  type QueryResult,
  type MutationResult,
  type StatementResult,
  type PreparedStatement,
  type IsolationLevel,
  type TransactionOptions,
  type Transaction,
  type SqlitePragmas,
  type StorageConfig,
  type DirtyElement,
  type DirtyTrackingOptions,
  type Migration,
  type MigrationResult,
  type StorageBackend,
  type StorageStats,
  type StorageFactory,
  type AsyncStorageFactory,
  DEFAULT_PRAGMAS,
  // Error utilities
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
  // Storage factory (handles runtime detection automatically)
  createStorage,
  createStorageAsync,
  isBunRuntime,
  isNodeRuntime,
  isBrowserRuntime,
  getRuntimeName,
  // Schema management
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
} from '@stoneforge/storage';

// API - Main programmatic interface
export * from './api/index.js';

// Services - Business logic services
export { InboxService, createInboxService } from './services/inbox.js';
export * from './services/dependency.js';
export * from './services/priority-service.js';
export * from './services/id-length-cache.js';
export * from './services/blocked-cache.js';

// HTTP handlers for browser sync
export * from './http/index.js';

// Sync module (excluding types that conflict with api/types.ts)
// Use SyncExportOptions, SyncImportOptions, SyncImportResult for sync-specific types
export {
  // Types - renamed to avoid conflicts with API types
  type ExportOptions as SyncExportOptions,
  type ImportOptions as SyncImportOptions,
  type ImportResult as SyncImportResult,
  // Other types
  type SerializedElement,
  type SerializedDependency,
  type ContentHashResult,
  MergeResolution,
  type ConflictRecord,
  type DependencyConflictRecord,
  type ExportResult,
  type ImportError,
  type DirtyElement as SyncDirtyElement,
  type DirtyDependency,
  type SyncStatus,
  type TombstoneStatus,
  type ElementWithTombstoneStatus,
  ELEMENT_TYPE_PRIORITY,
  getTypePriority,
  HASH_EXCLUDED_FIELDS,
  // Serialization
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
  // Hashing
  computeContentHash,
  computeContentHashSync,
  hasSameContentHash,
  matchesContentHash,
  // Merge
  mergeElements,
  mergeTags,
  mergeDependencies,
  getTombstoneStatus,
  type ElementMergeResult,
  type DependencyMergeResult,
  // Service
  SyncService,
  createSyncService,
  // Auto Export
  AutoExportService,
  createAutoExportService,
  type AutoExportOptions,
} from './sync/index.js';

// Config - Configuration management
export * from './config/index.js';

// Systems - Identity and other cross-cutting concerns
// Note: DEFAULT_IDENTITY_CONFIG from systems is aliased to avoid conflict with config
export {
  // Types
  IdentityMode,
  type Signature,
  type PublicKey,
  type SignedRequestFields,
  type SigningInput,
  type SignedData,
  VerificationStatus,
  type VerificationResult,
  type IdentityConfig,
  type EntityLookup,
  type VerifySignatureOptions,
  // Constants
  DEFAULT_TIME_TOLERANCE,
  DEFAULT_IDENTITY_CONFIG as DEFAULT_IDENTITY_SYSTEM_CONFIG,
  // Validation
  isValidIdentityMode,
  validateIdentityMode,
  isValidPublicKey,
  validatePublicKey,
  isValidSignature,
  validateSignature,
  isValidRequestHash,
  validateRequestHash,
  isValidTimeTolerance,
  validateTimeTolerance,
  // Type guards
  isSignedRequestFields,
  validateSignedRequestFields,
  isVerificationResult,
  isIdentityConfig,
  validateIdentityConfig,
  // Signed data
  constructSignedData,
  parseSignedData,
  // Time tolerance
  checkTimeTolerance,
  validateTimeTolerance2,
  // Verification factories
  verificationSuccess,
  verificationFailure,
  verificationNotSigned,
  // Ed25519 operations
  verifyEd25519Signature,
  signEd25519,
  generateEd25519Keypair,
  // Verification pipeline
  verifySignature,
  shouldAllowRequest,
  // Utilities
  hashRequestBody,
  createSignedRequest,
  createIdentityConfig,
} from './systems/index.js';

// External Sync - Provider registry and sync providers
export * from './external-sync/index.js';

// CLI Constants - Default operator entity for CLI and web apps
export { OPERATOR_ENTITY_ID, OPERATOR_ENTITY_NAME } from './cli/commands/init.js';
