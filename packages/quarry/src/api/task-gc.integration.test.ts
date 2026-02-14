/**
 * Task Garbage Collection Integration Tests
 *
 * Note: Task GC is now a no-op because tasks no longer have an ephemeral property.
 * Only workflows can be ephemeral, and tasks belonging to ephemeral workflows are
 * garbage collected via garbageCollectWorkflows().
 *
 * These tests verify that garbageCollectTasks() returns empty results.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, EntityId, Task } from '@stoneforge/core';
import { createTask, TaskStatus } from '@stoneforge/core';

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

describe('Task Garbage Collection Integration', () => {
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

  describe('garbageCollectTasks is a no-op', () => {
    it('should return zero counts when no tasks exist', async () => {
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(0);
      expect(result.dependenciesDeleted).toBe(0);
      expect(result.deletedTaskIds).toHaveLength(0);
    });

    it('should return zero counts even with tasks present', async () => {
      // Create some tasks
      const task1 = await createTestTask({ status: TaskStatus.OPEN });
      const task2 = await createTestTask({ status: TaskStatus.CLOSED });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // GC should be a no-op
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(0);
      expect(result.dependenciesDeleted).toBe(0);
      expect(result.deletedTaskIds).toHaveLength(0);

      // Verify tasks still exist
      const stillExists1 = await api.get(task1.id);
      const stillExists2 = await api.get(task2.id);
      expect(stillExists1).not.toBeNull();
      expect(stillExists2).not.toBeNull();
    });

    it('should return zero counts in dry-run mode', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
        dryRun: true,
      });

      expect(result.tasksDeleted).toBe(0);
      expect(result.dependenciesDeleted).toBe(0);
      expect(result.deletedTaskIds).toHaveLength(0);
    });

    it('should return zero counts with limit option', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
        limit: 10,
      });

      expect(result.tasksDeleted).toBe(0);
      expect(result.dependenciesDeleted).toBe(0);
      expect(result.deletedTaskIds).toHaveLength(0);
    });
  });
});
