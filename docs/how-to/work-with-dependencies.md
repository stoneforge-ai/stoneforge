# How to Work with Dependencies

Guide for managing relationships between elements.

## Dependency Types

| Type | Blocking? | Direction | Use Case |
|------|-----------|-----------|----------|
| `blocks` | Yes | Blocked waits for blocker | Task A must complete before B |
| `parent-child` | Yes | Blocked (child) → blocker (parent) | Plan contains tasks |
| `awaits` | Yes | Blocked (waiter) → blocker (gate) | Approval gates, timers |
| `relates-to` | No | Bidirectional | Semantic links |
| `references` | No | Blocked → Blocker | Citations |
| `replies-to` | No | Blocked → Blocker | Message threading |
| `mentions` | No | Blocked → Blocker | @mention reference |

## Adding Dependencies

### Using the API

```typescript
import { createQuarryAPI } from '@stoneforge/quarry';

const api = await createQuarryAPI();

// Add blocking dependency
// "taskA is blocked BY taskB" (taskB must complete first)
await api.addDependency({
  blockedId: taskA.id,
  blockerId: taskB.id,
  type: 'blocks',
  createdBy: actorId,
});

// Add parent-child (plan contains task)
await api.addDependency({
  blockedId: taskId,
  blockerId: planId,
  type: 'parent-child',
  createdBy: actorId,
});

// Add with metadata (for awaits gates)
await api.addDependency({
  blockedId: taskId,
  blockerId: approvalGateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'approval',
    requiredApprovers: ['manager-1', 'lead-1'],
    requiredCount: 1,
    currentApprovers: [],
  },
});
```

### Using the CLI

```bash
# Add blocking dependency
# A is blocked BY B (B must complete first)
sf dependency add --type=blocks A B

# Add parent-child
sf dependency add --type=parent-child task-1 plan-1

# Add relates-to
sf dependency add --type=relates-to doc-1 doc-2
```

## Removing Dependencies

### API

```typescript
await api.removeDependency(blockedId, blockerId, 'blocks');
```

### CLI

```bash
sf dependency remove A B --type=blocks
```

## Querying Dependencies

### Get Outgoing (what this depends on)

```typescript
const deps = await api.getDependencies(elementId);
// With type filter
const blockingDeps = await api.getDependencies(elementId, ['blocks']);
```

### Get Incoming (what depends on this)

```typescript
const dependents = await api.getDependents(elementId);
const blockedBy = await api.getDependents(elementId, ['blocks']);
```

### CLI

```bash
# Outgoing
sf dependency list task-1 --direction out

# Incoming
sf dependency list task-1 --direction in

# Both
sf dependency list task-1 --direction both

# With type filter
sf dependency list task-1 --type blocks
```

### Dependency Tree

```typescript
const tree = await api.getDependencyTree(elementId);
```

```bash
sf dependency tree task-1
```

## Understanding Blocking

### Direction Semantics

| Type | blockedId | blockerId | Who waits? |
|------|-----------|-----------|------------|
| `blocks` | the waiting task | must complete first | **blockedId** waits |
| `parent-child` | child | parent | **blockedId** waits |
| `awaits` | waiter | gate | **blockedId** waits |

Example:
```typescript
// "Task B is blocked by Task A"
await api.addDependency({
  blockedId: taskB.id,  // The one being blocked (waiting)
  blockerId: taskA.id,  // The blocker (must complete first)
  type: 'blocks',
});
```

### Checking Blocked Status

```typescript
// Get all blocked tasks
const blocked = await api.blocked();

// Check specific task
const blockedTasks = await api.blocked();
const isBlocked = blockedTasks.some(t => t.id === taskId);

// Using BlockedCacheService directly
import { createBlockedCacheService } from '@stoneforge/quarry';

const blockedCache = createBlockedCacheService(storage);
const isBlocked = blockedCache.isBlocked(taskId);
const allBlocked = blockedCache.getAllBlocked();
const blockedByThis = blockedCache.getBlockedBy(blockerId);
```

### Auto-Transitions

The BlockedCacheService automatically transitions tasks:
- When all blockers complete → task becomes `open`
- When a blocker is added → task becomes `blocked`

```typescript
// Enable auto-transitions
blockedCache.setStatusTransitionCallback((elementId, newStatus, reason) => {
  return api.update(elementId, { status: newStatus });
});
```

Events generated: `auto_blocked`, `auto_unblocked` with actor `'system:blocked-cache'`

## Gate Dependencies (awaits)

### Timer Gate

```typescript
await api.addDependency({
  blockedId: taskId,
  blockerId: gateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'timer',
    waitUntil: '2024-01-15T10:00:00.000Z',
  },
});
```

Satisfied when: Current time >= `waitUntil`

### Approval Gate

