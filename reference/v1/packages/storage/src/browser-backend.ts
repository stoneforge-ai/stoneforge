/**
 * Browser SQLite Backend Implementation
 *
 * Implements the StorageBackend interface using sql.js (SQLite compiled to WebAssembly).
 * Uses the Origin Private File System (OPFS) for persistence in the browser.
 *
 * Key features:
 * - sql.js for SQLite WASM
 * - OPFS for persistent storage (survives page refresh)
 * - Async initialization for WASM loading
 * - Fallback to in-memory storage when OPFS is unavailable
 */

import type { Database, Statement as SqlJsStatement, SqlJsStatic } from 'sql.js';
import type {
  StorageBackend,
  StorageStats,
  AsyncStorageFactory,
} from './backend.js';
import type {
  Row,
  MutationResult,
  PreparedStatement,
  Transaction,
  TransactionOptions,
  IsolationLevel,
  StorageConfig,
  Migration,
  MigrationResult,
  DirtyElement,
  DirtyTrackingOptions,
  SqlitePragmas,
} from './types.js';
import { DEFAULT_PRAGMAS } from './types.js';
import { connectionError, mapStorageError, migrationError } from './errors.js';

// ============================================================================
// Browser Environment Detection
// ============================================================================

/**
 * Check if running in a browser environment
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Check if OPFS is available (requires secure context and FileSystemSyncAccessHandle)
 */
export async function isOpfsAvailable(): Promise<boolean> {
  if (!isBrowserEnvironment()) return false;

  try {
    // OPFS is only available in secure contexts (HTTPS or localhost)
    if (!window.isSecureContext) return false;

    // Check if the Origin Private File System API is available
    const root = await navigator.storage.getDirectory();
    return root !== undefined;
  } catch {
    return false;
  }
}

// ============================================================================
// WASM Loading Configuration
// ============================================================================

/**
 * Configuration options for loading sql.js WASM
 */
export interface WasmConfig {
  /**
   * Path to the sql.js WASM binary.
   * If not specified, sql.js will try to load from its default location.
   */
  wasmPath?: string;

  /**
   * Locate the WASM file manually (alternative to wasmPath).
   * Called by sql.js to determine where to load the WASM file from.
   */
  locateFile?: (file: string) => string;
}

// ============================================================================
// OPFS Storage Manager
// ============================================================================

/**
 * Manages persistence to/from the Origin Private File System
 */
class OpfsStorageManager {
  private fileHandle: FileSystemFileHandle | null = null;
  private rootDir: FileSystemDirectoryHandle | null = null;
  private readonly filename: string;

  constructor(dbPath: string) {
    // Extract filename from path (or use as-is if no path separators)
    this.filename = dbPath.includes('/')
      ? dbPath.split('/').pop() || 'stoneforge.db'
      : dbPath;
  }

