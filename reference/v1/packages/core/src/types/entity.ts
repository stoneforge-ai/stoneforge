/**
 * Entity Type - Identity for agents, humans, and system processes
 *
 * Entities represent identities within Stoneforge - AI agents, humans, or system processes.
 * They are the actors that create, modify, and interact with all other elements.
 * Entities support both soft (name-based) and cryptographic (key-based) identity models.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import { Element, ElementId, EntityId, ElementType, createTimestamp } from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Classification of entity types
 */
export const EntityTypeValue = {
  /** AI agent - automated actors performing work */
  AGENT: 'agent',
  /** Human user - manual actors in the system */
  HUMAN: 'human',
  /** System process - automated infrastructure */
  SYSTEM: 'system',
} as const;

export type EntityTypeValue = (typeof EntityTypeValue)[keyof typeof EntityTypeValue];

// ============================================================================
// Name Validation Constants
// ============================================================================

/** Minimum name length */
export const MIN_NAME_LENGTH = 1;

/** Maximum name length */
export const MAX_NAME_LENGTH = 100;

/**
 * Valid name pattern: must start with letter, then alphanumeric, hyphen, or underscore
 */
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Reserved entity names that cannot be used
 */
export const RESERVED_NAMES = ['system', 'anonymous', 'unknown'] as const;

export type ReservedName = (typeof RESERVED_NAMES)[number];

// ============================================================================
// Entity Interface
// ============================================================================

/**
 * Entity interface - extends Element with identity-specific properties
 */
export interface Entity extends Element {
  /** Entity type is always 'entity' */
  readonly type: typeof ElementType.ENTITY;
  /** System-wide unique identifier name */
  readonly name: string;
  /** Classification of the entity */
  readonly entityType: EntityTypeValue;
  /** Optional Ed25519 public key, base64 encoded (for cryptographic identity) */
  readonly publicKey?: string;
  /** Optional manager entity reference (for organizational hierarchy) */
  readonly reportsTo?: EntityId;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates an entity type value
 */
export function isValidEntityType(value: unknown): value is EntityTypeValue {
  return (
    typeof value === 'string' &&
    Object.values(EntityTypeValue).includes(value as EntityTypeValue)
  );
}

/**
 * Validates entity type and throws if invalid
 */
export function validateEntityType(value: unknown): EntityTypeValue {
  if (!isValidEntityType(value)) {
    throw new ValidationError(
      `Invalid entity type: ${value}. Must be one of: ${Object.values(EntityTypeValue).join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'entityType', value, expected: Object.values(EntityTypeValue) }
    );
  }
  return value;
}

/**
 * Checks if a name is reserved
 */
export function isReservedName(name: string): name is ReservedName {
  return RESERVED_NAMES.includes(name.toLowerCase() as ReservedName);
}

/**
 * Validates an entity name format (does not check uniqueness)
 */
export function isValidEntityName(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length < MIN_NAME_LENGTH || value.length > MAX_NAME_LENGTH) {
    return false;
  }
  if (!NAME_PATTERN.test(value)) {
    return false;
  }
  if (isReservedName(value)) {
    return false;
  }
  return true;
}

/**
 * Validates an entity name and throws detailed error if invalid
 */
export function validateEntityName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Entity name must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'string' }
    );
  }

  if (value.length === 0) {
    throw new ValidationError(
      'Entity name cannot be empty',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'name', value }
    );
  }

  if (value.length > MAX_NAME_LENGTH) {
    throw new ValidationError(
      `Entity name exceeds maximum length of ${MAX_NAME_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: `<= ${MAX_NAME_LENGTH} characters`, actual: value.length }
    );
  }

  if (!NAME_PATTERN.test(value)) {
    if (!/^[a-zA-Z]/.test(value)) {
      throw new ValidationError(
        'Entity name must start with a letter',
        ErrorCode.INVALID_INPUT,
        { field: 'name', value, expected: 'starts with [a-zA-Z]' }
      );
    }
    throw new ValidationError(
      'Entity name contains invalid characters. Only letters, numbers, hyphens, and underscores allowed after first character',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'pattern: ^[a-zA-Z][a-zA-Z0-9_-]*$' }
    );
  }

  if (isReservedName(value)) {
    throw new ValidationError(
      `Entity name '${value}' is reserved and cannot be used`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: `not one of: ${RESERVED_NAMES.join(', ')}` }
    );
  }

  return value;
}

/**
 * Base64 pattern for Ed25519 public keys (44 characters for 32 bytes)
 */
const BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Validates a base64-encoded Ed25519 public key format
 */
export function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Ed25519 public keys are 32 bytes, which encodes to 44 base64 characters with padding
  return BASE64_PATTERN.test(value);
}

/**
 * Validates a public key and throws if invalid format
 */
export function validatePublicKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Public key must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'publicKey', value, expected: 'string' }
    );
  }

  if (!BASE64_PATTERN.test(value)) {
    throw new ValidationError(
      'Invalid public key format. Expected base64-encoded Ed25519 public key (44 characters)',
      ErrorCode.INVALID_INPUT,
      { field: 'publicKey', value, expected: '44-character base64 string' }
    );
  }

  return value;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Entity
 */
export function isEntity(value: unknown): value is Entity {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check it has element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.ENTITY) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check entity-specific properties
  if (!isValidEntityName(obj.name)) return false;
  if (!isValidEntityType(obj.entityType)) return false;
  if (obj.publicKey !== undefined && !isValidPublicKey(obj.publicKey)) return false;

  return true;
}

/**
 * Comprehensive validation of an entity with detailed errors
 */
