/**
 * Configuration Access API
 *
 * Main interface for loading, accessing, and modifying configuration.
 * Implements the precedence hierarchy: CLI > Environment > File > Defaults
 */

import type {
  Configuration,
  PartialConfiguration,
  LoadConfigOptions,
  ConfigPath,
  ConfigPathTypes,
  ConfigSource,
  TrackedConfiguration,
  TrackedValue,
} from './types.js';
import { ConfigSource as ConfigSourceEnum } from './types.js';
import { getDefaultConfig, DEFAULT_CONFIG } from './defaults.js';
import { mergeConfiguration, cloneConfiguration } from './merge.js';
import { validateConfiguration, validatePartialConfiguration } from './validation.js';
import {
  discoverConfigFile,
  readConfigFile,
  writeConfigFile,
  updateConfigFile,
} from './file.js';
import { loadEnvConfig, getEnvConfigPath } from './env.js';

// ============================================================================
// Configuration State
// ============================================================================

/** Cached configuration instance */
let cachedConfig: Configuration | null = null;

/** Tracked configuration for source attribution */
let trackedConfig: TrackedConfiguration | null = null;

/** Path to the active config file */
let activeConfigPath: string | undefined;

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Loads configuration with full precedence chain
 *
 * Precedence (highest to lowest):
 * 1. CLI overrides (if provided)
 * 2. Environment variables
 * 3. Config file
 * 4. Built-in defaults
 *
 * @param options - Loading options
 * @returns Complete configuration
 */
export function loadConfig(options: LoadConfigOptions = {}): Configuration {
  // Start with defaults
  let config = getDefaultConfig();
  let tracked = createTrackedDefaults();

  // Discover config file (check env override first, skip if requested)
  const envConfigPath = options.skipEnv ? undefined : getEnvConfigPath();
  const discovery = options.skipFile
    ? { exists: false, path: undefined }
    : discoverConfigFile(options.configPath ?? envConfigPath);
  activeConfigPath = discovery.path;

  // Load from file if exists (and not skipped)
  if (!options.skipFile && discovery.exists && discovery.path) {
    try {
      const fileConfig = readConfigFile(discovery.path);
      config = mergeConfiguration(config, fileConfig);
      tracked = mergeTrackedConfig(tracked, fileConfig, ConfigSourceEnum.FILE);
    } catch {
      // Config file exists but failed to load - use defaults
      // Error will be surfaced when user explicitly accesses config
    }
  }

  // Apply environment variables
  if (!options.skipEnv) {
    const envConfig = loadEnvConfig();
    config = mergeConfiguration(config, envConfig);
    tracked = mergeTrackedConfig(tracked, envConfig, ConfigSourceEnum.ENVIRONMENT);
  }

  // Apply CLI overrides
  if (options.cliOverrides) {
    validatePartialConfiguration(options.cliOverrides);
    config = mergeConfiguration(config, options.cliOverrides);
    tracked = mergeTrackedConfig(tracked, options.cliOverrides, ConfigSourceEnum.CLI);
  }

  // Validate final configuration
  validateConfiguration(config);

  // Cache and return
  cachedConfig = config;
  trackedConfig = tracked;

  return config;
}

/**
 * Gets the current configuration, loading if necessary
 */
export function getConfig(): Configuration {
  if (cachedConfig === null) {
    loadConfig();
  }
  return cloneConfiguration(cachedConfig!);
}

/**
 * Gets the tracked configuration with source attribution
 */
export function getTrackedConfig(): TrackedConfiguration {
  if (trackedConfig === null) {
    loadConfig();
  }
  return trackedConfig!;
}

/**
 * Reloads configuration from all sources
 */
export function reloadConfig(options: LoadConfigOptions = {}): Configuration {
  cachedConfig = null;
  trackedConfig = null;
  return loadConfig(options);
}

/**
 * Clears the configuration cache
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  trackedConfig = null;
  activeConfigPath = undefined;
}

// ============================================================================
// Value Access
// ============================================================================

/**
 * Gets a configuration value by path
 *
 * @param path - Dot-notation path to the value
 * @returns The configuration value
 *
 * @example
 * getValue('actor') // 'my-agent'
 * getValue('sync.autoExport') // true
 * getValue('identity.mode') // 'soft'
 */
export function getValue<P extends ConfigPath>(path: P): ConfigPathTypes[P] {
  const config = getConfig();
  return getValueFromConfig(config, path);
}

/**
 * Gets a configuration value from a config object by path
 */
export function getValueFromConfig<P extends ConfigPath>(
  config: Configuration,
  path: P
): ConfigPathTypes[P] {
  const parts = path.split('.');

  if (parts.length === 1) {
    return config[path as keyof Configuration] as ConfigPathTypes[P];
  }

  const [section, key] = parts;
  const sectionObj = config[section as keyof Configuration];
  return (sectionObj as unknown as Record<string, unknown>)[key] as ConfigPathTypes[P];
}

