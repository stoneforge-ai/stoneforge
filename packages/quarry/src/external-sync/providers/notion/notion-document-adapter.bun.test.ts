/**
 * Notion Document Adapter Tests
 *
 * Tests for the NotionDocumentAdapter and NotionProvider.
 * Uses a mocked NotionApiClient to test document sync operations:
 * - getPage: properties + blocks → ExternalDocument
 * - listPagesSince: database query → ExternalDocument[]
 * - createPage: markdown → blocks → API call (with schema discovery)
 * - updatePage: properties + content replacement (with schema discovery)
 * - getDatabaseSchema: schema discovery and caching
 * - Provider testConnection
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import type {
  ExternalDocument,
  ExternalDocumentInput,
  ProviderConfig,
} from '@stoneforge/core';
import type {
  NotionPage,
  NotionBlock,
  NotionRichText,
  NotionAnnotations,
  NotionDatabaseQueryResponse,
  NotionBlockChildrenResponse,
  NotionDatabase,
  NotionDatabaseProperty,
} from './notion-types.js';
import {
  NotionDocumentAdapter,
  extractTitleFromProperties,
  buildPageProperties,
  createNotionDocumentAdapter,
} from './notion-document-adapter.js';
import {
  createNotionProvider,
  createNotionPlaceholderProvider,
} from './notion-provider.js';
import { NotionApiClient, NotionApiError } from './notion-api.js';

// ============================================================================
// Test Helpers
// ============================================================================

const DEFAULT_ANNOTATIONS: NotionAnnotations = {
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  code: false,
  color: 'default',
};

/** Creates a mock Notion page */
function createMockPage(overrides: Partial<NotionPage> = {}): NotionPage {
  return {
    id: 'page-uuid-1234',
    object: 'page',
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-15T12:00:00.000Z',
    archived: false,
    url: 'https://www.notion.so/Test-Page-page-uuid-1234',
    public_url: null,
    properties: {
      Title: {
        id: 'title-prop',
        type: 'title',
        title: [
          {
            type: 'text',
            plain_text: 'Test Page',
            text: { content: 'Test Page', link: null },
            annotations: { ...DEFAULT_ANNOTATIONS },
            href: null,
          },
        ],
      },
      Category: {
        id: 'cat-prop',
        type: 'select',
        select: { id: 'cat-1', name: 'Reference', color: 'blue' },
      },
      Tags: {
        id: 'tags-prop',
        type: 'multi_select',
        multi_select: [
          { id: 'tag-1', name: 'api', color: 'green' },
          { id: 'tag-2', name: 'docs', color: 'red' },
        ],
      },
    },
    parent: { type: 'database_id', database_id: 'db-uuid-5678' },
    ...overrides,
  };
}

/** Creates mock Notion blocks representing simple markdown content */
function createMockBlocks(): NotionBlock[] {
  return [
    {
      id: 'block-1',
      type: 'heading_1',
      has_children: false,
      heading_1: {
        rich_text: [
          {
            type: 'text',
            plain_text: 'Introduction',
            text: { content: 'Introduction', link: null },
            annotations: { ...DEFAULT_ANNOTATIONS },
            href: null,
          },
        ],
      },
    },
    {
      id: 'block-2',
      type: 'paragraph',
      has_children: false,
      paragraph: {
        rich_text: [
          {
            type: 'text',
            plain_text: 'This is a test paragraph.',
            text: { content: 'This is a test paragraph.', link: null },
            annotations: { ...DEFAULT_ANNOTATIONS },
            href: null,
          },
        ],
      },
    },
  ];
}

/**
 * Creates a mock Notion database with the given title property name.
 * Includes Category (select) and Tags (multi_select) by default.
 */
function createMockDatabase(overrides?: {
  titlePropertyName?: string;
  includeCategory?: boolean;
  includeTags?: boolean;
}): NotionDatabase {
  const titleName = overrides?.titlePropertyName ?? 'Title';
  const includeCategory = overrides?.includeCategory ?? true;
  const includeTags = overrides?.includeTags ?? true;

  const properties: Record<string, NotionDatabaseProperty> = {
    [titleName]: {
      id: 'title-prop',
      type: 'title',
      name: titleName,
    },
  };

  if (includeCategory) {
    properties.Category = {
      id: 'cat-prop',
      type: 'select',
      name: 'Category',
      select: { options: [{ id: 'opt-1', name: 'Reference', color: 'blue' }] },
    };
  }

  if (includeTags) {
    properties.Tags = {
      id: 'tags-prop',
      type: 'multi_select',
      name: 'Tags',
      multi_select: { options: [{ id: 'opt-2', name: 'api', color: 'green' }] },
    };
  }

  return {
    id: 'db-uuid-5678',
    object: 'database',
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-15T12:00:00.000Z',
    title: [
      {
        type: 'text',
        plain_text: 'Test Database',
        text: { content: 'Test Database', link: null },
        annotations: { ...DEFAULT_ANNOTATIONS },
        href: null,
      },
    ],
    properties,
    archived: false,
    url: 'https://www.notion.so/Test-Database-db-uuid-5678',
  };
}

