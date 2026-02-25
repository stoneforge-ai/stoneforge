# Architecture

## Monorepo Structure

```
stoneforge/
├── packages/
│   ├── core/           # @stoneforge/core - shared types, no dependencies
│   ├── storage/        # @stoneforge/storage - SQLite backends
│   ├── quarry/         # @stoneforge/quarry - API, services, sync, CLI
│   ├── ui/             # @stoneforge/ui - React components, hooks, design tokens
│   ├── shared-routes/  # @stoneforge/shared-routes - HTTP route factories
│   └── smithy/         # @stoneforge/smithy - agent orchestration
│
├── apps/
│   ├── quarry-server/  # Hono API server (port 3456)
│   ├── quarry-web/     # React SPA (Vite, port 5173)
│   ├── smithy-server/  # Orchestrator API server (port 3457)
│   ├── smithy-web/     # Orchestrator React SPA (port 5174)
│   ├── docs/           # Documentation site
│   └── website/        # Marketing website
│
└── .stoneforge/         # Project data directory
    ├── stoneforge.db   # SQLite database (cache)
    ├── sync/
    │   ├── elements.jsonl      # JSONL export (source of truth)
    │   └── dependencies.jsonl  # Dependency relationships
    └── config.yaml     # Project configuration
```

## Package Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│                  @stoneforge/smithy            │
│  Agent orchestration, spawning, sessions, prompts       │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                      @stoneforge/quarry                     │
│  QuarryAPI, services, sync, CLI, config, identity    │
└────────────────────────────┬────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│ @stoneforge/   │   │ @stoneforge/   │   │    SQLite     │
│    core       │   │   storage     │   │ (.stoneforge/) │
└───────────────┘   └───────────────┘   └───────────────┘
```

**Import Rules:**
- `core` → no internal dependencies
- `storage` → imports `core`
- `quarry` → imports `core`, `storage`
- `smithy` → imports `core`, `storage`, `quarry`

## Dual Storage Model

```
┌─────────────────────────────────────────────────────────┐
│                       SQLite                            │
│  • Fast queries with indexes                            │
│  • Full-text search                                     │
│  • Materialized views (blocked cache)                   │
│  • Ephemeral - can be rebuilt from JSONL                │
└────────────────────────────┬────────────────────────────┘
                             │ sync
┌────────────────────────────▼────────────────────────────┐
│                       JSONL                             │
│  • Git-tracked, append-only                             │
│  • Source of truth for all durable data                 │
│  • Human-readable, diff-friendly                        │
│  • Mergeable across branches                            │
└─────────────────────────────────────────────────────────┘
```

**Key Principle:** SQLite is the **cache**, JSONL is the **source of truth**.

## Data Flow

### Write Path
```
API call (create/update/delete)
         │
         ▼
   ┌───────────┐
   │  SQLite   │  ← Immediate write
   └─────┬─────┘
         │
         ▼
   ┌───────────┐
   │  Dirty    │  ← Mark element dirty
   │  Tracking │
   └─────┬─────┘
         │
         ▼ (on export)
   ┌───────────┐
   │   JSONL   │  ← Append to file
   └───────────┘
```

### Read Path
```
API call (get/list/query)
         │
         ▼
   ┌───────────┐
   │  SQLite   │  ← Fast indexed query
   └───────────┘
```

### Sync Path
```
   ┌───────────┐      ┌───────────┐
   │  Local    │      │  Remote   │
   │  JSONL    │      │  JSONL    │
   └─────┬─────┘      └─────┬─────┘
         │                  │
         └────────┬─────────┘
                  │ merge
         ┌───────▼───────┐
         │ Merge Logic   │  ← Content hash comparison
         │ (newer wins)  │  ← closed/tombstone always wins
         └───────┬───────┘
                 │
         ┌───────▼───────┐
         │  Import to    │
         │   SQLite      │
         └───────────────┘
```

## Agent Architecture

### Role Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                      Director                           │
│  • Owns task backlog, plans, priorities                 │
│  • Spawns and coordinates workers                       │
│  • Makes strategic decisions                            │
└────────────────────────┬────────────────────────────────┘
                         │ manages
          ┌──────────────┼──────────────┐
          │              │              │
┌─────────▼───┐  ┌───────▼─────┐  ┌────▼──────┐
│   Worker    │  │   Worker    │  │  Steward  │
│ (ephemeral) │  │ (persistent)│  │           │
└─────────────┘  └─────────────┘  └───────────┘
```

