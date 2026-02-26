/**
 * Task Sync Adapter Utilities — Unit Tests
 *
 * Tests the shared field mapping logic for converting between
 * Stoneforge tasks and external task representations.
 */

import { describe, expect, test, mock } from 'bun:test';
import type { Task, Document, Entity, Priority, TaskTypeValue, TaskStatus, ElementId, EntityId, DocumentId } from '@stoneforge/core';
import { ElementType, createTimestamp, TaskStatus as TaskStatusEnum } from '@stoneforge/core';
import type { ExternalTask } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import {
  taskToExternalTask,
  externalTaskToTaskUpdates,
  buildExternalLabels,
  parseExternalLabels,
  hydrateDescription,
  diffTaskUpdates,
  type TaskSyncFieldMapConfig,
  type ParsedExternalLabels,
} from './task-sync-adapter.js';
import {
  GITHUB_FIELD_MAP_CONFIG,
  GITHUB_STATUS_LABELS,
  gitHubStateToStatus,
} from '../providers/github/github-field-map.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a test TaskSyncFieldMapConfig mimicking GitHub conventions.
 */
function createTestConfig(): TaskSyncFieldMapConfig {
  return {
    priorityLabels: {
      1: 'priority:critical',
      2: 'priority:high',
      3: 'priority:medium',
      4: 'priority:low',
      5: 'priority:minimal',
    } as Record<Priority, string>,
    taskTypeLabels: {
      bug: 'type:bug',
      feature: 'type:feature',
      task: 'type:task',
      chore: 'type:chore',
    } as Record<TaskTypeValue, string>,
    syncLabelPrefix: 'sf:',
    statusToState: (status: TaskStatus): 'open' | 'closed' => {
      if (status === 'closed' || status === 'tombstone') return 'closed';
      return 'open';
    },
    stateToStatus: (state: 'open' | 'closed', _labels: string[]): TaskStatus => {
      return state === 'closed' ? 'closed' : 'open';
    },
  };
}

/**
 * Creates a minimal Task object for testing.
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  const now = createTimestamp();
  return {
    id: 'el-test01' as ElementId,
    type: ElementType.TASK,
    createdAt: now,
    updatedAt: now,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    title: 'Test Task',
    status: 'open' as TaskStatus,
    priority: 3 as Priority,
    complexity: 3,
    taskType: 'task' as TaskTypeValue,
    ...overrides,
  } as Task;
}

/**
 * Creates a minimal ExternalTask object for testing.
 */
