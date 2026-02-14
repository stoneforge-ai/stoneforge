/**
 * Error handling module for Stoneforge
 *
 * Provides structured errors with codes, messages, and details
 * for consistent error handling across the API, CLI, and storage layers.
 */

// Error codes
export {
  ErrorCode,
  ValidationErrorCode,
  NotFoundErrorCode,
  ConflictErrorCode,
  ConstraintErrorCode,
  StorageErrorCode,
  IdentityErrorCode,
  ErrorHttpStatus,
  ErrorExitCode,
  getExitCode,
} from './codes.js';

// Error classes
export {
  StoneforgeError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ConstraintError,
  StorageError,
  IdentityError,
  isStoneforgeError,
  isValidationError,
  isNotFoundError,
  isConflictError,
  isConstraintError,
  isStorageError,
  isIdentityError,
  hasErrorCode,
  type ErrorDetails,
} from './error.js';

// Factory functions
export {
  // Not Found
  notFound,
  entityNotFound,
  documentNotFound,
  channelNotFound,
  playbookNotFound,
  // Validation
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
  // Conflict
  alreadyExists,
  duplicateName,
  cycleDetected,
  syncConflict,
  // Constraint
  immutable,
  hasDependents,
  invalidParent,
  maxDepthExceeded,
  memberRequired,
  // Storage
  databaseError,
  exportFailed,
  importFailed,
  migrationFailed,
} from './factories.js';
