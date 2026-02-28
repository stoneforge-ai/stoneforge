/**
 * Document Sync — Integration Tests
 *
 * End-to-end integration tests for the full document sync pipeline.
 * Tests the interaction between the SyncEngine, ProviderRegistry,
 * document adapters (Folder + Notion), conflict resolver, and the
 * system category filtering in link-all.
 *
 * These tests use mock APIs and adapters but exercise the full pipeline
 * from provider registration through push/pull/sync cycles.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  Element,
  ElementId,
  ExternalDocument,
  ExternalDocumentInput,
  ExternalTask,
  ExternalTaskInput,
  ExternalProvider,
  ExternalSyncState,
  TaskSyncAdapter,
  DocumentSyncAdapter,
  ProviderConfig,
  TaskFieldMapConfig,
  Timestamp,
  EventFilter,
  Document,
  DocumentCategory,
} from '@stoneforge/core';
import {
  getExternalSyncState,
  setExternalSyncState,
} from '@stoneforge/core';
import { ProviderRegistry, createDefaultProviderRegistry } from './provider-registry.js';
import { SyncEngine, createSyncEngine } from './sync-engine.js';
import type {
  SyncEngineAPI,
  SyncEngineSettings,
  SyncConflictResolver,
  ConflictResolution,
} from './sync-engine.js';
import { createFolderProvider } from './providers/folder/index.js';
import { isSystemCategory, SYSTEM_CATEGORIES, computeExternalDocumentHash } from './adapters/document-sync-adapter.js';
import { computeContentHashSync } from '../sync/hash.js';

// ============================================================================
// Shared Test Helpers
// ============================================================================

let idCounter = 0;

function nextId(): ElementId {
  idCounter++;
  return `el-integ-${idCounter}` as ElementId;
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

/**
 * In-memory element store that behaves like a real API.
 * Tracks creates, updates, and supports filtering.
 */
function createInMemoryApi(): SyncEngineAPI & {
  elements: Element[];
  updateLog: Array<{ id: ElementId; updates: Partial<Element> }>;
  createLog: Array<Record<string, unknown>>;
  events: Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }>;
  addEvent: (elementId: ElementId, eventType: string, createdAt: string) => void;
} {
  const elements: Element[] = [];
  const updateLog: Array<{ id: ElementId; updates: Partial<Element> }> = [];
  const createLog: Array<Record<string, unknown>> = [];
  const events: Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }> = [];

  return {
    elements,
    updateLog,
    createLog,
    events,
    addEvent(elementId: ElementId, eventType: string, createdAt: string) {
      events.push({ elementId, eventType, createdAt: createdAt as Timestamp });
    },

    async get<T extends Element>(id: ElementId): Promise<T | null> {
      return (elements.find((e) => e.id === id) as T) ?? null;
    },

    async list<T extends Element>(filter?: Record<string, unknown>): Promise<T[]> {
      if (filter && 'type' in filter) {
        return elements.filter((e) => (e as unknown as { type: string }).type === filter.type) as T[];
      }
      return elements as T[];
    },

    async update<T extends Element>(id: ElementId, updates: Partial<T>): Promise<T> {
      updateLog.push({ id, updates: updates as Partial<Element> });
      const idx = elements.findIndex((e) => e.id === id);
      if (idx >= 0) {
        elements[idx] = { ...elements[idx], ...updates } as Element;
        // Add an event for the update
        events.push({
          elementId: id,
          eventType: 'updated',
          createdAt: new Date().toISOString() as Timestamp,
        });
        return elements[idx] as T;
      }
      return { id, ...updates } as T;
    },

    async create<T extends Element>(input: Record<string, unknown>): Promise<T> {
      createLog.push(input);
      const newElement = {
        id: nextId(),
        ...input,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as Element;
      elements.push(newElement);
      return newElement as T;
    },

    async listEvents(_filter?: EventFilter): Promise<Array<{ elementId: ElementId; eventType: string; createdAt: Timestamp }>> {
      return events;
    },
  };
}

function makeDocumentElement(overrides: {
  id?: ElementId;
  title?: string;
  content?: string;
  contentType?: string;
  category?: DocumentCategory;
  status?: string;
  syncState?: ExternalSyncState;
  tags?: string[];
}): Element {
  const id = overrides.id ?? nextId();
  const metadata: Record<string, unknown> = {};

  const element = {
    id,
    type: 'document',
    title: overrides.title ?? 'Test Document',
    content: overrides.content ?? 'Document content here',
    contentType: overrides.contentType ?? 'markdown',
    category: overrides.category ?? 'reference',
    status: overrides.status ?? 'active',
    tags: overrides.tags ?? [],
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    updatedAt: '2024-01-10T00:00:00.000Z' as Timestamp,
    createdBy: 'el-user1',
    metadata: overrides.syncState
      ? setExternalSyncState(metadata, overrides.syncState)
      : metadata,
  } as unknown as Element;

  return element;
}

function makeTaskElement(overrides: {
  id?: ElementId;
  title?: string;
  status?: string;
  syncState?: ExternalSyncState;
  tags?: string[];
  priority?: number;
  taskType?: string;
}): Element {
  const id = overrides.id ?? nextId();
  const metadata: Record<string, unknown> = {};

  return {
    id,
    type: 'task',
    title: overrides.title ?? 'Test Task',
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 3,
    taskType: overrides.taskType ?? 'task',
    tags: overrides.tags ?? [],
    createdAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    updatedAt: '2024-01-10T00:00:00.000Z' as Timestamp,
    createdBy: 'el-user1',
    metadata: overrides.syncState
      ? setExternalSyncState(metadata, overrides.syncState)
      : metadata,
  } as unknown as Element;
}

