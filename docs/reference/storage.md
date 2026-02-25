# Storage Reference

**Package:** `@stoneforge/storage` (`packages/storage/src/`)

SQLite storage layer with multiple backend implementations.

## Overview

```
┌─────────────────────────────────────────────────┐
│                    SQLite                        │
│  Fast queries, indexes, full-text search        │
│            (cache, ephemeral)                   │
└─────────────────────────────────────────────────┘
                      ↕ sync
┌─────────────────────────────────────────────────┐
│                    JSONL                         │
│   Git-tracked, append-only, mergeable           │
│           (source of truth)                     │
└─────────────────────────────────────────────────┘
```

**Key Principle:** SQLite is the **cache**, JSONL is the **source of truth**.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Type exports |
| `backend.ts` | StorageBackend interface |
| `create-backend.ts` | Factory: `createStorage()`, `createStorageAsync()` |
| `bun-backend.ts` | Bun native implementation |
| `node-backend.ts` | Node.js (better-sqlite3) implementation |
| `browser-backend.ts` | Browser (WASM + OPFS) implementation |
| `schema.ts` | SQLite schema and migrations |
| `types.ts` | Transaction, QueryResult, PreparedStatement |
| `errors.ts` | `mapStorageError()`, constraint detection |

## Creating Storage

```typescript
import { createStorage, initializeSchema } from '@stoneforge/storage';

// Auto-detects runtime (Bun, Node, Browser)
const storage = createStorage({ path: './project/.stoneforge/stoneforge.db' });

// Initialize schema
initializeSchema(storage);

// Async variant (for browser WASM)
const storage = await createStorageAsync({ path: './stoneforge.db' });
```

## StorageBackend Interface

**All methods are synchronous** (not async/Promise).

```typescript
interface StorageBackend {
  // Connection
  readonly isOpen: boolean;
  readonly path: string;
  readonly inTransaction: boolean;
  close(): void;

  // SQL Execution
  exec(sql: string): void;
  query<T>(sql: string, params?: unknown[]): T[];
  queryOne<T>(sql: string, params?: unknown[]): T | undefined;
  run(sql: string, params?: unknown[]): MutationResult;
  prepare<T>(sql: string): PreparedStatement<T>;

  // Transactions
  transaction<T>(fn: (tx: Transaction) => T, options?: TransactionOptions): T;

  // Schema
  getSchemaVersion(): number;
  setSchemaVersion(version: number): void;
  migrate(migrations: Migration[]): MigrationResult;

  // Dirty Tracking
  markDirty(elementId: string): void;
  getDirtyElements(options?: DirtyTrackingOptions): DirtyElement[];
  clearDirty(): void;
  clearDirtyElements(elementIds: string[]): void;

  // Hierarchical IDs
  getNextChildNumber(parentId: string): number;
  getChildCounter(parentId: string): number;
  resetChildCounter(parentId: string): void;
  getElementCount(): number;

  // Utilities
  checkIntegrity(): boolean;
  optimize(): void;  // VACUUM + ANALYZE
  getStats(): StorageStats;
}
```

## Dirty Tracking

Elements modified since last export are marked "dirty":

```typescript
storage.markDirty(elementId);
const dirty = storage.getDirtyElements();
// Returns: { elementId: string, markedAt: string }[]

storage.clearDirtyElements(elementIds);  // Clear specific
storage.clearDirty();                     // Clear all
```

**Note:** `getDirtyElements()` returns `DirtyElement` records, not full Element objects.

## Transactions

```typescript
const result = storage.transaction((tx) => {
  tx.run('INSERT INTO elements ...');
  tx.run('INSERT INTO dependencies ...');
  return 'success';
}, {
  isolation: 'immediate',  // 'deferred' | 'immediate' | 'exclusive'
});
```

## Database Location

Default: `.stoneforge/` directory in project root

```
.stoneforge/
├── stoneforge.db   # SQLite database
├── sync/
│   ├── elements.jsonl      # JSONL export (source of truth)
│   └── dependencies.jsonl  # Dependency relationships
└── config.yaml     # Project configuration
```

## Schema

Current version: 10

### Key Tables

| Table | Purpose |
|-------|---------|
| `elements` | All elements with JSON data column |
| `dependencies` | Relationship records |
| `dirty_elements` | Dirty tracking (auto-created in constructor) |
| `blocked_cache` | Materialized blocked status |
| `child_counters` | Hierarchical ID counters |
| `document_versions` | Version history for documents |
| `tags` | Tag index for fast filtering |
| `events` | System events for audit/history |
| `inbox_items` | Notification items per entity |
| `comments` | Inline document comments with text anchoring (migration 5) |
| `session_messages` | Persistent session event storage for agent sessions (migration 6) |
| `documents_fts` | FTS5 virtual table for full-text document search (migration 7) |
| `document_embeddings` | Vector embeddings for semantic document search (migration 8) |
| `settings` | Server-side key-value configuration store (migration 9) |
| `operation_log` | Structured operation logs for dispatch, merge, session, rate-limit, steward, recovery events (migration 10) |
| `provider_metrics` | Per-request LLM provider metrics including token counts, latency, and outcome (migration 10) |

