/**
 * Linear Provider Tests
 *
 * Tests for the LinearProvider ExternalProvider implementation.
 * Verifies connection testing, adapter retrieval, and placeholder behavior.
 * Uses mock fetch to simulate Linear API responses.
 */

import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
import {
  createLinearProvider,
  createLinearPlaceholderProvider,
} from './linear-provider.js';
import { LinearTaskAdapter } from './linear-task-adapter.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Default rate limit headers for successful Linear responses */
const defaultRateLimitHeaders: Record<string, string> = {
  'X-RateLimit-Requests-Limit': '5000',
  'X-RateLimit-Requests-Remaining': '4999',
  'X-RateLimit-Requests-Reset': '1700000000',
};

/** Creates a mock GraphQL response body */
function createGraphQLResponse<T>(data: T) {
  return { data };
}

/** Creates a mock Response object */
function createMockResponse(
  body: unknown,
  status: number = 200,
  headers: Record<string, string> = defaultRateLimitHeaders
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(headers),
  });
}

/** Saves and restores the global fetch */
let originalFetch: typeof globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

function setupMockFetch() {
  originalFetch = globalThis.fetch;
  mockFetch = mock(() =>
    Promise.resolve(
      createMockResponse(
        createGraphQLResponse({
          viewer: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        })
      )
    )
  );
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function setMockFetchResponse(body: unknown, status: number = 200) {
  mockFetch.mockImplementation(() =>
    Promise.resolve(createMockResponse(body, status))
  );
}

function setMockFetchError(error: Error) {
  mockFetch.mockImplementation(() => Promise.reject(error));
}

// ============================================================================
// Tests: createLinearProvider
// ============================================================================

describe('LinearProvider (configured)', () => {
  beforeEach(() => {
    setupMockFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  // --------------------------------------------------------------------------
  // Basic Properties
  // --------------------------------------------------------------------------

  describe('properties', () => {
    test('name is "linear"', () => {
      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      expect(provider.name).toBe('linear');
    });

    test('displayName is "Linear"', () => {
      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      expect(provider.displayName).toBe('Linear');
    });

    test('supportedAdapters includes "task"', () => {
      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      expect(provider.supportedAdapters).toContain('task');
    });

    test('supportedAdapters has exactly one entry', () => {
      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      expect(provider.supportedAdapters).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // testConnection
  // --------------------------------------------------------------------------

  describe('testConnection', () => {
    test('returns true when API key is valid (getViewer succeeds)', async () => {
      setMockFetchResponse(
        createGraphQLResponse({
          viewer: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        })
      );

      const provider = createLinearProvider({ apiKey: 'lin_api_validkey' });
      const result = await provider.testConnection({
        provider: 'linear',
        token: 'lin_api_validkey',
      });

      expect(result).toBe(true);
    });

    test('returns false when API key is invalid (401)', async () => {
      setMockFetchResponse(
        { errors: [{ message: 'Unauthorized' }] },
        401
      );

      const provider = createLinearProvider({ apiKey: 'lin_api_badkey' });
      const result = await provider.testConnection({
        provider: 'linear',
        token: 'lin_api_badkey',
      });

      expect(result).toBe(false);
    });

    test('returns false on network error', async () => {
      setMockFetchError(new TypeError('fetch failed'));

      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      const result = await provider.testConnection({
        provider: 'linear',
        token: 'lin_api_test',
      });

      expect(result).toBe(false);
    });

    test('returns false on server error (500)', async () => {
      setMockFetchResponse(
        { errors: [{ message: 'Internal Server Error' }] },
        500
      );

      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      const result = await provider.testConnection({
        provider: 'linear',
        token: 'lin_api_test',
      });

      expect(result).toBe(false);
    });

    test('returns false when response has no data', async () => {
      setMockFetchResponse({ data: null }, 200);

      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      const result = await provider.testConnection({
        provider: 'linear',
        token: 'lin_api_test',
      });

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getTaskAdapter
  // --------------------------------------------------------------------------

  describe('getTaskAdapter', () => {
    test('returns a LinearTaskAdapter instance', () => {
      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      const adapter = provider.getTaskAdapter();

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(LinearTaskAdapter);
    });

    test('returns the same adapter instance on multiple calls', () => {
      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      const adapter1 = provider.getTaskAdapter();
      const adapter2 = provider.getTaskAdapter();

      expect(adapter1).toBe(adapter2);
    });

    test('adapter has required methods', () => {
      const provider = createLinearProvider({ apiKey: 'lin_api_test' });
      const adapter = provider.getTaskAdapter();

      expect(typeof adapter.getIssue).toBe('function');
      expect(typeof adapter.listIssuesSince).toBe('function');
      expect(typeof adapter.createIssue).toBe('function');
      expect(typeof adapter.updateIssue).toBe('function');
      expect(typeof adapter.getFieldMapConfig).toBe('function');
    });
  });
});

// ============================================================================
// Tests: createLinearPlaceholderProvider
// ============================================================================

describe('LinearPlaceholderProvider', () => {
  // --------------------------------------------------------------------------
  // Basic Properties
  // --------------------------------------------------------------------------

  describe('properties', () => {
    test('name is "linear"', () => {
      const provider = createLinearPlaceholderProvider();
      expect(provider.name).toBe('linear');
    });

    test('displayName is "Linear"', () => {
      const provider = createLinearPlaceholderProvider();
      expect(provider.displayName).toBe('Linear');
    });

    test('supportedAdapters includes "task"', () => {
      const provider = createLinearPlaceholderProvider();
      expect(provider.supportedAdapters).toContain('task');
    });
  });

  // --------------------------------------------------------------------------
  // testConnection
  // --------------------------------------------------------------------------

  describe('testConnection', () => {
    test('always returns false', async () => {
      const provider = createLinearPlaceholderProvider();
      const result = await provider.testConnection({
        provider: 'linear',
        token: 'any-token',
      });

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getTaskAdapter (placeholder)
  // --------------------------------------------------------------------------

  describe('getTaskAdapter', () => {
    test('returns a task adapter', () => {
      const provider = createLinearPlaceholderProvider();
      const adapter = provider.getTaskAdapter();

      expect(adapter).toBeDefined();
    });

    test('placeholder adapter throws on getIssue', async () => {
      const provider = createLinearPlaceholderProvider();
      const adapter = provider.getTaskAdapter();

      try {
        await adapter.getIssue('ENG', 'some-id');
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('not yet configured');
      }
    });

    test('placeholder adapter throws on listIssuesSince', async () => {
      const provider = createLinearPlaceholderProvider();
      const adapter = provider.getTaskAdapter();

      try {
        await adapter.listIssuesSince('ENG', '2024-01-01T00:00:00Z');
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('not yet configured');
      }
    });

    test('placeholder adapter throws on createIssue', async () => {
      const provider = createLinearPlaceholderProvider();
      const adapter = provider.getTaskAdapter();

      try {
        await adapter.createIssue('ENG', {
          title: 'Test',
          state: 'open',
          labels: [],
          assignees: [],
        } as never);
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('not yet configured');
      }
    });

    test('placeholder adapter throws on updateIssue', async () => {
      const provider = createLinearPlaceholderProvider();
      const adapter = provider.getTaskAdapter();

      try {
        await adapter.updateIssue('ENG', 'some-id', {} as never);
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('not yet configured');
      }
    });

    test('placeholder adapter returns field map config', () => {
      const provider = createLinearPlaceholderProvider();
      const adapter = provider.getTaskAdapter();
      const config = adapter.getFieldMapConfig();

      expect(config).toBeDefined();
      expect(config.provider).toBe('linear');
      expect(config.fields.length).toBeGreaterThan(0);
    });
  });
});
