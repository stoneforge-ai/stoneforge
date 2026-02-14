/**
 * CLI Plugin Registry
 *
 * Handles registration of plugin commands and aliases with conflict detection.
 * Built-in commands always take precedence over plugin commands.
 */

import type { CLIPlugin, PluginRegistrationResult, CommandRegistrationResult, SubcommandMergeResult } from './plugin-types.js';
import { registerCommand, registerAlias, getCommand, getAllAliases } from './runner.js';
import type { Command } from './types.js';

// ============================================================================
// Plugin Registration
// ============================================================================

/**
 * Options for command registration
 */
export interface RegisterPluginOptions {
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Merges subcommands from a plugin command into an existing command.
 *
 * @param existingCommand - The existing command to merge into
 * @param pluginCommand - The plugin command with subcommands to merge
 * @param pluginName - Name of the plugin (for logging)
 * @param verbose - Whether to log verbose output
 * @returns Result of the merge operation
 */
function mergeSubcommands(
  existingCommand: Command,
  pluginCommand: Command,
  pluginName: string,
  verbose: boolean
): SubcommandMergeResult {
  const merged: string[] = [];
  const skipped: string[] = [];

  for (const [name, subCmd] of Object.entries(pluginCommand.subcommands || {})) {
    if (existingCommand.subcommands?.[name]) {
      skipped.push(name);
      if (verbose) {
        console.error(
          `[plugin:${pluginName}] Skipping subcommand '${existingCommand.name} ${name}': already exists`
        );
      }
    } else {
      existingCommand.subcommands = existingCommand.subcommands || {};
      existingCommand.subcommands[name] = subCmd;
      merged.push(name);
      if (verbose) {
        console.error(
          `[plugin:${pluginName}] Merged subcommand '${existingCommand.name} ${name}'`
        );
      }
    }
  }

  return { merged, skipped };
}

/**
 * Registers all commands and aliases from a single plugin.
 *
 * Built-in commands always take precedence - plugin commands that conflict
 * with existing commands are skipped with a warning.
 *
 * @param plugin - The plugin to register
 * @param options - Registration options
 * @returns Registration result
 */
export function registerPluginCommands(
  plugin: CLIPlugin,
  options?: RegisterPluginOptions
): PluginRegistrationResult {
  const verbose = options?.verbose ?? false;
  const registeredCommands: string[] = [];
  const skippedCommands: CommandRegistrationResult[] = [];
  const registeredAliases: string[] = [];
  const skippedAliases: string[] = [];

  // Register commands
  for (const command of plugin.commands) {
    const existingCommand = getCommand(command.name);

    if (existingCommand) {
      // Check if both have subcommands - can merge
      if (existingCommand.subcommands && command.subcommands) {
        const mergeResult = mergeSubcommands(existingCommand, command, plugin.name, verbose);

        if (mergeResult.merged.length > 0) {
          registeredCommands.push(`${command.name} (subcommands: ${mergeResult.merged.join(', ')})`);
        }

        if (mergeResult.skipped.length > 0) {
          skippedCommands.push({
            commandName: command.name,
            success: false,
            conflictReason: `Subcommand(s) '${mergeResult.skipped.join(', ')}' already exist`,
            subcommandsMerged: mergeResult,
          });
        } else if (mergeResult.merged.length > 0) {
          // Track successful merge without conflicts for logging purposes
          skippedCommands.push({
            commandName: command.name,
            success: true,
            subcommandsMerged: mergeResult,
          });
        }
      } else {
        // Cannot merge - skip entirely (existing behavior)
        const result: CommandRegistrationResult = {
          commandName: command.name,
          success: false,
          conflictReason: `Command '${command.name}' already registered`,
        };
        skippedCommands.push(result);

        if (verbose) {
          console.error(
            `[plugin:${plugin.name}] Skipping command '${command.name}': already registered`
          );
        }
      }
    } else {
      // Register the command
      registerCommand(command);
      registeredCommands.push(command.name);

      if (verbose) {
        console.error(
          `[plugin:${plugin.name}] Registered command '${command.name}'`
        );
      }
    }
  }

  // Register aliases
  if (plugin.aliases) {
    const existingAliases = getAllAliases();

    for (const [alias, target] of Object.entries(plugin.aliases)) {
      // Check if alias conflicts with existing command or alias
      const existingCommand = getCommand(alias);
      const existingAlias = existingAliases.get(alias);

      if (existingCommand) {
        skippedAliases.push(alias);
        if (verbose) {
          console.error(
            `[plugin:${plugin.name}] Skipping alias '${alias}': conflicts with existing command`
          );
        }
      } else if (existingAlias) {
        skippedAliases.push(alias);
        if (verbose) {
          console.error(
            `[plugin:${plugin.name}] Skipping alias '${alias}': already registered as alias for '${existingAlias}'`
          );
        }
      } else {
        registerAlias(alias, target);
        registeredAliases.push(alias);

        if (verbose) {
          console.error(
            `[plugin:${plugin.name}] Registered alias '${alias}' -> '${target}'`
          );
        }
      }
    }
  }

  return {
    pluginName: plugin.name,
    registeredCommands,
    skippedCommands,
    registeredAliases,
    skippedAliases,
  };
}

/**
 * Registers all plugins' commands and aliases.
 *
 * Plugins are registered in order, so earlier plugins take precedence
 * for command names. Built-in commands always take precedence over all plugins.
 *
 * @param plugins - Plugins to register
 * @param options - Registration options
 * @returns Array of registration results
 */
export async function registerAllPlugins(
  plugins: CLIPlugin[],
  options?: RegisterPluginOptions
): Promise<PluginRegistrationResult[]> {
  const results: PluginRegistrationResult[] = [];

  for (const plugin of plugins) {
    // Run plugin init if provided
    if (plugin.init) {
      try {
        await plugin.init();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[plugin:${plugin.name}] Init failed: ${message}`);
        // Continue with registration even if init fails
      }
    }

    const result = registerPluginCommands(plugin, options);
    results.push(result);
  }

  return results;
}

/**
 * Logs conflict warnings from registration results.
 *
 * @param results - Registration results to check for conflicts
 */
export function logConflictWarnings(results: PluginRegistrationResult[]): void {
  for (const result of results) {
    // Log skipped commands
    for (const skipped of result.skippedCommands) {
      // Skip warning if subcommands were successfully merged (partial or full success)
      if (skipped.subcommandsMerged?.merged.length) {
        continue;
      }
      if (skipped.conflictReason) {
        console.error(
          `[plugin:${result.pluginName}] Warning: ${skipped.conflictReason}`
        );
      }
    }

    // Log skipped aliases (only if there were any)
    if (result.skippedAliases.length > 0) {
      console.error(
        `[plugin:${result.pluginName}] Warning: Skipped ${result.skippedAliases.length} alias(es) due to conflicts`
      );
    }
  }
}

/**
 * Gets a summary of registered plugin commands for the help menu.
 *
 * @param results - Registration results
 * @returns Map of plugin name to registered command names
 */
export function getPluginCommandSummary(
  results: PluginRegistrationResult[]
): Map<string, string[]> {
  const summary = new Map<string, string[]>();

  for (const result of results) {
    if (result.registeredCommands.length > 0) {
      summary.set(result.pluginName, result.registeredCommands);
    }
  }

  return summary;
}
