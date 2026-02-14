import { describe, expect, test } from 'bun:test';
import type { EntityId } from '../types/element.js';
import {
  // Constants
  ID_PREFIX,
  BASE36_CHARS,
  MIN_HASH_LENGTH,
  MAX_HASH_LENGTH,
  MAX_HIERARCHY_DEPTH,
  MAX_NONCE,
  ROOT_ID_PATTERN,
  HIERARCHICAL_ID_PATTERN,

  // Validation
  isValidIdFormat,
  isValidRootId,
  isValidHierarchicalId,
  validateIdFormat,

  // Parsing
  parseId,
  getIdRoot,
  getIdParent,
  getIdDepth,

  // Hash utilities
  sha256,
  toBase36,
  truncateHash,

  // ID Generation
  generateIdHash,
  generateId,
  generateChildId,

  // Length calculation
  calculateIdLength,

  // Metrics and Logging
  DefaultIdMetricsCollector,
  ConsoleIdLogger,
  type IdMetricsEvent,
  type IdMetricsSnapshot,
  type IdGeneratorLogger,
  type IdLogLevel,
} from './generator.js';
import { ValidationError, ConstraintError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  test('ID_PREFIX is el', () => {
    expect(ID_PREFIX).toBe('el');
  });

  test('BASE36_CHARS contains 36 characters', () => {
    expect(BASE36_CHARS).toHaveLength(36);
    expect(BASE36_CHARS).toBe('0123456789abcdefghijklmnopqrstuvwxyz');
  });

  test('hash length bounds are valid', () => {
    expect(MIN_HASH_LENGTH).toBe(3);
    expect(MAX_HASH_LENGTH).toBe(8);
    expect(MIN_HASH_LENGTH).toBeLessThan(MAX_HASH_LENGTH);
  });

  test('MAX_HIERARCHY_DEPTH is 3', () => {
    expect(MAX_HIERARCHY_DEPTH).toBe(3);
  });

  test('MAX_NONCE is 9', () => {
    expect(MAX_NONCE).toBe(9);
  });
});

// ============================================================================
// Regex Pattern Tests
// ============================================================================

describe('ROOT_ID_PATTERN', () => {
  test('matches valid root IDs', () => {
    expect(ROOT_ID_PATTERN.test('el-abc')).toBe(true);
    expect(ROOT_ID_PATTERN.test('el-a1b2c3')).toBe(true);
    expect(ROOT_ID_PATTERN.test('el-12345678')).toBe(true);
    expect(ROOT_ID_PATTERN.test('el-000')).toBe(true);
    expect(ROOT_ID_PATTERN.test('el-zzz')).toBe(true);
  });

  test('rejects IDs with wrong prefix', () => {
    expect(ROOT_ID_PATTERN.test('id-abc')).toBe(false);
    expect(ROOT_ID_PATTERN.test('abc')).toBe(false);
    expect(ROOT_ID_PATTERN.test('EL-abc')).toBe(false);
  });

  test('rejects IDs with invalid hash length', () => {
    expect(ROOT_ID_PATTERN.test('el-ab')).toBe(false); // Too short
    expect(ROOT_ID_PATTERN.test('el-123456789')).toBe(false); // Too long
  });

  test('rejects IDs with invalid characters', () => {
    expect(ROOT_ID_PATTERN.test('el-ABC')).toBe(false); // Uppercase
    expect(ROOT_ID_PATTERN.test('el-ab_c')).toBe(false); // Underscore
    expect(ROOT_ID_PATTERN.test('el-ab-c')).toBe(false); // Extra hyphen
  });

  test('rejects hierarchical IDs', () => {
    expect(ROOT_ID_PATTERN.test('el-abc.1')).toBe(false);
  });
});

describe('HIERARCHICAL_ID_PATTERN', () => {
  test('matches valid hierarchical IDs', () => {
    expect(HIERARCHICAL_ID_PATTERN.test('el-abc.1')).toBe(true);
    expect(HIERARCHICAL_ID_PATTERN.test('el-abc.1.2')).toBe(true);
    expect(HIERARCHICAL_ID_PATTERN.test('el-abc.1.2.3')).toBe(true);
    expect(HIERARCHICAL_ID_PATTERN.test('el-12345678.999')).toBe(true);
  });

  test('rejects root IDs', () => {
    expect(HIERARCHICAL_ID_PATTERN.test('el-abc')).toBe(false);
  });

  test('rejects IDs with too many segments', () => {
    expect(HIERARCHICAL_ID_PATTERN.test('el-abc.1.2.3.4')).toBe(false);
  });

  test('rejects IDs with non-numeric segments', () => {
    expect(HIERARCHICAL_ID_PATTERN.test('el-abc.a')).toBe(false);
    expect(HIERARCHICAL_ID_PATTERN.test('el-abc.1.x')).toBe(false);
  });
});

