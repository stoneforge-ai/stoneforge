/**
 * Element Base Type - Foundation for all Stoneforge types
 *
 * The base Element type provides:
 * - Unified identity system across all types
 * - Consistent timestamp tracking
 * - Universal tagging and metadata capabilities
 * - Attribution to creating entity
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Branded type for Element IDs
 * Format: el-{hash} or el-{hash}.{n} for hierarchical
 */
declare const ElementIdBrand: unique symbol;
export type ElementId = string & { readonly [ElementIdBrand]: typeof ElementIdBrand };

/**
 * Branded type for Entity IDs (creators)
 */
declare const EntityIdBrand: unique symbol;
export type EntityId = string & { readonly [EntityIdBrand]: typeof EntityIdBrand };

/**
 * Timestamp type - ISO 8601 formatted string
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ
 */
export type Timestamp = string;

// ============================================================================
// Branded Type Cast Utilities
// ============================================================================

/** Cast a string to EntityId (use at trust boundaries only) */
export function asEntityId(id: string): EntityId {
  return id as unknown as EntityId;
}

/** Cast a string to ElementId (use at trust boundaries only) */
export function asElementId(id: string): ElementId {
  return id as unknown as ElementId;
}

// ============================================================================
// Element Types
// ============================================================================

/**
 * All valid element types in the system
 */
export const ElementType = {
  TASK: 'task',
  MESSAGE: 'message',
  DOCUMENT: 'document',
  ENTITY: 'entity',
  PLAN: 'plan',
  WORKFLOW: 'workflow',
  PLAYBOOK: 'playbook',
  CHANNEL: 'channel',
  LIBRARY: 'library',
  TEAM: 'team',
} as const;

export type ElementType = (typeof ElementType)[keyof typeof ElementType];

// ============================================================================
// Element Interface
// ============================================================================

/**
 * Base Element interface - all element types extend this
 */
export interface Element {
  /** Hash-based identifier, supports hierarchical format */
  readonly id: ElementId;
  /** Discriminator for element subtype */
  readonly type: ElementType;
  /** ISO 8601 datetime when element was created */
  readonly createdAt: Timestamp;
  /** ISO 8601 datetime of last modification */
  updatedAt: Timestamp;
  /** Reference to the entity that created this element */
  readonly createdBy: EntityId;
  /** User-defined tags for categorization */
  tags: string[];
  /** Arbitrary key-value data */
  metadata: Record<string, unknown>;
  /** ISO 8601 datetime when element was soft-deleted, undefined if active */
  deletedAt?: Timestamp;
}

// ============================================================================
// Validation Constants
// ============================================================================

/** Maximum number of tags per element */
export const MAX_TAGS = 50;

/** Maximum characters per tag */
export const MAX_TAG_LENGTH = 100;

/** Valid characters for tags: alphanumeric, hyphen, underscore, colon */
const TAG_PATTERN = /^[a-zA-Z0-9_:-]+$/;

/** Maximum metadata size in bytes (64KB) */
export const MAX_METADATA_SIZE = 64 * 1024;

/** Reserved metadata key prefix for system use */
export const RESERVED_METADATA_PREFIX = '_el_';

/** ISO 8601 timestamp pattern */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a timestamp string is in ISO 8601 format
 */
export function isValidTimestamp(value: unknown): value is Timestamp {
  if (typeof value !== 'string') {
    return false;
  }
  if (!TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  // Verify it parses to a valid date and round-trips correctly
  // This catches invalid dates like Feb 30 which JS rolls over
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return false;
  }
  // Check that the ISO string matches - this catches invalid dates
  // that JS auto-corrects (e.g., Feb 30 becomes Mar 2)
  // Normalize both to always have milliseconds for comparison
  const isoString = date.toISOString();
  const normalizedInput = value.includes('.') ? value : value.replace('Z', '.000Z');
  return isoString === normalizedInput;
}

/**
 * Validates a timestamp and throws if invalid
 */
export function validateTimestamp(value: unknown, field: string): Timestamp {
  if (!isValidTimestamp(value)) {
    throw new ValidationError(
      `Invalid timestamp format for ${field}. Expected ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)`,
      ErrorCode.INVALID_TIMESTAMP,
      { field, value, expected: 'YYYY-MM-DDTHH:mm:ss.sssZ' }
    );
  }
  return value;
}

