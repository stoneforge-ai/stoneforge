/**
 * Notion Document Adapter Tests
 *
 * Tests for the NotionDocumentAdapter and NotionProvider.
 * Uses a mocked NotionApiClient to test document sync operations:
 * - getPage: properties + blocks → ExternalDocument
 * - listPagesSince: database query → ExternalDocument[]
 * - createPage: markdown → blocks → API call
 * - updatePage: properties + content replacement
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
 * Creates a mock NotionApiClient with all methods replaced by mock functions.
 * Returns both the mock client and references to the individual mock functions.
 */
function createMockApiClient() {
  const mockGetPage = mock(() => Promise.resolve(createMockPage()));
  const mockGetBlocks = mock(() => Promise.resolve(createMockBlocks()));
  const mockCreatePage = mock(() => Promise.resolve(createMockPage()));
  const mockUpdatePage = mock(() => Promise.resolve(createMockPage()));
  const mockUpdatePageContent = mock(() => Promise.resolve(createMockBlocks()));
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

  // Create a real client then override methods with mocks
  // We can't construct without a token, so we create a minimal mock
  const client = {
    getPage: mockGetPage,
    getBlocks: mockGetBlocks,
    createPage: mockCreatePage,
    updatePage: mockUpdatePage,
    updatePageContent: mockUpdatePageContent,
    queryDatabase: mockQueryDatabase,
    queryDatabaseAll: mockQueryDatabaseAll,
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
      queryDatabase: mockQueryDatabase,
      queryDatabaseAll: mockQueryDatabaseAll,
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
  test('creates title-only properties', () => {
    const props = buildPageProperties('My Page');
    expect(props).toEqual({
      Title: {
        title: [{ text: { content: 'My Page' } }],
      },
    });
  });

  test('includes category select property', () => {
    const props = buildPageProperties('My Page', 'Reference');
    expect(props).toEqual({
      Title: {
        title: [{ text: { content: 'My Page' } }],
      },
      Category: {
        select: { name: 'Reference' },
      },
    });
  });

  test('includes tags multi-select property', () => {
    const props = buildPageProperties('My Page', undefined, ['api', 'docs']);
    expect(props).toEqual({
      Title: {
        title: [{ text: { content: 'My Page' } }],
      },
      Tags: {
        multi_select: [{ name: 'api' }, { name: 'docs' }],
      },
    });
  });

  test('includes all properties when all provided', () => {
    const props = buildPageProperties('My Page', 'How-To', ['guide', 'setup']);
    expect(props).toEqual({
      Title: {
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
    const props = buildPageProperties('My Page', undefined, []);
    expect(props).toEqual({
      Title: {
        title: [{ text: { content: 'My Page' } }],
      },
    });
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

      // Should have fetched page and blocks
      expect(mockApi.mocks.getPage).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.getPage).toHaveBeenCalledWith('page-uuid-1234');
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledWith('page-uuid-1234');
    });

    test('converts blocks to markdown content', async () => {
      const doc = await adapter.getPage('db-uuid-5678', 'page-uuid-1234');

      expect(doc).not.toBeNull();
      // The mock blocks contain a heading and paragraph
      expect(doc!.content).toContain('# Introduction');
      expect(doc!.content).toContain('This is a test paragraph.');
    });

    test('returns null for not-found errors', async () => {
      const notFoundError = new NotionApiError(
        'Page not found',
        404,
        'object_not_found'
      );
      mockApi.mocks.getPage.mockImplementation(() => Promise.reject(notFoundError));

      const doc = await adapter.getPage('db-uuid-5678', 'nonexistent-page');
      expect(doc).toBeNull();
    });

    test('propagates non-404 errors', async () => {
      const serverError = new NotionApiError(
        'Internal server error',
        500,
        'internal_server_error'
      );
      mockApi.mocks.getPage.mockImplementation(() => Promise.reject(serverError));

      await expect(
        adapter.getPage('db-uuid-5678', 'page-uuid-1234')
      ).rejects.toThrow('Internal server error');
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

      // Verify the query used the correct filter
      expect(mockApi.mocks.queryDatabaseAll).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.queryDatabaseAll).toHaveBeenCalledWith(
        'db-uuid-5678',
        {
          timestamp: 'last_edited_time',
          last_edited_time: {
            after: since,
          },
        }
      );
    });

    test('fetches blocks for each returned page', async () => {
      const page2 = createMockPage({
        id: 'page-uuid-5678',
        url: 'https://www.notion.so/Page-2-page-uuid-5678',
        properties: {
          Title: {
            id: 'title-prop',
            type: 'title',
            title: [
              {
                type: 'text',
                plain_text: 'Second Page',
                text: { content: 'Second Page', link: null },
                annotations: { ...DEFAULT_ANNOTATIONS },
                href: null,
              },
            ],
          },
        },
      });

      mockApi.mocks.queryDatabaseAll.mockImplementation(() =>
        Promise.resolve([createMockPage(), page2])
      );

      const docs = await adapter.listPagesSince('db-uuid-5678', '2024-01-01T00:00:00.000Z');

      expect(docs).toHaveLength(2);
      // getBlocks should be called once per page
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledTimes(2);
    });

    test('returns empty array when no pages match', async () => {
      mockApi.mocks.queryDatabaseAll.mockImplementation(() =>
        Promise.resolve([])
      );

      const docs = await adapter.listPagesSince('db-uuid-5678', '2024-12-01T00:00:00.000Z');
      expect(docs).toHaveLength(0);
    });
  });

  describe('createPage', () => {
    test('converts markdown to blocks and creates page', async () => {
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
            title: [
              {
                type: 'text',
                plain_text: 'New Document',
                text: { content: 'New Document', link: null },
                annotations: { ...DEFAULT_ANNOTATIONS },
                href: null,
              },
            ],
          },
        },
      });
      mockApi.mocks.createPage.mockImplementation(() => Promise.resolve(createdPage));

      const doc = await adapter.createPage('db-uuid-5678', input);

      expect(doc.externalId).toBe('new-page-uuid');
      expect(doc.title).toBe('New Document');
      expect(doc.content).toBe('# Hello\n\nThis is new content.');
      expect(doc.contentType).toBe('markdown');
      expect(doc.provider).toBe('notion');
      expect(doc.project).toBe('db-uuid-5678');

      // Verify API was called with correct arguments
      expect(mockApi.mocks.createPage).toHaveBeenCalledTimes(1);
      const [dbId, properties, blocks] = mockApi.mocks.createPage.mock.calls[0];
      expect(dbId).toBe('db-uuid-5678');
      // Title property should be set
      expect(properties).toHaveProperty('Title');
      // Blocks should be an array of Notion blocks
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    test('creates page with Title property from input', async () => {
      const input: ExternalDocumentInput = {
        title: 'Architecture Guide',
        content: 'Some content',
      };

      await adapter.createPage('db-uuid-5678', input);

      const [, properties] = mockApi.mocks.createPage.mock.calls[0];
      expect(properties).toEqual({
        Title: {
          title: [{ text: { content: 'Architecture Guide' } }],
        },
      });
    });

    test('handles empty content', async () => {
      const input: ExternalDocumentInput = {
        title: 'Empty Page',
        content: '',
      };

      await adapter.createPage('db-uuid-5678', input);

      const [, , blocks] = mockApi.mocks.createPage.mock.calls[0];
      // markdownToNotionBlocks returns [] for empty content
      expect(blocks).toEqual([]);
    });
  });

  describe('updatePage', () => {
    test('updates title property when title is provided', async () => {
      const updates: Partial<ExternalDocumentInput> = {
        title: 'Updated Title',
      };

      await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', updates);

      // Should have called updatePage with title properties
      expect(mockApi.mocks.updatePage).toHaveBeenCalledTimes(1);
      expect(mockApi.mocks.updatePage).toHaveBeenCalledWith(
        'page-uuid-1234',
        {
          Title: {
            title: [{ text: { content: 'Updated Title' } }],
          },
        }
      );

      // Should NOT have replaced content blocks
      expect(mockApi.mocks.updatePageContent).not.toHaveBeenCalled();
    });

    test('replaces content blocks when content is provided', async () => {
      const updates: Partial<ExternalDocumentInput> = {
        content: '# New Content\n\nUpdated body.',
      };

      await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', updates);

      // Should NOT have updated properties
      expect(mockApi.mocks.updatePage).not.toHaveBeenCalled();

      // Should have replaced content blocks
      expect(mockApi.mocks.updatePageContent).toHaveBeenCalledTimes(1);
      const [pageId, blocks] = mockApi.mocks.updatePageContent.mock.calls[0];
      expect(pageId).toBe('page-uuid-1234');
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    test('updates both title and content when both provided', async () => {
      const updates: Partial<ExternalDocumentInput> = {
        title: 'New Title',
        content: '# Updated\n\nNew content here.',
      };

      await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', updates);

      // Both should have been called
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
            title: [
              {
                type: 'text',
                plain_text: 'Updated Title',
                text: { content: 'Updated Title', link: null },
                annotations: { ...DEFAULT_ANNOTATIONS },
                href: null,
              },
            ],
          },
        },
      });
      mockApi.mocks.getPage.mockImplementation(() => Promise.resolve(updatedPage));

      const doc = await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', {
        title: 'Updated Title',
      });

      expect(doc.title).toBe('Updated Title');
      expect(doc.updatedAt).toBe('2024-02-01T00:00:00.000Z');

      // Should have fetched the updated page + blocks
      expect(mockApi.mocks.getPage).toHaveBeenCalledWith('page-uuid-1234');
      expect(mockApi.mocks.getBlocks).toHaveBeenCalledWith('page-uuid-1234');
    });

    test('does nothing extra when no updates provided', async () => {
      const doc = await adapter.updatePage('db-uuid-5678', 'page-uuid-1234', {});

      // Should not have called updatePage or updatePageContent
      expect(mockApi.mocks.updatePage).not.toHaveBeenCalled();
      expect(mockApi.mocks.updatePageContent).not.toHaveBeenCalled();

      // Should still fetch the current page state
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

      // getTaskAdapter should be undefined (not implemented)
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
      const result = await provider.testConnection({
        provider: 'notion',
      });

      expect(result).toBe(false);
    });

    test('returns false when fetch throws (network error)', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as typeof fetch;

      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        const result = await provider.testConnection({
          provider: 'notion',
          token: 'ntn_test_token',
        });

        expect(result).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('returns true when API responds with 200', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ object: 'user', id: 'user-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      ) as typeof fetch;

      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        const result = await provider.testConnection({
          provider: 'notion',
          token: 'ntn_valid_token',
        });

        expect(result).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('returns false when API responds with 401', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ object: 'error', status: 401 }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }))
      ) as typeof fetch;

      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        const result = await provider.testConnection({
          provider: 'notion',
          token: 'ntn_invalid_token',
        });

        expect(result).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('calls /users/me with correct headers', async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ object: 'user' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      );
      globalThis.fetch = mockFetch as typeof fetch;

      try {
        const provider = createNotionProvider({ token: 'ntn_test_token' });
        await provider.testConnection({
          provider: 'notion',
          token: 'ntn_my_token',
        });

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

    const result = await provider.testConnection({
      provider: 'notion',
      token: 'ntn_any_token',
    });

    expect(result).toBe(false);
  });

  test('document adapter methods throw descriptive errors', async () => {
    const provider = createNotionPlaceholderProvider();
    const adapter = provider.getDocumentAdapter!();

    await expect(adapter.getPage('db', 'page')).rejects.toThrow(
      /not configured/i
    );
    await expect(adapter.listPagesSince('db', '2024-01-01')).rejects.toThrow(
      /not configured/i
    );
    await expect(
      adapter.createPage('db', { title: 'Test', content: 'Hello' })
    ).rejects.toThrow(/not configured/i);
    await expect(
      adapter.updatePage('db', 'page', { title: 'Updated' })
    ).rejects.toThrow(/not configured/i);
  });
});
