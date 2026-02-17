# QuarryAPI Reference

**File:** `packages/quarry/src/api/quarry-api.ts`

The main API for working with Stoneforge elements.

## Initialization

```typescript
import { createQuarryAPI } from '@stoneforge/quarry';
import { createStorage, initializeSchema } from '@stoneforge/storage';

const storage = createStorage('.stoneforge/stoneforge.db');
initializeSchema(storage);
const api = createQuarryAPI(storage);
```

## CRUD Operations

### Create

```typescript
const task = await api.create({
  type: 'task',
  createdBy: entityId,
  title: 'Implement feature',
  priority: 2,
  taskType: 'feature',
});
```

**Required fields:** `type`, `createdBy`

### Read

```typescript
const task = await api.get(taskId);

// With hydration (resolve document references)
const hydratedTask = await api.get(taskId, {
  hydrate: { description: true, content: true }
});
```

**HydrationOptions:**
```typescript
interface HydrationOptions {
  description?: boolean;  // Resolve descriptionRef
  content?: boolean;      // Resolve contentRef
  attachments?: boolean;  // Resolve attachmentRefs
}
```

### Update

```typescript
const updated = await api.update(taskId, {
  status: 'in_progress',
  assigneeId: entityId,
});
```

### Delete

```typescript
await api.delete(taskId);
```

---

## Query Operations

### List with filters

```typescript
const tasks = await api.list({
  type: 'task',
  status: 'open',
  priority: { lte: 2 },       // Comparison operators
  tags: ['urgent'],           // AND logic (all required)
  tagsAny: ['a', 'b'],        // OR logic (any matches)
});
```

**Filter operators:**
- `{ eq: value }` - Equal
- `{ neq: value }` - Not equal
- `{ lt: value }` - Less than
- `{ lte: value }` - Less than or equal
- `{ gt: value }` - Greater than
- `{ gte: value }` - Greater than or equal
- `{ in: [values] }` - In list
- `{ nin: [values] }` - Not in list

### List with pagination

```typescript
const result = await api.listPaginated({
  type: 'task',
  status: 'open',
  limit: 20,
  offset: 0,
});
// result.items, result.total, result.hasMore
```

### Document filtering (category/status)

```typescript
// List documents by category
const specs = await api.list({
  type: 'document',
  category: 'spec',
});

// List with status filter (default is 'active' only)
const archived = await api.list({
  type: 'document',
  status: 'archived',
});

// Paginated with category/status
const result = await api.listPaginated({
  type: 'document',
  category: 'prd',
  status: 'active',
  limit: 20,
});
```

### Search

```typescript
const results = await api.search('keyword', {
  types: ['task', 'document'],
});
```

**Note:** Search has **100 result hard limit**. Searches title, content, and tags only.

### FTS5 Document Search

```typescript
const results = await api.searchDocumentsFTS('search query', {
  category: 'spec',          // Optional category filter
  status: 'active',          // Optional status filter (default: 'active')
  hardCap: 50,               // Max results before adaptive filtering (default: 50)
  elbowSensitivity: 1.5,     // Adaptive top-K sensitivity (default: 1.5)
  minResults: 1,             // Minimum results to return (default: 1)
});
```

Uses FTS5 with BM25 ranking, snippet generation, and adaptive elbow detection for top-K result filtering. Throws `StorageError` if the FTS5 table has not been created (run schema migrations).

**Note:** Search mode (`relevance`, `semantic`, `hybrid`) is a route-level parameter, not an API parameter. The API method always performs FTS5 search. Semantic and hybrid modes are handled at the route/CLI layer via `EmbeddingService`.

### Search channels

```typescript
const channels = await api.searchChannels('channel-name');
```

---

## Task-Specific Operations

### Ready tasks (unblocked, open, not in draft plans)

```typescript
const ready = await api.ready();
const readyIncludingEphemeral = await api.ready({ includeEphemeral: true });
```

**`ready()` excludes:**
- Blocked tasks (via blocked cache)
- Tasks in draft plans (plan status = 'draft')
- Future-scheduled tasks (scheduledFor > now)
- Ephemeral workflow tasks (unless `includeEphemeral: true`)

### Blocked tasks

```typescript
const blocked = await api.blocked();
// Returns tasks with block reasons
```

### Status changes

Use `update()` - there are no dedicated `close()`, `assign()`, or `defer()` methods:

```typescript
await api.update(taskId, { status: 'closed', closeReason: 'Done' });
await api.update(taskId, { assigneeId: entityId });
await api.update(taskId, { status: 'deferred', scheduledFor: '2024-01-15' });
```

---

## Dependency Operations

### Add dependency

```typescript
await api.addDependency({
  blockedId: taskA,
  blockerId: taskB,
  type: 'blocks',
  createdBy: actorId,
});
```

### Remove dependency

```typescript
await api.removeDependency(blockedId, blockerId, 'blocks');
```

### Get dependencies

```typescript
// Outgoing (what this element depends on)
const deps = await api.getDependencies(elementId, types?);

// Incoming (what depends on this element)
const dependents = await api.getDependents(elementId, types?);
```