/**
 * Creates a mock NotionApiClient with all methods replaced by mock functions.
 * Returns both the mock client and references to the individual mock functions.
 */
function createMockApiClient(dbOverrides?: Parameters<typeof createMockDatabase>[0]) {
  const mockGetPage = mock(() => Promise.resolve(createMockPage()));
  const mockGetBlocks = mock(() => Promise.resolve(createMockBlocks()));
  const mockCreatePage = mock(() => Promise.resolve(createMockPage()));
  const mockUpdatePage = mock(() => Promise.resolve(createMockPage()));
  const mockUpdatePageContent = mock(() => Promise.resolve(createMockBlocks()));
  const mockAppendBlocks = mock(() => Promise.resolve([] as NotionBlock[]));
  const mockQueryDatabase = mock(() =>
    Promise.resolve({
      object: 'list' as const,
      results: [createMockPage()],
      has_more: false,
      next_cursor: null,
      type: 'page_or_database' as const,
    } satisfies NotionDatabaseQueryResponse)
  );
  const mockQueryDatabaseAll = mock(() =>
    Promise.resolve([createMockPage()])
  );

  const mockDb = createMockDatabase(dbOverrides);
  const mockGetDatabase = mock(() => Promise.resolve(mockDb));
  const mockUpdateDatabase = mock(() => Promise.resolve(mockDb));

  // Create a minimal mock (can't construct a real client without a token)
  const client = {
    getPage: mockGetPage,
    getBlocks: mockGetBlocks,
    createPage: mockCreatePage,
    updatePage: mockUpdatePage,
    updatePageContent: mockUpdatePageContent,
    appendBlocks: mockAppendBlocks,
    queryDatabase: mockQueryDatabase,
    queryDatabaseAll: mockQueryDatabaseAll,
    getDatabase: mockGetDatabase,
    updateDatabase: mockUpdateDatabase,
    getRateLimitState: mock(() => ({
      wasRateLimited: false,
      lastRetryAfterSeconds: null,
      totalRateLimitHits: 0,
    })),
  } as unknown as NotionApiClient;

  return {
    client,
    mocks: {
      getPage: mockGetPage,
      getBlocks: mockGetBlocks,
      createPage: mockCreatePage,
      updatePage: mockUpdatePage,
      updatePageContent: mockUpdatePageContent,
      appendBlocks: mockAppendBlocks,
      queryDatabase: mockQueryDatabase,
      queryDatabaseAll: mockQueryDatabaseAll,
      getDatabase: mockGetDatabase,
      updateDatabase: mockUpdateDatabase,
    },
  };
}

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('extractTitleFromProperties', () => {
  test('extracts title from a title property', () => {
    const properties = {
      Title: {
        id: 'title-prop',
        type: 'title',
        title: [
          {
            type: 'text' as const,
            plain_text: 'My Document',
            text: { content: 'My Document', link: null },
            annotations: { ...DEFAULT_ANNOTATIONS },
            href: null,
          },
        ],
      },
    };

    expect(extractTitleFromProperties(properties)).toBe('My Document');
  });

  test('concatenates multiple rich text segments', () => {
    const properties = {
      Name: {
        id: 'title-prop',
        type: 'title',
        title: [
          {
            type: 'text' as const,
            plain_text: 'Hello ',
            text: { content: 'Hello ', link: null },
            annotations: { ...DEFAULT_ANNOTATIONS },
            href: null,
          },
          {
            type: 'text' as const,
            plain_text: 'World',
            text: { content: 'World', link: null },
            annotations: { ...DEFAULT_ANNOTATIONS, bold: true },
            href: null,
          },
        ],
      },
    };

    expect(extractTitleFromProperties(properties)).toBe('Hello World');
  });

  test('returns empty string when no title property exists', () => {
    const properties = {
      Category: {
        id: 'cat-prop',
        type: 'select',
        select: { id: 'cat-1', name: 'Test', color: 'blue' },
      },
    };

    expect(extractTitleFromProperties(properties)).toBe('');
  });

  test('returns empty string when title array is empty', () => {
    const properties = {
      Title: {
        id: 'title-prop',
        type: 'title',
        title: [] as readonly NotionRichText[],
      },
    };

    expect(extractTitleFromProperties(properties)).toBe('');
  });
});

