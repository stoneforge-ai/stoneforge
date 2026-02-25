/**
 * Linear API Client Tests
 *
 * Tests for the fetch-based Linear GraphQL API client.
 * Uses mock fetch to simulate Linear API responses.
 */

import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  LinearApiClient,
  LinearApiError,
  isLinearApiError,
  parseRateLimitHeaders,
  type RateLimitInfo,
  type GraphQLError,
} from './linear-api.js';
import type { LinearIssue, LinearTeam, LinearUser, LinearWorkflowState } from './linear-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Default rate limit headers for successful Linear responses */
const defaultRateLimitHeaders: Record<string, string> = {
  'X-RateLimit-Requests-Limit': '5000',
  'X-RateLimit-Requests-Remaining': '4999',
  'X-RateLimit-Requests-Reset': '1700000000',
};

/** Creates a mock Linear issue matching the LinearIssue type */
function createMockIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-uuid-1',
    identifier: 'ENG-123',
    title: 'Test Issue',
    description: 'This is a test issue description.',
    priority: 3,
    url: 'https://linear.app/myco/issue/ENG-123',
    state: {
      id: 'state-uuid-1',
      name: 'In Progress',
      type: 'started',
    },
    assignee: {
      id: 'user-uuid-1',
      name: 'Alice',
      email: 'alice@example.com',
    },
    team: {
      id: 'team-uuid-1',
      key: 'ENG',
      name: 'Engineering',
    },
    labels: {
      nodes: [
        { id: 'label-uuid-1', name: 'bug' },
      ],
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    archivedAt: null,
    ...overrides,
  };
}

/** Creates a mock viewer response */
function createMockViewer() {
  return {
    id: 'user-uuid-1',
    name: 'Alice',
    email: 'alice@example.com',
  };
}

/** Creates a mock team */
function createMockTeam(overrides: Partial<LinearTeam> = {}): LinearTeam {
  return {
    id: 'team-uuid-1',
    key: 'ENG',
    name: 'Engineering',
    ...overrides,
  };
}

/** Creates a mock workflow state */
function createMockWorkflowState(
  overrides: Partial<LinearWorkflowState> = {}
): LinearWorkflowState {
  return {
    id: 'state-uuid-1',
    name: 'In Progress',
    type: 'started',
    ...overrides,
  };
}

/** Creates a mock GraphQL response body */
function createGraphQLResponse<T>(data: T, errors?: GraphQLError[]) {
  return { data, errors };
}

