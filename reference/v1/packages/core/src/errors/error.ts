import {
  ErrorCode,
  ErrorHttpStatus,
  ValidationErrorCode,
  NotFoundErrorCode,
  ConflictErrorCode,
  ConstraintErrorCode,
  StorageErrorCode,
  IdentityErrorCode,
} from './codes.js';

/**
 * Additional context for errors
 */
export interface ErrorDetails {
  /** Field that caused the error */
  field?: string;
  /** The invalid value */
  value?: unknown;
  /** Expected format or value */
  expected?: unknown;
  /** Actual value received */
  actual?: unknown;
  /** Related element ID */
  elementId?: string;
  /** Dependency type for relationship errors */
  dependencyType?: string;
  /** Blocked ID for relationship errors (the element that is waiting/blocked) */
  blockedId?: string;
  /** Blocker ID for relationship errors (the element doing the blocking) */
  blockerId?: string;
  /** Additional arbitrary context */
  [key: string]: unknown;
}

/**
 * Base error class for all Stoneforge errors.
 * Provides structured error information with code, message, and details.
 */
export class StoneforgeError extends Error {
  /** Machine-readable error code */
  readonly code: ErrorCode;
  /** Additional context about the error */
  readonly details: ErrorDetails;
  /** HTTP status code for API responses */
  readonly httpStatus: number;

  constructor(
    message: string,
    code: ErrorCode,
    details: ErrorDetails = {},
    cause?: Error
  ) {
    super(message);
    this.name = 'StoneforgeError';
    this.code = code;
    this.details = details;
    this.httpStatus = ErrorHttpStatus[code];
    this.cause = cause;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StoneforgeError);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): {
    name: string;
    message: string;
    code: ErrorCode;
    details: ErrorDetails;
    httpStatus: number;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      httpStatus: this.httpStatus,
    };
  }
}

/**
 * Error for input validation failures
 */
export class ValidationError extends StoneforgeError {
  constructor(
    message: string,
    code: ValidationErrorCode = ErrorCode.INVALID_INPUT,
    details: ErrorDetails = {},
    cause?: Error
  ) {
    super(message, code, details, cause);
    this.name = 'ValidationError';
  }
}

/**
 * Error for resources that cannot be found
 */
export class NotFoundError extends StoneforgeError {
  constructor(
    message: string,
    code: NotFoundErrorCode = ErrorCode.NOT_FOUND,
    details: ErrorDetails = {},
    cause?: Error
  ) {
    super(message, code, details, cause);
    this.name = 'NotFoundError';
  }
}

/**
 * Error for state conflicts (duplicate IDs, cycles, etc.)
 */
export class ConflictError extends StoneforgeError {
  constructor(
    message: string,
    code: ConflictErrorCode,
    details: ErrorDetails = {},
    cause?: Error
  ) {
    super(message, code, details, cause);
    this.name = 'ConflictError';
  }
}

/**
 * Error for business rule constraint violations
 */
export class ConstraintError extends StoneforgeError {
  constructor(
    message: string,
    code: ConstraintErrorCode,
    details: ErrorDetails = {},
    cause?: Error
  ) {
    super(message, code, details, cause);
    this.name = 'ConstraintError';
  }
}

/**
 * Error for storage/database operations
 */
export class StorageError extends StoneforgeError {
  constructor(
    message: string,
    code: StorageErrorCode = ErrorCode.DATABASE_ERROR,
    details: ErrorDetails = {},
    cause?: Error
  ) {
    super(message, code, details, cause);
    this.name = 'StorageError';
  }
}

/**
 * Type guard to check if an error is an StoneforgeError
 */
export function isStoneforgeError(error: unknown): error is StoneforgeError {
  return error instanceof StoneforgeError;
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if an error is a NotFoundError
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

/**
 * Type guard to check if an error is a ConflictError
 */
export function isConflictError(error: unknown): error is ConflictError {
  return error instanceof ConflictError;
}

/**
 * Type guard to check if an error is a ConstraintError
 */
export function isConstraintError(error: unknown): error is ConstraintError {
  return error instanceof ConstraintError;
}

/**
 * Type guard to check if an error is a StorageError
 */
export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/**
 * Error for identity and authentication operations
 */
export class IdentityError extends StoneforgeError {
  constructor(
    message: string,
    code: IdentityErrorCode = ErrorCode.SIGNATURE_VERIFICATION_FAILED,
    details: ErrorDetails = {},
    cause?: Error
  ) {
    super(message, code, details, cause);
    this.name = 'IdentityError';
  }
}

/**
 * Type guard to check if an error is an IdentityError
 */
export function isIdentityError(error: unknown): error is IdentityError {
  return error instanceof IdentityError;
}

/**
 * Type guard to check if an error has a specific error code
 */
export function hasErrorCode(
  error: unknown,
  code: ErrorCode
): error is StoneforgeError {
  return isStoneforgeError(error) && error.code === code;
}
