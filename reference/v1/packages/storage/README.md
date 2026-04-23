# @stoneforge/storage

Multi-runtime SQLite storage layer for the Stoneforge platform — Bun native, Node.js via better-sqlite3, and browser via sql.js.

[![npm](https://img.shields.io/npm/v/@stoneforge/storage)](https://www.npmjs.com/package/@stoneforge/storage)
[![license](https://img.shields.io/npm/l/@stoneforge/storage)](https://github.com/stoneforge-ai/stoneforge/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/@stoneforge/storage)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

## Overview

`@stoneforge/storage` provides a unified `StorageBackend` interface that works identically across Bun, Node.js, and the browser. It handles runtime detection, schema migrations, dirty tracking, and hierarchical ID generation. Used internally by `@stoneforge/quarry` and `@stoneforge/smithy` — you can also use it directly for custom storage needs.

SQLite acts as a structured cache over JSONL, which is the canonical source of truth. The JSONL files are the durable, portable record; SQLite provides fast indexed queries and is rebuilt from JSONL when needed. Dirty tracking (`markDirty` / `getDirtyElements`) lets the system know which elements have been modified in SQLite and need to be flushed back to JSONL.

## Installation

```bash
npm install @stoneforge/storage
```

The Bun backend works out of the box. For Node.js or browser, install the corresponding optional dependency:

```bash
# Node.js
npm install better-sqlite3

# Browser
npm install sql.js
```

## Quick Start

```typescript
import { createStorage, initializeSchema } from '@stoneforge/storage';

// Auto-detects runtime (Bun, Node, or browser)
const storage = createStorage({ path: './data.db' });

// Run migrations to set up tables
initializeSchema(storage);

// Query rows
const tasks = storage.query('SELECT * FROM elements WHERE type = ?', ['task']);

// Insert a row
const result = storage.run(
  'INSERT INTO elements (id, type, data, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  ['el-1', 'task', '{}', new Date().toISOString(), new Date().toISOString(), 'system']
);
console.log(result.changes); // 1
```

### Async (browser)

```typescript
import { createStorageAsync, initializeSchema } from '@stoneforge/storage';

// Async factory required for browser (WASM loading)
const storage = await createStorageAsync({ path: 'stoneforge.db' });
initializeSchema(storage);
```

## StorageBackend Interface

Every backend implements this interface. Methods are synchronous (SQLite is inherently sync); the browser backend wraps async WASM init but exposes the same sync API once initialized.

```typescript
interface StorageBackend {
  // --- Connection ---
  readonly isOpen: boolean;
  readonly path: string;
  close(): void;

  // --- SQL Execution ---
  exec(sql: string): void;
  query<T extends Row = Row>(sql: string, params?: unknown[]): T[];
  queryOne<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined;
  run(sql: string, params?: unknown[]): MutationResult;

  // --- Prepared Statements ---
  prepare<T extends Row = Row>(sql: string): PreparedStatement<T>;

  // --- Transactions ---
  transaction<T>(fn: (tx: Transaction) => T, options?: TransactionOptions): T;
  readonly inTransaction: boolean;

  // --- Schema ---
  getSchemaVersion(): number;
  setSchemaVersion(version: number): void;
  migrate(migrations: Migration[]): MigrationResult;

  // --- Dirty Tracking ---
  markDirty(elementId: string): void;
  getDirtyElements(options?: DirtyTrackingOptions): DirtyElement[];
  clearDirty(): void;
  clearDirtyElements(elementIds: string[]): void;

  // --- Hierarchical IDs ---
  getNextChildNumber(parentId: string): number;
  getChildCounter(parentId: string): number;
  resetChildCounter(parentId: string): void;

  // --- Element Count ---
  getElementCount(): number;

  // --- Utilities ---
  checkIntegrity(): boolean;
  optimize(): void;
  getStats(): StorageStats;
}
```

### Key Types

```typescript
type Row = Record<string, unknown>;

interface MutationResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

interface PreparedStatement<T extends Row = Row> {
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
  run(...params: unknown[]): MutationResult;
  finalize(): void;
}

interface Transaction {
  exec(sql: string): void;
  query<T extends Row = Row>(sql: string, params?: unknown[]): T[];
  queryOne<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined;
  run(sql: string, params?: unknown[]): MutationResult;
  savepoint(name: string): void;
  release(name: string): void;
  rollbackTo(name: string): void;
}

interface TransactionOptions {
  isolation?: 'deferred' | 'immediate' | 'exclusive';
}

interface StorageStats {
  fileSize: number;
  tableCount: number;
  indexCount: number;
  schemaVersion: number;
  dirtyCount: number;
  elementCount: number;
  walMode: boolean;
}

interface StorageConfig {
  path: string;
  pragmas?: SqlitePragmas;
  create?: boolean;   // default: true
  readonly?: boolean;  // default: false
  verbose?: boolean;   // default: false
}
```

## API

### Factory Functions

| Export | Description |
|--------|-------------|
| `createStorage(config)` | Sync factory — auto-detects Bun or Node |
| `createStorageAsync(config)` | Async factory — supports all runtimes including browser |

### Runtime Detection

| Export | Description |
|--------|-------------|
| `isBunRuntime()` | Check if running in Bun |
| `isNodeRuntime()` | Check if running in Node.js |
| `isBrowserRuntime()` | Check if running in a browser |
| `getRuntimeName()` | Returns `'bun'`, `'node'`, `'browser'`, or `'unknown'` |

### Schema Management

| Export | Description |
|--------|-------------|
| `initializeSchema(backend)` | Run all pending migrations |
| `getSchemaVersion(backend)` | Get current schema version |
| `isSchemaUpToDate(backend)` | Check if schema is at the latest version |
| `getPendingMigrations(backend)` | Get migrations not yet applied |
| `resetSchema(backend)` | Drop all tables and reset version (testing only) |
| `validateSchema(backend)` | Check that all expected tables exist |
| `getTableColumns(backend, table)` | Get column metadata for a table |
| `getTableIndexes(backend, table)` | Get index names for a table |
| `MIGRATIONS` | Array of migration definitions |
| `CURRENT_SCHEMA_VERSION` | Latest schema version number |
| `EXPECTED_TABLES` | Table names expected after full migration |

### Error Utilities

| Export | Description |
|--------|-------------|
| `mapStorageError(error, context?)` | Map a SQLite error to a typed `StorageError` |
| `queryError(error)` | Create a query-scoped storage error |
| `mutationError(operation, elementId, error)` | Create a mutation-scoped storage error |
| `connectionError(path, error)` | Create a connection-scoped storage error |
| `migrationError(version, error)` | Create a migration-scoped storage error |
| `isBusyError(error)` | Check if error is a SQLite busy/locked error |
| `isConstraintError(error)` | Check if error is a constraint violation |
| `isUniqueViolation(error)` | Check if error is a unique/PK violation |
| `isForeignKeyViolation(error)` | Check if error is a foreign key violation |
| `isCorruptionError(error)` | Check if error indicates database corruption |
| `SqliteResultCode` | SQLite result code constants |

## Entry Points

| Import | Contents |
|--------|----------|
| `@stoneforge/storage` | Runtime-agnostic API (factory, schema, types, errors) |
| `@stoneforge/storage/bun` | `BunStorageBackend`, `createBunStorage` |
| `@stoneforge/storage/node` | `NodeStorageBackend`, `createNodeStorage` |
| `@stoneforge/storage/browser` | `BrowserStorageBackend`, `createBrowserStorage` |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
