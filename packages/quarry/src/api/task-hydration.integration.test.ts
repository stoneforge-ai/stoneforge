/**
 * Task Hydration Integration Tests
 *
 * Tests for Document reference resolution (hydration) in tasks:
 * - Single task hydration via get()
 * - Batch task hydration via list()
 * - Hydration options (description)
 * - Edge cases (missing documents, partial hydration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { EntityId, Task, HydratedTask, Document, DocumentId, ElementId } from '@stoneforge/core';
import { createTask, createDocument, ContentType } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

function toCreateInput<T>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

async function createTestTask(
  overrides: Partial<Parameters<typeof createTask>[0]> = {}
): Promise<Task> {
  // Generate a unique ID using full UUID to avoid any collision issues
  const uniqueId = `el-${crypto.randomUUID()}` as ElementId;
  return createTask({
    id: uniqueId,
    title: 'Test Task',
    createdBy: mockEntityId,
    ...overrides,
  });
}

async function createTestDocument(
  overrides: Partial<Parameters<typeof createDocument>[0]> = {}
): Promise<Document> {
  // Generate explicit unique ID using full UUID to avoid any collision issues
  // (createDocument doesn't accept id param, so we override it after creation)
  const uniqueId = `el-${crypto.randomUUID()}` as ElementId;
  const doc = await createDocument({
    content: 'Test document content',
    contentType: ContentType.MARKDOWN,
    createdBy: mockEntityId,
    ...overrides,
  });
  // Override the hash-generated ID with our explicit unique ID
  (doc as unknown as { id: ElementId }).id = uniqueId;
  return doc;
}

// ============================================================================
// Tests
// ============================================================================

describe('Task Hydration', () => {
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
  // Single Task Hydration (get)
  // --------------------------------------------------------------------------

  describe('Single Task Hydration via get()', () => {
    it('should hydrate task description when requested', async () => {
      // Create description document
      const descDoc = await createTestDocument({
        content: '# Task Description\n\nThis is the full description.',
      });
      await api.create(toCreateInput(descDoc));

      // Create task with description ref
      const task = await createTestTask({
        title: 'Task with description',
        descriptionRef: descDoc.id as DocumentId,
      });
      await api.create(toCreateInput(task));

      // Get with hydration
      const hydrated = await api.get<HydratedTask>(task.id, {
        hydrate: { description: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.description).toBe('# Task Description\n\nThis is the full description.');
      expect(hydrated?.descriptionRef).toBe(descDoc.id);
    });

    it('should not hydrate when not requested', async () => {
      // Create document
      const descDoc = await createTestDocument({
        content: 'Should not appear',
      });
      await api.create(toCreateInput(descDoc));

      // Create task with ref
      const task = await createTestTask({
        descriptionRef: descDoc.id as DocumentId,
      });
      await api.create(toCreateInput(task));

      // Get without hydration
      const notHydrated = await api.get<HydratedTask>(task.id);
      expect(notHydrated?.description).toBeUndefined();

      // Get with empty hydration options
      const emptyHydrate = await api.get<HydratedTask>(task.id, {
        hydrate: {},
      });
      expect(emptyHydrate?.description).toBeUndefined();

      // Get with description: false
      const explicitFalse = await api.get<HydratedTask>(task.id, {
        hydrate: { description: false },
      });
      expect(explicitFalse?.description).toBeUndefined();
    });

    it('should handle missing document gracefully', async () => {
      // Create task with non-existent document ref
      const task = await createTestTask({
        descriptionRef: 'el-missing' as DocumentId,
      });
      await api.create(toCreateInput(task));

      // Get with hydration - should not throw
      const hydrated = await api.get<HydratedTask>(task.id, {
        hydrate: { description: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.description).toBeUndefined();
      expect(hydrated?.descriptionRef).toBe('el-missing');
    });

    it('should handle task without any refs', async () => {
      // Create task without refs
      const task = await createTestTask({
        title: 'Task without refs',
      });
      await api.create(toCreateInput(task));

      // Get with hydration - should not throw
      const hydrated = await api.get<HydratedTask>(task.id, {
        hydrate: { description: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.description).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Batch Task Hydration (list)
  // --------------------------------------------------------------------------

  describe('Batch Task Hydration via list()', () => {
    it('should hydrate multiple tasks with descriptions', async () => {
      // Create documents
      const doc1 = await createTestDocument({ content: 'Description 1' });
      const doc2 = await createTestDocument({ content: 'Description 2' });
      const doc3 = await createTestDocument({ content: 'Description 3' });
      await api.create(toCreateInput(doc1));
      await api.create(toCreateInput(doc2));
      await api.create(toCreateInput(doc3));

      // Create tasks with refs
      const task1 = await createTestTask({
        title: 'Task 1',
        descriptionRef: doc1.id as DocumentId,
      });
      const task2 = await createTestTask({
        title: 'Task 2',
        descriptionRef: doc2.id as DocumentId,
      });
      const task3 = await createTestTask({
        title: 'Task 3',
        descriptionRef: doc3.id as DocumentId,
      });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      // List with hydration
      const tasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      expect(tasks.length).toBe(3);
      const taskMap = new Map(tasks.map((t) => [t.title, t]));
      expect(taskMap.get('Task 1')?.description).toBe('Description 1');
      expect(taskMap.get('Task 2')?.description).toBe('Description 2');
      expect(taskMap.get('Task 3')?.description).toBe('Description 3');
    });

    it('should hydrate tasks with shared document refs efficiently', async () => {
      // Create a single shared document
      const sharedDoc = await createTestDocument({ content: 'Shared description' });
      await api.create(toCreateInput(sharedDoc));

      // Create multiple tasks with the same ref
      const task1 = await createTestTask({
        title: 'Task A',
        descriptionRef: sharedDoc.id as DocumentId,
      });
      const task2 = await createTestTask({
        title: 'Task B',
        descriptionRef: sharedDoc.id as DocumentId,
      });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // List with hydration
      const tasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      expect(tasks.length).toBe(2);
      // Both should have the same content
      expect(tasks[0].description).toBe('Shared description');
      expect(tasks[1].description).toBe('Shared description');
    });

    it('should hydrate tasks via listPaginated', async () => {
      // Create documents
      const doc1 = await createTestDocument({ content: 'Page 1 desc' });
      const doc2 = await createTestDocument({ content: 'Page 2 desc' });
      await api.create(toCreateInput(doc1));
      await api.create(toCreateInput(doc2));

      // Create tasks
      const task1 = await createTestTask({
        title: 'Page Task 1',
        descriptionRef: doc1.id as DocumentId,
      });
      const task2 = await createTestTask({
        title: 'Page Task 2',
        descriptionRef: doc2.id as DocumentId,
      });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // List paginated with hydration
      const result = await api.listPaginated<HydratedTask>({
        type: 'task',
        limit: 10,
        hydrate: { description: true },
      });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);

      const taskMap = new Map(result.items.map((t) => [t.title, t]));
      expect(taskMap.get('Page Task 1')?.description).toBe('Page 1 desc');
      expect(taskMap.get('Page Task 2')?.description).toBe('Page 2 desc');
    });

    it('should handle mixed tasks with and without refs', async () => {
      // Create document
      const doc = await createTestDocument({ content: 'Only one has this' });
      await api.create(toCreateInput(doc));

      // Create tasks - some with refs, some without
      const taskWithRef = await createTestTask({
        title: 'Has Ref',
        descriptionRef: doc.id as DocumentId,
      });
      const taskWithoutRef = await createTestTask({
        title: 'No Ref',
      });
      await api.create(toCreateInput(taskWithRef));
      await api.create(toCreateInput(taskWithoutRef));

      // List with hydration
      const tasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      expect(tasks.length).toBe(2);
      const taskMap = new Map(tasks.map((t) => [t.title, t]));
      expect(taskMap.get('Has Ref')?.description).toBe('Only one has this');
      expect(taskMap.get('No Ref')?.description).toBeUndefined();
    });

    it('should handle some missing documents gracefully', async () => {
      // Create one document
      const doc = await createTestDocument({ content: 'Exists' });
      await api.create(toCreateInput(doc));

      // Create tasks - one with valid ref, one with invalid
      const taskValid = await createTestTask({
        title: 'Valid Ref',
        descriptionRef: doc.id as DocumentId,
      });
      const taskInvalid = await createTestTask({
        title: 'Invalid Ref',
        descriptionRef: 'el-nonexistent' as DocumentId,
      });
      await api.create(toCreateInput(taskValid));
      await api.create(toCreateInput(taskInvalid));

      // List with hydration - should not throw
      const tasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      expect(tasks.length).toBe(2);
      const taskMap = new Map(tasks.map((t) => [t.title, t]));
      expect(taskMap.get('Valid Ref')?.description).toBe('Exists');
      expect(taskMap.get('Invalid Ref')?.description).toBeUndefined();
    });

    it('should not hydrate when not requested in list', async () => {
      // Create document
      const doc = await createTestDocument({ content: 'Should not appear' });
      await api.create(toCreateInput(doc));

      // Create task
      const task = await createTestTask({
        title: 'Task',
        descriptionRef: doc.id as DocumentId,
      });
      await api.create(toCreateInput(task));

      // List without hydration
      const tasks = await api.list<HydratedTask>({ type: 'task' });

      expect(tasks.length).toBe(1);
      expect(tasks[0].description).toBeUndefined();
    });

    it('should only hydrate tasks, not other element types', async () => {
      // Create document
      const contentDoc = await createTestDocument({ content: 'Some content' });
      await api.create(toCreateInput(contentDoc));

      // Create a task with ref
      const task = await createTestTask({
        title: 'Task',
        descriptionRef: contentDoc.id as DocumentId,
      });
      await api.create(toCreateInput(task));

      // Create another document (no descriptionRef, obviously)
      const anotherDoc = await createTestDocument({ content: 'Another doc' });
      await api.create(toCreateInput(anotherDoc));

      // List all elements with hydration - should not crash
      const elements = await api.list({
        hydrate: { description: true },
      });

      // Should have task + 2 documents
      expect(elements.length).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty task list gracefully', async () => {
      // List with hydration when no tasks exist
      const tasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      expect(tasks).toEqual([]);
    });

    it('should handle large batch of tasks', async () => {
      // Create many documents and tasks
      const count = 50;
      const docs: Document[] = [];
      const tasks: Task[] = [];

      for (let i = 0; i < count; i++) {
        const doc = await createTestDocument({ content: `Content ${i}` });
        await api.create(toCreateInput(doc));
        docs.push(doc);

        const task = await createTestTask({
          title: `Task ${i}`,
          descriptionRef: doc.id as DocumentId,
        });
        await api.create(toCreateInput(task));
        tasks.push(task);
      }

      // List with hydration
      const hydratedTasks = await api.list<HydratedTask>({
        type: 'task',
        hydrate: { description: true },
      });

      expect(hydratedTasks.length).toBe(count);

      // Verify each task has correct hydrated content
      for (let i = 0; i < count; i++) {
        const task = hydratedTasks.find((t) => t.title === `Task ${i}`);
        expect(task?.description).toBe(`Content ${i}`);
      }
    });

    it('should preserve original task properties after hydration', async () => {
      // Create document
      const doc = await createTestDocument({ content: 'Description' });
      await api.create(toCreateInput(doc));

      // Create task with various properties
      const originalTask = await createTestTask({
        title: 'Complex Task',
        descriptionRef: doc.id as DocumentId,
        tags: ['important', 'urgent'],
        acceptanceCriteria: 'Must pass all tests',
      });
      await api.create(toCreateInput(originalTask));

      // Get with hydration
      const hydrated = await api.get<HydratedTask>(originalTask.id, {
        hydrate: { description: true },
      });

      // Verify hydration
      expect(hydrated?.description).toBe('Description');

      // Verify original properties are preserved
      expect(hydrated?.title).toBe('Complex Task');
      expect(hydrated?.tags).toEqual(['important', 'urgent']);
      expect(hydrated?.acceptanceCriteria).toBe('Must pass all tests');
      expect(hydrated?.descriptionRef).toBe(doc.id);
    });
  });
});
