/**
 * Task Assignment Service
 *
 * This service provides task assignment functionality for the orchestration system.
 * It manages the assignment of tasks to agents with orchestrator metadata tracking
 * including branch, worktree, and session associations.
 *
 * Key features:
 * - Assign tasks to agents with orchestrator metadata
 * - Query agent workload (tasks assigned to an agent)
 * - Query unassigned tasks
 * - Query tasks by assignment status
 * - Track branch, worktree, sessionId in task metadata
 *
 * @module
 */

import type { Task, ElementId, EntityId, Document } from '@stoneforge/core';
import { createTimestamp, TaskStatus, ElementType, ConflictError, ConflictErrorCode, asElementId } from '@stoneforge/core';

// Use type alias for TaskStatus values
type TaskStatusValue = typeof TaskStatus[keyof typeof TaskStatus];
import type { QuarryAPI } from '@stoneforge/quarry';
import type { OrchestratorTaskMeta, MergeStatus, HandoffHistoryEntry } from '../types/index.js';
import {
  getOrchestratorTaskMeta,
  setOrchestratorTaskMeta,
  updateOrchestratorTaskMeta,
  closeTaskSessionHistory,
  generateBranchName,
  generateWorktreePath,
  createSlugFromTitle,
} from '../types/index.js';
import {
  type AgentEntity,
  isAgentEntity,
  getAgentMetadata,
} from '../api/orchestrator-api.js';
import type { MergeRequestProvider } from './merge-request-provider.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for assigning a task to an agent
 */
export interface AssignTaskOptions {
  /** Git branch for the task (auto-generated if not provided) */
  branch?: string;
  /** Worktree path for the task (auto-generated if not provided) */
  worktree?: string;
  /** Claude Code session ID */
  sessionId?: string;
  /** Whether to mark the task as started immediately */
  markAsStarted?: boolean;
}

/**
 * Options for completing a task
 */
export interface CompleteTaskOptions {
  /** Summary of what was accomplished */
  summary?: string;
  /** Commit hash for the final commit */
  commitHash?: string;
  /** Whether to create a merge request (default: true if branch exists and provider is set) */
  createMergeRequest?: boolean;
  /** Custom merge request title (defaults to task title) */
  mergeRequestTitle?: string;
  /** Custom merge request body (defaults to task description + summary) */
  mergeRequestBody?: string;
  /** Base branch for merge request (defaults to 'main' or 'master') */
  baseBranch?: string;
}

/**
 * Options for handing off a task
 */
export interface HandoffTaskOptions {
  /** Session ID of the agent handing off */
  sessionId: string;
  /** Handoff message explaining why and providing context */
  message?: string;
  /** Override branch (defaults to current task branch) */
  branch?: string;
  /** Override worktree path (defaults to current task worktree) */
  worktree?: string;
}

/**
 * Result of a task completion with optional merge request info
 */
export interface TaskCompletionResult {
  /** The updated task */
  task: Task;
  /** URL of the created merge request, if applicable */
  mergeRequestUrl?: string;
  /** Merge request identifier, if applicable */
  mergeRequestId?: number;
}

/**
 * A task with its orchestrator metadata
 */
export interface TaskAssignment {
  /** The task ID */
  taskId: ElementId;
  /** The full task object */
  task: Task;
  /** Orchestrator-specific metadata */
  orchestratorMeta: OrchestratorTaskMeta | undefined;
}

/**
 * Filter for listing task assignments
 */
export interface AssignmentFilter {
  /** Filter by assigned agent */
  agentId?: EntityId;
  /** Filter by task status */
  taskStatus?: TaskStatusValue | TaskStatusValue[];
  /** Filter by assignment status */
  assignmentStatus?: AssignmentStatus | AssignmentStatus[];
  /** Filter by merge status */
  mergeStatus?: MergeStatus | MergeStatus[];
}

/**
 * Assignment status categories
 */
export type AssignmentStatus =
  | 'unassigned'   // No agent assigned
  | 'assigned'     // Agent assigned but not started
  | 'in_progress'  // Agent is actively working
  | 'completed'    // Task completed, awaiting merge
  | 'merged';      // Branch merged

/**
 * All valid assignment status values
 */
export const AssignmentStatusValues = [
  'unassigned',
  'assigned',
  'in_progress',
  'completed',
  'merged',
] as const;

/**
 * Summary of an agent's workload
 */
