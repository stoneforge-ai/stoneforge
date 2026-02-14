/**
 * Sync Service Integration Tests
 *
 * Tests the full export/import functionality with a real storage backend.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SyncService, createSyncService } from './service.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Timestamp, Dependency } from '@stoneforge/core';
import { ElementType, createTimestamp, DependencyType } from '@stoneforge/core';
import { parseElements } from './serialization.js';

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;
let backend: StorageBackend;
let service: SyncService;

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'stoneforge-sync-test-'));
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

function createTestEntity(overrides: Partial<Element> & Record<string, unknown> = {}): Element {
  return {
    id: `el-${Math.random().toString(36).substring(2, 8)}` as ElementId,
    type: ElementType.ENTITY,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    name: 'Test Entity',
    entityType: 'human',
    isActive: true,
    ...overrides,
  } as Element;
}

function createTestDependency(
  blockedId: ElementId,
  blockerId: ElementId,
  type: DependencyType = DependencyType.BLOCKS
): Dependency {
  return {
    blockedId,
    blockerId,
    type,
    createdAt: createTimestamp(),
    createdBy: 'el-system1' as EntityId,
    metadata: {},
  };
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

function insertDependency(backend: StorageBackend, dep: Dependency): void {
  backend.run(
    `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      dep.blockedId,
      dep.blockerId,
      dep.type,
      dep.createdAt,
      dep.createdBy,
      Object.keys(dep.metadata).length > 0 ? JSON.stringify(dep.metadata) : null,
    ]
  );
}

function getElementCount(backend: StorageBackend): number {
  const row = backend.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM elements');
  return row?.count ?? 0;
}

function getDependencyCount(backend: StorageBackend): number {
  const row = backend.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM dependencies');
  return row?.count ?? 0;
}

function createTestBackend(path: string): StorageBackend {
  const backend = createStorage({ path });
  initializeSchema(backend);
  return backend;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('SyncService', () => {
  beforeEach(() => {
    tempDir = createTempDir();
    backend = createTestBackend(join(tempDir, 'test.db'));
    service = createSyncService(backend);
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
  // Export Tests
  // --------------------------------------------------------------------------

  describe('export', () => {
    test('exports empty database', async () => {
      const outputDir = join(tempDir, 'export');

      const result = await service.export({
        outputDir,
        full: true,
      });

      expect(result.elementsExported).toBe(0);
      expect(result.dependenciesExported).toBe(0);
      expect(result.incremental).toBe(false);
      expect(existsSync(result.elementsFile)).toBe(true);
      expect(existsSync(result.dependenciesFile)).toBe(true);
    });

    test('exports elements to JSONL file', async () => {
      // Insert test data
      const entity = createTestEntity({ id: 'el-entity1' as ElementId });
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, entity);
      insertElement(backend, task);

      const outputDir = join(tempDir, 'export');

      const result = await service.export({
        outputDir,
        full: true,
      });

      expect(result.elementsExported).toBe(2);

      // Verify file content
      const content = readFileSync(result.elementsFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      // First element should be entity (priority order)
      const firstElement = JSON.parse(lines[0]);
      expect(firstElement.type).toBe('entity');
    });

    test('exports dependencies to JSONL file', async () => {
      // Insert test data
      const task1 = createTestElement({ id: 'el-task1' as ElementId });
      const task2 = createTestElement({ id: 'el-task2' as ElementId });
      insertElement(backend, task1);
      insertElement(backend, task2);

      const dep = createTestDependency(task1.id, task2.id);
      insertDependency(backend, dep);

      const outputDir = join(tempDir, 'export');

      const result = await service.export({
        outputDir,
        full: true,
      });

      expect(result.dependenciesExported).toBe(1);

      // Verify file content
      const content = readFileSync(result.dependenciesFile, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.blockedId).toBe('el-task1');
      expect(parsed.blockerId).toBe('el-task2');
    });

    test('incremental export only exports dirty elements', async () => {
      // Insert test data
      const task1 = createTestElement({ id: 'el-task1' as ElementId });
      const task2 = createTestElement({ id: 'el-task2' as ElementId });
      insertElement(backend, task1);
      insertElement(backend, task2);

      // Mark only task1 as dirty
      backend.markDirty('el-task1');

      const outputDir = join(tempDir, 'export');

      const result = await service.export({
        outputDir,
        full: false, // Incremental
      });

      expect(result.elementsExported).toBe(1);
      expect(result.incremental).toBe(true);

      // Verify dirty tracking was cleared
      const dirty = backend.getDirtyElements();
      expect(dirty).toHaveLength(0);
    });

    test('uses custom file names', async () => {
      const outputDir = join(tempDir, 'export');

      const result = await service.export({
        outputDir,
        full: true,
        elementsFile: 'custom-elements.jsonl',
        dependenciesFile: 'custom-deps.jsonl',
      });

      expect(result.elementsFile).toContain('custom-elements.jsonl');
      expect(result.dependenciesFile).toContain('custom-deps.jsonl');
    });
  });

  describe('exportSync', () => {
    test('exports synchronously', () => {
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);

      const outputDir = join(tempDir, 'export');

      const result = service.exportSync({
        outputDir,
        full: true,
      });

      expect(result.elementsExported).toBe(1);
      expect(existsSync(result.elementsFile)).toBe(true);
    });
  });

  describe('exportToString', () => {
    test('returns JSONL strings', () => {
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);

      const result = service.exportToString();

      expect(result.elements).toContain('el-task1');
      expect(typeof result.elements).toBe('string');
    });

    test('includes dependencies when requested', () => {
      const task1 = createTestElement({ id: 'el-task1' as ElementId });
      const task2 = createTestElement({ id: 'el-task2' as ElementId });
      insertElement(backend, task1);
      insertElement(backend, task2);

      const dep = createTestDependency(task1.id, task2.id);
      insertDependency(backend, dep);

      const result = service.exportToString({ includeDependencies: true });

      expect(result.dependencies).toContain('el-task1');
      expect(result.dependencies).toContain('el-task2');
    });
  });

  // --------------------------------------------------------------------------
  // Import Tests
  // --------------------------------------------------------------------------

  describe('import', () => {
    test('imports elements from JSONL files', async () => {
      // Create export first
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);

      const exportDir = join(tempDir, 'export');
      await service.export({ outputDir: exportDir, full: true });

      // Clear database
      backend.run('DELETE FROM elements');
      backend.run('DELETE FROM tags');
      expect(getElementCount(backend)).toBe(0);

      // Import
      const result = await service.import({ inputDir: exportDir });

      expect(result.elementsImported).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(getElementCount(backend)).toBe(1);
    });

    test('imports dependencies from JSONL files', async () => {
      // Create export with dependency
      const task1 = createTestElement({ id: 'el-task1' as ElementId });
      const task2 = createTestElement({ id: 'el-task2' as ElementId });
      insertElement(backend, task1);
      insertElement(backend, task2);
      insertDependency(backend, createTestDependency(task1.id, task2.id));

      const exportDir = join(tempDir, 'export');
      await service.export({ outputDir: exportDir, full: true });

      // Clear database
      backend.run('DELETE FROM dependencies');
      backend.run('DELETE FROM elements');
      backend.run('DELETE FROM tags');

      // Import
      const result = await service.import({ inputDir: exportDir });

      expect(result.elementsImported).toBe(2);
      expect(result.dependenciesImported).toBe(1);
      expect(getDependencyCount(backend)).toBe(1);
    });

    test('dry run does not modify database', async () => {
      // Create export
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);

      const exportDir = join(tempDir, 'export');
      await service.export({ outputDir: exportDir, full: true });

      // Clear database
      backend.run('DELETE FROM elements');
      backend.run('DELETE FROM tags');

      // Import with dry run
      const result = await service.import({ inputDir: exportDir, dryRun: true });

      expect(result.elementsImported).toBe(1);
      expect(getElementCount(backend)).toBe(0); // Should not have imported
    });

    test('handles missing files gracefully', async () => {
      const inputDir = join(tempDir, 'nonexistent');
      mkdtempSync(inputDir);

      const result = await service.import({ inputDir });

      expect(result.elementsImported).toBe(0);
      expect(result.dependenciesImported).toBe(0);
    });
  });

  describe('importSync', () => {
    test('imports synchronously', () => {
      // Create export
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);

      const exportDir = join(tempDir, 'export');
      service.exportSync({ outputDir: exportDir, full: true });

      // Clear and import
      backend.run('DELETE FROM elements');
      backend.run('DELETE FROM tags');

      const result = service.importSync({ inputDir: exportDir });

      expect(result.elementsImported).toBe(1);
      expect(getElementCount(backend)).toBe(1);
    });
  });

  describe('importFromStrings', () => {
    test('imports from JSONL strings', () => {
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);

      const exported = service.exportToString();

      // Clear database
      backend.run('DELETE FROM elements');
      backend.run('DELETE FROM tags');

      const result = service.importFromStrings(exported.elements, exported.dependencies ?? '');

      expect(result.elementsImported).toBe(1);
      expect(getElementCount(backend)).toBe(1);
    });

    test('handles empty strings', () => {
      const result = service.importFromStrings('', '');

      expect(result.elementsImported).toBe(0);
      expect(result.dependenciesImported).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Merge Behavior Tests
  // --------------------------------------------------------------------------

  describe('merge behavior', () => {
    test('skips identical elements', () => {
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);

      const exported = service.exportToString();

      // Import the same data again
      const result = service.importFromStrings(exported.elements, '');

      expect(result.elementsImported).toBe(0);
      expect(result.elementsSkipped).toBe(1);
    });

    test('updates elements when remote is newer', () => {
      // Insert old version
      const oldTask = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'Old Title',
        updatedAt: '2025-01-20T10:00:00.000Z' as Timestamp,
      });
      insertElement(backend, oldTask);

      // Create newer version in JSONL
      const newTask = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'New Title',
        updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      });

      // Use export/parse to get proper JSONL
      const tempBackend = createTestBackend(join(tempDir, 'temp-export.db'));
      insertElement(tempBackend, newTask);
      const tempService = createSyncService(tempBackend);
      const exported = tempService.exportToString();
      tempBackend.close();

      // Import newer version
      const result = service.importFromStrings(exported.elements, '');

      expect(result.elementsImported).toBe(1);
      expect(result.conflicts).toHaveLength(1);
    });

    test('merges tags from both versions', () => {
      // Insert local with tags
      const localTask = createTestElement({
        id: 'el-task1' as ElementId,
        tags: ['local-tag'],
        updatedAt: '2025-01-20T10:00:00.000Z' as Timestamp,
      });
      insertElement(backend, localTask);

      // Create remote with different tags
      const remoteTask = createTestElement({
        id: 'el-task1' as ElementId,
        tags: ['remote-tag'],
        updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      });

      const tempBackend = createTestBackend(join(tempDir, 'temp-export2.db'));
      insertElement(tempBackend, remoteTask);
      const tempService = createSyncService(tempBackend);
      const exported = tempService.exportToString();
      tempBackend.close();

      // Import
      service.importFromStrings(exported.elements, '');

      // Check merged tags
      const tagRows = backend.query<{ tag: string }>('SELECT tag FROM tags WHERE element_id = ?', [
        'el-task1',
      ]);
      const tags = tagRows.map((r) => r.tag);

      expect(tags).toContain('local-tag');
      expect(tags).toContain('remote-tag');
    });

    test('force option overwrites local changes', () => {
      // Insert local version
      const localTask = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'Local Title',
        updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp, // Newer
      });
      insertElement(backend, localTask);

      // Create older remote version
      const remoteTask = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'Remote Title',
        updatedAt: '2025-01-20T10:00:00.000Z' as Timestamp, // Older
      });

      const tempBackend = createTestBackend(join(tempDir, 'temp-export3.db'));
      insertElement(tempBackend, remoteTask);
      const tempService = createSyncService(tempBackend);
      const exported = tempService.exportToString();
      tempBackend.close();

      // Import with force
      const result = service.importFromStrings(exported.elements, '', { force: true });

      expect(result.elementsImported).toBe(1);

      // Verify remote version was applied
      const row = backend.queryOne<{ data: string }>('SELECT data FROM elements WHERE id = ?', [
        'el-task1',
      ]);
      const data = JSON.parse(row?.data ?? '{}');
      expect(data.title).toBe('Remote Title');
    });
  });

  // --------------------------------------------------------------------------
  // Round-Trip Tests
  // --------------------------------------------------------------------------

  describe('round-trip', () => {
    test('export and import preserves all data', async () => {
      // Insert various elements
      const entity = createTestEntity({
        id: 'el-entity1' as ElementId,
        name: 'Test User',
      });
      const task1 = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'Task 1',
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' },
      });
      const task2 = createTestElement({
        id: 'el-task2' as ElementId,
        title: 'Task 2',
      });
      insertElement(backend, entity);
      insertElement(backend, task1);
      insertElement(backend, task2);

      // Add dependency
      insertDependency(backend, createTestDependency(task1.id, task2.id));

      // Export
      const exportDir = join(tempDir, 'export');
      const exportResult = await service.export({ outputDir: exportDir, full: true });

      // Verify exported files exist
      expect(existsSync(exportResult.elementsFile)).toBe(true);
      expect(existsSync(exportResult.dependenciesFile)).toBe(true);

      // Create new database and import
      const newDbPath = join(tempDir, 'new.db');
      const newBackend = createTestBackend(newDbPath);
      const newService = createSyncService(newBackend);

      const importResult = await newService.import({ inputDir: exportDir });

      expect(importResult.elementsImported).toBe(3);
      expect(importResult.dependenciesImported).toBe(1);
      expect(importResult.errors).toHaveLength(0);

      // Verify data integrity
      expect(getElementCount(newBackend)).toBe(3);
      expect(getDependencyCount(newBackend)).toBe(1);

      // Verify entity
      const entityRow = newBackend.queryOne<{ data: string; type: string }>(
        'SELECT data, type FROM elements WHERE id = ?',
        ['el-entity1']
      );
      expect(entityRow?.type).toBe('entity');
      expect(JSON.parse(entityRow?.data ?? '{}').name).toBe('Test User');

      // Verify task with tags and metadata
      const taskRow = newBackend.queryOne<{ data: string }>(
        'SELECT data FROM elements WHERE id = ?',
        ['el-task1']
      );
      const taskData = JSON.parse(taskRow?.data ?? '{}');
      expect(taskData.title).toBe('Task 1');
      expect(taskData.metadata).toEqual({ key: 'value' });

      // Verify tags
      const tagRows = newBackend.query<{ tag: string }>(
        'SELECT tag FROM tags WHERE element_id = ?',
        ['el-task1']
      );
      expect(tagRows.map((r) => r.tag).sort()).toEqual(['tag1', 'tag2']);

      // Verify dependency
      const depRow = newBackend.queryOne<{ blocked_id: string; blocker_id: string }>(
        'SELECT blocked_id, blocker_id FROM dependencies'
      );
      expect(depRow?.blocked_id).toBe('el-task1');
      expect(depRow?.blocker_id).toBe('el-task2');

      newBackend.close();
    });

    test('multiple export/import cycles are stable', async () => {
      // Insert data
      const task = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'Stable Task',
        tags: ['stable'],
      });
      insertElement(backend, task);

      const exportDir = join(tempDir, 'export');

      // First export
      await service.export({ outputDir: exportDir, full: true });
      const content1 = readFileSync(join(exportDir, 'elements.jsonl'), 'utf-8');

      // Import back
      backend.run('DELETE FROM elements');
      backend.run('DELETE FROM tags');
      await service.import({ inputDir: exportDir });

      // Second export
      await service.export({ outputDir: exportDir, full: true });
      const content2 = readFileSync(join(exportDir, 'elements.jsonl'), 'utf-8');

      // Content should be identical (excluding timestamps in createdAt/updatedAt)
      const parsed1 = parseElements(content1).elements;
      const parsed2 = parseElements(content2).elements;

      expect(parsed1.length).toBe(parsed2.length);
      expect(parsed1[0].id).toBe(parsed2[0].id);
      expect(parsed1[0].tags).toEqual(parsed2[0].tags);
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling Tests
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    test('reports parse errors in elements', () => {
      const badContent = `{"invalid": "element"}
{"also": "invalid"}`;

      const result = service.importFromStrings(badContent, '');

      expect(result.elementsImported).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].file).toBe('elements');
    });

    test('reports parse errors in dependencies', () => {
      const elementsContent = '';
      const badDepsContent = `{"invalid": "dependency"}`;

      const result = service.importFromStrings(elementsContent, badDepsContent);

      expect(result.dependenciesImported).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].file).toBe('dependencies');
    });

    test('continues importing valid elements despite errors', () => {
      // Create one valid element
      const task = createTestElement({ id: 'el-task1' as ElementId });
      const tempBackend = createTestBackend(join(tempDir, 'temp.db'));
      insertElement(tempBackend, task);
      const exported = createSyncService(tempBackend).exportToString();
      tempBackend.close();

      // Add invalid content
      const mixedContent = `${exported.elements}
{"invalid": "element"}`;

      const result = service.importFromStrings(mixedContent, '');

      expect(result.elementsImported).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });
});
