/**
 * Plan-Task Linking Integration Tests
 *
 * Comprehensive tests for Plan Phase 3 features:
 * - Adding tasks to plans with parent-child dependencies
 * - Removing tasks from plans
 * - Querying tasks in a plan
 * - Creating tasks with hierarchical IDs
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

describe('Plan-Task Linking', () => {
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
  // addTaskToPlan Tests
  // --------------------------------------------------------------------------

  describe('addTaskToPlan()', () => {
    it('should add a task to a plan with parent-child dependency', async () => {
      // Create task and plan
      const task = await createTestTask();
      const plan = await createTestPlan();
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(plan));

      // Add task to plan
      const dependency = await api.addTaskToPlan(task.id, plan.id);

      expect(dependency).toBeDefined();
      expect(dependency.blockedId).toBe(task.id);
      expect(dependency.blockerId).toBe(plan.id);
      expect(dependency.type).toBe('parent-child');
    });

    it('should throw NotFoundError for non-existent task', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      await expect(
        api.addTaskToPlan('el-nonexistent' as ElementId, plan.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(
        api.addTaskToPlan(task.id, 'el-nonexistent' as ElementId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError if task is already in a plan', async () => {
      const task = await createTestTask();
      const plan1 = await createTestPlan({ title: 'Plan 1' });
      const plan2 = await createTestPlan({ title: 'Plan 2' });

      await api.create(toCreateInput(task));
      await api.create(toCreateInput(plan1));
      await api.create(toCreateInput(plan2));

      // Add task to first plan
      await api.addTaskToPlan(task.id, plan1.id);

      // Try to add to second plan
      await expect(
        api.addTaskToPlan(task.id, plan2.id)
      ).rejects.toThrow(ConstraintError);
    });

    it('should throw ConstraintError when element is not a task', async () => {
      const plan1 = await createTestPlan({ title: 'Plan 1' });
      const plan2 = await createTestPlan({ title: 'Plan 2' });
      await api.create(toCreateInput(plan1));
      await api.create(toCreateInput(plan2));

      // Try to add a plan to another plan as if it were a task
      await expect(
        api.addTaskToPlan(plan1.id, plan2.id)
      ).rejects.toThrow(ConstraintError);
    });

    it('should throw ConstraintError when target is not a plan', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Try to add a task to another task
      await expect(
        api.addTaskToPlan(task1.id, task2.id)
      ).rejects.toThrow(ConstraintError);
    });

    it('should record an event for the dependency', async () => {
      const task = await createTestTask();
      const plan = await createTestPlan();
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(plan));

      await api.addTaskToPlan(task.id, plan.id);

      // Check dependency added event was recorded
      const events = await api.getEvents(task.id);
      const depEvents = events.filter(e => e.eventType === 'dependency_added');
      expect(depEvents.length).toBe(1);
      expect(depEvents[0].newValue).toMatchObject({
        blockedId: task.id,
        blockerId: plan.id,
        type: 'parent-child',
      });
    });
  });

  // --------------------------------------------------------------------------
  // removeTaskFromPlan Tests
  // --------------------------------------------------------------------------

  describe('removeTaskFromPlan()', () => {
    it('should remove a task from a plan', async () => {
      const task = await createTestTask();
      const plan = await createTestPlan();
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(plan));
      await api.addTaskToPlan(task.id, plan.id);

      // Remove task from plan
      await api.removeTaskFromPlan(task.id, plan.id);

      // Verify task is no longer in plan
      const tasksInPlan = await api.getTasksInPlan(plan.id);
      expect(tasksInPlan).toHaveLength(0);
    });

    it('should throw NotFoundError when task-plan relationship does not exist', async () => {
      const task = await createTestTask();
      const plan = await createTestPlan();
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(plan));

      // Task was never added to plan
      await expect(
        api.removeTaskFromPlan(task.id, plan.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('should allow task to be added to a different plan after removal', async () => {
      const task = await createTestTask();
      const plan1 = await createTestPlan({ title: 'Plan 1' });
      const plan2 = await createTestPlan({ title: 'Plan 2' });
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(plan1));
      await api.create(toCreateInput(plan2));

      // Add to plan 1, remove, then add to plan 2
      await api.addTaskToPlan(task.id, plan1.id);
      await api.removeTaskFromPlan(task.id, plan1.id);
      const dependency = await api.addTaskToPlan(task.id, plan2.id);

      expect(dependency.blockerId).toBe(plan2.id);

      // Verify task is in plan 2
      const tasksInPlan2 = await api.getTasksInPlan(plan2.id);
      expect(tasksInPlan2.map(t => t.id)).toContain(task.id);
    });

    it('should record dependency_removed event', async () => {
      const task = await createTestTask();
      const plan = await createTestPlan();
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(plan));
      await api.addTaskToPlan(task.id, plan.id);

      await api.removeTaskFromPlan(task.id, plan.id);

      const events = await api.getEvents(task.id);
      const removeEvents = events.filter(e => e.eventType === 'dependency_removed');
      expect(removeEvents.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // getTasksInPlan Tests
  // --------------------------------------------------------------------------

  describe('getTasksInPlan()', () => {
    it('should return all tasks in a plan', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      const task3 = await createTestTask({ title: 'Task 3' });
      const plan = await createTestPlan();

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));
      await api.create(toCreateInput(plan));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);
      // task3 not added to plan

      const tasksInPlan = await api.getTasksInPlan(plan.id);
      expect(tasksInPlan).toHaveLength(2);
      expect(tasksInPlan.map(t => t.id)).toContain(task1.id);
      expect(tasksInPlan.map(t => t.id)).toContain(task2.id);
      expect(tasksInPlan.map(t => t.id)).not.toContain(task3.id);
    });

    it('should return empty array for plan with no tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const tasksInPlan = await api.getTasksInPlan(plan.id);
      expect(tasksInPlan).toHaveLength(0);
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      await expect(
        api.getTasksInPlan('el-nonexistent' as ElementId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should filter tasks by status', async () => {
      const openTask = await createTestTask({ title: 'Open Task' });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });
      const plan = await createTestPlan();

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(closedTask));
      await api.create(toCreateInput(plan));

      await api.addTaskToPlan(openTask.id, plan.id);
      await api.addTaskToPlan(closedTask.id, plan.id);

      const openTasks = await api.getTasksInPlan(plan.id, { status: TaskStatus.OPEN });
      expect(openTasks).toHaveLength(1);
      expect(openTasks[0].id).toBe(openTask.id);
    });

    it('should filter tasks by priority', async () => {
      const highPriority = await createTestTask({ title: 'High Priority', priority: Priority.HIGH });
      const lowPriority = await createTestTask({ title: 'Low Priority', priority: Priority.LOW });
      const plan = await createTestPlan();

      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(lowPriority));
      await api.create(toCreateInput(plan));

      await api.addTaskToPlan(highPriority.id, plan.id);
      await api.addTaskToPlan(lowPriority.id, plan.id);

      const highPriorityTasks = await api.getTasksInPlan(plan.id, { priority: Priority.HIGH });
      expect(highPriorityTasks).toHaveLength(1);
      expect(highPriorityTasks[0].id).toBe(highPriority.id);
    });

    it('should filter tasks by assignee', async () => {
      const assignee1 = 'user:alice' as EntityId;
      const assignee2 = 'user:bob' as EntityId;
      const task1 = await createTestTask({ title: 'Task 1', assignee: assignee1 });
      const task2 = await createTestTask({ title: 'Task 2', assignee: assignee2 });
      const plan = await createTestPlan();

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(plan));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);

      const aliceTasks = await api.getTasksInPlan(plan.id, { assignee: assignee1 });
      expect(aliceTasks).toHaveLength(1);
      expect(aliceTasks[0].assignee).toBe(assignee1);
    });

    it('should filter tasks by tags', async () => {
      const urgentTask = await createTestTask({ title: 'Urgent', tags: ['urgent', 'bug'] });
      const normalTask = await createTestTask({ title: 'Normal', tags: ['feature'] });
      const plan = await createTestPlan();

      await api.create(toCreateInput(urgentTask));
      await api.create(toCreateInput(normalTask));
      await api.create(toCreateInput(plan));

      await api.addTaskToPlan(urgentTask.id, plan.id);
      await api.addTaskToPlan(normalTask.id, plan.id);

      const urgentTasks = await api.getTasksInPlan(plan.id, { tags: ['urgent'] });
      expect(urgentTasks).toHaveLength(1);
      expect(urgentTasks[0].id).toBe(urgentTask.id);
    });
  });

  // --------------------------------------------------------------------------
  // createTaskInPlan Tests
  // --------------------------------------------------------------------------

  describe('createTaskInPlan()', () => {
    it('should create a task with hierarchical ID', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask 1',
      });

      expect(task.id).toMatch(new RegExp(`^${plan.id}\\.\\d+$`));
      expect(task.title).toBe('Subtask 1');
    });

    it('should create sequential hierarchical IDs', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask 1',
      });

      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask 2',
      });

      expect(task1.id).toBe(`${plan.id}.1` as ElementId);
      expect(task2.id).toBe(`${plan.id}.2` as ElementId);
    });

    it('should automatically add parent-child dependency', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask',
      });

      // Verify task appears in plan's tasks
      const tasksInPlan = await api.getTasksInPlan(plan.id);
      expect(tasksInPlan.map(t => t.id)).toContain(task.id);

      // Verify parent-child dependency exists
      const dependencies = await api.getDependencies(task.id, ['parent-child']);
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].blockerId).toBe(plan.id);
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      await expect(
        api.createTaskInPlan('el-nonexistent' as ElementId, {
          createdBy: mockEntityId,
          title: 'Subtask',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when plan is completed', async () => {
      const plan = await createTestPlan({ status: PlanStatus.COMPLETED });
      await api.create(toCreateInput(plan));

      await expect(
        api.createTaskInPlan(plan.id, {
          createdBy: mockEntityId,
          title: 'Subtask',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when plan is cancelled', async () => {
      const plan = await createTestPlan({ status: PlanStatus.CANCELLED });
      await api.create(toCreateInput(plan));

      await expect(
        api.createTaskInPlan(plan.id, {
          createdBy: mockEntityId,
          title: 'Subtask',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should work with draft plan status', async () => {
      const plan = await createTestPlan({ status: PlanStatus.DRAFT });
      await api.create(toCreateInput(plan));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask',
      });

      expect(task).toBeDefined();
      expect(task.id).toMatch(new RegExp(`^${plan.id}\\.\\d+$`));
    });

    it('should work with active plan status', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask',
      });

      expect(task).toBeDefined();
      expect(task.id).toMatch(new RegExp(`^${plan.id}\\.\\d+$`));
    });

    it('should throw ConstraintError when target is not a plan', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(
        api.createTaskInPlan(task.id, {
          createdBy: mockEntityId,
          title: 'Subtask',
        })
      ).rejects.toThrow(ConstraintError);
    });
  });

  // --------------------------------------------------------------------------
  // Integration with Ready/Blocked Queries Tests
  // --------------------------------------------------------------------------

  describe('Integration with Ready/Blocked Queries', () => {
    it('should include plan tasks in ready query', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Ready Task',
      });

      const readyTasks = await api.ready();
      expect(readyTasks.map(t => t.id)).toContain(task.id);
    });

    it('should include blocked plan tasks in blocked query', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const blocker = await createTestTask({ title: 'Blocker' });
      await api.create(toCreateInput(blocker));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Blocked Task',
      });

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockerId: blocker.id,
        blockedId: task.id,
        type: 'blocks',
      });

      const blockedTasks = await api.blocked();
      expect(blockedTasks.map(t => t.id)).toContain(task.id);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle adding many tasks to a single plan', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const taskCount = 10;
      const tasks: Task[] = [];

      for (let i = 0; i < taskCount; i++) {
        const task = await api.createTaskInPlan(plan.id, {
          createdBy: mockEntityId,
          title: `Task ${i + 1}`,
        });
        tasks.push(task);
      }

      // Verify all tasks have sequential hierarchical IDs
      for (let i = 0; i < taskCount; i++) {
        expect(tasks[i].id).toBe(`${plan.id}.${i + 1}` as ElementId);
      }

      // Verify all tasks are in the plan
      const tasksInPlan = await api.getTasksInPlan(plan.id);
      expect(tasksInPlan).toHaveLength(taskCount);
    });

    it('should maintain correct counter after task removal', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 1',
      });

      // Remove task1 from plan
      await api.removeTaskFromPlan(task1.id, plan.id);

      // Create another task - should get the next sequential number, not reuse 1
      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 2',
      });

      // The counter should continue from 2, not restart from 1
      expect(task2.id).toBe(`${plan.id}.2` as ElementId);
    });
  });

  // --------------------------------------------------------------------------
  // getPlanProgress Tests
  // --------------------------------------------------------------------------

  describe('getPlanProgress()', () => {
    it('should return zero progress for empty plan', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const progress = await api.getPlanProgress(plan.id);

      expect(progress.totalTasks).toBe(0);
      expect(progress.completedTasks).toBe(0);
      expect(progress.inProgressTasks).toBe(0);
      expect(progress.blockedTasks).toBe(0);
      expect(progress.remainingTasks).toBe(0);
      expect(progress.completionPercentage).toBe(0);
    });

    it('should count tasks by status', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      // Create tasks with different statuses
      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const inProgressTask = await createTestTask({ title: 'In Progress Task', status: TaskStatus.IN_PROGRESS });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });
      const deferredTask = await createTestTask({ title: 'Deferred Task', status: TaskStatus.DEFERRED });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(inProgressTask));
      await api.create(toCreateInput(closedTask));
      await api.create(toCreateInput(deferredTask));

      // Add all to plan
      await api.addTaskToPlan(openTask.id, plan.id);
      await api.addTaskToPlan(inProgressTask.id, plan.id);
      await api.addTaskToPlan(closedTask.id, plan.id);
      await api.addTaskToPlan(deferredTask.id, plan.id);

      const progress = await api.getPlanProgress(plan.id);

      expect(progress.totalTasks).toBe(4);
      expect(progress.completedTasks).toBe(1); // closed
      expect(progress.inProgressTasks).toBe(1);
      expect(progress.blockedTasks).toBe(0);
      expect(progress.remainingTasks).toBe(2); // open + deferred
      expect(progress.completionPercentage).toBe(25); // 1/4 = 25%
    });

    it('should calculate completion percentage correctly', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      // Create 3 tasks, all closed
      const task1 = await createTestTask({ title: 'Task 1', status: TaskStatus.CLOSED });
      const task2 = await createTestTask({ title: 'Task 2', status: TaskStatus.CLOSED });
      const task3 = await createTestTask({ title: 'Task 3', status: TaskStatus.OPEN });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);
      await api.addTaskToPlan(task3.id, plan.id);

      const progress = await api.getPlanProgress(plan.id);

      expect(progress.totalTasks).toBe(3);
      expect(progress.completedTasks).toBe(2);
      expect(progress.completionPercentage).toBe(67); // Math.round(2/3 * 100) = 67
    });

    it('should report 100% completion when all tasks are closed', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task1 = await createTestTask({ title: 'Task 1', status: TaskStatus.CLOSED });
      const task2 = await createTestTask({ title: 'Task 2', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      await api.addTaskToPlan(task1.id, plan.id);
      await api.addTaskToPlan(task2.id, plan.id);

      const progress = await api.getPlanProgress(plan.id);

      expect(progress.totalTasks).toBe(2);
      expect(progress.completedTasks).toBe(2);
      expect(progress.remainingTasks).toBe(0);
      expect(progress.completionPercentage).toBe(100);
    });

    it('should track blocked tasks', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const blocker = await createTestTask({ title: 'Blocker' });
      const blockedTask = await createTestTask({ title: 'Blocked Task', status: TaskStatus.BLOCKED });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blockedTask));
      await api.addTaskToPlan(blockedTask.id, plan.id);

      const progress = await api.getPlanProgress(plan.id);

      expect(progress.totalTasks).toBe(1);
      expect(progress.blockedTasks).toBe(1);
      expect(progress.completionPercentage).toBe(0);
    });

    it('should throw NotFoundError for non-existent plan', async () => {
      await expect(
        api.getPlanProgress('el-nonexistent' as ElementId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when element is not a plan', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(
        api.getPlanProgress(task.id)
      ).rejects.toThrow(ConstraintError);
    });

    it('should exclude tombstone tasks from progress', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const activeTask = await createTestTask({ title: 'Active Task', status: TaskStatus.OPEN });
      const tombstoneTask = await createTestTask({ title: 'Tombstone Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(activeTask));
      await api.create(toCreateInput(tombstoneTask));

      await api.addTaskToPlan(activeTask.id, plan.id);
      await api.addTaskToPlan(tombstoneTask.id, plan.id);

      // Soft delete one task
      await api.delete(tombstoneTask.id);

      const progress = await api.getPlanProgress(plan.id);

      // Only the active task should be counted
      expect(progress.totalTasks).toBe(1);
    });

    it('should work with tasks created via createTaskInPlan', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask 1',
      });

      await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Subtask 2',
      });

      const progress = await api.getPlanProgress(plan.id);

      expect(progress.totalTasks).toBe(2);
      expect(progress.remainingTasks).toBe(2); // Both are open by default
      expect(progress.completionPercentage).toBe(0);
    });

    it('should update progress when task status changes', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task',
      });

      // Initially should be 0% complete
      let progress = await api.getPlanProgress(plan.id);
      expect(progress.completionPercentage).toBe(0);

      // Update task to closed
      await api.update<Task>(task.id, { status: TaskStatus.CLOSED });

      // Now should be 100% complete
      progress = await api.getPlanProgress(plan.id);
      expect(progress.completionPercentage).toBe(100);
    });

    it('should handle mixed status plan with multiple task types', async () => {
      const plan = await createTestPlan();
      await api.create(toCreateInput(plan));

      // Create 10 tasks with various statuses
      const tasks = [
        await createTestTask({ title: 'Task 1', status: TaskStatus.CLOSED }),
        await createTestTask({ title: 'Task 2', status: TaskStatus.CLOSED }),
        await createTestTask({ title: 'Task 3', status: TaskStatus.CLOSED }),
        await createTestTask({ title: 'Task 4', status: TaskStatus.IN_PROGRESS }),
        await createTestTask({ title: 'Task 5', status: TaskStatus.IN_PROGRESS }),
        await createTestTask({ title: 'Task 6', status: TaskStatus.BLOCKED }),
        await createTestTask({ title: 'Task 7', status: TaskStatus.OPEN }),
        await createTestTask({ title: 'Task 8', status: TaskStatus.OPEN }),
        await createTestTask({ title: 'Task 9', status: TaskStatus.DEFERRED }),
        await createTestTask({ title: 'Task 10', status: TaskStatus.DEFERRED }),
      ];

      for (const task of tasks) {
        await api.create(toCreateInput(task));
        await api.addTaskToPlan(task.id, plan.id);
      }

      const progress = await api.getPlanProgress(plan.id);

      expect(progress.totalTasks).toBe(10);
      expect(progress.completedTasks).toBe(3);
      expect(progress.inProgressTasks).toBe(2);
      expect(progress.blockedTasks).toBe(1);
      expect(progress.remainingTasks).toBe(4); // 2 open + 2 deferred
      expect(progress.completionPercentage).toBe(30); // 3/10 = 30%
    });
  });
});
