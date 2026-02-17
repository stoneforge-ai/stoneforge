import { describe, expect, test } from 'bun:test';
import {
  EntityTypeValue,
  MAX_NAME_LENGTH,
  RESERVED_NAMES,
  Entity,
  isValidEntityType,
  validateEntityType,
  isReservedName,
  isValidEntityName,
  validateEntityName,
  isValidPublicKey,
  validatePublicKey,
  isEntity,
  validateEntity,
  createEntity,
  CreateEntityInput,
  updateEntity,
  UpdateEntityInput,
  deactivateEntity,
  reactivateEntity,
  isEntityActive,
  isEntityDeactivated,
  getDeactivationDetails,
  filterActiveEntities,
  filterDeactivatedEntities,
  hasCryptographicIdentity,
  getEntityDisplayName,
  entitiesHaveSameName,
  filterByEntityType,
  filterByCreator,
  filterWithPublicKey,
  filterWithoutPublicKey,
  filterByTag,
  filterByAnyTag,
  filterByAllTags,
  sortByName,
  sortByCreationDate,
  sortByUpdateDate,
  sortByEntityType,
  groupByEntityType,
  groupByCreator,
  searchByName,
  findByName,
  findById,
  isNameUnique,
  getUniqueTags,
  countByEntityType,
  // Management hierarchy functions
  detectReportingCycle,
  validateManager,
  getManagementChain,
  getDirectReports,
  buildOrgChart,
  hasDirectReports,
  countDirectReports,
  getAllReports,
  getRootManager,
  isManagerOf,
  getRootEntities,
  getEntitiesWithManager,
  MAX_REPORTING_CHAIN_DEPTH,
} from './entity.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid entity for testing
function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.ENTITY,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    name: 'test-entity',
    entityType: EntityTypeValue.AGENT,
    ...overrides,
  };
}

// Valid base64-encoded Ed25519 public key (44 characters with = padding)
const VALID_PUBLIC_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const INVALID_PUBLIC_KEY_SHORT = 'AAAA';
const INVALID_PUBLIC_KEY_NO_PADDING = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('EntityTypeValue', () => {
  test('contains all expected types', () => {
    expect(EntityTypeValue.AGENT).toBe('agent');
    expect(EntityTypeValue.HUMAN).toBe('human');
    expect(EntityTypeValue.SYSTEM).toBe('system');
  });

  test('has exactly 3 types', () => {
    expect(Object.keys(EntityTypeValue)).toHaveLength(3);
  });
});

describe('isValidEntityType', () => {
  test('accepts all valid entity types', () => {
    expect(isValidEntityType('agent')).toBe(true);
    expect(isValidEntityType('human')).toBe(true);
    expect(isValidEntityType('system')).toBe(true);
  });

  test('rejects invalid types', () => {
    expect(isValidEntityType('invalid')).toBe(false);
    expect(isValidEntityType('task')).toBe(false);
    expect(isValidEntityType(null)).toBe(false);
    expect(isValidEntityType(undefined)).toBe(false);
    expect(isValidEntityType(123)).toBe(false);
    expect(isValidEntityType({})).toBe(false);
  });
});

describe('validateEntityType', () => {
  test('returns valid entity type', () => {
    expect(validateEntityType('agent')).toBe('agent');
    expect(validateEntityType('human')).toBe('human');
    expect(validateEntityType('system')).toBe('system');
  });

  test('throws ValidationError for invalid type', () => {
    expect(() => validateEntityType('invalid')).toThrow(ValidationError);
    try {
      validateEntityType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('entityType');
    }
  });
});

describe('RESERVED_NAMES', () => {
  test('contains expected reserved names', () => {
    expect(RESERVED_NAMES).toContain('system');
    expect(RESERVED_NAMES).toContain('anonymous');
    expect(RESERVED_NAMES).toContain('unknown');
  });

  test('has exactly 3 reserved names', () => {
    expect(RESERVED_NAMES).toHaveLength(3);
  });
});

describe('isReservedName', () => {
  test('identifies reserved names (case-insensitive)', () => {
    expect(isReservedName('system')).toBe(true);
    expect(isReservedName('anonymous')).toBe(true);
    expect(isReservedName('unknown')).toBe(true);
    expect(isReservedName('System')).toBe(true);
    expect(isReservedName('SYSTEM')).toBe(true);
  });

  test('returns false for non-reserved names', () => {
    expect(isReservedName('alice')).toBe(false);
    expect(isReservedName('agent-1')).toBe(false);
    expect(isReservedName('my-system')).toBe(false);
  });
});

describe('isValidEntityName', () => {
  test('accepts valid names', () => {
    expect(isValidEntityName('alice')).toBe(true);
    expect(isValidEntityName('agent-1')).toBe(true);
    expect(isValidEntityName('Claude3Opus')).toBe(true);
    expect(isValidEntityName('human_bob')).toBe(true);
    expect(isValidEntityName('ci-pipeline-1')).toBe(true);
    expect(isValidEntityName('a')).toBe(true); // Single character
  });

  test('rejects non-string values', () => {
    expect(isValidEntityName(null)).toBe(false);
    expect(isValidEntityName(undefined)).toBe(false);
    expect(isValidEntityName(123)).toBe(false);
    expect(isValidEntityName({})).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidEntityName('')).toBe(false);
  });

  test('rejects names exceeding max length', () => {
    const longName = 'a' + 'b'.repeat(MAX_NAME_LENGTH);
    expect(isValidEntityName(longName)).toBe(false);
    expect(isValidEntityName('a' + 'b'.repeat(MAX_NAME_LENGTH - 1))).toBe(true);
  });

  test('rejects names not starting with letter', () => {
    expect(isValidEntityName('_underscore')).toBe(false);
    expect(isValidEntityName('-hyphen')).toBe(false);
    expect(isValidEntityName('1number')).toBe(false);
  });

  test('rejects names with invalid characters', () => {
    expect(isValidEntityName('has spaces')).toBe(false);
    expect(isValidEntityName('has@symbol')).toBe(false);
    expect(isValidEntityName('has.dot')).toBe(false);
    expect(isValidEntityName('has/slash')).toBe(false);
    expect(isValidEntityName('has#hash')).toBe(false);
  });

  test('rejects reserved names', () => {
    expect(isValidEntityName('system')).toBe(false);
    expect(isValidEntityName('anonymous')).toBe(false);
    expect(isValidEntityName('unknown')).toBe(false);
  });
});

describe('validateEntityName', () => {
  test('returns valid name', () => {
    expect(validateEntityName('alice')).toBe('alice');
    expect(validateEntityName('agent-1')).toBe('agent-1');
  });

  test('throws for non-string', () => {
    expect(() => validateEntityName(123)).toThrow(ValidationError);
    try {
      validateEntityName(123);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('name');
    }
  });

  test('throws for empty name', () => {
    expect(() => validateEntityName('')).toThrow(ValidationError);
    try {
      validateEntityName('');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });

  test('throws for name exceeding max length', () => {
    const longName = 'a' + 'b'.repeat(MAX_NAME_LENGTH);
    expect(() => validateEntityName(longName)).toThrow(ValidationError);
    try {
      validateEntityName(longName);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.actual).toBe(longName.length);
    }
  });

  test('throws for name not starting with letter', () => {
    expect(() => validateEntityName('_underscore')).toThrow(ValidationError);
    try {
      validateEntityName('_underscore');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('must start with a letter');
    }
  });

  test('throws for name with invalid characters', () => {
    expect(() => validateEntityName('has spaces')).toThrow(ValidationError);
    try {
      validateEntityName('has@symbol');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('invalid characters');
    }
  });

  test('throws for reserved names', () => {
    expect(() => validateEntityName('system')).toThrow(ValidationError);
    try {
      validateEntityName('system');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('reserved');
    }
  });
});

describe('isValidPublicKey', () => {
  test('accepts valid Ed25519 public key', () => {
    expect(isValidPublicKey(VALID_PUBLIC_KEY)).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(isValidPublicKey(null)).toBe(false);
    expect(isValidPublicKey(undefined)).toBe(false);
    expect(isValidPublicKey(123)).toBe(false);
    expect(isValidPublicKey({})).toBe(false);
  });

  test('rejects keys with wrong length', () => {
    expect(isValidPublicKey(INVALID_PUBLIC_KEY_SHORT)).toBe(false);
    expect(isValidPublicKey(INVALID_PUBLIC_KEY_NO_PADDING)).toBe(false);
  });

  test('rejects keys with invalid base64 characters', () => {
    expect(isValidPublicKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA!=')).toBe(false);
  });
});

describe('validatePublicKey', () => {
  test('returns valid public key', () => {
    expect(validatePublicKey(VALID_PUBLIC_KEY)).toBe(VALID_PUBLIC_KEY);
  });

  test('throws for non-string', () => {
    expect(() => validatePublicKey(123)).toThrow(ValidationError);
    try {
      validatePublicKey(123);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('publicKey');
    }
  });

  test('throws for invalid format', () => {
    expect(() => validatePublicKey(INVALID_PUBLIC_KEY_SHORT)).toThrow(ValidationError);
    try {
      validatePublicKey(INVALID_PUBLIC_KEY_SHORT);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('Invalid public key format');
    }
  });
});

describe('isEntity', () => {
  test('accepts valid entity', () => {
    expect(isEntity(createTestEntity())).toBe(true);
  });

  test('accepts entity with public key', () => {
    expect(isEntity(createTestEntity({ publicKey: VALID_PUBLIC_KEY }))).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isEntity(null)).toBe(false);
    expect(isEntity(undefined)).toBe(false);
    expect(isEntity('string')).toBe(false);
    expect(isEntity(123)).toBe(false);
  });

  test('rejects entities with missing fields', () => {
    expect(isEntity({ ...createTestEntity(), id: undefined })).toBe(false);
    expect(isEntity({ ...createTestEntity(), type: undefined })).toBe(false);
    expect(isEntity({ ...createTestEntity(), name: undefined })).toBe(false);
    expect(isEntity({ ...createTestEntity(), entityType: undefined })).toBe(false);
  });

  test('rejects entities with wrong type', () => {
    expect(isEntity({ ...createTestEntity(), type: 'task' })).toBe(false);
  });

  test('rejects entities with invalid name', () => {
    expect(isEntity({ ...createTestEntity(), name: '_invalid' })).toBe(false);
    expect(isEntity({ ...createTestEntity(), name: 'system' })).toBe(false);
  });

  test('rejects entities with invalid entityType', () => {
    expect(isEntity({ ...createTestEntity(), entityType: 'invalid' })).toBe(false);
  });

  test('rejects entities with invalid public key', () => {
    expect(isEntity({ ...createTestEntity(), publicKey: INVALID_PUBLIC_KEY_SHORT })).toBe(false);
  });
});

