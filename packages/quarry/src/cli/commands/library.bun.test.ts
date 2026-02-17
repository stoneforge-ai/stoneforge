/**
 * Library Commands E2E Tests
 *
 * Tests for the library CLI commands:
 * - library create: Create a new library
 * - library list: List libraries
 * - library add: Add document to library
 * - library remove: Remove document from library
 * - library docs: List documents in a library
 * - library nest: Nest library under another
 * - library roots: List root libraries
 * - library stats: Show library statistics
 * - library delete: Delete a library
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { libraryCommand } from './library.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Library } from '@stoneforge/core';
import type { Document } from '@stoneforge/core';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import { createDocument, ContentType } from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_library_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// Helper to create a library and return its ID
async function createTestLibrary(
  name: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const createSubCmd = libraryCommand.subcommands!['create'];
  const options = createTestOptions({ name, ...extra });
  const result = await createSubCmd.handler([], options);
  expect(result.exitCode).toBe(ExitCode.SUCCESS);
  return (result.data as { id: string }).id;
}

// Helper to create a document directly via API
async function createTestDocument(content: string = 'Test content'): Promise<string> {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  const api = createQuarryAPI(backend);

  const doc = await createDocument({
    content,
    contentType: ContentType.MARKDOWN,
    createdBy: 'test-user' as EntityId,
  });

  const created = await api.create(doc as unknown as Element & Record<string, unknown>);
  backend.close();
  return created.id;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Library Create Command Tests
// ============================================================================

describe('library create command', () => {
  const createSubCmd = libraryCommand.subcommands!['create'];

  test('creates a library with required name', async () => {
    const options = createTestOptions({ name: 'API Documentation' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const library = result.data as Library;
    expect(library.id).toMatch(/^el-/);
    expect(library.name).toBe('API Documentation');
    expect(library.type).toBe('library');
  });

  test('creates library with tags', async () => {
    const options = createTestOptions({ name: 'Design Docs', tag: ['design', 'frontend'] });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const library = result.data as Library;
    expect(library.tags).toContain('design');
    expect(library.tags).toContain('frontend');
  });

  test('fails without name', async () => {
    const options = createTestOptions();
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--name is required');
  });
});

// ============================================================================
// Library List Command Tests
// ============================================================================

describe('library list command', () => {
  const listSubCmd = libraryCommand.subcommands!['list'];

  test('lists all libraries', async () => {
    await createTestLibrary('Library 1');
    await createTestLibrary('Library 2');
    await createTestLibrary('Library 3');

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Library[]).length).toBe(3);
  });

  test('respects limit option', async () => {
    await createTestLibrary('Lib 1');
    await createTestLibrary('Lib 2');
    await createTestLibrary('Lib 3');

    const options = createTestOptions({ limit: '2' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Library[]).length).toBe(2);
  });

  test('returns message when no libraries', async () => {
    // Initialize empty database
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    backend.close();

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No libraries found');
  });
});

// ============================================================================
// Library Add/Remove Command Tests
// ============================================================================

describe('library add command', () => {
  const addSubCmd = libraryCommand.subcommands!['add'];

  test('adds a document to a library', async () => {
    const libraryId = await createTestLibrary('Test Library');
    const docId = await createTestDocument('Document content');

    const options = createTestOptions();
    const result = await addSubCmd.handler([libraryId, docId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Added document');
    expect(result.message).toContain(docId);
    expect(result.message).toContain(libraryId);
  });

  test('fails with missing arguments', async () => {
    const options = createTestOptions();
    const result = await addSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails when library not found', async () => {
    const docId = await createTestDocument('Some doc');
    const options = createTestOptions();
    const result = await addSubCmd.handler(['el-notexist', docId], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails when document not found', async () => {
    const libraryId = await createTestLibrary('Test Library');
    const options = createTestOptions();
    const result = await addSubCmd.handler([libraryId, 'el-notexist'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });
});

describe('library remove command', () => {
  const addSubCmd = libraryCommand.subcommands!['add'];
  const removeSubCmd = libraryCommand.subcommands!['remove'];

  test('removes a document from a library', async () => {
    const libraryId = await createTestLibrary('Test Library');
    const docId = await createTestDocument('Document content');

    // First add
    await addSubCmd.handler([libraryId, docId], createTestOptions());

    // Then remove
    const options = createTestOptions();
    const result = await removeSubCmd.handler([libraryId, docId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Removed document');
  });

  test('fails with missing arguments', async () => {
    const options = createTestOptions();
    const result = await removeSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });
});

// ============================================================================
// Library Docs Command Tests
// ============================================================================

describe('library docs command', () => {
  const addSubCmd = libraryCommand.subcommands!['add'];
  const docsSubCmd = libraryCommand.subcommands!['docs'];

  test('lists documents in a library', async () => {
    const libraryId = await createTestLibrary('Docs Library');
    const doc1Id = await createTestDocument('Doc 1');
    const doc2Id = await createTestDocument('Doc 2');

    await addSubCmd.handler([libraryId, doc1Id], createTestOptions());
    await addSubCmd.handler([libraryId, doc2Id], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await docsSubCmd.handler([libraryId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Document[]).length).toBe(2);
  });

  test('returns empty message when no documents', async () => {
    const libraryId = await createTestLibrary('Empty Library');

    const options = createTestOptions();
    const result = await docsSubCmd.handler([libraryId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No documents');
  });

  test('fails when library not found', async () => {
    // Initialize database first
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    backend.close();

    const options = createTestOptions();
    const result = await docsSubCmd.handler(['el-notexist'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Library Nest Command Tests
// ============================================================================

describe('library nest command', () => {
  const nestSubCmd = libraryCommand.subcommands!['nest'];

  test('nests a library under another', async () => {
    const parentId = await createTestLibrary('Parent Library');
    const childId = await createTestLibrary('Child Library');

    const options = createTestOptions();
    const result = await nestSubCmd.handler([childId, parentId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Nested library');
    expect(result.message).toContain(childId);
    expect(result.message).toContain(parentId);
  });

  test('fails with missing arguments', async () => {
    const options = createTestOptions();
    const result = await nestSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails when child library not found', async () => {
    const parentId = await createTestLibrary('Parent');
    const options = createTestOptions();
    const result = await nestSubCmd.handler(['el-notexist', parentId], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('fails when parent library not found', async () => {
    const childId = await createTestLibrary('Child');
    const options = createTestOptions();
    const result = await nestSubCmd.handler([childId, 'el-notexist'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('fails when library already has a parent', async () => {
    const parent1 = await createTestLibrary('Parent 1');
    const parent2 = await createTestLibrary('Parent 2');
    const child = await createTestLibrary('Child');

    // First nesting
    await nestSubCmd.handler([child, parent1], createTestOptions());

    // Second nesting should fail
    const result = await nestSubCmd.handler([child, parent2], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('already has a parent');
  });

  test('fails when trying to nest library under itself', async () => {
    const lib = await createTestLibrary('Self Reference');
    const options = createTestOptions();

    const result = await nestSubCmd.handler([lib, lib], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('cannot be nested under itself');
  });
});

// ============================================================================
// Library Roots Command Tests
// ============================================================================

describe('library roots command', () => {
  const nestSubCmd = libraryCommand.subcommands!['nest'];
  const rootsSubCmd = libraryCommand.subcommands!['roots'];

  test('lists root libraries (not nested)', async () => {
    const root1 = await createTestLibrary('Root 1');
    const root2 = await createTestLibrary('Root 2');
    const child = await createTestLibrary('Child');

    // Nest child under root1
    await nestSubCmd.handler([child, root1], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await rootsSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rootLibs = result.data as Library[];
    expect(rootLibs.length).toBe(2);
    const rootIds = rootLibs.map((l) => l.id);
    expect(rootIds).toContain(root1);
    expect(rootIds).toContain(root2);
    expect(rootIds).not.toContain(child);
  });

  test('returns all libraries when none are nested', async () => {
    await createTestLibrary('Lib 1');
    await createTestLibrary('Lib 2');

    const options = createTestOptions({ json: true });
    const result = await rootsSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Library[]).length).toBe(2);
  });

  test('returns message when no libraries', async () => {
    // Initialize empty database
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    backend.close();

    const options = createTestOptions();
    const result = await rootsSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No libraries found');
  });
});

// ============================================================================
// Library Stats Command Tests
// ============================================================================

describe('library stats command', () => {
  const addSubCmd = libraryCommand.subcommands!['add'];
  const nestSubCmd = libraryCommand.subcommands!['nest'];
  const statsSubCmd = libraryCommand.subcommands!['stats'];

  test('shows library statistics', async () => {
    const libraryId = await createTestLibrary('Stats Library');
    const doc1Id = await createTestDocument('Doc 1');
    const doc2Id = await createTestDocument('Doc 2');
    const subLibId = await createTestLibrary('Sub Library');

    // Add documents
    await addSubCmd.handler([libraryId, doc1Id], createTestOptions());
    await addSubCmd.handler([libraryId, doc2Id], createTestOptions());

    // Nest sub-library
    await nestSubCmd.handler([subLibId, libraryId], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await statsSubCmd.handler([libraryId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const stats = result.data as { documentCount: number; subLibraryCount: number };
    expect(stats.documentCount).toBe(2);
    expect(stats.subLibraryCount).toBe(1);
  });

  test('shows zero counts for empty library', async () => {
    const libraryId = await createTestLibrary('Empty Stats Library');

    const options = createTestOptions({ json: true });
    const result = await statsSubCmd.handler([libraryId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const stats = result.data as { documentCount: number; subLibraryCount: number };
    expect(stats.documentCount).toBe(0);
    expect(stats.subLibraryCount).toBe(0);
  });

  test('fails when library not found', async () => {
    // Initialize database first
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    backend.close();

    const options = createTestOptions();
    const result = await statsSubCmd.handler(['el-notexist'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Library Delete Command Tests
// ============================================================================

describe('library delete command', () => {
  const addSubCmd = libraryCommand.subcommands!['add'];
  const deleteSubCmd = libraryCommand.subcommands!['delete'];
  const listSubCmd = libraryCommand.subcommands!['list'];

  test('deletes an empty library', async () => {
    const libraryId = await createTestLibrary('To Delete');

    const options = createTestOptions();
    const result = await deleteSubCmd.handler([libraryId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Deleted library');

    // Verify it's gone
    const listResult = await listSubCmd.handler([], createTestOptions({ json: true }));
    const libs = listResult.data as Library[];
    expect(libs.find((l) => l.id === libraryId)).toBeUndefined();
  });

  test('prevents deletion of library with contents without force', async () => {
    const libraryId = await createTestLibrary('With Contents');
    const docId = await createTestDocument('Some doc');
    await addSubCmd.handler([libraryId, docId], createTestOptions());

    const options = createTestOptions();
    const result = await deleteSubCmd.handler([libraryId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('child element');
    expect(result.error).toContain('--force');
  });

  test('deletes library with contents when force is used', async () => {
    const libraryId = await createTestLibrary('Force Delete');
    const docId = await createTestDocument('Orphan doc');
    await addSubCmd.handler([libraryId, docId], createTestOptions());

    const options = createTestOptions({ force: true });
    const result = await deleteSubCmd.handler([libraryId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('orphaned');

    // Document should still exist (just orphaned)
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);
    const doc = await api.get(docId as ElementId);
    expect(doc).toBeDefined();
    backend.close();
  });

  test('fails when library not found', async () => {
    // Initialize database first
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    backend.close();

    const options = createTestOptions();
    const result = await deleteSubCmd.handler(['el-notexist'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Multi-Membership E2E Tests
// ============================================================================

describe('library multi-membership scenarios', () => {
  const addSubCmd = libraryCommand.subcommands!['add'];
  const removeSubCmd = libraryCommand.subcommands!['remove'];
  const docsSubCmd = libraryCommand.subcommands!['docs'];

  test('document can belong to multiple libraries', async () => {
    const lib1Id = await createTestLibrary('Lib 1');
    const lib2Id = await createTestLibrary('Lib 2');
    const docId = await createTestDocument('Shared Doc');

    // Add to both
    await addSubCmd.handler([lib1Id, docId], createTestOptions());
    await addSubCmd.handler([lib2Id, docId], createTestOptions());

    // Check lib1
    const lib1Docs = await docsSubCmd.handler([lib1Id], createTestOptions({ json: true }));
    expect((lib1Docs.data as Document[]).map((d) => d.id)).toContain(docId);

    // Check lib2
    const lib2Docs = await docsSubCmd.handler([lib2Id], createTestOptions({ json: true }));
    expect((lib2Docs.data as Document[]).map((d) => d.id)).toContain(docId);
  });

  test('removing from one library does not affect another', async () => {
    const lib1Id = await createTestLibrary('Lib A');
    const lib2Id = await createTestLibrary('Lib B');
    const docId = await createTestDocument('Multi-Lib Doc');

    // Add to both
    await addSubCmd.handler([lib1Id, docId], createTestOptions());
    await addSubCmd.handler([lib2Id, docId], createTestOptions());

    // Remove from lib1
    await removeSubCmd.handler([lib1Id, docId], createTestOptions());

    // Check lib1 - should be empty
    const lib1Docs = await docsSubCmd.handler([lib1Id], createTestOptions({ json: true }));
    expect((lib1Docs.data as Document[]).length).toBe(0);

    // Check lib2 - should still have the doc
    const lib2Docs = await docsSubCmd.handler([lib2Id], createTestOptions({ json: true }));
    expect((lib2Docs.data as Document[]).map((d) => d.id)).toContain(docId);
  });
});

// ============================================================================
// Library Hierarchy E2E Tests
// ============================================================================

describe('library hierarchy scenarios', () => {
  const nestSubCmd = libraryCommand.subcommands!['nest'];
  const rootsSubCmd = libraryCommand.subcommands!['roots'];
  const statsSubCmd = libraryCommand.subcommands!['stats'];
  const addSubCmd = libraryCommand.subcommands!['add'];

  test('creates multi-level hierarchy', async () => {
    const root = await createTestLibrary('Root');
    const level1A = await createTestLibrary('Level 1 - A');
    const level1B = await createTestLibrary('Level 1 - B');
    const level2 = await createTestLibrary('Level 2');

    // Build hierarchy: Root -> [Level1A -> Level2, Level1B]
    await nestSubCmd.handler([level1A, root], createTestOptions());
    await nestSubCmd.handler([level1B, root], createTestOptions());
    await nestSubCmd.handler([level2, level1A], createTestOptions());

    // Check roots - only root should be there
    const rootsResult = await rootsSubCmd.handler([], createTestOptions({ json: true }));
    const roots = rootsResult.data as Library[];
    expect(roots.length).toBe(1);
    expect(roots[0].id).toBe(root);

    // Check root stats - should have 2 sub-libraries
    const rootStats = await statsSubCmd.handler([root], createTestOptions({ json: true }));
    expect((rootStats.data as { subLibraryCount: number }).subLibraryCount).toBe(2);

    // Check level1A stats - should have 1 sub-library
    const level1AStats = await statsSubCmd.handler([level1A], createTestOptions({ json: true }));
    expect((level1AStats.data as { subLibraryCount: number }).subLibraryCount).toBe(1);
  });

  test('documents in nested libraries do not affect parent stats', async () => {
    const parent = await createTestLibrary('Parent');
    const child = await createTestLibrary('Child');
    const docId = await createTestDocument('Nested Doc');

    await nestSubCmd.handler([child, parent], createTestOptions());
    await addSubCmd.handler([child, docId], createTestOptions());

    // Parent should have 0 documents (only counts direct children)
    const parentStats = await statsSubCmd.handler([parent], createTestOptions({ json: true }));
    expect((parentStats.data as { documentCount: number }).documentCount).toBe(0);
    expect((parentStats.data as { subLibraryCount: number }).subLibraryCount).toBe(1);

    // Child should have 1 document
    const childStats = await statsSubCmd.handler([child], createTestOptions({ json: true }));
    expect((childStats.data as { documentCount: number }).documentCount).toBe(1);
  });
});

// ============================================================================
// Output Format Tests
// ============================================================================

describe('library command output formats', () => {
  const listSubCmd = libraryCommand.subcommands!['list'];
  const createSubCmd = libraryCommand.subcommands!['create'];

  test('list command returns JSON when --json is set', async () => {
    await createTestLibrary('JSON Test');

    const options = createTestOptions({ json: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
    // JSON mode should not have a message
    expect(result.message).toBeUndefined();
  });

  test('create command returns ID only in quiet mode', async () => {
    const options = createTestOptions({ name: 'Quiet Test', quiet: true });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // In quiet mode, the ID is returned as data, not message
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});