describe('buildPageProperties', () => {
  // Schema with all properties available
  const fullSchema: import('./notion-types.js').NotionDatabaseSchema = {
    titlePropertyName: 'Name',
    hasCategoryProperty: true,
    hasTagsProperty: true,
  };

  // Schema with no Category or Tags
  const titleOnlySchema: import('./notion-types.js').NotionDatabaseSchema = {
    titlePropertyName: 'Name',
    hasCategoryProperty: false,
    hasTagsProperty: false,
  };

  test('creates title-only properties using schema title name', () => {
    const props = buildPageProperties('My Page', fullSchema);
    expect(props).toEqual({
      Name: {
        title: [{ text: { content: 'My Page' } }],
      },
    });
  });

  test('uses custom title property name from schema', () => {
    const customSchema: import('./notion-types.js').NotionDatabaseSchema = {
      titlePropertyName: 'Document Title',
      hasCategoryProperty: true,
      hasTagsProperty: true,
    };
    const props = buildPageProperties('My Page', customSchema);
    expect(props).toEqual({
      'Document Title': {
        title: [{ text: { content: 'My Page' } }],
      },
    });
  });

  test('includes category when schema has Category property', () => {
    const props = buildPageProperties('My Page', fullSchema, 'Reference');
    expect(props).toEqual({
      Name: {
        title: [{ text: { content: 'My Page' } }],
      },
      Category: {
        select: { name: 'Reference' },
      },
    });
  });

  test('includes tags when schema has Tags property', () => {
    const props = buildPageProperties('My Page', fullSchema, undefined, ['api', 'docs']);
    expect(props).toEqual({
      Name: {
        title: [{ text: { content: 'My Page' } }],
      },
      Tags: {
        multi_select: [{ name: 'api' }, { name: 'docs' }],
      },
    });
  });

  test('includes all properties when all provided and schema has them', () => {
    const props = buildPageProperties('My Page', fullSchema, 'How-To', ['guide', 'setup']);
    expect(props).toEqual({
      Name: {
        title: [{ text: { content: 'My Page' } }],
      },
      Category: {
        select: { name: 'How-To' },
      },
      Tags: {
        multi_select: [{ name: 'guide' }, { name: 'setup' }],
      },
    });
  });

  test('skips tags when empty array', () => {
    const props = buildPageProperties('My Page', fullSchema, undefined, []);
    expect(props).toEqual({
      Name: {
        title: [{ text: { content: 'My Page' } }],
      },
    });
  });

  test('skips Category when schema says it does not exist', () => {
    const props = buildPageProperties('Test', titleOnlySchema, 'Reference');
    expect(props).toEqual({
      Name: { title: [{ text: { content: 'Test' } }] },
    });
    expect(props.Category).toBeUndefined();
  });

  test('skips Tags when schema says it does not exist', () => {
    const props = buildPageProperties('Test', titleOnlySchema, undefined, ['api', 'docs']);
    expect(props).toEqual({
      Name: { title: [{ text: { content: 'Test' } }] },
    });
    expect(props.Tags).toBeUndefined();
  });

  test('skips both Category and Tags when schema has neither', () => {
    const props = buildPageProperties('Test', titleOnlySchema, 'Reference', ['api']);
    expect(props).toEqual({
      Name: { title: [{ text: { content: 'Test' } }] },
    });
    expect(props.Category).toBeUndefined();
    expect(props.Tags).toBeUndefined();
  });

  test('includes Category but skips Tags when schema has only Category', () => {
    const partialSchema: import('./notion-types.js').NotionDatabaseSchema = {
      titlePropertyName: 'Name',
      hasCategoryProperty: true,
      hasTagsProperty: false,
    };
    const props = buildPageProperties('Test', partialSchema, 'Reference', ['api']);
    expect(props.Category).toEqual({ select: { name: 'Reference' } });
    expect(props.Tags).toBeUndefined();
  });
});

// ============================================================================
// NotionDocumentAdapter Tests
// ============================================================================

