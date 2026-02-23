/**
 * CLI Runner
 *
 * Main entry point for command execution.
 */

import type { Command, CommandResult, GlobalOptions } from './types.js';
import { failure, ExitCode } from './types.js';
import { parseArgs, validateRequiredOptions } from './parser.js';
import { getFormatter, getOutputMode } from './formatter.js';
import { getCommandHelp } from './commands/help.js';
import type { PluginsConfig } from './plugin-types.js';
import { discoverPlugins, logPluginWarnings } from './plugin-loader.js';
import { registerAllPlugins, logConflictWarnings } from './plugin-registry.js';
import { suggestCommands } from './suggest.js';

// ============================================================================
// Command Registry
// ============================================================================

const commands: Map<string, Command> = new Map();
const aliases: Map<string, string> = new Map();

/**
 * Registers a command
 */
export function registerCommand(command: Command): void {
  commands.set(command.name, command);
}

/**
 * Registers a command alias
 */
export function registerAlias(alias: string, commandName: string): void {
  aliases.set(alias, commandName);
}

/**
 * Gets a registered command (checking aliases first)
 */
export function getCommand(name: string): Command | undefined {
  // Check if it's an alias
  const resolvedName = aliases.get(name) ?? name;
  return commands.get(resolvedName);
}

/**
 * Gets all registered commands
 */
export function getAllCommands(): Command[] {
  return Array.from(commands.values());
}

/**
 * Gets all registered aliases
 */
export function getAllAliases(): Map<string, string> {
  return new Map(aliases);
}

// ============================================================================
// Command Resolution
// ============================================================================

/**
 * Resolves a command path to a command definition
 */
function resolveCommand(commandPath: string[]): {
  command: Command | undefined;
  args: string[];
  subcommandSuggestion?: string;
} {
  if (commandPath.length === 0) {
    return { command: undefined, args: [] };
  }

  const [first, ...rest] = commandPath;
  // Check aliases first, then commands
  const resolvedFirst = aliases.get(first) ?? first;
  let command: Command | undefined = commands.get(resolvedFirst);

  if (!command) {
    return { command: undefined, args: commandPath };
  }

  // Resolve subcommands
  let args = rest;
  let subcommandSuggestion: string | undefined;
  while (args.length > 0 && command && command.subcommands) {
    const subName = args[0];
    const subCommand: Command | undefined = command.subcommands[subName];
    if (subCommand) {
      command = subCommand;
      args = args.slice(1);
    } else {
      // Check if the unmatched arg looks like a subcommand attempt (not an option or ID)
      if (!subName.startsWith('-') && !subName.startsWith('el-') && command.subcommands) {
        const subNames = Object.keys(command.subcommands);
        const suggestions = suggestCommands(subName, subNames);
        if (suggestions.length > 0) {
          subcommandSuggestion = `Unknown subcommand: ${subName}\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}\n\nRun "sf ${command.name} --help" to see available subcommands.`;
        }
      }
      break;
    }
  }

  return { command, args, subcommandSuggestion };
}

// ============================================================================
// Runner
// ============================================================================

/**
 * Runs the CLI with the given arguments
 */
