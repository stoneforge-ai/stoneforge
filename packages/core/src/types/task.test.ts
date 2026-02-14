import { describe, expect, test } from 'bun:test';
import {
  Task,
  HydratedTask,
  TaskStatus,
  Priority,
  Complexity,
  TaskTypeValue,
  READY_STATUSES,
  STATUS_TRANSITIONS,
  VALID_PRIORITIES,
  VALID_COMPLEXITIES,
  DEFAULT_PRIORITY,
  DEFAULT_COMPLEXITY,
  DEFAULT_TASK_TYPE,
  MAX_TITLE_LENGTH,
  MAX_ACCEPTANCE_CRITERIA_LENGTH,
  MAX_CLOSE_REASON_LENGTH,
  isValidTaskStatus,
  validateTaskStatus,
  isValidPriority,
  validatePriority,
  isValidComplexity,
  validateComplexity,
  isValidTaskType,
  validateTaskType,
  isValidTitle,
  validateTitle,
  validateOptionalText,
  isValidStatusTransition,
  validateStatusTransition,
  isTask,
  validateTask,
  createTask,
  CreateTaskInput,
  updateTaskStatus,
  softDeleteTask,
  isReadyForWork,
  isBlocked,
  isClosed,
  isDeleted,
  isScheduledForFuture,
  isPastDeadline,
  isAssigned,
  hasOwner,
  getPriorityDisplayName,
  getComplexityDisplayName,
  getStatusDisplayName,
  getTaskTypeDisplayName,
  filterByStatus,
  filterByPriority,
  filterByAssignee,
  filterReadyTasks,
  sortByPriority,
  sortByDeadline,
} from './task.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { DocumentId } from './document.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid task for testing
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.TASK,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    title: 'Test task title',
    status: TaskStatus.OPEN,
    priority: Priority.MEDIUM,
    complexity: Complexity.MEDIUM,
    taskType: TaskTypeValue.TASK,
    ...overrides,
  };
}

// ============================================================================
// TaskStatus Tests
// ============================================================================

describe('TaskStatus', () => {
  test('contains all expected statuses', () => {
    expect(TaskStatus.OPEN).toBe('open');
    expect(TaskStatus.IN_PROGRESS).toBe('in_progress');
    expect(TaskStatus.BLOCKED).toBe('blocked');
    expect(TaskStatus.DEFERRED).toBe('deferred');
    expect(TaskStatus.REVIEW).toBe('review');
    expect(TaskStatus.CLOSED).toBe('closed');
    expect(TaskStatus.TOMBSTONE).toBe('tombstone');
    expect(TaskStatus.BACKLOG).toBe('backlog');
  });

  test('has exactly 8 statuses', () => {
    expect(Object.keys(TaskStatus)).toHaveLength(8);
  });
});

describe('READY_STATUSES', () => {
  test('contains open and in_progress', () => {
    expect(READY_STATUSES).toContain(TaskStatus.OPEN);
    expect(READY_STATUSES).toContain(TaskStatus.IN_PROGRESS);
  });

  test('does not contain blocked, deferred, closed, tombstone, backlog', () => {
    expect(READY_STATUSES).not.toContain(TaskStatus.BLOCKED);
    expect(READY_STATUSES).not.toContain(TaskStatus.DEFERRED);
    expect(READY_STATUSES).not.toContain(TaskStatus.CLOSED);
    expect(READY_STATUSES).not.toContain(TaskStatus.TOMBSTONE);
    expect(READY_STATUSES).not.toContain(TaskStatus.BACKLOG);
  });
});

describe('STATUS_TRANSITIONS', () => {
  test('open can transition to in_progress, blocked, deferred, closed', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.OPEN]).toContain(TaskStatus.IN_PROGRESS);
    expect(STATUS_TRANSITIONS[TaskStatus.OPEN]).toContain(TaskStatus.BLOCKED);
    expect(STATUS_TRANSITIONS[TaskStatus.OPEN]).toContain(TaskStatus.DEFERRED);
    expect(STATUS_TRANSITIONS[TaskStatus.OPEN]).toContain(TaskStatus.CLOSED);
  });

  test('in_progress can transition to open, blocked, deferred, closed', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.IN_PROGRESS]).toContain(TaskStatus.OPEN);
    expect(STATUS_TRANSITIONS[TaskStatus.IN_PROGRESS]).toContain(TaskStatus.BLOCKED);
    expect(STATUS_TRANSITIONS[TaskStatus.IN_PROGRESS]).toContain(TaskStatus.DEFERRED);
    expect(STATUS_TRANSITIONS[TaskStatus.IN_PROGRESS]).toContain(TaskStatus.CLOSED);
  });

  test('blocked can transition to open, in_progress, deferred, closed', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.BLOCKED]).toContain(TaskStatus.OPEN);
    expect(STATUS_TRANSITIONS[TaskStatus.BLOCKED]).toContain(TaskStatus.IN_PROGRESS);
    expect(STATUS_TRANSITIONS[TaskStatus.BLOCKED]).toContain(TaskStatus.DEFERRED);
    expect(STATUS_TRANSITIONS[TaskStatus.BLOCKED]).toContain(TaskStatus.CLOSED);
  });

  test('deferred can transition to open, in_progress, backlog', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.DEFERRED]).toContain(TaskStatus.OPEN);
    expect(STATUS_TRANSITIONS[TaskStatus.DEFERRED]).toContain(TaskStatus.IN_PROGRESS);
    expect(STATUS_TRANSITIONS[TaskStatus.DEFERRED]).toContain(TaskStatus.BACKLOG);
    expect(STATUS_TRANSITIONS[TaskStatus.DEFERRED]).toHaveLength(3);
  });

  test('closed can only transition to open (reopen)', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.CLOSED]).toEqual([TaskStatus.OPEN]);
  });

  test('tombstone has no valid transitions (terminal)', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.TOMBSTONE]).toEqual([]);
  });

  test('backlog can transition to open, deferred, closed', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.BACKLOG]).toContain(TaskStatus.OPEN);
    expect(STATUS_TRANSITIONS[TaskStatus.BACKLOG]).toContain(TaskStatus.DEFERRED);
    expect(STATUS_TRANSITIONS[TaskStatus.BACKLOG]).toContain(TaskStatus.CLOSED);
    expect(STATUS_TRANSITIONS[TaskStatus.BACKLOG]).toHaveLength(3);
  });

  test('open can also transition to backlog', () => {
    expect(STATUS_TRANSITIONS[TaskStatus.OPEN]).toContain(TaskStatus.BACKLOG);
  });
});

