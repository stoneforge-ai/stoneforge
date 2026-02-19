/**
 * Task Bulk Routes Factory
 *
 * Bulk update and bulk delete endpoints for tasks.
 * These are shared across quarry and smithy servers to avoid duplication.
 */

import { Hono } from 'hono';
import type { ElementId } from '@stoneforge/core';
import type { CollaborateServices } from './types.js';

export function createTaskRoutes(services: CollaborateServices) {
  const { api } = services;
  const app = new Hono();

  /**
   * PATCH /api/tasks/bulk
   * Bulk update tasks by IDs.
   *
   * IMPORTANT: This route MUST be registered before any PATCH /api/tasks/:id
   * route, otherwise "bulk" gets matched as a task ID parameter.
   *
   * Body:
   * - ids: string[] — Non-empty array of task IDs to update
   * - updates: object — Fields to update (whitelisted)
   */
  app.patch('/api/tasks/bulk', async (c) => {
    try {
      const body = await c.req.json();

      // Validate request structure
      if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
      }
      if (!body.updates || typeof body.updates !== 'object') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'updates must be an object' } }, 400);
      }

      const ids = body.ids as string[];

      // Extract allowed updates
      const updates: Record<string, unknown> = {};
      const allowedFields = [
        'status', 'priority', 'complexity', 'taskType',
        'assignee', 'owner', 'deadline', 'scheduledFor', 'tags',
      ];

      for (const field of allowedFields) {
        if (body.updates[field] !== undefined) {
          updates[field] = body.updates[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
      }

      // Update each task
      const results: { id: string; success: boolean; error?: string }[] = [];

      for (const id of ids) {
        try {
          const existing = await api.get(id as ElementId);
          if (!existing || existing.type !== 'task') {
            results.push({ id, success: false, error: 'Task not found' });
            continue;
          }

          await api.update(id as ElementId, updates);
          results.push({ id, success: true });
        } catch (error) {
          results.push({ id, success: false, error: (error as Error).message });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      return c.json({
        updated: successCount,
        failed: failureCount,
        results,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to bulk update tasks:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to bulk update tasks' } }, 500);
    }
  });

  /**
   * POST /api/tasks/bulk-delete
   * Bulk delete tasks by IDs.
   *
   * Uses POST with a body for better proxy compatibility
   * (some proxies strip bodies from DELETE requests).
   *
   * Body:
   * - ids: string[] — Non-empty array of task IDs to delete
   */
  app.post('/api/tasks/bulk-delete', async (c) => {
    try {
      const body = await c.req.json();

      // Validate request structure
      if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
      }

      const ids = body.ids as string[];

      // Delete each task
      const results: { id: string; success: boolean; error?: string }[] = [];

      for (const id of ids) {
        try {
          const existing = await api.get(id as ElementId);
          if (!existing || existing.type !== 'task') {
            results.push({ id, success: false, error: 'Task not found' });
            continue;
          }

          await api.delete(id as ElementId);
          results.push({ id, success: true });
        } catch (error) {
          results.push({ id, success: false, error: (error as Error).message });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      return c.json({
        deleted: successCount,
        failed: failureCount,
        results,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to bulk delete tasks:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to bulk delete tasks' } }, 500);
    }
  });

  return app;
}
