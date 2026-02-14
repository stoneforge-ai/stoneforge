/**
 * Task Commands - CLI operations for orchestrator task management
 *
 * Provides commands for task management:
 * - task handoff <task-id>: Hand off a task to another agent
 * - task complete <task-id>: Complete a task and optionally create a PR
 * - task merge <task-id>: Mark a task as merged and close it
 * - task reject <task-id>: Mark a task merge as failed and reopen it
 * - task sync <task-id>: Sync a task branch with the main branch
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@stoneforge/quarry/cli';
import { success, failure, ExitCode, getOutputMode } from '@stoneforge/quarry/cli';
import type { ElementId, Task } from '@stoneforge/core';
import { TaskStatus, createTimestamp } from '@stoneforge/core';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates task assignment service
 */
async function createTaskAssignmentService(options: GlobalOptions): Promise<{
  service: import('../../services/task-assignment-service.js').TaskAssignmentService | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createTaskAssignmentService: createService } = await import('../../services/task-assignment-service.js');
    const { createLocalMergeProvider } = await import('../../services/merge-request-provider.js');
    const { QuarryAPIImpl } = await import('@stoneforge/quarry');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return {
        service: null,
        error: 'No .stoneforge directory found. Run "sf init" first.',
      };
    }

    const dbPath = options.db ?? `${stoneforgeDir}/stoneforge.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = new QuarryAPIImpl(backend);
    const mergeProvider = createLocalMergeProvider();
    const service = createService(api, mergeProvider);

    return { service };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { service: null, error: `Failed to initialize service: ${message}` };
  }
}

/**
 * Creates an OrchestratorAPI instance for merge/reject operations
 */
async function createOrchestratorApi(options: GlobalOptions): Promise<{
  api: import('../../api/orchestrator-api.js').OrchestratorAPI | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createOrchestratorAPI } = await import('../../api/orchestrator-api.js');

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

/**
 * Gets the current session ID from environment or generates a placeholder
 */
function getCurrentSessionId(): string {
  // Check for session ID in environment (set by spawner or agent)
  return process.env.STONEFORGE_SESSION_ID || `cli-${Date.now()}`;
}

// ============================================================================
// Task Handoff Command
// ============================================================================

interface TaskHandoffOptions {
  message?: string;
  branch?: string;
  worktree?: string;
  sessionId?: string;
}

const taskHandoffOptions: CommandOption[] = [
  {
    name: 'message',
    short: 'm',
    description: 'Handoff message explaining context and reason',
    hasValue: true,
  },
  {
    name: 'branch',
    short: 'b',
    description: 'Override the branch to preserve (defaults to task branch)',
    hasValue: true,
  },
  {
    name: 'worktree',
    short: 'w',
    description: 'Override the worktree path to preserve (defaults to task worktree)',
    hasValue: true,
  },
  {
    name: 'sessionId',
    short: 's',
    description: 'Session ID of the agent handing off (defaults to current session)',
    hasValue: true,
  },
];

async function taskHandoffHandler(
  args: string[],
  options: GlobalOptions & TaskHandoffOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: sf task handoff <task-id> [options]\nExample: sf task handoff el-abc123 --message "Need help with frontend"', ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error } = await createTaskAssignmentService(options);
  if (error || !service) {
    return failure(error ?? 'Failed to create service', ExitCode.GENERAL_ERROR);
  }

  try {
    const sessionId = options.sessionId || getCurrentSessionId();

    const task = await service.handoffTask(taskId as ElementId, {
      sessionId,
      message: options.message,
      branch: options.branch,
      worktree: options.worktree,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: task.id,
        sessionId,
        message: options.message,
        branch: options.branch,
        worktree: options.worktree,
        handedOff: true,
      });
    }

    if (mode === 'quiet') {
      return success(task.id);
    }

    const lines = [
      `Handed off task ${taskId}`,
      `  Session:   ${sessionId}`,
    ];
    if (options.message) {
      lines.push(`  Message:   ${options.message.slice(0, 50)}${options.message.length > 50 ? '...' : ''}`);
    }
    if (options.branch) {
      lines.push(`  Branch:    ${options.branch}`);
    }
    if (options.worktree) {
      lines.push(`  Worktree:  ${options.worktree}`);
    }
    lines.push('');
    lines.push('Task has been unassigned and is available for pickup by another agent.');

    return success(task, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to hand off task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskHandoffCommand: Command = {
  name: 'handoff',
  description: 'Hand off a task to another agent',
  usage: 'sf task handoff <task-id> [options]',
  help: `Hand off a task to be picked up by another agent.

