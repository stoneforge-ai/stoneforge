import { describe, expect, test } from 'bun:test';
import {
  Workflow,
  HydratedWorkflow,
  WorkflowId,
  PlaybookId,
  WorkflowStatus,
  TERMINAL_STATUSES,
  WORKFLOW_STATUS_TRANSITIONS,
  MIN_WORKFLOW_TITLE_LENGTH,
  MAX_WORKFLOW_TITLE_LENGTH,
  MAX_FAILURE_REASON_LENGTH,
  MAX_WORKFLOW_CANCEL_REASON_LENGTH,
  isValidWorkflowId,
  validateWorkflowId,
  isValidPlaybookId,
  validatePlaybookId,
  isValidWorkflowStatus,
  validateWorkflowStatus,
  isValidWorkflowTitle,
  validateWorkflowTitle,
  validateWorkflowOptionalText,
  isValidWorkflowVariables,
  validateWorkflowVariables,
  isValidWorkflowStatusTransition,
  validateWorkflowStatusTransition,
  isWorkflow,
  validateWorkflow,
  createWorkflow,
  CreateWorkflowInput,
  updateWorkflowStatus,
  promoteWorkflow,
  isTerminal,
  isPending,
  isRunning,
  isWorkflowCompleted,
  isWorkflowFailed,
  isWorkflowCancelled,
  isEphemeral,
  isDurable,
  hasPlaybook,
  isAdHoc,
  getWorkflowStatusDisplayName,
  getWorkflowDuration,
  filterByWorkflowStatus,
  filterEphemeral,
  filterDurable,
  filterByPlaybook,
  filterAdHoc,
  filterTerminal,
  filterActive,
  sortByWorkflowStatus,
  sortWorkflowsByCreatedAtDesc,
  sortWorkflowsByCreatedAtAsc,
  sortByStartedAt,
  groupByWorkflowStatus,
  groupByPlaybook,
  isEligibleForGarbageCollection,
  filterEligibleForGarbageCollection,
  filterGarbageCollectionByAge,
} from './workflow.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { DocumentId } from './document.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid workflow for testing
function createTestWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'el-abc123' as WorkflowId,
    type: ElementType.WORKFLOW,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    title: 'Test workflow title',
    status: WorkflowStatus.PENDING,
    ephemeral: false,
    variables: {},
    ...overrides,
  };
}

// ============================================================================
// WorkflowStatus Tests
// ============================================================================

describe('WorkflowStatus', () => {
  test('contains all expected statuses', () => {
    expect(WorkflowStatus.PENDING).toBe('pending');
    expect(WorkflowStatus.RUNNING).toBe('running');
    expect(WorkflowStatus.COMPLETED).toBe('completed');
    expect(WorkflowStatus.FAILED).toBe('failed');
    expect(WorkflowStatus.CANCELLED).toBe('cancelled');
  });

  test('has exactly 5 statuses', () => {
    expect(Object.keys(WorkflowStatus)).toHaveLength(5);
  });
});

describe('TERMINAL_STATUSES', () => {
  test('contains completed, failed, cancelled', () => {
    expect(TERMINAL_STATUSES).toContain(WorkflowStatus.COMPLETED);
    expect(TERMINAL_STATUSES).toContain(WorkflowStatus.FAILED);
    expect(TERMINAL_STATUSES).toContain(WorkflowStatus.CANCELLED);
  });

  test('does not contain pending or running', () => {
    expect(TERMINAL_STATUSES).not.toContain(WorkflowStatus.PENDING);
    expect(TERMINAL_STATUSES).not.toContain(WorkflowStatus.RUNNING);
  });

  test('has exactly 3 terminal statuses', () => {
    expect(TERMINAL_STATUSES).toHaveLength(3);
  });
});

describe('WORKFLOW_STATUS_TRANSITIONS', () => {
  test('pending can transition to running, cancelled', () => {
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.PENDING]).toContain(WorkflowStatus.RUNNING);
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.PENDING]).toContain(WorkflowStatus.CANCELLED);
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.PENDING]).toHaveLength(2);
  });

  test('running can transition to completed, failed, cancelled', () => {
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.RUNNING]).toContain(WorkflowStatus.COMPLETED);
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.RUNNING]).toContain(WorkflowStatus.FAILED);
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.RUNNING]).toContain(WorkflowStatus.CANCELLED);
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.RUNNING]).toHaveLength(3);
  });

  test('completed is terminal (no transitions)', () => {
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.COMPLETED]).toHaveLength(0);
  });

  test('failed is terminal (no transitions)', () => {
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.FAILED]).toHaveLength(0);
  });

  test('cancelled is terminal (no transitions)', () => {
    expect(WORKFLOW_STATUS_TRANSITIONS[WorkflowStatus.CANCELLED]).toHaveLength(0);
  });
});

// ============================================================================
// ID Validation Tests
// ============================================================================

describe('isValidWorkflowId', () => {
  test('accepts valid workflow IDs', () => {
    expect(isValidWorkflowId('el-abc123')).toBe(true);
    expect(isValidWorkflowId('el-ABC123')).toBe(true);
    expect(isValidWorkflowId('el-a1b2c3d4')).toBe(true);
  });

  test('accepts hierarchical IDs', () => {
    expect(isValidWorkflowId('el-abc123.1')).toBe(true);
    expect(isValidWorkflowId('el-abc123.1.2')).toBe(true);
  });

  test('rejects invalid IDs', () => {
    expect(isValidWorkflowId('')).toBe(false);
    expect(isValidWorkflowId('abc123')).toBe(false); // Missing el- prefix
    expect(isValidWorkflowId('el-')).toBe(false); // Missing hash
    expect(isValidWorkflowId(null)).toBe(false);
    expect(isValidWorkflowId(undefined)).toBe(false);
    expect(isValidWorkflowId(123)).toBe(false);
  });
});

