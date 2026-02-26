/**
 * Linear Task Adapter Tests
 *
 * Tests for field mapping round-trips between Stoneforge and Linear.
 * Tests for workflow state caching behavior.
 * Uses mock API client to simulate Linear API responses.
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import type { Priority, TaskStatus } from '@stoneforge/core';
import {
  linearPriorityToStoneforge,
  stoneforgePriorityToLinear,
  linearStateTypeToStatus,
  statusToLinearStateType,
  shouldAddBlockedLabel,
  createLinearFieldMapConfig,
} from './linear-field-map.js';
import type { LinearStateType } from './linear-field-map.js';
import { LinearTaskAdapter } from './linear-task-adapter.js';
import type { LinearApiClient } from './linear-api.js';
import type { LinearIssue, LinearTeam, LinearWorkflowState } from './linear-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Creates a mock Linear issue */
function createMockIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-uuid-1',
    identifier: 'ENG-123',
    title: 'Test Issue',
    description: 'This is a test issue description in **markdown**.',
    priority: 3,
    url: 'https://linear.app/myco/issue/ENG-123',
    state: {
      id: 'state-uuid-started',
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
        { id: 'label-uuid-2', name: 'type:bug' },
      ],
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    archivedAt: null,
    ...overrides,
  };
}

/** Standard workflow states for a team */
const mockWorkflowStates: LinearWorkflowState[] = [
  { id: 'state-uuid-triage', name: 'Triage', type: 'triage' },
  { id: 'state-uuid-backlog', name: 'Backlog', type: 'backlog' },
  { id: 'state-uuid-unstarted', name: 'Todo', type: 'unstarted' },
  { id: 'state-uuid-started', name: 'In Progress', type: 'started' },
  { id: 'state-uuid-completed', name: 'Done', type: 'completed' },
  { id: 'state-uuid-canceled', name: 'Canceled', type: 'canceled' },
];

/** Standard teams */
const mockTeams: LinearTeam[] = [
  { id: 'team-uuid-1', key: 'ENG', name: 'Engineering' },
  { id: 'team-uuid-2', key: 'DES', name: 'Design' },
];

/** Creates a mock API client with all necessary methods */
function createMockApiClient(): LinearApiClient {
  return {
    getViewer: mock(() =>
      Promise.resolve({ id: 'user-1', name: 'Alice', email: 'alice@example.com' })
    ),
    getTeams: mock(() => Promise.resolve(mockTeams)),
    getTeamWorkflowStates: mock(() => Promise.resolve(mockWorkflowStates)),
    getIssue: mock(() => Promise.resolve(createMockIssue())),
    listIssuesSince: mock(() => Promise.resolve([createMockIssue()])),
    createIssue: mock(() => Promise.resolve(createMockIssue())),
    updateIssue: mock(() => Promise.resolve(createMockIssue())),
    getRateLimit: mock(() => null),
    graphql: mock(() => Promise.resolve({})),
  } as unknown as LinearApiClient;
}

// ============================================================================
// Priority Mapping Tests
// ============================================================================

