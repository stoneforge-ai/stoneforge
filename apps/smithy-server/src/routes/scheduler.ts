/**
 * Steward Scheduler Routes
 *
 * Steward scheduling, execution, and history endpoints.
 */

import { Hono } from 'hono';
import type { EntityId } from '@stoneforge/core';
import { createLogger } from '@stoneforge/smithy';
import type { Services } from '../services.js';
import { formatExecutionEntry } from '../formatters.js';

const logger = createLogger('orchestrator');

export function createSchedulerRoutes(services: Services) {
  const { stewardScheduler } = services;
  const app = new Hono();

  // GET /api/scheduler/status
  app.get('/api/scheduler/status', (c) => {
    const stats = stewardScheduler.getStats();
    return c.json({ isRunning: stewardScheduler.isRunning(), stats });
  });

  // POST /api/scheduler/start
  app.post('/api/scheduler/start', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        registerAllStewards?: boolean;
      };

      await stewardScheduler.start();

      if (body.registerAllStewards) {
        const registered = await stewardScheduler.registerAllStewards();
        return c.json({
          success: true,
          isRunning: stewardScheduler.isRunning(),
          registeredStewards: registered,
        });
      }

      return c.json({ success: true, isRunning: stewardScheduler.isRunning() });
    } catch (error) {
      logger.error('Failed to start scheduler:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/scheduler/stop
  app.post('/api/scheduler/stop', async (c) => {
    try {
      await stewardScheduler.stop();
      return c.json({ success: true, isRunning: stewardScheduler.isRunning() });
    } catch (error) {
      logger.error('Failed to stop scheduler:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/scheduler/register-all
  app.post('/api/scheduler/register-all', async (c) => {
    try {
      const registered = await stewardScheduler.registerAllStewards();
      return c.json({
        success: true,
        registeredCount: registered,
        stats: stewardScheduler.getStats(),
      });
    } catch (error) {
      logger.error('Failed to register stewards:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/scheduler/stewards/:id/register
  app.post('/api/scheduler/stewards/:id/register', async (c) => {
    try {
      const stewardId = c.req.param('id') as EntityId;

      const success = await stewardScheduler.registerSteward(stewardId);
      if (!success) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Steward not found or invalid' } }, 404);
      }

      return c.json({
        success: true,
        stewardId,
        jobs: stewardScheduler.getScheduledJobs(stewardId),
        subscriptions: stewardScheduler.getEventSubscriptions(stewardId),
      });
    } catch (error) {
      logger.error('Failed to register steward:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/scheduler/stewards/:id/unregister
  app.post('/api/scheduler/stewards/:id/unregister', async (c) => {
    try {
      const stewardId = c.req.param('id') as EntityId;
      const success = await stewardScheduler.unregisterSteward(stewardId);
      return c.json({ success, stewardId });
    } catch (error) {
      logger.error('Failed to unregister steward:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/scheduler/stewards/:id/execute
  app.post('/api/scheduler/stewards/:id/execute', async (c) => {
    try {
      const stewardId = c.req.param('id') as EntityId;
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

      const result = await stewardScheduler.executeSteward(stewardId, body);
      return c.json({ success: result.success, result });
    } catch (error) {
      logger.error('Failed to execute steward:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/scheduler/events
  app.post('/api/scheduler/events', async (c) => {
    try {
      const body = (await c.req.json()) as {
        eventName: string;
        eventData?: Record<string, unknown>;
      };

      if (!body.eventName) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'eventName is required' } }, 400);
      }

      const triggered = await stewardScheduler.publishEvent(body.eventName, body.eventData ?? {});
      return c.json({ success: true, eventName: body.eventName, stewardsTriggered: triggered });
    } catch (error) {
      logger.error('Failed to publish event:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/scheduler/jobs
  app.get('/api/scheduler/jobs', (c) => {
    const url = new URL(c.req.url);
    const stewardId = url.searchParams.get('stewardId') as EntityId | null;
    const jobs = stewardScheduler.getScheduledJobs(stewardId ?? undefined);
    return c.json({ jobs });
  });

  // GET /api/scheduler/subscriptions
  app.get('/api/scheduler/subscriptions', (c) => {
    const url = new URL(c.req.url);
    const stewardId = url.searchParams.get('stewardId') as EntityId | null;
    const subscriptions = stewardScheduler.getEventSubscriptions(stewardId ?? undefined);
    return c.json({ subscriptions });
  });

  // GET /api/scheduler/history
  app.get('/api/scheduler/history', (c) => {
    const url = new URL(c.req.url);
    const stewardId = url.searchParams.get('stewardId') as EntityId | null;
    const triggerType = url.searchParams.get('triggerType') as 'cron' | 'event' | null;
    const successParam = url.searchParams.get('success');
    const limitParam = url.searchParams.get('limit');

    const history = stewardScheduler.getExecutionHistory({
      stewardId: stewardId ?? undefined,
      triggerType: triggerType ?? undefined,
      success: successParam !== null ? successParam === 'true' : undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return c.json({ history: history.map(formatExecutionEntry), count: history.length });
  });

  // GET /api/scheduler/stewards/:id/last-execution
  app.get('/api/scheduler/stewards/:id/last-execution', (c) => {
    const stewardId = c.req.param('id') as EntityId;
    const lastExecution = stewardScheduler.getLastExecution(stewardId);

    if (!lastExecution) {
      return c.json({ lastExecution: null });
    }

    return c.json({ lastExecution: formatExecutionEntry(lastExecution) });
  });

  return app;
}
