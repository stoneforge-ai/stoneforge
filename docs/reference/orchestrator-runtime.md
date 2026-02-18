# Orchestrator Runtime Reference

Runtime components from `@stoneforge/smithy` (`packages/smithy/src/runtime/`).

## SpawnerService

**File:** `runtime/spawner.ts`

Manages Claude Code process spawning and lifecycle.

```typescript
import { createSpawnerService } from '@stoneforge/smithy';

const spawner = createSpawnerService({
  provider: 'claude-code',        // Agent provider (preferred)
  claudePath: 'claude',           // @deprecated - use provider instead
  workingDirectory: '/workspace', // Default working directory
  timeout: 30000,                 // Timeout for init (30s)
  stoneforgeRoot: '/workspace',    // Sets STONEFORGE_ROOT env var
  environmentVariables: {},       // Additional env vars
});
```

### Spawn Modes

| Mode | Use Case | Communication |
|------|----------|---------------|
| `headless` | Ephemeral workers, stewards, triage sessions | Stream-JSON over stdin/stdout |
| `interactive` | Directors, persistent workers | PTY (node-pty) for terminal |

**Defaults:**
- Directors → `interactive`
- Workers → `headless` (override with `mode: 'interactive'` for persistent)
- Stewards → `headless`
- Triage sessions → `headless`

### Spawning Headless Agents

```typescript
const result = await spawner.spawn(agentId, 'worker', {
  mode: 'headless',
  workingDirectory: '/path/to/worktree',
  resumeSessionId: 'previous-session',
  initialPrompt: 'Implement the feature',
});

// Access session info
console.log(result.session.id);              // Internal session ID
console.log(result.session.providerSessionId); // Provider session ID (for resume)
console.log(result.session.status);          // 'running'
console.log(result.session.mode);            // 'headless'

// Listen for events
result.events.on('event', (event) => {
  console.log(`Event type: ${event.type}`);
  if (event.message) console.log(event.message);
});

result.events.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code}`);
});
```

### Spawning Interactive Agents (PTY)

```typescript
const result = await spawner.spawn(agentId, 'director', {
  mode: 'interactive',
  workingDirectory: '/path/to/project',
  resumeSessionId: 'previous-session',
  initialPrompt: 'Hello',
  cols: 120,  // Terminal columns
  rows: 30,   // Terminal rows
});

// Listen for PTY data
result.events.on('pty-data', (data: string) => {
  terminalEmulator.write(data);
});
```

### Session Operations

```typescript
// Write to PTY (interactive only)
await spawner.writeToPty(sessionId, 'ls -la\r');

// Resize PTY
await spawner.resize(sessionId, 80, 24);

// Terminate session
await spawner.terminate(sessionId, true);   // graceful (SIGTERM then SIGKILL)
await spawner.terminate(sessionId, false);  // force (SIGKILL)

// Suspend session
await spawner.suspend(sessionId);

// Interrupt session (sends interrupt signal)
await spawner.interrupt(sessionId);

// Send input (headless)
await spawner.sendInput(sessionId, 'Please continue');
```

### Session Queries

```typescript
const session = spawner.getSession(sessionId);
const active = spawner.listActiveSessions();
const forAgent = spawner.listActiveSessions(agentId);
const all = spawner.listAllSessions();
const recent = spawner.getMostRecentSession(agentId);
const events = spawner.getEventEmitter(sessionId);
```

### Session States

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `starting` | Process starting | running, terminated |
| `running` | Agent active | suspended, terminating, terminated |
| `suspended` | Paused for resume | running, terminated |
| `terminating` | Shutting down | terminated |
| `terminated` | Process ended | (none) |

### Triage Sessions

Triage sessions are a specialized session type used by the dispatch daemon to evaluate and categorize incoming messages. They differ from standard agent sessions:

| Property | Triage Session | Standard Session |
|----------|---------------|-----------------|
| **Mode** | `headless` | `headless` or `interactive` |
| **Worktree** | Read-only (detached HEAD, no branch) | Standard (dedicated branch) |
| **Lifecycle** | Spawned on demand, cleanup on exit | Managed by session manager |
| **Purpose** | Evaluate/categorize messages | Execute tasks |

**Lifecycle:**
1. Dispatch daemon identifies messages needing triage
2. A read-only worktree is created via `WorktreeManager.createReadOnlyWorktree()`
3. A headless session is spawned with the triage prompt (`message-triage.md`)
4. The session evaluates messages and produces categorization results
5. On exit, the read-only worktree is cleaned up automatically

Triage sessions do not create branches, do not make commits, and are not resumable.

### Stream-JSON Events (Headless)

```typescript
interface SpawnedSessionEvent {
  type: StreamJsonEventType;    // 'system' | 'assistant' | 'user' | 'tool_use' | 'tool_result' | 'result' | 'error'
  subtype?: string;             // e.g., 'init', 'text'
  receivedAt: Timestamp;
  raw: StreamJsonEvent;
  message?: string;
  tool?: { name?: string; id?: string; input?: unknown };
}
```

### UWP (Universal Work Principle)

Workers do NOT check their own queue for tasks. The Dispatch Daemon handles all task assignment and worker spawning:

1. **Daemon polls** for available ephemeral workers (no active session)
2. **Daemon assigns** highest priority unassigned task to worker
3. **Daemon spawns** worker INSIDE the task worktree directory
4. **Worker receives** dispatch message with task details as initial prompt

This separation ensures workers focus solely on execution while the daemon coordinates all dispatch logic.

Similarly, merge stewards are dispatched automatically when tasks reach REVIEW status. The daemon assigns the steward to the task, sets `mergeStatus` to `'testing'`, and tracks the session ID for recovery after server restarts.

---

## SessionManager

**File:** `runtime/session-manager.ts`

Higher-level session lifecycle management with resume support.

```typescript
import { createSessionManager } from '@stoneforge/smithy';

