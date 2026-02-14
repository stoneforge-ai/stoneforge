/**
 * Mention Parsing Utilities
 *
 * Utilities for parsing @mentions from content strings.
 * Mentions follow the entity name pattern: @[a-zA-Z][a-zA-Z0-9_-]*
 *
 * These utilities are used to:
 * - Extract @mentions from message content
 * - Validate mentioned names against existing entities
 * - Create MENTIONS dependencies between messages and entities
 */

import { type Entity } from '../types/entity.js';
import { type EntityId } from '../types/element.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a parsed mention from content
 */
export interface ParsedMention {
  /** The entity name without the @ symbol */
  name: string;
  /** Start position of the mention in content (including @) */
  startIndex: number;
  /** End position of the mention in content (exclusive) */
  endIndex: number;
}

/**
 * Result of validating mentions against existing entities
 */
export interface MentionValidationResult {
  /** Entity IDs of valid (existing) mentions */
  valid: EntityId[];
  /** Names of invalid (non-existent) mentions */
  invalid: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Pattern for valid mention names (same as entity name pattern)
 * Must start with a letter, then alphanumeric, hyphen, or underscore
 */
const MENTION_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Pattern to find potential mentions in content
 * Matches @ followed by a valid name pattern
 * Uses word boundary to avoid matching email addresses
 *
 * The pattern uses a negative lookbehind to exclude:
 * - Email addresses (@ preceded by alphanumeric)
 * - Adjacent @ symbols
 */
const MENTION_REGEX = /(?<![a-zA-Z0-9])@([a-zA-Z][a-zA-Z0-9_-]*)/g;

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parses all @mentions from a content string
 *
 * @param content - The content string to parse
 * @returns Array of parsed mentions with their positions
 *
 * @example
 * ```ts
 * parseMentions("Hello @alice")
 * // Returns: [{ name: 'alice', startIndex: 6, endIndex: 12 }]
 *
 * parseMentions("@alice and @bob")
 * // Returns: [
 * //   { name: 'alice', startIndex: 0, endIndex: 6 },
 * //   { name: 'bob', startIndex: 11, endIndex: 15 }
 * // ]
 *
 * parseMentions("email@domain.com")
 * // Returns: [] (email addresses are not mentions)
 * ```
 */
export function parseMentions(content: string): ParsedMention[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const mentions: ParsedMention[] = [];
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];

    // Double-check that the name matches our pattern
    if (MENTION_NAME_PATTERN.test(name)) {
      mentions.push({
        name,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  return mentions;
}

/**
 * Extracts just the unique mention names from content
 *
 * @param content - The content string to parse
 * @returns Array of unique mention names (without @ symbol)
 *
 * @example
 * ```ts
 * extractMentionedNames("Hello @alice and @bob, also @alice")
 * // Returns: ['alice', 'bob']
 * ```
 */
export function extractMentionedNames(content: string): string[] {
  const mentions = parseMentions(content);
  const uniqueNames = new Set(mentions.map((m) => m.name));
  return Array.from(uniqueNames);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates mention names against a list of existing entities
 *
 * @param names - Array of mention names to validate
 * @param existingEntities - Array of existing entities to check against
 * @returns Object with valid entity IDs and invalid names
 *
 * @example
 * ```ts
 * const entities = [
 *   { id: 'el-123', name: 'alice' },
 *   { id: 'el-456', name: 'bob' }
 * ];
 * validateMentions(['alice', 'charlie'], entities)
 * // Returns: { valid: ['el-123'], invalid: ['charlie'] }
 * ```
 */
export function validateMentions(
  names: string[],
  existingEntities: Entity[]
): MentionValidationResult {
  const entityByName = new Map<string, Entity>();
  for (const entity of existingEntities) {
    // Case-insensitive lookup for flexibility
    entityByName.set(entity.name.toLowerCase(), entity);
  }

  const valid: EntityId[] = [];
  const invalid: string[] = [];

  for (const name of names) {
    const entity = entityByName.get(name.toLowerCase());
    if (entity) {
      // Entity.id is an ElementId, but we return it as EntityId since entities ARE entities
      valid.push(entity.id as unknown as EntityId);
    } else {
      invalid.push(name);
    }
  }

  return { valid, invalid };
}

/**
 * Checks if a string is a valid mention name
 *
 * @param name - The name to check (without @ symbol)
 * @returns True if the name matches the mention pattern
 */
export function isValidMentionName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return MENTION_NAME_PATTERN.test(name);
}

/**
 * Checks if content contains any mentions
 *
 * @param content - The content to check
 * @returns True if at least one mention is found
 */
export function hasMentions(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  return regex.test(content);
}