### Dependency tree

```typescript
const tree = await api.getDependencyTree(elementId);
```

### Gate satisfaction

```typescript
const satisfied = await api.satisfyGate(blockedId, blockerId, actor);
await api.recordApproval(blockedId, blockerId, approverId);
await api.removeApproval(blockedId, blockerId, approverId);
```

---

## Plan Operations

```typescript
await api.addTaskToPlan(taskId, planId, options?);     // taskId first!
await api.removeTaskFromPlan(taskId, planId, actor?);
await api.createTaskInPlan(planId, { title: 'Task', priority: 2 });
const tasks = await api.getTasksInPlan(planId);
const progress = await api.getPlanProgress(planId);

// Bulk operations
await api.bulkClosePlanTasks(planId, { closeReason: 'Done' });
await api.bulkDeferPlanTasks(planId, { filter: { status: 'open' } });
await api.bulkReassignPlanTasks(planId, newAssigneeId);
await api.bulkTagPlanTasks(planId, { addTags: ['tag1'], removeTags: ['tag2'] });
```

**Note:** Bulk operations use `closeReason`, `addTags`/`removeTags` - not `reason`, `add`/`remove`.

---

## Workflow Operations

```typescript
const tasks = await api.getTasksInWorkflow(workflowId);
const ready = await api.getReadyTasksInWorkflow(workflowId);
const ordered = await api.getOrderedTasksInWorkflow(workflowId);  // Topological sort
const progress = await api.getWorkflowProgress(workflowId);
await api.deleteWorkflow(workflowId);  // Hard delete
await api.garbageCollectWorkflows({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 });  // 7 days
```

**Note:** `garbageCollectWorkflows()` uses `maxAgeMs` (milliseconds), not string like `'7d'`.

---

## Channel Operations

```typescript
const { channel, created } = await api.findOrCreateDirectChannel(entityA, entityB, actor);
await api.addChannelMember(channelId, entityId, options?);
await api.removeChannelMember(channelId, entityId, options?);
await api.leaveChannel(channelId, actor);
```

### Send direct message

```typescript
// Content must be a Document - create it first!
const contentDoc = await api.create({
  type: 'document',
  createdBy: senderId,
  content: 'message text',
  contentType: 'text',
});

const result = await api.sendDirectMessage(senderId, {
  recipient: entityB,        // Note: 'recipient' not 'recipientId'
  contentRef: contentDoc.id, // Note: DocumentId, not raw text
});
```

### Merge channels

```typescript
const result = await api.mergeChannels(sourceId, targetId, {
  newName: 'merged-channel',  // Optional: rename target channel
  actor: actorEntityId,       // Optional: entity performing the merge
});
// result.target        — the updated target Channel
// result.sourceArchived — whether the source channel was archived
// result.messagesMoved  — number of messages moved from source to target
```

**Signature:**
```typescript
mergeChannels(
  sourceId: ElementId,
  targetId: ElementId,
  options?: { newName?: string; actor?: EntityId }
): Promise<{ target: Channel; sourceArchived: boolean; messagesMoved: number }>
```

**Parameters:**
- `sourceId` — the source channel to merge from (all messages are moved out of this channel)
- `targetId` — the target channel to merge into (receives messages and members)
- `options.newName` — optional new name for the target channel after the merge
- `options.actor` — the entity performing the merge

**Behavior:** Moves all messages from the source channel to the target channel, merges the member lists of both channels, optionally renames the target channel, and archives the source channel. The entire operation is wrapped in a transaction.

**Constraints:** Both source and target must be group channels. The source channel is archived after the merge completes.

---

## Team Operations

```typescript
await api.addTeamMember(teamId, entityId);
await api.removeTeamMember(teamId, entityId);
const tasks = await api.getTasksForTeam(teamId);
await api.claimTaskFromTeam(taskId, entityId, options?);
const metrics = await api.getTeamMetrics(teamId);
```

---

## Entity Operations

```typescript
const entity = await api.lookupEntityByName('agent-name');
await api.setEntityManager(entityId, managerId, actor);  // actor required
await api.clearEntityManager(entityId, actor);           // actor required
const reports = await api.getDirectReports(managerId);
const chain = await api.getManagementChain(entityId);
const chart = await api.getOrgChart();
```

---

## Document Operations

### Archive / Unarchive

```typescript
// Convenience methods (verify document exists, throw NotFoundError if not)
await api.archiveDocument(docId);
await api.unarchiveDocument(docId);

// Equivalent using update() directly
await api.update(docId, { status: 'archived' });
await api.update(docId, { status: 'active' });
```

Archived documents are excluded from default list and search results.

### Register Embedding Service

```typescript
import { EmbeddingService, LocalEmbeddingProvider } from '@stoneforge/quarry';

const provider = new LocalEmbeddingProvider('/path/to/model');
const embeddingService = new EmbeddingService(storage, { provider });

// Register for auto-embedding on document create/update/delete
api.registerEmbeddingService(embeddingService);
```

