# Understanding Agent Roles

How Stoneforge organizes work through Directors, Workers, and Stewards.

## The Three-Role Model

Stoneforge uses a hierarchical role system inspired by human organizational structures:

```
Human Operator
     │
     ▼
┌──────────┐
│ Director │ ← Plans, prioritizes, coordinates
└────┬─────┘
     │ delegates to
     ▼
┌──────────┐     ┌─────────┐
│ Workers  │     │ Stewards │
└──────────┘     └─────────┘
  Execute          Maintain
  tasks            system
```

Each role has distinct responsibilities and authority levels, preventing agents from overstepping while ensuring work flows efficiently.

## Director

The Director is the strategist and coordinator. There's typically one Director per system.

### Responsibilities
- **Planning** - Break down goals into tasks and plans
- **Prioritization** - Decide what matters most
- **Assignment** - Delegate tasks to appropriate Workers
- **Coordination** - Resolve blockers and conflicts
- **Communication** - Interface with human operators

### Authority
- Create plans and tasks
- Assign work to Workers
- Modify priorities
- Close/reopen tasks
- Send messages to any agent

### What Directors Don't Do
- Execute implementation tasks directly
- Manage maintenance tasks (that's Stewards)
- Bypass human-required approvals

### Example Prompt (Built-in)

```markdown
# Your Role: Director

You are the director agent in the Stoneforge orchestration system.

## Your Responsibilities
- Break down high-level goals into actionable tasks
- Create tasks or plans with tasks
- Set priorities and dependencies
- Report status to Human only when requested

## Who You Report To
- Human operator (final authority)

## Who Reports To You
- Worker agents
- Steward agents (status reports)
```

## Worker

Workers are the implementers. Multiple Workers operate in parallel.

### Worker Types

| Type | Session | Spawning | Merge Method | Use Case |
|------|---------|----------|--------------|----------|
| **Ephemeral** | Task-scoped | Spawned by Dispatch Daemon | `sf task complete` (PR-based) | Automated task execution |
| **Persistent** | Session-scoped | Started by Human | `sf merge` (squash merge) | Interactive work with human |

Each type receives a tailored prompt: ephemeral workers get `worker.md` with task lifecycle instructions (handoff, complete, auto-shutdown), while persistent workers get `persistent-worker.md` with direct operator collaboration instructions and `sf merge` workflow.

**Persistent worker worktree:** When a persistent worker session starts, the system automatically creates an isolated worktree on a `session/{worker-name}-{timestamp}` branch. The worker operates in this worktree and uses `sf merge` to squash-merge completed work into master. The worktree stays active for the next unit of work.

### Responsibilities
- **Execution** - Complete assigned tasks
- **Progress Reporting** - Update task status
- **Blocker Escalation** - Alert Director when stuck
- **Quality** - Ensure work meets requirements
- **Git Workflow** - Commit and push work with meaningful messages
- **Spontaneous Observation** - Proactively report issues discovered while working (security vulnerabilities, code quality problems, performance concerns, architecture issues) by sending channel messages, without waiting to be asked

### Authority
- Update tasks assigned to them
- Create subtasks under assigned tasks
- Send messages to Director and other Workers
- Send spontaneous channel messages to report observed issues (security, quality, performance, architecture)
- Request help via inbox

### What Workers Don't Do
- Assign work to other Workers (that's Director)
- Change system-wide priorities
- Modify tasks not assigned to them
- Perform system maintenance

### Example Prompt (Built-in)

```markdown
# Your Role: Worker

You are a worker agent in the Stoneforge orchestration system.

## Your Responsibilities
- Execute tasks assigned to you
- Report progress and blockers
- Request help when stuck
- Complete work to specification

## Who You Report To
- Director agent

## When to Ask for Help
- Blocked for more than 30 minutes
- Requirements unclear
- Need access or permissions
- Unexpected technical challenges
```

## Steward

Stewards handle maintenance and automated tasks. There are specialized Steward types.

### Responsibilities
- **Monitoring** - Watch for issues
- **Maintenance** - Clean up stale data
- **Automation** - Run scheduled tasks
- **Remediation** - Fix detected problems

### Authority
- Create maintenance tasks
- Update system status
- Perform automated cleanups
- Alert Director of issues

### Steward Focuses

| Focus | Responsibility |
|-------|---------------|
| `merge` | Review and process pull requests from completed tasks |
| `docs` | Scan and fix documentation issues, auto-merge fixes |

### Example Prompt (Merge Steward)

```markdown
# Your Role: Steward (Merge Focus)

You are a merge steward in the Stoneforge orchestration system.

## Your Responsibilities
- Monitor for sync conflicts
- Resolve merge issues automatically when possible
- Escalate complex conflicts to Director
- Maintain data consistency across replicas

## Decision Making
- Auto-resolve: Identical content, no conflict
- Auto-resolve: Clear LWW winner with no semantic conflict
- Escalate: Conflicting changes to same fields
- Escalate: Potential data loss scenarios
```

## Role Definitions

Roles are configured through `RoleDefinitionService`:

```typescript
import { createRoleDefinitionService } from '@stoneforge/smithy';

const roleDefService = createRoleDefinitionService(api, storage);

// Create a custom worker role
const roleDef = await roleDefService.createRoleDefinition({
  role: 'worker',
  name: 'Frontend Developer',
  systemPrompt: 'You specialize in React and TypeScript...',
  workerMode: 'ephemeral',
  tags: ['frontend', 'senior'],
  behaviors: {
    onStartup: 'Pull latest from main branch',
    onTaskAssigned: 'Read the full spec before coding',
    onStuck: 'Try for 30 min, then escalate',
    onError: 'Capture full stack trace',
  },
});
```

### Role Definition Fields

| Field | Purpose |
|-------|---------|
| `role` | Base role (director, worker, steward) |
| `name` | Display name |
| `systemPrompt` | Custom system prompt |
| `workerMode` | Worker type (`ephemeral` or `persistent`) |
| `tags` | Classification tags for the role |
| `behaviors` | Event-driven instructions |

## Prompts System

Each role has built-in prompts that can be customized.

### Built-in Prompts

Located in `packages/smithy/src/prompts/`:

```
prompts/
├── director.md           # Director role
├── worker.md             # Ephemeral worker role
├── persistent-worker.md  # Persistent worker role
├── steward-base.md       # Base steward (all focuses)
├── steward-merge.md      # Merge focus addendum
└── steward-docs.md       # Docs focus addendum
```

### Project Overrides

Override prompts by creating files in `.stoneforge/prompts/`:

```
my-project/
├── .stoneforge/
│   └── prompts/
│       ├── worker.md           # Override worker prompt
│       └── steward-merge.md    # Override merge steward
```

### Loading Prompts

```typescript
import { loadRolePrompt, buildAgentPrompt } from '@stoneforge/smithy';

// Load with project overrides
const result = loadRolePrompt('worker', undefined, {
  projectRoot: process.cwd(),
});

console.log(result?.source);  // 'built-in' or override path
console.log(result?.prompt);  // The prompt content

// Build complete prompt with context
const prompt = buildAgentPrompt({
  role: 'worker',
  taskContext: 'Implement OAuth login...',
  additionalInstructions: 'Use NextAuth.js',
  projectRoot: process.cwd(),
});
```

## Agent Registry

Active agents are tracked in the `AgentRegistry`:

```typescript
import { createAgentRegistry } from '@stoneforge/smithy';

const registry = createAgentRegistry(storage, api);

// Register an agent
const agent = await registry.registerAgent({
  entityId: 'worker-1',
  role: 'worker',
  roleDefinitionId: roleDef.id,
  sessionId: 'session-abc',
  status: 'active',
});

// Find available workers
const workers = await registry.getAgentsByRole('worker');
const available = workers.filter(a => a.status === 'active');
```

## Task Assignment

Tasks are assigned through the Dispatch Daemon, which handles all task dispatch logic:

1. **Director creates plan** in draft status (default)
2. **Director creates tasks** with priorities within the plan
3. **Director sets dependencies** between tasks
4. **Director activates plan** — tasks become dispatchable
5. **Dispatch Daemon polls** for ready, unassigned tasks via `api.ready()`
6. **Daemon assigns** highest priority task to next available ephemeral worker
7. **Worker spawns** in isolated worktree and receives task via dispatch message

Merge stewards are similarly dispatched by the daemon when tasks enter REVIEW status. The daemon assigns the task to the steward, tracks the session for recovery after restarts, and prevents duplicate dispatch.

**Important:** Tasks in draft plans are NOT dispatched. This prevents race conditions where the daemon assigns tasks before dependencies are set. Directors should always use plans when creating tasks with dependencies:

```bash
sf plan create --title "Feature X"                    # Draft by default
sf task create --plan "Feature X" --title "Task 1"
sf task create --plan "Feature X" --title "Task 2"
sf dependency add el-task2 el-task1 --type blocks           # Set dependencies
sf plan activate <plan-id>                            # NOW tasks dispatch
```

```typescript
import { createTaskAssignmentService } from '@stoneforge/smithy';

const assignmentService = createTaskAssignmentService(api);

// Assign task directly (used by dispatch daemon)
await assignmentService.assignToAgent(taskId, agentId, {
  branch: 'task/abc123-feature',
  worktree: 'agent/worker-1/abc123-feature',
});

// Get unassigned tasks
const unassigned = await assignmentService.getUnassignedTasks();
```

## Communication

Agents communicate through the inbox system:

```typescript
// Director sends to Worker
await api.sendMessage({
  senderId: directorId,
  recipientId: workerId,
  subject: 'New assignment',
  content: 'Please start on task-123',
});

// Worker checks inbox
const messages = await api.inbox.list(workerId);
```

Each agent has a dedicated channel for receiving messages. The Dispatch Daemon routes incoming messages by agent role.

## Lifecycle

### Agent Startup

1. Load role definition
2. Load system prompt (built-in or override)
3. Register with AgentRegistry
4. Dispatch Daemon handles inbox polling
5. Check for assigned tasks

### Agent Operation

```
┌─────────────────────────────────────┐
│           Main Loop                 │
├─────────────────────────────────────┤
│ 1. Poll inbox for messages          │
│ 2. Check assigned tasks             │
│ 3. Pick highest priority            │
│ 4. Execute task                     │
│ 5. Report progress                  │
│ 6. Handle blockers                  │
│ 7. Complete or escalate             │
│ 8. Repeat                           │
└─────────────────────────────────────┘
```

### Agent Shutdown

1. Complete or checkpoint current task
2. Update status to inactive
3. Deregister from AgentRegistry
4. Clean up session

## Agent Naming Conventions

When creating agents through the UI, names are auto-populated following these conventions:

| Agent Type | Naming Pattern | Examples |
|------------|----------------|----------|
| Director | `director` | `director` |
| Ephemeral Worker | `e-worker-{n}` | `e-worker-1`, `e-worker-2` |
| Persistent Worker | `p-worker-{n}` | `p-worker-1`, `p-worker-2` |
| Merge Steward | `m-steward-{n}` | `m-steward-1`, `m-steward-2` |
| Docs Steward | `d-steward-{n}` | `d-steward-1`, `d-steward-2` |

The sequential number is calculated based on existing agents of the same type. Auto-generated names are editable before submission.

## Best Practices

### For Directors
- Keep plans focused (5-10 tasks max)
- Set clear priorities and dependencies
- Report status only when Human requests it
- Create tasks with sufficient detail for workers

### For Workers
- Read task specs fully before starting
- Update status frequently
- Escalate early, not late
- Document blockers clearly

### For Stewards
- Run maintenance during low activity
- Log all automated actions
- Escalate uncertainty to Director
- Don't over-automate

## Related Documentation

- [How to Customize Agent Prompts](../how-to/customize-agent-prompts.md) - Practical guide
- [Orchestrator Services Reference](../reference/orchestrator-services.md) - Service APIs
- [Prompts Reference](../reference/prompts.md) - Prompt system details
