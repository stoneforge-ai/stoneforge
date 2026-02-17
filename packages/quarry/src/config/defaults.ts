/**
 * Configuration Defaults
 *
 * Built-in default values for all configuration options.
 * These are the lowest precedence values, overridden by file, env, and CLI.
 */

import { IdentityMode } from '../systems/identity.js';
import type { Configuration, SyncConfig, PlaybookConfig, TombstoneConfig, IdentityConfigSection, PluginsConfig } from './types.js';

// ============================================================================
// Time Constants (in milliseconds)
// ============================================================================

/** One second in milliseconds */
export const ONE_SECOND = 1000;

/** One minute in milliseconds */
export const ONE_MINUTE = 60 * ONE_SECOND;

/** One hour in milliseconds */
export const ONE_HOUR = 60 * ONE_MINUTE;

/** One day in milliseconds */
export const ONE_DAY = 24 * ONE_HOUR;

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default sync configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  autoExport: true,
  exportDebounce: 5 * ONE_MINUTE, // 5 minutes
  elementsFile: 'elements.jsonl',
  dependenciesFile: 'dependencies.jsonl',
};

/**
 * Default playbook configuration
 */
export const DEFAULT_PLAYBOOK_CONFIG: PlaybookConfig = {
  paths: [
    '.stoneforge/playbooks',
    '~/.stoneforge/playbooks',
  ],
};

/**
 * Default tombstone configuration
 */
export const DEFAULT_TOMBSTONE_CONFIG: TombstoneConfig = {
  ttl: 30 * ONE_DAY, // 30 days
  minTtl: 7 * ONE_DAY, // 7 days
};

/**
 * Default identity configuration
 */
export const DEFAULT_IDENTITY_CONFIG: IdentityConfigSection = {
  mode: IdentityMode.SOFT,
  timeTolerance: 5 * ONE_MINUTE, // 5 minutes
};

/**
 * Default plugins configuration
 */
export const DEFAULT_PLUGINS_CONFIG: PluginsConfig = {
  packages: [],
};

/**
 * Complete default configuration
 */
export const DEFAULT_CONFIG: Configuration = {
  actor: undefined,
  database: 'stoneforge.db',
  sync: DEFAULT_SYNC_CONFIG,
  playbooks: DEFAULT_PLAYBOOK_CONFIG,
  tombstone: DEFAULT_TOMBSTONE_CONFIG,
  identity: DEFAULT_IDENTITY_CONFIG,
  plugins: DEFAULT_PLUGINS_CONFIG,
};

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Minimum allowed export debounce (100ms)
 */
export const MIN_EXPORT_DEBOUNCE = 100;

/**
 * Maximum allowed export debounce (1 hour)
 */
export const MAX_EXPORT_DEBOUNCE = ONE_HOUR;

/**
 * Maximum allowed time tolerance (24 hours)
 */
export const MAX_TIME_TOLERANCE = 24 * ONE_HOUR;

/**
 * Minimum allowed time tolerance (1 second)
 */
export const MIN_TIME_TOLERANCE = ONE_SECOND;

/**
 * Maximum TTL (1 year)
 */
export const MAX_TTL = 365 * ONE_DAY;

// ============================================================================
// Deep Clone
// ============================================================================

/**
 * Creates a deep clone of the default configuration
 * Always use this instead of referencing DEFAULT_CONFIG directly
 * to avoid accidental mutation
 */
export function getDefaultConfig(): Configuration {
  return {
    actor: undefined,
    database: DEFAULT_CONFIG.database,
    sync: { ...DEFAULT_SYNC_CONFIG },
    playbooks: { paths: [...DEFAULT_PLAYBOOK_CONFIG.paths] },
    tombstone: { ...DEFAULT_TOMBSTONE_CONFIG },
    identity: { ...DEFAULT_IDENTITY_CONFIG },
    plugins: { packages: [...DEFAULT_PLUGINS_CONFIG.packages] },
  };
}
