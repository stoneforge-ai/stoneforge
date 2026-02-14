/**
 * CLI Module - Command-line interface for Stoneforge
 */

// Types
export * from './types.js';

// Plugin types
export type { CLIPlugin, PluginsConfig as CLIPluginsConfig, PluginDiscoveryResult, PluginRegistrationResult } from './plugin-types.js';
export { isValidCLIPlugin, isValidPluginsConfig } from './plugin-types.js';
export { discoverPlugins, getKnownPluginPackages } from './plugin-loader.js';
export { registerPluginCommands, registerAllPlugins, getPluginCommandSummary } from './plugin-registry.js';

// Parser
export { parseArgs, validateRequiredOptions, getGlobalOptionsHelp, getCommandOptionsHelp } from './parser.js';

// Formatter
export { getFormatter, getOutputMode, getStatusIcon, type OutputFormatter, type TreeNode } from './formatter.js';

// Runner
export { registerCommand, registerAlias, getCommand, getAllCommands, getAllAliases, run, main } from './runner.js';

// Commands
export { initCommand, OPERATOR_ENTITY_ID, OPERATOR_ENTITY_NAME } from './commands/init.js';
export { resetCommand } from './commands/reset.js';
export { configCommand } from './commands/config.js';
export { helpCommand, versionCommand, getCommandHelp } from './commands/help.js';
export { showCommand, createHandler, listHandler, showHandler, updateHandler, deleteHandler } from './commands/crud.js';
export { depCommand, depAddCommand, depRemoveCommand, depListCommand, depTreeCommand } from './commands/dep.js';
export {
  readyCommand, blockedCommand, backlogCommand, closeCommand,
  reopenCommand, assignCommand, deferCommand, undeferCommand,
  describeCommand, activateCommand, taskCommand,
} from './commands/task.js';
export { statsCommand } from './commands/stats.js';
export { planCommand } from './commands/plan.js';
export { workflowCommand } from './commands/workflow.js';
export { playbookCommand } from './commands/playbook.js';
export { channelCommand } from './commands/channel.js';
export { libraryCommand } from './commands/library.js';
export { teamCommand } from './commands/team.js';
export { documentCommand } from './commands/document.js';
export { embeddingsCommand } from './commands/embeddings.js';
export { messageCommand } from './commands/message.js';
export { completionCommand } from './commands/completion.js';
export { aliasCommand } from './commands/alias.js';
export { serveCommand } from './commands/serve.js';

// Completion
export { generateCompletion, generateBashCompletion, generateZshCompletion, generateFishCompletion, getInstallInstructions, type ShellType } from './completion.js';