describe('validateEntity', () => {
  test('returns valid entity', () => {
    const entity = createTestEntity();
    expect(validateEntity(entity)).toEqual(entity);
  });

  test('throws for non-object', () => {
    expect(() => validateEntity(null)).toThrow(ValidationError);
    expect(() => validateEntity('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateEntity({ ...createTestEntity(), id: '' })).toThrow(ValidationError);
    expect(() => validateEntity({ ...createTestEntity(), createdBy: '' })).toThrow(ValidationError);

    try {
      validateEntity({ ...createTestEntity(), name: 123 });
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  test('throws for wrong type value', () => {
    try {
      validateEntity({ ...createTestEntity(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('entity');
    }
  });

  test('validates entity-specific fields', () => {
    expect(() => validateEntity({ ...createTestEntity(), name: '_invalid' })).toThrow(ValidationError);
    expect(() => validateEntity({ ...createTestEntity(), entityType: 'invalid' })).toThrow(ValidationError);
    expect(() => validateEntity({ ...createTestEntity(), publicKey: INVALID_PUBLIC_KEY_SHORT })).toThrow(ValidationError);
  });
});

describe('createEntity', () => {
  const validInput: CreateEntityInput = {
    name: 'test-agent',
    entityType: EntityTypeValue.AGENT,
    createdBy: 'el-system1' as EntityId,
  };

  test('creates entity with required fields', async () => {
    const entity = await createEntity(validInput);

    expect(entity.name).toBe('test-agent');
    expect(entity.entityType).toBe('agent');
    expect(entity.type).toBe(ElementType.ENTITY);
    expect(entity.createdBy).toBe('el-system1' as EntityId);
    expect(entity.tags).toEqual([]);
    expect(entity.metadata).toEqual({});
    expect(entity.id).toMatch(/^el-[0-9a-z]{3,8}$/);
    expect(entity.publicKey).toBeUndefined();
  });

  test('creates entity with optional fields', async () => {
    const entity = await createEntity({
      ...validInput,
      tags: ['ai', 'assistant'],
      metadata: { model: 'claude-3-opus' },
      publicKey: VALID_PUBLIC_KEY,
    });

    expect(entity.tags).toEqual(['ai', 'assistant']);
    expect(entity.metadata).toEqual({ model: 'claude-3-opus' });
    expect(entity.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('validates name', async () => {
    await expect(createEntity({ ...validInput, name: '_invalid' })).rejects.toThrow(ValidationError);
    await expect(createEntity({ ...validInput, name: 'system' })).rejects.toThrow(ValidationError);
  });

  test('validates entityType', async () => {
    await expect(createEntity({ ...validInput, entityType: 'invalid' as any })).rejects.toThrow(ValidationError);
  });

  test('validates publicKey if provided', async () => {
    await expect(createEntity({ ...validInput, publicKey: INVALID_PUBLIC_KEY_SHORT })).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs for different entities', async () => {
    const entity1 = await createEntity(validInput);
    const entity2 = await createEntity({ ...validInput, name: 'other-agent' });

    expect(entity1.id).not.toBe(entity2.id);
  });

  test('sets createdAt and updatedAt to current time', async () => {
    const before = new Date().toISOString();
    const entity = await createEntity(validInput);
    const after = new Date().toISOString();

    expect(entity.createdAt >= before).toBe(true);
    expect(entity.createdAt <= after).toBe(true);
    expect(entity.createdAt).toBe(entity.updatedAt);
  });
});

describe('updateEntity', () => {
  test('updates metadata by merging', () => {
    const entity = createTestEntity({
      metadata: { existing: 'value', toKeep: 123 }
    });

    const updated = updateEntity(entity, {
      metadata: { newField: 'added', existing: 'updated' }
    });

    expect(updated.metadata).toEqual({
      existing: 'updated',
      toKeep: 123,
      newField: 'added'
    });
  });

  test('updates tags by replacing', () => {
    const entity = createTestEntity({
      tags: ['old-tag', 'another-old']
    });

    const updated = updateEntity(entity, {
      tags: ['new-tag', 'fresh-tag']
    });

    expect(updated.tags).toEqual(['new-tag', 'fresh-tag']);
  });

  test('adds public key to entity without one', () => {
    const entity = createTestEntity();
    expect(entity.publicKey).toBeUndefined();

    const updated = updateEntity(entity, {
      publicKey: VALID_PUBLIC_KEY
    });

    expect(updated.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('updates public key on entity that has one', () => {
    const entity = createTestEntity({
      publicKey: VALID_PUBLIC_KEY
    });
    const newKey = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';

    const updated = updateEntity(entity, {
      publicKey: newKey
    });

    expect(updated.publicKey).toBe(newKey);
  });

  test('validates public key format', () => {
    const entity = createTestEntity();

    expect(() => updateEntity(entity, {
      publicKey: 'invalid-key'
    })).toThrow(ValidationError);
  });

  test('updates updatedAt timestamp', () => {
    const entity = createTestEntity({
      updatedAt: '2020-01-01T00:00:00.000Z' as any
    });
    const before = new Date().toISOString();

    const updated = updateEntity(entity, {
      metadata: { changed: true }
    });

    const after = new Date().toISOString();
    expect(updated.updatedAt >= before).toBe(true);
    expect(updated.updatedAt <= after).toBe(true);
  });

  test('preserves immutable fields', () => {
    const entity = createTestEntity({
      name: 'original-name',
      entityType: EntityTypeValue.AGENT,
      createdAt: '2020-01-01T00:00:00.000Z' as any,
      createdBy: 'el-original' as EntityId,
    });

    const updated = updateEntity(entity, {
      tags: ['new-tag'],
      metadata: { updated: true }
    });

    // Immutable fields should be preserved
    expect(updated.name).toBe('original-name');
    expect(updated.entityType).toBe(EntityTypeValue.AGENT);
    expect(updated.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(updated.createdBy).toBe('el-original' as EntityId);
    expect(updated.id).toBe(entity.id);
    expect(updated.type).toBe(ElementType.ENTITY);
  });

  test('preserves existing values when not updating', () => {
    const entity = createTestEntity({
      tags: ['keep-me'],
      metadata: { preserve: 'this' },
      publicKey: VALID_PUBLIC_KEY
    });

    // Update with empty input
    const updated = updateEntity(entity, {});

    expect(updated.tags).toEqual(['keep-me']);
    expect(updated.metadata).toEqual({ preserve: 'this' });
    expect(updated.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('can clear tags by setting to empty array', () => {
    const entity = createTestEntity({
      tags: ['tag1', 'tag2', 'tag3']
    });

    const updated = updateEntity(entity, {
      tags: []
    });

    expect(updated.tags).toEqual([]);
  });

  test('handles multiple updates at once', () => {
    const entity = createTestEntity({
      tags: ['old'],
      metadata: { old: 'data' }
    });

    const updated = updateEntity(entity, {
      tags: ['new-tag1', 'new-tag2'],
      metadata: { new: 'data', extra: 123 },
      publicKey: VALID_PUBLIC_KEY
    });

    expect(updated.tags).toEqual(['new-tag1', 'new-tag2']);
    expect(updated.metadata).toEqual({ old: 'data', new: 'data', extra: 123 });
    expect(updated.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('does not mutate original entity', () => {
    const entity = createTestEntity({
      tags: ['original'],
      metadata: { original: true }
    });
    const originalTags = [...entity.tags];
    const originalMetadata = { ...entity.metadata };

    updateEntity(entity, {
      tags: ['modified'],
      metadata: { modified: true }
    });

    // Original entity should be unchanged
    expect(entity.tags).toEqual(originalTags);
    expect(entity.metadata).toEqual(originalMetadata);
  });
});

// ============================================================================
// Key Rotation Tests
// ============================================================================

import {
  rotateEntityKey,
  constructKeyRotationMessage,
  validateKeyRotationInput,
  prepareKeyRotation,
  DEFAULT_MAX_SIGNATURE_AGE,
  type KeyRotationInput,
} from './entity.js';

const SECOND_VALID_PUBLIC_KEY = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';

describe('constructKeyRotationMessage', () => {
  test('constructs correct message format', () => {
    const message = constructKeyRotationMessage(
      'el-test123' as ElementId,
      SECOND_VALID_PUBLIC_KEY,
      '2024-01-15T12:00:00.000Z'
    );
    expect(message).toBe(`rotate-key:el-test123:${SECOND_VALID_PUBLIC_KEY}:2024-01-15T12:00:00.000Z`);
  });
});

describe('validateKeyRotationInput', () => {
  const validInput: KeyRotationInput = {
    newPublicKey: SECOND_VALID_PUBLIC_KEY,
    signature: 'dGVzdC1zaWduYXR1cmU=',
    signedAt: '2024-01-15T12:00:00.000Z',
  };

  test('validates correct input', () => {
    const result = validateKeyRotationInput(validInput);
    expect(result.newPublicKey).toBe(SECOND_VALID_PUBLIC_KEY);
    expect(result.signature).toBe('dGVzdC1zaWduYXR1cmU=');
    expect(result.signedAt).toBe('2024-01-15T12:00:00.000Z');
  });

  test('throws for non-object input', () => {
    expect(() => validateKeyRotationInput(null)).toThrow(ValidationError);
    expect(() => validateKeyRotationInput('string')).toThrow(ValidationError);
  });

  test('throws for missing newPublicKey', () => {
    expect(() => validateKeyRotationInput({ ...validInput, newPublicKey: undefined })).toThrow(ValidationError);
  });

  test('throws for invalid newPublicKey format', () => {
    expect(() => validateKeyRotationInput({ ...validInput, newPublicKey: 'invalid' })).toThrow(ValidationError);
  });

  test('throws for missing signature', () => {
    expect(() => validateKeyRotationInput({ ...validInput, signature: undefined })).toThrow(ValidationError);
    expect(() => validateKeyRotationInput({ ...validInput, signature: '' })).toThrow(ValidationError);
  });

  test('throws for missing signedAt', () => {
    expect(() => validateKeyRotationInput({ ...validInput, signedAt: undefined })).toThrow(ValidationError);
    expect(() => validateKeyRotationInput({ ...validInput, signedAt: '' })).toThrow(ValidationError);
  });

  test('throws for invalid timestamp format', () => {
    expect(() => validateKeyRotationInput({ ...validInput, signedAt: 'invalid-date' })).toThrow(ValidationError);
  });
});

describe('prepareKeyRotation', () => {
  test('returns message and timestamp', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = prepareKeyRotation(entity, SECOND_VALID_PUBLIC_KEY);

    expect(result.message).toContain('rotate-key:');
    expect(result.message).toContain(entity.id);
    expect(result.message).toContain(SECOND_VALID_PUBLIC_KEY);
    expect(result.timestamp).toBeDefined();
    expect(() => new Date(result.timestamp)).not.toThrow();
  });
});

describe('rotateEntityKey', () => {
  // Mock signature verifier
  const createMockVerifier = (shouldPass: boolean) => {
    return async (_message: string, _signature: string, _publicKey: string): Promise<boolean> => {
      return shouldPass;
    };
  };

  const validRotationInput: KeyRotationInput = {
    newPublicKey: SECOND_VALID_PUBLIC_KEY,
    signature: 'dGVzdC1zaWduYXR1cmU=',
    signedAt: new Date().toISOString(),
  };

  test('fails when entity has no public key', async () => {
    const entity = createTestEntity(); // No public key
    const result = await rotateEntityKey(entity, validRotationInput, createMockVerifier(true));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NO_CURRENT_KEY');
  });

  test('fails when new public key is invalid', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await rotateEntityKey(
      entity,
      { ...validRotationInput, newPublicKey: 'invalid' },
      createMockVerifier(true)
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_NEW_KEY');
  });

  test('fails when signature is expired', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const oldTimestamp = new Date(Date.now() - DEFAULT_MAX_SIGNATURE_AGE - 60000).toISOString();
    const result = await rotateEntityKey(
      entity,
      { ...validRotationInput, signedAt: oldTimestamp },
      createMockVerifier(true),
      { maxSignatureAge: DEFAULT_MAX_SIGNATURE_AGE }
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SIGNATURE_EXPIRED');
  });

  test('fails when signature timestamp is in future', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const futureTimestamp = new Date(Date.now() + 120000).toISOString(); // 2 minutes in future
    const result = await rotateEntityKey(
      entity,
      { ...validRotationInput, signedAt: futureTimestamp },
      createMockVerifier(true)
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
  });

  test('fails when signature verification fails', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await rotateEntityKey(
      entity,
      validRotationInput,
      createMockVerifier(false),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
  });

  test('fails when verifier throws', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const throwingVerifier = async () => { throw new Error('Crypto error'); };
    const result = await rotateEntityKey(
      entity,
      validRotationInput,
      throwingVerifier,
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
    expect(result.error).toContain('Crypto error');
  });

  test('succeeds with valid signature', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await rotateEntityKey(
      entity,
      validRotationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(true);
    expect(result.entity).toBeDefined();
    expect(result.entity?.publicKey).toBe(SECOND_VALID_PUBLIC_KEY);
  });

  test('records rotation metadata', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await rotateEntityKey(
      entity,
      validRotationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(true);
    expect(result.entity?.metadata.keyRotatedAt).toBeDefined();
    expect(result.entity?.metadata.previousKeyHash).toBeDefined();
    expect(result.entity?.metadata.previousKeyHash).toContain('...');
  });

  test('updates updatedAt timestamp', async () => {
    const entity = createTestEntity({
      publicKey: VALID_PUBLIC_KEY,
      updatedAt: '2020-01-01T00:00:00.000Z' as any,
    });
    const before = new Date().toISOString();

    const result = await rotateEntityKey(
      entity,
      validRotationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    const after = new Date().toISOString();
    expect(result.entity?.updatedAt >= before).toBe(true);
    expect(result.entity?.updatedAt <= after).toBe(true);
  });

  test('preserves existing metadata', async () => {
    const entity = createTestEntity({
      publicKey: VALID_PUBLIC_KEY,
      metadata: { customField: 'preserved', existing: true },
    });

    const result = await rotateEntityKey(
      entity,
      validRotationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.entity?.metadata.customField).toBe('preserved');
    expect(result.entity?.metadata.existing).toBe(true);
    expect(result.entity?.metadata.keyRotatedAt).toBeDefined();
  });

  test('respects custom maxSignatureAge', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const recentTimestamp = new Date(Date.now() - 1000).toISOString(); // 1 second ago

    const result = await rotateEntityKey(
      entity,
      { ...validRotationInput, signedAt: recentTimestamp },
      createMockVerifier(true),
      { maxSignatureAge: 500 } // 500ms - signature should be expired
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SIGNATURE_EXPIRED');
  });
});

describe('hasCryptographicIdentity', () => {
  test('returns true for entity with public key', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    expect(hasCryptographicIdentity(entity)).toBe(true);
  });

  test('returns false for entity without public key', () => {
    const entity = createTestEntity();
    expect(hasCryptographicIdentity(entity)).toBe(false);
  });
});

describe('getEntityDisplayName', () => {
  test('returns displayName from metadata if available', () => {
    const entity = createTestEntity({
      name: 'agent-1',
      metadata: { displayName: 'Agent One' }
    });
    expect(getEntityDisplayName(entity)).toBe('Agent One');
  });

  test('returns name if no displayName in metadata', () => {
    const entity = createTestEntity({ name: 'agent-1' });
    expect(getEntityDisplayName(entity)).toBe('agent-1');
  });

  test('returns name if displayName is not a string', () => {
    const entity = createTestEntity({
      name: 'agent-1',
      metadata: { displayName: 123 }
    });
    expect(getEntityDisplayName(entity)).toBe('agent-1');
  });
});

describe('entitiesHaveSameName', () => {
  test('returns true for entities with same name', () => {
    const entity1 = createTestEntity({ id: 'el-1' as ElementId, name: 'alice' });
    const entity2 = createTestEntity({ id: 'el-2' as ElementId, name: 'alice' });
    expect(entitiesHaveSameName(entity1, entity2)).toBe(true);
  });

  test('returns false for entities with different names', () => {
    const entity1 = createTestEntity({ name: 'alice' });
    const entity2 = createTestEntity({ name: 'bob' });
    expect(entitiesHaveSameName(entity1, entity2)).toBe(false);
  });
});

describe('filterByEntityType', () => {
  test('filters entities by type', () => {
    const entities: Entity[] = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'agent-1', entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'human-1', entityType: EntityTypeValue.HUMAN }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'agent-2', entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-4' as ElementId, name: 'system-1', entityType: EntityTypeValue.SYSTEM }),
    ];

    const agents = filterByEntityType(entities, EntityTypeValue.AGENT);
    expect(agents).toHaveLength(2);
    expect(agents.map(e => e.name)).toEqual(['agent-1', 'agent-2']);

    const humans = filterByEntityType(entities, EntityTypeValue.HUMAN);
    expect(humans).toHaveLength(1);
    expect(humans[0].name).toBe('human-1');

    const systems = filterByEntityType(entities, EntityTypeValue.SYSTEM);
    expect(systems).toHaveLength(1);
    expect(systems[0].name).toBe('system-1');
  });

  test('returns empty array when no matches', () => {
    const entities: Entity[] = [
      createTestEntity({ name: 'agent-1', entityType: EntityTypeValue.AGENT }),
    ];

    const humans = filterByEntityType(entities, EntityTypeValue.HUMAN);
    expect(humans).toHaveLength(0);
  });

  test('handles empty input', () => {
    expect(filterByEntityType([], EntityTypeValue.AGENT)).toEqual([]);
  });
});

// Edge cases and property-based tests
describe('Edge cases', () => {
  test('handles maximum valid name length', () => {
    const maxName = 'a' + 'b'.repeat(MAX_NAME_LENGTH - 1);
    expect(isValidEntityName(maxName)).toBe(true);
    expect(validateEntityName(maxName)).toBe(maxName);
  });

  test('handles minimum valid name length', () => {
    expect(isValidEntityName('a')).toBe(true);
    expect(validateEntityName('a')).toBe('a');
  });

  test('name validation is case-sensitive', () => {
    // Different cases should be allowed (names are case-sensitive)
    expect(isValidEntityName('Alice')).toBe(true);
    expect(isValidEntityName('ALICE')).toBe(true);
    expect(isValidEntityName('alice')).toBe(true);
  });

  test('reserved name check is case-insensitive', () => {
    expect(isReservedName('System')).toBe(true);
    expect(isReservedName('SYSTEM')).toBe(true);
    expect(isReservedName('SyStEm')).toBe(true);
  });

  test('entity type is preserved through validation', () => {
    const entity = createTestEntity({ entityType: EntityTypeValue.HUMAN });
    const validated = validateEntity(entity);
    expect(validated.entityType).toBe(EntityTypeValue.HUMAN);
  });

  test('public key with different valid base64 characters', () => {
    // Uses +, /, and various chars (must be exactly 44 characters including =)
    const validKey = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef+/123456789=';
    expect(isValidPublicKey(validKey)).toBe(true);
  });

  test('name with all valid character types', () => {
    // Starts with letter, contains numbers, hyphens, underscores
    const name = 'Agent123_test-entity';
    expect(isValidEntityName(name)).toBe(true);
  });
});

// Property-based test: any valid name should validate without throwing
describe('Property-based tests', () => {
  const validCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  const startCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function generateValidName(length: number): string {
    if (length < 1) length = 1;
    if (length > MAX_NAME_LENGTH) length = MAX_NAME_LENGTH;

    let name = startCharacters[Math.floor(Math.random() * startCharacters.length)];
    for (let i = 1; i < length; i++) {
      name += validCharacters[Math.floor(Math.random() * validCharacters.length)];
    }

    // Ensure not reserved
    if (RESERVED_NAMES.includes(name.toLowerCase() as any)) {
      name = name + '1';
    }

    return name;
  }

  test('randomly generated valid names pass validation', () => {
    for (let i = 0; i < 100; i++) {
      const length = Math.floor(Math.random() * MAX_NAME_LENGTH) + 1;
      const name = generateValidName(length);

      expect(isValidEntityName(name)).toBe(true);
      expect(() => validateEntityName(name)).not.toThrow();
    }
  });

  test('all entity types create valid entities', async () => {
    for (const entityType of Object.values(EntityTypeValue)) {
      const entity = await createEntity({
        name: `test-${entityType}`,
        entityType,
        createdBy: 'el-system1' as EntityId,
      });

      expect(isEntity(entity)).toBe(true);
      expect(entity.entityType).toBe(entityType);
    }
  });
});

describe('Edge cases - name validation errors', () => {
  test('validates name with exactly max length characters', async () => {
    const maxName = 'a' + 'b'.repeat(MAX_NAME_LENGTH - 1);
    const entity = await createEntity({
      name: maxName,
      entityType: EntityTypeValue.AGENT,
      createdBy: 'el-system1' as EntityId,
    });
    expect(entity.name).toBe(maxName);
  });
});

// ============================================================================
// Entity Deactivation Tests
// ============================================================================

describe('deactivateEntity', () => {
  test('sets metadata.active to false', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.active).toBe(false);
  });

  test('sets deactivatedAt timestamp', () => {
    const entity = createTestEntity();
    const before = new Date().toISOString();

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    const after = new Date().toISOString();
    expect(deactivated.metadata.deactivatedAt as string >= before).toBe(true);
    expect(deactivated.metadata.deactivatedAt as string <= after).toBe(true);
  });

  test('sets deactivatedBy reference', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.deactivatedBy).toBe('el-admin');
  });

  test('sets deactivationReason when provided', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
      reason: 'User left the organization',
    });

    expect(deactivated.metadata.deactivationReason).toBe('User left the organization');
  });

  test('does not set deactivationReason when not provided', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.deactivationReason).toBeUndefined();
  });

  test('preserves existing metadata', () => {
    const entity = createTestEntity({
      metadata: { displayName: 'Test User', customField: 'value' },
    });

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.displayName).toBe('Test User');
    expect(deactivated.metadata.customField).toBe('value');
  });

  test('updates updatedAt timestamp', () => {
    const entity = createTestEntity({
      updatedAt: '2020-01-01T00:00:00.000Z' as any,
    });
    const before = new Date().toISOString();

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    const after = new Date().toISOString();
    expect(deactivated.updatedAt >= before).toBe(true);
    expect(deactivated.updatedAt <= after).toBe(true);
  });

  test('preserves immutable fields', () => {
    const entity = createTestEntity({
      name: 'original-name',
      entityType: EntityTypeValue.HUMAN,
    });

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.name).toBe('original-name');
    expect(deactivated.entityType).toBe(EntityTypeValue.HUMAN);
    expect(deactivated.id).toBe(entity.id);
  });
});

describe('reactivateEntity', () => {
  test('sets metadata.active to true', () => {
    const deactivated = createTestEntity({
      metadata: { active: false, deactivatedAt: '2020-01-01T00:00:00.000Z' },
    });

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    expect(reactivated.metadata.active).toBe(true);
  });

  test('removes deactivation metadata', () => {
    const deactivated = createTestEntity({
      metadata: {
        active: false,
        deactivatedAt: '2020-01-01T00:00:00.000Z',
        deactivatedBy: 'el-old-admin',
        deactivationReason: 'Old reason',
      },
    });

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    expect(reactivated.metadata.deactivatedAt).toBeUndefined();
    expect(reactivated.metadata.deactivatedBy).toBeUndefined();
    expect(reactivated.metadata.deactivationReason).toBeUndefined();
  });

  test('sets reactivatedAt and reactivatedBy', () => {
    const deactivated = createTestEntity({
      metadata: { active: false },
    });
    const before = new Date().toISOString();

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    const after = new Date().toISOString();
    expect(reactivated.metadata.reactivatedAt as string >= before).toBe(true);
    expect(reactivated.metadata.reactivatedAt as string <= after).toBe(true);
    expect(reactivated.metadata.reactivatedBy).toBe('el-admin');
  });

  test('preserves other metadata', () => {
    const deactivated = createTestEntity({
      metadata: {
        active: false,
        displayName: 'Test User',
        customField: 'value',
      },
    });

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    expect(reactivated.metadata.displayName).toBe('Test User');
    expect(reactivated.metadata.customField).toBe('value');
  });
});

describe('isEntityActive', () => {
  test('returns true for entity with no active flag', () => {
    const entity = createTestEntity();
    expect(isEntityActive(entity)).toBe(true);
  });

  test('returns true for entity with active: true', () => {
    const entity = createTestEntity({
      metadata: { active: true },
    });
    expect(isEntityActive(entity)).toBe(true);
  });

  test('returns false for entity with active: false', () => {
    const entity = createTestEntity({
      metadata: { active: false },
    });
    expect(isEntityActive(entity)).toBe(false);
  });
});

describe('isEntityDeactivated', () => {
  test('returns false for active entity', () => {
    const entity = createTestEntity();
    expect(isEntityDeactivated(entity)).toBe(false);
  });

  test('returns true for deactivated entity', () => {
    const entity = createTestEntity({
      metadata: { active: false },
    });
    expect(isEntityDeactivated(entity)).toBe(true);
  });
});

describe('getDeactivationDetails', () => {
  test('returns null for active entity', () => {
    const entity = createTestEntity();
    expect(getDeactivationDetails(entity)).toBeNull();
  });

  test('returns details for deactivated entity', () => {
    const entity = createTestEntity({
      metadata: {
        active: false,
        deactivatedAt: '2020-01-01T00:00:00.000Z',
        deactivatedBy: 'el-admin',
        deactivationReason: 'Test reason',
      },
    });

    const details = getDeactivationDetails(entity);
    expect(details).not.toBeNull();
    expect(details!.deactivatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(details!.deactivatedBy).toBe('el-admin');
    expect(details!.reason).toBe('Test reason');
  });

  test('returns partial details when not all fields present', () => {
    const entity = createTestEntity({
      metadata: {
        active: false,
        deactivatedAt: '2020-01-01T00:00:00.000Z',
      },
    });

    const details = getDeactivationDetails(entity);
    expect(details).not.toBeNull();
    expect(details!.deactivatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(details!.deactivatedBy).toBeUndefined();
    expect(details!.reason).toBeUndefined();
  });
});

describe('filterActiveEntities', () => {
  test('returns only active entities', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'inactive-1', metadata: { active: false } }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'active-2' }),
      createTestEntity({ id: 'el-4' as ElementId, name: 'inactive-2', metadata: { active: false } }),
    ];

    const active = filterActiveEntities(entities);
    expect(active).toHaveLength(2);
    expect(active.map((e) => e.name)).toEqual(['active-1', 'active-2']);
  });

  test('returns all when none deactivated', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'active-2' }),
    ];

    const active = filterActiveEntities(entities);
    expect(active).toHaveLength(2);
  });

  test('returns empty when all deactivated', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'inactive-1', metadata: { active: false } }),
    ];

    const active = filterActiveEntities(entities);
    expect(active).toHaveLength(0);
  });
});