This command:
1. Preserves the branch and worktree references in task metadata
2. Appends a handoff note with context to the task description
3. Unassigns the task so it returns to the available pool

The next agent that picks up this task can continue from the
existing code state in the preserved branch/worktree.

Arguments:
  task-id    Task identifier to hand off

Options:
  -m, --message <text>     Handoff message with context and reason
  -b, --branch <name>      Override branch to preserve
  -w, --worktree <path>    Override worktree path to preserve
  -s, --sessionId <id>     Session ID (defaults to current session)

Examples:
  sf task handoff el-abc123
  sf task handoff el-abc123 --message "Completed API, need help with frontend"
  sf task handoff el-abc123 -m "Blocked on database access" -b feature/my-branch`,
  options: taskHandoffOptions,
  handler: taskHandoffHandler as Command['handler'],
};

// ============================================================================
// Task Complete Command
// ============================================================================

interface TaskCompleteOptions {
  summary?: string;
  commitHash?: string;
  noMR?: boolean;
  mrTitle?: string;
  mrBody?: string;
  baseBranch?: string;
}

const taskCompleteOptions: CommandOption[] = [
  {
    name: 'summary',
    short: 's',
    description: 'Summary of what was accomplished',
    hasValue: true,
  },
  {
    name: 'commitHash',
    short: 'c',
    description: 'Commit hash for the final commit',
    hasValue: true,
  },
  {
    name: 'no-mr',
    description: 'Skip merge request creation',
  },
  {
    name: 'mr-title',
    description: 'Custom title for the merge request',
    hasValue: true,
  },
  {
    name: 'mr-body',
    description: 'Custom body for the merge request',
    hasValue: true,
  },
  {
    name: 'baseBranch',
    short: 'b',
    description: 'Base branch for the merge request (default: main)',
    hasValue: true,
  },
];

async function taskCompleteHandler(
  args: string[],
  options: GlobalOptions & TaskCompleteOptions & { 'no-mr'?: boolean; 'mr-title'?: string; 'mr-body'?: string }
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: sf task complete <task-id> [options]\nExample: sf task complete el-abc123 --summary "Implemented feature"', ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error } = await createTaskAssignmentService(options);
  if (error || !service) {
    return failure(error ?? 'Failed to create service', ExitCode.GENERAL_ERROR);
  }

  try {
    const result = await service.completeTask(taskId as ElementId, {
      summary: options.summary,
      commitHash: options.commitHash,
      createMergeRequest: options['no-mr'] !== true,
      mergeRequestTitle: options['mr-title'],
      mergeRequestBody: options['mr-body'],
      baseBranch: options.baseBranch,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: result.task.id,
        status: result.task.status,
        mergeRequestUrl: result.mergeRequestUrl,
        mergeRequestId: result.mergeRequestId,
      });
    }

    if (mode === 'quiet') {
      return success(result.task.id);
    }

    const lines = [
      `Completed task ${taskId}`,
      `  Status: ${result.task.status}`,
    ];
    if (options.summary) {
      lines.push(`  Summary: ${options.summary.slice(0, 50)}${options.summary.length > 50 ? '...' : ''}`);
    }
    if (result.mergeRequestUrl) {
      lines.push(`  MR: ${result.mergeRequestUrl}`);
    }

    return success(result, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to complete task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskCompleteCommand: Command = {
  name: 'complete',
  description: 'Complete a task and optionally create a merge request',
  usage: 'sf task complete <task-id> [options]',
  help: `Complete a task and optionally create a merge request.

