import { describe, expect, test, beforeAll } from 'bun:test';
import {
  // Types
  IdentityMode,
  VerificationStatus,
  DEFAULT_TIME_TOLERANCE,
  DEFAULT_IDENTITY_CONFIG,
  type Signature,
  type PublicKey,
  type SignedRequestFields,
  type SignedData,
  type VerificationResult,
  type IdentityConfig,
  // Validation functions
  isValidIdentityMode,
  validateIdentityMode,
  isValidPublicKey,
  validatePublicKey,
  isValidSignature,
  validateSignature,
  isValidRequestHash,
  validateRequestHash,
  isValidTimeTolerance,
  validateTimeTolerance,
  // Type guards
  isSignedRequestFields,
  validateSignedRequestFields,
  isVerificationResult,
  isIdentityConfig,
  validateIdentityConfig,
  // Signed data
  constructSignedData,
  parseSignedData,
  // Time tolerance
  checkTimeTolerance,
  validateTimeTolerance2,
  // Verification factories
  verificationSuccess,
  verificationFailure,
  verificationNotSigned,
  // Ed25519 operations
  verifyEd25519Signature,
  signEd25519,
  generateEd25519Keypair,
  // Verification pipeline
  verifySignature,
  shouldAllowRequest,
  // Utilities
  hashRequestBody,
  createSignedRequest,
  createIdentityConfig,
  // Phase 2: Actor Context Management
  ActorSource,
  resolveActor,
  validateSoftActor,
  isActorContext,
  createSystemActorContext,
  createActorContext,
  createVerificationMiddleware,
  createSoftModeContext,
  createVerifiedContext,
  type ActorContext,
  type ActorResolutionOptions,
  type MiddlewareContext,
  type SignableRequest,
} from './identity.js';
import { ValidationError, IdentityError, ErrorCode, Timestamp } from '@stoneforge/core';

// Test constants - 32 bytes base64 encoded = 44 chars (43 + '=')
const VALID_PUBLIC_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' as PublicKey;
// 64 bytes base64 encoded = 88 chars (86 + '==')
const VALID_SIGNATURE = ('A'.repeat(86) + '==') as Signature;
const VALID_REQUEST_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const VALID_TIMESTAMP = '2025-01-22T10:00:00.000Z' as Timestamp;

// Store generated keys for tests
let testKeypair: { publicKey: PublicKey; privateKey: string };

beforeAll(async () => {
  testKeypair = await generateEd25519Keypair();
});

// ============================================================================
// Identity Mode Tests
// ============================================================================

describe('IdentityMode', () => {
  test('contains all expected modes', () => {
    expect(IdentityMode.SOFT).toBe('soft');
    expect(IdentityMode.CRYPTOGRAPHIC).toBe('cryptographic');
    expect(IdentityMode.HYBRID).toBe('hybrid');
  });

  test('has exactly 3 modes', () => {
    expect(Object.keys(IdentityMode)).toHaveLength(3);
  });
});

describe('isValidIdentityMode', () => {
  test('accepts all valid identity modes', () => {
    expect(isValidIdentityMode('soft')).toBe(true);
    expect(isValidIdentityMode('cryptographic')).toBe(true);
    expect(isValidIdentityMode('hybrid')).toBe(true);
  });

  test('rejects invalid modes', () => {
    expect(isValidIdentityMode('invalid')).toBe(false);
    expect(isValidIdentityMode('SOFT')).toBe(false);
    expect(isValidIdentityMode(null)).toBe(false);
    expect(isValidIdentityMode(undefined)).toBe(false);
    expect(isValidIdentityMode(123)).toBe(false);
    expect(isValidIdentityMode({})).toBe(false);
  });
});