// ============================================================================
// Validation Function Tests
// ============================================================================

describe('isValidIdFormat', () => {
  test('accepts valid root IDs', () => {
    expect(isValidIdFormat('el-abc123')).toBe(true);
    expect(isValidIdFormat('el-zzz')).toBe(true);
  });

  test('accepts valid hierarchical IDs', () => {
    expect(isValidIdFormat('el-abc.1')).toBe(true);
    expect(isValidIdFormat('el-abc.1.2.3')).toBe(true);
  });

  test('rejects non-strings', () => {
    expect(isValidIdFormat(null)).toBe(false);
    expect(isValidIdFormat(undefined)).toBe(false);
    expect(isValidIdFormat(123)).toBe(false);
    expect(isValidIdFormat({})).toBe(false);
    expect(isValidIdFormat(['el-abc'])).toBe(false);
  });

  test('rejects invalid formats', () => {
    expect(isValidIdFormat('')).toBe(false);
    expect(isValidIdFormat('abc')).toBe(false);
    expect(isValidIdFormat('el-')).toBe(false);
    expect(isValidIdFormat('el-ab')).toBe(false);
  });
});

describe('isValidRootId', () => {
  test('accepts only root IDs', () => {
    expect(isValidRootId('el-abc123')).toBe(true);
    expect(isValidRootId('el-abc.1')).toBe(false);
  });
});

describe('isValidHierarchicalId', () => {
  test('accepts only hierarchical IDs', () => {
    expect(isValidHierarchicalId('el-abc.1')).toBe(true);
    expect(isValidHierarchicalId('el-abc123')).toBe(false);
  });
});

