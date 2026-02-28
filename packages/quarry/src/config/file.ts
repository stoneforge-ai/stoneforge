/**
 * Configuration File Loading
 *
 * Handles YAML configuration file parsing, discovery, and writing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'yaml';
import { ValidationError, ErrorCode } from '@stoneforge/core';
import { isValidIdentityMode, type IdentityMode } from '../systems/identity.js';
import type {
  Configuration,
  PartialConfiguration,
  YamlConfigFile,
  ConfigFileDiscovery,
  ExternalSyncConflictStrategy,
  SyncDirection,
} from './types.js';
import {
  VALID_CONFLICT_STRATEGIES,
  VALID_SYNC_DIRECTIONS,
  VALID_AUTO_LINK_PROVIDERS,
} from './types.js';
import { parseDurationValue } from './duration.js';

// ============================================================================
// Constants
// ============================================================================

/** Default config file name */
export const CONFIG_FILE_NAME = 'config.yaml';

/** Default .stoneforge directory name */
export const STONEFORGE_DIR = '.stoneforge';

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Finds the nearest .stoneforge directory by walking up from the given directory.
 *
 * This function first checks the STONEFORGE_ROOT environment variable, which
 * is used to support agents working in git worktrees. When an agent is spawned
 * in a worktree, STONEFORGE_ROOT points to the main workspace root where the
 * SQLite database lives.
 *
 * @param startDir - Directory to start searching from
 * @returns Path to .stoneforge directory, or undefined if not found
 */
export function findStoneforgeDir(startDir: string): string | undefined {
  // Check STONEFORGE_ROOT env var first - used for worktree root-finding
  // When agents work in git worktrees, they need to access the main
  // workspace's .stoneforge directory where the SQLite database lives
  const envRoot = process.env.STONEFORGE_ROOT;
  if (envRoot) {
    const stoneforgePath = path.join(envRoot, STONEFORGE_DIR);
    if (fs.existsSync(stoneforgePath) && fs.statSync(stoneforgePath).isDirectory()) {
      return stoneforgePath;
    }
  }

  // Fall back to walk-up search
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const stoneforgePath = path.join(currentDir, STONEFORGE_DIR);
    if (fs.existsSync(stoneforgePath) && fs.statSync(stoneforgePath).isDirectory()) {
      return stoneforgePath;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check root
  const rootStoneforgePath = path.join(root, STONEFORGE_DIR);
  if (fs.existsSync(rootStoneforgePath) && fs.statSync(rootStoneforgePath).isDirectory()) {
    return rootStoneforgePath;
  }

  return undefined;
}

/**
 * Gets the global config directory path
 */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), STONEFORGE_DIR);
}

/**
 * Gets the global config file path
 */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), CONFIG_FILE_NAME);
}

/**
 * Discovers the configuration file location
 *
 * @param overridePath - Optional override path to use
 * @param startDir - Directory to start searching from (default: cwd)
 * @returns Discovery result with path and existence info
 */
export function discoverConfigFile(
  overridePath?: string,
  startDir: string = process.cwd()
): ConfigFileDiscovery {
  // If override path is provided, use it directly
  if (overridePath) {
    const resolvedPath = path.resolve(overridePath);
    const exists = fs.existsSync(resolvedPath);
    return {
      path: resolvedPath,
      exists,
      stoneforgeDir: exists ? path.dirname(resolvedPath) : undefined,
    };
  }

  // Try to find .stoneforge directory
  const stoneforgeDir = findStoneforgeDir(startDir);
  if (stoneforgeDir) {
    const configPath = path.join(stoneforgeDir, CONFIG_FILE_NAME);
    return {
      path: configPath,
      exists: fs.existsSync(configPath),
      stoneforgeDir,
    };
  }

  // Fall back to global config
  const globalPath = getGlobalConfigPath();
  return {
    path: globalPath,
    exists: fs.existsSync(globalPath),
    stoneforgeDir: fs.existsSync(getGlobalConfigDir()) ? getGlobalConfigDir() : undefined,
  };
}

// ============================================================================
// YAML Parsing
// ============================================================================