/**
 * Gets the source of a configuration value
 */
export function getValueSource(path: ConfigPath): ConfigSource {
  const tracked = getTrackedConfig();
  const parts = path.split('.');

  if (parts.length === 1) {
    const value = tracked[path as keyof TrackedConfiguration] as TrackedValue<unknown> | undefined;
    return value?.source ?? ConfigSourceEnum.DEFAULT;
  }

  const [section, key] = parts;
  const sectionObj = tracked[section as keyof TrackedConfiguration] as Record<string, TrackedValue<unknown>>;
  return sectionObj[key]?.source ?? ConfigSourceEnum.DEFAULT;
}

/**
 * Gets a value with its source
 */
export function getValueWithSource<P extends ConfigPath>(
  path: P
): TrackedValue<ConfigPathTypes[P]> {
  const value = getValue(path);
  const source = getValueSource(path);
  return { value, source };
}

// ============================================================================
// Value Setting (Config File)
// ============================================================================

/**
 * Sets a configuration value in the config file
 *
 * @param path - Dot-notation path to the value
 * @param value - New value to set
 */
export function setValue<P extends ConfigPath>(path: P, value: ConfigPathTypes[P]): void {
  if (!activeConfigPath) {
    const discovery = discoverConfigFile();
    activeConfigPath = discovery.path;
  }

  const partial = pathToPartialConfig(path, value);
  validatePartialConfiguration(partial);
  updateConfigFile(activeConfigPath!, partial);

  // Invalidate cache
  cachedConfig = null;
  trackedConfig = null;
}

/**
 * Unsets a configuration value in the config file
 * Note: This removes the value from the file, falling back to defaults
 */
export function unsetValue(path: ConfigPath): void {
  if (!activeConfigPath) {
    const discovery = discoverConfigFile();
    activeConfigPath = discovery.path;
  }

  // Read current file config
  const current = readConfigFile(activeConfigPath!);

  // Remove the specified path
  const updated = removeFromPartialConfig(current, path);

  // Write back
  writeConfigFile(activeConfigPath!, updated);

  // Invalidate cache
  cachedConfig = null;
  trackedConfig = null;
}

// ============================================================================
// Configuration File Management
// ============================================================================

/**
 * Gets the active configuration file path
 */
export function getConfigPath(): string | undefined {
  if (!activeConfigPath) {
    const discovery = discoverConfigFile();
    activeConfigPath = discovery.path;
  }
  return activeConfigPath;
}

/**
 * Checks if the configuration file exists
 */
export function configFileExists(): boolean {
  const discovery = discoverConfigFile();
  return discovery.exists;
}

/**
 * Saves the entire configuration to file
 */
