/**
 * Storage Error Mapping
 *
 * Maps SQLite error codes and messages to Stoneforge error types.
 * This provides a consistent error interface regardless of the
 * underlying SQLite backend being used.
 */

import { StorageError, ConflictError, ConstraintError, ErrorCode } from '@stoneforge/core';

// ============================================================================
// SQLite Error Codes
// ============================================================================

/**
 * Common SQLite result codes that we need to handle
 * @see https://www.sqlite.org/rescode.html
 */
export const SqliteResultCode = {
  /** Generic error */
  ERROR: 1,
  /** Internal logic error */
  INTERNAL: 2,
  /** Access permission denied */
  PERM: 3,
  /** Callback routine requested an abort */
  ABORT: 4,
  /** Database file is locked */
  BUSY: 5,
  /** Table in the database is locked */
  LOCKED: 6,
  /** malloc() failed */
  NOMEM: 7,
  /** Attempt to write a readonly database */
  READONLY: 8,
  /** Operation terminated by interrupt */
  INTERRUPT: 9,
  /** Disk I/O error */
  IOERR: 10,
  /** Database disk image is malformed */
  CORRUPT: 11,
  /** NOT FOUND (internal use) */
  NOTFOUND: 12,
  /** Database or disk is full */
  FULL: 13,
  /** Unable to open database file */
  CANTOPEN: 14,
  /** Database lock protocol error */
  PROTOCOL: 15,
  /** Internal use only */
  EMPTY: 16,
  /** Database schema changed */
  SCHEMA: 17,
  /** String or BLOB exceeds size limit */
  TOOBIG: 18,
  /** Constraint violation */
  CONSTRAINT: 19,
  /** Data type mismatch */
  MISMATCH: 20,
  /** Library used incorrectly */
  MISUSE: 21,
  /** OS features not supported on host */
  NOLFS: 22,
  /** Authorization denied */
  AUTH: 23,
  /** Not used */
  FORMAT: 24,
  /** Invalid parameter */
  RANGE: 25,
  /** File opened that is not a database file */
  NOTADB: 26,
} as const;

export type SqliteResultCode = (typeof SqliteResultCode)[keyof typeof SqliteResultCode];

// ============================================================================
// Constraint Violation Detection
// ============================================================================

/**
 * Patterns for detecting specific constraint violations from error messages
 */
const CONSTRAINT_PATTERNS = {
  /** UNIQUE constraint violation */
  UNIQUE: /UNIQUE constraint failed/i,
  /** PRIMARY KEY constraint violation */
  PRIMARY_KEY: /PRIMARY KEY constraint failed/i,
  /** FOREIGN KEY constraint violation */
  FOREIGN_KEY: /FOREIGN KEY constraint failed/i,
  /** NOT NULL constraint violation */
  NOT_NULL: /NOT NULL constraint failed/i,
  /** CHECK constraint violation */
  CHECK: /CHECK constraint failed/i,
} as const;

/**
 * Extract table and column from constraint error message
 */
function parseConstraintError(message: string): { table?: string; column?: string } {
  // SQLite format: "UNIQUE constraint failed: tablename.columnname"
  const match = message.match(/constraint failed: (\w+)\.(\w+)/i);
  if (match) {
    return { table: match[1], column: match[2] };
  }
  return {};
}

// ============================================================================
// Error Detection
// ============================================================================

/**
 * Check if an error is a SQLite busy/locked error
 */
export function isBusyError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as { code?: number }).code;
    if (code === SqliteResultCode.BUSY || code === SqliteResultCode.LOCKED) {
      return true;
    }
    // Also check message for some backends
    if (/database is locked/i.test(error.message)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an error is a SQLite constraint violation
 */
export function isConstraintError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as { code?: number }).code;
    if (code === SqliteResultCode.CONSTRAINT) {
      return true;
    }
    // Check message patterns
    for (const pattern of Object.values(CONSTRAINT_PATTERNS)) {
      if (pattern.test(error.message)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if an error is a unique constraint violation
 */
export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      CONSTRAINT_PATTERNS.UNIQUE.test(error.message) ||
      CONSTRAINT_PATTERNS.PRIMARY_KEY.test(error.message)
    );
  }
  return false;
}

/**
 * Check if an error is a foreign key constraint violation
 */
export function isForeignKeyViolation(error: unknown): boolean {
  if (error instanceof Error) {
    return CONSTRAINT_PATTERNS.FOREIGN_KEY.test(error.message);
  }
  return false;
}