describe('filterDeactivatedEntities', () => {
  test('returns only deactivated entities', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'inactive-1', metadata: { active: false } }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'active-2' }),
    ];

    const deactivated = filterDeactivatedEntities(entities);
    expect(deactivated).toHaveLength(1);
    expect(deactivated[0].name).toBe('inactive-1');
  });

  test('returns empty when none deactivated', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
    ];

    const deactivated = filterDeactivatedEntities(entities);
    expect(deactivated).toHaveLength(0);
  });
});

// ============================================================================
// Search and Filter Tests
// ============================================================================

describe('filterByCreator', () => {
  test('filters entities by creator', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdBy: 'el-admin' as EntityId }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdBy: 'el-user' as EntityId }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', createdBy: 'el-admin' as EntityId }),
    ];

    const filtered = filterByCreator(entities, 'el-admin' as EntityId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e3']);
  });

  test('returns empty when no matches', () => {
    const entities = [createTestEntity({ createdBy: 'el-user' as EntityId })];
    expect(filterByCreator(entities, 'el-admin' as EntityId)).toHaveLength(0);
  });
});

describe('filterWithPublicKey', () => {
  test('filters entities with public keys', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'with-key', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'no-key' }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'also-with-key', publicKey: VALID_PUBLIC_KEY }),
    ];

    const filtered = filterWithPublicKey(entities);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['with-key', 'also-with-key']);
  });
});

describe('filterWithoutPublicKey', () => {
  test('filters entities without public keys', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'with-key', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'no-key' }),
    ];

    const filtered = filterWithoutPublicKey(entities);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('no-key');
  });
});

describe('filterByTag', () => {
  test('filters entities by tag', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', tags: ['frontend', 'team-a'] }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', tags: ['backend'] }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', tags: ['frontend', 'team-b'] }),
    ];

    const filtered = filterByTag(entities, 'frontend');
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e3']);
  });
});

describe('filterByAnyTag', () => {
  test('filters entities by any of the tags', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', tags: ['frontend'] }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', tags: ['backend'] }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', tags: ['devops'] }),
    ];

    const filtered = filterByAnyTag(entities, ['frontend', 'backend']);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e2']);
  });
});

describe('filterByAllTags', () => {
  test('filters entities with all specified tags', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', tags: ['frontend', 'senior'] }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', tags: ['frontend'] }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', tags: ['frontend', 'senior', 'lead'] }),
    ];

    const filtered = filterByAllTags(entities, ['frontend', 'senior']);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e3']);
  });
});

// ============================================================================
// Sort Tests
// ============================================================================

describe('sortByName', () => {
  test('sorts entities by name ascending', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'charlie' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'bob' }),
    ];

    const sorted = sortByName(entities, true);
    expect(sorted.map((e) => e.name)).toEqual(['alice', 'bob', 'charlie']);
  });

  test('sorts entities by name descending', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'charlie' }),
    ];

    const sorted = sortByName(entities, false);
    expect(sorted.map((e) => e.name)).toEqual(['charlie', 'alice']);
  });

  test('does not mutate original array', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'bob' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'alice' }),
    ];

    sortByName(entities, true);
    expect(entities[0].name).toBe('bob');
  });
});

describe('sortByCreationDate', () => {
  test('sorts entities by creation date descending by default', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdAt: '2020-01-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdAt: '2020-03-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', createdAt: '2020-02-01T00:00:00.000Z' as any }),
    ];

    const sorted = sortByCreationDate(entities);
    expect(sorted.map((e) => e.name)).toEqual(['e2', 'e3', 'e1']);
  });

  test('sorts entities by creation date ascending', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdAt: '2020-03-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdAt: '2020-01-01T00:00:00.000Z' as any }),
    ];

    const sorted = sortByCreationDate(entities, true);
    expect(sorted.map((e) => e.name)).toEqual(['e2', 'e1']);
  });
});

describe('sortByUpdateDate', () => {
  test('sorts entities by update date descending by default', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', updatedAt: '2020-01-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', updatedAt: '2020-02-01T00:00:00.000Z' as any }),
    ];

    const sorted = sortByUpdateDate(entities);
    expect(sorted.map((e) => e.name)).toEqual(['e2', 'e1']);
  });
});

describe('sortByEntityType', () => {
  test('sorts entities by type: agent, human, system', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'sys', entityType: EntityTypeValue.SYSTEM }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'human', entityType: EntityTypeValue.HUMAN }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'agent', entityType: EntityTypeValue.AGENT }),
    ];

    const sorted = sortByEntityType(entities);
    expect(sorted.map((e) => e.entityType)).toEqual(['agent', 'human', 'system']);
  });
});

// ============================================================================
// Group Tests
// ============================================================================

describe('groupByEntityType', () => {
  test('groups entities by type', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'agent1', entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'human1', entityType: EntityTypeValue.HUMAN }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'agent2', entityType: EntityTypeValue.AGENT }),
    ];

    const groups = groupByEntityType(entities);
    expect(groups.get(EntityTypeValue.AGENT)?.length).toBe(2);
    expect(groups.get(EntityTypeValue.HUMAN)?.length).toBe(1);
    expect(groups.get(EntityTypeValue.SYSTEM)).toBeUndefined();
  });
});

describe('groupByCreator', () => {
  test('groups entities by creator', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdBy: 'el-admin' as EntityId }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdBy: 'el-user' as EntityId }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', createdBy: 'el-admin' as EntityId }),
    ];

    const groups = groupByCreator(entities);
    expect(groups.get('el-admin' as EntityId)?.length).toBe(2);
    expect(groups.get('el-user' as EntityId)?.length).toBe(1);
  });
});

// ============================================================================
// Search Tests
// ============================================================================

describe('searchByName', () => {
  test('searches entities by name substring', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice-agent' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob-human' }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'alice-backup' }),
    ];

    const found = searchByName(entities, 'alice');
    expect(found).toHaveLength(2);
    expect(found.map((e) => e.name)).toEqual(['alice-agent', 'alice-backup']);
  });

  test('is case-insensitive', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'ALICE' }),
    ];

    const found = searchByName(entities, 'alice');
    expect(found).toHaveLength(2);
  });

  test('returns empty for no matches', () => {
    const entities = [createTestEntity({ name: 'bob' })];
    expect(searchByName(entities, 'alice')).toHaveLength(0);
  });
});

describe('findByName', () => {
  test('finds entity by exact name', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob' }),
    ];

    const found = findByName(entities, 'alice');
    expect(found).toBeDefined();
    expect(found!.name).toBe('alice');
  });

  test('returns undefined for no match', () => {
    const entities = [createTestEntity({ name: 'bob' })];
    expect(findByName(entities, 'alice')).toBeUndefined();
  });
});

describe('findById', () => {
  test('finds entity by ID', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob' }),
    ];

    const found = findById(entities, 'el-2');
    expect(found).toBeDefined();
    expect(found!.name).toBe('bob');
  });

  test('returns undefined for no match', () => {
    const entities = [createTestEntity({ id: 'el-1' as ElementId })];
    expect(findById(entities, 'el-999')).toBeUndefined();
  });
});

describe('isNameUnique', () => {
  test('returns true when name is unique', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob' }),
    ];

    expect(isNameUnique(entities, 'charlie')).toBe(true);
  });

  test('returns false when name exists', () => {
    const entities = [createTestEntity({ name: 'alice' })];
    expect(isNameUnique(entities, 'alice')).toBe(false);
  });

  test('excludes entity with given ID', () => {
    const entities = [createTestEntity({ id: 'el-1' as ElementId, name: 'alice' })];
    expect(isNameUnique(entities, 'alice', 'el-1')).toBe(true);
  });
});

describe('getUniqueTags', () => {
  test('returns unique sorted tags', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, tags: ['frontend', 'react'] }),
      createTestEntity({ id: 'el-2' as ElementId, tags: ['backend', 'frontend'] }),
      createTestEntity({ id: 'el-3' as ElementId, tags: ['devops'] }),
    ];

    const tags = getUniqueTags(entities);
    expect(tags).toEqual(['backend', 'devops', 'frontend', 'react']);
  });

  test('returns empty array for entities without tags', () => {
    const entities = [createTestEntity({ tags: [] })];
    expect(getUniqueTags(entities)).toEqual([]);
  });
});

describe('countByEntityType', () => {
  test('counts entities by type', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-2' as ElementId, entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-3' as ElementId, entityType: EntityTypeValue.HUMAN }),
    ];

    const counts = countByEntityType(entities);
    expect(counts.agent).toBe(2);
    expect(counts.human).toBe(1);
    expect(counts.system).toBe(0);
  });

  test('returns zeros for empty array', () => {
    const counts = countByEntityType([]);
    expect(counts.agent).toBe(0);
    expect(counts.human).toBe(0);
    expect(counts.system).toBe(0);
  });
});

// ============================================================================
// Entity Assignment Query Utilities Tests
// ============================================================================

import {
  getAssignedTo,
  getCreatedBy,
  getRelatedTo,
  countAssignmentsByEntity,
  getTopAssignees,
  hasAssignments,
  getUnassigned,
  getEntityAssignmentStats,
  type Assignable,
} from './entity.js';

// Helper to create test assignable items
function createTestAssignable(overrides: Partial<Assignable> = {}): Assignable {
  return {
    id: 'item-1',
    createdBy: 'entity-creator',
    ...overrides,
  };
}

describe('getAssignedTo', () => {
  test('returns items assigned to the specified entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4' }), // No assignee
    ];

    const result = getAssignedTo(items, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['item-1', 'item-3']);
  });

  test('returns empty array when no items are assigned to entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    expect(getAssignedTo(items, 'entity-a')).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(getAssignedTo([], 'entity-a')).toEqual([]);
  });
});

describe('getCreatedBy', () => {
  test('returns items created by the specified entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-a' }),
      createTestAssignable({ id: 'item-2', createdBy: 'entity-b' }),
      createTestAssignable({ id: 'item-3', createdBy: 'entity-a' }),
    ];

    const result = getCreatedBy(items, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['item-1', 'item-3']);
  });

  test('returns empty array when no items created by entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-b' }),
    ];

    expect(getCreatedBy(items, 'entity-a')).toEqual([]);
  });
});

describe('getRelatedTo', () => {
  test('returns items where entity is assignee or creator', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-a', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-2', createdBy: 'entity-b', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-3', createdBy: 'entity-a', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const result = getRelatedTo(items, 'entity-a');
    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-3']);
  });

  test('returns empty array when entity has no relation', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-b', assignee: 'entity-c' }),
    ];

    expect(getRelatedTo(items, 'entity-a')).toEqual([]);
  });
});

describe('countAssignmentsByEntity', () => {
  test('counts assignments for each entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-5' }), // No assignee
    ];

    const counts = countAssignmentsByEntity(items);
    expect(counts.get('entity-a')).toBe(3);
    expect(counts.get('entity-b')).toBe(1);
    expect(counts.has('entity-c')).toBe(false);
  });

  test('returns empty map for items with no assignees', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    const counts = countAssignmentsByEntity(items);
    expect(counts.size).toBe(0);
  });
});

describe('getTopAssignees', () => {
  test('returns entities sorted by assignment count', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-c' }),
      createTestAssignable({ id: 'item-5', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-6', assignee: 'entity-b' }),
    ];

    const top = getTopAssignees(items);
    expect(top).toEqual([
      ['entity-a', 3],
      ['entity-b', 2],
      ['entity-c', 1],
    ]);
  });

  test('respects limit parameter', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-c' }),
    ];

    const top = getTopAssignees(items, 2);
    expect(top).toHaveLength(2);
    expect(top[0][0]).toBe('entity-a');
  });

  test('returns empty array when no assignments', () => {
    const items: Assignable[] = [createTestAssignable({ id: 'item-1' })];
    expect(getTopAssignees(items)).toEqual([]);
  });
});

describe('hasAssignments', () => {
  test('returns true when entity has assignments', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
    ];

    expect(hasAssignments(items, 'entity-a')).toBe(true);
  });

  test('returns false when entity has no assignments', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    expect(hasAssignments(items, 'entity-a')).toBe(false);
  });

  test('returns false for empty array', () => {
    expect(hasAssignments([], 'entity-a')).toBe(false);
  });
});

describe('getUnassigned', () => {
  test('returns items with no assignee', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2' }),
      createTestAssignable({ id: 'item-3' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-b' }),
    ];

    const result = getUnassigned(items);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['item-2', 'item-3']);
  });

  test('returns all items when none have assignees', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    expect(getUnassigned(items)).toHaveLength(2);
  });

  test('returns empty array when all items are assigned', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
    ];

    expect(getUnassigned(items)).toEqual([]);
  });
});

describe('getEntityAssignmentStats', () => {
  test('returns correct stats for entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-a', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', createdBy: 'entity-a', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', createdBy: 'entity-b', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const stats = getEntityAssignmentStats(items, 'entity-a');
    expect(stats.assignedCount).toBe(2); // item-1, item-3
    expect(stats.createdCount).toBe(2); // item-1, item-2
    expect(stats.totalRelated).toBe(3); // item-1 (both), item-2 (created), item-3 (assigned)
  });

  test('returns zeros for entity with no relations', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const stats = getEntityAssignmentStats(items, 'entity-a');
    expect(stats.assignedCount).toBe(0);
    expect(stats.createdCount).toBe(0);
    expect(stats.totalRelated).toBe(0);
  });

  test('handles empty array', () => {
    const stats = getEntityAssignmentStats([], 'entity-a');
    expect(stats.assignedCount).toBe(0);
    expect(stats.createdCount).toBe(0);
    expect(stats.totalRelated).toBe(0);
  });
});

// ============================================================================
// Key Revocation Tests
// ============================================================================

import {
  revokeEntityKey,
  constructKeyRevocationMessage,
  validateKeyRevocationInput,
  prepareKeyRevocation,
  isKeyRevoked,
  getKeyRevocationDetails,
  filterRevokedKeyEntities,
  filterNonRevokedKeyEntities,
  type KeyRevocationInput,
} from './entity.js';

describe('constructKeyRevocationMessage', () => {
  test('constructs correct message format', () => {
    const message = constructKeyRevocationMessage(
      'el-test123' as ElementId,
      '2025-01-22T10:00:00.000Z'
    );
    expect(message).toBe('revoke-key:el-test123:2025-01-22T10:00:00.000Z');
  });

  test('handles different entity IDs', () => {
    const message1 = constructKeyRevocationMessage('el-abc' as ElementId, '2025-01-01T00:00:00.000Z');
    const message2 = constructKeyRevocationMessage('el-xyz' as ElementId, '2025-01-01T00:00:00.000Z');
    expect(message1).not.toBe(message2);
    expect(message1).toContain('el-abc');
    expect(message2).toContain('el-xyz');
  });
});

