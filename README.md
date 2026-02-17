<p align="center">
  <img src="brand/logo.svg" alt="Stoneforge" width="180" height="180">
</p>

<h1 align="center">Stoneforge</h1>

<p align="center">
  <strong>A foundational platform for building multi-agent coordination systems</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &nbsp;&middot;&nbsp;
  <a href="#quick-start">Quick Start</a> &nbsp;&middot;&nbsp;
  <a href="#packages">Packages</a> &nbsp;&middot;&nbsp;
  <a href="#architecture">Architecture</a> &nbsp;&middot;&nbsp;
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License: Apache 2.0">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js: >=18.0.0">
  <img src="https://img.shields.io/badge/bun-supported-orange.svg" alt="Bun: supported">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript: 5.0+">
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React: 19">
</p>

---

## What is Stoneforge?

Stoneforge is a **multi-agent orchestration platform** designed for developers building AI agent systems. It provides a complete foundation for coordinating autonomous agents, including task management, event sourcing, process spawning, and real-time communication.

**Key differentiators:**

- **Event-sourced data layer** with complete audit trail and time-travel reconstruction
- **Dual storage model**: SQLite for fast queries, JSONL for Git-friendly persistence and merge
- **Full orchestration system** for AI agents with automatic dispatch and worktree isolation
- **CLI-first design** with comprehensive command-line interface alongside web dashboards

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Agent Orchestration** | Directors, workers (ephemeral & persistent), and stewards with automatic task dispatch |
| **Event Sourcing** | Complete audit trail for all changes with event history and time-travel |
| **Dual Storage Model** | SQLite cache for speed, JSONL source of truth for Git-friendly sync |
| **Type-Safe Core** | Branded IDs, comprehensive TypeScript types, and strict validation |
| **Dependency Management** | Blocking relationships, gates, parent-child hierarchies, priority propagation |
| **Semantic Search** | FTS5 keyword search + vector embeddings with hybrid ranking (RRF) |
| **Real-time Updates** | WebSocket and SSE streaming for live event feeds |
| **Rich UI Library** | React 19 components with design tokens, charts, and domain-specific cards |
| **Cryptographic Identity** | Ed25519 signing for secure multi-agent authentication |
| **CLI-First** | Full-featured `sf` command for all operations |

---

## Quick Start

### Prerequisites

- **Node.js 18+** or **Bun** (any recent version)

### Installation

```bash
# Clone the repository
git clone https://github.com/stoneforge-ai/stoneforge.git
cd stoneforge

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link the CLI globally (optional)
cd packages/quarry && pnpm link --global
```

### Initialize & Create Your First Task

```bash
# Initialize a workspace
sf init

# Create a task
sf task create --title "Implement user authentication"

# List tasks
sf task list

# View ready tasks (no blockers)
sf task ready

# Update task status
sf update el-abc123 --status in_progress

# Add a dependency
sf dependency add el-task1 blocks el-task2

# View dependency tree
sf dependency tree el-task1

# Export to JSONL for Git sync
sf export
```

---

## Architecture

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

## Packages

| Package | Description | Key Exports |
|---------|-------------|-------------|
| [`@stoneforge/core`](packages/core) | Shared types, errors, ID generation | `ElementType`, `Task`, `Entity`, `Document`, `ErrorCode` |
| [`@stoneforge/storage`](packages/storage) | SQLite backends (Bun, Node, Browser) | `createStorage`, `initializeSchema`, `StorageBackend` |
| [`@stoneforge/quarry`](packages/quarry) | Core API, services, sync, CLI | `QuarryAPI`, `SyncService`, `InboxService`, CLI commands |
| [`@stoneforge/smithy`](packages/smithy) | Agent orchestration | `OrchestratorAPI`, `SpawnerService`, `SessionManager` |
| [`@stoneforge/ui`](packages/ui) | React 19 component library | `Button`, `Card`, `TaskCard`, `EntityCard`, charts, hooks |
| [`@stoneforge/shared-routes`](packages/shared-routes) | HTTP route factories | `createElementsRoutes`, `createEntityRoutes`, etc. |

---

## Applications

| App | Default Port | Description |
|-----|--------------|-------------|
| [`quarry-server`](apps/quarry-server) | 3456 | Core Stoneforge API server |
| [`quarry-web`](apps/quarry-web) | 5173 | Element management dashboard |
| [`smithy-server`](apps/smithy-server) | 3457 | Agent orchestration API |
| [`smithy-web`](apps/smithy-web) | 5174 | Agent management dashboard |

---

## Agent Orchestration

Stoneforge provides a complete agent orchestration system with three agent types:

### Agent Roles

| Role | Session Type | Responsibilities |
|------|--------------|------------------|
| **Director** | Persistent | Creates tasks/plans, sets priorities, coordinates workers |
| **Worker (Ephemeral)** | Task-scoped | Executes assigned task in isolated worktree, shuts down on completion |
| **Worker (Persistent)** | Interactive | Works directly with human, responds in real-time |
| **Steward** | Workflow-scoped | Merge review and branch cleanup, documentation scanning and fixes |

