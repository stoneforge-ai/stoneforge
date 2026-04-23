/**
 * Task Routes
 *
 * CRUD and dispatch operations for tasks.
 */

import { Hono } from 'hono';
import type { EntityId, ElementId, Task, Document, DocumentId } from '@stoneforge/core';
import { createTask, createDocument, TaskStatus, ElementType, Priority, Complexity, ContentType, updateTaskStatus } from '@stoneforge/core';
import type { OrchestratorTaskMeta } from '../../index.js';
import { updateOrchestratorTaskMeta } from '../../index.js';
import type { Services } from '../services.js';
import { formatTaskResponse } from '../formatters.js';
import type { QuarryAPI } from '@stoneforge/quarry';
import { autoLinkTask, loadConfig } from '@stoneforge/quarry';
import { createLogger } from '../../utils/logger.js';
import { createConfiguredProvider } from './external-sync-helpers.js';

const logger = createLogger('orchestrator');

/**
 * Hydrate the description from descriptionRef if it exists
 */
async function hydrateTaskDescription(task: Task, api: QuarryAPI): Promise<string | null> {
  if (task.descriptionRef) {
    try {
      const doc = await api.get<Document>(task.descriptionRef as unknown as ElementId);
      if (doc && doc.type === 'document') {
        return doc.content;
      }
    } catch {
      // Document not found or error - fall back to null
    }
  }
  return null;
}

/**
 * Format a task response with hydrated description
 */
async function formatTaskWithDescription(task: Task, api: QuarryAPI, blockedIds?: Set<string>) {
  const hydratedDescription = await hydrateTaskDescription(task, api);
  return formatTaskResponse(task, hydratedDescription, blockedIds);
}