describe('validateIdentityMode', () => {
  test('returns valid identity mode', () => {
    expect(validateIdentityMode('soft')).toBe('soft');
    expect(validateIdentityMode('cryptographic')).toBe('cryptographic');
    expect(validateIdentityMode('hybrid')).toBe('hybrid');
  });

  test('throws ValidationError for invalid mode', () => {
    expect(() => validateIdentityMode('invalid')).toThrow(ValidationError);
    try {
      validateIdentityMode('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('mode');
    }
  });
});

// ============================================================================
// Public Key Validation Tests
// ============================================================================

describe('isValidPublicKey', () => {
  test('accepts valid Ed25519 public key (44 chars with = padding)', () => {
    expect(isValidPublicKey(VALID_PUBLIC_KEY)).toBe(true);
    // 43 valid base64 chars + '=' padding = 44 chars total (26+10+2+5 chars before =)
    expect(isValidPublicKey('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk012345=')).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(isValidPublicKey(null)).toBe(false);
    expect(isValidPublicKey(undefined)).toBe(false);
    expect(isValidPublicKey(123)).toBe(false);
    expect(isValidPublicKey({})).toBe(false);
  });

  test('rejects keys with wrong length', () => {
    expect(isValidPublicKey('AAAA')).toBe(false);
    expect(isValidPublicKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false); // no padding
    expect(isValidPublicKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')).toBe(false); // too long
  });

  test('rejects keys with invalid characters', () => {
    expect(isValidPublicKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA!=')).toBe(false);
    expect(isValidPublicKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$=')).toBe(false);
  });
});

describe('validatePublicKey', () => {
  test('returns valid public key', () => {
    expect(validatePublicKey(VALID_PUBLIC_KEY)).toBe(VALID_PUBLIC_KEY);
  });

  test('throws IdentityError for non-string', () => {
    expect(() => validatePublicKey(123)).toThrow(IdentityError);
    try {
      validatePublicKey(123);
    } catch (e) {
      const err = e as IdentityError;
      expect(err.code).toBe(ErrorCode.INVALID_PUBLIC_KEY);
      expect(err.details.field).toBe('publicKey');
    }
  });

  test('throws IdentityError for invalid format', () => {
    expect(() => validatePublicKey('AAAA')).toThrow(IdentityError);
    try {
      validatePublicKey('AAAA');
    } catch (e) {
      const err = e as IdentityError;
      expect(err.code).toBe(ErrorCode.INVALID_PUBLIC_KEY);
      expect(err.message).toContain('Invalid public key format');
    }
  });
});

// ============================================================================
// Signature Validation Tests
// ============================================================================

describe('isValidSignature', () => {
  test('accepts valid Ed25519 signature (88 chars with == padding)', () => {
    expect(isValidSignature(VALID_SIGNATURE)).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(isValidSignature(null)).toBe(false);
    expect(isValidSignature(undefined)).toBe(false);
    expect(isValidSignature(123)).toBe(false);
    expect(isValidSignature({})).toBe(false);
  });

  test('rejects signatures with wrong length', () => {
    expect(isValidSignature('AAAA')).toBe(false);
    expect(isValidSignature(VALID_SIGNATURE.slice(0, -2))).toBe(false); // no padding
  });

  test('rejects signatures with wrong padding', () => {
    // Should end with == for 64 bytes
    expect(isValidSignature(VALID_SIGNATURE.slice(0, -2) + 'A=')).toBe(false);
  });
});

describe('validateSignature', () => {
  test('returns valid signature', () => {
    expect(validateSignature(VALID_SIGNATURE)).toBe(VALID_SIGNATURE);
  });

  test('throws IdentityError for non-string', () => {
    expect(() => validateSignature(123)).toThrow(IdentityError);
    try {
      validateSignature(123);
    } catch (e) {
      const err = e as IdentityError;
      expect(err.code).toBe(ErrorCode.INVALID_SIGNATURE);
      expect(err.details.field).toBe('signature');
    }
  });

  test('throws IdentityError for invalid format', () => {
    expect(() => validateSignature('AAAA')).toThrow(IdentityError);
    try {
      validateSignature('AAAA');
    } catch (e) {
      const err = e as IdentityError;
      expect(err.code).toBe(ErrorCode.INVALID_SIGNATURE);
      expect(err.message).toContain('Invalid signature format');
    }
  });
});

// ============================================================================
// Request Hash Validation Tests
// ============================================================================

describe('isValidRequestHash', () => {
  test('accepts valid SHA256 hex hash', () => {
    expect(isValidRequestHash(VALID_REQUEST_HASH)).toBe(true);
    expect(isValidRequestHash('0'.repeat(64))).toBe(true);
    expect(isValidRequestHash('f'.repeat(64))).toBe(true);
    expect(isValidRequestHash('ABCDEF1234567890'.repeat(4))).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(isValidRequestHash(null)).toBe(false);
    expect(isValidRequestHash(undefined)).toBe(false);
    expect(isValidRequestHash(123)).toBe(false);
  });

  test('rejects hashes with wrong length', () => {
    expect(isValidRequestHash('abc123')).toBe(false);
    expect(isValidRequestHash('0'.repeat(63))).toBe(false);
    expect(isValidRequestHash('0'.repeat(65))).toBe(false);
  });

  test('rejects hashes with invalid characters', () => {
    expect(isValidRequestHash('g'.repeat(64))).toBe(false);
    expect(isValidRequestHash('z'.repeat(64))).toBe(false);
  });
});

describe('validateRequestHash', () => {
  test('returns valid request hash', () => {
    expect(validateRequestHash(VALID_REQUEST_HASH)).toBe(VALID_REQUEST_HASH);
  });

  test('throws ValidationError for non-string', () => {
    expect(() => validateRequestHash(123)).toThrow(ValidationError);
    try {
      validateRequestHash(123);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  test('throws ValidationError for invalid format', () => {
    expect(() => validateRequestHash('invalid')).toThrow(ValidationError);
  });
});

// ============================================================================
// Time Tolerance Validation Tests
// ============================================================================

describe('isValidTimeTolerance', () => {
  test('accepts valid time tolerance values', () => {
    expect(isValidTimeTolerance(1000)).toBe(true);
    expect(isValidTimeTolerance(DEFAULT_TIME_TOLERANCE)).toBe(true);
    expect(isValidTimeTolerance(24 * 60 * 60 * 1000)).toBe(true); // 24 hours
  });

  test('rejects invalid values', () => {
    expect(isValidTimeTolerance(0)).toBe(false);
    expect(isValidTimeTolerance(-1000)).toBe(false);
    expect(isValidTimeTolerance(Infinity)).toBe(false);
    expect(isValidTimeTolerance(NaN)).toBe(false);
    expect(isValidTimeTolerance(25 * 60 * 60 * 1000)).toBe(false); // > 24 hours
    expect(isValidTimeTolerance('1000')).toBe(false);
    expect(isValidTimeTolerance(null)).toBe(false);
  });
});

describe('validateTimeTolerance', () => {
  test('returns valid time tolerance', () => {
    expect(validateTimeTolerance(DEFAULT_TIME_TOLERANCE)).toBe(DEFAULT_TIME_TOLERANCE);
  });

  test('throws ValidationError for invalid value', () => {
    expect(() => validateTimeTolerance(-1)).toThrow(ValidationError);
    expect(() => validateTimeTolerance(0)).toThrow(ValidationError);
  });
});

// ============================================================================
// Signed Request Fields Tests
// ============================================================================

describe('isSignedRequestFields', () => {
  const validFields: SignedRequestFields = {
    signature: VALID_SIGNATURE,
    signedAt: VALID_TIMESTAMP,
    actor: 'test-actor',
  };

  test('accepts valid signed request fields', () => {
    expect(isSignedRequestFields(validFields)).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isSignedRequestFields(null)).toBe(false);
    expect(isSignedRequestFields(undefined)).toBe(false);
    expect(isSignedRequestFields('string')).toBe(false);
  });

  test('rejects fields with invalid signature', () => {
    expect(isSignedRequestFields({ ...validFields, signature: 'invalid' })).toBe(false);
  });

  test('rejects fields with invalid signedAt', () => {
    expect(isSignedRequestFields({ ...validFields, signedAt: 'invalid' })).toBe(false);
  });

  test('rejects fields with empty actor', () => {
    expect(isSignedRequestFields({ ...validFields, actor: '' })).toBe(false);
  });
});

describe('validateSignedRequestFields', () => {
  const validFields: SignedRequestFields = {
    signature: VALID_SIGNATURE,
    signedAt: VALID_TIMESTAMP,
    actor: 'test-actor',
  };

  test('returns valid signed request fields', () => {
    expect(validateSignedRequestFields(validFields)).toEqual(validFields);
  });

  test('throws ValidationError for non-object', () => {
    expect(() => validateSignedRequestFields(null)).toThrow(ValidationError);
  });

  test('throws for invalid signature', () => {
    expect(() => validateSignedRequestFields({ ...validFields, signature: 'invalid' })).toThrow(IdentityError);
  });

  test('throws for invalid signedAt', () => {
    expect(() => validateSignedRequestFields({ ...validFields, signedAt: 'invalid' })).toThrow(ValidationError);
  });

  test('throws for empty actor', () => {
    expect(() => validateSignedRequestFields({ ...validFields, actor: '' })).toThrow(ValidationError);
  });
});

// ============================================================================
// Verification Result Tests
// ============================================================================

describe('isVerificationResult', () => {
  test('accepts valid verification results', () => {
    expect(isVerificationResult({ status: VerificationStatus.VALID, allowed: true })).toBe(true);
    expect(isVerificationResult({ status: VerificationStatus.INVALID, allowed: false })).toBe(true);
  });

  test('rejects invalid verification results', () => {
    expect(isVerificationResult(null)).toBe(false);
    expect(isVerificationResult({ status: 'invalid-status', allowed: true })).toBe(false);
    expect(isVerificationResult({ status: VerificationStatus.VALID, allowed: 'yes' })).toBe(false);
  });
});

describe('verificationSuccess', () => {
  test('creates successful verification result', () => {
    const result = verificationSuccess('test-actor', 1000);
    expect(result.status).toBe(VerificationStatus.VALID);
    expect(result.allowed).toBe(true);
    expect(result.actor).toBe('test-actor');
    expect(result.details?.signatureAgeMs).toBe(1000);
  });

  test('creates result without age', () => {
    const result = verificationSuccess('test-actor');
    expect(result.details).toBeUndefined();
  });
});

describe('verificationFailure', () => {
  test('creates failed verification result', () => {
    const result = verificationFailure(VerificationStatus.INVALID, 'Test error', { entityFound: false });
    expect(result.status).toBe(VerificationStatus.INVALID);
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Test error');
    expect(result.details?.entityFound).toBe(false);
  });
});

describe('verificationNotSigned', () => {
  test('creates not signed result (allowed)', () => {
    const result = verificationNotSigned(true, 'test-actor');
    expect(result.status).toBe(VerificationStatus.NOT_SIGNED);
    expect(result.allowed).toBe(true);
    expect(result.actor).toBe('test-actor');
    expect(result.error).toBeUndefined();
  });

  test('creates not signed result (not allowed)', () => {
    const result = verificationNotSigned(false);
    expect(result.status).toBe(VerificationStatus.NOT_SIGNED);
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Signature required in cryptographic mode');
  });
});

// ============================================================================
// Identity Config Tests
// ============================================================================

describe('isIdentityConfig', () => {
  test('accepts valid identity config', () => {
    expect(isIdentityConfig(DEFAULT_IDENTITY_CONFIG)).toBe(true);
  });

  test('rejects invalid config', () => {
    expect(isIdentityConfig(null)).toBe(false);
    expect(isIdentityConfig({ mode: 'invalid', timeTolerance: 1000, allowUnregisteredActors: true })).toBe(false);
    expect(isIdentityConfig({ mode: 'soft', timeTolerance: -1, allowUnregisteredActors: true })).toBe(false);
    expect(isIdentityConfig({ mode: 'soft', timeTolerance: 1000, allowUnregisteredActors: 'yes' })).toBe(false);
  });
});

describe('validateIdentityConfig', () => {
  test('returns valid identity config', () => {
    expect(validateIdentityConfig(DEFAULT_IDENTITY_CONFIG)).toEqual(DEFAULT_IDENTITY_CONFIG);
  });

  test('throws for non-object', () => {
    expect(() => validateIdentityConfig(null)).toThrow(ValidationError);
  });

  test('throws for invalid mode', () => {
    expect(() => validateIdentityConfig({ ...DEFAULT_IDENTITY_CONFIG, mode: 'invalid' })).toThrow(ValidationError);
  });

  test('throws for invalid timeTolerance', () => {
    expect(() => validateIdentityConfig({ ...DEFAULT_IDENTITY_CONFIG, timeTolerance: -1 })).toThrow(ValidationError);
  });

  test('throws for invalid allowUnregisteredActors', () => {
    expect(() => validateIdentityConfig({ ...DEFAULT_IDENTITY_CONFIG, allowUnregisteredActors: 'yes' })).toThrow(ValidationError);
  });
});

describe('createIdentityConfig', () => {
  test('creates config with defaults', () => {
    expect(createIdentityConfig()).toEqual(DEFAULT_IDENTITY_CONFIG);
  });

  test('merges partial config with defaults', () => {
    const config = createIdentityConfig({ mode: IdentityMode.CRYPTOGRAPHIC });
    expect(config.mode).toBe(IdentityMode.CRYPTOGRAPHIC);
    expect(config.timeTolerance).toBe(DEFAULT_TIME_TOLERANCE);
    expect(config.allowUnregisteredActors).toBe(true);
  });
});

// ============================================================================
// Signed Data Tests
// ============================================================================

describe('constructSignedData', () => {
  test('constructs signed data string', () => {
    const data: SignedData = {
      actor: 'test-actor',
      signedAt: VALID_TIMESTAMP,
      requestHash: VALID_REQUEST_HASH,
    };
    const result = constructSignedData(data);
    expect(result).toBe(`test-actor|${VALID_TIMESTAMP}|${VALID_REQUEST_HASH}`);
  });
});

describe('parseSignedData', () => {
  test('parses valid signed data string', () => {
    const signedDataString = `test-actor|${VALID_TIMESTAMP}|${VALID_REQUEST_HASH}`;
    const result = parseSignedData(signedDataString);
    expect(result.actor).toBe('test-actor');
    expect(result.signedAt).toBe(VALID_TIMESTAMP);
    expect(result.requestHash).toBe(VALID_REQUEST_HASH);
  });

  test('throws for invalid format (wrong number of parts)', () => {
    expect(() => parseSignedData('only-one-part')).toThrow(ValidationError);
    expect(() => parseSignedData('one|two')).toThrow(ValidationError);
    expect(() => parseSignedData('one|two|three|four')).toThrow(ValidationError);
  });

  test('throws for empty actor', () => {
    expect(() => parseSignedData(`|${VALID_TIMESTAMP}|${VALID_REQUEST_HASH}`)).toThrow(ValidationError);
  });

  test('throws for invalid timestamp', () => {
    expect(() => parseSignedData(`test-actor|invalid|${VALID_REQUEST_HASH}`)).toThrow(ValidationError);
  });

  test('throws for invalid request hash', () => {
    expect(() => parseSignedData(`test-actor|${VALID_TIMESTAMP}|invalid`)).toThrow(ValidationError);
  });
});

// ============================================================================
// Time Tolerance Tests
// ============================================================================

describe('checkTimeTolerance', () => {
  test('returns valid for timestamp within tolerance', () => {
    const now = new Date('2025-01-22T10:00:00.000Z');
    const signedAt = '2025-01-22T09:58:00.000Z' as Timestamp; // 2 minutes ago
    const result = checkTimeTolerance(signedAt, DEFAULT_TIME_TOLERANCE, now);
    expect(result.valid).toBe(true);
    expect(result.ageMs).toBe(2 * 60 * 1000);
  });

  test('returns invalid for timestamp outside tolerance', () => {
    const now = new Date('2025-01-22T10:00:00.000Z');
    const signedAt = '2025-01-22T09:50:00.000Z' as Timestamp; // 10 minutes ago
    const result = checkTimeTolerance(signedAt, DEFAULT_TIME_TOLERANCE, now);
    expect(result.valid).toBe(false);
    expect(result.ageMs).toBe(10 * 60 * 1000);
    expect(result.expiredBy).toBe(5 * 60 * 1000);
  });

  test('handles future timestamps', () => {
    const now = new Date('2025-01-22T10:00:00.000Z');
    const signedAt = '2025-01-22T10:02:00.000Z' as Timestamp; // 2 minutes in future
    const result = checkTimeTolerance(signedAt, DEFAULT_TIME_TOLERANCE, now);
    expect(result.valid).toBe(true);
    expect(result.ageMs).toBe(2 * 60 * 1000);
  });

  test('rejects future timestamps outside tolerance', () => {
    const now = new Date('2025-01-22T10:00:00.000Z');
    const signedAt = '2025-01-22T10:10:00.000Z' as Timestamp; // 10 minutes in future
    const result = checkTimeTolerance(signedAt, DEFAULT_TIME_TOLERANCE, now);
    expect(result.valid).toBe(false);
  });
});

describe('validateTimeTolerance2', () => {
  test('does not throw for valid timestamp', () => {
    const now = new Date('2025-01-22T10:00:00.000Z');
    const signedAt = '2025-01-22T09:58:00.000Z' as Timestamp;
    expect(() => validateTimeTolerance2(signedAt, DEFAULT_TIME_TOLERANCE, now)).not.toThrow();
  });

  test('throws IdentityError for expired timestamp', () => {
    const now = new Date('2025-01-22T10:00:00.000Z');
    const signedAt = '2025-01-22T09:50:00.000Z' as Timestamp;
    expect(() => validateTimeTolerance2(signedAt, DEFAULT_TIME_TOLERANCE, now)).toThrow(IdentityError);
    try {
      validateTimeTolerance2(signedAt, DEFAULT_TIME_TOLERANCE, now);
    } catch (e) {
      const err = e as IdentityError;
      expect(err.code).toBe(ErrorCode.SIGNATURE_EXPIRED);
      expect(err.message).toContain('Signature expired');
    }
  });
});

// ============================================================================
// Ed25519 Cryptographic Operations Tests
// ============================================================================

describe('generateEd25519Keypair', () => {
  test('generates valid keypair', async () => {
    const keypair = await generateEd25519Keypair();
    expect(isValidPublicKey(keypair.publicKey)).toBe(true);
    expect(typeof keypair.privateKey).toBe('string');
    expect(keypair.privateKey.length).toBe(64); // PKCS8 48 bytes base64 = 64 chars
  });

  test('generates unique keypairs', async () => {
    const keypair1 = await generateEd25519Keypair();
    const keypair2 = await generateEd25519Keypair();
    expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
    expect(keypair1.privateKey).not.toBe(keypair2.privateKey);
  });
});

describe('signEd25519', () => {
  test('signs data and returns valid signature format', async () => {
    const signature = await signEd25519(testKeypair.privateKey, 'test data');
    expect(isValidSignature(signature)).toBe(true);
  });

  test('produces different signatures for different data', async () => {
    const sig1 = await signEd25519(testKeypair.privateKey, 'data 1');
    const sig2 = await signEd25519(testKeypair.privateKey, 'data 2');
    expect(sig1).not.toBe(sig2);
  });

  test('produces same signature for same data', async () => {
    const sig1 = await signEd25519(testKeypair.privateKey, 'same data');
    const sig2 = await signEd25519(testKeypair.privateKey, 'same data');
    expect(sig1).toBe(sig2);
  });
});

describe('verifyEd25519Signature', () => {
  test('verifies valid signature', async () => {
    const data = 'test data to sign';
    const signature = await signEd25519(testKeypair.privateKey, data);
    const isValid = await verifyEd25519Signature(testKeypair.publicKey, signature, data);
    expect(isValid).toBe(true);
  });

  test('rejects signature with wrong data', async () => {
    const signature = await signEd25519(testKeypair.privateKey, 'original data');
    const isValid = await verifyEd25519Signature(testKeypair.publicKey, signature, 'different data');
    expect(isValid).toBe(false);
  });

  test('rejects signature with wrong key', async () => {
    const otherKeypair = await generateEd25519Keypair();
    const signature = await signEd25519(testKeypair.privateKey, 'test data');
    const isValid = await verifyEd25519Signature(otherKeypair.publicKey, signature, 'test data');
    expect(isValid).toBe(false);
  });

  test('handles Uint8Array data', async () => {
    const data = new TextEncoder().encode('test data');
    const signature = await signEd25519(testKeypair.privateKey, data);
    const isValid = await verifyEd25519Signature(testKeypair.publicKey, signature, data);
    expect(isValid).toBe(true);
  });

  test('returns false for invalid public key length', async () => {
    const invalidKey = 'AAAA' as PublicKey; // Wrong length but cast for test
    const signature = await signEd25519(testKeypair.privateKey, 'test');
    const isValid = await verifyEd25519Signature(invalidKey, signature, 'test');
    expect(isValid).toBe(false);
  });
});

// ============================================================================
// Full Verification Pipeline Tests
// ============================================================================

describe('verifySignature', () => {
  test('verifies valid signed request', async () => {
    const requestHash = await hashRequestBody({ action: 'test' });
    const signedRequest = await createSignedRequest(
      { actor: 'test-actor', requestHash },
      testKeypair.privateKey
    );

    const result = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: async (actor) =>
        actor === 'test-actor' ? { publicKey: testKeypair.publicKey } : null,
    });

    expect(result.status).toBe(VerificationStatus.VALID);
    expect(result.allowed).toBe(true);
    expect(result.actor).toBe('test-actor');
  });

  test('returns ACTOR_NOT_FOUND when entity not found', async () => {
    const requestHash = await hashRequestBody({ action: 'test' });
    const signedRequest = await createSignedRequest(
      { actor: 'unknown-actor', requestHash },
      testKeypair.privateKey
    );

    const result = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: async () => null,
    });

    expect(result.status).toBe(VerificationStatus.ACTOR_NOT_FOUND);
    expect(result.allowed).toBe(false);
  });

  test('returns NO_PUBLIC_KEY when entity has no key', async () => {
    const requestHash = await hashRequestBody({ action: 'test' });
    const signedRequest = await createSignedRequest(
      { actor: 'test-actor', requestHash },
      testKeypair.privateKey
    );

    const result = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: async () => ({ publicKey: undefined }),
    });

    expect(result.status).toBe(VerificationStatus.NO_PUBLIC_KEY);
    expect(result.allowed).toBe(false);
  });

  test('returns EXPIRED for old signature', async () => {
    const requestHash = await hashRequestBody({ action: 'test' });
    const oldTimestamp = '2025-01-22T09:00:00.000Z' as Timestamp;
    const signedRequest = await createSignedRequest(
      { actor: 'test-actor', requestHash },
      testKeypair.privateKey,
      oldTimestamp
    );

    const result = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: async () => ({ publicKey: testKeypair.publicKey }),
      now: new Date('2025-01-22T10:00:00.000Z'),
    });

    expect(result.status).toBe(VerificationStatus.EXPIRED);
    expect(result.allowed).toBe(false);
  });

  test('returns INVALID for wrong signature', async () => {
    const requestHash = await hashRequestBody({ action: 'test' });
    const differentKeypair = await generateEd25519Keypair();
    const signedRequest = await createSignedRequest(
      { actor: 'test-actor', requestHash },
      differentKeypair.privateKey // Different key!
    );

    const result = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: async () => ({ publicKey: testKeypair.publicKey }),
    });

    expect(result.status).toBe(VerificationStatus.INVALID);
    expect(result.allowed).toBe(false);
  });

  test('returns INVALID for invalid request hash format', async () => {
    const signedRequest: SignedRequestFields = {
      signature: VALID_SIGNATURE,
      signedAt: VALID_TIMESTAMP,
      actor: 'test-actor',
    };

    const result = await verifySignature({
      signedRequest,
      requestHash: 'invalid-hash',
      lookupEntity: async () => ({ publicKey: testKeypair.publicKey }),
    });

    expect(result.status).toBe(VerificationStatus.INVALID);
    expect(result.error).toContain('Invalid request hash format');
  });
});

