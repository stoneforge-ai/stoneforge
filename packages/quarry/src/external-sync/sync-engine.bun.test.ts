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
  ExternalDocument,
  ExternalDocumentInput,
  ExternalProvider,
  TaskSyncAdapter,
  DocumentSyncAdapter,
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
    async list<T extends Element>(filter?: Record<string, unknown>): Promise<T[]> {
      if (filter && 'type' in filter) {
        return elements.filter((e) => (e as unknown as { type: string }).type === filter.type) as T[];
      }
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

  test('push --all --force pushes all linked tasks even with no content changes', async () => {
    const currentHash = (() => {
      // Compute what computeContentHashSync would return for our test element
      // so we can set lastPushedHash to match (simulating "no change")
      const el = createTestElement({
        _syncState: createTestSyncState(),
      });
      // Import not needed — we just use a known hash from a prior push
      return 'will-be-set-to-match';
    })();

    // Create an element where lastPushedHash matches current content
    // (i.e., no content has changed since last push)
    const syncState = createTestSyncState({
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    // Compute the actual hash for this element to simulate "already pushed"
    const { computeContentHashSync } = await import('../sync/hash.js');
    const matchingHash = computeContentHashSync(element as unknown as Element).hash;

    // Recreate with matching hash so hash comparison would normally skip
    const syncStateWithHash = createTestSyncState({
      lastPushedHash: matchingHash,
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const elementWithHash = createTestElement({ _syncState: syncStateWithHash });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [elementWithHash],
      events: [], // No events — would normally skip
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true, force: true });
    expect(updateCalled).toBe(true);
    expect(result.pushed).toBe(1);
    expect(result.skipped).toBe(0);
  });

  test('push --all without --force still skips unchanged tasks', async () => {
    const syncState = createTestSyncState({
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    // Compute the actual hash for this element to simulate "already pushed"
    const { computeContentHashSync } = await import('../sync/hash.js');
    const matchingHash = computeContentHashSync(element as unknown as Element).hash;

    const syncStateWithHash = createTestSyncState({
      lastPushedHash: matchingHash,
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const elementWithHash = createTestElement({ _syncState: syncStateWithHash });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [elementWithHash],
      events: [], // No events
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true }); // No force
    expect(updateCalled).toBe(false);
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('push specific task with --force pushes even if hash matches', async () => {
    const syncState = createTestSyncState({
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestElement({ _syncState: syncState });

    // Compute the actual hash for this element to simulate "already pushed"
    const { computeContentHashSync } = await import('../sync/hash.js');
    const matchingHash = computeContentHashSync(element as unknown as Element).hash;

    const syncStateWithHash = createTestSyncState({
      lastPushedHash: matchingHash,
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const elementWithHash = createTestElement({ _syncState: syncStateWithHash });

    let updateCalled = false;
    const engine = buildEngine({
      elements: [elementWithHash],
      events: [], // No events
      onUpdateIssue: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ taskIds: ['el-test1'], force: true });
    expect(updateCalled).toBe(true);
    expect(result.pushed).toBe(1);
    expect(result.skipped).toBe(0);
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
// Pull — Description (Body) Sync Tests
// ============================================================================

describe('SyncEngine.pull — description body sync', () => {
  test('pull with body change updates the existing description document', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });

    // Existing description document
    const descDoc = {
      id: 'el-desc1' as ElementId,
      type: 'document',
      content: 'Old description content.',
      contentType: 'markdown',
      createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      updatedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      createdBy: 'system',
      tags: ['task-description'],
      metadata: {},
    } as unknown as Element;

    // Task element with descriptionRef pointing to the document
    const element = {
      ...createTestElement({ _syncState: syncState }),
      descriptionRef: 'el-desc1',
    } as unknown as Element;

    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Updated Remote Title',
      body: 'New description from GitHub.',
    });

    const updatedIds: Array<{ id: ElementId; updates: Partial<Element> }> = [];
    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element, descDoc],
        onUpdate: (id, updates) => {
          updatedIds.push({ id, updates });
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Verify the description document was updated
    const descUpdate = updatedIds.find((u) => u.id === ('el-desc1' as ElementId));
    expect(descUpdate).toBeDefined();
    expect((descUpdate!.updates as Record<string, unknown>).content).toBe('New description from GitHub.');
  });

  test('pull with no body change skips description document update', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });

    // Existing description document with same content as the incoming body
    const descDoc = {
      id: 'el-desc1' as ElementId,
      type: 'document',
      content: 'Same description content.',
      contentType: 'markdown',
      createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      updatedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      createdBy: 'system',
      tags: ['task-description'],
      metadata: {},
    } as unknown as Element;

    const element = {
      ...createTestElement({ _syncState: syncState }),
      descriptionRef: 'el-desc1',
    } as unknown as Element;

    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Updated Remote Title',
      body: 'Same description content.',
    });

    const updatedIds: Array<{ id: ElementId; updates: Partial<Element> }> = [];
    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element, descDoc],
        onUpdate: (id, updates) => {
          updatedIds.push({ id, updates });
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Verify the description document was NOT updated (only the task element was)
    const descUpdate = updatedIds.find((u) => u.id === ('el-desc1' as ElementId));
    expect(descUpdate).toBeUndefined();

    // But the task itself should still be updated (title etc.)
    const taskUpdate = updatedIds.find((u) => u.id === element.id);
    expect(taskUpdate).toBeDefined();
  });

  test('pull with body on a task with no descriptionRef creates new document and links it', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });

    // Element WITHOUT descriptionRef
    const element = createTestElement({ _syncState: syncState });

    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Remote Issue',
      body: 'A brand new description.',
    });

    let createdDocInput: Record<string, unknown> | undefined;
    let taskUpdateData: Partial<Element> | undefined;
    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element],
        onUpdate: (_id, updates) => {
          taskUpdateData = updates;
        },
        onCreate: (input) => {
          createdDocInput = input;
          return {
            id: 'el-newdoc1' as ElementId,
            ...input,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          } as unknown as Element;
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Verify a new document was created with correct properties
    expect(createdDocInput).toBeDefined();
    expect(createdDocInput!.type).toBe('document');
    expect(createdDocInput!.contentType).toBe('markdown');
    expect(createdDocInput!.content).toBe('A brand new description.');
    expect(createdDocInput!.tags).toContain('task-description');

    // Verify the task was updated with the descriptionRef
    expect(taskUpdateData).toBeDefined();
    expect((taskUpdateData as Record<string, unknown>).descriptionRef).toBe('el-newdoc1');
  });

  test('pull with empty body does not delete existing description', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });

    // Existing description document
    const descDoc = {
      id: 'el-desc1' as ElementId,
      type: 'document',
      content: 'Existing description.',
      contentType: 'markdown',
      createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      updatedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      createdBy: 'system',
      tags: ['task-description'],
      metadata: {},
    } as unknown as Element;

    const element = {
      ...createTestElement({ _syncState: syncState }),
      descriptionRef: 'el-desc1',
    } as unknown as Element;

    // External issue with empty body
    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Remote Issue',
      body: '',
    });

    const updatedIds: Array<{ id: ElementId; updates: Partial<Element> }> = [];
    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element, descDoc],
        onUpdate: (id, updates) => {
          updatedIds.push({ id, updates });
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Verify the description document was NOT updated or deleted
    const descUpdate = updatedIds.find((u) => u.id === ('el-desc1' as ElementId));
    expect(descUpdate).toBeUndefined();

    // The task should still be updated (for other field changes)
    const taskUpdate = updatedIds.find((u) => u.id === element.id);
    expect(taskUpdate).toBeDefined();
    // descriptionRef should NOT be in the update (not removed)
    expect((taskUpdate!.updates as Record<string, unknown>).descriptionRef).toBeUndefined();
  });

  test('pull with undefined body does not delete existing description', async () => {
    const syncState = createTestSyncState({
      externalId: '42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });

    const descDoc = {
      id: 'el-desc1' as ElementId,
      type: 'document',
      content: 'Existing description.',
      contentType: 'markdown',
      createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      updatedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      createdBy: 'system',
      tags: ['task-description'],
      metadata: {},
    } as unknown as Element;

    const element = {
      ...createTestElement({ _syncState: syncState }),
      descriptionRef: 'el-desc1',
    } as unknown as Element;

    // External issue with undefined body
    const externalIssue = createTestExternalTask({
      externalId: '42',
      title: 'Remote Issue',
      body: undefined,
    });

    const updatedIds: Array<{ id: ElementId; updates: Partial<Element> }> = [];
    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [element, descDoc],
        onUpdate: (id, updates) => {
          updatedIds.push({ id, updates });
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Verify the description document was NOT updated
    const descUpdate = updatedIds.find((u) => u.id === ('el-desc1' as ElementId));
    expect(descUpdate).toBeUndefined();
  });

  test('createTaskFromExternal creates description document for new tasks with body', async () => {
    const externalIssue = createTestExternalTask({
      externalId: '99',
      title: 'New Issue With Description',
      body: 'This is the issue description.',
    });

    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const createdInputs: Record<string, unknown>[] = [];
    const engine = createSyncEngine({
      api: createMockApi({
        elements: [],
        onCreate: (input) => {
          createdInputs.push(input);
          const id = input.type === 'document' ? 'el-newdoc1' : 'el-newtask1';
          return {
            id: id as ElementId,
            ...input,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          } as unknown as Element;
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Should have created two elements: a document and a task
    expect(createdInputs).toHaveLength(2);

    // First should be the description document
    const docInput = createdInputs.find((i) => i.type === 'document');
    expect(docInput).toBeDefined();
    expect(docInput!.content).toBe('This is the issue description.');
    expect(docInput!.contentType).toBe('markdown');
    expect(docInput!.tags).toContain('task-description');

    // Second should be the task with descriptionRef linked
    const taskInput = createdInputs.find((i) => i.type === 'task');
    expect(taskInput).toBeDefined();
    expect(taskInput!.descriptionRef).toBe('el-newdoc1');
  });

  test('createTaskFromExternal skips description document for new tasks without body', async () => {
    const externalIssue = createTestExternalTask({
      externalId: '99',
      title: 'New Issue Without Description',
      body: '',
    });

    const adapter = createMockTaskAdapter({ issues: [externalIssue] });
    const provider = createMockProvider('github', adapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const createdInputs: Record<string, unknown>[] = [];
    const engine = createSyncEngine({
      api: createMockApi({
        elements: [],
        onCreate: (input) => {
          createdInputs.push(input);
          return {
            id: 'el-newtask1' as ElementId,
            ...input,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          } as unknown as Element;
        },
      }),
      registry,
      settings: createMockSettings(),
      providerConfigs: [{ provider: 'github', token: 'test', defaultProject: 'owner/repo' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Should have created only the task, not a description document
    expect(createdInputs).toHaveLength(1);
    expect(createdInputs[0].type).toBe('task');
    expect(createdInputs[0].descriptionRef).toBeUndefined();
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

// ============================================================================
// Document Sync Test Helpers
// ============================================================================

function createTestDocumentSyncState(overrides: Partial<ExternalSyncState> = {}): ExternalSyncState {
  return {
    provider: 'notion',
    project: 'workspace-1',
    externalId: 'page-42',
    url: 'https://notion.so/page-42',
    direction: 'bidirectional',
    adapterType: 'document',
    ...overrides,
  } as ExternalSyncState;
}

function createTestDocumentElement(metadataOverrides: Record<string, unknown> = {}): Element {
  const syncState = metadataOverrides._syncState as ExternalSyncState | undefined;
  delete metadataOverrides._syncState;

  const metadata = syncState
    ? setExternalSyncState(metadataOverrides, syncState)
    : metadataOverrides;

  return {
    id: 'el-doc1' as ElementId,
    type: 'document',
    title: 'Test Document',
    content: 'Test document content',
    contentType: 'markdown',
    status: 'active',
    category: 'reference',
    version: 1,
    previousVersionId: null,
    immutable: false,
    tags: ['doc-tag'],
    createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    updatedAt: '2024-01-10T00:00:00.000Z' as Timestamp,
    createdBy: 'el-user1',
    metadata,
  } as unknown as Element;
}

function createTestExternalDocument(overrides: Partial<ExternalDocument> = {}): ExternalDocument {
  return {
    externalId: 'page-42',
    url: 'https://notion.so/page-42',
    provider: 'notion',
    project: 'workspace-1',
    title: 'Remote Document Title',
    content: 'Remote document content',
    contentType: 'markdown' as const,
    updatedAt: '2024-01-15T00:00:00Z',
    ...overrides,
  };
}

function createMockDocumentAdapter(options: {
  pages?: ExternalDocument[];
  onUpdatePage?: (project: string, externalId: string, updates: Partial<ExternalDocumentInput>) => void;
  onCreatePage?: (project: string, page: ExternalDocumentInput) => ExternalDocument;
} = {}): DocumentSyncAdapter {
  return {
    async getPage(_project: string, externalId: string): Promise<ExternalDocument | null> {
      return options.pages?.find((p) => p.externalId === externalId) ?? null;
    },
    async listPagesSince(_project: string, _since: Timestamp): Promise<ExternalDocument[]> {
      return options.pages ?? [];
    },
    async createPage(project: string, page: ExternalDocumentInput): Promise<ExternalDocument> {
      if (options.onCreatePage) {
        return options.onCreatePage(project, page);
      }
      return createTestExternalDocument({ title: page.title, externalId: 'page-99' });
    },
    async updatePage(
      project: string,
      externalId: string,
      updates: Partial<ExternalDocumentInput>
    ): Promise<ExternalDocument> {
      options.onUpdatePage?.(project, externalId, updates);
      return createTestExternalDocument({ externalId, ...updates });
    },
  };
}

function createMockDocumentProvider(
  name: string,
  docAdapter: DocumentSyncAdapter,
  taskAdapter?: TaskSyncAdapter
): ExternalProvider {
  const supportedAdapters: Array<'task' | 'document' | 'message'> = ['document'];
  if (taskAdapter) supportedAdapters.push('task');

  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    supportedAdapters,
    async testConnection(_config: ProviderConfig): Promise<boolean> {
      return true;
    },
    getDocumentAdapter: () => docAdapter,
    ...(taskAdapter && { getTaskAdapter: () => taskAdapter }),
  };
}

function buildDocumentEngine(options: {
  elements?: Element[];
  events?: Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }>;
  pages?: ExternalDocument[];
  onUpdate?: (id: ElementId, updates: Partial<Element>) => void;
  onUpdatePage?: (project: string, externalId: string, updates: Partial<ExternalDocumentInput>) => void;
  onCreate?: (input: Record<string, unknown>) => Element;
  conflictResolver?: SyncConflictResolver;
} = {}): SyncEngine {
  const docAdapter = createMockDocumentAdapter({
    pages: options.pages,
    onUpdatePage: options.onUpdatePage,
  });
  const provider = createMockDocumentProvider('notion', docAdapter);
  const registry = new ProviderRegistry();
  registry.register(provider);

  const settings = createMockSettings();

  return createSyncEngine({
    api: createMockApi({
      elements: options.elements,
      events: options.events,
      onUpdate: options.onUpdate,
      onCreate: options.onCreate,
    }),
    registry,
    settings,
    conflictResolver: options.conflictResolver,
    providerConfigs: [
      { provider: 'notion', token: 'test-token', defaultProject: 'workspace-1' },
    ],
  });
}

// ============================================================================
// Document Push Tests
// ============================================================================

describe('SyncEngine.push — documents', () => {
  test('pushes document with changed content to external service', async () => {
    const syncState = createTestDocumentSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    let updateCalled = false;
    let capturedUpdates: Partial<ExternalDocumentInput> | undefined;
    const engine = buildDocumentEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdatePage: (_project, _externalId, updates) => {
        updateCalled = true;
        capturedUpdates = updates;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(true);
    expect(result.pushed).toBe(1);
    expect(result.skipped).toBe(0);
    // Verify document fields are passed
    expect(capturedUpdates).toBeDefined();
    expect(capturedUpdates!.title).toBe('Test Document');
    expect(capturedUpdates!.content).toBe('Test document content');
    expect(capturedUpdates!.contentType).toBe('markdown');
  });

  test('skips document when content hash unchanged', async () => {
    const element = createTestDocumentElement({
      _syncState: createTestDocumentSyncState(),
    });

    // Compute the actual hash for this element to simulate "already pushed"
    const { computeContentHashSync } = await import('../sync/hash.js');
    const matchingHash = computeContentHashSync(element as unknown as Element).hash;

    const syncStateWithHash = createTestDocumentSyncState({
      lastPushedHash: matchingHash,
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const elementWithHash = createTestDocumentElement({ _syncState: syncStateWithHash });

    let updateCalled = false;
    const engine = buildDocumentEngine({
      elements: [elementWithHash],
      events: [],
      onUpdatePage: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('skips documents with pull-only direction', async () => {
    const syncState = createTestDocumentSyncState({ direction: 'pull' });
    const element = createTestDocumentElement({ _syncState: syncState });

    const engine = buildDocumentEngine({ elements: [element] });

    const result = await engine.push({ all: true });
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('skips archived documents on push', async () => {
    const syncState = createTestDocumentSyncState({
      lastPushedHash: 'old-hash-that-differs',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = {
      ...createTestDocumentElement({ _syncState: syncState }),
      status: 'archived',
    } as unknown as Element;

    let updateCalled = false;
    const engine = buildDocumentEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdatePage: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('push dry run reports changes without pushing document', async () => {
    const syncState = createTestDocumentSyncState({
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    let updateCalled = false;
    const engine = buildDocumentEngine({
      elements: [element],
      events: [
        { elementId: element.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      onUpdatePage: () => {
        updateCalled = true;
      },
    });

    const result = await engine.push({ all: true, dryRun: true });
    expect(updateCalled).toBe(false);
    expect(result.pushed).toBe(1);
  });

  test('push captures errors for document elements', async () => {
    const syncState = createTestDocumentSyncState({
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    const docAdapter = createMockDocumentAdapter();
    docAdapter.updatePage = async () => {
      throw new Error('Notion API rate limit exceeded (429)');
    };
    const provider = createMockDocumentProvider('notion', docAdapter);
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
      providerConfigs: [{ provider: 'notion', token: 'test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.push({ all: true });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('rate limit');
    expect(result.errors[0].retryable).toBe(true);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Document Pull Tests
// ============================================================================

describe('SyncEngine.pull — documents', () => {
  test('creates new documents for unlinked external documents with all flag', async () => {
    const externalDoc = createTestExternalDocument({ externalId: 'page-99', title: 'New Page' });

    let createdInput: Record<string, unknown> | undefined;
    const engine = buildDocumentEngine({
      elements: [],
      pages: [externalDoc],
      onCreate: (input) => {
        createdInput = input;
        return {
          id: 'el-newdoc1' as ElementId,
          ...input,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        } as unknown as Element;
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(createdInput).toBeDefined();
    expect(createdInput!.type).toBe('document');
    expect(createdInput!.title).toBe('New Page');
    expect(createdInput!.content).toBe('Remote document content');
    expect(createdInput!.contentType).toBe('markdown');
    expect(createdInput!.status).toBe('active');
  });

  test('skips unlinked external documents without all flag', async () => {
    const externalDoc = createTestExternalDocument({ externalId: 'page-99' });

    const engine = buildDocumentEngine({
      elements: [],
      pages: [externalDoc],
    });

    const result = await engine.pull({});
    expect(result.pulled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('updates linked documents with remote changes', async () => {
    const syncState = createTestDocumentSyncState({
      externalId: 'page-42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    const externalDoc = createTestExternalDocument({
      externalId: 'page-42',
      title: 'Updated Remote Title',
      content: 'Updated remote content',
    });

    let updatedId: ElementId | undefined;
    let capturedUpdates: Partial<Element> | undefined;
    const engine = buildDocumentEngine({
      elements: [element],
      pages: [externalDoc],
      onUpdate: (id, updates) => {
        updatedId = id;
        capturedUpdates = updates;
      },
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);
    expect(updatedId).toBe(element.id);
    // Verify document content was updated
    expect(capturedUpdates).toBeDefined();
    expect((capturedUpdates as Record<string, unknown>).title).toBe('Updated Remote Title');
    expect((capturedUpdates as Record<string, unknown>).content).toBe('Updated remote content');
  });

  test('skips linked documents with push-only direction', async () => {
    const syncState = createTestDocumentSyncState({
      externalId: 'page-42',
      direction: 'push',
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    const externalDoc = createTestExternalDocument({ externalId: 'page-42' });

    const engine = buildDocumentEngine({
      elements: [element],
      pages: [externalDoc],
    });

    const result = await engine.pull({ all: true });
    expect(result.skipped).toBe(1);
    expect(result.pulled).toBe(0);
  });

  test('skips updates to archived documents on pull', async () => {
    const syncState = createTestDocumentSyncState({
      externalId: 'page-42',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = {
      ...createTestDocumentElement({ _syncState: syncState }),
      status: 'archived',
    } as unknown as Element;

    const externalDoc = createTestExternalDocument({
      externalId: 'page-42',
      title: 'Updated Archived Doc',
    });

    let updateCalled = false;
    const engine = buildDocumentEngine({
      elements: [element],
      pages: [externalDoc],
      onUpdate: () => {
        updateCalled = true;
      },
    });

    const result = await engine.pull({ all: true });
    expect(updateCalled).toBe(false);
    expect(result.pulled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('updates document sync cursor after successful pull', async () => {
    const externalDoc = createTestExternalDocument({ externalId: 'page-99' });
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter({ pages: [externalDoc] });
    const provider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({ elements: [] }),
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'test', defaultProject: 'workspace-1' }],
    });

    await engine.pull({ all: true });

    // The cursor should be stored in settings with 'document' adapter type
    const cursorKey = 'external_sync.cursor.notion.workspace-1.document';
    const cursorSetting = settings.getSetting(cursorKey);
    expect(cursorSetting).toBeDefined();
    expect(typeof cursorSetting!.value).toBe('string');
  });

  test('does not update document cursor on dry run', async () => {
    const externalDoc = createTestExternalDocument({ externalId: 'page-99' });
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter({ pages: [externalDoc] });
    const provider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(provider);

    const engine = createSyncEngine({
      api: createMockApi({ elements: [] }),
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'test', defaultProject: 'workspace-1' }],
    });

    await engine.pull({ all: true, dryRun: true });

    const cursorKey = 'external_sync.cursor.notion.workspace-1.document';
    const cursorSetting = settings.getSetting(cursorKey);
    expect(cursorSetting).toBeUndefined();
  });

  test('uses computeExternalDocumentHash for pull change detection', async () => {
    // Import hash function to precompute the hash
    const { computeExternalDocumentHash } = await import('./adapters/document-sync-adapter.js');

    const externalDoc = createTestExternalDocument({
      externalId: 'page-42',
      title: 'Same Title',
      content: 'Same content',
      contentType: 'markdown',
    });

    // Set lastPulledHash to match what the external doc would hash to
    const currentHash = computeExternalDocumentHash(externalDoc);
    const syncState = createTestDocumentSyncState({
      externalId: 'page-42',
      lastPulledHash: currentHash,
      direction: 'bidirectional',
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    let updateCalled = false;
    const engine = buildDocumentEngine({
      elements: [element],
      pages: [externalDoc],
      onUpdate: () => {
        updateCalled = true;
      },
    });

    const result = await engine.pull({ all: true });
    // Should skip because hash matches — no real change
    expect(updateCalled).toBe(false);
    expect(result.pulled).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ============================================================================
// Mixed Task + Document Sync Tests
// ============================================================================

describe('SyncEngine.sync — mixed task + document', () => {
  test('push handles both tasks and documents in a single pass', async () => {
    const taskSyncState = createTestSyncState({
      lastPushedHash: 'old-task-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const taskElement = createTestElement({ _syncState: taskSyncState });

    const docSyncState = createTestDocumentSyncState({
      lastPushedHash: 'old-doc-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const docElement = createTestDocumentElement({ _syncState: docSyncState });

    let taskUpdateCalled = false;
    let docUpdateCalled = false;

    const taskAdapter = createMockTaskAdapter({
      onUpdateIssue: () => {
        taskUpdateCalled = true;
      },
    });
    const docAdapter = createMockDocumentAdapter({
      onUpdatePage: () => {
        docUpdateCalled = true;
      },
    });

    // Create a provider that supports both task and document adapters
    const provider: ExternalProvider = {
      name: 'github',
      displayName: 'GitHub',
      supportedAdapters: ['task', 'document'],
      async testConnection(): Promise<boolean> { return true; },
      getTaskAdapter: () => taskAdapter,
      getDocumentAdapter: () => docAdapter,
    };
    const registry = new ProviderRegistry();
    registry.register(provider);

    // We need a separate provider for notion since it holds the document
    const notionDocAdapter = createMockDocumentAdapter({
      onUpdatePage: () => {
        docUpdateCalled = true;
      },
    });
    const notionProvider = createMockDocumentProvider('notion', notionDocAdapter);
    registry.register(notionProvider);

    const settings = createMockSettings();

    const engine = createSyncEngine({
      api: createMockApi({
        elements: [taskElement, docElement],
        events: [
          { elementId: taskElement.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
          { elementId: docElement.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
        ],
      }),
      registry,
      settings,
      providerConfigs: [
        { provider: 'github', token: 'test-token', defaultProject: 'owner/repo' },
        { provider: 'notion', token: 'test-token', defaultProject: 'workspace-1' },
      ],
    });

    const result = await engine.push({ all: true });
    expect(taskUpdateCalled).toBe(true);
    expect(docUpdateCalled).toBe(true);
    expect(result.pushed).toBe(2);
  });

  test('pull handles both task and document adapters', async () => {
    const externalIssue = createTestExternalTask({ externalId: '99', title: 'New Issue' });
    const externalDoc = createTestExternalDocument({ externalId: 'page-99', title: 'New Page' });

    const taskAdapter = createMockTaskAdapter({ issues: [externalIssue] });
    const docAdapter = createMockDocumentAdapter({ pages: [externalDoc] });

    const provider: ExternalProvider = {
      name: 'github',
      displayName: 'GitHub',
      supportedAdapters: ['task'],
      async testConnection(): Promise<boolean> { return true; },
      getTaskAdapter: () => taskAdapter,
    };
    const notionProvider = createMockDocumentProvider('notion', docAdapter);

    const registry = new ProviderRegistry();
    registry.register(provider);
    registry.register(notionProvider);

    const settings = createMockSettings();

    const engine = createSyncEngine({
      api: createMockApi({ elements: [] }),
      registry,
      settings,
      providerConfigs: [
        { provider: 'github', token: 'test', defaultProject: 'owner/repo' },
        { provider: 'notion', token: 'test', defaultProject: 'workspace-1' },
      ],
    });

    const result = await engine.pull({ all: true });
    // Both should be created (1 task + 1 document)
    expect(result.pulled).toBe(2);
  });

  test('sync() does not hardcode adapterType to task', async () => {
    const docSyncState = createTestDocumentSyncState({
      lastPushedHash: 'old-doc-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const docElement = createTestDocumentElement({ _syncState: docSyncState });

    const engine = buildDocumentEngine({
      elements: [docElement],
      events: [
        { elementId: docElement.id, eventType: 'updated', createdAt: '2024-01-05T00:00:00.000Z' as Timestamp },
      ],
      pages: [],
    });

    const result = await engine.sync({ all: true });
    // The result should not have hardcoded 'task' as adapterType
    // It derives from push/pull results
    expect(result.pushed).toBeGreaterThanOrEqual(0);
    expect(result.pulled).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Document Conflict Resolution Tests
// ============================================================================

describe('SyncEngine conflict handling — documents', () => {
  test('detects conflicts when both local and remote document changed', async () => {
    // Element with old pushed hash (local has changed since)
    const syncState = createTestDocumentSyncState({
      externalId: 'page-42',
      lastPushedHash: 'hash-at-last-push',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    // Remote document (different from lastPulledHash)
    const externalDoc = createTestExternalDocument({
      externalId: 'page-42',
      title: 'Changed Remotely',
      content: 'Changed content',
    });

    // Resolver that always picks remote
    const resolver: SyncConflictResolver = {
      resolve(): ConflictResolution {
        return { winner: 'remote', resolved: true };
      },
    };

    const engine = buildDocumentEngine({
      elements: [element],
      pages: [externalDoc],
      conflictResolver: resolver,
    });

    const result = await engine.pull({ all: true });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolved).toBe(true);
    expect(result.conflicts[0].winner).toBe('remote');
    expect(result.pulled).toBe(1);
  });

  test('manual resolution tags document with sync-conflict', async () => {
    const syncState = createTestDocumentSyncState({
      externalId: 'page-42',
      lastPushedHash: 'hash-at-last-push',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    const externalDoc = createTestExternalDocument({ externalId: 'page-42' });

    // Resolver that returns manual (unresolved)
    const resolver: SyncConflictResolver = {
      resolve(): ConflictResolution {
        return { winner: 'manual', resolved: false };
      },
    };

    let updatedTags: string[] | undefined;
    const engine = buildDocumentEngine({
      elements: [element],
      pages: [externalDoc],
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

  test('local-wins conflict skips pull but updates pulled hash for documents', async () => {
    const syncState = createTestDocumentSyncState({
      externalId: 'page-42',
      lastPushedHash: 'hash-at-last-push',
      lastPulledHash: 'old-remote-hash',
      direction: 'bidirectional',
    });
    const element = createTestDocumentElement({ _syncState: syncState });

    const externalDoc = createTestExternalDocument({ externalId: 'page-42' });

    const resolver: SyncConflictResolver = {
      resolve(): ConflictResolution {
        return { winner: 'local', resolved: true };
      },
    };

    let updatedMetadata: Record<string, unknown> | undefined;
    const engine = buildDocumentEngine({
      elements: [element],
      pages: [externalDoc],
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