describe('validateWorkflowId', () => {
  test('returns valid ID', () => {
    expect(validateWorkflowId('el-abc123')).toBe('el-abc123' as WorkflowId);
  });

  test('throws ValidationError for invalid ID', () => {
    expect(() => validateWorkflowId('invalid')).toThrow(ValidationError);
    try {
      validateWorkflowId('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
      expect(err.details.field).toBe('workflowId');
    }
  });
});

describe('isValidPlaybookId', () => {
  test('accepts valid playbook IDs', () => {
    expect(isValidPlaybookId('el-playbook1')).toBe(true);
    expect(isValidPlaybookId('el-xyz789')).toBe(true);
  });

  test('rejects invalid IDs', () => {
    expect(isValidPlaybookId('invalid')).toBe(false);
    expect(isValidPlaybookId(null)).toBe(false);
  });
});

describe('validatePlaybookId', () => {
  test('returns valid ID', () => {
    expect(validatePlaybookId('el-playbook1')).toBe('el-playbook1' as PlaybookId);
  });

  test('throws ValidationError for invalid ID', () => {
    expect(() => validatePlaybookId('invalid')).toThrow(ValidationError);
  });
});

// ============================================================================
// Status Validation Tests
// ============================================================================

describe('isValidWorkflowStatus', () => {
  test('accepts all valid statuses', () => {
    expect(isValidWorkflowStatus('pending')).toBe(true);
    expect(isValidWorkflowStatus('running')).toBe(true);
    expect(isValidWorkflowStatus('completed')).toBe(true);
    expect(isValidWorkflowStatus('failed')).toBe(true);
    expect(isValidWorkflowStatus('cancelled')).toBe(true);
  });

  test('rejects invalid statuses', () => {
    expect(isValidWorkflowStatus('invalid')).toBe(false);
    expect(isValidWorkflowStatus('PENDING')).toBe(false); // case sensitive
    expect(isValidWorkflowStatus('draft')).toBe(false); // plan status, not workflow
    expect(isValidWorkflowStatus(null)).toBe(false);
    expect(isValidWorkflowStatus(undefined)).toBe(false);
    expect(isValidWorkflowStatus(123)).toBe(false);
  });
});

describe('validateWorkflowStatus', () => {
  test('returns valid status', () => {
    expect(validateWorkflowStatus('pending')).toBe('pending');
    expect(validateWorkflowStatus('running')).toBe('running');
    expect(validateWorkflowStatus('completed')).toBe('completed');
    expect(validateWorkflowStatus('failed')).toBe('failed');
    expect(validateWorkflowStatus('cancelled')).toBe('cancelled');
  });

  test('throws ValidationError for invalid status', () => {
    expect(() => validateWorkflowStatus('invalid')).toThrow(ValidationError);
    try {
      validateWorkflowStatus('invalid');
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

describe('isValidWorkflowTitle', () => {
  test('accepts valid titles', () => {
    expect(isValidWorkflowTitle('A')).toBe(true); // Min length
    expect(isValidWorkflowTitle('Valid workflow title')).toBe(true);
    expect(isValidWorkflowTitle('a'.repeat(MAX_WORKFLOW_TITLE_LENGTH))).toBe(true); // Max length
  });

  test('accepts title with leading/trailing spaces (trims them)', () => {
    expect(isValidWorkflowTitle('  trimmed  ')).toBe(true);
  });

  test('rejects invalid titles', () => {
    expect(isValidWorkflowTitle('')).toBe(false);
    expect(isValidWorkflowTitle('   ')).toBe(false); // Only whitespace
    expect(isValidWorkflowTitle('a'.repeat(MAX_WORKFLOW_TITLE_LENGTH + 1))).toBe(false); // Too long
    expect(isValidWorkflowTitle(null)).toBe(false);
    expect(isValidWorkflowTitle(undefined)).toBe(false);
    expect(isValidWorkflowTitle(123)).toBe(false);
  });
});

describe('validateWorkflowTitle', () => {
  test('returns trimmed valid title', () => {
    expect(validateWorkflowTitle('Valid title')).toBe('Valid title');
    expect(validateWorkflowTitle('  trimmed  ')).toBe('trimmed');
  });

  test('throws for non-string', () => {
    expect(() => validateWorkflowTitle(123)).toThrow(ValidationError);
    try {
      validateWorkflowTitle(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('title');
    }
  });

  test('throws for empty title', () => {
    expect(() => validateWorkflowTitle('')).toThrow(ValidationError);
    try {
      validateWorkflowTitle('');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });

  test('throws for title exceeding max length', () => {
    const longTitle = 'a'.repeat(MAX_WORKFLOW_TITLE_LENGTH + 1);
    expect(() => validateWorkflowTitle(longTitle)).toThrow(ValidationError);
    try {
      validateWorkflowTitle(longTitle);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.TITLE_TOO_LONG);
    }
  });
});

// ============================================================================
// Optional Text Validation Tests
// ============================================================================

describe('validateWorkflowOptionalText', () => {
  test('returns undefined for undefined/null', () => {
    expect(validateWorkflowOptionalText(undefined, 'field', 100)).toBeUndefined();
    expect(validateWorkflowOptionalText(null, 'field', 100)).toBeUndefined();
  });

  test('returns valid string', () => {
    expect(validateWorkflowOptionalText('valid', 'field', 100)).toBe('valid');
  });

  test('throws for non-string', () => {
    expect(() => validateWorkflowOptionalText(123, 'field', 100)).toThrow(ValidationError);
  });

  test('throws for string exceeding max length', () => {
    expect(() => validateWorkflowOptionalText('a'.repeat(101), 'field', 100)).toThrow(ValidationError);
  });
});

// ============================================================================
// Variables Validation Tests
// ============================================================================

describe('isValidWorkflowVariables', () => {
  test('accepts valid variable objects', () => {
    expect(isValidWorkflowVariables({})).toBe(true);
    expect(isValidWorkflowVariables({ key: 'value' })).toBe(true);
    expect(isValidWorkflowVariables({ num: 123, bool: true, nested: { a: 1 } })).toBe(true);
  });

  test('rejects invalid variable values', () => {
    expect(isValidWorkflowVariables(null)).toBe(false);
    expect(isValidWorkflowVariables(undefined)).toBe(false);
    expect(isValidWorkflowVariables([])).toBe(false);
    expect(isValidWorkflowVariables('string')).toBe(false);
    expect(isValidWorkflowVariables(123)).toBe(false);
  });

  test('rejects non-serializable objects', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(isValidWorkflowVariables(circular)).toBe(false);
  });
});

describe('validateWorkflowVariables', () => {
  test('returns valid variables', () => {
    const vars = { key: 'value' };
    expect(validateWorkflowVariables(vars)).toEqual(vars);
  });

  test('throws for non-object', () => {
    expect(() => validateWorkflowVariables(null)).toThrow(ValidationError);
    expect(() => validateWorkflowVariables([])).toThrow(ValidationError);
    expect(() => validateWorkflowVariables('string')).toThrow(ValidationError);
  });

  test('throws for non-serializable', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => validateWorkflowVariables(circular)).toThrow(ValidationError);
  });
});

// ============================================================================
// Status Transition Tests
// ============================================================================

describe('isValidWorkflowStatusTransition', () => {
  test('allows same status (no-op)', () => {
    expect(isValidWorkflowStatusTransition(WorkflowStatus.PENDING, WorkflowStatus.PENDING)).toBe(true);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.RUNNING, WorkflowStatus.RUNNING)).toBe(true);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.COMPLETED, WorkflowStatus.COMPLETED)).toBe(true);
  });

  test('allows valid transitions from pending', () => {
    expect(isValidWorkflowStatusTransition(WorkflowStatus.PENDING, WorkflowStatus.RUNNING)).toBe(true);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.PENDING, WorkflowStatus.CANCELLED)).toBe(true);
  });

  test('rejects invalid transitions from pending', () => {
    expect(isValidWorkflowStatusTransition(WorkflowStatus.PENDING, WorkflowStatus.COMPLETED)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.PENDING, WorkflowStatus.FAILED)).toBe(false);
  });

  test('allows valid transitions from running', () => {
    expect(isValidWorkflowStatusTransition(WorkflowStatus.RUNNING, WorkflowStatus.COMPLETED)).toBe(true);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.RUNNING, WorkflowStatus.FAILED)).toBe(true);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.RUNNING, WorkflowStatus.CANCELLED)).toBe(true);
  });

  test('rejects invalid transitions from running', () => {
    expect(isValidWorkflowStatusTransition(WorkflowStatus.RUNNING, WorkflowStatus.PENDING)).toBe(false);
  });

  test('rejects all transitions from terminal states', () => {
    // From completed
    expect(isValidWorkflowStatusTransition(WorkflowStatus.COMPLETED, WorkflowStatus.PENDING)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.COMPLETED, WorkflowStatus.RUNNING)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.COMPLETED, WorkflowStatus.FAILED)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.COMPLETED, WorkflowStatus.CANCELLED)).toBe(false);

    // From failed
    expect(isValidWorkflowStatusTransition(WorkflowStatus.FAILED, WorkflowStatus.PENDING)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.FAILED, WorkflowStatus.RUNNING)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.FAILED, WorkflowStatus.COMPLETED)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.FAILED, WorkflowStatus.CANCELLED)).toBe(false);

    // From cancelled
    expect(isValidWorkflowStatusTransition(WorkflowStatus.CANCELLED, WorkflowStatus.PENDING)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.CANCELLED, WorkflowStatus.RUNNING)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.CANCELLED, WorkflowStatus.COMPLETED)).toBe(false);
    expect(isValidWorkflowStatusTransition(WorkflowStatus.CANCELLED, WorkflowStatus.FAILED)).toBe(false);
  });
});

