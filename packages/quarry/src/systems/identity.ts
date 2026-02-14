/**
 * Identity System - Authentication and Signature Verification
 *
 * The identity system manages entity authentication and verification, supporting
 * both soft (name-based) and cryptographic (key-based) identity models.
 *
 * Features:
 * - Identity mode configuration (soft, cryptographic, hybrid)
 * - Ed25519 signature generation and verification
 * - Signed request validation with time tolerance
 * - Actor context management
 */

import { IdentityError, ValidationError, ErrorCode, Timestamp, isValidTimestamp } from '@stoneforge/core';

// ============================================================================
// Identity Mode Types
// ============================================================================

/**
 * Identity mode determines the level of verification required
 */
export const IdentityMode = {
  /** Name-based identity without verification (default) */
  SOFT: 'soft',
  /** Key-based identity with signature verification */
  CRYPTOGRAPHIC: 'cryptographic',
  /** Mixed mode - accepts both verified and unverified actors */
  HYBRID: 'hybrid',
} as const;

export type IdentityMode = (typeof IdentityMode)[keyof typeof IdentityMode];

// ============================================================================
// Signature Types
// ============================================================================

/**
 * Base64-encoded Ed25519 signature (88 characters for 64 bytes)
 */
declare const SignatureBrand: unique symbol;
export type Signature = string & { readonly [SignatureBrand]: typeof SignatureBrand };

/**
 * Base64-encoded Ed25519 public key (44 characters for 32 bytes)
 */
declare const PublicKeyBrand: unique symbol;
export type PublicKey = string & { readonly [PublicKeyBrand]: typeof PublicKeyBrand };

/**
 * Signed request fields included in cryptographic requests
 */
export interface SignedRequestFields {
  /** Base64 Ed25519 signature */
  readonly signature: Signature;
  /** Timestamp when the request was signed (ISO 8601) */
  readonly signedAt: Timestamp;
  /** Entity name making the request */
  readonly actor: string;
}

/**
 * Input for signing a request
 */
export interface SigningInput {
  /** Entity name making the request */
  actor: string;
  /** Hash of the request body (SHA256, hex encoded) */
  requestHash: string;
}

/**
 * Signed data format: actor|signedAt|requestHash
 */
export interface SignedData {
  readonly actor: string;
  readonly signedAt: Timestamp;
  readonly requestHash: string;
}

// ============================================================================
// Verification Types
// ============================================================================

/**
 * Result of signature verification
 */
