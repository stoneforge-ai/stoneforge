/**
 * Concurrent Update Tests
 *
 * Tests for optimistic concurrency control (OCC) via expectedUpdatedAt.
 * These tests verify that concurrent modifications are properly detected
 * and rejected to prevent data inconsistency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, EntityId, Task } from '@stoneforge/core';
import { createTask, TaskStatus, Priority, ConflictError, ErrorCode } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

/**
 * Helper to cast element for api.create()
 * The API expects Record<string, unknown> but our typed elements are compatible
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
 * Sleep for a specified number of milliseconds
 * Used to ensure timestamps are different between operations
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Concurrent Update Protection', () => {
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

  describe('expectedUpdatedAt option', () => {
    it('should allow update when expectedUpdatedAt matches current updatedAt', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;

      // Update with correct expectedUpdatedAt
      const updated = await api.update<Task>(created.id, {
        title: 'Updated Title',
      }, {
        expectedUpdatedAt: created.updatedAt,
      });

      expect(updated.title).toBe('Updated Title');
    });

    it('should reject update when expectedUpdatedAt does not match', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;
      const originalUpdatedAt = created.updatedAt;

      // Wait to ensure timestamps differ
      await sleep(2);

      // First update the task to change its updatedAt
      const firstUpdate = await api.update<Task>(created.id, {
        title: 'First Update',
      });

      // Verify updatedAt changed
      expect(firstUpdate.updatedAt).not.toBe(originalUpdatedAt);

      // Try to update with stale expectedUpdatedAt (original timestamp)
      await expect(
        api.update<Task>(created.id, {
          title: 'Second Update',
        }, {
          expectedUpdatedAt: originalUpdatedAt, // This is now stale
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should include CONCURRENT_MODIFICATION error code', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;
      const originalUpdatedAt = created.updatedAt;

      // Wait to ensure timestamps differ
      await sleep(2);

      // First update the task
      await api.update<Task>(created.id, {
        title: 'First Update',
      });

      // Try to update with stale expectedUpdatedAt
      try {
        await api.update<Task>(created.id, {
          title: 'Second Update',
        }, {
          expectedUpdatedAt: originalUpdatedAt,
        });
        throw new Error('Should have thrown ConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).code).toBe(ErrorCode.CONCURRENT_MODIFICATION);
      }
    });

    it('should allow update without expectedUpdatedAt (backwards compatibility)', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;

      // Wait to ensure timestamps differ
      await sleep(2);

      // First update
      await api.update<Task>(created.id, {
        title: 'First Update',
      });

      // Second update without expectedUpdatedAt should work
      const updated = await api.update<Task>(created.id, {
        title: 'Second Update',
      });

      expect(updated.title).toBe('Second Update');
    });

    it('should include expected and actual timestamps in error details', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;
      const originalUpdatedAt = created.updatedAt;

      // Wait to ensure timestamps differ
      await sleep(2);

      // Update to change the timestamp
      const firstUpdate = await api.update<Task>(created.id, {
        title: 'First Update',
      });

      // Try to update with stale expectedUpdatedAt
      try {
        await api.update<Task>(created.id, {
          title: 'Second Update',
        }, {
          expectedUpdatedAt: originalUpdatedAt,
        });
        throw new Error('Should have thrown ConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        const conflictError = error as ConflictError;
        expect(conflictError.details).toHaveProperty('expectedUpdatedAt', originalUpdatedAt);
        expect(conflictError.details).toHaveProperty('actualUpdatedAt', firstUpdate.updatedAt);
      }
    });
  });

  describe('concurrent task operations', () => {
    it('should detect concurrent close and update operations', async () => {
      // Create a task
      const task = await createTestTask({ status: TaskStatus.IN_PROGRESS });
      const created = await api.create(toCreateInput(task)) as Task;
      const originalUpdatedAt = created.updatedAt;

      // Simulate concurrent read - both operations read the same state
      const readForClose = await api.get<Task>(created.id);
      const readForUpdate = await api.get<Task>(created.id);

      expect(readForClose!.updatedAt).toBe(originalUpdatedAt);
      expect(readForUpdate!.updatedAt).toBe(originalUpdatedAt);

      // Wait to ensure timestamps differ
      await sleep(2);

      // First operation: close the task
      await api.update<Task>(created.id, {
        status: TaskStatus.CLOSED,
        closedAt: new Date().toISOString(),
      }, {
        expectedUpdatedAt: originalUpdatedAt,
      });

      // Second operation: try to update status (should fail)
      await expect(
        api.update<Task>(created.id, {
          status: TaskStatus.OPEN,
        }, {
          expectedUpdatedAt: originalUpdatedAt, // Stale now
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should detect concurrent assignment changes', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;
      const originalUpdatedAt = created.updatedAt;

      // Wait to ensure timestamps differ
      await sleep(2);

      // First operation: assign to user A
      await api.update<Task>(created.id, {
        assignee: 'user:agent-a' as EntityId,
      }, {
        expectedUpdatedAt: originalUpdatedAt,
      });

      // Second operation: try to assign to user B (should fail)
      await expect(
        api.update<Task>(created.id, {
          assignee: 'user:agent-b' as EntityId,
        }, {
          expectedUpdatedAt: originalUpdatedAt, // Stale
        })
      ).rejects.toThrow(ConflictError);

      // Verify final state
      const finalTask = await api.get<Task>(created.id);
      expect(finalTask!.assignee).toBe('user:agent-a' as EntityId);
    });

    it('should handle sequential updates with correct expectedUpdatedAt', async () => {
      // Create a task
      const task = await createTestTask({ priority: Priority.MEDIUM });
      const created = await api.create(toCreateInput(task)) as Task;

      // Wait to ensure timestamps differ
      await sleep(2);

      // Sequential updates, each using the previous updatedAt
      const update1 = await api.update<Task>(created.id, {
        priority: Priority.HIGH,
      }, {
        expectedUpdatedAt: created.updatedAt,
      });

      await sleep(2);

      const update2 = await api.update<Task>(created.id, {
        priority: Priority.CRITICAL,
      }, {
        expectedUpdatedAt: update1.updatedAt,
      });

      await sleep(2);

      const update3 = await api.update<Task>(created.id, {
        title: 'Final Title',
      }, {
        expectedUpdatedAt: update2.updatedAt,
      });

      // All updates should succeed
      expect(update3.priority).toBe(Priority.CRITICAL);
      expect(update3.title).toBe('Final Title');
    });
  });

  describe('parallel update simulation', () => {
    it('should reject updates with stale timestamps even in parallel', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;
      const originalUpdatedAt = created.updatedAt;

      // Wait to ensure timestamps differ
      await sleep(2);

      // First, update the task to change its timestamp
      await api.update<Task>(created.id, {
        title: 'First Update',
      });

      // Now try multiple parallel updates all using the stale originalUpdatedAt
      // All should fail because the task has been modified
      const results = await Promise.allSettled([
        api.update<Task>(created.id, { title: 'Update A' }, { expectedUpdatedAt: originalUpdatedAt }),
        api.update<Task>(created.id, { title: 'Update B' }, { expectedUpdatedAt: originalUpdatedAt }),
        api.update<Task>(created.id, { title: 'Update C' }, { expectedUpdatedAt: originalUpdatedAt }),
      ]);

      // All updates should fail with ConflictError
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(ConflictError);
          expect((result.reason as ConflictError).code).toBe(ErrorCode.CONCURRENT_MODIFICATION);
        }
      }
    });

    it('should only allow first update when using fresh timestamps', async () => {
      // This test demonstrates that when a task is read and updated,
      // subsequent updates with the same stale timestamp will fail
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;

      // Wait to ensure timestamps differ
      await sleep(2);

      // First update succeeds (fresh timestamp)
      const firstUpdate = await api.update<Task>(created.id, {
        title: 'First Update',
      }, {
        expectedUpdatedAt: created.updatedAt,
      });

      expect(firstUpdate.title).toBe('First Update');

      // Second update with same original timestamp fails
      await expect(
        api.update<Task>(created.id, {
          title: 'Second Update',
        }, {
          expectedUpdatedAt: created.updatedAt, // Stale
        })
      ).rejects.toThrow(ConflictError);

      // But updating with the new timestamp succeeds
      await sleep(2);
      const thirdUpdate = await api.update<Task>(created.id, {
        title: 'Third Update',
      }, {
        expectedUpdatedAt: firstUpdate.updatedAt, // Fresh
      });

      expect(thirdUpdate.title).toBe('Third Update');
    });
  });

  describe('error message clarity', () => {
    it('should provide helpful error message for concurrent modification', async () => {
      // Create a task
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task)) as Task;
      const originalUpdatedAt = created.updatedAt;

      // Wait to ensure timestamps differ
      await sleep(2);

      // Update to change timestamp
      await api.update<Task>(created.id, { title: 'First Update' });

      // Try update with stale timestamp
      try {
        await api.update<Task>(created.id, {
          title: 'Second Update',
        }, {
          expectedUpdatedAt: originalUpdatedAt,
        });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        const message = (error as ConflictError).message;
        expect(message).toContain('modified by another process');
        expect(message).toContain(created.id);
        expect(message).toContain('Expected updatedAt');
      }
    });
  });
});
