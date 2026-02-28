# SDK Services Reference

Services from `@stoneforge/quarry` (`packages/quarry/src/services/`).

## DependencyService

**File:** `services/dependency.ts`

Manages relationships between elements.

```typescript
import { createDependencyService } from '@stoneforge/quarry';

const depService = createDependencyService(storage);
```

### Methods

```typescript
// Add dependency (automatically checks for cycles on blocking types)
depService.addDependency({
  blockedId,
  blockerId,
  type: 'blocks',
  createdBy: actorId,
  metadata?: { /* gate config */ },
});

// Remove dependency
depService.removeDependency(blockedId, blockerId, type, actorId);

// Check existence
const exists = depService.exists(blockedId, blockerId, type);

// Get single dependency
const dep = depService.getDependency(blockedId, blockerId, type);

// Get outgoing dependencies
const deps = depService.getDependencies(blockedId, type?);

// Get incoming dependencies (what depends on this)
const dependents = depService.getDependents(blockerId, type?);

// Bulk get for multiple sources
const deps = depService.getDependenciesForMany(blockedIds, type?);

// Remove all from/to element
depService.removeAllDependencies(blockedId, type?);
depService.removeAllDependents(blockerId);

// Count without fetching
const count = depService.countDependencies(blockedId, type?);
const depCount = depService.countDependents(blockerId, type?);

// Get bidirectional relates-to dependencies for an element
const related = depService.getRelatedTo(elementId);

// Cycle detection (returns CycleDetectionResult, not boolean)
const result = depService.detectCycle(blockedId, blockerId, type);
// result.hasCycle - whether a cycle was detected
// result.nodesVisited - number of nodes traversed
// result.depthLimitReached - whether depth limit was hit
// result.cyclePath? - path forming the cycle (if found)
```

### Cycle Detection

- BFS traversal from blocked to blocker
- Depth limit: 100 levels
- Only checked for blocking types (`blocks`, `awaits`, `parent-child`)
- Self-referential rejected immediately with `CYCLE_DETECTED`

**Note:** `DependencyService.addDependency()` **automatically** checks for cycles on blocking dependency types (`blocks`, `awaits`, `parent-child`). You can also use `detectCycle()` for manual pre-validation. However, `QuarryAPI.addDependency()` does **not** check for cycles — API callers using `QuarryAPI` must check cycles via `DependencyService.detectCycle()` manually (see [Critical Gotchas](../gotchas.md)).

---

## BlockedCacheService

**File:** `services/blocked-cache.ts`

Materialized view of blocked status. Exported from the main package:

```typescript
import { createBlockedCacheService } from '@stoneforge/quarry';

const blockedCache = createBlockedCacheService(storage);
```

### Query Methods

```typescript
// Check if element is blocked (returns BlockingInfo | null, not boolean)
const blockInfo = blockedCache.isBlocked(elementId);
// blockInfo.elementId - the blocked element
// blockInfo.blockedBy - what's blocking it
// blockInfo.reason - human-readable reason
// blockInfo.previousStatus - status before being blocked

// Get all blocked elements (returns BlockingInfo[])
const allBlocked = blockedCache.getAllBlocked();

// Get elements blocked by a specific element
const blockedBy = blockedCache.getBlockedBy(blockerId);
```

### Event Handlers (call after mutations)

```typescript
blockedCache.onDependencyAdded(blockedId, blockerId, type, metadata?, options?);
blockedCache.onDependencyRemoved(blockedId, blockerId, type, options?);
blockedCache.onStatusChanged(elementId, oldStatus, newStatus, options?);
blockedCache.onElementDeleted(elementId, options?);
```

### Gate Satisfaction

```typescript
// Satisfy external/webhook gate
blockedCache.satisfyGate(blockedId, blockerId, actor, options?);

// Approval gates
blockedCache.recordApproval(blockedId, blockerId, approver, options?);
blockedCache.removeApproval(blockedId, blockerId, approver, options?);
```

### Auto-Transitions

For automatic status changes to/from `blocked`:

```typescript
blockedCache.setStatusTransitionCallback({
  onBlock: (elementId, previousStatus) => {
    // Called when element should transition to blocked status
    // previousStatus is saved for later restoration
    api.update(elementId, { status: 'blocked' });
  },
  onUnblock: (elementId, statusToRestore) => {
    // Called when element should transition from blocked status
    // statusToRestore is the status saved when element was blocked
    api.update(elementId, { status: statusToRestore });
  },
});
```

