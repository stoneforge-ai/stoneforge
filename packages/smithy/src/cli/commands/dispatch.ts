/**
 * Dispatch Commands - CLI operations for task dispatch
 *
 * Provides commands for dispatching tasks to agents:
 * - dispatch <task-id> <agent-id>: Dispatch a task to a specific agent
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getOutputMode } from '@stoneforge/quarry/cli';
import type { ElementId, EntityId } from '@stoneforge/core';
import type { OrchestratorAPI } from '../../api/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates orchestrator API client
 */
async function createOrchestratorClient(options: GlobalOptions): Promise<{
  api: OrchestratorAPI | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/index.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        api: null,
        error: 'No .stoneforge directory found. Run "sf init" first.',
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    return { api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { api: null, error: `Failed to initialize API: ${message}` };
  }
}

// ============================================================================
// Dispatch to Agent Command
// ============================================================================

interface DispatchOptions {
  branch?: string;
  worktree?: string;
  session?: string;
  markAsStarted?: boolean;
}

const dispatchOptions: CommandOption[] = [
  {
    name: 'branch',
    short: 'b',
    description: 'Git branch for the task',
    hasValue: true,
  },
  {
    name: 'worktree',
    short: 'w',
    description: 'Worktree path for the task',
    hasValue: true,
  },
  {
    name: 'session',
    short: 's',
    description: 'Session ID to associate',
    hasValue: true,
  },
  {
    name: 'markAsStarted',
    short: 'm',
    description: 'Mark the task as started after dispatch',
  },
];

async function dispatchHandler(
  args: string[],
  options: GlobalOptions & DispatchOptions
): Promise<CommandResult> {
  const [taskId, agentId] = args;

  if (!taskId || !agentId) {
    return failure('Usage: sf dispatch <task-id> <agent-id> [options]\nExample: sf dispatch el-abc123 el-agent1', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // Assign the task to the agent
    const task = await api.assignTaskToAgent(
      taskId as ElementId,
      agentId as EntityId,
      {
        branch: options.branch,
        worktree: options.worktree,
        sessionId: options.session,
        markAsStarted: options.markAsStarted,
      }
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: task.id,
        agentId,
        branch: options.branch,
        worktree: options.worktree,
        markAsStarted: options.markAsStarted ?? false,
      });
    }

    if (mode === 'quiet') {
      return success(task.id);
    }

    let message = `Dispatched task ${taskId} to agent ${agentId}`;
    if (options.markAsStarted) {
      message += ' (marked as started)';
    }

    return success(task, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to dispatch: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Main Dispatch Command
// ============================================================================

export const dispatchCommand: Command = {
  name: 'dispatch',
  description: 'Dispatch a task to an agent',
  usage: 'sf dispatch <task-id> <agent-id> [options]',
  help: `Dispatch a task to an agent for execution.

Arguments:
  task-id     Task identifier
  agent-id    Agent identifier

Options:
  -b, --branch <branch>      Git branch for the task
  -w, --worktree <path>      Worktree path for the task
  -s, --session <id>         Session ID to associate
  -m, --markAsStarted        Mark the task as started after dispatch

Examples:
  sf dispatch el-abc123 el-agent1
  sf dispatch el-abc123 el-agent1 --branch feature/my-task
  sf dispatch el-abc123 el-agent1 --markAsStarted`,
  options: dispatchOptions,
  handler: dispatchHandler as Command['handler'],
};