/**
 * Parses YAML content into a config file structure
 *
 * @param content - YAML string content
 * @param filePath - Path to file (for error messages)
 * @returns Parsed YAML config object
 */
export function parseYamlConfig(content: string, filePath?: string): YamlConfigFile {
  try {
    const parsed = yaml.parse(content);
    if (parsed === null || parsed === undefined) {
      return {};
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError(
        `Configuration file must contain an object${filePath ? ` (${filePath})` : ''}`,
        ErrorCode.INVALID_INPUT,
        { value: parsed }
      );
    }
    return parsed as YamlConfigFile;
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(
      `Failed to parse YAML configuration${filePath ? ` (${filePath})` : ''}: ${err instanceof Error ? err.message : String(err)}`,
      ErrorCode.INVALID_INPUT,
      { filePath }
    );
  }
}

/**
 * Converts YAML config (snake_case) to internal format (camelCase)
 *
 * @param yamlConfig - Parsed YAML config
 * @returns Partial configuration in internal format
 */
export function convertYamlToConfig(yamlConfig: YamlConfigFile): PartialConfiguration {
  const result: PartialConfiguration = {};

  // Direct fields
  if (yamlConfig.actor !== undefined) {
    result.actor = yamlConfig.actor;
  }
  if (yamlConfig.base_branch !== undefined) {
    result.baseBranch = yamlConfig.base_branch;
  }
  if (yamlConfig.database !== undefined) {
    result.database = yamlConfig.database;
  }

  // Sync section
  if (yamlConfig.sync) {
    result.sync = {};
    if (yamlConfig.sync.auto_export !== undefined) {
      result.sync.autoExport = yamlConfig.sync.auto_export;
    }
    if (yamlConfig.sync.export_debounce !== undefined) {
      result.sync.exportDebounce = parseDurationValue(yamlConfig.sync.export_debounce);
    }
    if (yamlConfig.sync.elements_file !== undefined) {
      result.sync.elementsFile = yamlConfig.sync.elements_file;
    }
    if (yamlConfig.sync.dependencies_file !== undefined) {
      result.sync.dependenciesFile = yamlConfig.sync.dependencies_file;
    }
  }

  // Playbooks section
  if (yamlConfig.playbooks?.paths) {
    result.playbooks = {
      paths: yamlConfig.playbooks.paths,
    };
  }

  // Tombstone section
  if (yamlConfig.tombstone) {
    result.tombstone = {};
    if (yamlConfig.tombstone.ttl !== undefined) {
      result.tombstone.ttl = parseDurationValue(yamlConfig.tombstone.ttl);
    }
    if (yamlConfig.tombstone.min_ttl !== undefined) {
      result.tombstone.minTtl = parseDurationValue(yamlConfig.tombstone.min_ttl);
    }
  }

  // Identity section
  if (yamlConfig.identity) {
    result.identity = {};
    if (yamlConfig.identity.mode !== undefined) {
      if (!isValidIdentityMode(yamlConfig.identity.mode)) {
        throw new ValidationError(
          `Invalid identity mode: '${yamlConfig.identity.mode}'. Must be one of: soft, cryptographic, hybrid`,
          ErrorCode.INVALID_INPUT,
          { field: 'identity.mode', value: yamlConfig.identity.mode }
        );
      }
      result.identity.mode = yamlConfig.identity.mode as IdentityMode;
    }
    if (yamlConfig.identity.time_tolerance !== undefined) {
      result.identity.timeTolerance = parseDurationValue(yamlConfig.identity.time_tolerance);
    }
  }

  // Plugins section
  if (yamlConfig.plugins?.packages) {
    result.plugins = {
      packages: yamlConfig.plugins.packages,
    };
  }

  // External sync section
  if (yamlConfig.external_sync) {
    result.externalSync = {};
    if (yamlConfig.external_sync.enabled !== undefined) {
      result.externalSync.enabled = yamlConfig.external_sync.enabled;
    }
    if (yamlConfig.external_sync.poll_interval !== undefined) {
      result.externalSync.pollInterval = parseDurationValue(yamlConfig.external_sync.poll_interval);
    }
    if (yamlConfig.external_sync.conflict_strategy !== undefined) {
      const strategy = yamlConfig.external_sync.conflict_strategy;
      if (!VALID_CONFLICT_STRATEGIES.includes(strategy as ExternalSyncConflictStrategy)) {
        throw new ValidationError(
          `Invalid conflict strategy: '${strategy}'. Must be one of: ${VALID_CONFLICT_STRATEGIES.join(', ')}`,
          ErrorCode.INVALID_INPUT,
          { field: 'externalSync.conflictStrategy', value: strategy }
        );
      }
      result.externalSync.conflictStrategy = strategy as ExternalSyncConflictStrategy;
    }
    if (yamlConfig.external_sync.default_direction !== undefined) {
      const direction = yamlConfig.external_sync.default_direction;
      if (!VALID_SYNC_DIRECTIONS.includes(direction as SyncDirection)) {
        throw new ValidationError(
          `Invalid sync direction: '${direction}'. Must be one of: ${VALID_SYNC_DIRECTIONS.join(', ')}`,
          ErrorCode.INVALID_INPUT,
          { field: 'externalSync.defaultDirection', value: direction }
        );
      }
      result.externalSync.defaultDirection = direction as SyncDirection;
    }
    if (yamlConfig.external_sync.auto_link !== undefined) {
      result.externalSync.autoLink = yamlConfig.external_sync.auto_link;
    }
    if (yamlConfig.external_sync.auto_link_provider !== undefined) {
      const provider = yamlConfig.external_sync.auto_link_provider;
      if (!VALID_AUTO_LINK_PROVIDERS.includes(provider)) {
        throw new ValidationError(
          `Invalid auto-link provider: '${provider}'. Must be one of: ${VALID_AUTO_LINK_PROVIDERS.join(', ')}`,
          ErrorCode.INVALID_INPUT,
          { field: 'externalSync.autoLinkProvider', value: provider }
        );
      }
      result.externalSync.autoLinkProvider = provider;
    }
    if (yamlConfig.external_sync.auto_link_document_provider !== undefined) {
      const provider = yamlConfig.external_sync.auto_link_document_provider;
      if (!VALID_AUTO_LINK_PROVIDERS.includes(provider)) {
        throw new ValidationError(
          `Invalid auto-link document provider: '${provider}'. Must be one of: ${VALID_AUTO_LINK_PROVIDERS.join(', ')}`,
          ErrorCode.INVALID_INPUT,
          { field: 'externalSync.autoLinkDocumentProvider', value: provider }
        );
      }
      result.externalSync.autoLinkDocumentProvider = provider;
    }
  }

  return result;
}

