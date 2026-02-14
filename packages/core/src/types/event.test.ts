import { describe, expect, test } from 'bun:test';
import {
  LifecycleEventType,
  DependencyEventType,
  TagEventType,
  MembershipEventType,
  EventType,
  ALL_EVENT_TYPES,
  Event,
  EventWithoutId,
  EventFilter,
  isValidEventType,
  validateEventType,
  isValidEventId,
  validateEventId,
  isValidEventValue,
  validateEventValue,
  isEvent,
  isEventWithoutId,
  validateEvent,
  validateEventWithoutId,
  isValidEventFilter,
  validateEventFilter,
  createEvent,
  CreateEventInput,
  isLifecycleEvent,
  isDependencyEvent,
  isTagEvent,
  isMembershipEvent,
  isAutoStatusEvent,
  getEventTypeDisplayName,
  filterEventsByElement,
  filterEventsByType,
  filterEventsByActor,
  filterEventsByTimeRange,
  sortEventsByTime,
  applyEventFilter,
  computeChangedFields,
  applyEventToState,
  reconstructStateAtTime,
  generateEventSummary,
  generateTimelineSnapshots,
} from './event.js';
import type { ElementId, EntityId, Timestamp } from './element.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid event for testing
function createTestEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    elementId: 'el-abc123' as ElementId,
    eventType: EventType.CREATED,
    actor: 'el-system1' as EntityId,
    oldValue: null,
    newValue: { title: 'Test Task' },
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    ...overrides,
  };
}

// Helper to create a valid event without ID for testing
function createTestEventWithoutId(overrides: Partial<EventWithoutId> = {}): EventWithoutId {
  return {
    elementId: 'el-abc123' as ElementId,
    eventType: EventType.CREATED,
    actor: 'el-system1' as EntityId,
    oldValue: null,
    newValue: { title: 'Test Task' },
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    ...overrides,
  };
}

// ============================================================================
// Event Type Constants Tests
// ============================================================================

describe('LifecycleEventType', () => {
  test('contains all expected types', () => {
    expect(LifecycleEventType.CREATED).toBe('created');
    expect(LifecycleEventType.UPDATED).toBe('updated');
    expect(LifecycleEventType.CLOSED).toBe('closed');
    expect(LifecycleEventType.REOPENED).toBe('reopened');
    expect(LifecycleEventType.DELETED).toBe('deleted');
  });

  test('has exactly 5 types', () => {
    expect(Object.keys(LifecycleEventType)).toHaveLength(5);
  });
});

describe('DependencyEventType', () => {
  test('contains all expected types', () => {
    expect(DependencyEventType.DEPENDENCY_ADDED).toBe('dependency_added');
    expect(DependencyEventType.DEPENDENCY_REMOVED).toBe('dependency_removed');
  });

  test('has exactly 2 types', () => {
    expect(Object.keys(DependencyEventType)).toHaveLength(2);
  });
});

describe('TagEventType', () => {
  test('contains all expected types', () => {
    expect(TagEventType.TAG_ADDED).toBe('tag_added');
    expect(TagEventType.TAG_REMOVED).toBe('tag_removed');
  });

  test('has exactly 2 types', () => {
    expect(Object.keys(TagEventType)).toHaveLength(2);
  });
});

describe('MembershipEventType', () => {
  test('contains all expected types', () => {
    expect(MembershipEventType.MEMBER_ADDED).toBe('member_added');
    expect(MembershipEventType.MEMBER_REMOVED).toBe('member_removed');
  });

  test('has exactly 2 types', () => {
    expect(Object.keys(MembershipEventType)).toHaveLength(2);
  });
});

describe('EventType', () => {
  test('combines all event type categories', () => {
    expect(EventType.CREATED).toBe('created');
    expect(EventType.DEPENDENCY_ADDED).toBe('dependency_added');
    expect(EventType.TAG_ADDED).toBe('tag_added');
    expect(EventType.MEMBER_ADDED).toBe('member_added');
  });

  test('has exactly 18 types total', () => {
    expect(Object.keys(EventType)).toHaveLength(18);
  });
});

describe('ALL_EVENT_TYPES', () => {
  test('contains all event types as array', () => {
    expect(ALL_EVENT_TYPES).toContain('created');
    expect(ALL_EVENT_TYPES).toContain('updated');
    expect(ALL_EVENT_TYPES).toContain('closed');
    expect(ALL_EVENT_TYPES).toContain('reopened');
    expect(ALL_EVENT_TYPES).toContain('deleted');
    expect(ALL_EVENT_TYPES).toContain('dependency_added');
    expect(ALL_EVENT_TYPES).toContain('dependency_removed');
    expect(ALL_EVENT_TYPES).toContain('tag_added');
    expect(ALL_EVENT_TYPES).toContain('tag_removed');
    expect(ALL_EVENT_TYPES).toContain('member_added');
    expect(ALL_EVENT_TYPES).toContain('member_removed');
    expect(ALL_EVENT_TYPES).toContain('comment_added');
    expect(ALL_EVENT_TYPES).toContain('comment_updated');
    expect(ALL_EVENT_TYPES).toContain('comment_deleted');
    expect(ALL_EVENT_TYPES).toContain('comment_resolved');
    expect(ALL_EVENT_TYPES).toContain('comment_unresolved');
    expect(ALL_EVENT_TYPES).toContain('auto_blocked');
    expect(ALL_EVENT_TYPES).toContain('auto_unblocked');
  });

  test('has exactly 18 types', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(18);
  });
});

// ============================================================================
// Event Type Validation Tests
// ============================================================================

describe('isValidEventType', () => {
  test('accepts all valid lifecycle event types', () => {
    expect(isValidEventType('created')).toBe(true);
    expect(isValidEventType('updated')).toBe(true);
    expect(isValidEventType('closed')).toBe(true);
    expect(isValidEventType('reopened')).toBe(true);
    expect(isValidEventType('deleted')).toBe(true);
  });

  test('accepts all valid dependency event types', () => {
    expect(isValidEventType('dependency_added')).toBe(true);
    expect(isValidEventType('dependency_removed')).toBe(true);
  });

  test('accepts all valid tag event types', () => {
    expect(isValidEventType('tag_added')).toBe(true);
    expect(isValidEventType('tag_removed')).toBe(true);
  });

  test('accepts all valid membership event types', () => {
    expect(isValidEventType('member_added')).toBe(true);
    expect(isValidEventType('member_removed')).toBe(true);
  });

  test('rejects invalid types', () => {
    expect(isValidEventType('invalid')).toBe(false);
    expect(isValidEventType('task')).toBe(false);
    expect(isValidEventType('CREATE')).toBe(false); // Case sensitive
    expect(isValidEventType(null)).toBe(false);
    expect(isValidEventType(undefined)).toBe(false);
    expect(isValidEventType(123)).toBe(false);
    expect(isValidEventType({})).toBe(false);
    expect(isValidEventType([])).toBe(false);
  });
});

