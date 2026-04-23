/**
 * Plan Bulk Operations Integration Tests
 *
 * Comprehensive tests for Plan Phase 5 features:
 * - Bulk close all tasks in a plan
 * - Bulk defer all tasks in a plan
 * - Bulk reassign all tasks in a plan
 * - Bulk add/remove tags from all tasks in a plan
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Task, Plan } from '@stoneforge/core';
import { createTask, Priority, TaskStatus, createPlan, PlanStatus, NotFoundError, ConstraintError, ValidationError } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;
const aliceEntityId = 'user:alice' as EntityId;
const bobEntityId = 'user:bob' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

/**
 * Create a test task element
 */
async function createTestTask(overrides: Partial<Parameters<typeof createTask>[0]> = {}): Promise<Task> {
  return createTask({
    title: 'Test Task',
    createdBy: mockEntityId,
    ...overrides,
  });
}

/**
 * Create a test plan element
 */
async function createTestPlan(overrides: Partial<Parameters<typeof createPlan>[0]> = {}): Promise<Plan> {
  return createPlan({
    title: 'Test Plan',
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Plan Bulk Operations', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // --------------------------------------------------------------------------
  // bulkClosePlanTasks Tests
  // --------------------------------------------------------------------------

  describe('bulkClosePlanTasks()', () => {
    it('should close all open tasks in a plan', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      // Create multiple open tasks
      const task1 = await createTestTask({ title: 'Task 1', status: TaskStatus.OPEN });
      const task2 = await createTestTask({ title: 'Task 2', status: TaskStatus.OPEN });
      const task3 = await createTestTask({ title: 'Task 3', status: TaskStatus.IN_PROGRESS });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);
      await api.addTaskToPlan(task3.id, plan.id);

      // Bulk close
      const result = await api.bulkClosePlanTasks(plan.id);

      expect(result.updated).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.updatedIds).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Verify all tasks are now closed
      const tasks = await api.getTasksInPlan(plan.id);
      expect(tasks.every(t => t.status === TaskStatus.CLOSED)).toBe(true);
    });

    it('should skip already closed tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(closedTask));

      await api.addTaskToPlan(openTask.id, plan.id);
      await api.addTaskToPlan(closedTask.id, plan.id);

      const result = await api.bulkClosePlanTasks(plan.id);

      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.updatedIds).toContain(openTask.id);
      expect(result.skippedIds).toContain(closedTask.id);
    });

    it('should skip tombstone tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const deleteableTask = await createTestTask({ title: 'Deleteable Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(deleteableTask));

      await api.addTaskToPlan(openTask.id, plan.id);
      await api.addTaskToPlan(deleteableTask.id, plan.id);

      // Delete one task
      await api.delete(deleteableTask.id);

      const result = await api.bulkClosePlanTasks(plan.id);

      // Only the open task should be updated
      expect(result.updated).toBe(1);
      expect(result.updatedIds).toContain(openTask.id);
    });

    it('should include close reason when provided', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });
      await api.create(toCreateInput(task));
      await api.addTaskToPlan(task.id, plan.id);

      await api.bulkClosePlanTasks(plan.id, { closeReason: 'Bulk close for release' });

      const updatedTask = await api.get<Task>(task.id);
      expect(updatedTask?.closeReason).toBe('Bulk close for release');
    });

    it('should use provided actor for audit trail', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });
      await api.create(toCreateInput(task));
      await api.addTaskToPlan(task.id, plan.id);

      await api.bulkClosePlanTasks(plan.id, { actor: aliceEntityId });

      // Verify actor in event
      const events = await api.getEvents(task.id);
      const updateEvent = events.find(e => e.eventType === 'closed' || e.eventType === 'updated');
      expect(updateEvent?.actor).toBe(aliceEntityId);
    });

    it('should filter tasks when filter is provided', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const highPriority = await createTestTask({ title: 'High Priority', status: TaskStatus.OPEN, priority: Priority.HIGH });
      const lowPriority = await createTestTask({ title: 'Low Priority', status: TaskStatus.OPEN, priority: Priority.LOW });

      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(lowPriority));

      await api.addTaskToPlan(highPriority.id, plan.id);
      await api.addTaskToPlan(lowPriority.id, plan.id);

      // Only close high priority tasks
      const result = await api.bulkClosePlanTasks(plan.id, {
        filter: { priority: Priority.HIGH },
      });

      expect(result.updated).toBe(1);
      expect(result.updatedIds).toContain(highPriority.id);

      // Verify high priority is closed, low priority is still open
      const highTask = await api.get<Task>(highPriority.id);
      const lowTask = await api.get<Task>(lowPriority.id);
      expect(highTask?.status).toBe(TaskStatus.CLOSED);
      expect(lowTask?.status).toBe(TaskStatus.OPEN);
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      await expect(
        api.bulkClosePlanTasks('el-nonexistent' as ElementId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when element is not a plan', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(
        api.bulkClosePlanTasks(task.id)
      ).rejects.toThrow(ConstraintError);
    });

    it('should return empty result for plan with no tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const result = await api.bulkClosePlanTasks(plan.id);

      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should handle mixed status tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const tasks = [
        await createTestTask({ title: 'Open', status: TaskStatus.OPEN }),
        await createTestTask({ title: 'In Progress', status: TaskStatus.IN_PROGRESS }),
        await createTestTask({ title: 'Blocked', status: TaskStatus.BLOCKED }),
        await createTestTask({ title: 'Deferred', status: TaskStatus.DEFERRED }),
        await createTestTask({ title: 'Closed', status: TaskStatus.CLOSED }),
      ];

      for (const task of tasks) {
        await api.create(toCreateInput(task));
        await api.addTaskToPlan(task.id, plan.id);
      }

      const result = await api.bulkClosePlanTasks(plan.id);

      // All except already-closed should be updated
      expect(result.updated).toBe(4);
      expect(result.skipped).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // bulkDeferPlanTasks Tests
  // --------------------------------------------------------------------------

  describe('bulkDeferPlanTasks()', () => {
    it('should defer all deferrable tasks in a plan', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await createTestTask({ title: 'Task 1', status: TaskStatus.OPEN });
      const task2 = await createTestTask({ title: 'Task 2', status: TaskStatus.IN_PROGRESS });
      const task3 = await createTestTask({ title: 'Task 3', status: TaskStatus.BLOCKED });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);
      await api.addTaskToPlan(task3.id, plan.id);

      const result = await api.bulkDeferPlanTasks(plan.id);

      expect(result.updated).toBe(3);
      expect(result.skipped).toBe(0);

      // Verify all tasks are deferred
      const tasks = await api.getTasksInPlan(plan.id);
      expect(tasks.every(t => t.status === TaskStatus.DEFERRED)).toBe(true);
    });

    it('should skip closed tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(closedTask));

      await api.addTaskToPlan(openTask.id, plan.id);
      await api.addTaskToPlan(closedTask.id, plan.id);

      const result = await api.bulkDeferPlanTasks(plan.id);

      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.skippedIds).toContain(closedTask.id);

      // Verify closed task is still closed
      const stillClosed = await api.get<Task>(closedTask.id);
      expect(stillClosed?.status).toBe(TaskStatus.CLOSED);
    });

    it('should skip already deferred tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const deferredTask = await createTestTask({ title: 'Deferred Task', status: TaskStatus.DEFERRED });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(deferredTask));

      await api.addTaskToPlan(openTask.id, plan.id);
      await api.addTaskToPlan(deferredTask.id, plan.id);

      const result = await api.bulkDeferPlanTasks(plan.id);

      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.skippedIds).toContain(deferredTask.id);
    });

    it('should use provided actor for audit trail', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });
      await api.create(toCreateInput(task));
      await api.addTaskToPlan(task.id, plan.id);

      await api.bulkDeferPlanTasks(plan.id, { actor: aliceEntityId });

      const events = await api.getEvents(task.id);
      const updateEvent = events.find(e => e.eventType === 'updated');
      expect(updateEvent?.actor).toBe(aliceEntityId);
    });

    it('should filter tasks when filter is provided', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const aliceTask = await createTestTask({ title: 'Alice Task', status: TaskStatus.OPEN, assignee: aliceEntityId });
      const bobTask = await createTestTask({ title: 'Bob Task', status: TaskStatus.OPEN, assignee: bobEntityId });

      await api.create(toCreateInput(aliceTask));
      await api.create(toCreateInput(bobTask));

      await api.addTaskToPlan(aliceTask.id, plan.id);
      await api.addTaskToPlan(bobTask.id, plan.id);

      // Only defer Alice's tasks
      const result = await api.bulkDeferPlanTasks(plan.id, {
        filter: { assignee: aliceEntityId },
      });

      expect(result.updated).toBe(1);

      const alice = await api.get<Task>(aliceTask.id);
      const bob = await api.get<Task>(bobTask.id);
      expect(alice?.status).toBe(TaskStatus.DEFERRED);
      expect(bob?.status).toBe(TaskStatus.OPEN);
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      await expect(
        api.bulkDeferPlanTasks('el-nonexistent' as ElementId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when element is not a plan', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(
        api.bulkDeferPlanTasks(task.id)
      ).rejects.toThrow(ConstraintError);
    });
  });

  // --------------------------------------------------------------------------
  // bulkReassignPlanTasks Tests
  // --------------------------------------------------------------------------

  describe('bulkReassignPlanTasks()', () => {
    it('should reassign all tasks to new assignee', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await createTestTask({ title: 'Task 1', assignee: aliceEntityId });
      const task2 = await createTestTask({ title: 'Task 2', assignee: bobEntityId });
      const task3 = await createTestTask({ title: 'Task 3' }); // No assignee

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);
      await api.addTaskToPlan(task3.id, plan.id);

      const result = await api.bulkReassignPlanTasks(plan.id, bobEntityId);

      expect(result.updated).toBe(2); // task1 and task3 changed
      expect(result.skipped).toBe(1); // task2 already has bobEntityId

      // Verify all tasks have bob as assignee
      const tasks = await api.getTasksInPlan(plan.id);
      expect(tasks.every(t => t.assignee === bobEntityId)).toBe(true);
    });

    it('should unassign all tasks when newAssignee is undefined', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await createTestTask({ title: 'Task 1', assignee: aliceEntityId });
      const task2 = await createTestTask({ title: 'Task 2', assignee: bobEntityId });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);

      const result = await api.bulkReassignPlanTasks(plan.id, undefined);

      expect(result.updated).toBe(2);

      // Verify all tasks are unassigned
      const tasks = await api.getTasksInPlan(plan.id);
      expect(tasks.every(t => t.assignee === undefined)).toBe(true);
    });

    it('should skip tasks that already have the target assignee', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const aliceTask = await createTestTask({ title: 'Alice Task', assignee: aliceEntityId });
      const bobTask = await createTestTask({ title: 'Bob Task', assignee: bobEntityId });

      await api.create(toCreateInput(aliceTask));
      await api.create(toCreateInput(bobTask));

      await api.addTaskToPlan(aliceTask.id, plan.id);
      await api.addTaskToPlan(bobTask.id, plan.id);

      // Reassign all to Alice
      const result = await api.bulkReassignPlanTasks(plan.id, aliceEntityId);

      expect(result.updated).toBe(1); // Only Bob's task changed
      expect(result.skipped).toBe(1); // Alice's task was skipped
      expect(result.skippedIds).toContain(aliceTask.id);
    });

    it('should skip tombstone tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const activeTask = await createTestTask({ title: 'Active', assignee: aliceEntityId });
      const tombstoneTask = await createTestTask({ title: 'To Delete', assignee: aliceEntityId });

      await api.create(toCreateInput(activeTask));
      await api.create(toCreateInput(tombstoneTask));

      await api.addTaskToPlan(activeTask.id, plan.id);
      await api.addTaskToPlan(tombstoneTask.id, plan.id);

      // Delete one task
      await api.delete(tombstoneTask.id);

      const result = await api.bulkReassignPlanTasks(plan.id, bobEntityId);

      expect(result.updated).toBe(1);
      expect(result.updatedIds).toContain(activeTask.id);
    });

    it('should use provided actor for audit trail', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task', assignee: aliceEntityId });
      await api.create(toCreateInput(task));
      await api.addTaskToPlan(task.id, plan.id);

      await api.bulkReassignPlanTasks(plan.id, bobEntityId, { actor: aliceEntityId });

      const events = await api.getEvents(task.id);
      const updateEvent = events.find(e => e.eventType === 'updated');
      expect(updateEvent?.actor).toBe(aliceEntityId);
    });

    it('should filter tasks when filter is provided', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const highPriority = await createTestTask({ title: 'High', priority: Priority.HIGH, assignee: aliceEntityId });
      const lowPriority = await createTestTask({ title: 'Low', priority: Priority.LOW, assignee: aliceEntityId });

      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(lowPriority));

      await api.addTaskToPlan(highPriority.id, plan.id);
      await api.addTaskToPlan(lowPriority.id, plan.id);

      // Only reassign high priority tasks
      const result = await api.bulkReassignPlanTasks(plan.id, bobEntityId, {
        filter: { priority: Priority.HIGH },
      });

      expect(result.updated).toBe(1);

      const high = await api.get<Task>(highPriority.id);
      const low = await api.get<Task>(lowPriority.id);
      expect(high?.assignee).toBe(bobEntityId);
      expect(low?.assignee).toBe(aliceEntityId);
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      await expect(
        api.bulkReassignPlanTasks('el-nonexistent' as ElementId, aliceEntityId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when element is not a plan', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(
        api.bulkReassignPlanTasks(task.id, aliceEntityId)
      ).rejects.toThrow(ConstraintError);
    });
  });

  // --------------------------------------------------------------------------
  // bulkTagPlanTasks Tests
  // --------------------------------------------------------------------------

  describe('bulkTagPlanTasks()', () => {
    it('should add tags to all tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await createTestTask({ title: 'Task 1', tags: ['existing'] });
      const task2 = await createTestTask({ title: 'Task 2', tags: [] });
      const task3 = await createTestTask({ title: 'Task 3', tags: ['other'] });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);
      await api.addTaskToPlan(task3.id, plan.id);

      const result = await api.bulkTagPlanTasks(plan.id, { addTags: ['release-v2', 'sprint-5'] });

      expect(result.updated).toBe(3);
      expect(result.skipped).toBe(0);

      // Verify all tasks have the new tags
      const tasks = await api.getTasksInPlan(plan.id);
      expect(tasks.every(t => t.tags.includes('release-v2'))).toBe(true);
      expect(tasks.every(t => t.tags.includes('sprint-5'))).toBe(true);

      // Verify existing tags are preserved
      const t1 = await api.get<Task>(task1.id);
      expect(t1?.tags).toContain('existing');
    });

    it('should remove tags from all tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await createTestTask({ title: 'Task 1', tags: ['bug', 'sprint-1'] });
      const task2 = await createTestTask({ title: 'Task 2', tags: ['bug', 'feature'] });
      const task3 = await createTestTask({ title: 'Task 3', tags: ['sprint-1'] });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);
      await api.addTaskToPlan(task3.id, plan.id);

      const result = await api.bulkTagPlanTasks(plan.id, { removeTags: ['bug'] });

      expect(result.updated).toBe(2); // task1 and task2 had 'bug'
      expect(result.skipped).toBe(1); // task3 didn't have 'bug'

      // Verify 'bug' tag removed
      const tasks = await api.getTasksInPlan(plan.id);
      expect(tasks.every(t => !t.tags.includes('bug'))).toBe(true);

      // Verify other tags preserved
      const t1 = await api.get<Task>(task1.id);
      expect(t1?.tags).toContain('sprint-1');
    });

    it('should add and remove tags in same operation', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task', tags: ['old-sprint', 'bug'] });
      await api.create(toCreateInput(task));
      await api.addTaskToPlan(task.id, plan.id);

      await api.bulkTagPlanTasks(plan.id, {
        addTags: ['new-sprint'],
        removeTags: ['old-sprint'],
      });

      const updatedTask = await api.get<Task>(task.id);
      expect(updatedTask?.tags).toContain('new-sprint');
      expect(updatedTask?.tags).not.toContain('old-sprint');
      expect(updatedTask?.tags).toContain('bug'); // Preserved
    });

    it('should skip tasks where tags would not change', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const taskWithTag = await createTestTask({ title: 'Has Tag', tags: ['existing'] });
      const taskWithoutTag = await createTestTask({ title: 'No Tag', tags: [] });

      await api.create(toCreateInput(taskWithTag));
      await api.create(toCreateInput(taskWithoutTag));

      await api.addTaskToPlan(taskWithTag.id, plan.id);
      await api.addTaskToPlan(taskWithoutTag.id, plan.id);

      // Add 'existing' which one task already has
      const result = await api.bulkTagPlanTasks(plan.id, { addTags: ['existing'] });

      expect(result.updated).toBe(1); // Only taskWithoutTag changed
      expect(result.skipped).toBe(1); // taskWithTag already had the tag
    });

    it('should skip tombstone tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const activeTask = await createTestTask({ title: 'Active', tags: [] });
      const tombstoneTask = await createTestTask({ title: 'To Delete', tags: [] });

      await api.create(toCreateInput(activeTask));
      await api.create(toCreateInput(tombstoneTask));

      await api.addTaskToPlan(activeTask.id, plan.id);
      await api.addTaskToPlan(tombstoneTask.id, plan.id);

      await api.delete(tombstoneTask.id);

      const result = await api.bulkTagPlanTasks(plan.id, { addTags: ['new-tag'] });

      expect(result.updated).toBe(1);
      expect(result.updatedIds).toContain(activeTask.id);
    });

    it('should throw ValidationError when no tag operation specified', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      await expect(
        api.bulkTagPlanTasks(plan.id, {})
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when empty tag arrays provided', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      await expect(
        api.bulkTagPlanTasks(plan.id, { addTags: [], removeTags: [] })
      ).rejects.toThrow(ValidationError);
    });

    it('should use provided actor for audit trail', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task', tags: [] });
      await api.create(toCreateInput(task));
      await api.addTaskToPlan(task.id, plan.id);

      await api.bulkTagPlanTasks(plan.id, {
        addTags: ['new-tag'],
        actor: aliceEntityId,
      });

      const events = await api.getEvents(task.id);
      const updateEvent = events.find(e => e.eventType === 'updated');
      expect(updateEvent?.actor).toBe(aliceEntityId);
    });

    it('should filter tasks when filter is provided', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const openTask = await createTestTask({ title: 'Open', status: TaskStatus.OPEN, tags: [] });
      const closedTask = await createTestTask({ title: 'Closed', status: TaskStatus.CLOSED, tags: [] });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(closedTask));

      await api.addTaskToPlan(openTask.id, plan.id);
      await api.addTaskToPlan(closedTask.id, plan.id);

      // Only tag open tasks
      const result = await api.bulkTagPlanTasks(plan.id, {
        addTags: ['active'],
        filter: { status: TaskStatus.OPEN },
      });

      expect(result.updated).toBe(1);

      const open = await api.get<Task>(openTask.id);
      const closed = await api.get<Task>(closedTask.id);
      expect(open?.tags).toContain('active');
      expect(closed?.tags).not.toContain('active');
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      await expect(
        api.bulkTagPlanTasks('el-nonexistent' as ElementId, { addTags: ['tag'] })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when element is not a plan', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(
        api.bulkTagPlanTasks(task.id, { addTags: ['tag'] })
      ).rejects.toThrow(ConstraintError);
    });

    it('should handle duplicate tags gracefully', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task', tags: ['existing'] });
      await api.create(toCreateInput(task));
      await api.addTaskToPlan(task.id, plan.id);

      // Add same tag multiple times
      await api.bulkTagPlanTasks(plan.id, { addTags: ['new', 'new', 'existing'] });

      const updatedTask = await api.get<Task>(task.id);
      // Should have no duplicates
      expect(updatedTask?.tags.filter(t => t === 'new').length).toBe(1);
      expect(updatedTask?.tags.filter(t => t === 'existing').length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Combined Operations Tests
  // --------------------------------------------------------------------------

  describe('Combined Operations', () => {
    it('should allow chaining bulk operations', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await createTestTask({ title: 'Task 1', status: TaskStatus.OPEN });
      const task2 = await createTestTask({ title: 'Task 2', status: TaskStatus.OPEN });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);

      // Tag all tasks
      await api.bulkTagPlanTasks(plan.id, { addTags: ['release-1.0'] });

      // Reassign all tasks
      await api.bulkReassignPlanTasks(plan.id, bobEntityId);

      // Close all tasks
      await api.bulkClosePlanTasks(plan.id, { closeReason: 'Sprint complete' });

      // Verify final state
      const tasks = await api.getTasksInPlan(plan.id);
      expect(tasks.every(t => t.tags.includes('release-1.0'))).toBe(true);
      expect(tasks.every(t => t.assignee === bobEntityId)).toBe(true);
      expect(tasks.every(t => t.status === TaskStatus.CLOSED)).toBe(true);
    });

    it('should handle large number of tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const taskCount = 50;
      const taskIds: ElementId[] = [];

      // Create many tasks
      for (let i = 0; i < taskCount; i++) {
        const task = await api.createTaskInPlan(plan.id, {
          createdBy: mockEntityId,
          title: `Task ${i + 1}`,
        });
        taskIds.push(task.id);
      }

      // Bulk operations
      const tagResult = await api.bulkTagPlanTasks(plan.id, { addTags: ['batch'] });
      const reassignResult = await api.bulkReassignPlanTasks(plan.id, aliceEntityId);
      const closeResult = await api.bulkClosePlanTasks(plan.id);

      expect(tagResult.updated).toBe(taskCount);
      expect(reassignResult.updated).toBe(taskCount);
      expect(closeResult.updated).toBe(taskCount);

      // Verify progress
      const progress = await api.getPlanProgress(plan.id);
      expect(progress.completedTasks).toBe(taskCount);
      expect(progress.completionPercentage).toBe(100);
    });
  });
});
