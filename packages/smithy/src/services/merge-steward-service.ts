/**
 * Merge Steward Service
 *
 * This service implements the auto-merge functionality for the orchestration system.
 * The Merge Steward detects completed tasks and merges their branches.
 *
 * Key features:
 * - Detect tasks with mergeStatus 'pending'
 * - Run tests on the task's branch
 * - Auto-merge if tests pass
 * - Create fix tasks if tests fail
 * - Handle merge conflicts
 * - Clean up worktrees after successful merge
 *
 * TB-O21: Merge Steward Auto-Merge
 *
 * @module
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  Task,
  ElementId,
  EntityId,
  Timestamp,
} from '@stoneforge/core';
import { createTimestamp, TaskStatus, createTask } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';

import type {
  OrchestratorTaskMeta,
  MergeStatus,
  TestResult,
} from '../types/index.js';
import {
  updateOrchestratorTaskMeta,
  getOrchestratorTaskMeta,
} from '../types/index.js';
import type { TaskAssignmentService, TaskAssignment } from './task-assignment-service.js';
import type { DispatchService } from './dispatch-service.js';
import type { WorktreeManager } from '../git/worktree-manager.js';
import { mergeBranch, syncLocalBranch, hasRemote, detectTargetBranch } from '../git/merge.js';
import type { AgentRegistry } from './agent-registry.js';
import { createLogger } from '../utils/logger.js';
import type { OperationLogService } from './operation-log-service.js';

const logger = createLogger('merge-steward');

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * Error thrown when an optimistic locking conflict is detected during
 * a merge status transition. This indicates another steward instance
 * has already claimed the task.
 */
export class MergeStatusConflictError extends Error {
  readonly expectedStatus: MergeStatus;
  readonly actualStatus: MergeStatus | undefined;
  readonly taskId: string;

  constructor(taskId: string, expectedStatus: MergeStatus, actualStatus: MergeStatus | undefined) {
    super(
      `Merge status conflict on task ${taskId}: expected '${expectedStatus}' but found '${actualStatus ?? 'undefined'}'`
    );
    this.name = 'MergeStatusConflictError';
    this.taskId = taskId;
    this.expectedStatus = expectedStatus;
    this.actualStatus = actualStatus;
  }
}

/**
 * Merge strategy for combining branches
 */
export type MergeStrategy = 'squash' | 'merge';

/**
 * Configuration for the Merge Steward service
 */
export interface MergeStewardConfig {
  /** Workspace root directory (where git repo is) */
  readonly workspaceRoot: string;
  /** Test command to run (defaults to 'npm test') */
  readonly testCommand?: string;
  /** Timeout for test execution in ms (defaults to 5 minutes) */
  readonly testTimeoutMs?: number;
  /** Whether to auto-merge when tests pass (defaults to true) */
  readonly autoMerge?: boolean;
  /** Whether to auto-cleanup worktree after merge (defaults to true) */
  readonly autoCleanup?: boolean;
  /** Whether to delete branch after merge (defaults to true) */
  readonly deleteBranchAfterMerge?: boolean;
  /** Default branch to merge into (defaults to auto-detect) */
  readonly targetBranch?: string;
  /** Entity ID of the steward for creating tasks */
  readonly stewardEntityId?: EntityId;
  /** Merge strategy: 'squash' (default) or 'merge' */
  readonly mergeStrategy?: MergeStrategy;
  /** Whether to auto-push to remote after successful merge (defaults to true) */
  readonly autoPushAfterMerge?: boolean;
}

/**
 * Options for processing a task for merge
 */
export interface ProcessTaskOptions {
  /** Skip test execution */
  skipTests?: boolean;
  /** Force merge even if there are minor issues */
  forceMerge?: boolean;
  /** Custom commit message for the merge */
  mergeCommitMessage?: string;
  /** Entity performing the operation */
  performedBy?: EntityId;
}

/**
 * Result of processing a task for merge
 */
export interface MergeProcessResult {
  /** The task ID */
  taskId: ElementId;
  /** The final merge status. 'skipped' indicates another steward already claimed the task. */
  status: MergeStatus | 'skipped';
  /** Whether the task was successfully merged */
  merged: boolean;
  /** Test result if tests were run */
  testResult?: TestResult;
  /** Merge commit hash if merged */
  mergeCommitHash?: string;
  /** If a fix task was created, its ID */
  fixTaskId?: ElementId;
  /** Error message if processing failed */
  error?: string;
  /** Timestamp when processing completed */
  processedAt: Timestamp;
}

