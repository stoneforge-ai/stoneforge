/**
 * Tests for Storage Error Mapping
 *
 * Validates that SQLite errors are correctly mapped to Stoneforge error types.
 */

import { describe, it, expect } from 'bun:test';
import {
  SqliteResultCode,
  isBusyError,
  isConstraintError,
  isUniqueViolation,
  isForeignKeyViolation,
  isCorruptionError,
  mapStorageError,
  queryError,
  mutationError,
  connectionError,
  migrationError,
} from './errors.js';
import { StorageError, ConflictError, ConstraintError, ErrorCode } from '@stoneforge/core';

describe('SqliteResultCode', () => {
  it('should have correct values for common codes', () => {
    expect(SqliteResultCode.ERROR).toBe(1);
    expect(SqliteResultCode.BUSY).toBe(5);
    expect(SqliteResultCode.LOCKED).toBe(6);
    expect(SqliteResultCode.CONSTRAINT).toBe(19);
    expect(SqliteResultCode.CORRUPT).toBe(11);
    expect(SqliteResultCode.NOTADB).toBe(26);
  });
});

describe('isBusyError', () => {
  it('should detect BUSY error by code', () => {
    const error = Object.assign(new Error('busy'), { code: SqliteResultCode.BUSY });
    expect(isBusyError(error)).toBe(true);
  });

  it('should detect LOCKED error by code', () => {
    const error = Object.assign(new Error('locked'), { code: SqliteResultCode.LOCKED });
    expect(isBusyError(error)).toBe(true);
  });

  it('should detect busy error by message', () => {
    const error = new Error('database is locked');
    expect(isBusyError(error)).toBe(true);
  });

  it('should return false for non-busy errors', () => {
    const error = new Error('some other error');
    expect(isBusyError(error)).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isBusyError('string')).toBe(false);
    expect(isBusyError(null)).toBe(false);
    expect(isBusyError(undefined)).toBe(false);
    expect(isBusyError(42)).toBe(false);
  });
});

