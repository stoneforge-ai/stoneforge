import { ErrorCode } from './codes.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ConstraintError,
  StorageError,
  ErrorDetails,
} from './error.js';

// =============================================================================
// Not Found Factories
// =============================================================================

/**
 * Creates a NotFoundError for an element that doesn't exist
 */
export function notFound(
  type: string,
  id: string,
  details: ErrorDetails = {}
): NotFoundError {
  return new NotFoundError(`${capitalize(type)} not found: ${id}`, ErrorCode.NOT_FOUND, {
    elementId: id,
    ...details,
  });
}

/**
 * Creates a NotFoundError for a missing entity
 */
export function entityNotFound(id: string, details: ErrorDetails = {}): NotFoundError {
  return new NotFoundError(`Entity not found: ${id}`, ErrorCode.ENTITY_NOT_FOUND, {
    elementId: id,
    ...details,
  });
}

/**
 * Creates a NotFoundError for a missing document
 */
export function documentNotFound(id: string, details: ErrorDetails = {}): NotFoundError {
  return new NotFoundError(`Document not found: ${id}`, ErrorCode.DOCUMENT_NOT_FOUND, {
    elementId: id,
    ...details,
  });
}

/**
 * Creates a NotFoundError for a missing channel
 */
export function channelNotFound(id: string, details: ErrorDetails = {}): NotFoundError {
  return new NotFoundError(`Channel not found: ${id}`, ErrorCode.CHANNEL_NOT_FOUND, {
    elementId: id,
    ...details,
  });
}

/**
 * Creates a NotFoundError for a missing playbook
 */
export function playbookNotFound(id: string, details: ErrorDetails = {}): NotFoundError {
  return new NotFoundError(`Playbook not found: ${id}`, ErrorCode.PLAYBOOK_NOT_FOUND, {
    elementId: id,
    ...details,
  });
}

// =============================================================================
// Validation Factories
// =============================================================================

/**
 * Creates a ValidationError for invalid input
 */
export function invalidInput(
  field: string,
  value: unknown,
  expected: unknown,
  details: ErrorDetails = {}
): ValidationError {
  const valueStr = truncateValue(value);
  return new ValidationError(
    `Invalid ${field}: ${valueStr}`,
    ErrorCode.INVALID_INPUT,
    {
      field,
      value,
      expected,
      ...details,
    }
  );
}

/**
 * Creates a ValidationError for invalid ID format
 */
export function invalidId(value: string, details: ErrorDetails = {}): ValidationError {
  return new ValidationError(
    `Invalid element ID format: ${value}`,
    ErrorCode.INVALID_ID,
    {
      value,
      expected: 'el-[a-z0-9]{3,8} or el-[a-z0-9]{3,8}(.[0-9]+){1,3}',
      ...details,
    }
  );
}

/**
 * Creates a ValidationError for invalid status transition
 */
export function invalidStatus(
  from: string,
  to: string,
  details: ErrorDetails = {}
): ValidationError {
  return new ValidationError(
    `Invalid status transition: cannot move from ${from} to ${to}`,
    ErrorCode.INVALID_STATUS,
    {
      actual: from,
      expected: to,
      ...details,
    }
  );
}

/**
 * Creates a ValidationError for title that's too long
 */
export function titleTooLong(length: number, maxLength = 500): ValidationError {
  return new ValidationError(
    `Title too long: ${length} characters (max ${maxLength})`,
    ErrorCode.TITLE_TOO_LONG,
    {
      actual: length,
      expected: `<= ${maxLength}`,
    }
  );
}

/**
 * Creates a ValidationError for invalid content type
 */
export function invalidContentType(
  value: string,
  validTypes: string[] = ['text', 'markdown', 'json']
): ValidationError {
  return new ValidationError(
    `Invalid content type: ${value}`,
    ErrorCode.INVALID_CONTENT_TYPE,
    {
      value,
      expected: validTypes,
    }
  );
}

/**
 * Creates a ValidationError for invalid JSON
 */
export function invalidJson(
  value: string,
  parseError?: Error
): ValidationError {
  return new ValidationError(
    `Invalid JSON content: ${parseError?.message || 'parse error'}`,
    ErrorCode.INVALID_JSON,
    { value },
    parseError
  );
}

/**
 * Creates a ValidationError for missing required field
 */
export function missingRequiredField(field: string): ValidationError {
  return new ValidationError(
    `Missing required field: ${field}`,
    ErrorCode.MISSING_REQUIRED_FIELD,
    { field }
  );
}

/**
 * Creates a ValidationError for invalid tag
 */
export function invalidTag(
  tag: string,
  reason: string,
  details: ErrorDetails = {}
): ValidationError {
  return new ValidationError(
    `Invalid tag "${tag}": ${reason}`,
    ErrorCode.INVALID_TAG,
    { value: tag, ...details }
  );
}

/**
 * Creates a ValidationError for invalid timestamp format
 */
export function invalidTimestamp(
  value: string,
  details: ErrorDetails = {}
): ValidationError {
  return new ValidationError(
    `Invalid timestamp format: ${value}`,
    ErrorCode.INVALID_TIMESTAMP,
    {
      value,
      expected: 'ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)',
      ...details,
    }
  );
}

/**
 * Creates a ValidationError for invalid metadata
 */
export function invalidMetadata(reason: string, details: ErrorDetails = {}): ValidationError {
  return new ValidationError(
    `Invalid metadata: ${reason}`,
    ErrorCode.INVALID_METADATA,
    details
  );
}

// =============================================================================
// Conflict Factories
// =============================================================================

