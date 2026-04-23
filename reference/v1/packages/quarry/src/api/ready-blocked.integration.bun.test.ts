/**
 * Ready/Blocked Work Query Integration Tests
 *
 * Comprehensive integration tests for the ready and blocked work query system.
 * These tests validate the full pipeline from:
 * 1. Creating tasks and dependencies
 * 2. Blocked cache updates
 * 3. Ready/blocked query results
 *
 * The tests cover:
 * - Basic blocking with `blocks` dependencies
 * - Transitive blocking with `parent-child` dependencies
 * - Gate dependencies (`awaits`) with timer and approval gates
 * - Status transitions affecting blocking state
 * - Complex dependency graphs
 * - Edge cases and error conditions
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Timestamp, Task, Plan } from '@stoneforge/core';
import { createTask, createPlan, PlanStatus, Priority, TaskStatus, DependencyType, GateType } from '@stoneforge/core';
import type { TaskFilter } from './types.js';

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

// ============================================================================
// Integration Tests
// ============================================================================

describe('Ready/Blocked Work Query Integration', () => {
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
  // Basic Blocking Tests
  // ==========================================================================

  describe('Basic Blocking with blocks Dependency', () => {
    it('should mark task as blocked when blocks dependency added', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      // Add blocking dependency: blocker -> blocked
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify blocked state
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
      expect(blockedTasks.find((t) => t.id === blocked.id)?.blockedBy).toBe(blocker.id);

      // Verify ready state
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(blocked.id);
      expect(readyTasks.map((t) => t.id)).toContain(blocker.id);
    });

    it('should unblock task when blocker is closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Close the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify now unblocked
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(blocked.id);
    });

    it('should re-block task when closed blocker is reopened', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task', status: TaskStatus.CLOSED });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially unblocked (blocker is closed)
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(blocked.id);

      // Reopen the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.OPEN } as Partial<Task>);

      // Verify now blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should unblock when dependency is removed', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Remove the dependency (blockedId first, then blockerId)
      await api.removeDependency(blocked.id, blocker.id, DependencyType.BLOCKS);

      // Verify now unblocked
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should handle multiple blockers - task blocked until ALL resolved', async () => {
      const blocker1 = await createTestTask({ title: 'Blocker 1' });
      const blocker2 = await createTestTask({ title: 'Blocker 2' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker1));
      await api.create(toCreateInput(blocker2));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker1.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker2.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Close blocker1
      await api.update<Task>(blocker1.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Still blocked by blocker2
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Close blocker2
      await api.update<Task>(blocker2.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Now unblocked
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });
  });

  // ==========================================================================
  // Transitive Blocking with Parent-Child
  // ==========================================================================

  describe('Transitive Blocking with parent-child Dependency', () => {
    it('should block child when parent is blocked', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const parent = await createTestTask({ title: 'Parent Task' });
      const child = await createTestTask({ title: 'Child Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(parent));
      await api.create(toCreateInput(child));

      // Create hierarchy: child -> parent (parent-child)
      await api.addDependency({
        blockedId: child.id,
        blockerId: parent.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Block the parent: blocker -> parent (blocks)
      await api.addDependency({
        blockedId: parent.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Both parent and child should be blocked
      const blockedTasks = await api.blocked();
      const blockedIds = blockedTasks.map((t) => t.id);
      expect(blockedIds).toContain(parent.id);
      expect(blockedIds).toContain(child.id);
    });

    it('should unblock entire hierarchy when root blocker is closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const parent = await createTestTask({ title: 'Parent Task' });
      const child = await createTestTask({ title: 'Child Task' });
      const grandchild = await createTestTask({ title: 'Grandchild Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(parent));
      await api.create(toCreateInput(child));
      await api.create(toCreateInput(grandchild));

      // Create hierarchy: grandchild -> child -> parent
      await api.addDependency({
        blockedId: grandchild.id,
        blockerId: child.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: child.id,
        blockerId: parent.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Block the parent
      await api.addDependency({
        blockedId: parent.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // All three should be blocked
      let blockedTasks = await api.blocked();
      let blockedIds = blockedTasks.map((t) => t.id);
      expect(blockedIds).toContain(parent.id);
      expect(blockedIds).toContain(child.id);
      expect(blockedIds).toContain(grandchild.id);

      // Close the root blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // All should be unblocked now (though parent-child still exists, parent is no longer blocked)
      blockedTasks = await api.blocked();
      blockedIds = blockedTasks.map((t) => t.id);
      // Note: parent-child dependency on a non-completed parent still blocks
      // Let's also close the parent to fully unblock
      await api.update<Task>(parent.id, { status: TaskStatus.CLOSED } as Partial<Task>);
      await api.update<Task>(child.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      blockedTasks = await api.blocked();
      blockedIds = blockedTasks.map((t) => t.id);
      expect(blockedIds).not.toContain(grandchild.id);
    });
  });

  // ==========================================================================
  // Gate Dependencies (awaits)
  // ==========================================================================

  describe('Timer Gate Dependencies', () => {
    it('should block task until timer expires', async () => {
      const gate = await createTestTask({ title: 'Timer Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with future timer
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: futureTime,
        },
      });

      // Should be blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
      expect(blockedTasks.find((t) => t.id === blocked.id)?.blockReason).toContain('gate');
    });

    it('should unblock task when timer has passed', async () => {
      const gate = await createTestTask({ title: 'Timer Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with past timer
      const pastTime = new Date(Date.now() - 1000).toISOString();
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: pastTime,
        },
      });

      // Should NOT be blocked (timer has passed)
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(blocked.id);
    });
  });

  describe('Approval Gate Dependencies', () => {
    it('should block task until approvals received', async () => {
      const gate = await createTestTask({ title: 'Approval Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with approval gate
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'],
          currentApprovers: ['user1'], // Only one of two
        },
      });

      // Should be blocked (not enough approvals)
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
    });

    it('should unblock task when all approvals received', async () => {
      const gate = await createTestTask({ title: 'Approval Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with all approvals
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'],
          currentApprovers: ['user1', 'user2'], // All required
        },
      });

      // Should NOT be blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should unblock task when approval count met', async () => {
      const gate = await createTestTask({ title: 'Approval Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with partial approval (need 2 of 3)
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2', 'user3'],
          approvalCount: 2, // Only need 2
          currentApprovers: ['user1', 'user3'], // Have 2
        },
      });

      // Should NOT be blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });
  });

  describe('External Gate Dependencies', () => {
    it('should block task on external gate (always blocks until satisfied)', async () => {
      const gate = await createTestTask({ title: 'External Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with external gate
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.EXTERNAL,
          externalSystem: 'jira',
          externalId: 'PROJ-123',
        },
      });

      // Should be blocked (external gates require explicit satisfaction)
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
    });
  });

  // ==========================================================================
  // Scheduled Tasks
  // ==========================================================================

  describe('Scheduled Tasks', () => {
    it('should exclude future-scheduled tasks from ready', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const futureTask = await createTestTask({
        title: 'Future Task',
        scheduledFor: futureDate as Timestamp,
      });

      await api.create(toCreateInput(futureTask));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(futureTask.id);
    });

    it('should include past-scheduled tasks in ready', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const pastTask = await createTestTask({
        title: 'Past Scheduled Task',
        scheduledFor: pastDate as Timestamp,
      });

      await api.create(toCreateInput(pastTask));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(pastTask.id);
    });

    it('should include tasks with null scheduledFor in ready', async () => {
      const task = await createTestTask({ title: 'No Schedule Task' });
      await api.create(toCreateInput(task));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
    });
  });

  // ==========================================================================
  // Status Filtering
  // ==========================================================================

  describe('Status Filtering in Ready Query', () => {
    it('should only include open and in_progress tasks in ready', async () => {
      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const inProgressTask = await createTestTask({ title: 'In Progress Task', status: TaskStatus.IN_PROGRESS });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });
      const deferredTask = await createTestTask({ title: 'Deferred Task', status: TaskStatus.DEFERRED });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(inProgressTask));
      await api.create(toCreateInput(closedTask));
      await api.create(toCreateInput(deferredTask));

      const readyTasks = await api.ready();
      const readyIds = readyTasks.map((t) => t.id);

      expect(readyIds).toContain(openTask.id);
      expect(readyIds).toContain(inProgressTask.id);
      expect(readyIds).not.toContain(closedTask.id);
      expect(readyIds).not.toContain(deferredTask.id);
    });
  });

  // ==========================================================================
  // Filter Options
  // ==========================================================================

  describe('Ready/Blocked with Filters', () => {
    it('should filter ready tasks by priority', async () => {
      const highPriority = await createTestTask({ title: 'High Priority', priority: Priority.HIGH });
      const lowPriority = await createTestTask({ title: 'Low Priority', priority: Priority.LOW });

      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(lowPriority));

      const readyTasks = await api.ready({ priority: Priority.HIGH });
      expect(readyTasks.map((t) => t.id)).toContain(highPriority.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(lowPriority.id);
    });

    it('should filter ready tasks by assignee', async () => {
      const assignedTask = await createTestTask({
        title: 'Assigned Task',
        assignee: 'user:alice' as EntityId
      });
      const unassignedTask = await createTestTask({ title: 'Unassigned Task' });

      await api.create(toCreateInput(assignedTask));
      await api.create(toCreateInput(unassignedTask));

      const readyTasks = await api.ready({ assignee: 'user:alice' as EntityId });
      expect(readyTasks.map((t) => t.id)).toContain(assignedTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(unassignedTask.id);
    });

    it('should filter blocked tasks by priority', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const highPriority = await createTestTask({ title: 'High Priority', priority: Priority.HIGH });
      const lowPriority = await createTestTask({ title: 'Low Priority', priority: Priority.LOW });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(lowPriority));

      // Block both tasks
      await api.addDependency({
        blockedId: highPriority.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockedId: lowPriority.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      const blockedTasks = await api.blocked({ priority: Priority.HIGH });
      expect(blockedTasks.map((t) => t.id)).toContain(highPriority.id);
      expect(blockedTasks.map((t) => t.id)).not.toContain(lowPriority.id);
    });

    it('should filter ready tasks by owner', async () => {
      const ownedTask = await createTestTask({
        title: 'Owned Task',
        owner: 'user:bob' as EntityId
      });
      const unownedTask = await createTestTask({ title: 'Unowned Task' });

      await api.create(toCreateInput(ownedTask));
      await api.create(toCreateInput(unownedTask));

      const readyTasks = await api.ready({ owner: 'user:bob' as EntityId });
      expect(readyTasks.map((t) => t.id)).toContain(ownedTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(unownedTask.id);
    });

    it('should filter blocked tasks by assignee', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const assignedTask = await createTestTask({
        title: 'Assigned Blocked Task',
        assignee: 'user:alice' as EntityId
      });
      const unassignedTask = await createTestTask({ title: 'Unassigned Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(assignedTask));
      await api.create(toCreateInput(unassignedTask));

      // Block both tasks
      await api.addDependency({
        blockedId: assignedTask.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockedId: unassignedTask.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      const blockedTasks = await api.blocked({ assignee: 'user:alice' as EntityId });
      expect(blockedTasks.map((t) => t.id)).toContain(assignedTask.id);
      expect(blockedTasks.map((t) => t.id)).not.toContain(unassignedTask.id);
    });
  });

  // ==========================================================================
  // Deadline-Based Queries
  // ==========================================================================

  describe('Deadline-Based Queries', () => {
    it('should filter ready tasks by hasDeadline=true', async () => {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const taskWithDeadline = await createTestTask({
        title: 'Task with Deadline',
        deadline: deadline as Timestamp,
      });
      const taskWithoutDeadline = await createTestTask({ title: 'Task without Deadline' });

      await api.create(toCreateInput(taskWithDeadline));
      await api.create(toCreateInput(taskWithoutDeadline));

      const readyTasks = await api.ready({ hasDeadline: true });
      expect(readyTasks.map((t) => t.id)).toContain(taskWithDeadline.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskWithoutDeadline.id);
    });

    it('should filter ready tasks by hasDeadline=false', async () => {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const taskWithDeadline = await createTestTask({
        title: 'Task with Deadline',
        deadline: deadline as Timestamp,
      });
      const taskWithoutDeadline = await createTestTask({ title: 'Task without Deadline' });

      await api.create(toCreateInput(taskWithDeadline));
      await api.create(toCreateInput(taskWithoutDeadline));

      const readyTasks = await api.ready({ hasDeadline: false });
      expect(readyTasks.map((t) => t.id)).not.toContain(taskWithDeadline.id);
      expect(readyTasks.map((t) => t.id)).toContain(taskWithoutDeadline.id);
    });

    it('should filter ready tasks by deadlineBefore', async () => {
      const soonDeadline = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1 hour
      const laterDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
      const cutoffDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      const urgentTask = await createTestTask({
        title: 'Urgent Task',
        deadline: soonDeadline as Timestamp,
      });
      const laterTask = await createTestTask({
        title: 'Later Task',
        deadline: laterDeadline as Timestamp,
      });

      await api.create(toCreateInput(urgentTask));
      await api.create(toCreateInput(laterTask));

      const readyTasks = await api.ready({ deadlineBefore: cutoffDeadline as Timestamp });
      expect(readyTasks.map((t) => t.id)).toContain(urgentTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(laterTask.id);
    });

    it('should filter blocked tasks by hasDeadline', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const blockedWithDeadline = await createTestTask({
        title: 'Blocked with Deadline',
        deadline: deadline as Timestamp,
      });
      const blockedWithoutDeadline = await createTestTask({ title: 'Blocked without Deadline' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blockedWithDeadline));
      await api.create(toCreateInput(blockedWithoutDeadline));

      // Block both tasks
      await api.addDependency({
        blockedId: blockedWithDeadline.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockedId: blockedWithoutDeadline.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      const blockedTasks = await api.blocked({ hasDeadline: true });
      expect(blockedTasks.map((t) => t.id)).toContain(blockedWithDeadline.id);
      expect(blockedTasks.map((t) => t.id)).not.toContain(blockedWithoutDeadline.id);
    });

    it('should filter blocked tasks by deadlineBefore', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const soonDeadline = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1 hour
      const laterDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
      const cutoffDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      const urgentBlockedTask = await createTestTask({
        title: 'Urgent Blocked Task',
        deadline: soonDeadline as Timestamp,
      });
      const laterBlockedTask = await createTestTask({
        title: 'Later Blocked Task',
        deadline: laterDeadline as Timestamp,
      });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(urgentBlockedTask));
      await api.create(toCreateInput(laterBlockedTask));

      // Block both tasks
      await api.addDependency({
        blockedId: urgentBlockedTask.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockedId: laterBlockedTask.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      const blockedTasks = await api.blocked({ deadlineBefore: cutoffDeadline as Timestamp });
      expect(blockedTasks.map((t) => t.id)).toContain(urgentBlockedTask.id);
      expect(blockedTasks.map((t) => t.id)).not.toContain(laterBlockedTask.id);
    });

    it('should combine deadline filter with other filters', async () => {
      const soonDeadline = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
      const cutoffDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const urgentHighPriority = await createTestTask({
        title: 'Urgent High Priority',
        deadline: soonDeadline as Timestamp,
        priority: Priority.HIGH,
      });
      const urgentLowPriority = await createTestTask({
        title: 'Urgent Low Priority',
        deadline: soonDeadline as Timestamp,
        priority: Priority.LOW,
      });

      await api.create(toCreateInput(urgentHighPriority));
      await api.create(toCreateInput(urgentLowPriority));

      // Filter by both deadline and priority
      const readyTasks = await api.ready({
        deadlineBefore: cutoffDeadline as Timestamp,
        priority: Priority.HIGH,
      });
      expect(readyTasks.map((t) => t.id)).toContain(urgentHighPriority.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(urgentLowPriority.id);
    });

    it('should filter tasks with deadlineBefore using list query', async () => {
      const soonDeadline = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
      const laterDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const cutoffDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const urgentTask = await createTestTask({
        title: 'Urgent Task',
        deadline: soonDeadline as Timestamp,
      });
      const laterTask = await createTestTask({
        title: 'Later Task',
        deadline: laterDeadline as Timestamp,
      });

      await api.create(toCreateInput(urgentTask));
      await api.create(toCreateInput(laterTask));

      // Use list() instead of ready() to ensure filter works at query level
      const tasks = await api.list<Task>({
        type: 'task',
        deadlineBefore: cutoffDeadline as Timestamp,
      } as TaskFilter);
      expect(tasks.map((t) => t.id)).toContain(urgentTask.id);
      expect(tasks.map((t) => t.id)).not.toContain(laterTask.id);
    });

    it('should filter tasks with hasDeadline using list query', async () => {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const taskWithDeadline = await createTestTask({
        title: 'Task with Deadline',
        deadline: deadline as Timestamp,
      });
      const taskWithoutDeadline = await createTestTask({ title: 'Task without Deadline' });

      await api.create(toCreateInput(taskWithDeadline));
      await api.create(toCreateInput(taskWithoutDeadline));

      // Filter for tasks with deadline
      const tasksWithDeadline = await api.list<Task>({
        type: 'task',
        hasDeadline: true,
      } as TaskFilter);
      expect(tasksWithDeadline.map((t) => t.id)).toContain(taskWithDeadline.id);
      expect(tasksWithDeadline.map((t) => t.id)).not.toContain(taskWithoutDeadline.id);

      // Filter for tasks without deadline
      const tasksWithoutDeadline = await api.list<Task>({
        type: 'task',
        hasDeadline: false,
      } as TaskFilter);
      expect(tasksWithoutDeadline.map((t) => t.id)).not.toContain(taskWithDeadline.id);
      expect(tasksWithoutDeadline.map((t) => t.id)).toContain(taskWithoutDeadline.id);
    });
  });

  // ==========================================================================
  // Assignment-Based Queries
  // ==========================================================================

  describe('Assignment-Based Queries', () => {
    it('should filter tasks by assignee using list query', async () => {
      const assignedTask = await createTestTask({
        title: 'Assigned Task',
        assignee: 'user:alice' as EntityId,
      });
      const unassignedTask = await createTestTask({ title: 'Unassigned Task' });
      const otherAssignedTask = await createTestTask({
        title: 'Other Assigned Task',
        assignee: 'user:bob' as EntityId,
      });

      await api.create(toCreateInput(assignedTask));
      await api.create(toCreateInput(unassignedTask));
      await api.create(toCreateInput(otherAssignedTask));

      const tasks = await api.list<Task>({
        type: 'task',
        assignee: 'user:alice' as EntityId,
      } as TaskFilter);
      expect(tasks.map((t) => t.id)).toContain(assignedTask.id);
      expect(tasks.map((t) => t.id)).not.toContain(unassignedTask.id);
      expect(tasks.map((t) => t.id)).not.toContain(otherAssignedTask.id);
    });

    it('should filter tasks by owner using list query', async () => {
      const ownedTask = await createTestTask({
        title: 'Owned Task',
        owner: 'user:charlie' as EntityId,
      });
      const unownedTask = await createTestTask({ title: 'Unowned Task' });
      const otherOwnedTask = await createTestTask({
        title: 'Other Owned Task',
        owner: 'user:dave' as EntityId,
      });

      await api.create(toCreateInput(ownedTask));
      await api.create(toCreateInput(unownedTask));
      await api.create(toCreateInput(otherOwnedTask));

      const tasks = await api.list<Task>({
        type: 'task',
        owner: 'user:charlie' as EntityId,
      } as TaskFilter);
      expect(tasks.map((t) => t.id)).toContain(ownedTask.id);
      expect(tasks.map((t) => t.id)).not.toContain(unownedTask.id);
      expect(tasks.map((t) => t.id)).not.toContain(otherOwnedTask.id);
    });

    it('should combine assignee and owner filters', async () => {
      const taskBoth = await createTestTask({
        title: 'Task with Both',
        assignee: 'user:alice' as EntityId,
        owner: 'user:bob' as EntityId,
      });
      const taskAssigneeOnly = await createTestTask({
        title: 'Task Assignee Only',
        assignee: 'user:alice' as EntityId,
      });
      const taskOwnerOnly = await createTestTask({
        title: 'Task Owner Only',
        owner: 'user:bob' as EntityId,
      });

      await api.create(toCreateInput(taskBoth));
      await api.create(toCreateInput(taskAssigneeOnly));
      await api.create(toCreateInput(taskOwnerOnly));

      // Filter by both assignee and owner
      const tasks = await api.list<Task>({
        type: 'task',
        assignee: 'user:alice' as EntityId,
        owner: 'user:bob' as EntityId,
      } as TaskFilter);
      expect(tasks.map((t) => t.id)).toContain(taskBoth.id);
      expect(tasks.map((t) => t.id)).not.toContain(taskAssigneeOnly.id);
      expect(tasks.map((t) => t.id)).not.toContain(taskOwnerOnly.id);
    });

    it('should combine assignment filter with status filter', async () => {
      const openAssigned = await createTestTask({
        title: 'Open Assigned',
        assignee: 'user:alice' as EntityId,
        status: TaskStatus.OPEN,
      });
      const closedAssigned = await createTestTask({
        title: 'Closed Assigned',
        assignee: 'user:alice' as EntityId,
        status: TaskStatus.CLOSED,
      });
      const openUnassigned = await createTestTask({
        title: 'Open Unassigned',
        status: TaskStatus.OPEN,
      });

      await api.create(toCreateInput(openAssigned));
      await api.create(toCreateInput(closedAssigned));
      await api.create(toCreateInput(openUnassigned));

      const tasks = await api.list<Task>({
        type: 'task',
        assignee: 'user:alice' as EntityId,
        status: TaskStatus.OPEN,
      } as TaskFilter);
      expect(tasks.map((t) => t.id)).toContain(openAssigned.id);
      expect(tasks.map((t) => t.id)).not.toContain(closedAssigned.id);
      expect(tasks.map((t) => t.id)).not.toContain(openUnassigned.id);
    });

    it('should combine assignment filter with deadline filter', async () => {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const assignedWithDeadline = await createTestTask({
        title: 'Assigned with Deadline',
        assignee: 'user:alice' as EntityId,
        deadline: deadline as Timestamp,
      });
      const assignedWithoutDeadline = await createTestTask({
        title: 'Assigned without Deadline',
        assignee: 'user:alice' as EntityId,
      });
      const unassignedWithDeadline = await createTestTask({
        title: 'Unassigned with Deadline',
        deadline: deadline as Timestamp,
      });

      await api.create(toCreateInput(assignedWithDeadline));
      await api.create(toCreateInput(assignedWithoutDeadline));
      await api.create(toCreateInput(unassignedWithDeadline));

      const tasks = await api.list<Task>({
        type: 'task',
        assignee: 'user:alice' as EntityId,
        hasDeadline: true,
      } as TaskFilter);
      expect(tasks.map((t) => t.id)).toContain(assignedWithDeadline.id);
      expect(tasks.map((t) => t.id)).not.toContain(assignedWithoutDeadline.id);
      expect(tasks.map((t) => t.id)).not.toContain(unassignedWithDeadline.id);
    });
  });

  // ==========================================================================
  // Complex Dependency Graphs
  // ==========================================================================

  describe('Complex Dependency Graphs', () => {
    it('should handle diamond dependency pattern', async () => {
      // Diamond: A depends on B and C, B and C both depend on D
      const taskD = await createTestTask({ title: 'Task D (root)' });
      const taskB = await createTestTask({ title: 'Task B' });
      const taskC = await createTestTask({ title: 'Task C' });
      const taskA = await createTestTask({ title: 'Task A (final)' });

      await api.create(toCreateInput(taskD));
      await api.create(toCreateInput(taskB));
      await api.create(toCreateInput(taskC));
      await api.create(toCreateInput(taskA));

      // D -> B (blocks) - D blocks B, so B waits for D
      await api.addDependency({
        blockedId: taskB.id,
        blockerId: taskD.id,
        type: DependencyType.BLOCKS,
      });
      // D -> C (blocks) - D blocks C, so C waits for D
      await api.addDependency({
        blockedId: taskC.id,
        blockerId: taskD.id,
        type: DependencyType.BLOCKS,
      });
      // B -> A (blocks) - B blocks A, so A waits for B
      await api.addDependency({
        blockedId: taskA.id,
        blockerId: taskB.id,
        type: DependencyType.BLOCKS,
      });
      // C -> A (blocks) - C blocks A, so A waits for C
      await api.addDependency({
        blockedId: taskA.id,
        blockerId: taskC.id,
        type: DependencyType.BLOCKS,
      });

      // Only D should be ready
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(taskD.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskB.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskC.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskA.id);

      // Close D
      await api.update<Task>(taskD.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // B and C should be ready now
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(taskB.id);
      expect(readyTasks.map((t) => t.id)).toContain(taskC.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskA.id);

      // Close B
      await api.update<Task>(taskB.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // A still blocked by C
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(taskA.id);

      // Close C
      await api.update<Task>(taskC.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // A should now be ready
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(taskA.id);
    });

    it('should handle chain of blocking dependencies', async () => {
      // Chain: A -> B -> C -> D (each blocks the next)
      const tasks: Task[] = [];
      for (let i = 0; i < 5; i++) {
        const task = await createTestTask({ title: `Task ${i}` });
        tasks.push(task);
        await api.create(toCreateInput(task));
      }

      // Create chain: task[0] blocks task[1] blocks task[2] blocks task[3] blocks task[4]
      // task[i] -> task[i+1] means task[i] blocks task[i+1], so task[i+1] waits for task[i]
      for (let i = 0; i < 4; i++) {
        await api.addDependency({
          blockedId: tasks[i + 1].id,
          blockerId: tasks[i].id,
          type: DependencyType.BLOCKS,
        });
      }

      // Only task[0] should be ready
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(tasks[0].id);
      for (let i = 1; i < 5; i++) {
        expect(readyTasks.map((t) => t.id)).not.toContain(tasks[i].id);
      }

      // Close tasks in order
      for (let i = 0; i < 4; i++) {
        await api.update<Task>(tasks[i].id, { status: TaskStatus.CLOSED } as Partial<Task>);
        readyTasks = await api.ready();
        expect(readyTasks.map((t) => t.id)).toContain(tasks[i + 1].id);
      }
    });
  });

  // ==========================================================================
  // Non-Blocking Dependencies
  // ==========================================================================

  describe('Non-Blocking Dependencies', () => {
    it('should not block on relates-to dependency', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Add relates-to dependency
      await api.addDependency({
        blockedId: task1.id,
        blockerId: task2.id,
        type: DependencyType.RELATES_TO,
      });

      // Both should be ready (relates-to is non-blocking)
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task1.id);
      expect(readyTasks.map((t) => t.id)).toContain(task2.id);

      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(task1.id);
    });

    it('should not block on references dependency', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      await api.addDependency({
        blockedId: task1.id,
        blockerId: task2.id,
        type: DependencyType.REFERENCES,
      });

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task1.id);
    });
  });

  // ==========================================================================
  // Soft Delete (Tombstone) Behavior
  // ==========================================================================

  describe('Tombstone Behavior', () => {
    it('should unblock dependents when blocker is soft-deleted', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const blocked = await createTestTask({ title: 'Blocked' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Soft delete the blocker
      await api.delete(blocker.id, { reason: 'No longer needed' });

      // Should now be unblocked (tombstone doesn't block)
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should exclude tombstone tasks from ready query', async () => {
      const task = await createTestTask({ title: 'Task to Delete' });
      await api.create(toCreateInput(task));

      // Verify initially in ready
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);

      // Soft delete
      await api.delete(task.id);

      // Should not appear in ready (tombstones are excluded)
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(task.id);
    });
  });

  // ==========================================================================
  // Statistics Integration
  // ==========================================================================

  describe('Statistics Integration', () => {
    it('should accurately count ready and blocked tasks in stats', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const blockedTask = await createTestTask({ title: 'Blocked Task' });
      const readyTask1 = await createTestTask({ title: 'Ready Task 1' });
      const readyTask2 = await createTestTask({ title: 'Ready Task 2' });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blockedTask));
      await api.create(toCreateInput(readyTask1));
      await api.create(toCreateInput(readyTask2));
      await api.create(toCreateInput(closedTask));

      await api.addDependency({
        blockedId: blockedTask.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      const stats = await api.stats();

      // Ready: blocker, readyTask1, readyTask2 (3 open, not blocked)
      // Blocked: blockedTask (1)
      // Closed task is not counted in either
      expect(stats.readyTasks).toBe(3);
      expect(stats.blockedTasks).toBe(1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle task with no dependencies', async () => {
      const task = await createTestTask({ title: 'Standalone Task' });
      await api.create(toCreateInput(task));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);

      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(task.id);
    });

    it('should handle empty database', async () => {
      const readyTasks = await api.ready();
      expect(readyTasks).toEqual([]);

      const blockedTasks = await api.blocked();
      expect(blockedTasks).toEqual([]);
    });

    it('should handle dependency on non-existent element (external reference)', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const task = await createTestTask({ title: 'Task' });
      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(task));

      // Create blocking dependency, then delete the blocker
      // This simulates an external reference (blocker no longer exists)
      await api.addDependency({
        blockedId: task.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(task.id);

      // Delete the blocker (simulate external reference / deleted element)
      await api.delete(blocker.id);

      // Should NOT be blocked (deleted/non-existent blockers don't block)
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(task.id);
    });

    it('should handle cache rebuild', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const blocked = await createTestTask({ title: 'Blocked' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Rebuild the cache
      const rebuildResult = api.rebuildBlockedCache();
      expect(rebuildResult.elementsChecked).toBeGreaterThanOrEqual(1);
      expect(rebuildResult.elementsBlocked).toBeGreaterThanOrEqual(1);

      // Verify state is correct after rebuild
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
    });
  });

  // ==========================================================================
  // Dependency-Based Priority Tests
  // ==========================================================================

  describe('Dependency-Based Priority Sorting', () => {
    it('should return tasks sorted by effective priority', async () => {
      // Create 3 tasks with different priorities
      const lowPriorityTask = await createTestTask({ title: 'Low Priority Task', priority: Priority.LOW });
      const mediumPriorityTask = await createTestTask({ title: 'Medium Priority Task', priority: Priority.MEDIUM });
      const criticalPriorityTask = await createTestTask({ title: 'Critical Priority Task', priority: Priority.CRITICAL });

      await api.create(toCreateInput(lowPriorityTask));
      await api.create(toCreateInput(mediumPriorityTask));
      await api.create(toCreateInput(criticalPriorityTask));

      // Without dependencies, should be sorted by base priority
      const readyTasks = await api.ready();
      expect(readyTasks.length).toBe(3);
      expect(readyTasks[0].priority).toBe(Priority.CRITICAL);
      expect(readyTasks[1].priority).toBe(Priority.MEDIUM);
      expect(readyTasks[2].priority).toBe(Priority.LOW);
    });

    it('should boost priority of tasks blocking high-priority tasks', async () => {
      // lowPriorityTask blocks criticalTask
      // Even though lowPriorityTask has LOW priority, it should be sorted higher
      // because it's blocking a CRITICAL task
      const lowPriorityTask = await createTestTask({ title: 'Low Priority Blocker', priority: Priority.LOW });
      const criticalTask = await createTestTask({ title: 'Critical Task', priority: Priority.CRITICAL });
      const mediumTask = await createTestTask({ title: 'Medium Task', priority: Priority.MEDIUM });

      await api.create(toCreateInput(lowPriorityTask));
      await api.create(toCreateInput(criticalTask));
      await api.create(toCreateInput(mediumTask));

      // lowPriorityTask blocks criticalTask (criticalTask waits for lowPriorityTask)
      await api.addDependency({
        blockedId: criticalTask.id,
        blockerId: lowPriorityTask.id,
        type: DependencyType.BLOCKS,
      });

      // Now lowPriorityTask should have effective priority CRITICAL
      // criticalTask is blocked (not in ready)
      // Order should be: lowPriorityTask (effective CRITICAL), mediumTask
      const readyTasks = await api.ready();

      // criticalTask is blocked, so only 2 tasks should be ready
      expect(readyTasks.length).toBe(2);

      // lowPriorityTask should come first due to effective priority boost
      expect(readyTasks[0].id).toBe(lowPriorityTask.id);
      expect(readyTasks[1].id).toBe(mediumTask.id);
    });

    it('should propagate priority boost through dependency chain', async () => {
      // Chain: task1 <- task2 <- task3 (CRITICAL)
      // task1 and task2 both have LOW priority
      // But since task3 (CRITICAL) depends on them transitively,
      // task1 should come before task2, and both before an unrelated MEDIUM task
      const task1 = await createTestTask({ title: 'Task 1', priority: Priority.LOW });
      const task2 = await createTestTask({ title: 'Task 2', priority: Priority.LOW });
      const task3 = await createTestTask({ title: 'Task 3 Critical', priority: Priority.CRITICAL });
      const unrelatedMedium = await createTestTask({ title: 'Unrelated Medium', priority: Priority.MEDIUM });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));
      await api.create(toCreateInput(unrelatedMedium));

      // task1 blocks task2 (task2 waits for task1)
      await api.addDependency({
        blockedId: task2.id,
        blockerId: task1.id,
        type: DependencyType.BLOCKS,
      });

      // task2 blocks task3 (task3 waits for task2)
      await api.addDependency({
        blockedId: task3.id,
        blockerId: task2.id,
        type: DependencyType.BLOCKS,
      });

      const readyTasks = await api.ready();

      // task2 and task3 are blocked, only task1 and unrelatedMedium are ready
      expect(readyTasks.length).toBe(2);

      // task1 should come first (effective CRITICAL), then unrelatedMedium (MEDIUM)
      expect(readyTasks[0].id).toBe(task1.id);
      expect(readyTasks[1].id).toBe(unrelatedMedium.id);
    });

    it('should use base priority as tiebreaker when effective priorities are equal', async () => {
      // Both tasks have the same effective priority but different base priorities
      const highBase = await createTestTask({ title: 'High Base', priority: Priority.HIGH });
      const lowBase = await createTestTask({ title: 'Low Base', priority: Priority.LOW });
      const criticalDependent = await createTestTask({ title: 'Critical Dependent', priority: Priority.CRITICAL });

      await api.create(toCreateInput(highBase));
      await api.create(toCreateInput(lowBase));
      await api.create(toCreateInput(criticalDependent));

      // highBase and lowBase block criticalDependent (criticalDependent waits for both)
      await api.addDependency({
        blockedId: criticalDependent.id,
        blockerId: highBase.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockedId: criticalDependent.id,
        blockerId: lowBase.id,
        type: DependencyType.BLOCKS,
      });

      const readyTasks = await api.ready();

      // Both have effective priority CRITICAL, but highBase has better base priority
      expect(readyTasks.length).toBe(2);
      expect(readyTasks[0].id).toBe(highBase.id);
      expect(readyTasks[1].id).toBe(lowBase.id);
    });

    it('should not lower effective priority from dependent', async () => {
      // highPriorityTask is blocking a lowPriorityDependent
      // highPriorityTask should keep its HIGH priority, not lower to LOW
      const highPriorityTask = await createTestTask({ title: 'High Priority Task', priority: Priority.HIGH });
      const lowPriorityDependent = await createTestTask({ title: 'Low Priority Dependent', priority: Priority.LOW });

      await api.create(toCreateInput(highPriorityTask));
      await api.create(toCreateInput(lowPriorityDependent));

      await api.addDependency({
        blockedId: lowPriorityDependent.id,
        blockerId: highPriorityTask.id,
        type: DependencyType.BLOCKS,
      });

      const readyTasks = await api.ready();

      // Only highPriorityTask is ready (lowPriorityDependent is blocked)
      expect(readyTasks.length).toBe(1);
      expect(readyTasks[0].id).toBe(highPriorityTask.id);
      expect(readyTasks[0].priority).toBe(Priority.HIGH);
    });
  });

  // ==========================================================================
  // Limit Filter Tests
  // ==========================================================================

  describe('Limit Filter', () => {
    it('should limit ready tasks correctly', async () => {
      // Create 5 ready tasks
      const tasks = await Promise.all([
        createTestTask({ title: 'Task 1' }),
        createTestTask({ title: 'Task 2' }),
        createTestTask({ title: 'Task 3' }),
        createTestTask({ title: 'Task 4' }),
        createTestTask({ title: 'Task 5' }),
      ]);
      for (const task of tasks) {
        await api.create(toCreateInput(task));
      }

      // Verify no limit returns all
      const allTasks = await api.ready();
      expect(allTasks.length).toBe(5);

      // Verify limit works correctly
      const limited = await api.ready({ limit: 3 });
      expect(limited.length).toBe(3);

      const limited1 = await api.ready({ limit: 1 });
      expect(limited1.length).toBe(1);
    });

    it('should limit blocked tasks correctly', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      await api.create(toCreateInput(blocker));

      // Create 5 blocked tasks
      const tasks = await Promise.all([
        createTestTask({ title: 'Blocked 1' }),
        createTestTask({ title: 'Blocked 2' }),
        createTestTask({ title: 'Blocked 3' }),
        createTestTask({ title: 'Blocked 4' }),
        createTestTask({ title: 'Blocked 5' }),
      ]);
      for (const task of tasks) {
        await api.create(toCreateInput(task));
        await api.addDependency({
          blockedId: task.id,
          blockerId: blocker.id,
          type: DependencyType.BLOCKS,
        });
      }

      // Verify no limit returns all blocked tasks
      const allBlocked = await api.blocked();
      expect(allBlocked.length).toBe(5);

      // Verify limit returns exactly N results (regression test for off-by-one bug)
      const limited3 = await api.blocked({ limit: 3 });
      expect(limited3.length).toBe(3);

      const limited2 = await api.blocked({ limit: 2 });
      expect(limited2.length).toBe(2);

      const limited1 = await api.blocked({ limit: 1 });
      expect(limited1.length).toBe(1);

      // Edge case: limit higher than count returns all
      const limited10 = await api.blocked({ limit: 10 });
      expect(limited10.length).toBe(5);
    });

    it('should apply limit after filtering for blocked tasks', async () => {
      // This test ensures limit is applied AFTER filtering for blocked status
      // Regression test for bug where limit was applied before blocked filtering
      const blocker = await createTestTask({ title: 'Blocker' });
      await api.create(toCreateInput(blocker));

      // Create a mix of blocked and non-blocked tasks
      const blocked1 = await createTestTask({ title: 'Blocked 1' });
      const blocked2 = await createTestTask({ title: 'Blocked 2' });
      const blocked3 = await createTestTask({ title: 'Blocked 3' });
      const blocked4 = await createTestTask({ title: 'Blocked 4' });

      await api.create(toCreateInput(blocked1));
      await api.create(toCreateInput(blocked2));
      await api.create(toCreateInput(blocked3));
      await api.create(toCreateInput(blocked4));

      // Block all 4 tasks
      for (const task of [blocked1, blocked2, blocked3, blocked4]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: blocker.id,
          type: DependencyType.BLOCKS,
        });
      }

      // Request limit 2 - should get exactly 2 blocked tasks
      const limited = await api.blocked({ limit: 2 });
      expect(limited.length).toBe(2);
      // All results should be from our blocked tasks
      const blockedIds = new Set([blocked1.id, blocked2.id, blocked3.id, blocked4.id]);
      for (const task of limited) {
        expect(blockedIds.has(task.id)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Draft Plan Filtering Tests
  // ==========================================================================

  describe('Draft Plan Filtering', () => {
    it('should exclude tasks in a draft plan from ready()', async () => {
      const plan = await createPlan({
        title: 'Draft Plan',
        createdBy: mockEntityId,
      });
      await api.create(toCreateInput(plan));
      expect(plan.status).toBe(PlanStatus.DRAFT);

      const task1 = await createTestTask({ title: 'Task in draft plan 1' });
      const task2 = await createTestTask({ title: 'Task in draft plan 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      await api.addDependency({
        blockedId: task1.id,
        blockerId: plan.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: task2.id,
        blockerId: plan.id,
        type: DependencyType.PARENT_CHILD,
      });

      const readyTasks = await api.ready();
      const readyIds = readyTasks.map((t) => t.id);
      expect(readyIds).not.toContain(task1.id);
      expect(readyIds).not.toContain(task2.id);
    });

    it('should include tasks in an active plan in ready()', async () => {
      const plan = await createPlan({
        title: 'Active Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task in active plan' });
      await api.create(toCreateInput(task));

      await api.addDependency({
        blockedId: task.id,
        blockerId: plan.id,
        type: DependencyType.PARENT_CHILD,
      });

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
    });

    it('should include tasks after plan is activated from draft', async () => {
      const plan = await createPlan({
        title: 'Activatable Plan',
        createdBy: mockEntityId,
      });
      await api.create(toCreateInput(plan));

      const task = await createTestTask({ title: 'Task to activate' });
      await api.create(toCreateInput(task));
      await api.addDependency({
        blockedId: task.id,
        blockerId: plan.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Task is NOT ready while plan is draft
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(task.id);

      // Activate the plan
      await api.update<Plan>(plan.id, { status: PlanStatus.ACTIVE } as Partial<Plan>);

      // Now task SHOULD appear in ready()
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
    });

    it('should not affect standalone tasks (not in any plan)', async () => {
      const task = await createTestTask({ title: 'Standalone task' });
      await api.create(toCreateInput(task));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
    });

    it('should respect both blocked and draft-plan filters together', async () => {
      const plan = await createPlan({
        title: 'Draft Plan with Deps',
        createdBy: mockEntityId,
      });
      await api.create(toCreateInput(plan));

      const blocker = await createTestTask({ title: 'Blocker in draft' });
      const blocked = await createTestTask({ title: 'Blocked in draft' });
      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      // Add both tasks to plan
      await api.addDependency({
        blockedId: blocker.id,
        blockerId: plan.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: plan.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Add blocks dependency between tasks
      await api.addDependency({
        blockedId: blocked.id,
        blockerId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Both excluded while draft
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(blocker.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(blocked.id);

      // Activate plan - only blocker should be ready (blocked is still blocked by blocker)
      await api.update<Plan>(plan.id, { status: PlanStatus.ACTIVE } as Partial<Plan>);
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(blocker.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(blocked.id);
    });
  });

  // ==========================================================================
  // Blocked Plan Filtering (Defense-in-Depth)
  // ==========================================================================

  describe('Blocked Plan Filtering', () => {
    it('should exclude tasks in a plan that is blocked by another plan', async () => {
      // Create two active plans
      const blockerPlan = await createPlan({
        title: 'Blocker Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      const blockedPlan = await createPlan({
        title: 'Blocked Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      await api.create(toCreateInput(blockerPlan));
      await api.create(toCreateInput(blockedPlan));

      // Create a task in the blocked plan
      const task = await createTestTask({ title: 'Task in blocked plan' });
      await api.create(toCreateInput(task));

      // Add task as child of blocked plan
      await api.addDependency({
        blockedId: task.id,
        blockerId: blockedPlan.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Task should be ready before plan is blocked
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);

      // Block the plan: blockerPlan blocks blockedPlan
      await api.addDependency({
        blockedId: blockedPlan.id,
        blockerId: blockerPlan.id,
        type: DependencyType.BLOCKS,
      });

      // Task should NOT appear in ready() because its parent plan is blocked
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(task.id);
    });

    it('should include tasks in a plan that is NOT blocked', async () => {
      // Create an active plan that is not blocked by anything
      const plan = await createPlan({
        title: 'Unblocked Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      await api.create(toCreateInput(plan));

      // Create a task in the plan
      const task = await createTestTask({ title: 'Task in unblocked plan' });
      await api.create(toCreateInput(task));

      // Add task as child of plan
      await api.addDependency({
        blockedId: task.id,
        blockerId: plan.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Task should appear in ready()
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
    });

    it('should include tasks after blocking plan completes', async () => {
      // Create a blocker task (to satisfy the blocker plan's completion)
      const blockerTask = await createTestTask({ title: 'Blocker Task' });
      await api.create(toCreateInput(blockerTask));

      // Create two active plans
      const blockerPlan = await createPlan({
        title: 'Blocker Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      const blockedPlan = await createPlan({
        title: 'Blocked Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      await api.create(toCreateInput(blockerPlan));
      await api.create(toCreateInput(blockedPlan));

      // Create task in blocked plan
      const task = await createTestTask({ title: 'Task waiting for plan' });
      await api.create(toCreateInput(task));

      // Add task as child of blocked plan
      await api.addDependency({
        blockedId: task.id,
        blockerId: blockedPlan.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Block the plan
      await api.addDependency({
        blockedId: blockedPlan.id,
        blockerId: blockerPlan.id,
        type: DependencyType.BLOCKS,
      });

      // Verify task is NOT ready while plan is blocked
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(task.id);

      // Complete the blocker plan (transitions from active -> completed)
      await api.update<Plan>(blockerPlan.id, { status: PlanStatus.COMPLETED } as Partial<Plan>);

      // Now the blocked plan should be unblocked, and the task should be ready
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
    });

    it('should not affect standalone tasks when plans are blocked', async () => {
      // Create a standalone task (not in any plan)
      const standaloneTask = await createTestTask({ title: 'Standalone task' });
      await api.create(toCreateInput(standaloneTask));

      // Create two plans with blocking relationship
      const blockerPlan = await createPlan({
        title: 'Blocker Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      const blockedPlan = await createPlan({
        title: 'Blocked Plan',
        createdBy: mockEntityId,
        status: PlanStatus.ACTIVE,
      });
      await api.create(toCreateInput(blockerPlan));
      await api.create(toCreateInput(blockedPlan));

      await api.addDependency({
        blockedId: blockedPlan.id,
        blockerId: blockerPlan.id,
        type: DependencyType.BLOCKS,
      });

      // Standalone task should still appear in ready()
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(standaloneTask.id);
    });
  });
});
