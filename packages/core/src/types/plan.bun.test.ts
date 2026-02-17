import { describe, expect, test } from 'bun:test';
import {
  Plan,
  HydratedPlan,
  PlanStatus,
  PlanProgress,
  PLAN_STATUS_TRANSITIONS,
  MIN_PLAN_TITLE_LENGTH,
  MAX_PLAN_TITLE_LENGTH,
  MAX_CANCEL_REASON_LENGTH,
  isValidPlanStatus,
  validatePlanStatus,
  isValidPlanTitle,
  validatePlanTitle,
  validatePlanOptionalText,
  isValidPlanStatusTransition,
  validatePlanStatusTransition,
  isPlan,
  validatePlan,
  createPlan,
  CreatePlanInput,
  updatePlanStatus,
  isDraft,
  isActive,
  isCompleted,
  isCancelled,
  getPlanStatusDisplayName,
  calculatePlanProgress,
  canAutoComplete,
  filterByPlanStatus,
  filterActivePlans,
  filterDraftPlans,
  sortByCreationDate,
} from './plan.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { DocumentId } from './document.js';
import { TaskStatus } from './task.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid plan for testing
function createTestPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.PLAN,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    title: 'Test plan title',
    status: PlanStatus.DRAFT,
    ...overrides,
  };
}

// Helper to create task status counts
function createTaskStatusCounts(overrides: Partial<Record<TaskStatus, number>> = {}): Record<TaskStatus, number> {
  return {
    [TaskStatus.OPEN]: 0,
    [TaskStatus.IN_PROGRESS]: 0,
    [TaskStatus.BLOCKED]: 0,
    [TaskStatus.DEFERRED]: 0,
    [TaskStatus.CLOSED]: 0,
    [TaskStatus.TOMBSTONE]: 0,
    ...overrides,
  };
}

// ============================================================================
// PlanStatus Tests
// ============================================================================

describe('PlanStatus', () => {
  test('contains all expected statuses', () => {
    expect(PlanStatus.DRAFT).toBe('draft');
    expect(PlanStatus.ACTIVE).toBe('active');
    expect(PlanStatus.COMPLETED).toBe('completed');
    expect(PlanStatus.CANCELLED).toBe('cancelled');
  });

  test('has exactly 4 statuses', () => {
    expect(Object.keys(PlanStatus)).toHaveLength(4);
  });
});

describe('PLAN_STATUS_TRANSITIONS', () => {
  test('draft can transition to active, cancelled', () => {
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.DRAFT]).toContain(PlanStatus.ACTIVE);
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.DRAFT]).toContain(PlanStatus.CANCELLED);
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.DRAFT]).toHaveLength(2);
  });

  test('active can transition to completed, cancelled', () => {
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.ACTIVE]).toContain(PlanStatus.COMPLETED);
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.ACTIVE]).toContain(PlanStatus.CANCELLED);
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.ACTIVE]).toHaveLength(2);
  });

  test('completed can transition to active (reopen)', () => {
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.COMPLETED]).toEqual([PlanStatus.ACTIVE]);
  });

  test('cancelled can transition to draft (restart)', () => {
    expect(PLAN_STATUS_TRANSITIONS[PlanStatus.CANCELLED]).toEqual([PlanStatus.DRAFT]);
  });
});

describe('isValidPlanStatus', () => {
  test('accepts all valid statuses', () => {
    expect(isValidPlanStatus('draft')).toBe(true);
    expect(isValidPlanStatus('active')).toBe(true);
    expect(isValidPlanStatus('completed')).toBe(true);
    expect(isValidPlanStatus('cancelled')).toBe(true);
  });

  test('rejects invalid statuses', () => {
    expect(isValidPlanStatus('invalid')).toBe(false);
    expect(isValidPlanStatus('DRAFT')).toBe(false); // case sensitive
    expect(isValidPlanStatus('open')).toBe(false); // task status, not plan
    expect(isValidPlanStatus(null)).toBe(false);
    expect(isValidPlanStatus(undefined)).toBe(false);
    expect(isValidPlanStatus(123)).toBe(false);
  });
});

