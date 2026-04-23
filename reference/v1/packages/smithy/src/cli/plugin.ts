/**
 * Orchestrator CLI Plugin
 *
 * Exports the CLI plugin that registers orchestrator commands
 * with the main `sf` CLI.
 */

import type { CLIPlugin } from '@stoneforge/quarry/cli';
import { agentCommand } from './commands/agent.js';
import { daemonCommand } from './commands/daemon.js';
import { dispatchCommand } from './commands/dispatch.js';
import { mergeCommand } from './commands/merge.js';
import { poolCommand } from './commands/pool.js';
import { taskCommand } from './commands/task.js';

/**
 * The orchestrator CLI plugin.
 *
 * Provides commands for:
 * - `agent`: Manage orchestrator agents (list, show, register, start, stop, stream)
 * - `daemon`: Manage the dispatch daemon (start, stop, status)
 * - `dispatch`: Dispatch tasks to agents
 * - `merge`: Squash-merge a branch into the default branch
 * - `pool`: Manage agent pools for concurrency limiting
 * - `task`: Task management (handoff, complete)
 *
 * Note: `sf serve` is handled by the quarry CLI directly, which auto-detects
 * smithy availability and delegates via `sf serve smithy`.
 */
export const cliPlugin: CLIPlugin = {
  name: 'orchestrator',
  version: '0.1.0',
  commands: [agentCommand, daemonCommand, dispatchCommand, mergeCommand, poolCommand, taskCommand],
  aliases: {
    agents: 'agent list',
    pools: 'pool list',
  },
};
