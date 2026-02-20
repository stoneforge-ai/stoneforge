<p align="center">
  <img src="brand/logo.svg" alt="Stoneforge" width="180" height="180">
</p>

<h1 align="center">Stoneforge</h1>

<p align="center">
  <strong>A web dashboard and runtime for orchestrating AI coding agents</strong>
</p>

<p align="center">
  <a href="#why-stoneforge">Why Stoneforge?</a> &nbsp;&middot;&nbsp;
  <a href="#quick-start">Quick Start</a> &nbsp;&middot;&nbsp;
  <a href="#how-it-works">How It Works</a> &nbsp;&middot;&nbsp;
  <a href="#the-web-dashboard">Web Dashboard</a> &nbsp;&middot;&nbsp;
  <a href="#customization">Customization</a> &nbsp;&middot;&nbsp;
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License: Apache 2.0">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js: >=18.0.0">
  <img src="https://img.shields.io/badge/bun-supported-orange.svg" alt="Bun: supported">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript: 5.0+">
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React: 19">
</p>

---

## Why Stoneforge?

Running one AI coding agent is simple. Running several in parallel — a planner, coders, a reviewer — breaks down fast:

- **Merge conflicts** — agents edit the same files on the same branch
- **Wasted work** — two agents grab the same task, or one starts on work that's blocked
- **Lost context** — when an agent fails mid-task, the next one starts from scratch
- **No visibility** — you can't see what's happening until you check each terminal

Stoneforge is a multi-agent orchestration platform that solves these problems. Install it, start the server, and use the web dashboard to direct a team of AI coding agents. A Director plans the work, Workers execute in isolated git worktrees, Stewards auto-merge and clean up, and a dispatch daemon keeps everyone busy.

Beyond orchestration, Stoneforge merges the entire software project management stack into one agent-first platform — issues and tasks (replacing Linear/GitHub Issues), notes and documents (replacing Notion/Obsidian), messages and chats (replacing Slack/Discord), code and branches (replacing manual git workflows), and merge requests (replacing GitHub PR workflows). Everything lives in one system so agents never lose context switching between tools.

Stoneforge has two main layers:

- **Smithy** (`@stoneforge/smithy`) — the orchestrator. Spawns agents, dispatches tasks, manages sessions, handles worktree isolation and merge review. **This is what you install.**
- **Quarry** (`@stoneforge/quarry`) — the underlying data SDK. Event-sourced task management, sync, and storage. Used by smithy internally; also available standalone for custom integrations.

### How is it different?

