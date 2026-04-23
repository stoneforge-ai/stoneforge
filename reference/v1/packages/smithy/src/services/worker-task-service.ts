/**
 * Worker Task Service
 *
 * This service provides the complete workflow for workers picking up tasks
 * and working in isolated worktrees. It orchestrates:
 * - Task dispatch to worker
 * - Worktree creation for task isolation
 * - Worker spawning in the worktree
 * - Task context delivery to worker
 * - Task completion with branch ready for merge
 *
 * @module
 */

import type {
  Task,
  ElementId,
  EntityId,
  Timestamp,
} from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';

import type { AgentRole } from '../types/index.js';
import type { AgentEntity } from '../api/orchestrator-api.js';
import type { TaskAssignmentService } from './task-assignment-service.js';
import type { AgentRegistry } from './agent-registry.js';
import type {
  DispatchService,
  DispatchOptions,
  DispatchResult,
} from './dispatch-service.js';
import type {
  WorktreeManager,
  CreateWorktreeResult,
  WorktreeInfo,
} from '../git/worktree-manager.js';
import type { SpawnerService } from '../runtime/spawner.js';
import type { SessionManager, SessionRecord } from '../runtime/session-manager.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for starting a worker on a task
 */
export interface StartWorkerOnTaskOptions {
  /** Custom branch name (auto-generated if not provided) */
  branch?: string;
  /** Custom worktree path (auto-generated if not provided) */
  worktreePath?: string;
  /** Base branch to create the worktree from (defaults to default branch) */
  baseBranch?: string;
  /** Additional initial prompt to prepend to task context */
  additionalPrompt?: string;
  /** Entity performing the operation */
  performedBy?: EntityId;
  /** Skip worktree creation (use existing working directory) */
  skipWorktree?: boolean;
  /** Custom working directory (used if skipWorktree is true) */
  workingDirectory?: string;
  /** Dispatch priority for notification */
  priority?: number;
}

/**
 * Result of starting a worker on a task
 */
export interface StartWorkerOnTaskResult {
  /** The task being worked on */
  task: Task;
  /** The worker agent */
  agent: AgentEntity;
  /** The dispatch result (notification sent) */
  dispatch: DispatchResult;
  /** The worktree created (if applicable) */
  worktree?: CreateWorktreeResult;
  /** The session spawned */
  session: SessionRecord;
  /** The task context prompt that was sent */
  taskContextPrompt: string;
  /** Timestamp when the worker started */
  startedAt: Timestamp;
}

/**
 * Options for completing a task
 */
export interface CompleteTaskOptions {
  /** Summary of what was accomplished */
  summary?: string;
  /** Commit hash for the final commit */
  commitHash?: string;
  /** Whether to run tests before marking complete (defaults to false) */
  runTests?: boolean;
  /** Entity performing the completion */
  performedBy?: EntityId;
}

/**
 * Result of completing a task
 */
export interface CompleteTaskResult {
  /** The completed task */
  task: Task;
  /** The worktree info (if applicable) */
  worktree?: WorktreeInfo;
  /** Whether the branch is ready for merge */
  readyForMerge: boolean;
  /** Timestamp when the task was completed */
  completedAt: Timestamp;
}

/**
 * Task context information for generating prompts
 */
export interface TaskContext {
  /** Task ID */
  taskId: ElementId;
  /** Task title */
  title: string;
  /** Task description (from metadata) */
  description?: string;
  /** Task tags */
  tags: string[];
  /** Task priority (enum value) */
  priority?: number;
  /** Task complexity (enum value) */
  complexity?: number;
  /** Branch name */
  branch?: string;
  /** Worktree path */
  worktreePath?: string;
  /** Additional instructions */
  additionalInstructions?: string;
}

// ============================================================================
// Worker Task Service Interface
// ============================================================================