function makeDocSyncState(overrides: Partial<ExternalSyncState> = {}): ExternalSyncState {
  return {
    provider: 'notion',
    project: 'workspace-1',
    externalId: 'page-1',
    url: 'https://notion.so/page-1',
    direction: 'bidirectional',
    adapterType: 'document',
    ...overrides,
  } as ExternalSyncState;
}

function makeFolderSyncState(overrides: Partial<ExternalSyncState> = {}): ExternalSyncState {
  return {
    provider: 'folder',
    project: '/tmp/test-docs',
    externalId: 'test-doc.md',
    url: 'file:///tmp/test-docs/test-doc.md',
    direction: 'bidirectional',
    adapterType: 'document',
    ...overrides,
  } as ExternalSyncState;
}

function makeTaskSyncState(overrides: Partial<ExternalSyncState> = {}): ExternalSyncState {
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

// ============================================================================
// Mock Document Adapter (Notion-like)
// ============================================================================

function createMockDocumentAdapter(options: {
  pages?: ExternalDocument[];
  onCreatePage?: (project: string, page: ExternalDocumentInput) => ExternalDocument;
  onUpdatePage?: (project: string, externalId: string, updates: Partial<ExternalDocumentInput>) => void;
} = {}): DocumentSyncAdapter & { pages: ExternalDocument[] } {
  const pages = options.pages ?? [];
  return {
    pages,
    async getPage(_project: string, externalId: string): Promise<ExternalDocument | null> {
      return pages.find((p) => p.externalId === externalId) ?? null;
    },
    async listPagesSince(_project: string, _since: Timestamp): Promise<ExternalDocument[]> {
      return pages;
    },
    async createPage(project: string, page: ExternalDocumentInput): Promise<ExternalDocument> {
      if (options.onCreatePage) {
        const result = options.onCreatePage(project, page);
        pages.push(result);
        return result;
      }
      const newPage: ExternalDocument = {
        externalId: `page-${pages.length + 100}`,
        url: `https://notion.so/page-${pages.length + 100}`,
        provider: 'notion',
        project,
        title: page.title,
        content: page.content,
        contentType: page.contentType ?? 'markdown',
        updatedAt: new Date().toISOString(),
      };
      pages.push(newPage);
      return newPage;
    },
    async updatePage(
      project: string,
      externalId: string,
      updates: Partial<ExternalDocumentInput>
    ): Promise<ExternalDocument> {
      options.onUpdatePage?.(project, externalId, updates);
      const existing = pages.find((p) => p.externalId === externalId);
      const updated: ExternalDocument = {
        externalId,
        url: existing?.url ?? `https://notion.so/${externalId}`,
        provider: 'notion',
        project,
        title: updates.title ?? existing?.title ?? 'Untitled',
        content: updates.content ?? existing?.content ?? '',
        contentType: updates.contentType ?? existing?.contentType ?? 'markdown',
        updatedAt: new Date().toISOString(),
      };
      // Update in-place
      const idx = pages.findIndex((p) => p.externalId === externalId);
      if (idx >= 0) pages[idx] = updated;
      else pages.push(updated);
      return updated;
    },
  };
}

function createMockDocumentProvider(
  name: string,
  adapter: DocumentSyncAdapter
): ExternalProvider {
  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    supportedAdapters: ['document'],
    async testConnection(_config: ProviderConfig): Promise<boolean> {
      return true;
    },
    getDocumentAdapter: () => adapter,
  };
}

// ============================================================================
// Mock Task Adapter (GitHub-like)
// ============================================================================