### Elements Table

```sql
CREATE TABLE elements (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON blob
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (type IN ('task', 'message', 'document', 'entity',
                  'plan', 'workflow', 'playbook',
                  'channel', 'library', 'team'))
);
```

### Dependencies Table

```sql
CREATE TABLE dependencies (
  blocked_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  blocker_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  metadata TEXT,  -- JSON blob
  PRIMARY KEY (blocked_id, blocker_id, type)
);
```

**Note:** Only `blocked_id` has a CASCADE foreign key constraint. Deleting the blocked element removes its dependencies.

### FTS5 Virtual Table (Migration 7)

```sql
CREATE VIRTUAL TABLE documents_fts USING fts5(
  document_id UNINDEXED,
  title,
  content,
  tags,
  category UNINDEXED,
  tokenize='porter unicode61'
);
```

External-content FTS5 index for documents. Uses BM25 ranking and supports snippet generation. Populated by `QuarryAPI` on document create/update/delete (not via triggers). The `document_id` and `category` columns are `UNINDEXED` (stored but not searchable).

### Document Embeddings Table (Migration 8)

```sql
CREATE TABLE document_embeddings (
  document_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  dimensions INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES elements(id) ON DELETE CASCADE
);
```

Stores vector embeddings for semantic search. Embeddings are generated by a registered `EmbeddingProvider` and used for cosine-similarity document retrieval.

---

## Sync System

**Files:** `packages/quarry/src/sync/`

| File | Purpose |
|------|---------|
| `service.ts` | SyncService: export/import operations |
| `serialization.ts` | Element serialization/deserialization |
| `merge.ts` | Merge resolution logic |
| `hash.ts` | Content hash computation |
| `types.ts` | Sync-related types |

### JSONL Format

```jsonl
{"id":"abc123","type":"task","title":"...","createdAt":"...","createdBy":"..."}
{"id":"def456","type":"entity","name":"...","createdAt":"...","createdBy":"..."}
```

Each line is a complete, self-contained JSON object.

### Export

```typescript
import { createSyncService } from '@stoneforge/quarry';

const syncService = createSyncService(storage);

// Incremental (dirty only)
await syncService.export({ outputDir: '.stoneforge/sync' });

// Full export
await syncService.export({ outputDir: '.stoneforge/sync', full: true });
```

### Import

```typescript
// Standard import (merge)
const result = await syncService.import({ inputDir: '.stoneforge/sync' });
// result.elementsImported, result.elementsSkipped, result.conflicts

// Force import (remote always wins)
await syncService.import({ inputDir: '.stoneforge/sync', force: true });
```

### Serialization

```typescript
import {
  serializeElement,
  parseElement,
  serializeDependency,
  parseDependency,
} from '@stoneforge/quarry';

// Element → JSON string
const json = serializeElement(element);

// JSON string → Element
const element = parseElement(json);
```

### SerializedElement

```typescript
interface SerializedElement {
  id: string;
  type: ElementType;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  metadata: Record<string, unknown>;
  // ... type-specific fields
}
```

### Content Hashing

Content hash is computed for merge conflict detection:

```typescript
import { computeContentHashSync } from '@stoneforge/quarry';

const hash = computeContentHashSync(element);
```

**Excluded from hash:**
- `id`
- `createdAt`
- `updatedAt`
- `createdBy`
- `contentHash`

### Merge Strategy

```typescript
import { mergeElements } from '@stoneforge/quarry';

const merged = mergeElements(local, remote, options);
```

**Rules:**
1. Newer `updatedAt` wins by default
2. `closed` and `tombstone` statuses **always win**
3. Tags are merged as union (cannot remove via sync)
4. Conflicts tracked in `ImportResult.conflicts`

### Merge Resolution

| Scenario | Winner |
|----------|--------|
| Same hash | Skip (identical) |
| Remote newer | Remote |
| Local newer | Local |
| Either `closed` | `closed` wins |
| Either `tombstone` | `tombstone` wins |
| `force: true` | Remote always |

---

## Backend Differences

| Feature | Bun | Node | Browser |
|---------|-----|------|---------|
| Native | Yes | No (FFI) | No (WASM) |
| Async required | No | No | Yes (OPFS) |
| Performance | Best | Good | Good |
| Memory | Low | Medium | Higher |

### Bun Backend

```typescript
import { BunStorageBackend } from '@stoneforge/storage/bun';

const backend = new BunStorageBackend('./stoneforge.db');
```

### Node Backend

```typescript
import { NodeStorageBackend } from '@stoneforge/storage/node';

const backend = new NodeStorageBackend('./stoneforge.db');
```

### Browser Backend

```typescript
import { BrowserStorageBackend } from '@stoneforge/storage/browser';

// Uses OPFS (Origin Private File System)
const backend = await BrowserStorageBackend.create({ path: './stoneforge.db' });
```

---

## Error Handling

```typescript
import { mapStorageError, isConstraintError } from '@stoneforge/storage';

try {
  storage.run('INSERT ...');
} catch (err) {
  const mapped = mapStorageError(err);
  if (isConstraintError(mapped)) {
    // Handle constraint violation
  }
}
```
