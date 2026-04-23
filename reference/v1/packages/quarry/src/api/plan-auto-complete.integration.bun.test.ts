/**
 * Plan Auto-Completion Integration Tests
 *
 * Tests the plan auto-completion feature end-to-end:
 * - Auto-complete on last task close
 * - Reopen on task reopen
 * - Tombstone exclusion
 * - Draft plan not affected
 * - Mixed statuses prevent completion
 * - Task deletion triggers check
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Task, Plan } from '@stoneforge/core';
import {
  createTask,
  createPlan,
  PlanStatus,
  TaskStatus,
  canAutoComplete,
} from '@stoneforge/core';

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

/**
 * Simulate the plan auto-complete sweep logic (mirrors CLI planAutoCompleteHandler).
 *
 * For each active plan:
 *   1. Get non-deleted tasks
 *   2. Build status counts
 *   3. If canAutoComplete, transition plan to COMPLETED
 *
 * Returns the list of plan IDs that were auto-completed.
 */
async function runAutoCompleteSweep(api: QuarryAPIImpl): Promise<string[]> {
  const allPlans = await api.list<Plan>({ type: 'plan' });
  const activePlans = allPlans.filter((p) => p.status === PlanStatus.ACTIVE);

  const autoCompleted: string[] = [];

  for (const plan of activePlans) {
    const tasks = await api.getTasksInPlan(plan.id, { includeDeleted: false });

    const statusCounts: Record<string, number> = {
      [TaskStatus.OPEN]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.BLOCKED]: 0,
      [TaskStatus.CLOSED]: 0,
      [TaskStatus.DEFERRED]: 0,
      [TaskStatus.TOMBSTONE]: 0,
    };

    for (const task of tasks) {
      if (task.status in statusCounts) {
        statusCounts[task.status]++;
      }
    }

    if (canAutoComplete(statusCounts as Record<TaskStatus, number>)) {
      const now = new Date().toISOString();
      await api.update<Plan>(plan.id, { status: PlanStatus.COMPLETED, completedAt: now });
      autoCompleted.push(plan.id);
    }
  }

  return autoCompleted;
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Plan Auto-Completion', () => {
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
  // 1. Auto-complete on last task close
  // --------------------------------------------------------------------------

  describe('Auto-complete on last task close', () => {
    it('should auto-complete an active plan when all 3 tasks are closed one by one', async () => {
      // Create an active plan with 3 tasks
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 1',
      });
      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 2',
      });
      const task3 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 3',
      });

      // Close task 1 — plan should NOT auto-complete
      await api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
      let completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      // Verify plan is still active
      let currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.ACTIVE);

      // Close task 2 — plan should still NOT auto-complete
      await api.update<Task>(task2.id, { status: TaskStatus.CLOSED });
      completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.ACTIVE);

      // Close task 3 — plan SHOULD auto-complete
      await api.update<Task>(task3.id, { status: TaskStatus.CLOSED });
      completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(1);
      expect(completed[0]).toBe(plan.id);

      // Verify plan is now completed
      currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.COMPLETED);
      expect(currentPlan!.completedAt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Reopen on task reopen
  // --------------------------------------------------------------------------

  describe('Reopen on task reopen', () => {
    it('should allow reopening a plan when a task is reopened after auto-completion', async () => {
      // Create an active plan with 2 closed tasks
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 1',
      });
      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 2',
      });

      // Close both tasks
      await api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
      await api.update<Task>(task2.id, { status: TaskStatus.CLOSED });

      // Auto-complete sweep should complete the plan
      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(1);

      let currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.COMPLETED);

      // Reopen the plan (completed → active)
      await api.update<Plan>(plan.id, { status: PlanStatus.ACTIVE });

      // Reopen task 1 (set back to open)
      await api.update<Task>(task1.id, { status: TaskStatus.OPEN });

      // The plan should now be active and NOT eligible for auto-complete
      currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.ACTIVE);

      const newCompleted = await runAutoCompleteSweep(api);
      expect(newCompleted).toHaveLength(0);

      // Close task 1 again — plan should auto-complete again
      await api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
      const finalCompleted = await runAutoCompleteSweep(api);
      expect(finalCompleted).toHaveLength(1);

      currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.COMPLETED);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Tombstone exclusion
  // --------------------------------------------------------------------------

  describe('Tombstone exclusion', () => {
    it('should auto-complete when one task is tombstoned and the other is closed', async () => {
      // Create an active plan with 2 tasks
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task to close',
      });
      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task to tombstone',
      });

      // Tombstone task 2 (soft delete)
      await api.delete(task2.id);

      // At this point, only task1 is alive and it's open — should NOT auto-complete
      let completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      // Close task 1
      await api.update<Task>(task1.id, { status: TaskStatus.CLOSED });

      // Now the only non-tombstoned task is closed — should auto-complete
      completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(1);
      expect(completed[0]).toBe(plan.id);

      const currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.COMPLETED);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Draft plan not affected
  // --------------------------------------------------------------------------

  describe('Draft plan not affected', () => {
    it('should NOT auto-complete a draft plan even when all tasks are closed', async () => {
      // Create a DRAFT plan with tasks
      const plan = await createTestPlan({ status: PlanStatus.DRAFT });
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 1',
      });
      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 2',
      });

      // Close all tasks
      await api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
      await api.update<Task>(task2.id, { status: TaskStatus.CLOSED });

      // Run auto-complete sweep — should NOT complete the draft plan
      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      // Verify plan is still in draft status
      const currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.DRAFT);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Mixed statuses prevent completion
  // --------------------------------------------------------------------------

  describe('Mixed statuses prevent completion', () => {
    it('should NOT auto-complete when tasks have mixed statuses', async () => {
      // Create an active plan
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const openTask = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Open Task',
      });
      const inProgressTask = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'In Progress Task',
      });
      const closedTask = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Closed Task',
      });

      // Set task statuses to mixed values
      // openTask is already OPEN by default
      await api.update<Task>(inProgressTask.id, { status: TaskStatus.IN_PROGRESS });
      await api.update<Task>(closedTask.id, { status: TaskStatus.CLOSED });

      // Run auto-complete — should NOT complete (has open + in_progress tasks)
      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      // Verify plan is still active
      const currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.ACTIVE);

      // Verify progress shows mixed statuses
      const progress = await api.getPlanProgress(plan.id);
      expect(progress.totalTasks).toBe(3);
      expect(progress.completedTasks).toBe(1);
      expect(progress.inProgressTasks).toBe(1);
      expect(progress.remainingTasks).toBe(1);
    });

    it('should NOT auto-complete when a task is blocked', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const closedTask = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Closed Task',
      });
      const blockedTask = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Blocked Task',
      });

      await api.update<Task>(closedTask.id, { status: TaskStatus.CLOSED });
      await api.update<Task>(blockedTask.id, { status: TaskStatus.BLOCKED });

      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);
    });

    it('should NOT auto-complete when a task is deferred', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const closedTask = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Closed Task',
      });
      const deferredTask = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Deferred Task',
      });

      await api.update<Task>(closedTask.id, { status: TaskStatus.CLOSED });
      await api.update<Task>(deferredTask.id, { status: TaskStatus.DEFERRED });

      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Task deletion triggers check
  // --------------------------------------------------------------------------

  describe('Task deletion triggers check', () => {
    it('should auto-complete when the last non-closed task is tombstoned', async () => {
      // Create an active plan with 3 tasks
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 1 (will close)',
      });
      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 2 (will close)',
      });
      const task3 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 3 (will delete)',
      });

      // Close tasks 1 and 2
      await api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
      await api.update<Task>(task2.id, { status: TaskStatus.CLOSED });

      // Plan should NOT auto-complete yet (task3 is still open)
      let completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      // Delete (tombstone) task 3 — the last non-closed task
      await api.delete(task3.id);

      // Now all remaining non-tombstone tasks are closed — should auto-complete
      completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(1);
      expect(completed[0]).toBe(plan.id);

      const currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.COMPLETED);
    });

    it('should NOT auto-complete when all tasks are tombstoned (no tasks left)', async () => {
      // Create an active plan with 2 tasks
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task1 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 1',
      });
      const task2 = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task 2',
      });

      // Delete both tasks
      await api.delete(task1.id);
      await api.delete(task2.id);

      // Should NOT auto-complete — no tasks remain (canAutoComplete requires > 0 tasks)
      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      const currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.ACTIVE);
    });
  });

  // --------------------------------------------------------------------------
  // Additional edge cases
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should not auto-complete a plan with no tasks', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      const currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.ACTIVE);
    });

    it('should handle multiple active plans independently', async () => {
      // Plan 1: all tasks closed (should auto-complete)
      const plan1 = await createTestPlan({ status: PlanStatus.ACTIVE, title: 'Plan 1' });
      await api.create(toCreateInput(plan1));

      const p1task = await api.createTaskInPlan(plan1.id, {
        createdBy: mockEntityId,
        title: 'P1 Task',
      });
      await api.update<Task>(p1task.id, { status: TaskStatus.CLOSED });

      // Plan 2: has open tasks (should NOT auto-complete)
      const plan2 = await createTestPlan({ status: PlanStatus.ACTIVE, title: 'Plan 2' });
      await api.create(toCreateInput(plan2));

      await api.createTaskInPlan(plan2.id, {
        createdBy: mockEntityId,
        title: 'P2 Open Task',
      });

      // Run sweep
      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(1);
      expect(completed[0]).toBe(plan1.id);

      // Verify plan1 is completed, plan2 is still active
      const currentPlan1 = await api.get<Plan>(plan1.id);
      expect(currentPlan1!.status).toBe(PlanStatus.COMPLETED);

      const currentPlan2 = await api.get<Plan>(plan2.id);
      expect(currentPlan2!.status).toBe(PlanStatus.ACTIVE);
    });

    it('should not auto-complete cancelled plans', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      const task = await api.createTaskInPlan(plan.id, {
        createdBy: mockEntityId,
        title: 'Task',
      });
      await api.update<Task>(task.id, { status: TaskStatus.CLOSED });

      // Cancel the plan before running auto-complete
      await api.update<Plan>(plan.id, { status: PlanStatus.CANCELLED });

      const completed = await runAutoCompleteSweep(api);
      expect(completed).toHaveLength(0);

      const currentPlan = await api.get<Plan>(plan.id);
      expect(currentPlan!.status).toBe(PlanStatus.CANCELLED);
    });
  });
});
