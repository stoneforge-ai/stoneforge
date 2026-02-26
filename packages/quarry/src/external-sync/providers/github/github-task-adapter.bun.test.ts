/**
 * GitHub Task Adapter — Unit Tests
 *
 * Tests for the GitHubTaskAdapter implementation of TaskSyncAdapter.
 * Mocks fetch to simulate GitHub API responses.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import type { GitHubIssue, GitHubLabel } from './github-api.js';
import { GitHubTaskAdapter, GITHUB_FIELD_MAP_CONFIG, getDefaultLabelColor } from './github-task-adapter.js';

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

// ============================================================================
// Fetch Mock Setup
// ============================================================================

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ============================================================================
// GitHubTaskAdapter Tests
// ============================================================================

describe('GitHubTaskAdapter', () => {
  describe('getIssue', () => {
    test('returns ExternalTask for valid issue', async () => {
      const mockIssue = createMockIssue();
      globalThis.fetch = async () => createMockResponse(mockIssue);

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.getIssue('owner/repo', '42');

      expect(result).not.toBeNull();
      expect(result!.externalId).toBe('42');
      expect(result!.title).toBe('Test Issue');
      expect(result!.provider).toBe('github');
      expect(result!.project).toBe('owner/repo');
      expect(result!.state).toBe('open');
      expect(result!.labels).toEqual(['bug']);
      expect(result!.assignees).toEqual(['octocat']);
      expect(result!.url).toBe('https://github.com/owner/repo/issues/42');
      expect(result!.body).toBe('This is a test issue body.');
    });

    test('returns null for 404 (not found)', async () => {
      globalThis.fetch = async () =>
        createMockResponse({ message: 'Not Found' }, 404, defaultRateLimitHeaders);

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.getIssue('owner/repo', '999');

      expect(result).toBeNull();
    });

    test('throws for invalid project format', async () => {
      const adapter = new GitHubTaskAdapter({ token: 'test-token' });

      await expect(adapter.getIssue('invalid-project', '42')).rejects.toThrow(
        /Invalid GitHub project format/
      );
    });

    test('throws for invalid issue number', async () => {
      const adapter = new GitHubTaskAdapter({ token: 'test-token' });

      await expect(adapter.getIssue('owner/repo', 'abc')).rejects.toThrow(
        /Invalid GitHub issue number/
      );
      await expect(adapter.getIssue('owner/repo', '0')).rejects.toThrow(
        /Invalid GitHub issue number/
      );
      await expect(adapter.getIssue('owner/repo', '-1')).rejects.toThrow(
        /Invalid GitHub issue number/
      );
    });

    test('maps closed issue with closedAt', async () => {
      const mockIssue = createMockIssue({
        state: 'closed',
        closed_at: '2024-01-10T00:00:00Z',
      });
      globalThis.fetch = async () => createMockResponse(mockIssue);

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.getIssue('owner/repo', '42');

      expect(result!.state).toBe('closed');
      expect(result!.closedAt).toBe('2024-01-10T00:00:00Z');
    });

    test('maps issue with null body to undefined', async () => {
      const mockIssue = createMockIssue({ body: null });
      globalThis.fetch = async () => createMockResponse(mockIssue);

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.getIssue('owner/repo', '42');

      expect(result!.body).toBeUndefined();
    });

    test('maps multiple labels and assignees', async () => {
      const mockIssue = createMockIssue({
        labels: [
          { id: 1, name: 'bug', color: 'fc2929', description: null },
          { id: 2, name: 'enhancement', color: '0075ca', description: null },
        ],
        assignees: [
          { login: 'octocat', id: 1 },
          { login: 'hubot', id: 2 },
        ],
      });
      globalThis.fetch = async () => createMockResponse(mockIssue);

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.getIssue('owner/repo', '42');

      expect(result!.labels).toEqual(['bug', 'enhancement']);
      expect(result!.assignees).toEqual(['octocat', 'hubot']);
    });
  });

  describe('listIssuesSince', () => {
    test('returns mapped external tasks', async () => {
      const issues = [
        createMockIssue({ number: 1, title: 'Issue 1' }),
        createMockIssue({ number: 2, title: 'Issue 2' }),
      ];
      globalThis.fetch = async () =>
        createMockResponse(issues, 200, {
          ...defaultRateLimitHeaders,
        });

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.listIssuesSince(
        'owner/repo',
        '2024-01-01T00:00:00Z' as any
      );

      expect(result).toHaveLength(2);
      expect(result[0].externalId).toBe('1');
      expect(result[0].title).toBe('Issue 1');
      expect(result[1].externalId).toBe('2');
      expect(result[1].title).toBe('Issue 2');
    });

    test('passes correct query parameters', async () => {
      let capturedUrl = '';
      globalThis.fetch = async (input: string | URL | Request) => {
        capturedUrl = typeof input === 'string' ? input : input.toString();
        return createMockResponse([], 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      await adapter.listIssuesSince('owner/repo', '2024-06-01T00:00:00.000Z' as any);

      expect(capturedUrl).toContain('state=all');
      expect(capturedUrl).toContain('per_page=100');
      // The since parameter should be ISO 8601
      expect(capturedUrl).toContain('since=');
    });
  });

  describe('createIssue', () => {
    test('creates issue and returns mapped ExternalTask', async () => {
      const createdIssue = createMockIssue({
        number: 99,
        title: 'New Issue',
        html_url: 'https://github.com/owner/repo/issues/99',
      });
      globalThis.fetch = async () => createMockResponse(createdIssue, 201);

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.createIssue('owner/repo', {
        title: 'New Issue',
        body: 'Description',
        labels: ['enhancement'],
        assignees: ['octocat'],
      });

      expect(result.externalId).toBe('99');
      expect(result.title).toBe('New Issue');
      expect(result.provider).toBe('github');
    });

    test('sends correct request body', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) {
          capturedBody = JSON.parse(init.body as string);
        }
        return createMockResponse(createMockIssue(), 201);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      await adapter.createIssue('owner/repo', {
        title: 'Test',
        body: 'Body text',
        labels: ['bug', 'feature'],
        assignees: ['user1'],
      });

      expect(capturedBody).toBeDefined();
      expect(capturedBody!.title).toBe('Test');
      expect(capturedBody!.body).toBe('Body text');
      expect(capturedBody!.labels).toEqual(['bug', 'feature']);
      expect(capturedBody!.assignees).toEqual(['user1']);
    });
  });

  describe('updateIssue', () => {
    test('updates issue and returns mapped ExternalTask', async () => {
      const updatedIssue = createMockIssue({
        number: 42,
        title: 'Updated Title',
        state: 'closed',
        closed_at: '2024-02-01T00:00:00Z',
      });
      globalThis.fetch = async () => createMockResponse(updatedIssue);

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.updateIssue('owner/repo', '42', {
        title: 'Updated Title',
        state: 'closed',
      });

      expect(result.externalId).toBe('42');
      expect(result.title).toBe('Updated Title');
      expect(result.state).toBe('closed');
    });

    test('sends only provided fields in request body', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) {
          capturedBody = JSON.parse(init.body as string);
        }
        return createMockResponse(createMockIssue());
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      await adapter.updateIssue('owner/repo', '42', { title: 'Only Title' });

      expect(capturedBody).toBeDefined();
      expect(capturedBody!.title).toBe('Only Title');
      // Other fields should not be present
      expect(capturedBody!.body).toBeUndefined();
      expect(capturedBody!.state).toBeUndefined();
    });

    test('throws for invalid issue number', async () => {
      const adapter = new GitHubTaskAdapter({ token: 'test-token' });

      await expect(
        adapter.updateIssue('owner/repo', 'abc', { title: 'Test' })
      ).rejects.toThrow(/Invalid GitHub issue number/);
    });
  });

  describe('getFieldMapConfig', () => {
    test('returns GitHub field map config', () => {
      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const config = adapter.getFieldMapConfig();

      expect(config.provider).toBe('github');
      expect(config.fields.length).toBeGreaterThan(0);
    });

    test('includes bidirectional title mapping', () => {
      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const config = adapter.getFieldMapConfig();

      const titleField = config.fields.find((f) => f.localField === 'title');
      expect(titleField).toBeDefined();
      expect(titleField!.externalField).toBe('title');
      expect(titleField!.direction).toBe('bidirectional');
    });

    test('includes status-to-state mapping', () => {
      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const config = adapter.getFieldMapConfig();

      const statusField = config.fields.find((f) => f.localField === 'status');
      expect(statusField).toBeDefined();
      expect(statusField!.externalField).toBe('state');
      expect(statusField!.toExternal).toBe('statusToGitHubState');
      expect(statusField!.toLocal).toBe('gitHubStateToStatus');
    });

    test('includes tags-to-labels mapping', () => {
      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const config = adapter.getFieldMapConfig();

      const tagsField = config.fields.find(
        (f) => f.localField === 'tags' && f.externalField === 'labels'
      );
      expect(tagsField).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // ensureLabelsExist
  // --------------------------------------------------------------------------

  describe('ensureLabelsExist', () => {
    test('creates missing sf:* labels on the repo', async () => {
      const createdLabels: Array<{ name: string; color: string }> = [];

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        // GET /repos/owner/repo/labels — return empty (no labels exist)
        if (method === 'GET' && url.includes('/labels')) {
          return createMockResponse([], 200);
        }

        // POST /repos/owner/repo/labels — record what was created
        if (method === 'POST' && url.includes('/labels')) {
          const body = JSON.parse(init?.body as string);
          createdLabels.push({ name: body.name, color: body.color });
          return createMockResponse(
            { id: createdLabels.length, name: body.name, color: body.color, description: body.description },
            201
          );
        }

        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      await adapter.ensureLabelsExist('owner/repo', [
        'sf:priority:high',
        'sf:type:bug',
        'user-tag', // non-sf label — should be skipped
      ]);

      expect(createdLabels).toHaveLength(2);
      expect(createdLabels[0].name).toBe('sf:priority:high');
      expect(createdLabels[1].name).toBe('sf:type:bug');
    });

    test('does not create labels that already exist on the repo', async () => {
      let createCalled = false;

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        // GET /repos/owner/repo/labels — labels already exist
        if (method === 'GET' && url.includes('/labels')) {
          return createMockResponse([
            { id: 1, name: 'sf:priority:high', color: 'd93f0b', description: null },
            { id: 2, name: 'sf:type:bug', color: 'd73a4a', description: null },
          ], 200);
        }

        if (method === 'POST' && url.includes('/labels')) {
          createCalled = true;
          return createMockResponse({}, 201);
        }

        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      await adapter.ensureLabelsExist('owner/repo', ['sf:priority:high', 'sf:type:bug']);

      expect(createCalled).toBe(false);
    });

    test('caches labels per repo to avoid redundant API calls', async () => {
      let getLabelsCalls = 0;

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (method === 'GET' && url.includes('/labels')) {
          getLabelsCalls++;
          return createMockResponse([
            { id: 1, name: 'sf:priority:high', color: 'd93f0b', description: null },
          ], 200);
        }

        if (method === 'POST' && url.includes('/labels')) {
          const body = JSON.parse(init?.body as string);
          return createMockResponse(
            { id: 99, name: body.name, color: body.color, description: null },
            201
          );
        }

        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });

      // First call: should fetch labels from API
      await adapter.ensureLabelsExist('owner/repo', ['sf:priority:high']);
      expect(getLabelsCalls).toBe(1);

      // Second call: should use cache, NOT call API again
      await adapter.ensureLabelsExist('owner/repo', ['sf:priority:high']);
      expect(getLabelsCalls).toBe(1);

      // Third call with new label: should use cache for existing, create new one
      await adapter.ensureLabelsExist('owner/repo', ['sf:priority:high', 'sf:type:task']);
      expect(getLabelsCalls).toBe(1); // still no additional getLabels call
    });

    test('handles 422 "already_exists" gracefully during concurrent creation', async () => {
      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (method === 'GET' && url.includes('/labels')) {
          return createMockResponse([], 200);
        }

        // Simulate a concurrent creation race — label was created by another process
        if (method === 'POST' && url.includes('/labels')) {
          return createMockResponse(
            {
              message: 'Validation Failed',
              errors: [{ resource: 'Label', code: 'already_exists', field: 'name' }],
            },
            422
          );
        }

        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });

      // Should NOT throw — the 422 "already_exists" is handled gracefully
      await adapter.ensureLabelsExist('owner/repo', ['sf:priority:high']);

      // Subsequent call should skip the label (it was added to cache)
      let createCalled = false;
      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (method === 'POST') createCalled = true;
        return createMockResponse({}, 200);
      };
      await adapter.ensureLabelsExist('owner/repo', ['sf:priority:high']);
      expect(createCalled).toBe(false);
    });

    test('throws on non-already_exists 422 errors', async () => {
      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (method === 'GET' && url.includes('/labels')) {
          return createMockResponse([], 200);
        }

        if (method === 'POST' && url.includes('/labels')) {
          return createMockResponse(
            {
              message: 'Validation Failed',
              errors: [{ resource: 'Label', code: 'invalid', field: 'color' }],
            },
            422
          );
        }

        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      await expect(
        adapter.ensureLabelsExist('owner/repo', ['sf:priority:high'])
      ).rejects.toThrow(/Validation Failed/);
    });

    test('skips non-sf labels entirely', async () => {
      let fetchCalled = false;

      globalThis.fetch = async () => {
        fetchCalled = true;
        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      await adapter.ensureLabelsExist('owner/repo', ['user-tag', 'another-tag']);

      // No API calls should be made for non-sf labels
      expect(fetchCalled).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // createIssue with label auto-creation
  // --------------------------------------------------------------------------

  describe('createIssue with label auto-creation', () => {
    test('ensures sf:* labels exist before creating issue', async () => {
      const apiCalls: Array<{ method: string; url: string }> = [];

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        apiCalls.push({ method, url });

        // GET /labels — no labels exist
        if (method === 'GET' && url.includes('/labels')) {
          return createMockResponse([], 200);
        }

        // POST /labels — create label
        if (method === 'POST' && url.includes('/labels')) {
          const body = JSON.parse(init?.body as string);
          return createMockResponse(
            { id: 10, name: body.name, color: body.color, description: null },
            201
          );
        }

        // POST /issues — create issue
        if (method === 'POST' && url.includes('/issues')) {
          return createMockResponse(
            createMockIssue({ number: 99, title: 'New Issue' }),
            201
          );
        }

        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.createIssue('owner/repo', {
        title: 'New Issue',
        labels: ['sf:priority:high', 'sf:type:bug', 'user-tag'],
      });

      expect(result.externalId).toBe('99');

      // Verify labels were created BEFORE the issue
      const labelCreates = apiCalls.filter(
        (c) => c.method === 'POST' && c.url.includes('/labels')
      );
      const issueCreate = apiCalls.findIndex(
        (c) => c.method === 'POST' && c.url.includes('/issues')
      );

      expect(labelCreates).toHaveLength(2);
      // Label creation should happen before issue creation
      const lastLabelCreateIndex = apiCalls.findIndex(
        (c) => c.method === 'POST' && c.url.includes('/labels') && c === labelCreates[1]
      );
      expect(lastLabelCreateIndex).toBeLessThan(issueCreate);
    });
  });

  // --------------------------------------------------------------------------
  // updateIssue with label auto-creation
  // --------------------------------------------------------------------------

  describe('updateIssue with label auto-creation', () => {
    test('ensures sf:* labels exist before updating issue', async () => {
      const apiCalls: Array<{ method: string; url: string }> = [];

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        apiCalls.push({ method, url });

        // GET /labels — no labels exist
        if (method === 'GET' && url.includes('/labels')) {
          return createMockResponse([], 200);
        }

        // POST /labels — create label
        if (method === 'POST' && url.includes('/labels')) {
          const body = JSON.parse(init?.body as string);
          return createMockResponse(
            { id: 10, name: body.name, color: body.color, description: null },
            201
          );
        }

        // PATCH /issues — update issue
        if (method === 'PATCH' && url.includes('/issues')) {
          return createMockResponse(createMockIssue({ number: 42, title: 'Updated' }));
        }

        return createMockResponse({}, 200);
      };

      const adapter = new GitHubTaskAdapter({ token: 'test-token' });
      const result = await adapter.updateIssue('owner/repo', '42', {
        labels: ['sf:priority:medium'],
      });

      expect(result.externalId).toBe('42');

      // Verify labels were created before the issue update
      const labelCreates = apiCalls.filter(
        (c) => c.method === 'POST' && c.url.includes('/labels')
      );
      expect(labelCreates).toHaveLength(1);
    });
  });
});

// ============================================================================
// getDefaultLabelColor Tests
// ============================================================================

describe('getDefaultLabelColor', () => {
  test('returns specific color for priority labels', () => {
    expect(getDefaultLabelColor('sf:priority:critical')).toBe('b60205');
    expect(getDefaultLabelColor('sf:priority:high')).toBe('d93f0b');
    expect(getDefaultLabelColor('sf:priority:medium')).toBe('fbca04');
    expect(getDefaultLabelColor('sf:priority:low')).toBe('0e8a16');
    expect(getDefaultLabelColor('sf:priority:minimal')).toBe('c5def5');
  });

  test('returns specific color for type labels', () => {
    expect(getDefaultLabelColor('sf:type:bug')).toBe('d73a4a');
    expect(getDefaultLabelColor('sf:type:feature')).toBe('a2eeef');
    expect(getDefaultLabelColor('sf:type:task')).toBe('0075ca');
    expect(getDefaultLabelColor('sf:type:chore')).toBe('e4e669');
  });

  test('returns fallback color for unknown sf labels', () => {
    expect(getDefaultLabelColor('sf:unknown:label')).toBe('ededed');
    expect(getDefaultLabelColor('sf:custom')).toBe('ededed');
  });
});

// ============================================================================
// GITHUB_FIELD_MAP_CONFIG Export Tests
// ============================================================================

describe('GITHUB_FIELD_MAP_CONFIG', () => {
  test('is exported and has expected shape', () => {
    expect(GITHUB_FIELD_MAP_CONFIG).toBeDefined();
    expect(GITHUB_FIELD_MAP_CONFIG.priorityLabels).toBeDefined();
    expect(GITHUB_FIELD_MAP_CONFIG.taskTypeLabels).toBeDefined();
    expect(GITHUB_FIELD_MAP_CONFIG.syncLabelPrefix).toBe('sf:');
    expect(typeof GITHUB_FIELD_MAP_CONFIG.statusToState).toBe('function');
    expect(typeof GITHUB_FIELD_MAP_CONFIG.stateToStatus).toBe('function');
  });

  test('priority labels map 1-5 to expected values', () => {
    const labels = GITHUB_FIELD_MAP_CONFIG.priorityLabels;
    expect(labels[1]).toBe('priority:critical');
    expect(labels[2]).toBe('priority:high');
    expect(labels[3]).toBe('priority:medium');
    expect(labels[4]).toBe('priority:low');
    expect(labels[5]).toBe('priority:minimal');
  });

  test('task type labels map to expected values', () => {
    const labels = GITHUB_FIELD_MAP_CONFIG.taskTypeLabels;
    expect(labels.bug).toBe('type:bug');
    expect(labels.feature).toBe('type:feature');
    expect(labels.task).toBe('type:task');
    expect(labels.chore).toBe('type:chore');
  });

  test('statusToState maps open statuses correctly', () => {
    const fn = GITHUB_FIELD_MAP_CONFIG.statusToState;
    expect(fn('open')).toBe('open');
    expect(fn('in_progress')).toBe('open');
    expect(fn('review')).toBe('open');
    expect(fn('blocked')).toBe('open');
    expect(fn('deferred')).toBe('open');
    expect(fn('backlog')).toBe('open');
  });

  test('statusToState maps closed statuses correctly', () => {
    const fn = GITHUB_FIELD_MAP_CONFIG.statusToState;
    expect(fn('closed')).toBe('closed');
    expect(fn('tombstone')).toBe('closed');
  });

  test('stateToStatus maps states back to statuses', () => {
    const fn = GITHUB_FIELD_MAP_CONFIG.stateToStatus;
    expect(fn('open', [])).toBe('open');
    expect(fn('closed', [])).toBe('closed');
  });
});
