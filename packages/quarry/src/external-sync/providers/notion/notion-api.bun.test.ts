/**
 * Notion API Client Tests
 *
 * Tests for the fetch-based Notion REST API client.
 * Uses mock fetch to simulate Notion API responses.
 */

import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  NotionApiClient,
  NotionApiError,
  isNotionApiError,
  type RateLimitState,
} from './notion-api.js';
import type {
  NotionPage,
  NotionBlock,
  NotionDatabaseQueryResponse,
  NotionBlockChildrenResponse,
  NotionErrorResponse,
} from './notion-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Creates a mock Notion page matching the NotionPage type */
function createMockPage(overrides: Partial<NotionPage> = {}): NotionPage {
  return {
    id: 'page-uuid-1234',
    object: 'page',
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-02T00:00:00.000Z',
    archived: false,
    url: 'https://www.notion.so/Test-Page-page-uuid-1234',
    public_url: null,
    properties: {
      Name: {
        id: 'title',
        type: 'title',
        title: [
          {
            type: 'text',
            plain_text: 'Test Page',
            text: { content: 'Test Page', link: null },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: 'default',
            },
            href: null,
          },
        ],
      },
    },
    parent: { type: 'database_id', database_id: 'db-uuid-5678' },
    ...overrides,
  };
}

/** Creates a mock Notion block */
function createMockBlock(overrides: Partial<NotionBlock> = {}): NotionBlock {
  return {
    id: 'block-uuid-1111',
    type: 'paragraph',
    has_children: false,
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-02T00:00:00.000Z',
    archived: false,
    paragraph: {
      rich_text: [
        {
          type: 'text',
          plain_text: 'Hello world',
          text: { content: 'Hello world', link: null },
          annotations: {
            bold: false,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: 'default',
          },
          href: null,
        },
      ],
    },
    ...overrides,
  };
}

/** Creates a mock Notion error response */
function createMockErrorBody(
  status: number,
  code: string,
  message: string
): NotionErrorResponse {
  return { object: 'error', status, code, message };
}

/** Creates a mock Response object */
function createMockResponse(
  body: unknown,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  const responseBody = body === undefined ? null : JSON.stringify(body);
  return new Response(responseBody, {
    status,
    statusText: status === 200 ? 'OK' : status === 201 ? 'Created' : status === 204 ? 'No Content' : 'Error',
    headers: new Headers(headers),
  });
}

/** Saves and restores the global fetch */
let originalFetch: typeof globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

