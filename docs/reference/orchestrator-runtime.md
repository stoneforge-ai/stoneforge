# Orchestrator Runtime Reference

Runtime components from `@stoneforge/smithy` (`packages/smithy/src/runtime/`).

## SpawnerService

**File:** `runtime/spawner.ts`

Manages Claude Code process spawning and lifecycle.

```typescript
import { createSpawnerService } from '@stoneforge/smithy';

const spawner = createSpawnerService({
  provider: myAgentProvider,      // AgentProvider instance (optional, defaults to ClaudeAgentProvider)
  workingDirectory: '/workspace', // Default working directory
  timeout: 120000,                // Timeout for init (2 minutes)
  stoneforgeRoot: '/workspace',    // Sets STONEFORGE_ROOT env var
  environmentVariables: {},       // Additional env vars
});
```

> **Note:** The `provider` field accepts an `AgentProvider` object (not a string). If omitted, defaults to the built-in `ClaudeAgentProvider`. The `claudePath` option is deprecated — use `provider` instead.

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
| `assistant` | `assistant` (or `tool_use` if tool_use content blocks present) |
| `user` | `user` |
| `system` | `system` |
| `result` | `result` |
| `error` | `error` |

**Note:** `tool_use` events are extracted from `assistant` messages that contain tool_use content blocks. `tool_result` events are mapped separately via `mapToolResultToEvent()`.

A batch variant is also available:

```typescript
import { mapSDKMessagesToEvents } from '@stoneforge/smithy';

// Convert multiple SDK messages at once
const events = mapSDKMessagesToEvents(sdkMessages);
```

---

## Provider Abstraction Layer

**Files:** `providers/registry.ts`, `providers/types.ts`, `providers/index.ts`

The provider abstraction layer enables drop-in replacement of the underlying agent CLI/SDK without changing orchestration logic. Three providers are built in: Claude Code (default), OpenCode, and Codex.

```typescript
import {
  AgentProviderRegistry,
  getProviderRegistry,
  ClaudeAgentProvider,
  OpenCodeAgentProvider,
  CodexAgentProvider,
  ProviderError,
} from '@stoneforge/smithy';
```

### AgentProviderRegistry

The registry manages provider registration and lookup. Claude, OpenCode, and Codex providers are registered automatically.

```typescript
// Get the singleton registry
const registry = getProviderRegistry();

// List registered providers
registry.list();  // ['claude-code', 'opencode', 'codex']

// Get a provider by name
const provider = registry.get('claude-code');

// Get the default provider (Claude)
const defaultProvider = registry.getDefault();

// Change the default provider
registry.setDefault('opencode');

// Get a provider with availability check (throws if unavailable)
const provider = await registry.getOrThrow('opencode');
```

### AgentProvider Interface

Each provider implements both headless (SDK) and interactive (PTY) session modes:

```typescript
interface AgentProvider {
  readonly name: string;
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;

  /** Check if provider CLI/SDK is installed */
  isAvailable(): Promise<boolean>;

  /** Installation instructions shown when unavailable */
  getInstallInstructions(): string;

  /** List models available from this provider */
  listModels(): Promise<ModelInfo[]>;
}
```

### Session Types

**Headless sessions** (SDK-based, used by automated agents):

```typescript
interface HeadlessSpawnOptions {
  readonly workingDirectory: string;
  readonly initialPrompt?: string;
  readonly resumeSessionId?: ProviderSessionId;
  readonly environmentVariables?: Record<string, string>;
  readonly stoneforgeRoot?: string;
  readonly timeout?: number;
  readonly model?: string;  // e.g., 'claude-sonnet-4-20250514'
}

// Spawn a headless session
const session = await provider.headless.spawn(options);

// Iterate over messages
for await (const message of session) {
  console.log(message.type, message.content);
}

// Send follow-up messages
session.sendMessage('continue');

// Interrupt or close
await session.interrupt();
session.close();
```

**Interactive sessions** (PTY-based, used by terminal UIs):

```typescript
interface InteractiveSpawnOptions {
  readonly workingDirectory: string;
  readonly initialPrompt?: string;
  readonly resumeSessionId?: ProviderSessionId;
  readonly environmentVariables?: Record<string, string>;
  readonly stoneforgeRoot?: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly model?: string;
}

// Spawn an interactive session
const session = await provider.interactive.spawn(options);

// Handle PTY data
session.onData((data) => process.stdout.write(data));
session.onExit((code) => console.log('Exited:', code));

// Write to PTY
session.write('hello\n');

// Resize terminal
session.resize(120, 40);
```

### Built-in Providers

| Provider | Name | Class |
|----------|------|-------|
| Claude Code | `'claude-code'` | `ClaudeAgentProvider` |
| OpenCode | `'opencode'` | `OpenCodeAgentProvider` |
| Codex | `'codex'` | `CodexAgentProvider` |

### Registering a Custom Provider

```typescript
import { getProviderRegistry } from '@stoneforge/smithy';
import type { AgentProvider } from '@stoneforge/smithy';

class MyProvider implements AgentProvider {
  readonly name = 'my-agent';
  readonly headless = new MyHeadlessProvider();
  readonly interactive = new MyInteractiveProvider();

  async isAvailable() { return true; }
  getInstallInstructions() { return 'Install my-agent CLI'; }
  async listModels() { return []; }
}

const registry = getProviderRegistry();
registry.register(new MyProvider());
```

### ProviderError

Thrown when a provider operation fails (SDK crash, auth failure, etc.). Route handlers can catch this to return 503 instead of 500:

```typescript
import { ProviderError } from '@stoneforge/smithy';

try {
  const session = await provider.headless.spawn(options);
} catch (err) {
  if (err instanceof ProviderError) {
    console.error(`Provider '${err.providerName}' failed: ${err.message}`);
  }
}
```