describe('validatePlanStatus', () => {
  test('returns valid status', () => {
    expect(validatePlanStatus('draft')).toBe('draft');
    expect(validatePlanStatus('active')).toBe('active');
    expect(validatePlanStatus('completed')).toBe('completed');
    expect(validatePlanStatus('cancelled')).toBe('cancelled');
  });

  test('throws ValidationError for invalid status', () => {
    expect(() => validatePlanStatus('invalid')).toThrow(ValidationError);
    try {
      validatePlanStatus('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_STATUS);
      expect(err.details.field).toBe('status');
    }
  });
});

// ============================================================================
// Title Validation Tests
// ============================================================================

describe('isValidPlanTitle', () => {
  test('accepts valid titles', () => {
    expect(isValidPlanTitle('A')).toBe(true); // Min length
    expect(isValidPlanTitle('Valid plan title')).toBe(true);
    expect(isValidPlanTitle('a'.repeat(MAX_PLAN_TITLE_LENGTH))).toBe(true); // Max length
  });

  test('accepts title with leading/trailing spaces (trims them)', () => {
    expect(isValidPlanTitle('  trimmed  ')).toBe(true);
  });

  test('rejects invalid titles', () => {
    expect(isValidPlanTitle('')).toBe(false);
    expect(isValidPlanTitle('   ')).toBe(false); // Only whitespace
    expect(isValidPlanTitle('a'.repeat(MAX_PLAN_TITLE_LENGTH + 1))).toBe(false); // Too long
    expect(isValidPlanTitle(null)).toBe(false);
    expect(isValidPlanTitle(undefined)).toBe(false);
    expect(isValidPlanTitle(123)).toBe(false);
  });
});

describe('validatePlanTitle', () => {
  test('returns trimmed valid title', () => {
    expect(validatePlanTitle('Valid title')).toBe('Valid title');
    expect(validatePlanTitle('  trimmed  ')).toBe('trimmed');
  });

  test('throws for non-string', () => {
    expect(() => validatePlanTitle(123)).toThrow(ValidationError);
    try {
      validatePlanTitle(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('title');
    }
  });

  test('throws for empty title', () => {
    expect(() => validatePlanTitle('')).toThrow(ValidationError);
    try {
      validatePlanTitle('');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });

  test('throws for title exceeding max length', () => {
    const longTitle = 'a'.repeat(MAX_PLAN_TITLE_LENGTH + 1);
    expect(() => validatePlanTitle(longTitle)).toThrow(ValidationError);
    try {
      validatePlanTitle(longTitle);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.TITLE_TOO_LONG);
    }
  });
});

describe('validatePlanOptionalText', () => {
  test('returns undefined for undefined/null', () => {
    expect(validatePlanOptionalText(undefined, 'field', 100)).toBeUndefined();
    expect(validatePlanOptionalText(null, 'field', 100)).toBeUndefined();
  });

  test('returns valid string', () => {
    expect(validatePlanOptionalText('test', 'field', 100)).toBe('test');
  });

  test('throws for non-string', () => {
    expect(() => validatePlanOptionalText(123, 'field', 100)).toThrow(ValidationError);
  });

  test('throws for exceeding max length', () => {
    expect(() => validatePlanOptionalText('a'.repeat(101), 'field', 100)).toThrow(ValidationError);
  });
});

// ============================================================================
// Status Transition Validation Tests
// ============================================================================

describe('isValidPlanStatusTransition', () => {
  test('allows same status (no-op)', () => {
    expect(isValidPlanStatusTransition(PlanStatus.DRAFT, PlanStatus.DRAFT)).toBe(true);
    expect(isValidPlanStatusTransition(PlanStatus.ACTIVE, PlanStatus.ACTIVE)).toBe(true);
    expect(isValidPlanStatusTransition(PlanStatus.COMPLETED, PlanStatus.COMPLETED)).toBe(true);
    expect(isValidPlanStatusTransition(PlanStatus.CANCELLED, PlanStatus.CANCELLED)).toBe(true);
  });

  test('allows valid transitions from draft', () => {
    expect(isValidPlanStatusTransition(PlanStatus.DRAFT, PlanStatus.ACTIVE)).toBe(true);
    expect(isValidPlanStatusTransition(PlanStatus.DRAFT, PlanStatus.CANCELLED)).toBe(true);
  });

  test('allows valid transitions from active', () => {
    expect(isValidPlanStatusTransition(PlanStatus.ACTIVE, PlanStatus.COMPLETED)).toBe(true);
    expect(isValidPlanStatusTransition(PlanStatus.ACTIVE, PlanStatus.CANCELLED)).toBe(true);
  });

  test('allows reopen from completed to active', () => {
    expect(isValidPlanStatusTransition(PlanStatus.COMPLETED, PlanStatus.ACTIVE)).toBe(true);
  });

  test('allows restart from cancelled to draft', () => {
    expect(isValidPlanStatusTransition(PlanStatus.CANCELLED, PlanStatus.DRAFT)).toBe(true);
  });

  test('rejects invalid transitions', () => {
    // From draft
    expect(isValidPlanStatusTransition(PlanStatus.DRAFT, PlanStatus.COMPLETED)).toBe(false);

    // From active
    expect(isValidPlanStatusTransition(PlanStatus.ACTIVE, PlanStatus.DRAFT)).toBe(false);

    // From completed
    expect(isValidPlanStatusTransition(PlanStatus.COMPLETED, PlanStatus.DRAFT)).toBe(false);
    expect(isValidPlanStatusTransition(PlanStatus.COMPLETED, PlanStatus.CANCELLED)).toBe(false);

    // From cancelled
    expect(isValidPlanStatusTransition(PlanStatus.CANCELLED, PlanStatus.ACTIVE)).toBe(false);
    expect(isValidPlanStatusTransition(PlanStatus.CANCELLED, PlanStatus.COMPLETED)).toBe(false);
  });
});

describe('validatePlanStatusTransition', () => {
  test('passes for valid transitions', () => {
    expect(() => validatePlanStatusTransition(PlanStatus.DRAFT, PlanStatus.ACTIVE)).not.toThrow();
    expect(() => validatePlanStatusTransition(PlanStatus.ACTIVE, PlanStatus.COMPLETED)).not.toThrow();
    expect(() => validatePlanStatusTransition(PlanStatus.DRAFT, PlanStatus.DRAFT)).not.toThrow();
  });

  test('throws for invalid transitions', () => {
    expect(() => validatePlanStatusTransition(PlanStatus.DRAFT, PlanStatus.COMPLETED)).toThrow(
      ValidationError
    );
    try {
      validatePlanStatusTransition(PlanStatus.DRAFT, PlanStatus.COMPLETED);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_STATUS);
      expect(err.details.from).toBe('draft');
      expect(err.details.to).toBe('completed');
      expect(err.details.allowedTransitions).toBeDefined();
    }
  });
});

// ============================================================================
// isPlan Type Guard Tests
// ============================================================================

describe('isPlan', () => {
  test('accepts valid plan', () => {
    expect(isPlan(createTestPlan())).toBe(true);
  });

  test('accepts plan with all statuses', () => {
    for (const status of Object.values(PlanStatus)) {
      expect(isPlan(createTestPlan({ status }))).toBe(true);
    }
  });

  test('accepts plan with optional fields', () => {
    expect(
      isPlan(
        createTestPlan({
          descriptionRef: 'el-doc123' as DocumentId,
          completedAt: '2025-01-15T12:00:00.000Z' as Timestamp,
          cancelledAt: '2025-01-16T12:00:00.000Z' as Timestamp,
          cancelReason: 'No longer needed',
        })
      )
    ).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isPlan(null)).toBe(false);
    expect(isPlan(undefined)).toBe(false);
    expect(isPlan('string')).toBe(false);
    expect(isPlan(123)).toBe(false);
  });

  test('rejects plans with missing required fields', () => {
    expect(isPlan({ ...createTestPlan(), id: undefined })).toBe(false);
    expect(isPlan({ ...createTestPlan(), type: undefined })).toBe(false);
    expect(isPlan({ ...createTestPlan(), title: undefined })).toBe(false);
    expect(isPlan({ ...createTestPlan(), status: undefined })).toBe(false);
  });

  test('rejects plans with wrong type', () => {
    expect(isPlan({ ...createTestPlan(), type: 'task' })).toBe(false);
    expect(isPlan({ ...createTestPlan(), type: 'document' })).toBe(false);
  });

  test('rejects plans with invalid field values', () => {
    expect(isPlan({ ...createTestPlan(), title: '' })).toBe(false);
    expect(isPlan({ ...createTestPlan(), status: 'invalid' })).toBe(false);
    expect(isPlan({ ...createTestPlan(), status: 'open' })).toBe(false); // task status
  });

  test('rejects plans with invalid optional field types', () => {
    expect(isPlan({ ...createTestPlan(), descriptionRef: 123 })).toBe(false);
    expect(isPlan({ ...createTestPlan(), completedAt: 123 })).toBe(false);
    expect(isPlan({ ...createTestPlan(), cancelledAt: 123 })).toBe(false);
    expect(isPlan({ ...createTestPlan(), cancelReason: 123 })).toBe(false);
  });
});