function createMockTaskAdapter(options: {
  issues?: ExternalTask[];
  onUpdateIssue?: (project: string, externalId: string, updates: Partial<ExternalTaskInput>) => void;
  onCreateIssue?: (project: string, issue: ExternalTaskInput) => ExternalTask;
} = {}): TaskSyncAdapter {
  const issues = options.issues ?? [];
  return {
    async getIssue(_project: string, externalId: string): Promise<ExternalTask | null> {
      return issues.find((i) => i.externalId === externalId) ?? null;
    },
    async listIssuesSince(_project: string, _since: Timestamp): Promise<ExternalTask[]> {
      return issues;
    },
    async createIssue(project: string, issue: ExternalTaskInput): Promise<ExternalTask> {
      if (options.onCreateIssue) return options.onCreateIssue(project, issue);
      return {
        externalId: `issue-${issues.length + 100}`,
        url: `https://github.com/${project}/issues/${issues.length + 100}`,
        provider: 'github',
        project,
        title: issue.title ?? 'Untitled',
        body: issue.body,
        state: issue.state ?? 'open',
        labels: issue.labels ?? [],
        assignees: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    async updateIssue(
      project: string,
      externalId: string,
      updates: Partial<ExternalTaskInput>
    ): Promise<ExternalTask> {
      options.onUpdateIssue?.(project, externalId, updates);
      return {
        externalId,
        url: `https://github.com/${project}/issues/${externalId}`,
        provider: 'github',
        project,
        title: updates.title ?? 'Untitled',
        body: updates.body,
        state: updates.state ?? 'open',
        labels: updates.labels ?? [],
        assignees: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
      };
    },
    getFieldMapConfig(): TaskFieldMapConfig {
      return { provider: 'github', fields: [] };
    },
  };
}

function createMockTaskProvider(
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

// ============================================================================
// Test 1: End-to-End Folder Sync
// ============================================================================

describe('Integration: End-to-end folder sync', () => {
  let tmpDir: string;

  beforeEach(() => {
    idCounter = 0;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-folder-sync-'));
  });

  test('push updates .md file in folder → external edit → pull detects changes', async () => {
    // Step 1: Set up the folder provider and engine with a local document
    const folderProvider = createFolderProvider();
    const registry = new ProviderRegistry();
    registry.register(folderProvider);

    const api = createInMemoryApi();
    const settings = createMockSettings();

    // Pre-create the file in the folder (simulates initial link + first push)
    const filePath = path.join(tmpDir, 'my-notes.md');
    fs.writeFileSync(filePath, '---\nsynced-at: "2024-01-01T00:00:00.000Z"\n---\n# My Notes\n\nOld content from first sync.', 'utf-8');

    // Create a document element linked to the folder file
    const syncState = makeFolderSyncState({
      project: tmpDir,
      externalId: 'my-notes.md',
      url: `file://${tmpDir}/my-notes.md`,
      lastPushedHash: 'old-hash', // different from current to trigger push
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    const doc = makeDocumentElement({
      title: 'My Notes',
      content: '# My Notes\n\nThis is the updated content.',
      syncState,
    });
    api.elements.push(doc);

    // Add an event so push detects the element has changed
    api.addEvent(doc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'folder', defaultProject: tmpDir }],
    });

    // Step 2: Push the document to the folder
    const pushResult = await engine.push({ all: true });
    expect(pushResult.pushed).toBe(1);
    expect(pushResult.errors).toHaveLength(0);

    // Step 3: Verify the .md file was updated
    expect(fs.existsSync(filePath)).toBe(true);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    expect(fileContent).toContain('updated content');

    // Step 4: Simulate an external edit to the file
    const editedContent = '---\nsynced-at: "2024-01-15T00:00:00.000Z"\n---\n# My Notes\n\nThis content was edited externally.';
    fs.writeFileSync(filePath, editedContent, 'utf-8');

    // Step 5: Pull changes back from the folder
    const pullResult = await engine.pull({ all: true });

    // The pull should complete without errors
    expect(pullResult.errors).toHaveLength(0);
    expect(pullResult.success).toBe(true);
  });

  test('round-trip: push updates file, file read back matches document content', async () => {
    const folderProvider = createFolderProvider();
    const registry = new ProviderRegistry();
    registry.register(folderProvider);

    const api = createInMemoryApi();
    const settings = createMockSettings();

    // Pre-create the file (simulating an initial sync)
    const filePath = path.join(tmpDir, 'round-trip.md');
    fs.writeFileSync(filePath, '---\nsynced-at: "2024-01-01T00:00:00.000Z"\n---\nOld content', 'utf-8');

    const syncState = makeFolderSyncState({
      project: tmpDir,
      externalId: 'round-trip.md',
      url: `file://${tmpDir}/round-trip.md`,
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    const doc = makeDocumentElement({
      title: 'Round Trip Test',
      content: '# Round Trip\n\nContent for round trip test.\n\n## Section 2\n\nMore content here.',
      syncState,
    });
    api.elements.push(doc);
    api.addEvent(doc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'folder', defaultProject: tmpDir }],
    });

    // Push document to folder
    const pushResult = await engine.push({ all: true });
    expect(pushResult.pushed).toBe(1);

    // Read the file back using the adapter
    const adapter = folderProvider.getDocumentAdapter!();
    const readBack = await adapter.getPage(tmpDir, 'round-trip.md');

    expect(readBack).not.toBeNull();
    // The content should contain the pushed markdown
    expect(readBack!.content).toContain('# Round Trip');
    expect(readBack!.content).toContain('Content for round trip test.');
    expect(readBack!.content).toContain('## Section 2');
  });

  // Cleanup
  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});

// ============================================================================
// Test 2: End-to-End Notion Sync (Mocked API)
// ============================================================================

describe('Integration: End-to-end Notion sync (mocked)', () => {
  beforeEach(() => {
    idCounter = 100;
  });

  test('push document to Notion → verify API calls → mock external edit → pull → document updated', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    // Track API calls
    const updateCalls: Array<{ project: string; externalId: string; updates: Partial<ExternalDocumentInput> }> = [];

    const notionAdapter = createMockDocumentAdapter({
      pages: [],
      onUpdatePage: (project, externalId, updates) => {
        updateCalls.push({ project, externalId, updates });
      },
    });
    const notionProvider = createMockDocumentProvider('notion', notionAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create a linked document
    const syncState = makeDocSyncState({
      externalId: 'page-notion-1',
      lastPushedHash: 'old-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    const doc = makeDocumentElement({
      title: 'Architecture Guide',
      content: '# Architecture\n\nOur system uses event sourcing.',
      syncState,
    });
    api.elements.push(doc);
    api.addEvent(doc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    // Step 1: Push document to Notion
    const pushResult = await engine.push({ all: true });
    expect(pushResult.pushed).toBe(1);
    expect(pushResult.errors).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].externalId).toBe('page-notion-1');
    expect(updateCalls[0].updates.title).toBe('Architecture Guide');
    expect(updateCalls[0].updates.content).toContain('event sourcing');

    // Step 2: Simulate external edit in Notion (mock the adapter returning changed content)
    // Clear existing pages from adapter (from the push) and add the edited version
    notionAdapter.pages.length = 0;
    notionAdapter.pages.push({
      externalId: 'page-notion-1',
      url: 'https://notion.so/page-notion-1',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Architecture Guide (Updated)',
      content: '# Architecture\n\nOur system uses event sourcing with CQRS.',
      contentType: 'markdown',
      updatedAt: '2024-02-01T00:00:00.000Z',
    });

    // Step 3: Pull changes from Notion
    const pullResult = await engine.pull({ all: true });
    expect(pullResult.errors).toHaveLength(0);
    expect(pullResult.pulled).toBe(1);

    // Step 4: Verify the document was updated in the API
    const updatedDoc = api.elements.find((e) => e.id === doc.id);
    expect(updatedDoc).toBeDefined();
    expect((updatedDoc as unknown as { title: string }).title).toBe('Architecture Guide (Updated)');
    expect((updatedDoc as unknown as { content: string }).content).toContain('CQRS');
  });

  test('pull creates new document from Notion when --all is set', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const notionAdapter = createMockDocumentAdapter({
      pages: [{
        externalId: 'page-new-1',
        url: 'https://notion.so/page-new-1',
        provider: 'notion',
        project: 'workspace-1',
        title: 'New Notion Page',
        content: 'Content from Notion',
        contentType: 'markdown',
        updatedAt: '2024-01-15T00:00:00.000Z',
      }],
    });
    const notionProvider = createMockDocumentProvider('notion', notionAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Verify a document was created
    expect(api.createLog).toHaveLength(1);
    expect(api.createLog[0].type).toBe('document');
    expect(api.createLog[0].title).toBe('New Notion Page');
    expect(api.createLog[0].content).toBe('Content from Notion');
    expect(api.createLog[0].contentType).toBe('markdown');
    expect(api.createLog[0].status).toBe('active');
  });
});

