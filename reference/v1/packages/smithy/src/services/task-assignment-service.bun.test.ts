/**
 * Task Assignment Service Unit Tests
 *
 * Tests for the TaskAssignmentService which manages task-to-agent assignments
 * with orchestrator metadata tracking (branch, worktree, sessionId).
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
  createTaskAssignmentService,
  type TaskAssignmentService,
  AssignmentStatusValues,
} from './task-assignment-service.js';
import {
  createAgentRegistry,
  type AgentRegistry,
} from './agent-registry.js';
import {
  getOrchestratorTaskMeta,
  generateBranchName,
  generateWorktreePath,
  createSlugFromTitle,
} from '../types/task-meta.js';

describe('TaskAssignmentService', () => {
  let service: TaskAssignmentService;
  let registry: AgentRegistry;
  let api: QuarryAPI;
  let testDbPath: string;
  let systemEntity: EntityId;

  beforeEach(async () => {
    // Create a temporary database
    testDbPath = `/tmp/task-assignment-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage(testDbPath);
    initializeSchema(storage);

    api = createQuarryAPI(storage);
    service = createTaskAssignmentService(api);
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

  // Helper function to create a test task
  async function createTestTask(title: string, status?: typeof TaskStatus[keyof typeof TaskStatus]): Promise<Task> {
    const task = await createTask({
      title,
      createdBy: systemEntity,
      status: status ?? TaskStatus.OPEN,
    });
    return api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId }) as Promise<Task>;
  }

  // Helper function to register a test worker
  async function createTestWorker(name: string, maxConcurrentTasks?: number) {
    return registry.registerWorker({
      name,
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      maxConcurrentTasks,
    });
  }

  describe('AssignmentStatusValues', () => {
    test('contains all expected assignment status values', () => {
      expect(AssignmentStatusValues).toContain('unassigned');
      expect(AssignmentStatusValues).toContain('assigned');
      expect(AssignmentStatusValues).toContain('in_progress');
      expect(AssignmentStatusValues).toContain('completed');
      expect(AssignmentStatusValues).toContain('merged');
      expect(AssignmentStatusValues.length).toBe(5);
    });
  });

  describe('assignToAgent', () => {
    test('assigns a task to an agent with auto-generated branch and worktree', async () => {
      const task = await createTestTask('Implement feature');
      const worker = await createTestWorker('alice');

      const agentId = worker.id as unknown as EntityId;
      const assigned = await service.assignToAgent(task.id, agentId);

      // Check task assignee was set
      expect(assigned.assignee).toBe(agentId);

      // Check orchestrator metadata was set
      const meta = getOrchestratorTaskMeta(assigned.metadata as Record<string, unknown>);
      expect(meta).toBeDefined();
      expect(meta?.assignedAgent).toBe(agentId);
      expect(meta?.branch).toContain('agent/alice/');
      expect(meta?.worktree).toContain('.stoneforge/.worktrees/alice-');
      expect(meta?.mergeStatus).toBe('pending');
    });

    test('assigns a task with custom branch and worktree', async () => {
      const task = await createTestTask('Fix bug');
      const worker = await createTestWorker('bob');

      const agentId = worker.id as unknown as EntityId;
      const assigned = await service.assignToAgent(task.id, agentId, {
        branch: 'custom/branch-name',
        worktree: '.stoneforge/.worktrees/custom-worktree',
        sessionId: 'session-123',
      });

      const meta = getOrchestratorTaskMeta(assigned.metadata as Record<string, unknown>);
      expect(meta?.branch).toBe('custom/branch-name');
      expect(meta?.worktree).toBe('.stoneforge/.worktrees/custom-worktree');
      expect(meta?.sessionId).toBe('session-123');
    });

    test('assigns and marks task as started when markAsStarted is true', async () => {
      const task = await createTestTask('Quick fix');
      const worker = await createTestWorker('carol');

      const agentId = worker.id as unknown as EntityId;
      const assigned = await service.assignToAgent(task.id, agentId, {
        markAsStarted: true,
      });

      // Task status should be IN_PROGRESS
      expect(assigned.status).toBe(TaskStatus.IN_PROGRESS);

      // Start time should be set
      const meta = getOrchestratorTaskMeta(assigned.metadata as Record<string, unknown>);
      expect(meta?.startedAt).toBeDefined();
    });

    test('throws error when task does not exist', async () => {
      const worker = await createTestWorker('dave');
      const agentId = worker.id as unknown as EntityId;

      expect(
        service.assignToAgent('el-nonexistent' as ElementId, agentId)
      ).rejects.toThrow('Task not found');
    });

    test('throws error when agent does not exist', async () => {
      const task = await createTestTask('Test task');

      expect(
        service.assignToAgent(task.id, 'el-nonexistent' as EntityId)
      ).rejects.toThrow('Agent not found');
    });
  });

  describe('unassignTask', () => {
    test('unassigns a task from its agent', async () => {
      const task = await createTestTask('Task to unassign');
      const worker = await createTestWorker('eve');
      const agentId = worker.id as unknown as EntityId;

      // First assign
      await service.assignToAgent(task.id, agentId);

      // Then unassign
      const unassigned = await service.unassignTask(task.id);

      expect(unassigned.assignee).toBeUndefined();

      // Orchestrator metadata should have agent-specific fields cleared
      const meta = getOrchestratorTaskMeta(unassigned.metadata as Record<string, unknown>);
      expect(meta?.assignedAgent).toBeUndefined();
      expect(meta?.sessionId).toBeUndefined();
      expect(meta?.worktree).toBeUndefined();
      // Note: branch may still be preserved for potential reassignment
    });

    test('throws error when task does not exist', async () => {
      expect(
        service.unassignTask('el-nonexistent' as ElementId)
      ).rejects.toThrow('Task not found');
    });
  });

  describe('startTask', () => {
    test('marks a task as started', async () => {
      const task = await createTestTask('Task to start');
      const worker = await createTestWorker('frank');
      const agentId = worker.id as unknown as EntityId;

      // Assign first
      await service.assignToAgent(task.id, agentId);

      // Then start
      const started = await service.startTask(task.id, 'session-456');

      expect(started.status).toBe(TaskStatus.IN_PROGRESS);

      const meta = getOrchestratorTaskMeta(started.metadata as Record<string, unknown>);
      expect(meta?.startedAt).toBeDefined();
      expect(meta?.sessionId).toBe('session-456');
    });

    test('starts task without session ID', async () => {
      const task = await createTestTask('Task without session');

      const started = await service.startTask(task.id);

      expect(started.status).toBe(TaskStatus.IN_PROGRESS);

      const meta = getOrchestratorTaskMeta(started.metadata as Record<string, unknown>);
      expect(meta?.startedAt).toBeDefined();
    });

    test('throws error when task does not exist', async () => {
      expect(
        service.startTask('el-nonexistent' as ElementId)
      ).rejects.toThrow('Task not found');
    });
  });

  describe('completeTask', () => {
    test('marks a task as completed with REVIEW status', async () => {
      const task = await createTestTask('Task to complete', TaskStatus.IN_PROGRESS);
      const worker = await createTestWorker('grace');
      const agentId = worker.id as unknown as EntityId;

      // Assign and start
      await service.assignToAgent(task.id, agentId, { markAsStarted: true });

      // Complete - returns { task, mergeRequestUrl?, mergeRequestId? }
      // Skip MR creation since we don't have a provider
      const result = await service.completeTask(task.id, { createMergeRequest: false });
      const completed = result.task;

      // Status should be REVIEW (merge steward will set to CLOSED after merge)
      expect(completed.status).toBe(TaskStatus.REVIEW);

      const meta = getOrchestratorTaskMeta(completed.metadata as Record<string, unknown>);
      expect(meta?.completedAt).toBeDefined();
      expect(meta?.mergeStatus).toBe('pending');
    });

    test('clears assignee when task is completed', async () => {
      const task = await createTestTask('Task to complete', TaskStatus.IN_PROGRESS);
      const worker = await createTestWorker('grace2');
      const agentId = worker.id as unknown as EntityId;

      // Assign and start
      await service.assignToAgent(task.id, agentId, { markAsStarted: true });

      // Verify assignee is set
      const assignedTask = await api.get<Task>(task.id);
      expect(assignedTask?.assignee).toBe(agentId);

      // Complete
      const result = await service.completeTask(task.id, { createMergeRequest: false });

      // Assignee should be cleared (task is now awaiting review, not actively worked on)
      expect(result.task.assignee).toBeUndefined();
    });

    test('throws error when task does not exist', async () => {
      expect(
        service.completeTask('el-nonexistent' as ElementId)
      ).rejects.toThrow('Task not found');
    });

    test('throws error when task is already CLOSED', async () => {
      const task = await createTestTask('Closed task', TaskStatus.CLOSED);
      await expect(
        service.completeTask(task.id, { createMergeRequest: false })
      ).rejects.toThrow("already in 'closed' status");
    });

    test('throws error when task is already in REVIEW', async () => {
      const task = await createTestTask('Review task', TaskStatus.IN_PROGRESS);
      // Complete once to move to REVIEW
      await service.completeTask(task.id, { createMergeRequest: false });
      // Attempting to complete again should fail
      await expect(
        service.completeTask(task.id, { createMergeRequest: false })
      ).rejects.toThrow("already in 'review' status");
    });
  });

  describe('handoffTask', () => {
    test('hands off a task with message and preserves branch/worktree', async () => {
      const task = await createTestTask('Task to handoff', TaskStatus.IN_PROGRESS);
      const worker = await createTestWorker('hannah');
      const agentId = worker.id as unknown as EntityId;

      // Assign with branch and worktree
      await service.assignToAgent(task.id, agentId, {
        branch: 'feature/my-task',
        worktree: '.stoneforge/.worktrees/my-task',
        markAsStarted: true,
      });

      // Hand off the task
      const handedOff = await service.handoffTask(task.id, {
        sessionId: 'sess-123',
        message: 'Completed backend, need frontend help',
      });

      // Task should be unassigned and status reset to OPEN
      expect(handedOff.assignee).toBeUndefined();
      expect(handedOff.status).toBe(TaskStatus.OPEN);

      // Metadata should preserve handoff context
      const meta = getOrchestratorTaskMeta(handedOff.metadata as Record<string, unknown>);
      expect(meta?.handoffBranch).toBe('feature/my-task');
      expect(meta?.handoffWorktree).toBe('.stoneforge/.worktrees/my-task');
      expect(meta?.lastSessionId).toBe('sess-123');
      expect(meta?.handoffAt).toBeDefined();
      // handoffNote/handoffMessage removed (L-1): handoff notes are now appended to the description Document
      expect(meta?.handoffHistory).toBeDefined();
      expect(meta?.handoffHistory?.[0]?.message).toBe('Completed backend, need frontend help');
      // mergeStatus should be cleared so merge steward doesn't pick up the task
      expect(meta?.mergeStatus).toBeUndefined();
    });

    test('builds handoff history across multiple handoffs', async () => {
      const task = await createTestTask('Multi-handoff task', TaskStatus.IN_PROGRESS);
      const worker1 = await createTestWorker('worker1');
      const worker2 = await createTestWorker('worker2');

      // First agent works on it
      await service.assignToAgent(task.id, worker1.id as unknown as EntityId, {
        branch: 'feature/task-1',
        markAsStarted: true,
      });

      // First handoff
      await service.handoffTask(task.id, {
        sessionId: 'sess-1',
        message: 'First handoff note',
      });

      // Second agent picks it up
      await service.assignToAgent(task.id, worker2.id as unknown as EntityId, {
        markAsStarted: true,
      });

      // Second handoff
      const result = await service.handoffTask(task.id, {
        sessionId: 'sess-2',
        message: 'Second handoff note',
      });

      const meta = getOrchestratorTaskMeta(result.metadata as Record<string, unknown>);
      const history = (meta as Record<string, unknown>)?.handoffHistory as Array<{sessionId: string; message?: string}>;

      expect(history).toBeDefined();
      expect(history.length).toBe(2);
      expect(history[0].sessionId).toBe('sess-1');
      expect(history[0].message).toBe('First handoff note');
      expect(history[1].sessionId).toBe('sess-2');
      expect(history[1].message).toBe('Second handoff note');
    });

    test('throws error when task does not exist', async () => {
      expect(
        service.handoffTask('el-nonexistent' as ElementId, { sessionId: 'sess-1' })
      ).rejects.toThrow('Task not found');
    });

    test('resets REVIEW task to OPEN and clears mergeStatus on handoff', async () => {
      // This test verifies the fix for the infinite loop bug where a merge steward
      // hands off a task but it stays in REVIEW with mergeStatus, causing the
      // merge steward to pick it up again instead of the dispatch daemon.
      const task = await createTestTask('Task in review', TaskStatus.REVIEW);
      const steward = await createTestWorker('merge-steward');
      const stewardId = steward.id as unknown as EntityId;

      // Assign to steward and set mergeStatus (simulating task in review)
      await service.assignToAgent(task.id, stewardId, {
        branch: 'feature/review-task',
        worktree: '.stoneforge/.worktrees/review-task',
        markAsStarted: true,
      });

      // Manually set mergeStatus to 'testing' to simulate merge steward state
      const assignedTask = await api.get<Task>(task.id);
      const meta = getOrchestratorTaskMeta(assignedTask?.metadata as Record<string, unknown>);
      await api.update<Task>(task.id, {
        metadata: {
          ...assignedTask?.metadata,
          orchestrator: {
            ...meta,
            mergeStatus: 'testing',
          },
        },
      });

      // Steward hands off the task (e.g., needs worker to address review feedback)
      const handedOff = await service.handoffTask(task.id, {
        sessionId: 'steward-sess-1',
        message: 'Tests failed, worker needs to fix issues',
      });

      // Task should be reset to OPEN so dispatch daemon picks it up
      expect(handedOff.status).toBe(TaskStatus.OPEN);
      expect(handedOff.assignee).toBeUndefined();

      // mergeStatus should be cleared so merge steward doesn't pick it up
      const handoffMeta = getOrchestratorTaskMeta(handedOff.metadata as Record<string, unknown>);
      expect(handoffMeta?.mergeStatus).toBeUndefined();
      expect(handoffMeta?.handoffHistory?.[0]?.message).toBe('Tests failed, worker needs to fix issues');
    });
  });

  describe('getAgentTasks', () => {
    test('returns all tasks assigned to an agent', async () => {
      const worker = await createTestWorker('henry');
      const agentId = worker.id as unknown as EntityId;

      // Create and assign multiple tasks
      const task1 = await createTestTask('Task 1');
      const task2 = await createTestTask('Task 2');
      const task3 = await createTestTask('Task 3');

      await service.assignToAgent(task1.id, agentId);
      await service.assignToAgent(task2.id, agentId);
      // task3 not assigned to this agent

      const tasks = await service.getAgentTasks(agentId);

      expect(tasks.length).toBe(2);
      expect(tasks.map(t => t.taskId)).toContain(task1.id);
      expect(tasks.map(t => t.taskId)).toContain(task2.id);
      expect(tasks.map(t => t.taskId)).not.toContain(task3.id);
    });

    test('returns empty array when agent has no tasks', async () => {
      const worker = await createTestWorker('ivy');
      const agentId = worker.id as unknown as EntityId;

      const tasks = await service.getAgentTasks(agentId);

      expect(tasks).toEqual([]);
    });
  });

  describe('getAgentWorkload', () => {
    test('returns correct workload summary', async () => {
      const worker = await createTestWorker('jack', 5);
      const agentId = worker.id as unknown as EntityId;

      // Create tasks in different states
      const openTask = await createTestTask('Open task');
      const inProgressTask = await createTestTask('In progress task');
      const reviewTask = await createTestTask('Review task');

      // Assign all to worker
      await service.assignToAgent(openTask.id, agentId);
      await service.assignToAgent(inProgressTask.id, agentId, { markAsStarted: true });
      await service.assignToAgent(reviewTask.id, agentId);
      await service.completeTask(reviewTask.id, { createMergeRequest: false });

      const workload = await service.getAgentWorkload(agentId);

      expect(workload.agentId).toBe(agentId);
      // Note: completeTask clears assignee, so reviewTask is no longer assigned to this agent
      expect(workload.totalTasks).toBe(2);
      expect(workload.inProgressCount).toBe(1);
      expect(workload.byStatus.in_progress).toBe(1);
    });
  });

  describe('agentHasCapacity', () => {
    test('returns true when agent has capacity', async () => {
      const worker = await createTestWorker('kate', 3);
      const agentId = worker.id as unknown as EntityId;

      // Assign one task (capacity is 3)
      const task = await createTestTask('Single task');
      await service.assignToAgent(task.id, agentId, { markAsStarted: true });

      const hasCapacity = await service.agentHasCapacity(agentId);
      expect(hasCapacity).toBe(true);
    });

    test('returns false when agent is at capacity', async () => {
      const worker = await createTestWorker('leo', 1);
      const agentId = worker.id as unknown as EntityId;

      // Assign one task (capacity is 1)
      const task = await createTestTask('Only task');
      await service.assignToAgent(task.id, agentId, { markAsStarted: true });

      const hasCapacity = await service.agentHasCapacity(agentId);
      expect(hasCapacity).toBe(false);
    });

    test('returns false when agent does not exist', async () => {
      const hasCapacity = await service.agentHasCapacity('el-nonexistent' as EntityId);
      expect(hasCapacity).toBe(false);
    });
  });

  describe('getUnassignedTasks', () => {
    test('returns tasks without an agent assigned', async () => {
      const worker = await createTestWorker('mia');
      const agentId = worker.id as unknown as EntityId;

      // Create tasks
      const assignedTask = await createTestTask('Assigned task');
      const unassignedTask1 = await createTestTask('Unassigned task 1');
      const unassignedTask2 = await createTestTask('Unassigned task 2');

      // Assign one
      await service.assignToAgent(assignedTask.id, agentId);

      const unassigned = await service.getUnassignedTasks();

      expect(unassigned.length).toBeGreaterThanOrEqual(2);
      expect(unassigned.map(t => t.id)).toContain(unassignedTask1.id);
      expect(unassigned.map(t => t.id)).toContain(unassignedTask2.id);
      expect(unassigned.map(t => t.id)).not.toContain(assignedTask.id);
    });
  });

  describe('getTasksByAssignmentStatus', () => {
    test('returns tasks by assignment status', async () => {
      const worker = await createTestWorker('noah');
      const agentId = worker.id as unknown as EntityId;

      // Create tasks in different assignment states
      const unassignedTask = await createTestTask('Unassigned');
      const assignedTask = await createTestTask('Assigned');
      const inProgressTask = await createTestTask('In progress');
      const completedTask = await createTestTask('Completed');

      await service.assignToAgent(assignedTask.id, agentId);
      await service.assignToAgent(inProgressTask.id, agentId, { markAsStarted: true });
      await service.assignToAgent(completedTask.id, agentId, { markAsStarted: true });
      await service.completeTask(completedTask.id, { createMergeRequest: false });

      // Check unassigned (includes completedTask since completeTask clears assignee)
      const unassignedTasks = await service.getTasksByAssignmentStatus('unassigned');
      expect(unassignedTasks.map(t => t.taskId)).toContain(unassignedTask.id);

      // Check assigned (not yet started)
      const assignedTasks = await service.getTasksByAssignmentStatus('assigned');
      expect(assignedTasks.map(t => t.taskId)).toContain(assignedTask.id);

      // Check in_progress
      const inProgressTasks = await service.getTasksByAssignmentStatus('in_progress');
      expect(inProgressTasks.map(t => t.taskId)).toContain(inProgressTask.id);

      // Check completed - note: completeTask clears assignee, so task appears unassigned
      // but has REVIEW status which makes it 'completed' in determineAssignmentStatus
      const completedTasks = await service.getTasksByAssignmentStatus('completed');
      expect(completedTasks.map(t => t.taskId)).toContain(completedTask.id);
    });
  });

  describe('listAssignments', () => {
    test('lists all task assignments', async () => {
      const worker = await createTestWorker('olivia');
      const agentId = worker.id as unknown as EntityId;

      const task1 = await createTestTask('Task A');
      await createTestTask('Task B'); // Unassigned task

      await service.assignToAgent(task1.id, agentId);

      const assignments = await service.listAssignments();

      // Should include both assigned and unassigned tasks
      expect(assignments.length).toBeGreaterThanOrEqual(2);
    });

    test('filters by agent ID', async () => {
      const worker1 = await createTestWorker('paul');
      const worker2 = await createTestWorker('quinn');
      const agentId1 = worker1.id as unknown as EntityId;
      const agentId2 = worker2.id as unknown as EntityId;

      const task1 = await createTestTask('Task for Paul');
      const task2 = await createTestTask('Task for Quinn');

      await service.assignToAgent(task1.id, agentId1);
      await service.assignToAgent(task2.id, agentId2);

      const paulAssignments = await service.listAssignments({ agentId: agentId1 });
      expect(paulAssignments.length).toBe(1);
      expect(paulAssignments[0].taskId).toBe(task1.id);

      const quinnAssignments = await service.listAssignments({ agentId: agentId2 });
      expect(quinnAssignments.length).toBe(1);
      expect(quinnAssignments[0].taskId).toBe(task2.id);
    });

    test('filters by merge status', async () => {
      const worker = await createTestWorker('rachel');
      const agentId = worker.id as unknown as EntityId;

      const task = await createTestTask('Task to complete');
      await service.assignToAgent(task.id, agentId, { markAsStarted: true });
      await service.completeTask(task.id, { createMergeRequest: false });

      const pendingMerge = await service.listAssignments({ mergeStatus: 'pending' });
      expect(pendingMerge.map(t => t.taskId)).toContain(task.id);

      const merged = await service.listAssignments({ mergeStatus: 'merged' });
      expect(merged.map(t => t.taskId)).not.toContain(task.id);
    });

    test('filters by multiple assignment statuses', async () => {
      const worker = await createTestWorker('sam');
      const agentId = worker.id as unknown as EntityId;

      const assignedTask = await createTestTask('Assigned only');
      const inProgressTask = await createTestTask('In progress');

      await service.assignToAgent(assignedTask.id, agentId);
      await service.assignToAgent(inProgressTask.id, agentId, { markAsStarted: true });

      const result = await service.listAssignments({
        assignmentStatus: ['assigned', 'in_progress'],
      });

      expect(result.map(t => t.taskId)).toContain(assignedTask.id);
      expect(result.map(t => t.taskId)).toContain(inProgressTask.id);
    });
  });

  describe('getTasksAwaitingMerge', () => {
    test('returns completed tasks awaiting merge', async () => {
      const worker = await createTestWorker('tina');
      const agentId = worker.id as unknown as EntityId;

      // Create and complete tasks
      const task1 = await createTestTask('Completed task 1');
      const task2 = await createTestTask('Completed task 2');
      const task3 = await createTestTask('Still in progress');

      await service.assignToAgent(task1.id, agentId, { markAsStarted: true });
      await service.assignToAgent(task2.id, agentId, { markAsStarted: true });
      await service.assignToAgent(task3.id, agentId, { markAsStarted: true });

      await service.completeTask(task1.id, { createMergeRequest: false });
      await service.completeTask(task2.id, { createMergeRequest: false });
      // task3 not completed

      const awaitingMerge = await service.getTasksAwaitingMerge();

      expect(awaitingMerge.map(t => t.taskId)).toContain(task1.id);
      expect(awaitingMerge.map(t => t.taskId)).toContain(task2.id);
      expect(awaitingMerge.map(t => t.taskId)).not.toContain(task3.id);
    });
  });
});

describe('Branch and Worktree Generation Integration', () => {
  test('generateBranchName creates expected format', () => {
    const branch = generateBranchName('worker-alice', 'el-abc123' as ElementId, 'implement-feature');
    expect(branch).toBe('agent/worker-alice/el-abc123-implement-feature');
  });

  test('generateWorktreePath creates expected format', () => {
    const worktree = generateWorktreePath('worker-bob', 'fix-bug');
    expect(worktree).toBe('.stoneforge/.worktrees/worker-bob-fix-bug');
  });

  test('createSlugFromTitle handles special characters', () => {
    expect(createSlugFromTitle('Implement Feature #123')).toBe('implement-feature-123');
    expect(createSlugFromTitle('Fix Bug: Memory Leak')).toBe('fix-bug-memory-leak');
    expect(createSlugFromTitle('  Trim  Spaces  ')).toBe('trim-spaces');
  });

  test('createSlugFromTitle limits length', () => {
    const longTitle = 'This is a very long title that should be truncated to a reasonable length';
    const slug = createSlugFromTitle(longTitle);
    expect(slug.length).toBeLessThanOrEqual(30);
  });
});