describe('validateWorkflowStatusTransition', () => {
  test('does not throw for valid transitions', () => {
    expect(() => validateWorkflowStatusTransition(WorkflowStatus.PENDING, WorkflowStatus.RUNNING)).not.toThrow();
    expect(() => validateWorkflowStatusTransition(WorkflowStatus.RUNNING, WorkflowStatus.COMPLETED)).not.toThrow();
  });

  test('throws ValidationError for invalid transitions', () => {
    expect(() => validateWorkflowStatusTransition(WorkflowStatus.PENDING, WorkflowStatus.COMPLETED)).toThrow(ValidationError);
    try {
      validateWorkflowStatusTransition(WorkflowStatus.COMPLETED, WorkflowStatus.RUNNING);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_STATUS);
      expect(err.details.from).toBe('completed');
      expect(err.details.to).toBe('running');
    }
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('isWorkflow', () => {
  test('accepts valid workflow objects', () => {
    const workflow = createTestWorkflow();
    expect(isWorkflow(workflow)).toBe(true);
  });

  test('accepts workflow with all optional fields', () => {
    const workflow = createTestWorkflow({
      descriptionRef: 'el-doc1' as DocumentId,
      playbookId: 'el-playbook1' as PlaybookId,
      startedAt: '2025-01-22T10:05:00.000Z' as Timestamp,
      finishedAt: '2025-01-22T10:30:00.000Z' as Timestamp,
      failureReason: 'Task failed',
      cancelReason: 'User cancelled',
    });
    expect(isWorkflow(workflow)).toBe(true);
  });

  test('accepts workflow with variables', () => {
    const workflow = createTestWorkflow({
      variables: { env: 'production', count: 5 },
    });
    expect(isWorkflow(workflow)).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isWorkflow(null)).toBe(false);
    expect(isWorkflow(undefined)).toBe(false);
    expect(isWorkflow('string')).toBe(false);
    expect(isWorkflow(123)).toBe(false);
    expect(isWorkflow([])).toBe(false);
  });

  test('rejects objects with wrong type', () => {
    const notWorkflow = createTestWorkflow({ type: 'task' as typeof ElementType.WORKFLOW });
    expect(isWorkflow(notWorkflow)).toBe(false);
  });

  test('rejects objects with missing required fields', () => {
    const missingId = { ...createTestWorkflow() };
    delete (missingId as Record<string, unknown>).id;
    expect(isWorkflow(missingId)).toBe(false);

    const missingTitle = { ...createTestWorkflow() };
    delete (missingTitle as Record<string, unknown>).title;
    expect(isWorkflow(missingTitle)).toBe(false);

    const missingStatus = { ...createTestWorkflow() };
    delete (missingStatus as Record<string, unknown>).status;
    expect(isWorkflow(missingStatus)).toBe(false);

    const missingEphemeral = { ...createTestWorkflow() };
    delete (missingEphemeral as Record<string, unknown>).ephemeral;
    expect(isWorkflow(missingEphemeral)).toBe(false);

    const missingVariables = { ...createTestWorkflow() };
    delete (missingVariables as Record<string, unknown>).variables;
    expect(isWorkflow(missingVariables)).toBe(false);
  });

  test('rejects objects with invalid field types', () => {
    const invalidTitle = createTestWorkflow({ title: 123 as unknown as string });
    expect(isWorkflow(invalidTitle)).toBe(false);

    const invalidStatus = createTestWorkflow({ status: 'invalid' as WorkflowStatus });
    expect(isWorkflow(invalidStatus)).toBe(false);

    const invalidEphemeral = createTestWorkflow({ ephemeral: 'true' as unknown as boolean });
    expect(isWorkflow(invalidEphemeral)).toBe(false);
  });
});

describe('validateWorkflow', () => {
  test('returns valid workflow', () => {
    const workflow = createTestWorkflow();
    expect(validateWorkflow(workflow)).toBe(workflow);
  });

  test('throws for non-object', () => {
    expect(() => validateWorkflow(null)).toThrow(ValidationError);
    expect(() => validateWorkflow('string')).toThrow(ValidationError);
  });

  test('throws for missing id', () => {
    const workflow = { ...createTestWorkflow() };
    delete (workflow as Record<string, unknown>).id;
    expect(() => validateWorkflow(workflow)).toThrow(ValidationError);
  });

  test('throws for wrong type', () => {
    const workflow = createTestWorkflow({ type: 'task' as typeof ElementType.WORKFLOW });
    expect(() => validateWorkflow(workflow)).toThrow(ValidationError);
  });

  test('throws for invalid ephemeral', () => {
    const workflow = createTestWorkflow({ ephemeral: 'true' as unknown as boolean });
    expect(() => validateWorkflow(workflow)).toThrow(ValidationError);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createWorkflow', () => {
  test('creates workflow with minimal input', async () => {
    const input: CreateWorkflowInput = {
      title: 'Test Workflow',
      createdBy: 'el-user1' as EntityId,
    };

    const workflow = await createWorkflow(input);

    expect(workflow.title).toBe('Test Workflow');
    expect(workflow.type).toBe(ElementType.WORKFLOW);
    expect(workflow.status).toBe(WorkflowStatus.PENDING);
    expect(workflow.ephemeral).toBe(false);
    expect(workflow.variables).toEqual({});
    expect(workflow.createdBy).toBe('el-user1' as EntityId);
    expect(workflow.tags).toEqual([]);
    expect(workflow.metadata).toEqual({});
    expect(workflow.id).toMatch(/^el-[a-z0-9]+$/);
  });

  test('creates workflow with all options', async () => {
    const input: CreateWorkflowInput = {
      title: 'Full Workflow',
      createdBy: 'el-user1' as EntityId,
      descriptionRef: 'el-doc1' as DocumentId,
      status: WorkflowStatus.RUNNING,
      playbookId: 'el-playbook1' as PlaybookId,
      ephemeral: true,
      variables: { env: 'staging', version: 2 },
      tags: ['urgent', 'deploy'],
      metadata: { source: 'api' },
    };

    const workflow = await createWorkflow(input);

    expect(workflow.title).toBe('Full Workflow');
    expect(workflow.status).toBe(WorkflowStatus.RUNNING);
    expect(workflow.ephemeral).toBe(true);
    expect(workflow.playbookId).toBe('el-playbook1' as PlaybookId);
    expect(workflow.descriptionRef).toBe('el-doc1' as DocumentId);
    expect(workflow.variables).toEqual({ env: 'staging', version: 2 });
    expect(workflow.tags).toEqual(['urgent', 'deploy']);
    expect(workflow.metadata).toEqual({ source: 'api' });
  });

  test('trims title', async () => {
    const input: CreateWorkflowInput = {
      title: '  Trimmed Title  ',
      createdBy: 'el-user1' as EntityId,
    };

    const workflow = await createWorkflow(input);
    expect(workflow.title).toBe('Trimmed Title');
  });

  test('throws for empty title', async () => {
    const input: CreateWorkflowInput = {
      title: '',
      createdBy: 'el-user1' as EntityId,
    };

    await expect(createWorkflow(input)).rejects.toThrow(ValidationError);
  });

  test('throws for invalid status', async () => {
    const input: CreateWorkflowInput = {
      title: 'Test',
      createdBy: 'el-user1' as EntityId,
      status: 'invalid' as WorkflowStatus,
    };

    await expect(createWorkflow(input)).rejects.toThrow(ValidationError);
  });

  test('throws for invalid variables', async () => {
    const input: CreateWorkflowInput = {
      title: 'Test',
      createdBy: 'el-user1' as EntityId,
      variables: 'not-an-object' as unknown as Record<string, unknown>,
    };

    await expect(createWorkflow(input)).rejects.toThrow(ValidationError);
  });

  test('sets timestamps correctly', async () => {
    const before = new Date().toISOString();
    const workflow = await createWorkflow({
      title: 'Test',
      createdBy: 'el-user1' as EntityId,
    });
    const after = new Date().toISOString();

    expect(workflow.createdAt >= before).toBe(true);
    expect(workflow.createdAt <= after).toBe(true);
    expect(workflow.updatedAt).toBe(workflow.createdAt);
  });
});

// ============================================================================
// Update Function Tests
// ============================================================================

describe('updateWorkflowStatus', () => {
  test('updates status from pending to running', () => {
    const workflow = createTestWorkflow({ status: WorkflowStatus.PENDING });
    const updated = updateWorkflowStatus(workflow, { status: WorkflowStatus.RUNNING });

    expect(updated.status).toBe(WorkflowStatus.RUNNING);
    expect(updated.startedAt).toBeDefined();
    expect(updated.updatedAt).not.toBe(workflow.updatedAt);
  });

  test('sets finishedAt when transitioning to terminal state', () => {
    const workflow = createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const completed = updateWorkflowStatus(workflow, { status: WorkflowStatus.COMPLETED });

    expect(completed.finishedAt).toBeDefined();
  });

  test('sets failureReason when transitioning to failed', () => {
    const workflow = createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const failed = updateWorkflowStatus(workflow, {
      status: WorkflowStatus.FAILED,
      failureReason: 'Task timed out',
    });

    expect(failed.status).toBe(WorkflowStatus.FAILED);
    expect(failed.failureReason).toBe('Task timed out');
    expect(failed.finishedAt).toBeDefined();
  });

  test('sets cancelReason when transitioning to cancelled', () => {
    const workflow = createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const cancelled = updateWorkflowStatus(workflow, {
      status: WorkflowStatus.CANCELLED,
      cancelReason: 'User requested cancellation',
    });

    expect(cancelled.status).toBe(WorkflowStatus.CANCELLED);
    expect(cancelled.cancelReason).toBe('User requested cancellation');
  });

  test('allows no-op status update', () => {
    const workflow = createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const updated = updateWorkflowStatus(workflow, { status: WorkflowStatus.RUNNING });

    expect(updated.status).toBe(WorkflowStatus.RUNNING);
  });

  test('throws for invalid transition', () => {
    const workflow = createTestWorkflow({ status: WorkflowStatus.PENDING });
    expect(() => updateWorkflowStatus(workflow, { status: WorkflowStatus.COMPLETED })).toThrow(ValidationError);
  });

  test('throws for invalid status', () => {
    const workflow = createTestWorkflow();
    expect(() => updateWorkflowStatus(workflow, { status: 'invalid' as WorkflowStatus })).toThrow(ValidationError);
  });

  test('validates failureReason length', () => {
    const workflow = createTestWorkflow({ status: WorkflowStatus.RUNNING });
    expect(() =>
      updateWorkflowStatus(workflow, {
        status: WorkflowStatus.FAILED,
        failureReason: 'a'.repeat(MAX_FAILURE_REASON_LENGTH + 1),
      })
    ).toThrow(ValidationError);
  });
});

describe('promoteWorkflow', () => {
  test('promotes ephemeral workflow to durable', () => {
    const workflow = createTestWorkflow({ ephemeral: true });
    const promoted = promoteWorkflow(workflow);

    expect(promoted.ephemeral).toBe(false);
    expect(promoted.updatedAt).not.toBe(workflow.updatedAt);
  });

  test('throws for already durable workflow', () => {
    const workflow = createTestWorkflow({ ephemeral: false });
    expect(() => promoteWorkflow(workflow)).toThrow(ValidationError);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Status check utilities', () => {
  test('isTerminal', () => {
    expect(isTerminal(createTestWorkflow({ status: WorkflowStatus.PENDING }))).toBe(false);
    expect(isTerminal(createTestWorkflow({ status: WorkflowStatus.RUNNING }))).toBe(false);
    expect(isTerminal(createTestWorkflow({ status: WorkflowStatus.COMPLETED }))).toBe(true);
    expect(isTerminal(createTestWorkflow({ status: WorkflowStatus.FAILED }))).toBe(true);
    expect(isTerminal(createTestWorkflow({ status: WorkflowStatus.CANCELLED }))).toBe(true);
  });

  test('isPending', () => {
    expect(isPending(createTestWorkflow({ status: WorkflowStatus.PENDING }))).toBe(true);
    expect(isPending(createTestWorkflow({ status: WorkflowStatus.RUNNING }))).toBe(false);
  });

  test('isRunning', () => {
    expect(isRunning(createTestWorkflow({ status: WorkflowStatus.RUNNING }))).toBe(true);
    expect(isRunning(createTestWorkflow({ status: WorkflowStatus.PENDING }))).toBe(false);
  });

  test('isWorkflowCompleted', () => {
    expect(isWorkflowCompleted(createTestWorkflow({ status: WorkflowStatus.COMPLETED }))).toBe(true);
    expect(isWorkflowCompleted(createTestWorkflow({ status: WorkflowStatus.RUNNING }))).toBe(false);
  });

  test('isWorkflowFailed', () => {
    expect(isWorkflowFailed(createTestWorkflow({ status: WorkflowStatus.FAILED }))).toBe(true);
    expect(isWorkflowFailed(createTestWorkflow({ status: WorkflowStatus.RUNNING }))).toBe(false);
  });

  test('isWorkflowCancelled', () => {
    expect(isWorkflowCancelled(createTestWorkflow({ status: WorkflowStatus.CANCELLED }))).toBe(true);
    expect(isWorkflowCancelled(createTestWorkflow({ status: WorkflowStatus.RUNNING }))).toBe(false);
  });
});

describe('Ephemeral/durable utilities', () => {
  test('isEphemeral', () => {
    expect(isEphemeral(createTestWorkflow({ ephemeral: true }))).toBe(true);
    expect(isEphemeral(createTestWorkflow({ ephemeral: false }))).toBe(false);
  });

  test('isDurable', () => {
    expect(isDurable(createTestWorkflow({ ephemeral: false }))).toBe(true);
    expect(isDurable(createTestWorkflow({ ephemeral: true }))).toBe(false);
  });
});

describe('Playbook utilities', () => {
  test('hasPlaybook', () => {
    expect(hasPlaybook(createTestWorkflow({ playbookId: 'el-playbook1' as PlaybookId }))).toBe(true);
    expect(hasPlaybook(createTestWorkflow())).toBe(false);
  });

  test('isAdHoc', () => {
    expect(isAdHoc(createTestWorkflow())).toBe(true);
    expect(isAdHoc(createTestWorkflow({ playbookId: 'el-playbook1' as PlaybookId }))).toBe(false);
  });
});

describe('getWorkflowStatusDisplayName', () => {
  test('returns correct display names', () => {
    expect(getWorkflowStatusDisplayName(WorkflowStatus.PENDING)).toBe('Pending');
    expect(getWorkflowStatusDisplayName(WorkflowStatus.RUNNING)).toBe('Running');
    expect(getWorkflowStatusDisplayName(WorkflowStatus.COMPLETED)).toBe('Completed');
    expect(getWorkflowStatusDisplayName(WorkflowStatus.FAILED)).toBe('Failed');
    expect(getWorkflowStatusDisplayName(WorkflowStatus.CANCELLED)).toBe('Cancelled');
  });
});

describe('getWorkflowDuration', () => {
  test('returns undefined for unstarted workflow', () => {
    const workflow = createTestWorkflow();
    expect(getWorkflowDuration(workflow)).toBeUndefined();
  });

  test('returns duration for finished workflow', () => {
    const workflow = createTestWorkflow({
      startedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      finishedAt: '2025-01-22T10:05:00.000Z' as Timestamp,
    });
    expect(getWorkflowDuration(workflow)).toBe(5 * 60 * 1000); // 5 minutes
  });

  test('returns duration from now for running workflow', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const workflow = createTestWorkflow({
      status: WorkflowStatus.RUNNING,
      startedAt: fiveMinutesAgo as Timestamp,
    });
    const duration = getWorkflowDuration(workflow);
    expect(duration).toBeDefined();
    expect(duration!).toBeGreaterThanOrEqual(5 * 60 * 1000 - 1000); // Allow 1s variance
    expect(duration!).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
  });
});

// ============================================================================
// Filter Function Tests
// ============================================================================

describe('filterByWorkflowStatus', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, status: WorkflowStatus.PENDING }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, status: WorkflowStatus.RUNNING }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, status: WorkflowStatus.COMPLETED }),
    createTestWorkflow({ id: 'el-4' as WorkflowId, status: WorkflowStatus.PENDING }),
  ];

  test('filters by status', () => {
    const pending = filterByWorkflowStatus(workflows, WorkflowStatus.PENDING);
    expect(pending).toHaveLength(2);
    expect(pending.every((w) => w.status === WorkflowStatus.PENDING)).toBe(true);

    const running = filterByWorkflowStatus(workflows, WorkflowStatus.RUNNING);
    expect(running).toHaveLength(1);
  });
});