describe('validateIdFormat', () => {
  test('returns valid ID', () => {
    expect(validateIdFormat('el-abc123')).toBe('el-abc123');
    expect(validateIdFormat('el-abc.1.2')).toBe('el-abc.1.2');
  });

  test('throws ValidationError for invalid ID', () => {
    expect(() => validateIdFormat('invalid')).toThrow(ValidationError);
    try {
      validateIdFormat('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
      expect(err.details.value).toBe('invalid');
    }
  });

  test('throws for non-strings', () => {
    expect(() => validateIdFormat(null)).toThrow(ValidationError);
    expect(() => validateIdFormat(123)).toThrow(ValidationError);
  });
});

// ============================================================================
// Parsing Function Tests
// ============================================================================

describe('parseId', () => {
  test('parses root ID', () => {
    const parsed = parseId('el-abc123');
    expect(parsed.full).toBe('el-abc123');
    expect(parsed.prefix).toBe('el');
    expect(parsed.hash).toBe('abc123');
    expect(parsed.segments).toEqual([]);
    expect(parsed.depth).toBe(0);
    expect(parsed.isRoot).toBe(true);
  });

  test('parses single-level hierarchical ID', () => {
    const parsed = parseId('el-abc.1');
    expect(parsed.full).toBe('el-abc.1');
    expect(parsed.prefix).toBe('el');
    expect(parsed.hash).toBe('abc');
    expect(parsed.segments).toEqual([1]);
    expect(parsed.depth).toBe(1);
    expect(parsed.isRoot).toBe(false);
  });

  test('parses multi-level hierarchical ID', () => {
    const parsed = parseId('el-xyz.1.2.3');
    expect(parsed.full).toBe('el-xyz.1.2.3');
    expect(parsed.hash).toBe('xyz');
    expect(parsed.segments).toEqual([1, 2, 3]);
    expect(parsed.depth).toBe(3);
  });

  test('throws for invalid ID', () => {
    expect(() => parseId('invalid')).toThrow(ValidationError);
  });
});

describe('getIdRoot', () => {
  test('returns root for root ID', () => {
    expect(getIdRoot('el-abc123')).toBe('el-abc123');
  });

  test('extracts root from hierarchical ID', () => {
    expect(getIdRoot('el-abc.1')).toBe('el-abc');
    expect(getIdRoot('el-abc.1.2.3')).toBe('el-abc');
  });
});

describe('getIdParent', () => {
  test('returns null for root ID', () => {
    expect(getIdParent('el-abc123')).toBeNull();
  });

  test('returns root for first-level child', () => {
    expect(getIdParent('el-abc.1')).toBe('el-abc');
  });

  test('returns parent for deeper children', () => {
    expect(getIdParent('el-abc.1.2')).toBe('el-abc.1');
    expect(getIdParent('el-abc.1.2.3')).toBe('el-abc.1.2');
  });
});

describe('getIdDepth', () => {
  test('returns 0 for root', () => {
    expect(getIdDepth('el-abc123')).toBe(0);
  });

  test('returns correct depth for hierarchical IDs', () => {
    expect(getIdDepth('el-abc.1')).toBe(1);
    expect(getIdDepth('el-abc.1.2')).toBe(2);
    expect(getIdDepth('el-abc.1.2.3')).toBe(3);
  });
});

// ============================================================================
// Hash Utility Tests
// ============================================================================

describe('sha256', () => {
  test('produces 32-byte hash', async () => {
    const result = await sha256('test input');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(32);
  });

  test('produces consistent hash for same input', async () => {
    const hash1 = await sha256('hello world');
    const hash2 = await sha256('hello world');
    expect(hash1).toEqual(hash2);
  });

  test('produces different hash for different input', async () => {
    const hash1 = await sha256('input 1');
    const hash2 = await sha256('input 2');
    expect(hash1).not.toEqual(hash2);
  });

  test('handles empty string', async () => {
    const result = await sha256('');
    expect(result.length).toBe(32);
  });

  test('handles unicode characters', async () => {
    const result = await sha256('日本語テスト 🎉');
    expect(result.length).toBe(32);
  });
});

describe('toBase36', () => {
  test('converts zero bytes to 0', () => {
    expect(toBase36(new Uint8Array([0]))).toBe('0');
  });

  test('converts small numbers correctly', () => {
    // 10 in decimal = 'a' in base36
    expect(toBase36(new Uint8Array([10]))).toBe('a');
    // 35 in decimal = 'z' in base36
    expect(toBase36(new Uint8Array([35]))).toBe('z');
    // 36 in decimal = '10' in base36
    expect(toBase36(new Uint8Array([36]))).toBe('10');
  });

  test('converts larger byte arrays', () => {
    // 256 in decimal = '74' in base36 (7*36 + 4 = 256)
    expect(toBase36(new Uint8Array([1, 0]))).toBe('74');
  });

  test('produces only base36 characters', () => {
    const result = toBase36(new Uint8Array([255, 255, 255, 255]));
    expect(result).toMatch(/^[0-9a-z]+$/);
  });

  test('produces consistent results', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(toBase36(bytes)).toBe(toBase36(bytes));
  });
});

describe('truncateHash', () => {
  test('truncates to specified length', () => {
    expect(truncateHash('abcdefghij', 5)).toBe('abcde');
  });

  test('clamps to minimum length', () => {
    expect(truncateHash('abcdefghij', 1)).toBe('abc');
    expect(truncateHash('abcdefghij', 2)).toBe('abc');
  });

  test('clamps to maximum length', () => {
    expect(truncateHash('abcdefghijklmnop', 10)).toBe('abcdefgh');
    expect(truncateHash('abcdefghijklmnop', 100)).toBe('abcdefgh');
  });

  test('handles exact length input', () => {
    expect(truncateHash('abc', 3)).toBe('abc');
  });
});

// ============================================================================
// Adaptive Length Tests
// ============================================================================

describe('calculateIdLength', () => {
  test('returns 3 for small databases', () => {
    expect(calculateIdLength(0)).toBe(3);
    expect(calculateIdLength(50)).toBe(3);
    expect(calculateIdLength(99)).toBe(3);
  });

  test('returns 4 for medium-small databases', () => {
    expect(calculateIdLength(100)).toBe(4);
    expect(calculateIdLength(400)).toBe(4);
  });

  test('returns 5 for medium databases', () => {
    expect(calculateIdLength(500)).toBe(5);
    expect(calculateIdLength(2000)).toBe(5);
  });

  test('returns 6 for larger databases', () => {
    expect(calculateIdLength(3000)).toBe(6);
    expect(calculateIdLength(15000)).toBe(6);
  });

  test('returns 7 for large databases', () => {
    expect(calculateIdLength(20000)).toBe(7);
    expect(calculateIdLength(80000)).toBe(7);
  });

  test('returns 8 for very large databases', () => {
    expect(calculateIdLength(100000)).toBe(8);
    expect(calculateIdLength(1000000)).toBe(8);
  });
});