### Agent Session Lifecycle

```
┌──────────┐    spawn     ┌──────────┐
│ starting │─────────────→│ running  │
└──────────┘              └────┬─────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
        │ suspended │   │terminating│   │terminated │
        │ (resume)  │   └─────┬─────┘   └───────────┘
        └───────────┘         │
                              ▼
                        ┌───────────┐
                        │terminated │
                        └───────────┘
```

### Agent Communication

```
┌──────────┐                      ┌──────────┐
│ Director │                      │  Worker  │
└────┬─────┘                      └────┬─────┘
     │                                 │
     │  1. Create task                 │
     ▼                                 │
┌──────────┐                           │
│  Task    │                           │
│(assigned)│                           │
└────┬─────┘                           │
     │                                 │
     │  2. Dispatch (DispatchService)  │
     ├────────────────────────────────→│
     │     - Assigns task              │
     │     - Sends notification        │
     │                                 │
     │  3. Worker polls inbox          │
     │     (DispatchDaemon)            │
     │                                 │
     │  4. Worker completes task       │
     │←────────────────────────────────┤
     │     - Updates task status       │
     │     - Sets mergeStatus          │
     │                                 │
     │  5. Steward merges              │
     │     (MergeStewardService)       │
     ▼                                 ▼
```

## Entry Points by Task

| Task | Entry Point |
|------|-------------|
| Create/read/update/delete elements | `packages/quarry/src/api/quarry-api.ts` |
| Work with dependencies | `packages/quarry/src/services/dependency.ts` |
| Check blocked status | `packages/quarry/src/services/blocked-cache.ts` |
| Calculate effective priority | `packages/quarry/src/services/priority-service.ts` |
| Import/export JSONL | `packages/quarry/src/sync/service.ts` |
| Register agents | `packages/smithy/src/api/orchestrator-api.ts` |
| Spawn agent processes | `packages/smithy/src/runtime/spawner.ts` |
| Manage agent sessions | `packages/smithy/src/runtime/session-manager.ts` |
| Assign tasks to agents | `packages/smithy/src/services/task-assignment-service.ts` |
| Dispatch tasks with notification | `packages/smithy/src/services/dispatch-service.ts` |
| Load role prompts | `packages/smithy/src/prompts/index.ts` |
| Configure identity | `packages/quarry/src/systems/identity.ts` |
| Load configuration | `packages/quarry/src/config/config.ts` |

### Orchestrator Server Entry Points

| Task | Entry Point |
|------|-------------|
| Server startup | `apps/smithy-server/src/index.ts` |
| Configuration (ports, CORS) | `apps/smithy-server/src/config.ts` |
| Service initialization | `apps/smithy-server/src/services.ts` |
| Cross-runtime server (Bun/Node) | `apps/smithy-server/src/server.ts` |
| Terminal WebSocket handling | `apps/smithy-server/src/websocket.ts` |
| Event-subscription WebSocket | `apps/smithy-server/src/events-websocket.ts` |
| Task API endpoints | `apps/smithy-server/src/routes/tasks.ts` |
| Agent API endpoints | `apps/smithy-server/src/routes/agents.ts` |
| Session API endpoints | `apps/smithy-server/src/routes/sessions.ts` |
| Scheduler API endpoints | `apps/smithy-server/src/routes/scheduler.ts` |
| Plugin API endpoints | `apps/smithy-server/src/routes/plugins.ts` |
| Event/Activity endpoints | `apps/smithy-server/src/routes/events.ts` |
| Worktree endpoints | `apps/smithy-server/src/routes/worktrees.ts` |

## Module Boundaries

### @stoneforge/core
- **Exports:** Types, interfaces, type guards, factory functions, errors
- **No runtime dependencies:** Pure type definitions and utilities
- **No I/O:** No database, file system, or network access

### @stoneforge/storage
- **Exports:** `StorageBackend` interface, backend implementations, schema
- **Backend implementations:** Bun (native), Node.js (better-sqlite3), Browser (WASM)
- **Responsibilities:** SQL execution, transactions, migrations, dirty tracking