describe('validateEventType', () => {
  test('returns valid event type', () => {
    expect(validateEventType('created')).toBe('created');
    expect(validateEventType('updated')).toBe('updated');
    expect(validateEventType('dependency_added')).toBe('dependency_added');
    expect(validateEventType('tag_removed')).toBe('tag_removed');
    expect(validateEventType('member_added')).toBe('member_added');
  });

  test('throws ValidationError for invalid type', () => {
    expect(() => validateEventType('invalid')).toThrow(ValidationError);
    try {
      validateEventType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('eventType');
      expect(err.details.expected).toEqual(ALL_EVENT_TYPES);
    }
  });

  test('throws for non-string values', () => {
    expect(() => validateEventType(123)).toThrow(ValidationError);
    expect(() => validateEventType(null)).toThrow(ValidationError);
    expect(() => validateEventType(undefined)).toThrow(ValidationError);
  });
});

// ============================================================================
// Event ID Validation Tests
// ============================================================================

describe('isValidEventId', () => {
  test('accepts positive integers', () => {
    expect(isValidEventId(1)).toBe(true);
    expect(isValidEventId(100)).toBe(true);
    expect(isValidEventId(999999999)).toBe(true);
  });

  test('rejects zero', () => {
    expect(isValidEventId(0)).toBe(false);
  });

  test('rejects negative numbers', () => {
    expect(isValidEventId(-1)).toBe(false);
    expect(isValidEventId(-100)).toBe(false);
  });

  test('rejects non-integers', () => {
    expect(isValidEventId(1.5)).toBe(false);
    expect(isValidEventId(0.1)).toBe(false);
  });

  test('rejects non-numbers', () => {
    expect(isValidEventId('1')).toBe(false);
    expect(isValidEventId(null)).toBe(false);
    expect(isValidEventId(undefined)).toBe(false);
    expect(isValidEventId({})).toBe(false);
  });
});

describe('validateEventId', () => {
  test('returns valid event ID', () => {
    expect(validateEventId(1)).toBe(1);
    expect(validateEventId(100)).toBe(100);
  });

  test('throws ValidationError for invalid ID', () => {
    expect(() => validateEventId(0)).toThrow(ValidationError);
    expect(() => validateEventId(-1)).toThrow(ValidationError);
    expect(() => validateEventId(1.5)).toThrow(ValidationError);
    expect(() => validateEventId('1')).toThrow(ValidationError);
    try {
      validateEventId(-1);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
      expect(err.details.field).toBe('id');
    }
  });
});

// ============================================================================
// Event Value Validation Tests
// ============================================================================

describe('isValidEventValue', () => {
  test('accepts null', () => {
    expect(isValidEventValue(null)).toBe(true);
  });

  test('accepts plain objects', () => {
    expect(isValidEventValue({})).toBe(true);
    expect(isValidEventValue({ key: 'value' })).toBe(true);
    expect(isValidEventValue({ nested: { deep: 'value' } })).toBe(true);
    expect(isValidEventValue({ number: 123, boolean: true })).toBe(true);
  });

  test('rejects arrays', () => {
    expect(isValidEventValue([])).toBe(false);
    expect(isValidEventValue([1, 2, 3])).toBe(false);
  });

  test('rejects primitives', () => {
    expect(isValidEventValue('string')).toBe(false);
    expect(isValidEventValue(123)).toBe(false);
    expect(isValidEventValue(true)).toBe(false);
    expect(isValidEventValue(undefined)).toBe(false);
  });

  test('rejects objects with circular references', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(isValidEventValue(circular)).toBe(false);
  });
});

describe('validateEventValue', () => {
  test('returns null for null input', () => {
    expect(validateEventValue(null, 'testField')).toBe(null);
  });

  test('returns valid object', () => {
    const obj = { key: 'value' };
    expect(validateEventValue(obj, 'testField')).toBe(obj);
  });

  test('throws ValidationError for invalid value', () => {
    expect(() => validateEventValue([], 'testField')).toThrow(ValidationError);
    expect(() => validateEventValue('string', 'testField')).toThrow(ValidationError);
    try {
      validateEventValue([], 'oldValue');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('oldValue');
    }
  });
});

// ============================================================================
// Event Type Guard Tests
// ============================================================================

describe('isEvent', () => {
  test('accepts valid event', () => {
    expect(isEvent(createTestEvent())).toBe(true);
  });

  test('accepts event with null oldValue', () => {
    expect(isEvent(createTestEvent({ oldValue: null }))).toBe(true);
  });

  test('accepts event with null newValue', () => {
    expect(isEvent(createTestEvent({ newValue: null }))).toBe(true);
  });

  test('accepts event with object values', () => {
    expect(isEvent(createTestEvent({
      oldValue: { status: 'open' },
      newValue: { status: 'closed' },
    }))).toBe(true);
  });

  test('rejects non-object values', () => {
    expect(isEvent(null)).toBe(false);
    expect(isEvent(undefined)).toBe(false);
    expect(isEvent('string')).toBe(false);
    expect(isEvent(123)).toBe(false);
  });

  test('rejects objects missing required fields', () => {
    expect(isEvent({})).toBe(false);
    expect(isEvent({ id: 1 })).toBe(false);
    expect(isEvent({ id: 1, elementId: 'el-abc' })).toBe(false);
  });

  test('rejects objects with invalid id', () => {
    expect(isEvent(createTestEvent({ id: 0 }))).toBe(false);
    expect(isEvent(createTestEvent({ id: -1 }))).toBe(false);
    expect(isEvent(createTestEvent({ id: '1' as unknown as number }))).toBe(false);
  });

  test('rejects objects with invalid elementId', () => {
    expect(isEvent(createTestEvent({ elementId: '' as ElementId }))).toBe(false);
    expect(isEvent(createTestEvent({ elementId: 123 as unknown as ElementId }))).toBe(false);
  });

  test('rejects objects with invalid eventType', () => {
    expect(isEvent(createTestEvent({ eventType: 'invalid' as EventType }))).toBe(false);
  });

  test('rejects objects with invalid actor', () => {
    expect(isEvent(createTestEvent({ actor: '' as EntityId }))).toBe(false);
  });

  test('rejects objects with invalid oldValue/newValue', () => {
    expect(isEvent(createTestEvent({ oldValue: [] as unknown as Record<string, unknown> }))).toBe(false);
    expect(isEvent(createTestEvent({ newValue: 'string' as unknown as Record<string, unknown> }))).toBe(false);
  });

  test('rejects objects with invalid timestamp', () => {
    expect(isEvent(createTestEvent({ createdAt: 'invalid' as Timestamp }))).toBe(false);
    expect(isEvent(createTestEvent({ createdAt: '2025-01-22' as Timestamp }))).toBe(false);
  });
});

