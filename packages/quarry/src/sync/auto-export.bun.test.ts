/**
 * Auto Export Service Tests
 *
 * Tests the automatic JSONL export polling service.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoExportService, createAutoExportService } from './auto-export.js';
import { SyncService, createSyncService } from './service.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import { ElementType, createTimestamp } from '@stoneforge/core';
import type { SyncConfig } from '../config/types.js';

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;
let backend: StorageBackend;
let syncService: SyncService;

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'stoneforge-auto-export-test-'));
}

function createTestBackend(path: string): StorageBackend {
  const backend = createStorage({ path });
  initializeSchema(backend);
  return backend;
}

function createTestElement(overrides: Partial<Element> & Record<string, unknown> = {}): Element {
  return {
    id: `el-${Math.random().toString(36).substring(2, 8)}` as ElementId,
    type: ElementType.TASK,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
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

function insertElement(backend: StorageBackend, element: Element): void {
  const { id, type, createdAt, updatedAt, createdBy, tags, ...data } = element;
  backend.run(
    `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, type, JSON.stringify(data), createdAt, updatedAt, createdBy]
  );
  for (const tag of tags) {
    backend.run('INSERT INTO tags (element_id, tag) VALUES (?, ?)', [id, tag]);
  }
}

function defaultSyncConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    autoExport: true,
    exportDebounce: 50, // Fast for tests
    elementsFile: 'elements.jsonl',
    dependenciesFile: 'dependencies.jsonl',
    ...overrides,
  };
}

/** Wait for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Test Suite
// ============================================================================

describe('AutoExportService', () => {
  beforeEach(() => {
    tempDir = createTempDir();
    backend = createTestBackend(join(tempDir, 'test.db'));
    syncService = createSyncService(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // --------------------------------------------------------------------------
  // Disabled behavior
  // --------------------------------------------------------------------------

  test('does nothing when autoExport is false', async () => {
    const outputDir = join(tempDir, 'sync');
    const service = createAutoExportService({
      syncService,
      backend,
      syncConfig: defaultSyncConfig({ autoExport: false }),
      outputDir,
    });

    await service.start();

    // No files should be created
    expect(existsSync(join(outputDir, 'elements.jsonl'))).toBe(false);

    service.stop();
  });

  // --------------------------------------------------------------------------
  // Initial full export
  // --------------------------------------------------------------------------

  test('runs initial full export on start', async () => {
    const task = createTestElement({ id: 'el-task1' as ElementId });
    insertElement(backend, task);

    const outputDir = join(tempDir, 'sync');
    const service = createAutoExportService({
      syncService,
      backend,
      syncConfig: defaultSyncConfig(),
      outputDir,
    });

    await service.start();

    // Files should exist with the element
    expect(existsSync(join(outputDir, 'elements.jsonl'))).toBe(true);
    const content = readFileSync(join(outputDir, 'elements.jsonl'), 'utf-8');
    expect(content).toContain('el-task1');

    service.stop();
  });

  // --------------------------------------------------------------------------
  // Incremental export on dirty elements
  // --------------------------------------------------------------------------

  test('triggers incremental export when dirty elements exist', async () => {
    const outputDir = join(tempDir, 'sync');
    const service = createAutoExportService({
      syncService,
      backend,
      syncConfig: defaultSyncConfig(),
      outputDir,
    });

    await service.start();

    // Insert an element and mark it dirty (simulating a mutation)
    const task = createTestElement({ id: 'el-task2' as ElementId });
    insertElement(backend, task);
    backend.markDirty('el-task2');

    // Wait for at least one poll cycle
    await sleep(120);

    // The dirty element should have been exported and dirty tracking cleared
    const dirty = backend.getDirtyElements();
    expect(dirty).toHaveLength(0);

    const content = readFileSync(join(outputDir, 'elements.jsonl'), 'utf-8');
    expect(content).toContain('el-task2');

    service.stop();
  });

  // --------------------------------------------------------------------------
  // Skips when no dirty elements
  // --------------------------------------------------------------------------

  test('skips export when no dirty elements exist', async () => {
    const outputDir = join(tempDir, 'sync');
    const service = createAutoExportService({
      syncService,
      backend,
      syncConfig: defaultSyncConfig(),
      outputDir,
    });

    await service.start();

    // Initial export creates files, then nothing should change
    const contentBefore = readFileSync(join(outputDir, 'elements.jsonl'), 'utf-8');

    // Wait for a couple poll cycles with no dirty elements
    await sleep(120);

    const contentAfter = readFileSync(join(outputDir, 'elements.jsonl'), 'utf-8');
    expect(contentAfter).toBe(contentBefore);

    service.stop();
  });

  // --------------------------------------------------------------------------
  // Stop halts polling
  // --------------------------------------------------------------------------

  test('stop halts polling', async () => {
    const outputDir = join(tempDir, 'sync');
    const service = createAutoExportService({
      syncService,
      backend,
      syncConfig: defaultSyncConfig(),
      outputDir,
    });

    await service.start();
    service.stop();

    // Insert and mark dirty after stop — should NOT be exported
    const task = createTestElement({ id: 'el-task3' as ElementId });
    insertElement(backend, task);
    backend.markDirty('el-task3');

    await sleep(120);

    // Dirty elements should still be pending (not cleared by export)
    const dirty = backend.getDirtyElements();
    expect(dirty).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // Overlapping exports prevented
  // --------------------------------------------------------------------------

  test('prevents overlapping exports', async () => {
    const outputDir = join(tempDir, 'sync');

    // Track export calls
    let exportCount = 0;
    const originalExport = syncService.export.bind(syncService);
    syncService.export = async (options) => {
      exportCount++;
      // Simulate slow export
      await sleep(100);
      return originalExport(options);
    };

    const service = createAutoExportService({
      syncService,
      backend,
      syncConfig: defaultSyncConfig({ exportDebounce: 10 }),
      outputDir,
    });

    await service.start();

    // Mark dirty to trigger export
    const task = createTestElement({ id: 'el-task4' as ElementId });
    insertElement(backend, task);
    backend.markDirty('el-task4');

    // Wait enough for multiple ticks but the slow export should block overlaps
    await sleep(150);

    service.stop();

    // The initial full export + at most one incremental (not many overlapping ones)
    // Initial export = 1, then the slow incremental should block further ones
    expect(exportCount).toBeLessThanOrEqual(3);
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  test('createAutoExportService returns an AutoExportService', () => {
    const outputDir = join(tempDir, 'sync');
    const service = createAutoExportService({
      syncService,
      backend,
      syncConfig: defaultSyncConfig(),
      outputDir,
    });

    expect(service).toBeInstanceOf(AutoExportService);
  });
});