Events generated: `auto_blocked`, `auto_unblocked` with actor `'system:blocked-cache'`

### Rebuild

```typescript
const result = blockedCache.rebuild(options?);
// Performs full cache rebuild with topological ordering
```

---

## PriorityService

**File:** `services/priority-service.ts`

Calculates effective priority based on dependency graph.

```typescript
import { createPriorityService } from '@stoneforge/quarry';

const priorityService = createPriorityService(storage);
```

### Methods

```typescript
// Single task effective priority (synchronous)
const result = priorityService.calculateEffectivePriority(taskId);
// result.effectivePriority - highest priority from dependents
// result.dependentInfluencers - tasks that influenced the priority
// result.basePriority - the task's own priority
// result.isInfluenced - whether effective differs from base

// Batch calculation (synchronous)
const results = priorityService.calculateEffectivePriorities(taskIds);
// Returns Map<ElementId, EffectivePriorityResult>

// Aggregate complexity (opposite direction!) (synchronous)
const complexity = priorityService.calculateAggregateComplexity(taskId);

// Enhance tasks with effective priority (synchronous)
const enhanced = priorityService.enhanceTasksWithEffectivePriority(tasks);

// Sort by effective priority (requires enhanced tasks, not plain Task[])
priorityService.sortByEffectivePriority(enhanced);  // WARNING: mutates array in place!
```

### Direction Semantics

| Metric | Direction | Description |
|--------|-----------|-------------|
| Effective priority | **Upstream** | Tasks that depend on this task |
| Aggregate complexity | **Downstream** | Tasks this task depends on |

---

## InboxService

**File:** `services/inbox.ts`

Manages entity notification items.

```typescript
import { createInboxService } from '@stoneforge/quarry';

const inboxService = createInboxService(storage);
```

### Methods

```typescript
// Get inbox items
const items = inboxService.getInbox(recipientId, filter?);
const paginated = inboxService.getInboxPaginated(recipientId, filter?);
// paginated.items - array of inbox items
// paginated.total - total count (ignoring limit/offset)

// Get single item by ID
const item = inboxService.getInboxItem(id);  // Returns InboxItem | null

// Get items for a specific channel
const channelItems = inboxService.getInboxByChannel(recipientId, channelId);

// Count
const count = inboxService.getUnreadCount(recipientId);

// Status changes
inboxService.markAsRead(itemId);
inboxService.markAsUnread(itemId);
inboxService.markAllAsRead(recipientId);
inboxService.archive(itemId);

// Batch read
const markedCount = inboxService.markAsReadBatch(itemIds);

// Add item (usually done automatically on message send)
inboxService.addToInbox({
  recipientId,
  messageId,
  channelId,
  sourceType: 'direct' | 'mention' | 'thread_reply',
});

// Delete (for cascade deletion)
inboxService.deleteByMessage(messageId);
inboxService.deleteByRecipient(recipientId);
```

### Filter Options

```typescript
interface InboxFilter {
  status?: InboxStatus | InboxStatus[];
  sourceType?: InboxSourceType | InboxSourceType[];
  channelId?: ChannelId;
  after?: Timestamp;
  before?: Timestamp;
  limit?: number;
  offset?: number;
}
```

**Note:** `readAt` is null if archived without reading. Mark operations are idempotent.

---

## IdLengthCache

**File:** `services/id-length-cache.ts`

Calculates minimum unique ID prefix length.

```typescript
import { createIdLengthCache } from '@stoneforge/quarry';

const idLengthCache = createIdLengthCache(storage, {
  ttlMs: 60000,  // Default: 60 seconds
});
```

### Methods

```typescript
// Get minimum ID hash length for unique prefix
const hashLength = idLengthCache.getHashLength();

// Get cached element count
const count = idLengthCache.getElementCount();

// Force refresh
idLengthCache.refresh();

// Check if stale
const isStale = idLengthCache.isStale();

// Clear cache (forces refresh on next access)
idLengthCache.clear();

// Get cache statistics (hit rate, age, element count, etc.)
const stats = idLengthCache.getStats(); // Returns IdLengthCacheStats

// Notify cache of new element creation (may trigger refresh if growth threshold exceeded)
idLengthCache.notifyCreate();
```

Refreshes automatically on access if stale. Used by CLI for short ID support.

---

## SyncService

**File:** `sync/service.ts`

Manages JSONL export/import.

```typescript
import { createSyncService } from '@stoneforge/quarry';

const syncService = createSyncService(storage);
```

