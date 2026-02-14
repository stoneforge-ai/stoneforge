# Understanding Sync and Merge

Why SQLite is the cache and JSONL is the source of truth.

## The Dual Storage Model

Stoneforge uses two storage layers with different purposes:

```
┌─────────────────────────────────────────────────────┐
│                   Your Project                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐         ┌──────────────────────┐  │
│  │   SQLite     │         │   .stoneforge/        │  │
│  │   (Cache)    │ ◄─sync─►│   (JSONL files)      │  │
│  │              │         │                      │  │
│  │ - Fast reads │         │ - Git-friendly       │  │
│  │ - Indexes    │         │ - Portable           │  │
│  │ - Queries    │         │ - Mergeable          │  │
│  │ - Ephemeral  │         │ - Source of truth    │  │
│  └──────────────┘         └──────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

| Aspect | SQLite | JSONL |
|--------|--------|-------|
| **Purpose** | Fast queries | Data persistence |
| **Speed** | Milliseconds | Slower (file I/O) |
| **Git-friendly** | No (binary) | Yes (text diff) |
| **Portable** | No | Yes (copy files) |
| **Source of truth** | No | Yes |
| **Can rebuild from** | JSONL | N/A |

## Why This Architecture?

### The Problem with Just SQLite

SQLite is fast and supports complex queries, but:
- Binary files don't merge in Git
- Database corruption risks data loss
- Hard to sync between machines
- No meaningful diffs in version control

### The Problem with Just Files

JSONL is portable and mergeable, but:
- No indexes (slow queries)
- No transactions
- No complex joins
- Full scan for every query

### The Solution: Both

Use each for what it's good at:
- **SQLite** for runtime queries (fast, indexed)
- **JSONL** for persistence (portable, git-friendly)

SQLite can always be rebuilt from JSONL. If the cache corrupts, regenerate it.

## JSONL Format

### Elements File

`.stoneforge/elements.jsonl`:

```jsonl
{"type":"element","id":"task-abc123","type":"task","title":"Fix login bug","status":"open","createdAt":"2024-01-15T10:00:00.000Z","updatedAt":"2024-01-15T10:00:00.000Z","createdBy":"director-1","tags":[],"metadata":{}}
{"type":"element","id":"task-def456","type":"task","title":"Add tests","status":"closed","createdAt":"2024-01-15T11:00:00.000Z","updatedAt":"2024-01-15T12:00:00.000Z","createdBy":"director-1","tags":["testing"],"metadata":{}}
```

Each line is a complete, self-contained JSON object. No dependencies between lines.

### Dependencies File

`.stoneforge/dependencies.jsonl`:

```jsonl
{"type":"dependency","blockedId":"task-abc123","blockerId":"task-def456","type":"blocks","createdAt":"2024-01-15T10:30:00.000Z","createdBy":"director-1","metadata":{}}
```

### Serialization

The `SerializedElement` and `SerializedDependency` types add a `type` discriminator:

```typescript
interface SerializedElement {
  type: 'element';
  // ... all Element fields
}

interface SerializedDependency {
  type: 'dependency';
  // ... all Dependency fields
}
```

## Sync Operations

### Export (SQLite → JSONL)

```typescript
import { exportToJsonl } from '@stoneforge/quarry/sync';

await exportToJsonl(storage, '.stoneforge/elements.jsonl');
```

Exports all elements and dependencies from SQLite to JSONL files.

### Import (JSONL → SQLite)

```typescript
import { importFromJsonl } from '@stoneforge/quarry/sync';

const result = await importFromJsonl(storage, '.stoneforge/elements.jsonl');
console.log(`Imported ${result.elementsImported} elements`);
console.log(`Conflicts: ${result.conflicts.length}`);
```

Reads JSONL files and merges into SQLite.

### Full Rebuild

```typescript
import { rebuildFromJsonl } from '@stoneforge/quarry/sync';

await rebuildFromJsonl(storage, '.stoneforge/');
// Clears SQLite and rebuilds entirely from JSONL
```

## Merge Strategy

When importing, conflicts can occur. Stoneforge uses **Last-Write-Wins (LWW)** with special handling.

### Content Hashing

Before merging, both elements are hashed:

```typescript
import { computeContentHashSync } from '@stoneforge/quarry/sync';

const localHash = computeContentHashSync(localElement);
const remoteHash = computeContentHashSync(remoteElement);

