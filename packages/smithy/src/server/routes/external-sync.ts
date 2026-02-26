/**
 * External Sync Routes
 *
 * HTTP endpoints for manual sync triggers and status reporting.
 * Allows triggering push/pull/sync operations and querying sync status.
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import { createLogger } from '../../utils/logger.js';
import {
  createSyncEngine,
  createDefaultProviderRegistry,
  createConfiguredProviderRegistry,
  type SyncOptions,
} from '@stoneforge/quarry';
import {
  getExternalSyncState,
  type ProviderConfig,
} from '@stoneforge/core';

const logger = createLogger('external-sync-routes');

export function createExternalSyncRoutes(services: Services) {
  const { api, settingsService } = services;
  const app = new Hono();

  /**
   * Create a SyncEngine instance using current settings.
   * The engine is created per-request to pick up latest provider configs.
   */
  function createEngine() {
    const syncSettings = settingsService.getExternalSyncSettings();

    // Build provider configs from settings
    const providerConfigs: ProviderConfig[] = Object.values(syncSettings.providers)
      .filter((p): p is ProviderConfig => !!p.token)
      .map((p) => ({
        provider: p.provider,
        token: p.token,
        apiBaseUrl: p.apiBaseUrl,
        defaultProject: p.defaultProject,
      }));

    // Create a registry with real configured providers replacing placeholders
    const registry = createConfiguredProviderRegistry(providerConfigs);

    return createSyncEngine({
      api,
      registry,
      settings: settingsService,
      providerConfigs,
    });
  }

  // POST /api/external-sync/push — Trigger push for all linked tasks (or specific taskIds in body)
  app.post('/api/external-sync/push', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as {
        taskIds?: string[];
      };

      const options: SyncOptions = {};
      if (body.taskIds && Array.isArray(body.taskIds) && body.taskIds.length > 0) {
        (options as { taskIds: string[] }).taskIds = body.taskIds;
      } else {
        (options as { all: boolean }).all = true;
      }

      const engine = createEngine();
      const result = await engine.push(options);

      return c.json({
        success: result.success,
        pushed: result.pushed,
        skipped: result.skipped,
        errors: result.errors,
        conflicts: result.conflicts,
      });
    } catch (error) {
      logger.error('Failed to trigger push:', error);
      return c.json(
        { error: { code: 'SYNC_PUSH_FAILED', message: String(error) } },
        500
      );
    }
  });

  // POST /api/external-sync/pull — Trigger pull from all configured providers
  app.post('/api/external-sync/pull', async (c) => {
    try {
      const engine = createEngine();
      const result = await engine.pull();

      return c.json({
        success: result.success,
        pulled: result.pulled,
        skipped: result.skipped,
        errors: result.errors,
        conflicts: result.conflicts,
      });
    } catch (error) {
      logger.error('Failed to trigger pull:', error);
      return c.json(
        { error: { code: 'SYNC_PULL_FAILED', message: String(error) } },
        500
      );
    }
  });

  // POST /api/external-sync/sync — Bidirectional sync (optional dryRun in body)
  app.post('/api/external-sync/sync', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as {
        dryRun?: boolean;
      };

      const options: SyncOptions = {};
      if (body.dryRun) {
        (options as { dryRun: boolean }).dryRun = true;
      }

      const engine = createEngine();
      const result = await engine.sync(options);

      return c.json({
        success: result.success,
        pushed: result.pushed,
        pulled: result.pulled,
        skipped: result.skipped,
        errors: result.errors,
        conflicts: result.conflicts,
        dryRun: !!body.dryRun,
      });
    } catch (error) {
      logger.error('Failed to trigger sync:', error);
      return c.json(
        { error: { code: 'SYNC_FAILED', message: String(error) } },
        500
      );
    }
  });

  // GET /api/external-sync/status — Return sync status
  app.get('/api/external-sync/status', async (c) => {
    try {
      const syncSettings = settingsService.getExternalSyncSettings();

      // Get provider information
      const providers = Object.entries(syncSettings.providers).map(([name, config]) => ({
        name,
        configured: !!config.token,
        project: config.defaultProject ?? null,
      }));

      // Count linked tasks by querying all tasks with _externalSync metadata
      const allTasks = await api.list({ type: 'task' });
      const linkedTasks = allTasks.filter(
        (task) => getExternalSyncState(task.metadata) !== undefined
      );

      // Find last sync timestamp from linked tasks
      let lastSyncAt: string | null = null;
      let pendingConflicts = 0;

      for (const task of linkedTasks) {
        const syncState = getExternalSyncState(task.metadata);
        if (syncState) {
          // Check for the most recent sync timestamp
          if (syncState.lastPushedAt && (!lastSyncAt || syncState.lastPushedAt > lastSyncAt)) {
            lastSyncAt = syncState.lastPushedAt;
          }
          if (syncState.lastPulledAt && (!lastSyncAt || syncState.lastPulledAt > lastSyncAt)) {
            lastSyncAt = syncState.lastPulledAt;
          }
        }

        // Count pending conflicts
        if (task.tags && task.tags.includes('sync-conflict')) {
          pendingConflicts++;
        }
      }

      return c.json({
        providers,
        linkedTaskCount: linkedTasks.length,
        lastSyncAt,
        pendingConflicts,
      });
    } catch (error) {
      logger.error('Failed to get sync status:', error);
      return c.json(
        { error: { code: 'STATUS_FAILED', message: String(error) } },
        500
      );
    }
  });

  // GET /api/external-sync/providers — List configured providers and connection status
  app.get('/api/external-sync/providers', async (c) => {
    try {
      const syncSettings = settingsService.getExternalSyncSettings();
      const registry = createDefaultProviderRegistry();

      const providers = registry.list().map((provider) => {
        const config = syncSettings.providers[provider.name];
        const hasToken = !!config?.token;

        return {
          name: provider.name,
          displayName: provider.displayName,
          supportedAdapters: [...provider.supportedAdapters],
          configured: hasToken,
          project: config?.defaultProject ?? null,
          apiBaseUrl: config?.apiBaseUrl ?? null,
        };
      });

      return c.json({
        providers,
        syncSettings: {
          pollIntervalMs: syncSettings.pollIntervalMs,
          defaultDirection: syncSettings.defaultDirection,
        },
      });
    } catch (error) {
      logger.error('Failed to list providers:', error);
      return c.json(
        { error: { code: 'PROVIDERS_FAILED', message: String(error) } },
        500
      );
    }
  });

  return app;
}
