import { describe, it, expect } from 'bun:test';
import {
  // Not Found factories
  notFound,
  entityNotFound,
  documentNotFound,
  channelNotFound,
  playbookNotFound,
  // Validation factories
  invalidInput,
  invalidId,
  invalidStatus,
  titleTooLong,
  invalidContentType,
  invalidJson,
  missingRequiredField,
  invalidTag,
  invalidTimestamp,
  invalidMetadata,
  // Conflict factories
  alreadyExists,
  duplicateName,
  cycleDetected,
  syncConflict,
  // Constraint factories
  immutable,
  hasDependents,
  invalidParent,
  maxDepthExceeded,
  memberRequired,
  // Storage factories
  databaseError,
  exportFailed,
  importFailed,
  migrationFailed,
} from './factories.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ConstraintError,
  StorageError,
} from './error.js';
import { ErrorCode } from './codes.js';

describe('Not Found Factories', () => {
  describe('notFound', () => {
    it('should create NotFoundError with type and id', () => {
      const error = notFound('task', 'el-abc123');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.message).toBe('Task not found: el-abc123');
      expect(error.details.elementId).toBe('el-abc123');
    });

    it('should capitalize type in message', () => {
      const error = notFound('document', 'el-xyz');
      expect(error.message).toBe('Document not found: el-xyz');
    });

    it('should merge additional details', () => {
      const error = notFound('task', 'el-abc', { requestedBy: 'user-1' });
      expect(error.details.requestedBy).toBe('user-1');
      expect(error.details.elementId).toBe('el-abc');
    });
  });

  describe('entityNotFound', () => {
    it('should create NotFoundError for entity', () => {
      const error = entityNotFound('el-entity123');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe(ErrorCode.ENTITY_NOT_FOUND);
      expect(error.message).toBe('Entity not found: el-entity123');
      expect(error.details.elementId).toBe('el-entity123');
    });
  });

  describe('documentNotFound', () => {
    it('should create NotFoundError for document', () => {
      const error = documentNotFound('el-doc456');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
      expect(error.message).toBe('Document not found: el-doc456');
    });
  });

  describe('channelNotFound', () => {
    it('should create NotFoundError for channel', () => {
      const error = channelNotFound('el-chan789');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe(ErrorCode.CHANNEL_NOT_FOUND);
      expect(error.message).toBe('Channel not found: el-chan789');
    });
  });

  describe('playbookNotFound', () => {
    it('should create NotFoundError for playbook', () => {
      const error = playbookNotFound('el-pb101');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe(ErrorCode.PLAYBOOK_NOT_FOUND);
      expect(error.message).toBe('Playbook not found: el-pb101');
    });
  });
});