const sessionManager = createSessionManager(spawner, api, agentRegistry, settingsService?);
```

### Starting Sessions

```typescript
const { session, events } = await sessionManager.startSession(agentId, {
  workingDirectory: '/path/to/worktree',
  worktree: '/worktrees/worker-1',
  initialPrompt: 'Please implement the feature',
  interactive: false,
});

events.on('event', (event) => console.log(event));
events.on('status', (status) => console.log(`Status: ${status}`));
events.on('exit', (code, signal) => console.log(`Exited: ${code}`));
```

### Resuming Sessions

```typescript
const { session, events, uwpCheck } = await sessionManager.resumeSession(agentId, {
  providerSessionId: 'previous-provider-session-id',
  workingDirectory: '/path/to/worktree',
  resumePrompt: 'Continue where you left off',
  checkReadyQueue: true,   // Enable UWP check (default)
  getReadyTasks,           // Callback for UWP
});

if (uwpCheck?.hasReadyTask) {
  console.log(`Task found: ${uwpCheck.taskTitle}`);
}
```

### Stopping and Suspending

```typescript
// Stop (terminate)
await sessionManager.stopSession(sessionId, {
  graceful: true,
  reason: 'Task completed',
});

// Suspend (can resume later)
await sessionManager.suspendSession(sessionId, 'Context overflow');
```

### Session Queries

```typescript
const session = sessionManager.getSession(sessionId);
const activeSession = sessionManager.getActiveSession(agentId);
const sessions = sessionManager.listSessions({
  agentId,
  role: 'worker',
  status: ['running', 'suspended'],
  resumable: true,
});
const resumable = sessionManager.getMostRecentResumableSession(agentId);
```

### Session History

```typescript
// Per-agent history
const history = await sessionManager.getSessionHistory(agentId, 10);

// Role-based history
const workerHistory = await sessionManager.getSessionHistoryByRole('worker', 20);

// Get previous session for role
const previousWorker = await sessionManager.getPreviousSession('worker');
```

### Session Communication

```typescript
const result = await sessionManager.messageSession(sessionId, {
  content: 'Please provide a status update',
  senderId: directorAgentId,
  metadata: { urgent: true },
});
```

---

> **Note:** Message routing is handled by the Dispatch Daemon (`services/dispatch-daemon.ts`), which routes messages by agent role and spawns triage sessions for idle agents.

---

## HandoffService

**File:** `runtime/handoff.ts`

Session handoffs for context preservation.

```typescript
import { createHandoffService } from '@stoneforge/smithy';

const handoffService = createHandoffService(sessionManager, agentRegistry, api);
```

### Self-Handoff

```typescript
const result = await handoffService.selfHandoff(agentId, sessionId, {
  contextSummary: 'Current progress on feature X...',
  nextSteps: 'Continue with step 3',
  reason: 'Context overflow',
  metadata: { iteration: 2 },
});
```

### Agent-to-Agent Handoff

```typescript
const result = await handoffService.handoffToAgent(fromAgentId, toAgentId, sessionId, {
  contextSummary: 'Current state and progress...',
  nextSteps: 'Review and merge the PR',
  reason: 'Specialization required',
  taskIds: [taskId1, taskId2],
  triggerTarget: true,  // Wake up target agent (default: true)
});
```

---

## PredecessorQueryService

**File:** `runtime/predecessor-query.ts`

Query previous sessions for context.

```typescript
import { createPredecessorQueryService } from '@stoneforge/smithy';

const predecessorService = createPredecessorQueryService(sessionManager);
```

### Query Predecessor

```typescript
// Check for predecessor
const hasPredecessor = await predecessorService.hasPredecessor('director');
const predecessorInfo = await predecessorService.getPredecessorInfo('director');

// Consult predecessor
const result = await predecessorService.consultPredecessor(
  currentAgentId,
  'director',
  'What was your approach to the authentication feature?',
  {
    timeout: 60000,
    context: 'Working on auth feature',
    suspendAfterResponse: true,
  }
);

if (result.success) {
  console.log('Response:', result.response);
}
```

### Manage Active Queries

```typescript
const activeQueries = predecessorService.listActiveQueries();
const query = predecessorService.getActiveQuery(queryId);
await predecessorService.cancelQuery(queryId);
```

---

## MessageMapper

**File:** `runtime/message-mapper.ts`

Maps between SDK message types and Stoneforge events.

```typescript
import { mapSDKMessageToEvent } from '@stoneforge/smithy';

// SDK → Stoneforge
const event = mapSDKMessageToEvent(sdkMessage);

// Note: There is no reverse mapping function (Stoneforge → SDK).
```

### Event Type Mapping

| SDK Message Type | Stoneforge EventType |
|------------------|---------------------|
| `assistant` | `assistant` |
| `tool_use` | `tool_use` |
| `tool_result` | `tool_result` |
| `system` | `system` |
| `error` | `error` |