// ============================================================================
// ID Generation Tests
// ============================================================================

describe('generateIdHash', () => {
  test('generates base36 hash', async () => {
    const hash = await generateIdHash({
      identifier: 'Test Task',
      createdBy: 'el-user1' as EntityId,
      timestampNs: BigInt(1000000000),
      nonce: 0,
    });
    expect(hash).toMatch(/^[0-9a-z]+$/);
  });

  test('generates consistent hash for same input', async () => {
    const components = {
      identifier: 'Test',
      createdBy: 'el-user1' as EntityId,
      timestampNs: BigInt(12345),
      nonce: 0,
    };
    const hash1 = await generateIdHash(components);
    const hash2 = await generateIdHash(components);
    expect(hash1).toBe(hash2);
  });

  test('generates different hash for different identifier', async () => {
    const base = {
      createdBy: 'el-user1' as EntityId,
      timestampNs: BigInt(12345),
      nonce: 0,
    };
    const hash1 = await generateIdHash({ ...base, identifier: 'Task A' });
    const hash2 = await generateIdHash({ ...base, identifier: 'Task B' });
    expect(hash1).not.toBe(hash2);
  });

  test('generates different hash for different createdBy', async () => {
    const base = {
      identifier: 'Task',
      timestampNs: BigInt(12345),
      nonce: 0,
    };
    const hash1 = await generateIdHash({ ...base, createdBy: 'el-user1' as EntityId });
    const hash2 = await generateIdHash({ ...base, createdBy: 'el-user2' as EntityId });
    expect(hash1).not.toBe(hash2);
  });

  test('generates different hash for different timestamp', async () => {
    const base = {
      identifier: 'Task',
      createdBy: 'el-user1' as EntityId,
      nonce: 0,
    };
    const hash1 = await generateIdHash({ ...base, timestampNs: BigInt(1000) });
    const hash2 = await generateIdHash({ ...base, timestampNs: BigInt(2000) });
    expect(hash1).not.toBe(hash2);
  });

  test('generates different hash for different nonce', async () => {
    const base = {
      identifier: 'Task',
      createdBy: 'el-user1' as EntityId,
      timestampNs: BigInt(12345),
    };
    const hash1 = await generateIdHash({ ...base, nonce: 0 });
    const hash2 = await generateIdHash({ ...base, nonce: 1 });
    expect(hash1).not.toBe(hash2);
  });
});

describe('generateId', () => {
  const testEntityId = 'el-user1' as EntityId;

  test('generates valid ID', async () => {
    const id = await generateId({
      identifier: 'Test Task',
      createdBy: testEntityId,
    });
    expect(isValidIdFormat(id)).toBe(true);
    expect(id.startsWith('el-')).toBe(true);
  });

  test('uses specified hash length', async () => {
    const id = await generateId(
      { identifier: 'Test', createdBy: testEntityId },
      { hashLength: 6 }
    );
    const parsed = parseId(id);
    expect(parsed.hash.length).toBe(6);
  });

  test('generates different IDs for different identifiers', async () => {
    const timestamp = new Date('2025-01-01T00:00:00Z');
    const id1 = await generateId({ identifier: 'Task A', createdBy: testEntityId, timestamp });
    const id2 = await generateId({ identifier: 'Task B', createdBy: testEntityId, timestamp });
    expect(id1).not.toBe(id2);
  });

  test('generates different IDs for different creators', async () => {
    const timestamp = new Date('2025-01-01T00:00:00Z');
    const id1 = await generateId({
      identifier: 'Task',
      createdBy: 'el-user1' as EntityId,
      timestamp,
    });
    const id2 = await generateId({
      identifier: 'Task',
      createdBy: 'el-user2' as EntityId,
      timestamp,
    });
    expect(id1).not.toBe(id2);
  });

  test('calculates length from element count', async () => {
    const id = await generateId(
      { identifier: 'Test', createdBy: testEntityId },
      { elementCount: 10000 }
    );
    const parsed = parseId(id);
    expect(parsed.hash.length).toBe(6); // 10000 elements -> length 6
  });

  test('handles collision with nonce increment', async () => {
    const existingIds = new Set<string>();
    let callCount = 0;

    const id = await generateId(
      { identifier: 'Test', createdBy: testEntityId, timestamp: new Date('2025-01-01') },
      {
        hashLength: 4,
        checkCollision: (id) => {
          callCount++;
          if (callCount === 1) {
            existingIds.add(id);
            return true; // First ID collides
          }
          return existingIds.has(id);
        },
      }
    );

    expect(isValidIdFormat(id)).toBe(true);
    expect(callCount).toBeGreaterThan(1);
  });

  test('handles collision with length increase', async () => {
    let callCount = 0;
    const collidingHashes = new Set<string>();

    const id = await generateId(
      { identifier: 'Test', createdBy: testEntityId, timestamp: new Date('2025-01-01') },
      {
        hashLength: 3,
        checkCollision: (testId) => {
          callCount++;
          const parsed = parseId(testId);
          // Collide all length-3 hashes, succeed on length-4
          if (parsed.hash.length === 3) {
            collidingHashes.add(testId);
            return true;
          }
          return false;
        },
      }
    );

    expect(isValidIdFormat(id)).toBe(true);
    const parsed = parseId(id);
    expect(parsed.hash.length).toBeGreaterThan(3);
  });
});

