/**
 * Plan Type - Task collection primitive (Epic)
 *
 * Plans organize related tasks into logical groupings for batch tracking,
 * progress monitoring, and high-level planning.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import {
  Element,
  EntityId,
  ElementType,
  Timestamp,
  createTimestamp,
  validateTags,
  validateMetadata,
} from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';
import { DocumentId } from './document.js';
import { TaskStatus } from './task.js';

// ============================================================================
// Plan Status
// ============================================================================

/**
 * All valid plan status values
 */
export const PlanStatus = {
  /** Planning phase, tasks being defined */
  DRAFT: 'draft',
  /** Execution phase, work in progress */
  ACTIVE: 'active',
  /** All tasks closed successfully */
  COMPLETED: 'completed',
  /** Plan abandoned */
  CANCELLED: 'cancelled',
} as const;

export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

/**
 * Valid status transitions
 * Key: current status, Value: array of valid target statuses
 */
export const PLAN_STATUS_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  [PlanStatus.DRAFT]: [PlanStatus.ACTIVE, PlanStatus.CANCELLED],
  [PlanStatus.ACTIVE]: [PlanStatus.COMPLETED, PlanStatus.CANCELLED],
  [PlanStatus.COMPLETED]: [PlanStatus.ACTIVE], // Reopen
  [PlanStatus.CANCELLED]: [PlanStatus.DRAFT], // Restart
};

// ============================================================================
// Validation Constants
// ============================================================================

/** Minimum title length */
export const MIN_PLAN_TITLE_LENGTH = 1;

/** Maximum title length */
export const MAX_PLAN_TITLE_LENGTH = 500;

/** Maximum cancel reason length */
export const MAX_CANCEL_REASON_LENGTH = 1000;

// ============================================================================
// Plan Interface
// ============================================================================

/**
 * Plan interface - extends Element with task collection properties
 */
export interface Plan extends Element {
  /** Plan type is always 'plan' */
  readonly type: typeof ElementType.PLAN;

  // Content
  /** Plan title, 1-500 characters */
  title: string;
  /** Reference to description Document */
  descriptionRef?: DocumentId;

  // Workflow
  /** Current lifecycle state */
  status: PlanStatus;

  // Completion tracking
  /** When plan was completed */
  completedAt?: Timestamp;
  /** When plan was cancelled */
  cancelledAt?: Timestamp;
  /** Explanation when cancelled */
  cancelReason?: string;
}

/**
 * Progress metrics for a plan
 */
export interface PlanProgress {
  /** Total number of child tasks */
  totalTasks: number;
  /** Tasks with 'closed' status */
  completedTasks: number;
  /** Tasks with 'in_progress' status */
  inProgressTasks: number;
  /** Tasks with 'blocked' status */
  blockedTasks: number;
  /** Tasks with 'open' or 'deferred' status */
  remainingTasks: number;
  /** Completion percentage (0-100) */
  completionPercentage: number;
}

/**
 * Plan with hydrated progress information
 */
export interface HydratedPlan extends Plan {
  /** Hydrated description Document content */
  description?: string;
  /** Computed progress metrics */
  progress?: PlanProgress;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a plan status value
 */
export function isValidPlanStatus(value: unknown): value is PlanStatus {
  return (
    typeof value === 'string' && Object.values(PlanStatus).includes(value as PlanStatus)
  );
}

/**
 * Validates plan status and throws if invalid
 */
export function validatePlanStatus(value: unknown): PlanStatus {
  if (!isValidPlanStatus(value)) {
    throw new ValidationError(
      `Invalid plan status: ${value}. Must be one of: ${Object.values(PlanStatus).join(', ')}`,
      ErrorCode.INVALID_STATUS,
      { field: 'status', value, expected: Object.values(PlanStatus) }
    );
  }
  return value;
}

/**
 * Validates a plan title
 */
export function isValidPlanTitle(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length >= MIN_PLAN_TITLE_LENGTH && trimmed.length <= MAX_PLAN_TITLE_LENGTH;
}

/**
 * Validates plan title and throws if invalid
 */
export function validatePlanTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Plan title must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'title', value, expected: 'string' }
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(
      'Plan title cannot be empty',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'title', value }
    );
  }

  if (trimmed.length > MAX_PLAN_TITLE_LENGTH) {
    throw new ValidationError(
      `Plan title exceeds maximum length of ${MAX_PLAN_TITLE_LENGTH} characters`,
      ErrorCode.TITLE_TOO_LONG,
      { field: 'title', expected: `<= ${MAX_PLAN_TITLE_LENGTH} characters`, actual: trimmed.length }
    );
  }

  return trimmed;
}

