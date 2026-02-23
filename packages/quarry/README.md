<p align="center">
  <img src="https://raw.githubusercontent.com/stoneforge-ai/stoneforge/master/brand/logo.svg" alt="Stoneforge" width="120" height="120">
</p>

# @stoneforge/quarry

Core SDK for Stoneforge — event-sourced element management, dependency tracking, full-text search, JSONL sync, and the `sf` CLI.

[![npm](https://img.shields.io/npm/v/@stoneforge/quarry)](https://www.npmjs.com/package/@stoneforge/quarry)
[![license](https://img.shields.io/npm/l/@stoneforge/quarry)](https://github.com/stoneforge-ai/stoneforge/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/@stoneforge/quarry)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

## Overview

`@stoneforge/quarry` is the main programmatic interface to Stoneforge. It wraps `@stoneforge/storage` with an event-sourced domain model — every mutation produces an immutable event, giving you a full audit trail and point-in-time reconstruction. It includes dependency management with cycle detection, FTS5 full-text search, JSONL-based Git-friendly sync, configuration management, and the `sf` CLI.

## Installation

```bash
npm install @stoneforge/quarry
```

## Quick Start

```typescript
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '@stoneforge/quarry/api';
import type { Task } from '@stoneforge/core';

// Create a StorageBackend (auto-detects Bun/Node runtime)
const storage = createStorage({ path: '.stoneforge/db.sqlite' });
initializeSchema(storage);

// Create the API
const api = createQuarryAPI(storage);

// Create a task
const task = await api.create<Task>({
  type: 'task',
  title: 'Implement user authentication',
  priority: 2,
  createdBy: 'el-0000',
});

// Query ready work (open, unblocked tasks)
const readyTasks = await api.ready();

// Query blocked tasks with reasons
const blockedTasks = await api.blocked();

// Add a blocking dependency
await api.addDependency({
  blockerId: prerequisiteId,
  blockedId: task.id,
  type: 'blocks',
});

// Full-text search across elements
const results = await api.search('authentication flow');

// FTS5 search on documents with BM25 ranking
const docs = await api.searchDocumentsFTS('authentication flow', {
  category: ['reference'],
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
sf dependency add el-a el-b --type blocks  # Add a dependency
sf dependency tree el-a              # Visualize dependency tree
sf export                            # Export to JSONL for Git sync
sf import                            # Import from JSONL
sf document search "auth flow"       # Full-text search
sf stats                             # Workspace statistics
sf plan list                         # Manage plans
sf workflow list                     # Manage workflows
sf channel list                      # Manage channels
```

Shell completions are available for bash, zsh, and fish via `sf completion`.

## API

### `createQuarryAPI(backend: StorageBackend): QuarryAPI`

Creates a QuarryAPI instance. Requires a `StorageBackend` from `@stoneforge/storage`.

### CRUD Operations

| Method | Signature |
|--------|-----------|
| `get` | `get<T>(id: ElementId, options?: GetOptions): Promise<T \| null>` |
| `list` | `list<T>(filter?: ElementFilter): Promise<T[]>` |
| `listPaginated` | `listPaginated<T>(filter?: ElementFilter): Promise<ListResult<T>>` |
| `create` | `create<T>(input: ElementInput & Record<string, unknown>): Promise<T>` |
| `update` | `update<T>(id: ElementId, updates: Partial<T>, options?: UpdateOptions): Promise<T>` |
| `delete` | `delete(id: ElementId, options?: DeleteOptions): Promise<void>` |

### Task Queries

| Method | Description |
|--------|-------------|
| `ready(filter?)` | Open/in-progress tasks that are not blocked or scheduled for the future |
| `backlog(filter?)` | Tasks not ready for work (needs triage) |
| `blocked(filter?)` | Blocked tasks with `blockedBy` and `blockReason` details |

### Dependencies

| Method | Description |
|--------|-------------|
| `addDependency(dep)` | Create a dependency |
| `removeDependency(blockedId, blockerId, type, actor?)` | Remove a dependency |
| `getDependencies(id, types?)` | Get outgoing dependencies |
| `getDependents(id, types?)` | Get incoming dependencies |
| `getDependencyTree(id)` | Full dependency graph in both directions |

### Gate Satisfaction

| Method | Description |
|--------|-------------|
| `satisfyGate(blockedId, blockerId, actor)` | Mark an external/webhook gate as satisfied |
| `recordApproval(blockedId, blockerId, approver)` | Record an approval on an approval gate |
| `removeApproval(blockedId, blockerId, approver)` | Remove an approval from a gate |

### Search & Documents

| Method | Description |
|--------|-------------|
| `search(query, filter?)` | Full-text search across all element titles, content, and tags |
| `searchDocumentsFTS(query, options?)` | FTS5 BM25-ranked document search with snippets and adaptive top-K |
| `archiveDocument(id)` | Archive a document (set status to `'archived'`) |
| `unarchiveDocument(id)` | Unarchive a document (set status back to `'active'`) |
| `registerEmbeddingService(service)` | Register an embedding service for auto-indexing on create/update/delete |
| `reindexAllDocumentsFTS()` | Rebuild the FTS index for all documents |

### History & Events

| Method | Description |
|--------|-------------|
| `getEvents(id, filter?)` | Audit events for a single element |
| `listEvents(filter?)` | List events across all elements |
| `countEvents(filter?)` | Count events matching a filter |
| `getDocumentVersion(id, version)` | Retrieve a specific document version |
| `getDocumentHistory(id)` | Full version history of a document |
| `reconstructAtTime(id, asOf)` | Reconstruct element state at a point in time |
| `getElementTimeline(id, filter?)` | Complete timeline of state changes |

### Plans

| Method | Description |
|--------|-------------|
| `addTaskToPlan(taskId, planId, options?)` | Associate a task with a plan |
| `removeTaskFromPlan(taskId, planId, actor?)` | Remove a task from a plan |
| `getTasksInPlan(planId, filter?)` | List tasks in a plan |
| `getPlanProgress(planId)` | Completion metrics for a plan |
| `createTaskInPlan(planId, taskInput, options?)` | Create a task with a hierarchical ID inside a plan |
| `bulkClosePlanTasks(planId, options?)` | Close all tasks in a plan |
| `bulkDeferPlanTasks(planId, options?)` | Defer all tasks in a plan |
| `bulkReassignPlanTasks(planId, newAssignee, options?)` | Reassign all tasks in a plan |
| `bulkTagPlanTasks(planId, options)` | Add/remove tags on all tasks in a plan |

### Channels & Messages

| Method | Description |
|--------|-------------|
| `findOrCreateDirectChannel(entityA, entityB, actor)` | Get or create a direct channel between two entities |
| `addChannelMember(channelId, entityId, options?)` | Add a member to a group channel |
| `removeChannelMember(channelId, entityId, options?)` | Remove a member from a group channel |
| `leaveChannel(channelId, actor)` | Leave a group channel |
| `searchChannels(query, filter?)` | Search channels by name with optional filtering |
| `mergeChannels(sourceId, targetId, options?)` | Merge two group channels |

### Teams

| Method | Description |
|--------|-------------|
| `addTeamMember(teamId, entityId, options?)` | Add a member to a team |
| `removeTeamMember(teamId, entityId, options?)` | Remove a member from a team |
| `getTasksForTeam(teamId, options?)` | Tasks assigned to a team or its members |
| `claimTaskFromTeam(taskId, entityId, options?)` | Claim a team-assigned task for yourself |
| `getTeamMetrics(teamId)` | Aggregated metrics (completion rate, cycle time) |

### Entity Management

| Method | Description |
|--------|-------------|
| `lookupEntityByName(name)` | Look up an entity by name |
| `setEntityManager(entityId, managerId, actor)` | Set an entity's manager |
| `clearEntityManager(entityId, actor)` | Clear an entity's manager |
| `getDirectReports(managerId)` | Get entities reporting to a manager |
| `getManagementChain(entityId)` | Get the chain from entity up to root |

### Workflows

| Method | Description |
|--------|-------------|
| `getTasksInWorkflow(workflowId, filter?)` | List tasks in a workflow |
| `getReadyTasksInWorkflow(workflowId, filter?)` | Ready tasks in a workflow |
| `getOrderedTasksInWorkflow(workflowId, filter?)` | Tasks in topological (execution) order |
| `getWorkflowProgress(workflowId)` | Progress metrics for a workflow |
| `deleteWorkflow(workflowId, options?)` | Hard-delete a workflow and all its tasks |
| `garbageCollectWorkflows(options)` | GC ephemeral workflows past their max age |
| `garbageCollectTasks(options)` | GC standalone ephemeral tasks past their max age |

### Sync & Export

| Method | Description |
|--------|-------------|
| `export(options?)` | Export elements to JSONL format |
| `import(options)` | Import elements from JSONL format |
| `stats()` | System-wide statistics (element counts, DB size, etc.) |

### Services

| Service | Import | Description |
|---------|--------|-------------|
| `DependencyService` | `@stoneforge/quarry/services` | Blocking relationships, gates, cycle detection |
| `PriorityService` | `@stoneforge/quarry/services` | Priority calculation and inheritance |
| `InboxService` | `@stoneforge/quarry/services` | Per-entity notification inbox |
| `IdLengthCache` | `@stoneforge/quarry/services` | Shortest-unique-prefix ID display |
| `BlockedCacheService` | `@stoneforge/quarry` | Cached blocked-task lookups |

### Sync System

```typescript
import { createSyncService } from '@stoneforge/quarry/sync';
import { createStorage, initializeSchema } from '@stoneforge/storage';

const storage = createStorage({ path: '.stoneforge/db.sqlite' });
initializeSchema(storage);

const sync = createSyncService(storage);

// Export to JSONL directory
await sync.export({ outputDir: '.stoneforge/sync' });

// Import from JSONL directory
await sync.import({ inputDir: '.stoneforge/sync' });
```

Lower-level utilities are also available:

```typescript
import {
  serializeElements,
  parseElements,
  mergeElements,
  computeContentHash,
} from '@stoneforge/quarry/sync';
```

### Configuration

```typescript
import {
  loadConfig,
  getValue,
  setValue,
  getDefaultConfig,
} from '@stoneforge/quarry/config';

// Load configuration (file + env vars + defaults)
const config = loadConfig();

// Read a value
const actor = getValue('actor');

// Set a value
setValue('sync.autoExport', true);
```

## Entry Points

| Import | Contents |
|--------|----------|
| `@stoneforge/quarry` | Re-exports API, services, sync, config, http, and server modules |
| `@stoneforge/quarry/api` | `createQuarryAPI`, `QuarryAPI` interface, filter/option types |
| `@stoneforge/quarry/services` | `DependencyService`, `PriorityService`, `InboxService`, `IdLengthCache` |
| `@stoneforge/quarry/sync` | `SyncService`, `createSyncService`, serialization, merge, hashing utilities |
| `@stoneforge/quarry/cli` | CLI commands, parser, plugin system |
| `@stoneforge/quarry/config` | `loadConfig`, `getValue`, `setValue`, validation, env var support |
| `@stoneforge/quarry/http` | `SyncHttpHandlers` for browser sync |
| `@stoneforge/quarry/server` | Server module |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
