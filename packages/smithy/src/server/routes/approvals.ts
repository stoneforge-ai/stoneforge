/**
 * Approval Request Routes
 *
 * API endpoints for querying and resolving approval requests
 * in restricted permission mode.
 */

import { Hono } from 'hono';
import { createLogger } from '../../utils/logger.js';
import type { Services } from '../services.js';

const logger = createLogger('orchestrator');

export function createApprovalRoutes(services: Services) {
  const { approvalService } = services;
  const app = new Hono();

  // GET /api/approval-requests - List approval requests
  app.get('/api/approval-requests', async (c) => {
    try {
      const url = new URL(c.req.url);
      const status = url.searchParams.get('status') as 'pending' | 'approved' | 'denied' | null;
      const agentId = url.searchParams.get('agentId') ?? undefined;
      const sessionId = url.searchParams.get('sessionId') ?? undefined;
      const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;
      const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : undefined;

      const requests = await approvalService.listRequests({
        status: status ?? undefined,
        agentId: agentId as import('@stoneforge/core').EntityId | undefined,
        sessionId,
        limit,
        offset,
      });

      return c.json({ requests });
    } catch (error) {
      logger.error('Failed to list approval requests:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/approval-requests/:id - Get a specific approval request
  app.get('/api/approval-requests/:id', async (c) => {
    try {
      const requestId = c.req.param('id');
      const request = await approvalService.getRequest(requestId);
      if (!request) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Approval request not found' } }, 404);
      }
      return c.json({ request });
    } catch (error) {
      logger.error('Failed to get approval request:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/approval-requests/:id/resolve - Approve or deny a request
  app.post('/api/approval-requests/:id/resolve', async (c) => {
    try {
      const requestId = c.req.param('id');
      const body = (await c.req.json()) as {
        status: 'approved' | 'denied';
        resolvedBy?: string;
      };

      if (!body.status || !['approved', 'denied'].includes(body.status)) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: 'status must be "approved" or "denied"' } },
          400
        );
      }

      const request = await approvalService.resolveRequest(requestId, {
        status: body.status,
        resolvedBy: body.resolvedBy ?? 'human',
      });

      return c.json({ request });
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('not found')) {
        return c.json({ error: { code: 'NOT_FOUND', message: errorMessage } }, 404);
      }
      if (errorMessage.includes('already')) {
        return c.json({ error: { code: 'CONFLICT', message: errorMessage } }, 409);
      }
      logger.error('Failed to resolve approval request:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  return app;
}
