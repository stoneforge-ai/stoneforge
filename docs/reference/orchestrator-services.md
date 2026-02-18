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

// Complete task
const task = await assignmentService.completeTask(taskId);
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
  poolService  // optional
);
```

### Starting the Daemon

```typescript
// Start the daemon
await daemon.start();

// Stop the daemon
await daemon.stop();
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
| **Plan Auto-Completion** | Auto-complete plans when all tasks are closed (enable via `planAutoCompleteEnabled`) |
| **Stuck-Merge Recovery** | Detect and recover stalled merge operations (enable via `stuckMergeRecoveryEnabled`) |

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
  worktreeManager  // Optional
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