  /**
   * Initialize OPFS access
   */
  async init(): Promise<boolean> {
    try {
      this.rootDir = await navigator.storage.getDirectory();

      // Create or get the database file handle
      this.fileHandle = await this.rootDir.getFileHandle(this.filename, {
        create: true,
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load database from OPFS
   * @returns Database bytes or null if no existing database
   */
  async load(): Promise<Uint8Array | null> {
    if (!this.fileHandle) return null;

    try {
      const file = await this.fileHandle.getFile();
      if (file.size === 0) return null;

      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  /**
   * Save database to OPFS
   */
  async save(data: Uint8Array): Promise<void> {
    if (!this.fileHandle) return;

    try {
      const writable = await this.fileHandle.createWritable();
      // Copy to a fresh ArrayBuffer to avoid SharedArrayBuffer type issues
      const buffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(buffer).set(data);
      await writable.write(buffer);
      await writable.close();
    } catch (error) {
      console.error('Failed to save database to OPFS:', error);
    }
  }

  /**
   * Delete the database file from OPFS
   */
  async delete(): Promise<void> {
    if (!this.rootDir) return;

    try {
      await this.rootDir.removeEntry(this.filename);
    } catch {
      // File may not exist
    }
  }
}

// ============================================================================
// Prepared Statement Wrapper
// ============================================================================

/**
 * Wraps a sql.js Statement to implement PreparedStatement interface
 */
class BrowserPreparedStatement<T extends Row = Row> implements PreparedStatement<T> {
  /** The SQL string (kept for debugging purposes) */
  readonly sql: string;

  constructor(
    private stmt: SqlJsStatement,
    sql: string,
    private db: Database
  ) {
    this.sql = sql;
  }

  all(...params: unknown[]): T[] {
    try {
      // sql.js requires rebinding for each execution
      if (params.length > 0) {
        this.stmt.bind(params as (number | string | Uint8Array | null)[]);
      }

      const results: T[] = [];
      while (this.stmt.step()) {
        const row = this.stmt.getAsObject() as T;
        results.push(row);
      }

      this.stmt.reset();
      return results;
    } catch (error) {
      this.stmt.reset();
      throw error;
    }
  }

  get(...params: unknown[]): T | undefined {
    try {
      if (params.length > 0) {
        this.stmt.bind(params as (number | string | Uint8Array | null)[]);
      }

      if (this.stmt.step()) {
        const row = this.stmt.getAsObject() as T;
        this.stmt.reset();
        return row;
      }

      this.stmt.reset();
      return undefined;
    } catch (error) {
      this.stmt.reset();
      throw error;
    }
  }

  run(...params: unknown[]): MutationResult {
    try {
      if (params.length > 0) {
        this.stmt.bind(params as (number | string | Uint8Array | null)[]);
      }

      this.stmt.step();
      this.stmt.reset();

      // Get changes and lastInsertRowid from the database
      const changes = this.db.getRowsModified();
      const lastRowId = this.db.exec('SELECT last_insert_rowid()');
      const lastInsertRowid =
        lastRowId.length > 0 && lastRowId[0].values.length > 0
          ? (lastRowId[0].values[0][0] as number)
          : 0;

      return { changes, lastInsertRowid };
    } catch (error) {
      this.stmt.reset();
      throw error;
    }
  }

  finalize(): void {
    this.stmt.free();
  }
}

// ============================================================================
// Transaction Implementation
// ============================================================================

/**
 * Transaction context for sql.js
 */
class BrowserTransaction implements Transaction {
  constructor(private db: Database) {}

  exec(sql: string): void {
    this.db.run(sql);
  }

  query<T extends Row = Row>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    try {
      if (params && params.length > 0) {
        stmt.bind(params as (number | string | Uint8Array | null)[]);
      }

      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  queryOne<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined {
    const stmt = this.db.prepare(sql);
    try {
      if (params && params.length > 0) {
        stmt.bind(params as (number | string | Uint8Array | null)[]);
      }

      if (stmt.step()) {
        return stmt.getAsObject() as T;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  run(sql: string, params?: unknown[]): MutationResult {
    if (params && params.length > 0) {
      this.db.run(sql, params as (number | string | Uint8Array | null)[]);
    } else {
      this.db.run(sql);
    }

    const changes = this.db.getRowsModified();
    const lastRowId = this.db.exec('SELECT last_insert_rowid()');
    const lastInsertRowid =
      lastRowId.length > 0 && lastRowId[0].values.length > 0
        ? (lastRowId[0].values[0][0] as number)
        : 0;

    return { changes, lastInsertRowid };
  }

  savepoint(name: string): void {
    this.db.run(`SAVEPOINT ${name}`);
  }

  release(name: string): void {
    this.db.run(`RELEASE SAVEPOINT ${name}`);
  }

  rollbackTo(name: string): void {
    this.db.run(`ROLLBACK TO SAVEPOINT ${name}`);
  }
}

// ============================================================================
// Browser Storage Backend
// ============================================================================

/**
 * Browser SQLite storage backend implementation using sql.js
 */
export class BrowserStorageBackend implements StorageBackend {
  private db: Database | null;
  private _path: string;
  private _inTransaction: boolean = false;
  private opfsManager: OpfsStorageManager | null = null;
  private autoSave: boolean = true;
  private autoSaveDebounceMs: number = 1000;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Private constructor - use createBrowserStorage factory instead
   */
  private constructor(
    db: Database,
    path: string,
    opfsManager: OpfsStorageManager | null
  ) {
    this.db = db;
    this._path = path;
    this.opfsManager = opfsManager;

    // Initialize dirty tracking table
    this.initDirtyTable();
  }

  /**
   * Create a browser storage backend with async initialization.
   * This is required because loading WASM and OPFS are async operations.
   */
  static async create(
    config: StorageConfig,
    wasmConfig?: WasmConfig
  ): Promise<BrowserStorageBackend> {
    // Load sql.js with WASM
    const initSqlJs = await import('sql.js');
    const SQL: SqlJsStatic = await initSqlJs.default({
      locateFile: wasmConfig?.locateFile ||
        (wasmConfig?.wasmPath
          ? (file: string) => wasmConfig.wasmPath!.replace(/[^/]+$/, file)
          : undefined),
    });

    // Try to use OPFS for persistence
    let opfsManager: OpfsStorageManager | null = null;
    let existingData: Uint8Array | null = null;

    if (config.path !== ':memory:' && (await isOpfsAvailable())) {
      opfsManager = new OpfsStorageManager(config.path);
      const initialized = await opfsManager.init();

      if (initialized) {
        existingData = await opfsManager.load();
      }
    }

    // Create the database
    let db: Database;
    try {
      db = existingData
        ? new SQL.Database(existingData)
        : new SQL.Database();
    } catch (error) {
      throw connectionError(config.path, error);
    }

    // Create the backend instance
    const backend = new BrowserStorageBackend(db, config.path, opfsManager);

    // Apply pragmas
    backend.applyPragmas(config.pragmas);

    return backend;
  }

  private applyPragmas(pragmas?: SqlitePragmas): void {
    const settings = { ...DEFAULT_PRAGMAS, ...pragmas };

    if (!this.db) return;

    // Note: sql.js doesn't support WAL mode (it's in-memory/single-file)
    // We'll set what we can

    // Apply synchronous
    this.db.run(`PRAGMA synchronous = ${settings.synchronous}`);

    // Apply foreign keys
    this.db.run(`PRAGMA foreign_keys = ${settings.foreign_keys ? 'ON' : 'OFF'}`);

    // Apply cache size
    this.db.run(`PRAGMA cache_size = ${settings.cache_size}`);

    // Apply temp store
    const tempStoreValue =
      settings.temp_store === 'memory' ? 2 : settings.temp_store === 'file' ? 1 : 0;
    this.db.run(`PRAGMA temp_store = ${tempStoreValue}`);
  }

  private initDirtyTable(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS dirty_elements (
        element_id TEXT PRIMARY KEY,
        marked_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Schedule an auto-save to OPFS (debounced)
   */
  private scheduleAutoSave(): void {
    if (!this.autoSave || !this.opfsManager) return;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.persistToOpfs().catch(console.error);
    }, this.autoSaveDebounceMs);
  }

  /**
   * Persist the database to OPFS immediately
   */
  async persistToOpfs(): Promise<void> {
    if (!this.db || !this.opfsManager) return;

    const data = this.db.export();
    await this.opfsManager.save(data);
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  get isOpen(): boolean {
    return this.db !== null;
  }

  get path(): string {
    return this._path;
  }

  get inTransaction(): boolean {
    return this._inTransaction;
  }

  close(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    if (this.db) {
      // Final save before closing
      if (this.opfsManager) {
        this.persistToOpfs().catch(console.error);
      }
      this.db.close();
      this.db = null;
    }
  }

  private ensureOpen(): Database {
    if (!this.db) {
      throw new Error('Database is closed');
    }
    return this.db;
  }

  // --------------------------------------------------------------------------
  // SQL Execution
  // --------------------------------------------------------------------------

  exec(sql: string): void {
    try {
      this.ensureOpen().run(sql);
      this.scheduleAutoSave();
    } catch (error) {
      throw mapStorageError(error, { operation: 'exec' });
    }
  }

  query<T extends Row = Row>(sql: string, params?: unknown[]): T[] {
    try {
      const db = this.ensureOpen();
      const stmt = db.prepare(sql);

      try {
        if (params && params.length > 0) {
          stmt.bind(params as (number | string | Uint8Array | null)[]);
        }

        const results: T[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject() as T);
        }
        return results;
      } finally {
        stmt.free();
      }
    } catch (error) {
      throw mapStorageError(error, { operation: 'query' });
    }
  }

  queryOne<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined {
    try {
      const db = this.ensureOpen();
      const stmt = db.prepare(sql);

      try {
        if (params && params.length > 0) {
          stmt.bind(params as (number | string | Uint8Array | null)[]);
        }

        if (stmt.step()) {
          return stmt.getAsObject() as T;
        }
        return undefined;
      } finally {
        stmt.free();
      }
    } catch (error) {
      throw mapStorageError(error, { operation: 'queryOne' });
    }
  }

  run(sql: string, params?: unknown[]): MutationResult {
    try {
      const db = this.ensureOpen();

      if (params && params.length > 0) {
        db.run(sql, params as (number | string | Uint8Array | null)[]);
      } else {
        db.run(sql);
      }

      const changes = db.getRowsModified();
      const lastRowId = db.exec('SELECT last_insert_rowid()');
      const lastInsertRowid =
        lastRowId.length > 0 && lastRowId[0].values.length > 0
          ? (lastRowId[0].values[0][0] as number)
          : 0;

      this.scheduleAutoSave();

      return { changes, lastInsertRowid };
    } catch (error) {
      throw mapStorageError(error, { operation: 'run' });
    }
  }

  // --------------------------------------------------------------------------
  // Prepared Statements
  // --------------------------------------------------------------------------

  prepare<T extends Row = Row>(sql: string): PreparedStatement<T> {
    try {
      const db = this.ensureOpen();
      const stmt = db.prepare(sql);
      return new BrowserPreparedStatement<T>(stmt, sql, db);
    } catch (error) {
      throw mapStorageError(error, { operation: 'prepare' });
    }
  }

  // --------------------------------------------------------------------------
  // Transactions
  // --------------------------------------------------------------------------

  transaction<T>(fn: (tx: Transaction) => T, options?: TransactionOptions): T {
    const db = this.ensureOpen();
    const isolation = options?.isolation ?? 'deferred';

    const beginSql = this.getBeginSql(isolation);

    this._inTransaction = true;
    try {
      db.run(beginSql);
      const tx = new BrowserTransaction(db);
      const result = fn(tx);
      db.run('COMMIT');
      this.scheduleAutoSave();
      return result;
    } catch (error) {
      try {
        db.run('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }
      throw mapStorageError(error, { operation: 'transaction' });
    } finally {
      this._inTransaction = false;
    }
  }

  private getBeginSql(isolation: IsolationLevel): string {
    switch (isolation) {
      case 'immediate':
        return 'BEGIN IMMEDIATE';
      case 'exclusive':
        return 'BEGIN EXCLUSIVE';
      case 'deferred':
      default:
        return 'BEGIN DEFERRED';
    }
  }

  // --------------------------------------------------------------------------
  // Schema Management
  // --------------------------------------------------------------------------

  getSchemaVersion(): number {
    const db = this.ensureOpen();
    const result = db.exec('PRAGMA user_version');
    return result.length > 0 && result[0].values.length > 0
      ? (result[0].values[0][0] as number)
      : 0;
  }

  setSchemaVersion(version: number): void {
    const db = this.ensureOpen();
    db.run(`PRAGMA user_version = ${version}`);
    this.scheduleAutoSave();
  }

  migrate(migrations: Migration[]): MigrationResult {
    const fromVersion = this.getSchemaVersion();
    const pending = migrations
      .filter(m => m.version > fromVersion)
      .sort((a, b) => a.version - b.version);

    if (pending.length === 0) {
      return {
        fromVersion,
        toVersion: fromVersion,
        applied: [],
        success: true,
      };
    }

    const applied: number[] = [];

    try {
      for (const migration of pending) {
        this.transaction(() => {
          this.exec(migration.up);
          this.setSchemaVersion(migration.version);
        });
        applied.push(migration.version);
      }

      return {
        fromVersion,
        toVersion: this.getSchemaVersion(),
        applied,
        success: true,
      };
    } catch (error) {
      const lastApplied = applied[applied.length - 1] ?? fromVersion;
      const failedVersion = pending.find(m => m.version > lastApplied)?.version ?? 0;
      throw migrationError(failedVersion, error);
    }
  }

  // --------------------------------------------------------------------------
  // Dirty Tracking
  // --------------------------------------------------------------------------

  markDirty(elementId: string): void {
    try {
      const db = this.ensureOpen();
      const now = new Date().toISOString();
      db.run(
        'INSERT OR REPLACE INTO dirty_elements (element_id, marked_at) VALUES (?, ?)',
        [elementId, now]
      );
      this.scheduleAutoSave();
    } catch (error) {
      throw mapStorageError(error, { operation: 'markDirty', elementId });
    }
  }

  getDirtyElements(_options?: DirtyTrackingOptions): DirtyElement[] {
    try {
      const db = this.ensureOpen();
      const result = db.exec(
        'SELECT element_id, marked_at FROM dirty_elements ORDER BY marked_at'
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return [];
      }

      return result[0].values.map(row => ({
        elementId: row[0] as DirtyElement['elementId'],
        markedAt: row[1] as string,
      }));
    } catch (error) {
      throw mapStorageError(error, { operation: 'getDirtyElements' });
    }
  }

  clearDirty(): void {
    try {
      this.ensureOpen().run('DELETE FROM dirty_elements');
      this.scheduleAutoSave();
    } catch (error) {
      throw mapStorageError(error, { operation: 'clearDirty' });
    }
  }

  clearDirtyElements(elementIds: string[]): void {
    if (elementIds.length === 0) return;

    try {
      const db = this.ensureOpen();
      const placeholders = elementIds.map(() => '?').join(',');
      db.run(
        `DELETE FROM dirty_elements WHERE element_id IN (${placeholders})`,
        elementIds
      );
      this.scheduleAutoSave();
    } catch (error) {
      throw mapStorageError(error, { operation: 'clearDirtyElements' });
    }
  }

  // --------------------------------------------------------------------------
  // Hierarchical ID Support
  // --------------------------------------------------------------------------

  getNextChildNumber(parentId: string): number {
    try {
      const db = this.ensureOpen();

      db.run(
        `
        INSERT INTO child_counters (parent_id, last_child)
        VALUES (?, 1)
        ON CONFLICT(parent_id) DO UPDATE SET last_child = last_child + 1
      `,
        [parentId]
      );

      const result = db.exec(
        'SELECT last_child FROM child_counters WHERE parent_id = ?',
        [parentId]
      );

      this.scheduleAutoSave();

      return result.length > 0 && result[0].values.length > 0
        ? (result[0].values[0][0] as number)
        : 1;
    } catch (error) {
      throw mapStorageError(error, {
        operation: 'getNextChildNumber',
        elementId: parentId,
      });
    }
  }

  getChildCounter(parentId: string): number {
    try {
      const db = this.ensureOpen();
      const result = db.exec(
        'SELECT last_child FROM child_counters WHERE parent_id = ?',
        [parentId]
      );

      return result.length > 0 && result[0].values.length > 0
        ? (result[0].values[0][0] as number)
        : 0;
    } catch (error) {
      throw mapStorageError(error, {
        operation: 'getChildCounter',
        elementId: parentId,
      });
    }
  }

  resetChildCounter(parentId: string): void {
    try {
      const db = this.ensureOpen();
      db.run('DELETE FROM child_counters WHERE parent_id = ?', [parentId]);
      this.scheduleAutoSave();
    } catch (error) {
      throw mapStorageError(error, {
        operation: 'resetChildCounter',
        elementId: parentId,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Element Count (for ID generation)
  // --------------------------------------------------------------------------

  getElementCount(): number {
    try {
      const db = this.ensureOpen();
      const result = db.exec('SELECT COUNT(*) as count FROM elements');
      return result.length > 0 && result[0].values.length > 0
        ? (result[0].values[0][0] as number)
        : 0;
    } catch {
      // Table doesn't exist yet
      return 0;
    }
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  checkIntegrity(): boolean {
    try {
      const db = this.ensureOpen();
      const result = db.exec('PRAGMA integrity_check');
      return (
        result.length > 0 &&
        result[0].values.length > 0 &&
        result[0].values[0][0] === 'ok'
      );
    } catch {
      return false;
    }
  }

  optimize(): void {
    try {
      const db = this.ensureOpen();
      db.run('VACUUM');
      db.run('ANALYZE');
      this.scheduleAutoSave();
    } catch (error) {
      throw mapStorageError(error, { operation: 'optimize' });
    }
  }

  getStats(): StorageStats {
    const db = this.ensureOpen();

    // Get approximate file size from exported data
    let fileSize = 0;
    try {
      const data = db.export();
      fileSize = data.length;
    } catch {
      fileSize = 0;
    }

    // Count tables
    const tableResult = db.exec(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table'"
    );
    const tableCount =
      tableResult.length > 0 && tableResult[0].values.length > 0
        ? (tableResult[0].values[0][0] as number)
        : 0;

    // Count indexes
    const indexResult = db.exec(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index'"
    );
    const indexCount =
      indexResult.length > 0 && indexResult[0].values.length > 0
        ? (indexResult[0].values[0][0] as number)
        : 0;

    // Count dirty elements
    let dirtyCount = 0;
    try {
      const dirtyResult = db.exec('SELECT COUNT(*) as count FROM dirty_elements');
      dirtyCount =
        dirtyResult.length > 0 && dirtyResult[0].values.length > 0
          ? (dirtyResult[0].values[0][0] as number)
          : 0;
    } catch {
      // Table might not exist yet
    }

    // Count elements (if table exists)
    let elementCount = 0;
    try {
      const elemResult = db.exec('SELECT COUNT(*) as count FROM elements');
      elementCount =
        elemResult.length > 0 && elemResult[0].values.length > 0
          ? (elemResult[0].values[0][0] as number)
          : 0;
    } catch {
      // Table doesn't exist yet
    }

    // sql.js doesn't support WAL mode
    const walMode = false;

    return {
      fileSize,
      tableCount,
      indexCount,
      schemaVersion: this.getSchemaVersion(),
      dirtyCount,
      elementCount,
      walMode,
    };
  }

  // --------------------------------------------------------------------------
  // Browser-Specific Methods
  // --------------------------------------------------------------------------

  /**
   * Export the database as a Uint8Array (for download or manual backup)
   */
  export(): Uint8Array {
    return this.ensureOpen().export();
  }

  /**
   * Import a database from a Uint8Array
   * Warning: This replaces the current database entirely
   */
  async import(data: Uint8Array): Promise<void> {
    const SQL = (await import('sql.js')).default;
    const initSql = await SQL();

    const newDb = new initSql.Database(data);

    // Close old database
    if (this.db) {
      this.db.close();
    }

    this.db = newDb;
    this.scheduleAutoSave();
  }

  /**
   * Force immediate save to OPFS (bypasses debounce)
   */
  async forceSave(): Promise<void> {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    await this.persistToOpfs();
  }

  /**
   * Delete the database from OPFS
   */
  async deleteFromOpfs(): Promise<void> {
    if (this.opfsManager) {
      await this.opfsManager.delete();
    }
  }

  /**
   * Configure auto-save behavior
   */
  setAutoSave(enabled: boolean, debounceMs?: number): void {
    this.autoSave = enabled;
    if (debounceMs !== undefined) {
      this.autoSaveDebounceMs = debounceMs;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new browser storage backend.
 *
 * Note: This is an async factory because WASM loading and OPFS initialization
 * are both asynchronous operations.
 *
 * @param config - Storage configuration
 * @param wasmConfig - Optional WASM loading configuration
 * @returns Promise resolving to a storage backend instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const storage = await createBrowserStorage({ path: 'myapp.db' });
 *
 * // With custom WASM path
 * const storage = await createBrowserStorage(
 *   { path: 'myapp.db' },
 *   { wasmPath: '/assets/sql-wasm.wasm' }
 * );
 *
 * // In-memory (no persistence)
 * const storage = await createBrowserStorage({ path: ':memory:' });
 * ```
 */
export const createBrowserStorage: AsyncStorageFactory = async (
  config: StorageConfig
): Promise<StorageBackend> => {
  return BrowserStorageBackend.create(config);
};

/**
 * Create browser storage with custom WASM configuration
 */
export async function createBrowserStorageWithWasm(
  config: StorageConfig,
  wasmConfig: WasmConfig
): Promise<BrowserStorageBackend> {
  return BrowserStorageBackend.create(config, wasmConfig);
}
