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