describe('filterEphemeral', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, ephemeral: true }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, ephemeral: false }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, ephemeral: true }),
  ];

  test('filters ephemeral workflows', () => {
    const ephemeral = filterEphemeral(workflows);
    expect(ephemeral).toHaveLength(2);
    expect(ephemeral.every((w) => w.ephemeral)).toBe(true);
  });
});

describe('filterDurable', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, ephemeral: true }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, ephemeral: false }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, ephemeral: false }),
  ];

  test('filters durable workflows', () => {
    const durable = filterDurable(workflows);
    expect(durable).toHaveLength(2);
    expect(durable.every((w) => !w.ephemeral)).toBe(true);
  });
});

describe('filterByPlaybook', () => {
  const playbookId = 'el-playbook1' as PlaybookId;
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, playbookId }),
    createTestWorkflow({ id: 'el-2' as WorkflowId }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, playbookId }),
  ];

  test('filters by playbook', () => {
    const filtered = filterByPlaybook(workflows, playbookId);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((w) => w.playbookId === playbookId)).toBe(true);
  });
});

describe('filterAdHoc', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, playbookId: 'el-playbook1' as PlaybookId }),
    createTestWorkflow({ id: 'el-2' as WorkflowId }),
    createTestWorkflow({ id: 'el-3' as WorkflowId }),
  ];

  test('filters ad-hoc workflows', () => {
    const adHoc = filterAdHoc(workflows);
    expect(adHoc).toHaveLength(2);
    expect(adHoc.every((w) => w.playbookId === undefined)).toBe(true);
  });
});