/**
 * Reads and parses a configuration file
 *
 * @param filePath - Path to the configuration file
 * @returns Partial configuration from the file
 */
export function readConfigFile(filePath: string): PartialConfiguration {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const yamlConfig = parseYamlConfig(content, filePath);
    return convertYamlToConfig(yamlConfig);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(
      `Failed to read configuration file '${filePath}': ${err instanceof Error ? err.message : String(err)}`,
      ErrorCode.INVALID_INPUT,
      { filePath }
    );
  }
}

// ============================================================================
// YAML Writing
// ============================================================================

/**
 * Converts internal config (camelCase) to YAML format (snake_case)
 *
 * @param config - Configuration in internal format
 * @returns YAML config object
 */
export function convertConfigToYaml(config: Configuration | PartialConfiguration): YamlConfigFile {
  const result: YamlConfigFile = {};

  // Direct fields
  if (config.actor !== undefined) {
    result.actor = config.actor;
  }
  if (config.baseBranch !== undefined) {
    result.base_branch = config.baseBranch;
  }
  if (config.database !== undefined) {
    result.database = config.database;
  }

  // Sync section
  if (config.sync) {
    result.sync = {};
    if (config.sync.autoExport !== undefined) {
      result.sync.auto_export = config.sync.autoExport;
    }
    if (config.sync.exportDebounce !== undefined) {
      result.sync.export_debounce = config.sync.exportDebounce;
    }
    if (config.sync.elementsFile !== undefined) {
      result.sync.elements_file = config.sync.elementsFile;
    }
    if (config.sync.dependenciesFile !== undefined) {
      result.sync.dependencies_file = config.sync.dependenciesFile;
    }
  }

  // Playbooks section
  if (config.playbooks?.paths) {
    result.playbooks = {
      paths: config.playbooks.paths,
    };
  }

  // Tombstone section
  if (config.tombstone) {
    result.tombstone = {};
    if (config.tombstone.ttl !== undefined) {
      result.tombstone.ttl = config.tombstone.ttl;
    }
    if (config.tombstone.minTtl !== undefined) {
      result.tombstone.min_ttl = config.tombstone.minTtl;
    }
  }

  // Identity section
  if (config.identity) {
    result.identity = {};
    if (config.identity.mode !== undefined) {
      result.identity.mode = config.identity.mode;
    }
    if (config.identity.timeTolerance !== undefined) {
      result.identity.time_tolerance = config.identity.timeTolerance;
    }
  }

  // Plugins section
  if (config.plugins?.packages && config.plugins.packages.length > 0) {
    result.plugins = {
      packages: config.plugins.packages,
    };
  }

  // External sync section
  if (config.externalSync) {
    const es: NonNullable<YamlConfigFile['external_sync']> = {};
    if (config.externalSync.enabled !== undefined) {
      es.enabled = config.externalSync.enabled;
    }
    if (config.externalSync.pollInterval !== undefined) {
      es.poll_interval = config.externalSync.pollInterval;
    }
    if (config.externalSync.conflictStrategy !== undefined) {
      es.conflict_strategy = config.externalSync.conflictStrategy;
    }
    if (config.externalSync.defaultDirection !== undefined) {
      es.default_direction = config.externalSync.defaultDirection;
    }
    if (config.externalSync.autoLink !== undefined) {
      es.auto_link = config.externalSync.autoLink;
    }
    if (config.externalSync.autoLinkProvider !== undefined) {
      es.auto_link_provider = config.externalSync.autoLinkProvider;
    }
    if (config.externalSync.autoLinkDocumentProvider !== undefined) {
      es.auto_link_document_provider = config.externalSync.autoLinkDocumentProvider;
    }
    if (Object.keys(es).length > 0) {
      result.external_sync = es;
    }
  }

  return result;
}