describe('isEventWithoutId', () => {
  test('accepts valid event without id', () => {
    expect(isEventWithoutId(createTestEventWithoutId())).toBe(true);
  });

  test('rejects event with id', () => {
    expect(isEventWithoutId(createTestEvent())).toBe(false);
  });

  test('accepts event with undefined id field', () => {
    const event = { ...createTestEventWithoutId(), id: undefined };
    // When id is explicitly undefined, it passes because we check for defined id value
    expect(isEventWithoutId(event)).toBe(true);
  });

  test('rejects non-object values', () => {
    expect(isEventWithoutId(null)).toBe(false);
    expect(isEventWithoutId('string')).toBe(false);
  });

  test('validates all other required fields', () => {
    expect(isEventWithoutId({ elementId: 'el-abc' as ElementId })).toBe(false);
  });
});

// ============================================================================
// Event Validation Tests
// ============================================================================

describe('validateEvent', () => {
  test('returns valid event', () => {
    const event = createTestEvent();
    expect(validateEvent(event)).toEqual(event);
  });

  test('throws for non-object', () => {
    expect(() => validateEvent(null)).toThrow(ValidationError);
    expect(() => validateEvent('string')).toThrow(ValidationError);
    try {
      validateEvent(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  test('throws for invalid id', () => {
    expect(() => validateEvent(createTestEvent({ id: 0 }))).toThrow(ValidationError);
    try {
      validateEvent(createTestEvent({ id: -1 }));
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
      expect(err.details.field).toBe('id');
    }
  });

  test('throws for missing elementId', () => {
    const event = createTestEvent();
    delete (event as unknown as Record<string, unknown>).elementId;
    expect(() => validateEvent(event)).toThrow(ValidationError);
    try {
      validateEvent(event);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(err.details.field).toBe('elementId');
    }
  });

  test('throws for invalid eventType', () => {
    expect(() => validateEvent(createTestEvent({ eventType: 'invalid' as EventType }))).toThrow(ValidationError);
  });

  test('throws for missing actor', () => {
    const event = createTestEvent();
    (event as unknown as Record<string, unknown>).actor = '';
    expect(() => validateEvent(event)).toThrow(ValidationError);
    try {
      validateEvent(event);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(err.details.field).toBe('actor');
    }
  });

  test('throws for invalid oldValue', () => {
    expect(() => validateEvent(createTestEvent({
      oldValue: [] as unknown as Record<string, unknown>,
    }))).toThrow(ValidationError);
  });

  test('throws for invalid createdAt', () => {
    expect(() => validateEvent(createTestEvent({
      createdAt: 'invalid' as Timestamp,
    }))).toThrow(ValidationError);
  });
});

describe('validateEventWithoutId', () => {
  test('returns valid event without id', () => {
    const event = createTestEventWithoutId();
    expect(validateEventWithoutId(event)).toEqual(event);
  });

  test('throws for non-object', () => {
    expect(() => validateEventWithoutId(null)).toThrow(ValidationError);
  });

  test('validates all required fields', () => {
    expect(() => validateEventWithoutId({
      elementId: '',
      eventType: 'created',
      actor: 'el-system1',
      oldValue: null,
      newValue: {},
      createdAt: '2025-01-22T10:00:00.000Z',
    })).toThrow(ValidationError);
  });
});

// ============================================================================
// Event Filter Validation Tests
// ============================================================================

describe('isValidEventFilter', () => {
  test('accepts empty filter', () => {
    expect(isValidEventFilter({})).toBe(true);
  });

  test('accepts filter with elementId', () => {
    expect(isValidEventFilter({ elementId: 'el-abc123' as ElementId })).toBe(true);
  });

  test('accepts filter with single eventType', () => {
    expect(isValidEventFilter({ eventType: EventType.CREATED })).toBe(true);
  });

  test('accepts filter with array of eventTypes', () => {
    expect(isValidEventFilter({ eventType: [EventType.CREATED, EventType.UPDATED] })).toBe(true);
  });

  test('accepts filter with actor', () => {
    expect(isValidEventFilter({ actor: 'el-actor1' as EntityId })).toBe(true);
  });

  test('accepts filter with timestamps', () => {
    expect(isValidEventFilter({
      after: '2025-01-01T00:00:00.000Z' as Timestamp,
      before: '2025-12-31T23:59:59.999Z' as Timestamp,
    })).toBe(true);
  });

  test('accepts filter with limit and offset', () => {
    expect(isValidEventFilter({ limit: 10, offset: 0 })).toBe(true);
    expect(isValidEventFilter({ limit: 100, offset: 50 })).toBe(true);
  });

  test('accepts filter with all options', () => {
    expect(isValidEventFilter({
      elementId: 'el-abc' as ElementId,
      eventType: [EventType.CREATED],
      actor: 'el-actor' as EntityId,
      after: '2025-01-01T00:00:00.000Z' as Timestamp,
      before: '2025-12-31T23:59:59.999Z' as Timestamp,
      limit: 10,
      offset: 5,
    })).toBe(true);
  });

  test('rejects non-object values', () => {
    expect(isValidEventFilter(null)).toBe(false);
    expect(isValidEventFilter([])).toBe(false);
    expect(isValidEventFilter('string')).toBe(false);
  });

  test('rejects filter with empty elementId', () => {
    expect(isValidEventFilter({ elementId: '' as ElementId })).toBe(false);
  });

  test('rejects filter with invalid eventType', () => {
    expect(isValidEventFilter({ eventType: 'invalid' })).toBe(false);
    expect(isValidEventFilter({ eventType: ['created', 'invalid'] })).toBe(false);
  });

  test('rejects filter with empty actor', () => {
    expect(isValidEventFilter({ actor: '' as EntityId })).toBe(false);
  });

  test('rejects filter with invalid timestamps', () => {
    expect(isValidEventFilter({ after: 'invalid' as Timestamp })).toBe(false);
    expect(isValidEventFilter({ before: '2025-01-01' as Timestamp })).toBe(false);
  });

  test('rejects filter with invalid limit', () => {
    expect(isValidEventFilter({ limit: 0 })).toBe(false);
    expect(isValidEventFilter({ limit: -1 })).toBe(false);
    expect(isValidEventFilter({ limit: 1.5 })).toBe(false);
  });

  test('rejects filter with invalid offset', () => {
    expect(isValidEventFilter({ offset: -1 })).toBe(false);
    expect(isValidEventFilter({ offset: 1.5 })).toBe(false);
  });
});

describe('validateEventFilter', () => {
  test('returns valid filter', () => {
    const filter = { elementId: 'el-abc' as ElementId, limit: 10 };
    expect(validateEventFilter(filter)).toEqual(filter);
  });

  test('throws for non-object', () => {
    expect(() => validateEventFilter(null)).toThrow(ValidationError);
    expect(() => validateEventFilter([])).toThrow(ValidationError);
  });

  test('throws for invalid elementId', () => {
    expect(() => validateEventFilter({ elementId: '' as ElementId })).toThrow(ValidationError);
  });

  test('throws for invalid eventType in array', () => {
    try {
      validateEventFilter({ eventType: ['created', 'invalid'] });
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.message).toContain('index 1');
    }
  });

  test('throws for invalid limit', () => {
    expect(() => validateEventFilter({ limit: 0 })).toThrow(ValidationError);
    try {
      validateEventFilter({ limit: -1 });
    } catch (e) {
      const err = e as ValidationError;
      expect(err.details.field).toBe('limit');
    }
  });

  test('throws for invalid offset', () => {
    expect(() => validateEventFilter({ offset: -1 })).toThrow(ValidationError);
    try {
      validateEventFilter({ offset: -5 });
    } catch (e) {
      const err = e as ValidationError;
      expect(err.details.field).toBe('offset');
    }
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createEvent', () => {
  test('creates event with all required fields', () => {
    const input: CreateEventInput = {
      elementId: 'el-abc123' as ElementId,
      eventType: EventType.CREATED,
      actor: 'el-actor1' as EntityId,
      oldValue: null,
      newValue: { title: 'New Task' },
    };

    const event = createEvent(input);

    expect(event.elementId).toBe(input.elementId);
    expect(event.eventType).toBe(input.eventType);
    expect(event.actor).toBe(input.actor);
    expect(event.oldValue).toBe(input.oldValue);
    expect(event.newValue).toEqual(input.newValue);
    expect(event.createdAt).toBeDefined();
    expect((event as Record<string, unknown>).id).toBeUndefined();
  });

  test('uses provided timestamp', () => {
    const timestamp = '2025-01-15T12:30:00.000Z' as Timestamp;
    const input: CreateEventInput = {
      elementId: 'el-abc123' as ElementId,
      eventType: EventType.UPDATED,
      actor: 'el-actor1' as EntityId,
      oldValue: { status: 'open' },
      newValue: { status: 'closed' },
      createdAt: timestamp,
    };

    const event = createEvent(input);
    expect(event.createdAt).toBe(timestamp);
  });

  test('generates timestamp when not provided', () => {
    const before = new Date().toISOString();
    const input: CreateEventInput = {
      elementId: 'el-abc123' as ElementId,
      eventType: EventType.DELETED,
      actor: 'el-actor1' as EntityId,
      oldValue: { title: 'Deleted Task' },
      newValue: null,
    };

    const event = createEvent(input);
    const after = new Date().toISOString();

    expect(event.createdAt >= before).toBe(true);
    expect(event.createdAt <= after).toBe(true);
  });

  test('throws for empty elementId', () => {
    expect(() => createEvent({
      elementId: '' as ElementId,
      eventType: EventType.CREATED,
      actor: 'el-actor1' as EntityId,
      oldValue: null,
      newValue: {},
    })).toThrow(ValidationError);
  });

  test('throws for invalid eventType', () => {
    expect(() => createEvent({
      elementId: 'el-abc' as ElementId,
      eventType: 'invalid' as EventType,
      actor: 'el-actor1' as EntityId,
      oldValue: null,
      newValue: {},
    })).toThrow(ValidationError);
  });

  test('throws for empty actor', () => {
    expect(() => createEvent({
      elementId: 'el-abc' as ElementId,
      eventType: EventType.CREATED,
      actor: '' as EntityId,
      oldValue: null,
      newValue: {},
    })).toThrow(ValidationError);
  });

  test('throws for invalid oldValue', () => {
    expect(() => createEvent({
      elementId: 'el-abc' as ElementId,
      eventType: EventType.UPDATED,
      actor: 'el-actor' as EntityId,
      oldValue: [] as unknown as Record<string, unknown>,
      newValue: {},
    })).toThrow(ValidationError);
  });

  test('throws for invalid timestamp', () => {
    expect(() => createEvent({
      elementId: 'el-abc' as ElementId,
      eventType: EventType.CREATED,
      actor: 'el-actor' as EntityId,
      oldValue: null,
      newValue: {},
      createdAt: 'invalid' as Timestamp,
    })).toThrow(ValidationError);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isLifecycleEvent', () => {
  test('returns true for lifecycle events', () => {
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.CREATED }))).toBe(true);
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.UPDATED }))).toBe(true);
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.CLOSED }))).toBe(true);
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.REOPENED }))).toBe(true);
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.DELETED }))).toBe(true);
  });

  test('returns false for non-lifecycle events', () => {
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.DEPENDENCY_ADDED }))).toBe(false);
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.TAG_ADDED }))).toBe(false);
    expect(isLifecycleEvent(createTestEvent({ eventType: EventType.MEMBER_ADDED }))).toBe(false);
  });
});