### Dispatch Flow

```
┌──────────┐    creates    ┌──────────────────┐    dispatches    ┌─────────────┐
│ Director │───────────────│  Task (ready)    │─────────────────▶│   Worker    │
└──────────┘    tasks      └──────────────────┘    via daemon    └──────┬──────┘
                                                                        │
                                                              completes or hands off
                                                                        │
                                                                        ▼
                                                               ┌─────────────────┐
                                                               │    Steward      │
                                                               │  (merge review) │
                                                               └─────────────────┘
```

### Worktree Isolation

Workers operate in isolated Git worktrees:
- **Ephemeral workers:** `agent/{worker-name}/{task-id}-{slug}`
- **Persistent workers:** `agent/{worker-name}/session-{timestamp}`

See [Orchestration Architecture](docs/ORCHESTRATION_PLAN.md) for full details.

---

## API Usage

```typescript
import { QuarryAPI } from '@stoneforge/quarry';

// Create API instance
const api = await QuarryAPI.create({ rootDir: '.stoneforge' });

// Create a task
const task = await api.create({
  type: 'task',
  title: 'Implement feature X',
  priority: 2,
  createdBy: entityId,
});

// Query ready work (unblocked, open tasks)
const ready = await api.getReadyWork();

// Add a dependency
await api.addDependency({
  blockerId: prerequisiteTask.id,
  blockedId: task.id,
  type: 'blocks',
});

// Search documents with hybrid ranking
const results = await api.searchDocuments({
  query: 'authentication flow',
  mode: 'hybrid',
  limit: 10,
});
```

---

## CLI Reference

<details>
<summary><strong>Workspace Management</strong></summary>

```bash
sf init              # Initialize workspace
sf doctor            # Check system health
sf migrate           # Run database migrations
sf stats             # Show workspace statistics
```

</details>

<details>
<summary><strong>Element Operations</strong></summary>

```bash
sf task create       # Create a task
sf task list         # List tasks with filtering
sf show <id>         # Show element details
sf update <id>       # Update element fields
sf delete <id>       # Soft-delete an element
```

</details>

<details>
<summary><strong>Task Commands</strong></summary>

```bash
sf task ready             # List ready tasks
sf task blocked           # List blocked tasks with reasons
sf task close <id>        # Close a task
sf task reopen <id>       # Reopen a closed task
sf task assign <id> <ent> # Assign task to entity
sf task defer <id>        # Defer a task
sf task undefer <id>      # Remove deferral
```

</details>

<details>
<summary><strong>Dependency Commands</strong></summary>

```bash
sf dependency add <src> <type> <tgt>    # Add dependency
sf dependency remove <src> <type> <tgt> # Remove dependency
sf dependency list <id>                 # List dependencies
sf dependency tree <id>                 # Show dependency tree
```

</details>

<details>
<summary><strong>Sync Commands</strong></summary>

```bash
sf export            # Export to JSONL
sf import            # Import from JSONL
sf status            # Show sync status
```

</details>

<details>
<summary><strong>Search & Embeddings</strong></summary>

```bash
sf search <query>           # Search elements
sf embeddings index         # Index all documents
sf embeddings reindex       # Rebuild embedding index
```

</details>

See [CLI Reference](docs/reference/cli.md) for complete documentation.

---

## Core Types

| Type | Description | Key Fields |
|------|-------------|------------|
| **Task** | Work item with status, priority, assignments | `status`, `priority`, `assignedTo`, `dueDate` |
| **Entity** | Actor in the system (human or agent) | `name`, `role`, `publicKey` |
| **Document** | Content with versioning | `title`, `content`, `contentType`, `version` |
| **Plan** | Collection of related tasks | `title`, `tasks[]`, `status` |
| **Workflow** | Multi-step process template | `steps[]`, `triggers` |
| **Channel** | Communication channel | `name`, `members[]`, `type` |
| **Message** | Communication in a channel | `content`, `sender`, `channelId` |

---

## Documentation

| Resource | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | LLM-optimized documentation index |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture deep-dive |
| [docs/ORCHESTRATION_PLAN.md](docs/ORCHESTRATION_PLAN.md) | Agent orchestration system |
| [docs/reference/](docs/reference) | API and service reference |
| [docs/how-to/](docs/how-to) | Task-oriented guides |
| [docs/explanation/](docs/explanation) | Conceptual documentation |
| [docs/gotchas.md](docs/gotchas.md) | Common pitfalls and solutions |

---

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/stoneforge-ai/stoneforge.git
cd stoneforge

# Install dependencies (uses pnpm)
pnpm install

# Start all services in development mode
pnpm dev

# Or start just the platform (server + web)
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

For enterprise support and commercial services, contact [sales@stoneforge.ai](mailto:sales@stoneforge.ai).
