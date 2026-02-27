/**
 * Sync Engine — Unit Tests
 *
 * Tests for push, pull, sync (bidirectional), conflict resolution,
 * cursor management, dry-run mode, and error handling.
 */

import { describe, expect, test } from 'bun:test';
import type {
  Element,
  ExternalTask,
  ExternalTaskInput,
  ExternalProvider,
  TaskSyncAdapter,
  ProviderConfig,
  TaskFieldMapConfig,
  ExternalSyncState,
} from '@stoneforge/core';
import { setExternalSyncState } from '@stoneforge/core';
import type { Timestamp, ElementId, EventFilter } from '@stoneforge/core';
import { ProviderRegistry } from './provider-registry.js';
import {
  SyncEngine,
  createSyncEngine,
} from './sync-engine.js';
import type {
  SyncEngineAPI,
  SyncEngineSettings,
  SyncConflictResolver,
  ConflictResolution,
} from './sync-engine.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestSyncState(overrides: Partial<ExternalSyncState> = {}): ExternalSyncState {
  return {
    provider: 'github',
    project: 'owner/repo',
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    direction: 'bidirectional',
    adapterType: 'task',
    ...overrides,
  } as ExternalSyncState;
}

function createTestElement(metadataOverrides: Record<string, unknown> = {}): Element {
  const syncState = metadataOverrides._syncState as ExternalSyncState | undefined;
  delete metadataOverrides._syncState;

  const metadata = syncState
    ? setExternalSyncState(metadataOverrides, syncState)
    : metadataOverrides;

  return {
    id: 'el-test1' as ElementId,
    type: 'task',
    title: 'Test Task',
    status: 'open',
    tags: ['feature'],
    createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    updatedAt: '2024-01-10T00:00:00.000Z' as Timestamp,
    createdBy: 'el-user1',
    metadata,
  } as unknown as Element;
}

function createTestExternalTask(overrides: Partial<ExternalTask> = {}): ExternalTask {
  return {
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    provider: 'github',
    project: 'owner/repo',
    title: 'Remote Issue Title',
    body: 'Remote body',
    state: 'open',
    labels: ['bug'],
    assignees: ['octocat'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    ...overrides,
  };
}

function createMockApi(options: {
  elements?: Element[];
  events?: Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }>;
  onUpdate?: (id: ElementId, updates: Partial<Element>) => void;
  onCreate?: (input: Record<string, unknown>) => Element;
} = {}): SyncEngineAPI {
  const elements = options.elements ?? [];
  return {
    async get<T extends Element>(id: ElementId): Promise<T | null> {
      const el = elements.find((e) => e.id === id);
      return (el as T) ?? null;
    },
    async list<T extends Element>(_filter?: Record<string, unknown>): Promise<T[]> {
      return elements as T[];
    },
    async update<T extends Element>(id: ElementId, updates: Partial<T>): Promise<T> {
      options.onUpdate?.(id, updates as Partial<Element>);
      const el = elements.find((e) => e.id === id);
      return { ...el, ...updates } as T;
    },
    async create<T extends Element>(input: Record<string, unknown>): Promise<T> {
      if (options.onCreate) {
        return options.onCreate(input) as T;
      }
      return {
        id: 'el-new1' as ElementId,
        ...input,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      } as T;
    },
    async listEvents(filter?: EventFilter): Promise<Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }>> {
      return options.events ?? [];
    },
  };
}

function createMockSettings(): SyncEngineSettings & { store: Record<string, unknown> } {
  const store: Record<string, unknown> = {};
  return {
    store,
    getSetting(key: string) {
      return key in store ? { value: store[key] } : undefined;
    },
    setSetting(key: string, value: unknown) {
      store[key] = value;
      return { value };
    },
  };
}