// ============================================================================
// validatePlan Tests
// ============================================================================

describe('validatePlan', () => {
  test('returns valid plan', () => {
    const plan = createTestPlan();
    expect(validatePlan(plan)).toEqual(plan);
  });

  test('throws for non-object', () => {
    expect(() => validatePlan(null)).toThrow(ValidationError);
    expect(() => validatePlan('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validatePlan({ ...createTestPlan(), id: '' })).toThrow(ValidationError);
    expect(() => validatePlan({ ...createTestPlan(), createdBy: '' })).toThrow(ValidationError);
  });

  test('throws for wrong type value', () => {
    try {
      validatePlan({ ...createTestPlan(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('plan');
    }
  });

  test('validates plan-specific fields', () => {
    expect(() => validatePlan({ ...createTestPlan(), title: '' })).toThrow(ValidationError);
    expect(() => validatePlan({ ...createTestPlan(), status: 'invalid' })).toThrow(
      ValidationError
    );
  });

  test('validates optional text field lengths', () => {
    expect(() =>
      validatePlan({
        ...createTestPlan(),
        cancelReason: 'a'.repeat(MAX_CANCEL_REASON_LENGTH + 1),
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// createPlan Factory Tests
// ============================================================================

describe('createPlan', () => {
  const validInput: CreatePlanInput = {
    title: 'Test plan',
    createdBy: 'el-system1' as EntityId,
  };

  test('creates plan with required fields only', async () => {
    const plan = await createPlan(validInput);

    expect(plan.title).toBe('Test plan');
    expect(plan.type).toBe(ElementType.PLAN);
    expect(plan.createdBy).toBe('el-system1' as EntityId);
    expect(plan.status).toBe(PlanStatus.DRAFT);
    expect(plan.tags).toEqual([]);
    expect(plan.metadata).toEqual({});
    expect(plan.id).toMatch(/^el-[0-9a-z]{3,8}$/);
  });

  test('creates plan with all optional fields', async () => {
    const plan = await createPlan({
      ...validInput,
      descriptionRef: 'el-doc123' as DocumentId,
      status: PlanStatus.ACTIVE,
      tags: ['sprint-1', 'priority'],
      metadata: { quarter: 'Q1' },
    });

    expect(plan.descriptionRef).toBe('el-doc123' as DocumentId);
    expect(plan.status).toBe(PlanStatus.ACTIVE);
    expect(plan.tags).toEqual(['sprint-1', 'priority']);
    expect(plan.metadata).toEqual({ quarter: 'Q1' });
  });

  test('trims title', async () => {
    const plan = await createPlan({ ...validInput, title: '  trimmed title  ' });
    expect(plan.title).toBe('trimmed title');
  });

  test('validates title', async () => {
    await expect(createPlan({ ...validInput, title: '' })).rejects.toThrow(ValidationError);
    await expect(
      createPlan({ ...validInput, title: 'a'.repeat(MAX_PLAN_TITLE_LENGTH + 1) })
    ).rejects.toThrow(ValidationError);
  });

  test('validates optional fields', async () => {
    await expect(
      createPlan({ ...validInput, status: 'invalid' as PlanStatus })
    ).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs for different plans', async () => {
    const plan1 = await createPlan(validInput);
    const plan2 = await createPlan({ ...validInput, title: 'Different title' });

    expect(plan1.id).not.toBe(plan2.id);
  });

  test('sets createdAt and updatedAt to current time', async () => {
    const before = new Date().toISOString();
    const plan = await createPlan(validInput);
    const after = new Date().toISOString();

    expect(plan.createdAt >= before).toBe(true);
    expect(plan.createdAt <= after).toBe(true);
    expect(plan.createdAt).toBe(plan.updatedAt);
  });
});

// ============================================================================
// updatePlanStatus Tests
// ============================================================================

describe('updatePlanStatus', () => {
  test('updates status for valid transition', () => {
    const plan = createTestPlan({ status: PlanStatus.DRAFT });
    const updated = updatePlanStatus(plan, { status: PlanStatus.ACTIVE });

    expect(updated.status).toBe(PlanStatus.ACTIVE);
    expect(updated.updatedAt).not.toBe(plan.updatedAt);
  });

  test('sets completedAt when completing', () => {
    const plan = createTestPlan({ status: PlanStatus.ACTIVE });
    const updated = updatePlanStatus(plan, { status: PlanStatus.COMPLETED });

    expect(updated.status).toBe(PlanStatus.COMPLETED);
    expect(updated.completedAt).toBeDefined();
  });

  test('clears completedAt when reopening', () => {
    const plan = createTestPlan({
      status: PlanStatus.COMPLETED,
      completedAt: '2025-01-15T12:00:00.000Z' as Timestamp,
    });
    const updated = updatePlanStatus(plan, { status: PlanStatus.ACTIVE });

    expect(updated.status).toBe(PlanStatus.ACTIVE);
    expect(updated.completedAt).toBeUndefined();
  });

  test('sets cancelledAt when cancelling', () => {
    const plan = createTestPlan({ status: PlanStatus.ACTIVE });
    const updated = updatePlanStatus(plan, {
      status: PlanStatus.CANCELLED,
      cancelReason: 'Project deprioritized',
    });

    expect(updated.status).toBe(PlanStatus.CANCELLED);
    expect(updated.cancelledAt).toBeDefined();
    expect(updated.cancelReason).toBe('Project deprioritized');
  });

  test('clears cancelledAt and cancelReason when restarting', () => {
    const plan = createTestPlan({
      status: PlanStatus.CANCELLED,
      cancelledAt: '2025-01-15T12:00:00.000Z' as Timestamp,
      cancelReason: 'Old reason',
    });
    const updated = updatePlanStatus(plan, { status: PlanStatus.DRAFT });

    expect(updated.status).toBe(PlanStatus.DRAFT);
    expect(updated.cancelledAt).toBeUndefined();
    expect(updated.cancelReason).toBeUndefined();
  });

  test('allows no-op transitions', () => {
    const plan = createTestPlan({ status: PlanStatus.DRAFT });
    const updated = updatePlanStatus(plan, { status: PlanStatus.DRAFT });

    expect(updated.status).toBe(PlanStatus.DRAFT);
  });

  test('throws for invalid transition', () => {
    const plan = createTestPlan({ status: PlanStatus.DRAFT });
    expect(() => updatePlanStatus(plan, { status: PlanStatus.COMPLETED })).toThrow(ValidationError);
  });

  test('preserves other plan fields', () => {
    const plan = createTestPlan({
      title: 'Original title',
      tags: ['important'],
      descriptionRef: 'el-doc1' as DocumentId,
    });
    const updated = updatePlanStatus(plan, { status: PlanStatus.ACTIVE });

    expect(updated.title).toBe('Original title');
    expect(updated.tags).toEqual(['important']);
    expect(updated.descriptionRef).toBe('el-doc1' as DocumentId);
    expect(updated.id).toBe(plan.id);
    expect(updated.createdAt).toBe(plan.createdAt);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isDraft', () => {
  test('returns true for draft plans', () => {
    expect(isDraft(createTestPlan({ status: PlanStatus.DRAFT }))).toBe(true);
  });

  test('returns false for non-draft plans', () => {
    expect(isDraft(createTestPlan({ status: PlanStatus.ACTIVE }))).toBe(false);
    expect(isDraft(createTestPlan({ status: PlanStatus.COMPLETED }))).toBe(false);
    expect(isDraft(createTestPlan({ status: PlanStatus.CANCELLED }))).toBe(false);
  });
});

describe('isActive', () => {
  test('returns true for active plans', () => {
    expect(isActive(createTestPlan({ status: PlanStatus.ACTIVE }))).toBe(true);
  });

  test('returns false for non-active plans', () => {
    expect(isActive(createTestPlan({ status: PlanStatus.DRAFT }))).toBe(false);
    expect(isActive(createTestPlan({ status: PlanStatus.COMPLETED }))).toBe(false);
    expect(isActive(createTestPlan({ status: PlanStatus.CANCELLED }))).toBe(false);
  });
});

describe('isCompleted', () => {
  test('returns true for completed plans', () => {
    expect(isCompleted(createTestPlan({ status: PlanStatus.COMPLETED }))).toBe(true);
  });

  test('returns false for non-completed plans', () => {
    expect(isCompleted(createTestPlan({ status: PlanStatus.DRAFT }))).toBe(false);
    expect(isCompleted(createTestPlan({ status: PlanStatus.ACTIVE }))).toBe(false);
    expect(isCompleted(createTestPlan({ status: PlanStatus.CANCELLED }))).toBe(false);
  });
});

describe('isCancelled', () => {
  test('returns true for cancelled plans', () => {
    expect(isCancelled(createTestPlan({ status: PlanStatus.CANCELLED }))).toBe(true);
  });

  test('returns false for non-cancelled plans', () => {
    expect(isCancelled(createTestPlan({ status: PlanStatus.DRAFT }))).toBe(false);
    expect(isCancelled(createTestPlan({ status: PlanStatus.ACTIVE }))).toBe(false);
    expect(isCancelled(createTestPlan({ status: PlanStatus.COMPLETED }))).toBe(false);
  });
});

// ============================================================================
// Display Name Tests
// ============================================================================

describe('getPlanStatusDisplayName', () => {
  test('returns display name for each status', () => {
    expect(getPlanStatusDisplayName(PlanStatus.DRAFT)).toBe('Draft');
    expect(getPlanStatusDisplayName(PlanStatus.ACTIVE)).toBe('Active');
    expect(getPlanStatusDisplayName(PlanStatus.COMPLETED)).toBe('Completed');
    expect(getPlanStatusDisplayName(PlanStatus.CANCELLED)).toBe('Cancelled');
  });
});

// ============================================================================
// Progress Calculation Tests
// ============================================================================

describe('calculatePlanProgress', () => {
  test('returns zeros for empty task set', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts());

    expect(progress.totalTasks).toBe(0);
    expect(progress.completedTasks).toBe(0);
    expect(progress.inProgressTasks).toBe(0);
    expect(progress.blockedTasks).toBe(0);
    expect(progress.remainingTasks).toBe(0);
    expect(progress.completionPercentage).toBe(0);
  });

  test('calculates progress correctly', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
      [TaskStatus.IN_PROGRESS]: 2,
      [TaskStatus.BLOCKED]: 1,
      [TaskStatus.OPEN]: 2,
      [TaskStatus.DEFERRED]: 0,
    }));

    expect(progress.totalTasks).toBe(10);
    expect(progress.completedTasks).toBe(5);
    expect(progress.inProgressTasks).toBe(2);
    expect(progress.blockedTasks).toBe(1);
    expect(progress.remainingTasks).toBe(2); // open + deferred
    expect(progress.completionPercentage).toBe(50);
  });

  test('excludes tombstone tasks from calculations', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
      [TaskStatus.TOMBSTONE]: 10, // Should be excluded
    }));

    expect(progress.totalTasks).toBe(5);
    expect(progress.completedTasks).toBe(5);
    expect(progress.completionPercentage).toBe(100);
  });

  test('calculates 100% when all tasks are closed', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 10,
    }));

    expect(progress.completionPercentage).toBe(100);
  });

  test('calculates 0% when no tasks are closed', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.OPEN]: 5,
      [TaskStatus.IN_PROGRESS]: 3,
    }));

    expect(progress.completionPercentage).toBe(0);
  });

  test('rounds completion percentage', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 1,
      [TaskStatus.OPEN]: 2,
    }));

    expect(progress.completionPercentage).toBe(33); // 1/3 rounded
  });

  test('includes deferred tasks in remaining count', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.OPEN]: 3,
      [TaskStatus.DEFERRED]: 2,
      [TaskStatus.CLOSED]: 5,
    }));

    expect(progress.remainingTasks).toBe(5); // 3 open + 2 deferred
  });
});

