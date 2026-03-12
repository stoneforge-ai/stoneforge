# AGENTS.md

Context and instructions for AI coding agents working on the Stoneforge repository.

## How to Find Documentation

1. **This file** — Quick task-to-file mappings below
2. **Documentation Directory** — Full index of all workspace docs: `sf show el-30yb`
3. **Category Index** — Browse by category: `sf show el-og6v`
4. **Full-text search** — Find any doc by topic: `sf document search "your topic"`

---

## Quick Start

### Backend Tasks

| I need... | Key Files | Reference Doc |
|-----------|-----------|---------------|
| Add an API endpoint | `apps/quarry-server/src/index.ts`, `apps/smithy-server/src/routes/` | `sf show el-5z1q` |
| Add a core type | `packages/core/src/types/` | `sf show el-6c3s` |
| Work with dependencies | `packages/quarry/src/services/dependency.ts` | `sf show el-200z` |
| Add an orchestrator service | `packages/smithy/src/services/` | `sf show el-50ia` |
| Use the CLI | `packages/quarry/src/cli/commands/` | `sf show el-59tr` |
| Use the QuarryAPI | `packages/quarry/src/api/quarry-api.ts` | `sf show el-kflh` |
| Use the OrchestratorAPI | `packages/smithy/src/api/orchestrator-api.ts` | `sf show el-3qg2` |
| Customize agent prompts | `.stoneforge/prompts/` | `sf show el-32rb` |
| Configure identity | `packages/quarry/src/systems/identity.ts` | `sf show el-2jw5` |
| Understand event sourcing | `packages/core/src/types/event.ts` | `sf show el-58k3` |
| Configure the system | `packages/quarry/src/config/` | `sf show el-z1sj` |

### Frontend Tasks

| I need... | Key Files | Reference Doc |
|-----------|-----------|---------------|
| Modify a smithy-web page | `apps/smithy-web/src/routes/{page}/` | `sf show el-4b3q` |
| Modify a quarry-web page | `apps/quarry-web/src/routes/{page}/` | `sf show el-4iiz` |
| Add a new frontend route | `apps/{app}/src/router.tsx` | `sf show el-232d` |
| Modify shared UI components | `packages/ui/src/` | `sf show el-2hk5` |
| Add a React component | `apps/{app}/src/components/` | `sf show el-3gg7` |
| Work with API hooks (smithy) | `apps/smithy-web/src/api/hooks/` | `sf show el-4b3q` |
| Work with API hooks (quarry) | `apps/quarry-web/src/api/hooks/` | `sf show el-4iiz` |
| Understand frontend architecture | — | `sf show el-935d` |

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

See `sf show el-49ra` for the complete list. **Top 10 for agents:**

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

| I want to... | Key Files |
|--------------|-----------|
| Add a new core type | `packages/core/src/types/` |
| Add an API endpoint | `apps/quarry-server/src/index.ts` |
| Add a React component | `packages/ui/src/components/` |
| Work with dependencies | `packages/quarry/src/services/dependency.ts` |
| Understand task status | `packages/core/src/types/task.ts` |
| Configure identity/signing | `packages/quarry/src/systems/identity.ts` |
| Work with the Orchestrator API | `packages/smithy/src/api/orchestrator-api.ts` |
| Customize agent prompts | `.stoneforge/prompts/` |
| Debug sync issues | `packages/quarry/src/sync/service.ts` |
| Add a CLI command | `packages/quarry/src/cli/commands/` |
| Modify the Activity page | `apps/smithy-web/src/routes/activity/`, `apps/smithy-web/src/components/activity/` |
| Modify the Agents page | `apps/smithy-web/src/routes/agents/`, `apps/smithy-web/src/components/agent/` |
| Modify the Tasks page (smithy) | `apps/smithy-web/src/routes/tasks/`, `apps/smithy-web/src/components/task/` |
| Modify the Dashboard (quarry) | `apps/quarry-web/src/routes/dashboard/` |
| Modify the Entity page | `apps/quarry-web/src/routes/entities/` |
| Modify the Dependency Graph | `apps/quarry-web/src/routes/dependency-graph/` |
| Modify the Workspaces page | `apps/smithy-web/src/routes/workspaces/`, `apps/smithy-web/src/components/workspace/`, `apps/smithy-web/src/components/terminal/` |
| Modify the Editor | `apps/smithy-web/src/routes/editor/`, `apps/smithy-web/src/components/editor/` |
| Modify the Messages page | `apps/smithy-web/src/routes/messages/` or `apps/quarry-web/src/routes/messages/` |
| Modify the Documents page | `apps/smithy-web/src/routes/documents/` or `apps/quarry-web/src/routes/documents/` |
| Modify the Merge Requests page | `apps/smithy-web/src/routes/merge-requests/`, `apps/smithy-web/src/components/merge-request/` |
| Modify the Plans page | `apps/smithy-web/src/routes/plans/` or `apps/quarry-web/src/routes/plans/` |
| Modify the Workflows page | `apps/smithy-web/src/routes/workflows/` or `apps/quarry-web/src/routes/workflows/` |
| Modify the Settings page | `apps/smithy-web/src/routes/settings/` or `apps/quarry-web/src/routes/settings/` |
| Modify the Metrics page | `apps/smithy-web/src/routes/metrics/` |

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
- See `sf show el-50x1` for test runner conventions (Bun vs Vitest)

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

## Keeping Docs Updated

When your changes affect documented behavior (APIs, config, workflows, architecture):

1. **Search** for relevant docs: `sf document search "topic"`
2. **Update** existing workspace documents: `sf document update <doc-id> --content "..."`
3. **Create** new docs for undocumented knowledge: `sf document create --title "..." --content "..." --category reference --type markdown`
4. **Update the Documentation Directory** (`sf show el-30yb`) when you create or significantly modify documents
5. **Add to the Documentation library** (`sf docs add <doc-id>`) so the document is discoverable

---

## Commit Guidelines

- Create commits after completing features, refactors, or significant changes
- Only commit files you changed
- Use conventional commit format: `feat:`, `fix:`, `chore:`, `docs:`