### Export

```typescript
// Incremental export (dirty elements only)
await syncService.export({ outputDir: '/path/to/output' });

// Full export
await syncService.export({ outputDir: '/path/to/output', full: true });

// Export with custom file names
await syncService.export({
  outputDir: '/path/to/output',
  elementsFile: 'elements.jsonl',     // default
  dependenciesFile: 'dependencies.jsonl', // default
  includeEphemeral: false,            // default
});

// Synchronous export (for CLI and testing)
syncService.exportSync({ outputDir: '/path/to/output', full: true });

// Export to string (for API use)
const { elements, dependencies } = syncService.exportToString();
```

### Import

```typescript
// Standard import (merge)
const result = await syncService.import({ inputDir: '/path/to/input' });
// result.elementsImported, result.elementsSkipped, result.conflicts

// Force import (remote always wins)
await syncService.import({ inputDir: '/path/to/input', force: true });

// Dry run (preview changes)
await syncService.import({ inputDir: '/path/to/input', dryRun: true });

// Synchronous import
syncService.importSync({ inputDir: '/path/to/input' });

// Import from strings (for API use)
syncService.importFromStrings(elementsJsonl, dependenciesJsonl, { force: true });
```

### Related Files

| File | Purpose |
|------|---------|
| `sync/serialization.ts` | Element serialization/deserialization |
| `sync/merge.ts` | Merge resolution logic |
| `sync/hash.ts` | Content hash computation |
| `sync/types.ts` | Sync-related types |

### Merge Strategy

- Newer `updatedAt` wins by default
- `closed` and `tombstone` statuses **always win**
- Tags merged as union (cannot remove via sync)
- Content hash excludes timestamps for conflict detection

---

## AutoExportService

**File:** `sync/auto-export.ts`

Interval-based service that polls for dirty elements and automatically triggers incremental JSONL exports. Uses the same polling pattern as EventBroadcaster. Wraps `SyncService` to provide hands-free export — on startup it runs a full export, then periodically checks for dirty elements and exports only what changed.

```typescript
import { createAutoExportService } from '@stoneforge/quarry';

const autoExportService = createAutoExportService({
  syncService,
  backend: storageBackend,
  syncConfig: config.sync,
  outputDir: '/path/to/sync/output',
});
```

### AutoExportOptions

```typescript
interface AutoExportOptions {
  syncService: SyncService;       // SyncService instance for export operations
  backend: StorageBackend;        // Storage backend to check for dirty elements
  syncConfig: SyncConfig;         // Sync configuration (autoExport flag, exportDebounce interval)
  outputDir: string;              // Output directory for JSONL files
}
```

### Lifecycle Methods

```typescript
// Start the auto-export polling loop
// - Runs an initial full export to ensure JSONL files are in sync
// - Begins interval-based polling at syncConfig.exportDebounce interval
// - No-op if syncConfig.autoExport is false
// - No-op if already started
await autoExportService.start();

// Stop the polling loop
// - Clears the interval timer
// - No-op if not running
autoExportService.stop();
```

### Configuration

Auto-export behavior is controlled via `SyncConfig`:

| Field | Default | Description |
|-------|---------|-------------|
| `autoExport` | `true` | Enable/disable auto-export. When `false`, `start()` is a no-op |
| `exportDebounce` | `300000` (5 min) | Polling interval in milliseconds |

### Behavior

- **Initial export:** On `start()`, runs a full export to ensure JSONL files reflect the current database state.
- **Polling:** After the initial export, polls at the configured `exportDebounce` interval.
- **Dirty check:** Each tick calls `backend.getDirtyElements()`. If no dirty elements, the tick is skipped.
- **Incremental export:** When dirty elements exist, triggers an incremental (non-full) `syncService.export()`.
- **Overlap protection:** If a previous export is still in progress, the current tick is skipped to prevent concurrent exports.
- **Error handling:** Export failures are logged but do not stop the polling loop.

### Server Usage

The Quarry server creates and starts AutoExportService during initialization:

```typescript
import { createAutoExportService } from '@stoneforge/quarry';
import { loadConfig } from '@stoneforge/quarry/config';

const config = loadConfig();
const autoExportService = createAutoExportService({
  syncService,
  backend: storageBackend,
  syncConfig: config.sync,
  outputDir: resolve(PROJECT_ROOT, '.stoneforge/sync'),
});

// Start (fire-and-forget)
autoExportService.start().catch((err) => {
  console.error('Failed to start auto-export:', err);
});

// Stop on shutdown
autoExportService.stop();
```

