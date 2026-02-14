/**
 * Plugin Executor Routes
 *
 * Plugin validation, execution, and built-in plugin endpoints.
 */

import { Hono } from 'hono';
import type { StewardPlugin } from '@stoneforge/smithy';
import type { Services } from '../services.js';
import { formatPluginExecutionResult } from '../formatters.js';

export function createPluginRoutes(services: Services) {
  const { pluginExecutor } = services;
  const app = new Hono();

  // GET /api/plugins/builtin
  app.get('/api/plugins/builtin', (c) => {
    const names = pluginExecutor.listBuiltIns();
    const plugins = names
      .map((name) => {
        const plugin = pluginExecutor.getBuiltIn(name);
        return plugin
          ? {
              name: plugin.name,
              type: plugin.type,
              description: plugin.description,
              tags: plugin.tags,
              timeout: plugin.timeout,
              continueOnError: plugin.continueOnError,
            }
          : null;
      })
      .filter(Boolean);

    return c.json({ plugins, count: plugins.length });
  });

  // GET /api/plugins/builtin/:name
  app.get('/api/plugins/builtin/:name', (c) => {
    const name = c.req.param('name');
    const plugin = pluginExecutor.getBuiltIn(name);

    if (!plugin) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Built-in plugin not found: ${name}` } }, 404);
    }

    return c.json({ plugin });
  });

  // POST /api/plugins/validate
  app.post('/api/plugins/validate', async (c) => {
    try {
      const plugin = (await c.req.json()) as StewardPlugin;
      const result = pluginExecutor.validate(plugin);
      return c.json({ valid: result.valid, errors: result.errors });
    } catch (error) {
      console.error('[orchestrator] Failed to validate plugin:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/plugins/execute
  app.post('/api/plugins/execute', async (c) => {
    try {
      const body = (await c.req.json()) as {
        plugin: StewardPlugin;
        options?: {
          workspaceRoot?: string;
          defaultTimeout?: number;
          env?: Record<string, string>;
          stopOnError?: boolean;
        };
      };

      if (!body.plugin) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'plugin is required' } }, 400);
      }

      const result = await pluginExecutor.execute(body.plugin, body.options);
      return c.json({ result: formatPluginExecutionResult(result) });
    } catch (error) {
      console.error('[orchestrator] Failed to execute plugin:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/plugins/execute-batch
  app.post('/api/plugins/execute-batch', async (c) => {
    try {
      const body = (await c.req.json()) as {
        plugins: StewardPlugin[];
        options?: {
          workspaceRoot?: string;
          defaultTimeout?: number;
          env?: Record<string, string>;
          stopOnError?: boolean;
        };
      };

      if (!body.plugins || !Array.isArray(body.plugins)) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'plugins array is required' } }, 400);
      }

      const result = await pluginExecutor.executeBatch(body.plugins, body.options);

      return c.json({
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped,
        allSucceeded: result.allSucceeded,
        durationMs: result.durationMs,
        results: result.results.map(formatPluginExecutionResult),
      });
    } catch (error) {
      console.error('[orchestrator] Failed to execute plugins batch:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/plugins/execute-builtin/:name
  app.post('/api/plugins/execute-builtin/:name', async (c) => {
    try {
      const name = c.req.param('name');
      const body = (await c.req.json().catch(() => ({}))) as {
        options?: {
          workspaceRoot?: string;
          defaultTimeout?: number;
          env?: Record<string, string>;
        };
      };

      const plugin = pluginExecutor.getBuiltIn(name);
      if (!plugin) {
        return c.json({ error: { code: 'NOT_FOUND', message: `Built-in plugin not found: ${name}` } }, 404);
      }

      const result = await pluginExecutor.execute(plugin, body.options);
      return c.json({ result: formatPluginExecutionResult(result) });
    } catch (error) {
      console.error('[orchestrator] Failed to execute built-in plugin:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