This command:
1. Sets the task status to 'review' (awaiting merge)
2. Clears the task assignee
3. Records completion time and optional summary
4. Creates a merge request for the task branch (if a provider is configured)

Arguments:
  task-id    Task identifier to complete

Options:
  -s, --summary <text>      Summary of what was accomplished
  -c, --commitHash <hash>   Commit hash for the final commit
  --no-mr                   Skip merge request creation
  --mr-title <title>        Custom MR title (defaults to task title)
  --mr-body <body>          Custom MR body
  -b, --baseBranch <name>   Base branch for MR (default: main)

Examples:
  sf task complete el-abc123
  sf task complete el-abc123 --summary "Implemented login feature"
  sf task complete el-abc123 --no-mr
  sf task complete el-abc123 --baseBranch develop`,
  options: taskCompleteOptions,
  handler: taskCompleteHandler as Command['handler'],
};

// ============================================================================
// Task Merge Command
// ============================================================================

interface TaskMergeOptions {
  summary?: string;
}

const taskMergeOptions: CommandOption[] = [
  {
    name: 'summary',
    short: 's',
    description: 'Summary of the merge',
    hasValue: true,
  },
];

async function taskMergeHandler(
  args: string[],
  options: GlobalOptions & TaskMergeOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: sf task merge <task-id> [options]\nExample: sf task merge el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // 1. Get task and validate
    const task = await api.get<Task>(taskId as ElementId);
    if (!task) {
      return failure(`Task not found: ${taskId}`, ExitCode.GENERAL_ERROR);
    }
    if (task.status !== TaskStatus.REVIEW) {
      return failure(
        `Task ${taskId} is in '${task.status}' status. Only REVIEW tasks can be merged.`,
        ExitCode.GENERAL_ERROR
      );
    }

    const { getOrchestratorTaskMeta, updateOrchestratorTaskMeta } = await import('../../types/task-meta.js');
    const orchestratorMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown>);
    const sourceBranch = orchestratorMeta?.branch;

    if (!sourceBranch) {
      return failure(`Task ${taskId} has no branch in orchestrator metadata.`, ExitCode.GENERAL_ERROR);
    }

    // 2. Derive workspace root from .stoneforge dir
    const { findStoneforgeDir } = await import('@stoneforge/quarry');
    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return failure('No .stoneforge directory found. Run "sf init" first.', ExitCode.GENERAL_ERROR);
    }
    const { default: path } = await import('node:path');
    const workspaceRoot = path.dirname(stoneforgeDir);

    // 3. Call mergeBranch() with syncLocal disabled (we'll do it after bookkeeping)
    const { mergeBranch, syncLocalBranch } = await import('../../git/merge.js');
    const { detectTargetBranch } = await import('../../git/merge.js');
    const commitMessage = `${task.title} (${taskId})`;

    const mergeResult = await mergeBranch({
      workspaceRoot,
      sourceBranch,
      commitMessage,
      syncLocal: false,
    });

    if (!mergeResult.success) {
      const lines = [`Failed to merge task ${taskId}: ${mergeResult.error}`];
      if (mergeResult.conflictFiles?.length) {
        lines.push('Conflict files:');
        for (const f of mergeResult.conflictFiles) {
          lines.push(`  - ${f}`);
        }
      }
      return failure(lines.join('\n'), ExitCode.GENERAL_ERROR);
    }

    // 4. Atomic status update: set mergeStatus + close in one call
    const now = createTimestamp();
    const newMeta = updateOrchestratorTaskMeta(
      task.metadata as Record<string, unknown>,
      {
        mergeStatus: 'merged' as import('../../types/task-meta.js').MergeStatus,
        completedAt: now,
        ...(options.summary ? { completionSummary: options.summary } : {}),
      }
    );

    await api.update<Task>(taskId as ElementId, {
      status: TaskStatus.CLOSED,
      assignee: undefined,
      closedAt: now,
      metadata: newMeta,
    });

    // 5. Clean up: delete source branch and remove task worktree (best-effort)
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
      await execAsync(`git branch -D ${sourceBranch}`, { cwd: workspaceRoot });
    } catch { /* branch may not exist locally */ }

    try {
      await execAsync(`git push origin --delete ${sourceBranch}`, { cwd: workspaceRoot });
    } catch { /* branch may not exist on remote */ }

    const worktreePath = orchestratorMeta?.worktree;
    if (worktreePath) {
      try {
        await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: workspaceRoot });
      } catch { /* worktree may already be gone */ }
    }

    // 6. Sync local target branch (best-effort, after all bookkeeping is done)
    const targetBranch = await detectTargetBranch(workspaceRoot);
    try {
      await execAsync('git fetch origin', { cwd: workspaceRoot, encoding: 'utf8' });
    } catch { /* best-effort */ }
    await syncLocalBranch(workspaceRoot, targetBranch);

    // 7. Output result
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId,
        mergeStatus: 'merged',
        commitHash: mergeResult.commitHash,
      });
    }

    if (mode === 'quiet') {
      return success(taskId);
    }

    const lines = [
      `Merged task ${taskId}`,
      `  Commit: ${mergeResult.commitHash}`,
      '  Merge Status: merged',
      '  Task Status: CLOSED',
    ];
    if (options.summary) {
      lines.push(`  Summary: ${options.summary.slice(0, 50)}${options.summary.length > 50 ? '...' : ''}`);
    }

    return success({ taskId, mergeStatus: 'merged', commitHash: mergeResult.commitHash }, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to merge task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskMergeCommand: Command = {
  name: 'merge',
  description: 'Squash-merge a task branch and close the task',
  usage: 'sf task merge <task-id> [options]',
  help: `Squash-merge a task's branch into the target branch and close it.