export const VerificationStatus = {
  /** Signature is valid */
  VALID: 'valid',
  /** Signature is invalid or doesn't match */
  INVALID: 'invalid',
  /** Signature has expired (outside time tolerance) */
  EXPIRED: 'expired',
  /** Entity not found for verification */
  ACTOR_NOT_FOUND: 'actor_not_found',
  /** Entity has no public key */
  NO_PUBLIC_KEY: 'no_public_key',
  /** Signature was not provided */
  NOT_SIGNED: 'not_signed',
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

/**
 * Full verification result with details
 */
export interface VerificationResult {
  /** Overall verification status */
  readonly status: VerificationStatus;
  /** Whether the request should be allowed */
  readonly allowed: boolean;
  /** Actor name if verified */
  readonly actor?: string;
  /** Error message if verification failed */
  readonly error?: string;
  /** Additional details about the verification */
  readonly details?: {
    /** How old the signature is in milliseconds */
    signatureAgeMs?: number;
    /** Whether the entity was found */
    entityFound?: boolean;
    /** Whether the entity has a public key */
    hasPublicKey?: boolean;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Identity system configuration
 */
export interface IdentityConfig {
  /** Identity verification mode */
  mode: IdentityMode;
  /** Time tolerance for signature expiry in milliseconds (default: 5 minutes) */
  timeTolerance: number;
  /** Whether to allow unregistered actors in soft mode */
  allowUnregisteredActors: boolean;
}

/** Default time tolerance: 5 minutes in milliseconds */
export const DEFAULT_TIME_TOLERANCE = 5 * 60 * 1000;

/**
 * Default identity configuration
 */
export const DEFAULT_IDENTITY_CONFIG: IdentityConfig = {
  mode: IdentityMode.SOFT,
  timeTolerance: DEFAULT_TIME_TOLERANCE,
  allowUnregisteredActors: true,
};

// ============================================================================
// Validation Constants
// ============================================================================

/** Base64 pattern for Ed25519 public keys (44 characters for 32 bytes) */
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/** Base64 pattern for Ed25519 signatures (88 characters for 64 bytes) */
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/;

/** Minimum request hash length (SHA256 hex = 64 characters) */
const MIN_REQUEST_HASH_LENGTH = 64;

/** Request hash pattern (hex-encoded SHA256) */
const REQUEST_HASH_PATTERN = /^[a-f0-9]{64}$/i;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates an identity mode value
 */
export function isValidIdentityMode(value: unknown): value is IdentityMode {
  return (
    typeof value === 'string' &&
    Object.values(IdentityMode).includes(value as IdentityMode)
  );
}

/**
 * Validates identity mode and throws if invalid
 */
export function validateIdentityMode(value: unknown): IdentityMode {
  if (!isValidIdentityMode(value)) {
    throw new ValidationError(
      `Invalid identity mode: ${value}. Must be one of: ${Object.values(IdentityMode).join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'mode', value, expected: Object.values(IdentityMode) }
    );
  }
  return value;
}

/**
 * Validates a base64-encoded Ed25519 public key format
 */
export function isValidPublicKey(value: unknown): value is PublicKey {
  if (typeof value !== 'string') {
    return false;
  }
  return PUBLIC_KEY_PATTERN.test(value);
}

/**
 * Validates a public key and throws if invalid format
 */
export function validatePublicKey(value: unknown): PublicKey {
  if (typeof value !== 'string') {
    throw new IdentityError(
      'Public key must be a string',
      ErrorCode.INVALID_PUBLIC_KEY,
      { field: 'publicKey', value, expected: 'string' }
    );
  }

  if (!PUBLIC_KEY_PATTERN.test(value)) {
    throw new IdentityError(
      'Invalid public key format. Expected base64-encoded Ed25519 public key (44 characters)',
      ErrorCode.INVALID_PUBLIC_KEY,
      { field: 'publicKey', value, expected: '44-character base64 string ending with =' }
    );
  }

  return value as PublicKey;
}

/**
 * Validates a base64-encoded Ed25519 signature format
 */
export function isValidSignature(value: unknown): value is Signature {
  if (typeof value !== 'string') {
    return false;
  }
  return SIGNATURE_PATTERN.test(value);
}

/**
 * Validates a signature and throws if invalid format
 */
export function validateSignature(value: unknown): Signature {
  if (typeof value !== 'string') {
    throw new IdentityError(
      'Signature must be a string',
      ErrorCode.INVALID_SIGNATURE,
      { field: 'signature', value, expected: 'string' }
    );
  }

  if (!SIGNATURE_PATTERN.test(value)) {
    throw new IdentityError(
      'Invalid signature format. Expected base64-encoded Ed25519 signature (88 characters)',
      ErrorCode.INVALID_SIGNATURE,
      { field: 'signature', value, expected: '88-character base64 string ending with ==' }
    );
  }

  return value as Signature;
}

/**
 * Validates a request hash (SHA256 hex)
 */
export function isValidRequestHash(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length < MIN_REQUEST_HASH_LENGTH) {
    return false;
  }
  return REQUEST_HASH_PATTERN.test(value);
}

/**
 * Validates a request hash and throws if invalid
 */
export function validateRequestHash(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Request hash must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'requestHash', value, expected: 'string' }
    );
  }

  if (!REQUEST_HASH_PATTERN.test(value)) {
    throw new ValidationError(
      'Invalid request hash format. Expected 64-character hex-encoded SHA256 hash',
      ErrorCode.INVALID_INPUT,
      { field: 'requestHash', value, expected: '64-character hex string' }
    );
  }

  return value;
}

/**
 * Validates time tolerance value
 */
export function isValidTimeTolerance(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 24 * 60 * 60 * 1000 // Max 24 hours
  );
}

/**
 * Validates time tolerance and throws if invalid
 */
export function validateTimeTolerance(value: unknown): number {
  if (!isValidTimeTolerance(value)) {
    throw new ValidationError(
      'Time tolerance must be a positive number (max 24 hours in milliseconds)',
      ErrorCode.INVALID_INPUT,
      { field: 'timeTolerance', value, expected: 'positive number <= 86400000' }
    );
  }
  return value;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for SignedRequestFields
 */
export function isSignedRequestFields(value: unknown): value is SignedRequestFields {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    isValidSignature(obj.signature) &&
    isValidTimestamp(obj.signedAt) &&
    typeof obj.actor === 'string' &&
    obj.actor.length > 0
  );
}

/**
 * Validates SignedRequestFields and throws detailed errors
 */
export function validateSignedRequestFields(value: unknown): SignedRequestFields {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Signed request fields must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate signature
  validateSignature(obj.signature);

  // Validate signedAt
  if (!isValidTimestamp(obj.signedAt)) {
    throw new ValidationError(
      'signedAt must be a valid ISO 8601 timestamp',
      ErrorCode.INVALID_TIMESTAMP,
      { field: 'signedAt', value: obj.signedAt }
    );
  }

  // Validate actor
  if (typeof obj.actor !== 'string' || obj.actor.length === 0) {
    throw new ValidationError(
      'Actor must be a non-empty string',
      ErrorCode.INVALID_INPUT,
      { field: 'actor', value: obj.actor }
    );
  }

  return value as SignedRequestFields;
}

/**
 * Type guard for VerificationResult
 */
export function isVerificationResult(value: unknown): value is VerificationResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.status === 'string' &&
    Object.values(VerificationStatus).includes(obj.status as VerificationStatus) &&
    typeof obj.allowed === 'boolean'
  );
}

/**
 * Type guard for IdentityConfig
 */
export function isIdentityConfig(value: unknown): value is IdentityConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    isValidIdentityMode(obj.mode) &&
    isValidTimeTolerance(obj.timeTolerance) &&
    typeof obj.allowUnregisteredActors === 'boolean'
  );
}

/**
 * Validates IdentityConfig and throws detailed errors
 */
export function validateIdentityConfig(value: unknown): IdentityConfig {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Identity config must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  validateIdentityMode(obj.mode);
  validateTimeTolerance(obj.timeTolerance);

  if (typeof obj.allowUnregisteredActors !== 'boolean') {
    throw new ValidationError(
      'allowUnregisteredActors must be a boolean',
      ErrorCode.INVALID_INPUT,
      { field: 'allowUnregisteredActors', value: obj.allowUnregisteredActors }
    );
  }

  return value as IdentityConfig;
}

// ============================================================================
// Signed Data Construction
// ============================================================================

/**
 * Constructs the signed data string from components
 * Format: actor|signedAt|requestHash
 */
export function constructSignedData(data: SignedData): string {
  return `${data.actor}|${data.signedAt}|${data.requestHash}`;
}

/**
 * Parses a signed data string into components
 * Format: actor|signedAt|requestHash
 */
export function parseSignedData(signedDataString: string): SignedData {
  const parts = signedDataString.split('|');
  if (parts.length !== 3) {
    throw new ValidationError(
      'Invalid signed data format. Expected: actor|signedAt|requestHash',
      ErrorCode.INVALID_INPUT,
      { value: signedDataString, expected: 'actor|signedAt|requestHash' }
    );
  }

  const [actor, signedAt, requestHash] = parts;

  if (!actor || actor.length === 0) {
    throw new ValidationError(
      'Actor in signed data cannot be empty',
      ErrorCode.INVALID_INPUT,
      { field: 'actor', value: actor }
    );
  }

  if (!isValidTimestamp(signedAt)) {
    throw new ValidationError(
      'Invalid signedAt timestamp in signed data',
      ErrorCode.INVALID_TIMESTAMP,
      { field: 'signedAt', value: signedAt }
    );
  }

  validateRequestHash(requestHash);

  return {
    actor,
    signedAt: signedAt as Timestamp,
    requestHash,
  };
}

// ============================================================================
// Time Tolerance Checking
// ============================================================================

/**
 * Checks if a signature timestamp is within the allowed time tolerance
 *
 * @param signedAt - The timestamp when the request was signed
 * @param tolerance - Time tolerance in milliseconds (default: 5 minutes)
 * @param now - Current timestamp for testing (defaults to now)
 * @returns Object with validity and age information
 */
export function checkTimeTolerance(
  signedAt: Timestamp,
  tolerance: number = DEFAULT_TIME_TOLERANCE,
  now?: Date
): { valid: boolean; ageMs: number; expiredBy?: number } {
  const signedTime = new Date(signedAt).getTime();
  const currentTime = (now ?? new Date()).getTime();
  const ageMs = Math.abs(currentTime - signedTime);

  if (ageMs > tolerance) {
    return {
      valid: false,
      ageMs,
      expiredBy: ageMs - tolerance,
    };
  }

  return { valid: true, ageMs };
}

/**
 * Checks time tolerance and throws if expired
 */
export function validateTimeTolerance2(
  signedAt: Timestamp,
  tolerance: number = DEFAULT_TIME_TOLERANCE,
  now?: Date
): void {
  const result = checkTimeTolerance(signedAt, tolerance, now);
  if (!result.valid) {
    throw new IdentityError(
      `Signature expired. Signed ${Math.round(result.ageMs / 1000)}s ago, tolerance is ${Math.round(tolerance / 1000)}s`,
      ErrorCode.SIGNATURE_EXPIRED,
      {
        signedAt,
        ageMs: result.ageMs,
        tolerance,
        expiredBy: result.expiredBy,
      }
    );
  }
}

// ============================================================================
// Verification Result Factories
// ============================================================================

/**
 * Creates a successful verification result
 */
export function verificationSuccess(actor: string, ageMs?: number): VerificationResult {
  return {
    status: VerificationStatus.VALID,
    allowed: true,
    actor,
    details: ageMs !== undefined ? { signatureAgeMs: ageMs } : undefined,
  };
}

/**
 * Creates a failed verification result
 */
export function verificationFailure(
  status: VerificationStatus,
  error: string,
  details?: VerificationResult['details']
): VerificationResult {
  return {
    status,
    allowed: false,
    error,
    details,
  };
}

/**
 * Creates a "not signed" result (may be allowed in soft/hybrid mode)
 */
export function verificationNotSigned(
  allowed: boolean,
  actor?: string
): VerificationResult {
  return {
    status: VerificationStatus.NOT_SIGNED,
    allowed,
    actor,
    error: allowed ? undefined : 'Signature required in cryptographic mode',
  };
}

// ============================================================================
// Ed25519 Cryptographic Operations
// ============================================================================

/**
 * Verifies an Ed25519 signature using Bun's native crypto
 *
 * @param publicKey - Base64-encoded Ed25519 public key
 * @param signature - Base64-encoded Ed25519 signature
 * @param data - The data that was signed (as string or Uint8Array)
 * @returns true if signature is valid, false otherwise
 */
export async function verifyEd25519Signature(
  publicKey: PublicKey,
  signature: Signature,
  data: string | Uint8Array
): Promise<boolean> {
  try {
    // Decode base64 inputs
    const publicKeyBytes = new Uint8Array(Buffer.from(publicKey, 'base64'));
    const signatureBytes = new Uint8Array(Buffer.from(signature, 'base64'));

    // Convert data to Uint8Array
    const dataBytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);

    // Validate key and signature lengths
    if (publicKeyBytes.length !== 32) {
      return false;
    }
    if (signatureBytes.length !== 64) {
      return false;
    }

    // Use Web Crypto API for Ed25519 verification
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      cryptoKey,
      signatureBytes,
      dataBytes
    );
  } catch {
    // Any crypto error means verification failed
    return false;
  }
}

/**
 * Signs data using Ed25519 (for testing purposes)
 * In production, signing should be done by the entity externally
 *
 * @param privateKey - Base64-encoded Ed25519 private key in PKCS8 format
 * @param data - The data to sign
 * @returns Base64-encoded signature
 */
export async function signEd25519(
  privateKey: string,
  data: string | Uint8Array
): Promise<Signature> {
  const privateKeyBytes = Buffer.from(privateKey, 'base64');

  // Convert data to Uint8Array
  const dataBytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);

  // Import the private key in PKCS8 format
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  // Sign the data
  const signatureBytes = await crypto.subtle.sign(
    { name: 'Ed25519' },
    cryptoKey,
    dataBytes
  );

  // Return base64-encoded signature
  return Buffer.from(signatureBytes).toString('base64') as Signature;
}

/**
 * Generates a new Ed25519 keypair (for testing purposes)
 *
 * @returns Object with base64-encoded public and private keys (PKCS8 format for private)
 */
export async function generateEd25519Keypair(): Promise<{
  publicKey: PublicKey;
  privateKey: string;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );

  // Export public key as raw bytes (32 bytes -> 44 base64 chars)
  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keypair.publicKey);

  // Export private key in PKCS8 format (48 bytes -> 64 base64 chars)
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);

  return {
    publicKey: Buffer.from(new Uint8Array(publicKeyBuffer)).toString('base64') as PublicKey,
    privateKey: Buffer.from(new Uint8Array(privateKeyBuffer)).toString('base64'),
  };
}

// ============================================================================
// Full Verification Pipeline
// ============================================================================

/**
 * Entity lookup function type for verification
 */
export type EntityLookup = (actor: string) => Promise<{ publicKey?: string } | null>;

/**
 * Full verification options
 */
export interface VerifySignatureOptions {
  /** The signed request fields */
  signedRequest: SignedRequestFields;
  /** The hash of the request body */
  requestHash: string;
  /** Function to look up entity by name */
  lookupEntity: EntityLookup;
  /** Identity configuration */
  config?: Partial<IdentityConfig>;
  /** Current time for testing */
  now?: Date;
}

/**
 * Performs full signature verification pipeline
 *
 * 1. Validates signature format
 * 2. Looks up entity's public key
 * 3. Constructs signed data
 * 4. Checks time tolerance
 * 5. Verifies signature cryptographically
 */
export async function verifySignature(
  options: VerifySignatureOptions
): Promise<VerificationResult> {
  const config = { ...DEFAULT_IDENTITY_CONFIG, ...options.config };
  const { signedRequest, requestHash, lookupEntity, now } = options;

  // 1. Validate request hash format
  if (!isValidRequestHash(requestHash)) {
    return verificationFailure(
      VerificationStatus.INVALID,
      'Invalid request hash format'
    );
  }

  // 2. Look up entity
  const entity = await lookupEntity(signedRequest.actor);
  if (!entity) {
    return verificationFailure(
      VerificationStatus.ACTOR_NOT_FOUND,
      `Actor '${signedRequest.actor}' not found`,
      { entityFound: false }
    );
  }

  // 3. Check for public key
  if (!entity.publicKey) {
    return verificationFailure(
      VerificationStatus.NO_PUBLIC_KEY,
      `Actor '${signedRequest.actor}' has no public key`,
      { entityFound: true, hasPublicKey: false }
    );
  }

  // 4. Validate public key format
  if (!isValidPublicKey(entity.publicKey)) {
    return verificationFailure(
      VerificationStatus.INVALID,
      'Entity has invalid public key format',
      { entityFound: true, hasPublicKey: true }
    );
  }

  // 5. Check time tolerance
  const timeCheck = checkTimeTolerance(signedRequest.signedAt, config.timeTolerance, now);
  if (!timeCheck.valid) {
    return verificationFailure(
      VerificationStatus.EXPIRED,
      `Signature expired. Age: ${Math.round(timeCheck.ageMs / 1000)}s, tolerance: ${Math.round(config.timeTolerance / 1000)}s`,
      { signatureAgeMs: timeCheck.ageMs }
    );
  }

  // 6. Construct signed data and verify
  const signedData = constructSignedData({
    actor: signedRequest.actor,
    signedAt: signedRequest.signedAt,
    requestHash,
  });

  const isValid = await verifyEd25519Signature(
    entity.publicKey as PublicKey,
    signedRequest.signature,
    signedData
  );

  if (!isValid) {
    return verificationFailure(
      VerificationStatus.INVALID,
      'Signature verification failed',
      { signatureAgeMs: timeCheck.ageMs, entityFound: true, hasPublicKey: true }
    );
  }

  return verificationSuccess(signedRequest.actor, timeCheck.ageMs);
}

/**
 * Determines if a request should be allowed based on identity mode
 */
export function shouldAllowRequest(
  mode: IdentityMode,
  verificationResult: VerificationResult
): boolean {
  switch (mode) {
    case IdentityMode.SOFT:
      // Always allow in soft mode
      return true;

    case IdentityMode.CRYPTOGRAPHIC:
      // Only allow valid signatures
      return verificationResult.status === VerificationStatus.VALID;

    case IdentityMode.HYBRID:
      // Allow valid signatures or unsigned requests
      return (
        verificationResult.status === VerificationStatus.VALID ||
        verificationResult.status === VerificationStatus.NOT_SIGNED
      );

    default:
      return false;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a SHA256 hash of the request body for signing
 */
export async function hashRequestBody(body: string | object): Promise<string> {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a signed request from signing input
 */
export async function createSignedRequest(
  input: SigningInput,
  privateKey: string,
  signedAt?: Timestamp
): Promise<SignedRequestFields> {
  const timestamp = signedAt ?? (new Date().toISOString() as Timestamp);

  const signedData = constructSignedData({
    actor: input.actor,
    signedAt: timestamp,
    requestHash: input.requestHash,
  });

  const signature = await signEd25519(privateKey, signedData);

  return {
    signature,
    signedAt: timestamp,
    actor: input.actor,
  };
}

/**
 * Merges partial config with defaults
 */
export function createIdentityConfig(
  partial?: Partial<IdentityConfig>
): IdentityConfig {
  return {
    ...DEFAULT_IDENTITY_CONFIG,
    ...partial,
  };
}

// ============================================================================
// Actor Context Management (Phase 2: Soft Identity)
// ============================================================================

/**
 * Sources from which actor identity can be determined
 */
export const ActorSource = {
  /** Explicitly provided in the operation */
  EXPLICIT: 'explicit',
  /** From CLI --actor flag */
  CLI_FLAG: 'cli_flag',
  /** From configuration file */
  CONFIG: 'config',
  /** From element's createdBy field (fallback) */
  ELEMENT: 'element',
  /** System-generated operations */
  SYSTEM: 'system',
} as const;

export type ActorSource = (typeof ActorSource)[keyof typeof ActorSource];

/**
 * Actor context for tracking who is performing an operation
 */
export interface ActorContext {
  /** The actor's entity ID or name */
  readonly actor: string;
  /** Where the actor identity came from */
  readonly source: ActorSource;
  /** Whether the actor has been verified (always false in soft mode) */
  readonly verified: boolean;
  /** Optional entity ID if the actor was looked up and exists */
  readonly entityId?: string;
}

/**
 * Options for resolving actor context
 */
export interface ActorResolutionOptions {
  /** Explicitly provided actor (highest priority) */
  explicitActor?: string;
  /** Actor from CLI flag */
  cliActor?: string;
  /** Actor from configuration */
  configActor?: string;
  /** Fallback actor from element's createdBy (lowest priority) */
  elementCreatedBy?: string;
  /** Identity configuration */
  config?: Partial<IdentityConfig>;
  /** Function to look up entity by name */
  lookupEntity?: EntityLookup;
}

/**
 * Result of actor validation
 */
export interface ActorValidationResult {
  /** Whether the actor is valid */
  valid: boolean;
  /** The resolved actor context if valid */
  context?: ActorContext;
  /** Error message if invalid */
  error?: string;
  /** Whether the actor entity exists (only checked in soft mode with lookupEntity) */
  entityExists?: boolean;
}

/**
 * Resolves actor context from multiple sources
 *
 * Priority order (highest to lowest):
 * 1. Explicit actor (provided in operation)
 * 2. CLI actor (--actor flag)
 * 3. Config actor (default actor in config)
 * 4. Element's createdBy (fallback for updates/deletes)
 *
 * @param options - Resolution options with actor sources
 * @returns The resolved actor context
 * @throws ValidationError if no actor can be resolved
 */
export function resolveActor(options: ActorResolutionOptions): ActorContext {
  // Try each source in priority order
  if (options.explicitActor) {
    return {
      actor: options.explicitActor,
      source: ActorSource.EXPLICIT,
      verified: false,
    };
  }

  if (options.cliActor) {
    return {
      actor: options.cliActor,
      source: ActorSource.CLI_FLAG,
      verified: false,
    };
  }

  if (options.configActor) {
    return {
      actor: options.configActor,
      source: ActorSource.CONFIG,
      verified: false,
    };
  }

  if (options.elementCreatedBy) {
    return {
      actor: options.elementCreatedBy,
      source: ActorSource.ELEMENT,
      verified: false,
    };
  }

  // No actor could be resolved
  throw new ValidationError(
    'No actor could be resolved. Provide an actor explicitly, via CLI flag (--actor), or in configuration.',
    ErrorCode.MISSING_REQUIRED_FIELD,
    { field: 'actor' }
  );
}

/**
 * Validates an actor in soft identity mode
 *
 * In soft mode:
 * - Accepts any non-empty string as actor
 * - Optionally checks if entity exists (if lookupEntity provided and allowUnregisteredActors is false)
 * - Always returns verified: false
 *
 * @param actor - The actor name/ID to validate
 * @param options - Validation options
 * @returns Validation result with context if valid
 */
export async function validateSoftActor(
  actor: string,
  options?: {
    lookupEntity?: EntityLookup;
    config?: Partial<IdentityConfig>;
  }
): Promise<ActorValidationResult> {
  const config = { ...DEFAULT_IDENTITY_CONFIG, ...options?.config };

  // Basic validation - must be non-empty string
  if (!actor || typeof actor !== 'string' || actor.trim().length === 0) {
    return {
      valid: false,
      error: 'Actor must be a non-empty string',
    };
  }

  // In soft mode with unregistered actors allowed, skip lookup
  if (config.mode === IdentityMode.SOFT && config.allowUnregisteredActors) {
    return {
      valid: true,
      context: {
        actor,
        source: ActorSource.EXPLICIT,
        verified: false,
      },
    };
  }

  // If lookupEntity is provided and unregistered actors not allowed, verify entity exists
  if (options?.lookupEntity && !config.allowUnregisteredActors) {
    const entity = await options.lookupEntity(actor);
    if (!entity) {
      return {
        valid: false,
        error: `Actor '${actor}' not found and unregistered actors are not allowed`,
        entityExists: false,
      };
    }
    return {
      valid: true,
      context: {
        actor,
        source: ActorSource.EXPLICIT,
        verified: false,
        entityId: actor, // In soft mode, actor name is used as ID reference
      },
      entityExists: true,
    };
  }

  // Default: accept the actor
  return {
    valid: true,
    context: {
      actor,
      source: ActorSource.EXPLICIT,
      verified: false,
    },
  };
}

/**
 * Type guard for ActorContext
 */
export function isActorContext(value: unknown): value is ActorContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.actor === 'string' &&
    typeof obj.source === 'string' &&
    Object.values(ActorSource).includes(obj.source as ActorSource) &&
    typeof obj.verified === 'boolean'
  );
}

/**
 * Creates an actor context for system operations
 */
export function createSystemActorContext(): ActorContext {
  return {
    actor: 'system',
    source: ActorSource.SYSTEM,
    verified: true, // System is always trusted
  };
}

/**
 * Creates an actor context from an explicit actor string
 */
export function createActorContext(
  actor: string,
  source: ActorSource = ActorSource.EXPLICIT
): ActorContext {
  return {
    actor,
    source,
    verified: false,
  };
}

// ============================================================================
// Verification Middleware (Phase 4)
// ============================================================================

/**
 * Middleware context for request verification
 */
export interface MiddlewareContext {
  /** The actor making the request (if authenticated) */
  actor?: string;
  /** Whether the request was verified cryptographically */
  verified: boolean;
  /** The verification result (if verification was attempted) */
  verificationResult?: VerificationResult;
  /** The identity mode used */
  mode: IdentityMode;
}

/**
 * Request object that may contain signed fields
 */
export interface SignableRequest {
  /** Optional signed request fields for cryptographic verification */
  signedRequest?: SignedRequestFields;
  /** The request body (used to compute hash for verification) */
  body?: string | object;
}

/**
 * Middleware result
 */
export interface MiddlewareResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean;
  /** The middleware context with authentication info */
  context: MiddlewareContext;
  /** Error message if not allowed */
  error?: string;
}

/**
 * Options for verification middleware
 */
export interface VerificationMiddlewareOptions {
  /** Identity configuration */
  config?: Partial<IdentityConfig>;
  /** Function to look up entity by actor name */
  lookupEntity: EntityLookup;
  /** Current time (for testing) */
  now?: Date;
}

/**
 * Creates a verification middleware function
 *
 * The middleware:
 * 1. Checks identity mode from config
 * 2. In soft mode: allows all requests, extracts actor if provided
 * 3. In cryptographic mode: requires valid signature
 * 4. In hybrid mode: allows unsigned or validly signed requests
 *
 * @param options - Middleware options
 * @returns A middleware function that verifies requests
 *
 * @example
 * ```typescript
 * const middleware = createVerificationMiddleware({
 *   lookupEntity: (actor) => api.lookupEntityByName(actor),
 *   config: { mode: IdentityMode.CRYPTOGRAPHIC }
 * });
 *
 * const result = await middleware(request);
 * if (!result.allowed) {
 *   throw new Error(result.error);
 * }
 * // Use result.context.actor for the verified actor
 * ```
 */
export function createVerificationMiddleware(
  options: VerificationMiddlewareOptions
): (request: SignableRequest) => Promise<MiddlewareResult> {
  const config = createIdentityConfig(options.config);

  return async (request: SignableRequest): Promise<MiddlewareResult> => {
    const { signedRequest, body } = request;
    const mode = config.mode;

    // Case 1: Soft mode - always allow, extract actor if provided
    if (mode === IdentityMode.SOFT) {
      return {
        allowed: true,
        context: {
          actor: signedRequest?.actor,
          verified: false,
          mode,
        },
      };
    }

    // Case 2: No signed request provided
    if (!signedRequest) {
      if (mode === IdentityMode.CRYPTOGRAPHIC) {
        return {
          allowed: false,
          context: {
            verified: false,
            mode,
          },
          error: 'Signature required in cryptographic mode',
        };
      }

      // Hybrid mode: allow unsigned requests
      return {
        allowed: true,
        context: {
          verified: false,
          mode,
        },
      };
    }

    // Case 3: Signed request provided - verify it
    // Compute request hash
    let requestHash: string;
    try {
      requestHash = await hashRequestBody(body ?? '');
    } catch {
      return {
        allowed: false,
        context: {
          verified: false,
          mode,
        },
        error: 'Failed to compute request hash',
      };
    }

    // Perform verification
    const verificationResult = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: options.lookupEntity,
      config,
      now: options.now,
    });

    // Check if request should be allowed
    const allowed = shouldAllowRequest(mode, verificationResult);

    return {
      allowed,
      context: {
        actor: verificationResult.status === VerificationStatus.VALID
          ? verificationResult.actor
          : signedRequest.actor,
        verified: verificationResult.status === VerificationStatus.VALID,
        verificationResult,
        mode,
      },
      error: allowed ? undefined : verificationResult.error ?? 'Verification failed',
    };
  };
}

/**
 * Creates middleware context for an unsigned request in soft mode
 */
export function createSoftModeContext(actor?: string): MiddlewareContext {
  return {
    actor,
    verified: false,
    mode: IdentityMode.SOFT,
  };
}

/**
 * Creates middleware context for a verified request
 */
export function createVerifiedContext(actor: string, verificationResult: VerificationResult): MiddlewareContext {
  return {
    actor,
    verified: true,
    verificationResult,
    mode: IdentityMode.CRYPTOGRAPHIC,
  };
}