describe('Priority Mapping', () => {
  describe('linearPriorityToStoneforge', () => {
    test('Linear 1 (Urgent) → Stoneforge 1 (critical)', () => {
      expect(linearPriorityToStoneforge(1)).toBe(1);
    });

    test('Linear 2 (High) → Stoneforge 2 (high)', () => {
      expect(linearPriorityToStoneforge(2)).toBe(2);
    });

    test('Linear 3 (Medium) → Stoneforge 3 (medium)', () => {
      expect(linearPriorityToStoneforge(3)).toBe(3);
    });

    test('Linear 4 (Low) → Stoneforge 4 (low)', () => {
      expect(linearPriorityToStoneforge(4)).toBe(4);
    });

    test('Linear 0 (No priority) → Stoneforge 5 (minimal)', () => {
      expect(linearPriorityToStoneforge(0)).toBe(5);
    });

    test('unknown value falls back to medium (3)', () => {
      expect(linearPriorityToStoneforge(99)).toBe(3);
      expect(linearPriorityToStoneforge(-1)).toBe(3);
    });
  });

  describe('stoneforgePriorityToLinear', () => {
    test('Stoneforge 1 (critical) → Linear 1 (Urgent)', () => {
      expect(stoneforgePriorityToLinear(1 as Priority)).toBe(1);
    });

    test('Stoneforge 2 (high) → Linear 2 (High)', () => {
      expect(stoneforgePriorityToLinear(2 as Priority)).toBe(2);
    });

    test('Stoneforge 3 (medium) → Linear 3 (Medium)', () => {
      expect(stoneforgePriorityToLinear(3 as Priority)).toBe(3);
    });

    test('Stoneforge 4 (low) → Linear 4 (Low)', () => {
      expect(stoneforgePriorityToLinear(4 as Priority)).toBe(4);
    });

    test('Stoneforge 5 (minimal) → Linear 0 (No priority)', () => {
      expect(stoneforgePriorityToLinear(5 as Priority)).toBe(0);
    });

    test('unknown value falls back to Medium (3)', () => {
      expect(stoneforgePriorityToLinear(99 as Priority)).toBe(3);
    });
  });

  describe('bidirectional round-trip', () => {
    test('all 5 priority values round-trip correctly', () => {
      // Linear → Stoneforge → Linear
      for (const linearVal of [0, 1, 2, 3, 4]) {
        const sfVal = linearPriorityToStoneforge(linearVal);
        const roundTripped = stoneforgePriorityToLinear(sfVal);
        expect(roundTripped).toBe(linearVal);
      }

      // Stoneforge → Linear → Stoneforge
      for (const sfVal of [1, 2, 3, 4, 5] as Priority[]) {
        const linearVal = stoneforgePriorityToLinear(sfVal);
        const roundTripped = linearPriorityToStoneforge(linearVal);
        expect(roundTripped).toBe(sfVal);
      }
    });
  });
});

// ============================================================================
// Status Mapping Tests
// ============================================================================

describe('Status Mapping', () => {
  describe('linearStateTypeToStatus (pull direction)', () => {
    test('triage → backlog', () => {
      const result = linearStateTypeToStatus('triage');
      expect(result.status).toBe('backlog');
      expect(result.closeReason).toBeUndefined();
    });

    test('backlog → backlog', () => {
      const result = linearStateTypeToStatus('backlog');
      expect(result.status).toBe('backlog');
      expect(result.closeReason).toBeUndefined();
    });

    test('unstarted → open', () => {
      const result = linearStateTypeToStatus('unstarted');
      expect(result.status).toBe('open');
      expect(result.closeReason).toBeUndefined();
    });

    test('started → in_progress', () => {
      const result = linearStateTypeToStatus('started');
      expect(result.status).toBe('in_progress');
      expect(result.closeReason).toBeUndefined();
    });

    test('completed → closed', () => {
      const result = linearStateTypeToStatus('completed');
      expect(result.status).toBe('closed');
      expect(result.closeReason).toBeUndefined();
    });

    test('canceled → closed with closeReason "canceled"', () => {
      const result = linearStateTypeToStatus('canceled');
      expect(result.status).toBe('closed');
      expect(result.closeReason).toBe('canceled');
    });

    test('all 6 state types are handled', () => {
      const stateTypes: LinearStateType[] = [
        'triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled',
      ];

      for (const stateType of stateTypes) {
        const result = linearStateTypeToStatus(stateType);
        expect(result.status).toBeDefined();
      }
    });
  });

  describe('statusToLinearStateType (push direction)', () => {
    test('open → unstarted', () => {
      expect(statusToLinearStateType('open' as TaskStatus)).toBe('unstarted');
    });

    test('in_progress → started', () => {
      expect(statusToLinearStateType('in_progress' as TaskStatus)).toBe('started');
    });

    test('review → started', () => {
      expect(statusToLinearStateType('review' as TaskStatus)).toBe('started');
    });

    test('blocked → started', () => {
      expect(statusToLinearStateType('blocked' as TaskStatus)).toBe('started');
    });

    test('deferred → backlog', () => {
      expect(statusToLinearStateType('deferred' as TaskStatus)).toBe('backlog');
    });

    test('backlog → backlog', () => {
      expect(statusToLinearStateType('backlog' as TaskStatus)).toBe('backlog');
    });

    test('closed → completed', () => {
      expect(statusToLinearStateType('closed' as TaskStatus)).toBe('completed');
    });

    test('tombstone → completed', () => {
      expect(statusToLinearStateType('tombstone' as TaskStatus)).toBe('completed');
    });

    test('all Stoneforge statuses are handled', () => {
      const statuses: TaskStatus[] = [
        'open', 'in_progress', 'blocked', 'deferred', 'backlog', 'review', 'closed', 'tombstone',
      ] as TaskStatus[];

      for (const status of statuses) {
        const result = statusToLinearStateType(status);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      }
    });
  });

  describe('shouldAddBlockedLabel', () => {
    test('returns true for blocked status', () => {
      expect(shouldAddBlockedLabel('blocked' as TaskStatus)).toBe(true);
    });

    test('returns false for all other statuses', () => {
      const nonBlockedStatuses: TaskStatus[] = [
        'open', 'in_progress', 'deferred', 'backlog', 'review', 'closed', 'tombstone',
      ] as TaskStatus[];

      for (const status of nonBlockedStatuses) {
        expect(shouldAddBlockedLabel(status)).toBe(false);
      }
    });
  });
});

