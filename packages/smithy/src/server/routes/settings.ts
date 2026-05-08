/**
 * Settings Routes
 *
 * Server-side settings API for workspace-wide configuration.
 * Provides endpoints for managing agent defaults (e.g., executable paths per provider).
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import type { ServerAgentDefaults } from '../../services/settings-service.js';
import {
  getValue,
  updateConfigFile,
  getConfigPath,
  reloadConfig,
  type WorkflowPreset,
  VALID_WORKFLOW_PRESETS,
} from '@stoneforge/quarry';
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

      // Validate defaultModels if provided — must be an object of strings
      if (body.defaultModels !== undefined && typeof body.defaultModels !== 'object') {
        return c.json(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'defaultModels must be an object mapping provider names to model identifiers',
            },
          },
          400
        );
      }
      if (body.defaultModels) {
        for (const [key, value] of Object.entries(body.defaultModels)) {
          if (typeof value !== 'string') {
            return c.json(
              {
                error: {
                  code: 'INVALID_INPUT',
                  message: `defaultModels.${key} must be a string, got ${typeof value}`,
                },
              },
              400
            );
          }
        }
      }

      // Validate defaultProvider if provided — must be a non-empty string
      if (body.defaultProvider !== undefined
        && (typeof body.defaultProvider !== 'string' || body.defaultProvider.length === 0)) {
        return c.json(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'defaultProvider must be a non-empty string',
            },
          },
          400
        );
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

      if (body.defaultModels !== undefined) {
        defaults.defaultModels = body.defaultModels;
      }

      if (body.defaultProvider !== undefined) {
        defaults.defaultProvider = body.defaultProvider;
      }

      const updated = settingsService.setAgentDefaults(defaults);

      return c.json(updated);
    } catch (error) {
      logger.error('Failed to update agent defaults:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/settings/demo-mode
  app.get('/api/settings/demo-mode', (c) => {
    try {
      if (!services.demoModeService) {
        return c.json({ error: { code: 'NOT_AVAILABLE', message: 'Demo mode service not initialized' } }, 503);
      }
      const status = services.demoModeService.getStatus();
      return c.json(status);
    } catch (error) {
      logger.error('Failed to get demo mode status:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/settings/demo-mode/enable
  app.post('/api/settings/demo-mode/enable', async (c) => {
    try {
      if (!services.demoModeService) {
        return c.json({ error: { code: 'NOT_AVAILABLE', message: 'Demo mode service not initialized' } }, 503);
      }
      const result = await services.demoModeService.enable();
      return c.json(result);
    } catch (error) {
      logger.error('Failed to enable demo mode:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/settings/demo-mode/disable
  app.post('/api/settings/demo-mode/disable', async (c) => {
    try {
      if (!services.demoModeService) {
        return c.json({ error: { code: 'NOT_AVAILABLE', message: 'Demo mode service not initialized' } }, 503);
      }
      const result = await services.demoModeService.disable();
      return c.json(result);
    } catch (error) {
      logger.error('Failed to disable demo mode:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // ==========================================================================
  // Workflow Preset
  // ==========================================================================

  /**
   * Maps each workflow preset to its full configuration values.
   * Mirrors WORKFLOW_PRESET_CONFIGS from the init command.
   */
  const PRESET_CONFIGS: Record<WorkflowPreset, {
    merge: { autoMerge: boolean; targetBranch: string | null; requireApproval: boolean };
    workflow: { preset: WorkflowPreset };
    agents: { permissionModel: 'unrestricted' | 'restricted' };
  }> = {
    auto: {
      merge: { autoMerge: true, targetBranch: null, requireApproval: false },
      workflow: { preset: 'auto' },
      agents: { permissionModel: 'unrestricted' },
    },
    review: {
      merge: { autoMerge: true, targetBranch: 'stoneforge/review', requireApproval: false },
      workflow: { preset: 'review' },
      agents: { permissionModel: 'unrestricted' },
    },
    approve: {
      merge: { autoMerge: false, targetBranch: null, requireApproval: true },
      workflow: { preset: 'approve' },
      agents: { permissionModel: 'restricted' },
    },
  };

  // GET /api/settings/workflow-preset
  app.get('/api/settings/workflow-preset', (c) => {
    try {
      const preset = getValue('workflow.preset');
      return c.json({ preset: preset ?? null });
    } catch (error) {
      logger.error('Failed to get workflow preset:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // PUT /api/settings/workflow-preset
  app.put('/api/settings/workflow-preset', async (c) => {
    try {
      const body = await c.req.json() as { preset: string };

      if (!body || typeof body.preset !== 'string') {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: 'Request body must include a "preset" string' } },
          400
        );
      }

      if (!VALID_WORKFLOW_PRESETS.includes(body.preset as WorkflowPreset)) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: `Invalid preset "${body.preset}". Must be one of: ${VALID_WORKFLOW_PRESETS.join(', ')}` } },
          400
        );
      }

      const preset = body.preset as WorkflowPreset;
      const presetConfig = PRESET_CONFIGS[preset];
      const configPath = getConfigPath();

      if (!configPath) {
        return c.json(
          { error: { code: 'NOT_CONFIGURED', message: 'No config file found. Run "sf init" first.' } },
          400
        );
      }

      updateConfigFile(configPath, presetConfig);
      reloadConfig();

      return c.json({ preset, applied: presetConfig });
    } catch (error) {
      logger.error('Failed to update workflow preset:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
