/**
 * CLI Plugin Types
 *
 * Type definitions for the CLI plugin system.
 * Plugins can register commands and aliases to extend the CLI.
 */

import type { Command } from './types.js';

// ============================================================================
// Plugin Interface
// ============================================================================

/**
 * CLI Plugin interface for extending the `sf` CLI.
 *
 * Plugins can provide additional commands and aliases to the CLI.
 * They are discovered via known packages or user-specified config.
 */
export interface CLIPlugin {
  /** Plugin name (should be unique) */
  name: string;

  /** Plugin version */
  version: string;

  /** Commands provided by this plugin */
  commands: Command[];

  /** Command aliases (e.g., 'agents' -> 'agent list') */
  aliases?: Record<string, string>;

  /** Optional initialization function called before commands are registered */
  init?: () => Promise<void>;
}

// ============================================================================
// Plugin Configuration
// ============================================================================

/**
 * Plugin configuration for user-specified packages
 */
export interface PluginsConfig {
  /** Package names that export CLI plugins */
  packages: string[];
}

// ============================================================================
// Plugin Discovery Results
// ============================================================================

/**
 * Result of attempting to load a single plugin
 */
export interface PluginLoadResult {
  /** Package name that was attempted */
  packageName: string;

  /** Whether the plugin was successfully loaded */
  success: boolean;

  /** The loaded plugin (if successful) */
  plugin?: CLIPlugin;

  /** Error message (if failed) */
  error?: string;

  /** Whether the package was not found (vs load error) */
  notFound?: boolean;
}

/**
 * Result of plugin discovery process
 */
export interface PluginDiscoveryResult {
  /** Successfully loaded plugins */
  plugins: CLIPlugin[];

  /** Load results for all attempted packages */
  results: PluginLoadResult[];

  /** Packages that were not found (silent skip) */
  notFoundPackages: string[];

  /** Packages that failed to load (warning) */
  failedPackages: string[];
}

// ============================================================================
// Plugin Registration Results
// ============================================================================

/**
 * Result of merging subcommands from a plugin command into an existing command
 */
export interface SubcommandMergeResult {
  /** Subcommand names that were successfully merged */
  merged: string[];

  /** Subcommand names that were skipped due to conflicts */
  skipped: string[];
}

/**
 * Result of registering a command
 */
export interface CommandRegistrationResult {
  /** Command name */
  commandName: string;

  /** Whether registration succeeded */
  success: boolean;

  /** Conflict reason if registration failed */
  conflictReason?: string;

  /** Result of subcommand merging (when both commands have subcommands) */
  subcommandsMerged?: SubcommandMergeResult;
}

/**
 * Result of registering a plugin's commands
 */
export interface PluginRegistrationResult {
  /** Plugin name */
  pluginName: string;

  /** Commands that were successfully registered */
  registeredCommands: string[];

  /** Commands that were skipped due to conflicts */
  skippedCommands: CommandRegistrationResult[];

  /** Aliases that were successfully registered */
  registeredAliases: string[];

  /** Aliases that were skipped due to conflicts */
  skippedAliases: string[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Validates that an object is a valid CLIPlugin
 */
export function isValidCLIPlugin(obj: unknown): obj is CLIPlugin {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const plugin = obj as Record<string, unknown>;

  // Required fields
  if (typeof plugin.name !== 'string' || plugin.name.length === 0) {
    return false;
  }
  if (typeof plugin.version !== 'string' || plugin.version.length === 0) {
    return false;
  }
  if (!Array.isArray(plugin.commands)) {
    return false;
  }

  // Validate commands array
  for (const cmd of plugin.commands) {
    if (!isValidCommand(cmd)) {
      return false;
    }
  }

  // Optional aliases
  if (plugin.aliases !== undefined) {
    if (typeof plugin.aliases !== 'object' || plugin.aliases === null) {
      return false;
    }
    for (const [key, value] of Object.entries(plugin.aliases)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        return false;
      }
    }
  }

  // Optional init function
  if (plugin.init !== undefined && typeof plugin.init !== 'function') {
    return false;
  }

  return true;
}

/**
 * Validates that an object is a valid Command
 */
function isValidCommand(obj: unknown): obj is Command {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const cmd = obj as Record<string, unknown>;

  // Required fields
  if (typeof cmd.name !== 'string' || cmd.name.length === 0) {
    return false;
  }
  if (typeof cmd.description !== 'string') {
    return false;
  }
  if (typeof cmd.usage !== 'string') {
    return false;
  }
  if (typeof cmd.handler !== 'function') {
    return false;
  }

  // Optional subcommands
  if (cmd.subcommands !== undefined) {
    if (typeof cmd.subcommands !== 'object' || cmd.subcommands === null) {
      return false;
    }
    for (const subCmd of Object.values(cmd.subcommands)) {
      if (!isValidCommand(subCmd)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validates plugin configuration
 */
export function isValidPluginsConfig(obj: unknown): obj is PluginsConfig {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const config = obj as Record<string, unknown>;

  if (!Array.isArray(config.packages)) {
    return false;
  }

  for (const pkg of config.packages) {
    if (typeof pkg !== 'string' || pkg.length === 0) {
      return false;
    }
  }

  return true;
}