describe('filterTerminal', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, status: WorkflowStatus.PENDING }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, status: WorkflowStatus.COMPLETED }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, status: WorkflowStatus.FAILED }),
    createTestWorkflow({ id: 'el-4' as WorkflowId, status: WorkflowStatus.RUNNING }),
  ];

  test('filters terminal workflows', () => {
    const terminal = filterTerminal(workflows);
    expect(terminal).toHaveLength(2);
    expect(terminal.every(isTerminal)).toBe(true);
  });
});

describe('filterActive', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, status: WorkflowStatus.PENDING }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, status: WorkflowStatus.COMPLETED }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, status: WorkflowStatus.RUNNING }),
  ];

  test('filters active workflows', () => {
    const active = filterActive(workflows);
    expect(active).toHaveLength(2);
    expect(active.every((w) => !isTerminal(w))).toBe(true);
  });
});

// ============================================================================
// Sort Function Tests
// ============================================================================

describe('sortByWorkflowStatus', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, status: WorkflowStatus.COMPLETED }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, status: WorkflowStatus.PENDING }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, status: WorkflowStatus.RUNNING }),
    createTestWorkflow({ id: 'el-4' as WorkflowId, status: WorkflowStatus.FAILED }),
    createTestWorkflow({ id: 'el-5' as WorkflowId, status: WorkflowStatus.CANCELLED }),
  ];

  test('sorts by status order', () => {
    const sorted = sortByWorkflowStatus(workflows);
    expect(sorted[0].status).toBe(WorkflowStatus.PENDING);
    expect(sorted[1].status).toBe(WorkflowStatus.RUNNING);
    expect(sorted[2].status).toBe(WorkflowStatus.COMPLETED);
    expect(sorted[3].status).toBe(WorkflowStatus.FAILED);
    expect(sorted[4].status).toBe(WorkflowStatus.CANCELLED);
  });

  test('does not mutate original array', () => {
    const original = [...workflows];
    sortByWorkflowStatus(workflows);
    expect(workflows).toEqual(original);
  });
});