export function validateEntity(value: unknown): Entity {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Entity must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Entity id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.ENTITY) {
    throw new ValidationError(
      `Entity type must be '${ElementType.ENTITY}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.ENTITY }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError(
      'Entity createdAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdAt', value: obj.createdAt }
    );
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError(
      'Entity updatedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'updatedAt', value: obj.updatedAt }
    );
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Entity createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError(
      'Entity tags must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'tags', value: obj.tags, expected: 'array' }
    );
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError(
      'Entity metadata must be an object',
      ErrorCode.INVALID_INPUT,
      { field: 'metadata', value: obj.metadata, expected: 'object' }
    );
  }

  // Validate entity-specific fields
  validateEntityName(obj.name);
  validateEntityType(obj.entityType);

  if (obj.publicKey !== undefined) {
    validatePublicKey(obj.publicKey);
  }

  return value as Entity;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new entity
 */
export interface CreateEntityInput {
  /** System-wide unique identifier name */
  name: string;
  /** Classification of the entity */
  entityType: EntityTypeValue;
  /** Reference to the entity that created this entity */
  createdBy: EntityId;
  /** Optional Ed25519 public key, base64 encoded */
  publicKey?: string;
  /** Optional manager entity reference (for organizational hierarchy) */
  reportsTo?: EntityId;
  /** Optional tags */
  tags?: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Entity with validated inputs
 *
 * @param input - Entity creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Entity
 */
export async function createEntity(
  input: CreateEntityInput,
  config?: IdGeneratorConfig
): Promise<Entity> {
  // Validate inputs
  const name = validateEntityName(input.name);
  const entityType = validateEntityType(input.entityType);

  if (input.publicKey !== undefined) {
    validatePublicKey(input.publicKey);
  }

  const now = createTimestamp();
  const id = await generateId(
    { identifier: name, createdBy: input.createdBy },
    config
  );

  const entity: Entity = {
    id,
    type: ElementType.ENTITY,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    name,
    entityType,
    ...(input.publicKey !== undefined && { publicKey: input.publicKey }),
    ...(input.reportsTo !== undefined && { reportsTo: input.reportsTo }),
  };

  return entity;
}

/**
 * Input for updating an existing entity
 * Note: name cannot be updated as it's the unique identifier
 */
export interface UpdateEntityInput {
  /** Optional new Ed25519 public key, base64 encoded */
  publicKey?: string;
  /** Optional manager entity reference (null to clear, undefined to keep unchanged) */
  reportsTo?: EntityId | null;
  /** Optional tags to merge or replace */
  tags?: string[];
  /** Optional metadata to merge */
  metadata?: Record<string, unknown>;
}

/**
 * Updates an existing Entity with new metadata
 *
 * Can update:
 * - publicKey: Add or update cryptographic identity
 * - reportsTo: Set or clear manager reference (null to clear)
 * - tags: Replace tags
 * - metadata: Merge with existing metadata
 *
 * Cannot update:
 * - name: Unique identifier (immutable)
 * - entityType: Classification (immutable after creation)
 *
 * @param entity - The existing entity to update
 * @param input - Update input
 * @returns The updated Entity
 */
export function updateEntity(entity: Entity, input: UpdateEntityInput): Entity {
  // Validate public key if provided
  if (input.publicKey !== undefined) {
    validatePublicKey(input.publicKey);
  }

  const now = createTimestamp();

  // Handle reportsTo - null means clear, undefined means keep existing
  let reportsToValue: EntityId | undefined;
  if (input.reportsTo === null) {
    // Explicitly clear reportsTo - don't include it in the result
    reportsToValue = undefined;
  } else if (input.reportsTo !== undefined) {
    // Set new reportsTo value
    reportsToValue = input.reportsTo;
  } else {
    // Keep existing value
    reportsToValue = entity.reportsTo;
  }

  // Build the updated entity, excluding reportsTo from spread then conditionally adding it
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reportsTo: _existingReportsTo, ...entityWithoutReportsTo } = entity;

  const updated: Entity = {
    ...entityWithoutReportsTo,
    updatedAt: now,
    tags: input.tags !== undefined ? input.tags : entity.tags,
    metadata: input.metadata !== undefined
      ? { ...entity.metadata, ...input.metadata }
      : entity.metadata,
    ...(input.publicKey !== undefined && { publicKey: input.publicKey }),
    ...(reportsToValue !== undefined && { reportsTo: reportsToValue }),
    // If publicKey is explicitly undefined, keep existing
    // If publicKey is explicitly null, we would need to handle key removal
  };

  return updated;
}

// ============================================================================
// Key Rotation (Cryptographic Identity)
// ============================================================================

/**
 * Input for rotating an entity's public key
 *
 * Key rotation requires proof of ownership of the current key
 * by signing the rotation request.
 */
export interface KeyRotationInput {
  /** The new public key (base64-encoded Ed25519) */
  newPublicKey: string;
  /** Signature of the rotation request using the CURRENT private key */
  signature: string;
  /** Timestamp when the rotation was signed (ISO 8601) */
  signedAt: string;
}

/**
 * Result of a key rotation operation
 */
export interface KeyRotationResult {
  /** Whether the rotation was successful */
  success: boolean;
  /** The updated entity (if successful) */
  entity?: Entity;
  /** Error message (if failed) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'NO_CURRENT_KEY' | 'INVALID_NEW_KEY' | 'INVALID_SIGNATURE' | 'SIGNATURE_EXPIRED';
}

/**
 * Constructs the message to be signed for key rotation
 *
 * The message format is: "rotate-key:{entityId}:{newPublicKey}:{timestamp}"
 *
 * @param entityId - The entity whose key is being rotated
 * @param newPublicKey - The new public key being registered
 * @param timestamp - ISO 8601 timestamp of the rotation
 * @returns The string to be signed
 */
export function constructKeyRotationMessage(
  entityId: ElementId,
  newPublicKey: string,
  timestamp: string
): string {
  return `rotate-key:${entityId}:${newPublicKey}:${timestamp}`;
}

/**
 * Options for key rotation validation
 */
export interface KeyRotationOptions {
  /** Maximum age of signature in milliseconds (default: 5 minutes) */
  maxSignatureAge?: number;
  /** Whether to skip signature age validation (for testing) */
  skipTimestampValidation?: boolean;
}

/**
 * Default maximum signature age: 5 minutes
 */
export const DEFAULT_MAX_SIGNATURE_AGE = 5 * 60 * 1000;

/**
 * Validates key rotation input fields
 *
 * @param input - Key rotation input to validate
 * @throws ValidationError if input is invalid
 */
export function validateKeyRotationInput(input: unknown): KeyRotationInput {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError(
      'Key rotation input must be an object',
      ErrorCode.INVALID_INPUT,
      { value: input }
    );
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.newPublicKey !== 'string') {
    throw new ValidationError(
      'newPublicKey is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'newPublicKey' }
    );
  }

  validatePublicKey(obj.newPublicKey);

  if (typeof obj.signature !== 'string' || obj.signature.length === 0) {
    throw new ValidationError(
      'signature is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signature' }
    );
  }

  if (typeof obj.signedAt !== 'string' || obj.signedAt.length === 0) {
    throw new ValidationError(
      'signedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signedAt' }
    );
  }

  // Validate timestamp format
  const timestamp = new Date(obj.signedAt);
  if (isNaN(timestamp.getTime())) {
    throw new ValidationError(
      'signedAt must be a valid ISO 8601 timestamp',
      ErrorCode.INVALID_INPUT,
      { field: 'signedAt', value: obj.signedAt }
    );
  }

  return input as KeyRotationInput;
}

/**
 * Rotates an entity's public key with cryptographic verification
 *
 * This function requires:
 * 1. The entity to have an existing public key
 * 2. A valid signature of the rotation request using the CURRENT private key
 * 3. The new public key to be valid
 * 4. The signature timestamp to be within the allowed window
 *
 * This proves that the requester owns the current key and can authorize the transition.
 *
 * @param entity - The entity whose key is being rotated
 * @param input - Key rotation input with new key and signature
 * @param verifySignature - Function to verify Ed25519 signatures
 * @param options - Optional validation options
 * @returns Key rotation result
 */
export async function rotateEntityKey(
  entity: Entity,
  input: KeyRotationInput,
  verifySignature: (message: string, signature: string, publicKey: string) => Promise<boolean>,
  options: KeyRotationOptions = {}
): Promise<KeyRotationResult> {
  const maxAge = options.maxSignatureAge ?? DEFAULT_MAX_SIGNATURE_AGE;

  // Check if entity has a current public key
  if (!entity.publicKey) {
    return {
      success: false,
      error: 'Entity does not have a public key to rotate',
      errorCode: 'NO_CURRENT_KEY',
    };
  }

  // Validate the new public key
  try {
    validatePublicKey(input.newPublicKey);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Invalid new public key',
      errorCode: 'INVALID_NEW_KEY',
    };
  }

  // Check signature timestamp if not skipped
  if (!options.skipTimestampValidation) {
    const signedTime = new Date(input.signedAt).getTime();
    const now = Date.now();
    if (now - signedTime > maxAge) {
      return {
        success: false,
        error: `Signature has expired (signed ${Math.round((now - signedTime) / 1000)}s ago, max ${maxAge / 1000}s)`,
        errorCode: 'SIGNATURE_EXPIRED',
      };
    }
    if (signedTime > now + 60000) { // Allow 1 minute clock skew
      return {
        success: false,
        error: 'Signature timestamp is in the future',
        errorCode: 'INVALID_SIGNATURE',
      };
    }
  }

  // Construct the message that should have been signed
  const message = constructKeyRotationMessage(entity.id, input.newPublicKey, input.signedAt);

  // Verify the signature using the CURRENT public key
  let isValid: boolean;
  try {
    isValid = await verifySignature(message, input.signature, entity.publicKey);
  } catch (err) {
    return {
      success: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  if (!isValid) {
    return {
      success: false,
      error: 'Signature verification failed - not signed by current key holder',
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  // All checks passed - perform the key rotation
  const now = createTimestamp();
  const updatedEntity: Entity = {
    ...entity,
    publicKey: input.newPublicKey,
    updatedAt: now,
    metadata: {
      ...entity.metadata,
      keyRotatedAt: now,
      previousKeyHash: hashPublicKey(entity.publicKey),
    },
  };

  return {
    success: true,
    entity: updatedEntity,
  };
}

/**
 * Creates a simple hash of a public key for audit trail
 * Uses first 8 characters of base64 to identify the key
 */
function hashPublicKey(publicKey: string): string {
  return publicKey.substring(0, 8) + '...';
}

/**
 * Prepares a key rotation request for signing
 *
 * This is a convenience function that creates the data structure
 * needed to sign a key rotation request.
 *
 * @param entity - The entity whose key is being rotated
 * @param newPublicKey - The new public key
 * @returns Object with message to sign and timestamp to use
 */
export function prepareKeyRotation(
  entity: Entity,
  newPublicKey: string
): { message: string; timestamp: string } {
  const timestamp = createTimestamp();
  const message = constructKeyRotationMessage(entity.id, newPublicKey, timestamp);
  return { message, timestamp };
}

// ============================================================================
// Key Revocation (Cryptographic Identity)
// ============================================================================

/**
 * Input for revoking an entity's public key
 *
 * Key revocation removes the public key from an entity, converting it
 * to a soft-identity entity. This requires proof of ownership via signature.
 */
export interface KeyRevocationInput {
  /** Reason for revoking the key */
  reason?: string;
  /** Signature of the revocation request using the CURRENT private key */
  signature: string;
  /** Timestamp when the revocation was signed (ISO 8601) */
  signedAt: string;
}

/**
 * Result of a key revocation operation
 */
export interface KeyRevocationResult {
  /** Whether the revocation was successful */
  success: boolean;
  /** The updated entity (if successful) */
  entity?: Entity;
  /** Error message (if failed) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'NO_CURRENT_KEY' | 'INVALID_SIGNATURE' | 'SIGNATURE_EXPIRED' | 'ALREADY_REVOKED';
}

/**
 * Constructs the message to be signed for key revocation
 *
 * The message format is: "revoke-key:{entityId}:{timestamp}"
 *
 * @param entityId - The entity whose key is being revoked
 * @param timestamp - ISO 8601 timestamp of the revocation
 * @returns The string to be signed
 */
export function constructKeyRevocationMessage(
  entityId: ElementId,
  timestamp: string
): string {
  return `revoke-key:${entityId}:${timestamp}`;
}

/**
 * Options for key revocation validation
 */
export interface KeyRevocationOptions {
  /** Maximum age of signature in milliseconds (default: 5 minutes) */
  maxSignatureAge?: number;
  /** Whether to skip signature age validation (for testing) */
  skipTimestampValidation?: boolean;
}

/**
 * Validates key revocation input fields
 *
 * @param input - Key revocation input to validate
 * @throws ValidationError if input is invalid
 */
export function validateKeyRevocationInput(input: unknown): KeyRevocationInput {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError(
      'Key revocation input must be an object',
      ErrorCode.INVALID_INPUT,
      { value: input }
    );
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.signature !== 'string' || obj.signature.length === 0) {
    throw new ValidationError(
      'signature is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signature' }
    );
  }

  if (typeof obj.signedAt !== 'string' || obj.signedAt.length === 0) {
    throw new ValidationError(
      'signedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signedAt' }
    );
  }

  // Validate timestamp format
  const timestamp = new Date(obj.signedAt);
  if (isNaN(timestamp.getTime())) {
    throw new ValidationError(
      'signedAt must be a valid ISO 8601 timestamp',
      ErrorCode.INVALID_INPUT,
      { field: 'signedAt', value: obj.signedAt }
    );
  }

  return input as KeyRevocationInput;
}

/**
 * Revokes an entity's public key with cryptographic verification
 *
 * This function requires:
 * 1. The entity to have an existing public key
 * 2. A valid signature of the revocation request using the CURRENT private key
 * 3. The signature timestamp to be within the allowed window
 *
 * After revocation:
 * - The entity's publicKey is removed
 * - The entity becomes a soft-identity entity
 * - Revocation details are stored in metadata for audit
 * - Previous key hash is preserved for reference
 *
 * @param entity - The entity whose key is being revoked
 * @param input - Key revocation input with signature
 * @param verifySignature - Function to verify Ed25519 signatures
 * @param options - Optional validation options
 * @returns Key revocation result
 */
export async function revokeEntityKey(
  entity: Entity,
  input: KeyRevocationInput,
  verifySignature: (message: string, signature: string, publicKey: string) => Promise<boolean>,
  options: KeyRevocationOptions = {}
): Promise<KeyRevocationResult> {
  const maxAge = options.maxSignatureAge ?? DEFAULT_MAX_SIGNATURE_AGE;

  // Check if entity has a current public key
  if (!entity.publicKey) {
    // Check if key was previously revoked
    if (entity.metadata?.keyRevokedAt) {
      return {
        success: false,
        error: 'Entity key has already been revoked',
        errorCode: 'ALREADY_REVOKED',
      };
    }
    return {
      success: false,
      error: 'Entity does not have a public key to revoke',
      errorCode: 'NO_CURRENT_KEY',
    };
  }

  // Check signature timestamp if not skipped
  if (!options.skipTimestampValidation) {
    const signedTime = new Date(input.signedAt).getTime();
    const now = Date.now();
    if (now - signedTime > maxAge) {
      return {
        success: false,
        error: `Signature has expired (signed ${Math.round((now - signedTime) / 1000)}s ago, max ${maxAge / 1000}s)`,
        errorCode: 'SIGNATURE_EXPIRED',
      };
    }
    if (signedTime > now + 60000) { // Allow 1 minute clock skew
      return {
        success: false,
        error: 'Signature timestamp is in the future',
        errorCode: 'INVALID_SIGNATURE',
      };
    }
  }

  // Construct the message that should have been signed
  const message = constructKeyRevocationMessage(entity.id, input.signedAt);

  // Verify the signature using the CURRENT public key
  let isValid: boolean;
  try {
    isValid = await verifySignature(message, input.signature, entity.publicKey);
  } catch (err) {
    return {
      success: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  if (!isValid) {
    return {
      success: false,
      error: 'Signature verification failed - not signed by current key holder',
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  // All checks passed - perform the key revocation
  const now = createTimestamp();

  // Remove publicKey and add revocation metadata
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { publicKey: _removedKey, ...entityWithoutKey } = entity;

  const updatedEntity: Entity = {
    ...entityWithoutKey,
    updatedAt: now,
    metadata: {
      ...entity.metadata,
      keyRevokedAt: now,
      revokedKeyHash: hashPublicKey(entity.publicKey),
      ...(input.reason && { keyRevocationReason: input.reason }),
    },
  };

  return {
    success: true,
    entity: updatedEntity,
  };
}

/**
 * Prepares a key revocation request for signing
 *
 * This is a convenience function that creates the data structure
 * needed to sign a key revocation request.
 *
 * @param entity - The entity whose key is being revoked
 * @returns Object with message to sign and timestamp to use
 */
export function prepareKeyRevocation(
  entity: Entity
): { message: string; timestamp: string } {
  const timestamp = createTimestamp();
  const message = constructKeyRevocationMessage(entity.id, timestamp);
  return { message, timestamp };
}

/**
 * Checks if an entity's key has been revoked
 *
 * @param entity - The entity to check
 * @returns True if the entity's key has been revoked
 */
export function isKeyRevoked(entity: Entity): boolean {
  return entity.metadata?.keyRevokedAt !== undefined && !entity.publicKey;
}

/**
 * Gets key revocation details from an entity
 *
 * @param entity - The entity to get revocation details from
 * @returns Revocation details or null if not revoked
 */
export function getKeyRevocationDetails(entity: Entity): {
  revokedAt: string;
  revokedKeyHash: string;
  reason?: string;
} | null {
  if (!isKeyRevoked(entity)) {
    return null;
  }

  const metadata = entity.metadata as {
    keyRevokedAt?: string;
    revokedKeyHash?: string;
    keyRevocationReason?: string;
  };

  if (!metadata.keyRevokedAt || !metadata.revokedKeyHash) {
    return null;
  }

  return {
    revokedAt: metadata.keyRevokedAt,
    revokedKeyHash: metadata.revokedKeyHash,
    reason: metadata.keyRevocationReason,
  };
}

/**
 * Filter entities whose keys have been revoked
 */
export function filterRevokedKeyEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter(isKeyRevoked);
}

/**
 * Filter entities whose keys have NOT been revoked
 * (includes entities that never had keys and those with active keys)
 */
export function filterNonRevokedKeyEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter((e) => !isKeyRevoked(e));
}

// ============================================================================
// Entity Deactivation
// ============================================================================

/**
 * Input for deactivating an entity
 */
export interface DeactivateEntityInput {
  /** Reason for deactivation */
  reason?: string;
  /** Entity performing the deactivation */
  deactivatedBy: EntityId;
}

/**
 * Deactivates an entity by marking it as inactive in metadata
 *
 * Deactivated entities:
 * - Have metadata.active = false
 * - Have metadata.deactivatedAt timestamp
 * - Have metadata.deactivatedBy reference
 * - Have optional metadata.deactivationReason
 * - Are preserved in the system for historical references
 * - Should be filtered from active entity listings
 *
 * @param entity - The entity to deactivate
 * @param input - Deactivation input
 * @returns The deactivated entity
 */
export function deactivateEntity(entity: Entity, input: DeactivateEntityInput): Entity {
  const now = createTimestamp();

  return {
    ...entity,
    updatedAt: now,
    metadata: {
      ...entity.metadata,
      active: false,
      deactivatedAt: now,
      deactivatedBy: input.deactivatedBy,
      ...(input.reason && { deactivationReason: input.reason }),
    },
  };
}

/**
 * Reactivates a previously deactivated entity
 *
 * @param entity - The entity to reactivate
 * @param reactivatedBy - Entity performing the reactivation
 * @returns The reactivated entity
 */
export function reactivateEntity(entity: Entity, reactivatedBy: EntityId): Entity {
  const now = createTimestamp();

  // Remove deactivation metadata
  const { active, deactivatedAt, deactivatedBy, deactivationReason, ...restMetadata } = entity.metadata as {
    active?: boolean;
    deactivatedAt?: string;
    deactivatedBy?: string;
    deactivationReason?: string;
    [key: string]: unknown;
  };

  return {
    ...entity,
    updatedAt: now,
    metadata: {
      ...restMetadata,
      active: true,
      reactivatedAt: now,
      reactivatedBy,
    },
  };
}

/**
 * Checks if an entity is active (not deactivated)
 */
export function isEntityActive(entity: Entity): boolean {
  // Entity is active if metadata.active is not explicitly false
  if (entity.metadata && typeof entity.metadata.active === 'boolean') {
    return entity.metadata.active;
  }
  // Default to active if not explicitly deactivated
  return true;
}

/**
 * Checks if an entity is deactivated
 */
export function isEntityDeactivated(entity: Entity): boolean {
  return !isEntityActive(entity);
}

/**
 * Gets deactivation details from an entity
 */
export function getDeactivationDetails(entity: Entity): {
  deactivatedAt?: string;
  deactivatedBy?: string;
  reason?: string;
} | null {
  if (isEntityActive(entity)) {
    return null;
  }

  const metadata = entity.metadata as {
    deactivatedAt?: string;
    deactivatedBy?: string;
    deactivationReason?: string;
  };

  return {
    deactivatedAt: metadata.deactivatedAt,
    deactivatedBy: metadata.deactivatedBy,
    reason: metadata.deactivationReason,
  };
}

/**
 * Filter active entities from a list
 */
export function filterActiveEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter(isEntityActive);
}

/**
 * Filter deactivated entities from a list
 */
export function filterDeactivatedEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter(isEntityDeactivated);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if an entity has cryptographic identity (public key)
 */
export function hasCryptographicIdentity(entity: Entity): boolean {
  return entity.publicKey !== undefined;
}

/**
 * Gets a display name for an entity from metadata or falls back to name
 */
export function getEntityDisplayName(entity: Entity): string {
  if (entity.metadata && typeof entity.metadata.displayName === 'string') {
    return entity.metadata.displayName;
  }
  return entity.name;
}

/**
 * Checks if two entities represent the same identity (by name)
 */
export function entitiesHaveSameName(a: Entity, b: Entity): boolean {
  return a.name === b.name;
}

/**
 * Filter type for querying entities by their entity type
 */
export function filterByEntityType<T extends Entity>(
  entities: T[],
  entityType: EntityTypeValue
): T[] {
  return entities.filter((e) => e.entityType === entityType);
}

// ============================================================================
// Search and Filter Functions
// ============================================================================

/**
 * Filter entities by creator
 */
export function filterByCreator<T extends Entity>(entities: T[], createdBy: EntityId): T[] {
  return entities.filter((e) => e.createdBy === createdBy);
}

/**
 * Filter entities that have a public key (cryptographic identity)
 */
export function filterWithPublicKey<T extends Entity>(entities: T[]): T[] {
  return entities.filter(hasCryptographicIdentity);
}

/**
 * Filter entities that do not have a public key (soft identity only)
 */
export function filterWithoutPublicKey<T extends Entity>(entities: T[]): T[] {
  return entities.filter((e) => !hasCryptographicIdentity(e));
}

/**
 * Filter entities by tag (must have the tag)
 */
export function filterByTag<T extends Entity>(entities: T[], tag: string): T[] {
  return entities.filter((e) => e.tags.includes(tag));
}

/**
 * Filter entities by any of the specified tags
 */
export function filterByAnyTag<T extends Entity>(entities: T[], tags: string[]): T[] {
  return entities.filter((e) => tags.some((tag) => e.tags.includes(tag)));
}

/**
 * Filter entities by all specified tags
 */
export function filterByAllTags<T extends Entity>(entities: T[], tags: string[]): T[] {
  return entities.filter((e) => tags.every((tag) => e.tags.includes(tag)));
}

// ============================================================================
// Sort Functions
// ============================================================================

/**
 * Sort entities by name alphabetically
 */
export function sortByName<T extends Entity>(entities: T[], ascending = true): T[] {
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name));
  return ascending ? sorted : sorted.reverse();
}

/**
 * Sort entities by creation date
 */
export function sortByCreationDate<T extends Entity>(entities: T[], ascending = false): T[] {
  const sorted = [...entities].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return ascending ? sorted : sorted.reverse();
}

/**
 * Sort entities by update date
 */
export function sortByUpdateDate<T extends Entity>(entities: T[], ascending = false): T[] {
  const sorted = [...entities].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return ascending ? sorted : sorted.reverse();
}

/**
 * Sort entities by entity type
 */
export function sortByEntityType<T extends Entity>(entities: T[]): T[] {
  const typeOrder = { agent: 0, human: 1, system: 2 };
  return [...entities].sort((a, b) =>
    (typeOrder[a.entityType as keyof typeof typeOrder] ?? 3) -
    (typeOrder[b.entityType as keyof typeof typeOrder] ?? 3)
  );
}

// ============================================================================
// Group Functions
// ============================================================================

/**
 * Group entities by their entity type
 */
export function groupByEntityType<T extends Entity>(entities: T[]): Map<EntityTypeValue, T[]> {
  const groups = new Map<EntityTypeValue, T[]>();
  for (const entity of entities) {
    const existing = groups.get(entity.entityType) ?? [];
    groups.set(entity.entityType, [...existing, entity]);
  }
  return groups;
}

/**
 * Group entities by creator
 */
export function groupByCreator<T extends Entity>(entities: T[]): Map<EntityId, T[]> {
  const groups = new Map<EntityId, T[]>();
  for (const entity of entities) {
    const existing = groups.get(entity.createdBy) ?? [];
    groups.set(entity.createdBy, [...existing, entity]);
  }
  return groups;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search entities by name (case-insensitive substring match)
 */
export function searchByName<T extends Entity>(entities: T[], query: string): T[] {
  const lowerQuery = query.toLowerCase();
  return entities.filter((e) => e.name.toLowerCase().includes(lowerQuery));
}

/**
 * Find entity by exact name
 */
export function findByName<T extends Entity>(entities: T[], name: string): T | undefined {
  return entities.find((e) => e.name === name);
}

/**
 * Find entity by ID
 */
export function findById<T extends Entity>(entities: T[], id: EntityId | string): T | undefined {
  return entities.find((e) => e.id === id);
}

/**
 * Check if a name is unique among entities
 */
export function isNameUnique(entities: Entity[], name: string, excludeId?: EntityId | string): boolean {
  return !entities.some((e) => e.name === name && e.id !== excludeId);
}

/**
 * Get unique tags from a list of entities
 */
export function getUniqueTags(entities: Entity[]): string[] {
  const tagSet = new Set<string>();
  for (const entity of entities) {
    for (const tag of entity.tags) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}

/**
 * Count entities by type
 */
export function countByEntityType(entities: Entity[]): Record<EntityTypeValue, number> {
  const counts: Record<EntityTypeValue, number> = {
    agent: 0,
    human: 0,
    system: 0,
  };
  for (const entity of entities) {
    counts[entity.entityType]++;
  }
  return counts;
}

// ============================================================================
// Entity Assignment Query Utilities
// ============================================================================

/**
 * Interface for elements that can have an assignee (like Task)
 */
export interface Assignable {
  id: string;
  assignee?: string;
  createdBy: string;
}

/**
 * Get all items assigned to an entity
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to filter by
 * @returns Items assigned to the specified entity
 */
export function getAssignedTo<T extends Assignable>(items: T[], entityId: string): T[] {
  return items.filter((item) => item.assignee === entityId);
}

/**
 * Get all items created by an entity
 *
 * @param items - Array of items with createdBy
 * @param entityId - Entity ID to filter by
 * @returns Items created by the specified entity
 */
export function getCreatedBy<T extends Assignable>(items: T[], entityId: string): T[] {
  return items.filter((item) => item.createdBy === entityId);
}

/**
 * Get all items where entity is either assignee or creator
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to filter by
 * @returns Items where entity is assignee or creator
 */
export function getRelatedTo<T extends Assignable>(items: T[], entityId: string): T[] {
  return items.filter((item) => item.assignee === entityId || item.createdBy === entityId);
}

/**
 * Count items assigned to each entity
 *
 * @param items - Array of assignable items
 * @returns Map of entity ID to count of assigned items
 */
export function countAssignmentsByEntity<T extends Assignable>(items: T[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.assignee) {
      counts.set(item.assignee, (counts.get(item.assignee) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Get entities with the most assignments
 *
 * @param items - Array of assignable items
 * @param limit - Maximum number of entities to return
 * @returns Array of [entityId, count] sorted by count descending
 */
export function getTopAssignees<T extends Assignable>(
  items: T[],
  limit?: number
): Array<[string, number]> {
  const counts = countAssignmentsByEntity(items);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/**
 * Check if an entity has any assignments
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to check
 * @returns True if entity has at least one assignment
 */
export function hasAssignments<T extends Assignable>(items: T[], entityId: string): boolean {
  return items.some((item) => item.assignee === entityId);
}

/**
 * Get unassigned items (items with no assignee)
 *
 * @param items - Array of assignable items
 * @returns Items with no assignee
 */
export function getUnassigned<T extends Assignable>(items: T[]): T[] {
  return items.filter((item) => item.assignee === undefined);
}

/**
 * Get assignment statistics for an entity
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to get stats for
 * @returns Statistics object with counts
 */
export function getEntityAssignmentStats<T extends Assignable>(
  items: T[],
  entityId: string
): {
  assignedCount: number;
  createdCount: number;
  totalRelated: number;
} {
  let assignedCount = 0;
  let createdCount = 0;
  const relatedIds = new Set<string>();

  for (const item of items) {
    if (item.assignee === entityId) {
      assignedCount++;
      relatedIds.add(item.id);
    }
    if (item.createdBy === entityId) {
      createdCount++;
      relatedIds.add(item.id);
    }
  }

  return {
    assignedCount,
    createdCount,
    totalRelated: relatedIds.size,
  };
}

// ============================================================================
// Team Membership Integration
// ============================================================================

/**
 * Interface for team-like objects (minimal interface for entity queries)
 * This allows entity module to work with teams without creating circular dependencies
 */
export interface TeamLike {
  id: string;
  name: string;
  members: string[];
}

/**
 * Get all teams that an entity is a member of
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to find memberships for
 * @returns Teams that contain the entity as a member
 */
export function getEntityTeamMemberships<T extends TeamLike>(teams: T[], entityId: string): T[] {
  return teams.filter((team) => team.members.includes(entityId));
}

/**
 * Count the number of teams an entity belongs to
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to count memberships for
 * @returns Number of teams the entity is a member of
 */
export function countEntityTeamMemberships(teams: TeamLike[], entityId: string): number {
  return teams.filter((team) => team.members.includes(entityId)).length;
}

/**
 * Check if an entity is a member of any team
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to check
 * @returns True if the entity is a member of at least one team
 */
export function isEntityInAnyTeam(teams: TeamLike[], entityId: string): boolean {
  return teams.some((team) => team.members.includes(entityId));
}

/**
 * Check if an entity is a member of a specific team
 *
 * @param team - Team to check membership in
 * @param entityId - The entity ID to check
 * @returns True if the entity is a member of the team
 */
export function isEntityInTeam(team: TeamLike, entityId: string): boolean {
  return team.members.includes(entityId);
}

/**
 * Get all unique team IDs that an entity belongs to
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to find memberships for
 * @returns Array of team IDs
 */
export function getEntityTeamIds<T extends TeamLike>(teams: T[], entityId: string): string[] {
  return teams.filter((team) => team.members.includes(entityId)).map((team) => team.id);
}

/**
 * Get all unique team names that an entity belongs to
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to find memberships for
 * @returns Array of team names
 */
export function getEntityTeamNames<T extends TeamLike>(teams: T[], entityId: string): string[] {
  return teams.filter((team) => team.members.includes(entityId)).map((team) => team.name);
}

/**
 * Get entities that share team membership with a given entity
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to find co-members for
 * @returns Array of unique entity IDs that share at least one team with the given entity
 */
export function getTeammates<T extends TeamLike>(teams: T[], entityId: string): string[] {
  const teammates = new Set<string>();

  for (const team of teams) {
    if (team.members.includes(entityId)) {
      for (const member of team.members) {
        if (member !== entityId) {
          teammates.add(member);
        }
      }
    }
  }

  return Array.from(teammates);
}

/**
 * Count the number of teammates (unique entities that share teams with entity)
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to count teammates for
 * @returns Number of unique teammates
 */
export function countTeammates<T extends TeamLike>(teams: T[], entityId: string): number {
  return getTeammates(teams, entityId).length;
}

/**
 * Team membership statistics for an entity
 */
export interface EntityTeamMembershipStats {
  /** Number of teams the entity belongs to */
  teamCount: number;
  /** Number of unique teammates (entities that share teams) */
  teammateCount: number;
  /** Team IDs the entity belongs to */
  teamIds: string[];
  /** Team names the entity belongs to */
  teamNames: string[];
}

/**
 * Get comprehensive team membership statistics for an entity
 *
 * @param teams - Array of teams to search
 * @param entityId - The entity ID to get stats for
 * @returns Membership statistics
 */
export function getEntityTeamMembershipStats<T extends TeamLike>(
  teams: T[],
  entityId: string
): EntityTeamMembershipStats {
  const entityTeams = teams.filter((team) => team.members.includes(entityId));
  const teammates = new Set<string>();

  for (const team of entityTeams) {
    for (const member of team.members) {
      if (member !== entityId) {
        teammates.add(member);
      }
    }
  }

  return {
    teamCount: entityTeams.length,
    teammateCount: teammates.size,
    teamIds: entityTeams.map((team) => team.id),
    teamNames: entityTeams.map((team) => team.name),
  };
}

/**
 * Filter entities that are members of a specific team
 *
 * @param entities - Array of entities to filter
 * @param team - Team to check membership against
 * @returns Entities that are members of the team
 */
export function filterEntitiesByTeamMembership<T extends Entity>(
  entities: T[],
  team: TeamLike
): T[] {
  return entities.filter((entity) => team.members.includes(entity.id));
}

/**
 * Filter entities that are members of any of the specified teams
 *
 * @param entities - Array of entities to filter
 * @param teams - Teams to check membership against
 * @returns Entities that are members of at least one of the teams
 */
export function filterEntitiesByAnyTeamMembership<T extends Entity>(
  entities: T[],
  teams: TeamLike[]
): T[] {
  const memberIds = new Set<string>();
  for (const team of teams) {
    for (const memberId of team.members) {
      memberIds.add(memberId);
    }
  }
  return entities.filter((entity) => memberIds.has(entity.id));
}

/**
 * Filter entities that are not members of any team
 *
 * @param entities - Array of entities to filter
 * @param teams - All teams to check membership against
 * @returns Entities that are not members of any team
 */
export function filterEntitiesWithoutTeam<T extends Entity>(
  entities: T[],
  teams: TeamLike[]
): T[] {
  const allMemberIds = new Set<string>();
  for (const team of teams) {
    for (const memberId of team.members) {
      allMemberIds.add(memberId);
    }
  }
  return entities.filter((entity) => !allMemberIds.has(entity.id));
}

/**
 * Get entities that share the same teams (same team memberships)
 *
 * @param entities - Array of entities
 * @param teams - Array of teams
 * @param entityId - The entity to find matching entities for
 * @returns Entities that belong to exactly the same teams
 */
export function findEntitiesWithSameTeams<T extends Entity>(
  entities: T[],
  teams: TeamLike[],
  entityId: string
): T[] {
  const entityTeamIds = new Set(
    teams.filter((t) => t.members.includes(entityId)).map((t) => t.id)
  );

  return entities.filter((entity) => {
    if (entity.id === entityId) return false;
    const otherTeamIds = new Set(
      teams.filter((t) => t.members.includes(entity.id)).map((t) => t.id)
    );
    if (entityTeamIds.size !== otherTeamIds.size) return false;
    for (const id of entityTeamIds) {
      if (!otherTeamIds.has(id)) return false;
    }
    return true;
  });
}

// ============================================================================
// Channel Membership Integration
// ============================================================================

/**
 * Interface for channel-like objects (minimal interface for entity queries)
 * This allows entity module to work with channels without creating circular dependencies
 */
export interface ChannelLike {
  id: string;
  name: string;
  members: readonly string[];
  channelType: 'direct' | 'group';
}

/**
 * Get all channels that an entity is a member of
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to find memberships for
 * @returns Channels that contain the entity as a member
 */
export function getEntityChannelMemberships<T extends ChannelLike>(channels: T[], entityId: string): T[] {
  return channels.filter((channel) => channel.members.includes(entityId));
}

/**
 * Count the number of channels an entity belongs to
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to count memberships for
 * @returns Number of channels the entity is a member of
 */
export function countEntityChannelMemberships(channels: ChannelLike[], entityId: string): number {
  return channels.filter((channel) => channel.members.includes(entityId)).length;
}

/**
 * Check if an entity is a member of any channel
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to check
 * @returns True if the entity is a member of at least one channel
 */
export function isEntityInAnyChannel(channels: ChannelLike[], entityId: string): boolean {
  return channels.some((channel) => channel.members.includes(entityId));
}

/**
 * Check if an entity is a member of a specific channel
 *
 * @param channel - Channel to check membership in
 * @param entityId - The entity ID to check
 * @returns True if the entity is a member of the channel
 */
export function isEntityInChannel(channel: ChannelLike, entityId: string): boolean {
  return channel.members.includes(entityId);
}

/**
 * Get all unique channel IDs that an entity belongs to
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to find memberships for
 * @returns Array of channel IDs
 */
export function getEntityChannelIds<T extends ChannelLike>(channels: T[], entityId: string): string[] {
  return channels.filter((channel) => channel.members.includes(entityId)).map((channel) => channel.id);
}

/**
 * Get all unique channel names that an entity belongs to
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to find memberships for
 * @returns Array of channel names
 */
export function getEntityChannelNames<T extends ChannelLike>(channels: T[], entityId: string): string[] {
  return channels.filter((channel) => channel.members.includes(entityId)).map((channel) => channel.name);
}

/**
 * Get entities that share channel membership with a given entity
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to find co-members for
 * @returns Array of unique entity IDs that share at least one channel with the given entity
 */
export function getChannelmates<T extends ChannelLike>(channels: T[], entityId: string): string[] {
  const channelmates = new Set<string>();

  for (const channel of channels) {
    if (channel.members.includes(entityId)) {
      for (const member of channel.members) {
        if (member !== entityId) {
          channelmates.add(member);
        }
      }
    }
  }

  return Array.from(channelmates);
}

/**
 * Count the number of channelmates (unique entities that share channels with entity)
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to count channelmates for
 * @returns Number of unique channelmates
 */
export function countChannelmates<T extends ChannelLike>(channels: T[], entityId: string): number {
  return getChannelmates(channels, entityId).length;
}

/**
 * Channel membership statistics for an entity
 */
export interface EntityChannelMembershipStats {
  /** Number of channels the entity belongs to */
  channelCount: number;
  /** Number of direct channels */
  directChannelCount: number;
  /** Number of group channels */
  groupChannelCount: number;
  /** Number of unique channelmates (entities that share channels) */
  channelmateCount: number;
  /** Channel IDs the entity belongs to */
  channelIds: string[];
  /** Channel names the entity belongs to */
  channelNames: string[];
}

/**
 * Get comprehensive channel membership statistics for an entity
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to get stats for
 * @returns Membership statistics
 */
export function getEntityChannelMembershipStats<T extends ChannelLike>(
  channels: T[],
  entityId: string
): EntityChannelMembershipStats {
  const entityChannels = channels.filter((channel) => channel.members.includes(entityId));
  const channelmates = new Set<string>();

  let directChannelCount = 0;
  let groupChannelCount = 0;

  for (const channel of entityChannels) {
    if (channel.channelType === 'direct') {
      directChannelCount++;
    } else {
      groupChannelCount++;
    }

    for (const member of channel.members) {
      if (member !== entityId) {
        channelmates.add(member);
      }
    }
  }

  return {
    channelCount: entityChannels.length,
    directChannelCount,
    groupChannelCount,
    channelmateCount: channelmates.size,
    channelIds: entityChannels.map((channel) => channel.id),
    channelNames: entityChannels.map((channel) => channel.name),
  };
}

/**
 * Filter entities that are members of a specific channel
 *
 * @param entities - Array of entities to filter
 * @param channel - Channel to check membership against
 * @returns Entities that are members of the channel
 */
export function filterEntitiesByChannelMembership<T extends Entity>(
  entities: T[],
  channel: ChannelLike
): T[] {
  return entities.filter((entity) => channel.members.includes(entity.id));
}

/**
 * Filter entities that are members of any of the specified channels
 *
 * @param entities - Array of entities to filter
 * @param channels - Channels to check membership against
 * @returns Entities that are members of at least one of the channels
 */
export function filterEntitiesByAnyChannelMembership<T extends Entity>(
  entities: T[],
  channels: ChannelLike[]
): T[] {
  const memberIds = new Set<string>();
  for (const channel of channels) {
    for (const memberId of channel.members) {
      memberIds.add(memberId);
    }
  }
  return entities.filter((entity) => memberIds.has(entity.id));
}

/**
 * Filter entities that are not members of any channel
 *
 * @param entities - Array of entities to filter
 * @param channels - All channels to check membership against
 * @returns Entities that are not members of any channel
 */
export function filterEntitiesWithoutChannel<T extends Entity>(
  entities: T[],
  channels: ChannelLike[]
): T[] {
  const allMemberIds = new Set<string>();
  for (const channel of channels) {
    for (const memberId of channel.members) {
      allMemberIds.add(memberId);
    }
  }
  return entities.filter((entity) => !allMemberIds.has(entity.id));
}

/**
 * Get entities that share the same channels (same channel memberships)
 *
 * @param entities - Array of entities
 * @param channels - Array of channels
 * @param entityId - The entity to find matching entities for
 * @returns Entities that belong to exactly the same channels
 */
export function findEntitiesWithSameChannels<T extends Entity>(
  entities: T[],
  channels: ChannelLike[],
  entityId: string
): T[] {
  const entityChannelIds = new Set(
    channels.filter((c) => c.members.includes(entityId)).map((c) => c.id)
  );

  return entities.filter((entity) => {
    if (entity.id === entityId) return false;
    const otherChannelIds = new Set(
      channels.filter((c) => c.members.includes(entity.id)).map((c) => c.id)
    );
    if (entityChannelIds.size !== otherChannelIds.size) return false;
    for (const id of entityChannelIds) {
      if (!otherChannelIds.has(id)) return false;
    }
    return true;
  });
}

/**
 * Get direct channels for an entity
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to find direct channels for
 * @returns Direct channels that contain the entity
 */
export function getEntityDirectChannels<T extends ChannelLike>(channels: T[], entityId: string): T[] {
  return channels.filter(
    (channel) => channel.channelType === 'direct' && channel.members.includes(entityId)
  );
}

/**
 * Get group channels for an entity
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to find group channels for
 * @returns Group channels that contain the entity
 */
export function getEntityGroupChannels<T extends ChannelLike>(channels: T[], entityId: string): T[] {
  return channels.filter(
    (channel) => channel.channelType === 'group' && channel.members.includes(entityId)
  );
}

/**
 * Get the other entity in a direct channel
 *
 * @param channel - Direct channel to examine
 * @param entityId - The entity ID to find the counterpart for
 * @returns The other entity ID in the direct channel, or null if not a direct channel or entity not a member
 */
export function getDirectChannelCounterpart(channel: ChannelLike, entityId: string): string | null {
  if (channel.channelType !== 'direct') {
    return null;
  }
  if (!channel.members.includes(entityId)) {
    return null;
  }
  const counterpart = channel.members.find((m) => m !== entityId);
  return counterpart ?? null;
}

/**
 * Get all entities that an entity has direct channels with
 *
 * @param channels - Array of channels to search
 * @param entityId - The entity ID to find direct message partners for
 * @returns Array of entity IDs that have direct channels with the given entity
 */
export function getDirectMessagePartners<T extends ChannelLike>(channels: T[], entityId: string): string[] {
  const partners = new Set<string>();

  for (const channel of channels) {
    if (channel.channelType === 'direct' && channel.members.includes(entityId)) {
      const counterpart = getDirectChannelCounterpart(channel, entityId);
      if (counterpart) {
        partners.add(counterpart);
      }
    }
  }

  return Array.from(partners);
}

// ============================================================================
// Message Sender Integration
// ============================================================================

/**
 * Interface for message-like objects (minimal interface for entity queries)
 * This allows entity module to work with messages without creating circular dependencies
 */
export interface MessageLike {
  id: string;
  sender: string;
  channelId: string;
  createdAt: string;
}

/**
 * Validates that an entity exists and can be a message sender
 *
 * In soft identity mode: validates that the entity ID exists in the entities array
 * This function performs the basic existence check for sender validation.
 *
 * @param entities - Array of entities to search
 * @param senderId - The sender ID to validate
 * @returns True if the sender is a valid entity
 */
export function isValidMessageSender<T extends Entity>(entities: T[], senderId: string): boolean {
  return entities.some((e) => e.id === senderId);
}

/**
 * Validates that an entity can send messages to a channel
 *
 * Checks both:
 * 1. The entity exists (is a valid sender)
 * 2. The entity is a member of the target channel
 *
 * @param entities - Array of entities to search
 * @param channel - Target channel for the message
 * @param senderId - The sender ID to validate
 * @returns True if the sender can send to the channel
 */
export function canSendToChannel<T extends Entity>(
  entities: T[],
  channel: ChannelLike,
  senderId: string
): boolean {
  // First check if sender is a valid entity
  if (!isValidMessageSender(entities, senderId)) {
    return false;
  }
  // Then check if sender is a member of the channel
  return channel.members.includes(senderId);
}

/**
 * Result of sender validation
 */
export interface SenderValidationResult {
  /** Whether the sender is valid */
  valid: boolean;
  /** Error code if invalid */
  errorCode?: 'ENTITY_NOT_FOUND' | 'NOT_CHANNEL_MEMBER' | 'ENTITY_DEACTIVATED';
  /** Human-readable error message if invalid */
  errorMessage?: string;
}

/**
 * Validates a message sender with detailed error information
 *
 * Performs comprehensive validation:
 * 1. Checks if the sender entity exists
 * 2. Checks if the entity is active (not deactivated)
 * 3. Checks if the entity is a member of the channel
 *
 * @param entities - Array of entities to search
 * @param channel - Target channel for the message
 * @param senderId - The sender ID to validate
 * @returns Validation result with error details if invalid
 */
export function validateMessageSender<T extends Entity>(
  entities: T[],
  channel: ChannelLike,
  senderId: string
): SenderValidationResult {
  // Find the sender entity
  const senderEntity = entities.find((e) => e.id === senderId);

  // Check if entity exists
  if (!senderEntity) {
    return {
      valid: false,
      errorCode: 'ENTITY_NOT_FOUND',
      errorMessage: `Sender entity '${senderId}' not found`,
    };
  }

  // Check if entity is active
  if (isEntityDeactivated(senderEntity)) {
    return {
      valid: false,
      errorCode: 'ENTITY_DEACTIVATED',
      errorMessage: `Sender entity '${senderId}' is deactivated`,
    };
  }

  // Check if entity is a member of the channel
  if (!channel.members.includes(senderId)) {
    return {
      valid: false,
      errorCode: 'NOT_CHANNEL_MEMBER',
      errorMessage: `Sender entity '${senderId}' is not a member of channel '${channel.id}'`,
    };
  }

  return { valid: true };
}

/**
 * Get all messages sent by an entity
 *
 * @param messages - Array of messages to search
 * @param entityId - The entity ID to filter by
 * @returns Messages sent by the specified entity
 */
export function getMessagesSentBy<T extends MessageLike>(messages: T[], entityId: string): T[] {
  return messages.filter((m) => m.sender === entityId);
}

/**
 * Get all messages sent by an entity to a specific channel
 *
 * @param messages - Array of messages to search
 * @param entityId - The entity ID to filter by
 * @param channelId - The channel ID to filter by
 * @returns Messages sent by the entity to the channel
 */
export function getEntityChannelMessages<T extends MessageLike>(
  messages: T[],
  entityId: string,
  channelId: string
): T[] {
  return messages.filter((m) => m.sender === entityId && m.channelId === channelId);
}

/**
 * Count messages sent by an entity
 *
 * @param messages - Array of messages to search
 * @param entityId - The entity ID to count for
 * @returns Number of messages sent by the entity
 */
export function countMessagesSentBy<T extends MessageLike>(messages: T[], entityId: string): number {
  return messages.filter((m) => m.sender === entityId).length;
}

/**
 * Count messages sent by each entity
 *
 * @param messages - Array of messages to analyze
 * @returns Map of entity ID to message count
 */
export function countMessagesBySender<T extends MessageLike>(messages: T[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    counts.set(message.sender, (counts.get(message.sender) ?? 0) + 1);
  }
  return counts;
}

/**
 * Get entities with the most messages sent
 *
 * @param messages - Array of messages to analyze
 * @param limit - Maximum number of entities to return
 * @returns Array of [entityId, count] sorted by count descending
 */
export function getTopMessageSenders<T extends MessageLike>(
  messages: T[],
  limit?: number
): Array<[string, number]> {
  const counts = countMessagesBySender(messages);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/**
 * Check if an entity has sent any messages
 *
 * @param messages - Array of messages to search
 * @param entityId - Entity ID to check
 * @returns True if entity has sent at least one message
 */
export function hasSentMessages<T extends MessageLike>(messages: T[], entityId: string): boolean {
  return messages.some((m) => m.sender === entityId);
}

/**
 * Get the most recent message sent by an entity
 *
 * @param messages - Array of messages to search
 * @param entityId - Entity ID to find messages for
 * @returns Most recent message or undefined if none found
 */
export function getMostRecentMessageBy<T extends MessageLike>(
  messages: T[],
  entityId: string
): T | undefined {
  const entityMessages = messages.filter((m) => m.sender === entityId);
  if (entityMessages.length === 0) {
    return undefined;
  }
  return entityMessages.reduce((latest, m) =>
    m.createdAt > latest.createdAt ? m : latest
  );
}

/**
 * Get unique channels that an entity has sent messages to
 *
 * @param messages - Array of messages to search
 * @param entityId - Entity ID to find channels for
 * @returns Array of unique channel IDs
 */
export function getChannelsWithMessagesFrom<T extends MessageLike>(
  messages: T[],
  entityId: string
): string[] {
  const channelIds = new Set<string>();
  for (const message of messages) {
    if (message.sender === entityId) {
      channelIds.add(message.channelId);
    }
  }
  return Array.from(channelIds);
}

/**
 * Message sending statistics for an entity
 */
export interface EntityMessageStats {
  /** Total number of messages sent */
  messageCount: number;
  /** Number of unique channels the entity has sent messages to */
  channelCount: number;
  /** Channel IDs the entity has sent messages to */
  channelIds: string[];
  /** Timestamp of most recent message (or undefined if none) */
  mostRecentMessageAt?: string;
}

/**
 * Get comprehensive message statistics for an entity
 *
 * @param messages - Array of messages to analyze
 * @param entityId - Entity ID to get stats for
 * @returns Message statistics
 */
export function getEntityMessageStats<T extends MessageLike>(
  messages: T[],
  entityId: string
): EntityMessageStats {
  const entityMessages = messages.filter((m) => m.sender === entityId);
  const channelIds = new Set<string>();
  let mostRecentAt: string | undefined;

  for (const message of entityMessages) {
    channelIds.add(message.channelId);
    if (!mostRecentAt || message.createdAt > mostRecentAt) {
      mostRecentAt = message.createdAt;
    }
  }

  return {
    messageCount: entityMessages.length,
    channelCount: channelIds.size,
    channelIds: Array.from(channelIds),
    mostRecentMessageAt: mostRecentAt,
  };
}

/**
 * Filter entities that have sent messages
 *
 * @param entities - Array of entities to filter
 * @param messages - Array of messages to check against
 * @returns Entities that have sent at least one message
 */
export function filterEntitiesWithMessages<T extends Entity>(
  entities: T[],
  messages: MessageLike[]
): T[] {
  const senderIds = new Set<string>();
  for (const message of messages) {
    senderIds.add(message.sender);
  }
  return entities.filter((e) => senderIds.has(e.id));
}

/**
 * Filter entities that have not sent any messages
 *
 * @param entities - Array of entities to filter
 * @param messages - Array of messages to check against
 * @returns Entities that have not sent any messages
 */
export function filterEntitiesWithoutMessages<T extends Entity>(
  entities: T[],
  messages: MessageLike[]
): T[] {
  const senderIds = new Set<string>();
  for (const message of messages) {
    senderIds.add(message.sender);
  }
  return entities.filter((e) => !senderIds.has(e.id));
}

/**
 * Find entities that have sent messages to a specific channel
 *
 * @param entities - Array of entities to filter
 * @param messages - Array of messages to check
 * @param channelId - Channel ID to filter by
 * @returns Entities that have sent messages to the channel
 */
export function getChannelParticipants<T extends Entity>(
  entities: T[],
  messages: MessageLike[],
  channelId: string
): T[] {
  const senderIds = new Set<string>();
  for (const message of messages) {
    if (message.channelId === channelId) {
      senderIds.add(message.sender);
    }
  }
  return entities.filter((e) => senderIds.has(e.id));
}

/**
 * Get entities that an entity has exchanged messages with (in any shared channel)
 *
 * @param messages - Array of messages to search
 * @param entityId - Entity ID to find message partners for
 * @returns Array of entity IDs that have exchanged messages with the given entity
 */
export function getMessagePartners<T extends MessageLike>(
  messages: T[],
  entityId: string
): string[] {
  // Get channels where this entity has sent messages
  const entityChannels = new Set<string>();
  for (const message of messages) {
    if (message.sender === entityId) {
      entityChannels.add(message.channelId);
    }
  }

  // Get other senders in those channels
  const partners = new Set<string>();
  for (const message of messages) {
    if (entityChannels.has(message.channelId) && message.sender !== entityId) {
      partners.add(message.sender);
    }
  }

  return Array.from(partners);
}

/**
 * Validates that a sender can cryptographically sign messages (has a public key)
 *
 * @param entity - Entity to check
 * @returns True if the entity has a public key for cryptographic signing
 */
export function canCryptographicallySign(entity: Entity): boolean {
  return hasCryptographicIdentity(entity);
}

/**
 * Filter entities that can cryptographically sign messages
 *
 * @param entities - Array of entities to filter
 * @returns Entities that have public keys
 */
export function filterEntitiesWithSigningCapability<T extends Entity>(entities: T[]): T[] {
  return entities.filter(canCryptographicallySign);
}

/**
 * Get entities that have both sent messages and have cryptographic identity
 *
 * @param entities - Array of entities to filter
 * @param messages - Array of messages to check
 * @returns Entities with both message activity and cryptographic identity
 */
export function getVerifiedMessageSenders<T extends Entity>(
  entities: T[],
  messages: MessageLike[]
): T[] {
  const withMessages = filterEntitiesWithMessages(entities, messages);
  return withMessages.filter(canCryptographicallySign);
}

// ============================================================================
// Task Assignment Integration
// ============================================================================

/**
 * Interface for task-like objects (minimal interface for entity queries)
 * This allows entity module to work with tasks without creating circular dependencies
 */
export interface TaskLike {
  id: string;
  title: string;
  status: string;
  priority: number;
  complexity: number;
  assignee?: string;
  owner?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validates that an entity exists and can be a task assignee
 *
 * In soft identity mode: validates that the entity ID exists in the entities array
 * This function performs the basic existence check for assignee validation.
 *
 * @param entities - Array of entities to search
 * @param assigneeId - The assignee ID to validate
 * @returns True if the assignee is a valid entity
 */
export function isValidTaskAssignee<T extends Entity>(entities: T[], assigneeId: string): boolean {
  return entities.some((e) => e.id === assigneeId);
}

/**
 * Result of assignee validation
 */
export interface AssigneeValidationResult {
  /** Whether the assignee is valid */
  valid: boolean;
  /** Error code if invalid */
  errorCode?: 'ENTITY_NOT_FOUND' | 'ENTITY_DEACTIVATED';
  /** Human-readable error message if invalid */
  errorMessage?: string;
}

/**
 * Validates a task assignee with detailed error information
 *
 * Performs comprehensive validation:
 * 1. Checks if the assignee entity exists
 * 2. Checks if the entity is active (not deactivated)
 *
 * @param entities - Array of entities to search
 * @param assigneeId - The assignee ID to validate
 * @returns Validation result with error details if invalid
 */
export function validateTaskAssignee<T extends Entity>(
  entities: T[],
  assigneeId: string
): AssigneeValidationResult {
  // Find the assignee entity
  const assigneeEntity = entities.find((e) => e.id === assigneeId);

  // Check if entity exists
  if (!assigneeEntity) {
    return {
      valid: false,
      errorCode: 'ENTITY_NOT_FOUND',
      errorMessage: `Assignee entity '${assigneeId}' not found`,
    };
  }

  // Check if entity is active
  if (isEntityDeactivated(assigneeEntity)) {
    return {
      valid: false,
      errorCode: 'ENTITY_DEACTIVATED',
      errorMessage: `Assignee entity '${assigneeId}' is deactivated`,
    };
  }

  return { valid: true };
}

/**
 * Get all tasks assigned to an entity
 *
 * @param tasks - Array of tasks to search
 * @param entityId - The entity ID to filter by
 * @returns Tasks assigned to the specified entity
 */
export function getTasksAssignedTo<T extends TaskLike>(tasks: T[], entityId: string): T[] {
  return tasks.filter((task) => task.assignee === entityId);
}

/**
 * Get all tasks owned by an entity
 *
 * @param tasks - Array of tasks to search
 * @param entityId - The entity ID to filter by
 * @returns Tasks owned by the specified entity
 */
export function getTasksOwnedBy<T extends TaskLike>(tasks: T[], entityId: string): T[] {
  return tasks.filter((task) => task.owner === entityId);
}

/**
 * Get all tasks created by an entity
 *
 * @param tasks - Array of tasks to search
 * @param entityId - The entity ID to filter by
 * @returns Tasks created by the specified entity
 */
export function getTasksCreatedBy<T extends TaskLike>(tasks: T[], entityId: string): T[] {
  return tasks.filter((task) => task.createdBy === entityId);
}

/**
 * Get all tasks where entity is assignee, owner, or creator
 *
 * @param tasks - Array of tasks to search
 * @param entityId - The entity ID to filter by
 * @returns Tasks where entity is involved
 */
export function getTasksInvolvingEntity<T extends TaskLike>(tasks: T[], entityId: string): T[] {
  return tasks.filter(
    (task) => task.assignee === entityId || task.owner === entityId || task.createdBy === entityId
  );
}

/**
 * Count tasks assigned to an entity
 *
 * @param tasks - Array of tasks to search
 * @param entityId - The entity ID to count for
 * @returns Number of tasks assigned to the entity
 */
export function countTasksAssignedTo<T extends TaskLike>(tasks: T[], entityId: string): number {
  return tasks.filter((task) => task.assignee === entityId).length;
}

/**
 * Count tasks assigned to each entity
 *
 * @param tasks - Array of tasks to analyze
 * @returns Map of entity ID to task count
 */
export function countTasksByAssignee<T extends TaskLike>(tasks: T[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.assignee) {
      counts.set(task.assignee, (counts.get(task.assignee) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Get entities with the most tasks assigned
 *
 * @param tasks - Array of tasks to analyze
 * @param limit - Maximum number of entities to return
 * @returns Array of [entityId, count] sorted by count descending
 */
export function getTopTaskAssignees<T extends TaskLike>(
  tasks: T[],
  limit?: number
): Array<[string, number]> {
  const counts = countTasksByAssignee(tasks);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/**
 * Check if an entity has any tasks assigned
 *
 * @param tasks - Array of tasks to search
 * @param entityId - Entity ID to check
 * @returns True if entity has at least one task assigned
 */
export function hasTasksAssigned<T extends TaskLike>(tasks: T[], entityId: string): boolean {
  return tasks.some((task) => task.assignee === entityId);
}

/**
 * Get unassigned tasks (tasks with no assignee)
 *
 * @param tasks - Array of tasks to search
 * @returns Tasks with no assignee
 */
export function getUnassignedTasks<T extends TaskLike>(tasks: T[]): T[] {
  return tasks.filter((task) => task.assignee === undefined);
}

/**
 * Get tasks by status for an entity
 *
 * @param tasks - Array of tasks to search
 * @param entityId - The entity ID to filter by
 * @param status - The status to filter by
 * @returns Tasks assigned to the entity with the specified status
 */
export function getEntityTasksByStatus<T extends TaskLike>(
  tasks: T[],
  entityId: string,
  status: string
): T[] {
  return tasks.filter((task) => task.assignee === entityId && task.status === status);
}

/**
 * Task assignment statistics for an entity
 */
export interface EntityTaskStats {
  /** Number of tasks assigned to the entity */
  assignedCount: number;
  /** Number of tasks owned by the entity */
  ownedCount: number;
  /** Number of tasks created by the entity */
  createdCount: number;
  /** Total unique tasks the entity is involved with */
  totalInvolved: number;
  /** Tasks grouped by status */
  byStatus: Map<string, number>;
  /** Average priority of assigned tasks (lower is higher priority) */
  averagePriority: number | null;
  /** Total complexity of assigned tasks */
  totalComplexity: number;
}

/**
 * Get comprehensive task statistics for an entity
 *
 * @param tasks - Array of tasks to analyze
 * @param entityId - Entity ID to get stats for
 * @returns Task statistics
 */
export function getEntityTaskStats<T extends TaskLike>(
  tasks: T[],
  entityId: string
): EntityTaskStats {
  const assignedTasks = tasks.filter((t) => t.assignee === entityId);
  const ownedTasks = tasks.filter((t) => t.owner === entityId);
  const createdTasks = tasks.filter((t) => t.createdBy === entityId);

  // Count unique tasks
  const involvedIds = new Set<string>();
  for (const task of tasks) {
    if (task.assignee === entityId || task.owner === entityId || task.createdBy === entityId) {
      involvedIds.add(task.id);
    }
  }

  // Group assigned tasks by status
  const byStatus = new Map<string, number>();
  let totalPriority = 0;
  let totalComplexity = 0;

  for (const task of assignedTasks) {
    byStatus.set(task.status, (byStatus.get(task.status) ?? 0) + 1);
    totalPriority += task.priority;
    totalComplexity += task.complexity;
  }

  return {
    assignedCount: assignedTasks.length,
    ownedCount: ownedTasks.length,
    createdCount: createdTasks.length,
    totalInvolved: involvedIds.size,
    byStatus,
    averagePriority: assignedTasks.length > 0 ? totalPriority / assignedTasks.length : null,
    totalComplexity,
  };
}

/**
 * Filter entities that have tasks assigned
 *
 * @param entities - Array of entities to filter
 * @param tasks - Array of tasks to check against
 * @returns Entities that have at least one task assigned
 */
export function filterEntitiesWithTasks<T extends Entity>(
  entities: T[],
  tasks: TaskLike[]
): T[] {
  const assigneeIds = new Set<string>();
  for (const task of tasks) {
    if (task.assignee) {
      assigneeIds.add(task.assignee);
    }
  }
  return entities.filter((e) => assigneeIds.has(e.id));
}

/**
 * Filter entities that have no tasks assigned
 *
 * @param entities - Array of entities to filter
 * @param tasks - Array of tasks to check against
 * @returns Entities that have no tasks assigned
 */
export function filterEntitiesWithoutTasks<T extends Entity>(
  entities: T[],
  tasks: TaskLike[]
): T[] {
  const assigneeIds = new Set<string>();
  for (const task of tasks) {
    if (task.assignee) {
      assigneeIds.add(task.assignee);
    }
  }
  return entities.filter((e) => !assigneeIds.has(e.id));
}

/**
 * Filter entities by task load (number of assigned tasks)
 *
 * @param entities - Array of entities to filter
 * @param tasks - Array of tasks to analyze
 * @param maxTasks - Maximum number of assigned tasks
 * @returns Entities with at most maxTasks assigned
 */
export function filterEntitiesByTaskLoad<T extends Entity>(
  entities: T[],
  tasks: TaskLike[],
  maxTasks: number
): T[] {
  const counts = countTasksByAssignee(tasks);
  return entities.filter((e) => (counts.get(e.id) ?? 0) <= maxTasks);
}

/**
 * Get entities that are available for assignment (active and under capacity)
 *
 * @param entities - Array of entities to filter
 * @param tasks - Array of tasks to analyze
 * @param maxTasks - Maximum number of assigned tasks for availability
 * @returns Active entities with fewer than maxTasks assigned
 */
export function getAvailableAssignees<T extends Entity>(
  entities: T[],
  tasks: TaskLike[],
  maxTasks: number
): T[] {
  const activeEntities = filterActiveEntities(entities);
  return filterEntitiesByTaskLoad(activeEntities, tasks, maxTasks - 1);
}

/**
 * Get workload distribution across entities
 *
 * @param entities - Array of entities to analyze
 * @param tasks - Array of tasks to analyze
 * @returns Map of entity ID to workload stats
 */
export function getEntityWorkloadDistribution<T extends Entity>(
  entities: T[],
  tasks: TaskLike[]
): Map<string, { entityName: string; taskCount: number; totalComplexity: number }> {
  const distribution = new Map<string, { entityName: string; taskCount: number; totalComplexity: number }>();

  // Initialize all entities with zero counts
  for (const entity of entities) {
    distribution.set(entity.id, {
      entityName: entity.name,
      taskCount: 0,
      totalComplexity: 0,
    });
  }

  // Count tasks and sum complexity
  for (const task of tasks) {
    if (task.assignee) {
      const current = distribution.get(task.assignee);
      if (current) {
        distribution.set(task.assignee, {
          ...current,
          taskCount: current.taskCount + 1,
          totalComplexity: current.totalComplexity + task.complexity,
        });
      }
    }
  }

  return distribution;
}

/**
 * Find the entity with the least workload (fewest assigned tasks)
 *
 * @param entities - Array of entities to consider
 * @param tasks - Array of tasks to analyze
 * @returns The entity with fewest tasks, or undefined if no entities
 */
export function findLeastBusyEntity<T extends Entity>(
  entities: T[],
  tasks: TaskLike[]
): T | undefined {
  if (entities.length === 0) {
    return undefined;
  }

  const counts = countTasksByAssignee(tasks);
  let leastBusy = entities[0];
  let leastCount = counts.get(entities[0].id) ?? 0;

  for (let i = 1; i < entities.length; i++) {
    const count = counts.get(entities[i].id) ?? 0;
    if (count < leastCount) {
      leastCount = count;
      leastBusy = entities[i];
    }
  }

  return leastBusy;
}

/**
 * Get co-workers (entities that share task assignments on the same tasks)
 *
 * Note: Tasks typically have one assignee, so this finds entities that work
 * on tasks where one is assignee and the other is owner, or both have
 * assignments in the same parent plan/workflow.
 *
 * @param tasks - Array of tasks to analyze
 * @param entityId - Entity ID to find co-workers for
 * @returns Array of entity IDs that share task involvement
 */
export function getTaskCoworkers<T extends TaskLike>(tasks: T[], entityId: string): string[] {
  const coworkers = new Set<string>();

  for (const task of tasks) {
    const isInvolved =
      task.assignee === entityId || task.owner === entityId || task.createdBy === entityId;

    if (isInvolved) {
      // Add other involved parties as co-workers
      if (task.assignee && task.assignee !== entityId) {
        coworkers.add(task.assignee);
      }
      if (task.owner && task.owner !== entityId) {
        coworkers.add(task.owner);
      }
      if (task.createdBy !== entityId) {
        coworkers.add(task.createdBy);
      }
    }
  }

  return Array.from(coworkers);
}

/**
 * Count co-workers for an entity
 *
 * @param tasks - Array of tasks to analyze
 * @param entityId - Entity ID to count co-workers for
 * @returns Number of unique co-workers
 */
export function countTaskCoworkers<T extends TaskLike>(tasks: T[], entityId: string): number {
  return getTaskCoworkers(tasks, entityId).length;
}

// ============================================================================
// Management Hierarchy (reportsTo)
// ============================================================================

/**
 * Maximum depth for cycle detection to prevent infinite loops
 */
export const MAX_REPORTING_CHAIN_DEPTH = 100;

/**
 * Result of cycle detection when checking management hierarchy
 */
export interface CycleDetectionResult {
  /** Whether a cycle was detected */
  hasCycle: boolean;
  /** The path of entity IDs that form the cycle (if hasCycle is true) */
  cyclePath?: EntityId[];
}

/**
 * Detects if setting a manager would create a circular reporting chain.
 *
 * Uses BFS to traverse the reportsTo chain from the proposed manager upward.
 * If the original entity is found in that chain, a cycle would result.
 *
 * @param entityId - The entity that would report to a new manager
 * @param proposedManagerId - The proposed manager entity ID
 * @param getEntity - Function to retrieve an entity by ID
 * @returns Result indicating if a cycle exists and the path if so
 */
export function detectReportingCycle(
  entityId: EntityId,
  proposedManagerId: EntityId,
  getEntity: (id: EntityId) => Entity | null
): CycleDetectionResult {
  // Self-reference is a trivial cycle
  if (entityId === proposedManagerId) {
    return {
      hasCycle: true,
      cyclePath: [entityId, proposedManagerId],
    };
  }

  // BFS from proposed manager upward through reportsTo chain
  const visited = new Set<EntityId>();
  const queue: Array<{ id: EntityId; path: EntityId[] }> = [];

  queue.push({ id: proposedManagerId, path: [entityId, proposedManagerId] });
  visited.add(proposedManagerId);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Depth limit check
    if (current.path.length > MAX_REPORTING_CHAIN_DEPTH) {
      // Treat exceeding depth limit as no cycle (unusual but safe)
      continue;
    }

    const entity = getEntity(current.id);
    if (!entity) {
      // Entity not found, can't continue this path
      continue;
    }

    if (entity.reportsTo) {
      // Found a cycle - the proposed manager's chain leads back to entityId
      if (entity.reportsTo === entityId) {
        return {
          hasCycle: true,
          cyclePath: [...current.path, entityId],
        };
      }

      // Continue traversing if not already visited
      if (!visited.has(entity.reportsTo)) {
        visited.add(entity.reportsTo);
        queue.push({
          id: entity.reportsTo,
          path: [...current.path, entity.reportsTo],
        });
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Result of manager validation
 */
export interface ManagerValidationResult {
  /** Whether the manager assignment is valid */
  valid: boolean;
  /** Error code if invalid */
  errorCode?: 'SELF_REFERENCE' | 'ENTITY_NOT_FOUND' | 'ENTITY_DEACTIVATED' | 'CYCLE_DETECTED';
  /** Human-readable error message if invalid */
  errorMessage?: string;
  /** The cycle path if a cycle was detected */
  cyclePath?: EntityId[];
}

/**
 * Validates that an entity can be set as a manager for another entity.
 *
 * Validation rules:
 * 1. Cannot self-reference (entity cannot report to itself)
 * 2. Manager entity must exist
 * 3. Manager entity must be active (not deactivated)
 * 4. No circular chains allowed
 *
 * @param entityId - The entity that would report to the manager
 * @param managerId - The proposed manager entity ID
 * @param getEntity - Function to retrieve an entity by ID
 * @returns Validation result with error details if invalid
 */
export function validateManager(
  entityId: EntityId,
  managerId: EntityId,
  getEntity: (id: EntityId) => Entity | null
): ManagerValidationResult {
  // Check for self-reference
  if (entityId === managerId) {
    return {
      valid: false,
      errorCode: 'SELF_REFERENCE',
      errorMessage: 'Entity cannot report to itself',
    };
  }

  // Check if manager entity exists
  const managerEntity = getEntity(managerId);
  if (!managerEntity) {
    return {
      valid: false,
      errorCode: 'ENTITY_NOT_FOUND',
      errorMessage: `Manager entity '${managerId}' not found`,
    };
  }

  // Check if manager is active
  if (isEntityDeactivated(managerEntity)) {
    return {
      valid: false,
      errorCode: 'ENTITY_DEACTIVATED',
      errorMessage: `Manager entity '${managerId}' is deactivated`,
    };
  }

  // Check for cycles
  const cycleResult = detectReportingCycle(entityId, managerId, getEntity);
  if (cycleResult.hasCycle) {
    return {
      valid: false,
      errorCode: 'CYCLE_DETECTED',
      errorMessage: `Setting '${managerId}' as manager would create a cycle: ${cycleResult.cyclePath?.join(' -> ')}`,
      cyclePath: cycleResult.cyclePath,
    };
  }

  return { valid: true };
}

/**
 * Gets the management chain for an entity (from entity up to root).
 *
 * Returns an ordered array starting with the entity's direct manager
 * and ending with the root entity (an entity with no reportsTo).
 *
 * @param entity - The entity to get the management chain for
 * @param getEntity - Function to retrieve an entity by ID
 * @returns Array of entities in the management chain (empty if no manager)
 */
export function getManagementChain(
  entity: Entity,
  getEntity: (id: EntityId) => Entity | null
): Entity[] {
  const chain: Entity[] = [];
  const visited = new Set<EntityId>();

  let currentId = entity.reportsTo;

  while (currentId && chain.length < MAX_REPORTING_CHAIN_DEPTH) {
    // Prevent infinite loops from data corruption
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const manager = getEntity(currentId);
    if (!manager) {
      break;
    }

    chain.push(manager);
    currentId = manager.reportsTo;
  }

  return chain;
}

/**
 * Gets the direct reports for an entity (entities where reportsTo = managerId).
 *
 * @param entities - Array of entities to search
 * @param managerId - The manager entity ID
 * @returns Array of entities that report to the specified manager
 */
export function getDirectReports<T extends Entity>(entities: T[], managerId: EntityId): T[] {
  return entities.filter((e) => e.reportsTo === managerId);
}

/**
 * Node in an organizational chart tree structure
 */
export interface OrgChartNode {
  /** The entity at this node */
  entity: Entity;
  /** Direct reports (children in the org chart) */
  directReports: OrgChartNode[];
}

/**
 * Builds an organizational chart tree from a set of entities.
 *
 * @param entities - All entities to include in the org chart
 * @param rootId - Optional root entity ID (if not provided, returns all root entities)
 * @returns Array of org chart nodes (root entities with their report trees)
 */
export function buildOrgChart<T extends Entity>(
  entities: T[],
  rootId?: EntityId
): OrgChartNode[] {
  // Build a map for quick lookup (use string keys since entity.id is ElementId)
  const entityMap = new Map<string, T>();
  for (const entity of entities) {
    entityMap.set(entity.id, entity);
  }

  // Build children map (managerId -> direct reports)
  const childrenMap = new Map<string, T[]>();
  const rootEntities: T[] = [];

  for (const entity of entities) {
    if (entity.reportsTo) {
      const children = childrenMap.get(entity.reportsTo) ?? [];
      children.push(entity);
      childrenMap.set(entity.reportsTo, children);
    } else {
      rootEntities.push(entity);
    }
  }

  // Recursive function to build tree node
  function buildNode(entity: T): OrgChartNode {
    const children = childrenMap.get(entity.id) ?? [];
    return {
      entity,
      directReports: children.map(buildNode),
    };
  }

  // If a specific root is requested
  if (rootId) {
    const rootEntity = entityMap.get(rootId);
    if (!rootEntity) {
      return [];
    }
    return [buildNode(rootEntity)];
  }

  // Return all root entities (those with no manager)
  return rootEntities.map(buildNode);
}

/**
 * Checks if an entity has any direct reports.
 *
 * @param entities - Array of entities to search
 * @param entityId - The entity ID to check
 * @returns True if the entity has at least one direct report
 */
export function hasDirectReports<T extends Entity>(entities: T[], entityId: EntityId): boolean {
  return entities.some((e) => e.reportsTo === entityId);
}

/**
 * Counts the number of direct reports for an entity.
 *
 * @param entities - Array of entities to search
 * @param entityId - The entity ID to count reports for
 * @returns Number of direct reports
 */
export function countDirectReports<T extends Entity>(entities: T[], entityId: EntityId): number {
  return entities.filter((e) => e.reportsTo === entityId).length;
}

/**
 * Gets all entities in the subtree under a manager (all reports, recursively).
 *
 * @param entities - Array of entities to search
 * @param managerId - The root manager entity ID
 * @returns Array of all entities in the subtree (not including the manager)
 */
export function getAllReports<T extends Entity>(entities: T[], managerId: EntityId): T[] {
  const result: T[] = [];
  const visited = new Set<string>();
  const queue: string[] = [managerId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    // Find direct reports of current entity
    const directReports = entities.filter((e) => e.reportsTo === currentId);

    for (const report of directReports) {
      if (!visited.has(report.id)) {
        result.push(report);
        queue.push(report.id);
      }
    }
  }

  return result;
}

/**
 * Gets the root manager for an entity (the entity at the top of the chain).
 *
 * @param entity - The entity to find the root for
 * @param getEntity - Function to retrieve an entity by ID
 * @returns The root manager entity, or null if the entity has no manager
 */
export function getRootManager(
  entity: Entity,
  getEntity: (id: EntityId) => Entity | null
): Entity | null {
  if (!entity.reportsTo) {
    return null;
  }

  const chain = getManagementChain(entity, getEntity);
  return chain.length > 0 ? chain[chain.length - 1] : null;
}

/**
 * Checks if entityA is a manager of entityB (directly or indirectly).
 *
 * @param managerId - The potential manager entity ID
 * @param reportId - The potential report entity ID
 * @param getEntity - Function to retrieve an entity by ID
 * @returns True if managerId is in reportId's management chain
 */
export function isManagerOf(
  managerId: EntityId,
  reportId: EntityId,
  getEntity: (id: EntityId) => Entity | null
): boolean {
  const report = getEntity(reportId);
  if (!report) {
    return false;
  }

  const chain = getManagementChain(report, getEntity);
  // Use string comparison since entity.id is ElementId but managerId is EntityId
  return chain.some((m) => (m.id as string) === (managerId as string));
}

/**
 * Gets entities that have no manager (root entities in the org hierarchy).
 *
 * @param entities - Array of entities to filter
 * @returns Entities with no reportsTo value
 */
export function getRootEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter((e) => !e.reportsTo);
}

/**
 * Gets entities that have a manager.
 *
 * @param entities - Array of entities to filter
 * @returns Entities with a reportsTo value
 */
export function getEntitiesWithManager<T extends Entity>(entities: T[]): T[] {
  return entities.filter((e) => e.reportsTo !== undefined);
}
