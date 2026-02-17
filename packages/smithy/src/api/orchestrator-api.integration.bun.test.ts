/**
 * Orchestrator API Integration Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createEntity, EntityTypeValue, createTask, type EntityId, type Task, type ElementId } from '@stoneforge/core';
import {
  createOrchestratorAPI,
  type OrchestratorAPI,
  type AgentEntity,
  isAgentEntity,
  getAgentMetadata,
} from './orchestrator-api.js';
import type { WorkerMetadata, StewardMetadata } from '../types/agent.js';

describe('OrchestratorAPI', () => {
  let api: OrchestratorAPI;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    // Create a temporary database
    testDbPath = `/tmp/orchestrator-api-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage(testDbPath);
    initializeSchema(storage);

    api = createOrchestratorAPI(storage);

    // Create a system entity for tests
    const entity = await createEntity({
      name: 'test-system',
      entityType: EntityTypeValue.SYSTEM,
      createdBy: 'system:test' as EntityId,
    });
    const saved = await api.create(entity as unknown as Record<string, unknown> & { type: 'entity'; createdBy: EntityId });
    systemEntity = saved.id as unknown as EntityId;
  });

  afterEach(() => {
    // Clean up the temporary database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Agent Registration', () => {
    test('registerDirector creates a director agent', async () => {
      const director = await api.registerDirector({
        name: 'TestDirector',
        createdBy: systemEntity,
        tags: ['test'],
      });

      expect(director).toBeDefined();
      expect(director.name).toBe('TestDirector');
      expect(director.entityType).toBe(EntityTypeValue.AGENT);
      expect(isAgentEntity(director)).toBe(true);

      const meta = getAgentMetadata(director);
      expect(meta).toBeDefined();
      expect(meta?.agentRole).toBe('director');
      expect(meta?.sessionStatus).toBe('idle');
      // Note: channelId is set up separately in TB-O7a (Agent Channel Setup)
    });

    test('registerWorker creates an ephemeral worker', async () => {
      const worker = await api.registerWorker({
        name: 'TestWorkerEphemeral',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
      });

      expect(worker).toBeDefined();
      expect(worker.name).toBe('TestWorkerEphemeral');
      expect(isAgentEntity(worker)).toBe(true);

      const meta = getAgentMetadata(worker);
      expect(meta).toBeDefined();
      expect(meta?.agentRole).toBe('worker');
      expect((meta as WorkerMetadata).workerMode).toBe('ephemeral');
    });

    test('registerWorker creates a persistent worker', async () => {
      const worker = await api.registerWorker({
        name: 'TestWorkerPersistent',
        workerMode: 'persistent',
        createdBy: systemEntity,
      });

      const meta = getAgentMetadata(worker);
      expect((meta as WorkerMetadata).workerMode).toBe('persistent');
    });

    test('registerWorker with maxConcurrentTasks stores value in metadata', async () => {
      const worker = await api.registerWorker({
        name: 'HighCapacityWorker',
        workerMode: 'ephemeral',
        createdBy: systemEntity,
        maxConcurrentTasks: 3,
      });

      expect(worker).toBeDefined();
      const meta = getAgentMetadata(worker);
      expect(meta?.maxConcurrentTasks).toBe(3);
    });

    test('registerSteward creates a merge steward', async () => {
      const steward = await api.registerSteward({
        name: 'MergeSteward',
        stewardFocus: 'merge',
        triggers: [{ type: 'event', event: 'task_completed' }],
        createdBy: systemEntity,
      });

      expect(steward).toBeDefined();
      expect(steward.name).toBe('MergeSteward');

      const meta = getAgentMetadata(steward);
      expect(meta?.agentRole).toBe('steward');
      expect((meta as StewardMetadata).stewardFocus).toBe('merge');
      expect((meta as StewardMetadata).triggers).toHaveLength(1);
    });

    test('registerSteward creates a docs steward with cron trigger', async () => {
      const steward = await api.registerSteward({
        name: 'DocsSteward',
        stewardFocus: 'docs',
        triggers: [{ type: 'cron', schedule: '0 2 * * *' }],
        createdBy: systemEntity,
      });

      const meta = getAgentMetadata(steward) as StewardMetadata;
      expect(meta.stewardFocus).toBe('docs');
      expect(meta.triggers?.[0]).toEqual({ type: 'cron', schedule: '0 2 * * *' });
    });
  });

  describe('Agent Queries', () => {
    let director: AgentEntity;
    let worker1: AgentEntity;
    let worker2: AgentEntity;
    let steward: AgentEntity;

    beforeEach(async () => {
      director = await api.registerDirector({ name: 'QueryDirector', createdBy: systemEntity });
      worker1 = await api.registerWorker({ name: 'QueryWorker1', workerMode: 'ephemeral', createdBy: systemEntity });
      worker2 = await api.registerWorker({ name: 'QueryWorker2', workerMode: 'persistent', createdBy: systemEntity });
      steward = await api.registerSteward({ name: 'QuerySteward', stewardFocus: 'docs', createdBy: systemEntity });
    });

    test('getAgent retrieves an agent by ID', async () => {
      const retrieved = await api.getAgent(director.id as unknown as EntityId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(director.id);
    });

    test('getAgentByName retrieves an agent by name', async () => {
      const retrieved = await api.getAgentByName('QueryWorker1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('QueryWorker1');
    });

    test('listAgents returns all agents', async () => {
      const agents = await api.listAgents();
      expect(agents.length).toBeGreaterThanOrEqual(4);
    });

    test('listAgents filters by role', async () => {
      const workers = await api.listAgents({ role: 'worker' });
      expect(workers.length).toBeGreaterThanOrEqual(2);
      for (const w of workers) {
        const meta = getAgentMetadata(w);
        expect(meta?.agentRole).toBe('worker');
      }
    });

    test('listAgents filters by workerMode', async () => {
      const ephemeralWorkers = await api.listAgents({ workerMode: 'ephemeral' });
      for (const w of ephemeralWorkers) {
        const meta = getAgentMetadata(w) as WorkerMetadata;
        expect(meta.workerMode).toBe('ephemeral');
      }
    });

    test('getAgentsByRole returns agents of a specific role', async () => {
      const stewards = await api.getAgentsByRole('steward');
      expect(stewards.length).toBeGreaterThanOrEqual(1);
    });

    test('getAvailableWorkers returns idle workers', async () => {
      const available = await api.getAvailableWorkers();
      expect(available.length).toBeGreaterThanOrEqual(2);
    });

    test('getStewards returns all stewards', async () => {
      const stewards = await api.getStewards();
      expect(stewards.length).toBeGreaterThanOrEqual(1);
    });

    test('getDirector returns the director', async () => {
      const d = await api.getDirector();
      expect(d).toBeDefined();
      expect(getAgentMetadata(d!)?.agentRole).toBe('director');
    });
  });

  describe('Agent Session Management', () => {
    test('updateAgentSession updates session status', async () => {
      const worker = await api.registerWorker({ name: 'SessionWorker', workerMode: 'ephemeral', createdBy: systemEntity });

      const updated = await api.updateAgentSession(worker.id as unknown as EntityId, 'session-123', 'running');

      const meta = getAgentMetadata(updated);
      expect(meta?.sessionId).toBe('session-123');
      expect(meta?.sessionStatus).toBe('running');
      expect(meta?.lastActivityAt).toBeDefined();
    });

    test('getAgentChannel returns direct channel ID created during registration (TB-O7a)', async () => {
      const director = await api.registerDirector({ name: 'ChannelDirector', createdBy: systemEntity });

      const channelId = await api.getAgentChannel(director.id as unknown as EntityId);
      expect(channelId).toBeDefined();
      // Verify it's a valid element ID (starts with 'el-')
      expect(channelId?.startsWith('el-')).toBe(true);
    });
  });

  describe('Orchestrator Task Metadata', () => {
    let worker: AgentEntity;
    let task: Task;

    beforeEach(async () => {
      worker = await api.registerWorker({ name: 'TaskWorker', workerMode: 'ephemeral', createdBy: systemEntity });

      // Create a task
      const taskData = await createTask({
        title: 'Implement authentication feature',
        createdBy: systemEntity,
      });
      task = await api.create(taskData as unknown as Record<string, unknown> & { type: 'task'; createdBy: EntityId });
    });

    test('setTaskOrchestratorMeta sets orchestrator metadata', async () => {
      const updated = await api.setTaskOrchestratorMeta(task.id, {
        branch: 'agent/taskworker/task-1-implement-auth',
        worktree: '.stoneforge/.worktrees/taskworker-implement-auth',
      });

      const meta = await api.getTaskOrchestratorMeta(task.id);
      expect(meta).toBeDefined();
      expect(meta?.branch).toBe('agent/taskworker/task-1-implement-auth');
      expect(meta?.worktree).toBe('.stoneforge/.worktrees/taskworker-implement-auth');
    });

    test('updateTaskOrchestratorMeta updates existing metadata', async () => {
      await api.setTaskOrchestratorMeta(task.id, {
        branch: 'agent/taskworker/task-1',
      });

      await api.updateTaskOrchestratorMeta(task.id, {
        mergeStatus: 'pending',
      });

      const meta = await api.getTaskOrchestratorMeta(task.id);
      expect(meta?.branch).toBe('agent/taskworker/task-1');
      expect(meta?.mergeStatus).toBe('pending');
    });

    test('assignTaskToAgent assigns task and sets metadata', async () => {
      const updated = await api.assignTaskToAgent(task.id, worker.id as unknown as EntityId);

      expect(updated.assignee).toBe(worker.id);

      const meta = await api.getTaskOrchestratorMeta(task.id);
      expect(meta).toBeDefined();
      expect(meta?.assignedAgent).toBe(worker.id);
      expect(meta?.branch).toContain('agent/taskworker/');
      expect(meta?.worktree).toContain('.stoneforge/.worktrees/taskworker');
      expect(meta?.startedAt).toBeDefined();
    });
  });
});