describe('sortWorkflowsByCreatedAtDesc', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, createdAt: '2025-01-20T10:00:00.000Z' as Timestamp }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, createdAt: '2025-01-22T10:00:00.000Z' as Timestamp }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, createdAt: '2025-01-21T10:00:00.000Z' as Timestamp }),
  ];

  test('sorts by creation date (newest first)', () => {
    const sorted = sortWorkflowsByCreatedAtDesc(workflows);
    expect(sorted[0].id).toBe('el-2' as WorkflowId);
    expect(sorted[1].id).toBe('el-3' as WorkflowId);
    expect(sorted[2].id).toBe('el-1' as WorkflowId);
  });
});

describe('sortWorkflowsByCreatedAtAsc', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, createdAt: '2025-01-20T10:00:00.000Z' as Timestamp }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, createdAt: '2025-01-22T10:00:00.000Z' as Timestamp }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, createdAt: '2025-01-21T10:00:00.000Z' as Timestamp }),
  ];

  test('sorts by creation date (oldest first)', () => {
    const sorted = sortWorkflowsByCreatedAtAsc(workflows);
    expect(sorted[0].id).toBe('el-1' as WorkflowId);
    expect(sorted[1].id).toBe('el-3' as WorkflowId);
    expect(sorted[2].id).toBe('el-2' as WorkflowId);
  });
});

