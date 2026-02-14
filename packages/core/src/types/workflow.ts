/**
 * Workflow Type - Executable task sequences
 *
 * Workflows are executable instances of ordered tasks, representing a sequence
 * of work to be performed. They can be instantiated from Playbooks (templates)
 * or created ad-hoc. Workflows support both durable (persistent) and ephemeral
 * (temporary) modes.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import {
  Element,
  ElementId,
  EntityId,
  ElementType,
  Timestamp,
  createTimestamp,
  validateTags,
  validateMetadata,
} from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';
import { DocumentId } from './document.js';
import { type PlaybookId, isValidPlaybookId, validatePlaybookId } from './playbook.js';

// Re-export PlaybookId (type) and validators from playbook.js for backwards compatibility
export type { PlaybookId };
export { isValidPlaybookId, validatePlaybookId };

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Branded type for Workflow IDs
 */
declare const WorkflowIdBrand: unique symbol;
export type WorkflowId = ElementId & { readonly [WorkflowIdBrand]: typeof WorkflowIdBrand };

// ============================================================================
// Workflow Status
// ============================================================================

/**
 * All valid workflow status values
 */
export const WorkflowStatus = {
  /** Created but not started */
  PENDING: 'pending',
  /** Active execution */
  RUNNING: 'running',
  /** All tasks finished successfully */
  COMPLETED: 'completed',
  /** Execution failed */
  FAILED: 'failed',
  /** Manually cancelled */
  CANCELLED: 'cancelled',
} as const;

export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

/**
 * Terminal states (no further transitions allowed)
 */
export const TERMINAL_STATUSES: WorkflowStatus[] = [
  WorkflowStatus.COMPLETED,
  WorkflowStatus.FAILED,
  WorkflowStatus.CANCELLED,
];

/**
 * Valid status transitions
 * Key: current status, Value: array of valid target statuses
 */
export const WORKFLOW_STATUS_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  [WorkflowStatus.PENDING]: [WorkflowStatus.RUNNING, WorkflowStatus.CANCELLED],
  [WorkflowStatus.RUNNING]: [
    WorkflowStatus.COMPLETED,
    WorkflowStatus.FAILED,
    WorkflowStatus.CANCELLED,
  ],
  [WorkflowStatus.COMPLETED]: [], // Terminal
  [WorkflowStatus.FAILED]: [], // Terminal
  [WorkflowStatus.CANCELLED]: [], // Terminal
};

// ============================================================================
// Validation Constants
// ============================================================================

/** Minimum title length */
export const MIN_WORKFLOW_TITLE_LENGTH = 1;

/** Maximum title length */
export const MAX_WORKFLOW_TITLE_LENGTH = 500;

/** Maximum failure reason length */
export const MAX_FAILURE_REASON_LENGTH = 1000;

/** Maximum cancel reason length */
export const MAX_WORKFLOW_CANCEL_REASON_LENGTH = 1000;

// ============================================================================
// Workflow Interface
// ============================================================================

/**
 * Workflow interface - extends Element with execution sequence properties
 */
export interface Workflow extends Element {
  /** Workflow type is always 'workflow' */
  readonly type: typeof ElementType.WORKFLOW;

  // Content
  /** Workflow title, 1-500 characters */
  title: string;
  /** Reference to description Document */
  descriptionRef?: DocumentId;

  // Workflow State
  /** Current execution state */
  status: WorkflowStatus;

  // Source
  /** Playbook this was instantiated from (null for ad-hoc) */
  playbookId?: PlaybookId;

  // Execution Mode
  /** If true, not synced to JSONL (ephemeral storage only) */
  ephemeral: boolean;

  // Variables
  /** Resolved variable values from playbook instantiation */
  variables: Record<string, unknown>;

  // Completion tracking
  /** When workflow started running */
  startedAt?: Timestamp;
  /** When workflow completed, failed, or was cancelled */
  finishedAt?: Timestamp;
  /** Explanation when failed */
  failureReason?: string;
  /** Explanation when cancelled */
  cancelReason?: string;
}

/**
 * Workflow with hydrated document references
 */
