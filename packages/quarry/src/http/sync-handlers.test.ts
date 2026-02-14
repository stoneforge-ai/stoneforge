/**
 * HTTP Sync Handlers Tests
 *
 * Tests for the browser sync HTTP handlers.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SyncHttpHandlers,
  createSyncHttpHandlers,
  getHttpStatus,
  parseRequestBody,
  serializeResponse,
} from './sync-handlers.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Timestamp, Dependency } from '@stoneforge/core';
import { ElementType, createTimestamp, DependencyType, ErrorCode } from '@stoneforge/core';

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;
let backend: StorageBackend;
let handlers: SyncHttpHandlers;

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'stoneforge-http-sync-test-'));
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

function createTestBackend(path: string): StorageBackend {
  const backend = createStorage({ path });
  initializeSchema(backend);
  return backend;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('SyncHttpHandlers', () => {
  beforeEach(() => {
    tempDir = createTempDir();
    backend = createTestBackend(join(tempDir, 'test.db'));
    handlers = createSyncHttpHandlers(backend);
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
  // Status Endpoint Tests
  // --------------------------------------------------------------------------

  describe('getStatus', () => {
    test('returns status with no dirty elements', () => {
      const response = handlers.getStatus();

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.dirtyElementCount).toBe(0);
      expect(response.data?.hasPendingChanges).toBe(false);
    });

    test('returns status with dirty elements', () => {
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, task);
      backend.markDirty('el-task1');

      const response = handlers.getStatus();

      expect(response.success).toBe(true);
      expect(response.data?.dirtyElementCount).toBe(1);
      expect(response.data?.hasPendingChanges).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Pull Endpoint Tests
  // --------------------------------------------------------------------------

  describe('pull', () => {
    test('returns empty response for empty database', () => {
      const response = handlers.pull();

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.elements).toBe('');
      expect(response.data?.elementCount).toBe(0);
      expect(response.data?.exportedAt).toBeDefined();
    });

    test('exports elements as JSONL', () => {
      const entity = createTestEntity({ id: 'el-entity1' as ElementId });
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(backend, entity);
      insertElement(backend, task);

      const response = handlers.pull();

      expect(response.success).toBe(true);
      expect(response.data?.elementCount).toBe(2);

      // Parse JSONL content
      const lines = response.data?.elements.trim().split('\n') ?? [];
      expect(lines).toHaveLength(2);

      // First line should be entity (priority order)
      const firstElement = JSON.parse(lines[0]);
      expect(firstElement.type).toBe('entity');
    });

    test('exports dependencies when requested', () => {
      const task1 = createTestElement({ id: 'el-task1' as ElementId });
      const task2 = createTestElement({ id: 'el-task2' as ElementId });
      insertElement(backend, task1);
      insertElement(backend, task2);

      const dep = createTestDependency(task2.id, task1.id);
      insertDependency(backend, dep);

      const response = handlers.pull({ includeDependencies: true });

      expect(response.success).toBe(true);
      expect(response.data?.dependencyCount).toBe(1);
      expect(response.data?.dependencies).toContain('el-task1');
    });

    test('excludes dependencies when not requested', () => {
      const task1 = createTestElement({ id: 'el-task1' as ElementId });
      const task2 = createTestElement({ id: 'el-task2' as ElementId });
      insertElement(backend, task1);
      insertElement(backend, task2);

      const dep = createTestDependency(task2.id, task1.id);
      insertDependency(backend, dep);

      const response = handlers.pull({ includeDependencies: false });

      expect(response.success).toBe(true);
      expect(response.data?.dependencies).toBeUndefined();
      expect(response.data?.dependencyCount).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Push Endpoint Tests
  // --------------------------------------------------------------------------

  describe('push', () => {
    test('imports elements from JSONL string', () => {
      // Create elements in a separate backend
      const tempBackend = createTestBackend(join(tempDir, 'temp.db'));
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(tempBackend, task);
      const exported = createSyncHttpHandlers(tempBackend).pull();
      tempBackend.close();

      // Push to main backend
      const response = handlers.push({
        elements: exported.data?.elements ?? '',
        dependencies: exported.data?.dependencies ?? '',
      });

      expect(response.success).toBe(true);
      expect(response.data?.result.elementsImported).toBe(1);
      expect(getElementCount(backend)).toBe(1);
    });

    test('returns server state after push', () => {
      // Create elements in temp backend and push
      const tempBackend = createTestBackend(join(tempDir, 'temp.db'));
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(tempBackend, task);
      const exported = createSyncHttpHandlers(tempBackend).pull();
      tempBackend.close();

      const response = handlers.push({
        elements: exported.data?.elements ?? '',
        dependencies: '',
      });

      expect(response.success).toBe(true);
      expect(response.data?.serverState).toBeDefined();
      expect(response.data?.serverState?.elementCount).toBe(1);
    });

    test('dry run does not modify database', () => {
      // Create elements in temp backend
      const tempBackend = createTestBackend(join(tempDir, 'temp.db'));
      const task = createTestElement({ id: 'el-task1' as ElementId });
      insertElement(tempBackend, task);
      const exported = createSyncHttpHandlers(tempBackend).pull();
      tempBackend.close();

      const response = handlers.push({
        elements: exported.data?.elements ?? '',
        dependencies: '',
        dryRun: true,
      });

      expect(response.success).toBe(true);
      expect(response.data?.result.elementsImported).toBe(1);
      expect(getElementCount(backend)).toBe(0); // Should not be imported
      expect(response.data?.serverState).toBeUndefined();
    });

    test('validates elements field is provided', () => {
      const response = handlers.push({
        elements: undefined as unknown as string,
      });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    });

    test('handles invalid JSONL gracefully', () => {
      const response = handlers.push({
        elements: '{"invalid": "element"}\n{"also": "invalid"}',
        dependencies: '',
      });

      expect(response.success).toBe(true);
      expect(response.data?.result.elementsImported).toBe(0);
      expect(response.data?.result.errors.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Exchange Endpoint Tests
  // --------------------------------------------------------------------------

  describe('exchange', () => {
    test('performs bidirectional sync', () => {
      // Server has an element
      const serverTask = createTestElement({ id: 'el-server1' as ElementId, title: 'Server Task' });
      insertElement(backend, serverTask);

      // Client has a different element
      const clientBackend = createTestBackend(join(tempDir, 'client.db'));
      const clientTask = createTestElement({ id: 'el-client1' as ElementId, title: 'Client Task' });
      insertElement(clientBackend, clientTask);
      const clientExported = createSyncHttpHandlers(clientBackend).pull();
      clientBackend.close();

      // Exchange
      const response = handlers.exchange({
        elements: clientExported.data?.elements ?? '',
        dependencies: clientExported.data?.dependencies ?? '',
      });

      expect(response.success).toBe(true);
      expect(response.data?.importResult.elementsImported).toBe(1);
      expect(response.data?.serverElementCount).toBe(2); // Server has both now

      // Server should have both elements
      expect(getElementCount(backend)).toBe(2);
    });

    test('returns merged state for client', () => {
      const serverTask = createTestElement({ id: 'el-server1' as ElementId });
      insertElement(backend, serverTask);

      const response = handlers.exchange({
        elements: '',
        dependencies: '',
      });

      expect(response.success).toBe(true);
      expect(response.data?.serverElements).toContain('el-server1');
      expect(response.data?.syncedAt).toBeDefined();
    });

    test('validates elements field is provided', () => {
      const response = handlers.exchange({
        elements: undefined as unknown as string,
      });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    });
  });

  // --------------------------------------------------------------------------
  // Helper Function Tests
  // --------------------------------------------------------------------------

  describe('getHttpStatus', () => {
    test('returns 200 for success', () => {
      expect(getHttpStatus({ success: true })).toBe(200);
    });

    test('returns 400 for validation errors', () => {
      expect(
        getHttpStatus({
          success: false,
          error: { code: ErrorCode.MISSING_REQUIRED_FIELD, message: 'test' },
        })
      ).toBe(400);

      expect(
        getHttpStatus({
          success: false,
          error: { code: ErrorCode.INVALID_INPUT, message: 'test' },
        })
      ).toBe(400);
    });

    test('returns 404 for not found', () => {
      expect(
        getHttpStatus({
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: 'test' },
        })
      ).toBe(404);
    });

    test('returns 409 for conflicts', () => {
      expect(
        getHttpStatus({
          success: false,
          error: { code: ErrorCode.ALREADY_EXISTS, message: 'test' },
        })
      ).toBe(409);

      expect(
        getHttpStatus({
          success: false,
          error: { code: ErrorCode.SYNC_CONFLICT, message: 'test' },
        })
      ).toBe(409);
    });

    test('returns 500 for unknown errors', () => {
      expect(
        getHttpStatus({
          success: false,
          error: { code: 'UNKNOWN', message: 'test' },
        })
      ).toBe(500);
    });
  });

  describe('parseRequestBody', () => {
    test('parses JSON body', () => {
      const result = parseRequestBody<{ foo: string }>('{"foo": "bar"}');
      expect(result).toEqual({ foo: 'bar' });
    });
  });

  describe('serializeResponse', () => {
    test('serializes response to JSON', () => {
      const response = { success: true, data: { count: 5 } };
      const serialized = serializeResponse(response);
      expect(JSON.parse(serialized)).toEqual(response);
    });
  });

  // --------------------------------------------------------------------------
  // Factory Function Tests
  // --------------------------------------------------------------------------

  describe('createSyncHttpHandlers', () => {
    test('creates handler instance', () => {
      const instance = createSyncHttpHandlers(backend);
      expect(instance).toBeInstanceOf(SyncHttpHandlers);
    });
  });

  // --------------------------------------------------------------------------
  // Round-Trip Tests
  // --------------------------------------------------------------------------

  describe('round-trip sync', () => {
    test('client can pull, modify, push, and get updated state', () => {
      // Server has initial state
      const serverTask = createTestElement({
        id: 'el-server1' as ElementId,
        title: 'Server Task',
      });
      insertElement(backend, serverTask);

      // Client pulls
      const pullResponse = handlers.pull();
      expect(pullResponse.success).toBe(true);
      expect(pullResponse.data?.elementCount).toBe(1);

      // Client adds a new element and pushes
      const clientBackend = createTestBackend(join(tempDir, 'client.db'));

      // Import server state to client
      const clientHandlers = createSyncHttpHandlers(clientBackend);
      clientHandlers.push({
        elements: pullResponse.data?.elements ?? '',
        dependencies: pullResponse.data?.dependencies ?? '',
      });

      // Client creates new element
      const clientTask = createTestElement({
        id: 'el-client1' as ElementId,
        title: 'Client Task',
      });
      insertElement(clientBackend, clientTask);

      // Client exports and pushes to server
      const clientExport = clientHandlers.pull();
      clientBackend.close();

      const pushResponse = handlers.push({
        elements: clientExport.data?.elements ?? '',
        dependencies: clientExport.data?.dependencies ?? '',
      });

      expect(pushResponse.success).toBe(true);
      expect(pushResponse.data?.result.elementsImported).toBe(1); // Only new element
      expect(pushResponse.data?.serverState?.elementCount).toBe(2);
    });

    test('handles merge conflicts correctly', () => {
      // Create an element on server
      const task = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'Original Title',
        updatedAt: '2025-01-20T10:00:00.000Z' as Timestamp,
      });
      insertElement(backend, task);

      // Create modified version in client (newer)
      const clientBackend = createTestBackend(join(tempDir, 'client.db'));
      const modifiedTask = createTestElement({
        id: 'el-task1' as ElementId,
        title: 'Modified Title',
        updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      });
      insertElement(clientBackend, modifiedTask);

      const clientExport = createSyncHttpHandlers(clientBackend).pull();
      clientBackend.close();

      // Push client version to server
      const response = handlers.push({
        elements: clientExport.data?.elements ?? '',
        dependencies: '',
      });

      expect(response.success).toBe(true);
      expect(response.data?.result.elementsImported).toBe(1);
      expect(response.data?.result.conflicts).toHaveLength(1);

      // Verify server has updated title
      const row = backend.queryOne<{ data: string }>('SELECT data FROM elements WHERE id = ?', [
        'el-task1',
      ]);
      expect(JSON.parse(row?.data ?? '{}').title).toBe('Modified Title');
    });
  });
});
