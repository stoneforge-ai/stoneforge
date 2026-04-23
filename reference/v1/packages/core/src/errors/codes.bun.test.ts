import { describe, it, expect } from 'bun:test';
import {
  ErrorCode,
  ValidationErrorCode,
  NotFoundErrorCode,
  ConflictErrorCode,
  ConstraintErrorCode,
  StorageErrorCode,
  ErrorHttpStatus,
  ErrorExitCode,
  getExitCode,
} from './codes.js';

describe('ErrorCode', () => {
  describe('categories', () => {
    it('should define all validation error codes', () => {
      expect(ValidationErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ValidationErrorCode.INVALID_ID).toBe('INVALID_ID');
      expect(ValidationErrorCode.INVALID_STATUS).toBe('INVALID_STATUS');
      expect(ValidationErrorCode.TITLE_TOO_LONG).toBe('TITLE_TOO_LONG');
      expect(ValidationErrorCode.INVALID_CONTENT_TYPE).toBe('INVALID_CONTENT_TYPE');
      expect(ValidationErrorCode.INVALID_JSON).toBe('INVALID_JSON');
      expect(ValidationErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
      expect(ValidationErrorCode.INVALID_TAG).toBe('INVALID_TAG');
      expect(ValidationErrorCode.INVALID_TIMESTAMP).toBe('INVALID_TIMESTAMP');
      expect(ValidationErrorCode.INVALID_METADATA).toBe('INVALID_METADATA');
    });

    it('should define all not found error codes', () => {
      expect(NotFoundErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(NotFoundErrorCode.ENTITY_NOT_FOUND).toBe('ENTITY_NOT_FOUND');
      expect(NotFoundErrorCode.DOCUMENT_NOT_FOUND).toBe('DOCUMENT_NOT_FOUND');
      expect(NotFoundErrorCode.CHANNEL_NOT_FOUND).toBe('CHANNEL_NOT_FOUND');
      expect(NotFoundErrorCode.PLAYBOOK_NOT_FOUND).toBe('PLAYBOOK_NOT_FOUND');
      expect(NotFoundErrorCode.DEPENDENCY_NOT_FOUND).toBe('DEPENDENCY_NOT_FOUND');
    });

    it('should define all conflict error codes', () => {
      expect(ConflictErrorCode.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
      expect(ConflictErrorCode.DUPLICATE_NAME).toBe('DUPLICATE_NAME');
      expect(ConflictErrorCode.CYCLE_DETECTED).toBe('CYCLE_DETECTED');
      expect(ConflictErrorCode.SYNC_CONFLICT).toBe('SYNC_CONFLICT');
      expect(ConflictErrorCode.DUPLICATE_DEPENDENCY).toBe('DUPLICATE_DEPENDENCY');
    });

    it('should define all constraint error codes', () => {
      expect(ConstraintErrorCode.IMMUTABLE).toBe('IMMUTABLE');
      expect(ConstraintErrorCode.HAS_DEPENDENTS).toBe('HAS_DEPENDENTS');
      expect(ConstraintErrorCode.INVALID_PARENT).toBe('INVALID_PARENT');
      expect(ConstraintErrorCode.MAX_DEPTH_EXCEEDED).toBe('MAX_DEPTH_EXCEEDED');
      expect(ConstraintErrorCode.MEMBER_REQUIRED).toBe('MEMBER_REQUIRED');
    });

    it('should define all storage error codes', () => {
      expect(StorageErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(StorageErrorCode.EXPORT_FAILED).toBe('EXPORT_FAILED');
      expect(StorageErrorCode.IMPORT_FAILED).toBe('IMPORT_FAILED');
      expect(StorageErrorCode.MIGRATION_FAILED).toBe('MIGRATION_FAILED');
    });
  });

  describe('combined ErrorCode', () => {
    it('should include all codes from all categories', () => {
      // Validation codes
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ErrorCode.INVALID_ID).toBe('INVALID_ID');

      // Not found codes
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.ENTITY_NOT_FOUND).toBe('ENTITY_NOT_FOUND');

      // Conflict codes
      expect(ErrorCode.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
      expect(ErrorCode.CYCLE_DETECTED).toBe('CYCLE_DETECTED');

      // Constraint codes
      expect(ErrorCode.IMMUTABLE).toBe('IMMUTABLE');
      expect(ErrorCode.HAS_DEPENDENTS).toBe('HAS_DEPENDENTS');

      // Storage codes
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ErrorCode.MIGRATION_FAILED).toBe('MIGRATION_FAILED');
    });
  });
});

describe('ErrorHttpStatus', () => {
  it('should map validation errors to 400', () => {
    expect(ErrorHttpStatus[ErrorCode.INVALID_INPUT]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.INVALID_ID]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.INVALID_STATUS]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.TITLE_TOO_LONG]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.INVALID_CONTENT_TYPE]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.INVALID_JSON]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.MISSING_REQUIRED_FIELD]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.INVALID_TAG]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.INVALID_TIMESTAMP]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.INVALID_METADATA]).toBe(400);
  });

  it('should map not found errors to 404', () => {
    expect(ErrorHttpStatus[ErrorCode.NOT_FOUND]).toBe(404);
    expect(ErrorHttpStatus[ErrorCode.ENTITY_NOT_FOUND]).toBe(404);
    expect(ErrorHttpStatus[ErrorCode.DOCUMENT_NOT_FOUND]).toBe(404);
    expect(ErrorHttpStatus[ErrorCode.CHANNEL_NOT_FOUND]).toBe(404);
    expect(ErrorHttpStatus[ErrorCode.PLAYBOOK_NOT_FOUND]).toBe(404);
    expect(ErrorHttpStatus[ErrorCode.DEPENDENCY_NOT_FOUND]).toBe(404);
  });

  it('should map conflict errors to 409', () => {
    expect(ErrorHttpStatus[ErrorCode.ALREADY_EXISTS]).toBe(409);
    expect(ErrorHttpStatus[ErrorCode.DUPLICATE_NAME]).toBe(409);
    expect(ErrorHttpStatus[ErrorCode.CYCLE_DETECTED]).toBe(409);
    expect(ErrorHttpStatus[ErrorCode.SYNC_CONFLICT]).toBe(409);
    expect(ErrorHttpStatus[ErrorCode.DUPLICATE_DEPENDENCY]).toBe(409);
  });

  it('should map constraint errors appropriately', () => {
    expect(ErrorHttpStatus[ErrorCode.IMMUTABLE]).toBe(403);
    expect(ErrorHttpStatus[ErrorCode.HAS_DEPENDENTS]).toBe(409);
    expect(ErrorHttpStatus[ErrorCode.INVALID_PARENT]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.MAX_DEPTH_EXCEEDED]).toBe(400);
    expect(ErrorHttpStatus[ErrorCode.MEMBER_REQUIRED]).toBe(403);
  });

  it('should map storage errors to 500', () => {
    expect(ErrorHttpStatus[ErrorCode.DATABASE_ERROR]).toBe(500);
    expect(ErrorHttpStatus[ErrorCode.EXPORT_FAILED]).toBe(500);
    expect(ErrorHttpStatus[ErrorCode.IMPORT_FAILED]).toBe(500);
    expect(ErrorHttpStatus[ErrorCode.MIGRATION_FAILED]).toBe(500);
  });
});