/**
 * Validates optional text fields with max length
 */
export function validatePlanOptionalText(
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
 * Validates a status transition is allowed
 */
export function isValidPlanStatusTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) {
    return true; // No-op is always valid
  }
  return PLAN_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Validates status transition and throws if invalid
 */
export function validatePlanStatusTransition(from: PlanStatus, to: PlanStatus): void {
  if (!isValidPlanStatusTransition(from, to)) {
    throw new ValidationError(
      `Invalid plan status transition from '${from}' to '${to}'`,
      ErrorCode.INVALID_STATUS,
      {
        field: 'status',
        from,
        to,
        allowedTransitions: PLAN_STATUS_TRANSITIONS[from],
      }
    );
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Plan
 */
export function isPlan(value: unknown): value is Plan {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.PLAN) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check required plan-specific properties
  if (!isValidPlanTitle(obj.title)) return false;
  if (!isValidPlanStatus(obj.status)) return false;

  // Check optional properties have correct types when present
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string')
    return false;
  if (obj.completedAt !== undefined && typeof obj.completedAt !== 'string') return false;
  if (obj.cancelledAt !== undefined && typeof obj.cancelledAt !== 'string') return false;
  if (obj.cancelReason !== undefined && typeof obj.cancelReason !== 'string') return false;

  return true;
}

/**
 * Comprehensive validation of a plan with detailed errors
 */
export function validatePlan(value: unknown): Plan {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Plan must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Plan id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.PLAN) {
    throw new ValidationError(
      `Plan type must be '${ElementType.PLAN}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.PLAN }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError('Plan createdAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'createdAt',
      value: obj.createdAt,
    });
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError('Plan updatedAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'updatedAt',
      value: obj.updatedAt,
    });
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Plan createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError('Plan tags must be an array', ErrorCode.INVALID_INPUT, {
      field: 'tags',
      value: obj.tags,
      expected: 'array',
    });
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError('Plan metadata must be an object', ErrorCode.INVALID_INPUT, {
      field: 'metadata',
      value: obj.metadata,
      expected: 'object',
    });
  }

  // Validate plan-specific required fields
  validatePlanTitle(obj.title);
  validatePlanStatus(obj.status);

  // Validate optional text fields
  validatePlanOptionalText(obj.cancelReason, 'cancelReason', MAX_CANCEL_REASON_LENGTH);

  return value as Plan;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new plan
 */
export interface CreatePlanInput {
  /** Plan title, 1-500 characters */
  title: string;
  /** Reference to the entity that created this plan */
  createdBy: EntityId;
  /** Optional: Reference to description Document */
  descriptionRef?: DocumentId;
  /** Optional: Initial status (default: draft) */
  status?: PlanStatus;
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Plan with validated inputs
 *
 * @param input - Plan creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Plan
 */
export async function createPlan(
  input: CreatePlanInput,
  config?: IdGeneratorConfig
): Promise<Plan> {
  // Validate required fields
  const title = validatePlanTitle(input.title);

  // Validate optional fields with defaults
  const status = input.status !== undefined ? validatePlanStatus(input.status) : PlanStatus.DRAFT;

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Generate ID using title
  const id = await generateId({ identifier: title, createdBy: input.createdBy }, config);

  const plan: Plan = {
    id,
    type: ElementType.PLAN,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags,
    metadata,
    title,
    status,
    ...(input.descriptionRef !== undefined && { descriptionRef: input.descriptionRef }),
  };

  return plan;
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Input for updating a plan's status
 */
export interface UpdatePlanStatusInput {
  /** New status */
  status: PlanStatus;
  /** Optional: Cancel reason (required when cancelling) */
  cancelReason?: string;
}

/**
 * Updates a plan's status with transition validation
 *
 * @param plan - The current plan
 * @param input - Update input
 * @returns The updated plan
 */
export function updatePlanStatus(plan: Plan, input: UpdatePlanStatusInput): Plan {
  const newStatus = validatePlanStatus(input.status);
  validatePlanStatusTransition(plan.status, newStatus);

  const now = createTimestamp();
  const updates: Partial<Plan> = {
    status: newStatus,
    updatedAt: now,
  };

  // Set completedAt when completing
  if (newStatus === PlanStatus.COMPLETED && plan.status !== PlanStatus.COMPLETED) {
    updates.completedAt = now;
  }

  // Clear completedAt when reopening
  if (plan.status === PlanStatus.COMPLETED && newStatus !== PlanStatus.COMPLETED) {
    updates.completedAt = undefined;
  }

  // Set cancelledAt when cancelling
  if (newStatus === PlanStatus.CANCELLED && plan.status !== PlanStatus.CANCELLED) {
    updates.cancelledAt = now;
    if (input.cancelReason) {
      updates.cancelReason = validatePlanOptionalText(
        input.cancelReason,
        'cancelReason',
        MAX_CANCEL_REASON_LENGTH
      );
    }
  }

  // Clear cancelledAt when restarting
  if (plan.status === PlanStatus.CANCELLED && newStatus !== PlanStatus.CANCELLED) {
    updates.cancelledAt = undefined;
    updates.cancelReason = undefined;
  }

  return { ...plan, ...updates };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a plan is in draft status
 */
export function isDraft(plan: Plan): boolean {
  return plan.status === PlanStatus.DRAFT;
}

/**
 * Checks if a plan is active
 */
export function isActive(plan: Plan): boolean {
  return plan.status === PlanStatus.ACTIVE;
}

/**
 * Checks if a plan is completed
 */
export function isCompleted(plan: Plan): boolean {
  return plan.status === PlanStatus.COMPLETED;
}

/**
 * Checks if a plan is cancelled
 */
export function isCancelled(plan: Plan): boolean {
  return plan.status === PlanStatus.CANCELLED;
}

/**
 * Gets a display string for plan status
 */
export function getPlanStatusDisplayName(status: PlanStatus): string {
  switch (status) {
    case PlanStatus.DRAFT:
      return 'Draft';
    case PlanStatus.ACTIVE:
      return 'Active';
    case PlanStatus.COMPLETED:
      return 'Completed';
    case PlanStatus.CANCELLED:
      return 'Cancelled';
    default:
      return status;
  }
}

/**
 * Calculate progress from task status counts
 */
export function calculatePlanProgress(taskStatusCounts: Record<TaskStatus, number>): PlanProgress {
  const closedCount = taskStatusCounts[TaskStatus.CLOSED] || 0;
  const inProgressCount = taskStatusCounts[TaskStatus.IN_PROGRESS] || 0;
  const blockedCount = taskStatusCounts[TaskStatus.BLOCKED] || 0;
  const openCount = taskStatusCounts[TaskStatus.OPEN] || 0;
  const deferredCount = taskStatusCounts[TaskStatus.DEFERRED] || 0;
  // Tombstone tasks are excluded from progress calculations

  const totalTasks = closedCount + inProgressCount + blockedCount + openCount + deferredCount;
  const remainingTasks = openCount + deferredCount;
  const completionPercentage = totalTasks === 0 ? 0 : Math.round((closedCount / totalTasks) * 100);

  return {
    totalTasks,
    completedTasks: closedCount,
    inProgressTasks: inProgressCount,
    blockedTasks: blockedCount,
    remainingTasks,
    completionPercentage,
  };
}

/**
 * Checks if a plan can be auto-completed based on task statuses
 */
export function canAutoComplete(taskStatusCounts: Record<TaskStatus, number>): boolean {
  const closedCount = taskStatusCounts[TaskStatus.CLOSED] || 0;
  const inProgressCount = taskStatusCounts[TaskStatus.IN_PROGRESS] || 0;
  const blockedCount = taskStatusCounts[TaskStatus.BLOCKED] || 0;
  const openCount = taskStatusCounts[TaskStatus.OPEN] || 0;
  const deferredCount = taskStatusCounts[TaskStatus.DEFERRED] || 0;

  // Can auto-complete if:
  // 1. There are some tasks
  // 2. All non-tombstone tasks are closed
  const totalTasks = closedCount + inProgressCount + blockedCount + openCount + deferredCount;
  const nonClosedTasks = inProgressCount + blockedCount + openCount + deferredCount;

  return totalTasks > 0 && nonClosedTasks === 0;
}

/**
 * Filter plans by status
 */
export function filterByPlanStatus<T extends Plan>(plans: T[], status: PlanStatus): T[] {
  return plans.filter((p) => p.status === status);
}

/**
 * Get active plans
 */
export function filterActivePlans<T extends Plan>(plans: T[]): T[] {
  return filterByPlanStatus(plans, PlanStatus.ACTIVE);
}

/**
 * Get draft plans
 */
export function filterDraftPlans<T extends Plan>(plans: T[]): T[] {
  return filterByPlanStatus(plans, PlanStatus.DRAFT);
}

/**
 * Sort plans by creation date (newest first)
 */
export function sortByCreationDate<T extends Plan>(plans: T[], ascending = false): T[] {
  return [...plans].sort((a, b) => {
    const comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return ascending ? -comparison : comparison;
  });
}
