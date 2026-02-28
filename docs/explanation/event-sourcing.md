# Understanding Event Sourcing

Why Stoneforge uses events as the authoritative record of all changes.

## The Problem with State-Based Systems

Traditional systems store only the current state of data. When you update a task's status from "open" to "in_progress", the old status is overwritten and lost forever.

This creates problems:
- **No audit trail** - Who changed what, and when?
- **No time travel** - What did this task look like yesterday?
- **No accountability** - Which agent closed this incorrectly?
- **Conflict resolution** - Which update wins when two agents edit simultaneously?

## Events as First-Class Citizens

Stoneforge solves this by storing **events** rather than just **state**. Every mutation generates an immutable event record:

```typescript
interface Event {
  id: number;              // Auto-incrementing
  elementId: ElementId;    // What changed
  eventType: EventType;    // Category of change
  actor: EntityId;         // Who made the change
  oldValue: Record<string, unknown> | null;  // Previous state
  newValue: Record<string, unknown> | null;  // New state
  createdAt: Timestamp;    // When
}
```

Current state is **derived** from replaying events. The events are the source of truth; state is a cached computation.

## Event Types

Events are categorized by what changed:

### Lifecycle Events
Core element state changes:

| Event | Meaning | oldValue | newValue |
|-------|---------|----------|----------|
| `created` | New element | null | Full element |
| `updated` | Fields changed | Changed fields | New values |
| `closed` | Work completed | Prior state | With closedReason |
| `reopened` | Closed undone | Closed state | Open state |
| `deleted` | Soft delete | Prior state | null |

### Dependency Events
Relationship changes between elements:

| Event | Meaning |
|-------|---------|
| `dependency_added` | New relationship created |
| `dependency_removed` | Relationship deleted |

### Comment Events

| Event | Meaning |
|-------|---------|
| `comment_added` | Comment added to document |
| `comment_updated` | Comment content updated |
| `comment_deleted` | Comment soft-deleted |
| `comment_resolved` | Comment resolved |
| `comment_unresolved` | Comment unresolved |

### Other Events

| Event | Meaning |
|-------|---------|
| `tag_added` / `tag_removed` | Tag changes |
| `member_added` / `member_removed` | Collection membership |
| `auto_blocked` / `auto_unblocked` | System-triggered status changes |

## State Reconstruction

Given a sequence of events, you can reconstruct state at any point in time:

```typescript
import { reconstructStateAtTime } from '@stoneforge/core';

// Get all events for an element
const events = await api.events({ elementId: taskId });

// Reconstruct state as of yesterday
const yesterday = new Date(Date.now() - 86400000).toISOString();
const { state, eventsApplied, exists } = reconstructStateAtTime(events, yesterday);

console.log(`Applied ${eventsApplied} events`);
console.log(`Element ${exists ? 'existed' : 'did not exist'} at that time`);
console.log('State:', state);
```

The `applyEventToState()` function handles each event type:

```typescript
function applyEventToState(current, event) {
  switch (event.eventType) {
    case 'created':
      return event.newValue;  // Initialize state
    case 'updated':
    case 'closed':
    case 'reopened':
      return event.newValue;  // Replace with full updated state
    case 'deleted':
      return null;  // Element tombstoned
    case 'auto_blocked':
    case 'auto_unblocked':
      return { ...current, status: event.newValue.status };
    default:
      return current;  // Dependencies/tags stored separately
  }
}
```

## Why This Matters

### Complete Audit Trail

Every change is attributed and timestamped:

```typescript
const events = await api.events({
  elementId: taskId,
  eventType: ['updated', 'closed'],
});

events.forEach(e => {
  console.log(`${e.createdAt}: ${e.actor} - ${generateEventSummary(e)}`);
});
// 2024-01-15T10:30:00.000Z: worker-1 - Updated status, priority by worker-1
// 2024-01-15T11:45:00.000Z: worker-1 - Closed by worker-1: Implementation complete
```

### Debugging Agent Behavior

When something goes wrong, you can trace exactly what happened:

```typescript
// Find all actions by a specific agent
const agentEvents = await api.events({
  actor: 'buggy-agent',
  after: '2024-01-15T00:00:00.000Z',
});

// See what changed
agentEvents.forEach(e => {
  console.log(`${e.eventType} on ${e.elementId}`);
  console.log('Before:', e.oldValue);
  console.log('After:', e.newValue);
});
```

### Compliance and Reporting

Events enable compliance documentation without additional logging:

```typescript
// Weekly activity report
const weeklyEvents = await api.events({
  after: weekStart,
  before: weekEnd,
  eventType: ['created', 'closed'],
});

const created = weeklyEvents.filter(e => e.eventType === 'created').length;
const completed = weeklyEvents.filter(e => e.eventType === 'closed').length;
```

## Storage Model

Events are stored in SQLite with auto-incrementing IDs:

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  element_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  old_value TEXT,  -- JSON
  new_value TEXT,  -- JSON
  created_at TEXT NOT NULL
);

CREATE INDEX idx_events_element ON events(element_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_actor ON events(actor);
CREATE INDEX idx_events_time ON events(created_at);
```

Events are append-only. They are never updated or deleted (except for GDPR compliance scenarios handled separately).

## Events vs. JSONL Sync

The event system is distinct from the JSONL sync system:

| Aspect | Events (SQLite) | Sync (JSONL) |
|--------|-----------------|--------------|
| **Purpose** | Audit trail | Data portability |
| **Granularity** | Every mutation | Final state snapshots |
| **Storage** | SQL table | Append-only files |
| **Use case** | History queries | Git sync, backup |

Events capture the journey; JSONL captures the destination.

## Generating Timeline Snapshots

For debugging or visualization, generate complete timelines:

```typescript
import { generateTimelineSnapshots } from '@stoneforge/core';

const events = await api.events({ elementId: taskId });
const snapshots = generateTimelineSnapshots(events);

snapshots.forEach(({ event, state, summary }) => {
  console.log(`[${event.createdAt}] ${summary}`);
  console.log('  Status:', state?.status);
  console.log('  Priority:', state?.priority);
});
```

Output:
```
[2024-01-15T09:00:00.000Z] Created by director-1
  Status: open
  Priority: 3
[2024-01-15T09:30:00.000Z] Updated priority by director-1
  Status: open
  Priority: 1
[2024-01-15T10:00:00.000Z] Automatically blocked (dependency not satisfied)
  Status: blocked
  Priority: 1
[2024-01-15T11:00:00.000Z] Automatically unblocked (blockers resolved)
  Status: open
  Priority: 1
[2024-01-15T12:00:00.000Z] Closed by worker-1: Done
  Status: closed
  Priority: 1
```

## Key Takeaways

1. **Events are immutable** - Never modify or delete events
2. **State is derived** - Current state computed from events
3. **Full attribution** - Every change has an actor and timestamp
4. **Time travel** - Reconstruct any historical state
5. **Separate from sync** - Events are for audit, JSONL is for portability

## Related Documentation

- [Sync and Merge](./sync-and-merge.md) - How JSONL sync works
- [Core Types Reference](../reference/core-types.md) - Event type details
- [Storage Reference](../reference/storage.md) - Storage architecture
