import { describe, expect, test } from 'bun:test';
import {
  Library,
  HydratedLibrary,
  LibraryId,
  MIN_LIBRARY_NAME_LENGTH,
  MAX_LIBRARY_NAME_LENGTH,
  isValidLibraryName,
  validateLibraryName,
  isValidLibraryId,
  validateLibraryId,
  isLibrary,
  validateLibrary,
  createLibrary,
  CreateLibraryInput,
  updateLibrary,
  UpdateLibraryInput,
  hasDescription,
  getLibraryDisplayName,
  filterByCreator,
  filterWithDescription,
  filterWithoutDescription,
  sortByName,
  sortByCreationDate,
  sortByUpdateDate,
  groupByCreator,
  searchByName,
  findByName,
  findById,
  isNameUnique,
  // New hierarchy and deletion types and functions
  LibraryDeletionMode,
  DeleteLibraryInput,
  DeleteLibraryResult,
  LibraryStats,
  LibraryAncestry,
  isRootLibrary,
  getDirectChildren,
  getParentLibraryId,
  getAncestorIds,
  getDescendantIds,
  buildAncestry,
  wouldCreateCycle,
  filterRootLibraries,
} from './library.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { DocumentId } from './document.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid library for testing
function createTestLibrary(overrides: Partial<Library> = {}): Library {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.LIBRARY,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    name: 'Test Library',
    ...overrides,
  };
}

// ============================================================================
// Validation Constants Tests
// ============================================================================

describe('Validation Constants', () => {
  test('MIN_LIBRARY_NAME_LENGTH is 1', () => {
    expect(MIN_LIBRARY_NAME_LENGTH).toBe(1);
  });

  test('MAX_LIBRARY_NAME_LENGTH is 100', () => {
    expect(MAX_LIBRARY_NAME_LENGTH).toBe(100);
  });
});

// ============================================================================
// isValidLibraryName Tests
// ============================================================================

describe('isValidLibraryName', () => {
  test('accepts valid names', () => {
    expect(isValidLibraryName('A')).toBe(true); // Min length
    expect(isValidLibraryName('Valid Library Name')).toBe(true);
    expect(isValidLibraryName('a'.repeat(MAX_LIBRARY_NAME_LENGTH))).toBe(true); // Max length
  });

  test('accepts name with leading/trailing spaces (trims them)', () => {
    expect(isValidLibraryName('  trimmed  ')).toBe(true);
  });

  test('rejects invalid names', () => {
    expect(isValidLibraryName('')).toBe(false);
    expect(isValidLibraryName('   ')).toBe(false); // Only whitespace
    expect(isValidLibraryName('a'.repeat(MAX_LIBRARY_NAME_LENGTH + 1))).toBe(false); // Too long
    expect(isValidLibraryName(null)).toBe(false);
    expect(isValidLibraryName(undefined)).toBe(false);
    expect(isValidLibraryName(123)).toBe(false);
  });
});