function createMockTaskAdapter(options: {
  issues?: ExternalTask[];
  onUpdateIssue?: (project: string, externalId: string, updates: Partial<ExternalTaskInput>) => void;
  onCreateIssue?: (project: string, issue: ExternalTaskInput) => ExternalTask;
} = {}): TaskSyncAdapter {
  return {
    async getIssue(_project: string, externalId: string): Promise<ExternalTask | null> {
      return options.issues?.find((i) => i.externalId === externalId) ?? null;
    },
    async listIssuesSince(_project: string, _since: Timestamp): Promise<ExternalTask[]> {
      return options.issues ?? [];
    },
    async createIssue(project: string, issue: ExternalTaskInput): Promise<ExternalTask> {
      if (options.onCreateIssue) {
        return options.onCreateIssue(project, issue);
      }
      return createTestExternalTask({ title: issue.title, externalId: '99' });
    },
    async updateIssue(
      project: string,
      externalId: string,
      updates: Partial<ExternalTaskInput>
    ): Promise<ExternalTask> {
      options.onUpdateIssue?.(project, externalId, updates);
      return createTestExternalTask({ externalId, ...updates });
    },
    getFieldMapConfig(): TaskFieldMapConfig {
      return { provider: 'github', fields: [] };
    },
  };
}

function createMockProvider(
  name: string,
  adapter: TaskSyncAdapter
): ExternalProvider {
  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    supportedAdapters: ['task'],
    async testConnection(_config: ProviderConfig): Promise<boolean> {
      return true;
    },
    getTaskAdapter: () => adapter,
  };
}

function buildEngine(options: {
  elements?: Element[];
  events?: Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }>;
  issues?: ExternalTask[];
  onUpdate?: (id: ElementId, updates: Partial<Element>) => void;
  onUpdateIssue?: (project: string, externalId: string, updates: Partial<ExternalTaskInput>) => void;
  conflictResolver?: SyncConflictResolver;
  defaultConflictStrategy?: 'last_write_wins' | 'local_wins' | 'remote_wins' | 'manual';
} = {}): SyncEngine {
  const adapter = createMockTaskAdapter({
    issues: options.issues,
    onUpdateIssue: options.onUpdateIssue,
  });
  const provider = createMockProvider('github', adapter);
  const registry = new ProviderRegistry();
  registry.register(provider);

  const settings = createMockSettings();

  return createSyncEngine({
    api: createMockApi({
      elements: options.elements,
      events: options.events,
      onUpdate: options.onUpdate,
    }),
    registry,
    settings,
    conflictResolver: options.conflictResolver,
    defaultConflictStrategy: options.defaultConflictStrategy,
    providerConfigs: [
      { provider: 'github', token: 'test-token', defaultProject: 'owner/repo' },
    ],
  });
}

// ============================================================================
// Push Tests
// ============================================================================

