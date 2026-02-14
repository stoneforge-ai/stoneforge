/**
 * Health Check Routes
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import { DB_PATH } from '../config.js';

export function createHealthRoutes(services: Services) {
  const app = new Hono();

  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: DB_PATH,
      services: {
        agentRegistry: 'ready',
        sessionManager: 'ready',
        spawnerService: 'ready',
        worktreeManager: services.worktreeManager ? 'ready' : 'disabled',
        taskAssignment: 'ready',
        dispatch: 'ready',
        roleDefinition: 'ready',
        workerTask: 'ready',
        stewardScheduler: services.stewardScheduler.isRunning() ? 'running' : 'stopped',
        dispatchDaemon: services.dispatchDaemon
          ? services.dispatchDaemon.isRunning()
            ? 'running'
            : 'stopped'
          : 'disabled',
      },
    });
  });

  return app;
}