This command:
1. Validates the task is in REVIEW status with an associated branch
2. Squash-merges the branch into the target branch (auto-detected)
3. Pushes to remote
4. Atomically sets merge status to "merged" and closes the task
5. Cleans up the source branch (local + remote) and worktree

Arguments:
  task-id    Task identifier to merge

Options:
  -s, --summary <text>    Summary of the merge

Examples:
  sf task merge el-abc123
  sf task merge el-abc123 --summary "All tests passing, merged to main"`,
  options: taskMergeOptions,
  handler: taskMergeHandler as Command['handler'],
};

// ============================================================================
// Task Reject Command
// ============================================================================

interface TaskRejectOptions {
  reason?: string;
  message?: string;
}

const taskRejectOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: 'Reason for rejection (required)',
    hasValue: true,
  },
  {
    name: 'message',
    short: 'm',
    description: 'Handoff message for the next worker',
    hasValue: true,
  },
];

async function taskRejectHandler(
  args: string[],
  options: GlobalOptions & TaskRejectOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: sf task reject <task-id> --reason "..." [options]\nExample: sf task reject el-abc123 --reason "Tests failed"', ExitCode.INVALID_ARGUMENTS);
  }

  if (!options.reason) {
    return failure('--reason is required. Usage: sf task reject <task-id> --reason "..."\nExample: sf task reject el-abc123 --reason "Tests failed"', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    await api.updateTaskOrchestratorMeta(taskId as ElementId, {
      mergeStatus: 'test_failed',
      mergeFailureReason: options.reason,
      ...(options.message ? { handoffHistory: [{ sessionId: 'cli', message: options.message, handoffAt: new Date().toISOString() }] } : {}),
    });

    await api.update<Task>(taskId as ElementId, {
      status: TaskStatus.OPEN,
      assignee: undefined,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId,
        mergeStatus: 'test_failed',
        reason: options.reason,
        message: options.message,
      });
    }

    if (mode === 'quiet') {
      return success(taskId);
    }

    const lines = [
      `Rejected task ${taskId}`,
      '  Merge Status: test_failed',
      `  Reason: ${options.reason.slice(0, 50)}${options.reason.length > 50 ? '...' : ''}`,
    ];
    if (options.message) {
      lines.push(`  Handoff: ${options.message.slice(0, 50)}${options.message.length > 50 ? '...' : ''}`);
    }
    lines.push('');
    lines.push('Task has been reopened and unassigned for pickup by another agent.');

    return success({ taskId, mergeStatus: 'test_failed' }, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to reject task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskRejectCommand: Command = {
  name: 'reject',
  description: 'Mark a task merge as failed and reopen it',
  usage: 'sf task reject <task-id> --reason "..." [options]',
  help: `Mark a task merge as failed and reopen it.

