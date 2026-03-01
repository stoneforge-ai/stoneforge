# Understanding the Dependency System

How elements relate to each other and why blocking semantics matter.

## The Dependency Model

Dependencies connect elements in a directed graph. Each dependency has:
- **blockedId** - The element that is blocked (waiting)
- **blockerId** - The element that is blocking (must complete first)
- **type** - The nature of the relationship

The composite key is `(blockedId, blockerId, type)`, allowing multiple relationship types between the same pair of elements.

## Dependency Categories

### Blocking Dependencies

These affect whether work can proceed:

| Type | Who Waits | Use Case |
|------|-----------|----------|
| `blocks` | Blocked waits for blocker | Task A must finish before Task B |
| `parent-child` | Blocked (child) waits for blocker (parent) | Plan contains tasks |
| `awaits` | Blocked (waiter) waits for blocker (gate) | Approval gates, timers |

For `blocks` type:
- **blockedId** = the task that is waiting
- **blockerId** = the task that must complete first

```
blocks:       blockedId (the waiting task) ← blockerId (must complete first)

parent-child: blockedId (child) → blockerId (parent)

awaits:       blockedId (waiter) → blockerId (gate)
```

### Associative Dependencies

Non-blocking knowledge graph connections:

| Type | Meaning | Directionality |
|------|---------|----------------|
| `relates-to` | Semantic link | Bidirectional |
| `references` | Citation | Unidirectional |
| `supersedes` | Version chain | Unidirectional |
| `duplicates` | Deduplication marker | Bidirectional |
| `caused-by` | Audit trail causation | Unidirectional |
| `validates` | Test verification | Unidirectional |
| `mentions` | @mention reference | Unidirectional |

### Attribution Dependencies

Link elements to entities:

| Type | Meaning |
|------|---------|
| `authored-by` | Creator attribution |
| `assigned-to` | Responsibility assignment |
| `approved-by` | Sign-off approval |

### Threading Dependencies

Message conversations:

| Type | Meaning |
|------|---------|
| `replies-to` | Thread parent reference |

## The `blocked` Status

The `blocked` status is **computed, never set directly**. An element is blocked when:

