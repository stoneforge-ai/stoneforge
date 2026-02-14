/**
 * Bun SQLite Backend Implementation
 *
 * Implements the StorageBackend interface using Bun's native SQLite bindings.
 * This is the fastest backend option, optimized for Bun runtime.
 */

import { Database, type Statement, type SQLQueryBindings } from 'bun:sqlite';
import type {
  StorageBackend,
  StorageStats,
  StorageFactory,
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

// Type alias for SQLite parameter bindings
type SqlParams = SQLQueryBindings[];

// ============================================================================
// Prepared Statement Wrapper
// ============================================================================

/**
 * Wraps a Bun SQLite Statement to implement PreparedStatement interface
 */
class BunPreparedStatement<T extends Row = Row> implements PreparedStatement<T> {
  constructor(private stmt: Statement<T>) {}

  all(...params: unknown[]): T[] {
    return this.stmt.all(...(params as SqlParams)) as T[];
  }

  get(...params: unknown[]): T | undefined {
    return this.stmt.get(...(params as SqlParams)) as T | undefined;
  }

  run(...params: unknown[]): MutationResult {
    const result = this.stmt.run(...(params as SqlParams));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  finalize(): void {
    this.stmt.finalize();
  }
}

// ============================================================================
// Transaction Implementation
// ============================================================================

/**
 * Transaction context for Bun SQLite
 */
class BunTransaction implements Transaction {
  constructor(private db: Database) {}

  exec(sql: string): void {
    this.db.run(sql);
  }

  query<T extends Row = Row>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.all(...(params as SqlParams)) : stmt.all()) as T[];
  }

  queryOne<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.get(...(params as SqlParams)) : stmt.get()) as T | undefined;
  }

  run(sql: string, params?: unknown[]): MutationResult {
    const stmt = this.db.prepare(sql);
    const result = params ? stmt.run(...(params as SqlParams)) : stmt.run();
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
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
// Bun Storage Backend
// ============================================================================

/**
 * Bun SQLite storage backend implementation
 */
export class BunStorageBackend implements StorageBackend {
  private db: Database | null;
  private _path: string;
  private _inTransaction: boolean = false;

  constructor(config: StorageConfig) {
    this._path = config.path;

    try {
      this.db = new Database(config.path, {
        create: config.create ?? true,
        readonly: config.readonly ?? false,
      });

      // Apply pragmas
      this.applyPragmas(config.pragmas);

      // Initialize dirty tracking table if it doesn't exist
      this.initDirtyTable();
    } catch (error) {
      throw connectionError(config.path, error);
    }
  }

  private applyPragmas(pragmas?: SqlitePragmas): void {
    const settings = { ...DEFAULT_PRAGMAS, ...pragmas };

    if (!this.db) return;

    // Apply journal mode
    this.db.run(`PRAGMA journal_mode = ${settings.journal_mode}`);

    // Apply synchronous
    this.db.run(`PRAGMA synchronous = ${settings.synchronous}`);

    // Apply foreign keys
    this.db.run(`PRAGMA foreign_keys = ${settings.foreign_keys ? 'ON' : 'OFF'}`);

    // Apply busy timeout
    this.db.run(`PRAGMA busy_timeout = ${settings.busy_timeout}`);

    // Apply cache size
    this.db.run(`PRAGMA cache_size = ${settings.cache_size}`);

    // Apply temp store
    this.db.run(`PRAGMA temp_store = ${settings.temp_store === 'memory' ? 2 : settings.temp_store === 'file' ? 1 : 0}`);
  }

  private initDirtyTable(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dirty_elements (
        element_id TEXT PRIMARY KEY,
        marked_at TEXT NOT NULL
      )
    `);
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
    if (this.db) {
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
      this.ensureOpen().exec(sql);
    } catch (error) {
      throw mapStorageError(error, { operation: 'exec' });
    }
  }

  query<T extends Row = Row>(sql: string, params?: unknown[]): T[] {
    try {
      const db = this.ensureOpen();
      const stmt = db.prepare(sql);
      return (params ? stmt.all(...(params as SqlParams)) : stmt.all()) as T[];
    } catch (error) {
      throw mapStorageError(error, { operation: 'query' });
    }
  }

  queryOne<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined {
    try {
      const db = this.ensureOpen();
      const stmt = db.prepare(sql);
      return (params ? stmt.get(...(params as SqlParams)) : stmt.get()) as T | undefined;
    } catch (error) {
      throw mapStorageError(error, { operation: 'queryOne' });
    }
  }

  run(sql: string, params?: unknown[]): MutationResult {
    try {
      const db = this.ensureOpen();
      const stmt = db.prepare(sql);
      // Convert undefined values to null (SQLite doesn't accept undefined)
      const safeParams = params?.map((p) => (p === undefined ? null : p)) as SqlParams | undefined;
      const result = safeParams ? stmt.run(...safeParams) : stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
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
      return new BunPreparedStatement<T>(stmt as Statement<T>);
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

    // Map isolation level to SQL
    const beginSql = this.getBeginSql(isolation);

    this._inTransaction = true;
    try {
      db.exec(beginSql);
      const tx = new BunTransaction(db);
      const result = fn(tx);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
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
    const result = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
    return result?.user_version ?? 0;
  }

  setSchemaVersion(version: number): void {
    const db = this.ensureOpen();
    db.exec(`PRAGMA user_version = ${version}`);
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
      db.prepare(
        'INSERT OR REPLACE INTO dirty_elements (element_id, marked_at) VALUES (?, ?)'
      ).run(elementId, now);
    } catch (error) {
      throw mapStorageError(error, { operation: 'markDirty', elementId });
    }
  }

  getDirtyElements(_options?: DirtyTrackingOptions): DirtyElement[] {
    try {
      const db = this.ensureOpen();
      const rows = db.prepare(
        'SELECT element_id, marked_at FROM dirty_elements ORDER BY marked_at'
      ).all() as Array<{ element_id: string; marked_at: string }>;

      return rows.map(row => ({
        elementId: row.element_id as DirtyElement['elementId'],
        markedAt: row.marked_at,
      }));
    } catch (error) {
      throw mapStorageError(error, { operation: 'getDirtyElements' });
    }
  }

  clearDirty(): void {
    try {
      this.ensureOpen().exec('DELETE FROM dirty_elements');
    } catch (error) {
      throw mapStorageError(error, { operation: 'clearDirty' });
    }
  }

  clearDirtyElements(elementIds: string[]): void {
    if (elementIds.length === 0) return;

    try {
      const db = this.ensureOpen();
      const placeholders = elementIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM dirty_elements WHERE element_id IN (${placeholders})`
      ).run(...elementIds);
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
      // Use INSERT OR REPLACE with a subquery to atomically increment
      // If the row doesn't exist, it will be created with last_child = 1
      // If it exists, last_child will be incremented
      db.prepare(`
        INSERT INTO child_counters (parent_id, last_child)
        VALUES (?, 1)
        ON CONFLICT(parent_id) DO UPDATE SET last_child = last_child + 1
      `).run(parentId);

      // Read back the new value
      const result = db.prepare(
        'SELECT last_child FROM child_counters WHERE parent_id = ?'
      ).get(parentId) as { last_child: number } | undefined;

      return result?.last_child ?? 1;
    } catch (error) {
      throw mapStorageError(error, { operation: 'getNextChildNumber', elementId: parentId });
    }
  }

  getChildCounter(parentId: string): number {
    try {
      const db = this.ensureOpen();
      const result = db.prepare(
        'SELECT last_child FROM child_counters WHERE parent_id = ?'
      ).get(parentId) as { last_child: number } | undefined;

      return result?.last_child ?? 0;
    } catch (error) {
      throw mapStorageError(error, { operation: 'getChildCounter', elementId: parentId });
    }
  }

  resetChildCounter(parentId: string): void {
    try {
      const db = this.ensureOpen();
      db.prepare('DELETE FROM child_counters WHERE parent_id = ?').run(parentId);
    } catch (error) {
      throw mapStorageError(error, { operation: 'resetChildCounter', elementId: parentId });
    }
  }

  // --------------------------------------------------------------------------
  // Element Count (for ID generation)
  // --------------------------------------------------------------------------

  getElementCount(): number {
    try {
      const db = this.ensureOpen();
      const result = db.prepare(
        'SELECT COUNT(*) as count FROM elements'
      ).get() as { count: number } | undefined;
      return result?.count ?? 0;
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
      const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string } | undefined;
      return result?.integrity_check === 'ok';
    } catch {
      return false;
    }
  }

  optimize(): void {
    try {
      const db = this.ensureOpen();
      db.exec('VACUUM');
      db.exec('ANALYZE');
    } catch (error) {
      throw mapStorageError(error, { operation: 'optimize' });
    }
  }

  getStats(): StorageStats {
    const db = this.ensureOpen();

    // Get file size (0 for in-memory)
    let fileSize = 0;
    if (this._path !== ':memory:') {
      try {
        const file = Bun.file(this._path);
        fileSize = file.size;
      } catch {
        fileSize = 0;
      }
    }

    // Count tables
    const tableCount = (db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table'"
    ).get() as { count: number })?.count ?? 0;

    // Count indexes
    const indexCount = (db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index'"
    ).get() as { count: number })?.count ?? 0;

    // Count dirty elements
    const dirtyCount = (db.prepare(
      'SELECT COUNT(*) as count FROM dirty_elements'
    ).get() as { count: number })?.count ?? 0;

    // Count elements (if table exists)
    let elementCount = 0;
    try {
      const result = db.prepare(
        'SELECT COUNT(*) as count FROM elements'
      ).get() as { count: number } | undefined;
      elementCount = result?.count ?? 0;
    } catch {
      // Table doesn't exist yet
    }

    // Check WAL mode
    const journalMode = (db.prepare(
      'PRAGMA journal_mode'
    ).get() as { journal_mode: string })?.journal_mode ?? '';
    const walMode = journalMode.toLowerCase() === 'wal';

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
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Bun storage backend
 */
export const createBunStorage: StorageFactory = (config: StorageConfig): StorageBackend => {
  return new BunStorageBackend(config);
};