describe('sortByStartedAt', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, startedAt: '2025-01-22T10:05:00.000Z' as Timestamp }),
    createTestWorkflow({ id: 'el-2' as WorkflowId }), // Not started
    createTestWorkflow({ id: 'el-3' as WorkflowId, startedAt: '2025-01-22T10:00:00.000Z' as Timestamp }),
  ];

  test('sorts by start time (earliest first, unstarted last)', () => {
    const sorted = sortByStartedAt(workflows);
    expect(sorted[0].id).toBe('el-3' as WorkflowId);
    expect(sorted[1].id).toBe('el-1' as WorkflowId);
    expect(sorted[2].id).toBe('el-2' as WorkflowId); // Unstarted last
  });
});

// ============================================================================
// Group Function Tests
// ============================================================================

describe('groupByWorkflowStatus', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, status: WorkflowStatus.PENDING }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, status: WorkflowStatus.RUNNING }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, status: WorkflowStatus.PENDING }),
    createTestWorkflow({ id: 'el-4' as WorkflowId, status: WorkflowStatus.COMPLETED }),
  ];

  test('groups workflows by status', () => {
    const groups = groupByWorkflowStatus(workflows);
    expect(groups[WorkflowStatus.PENDING]).toHaveLength(2);
    expect(groups[WorkflowStatus.RUNNING]).toHaveLength(1);
    expect(groups[WorkflowStatus.COMPLETED]).toHaveLength(1);
    expect(groups[WorkflowStatus.FAILED]).toHaveLength(0);
    expect(groups[WorkflowStatus.CANCELLED]).toHaveLength(0);
  });
});

describe('groupByPlaybook', () => {
  const playbook1 = 'el-playbook1' as PlaybookId;
  const playbook2 = 'el-playbook2' as PlaybookId;
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, playbookId: playbook1 }),
    createTestWorkflow({ id: 'el-2' as WorkflowId }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, playbookId: playbook1 }),
    createTestWorkflow({ id: 'el-4' as WorkflowId, playbookId: playbook2 }),
  ];

  test('groups workflows by playbook', () => {
    const groups = groupByPlaybook(workflows);
    expect(groups.get(playbook1)).toHaveLength(2);
    expect(groups.get(playbook2)).toHaveLength(1);
    expect(groups.get(undefined)).toHaveLength(1);
  });
});

// ============================================================================
// Garbage Collection Tests
// ============================================================================

describe('isEligibleForGarbageCollection', () => {
  test('returns true for ephemeral terminal workflow', () => {
    const workflow = createTestWorkflow({
      ephemeral: true,
      status: WorkflowStatus.COMPLETED,
    });
    expect(isEligibleForGarbageCollection(workflow)).toBe(true);
  });

  test('returns false for durable workflow', () => {
    const workflow = createTestWorkflow({
      ephemeral: false,
      status: WorkflowStatus.COMPLETED,
    });
    expect(isEligibleForGarbageCollection(workflow)).toBe(false);
  });

  test('returns false for non-terminal ephemeral workflow', () => {
    const workflow = createTestWorkflow({
      ephemeral: true,
      status: WorkflowStatus.RUNNING,
    });
    expect(isEligibleForGarbageCollection(workflow)).toBe(false);
  });
});

