/**
 * Configuration System
 *
 * Manages settings for Stoneforge, supporting file-based configuration,
 * environment variables, and CLI overrides with a clear precedence hierarchy.
 *
 * @example
 * ```typescript
 * import {
 *   loadConfig,
 *   getConfig,
 *   getValue,
 *   setValue,
 *   getDefaultConfig,
 * } from './config/index.js';
 *
 * // Load and access configuration
 * const config = loadConfig();
 * const actor = getValue('actor');
 * const mode = getValue('identity.mode');
 *
 * // Modify configuration
 * setValue('actor', 'my-agent');
 * ```
 */

// Types
export type {
  Duration,
  DurationString,
  SyncConfig,
  PlaybookConfig,
  TombstoneConfig,
  IdentityConfigSection,
  PluginsConfig,
  Configuration,
  PartialConfiguration,
  ConfigSource,
  TrackedValue,
  TrackedConfiguration,
  YamlConfigFile,
  ConfigFileDiscovery,
  ConfigValidationResult,
  ConfigPath,
  ConfigPathTypes,
  LoadConfigOptions,
  EnvVar,
} from './types.js';

export { EnvVars, ConfigSource as ConfigSourceEnum, VALID_CONFIG_PATHS, isValidConfigPath } from './types.js';

// Defaults
export {
  DEFAULT_CONFIG,
  DEFAULT_SYNC_CONFIG,
  DEFAULT_PLAYBOOK_CONFIG,
  DEFAULT_TOMBSTONE_CONFIG,
  DEFAULT_IDENTITY_CONFIG,
  DEFAULT_PLUGINS_CONFIG,
  getDefaultConfig,
  ONE_SECOND,
  ONE_MINUTE,
  ONE_HOUR,
  ONE_DAY,
  MIN_EXPORT_DEBOUNCE,
  MAX_EXPORT_DEBOUNCE,
  MIN_TIME_TOLERANCE,
  MAX_TIME_TOLERANCE,
  MAX_TTL,
} from './defaults.js';

// Duration utilities
export {
  DURATION_UNITS,
  isDurationString,
  parseDuration,
  parseDurationValue,
  tryParseDuration,
  formatDuration,
  formatDurationHuman,
  validateDurationRange,
} from './duration.js';

// Validation
export {
  isValidActor,
  validateActor,
  isValidBaseBranch,
  validateBaseBranch,
  isValidDatabase,
  validateDatabase,
  isValidJsonlFilename,
  validateJsonlFilename,
  isValidPlaybookPaths,
  validatePlaybookPaths,
  validateConfiguration,
  validateConfigurationSafe,
  validatePartialConfiguration,
} from './validation.js';

// Merge utilities
export {
  deepMerge,
  mergeConfiguration,
  mergeConfigurations,
  createConfiguration,
  cloneConfiguration,
  diffConfigurations,
  configurationsEqual,
} from './merge.js';

// File operations
export {
  CONFIG_FILE_NAME,
  STONEFORGE_DIR,
  findStoneforgeDir,
  getGlobalConfigDir,
  getGlobalConfigPath,
  discoverConfigFile,
  parseYamlConfig,
  convertYamlToConfig,
  readConfigFile,
  convertConfigToYaml,
  serializeConfigToYaml,
  writeConfigFile,
  updateConfigFile,
  expandPath,
  expandPlaybookPaths,
} from './file.js';

// Environment variables
export {
  parseEnvBoolean,
  isEnvBoolean,
  parseEnvDuration,
  getEnvVar,
  hasEnvVar,
  loadEnvConfig,
  getEnvConfigPath,
  getEnvJsonMode,
  getEnvVerboseMode,
  getEnvVarInfo,
  getSetEnvVars,
} from './env.js';

// Main configuration API
export {
  loadConfig,
  getConfig,
  getTrackedConfig,
  reloadConfig,
  clearConfigCache,
  getValue,
  getValueFromConfig,
  getValueSource,
  getValueWithSource,
  setValue,
  unsetValue,
  getConfigPath,
  configFileExists,
  saveConfig,
} from './config.js';