/**
 * Serializes configuration to YAML string
 *
 * @param config - Configuration to serialize
 * @returns YAML string
 */
export function serializeConfigToYaml(config: Configuration | PartialConfiguration): string {
  const yamlConfig = convertConfigToYaml(config);
  return yaml.stringify(yamlConfig, {
    indent: 2,
    lineWidth: 120,
  });
}

/**
 * Writes configuration to a file
 *
 * @param filePath - Path to write to
 * @param config - Configuration to write
 */
export function writeConfigFile(
  filePath: string,
  config: Configuration | PartialConfiguration
): void {
  const dir = path.dirname(filePath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = `# Stoneforge Configuration\n\n${serializeConfigToYaml(config)}`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Updates a configuration file by merging with existing content
 *
 * @param filePath - Path to the configuration file
 * @param updates - Partial configuration to merge
 */
export function updateConfigFile(
  filePath: string,
  updates: PartialConfiguration
): void {
  // Read existing config
  const existing = readConfigFile(filePath);

  // Merge updates with the help of deep merge
  const merged: PartialConfiguration = {
    ...existing,
    ...updates,
    sync: updates.sync ? { ...existing.sync, ...updates.sync } : existing.sync,
    playbooks: updates.playbooks ? { ...existing.playbooks, ...updates.playbooks } : existing.playbooks,
    tombstone: updates.tombstone ? { ...existing.tombstone, ...updates.tombstone } : existing.tombstone,
    identity: updates.identity ? { ...existing.identity, ...updates.identity } : existing.identity,
    externalSync: updates.externalSync ? { ...existing.externalSync, ...updates.externalSync } : existing.externalSync,
  };

  writeConfigFile(filePath, merged);
}

// ============================================================================
// Path Expansion
// ============================================================================

/**
 * Expands ~ to home directory in a path
 */
export function expandPath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === '~') {
    return os.homedir();
  }
  return filePath;
}

/**
 * Expands ~ in all playbook paths
 */
export function expandPlaybookPaths(paths: string[]): string[] {
  return paths.map(expandPath);
}