/**
 * Worker Task Service interface for orchestrating worker task workflow.
 *
 * This service provides the complete lifecycle management for workers:
 * 1. Start worker on a task (dispatch + worktree + spawn)
 * 2. Build task context prompts
 * 3. Complete tasks (close + ready for merge)
 * 4. Clean up after task completion
 */
export interface WorkerTaskService {
  // ----------------------------------------
  // Task Lifecycle
  // ----------------------------------------

  /**
   * Starts a worker on a task with full worktree isolation.
   *
   * This method performs the complete workflow:
   * 1. Dispatches the task to the worker (assigns + notifies)
   * 2. Creates a worktree for the task (if worktrees enabled)
   * 3. Spawns the worker session in the worktree
   * 4. Sends task context to the worker
   *
   * **IMPORTANT: Rate Limit Check Required**
   * This method does NOT check rate limits internally. The dispatch daemon
   * checks `resolveExecutableWithFallback()` before calling this method,
   * but direct callers (e.g., manual API, HTTP routes) MUST verify that
   * executables are not rate-limited before calling. Use
   * `dispatchDaemon.getRateLimitStatus().isPaused` to check. Spawning a
   * session against a rate-limited executable will fail or waste resources.
   *
   * @param taskId - The task to start
   * @param agentId - The worker agent
   * @param options - Options for starting
   * @returns The complete result
   */
  startWorkerOnTask(
    taskId: ElementId,
    agentId: EntityId,
    options?: StartWorkerOnTaskOptions
  ): Promise<StartWorkerOnTaskResult>;

  /**
   * Completes a task and marks the branch as ready for merge.
   *
   * This method:
   * 1. Marks the task as completed
   * 2. Updates merge status to 'pending' (ready for Merge Steward)
   * 3. Optionally runs tests
   *
   * @param taskId - The task to complete
   * @param options - Completion options
   * @returns The completion result
   */
  completeTask(
    taskId: ElementId,
    options?: CompleteTaskOptions
  ): Promise<CompleteTaskResult>;

  // ----------------------------------------
  // Task Context
  // ----------------------------------------

  /**
   * Builds the task context prompt for a worker.
   *
   * @param taskId - The task
   * @param workerId - The worker entity ID
   * @param additionalInstructions - Additional instructions to include
   * @returns The formatted task context prompt
   */
  buildTaskContextPrompt(
    taskId: ElementId,
    workerId: EntityId,
    additionalInstructions?: string
  ): Promise<string>;

  /**
   * Gets the task context information.
   *
   * @param taskId - The task
   * @returns The task context
   */
  getTaskContext(taskId: ElementId): Promise<TaskContext>;

  // ----------------------------------------
  // Cleanup
  // ----------------------------------------

  /**
   * Cleans up after a task is merged or abandoned.
   *
   * This method:
   * 1. Removes the worktree
   * 2. Optionally deletes the branch
   * 3. Updates task metadata
   *
   * @param taskId - The task to clean up
   * @param deleteBranch - Whether to delete the branch
   * @returns Success status
   */
  cleanupTask(taskId: ElementId, deleteBranch?: boolean): Promise<boolean>;
}

// ============================================================================
// Worker Task Service Implementation
// ============================================================================

/**
 * Implementation of the Worker Task Service.
 */
export class WorkerTaskServiceImpl implements WorkerTaskService {
  private readonly api: QuarryAPI;
  private readonly taskAssignment: TaskAssignmentService;
  private readonly agentRegistry: AgentRegistry;
  private readonly dispatchService: DispatchService;
  private readonly worktreeManager: WorktreeManager | undefined;
  // Note: SpawnerService kept for potential future use (e.g., sending input to sessions)
  // Currently we interact with sessions through SessionManager
  private readonly _spawnerService: SpawnerService;
  private readonly sessionManager: SessionManager;

