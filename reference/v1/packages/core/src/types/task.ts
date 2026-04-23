/**
 * Task Type - Work tracking primitive
 *
 * Tasks represent units of work to be tracked and completed within Stoneforge.
 * They support rich metadata, scheduling, assignment, and lifecycle management.
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

// ============================================================================
// Task Status
// ============================================================================

/**
 * All valid task status values
 */
export const TaskStatus = {
  /** Available for work */
  OPEN: 'open',
  /** Currently being worked on */
  IN_PROGRESS: 'in_progress',
  /** Waiting on dependency */
  BLOCKED: 'blocked',
  /** Deliberately postponed */
  DEFERRED: 'deferred',
  /** In backlog - not ready for work, needs triage */
  BACKLOG: 'backlog',
  /** Work complete, awaiting merge/review */
  REVIEW: 'review',
  /** Completed and merged */
  CLOSED: 'closed',
  /** Soft-deleted */
  TOMBSTONE: 'tombstone',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/**
 * Status values that indicate task is ready for work
 */
export const READY_STATUSES: TaskStatus[] = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS];

/**
 * Valid status transitions
 * Key: current status, Value: array of valid target statuses
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.DEFERRED,
    TaskStatus.BACKLOG,
    TaskStatus.CLOSED,
  ],
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.OPEN,
    TaskStatus.BLOCKED,
    TaskStatus.DEFERRED,
    TaskStatus.REVIEW,
    TaskStatus.CLOSED,
  ],
  [TaskStatus.BLOCKED]: [
    TaskStatus.OPEN,
    TaskStatus.IN_PROGRESS,
    TaskStatus.DEFERRED,
    TaskStatus.CLOSED,
  ],
  [TaskStatus.DEFERRED]: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.BACKLOG],
  [TaskStatus.BACKLOG]: [TaskStatus.OPEN, TaskStatus.DEFERRED, TaskStatus.CLOSED],
  [TaskStatus.REVIEW]: [TaskStatus.CLOSED, TaskStatus.IN_PROGRESS, TaskStatus.OPEN], // Merge completes, reopen for fixes, or reset to pool
  [TaskStatus.CLOSED]: [TaskStatus.OPEN], // Reopen
  [TaskStatus.TOMBSTONE]: [], // Terminal state
};

// ============================================================================
// Priority
// ============================================================================

/**
 * Priority scale (1-5, where 1 is highest)
 */