if (localHash.hash === remoteHash.hash) {
  // Identical content - no conflict
}
```

The hash covers all semantic fields (excluding system fields like `updatedAt`).

### Resolution Strategies

| Scenario | Resolution |
|----------|------------|
| Identical content | Skip (no conflict) |
| Fresh tombstone vs live | Tombstone wins |
| Expired tombstone vs live | Live wins |
| Closed vs open | Closed wins |
| Same status | Later `updatedAt` wins |
| Tags differ | Set union (never lose tags) |

### Tombstone Handling

Soft-deleted elements have a `deletedAt` timestamp. Tombstones have a TTL:

```typescript
export function getTombstoneStatus(element: Element, ttlMs: number): TombstoneStatus {
  if (!element.deletedAt) return TombstoneStatus.LIVE;

  const age = Date.now() - new Date(element.deletedAt).getTime();
  return age <= ttlMs ? TombstoneStatus.FRESH : TombstoneStatus.EXPIRED;
}
```

- **Fresh tombstone** (within TTL): Wins over live element
- **Expired tombstone** (past TTL): Loses to live element

Default TTL: 30 days.

### Status Merge Rules

Closed status is sticky:

```typescript
function resolveStatusConflict(local: Element, remote: Element) {
  const closedStatuses = ['closed', 'tombstone'];

  const localClosed = closedStatuses.includes(local.status);
  const remoteClosed = closedStatuses.includes(remote.status);

  if (localClosed && !remoteClosed) return 'local';
  if (remoteClosed && !localClosed) return 'remote';
  return null;  // Both same - use LWW
}
```

If one is closed and one is open, closed wins regardless of timestamps.

### Tag Merge

Tags use set union:

```typescript
function mergeTags(localTags: string[], remoteTags: string[]): string[] {
  const merged = new Set([...localTags, ...remoteTags]);
  return [...merged].sort();
}
```

Tags are **never lost** in merge. If local has `['a', 'b']` and remote has `['b', 'c']`, result is `['a', 'b', 'c']`.

### Dependency Merge

Dependencies use removal-wins strategy:

```typescript
function mergeDependencies(local, remote, original) {
  // If one side removed a dependency that was in original
  // → honor the removal

  // If one side added a dependency
  // → keep it

  // No duplicates
}
```

This prevents deleted dependencies from "resurrecting" during sync.

## Conflict Records

When merges happen, conflicts are recorded:

```typescript
interface ConflictRecord {
  elementId: ElementId;
  localHash: string;
  remoteHash: string;
  resolution: MergeResolution;
  localUpdatedAt: Timestamp;
  remoteUpdatedAt: Timestamp;
  resolvedAt: Timestamp;
}
```

Resolution types:
- `IDENTICAL` - No conflict (same content)
- `LOCAL_WINS` - Local kept
- `REMOTE_WINS` - Remote kept
- `TAGS_MERGED` - Tags combined
- `DEPENDENCY_ADDED` - New dependency from import
- `DEPENDENCY_REMOVED` - Dependency removed

## Git Workflow

The JSONL format enables Git-based collaboration:

```bash
# Developer A creates a task
sf task create --title "Fix bug"
sf sync export

git add .stoneforge/
git commit -m "Add fix bug task"
git push

# Developer B syncs
git pull
sf sync import

# Conflicts resolved automatically
# Both have the task now
```

### Merge Conflicts in Git

When Git reports a conflict in JSONL files:

1. Accept both versions (concatenate lines)
2. Run `sf sync import` - Stoneforge handles semantic merge
3. Run `sf sync export` - Writes clean merged state
4. Commit the resolved files

## The Sync Loop

```
┌─────────────────────────────────────────────────────┐
│                    Sync Loop                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│   1. Developer makes changes (SQLite modified)       │
│                    │                                 │
│                    ▼                                 │
│   2. Export: SQLite → JSONL                         │
│                    │                                 │
│                    ▼                                 │
│   3. Git add/commit/push                            │
│                    │                                 │
│                    ▼                                 │
│   4. Other developer: git pull                      │
│                    │                                 │
│                    ▼                                 │
│   5. Import: JSONL → SQLite (merge)                 │
│                    │                                 │
│                    ▼                                 │
│   6. Export: SQLite → JSONL (normalize)             │
│                    │                                 │
│                    ▼                                 │
│   7. Git commit (clean state)                       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## MergeStewardService

The `MergeStewardService` automates branch merging for completed tasks. All merge operations run in a temporary worktree to avoid corrupting the main repository's HEAD.

```typescript
import { createMergeStewardService } from '@stoneforge/smithy';

const mergeSteward = createMergeStewardService(
  api, taskAssignmentService, dispatchService, agentRegistry,
  { workspaceRoot: '/project' },
  worktreeManager
);

// Process all pending merge tasks
const report = await mergeSteward.processAllPending();

console.log(`Merged: ${report.mergedCount}`);
console.log(`Conflicts: ${report.conflictCount}`);
console.log(`Test failures: ${report.testFailedCount}`);
console.log(`Errors: ${report.errorCount}`);
```

The steward:
- Runs tests on completed task branches
- Merges branches in a temporary worktree (main repo HEAD untouched)
- Creates fix tasks for test failures or merge conflicts
- Logs all decisions for audit

## Best Practices

### Do
- Export after significant changes
- Import before starting work
- Commit JSONL files to Git
- Use `rebuildFromJsonl()` if SQLite corrupts

### Don't
- Commit SQLite database files to Git
- Manually edit JSONL files
- Skip import after git pull
- Assume SQLite is authoritative

### Recovery

If SQLite corrupts or gets out of sync:

```bash
# Delete the cache
rm .stoneforge/stoneforge.db

# Rebuild from JSONL
sf sync rebuild
```

The JSONL files are the source of truth. SQLite can always be regenerated.

## Related Documentation

- [Storage Reference](../reference/storage.md) - Storage APIs
- [Event Sourcing](./event-sourcing.md) - How events differ from sync
- [Orchestrator Services](../reference/orchestrator-services.md) - MergeStewardService