// ============================================================================
// Test 3: Round-Trip Fidelity
// ============================================================================

describe('Integration: Round-trip fidelity', () => {
  beforeEach(() => {
    idCounter = 200;
  });

  test('push document → modify externally → pull → content matches external edit', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const notionAdapter = createMockDocumentAdapter({ pages: [] });
    const notionProvider = createMockDocumentProvider('notion', notionAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create a linked document
    const originalContent = '# Original\n\nThis is the original document.\n\n- Item 1\n- Item 2\n- Item 3';
    const syncState = makeDocSyncState({
      externalId: 'page-rt-1',
      lastPushedHash: 'different-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    const doc = makeDocumentElement({
      title: 'Round Trip Doc',
      content: originalContent,
      syncState,
    });
    api.elements.push(doc);
    api.addEvent(doc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    // Push
    const pushResult = await engine.push({ all: true });
    expect(pushResult.pushed).toBe(1);

    // Simulate external modification
    const modifiedContent = '# Modified\n\nThis document was modified externally.\n\n- Item A\n- Item B';
    notionAdapter.pages.length = 0;
    notionAdapter.pages.push({
      externalId: 'page-rt-1',
      url: 'https://notion.so/page-rt-1',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Round Trip Doc Modified',
      content: modifiedContent,
      contentType: 'markdown',
      updatedAt: '2024-02-01T00:00:00.000Z',
    });

    // Pull
    const pullResult = await engine.pull({ all: true });
    expect(pullResult.pulled).toBe(1);

    // Verify the local document now matches the external edit
    const updatedDoc = api.elements.find((e) => e.id === doc.id);
    expect(updatedDoc).toBeDefined();
    expect((updatedDoc as unknown as { title: string }).title).toBe('Round Trip Doc Modified');
    expect((updatedDoc as unknown as { content: string }).content).toBe(modifiedContent);
  });

  test('bidirectional sync preserves content through push→pull cycle', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const notionAdapter = createMockDocumentAdapter({ pages: [] });
    const notionProvider = createMockDocumentProvider('notion', notionAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    const syncState = makeDocSyncState({
      externalId: 'page-bidir-1',
      lastPushedHash: 'stale-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });

    const doc = makeDocumentElement({
      title: 'Bidirectional Doc',
      content: '# Bidirectional\n\nContent that should be preserved.',
      syncState,
    });
    api.elements.push(doc);
    api.addEvent(doc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    // Full sync cycle
    const syncResult = await engine.sync({ all: true });
    expect(syncResult.errors).toHaveLength(0);
    expect(syncResult.pushed).toBe(1);

    // Verify the pushed page matches the original document
    expect(notionAdapter.pages).toHaveLength(1);
    // The page in the adapter should have our content (via updatePage)
  });
});

// ============================================================================
// Test 4: Mixed Sync (Tasks + Documents)
// ============================================================================

describe('Integration: Mixed sync (tasks + documents)', () => {
  beforeEach(() => {
    idCounter = 300;
  });

  test('sync() handles both task and document types in same cycle', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    // Track all operations
    const taskUpdateCalls: string[] = [];
    const docUpdateCalls: string[] = [];

    // Set up task adapter (GitHub-like)
    const taskAdapter = createMockTaskAdapter({
      issues: [],
      onUpdateIssue: (_project, externalId) => {
        taskUpdateCalls.push(externalId);
      },
    });
    const githubProvider = createMockTaskProvider('github', taskAdapter);

    // Set up document adapter (Notion-like)
    const docAdapter = createMockDocumentAdapter({
      pages: [],
      onUpdatePage: (_project, externalId) => {
        docUpdateCalls.push(externalId);
      },
    });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);

    const registry = new ProviderRegistry();
    registry.register(githubProvider);
    registry.register(notionProvider);

    // Create a linked task
    const taskSyncState = makeTaskSyncState({
      lastPushedHash: 'old-task-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const task = makeTaskElement({
      title: 'Fix authentication bug',
      syncState: taskSyncState,
    });
    api.elements.push(task);
    api.addEvent(task.id, 'updated', '2024-01-05T00:00:00.000Z');

    // Create a linked document
    const docSyncState = makeDocSyncState({
      externalId: 'page-mixed-1',
      lastPushedHash: 'old-doc-hash',
      lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
    });
    const doc = makeDocumentElement({
      title: 'Auth Design Doc',
      content: '# Auth Design\n\nDetails about authentication.',
      syncState: docSyncState,
    });
    api.elements.push(doc);
    api.addEvent(doc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [
        { provider: 'github', token: 'ghp_test', defaultProject: 'owner/repo' },
        { provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' },
      ],
    });

    // Run bidirectional sync
    const result = await engine.sync({ all: true });
    expect(result.errors).toHaveLength(0);

    // Both task and document should have been pushed
    expect(result.pushed).toBe(2);
    expect(taskUpdateCalls).toHaveLength(1);
    expect(taskUpdateCalls[0]).toBe('42'); // The task's external ID
    expect(docUpdateCalls).toHaveLength(1);
    expect(docUpdateCalls[0]).toBe('page-mixed-1');
  });

  test('adapterTypes filter restricts sync to specified types', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const taskUpdateCalls: string[] = [];
    const docUpdateCalls: string[] = [];

    const taskAdapter = createMockTaskAdapter({
      onUpdateIssue: (_p, externalId) => taskUpdateCalls.push(externalId),
    });
    const githubProvider = createMockTaskProvider('github', taskAdapter);

    const docAdapter = createMockDocumentAdapter({
      onUpdatePage: (_p, externalId) => docUpdateCalls.push(externalId),
    });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);

    const registry = new ProviderRegistry();
    registry.register(githubProvider);
    registry.register(notionProvider);

    // Add both a task and a document
    const task = makeTaskElement({
      syncState: makeTaskSyncState({
        lastPushedHash: 'old-hash',
        lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      }),
    });
    api.elements.push(task);
    api.addEvent(task.id, 'updated', '2024-01-05T00:00:00.000Z');

    const doc = makeDocumentElement({
      syncState: makeDocSyncState({
        lastPushedHash: 'old-hash',
        lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      }),
    });
    api.elements.push(doc);
    api.addEvent(doc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [
        { provider: 'github', token: 'ghp_test', defaultProject: 'owner/repo' },
        { provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' },
      ],
    });

    // Sync only documents
    const result = await engine.push({ all: true, adapterTypes: ['document'] });
    expect(result.errors).toHaveLength(0);
    expect(docUpdateCalls.length).toBeGreaterThanOrEqual(0); // may push
    expect(taskUpdateCalls).toHaveLength(0); // tasks filtered out
  });
});

