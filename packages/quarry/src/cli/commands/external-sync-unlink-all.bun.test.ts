/**
 * External Sync Unlink-All Command Tests
 *
 * Tests the `sf external-sync unlink-all` command:
 * - Removes sync state from all linked elements
 * - --provider filter only unlinks elements linked to that provider
 * - --type filter only unlinks elements of that type
 * - --dry-run shows count without modifying
 * - After unlink-all + link-all + push, files are re-created (integration test)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createAPI } from '../db.js';
import type { Task, Document, Element, ElementId, ExternalProvider, ExternalTaskInput, SyncDirection } from '@stoneforge/core';
import { createDocument } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_unlink_all_workspace__');
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
  tasks: Array<{ title: string; status?: string }>
): Promise<string[]> {
  const { createCommand } = await import('./crud.js');
  const ids: string[] = [];

  for (const taskDef of tasks) {
    const opts = {
      ...options,
      title: taskDef.title,
      status: taskDef.status,
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
 * Creates documents in the database for testing.
 */
async function createTestDocuments(
  options: GlobalOptions,
  docs: Array<{ title: string; category?: string }>
): Promise<string[]> {
  const { api } = createAPI(options);
  const ids: string[] = [];

  for (const docDef of docs) {
    const newDoc = await createDocument({
      title: docDef.title,
      category: docDef.category ?? 'reference',
      contentType: 'markdown',
      content: `Content for ${docDef.title}`,
      createdBy: 'test-user',
    });
    const created = await api!.create(newDoc as unknown as Element & Record<string, unknown>);
    ids.push(created.id);
  }

  return ids;
}

/**
 * Helper to mark a task as linked to a specific provider.
 */
async function linkTaskToProvider(
  options: GlobalOptions,
  taskId: string,
  provider: string,
  project?: string
): Promise<void> {
  const { api } = createAPI(options);
  const task = await api!.get<Task>(taskId as ElementId);
  if (task) {
    const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>;
    const proj = project ?? `${provider}-org/${provider}-repo`;
    await api!.update<Task>(taskId as ElementId, {
      externalRef: `https://${provider}.example.com/${proj}/issues/1`,
      metadata: {
        ...existingMetadata,
        _externalSync: {
          provider,
          project: proj,
          externalId: '1',
          url: `https://${provider}.example.com/${proj}/issues/1`,
          direction: 'bidirectional',
          adapterType: 'task',
        },
      },
    } as Partial<Task>);
  }
}

/**
 * Helper to mark a document as linked to a specific provider.
 */
