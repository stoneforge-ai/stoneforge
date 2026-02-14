import { describe, it, expect } from 'bun:test';
import {
  StoneforgeError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ConstraintError,
  StorageError,
  isStoneforgeError,
  isValidationError,
  isNotFoundError,
  isConflictError,
  isConstraintError,
  isStorageError,
  hasErrorCode,
} from './error.js';
import { ErrorCode, ErrorHttpStatus } from './codes.js';

describe('StoneforgeError', () => {
  describe('constructor', () => {
    it('should create error with required parameters', () => {
      const error = new StoneforgeError('Test error', ErrorCode.INVALID_INPUT);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.details).toEqual({});
      expect(error.name).toBe('StoneforgeError');
      expect(error.httpStatus).toBe(400);
    });

    it('should create error with details', () => {
      const details = { field: 'title', value: 'too long' };
      const error = new StoneforgeError('Test error', ErrorCode.TITLE_TOO_LONG, details);

      expect(error.details).toEqual(details);
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new StoneforgeError('Wrapped error', ErrorCode.DATABASE_ERROR, {}, cause);

      expect(error.cause).toBe(cause);
    });

    it('should extend Error', () => {
      const error = new StoneforgeError('Test', ErrorCode.NOT_FOUND);
      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct HTTP status for each error code', () => {
      for (const code of Object.values(ErrorCode)) {
        const error = new StoneforgeError('Test', code);
        expect(error.httpStatus).toBe(ErrorHttpStatus[code]);
      }
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const error = new StoneforgeError(
        'Element not found',
        ErrorCode.NOT_FOUND,
        { elementId: 'el-abc123' }
      );

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'StoneforgeError',
        message: 'Element not found',
        code: 'NOT_FOUND',
        details: { elementId: 'el-abc123' },
        httpStatus: 404,
      });
    });

    it('should produce JSON-serializable output', () => {
      const error = new StoneforgeError('Test', ErrorCode.INVALID_INPUT, {
        value: { nested: true },
      });

      const json = JSON.stringify(error.toJSON());
      const parsed = JSON.parse(json);

      expect(parsed.details.value).toEqual({ nested: true });
    });
  });
});

