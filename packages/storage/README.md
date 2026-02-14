# @stoneforge/storage

Multi-runtime SQLite storage layer for the Stoneforge platform — Bun native, Node.js via better-sqlite3, and browser via sql.js.

[![npm](https://img.shields.io/npm/v/@stoneforge/storage)](https://www.npmjs.com/package/@stoneforge/storage)
[![license](https://img.shields.io/npm/l/@stoneforge/storage)](https://github.com/stoneforge-ai/stoneforge/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@stoneforge/storage)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org)

## Overview

`@stoneforge/storage` provides a unified `StorageBackend` interface that works identically across Bun, Node.js, and the browser. It handles runtime detection, schema migrations, and exposes both synchronous and async factory functions. Used internally by `@stoneforge/quarry` and `@stoneforge/smithy` — you can also use it directly for custom storage needs.

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

// Use the storage backend
const result = storage.query('SELECT * FROM elements WHERE type = ?', ['task']);
```

### Async (browser)

```typescript
import { createStorageAsync, initializeSchema } from '@stoneforge/storage';

// Async factory required for browser (WASM loading)
const storage = await createStorageAsync({ path: 'stoneforge.db' });
initializeSchema(storage);
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
| `getRuntimeName()` | Returns `'bun'`, `'node'`, or `'browser'` |

### Schema Management

| Export | Description |
|--------|-------------|
| `initializeSchema(backend)` | Run all pending migrations |
| `getSchemaVersion(backend)` | Get current schema version |
| `validateSchema(backend)` | Check schema integrity |
| `MIGRATIONS` | Array of migration definitions |

### Backend Interface

```typescript
interface StorageBackend {
  query<T>(sql: string, params?: unknown[]): QueryResult<T>;
  mutate(sql: string, params?: unknown[]): MutationResult;
  prepare<T>(sql: string): PreparedStatement<T>;
  transaction<T>(fn: () => T): T;
  close(): void;
}
```

### Error Utilities

| Export | Description |
|--------|-------------|
| `mapStorageError(err)` | Map SQLite errors to `StorageError` |
| `queryError(msg, cause?)` | Create a query error |
| `mutationError(msg, cause?)` | Create a mutation error |
| `SqliteResultCode` | SQLite result code enum |

## Entry Points

| Import | Contents |
|--------|----------|
| `@stoneforge/storage` | Runtime-agnostic API (factory, schema, types) |
| `@stoneforge/storage/bun` | `BunStorageBackend`, `createBunStorage` |
| `@stoneforge/storage/node` | `NodeStorageBackend`, `createNodeStorage` |
| `@stoneforge/storage/browser` | `BrowserStorageBackend`, `createBrowserStorage`, OPFS utilities |

---

Part of [Stoneforge](https://github.com/stoneforge-ai/stoneforge) — Apache-2.0
