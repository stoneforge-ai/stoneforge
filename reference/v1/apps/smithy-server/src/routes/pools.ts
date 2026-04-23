/**
 * Pool Routes
 *
 * Agent pool management endpoints.
 */

import { Hono } from 'hono';
import type { EntityId, ElementId } from '@stoneforge/core';
import { createLogger } from '@stoneforge/smithy';
import type { Services } from '../services.js';
import type { AgentPoolService, CreatePoolInput, UpdatePoolInput, PoolAgentTypeConfig } from '@stoneforge/smithy';

const logger = createLogger('orchestrator');

export function createPoolRoutes(services: Services) {
  const { poolService } = services;
  const app = new Hono();

  // Check if pool service is available
  if (!poolService) {
    // Return routes that return 503 Service Unavailable
    app.all('/api/pools*', async (c) => {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Pool service is not available' } }, 503);
    });
    return app;
  }

  // GET /api/pools - List all pools
  app.get('/api/pools', async (c) => {
    try {
      const url = new URL(c.req.url);
      const enabled = url.searchParams.get('enabled');
      const available = url.searchParams.get('available');
      const tag = url.searchParams.get('tag');

      const pools = await poolService.listPools({
        enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
        hasAvailableSlots: available === 'true',
        tags: tag ? [tag] : undefined,
      });

      return c.json({ pools });
    } catch (error) {
      logger.error('Failed to list pools:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/pools - Create a new pool
  app.post('/api/pools', async (c) => {
    try {
      const body = (await c.req.json()) as {
        name: string;
        description?: string;
        maxSize: number;
        agentTypes?: PoolAgentTypeConfig[];
        enabled?: boolean;
        tags?: string[];
        createdBy?: string;
      };

      if (!body.name) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
      }

      if (typeof body.maxSize !== 'number' || body.maxSize < 1 || body.maxSize > 1000) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'maxSize must be between 1 and 1000' } }, 400);
      }

      const input: CreatePoolInput = {
        name: body.name,
        description: body.description,
        maxSize: body.maxSize,
        agentTypes: body.agentTypes ?? [],
        enabled: body.enabled ?? true,
        tags: body.tags,
        createdBy: (body.createdBy ?? 'el-0000') as EntityId,
      };

      const pool = await poolService.createPool(input);
      return c.json({ pool }, 201);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('already exists')) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
      }
      logger.error('Failed to create pool:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  // GET /api/pools/:id - Get a pool by ID or name
  app.get('/api/pools/:id', async (c) => {
    try {
      const idOrName = c.req.param('id');

      let pool;
      if (idOrName.startsWith('el-')) {
        pool = await poolService.getPool(idOrName as ElementId);
      }
      if (!pool) {
        pool = await poolService.getPoolByName(idOrName);
      }

      if (!pool) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Pool not found' } }, 404);
      }

      return c.json({ pool });
    } catch (error) {
      logger.error('Failed to get pool:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // PATCH /api/pools/:id - Update a pool
  app.patch('/api/pools/:id', async (c) => {
    try {
      const idOrName = c.req.param('id');
      const body = (await c.req.json()) as UpdatePoolInput;

      let pool;
      if (idOrName.startsWith('el-')) {
        pool = await poolService.getPool(idOrName as ElementId);
      }
      if (!pool) {
        pool = await poolService.getPoolByName(idOrName);
      }

      if (!pool) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Pool not found' } }, 404);
      }

      // Validate maxSize if provided
      if (body.maxSize !== undefined && (typeof body.maxSize !== 'number' || body.maxSize < 1 || body.maxSize > 1000)) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'maxSize must be between 1 and 1000' } }, 400);
      }

      const updatedPool = await poolService.updatePool(pool.id, body);
      return c.json({ pool: updatedPool });
    } catch (error) {
      logger.error('Failed to update pool:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // DELETE /api/pools/:id - Delete a pool
  app.delete('/api/pools/:id', async (c) => {
    try {
      const idOrName = c.req.param('id');
      const url = new URL(c.req.url);
      const force = url.searchParams.get('force') === 'true';

      let pool;
      if (idOrName.startsWith('el-')) {
        pool = await poolService.getPool(idOrName as ElementId);
      }
      if (!pool) {
        pool = await poolService.getPoolByName(idOrName);
      }

      if (!pool) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Pool not found' } }, 404);
      }

      // Check for active agents unless force is set
      if (pool.status.activeCount > 0 && !force) {
        return c.json({
          error: {
            code: 'POOL_HAS_ACTIVE_AGENTS',
            message: `Pool has ${pool.status.activeCount} active agent(s). Use ?force=true to delete anyway.`,
          },
        }, 409);
      }

      await poolService.deletePool(pool.id);
      return c.json({ success: true, deleted: pool.id });
    } catch (error) {
      logger.error('Failed to delete pool:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/pools/:id/status - Get pool status
  app.get('/api/pools/:id/status', async (c) => {
    try {
      const idOrName = c.req.param('id');

      let pool;
      if (idOrName.startsWith('el-')) {
        pool = await poolService.getPool(idOrName as ElementId);
      }
      if (!pool) {
        pool = await poolService.getPoolByName(idOrName);
      }

      if (!pool) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Pool not found' } }, 404);
      }

      const status = await poolService.getPoolStatus(pool.id);
      return c.json({
        poolId: pool.id,
        poolName: pool.config.name,
        ...status,
      });
    } catch (error) {
      logger.error('Failed to get pool status:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/pools/refresh - Refresh all pool statuses
  app.post('/api/pools/refresh', async (c) => {
    try {
      await poolService.refreshAllPoolStatus();
      const pools = await poolService.listPools();
      return c.json({ success: true, poolCount: pools.length });
    } catch (error) {
      logger.error('Failed to refresh pool statuses:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