export interface AgentWorkloadSummary {
  /** Agent entity ID */
  agentId: EntityId;
  /** Total tasks assigned */
  totalTasks: number;
  /** Tasks by status */
  byStatus: Record<TaskStatusValue, number>;
  /** Tasks currently in progress */
  inProgressCount: number;
  /** Completed tasks awaiting merge */
  awaitingMergeCount: number;
}

// ============================================================================
// Task Assignment Service Interface
// ============================================================================

/**
 * Task Assignment Service interface for managing task assignments in the orchestration system.
 *
 * The service provides methods for:
 * - Assigning tasks to agents with orchestrator metadata
 * - Querying agent workload
 * - Querying tasks by assignment status
 */
export interface TaskAssignmentService {
  // ----------------------------------------
  // Assignment Operations
  // ----------------------------------------

  /**
   * Assigns a task to an agent with orchestrator metadata.
   *
   * This method:
   * 1. Validates the task and agent exist
   * 2. Sets the task's assignee field
   * 3. Sets orchestrator metadata (branch, worktree, sessionId, etc.)
   * 4. Optionally marks the task as started
   *
   * @param taskId - The task to assign
   * @param agentId - The agent to assign to
   * @param options - Optional assignment options
   * @returns The updated task
   */
  assignToAgent(
    taskId: ElementId,
    agentId: EntityId,
    options?: AssignTaskOptions
  ): Promise<Task>;

  /**
   * Unassigns a task from its current agent.
   *
   * This clears the assignee field and removes agent-specific orchestrator metadata,
   * but preserves branch information for potential reassignment.
   *
   * @param taskId - The task to unassign
   * @returns The updated task
   */
  unassignTask(taskId: ElementId): Promise<Task>;

  /**
   * Marks a task as started by the assigned agent.
   *
   * Sets the task status to IN_PROGRESS and records the start time.
   *
   * @param taskId - The task to start
   * @param sessionId - Optional session ID to associate
   * @returns The updated task
   */
  startTask(taskId: ElementId, sessionId?: string): Promise<Task>;

  /**
   * Marks a task as completed by the assigned agent.
   *
   * Sets the task status to REVIEW (awaiting merge) and records completion time.
   * The merge steward will later set CLOSED after successfully merging the branch.
   * Optionally creates a merge request for the task branch (when a provider is configured).
   *
   * @param taskId - The task to complete
   * @param options - Optional completion options
   * @returns The updated task and optional merge request info
   */
  completeTask(taskId: ElementId, options?: CompleteTaskOptions): Promise<TaskCompletionResult>;

  /**
   * Hands off a task to be picked up by another agent.
   *
   * This method:
   * 1. Preserves branch/worktree reference in task metadata
   * 2. Appends a handoff note to the task description
   * 3. Unassigns the task so it returns to the pool
   *
   * The next agent assigned to this task can continue from the
   * existing branch/worktree state.
   *
   * @param taskId - The task to hand off
   * @param options - Handoff options including session ID and message
   * @returns The updated task
   */
  handoffTask(taskId: ElementId, options: HandoffTaskOptions): Promise<Task>;

  /**
   * Updates the session ID for a task.
   *
   * @param taskId - The task to update
   * @param sessionId - The new session ID
   * @returns The updated task
   */
  updateSessionId(taskId: ElementId, sessionId: string): Promise<Task>;

  // ----------------------------------------
  // Workload Queries
  // ----------------------------------------

  /**
   * Gets all tasks assigned to a specific agent.
   *
   * @param agentId - The agent to query
   * @param filter - Optional filter for task status, etc.
   * @returns Array of task assignments
   */
  getAgentTasks(
    agentId: EntityId,
    filter?: Omit<AssignmentFilter, 'agentId'>
  ): Promise<TaskAssignment[]>;

  /**
   * Gets a summary of an agent's workload.
   *
   * @param agentId - The agent to query
   * @returns Workload summary with counts by status
   */
  getAgentWorkload(agentId: EntityId): Promise<AgentWorkloadSummary>;

  /**
   * Checks if an agent has capacity for more tasks.
   *
   * @param agentId - The agent to check
   * @returns true if the agent can accept more tasks
   */
  agentHasCapacity(agentId: EntityId): Promise<boolean>;

  // ----------------------------------------
  // Task Status Queries
  // ----------------------------------------

  /**
   * Gets all unassigned tasks (tasks without an agent assigned).
   *
   * @param filter - Optional filter for task status, etc.
   * @returns Array of unassigned tasks
   */
  getUnassignedTasks(filter?: Omit<AssignmentFilter, 'agentId' | 'assignmentStatus'>): Promise<Task[]>;