async function linkDocToProvider(
  options: GlobalOptions,
  docId: string,
  provider: string,
  project?: string
): Promise<void> {
  const { api } = createAPI(options);
  const doc = await api!.get<Document>(docId as ElementId);
  if (doc) {
    const existingMetadata = (doc.metadata ?? {}) as Record<string, unknown>;
    const proj = project ?? `${provider}-workspace`;
    await api!.update<Document>(docId as ElementId, {
      externalRef: `https://${provider}.example.com/${proj}/page/1`,
      metadata: {
        ...existingMetadata,
        _externalSync: {
          provider,
          project: proj,
          externalId: 'page-1',
          url: `https://${provider}.example.com/${proj}/page/1`,
          direction: 'bidirectional',
          adapterType: 'document',
        },
      },
    } as Partial<Document>);
  }
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('external-sync unlink-all', () => {
  test('removes sync state from all linked elements', async () => {
    const options = createTestOptions();

    // Create and link tasks
    const taskIds = await createTestTasks(options, [
      { title: 'Task 1' },
      { title: 'Task 2' },
      { title: 'Task 3' },
    ]);
    for (const id of taskIds) {
      await linkTaskToProvider(options, id, 'github');
    }

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    const result = await unlinkAllCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(3);
    expect(data.failed).toBe(0);
    expect(data.total).toBe(3);

    // Verify all tasks are unlinked
    const { api } = createAPI(options);
    for (const taskId of taskIds) {
      const task = await api!.get<Task>(taskId as ElementId);
      expect(task).toBeDefined();
      const metadata = (task!.metadata ?? {}) as Record<string, unknown>;
      expect(metadata._externalSync).toBeUndefined();
      expect(task!.externalRef).toBeUndefined();
    }
  });

  test('--provider filter only unlinks elements linked to that provider', async () => {
    const options = createTestOptions();

    // Create tasks linked to different providers
    const taskIds = await createTestTasks(options, [
      { title: 'GitHub Task' },
      { title: 'Linear Task' },
      { title: 'Another GitHub Task' },
    ]);
    await linkTaskToProvider(options, taskIds[0], 'github');
    await linkTaskToProvider(options, taskIds[1], 'linear');
    await linkTaskToProvider(options, taskIds[2], 'github');

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    // Only unlink GitHub-linked elements
    const result = await unlinkAllCmd.handler([], {
      ...options,
      provider: 'github',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(2);
    expect(data.total).toBe(2);
    expect(data.provider).toBe('github');

    // Verify GitHub tasks are unlinked
    const { api } = createAPI(options);
    const task0 = await api!.get<Task>(taskIds[0] as ElementId);
    const metadata0 = (task0!.metadata ?? {}) as Record<string, unknown>;
    expect(metadata0._externalSync).toBeUndefined();

    const task2 = await api!.get<Task>(taskIds[2] as ElementId);
    const metadata2 = (task2!.metadata ?? {}) as Record<string, unknown>;
    expect(metadata2._externalSync).toBeUndefined();

    // Verify Linear task is still linked
    const task1 = await api!.get<Task>(taskIds[1] as ElementId);
    const metadata1 = (task1!.metadata ?? {}) as Record<string, unknown>;
    expect(metadata1._externalSync).toBeDefined();
    const syncState = metadata1._externalSync as Record<string, unknown>;
    expect(syncState.provider).toBe('linear');
  });

  test('--type document only unlinks documents', async () => {
    const options = createTestOptions();

    // Create tasks and documents
    const taskIds = await createTestTasks(options, [
      { title: 'Some Task' },
    ]);
    await linkTaskToProvider(options, taskIds[0], 'github');

    const docIds = await createTestDocuments(options, [
      { title: 'Some Doc' },
    ]);
    await linkDocToProvider(options, docIds[0], 'notion');

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    // Only unlink documents
    const result = await unlinkAllCmd.handler([], {
      ...options,
      type: 'document',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(1);
    expect(data.total).toBe(1);
    expect(data.type).toBe('document');

    // Verify document is unlinked
    const { api } = createAPI(options);
    const doc = await api!.get<Document>(docIds[0] as ElementId);
    const docMetadata = (doc!.metadata ?? {}) as Record<string, unknown>;
    expect(docMetadata._externalSync).toBeUndefined();

    // Verify task is still linked
    const task = await api!.get<Task>(taskIds[0] as ElementId);
    const taskMetadata = (task!.metadata ?? {}) as Record<string, unknown>;
    expect(taskMetadata._externalSync).toBeDefined();
  });

  test('--type task only unlinks tasks', async () => {
    const options = createTestOptions();

    // Create tasks and documents
    const taskIds = await createTestTasks(options, [
      { title: 'Task A' },
    ]);
    await linkTaskToProvider(options, taskIds[0], 'github');

    const docIds = await createTestDocuments(options, [
      { title: 'Doc A' },
    ]);
    await linkDocToProvider(options, docIds[0], 'notion');

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    // Only unlink tasks
    const result = await unlinkAllCmd.handler([], {
      ...options,
      type: 'task',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(1);
    expect(data.total).toBe(1);
    expect(data.type).toBe('task');

    // Verify task is unlinked
    const { api } = createAPI(options);
    const task = await api!.get<Task>(taskIds[0] as ElementId);
    const taskMetadata = (task!.metadata ?? {}) as Record<string, unknown>;
    expect(taskMetadata._externalSync).toBeUndefined();

    // Verify document is still linked
    const doc = await api!.get<Document>(docIds[0] as ElementId);
    const docMetadata = (doc!.metadata ?? {}) as Record<string, unknown>;
    expect(docMetadata._externalSync).toBeDefined();
  });

  test('--dry-run shows count without modifying', async () => {
    const options = createTestOptions();

    // Create and link tasks
    const taskIds = await createTestTasks(options, [
      { title: 'Dry run task 1' },
      { title: 'Dry run task 2' },
    ]);
    for (const id of taskIds) {
      await linkTaskToProvider(options, id, 'github');
    }

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    const result = await unlinkAllCmd.handler([], {
      ...options,
      'dry-run': true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.dryRun).toBe(true);
    expect(data.total).toBe(2);
    const elements = data.elements as Array<Record<string, unknown>>;
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe('task');
    expect(elements[0].provider).toBe('github');

    // Verify elements are still linked (dry run should not modify)
    const { api } = createAPI(options);
    for (const taskId of taskIds) {
      const task = await api!.get<Task>(taskId as ElementId);
      const metadata = (task!.metadata ?? {}) as Record<string, unknown>;
      expect(metadata._externalSync).toBeDefined();
    }
  });

  test('reports no linked elements when none exist', async () => {
    const options = createTestOptions();

    // Create unlinked tasks
    await createTestTasks(options, [
      { title: 'Unlinked task 1' },
    ]);

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    const result = await unlinkAllCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(0);
    expect(data.total).toBe(0);
  });

  test('rejects invalid --type value', async () => {
    const options = createTestOptions();

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    const result = await unlinkAllCmd.handler([], {
      ...options,
      type: 'invalid',
    });

    expect(result.exitCode).not.toBe(ExitCode.SUCCESS);
    expect(result.error).toContain('Invalid --type');
  });

  test('--provider with --type filters both dimensions', async () => {
    const options = createTestOptions();

    // Create tasks and documents linked to different providers
    const taskIds = await createTestTasks(options, [
      { title: 'GH Task' },
      { title: 'Linear Task' },
    ]);
    await linkTaskToProvider(options, taskIds[0], 'github');
    await linkTaskToProvider(options, taskIds[1], 'linear');

    const docIds = await createTestDocuments(options, [
      { title: 'GH Doc' },
      { title: 'Notion Doc' },
    ]);
    await linkDocToProvider(options, docIds[0], 'github');
    await linkDocToProvider(options, docIds[1], 'notion');

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    // Only unlink GitHub tasks (not GitHub docs, not other providers)
    const result = await unlinkAllCmd.handler([], {
      ...options,
      provider: 'github',
      type: 'task',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(1);
    expect(data.total).toBe(1);
    expect(data.provider).toBe('github');
    expect(data.type).toBe('task');

    // Verify only the GitHub task is unlinked
    const { api } = createAPI(options);
    const ghTask = await api!.get<Task>(taskIds[0] as ElementId);
    expect((ghTask!.metadata as Record<string, unknown>)?._externalSync).toBeUndefined();

    // Linear task still linked
    const lTask = await api!.get<Task>(taskIds[1] as ElementId);
    expect((lTask!.metadata as Record<string, unknown>)?._externalSync).toBeDefined();

    // GitHub doc still linked
    const ghDoc = await api!.get<Document>(docIds[0] as ElementId);
    expect((ghDoc!.metadata as Record<string, unknown>)?._externalSync).toBeDefined();

    // Notion doc still linked
    const nDoc = await api!.get<Document>(docIds[1] as ElementId);
    expect((nDoc!.metadata as Record<string, unknown>)?._externalSync).toBeDefined();
  });

  test('json output mode returns structured data', async () => {
    const options = createTestOptions();

    const taskIds = await createTestTasks(options, [
      { title: 'JSON test task' },
    ]);
    await linkTaskToProvider(options, taskIds[0], 'github');

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    const result = await unlinkAllCmd.handler([], {
      ...options,
      json: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(1);
    expect(data.failed).toBe(0);
    expect(data.total).toBe(1);
  });

  test('unlinks mixed tasks and documents together', async () => {
    const options = createTestOptions();

    // Create and link tasks
    const taskIds = await createTestTasks(options, [
      { title: 'Mixed Task 1' },
    ]);
    await linkTaskToProvider(options, taskIds[0], 'github');

    // Create and link documents
    const docIds = await createTestDocuments(options, [
      { title: 'Mixed Doc 1' },
    ]);
    await linkDocToProvider(options, docIds[0], 'notion');

    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];

    // Unlink all types
    const result = await unlinkAllCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.unlinked).toBe(2);
    expect(data.total).toBe(2);

    // Verify both are unlinked
    const { api } = createAPI(options);
    const task = await api!.get<Task>(taskIds[0] as ElementId);
    expect((task!.metadata as Record<string, unknown>)?._externalSync).toBeUndefined();

    const doc = await api!.get<Document>(docIds[0] as ElementId);
    expect((doc!.metadata as Record<string, unknown>)?._externalSync).toBeUndefined();
  });
});

// ============================================================================
// link-all --force same-provider tests (additional coverage)
// ============================================================================

describe('external-sync link-all --force same provider', () => {
  let issueCounter = 0;
  let createdIssues: Array<{ title: string }> = [];

  function createMockProvider(opts?: { providerName?: string }) {
    const name = opts?.providerName ?? 'github';

    return {
      name,
      displayName: name === 'linear' ? 'Linear' : 'GitHub',
      supportedAdapters: ['task' as const],
      testConnection: async () => true,
      getTaskAdapter: () => ({
        getIssue: async () => null,
        listIssuesSince: async () => [],
        createIssue: async (_project: string, issue: ExternalTaskInput) => {
          issueCounter++;
          createdIssues.push({ title: issue.title });
          return {
            externalId: String(issueCounter),
            url: `https://github.com/test/repo/issues/${issueCounter}`,
            provider: name,
            project: 'test/repo',
            title: issue.title,
            body: issue.body,
            state: 'open' as const,
            labels: [...(issue.labels ?? [])],
            assignees: [...(issue.assignees ?? [])],
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

  beforeEach(() => {
    issueCounter = 0;
    createdIssues = [];
  });

  test('link-all --force re-links tasks already linked to the same provider', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Same Provider Task 1' },
      { title: 'Same Provider Task 2' },
    ]);

    // Link both to github
    for (const id of taskIds) {
      await linkTaskToProvider(options, id, 'github');
    }

    const mockProvider = createMockProvider();
    const factory = createMockProviderFactory(mockProvider);

    const { externalSyncCommand } = await import('./external-sync.js');
    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];

    // Force re-link to the SAME provider
    const result = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      force: true,
      _providerFactory: factory,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;

    // Should have re-linked both tasks
    expect(data.linked).toBe(2);
    expect(data.total).toBe(2);
    expect(data.force).toBe(true);
    expect(data.relinkCount).toBe(2);

    // Issues should have been created (re-linked)
    expect(issueCounter).toBe(2);
  });

  test('after unlink-all + link-all + check, elements are re-linked', async () => {
    const options = createTestOptions();
    const taskIds = await createTestTasks(options, [
      { title: 'Roundtrip Task 1' },
      { title: 'Roundtrip Task 2' },
    ]);

    // Link both to github
    for (const id of taskIds) {
      await linkTaskToProvider(options, id, 'github');
    }

    // Verify they're linked
    const { api } = createAPI(options);
    for (const id of taskIds) {
      const task = await api!.get<Task>(id as ElementId);
      expect((task!.metadata as Record<string, unknown>)?._externalSync).toBeDefined();
    }

    // unlink-all
    const { externalSyncCommand } = await import('./external-sync.js');
    const unlinkAllCmd = externalSyncCommand.subcommands!['unlink-all'];
    const unlinkResult = await unlinkAllCmd.handler([], options);
    expect(unlinkResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((unlinkResult.data as Record<string, unknown>).unlinked).toBe(2);

    // Verify they're unlinked
    for (const id of taskIds) {
      const task = await api!.get<Task>(id as ElementId);
      expect((task!.metadata as Record<string, unknown>)?._externalSync).toBeUndefined();
    }

    // link-all again
    const mockProvider = createMockProvider();
    const factory = createMockProviderFactory(mockProvider);

    const linkAllCmd = externalSyncCommand.subcommands!['link-all'];
    const linkResult = await linkAllCmd.handler([], {
      ...options,
      provider: 'github',
      _providerFactory: factory,
    });

    expect(linkResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((linkResult.data as Record<string, unknown>).linked).toBe(2);

    // Verify they're re-linked
    for (const id of taskIds) {
      const task = await api!.get<Task>(id as ElementId);
      const metadata = (task!.metadata ?? {}) as Record<string, unknown>;
      expect(metadata._externalSync).toBeDefined();
      const syncState = metadata._externalSync as Record<string, unknown>;
      expect(syncState.provider).toBe('github');
    }
  });
});