This command:
1. Sets the task's merge status to "test_failed"
2. Records the failure reason
3. Reopens the task and unassigns it

Arguments:
  task-id    Task identifier to reject

Options:
  -r, --reason <text>     Reason for rejection (required)
  -m, --message <text>    Handoff message for the next worker

Examples:
  sf task reject el-abc123 --reason "Tests failed"
  sf task reject el-abc123 --reason "Tests failed" --message "Fix flaky test in auth.test.ts"`,
  options: taskRejectOptions,
  handler: taskRejectHandler as Command['handler'],
};

// ============================================================================
// Task Sync Command
// ============================================================================

/**
 * Result of a branch sync operation
 */
export interface SyncResult {
  /** Whether the sync succeeded without conflicts */
  success: boolean;
  /** List of conflicted file paths (if any) */
  conflicts?: string[];
  /** Error message (if sync failed for non-conflict reasons) */
  error?: string;
  /** Human-readable message */
  message: string;
  /** The worktree path used */
  worktreePath?: string;
  /** The branch that was synced */
  branch?: string;
}

async function taskSyncHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: sf task sync <task-id>\nExample: sf task sync el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // 1. Get task and its metadata
    const task = await api.get<Task>(taskId as ElementId);
    if (!task) {
      return failure(`Task not found: ${taskId}`, ExitCode.GENERAL_ERROR);
    }

    // 2. Extract worktree and branch from task metadata
    const taskMeta = task.metadata as Record<string, unknown> | undefined;
    const orchestratorMeta = taskMeta?.orchestrator as Record<string, unknown> | undefined;
    const worktreePath = orchestratorMeta?.worktree as string | undefined;
    const branch = orchestratorMeta?.branch as string | undefined;

    if (!worktreePath) {
      const syncResult: SyncResult = {
        success: false,
        error: 'No worktree path found in task metadata',
        message: 'Task has no worktree path - cannot sync',
      };
      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      return failure(syncResult.message, ExitCode.GENERAL_ERROR);
    }

    // 3. Check if worktree exists
    const { findStoneforgeDir } = await import('@stoneforge/quarry');
    const { createWorktreeManager } = await import('../../git/worktree-manager.js');

    const stoneforgeDir = findStoneforgeDir(process.cwd());
    if (!stoneforgeDir) {
      return failure('No .stoneforge directory found. Run "sf init" first.', ExitCode.GENERAL_ERROR);
    }

    // Get workspace root (parent of .stoneforge)
    const path = await import('node:path');
    const workspaceRoot = path.dirname(stoneforgeDir);

    const worktreeManager = createWorktreeManager({ workspaceRoot });
    await worktreeManager.initWorkspace();

    const worktreeExists = await worktreeManager.worktreeExists(worktreePath);
    if (!worktreeExists) {
      const syncResult: SyncResult = {
        success: false,
        error: `Worktree does not exist: ${worktreePath}`,
        message: `Worktree not found at ${worktreePath}`,
        worktreePath,
        branch,
      };
      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      return failure(syncResult.message, ExitCode.GENERAL_ERROR);
    }

    // 4. Run git fetch and merge in the worktree
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    // Resolve full worktree path
    const fullWorktreePath = path.isAbsolute(worktreePath)
      ? worktreePath
      : path.join(workspaceRoot, worktreePath);

    // Fetch from origin
    try {
      await execFileAsync('git', ['fetch', 'origin'], {
        cwd: fullWorktreePath,
        encoding: 'utf8',
        timeout: 60_000,
      });
    } catch (fetchError) {
      const syncResult: SyncResult = {
        success: false,
        error: `Failed to fetch from origin: ${(fetchError as Error).message}`,
        message: 'Git fetch failed',
        worktreePath,
        branch,
      };
      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      return failure(syncResult.message, ExitCode.GENERAL_ERROR);
    }

    // Detect the default branch (main or master)
    const defaultBranch = await worktreeManager.getDefaultBranch();
    const remoteBranch = `origin/${defaultBranch}`;

    // Attempt to merge
    try {
      await execFileAsync('git', ['merge', remoteBranch, '--no-edit'], {
        cwd: fullWorktreePath,
        encoding: 'utf8',
        timeout: 120_000,
      });

      // Merge succeeded
      const syncResult: SyncResult = {
        success: true,
        message: `Branch synced with ${remoteBranch}`,
        worktreePath,
        branch,
      };

      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success(syncResult);
      }
      if (mode === 'quiet') {
        return success('synced');
      }
      return success(syncResult, `✓ Branch synced with ${remoteBranch}`);
    } catch (mergeError) {
      // Check for merge conflicts
      try {
        const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd: fullWorktreePath,
          encoding: 'utf8',
        });

        // Parse conflicted files (lines starting with UU, AA, DD, AU, UA, DU, UD)
        const conflictPatterns = /^(UU|AA|DD|AU|UA|DU|UD)\s+(.+)$/gm;
        const conflicts: string[] = [];
        let match;
        while ((match = conflictPatterns.exec(statusOutput)) !== null) {
          conflicts.push(match[2]);
        }

        if (conflicts.length > 0) {
          const syncResult: SyncResult = {
            success: false,
            conflicts,
            message: `Merge conflicts detected in ${conflicts.length} file(s)`,
            worktreePath,
            branch,
          };

          const mode = getOutputMode(options);
          if (mode === 'json') {
            return success(syncResult);
          }
          if (mode === 'quiet') {
            return success(conflicts.join('\n'));
          }

          const lines = [
            `⚠ Merge conflicts detected in ${conflicts.length} file(s):`,
            ...conflicts.map(f => `  - ${f}`),
            '',
            'Resolve conflicts, then commit the resolution.',
          ];
          return success(syncResult, lines.join('\n'));
        }

        // Some other merge error (not conflicts)
        const syncResult: SyncResult = {
          success: false,
          error: (mergeError as Error).message,
          message: 'Merge failed (not due to conflicts)',
          worktreePath,
          branch,
        };

        const mode = getOutputMode(options);
        if (mode === 'json') {
          return success(syncResult);
        }
        return failure(syncResult.message, ExitCode.GENERAL_ERROR);
      } catch {
        // Failed to check status
        const syncResult: SyncResult = {
          success: false,
          error: (mergeError as Error).message,
          message: 'Merge failed',
          worktreePath,
          branch,
        };

        const mode = getOutputMode(options);
        if (mode === 'json') {
          return success(syncResult);
        }
        return failure(syncResult.message, ExitCode.GENERAL_ERROR);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to sync task branch: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskSyncCommand: Command = {
  name: 'sync',
  description: 'Sync a task branch with the main branch',
  usage: 'sf task sync <task-id>',
  help: `Sync a task's branch with the main branch (master/main).