describe('validateLibraryName', () => {
  test('returns trimmed valid name', () => {
    expect(validateLibraryName('Valid name')).toBe('Valid name');
    expect(validateLibraryName('  trimmed  ')).toBe('trimmed');
  });

  test('throws for non-string', () => {
    expect(() => validateLibraryName(123)).toThrow(ValidationError);
    try {
      validateLibraryName(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('name');
    }
  });

  test('throws for empty name', () => {
    expect(() => validateLibraryName('')).toThrow(ValidationError);
    try {
      validateLibraryName('');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });

  test('throws for name exceeding max length', () => {
    const longName = 'a'.repeat(MAX_LIBRARY_NAME_LENGTH + 1);
    expect(() => validateLibraryName(longName)).toThrow(ValidationError);
    try {
      validateLibraryName(longName);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });
});

// ============================================================================
// isValidLibraryId / validateLibraryId Tests
// ============================================================================

describe('isValidLibraryId', () => {
  test('accepts valid library IDs', () => {
    expect(isValidLibraryId('el-abc')).toBe(true);
    expect(isValidLibraryId('el-abc123')).toBe(true);
    expect(isValidLibraryId('el-12345678')).toBe(true);
  });

  test('rejects invalid library IDs', () => {
    expect(isValidLibraryId('')).toBe(false);
    expect(isValidLibraryId('abc123')).toBe(false); // Missing el- prefix
    expect(isValidLibraryId('el-')).toBe(false); // Too short
    expect(isValidLibraryId('el-ab')).toBe(false); // Too short (need 3 chars min)
    expect(isValidLibraryId('el-123456789')).toBe(false); // Too long (max 8 chars)
    expect(isValidLibraryId('el-ABC')).toBe(false); // Uppercase not allowed
    expect(isValidLibraryId(null)).toBe(false);
    expect(isValidLibraryId(undefined)).toBe(false);
    expect(isValidLibraryId(123)).toBe(false);
  });
});

describe('validateLibraryId', () => {
  test('returns valid library ID', () => {
    const id = 'el-abc123';
    expect(validateLibraryId(id)).toBe(id as LibraryId);
  });

  test('throws for non-string', () => {
    expect(() => validateLibraryId(123)).toThrow(ValidationError);
    try {
      validateLibraryId(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('libraryId');
    }
  });

  test('throws for invalid format', () => {
    expect(() => validateLibraryId('invalid')).toThrow(ValidationError);
    try {
      validateLibraryId('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });
});

// ============================================================================
// isLibrary Type Guard Tests
// ============================================================================

describe('isLibrary', () => {
  test('accepts valid library', () => {
    expect(isLibrary(createTestLibrary())).toBe(true);
  });

  test('accepts library with optional fields', () => {
    expect(
      isLibrary(
        createTestLibrary({
          descriptionRef: 'el-doc123' as DocumentId,
        })
      )
    ).toBe(true);
  });

  test('accepts library with tags and metadata', () => {
    expect(
      isLibrary(
        createTestLibrary({
          tags: ['docs', 'api'],
          metadata: { version: '1.0' },
        })
      )
    ).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isLibrary(null)).toBe(false);
    expect(isLibrary(undefined)).toBe(false);
    expect(isLibrary('string')).toBe(false);
    expect(isLibrary(123)).toBe(false);
  });

  test('rejects libraries with missing required fields', () => {
    expect(isLibrary({ ...createTestLibrary(), id: undefined })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), type: undefined })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), name: undefined })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), createdBy: undefined })).toBe(false);
  });

  test('rejects libraries with wrong type', () => {
    expect(isLibrary({ ...createTestLibrary(), type: 'task' })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), type: 'document' })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), type: 'plan' })).toBe(false);
  });

  test('rejects libraries with invalid field values', () => {
    expect(isLibrary({ ...createTestLibrary(), name: '' })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), name: '   ' })).toBe(false); // Only whitespace
    expect(isLibrary({ ...createTestLibrary(), name: 'a'.repeat(101) })).toBe(false);
  });

  test('rejects libraries with invalid optional field types', () => {
    expect(isLibrary({ ...createTestLibrary(), descriptionRef: 123 })).toBe(false);
  });

  test('rejects libraries with invalid base fields', () => {
    expect(isLibrary({ ...createTestLibrary(), tags: 'not-array' })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), metadata: 'not-object' })).toBe(false);
    expect(isLibrary({ ...createTestLibrary(), metadata: null })).toBe(false);
  });
});

// ============================================================================
// validateLibrary Tests
// ============================================================================

