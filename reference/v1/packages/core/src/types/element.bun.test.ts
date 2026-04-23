import { describe, expect, test } from 'bun:test';
import {
  ElementId,
  EntityId,
  Timestamp,
  ElementType,
  Element,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_METADATA_SIZE,
  RESERVED_METADATA_PREFIX,
  isValidTimestamp,
  validateTimestamp,
  isValidTag,
  validateTag,
  isValidTags,
  validateTags,
  isValidMetadata,
  validateMetadata,
  isValidElementType,
  validateElementType,
  isElement,
  validateElement,
  createTimestamp,
  parseTimestamp,
  normalizeTags,
  addTag,
  removeTag,
  elementsEqual,
} from './element.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid element for testing
function createTestElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.TASK,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-entity1' as EntityId,
    tags: [],
    metadata: {},
    ...overrides,
  };
}

describe('ElementType', () => {
  test('contains all expected types', () => {
    expect(ElementType.TASK).toBe('task');
    expect(ElementType.MESSAGE).toBe('message');
    expect(ElementType.DOCUMENT).toBe('document');
    expect(ElementType.ENTITY).toBe('entity');
    expect(ElementType.PLAN).toBe('plan');
    expect(ElementType.WORKFLOW).toBe('workflow');
    expect(ElementType.PLAYBOOK).toBe('playbook');
    expect(ElementType.CHANNEL).toBe('channel');
    expect(ElementType.LIBRARY).toBe('library');
    expect(ElementType.TEAM).toBe('team');
  });

  test('has exactly 10 types', () => {
    expect(Object.keys(ElementType)).toHaveLength(10);
  });
});

describe('isValidTimestamp', () => {
  test('accepts valid ISO 8601 timestamps', () => {
    expect(isValidTimestamp('2025-01-22T10:00:00.000Z')).toBe(true);
    expect(isValidTimestamp('2025-01-22T10:00:00Z')).toBe(true);
    expect(isValidTimestamp('2000-12-31T23:59:59.999Z')).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(isValidTimestamp(null)).toBe(false);
    expect(isValidTimestamp(undefined)).toBe(false);
    expect(isValidTimestamp(123)).toBe(false);
    expect(isValidTimestamp({})).toBe(false);
    expect(isValidTimestamp(new Date())).toBe(false);
  });

  test('rejects invalid formats', () => {
    expect(isValidTimestamp('2025-01-22')).toBe(false);
    expect(isValidTimestamp('2025/01/22T10:00:00.000Z')).toBe(false);
    expect(isValidTimestamp('not-a-date')).toBe(false);
    expect(isValidTimestamp('')).toBe(false);
    expect(isValidTimestamp('2025-01-22T10:00:00')).toBe(false); // Missing Z
    expect(isValidTimestamp('2025-01-22T10:00:00+00:00')).toBe(false); // Wrong timezone format
  });

  test('rejects invalid dates', () => {
    expect(isValidTimestamp('2025-13-01T10:00:00.000Z')).toBe(false); // Month 13
    expect(isValidTimestamp('2025-02-30T10:00:00.000Z')).toBe(false); // Feb 30
  });
});

describe('validateTimestamp', () => {
  test('returns valid timestamp', () => {
    const ts = '2025-01-22T10:00:00.000Z';
    expect(validateTimestamp(ts, 'test')).toBe(ts);
  });

  test('throws ValidationError for invalid timestamp', () => {
    expect(() => validateTimestamp('invalid', 'testField')).toThrow(ValidationError);
    try {
      validateTimestamp('invalid', 'testField');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_TIMESTAMP);
      expect(err.details.field).toBe('testField');
    }
  });
});