This command:
1. Looks up the task's worktree path and branch from metadata
2. Runs \`git fetch origin\` in the worktree
3. Attempts \`git merge origin/main\` (or origin/master)
4. Reports success, conflicts, or errors

This is typically run by the dispatch daemon before spawning a merge steward,
or by the steward during review if master advances.

Arguments:
  task-id    Task identifier to sync

Output (JSON mode):
  {
    "success": true/false,
    "conflicts": ["file1.ts", "file2.ts"],  // if conflicts
    "error": "message",                      // if error
    "message": "human-readable status",
    "worktreePath": "/path/to/worktree",
    "branch": "agent/bob/el-123-feature"
  }

Examples:
  sf task sync el-abc123
  sf task sync el-abc123 --json`,
  options: [],
  handler: taskSyncHandler as Command['handler'],
};

// ============================================================================
// Task Merge-Status Command
// ============================================================================

import { MergeStatusValues, isMergeStatus, type MergeStatus } from '../../types/task-meta.js';

async function taskMergeStatusHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [taskId, statusArg] = args;

  if (!taskId || !statusArg) {
    return failure(
      `Usage: sf task merge-status <task-id> <status>\nExample: sf task merge-status el-abc123 merged\n\nValid statuses: ${MergeStatusValues.join(', ')}`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  // Validate that the provided status is a valid MergeStatus
  if (!isMergeStatus(statusArg)) {
    return failure(
      `Invalid merge status: "${statusArg}"\nValid statuses: ${MergeStatusValues.join(', ')}`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  const status: MergeStatus = statusArg;

  const { api, error } = await createOrchestratorApi(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // Terminal statuses (merged, not_applicable) also close the task atomically
    if (status === 'merged' || status === 'not_applicable') {
      const task = await api.get<Task>(taskId as ElementId);
      if (!task) {
        return failure(`Task not found: ${taskId}`, ExitCode.GENERAL_ERROR);
      }

      const { updateOrchestratorTaskMeta } = await import('../../types/task-meta.js');
      const now = createTimestamp();
      const newMeta = updateOrchestratorTaskMeta(
        task.metadata as Record<string, unknown>,
        { mergeStatus: status }
      );

      await api.update<Task>(taskId as ElementId, {
        status: TaskStatus.CLOSED,
        closedAt: now,
        metadata: newMeta,
      });
    } else {
      await api.updateTaskOrchestratorMeta(taskId as ElementId, {
        mergeStatus: status,
      });
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId,
        mergeStatus: status,
      });
    }

    if (mode === 'quiet') {
      return success(taskId);
    }

    const statusLine = (status === 'merged' || status === 'not_applicable')
      ? `Updated task ${taskId}\n  Merge Status: ${status}\n  Task Status: CLOSED`
      : `Updated task ${taskId}\n  Merge Status: ${status}`;

    return success(
      { taskId, mergeStatus: status },
      statusLine
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('Task not found')) {
      return failure(`Task not found: ${taskId}`, ExitCode.GENERAL_ERROR);
    }
    return failure(`Failed to update merge status: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskMergeStatusCommand: Command = {
  name: 'merge-status',
  description: 'Update the merge status of a task',
  usage: 'sf task merge-status <task-id> <status>',
  help: `Update the merge status of a task.

This command allows you to manually update the merge status of a task,
which is useful when the merge steward gets stuck or when a branch is
manually merged outside of the normal workflow.

Arguments:
  task-id    Task identifier to update
  status     New merge status value

Valid status values:
  pending         Task completed, awaiting merge
  testing         Steward is running tests on the branch
  merging         Tests passed, merge in progress
  merged          Successfully merged
  conflict        Merge conflict detected
  test_failed     Tests failed, needs attention
  failed          Merge failed for other reason
  not_applicable  No merge needed (issue already fixed on master)

Examples:
  sf task merge-status el-abc123 merged
  sf task merge-status el-abc123 pending
  sf task merge-status el-abc123 test_failed`,
  options: [],
  handler: taskMergeStatusHandler as Command['handler'],
};

// ============================================================================
// Main Task Command
// ============================================================================

export const taskCommand: Command = {
  name: 'task',
  description: 'Orchestrator task management',
  usage: 'sf task <subcommand> [options]',
  help: `Orchestrator task management commands.

Subcommands:
  handoff        Hand off a task to another agent
  complete       Complete a task and optionally create a merge request
  merge          Mark a task as merged and close it
  reject         Mark a task merge as failed and reopen it
  sync           Sync a task branch with the main branch
  merge-status   Update the merge status of a task

Examples:
  sf task handoff el-abc123 --message "Need help with frontend"
  sf task complete el-abc123 --summary "Implemented feature"
  sf task merge el-abc123
  sf task reject el-abc123 --reason "Tests failed"
  sf task sync el-abc123
  sf task merge-status el-abc123 merged`,
  subcommands: {
    handoff: taskHandoffCommand,
    complete: taskCompleteCommand,
    merge: taskMergeCommand,
    reject: taskRejectCommand,
    sync: taskSyncCommand,
    'merge-status': taskMergeStatusCommand,
  },
  handler: taskHandoffCommand.handler, // Default to handoff
  options: [],
};