describe('isConstraintError', () => {
  it('should detect CONSTRAINT error by code', () => {
    const error = Object.assign(new Error('constraint'), { code: SqliteResultCode.CONSTRAINT });
    expect(isConstraintError(error)).toBe(true);
  });

  it('should detect UNIQUE constraint by message', () => {
    const error = new Error('UNIQUE constraint failed: elements.id');
    expect(isConstraintError(error)).toBe(true);
  });

  it('should detect PRIMARY KEY constraint by message', () => {
    const error = new Error('PRIMARY KEY constraint failed');
    expect(isConstraintError(error)).toBe(true);
  });

  it('should detect FOREIGN KEY constraint by message', () => {
    const error = new Error('FOREIGN KEY constraint failed');
    expect(isConstraintError(error)).toBe(true);
  });

  it('should detect NOT NULL constraint by message', () => {
    const error = new Error('NOT NULL constraint failed: elements.type');
    expect(isConstraintError(error)).toBe(true);
  });

  it('should detect CHECK constraint by message', () => {
    const error = new Error('CHECK constraint failed');
    expect(isConstraintError(error)).toBe(true);
  });

  it('should return false for non-constraint errors', () => {
    const error = new Error('some other error');
    expect(isConstraintError(error)).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('should detect UNIQUE constraint violation', () => {
    const error = new Error('UNIQUE constraint failed: elements.id');
    expect(isUniqueViolation(error)).toBe(true);
  });

  it('should detect PRIMARY KEY violation', () => {
    const error = new Error('PRIMARY KEY constraint failed: elements.id');
    expect(isUniqueViolation(error)).toBe(true);
  });

  it('should return false for other constraint types', () => {
    const error = new Error('FOREIGN KEY constraint failed');
    expect(isUniqueViolation(error)).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isUniqueViolation('string')).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('isForeignKeyViolation', () => {
  it('should detect FOREIGN KEY constraint violation', () => {
    const error = new Error('FOREIGN KEY constraint failed');
    expect(isForeignKeyViolation(error)).toBe(true);
  });

  it('should return false for UNIQUE constraint', () => {
    const error = new Error('UNIQUE constraint failed');
    expect(isForeignKeyViolation(error)).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isForeignKeyViolation(null)).toBe(false);
  });
});

describe('isCorruptionError', () => {
  it('should detect CORRUPT error by code', () => {
    const error = Object.assign(new Error('corrupt'), { code: SqliteResultCode.CORRUPT });
    expect(isCorruptionError(error)).toBe(true);
  });

  it('should detect NOTADB error by code', () => {
    const error = Object.assign(new Error('not a db'), { code: SqliteResultCode.NOTADB });
    expect(isCorruptionError(error)).toBe(true);
  });

  it('should detect corruption by message', () => {
    expect(isCorruptionError(new Error('database disk image is malformed'))).toBe(true);
    expect(isCorruptionError(new Error('file is not a database'))).toBe(true);
    expect(isCorruptionError(new Error('database file is corrupt'))).toBe(true);
  });

  it('should return false for non-corruption errors', () => {
    const error = new Error('some other error');
    expect(isCorruptionError(error)).toBe(false);
  });
});

describe('mapStorageError', () => {
  it('should return existing StoneforgeError unchanged', () => {
    const original = new StorageError('test', ErrorCode.DATABASE_ERROR);
    const mapped = mapStorageError(original);
    expect(mapped).toBe(original);
  });

  it('should return existing ConflictError unchanged', () => {
    const original = new ConflictError('test', ErrorCode.ALREADY_EXISTS);
    const mapped = mapStorageError(original);
    expect(mapped).toBe(original);
  });

  it('should map unique constraint to ConflictError', () => {
    const error = new Error('UNIQUE constraint failed: elements.id');
    const mapped = mapStorageError(error, { elementId: 'el-abc' });

    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped.code).toBe(ErrorCode.ALREADY_EXISTS);
    expect(mapped.details.elementId).toBe('el-abc');
    expect(mapped.details.column).toBe('id');
    expect(mapped.details.table).toBe('elements');
  });

  it('should map foreign key violation to ConstraintError', () => {
    const error = new Error('FOREIGN KEY constraint failed');
    const mapped = mapStorageError(error);

    expect(mapped).toBeInstanceOf(ConstraintError);
    expect(mapped.code).toBe(ErrorCode.HAS_DEPENDENTS);
  });

  it('should map busy error to StorageError with DATABASE_BUSY code', () => {
    const error = Object.assign(new Error('database is locked'), { code: SqliteResultCode.BUSY });
    const mapped = mapStorageError(error);

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.code).toBe(ErrorCode.DATABASE_BUSY);
    expect(mapped.details.retryable).toBe(true);
  });

  it('should map corruption error to StorageError', () => {
    const error = new Error('database disk image is malformed');
    const mapped = mapStorageError(error);

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(mapped.details.corrupted).toBe(true);
  });

  it('should map unknown error to generic StorageError', () => {
    const error = new Error('some unknown error');
    const mapped = mapStorageError(error, { operation: 'test' });

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(mapped.details.operation).toBe('test');
  });

  it('should handle non-Error values', () => {
    const mapped = mapStorageError('string error');
    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.message).toContain('string error');
  });

  it('should include context in mapped errors', () => {
    const error = new Error('test error');
    const mapped = mapStorageError(error, {
      operation: 'insert',
      elementId: 'el-123',
      table: 'elements',
    });

    expect(mapped.details.operation).toBe('insert');
    expect(mapped.details.elementId).toBe('el-123');
  });
});

describe('queryError', () => {
  it('should create StorageError for query failures', () => {
    const error = new Error('syntax error');
    const mapped = queryError(error);

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.details.operation).toBe('query');
  });
});

describe('mutationError', () => {
  it('should create error with operation and element context', () => {
    const error = new Error('UNIQUE constraint failed: elements.id');
    const mapped = mutationError('insert', 'el-abc', error);

    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped.details.operation).toBe('insert');
    expect(mapped.details.elementId).toBe('el-abc');
  });

  it('should handle undefined elementId', () => {
    const error = new Error('test error');
    const mapped = mutationError('update', undefined, error);

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.details.operation).toBe('update');
  });
});

describe('connectionError', () => {
  it('should create StorageError with path', () => {
    const error = new Error('file not found');
    const mapped = connectionError('/tmp/test.db', error);

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.message).toContain('/tmp/test.db');
    expect(mapped.details.path).toBe('/tmp/test.db');
  });

  it('should handle non-Error values', () => {
    const mapped = connectionError('/tmp/test.db', 'ENOENT');

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.message).toContain('ENOENT');
    expect(mapped.details.path).toBe('/tmp/test.db');
  });
});

describe('migrationError', () => {
  it('should create StorageError with version', () => {
    const error = new Error('syntax error in migration');
    const mapped = migrationError(5, error);

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.message).toContain('version 5');
    expect(mapped.details.version).toBe(5);
    expect(mapped.details.operation).toBe('migrate');
    expect(mapped.cause).toBe(error);
  });

  it('should handle non-Error values', () => {
    const mapped = migrationError(3, 'failed');

    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.message).toContain('version 3');
  });
});