/**
 * Result of running tests on a branch
 */
export interface TestRunResult {
  /** Whether tests passed */
  passed: boolean;
  /** Full test output */
  output: string;
  /** Exit code from test command */
  exitCode: number;
  /** Duration of test run in ms */
  durationMs: number;
  /** Parsed test result if available */
  testResult: TestResult;
}

/**
 * Result of attempting a merge
 */
export interface MergeAttemptResult {
  /** Whether merge succeeded */
  success: boolean;
  /** Merge commit hash if successful */
  commitHash?: string;
  /** Whether there was a conflict */
  hasConflict: boolean;
  /** Error message if merge failed */
  error?: string;
  /** Files with conflicts if any */
  conflictFiles?: string[];
  /** Whether the source branch was already fully merged (zero commits ahead) */
  alreadyMerged?: boolean;
}

/**
 * Options for creating a fix task
 */
export interface CreateFixTaskOptions {
  /** Type of fix needed */
  type: 'test_failure' | 'merge_conflict' | 'general';
  /** Error message or details about what needs fixing */
  errorDetails: string;
  /** File paths involved (for conflicts) */
  affectedFiles?: string[];
}

/**
 * Batch processing result
 */
export interface BatchProcessResult {
  /** Total tasks processed */
  totalProcessed: number;
  /** Tasks successfully merged */
  mergedCount: number;
  /** Tasks where tests failed */
  testFailedCount: number;
  /** Tasks with merge conflicts */
  conflictCount: number;
  /** Tasks that failed for other reasons */
  errorCount: number;
  /** Individual results */
  results: MergeProcessResult[];
  /** Processing duration in ms */
  durationMs: number;
}

// ============================================================================
// Merge Steward Service Interface
// ============================================================================

/**
 * Merge Steward Service interface for auto-merging completed task branches.
 *
 * The service provides methods for:
 * - Detecting tasks awaiting merge
 * - Running tests on branches
 * - Merging branches to main
 * - Creating fix tasks when tests fail
 * - Cleaning up worktrees after merge
 */
export interface MergeStewardService {
  // ----------------------------------------
  // Task Discovery
  // ----------------------------------------

  /**
   * Gets all tasks that are ready for merge processing.
   *
   * This returns tasks with mergeStatus 'pending' (completed, awaiting merge).
   *
   * @returns Array of tasks awaiting merge
   */
  getTasksAwaitingMerge(): Promise<TaskAssignment[]>;

  // ----------------------------------------
  // Merge Processing
  // ----------------------------------------

  /**
   * Processes a single task for merge.
   *
   * This method:
   * 1. Runs tests on the task's branch
   * 2. If tests pass, merges the branch
   * 3. If tests fail, creates a fix task
   * 4. Updates task metadata with result
   * 5. Cleans up worktree if successful
   *
   * @param taskId - The task to process
   * @param options - Processing options
   * @returns The processing result
   */
  processTask(
    taskId: ElementId,
    options?: ProcessTaskOptions
  ): Promise<MergeProcessResult>;

  /**
   * Processes all tasks awaiting merge.
   *
   * @param options - Processing options
   * @returns Batch processing result
   */
  processAllPending(options?: ProcessTaskOptions): Promise<BatchProcessResult>;

  // ----------------------------------------
  // Individual Operations
  // ----------------------------------------

  /**
   * Runs tests on a task's branch.
   *
   * @param taskId - The task whose branch to test
   * @returns Test run result
   */
  runTests(taskId: ElementId): Promise<TestRunResult>;

  /**
   * Attempts to merge a task's branch to main.
   *
   * @param taskId - The task whose branch to merge
   * @param commitMessage - Custom merge commit message
   * @returns Merge attempt result
   */
  attemptMerge(taskId: ElementId, commitMessage?: string): Promise<MergeAttemptResult>;

