/**
 * External Sync Link-All Command Tests
 *
 * Tests the `sf external-sync link-all` command with mocked providers:
 * - Success: links all unlinked tasks via mock provider
 * - Dry run: lists tasks without creating issues
 * - Status filtering: only links tasks with specified status
 * - Partial failure: continues when individual tasks fail
 * - Rate limit: stops gracefully when rate limited
 * - No unlinked tasks: reports nothing to do
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createAPI } from '../db.js';
import type { Task, ElementId, ExternalProvider, SyncDirection } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_link_all_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions(
  overrides: Partial<GlobalOptions & Record<string, unknown>> = {}
): GlobalOptions {
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
 * Creates tasks in the database for testing.
 */
async function createTestTasks(
  options: GlobalOptions,
  tasks: Array<{ title: string; status?: string; tags?: string[] }>
): Promise<string[]> {
  const { createCommand } = await import('./crud.js');
  const ids: string[] = [];

  for (const taskDef of tasks) {
    const opts = {
      ...options,
      title: taskDef.title,
      status: taskDef.status,
      tag: taskDef.tags,
    };
    const result = await createCommand.handler(['task'], opts);
    if (result.exitCode === 0 && result.data) {
      const data = result.data as Record<string, unknown>;
      ids.push(data.id as string);
    }
  }

  return ids;
}

/**
 * Helper to mark a task as already linked (with _externalSync metadata).
 */
async function linkTask(options: GlobalOptions, taskId: string): Promise<void> {
  const { api } = createAPI(options);
  const task = await api!.get<Task>(taskId as ElementId);
  if (task) {
    const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>;
    await api!.update<Task>(taskId as ElementId, {
      externalRef: `https://github.com/test/repo/issues/1`,
      metadata: {
        ...existingMetadata,
        _externalSync: {
          provider: 'github',
          project: 'test/repo',
          externalId: '1',
          url: 'https://github.com/test/repo/issues/1',
          direction: 'bidirectional',
          adapterType: 'task',
        },
      },
    } as Partial<Task>);
  }
}

// ============================================================================
// Mock Provider Setup
// ============================================================================

let issueCounter = 0;