export const Priority = {
  /** Production issues, security vulnerabilities */
  CRITICAL: 1,
  /** Important features, significant bugs */
  HIGH: 2,
  /** Standard work items (default) */
  MEDIUM: 3,
  /** Nice-to-have improvements */
  LOW: 4,
  /** Can be done when time permits */
  MINIMAL: 5,
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

/** All valid priority values */
export const VALID_PRIORITIES = [1, 2, 3, 4, 5] as const;

/** Default priority for new tasks */
export const DEFAULT_PRIORITY: Priority = Priority.MEDIUM;

// ============================================================================
// Complexity
// ============================================================================

/**
 * Complexity scale (1-5, where 1 is simplest)
 */
export const Complexity = {
  /** Single-line changes, typo fixes */
  TRIVIAL: 1,
  /** Small, well-defined changes */
  SIMPLE: 2,
  /** Moderate changes, some research needed */
  MEDIUM: 3,
  /** Significant changes, multiple components */
  COMPLEX: 4,
  /** Large scope, architectural changes */
  VERY_COMPLEX: 5,
} as const;

export type Complexity = (typeof Complexity)[keyof typeof Complexity];

/** All valid complexity values */
export const VALID_COMPLEXITIES = [1, 2, 3, 4, 5] as const;

/** Default complexity for new tasks */
export const DEFAULT_COMPLEXITY: Complexity = Complexity.MEDIUM;

// ============================================================================
// Task Type Classification
// ============================================================================

/**
 * Built-in task type classifications
 */
export const TaskTypeValue = {
  /** Defect requiring fix */
  BUG: 'bug',
  /** New functionality */
  FEATURE: 'feature',
  /** General work item */
  TASK: 'task',
  /** Maintenance, cleanup, technical debt */
  CHORE: 'chore',
} as const;

export type TaskTypeValue = (typeof TaskTypeValue)[keyof typeof TaskTypeValue];

/** Default task type */
export const DEFAULT_TASK_TYPE: TaskTypeValue = TaskTypeValue.TASK;

// ============================================================================
// Validation Constants
// ============================================================================

/** Minimum title length */
export const MIN_TITLE_LENGTH = 1;

/** Maximum title length */
export const MAX_TITLE_LENGTH = 500;

/** Maximum acceptance criteria length */
export const MAX_ACCEPTANCE_CRITERIA_LENGTH = 10000;

/** Maximum close reason length */
export const MAX_CLOSE_REASON_LENGTH = 1000;

/** Maximum delete reason length */
export const MAX_DELETE_REASON_LENGTH = 1000;

// ============================================================================
// Task Interface
// ============================================================================

/**
 * Task interface - extends Element with work tracking properties
 */
export interface Task extends Element {
  /** Task type is always 'task' */
  readonly type: typeof ElementType.TASK;

  // Content
  /** Task title, 1-500 characters */
  title: string;
  /** Reference to description Document */
  descriptionRef?: DocumentId;
  /** Definition of done criteria */
  acceptanceCriteria?: string;

  // Workflow
  /** Current lifecycle state */
  status: TaskStatus;
  /** 1-5 scale, 1 is highest */
  priority: Priority;
  /** 1-5 scale, 1 is simplest */
  complexity: Complexity;
  /** Classification (bug, feature, task, chore) */
  taskType: TaskTypeValue;
  /** Explanation when closed */
  closeReason?: string;

  // Assignment
  /** Entity currently working on task */
  assignee?: EntityId;
  /** Entity responsible for task completion */
  owner?: EntityId;

  // Scheduling
  /** External deadline constraint */
  deadline?: Timestamp;
  /** When task becomes actionable */
  scheduledFor?: Timestamp;
  /** When task was closed */
  closedAt?: Timestamp;

  // Soft Delete
  /** When task was soft-deleted */
  deletedAt?: Timestamp;
  /** Entity that deleted the task */
  deletedBy?: EntityId;
  /** Explanation for deletion */
  deleteReason?: string;

  // External Integration
  /** URL or ID in external system */
  externalRef?: string;
}

/**
 * Task with hydrated document references
 */
export interface HydratedTask extends Task {
  /** Hydrated description Document content */
  description?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a task status value
 */
export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' && Object.values(TaskStatus).includes(value as TaskStatus)
  );
}

/**
 * Validates task status and throws if invalid
 */
export function validateTaskStatus(value: unknown): TaskStatus {
  if (!isValidTaskStatus(value)) {
    throw new ValidationError(
      `Invalid task status: ${value}. Must be one of: ${Object.values(TaskStatus).join(', ')}`,
      ErrorCode.INVALID_STATUS,
      { field: 'status', value, expected: Object.values(TaskStatus) }
    );
  }
  return value;
}

/**
 * Validates a priority value
 */
