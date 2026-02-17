/**
 * Agent Routes
 *
 * Agent registration, management, and status endpoints.
 */

import { Hono } from 'hono';
import type { EntityId } from '@stoneforge/core';
import { getProviderRegistry, ProviderError } from '@stoneforge/smithy/providers';
import type { Services } from '../services.js';
import { formatSessionRecord } from '../formatters.js';

export function createAgentRoutes(services: Services) {
  const { agentRegistry, sessionManager, taskAssignmentService, stewardScheduler } = services;
  const app = new Hono();

  // GET /api/agents
  app.get('/api/agents', async (c) => {
    try {
      const url = new URL(c.req.url);
      const role = url.searchParams.get('role') as 'director' | 'worker' | 'steward' | null;
      const agents = role ? await agentRegistry.getAgentsByRole(role) : await agentRegistry.listAgents();
      return c.json({ agents });
    } catch (error) {
      console.error('[orchestrator] Failed to list agents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/agents
  app.post('/api/agents', async (c) => {
    try {
      const body = (await c.req.json()) as {
        role: 'director' | 'worker' | 'steward';
        name: string;
        workerMode?: 'ephemeral' | 'persistent';
        stewardFocus?: 'merge' | 'health' | 'reminder' | 'ops';
        maxConcurrentTasks?: number;
        tags?: string[];
        triggers?: Array<{ type: 'cron'; schedule: string } | { type: 'event'; event: string; condition?: string }>;
        reportsTo?: string;
        createdBy?: string;
        provider?: string;
        model?: string;
      };

      if (!body.role || !body.name) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'role and name are required' } }, 400);
      }

      const createdBy = (body.createdBy ?? 'el-0000') as EntityId;
      let agent;

      switch (body.role) {
        case 'director':
          agent = await agentRegistry.registerDirector({
            name: body.name,
            createdBy,
            tags: body.tags,
            maxConcurrentTasks: body.maxConcurrentTasks,
            provider: body.provider,
            model: body.model,
          });
          break;

        case 'worker':
          if (!body.workerMode) {
            return c.json({ error: { code: 'INVALID_INPUT', message: 'workerMode is required for workers' } }, 400);
          }
          agent = await agentRegistry.registerWorker({
            name: body.name,
            workerMode: body.workerMode,
            createdBy,
            tags: body.tags,
            maxConcurrentTasks: body.maxConcurrentTasks,
            reportsTo: body.reportsTo as EntityId | undefined,
            provider: body.provider,
            model: body.model,
          });
          break;

        case 'steward':
          if (!body.stewardFocus) {
            return c.json({ error: { code: 'INVALID_INPUT', message: 'stewardFocus is required for stewards' } }, 400);
          }
          agent = await agentRegistry.registerSteward({
            name: body.name,
            stewardFocus: body.stewardFocus,
            triggers: body.triggers,
            createdBy,
            tags: body.tags,
            maxConcurrentTasks: body.maxConcurrentTasks,
            reportsTo: body.reportsTo as EntityId | undefined,
            provider: body.provider,
            model: body.model,
          });
          if (stewardScheduler.isRunning()) {
            try {
              await stewardScheduler.registerSteward(agent.id as unknown as EntityId);
            } catch (err) {
              console.warn('[orchestrator] Failed to auto-register steward with scheduler:', err);
            }
          }
          break;

        default:
          return c.json({ error: { code: 'INVALID_INPUT', message: `Invalid role: ${body.role}` } }, 400);
      }

      return c.json({ agent }, 201);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
      }
      console.error('[orchestrator] Failed to register agent:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  // POST /api/agents/director
  app.post('/api/agents/director', async (c) => {
    try {
      const body = (await c.req.json()) as {
        name: string;
        maxConcurrentTasks?: number;
        tags?: string[];
        createdBy?: string;
      };

      if (!body.name) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
      }

      const agent = await agentRegistry.registerDirector({
        name: body.name,
        createdBy: (body.createdBy ?? 'el-0000') as EntityId,
        tags: body.tags,
        maxConcurrentTasks: body.maxConcurrentTasks,
      });

      return c.json({ agent }, 201);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
      }
      console.error('[orchestrator] Failed to register director:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  // POST /api/agents/worker
  app.post('/api/agents/worker', async (c) => {
    try {
      const body = (await c.req.json()) as {
        name: string;
        workerMode: 'ephemeral' | 'persistent';
        maxConcurrentTasks?: number;
        tags?: string[];
        reportsTo?: string;
        createdBy?: string;
      };

      if (!body.name) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
      }
      if (!body.workerMode) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'workerMode is required' } }, 400);
      }
      if (body.workerMode !== 'ephemeral' && body.workerMode !== 'persistent') {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'workerMode must be "ephemeral" or "persistent"' } }, 400);
      }

      const agent = await agentRegistry.registerWorker({
        name: body.name,
        workerMode: body.workerMode,
        createdBy: (body.createdBy ?? 'el-0000') as EntityId,
        tags: body.tags,
        maxConcurrentTasks: body.maxConcurrentTasks,
        reportsTo: body.reportsTo as EntityId | undefined,
      });

      return c.json({ agent }, 201);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
      }
      console.error('[orchestrator] Failed to register worker:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  // POST /api/agents/steward
  app.post('/api/agents/steward', async (c) => {
    try {
      const body = (await c.req.json()) as {
        name: string;
        stewardFocus: 'merge' | 'health' | 'reminder' | 'ops';
        triggers?: Array<{ type: 'cron'; schedule: string } | { type: 'event'; event: string; condition?: string }>;
        maxConcurrentTasks?: number;
        tags?: string[];
        reportsTo?: string;
        createdBy?: string;
      };

      if (!body.name) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
      }
      if (!body.stewardFocus) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'stewardFocus is required' } }, 400);
      }
      const validFocuses = ['merge', 'health', 'reminder', 'ops'];
      if (!validFocuses.includes(body.stewardFocus)) {
        return c.json(
          { error: { code: 'INVALID_INPUT', message: `stewardFocus must be one of: ${validFocuses.join(', ')}` } },
          400
        );
      }

      if (body.triggers) {
        for (const trigger of body.triggers) {
          if (trigger.type === 'cron' && !trigger.schedule) {
            return c.json({ error: { code: 'INVALID_INPUT', message: 'Cron trigger requires a schedule' } }, 400);
          }
          if (trigger.type === 'event' && !trigger.event) {
            return c.json({ error: { code: 'INVALID_INPUT', message: 'Event trigger requires an event name' } }, 400);
          }
          if (trigger.type !== 'cron' && trigger.type !== 'event') {
            return c.json({ error: { code: 'INVALID_INPUT', message: 'Trigger type must be "cron" or "event"' } }, 400);
          }
        }
      }

      const agent = await agentRegistry.registerSteward({
        name: body.name,
        stewardFocus: body.stewardFocus,
        triggers: body.triggers,
        createdBy: (body.createdBy ?? 'el-0000') as EntityId,
        tags: body.tags,
        maxConcurrentTasks: body.maxConcurrentTasks,
        reportsTo: body.reportsTo as EntityId | undefined,
      });

      if (stewardScheduler.isRunning()) {
        try {
          await stewardScheduler.registerSteward(agent.id as unknown as EntityId);
        } catch (err) {
          console.warn('[orchestrator] Failed to auto-register steward with scheduler:', err);
        }
      }

      return c.json({ agent }, 201);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
      }
      console.error('[orchestrator] Failed to register steward:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  // GET /api/agents/:id
  app.get('/api/agents/:id', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }
      return c.json({ agent });
    } catch (error) {
      console.error('[orchestrator] Failed to get agent:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // PATCH /api/agents/:id
  app.patch('/api/agents/:id', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json()) as { name?: string; provider?: string; model?: string | null };

      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be a non-empty string' } }, 400);
      }

      if (body.provider !== undefined && (typeof body.provider !== 'string' || body.provider.trim().length === 0)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Provider must be a non-empty string' } }, 400);
      }

      if (body.model !== undefined && body.model !== null && (typeof body.model !== 'string' || body.model.trim().length === 0)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Model must be a non-empty string or null' } }, 400);
      }

      // Update name if provided
      let updatedAgent = agent;
      if (body.name !== undefined) {
        updatedAgent = await agentRegistry.updateAgent(agentId, { name: body.name.trim() });
      }

      // Update provider in agent metadata if provided
      if (body.provider !== undefined) {
        updatedAgent = await agentRegistry.updateAgentMetadata(agentId, { provider: body.provider.trim() });
      }

      // Update model in agent metadata if provided (null clears the override)
      if (body.model !== undefined) {
        updatedAgent = await agentRegistry.updateAgentMetadata(agentId, {
          model: body.model === null ? undefined : body.model.trim(),
        });
      }

      return c.json({ agent: updatedAgent });
    } catch (error) {
      console.error('[orchestrator] Failed to update agent:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // DELETE /api/agents/:id
  app.delete('/api/agents/:id', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;

      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      // Check if agent has an active session
      const activeSession = sessionManager.getActiveSession(agentId);
      if (activeSession) {
        return c.json({ error: { code: 'AGENT_BUSY', message: 'Cannot delete agent with active session. Stop the agent first.' } }, 409);
      }

      await agentRegistry.deleteAgent(agentId);
      return c.json({ success: true });
    } catch (error) {
      console.error('[orchestrator] Failed to delete agent:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/agents/:id/status
  app.get('/api/agents/:id/status', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const activeSession = sessionManager.getActiveSession(agentId);
      const history = await sessionManager.getSessionHistory(agentId, 5);

      return c.json({
        agentId,
        hasActiveSession: !!activeSession,
        activeSession: activeSession ? formatSessionRecord(activeSession) : null,
        recentHistory: history,
      });
    } catch (error) {
      console.error('[orchestrator] Failed to get agent status:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/agents/:id/workload
  app.get('/api/agents/:id/workload', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;

      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const workload = await taskAssignmentService.getAgentWorkload(agentId);
      const hasCapacity = await taskAssignmentService.agentHasCapacity(agentId);
      const agentMeta = (agent.metadata as { agent?: { capabilities?: { maxConcurrentTasks?: number } } })?.agent;
      const maxConcurrentTasks = agentMeta?.capabilities?.maxConcurrentTasks ?? 3;

      return c.json({ agentId, agentName: agent.name, workload, hasCapacity, maxConcurrentTasks });
    } catch (error) {
      console.error('[orchestrator] Failed to get agent workload:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/providers
  app.get('/api/providers', async (c) => {
    try {
      const registry = getProviderRegistry();
      const names = registry.list();
      const providers = await Promise.all(
        names.map(async (name) => {
          const p = registry.get(name)!;
          return {
            name,
            available: await p.isAvailable(),
            installInstructions: p.getInstallInstructions(),
          };
        })
      );
      return c.json({ providers });
    } catch (error) {
      console.error('[orchestrator] Failed to list providers:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/providers/:name/models
  app.get('/api/providers/:name/models', async (c) => {
    try {
      const providerName = c.req.param('name');
      const registry = getProviderRegistry();
      const provider = registry.get(providerName);

      if (!provider) {
        return c.json({ error: { code: 'NOT_FOUND', message: `Provider not found: ${providerName}` } }, 404);
      }

      const available = await provider.isAvailable();
      if (!available) {
        return c.json(
          {
            error: {
              code: 'PROVIDER_UNAVAILABLE',
              message: `Provider ${providerName} is not available. ${provider.getInstallInstructions()}`,
            },
          },
          503
        );
      }

      const models = await provider.listModels();
      return c.json({ models });
    } catch (error) {
      // ProviderError indicates the provider SDK failed (auth, process crash, etc.)
      // — treat as 503 (service unavailable) rather than 500 (internal server error)
      if (error instanceof ProviderError) {
        console.warn('[orchestrator] Provider error listing models:', error.message);
        return c.json(
          {
            error: {
              code: 'PROVIDER_UNAVAILABLE',
              message: error.message,
            },
          },
          503
        );
      }
      console.error('[orchestrator] Failed to list provider models:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