export interface HydratedWorkflow extends Workflow {
  /** Hydrated description Document content */
  description?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a workflow ID
 */
export function isValidWorkflowId(value: unknown): value is WorkflowId {
  if (typeof value !== 'string') return false;
  // Basic ID format check - el- prefix followed by alphanumeric with optional hierarchy
  return /^el-[a-z0-9]+(\.[0-9]+)*$/i.test(value);
}

/**
 * Validates workflow ID and throws if invalid
 */
export function validateWorkflowId(value: unknown): WorkflowId {
  if (!isValidWorkflowId(value)) {
    throw new ValidationError(
      `Invalid workflow ID: ${value}`,
      ErrorCode.INVALID_ID,
      { field: 'workflowId', value, expected: 'el-{hash} format' }
    );
  }
  return value;
}

/**
 * Validates a workflow status value
 */
export function isValidWorkflowStatus(value: unknown): value is WorkflowStatus {
  return (
    typeof value === 'string' && Object.values(WorkflowStatus).includes(value as WorkflowStatus)
  );
}

/**
 * Validates workflow status and throws if invalid
 */
export function validateWorkflowStatus(value: unknown): WorkflowStatus {
  if (!isValidWorkflowStatus(value)) {
    throw new ValidationError(
      `Invalid workflow status: ${value}. Must be one of: ${Object.values(WorkflowStatus).join(', ')}`,
      ErrorCode.INVALID_STATUS,
      { field: 'status', value, expected: Object.values(WorkflowStatus) }
    );
  }
  return value;
}

/**
 * Validates a workflow title
 */
export function isValidWorkflowTitle(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return (
    trimmed.length >= MIN_WORKFLOW_TITLE_LENGTH && trimmed.length <= MAX_WORKFLOW_TITLE_LENGTH
  );
}

/**
 * Validates workflow title and throws if invalid
 */
export function validateWorkflowTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Workflow title must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'title', value, expected: 'string' }
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(
      'Workflow title cannot be empty',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'title', value }
    );
  }

  if (trimmed.length > MAX_WORKFLOW_TITLE_LENGTH) {
    throw new ValidationError(
      `Workflow title exceeds maximum length of ${MAX_WORKFLOW_TITLE_LENGTH} characters`,
      ErrorCode.TITLE_TOO_LONG,
      { field: 'title', expected: `<= ${MAX_WORKFLOW_TITLE_LENGTH} characters`, actual: trimmed.length }
    );
  }

  return trimmed;
}

/**
 * Validates optional text fields with max length
 */
export function validateWorkflowOptionalText(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(
      `${field} must be a string`,
      ErrorCode.INVALID_INPUT,
      { field, value, expected: 'string' }
    );
  }

  if (value.length > maxLength) {
    throw new ValidationError(
      `${field} exceeds maximum length of ${maxLength} characters`,
      ErrorCode.INVALID_INPUT,
      { field, expected: `<= ${maxLength} characters`, actual: value.length }
    );
  }

  return value;
}

/**
 * Validates workflow variables object (key-value pairs)
 */
export function isValidWorkflowVariables(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  // Check serialization
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates workflow variables and throws if invalid
 */
export function validateWorkflowVariables(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(
      'Variables must be a plain object',
      ErrorCode.INVALID_INPUT,
      { field: 'variables', value, expected: 'object' }
    );
  }

  try {
    JSON.stringify(value);
  } catch {
    throw new ValidationError(
      'Variables must be JSON-serializable',
      ErrorCode.INVALID_INPUT,
      { field: 'variables', value }
    );
  }

  return value as Record<string, unknown>;
}

/**
 * Validates a status transition is allowed
 */
export function isValidWorkflowStatusTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  if (from === to) {
    return true; // No-op is always valid
  }
  return WORKFLOW_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Validates status transition and throws if invalid
 */
export function validateWorkflowStatusTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (!isValidWorkflowStatusTransition(from, to)) {
    throw new ValidationError(
      `Invalid status transition from '${from}' to '${to}'`,
      ErrorCode.INVALID_STATUS,
      {
        field: 'status',
        from,
        to,
        allowedTransitions: WORKFLOW_STATUS_TRANSITIONS[from],
      }
    );
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Workflow
 */
export function isWorkflow(value: unknown): value is Workflow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.WORKFLOW) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check required workflow-specific properties
  if (!isValidWorkflowTitle(obj.title)) return false;
  if (!isValidWorkflowStatus(obj.status)) return false;
  if (typeof obj.ephemeral !== 'boolean') return false;
  if (!isValidWorkflowVariables(obj.variables)) return false;

  // Check optional properties have correct types when present
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string') return false;
  if (obj.playbookId !== undefined && typeof obj.playbookId !== 'string') return false;
  if (obj.startedAt !== undefined && typeof obj.startedAt !== 'string') return false;
  if (obj.finishedAt !== undefined && typeof obj.finishedAt !== 'string') return false;
  if (obj.failureReason !== undefined && typeof obj.failureReason !== 'string') return false;
  if (obj.cancelReason !== undefined && typeof obj.cancelReason !== 'string') return false;

  return true;
}

