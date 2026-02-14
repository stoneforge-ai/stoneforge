/**
 * Stoneforge API CRUD Operations Tests
 *
 * Comprehensive tests for the QuarryAPI implementation covering:
 * - CRUD operations (create, get, list, update, delete)
 * - Task-specific queries (ready, blocked)
 * - Dependency management
 * - Search functionality
 * - Event tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl, createQuarryAPI } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Timestamp, Task, HydratedTask, Document, DocumentId } from '@stoneforge/core';
import { createTask, Priority, createDocument, ContentType, NotFoundError, ValidationError, ConstraintError, ConflictError, StorageError } from '@stoneforge/core';

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
 * Create a test document element
 */
async function createTestDocument(overrides: Partial<Parameters<typeof createDocument>[0]> = {}): Promise<Document> {
  return createDocument({
    contentType: ContentType.MARKDOWN,
    content: '# Test Document\n\nThis is a test.',
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('QuarryAPI', () => {
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
  // Factory Function Tests
  // --------------------------------------------------------------------------

  describe('createQuarryAPI', () => {
    it('should create an API instance', () => {
      const instance = createQuarryAPI(backend);
      expect(instance).toBeInstanceOf(QuarryAPIImpl);
    });
  });

  // --------------------------------------------------------------------------
  // Create Operation Tests
  // --------------------------------------------------------------------------

  describe('create()', () => {
    it('should create a task element', async () => {
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task));

      expect(created.id).toBe(task.id);
      expect(created.type).toBe('task');
      expect(created.createdBy).toBe(mockEntityId);
    });

    it('should create a document element', async () => {
      const doc = await createTestDocument();
      const created = await api.create(toCreateInput(doc));

      expect(created.id).toBe(doc.id);
      expect(created.type).toBe('document');
    });

    it('should persist tags', async () => {
      const task = await createTestTask({ tags: ['urgent', 'frontend'] });
      await api.create(toCreateInput(task));

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved?.tags).toEqual(['urgent', 'frontend']);
    });

    it('should record a creation event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const events = await api.getEvents(task.id);
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('created');
      expect(events[0].elementId).toBe(task.id);
    });

    it('should mark element as dirty for sync', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const dirtyElements = backend.getDirtyElements();
      const dirtyIds = dirtyElements.map(d => String(d.elementId));
      expect(dirtyIds).toContain(task.id);
    });
  });

  // --------------------------------------------------------------------------
  // Get Operation Tests
  // --------------------------------------------------------------------------

  describe('get()', () => {
    it('should retrieve an existing element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(task.id);
      expect(retrieved?.type).toBe('task');
    });

    it('should return null for non-existent element', async () => {
      const result = await api.get('el-nonexistent' as ElementId);
      expect(result).toBeNull();
    });

    it('should retrieve element with all fields intact', async () => {
      const task = await createTestTask({
        title: 'Specific Title',
        tags: ['test'],
        priority: Priority.HIGH,
      });
      await api.create(toCreateInput(task));

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved?.title).toBe('Specific Title');
      expect(retrieved?.tags).toEqual(['test']);
      expect(retrieved?.priority).toBe(Priority.HIGH);
    });

    it('should hydrate task with description when requested', async () => {
      // Create a description document
      const descDoc = await createTestDocument({
        content: 'Detailed task description',
      });
      await api.create(toCreateInput(descDoc));

      // Create a task with description ref
      const task = await createTestTask({
        descriptionRef: descDoc.id as DocumentId,
      });
      await api.create(toCreateInput(task));

      // Get with hydration
      const hydrated = await api.get<HydratedTask>(task.id, {
        hydrate: { description: true },
      });
      expect(hydrated?.description).toBe('Detailed task description');
    });
  });

  // --------------------------------------------------------------------------
  // List Operation Tests
  // --------------------------------------------------------------------------

  describe('list()', () => {
    beforeEach(async () => {
      // Create test data
      const task1 = await createTestTask({ title: 'Task 1', tags: ['urgent'] });
      const task2 = await createTestTask({ title: 'Task 2', tags: ['later'] });
      const task3 = await createTestTask({ title: 'Task 3', tags: ['urgent', 'important'] });
      const doc = await createTestDocument({ content: 'Document 1' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));
      await api.create(toCreateInput(doc));
    });

    it('should list all elements without filter', async () => {
      const elements = await api.list();
      expect(elements.length).toBe(4);
    });

    it('should filter by type', async () => {
      const tasks = await api.list<Task>({ type: 'task' });
      expect(tasks.length).toBe(3);
      tasks.forEach((t) => expect(t.type).toBe('task'));
    });

    it('should filter by multiple types', async () => {
      const elements = await api.list({ type: ['task', 'document'] });
      expect(elements.length).toBe(4);
    });

    it('should filter by tag', async () => {
      const urgentTasks = await api.list<Task>({ tags: ['urgent'] });
      expect(urgentTasks.length).toBe(2);
    });

    it('should paginate results', async () => {
      const page1 = await api.listPaginated({ limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(4);
      expect(page1.hasMore).toBe(true);

      const page2 = await api.listPaginated({ limit: 2, offset: 2 });
      expect(page2.items.length).toBe(2);
      expect(page2.hasMore).toBe(false);
    });

    it('should order results', async () => {
      const ascending = await api.list({ orderBy: 'created_at', orderDir: 'asc' });
      const descending = await api.list({ orderBy: 'created_at', orderDir: 'desc' });

      // Both should have the same elements
      expect(ascending.length).toBe(descending.length);
      expect(ascending.length).toBe(4);

      // Both orderings contain the same set of IDs
      const ascIds = new Set(ascending.map((e) => e.id));
      const descIds = new Set(descending.map((e) => e.id));
      expect(ascIds).toEqual(descIds);
    });
  });

  // --------------------------------------------------------------------------
  // Update Operation Tests
  // --------------------------------------------------------------------------

  describe('update()', () => {
    it('should update an element', async () => {
      const task = await createTestTask({ title: 'Original Title' });
      await api.create(toCreateInput(task));

      const updated = await api.update<Task>(task.id, { title: 'Updated Title' } as Partial<Task>);
      expect(updated.title).toBe('Updated Title');
    });

    it('should update updatedAt timestamp', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      const originalUpdatedAt = task.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);
      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should not change immutable fields', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      const originalId = task.id;
      const originalCreatedAt = task.createdAt;
      const originalCreatedBy = task.createdBy;

      const updated = await api.update<Task>(task.id, {
        id: 'el-new-id' as ElementId,
        createdAt: '2020-01-01T00:00:00.000Z' as Timestamp,
        createdBy: 'user:hacker' as EntityId,
      } as Partial<Task>);

      expect(updated.id).toBe(originalId);
      expect(updated.createdAt).toBe(originalCreatedAt);
      expect(updated.createdBy).toBe(originalCreatedBy);
    });

    it('should throw NotFoundError for non-existent element', async () => {
      await expect(
        api.update('el-nonexistent' as ElementId, { title: 'Test' } as Partial<Task>)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when updating messages', async () => {
      // Create a mock message element directly in DB
      const now = new Date().toISOString();
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'el-msg-1',
          'message',
          JSON.stringify({ channelId: 'ch-1', sender: mockEntityId }),
          now,
          now,
          mockEntityId,
        ]
      );

      await expect(
        api.update('el-msg-1' as ElementId, { title: 'Test' } as Partial<Task>)
      ).rejects.toThrow(ConstraintError);
    });

    it('should record an update event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const updateEvents = events.filter((e) => e.eventType === 'updated');
      expect(updateEvents.length).toBe(1);
    });

    it('should update tags correctly', async () => {
      const task = await createTestTask({ tags: ['old-tag'] });
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { tags: ['new-tag-1', 'new-tag-2'] } as Partial<Task>);

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved?.tags).toEqual(['new-tag-1', 'new-tag-2']);
    });
  });

  // --------------------------------------------------------------------------
  // Delete Operation Tests
  // --------------------------------------------------------------------------

  describe('delete()', () => {
    it('should soft-delete an element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id);

      // Should not appear in default list
      const elements = await api.list();
      expect(elements.find((e) => e.id === task.id)).toBeUndefined();

      // Should appear with includeDeleted
      const allElements = await api.list({ includeDeleted: true });
      expect(allElements.find((e) => e.id === task.id)).toBeDefined();
    });

    it('should throw NotFoundError for non-existent element', async () => {
      await expect(
        api.delete('el-nonexistent' as ElementId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when deleting messages', async () => {
      // Create a mock message element directly in DB
      const now = new Date().toISOString();
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'el-msg-2',
          'message',
          JSON.stringify({ channelId: 'ch-1', sender: mockEntityId }),
          now,
          now,
          mockEntityId,
        ]
      );

      await expect(api.delete('el-msg-2' as ElementId)).rejects.toThrow(ConstraintError);
    });

    it('should record a delete event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id, { reason: 'No longer needed' });

      const events = await api.getEvents(task.id);
      const deleteEvents = events.filter((e) => e.eventType === 'deleted');
      expect(deleteEvents.length).toBe(1);
    });

    it('should cascade delete dependencies where element is source', async () => {
      // Create blocker and blocked tasks
      const blocker = await createTestTask({ title: 'Blocker' });
      const blocked = await createTestTask({ title: 'Blocked' });
      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      // Add blocking dependency: blocker -> blocks -> blocked
      await api.addDependency({
        blockerId: blocker.id,
        blockedId: blocked.id,
        type: 'blocks',
      });

      // Verify dependency exists
      const depsBefore = await api.getDependencies(blocked.id);
      expect(depsBefore.length).toBe(1);

      // Delete the blocker
      await api.delete(blocker.id);

      // Verify dependency was cascade deleted
      const depsAfter = await api.getDependencies(blocked.id);
      expect(depsAfter.length).toBe(0);

      // Also verify no orphan dependency pointing to blocked
      const reverseAfter = await api.getDependents(blocker.id);
      expect(reverseAfter.length).toBe(0);
    });

    it('should cascade delete dependencies where element is target', async () => {
      // Create a plan and task
      const now = new Date().toISOString();
      const planId = 'el-plan-123' as ElementId;
      const task = await createTestTask({ title: 'Task in plan' });

      // Insert plan directly
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          planId,
          'plan',
          JSON.stringify({ title: 'Test Plan', status: 'active' }),
          now,
          now,
          mockEntityId,
        ]
      );
      await api.create(toCreateInput(task));

      // Add parent-child dependency: task -> parent-child -> plan
      await api.addDependency({
        blockedId: task.id,
        blockerId: planId,
        type: 'parent-child',
      });

      // Verify dependency exists
      const depsBefore = await api.getDependencies(task.id);
      expect(depsBefore.length).toBe(1);
      expect(depsBefore[0].blockerId).toBe(planId);

      // Delete the plan
      await api.delete(planId);

      // Verify dependency was cascade deleted - no orphan dependency from task to deleted plan
      const depsAfter = await api.getDependencies(task.id);
      expect(depsAfter.length).toBe(0);
    });

    it('should cascade delete all dependencies in both directions', async () => {
      // Create three tasks: A relates-to B, B blocks C
      const taskA = await createTestTask({ title: 'Task A' });
      const taskB = await createTestTask({ title: 'Task B' });
      const taskC = await createTestTask({ title: 'Task C' });
      await api.create(toCreateInput(taskA));
      await api.create(toCreateInput(taskB));
      await api.create(toCreateInput(taskC));

      // A relates-to B
      await api.addDependency({
        blockedId: taskA.id,
        blockerId: taskB.id,
        type: 'relates-to',
      });

      // B blocks C
      await api.addDependency({
        blockerId: taskB.id,
        blockedId: taskC.id,
        type: 'blocks',
      });

      // Verify dependencies exist
      const cDeps = await api.getDependencies(taskC.id);
      expect(cDeps.length).toBe(1); // C is blocked by B

      const bDependents = await api.getDependents(taskB.id);
      expect(bDependents.length).toBe(2); // B blocks C + B is blocker in A relates-to B

      // Delete task B
      await api.delete(taskB.id);

      // Verify all dependencies involving B are gone
      const cDepsAfter = await api.getDependencies(taskC.id);
      expect(cDepsAfter.length).toBe(0);

      const bDependentsAfter = await api.getDependents(taskB.id);
      expect(bDependentsAfter.length).toBe(0);

      // Task C should no longer have any dependents (B was the blocker, now deleted)
      const cDependentsAfter = await api.getDependents(taskC.id);
      expect(cDependentsAfter.length).toBe(0);

      // Task A should no longer have any outgoing dependencies (relates-to with B was deleted)
      const aDepsAfter = await api.getDependencies(taskA.id);
      expect(aDepsAfter.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Task Query Tests
  // --------------------------------------------------------------------------

  describe('ready()', () => {
    it('should return tasks that are not blocked', async () => {
      const task1 = await createTestTask({ title: 'Ready Task' });
      const task2 = await createTestTask({ title: 'Blocked Task' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Block task2 (blocker blocks task2 - task2 waits for blocker to close)
      const blocker = await createTestTask({ title: 'Blocker' });
      await api.create(toCreateInput(blocker));
      await api.addDependency({
        blockerId: blocker.id,
        blockedId: task2.id,
        type: 'blocks',
      });

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task1.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(task2.id);
    });

    it('should filter out scheduled-for-future tasks', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const futureTask = await createTestTask({
        title: 'Future Task',
        scheduledFor: futureDate,
      });
      const nowTask = await createTestTask({ title: 'Now Task' });

      await api.create(toCreateInput(futureTask));
      await api.create(toCreateInput(nowTask));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(nowTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(futureTask.id);
    });
  });

  describe('blocked()', () => {
    it('should return blocked tasks with blocking info', async () => {
      const task = await createTestTask({ title: 'Blocked Task' });
      const blocker = await createTestTask({ title: 'Blocker' });

      await api.create(toCreateInput(task));
      await api.create(toCreateInput(blocker));
      // blocker blocks task - task waits for blocker to close
      await api.addDependency({
        blockerId: blocker.id,
        blockedId: task.id,
        type: 'blocks',
      });

      const blockedTasks = await api.blocked();
      expect(blockedTasks.length).toBe(1);
      expect(blockedTasks[0].id).toBe(task.id);
      expect(blockedTasks[0].blockedBy).toBe(blocker.id);
    });
  });

  // --------------------------------------------------------------------------
  // Dependency Tests
  // --------------------------------------------------------------------------

  describe('Dependency Operations', () => {
    let task1: Task;
    let task2: Task;

    beforeEach(async () => {
      task1 = await createTestTask({ title: 'Task 1' });
      task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
    });

    describe('addDependency()', () => {
      it('should add a dependency between elements', async () => {
        const dep = await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        expect(dep.blockerId).toBe(task1.id);
        expect(dep.blockedId).toBe(task2.id);
        expect(dep.type).toBe('blocks');
      });

      it('should throw NotFoundError for non-existent source', async () => {
        await expect(
          api.addDependency({
            blockedId: 'el-nonexistent' as ElementId,
            blockerId: task2.id,
            type: 'blocks',
          })
        ).rejects.toThrow(NotFoundError);
      });

      it('should throw ConflictError for duplicate dependency', async () => {
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        await expect(
          api.addDependency({
            blockerId: task1.id,
            blockedId: task2.id,
            type: 'blocks',
          })
        ).rejects.toThrow(ConflictError);
      });

      it('should update blocked cache for blocking dependencies', async () => {
        // task1 blocks task2 - task2 waits for task1 to close
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        const blockedTasks = await api.blocked();
        expect(blockedTasks.find((t) => t.id === task2.id)).toBeDefined();
      });
    });

    describe('removeDependency()', () => {
      it('should remove an existing dependency', async () => {
        // task1 blocks task2 - task2 waits for task1 to close
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        await api.removeDependency(task2.id, task1.id, 'blocks');

        const deps = await api.getDependencies(task2.id);
        expect(deps.length).toBe(0);
      });

      it('should throw NotFoundError for non-existent dependency', async () => {
        await expect(
          api.removeDependency(task2.id, task1.id, 'blocks')
        ).rejects.toThrow(NotFoundError);
      });

      it('should update blocked cache when dependency removed', async () => {
        // task1 blocks task2 - task2 waits for task1 to close
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        await api.removeDependency(task2.id, task1.id, 'blocks');

        const blockedTasks = await api.blocked();
        expect(blockedTasks.find((t) => t.id === task2.id)).toBeUndefined();
      });
    });

    describe('getDependencies()', () => {
      it('should return all dependencies for an element', async () => {
        const task3 = await createTestTask({ title: 'Task 3' });
        await api.create(toCreateInput(task3));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });
        await api.addDependency({
          blockedId: task2.id,
          blockerId: task3.id,
          type: 'relates-to',
        });

        const deps = await api.getDependencies(task2.id);
        expect(deps.length).toBe(2);
      });

      it('should filter by dependency type', async () => {
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        const blockDeps = await api.getDependencies(task2.id, ['blocks']);
        expect(blockDeps.length).toBe(1);

        const relateDeps = await api.getDependencies(task2.id, ['relates-to']);
        expect(relateDeps.length).toBe(0);
      });
    });

    describe('getDependents()', () => {
      it('should return elements that depend on this element', async () => {
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        const dependents = await api.getDependents(task1.id);
        expect(dependents.length).toBe(1);
        expect(dependents[0].blockedId).toBe(task2.id);
      });
    });

    describe('getDependencyTree()', () => {
      it('should build a dependency tree', async () => {
        const task3 = await createTestTask({ title: 'Task 3' });
        await api.create(toCreateInput(task3));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });
        await api.addDependency({
          blockerId: task2.id,
          blockedId: task3.id,
          type: 'blocks',
        });

        const tree = await api.getDependencyTree(task3.id);
        expect(tree.root.element.id).toBe(task3.id);
        expect(tree.dependencyDepth).toBeGreaterThanOrEqual(1);
        expect(tree.nodeCount).toBeGreaterThanOrEqual(2);
      });

      it('should throw NotFoundError for non-existent element', async () => {
        await expect(
          api.getDependencyTree('el-nonexistent' as ElementId)
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Search Tests
  // --------------------------------------------------------------------------

  describe('search()', () => {
    beforeEach(async () => {
      const task1 = await createTestTask({ title: 'Login Feature' });
      const task2 = await createTestTask({ title: 'Authentication Bug' });
      const task3 = await createTestTask({ title: 'Dashboard Updates' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));
    });

    it('should find elements by title', async () => {
      const results = await api.search('Login');
      expect(results.length).toBe(1);
      expect((results[0] as Task).title).toBe('Login Feature');
    });

    it('should be case-insensitive', async () => {
      const results = await api.search('login');
      expect(results.length).toBe(1);
    });

    it('should find partial matches', async () => {
      const results = await api.search('Auth');
      expect(results.length).toBe(1);
      expect((results[0] as Task).title).toContain('Authentication');
    });

    it('should return empty array for no matches', async () => {
      const results = await api.search('XYZ-NonExistent');
      expect(results.length).toBe(0);
    });

    it('should respect type filter', async () => {
      const doc = await createTestDocument({ content: 'Login instructions' });
      await api.create(toCreateInput(doc));

      const taskResults = await api.search('Login', { type: 'task' });
      expect(taskResults.every((e) => e.type === 'task')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // History/Events Tests
  // --------------------------------------------------------------------------

  describe('getEvents()', () => {
    it('should return events for an element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      expect(events.length).toBe(2);
    });

    it('should filter events by type', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

      const createEvents = await api.getEvents(task.id, { eventType: 'created' });
      expect(createEvents.length).toBe(1);
    });

    it('should limit event results', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
      await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

      const events = await api.getEvents(task.id, { limit: 2 });
      expect(events.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Stats Tests
  // --------------------------------------------------------------------------

  describe('stats()', () => {
    it('should return system statistics', async () => {
      const task = await createTestTask();
      const doc = await createTestDocument();
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(doc));

      const stats = await api.stats();
      expect(stats.totalElements).toBe(2);
      expect(stats.elementsByType.task).toBe(1);
      expect(stats.elementsByType.document).toBe(1);
      expect(stats.computedAt).toBeDefined();
    });

    it('should count ready and blocked tasks', async () => {
      const task1 = await createTestTask({ title: 'Ready Task' });
      const task2 = await createTestTask({ title: 'Blocked Task' });
      const blocker = await createTestTask({ title: 'Blocker' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(blocker));

      // blocker blocks task2 - task2 waits for blocker to close
      await api.addDependency({
        blockerId: blocker.id,
        blockedId: task2.id,
        type: 'blocks',
      });

      const stats = await api.stats();
      expect(stats.readyTasks).toBeGreaterThanOrEqual(1);
      expect(stats.blockedTasks).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Export Tests
  // --------------------------------------------------------------------------

  describe('export()', () => {
    it('should export elements as JSONL', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const jsonl = await api.export();
      expect(typeof jsonl).toBe('string');
      expect(jsonl).toContain(task.id);
    });

    it('should export multiple elements', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      const jsonl = await api.export();
      expect(jsonl).toContain(task1.id);
      expect(jsonl).toContain(task2.id);
    });

    it('should export elements with dependencies', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.addDependency({
        blockerId: task1.id,
        blockedId: task2.id,
        type: 'blocks',
      });

      const jsonl = await api.export({ includeDependencies: true });
      expect(jsonl).toContain(task1.id);
      expect(jsonl).toContain(task2.id);
      // Dependencies should be included
      const lines = jsonl!.split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('should export element with tags', async () => {
      const task = await createTestTask({ tags: ['urgent', 'bug'] });
      await api.create(toCreateInput(task));

      const jsonl = await api.export();
      expect(jsonl).toContain('urgent');
      expect(jsonl).toContain('bug');
    });

    it('should export element with metadata', async () => {
      const task = await createTestTask({ metadata: { custom: 'value' } });
      await api.create(toCreateInput(task));

      const jsonl = await api.export();
      expect(jsonl).toContain('custom');
      expect(jsonl).toContain('value');
    });

    it('should return empty string when no elements', async () => {
      const jsonl = await api.export();
      expect(jsonl).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Import Tests
  // --------------------------------------------------------------------------

  describe('import()', () => {
    it('should import elements from raw JSONL data', async () => {
      // Create JSONL data for a task
      const now = new Date().toISOString();
      const taskData = {
        id: 'test-import-1',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Imported Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(taskData) });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);
      expect(result.dryRun).toBe(false);
    });

    it('should support dry run mode', async () => {
      const now = new Date().toISOString();
      const taskData = {
        id: 'test-import-dryrun',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Dry Run Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(taskData), dryRun: true });
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Element should NOT be in database
      const element = await api.get(taskData.id as ElementId);
      expect(element).toBeNull();
    });

    it('should import multiple elements', async () => {
      const now = new Date().toISOString();
      const task1 = {
        id: 'test-import-multi-1',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Task 1',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };
      const task2 = {
        id: 'test-import-multi-2',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Task 2',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const jsonl = [JSON.stringify(task1), JSON.stringify(task2)].join('\n');
      const result = await api.import({ data: jsonl });

      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(2);
    });

    it('should handle import with tags', async () => {
      const now = new Date().toISOString();
      const taskData = {
        id: 'test-import-tags',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: ['urgent', 'bug'],
        metadata: {},
        title: 'Tagged Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(taskData) });
      expect(result.success).toBe(true);

      // Verify tags were imported
      const element = await api.get<Task>(taskData.id as ElementId);
      expect(element?.tags).toContain('urgent');
      expect(element?.tags).toContain('bug');
    });

    it('should handle invalid JSONL data', async () => {
      const result = await api.import({ data: 'not valid json' });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty data', async () => {
      const result = await api.import({ data: '' });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(0);
    });

    it('should merge existing element with LWW strategy', async () => {
      // Create an element first
      const task = await createTestTask({ title: 'Original Title' });
      await api.create(toCreateInput(task));

      // Import an update with later timestamp
      const later = new Date(Date.now() + 10000).toISOString();
      const updatedData = {
        id: task.id,
        type: 'task',
        createdAt: task.createdAt,
        updatedAt: later,
        createdBy: task.createdBy,
        tags: [],
        metadata: {},
        title: 'Updated Title',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(updatedData) });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Verify the update was applied
      const element = await api.get<Task>(task.id);
      expect(element?.title).toBe('Updated Title');
    });

    it('should skip element when local is newer', async () => {
      // Create an element with a recent timestamp
      const task = await createTestTask({ title: 'Local Title' });
      await api.create(toCreateInput(task));

      // Import an older version
      const earlier = new Date(Date.now() - 100000).toISOString();
      const oldData = {
        id: task.id,
        type: 'task',
        createdAt: earlier,
        updatedAt: earlier,
        createdBy: task.createdBy,
        tags: [],
        metadata: {},
        title: 'Old Title',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(oldData) });
      expect(result.success).toBe(true);

      // Verify local version was kept
      const element = await api.get<Task>(task.id);
      expect(element?.title).toBe('Local Title');
    });

    it('should force overwrite with overwrite strategy', async () => {
      // Create an element first
      const task = await createTestTask({ title: 'Original Title' });
      await api.create(toCreateInput(task));

      // Import an older version with force
      const earlier = new Date(Date.now() - 100000).toISOString();
      const oldData = {
        id: task.id,
        type: 'task',
        createdAt: earlier,
        updatedAt: earlier,
        createdBy: task.createdBy,
        tags: [],
        metadata: {},
        title: 'Forced Title',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({
        data: JSON.stringify(oldData),
        conflictStrategy: 'overwrite',
      });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Verify force overwrite was applied
      const element = await api.get<Task>(task.id);
      expect(element?.title).toBe('Forced Title');
    });
  });

  // --------------------------------------------------------------------------
  // Round-trip Export/Import Tests
  // --------------------------------------------------------------------------

  describe('export/import round-trip', () => {
    it('should round-trip a single task', async () => {
      // Create a task
      const task = await createTestTask({ title: 'Round Trip Task' });
      await api.create(toCreateInput(task));

      // Export
      const jsonl = await api.export();

      // Create a new database and import
      const backend2 = createStorage({ path: ':memory:' });
      initializeSchema(backend2);
      const api2 = new QuarryAPIImpl(backend2);

      const result = await api2.import({ data: jsonl! });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Verify the element exists in new database
      const imported = await api2.get<Task>(task.id);
      expect(imported).not.toBeNull();
      expect(imported?.title).toBe('Round Trip Task');

      backend2.close();
    });

    it('should round-trip elements with dependencies', async () => {
      // Create tasks with dependency
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.addDependency({
        blockerId: task1.id,
        blockedId: task2.id,
        type: 'blocks',
      });

      // Export
      const jsonl = await api.export({ includeDependencies: true });

      // Create a new database and import
      const backend2 = createStorage({ path: ':memory:' });
      initializeSchema(backend2);
      const api2 = new QuarryAPIImpl(backend2);

      const result = await api2.import({ data: jsonl! });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(2);

      // Verify both elements exist
      const imported1 = await api2.get<Task>(task1.id);
      const imported2 = await api2.get<Task>(task2.id);
      expect(imported1).not.toBeNull();
      expect(imported2).not.toBeNull();

      backend2.close();
    });

    it('should round-trip elements with tags', async () => {
      const task = await createTestTask({ tags: ['round-trip', 'test'] });
      await api.create(toCreateInput(task));

      const jsonl = await api.export();

      const backend2 = createStorage({ path: ':memory:' });
      initializeSchema(backend2);
      const api2 = new QuarryAPIImpl(backend2);

      await api2.import({ data: jsonl! });

      const imported = await api2.get<Task>(task.id);
      expect(imported?.tags).toContain('round-trip');
      expect(imported?.tags).toContain('test');

      backend2.close();
    });
  });

  // --------------------------------------------------------------------------
  // Content Hash Tests
  // --------------------------------------------------------------------------

  describe('Content Hashing', () => {
    it('should compute and store content hash on create', async () => {
      const task = await createTestTask({ title: 'Hash Test Task' });
      await api.create(toCreateInput(task));

      // Query the database directly to check content_hash
      const row = backend.queryOne<{ content_hash: string | null }>('SELECT content_hash FROM elements WHERE id = ?', [task.id]);
      expect(row).not.toBeNull();
      expect(row?.content_hash).not.toBeNull();
      expect(typeof row?.content_hash).toBe('string');
      // SHA256 hash is 64 hex characters
      expect(row?.content_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should update content hash on element update', async () => {
      const task = await createTestTask({ title: 'Original Title' });
      await api.create(toCreateInput(task));

      // Get original hash
      const originalRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task.id]);
      const originalHash = originalRow?.content_hash;

      // Update the task
      await api.update<Task>(task.id, { title: 'Updated Title' });

      // Get new hash
      const newRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task.id]);
      const newHash = newRow?.content_hash;

      expect(newHash).not.toBeNull();
      expect(newHash).not.toBe(originalHash); // Hash should change when content changes
    });

    it('should produce consistent hash for identical content', async () => {
      // Create two tasks with identical content fields
      const task1 = await createTestTask({ title: 'Same Title' });
      const task2 = await createTestTask({ title: 'Same Title' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      const row1 = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task1.id]);
      const row2 = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task2.id]);

      // Different IDs should produce different hashes since ID is included in hash
      // But the hash algorithm should still be deterministic
      expect(row1?.content_hash).not.toBeNull();
      expect(row2?.content_hash).not.toBeNull();
      expect(row1?.content_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row2?.content_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hash for different content', async () => {
      const task1 = await createTestTask({ title: 'Title A' });
      const task2 = await createTestTask({ title: 'Title B' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      const row1 = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task1.id]);
      const row2 = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task2.id]);

      expect(row1?.content_hash).not.toBe(row2?.content_hash);
    });

    it('should not change hash when only timestamps change', async () => {
      const task = await createTestTask({ title: 'Timestamp Test' });
      await api.create(toCreateInput(task));

      const originalRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task.id]);
      const originalHash = originalRow?.content_hash;

      // Update with same values - only updatedAt changes
      await api.update<Task>(task.id, { title: 'Timestamp Test' });

      const newRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task.id]);

      // Hash should be the same since the content didn't change
      expect(newRow?.content_hash).toBe(originalHash);
    });

    it('should handle documents with content hash', async () => {
      const doc = await createTestDocument({ content: '# Test Content' });
      await api.create(toCreateInput(doc));

      const row = backend.queryOne<{ content_hash: string | null }>('SELECT content_hash FROM elements WHERE id = ?', [doc.id]);
      expect(row?.content_hash).not.toBeNull();
      expect(row?.content_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should update content hash when document content changes', async () => {
      const doc = await createTestDocument({ content: 'Original content' });
      await api.create(toCreateInput(doc));

      const originalRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [doc.id]);
      const originalHash = originalRow?.content_hash;

      await api.update<Document>(doc.id, { content: 'Updated content' });

      const newRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [doc.id]);
      expect(newRow?.content_hash).not.toBe(originalHash);
    });

    it('should update content hash when tags change', async () => {
      const task = await createTestTask({ title: 'Tag Test', tags: ['original'] });
      await api.create(toCreateInput(task));

      const originalRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task.id]);
      const originalHash = originalRow?.content_hash;

      await api.update<Task>(task.id, { tags: ['original', 'new-tag'] });

      const newRow = backend.queryOne<{ content_hash: string }>('SELECT content_hash FROM elements WHERE id = ?', [task.id]);
      expect(newRow?.content_hash).not.toBe(originalHash);
    });
  });

  // --------------------------------------------------------------------------
  // Batch Fetching Optimization Tests
  // --------------------------------------------------------------------------

  describe('batch fetching optimization', () => {
    it('should correctly fetch tags for multiple elements in list()', async () => {
      // Create multiple tasks with different tags
      const task1 = await createTestTask({ title: 'Task 1', tags: ['alpha', 'beta'] });
      const task2 = await createTestTask({ title: 'Task 2', tags: ['gamma'] });
      const task3 = await createTestTask({ title: 'Task 3', tags: ['alpha', 'gamma', 'delta'] });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      // List all tasks and verify tags are correctly associated
      const tasks = await api.list<Task>({ type: 'task' });
      expect(tasks.length).toBe(3);

      // Find each task and verify tags
      const found1 = tasks.find(t => t.title === 'Task 1');
      const found2 = tasks.find(t => t.title === 'Task 2');
      const found3 = tasks.find(t => t.title === 'Task 3');

      expect(found1?.tags.sort()).toEqual(['alpha', 'beta']);
      expect(found2?.tags.sort()).toEqual(['gamma']);
      expect(found3?.tags.sort()).toEqual(['alpha', 'delta', 'gamma']);
    });

    it('should correctly fetch tags for elements with no tags', async () => {
      // Create tasks with and without tags
      const taskWithTags = await createTestTask({ title: 'With Tags', tags: ['tag1', 'tag2'] });
      const taskWithoutTags = await createTestTask({ title: 'Without Tags', tags: [] });

      await api.create(toCreateInput(taskWithTags));
      await api.create(toCreateInput(taskWithoutTags));

      // List and verify
      const tasks = await api.list<Task>({ type: 'task' });
      expect(tasks.length).toBe(2);

      const withTags = tasks.find(t => t.title === 'With Tags');
      const withoutTags = tasks.find(t => t.title === 'Without Tags');

      expect(withTags?.tags.sort()).toEqual(['tag1', 'tag2']);
      expect(withoutTags?.tags).toEqual([]);
    });

    it('should batch hydrate tasks with correct document content', async () => {
      // Create description documents
      const desc1 = await createTestDocument({ content: 'Description 1' });
      const desc2 = await createTestDocument({ content: 'Description 2' });
      const desc3 = await createTestDocument({ content: 'Description 3' });

      await api.create(toCreateInput(desc1));
      await api.create(toCreateInput(desc2));
      await api.create(toCreateInput(desc3));

      // Create tasks with document references and tags
      const task1 = await createTestTask({
        title: 'Task 1',
        descriptionRef: desc1.id as DocumentId,
        tags: ['test1'],
      });
      const task2 = await createTestTask({
        title: 'Task 2',
        descriptionRef: desc2.id as DocumentId,
        tags: ['test2'],
      });
      const task3 = await createTestTask({
        title: 'Task 3',
        descriptionRef: desc3.id as DocumentId,
        tags: ['test3'],
      });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      // List with hydration
      const tasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      // Verify all tasks have correct hydrated content
      expect(tasks.length).toBe(3);

      const hydrated1 = tasks.find(t => t.title === 'Task 1');
      const hydrated2 = tasks.find(t => t.title === 'Task 2');
      const hydrated3 = tasks.find(t => t.title === 'Task 3');

      expect(hydrated1?.description).toBe('Description 1');
      expect(hydrated1?.tags).toEqual(['test1']);
      expect(hydrated2?.description).toBe('Description 2');
      expect(hydrated2?.tags).toEqual(['test2']);
      expect(hydrated3?.description).toBe('Description 3');
      expect(hydrated3?.tags).toEqual(['test3']);
    });

    it('should handle batch fetching with large number of elements', async () => {
      // Create 50 tasks with unique tags
      const tasks: Task[] = [];
      for (let i = 0; i < 50; i++) {
        const task = await createTestTask({
          title: `Task ${i}`,
          tags: [`tag-${i}`, `category-${i % 5}`, 'all'],
        });
        await api.create(toCreateInput(task));
        tasks.push(task);
      }

      // List all and verify tags are correctly associated
      const listed = await api.list<Task>({ type: 'task' });
      expect(listed.length).toBe(50);

      // Verify each task has correct tags
      for (let i = 0; i < 50; i++) {
        const found = listed.find(t => t.title === `Task ${i}`);
        expect(found).toBeDefined();
        expect(found?.tags.sort()).toEqual([`category-${i % 5}`, `tag-${i}`, 'all'].sort());
      }
    });

    it('should correctly paginate with batch tag fetching', async () => {
      // Create 10 tasks
      for (let i = 0; i < 10; i++) {
        const task = await createTestTask({
          title: `Task ${String(i).padStart(2, '0')}`, // Pad for consistent ordering
          tags: [`tag-${i}`],
        });
        await api.create(toCreateInput(task));
      }

      // Fetch in pages and verify tags
      const page1 = await api.listPaginated<Task>({ type: 'task', limit: 4, offset: 0 });
      const page2 = await api.listPaginated<Task>({ type: 'task', limit: 4, offset: 4 });
      const page3 = await api.listPaginated<Task>({ type: 'task', limit: 4, offset: 8 });

      expect(page1.items.length).toBe(4);
      expect(page2.items.length).toBe(4);
      expect(page3.items.length).toBe(2);

      // Verify each item has exactly one tag
      [...page1.items, ...page2.items, ...page3.items].forEach(task => {
        expect(task.tags.length).toBe(1);
        expect(task.tags[0]).toMatch(/^tag-\d$/);
      });
    });

    it('should handle batch fetching with shared tags across elements', async () => {
      // Create tasks that share some tags
      const task1 = await createTestTask({ title: 'Task 1', tags: ['shared', 'unique-1'] });
      const task2 = await createTestTask({ title: 'Task 2', tags: ['shared', 'unique-2'] });
      const task3 = await createTestTask({ title: 'Task 3', tags: ['shared', 'unique-3', 'extra'] });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      // List and verify each task has correct tags without cross-contamination
      const tasks = await api.list<Task>({ type: 'task' });

      const found1 = tasks.find(t => t.title === 'Task 1');
      const found2 = tasks.find(t => t.title === 'Task 2');
      const found3 = tasks.find(t => t.title === 'Task 3');

      expect(found1?.tags.sort()).toEqual(['shared', 'unique-1'].sort());
      expect(found2?.tags.sort()).toEqual(['shared', 'unique-2'].sort());
      expect(found3?.tags.sort()).toEqual(['extra', 'shared', 'unique-3'].sort());
    });

    it('should batch fetch document tags during hydration', async () => {
      // Create documents with tags
      const desc = await createTestDocument({
        content: 'Task description',
        tags: ['doc-tag-1', 'doc-tag-2'],
      });
      await api.create(toCreateInput(desc));

      // Create task referencing document
      const task = await createTestTask({
        title: 'Task with doc',
        descriptionRef: desc.id as DocumentId,
        tags: ['task-tag'],
      });
      await api.create(toCreateInput(task));

      // List with hydration - both task and underlying document should have correct tags
      const tasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      expect(tasks.length).toBe(1);
      expect(tasks[0].description).toBe('Task description');
      expect(tasks[0].tags).toEqual(['task-tag']);

      // Verify the document itself still has its tags
      const doc = await api.get<Document>(desc.id);
      expect(doc?.tags.sort()).toEqual(['doc-tag-1', 'doc-tag-2']);
    });
  });
});

// ============================================================================
// Entity Management Hierarchy Tests
// ============================================================================

import { createEntity, type Entity, EntityTypeValue, deactivateEntity } from '@stoneforge/core';

describe('Entity Management Hierarchy API', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;

  beforeEach(async () => {
    backend = createStorage(':memory:');
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);
  });

  afterEach(() => {
    backend.close();
  });

  // Helper to create test entities
  async function createTestEntity(name: string, reportsTo?: EntityId): Promise<Entity> {
    const entity = await createEntity({
      name,
      entityType: EntityTypeValue.HUMAN,
      createdBy: mockEntityId,
      reportsTo,
    });
    await api.create(toCreateInput(entity));
    return entity;
  }

  describe('setEntityManager', () => {
    it('sets the manager for an entity', async () => {
      const manager = await createTestEntity('manager');
      const employee = await createTestEntity('employee');

      const updated = await api.setEntityManager(
        employee.id as EntityId,
        manager.id as EntityId,
        mockEntityId
      );

      expect(updated.reportsTo).toBe(manager.id);
    });

    it('throws NotFoundError when entity does not exist', async () => {
      const manager = await createTestEntity('manager');

      await expect(
        api.setEntityManager(
          'el-nonexistent' as EntityId,
          manager.id as EntityId,
          mockEntityId
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when manager does not exist', async () => {
      const employee = await createTestEntity('employee');

      await expect(
        api.setEntityManager(
          employee.id as EntityId,
          'el-nonexistent' as EntityId,
          mockEntityId
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for self-reference', async () => {
      const employee = await createTestEntity('employee');

      await expect(
        api.setEntityManager(
          employee.id as EntityId,
          employee.id as EntityId,
          mockEntityId
        )
      ).rejects.toThrow();
    });

    it('throws ConflictError for cycle detection', async () => {
      const manager = await createTestEntity('manager');
      const employee = await createTestEntity('employee', manager.id as EntityId);

      // Try to make manager report to employee (creates cycle)
      await expect(
        api.setEntityManager(
          manager.id as EntityId,
          employee.id as EntityId,
          mockEntityId
        )
      ).rejects.toThrow(ConflictError);
    });

    it('throws ValidationError when manager is deactivated', async () => {
      const manager = await createTestEntity('manager');
      const employee = await createTestEntity('employee');

      // Deactivate the manager
      const deactivatedManager = deactivateEntity(manager, {
        deactivatedBy: mockEntityId,
        reason: 'left company',
      });
      await api.update(manager.id, deactivatedManager as unknown as Partial<Element>);

      await expect(
        api.setEntityManager(
          employee.id as EntityId,
          manager.id as EntityId,
          mockEntityId
        )
      ).rejects.toThrow();
    });
  });

  describe('clearEntityManager', () => {
    it('clears the manager for an entity', async () => {
      const manager = await createTestEntity('manager');
      const employee = await createTestEntity('employee', manager.id as EntityId);

      const updated = await api.clearEntityManager(
        employee.id as EntityId,
        mockEntityId
      );

      expect(updated.reportsTo).toBeUndefined();
    });

    it('is idempotent - clearing when no manager is set', async () => {
      const employee = await createTestEntity('employee');

      const updated = await api.clearEntityManager(
        employee.id as EntityId,
        mockEntityId
      );

      expect(updated.reportsTo).toBeUndefined();
    });

    it('throws NotFoundError when entity does not exist', async () => {
      await expect(
        api.clearEntityManager(
          'el-nonexistent' as EntityId,
          mockEntityId
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getDirectReports', () => {
    it('returns all entities reporting to a manager', async () => {
      const manager = await createTestEntity('manager');
      await createTestEntity('employee1', manager.id as EntityId);
      await createTestEntity('employee2', manager.id as EntityId);
      await createTestEntity('unrelated');

      const reports = await api.getDirectReports(manager.id as EntityId);

      expect(reports).toHaveLength(2);
      expect(reports.map((e) => e.name).sort()).toEqual(['employee1', 'employee2']);
    });

    it('returns empty array when no direct reports', async () => {
      const manager = await createTestEntity('manager');

      const reports = await api.getDirectReports(manager.id as EntityId);

      expect(reports).toEqual([]);
    });

    it('returns only direct reports, not indirect ones', async () => {
      const ceo = await createTestEntity('ceo');
      const manager = await createTestEntity('manager', ceo.id as EntityId);
      await createTestEntity('employee', manager.id as EntityId);

      const reports = await api.getDirectReports(ceo.id as EntityId);

      expect(reports).toHaveLength(1);
      expect(reports[0].name).toBe('manager');
    });
  });

  describe('getManagementChain', () => {
    it('returns the management chain from entity to root', async () => {
      const ceo = await createTestEntity('ceo');
      const vp = await createTestEntity('vp', ceo.id as EntityId);
      const manager = await createTestEntity('manager', vp.id as EntityId);
      const employee = await createTestEntity('employee', manager.id as EntityId);

      const chain = await api.getManagementChain(employee.id as EntityId);

      expect(chain).toHaveLength(3);
      expect(chain[0].name).toBe('manager');
      expect(chain[1].name).toBe('vp');
      expect(chain[2].name).toBe('ceo');
    });

    it('returns empty array when entity has no manager', async () => {
      const employee = await createTestEntity('employee');

      const chain = await api.getManagementChain(employee.id as EntityId);

      expect(chain).toEqual([]);
    });

    it('throws NotFoundError when entity does not exist', async () => {
      await expect(
        api.getManagementChain('el-nonexistent' as EntityId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getOrgChart', () => {
    it('returns all root entities when no rootId specified', async () => {
      const ceo1 = await createTestEntity('ceo1');
      const ceo2 = await createTestEntity('ceo2');
      await createTestEntity('employee', ceo1.id as EntityId);

      const chart = await api.getOrgChart();

      expect(chart).toHaveLength(2);
      expect(chart.map((n) => n.entity.name).sort()).toEqual(['ceo1', 'ceo2']);
    });

    it('returns specific subtree when rootId specified', async () => {
      const ceo = await createTestEntity('ceo');
      const vp = await createTestEntity('vp', ceo.id as EntityId);
      const manager = await createTestEntity('manager', vp.id as EntityId);

      const chart = await api.getOrgChart(vp.id as EntityId);

      expect(chart).toHaveLength(1);
      expect(chart[0].entity.name).toBe('vp');
      expect(chart[0].directReports).toHaveLength(1);
      expect(chart[0].directReports[0].entity.name).toBe('manager');
    });

    it('builds nested hierarchy correctly', async () => {
      const ceo = await createTestEntity('ceo');
      const vp1 = await createTestEntity('vp1', ceo.id as EntityId);
      const vp2 = await createTestEntity('vp2', ceo.id as EntityId);
      await createTestEntity('mgr1', vp1.id as EntityId);

      const chart = await api.getOrgChart(ceo.id as EntityId);

      expect(chart).toHaveLength(1);
      expect(chart[0].directReports).toHaveLength(2);
    });

    it('excludes deactivated entities', async () => {
      const ceo = await createTestEntity('ceo');
      const activeVp = await createTestEntity('active-vp', ceo.id as EntityId);
      const deactivatedVp = await createTestEntity('deactivated-vp', ceo.id as EntityId);

      // Deactivate one VP
      const deactivated = deactivateEntity(deactivatedVp, {
        deactivatedBy: mockEntityId,
        reason: 'left company',
      });
      await api.update(deactivatedVp.id, deactivated as unknown as Partial<Element>);

      const chart = await api.getOrgChart(ceo.id as EntityId);

      expect(chart).toHaveLength(1);
      expect(chart[0].directReports).toHaveLength(1);
      expect(chart[0].directReports[0].entity.name).toBe('active-vp');
    });

    it('returns empty array when rootId not found', async () => {
      await createTestEntity('ceo');

      const chart = await api.getOrgChart('el-nonexistent' as EntityId);

      expect(chart).toEqual([]);
    });
  });
});

// ============================================================================
// Message Inbox Integration Tests (Phase 4)
// ============================================================================

import { createDirectChannel, createMessage, InboxSourceType } from '@stoneforge/core';
import { createInboxService, type InboxService } from '../services/inbox.js';

describe('Message Inbox Integration', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;
  let inboxService: InboxService;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);
    inboxService = createInboxService(backend);
  });

  afterEach(() => {
    backend.close();
  });

  /**
   * Helper to create a test entity
   */
  async function createTestEntityForInbox(name: string): Promise<Element> {
    const entity = await createEntity({
      name,
      entityType: EntityTypeValue.AGENT,
      createdBy: 'el-system' as EntityId,
    });
    return api.create(toCreateInput(entity));
  }

  /**
   * Helper to create a test document
   */
  async function createContentDoc(content: string, createdBy: EntityId): Promise<Element> {
    const doc = await createDocument({
      contentType: ContentType.TEXT,
      content,
      createdBy,
    });
    return api.create(toCreateInput(doc));
  }

  describe('Direct Message Inbox', () => {
    it('creates inbox item for recipient when sending direct message', async () => {
      // Create two entities
      const alice = await createTestEntityForInbox('alice');
      const bob = await createTestEntityForInbox('bob');
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;

      // Create a direct channel between alice and bob
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create a content document for the message
      const contentDoc = await createContentDoc('Hello Bob!', aliceId);

      // Create a message from alice to bob (in the direct channel)
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      await api.create(toCreateInput(message));

      // Check that bob has an inbox item
      const bobInbox = inboxService.getInbox(bobId);
      expect(bobInbox.length).toBe(1);
      expect(bobInbox[0].sourceType).toBe(InboxSourceType.DIRECT);
      expect(bobInbox[0].recipientId).toBe(bobId);

      // Alice should NOT have an inbox item (she sent it)
      const aliceInbox = inboxService.getInbox(aliceId);
      expect(aliceInbox.length).toBe(0);
    });

    it('does not create inbox item for sender in direct message', async () => {
      // Create two entities
      const alice = await createTestEntityForInbox('alice-sender');
      const bob = await createTestEntityForInbox('bob-recipient');
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;

      // Create a direct channel
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create and send message
      const contentDoc = await createContentDoc('Test message', aliceId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      await api.create(toCreateInput(message));

      // Sender (alice) should not have inbox item
      const aliceInbox = inboxService.getInbox(aliceId);
      expect(aliceInbox.length).toBe(0);
    });
  });

  describe('@Mention Processing', () => {
    it('creates inbox item with mention source type for @mentioned entity', async () => {
      // Create entities
      const alice = await createTestEntityForInbox('alice-mention');
      const bob = await createTestEntityForInbox('bob-mention');
      const charlie = await createTestEntityForInbox('charlie-mention');
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;
      const charlieId = charlie.id as unknown as EntityId;

      // Create a direct channel between alice and bob
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create a message that @mentions charlie
      const contentDoc = await createContentDoc('Hey @charlie-mention check this out!', aliceId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      await api.create(toCreateInput(message));

      // Charlie should have an inbox item from the mention
      const charlieInbox = inboxService.getInbox(charlieId);
      expect(charlieInbox.length).toBe(1);
      expect(charlieInbox[0].sourceType).toBe(InboxSourceType.MENTION);

      // Bob should have inbox item from direct message
      const bobInbox = inboxService.getInbox(bobId);
      expect(bobInbox.length).toBe(1);
      expect(bobInbox[0].sourceType).toBe(InboxSourceType.DIRECT);
    });

    it('creates mentions dependency for @mentioned entity', async () => {
      // Create entities
      const alice = await createTestEntityForInbox('alice-dep');
      const bob = await createTestEntityForInbox('bob-dep');
      const charlieId = (await createTestEntityForInbox('charlie-dep')).id;
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;

      // Create a direct channel
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create a message mentioning charlie
      const contentDoc = await createContentDoc('Cc @charlie-dep for review', aliceId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      const createdMessage = await api.create(toCreateInput(message));

      // Check that a mentions dependency was created
      const deps = await api.getDependencies(createdMessage.id);
      const mentionDep = deps.find(d => d.type === 'mentions' && d.blockerId === charlieId);
      expect(mentionDep).toBeDefined();
      expect(mentionDep?.blockedId).toBe(createdMessage.id);
    });

    it('does not create inbox for self-mention', async () => {
      // Create entities
      const alice = await createTestEntityForInbox('alice-self');
      const bob = await createTestEntityForInbox('bob-self');
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;

      // Create a direct channel
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Alice mentions herself in the message
      const contentDoc = await createContentDoc('I @alice-self did this', aliceId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      await api.create(toCreateInput(message));

      // Alice should NOT have an inbox item (can't inbox yourself)
      const aliceInbox = inboxService.getInbox(aliceId);
      expect(aliceInbox.length).toBe(0);
    });

    it('handles multiple @mentions in same message', async () => {
      // Create entities
      const alice = await createTestEntityForInbox('alice-multi');
      const bob = await createTestEntityForInbox('bob-multi');
      const charlie = await createTestEntityForInbox('charlie-multi');
      const david = await createTestEntityForInbox('david-multi');
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;
      const charlieId = charlie.id as unknown as EntityId;
      const davidId = david.id as unknown as EntityId;

      // Create a direct channel between alice and bob
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Message mentioning both charlie and david
      const contentDoc = await createContentDoc('@charlie-multi @david-multi please review', aliceId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      await api.create(toCreateInput(message));

      // Both charlie and david should have inbox items
      const charlieInbox = inboxService.getInbox(charlieId);
      expect(charlieInbox.length).toBe(1);
      expect(charlieInbox[0].sourceType).toBe(InboxSourceType.MENTION);

      const davidInbox = inboxService.getInbox(davidId);
      expect(davidInbox.length).toBe(1);
      expect(davidInbox[0].sourceType).toBe(InboxSourceType.MENTION);
    });

    it('ignores invalid @mentions (non-existent entities)', async () => {
      // Create entities
      const alice = await createTestEntityForInbox('alice-invalid');
      const bob = await createTestEntityForInbox('bob-invalid');
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;

      // Create a direct channel
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Message with invalid mention
      const contentDoc = await createContentDoc('@nonexistent-entity please help', aliceId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      const createdMessage = await api.create(toCreateInput(message));

      // No mentions dependency should be created for non-existent entity
      const deps = await api.getDependencies(createdMessage.id);
      const mentionDeps = deps.filter(d => d.type === 'mentions');
      expect(mentionDeps.length).toBe(0);
    });
  });

  describe('suppressInbox metadata flag', () => {
    it('does not create inbox item for direct channel messages with suppressInbox: true', async () => {
      // Create two entities (simulates operator and agent)
      const operator = await createTestEntityForInbox('operator-suppress');
      const agent = await createTestEntityForInbox('agent-suppress');
      const operatorId = operator.id as unknown as EntityId;
      const agentId = agent.id as unknown as EntityId;

      // Create a direct channel between operator and agent
      const channel = await createDirectChannel({
        entityA: operatorId,
        entityB: agentId,
        createdBy: operatorId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create a message with suppressInbox metadata (like dispatch notifications)
      const contentDoc = await createContentDoc('Task assigned: Some Task', agentId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: agentId,
        contentRef: contentDoc.id as any,
        metadata: { type: 'task-assignment', suppressInbox: true },
      });
      await api.create(toCreateInput(message));

      // Operator should NOT have an inbox item (suppressed)
      const operatorInbox = inboxService.getInbox(operatorId);
      expect(operatorInbox.length).toBe(0);

      // Agent should also NOT have an inbox item (they are the sender)
      const agentInbox = inboxService.getInbox(agentId);
      expect(agentInbox.length).toBe(0);
    });

    it('does not create inbox items for @mentions with suppressInbox: true', async () => {
      // Create entities
      const sender = await createTestEntityForInbox('sender-suppress');
      const receiver = await createTestEntityForInbox('receiver-suppress');
      const mentioned = await createTestEntityForInbox('mentioned-suppress');
      const senderId = sender.id as unknown as EntityId;
      const receiverId = receiver.id as unknown as EntityId;
      const mentionedId = mentioned.id as unknown as EntityId;

      // Create a direct channel
      const channel = await createDirectChannel({
        entityA: senderId,
        entityB: receiverId,
        createdBy: senderId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create a message that @mentions someone, with suppressInbox
      const contentDoc = await createContentDoc('Hey @mentioned-suppress check this', senderId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: senderId,
        contentRef: contentDoc.id as any,
        metadata: { suppressInbox: true },
      });
      await api.create(toCreateInput(message));

      // Neither receiver nor mentioned should have inbox items
      const receiverInbox = inboxService.getInbox(receiverId);
      expect(receiverInbox.length).toBe(0);

      const mentionedInbox = inboxService.getInbox(mentionedId);
      expect(mentionedInbox.length).toBe(0);
    });

    it('still creates inbox items when suppressInbox is not set', async () => {
      // Create two entities
      const alice = await createTestEntityForInbox('alice-no-suppress');
      const bob = await createTestEntityForInbox('bob-no-suppress');
      const aliceId = alice.id as unknown as EntityId;
      const bobId = bob.id as unknown as EntityId;

      // Create a direct channel
      const channel = await createDirectChannel({
        entityA: aliceId,
        entityB: bobId,
        createdBy: aliceId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create a message WITHOUT suppressInbox
      const contentDoc = await createContentDoc('Normal message', aliceId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: aliceId,
        contentRef: contentDoc.id as any,
      });
      await api.create(toCreateInput(message));

      // Bob should have an inbox item (normal behavior)
      const bobInbox = inboxService.getInbox(bobId);
      expect(bobInbox.length).toBe(1);
      expect(bobInbox[0].sourceType).toBe(InboxSourceType.DIRECT);
    });

    it('still creates mentions dependencies even with suppressInbox: true', async () => {
      // Create entities
      const sender = await createTestEntityForInbox('sender-dep-suppress');
      const receiver = await createTestEntityForInbox('receiver-dep-suppress');
      const mentioned = await createTestEntityForInbox('mentioned-dep-suppress');
      const senderId = sender.id as unknown as EntityId;
      const receiverId = receiver.id as unknown as EntityId;

      // Create a direct channel
      const channel = await createDirectChannel({
        entityA: senderId,
        entityB: receiverId,
        createdBy: senderId,
      });
      const createdChannel = await api.create(toCreateInput(channel));

      // Create a message with @mention and suppressInbox
      const contentDoc = await createContentDoc('@mentioned-dep-suppress check this', senderId);
      const message = await createMessage({
        channelId: createdChannel.id as any,
        sender: senderId,
        contentRef: contentDoc.id as any,
        metadata: { suppressInbox: true },
      });
      const createdMessage = await api.create(toCreateInput(message));

      // Mentions dependency should still be created (not inbox-related)
      const deps = await api.getDependencies(createdMessage.id);
      const mentionDeps = deps.filter(d => d.type === 'mentions');
      expect(mentionDeps.length).toBe(1);
      expect(mentionDeps[0].blockerId).toBe(mentioned.id);
    });
  });
});

// ============================================================================
// FTS5 Search Integration Tests
// ============================================================================

describe('FTS5 Search', () => {
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

  it('should find documents matching content', async () => {
    const doc = await createTestDocument({ content: 'The quick brown fox jumps over the lazy dog', contentType: ContentType.MARKDOWN });
    const created = await api.create(toCreateInput(doc));

    const results = await api.searchDocumentsFTS('fox');

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.document.id === created.id)).toBe(true);
  });

  it('should return empty for no matches', async () => {
    const doc = await createTestDocument({ content: 'Hello world document', contentType: ContentType.MARKDOWN });
    await api.create(toCreateInput(doc));

    const results = await api.searchDocumentsFTS('xylophone');

    expect(results).toEqual([]);
  });

  it('should exclude archived docs by default (active status filter)', async () => {
    const doc = await createTestDocument({ content: 'archivable content here', contentType: ContentType.MARKDOWN });
    const created = await api.create(toCreateInput(doc));

    await api.update(created.id, { status: 'archived' });

    const results = await api.searchDocumentsFTS('archivable');

    expect(results).toEqual([]);
  });

  it('should return archived docs with explicit status filter', async () => {
    const doc = await createTestDocument({ content: 'archivable content here', contentType: ContentType.MARKDOWN });
    const created = await api.create(toCreateInput(doc));

    await api.update(created.id, { status: 'archived' });

    const results = await api.searchDocumentsFTS('archivable', { status: 'archived' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.document.id === created.id)).toBe(true);
  });

  it('should filter by category', async () => {
    const specDoc = await createTestDocument({ content: 'specification details for filtering', contentType: ContentType.MARKDOWN, category: 'spec' });
    const prdDoc = await createTestDocument({ content: 'product requirements details for filtering', contentType: ContentType.MARKDOWN, category: 'prd' });
    const createdSpec = await api.create(toCreateInput(specDoc));
    await api.create(toCreateInput(prdDoc));

    const results = await api.searchDocumentsFTS('details', { category: 'spec' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every(r => r.document.id === createdSpec.id)).toBe(true);
  });

  it('should find document in FTS index immediately after create', async () => {
    const doc = await createTestDocument({ content: 'uniqueword123 in this document', contentType: ContentType.MARKDOWN });
    await api.create(toCreateInput(doc));

    const results = await api.searchDocumentsFTS('uniqueword123');

    expect(results.length).toBe(1);
  });

  it('should update FTS index when document content is updated', async () => {
    const doc = await createTestDocument({ content: 'originalcontent placeholder', contentType: ContentType.MARKDOWN });
    const created = await api.create(toCreateInput(doc));

    await api.update(created.id, { content: 'replacementcontent placeholder' });

    const newResults = await api.searchDocumentsFTS('replacementcontent');
    expect(newResults.length).toBeGreaterThanOrEqual(1);
    expect(newResults.some(r => r.document.id === created.id)).toBe(true);

    const oldResults = await api.searchDocumentsFTS('originalcontent');
    expect(oldResults).toEqual([]);
  });

  it('should remove FTS index entry when document is deleted', async () => {
    const doc = await createTestDocument({ content: 'deletablesearchterm in doc', contentType: ContentType.MARKDOWN });
    const created = await api.create(toCreateInput(doc));

    await api.delete(created.id);

    const results = await api.searchDocumentsFTS('deletablesearchterm');
    expect(results).toEqual([]);
  });

  it('should throw StorageError when FTS table is unavailable', async () => {
    const limitedBackend = createStorage({ path: ':memory:' });
    const { MIGRATIONS } = await import('@stoneforge/storage');
    for (const migration of MIGRATIONS.filter(m => m.version <= 6)) {
      limitedBackend.exec(migration.up);
      limitedBackend.setSchemaVersion(migration.version);
    }
    const limitedApi = new QuarryAPIImpl(limitedBackend);

    expect(() => limitedApi.searchDocumentsFTS('test')).toThrow(StorageError);

    limitedBackend.close();
  });
});

// ============================================================================
// Document Filtering Integration Tests
// ============================================================================

describe('Document Filtering', () => {
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

  it('should filter documents by category', async () => {
    const specDoc = await createTestDocument({ content: 'Spec document', contentType: ContentType.MARKDOWN, category: 'spec' });
    const prdDoc = await createTestDocument({ content: 'PRD document', contentType: ContentType.MARKDOWN, category: 'prd' });
    await api.create(toCreateInput(specDoc));
    await api.create(toCreateInput(prdDoc));

    const results = await api.list({ type: 'document', category: 'spec' });

    expect(results.length).toBe(1);
    expect((results[0] as any).category).toBe('spec');
  });

  it('should filter documents by status', async () => {
    const doc1 = await createTestDocument({ content: 'Active document', contentType: ContentType.MARKDOWN });
    const doc2 = await createTestDocument({ content: 'To be archived document', contentType: ContentType.MARKDOWN });
    await api.create(toCreateInput(doc1));
    const created2 = await api.create(toCreateInput(doc2));

    await api.update(created2.id, { status: 'archived' });

    const archivedResults = await api.list({ type: 'document', status: 'archived' });

    expect(archivedResults.length).toBe(1);
    expect(archivedResults[0].id).toBe(created2.id);
  });

  it('should default to active-only for documents', async () => {
    const activeDoc = await createTestDocument({ content: 'Active doc content', contentType: ContentType.MARKDOWN });
    const archivedDoc = await createTestDocument({ content: 'Archived doc content', contentType: ContentType.MARKDOWN });
    const createdActive = await api.create(toCreateInput(activeDoc));
    const createdArchived = await api.create(toCreateInput(archivedDoc));

    await api.update(createdArchived.id, { status: 'archived' });

    const results = await api.list({ type: 'document' });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe(createdActive.id);
  });

  it('should archive a document via archiveDocument convenience method', async () => {
    const doc = await createTestDocument({ content: 'Document to archive', contentType: ContentType.MARKDOWN });
    const created = await api.create(toCreateInput(doc));

    const archived = await api.archiveDocument(created.id);

    expect((archived as any).status).toBe('archived');
  });

  it('should unarchive a document via unarchiveDocument convenience method', async () => {
    const doc = await createTestDocument({ content: 'Document to unarchive', contentType: ContentType.MARKDOWN });
    const created = await api.create(toCreateInput(doc));

    await api.archiveDocument(created.id);
    const unarchived = await api.unarchiveDocument(created.id);

    expect((unarchived as any).status).toBe('active');
  });

  it('should throw NotFoundError when archiving non-existent document', async () => {
    expect(() => api.archiveDocument('nonexistent-id' as any)).toThrow(NotFoundError);
  });

  it('should throw NotFoundError when archiving a non-document element', async () => {
    const task = await createTestTask({ title: 'A task not a document' });
    const createdTask = await api.create(toCreateInput(task));

    expect(() => api.archiveDocument(createdTask.id)).toThrow(NotFoundError);
  });
});

// ============================================================================
// Document Version Control Tests
// ============================================================================

describe('document version control', () => {
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
  // Metadata-only updates must NOT increment version
  // --------------------------------------------------------------------------

  it('should not increment version when updating tags only', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    const updated = await api.update(created.id, { tags: ['new-tag'] });

    expect((updated as any).version).toBe(1);
  });

  it('should not increment version when updating category only', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    const updated = await api.update(created.id, { category: 'spec' });

    expect((updated as any).version).toBe(1);
  });

  it('should not increment version when archiving', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    const updated = await api.update(created.id, { status: 'archived' });

    expect((updated as any).version).toBe(1);
  });

  it('should not increment version when updating metadata only', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    const updated = await api.update(created.id, { metadata: { foo: 'bar' } });

    expect((updated as any).version).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Content changes MUST increment version
  // --------------------------------------------------------------------------

  it('should increment version when updating content', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    const updated = await api.update(created.id, { content: 'Updated content' });

    expect((updated as any).version).toBe(2);

    // Verify history has v1 entry
    const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
    const versions = history.map((h) => h.version);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
  });

  it('should increment version when updating contentType only', async () => {
    const doc = await createTestDocument({ contentType: ContentType.TEXT, content: 'plain text' });
    const created = await api.create(toCreateInput(doc));

    // First content update: version 1 → 2
    const updated1 = await api.update(created.id, { content: 'updated text' });
    expect((updated1 as any).version).toBe(2);

    // ContentType update: version 2 → 3
    const updated2 = await api.update(created.id, { contentType: ContentType.MARKDOWN });
    expect((updated2 as any).version).toBe(3);
  });

  // --------------------------------------------------------------------------
  // Archive/unarchive lifecycle events
  // --------------------------------------------------------------------------

  it('should emit CLOSED event when archiving a document', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    await api.update(created.id, { status: 'archived' });

    const closedEvents = await api.getEvents(created.id, { eventType: 'closed' });
    expect(closedEvents.length).toBe(1);
  });

  it('should emit REOPENED event when unarchiving a document', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    await api.update(created.id, { status: 'archived' });
    await api.update(created.id, { status: 'active' });

    const reopenedEvents = await api.getEvents(created.id, { eventType: 'reopened' });
    expect(reopenedEvents.length).toBe(1);
  });
});

// ============================================================================
// Document System Audit Fixes
// ============================================================================

describe('document system audit fixes', () => {
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

  // 4A: Delete cascade cleans up document_versions
  it('should delete document_versions when document is deleted', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    // Two content updates → creates v1, v2 in document_versions
    await api.update<Document>(created.id, { content: 'Update 1' });
    await api.update<Document>(created.id, { content: 'Update 2' });

    const versionsBefore = backend.query<{ id: string }>(
      'SELECT id FROM document_versions WHERE id = ?',
      [created.id]
    );
    expect(versionsBefore.length).toBe(2);

    // Delete the document
    await api.delete(created.id);

    const versionsAfter = backend.query<{ id: string }>(
      'SELECT id FROM document_versions WHERE id = ?',
      [created.id]
    );
    expect(versionsAfter.length).toBe(0);
  });

  // 4B: getDocumentHistory returns no duplicates
  it('should return no duplicate versions in document history', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));

    // One content update: v1 saved to document_versions, current is v2
    await api.update<Document>(created.id, { content: 'Updated content' });

    const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
    const versions = history.map((h) => h.version);

    // Should have v2 (current) and v1 (historical), no duplicates
    expect(versions).toEqual([2, 1]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  // 4C: Clone preserves metadata and category
  it('should preserve metadata and category when cloning a document', async () => {
    const doc = await createTestDocument({
      metadata: { key: 'val' },
      category: 'spec' as any,
    });
    const created = await api.create(toCreateInput(doc));

    // Simulate clone: create new document using source's metadata and category
    const sourceDoc = await api.get(created.id) as Document;
    const cloneInput = await createDocument({
      contentType: sourceDoc.contentType,
      content: sourceDoc.content || '',
      createdBy: mockEntityId,
      title: `${sourceDoc.title} (Copy)`,
      tags: sourceDoc.tags || [],
      metadata: sourceDoc.metadata || {},
      category: sourceDoc.category,
    });
    const cloned = await api.create(toCreateInput(cloneInput)) as Document;

    expect(cloned.metadata).toEqual({ key: 'val' });
    expect(cloned.category).toBe('spec');
  });

  // 4D: Version snapshot includes title and category
  it('should include title and category in version snapshots', async () => {
    const doc = await createTestDocument({
      title: 'Original Title',
      category: 'spec' as any,
    });
    const created = await api.create(toCreateInput(doc));

    // Content update triggers version snapshot (now includes title/category per 1D)
    await api.update<Document>(created.id, { content: 'New content' });

    // Check the version snapshot stored in document_versions
    const rows = backend.query<{ data: string; version: number }>(
      'SELECT version, data FROM document_versions WHERE id = ? ORDER BY version ASC',
      [created.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].version).toBe(1);

    const snapshotData = JSON.parse(rows[0].data);
    expect(snapshotData.title).toBe('Original Title');
    expect(snapshotData.category).toBe('spec');
  });
});

// ============================================================================
// HIGH Priority Audit Fix Tests
// ============================================================================

describe('high priority audit fixes', () => {
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

  // T1: Delete cascade cleans up comments
  it('should delete comments when document is soft-deleted', async () => {
    const doc = await createTestDocument();
    const created = await api.create(toCreateInput(doc));
    const now = new Date().toISOString();

    // Create an entity for the author_id FK constraint
    backend.run(
      `INSERT INTO elements (id, type, data, content_hash, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['el-author-1', 'entity', JSON.stringify({ name: 'Test Author', entityType: 'user', status: 'active', metadata: {} }), 'hash000', now, now, mockEntityId]
    );

    // Insert a comment directly via SQL
    backend.run(
      `INSERT INTO comments (id, document_id, author_id, content, anchor, resolved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      ['cmt-test-1', created.id, 'el-author-1', 'Test comment', '{"hash":"abc","text":"anchor"}', now, now]
    );

    // Verify comment exists
    const before = backend.query<{ id: string }>('SELECT id FROM comments WHERE document_id = ?', [created.id]);
    expect(before.length).toBe(1);

    // Delete the document
    await api.delete(created.id, { actor: mockEntityId });

    // Verify comments are gone
    const after = backend.query<{ id: string }>('SELECT id FROM comments WHERE document_id = ?', [created.id]);
    expect(after.length).toBe(0);
  });

  // T2: FTS reindex preserves title
  it('should include title in FTS index after reindex', async () => {
    const doc = await createTestDocument({ title: 'Searchable Title' });
    await api.create(toCreateInput(doc));

    // Reindex all documents
    const result = api.reindexAllDocumentsFTS();
    expect(result.errors).toBe(0);
    expect(result.indexed).toBeGreaterThanOrEqual(1);

    // Query FTS table directly to verify title is indexed
    const ftsRows = backend.query<{ document_id: string; title: string }>(
      'SELECT document_id, title FROM documents_fts WHERE document_id = ?',
      [doc.id]
    );
    expect(ftsRows.length).toBe(1);
    expect(ftsRows[0].title).toBe('Searchable Title');
  });

  // T3: deserializeElement handles corrupt data gracefully
  it('should return null for elements with corrupt JSON data', async () => {
    const now = new Date().toISOString();

    // Insert a row with malformed JSON directly
    backend.run(
      `INSERT INTO elements (id, type, data, content_hash, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['el-corrupt-1', 'document', '{invalid json!!!', 'hash123', now, now, mockEntityId]
    );

    // api.get() should return null, not throw
    const result = await api.get('el-corrupt-1' as ElementId);
    expect(result).toBeNull();
  });

  // T4: Corrupt elements are filtered from list results
  it('should skip corrupt elements in list results', async () => {
    // Use entity type since it doesn't have JSON_EXTRACT-based default filters
    // (document type defaults to JSON_EXTRACT($.status)='active' which fails at SQLite level)
    const now = new Date().toISOString();

    // Insert a valid entity
    backend.run(
      `INSERT INTO elements (id, type, data, content_hash, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['el-valid-ent', 'entity', JSON.stringify({ name: 'Valid Entity', entityType: 'user', status: 'active', metadata: {} }), 'hash789', now, now, mockEntityId]
    );

    // Insert a corrupt entity
    backend.run(
      `INSERT INTO elements (id, type, data, content_hash, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['el-corrupt-2', 'entity', 'NOT_JSON', 'hash456', now, now, mockEntityId]
    );

    // List should include only the valid entity, not throw
    const results = await api.list({ type: 'entity' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('el-valid-ent');
  });
});

// ============================================================================
// MEDIUM Priority Audit Fix Tests
// ============================================================================

describe('medium priority audit fixes', () => {
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

  // M1: Version snapshot includes status and immutable
  it('should include status and immutable in version snapshots', async () => {
    const doc = await createTestDocument({
      title: 'Snapshot Test',
      status: 'archived' as any,
    });
    const created = await api.create(toCreateInput(doc));

    // Content update triggers version snapshot
    await api.update<Document>(created.id, { content: 'Updated content' });

    // Check the version snapshot stored in document_versions
    const rows = backend.query<{ data: string; version: number }>(
      'SELECT version, data FROM document_versions WHERE id = ? ORDER BY version ASC',
      [created.id]
    );
    expect(rows.length).toBe(1);

    const snapshotData = JSON.parse(rows[0].data);
    expect(snapshotData.status).toBe('archived');
    expect(snapshotData.immutable).toBe(false);
  });

  // M2: FTS search result documents have title
  it('should include title in FTS search results', async () => {
    const doc = await createTestDocument({
      title: 'Unique Searchable FTS Title',
      content: 'This document has unique searchable content for FTS test',
    });
    await api.create(toCreateInput(doc));

    const results = await api.searchDocumentsFTS('unique searchable');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].document.title).toBe('Unique Searchable FTS Title');
  });

  // M3: getDocumentVersion throws for non-document
  it('should throw ValidationError when getDocumentVersion called on non-document', async () => {
    const task = await createTestTask({ title: 'Not A Document' });
    const created = await api.create(toCreateInput(task));

    await expect(
      api.getDocumentVersion(created.id as unknown as DocumentId, 1)
    ).rejects.toThrow(ValidationError);
  });

  // M4: getDocumentVersion throws for tombstoned document
  it('should throw NotFoundError when getDocumentVersion called on deleted document', async () => {
    const doc = await createTestDocument({ title: 'To Be Deleted' });
    const created = await api.create(toCreateInput(doc));

    // Delete the document (soft-delete)
    await api.delete(created.id, { actor: mockEntityId });

    await expect(
      api.getDocumentVersion(created.id as unknown as DocumentId, 1)
    ).rejects.toThrow(NotFoundError);
  });

  // M5: getDocumentHistory excludes tombstoned current version
  it('should exclude tombstoned current version from document history', async () => {
    const doc = await createTestDocument({ title: 'History Test' });
    const created = await api.create(toCreateInput(doc));

    // Update content to create a v1 snapshot in document_versions
    await api.update<Document>(created.id, { content: 'Version 2 content' });

    // Manually tombstone the current version without cascade (api.delete removes version rows)
    const row = backend.queryOne<{ data: string }>('SELECT data FROM elements WHERE id = ?', [created.id]);
    const data = JSON.parse(row!.data);
    data.status = 'tombstone';
    data.deletedAt = new Date().toISOString();
    backend.run('UPDATE elements SET data = ?, deleted_at = ? WHERE id = ?', [JSON.stringify(data), data.deletedAt, created.id]);

    // History should contain only the v1 snapshot, not the tombstoned current version
    const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
    expect(history.length).toBe(1);
    expect(history[0].version).toBe(1);
  });

  // M6: getDocumentHistory returns empty for non-document
  it('should return empty array for getDocumentHistory on non-document', async () => {
    const task = await createTestTask({ title: 'Not A Document Either' });
    const created = await api.create(toCreateInput(task));

    const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
    expect(history).toEqual([]);
  });
});