function setupMockFetch() {
  originalFetch = globalThis.fetch;
  mockFetch = mock(() => Promise.resolve(createMockResponse(createMockPage())));
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function setMockFetchResponse(body: unknown, status: number = 200, headers?: Record<string, string>) {
  mockFetch.mockImplementation(() =>
    Promise.resolve(createMockResponse(body, status, headers ?? {}))
  );
}

function setMockFetchError(error: Error) {
  mockFetch.mockImplementation(() => Promise.reject(error));
}

// ============================================================================
// Tests
// ============================================================================

describe('NotionApiClient', () => {
  let client: NotionApiClient;

  beforeEach(() => {
    setupMockFetch();
    client = new NotionApiClient({ token: 'ntn_testtoken123', maxRetries: 0 });
  });

  afterEach(() => {
    restoreFetch();
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    test('throws if token is empty', () => {
      expect(() => new NotionApiClient({ token: '' })).toThrow('Notion API token is required');
    });

    test('uses default Notion version', () => {
      const c = new NotionApiClient({ token: 'test', maxRetries: 0 });
      c.getPage('page-id');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Notion-Version']).toBe('2022-06-28');
    });

    test('uses custom Notion version', () => {
      const c = new NotionApiClient({ token: 'test', notionVersion: '2023-08-01', maxRetries: 0 });
      c.getPage('page-id');
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Notion-Version']).toBe('2023-08-01');
    });

    test('initial rate limit state is clean', () => {
      const state = client.getRateLimitState();
      expect(state.wasRateLimited).toBe(false);
      expect(state.lastRetryAfterSeconds).toBeNull();
      expect(state.totalRateLimitHits).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Request Headers
  // --------------------------------------------------------------------------

  describe('request headers', () => {
    test('sends Authorization header with Bearer token', async () => {
      await client.getPage('page-id');
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer ntn_testtoken123');
    });

    test('sends Notion-Version header', async () => {
      await client.getPage('page-id');
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Notion-Version']).toBe('2022-06-28');
    });

    test('sends Content-Type for POST requests', async () => {
      setMockFetchResponse({
        object: 'list',
        results: [],
        has_more: false,
        next_cursor: null,
        type: 'page_or_database',
      });
      await client.queryDatabase('db-id');
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    test('does not send Content-Type for GET requests', async () => {
      await client.getPage('page-id');
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getPage
  // --------------------------------------------------------------------------

  describe('getPage', () => {
    test('fetches a page by ID', async () => {
      const mockPage = createMockPage({ id: 'test-page-id' });
      setMockFetchResponse(mockPage);

      const page = await client.getPage('test-page-id');

      expect(page.id).toBe('test-page-id');
      expect(page.object).toBe('page');
    });

    test('calls correct URL', async () => {
      await client.getPage('abc-123');

      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toBe('https://api.notion.com/v1/pages/abc-123');
    });

    test('uses GET method', async () => {
      await client.getPage('page-id');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('GET');
    });

    test('does not send body for GET requests', async () => {
      await client.getPage('page-id');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });

    test('throws NotionApiError on 404', async () => {
      setMockFetchResponse(
        createMockErrorBody(404, 'object_not_found', 'Could not find page with ID: abc.'),
        404
      );

      try {
        await client.getPage('abc');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isNotionApiError(err)).toBe(true);
        const apiErr = err as NotionApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe('object_not_found');
        expect(apiErr.isNotFound).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // getBlocks
  // --------------------------------------------------------------------------

  describe('getBlocks', () => {
    test('fetches block children for a page', async () => {
      const blocks = [createMockBlock({ id: 'block-1' }), createMockBlock({ id: 'block-2' })];
      setMockFetchResponse({
        object: 'list',
        results: blocks,
        has_more: false,
        next_cursor: null,
        type: 'block',
      } satisfies NotionBlockChildrenResponse);

      const result = await client.getBlocks('page-id');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('block-1');
      expect(result[1].id).toBe('block-2');
    });

    test('calls correct URL with page_size', async () => {
      setMockFetchResponse({
        object: 'list',
        results: [],
        has_more: false,
        next_cursor: null,
        type: 'block',
      });

      await client.getBlocks('page-id');

      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toContain('/blocks/page-id/children');
      expect(url).toContain('page_size=100');
    });

    test('auto-paginates through all block children', async () => {
      const page1Blocks = [createMockBlock({ id: 'block-1' })];
      const page2Blocks = [createMockBlock({ id: 'block-2' }), createMockBlock({ id: 'block-3' })];

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse({
              object: 'list',
              results: page1Blocks,
              has_more: true,
              next_cursor: 'cursor-abc',
              type: 'block',
            })
          );
        }
        return Promise.resolve(
          createMockResponse({
            object: 'list',
            results: page2Blocks,
            has_more: false,
            next_cursor: null,
            type: 'block',
          })
        );
      });

      const result = await client.getBlocks('page-id');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('block-1');
      expect(result[1].id).toBe('block-2');
      expect(result[2].id).toBe('block-3');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify second call uses the cursor
      const secondUrl = (mockFetch.mock.calls[1] as [string, RequestInit])[0] as string;
      expect(secondUrl).toContain('start_cursor=cursor-abc');
    });
  });

  // --------------------------------------------------------------------------
  // createPage
  // --------------------------------------------------------------------------

  describe('createPage', () => {
    test('creates a page in a database with properties', async () => {
      const created = createMockPage({ id: 'new-page-id' });
      setMockFetchResponse(created);

      const result = await client.createPage('db-id', {
        Name: { title: [{ text: { content: 'New Page' } }] },
      });

      expect(result.id).toBe('new-page-id');
    });

    test('sends POST request with JSON body', async () => {
      setMockFetchResponse(createMockPage());

      await client.createPage(
        'db-id',
        { Name: { title: [{ text: { content: 'Test' } }] } },
        [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Hello' } }] } }]
      );

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.notion.com/v1/pages');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.parent.database_id).toBe('db-id');
      expect(body.properties.Name).toBeDefined();
      expect(body.children).toHaveLength(1);
    });

    test('creates page without children', async () => {
      setMockFetchResponse(createMockPage());

      await client.createPage('db-id', { Name: { title: [{ text: { content: 'Test' } }] } });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.children).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // updatePage
  // --------------------------------------------------------------------------

  describe('updatePage', () => {
    test('updates page properties', async () => {
      const updated = createMockPage({ id: 'page-id' });
      setMockFetchResponse(updated);

      const result = await client.updatePage('page-id', {
        Name: { title: [{ text: { content: 'Updated Title' } }] },
      });

      expect(result.id).toBe('page-id');
    });

    test('sends PATCH request to correct URL', async () => {
      setMockFetchResponse(createMockPage());

      await client.updatePage('page-id', { Name: { title: [] } });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.notion.com/v1/pages/page-id');
      expect(init.method).toBe('PATCH');
    });

    test('sends properties in body', async () => {
      setMockFetchResponse(createMockPage());

      const props = { Status: { select: { name: 'Done' } } };
      await client.updatePage('page-id', props);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.properties.Status.select.name).toBe('Done');
    });
  });

  // --------------------------------------------------------------------------
  // updatePageContent
  // --------------------------------------------------------------------------

  describe('updatePageContent', () => {
    test('deletes existing blocks then appends new ones', async () => {
      const existingBlocks = [createMockBlock({ id: 'old-1' }), createMockBlock({ id: 'old-2' })];
      const newBlocks = [createMockBlock({ id: 'new-1' })];

      let callCount = 0;
      mockFetch.mockImplementation((_url: string, init: RequestInit) => {
        callCount++;
        // Call 1: GET blocks (pagination)
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse({
              object: 'list',
              results: existingBlocks,
              has_more: false,
              next_cursor: null,
              type: 'block',
            })
          );
        }
        // Calls 2-3: DELETE old blocks (204 No Content)
        if (callCount === 2 || callCount === 3) {
          return Promise.resolve(createMockResponse(undefined, 204));
        }
        // Call 4: PATCH append new blocks
        return Promise.resolve(
          createMockResponse({
            object: 'list',
            results: newBlocks,
            has_more: false,
            next_cursor: null,
            type: 'block',
          })
        );
      });

      const result = await client.updatePageContent('page-id', [
        { type: 'paragraph', paragraph: { rich_text: [] } },
      ]);

      expect(callCount).toBe(4);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('new-1');

      // Verify DELETE calls
      const deleteUrl1 = (mockFetch.mock.calls[1] as [string, RequestInit])[0] as string;
      const deleteInit1 = (mockFetch.mock.calls[1] as [string, RequestInit])[1];
      expect(deleteUrl1).toContain('/blocks/old-1');
      expect(deleteInit1.method).toBe('DELETE');

      const deleteUrl2 = (mockFetch.mock.calls[2] as [string, RequestInit])[0] as string;
      expect(deleteUrl2).toContain('/blocks/old-2');

      // Verify PATCH (append) call
      const appendInit = (mockFetch.mock.calls[3] as [string, RequestInit])[1];
      expect(appendInit.method).toBe('PATCH');
      const appendBody = JSON.parse(appendInit.body as string);
      expect(appendBody.children).toHaveLength(1);
    });

    test('returns empty array when appending no blocks', async () => {
      mockFetch.mockImplementation(() => {
        return Promise.resolve(
          createMockResponse({
            object: 'list',
            results: [],
            has_more: false,
            next_cursor: null,
            type: 'block',
          })
        );
      });

      const result = await client.updatePageContent('page-id', []);

      // Only the GET blocks call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // queryDatabase
  // --------------------------------------------------------------------------

  describe('queryDatabase', () => {
    test('queries a database with no filter', async () => {
      const response: NotionDatabaseQueryResponse = {
        object: 'list',
        results: [createMockPage({ id: 'result-1' })],
        has_more: false,
        next_cursor: null,
        type: 'page_or_database',
      };
      setMockFetchResponse(response);

      const result = await client.queryDatabase('db-id');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('result-1');
      expect(result.has_more).toBe(false);
    });

    test('sends POST request with correct URL', async () => {
      setMockFetchResponse({
        object: 'list',
        results: [],
        has_more: false,
        next_cursor: null,
        type: 'page_or_database',
      });

      await client.queryDatabase('my-db-id');

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.notion.com/v1/databases/my-db-id/query');
      expect(init.method).toBe('POST');
    });

    test('sends filter in body', async () => {
      setMockFetchResponse({
        object: 'list',
        results: [],
        has_more: false,
        next_cursor: null,
        type: 'page_or_database',
      });

      const filter = {
        property: 'last_edited_time',
        last_edited_time: { after: '2024-01-01T00:00:00Z' },
      };
      await client.queryDatabase('db-id', filter);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.filter).toEqual(filter);
      expect(body.page_size).toBe(100);
    });

    test('sends cursor in body', async () => {
      setMockFetchResponse({
        object: 'list',
        results: [],
        has_more: false,
        next_cursor: null,
        type: 'page_or_database',
      });

      await client.queryDatabase('db-id', undefined, 'cursor-xyz');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.start_cursor).toBe('cursor-xyz');
    });
  });

  // --------------------------------------------------------------------------
  // queryDatabaseAll
  // --------------------------------------------------------------------------

  describe('queryDatabaseAll', () => {
    test('auto-paginates through all database results', async () => {
      const page1 = [createMockPage({ id: 'page-1' })];
      const page2 = [createMockPage({ id: 'page-2' }), createMockPage({ id: 'page-3' })];

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse({
              object: 'list',
              results: page1,
              has_more: true,
              next_cursor: 'cursor-page2',
              type: 'page_or_database',
            })
          );
        }
        return Promise.resolve(
          createMockResponse({
            object: 'list',
            results: page2,
            has_more: false,
            next_cursor: null,
            type: 'page_or_database',
          })
        );
      });

      const result = await client.queryDatabaseAll('db-id');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('page-1');
      expect(result[1].id).toBe('page-2');
      expect(result[2].id).toBe('page-3');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify second call sends the cursor
      const [, secondInit] = mockFetch.mock.calls[1] as [string, RequestInit];
      const secondBody = JSON.parse(secondInit.body as string);
      expect(secondBody.start_cursor).toBe('cursor-page2');
    });

    test('returns single page when no more results', async () => {
      setMockFetchResponse({
        object: 'list',
        results: [createMockPage({ id: 'only-page' })],
        has_more: false,
        next_cursor: null,
        type: 'page_or_database',
      });

      const result = await client.queryDatabaseAll('db-id');

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('passes filter through to each page request', async () => {
      setMockFetchResponse({
        object: 'list',
        results: [],
        has_more: false,
        next_cursor: null,
        type: 'page_or_database',
      });

      const filter = {
        property: 'last_edited_time',
        last_edited_time: { after: '2024-06-01T00:00:00Z' },
      };

      await client.queryDatabaseAll('db-id', filter);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.filter).toEqual(filter);
    });
  });

  // --------------------------------------------------------------------------
  // Rate Limit Handling (429 + Retry-After)
  // --------------------------------------------------------------------------

  describe('rate limit handling', () => {
    let warnSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('throws NotionApiError on 429 when maxRetries is 0', async () => {
      setMockFetchResponse(
        createMockErrorBody(429, 'rate_limited', 'Rate limited'),
        429,
        { 'Retry-After': '2' }
      );

      try {
        await client.getPage('page-id');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isNotionApiError(err)).toBe(true);
        const apiErr = err as NotionApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.isRateLimited).toBe(true);
        expect(apiErr.message).toContain('Retry after 2s');
      }
    });

    test('tracks rate limit state on 429', async () => {
      setMockFetchResponse(
        createMockErrorBody(429, 'rate_limited', 'Rate limited'),
        429,
        { 'Retry-After': '5' }
      );

      try {
        await client.getPage('page-id');
      } catch {
        // Expected
      }

      const state = client.getRateLimitState();
      expect(state.wasRateLimited).toBe(true);
      expect(state.lastRetryAfterSeconds).toBe(5);
      expect(state.totalRateLimitHits).toBe(1);
    });

    test('retries on 429 when maxRetries > 0', async () => {
      // Create client that retries
      const retryClient = new NotionApiClient({
        token: 'test',
        maxRetries: 2,
        warnOnRateLimit: true,
      });

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse(
              createMockErrorBody(429, 'rate_limited', 'Rate limited'),
              429,
              { 'Retry-After': '0' } // 0 seconds to keep tests fast
            )
          );
        }
        // Second call succeeds
        return Promise.resolve(createMockResponse(createMockPage({ id: 'success' })));
      });

      const result = await retryClient.getPage('page-id');

      expect(result.id).toBe('success');
      expect(callCount).toBe(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toContain('Rate limited');
      expect(warnMessage).toContain('attempt 1/2');
    });

    test('throws after exhausting all retries', async () => {
      const retryClient = new NotionApiClient({
        token: 'test',
        maxRetries: 1,
        warnOnRateLimit: false,
      });

      mockFetch.mockImplementation(() => {
        return Promise.resolve(
          createMockResponse(
            createMockErrorBody(429, 'rate_limited', 'Rate limited'),
            429,
            { 'Retry-After': '0' }
          )
        );
      });

      try {
        await retryClient.getPage('page-id');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isNotionApiError(err)).toBe(true);
        expect((err as NotionApiError).status).toBe(429);
      }

      // Initial request + 1 retry = 2 calls
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const state = retryClient.getRateLimitState();
      expect(state.totalRateLimitHits).toBe(2);
    });

    test('does not warn when warnOnRateLimit is false', async () => {
      const quietClient = new NotionApiClient({
        token: 'test',
        maxRetries: 1,
        warnOnRateLimit: false,
      });

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse(
              createMockErrorBody(429, 'rate_limited', 'Rate limited'),
              429,
              { 'Retry-After': '0' }
            )
          );
        }
        return Promise.resolve(createMockResponse(createMockPage()));
      });

      await quietClient.getPage('page-id');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('uses default Retry-After when header is missing', async () => {
      setMockFetchResponse(
        createMockErrorBody(429, 'rate_limited', 'Rate limited'),
        429
        // No Retry-After header
      );

      try {
        await client.getPage('page-id');
      } catch {
        // Expected
      }

      const state = client.getRateLimitState();
      expect(state.wasRateLimited).toBe(true);
      expect(state.lastRetryAfterSeconds).toBe(1); // DEFAULT_RETRY_AFTER_SECONDS
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    test('throws NotionApiError on non-OK response', async () => {
      setMockFetchResponse(
        createMockErrorBody(400, 'validation_error', 'Invalid page properties'),
        400
      );

      try {
        await client.createPage('db-id', {});
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isNotionApiError(err)).toBe(true);
        const apiErr = err as NotionApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.code).toBe('validation_error');
        expect(apiErr.isValidationError).toBe(true);
        expect(apiErr.message).toContain('Invalid page properties');
        expect(apiErr.responseBody).not.toBeNull();
        expect(apiErr.responseBody!.code).toBe('validation_error');
      }
    });

    test('throws NotionApiError on 401 auth error', async () => {
      setMockFetchResponse(
        createMockErrorBody(401, 'unauthorized', 'API token is invalid.'),
        401
      );

      try {
        await client.getPage('page-id');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isNotionApiError(err)).toBe(true);
        const apiErr = err as NotionApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.isAuthError).toBe(true);
        expect(apiErr.isNotFound).toBe(false);
        expect(apiErr.isRateLimited).toBe(false);
      }
    });

    test('wraps network errors in NotionApiError', async () => {
      setMockFetchError(new TypeError('fetch failed'));

      try {
        await client.getPage('page-id');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isNotionApiError(err)).toBe(true);
        const apiErr = err as NotionApiError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.code).toBe('network_error');
        expect(apiErr.message).toContain('Network error');
        expect(apiErr.message).toContain('fetch failed');
        expect(apiErr.cause).toBeInstanceOf(TypeError);
      }
    });

    test('handles non-JSON error response body gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response('Internal Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
          })
        )
      );

      try {
        await client.getPage('page-id');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isNotionApiError(err)).toBe(true);
        const apiErr = err as NotionApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.responseBody).toBeNull();
        expect(apiErr.code).toBe('unknown');
        expect(apiErr.message).toContain('500');
      }
    });

    test('preserves Notion error code in response', async () => {
      setMockFetchResponse(
        createMockErrorBody(409, 'conflict_error', 'Page was updated concurrently'),
        409
      );

      try {
        await client.updatePage('page-id', {});
        throw new Error('Should have thrown');
      } catch (err) {
        const apiErr = err as NotionApiError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe('conflict_error');
        expect(apiErr.responseBody?.code).toBe('conflict_error');
      }
    });
  });

  // --------------------------------------------------------------------------
  // NotionApiError
  // --------------------------------------------------------------------------

  describe('NotionApiError', () => {
    test('serializes to JSON', () => {
      const error = new NotionApiError(
        'Test error',
        404,
        'object_not_found',
        createMockErrorBody(404, 'object_not_found', 'Page not found')
      );

      const json = error.toJSON();
      expect(json.name).toBe('NotionApiError');
      expect(json.message).toBe('Test error');
      expect(json.status).toBe(404);
      expect(json.code).toBe('object_not_found');
      expect(json.responseBody?.code).toBe('object_not_found');
    });

    test('isRateLimited returns true for 429', () => {
      const error = new NotionApiError('Limited', 429, 'rate_limited');
      expect(error.isRateLimited).toBe(true);
    });

    test('isRateLimited returns false for non-429', () => {
      const error = new NotionApiError('Forbidden', 403, 'restricted_resource');
      expect(error.isRateLimited).toBe(false);
    });

    test('isNotFound returns true for object_not_found code', () => {
      const error = new NotionApiError('Not found', 404, 'object_not_found');
      expect(error.isNotFound).toBe(true);
    });

    test('isNotFound returns true for 404 status', () => {
      const error = new NotionApiError('Not found', 404, 'unknown');
      expect(error.isNotFound).toBe(true);
    });

    test('isValidationError returns true for validation_error code', () => {
      const error = new NotionApiError('Invalid', 400, 'validation_error');
      expect(error.isValidationError).toBe(true);
    });

    test('preserves cause chain', () => {
      const cause = new TypeError('Connection refused');
      const error = new NotionApiError('Network error', 0, 'network_error', null, cause);
      expect(error.cause).toBe(cause);
    });
  });
});