function createTestExternalTask(overrides: Partial<ExternalTask> = {}): ExternalTask {
  return {
    externalId: '42',
    url: 'https://github.com/owner/repo/issues/42',
    provider: 'github',
    project: 'owner/repo',
    title: 'External Issue',
    state: 'open' as const,
    labels: [],
    assignees: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Creates a mock QuarryAPI with configurable get responses.
 */
function createMockApi(getResponses: Record<string, unknown> = {}): QuarryAPI {
  return {
    get: mock(async (id: ElementId) => {
      return (getResponses[id] ?? null) as any;
    }),
  } as unknown as QuarryAPI;
}

// ============================================================================
// taskToExternalTask
// ============================================================================

describe('taskToExternalTask', () => {
  test('maps basic task fields correctly', async () => {
    const task = createTestTask({
      title: 'Fix login bug',
      status: 'open' as TaskStatus,
      priority: 2 as Priority,
      taskType: 'bug' as TaskTypeValue,
      tags: ['auth', 'urgent'],
    });
    const config = createTestConfig();
    const api = createMockApi();

    const result = await taskToExternalTask(task, config, api);

    expect(result.title).toBe('Fix login bug');
    expect(result.state).toBe('open');
    expect(result.labels).toContain('sf:priority:high');
    expect(result.labels).toContain('sf:type:bug');
    expect(result.labels).toContain('auth');
    expect(result.labels).toContain('urgent');
    expect(result.body).toBeUndefined();
    // Assignees should never be set on push — Stoneforge agents aren't GitHub users
    expect(result.assignees).toBeUndefined();
  });

  test('maps closed status to closed state', async () => {
    const task = createTestTask({ status: 'closed' as TaskStatus });
    const config = createTestConfig();
    const api = createMockApi();

    const result = await taskToExternalTask(task, config, api);

    expect(result.state).toBe('closed');
  });

  test('maps in_progress status to open state', async () => {
    const task = createTestTask({ status: 'in_progress' as TaskStatus });
    const config = createTestConfig();
    const api = createMockApi();

    const result = await taskToExternalTask(task, config, api);

    expect(result.state).toBe('open');
  });

  test('maps all priority levels correctly', async () => {
    const config = createTestConfig();
    const api = createMockApi();

    const priorities: Array<[Priority, string]> = [
      [1, 'sf:priority:critical'],
      [2, 'sf:priority:high'],
      [3, 'sf:priority:medium'],
      [4, 'sf:priority:low'],
      [5, 'sf:priority:minimal'],
    ];

    for (const [priority, expectedLabel] of priorities) {
      const task = createTestTask({ priority, tags: [] });
      const result = await taskToExternalTask(task, config, api);
      expect(result.labels).toContain(expectedLabel);
    }
  });

  test('maps all task types correctly', async () => {
    const config = createTestConfig();
    const api = createMockApi();

    const types: Array<[TaskTypeValue, string]> = [
      ['bug', 'sf:type:bug'],
      ['feature', 'sf:type:feature'],
      ['task', 'sf:type:task'],
      ['chore', 'sf:type:chore'],
    ];

    for (const [taskType, expectedLabel] of types) {
      const task = createTestTask({ taskType, tags: [] });
      const result = await taskToExternalTask(task, config, api);
      expect(result.labels).toContain(expectedLabel);
    }
  });

  test('hydrates description from descriptionRef document', async () => {
    const docId = 'el-doc001' as DocumentId;
    const task = createTestTask({ descriptionRef: docId });
    const config = createTestConfig();
    const api = createMockApi({
      [docId]: {
        id: docId,
        type: 'document',
        content: '## Description\n\nThis is the task description.',
        contentType: 'markdown',
        title: 'Task Description',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
        createdBy: 'el-system1',
        tags: [],
        metadata: {},
        version: 1,
        previousVersionId: null,
        category: 'task-description',
        status: 'active',
        immutable: false,
      },
    });

    const result = await taskToExternalTask(task, config, api);

    expect(result.body).toBe('## Description\n\nThis is the task description.');
  });

  test('returns undefined body when no descriptionRef', async () => {
    const task = createTestTask({ descriptionRef: undefined });
    const config = createTestConfig();
    const api = createMockApi();

    const result = await taskToExternalTask(task, config, api);

    expect(result.body).toBeUndefined();
  });

  test('returns undefined body when document not found', async () => {
    const docId = 'el-missing' as DocumentId;
    const task = createTestTask({ descriptionRef: docId });
    const config = createTestConfig();
    const api = createMockApi(); // No mock response = returns null

    const result = await taskToExternalTask(task, config, api);

    expect(result.body).toBeUndefined();
  });

  test('does not set assignees even when task has an assignee entity', async () => {
    const assigneeId = 'el-agent01' as EntityId;
    const task = createTestTask({ assignee: assigneeId });
    const config = createTestConfig();
    const api = createMockApi({
      [assigneeId]: {
        id: assigneeId,
        type: 'entity',
        name: 'alice',
        entityType: 'human',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
        createdBy: 'el-system1',
        tags: [],
        metadata: {},
      },
    });

    const result = await taskToExternalTask(task, config, api);

    // Assignees should never be written to external systems
    expect(result.assignees).toBeUndefined();
  });

  test('does not set assignees when task has no assignee', async () => {
    const task = createTestTask({ assignee: undefined });
    const config = createTestConfig();
    const api = createMockApi();

    const result = await taskToExternalTask(task, config, api);

    expect(result.assignees).toBeUndefined();
  });

  test('preserves user tags alongside sync labels', async () => {
    const task = createTestTask({
      priority: 1 as Priority,
      taskType: 'bug' as TaskTypeValue,
      tags: ['frontend', 'p0-hotfix', 'sprint-42'],
    });
    const config = createTestConfig();
    const api = createMockApi();

    const result = await taskToExternalTask(task, config, api);

    // Should have sync-managed labels
    expect(result.labels).toContain('sf:priority:critical');
    expect(result.labels).toContain('sf:type:bug');
    // Should have user tags
    expect(result.labels).toContain('frontend');
    expect(result.labels).toContain('p0-hotfix');
    expect(result.labels).toContain('sprint-42');
    // Total: 2 sync + 3 user = 5
    expect(result.labels!.length).toBe(5);
  });
});

// ============================================================================
// externalTaskToTaskUpdates
// ============================================================================

describe('externalTaskToTaskUpdates', () => {
  test('maps all fields for a new task (no existingTask)', () => {
    const externalTask = createTestExternalTask({
      title: 'New Issue from GitHub',
      state: 'open',
      labels: ['sf:priority:high', 'sf:type:feature', 'enhancement'],
      assignees: ['alice'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect(result.title).toBe('New Issue from GitHub');
    expect(result.status).toBe('open');
    expect(result.priority).toBe(2); // high = 2
    expect(result.taskType).toBe('feature');
    expect(result.tags).toEqual(['enhancement']);
    expect(result.externalRef).toBe('https://github.com/owner/repo/issues/42');
    expect((result.metadata as Record<string, unknown>)?._pendingAssignee).toBe('alice');
  });

  test('returns only changed fields for existing task (diff mode)', () => {
    const existingTask = createTestTask({
      title: 'Original Title',
      status: 'open' as TaskStatus,
      priority: 3 as Priority,
      taskType: 'task' as TaskTypeValue,
      tags: ['old-tag'],
      externalRef: 'https://github.com/owner/repo/issues/42',
    });

    const externalTask = createTestExternalTask({
      title: 'Updated Title',  // Changed
      state: 'open',           // Same → status stays 'open' = same
      labels: ['sf:priority:medium', 'sf:type:task', 'old-tag'], // Same priority, taskType, tags
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, existingTask, config);

    // Only title should be in the diff (changed)
    expect(result.title).toBe('Updated Title');
    // These should NOT be in the diff (unchanged)
    expect(result.status).toBeUndefined();
    expect(result.priority).toBeUndefined();
    expect(result.taskType).toBeUndefined();
    expect(result.tags).toBeUndefined();
    expect(result.externalRef).toBeUndefined();
  });

  test('detects status change from open to closed', () => {
    const existingTask = createTestTask({ status: 'open' as TaskStatus });
    const externalTask = createTestExternalTask({ state: 'closed' });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, existingTask, config);

    expect(result.status).toBe('closed');
  });

  test('detects priority change', () => {
    const existingTask = createTestTask({ priority: 3 as Priority });
    const externalTask = createTestExternalTask({
      labels: ['sf:priority:critical', 'sf:type:task'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, existingTask, config);

    expect(result.priority).toBe(1); // critical = 1
  });

  test('detects taskType change', () => {
    const existingTask = createTestTask({ taskType: 'task' as TaskTypeValue });
    const externalTask = createTestExternalTask({
      labels: ['sf:priority:medium', 'sf:type:bug'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, existingTask, config);

    expect(result.taskType).toBe('bug');
  });

  test('detects tag changes', () => {
    const existingTask = createTestTask({ tags: ['old-tag'] });
    const externalTask = createTestExternalTask({
      labels: ['sf:priority:medium', 'sf:type:task', 'new-tag'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, existingTask, config);

    expect(result.tags).toEqual(['new-tag']);
  });

  test('returns empty diff when nothing changed', () => {
    const existingTask = createTestTask({
      title: 'Same Title',
      status: 'open' as TaskStatus,
      priority: 3 as Priority,
      taskType: 'task' as TaskTypeValue,
      tags: ['some-tag'],
      externalRef: 'https://github.com/owner/repo/issues/42',
    });

    const externalTask = createTestExternalTask({
      title: 'Same Title',
      state: 'open',
      labels: ['sf:priority:medium', 'sf:type:task', 'some-tag'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, existingTask, config);

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('defaults priority to medium when no priority label found', () => {
    const externalTask = createTestExternalTask({
      labels: ['sf:type:bug', 'random-label'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect(result.priority).toBe(3); // medium = default
  });

  test('defaults taskType to task when no type label found', () => {
    const externalTask = createTestExternalTask({
      labels: ['sf:priority:high', 'random-label'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect(result.taskType).toBe('task'); // default
  });

  test('handles external task with no labels', () => {
    const externalTask = createTestExternalTask({ labels: [] });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect(result.priority).toBe(3); // default
    expect(result.taskType).toBe('task'); // default
    expect(result.tags).toEqual([]);
  });

  test('handles external task with no assignees', () => {
    const externalTask = createTestExternalTask({ assignees: [] });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect(result.metadata).toBeUndefined();
  });

  test('stores first assignee in pending metadata', () => {
    const externalTask = createTestExternalTask({
      assignees: ['alice', 'bob'],
    });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect((result.metadata as Record<string, unknown>)?._pendingAssignee).toBe('alice');
  });
});

// ============================================================================
// buildExternalLabels
// ============================================================================

describe('buildExternalLabels', () => {
  test('builds labels with sync prefix', () => {
    const task = createTestTask({
      priority: 1 as Priority,
      taskType: 'bug' as TaskTypeValue,
      tags: [],
    });
    const config = createTestConfig();

    const labels = buildExternalLabels(task, config);

    expect(labels).toEqual(['sf:priority:critical', 'sf:type:bug']);
  });

  test('includes user tags without prefix', () => {
    const task = createTestTask({
      priority: 3 as Priority,
      taskType: 'task' as TaskTypeValue,
      tags: ['frontend', 'sprint-1'],
    });
    const config = createTestConfig();

    const labels = buildExternalLabels(task, config);

    expect(labels).toContain('sf:priority:medium');
    expect(labels).toContain('sf:type:task');
    expect(labels).toContain('frontend');
    expect(labels).toContain('sprint-1');
  });

  test('handles empty tags', () => {
    const task = createTestTask({ tags: [] });
    const config = createTestConfig();

    const labels = buildExternalLabels(task, config);

    // Should still have sync-managed labels
    expect(labels.length).toBe(2); // priority + taskType
  });

  test('works with custom prefix', () => {
    const task = createTestTask({
      priority: 2 as Priority,
      taskType: 'feature' as TaskTypeValue,
      tags: [],
    });
    const config: TaskSyncFieldMapConfig = {
      ...createTestConfig(),
      syncLabelPrefix: 'stoneforge/',
    };

    const labels = buildExternalLabels(task, config);

    expect(labels).toContain('stoneforge/priority:high');
    expect(labels).toContain('stoneforge/type:feature');
  });
});

// ============================================================================
// parseExternalLabels
// ============================================================================

describe('parseExternalLabels', () => {
  test('extracts priority from sync-managed labels', () => {
    const labels = ['sf:priority:critical', 'sf:type:task', 'user-label'];
    const config = createTestConfig();

    const result = parseExternalLabels(labels, config);

    expect(result.priority).toBe(1);
    expect(result.taskType).toBe('task');
    expect(result.userTags).toEqual(['user-label']);
  });

  test('extracts all priority levels', () => {
    const config = createTestConfig();

    const testCases: Array<[string, Priority]> = [
      ['sf:priority:critical', 1],
      ['sf:priority:high', 2],
      ['sf:priority:medium', 3],
      ['sf:priority:low', 4],
      ['sf:priority:minimal', 5],
    ];

    for (const [label, expectedPriority] of testCases) {
      const result = parseExternalLabels([label], config);
      expect(result.priority).toBe(expectedPriority);
    }
  });

  test('extracts all task types', () => {
    const config = createTestConfig();

    const testCases: Array<[string, TaskTypeValue]> = [
      ['sf:type:bug', 'bug'],
      ['sf:type:feature', 'feature'],
      ['sf:type:task', 'task'],
      ['sf:type:chore', 'chore'],
    ];

    for (const [label, expectedType] of testCases) {
      const result = parseExternalLabels([label], config);
      expect(result.taskType).toBe(expectedType);
    }
  });

  test('separates sync-managed labels from user labels', () => {
    const labels = [
      'sf:priority:high',
      'sf:type:bug',
      'frontend',
      'urgent',
      'sprint-42',
    ];
    const config = createTestConfig();

    const result = parseExternalLabels(labels, config);

    expect(result.priority).toBe(2);
    expect(result.taskType).toBe('bug');
    expect(result.userTags).toEqual(['frontend', 'urgent', 'sprint-42']);
  });

  test('returns undefined for missing priority', () => {
    const labels = ['sf:type:bug', 'user-label'];
    const config = createTestConfig();

    const result = parseExternalLabels(labels, config);

    expect(result.priority).toBeUndefined();
  });

  test('returns undefined for missing taskType', () => {
    const labels = ['sf:priority:high', 'user-label'];
    const config = createTestConfig();

    const result = parseExternalLabels(labels, config);

    expect(result.taskType).toBeUndefined();
  });

  test('handles empty labels array', () => {
    const result = parseExternalLabels([], createTestConfig());

    expect(result.priority).toBeUndefined();
    expect(result.taskType).toBeUndefined();
    expect(result.userTags).toEqual([]);
  });

  test('skips unrecognized sync-managed labels', () => {
    const labels = ['sf:unknown:value', 'sf:priority:high', 'user-tag'];
    const config = createTestConfig();

    const result = parseExternalLabels(labels, config);

    expect(result.priority).toBe(2);
    // sf:unknown:value should be skipped, not in userTags
    expect(result.userTags).toEqual(['user-tag']);
  });

  test('works with custom prefix', () => {
    const config: TaskSyncFieldMapConfig = {
      ...createTestConfig(),
      syncLabelPrefix: 'x/',
    };
    const labels = ['x/priority:critical', 'x/type:feature', 'my-tag'];

    const result = parseExternalLabels(labels, config);

    expect(result.priority).toBe(1);
    expect(result.taskType).toBe('feature');
    expect(result.userTags).toEqual(['my-tag']);
  });
});

// ============================================================================
// hydrateDescription
// ============================================================================

describe('hydrateDescription', () => {
  test('returns content from document when found', async () => {
    const docId = 'el-doc001' as DocumentId;
    const api = createMockApi({
      [docId]: {
        id: docId,
        type: 'document',
        content: 'Hello world',
        contentType: 'markdown',
        title: 'Desc',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
        createdBy: 'el-system1',
        tags: [],
        metadata: {},
        version: 1,
        previousVersionId: null,
        category: 'task-description',
        status: 'active',
        immutable: false,
      },
    });

    const result = await hydrateDescription(docId, api);

    expect(result).toBe('Hello world');
  });

  test('returns undefined when no descriptionRef', async () => {
    const api = createMockApi();

    const result = await hydrateDescription(undefined, api);

    expect(result).toBeUndefined();
  });

  test('returns undefined when document not found', async () => {
    const docId = 'el-missing' as DocumentId;
    const api = createMockApi();

    const result = await hydrateDescription(docId, api);

    expect(result).toBeUndefined();
  });

  test('returns undefined when element is not a document', async () => {
    const id = 'el-task99' as DocumentId;
    const api = createMockApi({
      [id]: {
        id,
        type: 'task', // Not a document
        title: 'Some task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
        createdBy: 'el-system1',
        tags: [],
        metadata: {},
      },
    });

    const result = await hydrateDescription(id, api);

    expect(result).toBeUndefined();
  });

  test('returns undefined when document has empty content', async () => {
    const docId = 'el-doc002' as DocumentId;
    const api = createMockApi({
      [docId]: {
        id: docId,
        type: 'document',
        content: '',
        contentType: 'markdown',
        title: 'Empty',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
        createdBy: 'el-system1',
        tags: [],
        metadata: {},
        version: 1,
        previousVersionId: null,
        category: 'task-description',
        status: 'active',
        immutable: false,
      },
    });

    const result = await hydrateDescription(docId, api);

    expect(result).toBeUndefined(); // empty string → undefined
  });
});

// ============================================================================
// diffTaskUpdates
// ============================================================================

describe('diffTaskUpdates', () => {
  test('returns empty object when nothing changed', () => {
    const existing = createTestTask({
      title: 'Same',
      status: 'open' as TaskStatus,
      priority: 3 as Priority,
      taskType: 'task' as TaskTypeValue,
      tags: ['a', 'b'],
      externalRef: 'https://example.com',
    });

    const update: Partial<Task> = {
      title: 'Same',
      status: 'open' as TaskStatus,
      priority: 3 as Priority,
      taskType: 'task' as TaskTypeValue,
      tags: ['a', 'b'],
      externalRef: 'https://example.com',
    };

    const result = diffTaskUpdates(existing, update);

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('detects title change', () => {
    const existing = createTestTask({ title: 'Old Title' });
    const update: Partial<Task> = { title: 'New Title' };

    const result = diffTaskUpdates(existing, update);

    expect(result.title).toBe('New Title');
  });

  test('detects status change', () => {
    const existing = createTestTask({ status: 'open' as TaskStatus });
    const update: Partial<Task> = { status: 'closed' as TaskStatus };

    const result = diffTaskUpdates(existing, update);

    expect(result.status).toBe('closed');
  });

  test('detects priority change', () => {
    const existing = createTestTask({ priority: 3 as Priority });
    const update: Partial<Task> = { priority: 1 as Priority };

    const result = diffTaskUpdates(existing, update);

    expect(result.priority).toBe(1);
  });

  test('detects taskType change', () => {
    const existing = createTestTask({ taskType: 'task' as TaskTypeValue });
    const update: Partial<Task> = { taskType: 'bug' as TaskTypeValue };

    const result = diffTaskUpdates(existing, update);

    expect(result.taskType).toBe('bug');
  });

  test('detects tag change (different content)', () => {
    const existing = createTestTask({ tags: ['old'] });
    const update: Partial<Task> = { tags: ['new'] };

    const result = diffTaskUpdates(existing, update);

    expect(result.tags).toEqual(['new']);
  });

  test('detects tag change (different order treated as same)', () => {
    const existing = createTestTask({ tags: ['a', 'b'] });
    const update: Partial<Task> = { tags: ['b', 'a'] };

    const result = diffTaskUpdates(existing, update);

    // Order-independent comparison means these are the same
    expect(result.tags).toBeUndefined();
  });

  test('detects externalRef change', () => {
    const existing = createTestTask({ externalRef: 'https://old.com' });
    const update: Partial<Task> = { externalRef: 'https://new.com' };

    const result = diffTaskUpdates(existing, update);

    expect(result.externalRef).toBe('https://new.com');
  });

  test('includes pending assignee metadata', () => {
    const existing = createTestTask();
    const update: Partial<Task> = {
      metadata: { _pendingAssignee: 'alice' },
    };

    const result = diffTaskUpdates(existing, update);

    expect((result.metadata as Record<string, unknown>)?._pendingAssignee).toBe('alice');
  });

  test('only includes changed fields in diff', () => {
    const existing = createTestTask({
      title: 'Same Title',
      status: 'open' as TaskStatus,
      priority: 3 as Priority,
      taskType: 'task' as TaskTypeValue,
      tags: ['tag1'],
      externalRef: 'https://example.com',
    });

    const update: Partial<Task> = {
      title: 'Same Title',    // unchanged
      status: 'closed' as TaskStatus, // changed
      priority: 3 as Priority, // unchanged
      taskType: 'bug' as TaskTypeValue, // changed
      tags: ['tag1'],          // unchanged
      externalRef: 'https://example.com', // unchanged
    };

    const result = diffTaskUpdates(existing, update);

    expect(Object.keys(result).sort()).toEqual(['status', 'taskType']);
    expect(result.status).toBe('closed');
    expect(result.taskType).toBe('bug');
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('round-trip conversion', () => {
  test('task → external → task preserves core fields', async () => {
    const config = createTestConfig();
    const api = createMockApi();

    const originalTask = createTestTask({
      title: 'Round Trip Test',
      status: 'open' as TaskStatus,
      priority: 2 as Priority,
      taskType: 'feature' as TaskTypeValue,
      tags: ['web', 'api'],
      externalRef: 'https://github.com/owner/repo/issues/42',
    });

    // Push: task → external
    const externalInput = await taskToExternalTask(originalTask, config, api);

    // Simulate the external system returning this as an ExternalTask
    const externalTask = createTestExternalTask({
      title: externalInput.title,
      state: externalInput.state!,
      labels: [...(externalInput.labels ?? [])],
      assignees: [...(externalInput.assignees ?? [])],
    });

    // Pull: external → task updates
    const updates = externalTaskToTaskUpdates(externalTask, originalTask, config);

    // No changes should be detected (round-trip stability)
    expect(Object.keys(updates)).toHaveLength(0);
  });

  test('task with all fields → external → task update has no spurious changes', async () => {
    const config = createTestConfig();
    const api = createMockApi();

    const task = createTestTask({
      title: 'Full Task',
      status: 'in_progress' as TaskStatus,
      priority: 1 as Priority,
      taskType: 'bug' as TaskTypeValue,
      tags: ['critical', 'backend'],
      externalRef: 'https://github.com/owner/repo/issues/42',
    });

    const externalInput = await taskToExternalTask(task, config, api);

    const externalTask = createTestExternalTask({
      title: externalInput.title,
      state: externalInput.state!,
      labels: [...(externalInput.labels ?? [])],
      url: task.externalRef!,
    });

    const updates = externalTaskToTaskUpdates(externalTask, task, config);

    // All core fields should be identical — diff should be empty
    expect(updates.title).toBeUndefined();
    expect(updates.priority).toBeUndefined();
    expect(updates.taskType).toBeUndefined();
    expect(updates.tags).toBeUndefined();
    expect(updates.externalRef).toBeUndefined();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  test('handles task with empty title', async () => {
    // Edge case: empty title (shouldn't normally happen, but handle gracefully)
    const task = createTestTask({ title: '' });
    const config = createTestConfig();
    const api = createMockApi();

    const result = await taskToExternalTask(task, config, api);

    expect(result.title).toBe('');
  });

  test('handles external task with many labels', () => {
    const labels = [
      'sf:priority:critical',
      'sf:type:bug',
      ...Array.from({ length: 20 }, (_, i) => `user-label-${i}`),
    ];
    const externalTask = createTestExternalTask({ labels });
    const config = createTestConfig();

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect(result.priority).toBe(1);
    expect(result.taskType).toBe('bug');
    expect(result.tags!.length).toBe(20);
  });

  test('config with empty syncLabelPrefix works', () => {
    const config: TaskSyncFieldMapConfig = {
      ...createTestConfig(),
      syncLabelPrefix: '',
    };
    const task = createTestTask({
      priority: 2 as Priority,
      taskType: 'feature' as TaskTypeValue,
      tags: [],
    });

    const labels = buildExternalLabels(task, config);

    // With empty prefix, labels are not prefixed
    expect(labels).toContain('priority:high');
    expect(labels).toContain('type:feature');
  });

  test('stateToStatus can use labels for more granular mapping', () => {
    const config: TaskSyncFieldMapConfig = {
      ...createTestConfig(),
      stateToStatus: (state: 'open' | 'closed', labels: string[]) => {
        if (state === 'closed') return 'closed';
        if (labels.includes('sf:status:in-progress')) return 'in_progress';
        if (labels.includes('sf:status:review')) return 'review';
        return 'open';
      },
    };

    const externalTask = createTestExternalTask({
      state: 'open',
      labels: ['sf:status:in-progress', 'sf:priority:medium'],
    });

    const result = externalTaskToTaskUpdates(externalTask, undefined, config);

    expect(result.status).toBe('in_progress');
  });
});

// ============================================================================
// Status Label Sync — Push Path (buildExternalLabels with GITHUB_FIELD_MAP_CONFIG)
// ============================================================================

describe('buildExternalLabels — status labels (push path)', () => {
  test('status label is included alongside priority and type labels', () => {
    const task = createTestTask({
      status: 'deferred' as TaskStatus,
      priority: 3 as Priority,
      taskType: 'task' as TaskTypeValue,
      tags: [],
    });

    const labels = buildExternalLabels(task, GITHUB_FIELD_MAP_CONFIG);

    expect(labels).toContain('sf:priority:medium');
    expect(labels).toContain('sf:type:task');
    expect(labels).toContain('sf:status:deferred');
    expect(labels).toHaveLength(3);
  });

  test('status label changes when status is in_progress', () => {
    const task = createTestTask({
      status: 'in_progress' as TaskStatus,
      tags: [],
    });

    const labels = buildExternalLabels(task, GITHUB_FIELD_MAP_CONFIG);

    expect(labels).toContain('sf:status:in-progress');
  });

  test('status label changes when status is review', () => {
    const task = createTestTask({
      status: 'review' as TaskStatus,
      tags: [],
    });

    const labels = buildExternalLabels(task, GITHUB_FIELD_MAP_CONFIG);

    expect(labels).toContain('sf:status:review');
  });

  test('status label changes when status is blocked', () => {
    const task = createTestTask({
      status: 'blocked' as TaskStatus,
      tags: [],
    });

    const labels = buildExternalLabels(task, GITHUB_FIELD_MAP_CONFIG);

    expect(labels).toContain('sf:status:blocked');
  });

  test('all TaskStatus values produce a status label', () => {
    const allStatuses: TaskStatus[] = Object.values(TaskStatusEnum) as TaskStatus[];

    for (const status of allStatuses) {
      const task = createTestTask({ status, tags: [] });
      const labels = buildExternalLabels(task, GITHUB_FIELD_MAP_CONFIG);

      const statusLabels = labels.filter((l) => l.startsWith('sf:status:'));
      expect(statusLabels).toHaveLength(1);

      // Verify the status label corresponds to the expected mapping
      const expectedLabel = `sf:${GITHUB_STATUS_LABELS[status]}`;
      expect(labels).toContain(expectedLabel);
    }
  });

  test('config without statusLabels does NOT produce status labels (Linear compatibility)', () => {
    const configWithoutStatusLabels: TaskSyncFieldMapConfig = {
      ...createTestConfig(),
      // createTestConfig() does not include statusLabels
    };

    // Verify the test config doesn't have statusLabels
    expect(configWithoutStatusLabels.statusLabels).toBeUndefined();

    const task = createTestTask({
      status: 'in_progress' as TaskStatus,
      tags: [],
    });

    const labels = buildExternalLabels(task, configWithoutStatusLabels);

    const statusLabels = labels.filter((l) => l.includes('status:'));
    expect(statusLabels).toHaveLength(0);
    // Should still have priority and type labels
    expect(labels).toHaveLength(2);
  });
});

// ============================================================================
// Status Label Sync — Pull Path (parseExternalLabels with GITHUB_FIELD_MAP_CONFIG)
// ============================================================================

describe('parseExternalLabels — status labels (pull path)', () => {
  test('extracts status from sf:status:* label', () => {
    const labels = ['sf:status:deferred', 'sf:priority:high'];

    const result = parseExternalLabels(labels, GITHUB_FIELD_MAP_CONFIG);

    expect(result.status).toBe('deferred');
    expect(result.priority).toBe(2);
  });

  test('unknown sf:status:* values are ignored (forward compatibility)', () => {
    const labels = ['sf:status:unknown-future-status', 'sf:priority:medium'];

    const result = parseExternalLabels(labels, GITHUB_FIELD_MAP_CONFIG);

    // Unknown status value is not in the reverse lookup, so it's skipped
    expect(result.status).toBeUndefined();
    expect(result.priority).toBe(3);
    // The unknown label should NOT appear in userTags (it has the sync prefix)
    expect(result.userTags).toEqual([]);
  });

  test('status extraction works alongside priority and taskType extraction', () => {
    const labels = ['sf:status:in-progress', 'sf:priority:critical', 'sf:type:bug', 'user-tag'];

    const result = parseExternalLabels(labels, GITHUB_FIELD_MAP_CONFIG);

    expect(result.status).toBe('in_progress');
    expect(result.priority).toBe(1);
    expect(result.taskType).toBe('bug');
    expect(result.userTags).toEqual(['user-tag']);
  });

  test('config without statusLabels ignores sf:status:* labels', () => {
    const configWithoutStatusLabels = createTestConfig();

    // Verify no statusLabels
    expect(configWithoutStatusLabels.statusLabels).toBeUndefined();

    const labels = ['sf:status:in-progress', 'sf:priority:high', 'user-tag'];

    const result = parseExternalLabels(labels, configWithoutStatusLabels);

    // sf:status:in-progress should be treated as an unrecognized sync label (skipped)
    expect(result.status).toBeUndefined();
    expect(result.priority).toBe(2);
    // The sf:status:in-progress label should NOT be in userTags (it has the sync prefix)
    expect(result.userTags).toEqual(['user-tag']);
  });
});

// ============================================================================
// Status Label Sync — Pull Path (gitHubStateToStatus, GitHub-specific)
// ============================================================================

describe('gitHubStateToStatus — granular status from labels', () => {
  test('returns in_progress from sf:status:in-progress label', () => {
    const status = gitHubStateToStatus('open', ['sf:status:in-progress']);
    expect(status).toBe('in_progress');
  });

  test('returns deferred from sf:status:deferred label', () => {
    const status = gitHubStateToStatus('open', ['sf:status:deferred']);
    expect(status).toBe('deferred');
  });

  test('returns backlog from sf:status:backlog label', () => {
    const status = gitHubStateToStatus('open', ['sf:status:backlog']);
    expect(status).toBe('backlog');
  });

  test('returns review from sf:status:review label', () => {
    const status = gitHubStateToStatus('open', ['sf:status:review']);
    expect(status).toBe('review');
  });

  test('returns blocked from sf:status:blocked label', () => {
    const status = gitHubStateToStatus('open', ['sf:status:blocked']);
    expect(status).toBe('blocked');
  });

  test('falls back to open when no status label present', () => {
    const status = gitHubStateToStatus('open', []);
    expect(status).toBe('open');
  });

  test('falls back to closed when no status label present', () => {
    const status = gitHubStateToStatus('closed', []);
    expect(status).toBe('closed');
  });

  test('status label takes precedence for open state', () => {
    // When state is open and a status label is present, use the label
    const status = gitHubStateToStatus('open', ['sf:status:review', 'sf:priority:high']);
    expect(status).toBe('review');
  });

  test('status label takes precedence even for closed state', () => {
    // gitHubStateToStatus checks labels first regardless of state
    // When state is 'closed' but a label is present, the label wins
    const status = gitHubStateToStatus('closed', ['sf:status:in-progress']);
    // The implementation checks labels first, so label takes precedence
    expect(status).toBe('in_progress');
  });

  test('ignores non-status sync labels', () => {
    const status = gitHubStateToStatus('open', ['sf:priority:high', 'sf:type:bug']);
    expect(status).toBe('open');
  });

  test('ignores non-sync labels', () => {
    const status = gitHubStateToStatus('open', ['enhancement', 'help wanted']);
    expect(status).toBe('open');
  });
});

// ============================================================================
// Status Label Sync — Integration (externalTaskToTaskUpdates with GITHUB_FIELD_MAP_CONFIG)
// ============================================================================

describe('externalTaskToTaskUpdates — status label integration (pull path)', () => {
  test('end-to-end: sf:status:deferred label results in status=deferred', () => {
    const externalTask = createTestExternalTask({
      title: 'Deferred Issue',
      state: 'open',
      labels: ['sf:status:deferred', 'sf:priority:high', 'sf:type:task'],
    });

    const result = externalTaskToTaskUpdates(externalTask, undefined, GITHUB_FIELD_MAP_CONFIG);

    expect(result.status).toBe('deferred');
    expect(result.priority).toBe(2);
    expect(result.taskType).toBe('task');
  });

  test('end-to-end: sf:status:in-progress label results in status=in_progress', () => {
    const externalTask = createTestExternalTask({
      state: 'open',
      labels: ['sf:status:in-progress', 'sf:priority:medium', 'sf:type:feature'],
    });

    const result = externalTaskToTaskUpdates(externalTask, undefined, GITHUB_FIELD_MAP_CONFIG);

    expect(result.status).toBe('in_progress');
  });

  test('end-to-end: no status label falls back to state-based mapping', () => {
    const externalTask = createTestExternalTask({
      state: 'open',
      labels: ['sf:priority:medium', 'sf:type:task'],
    });

    const result = externalTaskToTaskUpdates(externalTask, undefined, GITHUB_FIELD_MAP_CONFIG);

    expect(result.status).toBe('open');
  });

  test('end-to-end: closed state falls back correctly', () => {
    const externalTask = createTestExternalTask({
      state: 'closed',
      labels: ['sf:priority:medium', 'sf:type:task'],
    });

    const result = externalTaskToTaskUpdates(externalTask, undefined, GITHUB_FIELD_MAP_CONFIG);

    expect(result.status).toBe('closed');
  });

  test('status label parsed from labels is reflected alongside other fields', () => {
    const externalTask = createTestExternalTask({
      state: 'open',
      labels: ['sf:status:review', 'sf:priority:critical', 'sf:type:bug', 'user-label'],
    });

    const result = externalTaskToTaskUpdates(externalTask, undefined, GITHUB_FIELD_MAP_CONFIG);

    expect(result.status).toBe('review');
    expect(result.priority).toBe(1);
    expect(result.taskType).toBe('bug');
    expect(result.tags).toEqual(['user-label']);
  });
});