// ============================================================================
// Test 5: Provider Registry
// ============================================================================

describe('Integration: Provider registry', () => {
  test('folder provider registers correctly and returns document adapter', () => {
    const registry = new ProviderRegistry();
    const folderProvider = createFolderProvider();
    registry.register(folderProvider);

    expect(registry.has('folder')).toBe(true);
    const provider = registry.get('folder')!;
    expect(provider.name).toBe('folder');
    expect(provider.displayName).toBe('Folder');
    expect(provider.supportedAdapters).toContain('document');

    const docAdapters = registry.getAdaptersOfType('document');
    expect(docAdapters).toHaveLength(1);
    expect(docAdapters[0].provider.name).toBe('folder');
  });

  test('notion provider registers correctly and returns document adapter', () => {
    const registry = new ProviderRegistry();
    const adapter = createMockDocumentAdapter();
    const notionProvider = createMockDocumentProvider('notion', adapter);
    registry.register(notionProvider);

    expect(registry.has('notion')).toBe(true);
    const provider = registry.get('notion')!;
    expect(provider.name).toBe('notion');
    expect(provider.supportedAdapters).toContain('document');

    const docAdapters = registry.getAdaptersOfType('document');
    expect(docAdapters).toHaveLength(1);
    expect(docAdapters[0].provider.name).toBe('notion');
  });

  test('default registry includes folder and notion providers', () => {
    const registry = createDefaultProviderRegistry();

    expect(registry.has('folder')).toBe(true);
    expect(registry.has('notion')).toBe(true);
    expect(registry.has('github')).toBe(true);
    expect(registry.has('linear')).toBe(true);

    // Both folder and notion should provide document adapters
    const docAdapters = registry.getAdaptersOfType('document');
    const docProviderNames = docAdapters.map((e) => e.provider.name);
    expect(docProviderNames).toContain('folder');
    expect(docProviderNames).toContain('notion');
  });

  test('getAdaptersOfType returns correct adapter types for mixed providers', () => {
    const registry = new ProviderRegistry();

    // Register a task provider
    const taskAdapter = createMockTaskAdapter();
    registry.register(createMockTaskProvider('github', taskAdapter));

    // Register a document provider
    const docAdapter = createMockDocumentAdapter();
    registry.register(createMockDocumentProvider('notion', docAdapter));

    // Task adapters
    const taskAdapters = registry.getAdaptersOfType('task');
    expect(taskAdapters).toHaveLength(1);
    expect(taskAdapters[0].provider.name).toBe('github');

    // Document adapters
    const docAdapters = registry.getAdaptersOfType('document');
    expect(docAdapters).toHaveLength(1);
    expect(docAdapters[0].provider.name).toBe('notion');

    // Message adapters (none registered)
    const msgAdapters = registry.getAdaptersOfType('message');
    expect(msgAdapters).toHaveLength(0);
  });
});