describe('Validation Factories', () => {
  describe('invalidInput', () => {
    it('should create ValidationError with field info', () => {
      const error = invalidInput('priority', 10, '1-5');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.message).toBe('Invalid priority: 10');
      expect(error.details.field).toBe('priority');
      expect(error.details.value).toBe(10);
      expect(error.details.expected).toBe('1-5');
    });

    it('should truncate long values', () => {
      const longValue = 'a'.repeat(100);
      const error = invalidInput('name', longValue, 'shorter');

      expect(error.message.length).toBeLessThan(80);
      expect(error.message).toContain('...');
    });

    it('should handle object values', () => {
      const error = invalidInput('config', { nested: true }, 'valid config');
      expect(error.details.value).toEqual({ nested: true });
    });
  });

  describe('invalidId', () => {
    it('should create ValidationError for invalid ID', () => {
      const error = invalidId('abc');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_ID);
      expect(error.message).toBe('Invalid element ID format: abc');
      expect(error.details.value).toBe('abc');
      expect(error.details.expected).toContain('el-');
    });
  });

  describe('invalidStatus', () => {
    it('should create ValidationError for invalid status transition', () => {
      const error = invalidStatus('closed', 'blocked');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_STATUS);
      expect(error.message).toBe('Invalid status transition: cannot move from closed to blocked');
      expect(error.details.actual).toBe('closed');
      expect(error.details.expected).toBe('blocked');
    });
  });

  describe('titleTooLong', () => {
    it('should create ValidationError for long title', () => {
      const error = titleTooLong(543);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.TITLE_TOO_LONG);
      expect(error.message).toBe('Title too long: 543 characters (max 500)');
      expect(error.details.actual).toBe(543);
    });

    it('should allow custom max length', () => {
      const error = titleTooLong(150, 100);
      expect(error.message).toBe('Title too long: 150 characters (max 100)');
    });
  });

  describe('invalidContentType', () => {
    it('should create ValidationError for invalid content type', () => {
      const error = invalidContentType('html');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_CONTENT_TYPE);
      expect(error.message).toBe('Invalid content type: html');
      expect(error.details.value).toBe('html');
      expect(error.details.expected).toEqual(['text', 'markdown', 'json']);
    });

    it('should accept custom valid types', () => {
      const error = invalidContentType('html', ['text', 'markdown']);
      expect(error.details.expected).toEqual(['text', 'markdown']);
    });
  });

  describe('invalidJson', () => {
    it('should create ValidationError for invalid JSON', () => {
      const parseError = new SyntaxError('Unexpected token');
      const error = invalidJson('{ bad json', parseError);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_JSON);
      expect(error.message).toContain('Invalid JSON content');
      expect(error.message).toContain('Unexpected token');
      expect(error.cause).toBe(parseError);
    });

    it('should handle missing parse error', () => {
      const error = invalidJson('{ bad');
      expect(error.message).toContain('parse error');
    });
  });

  describe('missingRequiredField', () => {
    it('should create ValidationError for missing field', () => {
      const error = missingRequiredField('title');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(error.message).toBe('Missing required field: title');
      expect(error.details.field).toBe('title');
    });
  });

  describe('invalidTag', () => {
    it('should create ValidationError for invalid tag', () => {
      const error = invalidTag('invalid tag!', 'contains special characters');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_TAG);
      expect(error.message).toBe('Invalid tag "invalid tag!": contains special characters');
      expect(error.details.value).toBe('invalid tag!');
    });
  });

  describe('invalidTimestamp', () => {
    it('should create ValidationError for invalid timestamp', () => {
      const error = invalidTimestamp('2025-13-45');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_TIMESTAMP);
      expect(error.message).toBe('Invalid timestamp format: 2025-13-45');
      expect(error.details.expected).toContain('ISO 8601');
    });
  });

  describe('invalidMetadata', () => {
    it('should create ValidationError for invalid metadata', () => {
      const error = invalidMetadata('exceeds 64KB limit');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_METADATA);
      expect(error.message).toBe('Invalid metadata: exceeds 64KB limit');
    });
  });
});

describe('Conflict Factories', () => {
  describe('alreadyExists', () => {
    it('should create ConflictError for duplicate element', () => {
      const error = alreadyExists('task', 'el-abc123');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.code).toBe(ErrorCode.ALREADY_EXISTS);
      expect(error.message).toBe('Task already exists: el-abc123');
      expect(error.details.elementId).toBe('el-abc123');
    });
  });

  describe('duplicateName', () => {
    it('should create ConflictError for duplicate name', () => {
      const error = duplicateName('my-channel', 'channel');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.code).toBe(ErrorCode.DUPLICATE_NAME);
      expect(error.message).toBe('Channel with name "my-channel" already exists');
      expect(error.details.value).toBe('my-channel');
    });
  });

  describe('cycleDetected', () => {
    it('should create ConflictError for dependency cycle', () => {
      const error = cycleDetected('el-abc', 'el-xyz', 'blocks');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.code).toBe(ErrorCode.CYCLE_DETECTED);
      expect(error.message).toBe('Adding dependency would create cycle: el-abc -> el-xyz');
      expect(error.details.blockedId).toBe('el-abc');
      expect(error.details.blockerId).toBe('el-xyz');
      expect(error.details.dependencyType).toBe('blocks');
    });
  });

  describe('syncConflict', () => {
    it('should create ConflictError for sync conflict', () => {
      const error = syncConflict('el-conflict123');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.code).toBe(ErrorCode.SYNC_CONFLICT);
      expect(error.message).toBe('Sync conflict for element: el-conflict123');
      expect(error.details.elementId).toBe('el-conflict123');
    });
  });
});

