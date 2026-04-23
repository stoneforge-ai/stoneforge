/**
 * Entities Routes Factory
 *
 * Entity listing endpoint for user selection and entity management.
 */

import { Hono } from 'hono';
import type { CollaborateServices } from './types.js';

export function createEntityRoutes(services: CollaborateServices) {
  const { api } = services;
  const app = new Hono();

  /**
   * GET /api/entities
   * List entities with optional filtering by entityType.
   *
   * Query params:
   * - limit: Max items to return (default: 50)
   * - offset: Pagination offset
   * - orderBy: Field to sort by (default: updated_at)
   * - orderDir: Sort direction (default: desc)
   * - entityType: Filter by entity type (agent, human, system)
   * - search: Search by name, id, or tags
   */
  app.get('/api/entities', async (c) => {
    try {
      const url = new URL(c.req.url);

      // Parse pagination and filter parameters
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');
      const orderByParam = url.searchParams.get('orderBy');
      const orderDirParam = url.searchParams.get('orderDir');
      const entityTypeParam = url.searchParams.get('entityType');
      const searchParam = url.searchParams.get('search');

      // Build filter
      const filter: Record<string, unknown> = {
        type: 'entity',
      };

      if (limitParam) {
        filter.limit = parseInt(limitParam, 10);
      } else {
        filter.limit = 50; // Default page size
      }
      if (offsetParam) {
        filter.offset = parseInt(offsetParam, 10);
      }
      if (orderByParam) {
        filter.orderBy = orderByParam;
      } else {
        filter.orderBy = 'updated_at';
      }
      if (orderDirParam) {
        filter.orderDir = orderDirParam;
      } else {
        filter.orderDir = 'desc';
      }

      // Get paginated results
      const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

      // Apply client-side filtering for entityType and search (not supported in base filter)
      let filteredItems = result.items;

      if (entityTypeParam && entityTypeParam !== 'all') {
        filteredItems = filteredItems.filter((e) => {
          const entity = e as unknown as { entityType: string };
          return entity.entityType === entityTypeParam;
        });
      }

      if (searchParam) {
        const query = searchParam.toLowerCase();
        filteredItems = filteredItems.filter((e) => {
          const entity = e as unknown as { name: string; id: string; tags?: string[] };
          return (
            entity.name.toLowerCase().includes(query) ||
            entity.id.toLowerCase().includes(query) ||
            (entity.tags || []).some((tag) => tag.toLowerCase().includes(query))
          );
        });
      }

      // Return paginated response format
      return c.json({
        items: filteredItems,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.hasMore,
      });
    } catch (error) {
      console.error('[stoneforge] Failed to get entities:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entities' } }, 500);
    }
  });

  return app;
}