// ============================================================================
// Label/Tag Mapping Tests
// ============================================================================

describe('Label and Tag Mapping', () => {
  describe('field map config', () => {
    test('includes tags ↔ labels bidirectional mapping', () => {
      const config = createLinearFieldMapConfig();
      const tagField = config.fields.find((f) => f.localField === 'tags');
      expect(tagField).toBeDefined();
      expect(tagField!.externalField).toBe('labels');
      expect(tagField!.direction).toBe('bidirectional');
    });

    test('includes taskType ↔ labels mapping with convention transforms', () => {
      const config = createLinearFieldMapConfig();
      const taskTypeField = config.fields.find((f) => f.localField === 'taskType');
      expect(taskTypeField).toBeDefined();
      expect(taskTypeField!.externalField).toBe('labels');
      expect(taskTypeField!.direction).toBe('bidirectional');
      expect(taskTypeField!.toExternal).toBe('taskTypeToLabel');
      expect(taskTypeField!.toLocal).toBe('labelToTaskType');
    });
  });

  describe('LinearTaskAdapter label handling', () => {
    test('converts Linear labels to ExternalTask labels', async () => {
      const api = createMockApiClient();
      const issue = createMockIssue({
        labels: {
          nodes: [
            { id: 'l1', name: 'bug' },
            { id: 'l2', name: 'type:feature' },
            { id: 'l3', name: 'high-priority' },
          ],
        },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );
      const adapter = new LinearTaskAdapter(api);

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.labels).toEqual(['bug', 'type:feature', 'high-priority']);
    });

    test('handles empty labels', async () => {
      const api = createMockApiClient();
      const issue = createMockIssue({
        labels: { nodes: [] },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );
      const adapter = new LinearTaskAdapter(api);

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.labels).toEqual([]);
    });
  });
});

// ============================================================================
// Description Handling Tests
// ============================================================================