describe('canAutoComplete', () => {
  test('returns false for empty task set', () => {
    expect(canAutoComplete(createTaskStatusCounts())).toBe(false);
  });

  test('returns true when all tasks are closed', () => {
    expect(canAutoComplete(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
    }))).toBe(true);
  });

  test('returns true when all tasks are closed (with tombstones)', () => {
    expect(canAutoComplete(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
      [TaskStatus.TOMBSTONE]: 3, // Tombstones are excluded
    }))).toBe(true);
  });

  test('returns false when tasks are still open', () => {
    expect(canAutoComplete(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
      [TaskStatus.OPEN]: 1,
    }))).toBe(false);
  });

  test('returns false when tasks are in progress', () => {
    expect(canAutoComplete(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
      [TaskStatus.IN_PROGRESS]: 1,
    }))).toBe(false);
  });

  test('returns false when tasks are blocked', () => {
    expect(canAutoComplete(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
      [TaskStatus.BLOCKED]: 1,
    }))).toBe(false);
  });

  test('returns false when tasks are deferred', () => {
    expect(canAutoComplete(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 5,
      [TaskStatus.DEFERRED]: 1,
    }))).toBe(false);
  });
});

// ============================================================================
// Filter and Sort Tests
// ============================================================================

describe('filterByPlanStatus', () => {
  const plans: Plan[] = [
    createTestPlan({ id: 'el-1' as ElementId, status: PlanStatus.DRAFT }),
    createTestPlan({ id: 'el-2' as ElementId, status: PlanStatus.ACTIVE }),
    createTestPlan({ id: 'el-3' as ElementId, status: PlanStatus.DRAFT }),
    createTestPlan({ id: 'el-4' as ElementId, status: PlanStatus.COMPLETED }),
  ];

  test('filters plans by status', () => {
    const draftPlans = filterByPlanStatus(plans, PlanStatus.DRAFT);
    expect(draftPlans).toHaveLength(2);
    expect(draftPlans.map((p) => p.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });

  test('returns empty array when no matches', () => {
    expect(filterByPlanStatus(plans, PlanStatus.CANCELLED)).toEqual([]);
  });
});

describe('filterActivePlans', () => {
  const plans: Plan[] = [
    createTestPlan({ id: 'el-1' as ElementId, status: PlanStatus.DRAFT }),
    createTestPlan({ id: 'el-2' as ElementId, status: PlanStatus.ACTIVE }),
    createTestPlan({ id: 'el-3' as ElementId, status: PlanStatus.ACTIVE }),
    createTestPlan({ id: 'el-4' as ElementId, status: PlanStatus.COMPLETED }),
  ];

  test('filters active plans', () => {
    const active = filterActivePlans(plans);
    expect(active).toHaveLength(2);
    expect(active.map((p) => p.id)).toEqual(['el-2' as ElementId, 'el-3' as ElementId]);
  });
});

describe('filterDraftPlans', () => {
  const plans: Plan[] = [
    createTestPlan({ id: 'el-1' as ElementId, status: PlanStatus.DRAFT }),
    createTestPlan({ id: 'el-2' as ElementId, status: PlanStatus.ACTIVE }),
    createTestPlan({ id: 'el-3' as ElementId, status: PlanStatus.DRAFT }),
  ];

  test('filters draft plans', () => {
    const drafts = filterDraftPlans(plans);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((p) => p.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });
});

describe('sortByCreationDate', () => {
  const plans: Plan[] = [
    createTestPlan({
      id: 'el-1' as ElementId,
      createdAt: '2025-01-20T10:00:00.000Z' as Timestamp,
    }),
    createTestPlan({
      id: 'el-2' as ElementId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestPlan({
      id: 'el-3' as ElementId,
      createdAt: '2025-01-21T10:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts plans by creation date (newest first by default)', () => {
    const sorted = sortByCreationDate(plans);
    expect(sorted.map((p) => p.id)).toEqual([
      'el-2' as ElementId, // Jan 22
      'el-3' as ElementId, // Jan 21
      'el-1' as ElementId, // Jan 20
    ]);
  });

  test('sorts plans by creation date (oldest first)', () => {
    const sorted = sortByCreationDate(plans, true);
    expect(sorted.map((p) => p.id)).toEqual([
      'el-1' as ElementId, // Jan 20
      'el-3' as ElementId, // Jan 21
      'el-2' as ElementId, // Jan 22
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...plans];
    sortByCreationDate(plans);
    expect(plans).toEqual(original);
  });
});

// ============================================================================
// Edge Cases and Property-Based Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles maximum title length', async () => {
    const maxTitle = 'a'.repeat(MAX_PLAN_TITLE_LENGTH);
    const plan = await createPlan({
      title: maxTitle,
      createdBy: 'el-system1' as EntityId,
    });
    expect(plan.title).toBe(maxTitle);
  });

  test('handles unicode in title', async () => {
    const unicodeTitle = '项目计划 📋 プラン';
    const plan = await createPlan({
      title: unicodeTitle,
      createdBy: 'el-system1' as EntityId,
    });
    expect(plan.title).toBe(unicodeTitle);
  });

  test('validates optional text fields during validatePlan', () => {
    expect(() =>
      validatePlan({
        ...createTestPlan(),
        cancelReason: 'a'.repeat(MAX_CANCEL_REASON_LENGTH + 1),
      })
    ).toThrow(ValidationError);
  });
});

describe('Property-based tests', () => {
  test('all valid statuses create valid plans', () => {
    for (const status of Object.values(PlanStatus)) {
      const plan = createTestPlan({ status });
      expect(isPlan(plan)).toBe(true);
    }
  });

  test('status transition matrix is valid', () => {
    for (const fromStatus of Object.values(PlanStatus)) {
      for (const toStatus of PLAN_STATUS_TRANSITIONS[fromStatus]) {
        expect(isValidPlanStatusTransition(fromStatus, toStatus)).toBe(true);
      }
    }
  });

  test('status transition matrix is complete', () => {
    // Every status should have an entry in the transitions map
    for (const status of Object.values(PlanStatus)) {
      expect(PLAN_STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(PLAN_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });
});

describe('HydratedPlan interface', () => {
  test('HydratedPlan extends Plan with hydrated fields', () => {
    const hydratedPlan: HydratedPlan = {
      ...createTestPlan(),
      descriptionRef: 'el-doc1' as DocumentId,
      description: 'Full description content',
      progress: {
        totalTasks: 10,
        completedTasks: 5,
        inProgressTasks: 2,
        blockedTasks: 1,
        remainingTasks: 2,
        completionPercentage: 50,
      },
    };

    expect(hydratedPlan.description).toBe('Full description content');
    expect(hydratedPlan.progress?.completionPercentage).toBe(50);
    expect(isPlan(hydratedPlan)).toBe(true); // Base plan validation still works
  });
});

describe('Status lifecycle scenarios', () => {
  test('complete plan lifecycle: draft -> active -> completed', () => {
    let plan = createTestPlan({ status: PlanStatus.DRAFT });

    plan = updatePlanStatus(plan, { status: PlanStatus.ACTIVE });
    expect(plan.status).toBe(PlanStatus.ACTIVE);

    plan = updatePlanStatus(plan, { status: PlanStatus.COMPLETED });
    expect(plan.status).toBe(PlanStatus.COMPLETED);
    expect(plan.completedAt).toBeDefined();
  });

  test('reopen workflow: completed -> active', () => {
    let plan = createTestPlan({
      status: PlanStatus.COMPLETED,
      completedAt: '2025-01-15T12:00:00.000Z' as Timestamp,
    });

    plan = updatePlanStatus(plan, { status: PlanStatus.ACTIVE });
    expect(plan.status).toBe(PlanStatus.ACTIVE);
    expect(plan.completedAt).toBeUndefined();
  });

  test('cancellation workflow: active -> cancelled', () => {
    let plan = createTestPlan({ status: PlanStatus.ACTIVE });

    plan = updatePlanStatus(plan, {
      status: PlanStatus.CANCELLED,
      cancelReason: 'Project cancelled',
    });
    expect(plan.status).toBe(PlanStatus.CANCELLED);
    expect(plan.cancelledAt).toBeDefined();
    expect(plan.cancelReason).toBe('Project cancelled');
  });

  test('restart workflow: cancelled -> draft', () => {
    let plan = createTestPlan({
      status: PlanStatus.CANCELLED,
      cancelledAt: '2025-01-15T12:00:00.000Z' as Timestamp,
      cancelReason: 'Old reason',
    });

    plan = updatePlanStatus(plan, { status: PlanStatus.DRAFT });
    expect(plan.status).toBe(PlanStatus.DRAFT);
    expect(plan.cancelledAt).toBeUndefined();
    expect(plan.cancelReason).toBeUndefined();
  });

  test('cancel from draft: draft -> cancelled', () => {
    let plan = createTestPlan({ status: PlanStatus.DRAFT });

    plan = updatePlanStatus(plan, {
      status: PlanStatus.CANCELLED,
      cancelReason: 'Never started',
    });
    expect(plan.status).toBe(PlanStatus.CANCELLED);
    expect(plan.cancelReason).toBe('Never started');
  });
});

describe('Progress scenarios', () => {
  test('typical sprint progress', () => {
    // Sprint with 10 tasks: 3 closed, 2 in progress, 1 blocked, 4 open
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 3,
      [TaskStatus.IN_PROGRESS]: 2,
      [TaskStatus.BLOCKED]: 1,
      [TaskStatus.OPEN]: 4,
    }));

    expect(progress.totalTasks).toBe(10);
    expect(progress.completedTasks).toBe(3);
    expect(progress.inProgressTasks).toBe(2);
    expect(progress.blockedTasks).toBe(1);
    expect(progress.remainingTasks).toBe(4);
    expect(progress.completionPercentage).toBe(30);
  });

  test('nearly complete sprint', () => {
    const progress = calculatePlanProgress(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 9,
      [TaskStatus.IN_PROGRESS]: 1,
    }));

    expect(progress.completionPercentage).toBe(90);
    expect(canAutoComplete(createTaskStatusCounts({
      [TaskStatus.CLOSED]: 9,
      [TaskStatus.IN_PROGRESS]: 1,
    }))).toBe(false); // Still have one in progress
  });

  test('fully complete sprint', () => {
    const counts = createTaskStatusCounts({
      [TaskStatus.CLOSED]: 10,
    });
    const progress = calculatePlanProgress(counts);

    expect(progress.completionPercentage).toBe(100);
    expect(canAutoComplete(counts)).toBe(true);
  });
});
