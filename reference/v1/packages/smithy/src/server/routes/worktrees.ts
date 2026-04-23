/**
 * Worktree Routes
 *
 * Git worktree management endpoints.
 */

import { Hono } from 'hono';
import type { ElementId } from '@stoneforge/core';
import type { Services } from '../services.js';
import { formatWorktreeInfo } from '../formatters.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('orchestrator');

export function createWorktreeRoutes(services: Services) {
  const { worktreeManager } = services;
  const app = new Hono();

  // GET /api/worktrees
  app.get('/api/worktrees', async (c) => {
    try {
      if (!worktreeManager) {
        return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled' } }, 503);
      }

      const worktrees = await worktreeManager.listWorktrees();
      return c.json({ worktrees: worktrees.map(formatWorktreeInfo) });
    } catch (error) {
      logger.error('Failed to list worktrees:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/worktrees/:path
  app.get('/api/worktrees/:path', async (c) => {
    try {
      if (!worktreeManager) {
        return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled' } }, 503);
      }

      const worktreePath = decodeURIComponent(c.req.param('path'));
      const worktree = await worktreeManager.getWorktree(worktreePath);
      if (!worktree) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Worktree not found' } }, 404);
      }
      return c.json({ worktree: formatWorktreeInfo(worktree) });
    } catch (error) {
      logger.error('Failed to get worktree:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/worktrees
  app.post('/api/worktrees', async (c) => {
    try {
      if (!worktreeManager) {
        return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled' } }, 503);
      }

      const body = (await c.req.json()) as {
        agentName: string;
        taskId: string;
        taskTitle?: string;
        customBranch?: string;
        customPath?: string;
        baseBranch?: string;
      };

      if (!body.agentName || !body.taskId) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'agentName and taskId are required' } }, 400);
      }

      const result = await worktreeManager.createWorktree({
        agentName: body.agentName,
        taskId: body.taskId as ElementId,
        taskTitle: body.taskTitle,
        customBranch: body.customBranch,
        customPath: body.customPath,
        baseBranch: body.baseBranch,
      });

      return c.json(
        {
          success: true,
          worktree: formatWorktreeInfo(result.worktree),
          branch: result.branch,
          path: result.path,
          branchCreated: result.branchCreated,
        },
        201
      );
    } catch (error) {
      logger.error('Failed to create worktree:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // DELETE /api/worktrees/:path
  app.delete('/api/worktrees/:path', async (c) => {
    try {
      if (!worktreeManager) {
        return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled' } }, 503);
      }

      const worktreePath = decodeURIComponent(c.req.param('path'));
      const url = new URL(c.req.url);
      const force = url.searchParams.get('force') === 'true';
      const deleteBranch = url.searchParams.get('deleteBranch') === 'true';

      await worktreeManager.removeWorktree(worktreePath, { force, deleteBranch });
      return c.json({ success: true });
    } catch (error) {
      logger.error('Failed to remove worktree:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