  constructor(
    api: QuarryAPI,
    taskAssignment: TaskAssignmentService,
    agentRegistry: AgentRegistry,
    dispatchService: DispatchService,
    spawnerService: SpawnerService,
    sessionManager: SessionManager,
    worktreeManager?: WorktreeManager
  ) {
    this.api = api;
    this.taskAssignment = taskAssignment;
    this.agentRegistry = agentRegistry;
    this.dispatchService = dispatchService;
    this._spawnerService = spawnerService;
    this.sessionManager = sessionManager;
    this.worktreeManager = worktreeManager;
  }

  // ----------------------------------------
  // Task Lifecycle
  // ----------------------------------------

  // NOTE: This method does NOT check rate limits internally.
  // Callers MUST verify executables are not rate-limited before calling.
  // The dispatch daemon checks before calling this, but direct API callers
  // should use dispatchDaemon.getRateLimitStatus().isPaused to verify.
  async startWorkerOnTask(
    taskId: ElementId,
    agentId: EntityId,
    options: StartWorkerOnTaskOptions = {}
  ): Promise<StartWorkerOnTaskResult> {
    const startedAt = createTimestamp();

    // 1. Get agent info to verify it's a worker
    const agent = await this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const agentMeta = (agent.metadata as { agent?: { agentRole?: AgentRole } })?.agent;
    if (agentMeta?.agentRole !== 'worker') {
      throw new Error(`Agent ${agentId} is not a worker (role: ${agentMeta?.agentRole})`);
    }

    // 2. Get task info
    const task = await this.api.get<Task>(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // 3. Create worktree if enabled and not skipped
    let worktreeResult: CreateWorktreeResult | undefined;
    let workingDirectory: string | undefined = options.workingDirectory;
    let branch: string | undefined = options.branch;
    let worktreePath: string | undefined = options.worktreePath;

    if (this.worktreeManager && !options.skipWorktree) {
      worktreeResult = await this.worktreeManager.createWorktree({
        agentName: agent.name ?? `agent-${agentId.substring(0, 8)}`,
        taskId,
        taskTitle: task.title,
        customBranch: options.branch,
        customPath: options.worktreePath,
        baseBranch: options.baseBranch,
      });
      workingDirectory = worktreeResult.path;
      branch = worktreeResult.branch;
      worktreePath = worktreeResult.path;
    }

    // 4. Dispatch the task (assigns + notifies)
    const dispatchOptions: DispatchOptions = {
      branch,
      worktree: worktreePath,
      priority: options.priority,
      markAsStarted: true,
      dispatchedBy: options.performedBy,
    };
    const dispatchResult = await this.dispatchService.dispatch(
      taskId,
      agentId,
      dispatchOptions
    );

    // 5. Build task context prompt
    const taskContextPrompt = await this.buildTaskContextPrompt(
      taskId,
      agentId,
      options.additionalPrompt
    );

    // 6. Start the worker session in the worktree
    const { session } = await this.sessionManager.startSession(agentId, {
      workingDirectory,
      worktree: worktreePath,
      initialPrompt: taskContextPrompt,
      interactive: false, // Workers are typically headless
    });

    // 7. Update task with session ID
    await this.taskAssignment.updateSessionId(taskId, session.id);

    return {
      task: dispatchResult.task,
      agent,
      dispatch: dispatchResult,
      worktree: worktreeResult,
      session,
      taskContextPrompt,
      startedAt,
    };
  }

  async completeTask(
    taskId: ElementId,
    options: CompleteTaskOptions = {}
  ): Promise<CompleteTaskResult> {
    const completedAt = createTimestamp();

    // 1. Get task to verify it exists and is in progress
    const task = await this.api.get<Task>(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // 2. Mark the task as completed using TaskAssignmentService
    const completeResult = await this.taskAssignment.completeTask(taskId, {
      summary: options.summary,
      commitHash: options.commitHash,
    });

    // 3. Get worktree info if applicable
    let worktree: WorktreeInfo | undefined;
    const orchestratorMeta = (completeResult.task.metadata as {
      orchestrator?: { worktree?: string };
    })?.orchestrator;

    if (this.worktreeManager && orchestratorMeta?.worktree) {
      worktree = await this.worktreeManager.getWorktree(orchestratorMeta.worktree);
    }

    // 4. The task is now ready for merge (merge status set to 'pending' by completeTask)
    return {
      task: completeResult.task,
      worktree,
      readyForMerge: true,
      completedAt,
    };
  }

  // ----------------------------------------
  // Task Context
  // ----------------------------------------

  async buildTaskContextPrompt(
    taskId: ElementId,
    workerId: EntityId,
    additionalInstructions?: string
  ): Promise<string> {
    const context = await this.getTaskContext(taskId);

    const lines: string[] = [
      '# Task Assignment',
      '',
      `**Worker ID:** ${workerId}`,
      `**Task ID:** ${context.taskId}`,
      `**Title:** ${context.title}`,
    ];

    if (context.description) {
      lines.push('', '## Description', '', context.description);
    }

    if (context.priority) {
      lines.push(`**Priority:** ${context.priority}`);
    }

    if (context.complexity) {
      lines.push(`**Complexity:** ${context.complexity}`);
    }

    if (context.tags.length > 0) {
      lines.push(`**Tags:** ${context.tags.join(', ')}`);
    }

    if (context.branch) {
      lines.push('', '## Git Information', '');
      lines.push(`**Branch:** ${context.branch}`);
      if (context.worktreePath) {
        lines.push(`**Working Directory:** ${context.worktreePath}`);
      }
    }

    lines.push('', '## Instructions', '');
    lines.push(
      '1. Work on this task in the current working directory.',
      '2. Make commits as you progress (use clear commit messages).',
      '3. When complete, use the stoneforge CLI to close the task:',
      '   `sf task close ' + context.taskId + '`',
      '4. The Merge Steward will then review and merge your changes.'
    );

    if (additionalInstructions || context.additionalInstructions) {
      lines.push(
        '',
        '## Additional Instructions',
        '',
        additionalInstructions || context.additionalInstructions || ''
      );
    }

    return lines.join('\n');
  }

  async getTaskContext(taskId: ElementId): Promise<TaskContext> {
    const task = await this.api.get<Task>(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const metadata = task.metadata as {
      description?: string;
      orchestrator?: {
        branch?: string;
        worktree?: string;
      };
    };

    return {
      taskId,
      title: task.title,
      description: metadata?.description,
      tags: task.tags ?? [],
      priority: task.priority,
      complexity: task.complexity,
      branch: metadata?.orchestrator?.branch,
      worktreePath: metadata?.orchestrator?.worktree,
    };
  }

  // ----------------------------------------
  // Cleanup
  // ----------------------------------------

  async cleanupTask(taskId: ElementId, deleteBranch = false): Promise<boolean> {
    // Get task to find worktree info
    const task = await this.api.get<Task>(taskId);
    if (!task) {
      return false;
    }

    const orchestratorMeta = (task.metadata as {
      orchestrator?: { worktree?: string };
    })?.orchestrator;

    if (!orchestratorMeta?.worktree) {
      // No worktree to clean up
      return true;
    }

    if (!this.worktreeManager) {
      // Worktree manager not available
      return false;
    }

    try {
      await this.worktreeManager.removeWorktree(orchestratorMeta.worktree, {
        deleteBranch,
        force: false,
      });
      return true;
    } catch {
      // Worktree removal failed
      return false;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a WorkerTaskService instance
 */
export function createWorkerTaskService(
  api: QuarryAPI,
  taskAssignment: TaskAssignmentService,
  agentRegistry: AgentRegistry,
  dispatchService: DispatchService,
  spawnerService: SpawnerService,
  sessionManager: SessionManager,
  worktreeManager?: WorktreeManager
): WorkerTaskService {
  return new WorkerTaskServiceImpl(
    api,
    taskAssignment,
    agentRegistry,
    dispatchService,
    spawnerService,
    sessionManager,
    worktreeManager
  );
}