1. It has unresolved `blocks` dependencies (something blocking it hasn't closed)
2. Its parent hasn't closed (for `parent-child`)
3. A gate condition isn't satisfied (for `awaits`)

### BlockedCacheService

The `BlockedCacheService` maintains O(1) lookup for blocked status:

```typescript
const blockedCache = createBlockedCacheService(storage);

// Check if blocked
blockedCache.isBlocked(taskId);  // O(1)

// Get all blocked elements
blockedCache.getAllBlocked();  // Returns BlockingInfo[] (elementId, blockedBy, reason, previousStatus)

// Get what's blocked by a specific element
blockedCache.getBlockedBy(blockerId);
```

### Auto-Transitions

When blockers resolve, the cache triggers automatic status transitions:

```typescript
// Enable auto-transitions
blockedCache.setStatusTransitionCallback({
  onBlock: (elementId, previousStatus) => {
    // Called when element becomes blocked; previousStatus is saved for restoration
    api.update(elementId, { status: 'blocked' });
  },
  onUnblock: (elementId, statusToRestore) => {
    // Called when all blockers resolve; statusToRestore is the pre-blocked status
    api.update(elementId, { status: statusToRestore });
  },
});
```

These generate `auto_blocked` and `auto_unblocked` events with actor `'system:blocked-cache'`.

## Direction Semantics Deep Dive

### `blocks` - Blocked Waits for Blocker

"Task B is blocked by Task A" means:
- Task B cannot proceed until Task A closes
- blockedId: Task B (the one waiting)
- blockerId: Task A (must complete first)

```typescript
// Task B waits for Task A
await api.addDependency({
  blockedId: taskB.id,  // The one being blocked
  blockerId: taskA.id,  // The blocker (must complete first)
  type: 'blocks',
  createdBy: actorId,
});
```

### `parent-child` - Child in Plan

A plan contains tasks. The plan's `blocked` status depends on its children:

```typescript
// Create task as child of plan
await api.addDependency({
  blockedId: taskId,    // The child
  blockerId: planId,    // The parent
  type: 'parent-child',
  createdBy: actorId,
});
```

**Important:** Parent-child doesn't actually block the parent. Instead, plans track completion through their children's status.

### `awaits` - Gate Dependencies

For time-based, approval-based, or external conditions:

```typescript
// Timer gate - wait until a specific time
await api.addDependency({
  blockedId: taskId,
  blockerId: gateId,
  type: 'awaits',
  metadata: {
    gateType: 'timer',
    waitUntil: '2024-01-20T09:00:00.000Z',
  },
  createdBy: actorId,
});

// Approval gate - wait for approvers
await api.addDependency({
  blockedId: taskId,
  blockerId: gateId,
  type: 'awaits',
  metadata: {
    gateType: 'approval',
    requiredApprovers: ['manager-1', 'lead-1'],
    approvalCount: 1,  // Need 1 of 2
    currentApprovers: [],
  },
  createdBy: actorId,
});

// External gate - wait for external system
await api.addDependency({
  blockedId: taskId,
  blockerId: gateId,
  type: 'awaits',
  metadata: {
    gateType: 'external',
    externalSystem: 'ci',
    externalId: 'build-123',
    satisfied: false,
  },
  createdBy: actorId,
});
```

## Cycle Detection

Cycles in blocking dependencies create deadlocks. The system detects them:

```typescript
import { createDependencyService } from '@stoneforge/quarry';

const depService = createDependencyService(storage);

// Check BEFORE adding (returns CycleDetectionResult, not boolean)
const result = depService.detectCycle(taskA.id, taskB.id, 'blocks');
if (result.hasCycle) {
  throw new Error(`Would create circular dependency: ${result.cyclePath?.join(' -> ')}`);
}
```

**Note:** `api.addDependency()` does NOT auto-check for cycles. Use `DependencyService.detectCycle()` manually before adding blocking dependencies for detailed results (cycle path, nodes visited, depth limit status). Self-referential dependencies are rejected immediately with `CYCLE_DETECTED`.

Cycle detection:
- Only applies to blocking dependency types
- Has a depth limit of 100 levels
- Self-references are rejected immediately with `CYCLE_DETECTED`

## Bidirectional `relates-to`

The `relates-to` type is bidirectional but stored normalized (smaller ID is always blockedId):

```typescript
// Either of these creates the same dependency:
await api.addDependency({ blockedId: 'a', blockerId: 'b', type: 'relates-to' });
await api.addDependency({ blockedId: 'b', blockerId: 'a', type: 'relates-to' });

// To find all related elements, query both directions:
const outgoing = await api.getDependencies(id, ['relates-to']);
const incoming = await api.getDependents(id, ['relates-to']);
const allRelated = [...new Set([
  ...outgoing.map(d => d.blockerId),
  ...incoming.map(d => d.blockedId),
])];
```

Helper function:

```typescript
import { normalizeRelatesToDependency, areRelated } from '@stoneforge/core';

// Normalize for consistent storage
const { blockedId, blockerId } = normalizeRelatesToDependency(elementA, elementB);

// Check if related
const related = areRelated(dependencies, elementA, elementB);
```

## Querying Dependencies

### Outgoing (what this element depends on)

```typescript
const deps = await api.getDependencies(elementId);
// With type filter
const blockingDeps = await api.getDependencies(elementId, ['blocks', 'awaits']);
```

### Incoming (what depends on this element)

```typescript
const dependents = await api.getDependents(elementId);
const blockedByThis = await api.getDependents(elementId, ['blocks']);
```

### Dependency Tree

```typescript
const tree = await api.getDependencyTree(elementId);
```

## Common Patterns

### Task Sequencing

```typescript
// Task 2 waits for Task 1
await api.addDependency({
  blockedId: task2.id,
  blockerId: task1.id,
  type: 'blocks',
  createdBy: actorId,
});

// Task 3 waits for Task 2
await api.addDependency({
  blockedId: task3.id,
  blockerId: task2.id,
  type: 'blocks',
  createdBy: actorId,
});
```

### Approval Workflow

```typescript
// Create gate
const gate = await api.create({
  type: 'task',
  title: 'Approval Gate',
  ...
});

// Deploy waits for approval
await api.addDependency({
  blockedId: deployTask.id,
  blockerId: gate.id,
  type: 'awaits',
  metadata: {
    gateType: 'approval',
    requiredApprovers: ['security-team', 'ops-team'],
    approvalCount: 2,
    currentApprovers: [],
  },
  createdBy: actorId,
});

// When approved:
await api.recordApproval(deployTask.id, gate.id, 'security-team');
await api.recordApproval(deployTask.id, gate.id, 'ops-team');
// deployTask automatically unblocked
```

### Document References

```typescript
// Task references a spec document
await api.addDependency({
  blockedId: task.id,
  blockerId: specDoc.id,
  type: 'references',
  createdBy: actorId,
});

// Link related documents
await api.addDependency({
  blockedId: doc1.id,
  blockerId: doc2.id,
  type: 'relates-to',
  createdBy: actorId,
});
```

## Gotchas

1. **`blocked` is computed** - Never set `status: 'blocked'` directly. The system computes it from dependencies.

2. **Direction matters** - For `blocks`, `blockedId` is the waiting task and `blockerId` is what must complete first.

3. **Cycles auto-checked** - `api.addDependency()` auto-checks for cycles on blocking types and throws `CYCLE_DETECTED`. Use `detectCycle()` for detailed results.

4. **`relates-to` is normalized** - Always query both directions to find all related elements.

5. **Parent-child doesn't block plans** - Plans don't become "blocked" based on children. Use task blocking for sequencing.

6. **Cascade delete** - Deleting an element removes all its dependencies (both directions).

7. **No transitive blocking** - If A blocks B and B blocks C, closing A doesn't unblock C. Each must resolve independently.

## Related Documentation

- [How to Work with Dependencies](../how-to/work-with-dependencies.md) - Practical guide
- [Core Types Reference](../reference/core-types.md) - Dependency type details
- [SDK Services Reference](../reference/sdk-services.md) - BlockedCacheService API
