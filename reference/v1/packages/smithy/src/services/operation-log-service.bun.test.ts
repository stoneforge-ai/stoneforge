/**
 * Operation Log Service Unit Tests
 *
 * Tests for the OperationLogService backed by SQLite.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import {
  createOperationLogService,
  type OperationLogService,
  OperationLogLevel,
  OperationLogCategory,
} from './operation-log-service.js';

describe('OperationLogService', () => {
  let service: OperationLogService;
  let storage: StorageBackend;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = `/tmp/operation-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    storage = createStorage({ path: testDbPath });
    initializeSchema(storage);
    service = createOperationLogService(storage);
  });

  afterEach(() => {
    if (storage?.isOpen) {
      storage.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('write', () => {
    test('writes a basic log entry', () => {
      service.write('info', 'dispatch', 'Task dispatched successfully');

      const entries = service.query();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('info');
      expect(entries[0].category).toBe('dispatch');
      expect(entries[0].message).toBe('Task dispatched successfully');
      expect(entries[0].id).toMatch(/^oplog-/);
      expect(entries[0].timestamp).toBeDefined();
    });

    test('writes entry with agentId and taskId', () => {
      service.write('error', 'session', 'Session failed', {
        agentId: 'el-agent1',
        taskId: 'el-task1',
      });

      const entries = service.query();
      expect(entries).toHaveLength(1);
      expect(entries[0].agentId).toBe('el-agent1');
      expect(entries[0].taskId).toBe('el-task1');
    });

    test('writes entry with extra details', () => {
      service.write('warn', 'rate-limit', 'Rate limit hit', {
        agentId: 'el-agent1',
        executable: 'claude',
        resetsAt: '2026-02-23T12:00:00Z',
      });

      const entries = service.query();
      expect(entries).toHaveLength(1);
      expect(entries[0].details).toEqual({
        executable: 'claude',
        resetsAt: '2026-02-23T12:00:00Z',
      });
      // agentId/taskId should NOT be in details (they have their own columns)
      expect(entries[0].details).not.toHaveProperty('agentId');
    });

    test('generates unique IDs', () => {
      service.write('info', 'dispatch', 'First');
      service.write('info', 'dispatch', 'Second');

      const entries = service.query();
      expect(entries).toHaveLength(2);
      expect(entries[0].id).not.toBe(entries[1].id);
    });

    test('writes all valid levels', () => {
      service.write('info', 'dispatch', 'Info message');
      service.write('warn', 'dispatch', 'Warn message');
      service.write('error', 'dispatch', 'Error message');

      const entries = service.query({ limit: 10 });
      expect(entries).toHaveLength(3);
    });

    test('writes all valid categories', () => {
      const categories: Array<'dispatch' | 'merge' | 'session' | 'rate-limit' | 'steward' | 'recovery'> = [
        'dispatch', 'merge', 'session', 'rate-limit', 'steward', 'recovery',
      ];

      for (const cat of categories) {
        service.write('info', cat, `${cat} message`);
      }

      const entries = service.query({ limit: 10 });
      expect(entries).toHaveLength(6);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      // Seed with diverse entries
      service.write('info', 'dispatch', 'Dispatch info', { agentId: 'el-w1', taskId: 'el-t1' });
      service.write('error', 'dispatch', 'Dispatch error');
      service.write('warn', 'rate-limit', 'Rate limited', { agentId: 'el-w1' });
      service.write('info', 'session', 'Session started', { agentId: 'el-w2' });
      service.write('error', 'merge', 'Merge failed', { taskId: 'el-t2' });
      service.write('info', 'recovery', 'Orphan recovered', { agentId: 'el-w1', taskId: 'el-t1' });
    });

    test('returns entries in reverse chronological order', () => {
      const entries = service.query({ limit: 10 });
      expect(entries).toHaveLength(6);
      // First entry should be the most recent
      expect(entries[0].message).toBe('Orphan recovered');
      expect(entries[5].message).toBe('Dispatch info');
    });

    test('default limit is 20', () => {
      // Add many more entries
      for (let i = 0; i < 25; i++) {
        service.write('info', 'dispatch', `Entry ${i}`);
      }

      const entries = service.query();
      expect(entries).toHaveLength(20);
    });

    test('filters by level', () => {
      const errors = service.query({ level: 'error' });
      expect(errors).toHaveLength(2);
      expect(errors.every((e) => e.level === 'error')).toBe(true);
    });

    test('filters by category', () => {
      const dispatches = service.query({ category: 'dispatch' });
      expect(dispatches).toHaveLength(2);
      expect(dispatches.every((e) => e.category === 'dispatch')).toBe(true);
    });

    test('filters by taskId', () => {
      const entries = service.query({ taskId: 'el-t1' });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.taskId === 'el-t1')).toBe(true);
    });

    test('filters by agentId', () => {
      const entries = service.query({ agentId: 'el-w1' });
      expect(entries).toHaveLength(3);
      expect(entries.every((e) => e.agentId === 'el-w1')).toBe(true);
    });

    test('filters by since timestamp', () => {
      // All entries should be after a time in the past
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const entries = service.query({ since: pastTime, limit: 10 });
      expect(entries).toHaveLength(6);

      // No entries should be from the future
      const futureTime = new Date(Date.now() + 60000).toISOString();
      const futureEntries = service.query({ since: futureTime });
      expect(futureEntries).toHaveLength(0);
    });

    test('respects limit parameter', () => {
      const entries = service.query({ limit: 3 });
      expect(entries).toHaveLength(3);
    });

    test('combines multiple filters', () => {
      const entries = service.query({
        level: 'info',
        agentId: 'el-w1',
      });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.level === 'info' && e.agentId === 'el-w1')).toBe(true);
    });

    test('returns empty array when no matches', () => {
      const entries = service.query({ category: 'steward' });
      expect(entries).toHaveLength(0);
    });
  });

  describe('constants', () => {
    test('OperationLogLevel has correct values', () => {
      expect(OperationLogLevel.INFO).toBe('info');
      expect(OperationLogLevel.WARN).toBe('warn');
      expect(OperationLogLevel.ERROR).toBe('error');
    });

    test('OperationLogCategory has correct values', () => {
      expect(OperationLogCategory.DISPATCH).toBe('dispatch');
      expect(OperationLogCategory.MERGE).toBe('merge');
      expect(OperationLogCategory.SESSION).toBe('session');
      expect(OperationLogCategory.RATE_LIMIT).toBe('rate-limit');
      expect(OperationLogCategory.STEWARD).toBe('steward');
      expect(OperationLogCategory.RECOVERY).toBe('recovery');
    });
  });
});
