/**
 * @stoneforge/ui Domain Types
 *
 * Shared types for domain components (Task, Entity, Plan, Workflow, etc.)
 * These types represent the display-layer interface for domain objects.
 *
 * Note: These types are designed for UI components and may differ slightly
 * from backend types. Components accept these as props and don't make API calls.
 */

/**
 * Base element properties shared by all domain types
 */
export interface BaseElement {
  id: string;
  type: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Task status values
 */
export type TaskStatus =
  | 'todo'
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'closed'
  | 'cancelled'
  | 'deferred'
  | 'backlog';

/**
 * Task priority values (1-5, 1 being highest)
 */
export type Priority = 1 | 2 | 3 | 4 | 5;

/**
 * Task type values
 */
export type TaskType = 'bug' | 'feature' | 'task' | 'chore';

/**
 * Merge status for orchestrator tasks
 */
export type MergeStatus =
  | 'pending'
  | 'testing'
  | 'merging'
  | 'merged'
  | 'conflict'
  | 'test_failed'
  | 'failed'
  | 'not_applicable';

/**
 * Task element for UI display
 */
export interface Task extends BaseElement {
  type: 'task';
  title: string;
  description?: string;
  status: TaskStatus | string;
  priority: Priority | number;
  complexity: number;
  taskType: TaskType | string;
  assignee?: string;
  owner?: string;
  /** Attachment count for display */
  _attachmentCount?: number;
  /** Number of tasks this blocks */
  _blocksCount?: number;
  /** Number of tasks blocking this */
  _blockedByCount?: number;
  /** Orchestrator: git branch for this task */
  branch?: string;
  /** Orchestrator: merge status */
  mergeStatus?: MergeStatus;
}

/**
 * Entity type values
 */
export type EntityType = 'agent' | 'human' | 'system';

/**
 * Entity element for UI display
 */
export interface Entity extends BaseElement {
  type: 'entity';
  name: string;
  entityType: EntityType;
  publicKey?: string;
  active?: boolean;
}

/**
 * Plan status values
 */
export type PlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';

/**
 * Plan element for UI display
 */
export interface Plan extends BaseElement {
  type: 'plan';
  title: string;
  status: PlanStatus | string;
  tasks?: string[];
}

/**
 * Workflow status values
 */
export type WorkflowStatus = 'created' | 'active' | 'completed' | 'failed' | 'cancelled';

/**
 * Workflow element for UI display
 */
export interface Workflow extends BaseElement {
  type: 'workflow';
  title: string;
  status: WorkflowStatus | string;
  ephemeral?: boolean;
  playbookId?: string;
}

/**
 * Document content types
 */
export type DocumentContentType = 'text/markdown' | 'text/plain' | 'application/json' | string;

/**
 * Document element for UI display
 */
export interface Document extends BaseElement {
  type: 'document';
  title: string;
  contentType: DocumentContentType;
  content?: string;
}

/**
 * Channel type values
 */
export type ChannelType = 'group' | 'direct';

/**
 * Channel element for UI display
 */
export interface Channel extends BaseElement {
  type: 'channel';
  name: string;
  channelType: ChannelType;
  members?: string[];
}

/**
 * Team element for UI display
 */
export interface Team extends BaseElement {
  type: 'team';
  name: string;
  members: string[];
  status?: string;
}

/**
 * Priority configuration for display
 */
export interface PriorityConfig {
  label: string;
  variant: 'error' | 'warning' | 'primary' | 'default' | 'outline';
}

/**
 * Default priority configuration
 */
export const PRIORITY_CONFIG: Record<number, PriorityConfig> = {
  1: { label: 'Critical', variant: 'error' },
  2: { label: 'High', variant: 'warning' },
  3: { label: 'Medium', variant: 'primary' },
  4: { label: 'Low', variant: 'default' },
  5: { label: 'Trivial', variant: 'outline' },
};

/**
 * Get priority configuration for a given priority value
 */
export function getPriorityConfig(priority: number): PriorityConfig {
  return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[3];
}

/**
 * Get priority display name
 */
export function getPriorityDisplayName(priority: Priority | number): string {
  return getPriorityConfig(priority).label;
}

/**
 * Get priority badge color classes
 */
export function getPriorityColor(priority: Priority | number): string {
  switch (priority) {
    case 1:
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 2:
      return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30';
    case 3:
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 4:
      return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800/50';
    case 5:
      return 'text-gray-500 bg-gray-50 dark:text-gray-500 dark:bg-gray-800/30';
    default:
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
  }
}

/**
 * Get status display name
 */
export function getStatusDisplayName(status: TaskStatus | string): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'todo':
      return 'To Do';
    case 'in_progress':
      return 'In Progress';
    case 'blocked':
      return 'Blocked';
    case 'review':
      return 'Review';
    case 'closed':
      return 'Closed';
    case 'cancelled':
      return 'Cancelled';
    case 'deferred':
      return 'Deferred';
    case 'backlog':
      return 'Backlog';
    default:
      return status;
  }
}

