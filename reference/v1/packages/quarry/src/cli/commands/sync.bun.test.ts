/**
 * Sync Commands Tests
 *
 * Tests for the sync CLI commands:
 * - export: Export elements to JSONL files
 * - import: Import elements from JSONL files
 * - status: Show sync status
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  syncCommand,
  exportCommand,
  importCommand,
  statusCommand,
} from './sync.js';
import { createCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import type { ExportResult, ImportResult } from '../../sync/types.js';
import type { Element, ElementId } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_sync_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');
const SYNC_DIR = join(STONEFORGE_DIR, 'sync');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T & Record<string, unknown> {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  } as GlobalOptions & T & Record<string, unknown>;
}

// Helper to create a task and return its ID
async function createTestTask(
  title: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const options = createTestOptions({ title, ...extra });
  const result = await createCommand.handler(['task'], options);
  return (result.data as { id: string }).id;
}

// Helper to create API instance for direct manipulation
function createTestAPI() {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  return { api: createQuarryAPI(backend), backend };
}

// Helper to create API with a fresh database (no leftover files)
function createFreshTestAPI() {
  // Remove and recreate the database
  if (existsSync(DB_PATH)) {
    rmSync(DB_PATH, { force: true });
  }
  if (existsSync(DB_PATH + '-journal')) {
    rmSync(DB_PATH + '-journal', { force: true });
  }
  if (existsSync(DB_PATH + '-wal')) {
    rmSync(DB_PATH + '-wal', { force: true });
  }
  if (existsSync(DB_PATH + '-shm')) {
    rmSync(DB_PATH + '-shm', { force: true });
  }
  return createTestAPI();
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// syncCommand Tests
// ============================================================================

describe('syncCommand', () => {
  describe('command definition', () => {
    test('has correct name', () => {
      expect(syncCommand.name).toBe('sync');
    });

    test('has description', () => {
      expect(syncCommand.description).toBeTruthy();
    });

    test('has usage', () => {
      expect(syncCommand.usage).toContain('sync');
    });

    test('has help text', () => {
      expect(syncCommand.help).toBeTruthy();
    });

    test('has subcommands', () => {
      expect(syncCommand.subcommands).toBeDefined();
      expect(syncCommand.subcommands?.export).toBeDefined();
      expect(syncCommand.subcommands?.import).toBeDefined();
      expect(syncCommand.subcommands?.status).toBeDefined();
    });
  });

  describe('handler', () => {
    test('returns error when called without subcommand', async () => {
      const options = createTestOptions();
      const result = await syncCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
      expect(result.error).toContain('Usage');
    });

    test('returns commands list in JSON mode', async () => {
      const options = createTestOptions({ json: true });
      const result = await syncCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toEqual({ commands: ['export', 'import', 'status'] });
    });
  });
});

// ============================================================================
// exportCommand Tests
// ============================================================================

describe('exportCommand', () => {
  describe('command definition', () => {
    test('has correct name', () => {
      expect(exportCommand.name).toBe('export');
    });

    test('has description', () => {
      expect(exportCommand.description).toBeTruthy();
    });

    test('has usage', () => {
      expect(exportCommand.usage).toContain('export');
    });

    test('has options', () => {
      expect(exportCommand.options).toBeDefined();
      expect(exportCommand.options?.some(o => o.name === 'output')).toBe(true);
      expect(exportCommand.options?.some(o => o.name === 'full')).toBe(true);
      expect(exportCommand.options?.some(o => o.name === 'include-ephemeral')).toBe(true);
    });
  });

  describe('empty database export', () => {
    test('exports empty database successfully', async () => {
      // Initialize empty database
      const { backend } = createTestAPI();

      const options = createTestOptions({ output: SYNC_DIR, full: true });
      const result = await exportCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ExportResult;
      expect(data.elementsExported).toBe(0);
      expect(data.dependenciesExported).toBe(0);
    });

    test('creates output files', async () => {
      createTestAPI();

      const options = createTestOptions({ output: SYNC_DIR, full: true });
      await exportCommand.handler([], options);

      expect(existsSync(join(SYNC_DIR, 'elements.jsonl'))).toBe(true);
      expect(existsSync(join(SYNC_DIR, 'dependencies.jsonl'))).toBe(true);
    });
  });

  describe('full export', () => {
    test('exports all tasks', async () => {
      await createTestTask('Task 1');
      await createTestTask('Task 2');
      await createTestTask('Task 3');

      const options = createTestOptions({ output: SYNC_DIR, full: true });
      const result = await exportCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ExportResult;
      expect(data.elementsExported).toBe(3);
    });

    test('creates valid JSONL content', async () => {
      const taskId = await createTestTask('My Test Task');

      const options = createTestOptions({ output: SYNC_DIR, full: true });
      await exportCommand.handler([], options);

      const content = readFileSync(join(SYNC_DIR, 'elements.jsonl'), 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      expect(lines.length).toBe(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.id).toBe(taskId);
      expect(parsed.title).toBe('My Test Task');
      expect(parsed.type).toBe('task');
    });
  });

  describe('incremental export', () => {
    test('marks incremental when not using --full', async () => {
      // Create tasks
      await createTestTask('Task 1');

      // Do an incremental export
      const incrementalOptions = createTestOptions({ output: SYNC_DIR });
      const result = await exportCommand.handler([], incrementalOptions);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ExportResult;
      expect(data.incremental).toBe(true);
    });

    test('clears dirty tracking after incremental export', async () => {
      // Create a task (will be marked dirty)
      await createTestTask('Task 1');

      // Do an incremental export - clears dirty tracking
      const firstOptions = createTestOptions({ output: SYNC_DIR });
      const firstResult = await exportCommand.handler([], firstOptions);
      expect((firstResult.data as ExportResult).elementsExported).toBe(1);

      // Second incremental export should have 0 elements (dirty was cleared)
      const secondResult = await exportCommand.handler([], firstOptions);
      expect((secondResult.data as ExportResult).elementsExported).toBe(0);
    });
  });

  describe('output modes', () => {
    test('returns JSON data in JSON mode', async () => {
      await createTestTask('Test Task');

      const options = createTestOptions({ output: SYNC_DIR, full: true, json: true });
      const result = await exportCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBeDefined();
      const data = result.data as ExportResult;
      expect(typeof data.elementsExported).toBe('number');
      expect(typeof data.dependenciesExported).toBe('number');
      expect(typeof data.elementsFile).toBe('string');
    });

    test('returns count in quiet mode', async () => {
      await createTestTask('Test Task');

      const options = createTestOptions({ output: SYNC_DIR, full: true, quiet: true });
      const result = await exportCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBe('1:0'); // 1 element, 0 dependencies
    });

    test('returns human-readable message in default mode', async () => {
      await createTestTask('Test Task');

      const options = createTestOptions({ output: SYNC_DIR, full: true });
      const result = await exportCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('export completed');
      expect(result.message).toContain('Elements exported');
    });
  });

  describe('error handling', () => {
    test('fails without database', async () => {
      const options = createTestOptions({ db: '/nonexistent/path/db.sqlite' });
      const result = await exportCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.error).toBeDefined();
    });
  });
});

// ============================================================================
// importCommand Tests
// ============================================================================

describe('importCommand', () => {
  describe('command definition', () => {
    test('has correct name', () => {
      expect(importCommand.name).toBe('import');
    });

    test('has description', () => {
      expect(importCommand.description).toBeTruthy();
    });

    test('has usage', () => {
      expect(importCommand.usage).toContain('import');
    });

    test('has options', () => {
      expect(importCommand.options).toBeDefined();
      expect(importCommand.options?.some(o => o.name === 'input')).toBe(true);
      expect(importCommand.options?.some(o => o.name === 'dry-run')).toBe(true);
      expect(importCommand.options?.some(o => o.name === 'force')).toBe(true);
    });
  });

  describe('basic import', () => {
    test('imports elements from JSONL files', async () => {
      // Create sync directory with test data
      mkdirSync(SYNC_DIR, { recursive: true });

      const element = {
        id: 'test-task-001',
        type: 'task',
        title: 'Imported Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: 'importer',
        tags: [],
        metadata: {},
      };

      writeFileSync(join(SYNC_DIR, 'elements.jsonl'), JSON.stringify(element) + '\n');
      writeFileSync(join(SYNC_DIR, 'dependencies.jsonl'), '');

      // Initialize the database
      createTestAPI();

      const options = createTestOptions({ input: SYNC_DIR });
      const result = await importCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ImportResult;
      expect(data.elementsImported).toBe(1);
    });

    test('skips elements that already exist and are unchanged', async () => {
      // Create a task
      await createTestTask('Existing Task');

      // Export the task
      const exportOptions = createTestOptions({ output: SYNC_DIR, full: true });
      await exportCommand.handler([], exportOptions);

      // Import from the same file
      const importOptions = createTestOptions({ input: SYNC_DIR });
      const result = await importCommand.handler([], importOptions);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ImportResult;
      expect(data.elementsSkipped).toBeGreaterThan(0);
    });
  });

  describe('dry run', () => {
    test('shows what would change without making changes', async () => {
      // Create sync directory with test data
      mkdirSync(SYNC_DIR, { recursive: true });

      const element = {
        id: 'test-task-002',
        type: 'task',
        title: 'Dry Run Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: 'importer',
        tags: [],
        metadata: {},
      };

      writeFileSync(join(SYNC_DIR, 'elements.jsonl'), JSON.stringify(element) + '\n');
      writeFileSync(join(SYNC_DIR, 'dependencies.jsonl'), '');

      // Initialize the database
      const { api } = createTestAPI();

      // Do a dry run import
      const options = createTestOptions({ input: SYNC_DIR, 'dry-run': true });
      const result = await importCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ImportResult;
      expect(data.elementsImported).toBe(1); // Would import

      // Verify nothing was actually imported
      const element2 = await api.get('test-task-002' as ElementId);
      expect(element2).toBeNull();
    });
  });

  describe('output modes', () => {
    test('returns JSON data in JSON mode', async () => {
      mkdirSync(SYNC_DIR, { recursive: true });
      writeFileSync(join(SYNC_DIR, 'elements.jsonl'), '');
      writeFileSync(join(SYNC_DIR, 'dependencies.jsonl'), '');
      createTestAPI();

      const options = createTestOptions({ input: SYNC_DIR, json: true });
      const result = await importCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ImportResult;
      expect(typeof data.elementsImported).toBe('number');
      expect(typeof data.elementsSkipped).toBe('number');
    });

    test('returns count in quiet mode', async () => {
      mkdirSync(SYNC_DIR, { recursive: true });
      writeFileSync(join(SYNC_DIR, 'elements.jsonl'), '');
      writeFileSync(join(SYNC_DIR, 'dependencies.jsonl'), '');
      createTestAPI();

      const options = createTestOptions({ input: SYNC_DIR, quiet: true });
      const result = await importCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBe('0:0'); // 0 elements, 0 dependencies
    });

    test('returns human-readable message in default mode', async () => {
      mkdirSync(SYNC_DIR, { recursive: true });
      writeFileSync(join(SYNC_DIR, 'elements.jsonl'), '');
      writeFileSync(join(SYNC_DIR, 'dependencies.jsonl'), '');
      createTestAPI();

      const options = createTestOptions({ input: SYNC_DIR });
      const result = await importCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Import completed');
    });
  });

  describe('error handling', () => {
    test('fails when input directory does not exist', async () => {
      createTestAPI();

      const options = createTestOptions({ input: '/nonexistent/path' });
      const result = await importCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
      expect(result.error).toContain('not found');
    });

    test('handles parse errors gracefully', async () => {
      mkdirSync(SYNC_DIR, { recursive: true });
      writeFileSync(join(SYNC_DIR, 'elements.jsonl'), 'not valid json\n');
      writeFileSync(join(SYNC_DIR, 'dependencies.jsonl'), '');
      createTestAPI();

      const options = createTestOptions({ input: SYNC_DIR });
      const result = await importCommand.handler([], options);

      // Import should complete but with errors
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as ImportResult;
      expect(data.errors.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// statusCommand Tests
// ============================================================================

describe('statusCommand', () => {
  describe('command definition', () => {
    test('has correct name', () => {
      expect(statusCommand.name).toBe('status');
    });

    test('has description', () => {
      expect(statusCommand.description).toBeTruthy();
    });

    test('has usage', () => {
      expect(statusCommand.usage).toContain('status');
    });
  });

  describe('status display', () => {
    test('shows empty database status', async () => {
      createTestAPI();

      const options = createTestOptions();
      const result = await statusCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Sync Status');
      expect(result.message).toContain('Total elements');
      expect(result.message).toContain('Pending changes');
    });

    test('shows dirty element count', async () => {
      await createTestTask('Test Task');

      const options = createTestOptions();
      const result = await statusCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { dirtyElementCount: number };
      expect(data.dirtyElementCount).toBe(1);
    });

    test('shows total element count', async () => {
      await createTestTask('Task 1');
      await createTestTask('Task 2');

      const options = createTestOptions();
      const result = await statusCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { totalElementCount: number };
      expect(data.totalElementCount).toBe(2);
    });

    test('returns hasPendingChanges correctly', async () => {
      createTestAPI();

      // Empty database should have no pending changes
      let options = createTestOptions();
      let result = await statusCommand.handler([], options);
      let data = result.data as { hasPendingChanges: boolean };
      expect(data.hasPendingChanges).toBe(false);

      // Create a task, now we should have pending changes
      await createTestTask('Test Task');
      result = await statusCommand.handler([], options);
      data = result.data as { hasPendingChanges: boolean };
      expect(data.hasPendingChanges).toBe(true);
    });
  });

  describe('output modes', () => {
    test('returns JSON data in JSON mode', async () => {
      createTestAPI();

      const options = createTestOptions({ json: true });
      const result = await statusCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBeDefined();
      const data = result.data as Record<string, unknown>;
      expect(typeof data.dirtyElementCount).toBe('number');
      expect(typeof data.totalElementCount).toBe('number');
    });

    test('returns dirty count in quiet mode', async () => {
      await createTestTask('Test Task');

      const options = createTestOptions({ quiet: true });
      const result = await statusCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBe('1'); // 1 dirty element
    });
  });

  describe('error handling', () => {
    test('fails without valid database path', async () => {
      const options = createTestOptions();
      // Override to simulate nonexistent database
      (options as Record<string, unknown>).db = '/nonexistent/path/db.sqlite';

      const result = await statusCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.error).toBeDefined();
    });
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('export-import round-trip', () => {
  test('preserves task data through export and import', async () => {
    // Create tasks
    const taskId = await createTestTask('Round Trip Task', {
      priority: '1',
      complexity: '5',
      tag: ['test-tag', 'important'],
    });

    // Export
    const exportOptions = createTestOptions({ output: SYNC_DIR, full: true });
    await exportCommand.handler([], exportOptions);

    // Create a fresh database with a different path for import
    const importDbPath = join(STONEFORGE_DIR, 'import-test.db');
    const importBackend = createStorage({ path: importDbPath, create: true });
    initializeSchema(importBackend);
    const importApi = createQuarryAPI(importBackend);

    // Import using the new database
    const importOptions = createTestOptions({ input: SYNC_DIR });
    (importOptions as Record<string, unknown>).db = importDbPath;
    const importResult = await importCommand.handler([], importOptions);

    expect(importResult.exitCode).toBe(ExitCode.SUCCESS);

    // Verify the task was imported correctly
    const task = await importApi.get(taskId as ElementId);
    expect(task).not.toBeNull();
    expect((task as Element & { title: string }).title).toBe('Round Trip Task');
    expect((task as Element & { priority: number }).priority).toBe(1);
    expect((task as Element & { complexity: number }).complexity).toBe(5);
    expect((task as Element).tags).toContain('test-tag');
    expect((task as Element).tags).toContain('important');

    // Clean up
    importBackend.close();
  });

  test('handles multiple elements', async () => {
    // Create multiple tasks
    await createTestTask('Task 1');
    await createTestTask('Task 2');
    await createTestTask('Task 3');

    // Export
    const exportOptions = createTestOptions({ output: SYNC_DIR, full: true });
    const exportResult = await exportCommand.handler([], exportOptions);
    expect((exportResult.data as ExportResult).elementsExported).toBe(3);

    // Create a fresh database with a different path for import
    const importDbPath = join(STONEFORGE_DIR, 'import-test-2.db');
    const importBackend = createStorage({ path: importDbPath, create: true });
    initializeSchema(importBackend);

    // Import using the new database
    const importOptions = createTestOptions({ input: SYNC_DIR });
    (importOptions as Record<string, unknown>).db = importDbPath;
    const importResult = await importCommand.handler([], importOptions);

    expect((importResult.data as ImportResult).elementsImported).toBe(3);

    // Clean up
    importBackend.close();
  });
});

// ============================================================================
// Integration with other commands
// ============================================================================

describe('integration with CRUD commands', () => {
  test('exported elements can be listed after import', async () => {
    const { listCommand } = await import('./crud.js');

    // Create and export tasks
    await createTestTask('Listable Task 1');
    await createTestTask('Listable Task 2');

    const exportOptions = createTestOptions({ output: SYNC_DIR, full: true });
    await exportCommand.handler([], exportOptions);

    // Create a fresh database with a different path for import
    const importDbPath = join(STONEFORGE_DIR, 'import-list-test.db');
    const importBackend = createStorage({ path: importDbPath, create: true });
    initializeSchema(importBackend);

    // Import using the new database
    const importOptions = createTestOptions({ input: SYNC_DIR });
    (importOptions as Record<string, unknown>).db = importDbPath;
    await importCommand.handler([], importOptions);

    // List tasks using the import database
    const listOptions = createTestOptions({ type: 'task' });
    (listOptions as Record<string, unknown>).db = importDbPath;
    const listResult = await listCommand.handler([], listOptions);

    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const items = listResult.data as Element[];
    expect(items.length).toBe(2);

    // Clean up
    importBackend.close();
  });
});
