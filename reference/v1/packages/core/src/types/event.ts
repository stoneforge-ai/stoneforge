/**
 * Event Type - Audit trail records for element mutations
 *
 * The Event type provides:
 * - Complete audit trail of all changes
 * - Historical analysis capabilities
 * - Debugging and troubleshooting support
 * - Compliance documentation
 * - Change attribution
 *
 * Events are append-only and immutable.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import type { ElementId, EntityId, Timestamp } from './element.js';
import { isValidTimestamp, validateTimestamp, createTimestamp } from './element.js';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Lifecycle event types - core element state changes
 */
export const LifecycleEventType = {
  /** Element creation */
  CREATED: 'created',
  /** Element update */
  UPDATED: 'updated',
  /** Task/Plan/Workflow closed */
  CLOSED: 'closed',
  /** Closed element reopened */
  REOPENED: 'reopened',
  /** Soft delete (tombstone) */
  DELETED: 'deleted',
} as const;

export type LifecycleEventType = (typeof LifecycleEventType)[keyof typeof LifecycleEventType];

/**
 * Dependency event types - relationship changes
 */
export const DependencyEventType = {
  /** New dependency added */
  DEPENDENCY_ADDED: 'dependency_added',
  /** Dependency removed */
  DEPENDENCY_REMOVED: 'dependency_removed',
} as const;

export type DependencyEventType = (typeof DependencyEventType)[keyof typeof DependencyEventType];

/**
 * Tag event types - tag changes
 */
export const TagEventType = {
  /** Tag added to element */
  TAG_ADDED: 'tag_added',
  /** Tag removed from element */
  TAG_REMOVED: 'tag_removed',
} as const;

export type TagEventType = (typeof TagEventType)[keyof typeof TagEventType];

/**
 * Membership event types - collection membership changes
 */
export const MembershipEventType = {
  /** Member added to collection */
  MEMBER_ADDED: 'member_added',
  /** Member removed from collection */
  MEMBER_REMOVED: 'member_removed',
} as const;

export type MembershipEventType = (typeof MembershipEventType)[keyof typeof MembershipEventType];

/**
 * Comment event types - comment changes on documents
 */
export const CommentEventType = {
  /** Comment added to document */
  COMMENT_ADDED: 'comment_added',
  /** Comment content updated */
  COMMENT_UPDATED: 'comment_updated',
  /** Comment soft-deleted */
  COMMENT_DELETED: 'comment_deleted',
  /** Comment resolved */
  COMMENT_RESOLVED: 'comment_resolved',
  /** Comment unresolved */
  COMMENT_UNRESOLVED: 'comment_unresolved',
} as const;

export type CommentEventType = (typeof CommentEventType)[keyof typeof CommentEventType];

/**
 * Automatic status transition event types - system-triggered status changes
 */
export const AutoStatusEventType = {
  /** Task automatically blocked due to dependency */
  AUTO_BLOCKED: 'auto_blocked',
  /** Task automatically unblocked when blockers resolved */
  AUTO_UNBLOCKED: 'auto_unblocked',
} as const;

export type AutoStatusEventType = (typeof AutoStatusEventType)[keyof typeof AutoStatusEventType];

/**
 * All event types combined
 */