describe('isDependencyEvent', () => {
  test('returns true for dependency events', () => {
    expect(isDependencyEvent(createTestEvent({ eventType: EventType.DEPENDENCY_ADDED }))).toBe(true);
    expect(isDependencyEvent(createTestEvent({ eventType: EventType.DEPENDENCY_REMOVED }))).toBe(true);
  });

  test('returns false for non-dependency events', () => {
    expect(isDependencyEvent(createTestEvent({ eventType: EventType.CREATED }))).toBe(false);
    expect(isDependencyEvent(createTestEvent({ eventType: EventType.TAG_ADDED }))).toBe(false);
  });
});

describe('isTagEvent', () => {
  test('returns true for tag events', () => {
    expect(isTagEvent(createTestEvent({ eventType: EventType.TAG_ADDED }))).toBe(true);
    expect(isTagEvent(createTestEvent({ eventType: EventType.TAG_REMOVED }))).toBe(true);
  });

  test('returns false for non-tag events', () => {
    expect(isTagEvent(createTestEvent({ eventType: EventType.CREATED }))).toBe(false);
    expect(isTagEvent(createTestEvent({ eventType: EventType.DEPENDENCY_ADDED }))).toBe(false);
  });
});

describe('isMembershipEvent', () => {
  test('returns true for membership events', () => {
    expect(isMembershipEvent(createTestEvent({ eventType: EventType.MEMBER_ADDED }))).toBe(true);
    expect(isMembershipEvent(createTestEvent({ eventType: EventType.MEMBER_REMOVED }))).toBe(true);
  });

  test('returns false for non-membership events', () => {
    expect(isMembershipEvent(createTestEvent({ eventType: EventType.CREATED }))).toBe(false);
    expect(isMembershipEvent(createTestEvent({ eventType: EventType.TAG_ADDED }))).toBe(false);
  });
});