/**
 * Validates a single tag
 */
export function isValidTag(tag: unknown): tag is string {
  if (typeof tag !== 'string') {
    return false;
  }
  if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) {
    return false;
  }
  if (tag !== tag.trim()) {
    return false;
  }
  return TAG_PATTERN.test(tag);
}

/**
 * Validates a single tag and throws if invalid
 */
export function validateTag(tag: unknown): string {
  if (typeof tag !== 'string') {
    throw new ValidationError(
      'Tag must be a string',
      ErrorCode.INVALID_TAG,
      { value: tag, expected: 'string' }
    );
  }
  if (tag.length === 0) {
    throw new ValidationError(
      'Tag cannot be empty',
      ErrorCode.INVALID_TAG,
      { value: tag }
    );
  }
  if (tag.length > MAX_TAG_LENGTH) {
    throw new ValidationError(
      `Tag exceeds maximum length of ${MAX_TAG_LENGTH} characters`,
      ErrorCode.INVALID_TAG,
      { value: tag, expected: `<= ${MAX_TAG_LENGTH} characters`, actual: tag.length }
    );
  }
  if (tag !== tag.trim()) {
    throw new ValidationError(
      'Tag cannot have leading or trailing whitespace',
      ErrorCode.INVALID_TAG,
      { value: tag }
    );
  }
  if (!TAG_PATTERN.test(tag)) {
    throw new ValidationError(
      'Tag contains invalid characters. Only alphanumeric, hyphen, underscore, and colon allowed',
      ErrorCode.INVALID_TAG,
      { value: tag, expected: 'alphanumeric, hyphen, underscore, colon' }
    );
  }
  return tag;
}

/**
 * Validates a tags array
 */
export function isValidTags(tags: unknown): tags is string[] {
  if (!Array.isArray(tags)) {
    return false;
  }
  if (tags.length > MAX_TAGS) {
    return false;
  }
  // Check for duplicates
  const uniqueTags = new Set(tags);
  if (uniqueTags.size !== tags.length) {
    return false;
  }
  return tags.every(isValidTag);
}

/**
 * Validates tags array and throws if invalid
 */
export function validateTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    throw new ValidationError(
      'Tags must be an array',
      ErrorCode.INVALID_TAG,
      { value: tags, expected: 'array' }
    );
  }
  if (tags.length > MAX_TAGS) {
    throw new ValidationError(
      `Too many tags. Maximum is ${MAX_TAGS}`,
      ErrorCode.INVALID_TAG,
      { expected: `<= ${MAX_TAGS}`, actual: tags.length }
    );
  }

  // Validate each tag
  const validatedTags = tags.map(validateTag);

  // Check for duplicates
  const uniqueTags = new Set(validatedTags);
  if (uniqueTags.size !== validatedTags.length) {
    const duplicates = validatedTags.filter(
      (tag, index) => validatedTags.indexOf(tag) !== index
    );
    throw new ValidationError(
      'Duplicate tags are not allowed',
      ErrorCode.INVALID_TAG,
      { value: duplicates }
    );
  }

  return validatedTags;
}

/**
 * Validates metadata object
 */
export function isValidMetadata(metadata: unknown): metadata is Record<string, unknown> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return false;
  }

  // Check for reserved keys
  const keys = Object.keys(metadata);
  if (keys.some((key) => key.startsWith(RESERVED_METADATA_PREFIX))) {
    return false;
  }

  // Check serialization and size
  try {
    const serialized = JSON.stringify(metadata);
    if (serialized.length > MAX_METADATA_SIZE) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Validates metadata and throws if invalid
 */
export function validateMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new ValidationError(
      'Metadata must be a plain object',
      ErrorCode.INVALID_METADATA,
      { value: metadata, expected: 'object' }
    );
  }

  // Check for reserved keys
  const keys = Object.keys(metadata);
  const reservedKeys = keys.filter((key) => key.startsWith(RESERVED_METADATA_PREFIX));
  if (reservedKeys.length > 0) {
    throw new ValidationError(
      `Metadata keys starting with '${RESERVED_METADATA_PREFIX}' are reserved for system use`,
      ErrorCode.INVALID_METADATA,
      { value: reservedKeys, expected: `keys not starting with '${RESERVED_METADATA_PREFIX}'` }
    );
  }

  // Check serialization
  let serialized: string;
  try {
    serialized = JSON.stringify(metadata);
  } catch (err) {
    throw new ValidationError(
      'Metadata must be JSON-serializable',
      ErrorCode.INVALID_METADATA,
      { value: metadata }
    );
  }

  // Check size
  if (serialized.length > MAX_METADATA_SIZE) {
    throw new ValidationError(
      `Metadata exceeds maximum size of ${MAX_METADATA_SIZE} bytes`,
      ErrorCode.INVALID_METADATA,
      { expected: `<= ${MAX_METADATA_SIZE} bytes`, actual: serialized.length }
    );
  }

  return metadata as Record<string, unknown>;
}

