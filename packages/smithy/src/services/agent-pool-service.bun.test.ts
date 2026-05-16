/**
 * Agent Pool Service Tests
 *
 * Covers pool slot accounting for spawned and ended agent sessions.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI, type QuarryAPI } from '@stoneforge/quarry';
import { type EntityId, type ElementId, createEntity, EntityTypeValue } from '@stoneforge/core';
import type { SessionManager } from '../runtime/session-manager.js';
import { createAgentRegistry, type AgentRegistry } from './agent-registry.js';
import { createAgentPoolService, type AgentPoolService } from './agent-pool-service.js';

describe('AgentPoolService', () => {
  let api: QuarryAPI;
  let agentRegistry: AgentRegistry;
  let poolService: AgentPoolService;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    testDbPath = `/tmp/agent-pool-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage(testDbPath);
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    agentRegistry = createAgentRegistry(api);
    poolService = createAgentPoolService(
      api,
      { listSessions: () => [] } as unknown as SessionManager,
      agentRegistry
    );

    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('does not release a pool slot for a matching agent that was not occupying it', async () => {
    const pool = await poolService.createPool({
      name: 'ephemeral_workers',
      maxSize: 1,
      agentTypes: [{ role: 'worker', workerMode: 'ephemeral' }],
      createdBy: systemEntity,
    });

    const activeWorker = await agentRegistry.registerWorker({
      name: 'active-worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
    });
    const idleWorker = await agentRegistry.registerWorker({
      name: 'idle-worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
    });

    await poolService.onAgentSpawned(activeWorker.id as unknown as EntityId);
    await poolService.onAgentSessionEnded(idleWorker.id as unknown as EntityId);

    const status = await poolService.getPoolStatus(pool.id as ElementId);
    expect(status.activeCount).toBe(1);
    expect(status.availableSlots).toBe(0);
    expect(status.activeAgentIds).toEqual([activeWorker.id]);
  });
});