```typescript
await api.addDependency({
  blockedId: taskId,
  blockerId: gateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'approval',
    requiredApprovers: ['manager-1', 'lead-1'],
    requiredCount: 1,  // Need 1 of the 2
    currentApprovers: [],
  },
});

// Record approval
await api.recordApproval(blockedId, blockerId, 'manager-1');

// Remove approval
await api.removeApproval(blockedId, blockerId, 'manager-1');
```

Satisfied when: `currentApprovers.length >= requiredCount`

### External Gate

```typescript
await api.addDependency({
  blockedId: taskId,
  blockerId: gateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'external',
    satisfied: false,
  },
});

// Satisfy the gate
await api.satisfyGate(blockedId, blockerId, actorId);
```

Satisfied when: `metadata.satisfied === true`

### Webhook Gate

Same as external, but triggered by webhook callback.

## Bidirectional Dependencies

`relates-to` is stored normalized (smaller ID is always blockedId):

```typescript
// Either of these creates the same dependency:
await api.addDependency({ blockedId: 'a', blockerId: 'b', type: 'relates-to' });
await api.addDependency({ blockedId: 'b', blockerId: 'a', type: 'relates-to' });

// Query both directions to find all related:
const outgoing = await api.getDependencies(id, ['relates-to']);
const incoming = await api.getDependents(id, ['relates-to']);
const allRelated = [...outgoing, ...incoming];
```

## Cycle Detection

```typescript
import { createDependencyService } from '@stoneforge/quarry';

const depService = createDependencyService(storage);

// Check before adding
const hasCycle = depService.detectCycle(blockedId, blockerId, 'blocks');
if (hasCycle) {
  throw new Error('Would create a cycle');
}

await api.addDependency({ blockedId, blockerId, type: 'blocks' });
```

**Warning:** `api.addDependency()` does NOT check cycles automatically. Check manually!

- Depth limit: 100 levels
- Only checked for blocking types
- Self-referential rejected immediately with `CYCLE_DETECTED`

## Common Patterns

### Task Hierarchy

```typescript
// Create plan
const plan = await api.create({ type: 'plan', title: 'Sprint 1', ... });

// Create tasks in plan
const task1 = await api.createTaskInPlan(plan.id, { title: 'Task 1', ... });
const task2 = await api.createTaskInPlan(plan.id, { title: 'Task 2', ... });

// Add blocking between tasks
await api.addDependency({
  blockedId: task2.id,
  blockerId: task1.id,
  type: 'blocks',  // task2 waits for task1
});
```

### Approval Workflow

```typescript
// Create review task
const reviewTask = await api.create({
  type: 'task',
  title: 'Review PR',
  ...
});

// Create deploy task that awaits approval
const deployTask = await api.create({
  type: 'task',
  title: 'Deploy to production',
  ...
});

await api.addDependency({
  blockedId: deployTask.id,
  blockerId: reviewTask.id,
  type: 'awaits',
  metadata: {
    gate: 'approval',
    requiredApprovers: ['tech-lead', 'product-owner'],
    requiredCount: 2,
    currentApprovers: [],
  },
});

// Later, approvers approve
await api.recordApproval(deployTask.id, reviewTask.id, 'tech-lead');
await api.recordApproval(deployTask.id, reviewTask.id, 'product-owner');
// deployTask is now unblocked
```

### Linking Related Items

```typescript
// Link related documents
await api.addDependency({
  blockedId: specDoc.id,
  blockerId: designDoc.id,
  type: 'relates-to',
});

// Link task to documentation
await api.addDependency({
  blockedId: task.id,
  blockerId: specDoc.id,
  type: 'references',
});
```

## Best Practices

### Use Draft Plans for Tasks with Dependencies

When creating multiple tasks with dependencies, **always use a draft plan** to prevent the dispatch daemon from assigning tasks before dependencies are set:

```bash
# 1. Create plan (defaults to draft)
sf plan create --title "Feature X"

# 2. Create tasks (not dispatchable yet)
sf task create --plan "Feature X" --title "Backend API"
sf task create --plan "Feature X" --title "Frontend UI"

# 3. Set dependencies
sf dependency add el-frontend el-backend --type blocks

# 4. Activate plan (tasks become dispatchable)
sf plan activate <plan-id>
```

Without this workflow, the dispatch daemon (which polls every 5 seconds) may assign tasks to workers before you finish setting up dependencies.

## Gotchas

1. **`blocked` is computed** - Never set `status: 'blocked'` directly
2. **Direction matters** - For `blocks`, `blockedId` is the waiting task, `blockerId` must complete first
3. **Cycles not auto-checked** - Call `detectCycle()` manually
4. **`relates-to` is normalized** - Query both directions
5. **Parent-child doesn't block plans** - Tasks in plan don't wait for plan status
6. **Cascade delete** - Deleting element removes its dependencies
7. **Draft plans gate dispatch** - Tasks in draft plans are excluded from `api.ready()` and won't be dispatched
