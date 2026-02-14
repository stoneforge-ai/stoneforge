/**
 * Dispatch Service Unit Tests
 *
 * Tests for the DispatchService which combines task assignment with
 * agent notification.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI, type QuarryAPI } from '@stoneforge/quarry';
import {
  createEntity,
  createTask,
  EntityTypeValue,
  TaskStatus,
  type EntityId,
  type Task,
  type ElementId,
} from '@stoneforge/core';
import {
  createDispatchService,
  type DispatchService,
} from './dispatch-service.js';
import {
  createTaskAssignmentService,
  type TaskAssignmentService,
} from './task-assignment-service.js';
import {
  createAgentRegistry,
  type AgentRegistry,
} from './agent-registry.js';
import {
  getOrchestratorTaskMeta,
} from '../types/task-meta.js';
import type { AgentEntity } from '../api/orchestrator-api.js';

describe('DispatchService', () => {
  let dispatchService: DispatchService;
  let taskAssignment: TaskAssignmentService;
  let registry: AgentRegistry;
  let api: QuarryAPI;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    // Create a temporary database
    testDbPath = `/tmp/dispatch-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage(testDbPath);
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    taskAssignment = createTaskAssignmentService(api);
    registry = createAgentRegistry(api);
    dispatchService = createDispatchService(api, taskAssignment, registry);

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

  // Helper function to create a test task
  async function createTestTask(
    title: string,
    options?: {
      status?: typeof TaskStatus[keyof typeof TaskStatus];
    }
  ): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: options?.status ?? TaskStatus.OPEN,
    });
    return api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Promise<Task>;
  }

  // Helper function to register a test worker
  async function createTestWorker(
    name: string,
    options?: {
      maxConcurrentTasks?: number;
    }
  ): Promise<AgentEntity> {
    return registry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks: options?.maxConcurrentTasks ?? 1,
    });
  }

  describe('dispatch', () => {
    test('dispatches a task to an agent and sends notification', async () => {
      const task = await createTestTask('Implement feature');
      const worker = await createTestWorker('alice');

      const agentId = worker.id as unknown as EntityId;
      const result = await dispatchService.dispatch(task.id, agentId);

      // Check dispatch result structure
      expect(result.task).toBeDefined();
      expect(result.agent).toBeDefined();
      expect(result.notification).toBeDefined();
      expect(result.channel).toBeDefined();
      expect(result.isNewAssignment).toBe(true);
      expect(result.dispatchedAt).toBeDefined();

      // Check task was assigned
      expect(result.task.assignee).toBe(agentId);
      const meta = getOrchestratorTaskMeta(result.task.metadata as Record<string, unknown>);
      expect(meta?.assignedAgent).toBe(agentId);
      expect(meta?.branch).toContain('agent/alice/');

      // Check notification was sent to the correct channel (direct channel between agent and creator)
      const sortedNames = ['test-system', 'alice'].sort();
      expect(result.channel.name).toBe(`${sortedNames[0]}:${sortedNames[1]}`);
    });

    test('dispatches with custom options (priority, restart)', async () => {
      const task = await createTestTask('Urgent fix');
      const worker = await createTestWorker('bob');

      const agentId = worker.id as unknown as EntityId;
      const result = await dispatchService.dispatch(task.id, agentId, {
        priority: 10,
        restart: true,
        markAsStarted: true,
        branch: 'custom/branch',
        worktree: '.stoneforge/.worktrees/custom',
      });

      // Check notification metadata includes priority and restart
      const msgMeta = result.notification.metadata as Record<string, unknown>;
      expect(msgMeta.priority).toBe(10);
      expect(msgMeta.restart).toBe(true);
      expect(msgMeta.type).toBe('task-assignment');

      // Check task metadata
      const taskMeta = getOrchestratorTaskMeta(result.task.metadata as Record<string, unknown>);
      expect(taskMeta?.branch).toBe('custom/branch');
      expect(taskMeta?.worktree).toBe('.stoneforge/.worktrees/custom');

      // Check task was marked as started
      expect(result.task.status).toBe(TaskStatus.IN_PROGRESS);
    });

    test('dispatches with custom notification message', async () => {
      const task = await createTestTask('Test task');
      const worker = await createTestWorker('carol');

      const agentId = worker.id as unknown as EntityId;
      const result = await dispatchService.dispatch(task.id, agentId, {
        notificationMessage: 'Custom notification: please start immediately',
      });

      // The notification content should be in the referenced document
      const doc = await api.get(result.notification.contentRef as unknown as ElementId);
      expect(doc).toBeDefined();
      expect((doc as { content?: string })?.content).toBe('Custom notification: please start immediately');
    });

    test('detects reassignment and sets correct message type', async () => {
      const task = await createTestTask('Shared task');
      const worker1 = await createTestWorker('dave');
      const worker2 = await createTestWorker('eve');

      // First dispatch
      const agentId1 = worker1.id as unknown as EntityId;
      const result1 = await dispatchService.dispatch(task.id, agentId1);
      expect(result1.isNewAssignment).toBe(true);
      expect((result1.notification.metadata as Record<string, unknown>).type).toBe('task-assignment');

      // Second dispatch (reassignment)
      const agentId2 = worker2.id as unknown as EntityId;
      const result2 = await dispatchService.dispatch(task.id, agentId2);
      expect(result2.isNewAssignment).toBe(false);
      expect((result2.notification.metadata as Record<string, unknown>).type).toBe('task-reassignment');
    });

    test('throws error for non-existent task', async () => {
      const worker = await createTestWorker('frank');
      const agentId = worker.id as unknown as EntityId;

      await expect(
        dispatchService.dispatch('nonexistent-task' as ElementId, agentId)
      ).rejects.toThrow('Task not found');
    });

    test('throws error for non-existent agent', async () => {
      const task = await createTestTask('Valid task');

      await expect(
        dispatchService.dispatch(task.id, 'nonexistent-agent' as EntityId)
      ).rejects.toThrow('Agent not found');
    });
  });

  describe('dispatchBatch', () => {
    test('dispatches multiple tasks to the same agent', async () => {
      const task1 = await createTestTask('Task 1');
      const task2 = await createTestTask('Task 2');
      const task3 = await createTestTask('Task 3');
      const worker = await createTestWorker('grace', { maxConcurrentTasks: 5 });

      const agentId = worker.id as unknown as EntityId;
      const results = await dispatchService.dispatchBatch(
        [task1.id, task2.id, task3.id],
        agentId
      );

      expect(results.length).toBe(3);
      for (const result of results) {
        expect(result.task.assignee).toBe(agentId);
        expect(result.agent.id).toBe(worker.id);
      }
    });
  });

  describe('notifyAgent', () => {
    test('sends notification without task assignment', async () => {
      const worker = await createTestWorker('idle-worker');
      const agentId = worker.id as unknown as EntityId;

      const notification = await dispatchService.notifyAgent(
        agentId,
        'restart-signal',
        'Please restart your session',
        { reason: 'configuration change' }
      );

      expect(notification).toBeDefined();
      expect((notification.metadata as Record<string, unknown>).type).toBe('restart-signal');
      expect((notification.metadata as Record<string, unknown>).reason).toBe('configuration change');
    });

    test('throws error for non-existent agent', async () => {
      await expect(
        dispatchService.notifyAgent(
          'nonexistent-agent' as EntityId,
          'restart-signal',
          'Test message'
        )
      ).rejects.toThrow('Agent channel not found');
    });
  });
});