export function createTaskRoutes(services: Services) {
  const { api, agentRegistry, taskAssignmentService, dispatchService, workerTaskService, storageBackend, sessionManager, settingsService } = services;
  const app = new Hono();

  /**
   * Query the blocked_cache table to get IDs of all currently blocked elements.
   * This is used to compute the effective display status for tasks — tasks with
   * unresolved blocking dependencies should display as 'blocked' instead of 'open'.
   */
  function getBlockedIds(): Set<string> {
    const rows = storageBackend.query<{ element_id: string }>(
      'SELECT element_id FROM blocked_cache'
    );
    return new Set(rows.map((r) => r.element_id));
  }

  // GET /api/tasks - List tasks
  app.get('/api/tasks', async (c) => {
    try {
      const url = new URL(c.req.url);
      const statusParam = url.searchParams.get('status');
      const assigneeParam = url.searchParams.get('assignee');
      const unassignedParam = url.searchParams.get('unassigned');
      const searchParam = url.searchParams.get('search');

      // Get blocked element IDs for computing effective display status
      const blockedIds = getBlockedIds();

      // Helper to filter tasks by search query (case-insensitive title match)
      const filterBySearch = (taskList: Task[]): Task[] => {
        if (!searchParam) return taskList;
        const query = searchParam.toLowerCase();
        return taskList.filter((t) => t.title.toLowerCase().includes(query));
      };

      if (unassignedParam === 'true') {
        const unassignedTasks = await taskAssignmentService.getUnassignedTasks();
        const filtered = filterBySearch(unassignedTasks);
        return c.json({ tasks: filtered.map((t) => formatTaskResponse(t, null, blockedIds)) });
      }

      if (assigneeParam) {
        const agentAssignments = await taskAssignmentService.getAgentTasks(assigneeParam as EntityId);
        const agentTasks = agentAssignments.map((a) => a.task);
        let filtered = statusParam
          ? agentTasks.filter((t) => t.status === TaskStatus[statusParam.toUpperCase() as keyof typeof TaskStatus])
          : agentTasks;
        filtered = filterBySearch(filtered);
        return c.json({ tasks: filtered.map((t) => formatTaskResponse(t, null, blockedIds)) });
      }

      const allElements = await api.list({ type: ElementType.TASK, limit: 10000 });
      const tasks = allElements.filter((e): e is Task => e.type === ElementType.TASK);
      // Filter out tombstoned (deleted) tasks
      let filtered = tasks.filter((t) => t.status !== TaskStatus.TOMBSTONE);
      // Apply status filter if provided
      // Support filtering by computed 'blocked' status
      if (statusParam) {
        if (statusParam.toLowerCase() === 'blocked') {
          // Show tasks that are computed as blocked (open tasks in blocked_cache)
          filtered = filtered.filter((t) => t.status === 'open' && blockedIds.has(t.id));
        } else {
          filtered = filtered.filter((t) => t.status === TaskStatus[statusParam.toUpperCase() as keyof typeof TaskStatus]);
        }
      }
      filtered = filterBySearch(filtered);

      return c.json({ tasks: filtered.map((t) => formatTaskResponse(t, null, blockedIds)) });
    } catch (error) {
      logger.error('Failed to list tasks:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/tasks/unassigned
  app.get('/api/tasks/unassigned', async (c) => {
    try {
      const blockedIds = getBlockedIds();
      const tasks = await taskAssignmentService.getUnassignedTasks();
      return c.json({ tasks: tasks.map((t) => formatTaskResponse(t, null, blockedIds)) });
    } catch (error) {
      logger.error('Failed to list unassigned tasks:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks - Create task
  app.post('/api/tasks', async (c) => {
    try {
      const body = (await c.req.json()) as {
        title: string;
        description?: string;
        status?: string;
        priority?: number | 'critical' | 'high' | 'medium' | 'low';
        complexity?: number | 'trivial' | 'simple' | 'medium' | 'complex' | 'very_complex';
        taskType?: 'bug' | 'feature' | 'task' | 'chore';
        assignee?: string;
        tags?: string[];
        ephemeral?: boolean;
        createdBy?: string;
      };

      if (!body.title) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'title is required' } }, 400);
      }

      // Handle priority as either number (1-5) or string
      const priorityStringMap: Record<string, Priority> = {
        critical: Priority.CRITICAL,
        high: Priority.HIGH,
        medium: Priority.MEDIUM,
        low: Priority.LOW,
      };
      let priority: Priority | undefined;
      if (typeof body.priority === 'number') {
        priority = body.priority as Priority;
      } else if (body.priority) {
        priority = priorityStringMap[body.priority];
      }

      // Handle complexity as either number (1-5) or string
      const complexityStringMap: Record<string, Complexity> = {
        trivial: Complexity.TRIVIAL,
        simple: Complexity.SIMPLE,
        medium: Complexity.MEDIUM,
        complex: Complexity.COMPLEX,
        very_complex: Complexity.VERY_COMPLEX,
      };
      let complexity: Complexity | undefined;
      if (typeof body.complexity === 'number') {
        complexity = body.complexity as Complexity;
      } else if (body.complexity) {
        complexity = complexityStringMap[body.complexity];
      }

      const metadata: Record<string, unknown> = {};
      if (body.description) {
        metadata.description = body.description;
      }

      const createdBy = (body.createdBy ?? 'el-0000') as EntityId;

      // Map status string to TaskStatus enum
      let status: TaskStatus | undefined;
      if (body.status) {
        const statusMap: Record<string, TaskStatus> = {
          backlog: TaskStatus.BACKLOG,
          open: TaskStatus.OPEN,
          in_progress: TaskStatus.IN_PROGRESS,
          blocked: TaskStatus.BLOCKED,
          review: TaskStatus.REVIEW,
          deferred: TaskStatus.DEFERRED,
          closed: TaskStatus.CLOSED,
        };
        status = statusMap[body.status];
        if (!status) {
          return c.json({ error: { code: 'INVALID_INPUT', message: `Invalid status: ${body.status}` } }, 400);
        }
      }

      const taskData = await createTask({
        title: body.title,
        status,
        priority,
        complexity,
        taskType: body.taskType,
        assignee: body.assignee ? (body.assignee as EntityId) : undefined,
        tags: body.tags,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        createdBy,
      });

      const savedTask = await api.create(taskData as unknown as Record<string, unknown> & { createdBy: EntityId });
      const task = savedTask as unknown as Task;

      // Auto-link: create external issue if autoLink is enabled
      let autoLinkWarning: string | undefined;
      try {
        const config = loadConfig();
        if (config.externalSync.autoLink && config.externalSync.autoLinkProvider) {
          const providerName = config.externalSync.autoLinkProvider;
          const configured = createConfiguredProvider(providerName, settingsService);

          if (configured) {
            const result = await autoLinkTask({
              task,
              api,
              provider: configured.provider,
              project: configured.config.defaultProject!,
              direction: config.externalSync.defaultDirection,
            });

            if (!result.success) {
              autoLinkWarning = `Auto-link failed: ${result.error}`;
              logger.warn(autoLinkWarning);
            }
          }
        }
      } catch (autoLinkErr) {
        // Auto-link failure must never prevent task creation
        autoLinkWarning = `Auto-link error: ${autoLinkErr instanceof Error ? autoLinkErr.message : String(autoLinkErr)}`;
        logger.warn(autoLinkWarning);
      }

      const response: Record<string, unknown> = { task: formatTaskResponse(task) };
      if (autoLinkWarning) {
        response.warning = autoLinkWarning;
      }
      return c.json(response, 201);
    } catch (error) {
      logger.error('Failed to create task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // PATCH /api/tasks/:id - Update task
  app.patch('/api/tasks/:id', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        title?: string;
        description?: string | null;
        status?: string;
        priority?: number;
        complexity?: number;
        assignee?: string | null;
        owner?: string | null;
        deadline?: string | null;
        tags?: string[];
        mergeStatus?: string;
      };

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const updates: Record<string, unknown> = {};

      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) {
        // Description is stored in metadata
        const existingMeta = (task.metadata ?? {}) as Record<string, unknown>;
        updates.metadata = { ...existingMeta, description: body.description };
      }
      if (body.status !== undefined) {
        const statusMap: Record<string, TaskStatus> = {
          backlog: TaskStatus.BACKLOG,
          open: TaskStatus.OPEN,
          in_progress: TaskStatus.IN_PROGRESS,
          blocked: TaskStatus.BLOCKED,
          review: TaskStatus.REVIEW,
          deferred: TaskStatus.DEFERRED,
          closed: TaskStatus.CLOSED,
        };
        const mappedStatus = statusMap[body.status];
        if (!mappedStatus) {
          return c.json({ error: { code: 'INVALID_INPUT', message: `Invalid status: ${body.status}` } }, 400);
        }
        updates.status = mappedStatus;
      }
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.complexity !== undefined) updates.complexity = body.complexity;
      if (body.assignee !== undefined) updates.assignee = body.assignee || null;
      if (body.owner !== undefined) updates.owner = body.owner || null;
      if (body.deadline !== undefined) updates.deadline = body.deadline || null;
      if (body.tags !== undefined) updates.tags = body.tags;

      // Handle mergeStatus update (nested in metadata.orchestrator)
      if (body.mergeStatus !== undefined) {
        const validMergeStatuses = ['pending', 'testing', 'merging', 'merged', 'conflict', 'test_failed', 'failed', 'not_applicable'];
        if (!validMergeStatuses.includes(body.mergeStatus)) {
          return c.json({ error: { code: 'INVALID_INPUT', message: `Invalid mergeStatus: ${body.mergeStatus}` } }, 400);
        }

        const existingMeta = (task.metadata ?? {}) as Record<string, unknown>;
        const existingOrchestrator = (existingMeta.orchestrator ?? {}) as Record<string, unknown>;
        updates.metadata = {
          ...existingMeta,
          orchestrator: {
            ...existingOrchestrator,
            mergeStatus: body.mergeStatus,
          },
        };
      }

      if (Object.keys(updates).length === 0) {
        return c.json({ task: formatTaskResponse(task) });
      }

      const updatedTask = await api.update(taskId, updates) as unknown as Task;
      return c.json({ task: formatTaskResponse(updatedTask) });
    } catch (error) {
      logger.error('Failed to update task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/tasks/:id
  app.get('/api/tasks/:id', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const task = await api.get<Task>(taskId);

      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      let assignmentInfo = null;
      if (task.assignee) {
        const agent = await agentRegistry.getAgent(task.assignee);
        if (agent) {
          const meta = (task.metadata as { orchestrator?: OrchestratorTaskMeta })?.orchestrator;
          assignmentInfo = {
            agent: {
              id: agent.id,
              name: agent.name,
              role: (agent.metadata as { agent?: { agentRole?: string } })?.agent?.agentRole,
            },
            branch: meta?.branch,
            worktree: meta?.worktree,
            sessionId: meta?.sessionId,
            mergeStatus: meta?.mergeStatus,
            startedAt: meta?.startedAt,
            completedAt: meta?.completedAt,
          };
        }
      }

      // Hydrate description from descriptionRef if it exists
      // Include blocked status computation for single task view
      const blockedIds = getBlockedIds();
      const formattedTask = await formatTaskWithDescription(task, api, blockedIds);
      return c.json({ task: formattedTask, assignment: assignmentInfo });
    } catch (error) {
      logger.error('Failed to get task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // DELETE /api/tasks/:id - Soft delete task
  app.delete('/api/tasks/:id', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json().catch(() => ({}))) as { reason?: string };

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Soft delete by setting status to tombstone
      await api.update(taskId, {
        status: TaskStatus.TOMBSTONE,
        deletedAt: new Date().toISOString(),
        deleteReason: body.reason,
      } as unknown as Record<string, unknown>);

      return c.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // NOTE: POST /api/tasks/bulk-delete is now in @stoneforge/shared-routes (createTaskRoutes)

  // POST /api/tasks/:id/start - Start task (set to in_progress)
  app.post('/api/tasks/:id/start', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      if (task.status !== TaskStatus.OPEN) {
        return c.json({ error: { code: 'INVALID_STATE', message: 'Task must be in open status to start' } }, 400);
      }

      const updatedTask = await api.update(taskId, {
        status: TaskStatus.IN_PROGRESS,
      } as unknown as Record<string, unknown>) as unknown as Task;

      return c.json({ task: formatTaskResponse(updatedTask) });
    } catch (error) {
      logger.error('Failed to start task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/dispatch
  app.post('/api/tasks/:id/dispatch', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        agentId: string;
        priority?: number;
        restart?: boolean;
        markAsStarted?: boolean;
        branch?: string;
        worktree?: string;
        notificationMessage?: string;
        dispatchedBy?: string;
      };

      if (!body.agentId) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'agentId is required' } }, 400);
      }

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const agent = await agentRegistry.getAgent(body.agentId as EntityId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const result = await dispatchService.dispatch(taskId, body.agentId as EntityId, {
        priority: body.priority,
        restart: body.restart,
        markAsStarted: body.markAsStarted,
        branch: body.branch,
        worktree: body.worktree,
        notificationMessage: body.notificationMessage,
        dispatchedBy: body.dispatchedBy as EntityId | undefined,
      });

      return c.json({
        success: true,
        task: formatTaskResponse(result.task),
        agent: { id: result.agent.id, name: result.agent.name },
        notification: { id: result.notification.id, channelId: result.channel.id },
        isNewAssignment: result.isNewAssignment,
        dispatchedAt: result.dispatchedAt,
      });
    } catch (error) {
      logger.error('Failed to dispatch task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/start-worker
  app.post('/api/tasks/:id/start-worker', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        agentId: string;
        branch?: string;
        worktreePath?: string;
        baseBranch?: string;
        additionalPrompt?: string;
        skipWorktree?: boolean;
        workingDirectory?: string;
        priority?: number;
        performedBy?: string;
      };

      if (!body.agentId) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'agentId is required' } }, 400);
      }

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const agent = await agentRegistry.getAgent(body.agentId as EntityId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const result = await workerTaskService.startWorkerOnTask(taskId, body.agentId as EntityId, {
        branch: body.branch,
        worktreePath: body.worktreePath,
        baseBranch: body.baseBranch,
        additionalPrompt: body.additionalPrompt,
        skipWorktree: body.skipWorktree,
        workingDirectory: body.workingDirectory,
        priority: body.priority,
        performedBy: body.performedBy as EntityId | undefined,
      });

      return c.json(
        {
          success: true,
          task: formatTaskResponse(result.task),
          agent: { id: result.agent.id, name: result.agent.name },
          session: {
            id: result.session.id,
            providerSessionId: result.session.providerSessionId,
            status: result.session.status,
            workingDirectory: result.session.workingDirectory,
          },
          worktree: result.worktree
            ? { path: result.worktree.path, branch: result.worktree.branch, branchCreated: result.worktree.branchCreated }
            : null,
          dispatch: {
            notificationId: result.dispatch.notification.id,
            channelId: result.dispatch.channel.id,
            isNewAssignment: result.dispatch.isNewAssignment,
          },
          startedAt: result.startedAt,
        },
        201
      );
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('not a worker')) {
        return c.json({ error: { code: 'INVALID_AGENT', message: 'Agent is not a worker' } }, 400);
      }
      logger.error('Failed to start worker on task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  // POST /api/tasks/:id/complete
  app.post('/api/tasks/:id/complete', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json().catch(() => ({}))) as {
        summary?: string;
        commitHash?: string;
        performedBy?: string;
      };

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const result = await workerTaskService.completeTask(taskId, {
        summary: body.summary,
        commitHash: body.commitHash,
        performedBy: body.performedBy as EntityId | undefined,
      });

      return c.json({
        success: true,
        task: formatTaskResponse(result.task),
        worktree: result.worktree
          ? { path: result.worktree.path, branch: result.worktree.branch, state: result.worktree.state }
          : null,
        readyForMerge: result.readyForMerge,
        completedAt: result.completedAt,
      });
    } catch (error) {
      logger.error('Failed to complete task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/reset - Reset task to open, clearing all work-in-progress data
  app.post('/api/tasks/:id/reset', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Only allow reset if task has an assignee or is in_progress/review/closed
      const canReset = task.assignee ||
        task.status === TaskStatus.IN_PROGRESS ||
        task.status === TaskStatus.REVIEW ||
        task.status === TaskStatus.CLOSED;

      if (!canReset) {
        return c.json(
          { error: { code: 'BAD_REQUEST', message: 'Task cannot be reset - no assignee or work-in-progress state' } },
          400
        );
      }

      // Terminate any active session for the current assignee before clearing state
      if (task.assignee && sessionManager) {
        try {
          const activeSession = sessionManager.getActiveSession(task.assignee);
          if (activeSession) {
            logger.info(`Terminating session ${activeSession.id} for agent ${task.assignee} during task reset`);
            await sessionManager.stopSession(activeSession.id, {
              graceful: true,
              reason: 'Task was reset',
            });
          }
        } catch (error) {
          logger.warn(`Failed to stop session during task reset: ${error}`);
          // Non-fatal — continue with reset even if session termination fails
        }
      }

      // Update status to OPEN (clears closedAt)
      const updated = updateTaskStatus(task, { status: TaskStatus.OPEN });

      // Clear assignee
      updated.assignee = undefined;
      updated.closeReason = undefined;

      // Clear all orchestrator metadata
      const existingMeta = (updated.metadata as Record<string, unknown> | undefined)?.orchestrator as OrchestratorTaskMeta | undefined;
      if (existingMeta) {
        const reconciliationCount = existingMeta.reconciliationCount ?? 0;
        updated.metadata = updateOrchestratorTaskMeta(updated.metadata as Record<string, unknown>, {
          // Clear all orchestrator fields
          branch: undefined,
          worktree: undefined,
          mergeStatus: undefined,
          mergedAt: undefined,
          mergeFailureReason: undefined,
          assignedAgent: undefined,
          sessionId: undefined,
          startedAt: undefined,
          completedAt: undefined,
          completionSummary: undefined,
          lastCommitHash: undefined,
          testRunCount: undefined,
          lastTestResult: undefined,
          lastSyncResult: undefined,
          reconciliationCount: reconciliationCount + 1,
        });
      }

      // Save the update
      await api.update<Task>(taskId, updated, {
        expectedUpdatedAt: task.updatedAt,
      });

      // Re-fetch the task to get the latest state
      const finalTask = await api.get<Task>(taskId);
      const hydratedDescription = await hydrateTaskDescription(finalTask!, api);

      return c.json({
        success: true,
        task: formatTaskResponse(finalTask!, hydratedDescription),
        resetAt: finalTask!.updatedAt,
      });
    } catch (error) {
      logger.error('Failed to reset task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/reopen
  app.post('/api/tasks/:id/reopen', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json().catch(() => ({}))) as {
        message?: string;
      };

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      if (task.status !== TaskStatus.CLOSED) {
        return c.json(
          { error: { code: 'BAD_REQUEST', message: `Task is not closed (status: ${task.status})` } },
          400
        );
      }

      // Update status to OPEN (clears closedAt)
      const updated = updateTaskStatus(task, { status: TaskStatus.OPEN });

      // Clear assignee and closeReason
      updated.assignee = undefined;
      updated.closeReason = undefined;

      // Clear orchestrator metadata fields while preserving branch/worktree/handoff info
      const existingMeta = (updated.metadata as Record<string, unknown> | undefined)?.orchestrator as OrchestratorTaskMeta | undefined;
      if (existingMeta) {
        const reconciliationCount = existingMeta.reconciliationCount ?? 0;
        updated.metadata = updateOrchestratorTaskMeta(updated.metadata as Record<string, unknown>, {
          mergeStatus: undefined,
          mergedAt: undefined,
          mergeFailureReason: undefined,
          assignedAgent: undefined,
          sessionId: undefined,
          startedAt: undefined,
          completedAt: undefined,
          completionSummary: undefined,
          lastCommitHash: undefined,
          testRunCount: undefined,
          lastTestResult: undefined,
          lastSyncResult: undefined,
          reconciliationCount: reconciliationCount + 1,
        });
      }

      // Save the update
      await api.update<Task>(taskId, updated, {
        expectedUpdatedAt: task.updatedAt,
      });

      // If message provided, append to or create description document
      if (body.message) {
        const reopenLine = `**Re-opened** — Task was closed but incomplete. Message: ${body.message}`;
        if (task.descriptionRef) {
          const doc = await api.get<Document>(task.descriptionRef as unknown as ElementId);
          if (doc) {
            await api.update<Document>(task.descriptionRef as unknown as ElementId, {
              content: doc.content + '\n\n' + reopenLine,
            } as Partial<Document>);
          }
        } else {
          const newDoc = await createDocument({
            content: reopenLine,
            contentType: ContentType.MARKDOWN,
            createdBy: 'orchestrator' as EntityId,
          });
          const created = await api.create(newDoc as unknown as Document & Record<string, unknown>);
          await api.update<Task>(taskId, { descriptionRef: created.id as unknown as DocumentId });
        }
      }

      // Re-fetch the task to get the latest state (including any descriptionRef changes)
      const finalTask = await api.get<Task>(taskId);
      const hydratedDescription = await hydrateTaskDescription(finalTask!, api);

      return c.json({
        success: true,
        task: formatTaskResponse(finalTask!, hydratedDescription),
        reopenedAt: finalTask!.updatedAt,
      });
    } catch (error) {
      logger.error('Failed to reopen task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/tasks/:id/context
  app.get('/api/tasks/:id/context', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const workerIdParam = url.searchParams.get('workerId');
      const additionalInstructions = url.searchParams.get('additionalInstructions') ?? undefined;

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Use workerId from query param, or fall back to task assignee
      const workerId = (workerIdParam as EntityId) || task.assignee;
      if (!workerId) {
        return c.json(
          { error: { code: 'BAD_REQUEST', message: 'workerId query parameter required when task has no assignee' } },
          400
        );
      }

      const context = await workerTaskService.getTaskContext(taskId);
      const prompt = await workerTaskService.buildTaskContextPrompt(taskId, workerId, additionalInstructions);

      return c.json({ task: { id: task.id, title: task.title }, context, prompt });
    } catch (error) {
      logger.error('Failed to get task context:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/cleanup
  app.post('/api/tasks/:id/cleanup', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json().catch(() => ({}))) as { deleteBranch?: boolean };

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const success = await workerTaskService.cleanupTask(taskId, body.deleteBranch ?? false);

      return c.json({ success, taskId, deletedBranch: success && (body.deleteBranch ?? false) });
    } catch (error) {
      logger.error('Failed to cleanup task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // ============================================================================
  // Task Attachments Endpoints
  // ============================================================================

  // GET /api/tasks/:id/attachments - Get all documents attached to a task
  app.get('/api/tasks/:id/attachments', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;

      // Verify task exists
      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Get all dependencies where this task references a document
      const dependencies = await api.getDependencies(taskId);
      const attachmentDeps = dependencies.filter(
        (dep) => dep.blockedId === taskId && dep.type === 'references'
      );

      // Get the document details for each attachment
      const attachments = await Promise.all(
        attachmentDeps.map(async (dep) => {
          const doc = await api.get(dep.blockerId as ElementId);
          if (doc && doc.type === 'document') {
            return doc;
          }
          return null;
        })
      );

      // Filter out nulls (in case documents were deleted)
      return c.json(attachments.filter(Boolean));
    } catch (error) {
      logger.error('Failed to get task attachments:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/attachments - Attach a document to a task
  app.post('/api/tasks/:id/attachments', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as { documentId?: string; actor?: string };

      // Validate document ID
      if (!body.documentId || typeof body.documentId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'documentId is required' } }, 400);
      }

      // Verify task exists
      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Verify document exists
      const doc = await api.get(body.documentId as ElementId);
      if (!doc || doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Check if already attached
      const existingDeps = await api.getDependencies(taskId);
      const alreadyAttached = existingDeps.some(
        (dep) => dep.blockedId === taskId && dep.blockerId === body.documentId && dep.type === 'references'
      );
      if (alreadyAttached) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Document is already attached to this task' } }, 400);
      }

      // Create the references dependency
      await api.addDependency({
        blockedId: taskId,
        blockerId: body.documentId as ElementId,
        type: 'references',
        actor: (body.actor as EntityId) || ('el-0000' as EntityId),
      });

      return c.json(doc, 201);
    } catch (error) {
      logger.error('Failed to attach document to task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // DELETE /api/tasks/:id/attachments/:docId - Remove a document attachment
  app.delete('/api/tasks/:id/attachments/:docId', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const docId = c.req.param('docId') as ElementId;

      // Verify task exists
      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Find the attachment dependency
      const dependencies = await api.getDependencies(taskId);
      const attachmentDep = dependencies.find(
        (dep) => dep.blockedId === taskId && dep.blockerId === docId && dep.type === 'references'
      );

      if (!attachmentDep) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } }, 404);
      }

      // Remove the dependency
      await api.removeDependency(taskId, docId, 'references');

      return c.json({ success: true, taskId, documentId: docId });
    } catch (error) {
      logger.error('Failed to remove task attachment:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // ============================================================================
  // Task Dependencies Endpoints
  // ============================================================================

  // Blocking dependency types that prevent a task from proceeding
  const BLOCKING_DEPENDENCY_TYPES = ['blocks', 'parent-child', 'awaits'];

  // GET /api/tasks/:id/dependency-tasks - Get hydrated dependency info for UI display
  app.get('/api/tasks/:id/dependency-tasks', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;

      // Verify task exists
      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Get tasks that block this task (blockedBy)
      const dependencies = await api.getDependencies(taskId);
      const blockingDeps = dependencies.filter(
        (dep) => dep.blockedId === taskId && BLOCKING_DEPENDENCY_TYPES.includes(dep.type)
      );

      // Get tasks that this task blocks (blocks)
      const dependents = await api.getDependents(taskId);
      const blockedDeps = dependents.filter(
        (dep) => dep.blockerId === taskId && BLOCKING_DEPENDENCY_TYPES.includes(dep.type)
      );

      // Hydrate task details for blockedBy
      const blockedBy = await Promise.all(
        blockingDeps.map(async (dep) => {
          const blockerTask = await api.get<Task>(dep.blockerId as ElementId);
          if (blockerTask && blockerTask.type === ElementType.TASK) {
            return {
              dependencyType: dep.type,
              task: {
                id: blockerTask.id,
                title: blockerTask.title,
                status: blockerTask.status,
                priority: blockerTask.priority,
              },
            };
          }
          return null;
        })
      );

      // Hydrate task details for blocks
      const blocks = await Promise.all(
        blockedDeps.map(async (dep) => {
          const blockedTask = await api.get<Task>(dep.blockedId as ElementId);
          if (blockedTask && blockedTask.type === ElementType.TASK) {
            return {
              dependencyType: dep.type,
              task: {
                id: blockedTask.id,
                title: blockedTask.title,
                status: blockedTask.status,
                priority: blockedTask.priority,
              },
            };
          }
          return null;
        })
      );

      // Filter out nulls
      const filteredBlockedBy = blockedBy.filter(Boolean);
      const filteredBlocks = blocks.filter(Boolean);

      // Calculate progress (resolved = closed blockers)
      const resolvedCount = filteredBlockedBy.filter((dep) => {
        return dep?.task?.status === TaskStatus.CLOSED;
      }).length;

      return c.json({
        blockedBy: filteredBlockedBy,
        blocks: filteredBlocks,
        progress: {
          resolved: resolvedCount,
          total: filteredBlockedBy.length,
        },
      });
    } catch (error) {
      logger.error('Failed to get task dependencies:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/dependencies - Add a blocking dependency to a task
  app.post('/api/tasks/:id/dependencies', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        blockerId: string;
        type?: 'blocks' | 'parent-child' | 'awaits';
      };

      if (!body.blockerId) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'blockerId is required' } }, 400);
      }

      const blockerId = body.blockerId as ElementId;
      const dependencyType = body.type || 'blocks';

      // Verify both tasks exist
      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const blockerTask = await api.get<Task>(blockerId);
      if (!blockerTask || blockerTask.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Blocker task not found' } }, 404);
      }

      // Prevent self-reference
      if (taskId === blockerId) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'A task cannot block itself' } }, 400);
      }

      // Add the dependency (blocker blocks this task)
      await api.addDependency({
        blockedId: taskId,
        blockerId: blockerId,
        type: dependencyType,
        actor: 'el-0000' as EntityId, // System actor for UI operations
      });

      return c.json({
        success: true,
        dependency: {
          blockedId: taskId,
          blockerId: blockerId,
          type: dependencyType,
        },
      });
    } catch (error) {
      logger.error('Failed to add dependency:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // DELETE /api/tasks/:id/dependencies/:blockerId - Remove a blocking dependency from a task
  app.delete('/api/tasks/:id/dependencies/:blockerId', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const blockerId = c.req.param('blockerId') as ElementId;

      // Verify task exists
      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Find the dependency to get its type
      const dependencies = await api.getDependencies(taskId);
      const dependency = dependencies.find(
        (dep) => dep.blockerId === blockerId && BLOCKING_DEPENDENCY_TYPES.includes(dep.type)
      );

      if (!dependency) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Dependency not found' } }, 404);
      }

      // Remove the dependency with the correct type
      await api.removeDependency(taskId, blockerId, dependency.type, 'el-0000' as EntityId);

      return c.json({
        success: true,
        taskId,
        blockerId,
      });
    } catch (error) {
      logger.error('Failed to remove dependency:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // ============================================================================
  // Merge Status Endpoints
  // ============================================================================

  // Valid merge status values
  const VALID_MERGE_STATUSES = [
    'pending',
    'testing',
    'merging',
    'merged',
    'conflict',
    'test_failed',
    'failed',
    'not_applicable',
  ] as const;

  // PATCH /api/tasks/:id/merge-status - Update merge status
  app.patch('/api/tasks/:id/merge-status', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as { mergeStatus: string };

      if (!body.mergeStatus) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'mergeStatus is required' } }, 400);
      }

      if (!VALID_MERGE_STATUSES.includes(body.mergeStatus as typeof VALID_MERGE_STATUSES[number])) {
        return c.json({
          error: {
            code: 'INVALID_INPUT',
            message: `Invalid mergeStatus. Must be one of: ${VALID_MERGE_STATUSES.join(', ')}`,
          },
        }, 400);
      }

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Update orchestrator metadata with new merge status
      const existingMeta = (task.metadata ?? {}) as Record<string, unknown>;
      const updatedMeta = updateOrchestratorTaskMeta(existingMeta, {
        mergeStatus: body.mergeStatus as OrchestratorTaskMeta['mergeStatus'],
        // If setting to merged, also set mergedAt timestamp
        ...(body.mergeStatus === 'merged' ? { mergedAt: new Date().toISOString() } : {}),
        // Clear failure reason if status is no longer a failure state
        ...(body.mergeStatus !== 'conflict' && body.mergeStatus !== 'test_failed' && body.mergeStatus !== 'failed'
          ? { mergeFailureReason: undefined }
          : {}),
      });

      const updatedTask = await api.update(taskId, { metadata: updatedMeta }) as unknown as Task;

      return c.json({ task: formatTaskResponse(updatedTask) });
    } catch (error) {
      logger.error('Failed to update merge status:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
