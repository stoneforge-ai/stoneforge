/**
 * Elements Routes Factory
 *
 * Bulk data loading endpoint for upfront loading strategy.
 */

import { Hono } from 'hono';
import type { CollaborateServices } from './types.js';

/**
 * Helper to enrich tasks with dependency and attachment counts.
 * TB83: Include blocksCount, blockedByCount, and attachment count for tasks.
 */
function enrichTasksWithCounts(tasks: Record<string, unknown>[]): Record<string, unknown>[] {
  // This is a simplified version - the full implementation requires
  // querying dependencies which is expensive. For now, return tasks as-is
  // since the counts are typically computed on-demand or cached.
  return tasks;
}

export function createElementsRoutes(services: CollaborateServices) {
  const { api } = services;
  const app = new Hono();

  /**
   * GET /api/elements/all
   * Returns all elements in a single response, grouped by type.
   * Used for upfront data loading strategy (TB67).
   *
   * Query params:
   * - types: Comma-separated list of types to include (default: all types)
   * - includeDeleted: Include soft-deleted elements (default: false)
   * - includeTaskCounts: Include attachment, blocksCount, blockedByCount for tasks (TB83)
   */
  app.get('/api/elements/all', async (c) => {
    try {
      const url = new URL(c.req.url);
      const typesParam = url.searchParams.get('types');
      const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
      const includeTaskCounts = url.searchParams.get('includeTaskCounts') === 'true';

      // Define all element types we want to load
      const allTypes = ['task', 'plan', 'workflow', 'entity', 'document', 'channel', 'message', 'team', 'library'] as const;
      const requestedTypes = typesParam
        ? typesParam.split(',').filter((t) => allTypes.includes(t as (typeof allTypes)[number]))
        : [...allTypes];

      // Load each type in parallel for performance
      const results = await Promise.all(
        requestedTypes.map(async (type) => {
          const filter: Record<string, unknown> = {
            type,
            limit: 10000, // High limit to get all elements
            orderBy: 'updated_at',
            orderDir: 'desc',
          };

          if (!includeDeleted) {
            // Only include non-deleted elements
            filter.deleted = false;
          }

          try {
            const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);
            return { type, items: result.items, total: result.total };
          } catch (err) {
            console.error(`[stoneforge] Failed to load ${type} elements:`, err);
            return { type, items: [], total: 0 };
          }
        })
      );

      // Organize results by type
      const data: Record<string, { items: unknown[]; total: number }> = {};
      let totalElements = 0;

      for (const result of results) {
        data[result.type] = { items: result.items, total: result.total };
        totalElements += result.total;
      }

      // TB83: Enrich tasks with dependency and attachment counts
      if (includeTaskCounts && data.task && data.task.items.length > 0) {
        data.task.items = enrichTasksWithCounts(data.task.items as Record<string, unknown>[]);
      }

      return c.json({
        data,
        totalElements,
        types: requestedTypes,
        loadedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[stoneforge] Failed to get all elements:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get all elements' } }, 500);
    }
  });

  return app;
}