describe('isAutoStatusEvent', () => {
  test('returns true for auto status events', () => {
    expect(isAutoStatusEvent(createTestEvent({ eventType: EventType.AUTO_BLOCKED }))).toBe(true);
    expect(isAutoStatusEvent(createTestEvent({ eventType: EventType.AUTO_UNBLOCKED }))).toBe(true);
  });

  test('returns false for non-auto-status events', () => {
    expect(isAutoStatusEvent(createTestEvent({ eventType: EventType.CREATED }))).toBe(false);
    expect(isAutoStatusEvent(createTestEvent({ eventType: EventType.CLOSED }))).toBe(false);
    expect(isAutoStatusEvent(createTestEvent({ eventType: EventType.UPDATED }))).toBe(false);
  });
});

describe('getEventTypeDisplayName', () => {
  test('returns display names for all event types', () => {
    expect(getEventTypeDisplayName(EventType.CREATED)).toBe('Created');
    expect(getEventTypeDisplayName(EventType.UPDATED)).toBe('Updated');
    expect(getEventTypeDisplayName(EventType.CLOSED)).toBe('Closed');
    expect(getEventTypeDisplayName(EventType.REOPENED)).toBe('Reopened');
    expect(getEventTypeDisplayName(EventType.DELETED)).toBe('Deleted');
    expect(getEventTypeDisplayName(EventType.DEPENDENCY_ADDED)).toBe('Dependency Added');
    expect(getEventTypeDisplayName(EventType.DEPENDENCY_REMOVED)).toBe('Dependency Removed');
    expect(getEventTypeDisplayName(EventType.TAG_ADDED)).toBe('Tag Added');
    expect(getEventTypeDisplayName(EventType.TAG_REMOVED)).toBe('Tag Removed');
    expect(getEventTypeDisplayName(EventType.MEMBER_ADDED)).toBe('Member Added');
    expect(getEventTypeDisplayName(EventType.MEMBER_REMOVED)).toBe('Member Removed');
    expect(getEventTypeDisplayName(EventType.AUTO_BLOCKED)).toBe('Auto Blocked');
    expect(getEventTypeDisplayName(EventType.AUTO_UNBLOCKED)).toBe('Auto Unblocked');
  });
});

// ============================================================================
// Filter Utility Tests
// ============================================================================

describe('filterEventsByElement', () => {
  test('filters events by element ID', () => {
    const events = [
      createTestEvent({ id: 1, elementId: 'el-abc' as ElementId }),
      createTestEvent({ id: 2, elementId: 'el-def' as ElementId }),
      createTestEvent({ id: 3, elementId: 'el-abc' as ElementId }),
    ];

    const filtered = filterEventsByElement(events, 'el-abc' as ElementId);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe(1);
    expect(filtered[1].id).toBe(3);
  });

  test('returns empty array when no match', () => {
    const events = [createTestEvent({ elementId: 'el-abc' as ElementId })];
    const filtered = filterEventsByElement(events, 'el-xyz' as ElementId);
    expect(filtered).toHaveLength(0);
  });
});

describe('filterEventsByType', () => {
  test('filters events by single type', () => {
    const events = [
      createTestEvent({ id: 1, eventType: EventType.CREATED }),
      createTestEvent({ id: 2, eventType: EventType.UPDATED }),
      createTestEvent({ id: 3, eventType: EventType.CREATED }),
    ];

    const filtered = filterEventsByType(events, EventType.CREATED);
    expect(filtered).toHaveLength(2);
  });

  test('filters events by array of types', () => {
    const events = [
      createTestEvent({ id: 1, eventType: EventType.CREATED }),
      createTestEvent({ id: 2, eventType: EventType.UPDATED }),
      createTestEvent({ id: 3, eventType: EventType.DELETED }),
    ];

    const filtered = filterEventsByType(events, [EventType.CREATED, EventType.DELETED]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(e => e.eventType)).toEqual(['created', 'deleted']);
  });
});

describe('filterEventsByActor', () => {
  test('filters events by actor', () => {
    const events = [
      createTestEvent({ id: 1, actor: 'el-alice' as EntityId }),
      createTestEvent({ id: 2, actor: 'el-bob' as EntityId }),
      createTestEvent({ id: 3, actor: 'el-alice' as EntityId }),
    ];

    const filtered = filterEventsByActor(events, 'el-alice' as EntityId);
    expect(filtered).toHaveLength(2);
  });
});

