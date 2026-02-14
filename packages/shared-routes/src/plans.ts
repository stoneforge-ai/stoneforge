/**
 * Plans Routes Factory
 *
 * Plan management endpoints for listing, viewing, creating, and updating plans.
 * Includes task association and progress tracking (TB24, TB86, TB121).
 */

import { Hono } from 'hono';
import {
  createPlan,
  createTask,
} from '@stoneforge/core';
import type {
  ElementId,
  EntityId,
  Element,
  CreatePlanInput,
  PlanStatus,
} from '@stoneforge/core';
import type { CollaborateServices } from './types.js';

export function createPlanRoutes(services: CollaborateServices) {
  const { api } = services;
  const app = new Hono();

  /**
   * GET /api/plans
   * List all plans with optional filtering.
   *
   * Query params:
   * - status: Filter by status (draft, active, completed, cancelled)
   * - limit: Max number of results
   * - offset: Skip first N results
   * - hydrate.progress: Include progress info for each plan (TB86)
   */
  app.get('/api/plans', async (c) => {
    try {
      const url = new URL(c.req.url);
      const statusParam = url.searchParams.get('status');
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');
      const hydrateProgress = url.searchParams.get('hydrate.progress') === 'true';

      const filter: Record<string, unknown> = {
        type: 'plan',
        orderBy: 'updated_at',
        orderDir: 'desc',
      };

      if (statusParam) {
        filter.status = statusParam;
      }
      if (limitParam) {
        filter.limit = parseInt(limitParam, 10);
      }
      if (offsetParam) {
        filter.offset = parseInt(offsetParam, 10);
      }

      const plans = await api.list(filter as Parameters<typeof api.list>[0]);

      // Optionally hydrate progress for all plans (TB86)
      if (hydrateProgress) {
        const plansWithProgress = await Promise.all(
          plans.map(async (plan) => {
            const progress = await api.getPlanProgress(plan.id as ElementId);
            return { ...plan, _progress: progress };
          })
        );
        return c.json(plansWithProgress);
      }

      return c.json(plans);
    } catch (error) {
      console.error('[stoneforge] Failed to get plans:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plans' } }, 500);
    }
  });

  /**
   * GET /api/plans/:id
   * Get a single plan by ID.
   *
   * Query params:
   * - hydrate.progress: Include progress info
   */
  app.get('/api/plans/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const hydrateProgress = url.searchParams.get('hydrate.progress') === 'true';

      const plan = await api.get(id);

      if (!plan) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      if (plan.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      // Optionally hydrate progress
      if (hydrateProgress) {
        const progress = await api.getPlanProgress(id);
        return c.json({ ...plan, _progress: progress });
      }

      return c.json(plan);
    } catch (error) {
      console.error('[stoneforge] Failed to get plan:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plan' } }, 500);
    }
  });

  /**
   * GET /api/plans/:id/tasks
   * Get tasks in a plan.
   *
   * Query params:
   * - status: Filter tasks by status
   * - limit: Max number of results
   * - offset: Skip first N results
   */
  app.get('/api/plans/:id/tasks', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const statusParam = url.searchParams.get('status');
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');

      // First verify plan exists
      const plan = await api.get(id);
      if (!plan) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if (plan.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      // Build filter for getTasksInPlan
      const filter: Record<string, unknown> = {};

      if (statusParam) {
        filter.status = statusParam;
      }
      if (limitParam) {
        filter.limit = parseInt(limitParam, 10);
      }
      if (offsetParam) {
        filter.offset = parseInt(offsetParam, 10);
      }

      const tasks = await api.getTasksInPlan(id, filter as Parameters<typeof api.getTasksInPlan>[1]);
      return c.json(tasks);
    } catch (error) {
      console.error('[stoneforge] Failed to get plan tasks:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plan tasks' } }, 500);
    }
  });

  /**
   * GET /api/plans/:id/progress
   * Get progress summary for a plan.
   */
  app.get('/api/plans/:id/progress', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      // First verify plan exists
      const plan = await api.get(id);
      if (!plan) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if (plan.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      const progress = await api.getPlanProgress(id);
      return c.json(progress);
    } catch (error) {
      console.error('[stoneforge] Failed to get plan progress:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plan progress' } }, 500);
    }
  });

  /**
   * POST /api/plans/:id/tasks
   * Add a task to a plan.
   *
   * Body:
   * - taskId: ID of task to add
   * - actor: Optional entity ID for audit
   */
  app.post('/api/plans/:id/tasks', async (c) => {
    try {
      const planId = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Validate required fields
      if (!body.taskId || typeof body.taskId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'taskId is required and must be a string' } }, 400);
      }

      // Verify plan exists
      const plan = await api.get(planId);
      if (!plan) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if (plan.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      // Verify task exists
      const task = await api.get(body.taskId as ElementId);
      if (!task) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }
      if (task.type !== 'task') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Add the task to the plan
      const dependency = await api.addTaskToPlan(
        body.taskId as ElementId,
        planId,
        { actor: body.actor as EntityId | undefined }
      );

      return c.json(dependency, 201);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      const errorMessage = (error as Error).message || '';

      if (errorCode === 'ALREADY_EXISTS' || errorMessage.includes('already in plan')) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in a plan. Each task can only belong to one plan.' } }, 409);
      }
      if (errorCode === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: errorMessage } }, 400);
      }
      // Handle ConstraintError for task already in plan
      if (error instanceof Error && (error.name === 'ConstraintError' || errorMessage.includes('already in plan'))) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in a plan. Each task can only belong to one plan.' } }, 409);
      }
      console.error('[stoneforge] Failed to add task to plan:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add task to plan' } }, 500);
    }
  });

  /**
   * GET /api/plans/:id/can-delete-task/:taskId
   * Check if task can be deleted from plan (TB121 - Plans must have at least one task).
   */
  app.get('/api/plans/:id/can-delete-task/:taskId', async (c) => {
    try {
      const planId = c.req.param('id') as ElementId;
      const taskId = c.req.param('taskId') as ElementId;

      // Verify plan exists
      const plan = await api.get(planId);
      if (!plan) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if (plan.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      // Get tasks in plan
      const tasks = await api.getTasksInPlan(planId);

      // Check if this task is in the plan
      const taskInPlan = tasks.some(t => t.id === taskId);
      if (!taskInPlan) {
        return c.json({ canDelete: false, reason: 'Task is not in this plan' });
      }

      // Check if this is the last task
      const isLastTask = tasks.length === 1;
      if (isLastTask) {
        return c.json({ canDelete: false, reason: 'Cannot remove the last task from a plan. Plans must have at least one task.' });
      }

      return c.json({ canDelete: true });
    } catch (error) {
      console.error('[stoneforge] Failed to check if task can be deleted:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check if task can be deleted' } }, 500);
    }
  });

  /**
   * DELETE /api/plans/:id/tasks/:taskId
   * Remove a task from a plan.
   */
  app.delete('/api/plans/:id/tasks/:taskId', async (c) => {
    try {
      const planId = c.req.param('id') as ElementId;
      const taskId = c.req.param('taskId') as ElementId;

      // Verify plan exists
      const plan = await api.get(planId);
      if (!plan) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if (plan.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      // TB121: Check if this is the last task - plans must have at least one task
      const tasks = await api.getTasksInPlan(planId);
      const taskInPlan = tasks.some(t => t.id === taskId);
      if (taskInPlan && tasks.length === 1) {
        return c.json({
          error: {
            code: 'LAST_TASK',
            message: 'Cannot remove the last task from a plan. Plans must have at least one task.'
          }
        }, 400);
      }

      // Remove the task from the plan
      await api.removeTaskFromPlan(taskId, planId);

      return c.json({ success: true });
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'NOT_FOUND' || errorCode === 'DEPENDENCY_NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task is not in this plan' } }, 404);
      }
      console.error('[stoneforge] Failed to remove task from plan:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove task from plan' } }, 500);
    }
  });

  /**
   * POST /api/plans
   * Create a new plan with an initial task (TB121).
   *
   * Body:
   * - title: Plan title (required)
   * - createdBy: Entity ID of creator (required)
   * - status: Initial status (default: draft)
   * - tags: Array of tags
   * - descriptionRef: Optional document reference
   * - initialTaskId: ID of existing task to add (one of initialTaskId or initialTask required)
   * - initialTask: Object with title, status, priority, complexity, tags to create new task
   */
  app.post('/api/plans', async (c) => {
    try {
      const body = await c.req.json();

      // Validate required fields
      if (!body.title || typeof body.title !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required and must be a string' } }, 400);
      }

      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
      }

      // Validate title length
      if (body.title.length < 1 || body.title.length > 500) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
      }

      // TB121: Plans must have at least one task
      // Accept either:
      // 1. initialTaskId - existing task to add to the plan
      // 2. initialTask - object with task details to create and add
      const hasInitialTaskId = body.initialTaskId && typeof body.initialTaskId === 'string';
      const hasInitialTask = body.initialTask && typeof body.initialTask === 'object' && body.initialTask.title;

      if (!hasInitialTaskId && !hasInitialTask) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Plans must have at least one task. Provide either initialTaskId (existing task ID) or initialTask (object with title to create new task).'
          }
        }, 400);
      }

      // Validate initialTaskId exists if provided
      if (hasInitialTaskId) {
        const existingTask = await api.get(body.initialTaskId as ElementId);
        if (!existingTask) {
          return c.json({ error: { code: 'NOT_FOUND', message: 'Initial task not found' } }, 404);
        }
        if (existingTask.type !== 'task') {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTaskId must reference a task' } }, 400);
        }
      }

      // Validate initialTask title if provided
      if (hasInitialTask) {
        if (typeof body.initialTask.title !== 'string' || body.initialTask.title.length < 1 || body.initialTask.title.length > 500) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTask.title must be between 1 and 500 characters' } }, 400);
        }
      }

      // Create the plan using the factory function
      const planInput: CreatePlanInput = {
        title: body.title,
        createdBy: body.createdBy as EntityId,
        status: (body.status as PlanStatus) || ('draft' as PlanStatus),
        tags: body.tags || [],
        descriptionRef: body.descriptionRef,
      };

      const plan = await createPlan(planInput);
      const created = await api.create(plan as unknown as Element & Record<string, unknown>);

      // Now add or create the initial task
      let taskId: ElementId;
      let createdTask = null;

      if (hasInitialTaskId) {
        taskId = body.initialTaskId as ElementId;
      } else {
        // Create a new task using the proper factory function
        const taskInput = {
          title: body.initialTask.title,
          status: (body.initialTask.status || 'open') as 'open',
          priority: body.initialTask.priority || 3,
          complexity: body.initialTask.complexity || 3,
          tags: body.initialTask.tags || [],
          createdBy: body.createdBy as EntityId,
        };
        const task = await createTask(taskInput);
        createdTask = await api.create(task as unknown as Element & Record<string, unknown>);
        taskId = createdTask.id as ElementId;
      }

      // Add the task to the plan
      await api.addTaskToPlan(taskId, created.id as ElementId, { actor: body.createdBy as EntityId });

      // Return the plan along with the initial task info
      return c.json({
        ...created,
        initialTask: createdTask || { id: taskId }
      }, 201);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      const errorMessage = (error as Error).message || '';

      if (errorCode === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: errorMessage } }, 400);
      }
      if (errorCode === 'ALREADY_EXISTS' || errorMessage.includes('already in plan')) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in another plan. Each task can only belong to one plan.' } }, 409);
      }
      // Handle ConstraintError for task already in plan
      if (error instanceof Error && (error.name === 'ConstraintError' || errorMessage.includes('already in plan'))) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in another plan. Each task can only belong to one plan.' } }, 409);
      }
      console.error('[stoneforge] Failed to create plan:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create plan' } }, 500);
    }
  });

  /**
   * DELETE /api/plans/:id
   * Delete a plan and remove all task associations.
   */
  app.delete('/api/plans/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      // First verify plan exists
      const plan = await api.get(id);
      if (!plan) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if (plan.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      // Remove all task associations from this plan
      const tasks = await api.getTasksInPlan(id);
      for (const task of tasks) {
        try {
          await api.removeTaskFromPlan(task.id as ElementId, id);
        } catch (err) {
          // Continue even if removal fails - task might already be removed
          console.warn(`[stoneforge] Failed to remove task ${task.id} from plan ${id}:`, err);
        }
      }

      // Delete the plan
      await api.delete(id);

      return c.json({ success: true });
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      console.error('[stoneforge] Failed to delete plan:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete plan' } }, 500);
    }
  });

  /**
   * PATCH /api/plans/:id
   * Update a plan.
   *
   * Body (all optional):
   * - title: New title
   * - status: New status
   * - tags: New tags
   * - metadata: New metadata
   * - descriptionRef: New description reference
   * - cancelReason: Reason for cancellation
   */
  app.patch('/api/plans/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // First verify plan exists
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if (existing.type !== 'plan') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }

      // Extract allowed updates
      const updates: Record<string, unknown> = {};
      const allowedFields = ['title', 'status', 'tags', 'metadata', 'descriptionRef', 'cancelReason'];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field];
        }
      }

      // Validate title if provided
      if (updates.title !== undefined) {
        if (typeof updates.title !== 'string' || updates.title.length < 1 || updates.title.length > 500) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
        }
      }

      // Validate status if provided
      if (updates.status !== undefined) {
        const validStatuses = ['draft', 'active', 'completed', 'cancelled'];
        if (!validStatuses.includes(updates.status as string)) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } }, 400);
        }
      }

      const updated = await api.update(id, updates);
      return c.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
      }
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[stoneforge] Failed to update plan:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update plan' } }, 500);
    }
  });

  return app;
}
