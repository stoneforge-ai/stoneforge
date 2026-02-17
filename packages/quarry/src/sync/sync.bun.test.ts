import { describe, expect, test, beforeEach } from 'bun:test';
import {
  // Types
  MergeResolution,
  TombstoneStatus,
  ELEMENT_TYPE_PRIORITY,
  getTypePriority,
  HASH_EXCLUDED_FIELDS,
  // Serialization
  serializeElement,
  serializeDependency,
  parseElement,
  parseDependency,
  tryParseElement,
  tryParseDependency,
  serializeElements,
  serializeDependencies,
  parseElements,
  parseDependencies,
  sortElementsForExport,
  sortDependenciesForExport,
  isSerializedElement,
  isSerializedDependency,
  // Content Hashing
  computeContentHash,
  computeContentHashSync,
  hasSameContentHash,
  matchesContentHash,
  // Merge Strategy
  mergeElements,
  mergeTags,
  mergeDependencies,
  getTombstoneStatus,
} from './index.js';
import type { Element, ElementId, EntityId, Timestamp, Dependency } from '@stoneforge/core';
import { ElementType, DependencyType, ValidationError } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.TASK,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    ...overrides,
  };
}

function createTestTask(overrides: Partial<Element> & Record<string, unknown> = {}): Element {
  return {
    id: 'el-task1' as ElementId,
    type: ElementType.TASK,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    title: 'Test Task',
    status: 'open',
    priority: 3,
    complexity: 3,
    taskType: 'task',
    ...overrides,
  } as Element;
}

