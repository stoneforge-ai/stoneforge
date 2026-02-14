/**
 * Library Type - Document collection primitive
 *
 * Libraries are collections of related Documents, providing organization for
 * knowledge bases, documentation, and content management. Documents can belong
 * to multiple Libraries and Libraries can be nested hierarchically.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import {
  Element,
  ElementId,
  EntityId,
  ElementType,
  createTimestamp,
  validateTags,
  validateMetadata,
} from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';
import { DocumentId } from './document.js';

// ============================================================================
// Validation Constants
// ============================================================================

/** Minimum library name length */
export const MIN_LIBRARY_NAME_LENGTH = 1;

/** Maximum library name length */
export const MAX_LIBRARY_NAME_LENGTH = 100;

// ============================================================================
// Library ID Type
// ============================================================================

/**
 * Branded type for Library IDs (for use in references)
 */
declare const LibraryIdBrand: unique symbol;
export type LibraryId = ElementId & { readonly [LibraryIdBrand]: typeof LibraryIdBrand };

// ============================================================================
// Library Interface
// ============================================================================

/**
 * Library interface - extends Element with document collection properties
 */
export interface Library extends Element {
  /** Library type is always 'library' */
  readonly type: typeof ElementType.LIBRARY;

  // Content
  /** Library name, 1-100 characters */
  name: string;
  /** Reference to description Document */
  descriptionRef?: DocumentId;
}

/**
 * Library with hydrated description
 */
export interface HydratedLibrary extends Library {
  /** Hydrated description Document content */
  description?: string;
  /** Number of direct child documents */
  documentCount?: number;
  /** Number of direct child libraries (sub-libraries) */
  subLibraryCount?: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a library name
 */
export function isValidLibraryName(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length >= MIN_LIBRARY_NAME_LENGTH && trimmed.length <= MAX_LIBRARY_NAME_LENGTH;
}

/**
 * Validates library name and throws if invalid
 */
export function validateLibraryName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Library name must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'string' }
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(
      'Library name cannot be empty',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'name', value }
    );
  }

  if (trimmed.length > MAX_LIBRARY_NAME_LENGTH) {
    throw new ValidationError(
      `Library name exceeds maximum length of ${MAX_LIBRARY_NAME_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', expected: `<= ${MAX_LIBRARY_NAME_LENGTH} characters`, actual: trimmed.length }
    );
  }

  return trimmed;
}

/**
 * Validates a library ID format
 */
export function isValidLibraryId(value: unknown): value is LibraryId {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates library ID and throws if invalid
 */
export function validateLibraryId(value: unknown): LibraryId {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Library ID must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'libraryId', value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      'Library ID has invalid format',
      ErrorCode.INVALID_INPUT,
      { field: 'libraryId', value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as LibraryId;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Library
 */
export function isLibrary(value: unknown): value is Library {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.LIBRARY) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check required library-specific properties
  if (!isValidLibraryName(obj.name)) return false;

  // Check optional properties have correct types when present
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string') return false;

  return true;
}

/**
 * Comprehensive validation of a library with detailed errors
 */
export function validateLibrary(value: unknown): Library {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Library must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Library id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.LIBRARY) {
    throw new ValidationError(
      `Library type must be '${ElementType.LIBRARY}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.LIBRARY }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError('Library createdAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'createdAt',
      value: obj.createdAt,
    });
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError('Library updatedAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'updatedAt',
      value: obj.updatedAt,
    });
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Library createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError('Library tags must be an array', ErrorCode.INVALID_INPUT, {
      field: 'tags',
      value: obj.tags,
      expected: 'array',
    });
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError('Library metadata must be an object', ErrorCode.INVALID_INPUT, {
      field: 'metadata',
      value: obj.metadata,
      expected: 'object',
    });
  }

  // Validate library-specific required fields
  validateLibraryName(obj.name);

  // Validate optional fields types
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string') {
    throw new ValidationError(
      'Library descriptionRef must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'descriptionRef', value: obj.descriptionRef, expected: 'string' }
    );
  }

  return value as Library;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new library
 */