/** Creates a mock Response object for GraphQL */
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
      createMockResponse(createGraphQLResponse({ viewer: createMockViewer() }))
    )
  );
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function setMockFetchResponse(
  body: unknown,
  status: number = 200,
  headers?: Record<string, string>
) {
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

describe('LinearApiClient', () => {
  let client: LinearApiClient;

  beforeEach(() => {
    setupMockFetch();
    client = new LinearApiClient({ apiKey: 'lin_api_testkey123' });
  });

  afterEach(() => {
    restoreFetch();
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    test('throws if API key is empty', () => {
      expect(() => new LinearApiClient({ apiKey: '' })).toThrow('Linear API key is required');
    });

    test('creates client with valid API key', () => {
      const c = new LinearApiClient({ apiKey: 'lin_api_test' });
      expect(c).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Request Headers
  // --------------------------------------------------------------------------

  describe('request headers', () => {
    test('sends Authorization header without Bearer prefix', async () => {
      setMockFetchResponse(createGraphQLResponse({ viewer: createMockViewer() }));
      await client.getViewer();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('lin_api_testkey123');
    });

    test('sends Content-Type application/json', async () => {
      setMockFetchResponse(createGraphQLResponse({ viewer: createMockViewer() }));
      await client.getViewer();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    test('sends POST method for GraphQL requests', async () => {
      setMockFetchResponse(createGraphQLResponse({ viewer: createMockViewer() }));
      await client.getViewer();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
    });

    test('sends request to Linear GraphQL endpoint', async () => {
      setMockFetchResponse(createGraphQLResponse({ viewer: createMockViewer() }));
      await client.getViewer();

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.linear.app/graphql');
    });

    test('sends query and variables in body', async () => {
      setMockFetchResponse(
        createGraphQLResponse({ issue: createMockIssue() })
      );
      await client.getIssue('ENG-123');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.query).toBeDefined();
      expect(body.variables).toEqual({ issueId: 'ENG-123' });
    });
  });

  // --------------------------------------------------------------------------
  // getViewer
  // --------------------------------------------------------------------------

  describe('getViewer', () => {
    test('returns viewer identity', async () => {
      setMockFetchResponse(createGraphQLResponse({ viewer: createMockViewer() }));

      const viewer = await client.getViewer();

      expect(viewer.id).toBe('user-uuid-1');
      expect(viewer.name).toBe('Alice');
      expect(viewer.email).toBe('alice@example.com');
    });
  });

  // --------------------------------------------------------------------------
  // getTeams
  // --------------------------------------------------------------------------

  describe('getTeams', () => {
    test('returns array of teams', async () => {
      const teams = [
        createMockTeam({ id: 'team-1', key: 'ENG', name: 'Engineering' }),
        createMockTeam({ id: 'team-2', key: 'DES', name: 'Design' }),
      ];
      setMockFetchResponse(createGraphQLResponse({ teams: { nodes: teams } }));

      const result = await client.getTeams();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('ENG');
      expect(result[1].key).toBe('DES');
    });
  });

  // --------------------------------------------------------------------------
  // getTeamWorkflowStates
  // --------------------------------------------------------------------------

  describe('getTeamWorkflowStates', () => {
    test('returns workflow states for a team', async () => {
      const states = [
        createMockWorkflowState({ id: 's1', name: 'Triage', type: 'triage' }),
        createMockWorkflowState({ id: 's2', name: 'Backlog', type: 'backlog' }),
        createMockWorkflowState({ id: 's3', name: 'Todo', type: 'unstarted' }),
        createMockWorkflowState({ id: 's4', name: 'In Progress', type: 'started' }),
        createMockWorkflowState({ id: 's5', name: 'Done', type: 'completed' }),
        createMockWorkflowState({ id: 's6', name: 'Canceled', type: 'canceled' }),
      ];
      setMockFetchResponse(
        createGraphQLResponse({ team: { states: { nodes: states } } })
      );

      const result = await client.getTeamWorkflowStates('team-uuid-1');

      expect(result).toHaveLength(6);
      expect(result[0].type).toBe('triage');
      expect(result[5].type).toBe('canceled');
    });

    test('passes teamId as variable', async () => {
      setMockFetchResponse(
        createGraphQLResponse({ team: { states: { nodes: [] } } })
      );

      await client.getTeamWorkflowStates('team-uuid-999');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.variables.teamId).toBe('team-uuid-999');
    });
  });

  // --------------------------------------------------------------------------
  // getIssue
  // --------------------------------------------------------------------------

  describe('getIssue', () => {
    test('returns issue when found', async () => {
      const issue = createMockIssue({ identifier: 'ENG-42', title: 'Found Bug' });
      setMockFetchResponse(createGraphQLResponse({ issue }));

      const result = await client.getIssue('ENG-42');

      expect(result).not.toBeNull();
      expect(result!.identifier).toBe('ENG-42');
      expect(result!.title).toBe('Found Bug');
    });

    test('returns null when issue is not found (GraphQL error)', async () => {
      setMockFetchResponse(
        {
          data: null,
          errors: [
            {
              message: 'Entity not found',
              extensions: { code: 'RESOURCE_NOT_FOUND' },
            },
          ],
        },
        200
      );

      const result = await client.getIssue('nonexistent-uuid');

      expect(result).toBeNull();
    });

    test('returns null when issue not found by message', async () => {
      setMockFetchResponse(
        {
          data: null,
          errors: [
            {
              message: 'Issue not found',
            },
          ],
        },
        200
      );

      const result = await client.getIssue('nonexistent');

      expect(result).toBeNull();
    });

    test('throws on non-not-found GraphQL errors', async () => {
      setMockFetchResponse(
        {
          data: null,
          errors: [
            {
              message: 'Internal server error',
            },
          ],
        },
        200
      );

      try {
        await client.getIssue('some-uuid');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.graphqlErrors).toHaveLength(1);
        expect(apiErr.message).toContain('Internal server error');
      }
    });

    test('passes issueId as variable', async () => {
      setMockFetchResponse(createGraphQLResponse({ issue: createMockIssue() }));

      await client.getIssue('uuid-123');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.variables.issueId).toBe('uuid-123');
    });
  });

  // --------------------------------------------------------------------------
  // listIssuesSince
  // --------------------------------------------------------------------------

  describe('listIssuesSince', () => {
    test('returns issues for a team', async () => {
      const issues = [
        createMockIssue({ id: 'i1', identifier: 'ENG-1' }),
        createMockIssue({ id: 'i2', identifier: 'ENG-2' }),
      ];
      setMockFetchResponse(
        createGraphQLResponse({
          issues: {
            nodes: issues,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        })
      );

      const result = await client.listIssuesSince('ENG', '2024-01-01T00:00:00Z');

      expect(result).toHaveLength(2);
      expect(result[0].identifier).toBe('ENG-1');
      expect(result[1].identifier).toBe('ENG-2');
    });

    test('passes teamKey and since as variables', async () => {
      setMockFetchResponse(
        createGraphQLResponse({
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        })
      );

      await client.listIssuesSince('DES', '2024-06-15T12:00:00Z');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.variables.teamKey).toBe('DES');
      expect(body.variables.since).toBe('2024-06-15T12:00:00Z');
    });

    test('auto-paginates with cursor pagination', async () => {
      const page1Issues = [
        createMockIssue({ id: 'i1', identifier: 'ENG-1' }),
        createMockIssue({ id: 'i2', identifier: 'ENG-2' }),
      ];
      const page2Issues = [
        createMockIssue({ id: 'i3', identifier: 'ENG-3' }),
      ];

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse(
              createGraphQLResponse({
                issues: {
                  nodes: page1Issues,
                  pageInfo: { hasNextPage: true, endCursor: 'cursor-abc' },
                },
              })
            )
          );
        }
        return Promise.resolve(
          createMockResponse(
            createGraphQLResponse({
              issues: {
                nodes: page2Issues,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            })
          )
        );
      });

      const result = await client.listIssuesSince('ENG', '2024-01-01T00:00:00Z');

      expect(result).toHaveLength(3);
      expect(result[0].identifier).toBe('ENG-1');
      expect(result[1].identifier).toBe('ENG-2');
      expect(result[2].identifier).toBe('ENG-3');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('passes cursor as after variable in pagination', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse(
              createGraphQLResponse({
                issues: {
                  nodes: [createMockIssue()],
                  pageInfo: { hasNextPage: true, endCursor: 'cursor-xyz' },
                },
              })
            )
          );
        }
        return Promise.resolve(
          createMockResponse(
            createGraphQLResponse({
              issues: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            })
          )
        );
      });

      await client.listIssuesSince('ENG', '2024-01-01T00:00:00Z');

      // Second call should include the cursor
      const [, init2] = mockFetch.mock.calls[1] as [string, RequestInit];
      const body2 = JSON.parse(init2.body as string);
      expect(body2.variables.after).toBe('cursor-xyz');
    });

    test('does not pass after variable on first page', async () => {
      setMockFetchResponse(
        createGraphQLResponse({
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        })
      );

      await client.listIssuesSince('ENG', '2024-01-01T00:00:00Z');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.variables.after).toBeUndefined();
    });

    test('handles three pages of results', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            createMockResponse(
              createGraphQLResponse({
                issues: {
                  nodes: [createMockIssue({ id: 'i1' })],
                  pageInfo: { hasNextPage: true, endCursor: 'c1' },
                },
              })
            )
          );
        }
        if (callCount === 2) {
          return Promise.resolve(
            createMockResponse(
              createGraphQLResponse({
                issues: {
                  nodes: [createMockIssue({ id: 'i2' })],
                  pageInfo: { hasNextPage: true, endCursor: 'c2' },
                },
              })
            )
          );
        }
        return Promise.resolve(
          createMockResponse(
            createGraphQLResponse({
              issues: {
                nodes: [createMockIssue({ id: 'i3' })],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            })
          )
        );
      });

      const result = await client.listIssuesSince('ENG', '2024-01-01T00:00:00Z');

      expect(result).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // --------------------------------------------------------------------------
  // createIssue
  // --------------------------------------------------------------------------

  describe('createIssue', () => {
    test('creates an issue and returns it', async () => {
      const createdIssue = createMockIssue({ identifier: 'ENG-99', title: 'New Feature' });
      setMockFetchResponse(
        createGraphQLResponse({
          issueCreate: { success: true, issue: createdIssue },
        })
      );

      const result = await client.createIssue({
        teamId: 'team-uuid-1',
        title: 'New Feature',
        description: 'Feature description',
        priority: 2,
      });

      expect(result.identifier).toBe('ENG-99');
      expect(result.title).toBe('New Feature');
    });

    test('sends input as variable', async () => {
      setMockFetchResponse(
        createGraphQLResponse({
          issueCreate: { success: true, issue: createMockIssue() },
        })
      );

      await client.createIssue({
        teamId: 'team-uuid-1',
        title: 'Test Issue',
        description: 'Description text',
        priority: 3,
        stateId: 'state-uuid-1',
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.variables.input).toEqual({
        teamId: 'team-uuid-1',
        title: 'Test Issue',
        description: 'Description text',
        priority: 3,
        stateId: 'state-uuid-1',
      });
    });

    test('throws when issueCreate returns success: false', async () => {
      setMockFetchResponse(
        createGraphQLResponse({
          issueCreate: { success: false, issue: null },
        })
      );

      try {
        await client.createIssue({ teamId: 'team-uuid-1', title: 'Fail' });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.message).toContain('success: false');
      }
    });
  });

  // --------------------------------------------------------------------------
  // updateIssue
  // --------------------------------------------------------------------------

  describe('updateIssue', () => {
    test('updates an issue and returns it', async () => {
      const updatedIssue = createMockIssue({ title: 'Updated Title', priority: 1 });
      setMockFetchResponse(
        createGraphQLResponse({
          issueUpdate: { success: true, issue: updatedIssue },
        })
      );

      const result = await client.updateIssue('issue-uuid-1', {
        title: 'Updated Title',
        priority: 1,
      });

      expect(result.title).toBe('Updated Title');
      expect(result.priority).toBe(1);
    });

    test('sends issueId and input as variables', async () => {
      setMockFetchResponse(
        createGraphQLResponse({
          issueUpdate: { success: true, issue: createMockIssue() },
        })
      );

      await client.updateIssue('issue-uuid-42', {
        title: 'New Title',
        stateId: 'state-uuid-5',
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.variables.issueId).toBe('issue-uuid-42');
      expect(body.variables.input).toEqual({
        title: 'New Title',
        stateId: 'state-uuid-5',
      });
    });

    test('throws when issueUpdate returns success: false', async () => {
      setMockFetchResponse(
        createGraphQLResponse({
          issueUpdate: { success: false, issue: null },
        })
      );

      try {
        await client.updateIssue('issue-uuid-1', { title: 'Fail' });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.message).toContain('success: false');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    test('throws LinearApiError on non-200 HTTP response', async () => {
      setMockFetchResponse(
        { errors: [{ message: 'Unauthorized' }] },
        401
      );

      try {
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.isAuthError).toBe(true);
        expect(apiErr.message).toContain('Unauthorized');
      }
    });

    test('handles GraphQL partial errors (data + errors)', async () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      setMockFetchResponse(
        {
          data: { viewer: createMockViewer() },
          errors: [{ message: 'Deprecated field used' }],
        },
        200
      );

      const result = await client.getViewer();

      // Should return data despite partial errors
      expect(result.name).toBe('Alice');
      // Should log a warning
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toContain('Partial GraphQL errors');
      expect(warnMessage).toContain('Deprecated field used');

      warnSpy.mockRestore();
    });

    test('throws on GraphQL errors with no data', async () => {
      setMockFetchResponse(
        {
          data: null,
          errors: [{ message: 'Query validation failed' }],
        },
        200
      );

      try {
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.status).toBe(200);
        expect(apiErr.graphqlErrors).toHaveLength(1);
        expect(apiErr.message).toContain('Query validation failed');
      }
    });

    test('wraps network errors in LinearApiError', async () => {
      setMockFetchError(new TypeError('fetch failed'));

      try {
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.message).toContain('Network error');
        expect(apiErr.message).toContain('fetch failed');
        expect(apiErr.cause).toBeInstanceOf(TypeError);
      }
    });

    test('handles non-JSON error response body', async () => {
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
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.message).toContain('500');
      }
    });

    test('throws on response with no data field', async () => {
      setMockFetchResponse({}, 200);

      try {
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.message).toContain('no data');
      }
    });

    test('includes rate limit info in error when available', async () => {
      setMockFetchResponse(
        { errors: [{ message: 'Server Error' }] },
        500,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '4000',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      try {
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        const apiErr = err as LinearApiError;
        expect(apiErr.rateLimit).not.toBeNull();
        expect(apiErr.rateLimit!.remaining).toBe(4000);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Rate Limit Handling
  // --------------------------------------------------------------------------

  describe('rate limit handling', () => {
    test('tracks rate limit info from response headers', async () => {
      setMockFetchResponse(
        createGraphQLResponse({ viewer: createMockViewer() }),
        200,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '4998',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      await client.getViewer();

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
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      setMockFetchResponse(
        createGraphQLResponse({ viewer: createMockViewer() }),
        200,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '5',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      await client.getViewer();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toContain('Rate limit warning');
      expect(warnMessage).toContain('5/5000');

      warnSpy.mockRestore();
    });

    test('does not log warning when rate limit is above threshold', async () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      setMockFetchResponse(
        createGraphQLResponse({ viewer: createMockViewer() }),
        200,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '4999',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      await client.getViewer();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('custom warning threshold is respected', async () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const customClient = new LinearApiClient({
        apiKey: 'lin_api_test',
        rateLimitWarningThreshold: 200,
      });

      setMockFetchResponse(
        createGraphQLResponse({ viewer: createMockViewer() }),
        200,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '150',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      await customClient.getViewer();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    test('throws with rate limit info when rate limit exhausted (429)', async () => {
      setMockFetchResponse(
        { errors: [{ message: 'Rate limit exceeded' }] },
        429,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '0',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      try {
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        expect(isLinearApiError(err)).toBe(true);
        const apiErr = err as LinearApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.isRateLimited).toBe(true);
        expect(apiErr.rateLimit).not.toBeNull();
        expect(apiErr.rateLimit!.remaining).toBe(0);
        expect(apiErr.message).toContain('rate limit exhausted');
      }
    });

    test('detects rate limit exhaustion via remaining=0 (non-429)', async () => {
      setMockFetchResponse(
        { errors: [{ message: 'Too many requests' }] },
        403,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '0',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      try {
        await client.getViewer();
        throw new Error('Should have thrown');
      } catch (err) {
        const apiErr = err as LinearApiError;
        expect(apiErr.message).toContain('rate limit exhausted');
      }
    });

    test('does not warn when remaining is 0 (error handles it)', async () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      setMockFetchResponse(
        { errors: [{ message: 'Rate limit exceeded' }] },
        429,
        {
          'X-RateLimit-Requests-Limit': '5000',
          'X-RateLimit-Requests-Remaining': '0',
          'X-RateLimit-Requests-Reset': '1700000000',
        }
      );

      try {
        await client.getViewer();
      } catch {
        // Expected
      }

      // Warning only fires when remaining > 0 and <= threshold
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('parses standard fallback rate limit headers', async () => {
      setMockFetchResponse(
        createGraphQLResponse({ viewer: createMockViewer() }),
        200,
        {
          'X-RateLimit-Limit': '2500',
          'X-RateLimit-Remaining': '2400',
          'X-RateLimit-Reset': '1800000000',
        }
      );

      await client.getViewer();

      const rateLimit = client.getRateLimit();
      expect(rateLimit).not.toBeNull();
      expect(rateLimit!.limit).toBe(2500);
      expect(rateLimit!.remaining).toBe(2400);
    });
  });

  // --------------------------------------------------------------------------
  // LinearApiError
  // --------------------------------------------------------------------------

  describe('LinearApiError', () => {
    test('serializes to JSON', () => {
      const error = new LinearApiError(
        'Test error',
        404,
        [{ message: 'Not found' }],
        { limit: 5000, remaining: 4999, reset: 1700000000 }
      );

      const json = error.toJSON();
      expect(json.name).toBe('LinearApiError');
      expect(json.message).toBe('Test error');
      expect(json.status).toBe(404);
      expect(json.graphqlErrors).toHaveLength(1);
      expect(json.rateLimit!.remaining).toBe(4999);
    });

    test('isRateLimited returns true for 429', () => {
      const error = new LinearApiError('Limited', 429, [], null);
      expect(error.isRateLimited).toBe(true);
    });

    test('isRateLimited returns true for remaining=0', () => {
      const error = new LinearApiError('Limited', 200, [], {
        limit: 5000,
        remaining: 0,
        reset: 1700000000,
      });
      expect(error.isRateLimited).toBe(true);
    });

    test('isRateLimited returns false for normal errors', () => {
      const error = new LinearApiError('Error', 500, [], {
        limit: 5000,
        remaining: 100,
        reset: 1700000000,
      });
      expect(error.isRateLimited).toBe(false);
    });

    test('isRateLimited returns false when no rate limit info', () => {
      const error = new LinearApiError('Error', 500, []);
      expect(error.isRateLimited).toBe(false);
    });

    test('isAuthError returns true for 401', () => {
      const error = new LinearApiError('Unauthorized', 401, []);
      expect(error.isAuthError).toBe(true);
    });

    test('isAuthError returns false for non-401', () => {
      const error = new LinearApiError('Error', 500, []);
      expect(error.isAuthError).toBe(false);
    });

    test('preserves cause chain', () => {
      const cause = new TypeError('Connection refused');
      const error = new LinearApiError('Network error', 0, [], null, cause);
      expect(error.cause).toBe(cause);
    });

    test('isLinearApiError type guard works', () => {
      const apiError = new LinearApiError('Test', 500, []);
      const regularError = new Error('Test');

      expect(isLinearApiError(apiError)).toBe(true);
      expect(isLinearApiError(regularError)).toBe(false);
      expect(isLinearApiError(null)).toBe(false);
      expect(isLinearApiError(undefined)).toBe(false);
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('parseRateLimitHeaders', () => {
  test('parses Linear-specific rate limit headers', () => {
    const headers = new Headers({
      'X-RateLimit-Requests-Limit': '5000',
      'X-RateLimit-Requests-Remaining': '4999',
      'X-RateLimit-Requests-Reset': '1700000000',
    });

    const result = parseRateLimitHeaders(headers);
    expect(result).toEqual({
      limit: 5000,
      remaining: 4999,
      reset: 1700000000,
    });
  });

  test('falls back to standard rate limit headers', () => {
    const headers = new Headers({
      'X-RateLimit-Limit': '2500',
      'X-RateLimit-Remaining': '2400',
      'X-RateLimit-Reset': '1800000000',
    });

    const result = parseRateLimitHeaders(headers);
    expect(result).toEqual({
      limit: 2500,
      remaining: 2400,
      reset: 1800000000,
    });
  });

  test('prefers Linear-specific headers over standard ones', () => {
    const headers = new Headers({
      'X-RateLimit-Requests-Limit': '5000',
      'X-RateLimit-Requests-Remaining': '4999',
      'X-RateLimit-Requests-Reset': '1700000000',
      'X-RateLimit-Limit': '2500',
      'X-RateLimit-Remaining': '2400',
      'X-RateLimit-Reset': '1800000000',
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
      'X-RateLimit-Requests-Limit': 'abc',
      'X-RateLimit-Requests-Remaining': '4999',
      'X-RateLimit-Requests-Reset': '1700000000',
    });
    expect(parseRateLimitHeaders(headers)).toBeNull();
  });

  test('returns null when some headers are missing', () => {
    const headers = new Headers({
      'X-RateLimit-Requests-Limit': '5000',
    });
    expect(parseRateLimitHeaders(headers)).toBeNull();
  });
});
