/**
 * Dispatch Daemon Routes
 *
 * API endpoints for controlling the dispatch daemon lifecycle.
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import { saveDaemonState, saveDaemonConfigOverrides } from '../daemon-state.js';
import { createLogger } from '../../utils/logger.js';
import { parseRateLimitResetTime } from '../../utils/rate-limit-parser.js';

const logger = createLogger('orchestrator');

/**
 * Whether the daemon was started by the server (vs CLI or manual).
 * Used to warn CLI users when stopping a server-managed daemon.
 */
let serverManaged = false;

/**
 * Mark the daemon as server-managed (called during auto-start).
 */
export function markDaemonAsServerManaged(): void {
  serverManaged = true;
}

export function createDaemonRoutes(services: Services) {
  const { dispatchDaemon } = services;
  const app = new Hono();

  // GET /api/daemon/status
  app.get('/api/daemon/status', (c) => {
    if (!dispatchDaemon) {
      return c.json({
        isRunning: false,
        available: false,
        reason: 'DispatchDaemon not available (no git repository)',
        serverManaged: false,
      });
    }

    const config = dispatchDaemon.getConfig();
    const rateLimitStatus = dispatchDaemon.getRateLimitStatus();
    return c.json({
      isRunning: dispatchDaemon.isRunning(),
      available: true,
      serverManaged,
      config: {
        pollIntervalMs: config.pollIntervalMs,
        workerAvailabilityPollEnabled: config.workerAvailabilityPollEnabled,
        inboxPollEnabled: config.inboxPollEnabled,
        stewardTriggerPollEnabled: config.stewardTriggerPollEnabled,
        workflowTaskPollEnabled: config.workflowTaskPollEnabled,
        directorInboxForwardingEnabled: config.directorInboxForwardingEnabled,
      },
      rateLimit: rateLimitStatus,
    });
  });

  // POST /api/daemon/start
  app.post('/api/daemon/start', async (c) => {
    if (!dispatchDaemon) {
      return c.json(
        {
          error: {
            code: 'DAEMON_UNAVAILABLE',
            message: 'DispatchDaemon not available (no git repository)',
          },
        },
        503
      );
    }

    try {
      if (dispatchDaemon.isRunning()) {
        return c.json({
          success: true,
          isRunning: true,
          alreadyRunning: true,
          serverManaged,
          message: 'Daemon is already running',
        });
      }

      dispatchDaemon.start();

      // Persist state so daemon restarts after server restart
      saveDaemonState(true, 'user');

      return c.json({
        success: true,
        isRunning: dispatchDaemon.isRunning(),
        alreadyRunning: false,
        serverManaged,
      });
    } catch (error) {
      logger.error('Failed to start daemon:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/daemon/stop
  app.post('/api/daemon/stop', async (c) => {
    if (!dispatchDaemon) {
      return c.json(
        {
          error: {
            code: 'DAEMON_UNAVAILABLE',
            message: 'DispatchDaemon not available (no git repository)',
          },
        },
        503
      );
    }

    try {
      const wasRunning = dispatchDaemon.isRunning();
      const wasServerManaged = serverManaged;

      dispatchDaemon.stop();

      // Persist state so daemon stays stopped after server restart
      saveDaemonState(false, 'user');

      // Reset server-managed flag when stopped
      serverManaged = false;

      return c.json({
        success: true,
        isRunning: dispatchDaemon.isRunning(),
        wasRunning,
        wasServerManaged,
        message: wasServerManaged
          ? 'Daemon stopped. Note: This daemon was auto-started by the server.'
          : 'Daemon stopped.',
      });
    } catch (error) {
      logger.error('Failed to stop daemon:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/daemon/poll/:type - Manual poll trigger
  app.post('/api/daemon/poll/:type', async (c) => {
    if (!dispatchDaemon) {
      return c.json(
        {
          error: {
            code: 'DAEMON_UNAVAILABLE',
            message: 'DispatchDaemon not available (no git repository)',
          },
        },
        503
      );
    }

    const pollType = c.req.param('type');

    try {
      let result;
      switch (pollType) {
        case 'worker-availability':
          result = await dispatchDaemon.pollWorkerAvailability();
          break;
        case 'inbox':
          result = await dispatchDaemon.pollInboxes();
          break;
        case 'steward-trigger':
          result = await dispatchDaemon.pollStewardTriggers();
          break;
        case 'workflow-task':
          result = await dispatchDaemon.pollWorkflowTasks();
          break;
        default:
          return c.json(
            {
              error: {
                code: 'INVALID_POLL_TYPE',
                message: `Invalid poll type: ${pollType}. Valid types: worker-availability, inbox, steward-trigger, workflow-task`,
              },
            },
            400
          );
      }

      return c.json({ success: true, result });
    } catch (error) {
      logger.error(`Failed to run ${pollType} poll:`, error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // PATCH /api/daemon/config - Update daemon configuration
  app.patch('/api/daemon/config', async (c) => {
    if (!dispatchDaemon) {
      return c.json(
        {
          error: {
            code: 'DAEMON_UNAVAILABLE',
            message: 'DispatchDaemon not available (no git repository)',
          },
        },
        503
      );
    }

    try {
      const body = (await c.req.json()) as {
        pollIntervalMs?: number;
        workerAvailabilityPollEnabled?: boolean;
        inboxPollEnabled?: boolean;
        stewardTriggerPollEnabled?: boolean;
        workflowTaskPollEnabled?: boolean;
        directorInboxForwardingEnabled?: boolean;
      };

      dispatchDaemon.updateConfig(body);

      // Persist config overrides that should survive server restarts
      if (body.directorInboxForwardingEnabled !== undefined) {
        saveDaemonConfigOverrides({
          directorInboxForwardingEnabled: body.directorInboxForwardingEnabled,
        });
      }

      return c.json({
        success: true,
        config: dispatchDaemon.getConfig(),
      });
    } catch (error) {
      logger.error('Failed to update daemon config:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/daemon/sleep - Manually pause dispatch until a specified time
  app.post('/api/daemon/sleep', async (c) => {
    if (!dispatchDaemon) {
      return c.json(
        {
          error: {
            code: 'DAEMON_UNAVAILABLE',
            message: 'DispatchDaemon not available (no git repository)',
          },
        },
        503
      );
    }

    try {
      const body = (await c.req.json()) as {
        until?: string;
        duration?: number;
      };

      let resetTime: Date | undefined;

      if (body.until) {
        // Prepend "resets " to match the rate limit parser's expected format
        const input = body.until.toLowerCase().startsWith('resets')
          ? body.until
          : `resets ${body.until}`;
        resetTime = parseRateLimitResetTime(input);
        if (!resetTime) {
          return c.json(
            {
              error: {
                code: 'INVALID_TIME',
                message: `Could not parse time: "${body.until}". Supported formats: "3am", "Feb 22 at 9:30am", "tomorrow at 3pm"`,
              },
            },
            400
          );
        }
      } else if (body.duration !== undefined) {
        if (typeof body.duration !== 'number' || body.duration <= 0) {
          return c.json(
            {
              error: {
                code: 'INVALID_DURATION',
                message: 'Duration must be a positive number (seconds)',
              },
            },
            400
          );
        }
        resetTime = new Date(Date.now() + body.duration * 1000);
      } else {
        return c.json(
          {
            error: {
              code: 'MISSING_PARAMETER',
              message: 'Either "until" (time string) or "duration" (seconds) is required',
            },
          },
          400
        );
      }

      dispatchDaemon.sleepUntil(resetTime);

      return c.json({
        success: true,
        sleepUntil: resetTime.toISOString(),
        message: `Daemon dispatch paused until ${resetTime.toISOString()}`,
      });
    } catch (error) {
      logger.error('Failed to put daemon to sleep:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/daemon/wake - Immediately resume dispatch
  app.post('/api/daemon/wake', async (c) => {
    if (!dispatchDaemon) {
      return c.json(
        {
          error: {
            code: 'DAEMON_UNAVAILABLE',
            message: 'DispatchDaemon not available (no git repository)',
          },
        },
        503
      );
    }

    try {
      dispatchDaemon.wake();

      return c.json({
        success: true,
        message: 'Daemon dispatch resumed. Rate limits cleared.',
      });
    } catch (error) {
      logger.error('Failed to wake daemon:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