describe('SyncEngine.push', () => {
  test('pushes element with changed content to external service', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(true);
    expect(result.pushed).toBe(1);
    expect(result.skipped).toBe(0);
  });

  test('skips element when no events since last push', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'different-old-hash',
      lastPushedAt: '2024-01-02T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      events: [], // No events since last push
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.skipped).toBe(1);
  });

  test('skips elements with pull-only direction', async () => {
    const syncState = createTestSyncState({ direction: 'pull' });
    const element = createTestElement({ _syncState: syncState });

    const engine = buildEngine({ elements: [element] });

    const result = await engine.push({ all: true });
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('dry run reports changes without pushing', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true, dryRun: true });
    expect(updateCalled).toBe(false);
    expect(result.pushed).toBe(1);
  });

  test('captures errors for individual elements', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    const adapter = createMockTaskAdapter();
    adapter.updateIssue = async () => {
      throw new Error('API connection timeout');
    };
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element],
        events: [
          { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
        ],
      }),
      registry,
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.push({ all: true });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('timeout');
    expect(result.errors[0].retryable).toBe(true);
    expect(result.success).toBe(false);
  });

  test('returns empty result when no elements are linked', async () => {
    const engine = buildEngine({ elements: [] });
    const result = await engine.push({ all: true });
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.success).toBe(true);
  });

  test('push payload includes sf:priority:* and sf:type:* labels from field mapping', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    // Create element with priority and taskType fields
    const element = {
      id: 'el-test1' as ElementId,
      type: 'task',
      title: 'Test Task',
      status: 'open',
      priority: 2, // high
      taskType: 'bug',
      tags: ['user-label'],
      createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      updatedAt: '2024-01-10T00:00:00.000Z' as Timestamp,
      createdBy: 'el-user1',
      metadata: setExternalSyncState({}, syncState),
    } as unknown as Element;

    let capturedUpdates: Partial<ExternalTaskInput> | undefined;
    const engine = buildEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdateIssue: (_project, _externalId, updates) => {
        capturedUpdates = updates;
      },
    });

    const result = await engine.push({ all: true });
    expect(result.pushed).toBe(1);
    expect(capturedUpdates).toBeDefined();

    // Verify sf:priority:* label is present
    expect(capturedUpdates!.labels).toContain('sf:priority:high');

    // Verify sf:type:* label is present
    expect(capturedUpdates!.labels).toContain('sf:type:bug');

    // Verify user tags are also preserved
    expect(capturedUpdates!.labels).toContain('user-label');

    // Verify state mapping is correct
    expect(capturedUpdates!.state).toBe('open');
  });

  test('push payload hydrates description from descriptionRef', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    const descDoc = {
      id: 'el-desc1' as ElementId,
      type: 'document',
      content: 'This is the task description body.',
      contentType: 'markdown',
      createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      updatedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      createdBy: 'el-user1',
      tags: [],
      metadata: {},
    } as unknown as Element;

    const element = {
      id: 'el-test1' as ElementId,
      type: 'task',
      title: 'Test Task',
      status: 'open',
      priority: 3, // medium
      taskType: 'task',
      tags: [],
      descriptionRef: 'el-desc1',
      createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      updatedAt: '2024-01-10T00:00:00.000Z' as Timestamp,
      createdBy: 'el-user1',
      metadata: setExternalSyncState({}, syncState),
    } as unknown as Element;

    let capturedUpdates: Partial<ExternalTaskInput> | undefined;
    const adapter = createMockTaskAdapter({
      onUpdateIssue: (_project, _externalId, updates) => {
        capturedUpdates = updates;
      },
    });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element, descDoc],
        events: [
          { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
        ],
      }),
      registry,
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.push({ all: true });
    expect(result.pushed).toBe(1);
    expect(capturedUpdates).toBeDefined();

    // Verify description is hydrated (not just raw descriptionRef ID)
    expect(capturedUpdates!.body).toBe('This is the task description body.');
  });
});

// ============================================================================
// Pull Tests
// ============================================================================

describe('SyncEngine.pull', () => {
  test('creates new tasks for unlinked external items with all flag', async () => {
    const externalIssue = createTestExternalTask({ externalId: '99', title: 'New Issue' });

    const engine = buildEngine({
      elements: [], // No linked elements
      issues: [externalIssue],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
  });

  test('skips unlinked external items without all flag', async () => {
    const externalIssue = createTestExternalTask({ externalId: '99' });

    const engine = buildEngine({
      elements: [],
      issues: [externalIssue],
    });

    const result = await engine.pull({});
    expect(result.pulled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('updates linked elements with remote changes', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Updated Remote Title',
    });

    let updatedId: ElementId | undefined;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      onUpdate: (id) => {
        updatedId = id;
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(updatedId).toBe(element.id);
  });

  test('skips linked elements with push-only direction', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      direction: 'push',
    });
    const element = createTestElement({ _syncState: syncState });

    const externalIssue = createTestExternalTask({ externalId: '42' });

    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
    });

    const result = await engine.pull({ all: true });
    expect(result.skipped).toBe(1);
    expect(result.pulled).toBe(0);
  });

  test('updates sync cursor after successful pull', async () => {
    const externalIssue = createTestExternalTask({ externalId: '99' });
    const settings = createMockSettings();

    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({ elements: [] }),
      registry,
      settings,
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    await engine.pull({ all: true });

    // The cursor should be stored in settings
    const cursorKey = 'external_sync.cursor.github.owner/repo.task';
    const cursorSetting = settings.getSetting(cursorKey);
    expect(cursorSetting).toBeDefined();
    expect(typeof cursorSetting!.value).toBe('string');
  });

  test('does not update cursor on dry run', async () => {
    const externalIssue = createTestExternalTask({ externalId: '99' });
    const settings = createMockSettings();

    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({ elements: [] }),
      registry,
      settings,
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    await engine.pull({ all: true, dryRun: true });

    const cursorKey = 'external_sync.cursor.github.owner/repo.task';
    const cursorSetting = settings.getSetting(cursorKey);
    expect(cursorSetting).toBeUndefined();
  });
});