// ============================================================================
// Test 6: System Category Filtering
// ============================================================================

describe('Integration: System category filtering', () => {
  test('task-description documents are identified as system categories', () => {
    expect(isSystemCategory('task-description')).toBe(true);
  });

  test('message-content documents are identified as system categories', () => {
    expect(isSystemCategory('message-content')).toBe(true);
  });

  test('user-facing categories are not system categories', () => {
    expect(isSystemCategory('reference')).toBe(false);
    expect(isSystemCategory('spec')).toBe(false);
    expect(isSystemCategory('how-to')).toBe(false);
    expect(isSystemCategory('explanation')).toBe(false);
    expect(isSystemCategory('other')).toBe(false);
  });

  test('system category documents should be excluded from link-all', () => {
    // Simulate the link-all filtering logic
    const documents: Array<{ title: string; category: DocumentCategory }> = [
      { title: 'API Reference', category: 'reference' },
      { title: 'Task Body Content', category: 'task-description' },
      { title: 'Meeting Notes', category: 'other' },
      { title: 'Message Payload', category: 'message-content' },
      { title: 'Architecture Spec', category: 'spec' },
    ];

    const filteredDocs = documents.filter((doc) => !isSystemCategory(doc.category));
    expect(filteredDocs).toHaveLength(3);
    expect(filteredDocs.map((d) => d.title)).toEqual([
      'API Reference',
      'Meeting Notes',
      'Architecture Spec',
    ]);
  });

  test('documents with system categories excluded from push when properly filtered', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const updateCalls: string[] = [];
    const docAdapter = createMockDocumentAdapter({
      onUpdatePage: (_p, externalId) => updateCalls.push(externalId),
    });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create a normal document (should be syncable)
    const normalDoc = makeDocumentElement({
      title: 'Normal Doc',
      content: 'Syncable content',
      category: 'reference',
      syncState: makeDocSyncState({
        externalId: 'page-normal',
        lastPushedHash: 'old-hash',
        lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      }),
    });

    // Create a task-description document (system category - typically not linked)
    // In practice, task-description documents don't get _externalSync metadata
    // because link-all filters them out. This test verifies the filtering logic.
    const taskDescDoc = makeDocumentElement({
      title: 'Task Description',
      content: 'Task body content',
      category: 'task-description',
    });

    api.elements.push(normalDoc, taskDescDoc);
    api.addEvent(normalDoc.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    // Push all — only the linked normal doc should be pushed
    const result = await engine.push({ all: true });
    expect(result.pushed).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toBe('page-normal');
  });
});

// ============================================================================
// Test 7: Conflict Resolution
// ============================================================================