/**
 * Check if an error indicates database corruption
 */
export function isCorruptionError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as { code?: number }).code;
    if (code === SqliteResultCode.CORRUPT || code === SqliteResultCode.NOTADB) {
      return true;
    }
    if (/malformed|corrupt|not a database/i.test(error.message)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Error Conversion
// ============================================================================

/**
 * Convert a SQLite error to an appropriate Stoneforge error type
 *
 * @param error - The original SQLite error
 * @param context - Optional context about the operation that failed
 * @returns An StoneforgeError subclass with appropriate code and details
 */
export function mapStorageError(
  error: unknown,
  context?: { operation?: string; elementId?: string; table?: string }
): StorageError | ConflictError | ConstraintError {
  // Already an Stoneforge error, return as-is
  if (error instanceof StorageError || error instanceof ConflictError || error instanceof ConstraintError) {
    return error;
  }

  // Not an error object
  if (!(error instanceof Error)) {
    return new StorageError(
      `Storage operation failed: ${String(error)}`,
      ErrorCode.DATABASE_ERROR,
      { operation: context?.operation }
    );
  }

  const sqliteCode = (error as { code?: number }).code;
  const message = error.message;

  // Handle unique constraint violations
  if (isUniqueViolation(error)) {
    const { table, column } = parseConstraintError(message);
    return new ConflictError(
      `Element already exists${column ? ` (duplicate ${column})` : ''}`,
      ErrorCode.ALREADY_EXISTS,
      {
        elementId: context?.elementId,
        table: table ?? context?.table,
        column,
        operation: context?.operation,
      },
      error
    );
  }

  // Handle foreign key violations
  if (isForeignKeyViolation(error)) {
    return new ConstraintError(
      'Referenced element does not exist',
      ErrorCode.HAS_DEPENDENTS,
      {
        elementId: context?.elementId,
        operation: context?.operation,
      },
      error
    );
  }

  // Handle other constraint violations
  if (isConstraintError(error)) {
    const { table, column } = parseConstraintError(message);
    return new ConstraintError(
      `Database constraint violation: ${message}`,
      ErrorCode.HAS_DEPENDENTS,
      {
        table: table ?? context?.table,
        column,
        operation: context?.operation,
      },
      error
    );
  }

  // Handle busy/locked errors
  if (isBusyError(error)) {
    return new StorageError(
      'Database is busy. Please retry the operation.',
      ErrorCode.DATABASE_BUSY,
      {
        operation: context?.operation,
        retryable: true,
      },
      error
    );
  }

  // Handle corruption errors
  if (isCorruptionError(error)) {
    return new StorageError(
      'Database is corrupted or not a valid database file',
      ErrorCode.DATABASE_ERROR,
      {
        operation: context?.operation,
        corrupted: true,
      },
      error
    );
  }

  // Generic storage error for everything else
  return new StorageError(
    `Database operation failed: ${message}`,
    ErrorCode.DATABASE_ERROR,
    {
      sqliteCode,
      operation: context?.operation,
      elementId: context?.elementId,
    },
    error
  );
}

// ============================================================================
// Error Helper Functions
// ============================================================================

/**
 * Create a storage error for a failed query
 */
export function queryError(error: unknown): StorageError {
  return mapStorageError(error, { operation: 'query' }) as StorageError;
}

/**
 * Create a storage error for a failed mutation
 */
export function mutationError(operation: string, elementId: string | undefined, error: unknown): StorageError | ConflictError | ConstraintError {
  return mapStorageError(error, { operation, elementId });
}

/**
 * Create a storage error for connection failures
 */
export function connectionError(path: string, error: unknown): StorageError {
  if (!(error instanceof Error)) {
    return new StorageError(
      `Failed to open database at ${path}: ${String(error)}`,
      ErrorCode.DATABASE_ERROR,
      { path }
    );
  }

  return new StorageError(
    `Failed to open database at ${path}: ${error.message}`,
    ErrorCode.DATABASE_ERROR,
    { path },
    error
  );
}

/**
 * Create a storage error for schema migration failures
 */
export function migrationError(version: number, error: unknown): StorageError {
  const cause = error instanceof Error ? error : undefined;
  return new StorageError(
    `Failed to apply migration version ${version}: ${cause?.message ?? String(error)}`,
    ErrorCode.DATABASE_ERROR,
    { version, operation: 'migrate' },
    cause
  );
}