describe('Description Handling', () => {
  test('markdown content is preserved in ExternalTask body', async () => {
    const api = createMockApiClient();
    const markdownContent = '# Heading\n\n**Bold** text with `code` and\n\n- list item 1\n- list item 2';
    const issue = createMockIssue({ description: markdownContent });
    (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve(issue)
    );
    const adapter = new LinearTaskAdapter(api);

    const result = await adapter.getIssue('ENG', 'issue-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.body).toBe(markdownContent);
  });

  test('null description maps to undefined body', async () => {
    const api = createMockApiClient();
    const issue = createMockIssue({ description: null });
    (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve(issue)
    );
    const adapter = new LinearTaskAdapter(api);

    const result = await adapter.getIssue('ENG', 'issue-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.body).toBeUndefined();
  });

  test('description sent to create mutation', async () => {
    const api = createMockApiClient();
    const adapter = new LinearTaskAdapter(api);

    await adapter.createIssue('ENG', {
      title: 'Test',
      body: '# Markdown description',
      state: 'open',
      labels: [],
      assignees: [],
    });

    const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
    const input = createCall[0] as { description?: string };
    expect(input.description).toBe('# Markdown description');
  });
});

// ============================================================================
// LinearTaskAdapter Conversion Tests
// ============================================================================

describe('LinearTaskAdapter', () => {
  let api: LinearApiClient;
  let adapter: LinearTaskAdapter;

  beforeEach(() => {
    api = createMockApiClient();
    adapter = new LinearTaskAdapter(api);
  });

  // --------------------------------------------------------------------------
  // getIssue
  // --------------------------------------------------------------------------

  describe('getIssue', () => {
    test('converts Linear issue to ExternalTask', async () => {
      const issue = createMockIssue();
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.externalId).toBe('issue-uuid-1');
      expect(result!.url).toBe('https://linear.app/myco/issue/ENG-123');
      expect(result!.provider).toBe('linear');
      expect(result!.project).toBe('ENG');
      expect(result!.title).toBe('Test Issue');
      expect(result!.state).toBe('open'); // started → open
      expect(result!.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(result!.updatedAt).toBe('2024-01-02T00:00:00Z');
    });

    test('returns null when issue not found', async () => {
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(null)
      );

      const result = await adapter.getIssue('ENG', 'nonexistent');

      expect(result).toBeNull();
    });

    test('maps started state to open', async () => {
      const issue = createMockIssue({
        state: { id: 's1', name: 'In Progress', type: 'started' },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');
      expect(result!.state).toBe('open');
    });

    test('maps completed state to closed', async () => {
      const issue = createMockIssue({
        state: { id: 's1', name: 'Done', type: 'completed' },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');
      expect(result!.state).toBe('closed');
    });

    test('maps canceled state to closed', async () => {
      const issue = createMockIssue({
        state: { id: 's1', name: 'Canceled', type: 'canceled' },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');
      expect(result!.state).toBe('closed');
    });

    test('includes assignee name in assignees array', async () => {
      const issue = createMockIssue({
        assignee: { id: 'u1', name: 'Bob', email: 'bob@example.com' },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');
      expect(result!.assignees).toEqual(['Bob']);
    });

    test('null assignee results in empty assignees array', async () => {
      const issue = createMockIssue({ assignee: null });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');
      expect(result!.assignees).toEqual([]);
    });

    test('stores Linear-specific data in raw field', async () => {
      const issue = createMockIssue({
        priority: 2,
        state: { id: 'state-uuid-started', name: 'In Progress', type: 'started' },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result!.raw).toBeDefined();
      expect(result!.raw!.linearPriority).toBe(2);
      expect(result!.raw!.linearStateType).toBe('started');
      expect(result!.raw!.linearStateId).toBe('state-uuid-started');
      expect(result!.raw!.linearIdentifier).toBe('ENG-123');
      expect(result!.raw!.linearTeamKey).toBe('ENG');
    });

    test('includes archivedAt in raw when present', async () => {
      const issue = createMockIssue({
        archivedAt: '2024-06-01T00:00:00Z',
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result!.raw!.linearArchivedAt).toBe('2024-06-01T00:00:00Z');
    });

    test('does not include archivedAt in raw when null', async () => {
      const issue = createMockIssue({ archivedAt: null });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result!.raw!.linearArchivedAt).toBeUndefined();
    });

    test('closedAt is set to updatedAt for completed issues', async () => {
      const issue = createMockIssue({
        state: { id: 's1', name: 'Done', type: 'completed' },
        updatedAt: '2024-03-15T10:00:00Z',
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');
      expect(result!.closedAt).toBe('2024-03-15T10:00:00Z');
    });

    test('closedAt is undefined for open issues', async () => {
      const issue = createMockIssue({
        state: { id: 's1', name: 'In Progress', type: 'started' },
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');
      expect(result!.closedAt).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // listIssuesSince
  // --------------------------------------------------------------------------

  describe('listIssuesSince', () => {
    test('converts all issues from API response', async () => {
      const issues = [
        createMockIssue({ id: 'i1', identifier: 'ENG-1' }),
        createMockIssue({ id: 'i2', identifier: 'ENG-2' }),
      ];
      (api.listIssuesSince as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issues)
      );

      const result = await adapter.listIssuesSince('ENG', '2024-01-01T00:00:00Z');

      expect(result).toHaveLength(2);
      expect(result[0].externalId).toBe('i1');
      expect(result[1].externalId).toBe('i2');
    });
  });

  // --------------------------------------------------------------------------
  // Workflow State Caching
  // --------------------------------------------------------------------------

  describe('workflow state caching', () => {
    test('fetches workflow states on first use', async () => {
      await adapter.createIssue('ENG', {
        title: 'Test',
        state: 'open',
        labels: [],
        assignees: [],
      });

      // Should have called getTeams and getTeamWorkflowStates
      expect(api.getTeams).toHaveBeenCalledTimes(1);
      expect(api.getTeamWorkflowStates).toHaveBeenCalledTimes(1);
    });

    test('uses cached workflow states on subsequent calls', async () => {
      // First call — should fetch from API
      await adapter.createIssue('ENG', {
        title: 'First',
        state: 'open',
        labels: [],
        assignees: [],
      });

      // Second call — should use cache
      await adapter.createIssue('ENG', {
        title: 'Second',
        state: 'closed',
        labels: [],
        assignees: [],
      });

      // Teams fetched once, workflow states fetched once
      expect(api.getTeams).toHaveBeenCalledTimes(1);
      expect(api.getTeamWorkflowStates).toHaveBeenCalledTimes(1);
    });

    test('refreshes cache on stale state lookup via resolveStateType', async () => {
      // First, prime the cache
      await adapter.createIssue('ENG', {
        title: 'Test',
        state: 'open',
        labels: [],
        assignees: [],
      });

      // Now try resolveStateType with an unknown state ID
      // This should trigger a cache refresh
      const result = await adapter.resolveStateType('team-uuid-1', 'unknown-state-id');

      // Should have refreshed: 1 initial fetch + 1 refresh
      expect(api.getTeamWorkflowStates).toHaveBeenCalledTimes(2);
      // Should return undefined since the state is not found even after refresh
      expect(result).toBeUndefined();
    });

    test('resolveStateType returns correct type from cache', async () => {
      // Prime the cache by creating an issue (forces team and state fetch)
      await adapter.createIssue('ENG', {
        title: 'Test',
        state: 'open',
        labels: [],
        assignees: [],
      });

      const result = await adapter.resolveStateType('team-uuid-1', 'state-uuid-started');
      expect(result).toBe('started');
    });
  });

  // --------------------------------------------------------------------------
  // createIssue
  // --------------------------------------------------------------------------

  describe('createIssue', () => {
    test('resolves team key and creates issue', async () => {
      await adapter.createIssue('ENG', {
        title: 'New Issue',
        body: 'Description here',
        state: 'open',
        labels: [],
        assignees: [],
      });

      expect(api.getTeams).toHaveBeenCalledTimes(1);
      expect(api.createIssue).toHaveBeenCalledTimes(1);
    });

    test('passes teamId from resolved team', async () => {
      await adapter.createIssue('ENG', {
        title: 'New Issue',
        state: 'open',
        labels: [],
        assignees: [],
      });

      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const input = createCall[0] as { teamId: string };
      expect(input.teamId).toBe('team-uuid-1');
    });

    test('maps closed state to completed workflow state', async () => {
      await adapter.createIssue('ENG', {
        title: 'Done Issue',
        state: 'closed',
        labels: [],
        assignees: [],
      });

      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const input = createCall[0] as { stateId?: string };
      expect(input.stateId).toBe('state-uuid-completed');
    });

    test('maps open state to unstarted workflow state', async () => {
      await adapter.createIssue('ENG', {
        title: 'Open Issue',
        state: 'open',
        labels: [],
        assignees: [],
      });

      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const input = createCall[0] as { stateId?: string };
      expect(input.stateId).toBe('state-uuid-unstarted');
    });

    test('throws for unknown team key', async () => {
      try {
        await adapter.createIssue('NONEXISTENT', {
          title: 'Test',
          state: 'open',
          labels: [],
          assignees: [],
        });
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('NONEXISTENT');
        expect((err as Error).message).toContain('not found');
      }
    });
  });

  // --------------------------------------------------------------------------
  // updateIssue
  // --------------------------------------------------------------------------

  describe('updateIssue', () => {
    test('sends title update', async () => {
      await adapter.updateIssue('ENG', 'issue-uuid-1', {
        title: 'Updated Title',
      });

      const updateCall = (api.updateIssue as ReturnType<typeof mock>).mock.calls[0] as [
        string,
        unknown,
      ];
      expect(updateCall[0]).toBe('issue-uuid-1');
      const input = updateCall[1] as { title?: string };
      expect(input.title).toBe('Updated Title');
    });

    test('sends description update', async () => {
      await adapter.updateIssue('ENG', 'issue-uuid-1', {
        body: 'Updated description',
      });

      const updateCall = (api.updateIssue as ReturnType<typeof mock>).mock.calls[0] as [
        string,
        unknown,
      ];
      const input = updateCall[1] as { description?: string };
      expect(input.description).toBe('Updated description');
    });

    test('maps state update to workflow state ID', async () => {
      await adapter.updateIssue('ENG', 'issue-uuid-1', {
        state: 'closed',
      });

      const updateCall = (api.updateIssue as ReturnType<typeof mock>).mock.calls[0] as [
        string,
        unknown,
      ];
      const input = updateCall[1] as { stateId?: string };
      expect(input.stateId).toBe('state-uuid-completed');
    });
  });

  // --------------------------------------------------------------------------
  // Priority through create/update (native priority support)
  // --------------------------------------------------------------------------

  describe('priority through create/update', () => {
    test('createIssue converts Stoneforge priority 2 (high) to Linear priority 2 (High)', async () => {
      await adapter.createIssue('ENG', {
        title: 'High Priority Issue',
        state: 'open',
        labels: [],
        assignees: [],
        priority: 2,
      });

      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const input = createCall[0] as { priority?: number };
      expect(input.priority).toBe(2); // Linear "High"
    });

    test('createIssue converts Stoneforge priority 1 (critical) to Linear priority 1 (Urgent)', async () => {
      await adapter.createIssue('ENG', {
        title: 'Urgent Issue',
        state: 'open',
        labels: [],
        assignees: [],
        priority: 1,
      });

      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const input = createCall[0] as { priority?: number };
      expect(input.priority).toBe(1); // Linear "Urgent"
    });

    test('createIssue converts Stoneforge priority 5 (minimal) to Linear priority 0 (No priority)', async () => {
      await adapter.createIssue('ENG', {
        title: 'Minimal Priority Issue',
        state: 'open',
        labels: [],
        assignees: [],
        priority: 5,
      });

      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const input = createCall[0] as { priority?: number };
      expect(input.priority).toBe(0); // Linear "No priority"
    });

    test('createIssue defaults to Linear 0 (No priority) when no priority is provided', async () => {
      await adapter.createIssue('ENG', {
        title: 'No Priority Issue',
        state: 'open',
        labels: [],
        assignees: [],
      });

      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const input = createCall[0] as { priority?: number };
      expect(input.priority).toBe(0); // Linear "No priority"
    });

    test('createIssue converts all 5 Stoneforge priorities to correct Linear values', async () => {
      const expectedMappings: Array<{ sf: number; linear: number }> = [
        { sf: 1, linear: 1 }, // critical → Urgent
        { sf: 2, linear: 2 }, // high → High
        { sf: 3, linear: 3 }, // medium → Medium
        { sf: 4, linear: 4 }, // low → Low
        { sf: 5, linear: 0 }, // minimal → No priority
      ];

      for (const { sf, linear } of expectedMappings) {
        // Reset mock
        (api.createIssue as ReturnType<typeof mock>).mockClear();
        (api.getTeams as ReturnType<typeof mock>).mockClear();
        (api.getTeamWorkflowStates as ReturnType<typeof mock>).mockClear();

        const freshApi = createMockApiClient();
        const freshAdapter = new LinearTaskAdapter(freshApi);

        await freshAdapter.createIssue('ENG', {
          title: `Priority ${sf} Issue`,
          state: 'open',
          labels: [],
          assignees: [],
          priority: sf,
        });

        const createCall = (freshApi.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
        const input = createCall[0] as { priority?: number };
        expect(input.priority).toBe(linear);
      }
    });

    test('updateIssue converts Stoneforge priority to Linear priority', async () => {
      await adapter.updateIssue('ENG', 'issue-uuid-1', {
        priority: 2, // Stoneforge "high"
      });

      const updateCall = (api.updateIssue as ReturnType<typeof mock>).mock.calls[0] as [
        string,
        unknown,
      ];
      const input = updateCall[1] as { priority?: number };
      expect(input.priority).toBe(2); // Linear "High"
    });

    test('updateIssue converts Stoneforge priority 5 to Linear priority 0', async () => {
      await adapter.updateIssue('ENG', 'issue-uuid-1', {
        priority: 5, // Stoneforge "minimal"
      });

      const updateCall = (api.updateIssue as ReturnType<typeof mock>).mock.calls[0] as [
        string,
        unknown,
      ];
      const input = updateCall[1] as { priority?: number };
      expect(input.priority).toBe(0); // Linear "No priority"
    });

    test('updateIssue does not set priority when not provided', async () => {
      await adapter.updateIssue('ENG', 'issue-uuid-1', {
        title: 'Updated Title',
      });

      const updateCall = (api.updateIssue as ReturnType<typeof mock>).mock.calls[0] as [
        string,
        unknown,
      ];
      const input = updateCall[1] as { priority?: number };
      expect(input.priority).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Priority through pull (ExternalTask.priority)
  // --------------------------------------------------------------------------

  describe('priority through pull', () => {
    test('getIssue sets Stoneforge priority from Linear native priority', async () => {
      const issue = createMockIssue({ priority: 2 }); // Linear "High"
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.priority).toBe(2); // Stoneforge "high"
    });

    test('getIssue maps Linear 0 (No priority) to Stoneforge 5 (minimal)', async () => {
      const issue = createMockIssue({ priority: 0 });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.priority).toBe(5); // Stoneforge "minimal"
    });

    test('getIssue maps Linear 1 (Urgent) to Stoneforge 1 (critical)', async () => {
      const issue = createMockIssue({ priority: 1 });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.priority).toBe(1); // Stoneforge "critical"
    });

    test('listIssuesSince includes Stoneforge priority on all issues', async () => {
      const issues = [
        createMockIssue({ id: 'i1', priority: 1 }),
        createMockIssue({ id: 'i2', priority: 3 }),
        createMockIssue({ id: 'i3', priority: 0 }),
      ];
      (api.listIssuesSince as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issues)
      );

      const result = await adapter.listIssuesSince('ENG', '2024-01-01T00:00:00Z');

      expect(result).toHaveLength(3);
      expect(result[0].priority).toBe(1); // Urgent → critical
      expect(result[1].priority).toBe(3); // Medium → medium
      expect(result[2].priority).toBe(5); // No priority → minimal
    });
  });

  // --------------------------------------------------------------------------
  // Priority round-trip
  // --------------------------------------------------------------------------

  describe('priority round-trip', () => {
    test('push P2 task → Linear shows High → pull back → still P2', async () => {
      // Step 1: Push — create an issue with Stoneforge priority 2
      const createdIssue = createMockIssue({ priority: 2 }); // Linear returns "High" (2)
      (api.createIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(createdIssue)
      );

      const pushResult = await adapter.createIssue('ENG', {
        title: 'P2 Task',
        state: 'open',
        labels: [],
        assignees: [],
        priority: 2, // Stoneforge "high"
      });

      // Verify create was called with Linear priority 2 (High)
      const createCall = (api.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
      const createInput = createCall[0] as { priority?: number };
      expect(createInput.priority).toBe(2); // Linear "High"

      // Step 2: Pull — the returned ExternalTask should have Stoneforge priority 2
      expect(pushResult.priority).toBe(2); // Stoneforge "high"
      expect(pushResult.raw!.linearPriority).toBe(2); // Linear native value preserved

      // Step 3: Verify round-trip — if we fetch the same issue, priority is still P2
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(createdIssue)
      );
      const pullResult = await adapter.getIssue('ENG', createdIssue.id);
      expect(pullResult!.priority).toBe(2); // Still Stoneforge "high"
    });

    test('all 5 Stoneforge priorities round-trip through create and pull', async () => {
      const mappings = [
        { sf: 1, linear: 1 },
        { sf: 2, linear: 2 },
        { sf: 3, linear: 3 },
        { sf: 4, linear: 4 },
        { sf: 5, linear: 0 },
      ];

      for (const { sf, linear } of mappings) {
        const freshApi = createMockApiClient();
        const freshAdapter = new LinearTaskAdapter(freshApi);

        // Mock: Linear API returns issue with the expected Linear priority
        const returnedIssue = createMockIssue({ priority: linear });
        (freshApi.createIssue as ReturnType<typeof mock>).mockImplementation(() =>
          Promise.resolve(returnedIssue)
        );

        // Push with Stoneforge priority
        const result = await freshAdapter.createIssue('ENG', {
          title: `Priority ${sf}`,
          state: 'open',
          labels: [],
          assignees: [],
          priority: sf,
        });

        // Verify the create API was called with the correct Linear priority
        const createCall = (freshApi.createIssue as ReturnType<typeof mock>).mock.calls[0] as [unknown];
        const input = createCall[0] as { priority?: number };
        expect(input.priority).toBe(linear);

        // Verify the returned ExternalTask has the correct Stoneforge priority
        expect(result.priority).toBe(sf);
      }
    });
  });

  // --------------------------------------------------------------------------
  // getFieldMapConfig
  // --------------------------------------------------------------------------

  describe('getFieldMapConfig', () => {
    test('returns LinearFieldMapConfig', () => {
      const config = adapter.getFieldMapConfig();

      expect(config.provider).toBe('linear');
      expect(config.fields.length).toBeGreaterThan(0);
    });

    test('includes priority field mapping', () => {
      const config = adapter.getFieldMapConfig();
      const priorityField = config.fields.find((f) => f.localField === 'priority');

      expect(priorityField).toBeDefined();
      expect(priorityField!.externalField).toBe('priority');
      expect(priorityField!.direction).toBe('bidirectional');
    });

    test('includes status field mapping', () => {
      const config = adapter.getFieldMapConfig();
      const statusField = config.fields.find((f) => f.localField === 'status');

      expect(statusField).toBeDefined();
      expect(statusField!.externalField).toBe('state');
      expect(statusField!.direction).toBe('bidirectional');
    });

    test('includes description field mapping', () => {
      const config = adapter.getFieldMapConfig();
      const descField = config.fields.find((f) => f.localField === 'descriptionRef');

      expect(descField).toBeDefined();
      expect(descField!.externalField).toBe('description');
      expect(descField!.direction).toBe('bidirectional');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    test('issue with missing optional fields', async () => {
      const issue = createMockIssue({
        description: null,
        assignee: null,
        labels: { nodes: [] },
        archivedAt: null,
      });
      (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(issue)
      );

      const result = await adapter.getIssue('ENG', 'issue-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.body).toBeUndefined();
      expect(result!.assignees).toEqual([]);
      expect(result!.labels).toEqual([]);
    });

    test('issue with all state types preserves state info in raw', async () => {
      const stateTypes: LinearStateType[] = [
        'triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled',
      ];

      for (const stateType of stateTypes) {
        const issue = createMockIssue({
          state: { id: `state-${stateType}`, name: stateType, type: stateType },
        });
        (api.getIssue as ReturnType<typeof mock>).mockImplementation(() =>
          Promise.resolve(issue)
        );

        const result = await adapter.getIssue('ENG', 'issue-uuid-1');
        expect(result!.raw!.linearStateType).toBe(stateType);
      }
    });
  });
});