---

## SearchUtils

**File:** `services/search-utils.ts`

Utility functions for FTS5 full-text search.

```typescript
import { escapeFts5Query, applyAdaptiveTopK } from '@stoneforge/quarry/services';
```

### Functions

```typescript
// Escape special FTS5 characters in a query string
const safeQuery = escapeFts5Query(userInput);

// Adaptive top-K selection using elbow detection
// Automatically determines the optimal number of results to return
// based on score distribution (detects the "elbow" where scores drop off)
const topResults = applyAdaptiveTopK(scoredResults, {
  sensitivity?: number,   // Elbow detection sensitivity (default: 1.5)
  maxResults?: number,    // Hard upper limit (default: 50)
  minResults?: number,    // Minimum results to return (default: 1)
});
```

**Elbow detection:** Analyzes the BM25 score distribution to find the natural cutoff point where result relevance drops significantly, avoiding returning low-quality results.

---

## EmbeddingService

**Files:** `services/embeddings/service.ts`, `services/embeddings/types.ts`, `services/embeddings/local-provider.ts`, `services/embeddings/fusion.ts`

Manages document embeddings for semantic search.

```typescript
import { EmbeddingService } from '@stoneforge/quarry/services';
```

### EmbeddingProvider Interface

```typescript
interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly isLocal: boolean;
  isAvailable(): Promise<boolean>;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}
```

### Methods

| Method | Returns | Description |
| --- | --- | --- |
| `isAvailable()` | `Promise<boolean>` | Check if the embedding provider is available |
| `getProviderInfo()` | `{ name, dimensions, isLocal }` | Get provider metadata for diagnostics |
| `indexDocument(docId, content)` | `Promise<void>` | Generate and store embedding for a document |
| `removeDocument(docId)` | `void` | Remove the embedding for a document |
| `searchSemantic(query, limit?)` | `Promise<SemanticSearchResult[]>` | Semantic search via cosine similarity |
| `searchHybrid(query, limit?)` | `Promise<RankedResult[]>` | Combine FTS5 + semantic via reciprocal rank fusion |
| `reindexAll(contentFn)` | `Promise<{ indexed, skipped, failed }>` | Re-embed all documents |

### Auto-Embedding via API Registration

Register an `EmbeddingService` with the API to automatically embed documents on create/update and remove embeddings on delete:

```typescript
api.registerEmbeddingService(embeddingService);
```

Auto-embedding is fire-and-forget (best-effort). Failures are silently ignored to avoid blocking CRUD operations.

**Note:** Auto-embedding only triggers on `api.create()` and `api.update()`. Documents
added via import/sync are not automatically embedded. Use `sf document reindex` or
`api.reindexAllDocumentsFTS()` after import to rebuild the FTS index, then
`sf embeddings reindex` to rebuild embeddings.

### LocalEmbeddingProvider

File: `services/embeddings/local-provider.ts`

Local embedding model provider (768 dimensions). Install via `sf embeddings install`.

### Reciprocal Rank Fusion

File: `services/embeddings/fusion.ts`

Combines FTS5 (BM25) and semantic (embedding) search results using reciprocal rank fusion for hybrid search mode.

---

## Service Integration Pattern

Services are typically created together:

```typescript
import {
  createDependencyService,
  createBlockedCacheService,
  createPriorityService,
  createInboxService,
  createIdLengthCache,
  createSyncService,
  createAutoExportService,
} from '@stoneforge/quarry';

// Create services
const depService = createDependencyService(storage);
const blockedCache = createBlockedCacheService(storage);
const priorityService = createPriorityService(storage);
const inboxService = createInboxService(storage);
const idLengthCache = createIdLengthCache(storage);
const syncService = createSyncService(storage);
const autoExportService = createAutoExportService({
  syncService,
  backend: storage,
  syncConfig: config.sync,
  outputDir: '/path/to/sync/output',
});

// Wire up auto-transitions
blockedCache.setStatusTransitionCallback({
  onBlock: (elementId, previousStatus) => {
    storage.run(
      'UPDATE elements SET data = json_set(data, "$.status", ?) WHERE id = ?',
      ['blocked', elementId]
    );
  },
  onUnblock: (elementId, statusToRestore) => {
    storage.run(
      'UPDATE elements SET data = json_set(data, "$.status", ?) WHERE id = ?',
      [statusToRestore, elementId]
    );
  },
});
```
