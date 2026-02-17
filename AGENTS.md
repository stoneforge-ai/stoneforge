# AGENTS.md

Context and instructions for AI coding agents working on the Stoneforge repository.

## Quick Start

**Start by reading `docs/README.md`** for file paths and navigation tables.

| I need...                  | Go to                                |
| -------------------------- | ------------------------------------ |
| File paths for any concept | `docs/README.md` (File Map tables)   |
| Core type details          | `docs/reference/core-types.md`       |
| API usage                  | `docs/reference/quarry-api.md`    |
| CLI commands               | `docs/reference/cli.md`              |
| Critical pitfalls          | `docs/gotchas.md`                    |
| Architecture overview      | `docs/ARCHITECTURE.md`               |
| Agent orchestration        | `docs/reference/orchestrator-api.md` |

---

## Repository Structure

```
packages/
├── core/              # @stoneforge/core - types, errors, ID generation
├── storage/           # @stoneforge/storage - SQLite backends (Bun, Node, Browser)
├── quarry/            # @stoneforge/quarry - QuarryAPI, services, sync, CLI
├── ui/                # @stoneforge/ui - React components, hooks, design tokens
├── shared-routes/     # @stoneforge/shared-routes - HTTP route factories
└── smithy/            # @stoneforge/smithy - agent orchestration

apps/
├── quarry-server/     # Platform HTTP + WebSocket (port 3456)
├── quarry-web/        # Platform React SPA (port 5173)
├── smithy-server/     # Orchestrator API (port 3457)
└── smithy-web/        # Orchestrator dashboard (port 5174)

docs/                  # Diátaxis documentation (primary reference for agents)
.stoneforge/            # Project data (stoneforge.db, elements.jsonl, config.yaml)
```

### Package Dependency Graph

```
@stoneforge/core        (shared types, no dependencies)
       ↓
@stoneforge/storage     (SQLite backends)
       ↓
@stoneforge/quarry         (API, services, sync, CLI)
       ↓
@stoneforge/smithy  (agent orchestration)
```

---

## Core Concepts

### Element Types

- **Core Types**: Task, Message, Document, Entity
- **Collection Types**: Plan, Workflow, Playbook, Channel, Library, Team
- **All inherit from Element** (id, type, timestamps, tags, metadata, createdBy)

### Dual Storage Model

- **SQLite**: Fast queries, indexes, FTS - the **cache**
- **JSONL**: Git-tracked, append-only - the **source of truth**

### Dependencies

- **Blocking types**: `blocks`, `awaits`, `parent-child` - affect task status
- **Non-blocking**: `relates-to`, `mentions`, `references` - informational only
- `blocked` status is **computed** from dependencies, never set directly

### Agent Roles (Orchestrator)

- **Director**: Owns task backlog, spawns workers, makes strategic decisions
- **Worker**: Executes assigned tasks (ephemeral or persistent)
- **Steward**: Handles code merges, documentation scanning and fixes

---

## Development Workflow

### Build & Test

```bash
bun install           # Install dependencies
bun run build         # Build all packages
bun test              # Run test suite
bun test --watch      # Watch mode
```

### CLI Usage

```bash
sf task ready         # List ready tasks
sf task blocked       # List blocked tasks
sf show <id>          # Show element details
sf task create --title "..." --priority 3 --type feature
sf dependency add --type=blocks <blocked-id> <blocker-id>
sf task close <id> --reason "..."
sf stats              # View progress stats
```

### Running Apps

```bash
bun run --filter @stoneforge/quarry-server dev       # Platform server (port 3456)
bun run --filter @stoneforge/quarry-web dev          # Platform web (port 5173)
bun run --filter @stoneforge/smithy-server dev  # Orchestrator (port 3457)
bun run --filter @stoneforge/smithy-web dev     # Orchestrator UI (port 5174)
```

---

## Critical Gotchas

See `docs/gotchas.md` for the complete list. **Top 10 for agents:**

1. **`blocked` is computed** - Never set `status: 'blocked'` directly; it's derived from dependencies
2. **`blocks` direction** - `sf dependency add --type=blocks A B` means A is blocked BY B (B completes first)
3. **Messages need `contentRef`** - `sendDirectMessage()` requires a `DocumentId`, not raw text
4. **`sortByEffectivePriority()` mutates** - Returns same array reference, modifies in place
5. **SQLite is cache** - JSONL is the source of truth; SQLite can be rebuilt
6. **No auto cycle detection** - `api.addDependency()` doesn't check cycles; use `DependencyService.detectCycle()`
7. **FTS not indexed on import** - After `sf import`, run `sf document reindex` to rebuild search index
8. **`relates-to` is bidirectional** - Query both directions: `getDependencies()` AND `getDependents()`
9. **Closed/tombstone always wins** - In merge conflicts, these statuses take precedence
10. **Server ports** - Platform: 3456, Orchestrator: 3457 (not 3000)

---

## Navigation Quick Reference

| I want to...                   | Key Files                                                           |
| ------------------------------ | ------------------------------------------------------------------- |
| Add a new core type            | `packages/core/src/types/`, `docs/how-to/add-core-type.md`          |
| Add an API endpoint            | `apps/quarry-server/src/index.ts`, `docs/how-to/add-api-endpoint.md`       |
| Add a React component          | `packages/ui/src/components/`, `docs/how-to/add-react-component.md` |
| Work with dependencies         | `packages/quarry/src/services/dependency.ts`                           |
| Understand task status         | `packages/core/src/types/task.ts`                                   |
| Configure identity/signing     | `packages/quarry/src/systems/identity.ts`                              |
| Work with the Orchestrator API | `packages/smithy/src/api/orchestrator-api.ts`             |
| Customize agent prompts        | `.stoneforge/prompts/`, `docs/how-to/customize-agent-prompts.md`     |
| Debug sync issues              | `packages/quarry/src/sync/service.ts`                                  |
| Add a CLI command              | `packages/quarry/src/cli/commands/`                                    |

---

## Implementation Guidelines

### Type Safety

- Use branded types: `ElementId`, `TaskId`, `EntityId`, `DocumentId`
- Implement type guards: `isTask()`, `isElement()`, etc.
- Use `asEntityId()`, `asElementId()` casts only at trust boundaries

### Storage Operations

- All mutations through `QuarryAPI` - never modify SQLite directly
- Dirty tracking marks elements for incremental export
- Content hashing enables merge conflict detection

### Testing

- Tests colocated with source: `*.test.ts` next to `*.ts`
- Integration tests use real SQLite (`:memory:` or temp files)
- Run `bun test <path>` for specific tests

### Error Handling

- Use `StoneforgeError` with appropriate `ErrorCode`
- CLI formats errors based on output mode (standard, verbose, quiet)

---

## Agent Orchestration Overview

The orchestrator manages AI agent lifecycles for multi-agent task execution:

```
Director → creates tasks, assigns priorities → dispatches to Workers
Workers  → execute tasks in git worktrees → update status, handoff
Stewards → merge completed work, documentation scanning and fixes
```

**Key Services:**

- `OrchestratorAPI` - Agent registration and management
- `DispatchService` - Task assignment with inbox notifications
- `SpawnerService` - Process spawning (headless/interactive modes)
- `SessionManager` - Agent session lifecycle tracking

**Prompts:** Built-in prompts in `packages/smithy/src/prompts/`, override with `.stoneforge/prompts/`

---

## Commit Guidelines

- Create commits after completing features, refactors, or significant changes
- Only commit files you changed
- Use conventional commit format: `feat:`, `fix:`, `chore:`, `docs:`
