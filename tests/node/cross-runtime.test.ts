/**
 * Cross-Runtime Compatibility Tests for Node.js
 *
 * These tests verify that the Node.js backend (better-sqlite3) behaves
 * consistently with other runtime backends. They complement the Bun-based
 * cross-runtime tests to ensure the storage interface contract is met
 * across all supported runtimes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeStorageBackend } from '../../src/storage/node-backend.js';
import type { StorageBackend } from '../../src/storage/backend.js';
import type { Migration } from '../../src/storage/types.js';

describe('Cross-Runtime Compatibility (Node.js)', () => {
  let backend: StorageBackend;

  beforeEach(() => {
    backend = new NodeStorageBackend({ path: ':memory:' });
  });

  afterEach(() => {
    if (backend?.isOpen) {
      backend.close();
    }
  });

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  describe('connection management', () => {
    it('should open with correct path', () => {
      expect(backend.isOpen).toBe(true);
      expect(backend.path).toBe(':memory:');
    });

    it('should close and report closed status', () => {
      backend.close();
      expect(backend.isOpen).toBe(false);
    });

    it('should throw error after close', () => {
      backend.close();
      expect(() => backend.exec('SELECT 1')).toThrow('Database is closed');
    });

    it('should report inTransaction as false initially', () => {
      expect(backend.inTransaction).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Basic SQL Operations
  // --------------------------------------------------------------------------

  describe('SQL operations', () => {
    beforeEach(() => {
      backend.exec(`
        CREATE TABLE test (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          value REAL,
          data BLOB
        )
      `);
    });

    it('should execute DDL without error', () => {
      expect(() =>
        backend.exec('CREATE TABLE other (id INTEGER PRIMARY KEY)')
      ).not.toThrow();
    });

    it('should return empty array for empty table', () => {
      const rows = backend.query('SELECT * FROM test');
      expect(rows).toEqual([]);
    });

    it('should insert and query data', () => {
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['alice', 1.5]);
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['bob', 2.5]);

      const rows = backend.query<{ id: number; name: string; value: number }>(
        'SELECT id, name, value FROM test ORDER BY id'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('alice');
      expect(rows[0].value).toBe(1.5);
      expect(rows[1].name).toBe('bob');
      expect(rows[1].value).toBe(2.5);
    });

    it('should handle parameterized queries', () => {
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['alice', 1]);
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['bob', 2]);
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['charlie', 3]);

      const rows = backend.query<{ name: string }>(
        'SELECT name FROM test WHERE value > ? ORDER BY name',
        [1]
      );

      expect(rows.map((r) => r.name)).toEqual(['bob', 'charlie']);
    });

    it('should queryOne return single row', () => {
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['alice', 100]);

      const row = backend.queryOne<{ name: string; value: number }>(
        'SELECT name, value FROM test WHERE name = ?',
        ['alice']
      );

      expect(row).toBeDefined();
      expect(row?.name).toBe('alice');
      expect(row?.value).toBe(100);
    });

    it('should queryOne return undefined for no match', () => {
      const row = backend.queryOne('SELECT * FROM test WHERE id = ?', [999]);
      expect(row).toBeUndefined();
    });

    it('should run return changes count', () => {
      const result = backend.run('INSERT INTO test (name) VALUES (?)', ['test']);
      expect(result.changes).toBe(1);
    });

    it('should run return lastInsertRowid', () => {
      backend.run('INSERT INTO test (name) VALUES (?)', ['first']);
      const result = backend.run('INSERT INTO test (name) VALUES (?)', ['second']);
      expect(result.lastInsertRowid).toBe(2);
    });

    it('should handle UPDATE and return changes', () => {
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['a', 1]);
      backend.run('INSERT INTO test (name, value) VALUES (?, ?)', ['b', 2]);

      const result = backend.run('UPDATE test SET value = value + 10');
      expect(result.changes).toBe(2);

      const rows = backend.query<{ value: number }>('SELECT value FROM test ORDER BY value');
      expect(rows.map((r) => r.value)).toEqual([11, 12]);
    });

    it('should handle DELETE and return changes', () => {
      backend.run('INSERT INTO test (name) VALUES (?)', ['keep']);
      backend.run('INSERT INTO test (name) VALUES (?)', ['delete1']);
      backend.run('INSERT INTO test (name) VALUES (?)', ['delete2']);

      const result = backend.run("DELETE FROM test WHERE name LIKE 'delete%'");
      expect(result.changes).toBe(2);
    });

    it('should throw on SQL syntax error', () => {
      expect(() => backend.exec('SELEKT * FROM nowhere')).toThrow();
    });

    it('should throw on missing table', () => {
      expect(() => backend.query('SELECT * FROM nonexistent')).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Data Types
  // --------------------------------------------------------------------------

  describe('data type handling', () => {
    beforeEach(() => {
      backend.exec(`
        CREATE TABLE types (
          id INTEGER PRIMARY KEY,
          int_val INTEGER,
          real_val REAL,
          text_val TEXT,
          blob_val BLOB,
          null_val TEXT
        )
      `);
    });

    it('should handle NULL values', () => {
      backend.run(
        'INSERT INTO types (int_val, text_val, null_val) VALUES (?, ?, ?)',
        [1, 'test', null]
      );

      const row = backend.queryOne<{ null_val: string | null }>(
        'SELECT null_val FROM types'
      );
      expect(row?.null_val).toBeNull();
    });

    it('should handle integer values', () => {
      backend.run('INSERT INTO types (int_val) VALUES (?)', [42]);
      backend.run('INSERT INTO types (int_val) VALUES (?)', [-100]);
      backend.run('INSERT INTO types (int_val) VALUES (?)', [0]);

      const rows = backend.query<{ int_val: number }>(
        'SELECT int_val FROM types ORDER BY int_val'
      );
      expect(rows.map((r) => r.int_val)).toEqual([-100, 0, 42]);
    });

    it('should handle floating point values', () => {
      backend.run('INSERT INTO types (real_val) VALUES (?)', [3.14159]);
      backend.run('INSERT INTO types (real_val) VALUES (?)', [-2.5]);

      const rows = backend.query<{ real_val: number }>(
        'SELECT real_val FROM types ORDER BY real_val'
      );
      expect(rows[0].real_val).toBeCloseTo(-2.5, 5);
      expect(rows[1].real_val).toBeCloseTo(3.14159, 5);
    });

    it('should handle text values with special characters', () => {
      backend.run('INSERT INTO types (text_val) VALUES (?)', ["Hello 'World'"]);
      backend.run('INSERT INTO types (text_val) VALUES (?)', ['Line1\nLine2']);
      backend.run('INSERT INTO types (text_val) VALUES (?)', ['Tab\tSeparated']);

      const rows = backend.query<{ text_val: string }>('SELECT text_val FROM types');
      expect(rows).toHaveLength(3);
      expect(rows.some((r) => r.text_val.includes("'"))).toBe(true);
      expect(rows.some((r) => r.text_val.includes('\n'))).toBe(true);
      expect(rows.some((r) => r.text_val.includes('\t'))).toBe(true);
    });

    it('should handle empty strings', () => {
      backend.run('INSERT INTO types (text_val) VALUES (?)', ['']);

      const row = backend.queryOne<{ text_val: string }>('SELECT text_val FROM types');
      expect(row?.text_val).toBe('');
    });

    it('should handle unicode text', () => {
      backend.run('INSERT INTO types (text_val) VALUES (?)', ['日本語テスト']);
      backend.run('INSERT INTO types (text_val) VALUES (?)', ['Emoji: 🎉🚀']);

      const rows = backend.query<{ text_val: string }>('SELECT text_val FROM types');
      expect(rows.some((r) => r.text_val === '日本語テスト')).toBe(true);
      expect(rows.some((r) => r.text_val.includes('🎉'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Prepared Statements
  // --------------------------------------------------------------------------

  describe('prepared statements', () => {
    beforeEach(() => {
      backend.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)');
      backend.run('INSERT INTO items (name) VALUES (?)', ['item1']);
      backend.run('INSERT INTO items (name) VALUES (?)', ['item2']);
      backend.run('INSERT INTO items (name) VALUES (?)', ['item3']);
    });

    it('should prepare and get single row', () => {
      const stmt = backend.prepare<{ id: number; name: string }>(
        'SELECT * FROM items WHERE id = ?'
      );

      const row1 = stmt.get(1);
      const row2 = stmt.get(2);

      expect(row1?.name).toBe('item1');
      expect(row2?.name).toBe('item2');

      stmt.finalize();
    });

    it('should prepare and get all rows', () => {
      const stmt = backend.prepare<{ name: string }>('SELECT name FROM items ORDER BY id');
      const rows = stmt.all();

      expect(rows.map((r) => r.name)).toEqual(['item1', 'item2', 'item3']);
      stmt.finalize();
    });

    it('should prepare and run mutation', () => {
      const stmt = backend.prepare('INSERT INTO items (name) VALUES (?)');
      const result = stmt.run('item4');

      expect(result.changes).toBe(1);
      stmt.finalize();

      const count = backend.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM items');
      expect(count?.cnt).toBe(4);
    });

    it('should finalize without error', () => {
      const stmt = backend.prepare('SELECT 1');
      expect(() => stmt.finalize()).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Transactions
  // --------------------------------------------------------------------------

  describe('transactions', () => {
    beforeEach(() => {
      backend.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
      backend.run('INSERT INTO accounts (balance) VALUES (?)', [100]);
    });

    it('should commit successful transaction', () => {
      backend.transaction((tx) => {
        tx.run('UPDATE accounts SET balance = balance - 30 WHERE id = 1');
        tx.run('INSERT INTO accounts (balance) VALUES (30)');
      });

      const rows = backend.query<{ balance: number }>(
        'SELECT balance FROM accounts ORDER BY id'
      );
      expect(rows.map((r) => r.balance)).toEqual([70, 30]);
    });

    it('should rollback failed transaction', () => {
      expect(() => {
        backend.transaction(() => {
          backend.run('UPDATE accounts SET balance = 0 WHERE id = 1');
          throw new Error('Intentional failure');
        });
      }).toThrow('Intentional failure');

      const row = backend.queryOne<{ balance: number }>('SELECT balance FROM accounts');
      expect(row?.balance).toBe(100);
    });

    it('should return value from transaction', () => {
      const result = backend.transaction((tx) => {
        tx.run('UPDATE accounts SET balance = 200 WHERE id = 1');
        return tx.queryOne<{ balance: number }>('SELECT balance FROM accounts');
      });

      expect(result?.balance).toBe(200);
    });

    it('should support savepoints', () => {
      backend.transaction((tx) => {
        tx.run('UPDATE accounts SET balance = 50 WHERE id = 1');

        tx.savepoint('sp1');
        tx.run('UPDATE accounts SET balance = 0 WHERE id = 1');
        tx.rollbackTo('sp1');

        tx.release('sp1');
      });

      const row = backend.queryOne<{ balance: number }>('SELECT balance FROM accounts');
      expect(row?.balance).toBe(50);
    });

    it('should track inTransaction state', () => {
      expect(backend.inTransaction).toBe(false);

      let wasInTransaction = false;
      backend.transaction(() => {
        wasInTransaction = backend.inTransaction;
      });

      expect(wasInTransaction).toBe(true);
      expect(backend.inTransaction).toBe(false);
    });

    it('should support nested queries in transaction', () => {
      backend.transaction((tx) => {
        tx.run('INSERT INTO accounts (balance) VALUES (?)', [200]);
        const count = tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM accounts');
        expect(count?.cnt).toBe(2);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Schema Management
  // --------------------------------------------------------------------------

  describe('schema management', () => {
    it('should get initial schema version as 0', () => {
      expect(backend.getSchemaVersion()).toBe(0);
    });

    it('should set and get schema version', () => {
      backend.setSchemaVersion(42);
      expect(backend.getSchemaVersion()).toBe(42);
    });

    it('should run migrations in order', () => {
      const migrations: Migration[] = [
        { version: 1, description: 'Create users', up: 'CREATE TABLE users (id INTEGER)' },
        {
          version: 2,
          description: 'Add name',
          up: 'ALTER TABLE users ADD COLUMN name TEXT',
        },
        {
          version: 3,
          description: 'Add email',
          up: 'ALTER TABLE users ADD COLUMN email TEXT',
        },
      ];

      const result = backend.migrate(migrations);

      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(3);
      expect(result.applied).toEqual([1, 2, 3]);
      expect(result.success).toBe(true);
      expect(backend.getSchemaVersion()).toBe(3);
    });

    it('should skip already applied migrations', () => {
      backend.setSchemaVersion(2);

      const migrations: Migration[] = [
        { version: 1, description: 'Old', up: 'SELECT 1' },
        { version: 2, description: 'Old', up: 'SELECT 2' },
        { version: 3, description: 'New', up: 'CREATE TABLE new_table (id INT)' },
      ];

      const result = backend.migrate(migrations);

      expect(result.fromVersion).toBe(2);
      expect(result.applied).toEqual([3]);
    });

    it('should handle empty migrations array', () => {
      const result = backend.migrate([]);

      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(0);
      expect(result.applied).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('should handle out-of-order migration definitions', () => {
      const migrations: Migration[] = [
        { version: 3, description: 'Third', up: 'CREATE TABLE t3 (id INT)' },
        { version: 1, description: 'First', up: 'CREATE TABLE t1 (id INT)' },
        { version: 2, description: 'Second', up: 'CREATE TABLE t2 (id INT)' },
      ];

      const result = backend.migrate(migrations);

      // Should apply in version order, not definition order
      expect(result.applied).toEqual([1, 2, 3]);
    });
  });

  // --------------------------------------------------------------------------
  // Dirty Tracking
  // --------------------------------------------------------------------------

  describe('dirty tracking', () => {
    it('should mark elements as dirty', () => {
      backend.markDirty('el-abc');
      backend.markDirty('el-def');

      const dirty = backend.getDirtyElements();
      expect(dirty).toHaveLength(2);

      const ids = dirty.map((d) => String(d.elementId)).sort();
      expect(ids).toEqual(['el-abc', 'el-def']);
    });

    it('should include timestamp when marking dirty', () => {
      const before = new Date().toISOString();
      backend.markDirty('el-test');
      const after = new Date().toISOString();

      const dirty = backend.getDirtyElements();
      expect(dirty[0].markedAt).toBeTruthy();
      expect(dirty[0].markedAt >= before).toBe(true);
      expect(dirty[0].markedAt <= after).toBe(true);
    });

    it('should clear all dirty elements', () => {
      backend.markDirty('el-a');
      backend.markDirty('el-b');
      backend.clearDirty();

      expect(backend.getDirtyElements()).toHaveLength(0);
    });

    it('should clear specific dirty elements', () => {
      backend.markDirty('el-a');
      backend.markDirty('el-b');
      backend.markDirty('el-c');

      backend.clearDirtyElements(['el-a', 'el-c']);

      const dirty = backend.getDirtyElements();
      expect(dirty).toHaveLength(1);
      expect(String(dirty[0].elementId)).toBe('el-b');
    });

    it('should handle clearing empty array', () => {
      backend.markDirty('el-test');
      backend.clearDirtyElements([]);
      expect(backend.getDirtyElements()).toHaveLength(1);
    });

    it('should handle clearing non-existent elements', () => {
      backend.markDirty('el-exists');
      backend.clearDirtyElements(['el-not-exists']);
      expect(backend.getDirtyElements()).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Hierarchical ID Support
  // --------------------------------------------------------------------------

  describe('hierarchical ID support', () => {
    beforeEach(() => {
      // Create the child_counters table (normally done by schema migration)
      backend.exec(`
        CREATE TABLE IF NOT EXISTS child_counters (
          parent_id TEXT PRIMARY KEY,
          last_child INTEGER NOT NULL DEFAULT 0
        )
      `);
    });

    it('should return 1 for first child', () => {
      expect(backend.getNextChildNumber('el-parent')).toBe(1);
    });

    it('should increment child counter', () => {
      expect(backend.getNextChildNumber('el-parent')).toBe(1);
      expect(backend.getNextChildNumber('el-parent')).toBe(2);
      expect(backend.getNextChildNumber('el-parent')).toBe(3);
    });

    it('should track counters independently per parent', () => {
      expect(backend.getNextChildNumber('el-a')).toBe(1);
      expect(backend.getNextChildNumber('el-b')).toBe(1);
      expect(backend.getNextChildNumber('el-a')).toBe(2);
      expect(backend.getNextChildNumber('el-c')).toBe(1);
      expect(backend.getNextChildNumber('el-b')).toBe(2);
    });

    it('should get child counter without incrementing', () => {
      expect(backend.getChildCounter('el-test')).toBe(0);
      backend.getNextChildNumber('el-test');
      backend.getNextChildNumber('el-test');
      expect(backend.getChildCounter('el-test')).toBe(2);
      expect(backend.getChildCounter('el-test')).toBe(2); // Still 2
    });

    it('should reset child counter', () => {
      backend.getNextChildNumber('el-test');
      backend.getNextChildNumber('el-test');
      expect(backend.getChildCounter('el-test')).toBe(2);

      backend.resetChildCounter('el-test');
      expect(backend.getChildCounter('el-test')).toBe(0);
      expect(backend.getNextChildNumber('el-test')).toBe(1);
    });

    it('should not throw when resetting non-existent counter', () => {
      expect(() => backend.resetChildCounter('el-nonexistent')).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  describe('utilities', () => {
    it('should pass integrity check', () => {
      expect(backend.checkIntegrity()).toBe(true);
    });

    it('should optimize without error', () => {
      backend.exec('CREATE TABLE test (id INTEGER, data TEXT)');
      for (let i = 0; i < 50; i++) {
        backend.run('INSERT INTO test VALUES (?, ?)', [i, `data-${i}`]);
      }
      backend.run('DELETE FROM test WHERE id < 25');

      expect(() => backend.optimize()).not.toThrow();
    });

    it('should return stats with required fields', () => {
      const stats = backend.getStats();

      expect(typeof stats.fileSize).toBe('number');
      expect(typeof stats.tableCount).toBe('number');
      expect(typeof stats.indexCount).toBe('number');
      expect(typeof stats.schemaVersion).toBe('number');
      expect(typeof stats.dirtyCount).toBe('number');
      expect(typeof stats.elementCount).toBe('number');
      expect(typeof stats.walMode).toBe('boolean');
    });

    it('should track dirty count in stats', () => {
      backend.markDirty('el-a');
      backend.markDirty('el-b');

      const stats = backend.getStats();
      expect(stats.dirtyCount).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle very long strings', () => {
      backend.exec('CREATE TABLE long_text (id INTEGER PRIMARY KEY, data TEXT)');
      const longString = 'x'.repeat(100000);

      backend.run('INSERT INTO long_text (data) VALUES (?)', [longString]);
      const row = backend.queryOne<{ data: string }>('SELECT data FROM long_text');

      expect(row?.data.length).toBe(100000);
    });

    it('should handle many rows', () => {
      backend.exec('CREATE TABLE many_rows (id INTEGER PRIMARY KEY)');

      backend.transaction((tx) => {
        for (let i = 0; i < 1000; i++) {
          tx.run('INSERT INTO many_rows DEFAULT VALUES');
        }
      });

      const count = backend.queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM many_rows'
      );
      expect(count?.cnt).toBe(1000);
    });

    it('should handle concurrent counter access atomically', () => {
      backend.exec(`
        CREATE TABLE IF NOT EXISTS child_counters (
          parent_id TEXT PRIMARY KEY,
          last_child INTEGER NOT NULL DEFAULT 0
        )
      `);

      const numbers: number[] = [];
      for (let i = 0; i < 100; i++) {
        numbers.push(backend.getNextChildNumber('el-concurrent'));
      }

      // All should be sequential 1-100
      expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));

      // No duplicates
      const unique = new Set(numbers);
      expect(unique.size).toBe(100);
    });
  });
});
