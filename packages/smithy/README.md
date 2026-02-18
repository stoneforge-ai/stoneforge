<p align="center">
  <img src="https://raw.githubusercontent.com/stoneforge-ai/stoneforge/master/brand/logo.svg" alt="Stoneforge" width="120" height="120">
</p>

# @stoneforge/smithy

Multi-agent orchestration for Stoneforge — directors, workers, and stewards with provider-agnostic session management.

[![npm](https://img.shields.io/npm/v/@stoneforge/smithy)](https://www.npmjs.com/package/@stoneforge/smithy)
[![license](https://img.shields.io/npm/l/@stoneforge/smithy)](https://github.com/stoneforge-ai/stoneforge/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@stoneforge/smithy)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

## Overview

`@stoneforge/smithy` adds AI agent orchestration on top of `@stoneforge/quarry`. It defines three agent roles (director, worker, steward), manages their sessions across multiple providers, dispatches tasks automatically, and isolates work in Git worktrees. Agents communicate through Stoneforge channels.

## Installation

```bash
npm install @stoneforge/smithy
```

The default Claude provider is included. For additional providers, install the corresponding optional dependency:

```bash
# OpenCode provider
npm install @opencode-ai/sdk
```

## Quick Start

```typescript
import { createOrchestratorAPI } from '@stoneforge/smithy';
import { createStorage, initializeSchema } from '@stoneforge/storage';

// Create a storage backend and initialize the schema
const storage = createStorage('.stoneforge/db.sqlite');
initializeSchema(storage);

// Create the OrchestratorAPI (extends QuarryAPI)
const api = createOrchestratorAPI(storage);

// Register a director agent
const director = await api.registerDirector({
  name: 'lead',
  createdBy: humanEntityId,
});

// Register an ephemeral worker
const worker = await api.registerWorker({
  name: 'dev-1',
  workerMode: 'ephemeral',
  createdBy: director.id,
  reportsTo: director.id,
});

// Assign a task to the worker (auto-generates branch and worktree names)
await api.assignTaskToAgent(taskId, worker.id);
```

## Agent Roles

| Role | Session | Description |
|------|---------|-------------|
| **Director** | Persistent | Creates tasks and plans, sets priorities, coordinates workers |
| **Worker (ephemeral)** | Task-scoped | Executes one task in an isolated Git worktree, exits on completion |
| **Worker (persistent)** | Interactive | Long-lived session for real-time collaboration with a human |
| **Steward** | Workflow-scoped | Merge review, branch cleanup, and documentation scanning/fixes |

## OrchestratorAPI

The `OrchestratorAPI` extends `QuarryAPI` (from `@stoneforge/quarry`) with agent-specific operations. Create one with `createOrchestratorAPI(backend)` where `backend` is a `StorageBackend` from `@stoneforge/storage`.

### Agent Registration

```typescript
// Director — one per workspace
const director = await api.registerDirector({
  name: 'MainDirector',
  createdBy: humanEntityId,
  maxConcurrentTasks: 1,       // optional
  provider: 'claude',           // optional, default: 'claude'
  model: 'claude-sonnet-4-20250514', // optional
});

// Ephemeral worker
const worker = await api.registerWorker({
  name: 'Worker-1',
  workerMode: 'ephemeral',     // 'ephemeral' | 'persistent'
  createdBy: directorId,
  reportsTo: directorId,       // optional
  maxConcurrentTasks: 1,       // optional
  roleDefinitionRef: roleDefId, // optional
});

// Steward
const steward = await api.registerSteward({
  name: 'MergeSteward',
  stewardFocus: 'merge',       // 'merge' | 'docs' | 'recovery' | 'custom'
  triggers: [{ type: 'event', event: 'task_completed' }],
  createdBy: directorId,
});
```

### Agent Queries

```typescript
const agent = await api.getAgent(entityId);
const agentByName = await api.getAgentByName('Worker-1');
const allAgents = await api.listAgents();
const workers = await api.listAgents({ role: 'worker' });
const director = await api.getDirector();
const stewards = await api.getStewards();
const available = await api.getAvailableWorkers();
```

### Task Assignment

```typescript
// Assign a task — auto-generates branch and worktree paths
const task = await api.assignTaskToAgent(taskId, workerId);

// With explicit options
const task = await api.assignTaskToAgent(taskId, workerId, {
  branch: 'agent/worker-1/task-feat-auth',
  worktree: '.stoneforge/.worktrees/worker-1-feat-auth',
  sessionId: 'session-123',
  markAsStarted: true,
});

// Read/update orchestrator metadata on a task
const meta = await api.getTaskOrchestratorMeta(taskId);
await api.updateTaskOrchestratorMeta(taskId, { mergeStatus: 'pending' });
```

### Session Management

```typescript
await api.updateAgentSession(agentId, 'session-123', 'running');
// Session states: 'idle' | 'running' | 'suspended' | 'terminated'

const channelId = await api.getAgentChannel(agentId);
```

## Providers

| Provider | Package | Notes |
|----------|---------|-------|
| `claude` | `@anthropic-ai/claude-agent-sdk` | Default, included as a dependency |
| `opencode` | `@opencode-ai/sdk` | Optional dependency |
| `codex` | Built-in | JSON-RPC over stdio |

Each provider implements the `AgentProvider` interface with `headless` and `interactive` sub-providers for non-interactive and interactive sessions respectively.

### Scaling with Multiple Plans

To run 10+ agents concurrently, split them across multiple Claude Code MAX or Pro plans:

1. Create a profile wrapper for each plan — set `CLAUDE_CONFIG_DIR` to a separate directory and authenticate each one
2. In the Stoneforge dashboard (Settings > Agent Defaults), set the executable path per provider, or set it per-agent when creating/editing agents

See the [Claude Code profiles discussion](https://github.com/anthropics/claude-code/issues/261#issuecomment-3071151276) for wrapper script examples.

## Key Services

| Service | Description |
|---------|-------------|
| `AgentRegistry` | Register and look up agents by role/name |
| `RoleDefinitionService` | Store and retrieve agent role definitions |
| `TaskAssignmentService` | Assign tasks with orchestrator metadata |
| `DispatchService` | Match ready tasks to available workers |
| `DispatchDaemon` | Continuous polling loop for auto-dispatch |
| `WorkerTaskService` | Worker-side task operations (complete, hand off) |
| `MergeStewardService` | Review and merge completed work branches |
| `DocsStewardService` | Documentation scanning and fixes |
| `StewardScheduler` | Run stewards on cron-like schedules |
| `AgentPoolService` | Manage pools of workers with auto-scaling |
| `PluginExecutor` | Execute steward plugins (playbooks, scripts, commands) |

## Git Worktree Isolation

Workers operate in isolated Git worktrees to prevent conflicts:

- **Ephemeral workers:** `agent/{worker-name}/{task-id}-{slug}`
- **Persistent workers:** `agent/{worker-name}/session-{timestamp}`

Utilities for creating, listing, and cleaning up worktrees are available in the `./git` entry point.

## Entry Points

| Import | Contents |
|--------|----------|
| `@stoneforge/smithy` | Everything (re-exports all subpaths) |
| `@stoneforge/smithy/types` | Agent roles, metadata, message types, naming utilities |
| `@stoneforge/smithy/services` | All orchestration services |
| `@stoneforge/smithy/runtime` | Runtime utilities for agent execution, session management, providers |
| `@stoneforge/smithy/git` | Git worktree management |
| `@stoneforge/smithy/providers` | `AgentProvider` interface, provider registry, all providers |
| `@stoneforge/smithy/testing` | Test helpers, mocks, and orchestration test definitions |
| `@stoneforge/smithy/server` | HTTP/WebSocket server for agent orchestration |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