export interface CreateLibraryInput {
  /** Library name, 1-100 characters */
  name: string;
  /** Reference to the entity that created this library */
  createdBy: EntityId;
  /** Optional: Reference to description Document */
  descriptionRef?: DocumentId;
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Library with validated inputs
 *
 * @param input - Library creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Library
 */
export async function createLibrary(
  input: CreateLibraryInput,
  config?: IdGeneratorConfig
): Promise<Library> {
  // Validate required fields
  const name = validateLibraryName(input.name);

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Generate ID using name
  const id = await generateId({ identifier: name, createdBy: input.createdBy }, config);

  const library: Library = {
    id,
    type: ElementType.LIBRARY,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags,
    metadata,
    name,
    ...(input.descriptionRef !== undefined && { descriptionRef: input.descriptionRef }),
  };

  return library;
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Input for updating a library
 */
export interface UpdateLibraryInput {
  /** New name (optional) */
  name?: string;
  /** New description reference (optional, use null to remove) */
  descriptionRef?: DocumentId | null;
}

/**
 * Updates a library with new values
 *
 * @param library - The current library
 * @param input - Update input
 * @returns The updated library
 */
export function updateLibrary(library: Library, input: UpdateLibraryInput): Library {
  const updates: Partial<Library> = {
    updatedAt: createTimestamp(),
  };

  if (input.name !== undefined) {
    updates.name = validateLibraryName(input.name);
  }

  if (input.descriptionRef === null) {
    // Remove description reference
    const { descriptionRef: _, ...rest } = library;
    return { ...rest, ...updates } as Library;
  } else if (input.descriptionRef !== undefined) {
    updates.descriptionRef = input.descriptionRef;
  }

  return { ...library, ...updates };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a library has a description reference
 */
export function hasDescription(library: Library): boolean {
  return library.descriptionRef !== undefined;
}

/**
 * Gets a display string for library name (just returns the name, for consistency)
 */
export function getLibraryDisplayName(library: Library): string {
  return library.name;
}

/**
 * Filter libraries by creator
 */
export function filterByCreator<T extends Library>(libraries: T[], createdBy: EntityId): T[] {
  return libraries.filter((lib) => lib.createdBy === createdBy);
}

/**
 * Filter libraries that have a description
 */
export function filterWithDescription<T extends Library>(libraries: T[]): T[] {
  return libraries.filter((lib) => lib.descriptionRef !== undefined);
}

/**
 * Filter libraries that don't have a description
 */
export function filterWithoutDescription<T extends Library>(libraries: T[]): T[] {
  return libraries.filter((lib) => lib.descriptionRef === undefined);
}

/**
 * Sort libraries by name (alphabetically)
 */
export function sortByName<T extends Library>(libraries: T[], ascending = true): T[] {
  return [...libraries].sort((a, b) => {
    const comparison = a.name.localeCompare(b.name);
    return ascending ? comparison : -comparison;
  });
}

/**
 * Sort libraries by creation date (newest first)
 */
export function sortByCreationDate<T extends Library>(libraries: T[], ascending = false): T[] {
  return [...libraries].sort((a, b) => {
    const comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return ascending ? -comparison : comparison;
  });
}

/**
 * Sort libraries by update date (most recently updated first)
 */
export function sortByUpdateDate<T extends Library>(libraries: T[], ascending = false): T[] {
  return [...libraries].sort((a, b) => {
    const comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return ascending ? -comparison : comparison;
  });
}

/**
 * Group libraries by creator
 */
export function groupByCreator<T extends Library>(libraries: T[]): Map<EntityId, T[]> {
  const groups = new Map<EntityId, T[]>();
  for (const lib of libraries) {
    const existing = groups.get(lib.createdBy) ?? [];
    groups.set(lib.createdBy, [...existing, lib]);
  }
  return groups;
}

/**
 * Search libraries by name (case-insensitive contains match)
 */
export function searchByName<T extends Library>(libraries: T[], query: string): T[] {
  const lowerQuery = query.toLowerCase();
  return libraries.filter((lib) => lib.name.toLowerCase().includes(lowerQuery));
}

/**
 * Find a library by exact name match (case-insensitive)
 */
export function findByName<T extends Library>(libraries: T[], name: string): T | undefined {
  const lowerName = name.toLowerCase();
  return libraries.find((lib) => lib.name.toLowerCase() === lowerName);
}

/**
 * Find a library by ID
 */
export function findById<T extends Library>(libraries: T[], id: LibraryId | string): T | undefined {
  return libraries.find((lib) => lib.id === id);
}

/**
 * Check if a library name is unique within a collection
 */
export function isNameUnique(libraries: Library[], name: string, excludeId?: LibraryId | string): boolean {
  const lowerName = name.toLowerCase().trim();
  return !libraries.some(
    (lib) => lib.name.toLowerCase() === lowerName && lib.id !== excludeId
  );
}

// ============================================================================
// Deletion Types
// ============================================================================

/**
 * Deletion modes for library deletion
 */
export const LibraryDeletionMode = {
  /** Remove dependencies, documents remain (default, safest) */
  ORPHAN: 'orphan',
  /** Delete all child documents (cascade) */
  CASCADE: 'cascade',
  /** Reject if library has contents */
  PREVENT: 'prevent',
} as const;

export type LibraryDeletionMode = (typeof LibraryDeletionMode)[keyof typeof LibraryDeletionMode];

/**
 * Input for deleting a library
 */
export interface DeleteLibraryInput {
  /** Deletion mode - how to handle contents */
  mode?: LibraryDeletionMode;
  /** Entity performing the deletion */
  deletedBy: EntityId;
}

/**
 * Result of library deletion
 */
export interface DeleteLibraryResult {
  /** Whether the library was deleted */
  deleted: boolean;
  /** Number of documents orphaned */
  documentsOrphaned: number;
  /** Number of documents deleted (cascade mode) */
  documentsDeleted: number;
  /** Number of sub-libraries orphaned */
  subLibrariesOrphaned: number;
  /** Number of sub-libraries deleted (cascade mode) */
  subLibrariesDeleted: number;
}

// ============================================================================
// Library Content Information
// ============================================================================

/**
 * Statistics about library contents
 */
export interface LibraryStats {
  /** Number of direct child documents */
  documentCount: number;
  /** Total documents including descendants */
  totalDocuments: number;
  /** Number of direct child libraries */
  subLibraryCount: number;
  /** Total sub-libraries including nested */
  totalSubLibraries: number;
}

/**
 * Information about a library's ancestors
 */
export interface LibraryAncestry {
  /** Path from root to this library (ordered, root first) */
  path: LibraryId[];
  /** Depth from root (0 = root library) */
  depth: number;
}

// ============================================================================
// Hierarchy Utility Functions
// ============================================================================

/**
 * Checks if a library is a root library (has no parent library)
 * Note: This requires dependency information to be passed in
 */
export function isRootLibrary(
  libraryId: LibraryId | string,
  parentChildDependencies: Array<{ blockedId: string; blockerId: string }>
): boolean {
  // A library is root if it has no parent-child dependency where it is the source
  // and the target is another library
  return !parentChildDependencies.some(
    (dep) => dep.blockedId === libraryId
  );
}

/**
 * Gets direct children of a library (documents and sub-libraries)
 * from parent-child dependencies
 */
export function getDirectChildren(
  libraryId: LibraryId | string,
  dependencies: Array<{ blockedId: string; blockerId: string }>
): string[] {
  return dependencies
    .filter((dep) => dep.blockerId === libraryId)
    .map((dep) => dep.blockedId);
}

/**
 * Gets the parent library ID of a library (if it has one)
 */
export function getParentLibraryId(
  libraryId: LibraryId | string,
  libraryIds: Set<string>,
  dependencies: Array<{ blockedId: string; blockerId: string }>
): string | undefined {
  const parentDep = dependencies.find(
    (dep) => dep.blockedId === libraryId && libraryIds.has(dep.blockerId)
  );
  return parentDep?.blockerId;
}

/**
 * Gets all ancestor library IDs (parent, grandparent, etc.)
 * Returns ordered array from immediate parent to root
 */
export function getAncestorIds(
  libraryId: LibraryId | string,
  libraryIds: Set<string>,
  dependencies: Array<{ blockedId: string; blockerId: string }>,
  maxDepth = 100
): string[] {
  const ancestors: string[] = [];
  let currentId: string | undefined = libraryId;
  let depth = 0;

  while (depth < maxDepth) {
    const parentId = getParentLibraryId(currentId, libraryIds, dependencies);
    if (!parentId) break;
    ancestors.push(parentId);
    currentId = parentId;
    depth++;
  }

  return ancestors;
}

/**
 * Gets all descendant IDs (children, grandchildren, etc.) recursively
 * Uses BFS for efficiency
 */
export function getDescendantIds(
  libraryId: LibraryId | string,
  dependencies: Array<{ blockedId: string; blockerId: string }>,
  maxDepth = 100
): string[] {
  const descendants: string[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: libraryId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.depth >= maxDepth) continue;

    const children = getDirectChildren(current.id, dependencies);
    for (const childId of children) {
      if (!visited.has(childId) && childId !== libraryId) {
        visited.add(childId);
        descendants.push(childId);
        queue.push({ id: childId, depth: current.depth + 1 });
      }
    }
  }

  return descendants;
}

/**
 * Builds the ancestry information for a library
 */
export function buildAncestry(
  libraryId: LibraryId | string,
  libraryIds: Set<string>,
  dependencies: Array<{ blockedId: string; blockerId: string }>
): LibraryAncestry {
  const ancestors = getAncestorIds(libraryId, libraryIds, dependencies);
  // Reverse to get path from root to current (excluding current)
  const path = ancestors.reverse() as LibraryId[];
  return {
    path,
    depth: ancestors.length,
  };
}

/**
 * Detects if adding a parent-child relationship would create a cycle
 * (child would become parent of an ancestor)
 */
export function wouldCreateCycle(
  childId: LibraryId | string,
  proposedParentId: LibraryId | string,
  dependencies: Array<{ blockedId: string; blockerId: string }>
): boolean {
  // If the proposed parent is already a descendant of the child, adding it would create a cycle
  const descendants = getDescendantIds(childId, dependencies);
  return descendants.includes(proposedParentId as string);
}

/**
 * Filter libraries to only root libraries
 */
export function filterRootLibraries<T extends Library>(
  libraries: T[],
  dependencies: Array<{ blockedId: string; blockerId: string }>
): T[] {
  const libraryIds = new Set(libraries.map((lib) => lib.id as string));
  return libraries.filter((lib) => {
    // Check if this library has no parent-child dependency pointing to another library
    const hasLibraryParent = dependencies.some(
      (dep) => dep.blockedId === (lib.id as string) && libraryIds.has(dep.blockerId)
    );
    return !hasLibraryParent;
  });
}