describe('validateKeyRevocationInput', () => {
  const validInput: KeyRevocationInput = {
    signature: 'dGVzdC1zaWduYXR1cmU=',
    signedAt: new Date().toISOString(),
    reason: 'Key compromised',
  };

  test('accepts valid input', () => {
    const result = validateKeyRevocationInput(validInput);
    expect(result).toEqual(validInput);
  });

  test('accepts input without reason', () => {
    const inputWithoutReason = { ...validInput };
    delete (inputWithoutReason as Record<string, unknown>).reason;
    const result = validateKeyRevocationInput(inputWithoutReason);
    expect(result.signature).toBe(validInput.signature);
  });

  test('throws on null/non-object', () => {
    expect(() => validateKeyRevocationInput(null)).toThrow(ValidationError);
    expect(() => validateKeyRevocationInput('string')).toThrow(ValidationError);
  });

  test('throws on missing signature', () => {
    expect(() => validateKeyRevocationInput({ ...validInput, signature: undefined })).toThrow(ValidationError);
    expect(() => validateKeyRevocationInput({ ...validInput, signature: '' })).toThrow(ValidationError);
  });

  test('throws on missing signedAt', () => {
    expect(() => validateKeyRevocationInput({ ...validInput, signedAt: undefined })).toThrow(ValidationError);
    expect(() => validateKeyRevocationInput({ ...validInput, signedAt: '' })).toThrow(ValidationError);
  });

  test('throws on invalid timestamp format', () => {
    expect(() => validateKeyRevocationInput({ ...validInput, signedAt: 'invalid-date' })).toThrow(ValidationError);
  });
});

describe('prepareKeyRevocation', () => {
  test('returns message and timestamp', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = prepareKeyRevocation(entity);

    expect(result.message).toContain('revoke-key:');
    expect(result.message).toContain(entity.id);
    expect(result.timestamp).toBeDefined();
  });

  test('generates valid ISO timestamp', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = prepareKeyRevocation(entity);

    // Should be a valid ISO date
    const parsed = new Date(result.timestamp);
    expect(isNaN(parsed.getTime())).toBe(false);
  });
});

describe('revokeEntityKey', () => {
  // Mock signature verifier
  const createMockVerifier = (shouldPass: boolean) => {
    return async (_message: string, _signature: string, _publicKey: string): Promise<boolean> => {
      return shouldPass;
    };
  };

  const validRevocationInput: KeyRevocationInput = {
    signature: 'dGVzdC1zaWduYXR1cmU=',
    signedAt: new Date().toISOString(),
    reason: 'Key compromised',
  };

  test('fails when entity has no public key', async () => {
    const entity = createTestEntity(); // No public key
    const result = await revokeEntityKey(entity, validRevocationInput, createMockVerifier(true));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NO_CURRENT_KEY');
  });

  test('fails when key was already revoked', async () => {
    const entity = createTestEntity({
      // No publicKey
      metadata: { keyRevokedAt: '2025-01-22T10:00:00.000Z', revokedKeyHash: 'AAAA...' },
    });
    const result = await revokeEntityKey(entity, validRevocationInput, createMockVerifier(true));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ALREADY_REVOKED');
  });

  test('fails when signature is expired', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const oldTimestamp = new Date(Date.now() - DEFAULT_MAX_SIGNATURE_AGE - 60000).toISOString();
    const result = await revokeEntityKey(
      entity,
      { ...validRevocationInput, signedAt: oldTimestamp },
      createMockVerifier(true),
      { maxSignatureAge: DEFAULT_MAX_SIGNATURE_AGE }
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SIGNATURE_EXPIRED');
  });

  test('fails when signature timestamp is in future', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const futureTimestamp = new Date(Date.now() + 120000).toISOString(); // 2 minutes in future
    const result = await revokeEntityKey(
      entity,
      { ...validRevocationInput, signedAt: futureTimestamp },
      createMockVerifier(true)
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
  });

  test('fails when signature verification fails', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await revokeEntityKey(
      entity,
      validRevocationInput,
      createMockVerifier(false),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
  });

  test('fails when verifier throws', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const throwingVerifier = async () => { throw new Error('Crypto error'); };
    const result = await revokeEntityKey(
      entity,
      validRevocationInput,
      throwingVerifier,
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
    expect(result.error).toContain('Crypto error');
  });

  test('succeeds with valid signature', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await revokeEntityKey(
      entity,
      validRevocationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(true);
    expect(result.entity).toBeDefined();
    expect(result.entity?.publicKey).toBeUndefined(); // Key is removed
  });

  test('records revocation metadata', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await revokeEntityKey(
      entity,
      validRevocationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(true);
    expect(result.entity?.metadata.keyRevokedAt).toBeDefined();
    expect(result.entity?.metadata.revokedKeyHash).toBeDefined();
    expect(result.entity?.metadata.revokedKeyHash).toContain('...');
  });

  test('records revocation reason when provided', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const result = await revokeEntityKey(
      entity,
      { ...validRevocationInput, reason: 'Key was compromised' },
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(true);
    expect(result.entity?.metadata.keyRevocationReason).toBe('Key was compromised');
  });

  test('does not record reason when not provided', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const inputWithoutReason: KeyRevocationInput = {
      signature: validRevocationInput.signature,
      signedAt: validRevocationInput.signedAt,
    };
    const result = await revokeEntityKey(
      entity,
      inputWithoutReason,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.success).toBe(true);
    expect(result.entity?.metadata.keyRevocationReason).toBeUndefined();
  });

  test('updates updatedAt timestamp', async () => {
    const entity = createTestEntity({
      publicKey: VALID_PUBLIC_KEY,
      updatedAt: '2020-01-01T00:00:00.000Z' as Timestamp,
    });
    const before = new Date().toISOString();

    const result = await revokeEntityKey(
      entity,
      validRevocationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    const after = new Date().toISOString();
    expect(result.entity?.updatedAt >= before).toBe(true);
    expect(result.entity?.updatedAt <= after).toBe(true);
  });

  test('preserves existing metadata', async () => {
    const entity = createTestEntity({
      publicKey: VALID_PUBLIC_KEY,
      metadata: { customField: 'preserved', existing: true },
    });

    const result = await revokeEntityKey(
      entity,
      validRevocationInput,
      createMockVerifier(true),
      { skipTimestampValidation: true }
    );

    expect(result.entity?.metadata.customField).toBe('preserved');
    expect(result.entity?.metadata.existing).toBe(true);
    expect(result.entity?.metadata.keyRevokedAt).toBeDefined();
  });

  test('respects custom maxSignatureAge', async () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    const recentTimestamp = new Date(Date.now() - 1000).toISOString(); // 1 second ago

    const result = await revokeEntityKey(
      entity,
      { ...validRevocationInput, signedAt: recentTimestamp },
      createMockVerifier(true),
      { maxSignatureAge: 500 } // 500ms - signature should be expired
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SIGNATURE_EXPIRED');
  });
});

describe('isKeyRevoked', () => {
  test('returns true for entity with revoked key metadata and no public key', () => {
    const entity = createTestEntity({
      metadata: { keyRevokedAt: '2025-01-22T10:00:00.000Z', revokedKeyHash: 'AAAA...' },
    });
    expect(isKeyRevoked(entity)).toBe(true);
  });

  test('returns false for entity with public key', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    expect(isKeyRevoked(entity)).toBe(false);
  });

  test('returns false for entity without public key and no revocation metadata', () => {
    const entity = createTestEntity();
    expect(isKeyRevoked(entity)).toBe(false);
  });

  test('returns false for entity with public key even if it has revocation metadata', () => {
    // Edge case: entity has both public key AND revocation metadata
    // This shouldn't happen in practice but we check for key presence
    const entity = createTestEntity({
      publicKey: VALID_PUBLIC_KEY,
      metadata: { keyRevokedAt: '2025-01-22T10:00:00.000Z', revokedKeyHash: 'AAAA...' },
    });
    expect(isKeyRevoked(entity)).toBe(false);
  });
});

describe('getKeyRevocationDetails', () => {
  test('returns revocation details for revoked entity', () => {
    const entity = createTestEntity({
      metadata: {
        keyRevokedAt: '2025-01-22T10:00:00.000Z',
        revokedKeyHash: 'AAAA...',
        keyRevocationReason: 'Key compromised',
      },
    });

    const details = getKeyRevocationDetails(entity);
    expect(details).toEqual({
      revokedAt: '2025-01-22T10:00:00.000Z',
      revokedKeyHash: 'AAAA...',
      reason: 'Key compromised',
    });
  });

  test('returns details without reason when not provided', () => {
    const entity = createTestEntity({
      metadata: {
        keyRevokedAt: '2025-01-22T10:00:00.000Z',
        revokedKeyHash: 'AAAA...',
      },
    });

    const details = getKeyRevocationDetails(entity);
    expect(details).toEqual({
      revokedAt: '2025-01-22T10:00:00.000Z',
      revokedKeyHash: 'AAAA...',
      reason: undefined,
    });
  });

  test('returns null for entity with public key', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    expect(getKeyRevocationDetails(entity)).toBeNull();
  });

  test('returns null for entity without revocation metadata', () => {
    const entity = createTestEntity();
    expect(getKeyRevocationDetails(entity)).toBeNull();
  });
});

describe('filterRevokedKeyEntities', () => {
  test('filters only revoked key entities', () => {
    const entities = [
      createTestEntity({ name: 'entity1', metadata: { keyRevokedAt: '2025-01-22T10:00:00.000Z', revokedKeyHash: 'AAA...' } }),
      createTestEntity({ name: 'entity2', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ name: 'entity3' }),
      createTestEntity({ name: 'entity4', metadata: { keyRevokedAt: '2025-01-23T10:00:00.000Z', revokedKeyHash: 'BBB...' } }),
    ];

    const revoked = filterRevokedKeyEntities(entities);
    expect(revoked).toHaveLength(2);
    expect(revoked.map(e => e.name)).toEqual(['entity1', 'entity4']);
  });

  test('returns empty array when no entities have revoked keys', () => {
    const entities = [
      createTestEntity({ name: 'entity1', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ name: 'entity2' }),
    ];

    expect(filterRevokedKeyEntities(entities)).toEqual([]);
  });
});

describe('filterNonRevokedKeyEntities', () => {
  test('filters out revoked key entities', () => {
    const entities = [
      createTestEntity({ name: 'entity1', metadata: { keyRevokedAt: '2025-01-22T10:00:00.000Z', revokedKeyHash: 'AAA...' } }),
      createTestEntity({ name: 'entity2', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ name: 'entity3' }),
      createTestEntity({ name: 'entity4', metadata: { keyRevokedAt: '2025-01-23T10:00:00.000Z', revokedKeyHash: 'BBB...' } }),
    ];

    const nonRevoked = filterNonRevokedKeyEntities(entities);
    expect(nonRevoked).toHaveLength(2);
    expect(nonRevoked.map(e => e.name)).toEqual(['entity2', 'entity3']);
  });

  test('returns all entities when none have revoked keys', () => {
    const entities = [
      createTestEntity({ name: 'entity1', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ name: 'entity2' }),
    ];

    expect(filterNonRevokedKeyEntities(entities)).toHaveLength(2);
  });
});

// ============================================================================
// Team Membership Integration Tests
// ============================================================================

import {
  TeamLike,
  getEntityTeamMemberships,
  countEntityTeamMemberships,
  isEntityInAnyTeam,
  isEntityInTeam,
  getEntityTeamIds,
  getEntityTeamNames,
  getTeammates,
  countTeammates,
  getEntityTeamMembershipStats,
  filterEntitiesByTeamMembership,
  filterEntitiesByAnyTeamMembership,
  filterEntitiesWithoutTeam,
  findEntitiesWithSameTeams,
} from './entity.js';

// Helper to create a minimal team-like object
function createTestTeam(overrides: Partial<TeamLike> = {}): TeamLike {
  return {
    id: 'team-1',
    name: 'Test Team',
    members: [],
    ...overrides,
  };
}

describe('getEntityTeamMemberships', () => {
  test('returns teams that contain the entity', () => {
    const teams = [
      createTestTeam({ id: 'team-1', name: 'Team A', members: ['entity-a', 'entity-b'] }),
      createTestTeam({ id: 'team-2', name: 'Team B', members: ['entity-b', 'entity-c'] }),
      createTestTeam({ id: 'team-3', name: 'Team C', members: ['entity-a', 'entity-c'] }),
    ];

    const result = getEntityTeamMemberships(teams, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['team-1', 'team-3']);
  });

  test('returns empty array when entity is not in any team', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-b', 'entity-c'] }),
    ];

    expect(getEntityTeamMemberships(teams, 'entity-a')).toEqual([]);
  });

  test('returns empty array for empty teams array', () => {
    expect(getEntityTeamMemberships([], 'entity-a')).toEqual([]);
  });
});

describe('countEntityTeamMemberships', () => {
  test('counts teams containing the entity', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a', 'entity-b'] }),
      createTestTeam({ id: 'team-2', members: ['entity-b'] }),
      createTestTeam({ id: 'team-3', members: ['entity-a'] }),
    ];

    expect(countEntityTeamMemberships(teams, 'entity-a')).toBe(2);
    expect(countEntityTeamMemberships(teams, 'entity-b')).toBe(2);
    expect(countEntityTeamMemberships(teams, 'entity-c')).toBe(0);
  });

  test('returns 0 for empty teams array', () => {
    expect(countEntityTeamMemberships([], 'entity-a')).toBe(0);
  });
});

describe('isEntityInAnyTeam', () => {
  test('returns true when entity is in at least one team', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-b'] }),
      createTestTeam({ id: 'team-2', members: ['entity-a'] }),
    ];

    expect(isEntityInAnyTeam(teams, 'entity-a')).toBe(true);
  });

  test('returns false when entity is not in any team', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-b'] }),
      createTestTeam({ id: 'team-2', members: ['entity-c'] }),
    ];

    expect(isEntityInAnyTeam(teams, 'entity-a')).toBe(false);
  });

  test('returns false for empty teams array', () => {
    expect(isEntityInAnyTeam([], 'entity-a')).toBe(false);
  });
});

describe('isEntityInTeam', () => {
  test('returns true when entity is a member', () => {
    const team = createTestTeam({ members: ['entity-a', 'entity-b'] });
    expect(isEntityInTeam(team, 'entity-a')).toBe(true);
  });

  test('returns false when entity is not a member', () => {
    const team = createTestTeam({ members: ['entity-b', 'entity-c'] });
    expect(isEntityInTeam(team, 'entity-a')).toBe(false);
  });

  test('returns false for empty members array', () => {
    const team = createTestTeam({ members: [] });
    expect(isEntityInTeam(team, 'entity-a')).toBe(false);
  });
});

describe('getEntityTeamIds', () => {
  test('returns IDs of teams containing the entity', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a'] }),
      createTestTeam({ id: 'team-2', members: ['entity-b'] }),
      createTestTeam({ id: 'team-3', members: ['entity-a', 'entity-b'] }),
    ];

    const result = getEntityTeamIds(teams, 'entity-a');
    expect(result).toEqual(['team-1', 'team-3']);
  });

  test('returns empty array when entity is not in any team', () => {
    const teams = [createTestTeam({ id: 'team-1', members: ['entity-b'] })];
    expect(getEntityTeamIds(teams, 'entity-a')).toEqual([]);
  });
});

describe('getEntityTeamNames', () => {
  test('returns names of teams containing the entity', () => {
    const teams = [
      createTestTeam({ id: 'team-1', name: 'Frontend', members: ['entity-a'] }),
      createTestTeam({ id: 'team-2', name: 'Backend', members: ['entity-b'] }),
      createTestTeam({ id: 'team-3', name: 'Full Stack', members: ['entity-a', 'entity-b'] }),
    ];

    const result = getEntityTeamNames(teams, 'entity-a');
    expect(result).toEqual(['Frontend', 'Full Stack']);
  });

  test('returns empty array when entity is not in any team', () => {
    const teams = [createTestTeam({ id: 'team-1', name: 'Backend', members: ['entity-b'] })];
    expect(getEntityTeamNames(teams, 'entity-a')).toEqual([]);
  });
});

describe('getTeammates', () => {
  test('returns unique entity IDs that share teams with the given entity', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestTeam({ id: 'team-2', members: ['entity-a', 'entity-d'] }),
      createTestTeam({ id: 'team-3', members: ['entity-e', 'entity-f'] }), // entity-a not here
    ];

    const result = getTeammates(teams, 'entity-a');
    expect(result.sort()).toEqual(['entity-b', 'entity-c', 'entity-d']);
  });

  test('does not include the entity itself', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a', 'entity-b'] }),
    ];

    const result = getTeammates(teams, 'entity-a');
    expect(result).not.toContain('entity-a');
    expect(result).toEqual(['entity-b']);
  });

  test('returns empty array when entity has no teammates', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a'] }), // Only entity-a
      createTestTeam({ id: 'team-2', members: ['entity-b'] }), // entity-a not here
    ];

    expect(getTeammates(teams, 'entity-a')).toEqual([]);
  });

  test('returns empty array when entity is not in any team', () => {
    const teams = [createTestTeam({ id: 'team-1', members: ['entity-b', 'entity-c'] })];
    expect(getTeammates(teams, 'entity-a')).toEqual([]);
  });

  test('deduplicates teammates across multiple shared teams', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a', 'entity-b'] }),
      createTestTeam({ id: 'team-2', members: ['entity-a', 'entity-b'] }), // Same teammate
    ];

    const result = getTeammates(teams, 'entity-a');
    expect(result).toEqual(['entity-b']);
  });
});

describe('countTeammates', () => {
  test('counts unique teammates', () => {
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestTeam({ id: 'team-2', members: ['entity-a', 'entity-d'] }),
    ];

    expect(countTeammates(teams, 'entity-a')).toBe(3);
  });

  test('returns 0 when entity has no teammates', () => {
    const teams = [createTestTeam({ id: 'team-1', members: ['entity-a'] })];
    expect(countTeammates(teams, 'entity-a')).toBe(0);
  });

  test('returns 0 when entity is not in any team', () => {
    const teams = [createTestTeam({ id: 'team-1', members: ['entity-b'] })];
    expect(countTeammates(teams, 'entity-a')).toBe(0);
  });
});

