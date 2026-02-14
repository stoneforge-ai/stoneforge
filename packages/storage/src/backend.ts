/**
 * Storage Backend Interface
 *
 * Defines the unified interface that all storage backends must implement.
 * This abstraction allows Stoneforge to work across different runtimes:
 * - Bun (bun:sqlite)
 * - Node.js (better-sqlite3)
 * - Deno (@db/sqlite)
 * - Browser (sql.js + OPFS)
 */

import type {
  Row,
  MutationResult,
  PreparedStatement,
  Transaction,
  TransactionOptions,
  StorageConfig,
  Migration,
  MigrationResult,
  DirtyElement,
  DirtyTrackingOptions,
} from './types.js';

// ============================================================================
// Storage Backend Interface
// ============================================================================

/**
 * The core storage backend interface.
 *
 * All storage implementations must provide these methods with consistent
 * behavior across runtimes. The interface is synchronous by design as
 * SQLite operations are inherently synchronous, but async wrappers can
 * be built on top for specific use cases.
 */
export interface StorageBackend {
  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  /**
   * Check if the database connection is open
   */
  readonly isOpen: boolean;

  /**
   * Get the path to the database file
   */
  readonly path: string;

  /**
   * Close the database connection.
   * After closing, no further operations can be performed.
   */
  close(): void;

  // --------------------------------------------------------------------------
  // SQL Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a SQL statement without returning results.
   * Use for DDL statements (CREATE, DROP, ALTER) and batch operations.
   *
   * @param sql - The SQL statement to execute
   * @throws StorageError on SQL syntax error or constraint violation
   */
  exec(sql: string): void;

  /**
   * Execute a parameterized query and return all matching rows.
   *
   * @param sql - The SQL query with ? placeholders
   * @param params - Parameter values to bind to placeholders
   * @returns Array of row objects
   * @throws StorageError on query error
   */
  query<T extends Row = Row>(sql: string, params?: unknown[]): T[];

  /**
   * Execute a parameterized query and return the first matching row.
   *
   * @param sql - The SQL query with ? placeholders
   * @param params - Parameter values to bind to placeholders
   * @returns The first row or undefined if no match
   * @throws StorageError on query error
   */
  queryOne<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined;

  /**
   * Execute a parameterized mutation (INSERT, UPDATE, DELETE).
   *
   * @param sql - The SQL statement with ? placeholders
   * @param params - Parameter values to bind to placeholders
   * @returns Mutation result with changes count and last insert ID
   * @throws StorageError on constraint violation or error
   */
  run(sql: string, params?: unknown[]): MutationResult;

  // --------------------------------------------------------------------------
  // Prepared Statements
  // --------------------------------------------------------------------------

  /**
   * Create a prepared statement for repeated execution.
   * Prepared statements are more efficient for repeated queries.
   *
   * @param sql - The SQL statement with ? placeholders
   * @returns A prepared statement object
   * @throws StorageError on SQL syntax error
   */
  prepare<T extends Row = Row>(sql: string): PreparedStatement<T>;

  // --------------------------------------------------------------------------
  // Transactions
  // --------------------------------------------------------------------------

  /**
   * Execute a function within a database transaction.
   *
   * The transaction is automatically committed if the function completes
   * successfully, or rolled back if an error is thrown.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options (isolation level)
   * @returns The return value of the function
   * @throws The original error after rollback
   */
  transaction<T>(fn: (tx: Transaction) => T, options?: TransactionOptions): T;

  /**
   * Check if currently inside a transaction
   */
  readonly inTransaction: boolean;

  // --------------------------------------------------------------------------
  // Schema Management
  // --------------------------------------------------------------------------

  /**
   * Get the current schema version
   */
  getSchemaVersion(): number;

  /**
   * Set the schema version
   */
  setSchemaVersion(version: number): void;

  /**
   * Run pending migrations to bring schema up to date
   *
   * @param migrations - Array of migrations to apply
   * @returns Result indicating which migrations were applied
   */
  migrate(migrations: Migration[]): MigrationResult;

  // --------------------------------------------------------------------------
  // Dirty Tracking
  // --------------------------------------------------------------------------

  /**
   * Mark an element as dirty (modified since last export)
   *
   * @param elementId - The element ID to mark dirty
   */
  markDirty(elementId: string): void;

  /**
   * Get all dirty elements since last export
   *
   * @param options - Options for filtering dirty elements
   * @returns Array of dirty element records
   */
  getDirtyElements(options?: DirtyTrackingOptions): DirtyElement[];

  /**
   * Clear all dirty tracking records
   */
  clearDirty(): void;

  /**
   * Clear dirty status for specific elements
   *
   * @param elementIds - Element IDs to clear dirty status for
   */
  clearDirtyElements(elementIds: string[]): void;

  // --------------------------------------------------------------------------
  // Hierarchical ID Support
  // --------------------------------------------------------------------------

  /**
   * Get the next child number for a parent element atomically.
   *
   * This method atomically increments the child counter for the given parent
   * and returns the new value. If no counter exists for the parent, it creates
   * one starting at 1.
   *
   * @param parentId - The ID of the parent element
   * @returns The next child number (starting from 1)
   * @throws StorageError on database error
   */
  getNextChildNumber(parentId: string): number;

  /**
   * Get the current child counter for a parent element without incrementing.
   *
   * @param parentId - The ID of the parent element
   * @returns The current child counter, or 0 if no children exist
   */
  getChildCounter(parentId: string): number;

  /**
   * Reset the child counter for a parent element.
   *
   * @param parentId - The ID of the parent element
   */
  resetChildCounter(parentId: string): void;

  // --------------------------------------------------------------------------
  // Element Count (for ID generation)
  // --------------------------------------------------------------------------

  /**
   * Get the total number of elements in the database.
   *
   * This is an efficient method for ID length calculation that only
   * queries the element count without computing other statistics.
   *
   * @returns The total number of elements, or 0 if elements table doesn't exist
   */
  getElementCount(): number;

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Check database integrity
   *
   * @returns true if database passes integrity check
   */
  checkIntegrity(): boolean;

  /**
   * Optimize the database (VACUUM, ANALYZE)
   */
  optimize(): void;

  /**
   * Get database statistics
   */
  getStats(): StorageStats;
}

// ============================================================================
// Storage Statistics
// ============================================================================

/**
 * Database statistics for monitoring and diagnostics
 */
export interface StorageStats {
  /** Database file size in bytes */
  fileSize: number;
  /** Number of tables in the database */
  tableCount: number;
  /** Number of indexes in the database */
  indexCount: number;
  /** Current schema version */
  schemaVersion: number;
  /** Number of dirty elements pending export */
  dirtyCount: number;
  /** Total number of elements in the database */
  elementCount: number;
  /** Whether the database is in WAL mode */
  walMode: boolean;
}

// ============================================================================
// Storage Factory
// ============================================================================

/**
 * Factory function type for creating storage backends.
 * Each runtime provides its own implementation.
 */
export type StorageFactory = (config: StorageConfig) => StorageBackend;

/**
 * Async factory for backends that require async initialization (browser)
 */
export type AsyncStorageFactory = (config: StorageConfig) => Promise<StorageBackend>;