describe('isValidTag', () => {
  test('accepts valid tags', () => {
    expect(isValidTag('simple')).toBe(true);
    expect(isValidTag('with-hyphen')).toBe(true);
    expect(isValidTag('with_underscore')).toBe(true);
    expect(isValidTag('with:colon')).toBe(true);
    expect(isValidTag('MixedCase123')).toBe(true);
    expect(isValidTag('a')).toBe(true); // Single character
  });

  test('rejects non-string values', () => {
    expect(isValidTag(null)).toBe(false);
    expect(isValidTag(undefined)).toBe(false);
    expect(isValidTag(123)).toBe(false);
    expect(isValidTag({})).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidTag('')).toBe(false);
  });

  test('rejects tags exceeding max length', () => {
    const longTag = 'a'.repeat(MAX_TAG_LENGTH + 1);
    expect(isValidTag(longTag)).toBe(false);
    expect(isValidTag('a'.repeat(MAX_TAG_LENGTH))).toBe(true);
  });

  test('rejects tags with whitespace', () => {
    expect(isValidTag(' leading')).toBe(false);
    expect(isValidTag('trailing ')).toBe(false);
    expect(isValidTag('with space')).toBe(false);
    expect(isValidTag('\ttab')).toBe(false);
  });

  test('rejects tags with invalid characters', () => {
    expect(isValidTag('with@symbol')).toBe(false);
    expect(isValidTag('with.dot')).toBe(false);
    expect(isValidTag('with/slash')).toBe(false);
    expect(isValidTag('with#hash')).toBe(false);
  });
});

describe('validateTag', () => {
  test('returns valid tag', () => {
    expect(validateTag('valid-tag')).toBe('valid-tag');
  });

  test('throws for non-string', () => {
    expect(() => validateTag(123)).toThrow(ValidationError);
    try {
      validateTag(123);
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.INVALID_TAG);
    }
  });

  test('throws for empty tag', () => {
    expect(() => validateTag('')).toThrow(ValidationError);
  });

  test('throws for too long tag', () => {
    expect(() => validateTag('a'.repeat(MAX_TAG_LENGTH + 1))).toThrow(ValidationError);
  });

  test('throws for whitespace', () => {
    expect(() => validateTag(' leading')).toThrow(ValidationError);
  });

  test('throws for invalid characters', () => {
    expect(() => validateTag('invalid@char')).toThrow(ValidationError);
  });
});

describe('isValidTags', () => {
  test('accepts valid tags array', () => {
    expect(isValidTags([])).toBe(true);
    expect(isValidTags(['tag1', 'tag2'])).toBe(true);
  });

  test('rejects non-array values', () => {
    expect(isValidTags(null)).toBe(false);
    expect(isValidTags(undefined)).toBe(false);
    expect(isValidTags('tag')).toBe(false);
    expect(isValidTags({})).toBe(false);
  });

  test('rejects array exceeding max tags', () => {
    const manyTags = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag${i}`);
    expect(isValidTags(manyTags)).toBe(false);
  });

  test('rejects duplicates', () => {
    expect(isValidTags(['tag', 'tag'])).toBe(false);
  });

  test('rejects if any tag is invalid', () => {
    expect(isValidTags(['valid', 'invalid@tag'])).toBe(false);
  });
});

describe('validateTags', () => {
  test('returns validated tags array', () => {
    expect(validateTags(['tag1', 'tag2'])).toEqual(['tag1', 'tag2']);
  });

  test('throws for non-array', () => {
    expect(() => validateTags('tag')).toThrow(ValidationError);
  });

  test('throws for too many tags', () => {
    const manyTags = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag${i}`);
    expect(() => validateTags(manyTags)).toThrow(ValidationError);
  });

  test('throws for duplicates with list of duplicates', () => {
    try {
      validateTags(['tag', 'tag']);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_TAG);
      expect(err.details.value).toContain('tag');
    }
  });
});

describe('isValidMetadata', () => {
  test('accepts valid metadata', () => {
    expect(isValidMetadata({})).toBe(true);
    expect(isValidMetadata({ key: 'value' })).toBe(true);
    expect(isValidMetadata({ nested: { key: 'value' } })).toBe(true);
    expect(isValidMetadata({ num: 123, bool: true, arr: [1, 2, 3] })).toBe(true);
  });

  test('rejects non-object values', () => {
    expect(isValidMetadata(null)).toBe(false);
    expect(isValidMetadata(undefined)).toBe(false);
    expect(isValidMetadata('string')).toBe(false);
    expect(isValidMetadata(123)).toBe(false);
    expect(isValidMetadata([])).toBe(false);
  });

  test('rejects reserved keys', () => {
    expect(isValidMetadata({ [RESERVED_METADATA_PREFIX + 'system']: 'value' })).toBe(false);
    expect(isValidMetadata({ '_el_internal': 'value' })).toBe(false);
  });

  test('rejects oversized metadata', () => {
    const largeValue = 'x'.repeat(MAX_METADATA_SIZE + 1);
    expect(isValidMetadata({ large: largeValue })).toBe(false);
  });
});