Once registered, documents are automatically embedded on create/update and removed on delete (fire-and-forget, best-effort).

### Reindex FTS

```typescript
// Rebuild FTS index for all documents (no version increment)
const result = api.reindexAllDocumentsFTS();
// result.indexed — number of documents indexed
// result.errors — number of documents that failed to index
```

**Note:** Import/sync does not automatically update the FTS index. Call `reindexAllDocumentsFTS()` after importing documents to make them searchable.

### Embedding Service API

The `EmbeddingService` (from `@stoneforge/quarry`) provides semantic search and hybrid search once an embedding provider is registered.

```typescript
// Semantic search (cosine similarity against document embeddings)
const results = await embeddingService.searchSemantic(query, limit);
// results: Array<{ documentId: string, similarity: number }>

// Hybrid search (combines FTS5 BM25 ranking with vector similarity via RRF)
const ftsDocIds = ftsResults.map(r => r.id);
const results = await embeddingService.searchHybrid(query, ftsDocIds, limit);
// results: Array<{ documentId: string, score: number }>

// Reindex all document embeddings (e.g., after import or model change)
const result = await embeddingService.reindexAll(
  documents.map(d => ({ id: d.id, content: d.content })),
  (indexed, total) => console.log(`${indexed}/${total}`)
);
// result: { indexed: number, errors: number }
```

**Embedding lifecycle:**

1. **Create** — document is auto-embedded when created (if service registered)
2. **Update** — re-embedded on content/contentType changes
3. **Delete** — embedding auto-removed
4. **Import** — embeddings are **not** auto-generated; call `reindexAll()` manually after import

### Content Size Limits

Documents have a maximum content size of **10 MB** (`MAX_CONTENT_SIZE = 10 * 1024 * 1024` bytes). Content exceeding this limit will be rejected at creation or update time.

### Document Categories

Documents must use one of the following categories (defaults to `other` if omitted):

| Category | Description |
|----------|-------------|
| `spec` | Technical specifications |
| `prd` | Product requirement documents |
| `decision-log` | Architecture/design decisions |
| `changelog` | Release and change notes |
| `tutorial` | Learning-oriented walkthroughs |
| `how-to` | Goal-oriented instructions |
| `explanation` | Conceptual discussion and context |
| `reference` | Technical reference material |
| `runbook` | Operational procedures |
| `meeting-notes` | Meeting summaries and action items |
| `post-mortem` | Incident/failure analysis |
| `task-description` | *(system-assigned)* Task description documents |
| `message-content` | *(system-assigned)* Message content documents |
| `other` | Default/uncategorized |

---

## History/Timeline

```typescript
const events = await api.getEvents(elementId);
const allEvents = await api.listEvents({ type: 'created' });
const version = await api.getDocumentVersion(docId, versionNum);
const history = await api.getDocumentHistory(docId);
const snapshot = await api.reconstructAtTime(elementId, timestamp);
const timeline = await api.getElementTimeline(elementId);
```

---

## Sync Operations

```typescript
await api.export();                    // Export dirty elements
await api.export({ full: true });      // Full export
await api.import(jsonlPath);
await api.import(jsonlPath, { force: true });  // Remote always wins
```

**Note:** `syncStatus()` is not exposed. Use `sf status` CLI command.

**Note:** Import does not update the FTS5 index or embeddings. After importing documents,
call `api.reindexAllDocumentsFTS()` to rebuild the search index.

---

## System

```typescript
const stats = await api.stats();

// Rebuild blocked cache from scratch
const result = await api.rebuildBlockedCache();
// { elementsChecked: number, elementsBlocked: number, durationMs: number }
```

---

## Common Patterns

### Creating a document with category

```typescript
const spec = await api.create({
  type: 'document',
  createdBy: actorId,
  title: 'API Specification',
  content: '# API Spec\n\n...',
  contentType: 'markdown',
  category: 'spec',      // Defaults to 'other' if omitted
  status: 'active',       // Defaults to 'active' if omitted
});
```

### Creating a task with description

```typescript
// Create description document first
const descDoc = await api.create({
  type: 'document',
  createdBy: actorId,
  title: 'Task Description',
  content: '# Requirements\n\n...',
  contentType: 'markdown',
});

// Create task with description reference
const task = await api.create({
  type: 'task',
  createdBy: actorId,
  title: 'Implement feature',
  descriptionRef: descDoc.id,
  priority: 2,
  taskType: 'feature',
});
```

### Querying with multiple filters

```typescript
const tasks = await api.list({
  type: 'task',
  status: { in: ['open', 'in_progress'] },
  priority: { lte: 2 },
  assigneeId: agentId,
  tags: ['urgent'],
});
```

### Checking if task is blocked

```typescript
const blockedTasks = await api.blocked();
const isBlocked = blockedTasks.some(t => t.id === taskId);

// Or check via BlockedCacheService directly
import { createBlockedCacheService } from '@stoneforge/quarry/services/blocked-cache';
const blockedCache = createBlockedCacheService(storage);
const isBlocked = blockedCache.isBlocked(taskId);
```
