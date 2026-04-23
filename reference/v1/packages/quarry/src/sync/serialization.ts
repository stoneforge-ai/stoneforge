/**
 * Sync Serialization - JSONL format serialization and parsing
 *
 * Handles conversion between Element/Dependency objects and JSONL format.
 * All timestamps are normalized to ISO 8601 format.
 */

import type { Element, Dependency } from '@stoneforge/core';
import { ValidationError, ErrorCode, isElement, validateElement, isDependency, validateDependency } from '@stoneforge/core';
import type { SerializedElement, SerializedDependency } from './types.js';
import { getTypePriority } from './types.js';

// ============================================================================
// Element Serialization
// ============================================================================

/**
 * Serialize an element to JSONL format
 *
 * @param element - Element to serialize
 * @returns JSON string ready for JSONL file
 */
export function serializeElement(element: Element): string {
  // Validate element before serializing
  if (!isElement(element)) {
    throw new ValidationError(
      'Cannot serialize invalid element',
      ErrorCode.INVALID_INPUT,
      { element }
    );
  }

  // Create serialized form with all fields inline
  const serialized: SerializedElement = {
    ...element,
    id: element.id,
    type: element.type,
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
    createdBy: element.createdBy,
    tags: [...element.tags],
    metadata: { ...element.metadata },
  };

  return JSON.stringify(serialized);
}

/**
 * Parse a JSONL line into an element
 *
 * @param line - JSON string from JSONL file
 * @returns Parsed element
 * @throws ValidationError if parsing fails
 */
export function parseElement(line: string): Element {
  if (!line || line.trim().length === 0) {
    throw new ValidationError(
      'Cannot parse empty line as element',
      ErrorCode.INVALID_INPUT,
      { line }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    throw new ValidationError(
      `Invalid JSON in element line: ${err instanceof Error ? err.message : 'unknown error'}`,
      ErrorCode.INVALID_INPUT,
      { line: line.substring(0, 100) }
    );
  }

  // Validate as element
  return validateElement(parsed);
}

/**
 * Try to parse a JSONL line into an element
 *
 * @param line - JSON string from JSONL file
 * @returns Parsed element or null if invalid
 */
export function tryParseElement(line: string): Element | null {
  try {
    return parseElement(line);
  } catch {
    return null;
  }
}

// ============================================================================
// Dependency Serialization
// ============================================================================

/**
 * Serialize a dependency to JSONL format
 *
 * @param dependency - Dependency to serialize
 * @returns JSON string ready for JSONL file
 */
export function serializeDependency(dependency: Dependency): string {
  // Validate dependency before serializing
  if (!isDependency(dependency)) {
    throw new ValidationError(
      'Cannot serialize invalid dependency',
      ErrorCode.INVALID_INPUT,
      { dependency }
    );
  }

  const serialized: SerializedDependency = {
    blockedId: dependency.blockedId,
    blockerId: dependency.blockerId,
    type: dependency.type,
    createdAt: dependency.createdAt,
    createdBy: dependency.createdBy,
  };

  // Only include metadata if non-empty
  if (Object.keys(dependency.metadata).length > 0) {
    serialized.metadata = { ...dependency.metadata };
  }

  return JSON.stringify(serialized);
}

/**
 * Parse a JSONL line into a dependency
 *
 * @param line - JSON string from JSONL file
 * @returns Parsed dependency
 * @throws ValidationError if parsing fails
 */
export function parseDependency(line: string): Dependency {
  if (!line || line.trim().length === 0) {
    throw new ValidationError(
      'Cannot parse empty line as dependency',
      ErrorCode.INVALID_INPUT,
      { line }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    throw new ValidationError(
      `Invalid JSON in dependency line: ${err instanceof Error ? err.message : 'unknown error'}`,
      ErrorCode.INVALID_INPUT,
      { line: line.substring(0, 100) }
    );
  }

  // Ensure metadata exists (defaults to empty object)
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (obj.metadata === undefined) {
      obj.metadata = {};
    }
  }

  // Validate as dependency
  return validateDependency(parsed);
}

/**
 * Try to parse a JSONL line into a dependency
 *
 * @param line - JSON string from JSONL file
 * @returns Parsed dependency or null if invalid
 */
export function tryParseDependency(line: string): Dependency | null {
  try {
    return parseDependency(line);
  } catch {
    return null;
  }
}

// ============================================================================
// Batch Serialization
// ============================================================================

/**
 * Serialize multiple elements to JSONL content
 *
 * @param elements - Elements to serialize
 * @returns JSONL content (multiple lines)
 */
export function serializeElements(elements: Element[]): string {
  return elements.map(serializeElement).join('\n');
}

/**
 * Serialize multiple dependencies to JSONL content
 *
 * @param dependencies - Dependencies to serialize
 * @returns JSONL content (multiple lines)
 */
export function serializeDependencies(dependencies: Dependency[]): string {
  return dependencies.map(serializeDependency).join('\n');
}

/**
 * Parse JSONL content into elements
 *
 * @param content - JSONL content (multiple lines)
 * @returns Array of parsed elements and any errors
 */
export function parseElements(content: string): { elements: Element[]; errors: ParseError[] } {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const elements: Element[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      elements.push(parseElement(line));
    } catch (err) {
      errors.push({
        line: i + 1,
        message: err instanceof Error ? err.message : 'Unknown error',
        content: line.substring(0, 100),
      });
    }
  }

  return { elements, errors };
}

