/**
 * Agent Registry Service Unit Tests
 *
 * Tests for the standalone AgentRegistry service.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '@stoneforge/quarry';
import { createEntity, EntityTypeValue, type EntityId } from '@stoneforge/core';
import {
  createAgentRegistry,
  type AgentRegistry,
  generateAgentChannelName,
  parseAgentChannelName,
} from './agent-registry.js';
import {
  type AgentEntity,
  isAgentEntity,
  getAgentMetadata,
} from '../api/orchestrator-api.js';
import type { WorkerMetadata, StewardMetadata } from '../types/agent.js';

describe('Agent Channel Name Utilities (TB-O7a)', () => {
  test('generateAgentChannelName creates correct format with agent name', () => {
    const channelName = generateAgentChannelName('my-agent');
    expect(channelName).toBe('agent-my-agent');
  });

  test('parseAgentChannelName extracts agent name from valid channel name', () => {
    const agentName = parseAgentChannelName('agent-my-agent');
    expect(agentName).toBe('my-agent');
  });

  test('parseAgentChannelName returns null for non-agent channel names', () => {
    expect(parseAgentChannelName('general-chat')).toBeNull();
    expect(parseAgentChannelName('team-engineering')).toBeNull();
  });

  test('parseAgentChannelName returns null for empty agent name', () => {
    expect(parseAgentChannelName('agent-')).toBeNull();
  });

  test('generateAgentChannelName and parseAgentChannelName are inverse operations', () => {
    const originalName = 'test-worker';
    const channelName = generateAgentChannelName(originalName);
    const parsedName = parseAgentChannelName(channelName);
    expect(parsedName).toBe(originalName);
  });
});

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    // Create a temporary database
    testDbPath = `/tmp/agent-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage(testDbPath);
    initializeSchema(storage);

    const api = createQuarryAPI(storage);
    registry = createAgentRegistry(api);

    // Create a system entity for tests
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;
  });

  afterEach(() => {
    // Clean up the temporary database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('registerAgent', () => {
    test('registerAgent dispatches to registerDirector for director role', async () => {
      const director = await registry.registerAgent({
        role: 'director',
        name: 'TestDirector',
        createdBy: systemEntity,
      });

      expect(director).toBeDefined();
      expect(director.name).toBe('TestDirector');
      expect(getAgentMetadata(director)?.agentRole).toBe('director');
    });

    test('registerAgent dispatches to registerWorker for worker role', async () => {
      const worker = await registry.registerAgent({
        role: 'worker',
        name: 'TestWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      expect(worker).toBeDefined();
      expect(worker.name).toBe('TestWorker');
      expect(getAgentMetadata(worker)?.agentRole).toBe('worker');
      expect((getAgentMetadata(worker) as WorkerMetadata).workerMode).toBe('ephemeral');
    });

    test('registerAgent dispatches to registerSteward for steward role', async () => {
      const steward = await registry.registerAgent({
        role: 'steward',
        name: 'TestSteward',
        stewardFocus: 'merge',
        createdBy: systemEntity,
      });

      expect(steward).toBeDefined();
      expect(steward.name).toBe('TestSteward');
      expect(getAgentMetadata(steward)?.agentRole).toBe('steward');
      expect((getAgentMetadata(steward) as StewardMetadata).stewardFocus).toBe('merge');
    });
  });

  describe('Agent Registration (Individual Methods)', () => {
    test('registerDirector creates a director agent', async () => {
      const director = await registry.registerDirector({
        name: 'MyDirector',
        createdBy: systemEntity,
        tags: ['production'],
      });

      expect(director).toBeDefined();
      expect(director.name).toBe('MyDirector');
      expect(director.entityType).toBe(EntityTypeValue.AGENT);
      expect(isAgentEntity(director)).toBe(true);

      const meta = getAgentMetadata(director);
      expect(meta?.agentRole).toBe('director');
      expect(meta?.sessionStatus).toBe('idle');
    });

    test('registerWorker creates a worker with maxConcurrentTasks', async () => {
      const worker = await registry.registerWorker({
        name: 'CapableWorker',
        workerMode: 'persistent',
        createdBy: systemEntity,
        maxConcurrentTasks: 3,
      });

      const meta = getAgentMetadata(worker);
      expect(meta?.agentRole).toBe('worker');
      expect((meta as WorkerMetadata).workerMode).toBe('persistent');
      expect(meta?.maxConcurrentTasks).toBe(3);
    });

    test('registerSteward creates a steward with triggers', async () => {
      const steward = await registry.registerSteward({
        name: 'DocsSteward',
        stewardFocus: 'docs',
        triggers: [
          { type: 'cron', schedule: '0 0 * * *' },
          { type: 'event', event: 'branch_merged' },
        ],
        createdBy: systemEntity,
      });

      const meta = getAgentMetadata(steward) as StewardMetadata;
      expect(meta.agentRole).toBe('steward');
      expect(meta.stewardFocus).toBe('docs');
      expect(meta.triggers).toHaveLength(2);
      expect(meta.triggers?.[0]).toEqual({ type: 'cron', schedule: '0 0 * * *' });
      expect(meta.triggers?.[1]).toEqual({ type: 'event', event: 'branch_merged' });
    });

    test('registerWorker with reportsTo sets manager', async () => {
      const director = await registry.registerDirector({
        name: 'ManagerDirector',
        createdBy: systemEntity,
      });

      const worker = await registry.registerWorker({
        name: 'ManagedWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
        reportsTo: director.id as unknown as EntityId,
      });

      expect(worker.reportsTo).toBe(director.id);
    });
  });

  describe('Agent Queries', () => {
    let director: AgentEntity;
    let ephemeralWorker: AgentEntity;
    let persistentWorker: AgentEntity;
    let mergeSteward: AgentEntity;
    let docsSteward: AgentEntity;

    beforeEach(async () => {
      director = await registry.registerDirector({
        name: 'QueryDirector',
        createdBy: systemEntity,
      });
      ephemeralWorker = await registry.registerWorker({
        name: 'EphemeralWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });
      persistentWorker = await registry.registerWorker({
        name: 'PersistentWorker',
        workerMode: 'persistent',
        createdBy: systemEntity,
      });
      mergeSteward = await registry.registerSteward({
        name: 'MergeSteward',
        stewardFocus: 'merge',
        createdBy: systemEntity,
      });
      docsSteward = await registry.registerSteward({
        name: 'DocsSteward',
        stewardFocus: 'docs',
        createdBy: systemEntity,
      });
    });

    test('getAgent retrieves agent by ID', async () => {
      const retrieved = await registry.getAgent(director.id as unknown as EntityId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(director.id);
      expect(retrieved?.name).toBe('QueryDirector');
    });

    test('getAgent returns undefined for non-existent ID', async () => {
      const retrieved = await registry.getAgent('non-existent-id' as EntityId);
      expect(retrieved).toBeUndefined();
    });

    test('getAgentByName retrieves agent by name', async () => {
      const retrieved = await registry.getAgentByName('EphemeralWorker');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('EphemeralWorker');
    });

    test('getAgentByName returns undefined for non-existent name', async () => {
      const retrieved = await registry.getAgentByName('NonExistent');
      expect(retrieved).toBeUndefined();
    });

    test('listAgents returns all agents', async () => {
      const agents = await registry.listAgents();
      expect(agents.length).toBeGreaterThanOrEqual(5);
    });

    test('listAgents filters by role', async () => {
      const workers = await registry.listAgents({ role: 'worker' });
      expect(workers.length).toBeGreaterThanOrEqual(2);
      for (const w of workers) {
        expect(getAgentMetadata(w)?.agentRole).toBe('worker');
      }
    });

    test('listAgents filters by workerMode', async () => {
      const ephemeralWorkers = await registry.listAgents({ workerMode: 'ephemeral' });
      expect(ephemeralWorkers.length).toBeGreaterThanOrEqual(1);
      for (const w of ephemeralWorkers) {
        expect((getAgentMetadata(w) as WorkerMetadata).workerMode).toBe('ephemeral');
      }
    });

    test('listAgents filters by stewardFocus', async () => {
      const mergeStewards = await registry.listAgents({ stewardFocus: 'merge' });
      expect(mergeStewards.length).toBeGreaterThanOrEqual(1);
      for (const s of mergeStewards) {
        expect((getAgentMetadata(s) as StewardMetadata).stewardFocus).toBe('merge');
      }
    });

    test('listAgents filters by reportsTo', async () => {
      // Create a worker that reports to the director
      await registry.registerWorker({
        name: 'ReportingWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
        reportsTo: director.id as unknown as EntityId,
      });

      const reportingAgents = await registry.listAgents({
        reportsTo: director.id as unknown as EntityId,
      });
      expect(reportingAgents.length).toBeGreaterThanOrEqual(1);
      for (const a of reportingAgents) {
        expect(a.reportsTo).toBe(director.id);
      }
    });

    test('getAgentsByRole returns agents of specific role', async () => {
      const directors = await registry.getAgentsByRole('director');
      expect(directors.length).toBeGreaterThanOrEqual(1);
      for (const d of directors) {
        expect(getAgentMetadata(d)?.agentRole).toBe('director');
      }
    });

    test('getAvailableWorkers returns idle workers', async () => {
      const available = await registry.getAvailableWorkers();
      expect(available.length).toBeGreaterThanOrEqual(2);
      for (const w of available) {
        const meta = getAgentMetadata(w);
        expect(meta?.sessionStatus === 'idle' || meta?.sessionStatus === undefined).toBe(true);
      }
    });

    test('getStewards returns all stewards', async () => {
      const stewards = await registry.getStewards();
      expect(stewards.length).toBeGreaterThanOrEqual(2);
      for (const s of stewards) {
        expect(getAgentMetadata(s)?.agentRole).toBe('steward');
      }
    });

    test('getDirector returns the director', async () => {
      const d = await registry.getDirector();
      expect(d).toBeDefined();
      expect(getAgentMetadata(d!)?.agentRole).toBe('director');
    });
  });

  describe('Agent Session Management', () => {
    test('updateAgentSession updates session status', async () => {
      const worker = await registry.registerWorker({
        name: 'SessionWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      const updated = await registry.updateAgentSession(
        worker.id as unknown as EntityId,
        'claude-session-abc123',
        'running'
      );

      const meta = getAgentMetadata(updated);
      expect(meta?.sessionId).toBe('claude-session-abc123');
      expect(meta?.sessionStatus).toBe('running');
      expect(meta?.lastActivityAt).toBeDefined();
    });

    test('updateAgentSession can set session to suspended', async () => {
      const worker = await registry.registerWorker({
        name: 'SuspendWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      // First set to running
      await registry.updateAgentSession(
        worker.id as unknown as EntityId,
        'session-1',
        'running'
      );

      // Then suspend
      const updated = await registry.updateAgentSession(
        worker.id as unknown as EntityId,
        'session-1',
        'suspended'
      );

      const meta = getAgentMetadata(updated);
      expect(meta?.sessionStatus).toBe('suspended');
    });

    test('updateAgentSession can clear session ID', async () => {
      const worker = await registry.registerWorker({
        name: 'ClearSessionWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      await registry.updateAgentSession(
        worker.id as unknown as EntityId,
        'session-1',
        'running'
      );

      const updated = await registry.updateAgentSession(
        worker.id as unknown as EntityId,
        undefined,
        'terminated'
      );

      const meta = getAgentMetadata(updated);
      expect(meta?.sessionId).toBeUndefined();
      expect(meta?.sessionStatus).toBe('terminated');
    });

    test('updateAgentSession throws for non-existent agent', async () => {
      await expect(
        registry.updateAgentSession(
          'non-existent-id' as EntityId,
          'session-1',
          'running'
        )
      ).rejects.toThrow('Agent not found');
    });
  });

  describe('updateAgentMetadata', () => {
    test('updateAgentMetadata updates specific metadata fields', async () => {
      const worker = await registry.registerWorker({
        name: 'MetaWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      // Update with branch info (simulating task assignment)
      const updated = await registry.updateAgentMetadata(
        worker.id as unknown as EntityId,
        { worktree: '.stoneforge/.worktrees/meta-worker-task' } as any
      );

      const meta = getAgentMetadata(updated) as WorkerMetadata;
      expect(meta.worktree).toBe('.stoneforge/.worktrees/meta-worker-task');
      // Original fields preserved
      expect(meta.agentRole).toBe('worker');
      expect(meta.workerMode).toBe('ephemeral');
    });

    test('updateAgentMetadata throws for non-existent agent', async () => {
      await expect(
        registry.updateAgentMetadata(
          'non-existent-id' as EntityId,
          { sessionStatus: 'running' }
        )
      ).rejects.toThrow('Agent not found');
    });
  });

  describe('Session Status Filtering', () => {
    test('listAgents filters by sessionStatus', async () => {
      const worker = await registry.registerWorker({
        name: 'RunningWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      // Set to running
      await registry.updateAgentSession(
        worker.id as unknown as EntityId,
        'session-1',
        'running'
      );

      const runningAgents = await registry.listAgents({ sessionStatus: 'running' });
      expect(runningAgents.length).toBeGreaterThanOrEqual(1);

      const runningNames = runningAgents.map((a) => a.name);
      expect(runningNames).toContain('RunningWorker');
    });

    test('listAgents hasSession filter works', async () => {
      const workerWithSession = await registry.registerWorker({
        name: 'WithSession',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      await registry.registerWorker({
        name: 'WithoutSession',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      await registry.updateAgentSession(
        workerWithSession.id as unknown as EntityId,
        'session-123',
        'running'
      );

      const withSession = await registry.listAgents({ hasSession: true });
      const withoutSession = await registry.listAgents({ hasSession: false });

      const withNames = withSession.map((a) => a.name);
      const withoutNames = withoutSession.map((a) => a.name);

      expect(withNames).toContain('WithSession');
      expect(withoutNames).toContain('WithoutSession');
    });
  });

  describe('Agent Channel Setup (TB-O7a)', () => {
    test('registerDirector creates dedicated channel for the agent', async () => {
      const director = await registry.registerDirector({
        name: 'DirectorWithChannel',
        createdBy: systemEntity,
      });

      const meta = getAgentMetadata(director);
      expect(meta?.channelId).toBeDefined();

      // Verify channel can be retrieved
      const channel = await registry.getAgentChannel(director.id as unknown as EntityId);
      expect(channel).toBeDefined();
      // Direct channel name is sorted entity names joined by colon
      const sortedNames = ['test-system', 'DirectorWithChannel'].sort();
      expect(channel?.name).toBe(`${sortedNames[0]}:${sortedNames[1]}`);
      expect(channel?.channelType).toBe('direct');
      expect(channel?.members).toContain(director.id);
      expect(channel?.members).toContain(systemEntity);
    });

    test('registerWorker creates dedicated channel for the agent', async () => {
      const worker = await registry.registerWorker({
        name: 'WorkerWithChannel',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      const meta = getAgentMetadata(worker);
      expect(meta?.channelId).toBeDefined();

      const channel = await registry.getAgentChannel(worker.id as unknown as EntityId);
      expect(channel).toBeDefined();
      // Direct channel name is sorted entity names joined by colon
      const sortedNames = ['test-system', 'WorkerWithChannel'].sort();
      expect(channel?.name).toBe(`${sortedNames[0]}:${sortedNames[1]}`);
      expect(channel?.channelType).toBe('direct');
      expect(channel?.members).toContain(worker.id);
      expect(channel?.members).toContain(systemEntity);
    });

    test('registerSteward creates dedicated channel for the agent', async () => {
      const steward = await registry.registerSteward({
        name: 'StewardWithChannel',
        stewardFocus: 'merge',
        createdBy: systemEntity,
      });

      const meta = getAgentMetadata(steward);
      expect(meta?.channelId).toBeDefined();

      const channel = await registry.getAgentChannel(steward.id as unknown as EntityId);
      expect(channel).toBeDefined();
      // Direct channel name is sorted entity names joined by colon
      const sortedNames = ['test-system', 'StewardWithChannel'].sort();
      expect(channel?.name).toBe(`${sortedNames[0]}:${sortedNames[1]}`);
      expect(channel?.channelType).toBe('direct');
      expect(channel?.members).toContain(steward.id);
      expect(channel?.members).toContain(systemEntity);
    });

    test('getAgentChannelId returns channel ID from metadata', async () => {
      const worker = await registry.registerWorker({
        name: 'WorkerForChannelId',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      const channelId = await registry.getAgentChannelId(worker.id as unknown as EntityId);
      const meta = getAgentMetadata(worker);

      expect(channelId).toBeDefined();
      expect(channelId).toBe(meta?.channelId);
    });

    test('getAgentChannel returns undefined for non-existent agent', async () => {
      const channel = await registry.getAgentChannel('non-existent-id' as EntityId);
      expect(channel).toBeUndefined();
    });

    test('getAgentChannelId returns undefined for non-existent agent', async () => {
      const channelId = await registry.getAgentChannelId('non-existent-id' as EntityId);
      expect(channelId).toBeUndefined();
    });

    test('agent channel has correct metadata', async () => {
      const worker = await registry.registerWorker({
        name: 'WorkerChannelMeta',
        workerMode: 'persistent',
        createdBy: systemEntity,
      });

      const channel = await registry.getAgentChannel(worker.id as unknown as EntityId);
      expect(channel).toBeDefined();
      expect(channel?.tags).toContain('agent-channel');
      expect((channel?.metadata as Record<string, unknown>).agentId).toBe(worker.id);
      expect((channel?.metadata as Record<string, unknown>).purpose).toBe('Agent direct messaging channel');
    });

    test('agent channel has correct permissions', async () => {
      const worker = await registry.registerWorker({
        name: 'WorkerChannelPerms',
        workerMode: 'persistent',
        createdBy: systemEntity,
      });

      const channel = await registry.getAgentChannel(worker.id as unknown as EntityId);
      expect(channel).toBeDefined();
      expect(channel?.permissions.visibility).toBe('private');
      expect(channel?.permissions.joinPolicy).toBe('invite-only');
    });
  });
});