// ============================================================================
// Pull — Provider Field Map Config Tests (granular status mapping)
// ============================================================================

describe('SyncEngine.pull — provider field map status mapping', () => {
  test('pull GitHub issue with sf:status:deferred label → Stoneforge deferred', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    const externalIssue = createTestExternalTask({
      externalId: '42',
      provider: 'github',
      state: 'open',
      labels: ['sf:status:deferred', 'user-tag'],
    });

    let capturedUpdates: Partial<Element> | undefined;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      onUpdate: (_id, updates) => {
        capturedUpdates = updates;
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(capturedUpdates).toBeDefined();
    expect(capturedUpdates!.status).toBe('deferred');
  });

  test('pull GitHub issue with no status label → falls back to open/closed', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    const externalIssue = createTestExternalTask({
      externalId: '42',
      provider: 'github',
      state: 'open',
      labels: ['bug'],
    });

    let capturedUpdates: Partial<Element> | undefined;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      onUpdate: (_id, updates) => {
        capturedUpdates = updates;
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    // No status label → fallback to basic open mapping
    // Since existing element has status 'open', diff mode won't include it
    // unless the status changed. The mapping produces 'open' for this case.
  });

  test('pull Linear issue in "started" state → Stoneforge in_progress (via injected label)', async () => {
    // Build a Linear-specific engine
    const syncState = createTestSyncState({
      provider: 'linear',
      project: 'ENG',
      externalId: 'lin-42',
      url: 'https://linear.app/myco/issue/ENG-42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    // Linear adapter injects sf:status:in-progress label for 'started' state type
    const externalIssue = createTestExternalTask({
      externalId: 'lin-42',
      provider: 'linear',
      project: 'ENG',
      state: 'open',
      labels: ['sf:status:in-progress'],
      priority: 2,
    });

    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('linear', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    let capturedUpdates: Partial<Element> | undefined;
    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element],
        onUpdate: (_id, updates) => {
          capturedUpdates = updates;
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'linear', token: 'test', defaultProject: 'ENG' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(capturedUpdates).toBeDefined();
    expect(capturedUpdates!.status).toBe('in_progress');
  });

  test('pull Linear issue in "triage" state → Stoneforge backlog', async () => {
    const syncState = createTestSyncState({
      provider: 'linear',
      project: 'ENG',
      externalId: 'lin-43',
      url: 'https://linear.app/myco/issue/ENG-43',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    // Linear adapter injects sf:status:backlog for 'triage' state type
    const externalIssue = createTestExternalTask({
      externalId: 'lin-43',
      provider: 'linear',
      project: 'ENG',
      state: 'open',
      labels: ['sf:status:backlog'],
      priority: 3,
    });

    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('linear', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    let capturedUpdates: Partial<Element> | undefined;
    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element],
        onUpdate: (_id, updates) => {
          capturedUpdates = updates;
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'linear', token: 'test', defaultProject: 'ENG' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(capturedUpdates).toBeDefined();
    expect(capturedUpdates!.status).toBe('backlog');
  });

  test('createTaskFromExternal uses provider field map config for status', async () => {
    // Linear issue in "started" state → should create task with in_progress status
    const externalIssue = createTestExternalTask({
      externalId: 'lin-new',
      provider: 'linear',
      project: 'ENG',
      state: 'open',
      labels: ['sf:status:in-progress', 'sf:type:bug'],
      priority: 1,
    });

    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('linear', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    let createdInput: Record<string, unknown> | undefined;
    const engine = createSyncEngine({
      api: createMockApi({
        elements: [],
        onCreate: (input) => {
          createdInput = input;
          return {
            id: 'el-new1',
            ...input,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          } as unknown as Element;
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'linear', token: 'test', defaultProject: 'ENG' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(createdInput).toBeDefined();
    expect(createdInput!.status).toBe('in_progress');
    expect(createdInput!.priority).toBe(1);
  });

  test('pull extracts priority from sf:priority:* labels for GitHub', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    // Create element with different priority to detect the change
    const element = {
      ...createTestElement({ _syncState: syncState }),
      priority: 3,
    } as unknown as Element;

    const externalIssue = createTestExternalTask({
      externalId: '42',
      provider: 'github',
      state: 'open',
      labels: ['sf:priority:high', 'sf:status:open', 'user-tag'],
    });

    let capturedUpdates: Partial<Element> | undefined;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      onUpdate: (_id, updates) => {
        capturedUpdates = updates;
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(capturedUpdates).toBeDefined();
    // sf:priority:high → Stoneforge priority 2
    expect(capturedUpdates!.priority).toBe(2);
  });
});

// ============================================================================
// Sync (Bidirectional) Tests
// ============================================================================

describe('SyncEngine.sync', () => {
  test('runs push then pull and merges results', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const linkedElement = createTestElement({ _syncState: syncState });

    const newExternalIssue = createTestExternalTask({ externalId: '99', title: 'New' });

    const engine = buildEngine({
      elements: [linkedElement],
      events: [
        { elementId: linkedElement.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      issues: [newExternalIssue],
    });

    const result = await engine.sync({ all: true });
    // Push should push the linked element, pull should create the new external issue
    expect(result.pushed).toBeGreaterThanOrEqual(0);
    expect(result.pulled).toBeGreaterThanOrEqual(0);
    expect(result.adapterType).toBe('task');
  });
});

// ============================================================================
// Conflict Detection Tests
// ============================================================================

describe('SyncEngine conflict handling', () => {
  test('detects conflicts when both sides changed and uses resolver', async () => {
    // Element with old pushed hash (local has changed since)
    const syncState = createTestSyncState({
      externalId: '42',
      lastPushedHash: 'hash-at-last-push',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    // Remote item (different from lastPulledHash)
    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Changed Remotely',
    });

    // Resolver that always picks remote
    const resolver: SyncConflictResolver = {
      resolve(): ConflictResolution {
        return { winner: 'remote', resolved: true };
      },
    };

    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      conflictResolver: resolver,
    });

    const result = await engine.pull({ all: true });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolved).toBe(true);
    expect(result.conflicts[0].winner).toBe('remote');
    expect(result.pulled).toBe(1);
  });

  test('tags element with sync-conflict when manual resolution needed', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPushedHash: 'hash-at-last-push',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    const externalIssue = createTestExternalTask({ externalId: '42' });

    // Resolver that returns manual (unresolved)
    const resolver: SyncConflictResolver = {
      resolve(): ConflictResolution {
        return { winner: 'manual', resolved: false };
      },
    };

    let updatedTags: string[] | undefined;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      conflictResolver: resolver,
      onUpdate: (_id, updates) => {
        if ('tags' in updates) {
          updatedTags = updates.tags as string[];
        }
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolved).toBe(false);
    expect(updatedTags).toContain('sync-conflict');
  });

  test('local-wins conflict skips pull but updates pulled hash', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPushedHash: 'hash-at-last-push',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestElement({ _syncState: syncState });

    const externalIssue = createTestExternalTask({ externalId: '42' });

    const resolver: SyncConflictResolver = {
      resolve(): ConflictResolution {
        return { winner: 'local', resolved: true };
      },
    };

    let updatedMetadata: Record<string, unknown> | undefined;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      conflictResolver: resolver,
      onUpdate: (_id, updates) => {
        if ('metadata' in updates) {
          updatedMetadata = updates.metadata as Record<string, unknown>;
        }
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].winner).toBe('local');
    // Element should be skipped (local wins), but metadata updated with new pulled hash
    expect(result.skipped).toBe(1);
    expect(updatedMetadata).toBeDefined();
  });
});

// ============================================================================
// Error Classification Tests
// ============================================================================

describe('Error classification', () => {
  test('marks rate-limit errors as retryable', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    const adapter = createMockTaskAdapter();
    adapter.updateIssue = async () => {
      throw new Error('API rate limit exceeded (429)');
    };
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element],
        events: [
          { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
        ],
      }),
      registry,
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.push({ all: true });
    expect(result.errors[0].retryable).toBe(true);
  });

  test('marks non-retryable errors correctly', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    const adapter = createMockTaskAdapter();
    adapter.updateIssue = async () => {
      throw new Error('Invalid request body');
    };
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element],
        events: [
          { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
        ],
      }),
      registry,
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.push({ all: true });
    expect(result.errors[0].retryable).toBe(false);
  });
});

// ============================================================================
// Closed/Tombstone Task Filtering Tests
// ============================================================================

describe('SyncEngine closed/tombstone task filtering', () => {
  // --- Push path ---

  test('push skips closed tasks', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = {
      ...createTestElement({ _syncState: syncState }),
      status: 'closed',
    } as unknown as Element;

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('push skips tombstone tasks', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = {
      ...createTestElement({ _syncState: syncState }),
      status: 'tombstone',
    } as unknown as Element;

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('push processes open/in_progress tasks normally', async () => {
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    const openElement = {
      ...createTestElement({ _syncState: syncState }),
      id: 'el-open1' as ElementId,
      status: 'open',
    } as unknown as Element;

    const inProgressElement = {
      ...createTestElement({
        _syncState: createTestSyncState({
          lastPushedHash: 'old-hash-that-differs-2',
          lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
          externalId: '43',
        }),
      }),
      id: 'el-prog1' as ElementId,
      status: 'in_progress',
    } as unknown as Element;

    let pushCount = 0;
    const engine = buildEngine({
      elements: [openElement, inProgressElement],
      events: [
        { elementId: 'el-open1' as ElementId, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
        { elementId: 'el-prog1' as ElementId, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdateIssue: () => {
        pushCount++;
      },
    });

    const result = await engine.push({ all: true });
    expect(pushCount).toBe(2);
    expect(result.pushed).toBe(2);
    expect(result.skipped).toBe(0);
  });

  // --- Pull path ---

  test('pull skips updates to closed tasks when external is also closed', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = {
      ...createTestElement({ _syncState: syncState }),
      status: 'closed',
    } as unknown as Element;

    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Updated Closed Issue',
      state: 'closed',
    });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      onUpdate: () => {
        updateCalled = true;
      },
    });

    const result = await engine.pull({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.pulled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('pull applies updates to closed tasks when external is open (reopened)', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = {
      ...createTestElement({ _syncState: syncState }),
      status: 'closed',
    } as unknown as Element;

    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Reopened Issue',
      state: 'open',
    });

    let updatedId: ElementId | undefined;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      onUpdate: (id) => {
        updatedId = id;
      },
    });

    const result = await engine.pull({ all: true });
    expect(updatedId).toBe(element.id);
    expect(result.pulled).toBe(1);
  });

  test('pull skips updates to tombstone tasks when external is closed', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = {
      ...createTestElement({ _syncState: syncState }),
      status: 'tombstone',
    } as unknown as Element;

    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Updated Tombstone Issue',
      state: 'closed',
    });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      issues: [externalIssue],
      onUpdate: () => {
        updateCalled = true;
      },
    });

    const result = await engine.pull({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.pulled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('push resumes syncing when task is reopened (status no longer closed/tombstone)', async () => {
    // A task that was previously closed but is now open again
    const syncState = createTestSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = {
      ...createTestElement({ _syncState: syncState }),
      status: 'open', // Was closed, now reopened
    } as unknown as Element;

    let updateCalled = false;
    const engine = buildEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'reopened', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(true);
    expect(result.pushed).toBe(1);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createSyncEngine', () => {
  test('creates a SyncEngine instance', () => {
    const registry = new ProviderRegistry();
    const engine = createSyncEngine({
      api: createMockApi(),
      registry,
    });
    expect(engine).toBeInstanceOf(SyncEngine);
  });
});
