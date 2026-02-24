/**
 * External Sync — public exports
 *
 * Central module for external service synchronization (GitHub, Linear, etc.).
 * Re-exports the provider registry, sync engine, provider implementations,
 * and future conflict resolver modules.
 */

// Provider registry
export {
  ProviderRegistry,
  createProviderRegistry,
  createDefaultProviderRegistry,
} from './provider-registry.js';
export type { ProviderAdapterEntry } from './provider-registry.js';

// Conflict resolver
export {
  detectConflict,
  resolveConflict,
  resolveManualConflict,
  applyManualConflict,
  toExternalSyncConflict,
  computeExternalItemHash,
  SYNC_CONFLICT_TAG,
} from './conflict-resolver.js';
export type {
  ConflictInfo,
  ResolvedChanges,
  DetectConflictOptions,
} from './conflict-resolver.js';

// Sync engine
export { SyncEngine, createSyncEngine } from './sync-engine.js';
export type {
  SyncOptions,
  SyncEngineAPI,
  SyncEngineSettings,
  SyncConflictResolver,
  ConflictResolution,
  SyncEngineConfig,
} from './sync-engine.js';

// GitHub provider
export { createGitHubPlaceholderProvider } from './providers/github/index.js';