export const EventType = {
  ...LifecycleEventType,
  ...DependencyEventType,
  ...TagEventType,
  ...MembershipEventType,
  ...CommentEventType,
  ...AutoStatusEventType,
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

/**
 * Array of all valid event types for iteration
 */
export const ALL_EVENT_TYPES = Object.values(EventType) as EventType[];

// ============================================================================
// Event Interface
// ============================================================================

/**
 * Event record - captures a single mutation
 *
 * Events are append-only and immutable. Each event captures the who, what,
 * and when of a change to an element.
 */
export interface Event {
  /** Auto-incrementing identifier (set by storage) */
  readonly id: number;
  /** Element that was changed */
  readonly elementId: ElementId;
  /** Category of change */
  readonly eventType: EventType;
  /** Who made the change */
  readonly actor: EntityId;
  /** Previous state (partial, null for creates) */
  readonly oldValue: Record<string, unknown> | null;
  /** New state (partial, full element for creates) */
  readonly newValue: Record<string, unknown> | null;
  /** When change occurred */
  readonly createdAt: Timestamp;
}

/**
 * Event without ID - used before storage assigns an ID
 */
export type EventWithoutId = Omit<Event, 'id'>;

// ============================================================================
// Event Filter Interface
// ============================================================================

/**
 * Filter options for querying events
 */
export interface EventFilter {
  /** Filter by element ID */
  elementId?: ElementId;
  /** Filter by single event type or array of types */
  eventType?: EventType | EventType[];
  /** Filter by actor */
  actor?: EntityId;
  /** Events after this timestamp (inclusive) */
  after?: Timestamp;
  /** Events before this timestamp (inclusive) */
  before?: Timestamp;
  /** Maximum events to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Checks if a value is a valid event type
 */
export function isValidEventType(value: unknown): value is EventType {
  return typeof value === 'string' && ALL_EVENT_TYPES.includes(value as EventType);
}

/**
 * Validates an event type and throws if invalid
 */
export function validateEventType(value: unknown): EventType {
  if (!isValidEventType(value)) {
    throw new ValidationError(
      `Invalid event type: ${value}. Must be one of: ${ALL_EVENT_TYPES.join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'eventType', value, expected: ALL_EVENT_TYPES }
    );
  }
  return value;
}

/**
 * Checks if a value is a valid event ID (positive integer)
 */
export function isValidEventId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validates an event ID and throws if invalid
 */
export function validateEventId(value: unknown): number {
  if (!isValidEventId(value)) {
    throw new ValidationError(
      'Event ID must be a positive integer',
      ErrorCode.INVALID_ID,
      { field: 'id', value, expected: 'positive integer' }
    );
  }
  return value;
}

/**
 * Checks if a value is a valid old/new value (null or object)
 */
export function isValidEventValue(value: unknown): value is Record<string, unknown> | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  // Check that it's JSON-serializable
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an event value (oldValue or newValue) and throws if invalid
 */
export function validateEventValue(value: unknown, field: string): Record<string, unknown> | null {
  if (!isValidEventValue(value)) {
    throw new ValidationError(
      `${field} must be null or a JSON-serializable object`,
      ErrorCode.INVALID_INPUT,
      { field, value, expected: 'null or object' }
    );
  }
  return value;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Event
 */
export function isEvent(value: unknown): value is Event {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields exist and have correct types
  if (!isValidEventId(obj.id)) return false;
  if (typeof obj.elementId !== 'string' || obj.elementId.length === 0) return false;
  if (!isValidEventType(obj.eventType)) return false;
  if (typeof obj.actor !== 'string' || obj.actor.length === 0) return false;
  if (!isValidEventValue(obj.oldValue)) return false;
  if (!isValidEventValue(obj.newValue)) return false;
  if (!isValidTimestamp(obj.createdAt)) return false;

  return true;
}

/**
 * Type guard for EventWithoutId
 */
export function isEventWithoutId(value: unknown): value is EventWithoutId {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Should not have an id field, or id should be undefined
  if ('id' in obj && obj.id !== undefined) return false;

  // Check required fields
  if (typeof obj.elementId !== 'string' || obj.elementId.length === 0) return false;
  if (!isValidEventType(obj.eventType)) return false;
  if (typeof obj.actor !== 'string' || obj.actor.length === 0) return false;
  if (!isValidEventValue(obj.oldValue)) return false;
  if (!isValidEventValue(obj.newValue)) return false;
  if (!isValidTimestamp(obj.createdAt)) return false;

  return true;
}

/**
 * Comprehensive validation of an event with detailed errors
 */
export function validateEvent(value: unknown): Event {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Event must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate id
  validateEventId(obj.id);

  // Validate elementId
  if (typeof obj.elementId !== 'string' || obj.elementId.length === 0) {
    throw new ValidationError(
      'Event elementId is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'elementId', value: obj.elementId }
    );
  }

  // Validate eventType
  validateEventType(obj.eventType);

  // Validate actor
  if (typeof obj.actor !== 'string' || obj.actor.length === 0) {
    throw new ValidationError(
      'Event actor is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'actor', value: obj.actor }
    );
  }

  // Validate oldValue and newValue
  validateEventValue(obj.oldValue, 'oldValue');
  validateEventValue(obj.newValue, 'newValue');

  // Validate createdAt
  validateTimestamp(obj.createdAt, 'createdAt');

  return value as Event;
}

/**
 * Validates an EventWithoutId
 */
export function validateEventWithoutId(value: unknown): EventWithoutId {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Event must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate elementId
  if (typeof obj.elementId !== 'string' || obj.elementId.length === 0) {
    throw new ValidationError(
      'Event elementId is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'elementId', value: obj.elementId }
    );
  }

  // Validate eventType
  validateEventType(obj.eventType);

  // Validate actor
  if (typeof obj.actor !== 'string' || obj.actor.length === 0) {
    throw new ValidationError(
      'Event actor is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'actor', value: obj.actor }
    );
  }

  // Validate oldValue and newValue
  validateEventValue(obj.oldValue, 'oldValue');
  validateEventValue(obj.newValue, 'newValue');

  // Validate createdAt
  validateTimestamp(obj.createdAt, 'createdAt');

  return value as EventWithoutId;
}

// ============================================================================
// Event Filter Validation
// ============================================================================

/**
 * Checks if a value is a valid EventFilter
 */
export function isValidEventFilter(value: unknown): value is EventFilter {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check optional elementId
  if (obj.elementId !== undefined && (typeof obj.elementId !== 'string' || obj.elementId.length === 0)) {
    return false;
  }

  // Check optional eventType (single or array)
  if (obj.eventType !== undefined) {
    if (Array.isArray(obj.eventType)) {
      if (!obj.eventType.every(isValidEventType)) {
        return false;
      }
    } else if (!isValidEventType(obj.eventType)) {
      return false;
    }
  }

  // Check optional actor
  if (obj.actor !== undefined && (typeof obj.actor !== 'string' || obj.actor.length === 0)) {
    return false;
  }

  // Check optional timestamps
  if (obj.after !== undefined && !isValidTimestamp(obj.after)) {
    return false;
  }
  if (obj.before !== undefined && !isValidTimestamp(obj.before)) {
    return false;
  }

  // Check optional limit
  if (obj.limit !== undefined && (typeof obj.limit !== 'number' || !Number.isInteger(obj.limit) || obj.limit < 1)) {
    return false;
  }

  // Check optional offset
  if (obj.offset !== undefined && (typeof obj.offset !== 'number' || !Number.isInteger(obj.offset) || obj.offset < 0)) {
    return false;
  }

  return true;
}

/**
 * Validates an EventFilter and throws if invalid
 */
export function validateEventFilter(value: unknown): EventFilter {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(
      'EventFilter must be a plain object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate optional elementId
  if (obj.elementId !== undefined && (typeof obj.elementId !== 'string' || obj.elementId.length === 0)) {
    throw new ValidationError(
      'EventFilter elementId must be a non-empty string',
      ErrorCode.INVALID_INPUT,
      { field: 'elementId', value: obj.elementId }
    );
  }

  // Validate optional eventType
  if (obj.eventType !== undefined) {
    if (Array.isArray(obj.eventType)) {
      obj.eventType.forEach((et, index) => {
        if (!isValidEventType(et)) {
          throw new ValidationError(
            `Invalid event type at index ${index}: ${et}`,
            ErrorCode.INVALID_INPUT,
            { field: 'eventType', value: et, expected: ALL_EVENT_TYPES }
          );
        }
      });
    } else {
      validateEventType(obj.eventType);
    }
  }

  // Validate optional actor
  if (obj.actor !== undefined && (typeof obj.actor !== 'string' || obj.actor.length === 0)) {
    throw new ValidationError(
      'EventFilter actor must be a non-empty string',
      ErrorCode.INVALID_INPUT,
      { field: 'actor', value: obj.actor }
    );
  }

  // Validate optional timestamps
  if (obj.after !== undefined) {
    validateTimestamp(obj.after, 'after');
  }
  if (obj.before !== undefined) {
    validateTimestamp(obj.before, 'before');
  }

  // Validate optional limit
  if (obj.limit !== undefined) {
    if (typeof obj.limit !== 'number' || !Number.isInteger(obj.limit) || obj.limit < 1) {
      throw new ValidationError(
        'EventFilter limit must be a positive integer',
        ErrorCode.INVALID_INPUT,
        { field: 'limit', value: obj.limit, expected: 'positive integer' }
      );
    }
  }

  // Validate optional offset
  if (obj.offset !== undefined) {
    if (typeof obj.offset !== 'number' || !Number.isInteger(obj.offset) || obj.offset < 0) {
      throw new ValidationError(
        'EventFilter offset must be a non-negative integer',
        ErrorCode.INVALID_INPUT,
        { field: 'offset', value: obj.offset, expected: 'non-negative integer' }
      );
    }
  }

  return value as EventFilter;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new event
 */
export interface CreateEventInput {
  /** Element that was changed */
  elementId: ElementId;
  /** Category of change */
  eventType: EventType;
  /** Who made the change */
  actor: EntityId;
  /** Previous state (partial, null for creates) */
  oldValue: Record<string, unknown> | null;
  /** New state (partial, full element for creates) */
  newValue: Record<string, unknown> | null;
  /** Optional timestamp (defaults to now) */
  createdAt?: Timestamp;
}

/**
 * Creates a new event (without ID - ID is assigned by storage)
 *
 * Unlike other types, events do not use async ID generation since
 * event IDs are auto-incrementing integers assigned by the storage layer.
 */
export function createEvent(input: CreateEventInput): EventWithoutId {
  // Validate elementId
  if (typeof input.elementId !== 'string' || input.elementId.length === 0) {
    throw new ValidationError(
      'Event elementId is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'elementId', value: input.elementId }
    );
  }

  // Validate eventType
  const eventType = validateEventType(input.eventType);

  // Validate actor
  if (typeof input.actor !== 'string' || input.actor.length === 0) {
    throw new ValidationError(
      'Event actor is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'actor', value: input.actor }
    );
  }

  // Validate oldValue and newValue
  validateEventValue(input.oldValue, 'oldValue');
  validateEventValue(input.newValue, 'newValue');

  // Validate createdAt if provided
  let createdAt: Timestamp;
  if (input.createdAt !== undefined) {
    createdAt = validateTimestamp(input.createdAt, 'createdAt');
  } else {
    createdAt = createTimestamp();
  }

  const event: EventWithoutId = {
    elementId: input.elementId,
    eventType,
    actor: input.actor,
    oldValue: input.oldValue,
    newValue: input.newValue,
    createdAt,
  };

  return event;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if an event is a lifecycle event
 */
export function isLifecycleEvent(event: Event | EventWithoutId): boolean {
  return Object.values(LifecycleEventType).includes(event.eventType as LifecycleEventType);
}

/**
 * Checks if an event is a dependency event
 */
export function isDependencyEvent(event: Event | EventWithoutId): boolean {
  return Object.values(DependencyEventType).includes(event.eventType as DependencyEventType);
}

/**
 * Checks if an event is a tag event
 */
export function isTagEvent(event: Event | EventWithoutId): boolean {
  return Object.values(TagEventType).includes(event.eventType as TagEventType);
}

/**
 * Checks if an event is a membership event
 */
export function isMembershipEvent(event: Event | EventWithoutId): boolean {
  return Object.values(MembershipEventType).includes(event.eventType as MembershipEventType);
}

/**
 * Checks if an event is a comment event
 */
export function isCommentEvent(event: Event | EventWithoutId): boolean {
  return Object.values(CommentEventType).includes(event.eventType as CommentEventType);
}

/**
 * Checks if an event is an automatic status transition event
 */
export function isAutoStatusEvent(event: Event | EventWithoutId): boolean {
  return Object.values(AutoStatusEventType).includes(event.eventType as AutoStatusEventType);
}

/**
 * Gets a human-readable display name for an event type
 */
export function getEventTypeDisplayName(eventType: EventType): string {
  const displayNames: Record<EventType, string> = {
    [EventType.CREATED]: 'Created',
    [EventType.UPDATED]: 'Updated',
    [EventType.CLOSED]: 'Closed',
    [EventType.REOPENED]: 'Reopened',
    [EventType.DELETED]: 'Deleted',
    [EventType.DEPENDENCY_ADDED]: 'Dependency Added',
    [EventType.DEPENDENCY_REMOVED]: 'Dependency Removed',
    [EventType.TAG_ADDED]: 'Tag Added',
    [EventType.TAG_REMOVED]: 'Tag Removed',
    [EventType.MEMBER_ADDED]: 'Member Added',
    [EventType.MEMBER_REMOVED]: 'Member Removed',
    [EventType.COMMENT_ADDED]: 'Comment Added',
    [EventType.COMMENT_UPDATED]: 'Comment Updated',
    [EventType.COMMENT_DELETED]: 'Comment Deleted',
    [EventType.COMMENT_RESOLVED]: 'Comment Resolved',
    [EventType.COMMENT_UNRESOLVED]: 'Comment Unresolved',
    [EventType.AUTO_BLOCKED]: 'Auto Blocked',
    [EventType.AUTO_UNBLOCKED]: 'Auto Unblocked',
  };
  return displayNames[eventType];
}

/**
 * Filters events by element ID
 */
export function filterEventsByElement<T extends Event | EventWithoutId>(
  events: T[],
  elementId: ElementId
): T[] {
  return events.filter((e) => e.elementId === elementId);
}

/**
 * Filters events by event type
 */
export function filterEventsByType<T extends Event | EventWithoutId>(
  events: T[],
  eventType: EventType | EventType[]
): T[] {
  const types = Array.isArray(eventType) ? eventType : [eventType];
  return events.filter((e) => types.includes(e.eventType));
}

/**
 * Filters events by actor
 */
export function filterEventsByActor<T extends Event | EventWithoutId>(
  events: T[],
  actor: EntityId
): T[] {
  return events.filter((e) => e.actor === actor);
}

/**
 * Filters events by time range
 */
export function filterEventsByTimeRange<T extends Event | EventWithoutId>(
  events: T[],
  after?: Timestamp,
  before?: Timestamp
): T[] {
  return events.filter((e) => {
    if (after && e.createdAt < after) return false;
    if (before && e.createdAt > before) return false;
    return true;
  });
}

/**
 * Sorts events by creation time (oldest first)
 */
export function sortEventsByTime<T extends Event | EventWithoutId>(
  events: T[],
  descending: boolean = false
): T[] {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return descending ? sorted.reverse() : sorted;
}

/**
 * Applies an EventFilter to an array of events
 */
export function applyEventFilter<T extends Event | EventWithoutId>(
  events: T[],
  filter: EventFilter
): T[] {
  let result = events;

  if (filter.elementId) {
    result = filterEventsByElement(result, filter.elementId);
  }

  if (filter.eventType) {
    result = filterEventsByType(result, filter.eventType);
  }

  if (filter.actor) {
    result = filterEventsByActor(result, filter.actor);
  }

  if (filter.after || filter.before) {
    result = filterEventsByTimeRange(result, filter.after, filter.before);
  }

  // Apply offset
  if (filter.offset && filter.offset > 0) {
    result = result.slice(filter.offset);
  }

  // Apply limit
  if (filter.limit && filter.limit > 0) {
    result = result.slice(0, filter.limit);
  }

  return result;
}

/**
 * Computes the changed fields between old and new values
 */
export function computeChangedFields(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
): string[] {
  if (oldValue === null && newValue === null) {
    return [];
  }

  if (oldValue === null) {
    return newValue ? Object.keys(newValue).sort() : [];
  }

  if (newValue === null) {
    return Object.keys(oldValue).sort();
  }

  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
  const changedFields: string[] = [];

  for (const key of allKeys) {
    const oldVal = oldValue[key];
    const newVal = newValue[key];

    // Simple comparison - deep comparison would be needed for nested objects
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changedFields.push(key);
    }
  }

  return changedFields.sort();
}

// ============================================================================
// Reconstruction Utilities
// ============================================================================

/**
 * Applies an event to a state object to produce the next state.
 *
 * For 'created' events: Returns the newValue as the initial state
 * For 'updated' events: Merges newValue into current state
 * For 'deleted' events: Returns null (element was deleted)
 * For other events (dependency, tag, membership): Updates specific fields
 *
 * @param currentState - The current state (null if element doesn't exist yet)
 * @param event - The event to apply
 * @returns The new state after applying the event, or null if deleted
 */
export function applyEventToState(
  currentState: Record<string, unknown> | null,
  event: Event | EventWithoutId
): Record<string, unknown> | null {
  const { eventType, newValue } = event;

  switch (eventType) {
    case EventType.CREATED:
      // Created event - newValue is the full initial element
      return newValue ? { ...newValue } : null;

    case EventType.UPDATED:
    case EventType.CLOSED:
    case EventType.REOPENED:
      // Update events - newValue contains the full updated state
      if (newValue === null) {
        return currentState;
      }
      return { ...newValue };

    case EventType.DELETED:
      // Deleted event - element is tombstoned
      return null;

    case EventType.DEPENDENCY_ADDED:
    case EventType.DEPENDENCY_REMOVED:
      // Dependency events don't change element state directly
      // (dependencies are stored in a separate table)
      return currentState;

    case EventType.TAG_ADDED:
    case EventType.TAG_REMOVED:
      // Tag events - update the tags array if tracking in element state
      // Tags are typically stored separately, but may be in element state
      if (!currentState) return null;
      if (newValue && 'tags' in newValue) {
        return { ...currentState, tags: newValue.tags };
      }
      return currentState;

    case EventType.MEMBER_ADDED:
    case EventType.MEMBER_REMOVED:
      // Membership events - update the members array
      if (!currentState) return null;
      if (newValue && 'members' in newValue) {
        return { ...currentState, members: newValue.members };
      }
      return currentState;

    case EventType.AUTO_BLOCKED:
    case EventType.AUTO_UNBLOCKED:
      // Auto status events - update the status field
      if (!currentState) return null;
      if (newValue && 'status' in newValue) {
        return { ...currentState, status: newValue.status };
      }
      return currentState;

    default:
      // Unknown event type - return current state unchanged
      return currentState;
  }
}

/**
 * Reconstructs element state at a specific point in time by replaying events.
 *
 * @param events - All events for the element (oldest first recommended)
 * @param asOf - Target timestamp to reconstruct state at
 * @returns Object with the reconstructed state and metadata
 */
export function reconstructStateAtTime(
  events: Event[],
  asOf: Timestamp
): { state: Record<string, unknown> | null; eventsApplied: number; exists: boolean } {
  // Sort events by createdAt (oldest first) for correct replay order
  const sortedEvents = sortEventsByTime(events, false);

  let currentState: Record<string, unknown> | null = null;
  let eventsApplied = 0;
  let exists = false;

  for (const event of sortedEvents) {
    // Stop if event is after the target timestamp
    if (event.createdAt > asOf) {
      break;
    }

    // Apply the event
    currentState = applyEventToState(currentState, event);
    eventsApplied++;

    // Track existence
    if (event.eventType === EventType.CREATED) {
      exists = true;
    } else if (event.eventType === EventType.DELETED) {
      exists = false;
    }
  }

  return { state: currentState, eventsApplied, exists };
}

/**
 * Generates a human-readable summary of an event.
 *
 * @param event - The event to summarize
 * @returns A human-readable description of what changed
 */
export function generateEventSummary(event: Event | EventWithoutId): string {
  const { eventType, oldValue, newValue, actor } = event;

  switch (eventType) {
    case EventType.CREATED:
      return `Created by ${actor}`;

    case EventType.UPDATED: {
      const changedFields = computeChangedFields(oldValue, newValue);
      if (changedFields.length === 0) {
        return `Updated by ${actor} (no field changes detected)`;
      }
      if (changedFields.length <= 3) {
        return `Updated ${changedFields.join(', ')} by ${actor}`;
      }
      return `Updated ${changedFields.length} fields by ${actor}`;
    }

    case EventType.CLOSED: {
      const reason = newValue?.closedReason ?? newValue?.reason;
      return reason
        ? `Closed by ${actor}: ${reason}`
        : `Closed by ${actor}`;
    }

    case EventType.REOPENED:
      return `Reopened by ${actor}`;

    case EventType.DELETED: {
      const reason = newValue?.reason;
      return reason
        ? `Deleted by ${actor}: ${reason}`
        : `Deleted by ${actor}`;
    }

    case EventType.DEPENDENCY_ADDED: {
      const otherId = newValue?.blockerId ?? newValue?.blockedId ?? 'unknown';
      const depType = newValue?.type ?? 'dependency';
      return `Added ${depType} to ${otherId} by ${actor}`;
    }

    case EventType.DEPENDENCY_REMOVED: {
      const otherId = oldValue?.blockerId ?? oldValue?.blockedId ?? 'unknown';
      const depType = oldValue?.type ?? 'dependency';
      return `Removed ${depType} from ${otherId} by ${actor}`;
    }

    case EventType.TAG_ADDED: {
      const tag = newValue?.tag ?? 'tag';
      return `Added tag "${tag}" by ${actor}`;
    }

    case EventType.TAG_REMOVED: {
      const tag = oldValue?.tag ?? 'tag';
      return `Removed tag "${tag}" by ${actor}`;
    }

    case EventType.MEMBER_ADDED: {
      const member = newValue?.addedMember ?? 'member';
      return `Added member ${member} by ${actor}`;
    }

    case EventType.MEMBER_REMOVED: {
      const member = newValue?.removedMember ?? 'member';
      const selfRemoval = newValue?.selfRemoval;
      return selfRemoval
        ? `${member} left`
        : `Removed member ${member} by ${actor}`;
    }

    case EventType.AUTO_BLOCKED:
      return `Automatically blocked (dependency not satisfied)`;

    case EventType.AUTO_UNBLOCKED:
      return `Automatically unblocked (blockers resolved)`;

    default:
      return `${getEventTypeDisplayName(eventType)} by ${actor}`;
  }
}

/**
 * Generates timeline snapshots from a sequence of events.
 *
 * @param events - Events to generate timeline from (will be sorted oldest first)
 * @returns Array of timeline snapshots showing state evolution
 */
export function generateTimelineSnapshots(
  events: Event[]
): { event: Event; state: Record<string, unknown> | null; summary: string }[] {
  // Sort events oldest first
  const sortedEvents = sortEventsByTime(events, false);

  const snapshots: { event: Event; state: Record<string, unknown> | null; summary: string }[] = [];
  let currentState: Record<string, unknown> | null = null;

  for (const event of sortedEvents) {
    currentState = applyEventToState(currentState, event);
    const summary = generateEventSummary(event);
    snapshots.push({
      event,
      state: currentState ? { ...currentState } : null,
      summary,
    });
  }

  return snapshots;
}
