/**
 * GitHub API Client Tests
 *
 * Tests for the fetch-based GitHub REST API client.
 * Uses mock fetch to simulate GitHub API responses.
 */

import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  GitHubApiClient,
  GitHubApiError,
  isGitHubApiError,
  parseRateLimitHeaders,
  parseLinkHeaderNext,
  type GitHubIssue,
  type RateLimitInfo,
} from './github-api.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Default rate limit headers for successful responses */
const defaultRateLimitHeaders: Record<string, string> = {
  'X-RateLimit-Limit': '5000',
  'X-RateLimit-Remaining': '4999',
  'X-RateLimit-Reset': '1700000000',
};

/** Creates a mock GitHub issue matching the GitHubIssue type */
function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 1,
    number: 42,
    title: 'Test Issue',
    body: 'This is a test issue body.',
    state: 'open',
    labels: [{ id: 100, name: 'bug', color: 'fc2929', description: 'Bug report' }],
    assignees: [{ login: 'octocat', id: 1 }],
    html_url: 'https://github.com/owner/repo/issues/42',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

/** Creates a mock Response object */
function createMockResponse(
  body: unknown,
  status: number = 200,
  headers: Record<string, string> = defaultRateLimitHeaders
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 201 ? 'Created' : 'Error',
    headers: new Headers(headers),
  });
}

/** Saves and restores the global fetch */
let originalFetch: typeof globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

