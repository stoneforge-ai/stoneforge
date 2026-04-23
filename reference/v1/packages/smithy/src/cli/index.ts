/**
 * Orchestrator CLI Module
 *
 * Exports CLI commands and plugin for the orchestrator.
 */

// Plugin export
export { cliPlugin } from './plugin.js';

// Command exports
export { agentCommand, agentListCommand, agentShowCommand, agentRegisterCommand, agentStartCommand, agentStopCommand, agentStreamCommand } from './commands/agent.js';
export { daemonCommand, daemonStartCommand, daemonStopCommand, daemonStatusCommand, daemonSleepCommand, daemonWakeCommand } from './commands/daemon.js';
export { dispatchCommand } from './commands/dispatch.js';
export { mergeCommand } from './commands/merge.js';
export { poolCommand, poolListCommand, poolShowCommand, poolCreateCommand, poolUpdateCommand, poolDeleteCommand, poolStatusCommand, poolRefreshCommand } from './commands/pool.js';
export { taskCommand, taskHandoffCommand, taskCompleteCommand } from './commands/task.js';