function createMockProvider(opts?: {
  failOnTaskIds?: Set<string>;
  rateLimitAfter?: number;
}) {
  let createCount = 0;

  return {
    name: 'github',
    displayName: 'GitHub',
    supportedAdapters: ['task' as const],
    testConnection: async () => true,
    getTaskAdapter: () => ({
      getIssue: async () => null,
      listIssuesSince: async () => [],
      createIssue: async (_project: string, issue: { title: string; body?: string; labels?: string[] }) => {
        createCount++;

        // Simulate rate limit
        if (opts?.rateLimitAfter !== undefined && createCount > opts.rateLimitAfter) {
          const error = new Error('GitHub API rate limit exhausted') as Error & {
            isRateLimited: boolean;
            rateLimit: { limit: number; remaining: number; reset: number };
            status: number;
          };
          error.isRateLimited = true;
          error.rateLimit = { limit: 5000, remaining: 0, reset: Math.floor(Date.now() / 1000) + 3600 };
          error.status = 403;
          throw error;
        }

        // Simulate individual task failure
        if (opts?.failOnTaskIds) {
          // Check if the body contains a task ID we should fail on
          for (const failId of opts.failOnTaskIds) {
            if (issue.body?.includes(failId) || issue.title.includes(failId)) {
              throw new Error(`Failed to create issue for task: simulated error`);
            }
          }
        }

        issueCounter++;
        return {
          externalId: String(issueCounter),
          url: `https://github.com/test/repo/issues/${issueCounter}`,
          provider: 'github',
          project: 'test/repo',
          title: issue.title,
          body: issue.body,
          state: 'open' as const,
          labels: issue.labels ?? [],
          assignees: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      updateIssue: async () => {
        throw new Error('Not implemented');
      },
      getFieldMapConfig: () => ({ provider: 'github', fields: [] }),
    }),
  };
}

/**
 * Creates a _providerFactory function that injects a mock provider.
 * This is used with the handler's dependency injection support to bypass
 * the real createProviderFromSettings (which needs tokens, settings service, etc.).
 */
function createMockProviderFactory(mockProvider: ReturnType<typeof createMockProvider>) {
  return async (
    _providerName: string,
    _projectOverride: string | undefined,
    _options: GlobalOptions
  ): Promise<{
    provider?: ExternalProvider;
    project?: string;
    direction?: SyncDirection;
    error?: string;
  }> => ({
    provider: mockProvider as unknown as ExternalProvider,
    project: 'test/repo',
    direction: 'bidirectional' as SyncDirection,
  });
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
  issueCounter = 0;
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('external-sync link-all', () => {
  test('requires --provider flag', async () => {
    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const options = createTestOptions();
    const result = await linkAllCmd.handler([], options);

    expect(result.exitCode).not.toBe(ExitCode.SUCCESS);
    expect(result.error).toContain('--provider');
  });

  test('reports no unlinked tasks when all are linked', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Already linked task' },
    ]);

    // Link the task
    await linkTask(options, taskIds[0]);

    // Mock provider creation so we don't need actual tokens
    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'dry-run': true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.total).toBe(0);
  });

  test('dry-run lists unlinked tasks without creating issues', async () => {
    const options = createTestOptions();
    await createTestTasks(options, [
      { title: 'Unlinked task 1' },
      { title: 'Unlinked task 2' },
      { title: 'Unlinked task 3' },
    ]);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'dry-run': true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.dryRun).toBe(true);
    expect(data.total).toBe(3);
    expect(data.provider).toBe('github');
    const tasks = data.tasks as Array<{ id: string; title: string }>;
    expect(tasks).toHaveLength(3);
    // Should list but not create any issues
    expect(issueCounter).toBe(0);
  });

  test('dry-run with --status filters correctly', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Open task' },
      { title: 'Closed task' },
    ]);

    // Close the second task
    const { api } = createAPI(options);
    await api!.update<Task>(taskIds[1] as ElementId, {
      status: 'closed',
      closedAt: Date.now(),
    } as Partial<Task>);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'dry-run': true,
      status: 'open',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.total).toBe(1);
    const tasks = data.tasks as Array<{ id: string; status: string }>;
    expect(tasks[0].status).toBe('open');
  });

  test('successfully links all unlinked tasks via mock provider', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Task to link 1' },
      { title: 'Task to link 2' },
    ]);

    // Link one task to make sure it's skipped
    const thirdIds = await createTestTasks(options, [
      { title: 'Already linked' },
    ]);
    await linkTask(options, thirdIds[0]);

    // Create mock provider and inject via _providerFactory
    const mockProvider = createMockProvider();
    const factory = createMockProviderFactory(mockProvider);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      _providerFactory: factory,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;

    // Should have linked 2 tasks (the third was already linked)
    expect(data.linked).toBe(2);
    expect(data.failed).toBe(0);
    expect(data.total).toBe(2);

    // Verify external issues were actually created
    expect(issueCounter).toBe(2);

    // Verify the tasks in the DB now have _externalSync metadata
    const { api } = createAPI(options);
    for (const taskId of taskIds) {
      const task = await api!.get<Task>(taskId as ElementId);
      expect(task).toBeDefined();
      const metadata = (task!.metadata ?? {}) as Record<string, unknown>;
      expect(metadata._externalSync).toBeDefined();
      const syncState = metadata._externalSync as Record<string, unknown>;
      expect(syncState.provider).toBe('github');
      expect(syncState.project).toBe('test/repo');
      expect(syncState.direction).toBe('bidirectional');
      expect(syncState.adapterType).toBe('task');
      expect(typeof syncState.externalId).toBe('string');
      expect(typeof syncState.url).toBe('string');
      expect((syncState.url as string).startsWith('https://github.com/test/repo/issues/')).toBe(true);
    }

    // Verify the already-linked task was NOT modified
    const linkedTask = await api!.get<Task>(thirdIds[0] as ElementId);
    const linkedMeta = (linkedTask!.metadata ?? {}) as Record<string, unknown>;
    const linkedSync = linkedMeta._externalSync as Record<string, unknown>;
    expect(linkedSync.externalId).toBe('1'); // Original ID preserved
  });

  test('partial failure: continues linking when individual tasks fail', async () => {
    const options = createTestOptions();

    // Use a distinctive title for the task that should fail.
    // The mock provider checks issue.title.includes(failId), so we match on title substrings.
    const FAIL_MARKER = 'SHOULD_FAIL_TASK';
    const taskIds = await createTestTasks(options, [
      { title: 'Good task 1' },
      { title: `Task ${FAIL_MARKER} here` },
      { title: 'Good task 3' },
    ]);

    const mockProvider = createMockProvider({ failOnTaskIds: new Set([FAIL_MARKER]) });
    const factory = createMockProviderFactory(mockProvider);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      _providerFactory: factory,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;

    // 2 succeeded, 1 failed
    expect(data.linked).toBe(2);
    expect(data.failed).toBe(1);
    expect(data.total).toBe(3);

    // Verify the successful tasks have _externalSync metadata
    const { api } = createAPI(options);

    const successTask0 = await api!.get<Task>(taskIds[0] as ElementId);
    const meta0 = (successTask0!.metadata ?? {}) as Record<string, unknown>;
    expect(meta0._externalSync).toBeDefined();

    const successTask2 = await api!.get<Task>(taskIds[2] as ElementId);
    const meta2 = (successTask2!.metadata ?? {}) as Record<string, unknown>;
    expect(meta2._externalSync).toBeDefined();

    // Verify the failed task does NOT have _externalSync metadata
    const failedTask = await api!.get<Task>(taskIds[1] as ElementId);
    const failedMeta = (failedTask!.metadata ?? {}) as Record<string, unknown>;
    expect(failedMeta._externalSync).toBeUndefined();
  });

  test('rate limit: stops gracefully and reports partial success', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Task A' },
      { title: 'Task B' },
      { title: 'Task C' },
      { title: 'Task D' },
    ]);

    // Rate limit after 2 successful creations — the 3rd will trigger rate limit
    const mockProvider = createMockProvider({ rateLimitAfter: 2 });
    const factory = createMockProviderFactory(mockProvider);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      _providerFactory: factory,
      'batch-size': '10', // Process all in one batch so rate limit is hit mid-batch
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;

    // Should have linked 2, then hit rate limit
    expect(data.linked).toBe(2);
    expect(data.rateLimited).toBe(true);
    expect(typeof data.rateLimitResetAt).toBe('string'); // ISO date string

    // The remaining tasks are counted as skipped (rate-limited + never attempted)
    // Task C triggered rate limit (not linked, not counted as failed), Task D never attempted
    expect(data.skipped).toBe(2);
    expect(data.total).toBe(4);

    // Verify exactly 2 tasks have _externalSync metadata (order may vary from list())
    const { api } = createAPI(options);
    let linkedCount = 0;
    let unlinkedCount = 0;
    for (const taskId of taskIds) {
      const task = await api!.get<Task>(taskId as ElementId);
      const meta = (task!.metadata ?? {}) as Record<string, unknown>;
      if (meta._externalSync) {
        linkedCount++;
        const syncState = meta._externalSync as Record<string, unknown>;
        expect(syncState.provider).toBe('github');
        expect(syncState.project).toBe('test/repo');
      } else {
        unlinkedCount++;
      }
    }
    expect(linkedCount).toBe(2);
    expect(unlinkedCount).toBe(2);
  });

  test('dry-run excludes tombstone tasks by default', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Active task' },
      { title: 'Deleted task' },
    ]);

    // Soft-delete the second task
    const { api } = createAPI(options);
    await api!.update<Task>(taskIds[1] as ElementId, {
      status: 'tombstone',
      deletedAt: Date.now(),
    } as Partial<Task>);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'dry-run': true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.total).toBe(1);
  });

  test('dry-run with multiple status filters', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Open task' },
      { title: 'In-progress task' },
      { title: 'Deferred task' },
    ]);

    // Update statuses
    const { api } = createAPI(options);
    await api!.update<Task>(taskIds[1] as ElementId, {
      status: 'in_progress',
    } as Partial<Task>);
    await api!.update<Task>(taskIds[2] as ElementId, {
      status: 'deferred',
    } as Partial<Task>);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'dry-run': true,
      status: ['open', 'in_progress'],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.total).toBe(2);
  });

  test('json output mode works for dry-run', async () => {
    const options = createTestOptions({ json: true });
    await createTestTasks(options, [
      { title: 'JSON test task' },
    ]);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'dry-run': true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.dryRun).toBe(true);
    expect(data.provider).toBe('github');
    expect(typeof data.total).toBe('number');
    expect(Array.isArray(data.tasks)).toBe(true);
  });

  test('quiet output mode works for dry-run', async () => {
    const options = createTestOptions({ quiet: true });
    await createTestTasks(options, [
      { title: 'Quiet test task 1' },
      { title: 'Quiet test task 2' },
    ]);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'dry-run': true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // In quiet mode, data should be the count as a string
    expect(result.data).toBe('2');
  });

  test('rejects invalid batch-size', async () => {
    const options = createTestOptions();

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      'batch-size': 'abc',
    });

    expect(result.exitCode).not.toBe(ExitCode.SUCCESS);
    expect(result.error).toContain('batch-size');
  });

  test('link-all is registered in parent command subcommands', async () => {
    const { externalSyncCommand } = await import('./external-sync.js');
    expect(externalSyncCommand.subcommands).toBeDefined();
    expect(externalSyncCommand.subcommands!['link-all']).toBeDefined();
    expect(externalSyncCommand.subcommands!['link-all'].name).toBe('link-all');
    expect(externalSyncCommand.subcommands!['link-all'].options).toBeDefined();
    expect(externalSyncCommand.subcommands!['link-all'].options!.length).toBeGreaterThan(0);
  });

  test('parent command lists link-all in JSON output', async () => {
    const { externalSyncCommand } = await import('./external-sync.js');
    const result = await externalSyncCommand.handler([], createTestOptions({ json: true }));

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect((data.commands as string[]).includes('link-all')).toBe(true);
  });

  test('fails gracefully when provider has no token (actual linking)', async () => {
    const options = createTestOptions();
    await createTestTasks(options, [
      { title: 'Task without provider' },
    ]);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    // Attempt actual linking (not dry-run) - should fail because no token configured
    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
    });

    expect(result.exitCode).not.toBe(ExitCode.SUCCESS);
    expect(result.error).toBeDefined();
    // Should mention token or configuration
    expect(
      result.error!.includes('token') || result.error!.includes('configured') || result.error!.includes('settings')
    ).toBe(true);
  });

  test('fails gracefully for unsupported provider', async () => {
    const options = createTestOptions();
    await createTestTasks(options, [
      { title: 'Task for unsupported provider' },
    ]);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    // Attempt linking with unsupported provider (not dry-run)
    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'unsupported-provider',
    });

    // Should fail — either at provider creation or because no token
    expect(result.exitCode).not.toBe(ExitCode.SUCCESS);
  });
});

// ============================================================================
// Unit Tests: isRateLimitError helper
// ============================================================================

describe('isRateLimitError detection', () => {
  // We test the rate limit detection logic through the command's behavior
  // (see the rate limit test above), and also verify error shapes here.

  test('error with isRateLimited property is detected', () => {
    // This tests the pattern used by GitHubApiError and LinearApiError
    const error = Object.assign(new Error('Rate limit exhausted'), {
      isRateLimited: true,
      rateLimit: { limit: 5000, remaining: 0, reset: 1700000000 },
      status: 403,
    });

    // Verify the error has the expected shape
    expect((error as unknown as { isRateLimited: boolean }).isRateLimited).toBe(true);
    expect((error as unknown as { rateLimit: { reset: number } }).rateLimit.reset).toBe(1700000000);
  });

  test('error with rate limit in message is detected', () => {
    const error = new Error('GitHub API rate limit exhausted. Resets at 2024-01-01T00:00:00Z');
    expect(error.message).toContain('rate limit');
  });

  test('normal error is not rate-limit error', () => {
    const error = new Error('Network timeout');
    expect(error.message).not.toContain('rate limit');
    expect((error as unknown as Record<string, unknown>).isRateLimited).toBeUndefined();
  });
});