  /**
   * Creates a fix task for a failed merge or test.
   *
   * @param originalTaskId - The original task that failed
   * @param options - Fix task options
   * @returns The created fix task ID
   */
  createFixTask(
    originalTaskId: ElementId,
    options: CreateFixTaskOptions
  ): Promise<ElementId>;

  /**
   * Cleans up a task's worktree after successful merge.
   *
   * @param taskId - The task to clean up
   * @param deleteBranch - Whether to delete the branch
   * @returns Success status
   */
  cleanupAfterMerge(taskId: ElementId, deleteBranch?: boolean): Promise<boolean>;

  // ----------------------------------------
  // Status Updates
  // ----------------------------------------

  /**
   * Updates the merge status of a task.
   *
   * When `expectedCurrentStatus` is provided, the method performs an optimistic
   * locking check: it reads the current mergeStatus and throws a
   * `MergeStatusConflictError` if it doesn't match the expected value. This
   * prevents concurrent steward instances from racing through the same
   * status transition.
   *
   * @param taskId - The task to update
   * @param status - The new merge status
   * @param details - Optional details (e.g., failure reason)
   * @param expectedCurrentStatus - If provided, the current mergeStatus must match this value
   * @returns The updated task
   * @throws {MergeStatusConflictError} If expectedCurrentStatus doesn't match actual status
   */
  updateMergeStatus(
    taskId: ElementId,
    status: MergeStatus,
    details?: { failureReason?: string; testResult?: TestResult },
    expectedCurrentStatus?: MergeStatus
  ): Promise<Task>;
}

// ============================================================================
// Merge Steward Service Implementation
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  testCommand: 'npm test',
  testTimeoutMs: 5 * 60 * 1000, // 5 minutes
  autoMerge: true,
  autoCleanup: true,
  deleteBranchAfterMerge: true,
  mergeStrategy: 'squash' as MergeStrategy,
  autoPushAfterMerge: true,
} as const;

/**
 * Implementation of the Merge Steward Service.
 */
export class MergeStewardServiceImpl implements MergeStewardService {
  private readonly api: QuarryAPI;
  private readonly config: Required<Omit<MergeStewardConfig, 'targetBranch' | 'stewardEntityId'>> &
    Pick<MergeStewardConfig, 'targetBranch' | 'stewardEntityId'>;
  private readonly taskAssignment: TaskAssignmentService;
  private readonly dispatchService: DispatchService;
  private readonly worktreeManager: WorktreeManager | undefined;
  private readonly agentRegistry: AgentRegistry;
  private readonly operationLog: OperationLogService | undefined;
  private targetBranch: string | undefined;