describe('Constraint Factories', () => {
  describe('immutable', () => {
    it('should create ConstraintError for immutable element', () => {
      const error = immutable('message', 'el-msg123');

      expect(error).toBeInstanceOf(ConstraintError);
      expect(error.code).toBe(ErrorCode.IMMUTABLE);
      expect(error.message).toBe('Cannot modify immutable message: el-msg123');
      expect(error.details.elementId).toBe('el-msg123');
    });
  });

  describe('hasDependents', () => {
    it('should create ConstraintError for element with dependents', () => {
      const error = hasDependents('el-abc123', 3);

      expect(error).toBeInstanceOf(ConstraintError);
      expect(error.code).toBe(ErrorCode.HAS_DEPENDENTS);
      expect(error.message).toBe('Cannot delete element with 3 dependent(s): el-abc123');
      expect(error.details.elementId).toBe('el-abc123');
      expect(error.details.actual).toBe(3);
    });

    it('should handle singular dependent', () => {
      const error = hasDependents('el-abc123', 1);
      expect(error.message).toContain('1 dependent(s)');
    });
  });

  describe('invalidParent', () => {
    it('should create ConstraintError for invalid parent', () => {
      const error = invalidParent('el-parent', 'parent is not a plan');

      expect(error).toBeInstanceOf(ConstraintError);
      expect(error.code).toBe(ErrorCode.INVALID_PARENT);
      expect(error.message).toBe('Invalid parent el-parent: parent is not a plan');
      expect(error.details.elementId).toBe('el-parent');
    });
  });

  describe('maxDepthExceeded', () => {
    it('should create ConstraintError for max depth exceeded', () => {
      const error = maxDepthExceeded(4);

      expect(error).toBeInstanceOf(ConstraintError);
      expect(error.code).toBe(ErrorCode.MAX_DEPTH_EXCEEDED);
      expect(error.message).toBe('Maximum hierarchy depth exceeded: 4 (max 3)');
      expect(error.details.actual).toBe(4);
    });

    it('should allow custom max depth', () => {
      const error = maxDepthExceeded(6, 5);
      expect(error.message).toBe('Maximum hierarchy depth exceeded: 6 (max 5)');
    });
  });

  describe('memberRequired', () => {
    it('should create ConstraintError for membership requirement', () => {
      const error = memberRequired('el-chan123', 'el-user456');

      expect(error).toBeInstanceOf(ConstraintError);
      expect(error.code).toBe(ErrorCode.MEMBER_REQUIRED);
      expect(error.message).toBe('Entity el-user456 must be a member of channel el-chan123');
      expect(error.details.elementId).toBe('el-chan123');
    });
  });
});

describe('Storage Factories', () => {
  describe('databaseError', () => {
    it('should create StorageError for database failure', () => {
      const error = databaseError('connection failed');

      expect(error).toBeInstanceOf(StorageError);
      expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(error.message).toBe('Database error: connection failed');
    });

    it('should preserve cause', () => {
      const cause = new Error('SQLITE_BUSY');
      const error = databaseError('busy', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('exportFailed', () => {
    it('should create StorageError for export failure', () => {
      const error = exportFailed('write permission denied');

      expect(error).toBeInstanceOf(StorageError);
      expect(error.code).toBe(ErrorCode.EXPORT_FAILED);
      expect(error.message).toBe('Export failed: write permission denied');
    });
  });

  describe('importFailed', () => {
    it('should create StorageError for import failure', () => {
      const error = importFailed('corrupted JSONL file');

      expect(error).toBeInstanceOf(StorageError);
      expect(error.code).toBe(ErrorCode.IMPORT_FAILED);
      expect(error.message).toBe('Import failed: corrupted JSONL file');
    });
  });

  describe('migrationFailed', () => {
    it('should create StorageError for migration failure', () => {
      const error = migrationFailed(5, 'column already exists');

      expect(error).toBeInstanceOf(StorageError);
      expect(error.code).toBe(ErrorCode.MIGRATION_FAILED);
      expect(error.message).toBe('Migration to version 5 failed: column already exists');
      expect(error.details.version).toBe(5);
    });

    it('should preserve cause', () => {
      const cause = new Error('SQL syntax error');
      const error = migrationFailed(3, 'syntax error', cause);

      expect(error.cause).toBe(cause);
    });
  });
});

describe('Factory error details merging', () => {
  it('should allow adding custom details to all factories', () => {
    const customDetails = { requestId: 'req-123', timestamp: Date.now() };

    const errors = [
      notFound('task', 'el-1', customDetails),
      entityNotFound('el-2', customDetails),
      invalidInput('field', 'value', 'expected', customDetails),
      alreadyExists('task', 'el-3', customDetails),
      cycleDetected('el-a', 'el-b', 'blocks', customDetails),
      immutable('message', 'el-4', customDetails),
      databaseError('test', undefined, customDetails),
    ];

    for (const error of errors) {
      expect(error.details.requestId).toBe('req-123');
      expect(error.details.timestamp).toBe(customDetails.timestamp);
    }
  });
});
