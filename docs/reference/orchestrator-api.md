# OrchestratorAPI Reference

**File:** `packages/smithy/src/api/orchestrator-api.ts`

Extends QuarryAPI with agent orchestration capabilities.

## Initialization

```typescript
import { createOrchestratorAPI } from '@stoneforge/smithy';
import { createStorage, initializeSchema } from '@stoneforge/storage';

const storage = createStorage({ path: './project/.stoneforge/db.sqlite' });
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
  maxConcurrentTasks: 1,    // Optional, default: 1
  provider: 'claude-code',  // Optional: agent provider
  model: 'sonnet',          // Optional: LLM model
  executablePath: 'claude', // Optional: executable path
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
  stewardFocus: 'merge',  // 'merge' | 'docs' | 'recovery' | 'custom'
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
const allWorkers = await api.getAgentsByRole('worker');
```

---

## Agent Channels

Each agent gets a dedicated channel on registration.

```typescript
// Via OrchestratorAPI: returns ChannelId
const channelId = await api.getAgentChannel(agentId);

// Via AgentRegistry: returns full Channel object
import { createAgentRegistry } from '@stoneforge/smithy';

const registry = createAgentRegistry(api);
const channel = await registry.getAgentChannel(agentId);     // Channel | undefined
const channelId = await registry.getAgentChannelId(agentId); // ChannelId | undefined

// Channel name utilities (from AgentRegistry module)
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

// With markAsStarted option
const task = await api.assignTaskToAgent(taskId, workerId, {
  markAsStarted: true,  // Also sets task status to 'in_progress'
});

// Get/set/update orchestrator metadata
const meta = await api.getTaskOrchestratorMeta(taskId);
await api.setTaskOrchestratorMeta(taskId, fullMeta);    // Replace entire metadata
await api.updateTaskOrchestratorMeta(taskId, {           // Partial update
  mergeStatus: 'pending',
});
```

### Orchestrator Task Metadata

```typescript
interface OrchestratorTaskMeta {
  assignedAgent?: EntityId;
  branch?: string;
  worktree?: string;
  sessionId?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  mergedAt?: Timestamp;
  mergeStatus?: MergeStatus;
  mergeFailureReason?: string;
  testRunCount?: number;
  lastTestResult?: TestResult;
  reconciliationCount?: number;
  stuckMergeRecoveryCount?: number;
  resumeCount?: number;
  reportedIssues?: readonly string[];
  // Handoff context
  handoffBranch?: string;
  handoffWorktree?: string;
  lastSessionId?: string;
  handoffAt?: Timestamp;
  handoffFrom?: EntityId;
  handoffHistory?: HandoffHistoryEntry[];
  // Merge request info
  mergeRequestUrl?: string;
  mergeRequestId?: number;
  mergeRequestProvider?: string;
  completionSummary?: string;
  lastCommitHash?: string;
  // Session history
  sessionHistory?: readonly TaskSessionHistoryEntry[];
  // Branch sync
  lastSyncResult?: SyncResultMeta;
}

type MergeStatus =
  | 'pending'         // Task completed, awaiting merge
  | 'testing'         // Steward is running tests on the branch
  | 'merging'         // Tests passed, merge in progress
  | 'merged'          // Successfully merged
  | 'conflict'        // Merge conflict detected
  | 'test_failed'     // Tests failed, needs attention
  | 'failed'          // Merge failed for other reason
  | 'not_applicable'; // No merge needed, e.g., fix already on master
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

Agent metadata is a discriminated union based on `agentRole`:

```typescript
interface BaseAgentMetadata {
  agentRole: AgentRole;
  channelId?: ChannelId;
  sessionId?: string;
  worktree?: string;
  sessionStatus?: 'idle' | 'running' | 'suspended' | 'terminated';
  lastActivityAt?: Timestamp;
  maxConcurrentTasks?: number;  // Default: 1
  roleDefinitionRef?: ElementId;
  provider?: string;
  model?: string;
  executablePath?: string;
}

interface DirectorMetadata extends BaseAgentMetadata {
  agentRole: 'director';
}

interface WorkerMetadata extends BaseAgentMetadata {
  agentRole: 'worker';
  workerMode: WorkerMode;
  branch?: string;
}

interface StewardMetadata extends BaseAgentMetadata {
  agentRole: 'steward';
  stewardFocus: StewardFocus;
  triggers?: StewardTrigger[];
  playbook?: string;          // @deprecated - use playbookId instead
  playbookId?: string;        // Playbook element ID for 'custom' stewards
  lastExecutedAt?: Timestamp;
  nextScheduledAt?: Timestamp;
}

type AgentMetadata = DirectorMetadata | WorkerMetadata | StewardMetadata;
```

### StewardTrigger

Steward triggers are a union of `CronTrigger` and `EventTrigger`:

```typescript
interface CronTrigger {
  type: 'cron';
  schedule: string;          // Cron expression (e.g., "0 2 * * *")
}

interface EventTrigger {
  type: 'event';
  event: string;             // Event name (e.g., "task_completed")
  condition?: string;        // Optional condition expression
}

type StewardTrigger = CronTrigger | EventTrigger;
```

---

## Type Guards

```typescript
import {
  isDirectorMetadata,
  isWorkerMetadata,
  isStewardMetadata,
} from '@stoneforge/smithy';

// Check metadata discriminated union
if (isWorkerMetadata(agent.metadata.agent)) {
  console.log(agent.metadata.agent.workerMode);
}

if (isStewardMetadata(agent.metadata.agent)) {
  console.log(agent.metadata.agent.stewardFocus);
}
```

Additional type guards for triggers:

```typescript
import { isCronTrigger, isEventTrigger, isStewardTrigger } from '@stoneforge/smithy';
```
