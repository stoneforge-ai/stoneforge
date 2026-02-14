/**
 * Tests for Storage Type Definitions
 *
 * Validates type structure and default values.
 */

import { describe, it, expect } from 'bun:test';
import {
  DEFAULT_PRAGMAS,
  type Row,
  type QueryResult,
  type MutationResult,
  type PreparedStatement,
  type Transaction,
  type TransactionOptions,
  type StorageConfig,
  type DirtyElement,
  type Migration,
  type MigrationResult,
  type IsolationLevel,
} from './types.js';

describe('Storage Types', () => {
  describe('DEFAULT_PRAGMAS', () => {
    it('should have WAL journal mode', () => {
      expect(DEFAULT_PRAGMAS.journal_mode).toBe('wal');
    });

    it('should have NORMAL synchronous mode', () => {
      expect(DEFAULT_PRAGMAS.synchronous).toBe('normal');
    });

    it('should have foreign keys enabled', () => {
      expect(DEFAULT_PRAGMAS.foreign_keys).toBe(true);
    });

    it('should have 5000ms busy timeout', () => {
      expect(DEFAULT_PRAGMAS.busy_timeout).toBe(5000);
    });

    it('should have 2MB cache size', () => {
      expect(DEFAULT_PRAGMAS.cache_size).toBe(-2000);
    });

    it('should use memory for temp store', () => {
      expect(DEFAULT_PRAGMAS.temp_store).toBe('memory');
    });
  });

  describe('Type Structure', () => {
    it('should allow Row to be a record of any values', () => {
      const row: Row = {
        id: 'el-abc',
        type: 'task',
        count: 42,
        active: true,
        data: null,
      };
      expect(row.id).toBe('el-abc');
      expect(row.count).toBe(42);
    });

    it('should structure QueryResult correctly', () => {
      const result: QueryResult = {
        rows: [{ id: 'el-abc' }, { id: 'el-def' }],
        count: 2,
      };
      expect(result.rows).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should structure MutationResult correctly', () => {
      const result: MutationResult = {
        changes: 1,
        lastInsertRowid: 42,
      };
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(42);
    });

    it('should allow MutationResult without lastInsertRowid', () => {
      const result: MutationResult = {
        changes: 5,
      };
      expect(result.changes).toBe(5);
      expect(result.lastInsertRowid).toBeUndefined();
    });

    it('should structure StorageConfig correctly', () => {
      const config: StorageConfig = {
        path: '/tmp/test.db',
        pragmas: { journal_mode: 'wal' },
        create: true,
        readonly: false,
        verbose: true,
      };
      expect(config.path).toBe('/tmp/test.db');
      expect(config.pragmas?.journal_mode).toBe('wal');
      expect(config.create).toBe(true);
    });

    it('should allow minimal StorageConfig', () => {
      const config: StorageConfig = {
        path: ':memory:',
      };
      expect(config.path).toBe(':memory:');
      expect(config.pragmas).toBeUndefined();
    });

    it('should structure DirtyElement correctly', () => {
      const dirty: DirtyElement = {
        elementId: 'el-abc' as any,
        markedAt: '2025-01-22T10:00:00.000Z',
      };
      expect(String(dirty.elementId)).toBe('el-abc');
      expect(dirty.markedAt).toBe('2025-01-22T10:00:00.000Z');
    });

    it('should structure Migration correctly', () => {
      const migration: Migration = {
        version: 1,
        description: 'Create elements table',
        up: 'CREATE TABLE elements (id TEXT PRIMARY KEY)',
        down: 'DROP TABLE elements',
      };
      expect(migration.version).toBe(1);
      expect(migration.up).toContain('CREATE TABLE');
      expect(migration.down).toContain('DROP TABLE');
    });

    it('should allow Migration without down script', () => {
      const migration: Migration = {
        version: 1,
        description: 'Initial schema',
        up: 'CREATE TABLE test (id TEXT)',
      };
      expect(migration.down).toBeUndefined();
    });

    it('should structure MigrationResult correctly', () => {
      const result: MigrationResult = {
        fromVersion: 0,
        toVersion: 3,
        applied: [1, 2, 3],
        success: true,
      };
      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(3);
      expect(result.applied).toEqual([1, 2, 3]);
      expect(result.success).toBe(true);
    });
  });

  describe('IsolationLevel', () => {
    it('should accept deferred', () => {
      const level: IsolationLevel = 'deferred';
      expect(level).toBe('deferred');
    });

    it('should accept immediate', () => {
      const level: IsolationLevel = 'immediate';
      expect(level).toBe('immediate');
    });

    it('should accept exclusive', () => {
      const level: IsolationLevel = 'exclusive';
      expect(level).toBe('exclusive');
    });
  });

  describe('TransactionOptions', () => {
    it('should accept isolation level', () => {
      const options: TransactionOptions = {
        isolation: 'immediate',
      };
      expect(options.isolation).toBe('immediate');
    });

    it('should be optional', () => {
      const options: TransactionOptions = {};
      expect(options.isolation).toBeUndefined();
    });
  });
});

describe('Interface Contracts', () => {
  describe('PreparedStatement', () => {
    it('should define required methods', () => {
      // Type-level test - this is a mock to verify the interface shape
      const mockStatement: PreparedStatement = {
        all: () => [],
        get: () => undefined,
        run: () => ({ changes: 0 }),
        finalize: () => {},
      };

      expect(typeof mockStatement.all).toBe('function');
      expect(typeof mockStatement.get).toBe('function');
      expect(typeof mockStatement.run).toBe('function');
      expect(typeof mockStatement.finalize).toBe('function');
    });
  });

  describe('Transaction', () => {
    it('should define required methods', () => {
      // Type-level test - this is a mock to verify the interface shape
      const mockTransaction: Transaction = {
        exec: () => {},
        query: () => [],
        queryOne: () => undefined,
        run: () => ({ changes: 0 }),
        savepoint: () => {},
        release: () => {},
        rollbackTo: () => {},
      };

      expect(typeof mockTransaction.exec).toBe('function');
      expect(typeof mockTransaction.query).toBe('function');
      expect(typeof mockTransaction.queryOne).toBe('function');
      expect(typeof mockTransaction.run).toBe('function');
      expect(typeof mockTransaction.savepoint).toBe('function');
      expect(typeof mockTransaction.release).toBe('function');
      expect(typeof mockTransaction.rollbackTo).toBe('function');
    });
  });
});
