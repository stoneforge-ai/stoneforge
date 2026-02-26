# Orchestrator Services Reference

Services from `@stoneforge/smithy` (`packages/smithy/src/services/`).

## RoleDefinitionService

**File:** `services/role-definition-service.ts`

Manages agent role definitions (stored prompts and behavioral configurations).

```typescript
import { createRoleDefinitionService } from '@stoneforge/smithy';

const roleDefService = createRoleDefinitionService(api);
```

### Create Role Definition

```typescript
const roleDef = await roleDefService.createRoleDefinition({
  role: 'worker',
  name: 'Frontend Developer',
  description: 'Specialized in React and TypeScript',
  systemPrompt: `You are a frontend developer...`,
  maxConcurrentTasks: 1,
  behaviors: {
    onStartup: 'Check for existing work before starting.',
    onStuck: 'Break down the problem into smaller parts.',
    onError: 'Log the error and notify the director.',
  },
  workerMode: 'persistent',  // For workers
  tags: ['frontend', 'senior'],
  createdBy: userEntityId,
});
```

### Query Role Definitions

```typescript
// Get by ID
const roleDef = await roleDefService.getRoleDefinition(roleDefId);

// Get system prompt text
const promptText = await roleDefService.getSystemPrompt(roleDefId);

// Get system prompt text directly from a document reference
const promptText = await roleDefService.getSystemPromptFromRef(documentId);

// Get default for role type
const defaultDirector = await roleDefService.getDefaultRoleDefinition('director');

// List all
const all = await roleDefService.listRoleDefinitions();

// Filter
const workers = await roleDefService.listRoleDefinitions({ role: 'worker' });
const ephemeral = await roleDefService.listRoleDefinitions({ workerMode: 'ephemeral' });
const mergeStewards = await roleDefService.listRoleDefinitions({ stewardFocus: 'merge' });
const byTags = await roleDefService.listRoleDefinitions({ tags: ['frontend'] });
const byName = await roleDefService.listRoleDefinitions({ nameContains: 'react' });

// Get all for role
const allWorkers = await roleDefService.getRoleDefinitionsByRole('worker');
```

### Update Role Definition

```typescript
// Update fields (merged with existing)
await roleDefService.updateRoleDefinition(roleDefId, {
  name: 'Senior Frontend Developer',
  description: 'Updated description',
});

// Update system prompt (creates new Document version)
await roleDefService.updateRoleDefinition(roleDefId, {
  systemPrompt: 'New and improved prompt...',
});

// Update maxConcurrentTasks
await roleDefService.updateRoleDefinition(roleDefId, {
  maxConcurrentTasks: 2,
});

// Update behaviors (merged)
await roleDefService.updateRoleDefinition(roleDefId, {
  behaviors: { onError: 'New error handling instructions' },
});
```

### Delete Role Definition

```typescript
const deleted = await roleDefService.deleteRoleDefinition(roleDefId);
// Returns true if deleted, false if not found
```

### AgentBehaviors

```typescript
interface AgentBehaviors {
  onStartup?: string;      // Appended when agent starts
  onTaskAssigned?: string; // Appended when task is assigned
  onStuck?: string;        // Appended when agent appears stuck
  onHandoff?: string;      // Appended before creating a handoff
  onError?: string;        // Appended when handling errors
}
```

---

## TaskAssignmentService

**File:** `services/task-assignment-service.ts`

Comprehensive task assignment management.

```typescript
import { createTaskAssignmentService } from '@stoneforge/smithy';

const assignmentService = createTaskAssignmentService(api, mergeRequestProvider?);
```

### Assignment Operations

```typescript
// Assign task
const task = await assignmentService.assignToAgent(taskId, agentId, {
  branch: 'custom/branch',
  worktree: '.stoneforge/.worktrees/custom',
  sessionId: 'session-123',
  markAsStarted: true,
});

// Unassign
const task = await assignmentService.unassignTask(taskId);

// Start task
const task = await assignmentService.startTask(taskId, 'session-456');

// Complete task (returns TaskCompletionResult with task and optional merge request info)
const { task, mergeRequestUrl } = await assignmentService.completeTask(taskId);
```

### Handoff

```typescript
// Hand off a task (unassigns, preserves branch/worktree, appends note to description)
const task = await assignmentService.handoffTask(taskId, {
  sessionId: 'session-123',
  message: 'Completed API integration, needs infrastructure access for CORS fix',
  branch: 'agent/worker-1/abc123-implement-login',
  worktree: '.stoneforge/.worktrees/worker-1-implement-login',
});
```

Handoff appends `[AGENT HANDOFF NOTE]: {message}` to the task's description Document and records the handoff in `handoffHistory`. The task is unassigned and returns to the pool for reassignment.

### Session Management

```typescript
// Update session ID for a task (e.g., when agent respawns or resumes work)
const task = await assignmentService.updateSessionId(taskId, 'session-789');
```

Used to associate a new Claude Code session with an already-assigned task, such as when a worker is respawned or resumes work. Updates the `sessionId` in the task's orchestrator metadata.

### Workload Queries

```typescript
// Get agent's tasks
const tasks = await assignmentService.getAgentTasks(agentId);

// Get workload summary
const workload = await assignmentService.getAgentWorkload(agentId);
// workload.totalTasks, workload.inProgressCount, workload.awaitingMergeCount, workload.byStatus

// Check capacity
const hasCapacity = await assignmentService.agentHasCapacity(agentId);
```

### Task Status Queries

```typescript
// Unassigned tasks
const unassigned = await assignmentService.getUnassignedTasks();

// By assignment status
const inProgress = await assignmentService.getTasksByAssignmentStatus('in_progress');
const completed = await assignmentService.getTasksByAssignmentStatus('completed');

// Awaiting merge
const awaitingMerge = await assignmentService.getTasksAwaitingMerge();

// Flexible filtering
const assignments = await assignmentService.listAssignments({
  agentId,
  taskStatus: 'in_progress',
  assignmentStatus: ['assigned', 'in_progress'],
  mergeStatus: 'pending',
});
```

### Assignment Status

| Status | Description |
|--------|-------------|
| `unassigned` | No agent assigned |
| `assigned` | Agent assigned but task not started |
| `in_progress` | Agent actively working |
| `completed` | Task completed, awaiting merge |
| `merged` | Branch successfully merged |

---

## DispatchService

**File:** `services/dispatch-service.ts`

Combines assignment with notification.

```typescript
import { createDispatchService } from '@stoneforge/smithy';

const dispatchService = createDispatchService(api, assignmentService, registry);
```

### Direct Dispatch

```typescript
const result = await dispatchService.dispatch(taskId, agentId, {
  branch: 'custom/branch',
  worktree: '.stoneforge/.worktrees/custom',
  priority: 10,
  restart: true,
  markAsStarted: true,
  notificationMessage: 'Custom message',
  dispatchedBy: senderEntityId,
});

// Result includes:
// result.task - Updated task
// result.agent - Target agent
// result.notification - Notification message
// result.channel - Agent's channel
// result.isNewAssignment
// result.dispatchedAt
```

### Batch Dispatch

```typescript
const results = await dispatchService.dispatchBatch(
  [taskId1, taskId2, taskId3],
  agentId,
  { priority: 5 }
);
```

### Agent Notification (without assignment)

```typescript
await dispatchService.notifyAgent(
  agentId,
  'restart-signal',  // 'task-assignment' | 'task-reassignment' | 'restart-signal'
  'Please restart your session',
  { reason: 'configuration change' }
);
```

---

## DispatchDaemon

**File:** `services/dispatch-daemon.ts`

Continuously running process that coordinates task assignment and message delivery across all agents.

```typescript
import { createDispatchDaemon } from '@stoneforge/smithy';

const daemon = createDispatchDaemon(
  api,
  agentRegistry,
  sessionManager,
  dispatchService,
  worktreeManager,
  taskAssignment,
  stewardScheduler,
  inboxService,
  {
    pollIntervalMs: 5000,
  },
  poolService,      // optional
  settingsService,  // optional
  operationLog      // optional
);
```

### Starting the Daemon

```typescript
// Start the daemon
await daemon.start();

// Stop the daemon
await daemon.stop();

// Check if running
const running = daemon.isRunning();
```

### Runtime Configuration

```typescript
// Update config while running (restarts poll interval if pollIntervalMs changes)
daemon.updateConfig({ pollIntervalMs: 10000 });
```

### Polling Loops

The daemon runs several polling loops (additional loops enabled via config):

| Loop | Purpose |
|------|---------|
| **Orphan Recovery** | Detect workers with assigned tasks but no active session; resume or respawn to continue work |
| **Worker Availability** | Find available ephemeral workers and assign highest priority unassigned tasks |
| **Inbox Polling** | Deliver messages to agents and spawn sessions when needed |
| **Steward Triggers** | Check for triggered conditions and create workflows from playbooks |
| **Workflow Tasks** | Assign workflow tasks to available stewards |
| **Closed-Unmerged Reconciliation** | Detect CLOSED tasks with non-merged mergeStatus and move them back to REVIEW |
| **Plan Auto-Completion** | Auto-complete plans when all tasks are closed (enabled by default; disable via `planAutoCompleteEnabled: false`) |
| **Stuck-Merge Recovery** | Detect and recover stalled merge operations (enabled by default; disable via `stuckMergeRecoveryEnabled: false`) |

