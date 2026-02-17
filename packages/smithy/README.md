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

const orch = await createOrchestratorAPI({ rootDir: '.stoneforge' });

// Register a director agent
await orch.registerAgent({
  role: 'director',
  name: 'lead',
  provider: 'claude',
});

// Register an ephemeral worker
await orch.registerAgent({
  role: 'worker',
  name: 'dev-1',
  mode: 'ephemeral',
  provider: 'claude',
});

// Assign a task — dispatched automatically to an available worker
await orch.assignTask(taskId, { priority: 'high' });
```

## Agent Roles

| Role | Session | Description |
|------|---------|-------------|
| **Director** | Persistent | Creates tasks and plans, sets priorities, coordinates workers |
| **Worker (ephemeral)** | Task-scoped | Executes one task in an isolated Git worktree, exits on completion |
| **Worker (persistent)** | Interactive | Long-lived session for real-time collaboration with a human |
| **Steward** | Workflow-scoped | Merge review, branch cleanup, and documentation scanning/fixes |

## Providers

| Provider | Package | Notes |
|----------|---------|-------|
| `claude` | `@anthropic-ai/claude-agent-sdk` | Default, included as a dependency |
| `opencode` | `@opencode-ai/sdk` | Optional dependency |
| `codex` | Built-in | JSON-RPC over stdio |

Each provider implements the `AgentProvider` interface with `headless` and `interactive` sub-providers for non-interactive and interactive sessions respectively.

## Key Services

| Service | Description |
|---------|-------------|
| `AgentRegistry` | Register and look up agents by role/name |
| `DispatchService` | Match ready tasks to available workers |
| `DispatchDaemon` | Continuous polling loop for auto-dispatch |
| `TaskAssignmentService` | Assign tasks with orchestrator metadata |
| `WorkerTaskService` | Worker-side task operations (complete, hand off, request help) |
| `MergeStewardService` | Review and merge completed work branches |
| `StewardScheduler` | Run stewards on cron-like schedules |
| `RoleDefinitionService` | Store and retrieve agent role definitions |
| `AgentPoolService` | Manage pools of workers with auto-scaling |

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
| `@stoneforge/smithy/runtime` | Runtime utilities for agent execution |
| `@stoneforge/smithy/git` | Git worktree management |
| `@stoneforge/smithy/testing` | Test helpers and mocks |
| `@stoneforge/smithy/providers` | `AgentProvider` interface, provider registry, all providers |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