export function isValidPriority(value: unknown): value is Priority {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

/**
 * Validates priority and throws if invalid
 */
export function validatePriority(value: unknown): Priority {
  if (!isValidPriority(value)) {
    throw new ValidationError(
      `Invalid priority: ${value}. Must be an integer from 1 to 5`,
      ErrorCode.INVALID_INPUT,
      { field: 'priority', value, expected: '1-5 (1 is highest)' }
    );
  }
  return value;
}

/**
 * Validates a complexity value
 */
export function isValidComplexity(value: unknown): value is Complexity {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

/**
 * Validates complexity and throws if invalid
 */
export function validateComplexity(value: unknown): Complexity {
  if (!isValidComplexity(value)) {
    throw new ValidationError(
      `Invalid complexity: ${value}. Must be an integer from 1 to 5`,
      ErrorCode.INVALID_INPUT,
      { field: 'complexity', value, expected: '1-5 (1 is simplest)' }
    );
  }
  return value;
}

/**
 * Validates a task type value
 */
export function isValidTaskType(value: unknown): value is TaskTypeValue {
  return (
    typeof value === 'string' &&
    Object.values(TaskTypeValue).includes(value as TaskTypeValue)
  );
}

/**
 * Validates task type and throws if invalid
 */
export function validateTaskType(value: unknown): TaskTypeValue {
  if (!isValidTaskType(value)) {
    throw new ValidationError(
      `Invalid task type: ${value}. Must be one of: ${Object.values(TaskTypeValue).join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'taskType', value, expected: Object.values(TaskTypeValue) }
    );
  }
  return value;
}

/**
 * Validates a task title
 */
export function isValidTitle(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length >= MIN_TITLE_LENGTH && trimmed.length <= MAX_TITLE_LENGTH;
}

/**
 * Validates task title and throws if invalid
 */
export function validateTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Task title must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'title', value, expected: 'string' }
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(
      'Task title cannot be empty',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'title', value }
    );
  }

  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(
      `Task title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`,
      ErrorCode.TITLE_TOO_LONG,
      { field: 'title', expected: `<= ${MAX_TITLE_LENGTH} characters`, actual: trimmed.length }
    );
  }

  return trimmed;
}

/**
 * Validates optional text fields with max length
 */
export function validateOptionalText(
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
export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) {
    return true; // No-op is always valid
  }
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Validates status transition and throws if invalid
 */
export function validateStatusTransition(from: TaskStatus, to: TaskStatus): void {
  if (!isValidStatusTransition(from, to)) {
    throw new ValidationError(
      `Invalid status transition from '${from}' to '${to}'`,
      ErrorCode.INVALID_STATUS,
      {
        field: 'status',
        from,
        to,
        allowedTransitions: STATUS_TRANSITIONS[from],
      }
    );
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Task
 */
export function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.TASK) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check required task-specific properties
  if (!isValidTitle(obj.title)) return false;
  if (!isValidTaskStatus(obj.status)) return false;
  if (!isValidPriority(obj.priority)) return false;
  if (!isValidComplexity(obj.complexity)) return false;
  if (!isValidTaskType(obj.taskType)) return false;

  // Check optional properties have correct types when present
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string')
    return false;
  if (obj.acceptanceCriteria !== undefined && typeof obj.acceptanceCriteria !== 'string')
    return false;
  if (obj.closeReason !== undefined && typeof obj.closeReason !== 'string') return false;
  if (obj.assignee !== undefined && typeof obj.assignee !== 'string') return false;
  if (obj.owner !== undefined && typeof obj.owner !== 'string') return false;
  if (obj.deadline !== undefined && typeof obj.deadline !== 'string') return false;
  if (obj.scheduledFor !== undefined && typeof obj.scheduledFor !== 'string') return false;
  if (obj.closedAt !== undefined && typeof obj.closedAt !== 'string') return false;
  if (obj.deletedAt !== undefined && typeof obj.deletedAt !== 'string') return false;
  if (obj.deletedBy !== undefined && typeof obj.deletedBy !== 'string') return false;
  if (obj.deleteReason !== undefined && typeof obj.deleteReason !== 'string') return false;
  if (obj.externalRef !== undefined && typeof obj.externalRef !== 'string') return false;

  return true;
}

/**
 * Comprehensive validation of a task with detailed errors
 */
export function validateTask(value: unknown): Task {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Task must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Task id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.TASK) {
    throw new ValidationError(
      `Task type must be '${ElementType.TASK}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.TASK }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError('Task createdAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'createdAt',
      value: obj.createdAt,
    });
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError('Task updatedAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'updatedAt',
      value: obj.updatedAt,
    });
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Task createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError('Task tags must be an array', ErrorCode.INVALID_INPUT, {
      field: 'tags',
      value: obj.tags,
      expected: 'array',
    });
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError('Task metadata must be an object', ErrorCode.INVALID_INPUT, {
      field: 'metadata',
      value: obj.metadata,
      expected: 'object',
    });
  }

  // Validate task-specific required fields
  validateTitle(obj.title);
  validateTaskStatus(obj.status);
  validatePriority(obj.priority);
  validateComplexity(obj.complexity);
  validateTaskType(obj.taskType);

  // Validate optional text fields
  validateOptionalText(obj.acceptanceCriteria, 'acceptanceCriteria', MAX_ACCEPTANCE_CRITERIA_LENGTH);
  validateOptionalText(obj.closeReason, 'closeReason', MAX_CLOSE_REASON_LENGTH);
  validateOptionalText(obj.deleteReason, 'deleteReason', MAX_DELETE_REASON_LENGTH);

  return value as Task;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new task
 */
export interface CreateTaskInput {
  /** Task title, 1-500 characters */
  title: string;
  /** Reference to the entity that created this task */
  createdBy: EntityId;
  /** Optional: Pre-generated ID (e.g., hierarchical ID) */
  id?: ElementId;
  /** Optional: Reference to description Document */
  descriptionRef?: DocumentId;
  /** Optional: Definition of done criteria */
  acceptanceCriteria?: string;
  /** Optional: Initial status (default: open) */
  status?: TaskStatus;
  /** Optional: 1-5 scale (default: 3) */
  priority?: Priority;
  /** Optional: 1-5 scale (default: 3) */
  complexity?: Complexity;
  /** Optional: Classification (default: task) */
  taskType?: TaskTypeValue;
  /** Optional: Entity currently working on task */
  assignee?: EntityId;
  /** Optional: Entity responsible for task completion */
  owner?: EntityId;
  /** Optional: External deadline constraint */
  deadline?: Timestamp;
  /** Optional: When task becomes actionable */
  scheduledFor?: Timestamp;
  /** Optional: URL or ID in external system */
  externalRef?: string;
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Task with validated inputs
 *
 * @param input - Task creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Task
 */
export async function createTask(
  input: CreateTaskInput,
  config?: IdGeneratorConfig
): Promise<Task> {
  // Validate required fields
  const title = validateTitle(input.title);

  // Validate optional fields with defaults
  const status = input.status !== undefined ? validateTaskStatus(input.status) : TaskStatus.OPEN;
  const priority = input.priority !== undefined ? validatePriority(input.priority) : DEFAULT_PRIORITY;
  const complexity = input.complexity !== undefined
    ? validateComplexity(input.complexity)
    : DEFAULT_COMPLEXITY;
  const taskType = input.taskType !== undefined ? validateTaskType(input.taskType) : DEFAULT_TASK_TYPE;

  // Validate optional text fields
  const acceptanceCriteria = validateOptionalText(
    input.acceptanceCriteria,
    'acceptanceCriteria',
    MAX_ACCEPTANCE_CRITERIA_LENGTH
  );

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Use provided ID or generate one using title
  const id = input.id ?? await generateId({ identifier: title, createdBy: input.createdBy }, config);

  const task: Task = {
    id,
    type: ElementType.TASK,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags,
    metadata,
    title,
    status,
    priority,
    complexity,
    taskType,
    ...(input.descriptionRef !== undefined && { descriptionRef: input.descriptionRef }),
    ...(acceptanceCriteria !== undefined && { acceptanceCriteria }),
    ...(input.assignee !== undefined && { assignee: input.assignee }),
    ...(input.owner !== undefined && { owner: input.owner }),
    ...(input.deadline !== undefined && { deadline: input.deadline }),
    ...(input.scheduledFor !== undefined && { scheduledFor: input.scheduledFor }),
    ...(input.externalRef !== undefined && { externalRef: input.externalRef }),
  };

  return task;
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Input for updating a task's status
 */
export interface UpdateTaskStatusInput {
  /** New status */
  status: TaskStatus;
  /** Optional: Close reason (required when closing) */
  closeReason?: string;
}

/**
 * Updates a task's status with transition validation
 *
 * @param task - The current task
 * @param input - Update input
 * @returns The updated task
 */
export function updateTaskStatus(task: Task, input: UpdateTaskStatusInput): Task {
  const newStatus = validateTaskStatus(input.status);
  validateStatusTransition(task.status, newStatus);

  const now = createTimestamp();
  const updates: Partial<Task> = {
    status: newStatus,
    updatedAt: now,
  };

  // Set closedAt when closing
  if (newStatus === TaskStatus.CLOSED && task.status !== TaskStatus.CLOSED) {
    updates.closedAt = now;
    if (input.closeReason) {
      updates.closeReason = validateOptionalText(
        input.closeReason,
        'closeReason',
        MAX_CLOSE_REASON_LENGTH
      );
    }
  }

  // Clear closedAt when reopening
  if (task.status === TaskStatus.CLOSED && newStatus !== TaskStatus.CLOSED) {
    updates.closedAt = undefined;
  }

  return { ...task, ...updates };
}

/**
 * Input for soft-deleting a task
 */
export interface DeleteTaskInput {
  /** Entity performing the deletion */
  deletedBy: EntityId;
  /** Optional: Explanation for deletion */
  deleteReason?: string;
}

/**
 * Soft-deletes a task (transitions to tombstone status)
 *
 * @param task - The current task
 * @param input - Delete input
 * @returns The soft-deleted task
 */
export function softDeleteTask(task: Task, input: DeleteTaskInput): Task {
  if (task.status === TaskStatus.TOMBSTONE) {
    throw new ValidationError(
      'Task is already deleted',
      ErrorCode.INVALID_STATUS,
      { field: 'status', value: task.status }
    );
  }

  const now = createTimestamp();

  return {
    ...task,
    status: TaskStatus.TOMBSTONE,
    deletedAt: now,
    deletedBy: input.deletedBy,
    deleteReason: validateOptionalText(
      input.deleteReason,
      'deleteReason',
      MAX_DELETE_REASON_LENGTH
    ),
    updatedAt: now,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a task is ready for work (open or in_progress)
 */
export function isReadyForWork(task: Task): boolean {
  return READY_STATUSES.includes(task.status);
}

/**
 * Checks if a task is blocked
 */
export function isBlocked(task: Task): boolean {
  return task.status === TaskStatus.BLOCKED;
}

/**
 * Checks if a task is closed
 */
export function isClosed(task: Task): boolean {
  return task.status === TaskStatus.CLOSED;
}

/**
 * Checks if a task is soft-deleted
 */
export function isDeleted(task: Task): boolean {
  return task.status === TaskStatus.TOMBSTONE;
}

/**
 * Checks if a task is in backlog
 */
export function isBacklog(task: Task): boolean {
  return task.status === TaskStatus.BACKLOG;
}

/**
 * Checks if a task is scheduled for the future
 */
export function isScheduledForFuture(task: Task): boolean {
  if (!task.scheduledFor) {
    return false;
  }
  return new Date(task.scheduledFor) > new Date();
}

/**
 * Checks if a task is past its deadline
 */
export function isPastDeadline(task: Task): boolean {
  if (!task.deadline) {
    return false;
  }
  return new Date(task.deadline) < new Date();
}

/**
 * Checks if a task has an assignee
 */
export function isAssigned(task: Task): boolean {
  return task.assignee !== undefined;
}

/**
 * Checks if a task has an owner
 */
export function hasOwner(task: Task): boolean {
  return task.owner !== undefined;
}

/**
 * Gets a display string for priority
 */
export function getPriorityDisplayName(priority: Priority): string {
  switch (priority) {
    case Priority.CRITICAL:
      return 'Critical';
    case Priority.HIGH:
      return 'High';
    case Priority.MEDIUM:
      return 'Medium';
    case Priority.LOW:
      return 'Low';
    case Priority.MINIMAL:
      return 'Minimal';
    default:
      return `Priority ${priority}`;
  }
}

/**
 * Gets a display string for complexity
 */
export function getComplexityDisplayName(complexity: Complexity): string {
  switch (complexity) {
    case Complexity.TRIVIAL:
      return 'Trivial';
    case Complexity.SIMPLE:
      return 'Simple';
    case Complexity.MEDIUM:
      return 'Medium';
    case Complexity.COMPLEX:
      return 'Complex';
    case Complexity.VERY_COMPLEX:
      return 'Very Complex';
    default:
      return `Complexity ${complexity}`;
  }
}

/**
 * Gets a display string for task status
 */
export function getStatusDisplayName(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.OPEN:
      return 'Open';
    case TaskStatus.IN_PROGRESS:
      return 'In Progress';
    case TaskStatus.BLOCKED:
      return 'Blocked';
    case TaskStatus.DEFERRED:
      return 'Deferred';
    case TaskStatus.BACKLOG:
      return 'Backlog';
    case TaskStatus.REVIEW:
      return 'In Review';
    case TaskStatus.CLOSED:
      return 'Closed';
    case TaskStatus.TOMBSTONE:
      return 'Deleted';
    default:
      return status;
  }
}

/**
 * Gets a display string for task type
 */
export function getTaskTypeDisplayName(taskType: TaskTypeValue): string {
  switch (taskType) {
    case TaskTypeValue.BUG:
      return 'Bug';
    case TaskTypeValue.FEATURE:
      return 'Feature';
    case TaskTypeValue.TASK:
      return 'Task';
    case TaskTypeValue.CHORE:
      return 'Chore';
    default:
      return taskType;
  }
}

/**
 * Filter tasks by status
 */
export function filterByStatus<T extends Task>(tasks: T[], status: TaskStatus): T[] {
  return tasks.filter((t) => t.status === status);
}

/**
 * Filter tasks by priority
 */
export function filterByPriority<T extends Task>(tasks: T[], priority: Priority): T[] {
  return tasks.filter((t) => t.priority === priority);
}

/**
 * Filter tasks by assignee
 */
export function filterByAssignee<T extends Task>(
  tasks: T[],
  assignee: EntityId | undefined
): T[] {
  return tasks.filter((t) => t.assignee === assignee);
}

/**
 * Filter tasks that are ready for work
 */
export function filterReadyTasks<T extends Task>(tasks: T[]): T[] {
  return tasks.filter(isReadyForWork);
}

/**
 * Sort tasks by priority (highest first)
 */
export function sortByPriority<T extends Task>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => a.priority - b.priority);
}

/**
 * Sort tasks by deadline (earliest first, null deadlines last)
 */
export function sortByDeadline<T extends Task>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });
}