### Worker Dispatch Behavior

1. Find ephemeral workers without an active session
2. For each available worker:
   - Query for ready, unassigned tasks via `api.ready()`
   - Assign highest priority task to worker
   - Send dispatch message to worker's inbox
   - Spawn worker in task worktree

**Note:** The daemon uses `api.ready()` which filters out:
- Blocked tasks (via blocked cache)
- Tasks in draft plans (plan status = 'draft')
- Future-scheduled tasks
- Ephemeral workflow tasks

This ensures tasks are only dispatched when they're truly ready to be worked on.

### Orphan Recovery Behavior

The daemon recovers orphaned task assignments on startup and at the start of each poll cycle:

1. Find ephemeral workers without an active session
2. Check if worker has assigned tasks (OPEN or IN_PROGRESS status)
3. For each orphaned assignment:
   - **Resume session:** If `sessionId` exists in task metadata, try `sessionManager.resumeSession()` with a restart notification prompt
   - **Fresh spawn:** If no sessionId or resume fails, call `sessionManager.startSession()` with the full task prompt
4. Reuse existing worktree/branch from task metadata if available; create new if missing

**Configuration:** Set `orphanRecoveryEnabled: false` to disable (default: `true`).

**Note:** REVIEW status tasks are not recovered by this mechanism — they are handled by merge steward dispatch in `pollWorkflowTasks()`.

### Inbox Dispatch Behavior

For ephemeral workers and stewards (two-path model):
- Dispatch message → mark as read (spawn handled by worker availability polling)
- Non-dispatch message + active session → leave unread (do NOT forward)
- Non-dispatch message + no active session → accumulate for triage batch

For persistent workers:
- Active session = forward message as user input
- No active session = message waits

For directors:
- Messages are **not forwarded** — directors are skipped by inbox polling
- Messages remain unread until the director checks its inbox manually

### Triage Spawn

The daemon spawns triage sessions internally to evaluate and categorize incoming messages. The triage methods are private implementation details:

- **`processTriageBatch()`** — Polls for messages that need triage, groups them, and spawns triage sessions. Called automatically as part of the daemon's polling loops.
- **`spawnTriageSession(context)`** — Spawns a headless agent session in a read-only worktree (see `WorktreeManager.createReadOnlyWorktree()`). The session receives the triage prompt and evaluates messages, then cleans up on exit.
- **`buildTriagePrompt(context)`** — Constructs the prompt for a triage session using the `message-triage.md` prompt template.

**Note:** These methods are internal to the daemon and not exposed on the public `DispatchDaemon` interface. Triage is triggered automatically by the daemon's polling loop.

### Closed-Unmerged Reconciliation Behavior

Tasks can end up with `status=CLOSED` but `mergeStatus` not `'merged'` (e.g. when `sf task close` is run on a REVIEW task, or from race conditions between CLI commands and steward processing). While these tasks appear in the **Awaiting Merge** section of the web UI (alongside `REVIEW` status tasks), they are invisible to merge stewards which only query for `status=REVIEW`.

The reconciliation poll detects and recovers these stuck tasks:

1. Query for tasks with `status=CLOSED` and `mergeStatus` in `['pending', 'testing', 'merging', 'conflict', 'test_failed', 'failed', 'not_applicable']`
2. For each stuck task:
   - **Grace period:** Skip if `closedAt` is within `closedUnmergedGracePeriodMs` (default: 120s) to avoid racing with in-progress close+merge sequences
   - **Safety valve:** Skip and warn if `reconciliationCount >= 3` to prevent infinite loops
   - Move task back to REVIEW status, clear `closedAt` and `closeReason`, increment `reconciliationCount` in metadata

**Configuration:**
- `closedUnmergedReconciliationEnabled` — enable/disable (default: `true`)
- `closedUnmergedGracePeriodMs` — grace period before reconciliation (default: `120000`)

**Execution Timing:** Runs after `pollWorkflowTasks()` so reconciled tasks are picked up on the next cycle.

---

## ExternalSyncDaemon

**File:** `services/external-sync-daemon.ts`

Background polling daemon that automates bidirectional synchronization between Stoneforge elements and external services (GitHub Issues, Linear, etc.). Follows the same lifecycle pattern as the DispatchDaemon — `setInterval` with configurable poll interval, running flag to prevent concurrent cycles, and clean shutdown with in-flight cycle awaiting.

```typescript
import { createExternalSyncDaemon } from '@stoneforge/smithy';

const daemon = createExternalSyncDaemon(syncEngine, {
  pollIntervalMs: 60000,
});
```

### Purpose

The ExternalSyncDaemon wraps a `SyncEngine` (from `@stoneforge/quarry`) in a polling loop. Each cycle runs the engine's `sync()` method — push locally-changed linked elements to external services, then pull externally-changed items into Stoneforge. This keeps tasks in sync with GitHub Issues, Linear issues, and other external trackers without manual intervention.

### Configuration

```typescript
interface ExternalSyncDaemonConfig {
  pollIntervalMs?: number;  // Poll interval in ms (default: 60000)
}
```

| Constant | Value | Description |
|----------|-------|-------------|
| `EXTERNAL_SYNC_DEFAULT_POLL_INTERVAL_MS` | `60000` (60s) | Default poll interval |
| `EXTERNAL_SYNC_MIN_POLL_INTERVAL_MS` | `10000` (10s) | Minimum allowed poll interval |
| `EXTERNAL_SYNC_MAX_POLL_INTERVAL_MS` | `1800000` (30min) | Maximum allowed poll interval |

The poll interval is clamped to the min/max range during normalization.

### Lifecycle

```typescript
// Start the polling loop (runs an initial cycle immediately)
await daemon.start();

// Stop the polling loop (waits up to 30s for in-flight cycle)
await daemon.stop();

// Check if running
const running = daemon.isRunning();
```

**Start behavior:**
1. Sets running flag
2. Creates a `setInterval` with the configured poll interval
3. Unrefs the interval so it doesn't prevent process exit
4. Runs an initial sync cycle immediately

**Stop behavior:**
1. Clears the running flag and interval
2. If a cycle is in-flight, waits up to 30 seconds for it to complete
3. Times out gracefully if the cycle doesn't finish

### Manual Trigger

```typescript
// Force an immediate sync cycle (works whether daemon is running or not)
const result = await daemon.triggerSync();
```

Returns an `ExternalSyncResult` with push/pull/conflict/error counts.

### Query

```typescript
// Get the result of the last completed sync cycle (null if none yet)
const lastResult = daemon.getLastResult();
```

### ExternalSyncResult

Each sync cycle produces an `ExternalSyncResult`:

```typescript
interface ExternalSyncResult {
  success: boolean;
  provider: string;
  project: string;
  adapterType: SyncAdapterType;  // 'task' | 'document' | 'message'
  pushed: number;                // Elements pushed to external
  pulled: number;                // Elements pulled from external
  skipped: number;               // Elements skipped (no changes)
  conflicts: ExternalSyncConflict[];
  errors: ExternalSyncError[];
}
```

### Sync Cycle Behavior

Each poll cycle:

1. Calls `syncEngine.sync({ all: true })` — pushes locally-changed linked elements, then pulls externally-changed items
2. Stores the result for `getLastResult()` queries
3. Logs the cycle outcome:
   - **Errors**: Warns with per-error details (provider, element ID, message)
   - **Changes**: Info log with pushed/pulled/conflict/skipped counts
   - **No changes**: Debug-level log only
4. If the cycle throws, stores an error result and continues the polling loop

Skips the cycle if a previous cycle is still in-flight (prevents overlapping sync operations).

### Zero-Overhead Guarantee

The daemon is **only instantiated** when both conditions are met:

1. `externalSync.enabled === true` in the quarry config
2. At least one provider has a configured token in settings

If either condition is false, the daemon field in `Services` is `undefined` — no object, no timers, no polling. This follows the same conditional-start pattern as the DispatchDaemon.

**Service wiring** (in `packages/smithy/src/server/services.ts`):

```typescript
// Only instantiate when external sync is enabled AND a provider has a token
let externalSyncDaemon: ExternalSyncDaemon | undefined;
if (config.externalSync.enabled) {
  const externalSyncSettings = settingsService.getExternalSyncSettings();
  const hasConfiguredProvider = Object.values(externalSyncSettings.providers).some(
    (p) => p.token != null && p.token.length > 0
  );

  if (hasConfiguredProvider) {
    const registry = createDefaultProviderRegistry();
    const syncEngine = createSyncEngine({ api, registry, settings: settingsService, providerConfigs });
    externalSyncDaemon = createExternalSyncDaemon(syncEngine, {
      pollIntervalMs: externalSyncSettings.pollIntervalMs ?? config.externalSync.pollInterval,
    });
  }
}
```