  /**
   * Gets tasks by assignment status.
   *
   * @param status - Assignment status to filter by
   * @param filter - Optional additional filters
   * @returns Array of matching task assignments
   */
  getTasksByAssignmentStatus(
    status: AssignmentStatus,
    filter?: Omit<AssignmentFilter, 'assignmentStatus'>
  ): Promise<TaskAssignment[]>;

  /**
   * Lists task assignments with flexible filtering.
   *
   * @param filter - Filter options
   * @returns Array of matching task assignments
   */
  listAssignments(filter?: AssignmentFilter): Promise<TaskAssignment[]>;

  /**
   * Gets tasks that are completed and awaiting merge.
   *
   * @returns Array of tasks ready for merge
   */
  getTasksAwaitingMerge(): Promise<TaskAssignment[]>;
}

// ============================================================================
// Task Assignment Service Implementation
// ============================================================================

/**
 * Implementation of the Task Assignment Service.
 *
 * This implementation uses the QuarryAPI for storage operations.
 */
export class TaskAssignmentServiceImpl implements TaskAssignmentService {
  private readonly api: QuarryAPI;
  private readonly mergeRequestProvider?: MergeRequestProvider;

  constructor(api: QuarryAPI, mergeRequestProvider?: MergeRequestProvider) {
    this.api = api;
    this.mergeRequestProvider = mergeRequestProvider;
  }

  // ----------------------------------------
  // Assignment Operations
  // ----------------------------------------

  async assignToAgent(
    taskId: ElementId,
    agentId: EntityId,
    options?: AssignTaskOptions
  ): Promise<Task> {
    // Get and validate the task
    const task = await this.api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Note: Previously there was a guard against reassignment here, but
    // the dispatch service needs to support task reassignment. The dispatch
    // layer is responsible for determining when reassignment is appropriate
    // (e.g., for handoffs). Callers who want to prevent reassignment should
    // check task.assignee before calling assignToAgent.

    // Get and validate the agent
    const agent = await this.api.get<AgentEntity>(asElementId(agentId));
    if (!agent || agent.type !== ElementType.ENTITY || !isAgentEntity(agent)) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Generate branch and worktree names if not provided
    const slug = createSlugFromTitle(task.title);
    const branch = options?.branch ?? generateBranchName(agent.name, taskId, slug);
    const worktree = options?.worktree ?? generateWorktreePath(agent.name, slug);

    // Update task assignee
    await this.api.update<Task>(taskId, { assignee: agentId });

    // Get existing orchestrator metadata to preserve handoff history
    const existingMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);

    // Build new orchestrator metadata, preserving handoff context if this is a reassignment
    const orchestratorMeta: Record<string, unknown> = {
      assignedAgent: agentId,
      branch: options?.branch ?? existingMeta?.handoffBranch ?? branch,
      worktree: options?.worktree ?? existingMeta?.handoffWorktree ?? worktree,
      sessionId: options?.sessionId,
      mergeStatus: 'pending' as MergeStatus,
      // Preserve handoff history from previous assignments
      handoffHistory: existingMeta?.handoffHistory,
    };

    // If marking as started, add start time
    if (options?.markAsStarted) {
      orchestratorMeta.startedAt = createTimestamp();
    }

    const currentMeta = task.metadata as Record<string, unknown> | undefined;
    const newMetadata = setOrchestratorTaskMeta(currentMeta, orchestratorMeta as OrchestratorTaskMeta);

    // Update status to active if marking as started
    const updates: Partial<Task> = { metadata: newMetadata };
    if (options?.markAsStarted) {
      updates.status = TaskStatus.IN_PROGRESS;
    }

