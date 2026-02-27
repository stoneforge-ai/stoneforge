import { describe, expect, test, beforeEach, mock, spyOn } from 'bun:test';
import type {
  Task,
  ExternalProvider,
  ExternalTask,
  ExternalTaskInput,
  TaskSyncAdapter,
  SyncAdapterType,
  ProviderConfig,
  TaskFieldMapConfig,
  ExternalSyncState,
  ElementId,
  Document,
  DocumentId,
} from '@stoneforge/core';
import type { Timestamp } from '@stoneforge/core';
import { autoLinkTask } from './auto-link.js';
import type { AutoLinkTaskParams } from './auto-link.js';
import type { QuarryAPI } from '../api/types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'el-test1' as unknown as string,
    type: 'task',
    createdAt: Date.now() as Timestamp,
    updatedAt: Date.now() as Timestamp,
    createdBy: 'el-0000' as unknown as string,
    title: 'Test task',
    status: 'open',
    priority: 3,
    complexity: 3,
    taskType: 'task',
    tags: ['tag1', 'tag2'],
    metadata: {},
    ...overrides,
  } as unknown as Task;
}

function createMockExternalTask(overrides?: Partial<ExternalTask>): ExternalTask {
  return {
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    provider: 'github',
    project: 'owner/repo',
    title: 'Test task',
    state: 'open',
    labels: [],
    assignees: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockTaskAdapter(overrides?: Partial<TaskSyncAdapter>): TaskSyncAdapter {
  return {
    getIssue: mock(async () => null),
    listIssuesSince: mock(async () => []),
    createIssue: mock(async (_project: string, _issue: ExternalTaskInput) => createMockExternalTask()),
    updateIssue: mock(async () => createMockExternalTask()),
    getFieldMapConfig: () => ({ provider: 'mock', fields: [] }),
    ...overrides,
  };
}

function createMockProvider(
  name: string = 'github',
  adapter?: TaskSyncAdapter
): ExternalProvider {
  const taskAdapter = adapter ?? createMockTaskAdapter();
  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    supportedAdapters: ['task'] as readonly SyncAdapterType[],
    testConnection: mock(async () => true),
    getTaskAdapter: () => taskAdapter,
  };
}

function createMockApi(overrides?: Partial<QuarryAPI>): QuarryAPI {
  return {
    get: mock(async () => null),
    list: mock(async () => []),
    listPaginated: mock(async () => ({ items: [], total: 0, offset: 0, limit: 100 })),
    create: mock(async (data: Record<string, unknown>) => data),
    update: mock(async () => ({})),
    delete: mock(async () => {}),
    ...overrides,
  } as unknown as QuarryAPI;
}

// ============================================================================
// Tests
// ============================================================================

describe('autoLinkTask', () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Suppress console output during tests
    consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(console, 'info').mockImplementation(() => {});
  });

  describe('success cases', () => {
    test('creates external issue and updates task with sync metadata', async () => {
      const task = createMockTask();
      const externalTask = createMockExternalTask();
      const adapter = createMockTaskAdapter({
        createIssue: mock(async () => externalTask),
      });
      const provider = createMockProvider('github', adapter);
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.syncState).toBeDefined();
      expect(result.syncState!.provider).toBe('github');
      expect(result.syncState!.project).toBe('owner/repo');
      expect(result.syncState!.externalId).toBe('42');
      expect(result.syncState!.url).toBe('https://github.com/owner/repo/issues/42');
      expect(result.syncState!.direction).toBe('bidirectional');
      expect(result.syncState!.adapterType).toBe('task');

      // Verify createIssue was called with correct args (full field mapping)
      expect(adapter.createIssue).toHaveBeenCalledTimes(1);
      const [callProject, callInput] = (adapter.createIssue as ReturnType<typeof mock>).mock.calls[0] as [string, ExternalTaskInput];
      expect(callProject).toBe('owner/repo');
      expect(callInput.title).toBe('Test task');
      // Labels should include priority, type, status, and user tags
      expect(callInput.labels).toEqual([
        'sf:priority:medium',  // priority 3
        'sf:type:task',        // taskType 'task'
        'sf:status:open',      // status 'open'
        'tag1',
        'tag2',
      ]);
      expect(callInput.state).toBe('open');
      expect(callInput.priority).toBe(3);

      // Verify api.update was called to set externalRef and _externalSync
      expect(api.update).toHaveBeenCalledTimes(1);
      const updateArgs = (api.update as ReturnType<typeof mock>).mock.calls[0] as [ElementId, Partial<Task>];
      expect(updateArgs[1]).toMatchObject({
        externalRef: 'https://github.com/owner/repo/issues/42',
        metadata: {
          _externalSync: {
            provider: 'github',
            project: 'owner/repo',
            externalId: '42',
            url: 'https://github.com/owner/repo/issues/42',
            direction: 'bidirectional',
            adapterType: 'task',
          },
        },
      });
    });

    test('passes push direction to sync state', async () => {
      const task = createMockTask();
      const provider = createMockProvider();
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'push',
      });

      expect(result.success).toBe(true);
      expect(result.syncState!.direction).toBe('push');
    });

    test('preserves existing metadata when updating task', async () => {
      const task = createMockTask({
        metadata: { existingKey: 'existingValue', description: 'My description' },
      });
      const provider = createMockProvider();
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(true);
      const updateArgs = (api.update as ReturnType<typeof mock>).mock.calls[0] as [ElementId, Partial<Task>];
      const metadata = updateArgs[1].metadata as Record<string, unknown>;
      expect(metadata.existingKey).toBe('existingValue');
      expect(metadata.description).toBe('My description');
      expect(metadata._externalSync).toBeDefined();
    });

    test('handles task with no tags (falls back to simplified input)', async () => {
      const task = createMockTask({ tags: undefined });
      const adapter = createMockTaskAdapter();
      const provider = createMockProvider('github', adapter);
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      // Should still succeed via fallback (buildExternalLabels can't iterate undefined tags)
      expect(result.success).toBe(true);
      const [, callInput] = (adapter.createIssue as ReturnType<typeof mock>).mock.calls[0] as [string, ExternalTaskInput];
      // Fallback simplified input: labels come from task.tags which is undefined
      expect(callInput.labels).toBeUndefined();
    });

    test('auto-linked issue has priority, type, and status labels', async () => {
      const task = createMockTask({
        priority: 1,
        taskType: 'bug' as Task['taskType'],
        status: 'in_progress' as Task['status'],
        tags: ['user-label'],
      });
      const adapter = createMockTaskAdapter();
      const provider = createMockProvider('github', adapter);
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(true);
      const [, callInput] = (adapter.createIssue as ReturnType<typeof mock>).mock.calls[0] as [string, ExternalTaskInput];
      expect(callInput.labels).toContain('sf:priority:critical');
      expect(callInput.labels).toContain('sf:type:bug');
      expect(callInput.labels).toContain('sf:status:in-progress');
      expect(callInput.labels).toContain('user-label');
    });

    test('auto-linked issue has the real description (not a stub)', async () => {
      const descRef = 'el-desc1' as unknown as DocumentId;
      const task = createMockTask({
        descriptionRef: descRef,
      });
      const adapter = createMockTaskAdapter();
      const provider = createMockProvider('github', adapter);
      // Mock api.get to return a document with real content
      const api = createMockApi({
        get: mock(async (id: ElementId) => {
          if ((id as unknown as string) === 'el-desc1') {
            return {
              id: 'el-desc1',
              type: 'document',
              content: 'This is the real task description with **markdown**.',
              contentType: 'markdown',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              createdBy: 'el-0000',
            } as unknown as Document;
          }
          return null;
        }),
      });

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(true);
      const [, callInput] = (adapter.createIssue as ReturnType<typeof mock>).mock.calls[0] as [string, ExternalTaskInput];
      // Body should contain the real document content, not a stub
      expect(callInput.body).toBe('This is the real task description with **markdown**.');
      expect(callInput.body).not.toContain('Stoneforge task:');
    });
  });

  describe('failure cases', () => {
    test('returns failure when provider has no task adapter', async () => {
      const task = createMockTask();
      const provider: ExternalProvider = {
        name: 'noadapter',
        displayName: 'NoAdapter',
        supportedAdapters: [],
        testConnection: async () => false,
        // No getTaskAdapter method
      };
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'some/project',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support task sync');
      expect(result.syncState).toBeUndefined();
      // api.update should not have been called
      expect(api.update).not.toHaveBeenCalled();
    });

    test('returns failure when createIssue throws', async () => {
      const task = createMockTask();
      const adapter = createMockTaskAdapter({
        createIssue: mock(async () => {
          throw new Error('API rate limit exceeded');
        }),
      });
      const provider = createMockProvider('github', adapter);
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limit exceeded');
      expect(result.syncState).toBeUndefined();
      // api.update should not have been called
      expect(api.update).not.toHaveBeenCalled();
    });

    test('returns failure when api.update throws', async () => {
      const task = createMockTask();
      const provider = createMockProvider();
      const api = createMockApi({
        update: mock(async () => {
          throw new Error('Database write failed');
        }),
      });

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database write failed');
      expect(result.syncState).toBeUndefined();
    });

    test('never throws even with unexpected errors', async () => {
      const task = createMockTask();
      const adapter = createMockTaskAdapter({
        createIssue: mock(async () => {
          throw 'string error'; // Non-Error thrown
        }),
      });
      const provider = createMockProvider('github', adapter);
      const api = createMockApi();

      // Should not throw
      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    test('logs warning on failure', async () => {
      const task = createMockTask();
      const adapter = createMockTaskAdapter({
        createIssue: mock(async () => {
          throw new Error('Network timeout');
        }),
      });
      const provider = createMockProvider('github', adapter);
      const api = createMockApi();

      // Track calls made from this point
      const callCountBefore = consoleSpy.mock.calls.length;

      await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      // Find the warn call that was made during this test
      const newCalls = consoleSpy.mock.calls.slice(callCountBefore);
      expect(newCalls.length).toBeGreaterThan(0);
      const warnCall = newCalls[0]?.[0] as string;
      expect(warnCall).toContain('Auto-link failed');
      expect(warnCall).toContain('Network timeout');
    });
  });

  describe('fallback cases', () => {
    test('auto-link still succeeds if description hydration fails', async () => {
      const descRef = 'el-bad-desc' as unknown as DocumentId;
      const task = createMockTask({
        descriptionRef: descRef,
      });
      const adapter = createMockTaskAdapter();
      const provider = createMockProvider('github', adapter);
      // Mock api.get to throw when fetching the description
      const api = createMockApi({
        get: mock(async () => {
          throw new Error('Storage unavailable');
        }),
      });

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      // Should still succeed — the fallback simplified input is used
      expect(result.success).toBe(true);
      const [, callInput] = (adapter.createIssue as ReturnType<typeof mock>).mock.calls[0] as [string, ExternalTaskInput];
      // Fallback uses stub body
      expect(callInput.body).toBe(`Stoneforge task: ${task.id}`);
      expect(callInput.title).toBe('Test task');
    });

    test('fallback uses simplified input when taskToExternalTask throws', async () => {
      const task = createMockTask({
        tags: ['my-tag'],
        descriptionRef: 'el-desc99' as unknown as DocumentId,
      });
      const adapter = createMockTaskAdapter();
      const provider = createMockProvider('github', adapter);
      // Make api.get throw to trigger taskToExternalTask failure
      const api = createMockApi({
        get: mock(async () => {
          throw new Error('Unexpected error');
        }),
      });

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(true);
      const [, callInput] = (adapter.createIssue as ReturnType<typeof mock>).mock.calls[0] as [string, ExternalTaskInput];
      // Fallback: simplified labels (just user tags, no sf: labels)
      expect(callInput.labels).toEqual(['my-tag']);
      // Fallback: stub body
      expect(callInput.body).toBe(`Stoneforge task: ${task.id}`);
    });
  });

  describe('missing config cases', () => {
    test('returns failure when provider getTaskAdapter returns undefined', async () => {
      const task = createMockTask();
      const provider: ExternalProvider = {
        name: 'broken',
        displayName: 'Broken',
        supportedAdapters: ['task'],
        testConnection: async () => false,
        getTaskAdapter: () => undefined as unknown as TaskSyncAdapter,
      };
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'some/project',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support task sync');
    });

    test('handles task with null metadata gracefully', async () => {
      const task = createMockTask({ metadata: null as unknown as Record<string, unknown> });
      const provider = createMockProvider();
      const api = createMockApi();

      const result = await autoLinkTask({
        task,
        api,
        provider,
        project: 'owner/repo',
        direction: 'bidirectional',
      });

      expect(result.success).toBe(true);
      // Should use empty object instead of null
      const updateArgs = (api.update as ReturnType<typeof mock>).mock.calls[0] as [ElementId, Partial<Task>];
      const metadata = updateArgs[1].metadata as Record<string, unknown>;
      expect(metadata._externalSync).toBeDefined();
    });
  });
});