**Server startup** (in `packages/smithy/src/server/index.ts`):

```typescript
// Auto-start if the daemon was created
if (services.externalSyncDaemon) {
  services.externalSyncDaemon.start();
}
```

### Integration with DispatchDaemon

The ExternalSyncDaemon operates independently from the DispatchDaemon — they run on separate intervals with separate concerns:

| Aspect | DispatchDaemon | ExternalSyncDaemon |
|--------|---------------|-------------------|
| **Purpose** | Assign tasks to agents, deliver messages | Sync elements with external services |
| **Poll interval** | 5s (default) | 60s (default) |
| **Dependency** | Requires `WorktreeManager` | Requires `SyncEngine` + configured providers |
| **Services field** | `services.dispatchDaemon` | `services.externalSyncDaemon` |
| **Conditional start** | Only if git repo found | Only if enabled + provider tokens configured |

Both daemons are registered on the `Services` interface as `| undefined` and auto-started by the server when their respective conditions are met.

### API Endpoints

**File:** `server/routes/external-sync.ts`

The external sync routes provide HTTP endpoints for manual sync triggers and status reporting. These work independently of the daemon — they create a fresh `SyncEngine` per request to pick up the latest provider configuration.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/external-sync/push` | Push linked tasks to external services. Optional `{ taskIds: string[] }` body to push specific tasks; omit for all. |
| `POST` | `/api/external-sync/pull` | Pull changes from all configured external providers. |
| `POST` | `/api/external-sync/sync` | Bidirectional sync (push then pull). Optional `{ dryRun: boolean }` body. |
| `GET` | `/api/external-sync/status` | Sync status: configured providers, linked task count, last sync timestamp, pending conflicts. |
| `GET` | `/api/external-sync/providers` | List all registered providers with configuration status, supported adapters, and sync settings. |

**Example responses:**

```typescript
// POST /api/external-sync/push
{ success: true, pushed: 3, skipped: 1, errors: [], conflicts: [] }

// GET /api/external-sync/status
{
  providers: [{ name: 'github', configured: true, project: 'owner/repo' }],
  linkedTaskCount: 12,
  lastSyncAt: '2026-02-24T10:30:00.000Z',
  pendingConflicts: 0,
}

// GET /api/external-sync/providers
{
  providers: [{
    name: 'github',
    displayName: 'GitHub',
    supportedAdapters: ['task'],
    configured: true,
    project: 'owner/repo',
    apiBaseUrl: null,
  }],
  syncSettings: { pollIntervalMs: 60000, defaultDirection: 'bidirectional' },
}
```

### Related Source Files

| File | Package | Purpose |
|------|---------|---------|
| `services/external-sync-daemon.ts` | `@stoneforge/smithy` | Daemon implementation and factory |
| `server/routes/external-sync.ts` | `@stoneforge/smithy` | HTTP endpoints for manual triggers |
| `server/services.ts` | `@stoneforge/smithy` | Service wiring and conditional instantiation |
| `external-sync/sync-engine.ts` | `@stoneforge/quarry` | Sync engine orchestrating push/pull |
| `external-sync/provider-registry.ts` | `@stoneforge/quarry` | Provider registration and lookup |
| `external-sync/conflict-resolver.ts` | `@stoneforge/quarry` | Conflict detection and resolution |
| `external-sync/providers/github/` | `@stoneforge/quarry` | GitHub provider implementation |
| `external-sync/providers/linear/` | `@stoneforge/quarry` | Linear provider implementation |

---

## StewardScheduler

**File:** `services/steward-scheduler.ts`

Executes stewards on schedule (cron) or in response to events. Manages the lifecycle of scheduled steward executions and tracks execution history.

```typescript
import { createStewardScheduler } from '@stoneforge/smithy';

const scheduler = createStewardScheduler(agentRegistry, executor, config?);
```

### Configuration

```typescript
interface StewardSchedulerConfig {
  maxHistoryPerSteward?: number;   // Max execution history entries per steward (default: 100)
  defaultTimeoutMs?: number;       // Default timeout for steward execution in ms (default: 300000)
  startImmediately?: boolean;      // Register all stewards on start() (default: false)
}
```

### Lifecycle

```typescript
// Start the scheduler (activates cron jobs and event listeners)
await scheduler.start();

// Stop the scheduler (running executions are allowed to complete)
await scheduler.stop();

// Check if scheduler is running
const running = scheduler.isRunning();
```

### Steward Management

```typescript
// Register a steward (sets up cron jobs and event subscriptions from triggers)
const registered = await scheduler.registerSteward(stewardId);

// Unregister a steward (removes cron jobs and event subscriptions)
const unregistered = await scheduler.unregisterSteward(stewardId);

// Refresh a steward's registration (useful if triggers changed)
await scheduler.refreshSteward(stewardId);

// Register all stewards from the agent registry
const count = await scheduler.registerAllStewards();
```

### Manual Execution

```typescript
// Manually trigger a steward execution
const result = await scheduler.executeSteward(stewardId, context?);
// Returns StewardExecutionResult { success, error?, output?, durationMs, itemsProcessed? }
```

### Event Publishing

```typescript
// Publish an event that may trigger stewards with matching event triggers
const triggeredCount = await scheduler.publishEvent('task_completed', { task: taskData });
```

### Status & Queries

```typescript
// Get scheduled job info (optionally filter by stewardId)
const jobs = scheduler.getScheduledJobs(stewardId?);

// Get event subscriptions (optionally filter by stewardId)
const subscriptions = scheduler.getEventSubscriptions(stewardId?);

// Get execution history with optional filtering
const history = scheduler.getExecutionHistory({
  stewardId?,
  triggerType?: 'cron' | 'event',
  success?: boolean,
  startedAfter?: timestamp,
  startedBefore?: timestamp,
  limit?: number,
});

// Get last execution for a steward
const lastExec = scheduler.getLastExecution(stewardId);

// Get scheduler statistics
const stats = scheduler.getStats();
// stats.registeredStewards, stats.activeCronJobs, stats.activeEventSubscriptions,
// stats.totalExecutions, stats.successfulExecutions, stats.failedExecutions, stats.runningExecutions
```

### Events

```typescript
// Subscribe to scheduler events
scheduler.on('execution:started', (entry) => { /* ... */ });
scheduler.on('execution:completed', (entry) => { /* ... */ });
scheduler.on('execution:failed', (entry) => { /* ... */ });
scheduler.on('steward:registered', (stewardId) => { /* ... */ });
scheduler.on('steward:unregistered', (stewardId) => { /* ... */ });
```

### Trigger Types

| Type | Description |
|------|-------------|
| `cron` | Time-based (e.g., `'0 */15 * * *'`) |
| `event` | On specific events with optional condition (e.g., `'task_completed'`) |

### Steward Executor Factory

```typescript
import { createStewardExecutor } from '@stoneforge/smithy';

// Creates an executor that dispatches to the appropriate service based on steward focus:
// - 'merge'    → MergeStewardService.processAllPending()
// - 'docs'     → spawns an agent session via sessionManager
// - 'custom'   → spawns a session with a custom playbook prompt
// Note: Unrecognized focus values (e.g., 'recovery') return an error result
const executor = createStewardExecutor({
  mergeStewardService,
  docsStewardService,
  sessionManager,
  projectRoot: '/project',
  resolvePlaybookContent?,       // Optional callback for resolving playbook templates
  rateLimitTracker?,             // Optional: skip session spawns if all executables are rate-limited
  settingsService?,              // Optional: resolve executable fallback chain for rate limit checks
  stewardSessionIdleTimeoutMs?,  // Idle timeout for sessions (default: 120000)
  stewardSessionMaxDurationMs?,  // Max session duration (default: 1800000)
});
```

---

## PluginExecutor

**File:** `services/plugin-executor.ts`

Executes steward plugins. Plugins enable custom automated maintenance tasks via playbooks, scripts, or commands.

```typescript
import { createPluginExecutor } from '@stoneforge/smithy';

const executor = createPluginExecutor({
  api?,             // Optional QuarryAPI (required for playbook plugins)
  workspaceRoot?,   // Working directory (defaults to process.cwd())
});
```

### Plugin Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `playbook` | Executes a playbook by ID | `playbookId` |
| `script` | Executes a script file | `path` |
| `command` | Executes a CLI command | `command` |

### Built-in Plugins

| Plugin | Type | Purpose |
|--------|------|---------|
| `gc-ephemeral-tasks` | `command` | Garbage collect old ephemeral workflows |
| `cleanup-stale-worktrees` | `command` | Clean up stale worktree references |
| `gc-ephemeral-workflows` | `command` | Garbage collect old ephemeral workflows |
| `health-check-agents` | `command` | Check health status of all registered agents |

### Methods

```typescript
// Execute a single plugin
const result = await executor.execute(plugin, options?);
// plugin: StewardPlugin (PlaybookPlugin | ScriptPlugin | CommandPlugin)
// options?: PluginExecutionOptions { workspaceRoot?, defaultTimeout?, env?, context?, stopOnError? }
// Returns PluginExecutionResult { pluginName, pluginType, success, error?, stdout?, stderr?, exitCode?, durationMs, startedAt, completedAt }