describe('ErrorExitCode', () => {
  it('should define CLI exit codes', () => {
    expect(ErrorExitCode.SUCCESS).toBe(0);
    expect(ErrorExitCode.GENERAL_ERROR).toBe(1);
    expect(ErrorExitCode.INVALID_ARGUMENTS).toBe(2);
    expect(ErrorExitCode.NOT_FOUND).toBe(3);
    expect(ErrorExitCode.VALIDATION).toBe(4);
    expect(ErrorExitCode.PERMISSION).toBe(5);
  });
});

describe('getExitCode', () => {
  it('should return VALIDATION for validation error codes', () => {
    expect(getExitCode(ErrorCode.INVALID_INPUT)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.INVALID_ID)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.INVALID_STATUS)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.TITLE_TOO_LONG)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.INVALID_CONTENT_TYPE)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.INVALID_JSON)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.MISSING_REQUIRED_FIELD)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.INVALID_TAG)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.INVALID_TIMESTAMP)).toBe(ErrorExitCode.VALIDATION);
    expect(getExitCode(ErrorCode.INVALID_METADATA)).toBe(ErrorExitCode.VALIDATION);
  });

  it('should return NOT_FOUND for not found error codes', () => {
    expect(getExitCode(ErrorCode.NOT_FOUND)).toBe(ErrorExitCode.NOT_FOUND);
    expect(getExitCode(ErrorCode.ENTITY_NOT_FOUND)).toBe(ErrorExitCode.NOT_FOUND);
    expect(getExitCode(ErrorCode.DOCUMENT_NOT_FOUND)).toBe(ErrorExitCode.NOT_FOUND);
    expect(getExitCode(ErrorCode.CHANNEL_NOT_FOUND)).toBe(ErrorExitCode.NOT_FOUND);
    expect(getExitCode(ErrorCode.PLAYBOOK_NOT_FOUND)).toBe(ErrorExitCode.NOT_FOUND);
    expect(getExitCode(ErrorCode.DEPENDENCY_NOT_FOUND)).toBe(ErrorExitCode.NOT_FOUND);
  });

  it('should return PERMISSION for permission-related constraint errors', () => {
    expect(getExitCode(ErrorCode.IMMUTABLE)).toBe(ErrorExitCode.PERMISSION);
    expect(getExitCode(ErrorCode.MEMBER_REQUIRED)).toBe(ErrorExitCode.PERMISSION);
  });

  it('should return GENERAL_ERROR for storage errors', () => {
    expect(getExitCode(ErrorCode.DATABASE_ERROR)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.EXPORT_FAILED)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.IMPORT_FAILED)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.MIGRATION_FAILED)).toBe(ErrorExitCode.GENERAL_ERROR);
  });

  it('should return GENERAL_ERROR for conflict and other constraint errors', () => {
    expect(getExitCode(ErrorCode.ALREADY_EXISTS)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.DUPLICATE_NAME)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.CYCLE_DETECTED)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.SYNC_CONFLICT)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.DUPLICATE_DEPENDENCY)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.HAS_DEPENDENTS)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.INVALID_PARENT)).toBe(ErrorExitCode.GENERAL_ERROR);
    expect(getExitCode(ErrorCode.MAX_DEPTH_EXCEEDED)).toBe(ErrorExitCode.GENERAL_ERROR);
  });
});