describe('filterEventsByTimeRange', () => {
  test('filters events after timestamp', () => {
    const events = [
      createTestEvent({ id: 1, createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 2, createdAt: '2025-01-15T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 3, createdAt: '2025-01-30T00:00:00.000Z' as Timestamp }),
    ];

    const filtered = filterEventsByTimeRange(events, '2025-01-10T00:00:00.000Z' as Timestamp);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe(2);
    expect(filtered[1].id).toBe(3);
  });

  test('filters events before timestamp', () => {
    const events = [
      createTestEvent({ id: 1, createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 2, createdAt: '2025-01-15T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 3, createdAt: '2025-01-30T00:00:00.000Z' as Timestamp }),
    ];

    const filtered = filterEventsByTimeRange(events, undefined, '2025-01-20T00:00:00.000Z' as Timestamp);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe(1);
    expect(filtered[1].id).toBe(2);
  });

  test('filters events within range', () => {
    const events = [
      createTestEvent({ id: 1, createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 2, createdAt: '2025-01-15T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 3, createdAt: '2025-01-30T00:00:00.000Z' as Timestamp }),
    ];

    const filtered = filterEventsByTimeRange(
      events,
      '2025-01-10T00:00:00.000Z' as Timestamp,
      '2025-01-20T00:00:00.000Z' as Timestamp
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });
});

describe('sortEventsByTime', () => {
  test('sorts events ascending by default', () => {
    const events = [
      createTestEvent({ id: 2, createdAt: '2025-01-15T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 1, createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 3, createdAt: '2025-01-30T00:00:00.000Z' as Timestamp }),
    ];

    const sorted = sortEventsByTime(events);
    expect(sorted.map(e => e.id)).toEqual([1, 2, 3]);
  });

  test('sorts events descending when specified', () => {
    const events = [
      createTestEvent({ id: 2, createdAt: '2025-01-15T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 1, createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 3, createdAt: '2025-01-30T00:00:00.000Z' as Timestamp }),
    ];

    const sorted = sortEventsByTime(events, true);
    expect(sorted.map(e => e.id)).toEqual([3, 2, 1]);
  });

  test('does not mutate original array', () => {
    const events = [
      createTestEvent({ id: 2, createdAt: '2025-01-15T00:00:00.000Z' as Timestamp }),
      createTestEvent({ id: 1, createdAt: '2025-01-01T00:00:00.000Z' as Timestamp }),
    ];

    const sorted = sortEventsByTime(events);
    expect(events[0].id).toBe(2);
    expect(sorted[0].id).toBe(1);
  });
});

describe('applyEventFilter', () => {
  const events = [
    createTestEvent({
      id: 1,
      elementId: 'el-abc' as ElementId,
      eventType: EventType.CREATED,
      actor: 'el-alice' as EntityId,
      createdAt: '2025-01-01T00:00:00.000Z' as Timestamp,
    }),
    createTestEvent({
      id: 2,
      elementId: 'el-abc' as ElementId,
      eventType: EventType.UPDATED,
      actor: 'el-bob' as EntityId,
      createdAt: '2025-01-15T00:00:00.000Z' as Timestamp,
    }),
    createTestEvent({
      id: 3,
      elementId: 'el-def' as ElementId,
      eventType: EventType.CREATED,
      actor: 'el-alice' as EntityId,
      createdAt: '2025-01-30T00:00:00.000Z' as Timestamp,
    }),
  ];

  test('applies element filter', () => {
    const filtered = applyEventFilter(events, { elementId: 'el-abc' as ElementId });
    expect(filtered).toHaveLength(2);
  });

  test('applies type filter', () => {
    const filtered = applyEventFilter(events, { eventType: EventType.CREATED });
    expect(filtered).toHaveLength(2);
  });

  test('applies actor filter', () => {
    const filtered = applyEventFilter(events, { actor: 'el-alice' as EntityId });
    expect(filtered).toHaveLength(2);
  });

  test('applies time range filter', () => {
    const filtered = applyEventFilter(events, {
      after: '2025-01-10T00:00:00.000Z' as Timestamp,
      before: '2025-01-20T00:00:00.000Z' as Timestamp,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  test('applies limit', () => {
    const filtered = applyEventFilter(events, { limit: 2 });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe(1);
    expect(filtered[1].id).toBe(2);
  });

  test('applies offset', () => {
    const filtered = applyEventFilter(events, { offset: 1 });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe(2);
    expect(filtered[1].id).toBe(3);
  });

  test('applies offset and limit together', () => {
    const filtered = applyEventFilter(events, { offset: 1, limit: 1 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  test('applies multiple filters', () => {
    const filtered = applyEventFilter(events, {
      elementId: 'el-abc' as ElementId,
      actor: 'el-bob' as EntityId,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });
});

// ============================================================================
// Changed Fields Computation Tests
// ============================================================================

describe('computeChangedFields', () => {
  test('returns empty array for both null', () => {
    expect(computeChangedFields(null, null)).toEqual([]);
  });

  test('returns all keys for create (null to object)', () => {
    const newValue = { title: 'Test', status: 'open' };
    // Keys are sorted alphabetically: status < title
    expect(computeChangedFields(null, newValue)).toEqual(['status', 'title']);
  });

  test('returns all keys for delete (object to null)', () => {
    const oldValue = { title: 'Test', status: 'open' };
    // Keys are sorted alphabetically: status < title
    expect(computeChangedFields(oldValue, null)).toEqual(['status', 'title']);
  });

  test('returns changed fields for update', () => {
    const oldValue = { title: 'Old', status: 'open', priority: 1 };
    const newValue = { title: 'New', status: 'open', priority: 2 };
    expect(computeChangedFields(oldValue, newValue)).toEqual(['priority', 'title']);
  });

  test('returns added fields', () => {
    const oldValue = { title: 'Test' };
    const newValue = { title: 'Test', status: 'open' };
    expect(computeChangedFields(oldValue, newValue)).toEqual(['status']);
  });

  test('returns removed fields', () => {
    const oldValue = { title: 'Test', status: 'open' };
    const newValue = { title: 'Test' };
    expect(computeChangedFields(oldValue, newValue)).toEqual(['status']);
  });

  test('returns empty array when no changes', () => {
    const value = { title: 'Test', status: 'open' };
    expect(computeChangedFields(value, value)).toEqual([]);
  });

  test('handles nested objects', () => {
    const oldValue = { config: { a: 1, b: 2 } };
    const newValue = { config: { a: 1, b: 3 } };
    expect(computeChangedFields(oldValue, newValue)).toEqual(['config']);
  });

  test('returns sorted field names', () => {
    const oldValue = { z: 1, a: 2, m: 3 };
    const newValue = { z: 2, a: 3, m: 4 };
    expect(computeChangedFields(oldValue, newValue)).toEqual(['a', 'm', 'z']);
  });
});

// ============================================================================
// Event State Reconstruction Tests
// ============================================================================

describe('applyEventToState', () => {
  test('applies created event to null state', () => {
    const event = createTestEvent({
      eventType: EventType.CREATED,
      oldValue: null,
      newValue: { id: 'el-123', type: 'task', title: 'Test Task', status: 'open' },
    });
    const result = applyEventToState(null, event);
    expect(result).toEqual({ id: 'el-123', type: 'task', title: 'Test Task', status: 'open' });
  });

  test('applies updated event to existing state', () => {
    const currentState = { id: 'el-123', type: 'task', title: 'Old Title', status: 'open' };
    const event = createTestEvent({
      eventType: EventType.UPDATED,
      oldValue: currentState,
      newValue: { id: 'el-123', type: 'task', title: 'New Title', status: 'open' },
    });
    const result = applyEventToState(currentState, event);
    expect(result).toEqual({ id: 'el-123', type: 'task', title: 'New Title', status: 'open' });
  });

  test('applies closed event', () => {
    const currentState = { id: 'el-123', type: 'task', title: 'Task', status: 'open' };
    const event = createTestEvent({
      eventType: EventType.CLOSED,
      oldValue: currentState,
      newValue: { id: 'el-123', type: 'task', title: 'Task', status: 'closed' },
    });
    const result = applyEventToState(currentState, event);
    expect(result?.status).toBe('closed');
  });

  test('applies reopened event', () => {
    const currentState = { id: 'el-123', type: 'task', title: 'Task', status: 'closed' };
    const event = createTestEvent({
      eventType: EventType.REOPENED,
      oldValue: currentState,
      newValue: { id: 'el-123', type: 'task', title: 'Task', status: 'open' },
    });
    const result = applyEventToState(currentState, event);
    expect(result?.status).toBe('open');
  });

  test('applies deleted event - returns null', () => {
    const currentState = { id: 'el-123', type: 'task', title: 'Task' };
    const event = createTestEvent({
      eventType: EventType.DELETED,
      oldValue: currentState,
      newValue: null,
    });
    const result = applyEventToState(currentState, event);
    expect(result).toBeNull();
  });

  test('dependency events do not change element state', () => {
    const currentState = { id: 'el-123', type: 'task', title: 'Task' };
    const event = createTestEvent({
      eventType: EventType.DEPENDENCY_ADDED,
      oldValue: null,
      newValue: { blockedId: 'el-456', type: 'blocks' },
    });
    const result = applyEventToState(currentState, event);
    expect(result).toEqual(currentState);
  });

  test('member added event updates members array', () => {
    const currentState = { id: 'el-team', type: 'team', members: ['el-alice'] };
    const event = createTestEvent({
      eventType: EventType.MEMBER_ADDED,
      oldValue: { members: ['el-alice'] },
      newValue: { members: ['el-alice', 'el-bob'], addedMember: 'el-bob' },
    });
    const result = applyEventToState(currentState, event);
    expect(result?.members).toEqual(['el-alice', 'el-bob']);
  });

  test('auto_blocked event updates status', () => {
    const currentState = { id: 'el-123', type: 'task', status: 'open' };
    const event = createTestEvent({
      eventType: EventType.AUTO_BLOCKED,
      oldValue: { status: 'open' },
      newValue: { status: 'blocked' },
    });
    const result = applyEventToState(currentState, event);
    expect(result?.status).toBe('blocked');
  });

  test('returns null for null newValue in created event', () => {
    const event = createTestEvent({
      eventType: EventType.CREATED,
      oldValue: null,
      newValue: null,
    });
    const result = applyEventToState(null, event);
    expect(result).toBeNull();
  });
});

describe('reconstructStateAtTime', () => {
  const baseTimestamp = '2025-01-22T10:00:00.000Z' as Timestamp;
  const elementId = 'el-123' as ElementId;

  test('reconstructs initial state from created event', () => {
    const events: Event[] = [
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: baseTimestamp,
        newValue: { id: 'el-123', type: 'task', title: 'Test Task', status: 'open' },
      }),
    ];

    const result = reconstructStateAtTime(events, '2025-01-22T11:00:00.000Z' as Timestamp);
    expect(result.exists).toBe(true);
    expect(result.eventsApplied).toBe(1);
    expect(result.state?.title).toBe('Test Task');
  });

  test('returns exists=false before creation', () => {
    const events: Event[] = [
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: baseTimestamp,
        newValue: { id: 'el-123', type: 'task', title: 'Test Task' },
      }),
    ];

    const result = reconstructStateAtTime(events, '2025-01-22T09:00:00.000Z' as Timestamp);
    expect(result.exists).toBe(false);
    expect(result.eventsApplied).toBe(0);
    expect(result.state).toBeNull();
  });

  test('reconstructs state after multiple updates', () => {
    const events: Event[] = [
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        newValue: { id: 'el-123', type: 'task', title: 'Initial', status: 'open' },
      }),
      createTestEvent({
        id: 2,
        elementId,
        eventType: EventType.UPDATED,
        createdAt: '2025-01-22T11:00:00.000Z' as Timestamp,
        oldValue: { id: 'el-123', type: 'task', title: 'Initial', status: 'open' },
        newValue: { id: 'el-123', type: 'task', title: 'Updated Once', status: 'open' },
      }),
      createTestEvent({
        id: 3,
        elementId,
        eventType: EventType.UPDATED,
        createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
        oldValue: { id: 'el-123', type: 'task', title: 'Updated Once', status: 'open' },
        newValue: { id: 'el-123', type: 'task', title: 'Updated Twice', status: 'open' },
      }),
    ];

    // At 10:30, should have initial state
    let result = reconstructStateAtTime(events, '2025-01-22T10:30:00.000Z' as Timestamp);
    expect(result.state?.title).toBe('Initial');
    expect(result.eventsApplied).toBe(1);

    // At 11:30, should have first update
    result = reconstructStateAtTime(events, '2025-01-22T11:30:00.000Z' as Timestamp);
    expect(result.state?.title).toBe('Updated Once');
    expect(result.eventsApplied).toBe(2);

    // At 12:30, should have second update
    result = reconstructStateAtTime(events, '2025-01-22T12:30:00.000Z' as Timestamp);
    expect(result.state?.title).toBe('Updated Twice');
    expect(result.eventsApplied).toBe(3);
  });

  test('handles deleted state', () => {
    const events: Event[] = [
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        newValue: { id: 'el-123', type: 'task', title: 'Task' },
      }),
      createTestEvent({
        id: 2,
        elementId,
        eventType: EventType.DELETED,
        createdAt: '2025-01-22T11:00:00.000Z' as Timestamp,
        oldValue: { id: 'el-123', type: 'task', title: 'Task' },
        newValue: null,
      }),
    ];

    // Before deletion
    let result = reconstructStateAtTime(events, '2025-01-22T10:30:00.000Z' as Timestamp);
    expect(result.exists).toBe(true);
    expect(result.state?.title).toBe('Task');

    // After deletion
    result = reconstructStateAtTime(events, '2025-01-22T12:00:00.000Z' as Timestamp);
    expect(result.exists).toBe(false);
    expect(result.state).toBeNull();
  });

  test('handles unsorted events (sorts internally)', () => {
    const events: Event[] = [
      // Provide events out of order
      createTestEvent({
        id: 2,
        elementId,
        eventType: EventType.UPDATED,
        createdAt: '2025-01-22T11:00:00.000Z' as Timestamp,
        newValue: { title: 'Updated' },
      }),
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        newValue: { title: 'Created' },
      }),
    ];

    const result = reconstructStateAtTime(events, '2025-01-22T12:00:00.000Z' as Timestamp);
    expect(result.state?.title).toBe('Updated');
    expect(result.eventsApplied).toBe(2);
  });
});

describe('generateEventSummary', () => {
  test('summarizes created event', () => {
    const event = createTestEvent({
      eventType: EventType.CREATED,
      actor: 'el-alice' as EntityId,
    });
    expect(generateEventSummary(event)).toBe('Created by el-alice');
  });

  test('summarizes updated event with changed fields', () => {
    const event = createTestEvent({
      eventType: EventType.UPDATED,
      actor: 'el-alice' as EntityId,
      oldValue: { title: 'Old', status: 'open' },
      newValue: { title: 'New', status: 'open' },
    });
    expect(generateEventSummary(event)).toBe('Updated title by el-alice');
  });

  test('summarizes updated event with multiple fields', () => {
    const event = createTestEvent({
      eventType: EventType.UPDATED,
      actor: 'el-alice' as EntityId,
      oldValue: { title: 'Old', status: 'open', priority: 1 },
      newValue: { title: 'New', status: 'closed', priority: 2 },
    });
    const summary = generateEventSummary(event);
    expect(summary).toBe('Updated priority, status, title by el-alice');
  });

  test('summarizes updated event with many fields', () => {
    const event = createTestEvent({
      eventType: EventType.UPDATED,
      actor: 'el-alice' as EntityId,
      oldValue: { a: 1, b: 2, c: 3, d: 4 },
      newValue: { a: 2, b: 3, c: 4, d: 5 },
    });
    expect(generateEventSummary(event)).toBe('Updated 4 fields by el-alice');
  });

  test('summarizes closed event with reason', () => {
    const event = createTestEvent({
      eventType: EventType.CLOSED,
      actor: 'el-alice' as EntityId,
      newValue: { reason: 'Completed successfully' },
    });
    expect(generateEventSummary(event)).toBe('Closed by el-alice: Completed successfully');
  });

  test('summarizes closed event without reason', () => {
    const event = createTestEvent({
      eventType: EventType.CLOSED,
      actor: 'el-alice' as EntityId,
      newValue: {},
    });
    expect(generateEventSummary(event)).toBe('Closed by el-alice');
  });

  test('summarizes reopened event', () => {
    const event = createTestEvent({
      eventType: EventType.REOPENED,
      actor: 'el-alice' as EntityId,
    });
    expect(generateEventSummary(event)).toBe('Reopened by el-alice');
  });

  test('summarizes deleted event', () => {
    const event = createTestEvent({
      eventType: EventType.DELETED,
      actor: 'el-alice' as EntityId,
      newValue: { reason: 'No longer needed' },
    });
    expect(generateEventSummary(event)).toBe('Deleted by el-alice: No longer needed');
  });

  test('summarizes dependency_added event', () => {
    const event = createTestEvent({
      eventType: EventType.DEPENDENCY_ADDED,
      actor: 'el-alice' as EntityId,
      newValue: { blockedId: 'el-456', type: 'blocks' },
    });
    expect(generateEventSummary(event)).toBe('Added blocks to el-456 by el-alice');
  });

  test('summarizes dependency_removed event', () => {
    const event = createTestEvent({
      eventType: EventType.DEPENDENCY_REMOVED,
      actor: 'el-alice' as EntityId,
      oldValue: { blockerId: 'el-456', type: 'awaits' },
    });
    expect(generateEventSummary(event)).toBe('Removed awaits from el-456 by el-alice');
  });

  test('summarizes member_added event', () => {
    const event = createTestEvent({
      eventType: EventType.MEMBER_ADDED,
      actor: 'el-admin' as EntityId,
      newValue: { addedMember: 'el-bob' },
    });
    expect(generateEventSummary(event)).toBe('Added member el-bob by el-admin');
  });

  test('summarizes member_removed event', () => {
    const event = createTestEvent({
      eventType: EventType.MEMBER_REMOVED,
      actor: 'el-admin' as EntityId,
      newValue: { removedMember: 'el-bob' },
    });
    expect(generateEventSummary(event)).toBe('Removed member el-bob by el-admin');
  });

  test('summarizes self-removal (leaving)', () => {
    const event = createTestEvent({
      eventType: EventType.MEMBER_REMOVED,
      actor: 'el-bob' as EntityId,
      newValue: { removedMember: 'el-bob', selfRemoval: true },
    });
    expect(generateEventSummary(event)).toBe('el-bob left');
  });

  test('summarizes auto_blocked event', () => {
    const event = createTestEvent({
      eventType: EventType.AUTO_BLOCKED,
      actor: 'system:blocked-cache' as EntityId,
    });
    expect(generateEventSummary(event)).toBe('Automatically blocked (dependency not satisfied)');
  });

  test('summarizes auto_unblocked event', () => {
    const event = createTestEvent({
      eventType: EventType.AUTO_UNBLOCKED,
      actor: 'system:blocked-cache' as EntityId,
    });
    expect(generateEventSummary(event)).toBe('Automatically unblocked (blockers resolved)');
  });
});

describe('generateTimelineSnapshots', () => {
  const elementId = 'el-123' as ElementId;

  test('generates timeline from single created event', () => {
    const events: Event[] = [
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        newValue: { id: 'el-123', type: 'task', title: 'Task' },
      }),
    ];

    const snapshots = generateTimelineSnapshots(events);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].summary).toContain('Created by');
    expect(snapshots[0].state?.title).toBe('Task');
  });

  test('generates timeline showing state evolution', () => {
    const events: Event[] = [
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        actor: 'el-alice' as EntityId,
        newValue: { title: 'Initial', status: 'open' },
      }),
      createTestEvent({
        id: 2,
        elementId,
        eventType: EventType.UPDATED,
        createdAt: '2025-01-22T11:00:00.000Z' as Timestamp,
        actor: 'el-bob' as EntityId,
        oldValue: { title: 'Initial', status: 'open' },
        newValue: { title: 'Updated', status: 'in_progress' },
      }),
      createTestEvent({
        id: 3,
        elementId,
        eventType: EventType.CLOSED,
        createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
        actor: 'el-bob' as EntityId,
        oldValue: { title: 'Updated', status: 'in_progress' },
        newValue: { title: 'Updated', status: 'closed', reason: 'Done' },
      }),
    ];

    const snapshots = generateTimelineSnapshots(events);
    expect(snapshots).toHaveLength(3);

    // Check state evolution
    expect(snapshots[0].state?.title).toBe('Initial');
    expect(snapshots[1].state?.title).toBe('Updated');
    expect(snapshots[2].state?.status).toBe('closed');

    // Check summaries
    expect(snapshots[0].summary).toBe('Created by el-alice');
    expect(snapshots[1].summary).toContain('Updated');
    expect(snapshots[2].summary).toContain('Closed by el-bob');
  });

  test('handles deletion in timeline', () => {
    const events: Event[] = [
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        newValue: { title: 'Task' },
      }),
      createTestEvent({
        id: 2,
        elementId,
        eventType: EventType.DELETED,
        createdAt: '2025-01-22T11:00:00.000Z' as Timestamp,
        oldValue: { title: 'Task' },
        newValue: null,
      }),
    ];

    const snapshots = generateTimelineSnapshots(events);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].state?.title).toBe('Task');
    expect(snapshots[1].state).toBeNull();
  });

  test('sorts events by time before generating timeline', () => {
    const events: Event[] = [
      // Provide events out of order
      createTestEvent({
        id: 2,
        elementId,
        eventType: EventType.UPDATED,
        createdAt: '2025-01-22T11:00:00.000Z' as Timestamp,
        newValue: { title: 'Second' },
      }),
      createTestEvent({
        id: 1,
        elementId,
        eventType: EventType.CREATED,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        newValue: { title: 'First' },
      }),
    ];

    const snapshots = generateTimelineSnapshots(events);
    expect(snapshots).toHaveLength(2);
    // First snapshot should be from the created event
    expect(snapshots[0].event.eventType).toBe(EventType.CREATED);
    expect(snapshots[0].state?.title).toBe('First');
    // Second snapshot should have updated state
    expect(snapshots[1].event.eventType).toBe(EventType.UPDATED);
    expect(snapshots[1].state?.title).toBe('Second');
  });

  test('returns empty array for no events', () => {
    const snapshots = generateTimelineSnapshots([]);
    expect(snapshots).toHaveLength(0);
  });
});