describe('NotionDocumentAdapter', () => {
  let adapter: NotionDocumentAdapter;
  let mockApi: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    mockApi = createMockApiClient();
    adapter = new NotionDocumentAdapter(mockApi.client);
  });

  describe('getDatabaseSchema', () => {
    test('discovers title property named "Title" (default mock)', async () => {
      const schema = await adapter.getDatabaseSchema('db-uuid-5678');

      expect(schema.titlePropertyName).toBe('Title');
      expect(schema.hasCategoryProperty).toBe(true);
      expect(schema.hasTagsProperty).toBe(true);

      expect(mockApi.mocks.getDatabase).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.getDatabase).toHaveBeenCalledWith('db-uuid-5678');
      expect(mockApi.mocks.updateDatabase).not.toHaveBeenCalled();
    });

    test('discovers title property with custom name (e.g., "Document Title")', async () => {
      const customApi = createMockApiClient({ titlePropertyName: 'Document Title' });
      const customAdapter = new NotionDocumentAdapter(customApi.client);

      const schema = await customAdapter.getDatabaseSchema('db-uuid-5678');
      expect(schema.titlePropertyName).toBe('Document Title');
    });

    test('discovers title property named "Name" (Notion default)', async () => {
      const nameApi = createMockApiClient({ titlePropertyName: 'Name' });
      const nameAdapter = new NotionDocumentAdapter(nameApi.client);

      const schema = await nameAdapter.getDatabaseSchema('db-uuid-5678');
      expect(schema.titlePropertyName).toBe('Name');
    });

    test('caches schema — only one getDatabase call per database', async () => {
      await adapter.getDatabaseSchema('db-uuid-5678');
      await adapter.getDatabaseSchema('db-uuid-5678');
      await adapter.getDatabaseSchema('db-uuid-5678');

      expect(mockApi.mocks.getDatabase).toHaveBeenCalledTimes(1);
    });

    test('caches per database ID — different IDs get separate calls', async () => {
      await adapter.getDatabaseSchema('db-1');
      await adapter.getDatabaseSchema('db-2');

      expect(mockApi.mocks.getDatabase).toHaveBeenCalledTimes(2);
    });

    test('throws when database has no title property', async () => {
      const brokenDb = createMockDatabase();
      const properties: Record<string, NotionDatabaseProperty> = {
        Category: { id: 'cat', type: 'select', name: 'Category', select: { options: [] } },
      };
      const brokenApi = createMockApiClient();
      (brokenApi.mocks.getDatabase as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve({ ...brokenDb, properties })
      );
      const brokenAdapter = new NotionDocumentAdapter(brokenApi.client);

      await expect(brokenAdapter.getDatabaseSchema('db-uuid-5678')).rejects.toThrow(
        /no title property/i
      );
    });

    test('auto-creates Category and Tags when missing', async () => {
      const noPropApi = createMockApiClient({
        includeCategory: false,
        includeTags: false,
      });
      const updatedDb = createMockDatabase({
        includeCategory: true,
        includeTags: true,
      });
      (noPropApi.mocks.updateDatabase as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(updatedDb)
      );
      const noPropAdapter = new NotionDocumentAdapter(noPropApi.client);

      const schema = await noPropAdapter.getDatabaseSchema('db-uuid-5678');

      expect(noPropApi.mocks.updateDatabase).toHaveBeenCalledTimes(1);
      const [dbId, updates] = noPropApi.mocks.updateDatabase.mock.calls[0];
      expect(dbId).toBe('db-uuid-5678');
      expect(updates.properties).toHaveProperty('Category');
      expect(updates.properties).toHaveProperty('Tags');
      expect(schema.hasCategoryProperty).toBe(true);
      expect(schema.hasTagsProperty).toBe(true);
    });

    test('auto-creates only Category when only Tags exists', async () => {
      const partialApi = createMockApiClient({
        includeCategory: false,
        includeTags: true,
      });
      const updatedDb = createMockDatabase({ includeCategory: true, includeTags: true });
      (partialApi.mocks.updateDatabase as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(updatedDb)
      );
      const partialAdapter = new NotionDocumentAdapter(partialApi.client);

      await partialAdapter.getDatabaseSchema('db-uuid-5678');

      expect(partialApi.mocks.updateDatabase).toHaveBeenCalledTimes(1);
      const [, updates] = partialApi.mocks.updateDatabase.mock.calls[0];
      expect(updates.properties).toHaveProperty('Category');
      expect(updates.properties).not.toHaveProperty('Tags');
    });

    test('skips gracefully when updateDatabase fails (permission error)', async () => {
      const noPropApi = createMockApiClient({
        includeCategory: false,
        includeTags: false,
      });
      (noPropApi.mocks.updateDatabase as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.reject(new NotionApiError('Forbidden', 403, 'restricted_resource'))
      );
      const noPropAdapter = new NotionDocumentAdapter(noPropApi.client);

      const schema = await noPropAdapter.getDatabaseSchema('db-uuid-5678');

      expect(schema.titlePropertyName).toBe('Title');
      expect(schema.hasCategoryProperty).toBe(false);
      expect(schema.hasTagsProperty).toBe(false);
    });
  });

  describe('getPage', () => {
    test('fetches page properties and blocks, returns ExternalDocument', async () => {
      const doc = await adapter.getPage('db-uuid-5678', 'page-uuid-1234');

      expect(doc).not.toBeNull();
      expect(doc!.externalId).toBe('page-uuid-1234');
      expect(doc!.url).toBe('https://www.notion.so/Test-Page-page-uuid-1234');
      expect(doc!.provider).toBe('notion');
      expect(doc!.project).toBe('db-uuid-5678');
      expect(doc!.title).toBe('Test Page');
      expect(doc!.contentType).toBe('markdown');
      expect(doc!.updatedAt).toBe('2024-01-15T12:00:00.000Z');

      expect(mockApi.mocks.getPage).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.getPage).toHaveBeenCalledWith('page-uuid-1234');
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledWith('page-uuid-1234');
    });

    test('converts blocks to markdown content', async () => {
      const doc = await adapter.getPage('db-uuid-5678', 'page-uuid-1234');

      expect(doc).not.toBeNull();
      expect(doc!.content).toContain('# Introduction');
      expect(doc!.content).toContain('This is a test paragraph.');
    });

    test('returns null for not-found errors', async () => {
      const notFoundError = new NotionApiError('Page not found', 404, 'object_not_found');
      mockApi.mocks.getPage.mockImplementation(() => Promise.reject(notFoundError));

      const doc = await adapter.getPage('db-uuid-5678', 'nonexistent-page');
      expect(doc).toBeNull();
    });

    test('propagates non-404 errors', async () => {
      const serverError = new NotionApiError('Internal server error', 500, 'internal_server_error');
      mockApi.mocks.getPage.mockImplementation(() => Promise.reject(serverError));

      await expect(adapter.getPage('db-uuid-5678', 'page-uuid-1234')).rejects.toThrow('Internal server error');
    });

    test('includes raw page data in ExternalDocument', async () => {
      const doc = await adapter.getPage('db-uuid-5678', 'page-uuid-1234');

      expect(doc).not.toBeNull();
      expect(doc!.raw).toBeDefined();
      expect((doc!.raw as Record<string, unknown>).id).toBe('page-uuid-1234');
    });
  });

  describe('listPagesSince', () => {
    test('queries database with last_edited_time filter', async () => {
      const since = '2024-01-10T00:00:00.000Z';
      const docs = await adapter.listPagesSince('db-uuid-5678', since);

      expect(docs).toHaveLength(1);
      expect(docs[0].externalId).toBe('page-uuid-1234');
      expect(docs[0].title).toBe('Test Page');
      expect(docs[0].provider).toBe('notion');
      expect(docs[0].project).toBe('db-uuid-5678');

      expect(mockApi.mocks.queryDatabaseAll).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.queryDatabaseAll).toHaveBeenCalledWith('db-uuid-5678', {
        timestamp: 'last_edited_time',
        last_edited_time: { after: since },
      });
    });

    test('fetches blocks for each returned page', async () => {
      const page2 = createMockPage({
        id: 'page-uuid-5678',
        url: 'https://www.notion.so/Page-2-page-uuid-5678',
        properties: {
          Title: {
            id: 'title-prop',
            type: 'title',
            title: [{
              type: 'text',
              plain_text: 'Second Page',
              text: { content: 'Second Page', link: null },
              annotations: { ...DEFAULT_ANNOTATIONS },
              href: null,
            }],
          },
        },
      });

      mockApi.mocks.queryDatabaseAll.mockImplementation(() =>
        Promise.resolve([createMockPage(), page2])
      );

      const docs = await adapter.listPagesSince('db-uuid-5678', '2024-01-01T00:00:00.000Z');

      expect(docs).toHaveLength(2);
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledTimes(2);
    });

    test('returns empty array when no pages match', async () => {
      mockApi.mocks.queryDatabaseAll.mockImplementation(() => Promise.resolve([]));
      const docs = await adapter.listPagesSince('db-uuid-5678', '2024-12-01T00:00:00.000Z');
      expect(docs).toHaveLength(0);
    });
  });

  describe('createPage', () => {
    test('discovers schema and uses correct title property name', async () => {
      const input: ExternalDocumentInput = {
        title: 'New Document',
        content: '# Hello\n\nThis is new content.',
        contentType: 'markdown',
      };

      const createdPage = createMockPage({
        id: 'new-page-uuid',
        url: 'https://www.notion.so/New-Document-new-page-uuid',
        properties: {
          Title: {
            id: 'title-prop',
            type: 'title',
            title: [{
              type: 'text',
              plain_text: 'New Document',
              text: { content: 'New Document', link: null },
              annotations: { ...DEFAULT_ANNOTATIONS },
              href: null,
            }],
          },
        },
      });
      mockApi.mocks.createPage.mockImplementation(() => Promise.resolve(createdPage));

      const doc = await adapter.createPage('db-uuid-5678', input);

      expect(doc.externalId).toBe('new-page-uuid');
      expect(doc.title).toBe('New Document');
      expect(mockApi.mocks.getDatabase).toHaveBeenCalledTimes(1);

      const [dbId, properties, blocks] = mockApi.mocks.createPage.mock.calls[0];
      expect(dbId).toBe('db-uuid-5678');
      expect(properties).toHaveProperty('Title');
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    test('uses discovered title property name "Name"', async () => {
      const nameApi = createMockApiClient({ titlePropertyName: 'Name' });
      const nameAdapter = new NotionDocumentAdapter(nameApi.client);

      await nameAdapter.createPage('db-uuid-5678', {
        title: 'Architecture Guide',
        content: 'Some content',
      });

      const [, properties] = nameApi.mocks.createPage.mock.calls[0];
      expect(properties).toHaveProperty('Name');
      expect(properties).not.toHaveProperty('Title');
      expect(properties.Name).toEqual({
        title: [{ text: { content: 'Architecture Guide' } }],
      });
    });

    test('uses discovered custom title property name', async () => {
      const customApi = createMockApiClient({ titlePropertyName: 'Document Title' });
      const customAdapter = new NotionDocumentAdapter(customApi.client);

      await customAdapter.createPage('db-uuid-5678', { title: 'My Doc', content: 'Content' });

      const [, properties] = customApi.mocks.createPage.mock.calls[0];
      expect(properties).toHaveProperty('Document Title');
      expect(properties['Document Title']).toEqual({
        title: [{ text: { content: 'My Doc' } }],
      });
    });

    test('handles empty content', async () => {
      await adapter.createPage('db-uuid-5678', { title: 'Empty Page', content: '' });

      const [, , blocks] = mockApi.mocks.createPage.mock.calls[0];
      expect(blocks).toEqual([]);
    });

    test('does not call appendBlocks when blocks are under 100', async () => {
      await adapter.createPage('db-uuid-5678', {
        title: 'Small Page',
        content: '# Hello\n\nThis is a small page.',
        contentType: 'markdown',
      });

      expect(mockApi.mocks.createPage).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.appendBlocks).not.toHaveBeenCalled();
    });

    test('batches blocks when content exceeds 100 blocks (150 blocks)', async () => {
      const paragraphs = Array.from({ length: 150 }, (_, i) => `Paragraph ${i}`);
      const createdPage = createMockPage({ id: 'large-page-uuid', url: 'https://www.notion.so/Large-Page' });
      mockApi.mocks.createPage.mockImplementation(() => Promise.resolve(createdPage));

      const doc = await adapter.createPage('db-uuid-5678', {
        title: 'Large Page',
        content: paragraphs.join('\n\n'),
        contentType: 'markdown',
      });

      expect(doc.externalId).toBe('large-page-uuid');

      const [, , firstBatch] = mockApi.mocks.createPage.mock.calls[0];
      expect(firstBatch).toHaveLength(100);

      expect(mockApi.mocks.appendBlocks).toHaveBeenCalledTimes(1);
      const [pageId, remaining] = mockApi.mocks.appendBlocks.mock.calls[0];
      expect(pageId).toBe('large-page-uuid');
      expect(remaining).toHaveLength(50);
    });

    test('batches blocks when content exceeds 200 blocks (250 blocks)', async () => {
      const paragraphs = Array.from({ length: 250 }, (_, i) => `Paragraph ${i}`);
      const createdPage = createMockPage({ id: 'very-large-page-uuid', url: 'https://www.notion.so/Very-Large-Page' });
      mockApi.mocks.createPage.mockImplementation(() => Promise.resolve(createdPage));

      await adapter.createPage('db-uuid-5678', {
        title: 'Very Large Page',
        content: paragraphs.join('\n\n'),
        contentType: 'markdown',
      });

      const [, , firstBatch] = mockApi.mocks.createPage.mock.calls[0];
      expect(firstBatch).toHaveLength(100);

      const [pageId, remaining] = mockApi.mocks.appendBlocks.mock.calls[0];
      expect(pageId).toBe('very-large-page-uuid');
      expect(remaining).toHaveLength(150);
    });

    test('preserves block order when batching', async () => {
      const paragraphs = Array.from({ length: 110 }, (_, i) => `Block content ${i}`);
      const createdPage = createMockPage({ id: 'ordered-page-uuid' });
      mockApi.mocks.createPage.mockImplementation(() => Promise.resolve(createdPage));

      await adapter.createPage('db-uuid-5678', {
        title: 'Ordered Page',
        content: paragraphs.join('\n\n'),
        contentType: 'markdown',
      });

      const [, , firstBatch] = mockApi.mocks.createPage.mock.calls[0];
      const [, remaining] = mockApi.mocks.appendBlocks.mock.calls[0];
      expect(firstBatch).toHaveLength(100);
      expect(remaining).toHaveLength(10);
    });

    test('skips Category and Tags when they do not exist in schema', async () => {
      const noPropApi = createMockApiClient({ includeCategory: false, includeTags: false });
      (noPropApi.mocks.updateDatabase as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.reject(new NotionApiError('Forbidden', 403, 'restricted_resource'))
      );
      const noPropAdapter = new NotionDocumentAdapter(noPropApi.client);

      await noPropAdapter.createPage('db-uuid-5678', { title: 'No Props Page', content: 'Content' });

      const [, properties] = noPropApi.mocks.createPage.mock.calls[0];
      expect(properties).toHaveProperty('Title');
      expect(properties).not.toHaveProperty('Category');
      expect(properties).not.toHaveProperty('Tags');
    });

    test('schema is cached across createPage calls', async () => {
      await adapter.createPage('db-uuid-5678', { title: 'Page 1', content: 'c1' });
      await adapter.createPage('db-uuid-5678', { title: 'Page 2', content: 'c2' });

      expect(mockApi.mocks.getDatabase).toHaveBeenCalledTimes(1);
    });
  });

  describe('updatePage', () => {
    test('updates title property using discovered name', async () => {
      await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', { title: 'Updated Title' });

      expect(mockApi.mocks.getDatabase).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.updatePage).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.updatePage).toHaveBeenCalledWith('page-uuid-1234', {
        Title: { title: [{ text: { content: 'Updated Title' } }] },
      });
      expect(mockApi.mocks.updatePageContent).not.toHaveBeenCalled();
    });

    test('uses custom title property name when updating', async () => {
      const customApi = createMockApiClient({ titlePropertyName: 'Document Title' });
      const customAdapter = new NotionDocumentAdapter(customApi.client);

      await customAdapter.updatePage('db-uuid-5678', 'page-uuid-1234', { title: 'Updated' });

      const [, properties] = customApi.mocks.updatePage.mock.calls[0];
      expect(properties).toHaveProperty('Document Title');
      expect(properties).not.toHaveProperty('Title');
    });

    test('replaces content blocks when content is provided', async () => {
      await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', {
        content: '# New Content\n\nUpdated body.',
      });

      expect(mockApi.mocks.updatePage).not.toHaveBeenCalled();
      expect(mockApi.mocks.updatePageContent).toHaveBeenCalledTimes(1);
      const [pageId, blocks] = mockApi.mocks.updatePageContent.mock.calls[0];
      expect(pageId).toBe('page-uuid-1234');
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    test('updates both title and content when both provided', async () => {
      await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', {
        title: 'New Title',
        content: '# Updated\n\nNew content here.',
      });

      expect(mockApi.mocks.updatePage).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.updatePageContent).toHaveBeenCalledTimes(1);
    });

    test('fetches updated page to return complete ExternalDocument', async () => {
      const updatedPage = createMockPage({
        last_edited_time: '2024-02-01T00:00:00.000Z',
        properties: {
          Title: {
            id: 'title-prop',
            type: 'title',
            title: [{
              type: 'text',
              plain_text: 'Updated Title',
              text: { content: 'Updated Title', link: null },
              annotations: { ...DEFAULT_ANNOTATIONS },
              href: null,
            }],
          },
        },
      });
      mockApi.mocks.getPage.mockImplementation(() => Promise.resolve(updatedPage));

      const doc = await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', {
        title: 'Updated Title',
      });

      expect(doc.title).toBe('Updated Title');
      expect(doc.updatedAt).toBe('2024-02-01T00:00:00.000Z');
      expect(mockApi.mocks.getPage).toHaveBeenCalledWith('page-uuid-1234');
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledWith('page-uuid-1234');
    });

    test('does nothing extra when no updates provided', async () => {
      const doc = await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', {});

      expect(mockApi.mocks.updatePage).not.toHaveBeenCalled();
      expect(mockApi.mocks.updatePageContent).not.toHaveBeenCalled();
      expect(mockApi.mocks.getPage).toHaveBeenCalledTimes(1);
      expect(doc.externalId).toBe('page-uuid-1234');
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createNotionDocumentAdapter', () => {
  test('creates adapter from API client', () => {
    const { client } = createMockApiClient();
    const adapter = createNotionDocumentAdapter(client);
    expect(adapter).toBeInstanceOf(NotionDocumentAdapter);
  });
});

