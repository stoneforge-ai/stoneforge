import { describe, expect, test } from 'bun:test';
import {
  parseMentions,
  extractMentionedNames,
  validateMentions,
  isValidMentionName,
  hasMentions,
  ParsedMention,
} from './mentions.js';
import { Entity, EntityTypeValue } from '../types/entity.js';
import { ElementType, createTimestamp, ElementId, EntityId } from '../types/element.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestEntity(name: string, id?: string): Entity {
  return {
    id: (id || `el-${name}`) as ElementId,
    type: ElementType.ENTITY,
    createdAt: createTimestamp(),
    createdBy: 'el-system' as EntityId,
    name,
    entityType: EntityTypeValue.HUMAN,
  };
}

// ============================================================================
// parseMentions Tests
// ============================================================================

describe('parseMentions', () => {
  describe('basic parsing', () => {
    test('parses single mention', () => {
      const result = parseMentions('Hello @alice');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'alice',
        startIndex: 6,
        endIndex: 12,
      });
    });

    test('parses mention at start of string', () => {
      const result = parseMentions('@alice hello');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'alice',
        startIndex: 0,
        endIndex: 6,
      });
    });

    test('parses mention at end of string', () => {
      const result = parseMentions('cc @alice');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'alice',
        startIndex: 3,
        endIndex: 9,
      });
    });

    test('parses mention as entire string', () => {
      const result = parseMentions('@alice');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'alice',
        startIndex: 0,
        endIndex: 6,
      });
    });
  });

  describe('multiple mentions', () => {
    test('parses two mentions', () => {
      const result = parseMentions('@alice and @bob');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'alice',
        startIndex: 0,
        endIndex: 6,
      });
      expect(result[1]).toEqual({
        name: 'bob',
        startIndex: 11,
        endIndex: 15,
      });
    });

    test('parses multiple mentions in a row', () => {
      const result = parseMentions('@alice @bob @charlie');
      expect(result).toHaveLength(3);
      expect(result.map((m) => m.name)).toEqual(['alice', 'bob', 'charlie']);
    });

    test('parses duplicate mentions', () => {
      const result = parseMentions('@alice said hello to @alice');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('alice');
      expect(result[1].name).toBe('alice');
    });
  });

  describe('adjacent mentions', () => {
    test('handles space-separated mentions', () => {
      const result = parseMentions('@alice @bob');
      expect(result).toHaveLength(2);
    });

    test('handles mentions separated by newline', () => {
      const result = parseMentions('@alice\n@bob');
      expect(result).toHaveLength(2);
    });

    test('handles mentions separated by comma', () => {
      const result = parseMentions('@alice, @bob');
      expect(result).toHaveLength(2);
    });
  });

  describe('name patterns', () => {
    test('parses name starting with uppercase', () => {
      const result = parseMentions('@Alice');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });

    test('parses name with numbers', () => {
      const result = parseMentions('@user123');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('user123');
    });

    test('parses name with hyphens', () => {
      const result = parseMentions('@alice-smith');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice-smith');
    });

    test('parses name with underscores', () => {
      const result = parseMentions('@alice_smith');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice_smith');
    });

    test('parses complex name', () => {
      const result = parseMentions('@Alice-Smith_123');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice-Smith_123');
    });
  });

  describe('email address exclusion', () => {
    test('does not match email address', () => {
      const result = parseMentions('email@domain.com');
      expect(result).toHaveLength(0);
    });

    test('does not match email with subdomain', () => {
      const result = parseMentions('user@mail.domain.com');
      expect(result).toHaveLength(0);
    });

    test('matches mention after email', () => {
      const result = parseMentions('email@domain.com @alice');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('matches mention before email', () => {
      const result = parseMentions('@alice email@domain.com');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('does not match email with numbers', () => {
      const result = parseMentions('user123@example.com');
      expect(result).toHaveLength(0);
    });
  });

  describe('invalid names', () => {
    test('does not match name starting with number', () => {
      const result = parseMentions('@123invalid');
      expect(result).toHaveLength(0);
    });

    test('does not match name starting with underscore', () => {
      const result = parseMentions('@_invalid');
      expect(result).toHaveLength(0);
    });

    test('does not match name starting with hyphen', () => {
      const result = parseMentions('@-invalid');
      expect(result).toHaveLength(0);
    });

    test('does not match @ alone', () => {
      const result = parseMentions('@ alone');
      expect(result).toHaveLength(0);
    });

    test('does not match @ followed by space', () => {
      const result = parseMentions('@ bob');
      expect(result).toHaveLength(0);
    });
  });

  describe('punctuation handling', () => {
    test('mention ends before exclamation mark', () => {
      const result = parseMentions('Hello @alice!');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'alice',
        startIndex: 6,
        endIndex: 12,
      });
    });

    test('mention ends before period', () => {
      const result = parseMentions('Hello @alice.');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('mention ends before question mark', () => {
      const result = parseMentions('Where is @alice?');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('mention ends before comma', () => {
      const result = parseMentions('@alice, please help');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('mention ends before colon', () => {
      const result = parseMentions('@alice: check this');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('mention ends before semicolon', () => {
      const result = parseMentions('@alice; @bob');
      expect(result).toHaveLength(2);
    });

    test('mention ends before parenthesis', () => {
      const result = parseMentions('(@alice)');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('mention ends before bracket', () => {
      const result = parseMentions('[@alice]');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });
  });

  describe('multiple @ symbols', () => {
    test('handles double @', () => {
      const result = parseMentions('@@alice');
      // Second @ starts a valid mention
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('handles triple @', () => {
      const result = parseMentions('@@@alice');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('handles @ after valid mention', () => {
      const result = parseMentions('@alice@bob');
      // Only @alice is matched because @bob follows alphanumeric
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });
  });

  describe('edge cases', () => {
    test('returns empty array for empty string', () => {
      const result = parseMentions('');
      expect(result).toEqual([]);
    });

    test('returns empty array for null input', () => {
      const result = parseMentions(null as unknown as string);
      expect(result).toEqual([]);
    });

    test('returns empty array for undefined input', () => {
      const result = parseMentions(undefined as unknown as string);
      expect(result).toEqual([]);
    });

    test('returns empty array for non-string input', () => {
      const result = parseMentions(123 as unknown as string);
      expect(result).toEqual([]);
    });

    test('returns empty array for no mentions', () => {
      const result = parseMentions('Hello world');
      expect(result).toEqual([]);
    });

    test('returns empty array for only @', () => {
      const result = parseMentions('@');
      expect(result).toEqual([]);
    });

    test('handles very long name', () => {
      const longName = 'a' + 'b'.repeat(100);
      const result = parseMentions(`@${longName}`);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(longName);
    });

    test('handles unicode content around mention', () => {
      const result = parseMentions('Hello @alice');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });

    test('handles newlines and tabs', () => {
      const result = parseMentions('@alice\n\t@bob');
      expect(result).toHaveLength(2);
    });

    test('handles mention after special characters', () => {
      const result = parseMentions('#hashtag @alice');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });
  });

  describe('position accuracy', () => {
    test('positions are accurate for multiple mentions', () => {
      const content = 'Hey @alice, please ask @bob about this';
      const result = parseMentions(content);

      expect(result).toHaveLength(2);

      // Verify @alice
      expect(content.substring(result[0].startIndex, result[0].endIndex)).toBe('@alice');

      // Verify @bob
      expect(content.substring(result[1].startIndex, result[1].endIndex)).toBe('@bob');
    });

    test('positions work with unicode prefix', () => {
      const content = 'Hi @alice';
      const result = parseMentions(content);

      expect(result).toHaveLength(1);
      // Note: position counts bytes/chars after emoji
      expect(content.substring(result[0].startIndex, result[0].endIndex)).toBe('@alice');
    });
  });
});

// ============================================================================
// extractMentionedNames Tests
// ============================================================================

describe('extractMentionedNames', () => {
  test('extracts single name', () => {
    const result = extractMentionedNames('Hello @alice');
    expect(result).toEqual(['alice']);
  });

  test('extracts multiple unique names', () => {
    const result = extractMentionedNames('@alice and @bob');
    expect(result).toEqual(['alice', 'bob']);
  });

  test('deduplicates repeated names', () => {
    const result = extractMentionedNames('@alice said hello to @alice');
    expect(result).toEqual(['alice']);
  });

  test('deduplicates multiple repeated names', () => {
    const result = extractMentionedNames('@alice @bob @alice @bob @charlie');
    expect(result).toHaveLength(3);
    expect(result).toContain('alice');
    expect(result).toContain('bob');
    expect(result).toContain('charlie');
  });

  test('returns empty array for no mentions', () => {
    const result = extractMentionedNames('Hello world');
    expect(result).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    const result = extractMentionedNames('');
    expect(result).toEqual([]);
  });

  test('preserves case of names', () => {
    const result = extractMentionedNames('@Alice @ALICE @alice');
    expect(result).toHaveLength(3);
    expect(result).toContain('Alice');
    expect(result).toContain('ALICE');
    expect(result).toContain('alice');
  });
});

// ============================================================================
// validateMentions Tests
// ============================================================================

describe('validateMentions', () => {
  const testEntities: Entity[] = [
    createTestEntity('alice', 'el-alice123'),
    createTestEntity('bob', 'el-bob456'),
    createTestEntity('Charlie', 'el-charlie789'),
  ];

  test('validates existing entities', () => {
    const result = validateMentions(['alice', 'bob'], testEntities);
    expect(result.valid).toHaveLength(2);
    expect(result.valid).toContain('el-alice123');
    expect(result.valid).toContain('el-bob456');
    expect(result.invalid).toHaveLength(0);
  });

  test('identifies invalid mentions', () => {
    const result = validateMentions(['alice', 'unknown'], testEntities);
    expect(result.valid).toHaveLength(1);
    expect(result.valid).toContain('el-alice123');
    expect(result.invalid).toEqual(['unknown']);
  });

  test('handles all invalid mentions', () => {
    const result = validateMentions(['unknown1', 'unknown2'], testEntities);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toEqual(['unknown1', 'unknown2']);
  });

  test('handles empty names array', () => {
    const result = validateMentions([], testEntities);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
  });

  test('handles empty entities array', () => {
    const result = validateMentions(['alice'], []);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toEqual(['alice']);
  });

  test('performs case-insensitive lookup', () => {
    const result = validateMentions(['ALICE', 'Bob', 'charlie'], testEntities);
    expect(result.valid).toHaveLength(3);
    expect(result.invalid).toHaveLength(0);
  });

  test('returns correct entity IDs', () => {
    const result = validateMentions(['alice'], testEntities);
    expect(result.valid).toEqual(['el-alice123']);
  });

  test('handles mixed valid and invalid', () => {
    const result = validateMentions(['alice', 'unknown', 'bob', 'another'], testEntities);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid).toContain('unknown');
    expect(result.invalid).toContain('another');
  });
});

// ============================================================================
// isValidMentionName Tests
// ============================================================================

describe('isValidMentionName', () => {
  test('accepts valid names', () => {
    expect(isValidMentionName('alice')).toBe(true);
    expect(isValidMentionName('Alice')).toBe(true);
    expect(isValidMentionName('alice123')).toBe(true);
    expect(isValidMentionName('alice-smith')).toBe(true);
    expect(isValidMentionName('alice_smith')).toBe(true);
    expect(isValidMentionName('A')).toBe(true);
    expect(isValidMentionName('a')).toBe(true);
  });

  test('rejects names starting with number', () => {
    expect(isValidMentionName('123alice')).toBe(false);
    expect(isValidMentionName('1a')).toBe(false);
  });

  test('rejects names starting with hyphen', () => {
    expect(isValidMentionName('-alice')).toBe(false);
  });

  test('rejects names starting with underscore', () => {
    expect(isValidMentionName('_alice')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidMentionName('')).toBe(false);
  });

  test('rejects null', () => {
    expect(isValidMentionName(null as unknown as string)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(isValidMentionName(undefined as unknown as string)).toBe(false);
  });

  test('rejects names with spaces', () => {
    expect(isValidMentionName('alice smith')).toBe(false);
  });

  test('rejects names with special characters', () => {
    expect(isValidMentionName('alice@bob')).toBe(false);
    expect(isValidMentionName('alice.smith')).toBe(false);
    expect(isValidMentionName('alice!')).toBe(false);
  });
});

// ============================================================================
// hasMentions Tests
// ============================================================================

describe('hasMentions', () => {
  test('returns true when content has mention', () => {
    expect(hasMentions('Hello @alice')).toBe(true);
  });

  test('returns true for multiple mentions', () => {
    expect(hasMentions('@alice @bob')).toBe(true);
  });

  test('returns false for no mentions', () => {
    expect(hasMentions('Hello world')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(hasMentions('')).toBe(false);
  });

  test('returns false for null', () => {
    expect(hasMentions(null as unknown as string)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(hasMentions(undefined as unknown as string)).toBe(false);
  });

  test('returns false for email address', () => {
    expect(hasMentions('email@domain.com')).toBe(false);
  });

  test('returns false for invalid mention', () => {
    expect(hasMentions('@123invalid')).toBe(false);
  });

  test('returns true for mention with punctuation', () => {
    expect(hasMentions('Hello @alice!')).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: Parse and Validate', () => {
  const entities: Entity[] = [
    createTestEntity('alice'),
    createTestEntity('bob'),
    createTestEntity('charlie'),
  ];

  test('parses and validates mentions in one flow', () => {
    const content = 'Hey @alice and @bob, can you help @unknown with this?';

    // Parse
    const names = extractMentionedNames(content);
    expect(names).toEqual(['alice', 'bob', 'unknown']);

    // Validate
    const validation = validateMentions(names, entities);
    expect(validation.valid).toHaveLength(2);
    expect(validation.invalid).toEqual(['unknown']);
  });

  test('handles content with no valid mentions', () => {
    const content = 'Hey @ghost and @phantom';

    const names = extractMentionedNames(content);
    const validation = validateMentions(names, entities);

    expect(validation.valid).toHaveLength(0);
    expect(validation.invalid).toEqual(['ghost', 'phantom']);
  });

  test('handles content with all valid mentions', () => {
    const content = '@alice @bob @charlie team meeting';

    const names = extractMentionedNames(content);
    const validation = validateMentions(names, entities);

    expect(validation.valid).toHaveLength(3);
    expect(validation.invalid).toHaveLength(0);
  });
});