// ============================================================================
// shouldAllowRequest Tests
// ============================================================================

describe('shouldAllowRequest', () => {
  test('soft mode always allows', () => {
    expect(shouldAllowRequest(IdentityMode.SOFT, verificationSuccess('actor'))).toBe(true);
    expect(shouldAllowRequest(IdentityMode.SOFT, verificationFailure(VerificationStatus.INVALID, 'error'))).toBe(true);
    expect(shouldAllowRequest(IdentityMode.SOFT, verificationNotSigned(false))).toBe(true);
  });

  test('cryptographic mode only allows valid signatures', () => {
    expect(shouldAllowRequest(IdentityMode.CRYPTOGRAPHIC, verificationSuccess('actor'))).toBe(true);
    expect(shouldAllowRequest(IdentityMode.CRYPTOGRAPHIC, verificationFailure(VerificationStatus.INVALID, 'error'))).toBe(false);
    expect(shouldAllowRequest(IdentityMode.CRYPTOGRAPHIC, verificationNotSigned(false))).toBe(false);
  });

  test('hybrid mode allows valid signatures and unsigned requests', () => {
    expect(shouldAllowRequest(IdentityMode.HYBRID, verificationSuccess('actor'))).toBe(true);
    expect(shouldAllowRequest(IdentityMode.HYBRID, verificationNotSigned(true))).toBe(true);
    expect(shouldAllowRequest(IdentityMode.HYBRID, verificationFailure(VerificationStatus.INVALID, 'error'))).toBe(false);
  });
});

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('hashRequestBody', () => {
  test('hashes string body', async () => {
    const hash = await hashRequestBody('test data');
    expect(isValidRequestHash(hash)).toBe(true);
  });

  test('hashes object body', async () => {
    const hash = await hashRequestBody({ key: 'value' });
    expect(isValidRequestHash(hash)).toBe(true);
  });

  test('produces consistent hashes', async () => {
    const hash1 = await hashRequestBody('same data');
    const hash2 = await hashRequestBody('same data');
    expect(hash1).toBe(hash2);
  });

  test('produces different hashes for different data', async () => {
    const hash1 = await hashRequestBody('data 1');
    const hash2 = await hashRequestBody('data 2');
    expect(hash1).not.toBe(hash2);
  });

  test('produces known hash for empty string', async () => {
    const hash = await hashRequestBody('');
    // SHA256 of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('createSignedRequest', () => {
  test('creates valid signed request', async () => {
    const requestHash = await hashRequestBody('test');
    const signedRequest = await createSignedRequest(
      { actor: 'test-actor', requestHash },
      testKeypair.privateKey
    );

    expect(isSignedRequestFields(signedRequest)).toBe(true);
    expect(signedRequest.actor).toBe('test-actor');
    expect(isValidSignature(signedRequest.signature)).toBe(true);
  });

  test('uses provided timestamp', async () => {
    const requestHash = await hashRequestBody('test');
    const customTimestamp = '2025-01-22T12:00:00.000Z' as Timestamp;
    const signedRequest = await createSignedRequest(
      { actor: 'test-actor', requestHash },
      testKeypair.privateKey,
      customTimestamp
    );

    expect(signedRequest.signedAt).toBe(customTimestamp);
  });

  test('generates current timestamp when not provided', async () => {
    const requestHash = await hashRequestBody('test');
    const before = new Date().toISOString();
    const signedRequest = await createSignedRequest(
      { actor: 'test-actor', requestHash },
      testKeypair.privateKey
    );
    const after = new Date().toISOString();

    expect(signedRequest.signedAt >= before).toBe(true);
    expect(signedRequest.signedAt <= after).toBe(true);
  });
});

// ============================================================================
// Default Configuration Tests
// ============================================================================

describe('DEFAULT_TIME_TOLERANCE', () => {
  test('is 5 minutes in milliseconds', () => {
    expect(DEFAULT_TIME_TOLERANCE).toBe(5 * 60 * 1000);
  });
});

describe('DEFAULT_IDENTITY_CONFIG', () => {
  test('has expected defaults', () => {
    expect(DEFAULT_IDENTITY_CONFIG.mode).toBe(IdentityMode.SOFT);
    expect(DEFAULT_IDENTITY_CONFIG.timeTolerance).toBe(DEFAULT_TIME_TOLERANCE);
    expect(DEFAULT_IDENTITY_CONFIG.allowUnregisteredActors).toBe(true);
  });
});

// ============================================================================
// VerificationStatus Tests
// ============================================================================

describe('VerificationStatus', () => {
  test('contains all expected statuses', () => {
    expect(VerificationStatus.VALID).toBe('valid');
    expect(VerificationStatus.INVALID).toBe('invalid');
    expect(VerificationStatus.EXPIRED).toBe('expired');
    expect(VerificationStatus.ACTOR_NOT_FOUND).toBe('actor_not_found');
    expect(VerificationStatus.NO_PUBLIC_KEY).toBe('no_public_key');
    expect(VerificationStatus.NOT_SIGNED).toBe('not_signed');
  });

  test('has exactly 6 statuses', () => {
    expect(Object.keys(VerificationStatus)).toHaveLength(6);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: Full signing and verification flow', () => {
  test('complete request signing and verification cycle', async () => {
    // 1. Generate keypair
    const keypair = await generateEd25519Keypair();

    // 2. Create request body and hash it
    const requestBody = { action: 'create', data: { name: 'test' } };
    const requestHash = await hashRequestBody(requestBody);

    // 3. Sign the request
    const signedRequest = await createSignedRequest(
      { actor: 'alice', requestHash },
      keypair.privateKey
    );

    // 4. Verify the signature
    const result = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: async (actor) =>
        actor === 'alice' ? { publicKey: keypair.publicKey } : null,
    });

    expect(result.status).toBe(VerificationStatus.VALID);
    expect(result.allowed).toBe(true);
    expect(result.actor).toBe('alice');
  });

  test('tampered request body is detected', async () => {
    const keypair = await generateEd25519Keypair();
    const originalBody = { action: 'create', amount: 100 };
    const tamperedBody = { action: 'create', amount: 1000000 };

    const originalHash = await hashRequestBody(originalBody);
    const tamperedHash = await hashRequestBody(tamperedBody);

    const signedRequest = await createSignedRequest(
      { actor: 'alice', requestHash: originalHash },
      keypair.privateKey
    );

    // Try to verify with tampered body hash
    const result = await verifySignature({
      signedRequest,
      requestHash: tamperedHash, // Different from what was signed!
      lookupEntity: async () => ({ publicKey: keypair.publicKey }),
    });

    expect(result.status).toBe(VerificationStatus.INVALID);
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  test('handles actor names with special characters', async () => {
    const requestHash = await hashRequestBody('test');
    const signedRequest = await createSignedRequest(
      { actor: 'actor-with-hyphens_and_underscores123', requestHash },
      testKeypair.privateKey
    );

    const result = await verifySignature({
      signedRequest,
      requestHash,
      lookupEntity: async (actor) =>
        actor === 'actor-with-hyphens_and_underscores123'
          ? { publicKey: testKeypair.publicKey }
          : null,
    });

    expect(result.status).toBe(VerificationStatus.VALID);
  });

  test('handles large request bodies', async () => {
    const largeBody = { data: 'x'.repeat(100000) };
    const requestHash = await hashRequestBody(largeBody);
    expect(isValidRequestHash(requestHash)).toBe(true);
  });

  test('handles empty object request body', async () => {
    const hash = await hashRequestBody({});
    expect(isValidRequestHash(hash)).toBe(true);
  });

  test('signed data round-trips correctly', () => {
    const original: SignedData = {
      actor: 'test-actor',
      signedAt: VALID_TIMESTAMP,
      requestHash: VALID_REQUEST_HASH,
    };
    const constructed = constructSignedData(original);
    const parsed = parseSignedData(constructed);
    expect(parsed).toEqual(original);
  });
});

// ============================================================================
// Phase 2: Actor Context Management Tests
// ============================================================================

describe('ActorSource', () => {
  test('contains all expected sources', () => {
    expect(ActorSource.EXPLICIT).toBe('explicit');
    expect(ActorSource.CLI_FLAG).toBe('cli_flag');
    expect(ActorSource.CONFIG).toBe('config');
    expect(ActorSource.ELEMENT).toBe('element');
    expect(ActorSource.SYSTEM).toBe('system');
  });

  test('has exactly 5 sources', () => {
    expect(Object.keys(ActorSource)).toHaveLength(5);
  });
});

describe('resolveActor', () => {
  test('prioritizes explicit actor over all others', () => {
    const options: ActorResolutionOptions = {
      explicitActor: 'explicit-actor',
      cliActor: 'cli-actor',
      configActor: 'config-actor',
      elementCreatedBy: 'element-actor',
    };

    const result = resolveActor(options);

    expect(result.actor).toBe('explicit-actor');
    expect(result.source).toBe(ActorSource.EXPLICIT);
    expect(result.verified).toBe(false);
  });

  test('uses CLI actor when explicit not provided', () => {
    const options: ActorResolutionOptions = {
      cliActor: 'cli-actor',
      configActor: 'config-actor',
      elementCreatedBy: 'element-actor',
    };

    const result = resolveActor(options);

    expect(result.actor).toBe('cli-actor');
    expect(result.source).toBe(ActorSource.CLI_FLAG);
    expect(result.verified).toBe(false);
  });

  test('uses config actor when CLI not provided', () => {
    const options: ActorResolutionOptions = {
      configActor: 'config-actor',
      elementCreatedBy: 'element-actor',
    };

    const result = resolveActor(options);

    expect(result.actor).toBe('config-actor');
    expect(result.source).toBe(ActorSource.CONFIG);
    expect(result.verified).toBe(false);
  });

  test('uses element createdBy as fallback', () => {
    const options: ActorResolutionOptions = {
      elementCreatedBy: 'element-actor',
    };

    const result = resolveActor(options);

    expect(result.actor).toBe('element-actor');
    expect(result.source).toBe(ActorSource.ELEMENT);
    expect(result.verified).toBe(false);
  });

  test('throws ValidationError when no actor can be resolved', () => {
    expect(() => resolveActor({})).toThrow(ValidationError);

    try {
      resolveActor({});
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('No actor could be resolved');
      expect(err.details.field).toBe('actor');
    }
  });

  test('skips empty string sources', () => {
    const options: ActorResolutionOptions = {
      explicitActor: '', // Empty string should be falsy
      cliActor: 'cli-actor',
    };

    const result = resolveActor(options);

    expect(result.actor).toBe('cli-actor');
    expect(result.source).toBe(ActorSource.CLI_FLAG);
  });
});

describe('validateSoftActor', () => {
  test('accepts any non-empty string in soft mode with unregistered actors allowed', async () => {
    const result = await validateSoftActor('any-actor-name', {
      config: { mode: IdentityMode.SOFT, allowUnregisteredActors: true, timeTolerance: DEFAULT_TIME_TOLERANCE },
    });

    expect(result.valid).toBe(true);
    expect(result.context?.actor).toBe('any-actor-name');
    expect(result.context?.source).toBe(ActorSource.EXPLICIT);
    expect(result.context?.verified).toBe(false);
  });

  test('accepts actor with default config (soft mode, unregistered allowed)', async () => {
    const result = await validateSoftActor('test-actor');

    expect(result.valid).toBe(true);
    expect(result.context?.actor).toBe('test-actor');
  });

  test('rejects empty string', async () => {
    const result = await validateSoftActor('');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  test('rejects whitespace-only string', async () => {
    const result = await validateSoftActor('   ');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  test('rejects non-string values', async () => {
    // @ts-expect-error Testing invalid input
    const result = await validateSoftActor(123);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  test('validates entity existence when lookupEntity provided and unregistered not allowed', async () => {
    const mockLookup = async (name: string) => {
      if (name === 'existing-actor') {
        return { publicKey: undefined };
      }
      return null;
    };

    // Existing actor should be valid
    const resultExisting = await validateSoftActor('existing-actor', {
      lookupEntity: mockLookup,
      config: { mode: IdentityMode.SOFT, allowUnregisteredActors: false, timeTolerance: DEFAULT_TIME_TOLERANCE },
    });
    expect(resultExisting.valid).toBe(true);
    expect(resultExisting.entityExists).toBe(true);
    expect(resultExisting.context?.entityId).toBe('existing-actor');

    // Non-existing actor should be invalid
    const resultNonExisting = await validateSoftActor('non-existing-actor', {
      lookupEntity: mockLookup,
      config: { mode: IdentityMode.SOFT, allowUnregisteredActors: false, timeTolerance: DEFAULT_TIME_TOLERANCE },
    });
    expect(resultNonExisting.valid).toBe(false);
    expect(resultNonExisting.entityExists).toBe(false);
    expect(resultNonExisting.error).toContain('not found');
    expect(resultNonExisting.error).toContain('unregistered actors are not allowed');
  });

  test('accepts unregistered actors when allowUnregisteredActors is true', async () => {
    const mockLookup = async () => null; // Always returns not found

    const result = await validateSoftActor('unregistered-actor', {
      lookupEntity: mockLookup,
      config: { mode: IdentityMode.SOFT, allowUnregisteredActors: true, timeTolerance: DEFAULT_TIME_TOLERANCE },
    });

    expect(result.valid).toBe(true);
    expect(result.context?.actor).toBe('unregistered-actor');
  });
});

describe('isActorContext', () => {
  test('accepts valid actor context', () => {
    const context: ActorContext = {
      actor: 'test-actor',
      source: ActorSource.EXPLICIT,
      verified: false,
    };

    expect(isActorContext(context)).toBe(true);
  });

  test('accepts actor context with entityId', () => {
    const context: ActorContext = {
      actor: 'test-actor',
      source: ActorSource.EXPLICIT,
      verified: false,
      entityId: 'entity-123',
    };

    expect(isActorContext(context)).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isActorContext(null)).toBe(false);
    expect(isActorContext(undefined)).toBe(false);
    expect(isActorContext('string')).toBe(false);
    expect(isActorContext(123)).toBe(false);
  });

  test('rejects objects missing required fields', () => {
    expect(isActorContext({})).toBe(false);
    expect(isActorContext({ actor: 'test' })).toBe(false);
    expect(isActorContext({ actor: 'test', source: 'explicit' })).toBe(false);
  });

  test('rejects objects with invalid source', () => {
    expect(isActorContext({ actor: 'test', source: 'invalid-source', verified: false })).toBe(false);
  });

  test('rejects objects with non-boolean verified', () => {
    expect(isActorContext({ actor: 'test', source: 'explicit', verified: 'false' })).toBe(false);
  });
});

describe('createSystemActorContext', () => {
  test('creates system actor context', () => {
    const context = createSystemActorContext();

    expect(context.actor).toBe('system');
    expect(context.source).toBe(ActorSource.SYSTEM);
    expect(context.verified).toBe(true); // System is always verified/trusted
  });

  test('returns valid ActorContext', () => {
    const context = createSystemActorContext();
    expect(isActorContext(context)).toBe(true);
  });
});

describe('createActorContext', () => {
  test('creates actor context with default source (EXPLICIT)', () => {
    const context = createActorContext('my-actor');

    expect(context.actor).toBe('my-actor');
    expect(context.source).toBe(ActorSource.EXPLICIT);
    expect(context.verified).toBe(false);
  });

  test('creates actor context with custom source', () => {
    const context = createActorContext('cli-actor', ActorSource.CLI_FLAG);

    expect(context.actor).toBe('cli-actor');
    expect(context.source).toBe(ActorSource.CLI_FLAG);
    expect(context.verified).toBe(false);
  });

  test('creates actor context with CONFIG source', () => {
    const context = createActorContext('config-actor', ActorSource.CONFIG);

    expect(context.actor).toBe('config-actor');
    expect(context.source).toBe(ActorSource.CONFIG);
    expect(context.verified).toBe(false);
  });

  test('creates actor context with ELEMENT source', () => {
    const context = createActorContext('element-actor', ActorSource.ELEMENT);

    expect(context.actor).toBe('element-actor');
    expect(context.source).toBe(ActorSource.ELEMENT);
    expect(context.verified).toBe(false);
  });

  test('returns valid ActorContext', () => {
    const context = createActorContext('test-actor');
    expect(isActorContext(context)).toBe(true);
  });
});

describe('Phase 2: Soft Identity Integration', () => {
  test('complete soft identity flow: resolve and validate', async () => {
    // 1. Resolve actor from multiple sources (simulating CLI with --actor flag)
    const context = resolveActor({
      cliActor: 'alice',
      configActor: 'default-user',
    });

    expect(context.actor).toBe('alice');
    expect(context.source).toBe(ActorSource.CLI_FLAG);

    // 2. Validate the actor in soft mode
    const validation = await validateSoftActor(context.actor, {
      config: DEFAULT_IDENTITY_CONFIG,
    });

    expect(validation.valid).toBe(true);
    expect(validation.context?.actor).toBe('alice');
  });

  test('fallback chain: explicit -> CLI -> config -> element', async () => {
    // Test complete fallback chain
    const sources: ActorResolutionOptions[] = [
      { explicitActor: 'explicit' },
      { cliActor: 'cli' },
      { configActor: 'config' },
      { elementCreatedBy: 'element' },
    ];

    const expectedSources: ActorSource[] = [
      ActorSource.EXPLICIT,
      ActorSource.CLI_FLAG,
      ActorSource.CONFIG,
      ActorSource.ELEMENT,
    ];

    const expectedActors = ['explicit', 'cli', 'config', 'element'];

    for (let i = 0; i < sources.length; i++) {
      const context = resolveActor(sources[i]);
      expect(context.actor).toBe(expectedActors[i]);
      expect(context.source).toBe(expectedSources[i]);
    }
  });

  test('entity existence check with lookup function', async () => {
    // Simulate entity store
    const entityStore = new Map<string, { publicKey?: string }>([
      ['alice', { publicKey: undefined }],
      ['bob', { publicKey: VALID_PUBLIC_KEY }],
    ]);

    const lookupEntity = async (name: string) => entityStore.get(name) ?? null;

    // Config that requires registered actors
    const strictConfig = {
      mode: IdentityMode.SOFT as const,
      allowUnregisteredActors: false,
      timeTolerance: DEFAULT_TIME_TOLERANCE,
    };

    // Alice exists without public key
    const aliceResult = await validateSoftActor('alice', {
      lookupEntity,
      config: strictConfig,
    });
    expect(aliceResult.valid).toBe(true);
    expect(aliceResult.entityExists).toBe(true);

    // Bob exists with public key
    const bobResult = await validateSoftActor('bob', {
      lookupEntity,
      config: strictConfig,
    });
    expect(bobResult.valid).toBe(true);
    expect(bobResult.entityExists).toBe(true);

    // Charlie doesn't exist
    const charlieResult = await validateSoftActor('charlie', {
      lookupEntity,
      config: strictConfig,
    });
    expect(charlieResult.valid).toBe(false);
    expect(charlieResult.entityExists).toBe(false);
  });
});

// ============================================================================
// Verification Middleware Tests
// ============================================================================

describe('createVerificationMiddleware', () => {
  // Helper to create a lookup function for tests
  const createLookup = (entities: Record<string, { publicKey?: string }>) => {
    return async (actor: string) => entities[actor] ?? null;
  };

  describe('soft mode', () => {
    test('allows requests without signature', async () => {
      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({}),
        config: { mode: IdentityMode.SOFT },
      });

      const result = await middleware({});

      expect(result.allowed).toBe(true);
      expect(result.context.verified).toBe(false);
      expect(result.context.mode).toBe(IdentityMode.SOFT);
    });

    test('extracts actor from signed request', async () => {
      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({}),
        config: { mode: IdentityMode.SOFT },
      });

      const result = await middleware({
        signedRequest: {
          actor: 'alice',
          signature: VALID_SIGNATURE,
          signedAt: VALID_TIMESTAMP,
        },
      });

      expect(result.allowed).toBe(true);
      expect(result.context.actor).toBe('alice');
      expect(result.context.verified).toBe(false);
    });
  });

  describe('cryptographic mode', () => {
    test('rejects requests without signature', async () => {
      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({}),
        config: { mode: IdentityMode.CRYPTOGRAPHIC },
      });

      const result = await middleware({});

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Signature required');
      expect(result.context.mode).toBe(IdentityMode.CRYPTOGRAPHIC);
    });

    test('rejects requests with invalid signature', async () => {
      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({
          alice: { publicKey: testKeypair.publicKey },
        }),
        config: { mode: IdentityMode.CRYPTOGRAPHIC },
      });

      const result = await middleware({
        signedRequest: {
          actor: 'alice',
          signature: VALID_SIGNATURE, // Wrong signature
          signedAt: new Date().toISOString() as Timestamp,
        },
        body: 'test body',
      });

      expect(result.allowed).toBe(false);
      expect(result.context.verified).toBe(false);
    });

    test('allows requests with valid signature', async () => {
      const now = new Date();
      const timestamp = now.toISOString() as Timestamp;
      const body = { action: 'test' };
      const requestHash = await hashRequestBody(body);

      const signedData = constructSignedData({
        actor: 'alice',
        signedAt: timestamp,
        requestHash,
      });

      const signature = await signEd25519(testKeypair.privateKey, signedData);

      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({
          alice: { publicKey: testKeypair.publicKey },
        }),
        config: { mode: IdentityMode.CRYPTOGRAPHIC },
        now,
      });

      const result = await middleware({
        signedRequest: {
          actor: 'alice',
          signature,
          signedAt: timestamp,
        },
        body,
      });

      expect(result.allowed).toBe(true);
      expect(result.context.verified).toBe(true);
      expect(result.context.actor).toBe('alice');
    });
  });

  describe('hybrid mode', () => {
    test('allows requests without signature', async () => {
      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({}),
        config: { mode: IdentityMode.HYBRID },
      });

      const result = await middleware({});

      expect(result.allowed).toBe(true);
      expect(result.context.verified).toBe(false);
      expect(result.context.mode).toBe(IdentityMode.HYBRID);
    });

    test('allows requests with valid signature', async () => {
      const now = new Date();
      const timestamp = now.toISOString() as Timestamp;
      const body = { action: 'test' };
      const requestHash = await hashRequestBody(body);

      const signedData = constructSignedData({
        actor: 'alice',
        signedAt: timestamp,
        requestHash,
      });

      const signature = await signEd25519(testKeypair.privateKey, signedData);

      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({
          alice: { publicKey: testKeypair.publicKey },
        }),
        config: { mode: IdentityMode.HYBRID },
        now,
      });

      const result = await middleware({
        signedRequest: {
          actor: 'alice',
          signature,
          signedAt: timestamp,
        },
        body,
      });

      expect(result.allowed).toBe(true);
      expect(result.context.verified).toBe(true);
      expect(result.context.actor).toBe('alice');
    });

    test('rejects requests with invalid signature', async () => {
      const middleware = createVerificationMiddleware({
        lookupEntity: createLookup({
          alice: { publicKey: testKeypair.publicKey },
        }),
        config: { mode: IdentityMode.HYBRID },
      });

      const result = await middleware({
        signedRequest: {
          actor: 'alice',
          signature: VALID_SIGNATURE, // Wrong signature
          signedAt: new Date().toISOString() as Timestamp,
        },
        body: 'test',
      });

      expect(result.allowed).toBe(false);
      expect(result.context.verified).toBe(false);
    });
  });
});

describe('createSoftModeContext', () => {
  test('creates context without actor', () => {
    const context = createSoftModeContext();

    expect(context.verified).toBe(false);
    expect(context.mode).toBe(IdentityMode.SOFT);
    expect(context.actor).toBeUndefined();
  });

  test('creates context with actor', () => {
    const context = createSoftModeContext('alice');

    expect(context.verified).toBe(false);
    expect(context.mode).toBe(IdentityMode.SOFT);
    expect(context.actor).toBe('alice');
  });
});

describe('createVerifiedContext', () => {
  test('creates verified context', () => {
    const verificationResult = verificationSuccess('alice', 1000);
    const context = createVerifiedContext('alice', verificationResult);

    expect(context.verified).toBe(true);
    expect(context.mode).toBe(IdentityMode.CRYPTOGRAPHIC);
    expect(context.actor).toBe('alice');
    expect(context.verificationResult).toBe(verificationResult);
  });
});