/**
 * Get status badge color classes
 */
export function getStatusColor(status: TaskStatus | string): string {
  switch (status) {
    case 'open':
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 'todo':
      return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800/50';
    case 'in_progress':
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 'blocked':
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 'review':
      return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30';
    case 'closed':
      return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    case 'cancelled':
      return 'text-gray-500 bg-gray-50 dark:text-gray-500 dark:bg-gray-800/30';
    case 'deferred':
      return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    case 'backlog':
      return 'text-gray-700 bg-gray-200 dark:text-gray-300 dark:bg-gray-700';
    default:
      return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800/50';
  }
}

/**
 * Get task type display name
 */
export function getTaskTypeDisplayName(taskType: TaskType | string): string {
  switch (taskType) {
    case 'bug':
      return 'Bug';
    case 'feature':
      return 'Feature';
    case 'task':
      return 'Task';
    case 'chore':
      return 'Chore';
    default:
      return taskType;
  }
}

/**
 * Get task type badge color classes
 */
export function getTaskTypeColor(taskType: TaskType | string): string {
  switch (taskType) {
    case 'bug':
      return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/20';
    case 'feature':
      return 'text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/20';
    case 'task':
      return 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20';
    case 'chore':
      return 'text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-800/50';
    default:
      return 'text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-800/50';
  }
}

/**
 * Get merge status display name
 */
export function getMergeStatusDisplayName(status: MergeStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending Merge';
    case 'testing':
      return 'Testing';
    case 'merging':
      return 'Merging';
    case 'merged':
      return 'Merged';
    case 'conflict':
      return 'Conflict';
    case 'test_failed':
      return 'Tests Failed';
    case 'failed':
      return 'Merge Failed';
    case 'not_applicable':
      return 'No Merge Needed';
    default:
      return status;
  }
}

/**
 * Get merge status badge color classes
 */
export function getMergeStatusColor(status: MergeStatus): string {
  switch (status) {
    case 'pending':
      return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30';
    case 'testing':
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 'merging':
      return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    case 'merged':
      return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    case 'conflict':
      return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30';
    case 'test_failed':
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 'failed':
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 'not_applicable':
      return 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800/50';
    default:
      return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800/50';
  }
}

/**
 * Task type style borders for card display
 */
export const TASK_TYPE_STYLES: Record<string, string> = {
  bug: 'border-l-4 border-l-[var(--color-error-400)]',
  feature: 'border-l-4 border-l-[var(--color-accent-400)]',
  task: 'border-l-4 border-l-[var(--color-primary-400)]',
  chore: 'border-l-4 border-l-[var(--color-neutral-400)]',
};

/**
 * Get task type style class
 */
export function getTaskTypeStyle(taskType: TaskType | string): string {
  return TASK_TYPE_STYLES[taskType] || TASK_TYPE_STYLES.task;
}

/**
 * Entity type configuration for display
 */
export interface EntityTypeConfig {
  bgColor: string;
  textColor: string;
  variant: 'primary' | 'success' | 'warning' | 'default';
}

/**
 * Default entity type configuration
 */
export const ENTITY_TYPE_CONFIG: Record<EntityType | string, EntityTypeConfig> = {
  agent: {
    bgColor: 'bg-[var(--color-primary-muted)]',
    textColor: 'text-[var(--color-primary-text)]',
    variant: 'primary',
  },
  human: {
    bgColor: 'bg-[var(--color-success-bg)]',
    textColor: 'text-[var(--color-success-text)]',
    variant: 'success',
  },
  system: {
    bgColor: 'bg-[var(--color-warning-bg)]',
    textColor: 'text-[var(--color-warning-text)]',
    variant: 'warning',
  },
};

/**
 * Get entity type configuration
 */
export function getEntityTypeConfig(entityType: EntityType | string): EntityTypeConfig {
  return ENTITY_TYPE_CONFIG[entityType] || ENTITY_TYPE_CONFIG.system;
}
