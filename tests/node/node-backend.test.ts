/**
 * Integration Tests for Node.js SQLite Backend
 *
 * These tests validate the better-sqlite3 backend implementation.
 * Tests use both in-memory and file-based databases to ensure complete coverage.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { NodeStorageBackend, createNodeStorage } from '../../src/storage/node-backend.js';
import type { StorageBackend } from '../../src/storage/backend.js';
import type { Migration } from '../../src/storage/types.js';
import type { ElementId } from '../../src/types/element.js';

// Test database paths
const TEST_DB_PATH = '/tmp/stoneforge-node-test.db';
const TEST_DB_WAL = '/tmp/stoneforge-node-test.db-wal';
const TEST_DB_SHM = '/tmp/stoneforge-node-test.db-shm';

// Helper to clean up test files
function cleanupTestFiles(): void {
  for (const file of [TEST_DB_PATH, TEST_DB_WAL, TEST_DB_SHM]) {
    if (existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

describe('NodeStorageBackend', () => {
  describe('In-Memory Database', () => {
    let backend: StorageBackend;

    beforeEach(() => {
      backend = new NodeStorageBackend({ path: ':memory:' });
    });

    afterEach(() => {
      if (backend.isOpen) {
        backend.close();
      }
    });

    describe('Connection Management', () => {
      it('should open in-memory database', () => {
        expect(backend.isOpen).toBe(true);
        expect(backend.path).toBe(':memory:');
      });

      it('should close connection', () => {
        backend.close();
        expect(backend.isOpen).toBe(false);
      });

      it('should throw after close', () => {
        backend.close();
        expect(() => backend.exec('SELECT 1')).toThrow('Database is closed');
      });

      it('should report transaction status', () => {
        expect(backend.inTransaction).toBe(false);
      });
    });

    describe('SQL Execution', () => {
      it('should execute DDL statements', () => {
        expect(() => backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')).not.toThrow();
      });

      it('should query empty results', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
        const rows = backend.query('SELECT * FROM test');
        expect(rows).toEqual([]);
      });

      it('should query with results', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);

        const rows = backend.query<{ id: number; name: string }>('SELECT * FROM test ORDER BY id');
        expect(rows).toEqual([
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]);
      });

      it('should query with parameters', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);

        const rows = backend.query<{ id: number; name: string }>('SELECT * FROM test WHERE name = ?', ['Alice']);
        expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
      });

      it('should queryOne with result', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);

        const row = backend.queryOne<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', [1]);
        expect(row).toEqual({ id: 1, name: 'Alice' });
      });

      it('should queryOne with no result', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        const row = backend.queryOne('SELECT * FROM test WHERE id = ?', [999]);
        expect(row).toBeUndefined();
      });

      it('should run mutations', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        const result = backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        expect(result.changes).toBe(1);
      });

      it('should return lastInsertRowid', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        const result = backend.run('INSERT INTO test (name) VALUES (?)', ['Alice']);
        expect(result.lastInsertRowid).toBe(1);
      });
    });

    describe('Prepared Statements', () => {
      it('should prepare and execute statements', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

        const stmt = backend.prepare<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);

        const row = stmt.get(1);
        expect(row).toEqual({ id: 1, name: 'Alice' });
      });

      it('should execute all with prepared statement', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);

        const stmt = backend.prepare<{ id: number; name: string }>('SELECT * FROM test ORDER BY id');
        const rows = stmt.all();
        expect(rows).toEqual([
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]);
      });

      it('should run with prepared statement', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        const stmt = backend.prepare('INSERT INTO test (id, name) VALUES (?, ?)');

        const result = stmt.run(1, 'Alice');
        expect(result.changes).toBe(1);
      });

      it('should finalize prepared statement', () => {
        const stmt = backend.prepare('SELECT 1');
        expect(() => stmt.finalize()).not.toThrow();
      });
    });

    describe('Transactions', () => {
      it('should execute transaction', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

        backend.transaction((tx) => {
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);
        });

        const rows = backend.query('SELECT * FROM test ORDER BY id');
        expect(rows).toHaveLength(2);
      });

      it('should rollback on error', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

        expect(() => {
          backend.transaction((tx) => {
            tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
            throw new Error('Test error');
          });
        }).toThrow('Test error');

        const rows = backend.query('SELECT * FROM test');
        expect(rows).toHaveLength(0);
      });

      it('should support savepoints', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

        backend.transaction((tx) => {
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);

          tx.savepoint('sp1');
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);
          tx.rollbackTo('sp1');

          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [3, 'Charlie']);
        });

        const rows = backend.query<{ id: number }>('SELECT * FROM test ORDER BY id');
        expect(rows.map((r) => r.id)).toEqual([1, 3]);
      });

      it('should return value from transaction', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');

        const result = backend.transaction((tx) => {
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
          return tx.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM test');
        });

        expect(result?.count).toBe(1);
      });
    });

    describe('Schema Management', () => {
      it('should get schema version', () => {
        const version = backend.getSchemaVersion();
        expect(version).toBe(0);
      });

      it('should set schema version', () => {
        backend.setSchemaVersion(42);
        expect(backend.getSchemaVersion()).toBe(42);
      });

      it('should run migrations', () => {
        const migrations: Migration[] = [
          {
            version: 1,
            description: 'Create users table',
            up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
          },
          {
            version: 2,
            description: 'Add email column',
            up: 'ALTER TABLE users ADD COLUMN email TEXT',
          },
        ];

        const result = backend.migrate(migrations);

        expect(result.success).toBe(true);
        expect(result.fromVersion).toBe(0);
        expect(result.toVersion).toBe(2);
        expect(result.applied).toEqual([1, 2]);
        expect(backend.getSchemaVersion()).toBe(2);
      });

      it('should skip applied migrations', () => {
        const migrations: Migration[] = [
          { version: 1, description: 'Test', up: 'SELECT 1' },
        ];

        backend.migrate(migrations);
        const result = backend.migrate(migrations);

        expect(result.applied).toEqual([]);
        expect(result.fromVersion).toBe(1);
        expect(result.toVersion).toBe(1);
      });
    });

    describe('Dirty Tracking', () => {
      it('should mark elements as dirty', () => {
        backend.markDirty('el-test123');
        const dirty = backend.getDirtyElements();
        expect(dirty).toHaveLength(1);
        expect(dirty[0].elementId).toBe('el-test123' as ElementId);
      });

      it('should clear dirty elements', () => {
        backend.markDirty('el-test123');
        backend.clearDirty();
        const dirty = backend.getDirtyElements();
        expect(dirty).toHaveLength(0);
      });

      it('should clear specific dirty elements', () => {
        backend.markDirty('el-test1');
        backend.markDirty('el-test2');
        backend.markDirty('el-test3');

        backend.clearDirtyElements(['el-test1', 'el-test3']);

        const dirty = backend.getDirtyElements();
        expect(dirty).toHaveLength(1);
        expect(dirty[0].elementId).toBe('el-test2' as ElementId);
      });
    });

    describe('Utilities', () => {
      it('should check integrity', () => {
        expect(backend.checkIntegrity()).toBe(true);
      });

      it('should optimize database', () => {
        expect(() => backend.optimize()).not.toThrow();
      });

      it('should get stats', () => {
        const stats = backend.getStats();
        expect(stats.fileSize).toBe(0); // In-memory
        expect(stats.tableCount).toBeGreaterThanOrEqual(1); // At least dirty_elements
        expect(stats.schemaVersion).toBe(0);
      });
    });
  });

  describe('File-Based Database', () => {
    beforeEach(() => {
      cleanupTestFiles();
    });

    afterEach(() => {
      cleanupTestFiles();
    });

    afterAll(() => {
      cleanupTestFiles();
    });

    it('should create new database file', () => {
      const backend = new NodeStorageBackend({ path: TEST_DB_PATH });
      expect(existsSync(TEST_DB_PATH)).toBe(true);
      backend.close();
    });

    it('should report file size in stats', () => {
      const backend = new NodeStorageBackend({ path: TEST_DB_PATH });
      backend.exec('CREATE TABLE test (id INTEGER, data TEXT)');
      backend.run('INSERT INTO test VALUES (?, ?)', [1, 'x'.repeat(1000)]);

      const stats = backend.getStats();
      expect(stats.fileSize).toBeGreaterThan(0);
      backend.close();
    });
  });

  describe('Factory Function', () => {
    it('should create backend via factory', () => {
      const backend = createNodeStorage({ path: ':memory:' });
      expect(backend.isOpen).toBe(true);
      expect(backend).toBeInstanceOf(NodeStorageBackend);
      backend.close();
    });
  });

  describe('Hierarchical ID Support', () => {
    let backend: StorageBackend;

    beforeEach(() => {
      backend = new NodeStorageBackend({ path: ':memory:' });
      // Initialize the child_counters table (this is part of the schema)
      backend.exec(`
        CREATE TABLE IF NOT EXISTS child_counters (
          parent_id TEXT PRIMARY KEY,
          last_child INTEGER NOT NULL DEFAULT 0
        )
      `);
    });

    afterEach(() => {
      if (backend.isOpen) {
        backend.close();
      }
    });

    describe('getNextChildNumber', () => {
      it('should return 1 for a new parent', () => {
        const childNumber = backend.getNextChildNumber('el-abc123');
        expect(childNumber).toBe(1);
      });

      it('should increment counter on subsequent calls', () => {
        expect(backend.getNextChildNumber('el-abc123')).toBe(1);
        expect(backend.getNextChildNumber('el-abc123')).toBe(2);
        expect(backend.getNextChildNumber('el-abc123')).toBe(3);
      });

      it('should track counters independently for different parents', () => {
        expect(backend.getNextChildNumber('el-parent1')).toBe(1);
        expect(backend.getNextChildNumber('el-parent2')).toBe(1);
        expect(backend.getNextChildNumber('el-parent1')).toBe(2);
        expect(backend.getNextChildNumber('el-parent2')).toBe(2);
      });

      it('should handle hierarchical parent IDs', () => {
        // Root element children
        expect(backend.getNextChildNumber('el-abc')).toBe(1);
        expect(backend.getNextChildNumber('el-abc')).toBe(2);

        // Child element children (el-abc.1's children)
        expect(backend.getNextChildNumber('el-abc.1')).toBe(1);
        expect(backend.getNextChildNumber('el-abc.1')).toBe(2);

        // Parent counter should be unaffected
        expect(backend.getNextChildNumber('el-abc')).toBe(3);
      });
    });

    describe('getChildCounter', () => {
      it('should return 0 for a parent with no children', () => {
        const counter = backend.getChildCounter('el-nochildren');
        expect(counter).toBe(0);
      });

      it('should return current counter without incrementing', () => {
        backend.getNextChildNumber('el-abc');
        backend.getNextChildNumber('el-abc');

        expect(backend.getChildCounter('el-abc')).toBe(2);
        expect(backend.getChildCounter('el-abc')).toBe(2);
      });
    });

    describe('resetChildCounter', () => {
      it('should reset counter to allow new sequence', () => {
        backend.getNextChildNumber('el-abc');
        backend.getNextChildNumber('el-abc');
        expect(backend.getChildCounter('el-abc')).toBe(2);

        backend.resetChildCounter('el-abc');
        expect(backend.getChildCounter('el-abc')).toBe(0);

        expect(backend.getNextChildNumber('el-abc')).toBe(1);
      });

      it('should not throw for non-existent parent', () => {
        expect(() => backend.resetChildCounter('el-nonexistent')).not.toThrow();
      });
    });
  });
});
