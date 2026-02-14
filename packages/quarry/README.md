<p align="center">
  <img src="https://raw.githubusercontent.com/stoneforge-ai/stoneforge/master/brand/logo.svg" alt="Stoneforge" width="120" height="120">
</p>

# @stoneforge/quarry

Core SDK for Stoneforge — event-sourced element management, dependency tracking, semantic search, JSONL sync, and a full CLI.

[![npm](https://img.shields.io/npm/v/@stoneforge/quarry)](https://www.npmjs.com/package/@stoneforge/quarry)
[![license](https://img.shields.io/npm/l/@stoneforge/quarry)](https://github.com/stoneforge-ai/stoneforge/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@stoneforge/quarry)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

## Overview

`@stoneforge/quarry` is the main programmatic interface to Stoneforge. It wraps `@stoneforge/storage` with an event-sourced domain model — every mutation produces an immutable event, giving you a full audit trail and time-travel reconstruction. It also includes dependency management with priority propagation, hybrid search (FTS5 + vector embeddings), JSONL-based Git-friendly sync, configuration management, and the `sf` CLI.

## Installation

```bash
npm install @stoneforge/quarry
```

## Quick Start

```typescript
import { createQuarryAPI } from '@stoneforge/quarry/api';

const api = await createQuarryAPI({ rootDir: '.stoneforge' });

// Create a task
const task = await api.create({
  type: 'task',
  title: 'Implement user authentication',
  priority: 2,
  createdBy: entityId,
});

// Query ready work (unblocked, open tasks)
const ready = await api.getReadyWork();

// Add a blocking dependency
await api.addDependency({
  blockerId: prerequisiteId,
  blockedId: task.id,
  type: 'blocks',
});

// Search with hybrid ranking (FTS5 + embeddings)
const results = await api.searchDocuments({
  query: 'authentication flow',
  mode: 'hybrid',
  limit: 10,
});
```

## CLI

The package ships the `sf` (and `stoneforge`) CLI:

```bash
sf init                              # Initialize a workspace
sf task create --title "Build API"   # Create a task
sf task list                         # List tasks with filtering
sf task ready                        # Show unblocked tasks
sf task blocked                      # Show blocked tasks with reasons
sf dependency add el-a blocks el-b   # Add a dependency
sf dependency tree el-a              # Visualize dependency tree
sf export                            # Export to JSONL for Git sync
sf import                            # Import from JSONL
sf search "auth flow"                # Hybrid search
sf stats                             # Workspace statistics
sf plan list                         # Manage plans
sf workflow list                     # Manage workflows
sf channel list                      # Manage channels
```

Shell completions are available for bash, zsh, and fish via `sf completion`.

## API

### QuarryAPI Methods

**Element CRUD**
`create` · `get` · `update` · `delete` · `list` · `getByTitle`

**Tasks**
`getReadyWork` · `getBlockedTasks` · `assignTask` · `closeTask` · `reopenTask` · `deferTask`

**Dependencies**
`addDependency` · `removeDependency` · `getDependencies` · `getDependencyTree`

**Search**
`search` · `searchDocuments` · `indexEmbeddings` · `reindexEmbeddings`

**History & Events**
`getHistory` · `getEvents` · `reconstruct`

**Sync**
`exportToJsonl` · `importFromJsonl` · `getSyncStatus`

**Channels & Messages**
`createChannel` · `sendMessage` · `getMessages` · `getChannels`

**Plans & Workflows**
`createPlan` · `getPlans` · `createWorkflow` · `getWorkflows`

**Teams & Identity**
`createTeam` · `getTeams` · `registerEntity`

### Services

| Service | Description |
|---------|-------------|
| `DependencyService` | Blocking relationships, gates, priority propagation |
| `PriorityService` | Priority calculation and inheritance |
| `InboxService` | Per-entity notification inbox |
| `SearchUtils` | FTS5 query building and ranking |
| `IdLengthCache` | Shortest-unique-prefix ID display |

### Sync System

```typescript
import {
  createSyncService,
  serializeElements,
  parseElements,
  mergeElements,
} from '@stoneforge/quarry/sync';

const sync = createSyncService(api);
await sync.export({ outputDir: '.stoneforge/sync' });
await sync.import({ inputDir: '.stoneforge/sync' });
```

### Configuration

```typescript
import { loadConfig, getConfig, setValue } from '@stoneforge/quarry/config';

await loadConfig();
const dbPath = getConfig('database.path');
await setValue('sync.autoExport', true);
```

## Entry Points

| Import | Contents |
|--------|----------|
| `@stoneforge/quarry` | Everything (re-exports all subpaths) |
| `@stoneforge/quarry/api` | `createQuarryAPI`, `QuarryAPI` interface |
| `@stoneforge/quarry/services` | `DependencyService`, `PriorityService`, `InboxService`, etc. |
| `@stoneforge/quarry/sync` | Serialization, merge, `SyncService` |
| `@stoneforge/quarry/cli` | CLI commands, parser, plugin system |
| `@stoneforge/quarry/config` | Configuration loading, validation, env vars |
| `@stoneforge/quarry/http` | `SyncHttpHandlers` for browser sync |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