Claude Code now has an experimental [agent teams](https://docs.anthropic.com/en/docs/claude-code/agent-teams) feature — here's how Stoneforge compares:

|                          | Claude Code Agent Teams                                           | Stoneforge                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **State**                | Ephemeral — file-based task list, no persistence across sessions  | Event-sourced — SQLite + JSONL, survives restarts, full audit trail                                                                                               |
| **UI**                   | Terminal-only (tmux split panes or inline)                        | Web dashboard with real-time agent output, kanban boards, metrics                                                                                                 |
| **Branch isolation**     | Manual — "avoid editing the same file"                            | Automatic — each worker gets its own git worktree                                                                                                                 |
| **Task dispatch**        | Lead assigns or teammates self-claim                              | Dispatch daemon auto-assigns by priority, respects dependencies                                                                                                   |
| **Merge**                | Manual                                                            | Merge steward runs tests, squash-merges on pass, creates fix task on fail                                                                                         |
| **Communication**        | Lead-mediated messages, broadcast                                 | Persistent channels with threading, inbox triage, searchable history                                                                                              |
| **Knowledge base**       | CLAUDE.md only                                                    | Versioned document libraries with FTS5 + semantic search                                                                                                          |
| **Structured processes** | Ad-hoc task lists                                                 | Playbook templates → resumable workflows with durable state                                                                                                       |
| **Provider lock-in**     | Claude Code only                                                  | Claude Code, OpenCode, or OpenAI Codex                                                                                                                            |
| **Scaling**              | Single plan — limited by one account's rate limits                | Multi-plan — split agents across multiple Claude MAX/Pro plans via custom executable paths ([setup guide](packages/smithy/README.md#scaling-with-multiple-plans)) |
| **Status**               | Experimental, known limitations (no session resumption, task lag) | Usable today — some edge cases still have sharp edges                                                                                                             |

Compared to running a single agent (Claude Code, Cursor), Stoneforge gives you parallel execution with coordination. Compared to background agents (Cursor background agents, Codex), it adds dependency-aware scheduling, merge automation, and a persistent knowledge layer. Compared to custom scripts and task runners, you get a web dashboard, event-sourced state, and merge review built in.

**What you get:**

- **Real-time cross-agent communication** — channels, threads, and inbox triage so agents share context and escalate blockers without losing messages
- **Linear-like issue tracking** — priorities, dependencies, scheduling, kanban views, and plan grouping — all visible in the web dashboard
- **Evergreen documentation** — versioned document libraries with full-text and semantic search, so agents always have up-to-date project context
- **Structured workflows** — playbook templates that instantiate into resumable task sequences with durable state — if a step fails, the workflow resumes from there, not from scratch

---

## Quick Start

### Prerequisites

- **Node.js 18+** or **Bun** (any recent version)

### From Zero to Orchestrating

```bash
# 1. Install the Stoneforge CLI globally
npm install -g @stoneforge/smithy

# 2. Initialize a workspace in your project
cd your-project && sf init

# 3. Start the server + web dashboard at http://localhost:3457
sf serve

# 4. Open the dashboard
open http://localhost:3457
```

Once the dashboard is running:

1. **Register a Director** — Agents page, or CLI: `sf agent register director --role director`
2. **Start the Director** — Director Panel in the right sidebar, or CLI: `sf agent start <id>`
3. **Register workers** — Agents page, or CLI: `sf agent register e-worker-1 --role worker`
4. **Register a Merge Steward** — Agents page, or CLI: `sf agent register m-steward-1 --role steward --focus merge`
5. **Tell the Director your goal** via the Director Panel
6. **Watch it work** — Activity page shows live agent output, Tasks page shows progress, Merge Requests shows completed work

Agents can use **Claude Code** (default), **OpenCode**, or **OpenAI Codex** as their underlying provider — set via `--provider` at registration or session start.

---

## How It Works

### Agent Roles

| Role                  | What It Does                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Director**          | Your strategic planner. You describe a goal, the Director breaks it into tasks with priorities and dependencies. Runs as a persistent session.                                                               |
| **Ephemeral Worker**  | Spawned automatically by the dispatch daemon to complete a specific task. Executes in an isolated worktree, commits, pushes, then completes or hands off. You register them and the daemon handles the rest. |
| **Persistent Worker** | Started and stopped manually (by you) for one-off or exploratory work. Runs an interactive session and is not auto-dispatched for tasks.                                                                     |
| **Steward**           | Handles maintenance workflows — merge review, documentation scanning, recovery of stuck tasks, custom repeatable workflows. Runs on triggers or schedules.                                                   |

The **dispatch daemon** is a background process (not an agent role) that watches for ready tasks and assigns them to idle workers. Start it with `sf daemon start`.

### The Orchestration Loop

```
    You ──── "Build feature X" ────▶ Director
                                        │
                                   creates plan
                                   with tasks
                                        │
                                        ▼
                                  ┌────────────┐
                                  │ Task Pool  │ ◀─── priorities, dependencies
                                  └─────┬──────┘
                                        │
                              daemon assigns ready
                              tasks to idle workers
                                        │
                        ┌───────────────┼────────────────┐
                        ▼               ▼                ▼
                  ┌───────────┐   ┌───────────┐    ┌───────────┐
                  │  Worker1  │   │  Worker2  │    │  Worker3  │
                  │(worktree) │   │(worktree) │    │ (worktree)|
                  └────┬──────┘   └─────┬─────┘    └────┬──────┘
                       │                │               │
                commit & push    commit & push   commit & push
                       │                │               │
                       └────────────────┼───────────────┘
                                        ▼
                                ┌──────────────┐
                                │    Steward   │
                                │(merge review)│
                                └──────┬───────┘
                                       │
                          tests pass? ──▶ squash-merge
                          tests fail? ──▶ task handoff created
```

1. You communicate your goal to the Director (via Director Panel in the web UI)
2. Director creates a plan with tasks, priorities, and dependencies
3. Dispatch daemon detects ready (unblocked, unassigned) tasks, assigns to idle workers
4. Workers spawn in isolated git worktrees (`agent/{worker-name}/{task-id}-{slug}`)
5. Worker executes, commits, pushes, then completes (creating a PR / merge request) or hands off (returns task to queue with notes)
6. Merge steward triggered — runs tests, squash-merges on pass / creates task handoff to new worker on fail
7. Loop repeats for remaining tasks

### Merge Review

The merge steward automates branch integration:

- Runs your test command, squash-merges on pass, creates a task handoff to new worker on failure
- Configurable: test command, merge strategy (squash/merge), auto-push, auto-cleanup
- Merge provider is configurable: GitHub (PR-based) or local smithy (local merge requests w/ direct squash-merge)

### Steward Types

| Type         | Purpose                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| **Merge**    | Auto-reviews PRs, runs tests, squash-merges or creates task handoff              |
| **Recovery** | Cleans up stuck merges and orphaned tasks                                        |
| **Docs**     | (Optional) Scans and fixes documentation accuracy                                |
| **Custom**   | (Optional) User-defined workflow templates triggered by cron schedules or events |

### Workflows

Workflows are reusable sequences of tasks that execute in order with durable state. If a step fails, the workflow resumes from that step rather than restarting from scratch. Useful for multi-stage processes like build → test → deploy.

### Handoff

When a worker can't complete a task, it hands off — the task returns to the pool with context notes, and the next available worker picks it up with the existing branch and worktree intact.

---

## The Web Dashboard

The dashboard is organized by sidebar navigation groups. Open it at `http://localhost:3457` after running `sf serve`.

### Overview

- **Activity** — Active agents with live terminal output, recent completions, system status.
- **Inbox** — Messages needing your attention from agents.
- **Editor** — In-browser code editor with Monaco, LSP support, and direct file access.

### Work

- **Tasks** — List and Kanban views, status tabs (Backlog → Unassigned → Assigned → In Progress → Awaiting Merge → Closed), filtering, bulk ops.
- **Merge Requests** — Review queue for agent PRs with status tracking and keyboard navigation.
- **Plans** — Group related tasks, track plan-level progress.
- **Workflows** — Define and manage reusable task sequences.

### Orchestration

- **Agents** — Register, start, stop agents. Tabs: Agents, Stewards, Pools (concurrency limits), Graph (visual topology).
- **Workspaces** — tmux-like terminal multiplexer. Multiple agent terminals side-by-side with saved layouts.

### Collaborate

- **Messages** — Channel-based messaging between agents and operators.
- **Documents** — Shared knowledge base with libraries and version history.

### Analytics

- **Metrics** — Task throughput, agent efficiency, queue health over configurable time ranges.

### Director Panel

Always-available right sidebar with an interactive terminal for the Director agent. Start/stop/resume sessions, see unread inbox count.

---

## Customization

### Custom Prompts

Override built-in role prompts per-project via `.stoneforge/prompts/`:

- `director.md`, `worker.md`, `persistent-worker.md`
- `steward-base.md`, `steward-merge.md`, `steward-docs.md`, `steward-recovery.md`

### Custom Stewards

Register with `--focus custom`, attach cron/event triggers, and provide a workflow template.

### Agent Pools

Control concurrent execution with pool size limits. Manage via the Agents > Pools tab in the dashboard or `sf pool create` from the CLI.

### Providers

Default provider is **Claude Code**. Also supports **OpenCode** and **OpenAI Codex**. Set per-agent at registration (`--provider opencode`) or per-session at start.

You do **not** configure API keys in Stoneforge. Authentication is configured within the underlying agent harness CLI (Claude Code, OpenCode, or Codex) and passes through to Stoneforge automatically.

---

## Architecture

### Dual Storage Model

```
┌─────────────────────────────────────────────────────────────┐
│                         SQLite                              │
│  • Fast queries with indexes                                │
│  • Full-text search (FTS5)                                  │
│  • Materialized views (blocked cache)                       │
│  • Ephemeral — rebuilt from JSONL on sync                   │
└────────────────────────────┬────────────────────────────────┘
                             │ sync
┌────────────────────────────▼────────────────────────────────┐
│                         JSONL                               │
│  • Git-tracked, append-only                                 │
│  • Source of truth for all durable data                     │
│  • Human-readable, diff-friendly                            │
│  • Mergeable across branches                                │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** SQLite is the **cache**, JSONL is the **source of truth**.

---

## CLI Reference

The CLI is primarily used by agents internally — human operators mostly use the web dashboard. Full reference: [docs/reference/cli.md](docs/reference/cli.md).

```
sf serve                             Start server + dashboard
sf agent register|start|stop|list    Manage agents
sf daemon start|stop|status          Control dispatch daemon
sf pool create|list|status           Manage agent pools
sf task create|list|ready|close      Manage tasks
sf merge                             Squash-merge branches
sf init                              Initialize workspace
sf doctor                            Check system health
```

---

## Documentation

| Resource                                                 | Description                       |
| -------------------------------------------------------- | --------------------------------- |
| [docs/README.md](docs/README.md)                         | LLM-optimized documentation index |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | Architecture deep-dive            |
| [docs/ORCHESTRATION_PLAN.md](docs/ORCHESTRATION_PLAN.md) | Agent orchestration system        |
| [docs/reference/](docs/reference)                        | API and service reference         |
| [docs/how-to/](docs/how-to)                              | Task-oriented guides              |
| [docs/explanation/](docs/explanation)                    | Conceptual documentation          |
| [docs/gotchas.md](docs/gotchas.md)                       | Common pitfalls and solutions     |

If anything is out-dated, **always up to date** documentation can be found by running:

```bash
# Clone the repo
git clone https://github.com/stoneforge-ai/stoneforge
cd stoneforge

# Init Stoneforge (make sure you've globally installed stoneforge NPM package)
pnpm install && sf init

# Start stoneforge server
sf serve
```

Then go to the Documents page and open the Documentation library. Use the Documentation Directory document to find relevant documentation (similar to [docs/README.md](docs/README.md)).

---

## Development

> **Note:** This section is for development and contributing to Stoneforge — not required for using the packages. To install Stoneforge for normal usage, see [Quick Start](#quick-start).

### Setup

```bash
# Clone the repository
git clone https://github.com/stoneforge-ai/stoneforge.git
cd stoneforge

# Install dependencies (uses pnpm)
pnpm install

# Start the orchestrator (most common)
pnpm dev:smithy

# Start everything (all 4 services)
pnpm dev

# Start just the data platform (quarry only)
pnpm dev:platform
```

### Commands

```bash
pnpm build      # Build all packages
pnpm test       # Run all tests
pnpm lint       # Lint all packages
pnpm typecheck  # Type-check all packages
pnpm clean      # Clean all build artifacts
```

### Using Stoneforge as a Library

To use Stoneforge packages in your own project:

```bash
npm install @stoneforge/core @stoneforge/storage @stoneforge/quarry

# Or install individual packages as needed
npm install @stoneforge/smithy    # Agent orchestration
npm install @stoneforge/ui        # React component library
```

```typescript
import { createQuarryAPI } from "@stoneforge/quarry";
import { createStorage, initializeSchema } from "@stoneforge/storage";

// Create API instance
const storage = createStorage(".stoneforge/stoneforge.db");
initializeSchema(storage);
const api = createQuarryAPI(storage);

// Create a task
const task = await api.create({
  type: "task",
  title: "Implement feature X",
  priority: 2,
  createdBy: entityId,
});

// Query ready work (unblocked, open tasks)
const ready = await api.ready();

// Add a dependency
await api.addDependency({
  blockerId: prerequisiteTask.id,
  blockedId: task.id,
  type: "blocks",
});

// Search documents with FTS5
const results = await api.searchDocumentsFTS("authentication flow", {
  hardCap: 10,
});
```

### Package Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    @stoneforge/smithy                       │
│       Agent orchestration, spawning, sessions, prompts      │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                   @stoneforge/quarry                        │
│        QuarryAPI, services, sync, CLI, identity             │
└────────────────────────────┬────────────────────────────────┘
                             │
          ┌──────────────────┼───────────────────┐
          │                  │                   │
┌─────────▼─────────┐  ┌─────▼───────┐  ┌────────▼─────────┐
│  @stoneforge/core │  │ @stoneforge │  │ @stoneforge/ui   │
│  Types & IDs      │  │  /storage   │  │ React components │
└───────────────────┘  └─────────────┘  └──────────────────┘
```

### Packages

| Package                                               | Description                          | Key Exports                                               |
| ----------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| [`@stoneforge/core`](packages/core)                   | Shared types, errors, ID generation  | `ElementType`, `Task`, `Entity`, `Document`, `ErrorCode`  |
| [`@stoneforge/storage`](packages/storage)             | SQLite backends (Bun, Node, Browser) | `createStorage`, `initializeSchema`, `StorageBackend`     |
| [`@stoneforge/quarry`](packages/quarry)               | Core API, services, sync, CLI        | `QuarryAPI`, `SyncService`, `InboxService`, CLI commands  |
| [`@stoneforge/smithy`](packages/smithy)               | Agent orchestration                  | `OrchestratorAPI`, `SpawnerService`, `SessionManager`     |
| [`@stoneforge/ui`](packages/ui)                       | React 19 component library           | `Button`, `Card`, `TaskCard`, `EntityCard`, charts, hooks |
| [`@stoneforge/shared-routes`](packages/shared-routes) | HTTP route factories                 | `createElementsRoutes`, `createEntityRoutes`, etc.        |

### Applications

| App                                   | Default Port | Description                  |
| ------------------------------------- | ------------ | ---------------------------- |
| [`quarry-server`](apps/quarry-server) | 3456         | Core Stoneforge API server   |
| [`quarry-web`](apps/quarry-web)       | 5173         | Element management dashboard |
| [`smithy-server`](apps/smithy-server) | 3457         | Agent orchestration API      |
| [`smithy-web`](apps/smithy-web)       | 5174         | Agent management dashboard   |

### Monorepo Structure

```
stoneforge/
├── packages/
│   ├── core/              # @stoneforge/core
│   ├── storage/           # @stoneforge/storage
│   ├── quarry/            # @stoneforge/quarry
│   ├── smithy/            # @stoneforge/smithy
│   ├── ui/                # @stoneforge/ui
│   └── shared-routes/     # @stoneforge/shared-routes
├── apps/
│   ├── quarry-server/     # Core API server
│   ├── quarry-web/        # Element dashboard
│   ├── smithy-server/     # Orchestration API
│   └── smithy-web/        # Agent dashboard
├── docs/                  # Documentation
└── .stoneforge/           # Project configuration & workspace
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

All contributors must sign a [Contributor License Agreement (CLA)](https://cla-assistant.io/stoneforge-ai/stoneforge) before their pull request can be merged. The CLA bot will prompt you automatically on your first PR.

---

## License

This project is licensed under the [Apache License 2.0](LICENSE).
