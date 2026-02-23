/**
 * Docs Commands E2E Tests
 *
 * Tests for the docs CLI commands:
 * - docs init: Bootstrap Documentation library and directory
 * - docs add: Add document(s) to the Documentation library
 * - docs dir: Show the Documentation Directory document
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { docsCommand } from './docs.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Library, Document } from '@stoneforge/core';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import {
  createDocument,
  createLibrary,
  ContentType,
  type CreateDocumentInput,
  type CreateLibraryInput,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_docs_workspace__');
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

// Helper to create a document directly via API
async function createTestDocument(
  title: string = 'Test Document',
  content: string = 'Test content'
): Promise<string> {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  const api = createQuarryAPI(backend);

  const doc = await createDocument({
    title,
    content,
    contentType: ContentType.MARKDOWN,
    createdBy: 'test-user' as EntityId,
  });

  const created = await api.create(doc as unknown as Element & Record<string, unknown>);
  backend.close();
  return created.id;
}

// Helper to create a library directly via API
async function createTestLibrary(name: string): Promise<string> {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  const api = createQuarryAPI(backend);

  const lib = await createLibrary({
    name,
    createdBy: 'test-user' as EntityId,
  } as CreateLibraryInput);

  const created = await api.create(lib as unknown as Element & Record<string, unknown>);
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
// Docs Init Command Tests
// ============================================================================

describe('docs init command', () => {
  const initSubCmd = docsCommand.subcommands!['init'];

  test('creates Documentation library and directory on first run', async () => {
    const options = createTestOptions();
    const result = await initSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const data = result.data as {
      libraryId: string;
      directoryDocId: string;
      libraryCreated: boolean;
      directoryCreated: boolean;
    };

    expect(data.libraryId).toMatch(/^el-/);
    expect(data.directoryDocId).toMatch(/^el-/);
    expect(data.libraryCreated).toBe(true);
    expect(data.directoryCreated).toBe(true);
    expect(result.message).toContain('created');
  });

  test('is idempotent - returns existing IDs on subsequent runs', async () => {
    const options = createTestOptions();

    // First run
    const result1 = await initSubCmd.handler([], options);
    expect(result1.exitCode).toBe(ExitCode.SUCCESS);
    const data1 = result1.data as {
      libraryId: string;
      directoryDocId: string;
      libraryCreated: boolean;
      directoryCreated: boolean;
    };

    // Second run
    const result2 = await initSubCmd.handler([], options);
    expect(result2.exitCode).toBe(ExitCode.SUCCESS);
    const data2 = result2.data as {
      libraryId: string;
      directoryDocId: string;
      libraryCreated: boolean;
      directoryCreated: boolean;
    };

    // Same IDs
    expect(data2.libraryId).toBe(data1.libraryId);
    expect(data2.directoryDocId).toBe(data1.directoryDocId);

    // Not created on second run
    expect(data2.libraryCreated).toBe(false);
    expect(data2.directoryCreated).toBe(false);
    expect(result2.message).toContain('found');
  });

  test('does not create duplicates on multiple runs', async () => {
    const options = createTestOptions();

    // Run init three times
    await initSubCmd.handler([], options);
    await initSubCmd.handler([], options);
    await initSubCmd.handler([], options);

    // Check that only one library exists with the Documentation name
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    const libs = await api.listPaginated<Library>({ type: 'library' });
    const docLibs = libs.items.filter((l) => l.name === 'Documentation');
    expect(docLibs.length).toBe(1);

    // Check that only one directory document exists
    const docs = await api.listPaginated<Document>({ type: 'document' });
    const dirDocs = docs.items.filter(
      (d) =>
        d.metadata &&
        (d.metadata as Record<string, unknown>).purpose === 'document-directory'
    );
    expect(dirDocs.length).toBe(1);

    backend.close();
  });

  test('directory document contains self-reference in template', async () => {
    const options = createTestOptions();
    const result = await initSubCmd.handler([], options);

    const data = result.data as { directoryDocId: string };

    // Read the document and check its content
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    const doc = await api.get<Document>(data.directoryDocId as ElementId);
    expect(doc).toBeDefined();
    expect(doc!.content).toContain(data.directoryDocId);
    expect(doc!.content).toContain('Documentation Directory');
    expect(doc!.content).toContain('this document');

    backend.close();
  });

  test('directory document is added to the library', async () => {
    const options = createTestOptions();
    const result = await initSubCmd.handler([], options);

    const data = result.data as {
      libraryId: string;
      directoryDocId: string;
    };

    // Check that the dependency exists
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    const deps = await api.getDependencies(
      data.directoryDocId as ElementId,
      ['parent-child']
    );
    expect(deps.length).toBe(1);
    expect(deps[0].blockerId).toBe(data.libraryId);

    backend.close();
  });

  test('finds existing library if one was already created', async () => {
    // Create a Documentation library manually
    const existingLibId = await createTestLibrary('Documentation');

    const options = createTestOptions();
    const result = await initSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as {
      libraryId: string;
      libraryCreated: boolean;
      directoryCreated: boolean;
    };

    expect(data.libraryId).toBe(existingLibId);
    expect(data.libraryCreated).toBe(false);
    expect(data.directoryCreated).toBe(true);
  });

  test('outputs JSON format with --json', async () => {
    const options = createTestOptions({ json: true });
    const result = await initSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(result.message).toBeUndefined();

    const data = result.data as Record<string, unknown>;
    expect(data.libraryId).toBeDefined();
    expect(data.directoryDocId).toBeDefined();
    expect(data.libraryCreated).toBeDefined();
    expect(data.directoryCreated).toBeDefined();
  });

  test('outputs IDs only with --quiet', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await initSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // In quiet mode, data should be a string with IDs separated by newline
    const ids = (result.data as string).split('\n');
    expect(ids.length).toBe(2);
    expect(ids[0]).toMatch(/^el-/);
    expect(ids[1]).toMatch(/^el-/);
  });
});

// ============================================================================
// Docs Add Command Tests
// ============================================================================

describe('docs add command', () => {
  const initSubCmd = docsCommand.subcommands!['init'];
  const addSubCmd = docsCommand.subcommands!['add'];

  test('adds a document to the Documentation library', async () => {
    // First init
    await initSubCmd.handler([], createTestOptions());

    // Create a document
    const docId = await createTestDocument('Test Doc', 'Some content');

    // Add it
    const options = createTestOptions();
    const result = await addSubCmd.handler([docId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Added');
    expect(result.message).toContain(docId);
  });

  test('adds multiple documents in one call', async () => {
    await initSubCmd.handler([], createTestOptions());

    const doc1Id = await createTestDocument('Doc 1', 'Content 1');
    const doc2Id = await createTestDocument('Doc 2', 'Content 2');
    const doc3Id = await createTestDocument('Doc 3', 'Content 3');

    const options = createTestOptions({ json: true });
    const result = await addSubCmd.handler([doc1Id, doc2Id, doc3Id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as {
      libraryId: string;
      results: Array<{ docId: string; added: boolean }>;
    };
    expect(data.results.filter((r) => r.added).length).toBe(3);
  });

  test('errors when Documentation library does not exist', async () => {
    // Don't init, just create a document
    const docId = await createTestDocument('Orphan', 'No library');

    const options = createTestOptions();
    const result = await addSubCmd.handler([docId], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Documentation library not found');
    expect(result.error).toContain('sf docs init');
  });

  test('fails with missing arguments', async () => {
    const options = createTestOptions();
    const result = await addSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('skips document that does not exist', async () => {
    await initSubCmd.handler([], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await addSubCmd.handler(['el-notexist'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as {
      results: Array<{ docId: string; added: boolean; error?: string }>;
    };
    expect(data.results[0].added).toBe(false);
    expect(data.results[0].error).toContain('not found');
  });

  test('skips document already in library', async () => {
    await initSubCmd.handler([], createTestOptions());

    const docId = await createTestDocument('Already Added', 'Content');

    // Add once
    await addSubCmd.handler([docId], createTestOptions());

    // Add again - should skip
    const options = createTestOptions({ json: true });
    const result = await addSubCmd.handler([docId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as {
      results: Array<{ docId: string; added: boolean; error?: string }>;
    };
    expect(data.results[0].added).toBe(false);
    expect(data.results[0].error).toContain('Already in library');
  });

  test('skips non-document elements', async () => {
    await initSubCmd.handler([], createTestOptions());

    // The library itself is not a document
    const libId = await createTestLibrary('Not A Doc');

    const options = createTestOptions({ json: true });
    const result = await addSubCmd.handler([libId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as {
      results: Array<{ docId: string; added: boolean; error?: string }>;
    };
    expect(data.results[0].added).toBe(false);
    expect(data.results[0].error).toContain('not a document');
  });

  test('handles mixed valid and invalid document IDs', async () => {
    await initSubCmd.handler([], createTestOptions());

    const validDocId = await createTestDocument('Valid', 'Content');

    const options = createTestOptions({ json: true });
    const result = await addSubCmd.handler(
      [validDocId, 'el-notexist'],
      options
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as {
      results: Array<{ docId: string; added: boolean; error?: string }>;
    };
    expect(data.results.find((r) => r.docId === validDocId)?.added).toBe(true);
    expect(data.results.find((r) => r.docId === 'el-notexist')?.added).toBe(false);
  });

  test('outputs quiet format correctly', async () => {
    await initSubCmd.handler([], createTestOptions());

    const docId = await createTestDocument('Quiet Add', 'Content');

    const options = createTestOptions({ quiet: true });
    const result = await addSubCmd.handler([docId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(docId);
  });
});

// ============================================================================
// Docs Dir Command Tests
// ============================================================================

describe('docs dir command', () => {
  const initSubCmd = docsCommand.subcommands!['init'];
  const dirSubCmd = docsCommand.subcommands!['dir'];

  test('returns ID and title when directory exists', async () => {
    // First init to create the directory
    await initSubCmd.handler([], createTestOptions());

    const options = createTestOptions();
    const result = await dirSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const data = result.data as { id: string; title: string };
    expect(data.id).toMatch(/^el-/);
    expect(data.title).toBe('Documentation Directory');
    expect(result.message).toContain(data.id);
    expect(result.message).toContain('Documentation Directory');
  });

  test('returns full content when --content flag is used', async () => {
    await initSubCmd.handler([], createTestOptions());

    const options = createTestOptions({ content: true });
    const result = await dirSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const data = result.data as { id: string; title: string; content: string };
    expect(data.id).toMatch(/^el-/);
    expect(data.title).toBe('Documentation Directory');
    expect(data.content).toContain('Documentation Directory');
    expect(data.content).toContain('## Specs');
    expect(result.message).toContain(data.content);
  });

  test('errors when no directory exists (not yet initialized)', async () => {
    // Create a document to ensure the database exists, but don't init docs
    await createTestDocument('Unrelated', 'Some content');

    const options = createTestOptions();
    const result = await dirSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Documentation Directory not found');
    expect(result.error).toContain('sf docs init');
  });

  test('works with --json mode', async () => {
    await initSubCmd.handler([], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await dirSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toBeUndefined();

    const data = result.data as { id: string; title: string };
    expect(data.id).toMatch(/^el-/);
    expect(data.title).toBe('Documentation Directory');
  });

  test('works with --json and --content mode', async () => {
    await initSubCmd.handler([], createTestOptions());

    const options = createTestOptions({ json: true, content: true });
    const result = await dirSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toBeUndefined();

    const data = result.data as { id: string; title: string; content: string };
    expect(data.id).toMatch(/^el-/);
    expect(data.title).toBe('Documentation Directory');
    expect(data.content).toContain('Documentation Directory');
  });

  test('works with --quiet mode', async () => {
    await initSubCmd.handler([], createTestOptions());

    const options = createTestOptions({ quiet: true });
    const result = await dirSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // In quiet mode, data should be just the ID string
    expect(result.data).toMatch(/^el-/);
  });
});

// ============================================================================
// Docs Default Handler Tests
// ============================================================================

describe('docs default handler', () => {
  test('shows help when no subcommand given', async () => {
    const options = createTestOptions();
    const result = await docsCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('init');
    expect(result.message).toContain('add');
    expect(result.message).toContain('dir');
  });

  test('shows error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await docsCommand.handler(['foobar'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unknown subcommand');
    expect(result.error).toContain('foobar');
  });
});