describe('getEntityTeamMembershipStats', () => {
  test('returns comprehensive statistics', () => {
    const teams = [
      createTestTeam({ id: 'team-1', name: 'Frontend', members: ['entity-a', 'entity-b'] }),
      createTestTeam({ id: 'team-2', name: 'Backend', members: ['entity-a', 'entity-c', 'entity-d'] }),
      createTestTeam({ id: 'team-3', name: 'DevOps', members: ['entity-e'] }), // entity-a not here
    ];

    const stats = getEntityTeamMembershipStats(teams, 'entity-a');
    expect(stats.teamCount).toBe(2);
    expect(stats.teammateCount).toBe(3); // entity-b, entity-c, entity-d
    expect(stats.teamIds).toEqual(['team-1', 'team-2']);
    expect(stats.teamNames).toEqual(['Frontend', 'Backend']);
  });

  test('returns zeros and empty arrays when entity is not in any team', () => {
    const teams = [createTestTeam({ id: 'team-1', members: ['entity-b'] })];

    const stats = getEntityTeamMembershipStats(teams, 'entity-a');
    expect(stats.teamCount).toBe(0);
    expect(stats.teammateCount).toBe(0);
    expect(stats.teamIds).toEqual([]);
    expect(stats.teamNames).toEqual([]);
  });

  test('handles entity in team with no other members', () => {
    const teams = [createTestTeam({ id: 'team-1', name: 'Solo', members: ['entity-a'] })];

    const stats = getEntityTeamMembershipStats(teams, 'entity-a');
    expect(stats.teamCount).toBe(1);
    expect(stats.teammateCount).toBe(0);
  });
});

describe('filterEntitiesByTeamMembership', () => {
  test('returns entities that are members of the team', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const team = createTestTeam({ members: ['entity-a', 'entity-c'] });

    const result = filterEntitiesByTeamMembership(entities, team);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('returns empty array when no entities are members', () => {
    const entities = [createTestEntity({ id: 'entity-x' as ElementId, name: 'X' })];
    const team = createTestTeam({ members: ['entity-a', 'entity-b'] });

    expect(filterEntitiesByTeamMembership(entities, team)).toEqual([]);
  });

  test('returns empty array for empty entities array', () => {
    const team = createTestTeam({ members: ['entity-a'] });
    expect(filterEntitiesByTeamMembership([], team)).toEqual([]);
  });
});

describe('filterEntitiesByAnyTeamMembership', () => {
  test('returns entities that are members of any of the teams', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
      createTestEntity({ id: 'entity-d' as ElementId, name: 'David' }),
    ];
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a'] }),
      createTestTeam({ id: 'team-2', members: ['entity-c'] }),
    ];

    const result = filterEntitiesByAnyTeamMembership(entities, teams);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('deduplicates entities that are in multiple teams', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a'] }),
      createTestTeam({ id: 'team-2', members: ['entity-a'] }),
    ];

    const result = filterEntitiesByAnyTeamMembership(entities, teams);
    expect(result).toHaveLength(1);
  });

  test('returns empty array when no entities match', () => {
    const entities = [createTestEntity({ id: 'entity-x' as ElementId, name: 'X' })];
    const teams = [createTestTeam({ members: ['entity-a'] })];

    expect(filterEntitiesByAnyTeamMembership(entities, teams)).toEqual([]);
  });

  test('returns empty array for empty teams array', () => {
    const entities = [createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' })];
    expect(filterEntitiesByAnyTeamMembership(entities, [])).toEqual([]);
  });
});

describe('filterEntitiesWithoutTeam', () => {
  test('returns entities that are not in any team', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a'] }),
      createTestTeam({ id: 'team-2', members: ['entity-c'] }),
    ];

    const result = filterEntitiesWithoutTeam(entities, teams);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('returns all entities when there are no teams', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];

    const result = filterEntitiesWithoutTeam(entities, []);
    expect(result).toHaveLength(2);
  });

  test('returns empty array when all entities are in teams', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const teams = [createTestTeam({ members: ['entity-a'] })];

    expect(filterEntitiesWithoutTeam(entities, teams)).toEqual([]);
  });
});

describe('findEntitiesWithSameTeams', () => {
  test('returns entities with exactly the same team memberships', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
      createTestEntity({ id: 'entity-d' as ElementId, name: 'David' }),
    ];
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestTeam({ id: 'team-2', members: ['entity-a', 'entity-b'] }),
      // entity-a is in team-1 and team-2
      // entity-b is in team-1 and team-2 (same as entity-a)
      // entity-c is only in team-1 (different)
      // entity-d is in neither (different)
    ];

    const result = findEntitiesWithSameTeams(entities, teams, 'entity-a');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('does not include the entity itself', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const teams = [createTestTeam({ id: 'team-1', members: ['entity-a'] })];

    const result = findEntitiesWithSameTeams(entities, teams, 'entity-a');
    expect(result).toEqual([]);
  });

  test('returns empty array when no entities match', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const teams = [
      createTestTeam({ id: 'team-1', members: ['entity-a'] }),
      createTestTeam({ id: 'team-2', members: ['entity-b'] }),
    ];

    const result = findEntitiesWithSameTeams(entities, teams, 'entity-a');
    expect(result).toEqual([]);
  });

  test('handles entities not in any team', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const teams: TeamLike[] = []; // No teams

    const result = findEntitiesWithSameTeams(entities, teams, 'entity-a');
    // entity-b also has zero teams, so they match
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });
});

// ============================================================================
// Channel Membership Integration Tests
// ============================================================================

import {
  ChannelLike,
  getEntityChannelMemberships,
  countEntityChannelMemberships,
  isEntityInAnyChannel,
  isEntityInChannel,
  getEntityChannelIds,
  getEntityChannelNames,
  getChannelmates,
  countChannelmates,
  getEntityChannelMembershipStats,
  filterEntitiesByChannelMembership,
  filterEntitiesByAnyChannelMembership,
  filterEntitiesWithoutChannel,
  findEntitiesWithSameChannels,
  getEntityDirectChannels,
  getEntityGroupChannels,
  getDirectChannelCounterpart,
  getDirectMessagePartners,
} from './entity.js';

// Helper to create a minimal channel-like object
function createTestChannel(overrides: Partial<ChannelLike> = {}): ChannelLike {
  return {
    id: 'channel-1',
    name: 'Test Channel',
    members: [],
    channelType: 'group',
    ...overrides,
  };
}

describe('getEntityChannelMemberships', () => {
  test('returns channels that contain the entity', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', name: 'Channel A', members: ['entity-a', 'entity-b'] }),
      createTestChannel({ id: 'channel-2', name: 'Channel B', members: ['entity-b', 'entity-c'] }),
      createTestChannel({ id: 'channel-3', name: 'Channel C', members: ['entity-a', 'entity-c'] }),
    ];

    const result = getEntityChannelMemberships(channels, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toEqual(['channel-1', 'channel-3']);
  });

  test('returns empty array when entity is not in any channel', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-b', 'entity-c'] }),
    ];

    expect(getEntityChannelMemberships(channels, 'entity-a')).toEqual([]);
  });

  test('returns empty array for empty channels array', () => {
    expect(getEntityChannelMemberships([], 'entity-a')).toEqual([]);
  });
});

describe('countEntityChannelMemberships', () => {
  test('counts channels the entity belongs to', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a', 'entity-b'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-b'] }),
      createTestChannel({ id: 'channel-3', members: ['entity-a'] }),
    ];

    expect(countEntityChannelMemberships(channels, 'entity-a')).toBe(2);
  });

  test('returns 0 when entity is not in any channel', () => {
    const channels = [createTestChannel({ members: ['entity-b'] })];
    expect(countEntityChannelMemberships(channels, 'entity-a')).toBe(0);
  });
});

describe('isEntityInAnyChannel', () => {
  test('returns true when entity is in at least one channel', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-b'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-a'] }),
    ];

    expect(isEntityInAnyChannel(channels, 'entity-a')).toBe(true);
  });

  test('returns false when entity is not in any channel', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-b'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-c'] }),
    ];

    expect(isEntityInAnyChannel(channels, 'entity-a')).toBe(false);
  });

  test('returns false for empty channels array', () => {
    expect(isEntityInAnyChannel([], 'entity-a')).toBe(false);
  });
});

describe('isEntityInChannel', () => {
  test('returns true when entity is a member', () => {
    const channel = createTestChannel({ members: ['entity-a', 'entity-b'] });
    expect(isEntityInChannel(channel, 'entity-a')).toBe(true);
  });

  test('returns false when entity is not a member', () => {
    const channel = createTestChannel({ members: ['entity-b', 'entity-c'] });
    expect(isEntityInChannel(channel, 'entity-a')).toBe(false);
  });

  test('returns false for empty members array', () => {
    const channel = createTestChannel({ members: [] });
    expect(isEntityInChannel(channel, 'entity-a')).toBe(false);
  });
});

describe('getEntityChannelIds', () => {
  test('returns IDs of channels containing the entity', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-b'] }),
      createTestChannel({ id: 'channel-3', members: ['entity-a', 'entity-b'] }),
    ];

    const result = getEntityChannelIds(channels, 'entity-a');
    expect(result).toEqual(['channel-1', 'channel-3']);
  });

  test('returns empty array when entity is not in any channel', () => {
    const channels = [createTestChannel({ id: 'channel-1', members: ['entity-b'] })];
    expect(getEntityChannelIds(channels, 'entity-a')).toEqual([]);
  });
});

describe('getEntityChannelNames', () => {
  test('returns names of channels containing the entity', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', name: 'Frontend', members: ['entity-a'] }),
      createTestChannel({ id: 'channel-2', name: 'Backend', members: ['entity-b'] }),
      createTestChannel({ id: 'channel-3', name: 'Full Stack', members: ['entity-a', 'entity-b'] }),
    ];

    const result = getEntityChannelNames(channels, 'entity-a');
    expect(result).toEqual(['Frontend', 'Full Stack']);
  });

  test('returns empty array when entity is not in any channel', () => {
    const channels = [createTestChannel({ id: 'channel-1', name: 'Backend', members: ['entity-b'] })];
    expect(getEntityChannelNames(channels, 'entity-a')).toEqual([]);
  });
});

describe('getChannelmates', () => {
  test('returns unique entity IDs that share channels with the given entity', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-a', 'entity-d'] }),
      createTestChannel({ id: 'channel-3', members: ['entity-e', 'entity-f'] }), // entity-a not here
    ];

    const result = getChannelmates(channels, 'entity-a');
    expect(result.sort()).toEqual(['entity-b', 'entity-c', 'entity-d']);
  });

  test('does not include the entity itself', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a', 'entity-b'] }),
    ];

    const result = getChannelmates(channels, 'entity-a');
    expect(result).not.toContain('entity-a');
    expect(result).toEqual(['entity-b']);
  });

  test('returns empty array when entity has no channelmates', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a'] }), // Only entity-a
      createTestChannel({ id: 'channel-2', members: ['entity-b'] }), // entity-a not here
    ];

    expect(getChannelmates(channels, 'entity-a')).toEqual([]);
  });

  test('returns empty array when entity is not in any channel', () => {
    const channels = [createTestChannel({ id: 'channel-1', members: ['entity-b', 'entity-c'] })];
    expect(getChannelmates(channels, 'entity-a')).toEqual([]);
  });

  test('deduplicates channelmates across multiple shared channels', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a', 'entity-b'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-a', 'entity-b'] }), // Same channelmate
    ];

    const result = getChannelmates(channels, 'entity-a');
    expect(result).toEqual(['entity-b']);
  });
});

describe('countChannelmates', () => {
  test('counts unique channelmates', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-a', 'entity-d'] }),
    ];

    expect(countChannelmates(channels, 'entity-a')).toBe(3);
  });

  test('returns 0 when entity has no channelmates', () => {
    const channels = [createTestChannel({ id: 'channel-1', members: ['entity-a'] })];
    expect(countChannelmates(channels, 'entity-a')).toBe(0);
  });

  test('returns 0 when entity is not in any channel', () => {
    const channels = [createTestChannel({ id: 'channel-1', members: ['entity-b'] })];
    expect(countChannelmates(channels, 'entity-a')).toBe(0);
  });
});

describe('getEntityChannelMembershipStats', () => {
  test('returns comprehensive statistics', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', name: 'General', channelType: 'group', members: ['entity-a', 'entity-b'] }),
      createTestChannel({ id: 'channel-2', name: 'entity-a:entity-c', channelType: 'direct', members: ['entity-a', 'entity-c'] }),
      createTestChannel({ id: 'channel-3', name: 'DevOps', channelType: 'group', members: ['entity-e'] }), // entity-a not here
    ];

    const stats = getEntityChannelMembershipStats(channels, 'entity-a');
    expect(stats.channelCount).toBe(2);
    expect(stats.directChannelCount).toBe(1);
    expect(stats.groupChannelCount).toBe(1);
    expect(stats.channelmateCount).toBe(2); // entity-b, entity-c
    expect(stats.channelIds).toEqual(['channel-1', 'channel-2']);
    expect(stats.channelNames).toEqual(['General', 'entity-a:entity-c']);
  });

  test('returns zeros and empty arrays when entity is not in any channel', () => {
    const channels = [createTestChannel({ id: 'channel-1', members: ['entity-b'] })];

    const stats = getEntityChannelMembershipStats(channels, 'entity-a');
    expect(stats.channelCount).toBe(0);
    expect(stats.directChannelCount).toBe(0);
    expect(stats.groupChannelCount).toBe(0);
    expect(stats.channelmateCount).toBe(0);
    expect(stats.channelIds).toEqual([]);
    expect(stats.channelNames).toEqual([]);
  });

  test('handles entity in channel with no other members', () => {
    const channels = [createTestChannel({ id: 'channel-1', name: 'Solo', members: ['entity-a'] })];

    const stats = getEntityChannelMembershipStats(channels, 'entity-a');
    expect(stats.channelCount).toBe(1);
    expect(stats.channelmateCount).toBe(0);
  });
});

describe('filterEntitiesByChannelMembership', () => {
  test('returns entities that are members of the channel', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const channel = createTestChannel({ members: ['entity-a', 'entity-c'] });

    const result = filterEntitiesByChannelMembership(entities, channel);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('returns empty array when no entities are members', () => {
    const entities = [createTestEntity({ id: 'entity-x' as ElementId, name: 'X' })];
    const channel = createTestChannel({ members: ['entity-a', 'entity-b'] });

    expect(filterEntitiesByChannelMembership(entities, channel)).toEqual([]);
  });

  test('returns empty array for empty entities array', () => {
    const channel = createTestChannel({ members: ['entity-a'] });
    expect(filterEntitiesByChannelMembership([], channel)).toEqual([]);
  });
});

describe('filterEntitiesByAnyChannelMembership', () => {
  test('returns entities that are members of any of the channels', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
      createTestEntity({ id: 'entity-d' as ElementId, name: 'David' }),
    ];
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-c'] }),
    ];

    const result = filterEntitiesByAnyChannelMembership(entities, channels);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('deduplicates entities that are in multiple channels', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-a'] }),
    ];

    const result = filterEntitiesByAnyChannelMembership(entities, channels);
    expect(result).toHaveLength(1);
  });

  test('returns empty array when no entities match', () => {
    const entities = [createTestEntity({ id: 'entity-x' as ElementId, name: 'X' })];
    const channels = [createTestChannel({ members: ['entity-a'] })];

    expect(filterEntitiesByAnyChannelMembership(entities, channels)).toEqual([]);
  });

  test('returns empty array for empty channels array', () => {
    const entities = [createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' })];
    expect(filterEntitiesByAnyChannelMembership(entities, [])).toEqual([]);
  });
});

describe('filterEntitiesWithoutChannel', () => {
  test('returns entities that are not in any channel', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-c'] }),
    ];

    const result = filterEntitiesWithoutChannel(entities, channels);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('returns all entities when there are no channels', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];

    const result = filterEntitiesWithoutChannel(entities, []);
    expect(result).toHaveLength(2);
  });

  test('returns empty array when all entities are in channels', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const channels = [createTestChannel({ members: ['entity-a'] })];

    expect(filterEntitiesWithoutChannel(entities, channels)).toEqual([]);
  });
});

describe('findEntitiesWithSameChannels', () => {
  test('returns entities with exactly the same channel memberships', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
      createTestEntity({ id: 'entity-d' as ElementId, name: 'David' }),
    ];
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-a', 'entity-b'] }),
      // entity-a is in channel-1 and channel-2
      // entity-b is in channel-1 and channel-2 (same as entity-a)
      // entity-c is only in channel-1 (different)
      // entity-d is in neither (different)
    ];

    const result = findEntitiesWithSameChannels(entities, channels, 'entity-a');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('does not include the entity itself', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const channels = [createTestChannel({ id: 'channel-1', members: ['entity-a'] })];

    const result = findEntitiesWithSameChannels(entities, channels, 'entity-a');
    expect(result).toEqual([]);
  });

  test('returns empty array when no entities match', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const channels = [
      createTestChannel({ id: 'channel-1', members: ['entity-a'] }),
      createTestChannel({ id: 'channel-2', members: ['entity-b'] }),
    ];

    const result = findEntitiesWithSameChannels(entities, channels, 'entity-a');
    expect(result).toEqual([]);
  });

  test('handles entities not in any channel', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const channels: ChannelLike[] = []; // No channels

    const result = findEntitiesWithSameChannels(entities, channels, 'entity-a');
    // entity-b also has zero channels, so they match
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });
});