/**
 * Comprehensive validation of a workflow with detailed errors
 */
export function validateWorkflow(value: unknown): Workflow {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Workflow must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Workflow id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.WORKFLOW) {
    throw new ValidationError(
      `Workflow type must be '${ElementType.WORKFLOW}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.WORKFLOW }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError('Workflow createdAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'createdAt',
      value: obj.createdAt,
    });
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError('Workflow updatedAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'updatedAt',
      value: obj.updatedAt,
    });
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Workflow createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError('Workflow tags must be an array', ErrorCode.INVALID_INPUT, {
      field: 'tags',
      value: obj.tags,
      expected: 'array',
    });
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError('Workflow metadata must be an object', ErrorCode.INVALID_INPUT, {
      field: 'metadata',
      value: obj.metadata,
      expected: 'object',
    });
  }

  // Validate workflow-specific required fields
  validateWorkflowTitle(obj.title);
  validateWorkflowStatus(obj.status);

  if (typeof obj.ephemeral !== 'boolean') {
    throw new ValidationError(
      'Workflow ephemeral must be a boolean',
      ErrorCode.INVALID_INPUT,
      { field: 'ephemeral', value: obj.ephemeral, expected: 'boolean' }
    );
  }

  validateWorkflowVariables(obj.variables);

  // Validate optional text fields
  validateWorkflowOptionalText(obj.failureReason, 'failureReason', MAX_FAILURE_REASON_LENGTH);
  validateWorkflowOptionalText(obj.cancelReason, 'cancelReason', MAX_WORKFLOW_CANCEL_REASON_LENGTH);

  return value as Workflow;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new workflow
 */
export interface CreateWorkflowInput {
  /** Workflow title, 1-500 characters */
  title: string;
  /** Reference to the entity that created this workflow */
  createdBy: EntityId;
  /** Optional: Reference to description Document */
  descriptionRef?: DocumentId;
  /** Optional: Initial status (default: pending) */
  status?: WorkflowStatus;
  /** Optional: Playbook this was instantiated from */
  playbookId?: PlaybookId;
  /** Optional: Whether this is an ephemeral workflow (default: false) */
  ephemeral?: boolean;
  /** Optional: Resolved variable values (default: {}) */
  variables?: Record<string, unknown>;
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Workflow with validated inputs
 *
 * @param input - Workflow creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Workflow
 */
export async function createWorkflow(
  input: CreateWorkflowInput,
  config?: IdGeneratorConfig
): Promise<Workflow> {
  // Validate required fields
  const title = validateWorkflowTitle(input.title);

  // Validate optional fields with defaults
  const status = input.status !== undefined
    ? validateWorkflowStatus(input.status)
    : WorkflowStatus.PENDING;
  const ephemeral = input.ephemeral ?? false;
  const variables = input.variables !== undefined
    ? validateWorkflowVariables(input.variables)
    : {};

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Generate ID using title
  const id = await generateId({ identifier: title, createdBy: input.createdBy }, config);

  const workflow: Workflow = {
    id: id as WorkflowId,
    type: ElementType.WORKFLOW,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags,
    metadata,
    title,
    status,
    ephemeral,
    variables,
    ...(input.descriptionRef !== undefined && { descriptionRef: input.descriptionRef }),
    ...(input.playbookId !== undefined && { playbookId: input.playbookId }),
  };

  return workflow;
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Input for updating a workflow's status
 */
export interface UpdateWorkflowStatusInput {
  /** New status */
  status: WorkflowStatus;
  /** Optional: Failure reason (for failed status) */
  failureReason?: string;
  /** Optional: Cancel reason (for cancelled status) */
  cancelReason?: string;
}

/**
 * Updates a workflow's status with transition validation
 *
 * @param workflow - The current workflow
 * @param input - Update input
 * @returns The updated workflow
 */
export function updateWorkflowStatus(workflow: Workflow, input: UpdateWorkflowStatusInput): Workflow {
  const newStatus = validateWorkflowStatus(input.status);
  validateWorkflowStatusTransition(workflow.status, newStatus);

  const now = createTimestamp();
  const updates: Partial<Workflow> = {
    status: newStatus,
    updatedAt: now,
  };

  // Set startedAt when transitioning to running
  if (newStatus === WorkflowStatus.RUNNING && workflow.status === WorkflowStatus.PENDING) {
    updates.startedAt = now;
  }

  // Set finishedAt when transitioning to a terminal state
  if (TERMINAL_STATUSES.includes(newStatus) && !TERMINAL_STATUSES.includes(workflow.status)) {
    updates.finishedAt = now;

    if (newStatus === WorkflowStatus.FAILED && input.failureReason) {
      updates.failureReason = validateWorkflowOptionalText(
        input.failureReason,
        'failureReason',
        MAX_FAILURE_REASON_LENGTH
      );
    }

    if (newStatus === WorkflowStatus.CANCELLED && input.cancelReason) {
      updates.cancelReason = validateWorkflowOptionalText(
        input.cancelReason,
        'cancelReason',
        MAX_WORKFLOW_CANCEL_REASON_LENGTH
      );
    }
  }

  return { ...workflow, ...updates };
}

/**
 * Promotes an ephemeral workflow to durable (begin syncing)
 *
 * @param workflow - The ephemeral workflow to promote
 * @returns The promoted workflow (now durable)
 */
export function promoteWorkflow(workflow: Workflow): Workflow {
  if (!workflow.ephemeral) {
    throw new ValidationError(
      'Workflow is already durable',
      ErrorCode.INVALID_STATUS,
      { field: 'ephemeral', value: workflow.ephemeral }
    );
  }

  return {
    ...workflow,
    ephemeral: false,
    updatedAt: createTimestamp(),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a workflow is in a terminal state
 */
export function isTerminal(workflow: Workflow): boolean {
  return TERMINAL_STATUSES.includes(workflow.status);
}

/**
 * Checks if a workflow is pending
 */
export function isPending(workflow: Workflow): boolean {
  return workflow.status === WorkflowStatus.PENDING;
}

/**
 * Checks if a workflow is running
 */
export function isRunning(workflow: Workflow): boolean {
  return workflow.status === WorkflowStatus.RUNNING;
}

/**
 * Checks if a workflow is completed
 */
export function isWorkflowCompleted(workflow: Workflow): boolean {
  return workflow.status === WorkflowStatus.COMPLETED;
}

/**
 * Checks if a workflow has failed
 */
export function isWorkflowFailed(workflow: Workflow): boolean {
  return workflow.status === WorkflowStatus.FAILED;
}

/**
 * Checks if a workflow was cancelled
 */
export function isWorkflowCancelled(workflow: Workflow): boolean {
  return workflow.status === WorkflowStatus.CANCELLED;
}

/**
 * Checks if a workflow is ephemeral
 */
export function isEphemeral(workflow: Workflow): boolean {
  return workflow.ephemeral;
}

/**
 * Checks if a workflow is durable (not ephemeral)
 */
export function isDurable(workflow: Workflow): boolean {
  return !workflow.ephemeral;
}

/**
 * Checks if a workflow was created from a playbook
 */
export function hasPlaybook(workflow: Workflow): boolean {
  return workflow.playbookId !== undefined;
}

/**
 * Checks if a workflow is ad-hoc (not from a playbook)
 */
export function isAdHoc(workflow: Workflow): boolean {
  return workflow.playbookId === undefined;
}

/**
 * Gets a display string for workflow status
 */
export function getWorkflowStatusDisplayName(status: WorkflowStatus): string {
  switch (status) {
    case WorkflowStatus.PENDING:
      return 'Pending';
    case WorkflowStatus.RUNNING:
      return 'Running';
    case WorkflowStatus.COMPLETED:
      return 'Completed';
    case WorkflowStatus.FAILED:
      return 'Failed';
    case WorkflowStatus.CANCELLED:
      return 'Cancelled';
    default:
      return status;
  }
}

/**
 * Gets the duration of a workflow in milliseconds
 * Returns undefined if workflow hasn't started
 */
export function getWorkflowDuration(workflow: Workflow): number | undefined {
  if (!workflow.startedAt) {
    return undefined;
  }

  const endTime = workflow.finishedAt
    ? new Date(workflow.finishedAt).getTime()
    : Date.now();

  return endTime - new Date(workflow.startedAt).getTime();
}

/**
 * Filter workflows by status
 */
export function filterByWorkflowStatus<T extends Workflow>(
  workflows: T[],
  status: WorkflowStatus
): T[] {
  return workflows.filter((w) => w.status === status);
}

/**
 * Filter workflows that are ephemeral
 */
export function filterEphemeral<T extends Workflow>(workflows: T[]): T[] {
  return workflows.filter(isEphemeral);
}

/**
 * Filter workflows that are durable
 */
export function filterDurable<T extends Workflow>(workflows: T[]): T[] {
  return workflows.filter(isDurable);
}

/**
 * Filter workflows by playbook
 */
export function filterByPlaybook<T extends Workflow>(
  workflows: T[],
  playbookId: PlaybookId
): T[] {
  return workflows.filter((w) => w.playbookId === playbookId);
}

/**
 * Filter ad-hoc workflows (not from a playbook)
 */
export function filterAdHoc<T extends Workflow>(workflows: T[]): T[] {
  return workflows.filter(isAdHoc);
}

/**
 * Filter workflows that are terminal (completed, failed, or cancelled)
 */
export function filterTerminal<T extends Workflow>(workflows: T[]): T[] {
  return workflows.filter(isTerminal);
}

/**
 * Filter workflows that are active (pending or running)
 */
export function filterActive<T extends Workflow>(workflows: T[]): T[] {
  return workflows.filter((w) => !isTerminal(w));
}

/**
 * Sort workflows by status (pending first, then running, then terminal)
 */
export function sortByWorkflowStatus<T extends Workflow>(workflows: T[]): T[] {
  const statusOrder: Record<WorkflowStatus, number> = {
    [WorkflowStatus.PENDING]: 0,
    [WorkflowStatus.RUNNING]: 1,
    [WorkflowStatus.COMPLETED]: 2,
    [WorkflowStatus.FAILED]: 3,
    [WorkflowStatus.CANCELLED]: 4,
  };

  return [...workflows].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
}

/**
 * Sort workflows by creation date (newest first)
 */
export function sortWorkflowsByCreatedAtDesc<T extends Workflow>(workflows: T[]): T[] {
  return [...workflows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Sort workflows by creation date (oldest first)
 */
export function sortWorkflowsByCreatedAtAsc<T extends Workflow>(workflows: T[]): T[] {
  return [...workflows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Sort workflows by start time (earliest first, unstarted last)
 */
export function sortByStartedAt<T extends Workflow>(workflows: T[]): T[] {
  return [...workflows].sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0;
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  });
}

/**
 * Group workflows by status
 */
export function groupByWorkflowStatus<T extends Workflow>(
  workflows: T[]
): Record<WorkflowStatus, T[]> {
  return workflows.reduce(
    (acc, workflow) => {
      acc[workflow.status].push(workflow);
      return acc;
    },
    {
      [WorkflowStatus.PENDING]: [],
      [WorkflowStatus.RUNNING]: [],
      [WorkflowStatus.COMPLETED]: [],
      [WorkflowStatus.FAILED]: [],
      [WorkflowStatus.CANCELLED]: [],
    } as Record<WorkflowStatus, T[]>
  );
}

/**
 * Group workflows by playbook ID
 */
export function groupByPlaybook<T extends Workflow>(
  workflows: T[]
): Map<PlaybookId | undefined, T[]> {
  const groups = new Map<PlaybookId | undefined, T[]>();

  for (const workflow of workflows) {
    const key = workflow.playbookId;
    const group = groups.get(key) ?? [];
    group.push(workflow);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Checks if a workflow is eligible for garbage collection
 * A workflow can be GC'd if it's ephemeral and in a terminal state
 */
export function isEligibleForGarbageCollection(workflow: Workflow): boolean {
  return workflow.ephemeral && isTerminal(workflow);
}

/**
 * Filter workflows eligible for garbage collection
 */
export function filterEligibleForGarbageCollection<T extends Workflow>(workflows: T[]): T[] {
  return workflows.filter(isEligibleForGarbageCollection);
}

/**
 * Filter workflows eligible for garbage collection by age
 * @param workflows - Workflows to filter
 * @param maxAgeMs - Maximum age in milliseconds
 */
export function filterGarbageCollectionByAge<T extends Workflow>(
  workflows: T[],
  maxAgeMs: number
): T[] {
  const now = Date.now();
  return workflows.filter((w) => {
    if (!isEligibleForGarbageCollection(w)) return false;
    const finishedTime = w.finishedAt ? new Date(w.finishedAt).getTime() : 0;
    return now - finishedTime >= maxAgeMs;
  });
}