// ============================================================================
// NotionProvider Tests
// ============================================================================

describe('NotionProvider', () => {
  describe('createNotionProvider', () => {
    test('creates a provider with correct metadata', () => {
      const provider = createNotionProvider({ token: 'ntn_test_token' });
      expect(provider.name).toBe('notion');
      expect(provider.displayName).toBe('Notion');
      expect(provider.supportedAdapters).toEqual(['document']);
    });

    test('provides a document adapter', () => {
      const provider = createNotionProvider({ token: 'ntn_test_token' });
      const adapter = provider.getDocumentAdapter!();
      expect(adapter).toBeDefined();
    });

    test('does not provide a task adapter', () => {
      const provider = createNotionProvider({ token: 'ntn_test_token' });
      expect(provider.getTaskAdapter).toBeUndefined();
    });

    test('does not provide a message adapter', () => {
      const provider = createNotionProvider({ token: 'ntn_test_token' });
      expect(provider.getMessageAdapter).toBeUndefined();
    });
  });

  describe('testConnection', () => {
    test('returns false when no token is provided', async () => {
      const provider = createNotionProvider({ token: 'ntn_test_token' });
      const result = await provider.testConnection({ provider: 'notion' });
      expect(result).toBe(false);
    });

    test('returns false when fetch throws (network error)', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as typeof fetch;
      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        const result = await provider.testConnection({ provider: 'notion', token: 'ntn_test_token' });
        expect(result).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('returns true when API responds with 200', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ object: 'user', id: 'user-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      ) as typeof fetch;
      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        const result = await provider.testConnection({ provider: 'notion', token: 'ntn_valid_token' });
        expect(result).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('returns false when API responds with 401', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ object: 'error', status: 401 }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
      ) as typeof fetch;
      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        const result = await provider.testConnection({ provider: 'notion', token: 'ntn_invalid_token' });
        expect(result).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('calls /users/me with correct headers', async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ object: 'user' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      );
      globalThis.fetch = mockFetch as typeof fetch;
      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        await provider.testConnection({ provider: 'notion', token: 'ntn_my_token' });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe('https://api.notion.com/v1/users/me');
        expect(options.method).toBe('GET');
        expect(options.headers.Authorization).toBe('Bearer ntn_my_token');
        expect(options.headers['Notion-Version']).toBe('2022-06-28');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ============================================================================
// Placeholder Provider Tests
// ============================================================================

describe('NotionPlaceholderProvider', () => {
  test('has correct metadata', () => {
    const provider = createNotionPlaceholderProvider();
    expect(provider.name).toBe('notion');
    expect(provider.displayName).toBe('Notion');
    expect(provider.supportedAdapters).toEqual(['document']);
  });

  test('testConnection always returns false', async () => {
    const provider = createNotionPlaceholderProvider();
    const result = await provider.testConnection({ provider: 'notion', token: 'ntn_any_token' });
    expect(result).toBe(false);
  });

  test('document adapter methods throw descriptive errors', async () => {
    const provider = createNotionPlaceholderProvider();
    const adapter = provider.getDocumentAdapter!();

    await expect(adapter.getPage('db', 'page')).rejects.toThrow(/not configured/i);
    await expect(adapter.listPagesSince('db', '2024-01-01')).rejects.toThrow(/not configured/i);
    await expect(adapter.createPage('db', { title: 'Test', content: 'Hello' })).rejects.toThrow(/not configured/i);
    await expect(adapter.updatePage('db', 'page', { title: 'Updated' })).rejects.toThrow(/not configured/i);
  });
});