describe('getEntityDirectChannels', () => {
  test('returns only direct channels containing the entity', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', channelType: 'direct', members: ['entity-a', 'entity-b'] }),
      createTestChannel({ id: 'channel-2', channelType: 'group', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestChannel({ id: 'channel-3', channelType: 'direct', members: ['entity-a', 'entity-c'] }),
      createTestChannel({ id: 'channel-4', channelType: 'direct', members: ['entity-b', 'entity-c'] }), // entity-a not here
    ];

    const result = getEntityDirectChannels(channels, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toEqual(['channel-1', 'channel-3']);
  });

  test('returns empty array when entity has no direct channels', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', channelType: 'group', members: ['entity-a', 'entity-b'] }),
    ];

    expect(getEntityDirectChannels(channels, 'entity-a')).toEqual([]);
  });
});

describe('getEntityGroupChannels', () => {
  test('returns only group channels containing the entity', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', channelType: 'direct', members: ['entity-a', 'entity-b'] }),
      createTestChannel({ id: 'channel-2', channelType: 'group', members: ['entity-a', 'entity-b', 'entity-c'] }),
      createTestChannel({ id: 'channel-3', channelType: 'group', members: ['entity-a', 'entity-d'] }),
      createTestChannel({ id: 'channel-4', channelType: 'group', members: ['entity-b', 'entity-c'] }), // entity-a not here
    ];

    const result = getEntityGroupChannels(channels, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toEqual(['channel-2', 'channel-3']);
  });

  test('returns empty array when entity has no group channels', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', channelType: 'direct', members: ['entity-a', 'entity-b'] }),
    ];

    expect(getEntityGroupChannels(channels, 'entity-a')).toEqual([]);
  });
});

describe('getDirectChannelCounterpart', () => {
  test('returns the other entity in a direct channel', () => {
    const channel = createTestChannel({ channelType: 'direct', members: ['entity-a', 'entity-b'] });
    expect(getDirectChannelCounterpart(channel, 'entity-a')).toBe('entity-b');
    expect(getDirectChannelCounterpart(channel, 'entity-b')).toBe('entity-a');
  });

  test('returns null for group channels', () => {
    const channel = createTestChannel({ channelType: 'group', members: ['entity-a', 'entity-b'] });
    expect(getDirectChannelCounterpart(channel, 'entity-a')).toBeNull();
  });

  test('returns null when entity is not a member', () => {
    const channel = createTestChannel({ channelType: 'direct', members: ['entity-a', 'entity-b'] });
    expect(getDirectChannelCounterpart(channel, 'entity-c')).toBeNull();
  });
});

describe('getDirectMessagePartners', () => {
  test('returns all entities the given entity has direct channels with', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', channelType: 'direct', members: ['entity-a', 'entity-b'] }),
      createTestChannel({ id: 'channel-2', channelType: 'direct', members: ['entity-a', 'entity-c'] }),
      createTestChannel({ id: 'channel-3', channelType: 'group', members: ['entity-a', 'entity-d'] }), // Group, not included
      createTestChannel({ id: 'channel-4', channelType: 'direct', members: ['entity-b', 'entity-c'] }), // entity-a not here
    ];

    const result = getDirectMessagePartners(channels, 'entity-a');
    expect(result.sort()).toEqual(['entity-b', 'entity-c']);
  });

  test('returns empty array when entity has no direct channels', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', channelType: 'group', members: ['entity-a', 'entity-b'] }),
    ];

    expect(getDirectMessagePartners(channels, 'entity-a')).toEqual([]);
  });

  test('returns empty array when entity is not in any channel', () => {
    const channels = [
      createTestChannel({ id: 'channel-1', channelType: 'direct', members: ['entity-b', 'entity-c'] }),
    ];

    expect(getDirectMessagePartners(channels, 'entity-a')).toEqual([]);
  });
});

// ============================================================================
// Message Sender Integration Tests
// ============================================================================

import {
  MessageLike,
  isValidMessageSender,
  canSendToChannel,
  validateMessageSender,
  getMessagesSentBy,
  getEntityChannelMessages,
  countMessagesSentBy,
  countMessagesBySender,
  getTopMessageSenders,
  hasSentMessages,
  getMostRecentMessageBy,
  getChannelsWithMessagesFrom,
  getEntityMessageStats,
  filterEntitiesWithMessages,
  filterEntitiesWithoutMessages,
  getChannelParticipants,
  getMessagePartners,
  canCryptographicallySign,
  filterEntitiesWithSigningCapability,
  getVerifiedMessageSenders,
} from './entity.js';

// Helper to create a minimal message-like object
function createTestMessage(overrides: Partial<MessageLike> = {}): MessageLike {
  return {
    id: 'message-1',
    sender: 'entity-a',
    channelId: 'channel-1',
    createdAt: '2025-01-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('isValidMessageSender', () => {
  test('returns true when sender entity exists', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];

    expect(isValidMessageSender(entities, 'entity-a')).toBe(true);
    expect(isValidMessageSender(entities, 'entity-b')).toBe(true);
  });

  test('returns false when sender entity does not exist', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];

    expect(isValidMessageSender(entities, 'entity-x')).toBe(false);
    expect(isValidMessageSender(entities, 'unknown')).toBe(false);
  });

  test('returns false for empty entities array', () => {
    expect(isValidMessageSender([], 'entity-a')).toBe(false);
  });
});

describe('canSendToChannel', () => {
  test('returns true when entity exists and is channel member', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const channel = createTestChannel({ members: ['entity-a', 'entity-b'] });

    expect(canSendToChannel(entities, channel, 'entity-a')).toBe(true);
    expect(canSendToChannel(entities, channel, 'entity-b')).toBe(true);
  });

  test('returns false when entity exists but is not channel member', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const channel = createTestChannel({ members: ['entity-a'] });

    expect(canSendToChannel(entities, channel, 'entity-b')).toBe(false);
  });

  test('returns false when entity does not exist', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const channel = createTestChannel({ members: ['entity-a', 'entity-x'] });

    expect(canSendToChannel(entities, channel, 'entity-x')).toBe(false);
  });

  test('returns false for empty entities array', () => {
    const channel = createTestChannel({ members: ['entity-a'] });
    expect(canSendToChannel([], channel, 'entity-a')).toBe(false);
  });
});

describe('validateMessageSender', () => {
  test('returns valid result when entity exists and is channel member', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const channel = createTestChannel({ members: ['entity-a'] });

    const result = validateMessageSender(entities, channel, 'entity-a');
    expect(result.valid).toBe(true);
    expect(result.errorCode).toBeUndefined();
    expect(result.errorMessage).toBeUndefined();
  });

  test('returns ENTITY_NOT_FOUND when entity does not exist', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const channel = createTestChannel({ members: ['entity-a', 'entity-x'] });

    const result = validateMessageSender(entities, channel, 'entity-x');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('ENTITY_NOT_FOUND');
    expect(result.errorMessage).toContain('entity-x');
  });

  test('returns ENTITY_DEACTIVATED when entity is deactivated', () => {
    const deactivatedEntity = createTestEntity({
      id: 'entity-a' as ElementId,
      name: 'Alice',
      metadata: { active: false, deactivatedAt: '2025-01-22T12:00:00.000Z' },
    });
    const entities = [deactivatedEntity];
    const channel = createTestChannel({ members: ['entity-a'] });

    const result = validateMessageSender(entities, channel, 'entity-a');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('ENTITY_DEACTIVATED');
    expect(result.errorMessage).toContain('deactivated');
  });

  test('returns NOT_CHANNEL_MEMBER when entity is not in channel', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const channel = createTestChannel({ id: 'channel-1', members: ['entity-b'] });

    const result = validateMessageSender(entities, channel, 'entity-a');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('NOT_CHANNEL_MEMBER');
    expect(result.errorMessage).toContain('entity-a');
    expect(result.errorMessage).toContain('channel-1');
  });
});

describe('getMessagesSentBy', () => {
  test('returns messages sent by the entity', () => {
    const messages = [
      createTestMessage({ id: 'msg-1', sender: 'entity-a' }),
      createTestMessage({ id: 'msg-2', sender: 'entity-b' }),
      createTestMessage({ id: 'msg-3', sender: 'entity-a' }),
    ];

    const result = getMessagesSentBy(messages, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(m => m.id)).toEqual(['msg-1', 'msg-3']);
  });

  test('returns empty array when no messages from entity', () => {
    const messages = [
      createTestMessage({ id: 'msg-1', sender: 'entity-b' }),
    ];

    expect(getMessagesSentBy(messages, 'entity-a')).toEqual([]);
  });

  test('returns empty array for empty messages array', () => {
    expect(getMessagesSentBy([], 'entity-a')).toEqual([]);
  });
});

describe('getEntityChannelMessages', () => {
  test('returns messages sent by entity to specific channel', () => {
    const messages = [
      createTestMessage({ id: 'msg-1', sender: 'entity-a', channelId: 'channel-1' }),
      createTestMessage({ id: 'msg-2', sender: 'entity-a', channelId: 'channel-2' }),
      createTestMessage({ id: 'msg-3', sender: 'entity-a', channelId: 'channel-1' }),
      createTestMessage({ id: 'msg-4', sender: 'entity-b', channelId: 'channel-1' }),
    ];

    const result = getEntityChannelMessages(messages, 'entity-a', 'channel-1');
    expect(result).toHaveLength(2);
    expect(result.map(m => m.id)).toEqual(['msg-1', 'msg-3']);
  });

  test('returns empty array when no matching messages', () => {
    const messages = [
      createTestMessage({ id: 'msg-1', sender: 'entity-a', channelId: 'channel-1' }),
    ];

    expect(getEntityChannelMessages(messages, 'entity-a', 'channel-2')).toEqual([]);
    expect(getEntityChannelMessages(messages, 'entity-b', 'channel-1')).toEqual([]);
  });
});

describe('countMessagesSentBy', () => {
  test('counts messages sent by entity', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-b' }),
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-a' }),
    ];

    expect(countMessagesSentBy(messages, 'entity-a')).toBe(3);
    expect(countMessagesSentBy(messages, 'entity-b')).toBe(1);
  });

  test('returns 0 when entity has sent no messages', () => {
    const messages = [createTestMessage({ sender: 'entity-a' })];
    expect(countMessagesSentBy(messages, 'entity-x')).toBe(0);
  });
});

describe('countMessagesBySender', () => {
  test('counts messages for each sender', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-b' }),
      createTestMessage({ sender: 'entity-a' }),
    ];

    const counts = countMessagesBySender(messages);
    expect(counts.get('entity-a')).toBe(2);
    expect(counts.get('entity-b')).toBe(1);
  });

  test('returns empty map for empty messages array', () => {
    expect(countMessagesBySender([]).size).toBe(0);
  });
});

describe('getTopMessageSenders', () => {
  test('returns senders sorted by message count descending', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-b' }),
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-c' }),
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-b' }),
    ];

    const result = getTopMessageSenders(messages);
    expect(result).toEqual([
      ['entity-a', 3],
      ['entity-b', 2],
      ['entity-c', 1],
    ]);
  });

  test('respects limit parameter', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-b' }),
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-c' }),
    ];

    const result = getTopMessageSenders(messages, 2);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('entity-a');
    expect(result[1][0]).toBe('entity-b');
  });

  test('returns empty array for empty messages', () => {
    expect(getTopMessageSenders([])).toEqual([]);
  });
});

describe('hasSentMessages', () => {
  test('returns true when entity has sent at least one message', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-b' }),
    ];

    expect(hasSentMessages(messages, 'entity-a')).toBe(true);
  });

  test('returns false when entity has not sent any messages', () => {
    const messages = [createTestMessage({ sender: 'entity-a' })];
    expect(hasSentMessages(messages, 'entity-x')).toBe(false);
  });

  test('returns false for empty messages array', () => {
    expect(hasSentMessages([], 'entity-a')).toBe(false);
  });
});

describe('getMostRecentMessageBy', () => {
  test('returns most recent message by entity', () => {
    const messages = [
      createTestMessage({ id: 'msg-1', sender: 'entity-a', createdAt: '2025-01-22T10:00:00.000Z' }),
      createTestMessage({ id: 'msg-2', sender: 'entity-a', createdAt: '2025-01-22T12:00:00.000Z' }),
      createTestMessage({ id: 'msg-3', sender: 'entity-a', createdAt: '2025-01-22T11:00:00.000Z' }),
    ];

    const result = getMostRecentMessageBy(messages, 'entity-a');
    expect(result?.id).toBe('msg-2');
  });

  test('returns undefined when entity has no messages', () => {
    const messages = [createTestMessage({ sender: 'entity-b' })];
    expect(getMostRecentMessageBy(messages, 'entity-a')).toBeUndefined();
  });

  test('returns undefined for empty messages array', () => {
    expect(getMostRecentMessageBy([], 'entity-a')).toBeUndefined();
  });
});

describe('getChannelsWithMessagesFrom', () => {
  test('returns unique channel IDs where entity has sent messages', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1' }),
      createTestMessage({ sender: 'entity-a', channelId: 'channel-2' }),
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1' }), // Duplicate channel
      createTestMessage({ sender: 'entity-b', channelId: 'channel-3' }), // Different sender
    ];

    const result = getChannelsWithMessagesFrom(messages, 'entity-a');
    expect(result.sort()).toEqual(['channel-1', 'channel-2']);
  });

  test('returns empty array when entity has no messages', () => {
    const messages = [createTestMessage({ sender: 'entity-b' })];
    expect(getChannelsWithMessagesFrom(messages, 'entity-a')).toEqual([]);
  });
});

describe('getEntityMessageStats', () => {
  test('returns comprehensive message statistics', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1', createdAt: '2025-01-22T10:00:00.000Z' }),
      createTestMessage({ sender: 'entity-a', channelId: 'channel-2', createdAt: '2025-01-22T12:00:00.000Z' }),
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1', createdAt: '2025-01-22T11:00:00.000Z' }),
      createTestMessage({ sender: 'entity-b', channelId: 'channel-1' }), // Different sender
    ];

    const stats = getEntityMessageStats(messages, 'entity-a');
    expect(stats.messageCount).toBe(3);
    expect(stats.channelCount).toBe(2);
    expect(stats.channelIds.sort()).toEqual(['channel-1', 'channel-2']);
    expect(stats.mostRecentMessageAt).toBe('2025-01-22T12:00:00.000Z');
  });

  test('returns zeros when entity has no messages', () => {
    const messages = [createTestMessage({ sender: 'entity-b' })];

    const stats = getEntityMessageStats(messages, 'entity-a');
    expect(stats.messageCount).toBe(0);
    expect(stats.channelCount).toBe(0);
    expect(stats.channelIds).toEqual([]);
    expect(stats.mostRecentMessageAt).toBeUndefined();
  });
});

describe('filterEntitiesWithMessages', () => {
  test('returns entities that have sent messages', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-c' }),
    ];

    const result = filterEntitiesWithMessages(entities, messages);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('returns empty array when no entities have sent messages', () => {
    const entities = [createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' })];
    const messages = [createTestMessage({ sender: 'entity-x' })];

    expect(filterEntitiesWithMessages(entities, messages)).toEqual([]);
  });
});

describe('filterEntitiesWithoutMessages', () => {
  test('returns entities that have not sent messages', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-c' }),
    ];

    const result = filterEntitiesWithoutMessages(entities, messages);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('returns all entities when no messages exist', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];

    const result = filterEntitiesWithoutMessages(entities, []);
    expect(result).toHaveLength(2);
  });
});

describe('getChannelParticipants', () => {
  test('returns entities that have sent messages to the channel', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const messages = [
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1' }),
      createTestMessage({ sender: 'entity-b', channelId: 'channel-2' }),
      createTestMessage({ sender: 'entity-c', channelId: 'channel-1' }),
    ];

    const result = getChannelParticipants(entities, messages, 'channel-1');
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('returns empty array when no messages in channel', () => {
    const entities = [createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' })];
    const messages = [createTestMessage({ sender: 'entity-a', channelId: 'channel-1' })];

    expect(getChannelParticipants(entities, messages, 'channel-2')).toEqual([]);
  });
});

describe('getMessagePartners', () => {
  test('returns entities that have exchanged messages with entity in shared channels', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1' }),
      createTestMessage({ sender: 'entity-b', channelId: 'channel-1' }), // Same channel as entity-a
      createTestMessage({ sender: 'entity-c', channelId: 'channel-1' }), // Same channel as entity-a
      createTestMessage({ sender: 'entity-d', channelId: 'channel-2' }), // Different channel, not a partner
    ];

    const result = getMessagePartners(messages, 'entity-a');
    expect(result.sort()).toEqual(['entity-b', 'entity-c']);
  });

  test('does not include the entity itself', () => {
    const messages = [
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1' }),
      createTestMessage({ sender: 'entity-a', channelId: 'channel-1' }),
    ];

    const result = getMessagePartners(messages, 'entity-a');
    expect(result).not.toContain('entity-a');
    expect(result).toEqual([]);
  });

  test('returns empty array when entity has no messages', () => {
    const messages = [createTestMessage({ sender: 'entity-b', channelId: 'channel-1' })];
    expect(getMessagePartners(messages, 'entity-a')).toEqual([]);
  });
});

describe('canCryptographicallySign', () => {
  test('returns true when entity has public key', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    expect(canCryptographicallySign(entity)).toBe(true);
  });

  test('returns false when entity has no public key', () => {
    const entity = createTestEntity();
    expect(canCryptographicallySign(entity)).toBe(false);
  });
});

describe('filterEntitiesWithSigningCapability', () => {
  test('returns entities with public keys', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie', publicKey: VALID_PUBLIC_KEY }),
    ];

    const result = filterEntitiesWithSigningCapability(entities);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('returns empty array when no entities have public keys', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];

    expect(filterEntitiesWithSigningCapability(entities)).toEqual([]);
  });
});

