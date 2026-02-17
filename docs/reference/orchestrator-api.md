# OrchestratorAPI Reference

**File:** `packages/smithy/src/api/orchestrator-api.ts`

Extends QuarryAPI with agent orchestration capabilities.

## Initialization

```typescript
import { createOrchestratorAPI } from '@stoneforge/smithy';
import { createStorage, initializeSchema } from '@stoneforge/storage';

const storage = createStorage('./project/.stoneforge/db.sqlite');
initializeSchema(storage);

const api = createOrchestratorAPI(storage);
```

---

## Agent Registration

### Register Director

```typescript
const director = await api.registerDirector({
  name: 'MainDirector',
  createdBy: humanEntityId,
  maxConcurrentTasks: 1,  // Optional, default: 1
});
```

### Register Worker

```typescript
const worker = await api.registerWorker({
  name: 'Worker-1',
  workerMode: 'ephemeral',  // or 'persistent'
  createdBy: directorEntityId,
  reportsTo: directorEntityId,
  maxConcurrentTasks: 2,    // Optional, default: 1
  roleDefinitionRef: roleDefId,  // Optional: link to role definition
});
```

### Register Steward

```typescript
const steward = await api.registerSteward({
  name: 'MergeSteward',
  stewardFocus: 'merge',  // 'merge' | 'docs' | 'custom'
  triggers: [
    { type: 'event', event: 'task_completed' },
  ],
  createdBy: directorEntityId,
  maxConcurrentTasks: 1,  // Optional, default: 1
});

// Custom steward with playbook
const customSteward = await api.registerSteward({
  name: 'CleanupSteward',
  stewardFocus: 'custom',
  playbook: '## Stale Branch Cleanup\n\n1. List branches older than 14 days\n2. Archive those with no open tasks',
  triggers: [
    { type: 'cron', schedule: '0 2 * * *' },
  ],
  createdBy: directorEntityId,
});
```

---

## Agent Queries

```typescript
// Get specific agent
const agent = await api.getAgent(entityId);
const agentByName = await api.getAgentByName('Worker-1');

// List and filter
const allAgents = await api.listAgents();
const workers = await api.listAgents({ role: 'worker' });
const ephemeralWorkers = await api.listAgents({
  role: 'worker',
  workerMode: 'ephemeral',
});

// Role-specific queries
const director = await api.getDirector();
const stewards = await api.getStewards();
const availableWorkers = await api.getAvailableWorkers();
```

---

## Agent Channels

Each agent gets a dedicated channel on registration.

```typescript
import { createAgentRegistry } from '@stoneforge/smithy';

const registry = createAgentRegistry(api);

// Get channel
const channel = await registry.getAgentChannel(agentId);
const channelId = await registry.getAgentChannelId(agentId);

// Channel name utilities
import { generateAgentChannelName, parseAgentChannelName } from '@stoneforge/smithy';

generateAgentChannelName('Worker-1');  // 'agent-Worker-1'
parseAgentChannelName('agent-Worker-1');  // 'Worker-1' or null
```

---

## Task Assignment

### Basic Assignment

```typescript
// Auto-generates branch and worktree names
const task = await api.assignTaskToAgent(taskId, workerId);

// With explicit options
const task = await api.assignTaskToAgent(taskId, workerId, {
  branch: 'agent/worker-1/task-feat-auth',
  worktree: '.stoneforge/.worktrees/worker-1-feat-auth',
  sessionId: 'claude-session-123',
});

// Get/update orchestrator metadata
const meta = await api.getTaskOrchestratorMeta(taskId);
await api.updateTaskOrchestratorMeta(taskId, {
  mergeStatus: 'pending',
});
```

### Orchestrator Task Metadata

```typescript
interface OrchestratorTaskMeta {
  agentId?: EntityId;
  branch?: string;
  worktree?: string;
  sessionId?: string;
  mergeStatus?: MergeStatus;
  mergedAt?: Timestamp;
  mergedBy?: EntityId;
}

type MergeStatus =
  | 'pending'         // Task completed, awaiting merge
  | 'testing'         // Steward is running tests on the branch
  | 'merging'         // Tests passed, merge in progress
  | 'merged'          // Successfully merged (closes task)
  | 'conflict'        // Merge conflict detected
  | 'test_failed'     // Tests failed, needs attention
  | 'failed'          // Merge failed for other reason
  | 'not_applicable'; // No merge needed, e.g., fix already on master (closes task)
```

---

## Session Management

```typescript
// Update agent session
await api.updateAgentSession(agentId, 'session-123', 'running');

// Session states
type SessionState = 'idle' | 'running' | 'suspended' | 'terminated';
```

---

## Agent Types

### AgentRole

```typescript
type AgentRole = 'director' | 'worker' | 'steward';
```

### AgentMetadata

```typescript
interface AgentMetadata {
  role: AgentRole;
  workerMode?: 'ephemeral' | 'persistent';
  stewardFocus?: 'merge' | 'docs' | 'custom';
  maxConcurrentTasks?: number;  // Default: 1
  sessionState?: SessionState;
  currentSessionId?: string;
  channelId?: ChannelId;
  reportsTo?: EntityId;
  roleDefinitionRef?: ElementId;
  triggers?: StewardTrigger[];
}
```

### StewardTrigger

```typescript
interface StewardTrigger {
  type: 'cron' | 'event' | 'condition';
  cron?: string;           // For cron type
  event?: string;          // For event type
  condition?: string;      // For condition type
}
```

---

## Type Guards

```typescript
import {
  isDirector,
  isWorker,
  isSteward,
  isEphemeralWorker,
  isPersistentWorker,
} from '@stoneforge/smithy';

if (isWorker(agent)) {
  console.log(agent.metadata.agent.workerMode);
}

if (isEphemeralWorker(agent)) {
  // Ephemeral worker specific logic
}
```