export async function run(argv: string[]): Promise<number> {
  // First pass: parse for global options and command path
  // Use non-strict mode to skip unknown options (command-specific options)
  let parsed;
  try {
    parsed = parseArgs(argv, [], { strict: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return ExitCode.INVALID_ARGUMENTS;
  }

  const { command: commandPath, options } = parsed;

  // Handle version flag
  if (options.version) {
    const version = await import('./commands/help.js').then(m => m.versionCommand);
    const result = await version.handler([], { ...options });
    return outputResult(result, options);
  }

  // Handle help flag with no command
  if (options.help && commandPath.length === 0) {
    const help = await import('./commands/help.js').then(m => m.helpCommand);
    const result = await help.handler([], { ...options });
    return outputResult(result, options);
  }

  // No command specified - validate there are no unknown options with strict parsing
  if (commandPath.length === 0) {
    try {
      // Re-parse with strict mode to catch unknown options
      parseArgs(argv, [], { strict: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      return ExitCode.INVALID_ARGUMENTS;
    }
    const help = await import('./commands/help.js').then(m => m.helpCommand);
    const result = await help.handler([], { ...options });
    return outputResult(result, options);
  }

  // Resolve command
  const { command, subcommandSuggestion } = resolveCommand(commandPath);

  if (!command) {
    const input = commandPath[0];
    const allCommandNames = Array.from(commands.keys());
    const suggestions = suggestCommands(input, allCommandNames);
    let msg = `Unknown command: ${input}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf --help" to see available commands.';
    const result = failure(msg, ExitCode.INVALID_ARGUMENTS);
    return outputResult(result, options);
  }

  // Show subcommand suggestion if available
  if (subcommandSuggestion) {
    const result = failure(subcommandSuggestion, ExitCode.INVALID_ARGUMENTS);
    return outputResult(result, options);
  }

  // Handle help flag for specific command
  if (options.help) {
    const helpText = getCommandHelp(command);
    console.log(helpText);
    return ExitCode.SUCCESS;
  }

  // Re-parse with command-specific options
  try {
    const fullParsed = parseArgs(argv, command.options);

    // Validate required options
    if (command.options) {
      validateRequiredOptions(fullParsed.commandOptions, command.options);
    }

    // Re-resolve args from full parse to handle command options correctly
    // The first parse may have included option values as positional args
    const { args: fullSubcommandArgs } = resolveCommand(fullParsed.command);
    const fullResolvedArgs = [...fullSubcommandArgs, ...fullParsed.args];

    // Execute command
    const result = await command.handler(
      fullResolvedArgs,
      { ...fullParsed.options, ...fullParsed.commandOptions }
    );

    return outputResult(result, fullParsed.options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result = failure(message, ExitCode.GENERAL_ERROR);
    return outputResult(result, options);
  }
}

// ============================================================================
// Output
// ============================================================================

/**
 * Outputs a command result and returns the exit code
 */
function outputResult(result: CommandResult, options: GlobalOptions): number {
  const mode = getOutputMode(options);
  const formatter = getFormatter(mode);

  if (result.error) {
    const output = formatter.error(result);
    if (output) {
      console.error(output);
    }
  } else {
    const output = formatter.success(result);
    if (output) {
      console.log(output);
    }
  }

  return result.exitCode;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Main CLI entry point
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<never> {
  // Register all commands
  const { initCommand } = await import('./commands/init.js');
  const { resetCommand } = await import('./commands/reset.js');
  const { configCommand } = await import('./commands/config.js');
  const { helpCommand, versionCommand } = await import('./commands/help.js');
  const { createCommand, listCommand, showCommand, updateCommand, deleteCommand } = await import('./commands/crud.js');
  const {
    readyCommand,
    blockedCommand,
    backlogCommand,
    closeCommand,
    reopenCommand,
    assignCommand,
    deferCommand,
    undeferCommand,
    taskCommand,
  } = await import('./commands/task.js');
  const { depCommand } = await import('./commands/dep.js');
  const { syncCommand, exportCommand, importCommand, statusCommand } = await import('./commands/sync.js');
  const { identityCommand, whoamiCommand } = await import('./commands/identity.js');
  const { entityCommand } = await import('./commands/entity.js');
  const { statsCommand } = await import('./commands/stats.js');
  const { metricsCommand } = await import('./commands/metrics.js');
  const { doctorCommand, migrateCommand } = await import('./commands/admin.js');
  const { gcCommand } = await import('./commands/gc.js');
  const { historyCommand } = await import('./commands/history.js');
  const { logCommand } = await import('./commands/log.js');
  const { planCommand } = await import('./commands/plan.js');
  const { workflowCommand } = await import('./commands/workflow.js');
  const { playbookCommand } = await import('./commands/playbook.js');
  const { channelCommand } = await import('./commands/channel.js');
  const { libraryCommand } = await import('./commands/library.js');
  const { teamCommand } = await import('./commands/team.js');
  const { documentCommand } = await import('./commands/document.js');
  const { docsCommand } = await import('./commands/docs.js');
  const { embeddingsCommand } = await import('./commands/embeddings.js');
  const { messageCommand } = await import('./commands/message.js');
  const { inboxCommand } = await import('./commands/inbox.js');
  const { completionCommand } = await import('./commands/completion.js');
  const { aliasCommand } = await import('./commands/alias.js');
  const { installCommand } = await import('./commands/install.js');
  const { serveCommand } = await import('./commands/serve.js');

  registerCommand(initCommand);
  registerCommand(resetCommand);
  registerCommand(configCommand);
  registerCommand(helpCommand);
  registerCommand(versionCommand);
  registerCommand(createCommand);
  registerCommand(listCommand);
  registerCommand(showCommand);
  registerCommand(updateCommand);
  registerCommand(deleteCommand);

  // Task commands
  registerCommand(readyCommand);
  registerCommand(blockedCommand);
  registerCommand(backlogCommand);
  registerCommand(closeCommand);
  registerCommand(reopenCommand);
  registerCommand(assignCommand);
  registerCommand(deferCommand);
  registerCommand(undeferCommand);
  registerCommand(taskCommand);

  // Dependency commands
  registerCommand(depCommand);

  // Sync commands
  registerCommand(syncCommand);
  registerCommand(exportCommand);
  registerCommand(importCommand);
  registerCommand(statusCommand);

  // Identity commands
  registerCommand(identityCommand);
  registerCommand(whoamiCommand);

  // Entity commands
  registerCommand(entityCommand);

  // Admin commands
  registerCommand(statsCommand);
  registerCommand(metricsCommand);
  registerCommand(doctorCommand);
  registerCommand(migrateCommand);
  registerCommand(gcCommand);

  // History command
  registerCommand(historyCommand);

  // Operation log command
  registerCommand(logCommand);

  // Collection commands
  registerCommand(planCommand);
  registerCommand(workflowCommand);
  registerCommand(playbookCommand);
  registerCommand(channelCommand);
  registerCommand(libraryCommand);
  registerCommand(teamCommand);
  registerCommand(documentCommand);
  registerCommand(docsCommand);
  registerCommand(embeddingsCommand);
  registerCommand(messageCommand);
  registerCommand(inboxCommand);

  // Completion command
  registerCommand(completionCommand);

  // Alias command
  registerCommand(aliasCommand);

  // Install command
  registerCommand(installCommand);

  // Serve command
  registerCommand(serveCommand);

  // Command aliases
  registerAlias('add', 'create');    // User-friendly alias
  registerAlias('new', 'create');    // User-friendly alias
  registerAlias('rm', 'delete');     // Common shell convention
  registerAlias('remove', 'delete'); // Alternative delete alias
  registerAlias('ls', 'list');       // Common shell convention
  registerAlias('s', 'show');        // Short form
  registerAlias('get', 'show');      // Alternative show alias
  registerAlias('todo', 'ready');    // User-friendly alias
  registerAlias('tasks', 'ready');   // User-friendly alias
  registerAlias('done', 'close');    // User-friendly alias
  registerAlias('complete', 'close'); // User-friendly alias
  registerAlias('st', 'status');     // Short form for sync status
  registerAlias('dep', 'dependency'); // Short form
  registerAlias('msg', 'message');   // Short form
  registerAlias('doc', 'document');  // Short form

  // ============================================================================
  // Plugin Loading
  // ============================================================================

  const isVerbose = argv.includes('--verbose') || argv.includes('-v');

  // Load config for plugin settings (Strategy 2)
  let pluginsConfig: PluginsConfig | undefined;
  try {
    const { loadConfig } = await import('../config/index.js');
    const config = loadConfig();
    pluginsConfig = config.plugins;
  } catch {
    // Continue without config-based plugins
  }

  // Discover plugins (Strategy 1 + 2)
  const discoveryResult = await discoverPlugins(pluginsConfig, { verbose: isVerbose });
  logPluginWarnings(discoveryResult, { verbose: isVerbose });

  // Register plugin commands AFTER built-ins (built-ins take precedence)
  const registrationResults = await registerAllPlugins(discoveryResult.plugins, { verbose: isVerbose });

  // Log conflict warnings in non-verbose mode
  if (!isVerbose) {
    // Only log if there were actual conflicts (not just skipped for not being plugins)
    const hasConflicts = registrationResults.some(
      r => r.skippedCommands.length > 0 || r.skippedAliases.length > 0
    );
    if (hasConflicts) {
      logConflictWarnings(registrationResults);
    }
  }

  const exitCode = await run(argv);
  process.exit(exitCode);
}