describe('getVerifiedMessageSenders', () => {
  test('returns entities with both message activity and cryptographic identity', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }), // No public key
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ id: 'entity-d' as ElementId, name: 'David', publicKey: VALID_PUBLIC_KEY }), // Has key but no messages
    ];
    const messages = [
      createTestMessage({ sender: 'entity-a' }),
      createTestMessage({ sender: 'entity-b' }),
      createTestMessage({ sender: 'entity-c' }),
    ];

    const result = getVerifiedMessageSenders(entities, messages);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('returns empty array when no entities match both criteria', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }), // No public key
    ];
    const messages = [createTestMessage({ sender: 'entity-a' })];

    expect(getVerifiedMessageSenders(entities, messages)).toEqual([]);
  });
});

// ============================================================================
// Task Assignment Integration Tests
// ============================================================================

import {
  type TaskLike,
  isValidTaskAssignee,
  validateTaskAssignee,
  getTasksAssignedTo,
  getTasksOwnedBy,
  getTasksCreatedBy,
  getTasksInvolvingEntity,
  countTasksAssignedTo,
  countTasksByAssignee,
  getTopTaskAssignees,
  hasTasksAssigned,
  getUnassignedTasks,
  getEntityTasksByStatus,
  getEntityTaskStats,
  filterEntitiesWithTasks,
  filterEntitiesWithoutTasks,
  filterEntitiesByTaskLoad,
  getAvailableAssignees,
  getEntityWorkloadDistribution,
  findLeastBusyEntity,
  getTaskCoworkers,
  countTaskCoworkers,
} from './entity.js';

// Helper to create a valid task for testing
function createTestTask(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    id: 'task-1',
    title: 'Test Task',
    status: 'open',
    priority: 3,
    complexity: 2,
    createdBy: 'entity-system',
    createdAt: '2025-01-22T10:00:00.000Z',
    updatedAt: '2025-01-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('isValidTaskAssignee', () => {
  test('returns true when entity exists', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];

    expect(isValidTaskAssignee(entities, 'entity-a')).toBe(true);
    expect(isValidTaskAssignee(entities, 'entity-b')).toBe(true);
  });

  test('returns false when entity does not exist', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];

    expect(isValidTaskAssignee(entities, 'entity-nonexistent')).toBe(false);
  });

  test('returns false for empty entities array', () => {
    expect(isValidTaskAssignee([], 'entity-a')).toBe(false);
  });
});

describe('validateTaskAssignee', () => {
  test('returns valid result for existing active entity', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];

    const result = validateTaskAssignee(entities, 'entity-a');
    expect(result.valid).toBe(true);
    expect(result.errorCode).toBeUndefined();
    expect(result.errorMessage).toBeUndefined();
  });

  test('returns ENTITY_NOT_FOUND error when entity does not exist', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];

    const result = validateTaskAssignee(entities, 'entity-nonexistent');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('ENTITY_NOT_FOUND');
    expect(result.errorMessage).toContain('entity-nonexistent');
  });

  test('returns ENTITY_DEACTIVATED error when entity is deactivated', () => {
    const entities = [
      createTestEntity({
        id: 'entity-a' as ElementId,
        name: 'Alice',
        metadata: { active: false, deactivatedAt: '2025-01-22T12:00:00.000Z' },
      }),
    ];

    const result = validateTaskAssignee(entities, 'entity-a');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('ENTITY_DEACTIVATED');
    expect(result.errorMessage).toContain('deactivated');
  });
});

describe('getTasksAssignedTo', () => {
  test('returns tasks assigned to entity', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-b' }),
      createTestTask({ id: 'task-3', assignee: 'entity-a' }),
      createTestTask({ id: 'task-4' }), // No assignee
    ];

    const result = getTasksAssignedTo(tasks, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['task-1', 'task-3']);
  });

  test('returns empty array when no tasks assigned', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-b' }),
    ];

    expect(getTasksAssignedTo(tasks, 'entity-a')).toEqual([]);
  });

  test('returns empty array for empty tasks', () => {
    expect(getTasksAssignedTo([], 'entity-a')).toEqual([]);
  });
});

describe('getTasksOwnedBy', () => {
  test('returns tasks owned by entity', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', owner: 'entity-a' }),
      createTestTask({ id: 'task-2', owner: 'entity-b' }),
      createTestTask({ id: 'task-3', owner: 'entity-a' }),
    ];

    const result = getTasksOwnedBy(tasks, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['task-1', 'task-3']);
  });

  test('returns empty array when no tasks owned', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', owner: 'entity-b' }),
    ];

    expect(getTasksOwnedBy(tasks, 'entity-a')).toEqual([]);
  });
});

describe('getTasksCreatedBy', () => {
  test('returns tasks created by entity', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', createdBy: 'entity-a' }),
      createTestTask({ id: 'task-2', createdBy: 'entity-b' }),
      createTestTask({ id: 'task-3', createdBy: 'entity-a' }),
    ];

    const result = getTasksCreatedBy(tasks, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['task-1', 'task-3']);
  });
});

describe('getTasksInvolvingEntity', () => {
  test('returns tasks where entity is assignee, owner, or creator', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', createdBy: 'entity-b' }),
      createTestTask({ id: 'task-2', owner: 'entity-a', createdBy: 'entity-b' }),
      createTestTask({ id: 'task-3', createdBy: 'entity-a' }),
      createTestTask({ id: 'task-4', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const result = getTasksInvolvingEntity(tasks, 'entity-a');
    expect(result).toHaveLength(3);
    expect(result.map(t => t.id)).toEqual(['task-1', 'task-2', 'task-3']);
  });

  test('returns empty array when entity is not involved', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', createdBy: 'entity-b', assignee: 'entity-c' }),
    ];

    expect(getTasksInvolvingEntity(tasks, 'entity-a')).toEqual([]);
  });
});

describe('countTasksAssignedTo', () => {
  test('counts tasks assigned to entity', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-b' }),
      createTestTask({ id: 'task-3', assignee: 'entity-a' }),
      createTestTask({ id: 'task-4', assignee: 'entity-a' }),
    ];

    expect(countTasksAssignedTo(tasks, 'entity-a')).toBe(3);
    expect(countTasksAssignedTo(tasks, 'entity-b')).toBe(1);
    expect(countTasksAssignedTo(tasks, 'entity-c')).toBe(0);
  });
});

describe('countTasksByAssignee', () => {
  test('returns map of assignee to count', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-b' }),
      createTestTask({ id: 'task-3', assignee: 'entity-a' }),
      createTestTask({ id: 'task-4' }), // No assignee
    ];

    const counts = countTasksByAssignee(tasks);
    expect(counts.get('entity-a')).toBe(2);
    expect(counts.get('entity-b')).toBe(1);
    expect(counts.has('entity-c')).toBe(false);
  });

  test('returns empty map for no assigned tasks', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1' }),
      createTestTask({ id: 'task-2' }),
    ];

    const counts = countTasksByAssignee(tasks);
    expect(counts.size).toBe(0);
  });
});

describe('getTopTaskAssignees', () => {
  test('returns assignees sorted by task count', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-b' }),
      createTestTask({ id: 'task-3', assignee: 'entity-a' }),
      createTestTask({ id: 'task-4', assignee: 'entity-c' }),
      createTestTask({ id: 'task-5', assignee: 'entity-a' }),
      createTestTask({ id: 'task-6', assignee: 'entity-b' }),
    ];

    const top = getTopTaskAssignees(tasks);
    expect(top).toEqual([
      ['entity-a', 3],
      ['entity-b', 2],
      ['entity-c', 1],
    ]);
  });

  test('respects limit parameter', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a' }),
      createTestTask({ id: 'task-3', assignee: 'entity-b' }),
      createTestTask({ id: 'task-4', assignee: 'entity-c' }),
    ];

    const top = getTopTaskAssignees(tasks, 2);
    expect(top).toHaveLength(2);
    expect(top[0]).toEqual(['entity-a', 2]);
  });
});

describe('hasTasksAssigned', () => {
  test('returns true when entity has tasks assigned', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-b' }),
    ];

    expect(hasTasksAssigned(tasks, 'entity-a')).toBe(true);
  });

  test('returns false when entity has no tasks assigned', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-b' }),
    ];

    expect(hasTasksAssigned(tasks, 'entity-a')).toBe(false);
  });

  test('returns false for empty tasks array', () => {
    expect(hasTasksAssigned([], 'entity-a')).toBe(false);
  });
});

describe('getUnassignedTasks', () => {
  test('returns tasks with no assignee', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2' }),
      createTestTask({ id: 'task-3' }),
      createTestTask({ id: 'task-4', assignee: 'entity-b' }),
    ];

    const result = getUnassignedTasks(tasks);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['task-2', 'task-3']);
  });

  test('returns empty array when all tasks assigned', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-b' }),
    ];

    expect(getUnassignedTasks(tasks)).toEqual([]);
  });
});

describe('getEntityTasksByStatus', () => {
  test('returns tasks for entity with specified status', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', status: 'open' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a', status: 'in_progress' }),
      createTestTask({ id: 'task-3', assignee: 'entity-a', status: 'open' }),
      createTestTask({ id: 'task-4', assignee: 'entity-b', status: 'open' }),
    ];

    const result = getEntityTasksByStatus(tasks, 'entity-a', 'open');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['task-1', 'task-3']);
  });

  test('returns empty array when no matching tasks', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', status: 'closed' }),
    ];

    expect(getEntityTasksByStatus(tasks, 'entity-a', 'open')).toEqual([]);
  });
});

describe('getEntityTaskStats', () => {
  test('returns comprehensive task statistics', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', owner: 'entity-b', createdBy: 'entity-c', status: 'open', priority: 2, complexity: 3 }),
      createTestTask({ id: 'task-2', assignee: 'entity-a', createdBy: 'entity-a', status: 'open', priority: 4, complexity: 1 }),
      createTestTask({ id: 'task-3', owner: 'entity-a', createdBy: 'entity-b', status: 'closed' }),
      createTestTask({ id: 'task-4', createdBy: 'entity-a' }),
      createTestTask({ id: 'task-5', assignee: 'entity-a', status: 'in_progress', priority: 3, complexity: 2 }),
    ];

    const stats = getEntityTaskStats(tasks, 'entity-a');
    expect(stats.assignedCount).toBe(3);
    expect(stats.ownedCount).toBe(1);
    expect(stats.createdCount).toBe(2);
    expect(stats.totalInvolved).toBe(5); // task-1, task-2, task-3, task-4, task-5
    expect(stats.byStatus.get('open')).toBe(2);
    expect(stats.byStatus.get('in_progress')).toBe(1);
    expect(stats.averagePriority).toBe(3); // (2+4+3)/3
    expect(stats.totalComplexity).toBe(6); // 3+1+2
  });

  test('returns null average priority when no assigned tasks', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', createdBy: 'entity-a' }),
    ];

    const stats = getEntityTaskStats(tasks, 'entity-a');
    expect(stats.assignedCount).toBe(0);
    expect(stats.averagePriority).toBeNull();
    expect(stats.totalComplexity).toBe(0);
  });

  test('returns zeros for entity not involved', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const stats = getEntityTaskStats(tasks, 'entity-a');
    expect(stats.assignedCount).toBe(0);
    expect(stats.ownedCount).toBe(0);
    expect(stats.createdCount).toBe(0);
    expect(stats.totalInvolved).toBe(0);
  });
});

describe('filterEntitiesWithTasks', () => {
  test('returns entities that have tasks assigned', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-c' }),
    ];

    const result = filterEntitiesWithTasks(entities, tasks);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Charlie']);
  });

  test('returns empty array when no entities have tasks', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1' }), // No assignee
    ];

    expect(filterEntitiesWithTasks(entities, tasks)).toEqual([]);
  });
});

describe('filterEntitiesWithoutTasks', () => {
  test('returns entities that have no tasks assigned', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
    ];

    const result = filterEntitiesWithoutTasks(entities, tasks);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Bob', 'Charlie']);
  });

  test('returns all entities when no tasks have assignees', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1' }), // No assignee
    ];

    expect(filterEntitiesWithoutTasks(entities, tasks)).toHaveLength(1);
  });
});

describe('filterEntitiesByTaskLoad', () => {
  test('returns entities with at most maxTasks assigned', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a' }),
      createTestTask({ id: 'task-3', assignee: 'entity-a' }),
      createTestTask({ id: 'task-4', assignee: 'entity-b' }),
    ];

    const result = filterEntitiesByTaskLoad(entities, tasks, 2);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Bob', 'Charlie']);
  });

  test('includes entities with no tasks when maxTasks > 0', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const tasks: TaskLike[] = [];

    expect(filterEntitiesByTaskLoad(entities, tasks, 2)).toHaveLength(1);
  });
});

describe('getAvailableAssignees', () => {
  test('returns active entities under capacity', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob', metadata: { active: false } }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a' }),
    ];

    const result = getAvailableAssignees(entities, tasks, 2);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Charlie');
  });

  test('excludes deactivated entities', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice', metadata: { active: false } }),
    ];
    const tasks: TaskLike[] = [];

    expect(getAvailableAssignees(entities, tasks, 5)).toEqual([]);
  });
});

describe('getEntityWorkloadDistribution', () => {
  test('returns workload stats for all entities', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', complexity: 3 }),
      createTestTask({ id: 'task-2', assignee: 'entity-a', complexity: 2 }),
      createTestTask({ id: 'task-3', assignee: 'entity-b', complexity: 5 }),
    ];

    const distribution = getEntityWorkloadDistribution(entities, tasks);
    expect(distribution.get('entity-a')).toEqual({
      entityName: 'Alice',
      taskCount: 2,
      totalComplexity: 5,
    });
    expect(distribution.get('entity-b')).toEqual({
      entityName: 'Bob',
      taskCount: 1,
      totalComplexity: 5,
    });
  });

  test('includes entities with no tasks', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
    ];
    const tasks: TaskLike[] = [];

    const distribution = getEntityWorkloadDistribution(entities, tasks);
    expect(distribution.get('entity-a')).toEqual({
      entityName: 'Alice',
      taskCount: 0,
      totalComplexity: 0,
    });
  });
});

describe('findLeastBusyEntity', () => {
  test('returns entity with fewest tasks', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
      createTestEntity({ id: 'entity-c' as ElementId, name: 'Charlie' }),
    ];
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a' }),
      createTestTask({ id: 'task-3', assignee: 'entity-b' }),
    ];

    const result = findLeastBusyEntity(entities, tasks);
    expect(result?.name).toBe('Charlie');
  });

  test('returns first entity when all have same task count', () => {
    const entities = [
      createTestEntity({ id: 'entity-a' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'entity-b' as ElementId, name: 'Bob' }),
    ];
    const tasks: TaskLike[] = [];

    const result = findLeastBusyEntity(entities, tasks);
    expect(result?.name).toBe('Alice');
  });

  test('returns undefined for empty entities array', () => {
    expect(findLeastBusyEntity([], [])).toBeUndefined();
  });
});

describe('getTaskCoworkers', () => {
  test('returns entities that share task involvement', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', owner: 'entity-b', createdBy: 'entity-c' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a', createdBy: 'entity-d' }),
      createTestTask({ id: 'task-3', createdBy: 'entity-a', assignee: 'entity-e' }),
    ];

    const coworkers = getTaskCoworkers(tasks, 'entity-a');
    expect(coworkers.sort()).toEqual(['entity-b', 'entity-c', 'entity-d', 'entity-e']);
  });

  test('does not include the entity itself', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', owner: 'entity-a', createdBy: 'entity-a' }),
    ];

    const coworkers = getTaskCoworkers(tasks, 'entity-a');
    expect(coworkers).toEqual([]);
  });

  test('returns empty array when entity not involved in any tasks', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-b', createdBy: 'entity-c' }),
    ];

    expect(getTaskCoworkers(tasks, 'entity-a')).toEqual([]);
  });

  test('returns unique coworkers across multiple tasks', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', owner: 'entity-b', createdBy: 'entity-c' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a', owner: 'entity-b', createdBy: 'entity-c' }),
    ];

    const coworkers = getTaskCoworkers(tasks, 'entity-a');
    expect(coworkers.sort()).toEqual(['entity-b', 'entity-c']);
  });
});

describe('countTaskCoworkers', () => {
  test('counts unique coworkers', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', owner: 'entity-b', createdBy: 'entity-c' }),
      createTestTask({ id: 'task-2', assignee: 'entity-a', createdBy: 'entity-d' }),
    ];

    expect(countTaskCoworkers(tasks, 'entity-a')).toBe(3);
  });

  test('returns 0 when no coworkers', () => {
    const tasks: TaskLike[] = [
      createTestTask({ id: 'task-1', assignee: 'entity-a', createdBy: 'entity-a' }),
    ];

    expect(countTaskCoworkers(tasks, 'entity-a')).toBe(0);
  });
});

// ============================================================================
// Management Hierarchy (reportsTo) Tests
// ============================================================================

// Helper to create entities with reportsTo
function createTestEntityWithManager(id: string, name: string, reportsTo?: string): Entity {
  return {
    id: id as ElementId,
    type: ElementType.ENTITY,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    name,
    entityType: EntityTypeValue.HUMAN,
    ...(reportsTo && { reportsTo: reportsTo as EntityId }),
  };
}