function setupMockFetch() {
  originalFetch = globalThis.fetch;
  mockFetch = mock(() =>
    Promise.resolve(createMockResponse(createMockIssue()))
  );
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function setMockFetchResponse(body: unknown, status: number = 200, headers?: Record<string, string>) {
  mockFetch.mockImplementation(() =>
    Promise.resolve(createMockResponse(body, status, headers ?? defaultRateLimitHeaders))
  );
}

function setMockFetchError(error: Error) {
  mockFetch.mockImplementation(() => Promise.reject(error));
}

// ============================================================================
// Tests
// ============================================================================

describe('GitHubApiClient', () => {
  let client: GitHubApiClient;

  beforeEach(() => {
    setupMockFetch();
    client = new GitHubApiClient({ token: 'ghp_testtoken123' });
  });

  afterEach(() => {
    restoreFetch();
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    test('throws if token is empty', () => {
      expect(() => new GitHubApiClient({ token: '' })).toThrow('GitHub API token is required');
    });

    test('uses default apiBaseUrl', () => {
      const c = new GitHubApiClient({ token: 'test' });
      // Verify by making a request and checking the URL
      c.getIssue('owner', 'repo', 1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toStartWith('https://api.github.com');
    });

    test('uses custom apiBaseUrl and strips trailing slash', () => {
      const c = new GitHubApiClient({ token: 'test', apiBaseUrl: 'https://github.example.com/api/v3/' });
      c.getIssue('owner', 'repo', 1);
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toStartWith('https://github.example.com/api/v3/repos/');
    });
  });

  // --------------------------------------------------------------------------
  // Request Headers
  // --------------------------------------------------------------------------

  describe('request headers', () => {
    test('sends Authorization header with Bearer token', async () => {
      await client.getIssue('owner', 'repo', 1);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer ghp_testtoken123');
    });

    test('sends Accept header for GitHub JSON', async () => {
      await client.getIssue('owner', 'repo', 1);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Accept).toBe('application/vnd.github+json');
    });

    test('sends X-GitHub-Api-Version header', async () => {
      await client.getIssue('owner', 'repo', 1);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    test('sends Content-Type for POST requests', async () => {
      setMockFetchResponse(createMockIssue(), 201);
      await client.createIssue('owner', 'repo', { title: 'New Issue' });
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // --------------------------------------------------------------------------
  // getIssue
  // --------------------------------------------------------------------------

  describe('getIssue', () => {
    test('fetches a single issue by number', async () => {
      const mockIssue = createMockIssue({ number: 42, title: 'Found Bug' });
      setMockFetchResponse(mockIssue);

      const issue = await client.getIssue('owner', 'repo', 42);

      expect(issue.number).toBe(42);
      expect(issue.title).toBe('Found Bug');
    });

    test('calls correct URL with encoded path segments', async () => {
      await client.getIssue('my-org', 'my-repo', 123);

      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toBe('https://api.github.com/repos/my-org/my-repo/issues/123');
    });

    test('uses GET method', async () => {
      await client.getIssue('owner', 'repo', 1);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('GET');
    });

    test('does not send body for GET requests', async () => {
      await client.getIssue('owner', 'repo', 1);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });

    test('throws GitHubApiError on 404', async () => {
      setMockFetchResponse({ message: 'Not Found' }, 404);

      try {
        await client.getIssue('owner', 'repo', 999);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isGitHubApiError(err)).toBe(true);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.isNotFound).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // listIssues
  // --------------------------------------------------------------------------

  describe('listIssues', () => {
    test('fetches issues with default params', async () => {
      const issues = [createMockIssue({ number: 1 }), createMockIssue({ number: 2 })];
      setMockFetchResponse(issues);

      const result = await client.listIssues('owner', 'repo');

      expect(result).toHaveLength(2);
      expect(result[0].number).toBe(1);
      expect(result[1].number).toBe(2);
    });

    test('passes query parameters', async () => {
      const issues = [createMockIssue()];
      setMockFetchResponse(issues);

      await client.listIssues('owner', 'repo', {
        since: '2024-01-01T00:00:00Z',
        state: 'open',
        per_page: 50,
      });

      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toContain('since=2024-01-01T00%3A00%3A00Z');
      expect(url).toContain('state=open');
      expect(url).toContain('per_page=50');
    });

    test('returns single page when page is specified', async () => {
      const issues = [createMockIssue()];
      setMockFetchResponse(issues);

      await client.listIssues('owner', 'repo', { page: 2, per_page: 10 });

      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toContain('page=2');
      expect(url).toContain('per_page=10');
      // Should only make one request (no pagination)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('auto-paginates when no page is specified', async () => {
      const page1 = [createMockIssue({ number: 1 }), createMockIssue({ number: 2 })];
      const page2 = [createMockIssue({ number: 3 })];

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify(page1), {
              status: 200,
              headers: new Headers({
                ...defaultRateLimitHeaders,
                Link: '<https://api.github.com/repos/owner/repo/issues?page=2&per_page=100>; rel="next", <https://api.github.com/repos/owner/repo/issues?page=2&per_page=100>; rel="last"',
              }),
            })
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(page2), {
            status: 200,
            headers: new Headers(defaultRateLimitHeaders),
          })
        );
      });

      const result = await client.listIssues('owner', 'repo');

      expect(result).toHaveLength(3);
      expect(result[0].number).toBe(1);
      expect(result[1].number).toBe(2);
      expect(result[2].number).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('sets per_page to 100 for auto-pagination', async () => {
      setMockFetchResponse([]);

      await client.listIssues('owner', 'repo');

      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toContain('per_page=100');
    });
  });

  // --------------------------------------------------------------------------
  // createIssue
  // --------------------------------------------------------------------------

  describe('createIssue', () => {
    test('creates an issue with all fields', async () => {
      const created = createMockIssue({ number: 99, title: 'New Feature' });
      setMockFetchResponse(created, 201);

      const result = await client.createIssue('owner', 'repo', {
        title: 'New Feature',
        body: 'Feature description',
        labels: ['enhancement'],
        assignees: ['octocat'],
      });

      expect(result.number).toBe(99);
      expect(result.title).toBe('New Feature');
    });

    test('sends POST request with JSON body', async () => {
      setMockFetchResponse(createMockIssue(), 201);

      await client.createIssue('owner', 'repo', {
        title: 'Test',
        body: 'Body text',
        labels: ['bug'],
      });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.github.com/repos/owner/repo/issues');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.title).toBe('Test');
      expect(body.body).toBe('Body text');
      expect(body.labels).toEqual(['bug']);
    });

    test('creates issue with only required fields', async () => {
      setMockFetchResponse(createMockIssue(), 201);

      await client.createIssue('owner', 'repo', { title: 'Minimal' });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.title).toBe('Minimal');
      expect(body.body).toBeUndefined();
      expect(body.labels).toBeUndefined();
      expect(body.assignees).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // updateIssue
  // --------------------------------------------------------------------------

  describe('updateIssue', () => {
    test('updates an issue', async () => {
      const updated = createMockIssue({ number: 42, title: 'Updated Title', state: 'closed' });
      setMockFetchResponse(updated);

      const result = await client.updateIssue('owner', 'repo', 42, {
        title: 'Updated Title',
        state: 'closed',
      });

      expect(result.title).toBe('Updated Title');
      expect(result.state).toBe('closed');
    });

    test('sends PATCH request to correct URL', async () => {
      setMockFetchResponse(createMockIssue());

      await client.updateIssue('owner', 'repo', 42, { title: 'New Title' });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.github.com/repos/owner/repo/issues/42');
      expect(init.method).toBe('PATCH');
    });

    test('sends partial updates in body', async () => {
      setMockFetchResponse(createMockIssue());

      await client.updateIssue('owner', 'repo', 42, {
        labels: ['bug', 'urgent'],
        assignees: ['alice', 'bob'],
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.labels).toEqual(['bug', 'urgent']);
      expect(body.assignees).toEqual(['alice', 'bob']);
      expect(body.title).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getLabels
  // --------------------------------------------------------------------------

  describe('getLabels', () => {
    test('fetches all labels for a repository', async () => {
      const labels = [
        { id: 1, name: 'bug', color: 'fc2929', description: 'Bug report' },
        { id: 2, name: 'enhancement', color: '0075ca', description: 'New feature' },
      ];
      setMockFetchResponse(labels);

      const result = await client.getLabels('owner', 'repo');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('bug');
      expect(result[1].name).toBe('enhancement');
    });

    test('calls correct URL', async () => {
      setMockFetchResponse([]);

      await client.getLabels('my-org', 'my-repo');

      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0] as string;
      expect(url).toContain('/repos/my-org/my-repo/labels');
    });

    test('uses GET method', async () => {
      setMockFetchResponse([]);

      await client.getLabels('owner', 'repo');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('GET');
    });
  });

  // --------------------------------------------------------------------------
  // createLabel
  // --------------------------------------------------------------------------

  describe('createLabel', () => {
    test('creates a label with all fields', async () => {
      const created = { id: 10, name: 'sf:priority:high', color: 'd93f0b', description: 'High priority' };
      setMockFetchResponse(created, 201);

      const result = await client.createLabel('owner', 'repo', {
        name: 'sf:priority:high',
        color: 'd93f0b',
        description: 'High priority',
      });

      expect(result.name).toBe('sf:priority:high');
      expect(result.color).toBe('d93f0b');
    });

    test('sends POST request with JSON body', async () => {
      setMockFetchResponse({ id: 10, name: 'test', color: '000000', description: null }, 201);

      await client.createLabel('owner', 'repo', {
        name: 'sf:type:bug',
        color: 'd73a4a',
        description: 'Bug label',
      });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.github.com/repos/owner/repo/labels');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.name).toBe('sf:type:bug');
      expect(body.color).toBe('d73a4a');
      expect(body.description).toBe('Bug label');
    });

    test('throws GitHubApiError on 422 (label already exists)', async () => {
      setMockFetchResponse(
        {
          message: 'Validation Failed',
          errors: [{ resource: 'Label', code: 'already_exists', field: 'name' }],
        },
        422
      );

      try {
        await client.createLabel('owner', 'repo', {
          name: 'sf:priority:high',
          color: 'd93f0b',
        });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isGitHubApiError(err)).toBe(true);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.responseBody?.errors).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Rate Limit Handling
  // --------------------------------------------------------------------------

  describe('rate limit handling', () => {
    let warnSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('tracks rate limit info from response headers', async () => {
      setMockFetchResponse(createMockIssue(), 200, {
        'X-RateLimit-Limit': '5000',
        'X-RateLimit-Remaining': '4998',
        'X-RateLimit-Reset': '1700000000',
      });

      await client.getIssue('owner', 'repo', 1);

      const rateLimit = client.getRateLimit();
      expect(rateLimit).not.toBeNull();
      expect(rateLimit!.limit).toBe(5000);
      expect(rateLimit!.remaining).toBe(4998);
      expect(rateLimit!.reset).toBe(1700000000);
    });

    test('returns null rate limit before any request', () => {
      expect(client.getRateLimit()).toBeNull();
    });

    test('logs warning when rate limit is near threshold', async () => {
      setMockFetchResponse(createMockIssue(), 200, {
        'X-RateLimit-Limit': '5000',
        'X-RateLimit-Remaining': '5',
        'X-RateLimit-Reset': '1700000000',
      });

      await client.getIssue('owner', 'repo', 1);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toContain('Rate limit warning');
      expect(warnMessage).toContain('5/5000');
    });

    test('does not log warning when rate limit is above threshold', async () => {
      setMockFetchResponse(createMockIssue(), 200, {
        'X-RateLimit-Limit': '5000',
        'X-RateLimit-Remaining': '4999',
        'X-RateLimit-Reset': '1700000000',
      });

      await client.getIssue('owner', 'repo', 1);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('custom warning threshold is respected', async () => {
      const customClient = new GitHubApiClient({
        token: 'test',
        rateLimitWarningThreshold: 100,
      });

      setMockFetchResponse(createMockIssue(), 200, {
        'X-RateLimit-Limit': '5000',
        'X-RateLimit-Remaining': '50',
        'X-RateLimit-Reset': '1700000000',
      });

      await customClient.getIssue('owner', 'repo', 1);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    test('throws with rate limit info when rate limit exhausted', async () => {
      setMockFetchResponse(
        { message: 'API rate limit exceeded' },
        403,
        {
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1700000000',
        }
      );

      try {
        await client.getIssue('owner', 'repo', 1);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isGitHubApiError(err)).toBe(true);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.isRateLimited).toBe(true);
        expect(apiErr.rateLimit).not.toBeNull();
        expect(apiErr.rateLimit!.remaining).toBe(0);
        expect(apiErr.message).toContain('rate limit exhausted');
      }
    });

    test('does not warn when remaining is 0 (error handles it)', async () => {
      setMockFetchResponse(
        { message: 'API rate limit exceeded' },
        403,
        {
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1700000000',
        }
      );

      try {
        await client.getIssue('owner', 'repo', 1);
      } catch {
        // Expected
      }

      // Warning only fires when remaining > 0 and <= threshold
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    test('throws GitHubApiError on non-OK response', async () => {
      setMockFetchResponse({ message: 'Validation Failed' }, 422);

      try {
        await client.createIssue('owner', 'repo', { title: '' });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isGitHubApiError(err)).toBe(true);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.message).toContain('Validation Failed');
        expect(apiErr.responseBody).toEqual({ message: 'Validation Failed' });
      }
    });

    test('throws GitHubApiError on 401 auth error', async () => {
      setMockFetchResponse({ message: 'Bad credentials' }, 401);

      try {
        await client.getIssue('owner', 'repo', 1);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isGitHubApiError(err)).toBe(true);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.isAuthError).toBe(true);
        expect(apiErr.isNotFound).toBe(false);
        expect(apiErr.isRateLimited).toBe(false);
      }
    });

    test('wraps network errors in GitHubApiError', async () => {
      setMockFetchError(new TypeError('fetch failed'));

      try {
        await client.getIssue('owner', 'repo', 1);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isGitHubApiError(err)).toBe(true);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.statusText).toBe('Network Error');
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
            headers: new Headers(defaultRateLimitHeaders),
          })
        )
      );

      try {
        await client.getIssue('owner', 'repo', 1);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isGitHubApiError(err)).toBe(true);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.responseBody).toBeNull();
        expect(apiErr.message).toContain('500');
      }
    });

    test('includes rate limit info in error when available', async () => {
      setMockFetchResponse({ message: 'Server Error' }, 500, {
        'X-RateLimit-Limit': '5000',
        'X-RateLimit-Remaining': '4000',
        'X-RateLimit-Reset': '1700000000',
      });

      try {
        await client.getIssue('owner', 'repo', 1);
        throw new Error('Should have thrown');
      } catch (err) {
        const apiErr = err as GitHubApiError;
        expect(apiErr.rateLimit).not.toBeNull();
        expect(apiErr.rateLimit!.remaining).toBe(4000);
      }
    });
  });

  // --------------------------------------------------------------------------
  // GitHubApiError
  // --------------------------------------------------------------------------

  describe('GitHubApiError', () => {
    test('serializes to JSON', () => {
      const error = new GitHubApiError('Test error', 404, 'Not Found', {
        limit: 5000,
        remaining: 4999,
        reset: 1700000000,
      });

      const json = error.toJSON();
      expect(json.name).toBe('GitHubApiError');
      expect(json.message).toBe('Test error');
      expect(json.status).toBe(404);
      expect(json.statusText).toBe('Not Found');
      expect(json.rateLimit!.remaining).toBe(4999);
    });

    test('isRateLimited returns true for 403 with 0 remaining', () => {
      const error = new GitHubApiError('Limited', 403, 'Forbidden', {
        limit: 5000,
        remaining: 0,
        reset: 1700000000,
      });
      expect(error.isRateLimited).toBe(true);
    });

    test('isRateLimited returns false for 403 with remaining > 0', () => {
      const error = new GitHubApiError('Forbidden', 403, 'Forbidden', {
        limit: 5000,
        remaining: 100,
        reset: 1700000000,
      });
      expect(error.isRateLimited).toBe(false);
    });

    test('isRateLimited returns false when no rate limit info', () => {
      const error = new GitHubApiError('Forbidden', 403, 'Forbidden');
      expect(error.isRateLimited).toBe(false);
    });

    test('preserves cause chain', () => {
      const cause = new TypeError('Connection refused');
      const error = new GitHubApiError('Network error', 0, 'Network Error', null, null, cause);
      expect(error.cause).toBe(cause);
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('parseRateLimitHeaders', () => {
  test('parses valid rate limit headers', () => {
    const headers = new Headers({
      'X-RateLimit-Limit': '5000',
      'X-RateLimit-Remaining': '4999',
      'X-RateLimit-Reset': '1700000000',
    });

    const result = parseRateLimitHeaders(headers);
    expect(result).toEqual({
      limit: 5000,
      remaining: 4999,
      reset: 1700000000,
    });
  });

  test('returns null when headers are missing', () => {
    const headers = new Headers();
    expect(parseRateLimitHeaders(headers)).toBeNull();
  });

  test('returns null when headers contain non-numeric values', () => {
    const headers = new Headers({
      'X-RateLimit-Limit': 'abc',
      'X-RateLimit-Remaining': '4999',
      'X-RateLimit-Reset': '1700000000',
    });
    expect(parseRateLimitHeaders(headers)).toBeNull();
  });

  test('returns null when some headers are missing', () => {
    const headers = new Headers({
      'X-RateLimit-Limit': '5000',
    });
    expect(parseRateLimitHeaders(headers)).toBeNull();
  });
});

describe('parseLinkHeaderNext', () => {
  test('parses next link from Link header', () => {
    const header =
      '<https://api.github.com/repos/owner/repo/issues?page=2&per_page=100>; rel="next", ' +
      '<https://api.github.com/repos/owner/repo/issues?page=5&per_page=100>; rel="last"';

    const result = parseLinkHeaderNext(header);
    expect(result).toBe('https://api.github.com/repos/owner/repo/issues?page=2&per_page=100');
  });

  test('returns null when no next link', () => {
    const header =
      '<https://api.github.com/repos/owner/repo/issues?page=1&per_page=100>; rel="prev", ' +
      '<https://api.github.com/repos/owner/repo/issues?page=5&per_page=100>; rel="last"';

    expect(parseLinkHeaderNext(header)).toBeNull();
  });

  test('returns null for null header', () => {
    expect(parseLinkHeaderNext(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseLinkHeaderNext('')).toBeNull();
  });

  test('handles Link header with only next', () => {
    const header = '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"';
    expect(parseLinkHeaderNext(header)).toBe('https://api.github.com/repos/o/r/issues?page=2');
  });
});