// Execute multiple plugins in sequence
const batchResult = await executor.executeBatch(plugins, options?);
// Returns BatchPluginExecutionResult { total, succeeded, failed, skipped, results, durationMs, allSucceeded }

// Validate a plugin configuration
const validation = executor.validate(plugin);
// Returns { valid: boolean, errors: string[] }

// Get a built-in plugin by name
const plugin = executor.getBuiltIn('gc-ephemeral-tasks');

// List all built-in plugin names
const names = executor.listBuiltIns();
// Returns string[]
```

---

## DocsStewardService

**File:** `services/docs-steward-service.ts`

Scans documentation for issues and provides automated fixes. The docs steward creates a worktree, accumulates fixes as commits, self-merges when complete, and cleans up.

```typescript
import { createDocsStewardService } from '@stoneforge/smithy';

const docsSteward = createDocsStewardService({
  workspaceRoot: '/project',
  docsDir: 'docs',
  sourceDirs: ['packages', 'apps'],
  autoPush: true,
  targetBranch: 'main',  // optional, auto-detected if omitted
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workspaceRoot` | `string` | *required* | Workspace root directory (git repo) |
| `docsDir` | `string` | `'docs'` | Documentation directory relative to workspace |
| `sourceDirs` | `string[]` | `['packages', 'apps']` | Source directories to verify against |
| `autoPush` | `boolean` | `true` | Push after merge |
| `targetBranch` | `string` | *auto-detect* | Target branch to merge into |

### Verification Methods

```typescript
// Scan all documentation for issues
const result = await docsSteward.scanAll();
// Returns VerificationResult { issues: DocIssue[], filesScanned: number, durationMs: number }

// Individual verification methods (each returns DocIssue[])
const filePathIssues = await docsSteward.verifyFilePaths();
const linkIssues = await docsSteward.verifyInternalLinks();
const exportIssues = await docsSteward.verifyExports();
const cliIssues = await docsSteward.verifyCliCommands();
const typeIssues = await docsSteward.verifyTypeFields();
const apiIssues = await docsSteward.verifyApiMethods();
```

### Session Lifecycle Methods

```typescript
// Create session worktree and branch
const worktree = await docsSteward.createSessionWorktree('d-steward-1');
// Creates: .stoneforge/.worktrees/docs-steward-{timestamp}/
// Branch: d-steward-1/docs/auto-updates

// Commit a fix
await docsSteward.commitFix('Fix broken link in README', ['docs/README.md']);

// Self-merge and cleanup
const result = await docsSteward.mergeAndCleanup(
  'd-steward-1/docs/auto-updates',
  'docs: fix documentation issues'
);

// Cleanup session (worktree and branch) without merging
await docsSteward.cleanupSession(worktreePath, branchName);
```

### DocIssue Type

```typescript
interface DocIssue {
  type: DocIssueType;        // 'file_path' | 'internal_link' | 'export' | 'cli' | 'type_field' | 'api_method'
  file: string;              // Doc file with the issue
  line: number;              // Line number
  description: string;       // What's wrong
  currentValue: string;      // What the doc says
  suggestedFix?: string;     // Suggested correction
  confidence: FixConfidence; // 'high' | 'medium' | 'low'
  complexity: IssueComplexity; // 'low' | 'medium' | 'high'
  context: string;           // Surrounding text
}
```

### Complexity Classification

| Complexity | Examples | Action |
|------------|----------|--------|
| `low` | Typos, broken links, stale paths | Self-fix |
| `medium` | Outdated exports, API changes, rewrites | Self-fix |
| `high` | Ambiguous situations requiring product decisions | Escalate to Director |

---

## WorkerTaskService

**File:** `services/worker-task-service.ts`

Provides the complete workflow for workers picking up tasks and working in isolated worktrees. Orchestrates task dispatch, worktree creation, worker spawning, and task completion.

```typescript
import { createWorkerTaskService } from '@stoneforge/smithy';

const workerTaskService = createWorkerTaskService(
  api,
  taskAssignment,
  agentRegistry,
  dispatchService,
  spawnerService,
  sessionManager,
  worktreeManager?  // optional
);
```

### Task Lifecycle

```typescript
// Start a worker on a task with full worktree isolation
// (dispatches task → creates worktree → spawns worker session → sends task context)
const result = await workerTaskService.startWorkerOnTask(taskId, agentId, {
  branch?,              // Custom branch name (auto-generated if not provided)
  worktreePath?,        // Custom worktree path (auto-generated if not provided)
  baseBranch?,          // Base branch to create worktree from
  additionalPrompt?,    // Additional instructions to prepend to task context
  performedBy?,         // Entity performing the operation
  skipWorktree?,        // Skip worktree creation (use existing directory)
  workingDirectory?,    // Custom working directory (used if skipWorktree is true)
  priority?,            // Dispatch priority for notification
});
// Returns StartWorkerOnTaskResult { task, agent, dispatch, worktree?, session, taskContextPrompt, startedAt }

// Complete a task and mark the branch as ready for merge
const result = await workerTaskService.completeTask(taskId, {
  summary?,       // Summary of what was accomplished
  commitHash?,    // Commit hash for the final commit
  runTests?,      // Whether to run tests before marking complete (default: false)
  performedBy?,   // Entity performing the completion
});
// Returns CompleteTaskResult { task, worktree?, readyForMerge, completedAt }
```

### Task Context

```typescript
// Build the task context prompt for a worker
const prompt = await workerTaskService.buildTaskContextPrompt(
  taskId, workerId, additionalInstructions?
);

// Get the task context information
const context = await workerTaskService.getTaskContext(taskId);
// Returns TaskContext { taskId, title, description?, tags, priority?, complexity?, branch?, worktreePath? }
```

### Cleanup

```typescript
// Clean up after a task is merged or abandoned
// (removes worktree, optionally deletes branch, updates metadata)
const success = await workerTaskService.cleanupTask(taskId, deleteBranch?);
```

---

## WorktreeManager

**File:** `git/worktree-manager.ts`

Manages Git worktree creation and cleanup for agent sessions.

### createReadOnlyWorktree

Creates a detached HEAD worktree on the default branch without creating a new branch. Used for triage sessions and other read-only operations where the agent needs repository access but should not make commits.

```typescript
import { createWorktreeManager } from '@stoneforge/smithy';

const worktreeManager = createWorktreeManager({
  workspaceRoot: '/project',
  worktreeDir: '.stoneforge/.worktrees',  // optional, this is the default
  defaultBaseBranch: 'master',             // optional, auto-detected from git
});

const worktreeResult = await worktreeManager.createReadOnlyWorktree({
  agentName: 'worker-alice',
  purpose: 'triage',
});
// Returns CreateWorktreeResult with path: .stoneforge/.worktrees/{agent-name}-{purpose}/
```

**Path pattern:** `.stoneforge/.worktrees/{agent-name}-{purpose}/`

**Behavior:**
- Checks out a detached HEAD at the tip of the default branch
- Does not create a new Git branch (unlike standard worktree creation)
- Suitable for triage sessions that only need to read the codebase
- The worktree should be cleaned up when the session exits

---

## MergeStewardService

**File:** `services/merge-steward-service.ts`

Handles automated merging of completed task branches. All merge operations run in a **temporary worktree** to avoid corrupting the main repository's HEAD.

```typescript
import { createMergeStewardService } from '@stoneforge/smithy';

const mergeSteward = createMergeStewardService(
  api,
  taskAssignmentService,
  dispatchService,
  agentRegistry,
  {
    workspaceRoot: '/project',
    mergeStrategy: 'squash',  // 'squash' (default) or 'merge'
    autoPushAfterMerge: true, // Push to remote after merge (default: true)
    autoCleanup: true,        // Remove task worktree after merge (default: true)
    deleteBranchAfterMerge: true, // Delete branch after merge (default: true)
  },
  worktreeManager,  // optional
  operationLog      // optional
);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workspaceRoot` | `string` | *required* | Workspace root directory (git repo) |
| `mergeStrategy` | `'squash' \| 'merge'` | `'squash'` | Merge strategy to use |
| `autoPushAfterMerge` | `boolean` | `true` | Push target branch to remote after merge |
| `autoCleanup` | `boolean` | `true` | Remove task worktree after successful merge |
| `deleteBranchAfterMerge` | `boolean` | `true` | Delete source branch (local + remote) after merge |
| `testCommand` | `string` | `'npm test'` | Command to run tests |
| `testTimeoutMs` | `number` | `300000` | Test timeout in milliseconds |
| `autoMerge` | `boolean` | `true` | Automatically merge when tests pass |
| `targetBranch` | `string` | *auto-detect* | Branch to merge into |

### Merge Strategy

The merge runs in two phases to avoid branch locking issues:

- **Phase A** (temp worktree): Fetches origin, creates a detached HEAD worktree at `origin/<target>`, performs the merge/commit/push, then cleans up the worktree in a `finally` block.
- **Phase B** (main repo): After the worktree is removed and the target branch is free, syncs the local target branch with remote via checkout + merge + return-to-original-branch. This is best-effort.

**Squash Merge (default):**
- Creates a detached HEAD worktree at `origin/<target>` (`.stoneforge/.worktrees/_merge-<taskId>`)
- Runs `git merge --squash` and `git commit` in the temp worktree
- Commit message format: `{task title} ({task ID})`
- Pushes from detached HEAD: `git push origin HEAD:<target>`
- Cleans up the temp worktree in a `finally` block, then syncs local target branch

**Standard Merge:**
- Creates a detached HEAD worktree at `origin/<target>`
- Creates a merge commit preserving branch history
- Commit message format: `Merge branch '{branch}' (Task: {task ID})`
- Pushes from detached HEAD: `git push origin HEAD:<target>`
- Cleans up the temp worktree in a `finally` block, then syncs local target branch

### Worktree Safety

The `attemptMerge()` method delegates to the shared `mergeBranch()` utility (`git/merge.ts`), which is also used by `DocsStewardService.mergeAndCleanup()`. The merge utility uses `execGitSafe()` for all git operations within the merge flow — this helper rejects any command where the working directory resolves to the main workspace root, preventing accidental HEAD corruption. Only worktree creation/removal and the post-merge local sync (Phase B) intentionally operate on the main repo. The temp worktree uses a detached HEAD (`--detach`) so it never locks the target branch — this allows Phase B to check out and sync the target branch after cleanup.

### Methods

```typescript
// Get all tasks awaiting merge (mergeStatus 'pending')
const tasks = await mergeSteward.getTasksAwaitingMerge();
// Returns TaskAssignment[]

// Process a single task for merge
const result = await mergeSteward.processTask(taskId, {
  skipTests: false,
  forceMerge: false,
  mergeCommitMessage: 'Custom message',
});

// Process all pending tasks
const batchResult = await mergeSteward.processAllPending();

// Run tests on a task's branch
const testResult = await mergeSteward.runTests(taskId);

// Attempt to merge a task's branch
const mergeResult = await mergeSteward.attemptMerge(taskId, 'Custom commit message');

// Create a fix task for failed merge/tests
const fixTaskId = await mergeSteward.createFixTask(taskId, {
  type: 'test_failure',  // 'test_failure' | 'merge_conflict' | 'general'
  errorDetails: 'Test output...',
  affectedFiles: ['src/file.ts'],
});

// Cleanup after successful merge
await mergeSteward.cleanupAfterMerge(taskId, true);

// Update merge status
await mergeSteward.updateMergeStatus(taskId, 'merged', {
  testResult: { passed: true, completedAt: timestamp },
});

// Mark as not applicable (closes task without merge)
// Use when a branch has no commits to merge (fix already on master)
await mergeSteward.updateMergeStatus(taskId, 'not_applicable');
```

### Merge Status Values

| Status | Description | Closes Task |
|--------|-------------|-------------|
| `pending` | Task completed, awaiting merge | No |
| `testing` | Steward is running tests | No |
| `merging` | Tests passed, merge in progress | No |
| `merged` | Successfully merged | Yes |
| `conflict` | Merge conflict detected | No |
| `test_failed` | Tests failed | No |
| `failed` | Merge failed (other reason) | No |
| `not_applicable` | No merge needed (e.g., fix already on master) | Yes |

### Cleanup Behavior

**After successful merge:**
1. **Temp worktree removal:** The temporary merge worktree is always removed in a `finally` block
2. **Task worktree removal:** Removes the task's worktree directory
3. **Local branch deletion:** Deletes the local source branch
4. **Remote branch deletion:** Pushes deletion to remote (`git push origin --delete`)

**When tests fail or conflicts occur:**
- The temp merge worktree is still cleaned up (via `finally` block)
- The task's worktree and branch are NOT cleaned up (worker needs them to fix the issue)
- `mergeStatus` is updated to `'test_failed'` or `'conflict'`
- A fix task is created with `tags: ['fix']` and assigned to the original task's agent

All cleanup operations are best-effort and log warnings on failure without blocking the merge result.

### Error Handling

`MergeStatusConflictError` is thrown when an optimistic locking conflict is detected during a merge status transition (e.g., another steward instance has already claimed the task):

```typescript
import { MergeStatusConflictError } from '@stoneforge/smithy';

try {
  await mergeSteward.processTask(taskId);
} catch (error) {
  if (error instanceof MergeStatusConflictError) {
    // error.taskId - the conflicting task
    // error.expectedStatus - what status was expected
    // error.actualStatus - what status was found
  }
}
```

---

## AgentPoolService

**File:** `services/agent-pool-service.ts`

Manages agent pools for controlling concurrent agent execution. Pools limit the maximum number of agents running simultaneously, and the dispatch daemon respects pool constraints when spawning agents.

```typescript
import { createAgentPoolService } from '@stoneforge/smithy';

const poolService = createAgentPoolService(api, sessionManager, agentRegistry);
```

### Key Concepts

- **Pool size:** Maximum number of concurrent agents across all types in the pool
- **Agent type slots:** Which agent types (worker, steward) can occupy pool slots
- **Priority scores:** Per-type priority for tie-breaking when multiple tasks are ready
- **Directors are not pool-managed** — pools only apply to workers and stewards

### Create Pool

```typescript
const pool = await poolService.createPool({
  name: 'default',
  description: 'Default agent pool',
  maxSize: 5,
  agentTypes: [
    { role: 'worker', workerMode: 'ephemeral', priority: 100 },
    { role: 'worker', workerMode: 'persistent', priority: 50, maxSlots: 2 },
    { role: 'steward', stewardFocus: 'merge', priority: 80 },
  ],
  enabled: true,
  tags: ['production'],
  createdBy: userEntityId,
});
```

### Pool Configuration

```typescript
interface AgentPoolConfig {
  name: string;                      // Unique pool name
  description?: string;              // Human-readable description
  maxSize: number;                   // Maximum concurrent agents (1-1000)
  agentTypes: PoolAgentTypeConfig[]; // Agent types in this pool
  enabled?: boolean;                 // Whether pool is active (default: true)
  tags?: string[];                   // Tags for categorization
}

interface PoolAgentTypeConfig {
  role: 'worker' | 'steward';        // Agent role (not director)
  workerMode?: 'ephemeral' | 'persistent';  // For workers
  stewardFocus?: 'merge' | 'docs' | 'recovery' | 'custom';  // For stewards
  priority?: number;                 // Spawn priority (higher = higher priority)
  maxSlots?: number;                 // Max slots for this type within the pool
  provider?: string;                 // Agent provider (e.g., 'claude-code', 'opencode')
  model?: string;                    // Model identifier (e.g., 'claude-sonnet-4-20250514')
}
```

### Query Pools

```typescript
// Get by ID
const pool = await poolService.getPool(poolId);

// Get by name
const pool = await poolService.getPoolByName('default');

// List all pools
const allPools = await poolService.listPools();

// Filter pools
const enabledPools = await poolService.listPools({ enabled: true });
const availablePools = await poolService.listPools({ hasAvailableSlots: true });
const taggedPools = await poolService.listPools({ tags: ['production'] });
const namedPools = await poolService.listPools({ nameContains: 'worker' });
```

### Update Pool

```typescript
// Update configuration
const updated = await poolService.updatePool(poolId, {
  description: 'Updated description',
  maxSize: 10,  // Cannot reduce below current activeCount
  enabled: true,
  agentTypes: [
    { role: 'worker', workerMode: 'ephemeral', priority: 100 },
  ],
  tags: ['updated'],
});
```

### Delete Pool

```typescript
await poolService.deletePool(poolId);
// Warns if agents are active but still deletes
```

### Pool Status

```typescript
// Get current status
const status = await poolService.getPoolStatus(poolId);
// status.activeCount      - Number of active agents
// status.availableSlots   - Number of available slots
// status.activeByType     - Breakdown by agent type (e.g., 'worker:ephemeral': 3)
// status.activeAgentIds   - IDs of active agents
// status.lastUpdatedAt    - When status was last updated

// Refresh all pool statuses from session manager
await poolService.refreshAllPoolStatus();
```

### Spawn Decisions

The dispatch daemon uses these methods to check pool constraints before spawning:

```typescript
// Check if an agent can spawn
const check = await poolService.canSpawn({
  role: 'worker',
  workerMode: 'ephemeral',
  agentId: agentEntityId,
});

if (check.canSpawn) {
  // Safe to spawn
} else {
  console.log(check.reason);  // e.g., "Pool 'default' is at capacity (5 agents)"
}

// Get pools governing an agent type
const pools = await poolService.getPoolsForAgentType('worker', 'ephemeral');

// For stewards, pass stewardFocus instead of workerMode
const stewardPools = await poolService.getPoolsForAgentType('steward', undefined, 'merge');

// Get next spawn priority when multiple tasks are pending
const nextRequest = await poolService.getNextSpawnPriority(poolId, pendingRequests);
```

### Agent Lifecycle Tracking

The service tracks agent spawns and session ends to maintain accurate pool status:

```typescript
// Called when an agent is spawned
await poolService.onAgentSpawned(agentId);

// Called when an agent session ends
await poolService.onAgentSessionEnded(agentId);
```

### Pool Spawn Check Result

```typescript
interface PoolSpawnCheck {
  canSpawn: boolean;           // Whether spawn is allowed
  poolId?: ElementId;          // Pool governing the decision
  poolName?: string;           // Pool name for display
  reason?: string;             // Reason if canSpawn is false
  slotsAfterSpawn?: number;    // Slots used after spawn
  maxSlots?: number;           // Maximum slots in pool
}
```

### Constants

```typescript
import { POOL_DEFAULTS } from '@stoneforge/smithy';

POOL_DEFAULTS.maxSize        // Default max size: 5
POOL_DEFAULTS.enabled        // Default enabled: true
POOL_DEFAULTS.defaultPriority // Default priority: 0
```

---

## MergeRequestProvider

**File:** `services/merge-request-provider.ts`

Abstracts merge request creation so the orchestrator can work with different hosting backends (GitHub, local-only, etc.) or no remote at all.

```typescript
import { createLocalMergeProvider, createGitHubMergeProvider } from '@stoneforge/smithy';
```

### Interface

```typescript
interface MergeRequestProvider {
  readonly name: string;
  createMergeRequest(task: Task, options: CreateMergeRequestOptions): Promise<MergeRequestResult>;
}

interface CreateMergeRequestOptions {
  readonly title: string;
  readonly body: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
}

interface MergeRequestResult {
  readonly url?: string;       // PR/MR URL (if remote created)
  readonly id?: number;        // PR/MR number (if remote created)
  readonly provider: string;   // Provider name ('local' or 'github')
}
```

### Built-in Providers

| Provider | Factory | Description |
|----------|---------|-------------|
| `LocalMergeProvider` | `createLocalMergeProvider()` | No-op provider for offline/local-only workflows. Returns `{ provider: 'local' }` without creating any remote merge request. |
| `GitHubMergeProvider` | `createGitHubMergeProvider()` | Creates GitHub pull requests using the `gh` CLI tool. Requires `gh` to be installed and authenticated. |

### Usage

```typescript
// Local-only (no remote merge requests)
const provider = createLocalMergeProvider();

// GitHub pull requests via `gh` CLI
const provider = createGitHubMergeProvider();

// Use with TaskAssignmentService
const taskAssignment = createTaskAssignmentService(api, provider);
```

### Creating a Custom Provider

Implement the `MergeRequestProvider` interface to support other platforms (GitLab, Bitbucket, etc.):

```typescript
class GitLabMergeProvider implements MergeRequestProvider {
  readonly name = 'gitlab';

  async createMergeRequest(task: Task, options: CreateMergeRequestOptions): Promise<MergeRequestResult> {
    // Create GitLab merge request via API
    const mr = await gitlabApi.createMergeRequest({
      title: options.title,
      source_branch: options.sourceBranch,
      target_branch: options.targetBranch,
      description: options.body,
    });
    return { url: mr.web_url, id: mr.iid, provider: this.name };
  }
}
```

---

## SettingsService

**File:** `services/settings-service.ts`

Server-side key-value settings persisted to SQLite. Used for workspace-wide configuration that needs to be accessible server-side, such as default executable paths for agent providers, external sync provider credentials, and sync cursor storage.

Settings are stored in the `settings` table as JSON-encoded values. The service provides generic CRUD operations for arbitrary keys, plus convenience methods for well-known setting groups (agent defaults, external sync).

```typescript
import { createSettingsService } from '@stoneforge/smithy';

const settingsService = createSettingsService(storage);
```

### Interface

```typescript
interface SettingsService {
  getSetting(key: string): Setting | undefined;
  setSetting(key: string, value: unknown): Setting;
  deleteSetting(key: string): boolean;
  getAgentDefaults(): ServerAgentDefaults;
  setAgentDefaults(defaults: ServerAgentDefaults): ServerAgentDefaults;
  getExternalSyncSettings(): ExternalSyncSettings;
  setExternalSyncSettings(settings: ExternalSyncSettings): ExternalSyncSettings;
  getProviderConfig(provider: string): ProviderConfig | undefined;
  setProviderConfig(provider: string, config: ProviderConfig): ProviderConfig;
}
```

### Generic Settings CRUD

```typescript
// Get a setting by key (returns undefined if not found)
const setting = settingsService.getSetting('myKey');
// setting: { key: string, value: unknown, updatedAt: string } | undefined

// Set a setting (upsert — inserts or updates)
const saved = settingsService.setSetting('myKey', { foo: 'bar' });

// Delete a setting (returns true if it existed)
const deleted = settingsService.deleteSetting('myKey');
```

### Agent Defaults

Manage default executable paths and fallback chains for agent providers.

```typescript
// Get agent defaults (returns default empty config if not set)
const defaults = settingsService.getAgentDefaults();
// defaults: { defaultExecutablePaths: Record<string, string>, fallbackChain?: string[] }

// Set agent defaults
settingsService.setAgentDefaults({
  defaultExecutablePaths: {
    'claude-code': '/usr/local/bin/claude',
    'opencode': '/usr/local/bin/opencode',
  },
  fallbackChain: ['claude', 'opencode-claude', 'opencode-gemini'],
});
```

### External Sync Settings

Manage external sync provider configurations, sync cursors, and polling settings. Tokens are stored in SQLite (not git-tracked) for security.

```typescript
// Get external sync settings (returns defaults if not configured)
const syncSettings = settingsService.getExternalSyncSettings();
// syncSettings: {
//   providers: Record<string, ProviderConfig>,
//   syncCursors: Record<string, string>,
//   pollIntervalMs: number,        // default: 60000
//   defaultDirection: SyncDirection // default: 'bidirectional'
// }

// Set external sync settings
settingsService.setExternalSyncSettings({
  providers: { github: { provider: 'github', token: 'ghp_...' } },
  syncCursors: {},
  pollIntervalMs: 30000,
  defaultDirection: 'bidirectional',
});

// Get a specific provider's config
const github = settingsService.getProviderConfig('github');
// github: { provider: string, token?: string, apiBaseUrl?: string, defaultProject?: string } | undefined

// Set a specific provider's config (updates within the sync settings)
settingsService.setProviderConfig('linear', {
  provider: 'linear',
  token: 'lin_api_...',
  defaultProject: 'my-team',
});
```

### Types

```typescript
interface Setting {
  key: string;
  value: unknown;
  updatedAt: string;
}

interface ServerAgentDefaults {
  /** Provider name → executable path (e.g. { claude: '/usr/local/bin/claude-dev' }) */
  defaultExecutablePaths: Record<string, string>;
  /** Ordered list of executable names/paths for rate limit fallback */
  fallbackChain?: string[];
}

type SyncDirection = 'push' | 'pull' | 'bidirectional';

interface ProviderConfig {
  provider: string;
  token?: string;
  apiBaseUrl?: string;
  defaultProject?: string;
}

interface ExternalSyncSettings {
  providers: Record<string, ProviderConfig>;
  syncCursors: Record<string, string>;
  pollIntervalMs: number;
  defaultDirection: SyncDirection;
}
```

### Well-Known Setting Keys

```typescript
const SETTING_KEYS = {
  AGENT_DEFAULTS: 'agentDefaults',
  RATE_LIMITS: 'rateLimits',
  EXTERNAL_SYNC: 'externalSync',
} as const;
```

### Related Services

- **RateLimitTracker** — uses `SettingsService` for persistence (key: `rateLimits`)
- **ExternalSyncDaemon** — reads provider tokens and poll intervals from `SettingsService`
- **DispatchDaemon** — reads agent defaults for executable fallback chains

---

## MetricsService

**File:** `services/metrics-service.ts`

Records and aggregates provider metrics for LLM usage tracking. Stores data in the `provider_metrics` SQLite table and provides aggregation queries for dashboards and CLI reporting.

The service tracks per-session usage data including token counts, duration, and outcome (completed, failed, rate-limited, or handoff). Aggregation methods support grouping by provider or model, with configurable time ranges for trend analysis.

```typescript
import { createMetricsService } from '@stoneforge/smithy';

const metricsService = createMetricsService(storage);
```

### Interface

```typescript
interface MetricsService {
  record(input: RecordMetricInput): void;
  aggregateByProvider(timeRange: TimeRange): AggregatedMetrics[];
  aggregateByModel(timeRange: TimeRange): AggregatedMetrics[];
  getTimeSeries(timeRange: TimeRange, groupBy: 'provider' | 'model'): TimeSeriesPoint[];
}
```

### Recording Metrics

```typescript
// Record a metric entry for an LLM session
metricsService.record({
  provider: 'claude-code',
  model: 'claude-sonnet-4-20250514',
  sessionId: 'session-abc123',
  taskId: 'el-1234',              // optional
  inputTokens: 15000,
  outputTokens: 3200,
  durationMs: 45000,
  outcome: 'completed',           // 'completed' | 'failed' | 'rate_limited' | 'handoff'
});
```

### Aggregation Queries

```typescript
// Aggregate by provider over the last 7 days
const byProvider = metricsService.aggregateByProvider({ days: 7 });
// Returns: AggregatedMetrics[] — one entry per provider, sorted by total tokens descending

// Aggregate by model over the last 30 days
const byModel = metricsService.aggregateByModel({ days: 30 });
// Each entry includes: group, totalInputTokens, totalOutputTokens, totalTokens,
//   sessionCount, avgDurationMs, errorRate, failedCount, rateLimitedCount
```

### Time Series

```typescript
// Get daily time-series data grouped by provider
const series = metricsService.getTimeSeries({ days: 7 }, 'provider');
// Returns: TimeSeriesPoint[] — one entry per (bucket, group) pair

// Get weekly time-series data grouped by model (for ranges > 30 days)
const weeklySeries = metricsService.getTimeSeries({ days: 90 }, 'model');
```

**Time bucket sizing:**
- ≤ 30 days → daily buckets
- \> 30 days → weekly buckets

### Types

```typescript
type MetricOutcome = 'completed' | 'failed' | 'rate_limited' | 'handoff';

interface RecordMetricInput {
  provider: string;
  model?: string;
  sessionId: string;
  taskId?: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  outcome: MetricOutcome;
}

interface TimeRange {
  /** Number of days to look back (e.g., 7, 14, 30) */
  days: number;
}

interface AggregatedMetrics {
  group: string;                // Provider name or model name
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;          // input + output
  sessionCount: number;
  avgDurationMs: number;
  errorRate: number;            // 0-1 (failed / total)
  failedCount: number;
  rateLimitedCount: number;
}

interface TimeSeriesPoint {
  bucket: string;               // ISO 8601 date string
  group: string;                // Provider or model name
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
  avgDurationMs: number;
}
```

### Related Services

- **DispatchDaemon** — records metrics at session completion
- **RateLimitTracker** — rate-limited outcomes are tracked via `outcome: 'rate_limited'`

---

## OperationLogService

**File:** `services/operation-log-service.ts`

Provides persistent, queryable operation logs for observability. Writes structured log entries to the `operation_log` SQLite table so that events survive session restarts and can be queried later via the CLI or dashboard.

Unlike application-level logging (which goes to stdout/files), the operation log captures discrete orchestration events — task dispatches, merge outcomes, session failures, rate limit detections — in a structured format suitable for querying and auditing.

```typescript
import { createOperationLogService } from '@stoneforge/smithy';

const operationLog = createOperationLogService(storage);
```

### Interface

```typescript
interface OperationLogService {
  write(
    level: OperationLogLevel,
    category: OperationLogCategory,
    message: string,
    details?: { agentId?: string; taskId?: string } & Record<string, unknown>
  ): void;

  query(filters?: OperationLogFilter): OperationLogEntry[];
}
```

### Writing Log Entries

```typescript
// Log a dispatch event
operationLog.write('info', 'dispatch', 'Task dispatched to worker', {
  agentId: 'el-abc1',
  taskId: 'el-1234',
  branch: 'agent/worker-1/el-1234-implement-feature',
});

// Log a merge failure
operationLog.write('error', 'merge', 'Merge conflict detected', {
  taskId: 'el-5678',
  conflictFiles: ['src/index.ts', 'src/config.ts'],
});

// Log a rate limit event
operationLog.write('warn', 'rate-limit', 'Executable rate-limited', {
  agentId: 'el-abc1',
  executable: 'claude',
  resetsAt: '2026-02-25T12:00:00.000Z',
});
```

The `agentId` and `taskId` fields from `details` are extracted into dedicated columns for efficient filtering. Remaining details are stored as JSON.

### Querying Log Entries

```typescript
// Get recent entries (default limit: 20, newest first)
const recent = operationLog.query();

// Filter by category
const mergeEvents = operationLog.query({ category: 'merge' });

// Filter by level and time range
const errors = operationLog.query({
  level: 'error',
  since: '2026-02-24T00:00:00.000Z',
  limit: 50,
});

// Filter by task or agent
const taskLogs = operationLog.query({ taskId: 'el-1234' });
const agentLogs = operationLog.query({ agentId: 'el-abc1' });

// Combine filters
const recentDispatchErrors = operationLog.query({
  level: 'error',
  category: 'dispatch',
  since: '2026-02-25T00:00:00.000Z',
  limit: 10,
});
```

### Types

```typescript
const OperationLogLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

type OperationLogLevel = 'info' | 'warn' | 'error';

const OperationLogCategory = {
  DISPATCH: 'dispatch',
  MERGE: 'merge',
  SESSION: 'session',
  RATE_LIMIT: 'rate-limit',
  STEWARD: 'steward',
  RECOVERY: 'recovery',
} as const;

type OperationLogCategory = 'dispatch' | 'merge' | 'session' | 'rate-limit' | 'steward' | 'recovery';

interface OperationLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly level: OperationLogLevel;
  readonly category: OperationLogCategory;
  readonly agentId?: string;
  readonly taskId?: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

interface OperationLogFilter {
  readonly level?: OperationLogLevel;
  readonly category?: OperationLogCategory;
  readonly since?: string;             // ISO timestamp
  readonly taskId?: string;
  readonly agentId?: string;
  readonly limit?: number;             // default: 20
}
```

### Log Categories

| Category | Description | Example Events |
|----------|-------------|----------------|
| `dispatch` | Task dispatch events | Task assigned to worker, poll errors |
| `merge` | Merge operations | Test results, merge outcomes, conflicts |
| `session` | Session lifecycle | Session spawn, terminate, failure |
| `rate-limit` | Rate limit tracking | Rate limit detection, recovery |
| `steward` | Steward execution | Steward triggered, execution results |
| `recovery` | Orphan recovery | Orphaned task detected, recovery attempt |

### Related Services

- **DispatchDaemon** — writes dispatch, session, and recovery logs
- **MergeStewardService** — writes merge logs
- **RateLimitTracker** — rate limit events are logged by consumers

---

## RateLimitTracker

**File:** `services/rate-limit-tracker.ts`

Tracks which agent executables are rate-limited and when their limits reset. Used by the dispatch system to avoid spawning sessions against rate-limited executables and to select fallback executables when the primary is throttled.

The tracker maintains an in-memory map of rate-limited executables with their reset times. Stale entries (past reset time) are lazily cleaned up during read operations. When a `SettingsService` is provided, the tracker persists its state to SQLite (key: `rateLimits`) and hydrates from it on creation, surviving server restarts.

```typescript
import { createRateLimitTracker } from '@stoneforge/smithy';

// In-memory only (state lost on restart)
const tracker = createRateLimitTracker();

// With persistence via SettingsService
const tracker = createRateLimitTracker(settingsService);
```

### Interface

```typescript
interface RateLimitTracker {
  markLimited(executable: string, resetsAt: Date): void;
  isLimited(executable: string): boolean;
  getAvailableExecutable(fallbackChain: string[]): string | undefined;
  getSoonestResetTime(): Date | undefined;
  getAllLimits(): RateLimitEntry[];
  isAllLimited(fallbackChain: string[]): boolean;
  clear(): void;
}
```

### Marking Rate Limits

```typescript
// Mark an executable as rate-limited until a reset time
tracker.markLimited('claude', new Date('2026-02-25T12:30:00.000Z'));

// If already tracked, only updates if new resetsAt is later (never downgrades)
tracker.markLimited('claude', new Date('2026-02-25T12:00:00.000Z'));
// ^ No effect — existing reset time is later
```

### Checking Rate Limits

```typescript
// Check if an executable is currently limited (auto-expires stale entries)
const limited = tracker.isLimited('claude');

// Check if all executables in a fallback chain are limited
const allLimited = tracker.isAllLimited(['claude', 'opencode-claude', 'opencode-gemini']);
// Returns false if the chain is empty
```

### Fallback Chain Selection

```typescript
// Walk the fallback chain and return the first non-limited executable
const available = tracker.getAvailableExecutable([
  'claude',            // primary — rate-limited
  'opencode-claude',   // fallback 1 — rate-limited
  'opencode-gemini',   // fallback 2 — available ✓
]);
// Returns 'opencode-gemini' (or undefined if all are limited)
```

### Querying State

```typescript
// Get the earliest reset time among all limited executables
const soonest = tracker.getSoonestResetTime();
// Returns Date | undefined — useful for scheduling retry timers

// Get all currently-limited entries (auto-expires stale entries first)
const limits = tracker.getAllLimits();
// limits: RateLimitEntry[] — each with { executable, resetsAt, recordedAt }
```

### Clearing State

```typescript
// Reset all tracked state (also clears persisted state if SettingsService is provided)
tracker.clear();
```

### Types

```typescript
interface RateLimitEntry {
  executable: string;
  resetsAt: Date;
  recordedAt: Date;
}
```

### Persistence

When created with a `SettingsService`, the tracker:

1. **Hydrates** on creation — reads persisted rate limits from SQLite (key: `rateLimits`), skipping expired entries
2. **Persists** on every `markLimited()` and `clear()` call — writes active entries to SQLite
3. **Auto-expires** stale entries before persisting to avoid writing dead data

```typescript
// Persisted state shape (in settings table)
// key: 'rateLimits'
// value: Record<string, { resetsAt: string, recordedAt: string }>
```

### Related Services

- **SettingsService** — provides persistence layer (optional)
- **DispatchDaemon** — checks rate limits before spawning sessions
- **StewardScheduler** — uses tracker to skip steward execution when all executables are limited
- **OperationLogService** — rate limit events are logged by consumers

---

## AgentRegistry

**File:** `services/agent-registry.ts`

Manages agent registration, querying, session tracking, and channel operations for the orchestration system. Agents are stored as `Entity` elements with specialized metadata in their `metadata.agent` field, using the `QuarryAPI` for all storage operations.

Each agent is created with a dedicated direct channel for receiving messages. The registry handles the full lifecycle — registration (with rollback on partial failure), querying by role/status/filters, session management, metadata updates, and deletion (including channel cleanup).

```typescript
import { createAgentRegistry } from '@stoneforge/smithy';

const registry = createAgentRegistry(api);
```

### Interface

```typescript
interface AgentRegistry {
  // Registration
  registerAgent(input: RegisterAgentInput): Promise<AgentEntity>;
  registerDirector(input: RegisterDirectorInput): Promise<AgentEntity>;
  registerWorker(input: RegisterWorkerInput): Promise<AgentEntity>;
  registerSteward(input: RegisterStewardInput): Promise<AgentEntity>;

  // Queries
  getAgent(entityId: EntityId): Promise<AgentEntity | undefined>;
  getAgentByName(name: string): Promise<AgentEntity | undefined>;
  listAgents(filter?: AgentFilter): Promise<AgentEntity[]>;
  getAgentsByRole(role: AgentRole): Promise<AgentEntity[]>;
  getAvailableWorkers(): Promise<AgentEntity[]>;
  getStewards(): Promise<AgentEntity[]>;
  getDirector(): Promise<AgentEntity | undefined>;

  // Session Management
  updateAgentSession(
    entityId: EntityId,
    sessionId: string | undefined,
    status: 'idle' | 'running' | 'suspended' | 'terminated'
  ): Promise<AgentEntity>;
  updateAgentMetadata(entityId: EntityId, updates: Partial<AgentMetadata>): Promise<AgentEntity>;
  updateAgent(entityId: EntityId, updates: { name?: string }): Promise<AgentEntity>;
  deleteAgent(entityId: EntityId): Promise<void>;

  // Channel Operations
  getAgentChannel(agentId: EntityId): Promise<Channel | undefined>;
  getAgentChannelId(agentId: EntityId): Promise<ChannelId | undefined>;
}
```

### Agent Registration

```typescript
// Register using the generic method (dispatches by role)
const agent = await registry.registerAgent({
  role: 'worker',
  name: 'worker-alice',
  workerMode: 'ephemeral',
  createdBy: humanEntityId,
  reportsTo: directorEntityId,
  tags: ['frontend'],
});

// Register a director (typically one per workspace)
const director = await registry.registerDirector({
  name: 'director-main',
  createdBy: humanEntityId,
  maxConcurrentTasks: 5,
  provider: 'claude-code',
  model: 'claude-sonnet-4-20250514',
});

// Register a worker
const worker = await registry.registerWorker({
  name: 'worker-bob',
  workerMode: 'ephemeral',
  createdBy: humanEntityId,
  reportsTo: directorEntityId,
  provider: 'claude-code',
  executablePath: '/usr/local/bin/claude',
});

// Register a steward
const steward = await registry.registerSteward({
  name: 'merge-steward',
  stewardFocus: 'merge',
  triggers: [{ type: 'event', event: 'task_completed' }],
  createdBy: humanEntityId,
  reportsTo: directorEntityId,
});
```

Agent names must be unique — registering a duplicate name throws an error. Registration creates a dedicated direct channel for the agent and stores the channel ID in the agent's metadata. If channel creation or metadata update fails, the operation rolls back (deletes any partially created resources).

### Agent Queries

```typescript
// Get by ID
const agent = await registry.getAgent(entityId);

// Get by name
const agent = await registry.getAgentByName('worker-alice');

// List all agents (optionally filtered)
const all = await registry.listAgents();
const workers = await registry.listAgents({ role: 'worker' });
const ephemeral = await registry.listAgents({ role: 'worker', workerMode: 'ephemeral' });
const mergeStewards = await registry.listAgents({ role: 'steward', stewardFocus: 'merge' });
const running = await registry.listAgents({ sessionStatus: 'running' });
const withSessions = await registry.listAgents({ hasSession: true });
const reporting = await registry.listAgents({ reportsTo: directorEntityId });

// Convenience methods
const allWorkers = await registry.getAgentsByRole('worker');
const available = await registry.getAvailableWorkers();  // idle workers
const stewards = await registry.getStewards();
const director = await registry.getDirector();           // first director found
```

### Session Management

```typescript
// Update session status (e.g., when spawning or terminating)
await registry.updateAgentSession(entityId, 'session-abc123', 'running');
await registry.updateAgentSession(entityId, undefined, 'idle');

// Update agent metadata (merged with existing)
await registry.updateAgentMetadata(entityId, {
  sessionStatus: 'running',
  worktree: '.stoneforge/.worktrees/worker-1-task-abc',
});

// Update agent properties
await registry.updateAgent(entityId, { name: 'worker-alice-renamed' });

// Delete agent (also deletes associated channel, best-effort)
await registry.deleteAgent(entityId);
```

### Channel Operations

Each agent has a dedicated direct channel for receiving dispatch notifications and messages.

```typescript
// Get the full channel object for an agent
const channel = await registry.getAgentChannel(agentId);
// First checks metadata for channelId (fast path), then falls back to channel search

// Get just the channel ID (faster — no channel fetch)
const channelId = await registry.getAgentChannelId(agentId);
```

### Registration Input Types

```typescript
interface RegisterDirectorInput {
  readonly name: string;
  readonly tags?: string[];
  readonly createdBy: EntityId;
  readonly maxConcurrentTasks?: number;
  readonly roleDefinitionRef?: ElementId;
  readonly provider?: string;
  readonly model?: string;
  readonly executablePath?: string;
}

interface RegisterWorkerInput {
  readonly name: string;
  readonly workerMode: WorkerMode;         // 'ephemeral' | 'persistent'
  readonly tags?: string[];
  readonly createdBy: EntityId;
  readonly reportsTo?: EntityId;
  readonly maxConcurrentTasks?: number;
  readonly roleDefinitionRef?: ElementId;
  readonly provider?: string;
  readonly model?: string;
  readonly executablePath?: string;
}

interface RegisterStewardInput {
  readonly name: string;
  readonly stewardFocus: StewardFocus;     // 'merge' | 'docs' | 'recovery' | 'custom'
  readonly triggers?: StewardTrigger[];
  readonly playbook?: string;              // deprecated — prefer playbookId
  readonly playbookId?: string;
  readonly tags?: string[];
  readonly createdBy: EntityId;
  readonly reportsTo?: EntityId;
  readonly maxConcurrentTasks?: number;
  readonly roleDefinitionRef?: ElementId;
  readonly provider?: string;
  readonly model?: string;
  readonly executablePath?: string;
}

type RegisterAgentInput =
  | (RegisterDirectorInput & { role: 'director' })
  | (RegisterWorkerInput & { role: 'worker' })
  | (RegisterStewardInput & { role: 'steward' });
```

### Filter Type

```typescript
interface AgentFilter {
  readonly role?: AgentRole;
  readonly workerMode?: WorkerMode;
  readonly stewardFocus?: StewardFocus;
  readonly sessionStatus?: 'idle' | 'running' | 'suspended' | 'terminated';
  readonly reportsTo?: EntityId;
  readonly hasSession?: boolean;
}
```

### Related Services

- **DispatchDaemon** — queries available workers and dispatches tasks via the registry
- **DispatchService** — uses the registry to look up agents and their channels
- **TaskAssignmentService** — references agents by ID for task assignment
- **StewardScheduler** — registers and queries stewards from the registry
- **AgentPoolService** — tracks pool membership using agent IDs from the registry

