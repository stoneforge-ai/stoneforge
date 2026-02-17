/**
 * Task Commands Integration Tests
 *
 * Tests for the task-specific CLI commands:
 * - ready: List tasks ready for work
 * - blocked: List blocked tasks
 * - close: Close a task
 * - reopen: Reopen a closed task
 * - assign: Assign a task
 * - defer: Defer a task
 * - undefer: Remove deferral
 * - describe: Set or show task description
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readyCommand,
  blockedCommand,
  closeCommand,
  reopenCommand,
  assignCommand,
  deferCommand,
  undeferCommand,
  describeCommand,
  taskCommand,
} from './task.js';
import { createCommand, showCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import { DependencyType } from '@stoneforge/core';
import type { ElementId } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_task_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T {
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

// Helper to create a task and return its ID
async function createTestTask(
  title: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const options = createTestOptions({ title, ...extra });
  const result = await createCommand.handler(['task'], options);
  return (result.data as { id: string }).id;
}

// Helper to create API instance for direct manipulation
function createTestAPI() {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  return { api: createQuarryAPI(backend), backend };
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
  // Initialize the database so tests can run without auto-creation
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  backend.close();
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Ready Command Tests
// ============================================================================

describe('ready command', () => {
  test('lists open tasks as ready', async () => {
    // Create open tasks
    await createTestTask('Ready Task 1');
    await createTestTask('Ready Task 2');

    const options = createTestOptions();
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('filters by assignee', async () => {
    await createTestTask('Task for Alice', { assignee: 'alice' });
    await createTestTask('Task for Bob', { assignee: 'bob' });
    await createTestTask('Unassigned Task');

    const options = createTestOptions({ assignee: 'alice' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { assignee: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignee).toBe('alice');
  });

  test('filters by priority', async () => {
    await createTestTask('Critical Task', { priority: '1' });
    await createTestTask('Low Priority Task', { priority: '5' });

    const options = createTestOptions({ priority: '1' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { priority: number }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].priority).toBe(1);
  });

  test('filters by task type', async () => {
    await createTestTask('Bug Fix', { type: 'bug' });
    await createTestTask('New Feature', { type: 'feature' });

    const options = createTestOptions({ type: 'bug' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { taskType: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].taskType).toBe('bug');
  });

  test('respects limit option', async () => {
    await createTestTask('Task 1');
    await createTestTask('Task 2');
    await createTestTask('Task 3');

    const options = createTestOptions({ limit: '2' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('excludes blocked tasks', async () => {
    const taskId = await createTestTask('Blocked Task');
    const blockerTaskId = await createTestTask('Blocker Task');

    // Add a blocking dependency (blockerTask blocks taskId - taskId waits for blockerTask to close)
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: taskId as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions();
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { id: string }[];
    // The blocked task should not appear
    expect(tasks.some((t) => t.id === taskId)).toBe(false);
    // The blocker task should appear (it's not blocked)
    expect(tasks.some((t) => t.id === blockerTaskId)).toBe(true);
  });

  test('returns empty list when no ready tasks', async () => {
    const options = createTestOptions();
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No ready tasks');
  });

  test('returns JSON in JSON mode', async () => {
    await createTestTask('JSON Test Task');

    const options = createTestOptions({ json: true });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns IDs only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Test Task');

    const options = createTestOptions({ quiet: true });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain(taskId);
  });

  test('fails with invalid priority', async () => {
    const options = createTestOptions({ priority: 'invalid' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Priority must be a number');
  });

  test('fails with invalid limit', async () => {
    const options = createTestOptions({ limit: '-5' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Limit must be a positive number');
  });

  test('fails with invalid task type', async () => {
    const options = createTestOptions({ type: 'BUG' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid task type: BUG');
    expect(result.error).toContain('bug, feature, task, chore');
  });

  test('fails with unknown task type', async () => {
    const options = createTestOptions({ type: 'invalid-type' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid task type: invalid-type');
  });
});

// ============================================================================
// Blocked Command Tests
// ============================================================================

describe('blocked command', () => {
  test('lists blocked tasks with details', async () => {
    const taskId = await createTestTask('Blocked Task');
    const blockerTaskId = await createTestTask('Blocker Task');

    // Add a blocking dependency (blockerTask blocks taskId - taskId waits for blockerTask to close)
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: taskId as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions();
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { id: string; blockedBy: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(taskId);
    expect(tasks[0].blockedBy).toBe(blockerTaskId);
  });

  test('returns empty list when no blocked tasks', async () => {
    await createTestTask('Unblocked Task');

    const options = createTestOptions();
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No blocked tasks');
  });

  test('filters by assignee', async () => {
    const aliceTask = await createTestTask('Alice Task', { assignee: 'alice' });
    const bobTask = await createTestTask('Bob Task', { assignee: 'bob' });
    const blockerTaskId = await createTestTask('Blocker');

    // Block both tasks (blockerTask blocks aliceTask and bobTask)
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: aliceTask as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: bobTask as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ assignee: 'alice' });
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { assignee: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignee).toBe('alice');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Blocked Task');
    const blockerTaskId = await createTestTask('Blocker');

    // blockerTask blocks taskId - taskId waits for blockerTask to close
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: taskId as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ json: true });
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns IDs only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Blocked Task');
    const blockerTaskId = await createTestTask('Blocker');

    // blockerTask blocks taskId - taskId waits for blockerTask to close
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: taskId as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ quiet: true });
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain(taskId);
  });
});

// ============================================================================
// Close Command Tests
// ============================================================================

describe('close command', () => {
  test('closes an open task', async () => {
    const taskId = await createTestTask('Task to Close');

    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Closed task');

    // Verify task is closed
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('closed');
  });

  test('closes task with reason', async () => {
    const taskId = await createTestTask('Task with Reason');

    const options = createTestOptions({ reason: 'Fixed in PR #42' });
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify close reason
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { closeReason: string }).closeReason).toBe('Fixed in PR #42');
  });

  test('closes in_progress task', async () => {
    const taskId = await createTestTask('In Progress Task');

    // Change to in_progress first
    const { api } = createTestAPI();
    await api.update(taskId as ElementId, { status: 'in_progress' });

    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('closed');
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await closeCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await closeCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for already closed task', async () => {
    const taskId = await createTestTask('Already Closed');

    // Close it first
    await closeCommand.handler([taskId], createTestOptions());

    // Try to close again
    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('already closed');
  });

  test('fails for tombstone task', async () => {
    const taskId = await createTestTask('Deleted Task');

    // Delete it
    const { api } = createTestAPI();
    await api.delete(taskId as ElementId);

    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    // Should fail because tombstone cannot transition to closed
    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot close');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Close Task');

    const options = createTestOptions({ json: true });
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('closed');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Close Task');

    const options = createTestOptions({ quiet: true });
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Reopen Command Tests
// ============================================================================

describe('reopen command', () => {
  test('reopens a closed task', async () => {
    const taskId = await createTestTask('Task to Reopen');

    // Close it first
    await closeCommand.handler([taskId], createTestOptions());

    // Reopen it
    const options = createTestOptions();
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Reopened task');

    // Verify task is open
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await reopenCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await reopenCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for task that is not closed', async () => {
    const taskId = await createTestTask('Not Closed Task');

    const options = createTestOptions();
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('not closed');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Reopen Task');
    await closeCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('open');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Reopen Task');
    await closeCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ quiet: true });
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });

  test('clears assignee on reopen', async () => {
    const taskId = await createTestTask('Assigned Reopen Task');

    // Assign and then close
    await assignCommand.handler([taskId, 'agent-1'], createTestOptions());
    await closeCommand.handler([taskId], createTestOptions());

    // Reopen
    const result = await reopenCommand.handler([taskId], createTestOptions({ json: true }));
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { assignee?: string };
    expect(data.assignee).toBeUndefined();
  });

  test('clears orchestrator metadata on reopen', async () => {
    const taskId = await createTestTask('Meta Reopen Task');

    // Manually set orchestrator metadata via direct API
    const { api, backend } = createTestAPI();
    try {
      const task = await api.get(taskId as ElementId);
      if (task) {
        await api.update(taskId as ElementId, {
          metadata: {
            orchestrator: {
              branch: 'agent/bob/task-123',
              worktree: '/tmp/worktrees/bob',
              mergeStatus: 'merged',
              mergedAt: '2024-01-01T00:00:00Z',
              assignedAgent: 'agent-bob',
              sessionId: 'session-123',
              startedAt: '2024-01-01T00:00:00Z',
              completedAt: '2024-01-01T01:00:00Z',
              completionSummary: 'Done',
              lastCommitHash: 'abc123',
              testRunCount: 3,
              lastTestResult: { passed: true },
              reconciliationCount: 0,
            },
          },
        });
      }
    } finally {
      backend.close();
    }

    // Close and reopen
    await closeCommand.handler([taskId], createTestOptions());
    const result = await reopenCommand.handler([taskId], createTestOptions({ json: true }));
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const data = result.data as { metadata?: { orchestrator?: Record<string, unknown> } };
    const meta = data.metadata?.orchestrator;
    expect(meta).toBeDefined();
    // Preserved fields
    expect(meta?.branch).toBe('agent/bob/task-123');
    expect(meta?.worktree).toBe('/tmp/worktrees/bob');
    // Cleared fields
    expect(meta?.mergeStatus).toBeUndefined();
    expect(meta?.mergedAt).toBeUndefined();
    expect(meta?.assignedAgent).toBeUndefined();
    expect(meta?.sessionId).toBeUndefined();
    expect(meta?.startedAt).toBeUndefined();
    expect(meta?.completedAt).toBeUndefined();
    expect(meta?.completionSummary).toBeUndefined();
    expect(meta?.lastCommitHash).toBeUndefined();
    expect(meta?.testRunCount).toBeUndefined();
    expect(meta?.lastTestResult).toBeUndefined();
    // Incremented
    expect(meta?.reconciliationCount).toBe(1);
  });

  test('appends message to description document on reopen', async () => {
    const taskId = await createTestTask('Message Reopen Task');

    // Set a description first
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Original task description' })
    );

    // Close the task
    await closeCommand.handler([taskId], createTestOptions());

    // Reopen with message
    const result = await reopenCommand.handler(
      [taskId],
      createTestOptions({ message: 'Work was incomplete' })
    );
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify description was appended
    const showResult = await describeCommand.handler(
      [taskId],
      createTestOptions({ show: true, json: true })
    );
    const descData = showResult.data as { content: string };
    expect(descData.content).toContain('Original task description');
    expect(descData.content).toContain('**Re-opened** — Task was closed but incomplete. Message: Work was incomplete');
  });

  test('reopen with message creates description document when none exists', async () => {
    const taskId = await createTestTask('No Desc Reopen Task');

    // Close the task (no description set)
    await closeCommand.handler([taskId], createTestOptions());

    // Reopen with message
    const result = await reopenCommand.handler(
      [taskId],
      createTestOptions({ message: 'Some reason' })
    );
    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify description document was created with the reopen message
    const showResult = await describeCommand.handler(
      [taskId],
      createTestOptions({ show: true, json: true })
    );
    expect(showResult.exitCode).toBe(ExitCode.SUCCESS);
    const descData = showResult.data as { content: string };
    expect(descData.content).toContain('**Re-opened** — Task was closed but incomplete. Message: Some reason');
  });
});

// ============================================================================
// Assign Command Tests
// ============================================================================

describe('assign command', () => {
  test('assigns task to an entity', async () => {
    const taskId = await createTestTask('Task to Assign');

    const options = createTestOptions();
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Assigned task');
    expect(result.message).toContain('alice');

    // Verify assignment
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { assignee: string }).assignee).toBe('alice');
  });

  test('reassigns task to different entity', async () => {
    const taskId = await createTestTask('Task to Reassign', { assignee: 'bob' });

    const options = createTestOptions();
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { assignee: string }).assignee).toBe('alice');
  });

  test('unassigns task with --unassign flag', async () => {
    const taskId = await createTestTask('Task to Unassign', { assignee: 'bob' });

    const options = createTestOptions({ unassign: true });
    const result = await assignCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Unassigned');

    // Verify unassignment
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { assignee?: string }).assignee).toBeUndefined();
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await assignCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails without assignee and no --unassign', async () => {
    const taskId = await createTestTask('Task without Assignee');

    const options = createTestOptions();
    const result = await assignCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Specify an assignee');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await assignCommand.handler(['el-nonexistent', 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Assign Task');

    const options = createTestOptions({ json: true });
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { assignee: string }).assignee).toBe('alice');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Assign Task');

    const options = createTestOptions({ quiet: true });
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Defer Command Tests
// ============================================================================

describe('defer command', () => {
  test('defers an open task', async () => {
    const taskId = await createTestTask('Task to Defer');

    const options = createTestOptions();
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Deferred task');

    // Verify task is deferred
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('deferred');
  });

  test('defers task with until date', async () => {
    const taskId = await createTestTask('Task with Until');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const options = createTestOptions({ until: futureDate.toISOString() });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('until');

    // Verify scheduledFor is set
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { scheduledFor: string }).scheduledFor).toBeDefined();
  });

  test('defers in_progress task', async () => {
    const taskId = await createTestTask('In Progress to Defer');

    // Change to in_progress first
    const { api } = createTestAPI();
    await api.update(taskId as ElementId, { status: 'in_progress' });

    const options = createTestOptions();
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('deferred');
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await deferCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await deferCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for closed task', async () => {
    const taskId = await createTestTask('Closed Task to Defer');
    await closeCommand.handler([taskId], createTestOptions());

    const options = createTestOptions();
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot defer');
  });

  test('fails with invalid date format', async () => {
    const taskId = await createTestTask('Task with Invalid Date');

    const options = createTestOptions({ until: 'not-a-date' });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid date format');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Defer Task');

    const options = createTestOptions({ json: true });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('deferred');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Defer Task');

    const options = createTestOptions({ quiet: true });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Undefer Command Tests
// ============================================================================

describe('undefer command', () => {
  test('undefers a deferred task', async () => {
    const taskId = await createTestTask('Task to Undefer');
    await deferCommand.handler([taskId], createTestOptions());

    const options = createTestOptions();
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Undeferred task');

    // Verify task is open again
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('clears scheduledFor when undefering', async () => {
    const taskId = await createTestTask('Task with ScheduledFor');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    await deferCommand.handler([taskId], createTestOptions({ until: futureDate.toISOString() }));

    const options = createTestOptions();
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify scheduledFor is cleared
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { scheduledFor?: string }).scheduledFor).toBeUndefined();
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await undeferCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await undeferCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for task that is not deferred', async () => {
    const taskId = await createTestTask('Not Deferred Task');

    const options = createTestOptions();
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('not deferred');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Undefer Task');
    await deferCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('open');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Undefer Task');
    await deferCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ quiet: true });
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('task command integration', () => {
  test('full task lifecycle: create -> assign -> close -> reopen', async () => {
    // Create task
    const taskId = await createTestTask('Lifecycle Task');

    // Assign
    await assignCommand.handler([taskId, 'developer'], createTestOptions());

    // Close
    await closeCommand.handler([taskId], createTestOptions({ reason: 'Done' }));

    // Verify closed
    let showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('closed');

    // Reopen
    await reopenCommand.handler([taskId], createTestOptions());

    // Verify reopened
    showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('defer workflow: create -> defer with date -> undefer', async () => {
    const taskId = await createTestTask('Defer Lifecycle Task');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    // Defer with date
    await deferCommand.handler([taskId], createTestOptions({ until: futureDate.toISOString() }));

    // Verify deferred
    let showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('deferred');
    expect((showResult.data as { scheduledFor: string }).scheduledFor).toBeDefined();

    // Undefer
    await undeferCommand.handler([taskId], createTestOptions());

    // Verify open and scheduledFor cleared
    showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
    expect((showResult.data as { scheduledFor?: string }).scheduledFor).toBeUndefined();
  });

  test('blocked task workflow: create tasks -> add dependency -> verify blocked', async () => {
    const blockedTaskId = await createTestTask('Blocked Task');
    const blockerTaskId = await createTestTask('Blocker Task');

    // Add dependency (blockerTask blocks blockedTask - blockedTask waits for blockerTask to close)
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: blockedTaskId as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    // Verify blocked shows blocked task
    const blockedResult = await blockedCommand.handler([], createTestOptions());
    expect((blockedResult.data as { id: string }[]).some((t) => t.id === blockedTaskId)).toBe(true);

    // Verify ready shows only non-blocked task
    const readyResult = await readyCommand.handler([], createTestOptions());
    const readyTasks = readyResult.data as { id: string }[];
    expect(readyTasks.some((t) => t.id === blockedTaskId)).toBe(false);
    expect(readyTasks.some((t) => t.id === blockerTaskId)).toBe(true);
  });
});

// ============================================================================
// Task Lifecycle E2E Tests
// ============================================================================

describe('task lifecycle E2E scenarios', () => {
  test('complete task lifecycle: create → assign → work → close', async () => {
    // 1. Create a task
    const createResult = await createCommand.handler(['task'], createTestOptions({
      title: 'E2E Lifecycle Task',
      priority: '2',
      complexity: '3',
      type: 'feature',
    }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const task = createResult.data as { id: string; status: string; priority: number };
    expect(task.status).toBe('open');
    expect(task.priority).toBe(2);

    // 2. Verify task appears in ready list
    let readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === task.id)).toBe(true);

    // 3. Assign to a developer
    const assignResult = await assignCommand.handler([task.id, 'dev-alice'], createTestOptions());
    expect(assignResult.exitCode).toBe(ExitCode.SUCCESS);

    // 4. Verify task still appears in ready list (assigned tasks are still ready)
    readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === task.id)).toBe(true);

    // 5. Move to in_progress via API
    const { api, backend } = createTestAPI();
    await api.update(task.id as ElementId, { status: 'in_progress' });
    backend.close();

    // 6. Verify task still appears in ready list (in_progress is still "ready for work")
    readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === task.id)).toBe(true);

    // 7. Close the task with a reason
    const closeResult = await closeCommand.handler([task.id], createTestOptions({
      reason: 'Feature completed and merged in PR #123',
    }));
    expect(closeResult.exitCode).toBe(ExitCode.SUCCESS);

    // 8. Verify task no longer appears in ready list
    readyResult = await readyCommand.handler([], createTestOptions());
    const readyAfterClose = (readyResult.data as { id: string }[] | null) ?? [];
    expect(readyAfterClose.some(t => t.id === task.id)).toBe(false);

    // 9. Verify final state
    const showResult = await showCommand.handler([task.id], createTestOptions({ json: true }));
    const finalTask = showResult.data as {
      status: string;
      closeReason: string;
      closedAt: string;
      assignee: string;
    };
    expect(finalTask.status).toBe('closed');
    expect(finalTask.closeReason).toBe('Feature completed and merged in PR #123');
    expect(finalTask.closedAt).toBeDefined();
    expect(finalTask.assignee).toBe('dev-alice');
  });

  test('task deferral lifecycle: create → defer → not ready → undefer → ready', async () => {
    // 1. Create a task
    const createResult = await createCommand.handler(['task'], createTestOptions({
      title: 'Deferred Task',
    }));
    const task = createResult.data as { id: string };

    // 2. Verify task is initially ready
    let readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === task.id)).toBe(true);

    // 3. Defer the task with a future date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const deferResult = await deferCommand.handler([task.id], createTestOptions({
      until: futureDate.toISOString(),
    }));
    expect(deferResult.exitCode).toBe(ExitCode.SUCCESS);

    // 4. Verify task is no longer in ready list
    readyResult = await readyCommand.handler([], createTestOptions());
    const readyAfterDefer = (readyResult.data as { id: string }[] | null) ?? [];
    expect(readyAfterDefer.some(t => t.id === task.id)).toBe(false);

    // 5. Verify task status is deferred
    let showResult = await showCommand.handler([task.id], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('deferred');

    // 6. Undefer the task
    const undeferResult = await undeferCommand.handler([task.id], createTestOptions());
    expect(undeferResult.exitCode).toBe(ExitCode.SUCCESS);

    // 7. Verify task is back in ready list
    readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === task.id)).toBe(true);

    // 8. Verify task status is open
    showResult = await showCommand.handler([task.id], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('blocked task lifecycle: create tasks → block → unblock via completion → ready', async () => {
    // 1. Create a task that will be blocked
    const blockedTaskId = await createTestTask('Feature Implementation');

    // 2. Create a blocker task
    const blockerTaskId = await createTestTask('Design Review');

    // 3. Add blocking dependency (blockerTask blocks blockedTask - blockedTask waits for blockerTask to close)
    const { api, backend } = createTestAPI();
    await api.addDependency({
      blockedId: blockedTaskId as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    // 4. Verify blocked task is in blocked list
    let blockedResult = await blockedCommand.handler([], createTestOptions());
    let blockedTasks = blockedResult.data as { id: string; blockedBy: string }[];
    expect(blockedTasks.some(t => t.id === blockedTaskId)).toBe(true);
    expect(blockedTasks.find(t => t.id === blockedTaskId)?.blockedBy).toBe(blockerTaskId);

    // 5. Verify blocked task is NOT in ready list
    let readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === blockedTaskId)).toBe(false);

    // 6. Verify blocker task IS in ready list
    expect((readyResult.data as { id: string }[]).some(t => t.id === blockerTaskId)).toBe(true);

    // 7. Close the blocker task (completing the dependency)
    const closeResult = await closeCommand.handler([blockerTaskId], createTestOptions({
      reason: 'Design approved',
    }));
    expect(closeResult.exitCode).toBe(ExitCode.SUCCESS);

    // 8. Need to refresh API to see blocked cache updates
    backend.close();

    // 9. Verify previously blocked task is now ready
    readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === blockedTaskId)).toBe(true);

    // 10. Verify blocked list no longer contains the task
    blockedResult = await blockedCommand.handler([], createTestOptions());
    const blockedAfterClose = (blockedResult.data as { id: string }[] | null) ?? [];
    expect(blockedAfterClose.some(t => t.id === blockedTaskId)).toBe(false);
  });

  test('task reopen lifecycle: create → close → verify not ready → reopen → ready', async () => {
    // 1. Create and immediately close a task
    const taskId = await createTestTask('Prematurely Closed Task');
    await closeCommand.handler([taskId], createTestOptions({ reason: 'Thought it was done' }));

    // 2. Verify task is not in ready list
    let readyResult = await readyCommand.handler([], createTestOptions());
    const readyAfterClose = (readyResult.data as { id: string }[] | null) ?? [];
    expect(readyAfterClose.some(t => t.id === taskId)).toBe(false);

    // 3. Verify task is closed
    let showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('closed');

    // 4. Reopen the task
    const reopenResult = await reopenCommand.handler([taskId], createTestOptions());
    expect(reopenResult.exitCode).toBe(ExitCode.SUCCESS);

    // 5. Verify task is back in ready list
    readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === taskId)).toBe(true);

    // 6. Verify task status is open
    showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('priority-based ready ordering: high priority tasks appear first', async () => {
    // 1. Create tasks with different priorities
    await createTestTask('Low Priority', { priority: '5' });
    await createTestTask('Critical Priority', { priority: '1' });
    await createTestTask('Medium Priority', { priority: '3' });

    // 2. Get ready tasks
    const readyResult = await readyCommand.handler([], createTestOptions());
    const tasks = readyResult.data as { title: string; priority: number }[];

    // 3. Verify tasks are ordered by priority (lowest number = highest priority first)
    expect(tasks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i].priority).toBeGreaterThanOrEqual(tasks[i - 1].priority);
    }

    // 4. Verify Critical Priority is first
    expect(tasks[0].priority).toBe(1);
  });

  test('soft delete lifecycle: create → delete → not in ready → not visible', async () => {
    // 1. Create a task
    const taskId = await createTestTask('Task to Delete');

    // 2. Verify task is in ready list
    let readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === taskId)).toBe(true);

    // 3. Soft delete the task
    const { api, backend } = createTestAPI();
    await api.delete(taskId as ElementId);
    backend.close();

    // 4. Verify task is no longer in ready list
    readyResult = await readyCommand.handler([], createTestOptions());
    const readyAfterDelete = (readyResult.data as { id: string }[] | null) ?? [];
    expect(readyAfterDelete.some(t => t.id === taskId)).toBe(false);

    // 5. Verify task is not visible via show (tombstone elements return NOT_FOUND)
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect(showResult.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(showResult.error).toContain('not found');
  });

  test('assignment filtering: filter ready tasks by assignee', async () => {
    // 1. Create tasks for different assignees
    await createTestTask('Alice Task 1', { assignee: 'alice' });
    await createTestTask('Alice Task 2', { assignee: 'alice' });
    await createTestTask('Bob Task', { assignee: 'bob' });
    await createTestTask('Unassigned Task');

    // 2. Filter by alice
    let readyResult = await readyCommand.handler([], createTestOptions({ assignee: 'alice' }));
    let tasks = readyResult.data as { assignee: string }[];
    expect(tasks.length).toBe(2);
    expect(tasks.every(t => t.assignee === 'alice')).toBe(true);

    // 3. Filter by bob
    readyResult = await readyCommand.handler([], createTestOptions({ assignee: 'bob' }));
    tasks = readyResult.data as { assignee: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignee).toBe('bob');
  });

  test('complex dependency chain: A blocks B blocks C → only A is ready', async () => {
    // 1. Create a chain of tasks: A blocks B blocks C (B waits for A, C waits for B)
    const taskA = await createTestTask('Task A - Foundation');
    const taskB = await createTestTask('Task B - Middleware');
    const taskC = await createTestTask('Task C - Feature');

    // 2. Add dependencies (A blocks B - B waits for A, B blocks C - C waits for B)
    const { api, backend } = createTestAPI();
    // A blocks B (B waits for A to close)
    await api.addDependency({
      blockedId: taskB as ElementId,
      blockerId: taskA as ElementId,
      type: DependencyType.BLOCKS,
    });
    // B blocks C (C waits for B to close)
    await api.addDependency({
      blockedId: taskC as ElementId,
      blockerId: taskB as ElementId,
      type: DependencyType.BLOCKS,
    });
    backend.close();

    // 3. Verify only A is in ready list
    const readyResult = await readyCommand.handler([], createTestOptions());
    const readyTasks = readyResult.data as { id: string }[];
    expect(readyTasks.some(t => t.id === taskA)).toBe(true);
    expect(readyTasks.some(t => t.id === taskB)).toBe(false);
    expect(readyTasks.some(t => t.id === taskC)).toBe(false);

    // 4. Verify both B and C are in blocked list
    const blockedResult = await blockedCommand.handler([], createTestOptions());
    const blockedTasks = blockedResult.data as { id: string }[];
    expect(blockedTasks.some(t => t.id === taskB)).toBe(true);
    expect(blockedTasks.some(t => t.id === taskC)).toBe(true);
  });

  test('unblock chain: completing blockers cascades to unblock dependents', async () => {
    // 1. Create a chain: A blocks B, B blocks C
    // Semantics: target waits for source to close
    const taskA = await createTestTask('Foundation Task');
    const taskB = await createTestTask('Middle Task');
    const taskC = await createTestTask('Final Task');

    // 2. Add dependencies
    let { api, backend } = createTestAPI();
    // A blocks B (B waits for A)
    await api.addDependency({
      blockedId: taskB as ElementId,
      blockerId: taskA as ElementId,
      type: DependencyType.BLOCKS,
    });
    // B blocks C (C waits for B)
    await api.addDependency({
      blockedId: taskC as ElementId,
      blockerId: taskB as ElementId,
      type: DependencyType.BLOCKS,
    });
    backend.close();

    // 3. Complete Task A
    await closeCommand.handler([taskA], createTestOptions({ reason: 'Foundation complete' }));

    // 4. Verify B is now ready (but C is still blocked by B)
    let readyResult = await readyCommand.handler([], createTestOptions());
    let readyTasks = readyResult.data as { id: string }[];
    expect(readyTasks.some(t => t.id === taskB)).toBe(true);
    expect(readyTasks.some(t => t.id === taskC)).toBe(false);

    // 5. Complete Task B
    await closeCommand.handler([taskB], createTestOptions({ reason: 'Middle complete' }));

    // 6. Verify C is now ready
    readyResult = await readyCommand.handler([], createTestOptions());
    readyTasks = readyResult.data as { id: string }[];
    expect(readyTasks.some(t => t.id === taskC)).toBe(true);
  });

  test('multiple blockers: task blocked by multiple dependencies', async () => {
    // 1. Create tasks where one task depends on multiple blockers
    // blockerA, blockerB, blockerC all block mainTask
    const blockerA = await createTestTask('Blocker A - Database Schema');
    const blockerB = await createTestTask('Blocker B - API Design');
    const blockerC = await createTestTask('Blocker C - Auth Setup');
    const mainTask = await createTestTask('Main Feature - Needs All Blockers');

    // 2. Add multiple blocking dependencies
    // All blockers block mainTask (mainTask waits for all)
    const { api, backend } = createTestAPI();
    await api.addDependency({
      blockedId: mainTask as ElementId,
      blockerId: blockerA as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: mainTask as ElementId,
      blockerId: blockerB as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      blockedId: mainTask as ElementId,
      blockerId: blockerC as ElementId,
      type: DependencyType.BLOCKS,
    });
    backend.close();

    // 3. Verify main task is blocked
    let readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === mainTask)).toBe(false);

    // 4. Complete first two blockers
    await closeCommand.handler([blockerA], createTestOptions());
    await closeCommand.handler([blockerB], createTestOptions());

    // 5. Main task should still be blocked (blockerC is still open)
    readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === mainTask)).toBe(false);

    // 6. Complete final blocker
    await closeCommand.handler([blockerC], createTestOptions());

    // 7. Main task should now be ready
    readyResult = await readyCommand.handler([], createTestOptions());
    expect((readyResult.data as { id: string }[]).some(t => t.id === mainTask)).toBe(true);
  });

  test('task type filtering in ready list', async () => {
    // 1. Create tasks of different types
    await createTestTask('Bug Fix', { type: 'bug' });
    await createTestTask('New Feature', { type: 'feature' });
    await createTestTask('Tech Debt', { type: 'chore' });

    // 2. Filter by bug type
    let readyResult = await readyCommand.handler([], createTestOptions({ type: 'bug' }));
    let tasks = readyResult.data as { taskType: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].taskType).toBe('bug');

    // 3. Filter by feature type
    readyResult = await readyCommand.handler([], createTestOptions({ type: 'feature' }));
    tasks = readyResult.data as { taskType: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].taskType).toBe('feature');

    // 4. Filter by chore type
    readyResult = await readyCommand.handler([], createTestOptions({ type: 'chore' }));
    tasks = readyResult.data as { taskType: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].taskType).toBe('chore');
  });

  test('task close reason persists through lifecycle', async () => {
    // 1. Create a basic task
    const taskId = await createTestTask('Task with Close Reason');

    // 2. Assign the task
    await assignCommand.handler([taskId, 'developer-1'], createTestOptions());

    // 3. Close the task with a detailed reason
    const closeResult = await closeCommand.handler([taskId], createTestOptions({
      reason: 'Fixed in commit abc123, verified in staging',
    }));
    expect(closeResult.exitCode).toBe(ExitCode.SUCCESS);

    // 4. Verify the close reason is persisted
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    const task = showResult.data as {
      status: string;
      closeReason: string;
      closedAt: string;
      assignee: string;
    };
    expect(task.status).toBe('closed');
    expect(task.closeReason).toBe('Fixed in commit abc123, verified in staging');
    expect(task.closedAt).toBeDefined();
    expect(task.assignee).toBe('developer-1');
  });
});

// ============================================================================
// Describe Command Tests
// ============================================================================

describe('describe command', () => {
  test('sets task description with inline content', async () => {
    const taskId = await createTestTask('Task needing description');

    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'This is the task description', json: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { taskId: string; descriptionRef: string; document: { content: string } };
    expect(data.document.content).toBe('This is the task description');
  });

  test('sets task description from file', async () => {
    const taskId = await createTestTask('Task with file description');
    const filePath = join(TEST_DIR, 'description.md');
    writeFileSync(filePath, '# Task Description\n\nDetailed description here.');

    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ file: filePath, json: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { document: { content: string } };
    expect(data.document.content).toBe('# Task Description\n\nDetailed description here.');
  });

  test('shows task description with --show', async () => {
    const taskId = await createTestTask('Task to show description');

    // Set description first
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Original description' })
    );

    // Show it
    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ show: true, json: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { content: string };
    expect(data.content).toBe('Original description');
  });

  test('updates existing description', async () => {
    const taskId = await createTestTask('Task with updatable description');

    // Set initial description
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Version 1' })
    );

    // Update description
    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Version 2', json: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { document: { content: string; version: number } };
    expect(data.document.content).toBe('Version 2');
    expect(data.document.version).toBe(2);
  });

  test('fails without task ID', async () => {
    const result = await describeCommand.handler(
      [],
      createTestOptions({ content: 'Some content' })
    );

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('fails without content, file, or show', async () => {
    const taskId = await createTestTask('Task without options');

    const result = await describeCommand.handler([taskId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('fails with both content and file', async () => {
    const taskId = await createTestTask('Task with conflicting options');
    const filePath = join(TEST_DIR, 'desc.md');
    writeFileSync(filePath, 'File content');

    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Inline content', file: filePath })
    );

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });

  test('fails for non-existent task', async () => {
    // Initialize database first
    const { backend } = createTestAPI();
    backend.close();

    const result = await describeCommand.handler(
      ['el-nonexistent'],
      createTestOptions({ content: 'Description' })
    );

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('shows message when task has no description', async () => {
    const taskId = await createTestTask('Task without description');

    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ show: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('has no description');
  });

  test('appends to existing description with --append', async () => {
    const taskId = await createTestTask('Task for append test');

    // Set initial description
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Initial description' })
    );

    // Append to it
    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Appended content', append: true, json: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { document: { content: string }; appended: boolean };
    expect(data.document.content).toBe('Initial description\n\nAppended content');
    expect(data.appended).toBe(true);
  });

  test('append creates description if none exists', async () => {
    const taskId = await createTestTask('Task without initial description');

    // Append to non-existent description (should create it)
    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'First content via append', append: true, json: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { document: { content: string } };
    expect(data.document.content).toBe('First content via append');
  });

  test('append with file content', async () => {
    const taskId = await createTestTask('Task for file append');
    const filePath = join(TEST_DIR, 'append.md');
    writeFileSync(filePath, 'Content from file');

    // Set initial description
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Base description' })
    );

    // Append from file
    const result = await describeCommand.handler(
      [taskId],
      createTestOptions({ file: filePath, append: true, json: true })
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { document: { content: string } };
    expect(data.document.content).toBe('Base description\n\nContent from file');
  });

  test('multiple appends accumulate', async () => {
    const taskId = await createTestTask('Task for multiple appends');

    // Initial description
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Part 1' })
    );

    // First append
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Part 2', append: true })
    );

    // Second append
    await describeCommand.handler(
      [taskId],
      createTestOptions({ content: 'Part 3', append: true })
    );

    // Verify final content
    const showResult = await describeCommand.handler(
      [taskId],
      createTestOptions({ show: true, json: true })
    );

    const data = showResult.data as { content: string };
    expect(data.content).toBe('Part 1\n\nPart 2\n\nPart 3');
  });
});

// ============================================================================
// Task Root Command Tests
// ============================================================================

describe('task command', () => {
  test('has describe subcommand', () => {
    expect(taskCommand.subcommands).toBeDefined();
    expect(taskCommand.subcommands!.describe).toBe(describeCommand);
  });

  test('fails without subcommand', async () => {
    const result = await taskCommand.handler!([], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });
});

// ============================================================================
// Task List --ready Flag Tests
// ============================================================================

describe('task list --ready flag', () => {
  // Access the list subcommand handler through taskCommand
  const listCommand = taskCommand.subcommands!.list;

  test('shows only dispatch-ready tasks', async () => {
    // Create some open tasks (should be ready)
    await createTestTask('Ready Task 1');
    await createTestTask('Ready Task 2');

    const options = createTestOptions({ ready: true });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('excludes blocked tasks from --ready results', async () => {
    const taskId = await createTestTask('Blocked Task');
    const blockerTaskId = await createTestTask('Blocker Task');

    // Add a blocking dependency
    const { api } = createTestAPI();
    await api.addDependency({
      blockedId: taskId as ElementId,
      blockerId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ ready: true });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { id: string }[];
    // The blocked task should not appear
    expect(tasks.some((t) => t.id === taskId)).toBe(false);
    // The blocker task should appear (it's not blocked)
    expect(tasks.some((t) => t.id === blockerTaskId)).toBe(true);
  });

  test('errors when --ready and --status are both provided', async () => {
    const options = createTestOptions({ ready: true, status: 'open' });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot use --ready and --status together');
  });

  test('supports --assignee filter with --ready', async () => {
    await createTestTask('Task for Alice', { assignee: 'alice' });
    await createTestTask('Task for Bob', { assignee: 'bob' });
    await createTestTask('Unassigned Task');

    const options = createTestOptions({ ready: true, assignee: 'alice' });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { assignee: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignee).toBe('alice');
  });

  test('supports --priority filter with --ready', async () => {
    await createTestTask('Critical Task', { priority: '1' });
    await createTestTask('Low Priority Task', { priority: '5' });

    const options = createTestOptions({ ready: true, priority: '1' });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { priority: number }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].priority).toBe(1);
  });

  test('supports --limit filter with --ready', async () => {
    await createTestTask('Task 1');
    await createTestTask('Task 2');
    await createTestTask('Task 3');

    const options = createTestOptions({ ready: true, limit: '2' });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('returns JSON in JSON mode with --ready', async () => {
    await createTestTask('JSON Ready Task');

    const options = createTestOptions({ ready: true, json: true });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns IDs only in quiet mode with --ready', async () => {
    const taskId = await createTestTask('Quiet Ready Task');

    const options = createTestOptions({ ready: true, quiet: true });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain(taskId);
  });

  test('returns empty list when no ready tasks with --ready', async () => {
    const options = createTestOptions({ ready: true });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No ready tasks');
  });

  test('excludes tasks blocked by plan-level deps with --ready', async () => {
    const { api } = createTestAPI();
    const { createPlan } = await import('@stoneforge/core');

    // Create a plan in draft status using the proper factory function
    const planInput = await createPlan({
      title: 'Draft Plan',
      createdBy: 'test-user' as any,
    });
    const plan = await api.create(planInput as any);

    // Create a task
    const taskId = await createTestTask('Plan Child Task');

    // Make the task a child of the draft plan (parent-child dependency)
    await api.addDependency({
      blockedId: taskId as ElementId,
      blockerId: plan.id as ElementId,
      type: 'parent-child' as any,
    });

    const options = createTestOptions({ ready: true });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // Result could be null (no ready tasks) or an array
    const tasks = (result.data as { id: string }[] | null) ?? [];
    // The task under a draft plan should NOT appear in ready results
    expect(tasks.some((t) => t.id === taskId)).toBe(false);
  });

  test('falls back to normal list when --ready is not provided', async () => {
    await createTestTask('Normal List Task');

    const options = createTestOptions({ status: 'open' });
    const result = await listCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });
});