describe('validateMetadata', () => {
  test('returns validated metadata', () => {
    const metadata = { key: 'value' };
    expect(validateMetadata(metadata)).toEqual(metadata);
  });

  test('throws for non-object', () => {
    expect(() => validateMetadata(null)).toThrow(ValidationError);
    expect(() => validateMetadata([])).toThrow(ValidationError);
  });

  test('throws for reserved keys', () => {
    try {
      validateMetadata({ '_el_key': 'value' });
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_METADATA);
    }
  });

  test('throws for oversized metadata', () => {
    const largeValue = 'x'.repeat(MAX_METADATA_SIZE + 1);
    expect(() => validateMetadata({ large: largeValue })).toThrow(ValidationError);
  });
});

describe('isValidElementType', () => {
  test('accepts all valid types', () => {
    Object.values(ElementType).forEach((type) => {
      expect(isValidElementType(type)).toBe(true);
    });
  });

  test('rejects invalid types', () => {
    expect(isValidElementType('invalid')).toBe(false);
    expect(isValidElementType(null)).toBe(false);
    expect(isValidElementType(123)).toBe(false);
  });
});

describe('validateElementType', () => {
  test('returns valid type', () => {
    expect(validateElementType('task')).toBe('task');
  });

  test('throws for invalid type', () => {
    expect(() => validateElementType('invalid')).toThrow(ValidationError);
    try {
      validateElementType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('type');
    }
  });
});

describe('isElement', () => {
  test('accepts valid element', () => {
    expect(isElement(createTestElement())).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isElement(null)).toBe(false);
    expect(isElement(undefined)).toBe(false);
    expect(isElement('string')).toBe(false);
  });

  test('rejects elements with missing fields', () => {
    expect(isElement({ ...createTestElement(), id: undefined })).toBe(false);
    expect(isElement({ ...createTestElement(), type: undefined })).toBe(false);
    expect(isElement({ ...createTestElement(), createdAt: undefined })).toBe(false);
  });

  test('rejects elements with invalid field types', () => {
    expect(isElement({ ...createTestElement(), id: 123 })).toBe(false);
    expect(isElement({ ...createTestElement(), type: 'invalid' })).toBe(false);
    expect(isElement({ ...createTestElement(), tags: 'not-array' })).toBe(false);
  });
});