describe('validateLibrary', () => {
  test('returns valid library', () => {
    const library = createTestLibrary();
    expect(validateLibrary(library)).toEqual(library);
  });

  test('throws for non-object', () => {
    expect(() => validateLibrary(null)).toThrow(ValidationError);
    expect(() => validateLibrary('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateLibrary({ ...createTestLibrary(), id: '' })).toThrow(ValidationError);
    expect(() => validateLibrary({ ...createTestLibrary(), createdBy: '' })).toThrow(ValidationError);
  });

  test('throws for wrong type value', () => {
    try {
      validateLibrary({ ...createTestLibrary(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('library');
    }
  });

  test('validates library-specific fields', () => {
    expect(() => validateLibrary({ ...createTestLibrary(), name: '' })).toThrow(ValidationError);
    expect(() => validateLibrary({ ...createTestLibrary(), name: 123 })).toThrow(ValidationError);
  });

  test('validates optional field types', () => {
    expect(() =>
      validateLibrary({
        ...createTestLibrary(),
        descriptionRef: 123,
      })
    ).toThrow(ValidationError);
  });

  test('throws for missing createdAt', () => {
    expect(() =>
      validateLibrary({
        ...createTestLibrary(),
        createdAt: undefined,
      })
    ).toThrow(ValidationError);
  });

  test('throws for missing updatedAt', () => {
    expect(() =>
      validateLibrary({
        ...createTestLibrary(),
        updatedAt: undefined,
      })
    ).toThrow(ValidationError);
  });

  test('throws for non-array tags', () => {
    expect(() =>
      validateLibrary({
        ...createTestLibrary(),
        tags: 'not-array',
      })
    ).toThrow(ValidationError);
  });

  test('throws for non-object metadata', () => {
    expect(() =>
      validateLibrary({
        ...createTestLibrary(),
        metadata: 'not-object',
      })
    ).toThrow(ValidationError);

    expect(() =>
      validateLibrary({
        ...createTestLibrary(),
        metadata: null,
      })
    ).toThrow(ValidationError);

    expect(() =>
      validateLibrary({
        ...createTestLibrary(),
        metadata: [],
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// createLibrary Factory Tests
// ============================================================================

describe('createLibrary', () => {
  const validInput: CreateLibraryInput = {
    name: 'Test Library',
    createdBy: 'el-system1' as EntityId,
  };

  test('creates library with required fields only', async () => {
    const library = await createLibrary(validInput);

    expect(library.name).toBe('Test Library');
    expect(library.type).toBe(ElementType.LIBRARY);
    expect(library.createdBy).toBe('el-system1' as EntityId);
    expect(library.tags).toEqual([]);
    expect(library.metadata).toEqual({});
    expect(library.id).toMatch(/^el-[0-9a-z]{3,8}$/);
    expect(library.descriptionRef).toBeUndefined();
  });

  test('creates library with all optional fields', async () => {
    const library = await createLibrary({
      ...validInput,
      descriptionRef: 'el-doc123' as DocumentId,
      tags: ['docs', 'api'],
      metadata: { version: '1.0' },
    });

    expect(library.descriptionRef).toBe('el-doc123' as DocumentId);
    expect(library.tags).toEqual(['docs', 'api']);
    expect(library.metadata).toEqual({ version: '1.0' });
  });

  test('trims name', async () => {
    const library = await createLibrary({ ...validInput, name: '  trimmed name  ' });
    expect(library.name).toBe('trimmed name');
  });

  test('validates name', async () => {
    await expect(createLibrary({ ...validInput, name: '' })).rejects.toThrow(ValidationError);
    await expect(
      createLibrary({ ...validInput, name: 'a'.repeat(MAX_LIBRARY_NAME_LENGTH + 1) })
    ).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs for different libraries', async () => {
    const lib1 = await createLibrary(validInput);
    const lib2 = await createLibrary({ ...validInput, name: 'Different Name' });

    expect(lib1.id).not.toBe(lib2.id);
  });

  test('sets createdAt and updatedAt to current time', async () => {
    const before = new Date().toISOString();
    const library = await createLibrary(validInput);
    const after = new Date().toISOString();

    expect(library.createdAt >= before).toBe(true);
    expect(library.createdAt <= after).toBe(true);
    expect(library.createdAt).toBe(library.updatedAt);
  });
});

// ============================================================================
// updateLibrary Tests
// ============================================================================

describe('updateLibrary', () => {
  test('updates name', () => {
    const library = createTestLibrary({ name: 'Original Name' });
    const updated = updateLibrary(library, { name: 'New Name' });

    expect(updated.name).toBe('New Name');
    expect(updated.updatedAt).not.toBe(library.updatedAt);
  });

  test('trims name on update', () => {
    const library = createTestLibrary();
    const updated = updateLibrary(library, { name: '  trimmed  ' });

    expect(updated.name).toBe('trimmed');
  });

  test('validates name on update', () => {
    const library = createTestLibrary();
    expect(() => updateLibrary(library, { name: '' })).toThrow(ValidationError);
    expect(() => updateLibrary(library, { name: 'a'.repeat(101) })).toThrow(ValidationError);
  });

  test('adds description reference', () => {
    const library = createTestLibrary();
    const updated = updateLibrary(library, { descriptionRef: 'el-doc123' as DocumentId });

    expect(updated.descriptionRef).toBe('el-doc123' as DocumentId);
  });

  test('removes description reference with null', () => {
    const library = createTestLibrary({ descriptionRef: 'el-doc123' as DocumentId });
    const updated = updateLibrary(library, { descriptionRef: null });

    expect(updated.descriptionRef).toBeUndefined();
  });

  test('preserves other fields', () => {
    const library = createTestLibrary({
      name: 'Original Name',
      tags: ['important'],
      metadata: { key: 'value' },
    });
    const updated = updateLibrary(library, { name: 'New Name' });

    expect(updated.tags).toEqual(['important']);
    expect(updated.metadata).toEqual({ key: 'value' });
    expect(updated.id).toBe(library.id);
    expect(updated.createdAt).toBe(library.createdAt);
    expect(updated.createdBy).toBe(library.createdBy);
  });

  test('updates only updatedAt when no changes', () => {
    const library = createTestLibrary();
    const updated = updateLibrary(library, {});

    expect(updated.name).toBe(library.name);
    expect(updated.updatedAt).not.toBe(library.updatedAt);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('hasDescription', () => {
  test('returns true when descriptionRef is present', () => {
    expect(hasDescription(createTestLibrary({ descriptionRef: 'el-doc123' as DocumentId }))).toBe(
      true
    );
  });

  test('returns false when descriptionRef is absent', () => {
    expect(hasDescription(createTestLibrary())).toBe(false);
  });
});

describe('getLibraryDisplayName', () => {
  test('returns the library name', () => {
    expect(getLibraryDisplayName(createTestLibrary({ name: 'My Library' }))).toBe('My Library');
  });
});

describe('filterByCreator', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, createdBy: 'el-user1' as EntityId }),
    createTestLibrary({ id: 'el-2' as ElementId, createdBy: 'el-user2' as EntityId }),
    createTestLibrary({ id: 'el-3' as ElementId, createdBy: 'el-user1' as EntityId }),
  ];

  test('filters libraries by creator', () => {
    const filtered = filterByCreator(libraries, 'el-user1' as EntityId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((l) => l.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });

  test('returns empty array when no matches', () => {
    expect(filterByCreator(libraries, 'el-user3' as EntityId)).toEqual([]);
  });
});

describe('filterWithDescription', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, descriptionRef: 'el-doc1' as DocumentId }),
    createTestLibrary({ id: 'el-2' as ElementId }),
    createTestLibrary({ id: 'el-3' as ElementId, descriptionRef: 'el-doc2' as DocumentId }),
  ];

  test('filters libraries with description', () => {
    const filtered = filterWithDescription(libraries);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((l) => l.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });
});

describe('filterWithoutDescription', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, descriptionRef: 'el-doc1' as DocumentId }),
    createTestLibrary({ id: 'el-2' as ElementId }),
    createTestLibrary({ id: 'el-3' as ElementId }),
  ];

  test('filters libraries without description', () => {
    const filtered = filterWithoutDescription(libraries);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((l) => l.id)).toEqual(['el-2' as ElementId, 'el-3' as ElementId]);
  });
});

describe('sortByName', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, name: 'Zebra' }),
    createTestLibrary({ id: 'el-2' as ElementId, name: 'Apple' }),
    createTestLibrary({ id: 'el-3' as ElementId, name: 'Mango' }),
  ];

  test('sorts libraries by name (ascending)', () => {
    const sorted = sortByName(libraries, true);
    expect(sorted.map((l) => l.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  test('sorts libraries by name (descending)', () => {
    const sorted = sortByName(libraries, false);
    expect(sorted.map((l) => l.name)).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  test('ascending is default', () => {
    const sorted = sortByName(libraries);
    expect(sorted.map((l) => l.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  test('does not mutate original array', () => {
    const original = [...libraries];
    sortByName(libraries);
    expect(libraries).toEqual(original);
  });
});

describe('sortByCreationDate', () => {
  const libraries: Library[] = [
    createTestLibrary({
      id: 'el-1' as ElementId,
      createdAt: '2025-01-20T10:00:00.000Z' as Timestamp,
    }),
    createTestLibrary({
      id: 'el-2' as ElementId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestLibrary({
      id: 'el-3' as ElementId,
      createdAt: '2025-01-21T10:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts libraries by creation date (newest first by default)', () => {
    const sorted = sortByCreationDate(libraries);
    expect(sorted.map((l) => l.id)).toEqual([
      'el-2' as ElementId, // Jan 22
      'el-3' as ElementId, // Jan 21
      'el-1' as ElementId, // Jan 20
    ]);
  });

  test('sorts libraries by creation date (oldest first)', () => {
    const sorted = sortByCreationDate(libraries, true);
    expect(sorted.map((l) => l.id)).toEqual([
      'el-1' as ElementId, // Jan 20
      'el-3' as ElementId, // Jan 21
      'el-2' as ElementId, // Jan 22
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...libraries];
    sortByCreationDate(libraries);
    expect(libraries).toEqual(original);
  });
});

describe('sortByUpdateDate', () => {
  const libraries: Library[] = [
    createTestLibrary({
      id: 'el-1' as ElementId,
      updatedAt: '2025-01-20T10:00:00.000Z' as Timestamp,
    }),
    createTestLibrary({
      id: 'el-2' as ElementId,
      updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestLibrary({
      id: 'el-3' as ElementId,
      updatedAt: '2025-01-21T10:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts libraries by update date (most recent first by default)', () => {
    const sorted = sortByUpdateDate(libraries);
    expect(sorted.map((l) => l.id)).toEqual([
      'el-2' as ElementId,
      'el-3' as ElementId,
      'el-1' as ElementId,
    ]);
  });

  test('sorts libraries by update date (oldest first)', () => {
    const sorted = sortByUpdateDate(libraries, true);
    expect(sorted.map((l) => l.id)).toEqual([
      'el-1' as ElementId,
      'el-3' as ElementId,
      'el-2' as ElementId,
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...libraries];
    sortByUpdateDate(libraries);
    expect(libraries).toEqual(original);
  });
});

describe('groupByCreator', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, createdBy: 'el-user1' as EntityId }),
    createTestLibrary({ id: 'el-2' as ElementId, createdBy: 'el-user2' as EntityId }),
    createTestLibrary({ id: 'el-3' as ElementId, createdBy: 'el-user1' as EntityId }),
    createTestLibrary({ id: 'el-4' as ElementId, createdBy: 'el-user2' as EntityId }),
  ];

  test('groups libraries by creator', () => {
    const groups = groupByCreator(libraries);
    expect(groups.size).toBe(2);
    expect(groups.get('el-user1' as EntityId)?.map((l) => l.id)).toEqual([
      'el-1' as ElementId,
      'el-3' as ElementId,
    ]);
    expect(groups.get('el-user2' as EntityId)?.map((l) => l.id)).toEqual([
      'el-2' as ElementId,
      'el-4' as ElementId,
    ]);
  });

  test('returns empty map for empty array', () => {
    const groups = groupByCreator([]);
    expect(groups.size).toBe(0);
  });
});

describe('searchByName', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, name: 'API Reference' }),
    createTestLibrary({ id: 'el-2' as ElementId, name: 'User Guide' }),
    createTestLibrary({ id: 'el-3' as ElementId, name: 'API Tutorial' }),
  ];

  test('searches libraries by name (case-insensitive)', () => {
    const results = searchByName(libraries, 'api');
    expect(results).toHaveLength(2);
    expect(results.map((l) => l.name)).toEqual(['API Reference', 'API Tutorial']);
  });

  test('returns all libraries for empty query', () => {
    const results = searchByName(libraries, '');
    expect(results).toHaveLength(3);
  });

  test('returns empty array when no matches', () => {
    expect(searchByName(libraries, 'xyz')).toEqual([]);
  });
});

describe('findByName', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, name: 'API Reference' }),
    createTestLibrary({ id: 'el-2' as ElementId, name: 'User Guide' }),
  ];

  test('finds library by exact name (case-insensitive)', () => {
    const found = findByName(libraries, 'api reference');
    expect(found?.id).toBe('el-1' as ElementId);
  });

  test('returns undefined when not found', () => {
    expect(findByName(libraries, 'Nonexistent')).toBeUndefined();
  });
});

describe('findById', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId }),
    createTestLibrary({ id: 'el-2' as ElementId }),
  ];

  test('finds library by ID', () => {
    const found = findById(libraries, 'el-1' as LibraryId);
    expect(found?.id).toBe('el-1' as ElementId);
  });

  test('accepts string ID', () => {
    const found = findById(libraries, 'el-2');
    expect(found?.id).toBe('el-2' as ElementId);
  });

  test('returns undefined when not found', () => {
    expect(findById(libraries, 'el-999' as LibraryId)).toBeUndefined();
  });
});

describe('isNameUnique', () => {
  const libraries: Library[] = [
    createTestLibrary({ id: 'el-1' as ElementId, name: 'API Reference' }),
    createTestLibrary({ id: 'el-2' as ElementId, name: 'User Guide' }),
  ];

  test('returns true for unique name', () => {
    expect(isNameUnique(libraries, 'New Library')).toBe(true);
  });

  test('returns false for duplicate name (case-insensitive)', () => {
    expect(isNameUnique(libraries, 'api reference')).toBe(false);
    expect(isNameUnique(libraries, 'API REFERENCE')).toBe(false);
  });

  test('excludes specific ID from check', () => {
    // Same name is allowed when updating the same library
    expect(isNameUnique(libraries, 'API Reference', 'el-1' as LibraryId)).toBe(true);
    // But not allowed if different ID
    expect(isNameUnique(libraries, 'API Reference', 'el-2' as LibraryId)).toBe(false);
  });

  test('trims name before checking', () => {
    expect(isNameUnique(libraries, '  API Reference  ')).toBe(false);
  });
});

// ============================================================================
// Edge Cases and Property-Based Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles maximum name length', async () => {
    const maxName = 'a'.repeat(MAX_LIBRARY_NAME_LENGTH);
    const library = await createLibrary({
      name: maxName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(library.name).toBe(maxName);
  });

  test('handles unicode in name', async () => {
    const unicodeName = '文档库 📚 ドキュメント';
    const library = await createLibrary({
      name: unicodeName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(library.name).toBe(unicodeName);
  });

  test('handles emoji in name', async () => {
    const emojiName = '📚 Knowledge Base 🎓';
    const library = await createLibrary({
      name: emojiName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(library.name).toBe(emojiName);
  });

  test('handles minimum name length', async () => {
    const minName = 'A';
    const library = await createLibrary({
      name: minName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(library.name).toBe(minName);
  });
});

describe('HydratedLibrary interface', () => {
  test('HydratedLibrary extends Library with hydrated fields', () => {
    const hydratedLibrary: HydratedLibrary = {
      ...createTestLibrary(),
      descriptionRef: 'el-doc1' as DocumentId,
      description: 'Full description content',
      documentCount: 10,
      subLibraryCount: 3,
    };

    expect(hydratedLibrary.description).toBe('Full description content');
    expect(hydratedLibrary.documentCount).toBe(10);
    expect(hydratedLibrary.subLibraryCount).toBe(3);
    expect(isLibrary(hydratedLibrary)).toBe(true); // Base library validation still works
  });

  test('HydratedLibrary works without optional fields', () => {
    const hydratedLibrary: HydratedLibrary = {
      ...createTestLibrary(),
    };

    expect(hydratedLibrary.description).toBeUndefined();
    expect(hydratedLibrary.documentCount).toBeUndefined();
    expect(hydratedLibrary.subLibraryCount).toBeUndefined();
    expect(isLibrary(hydratedLibrary)).toBe(true);
  });
});

describe('Update scenarios', () => {
  test('update name only', () => {
    const library = createTestLibrary({ name: 'Original' });
    const updated = updateLibrary(library, { name: 'Updated' });

    expect(updated.name).toBe('Updated');
    expect(updated.descriptionRef).toBeUndefined();
  });

  test('add description to library without one', () => {
    const library = createTestLibrary();
    const updated = updateLibrary(library, { descriptionRef: 'el-doc1' as DocumentId });

    expect(updated.descriptionRef).toBe('el-doc1' as DocumentId);
    expect(updated.name).toBe(library.name);
  });

  test('change description reference', () => {
    const library = createTestLibrary({ descriptionRef: 'el-doc1' as DocumentId });
    const updated = updateLibrary(library, { descriptionRef: 'el-doc2' as DocumentId });

    expect(updated.descriptionRef).toBe('el-doc2' as DocumentId);
  });

  test('update multiple fields at once', () => {
    const library = createTestLibrary({ name: 'Original' });
    const updated = updateLibrary(library, {
      name: 'New Name',
      descriptionRef: 'el-doc1' as DocumentId,
    });

    expect(updated.name).toBe('New Name');
    expect(updated.descriptionRef).toBe('el-doc1' as DocumentId);
  });
});

describe('Filter and sort combinations', () => {
  const libraries: Library[] = [
    createTestLibrary({
      id: 'el-1' as ElementId,
      name: 'Beta',
      createdBy: 'el-user1' as EntityId,
      createdAt: '2025-01-20T10:00:00.000Z' as Timestamp,
    }),
    createTestLibrary({
      id: 'el-2' as ElementId,
      name: 'Alpha',
      createdBy: 'el-user2' as EntityId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestLibrary({
      id: 'el-3' as ElementId,
      name: 'Gamma',
      createdBy: 'el-user1' as EntityId,
      createdAt: '2025-01-21T10:00:00.000Z' as Timestamp,
    }),
  ];

  test('filter then sort', () => {
    const filtered = filterByCreator(libraries, 'el-user1' as EntityId);
    const sorted = sortByName(filtered, true);

    expect(sorted.map((l) => l.name)).toEqual(['Beta', 'Gamma']);
  });

  test('sort then search', () => {
    const sorted = sortByCreationDate(libraries);
    const results = searchByName(sorted, 'a');

    // Should find Alpha, Beta, Gamma (all contain 'a')
    expect(results).toHaveLength(3);
    // Order should be preserved from sort (newest first)
    expect(results[0].name).toBe('Alpha'); // Jan 22
    expect(results[1].name).toBe('Gamma'); // Jan 21
    expect(results[2].name).toBe('Beta'); // Jan 20
  });
});

describe('Empty collection handling', () => {
  test('filter on empty array returns empty array', () => {
    expect(filterByCreator([], 'el-user1' as EntityId)).toEqual([]);
    expect(filterWithDescription([])).toEqual([]);
    expect(filterWithoutDescription([])).toEqual([]);
  });

  test('sort on empty array returns empty array', () => {
    expect(sortByName([])).toEqual([]);
    expect(sortByCreationDate([])).toEqual([]);
    expect(sortByUpdateDate([])).toEqual([]);
  });

  test('search on empty array returns empty array', () => {
    expect(searchByName([], 'test')).toEqual([]);
  });

  test('find on empty array returns undefined', () => {
    expect(findByName([], 'test')).toBeUndefined();
    expect(findById([], 'el-1' as LibraryId)).toBeUndefined();
  });

  test('isNameUnique on empty array returns true', () => {
    expect(isNameUnique([], 'Any Name')).toBe(true);
  });
});

// ============================================================================
// Deletion Type Constants Tests
// ============================================================================

describe('LibraryDeletionMode', () => {
  test('ORPHAN mode exists', () => {
    expect(LibraryDeletionMode.ORPHAN).toBe('orphan');
  });

  test('CASCADE mode exists', () => {
    expect(LibraryDeletionMode.CASCADE).toBe('cascade');
  });

  test('PREVENT mode exists', () => {
    expect(LibraryDeletionMode.PREVENT).toBe('prevent');
  });
});

// ============================================================================
// Hierarchy Utility Function Tests
// ============================================================================

describe('isRootLibrary', () => {
  test('returns true when library has no parent-child dependencies', () => {
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    expect(isRootLibrary('el-lib1', dependencies)).toBe(true);
  });

  test('returns true when library has dependencies but none as source', () => {
    const dependencies = [
      { blockedId: 'el-other', blockerId: 'el-lib1' },
    ];
    expect(isRootLibrary('el-lib1', dependencies)).toBe(true);
  });

  test('returns false when library has parent-child dependency as source', () => {
    const dependencies = [
      { blockedId: 'el-lib1', blockerId: 'el-parent' },
    ];
    expect(isRootLibrary('el-lib1', dependencies)).toBe(false);
  });
});

describe('getDirectChildren', () => {
  test('returns empty array when no children', () => {
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    expect(getDirectChildren('el-lib1', dependencies)).toEqual([]);
  });

  test('returns child IDs when library has children', () => {
    const dependencies = [
      { blockedId: 'el-doc1', blockerId: 'el-lib1' },
      { blockedId: 'el-doc2', blockerId: 'el-lib1' },
      { blockedId: 'el-doc3', blockerId: 'el-other' },
    ];
    const children = getDirectChildren('el-lib1', dependencies);
    expect(children).toHaveLength(2);
    expect(children).toContain('el-doc1');
    expect(children).toContain('el-doc2');
  });
});

describe('getParentLibraryId', () => {
  test('returns undefined when library has no parent', () => {
    const libraryIds = new Set(['el-lib1', 'el-lib2']);
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    expect(getParentLibraryId('el-lib1', libraryIds, dependencies)).toBeUndefined();
  });

  test('returns parent ID when library has a parent', () => {
    const libraryIds = new Set(['el-lib1', 'el-lib2', 'el-parent']);
    const dependencies = [
      { blockedId: 'el-lib1', blockerId: 'el-parent' },
    ];
    expect(getParentLibraryId('el-lib1', libraryIds, dependencies)).toBe('el-parent');
  });

  test('ignores dependencies to non-library targets', () => {
    const libraryIds = new Set(['el-lib1']);
    const dependencies = [
      { blockedId: 'el-lib1', blockerId: 'el-doc1' }, // doc is not a library
    ];
    expect(getParentLibraryId('el-lib1', libraryIds, dependencies)).toBeUndefined();
  });
});

describe('getAncestorIds', () => {
  test('returns empty array for root library', () => {
    const libraryIds = new Set(['el-root']);
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    expect(getAncestorIds('el-root', libraryIds, dependencies)).toEqual([]);
  });

  test('returns ancestors in order from immediate parent to root', () => {
    const libraryIds = new Set(['el-child', 'el-parent', 'el-grandparent']);
    const dependencies = [
      { blockedId: 'el-child', blockerId: 'el-parent' },
      { blockedId: 'el-parent', blockerId: 'el-grandparent' },
    ];
    const ancestors = getAncestorIds('el-child', libraryIds, dependencies);
    expect(ancestors).toEqual(['el-parent', 'el-grandparent']);
  });

  test('respects maxDepth parameter', () => {
    const libraryIds = new Set(['el-1', 'el-2', 'el-3', 'el-4']);
    const dependencies = [
      { blockedId: 'el-1', blockerId: 'el-2' },
      { blockedId: 'el-2', blockerId: 'el-3' },
      { blockedId: 'el-3', blockerId: 'el-4' },
    ];
    const ancestors = getAncestorIds('el-1', libraryIds, dependencies, 2);
    expect(ancestors).toEqual(['el-2', 'el-3']);
  });
});

describe('getDescendantIds', () => {
  test('returns empty array when no children', () => {
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    expect(getDescendantIds('el-lib1', dependencies)).toEqual([]);
  });

  test('returns all descendants recursively', () => {
    const dependencies = [
      { blockedId: 'el-child1', blockerId: 'el-root' },
      { blockedId: 'el-child2', blockerId: 'el-root' },
      { blockedId: 'el-grandchild', blockerId: 'el-child1' },
    ];
    const descendants = getDescendantIds('el-root', dependencies);
    expect(descendants).toHaveLength(3);
    expect(descendants).toContain('el-child1');
    expect(descendants).toContain('el-child2');
    expect(descendants).toContain('el-grandchild');
  });

  test('does not include the library itself', () => {
    const dependencies = [
      { blockedId: 'el-child', blockerId: 'el-root' },
    ];
    const descendants = getDescendantIds('el-root', dependencies);
    expect(descendants).not.toContain('el-root');
  });
});

describe('buildAncestry', () => {
  test('returns empty path and depth 0 for root library', () => {
    const libraryIds = new Set(['el-root']);
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    const ancestry = buildAncestry('el-root', libraryIds, dependencies);
    expect(ancestry.path).toEqual([]);
    expect(ancestry.depth).toBe(0);
  });

  test('returns path from root to library and correct depth', () => {
    const libraryIds = new Set(['el-child', 'el-parent', 'el-root']);
    const dependencies = [
      { blockedId: 'el-child', blockerId: 'el-parent' },
      { blockedId: 'el-parent', blockerId: 'el-root' },
    ];
    const ancestry = buildAncestry('el-child', libraryIds, dependencies);
    // Path should be from root to current (but not including current)
    expect(ancestry.path).toEqual(['el-root', 'el-parent'] as LibraryId[]);
    expect(ancestry.depth).toBe(2);
  });
});

describe('wouldCreateCycle', () => {
  test('returns false when no cycle would be created', () => {
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    expect(wouldCreateCycle('el-child', 'el-parent', dependencies)).toBe(false);
  });

  test('returns true when proposed parent is already a descendant', () => {
    // el-parent is a descendant of el-grandparent
    // If we try to nest el-grandparent under el-parent, it would create a cycle
    const dependencies = [
      { blockedId: 'el-parent', blockerId: 'el-grandparent' },
    ];
    expect(wouldCreateCycle('el-grandparent', 'el-parent', dependencies)).toBe(true);
  });

  test('returns false for unrelated libraries', () => {
    const dependencies = [
      { blockedId: 'el-other', blockerId: 'el-root' },
    ];
    expect(wouldCreateCycle('el-lib1', 'el-lib2', dependencies)).toBe(false);
  });
});

describe('filterRootLibraries', () => {
  test('returns empty array for empty input', () => {
    expect(filterRootLibraries([], [])).toEqual([]);
  });

  test('returns all libraries when none have parents', () => {
    const libraries = [
      createTestLibrary({ id: 'el-lib1' as ElementId, name: 'Lib 1' }),
      createTestLibrary({ id: 'el-lib2' as ElementId, name: 'Lib 2' }),
    ];
    const dependencies: Array<{ blockedId: string; blockerId: string }> = [];
    const roots = filterRootLibraries(libraries, dependencies);
    expect(roots).toHaveLength(2);
  });

  test('excludes libraries that have library parents', () => {
    const libraries = [
      createTestLibrary({ id: 'el-root' as ElementId, name: 'Root' }),
      createTestLibrary({ id: 'el-child' as ElementId, name: 'Child' }),
    ];
    const dependencies = [
      { blockedId: 'el-child', blockerId: 'el-root' },
    ];
    const roots = filterRootLibraries(libraries, dependencies);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('el-root' as ElementId);
  });

  test('includes libraries that only have non-library parents (documents)', () => {
    const libraries = [
      createTestLibrary({ id: 'el-lib1' as ElementId, name: 'Lib 1' }),
    ];
    // el-lib1 has a parent-child dependency pointing to a document (not in libraryIds)
    const dependencies = [
      { blockedId: 'el-lib1', blockerId: 'el-doc1' }, // doc is not a library
    ];
    const roots = filterRootLibraries(libraries, dependencies);
    expect(roots).toHaveLength(1);
  });
});