describe('generateChildId', () => {
  test('generates valid child ID', () => {
    const childId = generateChildId('el-abc123', 1);
    expect(childId as string).toBe('el-abc123.1');
    expect(isValidIdFormat(childId)).toBe(true);
  });

  test('generates grandchild ID', () => {
    const childId = generateChildId('el-abc.1', 2);
    expect(childId as string).toBe('el-abc.1.2');
  });

  test('generates great-grandchild ID', () => {
    const childId = generateChildId('el-abc.1.2', 3);
    expect(childId as string).toBe('el-abc.1.2.3');
  });

  test('throws for depth limit exceeded', () => {
    expect(() => generateChildId('el-abc.1.2.3', 4)).toThrow(ConstraintError);
    try {
      generateChildId('el-abc.1.2.3', 4);
    } catch (e) {
      const err = e as ConstraintError;
      expect(err.code).toBe(ErrorCode.MAX_DEPTH_EXCEEDED);
      expect(err.details.currentDepth).toBe(3);
      expect(err.details.maxDepth).toBe(3);
    }
  });

  test('throws for invalid parent ID', () => {
    expect(() => generateChildId('invalid', 1)).toThrow(ValidationError);
  });

  test('throws for non-positive child number', () => {
    expect(() => generateChildId('el-abc', 0)).toThrow(ValidationError);
    expect(() => generateChildId('el-abc', -1)).toThrow(ValidationError);
  });

  test('throws for non-integer child number', () => {
    expect(() => generateChildId('el-abc', 1.5)).toThrow(ValidationError);
    expect(() => generateChildId('el-abc', NaN)).toThrow(ValidationError);
  });

  test('handles large child numbers', () => {
    const childId = generateChildId('el-abc', 999999);
    expect(childId as string).toBe('el-abc.999999');
    expect(isValidIdFormat(childId)).toBe(true);
  });
});

// ============================================================================
// Property-based Tests
// ============================================================================