function createTestDependency(overrides: Partial<Dependency> = {}): Dependency {
  return {
    blockedId: 'el-target' as ElementId,
    blockerId: 'el-source' as ElementId,
    type: DependencyType.BLOCKS,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// Types Tests
// ============================================================================

describe('Types', () => {
  describe('ELEMENT_TYPE_PRIORITY', () => {
    test('entity has lowest priority (exported first)', () => {
      expect(ELEMENT_TYPE_PRIORITY['entity']).toBe(0);
    });

    test('document has second priority', () => {
      expect(ELEMENT_TYPE_PRIORITY['document']).toBe(1);
    });

    test('task has third priority', () => {
      expect(ELEMENT_TYPE_PRIORITY['task']).toBe(2);
    });

    test('all types have defined priorities', () => {
      expect(ELEMENT_TYPE_PRIORITY['message']).toBeDefined();
      expect(ELEMENT_TYPE_PRIORITY['channel']).toBeDefined();
      expect(ELEMENT_TYPE_PRIORITY['plan']).toBeDefined();
      expect(ELEMENT_TYPE_PRIORITY['workflow']).toBeDefined();
      expect(ELEMENT_TYPE_PRIORITY['playbook']).toBeDefined();
      expect(ELEMENT_TYPE_PRIORITY['library']).toBeDefined();
      expect(ELEMENT_TYPE_PRIORITY['team']).toBeDefined();
    });
  });

  describe('getTypePriority', () => {
    test('returns correct priority for known types', () => {
      expect(getTypePriority('entity')).toBe(0);
      expect(getTypePriority('task')).toBe(2);
    });

    test('returns 100 for unknown types', () => {
      expect(getTypePriority('unknown')).toBe(100);
      expect(getTypePriority('custom')).toBe(100);
    });
  });

  describe('HASH_EXCLUDED_FIELDS', () => {
    test('excludes identity fields', () => {
      expect(HASH_EXCLUDED_FIELDS).toContain('id');
      expect(HASH_EXCLUDED_FIELDS).toContain('createdBy');
    });

    test('excludes timestamp fields', () => {
      expect(HASH_EXCLUDED_FIELDS).toContain('createdAt');
      expect(HASH_EXCLUDED_FIELDS).toContain('updatedAt');
    });

    test('excludes contentHash itself', () => {
      expect(HASH_EXCLUDED_FIELDS).toContain('contentHash');
    });
  });

  describe('MergeResolution', () => {
    test('has all expected values', () => {
      expect(MergeResolution.LOCAL_WINS).toBe('local_wins');
      expect(MergeResolution.REMOTE_WINS).toBe('remote_wins');
      expect(MergeResolution.IDENTICAL).toBe('identical');
      expect(MergeResolution.TAGS_MERGED).toBe('tags_merged');
    });
  });

  describe('TombstoneStatus', () => {
    test('has all expected values', () => {
      expect(TombstoneStatus.LIVE).toBe('live');
      expect(TombstoneStatus.FRESH).toBe('fresh');
      expect(TombstoneStatus.EXPIRED).toBe('expired');
    });
  });
});

// ============================================================================
// Serialization Tests
// ============================================================================

describe('Serialization', () => {
  describe('serializeElement', () => {
    test('serializes valid element to JSON string', () => {
      const element = createTestElement();
      const json = serializeElement(element);
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    test('includes all element fields', () => {
      const element = createTestElement({
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' },
      });
      const json = serializeElement(element);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe(element.id);
      expect(parsed.type).toBe(element.type);
      expect(parsed.createdAt).toBe(element.createdAt);
      expect(parsed.updatedAt).toBe(element.updatedAt);
      expect(parsed.createdBy).toBe(element.createdBy);
      expect(parsed.tags).toEqual(['tag1', 'tag2']);
      expect(parsed.metadata).toEqual({ key: 'value' });
    });

    test('handles type-specific fields', () => {
      const task = createTestTask();
      const json = serializeElement(task);
      const parsed = JSON.parse(json);

      expect(parsed.title).toBe('Test Task');
      expect(parsed.status).toBe('open');
    });

    test('throws for invalid element', () => {
      const invalid = { not: 'an element' };
      expect(() => serializeElement(invalid as Element)).toThrow(ValidationError);
    });
  });

  describe('parseElement', () => {
    test('parses valid JSON into element', () => {
      const element = createTestElement();
      const json = serializeElement(element);
      const parsed = parseElement(json);

      expect(parsed.id).toBe(element.id);
      expect(parsed.type).toBe(element.type);
    });

    test('throws for empty line', () => {
      expect(() => parseElement('')).toThrow(ValidationError);
      expect(() => parseElement('   ')).toThrow(ValidationError);
    });

    test('throws for invalid JSON', () => {
      expect(() => parseElement('not json')).toThrow(ValidationError);
      expect(() => parseElement('{ invalid }')).toThrow(ValidationError);
    });

    test('throws for invalid element structure', () => {
      expect(() => parseElement('{"not": "element"}')).toThrow(ValidationError);
    });
  });

  describe('tryParseElement', () => {
    test('returns element for valid JSON', () => {
      const element = createTestElement();
      const json = serializeElement(element);
      const result = tryParseElement(json);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(element.id);
    });

    test('returns null for invalid input', () => {
      expect(tryParseElement('')).toBeNull();
      expect(tryParseElement('not json')).toBeNull();
      expect(tryParseElement('{"invalid": true}')).toBeNull();
    });
  });

  describe('serializeDependency', () => {
    test('serializes valid dependency to JSON string', () => {
      const dep = createTestDependency();
      const json = serializeDependency(dep);
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    test('includes all dependency fields', () => {
      const dep = createTestDependency();
      const json = serializeDependency(dep);
      const parsed = JSON.parse(json);

      expect(parsed.blockedId).toBe(dep.blockedId);
      expect(parsed.blockerId).toBe(dep.blockerId);
      expect(parsed.type).toBe(dep.type);
      expect(parsed.createdAt).toBe(dep.createdAt);
      expect(parsed.createdBy).toBe(dep.createdBy);
    });

    test('omits empty metadata', () => {
      const dep = createTestDependency({ metadata: {} });
      const json = serializeDependency(dep);
      const parsed = JSON.parse(json);
      expect(parsed.metadata).toBeUndefined();
    });

    test('includes non-empty metadata', () => {
      const dep = createTestDependency({ metadata: { key: 'value' } });
      const json = serializeDependency(dep);
      const parsed = JSON.parse(json);
      expect(parsed.metadata).toEqual({ key: 'value' });
    });
  });

  describe('parseDependency', () => {
    test('parses valid JSON into dependency', () => {
      const dep = createTestDependency();
      const json = serializeDependency(dep);
      const parsed = parseDependency(json);

      expect(parsed.blockedId).toBe(dep.blockedId);
      expect(parsed.blockerId).toBe(dep.blockerId);
      expect(parsed.type).toBe(dep.type);
    });

    test('defaults metadata to empty object', () => {
      const json = JSON.stringify({
        blockedId: 'el-target',
        blockerId: 'el-source',
        type: 'blocks',
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: 'el-system1',
      });
      const parsed = parseDependency(json);
      expect(parsed.metadata).toEqual({});
    });

    test('throws for empty line', () => {
      expect(() => parseDependency('')).toThrow(ValidationError);
    });

    test('throws for invalid JSON', () => {
      expect(() => parseDependency('not json')).toThrow(ValidationError);
    });
  });

  describe('tryParseDependency', () => {
    test('returns dependency for valid JSON', () => {
      const dep = createTestDependency();
      const json = serializeDependency(dep);
      const result = tryParseDependency(json);
      expect(result).not.toBeNull();
      expect(result?.blockedId).toBe(dep.blockedId);
    });

    test('returns null for invalid input', () => {
      expect(tryParseDependency('')).toBeNull();
      expect(tryParseDependency('not json')).toBeNull();
    });
  });

  describe('serializeElements', () => {
    test('serializes multiple elements to JSONL', () => {
      const elements = [
        createTestElement({ id: 'el-1' as ElementId }),
        createTestElement({ id: 'el-2' as ElementId }),
      ];
      const jsonl = serializeElements(elements);
      const lines = jsonl.split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).id).toBe('el-1');
      expect(JSON.parse(lines[1]).id).toBe('el-2');
    });

    test('handles empty array', () => {
      const jsonl = serializeElements([]);
      expect(jsonl).toBe('');
    });
  });

  describe('serializeDependencies', () => {
    test('serializes multiple dependencies to JSONL', () => {
      const deps = [
        createTestDependency({ blockerId: 'el-1' as ElementId }),
        createTestDependency({ blockerId: 'el-2' as ElementId }),
      ];
      const jsonl = serializeDependencies(deps);
      const lines = jsonl.split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).blockerId).toBe('el-1');
      expect(JSON.parse(lines[1]).blockerId).toBe('el-2');
    });
  });

  describe('parseElements', () => {
    test('parses JSONL content into elements', () => {
      const elements = [
        createTestElement({ id: 'el-1' as ElementId }),
        createTestElement({ id: 'el-2' as ElementId }),
      ];
      const jsonl = serializeElements(elements);
      const { elements: parsed, errors } = parseElements(jsonl);

      expect(parsed).toHaveLength(2);
      expect(errors).toHaveLength(0);
      expect(parsed[0].id).toBe('el-1');
      expect(parsed[1].id).toBe('el-2');
    });

    test('collects errors for invalid lines', () => {
      const jsonl = `${serializeElement(createTestElement())}
invalid line
{"not": "element"}`;
      const { elements, errors } = parseElements(jsonl);

      expect(elements).toHaveLength(1);
      expect(errors).toHaveLength(2);
      expect(errors[0].line).toBe(2);
      expect(errors[1].line).toBe(3);
    });

    test('ignores empty lines', () => {
      const jsonl = `${serializeElement(createTestElement())}

${serializeElement(createTestElement({ id: 'el-2' as ElementId }))}`;
      const { elements, errors } = parseElements(jsonl);

      expect(elements).toHaveLength(2);
      expect(errors).toHaveLength(0);
    });
  });

  describe('parseDependencies', () => {
    test('parses JSONL content into dependencies', () => {
      const deps = [
        createTestDependency({ blockerId: 'el-1' as ElementId }),
        createTestDependency({ blockerId: 'el-2' as ElementId }),
      ];
      const jsonl = serializeDependencies(deps);
      const { dependencies: parsed, errors } = parseDependencies(jsonl);

      expect(parsed).toHaveLength(2);
      expect(errors).toHaveLength(0);
    });

    test('collects errors for invalid lines', () => {
      const jsonl = `${serializeDependency(createTestDependency())}
invalid`;
      const { dependencies, errors } = parseDependencies(jsonl);

      expect(dependencies).toHaveLength(1);
      expect(errors).toHaveLength(1);
    });
  });

  describe('sortElementsForExport', () => {
    test('sorts entities first', () => {
      const elements = [
        createTestElement({ id: 'el-task1' as ElementId, type: ElementType.TASK }),
        createTestElement({ id: 'el-entity1' as ElementId, type: ElementType.ENTITY }),
        createTestElement({ id: 'el-doc1' as ElementId, type: ElementType.DOCUMENT }),
      ];
      const sorted = sortElementsForExport(elements);

      expect(sorted[0].type).toBe(ElementType.ENTITY);
      expect(sorted[1].type).toBe(ElementType.DOCUMENT);
      expect(sorted[2].type).toBe(ElementType.TASK);
    });

    test('sorts by createdAt within same type', () => {
      const elements = [
        createTestElement({
          id: 'el-task2' as ElementId,
          createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
        }),
        createTestElement({
          id: 'el-task1' as ElementId,
          createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        }),
      ];
      const sorted = sortElementsForExport(elements);

      expect(sorted[0].id).toBe('el-task1');
      expect(sorted[1].id).toBe('el-task2');
    });

    test('sorts by ID for stability when all else equal', () => {
      const elements = [
        createTestElement({ id: 'el-b' as ElementId }),
        createTestElement({ id: 'el-a' as ElementId }),
      ];
      const sorted = sortElementsForExport(elements);

      expect(sorted[0].id).toBe('el-a');
      expect(sorted[1].id).toBe('el-b');
    });

    test('does not modify original array', () => {
      const elements = [
        createTestElement({ id: 'el-b' as ElementId }),
        createTestElement({ id: 'el-a' as ElementId }),
      ];
      const original = [...elements];
      sortElementsForExport(elements);

      expect(elements).toEqual(original);
    });
  });

  describe('sortDependenciesForExport', () => {
    test('sorts by createdAt', () => {
      const deps = [
        createTestDependency({ createdAt: '2025-01-22T12:00:00.000Z' as Timestamp }),
        createTestDependency({ createdAt: '2025-01-22T10:00:00.000Z' as Timestamp }),
      ];
      const sorted = sortDependenciesForExport(deps);

      expect(sorted[0].createdAt).toBe('2025-01-22T10:00:00.000Z');
    });

    test('sorts by blockedId when createdAt equal', () => {
      const deps = [
        createTestDependency({ blockedId: 'el-b' as ElementId }),
        createTestDependency({ blockedId: 'el-a' as ElementId }),
      ];
      const sorted = sortDependenciesForExport(deps);

      expect(sorted[0].blockedId).toBe('el-a');
    });
  });

  describe('isSerializedElement', () => {
    test('returns true for valid serialized element', () => {
      const element = createTestElement();
      const json = JSON.parse(serializeElement(element));
      expect(isSerializedElement(json)).toBe(true);
    });

    test('returns false for non-objects', () => {
      expect(isSerializedElement(null)).toBe(false);
      expect(isSerializedElement(undefined)).toBe(false);
      expect(isSerializedElement('string')).toBe(false);
      expect(isSerializedElement(123)).toBe(false);
    });

    test('returns false for objects missing required fields', () => {
      expect(isSerializedElement({})).toBe(false);
      expect(isSerializedElement({ id: 'el-1' })).toBe(false);
    });
  });

  describe('isSerializedDependency', () => {
    test('returns true for valid serialized dependency', () => {
      const dep = createTestDependency();
      const json = JSON.parse(serializeDependency(dep));
      expect(isSerializedDependency(json)).toBe(true);
    });

    test('returns false for non-objects', () => {
      expect(isSerializedDependency(null)).toBe(false);
      expect(isSerializedDependency('string')).toBe(false);
    });

    test('returns false for objects missing required fields', () => {
      expect(isSerializedDependency({})).toBe(false);
      expect(isSerializedDependency({ blockedId: 'el-1' })).toBe(false);
    });
  });
});

// ============================================================================
// Content Hashing Tests
// ============================================================================

describe('Content Hashing', () => {
  describe('computeContentHashSync', () => {
    test('returns hash and fields', () => {
      const element = createTestElement();
      const result = computeContentHashSync(element);

      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBe(64); // SHA256 hex is 64 chars
      expect(result.fields).toBeInstanceOf(Array);
    });

    test('excludes identity fields from hash', () => {
      const result = computeContentHashSync(createTestElement());
      expect(result.fields).not.toContain('id');
      expect(result.fields).not.toContain('createdAt');
      expect(result.fields).not.toContain('updatedAt');
      expect(result.fields).not.toContain('createdBy');
    });

    test('includes content fields in hash', () => {
      const result = computeContentHashSync(createTestElement());
      expect(result.fields).toContain('type');
      expect(result.fields).toContain('tags');
      expect(result.fields).toContain('metadata');
    });

    test('same content produces same hash', () => {
      const element1 = createTestElement({ tags: ['a', 'b'] });
      const element2 = createTestElement({ tags: ['a', 'b'] });

      const hash1 = computeContentHashSync(element1);
      const hash2 = computeContentHashSync(element2);

      expect(hash1.hash).toBe(hash2.hash);
    });

    test('different content produces different hash', () => {
      const element1 = createTestElement({ tags: ['a'] });
      const element2 = createTestElement({ tags: ['b'] });

      const hash1 = computeContentHashSync(element1);
      const hash2 = computeContentHashSync(element2);

      expect(hash1.hash).not.toBe(hash2.hash);
    });

    test('different identity fields produce same hash', () => {
      const element1 = createTestElement({
        id: 'el-1' as ElementId,
        createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      });
      const element2 = createTestElement({
        id: 'el-2' as ElementId,
        createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
      });

      const hash1 = computeContentHashSync(element1);
      const hash2 = computeContentHashSync(element2);

      expect(hash1.hash).toBe(hash2.hash);
    });

    test('hash is deterministic with sorted keys', () => {
      const element1 = createTestElement({ metadata: { a: 1, b: 2 } });
      const element2 = createTestElement({ metadata: { b: 2, a: 1 } });

      const hash1 = computeContentHashSync(element1);
      const hash2 = computeContentHashSync(element2);

      expect(hash1.hash).toBe(hash2.hash);
    });
  });

  describe('computeContentHash', () => {
    test('returns same result as sync version', async () => {
      const element = createTestElement({ tags: ['test'] });
      const syncResult = computeContentHashSync(element);
      const asyncResult = await computeContentHash(element);

      expect(asyncResult.hash).toBe(syncResult.hash);
      expect(asyncResult.fields).toEqual(syncResult.fields);
    });
  });

  describe('hasSameContentHash', () => {
    test('returns true for identical content', () => {
      const element1 = createTestElement({ tags: ['a'] });
      const element2 = createTestElement({ tags: ['a'] });
      expect(hasSameContentHash(element1, element2)).toBe(true);
    });

    test('returns false for different content', () => {
      const element1 = createTestElement({ tags: ['a'] });
      const element2 = createTestElement({ tags: ['b'] });
      expect(hasSameContentHash(element1, element2)).toBe(false);
    });
  });

  describe('matchesContentHash', () => {
    test('returns true when hash matches', () => {
      const element = createTestElement();
      const { hash } = computeContentHashSync(element);
      expect(matchesContentHash(element, hash)).toBe(true);
    });

    test('returns false when hash does not match', () => {
      const element = createTestElement();
      expect(matchesContentHash(element, 'wrong-hash')).toBe(false);
    });
  });
});

// ============================================================================
// Merge Strategy Tests
// ============================================================================

describe('Merge Strategy', () => {
  describe('getTombstoneStatus', () => {
    const ttl = 30 * 24 * 60 * 60 * 1000; // 30 days

    test('returns LIVE for element without deletedAt', () => {
      const element = createTestElement();
      expect(getTombstoneStatus(element, ttl)).toBe(TombstoneStatus.LIVE);
    });

    test('returns FRESH for recently deleted element', () => {
      const deletedAt = new Date().toISOString();
      const element = createTestTask({ deletedAt } as Record<string, unknown>);
      expect(getTombstoneStatus(element, ttl)).toBe(TombstoneStatus.FRESH);
    });

    test('returns EXPIRED for old tombstone', () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const element = createTestTask({ deletedAt: oldDate } as Record<string, unknown>);
      expect(getTombstoneStatus(element, ttl)).toBe(TombstoneStatus.EXPIRED);
    });
  });

  describe('mergeTags', () => {
    test('combines unique tags from both arrays', () => {
      const merged = mergeTags(['a', 'b'], ['b', 'c']);
      expect(merged).toEqual(['a', 'b', 'c']);
    });

    test('handles empty arrays', () => {
      expect(mergeTags([], ['a'])).toEqual(['a']);
      expect(mergeTags(['a'], [])).toEqual(['a']);
      expect(mergeTags([], [])).toEqual([]);
    });

    test('removes duplicates', () => {
      const merged = mergeTags(['a', 'b', 'a'], ['b', 'c']);
      expect(merged).toEqual(['a', 'b', 'c']);
    });

    test('returns sorted array', () => {
      const merged = mergeTags(['z', 'a'], ['m']);
      expect(merged).toEqual(['a', 'm', 'z']);
    });
  });

  describe('mergeElements', () => {
    test('returns IDENTICAL for same content', () => {
      const element = createTestElement({ tags: ['test'] });
      const result = mergeElements(element, element);

      expect(result.resolution).toBe(MergeResolution.IDENTICAL);
      expect(result.localModified).toBe(false);
      expect(result.conflict).toBeUndefined();
    });

    test('applies LWW - later timestamp wins', () => {
      const local = createTestElement({
        id: 'el-1' as ElementId,
        updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        tags: ['local'],
      });
      const remote = createTestElement({
        id: 'el-1' as ElementId,
        updatedAt: '2025-01-22T12:00:00.000Z' as Timestamp,
        tags: ['remote'],
      });

      const result = mergeElements(local, remote);

      expect(result.resolution).toBe(MergeResolution.TAGS_MERGED);
      expect(result.localModified).toBe(true);
    });

    test('local wins when timestamps equal', () => {
      const local = createTestElement({
        id: 'el-1' as ElementId,
        tags: ['local'],
      });
      const remote = createTestElement({
        id: 'el-1' as ElementId,
        tags: ['remote'],
      });

      const result = mergeElements(local, remote);

      // Tags should be merged
      expect(result.element.tags).toContain('local');
      expect(result.element.tags).toContain('remote');
    });

    test('merges tags from both versions', () => {
      const local = createTestElement({
        id: 'el-1' as ElementId,
        updatedAt: '2025-01-22T12:00:00.000Z' as Timestamp,
        tags: ['a', 'b'],
      });
      const remote = createTestElement({
        id: 'el-1' as ElementId,
        updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
        tags: ['b', 'c'],
      });

      const result = mergeElements(local, remote);

      expect(result.element.tags).toContain('a');
      expect(result.element.tags).toContain('b');
      expect(result.element.tags).toContain('c');
    });

    test('closed status wins over open', () => {
      const local = createTestTask({
        id: 'el-1' as ElementId,
        status: 'closed',
        updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      });
      const remote = createTestTask({
        id: 'el-1' as ElementId,
        status: 'open',
        updatedAt: '2025-01-22T12:00:00.000Z' as Timestamp,
      });

      const result = mergeElements(local, remote);

      expect(result.resolution).toBe(MergeResolution.LOCAL_WINS);
      expect((result.element as unknown as Record<string, unknown>).status).toBe('closed');
    });

    test('fresh tombstone wins over live', () => {
      const deletedAt = new Date().toISOString();
      const local = createTestTask({
        id: 'el-1' as ElementId,
        deletedAt,
        status: 'tombstone',
      });
      const remote = createTestTask({
        id: 'el-1' as ElementId,
        status: 'open',
        updatedAt: '2025-01-22T12:00:00.000Z' as Timestamp,
      });

      const result = mergeElements(local, remote);

      expect(result.resolution).toBe(MergeResolution.LOCAL_WINS);
    });

    test('live wins over expired tombstone', () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const local = createTestTask({
        id: 'el-1' as ElementId,
        deletedAt: oldDate,
        status: 'tombstone',
      });
      const remote = createTestTask({
        id: 'el-1' as ElementId,
        status: 'open',
      });

      const result = mergeElements(local, remote);

      expect(result.resolution).toBe(MergeResolution.REMOTE_WINS);
    });

    test('creates conflict record for conflicts', () => {
      const local = createTestElement({
        id: 'el-1' as ElementId,
        tags: ['local'],
      });
      const remote = createTestElement({
        id: 'el-1' as ElementId,
        tags: ['remote'],
      });

      const result = mergeElements(local, remote);

      expect(result.conflict).toBeDefined();
      expect(result.conflict?.elementId).toBe('el-1');
      expect(result.conflict?.localHash).toBeDefined();
      expect(result.conflict?.remoteHash).toBeDefined();
      expect(result.conflict?.resolvedAt).toBeDefined();
    });
  });

  describe('mergeDependencies', () => {
    test('keeps dependencies present in both', () => {
      const dep = createTestDependency();
      const result = mergeDependencies([dep], [dep]);

      expect(result.keep).toHaveLength(1);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    test('adds new dependencies from remote', () => {
      const localDep = createTestDependency({ blockerId: 'el-1' as ElementId });
      const remoteDep = createTestDependency({ blockerId: 'el-2' as ElementId });

      const result = mergeDependencies([localDep], [localDep, remoteDep]);

      expect(result.keep).toHaveLength(2);
      expect(result.added).toHaveLength(1);
      expect(result.added[0].blockerId).toBe('el-2');
    });

    test('removes dependencies removed by remote when original exists', () => {
      const dep = createTestDependency();
      // Original had the dep, local has it, remote removed it
      const result = mergeDependencies([dep], [], [dep]);

      expect(result.keep).toHaveLength(0);
      expect(result.removed).toHaveLength(1);
    });

    test('keeps new local dependencies', () => {
      const dep = createTestDependency();
      // No original, local has it, remote doesn't
      const result = mergeDependencies([dep], []);

      expect(result.keep).toHaveLength(1);
    });

    test('creates conflict records', () => {
      const dep = createTestDependency();
      const result = mergeDependencies([], [dep]);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].resolution).toBe('added');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  test('round-trip serialization preserves element data', () => {
    const original = createTestTask();
    const json = serializeElement(original);
    const parsed = parseElement(json);

    expect(parsed.id).toBe(original.id);
    expect(parsed.type).toBe(original.type);
    expect(parsed.createdAt).toBe(original.createdAt);
    expect(parsed.tags).toEqual(original.tags);
  });

  test('round-trip serialization preserves dependency data', () => {
    const original = createTestDependency({ metadata: { key: 'value' } });
    const json = serializeDependency(original);
    const parsed = parseDependency(json);

    expect(parsed.blockedId).toBe(original.blockedId);
    expect(parsed.blockerId).toBe(original.blockerId);
    expect(parsed.type).toBe(original.type);
    expect(parsed.metadata).toEqual(original.metadata);
  });

  test('content hash is stable across serialization', () => {
    const element = createTestElement({ tags: ['test'] });
    const hash1 = computeContentHashSync(element);

    const json = serializeElement(element);
    const parsed = parseElement(json);
    const hash2 = computeContentHashSync(parsed);

    expect(hash1.hash).toBe(hash2.hash);
  });

  test('merge with export/import workflow', () => {
    // Simulate sync workflow
    const localElement = createTestElement({
      id: 'el-shared' as ElementId,
      tags: ['local-tag'],
      updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    });

    const remoteElement = createTestElement({
      id: 'el-shared' as ElementId,
      tags: ['remote-tag'],
      updatedAt: '2025-01-22T12:00:00.000Z' as Timestamp,
    });

    // Export local
    const localJson = serializeElement(localElement);

    // Import remote and merge
    const importedRemote = parseElement(serializeElement(remoteElement));
    const localFromJson = parseElement(localJson);

    const mergeResult = mergeElements(localFromJson, importedRemote);

    // Should merge tags from both
    expect(mergeResult.element.tags).toContain('local-tag');
    expect(mergeResult.element.tags).toContain('remote-tag');
  });
});
