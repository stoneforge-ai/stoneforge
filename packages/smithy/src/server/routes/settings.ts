/**
 * Settings Routes
 *
 * Server-side settings API for workspace-wide configuration.
 * Provides endpoints for managing agent defaults (e.g., executable paths per provider).
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import type { ServerAgentDefaults } from '../../services/settings-service.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('settings-routes');

export function createSettingsRoutes(services: Services) {
  const { settingsService } = services;
  const app = new Hono();

  // GET /api/settings/agent-defaults
  app.get('/api/settings/agent-defaults', (c) => {
    try {
      const defaults = settingsService.getAgentDefaults();
      return c.json(defaults);
    } catch (error) {
      logger.error('Failed to get agent defaults:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // PUT /api/settings/agent-defaults
  app.put('/api/settings/agent-defaults', async (c) => {
    try {
      const body = (await c.req.json()) as ServerAgentDefaults;

      // Validate request body
      if (!body || typeof body !== 'object') {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: 'Request body must be a JSON object' } },
          400
        );
      }

      if (body.defaultExecutablePaths !== undefined && typeof body.defaultExecutablePaths !== 'object') {
        return c.json(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'defaultExecutablePaths must be an object mapping provider names to executable paths',
            },
          },
          400
        );
      }

      // Validate that all values in defaultExecutablePaths are strings
      if (body.defaultExecutablePaths) {
        for (const [key, value] of Object.entries(body.defaultExecutablePaths)) {
          if (typeof value !== 'string') {
            return c.json(
              {
                error: {
                  code: 'INVALID_INPUT',
                  message: `defaultExecutablePaths.${key} must be a string, got ${typeof value}`,
                },
              },
              400
            );
          }
        }
      }

      // Validate fallbackChain if provided — must be an array
      if (body.fallbackChain !== undefined && !Array.isArray(body.fallbackChain)) {
        return c.json(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'fallbackChain must be an array of executable names/paths',
            },
          },
          400
        );
      }

      const defaults: ServerAgentDefaults = {
        defaultExecutablePaths: body.defaultExecutablePaths ?? {},
      };

      if (body.fallbackChain !== undefined) {
        defaults.fallbackChain = body.fallbackChain;
      }

      const updated = settingsService.setAgentDefaults(defaults);

      return c.json(updated);
    } catch (error) {
      logger.error('Failed to update agent defaults:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