/**
 * Creates a ConflictError for duplicate element
 */
export function alreadyExists(
  type: string,
  id: string,
  details: ErrorDetails = {}
): ConflictError {
  return new ConflictError(
    `${capitalize(type)} already exists: ${id}`,
    ErrorCode.ALREADY_EXISTS,
    { elementId: id, ...details }
  );
}

/**
 * Creates a ConflictError for duplicate name
 */
export function duplicateName(
  name: string,
  type: string,
  details: ErrorDetails = {}
): ConflictError {
  return new ConflictError(
    `${capitalize(type)} with name "${name}" already exists`,
    ErrorCode.DUPLICATE_NAME,
    { value: name, ...details }
  );
}

/**
 * Creates a ConflictError for dependency cycle detection
 */
export function cycleDetected(
  blockedId: string,
  blockerId: string,
  dependencyType: string,
  details: ErrorDetails = {}
): ConflictError {
  return new ConflictError(
    `Adding dependency would create cycle: ${blockedId} -> ${blockerId}`,
    ErrorCode.CYCLE_DETECTED,
    {
      blockedId,
      blockerId,
      dependencyType,
      ...details,
    }
  );
}

/**
 * Creates a ConflictError for sync conflicts
 */
export function syncConflict(
  elementId: string,
  details: ErrorDetails = {}
): ConflictError {
  return new ConflictError(
    `Sync conflict for element: ${elementId}`,
    ErrorCode.SYNC_CONFLICT,
    { elementId, ...details }
  );
}

/**
 * Creates a ConflictError for concurrent modification (optimistic locking failure)
 */
export function concurrentModification(
  elementId: string,
  expectedUpdatedAt: string,
  actualUpdatedAt: string,
  details: ErrorDetails = {}
): ConflictError {
  return new ConflictError(
    `Element was modified by another process: ${elementId}. Expected updatedAt: ${expectedUpdatedAt}, actual: ${actualUpdatedAt}`,
    ErrorCode.CONCURRENT_MODIFICATION,
    { elementId, expectedUpdatedAt, actualUpdatedAt, ...details }
  );
}

// =============================================================================
// Constraint Factories
// =============================================================================

/**
 * Creates a ConstraintError for immutable element modification
 */
export function immutable(
  type: string,
  id: string,
  details: ErrorDetails = {}
): ConstraintError {
  return new ConstraintError(
    `Cannot modify immutable ${type}: ${id}`,
    ErrorCode.IMMUTABLE,
    { elementId: id, ...details }
  );
}

/**
 * Creates a ConstraintError for element with dependents
 */
export function hasDependents(
  id: string,
  dependentCount: number,
  details: ErrorDetails = {}
): ConstraintError {
  return new ConstraintError(
    `Cannot delete element with ${dependentCount} dependent(s): ${id}`,
    ErrorCode.HAS_DEPENDENTS,
    { elementId: id, actual: dependentCount, ...details }
  );
}

/**
 * Creates a ConstraintError for invalid parent
 */
export function invalidParent(
  parentId: string,
  reason: string,
  details: ErrorDetails = {}
): ConstraintError {
  return new ConstraintError(
    `Invalid parent ${parentId}: ${reason}`,
    ErrorCode.INVALID_PARENT,
    { elementId: parentId, ...details }
  );
}

/**
 * Creates a ConstraintError for max depth exceeded
 */
export function maxDepthExceeded(
  depth: number,
  maxDepth = 3,
  details: ErrorDetails = {}
): ConstraintError {
  return new ConstraintError(
    `Maximum hierarchy depth exceeded: ${depth} (max ${maxDepth})`,
    ErrorCode.MAX_DEPTH_EXCEEDED,
    { actual: depth, expected: `<= ${maxDepth}`, ...details }
  );
}

/**
 * Creates a ConstraintError for channel membership requirement
 */
export function memberRequired(
  channelId: string,
  entityId: string,
  details: ErrorDetails = {}
): ConstraintError {
  return new ConstraintError(
    `Entity ${entityId} must be a member of channel ${channelId}`,
    ErrorCode.MEMBER_REQUIRED,
    { elementId: channelId, ...details }
  );
}

// =============================================================================
// Storage Factories
// =============================================================================

/**
 * Creates a StorageError for database operations
 */
export function databaseError(
  message: string,
  cause?: Error,
  details: ErrorDetails = {}
): StorageError {
  return new StorageError(
    `Database error: ${message}`,
    ErrorCode.DATABASE_ERROR,
    details,
    cause
  );
}

/**
 * Creates a StorageError for export failures
 */
export function exportFailed(
  message: string,
  cause?: Error,
  details: ErrorDetails = {}
): StorageError {
  return new StorageError(
    `Export failed: ${message}`,
    ErrorCode.EXPORT_FAILED,
    details,
    cause
  );
}

/**
 * Creates a StorageError for import failures
 */
export function importFailed(
  message: string,
  cause?: Error,
  details: ErrorDetails = {}
): StorageError {
  return new StorageError(
    `Import failed: ${message}`,
    ErrorCode.IMPORT_FAILED,
    details,
    cause
  );
}

/**
 * Creates a StorageError for migration failures
 */
export function migrationFailed(
  version: number,
  message: string,
  cause?: Error,
  details: ErrorDetails = {}
): StorageError {
  return new StorageError(
    `Migration to version ${version} failed: ${message}`,
    ErrorCode.MIGRATION_FAILED,
    { ...details, version },
    cause
  );
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Capitalizes the first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncates a value for display in error messages
 */
function truncateValue(value: unknown, maxLength = 50): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}