/**
 * Parse JSONL content into dependencies
 *
 * @param content - JSONL content (multiple lines)
 * @returns Array of parsed dependencies and any errors
 */
export function parseDependencies(content: string): {
  dependencies: Dependency[];
  errors: ParseError[];
} {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const dependencies: Dependency[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      dependencies.push(parseDependency(line));
    } catch (err) {
      errors.push({
        line: i + 1,
        message: err instanceof Error ? err.message : 'Unknown error',
        content: line.substring(0, 100),
      });
    }
  }

  return { dependencies, errors };
}

/**
 * Parse error info
 */
export interface ParseError {
  /** Line number (1-indexed) */
  line: number;
  /** Error message */
  message: string;
  /** Truncated line content */
  content: string;
}

// ============================================================================
// Ordering
// ============================================================================

/**
 * Sort elements for export ordering
 *
 * Order by:
 * 1. Type (entities first for references)
 * 2. Creation time
 * 3. ID (for stability)
 *
 * @param elements - Elements to sort
 * @returns Sorted elements (new array)
 */
export function sortElementsForExport(elements: Element[]): Element[] {
  return [...elements].sort((a, b) => {
    // First by type priority
    const typeDiff = getTypePriority(a.type) - getTypePriority(b.type);
    if (typeDiff !== 0) return typeDiff;

    // Then by creation time
    const timeDiff = a.createdAt.localeCompare(b.createdAt);
    if (timeDiff !== 0) return timeDiff;

    // Finally by ID for stability
    return a.id.localeCompare(b.id);
  });
}

/**
 * Sort dependencies for export ordering
 *
 * Order by:
 * 1. Creation time
 * 2. Blocked ID
 * 3. Blocker ID
 * 4. Type (for stability)
 *
 * @param dependencies - Dependencies to sort
 * @returns Sorted dependencies (new array)
 */
export function sortDependenciesForExport(dependencies: Dependency[]): Dependency[] {
  return [...dependencies].sort((a, b) => {
    // First by creation time
    const timeDiff = a.createdAt.localeCompare(b.createdAt);
    if (timeDiff !== 0) return timeDiff;

    // Then by blocked ID
    const blockedDiff = a.blockedId.localeCompare(b.blockedId);
    if (blockedDiff !== 0) return blockedDiff;

    // Then by blocker ID
    const blockerDiff = a.blockerId.localeCompare(b.blockerId);
    if (blockerDiff !== 0) return blockerDiff;

    // Finally by type for stability
    return a.type.localeCompare(b.type);
  });
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if an object looks like a serialized element
 * (less strict than isElement, for initial parsing)
 */
export function isSerializedElement(value: unknown): value is SerializedElement {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields exist
  return (
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string' &&
    typeof obj.createdBy === 'string' &&
    Array.isArray(obj.tags) &&
    typeof obj.metadata === 'object' &&
    obj.metadata !== null
  );
}

/**
 * Check if an object looks like a serialized dependency
 */
export function isSerializedDependency(value: unknown): value is SerializedDependency {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields exist
  return (
    typeof obj.blockedId === 'string' &&
    typeof obj.blockerId === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.createdBy === 'string'
  );
}
