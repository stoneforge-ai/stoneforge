/**
 * Automatic Blocked Status Computation Tests
 *
 * These tests verify that task status automatically transitions to 'blocked'
 * when blocking dependencies are added, and automatically restores the previous
 * status when all blockers are resolved.
 *
 * Per the spec:
 * - "Task becomes `blocked` when blocking dependency added"
 * - "Task becomes unblocked when all blockers resolve"
 * - "`blocked` status is computed, not directly set by users"
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Task } from '@stoneforge/core';
import { createTask, TaskStatus, Priority, DependencyType, GateType, EventType } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

async function createTestTask(overrides: Partial<Parameters<typeof createTask>[0]> = {}): Promise<Task> {
  return createTask({
    title: 'Test Task',
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Automatic Blocked Status Computation', () => {
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

  // ==========================================================================
  // Automatic Blocking
  // ==========================================================================

  describe('Automatic Status Transition to Blocked', () => {
    it('should automatically change task status to blocked when blocks dependency is added', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Verify initial status
      const taskBefore = await api.get<Task>(task.id);
      expect(taskBefore?.status).toBe(TaskStatus.OPEN);

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify status automatically changed to blocked
      const taskAfter = await api.get<Task>(task.id);
      expect(taskAfter?.status).toBe(TaskStatus.BLOCKED);
    });

    it('should automatically change task status from in_progress to blocked', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.IN_PROGRESS });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Verify initial status
      const taskBefore = await api.get<Task>(task.id);
      expect(taskBefore?.status).toBe(TaskStatus.IN_PROGRESS);

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify status automatically changed to blocked
      const taskAfter = await api.get<Task>(task.id);
      expect(taskAfter?.status).toBe(TaskStatus.BLOCKED);
    });

    it('should not change status when task is already closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify status remains closed
      const taskAfter = await api.get<Task>(task.id);
      expect(taskAfter?.status).toBe(TaskStatus.CLOSED);
    });

    it('should not change status when task is deferred', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.DEFERRED });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify status remains deferred
      const taskAfter = await api.get<Task>(task.id);
      expect(taskAfter?.status).toBe(TaskStatus.DEFERRED);
    });

    it('should record auto_blocked event when status changes', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify auto_blocked event was recorded
      const events = await api.getEvents(task.id);
      const autoBlockedEvent = events.find((e) => e.eventType === EventType.AUTO_BLOCKED);
      expect(autoBlockedEvent).toBeDefined();
      expect(autoBlockedEvent?.oldValue).toEqual({ status: TaskStatus.OPEN });
      expect(autoBlockedEvent?.newValue).toEqual({ status: TaskStatus.BLOCKED });
      expect(autoBlockedEvent?.actor).toBe('system:blocked-cache' as EntityId);
    });
  });

  // ==========================================================================
  // Automatic Unblocking
  // ==========================================================================

  describe('Automatic Status Restoration when Unblocked', () => {
    it('should restore original status when blocker is closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify blocked
      let taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);

      // Close the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify original status restored
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.OPEN);
    });

    it('should restore in_progress status when blocker is closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.IN_PROGRESS });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify blocked
      let taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);

      // Close the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify in_progress status restored
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should restore status when dependency is removed', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify blocked
      let taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);

      // Remove the dependency (blockedId first, then blockerId)
      await api.removeDependency(task.id, blocker.id, DependencyType.BLOCKS);

      // Verify original status restored
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.OPEN);
    });

    it('should record auto_unblocked event when status is restored', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Close the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify auto_unblocked event was recorded
      const events = await api.getEvents(task.id);
      const autoUnblockedEvent = events.find((e) => e.eventType === EventType.AUTO_UNBLOCKED);
      expect(autoUnblockedEvent).toBeDefined();
      expect(autoUnblockedEvent?.oldValue).toEqual({ status: TaskStatus.BLOCKED });
      expect(autoUnblockedEvent?.newValue).toEqual({ status: TaskStatus.OPEN });
    });
  });

  // ==========================================================================
  // Multiple Blockers
  // ==========================================================================

  describe('Multiple Blockers', () => {
    it('should remain blocked until all blockers are resolved', async () => {
      const blocker1 = await createTestTask({ title: 'Blocker 1', status: TaskStatus.OPEN });
      const blocker2 = await createTestTask({ title: 'Blocker 2', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker1));
      await api.create(toCreateInput(blocker2));
      await api.create(toCreateInput(task));

      // Add two blocking dependencies (blockers block task - task waits for blockers to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker1.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker2.id,
        type: DependencyType.BLOCKS,
      });

      // Verify blocked
      let taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);

      // Close first blocker
      await api.update<Task>(blocker1.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Still blocked by blocker2
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);

      // Close second blocker
      await api.update<Task>(blocker2.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Now unblocked
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.OPEN);
    });
  });

  // ==========================================================================
  // Transitive Blocking
  // ==========================================================================

  describe('Transitive Blocking with Parent-Child', () => {
    it('should block child when parent becomes blocked', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const parent = await createTestTask({ title: 'Parent', status: TaskStatus.OPEN });
      const child = await createTestTask({ title: 'Child', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(parent));
      await api.create(toCreateInput(child));

      // Create parent-child relationship
      await api.addDependency({
        blockedId: child.id,
        blockerId: parent.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Block the parent (blocker blocks parent - parent waits for blocker to close)
      await api.addDependency({
        blockedId: parent.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Both parent and child should be blocked
      const parentState = await api.get<Task>(parent.id);
      const childState = await api.get<Task>(child.id);
      expect(parentState?.status).toBe(TaskStatus.BLOCKED);
      expect(childState?.status).toBe(TaskStatus.BLOCKED);
    });

    it('should unblock entire hierarchy when root blocker is resolved', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const parent = await createTestTask({ title: 'Parent', status: TaskStatus.OPEN });
      const child = await createTestTask({ title: 'Child', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(parent));
      await api.create(toCreateInput(child));

      // Create parent-child relationship
      await api.addDependency({
        blockedId: child.id,
        blockerId: parent.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Block the parent (blocker blocks parent - parent waits for blocker to close)
      await api.addDependency({
        blockedId: parent.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Close the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Parent should be unblocked, but child still blocked by non-closed parent
      const parentState = await api.get<Task>(parent.id);
      expect(parentState?.status).toBe(TaskStatus.OPEN);

      // Close the parent to unblock child
      await api.update<Task>(parent.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      const childState = await api.get<Task>(child.id);
      expect(childState?.status).toBe(TaskStatus.OPEN);
    });
  });

  // ==========================================================================
  // Gate Dependencies
  // ==========================================================================

  describe('Gate Dependencies', () => {
    it('should block task on timer gate until time passes', async () => {
      const gate = await createTestTask({ title: 'Timer Gate', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(task));

      // Create awaits dependency with future timer
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await api.addDependency({
        blockedId: task.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: futureTime,
        },
      });

      // Should be blocked
      const taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);
    });

    it('should not block on satisfied timer gate', async () => {
      const gate = await createTestTask({ title: 'Timer Gate', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(task));

      // Create awaits dependency with past timer
      const pastTime = new Date(Date.now() - 1000).toISOString();
      await api.addDependency({
        blockedId: task.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: pastTime,
        },
      });

      // Should NOT be blocked (timer has passed)
      const taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.OPEN);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should not block when blocker is already closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.CLOSED });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency to already-closed blocker (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Should NOT be blocked
      const taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.OPEN);
    });

    it('should handle re-blocking after unblocking', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.IN_PROGRESS });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify blocked
      let taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);

      // Close blocker to unblock
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify unblocked
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.IN_PROGRESS);

      // Reopen blocker to re-block
      await api.update<Task>(blocker.id, { status: TaskStatus.OPEN } as Partial<Task>);

      // Verify blocked again
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.BLOCKED);

      // Close blocker again
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify unblocked again (restores in_progress)
      taskState = await api.get<Task>(task.id);
      expect(taskState?.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should not throw errors when non-task elements have blocking dependencies', async () => {
      // This test verifies that automatic blocking only affects tasks
      // Non-task elements should not cause errors when blocked
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));

      // Create an entity (non-task)
      const { createEntity } = await import('@stoneforge/core');
      const entity = await createEntity({
        name: 'test-entity',
        entityType: 'human',
        createdBy: mockEntityId,
      });

      await api.create(toCreateInput(entity));

      // Add blocking dependency to entity (unusual but allowed)
      // blocker blocks entity - entity waits for blocker to close
      await api.addDependency({
        blockedId: entity.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Entity should still be in blocked cache but no status change attempted
      // (entities don't have status field)
      const entityAfter = await api.get(entity.id);
      expect(entityAfter).toBeDefined();
      // Entities don't have status, so no change expected - just verify no errors
    });
  });

  // ==========================================================================
  // Integration with Ready/Blocked Queries
  // ==========================================================================

  describe('Integration with Ready/Blocked Queries', () => {
    it('should show automatically blocked tasks in blocked() query', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify task appears in blocked query
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(task.id);
      expect(blockedTasks.find((t) => t.id === task.id)?.status).toBe(TaskStatus.BLOCKED);
    });

    it('should exclude automatically blocked tasks from ready() query', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify task not in ready query
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(task.id);
    });

    it('should include unblocked task in ready() query after restoration', async () => {
      const blocker = await createTestTask({ title: 'Blocker', status: TaskStatus.OPEN });
      const task = await createTestTask({ title: 'Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Add blocking dependency (blocker blocks task - task waits for blocker to close)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Close blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify task now in ready query with restored status
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
      expect(readyTasks.find((t) => t.id === task.id)?.status).toBe(TaskStatus.OPEN);
    });
  });
});