describe('Property-based tests', () => {
  test('parseId is inverse of ID construction', () => {
    const testCases = [
      'el-abc',
      'el-12345678',
      'el-xyz.1',
      'el-xyz.1.2',
      'el-xyz.1.2.3',
    ];

    for (const id of testCases) {
      const parsed = parseId(id);
      const reconstructed = parsed.isRoot
        ? `${parsed.prefix}-${parsed.hash}`
        : `${parsed.prefix}-${parsed.hash}.${parsed.segments.join('.')}`;
      expect(reconstructed).toBe(id);
    }
  });

  test('getIdRoot returns valid root ID', () => {
    const testCases = [
      'el-abc123',
      'el-xyz.1',
      'el-xyz.1.2.3',
    ];

    for (const id of testCases) {
      const root = getIdRoot(id);
      expect(isValidRootId(root)).toBe(true);
    }
  });

  test('getIdParent returns valid ID or null', () => {
    const testCases = [
      { id: 'el-abc', expected: null },
      { id: 'el-abc.1', expected: 'el-abc' },
      { id: 'el-abc.1.2', expected: 'el-abc.1' },
    ];

    for (const { id, expected } of testCases) {
      const parent = getIdParent(id);
      expect(parent).toBe(expected);
      if (parent !== null) {
        expect(isValidIdFormat(parent)).toBe(true);
      }
    }
  });

  test('getIdDepth equals number of segments', () => {
    const testCases = [
      { id: 'el-abc', depth: 0 },
      { id: 'el-abc.1', depth: 1 },
      { id: 'el-abc.1.2', depth: 2 },
      { id: 'el-abc.1.2.3', depth: 3 },
    ];

    for (const { id, depth } of testCases) {
      expect(getIdDepth(id)).toBe(depth);
    }
  });

  test('generateChildId increments depth by 1', () => {
    const testCases = [
      { parent: 'el-abc', expectedDepth: 1 },
      { parent: 'el-abc.1', expectedDepth: 2 },
      { parent: 'el-abc.1.2', expectedDepth: 3 },
    ];

    for (const { parent, expectedDepth } of testCases) {
      const child = generateChildId(parent, 1);
      expect(getIdDepth(child)).toBe(expectedDepth);
    }
  });

  test('toBase36 only produces valid characters', async () => {
    // Generate some random-ish byte arrays
    const testInputs = [
      new Uint8Array([0]),
      new Uint8Array([255]),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]),
    ];

    for (const bytes of testInputs) {
      const result = toBase36(bytes);
      expect(result).toMatch(/^[0-9a-z]+$/);
    }
  });
});

// ============================================================================
// Edge Cases and Stress Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles empty identifier', async () => {
    const id = await generateId({
      identifier: '',
      createdBy: 'el-user1' as EntityId,
    });
    expect(isValidIdFormat(id)).toBe(true);
  });

  test('handles very long identifier', async () => {
    const longIdentifier = 'a'.repeat(10000);
    const id = await generateId({
      identifier: longIdentifier,
      createdBy: 'el-user1' as EntityId,
    });
    expect(isValidIdFormat(id)).toBe(true);
  });

  test('handles special characters in identifier', async () => {
    const id = await generateId({
      identifier: '日本語 🎉 <script>alert("xss")</script>',
      createdBy: 'el-user1' as EntityId,
    });
    expect(isValidIdFormat(id)).toBe(true);
  });

  test('handles boundary hash lengths', async () => {
    // Test minimum length
    const minId = await generateId(
      { identifier: 'test', createdBy: 'el-user1' as EntityId },
      { hashLength: MIN_HASH_LENGTH }
    );
    expect(parseId(minId).hash.length).toBe(MIN_HASH_LENGTH);

    // Test maximum length
    const maxId = await generateId(
      { identifier: 'test', createdBy: 'el-user1' as EntityId },
      { hashLength: MAX_HASH_LENGTH }
    );
    expect(parseId(maxId).hash.length).toBe(MAX_HASH_LENGTH);
  });

  test('maximum hierarchy depth is enforced', () => {
    // Build up to max depth
    let id = 'el-abc';
    for (let i = 1; i <= MAX_HIERARCHY_DEPTH; i++) {
      id = generateChildId(id, i);
    }
    expect(getIdDepth(id)).toBe(MAX_HIERARCHY_DEPTH);

    // Trying to add one more should fail
    expect(() => generateChildId(id, MAX_HIERARCHY_DEPTH + 1)).toThrow(ConstraintError);
  });
});

describe('Uniqueness tests', () => {
  test('generates unique IDs in rapid succession', async () => {
    const ids = new Set<string>();
    const count = 100;
    const entityId = 'el-user1' as EntityId;

    for (let i = 0; i < count; i++) {
      const id = await generateId({
        identifier: 'Rapid Test',
        createdBy: entityId,
      });
      ids.add(id);
    }

    // All IDs should be unique due to timestamp + nonce
    expect(ids.size).toBe(count);
  });

  test('different identifiers produce different IDs with same timestamp', async () => {
    const timestamp = new Date('2025-01-01T00:00:00.000Z');
    const entityId = 'el-user1' as EntityId;
    const ids = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const id = await generateId({
        identifier: `Task ${i}`,
        createdBy: entityId,
        timestamp,
      });
      ids.add(id);
    }

    expect(ids.size).toBe(50);
  });
});

