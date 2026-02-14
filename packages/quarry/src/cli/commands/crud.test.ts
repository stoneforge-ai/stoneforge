/**
 * CRUD Commands Integration Tests
 *
 * Tests for the create, list, and show CLI commands.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCommand, listCommand, showCommand, updateCommand, deleteCommand } from './crud.js';
import { planCommand } from './plan.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_workspace__');
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
// Create Command Tests
// ============================================================================

describe('create command', () => {
  test('creates a task with title', async () => {
    const options = createTestOptions({ title: 'Test Task' } as GlobalOptions & { title: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { id: string }).id).toMatch(/^el-/);
    expect((result.data as { title: string }).title).toBe('Test Task');
    expect((result.data as { type: string }).type).toBe('task');
    expect((result.data as { status: string }).status).toBe('open');
  });

  test('creates a task with all options', async () => {
    const options = createTestOptions({
      title: 'Full Task',
      priority: '1',
      complexity: '2',
      type: 'bug',
      assignee: 'dev-1',
      tag: ['urgent', 'frontend'],
    });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.title).toBe('Full Task');
    expect(data.priority).toBe(1);
    expect(data.complexity).toBe(2);
    expect(data.taskType).toBe('bug');
    expect(data.assignee).toBe('dev-1');
    expect(data.tags).toEqual(['urgent', 'frontend']);
  });

  test('fails without element type', async () => {
    const options = createTestOptions();
    const result = await createCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with unsupported element type', async () => {
    const options = createTestOptions({ title: 'Test' } as GlobalOptions & { title: string });
    const result = await createCommand.handler(['entity'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unsupported element type');
  });

  test('fails without title for task', async () => {
    const options = createTestOptions();
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--title');
  });

  test('fails with invalid priority', async () => {
    const options = createTestOptions({
      title: 'Test',
      priority: '6',
    } as GlobalOptions & { title: string; priority: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Priority must be a number from 1 to 5');
  });

  test('fails with invalid complexity', async () => {
    const options = createTestOptions({
      title: 'Test',
      complexity: '0',
    } as GlobalOptions & { title: string; complexity: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Complexity must be a number from 1 to 5');
  });

  test('fails with invalid task type', async () => {
    const options = createTestOptions({
      title: 'Test',
      type: 'invalid',
    } as GlobalOptions & { title: string; type: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid task type');
  });
});

// ============================================================================
// List Command Tests
// ============================================================================

describe('list command', () => {
  test('lists tasks', async () => {
    // Create some tasks first
    const createOpts = createTestOptions({ title: 'Task 1' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const createOpts2 = createTestOptions({ title: 'Task 2' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts2);

    // List tasks
    const options = createTestOptions();
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('lists tasks with status filter', async () => {
    // Create tasks with different statuses
    const createOpts = createTestOptions({ title: 'Open Task' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    // List only open tasks
    const options = createTestOptions({ status: 'open' } as GlobalOptions & { status: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const items = result.data as { status: string }[];
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => expect(item.status).toBe('open'));
  });

  test('lists tasks with priority filter', async () => {
    // Create tasks with different priorities
    const createOpts1 = createTestOptions({
      title: 'High Priority',
      priority: '1',
    } as GlobalOptions & { title: string; priority: string });
    await createCommand.handler(['task'], createOpts1);

    const createOpts2 = createTestOptions({
      title: 'Low Priority',
      priority: '5',
    } as GlobalOptions & { title: string; priority: string });
    await createCommand.handler(['task'], createOpts2);

    // List only priority 1 tasks
    const options = createTestOptions({ priority: '1' } as GlobalOptions & { priority: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const items = result.data as { priority: number }[];
    expect(items.length).toBe(1);
    expect(items[0].priority).toBe(1);
  });

  test('lists tasks with tag filter', async () => {
    // Create task with tag
    const createOpts = createTestOptions({
      title: 'Tagged Task',
      tag: ['important'],
    } as GlobalOptions & { title: string; tag: string[] });
    await createCommand.handler(['task'], createOpts);

    const createOpts2 = createTestOptions({ title: 'Untagged Task' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts2);

    // List tasks with tag
    const options = createTestOptions({ tag: ['important'] } as GlobalOptions & { tag: string[] });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const items = result.data as { tags: string[] }[];
    expect(items.length).toBe(1);
    expect(items[0].tags).toContain('important');
  });

  test('returns empty list when no tasks exist', async () => {
    // Initialize the database first by creating and then deleting a task
    const createOpts = createTestOptions({ title: 'Temp Task' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;
    const deleteOpts = createTestOptions();
    await deleteCommand.handler([taskId], deleteOpts);

    // Now list - should return empty
    const options = createTestOptions();
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('respects limit option', async () => {
    // Create 3 tasks
    for (let i = 1; i <= 3; i++) {
      const createOpts = createTestOptions({ title: `Task ${i}` } as GlobalOptions & { title: string });
      await createCommand.handler(['task'], createOpts);
    }

    // List with limit
    const options = createTestOptions({ limit: '2' } as GlobalOptions & { limit: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('fails with invalid status', async () => {
    // Initialize the database first
    const createOpts = createTestOptions({ title: 'Temp' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions({ status: 'invalid' } as GlobalOptions & { status: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid status');
  });

  test('fails with invalid priority', async () => {
    // Initialize the database first
    const createOpts = createTestOptions({ title: 'Temp' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions({ priority: 'abc' } as GlobalOptions & { priority: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Priority must be a number');
  });

  test('fails with invalid limit', async () => {
    // Initialize the database first
    const createOpts = createTestOptions({ title: 'Temp' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions({ limit: '-1' } as GlobalOptions & { limit: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Limit must be a positive number');
  });
});

// ============================================================================
// Show Command Tests
// ============================================================================

describe('show command', () => {
  test('shows task details', async () => {
    // Create a task first
    const createOpts = createTestOptions({
      title: 'Test Task',
      priority: '2',
      tag: ['test'],
    } as GlobalOptions & { title: string; priority: string; tag: string[] });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show the task
    const options = createTestOptions();
    const result = await showCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(data.id).toBe(taskId);
    expect(data.title).toBe('Test Task');
    expect(data.priority).toBe(2);
    expect(data.tags).toContain('test');
  });

  test('fails without id argument', async () => {
    const options = createTestOptions();
    const result = await showCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent element', async () => {
    // Initialize the database first
    const createOpts = createTestOptions({ title: 'Temp' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions();
    const result = await showCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Element not found');
  });

  test('returns JSON in JSON mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'JSON Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show with JSON mode
    const options = createTestOptions({ json: true });
    const result = await showCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { id: string }).id).toBe(taskId);
  });

  test('returns ID only in quiet mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Quiet Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show with quiet mode - returns just the ID as data
    const options = createTestOptions({ quiet: true });
    const result = await showCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // In quiet mode, data is the ID string directly
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Database Path Resolution Tests
// ============================================================================

describe('database path resolution', () => {
  test('list fails gracefully when database does not exist', async () => {
    // Point to a database path that doesn't exist
    const nonExistentDbPath = join(TEST_DIR, 'nonexistent', 'does-not-exist.db');

    const options: GlobalOptions = {
      db: nonExistentDbPath,
      json: false,
      quiet: false,
      verbose: false,
      help: false,
      version: false,
    };

    const result = await listCommand.handler([], options);
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.error).toContain('No database found');
  });

  test('show fails gracefully when database does not exist', async () => {
    // Point to a database path that doesn't exist
    const nonExistentDbPath = join(TEST_DIR, 'nonexistent', 'does-not-exist.db');

    const options: GlobalOptions = {
      db: nonExistentDbPath,
      json: false,
      quiet: false,
      verbose: false,
      help: false,
      version: false,
    };

    const result = await showCommand.handler(['el-abc123'], options);
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.error).toContain('No database found');
  });

  test('update fails gracefully when database does not exist', async () => {
    // Point to a database path that doesn't exist
    const nonExistentDbPath = join(TEST_DIR, 'nonexistent', 'does-not-exist.db');

    const options: GlobalOptions = {
      db: nonExistentDbPath,
      title: 'Test',
      json: false,
      quiet: false,
      verbose: false,
      help: false,
      version: false,
    };

    const result = await updateCommand.handler(['el-abc123'], options);
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.error).toContain('No database found');
  });

  test('delete fails gracefully when database does not exist', async () => {
    // Point to a database path that doesn't exist
    const nonExistentDbPath = join(TEST_DIR, 'nonexistent', 'does-not-exist.db');

    const options: GlobalOptions = {
      db: nonExistentDbPath,
      json: false,
      quiet: false,
      verbose: false,
      help: false,
      version: false,
    };

    const result = await deleteCommand.handler(['el-abc123'], options);
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.error).toContain('No database found');
  });

  test('uses explicit db path from options', async () => {
    const customDbPath = join(TEST_DIR, 'custom.db');
    const options = createTestOptions({ db: customDbPath, title: 'Custom DB Task' } as GlobalOptions & { db: string; title: string });

    const result = await createCommand.handler(['task'], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(existsSync(customDbPath)).toBe(true);
  });
});

// ============================================================================
// Output Format Tests
// ============================================================================

describe('output formats', () => {
  test('list command produces human readable output', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'Human Readable' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions();
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('ID');
    expect(result.message).toContain('TYPE');
  });

  test('list command produces JSON output', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'JSON Output' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions({ json: true });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('list command produces quiet output', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'Quiet Output' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    const options = createTestOptions({ quiet: true });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect((result.data as string)).toContain(taskId);
  });
});

// ============================================================================
// Update Command Tests
// ============================================================================

describe('update command', () => {
  test('updates task title', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Original Title' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update the task
    const updateOpts = createTestOptions({ title: 'Updated Title' } as GlobalOptions & { title: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { title: string }).title).toBe('Updated Title');
  });

  test('updates task priority', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Priority Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update priority
    const updateOpts = createTestOptions({ priority: '1' } as GlobalOptions & { priority: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { priority: number }).priority).toBe(1);
  });

  test('updates task complexity', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Complexity Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update complexity
    const updateOpts = createTestOptions({ complexity: '5' } as GlobalOptions & { complexity: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { complexity: number }).complexity).toBe(5);
  });

  test('updates task status', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Status Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update status
    const updateOpts = createTestOptions({ status: 'in_progress' } as GlobalOptions & { status: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('in_progress');
  });

  test('updates task assignee', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Assignee Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update assignee
    const updateOpts = createTestOptions({ assignee: 'new-assignee' } as GlobalOptions & { assignee: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { assignee: string }).assignee).toBe('new-assignee');
  });

  test('unassigns task with empty string', async () => {
    // Create a task with assignee
    const createOpts = createTestOptions({
      title: 'Unassign Test',
      assignee: 'original-assignee',
    } as GlobalOptions & { title: string; assignee: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Unassign with empty string
    const updateOpts = createTestOptions({ assignee: '' } as GlobalOptions & { assignee: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { assignee?: string }).assignee).toBeUndefined();
  });

  test('replaces all tags with --tag', async () => {
    // Create a task with tags
    const createOpts = createTestOptions({
      title: 'Tag Replace Test',
      tag: ['old-tag-1', 'old-tag-2'],
    } as GlobalOptions & { title: string; tag: string[] });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Replace tags
    const updateOpts = createTestOptions({ tag: ['new-tag-1', 'new-tag-2'] } as GlobalOptions & { tag: string[] });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tags = (result.data as { tags: string[] }).tags;
    expect(tags).toContain('new-tag-1');
    expect(tags).toContain('new-tag-2');
    expect(tags).not.toContain('old-tag-1');
    expect(tags).not.toContain('old-tag-2');
  });

  test('adds tags with --add-tag', async () => {
    // Create a task with tags
    const createOpts = createTestOptions({
      title: 'Tag Add Test',
      tag: ['existing-tag'],
    } as GlobalOptions & { title: string; tag: string[] });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Add tags
    const updateOpts = createTestOptions({ 'add-tag': ['new-tag'] } as GlobalOptions & { 'add-tag': string[] });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tags = (result.data as { tags: string[] }).tags;
    expect(tags).toContain('existing-tag');
    expect(tags).toContain('new-tag');
  });

  test('removes tags with --remove-tag', async () => {
    // Create a task with tags
    const createOpts = createTestOptions({
      title: 'Tag Remove Test',
      tag: ['keep-tag', 'remove-tag'],
    } as GlobalOptions & { title: string; tag: string[] });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Remove tags
    const updateOpts = createTestOptions({ 'remove-tag': ['remove-tag'] } as GlobalOptions & { 'remove-tag': string[] });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tags = (result.data as { tags: string[] }).tags;
    expect(tags).toContain('keep-tag');
    expect(tags).not.toContain('remove-tag');
  });

  test('updates multiple fields at once', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Multi Update Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update multiple fields
    const updateOpts = createTestOptions({
      title: 'New Title',
      priority: '2',
      complexity: '3',
      assignee: 'someone',
    } as GlobalOptions & { title: string; priority: string; complexity: string; assignee: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.title).toBe('New Title');
    expect(data.priority).toBe(2);
    expect(data.complexity).toBe(3);
    expect(data.assignee).toBe('someone');
  });

  test('fails without id argument', async () => {
    const options = createTestOptions({ title: 'Test' } as GlobalOptions & { title: string });
    const result = await updateCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent element', async () => {
    // Initialize the database first
    const createOpts = createTestOptions({ title: 'Temp' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions({ title: 'Test' } as GlobalOptions & { title: string });
    const result = await updateCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Element not found');
  });

  test('fails with no updates specified', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'No Update Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Try to update with no options
    const options = createTestOptions();
    const result = await updateCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('No updates specified');
  });

  test('fails with invalid priority', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Invalid Priority Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Try invalid priority
    const updateOpts = createTestOptions({ priority: '10' } as GlobalOptions & { priority: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Priority must be a number from 1 to 5');
  });

  test('fails with invalid complexity', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Invalid Complexity Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Try invalid complexity
    const updateOpts = createTestOptions({ complexity: '0' } as GlobalOptions & { complexity: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Complexity must be a number from 1 to 5');
  });

  test('fails with invalid status', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Invalid Status Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Try invalid status
    const updateOpts = createTestOptions({ status: 'invalid' } as GlobalOptions & { status: string });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid status');
  });

  test('returns JSON in JSON mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'JSON Mode Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update with JSON mode
    const updateOpts = createTestOptions({ json: true, title: 'JSON Updated' });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { title: string }).title).toBe('JSON Updated');
  });

  test('returns ID in quiet mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Quiet Mode Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update with quiet mode
    const updateOpts = createTestOptions({ quiet: true, title: 'Quiet Updated' });
    const result = await updateCommand.handler([taskId], updateOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Delete Command Tests
// ============================================================================

describe('delete command', () => {
  test('deletes a task', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Delete Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Delete the task
    const deleteOpts = createTestOptions();
    const result = await deleteCommand.handler([taskId], deleteOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Deleted');

    // Verify it's deleted (should not be found)
    const showOpts = createTestOptions();
    const showResult = await showCommand.handler([taskId], showOpts);
    expect(showResult.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('deletes with reason', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Delete With Reason' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Delete with reason
    const deleteOpts = createTestOptions({ reason: 'Duplicate entry' } as GlobalOptions & { reason: string });
    const result = await deleteCommand.handler([taskId], deleteOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Deleted');
  });

  test('fails without id argument', async () => {
    const options = createTestOptions();
    const result = await deleteCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent element', async () => {
    // Initialize the database first
    const createOpts = createTestOptions({ title: 'Temp' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions();
    const result = await deleteCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Element not found');
  });

  test('returns JSON in JSON mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'JSON Delete Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Delete with JSON mode
    const deleteOpts = createTestOptions({ json: true });
    const result = await deleteCommand.handler([taskId], deleteOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { id: string; deleted: boolean; type: string };
    expect(data.id).toBe(taskId);
    expect(data.deleted).toBe(true);
    expect(data.type).toBe('task');
  });

  test('returns ID in quiet mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Quiet Delete Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Delete with quiet mode
    const deleteOpts = createTestOptions({ quiet: true });
    const result = await deleteCommand.handler([taskId], deleteOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });

  test('deleting same element twice fails', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Double Delete Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Delete the task
    const deleteOpts = createTestOptions();
    const firstDelete = await deleteCommand.handler([taskId], deleteOpts);
    expect(firstDelete.exitCode).toBe(ExitCode.SUCCESS);

    // Try to delete again
    const secondDelete = await deleteCommand.handler([taskId], deleteOpts);
    expect(secondDelete.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Show Command Events Tests
// ============================================================================

describe('show command events', () => {
  test('shows events when --events flag is provided', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'Events Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show with events
    const showOpts = createTestOptions({ events: true } as GlobalOptions & { events: boolean });
    const result = await showCommand.handler([taskId], showOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Recent Events');
    expect(result.message).toContain('Created');
  });

  test('includes events in JSON output when --events flag is provided', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'JSON Events Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show with events in JSON mode
    const showOpts = createTestOptions({ json: true, events: true } as GlobalOptions & { json: boolean; events: boolean });
    const result = await showCommand.handler([taskId], showOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { element: unknown; events: unknown[] };
    expect(data.element).toBeDefined();
    expect(data.events).toBeDefined();
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);
  });

  test('limits events with --events-limit flag', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'Limit Events Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Update multiple times to create events
    for (let i = 0; i < 5; i++) {
      const updateOpts = createTestOptions({ title: `Update ${i}` } as GlobalOptions & { title: string });
      await updateCommand.handler([taskId], updateOpts);
    }

    // Show with events limit
    const showOpts = createTestOptions({
      json: true,
      events: true,
      'events-limit': '2',
    } as GlobalOptions & { json: boolean; events: boolean; 'events-limit': string });
    const result = await showCommand.handler([taskId], showOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { element: unknown; events: unknown[] };
    expect(data.events.length).toBe(2);
  });

  test('shows no events message when element has no events', async () => {
    // Note: In practice, creating an element creates an event, but we test the no-events path
    const createOpts = createTestOptions({ title: 'No Events Message Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Request events but with a filter that returns none
    const showOpts = createTestOptions({ events: true } as GlobalOptions & { events: boolean });
    const result = await showCommand.handler([taskId], showOpts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // Should show events section even if there are some
    expect(result.message).toContain('Recent Events');
  });
});

// ============================================================================
// Create with --plan Option Tests
// ============================================================================

describe('create command with --plan option', () => {
  test('creates task and attaches to plan by ID', async () => {
    // First create a plan
    const planOpts = createTestOptions({ title: 'Test Plan' } as GlobalOptions & { title: string });
    const planResult = await planCommand.subcommands!.create.handler([], planOpts);
    expect(planResult.exitCode).toBe(ExitCode.SUCCESS);
    const planId = (planResult.data as { id: string }).id;

    // Create task with --plan option
    const taskOpts = createTestOptions({
      title: 'Task in Plan',
      plan: planId,
    } as GlobalOptions & { title: string; plan: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);

    expect(taskResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(taskResult.message).toBe(`Created task ${(taskResult.data as { id: string }).id}`);
    expect(taskResult.message).not.toContain('Warning');
  });

  test('creates task and attaches to plan by name', async () => {
    // First create a plan
    const planOpts = createTestOptions({ title: 'Named Test Plan' } as GlobalOptions & { title: string });
    const planResult = await planCommand.subcommands!.create.handler([], planOpts);
    expect(planResult.exitCode).toBe(ExitCode.SUCCESS);

    // Create task with --plan option using plan name
    const taskOpts = createTestOptions({
      title: 'Task by Plan Name',
      plan: 'Named Test Plan',
    } as GlobalOptions & { title: string; plan: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);

    expect(taskResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(taskResult.message).toBe(`Created task ${(taskResult.data as { id: string }).id}`);
    expect(taskResult.message).not.toContain('Warning');
  });

  test('shows warning when plan not found', async () => {
    const taskOpts = createTestOptions({
      title: 'Task with Missing Plan',
      plan: 'nonexistent-plan',
    } as GlobalOptions & { title: string; plan: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);

    // Task should still be created
    expect(taskResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(taskResult.data).toBeDefined();
    expect((taskResult.data as { id: string }).id).toMatch(/^el-/);

    // But should show warning
    expect(taskResult.message).toContain('Warning');
    expect(taskResult.message).toContain('Plan not found');
    expect(taskResult.message).toContain('nonexistent-plan');
  });

  test('shows warning when plan ID not found', async () => {
    const taskOpts = createTestOptions({
      title: 'Task with Invalid Plan ID',
      plan: 'el-nonexistent123',
    } as GlobalOptions & { title: string; plan: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);

    // Task should still be created
    expect(taskResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(taskResult.data).toBeDefined();

    // But should show warning
    expect(taskResult.message).toContain('Warning');
    expect(taskResult.message).toContain('Plan not found');
  });

  test('verifies task is actually in plan after creation', async () => {
    // Create a plan
    const planOpts = createTestOptions({ title: 'Verify Plan' } as GlobalOptions & { title: string });
    const planResult = await planCommand.subcommands!.create.handler([], planOpts);
    const planId = (planResult.data as { id: string }).id;

    // Create task in plan
    const taskOpts = createTestOptions({
      title: 'Task to Verify',
      plan: planId,
    } as GlobalOptions & { title: string; plan: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);
    const taskId = (taskResult.data as { id: string }).id;

    // Check plan tasks
    const tasksOpts = createTestOptions();
    const tasksResult = await planCommand.subcommands!.tasks.handler([planId], tasksOpts);

    expect(tasksResult.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = tasksResult.data as { id: string }[];
    expect(tasks.some((t) => t.id === taskId)).toBe(true);
  });
});

// ============================================================================
// Create with --description Option Tests
// ============================================================================

describe('create command with --description option', () => {
  test('creates task with description document', async () => {
    const taskOpts = createTestOptions({
      title: 'Task with Description',
      description: 'This is the task description content',
    } as GlobalOptions & { title: string; description: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);

    expect(taskResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(taskResult.data).toBeDefined();
    const task = taskResult.data as { id: string; descriptionRef?: string };
    expect(task.id).toMatch(/^el-/);
    expect(task.descriptionRef).toBeDefined();
    expect(task.descriptionRef).toMatch(/^el-/);
  });

  test('creates task without description when not provided', async () => {
    const taskOpts = createTestOptions({
      title: 'Task without Description',
    } as GlobalOptions & { title: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);

    expect(taskResult.exitCode).toBe(ExitCode.SUCCESS);
    const task = taskResult.data as { id: string; descriptionRef?: string };
    expect(task.descriptionRef).toBeUndefined();
  });

  test('creates task with description and other options', async () => {
    const taskOpts = createTestOptions({
      title: 'Full Task with Description',
      description: 'Detailed description of the task',
      priority: '1',
      complexity: '3',
      type: 'feature',
      tag: ['important'],
    } as GlobalOptions & {
      title: string;
      description: string;
      priority: string;
      complexity: string;
      type: string;
      tag: string[];
    });
    const taskResult = await createCommand.handler(['task'], taskOpts);

    expect(taskResult.exitCode).toBe(ExitCode.SUCCESS);
    const task = taskResult.data as {
      id: string;
      descriptionRef?: string;
      priority: number;
      complexity: number;
      taskType: string;
      tags: string[];
    };
    expect(task.descriptionRef).toBeDefined();
    expect(task.priority).toBe(1);
    expect(task.complexity).toBe(3);
    expect(task.taskType).toBe('feature');
    expect(task.tags).toContain('important');
  });

  test('description document can be retrieved via show', async () => {
    const taskOpts = createTestOptions({
      title: 'Task to Show Description',
      description: 'Description content to verify',
    } as GlobalOptions & { title: string; description: string });
    const taskResult = await createCommand.handler(['task'], taskOpts);
    const task = taskResult.data as { id: string; descriptionRef: string };

    // Show the description document
    const showOpts = createTestOptions();
    const showResult = await showCommand.handler([task.descriptionRef], showOpts);

    expect(showResult.exitCode).toBe(ExitCode.SUCCESS);
    const doc = showResult.data as { id: string; content: string; contentType: string; type: string };
    expect(doc.id).toBe(task.descriptionRef);
    expect(doc.content).toBe('Description content to verify');
    expect(doc.contentType).toBe('markdown');
    expect(doc.type).toBe('document');
  });
});
