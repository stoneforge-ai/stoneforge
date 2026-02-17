/**
 * Soft Identity Integration Tests
 *
 * Tests for the soft identity system integration with the QuarryAPI.
 * These tests verify that:
 * - Actor can be specified for update/delete operations
 * - Actor is properly recorded in events
 * - lookupEntityByName works correctly
 * - Actor falls back to element creator when not specified
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl, createQuarryAPI } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, EntityId, Task, Entity } from '@stoneforge/core';
import { createTask, TaskStatus, createEntity, EntityTypeValue } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_ACTOR = 'user:test-actor' as EntityId;
const ALT_ACTOR = 'user:alternate-actor' as EntityId;

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
    createdBy: TEST_ACTOR,
    ...overrides,
  });
}

/**
 * Create a test entity element
 */
async function createTestEntity(name: string, createdBy: EntityId = TEST_ACTOR): Promise<Entity> {
  return createEntity({
    name,
    entityType: EntityTypeValue.HUMAN,
    createdBy,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Soft Identity Integration', () => {
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
  // lookupEntityByName Tests
  // --------------------------------------------------------------------------

  describe('lookupEntityByName', () => {
    it('should find entity by name', async () => {
      const entity = await createTestEntity('alice');
      await api.create(toCreateInput(entity));

      const found = await api.lookupEntityByName('alice');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(entity.id);
      expect((found as Entity).name).toBe('alice');
      expect((found as Entity).entityType).toBe(EntityTypeValue.HUMAN);
    });

    it('should return null for non-existent entity', async () => {
      const found = await api.lookupEntityByName('nonexistent');
      expect(found).toBeNull();
    });

    it('should find correct entity among multiple', async () => {
      const alice = await createTestEntity('alice');
      const bob = await createTestEntity('bob');
      const charlie = await createTestEntity('charlie');

      await api.create(toCreateInput(alice));
      await api.create(toCreateInput(bob));
      await api.create(toCreateInput(charlie));

      const found = await api.lookupEntityByName('bob');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(bob.id);
      expect((found as Entity).name).toBe('bob');
    });

    it('should not find soft-deleted entities', async () => {
      const entity = await createTestEntity('deleted-user');
      await api.create(toCreateInput(entity));
      await api.delete(entity.id);

      const found = await api.lookupEntityByName('deleted-user');
      expect(found).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Entity Listing Tests
  // --------------------------------------------------------------------------

  describe('entity listing', () => {
    it('should list all entities', async () => {
      const alice = await createTestEntity('alice');
      const bob = await createTestEntity('bob');

      await api.create(toCreateInput(alice));
      await api.create(toCreateInput(bob));

      const entities = await api.list({ type: 'entity' });

      expect(entities.length).toBe(2);
      const names = entities.map((e) => (e as Entity).name).sort();
      expect(names).toEqual(['alice', 'bob']);
    });

    it('should not list soft-deleted entities', async () => {
      const alice = await createTestEntity('alice');
      const bob = await createTestEntity('bob');

      await api.create(toCreateInput(alice));
      await api.create(toCreateInput(bob));
      await api.delete(bob.id);

      const entities = await api.list({ type: 'entity' });

      expect(entities.length).toBe(1);
      expect((entities[0] as Entity).name).toBe('alice');
    });

    it('should return empty array when no entities exist', async () => {
      const entities = await api.list({ type: 'entity' });
      expect(entities).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Update with Actor Tests
  // --------------------------------------------------------------------------

  describe('update with actor parameter', () => {
    it('should use provided actor in event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { status: TaskStatus.IN_PROGRESS }, { actor: ALT_ACTOR });

      const events = await api.getEvents(task.id);
      const updateEvent = events.find((e) => e.eventType === 'updated');

      expect(updateEvent).toBeDefined();
      expect(updateEvent!.actor).toBe(ALT_ACTOR);
    });

    it('should fall back to element creator when no actor provided', async () => {
      const task = await createTestTask({ createdBy: TEST_ACTOR });
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { status: TaskStatus.IN_PROGRESS });

      const events = await api.getEvents(task.id);
      const updateEvent = events.find((e) => e.eventType === 'updated');

      expect(updateEvent).toBeDefined();
      expect(updateEvent!.actor).toBe(TEST_ACTOR);
    });

    it('should track multiple actors for multiple updates', async () => {
      const actor1 = 'user:actor-1' as EntityId;
      const actor2 = 'user:actor-2' as EntityId;
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { status: TaskStatus.IN_PROGRESS }, { actor: actor1 });
      await api.update<Task>(task.id, { status: TaskStatus.CLOSED }, { actor: actor2 });

      const events = await api.getEvents(task.id);
      // One update event (IN_PROGRESS) and one closed event (CLOSED)
      const updateEvents = events.filter((e) => e.eventType === 'updated');
      const closedEvents = events.filter((e) => e.eventType === 'closed');

      expect(updateEvents.length).toBe(1);
      expect(closedEvents.length).toBe(1);
      // Check both actors are present (order may vary)
      expect(updateEvents[0].actor).toBe(actor1);
      expect(closedEvents[0].actor).toBe(actor2);
    });
  });

  // --------------------------------------------------------------------------
  // Delete with Actor Tests
  // --------------------------------------------------------------------------

  describe('delete with actor parameter', () => {
    it('should use provided actor in event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id, { actor: ALT_ACTOR, reason: 'Test deletion' });

      const events = await api.getEvents(task.id);
      const deleteEvent = events.find((e) => e.eventType === 'deleted');

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.actor).toBe(ALT_ACTOR);
    });

    it('should fall back to element creator when no actor provided', async () => {
      const task = await createTestTask({ createdBy: TEST_ACTOR });
      await api.create(toCreateInput(task));

      await api.delete(task.id, { reason: 'No actor specified' });

      const events = await api.getEvents(task.id);
      const deleteEvent = events.find((e) => e.eventType === 'deleted');

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.actor).toBe(TEST_ACTOR);
    });

    it('should record reason in delete event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const deleteReason = 'No longer needed';
      await api.delete(task.id, { actor: ALT_ACTOR, reason: deleteReason });

      const events = await api.getEvents(task.id);
      const deleteEvent = events.find((e) => e.eventType === 'deleted');

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.newValue).toBeDefined();
      expect((deleteEvent!.newValue as Record<string, unknown>).reason).toBe(deleteReason);
    });

    it('should work with reason only (no actor)', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id, { reason: 'Just a reason' });

      const events = await api.getEvents(task.id);
      const deleteEvent = events.find((e) => e.eventType === 'deleted');

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.actor).toBe(TEST_ACTOR);
      expect((deleteEvent!.newValue as Record<string, unknown>).reason).toBe('Just a reason');
    });

    it('should work with actor only (no reason)', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id, { actor: ALT_ACTOR });

      const events = await api.getEvents(task.id);
      const deleteEvent = events.find((e) => e.eventType === 'deleted');

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.actor).toBe(ALT_ACTOR);
      expect(deleteEvent!.newValue).toBeNull();
    });

    it('should work with no options at all', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id);

      const events = await api.getEvents(task.id);
      const deleteEvent = events.find((e) => e.eventType === 'deleted');

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.actor).toBe(TEST_ACTOR);
    });
  });

  // --------------------------------------------------------------------------
  // addDependency with Actor Tests
  // --------------------------------------------------------------------------

  describe('addDependency with actor parameter', () => {
    it('should use provided actor in dependency and event', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      const dep = await api.addDependency({
        blockerId: task1.id,
        blockedId: task2.id,
        type: 'blocks',
        actor: ALT_ACTOR,
      });

      expect(dep.createdBy).toBe(ALT_ACTOR);

      const events = await api.getEvents(task2.id);
      const depEvent = events.find((e) => e.eventType === 'dependency_added');

      expect(depEvent).toBeDefined();
      expect(depEvent!.actor).toBe(ALT_ACTOR);
    });

    it('should fall back to blocked element creator when no actor provided', async () => {
      const task1 = await createTestTask({ title: 'Task 1', createdBy: TEST_ACTOR });
      const task2 = await createTestTask({ title: 'Task 2', createdBy: ALT_ACTOR });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      const dep = await api.addDependency({
        blockerId: task1.id,
        blockedId: task2.id,
        type: 'blocks',
      });

      // Falls back to blockedId element's creator (task2's creator)
      expect(dep.createdBy).toBe(ALT_ACTOR);
    });
  });

  // --------------------------------------------------------------------------
  // Event Query Tests
  // --------------------------------------------------------------------------

  describe('event queries with actor', () => {
    it('should filter events by actor', async () => {
      const actorA = 'user:actor-a' as EntityId;
      const actorB = 'user:actor-b' as EntityId;

      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { status: TaskStatus.IN_PROGRESS }, { actor: actorA });
      await api.update<Task>(task.id, { status: TaskStatus.CLOSED }, { actor: actorB });
      await api.update<Task>(task.id, { status: TaskStatus.IN_PROGRESS }, { actor: actorA });

      const actorAEvents = await api.getEvents(task.id, { actor: actorA });

      expect(actorAEvents.length).toBe(2);
      expect(actorAEvents.every((e) => e.actor === actorA)).toBe(true);

      const actorBEvents = await api.getEvents(task.id, { actor: actorB });

      expect(actorBEvents.length).toBe(1);
      expect(actorBEvents[0].actor).toBe(actorB);
    });
  });

  // --------------------------------------------------------------------------
  // Audit Trail Completeness Tests
  // --------------------------------------------------------------------------

  describe('audit trail completeness', () => {
    it('should record complete audit trail for element lifecycle', async () => {
      const creator = 'user:creator' as EntityId;
      const updater = 'user:updater' as EntityId;
      const deleter = 'user:deleter' as EntityId;

      const task = await createTestTask({ createdBy: creator });
      await api.create(toCreateInput(task));

      await api.update<Task>(
        task.id,
        { status: TaskStatus.IN_PROGRESS, tags: ['important'] },
        { actor: updater }
      );

      await api.delete(task.id, { actor: deleter, reason: 'Completed' });

      const events = await api.getEvents(task.id);

      expect(events.length).toBe(3);

      // Find events by type
      const createEvent = events.find((e) => e.eventType === 'created');
      const updateEvent = events.find((e) => e.eventType === 'updated');
      const deleteEvent = events.find((e) => e.eventType === 'deleted');

      expect(createEvent).toBeDefined();
      expect(createEvent!.actor).toBe(creator);

      expect(updateEvent).toBeDefined();
      expect(updateEvent!.actor).toBe(updater);

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.actor).toBe(deleter);
    });

    it('should capture value changes in events', async () => {
      const task = await createTestTask({ status: TaskStatus.OPEN });
      await api.create(toCreateInput(task));

      await api.update<Task>(
        task.id,
        { status: TaskStatus.IN_PROGRESS },
        { actor: ALT_ACTOR }
      );

      const events = await api.getEvents(task.id);
      const updateEvent = events.find((e) => e.eventType === 'updated');

      expect(updateEvent).toBeDefined();
      expect(updateEvent!.oldValue).toBeDefined();
      expect(updateEvent!.newValue).toBeDefined();
      expect((updateEvent!.oldValue as Record<string, unknown>).status).toBe(TaskStatus.OPEN);
      expect((updateEvent!.newValue as Record<string, unknown>).status).toBe(TaskStatus.IN_PROGRESS);
    });
  });

  // --------------------------------------------------------------------------
  // Entity Name Uniqueness Tests
  // --------------------------------------------------------------------------

  describe('entity name uniqueness', () => {
    it('should allow creating entity with unique name', async () => {
      const entity = await createTestEntity('unique-name');
      const created = await api.create(toCreateInput(entity));

      expect(created).toBeDefined();
      expect((created as Entity).name).toBe('unique-name');
    });

    it('should reject duplicate entity name', async () => {
      const entity1 = await createTestEntity('duplicate-name');
      await api.create(toCreateInput(entity1));

      const entity2 = await createTestEntity('duplicate-name');

      await expect(api.create(toCreateInput(entity2))).rejects.toMatchObject({
        code: 'DUPLICATE_NAME',
        message: expect.stringContaining('duplicate-name'),
      });
    });

    it('should include existing entity ID in error details', async () => {
      const entity1 = await createTestEntity('existing-name');
      await api.create(toCreateInput(entity1));

      const entity2 = await createTestEntity('existing-name');

      try {
        await api.create(toCreateInput(entity2));
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as { details?: { existingId?: string } }).details?.existingId).toBe(entity1.id);
      }
    });

    it('should allow same name for different element types', async () => {
      // Create an entity with name
      const entity = await createTestEntity('shared-name');
      await api.create(toCreateInput(entity));

      // Create a task - tasks don't have name field, but they have title
      // This test verifies name uniqueness only applies to entities
      const task = await createTestTask({ title: 'shared-name' });
      const created = await api.create(toCreateInput(task));

      expect(created).toBeDefined();
    });

    it('should allow reusing name after entity is soft-deleted', async () => {
      const entity1 = await createTestEntity('reusable-name');
      await api.create(toCreateInput(entity1));

      // Delete the entity
      await api.delete(entity1.id);

      // Create another entity with the same name
      const entity2 = await createTestEntity('reusable-name');
      const created = await api.create(toCreateInput(entity2));

      expect(created).toBeDefined();
      expect((created as Entity).name).toBe('reusable-name');
      expect(created.id).not.toBe(entity1.id);
    });

    it('should be case-sensitive for names', async () => {
      const entity1 = await createTestEntity('CaseSensitive');
      await api.create(toCreateInput(entity1));

      // Different case should be allowed
      const entity2 = await createTestEntity('casesensitive');
      const created = await api.create(toCreateInput(entity2));

      expect(created).toBeDefined();
      expect((created as Entity).name).toBe('casesensitive');
    });
  });
});