// ============================================================================
// Collision Metrics Tests
// ============================================================================

describe('DefaultIdMetricsCollector', () => {
  test('initializes with zero counts', () => {
    const metrics = new DefaultIdMetricsCollector();
    const snapshot = metrics.getSnapshot();

    expect(snapshot.totalGenerations).toBe(0);
    expect(snapshot.successfulGenerations).toBe(0);
    expect(snapshot.failedGenerations).toBe(0);
    expect(snapshot.totalCollisions).toBe(0);
    expect(snapshot.nonceIncrements).toBe(0);
    expect(snapshot.lengthIncreases).toBe(0);
    expect(snapshot.avgGenerationTimeMs).toBe(0);
    expect(snapshot.maxGenerationTimeMs).toBe(0);
    expect(Object.keys(snapshot.collisionsByLength)).toHaveLength(0);
    expect(snapshot.startedAt instanceof Date).toBe(true);
    expect(snapshot.lastEventAt).toBeUndefined();
  });

  test('records generation_started event', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({
      type: 'generation_started',
      timestamp: new Date(),
      identifier: 'test',
      hashLength: 4,
    });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalGenerations).toBe(1);
    expect(snapshot.lastEventAt).toBeDefined();
  });

  test('records generation_completed event', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({
      type: 'generation_completed',
      timestamp: new Date(),
      id: 'el-test',
      durationMs: 5,
    });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.successfulGenerations).toBe(1);
    expect(snapshot.avgGenerationTimeMs).toBe(5);
    expect(snapshot.maxGenerationTimeMs).toBe(5);
  });

  test('records generation_failed event', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({
      type: 'generation_failed',
      timestamp: new Date(),
      durationMs: 100,
    });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.failedGenerations).toBe(1);
    expect(snapshot.avgGenerationTimeMs).toBe(100);
    expect(snapshot.maxGenerationTimeMs).toBe(100);
  });

  test('records collision_detected event', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({
      type: 'collision_detected',
      timestamp: new Date(),
      id: 'el-coll',
      hashLength: 4,
    });

    metrics.record({
      type: 'collision_detected',
      timestamp: new Date(),
      id: 'el-coll2',
      hashLength: 4,
    });

    metrics.record({
      type: 'collision_detected',
      timestamp: new Date(),
      id: 'el-coll3',
      hashLength: 5,
    });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalCollisions).toBe(3);
    expect(snapshot.collisionsByLength[4]).toBe(2);
    expect(snapshot.collisionsByLength[5]).toBe(1);
  });

  test('records nonce_increment event', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({ type: 'nonce_increment', timestamp: new Date() });
    metrics.record({ type: 'nonce_increment', timestamp: new Date() });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.nonceIncrements).toBe(2);
  });

  test('records length_increase event', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({ type: 'length_increase', timestamp: new Date() });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.lengthIncreases).toBe(1);
  });

  test('calculates average generation time correctly', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({ type: 'generation_completed', timestamp: new Date(), durationMs: 10 });
    metrics.record({ type: 'generation_completed', timestamp: new Date(), durationMs: 20 });
    metrics.record({ type: 'generation_failed', timestamp: new Date(), durationMs: 30 });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.avgGenerationTimeMs).toBe(20); // (10 + 20 + 30) / 3
    expect(snapshot.maxGenerationTimeMs).toBe(30);
  });

  test('reset clears all metrics', () => {
    const metrics = new DefaultIdMetricsCollector();

    metrics.record({ type: 'generation_started', timestamp: new Date() });
    metrics.record({ type: 'generation_completed', timestamp: new Date(), durationMs: 5 });
    metrics.record({ type: 'collision_detected', timestamp: new Date(), hashLength: 4 });

    metrics.reset();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalGenerations).toBe(0);
    expect(snapshot.successfulGenerations).toBe(0);
    expect(snapshot.totalCollisions).toBe(0);
    expect(Object.keys(snapshot.collisionsByLength)).toHaveLength(0);
    expect(snapshot.lastEventAt).toBeUndefined();
  });
});