  constructor(
    api: QuarryAPI,
    taskAssignment: TaskAssignmentService,
    dispatchService: DispatchService,
    agentRegistry: AgentRegistry,
    config: MergeStewardConfig,
    worktreeManager?: WorktreeManager,
    operationLog?: OperationLogService
  ) {
    this.api = api;
    this.taskAssignment = taskAssignment;
    this.dispatchService = dispatchService;
    this.agentRegistry = agentRegistry;
    this.worktreeManager = worktreeManager;
    this.operationLog = operationLog;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  // ----------------------------------------
  // Task Discovery
  // ----------------------------------------

  async getTasksAwaitingMerge(): Promise<TaskAssignment[]> {
    // Query for tasks in REVIEW status with pending/testing merge status
    // TaskAssignmentService.getTasksAwaitingMerge() now handles this correctly
    return this.taskAssignment.getTasksAwaitingMerge();
  }

  // ----------------------------------------
  // Merge Processing
  // ----------------------------------------

  async processTask(
    taskId: ElementId,
    options: ProcessTaskOptions = {}
  ): Promise<MergeProcessResult> {
    const processedAt = createTimestamp();

    try {
      // 1. Get and validate task
      const task = await this.api.get<Task>(taskId);
      if (!task) {
        return {
          taskId,
          status: 'failed',
          merged: false,
          error: `Task not found: ${taskId}`,
          processedAt,
        };
      }

      const orchestratorMeta = getOrchestratorTaskMeta(
        task.metadata as Record<string, unknown>
      );
      if (!orchestratorMeta?.branch) {
        return {
          taskId,
          status: 'failed',
          merged: false,
          error: 'Task has no branch associated',
          processedAt,
        };
      }

      // Early exit: Skip if task is already closed and merged
      // This prevents re-processing of already-merged tasks
      if (task.status === TaskStatus.CLOSED && orchestratorMeta.mergeStatus === 'merged') {
        logger.info(`Task ${taskId} is already closed and merged, skipping`);
        return {
          taskId,
          status: 'merged',
          merged: true,
          processedAt,
        };
      }

      // 2a. Check if the branch has any commits ahead of the target.
      // If the branch is already fully merged (zero commits ahead), there's
      // nothing to test or merge — mark as not_applicable and close the task.
      const branchHasCommits = await this.branchHasCommitsAhead(orchestratorMeta.branch);
      if (!branchHasCommits) {
        logger.info(
          `Task ${taskId} branch "${orchestratorMeta.branch}" has zero commits ahead of target — already merged`
        );
        await this.updateMergeStatus(taskId, 'not_applicable');
        return {
          taskId,
          status: 'not_applicable',
          merged: false,
          processedAt,
        };
      }

      // 2. Run tests (unless skipped)
      let testResult: TestResult | undefined;
      if (!options.skipTests) {
        // Optimistic lock: only transition pending → testing if still pending.
        // If another steward already claimed this task, skip it.
        try {
          await this.updateMergeStatus(taskId, 'testing', undefined, 'pending');
        } catch (error) {
          if (error instanceof MergeStatusConflictError) {
            logger.info(
              `Task ${taskId} skipped: another steward already claimed it (expected 'pending', found '${error.actualStatus}')`
            );
            return {
              taskId,
              status: 'skipped',
              merged: false,
              processedAt,
            };
          }
          throw error;
        }
        const testRunResult = await this.runTests(taskId);
        testResult = testRunResult.testResult;

        if (!testRunResult.passed) {
          // Tests failed - create fix task
          this.operationLog?.write('warn', 'merge', `Tests failed for task ${taskId}`, { taskId, exitCode: testRunResult.exitCode, durationMs: testRunResult.durationMs });
          await this.updateMergeStatus(taskId, 'test_failed', { testResult });

          const fixTaskId = await this.createFixTask(taskId, {
            type: 'test_failure',
            errorDetails: testRunResult.output.substring(0, 2000), // Limit size
          });

          return {
            taskId,
            status: 'test_failed',
            merged: false,
            testResult,
            fixTaskId,
            processedAt,
          };
        }
      }

      // 3. Attempt merge (unless auto-merge disabled)
      if (!this.config.autoMerge && !options.forceMerge) {
        // Just update status to indicate tests passed
        await this.updateMergeStatus(taskId, 'pending', { testResult });
        return {
          taskId,
          status: 'pending',
          merged: false,
          testResult,
          processedAt,
        };
      }

      // When tests were skipped, use optimistic lock for pending → merging
      // to prevent two stewards from racing into the merge phase.
      if (options.skipTests) {
        try {
          await this.updateMergeStatus(taskId, 'merging', undefined, 'pending');
        } catch (error) {
          if (error instanceof MergeStatusConflictError) {
            logger.info(
              `Task ${taskId} skipped: another steward already claimed it for merging (expected 'pending', found '${error.actualStatus}')`
            );
            return {
              taskId,
              status: 'skipped',
              merged: false,
              processedAt,
            };
          }
          throw error;
        }
      } else {
        await this.updateMergeStatus(taskId, 'merging');
      }
      const mergeResult = await this.attemptMerge(taskId, options.mergeCommitMessage);

      // Handle already-merged result from mergeBranch() — secondary safety net
      // in case the early branchHasCommitsAhead check didn't trigger (e.g. race)
      if (mergeResult.alreadyMerged) {
        logger.info(`Task ${taskId} branch already merged (detected during merge attempt)`);
        await this.updateMergeStatus(taskId, 'not_applicable');
        return {
          taskId,
          status: 'not_applicable',
          merged: false,
          testResult,
          processedAt,
        };
      }

      if (!mergeResult.success) {
        if (mergeResult.hasConflict) {
          // Merge conflict - create fix task
          this.operationLog?.write('warn', 'merge', `Merge conflict for task ${taskId}`, { taskId, conflictFiles: mergeResult.conflictFiles });
          await this.updateMergeStatus(taskId, 'conflict', {
            failureReason: `Merge conflict in: ${mergeResult.conflictFiles?.join(', ') ?? 'unknown files'}`,
          });

          const fixTaskId = await this.createFixTask(taskId, {
            type: 'merge_conflict',
            errorDetails: mergeResult.error ?? 'Merge conflict detected',
            affectedFiles: mergeResult.conflictFiles,
          });

          return {
            taskId,
            status: 'conflict',
            merged: false,
            testResult,
            fixTaskId,
            error: mergeResult.error,
            processedAt,
          };
        } else {
          // Other merge failure
          this.operationLog?.write('error', 'merge', `Merge failed for task ${taskId}: ${mergeResult.error}`, { taskId });
          await this.updateMergeStatus(taskId, 'failed', {
            failureReason: mergeResult.error,
          });

          return {
            taskId,
            status: 'failed',
            merged: false,
            testResult,
            error: mergeResult.error,
            processedAt,
          };
        }
      }

      // 4. Merge succeeded - update status and cleanup
      this.operationLog?.write('info', 'merge', `Task ${taskId} merged successfully`, { taskId, commitHash: mergeResult.commitHash });
      await this.updateMergeStatus(taskId, 'merged', { testResult });

      // 5. Cleanup worktree if auto-cleanup enabled
      if (this.config.autoCleanup) {
        await this.cleanupAfterMerge(taskId, this.config.deleteBranchAfterMerge);
      }

      // 6. Sync local target branch (best-effort, after all bookkeeping)
      const targetBranch = await this.getTargetBranch();
      const remoteExists = await hasRemote(this.config.workspaceRoot);
      if (remoteExists) {
        try {
          await execAsync('git fetch origin', { cwd: this.config.workspaceRoot, encoding: 'utf8' });
        } catch { /* best-effort */ }
        await syncLocalBranch(this.config.workspaceRoot, targetBranch);
      }
      // In local-only mode, syncLocalBranch is handled by mergeBranch() itself

      return {
        taskId,
        status: 'merged',
        merged: true,
        testResult,
        mergeCommitHash: mergeResult.commitHash,
        processedAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.operationLog?.write('error', 'merge', `Merge processing error for task ${taskId}: ${errorMessage}`, { taskId });
      await this.updateMergeStatus(taskId, 'failed', {
        failureReason: errorMessage,
      });

      return {
        taskId,
        status: 'failed',
        merged: false,
        error: errorMessage,
        processedAt,
      };
    }
  }

  async processAllPending(
    options: ProcessTaskOptions = {}
  ): Promise<BatchProcessResult> {
    const startTime = Date.now();
    const tasks = await this.getTasksAwaitingMerge();
    const results: MergeProcessResult[] = [];

    let mergedCount = 0;
    let testFailedCount = 0;
    let conflictCount = 0;
    let errorCount = 0;

    for (const { taskId } of tasks) {
      const result = await this.processTask(taskId, options);
      results.push(result);

      switch (result.status) {
        case 'merged':
          mergedCount++;
          break;
        case 'test_failed':
          testFailedCount++;
          break;
        case 'conflict':
          conflictCount++;
          break;
        case 'failed':
          errorCount++;
          break;
        case 'skipped':
          // Another steward already claimed this task — not an error
          break;
      }
    }

    return {
      totalProcessed: tasks.length,
      mergedCount,
      testFailedCount,
      conflictCount,
      errorCount,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  // ----------------------------------------
  // Individual Operations
  // ----------------------------------------

  async runTests(taskId: ElementId): Promise<TestRunResult> {
    const startTime = Date.now();

    // Get task and worktree info
    const task = await this.api.get<Task>(taskId);
    if (!task) {
      return {
        passed: false,
        output: `Task not found: ${taskId}`,
        exitCode: 1,
        durationMs: 0,
        testResult: {
          passed: false,
          completedAt: createTimestamp(),
          errorMessage: `Task not found: ${taskId}`,
        },
      };
    }

    const orchestratorMeta = getOrchestratorTaskMeta(
      task.metadata as Record<string, unknown>
    );

    // Determine working directory
    let cwd = this.config.workspaceRoot;
    if (orchestratorMeta?.worktree && this.worktreeManager) {
      const worktree = await this.worktreeManager.getWorktree(orchestratorMeta.worktree);
      if (worktree) {
        cwd = worktree.path;
      } else {
        logger.warn(`Worktree not found for task ${taskId}, falling back to main repo`);
      }
    } else {
      logger.warn(`No worktree configured for task ${taskId}, running tests in main repo`);
    }

    try {
      const { stdout, stderr } = await execAsync(this.config.testCommand, {
        cwd,
        timeout: this.config.testTimeoutMs,
        encoding: 'utf8',
      });

      const durationMs = Date.now() - startTime;
      const output = stdout + (stderr ? `\n${stderr}` : '');

      return {
        passed: true,
        output,
        exitCode: 0,
        durationMs,
        testResult: {
          passed: true,
          completedAt: createTimestamp(),
          durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const execError = error as { stdout?: string; stderr?: string; code?: number; message?: string };
      const output = (execError.stdout ?? '') + (execError.stderr ?? '') + (execError.message ?? '');
      const exitCode = execError.code ?? 1;

      return {
        passed: false,
        output,
        exitCode,
        durationMs,
        testResult: {
          passed: false,
          completedAt: createTimestamp(),
          durationMs,
          errorMessage: output.substring(0, 500), // Truncate for storage
        },
      };
    }
  }

  async attemptMerge(
    taskId: ElementId,
    commitMessage?: string
  ): Promise<MergeAttemptResult> {
    // Get task info
    const task = await this.api.get<Task>(taskId);
    if (!task) {
      return {
        success: false,
        hasConflict: false,
        error: `Task not found: ${taskId}`,
      };
    }

    const orchestratorMeta = getOrchestratorTaskMeta(
      task.metadata as Record<string, unknown>
    );
    if (!orchestratorMeta?.branch) {
      return {
        success: false,
        hasConflict: false,
        error: 'Task has no branch associated',
      };
    }

    const targetBranch = await this.getTargetBranch();
    const sourceBranch = orchestratorMeta.branch;

    const defaultMessage = this.config.mergeStrategy === 'squash'
      ? `${task.title} (${taskId})`
      : `Merge branch '${sourceBranch}' (Task: ${taskId})`;

    return mergeBranch({
      workspaceRoot: this.config.workspaceRoot,
      sourceBranch,
      targetBranch,
      mergeStrategy: this.config.mergeStrategy,
      autoPush: this.config.autoPushAfterMerge,
      commitMessage: commitMessage ?? defaultMessage,
      preflight: true,
      syncLocal: false,
    });
  }

  async createFixTask(
    originalTaskId: ElementId,
    options: CreateFixTaskOptions
  ): Promise<ElementId> {
    // Get original task info
    const originalTask = await this.api.get<Task>(originalTaskId);
    if (!originalTask) {
      throw new Error(`Original task not found: ${originalTaskId}`);
    }

    const orchestratorMeta = getOrchestratorTaskMeta(
      originalTask.metadata as Record<string, unknown>
    );

    // Check if a fix task already exists for this original task and fix type
    // This prevents creating duplicate fix tasks when tests fail repeatedly
    const existingFixTasks = await this.findExistingFixTasks(originalTaskId, options.type);
    if (existingFixTasks.length > 0) {
      // Return the existing fix task ID instead of creating a duplicate
      logger.info(
        `Fix task already exists for ${originalTaskId} (type: ${options.type}): ${existingFixTasks[0].id}`
      );
      return existingFixTasks[0].id;
    }

    // Determine title based on fix type
    let title: string;
    switch (options.type) {
      case 'test_failure':
        title = `Fix failing tests: ${originalTask.title}`;
        break;
      case 'merge_conflict':
        title = `Resolve merge conflict: ${originalTask.title}`;
        break;
      default:
        title = `Fix: ${originalTask.title}`;
    }

    // Build description
    const lines = [
      `This task was created by the Merge Steward to fix issues with task ${originalTaskId}.`,
      '',
      `## Issue Type`,
      options.type === 'test_failure' ? 'Test failures' :
        options.type === 'merge_conflict' ? 'Merge conflict' : 'General issue',
      '',
      `## Details`,
      options.errorDetails,
    ];

    if (options.affectedFiles && options.affectedFiles.length > 0) {
      lines.push('', '## Affected Files', ...options.affectedFiles.map((f) => `- ${f}`));
    }

    lines.push(
      '',
      '## Instructions',
      '1. Fix the issue(s) described above',
      '2. Run tests to verify: `npm test`',
      `3. Close the task: \`sf task close <task-id>\``,
      '',
      'The Merge Steward will automatically attempt to merge again.',
    );

    // Create the fix task
    const createdBy = this.config.stewardEntityId ?? originalTask.createdBy;
    const fixTaskData = await createTask({
      title,
      status: TaskStatus.OPEN,
      tags: ['fix', options.type, 'auto-created'],
      priority: originalTask.priority,
      complexity: originalTask.complexity,
      assignee: orchestratorMeta?.assignedAgent,
      createdBy,
      metadata: {
        description: lines.join('\n'),
        orchestrator: {
          branch: orchestratorMeta?.branch,
          worktree: orchestratorMeta?.worktree,
          assignedAgent: orchestratorMeta?.assignedAgent,
          mergeStatus: 'pending',
        },
        originalTaskId,
        fixType: options.type,
      },
    });

    // Save the task to the database
    const fixTask = await this.api.create<Task>(
      fixTaskData as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    // If there's an assigned agent, notify them
    if (orchestratorMeta?.assignedAgent) {
      const agentChannel = await this.agentRegistry.getAgentChannel(
        orchestratorMeta.assignedAgent
      );
      if (agentChannel) {
        // Create a notification document
        const notificationContent = [
          `# Fix Task Created: ${fixTask.id}`,
          '',
          `A fix task has been created for: ${originalTask.title}`,
          '',
          `**Issue:** ${options.type === 'test_failure' ? 'Tests are failing' : 'Merge conflict detected'}`,
          '',
          'Please review and fix the issue, then close the task.',
        ].join('\n');

        await this.dispatchService.notifyAgent(
          orchestratorMeta.assignedAgent,
          'task-assignment',
          notificationContent,
          {
            fixTaskId: fixTask.id,
            originalTaskId,
            fixType: options.type,
          }
        );
      }
    }

    return fixTask.id;
  }

  async cleanupAfterMerge(
    taskId: ElementId,
    deleteBranch = true
  ): Promise<boolean> {
    if (!this.worktreeManager) {
      return true; // No worktree manager, nothing to clean up
    }

    const task = await this.api.get<Task>(taskId);
    if (!task) {
      return false;
    }

    const orchestratorMeta = getOrchestratorTaskMeta(
      task.metadata as Record<string, unknown>
    );
    if (!orchestratorMeta?.worktree) {
      return true; // No worktree to clean up
    }

    try {
      // Only attempt remote branch deletion when a remote actually exists
      const remoteExists = await hasRemote(this.config.workspaceRoot);
      await this.worktreeManager.removeWorktree(orchestratorMeta.worktree, {
        deleteBranch,
        deleteRemoteBranch: deleteBranch && remoteExists,
        force: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ----------------------------------------
  // Status Updates
  // ----------------------------------------

  async updateMergeStatus(
    taskId: ElementId,
    status: MergeStatus,
    details?: { failureReason?: string; testResult?: TestResult },
    expectedCurrentStatus?: MergeStatus
  ): Promise<Task> {
    const task = await this.api.get<Task>(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Optimistic locking: if expectedCurrentStatus is provided, verify the
    // task's current mergeStatus matches before proceeding with the update.
    if (expectedCurrentStatus !== undefined) {
      const currentMeta = getOrchestratorTaskMeta(
        task.metadata as Record<string, unknown>
      );
      const currentStatus = currentMeta?.mergeStatus;
      if (currentStatus !== expectedCurrentStatus) {
        throw new MergeStatusConflictError(taskId, expectedCurrentStatus, currentStatus);
      }
    }

    const updates: Partial<OrchestratorTaskMeta> = {
      mergeStatus: status,
    };

    if (status === 'merged') {
      (updates as { mergedAt: Timestamp }).mergedAt = createTimestamp();
    }

    if (details?.failureReason) {
      (updates as { mergeFailureReason: string }).mergeFailureReason = details.failureReason;
    }

    if (details?.testResult) {
      const existingMeta = getOrchestratorTaskMeta(
        task.metadata as Record<string, unknown>
      );
      (updates as { lastTestResult: TestResult }).lastTestResult = details.testResult;
      (updates as { testRunCount: number }).testRunCount = (existingMeta?.testRunCount ?? 0) + 1;
    }

    const newMetadata = updateOrchestratorTaskMeta(
      task.metadata as Record<string, unknown>,
      updates
    );

    // When merge succeeds or is not applicable, transition task from REVIEW to CLOSED
    // This unblocks dependent tasks via the blocked cache
    const taskUpdates: Partial<Task> & { metadata: Record<string, unknown> } = { metadata: newMetadata };
    if (status === 'merged' || status === 'not_applicable') {
      taskUpdates.status = TaskStatus.CLOSED;
      taskUpdates.closedAt = createTimestamp();
      taskUpdates.assignee = undefined;
    }

    return this.api.update<Task>(taskId, taskUpdates);
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Finds existing fix tasks for a given original task and fix type.
   * This prevents creating duplicate fix tasks when tests fail repeatedly.
   */
  private async findExistingFixTasks(
    originalTaskId: ElementId,
    fixType: 'test_failure' | 'merge_conflict' | 'general'
  ): Promise<Task[]> {
    // Query for all tasks with the 'fix' tag
    const allTasks = await this.api.list<Task>({
      type: 'task' as const,
      tags: ['fix'],
    });

    // Filter for tasks that:
    // 1. Have metadata.originalTaskId matching our original task
    // 2. Have metadata.fixType matching the requested fix type
    // 3. Are not closed (still relevant)
    const activeStatuses: TaskStatus[] = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.REVIEW];
    return allTasks.filter((task) => {
      const meta = task.metadata as Record<string, unknown> | undefined;
      return (
        meta?.originalTaskId === originalTaskId &&
        meta?.fixType === fixType &&
        activeStatuses.includes(task.status)
      );
    });
  }

  /**
   * Checks whether a branch has any commits ahead of the target branch.
   * Returns true if there are commits to merge, false if the branch is
   * already fully merged (zero commits ahead).
   */
  private async branchHasCommitsAhead(sourceBranch: string): Promise<boolean> {
    const targetBranch = await this.getTargetBranch();
    const remoteExists = await hasRemote(this.config.workspaceRoot);

    try {
      // When remote exists, fetch first and compare remote refs
      if (remoteExists) {
        await execAsync('git fetch origin', {
          cwd: this.config.workspaceRoot,
          encoding: 'utf8',
        });
        const targetRef = `origin/${targetBranch}`;
        const sourceRef = `origin/${sourceBranch}`;
        const { stdout } = await execAsync(
          `git rev-list --count ${targetRef}..${sourceRef}`,
          { cwd: this.config.workspaceRoot, encoding: 'utf8' }
        );
        return parseInt(stdout.trim(), 10) > 0;
      }

      // Local-only: compare local refs
      const { stdout } = await execAsync(
        `git rev-list --count ${targetBranch}..${sourceBranch}`,
        { cwd: this.config.workspaceRoot, encoding: 'utf8' }
      );
      return parseInt(stdout.trim(), 10) > 0;
    } catch {
      // If we can't determine, assume there are commits to merge
      // and let the normal merge flow handle errors
      return true;
    }
  }

  private async getTargetBranch(): Promise<string> {
    if (this.targetBranch) {
      return this.targetBranch;
    }

    // Delegate to the canonical detectTargetBranch(), passing config value
    this.targetBranch = await detectTargetBranch(
      this.config.workspaceRoot,
      this.config.targetBranch
    );
    return this.targetBranch;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a MergeStewardService instance
 */
export function createMergeStewardService(
  api: QuarryAPI,
  taskAssignment: TaskAssignmentService,
  dispatchService: DispatchService,
  agentRegistry: AgentRegistry,
  config: MergeStewardConfig,
  worktreeManager?: WorktreeManager,
  operationLog?: OperationLogService
): MergeStewardService {
  return new MergeStewardServiceImpl(
    api,
    taskAssignment,
    dispatchService,
    agentRegistry,
    config,
    worktreeManager,
    operationLog
  );
}