describe('isValidTaskStatus', () => {
  test('accepts all valid statuses', () => {
    expect(isValidTaskStatus('open')).toBe(true);
    expect(isValidTaskStatus('in_progress')).toBe(true);
    expect(isValidTaskStatus('blocked')).toBe(true);
    expect(isValidTaskStatus('deferred')).toBe(true);
    expect(isValidTaskStatus('closed')).toBe(true);
    expect(isValidTaskStatus('tombstone')).toBe(true);
    expect(isValidTaskStatus('backlog')).toBe(true);
  });

  test('rejects invalid statuses', () => {
    expect(isValidTaskStatus('invalid')).toBe(false);
    expect(isValidTaskStatus('OPEN')).toBe(false); // case sensitive
    expect(isValidTaskStatus(null)).toBe(false);
    expect(isValidTaskStatus(undefined)).toBe(false);
    expect(isValidTaskStatus(123)).toBe(false);
  });
});

describe('validateTaskStatus', () => {
  test('returns valid status', () => {
    expect(validateTaskStatus('open')).toBe('open');
    expect(validateTaskStatus('closed')).toBe('closed');
  });

  test('throws ValidationError for invalid status', () => {
    expect(() => validateTaskStatus('invalid')).toThrow(ValidationError);
    try {
      validateTaskStatus('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_STATUS);
      expect(err.details.field).toBe('status');
    }
  });
});

// ============================================================================
// Priority Tests
// ============================================================================

describe('Priority', () => {
  test('contains all expected priorities', () => {
    expect(Priority.CRITICAL).toBe(1);
    expect(Priority.HIGH).toBe(2);
    expect(Priority.MEDIUM).toBe(3);
    expect(Priority.LOW).toBe(4);
    expect(Priority.MINIMAL).toBe(5);
  });

  test('DEFAULT_PRIORITY is MEDIUM', () => {
    expect(DEFAULT_PRIORITY).toBe(Priority.MEDIUM);
    expect(DEFAULT_PRIORITY).toBe(3);
  });

  test('VALID_PRIORITIES contains 1-5', () => {
    expect(VALID_PRIORITIES).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('isValidPriority', () => {
  test('accepts valid priorities 1-5', () => {
    expect(isValidPriority(1)).toBe(true);
    expect(isValidPriority(2)).toBe(true);
    expect(isValidPriority(3)).toBe(true);
    expect(isValidPriority(4)).toBe(true);
    expect(isValidPriority(5)).toBe(true);
  });

  test('rejects invalid priorities', () => {
    expect(isValidPriority(0)).toBe(false);
    expect(isValidPriority(6)).toBe(false);
    expect(isValidPriority(-1)).toBe(false);
    expect(isValidPriority(1.5)).toBe(false);
    expect(isValidPriority('1')).toBe(false);
    expect(isValidPriority(null)).toBe(false);
  });
});

describe('validatePriority', () => {
  test('returns valid priority', () => {
    expect(validatePriority(1)).toBe(1);
    expect(validatePriority(5)).toBe(5);
  });

  test('throws ValidationError for invalid priority', () => {
    expect(() => validatePriority(0)).toThrow(ValidationError);
    expect(() => validatePriority(6)).toThrow(ValidationError);
    try {
      validatePriority('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('priority');
    }
  });
});

// ============================================================================
// Complexity Tests
// ============================================================================

describe('Complexity', () => {
  test('contains all expected complexities', () => {
    expect(Complexity.TRIVIAL).toBe(1);
    expect(Complexity.SIMPLE).toBe(2);
    expect(Complexity.MEDIUM).toBe(3);
    expect(Complexity.COMPLEX).toBe(4);
    expect(Complexity.VERY_COMPLEX).toBe(5);
  });

  test('DEFAULT_COMPLEXITY is MEDIUM', () => {
    expect(DEFAULT_COMPLEXITY).toBe(Complexity.MEDIUM);
    expect(DEFAULT_COMPLEXITY).toBe(3);
  });

  test('VALID_COMPLEXITIES contains 1-5', () => {
    expect(VALID_COMPLEXITIES).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('isValidComplexity', () => {
  test('accepts valid complexities 1-5', () => {
    expect(isValidComplexity(1)).toBe(true);
    expect(isValidComplexity(2)).toBe(true);
    expect(isValidComplexity(3)).toBe(true);
    expect(isValidComplexity(4)).toBe(true);
    expect(isValidComplexity(5)).toBe(true);
  });

  test('rejects invalid complexities', () => {
    expect(isValidComplexity(0)).toBe(false);
    expect(isValidComplexity(6)).toBe(false);
    expect(isValidComplexity(-1)).toBe(false);
    expect(isValidComplexity(1.5)).toBe(false);
    expect(isValidComplexity('1')).toBe(false);
    expect(isValidComplexity(null)).toBe(false);
  });
});

describe('validateComplexity', () => {
  test('returns valid complexity', () => {
    expect(validateComplexity(1)).toBe(1);
    expect(validateComplexity(5)).toBe(5);
  });

  test('throws ValidationError for invalid complexity', () => {
    expect(() => validateComplexity(0)).toThrow(ValidationError);
    expect(() => validateComplexity(6)).toThrow(ValidationError);
    try {
      validateComplexity('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('complexity');
    }
  });
});

// ============================================================================
// TaskTypeValue Tests
// ============================================================================

describe('TaskTypeValue', () => {
  test('contains all expected types', () => {
    expect(TaskTypeValue.BUG).toBe('bug');
    expect(TaskTypeValue.FEATURE).toBe('feature');
    expect(TaskTypeValue.TASK).toBe('task');
    expect(TaskTypeValue.CHORE).toBe('chore');
  });

  test('has exactly 4 types', () => {
    expect(Object.keys(TaskTypeValue)).toHaveLength(4);
  });

  test('DEFAULT_TASK_TYPE is TASK', () => {
    expect(DEFAULT_TASK_TYPE).toBe(TaskTypeValue.TASK);
  });
});

describe('isValidTaskType', () => {
  test('accepts all valid task types', () => {
    expect(isValidTaskType('bug')).toBe(true);
    expect(isValidTaskType('feature')).toBe(true);
    expect(isValidTaskType('task')).toBe(true);
    expect(isValidTaskType('chore')).toBe(true);
  });

  test('rejects invalid task types', () => {
    expect(isValidTaskType('invalid')).toBe(false);
    expect(isValidTaskType('BUG')).toBe(false); // case sensitive
    expect(isValidTaskType(null)).toBe(false);
    expect(isValidTaskType(123)).toBe(false);
  });
});

describe('validateTaskType', () => {
  test('returns valid task type', () => {
    expect(validateTaskType('bug')).toBe('bug');
    expect(validateTaskType('feature')).toBe('feature');
  });

  test('throws ValidationError for invalid task type', () => {
    expect(() => validateTaskType('invalid')).toThrow(ValidationError);
    try {
      validateTaskType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('taskType');
    }
  });
});

// ============================================================================
// Title Validation Tests
// ============================================================================

describe('isValidTitle', () => {
  test('accepts valid titles', () => {
    expect(isValidTitle('A')).toBe(true); // Min length
    expect(isValidTitle('Valid task title')).toBe(true);
    expect(isValidTitle('a'.repeat(MAX_TITLE_LENGTH))).toBe(true); // Max length
  });

  test('accepts title with leading/trailing spaces (trims them)', () => {
    expect(isValidTitle('  trimmed  ')).toBe(true);
  });

  test('rejects invalid titles', () => {
    expect(isValidTitle('')).toBe(false);
    expect(isValidTitle('   ')).toBe(false); // Only whitespace
    expect(isValidTitle('a'.repeat(MAX_TITLE_LENGTH + 1))).toBe(false); // Too long
    expect(isValidTitle(null)).toBe(false);
    expect(isValidTitle(undefined)).toBe(false);
    expect(isValidTitle(123)).toBe(false);
  });
});

describe('validateTitle', () => {
  test('returns trimmed valid title', () => {
    expect(validateTitle('Valid title')).toBe('Valid title');
    expect(validateTitle('  trimmed  ')).toBe('trimmed');
  });

  test('throws for non-string', () => {
    expect(() => validateTitle(123)).toThrow(ValidationError);
    try {
      validateTitle(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('title');
    }
  });

  test('throws for empty title', () => {
    expect(() => validateTitle('')).toThrow(ValidationError);
    try {
      validateTitle('');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });

  test('throws for title exceeding max length', () => {
    const longTitle = 'a'.repeat(MAX_TITLE_LENGTH + 1);
    expect(() => validateTitle(longTitle)).toThrow(ValidationError);
    try {
      validateTitle(longTitle);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.TITLE_TOO_LONG);
    }
  });
});

describe('validateOptionalText', () => {
  test('returns undefined for undefined/null', () => {
    expect(validateOptionalText(undefined, 'field', 100)).toBeUndefined();
    expect(validateOptionalText(null, 'field', 100)).toBeUndefined();
  });

  test('returns valid string', () => {
    expect(validateOptionalText('test', 'field', 100)).toBe('test');
  });

  test('throws for non-string', () => {
    expect(() => validateOptionalText(123, 'field', 100)).toThrow(ValidationError);
  });

  test('throws for exceeding max length', () => {
    expect(() => validateOptionalText('a'.repeat(101), 'field', 100)).toThrow(ValidationError);
  });
});

// ============================================================================
// Status Transition Validation Tests
// ============================================================================

describe('isValidStatusTransition', () => {
  test('allows same status (no-op)', () => {
    expect(isValidStatusTransition(TaskStatus.OPEN, TaskStatus.OPEN)).toBe(true);
    expect(isValidStatusTransition(TaskStatus.CLOSED, TaskStatus.CLOSED)).toBe(true);
  });

  test('allows valid transitions', () => {
    expect(isValidStatusTransition(TaskStatus.OPEN, TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isValidStatusTransition(TaskStatus.IN_PROGRESS, TaskStatus.CLOSED)).toBe(true);
    expect(isValidStatusTransition(TaskStatus.CLOSED, TaskStatus.OPEN)).toBe(true); // Reopen
  });

  test('rejects invalid transitions', () => {
    expect(isValidStatusTransition(TaskStatus.OPEN, TaskStatus.TOMBSTONE)).toBe(false);
    expect(isValidStatusTransition(TaskStatus.DEFERRED, TaskStatus.CLOSED)).toBe(false);
    expect(isValidStatusTransition(TaskStatus.TOMBSTONE, TaskStatus.OPEN)).toBe(false);
  });
});

describe('validateStatusTransition', () => {
  test('passes for valid transitions', () => {
    expect(() => validateStatusTransition(TaskStatus.OPEN, TaskStatus.IN_PROGRESS)).not.toThrow();
    expect(() => validateStatusTransition(TaskStatus.OPEN, TaskStatus.OPEN)).not.toThrow();
  });

  test('throws for invalid transitions', () => {
    expect(() => validateStatusTransition(TaskStatus.TOMBSTONE, TaskStatus.OPEN)).toThrow(
      ValidationError
    );
    try {
      validateStatusTransition(TaskStatus.OPEN, TaskStatus.TOMBSTONE);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_STATUS);
      expect(err.details.from).toBe('open');
      expect(err.details.to).toBe('tombstone');
      expect(err.details.allowedTransitions).toBeDefined();
    }
  });
});

// ============================================================================
// isTask Type Guard Tests
// ============================================================================

describe('isTask', () => {
  test('accepts valid task', () => {
    expect(isTask(createTestTask())).toBe(true);
  });

  test('accepts task with all statuses', () => {
    for (const status of Object.values(TaskStatus)) {
      expect(isTask(createTestTask({ status }))).toBe(true);
    }
  });

  test('accepts task with all priorities', () => {
    for (let p = 1; p <= 5; p++) {
      expect(isTask(createTestTask({ priority: p as Priority }))).toBe(true);
    }
  });

  test('accepts task with all complexities', () => {
    for (let c = 1; c <= 5; c++) {
      expect(isTask(createTestTask({ complexity: c as Complexity }))).toBe(true);
    }
  });

  test('accepts task with all task types', () => {
    for (const taskType of Object.values(TaskTypeValue)) {
      expect(isTask(createTestTask({ taskType }))).toBe(true);
    }
  });

  test('accepts task with optional fields', () => {
    expect(
      isTask(
        createTestTask({
          descriptionRef: 'el-doc123' as DocumentId,
          acceptanceCriteria: 'Test criteria',
          closeReason: 'Done',
          assignee: 'el-user1' as EntityId,
          owner: 'el-owner1' as EntityId,
          deadline: '2025-12-31T23:59:59.000Z' as Timestamp,
          scheduledFor: '2025-02-01T00:00:00.000Z' as Timestamp,
          closedAt: '2025-01-15T12:00:00.000Z' as Timestamp,
          deletedAt: '2025-01-16T12:00:00.000Z' as Timestamp,
          deletedBy: 'el-admin1' as EntityId,
          deleteReason: 'Duplicate',
          externalRef: 'https://jira.example.com/TASK-123',
        })
      )
    ).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isTask(null)).toBe(false);
    expect(isTask(undefined)).toBe(false);
    expect(isTask('string')).toBe(false);
    expect(isTask(123)).toBe(false);
  });

  test('rejects tasks with missing required fields', () => {
    expect(isTask({ ...createTestTask(), id: undefined })).toBe(false);
    expect(isTask({ ...createTestTask(), type: undefined })).toBe(false);
    expect(isTask({ ...createTestTask(), title: undefined })).toBe(false);
    expect(isTask({ ...createTestTask(), status: undefined })).toBe(false);
    expect(isTask({ ...createTestTask(), priority: undefined })).toBe(false);
    expect(isTask({ ...createTestTask(), complexity: undefined })).toBe(false);
    expect(isTask({ ...createTestTask(), taskType: undefined })).toBe(false);
  });

  test('rejects tasks with wrong type', () => {
    expect(isTask({ ...createTestTask(), type: 'document' })).toBe(false);
    expect(isTask({ ...createTestTask(), type: 'entity' })).toBe(false);
  });

  test('rejects tasks with invalid field values', () => {
    expect(isTask({ ...createTestTask(), title: '' })).toBe(false);
    expect(isTask({ ...createTestTask(), status: 'invalid' })).toBe(false);
    expect(isTask({ ...createTestTask(), priority: 0 })).toBe(false);
    expect(isTask({ ...createTestTask(), priority: 6 })).toBe(false);
    expect(isTask({ ...createTestTask(), complexity: 0 })).toBe(false);
    expect(isTask({ ...createTestTask(), taskType: 'invalid' })).toBe(false);
  });

  test('rejects tasks with invalid optional field types', () => {
    expect(isTask({ ...createTestTask(), descriptionRef: 123 })).toBe(false);
    expect(isTask({ ...createTestTask(), assignee: 123 })).toBe(false);
    expect(isTask({ ...createTestTask(), deadline: 123 })).toBe(false);
  });
});

// ============================================================================
// validateTask Tests
// ============================================================================

describe('validateTask', () => {
  test('returns valid task', () => {
    const task = createTestTask();
    expect(validateTask(task)).toEqual(task);
  });

  test('throws for non-object', () => {
    expect(() => validateTask(null)).toThrow(ValidationError);
    expect(() => validateTask('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateTask({ ...createTestTask(), id: '' })).toThrow(ValidationError);
    expect(() => validateTask({ ...createTestTask(), createdBy: '' })).toThrow(ValidationError);
  });

  test('throws for wrong type value', () => {
    try {
      validateTask({ ...createTestTask(), type: 'document' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('task');
    }
  });

  test('validates task-specific fields', () => {
    expect(() => validateTask({ ...createTestTask(), title: '' })).toThrow(ValidationError);
    expect(() => validateTask({ ...createTestTask(), status: 'invalid' })).toThrow(
      ValidationError
    );
    expect(() => validateTask({ ...createTestTask(), priority: 0 })).toThrow(ValidationError);
    expect(() => validateTask({ ...createTestTask(), complexity: 6 })).toThrow(ValidationError);
    expect(() => validateTask({ ...createTestTask(), taskType: 'invalid' })).toThrow(
      ValidationError
    );
  });

  test('validates optional text field lengths', () => {
    expect(() =>
      validateTask({
        ...createTestTask(),
        acceptanceCriteria: 'a'.repeat(MAX_ACCEPTANCE_CRITERIA_LENGTH + 1),
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// createTask Factory Tests
// ============================================================================

describe('createTask', () => {
  const validInput: CreateTaskInput = {
    title: 'Test task',
    createdBy: 'el-system1' as EntityId,
  };

  test('creates task with required fields only', async () => {
    const task = await createTask(validInput);

    expect(task.title).toBe('Test task');
    expect(task.type).toBe(ElementType.TASK);
    expect(task.createdBy).toBe('el-system1' as EntityId);
    expect(task.status).toBe(TaskStatus.OPEN);
    expect(task.priority).toBe(DEFAULT_PRIORITY);
    expect(task.complexity).toBe(DEFAULT_COMPLEXITY);
    expect(task.taskType).toBe(DEFAULT_TASK_TYPE);
    expect(task.tags).toEqual([]);
    expect(task.metadata).toEqual({});
    expect(task.id).toMatch(/^el-[0-9a-z]{3,8}$/);
  });

  test('creates task with all optional fields', async () => {
    const task = await createTask({
      ...validInput,
      descriptionRef: 'el-doc123' as DocumentId,
      acceptanceCriteria: 'Test criteria',
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      complexity: Complexity.COMPLEX,
      taskType: TaskTypeValue.BUG,
      assignee: 'el-user1' as EntityId,
      owner: 'el-owner1' as EntityId,
      deadline: '2025-12-31T23:59:59.000Z' as Timestamp,
      scheduledFor: '2025-02-01T00:00:00.000Z' as Timestamp,
      externalRef: 'JIRA-123',
      tags: ['urgent', 'bug'],
      metadata: { sprint: 5 },
    });

    expect(task.descriptionRef).toBe('el-doc123' as DocumentId);
    expect(task.acceptanceCriteria).toBe('Test criteria');
    expect(task.status).toBe(TaskStatus.IN_PROGRESS);
    expect(task.priority).toBe(Priority.HIGH);
    expect(task.complexity).toBe(Complexity.COMPLEX);
    expect(task.taskType).toBe(TaskTypeValue.BUG);
    expect(task.assignee).toBe('el-user1' as EntityId);
    expect(task.owner).toBe('el-owner1' as EntityId);
    expect(task.deadline).toBe('2025-12-31T23:59:59.000Z' as Timestamp);
    expect(task.scheduledFor).toBe('2025-02-01T00:00:00.000Z' as Timestamp);
    expect(task.externalRef).toBe('JIRA-123');
    expect(task.tags).toEqual(['urgent', 'bug']);
    expect(task.metadata).toEqual({ sprint: 5 });
  });

  test('trims title', async () => {
    const task = await createTask({ ...validInput, title: '  trimmed title  ' });
    expect(task.title).toBe('trimmed title');
  });

  test('validates title', async () => {
    await expect(createTask({ ...validInput, title: '' })).rejects.toThrow(ValidationError);
    await expect(
      createTask({ ...validInput, title: 'a'.repeat(MAX_TITLE_LENGTH + 1) })
    ).rejects.toThrow(ValidationError);
  });

  test('validates optional fields', async () => {
    await expect(
      createTask({ ...validInput, status: 'invalid' as TaskStatus })
    ).rejects.toThrow(ValidationError);
    await expect(createTask({ ...validInput, priority: 0 as Priority })).rejects.toThrow(
      ValidationError
    );
  });

  test('generates unique IDs for different tasks', async () => {
    const task1 = await createTask(validInput);
    const task2 = await createTask({ ...validInput, title: 'Different title' });

    expect(task1.id).not.toBe(task2.id);
  });

  test('sets createdAt and updatedAt to current time', async () => {
    const before = new Date().toISOString();
    const task = await createTask(validInput);
    const after = new Date().toISOString();

    expect(task.createdAt >= before).toBe(true);
    expect(task.createdAt <= after).toBe(true);
    expect(task.createdAt).toBe(task.updatedAt);
  });
});

// ============================================================================
// updateTaskStatus Tests
// ============================================================================

describe('updateTaskStatus', () => {
  test('updates status for valid transition', () => {
    const task = createTestTask({ status: TaskStatus.OPEN });
    const updated = updateTaskStatus(task, { status: TaskStatus.IN_PROGRESS });

    expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
    expect(updated.updatedAt).not.toBe(task.updatedAt);
  });

  test('sets closedAt when closing', () => {
    const task = createTestTask({ status: TaskStatus.IN_PROGRESS });
    const updated = updateTaskStatus(task, {
      status: TaskStatus.CLOSED,
      closeReason: 'Done!',
    });

    expect(updated.status).toBe(TaskStatus.CLOSED);
    expect(updated.closedAt).toBeDefined();
    expect(updated.closeReason).toBe('Done!');
  });

  test('clears closedAt when reopening', () => {
    const task = createTestTask({
      status: TaskStatus.CLOSED,
      closedAt: '2025-01-15T12:00:00.000Z' as Timestamp,
    });
    const updated = updateTaskStatus(task, { status: TaskStatus.OPEN });

    expect(updated.status).toBe(TaskStatus.OPEN);
    expect(updated.closedAt).toBeUndefined();
  });

  test('allows no-op transitions', () => {
    const task = createTestTask({ status: TaskStatus.OPEN });
    const updated = updateTaskStatus(task, { status: TaskStatus.OPEN });

    expect(updated.status).toBe(TaskStatus.OPEN);
  });

  test('throws for invalid transition', () => {
    const task = createTestTask({ status: TaskStatus.TOMBSTONE });
    expect(() => updateTaskStatus(task, { status: TaskStatus.OPEN })).toThrow(ValidationError);
  });

  test('preserves other task fields', () => {
    const task = createTestTask({
      title: 'Original title',
      priority: Priority.HIGH,
      tags: ['important'],
    });
    const updated = updateTaskStatus(task, { status: TaskStatus.IN_PROGRESS });

    expect(updated.title).toBe('Original title');
    expect(updated.priority).toBe(Priority.HIGH);
    expect(updated.tags).toEqual(['important']);
    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
  });
});

// ============================================================================
// softDeleteTask Tests
// ============================================================================

describe('softDeleteTask', () => {
  test('soft deletes a task', () => {
    const task = createTestTask({ status: TaskStatus.OPEN });
    const deleted = softDeleteTask(task, {
      deletedBy: 'el-admin1' as EntityId,
      deleteReason: 'Duplicate',
    });

    expect(deleted.status).toBe(TaskStatus.TOMBSTONE);
    expect(deleted.deletedAt).toBeDefined();
    expect(deleted.deletedBy).toBe('el-admin1' as EntityId);
    expect(deleted.deleteReason).toBe('Duplicate');
    expect(deleted.updatedAt).not.toBe(task.updatedAt);
  });

  test('works without delete reason', () => {
    const task = createTestTask();
    const deleted = softDeleteTask(task, { deletedBy: 'el-admin1' as EntityId });

    expect(deleted.status).toBe(TaskStatus.TOMBSTONE);
    expect(deleted.deleteReason).toBeUndefined();
  });

  test('throws if task is already deleted', () => {
    const task = createTestTask({ status: TaskStatus.TOMBSTONE });
    expect(() => softDeleteTask(task, { deletedBy: 'el-admin1' as EntityId })).toThrow(
      ValidationError
    );
  });

  test('preserves original task fields', () => {
    const task = createTestTask({
      title: 'Original title',
      assignee: 'el-user1' as EntityId,
    });
    const deleted = softDeleteTask(task, { deletedBy: 'el-admin1' as EntityId });

    expect(deleted.title).toBe('Original title');
    expect(deleted.assignee).toBe('el-user1' as EntityId);
    expect(deleted.id).toBe(task.id);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isReadyForWork', () => {
  test('returns true for open tasks', () => {
    expect(isReadyForWork(createTestTask({ status: TaskStatus.OPEN }))).toBe(true);
  });

  test('returns true for in_progress tasks', () => {
    expect(isReadyForWork(createTestTask({ status: TaskStatus.IN_PROGRESS }))).toBe(true);
  });

  test('returns false for other statuses', () => {
    expect(isReadyForWork(createTestTask({ status: TaskStatus.BLOCKED }))).toBe(false);
    expect(isReadyForWork(createTestTask({ status: TaskStatus.DEFERRED }))).toBe(false);
    expect(isReadyForWork(createTestTask({ status: TaskStatus.CLOSED }))).toBe(false);
    expect(isReadyForWork(createTestTask({ status: TaskStatus.TOMBSTONE }))).toBe(false);
  });
});

describe('isBlocked', () => {
  test('returns true for blocked tasks', () => {
    expect(isBlocked(createTestTask({ status: TaskStatus.BLOCKED }))).toBe(true);
  });

  test('returns false for non-blocked tasks', () => {
    expect(isBlocked(createTestTask({ status: TaskStatus.OPEN }))).toBe(false);
  });
});

describe('isClosed', () => {
  test('returns true for closed tasks', () => {
    expect(isClosed(createTestTask({ status: TaskStatus.CLOSED }))).toBe(true);
  });

  test('returns false for non-closed tasks', () => {
    expect(isClosed(createTestTask({ status: TaskStatus.OPEN }))).toBe(false);
  });
});

describe('isDeleted', () => {
  test('returns true for tombstone tasks', () => {
    expect(isDeleted(createTestTask({ status: TaskStatus.TOMBSTONE }))).toBe(true);
  });

  test('returns false for non-deleted tasks', () => {
    expect(isDeleted(createTestTask({ status: TaskStatus.OPEN }))).toBe(false);
    expect(isDeleted(createTestTask({ status: TaskStatus.CLOSED }))).toBe(false);
  });
});

describe('isScheduledForFuture', () => {
  test('returns false for tasks without scheduledFor', () => {
    expect(isScheduledForFuture(createTestTask())).toBe(false);
  });

  test('returns true for tasks scheduled in the future', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString() as Timestamp;
    expect(isScheduledForFuture(createTestTask({ scheduledFor: futureDate }))).toBe(true);
  });

  test('returns false for tasks scheduled in the past', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString() as Timestamp;
    expect(isScheduledForFuture(createTestTask({ scheduledFor: pastDate }))).toBe(false);
  });
});

describe('isPastDeadline', () => {
  test('returns false for tasks without deadline', () => {
    expect(isPastDeadline(createTestTask())).toBe(false);
  });

  test('returns true for tasks past deadline', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString() as Timestamp;
    expect(isPastDeadline(createTestTask({ deadline: pastDate }))).toBe(true);
  });

  test('returns false for tasks before deadline', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString() as Timestamp;
    expect(isPastDeadline(createTestTask({ deadline: futureDate }))).toBe(false);
  });
});

describe('isAssigned', () => {
  test('returns true for assigned tasks', () => {
    expect(isAssigned(createTestTask({ assignee: 'el-user1' as EntityId }))).toBe(true);
  });

  test('returns false for unassigned tasks', () => {
    expect(isAssigned(createTestTask())).toBe(false);
  });
});

describe('hasOwner', () => {
  test('returns true for tasks with owner', () => {
    expect(hasOwner(createTestTask({ owner: 'el-owner1' as EntityId }))).toBe(true);
  });

  test('returns false for tasks without owner', () => {
    expect(hasOwner(createTestTask())).toBe(false);
  });
});

// ============================================================================
// Display Name Tests
// ============================================================================

describe('getPriorityDisplayName', () => {
  test('returns display name for each priority', () => {
    expect(getPriorityDisplayName(Priority.CRITICAL)).toBe('Critical');
    expect(getPriorityDisplayName(Priority.HIGH)).toBe('High');
    expect(getPriorityDisplayName(Priority.MEDIUM)).toBe('Medium');
    expect(getPriorityDisplayName(Priority.LOW)).toBe('Low');
    expect(getPriorityDisplayName(Priority.MINIMAL)).toBe('Minimal');
  });
});

describe('getComplexityDisplayName', () => {
  test('returns display name for each complexity', () => {
    expect(getComplexityDisplayName(Complexity.TRIVIAL)).toBe('Trivial');
    expect(getComplexityDisplayName(Complexity.SIMPLE)).toBe('Simple');
    expect(getComplexityDisplayName(Complexity.MEDIUM)).toBe('Medium');
    expect(getComplexityDisplayName(Complexity.COMPLEX)).toBe('Complex');
    expect(getComplexityDisplayName(Complexity.VERY_COMPLEX)).toBe('Very Complex');
  });
});

describe('getStatusDisplayName', () => {
  test('returns display name for each status', () => {
    expect(getStatusDisplayName(TaskStatus.OPEN)).toBe('Open');
    expect(getStatusDisplayName(TaskStatus.IN_PROGRESS)).toBe('In Progress');
    expect(getStatusDisplayName(TaskStatus.BLOCKED)).toBe('Blocked');
    expect(getStatusDisplayName(TaskStatus.DEFERRED)).toBe('Deferred');
    expect(getStatusDisplayName(TaskStatus.CLOSED)).toBe('Closed');
    expect(getStatusDisplayName(TaskStatus.TOMBSTONE)).toBe('Deleted');
  });
});

describe('getTaskTypeDisplayName', () => {
  test('returns display name for each task type', () => {
    expect(getTaskTypeDisplayName(TaskTypeValue.BUG)).toBe('Bug');
    expect(getTaskTypeDisplayName(TaskTypeValue.FEATURE)).toBe('Feature');
    expect(getTaskTypeDisplayName(TaskTypeValue.TASK)).toBe('Task');
    expect(getTaskTypeDisplayName(TaskTypeValue.CHORE)).toBe('Chore');
  });
});

// ============================================================================
// Filter and Sort Tests
// ============================================================================

describe('filterByStatus', () => {
  const tasks: Task[] = [
    createTestTask({ id: 'el-1' as ElementId, status: TaskStatus.OPEN }),
    createTestTask({ id: 'el-2' as ElementId, status: TaskStatus.IN_PROGRESS }),
    createTestTask({ id: 'el-3' as ElementId, status: TaskStatus.OPEN }),
    createTestTask({ id: 'el-4' as ElementId, status: TaskStatus.CLOSED }),
  ];

  test('filters tasks by status', () => {
    const openTasks = filterByStatus(tasks, TaskStatus.OPEN);
    expect(openTasks).toHaveLength(2);
    expect(openTasks.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });

  test('returns empty array when no matches', () => {
    expect(filterByStatus(tasks, TaskStatus.BLOCKED)).toEqual([]);
  });
});

describe('filterByPriority', () => {
  const tasks: Task[] = [
    createTestTask({ id: 'el-1' as ElementId, priority: Priority.HIGH }),
    createTestTask({ id: 'el-2' as ElementId, priority: Priority.LOW }),
    createTestTask({ id: 'el-3' as ElementId, priority: Priority.HIGH }),
  ];

  test('filters tasks by priority', () => {
    const highPriority = filterByPriority(tasks, Priority.HIGH);
    expect(highPriority).toHaveLength(2);
    expect(highPriority.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });
});

describe('filterByAssignee', () => {
  const user1 = 'el-user1' as EntityId;
  const user2 = 'el-user2' as EntityId;
  const tasks: Task[] = [
    createTestTask({ id: 'el-1' as ElementId, assignee: user1 }),
    createTestTask({ id: 'el-2' as ElementId, assignee: user2 }),
    createTestTask({ id: 'el-3' as ElementId }), // unassigned
    createTestTask({ id: 'el-4' as ElementId, assignee: user1 }),
  ];

  test('filters tasks by assignee', () => {
    const user1Tasks = filterByAssignee(tasks, user1);
    expect(user1Tasks).toHaveLength(2);
    expect(user1Tasks.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-4' as ElementId]);
  });

  test('filters unassigned tasks', () => {
    const unassigned = filterByAssignee(tasks, undefined);
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].id).toBe('el-3' as ElementId);
  });
});

describe('filterReadyTasks', () => {
  const tasks: Task[] = [
    createTestTask({ id: 'el-1' as ElementId, status: TaskStatus.OPEN }),
    createTestTask({ id: 'el-2' as ElementId, status: TaskStatus.BLOCKED }),
    createTestTask({ id: 'el-3' as ElementId, status: TaskStatus.IN_PROGRESS }),
    createTestTask({ id: 'el-4' as ElementId, status: TaskStatus.CLOSED }),
  ];

  test('filters ready tasks', () => {
    const ready = filterReadyTasks(tasks);
    expect(ready).toHaveLength(2);
    expect(ready.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });
});

describe('sortByPriority', () => {
  const tasks: Task[] = [
    createTestTask({ id: 'el-1' as ElementId, priority: Priority.LOW }),
    createTestTask({ id: 'el-2' as ElementId, priority: Priority.CRITICAL }),
    createTestTask({ id: 'el-3' as ElementId, priority: Priority.HIGH }),
    createTestTask({ id: 'el-4' as ElementId, priority: Priority.MEDIUM }),
  ];

  test('sorts tasks by priority (highest first)', () => {
    const sorted = sortByPriority(tasks);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-2' as ElementId, // Critical (1)
      'el-3' as ElementId, // High (2)
      'el-4' as ElementId, // Medium (3)
      'el-1' as ElementId, // Low (4)
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...tasks];
    sortByPriority(tasks);
    expect(tasks).toEqual(original);
  });
});

describe('sortByDeadline', () => {
  const tasks: Task[] = [
    createTestTask({ id: 'el-1' as ElementId }), // no deadline
    createTestTask({
      id: 'el-2' as ElementId,
      deadline: '2025-12-31T00:00:00.000Z' as Timestamp,
    }),
    createTestTask({
      id: 'el-3' as ElementId,
      deadline: '2025-06-15T00:00:00.000Z' as Timestamp,
    }),
    createTestTask({ id: 'el-4' as ElementId }), // no deadline
  ];

  test('sorts tasks by deadline (earliest first, null last)', () => {
    const sorted = sortByDeadline(tasks);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-3' as ElementId, // June 2025
      'el-2' as ElementId, // Dec 2025
      'el-1' as ElementId, // no deadline
      'el-4' as ElementId, // no deadline
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...tasks];
    sortByDeadline(tasks);
    expect(tasks).toEqual(original);
  });
});

// ============================================================================
// Edge Cases and Property-Based Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles maximum title length', async () => {
    const maxTitle = 'a'.repeat(MAX_TITLE_LENGTH);
    const task = await createTask({
      title: maxTitle,
      createdBy: 'el-system1' as EntityId,
    });
    expect(task.title).toBe(maxTitle);
  });

  test('handles unicode in title', async () => {
    const unicodeTitle = '任务标题 🎯 タスク';
    const task = await createTask({
      title: unicodeTitle,
      createdBy: 'el-system1' as EntityId,
    });
    expect(task.title).toBe(unicodeTitle);
  });

  test('handles maximum acceptance criteria length', () => {
    const maxCriteria = 'a'.repeat(MAX_ACCEPTANCE_CRITERIA_LENGTH);
    const task = createTestTask({ acceptanceCriteria: maxCriteria });
    expect(isTask(task)).toBe(true);
  });

  test('validates optional text fields during validateTask', () => {
    expect(() =>
      validateTask({
        ...createTestTask(),
        closeReason: 'a'.repeat(MAX_CLOSE_REASON_LENGTH + 1),
      })
    ).toThrow(ValidationError);
  });
});

describe('Property-based tests', () => {
  test('all valid statuses create valid tasks', () => {
    for (const status of Object.values(TaskStatus)) {
      const task = createTestTask({ status });
      expect(isTask(task)).toBe(true);
    }
  });

  test('all valid priorities create valid tasks', () => {
    for (let p = 1; p <= 5; p++) {
      const task = createTestTask({ priority: p as Priority });
      expect(isTask(task)).toBe(true);
    }
  });

  test('all valid complexities create valid tasks', () => {
    for (let c = 1; c <= 5; c++) {
      const task = createTestTask({ complexity: c as Complexity });
      expect(isTask(task)).toBe(true);
    }
  });

  test('all valid task types create valid tasks', () => {
    for (const taskType of Object.values(TaskTypeValue)) {
      const task = createTestTask({ taskType });
      expect(isTask(task)).toBe(true);
    }
  });

  test('status transition matrix is valid', () => {
    for (const fromStatus of Object.values(TaskStatus)) {
      for (const toStatus of STATUS_TRANSITIONS[fromStatus]) {
        expect(isValidStatusTransition(fromStatus, toStatus)).toBe(true);
      }
    }
  });

  test('priority validation is consistent', () => {
    for (const p of VALID_PRIORITIES) {
      expect(isValidPriority(p)).toBe(true);
      expect(validatePriority(p)).toBe(p);
    }

    for (const p of [-10, -1, 0]) {
      expect(isValidPriority(p)).toBe(false);
      expect(() => validatePriority(p)).toThrow(ValidationError);
    }

    for (const p of [6, 7, 10]) {
      expect(isValidPriority(p)).toBe(false);
      expect(() => validatePriority(p)).toThrow(ValidationError);
    }
  });

  test('complexity validation is consistent', () => {
    for (const c of VALID_COMPLEXITIES) {
      expect(isValidComplexity(c)).toBe(true);
      expect(validateComplexity(c)).toBe(c);
    }

    for (const c of [-10, -1, 0]) {
      expect(isValidComplexity(c)).toBe(false);
      expect(() => validateComplexity(c)).toThrow(ValidationError);
    }

    for (const c of [6, 7, 10]) {
      expect(isValidComplexity(c)).toBe(false);
      expect(() => validateComplexity(c)).toThrow(ValidationError);
    }
  });
});

describe('HydratedTask interface', () => {
  test('HydratedTask extends Task with hydrated fields', () => {
    const hydratedTask: HydratedTask = {
      ...createTestTask(),
      descriptionRef: 'el-doc1' as DocumentId,
      description: 'Full description content',
    };

    expect(hydratedTask.description).toBe('Full description content');
    expect(isTask(hydratedTask)).toBe(true); // Base task validation still works
  });
});

describe('Status lifecycle scenarios', () => {
  test('complete task lifecycle: open -> in_progress -> closed', () => {
    let task = createTestTask({ status: TaskStatus.OPEN });

    task = updateTaskStatus(task, { status: TaskStatus.IN_PROGRESS });
    expect(task.status).toBe(TaskStatus.IN_PROGRESS);

    task = updateTaskStatus(task, { status: TaskStatus.CLOSED, closeReason: 'Completed' });
    expect(task.status).toBe(TaskStatus.CLOSED);
    expect(task.closedAt).toBeDefined();
    expect(task.closeReason).toBe('Completed');
  });

  test('reopen workflow: closed -> open -> in_progress', () => {
    let task = createTestTask({
      status: TaskStatus.CLOSED,
      closedAt: '2025-01-15T12:00:00.000Z' as Timestamp,
    });

    task = updateTaskStatus(task, { status: TaskStatus.OPEN });
    expect(task.status).toBe(TaskStatus.OPEN);
    expect(task.closedAt).toBeUndefined();

    task = updateTaskStatus(task, { status: TaskStatus.IN_PROGRESS });
    expect(task.status).toBe(TaskStatus.IN_PROGRESS);
  });

  test('blocked workflow: open -> blocked -> open', () => {
    let task = createTestTask({ status: TaskStatus.OPEN });

    task = updateTaskStatus(task, { status: TaskStatus.BLOCKED });
    expect(task.status).toBe(TaskStatus.BLOCKED);

    task = updateTaskStatus(task, { status: TaskStatus.OPEN });
    expect(task.status).toBe(TaskStatus.OPEN);
  });

  test('deferred workflow: open -> deferred -> in_progress', () => {
    let task = createTestTask({ status: TaskStatus.OPEN });

    task = updateTaskStatus(task, { status: TaskStatus.DEFERRED });
    expect(task.status).toBe(TaskStatus.DEFERRED);

    task = updateTaskStatus(task, { status: TaskStatus.IN_PROGRESS });
    expect(task.status).toBe(TaskStatus.IN_PROGRESS);
  });

  test('soft delete from any active status', () => {
    const statuses = [
      TaskStatus.OPEN,
      TaskStatus.IN_PROGRESS,
      TaskStatus.BLOCKED,
      TaskStatus.DEFERRED,
      TaskStatus.CLOSED,
    ];

    for (const status of statuses) {
      const task = createTestTask({ status });
      const deleted = softDeleteTask(task, { deletedBy: 'el-admin1' as EntityId });
      expect(deleted.status).toBe(TaskStatus.TOMBSTONE);
    }
  });
});