describe('ConsoleIdLogger', () => {
  test('creates logger with default minLevel', () => {
    const logger = new ConsoleIdLogger();
    // Just verify it doesn't throw
    expect(logger).toBeDefined();
  });

  test('creates logger with custom minLevel', () => {
    const logger = new ConsoleIdLogger({ minLevel: 'warn' });
    expect(logger).toBeDefined();
  });

  test('log method accepts all log levels', () => {
    const logger = new ConsoleIdLogger({ minLevel: 'debug' });

    // These should not throw
    logger.log('debug', 'Debug message');
    logger.log('info', 'Info message');
    logger.log('warn', 'Warning message');
    logger.log('error', 'Error message');
  });

  test('log method accepts data parameter', () => {
    const logger = new ConsoleIdLogger({ minLevel: 'debug' });

    // Should not throw
    logger.log('info', 'Message with data', { key: 'value', number: 42 });
  });
});

describe('ID Generation with Metrics', () => {
  test('tracks successful generation', async () => {
    const metrics = new DefaultIdMetricsCollector();

    await generateId(
      { identifier: 'Test', createdBy: 'el-user1' as EntityId },
      { metrics }
    );

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalGenerations).toBe(1);
    expect(snapshot.successfulGenerations).toBe(1);
    expect(snapshot.failedGenerations).toBe(0);
    expect(snapshot.avgGenerationTimeMs).toBeGreaterThanOrEqual(0);
  });

  test('tracks collisions when they occur', async () => {
    const metrics = new DefaultIdMetricsCollector();
    const generatedIds = new Set<string>();
    let collisionCount = 0;

    // Create a collision checker that forces a collision on the first attempt
    const checkCollision = (id: string): boolean => {
      if (generatedIds.has(id)) {
        collisionCount++;
        return true;
      }
      // Force collision on first attempt
      if (generatedIds.size === 0) {
        generatedIds.add(id);
        collisionCount++;
        return true;
      }
      return false;
    };

    await generateId(
      { identifier: 'Test', createdBy: 'el-user1' as EntityId },
      { metrics, checkCollision }
    );

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalCollisions).toBe(1);
    expect(snapshot.nonceIncrements).toBeGreaterThanOrEqual(1);
  });

  test('tracks multiple generations', async () => {
    const metrics = new DefaultIdMetricsCollector();

    for (let i = 0; i < 5; i++) {
      await generateId(
        { identifier: `Test ${i}`, createdBy: 'el-user1' as EntityId },
        { metrics }
      );
    }

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalGenerations).toBe(5);
    expect(snapshot.successfulGenerations).toBe(5);
  });
});

describe('ID Generation with Logging', () => {
  test('calls logger for successful generation', async () => {
    const logMessages: { level: IdLogLevel; message: string; data?: Record<string, unknown> }[] = [];
    const logger: IdGeneratorLogger = {
      log(level, message, data) {
        logMessages.push({ level, message, data });
      },
    };

    await generateId(
      { identifier: 'Test', createdBy: 'el-user1' as EntityId },
      { logger }
    );

    expect(logMessages.length).toBeGreaterThan(0);
    expect(logMessages.some(m => m.message.includes('Starting ID generation'))).toBe(true);
    expect(logMessages.some(m => m.message.includes('generated'))).toBe(true);
  });

  test('calls logger for collision events', async () => {
    const logMessages: { level: IdLogLevel; message: string; data?: Record<string, unknown> }[] = [];
    const logger: IdGeneratorLogger = {
      log(level, message, data) {
        logMessages.push({ level, message, data });
      },
    };

    let firstCall = true;
    const checkCollision = (): boolean => {
      if (firstCall) {
        firstCall = false;
        return true; // Force one collision
      }
      return false;
    };

    await generateId(
      { identifier: 'Test', createdBy: 'el-user1' as EntityId },
      { logger, checkCollision }
    );

    expect(logMessages.some(m => m.message.includes('Collision detected'))).toBe(true);
    expect(logMessages.some(m => m.level === 'warn')).toBe(true);
  });
});

describe('ID Generation with Metrics and Logging Combined', () => {
  test('tracks metrics and logs simultaneously', async () => {
    const metrics = new DefaultIdMetricsCollector();
    const logMessages: string[] = [];
    const logger: IdGeneratorLogger = {
      log(_level, message) {
        logMessages.push(message);
      },
    };

    await generateId(
      { identifier: 'Combined Test', createdBy: 'el-user1' as EntityId },
      { metrics, logger }
    );

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalGenerations).toBe(1);
    expect(snapshot.successfulGenerations).toBe(1);
    expect(logMessages.length).toBeGreaterThan(0);
  });
});