/**
 * Validates an element type
 */
export function isValidElementType(value: unknown): value is ElementType {
  return typeof value === 'string' && Object.values(ElementType).includes(value as ElementType);
}

/**
 * Validates element type and throws if invalid
 */
export function validateElementType(value: unknown): ElementType {
  if (!isValidElementType(value)) {
    throw new ValidationError(
      `Invalid element type: ${value}`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value, expected: Object.values(ElementType) }
    );
  }
  return value;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Element
 */
export function isElement(value: unknown): value is Element {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields exist and have correct types
  if (typeof obj.id !== 'string') return false;
  if (!isValidElementType(obj.type)) return false;
  if (!isValidTimestamp(obj.createdAt)) return false;
  if (!isValidTimestamp(obj.updatedAt)) return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!isValidTags(obj.tags)) return false;
  if (!isValidMetadata(obj.metadata)) return false;

  return true;
}

/**
 * Comprehensive validation of an element with detailed errors
 */
export function validateElement(value: unknown): Element {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Element must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate id
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Element id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  // Validate type
  validateElementType(obj.type);

  // Validate timestamps
  validateTimestamp(obj.createdAt, 'createdAt');
  validateTimestamp(obj.updatedAt, 'updatedAt');

  // Validate createdBy
  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Element createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  // Validate tags
  validateTags(obj.tags);

  // Validate metadata
  validateMetadata(obj.metadata);

  return value as Element;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a new timestamp in ISO 8601 format (UTC)
 */
export function createTimestamp(): Timestamp {
  return new Date().toISOString() as Timestamp;
}

/**
 * Parses a timestamp string to a Date object
 */
export function parseTimestamp(timestamp: Timestamp): Date {
  return new Date(timestamp);
}

/**
 * Normalizes tags by removing duplicates and sorting alphabetically
 * Useful for deterministic hashing
 */
export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags)].sort();
}

/**
 * Adds a tag to an element's tags array if not already present
 */
export function addTag(element: Element, tag: string): string[] {
  validateTag(tag);
  if (element.tags.includes(tag)) {
    return element.tags;
  }
  const newTags = [...element.tags, tag];
  validateTags(newTags);
  return newTags;
}

/**
 * Removes a tag from an element's tags array
 */
export function removeTag(element: Element, tag: string): string[] {
  return element.tags.filter((t) => t !== tag);
}

/**
 * Checks if two elements are deeply equal
 */
export function elementsEqual(a: Element, b: Element): boolean {
  if (a.id !== b.id) return false;
  if (a.type !== b.type) return false;
  if (a.createdAt !== b.createdAt) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  if (a.createdBy !== b.createdBy) return false;

  // Compare tags (order-insensitive)
  const aTags = [...a.tags].sort();
  const bTags = [...b.tags].sort();
  if (aTags.length !== bTags.length) return false;
  if (!aTags.every((tag, i) => tag === bTags[i])) return false;

  // Compare metadata
  const aJson = JSON.stringify(a.metadata, Object.keys(a.metadata).sort());
  const bJson = JSON.stringify(b.metadata, Object.keys(b.metadata).sort());
  if (aJson !== bJson) return false;

  return true;
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Input for creating a new element (type-specific subtypes will extend this)
 */
export interface CreateElementInput {
  type: ElementType;
  createdBy: EntityId;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