describe('validateElement', () => {
  test('returns valid element', () => {
    const element = createTestElement();
    expect(validateElement(element)).toEqual(element);
  });

  test('throws for non-object', () => {
    expect(() => validateElement(null)).toThrow(ValidationError);
    expect(() => validateElement('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateElement({ ...createTestElement(), id: '' })).toThrow(ValidationError);
    try {
      validateElement({ ...createTestElement(), createdBy: '' });
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });
});

describe('createTimestamp', () => {
  test('returns valid ISO 8601 timestamp', () => {
    const ts = createTimestamp();
    expect(isValidTimestamp(ts)).toBe(true);
  });

  test('returns current time approximately', () => {
    const before = Date.now();
    const ts = createTimestamp();
    const after = Date.now();

    const tsDate = new Date(ts).getTime();
    expect(tsDate).toBeGreaterThanOrEqual(before);
    expect(tsDate).toBeLessThanOrEqual(after);
  });
});

describe('parseTimestamp', () => {
  test('parses valid timestamp to Date', () => {
    const ts = '2025-01-22T10:00:00.000Z';
    const date = parseTimestamp(ts);
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe(ts);
  });
});

describe('normalizeTags', () => {
  test('removes duplicates', () => {
    expect(normalizeTags(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  test('sorts alphabetically', () => {
    expect(normalizeTags(['z', 'a', 'm'])).toEqual(['a', 'm', 'z']);
  });

  test('handles empty array', () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe('addTag', () => {
  test('adds new tag to element', () => {
    const element = createTestElement({ tags: ['existing'] });
    const newTags = addTag(element, 'new-tag');
    expect(newTags).toEqual(['existing', 'new-tag']);
  });

  test('returns same array if tag exists', () => {
    const element = createTestElement({ tags: ['existing'] });
    const newTags = addTag(element, 'existing');
    expect(newTags).toEqual(['existing']);
  });

  test('validates new tag', () => {
    const element = createTestElement({ tags: [] });
    expect(() => addTag(element, 'invalid@tag')).toThrow(ValidationError);
  });

  test('validates total tag count', () => {
    const tags = Array.from({ length: MAX_TAGS }, (_, i) => `tag${i}`);
    const element = createTestElement({ tags });
    expect(() => addTag(element, 'one-more')).toThrow(ValidationError);
  });
});

describe('removeTag', () => {
  test('removes existing tag', () => {
    const element = createTestElement({ tags: ['a', 'b', 'c'] });
    expect(removeTag(element, 'b')).toEqual(['a', 'c']);
  });

  test('returns same array if tag not found', () => {
    const element = createTestElement({ tags: ['a', 'b'] });
    expect(removeTag(element, 'c')).toEqual(['a', 'b']);
  });

  test('handles empty tags', () => {
    const element = createTestElement({ tags: [] });
    expect(removeTag(element, 'a')).toEqual([]);
  });
});

describe('elementsEqual', () => {
  test('returns true for identical elements', () => {
    const element = createTestElement();
    expect(elementsEqual(element, { ...element })).toBe(true);
  });

  test('returns true for elements with same tags in different order', () => {
    const a = createTestElement({ tags: ['x', 'y', 'z'] });
    const b = createTestElement({ tags: ['z', 'x', 'y'] });
    expect(elementsEqual(a, b)).toBe(true);
  });

  test('returns true for elements with same metadata keys in different order', () => {
    const a = createTestElement({ metadata: { a: 1, b: 2 } });
    const b = createTestElement({ metadata: { b: 2, a: 1 } });
    expect(elementsEqual(a, b)).toBe(true);
  });

  test('returns false for different ids', () => {
    const a = createTestElement({ id: 'el-a' as ElementId });
    const b = createTestElement({ id: 'el-b' as ElementId });
    expect(elementsEqual(a, b)).toBe(false);
  });

  test('returns false for different types', () => {
    const a = createTestElement({ type: ElementType.TASK });
    const b = createTestElement({ type: ElementType.MESSAGE });
    expect(elementsEqual(a, b)).toBe(false);
  });

  test('returns false for different tags', () => {
    const a = createTestElement({ tags: ['a'] });
    const b = createTestElement({ tags: ['b'] });
    expect(elementsEqual(a, b)).toBe(false);
  });

  test('returns false for different metadata', () => {
    const a = createTestElement({ metadata: { key: 'a' } });
    const b = createTestElement({ metadata: { key: 'b' } });
    expect(elementsEqual(a, b)).toBe(false);
  });
});

// Property-based tests for edge cases
describe('Edge cases', () => {
  test('handles maximum valid tag length', () => {
    const maxTag = 'a'.repeat(MAX_TAG_LENGTH);
    expect(isValidTag(maxTag)).toBe(true);
    expect(validateTag(maxTag)).toBe(maxTag);
  });

  test('handles maximum valid tag count', () => {
    const maxTags = Array.from({ length: MAX_TAGS }, (_, i) => `tag${i}`);
    expect(isValidTags(maxTags)).toBe(true);
  });

  test('handles metadata with nested objects', () => {
    const nested = {
      level1: {
        level2: {
          level3: {
            value: 'deep',
          },
        },
      },
    };
    expect(isValidMetadata(nested)).toBe(true);
  });

  test('handles metadata with arrays', () => {
    const withArrays = {
      arr: [1, 2, 3],
      nested: {
        arr: ['a', 'b', 'c'],
      },
    };
    expect(isValidMetadata(withArrays)).toBe(true);
  });

  test('handles metadata at size boundary', () => {
    // Create metadata just under the limit
    const keyLength = 10;
    const key = 'k'.repeat(keyLength);
    // Account for JSON overhead: {"key":"value"} adds quotes, colon, braces
    const overhead = keyLength + 6; // key quotes (2) + colon (1) + value quotes (2) + braces (2) - 1
    const valueLength = MAX_METADATA_SIZE - overhead - 10; // Buffer for safety
    const value = 'v'.repeat(valueLength);

    // This should be valid
    const metadata = { [key]: value };
    expect(isValidMetadata(metadata)).toBe(true);
  });

  test('timestamp edge cases', () => {
    // Leap year
    expect(isValidTimestamp('2024-02-29T00:00:00.000Z')).toBe(true);
    // Non-leap year Feb 29 should be invalid
    expect(isValidTimestamp('2025-02-29T00:00:00.000Z')).toBe(false);
    // Year 2000 was a leap year
    expect(isValidTimestamp('2000-02-29T00:00:00.000Z')).toBe(true);
  });
});