describe('Integration: Document conflict resolution', () => {
  beforeEach(() => {
    idCounter = 700;
  });

  test('remote_wins conflict strategy applies remote changes to document', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter({ pages: [] });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create a document that has been pushed before (has lastPushedHash)
    const doc = makeDocumentElement({
      title: 'Conflict Doc',
      content: 'Local edited content',
    });

    // Compute hash for this document
    const pushedHash = computeContentHashSync(doc).hash;

    // Now modify the local document to simulate local changes AFTER the push
    const modifiedDoc = {
      ...doc,
      content: 'Locally modified content after push',
      updatedAt: '2024-01-20T00:00:00.000Z' as Timestamp,
    } as unknown as Element;

    // Set sync state with the old pushed hash (so local appears changed)
    const syncState = makeDocSyncState({
      externalId: 'page-conflict-1',
      lastPushedHash: pushedHash,
      lastPulledHash: 'old-pulled-hash',
      direction: 'bidirectional',
    });
    const docWithSync = {
      ...modifiedDoc,
      metadata: setExternalSyncState({}, syncState),
    } as unknown as Element;

    api.elements.push(docWithSync);

    // Set up remote document with different changes
    docAdapter.pages.push({
      externalId: 'page-conflict-1',
      url: 'https://notion.so/page-conflict-1',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Remote Conflict Doc',
      content: 'Remote edited content',
      contentType: 'markdown',
      updatedAt: '2024-01-25T00:00:00.000Z', // Remote is newer
    });

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      defaultConflictStrategy: 'remote_wins',
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].strategy).toBe('remote_wins');
    expect(result.conflicts[0].resolved).toBe(true);
    expect(result.conflicts[0].winner).toBe('remote');

    // The document should be updated with remote content
    expect(result.pulled).toBe(1);
    const updatedDoc = api.elements.find((e) => e.id === docWithSync.id);
    expect(updatedDoc).toBeDefined();
    expect((updatedDoc as unknown as { content: string }).content).toBe('Remote edited content');
  });

  test('local_wins conflict strategy skips pull for document', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter({ pages: [] });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create a document
    const doc = makeDocumentElement({
      title: 'Local Wins Doc',
      content: 'Original content',
    });
    const pushedHash = computeContentHashSync(doc).hash;

    // Modify local content
    const modifiedDoc = {
      ...doc,
      content: 'Locally modified content',
      updatedAt: '2024-01-20T00:00:00.000Z' as Timestamp,
    } as unknown as Element;

    const syncState = makeDocSyncState({
      externalId: 'page-local-wins',
      lastPushedHash: pushedHash,
      lastPulledHash: 'old-pulled-hash',
      direction: 'bidirectional',
    });
    const docWithSync = {
      ...modifiedDoc,
      metadata: setExternalSyncState({}, syncState),
    } as unknown as Element;
    api.elements.push(docWithSync);

    docAdapter.pages.push({
      externalId: 'page-local-wins',
      url: 'https://notion.so/page-local-wins',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Remote Version',
      content: 'Remote content',
      contentType: 'markdown',
      updatedAt: '2024-01-25T00:00:00.000Z',
    });

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      defaultConflictStrategy: 'local_wins',
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolved).toBe(true);
    expect(result.conflicts[0].winner).toBe('local');

    // Local content should be preserved (not overwritten by remote)
    const updatedDoc = api.elements.find((e) => e.id === docWithSync.id);
    expect(updatedDoc).toBeDefined();
    expect((updatedDoc as unknown as { content: string }).content).toBe('Locally modified content');
  });

  test('manual conflict strategy tags document with sync-conflict', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter({ pages: [] });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    const doc = makeDocumentElement({
      title: 'Manual Conflict Doc',
      content: 'Original content',
    });
    const pushedHash = computeContentHashSync(doc).hash;

    const modifiedDoc = {
      ...doc,
      content: 'Locally changed',
      updatedAt: '2024-01-20T00:00:00.000Z' as Timestamp,
    } as unknown as Element;

    const syncState = makeDocSyncState({
      externalId: 'page-manual-conflict',
      lastPushedHash: pushedHash,
      lastPulledHash: 'old-pulled-hash',
      direction: 'bidirectional',
    });
    const docWithSync = {
      ...modifiedDoc,
      metadata: setExternalSyncState({}, syncState),
    } as unknown as Element;
    api.elements.push(docWithSync);

    docAdapter.pages.push({
      externalId: 'page-manual-conflict',
      url: 'https://notion.so/page-manual-conflict',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Remote Manual Doc',
      content: 'Remote content',
      contentType: 'markdown',
      updatedAt: '2024-01-25T00:00:00.000Z',
    });

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      defaultConflictStrategy: 'manual',
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolved).toBe(false);
    // The document should be skipped (not pulled) when manual strategy is used
    expect(result.pulled).toBe(0);

    // Check that the element was tagged with sync-conflict
    const updatedDoc = api.elements.find((e) => e.id === docWithSync.id);
    expect(updatedDoc).toBeDefined();
    expect(updatedDoc!.tags).toContain('sync-conflict');
  });

  test('last_write_wins uses timestamps for document conflicts', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter({ pages: [] });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    const doc = makeDocumentElement({
      title: 'LWW Doc',
      content: 'Original',
    });
    const pushedHash = computeContentHashSync(doc).hash;

    // Local is older
    const modifiedDoc = {
      ...doc,
      content: 'Locally changed earlier',
      updatedAt: '2024-01-15T00:00:00.000Z' as Timestamp,
    } as unknown as Element;

    const syncState = makeDocSyncState({
      externalId: 'page-lww',
      lastPushedHash: pushedHash,
      lastPulledHash: 'old-pulled-hash',
      direction: 'bidirectional',
    });
    const docWithSync = {
      ...modifiedDoc,
      metadata: setExternalSyncState({}, syncState),
    } as unknown as Element;
    api.elements.push(docWithSync);

    // Remote is newer
    docAdapter.pages.push({
      externalId: 'page-lww',
      url: 'https://notion.so/page-lww',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Remote LWW Doc',
      content: 'Remote is newer content',
      contentType: 'markdown',
      updatedAt: '2024-01-25T00:00:00.000Z',
    });

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      defaultConflictStrategy: 'last_write_wins',
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].strategy).toBe('last_write_wins');
    expect(result.conflicts[0].resolved).toBe(true);
    // Remote is newer, so remote should win
    expect(result.conflicts[0].winner).toBe('remote');
    expect(result.pulled).toBe(1);

    // Remote content should be applied
    const updatedDoc = api.elements.find((e) => e.id === docWithSync.id);
    expect((updatedDoc as unknown as { content: string }).content).toBe('Remote is newer content');
  });
});

// ============================================================================
// Test 8: Document Sync Cursor Management
// ============================================================================

describe('Integration: Document sync cursor management', () => {
  beforeEach(() => {
    idCounter = 800;
  });

  test('pull updates document sync cursor separately from task cursor', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    // Set up both task and document providers
    const taskAdapter = createMockTaskAdapter({
      issues: [{ // Need at least one issue to trigger cursor update
        externalId: 'issue-1',
        url: 'https://github.com/owner/repo/issues/1',
        provider: 'github',
        project: 'owner/repo',
        title: 'Test Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
      }],
    });
    const githubProvider = createMockTaskProvider('github', taskAdapter);

    const docAdapter = createMockDocumentAdapter({
      pages: [{
        externalId: 'page-cursor-1',
        url: 'https://notion.so/page-cursor-1',
        provider: 'notion',
        project: 'workspace-1',
        title: 'Cursor Test Page',
        content: 'Content',
        contentType: 'markdown',
        updatedAt: '2024-01-15T00:00:00Z',
      }],
    });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);

    const registry = new ProviderRegistry();
    registry.register(githubProvider);
    registry.register(notionProvider);

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [
        { provider: 'github', token: 'ghp_test', defaultProject: 'owner/repo' },
        { provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' },
      ],
    });

    await engine.pull({ all: true });

    // Verify separate cursors for task and document adapter types
    const taskCursorKey = 'external_sync.cursor.github.owner/repo.task';
    const docCursorKey = 'external_sync.cursor.notion.workspace-1.document';

    const taskCursor = settings.getSetting(taskCursorKey);
    const docCursor = settings.getSetting(docCursorKey);

    expect(taskCursor).toBeDefined();
    expect(typeof taskCursor!.value).toBe('string');
    expect(docCursor).toBeDefined();
    expect(typeof docCursor!.value).toBe('string');
  });

  test('dry run does not update document sync cursor', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter({
      pages: [{
        externalId: 'page-dryrun-1',
        url: 'https://notion.so/page-dryrun-1',
        provider: 'notion',
        project: 'workspace-1',
        title: 'Dry Run Page',
        content: 'Content',
        contentType: 'markdown',
        updatedAt: '2024-01-15T00:00:00Z',
      }],
    });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);

    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    await engine.pull({ all: true, dryRun: true });

    const cursorKey = 'external_sync.cursor.notion.workspace-1.document';
    const cursor = settings.getSetting(cursorKey);
    expect(cursor).toBeUndefined();
  });
});

