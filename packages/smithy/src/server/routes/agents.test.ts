/**
 * Agent Routes Tests — PATCH /api/agents/:id disabled handling
 *
 * Covers the disabled-flag plumbing on the PATCH route:
 * - boolean validation (400 on non-boolean)
 * - metadata write through agentRegistry.updateAgentMetadata
 * - live scheduler reconciliation for stewards (register on enable, unregister on disable)
 * - non-steward agents do NOT touch the scheduler
 * - scheduler errors are warning-swallowed and do not fail the request
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ElementId } from '@stoneforge/core';
import type { Services } from '../services.js';
import { createAgentRoutes } from './agents.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface MinimalAgent {
  id: ElementId;
  name: string;
  metadata: { agent: { agentRole: 'director' | 'worker' | 'steward'; sessionStatus?: string; workerMode?: string; stewardFocus?: string; disabled?: boolean } };
}

function createMockAgent(role: 'director' | 'worker' | 'steward', overrides: Partial<MinimalAgent> = {}): MinimalAgent {
  const baseMeta: MinimalAgent['metadata']['agent'] = {
    agentRole: role,
    sessionStatus: 'idle',
    ...(role === 'worker' ? { workerMode: 'ephemeral' as const } : {}),
    ...(role === 'steward' ? { stewardFocus: 'merge' as const } : {}),
  };
  return {
    id: 'agent-001' as ElementId,
    name: `Test-${role}`,
    metadata: { agent: baseMeta },
    ...overrides,
  };
}

// ============================================================================
// Mock Services Factory
// ============================================================================

function createMockServices() {
  const agentRegistry = {
    getAgent: vi.fn(),
    listAgents: vi.fn(),
    getAgentsByRole: vi.fn(),
    updateAgent: vi.fn(),
    updateAgentMetadata: vi.fn(),
  };

  const stewardScheduler = {
    isRunning: vi.fn().mockReturnValue(true),
    registerSteward: vi.fn().mockResolvedValue(true),
    unregisterSteward: vi.fn().mockResolvedValue(true),
    refreshSteward: vi.fn().mockResolvedValue(undefined),
  };

  const sessionManager = {
    getActiveSession: vi.fn(),
  };

  const services = {
    agentRegistry,
    sessionManager,
    taskAssignmentService: {},
    stewardScheduler,
  } as unknown as Services;

  return { services, agentRegistry, stewardScheduler };
}

// ============================================================================
// Tests
// ============================================================================

describe('PATCH /api/agents/:id — disabled flag', () => {
  let services: Services;
  let agentRegistry: ReturnType<typeof createMockServices>['agentRegistry'];
  let stewardScheduler: ReturnType<typeof createMockServices>['stewardScheduler'];

  beforeEach(() => {
    const mocks = createMockServices();
    services = mocks.services;
    agentRegistry = mocks.agentRegistry;
    stewardScheduler = mocks.stewardScheduler;
  });

  it('accepts disabled: true and writes through updateAgentMetadata', async () => {
    const agent = createMockAgent('worker');
    agentRegistry.getAgent.mockResolvedValue(agent);
    agentRegistry.updateAgentMetadata.mockResolvedValue(agent);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(res.status).toBe(200);
    expect(agentRegistry.updateAgentMetadata).toHaveBeenCalledWith('agent-001', { disabled: true });
  });

  it('accepts disabled: false and writes the absent-means-enabled shape', async () => {
    const agent = createMockAgent('worker');
    agentRegistry.getAgent.mockResolvedValue(agent);
    agentRegistry.updateAgentMetadata.mockResolvedValue(agent);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: false }),
    });

    expect(res.status).toBe(200);
    // false should produce undefined so JSON.stringify drops the key on persist
    expect(agentRegistry.updateAgentMetadata).toHaveBeenCalledWith('agent-001', { disabled: undefined });
  });

  it('rejects non-boolean disabled with 400 VALIDATION_ERROR', async () => {
    const agent = createMockAgent('worker');
    agentRegistry.getAgent.mockResolvedValue(agent);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: 'yes' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toMatch(/boolean/i);
    expect(agentRegistry.updateAgentMetadata).not.toHaveBeenCalled();
  });

  it('unregisters a steward from the scheduler when disabling', async () => {
    const steward = createMockAgent('steward');
    agentRegistry.getAgent.mockResolvedValue(steward);
    // After update, the agent's metadata reflects disabled: true and role: steward
    agentRegistry.updateAgentMetadata.mockResolvedValue({
      ...steward,
      metadata: { agent: { ...steward.metadata.agent, disabled: true } },
    });

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(res.status).toBe(200);
    expect(stewardScheduler.unregisterSteward).toHaveBeenCalledWith('agent-001');
    expect(stewardScheduler.registerSteward).not.toHaveBeenCalled();
  });

  it('registers a steward with the scheduler when enabling', async () => {
    const steward = createMockAgent('steward');
    agentRegistry.getAgent.mockResolvedValue(steward);
    agentRegistry.updateAgentMetadata.mockResolvedValue(steward);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: false }),
    });

    expect(res.status).toBe(200);
    expect(stewardScheduler.registerSteward).toHaveBeenCalledWith('agent-001');
    expect(stewardScheduler.unregisterSteward).not.toHaveBeenCalled();
  });

  it('does not touch the scheduler for non-steward agents (worker)', async () => {
    const worker = createMockAgent('worker');
    agentRegistry.getAgent.mockResolvedValue(worker);
    agentRegistry.updateAgentMetadata.mockResolvedValue(worker);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(res.status).toBe(200);
    expect(stewardScheduler.unregisterSteward).not.toHaveBeenCalled();
    expect(stewardScheduler.registerSteward).not.toHaveBeenCalled();
  });

  it('does not touch the scheduler when it is not running', async () => {
    const steward = createMockAgent('steward');
    agentRegistry.getAgent.mockResolvedValue(steward);
    agentRegistry.updateAgentMetadata.mockResolvedValue({
      ...steward,
      metadata: { agent: { ...steward.metadata.agent, disabled: true } },
    });
    stewardScheduler.isRunning.mockReturnValue(false);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(res.status).toBe(200);
    expect(stewardScheduler.unregisterSteward).not.toHaveBeenCalled();
    expect(stewardScheduler.registerSteward).not.toHaveBeenCalled();
  });

  it('swallows scheduler errors and still returns 200', async () => {
    const steward = createMockAgent('steward');
    agentRegistry.getAgent.mockResolvedValue(steward);
    agentRegistry.updateAgentMetadata.mockResolvedValue({
      ...steward,
      metadata: { agent: { ...steward.metadata.agent, disabled: true } },
    });
    stewardScheduler.unregisterSteward.mockRejectedValue(new Error('scheduler kaboom'));

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/agent-001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(res.status).toBe(200);
    // metadata write should still have happened despite the scheduler failure
    expect(agentRegistry.updateAgentMetadata).toHaveBeenCalledWith('agent-001', { disabled: true });
  });

  it('returns 404 for an unknown agent', async () => {
    agentRegistry.getAgent.mockResolvedValue(undefined);

    const app = createAgentRoutes(services);
    const res = await app.request('/api/agents/missing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe('NOT_FOUND');
    expect(agentRegistry.updateAgentMetadata).not.toHaveBeenCalled();
  });
});
