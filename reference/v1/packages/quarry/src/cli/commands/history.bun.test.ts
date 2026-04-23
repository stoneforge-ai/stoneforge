/**
 * History Command Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { historyCommand } from './history.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import { createTask } from '@stoneforge/core';
import type { ElementId, EntityId } from '@stoneforge/core';

// Test directory
const TEST_DIR = join(process.cwd(), '.test-history');
const TEST_DB = join(TEST_DIR, 'test.db');

// Helper to create test options
function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: TEST_DB,
    actor: 'test-actor',
    ...overrides,
  };
}

// Helper to run the history command
async function runHistory(
  args: string[],
  options: GlobalOptions & Record<string, unknown> = createTestOptions()
): Promise<{ exitCode: number; data?: unknown; message?: string; error?: string }> {
  const result = await historyCommand.handler(args, options);
  return result;
}

describe('history command', () => {
  let backend: StorageBackend;
  let api: ReturnType<typeof createQuarryAPI>;

  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Create backend and API
    backend = createStorage({ path: TEST_DB });
    initializeSchema(backend);
    api = createQuarryAPI(backend);
  });

  afterEach(() => {
    // Clean up
    backend.close();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('basic functionality', () => {
    test('requires element ID', async () => {
      const result = await runHistory([]);
      expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
      expect(result.error).toContain('Usage');
    });

    test('returns events for an element', async () => {
      // Create a task
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id]);
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBeGreaterThan(0);
    });

    test('returns empty result for element with no events', async () => {
      // This shouldn't happen in practice since creating an element creates an event,
      // but test the no-events output
      const result = await runHistory(['nonexistent-id' as ElementId]);
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('No events');
    });
  });

  describe('filtering', () => {
    test('limits number of events', async () => {
      // Create a task and update it multiple times
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      for (let i = 0; i < 5; i++) {
        await api.update(task.id, { title: `Update ${i}` } as Parameters<typeof api.update>[1]);
      }

      // Limit to 3 events
      const result = await runHistory([task.id], {
        ...createTestOptions(),
        limit: '3',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect((result.data as unknown[]).length).toBe(3);
    });

    test('filters by event type', async () => {
      // Create a task
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      // Update it
      await api.update(task.id, { title: 'Updated' } as Parameters<typeof api.update>[1]);

      // Filter to only created events
      const result = await runHistory([task.id], {
        ...createTestOptions(),
        type: 'created',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect((result.data as unknown[]).length).toBe(1);
      expect((result.data as Array<{ eventType: string }>)[0].eventType).toBe('created');
    });

    test('validates event type', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id], {
        ...createTestOptions(),
        type: 'invalid-type',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid event type');
    });

    test('filters by actor', async () => {
      // Create a task with specific actor
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'actor-one' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      // Update with different actor
      await api.update(
        task.id,
        { title: 'Updated' } as Parameters<typeof api.update>[1],
        { actor: 'actor-two' as EntityId }
      );

      // Filter by actor-one
      const result = await runHistory([task.id], {
        ...createTestOptions(),
        actor: 'actor-one',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const events = result.data as Array<{ actor: string }>;
      expect(events.every(e => e.actor === 'actor-one')).toBe(true);
    });
  });

  describe('output formats', () => {
    test('outputs JSON when --json is set', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id], {
        ...createTestOptions(),
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toBeUndefined(); // JSON mode doesn't have message
    });

    test('outputs count in quiet mode', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id], {
        ...createTestOptions(),
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(typeof result.data).toBe('string');
      expect(parseInt(result.data as string, 10)).toBeGreaterThan(0);
    });

    test('formats as timeline by default', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id]);
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('History for');
      expect(result.message).toContain('Created');
    });

    test('formats as table when requested', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id], {
        ...createTestOptions(),
        format: 'table',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('TIME');
      expect(result.message).toContain('TYPE');
      expect(result.message).toContain('ACTOR');
    });

    test('validates format option', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id], {
        ...createTestOptions(),
        format: 'invalid',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Format must be');
    });
  });

  describe('error handling', () => {
    test('fails gracefully when database path does not exist', async () => {
      const result = await runHistory(['el-test'], {
        db: join(TEST_DIR, 'nonexistent', 'test.db'),
        actor: 'test-actor',
      });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.error).toContain('No database found');
    });

    test('validates limit must be positive', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id], {
        ...createTestOptions(),
        limit: '0',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('positive number');
    });

    test('validates limit must be a number', async () => {
      const task = await createTask({
        title: 'Test Task',
        createdBy: 'test-actor' as EntityId,
      });
      await api.create(task as unknown as Parameters<typeof api.create>[0]);

      const result = await runHistory([task.id], {
        ...createTestOptions(),
        limit: 'abc',
      });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('positive number');
    });
  });
});