describe('detectReportingCycle', () => {
  test('detects self-reference as a cycle', () => {
    const entityId = 'el-alice' as EntityId;
    const getEntity = (): Entity | null => null;

    const result = detectReportingCycle(entityId, entityId, getEntity);

    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toEqual([entityId, entityId]);
  });

  test('detects no cycle when manager has no reportsTo', () => {
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const bob = createTestEntityWithManager('el-bob', 'bob');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-bob') return bob;
      return null;
    };

    const result = detectReportingCycle(
      'el-alice' as EntityId,
      'el-bob' as EntityId,
      getEntity
    );

    expect(result.hasCycle).toBe(false);
    expect(result.cyclePath).toBeUndefined();
  });

  test('detects cycle when proposed manager reports to the entity', () => {
    // Alice wants to report to Bob, but Bob already reports to Alice
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const bob = createTestEntityWithManager('el-bob', 'bob', 'el-alice');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      if (id === 'el-bob') return bob;
      return null;
    };

    const result = detectReportingCycle(
      'el-alice' as EntityId,
      'el-bob' as EntityId,
      getEntity
    );

    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toContain('el-alice');
    expect(result.cyclePath).toContain('el-bob');
  });

  test('detects cycle in longer chain', () => {
    // Alice -> Bob -> Carol -> (proposing Carol reports to Alice creates cycle)
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const bob = createTestEntityWithManager('el-bob', 'bob', 'el-alice');
    const carol = createTestEntityWithManager('el-carol', 'carol', 'el-bob');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      if (id === 'el-bob') return bob;
      if (id === 'el-carol') return carol;
      return null;
    };

    // If Carol tries to set Alice as manager, it would create: Alice -> Bob -> Carol -> Alice
    const result = detectReportingCycle(
      'el-alice' as EntityId,
      'el-carol' as EntityId,
      getEntity
    );

    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath?.length).toBeGreaterThan(2);
  });

  test('returns no cycle when manager chain does not include the entity', () => {
    // Dave wants to report to Carol, Carol -> Bob -> Alice (no cycle)
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const bob = createTestEntityWithManager('el-bob', 'bob', 'el-alice');
    const carol = createTestEntityWithManager('el-carol', 'carol', 'el-bob');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      if (id === 'el-bob') return bob;
      if (id === 'el-carol') return carol;
      return null;
    };

    const result = detectReportingCycle(
      'el-dave' as EntityId,
      'el-carol' as EntityId,
      getEntity
    );

    expect(result.hasCycle).toBe(false);
  });

  test('handles missing entities gracefully', () => {
    const getEntity = (): Entity | null => null;

    const result = detectReportingCycle(
      'el-alice' as EntityId,
      'el-nonexistent' as EntityId,
      getEntity
    );

    expect(result.hasCycle).toBe(false);
  });
});

describe('validateManager', () => {
  test('rejects self-reference', () => {
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      return null;
    };

    const result = validateManager('el-alice' as EntityId, 'el-alice' as EntityId, getEntity);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('SELF_REFERENCE');
    expect(result.errorMessage).toContain('cannot report to itself');
  });

  test('rejects non-existent manager', () => {
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      return null;
    };

    const result = validateManager('el-alice' as EntityId, 'el-nonexistent' as EntityId, getEntity);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('ENTITY_NOT_FOUND');
    expect(result.errorMessage).toContain('not found');
  });

  test('rejects deactivated manager', () => {
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const bob: Entity = {
      ...createTestEntityWithManager('el-bob', 'bob'),
      metadata: { active: false, deactivatedAt: '2025-01-22T10:00:00.000Z' },
    };

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      if (id === 'el-bob') return bob;
      return null;
    };

    const result = validateManager('el-alice' as EntityId, 'el-bob' as EntityId, getEntity);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('ENTITY_DEACTIVATED');
    expect(result.errorMessage).toContain('deactivated');
  });

  test('rejects cycle', () => {
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const bob = createTestEntityWithManager('el-bob', 'bob', 'el-alice');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      if (id === 'el-bob') return bob;
      return null;
    };

    const result = validateManager('el-alice' as EntityId, 'el-bob' as EntityId, getEntity);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('CYCLE_DETECTED');
    expect(result.cyclePath).toBeDefined();
  });

  test('accepts valid manager assignment', () => {
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const bob = createTestEntityWithManager('el-bob', 'bob');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-alice') return alice;
      if (id === 'el-bob') return bob;
      return null;
    };

    const result = validateManager('el-alice' as EntityId, 'el-bob' as EntityId, getEntity);

    expect(result.valid).toBe(true);
    expect(result.errorCode).toBeUndefined();
    expect(result.errorMessage).toBeUndefined();
  });
});

describe('getManagementChain', () => {
  test('returns empty array when entity has no manager', () => {
    const alice = createTestEntityWithManager('el-alice', 'alice');
    const getEntity = (): Entity | null => null;

    const chain = getManagementChain(alice, getEntity);

    expect(chain).toEqual([]);
  });

  test('returns single manager when one level up', () => {
    const bob = createTestEntityWithManager('el-bob', 'bob');
    const alice = createTestEntityWithManager('el-alice', 'alice', 'el-bob');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-bob') return bob;
      return null;
    };

    const chain = getManagementChain(alice, getEntity);

    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe('el-bob');
  });

  test('returns full chain in order from direct manager to root', () => {
    const ceo = createTestEntityWithManager('el-ceo', 'ceo');
    const vp = createTestEntityWithManager('el-vp', 'vp', 'el-ceo');
    const manager = createTestEntityWithManager('el-manager', 'manager', 'el-vp');
    const employee = createTestEntityWithManager('el-employee', 'employee', 'el-manager');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-ceo') return ceo;
      if (id === 'el-vp') return vp;
      if (id === 'el-manager') return manager;
      return null;
    };

    const chain = getManagementChain(employee, getEntity);

    expect(chain).toHaveLength(3);
    expect(chain[0].name).toBe('manager');
    expect(chain[1].name).toBe('vp');
    expect(chain[2].name).toBe('ceo');
  });

  test('handles missing entities in chain gracefully', () => {
    const manager = createTestEntityWithManager('el-manager', 'manager', 'el-missing');
    const employee = createTestEntityWithManager('el-employee', 'employee', 'el-manager');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-manager') return manager;
      return null;
    };

    const chain = getManagementChain(employee, getEntity);

    expect(chain).toHaveLength(1);
    expect(chain[0].name).toBe('manager');
  });
});

describe('getDirectReports', () => {
  test('returns empty array when no one reports to entity', () => {
    const entities = [
      createTestEntityWithManager('el-alice', 'alice'),
      createTestEntityWithManager('el-bob', 'bob'),
    ];

    const reports = getDirectReports(entities, 'el-carol' as EntityId);

    expect(reports).toEqual([]);
  });

  test('returns entities that report to the manager', () => {
    const entities = [
      createTestEntityWithManager('el-manager', 'manager'),
      createTestEntityWithManager('el-alice', 'alice', 'el-manager'),
      createTestEntityWithManager('el-bob', 'bob', 'el-manager'),
      createTestEntityWithManager('el-carol', 'carol'),
    ];

    const reports = getDirectReports(entities, 'el-manager' as EntityId);

    expect(reports).toHaveLength(2);
    expect(reports.map((e) => e.name).sort()).toEqual(['alice', 'bob']);
  });

  test('returns only direct reports, not indirect ones', () => {
    const entities = [
      createTestEntityWithManager('el-ceo', 'ceo'),
      createTestEntityWithManager('el-manager', 'manager', 'el-ceo'),
      createTestEntityWithManager('el-employee', 'employee', 'el-manager'),
    ];

    const reports = getDirectReports(entities, 'el-ceo' as EntityId);

    expect(reports).toHaveLength(1);
    expect(reports[0].name).toBe('manager');
  });
});

describe('buildOrgChart', () => {
  test('returns empty array when no entities', () => {
    const chart = buildOrgChart([]);

    expect(chart).toEqual([]);
  });

  test('returns all root entities when no rootId specified', () => {
    const entities = [
      createTestEntityWithManager('el-ceo1', 'ceo1'),
      createTestEntityWithManager('el-ceo2', 'ceo2'),
      createTestEntityWithManager('el-employee', 'employee', 'el-ceo1'),
    ];

    const chart = buildOrgChart(entities);

    expect(chart).toHaveLength(2);
    expect(chart.map((n) => n.entity.name).sort()).toEqual(['ceo1', 'ceo2']);
  });

  test('returns specific subtree when rootId specified', () => {
    const entities = [
      createTestEntityWithManager('el-ceo', 'ceo'),
      createTestEntityWithManager('el-vp', 'vp', 'el-ceo'),
      createTestEntityWithManager('el-manager', 'manager', 'el-vp'),
    ];

    const chart = buildOrgChart(entities, 'el-vp' as EntityId);

    expect(chart).toHaveLength(1);
    expect(chart[0].entity.name).toBe('vp');
    expect(chart[0].directReports).toHaveLength(1);
    expect(chart[0].directReports[0].entity.name).toBe('manager');
  });

  test('builds nested hierarchy correctly', () => {
    const entities = [
      createTestEntityWithManager('el-ceo', 'ceo'),
      createTestEntityWithManager('el-vp1', 'vp1', 'el-ceo'),
      createTestEntityWithManager('el-vp2', 'vp2', 'el-ceo'),
      createTestEntityWithManager('el-mgr1', 'mgr1', 'el-vp1'),
      createTestEntityWithManager('el-mgr2', 'mgr2', 'el-vp1'),
      createTestEntityWithManager('el-emp1', 'emp1', 'el-mgr1'),
    ];

    const chart = buildOrgChart(entities, 'el-ceo' as EntityId);

    expect(chart).toHaveLength(1);
    expect(chart[0].entity.name).toBe('ceo');
    expect(chart[0].directReports).toHaveLength(2);

    const vp1 = chart[0].directReports.find((n) => n.entity.name === 'vp1');
    expect(vp1?.directReports).toHaveLength(2);

    const mgr1 = vp1?.directReports.find((n) => n.entity.name === 'mgr1');
    expect(mgr1?.directReports).toHaveLength(1);
    expect(mgr1?.directReports[0].entity.name).toBe('emp1');
  });

  test('returns empty array when rootId not found', () => {
    const entities = [
      createTestEntityWithManager('el-alice', 'alice'),
    ];

    const chart = buildOrgChart(entities, 'el-nonexistent' as EntityId);

    expect(chart).toEqual([]);
  });
});

describe('hasDirectReports', () => {
  test('returns true when entity has direct reports', () => {
    const entities = [
      createTestEntityWithManager('el-manager', 'manager'),
      createTestEntityWithManager('el-employee', 'employee', 'el-manager'),
    ];

    expect(hasDirectReports(entities, 'el-manager' as EntityId)).toBe(true);
  });

  test('returns false when entity has no direct reports', () => {
    const entities = [
      createTestEntityWithManager('el-manager', 'manager'),
      createTestEntityWithManager('el-employee', 'employee'),
    ];

    expect(hasDirectReports(entities, 'el-manager' as EntityId)).toBe(false);
  });
});

describe('countDirectReports', () => {
  test('counts direct reports correctly', () => {
    const entities = [
      createTestEntityWithManager('el-manager', 'manager'),
      createTestEntityWithManager('el-emp1', 'emp1', 'el-manager'),
      createTestEntityWithManager('el-emp2', 'emp2', 'el-manager'),
      createTestEntityWithManager('el-emp3', 'emp3', 'el-manager'),
    ];

    expect(countDirectReports(entities, 'el-manager' as EntityId)).toBe(3);
  });

  test('returns 0 when no direct reports', () => {
    const entities = [
      createTestEntityWithManager('el-manager', 'manager'),
    ];

    expect(countDirectReports(entities, 'el-manager' as EntityId)).toBe(0);
  });
});

describe('getAllReports', () => {
  test('returns all reports recursively', () => {
    const entities = [
      createTestEntityWithManager('el-ceo', 'ceo'),
      createTestEntityWithManager('el-vp', 'vp', 'el-ceo'),
      createTestEntityWithManager('el-manager', 'manager', 'el-vp'),
      createTestEntityWithManager('el-employee', 'employee', 'el-manager'),
    ];

    const reports = getAllReports(entities, 'el-ceo' as EntityId);

    expect(reports).toHaveLength(3);
    expect(reports.map((e) => e.name).sort()).toEqual(['employee', 'manager', 'vp']);
  });

  test('returns empty array when no reports', () => {
    const entities = [
      createTestEntityWithManager('el-alice', 'alice'),
      createTestEntityWithManager('el-bob', 'bob'),
    ];

    const reports = getAllReports(entities, 'el-alice' as EntityId);

    expect(reports).toEqual([]);
  });
});

describe('getRootManager', () => {
  test('returns null when entity has no manager', () => {
    const entity = createTestEntityWithManager('el-alice', 'alice');
    const getEntity = (): Entity | null => null;

    const root = getRootManager(entity, getEntity);

    expect(root).toBeNull();
  });

  test('returns the root of the management chain', () => {
    const ceo = createTestEntityWithManager('el-ceo', 'ceo');
    const vp = createTestEntityWithManager('el-vp', 'vp', 'el-ceo');
    const manager = createTestEntityWithManager('el-manager', 'manager', 'el-vp');
    const employee = createTestEntityWithManager('el-employee', 'employee', 'el-manager');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-ceo') return ceo;
      if (id === 'el-vp') return vp;
      if (id === 'el-manager') return manager;
      return null;
    };

    const root = getRootManager(employee, getEntity);

    expect(root).not.toBeNull();
    expect(root?.name).toBe('ceo');
  });
});

describe('isManagerOf', () => {
  test('returns true when manager is in report chain', () => {
    const ceo = createTestEntityWithManager('el-ceo', 'ceo');
    const manager = createTestEntityWithManager('el-manager', 'manager', 'el-ceo');
    const employee = createTestEntityWithManager('el-employee', 'employee', 'el-manager');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-ceo') return ceo;
      if (id === 'el-manager') return manager;
      if (id === 'el-employee') return employee;
      return null;
    };

    expect(isManagerOf('el-ceo' as EntityId, 'el-employee' as EntityId, getEntity)).toBe(true);
    expect(isManagerOf('el-manager' as EntityId, 'el-employee' as EntityId, getEntity)).toBe(true);
  });

  test('returns false when not in management chain', () => {
    const ceo = createTestEntityWithManager('el-ceo', 'ceo');
    const employee = createTestEntityWithManager('el-employee', 'employee');

    const getEntity = (id: EntityId): Entity | null => {
      if (id === 'el-ceo') return ceo;
      if (id === 'el-employee') return employee;
      return null;
    };

    expect(isManagerOf('el-ceo' as EntityId, 'el-employee' as EntityId, getEntity)).toBe(false);
  });

  test('returns false when report entity not found', () => {
    const getEntity = (): Entity | null => null;

    expect(isManagerOf('el-ceo' as EntityId, 'el-nonexistent' as EntityId, getEntity)).toBe(false);
  });
});

describe('getRootEntities', () => {
  test('returns entities with no manager', () => {
    const entities = [
      createTestEntityWithManager('el-ceo', 'ceo'),
      createTestEntityWithManager('el-manager', 'manager', 'el-ceo'),
      createTestEntityWithManager('el-freelancer', 'freelancer'),
    ];

    const roots = getRootEntities(entities);

    expect(roots).toHaveLength(2);
    expect(roots.map((e) => e.name).sort()).toEqual(['ceo', 'freelancer']);
  });

  test('returns all entities when none have managers', () => {
    const entities = [
      createTestEntityWithManager('el-alice', 'alice'),
      createTestEntityWithManager('el-bob', 'bob'),
    ];

    const roots = getRootEntities(entities);

    expect(roots).toHaveLength(2);
  });
});

describe('getEntitiesWithManager', () => {
  test('returns entities that have a manager', () => {
    const entities = [
      createTestEntityWithManager('el-ceo', 'ceo'),
      createTestEntityWithManager('el-manager', 'manager', 'el-ceo'),
      createTestEntityWithManager('el-employee', 'employee', 'el-manager'),
    ];

    const withManager = getEntitiesWithManager(entities);

    expect(withManager).toHaveLength(2);
    expect(withManager.map((e) => e.name).sort()).toEqual(['employee', 'manager']);
  });

  test('returns empty array when no one has a manager', () => {
    const entities = [
      createTestEntityWithManager('el-alice', 'alice'),
      createTestEntityWithManager('el-bob', 'bob'),
    ];

    const withManager = getEntitiesWithManager(entities);

    expect(withManager).toEqual([]);
  });
});

describe('createEntity with reportsTo', () => {
  test('creates entity with reportsTo', async () => {
    const entity = await createEntity({
      name: 'employee',
      entityType: EntityTypeValue.HUMAN,
      createdBy: 'el-system' as EntityId,
      reportsTo: 'el-manager' as EntityId,
    });

    expect(entity.reportsTo).toBe('el-manager');
  });

  test('creates entity without reportsTo when not specified', async () => {
    const entity = await createEntity({
      name: 'independent',
      entityType: EntityTypeValue.HUMAN,
      createdBy: 'el-system' as EntityId,
    });

    expect(entity.reportsTo).toBeUndefined();
  });
});

describe('updateEntity with reportsTo', () => {
  test('sets reportsTo when provided', () => {
    const entity = createTestEntityWithManager('el-alice', 'alice');

    const updated = updateEntity(entity, { reportsTo: 'el-manager' as EntityId });

    expect(updated.reportsTo).toBe('el-manager');
  });

  test('clears reportsTo when set to null', () => {
    const entity = createTestEntityWithManager('el-alice', 'alice', 'el-manager');

    const updated = updateEntity(entity, { reportsTo: null });

    expect(updated.reportsTo).toBeUndefined();
  });

  test('keeps existing reportsTo when not specified', () => {
    const entity = createTestEntityWithManager('el-alice', 'alice', 'el-manager');

    const updated = updateEntity(entity, { tags: ['new-tag'] });

    expect(updated.reportsTo).toBe('el-manager');
  });

  test('keeps no reportsTo when entity has none and not specified', () => {
    const entity = createTestEntityWithManager('el-alice', 'alice');

    const updated = updateEntity(entity, { tags: ['new-tag'] });

    expect(updated.reportsTo).toBeUndefined();
  });
});