### @stoneforge/quarry
- **Exports:** `QuarryAPI`, services, sync utilities, CLI, config, identity
- **Responsibilities:** Business logic, CRUD operations, sync, CLI interface
- **Services:** Dependency, Priority, BlockedCache, Inbox, IdLengthCache

### @stoneforge/smithy
- **Exports:** `OrchestratorAPI`, agent services, runtime, prompts
- **Responsibilities:** Agent lifecycle, task assignment, process spawning
- **Services:** AgentRegistry, RoleDefinition, Dispatch, Assignment
- **Runtime:** Spawner, SessionManager, Handoff, PredecessorQuery, MessageMapper

## Configuration Precedence

```
1. CLI flags (--actor, --db)     ← Highest priority
         │
         ▼
2. Environment variables (STONEFORGE_*)
         │
         ▼
3. Config file (.stoneforge/config.yaml)
         │
         ▼
4. Built-in defaults             ← Lowest priority
```

## Identity Modes

| Mode | Verification | Use Case |
|------|--------------|----------|
| `soft` | None (name-based) | Development, single-agent |
| `cryptographic` | Ed25519 signatures | Production, multi-agent |
| `hybrid` | Optional signatures | Migration, mixed environments |

## Document & Search Architecture

### Storage Layers

Documents use three storage layers:

```
┌─────────────────────────────────────────────────────────┐
│                  elements table                          │
│  Primary storage for all document data (SQLite)          │
│  Columns: id, type, data (JSON), created_at, updated_at │
└────────────────────────────┬────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                                       │
┌────────▼─────────┐                  ┌──────────▼────────┐
│  documents_fts   │                  │ document_embeddings│
│  FTS5 virtual    │                  │ Vector storage     │
│  table (BM25)    │                  │ (cosine similarity)│
└──────────────────┘                  └───────────────────┘
```

- **elements table** — source of truth for document content, metadata, tags, category, status
- **documents_fts** — FTS5 virtual table indexing title, content, tags, category for keyword search
- **document_embeddings** — vector embeddings for semantic similarity search

### Version Control Model

Documents track versions with a `version` field starting at 1. Version increments occur **only when `content` or `contentType` is changed** — updates to tags, metadata, status, or other fields do not create new versions.

On a content update:
1. Current document state is saved to the version history table
2. `version` is incremented
3. `previousVersionId` links to the prior version

### Document Lifecycle

```
┌────────┐  archive   ┌──────────┐
│ active │───────────→│ archived │
│        │←───────────│          │
└────────┘  unarchive └──────────┘
```

- **active** — default status; included in list/search results
- **archived** — excluded from default queries; retrievable by explicit ID or status filter
- Archiving emits a `CLOSED` lifecycle event; unarchiving emits `REOPENED`

### Search Modes

| Mode | Engine | Ranking | Requires Embeddings |
|------|--------|---------|---------------------|
| `relevance` | FTS5 | BM25 (term frequency / inverse document frequency) | No |
| `semantic` | Vector | Cosine similarity against query embedding | Yes |
| `hybrid` | FTS5 + Vector | Reciprocal Rank Fusion (RRF) combining BM25 and cosine | Yes |

**FTS5** uses SQLite's built-in full-text search with BM25 ranking. An elbow-detection algorithm filters low-relevance results.

**Semantic** search embeds the query and computes cosine similarity against all stored document embeddings.

**Hybrid** search runs both FTS5 and semantic pipelines, then merges results using Reciprocal Rank Fusion (RRF).

### Index Maintenance

- **Create/Update/Delete** — FTS and embedding indexes are updated automatically (best-effort, fire-and-forget)
- **Import** — indexes are **not** updated; call `reindexAllDocumentsFTS()` and `embeddingService.reindexAll()` after import
- **Reindex** — `reindexAllDocumentsFTS()` rebuilds the FTS5 table without creating version history entries

### Key Files

| File | Responsibility |
|------|----------------|
| `packages/quarry/src/api/quarry-api.ts` | Document CRUD, FTS search, FTS indexing, version control |
| `packages/quarry/src/services/embeddings/service.ts` | Embedding indexing, semantic search, hybrid search, reindex |
| `packages/core/src/types/document.ts` | Document types, categories, status, content constraints |
| `packages/shared-routes/src/documents.ts` | HTTP route handlers for document search API |
| `packages/storage/src/schema.ts` | SQLite schema including FTS5 and embeddings tables |