export function saveConfig(config: Configuration, filePath?: string): void {
  const path = filePath ?? getConfigPath();
  if (!path) {
    throw new Error('No config file path specified');
  }
  validateConfiguration(config);
  writeConfigFile(path, config);

  // Update cache
  if (!filePath || filePath === activeConfigPath) {
    cachedConfig = config;
    trackedConfig = null; // Will be rebuilt on next access
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates tracked defaults
 */
function createTrackedDefaults(): TrackedConfiguration {
  return {
    actor: undefined,
    baseBranch: undefined,
    database: { value: DEFAULT_CONFIG.database, source: ConfigSourceEnum.DEFAULT },
    sync: {
      autoExport: { value: DEFAULT_CONFIG.sync.autoExport, source: ConfigSourceEnum.DEFAULT },
      exportDebounce: { value: DEFAULT_CONFIG.sync.exportDebounce, source: ConfigSourceEnum.DEFAULT },
      elementsFile: { value: DEFAULT_CONFIG.sync.elementsFile, source: ConfigSourceEnum.DEFAULT },
      dependenciesFile: { value: DEFAULT_CONFIG.sync.dependenciesFile, source: ConfigSourceEnum.DEFAULT },
    },
    playbooks: {
      paths: { value: [...DEFAULT_CONFIG.playbooks.paths], source: ConfigSourceEnum.DEFAULT },
    },
    tombstone: {
      ttl: { value: DEFAULT_CONFIG.tombstone.ttl, source: ConfigSourceEnum.DEFAULT },
      minTtl: { value: DEFAULT_CONFIG.tombstone.minTtl, source: ConfigSourceEnum.DEFAULT },
    },
    identity: {
      mode: { value: DEFAULT_CONFIG.identity.mode, source: ConfigSourceEnum.DEFAULT },
      timeTolerance: { value: DEFAULT_CONFIG.identity.timeTolerance, source: ConfigSourceEnum.DEFAULT },
    },
    plugins: {
      packages: { value: [...DEFAULT_CONFIG.plugins.packages], source: ConfigSourceEnum.DEFAULT },
    },
    externalSync: {
      enabled: { value: DEFAULT_CONFIG.externalSync.enabled, source: ConfigSourceEnum.DEFAULT },
      pollInterval: { value: DEFAULT_CONFIG.externalSync.pollInterval, source: ConfigSourceEnum.DEFAULT },
      conflictStrategy: { value: DEFAULT_CONFIG.externalSync.conflictStrategy, source: ConfigSourceEnum.DEFAULT },
      defaultDirection: { value: DEFAULT_CONFIG.externalSync.defaultDirection, source: ConfigSourceEnum.DEFAULT },
    },
  };
}

/**
 * Merges tracked config with new values from a source
 */
function mergeTrackedConfig(
  base: TrackedConfiguration,
  partial: PartialConfiguration,
  source: ConfigSource
): TrackedConfiguration {
  const result = { ...base };

  if (partial.actor !== undefined) {
    result.actor = { value: partial.actor, source };
  }
  if (partial.baseBranch !== undefined) {
    result.baseBranch = { value: partial.baseBranch, source };
  }
  if (partial.database !== undefined) {
    result.database = { value: partial.database, source };
  }
  if (partial.sync?.autoExport !== undefined) {
    result.sync = { ...result.sync, autoExport: { value: partial.sync.autoExport, source } };
  }
  if (partial.sync?.exportDebounce !== undefined) {
    result.sync = { ...result.sync, exportDebounce: { value: partial.sync.exportDebounce, source } };
  }
  if (partial.sync?.elementsFile !== undefined) {
    result.sync = { ...result.sync, elementsFile: { value: partial.sync.elementsFile, source } };
  }
  if (partial.sync?.dependenciesFile !== undefined) {
    result.sync = { ...result.sync, dependenciesFile: { value: partial.sync.dependenciesFile, source } };
  }
  if (partial.playbooks?.paths !== undefined) {
    result.playbooks = { paths: { value: partial.playbooks.paths, source } };
  }
  if (partial.tombstone?.ttl !== undefined) {
    result.tombstone = { ...result.tombstone, ttl: { value: partial.tombstone.ttl, source } };
  }
  if (partial.tombstone?.minTtl !== undefined) {
    result.tombstone = { ...result.tombstone, minTtl: { value: partial.tombstone.minTtl, source } };
  }
  if (partial.identity?.mode !== undefined) {
    result.identity = { ...result.identity, mode: { value: partial.identity.mode, source } };
  }
  if (partial.identity?.timeTolerance !== undefined) {
    result.identity = { ...result.identity, timeTolerance: { value: partial.identity.timeTolerance, source } };
  }
  if (partial.plugins?.packages !== undefined) {
    result.plugins = { packages: { value: partial.plugins.packages, source } };
  }
  if (partial.externalSync?.enabled !== undefined) {
    result.externalSync = { ...result.externalSync, enabled: { value: partial.externalSync.enabled, source } };
  }
  if (partial.externalSync?.pollInterval !== undefined) {
    result.externalSync = { ...result.externalSync, pollInterval: { value: partial.externalSync.pollInterval, source } };
  }
  if (partial.externalSync?.conflictStrategy !== undefined) {
    result.externalSync = { ...result.externalSync, conflictStrategy: { value: partial.externalSync.conflictStrategy, source } };
  }
  if (partial.externalSync?.defaultDirection !== undefined) {
    result.externalSync = { ...result.externalSync, defaultDirection: { value: partial.externalSync.defaultDirection, source } };
  }

  return result;
}

/**
 * Converts a config path and value to a partial config object
 */
function pathToPartialConfig<P extends ConfigPath>(
  path: P,
  value: ConfigPathTypes[P]
): PartialConfiguration {
  const parts = path.split('.');

  if (parts.length === 1) {
    return { [path]: value } as PartialConfiguration;
  }

  const [section, key] = parts;
  return {
    [section]: { [key]: value },
  } as PartialConfiguration;
}

/**
 * Removes a path from a partial config
 */
function removeFromPartialConfig(
  config: PartialConfiguration,
  path: ConfigPath
): PartialConfiguration {
  const result = { ...config };
  const parts = path.split('.');

  if (parts.length === 1) {
    delete result[path as keyof PartialConfiguration];
  } else {
    const [section, key] = parts;
    const sectionKey = section as keyof PartialConfiguration;
    if (result[sectionKey]) {
      const sectionObj = { ...(result[sectionKey] as Record<string, unknown>) };
      delete sectionObj[key];
      (result[sectionKey] as Record<string, unknown>) = sectionObj;
    }
  }

  return result;
}

// ============================================================================
// Utility Exports
// ============================================================================

export {
  type Configuration,
  type PartialConfiguration,
  type ConfigPath,
  type ConfigSource,
  type TrackedConfiguration,
  type LoadConfigOptions,
} from './types.js';