describe('ValidationError', () => {
  it('should create validation error with default code', () => {
    const error = new ValidationError('Invalid input');

    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    expect(error.name).toBe('ValidationError');
    expect(error).toBeInstanceOf(StoneforgeError);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should create validation error with specific code', () => {
    const error = new ValidationError('Invalid ID', ErrorCode.INVALID_ID);

    expect(error.code).toBe(ErrorCode.INVALID_ID);
  });

  it('should inherit from StoneforgeError', () => {
    const error = new ValidationError('Test');
    expect(error).toBeInstanceOf(StoneforgeError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('should create not found error with default code', () => {
    const error = new NotFoundError('Resource not found');

    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.name).toBe('NotFoundError');
    expect(error).toBeInstanceOf(StoneforgeError);
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('should create not found error with specific code', () => {
    const error = new NotFoundError('Entity not found', ErrorCode.ENTITY_NOT_FOUND);

    expect(error.code).toBe(ErrorCode.ENTITY_NOT_FOUND);
  });
});

describe('ConflictError', () => {
  it('should create conflict error', () => {
    const error = new ConflictError('Duplicate entry', ErrorCode.ALREADY_EXISTS);

    expect(error.code).toBe(ErrorCode.ALREADY_EXISTS);
    expect(error.name).toBe('ConflictError');
    expect(error).toBeInstanceOf(StoneforgeError);
    expect(error).toBeInstanceOf(ConflictError);
  });

  it('should handle cycle detection', () => {
    const error = new ConflictError(
      'Cycle detected',
      ErrorCode.CYCLE_DETECTED,
      { blockedId: 'el-a', blockerId: 'el-b' }
    );

    expect(error.code).toBe(ErrorCode.CYCLE_DETECTED);
    expect(error.details.blockedId).toBe('el-a');
    expect(error.details.blockerId).toBe('el-b');
  });
});

describe('ConstraintError', () => {
  it('should create constraint error', () => {
    const error = new ConstraintError('Cannot modify', ErrorCode.IMMUTABLE);

    expect(error.code).toBe(ErrorCode.IMMUTABLE);
    expect(error.name).toBe('ConstraintError');
    expect(error).toBeInstanceOf(StoneforgeError);
    expect(error).toBeInstanceOf(ConstraintError);
  });

  it('should handle has dependents error', () => {
    const error = new ConstraintError(
      'Has dependents',
      ErrorCode.HAS_DEPENDENTS,
      { elementId: 'el-abc', actual: 3 }
    );

    expect(error.code).toBe(ErrorCode.HAS_DEPENDENTS);
    expect(error.details.actual).toBe(3);
  });
});

describe('StorageError', () => {
  it('should create storage error with default code', () => {
    const error = new StorageError('Database failed');

    expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(error.name).toBe('StorageError');
    expect(error).toBeInstanceOf(StoneforgeError);
    expect(error).toBeInstanceOf(StorageError);
  });

  it('should preserve original error as cause', () => {
    const sqliteError = new Error('SQLITE_BUSY');
    const error = new StorageError('Database busy', ErrorCode.DATABASE_ERROR, {}, sqliteError);

    expect(error.cause).toBe(sqliteError);
  });

  it('should handle migration errors', () => {
    const error = new StorageError(
      'Migration failed',
      ErrorCode.MIGRATION_FAILED,
      { version: 5 }
    );

    expect(error.code).toBe(ErrorCode.MIGRATION_FAILED);
    expect(error.details.version).toBe(5);
  });
});

describe('Type Guards', () => {
  describe('isStoneforgeError', () => {
    it('should return true for StoneforgeError', () => {
      expect(isStoneforgeError(new StoneforgeError('Test', ErrorCode.NOT_FOUND))).toBe(true);
    });

    it('should return true for error subclasses', () => {
      expect(isStoneforgeError(new ValidationError('Test'))).toBe(true);
      expect(isStoneforgeError(new NotFoundError('Test'))).toBe(true);
      expect(isStoneforgeError(new ConflictError('Test', ErrorCode.ALREADY_EXISTS))).toBe(true);
      expect(isStoneforgeError(new ConstraintError('Test', ErrorCode.IMMUTABLE))).toBe(true);
      expect(isStoneforgeError(new StorageError('Test'))).toBe(true);
    });

    it('should return false for regular Error', () => {
      expect(isStoneforgeError(new Error('Test'))).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isStoneforgeError(null)).toBe(false);
      expect(isStoneforgeError(undefined)).toBe(false);
      expect(isStoneforgeError('error')).toBe(false);
      expect(isStoneforgeError({ message: 'Test', code: 'NOT_FOUND' })).toBe(false);
    });
  });

  describe('isValidationError', () => {
    it('should return true for ValidationError', () => {
      expect(isValidationError(new ValidationError('Test'))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isValidationError(new NotFoundError('Test'))).toBe(false);
      expect(isValidationError(new StoneforgeError('Test', ErrorCode.NOT_FOUND))).toBe(false);
      expect(isValidationError(new Error('Test'))).toBe(false);
    });
  });

  describe('isNotFoundError', () => {
    it('should return true for NotFoundError', () => {
      expect(isNotFoundError(new NotFoundError('Test'))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isNotFoundError(new ValidationError('Test'))).toBe(false);
      expect(isNotFoundError(new StoneforgeError('Test', ErrorCode.NOT_FOUND))).toBe(false);
    });
  });

  describe('isConflictError', () => {
    it('should return true for ConflictError', () => {
      expect(isConflictError(new ConflictError('Test', ErrorCode.ALREADY_EXISTS))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isConflictError(new ValidationError('Test'))).toBe(false);
    });
  });

  describe('isConstraintError', () => {
    it('should return true for ConstraintError', () => {
      expect(isConstraintError(new ConstraintError('Test', ErrorCode.IMMUTABLE))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isConstraintError(new ConflictError('Test', ErrorCode.ALREADY_EXISTS))).toBe(false);
    });
  });

  describe('isStorageError', () => {
    it('should return true for StorageError', () => {
      expect(isStorageError(new StorageError('Test'))).toBe(true);
    });

    it('should return false for other error types', () => {
      expect(isStorageError(new ValidationError('Test'))).toBe(false);
    });
  });

  describe('hasErrorCode', () => {
    it('should return true when error has matching code', () => {
      const error = new StoneforgeError('Test', ErrorCode.NOT_FOUND);
      expect(hasErrorCode(error, ErrorCode.NOT_FOUND)).toBe(true);
    });

    it('should return false when error has different code', () => {
      const error = new StoneforgeError('Test', ErrorCode.NOT_FOUND);
      expect(hasErrorCode(error, ErrorCode.INVALID_INPUT)).toBe(false);
    });

    it('should return false for non-StoneforgeError', () => {
      expect(hasErrorCode(new Error('Test'), ErrorCode.NOT_FOUND)).toBe(false);
    });

    it('should work with error subclasses', () => {
      const error = new ValidationError('Test', ErrorCode.INVALID_ID);
      expect(hasErrorCode(error, ErrorCode.INVALID_ID)).toBe(true);
      expect(hasErrorCode(error, ErrorCode.INVALID_INPUT)).toBe(false);
    });
  });
});

describe('Error hierarchy', () => {
  it('should maintain proper inheritance chain', () => {
    const validation = new ValidationError('Test');
    const notFound = new NotFoundError('Test');
    const conflict = new ConflictError('Test', ErrorCode.ALREADY_EXISTS);
    const constraint = new ConstraintError('Test', ErrorCode.IMMUTABLE);
    const storage = new StorageError('Test');

    // All should be instances of Error and StoneforgeError
    for (const error of [validation, notFound, conflict, constraint, storage]) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(StoneforgeError);
    }

    // Each should be an instance of only its own class (and parents)
    expect(validation).toBeInstanceOf(ValidationError);
    expect(validation).not.toBeInstanceOf(NotFoundError);

    expect(notFound).toBeInstanceOf(NotFoundError);
    expect(notFound).not.toBeInstanceOf(ValidationError);
  });
});
