/**
 * Plan Status Change Event Integration Tests
 *
 * Tests that Plan status transitions emit the correct events:
 * - draft → active: 'updated' event
 * - active → completed: 'closed' event
 * - active → cancelled: 'closed' event
 * - completed → active: 'reopened' event
 * - cancelled → draft: 'reopened' event
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, EntityId, Plan } from '@stoneforge/core';
import { createPlan, PlanStatus, EventType, LifecycleEventType } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

async function createTestPlan(overrides: Partial<Parameters<typeof createPlan>[0]> = {}): Promise<Plan> {
  return createPlan({
    title: 'Test Plan',
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Plan Status Change Events', () => {
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

  describe('Non-Terminal Status Transitions', () => {
    it('should emit updated event when transitioning from draft to active', async () => {
      const plan = await createTestPlan({ status: PlanStatus.DRAFT });
      await api.create(toCreateInput(plan));

      // Transition to active
      await api.update<Plan>(plan.id, { status: PlanStatus.ACTIVE } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const statusChangeEvent = events.find(
        (e) => e.eventType !== EventType.CREATED
      );

      expect(statusChangeEvent).toBeDefined();
      expect(statusChangeEvent?.eventType).toBe(LifecycleEventType.UPDATED);
    });
  });

  describe('Terminal Status Transitions (Completed)', () => {
    it('should emit closed event when transitioning from active to completed', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      // Transition to completed
      await api.update<Plan>(plan.id, { status: PlanStatus.COMPLETED } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const completedEvent = events.find(
        (e) => e.eventType === LifecycleEventType.CLOSED
      );

      expect(completedEvent).toBeDefined();
      expect(completedEvent?.eventType).toBe(LifecycleEventType.CLOSED);

      // Verify old and new values
      const oldValue = completedEvent?.oldValue as Record<string, unknown>;
      const newValue = completedEvent?.newValue as Record<string, unknown>;
      expect(oldValue?.status).toBe(PlanStatus.ACTIVE);
      expect(newValue?.status).toBe(PlanStatus.COMPLETED);
    });

    it('should emit reopened event when transitioning from completed to active', async () => {
      const plan = await createTestPlan({ status: PlanStatus.COMPLETED });
      await api.create(toCreateInput(plan));

      // Transition from completed to active (reopen)
      await api.update<Plan>(plan.id, { status: PlanStatus.ACTIVE } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const reopenedEvent = events.find(
        (e) => e.eventType === LifecycleEventType.REOPENED
      );

      expect(reopenedEvent).toBeDefined();
      expect(reopenedEvent?.eventType).toBe(LifecycleEventType.REOPENED);

      // Verify old and new values
      const oldValue = reopenedEvent?.oldValue as Record<string, unknown>;
      const newValue = reopenedEvent?.newValue as Record<string, unknown>;
      expect(oldValue?.status).toBe(PlanStatus.COMPLETED);
      expect(newValue?.status).toBe(PlanStatus.ACTIVE);
    });
  });

  describe('Terminal Status Transitions (Cancelled)', () => {
    it('should emit closed event when transitioning from draft to cancelled', async () => {
      const plan = await createTestPlan({ status: PlanStatus.DRAFT });
      await api.create(toCreateInput(plan));

      // Transition to cancelled
      await api.update<Plan>(plan.id, { status: PlanStatus.CANCELLED } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const cancelledEvent = events.find(
        (e) => e.eventType === LifecycleEventType.CLOSED
      );

      expect(cancelledEvent).toBeDefined();
      expect(cancelledEvent?.eventType).toBe(LifecycleEventType.CLOSED);
    });

    it('should emit closed event when transitioning from active to cancelled', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      // Transition to cancelled
      await api.update<Plan>(plan.id, { status: PlanStatus.CANCELLED } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const cancelledEvent = events.find(
        (e) => e.eventType === LifecycleEventType.CLOSED
      );

      expect(cancelledEvent).toBeDefined();
      expect(cancelledEvent?.eventType).toBe(LifecycleEventType.CLOSED);

      // Verify old and new values
      const oldValue = cancelledEvent?.oldValue as Record<string, unknown>;
      const newValue = cancelledEvent?.newValue as Record<string, unknown>;
      expect(oldValue?.status).toBe(PlanStatus.ACTIVE);
      expect(newValue?.status).toBe(PlanStatus.CANCELLED);
    });

    it('should emit reopened event when transitioning from cancelled to draft', async () => {
      const plan = await createTestPlan({ status: PlanStatus.CANCELLED });
      await api.create(toCreateInput(plan));

      // Transition from cancelled to draft (restart)
      await api.update<Plan>(plan.id, { status: PlanStatus.DRAFT } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const restartedEvent = events.find(
        (e) => e.eventType === LifecycleEventType.REOPENED
      );

      expect(restartedEvent).toBeDefined();
      expect(restartedEvent?.eventType).toBe(LifecycleEventType.REOPENED);

      // Verify old and new values
      const oldValue = restartedEvent?.oldValue as Record<string, unknown>;
      const newValue = restartedEvent?.newValue as Record<string, unknown>;
      expect(oldValue?.status).toBe(PlanStatus.CANCELLED);
      expect(newValue?.status).toBe(PlanStatus.DRAFT);
    });
  });

  describe('Event Actor Attribution', () => {
    it('should attribute events to the actor who made the change', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      // Update with explicit actor
      const actorId = 'user:manager' as EntityId;
      await api.update<Plan>(
        plan.id,
        { status: PlanStatus.COMPLETED } as Partial<Plan>,
        { actor: actorId }
      );

      const events = await api.getEvents(plan.id);
      const closedEvent = events.find(
        (e) => e.eventType === LifecycleEventType.CLOSED
      );

      expect(closedEvent?.actor).toBe(actorId);
    });

    it('should use plan creator as actor when not specified', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      // Update without explicit actor
      await api.update<Plan>(plan.id, { status: PlanStatus.COMPLETED } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const closedEvent = events.find(
        (e) => e.eventType === LifecycleEventType.CLOSED
      );

      expect(closedEvent?.actor).toBe(mockEntityId);
    });
  });

  describe('Event Sequence', () => {
    it('should record full lifecycle events in correct order', async () => {
      const plan = await createTestPlan({ status: PlanStatus.DRAFT });
      await api.create(toCreateInput(plan));

      // Go through lifecycle: draft → active → completed
      await api.update<Plan>(plan.id, { status: PlanStatus.ACTIVE } as Partial<Plan>);
      await api.update<Plan>(plan.id, { status: PlanStatus.COMPLETED } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const eventTypes = events.map((e) => e.eventType);

      // Verify all expected event types are present
      // Note: Order may vary for same-timestamp events, so we just verify presence
      expect(events).toHaveLength(3);
      expect(eventTypes).toContain(LifecycleEventType.CLOSED); // completed
      expect(eventTypes).toContain(LifecycleEventType.UPDATED); // active
      expect(eventTypes).toContain(EventType.CREATED); // created
    });

    it('should record cancel and restart lifecycle events', async () => {
      const plan = await createTestPlan({ status: PlanStatus.DRAFT });
      await api.create(toCreateInput(plan));

      // Go through lifecycle: draft → cancelled → draft (restart)
      await api.update<Plan>(plan.id, { status: PlanStatus.CANCELLED } as Partial<Plan>);
      await api.update<Plan>(plan.id, { status: PlanStatus.DRAFT } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const eventTypes = events.map((e) => e.eventType);

      // Verify all expected event types are present
      // Note: Order may vary for same-timestamp events, so we just verify presence
      expect(events).toHaveLength(3);
      expect(eventTypes).toContain(LifecycleEventType.REOPENED); // restart
      expect(eventTypes).toContain(LifecycleEventType.CLOSED); // cancelled
      expect(eventTypes).toContain(EventType.CREATED); // created
    });
  });

  describe('Non-Status Updates', () => {
    it('should emit updated event for non-status changes', async () => {
      const plan = await createTestPlan({ status: PlanStatus.ACTIVE });
      await api.create(toCreateInput(plan));

      // Update title (not status)
      await api.update<Plan>(plan.id, { title: 'New Title' } as Partial<Plan>);

      const events = await api.getEvents(plan.id);
      const updateEvent = events.find(
        (e) => e.eventType === LifecycleEventType.UPDATED
      );

      expect(updateEvent).toBeDefined();
      expect(updateEvent?.eventType).toBe(LifecycleEventType.UPDATED);

      // Verify title change is recorded
      const newValue = updateEvent?.newValue as Record<string, unknown>;
      expect(newValue?.title).toBe('New Title');
    });

    it('should emit updated event when updating title alongside status that is not terminal', async () => {
      const plan = await createTestPlan({ status: PlanStatus.DRAFT });
      await api.create(toCreateInput(plan));

      // Update both title and status (to non-terminal)
      await api.update<Plan>(
        plan.id,
        { title: 'Active Plan', status: PlanStatus.ACTIVE } as Partial<Plan>
      );

      const events = await api.getEvents(plan.id);
      const updateEvent = events.find(
        (e) => e.eventType !== EventType.CREATED
      );

      expect(updateEvent?.eventType).toBe(LifecycleEventType.UPDATED);

      const newValue = updateEvent?.newValue as Record<string, unknown>;
      expect(newValue?.title).toBe('Active Plan');
      expect(newValue?.status).toBe(PlanStatus.ACTIVE);
    });
  });
});