    return this.api.update<Task>(taskId, updates);
  }

  async unassignTask(taskId: ElementId): Promise<Task> {
    const task = await this.api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Clear assignee
    await this.api.update<Task>(taskId, { assignee: undefined });

    // Update orchestrator metadata - preserve branch info but clear agent-specific data
    const currentMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);
    if (currentMeta) {
      const newMeta = updateOrchestratorTaskMeta(
        task.metadata as Record<string, unknown> | undefined,
        {
          assignedAgent: undefined,
          sessionId: undefined,
          worktree: undefined,
          startedAt: undefined,
        }
      );
      return this.api.update<Task>(taskId, { metadata: newMeta });
    }

    return this.api.get<Task>(taskId) as Promise<Task>;
  }

  async startTask(taskId: ElementId, sessionId?: string): Promise<Task> {
    const task = await this.api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updates: Partial<OrchestratorTaskMeta> = {
      startedAt: createTimestamp(),
    };
    if (sessionId) {
      (updates as { sessionId?: string }).sessionId = sessionId;
    }

    const newMeta = updateOrchestratorTaskMeta(
      task.metadata as Record<string, unknown> | undefined,
      updates
    );

    return this.api.update<Task>(taskId, {
      status: TaskStatus.IN_PROGRESS,
      metadata: newMeta,
    });
  }

  async completeTask(taskId: ElementId, options?: CompleteTaskOptions): Promise<TaskCompletionResult> {
    const task = await this.api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === TaskStatus.CLOSED || task.status === TaskStatus.REVIEW) {
      throw new Error(
        `Cannot complete task ${taskId}: task is already in '${task.status}' status`
      );
    }

    const currentMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);
    const branch = currentMeta?.branch;
    const currentSessionId = currentMeta?.sessionId;

    // Close the current session's history entry
    let metadataWithClosedSession = task.metadata as Record<string, unknown> | undefined;
    if (currentSessionId) {
      metadataWithClosedSession = closeTaskSessionHistory(
        metadataWithClosedSession,
        currentSessionId,
        createTimestamp()
      );
    }

    // Build the base metadata updates
    const metaUpdates: Record<string, unknown> = {
      completedAt: createTimestamp(),
      mergeStatus: 'pending' as MergeStatus,
      resumeCount: 0, // Reset resume count on status change
    };

    // Add optional completion info
    if (options?.summary) {
      metaUpdates.completionSummary = options.summary;
    }
    if (options?.commitHash) {
      metaUpdates.lastCommitHash = options.commitHash;
    }

    // PR creation is attempted when a provider is configured and not explicitly disabled
    let mergeRequestUrl: string | undefined;
    let mergeRequestId: number | undefined;

    if (branch && this.mergeRequestProvider && options?.createMergeRequest !== false) {
      const baseBranch = options?.baseBranch || 'main';
      let body = `## Task\n\n**ID:** ${task.id}\n**Title:** ${task.title}\n\n`;
      if (options?.summary) {
        body += `## Summary\n\n${options.summary}\n\n`;
      }
      body += `---\n_Created by Stoneforge Smithy_`;

      const mrResult = await this.mergeRequestProvider.createMergeRequest(task, {
        title: options?.mergeRequestTitle || task.title,
        body: options?.mergeRequestBody || body,
        sourceBranch: branch,
        targetBranch: baseBranch,
      });
      mergeRequestUrl = mrResult.url;
      mergeRequestId = mrResult.id;
      metaUpdates.mergeRequestUrl = mergeRequestUrl;
      metaUpdates.mergeRequestId = mergeRequestId;
      metaUpdates.mergeRequestProvider = this.mergeRequestProvider.name;
    }
    // When no provider is configured, skip PR creation but still complete the task.
    // The merge steward can create PRs later if needed.

    // Apply metadata updates on top of the closed session history
    const newMeta = updateOrchestratorTaskMeta(
      metadataWithClosedSession,
      metaUpdates as Partial<OrchestratorTaskMeta>
    );

    // Set status to REVIEW (not CLOSED) - merge steward will set CLOSED after merge
    // Clear assignee - task is now awaiting merge review, not actively being worked on
    const updatedTask = await this.api.update<Task>(taskId, {
      status: TaskStatus.REVIEW,
      assignee: undefined,
      metadata: newMeta,
    });

    return {
      task: updatedTask,
      mergeRequestUrl,
      mergeRequestId,
    };
  }

  async handoffTask(taskId: ElementId, options: HandoffTaskOptions): Promise<Task> {
    const task = await this.api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const currentMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);
    const { sessionId, message, branch, worktree } = options;

    // Close the current session's history entry using the sessionId from orchestrator metadata
    // (the options.sessionId is the provider session ID, but we match on internal sessionId)
    const currentSessionId = currentMeta?.sessionId;
    let metadataWithClosedSession = task.metadata as Record<string, unknown> | undefined;
    if (currentSessionId) {
      metadataWithClosedSession = closeTaskSessionHistory(
        metadataWithClosedSession,
        currentSessionId,
        createTimestamp()
      );
    }

    // Determine the branch and worktree to preserve
    const handoffBranch = branch || currentMeta?.branch;
    const handoffWorktree = worktree || currentMeta?.worktree;

    // Build handoff history (append to existing history)
    const existingHistory = (currentMeta as Record<string, unknown> | undefined)?.handoffHistory as HandoffHistoryEntry[] | undefined;
    const handoffEntry: HandoffHistoryEntry = {
      sessionId,
      message,
      branch: handoffBranch,
      worktree: handoffWorktree,
      handoffAt: createTimestamp(),
    };
    const handoffHistory = [...(existingHistory || []), handoffEntry];

    // Append handoff note to the task's description Document
    if (task.descriptionRef && message) {
      try {
        const doc = await this.api.get<Document>(asElementId(task.descriptionRef));
        if (doc) {
          const handoffLine = `\n\n[AGENT HANDOFF NOTE]: ${message}`;
          await this.api.update<Document>(asElementId(task.descriptionRef), {
            content: doc.content + handoffLine,
          } as Partial<Document>);
        }
      } catch {
        // Non-fatal: handoff note is also preserved in handoffHistory
      }
    }

    // Update orchestrator metadata with handoff info
    const metaUpdates: Record<string, unknown> = {
      // Clear assignment but preserve branch/worktree for continuation
      assignedAgent: undefined,
      sessionId: undefined,
      startedAt: undefined,
      // Clear mergeStatus so merge steward doesn't pick up the task
      mergeStatus: undefined,
      // Store handoff context
      handoffBranch,
      handoffWorktree,
      lastSessionId: sessionId,
      handoffAt: createTimestamp(),
      handoffHistory,
      // Reset resume count on status change (handoff resets to OPEN)
      resumeCount: 0,
    };

    // Apply metadata updates on top of the closed session history
    const newMeta = updateOrchestratorTaskMeta(
      metadataWithClosedSession,
      metaUpdates as Partial<OrchestratorTaskMeta>
    );

    // Update task: clear assignee, reset status to OPEN, update metadata
    // Note: We store the handoff note in metadata since tasks use descriptionRef
    // Setting status to OPEN ensures dispatch daemon can pick up the task
    return this.api.update<Task>(taskId, {
      assignee: undefined,
      status: TaskStatus.OPEN,
      metadata: newMeta,
    });
  }

  async updateSessionId(taskId: ElementId, sessionId: string): Promise<Task> {
    const task = await this.api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const newMeta = updateOrchestratorTaskMeta(
      task.metadata as Record<string, unknown> | undefined,
      { sessionId }
    );

    return this.api.update<Task>(taskId, { metadata: newMeta });
  }

  // ----------------------------------------
  // Workload Queries
  // ----------------------------------------

  async getAgentTasks(
    agentId: EntityId,
    filter?: Omit<AssignmentFilter, 'agentId'>
  ): Promise<TaskAssignment[]> {
    return this.listAssignments({
      ...filter,
      agentId,
    });
  }

  async getAgentWorkload(agentId: EntityId): Promise<AgentWorkloadSummary> {
    const tasks = await this.getAgentTasks(agentId);

    const byStatus: Record<TaskStatusValue, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      deferred: 0,
      backlog: 0,
      review: 0,
      closed: 0,
      tombstone: 0,
    };

    let inProgressCount = 0;
    let awaitingMergeCount = 0;

    for (const { task, orchestratorMeta } of tasks) {
      // Count by task status
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;

      // Count in-progress (in_progress with start time)
      if (task.status === TaskStatus.IN_PROGRESS && orchestratorMeta?.startedAt) {
        inProgressCount++;
      }

      // Count awaiting merge (review status with pending merge status)
      if (task.status === TaskStatus.REVIEW) {
        const mergeStatus = orchestratorMeta?.mergeStatus;
        if (!mergeStatus || mergeStatus === 'pending' || mergeStatus === 'testing') {
          awaitingMergeCount++;
        }
      }
    }

    return {
      agentId,
      totalTasks: tasks.length,
      byStatus,
      inProgressCount,
      awaitingMergeCount,
    };
  }

  async agentHasCapacity(agentId: EntityId): Promise<boolean> {
    // Get the agent to check their max concurrent tasks
    const agent = await this.api.get<AgentEntity>(asElementId(agentId));
    if (!agent || !isAgentEntity(agent)) {
      return false;
    }

    const meta = getAgentMetadata(agent);
    const maxConcurrent = meta?.maxConcurrentTasks ?? 1;

    // Count currently active tasks
    const workload = await this.getAgentWorkload(agentId);
    const activeTasks = workload.byStatus.in_progress || 0;

    return activeTasks < maxConcurrent;
  }

  // ----------------------------------------
  // Task Status Queries
  // ----------------------------------------

  async getUnassignedTasks(
    filter?: Omit<AssignmentFilter, 'agentId' | 'assignmentStatus'>
  ): Promise<Task[]> {
    const assignments = await this.listAssignments({
      ...filter,
      assignmentStatus: 'unassigned',
    });
    return assignments.map((a) => a.task);
  }

  async getTasksByAssignmentStatus(
    status: AssignmentStatus,
    filter?: Omit<AssignmentFilter, 'assignmentStatus'>
  ): Promise<TaskAssignment[]> {
    return this.listAssignments({
      ...filter,
      assignmentStatus: status,
    });
  }

  async listAssignments(filter?: AssignmentFilter): Promise<TaskAssignment[]> {
    // Build task filter from assignment filter
    const taskFilter: { type: 'task'; status?: TaskStatus | TaskStatus[]; assignee?: EntityId } = {
      type: 'task' as const,
    };

    if (filter?.taskStatus) {
      taskFilter.status = filter.taskStatus;
    }

    // Push assignee filter to API level when available (M-2)
    if (filter?.agentId !== undefined) {
      taskFilter.assignee = filter.agentId;
    }

    // Get tasks (pre-filtered by assignee at API level when possible)
    const tasks = await this.api.list<Task>(taskFilter);

    // Convert to assignments and apply filters
    let assignments: TaskAssignment[] = tasks.map((task) => ({
      taskId: task.id,
      task,
      orchestratorMeta: getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined),
    }));

    // Apply agent filter
    if (filter?.agentId !== undefined) {
      assignments = assignments.filter((a) => {
        // Check both task.assignee and orchestrator metadata
        return (
          a.task.assignee === filter.agentId ||
          a.orchestratorMeta?.assignedAgent === filter.agentId
        );
      });
    }

    // Apply assignment status filter
    if (filter?.assignmentStatus !== undefined) {
      const statuses = Array.isArray(filter.assignmentStatus)
        ? filter.assignmentStatus
        : [filter.assignmentStatus];

      assignments = assignments.filter((a) => {
        const assignmentStatus = this.determineAssignmentStatus(a);
        return statuses.includes(assignmentStatus);
      });
    }

    // Apply merge status filter
    if (filter?.mergeStatus !== undefined) {
      const mergeStatuses = Array.isArray(filter.mergeStatus)
        ? filter.mergeStatus
        : [filter.mergeStatus];

      assignments = assignments.filter((a) => {
        const mergeStatus = a.orchestratorMeta?.mergeStatus;
        return mergeStatus !== undefined && mergeStatuses.includes(mergeStatus);
      });
    }

    return assignments;
  }

  async getTasksAwaitingMerge(): Promise<TaskAssignment[]> {
    return this.listAssignments({
      taskStatus: TaskStatus.REVIEW,
      mergeStatus: ['pending', 'testing'],
    });
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Determines the assignment status of a task
   */
  private determineAssignmentStatus(assignment: TaskAssignment): AssignmentStatus {
    const { task, orchestratorMeta } = assignment;

    // Check status-based assignment states first (regardless of assignee)
    // REVIEW status = task completed, awaiting merge review
    if (task.status === TaskStatus.REVIEW) {
      return 'completed';
    }
    // CLOSED status = either merged or completed
    if (task.status === TaskStatus.CLOSED) {
      const mergeStatus = orchestratorMeta?.mergeStatus;
      if (mergeStatus === 'merged') {
        return 'merged';
      }
      // CLOSED without 'merged' status is still 'completed'
      return 'completed';
    }

    // Check if unassigned (only for tasks not in terminal states)
    const hasAssignment = task.assignee || orchestratorMeta?.assignedAgent;
    if (!hasAssignment) {
      return 'unassigned';
    }

    // Check if actively being worked on
    if (task.status === TaskStatus.IN_PROGRESS && orchestratorMeta?.startedAt) {
      return 'in_progress';
    }

    // Assigned but not started
    return 'assigned';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a TaskAssignmentService instance
 *
 * @param api - The QuarryAPI instance
 * @param mergeRequestProvider - Optional provider for creating merge requests.
 *   When omitted, merge request creation is silently skipped.
 */
export function createTaskAssignmentService(
  api: QuarryAPI,
  mergeRequestProvider?: MergeRequestProvider,
): TaskAssignmentService {
  return new TaskAssignmentServiceImpl(api, mergeRequestProvider);
}