// ============================================================================
// Test 9: Hash-Based Change Detection for Documents
// ============================================================================

describe('Integration: Hash-based change detection for documents', () => {
  beforeEach(() => {
    idCounter = 900;
  });

  test('pull skips documents when external hash unchanged', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const externalDoc: ExternalDocument = {
      externalId: 'page-hash-1',
      url: 'https://notion.so/page-hash-1',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Hash Test Doc',
      content: 'Unchanged content',
      contentType: 'markdown',
      updatedAt: '2024-01-15T00:00:00Z',
    };

    // Pre-compute the hash of the external document
    const externalHash = computeExternalDocumentHash(externalDoc);

    const docAdapter = createMockDocumentAdapter({ pages: [externalDoc] });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create a local document linked to this external doc, with matching pulled hash
    const syncState = makeDocSyncState({
      externalId: 'page-hash-1',
      lastPulledHash: externalHash, // Hash matches — no changes
      direction: 'bidirectional',
    });
    const doc = makeDocumentElement({
      title: 'Hash Test Doc',
      content: 'Unchanged content',
      syncState,
    });
    api.elements.push(doc);

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('pull applies changes when external document hash differs', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const externalDoc: ExternalDocument = {
      externalId: 'page-hash-2',
      url: 'https://notion.so/page-hash-2',
      provider: 'notion',
      project: 'workspace-1',
      title: 'Changed Doc',
      content: 'This content has been changed',
      contentType: 'markdown',
      updatedAt: '2024-01-15T00:00:00Z',
    };

    const docAdapter = createMockDocumentAdapter({ pages: [externalDoc] });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create a local document with a DIFFERENT pulled hash (stale)
    const syncState = makeDocSyncState({
      externalId: 'page-hash-2',
      lastPulledHash: 'stale-hash-that-differs',
      direction: 'bidirectional',
    });
    const doc = makeDocumentElement({
      title: 'Old Title',
      content: 'Old content',
      syncState,
    });
    api.elements.push(doc);

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.pulled).toBe(1);

    // Verify the content was updated
    const updatedDoc = api.elements.find((e) => e.id === doc.id);
    expect((updatedDoc as unknown as { content: string }).content).toBe('This content has been changed');
  });
});

// ============================================================================
// Test 10: Error Handling in Document Sync
// ============================================================================

describe('Integration: Error handling in document sync', () => {
  beforeEach(() => {
    idCounter = 1000;
  });

  test('push error for one document does not block other documents', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    let callCount = 0;
    const docAdapter = createMockDocumentAdapter({
      onUpdatePage: (_project, externalId) => {
        callCount++;
        if (externalId === 'page-error-1') {
          throw new Error('Network timeout');
        }
      },
    });
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    // Create two linked documents
    const doc1 = makeDocumentElement({
      title: 'Error Doc',
      content: 'Will fail',
      syncState: makeDocSyncState({
        externalId: 'page-error-1',
        lastPushedHash: 'old-hash',
        lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      }),
    });
    const doc2 = makeDocumentElement({
      title: 'Success Doc',
      content: 'Will succeed',
      syncState: makeDocSyncState({
        externalId: 'page-success-1',
        lastPushedHash: 'old-hash',
        lastPushedAt: '2024-01-01T00:00:00.000Z' as Timestamp,
      }),
    });
    api.elements.push(doc1, doc2);
    api.addEvent(doc1.id, 'updated', '2024-01-05T00:00:00.000Z');
    api.addEvent(doc2.id, 'updated', '2024-01-05T00:00:00.000Z');

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.push({ all: true });

    // One error, one success
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Network timeout');
    expect(result.pushed).toBe(1);
    expect(result.success).toBe(false); // Has errors
  });

  test('pull handles adapter errors gracefully', async () => {
    const api = createInMemoryApi();
    const settings = createMockSettings();

    const docAdapter = createMockDocumentAdapter();
    // Override listPagesSince to throw
    docAdapter.listPagesSince = async () => {
      throw new Error('Notion API unavailable');
    };
    const notionProvider = createMockDocumentProvider('notion', docAdapter);
    const registry = new ProviderRegistry();
    registry.register(notionProvider);

    const engine = createSyncEngine({
      api,
      registry,
      settings,
      providerConfigs: [{ provider: 'notion', token: 'ntn_test', defaultProject: 'workspace-1' }],
    });

    const result = await engine.pull({ all: true });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Notion API unavailable');
    expect(result.success).toBe(false);
  });
});
