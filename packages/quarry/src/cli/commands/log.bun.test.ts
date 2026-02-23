/**
 * Log Command Tests
 *
 * Tests for the `sf log` CLI command that queries the operation_log table.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { logCommand } from './log.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_log_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
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

/**
 * Seed the operation_log table with test data
 */
function seedLogEntries(storage: StorageBackend) {
  const now = Date.now();

  const entries = [
    { id: 'oplog-test-1', timestamp: new Date(now - 5000).toISOString(), level: 'info', category: 'dispatch', agent_id: 'el-w1', task_id: 'el-t1', message: 'Task dispatched', details: null },
    { id: 'oplog-test-2', timestamp: new Date(now - 4000).toISOString(), level: 'error', category: 'session', agent_id: 'el-w2', task_id: null, message: 'Session crashed', details: '{"exitCode":1}' },
    { id: 'oplog-test-3', timestamp: new Date(now - 3000).toISOString(), level: 'warn', category: 'rate-limit', agent_id: 'el-w1', task_id: null, message: 'Rate limit hit', details: '{"executable":"claude"}' },
    { id: 'oplog-test-4', timestamp: new Date(now - 2000).toISOString(), level: 'info', category: 'merge', agent_id: null, task_id: 'el-t2', message: 'Merge succeeded', details: null },
    { id: 'oplog-test-5', timestamp: new Date(now - 1000).toISOString(), level: 'error', category: 'recovery', agent_id: 'el-w1', task_id: 'el-t1', message: 'Recovery failed', details: '{"reason":"timeout"}' },
  ];

  for (const entry of entries) {
    storage.run(
      `INSERT INTO operation_log (id, timestamp, level, category, agent_id, task_id, message, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.timestamp, entry.level, entry.category, entry.agent_id, entry.task_id, entry.message, entry.details]
    );
  }
}

// ============================================================================
// Setup / Teardown
// ============================================================================

let storage: StorageBackend;

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });

  storage = createStorage({ path: DB_PATH });
  initializeSchema(storage);
  seedLogEntries(storage);
  storage.close();
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Log Command Tests
// ============================================================================

describe('log command', () => {
  test('shows last 20 entries by default', async () => {
    const options = createTestOptions();
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveLength(5);
    expect(result.message).toContain('Operation Log');
  });

  test('filters by level', async () => {
    const options = createTestOptions({ level: 'error' } as GlobalOptions & { level: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveLength(2);
    expect((result.data as Array<{ level: string }>).every((e) => e.level === 'error')).toBe(true);
  });

  test('filters by category', async () => {
    const options = createTestOptions({ category: 'rate-limit' } as GlobalOptions & { category: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveLength(1);
    expect((result.data as Array<{ category: string }>)[0].category).toBe('rate-limit');
  });

  test('filters by task', async () => {
    const options = createTestOptions({ task: 'el-t1' } as GlobalOptions & { task: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveLength(2);
    expect((result.data as Array<{ taskId: string }>).every((e) => e.taskId === 'el-t1')).toBe(true);
  });

  test('filters by agent', async () => {
    const options = createTestOptions({ agent: 'el-w1' } as GlobalOptions & { agent: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveLength(3);
    expect((result.data as Array<{ agentId: string }>).every((e) => e.agentId === 'el-w1')).toBe(true);
  });

  test('filters by since (relative time)', async () => {
    const options = createTestOptions({ since: '1h' } as GlobalOptions & { since: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // All entries are within last hour
    expect(result.data).toHaveLength(5);
  });

  test('respects limit parameter', async () => {
    const options = createTestOptions({ limit: '2' } as GlobalOptions & { limit: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveLength(2);
  });

  test('returns entries in reverse chronological order', async () => {
    const options = createTestOptions();
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const entries = result.data as Array<{ message: string }>;
    // Most recent first
    expect(entries[0].message).toBe('Recovery failed');
    expect(entries[4].message).toBe('Task dispatched');
  });

  test('returns JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns IDs in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect((result.data as string)).toContain('oplog-test');
  });

  test('shows empty message when no entries', async () => {
    // Clear all entries
    const freshStorage = createStorage({ path: DB_PATH });
    initializeSchema(freshStorage);
    freshStorage.run('DELETE FROM operation_log');
    freshStorage.close();

    const options = createTestOptions();
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No log entries found');
  });

  test('combines multiple filters', async () => {
    const options = createTestOptions({
      level: 'error',
      agent: 'el-w1',
    } as GlobalOptions & { level: string; agent: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toHaveLength(1);
    expect((result.data as Array<{ message: string }>)[0].message).toBe('Recovery failed');
  });

  test('validates invalid level', async () => {
    const options = createTestOptions({ level: 'debug' } as GlobalOptions & { level: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid --level');
  });

  test('validates invalid category', async () => {
    const options = createTestOptions({ category: 'invalid' } as GlobalOptions & { category: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid --category');
  });

  test('validates invalid limit', async () => {
    const options = createTestOptions({ limit: '-1' } as GlobalOptions & { limit: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('positive number');
  });

  test('validates invalid since', async () => {
    const options = createTestOptions({ since: 'not-a-date' } as GlobalOptions & { since: string });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid --since');
  });

  test('fails when database does not exist', async () => {
    const nonExistentPath = join(TEST_DIR, 'nonexistent', 'test.db');
    const options = createTestOptions({ db: nonExistentPath });
    const result = await logCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.error).toContain('No database found');
  });
});

// ============================================================================
// Command Structure Tests
// ============================================================================

describe('log command structure', () => {
  test('has correct name', () => {
    expect(logCommand.name).toBe('log');
  });

  test('has description', () => {
    expect(logCommand.description).toBeDefined();
    expect(logCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(logCommand.usage).toContain('log');
  });

  test('has help text', () => {
    expect(logCommand.help).toBeDefined();
    expect(logCommand.help).toContain('operation log');
  });

  test('has expected options', () => {
    expect(logCommand.options).toBeDefined();
    const optionNames = logCommand.options!.map((o) => o.name);
    expect(optionNames).toContain('level');
    expect(optionNames).toContain('category');
    expect(optionNames).toContain('since');
    expect(optionNames).toContain('task');
    expect(optionNames).toContain('agent');
    expect(optionNames).toContain('limit');
  });
});
