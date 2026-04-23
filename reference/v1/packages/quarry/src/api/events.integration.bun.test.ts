/**
 * Events System Integration Tests
 *
 * Comprehensive tests for the events system covering:
 * - Event recording for CRUD operations
 * - Event queries by element, actor, time range, type
 * - Event filtering and pagination
 * - Old/new value capture and diff computation
 * - Event immutability
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { ElementId, EntityId, Timestamp, Task, Workflow } from '@stoneforge/core';
// Event and EventFilter types used implicitly via API methods
import { createTask, Priority, TaskStatus, createDocument, ContentType, EventType, computeChangedFields, createWorkflow, WorkflowStatus } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;
const mockEntityId2 = 'user:other-user' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
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
 * Create a test workflow element
 */
async function createTestWorkflow(overrides: Partial<Parameters<typeof createWorkflow>[0]> = {}): Promise<Workflow> {
  return createWorkflow({
    title: 'Test Workflow',
    createdBy: mockEntityId,
    ...overrides,
  });
}

/**
 * Create a small delay to ensure distinct timestamps
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Events System Integration', () => {
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
  // Event Recording Tests
  // --------------------------------------------------------------------------

  describe('Event Recording', () => {
    describe('Create Events', () => {
      it('should record a created event when creating an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        expect(events.length).toBe(1);
        expect(events[0].eventType).toBe(EventType.CREATED);
        expect(events[0].elementId).toBe(task.id);
        expect(events[0].actor).toBe(mockEntityId);
      });

      it('should store null oldValue for created events', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        expect(events[0].oldValue).toBeNull();
      });

      it('should store full element in newValue for created events', async () => {
        const task = await createTestTask({
          title: 'Specific Title',
          priority: Priority.HIGH,
          tags: ['urgent'],
        });
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        const newValue = events[0].newValue as Record<string, unknown>;
        expect(newValue).not.toBeNull();
        expect(newValue.title).toBe('Specific Title');
        expect(newValue.priority).toBe(Priority.HIGH);
      });

      it('should record events for different element types', async () => {
        const task = await createTestTask();
        const doc = await createDocument({
          contentType: ContentType.MARKDOWN,
          content: '# Test',
          createdBy: mockEntityId,
        });

        await api.create(toCreateInput(task));
        await api.create(toCreateInput(doc));

        const taskEvents = await api.getEvents(task.id);
        const docEvents = await api.getEvents(doc.id);

        expect(taskEvents[0].eventType).toBe(EventType.CREATED);
        expect(docEvents[0].eventType).toBe(EventType.CREATED);
      });
    });

    describe('Update Events', () => {
      it('should record an updated event when updating an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvents = events.filter((e) => e.eventType === EventType.UPDATED);
        expect(updateEvents.length).toBe(1);
      });

      it('should capture old and new values in update events', async () => {
        const task = await createTestTask({ title: 'Original Title' });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        expect(updateEvent).toBeDefined();
        const oldValue = updateEvent!.oldValue as Record<string, unknown>;
        const newValue = updateEvent!.newValue as Record<string, unknown>;

        expect(oldValue.title).toBe('Original Title');
        expect(newValue.title).toBe('New Title');
      });

      it('should record multiple update events for multiple updates', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 3' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvents = events.filter((e) => e.eventType === EventType.UPDATED);
        expect(updateEvents.length).toBe(3);
      });

      it('should track status changes', async () => {
        const task = await createTestTask({ status: TaskStatus.OPEN });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { status: TaskStatus.IN_PROGRESS } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        const oldValue = updateEvent!.oldValue as Record<string, unknown>;
        const newValue = updateEvent!.newValue as Record<string, unknown>;

        expect(oldValue.status).toBe(TaskStatus.OPEN);
        expect(newValue.status).toBe(TaskStatus.IN_PROGRESS);
      });

      it('should track tag changes', async () => {
        const task = await createTestTask({ tags: ['tag1', 'tag2'] });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { tags: ['tag1', 'tag3', 'tag4'] } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        expect(updateEvent).toBeDefined();
      });
    });

    describe('Delete Events', () => {
      it('should record a deleted event when deleting an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.delete(task.id);

        const events = await api.getEvents(task.id);
        const deleteEvents = events.filter((e) => e.eventType === EventType.DELETED);
        expect(deleteEvents.length).toBe(1);
      });

      it('should capture element state in oldValue for delete events', async () => {
        const task = await createTestTask({ title: 'Task to Delete' });
        await api.create(toCreateInput(task));

        await api.delete(task.id, { reason: 'No longer needed' });

        const events = await api.getEvents(task.id);
        const deleteEvent = events.find((e) => e.eventType === EventType.DELETED);

        expect(deleteEvent!.oldValue).not.toBeNull();
        const oldValue = deleteEvent!.oldValue as Record<string, unknown>;
        expect(oldValue.title).toBe('Task to Delete');
      });

      it('should include delete reason in newValue', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.delete(task.id, { reason: 'Duplicate task' });

        const events = await api.getEvents(task.id);
        const deleteEvent = events.find((e) => e.eventType === EventType.DELETED);

        const newValue = deleteEvent!.newValue as Record<string, unknown> | null;
        expect(newValue).not.toBeNull();
        expect(newValue!.reason).toBe('Duplicate task');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Event Query Tests
  // --------------------------------------------------------------------------

  describe('Event Queries', () => {
    describe('getEvents by Element', () => {
      it('should return all events for an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        expect(events.length).toBe(3);
      });

      it('should return events in descending order by default', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(5);
        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await delay(5);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const events = await api.getEvents(task.id);

        // Most recent first
        expect(events[0].eventType).toBe(EventType.UPDATED);
        expect(events[events.length - 1].eventType).toBe(EventType.CREATED);
      });

      it('should return empty array for element with no events', async () => {
        const events = await api.getEvents('el-nonexistent' as ElementId);
        expect(events).toEqual([]);
      });

      it('should only return events for the specified element', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        const task1Events = await api.getEvents(task1.id);
        const task2Events = await api.getEvents(task2.id);

        expect(task1Events.every((e) => e.elementId === task1.id)).toBe(true);
        expect(task2Events.every((e) => e.elementId === task2.id)).toBe(true);
      });
    });

    describe('Filter by Event Type', () => {
      it('should filter events by single event type', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const createEvents = await api.getEvents(task.id, { eventType: EventType.CREATED });
        const updateEvents = await api.getEvents(task.id, { eventType: EventType.UPDATED });

        expect(createEvents.length).toBe(1);
        expect(updateEvents.length).toBe(1);
        expect(createEvents[0].eventType).toBe(EventType.CREATED);
        expect(updateEvents[0].eventType).toBe(EventType.UPDATED);
      });

      it('should filter events by multiple event types', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);
        await api.delete(task.id);

        const lifecycleEvents = await api.getEvents(task.id, {
          eventType: [EventType.CREATED, EventType.UPDATED],
        });

        expect(lifecycleEvents.length).toBe(2);
        expect(lifecycleEvents.every((e) =>
          e.eventType === EventType.CREATED || e.eventType === EventType.UPDATED
        )).toBe(true);
      });
    });

    describe('Filter by Actor', () => {
      it('should filter events by actor', async () => {
        const task1 = await createTestTask({ createdBy: mockEntityId });
        const task2 = await createTestTask({ createdBy: mockEntityId2 });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        // Query by first actor
        const actor1Events = await api.getEvents(task1.id, { actor: mockEntityId });
        expect(actor1Events.length).toBe(1);
        expect(actor1Events[0].actor).toBe(mockEntityId);

        // Verify task2 event has different actor
        const task2Events = await api.getEvents(task2.id);
        expect(task2Events[0].actor).toBe(mockEntityId2);
      });
    });

    describe('Filter by Time Range', () => {
      it('should filter events after a timestamp', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const timestamp = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const recentEvents = await api.getEvents(task.id, { after: timestamp });

        // Should only get update event, not creation
        expect(recentEvents.length).toBe(1);
        expect(recentEvents[0].eventType).toBe(EventType.UPDATED);
      });

      it('should filter events before a timestamp', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(10);

        const timestamp = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const oldEvents = await api.getEvents(task.id, { before: timestamp });

        // Should only get creation event, not update
        expect(oldEvents.length).toBe(1);
        expect(oldEvents[0].eventType).toBe(EventType.CREATED);
      });

      it('should filter events within a time range', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(10);

        const afterTime = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await delay(10);

        const beforeTime = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const rangeEvents = await api.getEvents(task.id, {
          after: afterTime,
          before: beforeTime,
        });

        // Should only get the first update
        expect(rangeEvents.length).toBe(1);
      });
    });

    describe('Limit Results', () => {
      it('should limit the number of events returned', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 3' } as Partial<Task>);

        const limitedEvents = await api.getEvents(task.id, { limit: 2 });

        expect(limitedEvents.length).toBe(2);
      });

      it('should return all events if limit exceeds total', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id, { limit: 100 });

        expect(events.length).toBe(1);
      });
    });

    describe('Combined Filters', () => {
      it('should apply multiple filters together', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(10);

        const timestamp = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const filteredEvents = await api.getEvents(task.id, {
          eventType: EventType.UPDATED,
          after: timestamp,
          limit: 1,
        });

        expect(filteredEvents.length).toBe(1);
        expect(filteredEvents[0].eventType).toBe(EventType.UPDATED);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Event Value Capture Tests
  // --------------------------------------------------------------------------

  describe('Event Value Capture', () => {
    describe('Create Events', () => {
      it('should capture all element fields in newValue', async () => {
        const task = await createTestTask({
          title: 'Full Task',
          priority: Priority.CRITICAL,
          tags: ['urgent', 'important'],
          metadata: { customField: 'value' },
        });
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        const newValue = events[0].newValue as Record<string, unknown>;

        expect(newValue.title).toBe('Full Task');
        expect(newValue.priority).toBe(Priority.CRITICAL);
      });
    });

    describe('Update Events', () => {
      it('should capture changed fields accurately', async () => {
        const task = await createTestTask({
          title: 'Original',
          priority: Priority.LOW,
        });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, {
          title: 'Modified',
          priority: Priority.HIGH,
        } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        const oldValue = updateEvent!.oldValue as Record<string, unknown>;
        const newValue = updateEvent!.newValue as Record<string, unknown>;

        expect(oldValue.title).toBe('Original');
        expect(oldValue.priority).toBe(Priority.LOW);
        expect(newValue.title).toBe('Modified');
        expect(newValue.priority).toBe(Priority.HIGH);
      });

      it('should preserve updatedAt timestamp', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        const originalUpdatedAt = task.updatedAt;

        await delay(10);
        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        const newValue = updateEvent!.newValue as Record<string, unknown>;
        expect(newValue.updatedAt).not.toBe(originalUpdatedAt);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Event Ordering and Consistency Tests
  // --------------------------------------------------------------------------

  describe('Event Ordering', () => {
    it('should assign incrementing IDs to events', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
      await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const ids = events.map((e) => e.id).sort((a, b) => a - b);

      // IDs should be in ascending order
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });

    it('should maintain event order across multiple elements', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.update<Task>(task1.id, { title: 'Task 1 Updated' } as Partial<Task>);
      await api.update<Task>(task2.id, { title: 'Task 2 Updated' } as Partial<Task>);

      const events1 = await api.getEvents(task1.id);
      const events2 = await api.getEvents(task2.id);

      // All events should have unique IDs
      const allIds = [...events1, ...events2].map((e) => e.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });

  // --------------------------------------------------------------------------
  // Dependency Event Tests
  // --------------------------------------------------------------------------

  describe('Dependency Events', () => {
    describe('dependency_added Events', () => {
      it('should record a dependency_added event when adding a dependency', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        // Add dependency: task1 blocks task2 (task2 is blocked by task1)
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        // Query events on the blocked element (events are recorded on blockedId)
        const events = await api.getEvents(task2.id);
        const depAddedEvents = events.filter((e) => e.eventType === EventType.DEPENDENCY_ADDED);

        expect(depAddedEvents.length).toBe(1);
        expect(depAddedEvents[0].elementId).toBe(task2.id);
      });

      it('should capture dependency details in newValue', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
          metadata: { reason: 'depends on completion' },
        });

        const events = await api.getEvents(task2.id);
        const depAddedEvent = events.find((e) => e.eventType === EventType.DEPENDENCY_ADDED);

        expect(depAddedEvent).toBeDefined();
        expect(depAddedEvent!.oldValue).toBeNull();

        const newValue = depAddedEvent!.newValue as Record<string, unknown>;
        expect(newValue.blockerId).toBe(task1.id);
        expect(newValue.blockedId).toBe(task2.id);
        expect(newValue.type).toBe('blocks');
        expect(newValue.metadata).toEqual({ reason: 'depends on completion' });
      });

      it('should use dependency creator as the actor', async () => {
        const task1 = await createTestTask({ title: 'Task 1', createdBy: mockEntityId });
        const task2 = await createTestTask({ title: 'Task 2', createdBy: mockEntityId2 });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        const events = await api.getEvents(task2.id);
        const depAddedEvent = events.find((e) => e.eventType === EventType.DEPENDENCY_ADDED);

        // Actor should be the dependency's createdBy (which defaults to the blocked element's creator)
        expect(depAddedEvent!.actor).toBe(mockEntityId2);
      });

      it('should record events for different dependency types', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });
        const task3 = await createTestTask({ title: 'Task 3' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));
        await api.create(toCreateInput(task3));

        // task1 blocks task2 -> event recorded on task2
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        // task1 relates-to task3 -> event recorded on task1 (task1 is blockedId here)
        await api.addDependency({
          blockedId: task1.id,
          blockerId: task3.id,
          type: 'relates-to',
        });

        // task1 has one dependency_added event (the relates-to where task1 is blockedId)
        const task1Events = await api.getEvents(task1.id);
        const task1DepAddedEvents = task1Events.filter((e) => e.eventType === EventType.DEPENDENCY_ADDED);
        expect(task1DepAddedEvents.length).toBe(1);

        // task2 has one dependency_added event (the blocks where task2 is blockedId)
        const task2Events = await api.getEvents(task2.id);
        const task2DepAddedEvents = task2Events.filter((e) => e.eventType === EventType.DEPENDENCY_ADDED);
        expect(task2DepAddedEvents.length).toBe(1);
      });
    });

    describe('dependency_removed Events', () => {
      it('should record a dependency_removed event when removing a dependency', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        // Remove dependency: removeDependency(blockedId, blockerId, type)
        await api.removeDependency(task2.id, task1.id, 'blocks');

        const events = await api.getEvents(task2.id);
        const depRemovedEvents = events.filter((e) => e.eventType === EventType.DEPENDENCY_REMOVED);

        expect(depRemovedEvents.length).toBe(1);
        expect(depRemovedEvents[0].elementId).toBe(task2.id);
      });

      it('should capture dependency details in oldValue', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
          metadata: { reason: 'depends on completion' },
        });

        await api.removeDependency(task2.id, task1.id, 'blocks');

        const events = await api.getEvents(task2.id);
        const depRemovedEvent = events.find((e) => e.eventType === EventType.DEPENDENCY_REMOVED);

        expect(depRemovedEvent).toBeDefined();
        expect(depRemovedEvent!.newValue).toBeNull();

        const oldValue = depRemovedEvent!.oldValue as Record<string, unknown>;
        expect(oldValue.blockerId).toBe(task1.id);
        expect(oldValue.blockedId).toBe(task2.id);
        expect(oldValue.type).toBe('blocks');
        expect(oldValue.metadata).toEqual({ reason: 'depends on completion' });
      });

      it('should use provided actor when specified', async () => {
        const task1 = await createTestTask({ title: 'Task 1', createdBy: mockEntityId });
        const task2 = await createTestTask({ title: 'Task 2', createdBy: mockEntityId2 });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        // Remove with a different actor specified: removeDependency(blockedId, blockerId, type, actor)
        await api.removeDependency(task2.id, task1.id, 'blocks', mockEntityId);

        const events = await api.getEvents(task2.id);
        const depRemovedEvent = events.find((e) => e.eventType === EventType.DEPENDENCY_REMOVED);

        expect(depRemovedEvent!.actor).toBe(mockEntityId);
      });

      it('should fall back to dependency creator when no actor specified', async () => {
        const task1 = await createTestTask({ title: 'Task 1', createdBy: mockEntityId });
        const task2 = await createTestTask({ title: 'Task 2', createdBy: mockEntityId2 });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        // Remove without specifying actor: removeDependency(blockedId, blockerId, type)
        await api.removeDependency(task2.id, task1.id, 'blocks');

        const events = await api.getEvents(task2.id);
        const depRemovedEvent = events.find((e) => e.eventType === EventType.DEPENDENCY_REMOVED);

        // Should use the dependency creator (blocked element's creator, since addDependency defaults actor to source.createdBy)
        expect(depRemovedEvent!.actor).toBe(mockEntityId2);
      });
    });

    describe('Filtering Dependency Events', () => {
      it('should filter events by dependency_added type', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        // Update the blocked task
        await api.update<Task>(task2.id, { title: 'Updated Task 2' } as Partial<Task>);

        // Add dependency: task1 blocks task2 -> event recorded on task2
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        // Filter only dependency_added events on the blocked element
        const depEvents = await api.getEvents(task2.id, {
          eventType: EventType.DEPENDENCY_ADDED,
        });

        expect(depEvents.length).toBe(1);
        expect(depEvents[0].eventType).toBe(EventType.DEPENDENCY_ADDED);
      });

      it('should filter events by dependency_removed type', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        await api.removeDependency(task2.id, task1.id, 'blocks');

        // Filter only dependency_removed events on the blocked element
        const depEvents = await api.getEvents(task2.id, {
          eventType: EventType.DEPENDENCY_REMOVED,
        });

        expect(depEvents.length).toBe(1);
        expect(depEvents[0].eventType).toBe(EventType.DEPENDENCY_REMOVED);
      });

      it('should include dependency events in combined event type filter', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        await api.removeDependency(task2.id, task1.id, 'blocks');

        // Filter both dependency event types on the blocked element
        const depEvents = await api.getEvents(task2.id, {
          eventType: [EventType.DEPENDENCY_ADDED, EventType.DEPENDENCY_REMOVED],
        });

        expect(depEvents.length).toBe(2);
      });
    });

    describe('Dependency Event Ordering', () => {
      it('should maintain chronological order with other events', async () => {
        // task1 = blocker, task2 = blocked (task2 waits for task1 to close)
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await delay(5);
        // task1 blocks task2 (task2 waits for task1 to close)
        // dependency_added event is recorded on task2 (blockedId)
        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        await delay(5);
        await api.update<Task>(task2.id, { title: 'Updated Task 2' } as Partial<Task>);

        await delay(5);
        await api.removeDependency(task2.id, task1.id, 'blocks');

        // Check events on task2 (the blocked element) - it gets dependency_added, updated, dependency_removed, auto_blocked, auto_unblocked
        const task2Events = await api.getEvents(task2.id);
        const task2EventTypes = task2Events.map((e) => e.eventType);

        // Verify all expected event types are present on task2
        expect(task2EventTypes).toContain(EventType.CREATED);
        expect(task2EventTypes).toContain(EventType.DEPENDENCY_ADDED);
        expect(task2EventTypes).toContain(EventType.UPDATED);
        expect(task2EventTypes).toContain(EventType.DEPENDENCY_REMOVED);
        expect(task2EventTypes).toContain(EventType.AUTO_BLOCKED);
        expect(task2EventTypes).toContain(EventType.AUTO_UNBLOCKED);

        // Events should be in descending order (most recent first)
        // created should be last (oldest)
        expect(task2Events[task2Events.length - 1].eventType).toBe(EventType.CREATED);

        // updated should be in the middle (after created but before dependency_removed)
        const updatedIndex = task2EventTypes.indexOf(EventType.UPDATED);
        const createdIndex = task2EventTypes.indexOf(EventType.CREATED);
        expect(updatedIndex).toBeLessThan(createdIndex); // updated is more recent than created

        // dependency_removed should be most recent
        const depRemovedIndex = task2EventTypes.indexOf(EventType.DEPENDENCY_REMOVED);
        expect(depRemovedIndex).toBeLessThan(updatedIndex);

        // auto_unblocked should be more recent than auto_blocked
        const autoUnblockedIndex = task2EventTypes.indexOf(EventType.AUTO_UNBLOCKED);
        const autoBlockedIndex = task2EventTypes.indexOf(EventType.AUTO_BLOCKED);
        expect(autoUnblockedIndex).toBeLessThan(autoBlockedIndex); // unblocked is more recent than blocked
      });
    });

    describe('Transaction Atomicity', () => {
      it('should record dependency_added event atomically with dependency creation', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        // Both dependency and event should exist (getDependencies queries by blockedId)
        const deps = await api.getDependencies(task2.id, ['blocks']);
        const events = await api.getEvents(task2.id, { eventType: EventType.DEPENDENCY_ADDED });

        expect(deps.length).toBe(1);
        expect(events.length).toBe(1);
      });

      it('should record dependency_removed event atomically with dependency deletion', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        await api.addDependency({
          blockerId: task1.id,
          blockedId: task2.id,
          type: 'blocks',
        });

        await api.removeDependency(task2.id, task1.id, 'blocks');

        // Dependency should be gone but event should exist (getDependencies queries by blockedId)
        const deps = await api.getDependencies(task2.id, ['blocks']);
        const events = await api.getEvents(task2.id, { eventType: EventType.DEPENDENCY_REMOVED });

        expect(deps.length).toBe(0);
        expect(events.length).toBe(1);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Changed Fields Computation Tests
  // --------------------------------------------------------------------------

  describe('computeChangedFields', () => {
    it('should identify changed fields between old and new values', () => {
      const oldValue = { a: 1, b: 2, c: 3 };
      const newValue = { a: 1, b: 5, d: 4 };

      const changed = computeChangedFields(oldValue, newValue);

      expect(changed).toContain('b');
      expect(changed).toContain('c');
      expect(changed).toContain('d');
      expect(changed).not.toContain('a');
    });

    it('should return all fields when creating (oldValue is null)', () => {
      const newValue = { a: 1, b: 2 };
      const changed = computeChangedFields(null, newValue);

      expect(changed).toEqual(['a', 'b']);
    });

    it('should return all fields when deleting (newValue is null)', () => {
      const oldValue = { a: 1, b: 2 };
      const changed = computeChangedFields(oldValue, null);

      expect(changed).toEqual(['a', 'b']);
    });

    it('should return empty array when both values are null', () => {
      const changed = computeChangedFields(null, null);
      expect(changed).toEqual([]);
    });

    it('should handle nested object changes', () => {
      const oldValue = { config: { setting: 'old' } };
      const newValue = { config: { setting: 'new' } };

      const changed = computeChangedFields(oldValue, newValue);
      expect(changed).toContain('config');
    });
  });

  // --------------------------------------------------------------------------
  // Transaction and Atomicity Tests
  // --------------------------------------------------------------------------

  describe('Event Transaction Atomicity', () => {
    it('should record event atomically with element creation', async () => {
      const task = await createTestTask();

      // Create should succeed and event should exist
      await api.create(toCreateInput(task));

      const element = await api.get<Task>(task.id);
      const events = await api.getEvents(task.id);

      expect(element).not.toBeNull();
      expect(events.length).toBe(1);
    });

    it('should record event atomically with element update', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

      const element = await api.get<Task>(task.id);
      const events = await api.getEvents(task.id);

      expect(element?.title).toBe('Updated');
      expect(events.filter((e) => e.eventType === EventType.UPDATED).length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Index Performance Tests (Smoke Tests)
  // --------------------------------------------------------------------------

  describe('Index Performance', () => {
    it('should query by actor efficiently', async () => {
      // Create multiple elements with events
      for (let i = 0; i < 10; i++) {
        const task = await createTestTask({
          title: `Task ${i}`,
          createdBy: i % 2 === 0 ? mockEntityId : mockEntityId2,
        });
        await api.create(toCreateInput(task));
      }

      // Query by actor should be efficient due to idx_events_actor index
      const start = Date.now();
      const task = await createTestTask({ title: 'Query Test', createdBy: mockEntityId });
      await api.create(toCreateInput(task));
      const events = await api.getEvents(task.id, { actor: mockEntityId });
      const duration = Date.now() - start;

      expect(events.length).toBeGreaterThan(0);
      // Should complete quickly (< 100ms for a small dataset)
      expect(duration).toBeLessThan(100);
    });

    it('should query by event type efficiently', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      for (let i = 0; i < 10; i++) {
        await api.update<Task>(task.id, { title: `Update ${i}` } as Partial<Task>);
      }

      // Query by event type should be efficient due to idx_events_type index
      const start = Date.now();
      const events = await api.getEvents(task.id, { eventType: EventType.UPDATED });
      const duration = Date.now() - start;

      expect(events.length).toBe(10);
      // Should complete quickly (< 100ms for a small dataset)
      expect(duration).toBeLessThan(100);
    });
  });

  // --------------------------------------------------------------------------
  // Status Change Event Tests
  // --------------------------------------------------------------------------

  describe('Status Change Events', () => {
    it('should emit closed event when task status changes to closed', async () => {
      const task = await createTestTask({ status: 'open' });
      await api.create(toCreateInput(task));

      // Update task status to closed
      await api.update<Task>(task.id, { status: 'closed' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const closedEvent = events.find((e) => e.eventType === EventType.CLOSED);

      expect(closedEvent).toBeDefined();
      expect(closedEvent?.eventType).toBe(EventType.CLOSED);
      expect((closedEvent?.oldValue as Record<string, unknown>)?.status).toBe('open');
      expect((closedEvent?.newValue as Record<string, unknown>)?.status).toBe('closed');
    });

    it('should emit reopened event when task status changes from closed', async () => {
      const task = await createTestTask({ status: 'closed' });
      await api.create(toCreateInput(task));

      // Update task status to open (reopen)
      await api.update<Task>(task.id, { status: 'open' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const reopenedEvent = events.find((e) => e.eventType === EventType.REOPENED);

      expect(reopenedEvent).toBeDefined();
      expect(reopenedEvent?.eventType).toBe(EventType.REOPENED);
      expect((reopenedEvent?.oldValue as Record<string, unknown>)?.status).toBe('closed');
      expect((reopenedEvent?.newValue as Record<string, unknown>)?.status).toBe('open');
    });

    it('should emit updated event for non-closed status transitions', async () => {
      const task = await createTestTask({ status: 'open' });
      await api.create(toCreateInput(task));

      // Update task status to in_progress (not closed or from closed)
      await api.update<Task>(task.id, { status: 'in_progress' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const closedEvents = events.filter((e) => e.eventType === EventType.CLOSED);
      const reopenedEvents = events.filter((e) => e.eventType === EventType.REOPENED);
      const updatedEvents = events.filter((e) => e.eventType === EventType.UPDATED);

      expect(closedEvents.length).toBe(0);
      expect(reopenedEvents.length).toBe(0);
      expect(updatedEvents.length).toBe(1);
    });

    it('should emit updated event for non-status changes', async () => {
      const task = await createTestTask({ status: 'open', title: 'Original' });
      await api.create(toCreateInput(task));

      // Update task title without changing status
      await api.update<Task>(task.id, { title: 'Updated Title' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const closedEvents = events.filter((e) => e.eventType === EventType.CLOSED);
      const reopenedEvents = events.filter((e) => e.eventType === EventType.REOPENED);
      const updatedEvents = events.filter((e) => e.eventType === EventType.UPDATED);

      expect(closedEvents.length).toBe(0);
      expect(reopenedEvents.length).toBe(0);
      expect(updatedEvents.length).toBe(1);
    });

    it('should handle status change from deferred to closed', async () => {
      const task = await createTestTask({ status: 'deferred' });
      await api.create(toCreateInput(task));

      // Close deferred task
      await api.update<Task>(task.id, { status: 'closed' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const closedEvent = events.find((e) => e.eventType === EventType.CLOSED);

      expect(closedEvent).toBeDefined();
      expect((closedEvent?.oldValue as Record<string, unknown>)?.status).toBe('deferred');
    });

    it('should handle status change from closed to in_progress', async () => {
      const task = await createTestTask({ status: 'closed' });
      await api.create(toCreateInput(task));

      // Reopen to in_progress (valid transition per STATUS_TRANSITIONS is only open, but let's test the event)
      // Note: STATUS_TRANSITIONS allows closed -> open only, so this would be a status validation issue
      // For testing events, we're just checking event emission, not status validation
      await api.update<Task>(task.id, { status: 'open' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const reopenedEvent = events.find((e) => e.eventType === EventType.REOPENED);

      expect(reopenedEvent).toBeDefined();
    });

    it('should filter events by closed event type', async () => {
      const task = await createTestTask({ status: 'open' });
      await api.create(toCreateInput(task));

      // Create various events
      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);
      await api.update<Task>(task.id, { status: 'closed' } as Partial<Task>);

      const closedEvents = await api.getEvents(task.id, { eventType: EventType.CLOSED });

      expect(closedEvents.length).toBe(1);
      expect(closedEvents[0].eventType).toBe(EventType.CLOSED);
    });

    it('should filter events by reopened event type', async () => {
      const task = await createTestTask({ status: 'closed' });
      await api.create(toCreateInput(task));

      // Reopen and then make another update
      await api.update<Task>(task.id, { status: 'open' } as Partial<Task>);
      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

      const reopenedEvents = await api.getEvents(task.id, { eventType: EventType.REOPENED });

      expect(reopenedEvents.length).toBe(1);
      expect(reopenedEvents[0].eventType).toBe(EventType.REOPENED);
    });

    it('should include both closed and reopened in lifecycle event queries', async () => {
      const task = await createTestTask({ status: 'open' });
      await api.create(toCreateInput(task));

      // Close and then reopen
      await api.update<Task>(task.id, { status: 'closed' } as Partial<Task>);
      await api.update<Task>(task.id, { status: 'open' } as Partial<Task>);

      const lifecycleEvents = await api.getEvents(task.id, {
        eventType: [EventType.CLOSED, EventType.REOPENED],
      });

      expect(lifecycleEvents.length).toBe(2);
      expect(lifecycleEvents.some((e) => e.eventType === EventType.CLOSED)).toBe(true);
      expect(lifecycleEvents.some((e) => e.eventType === EventType.REOPENED)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Workflow Status Change Event Tests
  // --------------------------------------------------------------------------

  describe('Workflow Status Change Events', () => {
    it('should emit closed event when workflow status changes to completed', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
      await api.create(toCreateInput(workflow));

      // Update workflow status to completed
      await api.update<Workflow>(workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      const events = await api.getEvents(workflow.id);
      const closedEvent = events.find((e) => e.eventType === EventType.CLOSED);

      expect(closedEvent).toBeDefined();
      expect(closedEvent?.eventType).toBe(EventType.CLOSED);
      expect((closedEvent?.oldValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.RUNNING);
      expect((closedEvent?.newValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.COMPLETED);
    });

    it('should emit closed event when workflow status changes to failed', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
      await api.create(toCreateInput(workflow));

      // Update workflow status to failed
      await api.update<Workflow>(workflow.id, { status: WorkflowStatus.FAILED } as Partial<Workflow>);

      const events = await api.getEvents(workflow.id);
      const closedEvent = events.find((e) => e.eventType === EventType.CLOSED);

      expect(closedEvent).toBeDefined();
      expect(closedEvent?.eventType).toBe(EventType.CLOSED);
      expect((closedEvent?.oldValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.RUNNING);
      expect((closedEvent?.newValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.FAILED);
    });

    it('should emit closed event when workflow status changes to cancelled', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
      await api.create(toCreateInput(workflow));

      // Update workflow status to cancelled
      await api.update<Workflow>(workflow.id, { status: WorkflowStatus.CANCELLED } as Partial<Workflow>);

      const events = await api.getEvents(workflow.id);
      const closedEvent = events.find((e) => e.eventType === EventType.CLOSED);

      expect(closedEvent).toBeDefined();
      expect(closedEvent?.eventType).toBe(EventType.CLOSED);
      expect((closedEvent?.oldValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.RUNNING);
      expect((closedEvent?.newValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.CANCELLED);
    });

    it('should emit updated event for non-terminal status transitions (pending to running)', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.PENDING });
      await api.create(toCreateInput(workflow));

      // Update workflow status to running (not terminal)
      await api.update<Workflow>(workflow.id, { status: WorkflowStatus.RUNNING } as Partial<Workflow>);

      const events = await api.getEvents(workflow.id);
      const closedEvents = events.filter((e) => e.eventType === EventType.CLOSED);
      const reopenedEvents = events.filter((e) => e.eventType === EventType.REOPENED);
      const updatedEvents = events.filter((e) => e.eventType === EventType.UPDATED);

      expect(closedEvents.length).toBe(0);
      expect(reopenedEvents.length).toBe(0);
      expect(updatedEvents.length).toBe(1);
    });

    it('should emit updated event for non-status changes on workflow', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING, title: 'Original' });
      await api.create(toCreateInput(workflow));

      // Update workflow title without changing status
      await api.update<Workflow>(workflow.id, { title: 'Updated Title' } as Partial<Workflow>);

      const events = await api.getEvents(workflow.id);
      const closedEvents = events.filter((e) => e.eventType === EventType.CLOSED);
      const reopenedEvents = events.filter((e) => e.eventType === EventType.REOPENED);
      const updatedEvents = events.filter((e) => e.eventType === EventType.UPDATED);

      expect(closedEvents.length).toBe(0);
      expect(reopenedEvents.length).toBe(0);
      expect(updatedEvents.length).toBe(1);
    });

    it('should emit closed event when workflow transitions from pending directly to cancelled', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.PENDING });
      await api.create(toCreateInput(workflow));

      // Cancel the workflow (pending -> cancelled is a valid transition)
      await api.update<Workflow>(workflow.id, { status: WorkflowStatus.CANCELLED } as Partial<Workflow>);

      const events = await api.getEvents(workflow.id);
      const closedEvent = events.find((e) => e.eventType === EventType.CLOSED);

      expect(closedEvent).toBeDefined();
      expect((closedEvent?.oldValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.PENDING);
      expect((closedEvent?.newValue as Record<string, unknown>)?.status).toBe(WorkflowStatus.CANCELLED);
    });

    it('should filter events by closed event type for workflows', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
      await api.create(toCreateInput(workflow));

      // Create various events
      await api.update<Workflow>(workflow.id, { title: 'Updated' } as Partial<Workflow>);
      await api.update<Workflow>(workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      const closedEvents = await api.getEvents(workflow.id, { eventType: EventType.CLOSED });

      expect(closedEvents.length).toBe(1);
      expect(closedEvents[0].eventType).toBe(EventType.CLOSED);
    });
  });

  // --------------------------------------------------------------------------
  // Reconstruction Tests
  // --------------------------------------------------------------------------

  describe('State Reconstruction', () => {
    describe('reconstructAtTime', () => {
      it('should reconstruct state at specific point in time', async () => {
        const task = await createTestTask({ title: 'Initial Title', status: 'open' });
        await api.create(toCreateInput(task));

        // Wait for distinct timestamps
        await delay(10);

        // Get the timestamp before update
        const beforeUpdate = new Date().toISOString() as Timestamp;

        await delay(10);

        // Update the task
        await api.update<Task>(task.id, { title: 'Updated Title' } as Partial<Task>);

        // Reconstruct state at time before update
        const reconstructed = await api.reconstructAtTime<Task>(task.id, beforeUpdate);

        expect(reconstructed).not.toBeNull();
        expect(reconstructed!.exists).toBe(true);
        expect(reconstructed!.element.title).toBe('Initial Title');
        expect(reconstructed!.eventsApplied).toBe(1);
      });

      it('should return null for time before element existed', async () => {
        const beforeCreation = new Date().toISOString() as Timestamp;

        await delay(10);

        const task = await createTestTask({ title: 'Task' });
        await api.create(toCreateInput(task));

        const reconstructed = await api.reconstructAtTime<Task>(task.id, beforeCreation);

        expect(reconstructed).toBeNull();
      });

      it('should throw NotFoundError for non-existent element', async () => {
        const nonExistentId = 'el-nonexistent' as ElementId;
        const now = new Date().toISOString() as Timestamp;

        await expect(api.reconstructAtTime(nonExistentId, now)).rejects.toThrow(
          /No events found for element/
        );
      });

      it('should handle multiple updates correctly', async () => {
        const task = await createTestTask({ title: 'V1', status: 'open' });
        await api.create(toCreateInput(task));

        await delay(10);
        const afterV1 = new Date().toISOString() as Timestamp;

        await delay(10);
        await api.update<Task>(task.id, { title: 'V2' } as Partial<Task>);

        await delay(10);
        const afterV2 = new Date().toISOString() as Timestamp;

        await delay(10);
        await api.update<Task>(task.id, { title: 'V3' } as Partial<Task>);

        // Reconstruct at V1
        let reconstructed = await api.reconstructAtTime<Task>(task.id, afterV1);
        expect(reconstructed!.element.title).toBe('V1');

        // Reconstruct at V2
        reconstructed = await api.reconstructAtTime<Task>(task.id, afterV2);
        expect(reconstructed!.element.title).toBe('V2');
      });

      it('should handle deleted elements', async () => {
        const task = await createTestTask({ title: 'To Be Deleted' });
        await api.create(toCreateInput(task));

        await delay(10);
        const beforeDelete = new Date().toISOString() as Timestamp;

        await delay(10);
        await api.delete(task.id, { actor: mockEntityId });

        await delay(10);
        const afterDelete = new Date().toISOString() as Timestamp;

        // Before deletion - should exist
        const beforeState = await api.reconstructAtTime<Task>(task.id, beforeDelete);
        expect(beforeState).not.toBeNull();
        expect(beforeState!.exists).toBe(true);

        // After deletion - should not exist
        const afterState = await api.reconstructAtTime<Task>(task.id, afterDelete);
        expect(afterState).toBeNull();
      });
    });

    describe('getElementTimeline', () => {
      it('should generate timeline for element', async () => {
        const task = await createTestTask({ title: 'Initial' });
        await api.create(toCreateInput(task));

        await delay(5);
        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        await delay(5);
        await api.update<Task>(task.id, { status: 'closed' } as Partial<Task>);

        const timeline = await api.getElementTimeline(task.id);

        expect(timeline.elementId).toBe(task.id);
        expect(timeline.snapshots.length).toBeGreaterThanOrEqual(3);
        expect(timeline.totalEvents).toBeGreaterThanOrEqual(3);

        // First snapshot should be creation
        expect(timeline.snapshots[0].event.eventType).toBe(EventType.CREATED);
        expect(timeline.snapshots[0].state?.title).toBe('Initial');
        expect(timeline.snapshots[0].summary).toContain('Created by');
      });

      it('should throw NotFoundError for non-existent element', async () => {
        const nonExistentId = 'el-nonexistent' as ElementId;

        await expect(api.getElementTimeline(nonExistentId)).rejects.toThrow(
          /No events found for element/
        );
      });

      it('should filter timeline events by type', async () => {
        const task = await createTestTask({ title: 'Task' });
        await api.create(toCreateInput(task));

        await delay(5);
        await api.update<Task>(task.id, { title: 'Updated 1' } as Partial<Task>);

        await delay(5);
        await api.update<Task>(task.id, { title: 'Updated 2' } as Partial<Task>);

        // Get timeline with only update events
        const timeline = await api.getElementTimeline(task.id, {
          eventType: EventType.UPDATED,
        });

        // Should only have update events
        expect(timeline.snapshots.every((s) => s.event.eventType === EventType.UPDATED)).toBe(true);
        expect(timeline.snapshots.length).toBe(2);
      });

      it('should show current state in timeline', async () => {
        const task = await createTestTask({ title: 'Current' });
        await api.create(toCreateInput(task));

        const timeline = await api.getElementTimeline(task.id);

        expect(timeline.currentState).not.toBeNull();
        expect((timeline.currentState as Task).title).toBe('Current');
      });

      it('should show tombstone state for deleted elements', async () => {
        const task = await createTestTask({ title: 'To Delete' });
        await api.create(toCreateInput(task));

        await api.delete(task.id, { actor: mockEntityId });

        const timeline = await api.getElementTimeline(task.id);

        // Soft-deleted elements are returned as tombstone by get()
        expect(timeline.currentState).not.toBeNull();
        expect((timeline.currentState as Task).status).toBe('tombstone');
        expect(timeline.totalEvents).toBe(2); // created + deleted
      });

      it('should show state evolution in snapshots', async () => {
        const task = await createTestTask({ title: 'Start', priority: 1 });
        await api.create(toCreateInput(task));

        await delay(5);
        await api.update<Task>(task.id, { title: 'Middle', priority: 2 } as Partial<Task>);

        await delay(5);
        await api.update<Task>(task.id, { title: 'End', priority: 3 } as Partial<Task>);

        const timeline = await api.getElementTimeline(task.id);

        // Check state evolution
        expect(timeline.snapshots[0].state?.title).toBe('Start');
        expect(timeline.snapshots[0].state?.priority).toBe(1);

        // Find the update snapshots
        const updateSnapshots = timeline.snapshots.filter(
          (s) => s.event.eventType === EventType.UPDATED
        );
        expect(updateSnapshots.length).toBe(2);

        // Last snapshot should have final state
        const lastSnapshot = timeline.snapshots[timeline.snapshots.length - 1];
        expect(lastSnapshot.state?.title).toBe('End');
        expect(lastSnapshot.state?.priority).toBe(3);
      });
    });
  });
});