describe('filterEligibleForGarbageCollection', () => {
  const workflows = [
    createTestWorkflow({ id: 'el-1' as WorkflowId, ephemeral: true, status: WorkflowStatus.COMPLETED }),
    createTestWorkflow({ id: 'el-2' as WorkflowId, ephemeral: false, status: WorkflowStatus.COMPLETED }),
    createTestWorkflow({ id: 'el-3' as WorkflowId, ephemeral: true, status: WorkflowStatus.RUNNING }),
    createTestWorkflow({ id: 'el-4' as WorkflowId, ephemeral: true, status: WorkflowStatus.FAILED }),
  ];

  test('filters workflows eligible for GC', () => {
    const eligible = filterEligibleForGarbageCollection(workflows);
    expect(eligible).toHaveLength(2);
    expect(eligible.map((w) => w.id)).toEqual(['el-1' as WorkflowId, 'el-4' as WorkflowId]);
  });
});

describe('filterGarbageCollectionByAge', () => {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  const workflows = [
    createTestWorkflow({
      id: 'el-1' as WorkflowId,
      ephemeral: true,
      status: WorkflowStatus.COMPLETED,
      finishedAt: oneHourAgo as Timestamp,
    }),
    createTestWorkflow({
      id: 'el-2' as WorkflowId,
      ephemeral: true,
      status: WorkflowStatus.FAILED,
      finishedAt: twoHoursAgo as Timestamp,
    }),
    createTestWorkflow({
      id: 'el-3' as WorkflowId,
      ephemeral: true,
      status: WorkflowStatus.COMPLETED,
      finishedAt: new Date(now - 30 * 60 * 1000).toISOString() as Timestamp, // 30 min ago
    }),
  ];

  test('filters by age (1.5 hours threshold)', () => {
    const maxAge = 1.5 * 60 * 60 * 1000; // 1.5 hours
    const filtered = filterGarbageCollectionByAge(workflows, maxAge);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('el-2' as WorkflowId);
  });

  test('filters by age (45 minutes threshold)', () => {
    const maxAge = 45 * 60 * 1000; // 45 minutes
    const filtered = filterGarbageCollectionByAge(workflows, maxAge);
    expect(filtered).toHaveLength(2); // 1hr and 2hr old workflows pass
  });
});

// ============================================================================
// Validation Constants Tests
// ============================================================================

describe('Validation Constants', () => {
  test('MIN_WORKFLOW_TITLE_LENGTH is 1', () => {
    expect(MIN_WORKFLOW_TITLE_LENGTH).toBe(1);
  });

  test('MAX_WORKFLOW_TITLE_LENGTH is 500', () => {
    expect(MAX_WORKFLOW_TITLE_LENGTH).toBe(500);
  });

  test('MAX_FAILURE_REASON_LENGTH is 1000', () => {
    expect(MAX_FAILURE_REASON_LENGTH).toBe(1000);
  });

  test('MAX_WORKFLOW_CANCEL_REASON_LENGTH is 1000', () => {
    expect(MAX_WORKFLOW_CANCEL_REASON_LENGTH).toBe(1000);
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  test('workflow with empty tags and metadata', async () => {
    const workflow = await createWorkflow({
      title: 'Test',
      createdBy: 'el-user1' as EntityId,
      tags: [],
      metadata: {},
    });
    expect(workflow.tags).toEqual([]);
    expect(workflow.metadata).toEqual({});
  });

  test('workflow with complex variables', async () => {
    const variables = {
      string: 'value',
      number: 123,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      nested: { a: { b: { c: 1 } } },
    };

    const workflow = await createWorkflow({
      title: 'Test',
      createdBy: 'el-user1' as EntityId,
      variables,
    });

    expect(workflow.variables).toEqual(variables);
  });

  test('workflow status update preserves other fields', () => {
    const workflow = createTestWorkflow({
      playbookId: 'el-playbook1' as PlaybookId,
      ephemeral: true,
      variables: { key: 'value' },
      tags: ['tag1'],
      metadata: { meta: 'data' },
    });

    const updated = updateWorkflowStatus(workflow, { status: WorkflowStatus.RUNNING });

    expect(updated.playbookId).toBe('el-playbook1' as PlaybookId);
    expect(updated.ephemeral).toBe(true);
    expect(updated.variables).toEqual({ key: 'value' });
    expect(updated.tags).toEqual(['tag1']);
    expect(updated.metadata).toEqual({ meta: 'data' });
  });

  test('filter functions return empty array for empty input', () => {
    expect(filterByWorkflowStatus([], WorkflowStatus.PENDING)).toEqual([]);
    expect(filterEphemeral([])).toEqual([]);
    expect(filterDurable([])).toEqual([]);
    expect(filterTerminal([])).toEqual([]);
  });

  test('sort functions return empty array for empty input', () => {
    expect(sortByWorkflowStatus([])).toEqual([]);
    expect(sortWorkflowsByCreatedAtDesc([])).toEqual([]);
    expect(sortByStartedAt([])).toEqual([]);
  });

  test('group functions return correct structure for empty input', () => {
    const statusGroups = groupByWorkflowStatus([]);
    expect(statusGroups[WorkflowStatus.PENDING]).toEqual([]);
    expect(statusGroups[WorkflowStatus.RUNNING]).toEqual([]);

    const playbookGroups = groupByPlaybook([]);
    expect(playbookGroups.size).toBe(0);
  });
});
