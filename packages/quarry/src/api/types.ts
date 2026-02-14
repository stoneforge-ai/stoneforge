/**
 * Query API Type Definitions
 *
 * This module defines all types, interfaces, and filters for the Stoneforge Query API.
 * The Query API provides the primary programmatic interface to Stoneforge, enabling
 * CRUD operations, queries, dependency management, and system administration.
 */

import type {
  Element,
  ElementId,
  ElementType,
  EntityId,
  Timestamp,
  Task,
  TaskStatus,
  Priority,
  Complexity,
  TaskTypeValue,
  CreateTaskInput,
  Document,
  DocumentId,
  ContentType,
  DocumentCategory,
  DocumentStatus,
  Dependency,
  DependencyType,
  Event,
  EventFilter,
  PlanProgress,
  Message,
  MessageId,
  ChannelId,
  Team,
  WorkflowStatus,
} from '@stoneforge/core';
import type { EmbeddingService } from '../services/embeddings/service.js';

// Re-export PlanProgress for API consumers
export type { PlanProgress };

// ============================================================================
// Pagination and Sorting
// ============================================================================

/**
 * Sort direction for query results
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Base pagination options for list queries
 */
export interface PaginationOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
}

/**
 * Base sorting options for list queries
 */
export interface SortOptions {
  /** Field to sort by */
  orderBy?: string;
  /** Sort direction */
  orderDir?: SortDirection;
}

// ============================================================================
// Element Filters
// ============================================================================

/**
 * Base filter for all element queries.
 * All filters are optional and are combined with AND logic.
 */
export interface ElementFilter extends PaginationOptions, SortOptions {
  /** Filter by element type(s) */
  type?: ElementType | ElementType[];
  /** Must have ALL specified tags */
  tags?: string[];
  /** Must have ANY of the specified tags */
  tagsAny?: string[];
  /** Filter by creator */
  createdBy?: EntityId;
  /** Created after this timestamp (inclusive) */
  createdAfter?: Timestamp;
  /** Created before this timestamp (exclusive) */
  createdBefore?: Timestamp;
  /** Updated after this timestamp (inclusive) */
  updatedAfter?: Timestamp;
  /** Updated before this timestamp (exclusive) */
  updatedBefore?: Timestamp;
  /** Include soft-deleted elements (tombstones) */
  includeDeleted?: boolean;
  /** Hydration options for resolving document references */
  hydrate?: HydrationOptions;
}

/**
 * Extended filter for task queries.
 * Includes all ElementFilter options plus task-specific filters.
 */
export interface TaskFilter extends ElementFilter {
  /** Filter by status(es) */
  status?: TaskStatus | TaskStatus[];
  /** Filter by priority level(s) */
  priority?: Priority | Priority[];
  /** Filter by complexity level(s) */
  complexity?: Complexity | Complexity[];
  /** Filter by assignee */
  assignee?: EntityId;
  /** Filter by owner */
  owner?: EntityId;
  /** Filter by task type classification(s) */
  taskType?: TaskTypeValue | TaskTypeValue[];
  /** Filter tasks that have a deadline set */
  hasDeadline?: boolean;
  /** Filter tasks with deadline before this timestamp */
  deadlineBefore?: Timestamp;
  /**
   * Include tasks belonging to ephemeral workflows.
   * By default, tasks from ephemeral workflows are excluded from ready() queries.
   */
  includeEphemeral?: boolean;
}

/**
 * Extended filter for document queries.
 * Includes all ElementFilter options plus document-specific filters.
 */
export interface DocumentFilter extends ElementFilter {
  /** Filter by content type(s) */
  contentType?: ContentType | ContentType[];
  /** Filter by exact version number */
  version?: number;
  /** Filter by minimum version (inclusive) */
  minVersion?: number;
  /** Filter by maximum version (inclusive) */
  maxVersion?: number;
  /** Filter by document category(ies) */
  category?: DocumentCategory | DocumentCategory[];
  /** Filter by document status(es) */
  status?: DocumentStatus | DocumentStatus[];
}

/**
 * Options for FTS5 full-text search.
 */
export interface FTSSearchOptions {
  /** Filter by document category(ies) */
  category?: DocumentCategory | DocumentCategory[];
  /** Filter by document status(es) (default: active only) */
  status?: DocumentStatus | DocumentStatus[];
  /** Hard cap on results before adaptive filtering. Default: 50 */
  hardCap?: number;
  /** Sensitivity for elbow detection (higher = more aggressive cutoff). Default: 1.5 */
  elbowSensitivity?: number;
  /** Minimum results to return. Default: 1 */
  minResults?: number;
}

/**
 * A single FTS search result with score and snippet.
 */
export interface FTSSearchResult {
  /** The matched document */
  document: Document;
  /** BM25 relevance score (lower = more relevant in SQLite FTS5) */
  score: number;
  /** Highlighted snippet from content */
  snippet: string;
}

/**
 * Extended filter for message queries.
 * Includes all ElementFilter options plus message-specific filters.
 */
export interface MessageFilter extends ElementFilter {
  /** Filter by channel(s) */
  channelId?: ChannelId | ChannelId[];
  /** Filter by sender entity(ies) */
  sender?: EntityId | EntityId[];
  /** Filter by thread (null for root messages only, specific ID for thread replies) */
  threadId?: MessageId | null;
  /** Filter by presence of attachments */
  hasAttachments?: boolean;
}

// ============================================================================
// Hydration Options
// ============================================================================

/**
 * Options for hydrating document references on elements.
 * When enabled, the corresponding Ref field will be resolved
 * and its content will be included in the hydrated result.
 */
export interface HydrationOptions {
  /** Hydrate descriptionRef -> description */
  description?: boolean;
  /** Hydrate contentRef -> content */
  content?: boolean;
  /** Hydrate attachment references */
  attachments?: boolean;
}

/**
 * Options for get operations
 */
export interface GetOptions {
  /** References to hydrate */
  hydrate?: HydrationOptions;
}

// ============================================================================
// Blocked Task Result
// ============================================================================

/**
 * A task that is blocked with details about why.
 * Extends Task with blocking information.
 */
export interface BlockedTask extends Task {
  /** ID of the element blocking this task */
  blockedBy: ElementId;
  /** Human-readable explanation of why this task is blocked */
  blockReason: string;
}

// ============================================================================
// Gate Satisfaction Types
// ============================================================================

/**
 * Result of recording an approval
 */
export interface ApprovalResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Current number of approvals */
  currentCount: number;
  /** Required number of approvals */
  requiredCount: number;
  /** Whether the gate is now satisfied */
  satisfied: boolean;
}

// ============================================================================
// Dependency Tree
// ============================================================================

/**
 * A node in the dependency tree.
 * Represents an element with its incoming and outgoing dependencies.
 */
export interface DependencyTreeNode<T extends Element = Element> {
  /** The element at this node */
  element: T;
  /** Outgoing dependencies (elements this element depends on) */
  dependencies: DependencyTreeNode[];
  /** Incoming dependencies (elements that depend on this element) */
  dependents: DependencyTreeNode[];
}

/**
 * Complete dependency tree for an element.
 * Contains the full graph of dependencies in both directions.
 */
export interface DependencyTree<T extends Element = Element> {
  /** Root element of the tree */
  root: DependencyTreeNode<T>;
  /** Maximum depth traversed in dependencies direction */
  dependencyDepth: number;
  /** Maximum depth traversed in dependents direction */
  dependentDepth: number;
  /** Total number of nodes in the tree */
  nodeCount: number;
}

// ============================================================================
// Dependency Input
// ============================================================================

/**
 * Input for creating a new dependency via the API.
 */
export interface DependencyInput {
  /** Element that is waiting/blocked */
  blockedId: ElementId;
  /** Element doing the blocking/being depended on */
  blockerId: ElementId;
  /** Type of dependency relationship */
  type: DependencyType;
  /** Type-specific metadata */
  metadata?: Record<string, unknown>;
  /** Actor creating the dependency (optional, falls back to blocked element's createdBy) */
  actor?: EntityId;
}

// ============================================================================
// Operation Options with Actor Support
// ============================================================================

/**
 * Options for operations that support actor specification
 */
export interface OperationOptions {
  /** Actor performing the operation (for audit trail) */
  actor?: EntityId;
}

/**
 * Options for update operations
 */
export interface UpdateOptions extends OperationOptions {
  /**
   * Expected updatedAt timestamp for optimistic concurrency control.
   * If provided, the update will fail with CONFLICT error if the element's
   * current updatedAt doesn't match this value, indicating another process
   * modified the element since it was read.
   */
  expectedUpdatedAt?: string;
}

/**
 * Options for delete operations
 */
export interface DeleteOptions extends OperationOptions {
  /** Reason for deletion (stored in audit trail) */
  reason?: string;
}

// ============================================================================
// Plan Task Association Types
// ============================================================================

/**
 * Options for adding a task to a plan
 */
export interface AddTaskToPlanOptions extends OperationOptions {
  /** Use hierarchical ID (el-planid.n) - only valid for newly created tasks */
  useHierarchicalId?: boolean;
}

/**
 * Options for creating a task within a plan
 */
export interface CreateTaskInPlanOptions extends OperationOptions {
  /** Use hierarchical ID (el-planid.n) - default true */
  useHierarchicalId?: boolean;
}

// ============================================================================
// Plan Bulk Operations Types
// ============================================================================

/**
 * Options for bulk close operation
 */
export interface BulkCloseOptions extends OperationOptions {
  /** Reason for closing all tasks */
  closeReason?: string;
  /** Only close tasks matching this filter */
  filter?: TaskFilter;
}

/**
 * Options for bulk defer operation
 */
export interface BulkDeferOptions extends OperationOptions {
  /** Only defer tasks matching this filter */
  filter?: TaskFilter;
}

/**
 * Options for bulk reassign operation
 */
export interface BulkReassignOptions extends OperationOptions {
  /** Only reassign tasks matching this filter */
  filter?: TaskFilter;
}

/**
 * Options for bulk tag operation
 */
export interface BulkTagOptions extends OperationOptions {
  /** Tags to add to all tasks */
  addTags?: string[];
  /** Tags to remove from all tasks */
  removeTags?: string[];
  /** Only tag tasks matching this filter */
  filter?: TaskFilter;
}

/**
 * Result of a bulk operation on plan tasks
 */
export interface BulkOperationResult {
  /** Number of tasks successfully updated */
  updated: number;
  /** Number of tasks skipped (didn't match filter or status) */
  skipped: number;
  /** IDs of tasks that were updated */
  updatedIds: ElementId[];
  /** IDs of tasks that were skipped */
  skippedIds: ElementId[];
  /** Errors encountered during the operation */
  errors: Array<{ taskId: ElementId; message: string }>;
}

// ============================================================================
// Workflow Operations Types
// ============================================================================

/**
 * Options for deleting a workflow
 */
export interface DeleteWorkflowOptions {
  /** Actor performing the delete operation */
  actor?: EntityId;
}

/**
 * Result of deleting a workflow
 */
export interface DeleteWorkflowResult {
  /** ID of the workflow that was deleted */
  workflowId: ElementId;
  /** Number of tasks that were deleted */
  tasksDeleted: number;
  /** Number of dependencies that were deleted */
  dependenciesDeleted: number;
  /** Whether the workflow was ephemeral */
  wasEphemeral: boolean;
}

/**
 * Options for garbage collection
 */
export interface GarbageCollectionOptions {
  /** Maximum age in milliseconds for workflows to be eligible */
  maxAgeMs: number;
  /** Whether to run in dry-run mode (no actual deletion) */
  dryRun?: boolean;
  /** Maximum number of workflows to delete in one run */
  limit?: number;
}

/**
 * Result of garbage collection
 */
export interface GarbageCollectionResult {
  /** Number of workflows that were deleted */
  workflowsDeleted: number;
  /** Number of tasks that were deleted */
  tasksDeleted: number;
  /** Number of dependencies that were deleted */
  dependenciesDeleted: number;
  /** IDs of workflows that were deleted */
  deletedWorkflowIds: ElementId[];
}

/**
 * Options for task garbage collection
 */
export interface TaskGarbageCollectionOptions {
  /** Maximum age in milliseconds for tasks to be eligible (since closedAt/deletedAt) */
  maxAgeMs: number;
  /** Whether to run in dry-run mode (no actual deletion) */
  dryRun?: boolean;
  /** Maximum number of tasks to delete in one run */
  limit?: number;
}

/**
 * Result of task garbage collection
 */
export interface TaskGarbageCollectionResult {
  /** Number of tasks that were deleted */
  tasksDeleted: number;
  /** Number of dependencies that were deleted */
  dependenciesDeleted: number;
  /** IDs of tasks that were deleted */
  deletedTaskIds: ElementId[];
}

/**
 * Extended filter for workflow queries.
 * Includes all ElementFilter options plus workflow-specific filters.
 */
export interface WorkflowFilter extends ElementFilter {
  /** Filter by status(es) */
  status?: WorkflowStatus | WorkflowStatus[];
  /** Filter by ephemeral state */
  ephemeral?: boolean;
  /** Filter by playbook ID */
  playbookId?: string;
}

/**
 * Progress metrics for a workflow
 */
export interface WorkflowProgress {
  /** Workflow identifier */
  workflowId: ElementId;
  /** Total number of tasks in the workflow */
  totalTasks: number;
  /** Task counts by status */
  statusCounts: Record<string, number>;
  /** Completion percentage (0-100) */
  completionPercentage: number;
  /** Number of ready tasks */
  readyTasks: number;
  /** Number of blocked tasks */
  blockedTasks: number;
}

// ============================================================================
// Sync Types
// ============================================================================

/**
 * Export format options
 */
export type ExportFormat = 'jsonl';

/**
 * Options for exporting elements
 */
export interface ExportOptions {
  /** Export format (default: jsonl) */
  format?: ExportFormat;
  /** Element types to export (default: all) */
  types?: ElementType[];
  /** Export only elements modified after this timestamp */
  modifiedAfter?: Timestamp;
  /** Include soft-deleted elements */
  includeDeleted?: boolean;
  /** Export dependencies */
  includeDependencies?: boolean;
  /** Export events */
  includeEvents?: boolean;
  /** Output file path (if not provided, returns string) */
  outputPath?: string;
}

/**
 * Options for importing elements
 */
export interface ImportOptions {
  /** Input file path */
  inputPath?: string;
  /** Raw JSONL data (alternative to inputPath) */
  data?: string;
  /** How to handle conflicts */
  conflictStrategy?: ConflictStrategy;
  /** Whether to validate all data before importing */
  validateFirst?: boolean;
  /** Whether to run in dry-run mode (validate but don't import) */
  dryRun?: boolean;
}

/**
 * Strategy for handling import conflicts
 */
export type ConflictStrategy =
  | 'skip'      // Skip conflicting elements
  | 'overwrite' // Overwrite existing with imported
  | 'error';    // Throw error on conflict

/**
 * A conflict encountered during import
 */
export interface ImportConflict {
  /** ID of the conflicting element */
  elementId: ElementId;
  /** Type of conflict */
  conflictType: 'exists' | 'type_mismatch' | 'validation_failed';
  /** Additional details about the conflict */
  details: string;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Whether the import succeeded */
  success: boolean;
  /** Number of elements imported */
  elementsImported: number;
  /** Number of dependencies imported */
  dependenciesImported: number;
  /** Number of events imported */
  eventsImported: number;
  /** Conflicts encountered */
  conflicts: ImportConflict[];
  /** Errors that occurred */
  errors: string[];
  /** Whether this was a dry run */
  dryRun: boolean;
}

// ============================================================================
// System Statistics
// ============================================================================

/**
 * Count of elements by type
 */
export type ElementCountByType = {
  [K in ElementType]?: number;
};

/**
 * System-wide statistics
 */
export interface SystemStats {
  /** Total number of elements */
  totalElements: number;
  /** Element count broken down by type */
  elementsByType: ElementCountByType;
  /** Total number of dependencies */
  totalDependencies: number;
  /** Total number of events */
  totalEvents: number;
  /** Number of tasks in ready state (open/in_progress, not blocked) */
  readyTasks: number;
  /** Number of blocked tasks */
  blockedTasks: number;
  /** Database file size in bytes */
  databaseSize: number;
  /** When stats were computed */
  computedAt: Timestamp;
}

// ============================================================================
// API Result Types
// ============================================================================

/**
 * Paginated list result
 */
export interface ListResult<T> {
  /** Items in this page */
  items: T[];
  /** Total count of matching items (before pagination) */
  total: number;
  /** Offset used for this page */
  offset: number;
  /** Limit used for this page */
  limit: number;
  /** Whether there are more results */
  hasMore: boolean;
}

// ============================================================================
// Reconstruction Types
// ============================================================================

/**
 * Result of point-in-time state reconstruction.
 */
export interface ReconstructedState<T extends Element = Element> {
  /** The reconstructed element state at the target timestamp */
  element: T;
  /** The timestamp at which the state was reconstructed */
  asOf: Timestamp;
  /** Number of events applied to reconstruct this state */
  eventsApplied: number;
  /** Whether the element existed at this timestamp */
  exists: boolean;
}

/**
 * A snapshot in an element's history timeline.
 */
export interface TimelineSnapshot {
  /** The event that caused this state change */
  event: Event;
  /** The element state after this event was applied */
  state: Record<string, unknown> | null;
  /** Human-readable description of the change */
  summary: string;
}

/**
 * Complete timeline of an element's history.
 */
export interface ElementTimeline {
  /** The element ID */
  elementId: ElementId;
  /** The current state (or null if deleted) */
  currentState: Element | null;
  /** Timeline of all state changes (oldest first) */
  snapshots: TimelineSnapshot[];
  /** Total number of events in the element's history */
  totalEvents: number;
}

// ============================================================================
// Element Input Types
// ============================================================================

/**
 * Base input for creating any element.
 * Type-specific create functions will extend this.
 */
export interface ElementInput {
  /** Optional: Specific ID (if not provided, one will be generated) */
  id?: ElementId;
  /** Entity creating the element */
  createdBy: EntityId;
  /** Initial tags */
  tags?: string[];
  /** Initial metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// QuarryAPI Interface
// ============================================================================

/**
 * The main Stoneforge API interface.
 *
 * Provides type-safe CRUD operations, queries, dependency management,
 * and system administration capabilities.
 *
 * @example
 * ```typescript
 * const api = createQuarryAPI(storage);
 *
 * // Get a task by ID
 * const task = await api.get<Task>(taskId);
 *
 * // List open tasks
 * const tasks = await api.list<Task>({ type: 'task', status: 'open' });
 *
 * // Get ready tasks
 * const ready = await api.ready({ assignee: myEntityId });
 * ```
 */
export interface QuarryAPI {
  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  /**
   * Retrieve a single element by ID.
   *
   * @param id - Element identifier
   * @param options - Hydration options
   * @returns The element or null if not found
   */
  get<T extends Element>(id: ElementId, options?: GetOptions): Promise<T | null>;

  /**
   * Retrieve multiple elements matching a filter.
   *
   * @param filter - Query constraints
   * @returns Array of matching elements
   */
  list<T extends Element>(filter?: ElementFilter): Promise<T[]>;

  /**
   * Retrieve multiple elements with pagination info.
   *
   * @param filter - Query constraints
   * @returns Paginated result with items and metadata
   */
  listPaginated<T extends Element>(filter?: ElementFilter): Promise<ListResult<T>>;

  /**
   * Create a new element.
   *
   * @param input - Element data (type-specific)
   * @returns The created element
   */
  create<T extends Element>(input: ElementInput & Record<string, unknown>): Promise<T>;

  /**
   * Update an existing element.
   *
   * @param id - Element identifier
   * @param updates - Fields to update
   * @param options - Operation options including actor
   * @returns The updated element
   * @throws NotFoundError if element doesn't exist
   * @throws ConstraintError if element is immutable (e.g., Message)
   */
  update<T extends Element>(id: ElementId, updates: Partial<T>, options?: UpdateOptions): Promise<T>;

  /**
   * Soft-delete an element.
   *
   * @param id - Element identifier
   * @param options - Delete options including reason and actor
   * @throws NotFoundError if element doesn't exist
   * @throws ConstraintError if element is immutable
   */
  delete(id: ElementId, options?: DeleteOptions): Promise<void>;

  // --------------------------------------------------------------------------
  // Entity Operations
  // --------------------------------------------------------------------------

  /**
   * Look up an entity by name.
   *
   * @param name - Entity name to look up
   * @returns The entity if found, null otherwise
   */
  lookupEntityByName(name: string): Promise<Element | null>;

  /**
   * Sets the manager (reportsTo) for an entity.
   *
   * @param entityId - The entity to set the manager for
   * @param managerId - The manager entity ID
   * @param actor - Entity performing this action (for audit trail)
   * @returns The updated entity
   * @throws NotFoundError if entity or manager doesn't exist
   * @throws ValidationError if self-reference or manager is deactivated
   * @throws ConflictError if circular chain would be created
   */
  setEntityManager(
    entityId: EntityId,
    managerId: EntityId,
    actor: EntityId
  ): Promise<Element>;

  /**
   * Clears the manager (reportsTo) for an entity.
   *
   * @param entityId - The entity to clear the manager for
   * @param actor - Entity performing this action (for audit trail)
   * @returns The updated entity
   * @throws NotFoundError if entity doesn't exist
   */
  clearEntityManager(
    entityId: EntityId,
    actor: EntityId
  ): Promise<Element>;

  /**
   * Gets all entities that report directly to a manager.
   *
   * @param managerId - The manager entity ID
   * @returns Array of entities that report to the manager
   */
  getDirectReports(managerId: EntityId): Promise<Element[]>;

  /**
   * Gets the management chain for an entity (from entity up to root).
   *
   * @param entityId - The entity to get the management chain for
   * @returns Array of entities in the management chain (empty if no manager)
   * @throws NotFoundError if entity doesn't exist
   */
  getManagementChain(entityId: EntityId): Promise<Element[]>;

  // --------------------------------------------------------------------------
  // Task Operations
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // Plan Operations
  // --------------------------------------------------------------------------

  /**
   * Add an existing task to a plan.
   * Creates a parent-child dependency from the task to the plan.
   *
   * @param taskId - The task to add
   * @param planId - The plan to add the task to
   * @param options - Operation options
   * @returns The created dependency
   * @throws NotFoundError if task or plan doesn't exist
   * @throws ConstraintError if task is already in a plan
   */
  addTaskToPlan(
    taskId: ElementId,
    planId: ElementId,
    options?: AddTaskToPlanOptions
  ): Promise<Dependency>;

  /**
   * Remove a task from a plan.
   * Removes the parent-child dependency.
   *
   * @param taskId - The task to remove
   * @param planId - The plan to remove the task from
   * @param actor - Optional actor for audit trail
   * @throws NotFoundError if task-plan relationship doesn't exist
   */
  removeTaskFromPlan(
    taskId: ElementId,
    planId: ElementId,
    actor?: EntityId
  ): Promise<void>;

  /**
   * Get all tasks in a plan.
   * Returns tasks with parent-child dependency to the plan.
   *
   * @param planId - The plan ID
   * @param filter - Optional task filter constraints
   * @returns Array of tasks in the plan
   * @throws NotFoundError if plan doesn't exist
   */
  getTasksInPlan(planId: ElementId, filter?: TaskFilter): Promise<Task[]>;

  /**
   * Get progress metrics for a plan.
   * Computes task status counts and completion percentage.
   *
   * @param planId - The plan ID
   * @returns Progress metrics for the plan
   * @throws NotFoundError if plan doesn't exist
   */
  getPlanProgress(planId: ElementId): Promise<PlanProgress>;

  /**
   * Create a new task directly in a plan.
   * Automatically creates the task with a hierarchical ID and parent-child dependency.
   *
   * @param planId - The plan to create the task in
   * @param taskInput - Task creation input (without ID - it will be generated)
   * @param options - Operation options
   * @returns The created task with hierarchical ID
   * @throws NotFoundError if plan doesn't exist
   * @throws ConstraintError if plan is not in draft or active status
   */
  createTaskInPlan<T extends Task = Task>(
    planId: ElementId,
    taskInput: Omit<CreateTaskInput, 'id'>,
    options?: CreateTaskInPlanOptions
  ): Promise<T>;

  // --------------------------------------------------------------------------
  // Plan Bulk Operations
  // --------------------------------------------------------------------------

  /**
   * Close all tasks in a plan.
   * Only closes tasks that are not already closed or tombstoned.
   *
   * @param planId - The plan containing the tasks
   * @param options - Bulk operation options including optional filter and close reason
   * @returns Result with counts of updated/skipped tasks
   * @throws NotFoundError if plan doesn't exist
   */
  bulkClosePlanTasks(planId: ElementId, options?: BulkCloseOptions): Promise<BulkOperationResult>;

  /**
   * Defer all tasks in a plan.
   * Only defers tasks that are in open, in_progress, or blocked status.
   *
   * @param planId - The plan containing the tasks
   * @param options - Bulk operation options including optional filter
   * @returns Result with counts of updated/skipped tasks
   * @throws NotFoundError if plan doesn't exist
   */
  bulkDeferPlanTasks(planId: ElementId, options?: BulkDeferOptions): Promise<BulkOperationResult>;

  /**
   * Reassign all tasks in a plan to a new entity.
   *
   * @param planId - The plan containing the tasks
   * @param newAssignee - The entity to assign all tasks to (undefined to unassign)
   * @param options - Bulk operation options including optional filter
   * @returns Result with counts of updated/skipped tasks
   * @throws NotFoundError if plan doesn't exist
   */
  bulkReassignPlanTasks(
    planId: ElementId,
    newAssignee: EntityId | undefined,
    options?: BulkReassignOptions
  ): Promise<BulkOperationResult>;

  /**
   * Add or remove tags from all tasks in a plan.
   *
   * @param planId - The plan containing the tasks
   * @param options - Options including tags to add/remove and optional filter
   * @returns Result with counts of updated/skipped tasks
   * @throws NotFoundError if plan doesn't exist
   */
  bulkTagPlanTasks(planId: ElementId, options: BulkTagOptions): Promise<BulkOperationResult>;

  // --------------------------------------------------------------------------
  // Task Operations
  // --------------------------------------------------------------------------

  /**
   * Get tasks that are ready for work.
   *
   * Ready criteria:
   * - Status is 'open' or 'in_progress'
   * - Not blocked by any dependency
   * - scheduledFor is null or in the past
   * - Not ephemeral (unless includeEphemeral is true)
   *
   * @param filter - Optional task filter constraints
   * @returns Array of ready tasks
   */
  ready(filter?: TaskFilter): Promise<Task[]>;

  /**
   * Get tasks in backlog (not ready for work, needs triage)
   *
   * @param filter - Optional task filter constraints
   * @returns Array of backlog tasks
   */
  backlog(filter?: TaskFilter): Promise<Task[]>;

  /**
   * Get blocked tasks with blocking details.
   *
   * @param filter - Optional task filter constraints
   * @returns Array of blocked tasks with block reasons
   */
  blocked(filter?: TaskFilter): Promise<BlockedTask[]>;

  // --------------------------------------------------------------------------
  // Dependency Operations
  // --------------------------------------------------------------------------

  /**
   * Create a new dependency between elements.
   *
   * @param dep - Dependency data
   * @returns The created dependency
   * @throws NotFoundError if source element doesn't exist
   * @throws ConflictError if dependency would create a cycle
   * @throws ConflictError if dependency already exists
   */
  addDependency(dep: DependencyInput): Promise<Dependency>;

  /**
   * Remove a dependency.
   *
   * @param blockedId - Blocked element
   * @param blockerId - Blocker element
   * @param type - Dependency type
   * @param actor - Optional actor for the event (defaults to dependency creator)
   * @throws NotFoundError if dependency doesn't exist
   */
  removeDependency(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType,
    actor?: EntityId
  ): Promise<void>;

  /**
   * Get dependencies of an element (outgoing edges).
   *
   * @param id - Element ID
   * @param types - Optional filter by dependency type(s)
   * @returns Array of dependencies
   */
  getDependencies(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;

  /**
   * Get dependents of an element (incoming edges).
   *
   * @param id - Element ID
   * @param types - Optional filter by dependency type(s)
   * @returns Array of dependencies where this element is the target
   */
  getDependents(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;

  /**
   * Get the full dependency tree for an element.
   *
   * @param id - Root element ID
   * @returns Complete dependency tree in both directions
   */
  getDependencyTree(id: ElementId): Promise<DependencyTree>;

  // --------------------------------------------------------------------------
  // Gate Satisfaction
  // --------------------------------------------------------------------------

  /**
   * Mark an external or webhook gate as satisfied.
   * Used to indicate that an external system or webhook has completed.
   *
   * @param blockedId - Element that has the awaits dependency
   * @param blockerId - Blocker element ID of the awaits dependency
   * @param actor - Entity marking the gate as satisfied
   * @returns True if gate was found and satisfied, false if not found or wrong type
   */
  satisfyGate(blockedId: ElementId, blockerId: ElementId, actor: EntityId): Promise<boolean>;

  /**
   * Record an approval for an approval gate.
   * Updates the dependency metadata with the new approver.
   *
   * @param blockedId - Element that has the awaits dependency
   * @param blockerId - Blocker element ID of the awaits dependency
   * @param approver - Entity recording their approval
   * @returns Result indicating success and current approval status
   */
  recordApproval(blockedId: ElementId, blockerId: ElementId, approver: EntityId): Promise<ApprovalResult>;

  /**
   * Remove an approval from an approval gate.
   *
   * @param blockedId - Element that has the awaits dependency
   * @param blockerId - Blocker element ID of the awaits dependency
   * @param approver - Entity removing their approval
   * @returns Result indicating success and current approval status
   */
  removeApproval(blockedId: ElementId, blockerId: ElementId, approver: EntityId): Promise<ApprovalResult>;

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Full-text search across elements.
   *
   * Searches:
   * - Element titles (Tasks, Plans, etc.)
   * - Element content (via Documents)
   * - Tags
   *
   * @param query - Search text
   * @param filter - Additional filter constraints
   * @returns Array of matching elements
   */
  search(query: string, filter?: ElementFilter): Promise<Element[]>;

  /**
   * Full-text search documents using FTS5 with adaptive top-K.
   *
   * Uses the FTS5 virtual table for BM25-ranked search with snippet generation.
   * Applies adaptive elbow detection to return a natural number of results.
   *
   * @param query - Search query text
   * @param options - Search options (category, status, limits, sensitivity)
   * @returns Array of search results with scores and snippets
   */
  searchDocumentsFTS(query: string, options?: FTSSearchOptions): Promise<FTSSearchResult[]>;

  /**
   * Archive a document (sets status to 'archived').
   *
   * @param id - Document ID
   * @returns The updated document
   * @throws NotFoundError if document doesn't exist or element is not a document
   */
  archiveDocument(id: ElementId): Promise<Document>;

  /**
   * Unarchive a document (sets status back to 'active').
   *
   * @param id - Document ID
   * @returns The updated document
   * @throws NotFoundError if document doesn't exist or element is not a document
   */
  unarchiveDocument(id: ElementId): Promise<Document>;

  /**
   * Register an EmbeddingService for automatic document embedding on create/update/delete.
   * This is opt-in: embeddings are only generated when a service is registered.
   *
   * @param service - The embedding service to use for auto-indexing
   */
  registerEmbeddingService(service: EmbeddingService): void;

  /**
   * Rebuild FTS index for all documents without creating version history entries.
   * Use after import/sync or when search results seem stale.
   *
   * @returns Count of indexed documents and errors
   */
  reindexAllDocumentsFTS(): { indexed: number; errors: number };

  // --------------------------------------------------------------------------
  // History Operations
  // --------------------------------------------------------------------------

  /**
   * Get audit events for an element.
   *
   * @param id - Element ID
   * @param filter - Optional event filter
   * @returns Array of events (newest first)
   */
  getEvents(id: ElementId, filter?: EventFilter): Promise<Event[]>;

  /**
   * List all events across all elements.
   *
   * @param filter - Optional event filter (including elementId filter, event types, actor, time range)
   * @returns Array of events (newest first)
   */
  listEvents(filter?: EventFilter): Promise<Event[]>;

  /**
   * Count events matching a filter.
   *
   * @param filter - Optional event filter (including elementId filter, event types, actor, time range)
   * @returns Total count of matching events
   */
  countEvents(filter?: EventFilter): Promise<number>;

  /**
   * Get a specific version of a document.
   *
   * @param id - Document ID
   * @param version - Version number
   * @returns The document at that version, or null if not found
   */
  getDocumentVersion(id: DocumentId, version: number): Promise<Document | null>;

  /**
   * Get the full version history of a document.
   *
   * @param id - Document ID
   * @returns Array of document versions (newest first)
   */
  getDocumentHistory(id: DocumentId): Promise<Document[]>;

  /**
   * Reconstruct an element's state at a specific point in time.
   *
   * Algorithm:
   * 1. Find the creation event for the element
   * 2. Apply all events up to the target timestamp
   * 3. Return the reconstructed state
   *
   * @param id - Element ID
   * @param asOf - Target timestamp to reconstruct state at
   * @returns Reconstructed state, or null if element didn't exist at that time
   * @throws NotFoundError if element has no events (never existed)
   */
  reconstructAtTime<T extends Element = Element>(
    id: ElementId,
    asOf: Timestamp
  ): Promise<ReconstructedState<T> | null>;

  /**
   * Generate a complete timeline of an element's history.
   *
   * Shows the evolution of the element through all its events,
   * with state snapshots after each event.
   *
   * @param id - Element ID
   * @param filter - Optional event filter (e.g., limit to certain event types)
   * @returns Element timeline with snapshots
   * @throws NotFoundError if element has no events (never existed)
   */
  getElementTimeline(id: ElementId, filter?: EventFilter): Promise<ElementTimeline>;

  // --------------------------------------------------------------------------
  // Channel Operations
  // --------------------------------------------------------------------------

  /**
   * Find an existing direct channel between two entities, or create one if it doesn't exist.
   *
   * @param entityA - First entity
   * @param entityB - Second entity
   * @param actor - Actor performing the operation (must be one of the entities)
   * @returns The channel (existing or newly created) and whether it was created
   */
  findOrCreateDirectChannel(
    entityA: EntityId,
    entityB: EntityId,
    actor: EntityId
  ): Promise<FindOrCreateDirectChannelResult>;

  /**
   * Add a member to a channel.
   *
   * @param channelId - The channel to add the member to
   * @param entityId - The entity to add as a member
   * @param options - Operation options including actor
   * @returns The result of the operation
   * @throws NotFoundError if channel doesn't exist
   * @throws ConstraintError if channel is a direct channel (immutable membership)
   * @throws ConstraintError if actor doesn't have permission to modify members
   */
  addChannelMember(
    channelId: ElementId,
    entityId: EntityId,
    options?: AddMemberOptions
  ): Promise<MembershipResult>;

  /**
   * Remove a member from a channel.
   *
   * @param channelId - The channel to remove the member from
   * @param entityId - The entity to remove
   * @param options - Operation options including actor and reason
   * @returns The result of the operation
   * @throws NotFoundError if channel doesn't exist
   * @throws ConstraintError if channel is a direct channel (immutable membership)
   * @throws ConstraintError if actor doesn't have permission to modify members
   * @throws ConstraintError if entity is not a member
   */
  removeChannelMember(
    channelId: ElementId,
    entityId: EntityId,
    options?: RemoveMemberOptions
  ): Promise<MembershipResult>;

  /**
   * Leave a channel (remove self from members).
   *
   * @param channelId - The channel to leave
   * @param actor - The entity leaving the channel
   * @returns The result of the operation
   * @throws NotFoundError if channel doesn't exist
   * @throws ConstraintError if channel is a direct channel (cannot leave)
   * @throws ConstraintError if actor is not a member
   */
  leaveChannel(channelId: ElementId, actor: EntityId): Promise<MembershipResult>;

  /**
   * Search for channels by name, with optional filtering.
   *
   * Searches channel names using pattern matching and allows filtering by
   * channel type, visibility, join policy, and membership.
   *
   * @param query - Search text to match against channel names
   * @param filter - Optional filter constraints (channelType, visibility, joinPolicy, member)
   * @returns Array of matching channels (up to 100 results, newest first)
   */
  searchChannels(query: string, filter?: ChannelFilter): Promise<Channel[]>;

  /**
   * Merge two group channels: move all messages from source to target,
   * merge member lists, and archive the source channel.
   */
  mergeChannels(
    sourceId: ElementId,
    targetId: ElementId,
    options?: { newName?: string; actor?: EntityId }
  ): Promise<{ target: Channel; sourceArchived: boolean; messagesMoved: number }>;

  // --------------------------------------------------------------------------
  // Team Operations
  // --------------------------------------------------------------------------

  /**
   * Add a member to a team with event recording.
   *
   * @param teamId - The team to add the member to
   * @param entityId - The entity to add as a member
   * @param options - Operation options including actor
   * @returns The result of the operation
   * @throws NotFoundError if team doesn't exist
   * @throws ConstraintError if team is deleted
   * @throws ConstraintError if entity is already a member
   */
  addTeamMember(
    teamId: ElementId,
    entityId: EntityId,
    options?: AddMemberOptions
  ): Promise<TeamMembershipResult>;

  /**
   * Remove a member from a team with event recording.
   *
   * @param teamId - The team to remove the member from
   * @param entityId - The entity to remove
   * @param options - Operation options including actor and reason
   * @returns The result of the operation
   * @throws NotFoundError if team doesn't exist
   * @throws ConstraintError if team is deleted
   * @throws ConstraintError if entity is not a member
   */
  removeTeamMember(
    teamId: ElementId,
    entityId: EntityId,
    options?: RemoveMemberOptions
  ): Promise<TeamMembershipResult>;

  /**
   * Get tasks assigned to a team or its members.
   *
   * @param teamId - The team identifier
   * @param options - Filter options
   * @returns Tasks assigned to the team or its members
   * @throws NotFoundError if team doesn't exist
   */
  getTasksForTeam(teamId: ElementId, options?: TaskFilter): Promise<Task[]>;

  /**
   * Claim a team-assigned task for an individual member.
   * Updates the task's assignee from the team to the claiming entity.
   *
   * @param taskId - The task to claim
   * @param entityId - The entity claiming the task
   * @param options - Operation options including actor
   * @returns The updated task
   * @throws NotFoundError if task doesn't exist
   * @throws ConstraintError if task is not assigned to a team
   * @throws ConstraintError if entity is not a member of the team
   */
  claimTaskFromTeam(
    taskId: ElementId,
    entityId: EntityId,
    options?: OperationOptions
  ): Promise<Task>;

  /**
   * Get aggregated metrics for a team.
   *
   * @param teamId - The team identifier
   * @returns Team metrics
   * @throws NotFoundError if team doesn't exist
   */
  getTeamMetrics(teamId: ElementId): Promise<TeamMetrics>;

  // --------------------------------------------------------------------------
  // Workflow Operations
  // --------------------------------------------------------------------------

  /**
   * Delete a workflow and all its child tasks.
   * This is a hard delete that removes the workflow, all its tasks, and their dependencies.
   *
   * @param workflowId - The workflow to delete
   * @param options - Operation options including actor
   * @returns Result with counts of deleted elements
   * @throws NotFoundError if workflow doesn't exist
   */
  deleteWorkflow(workflowId: ElementId, options?: DeleteWorkflowOptions): Promise<DeleteWorkflowResult>;

  /**
   * Run garbage collection on ephemeral workflows.
   * Deletes ephemeral workflows that are in terminal state and older than maxAgeMs.
   *
   * @param options - GC configuration including maxAgeMs
   * @returns Result with counts of deleted elements
   */
  garbageCollectWorkflows(options: GarbageCollectionOptions): Promise<GarbageCollectionResult>;

  /**
   * Garbage collect ephemeral tasks.
   * Deletes ephemeral tasks that are in terminal state (closed or tombstone) and older than maxAgeMs.
   * Only affects standalone ephemeral tasks - tasks belonging to workflows should be cleaned up via
   * garbageCollectWorkflows() instead.
   *
   * @param options - GC configuration including maxAgeMs
   * @returns Result with counts of deleted elements
   */
  garbageCollectTasks(options: TaskGarbageCollectionOptions): Promise<TaskGarbageCollectionResult>;

  /**
   * Get all tasks in a workflow.
   * Returns tasks with parent-child dependency to the workflow.
   *
   * @param workflowId - The workflow ID
   * @param filter - Optional task filter constraints
   * @returns Array of tasks in the workflow
   * @throws NotFoundError if workflow doesn't exist
   */
  getTasksInWorkflow(workflowId: ElementId, filter?: TaskFilter): Promise<Task[]>;

  /**
   * Get ready tasks in a workflow.
   * Returns tasks that are ready for work (open/in_progress, not blocked, not scheduled for future).
   *
   * @param workflowId - The workflow ID
   * @param filter - Optional task filter constraints
   * @returns Array of ready tasks in the workflow
   * @throws NotFoundError if workflow doesn't exist
   */
  getReadyTasksInWorkflow(workflowId: ElementId, filter?: TaskFilter): Promise<Task[]>;

  /**
   * Get progress metrics for a workflow.
   * Computes task status counts and completion percentage.
   *
   * @param workflowId - The workflow ID
   * @returns Progress metrics for the workflow
   * @throws NotFoundError if workflow doesn't exist
   */
  getWorkflowProgress(workflowId: ElementId): Promise<WorkflowProgress>;

  /**
   * Get tasks in a workflow ordered by execution order (topological sort).
   * Tasks are ordered such that blockers come before the tasks they block.
   * This represents the order in which tasks should be executed.
   *
   * @param workflowId - The workflow ID
   * @param filter - Optional task filter constraints
   * @returns Tasks in execution order (topological sort based on blocks dependencies)
   * @throws NotFoundError if workflow doesn't exist
   */
  getOrderedTasksInWorkflow(workflowId: ElementId, filter?: TaskFilter): Promise<Task[]>;

  // --------------------------------------------------------------------------
  // Sync Operations
  // --------------------------------------------------------------------------

  /**
   * Export elements to JSONL format.
   *
   * @param options - Export configuration
   * @returns JSONL string if no outputPath specified
   */
  export(options?: ExportOptions): Promise<string | void>;

  /**
   * Import elements from JSONL format.
   *
   * @param options - Import configuration
   * @returns Import result with counts and any errors
   */
  import(options: ImportOptions): Promise<ImportResult>;

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get system statistics.
   *
   * @returns Current system statistics
   */
  stats(): Promise<SystemStats>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid SortDirection
 */
export function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc';
}

/**
 * Check if a value is a valid ConflictStrategy
 */
export function isConflictStrategy(value: unknown): value is ConflictStrategy {
  return value === 'skip' || value === 'overwrite' || value === 'error';
}

/**
 * Check if a value is a valid ExportFormat
 */
export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'jsonl';
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate an ElementFilter object
 */
export function isValidElementFilter(value: unknown): value is ElementFilter {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check limit is positive number if present
  if (obj.limit !== undefined) {
    if (typeof obj.limit !== 'number' || obj.limit < 0 || !Number.isInteger(obj.limit)) {
      return false;
    }
  }

  // Check offset is non-negative number if present
  if (obj.offset !== undefined) {
    if (typeof obj.offset !== 'number' || obj.offset < 0 || !Number.isInteger(obj.offset)) {
      return false;
    }
  }

  // Check orderDir is valid if present
  if (obj.orderDir !== undefined && !isSortDirection(obj.orderDir)) {
    return false;
  }

  // Check tags is array of strings if present
  if (obj.tags !== undefined) {
    if (!Array.isArray(obj.tags) || !obj.tags.every(t => typeof t === 'string')) {
      return false;
    }
  }

  // Check tagsAny is array of strings if present
  if (obj.tagsAny !== undefined) {
    if (!Array.isArray(obj.tagsAny) || !obj.tagsAny.every(t => typeof t === 'string')) {
      return false;
    }
  }

  // Check includeDeleted is boolean if present
  if (obj.includeDeleted !== undefined && typeof obj.includeDeleted !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validate a TaskFilter object
 */
export function isValidTaskFilter(value: unknown): value is TaskFilter {
  if (!isValidElementFilter(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check hasDeadline is boolean if present
  if (obj.hasDeadline !== undefined && typeof obj.hasDeadline !== 'boolean') {
    return false;
  }

  // Check includeEphemeral is boolean if present
  if (obj.includeEphemeral !== undefined && typeof obj.includeEphemeral !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validate a DocumentFilter object
 */
export function isValidDocumentFilter(value: unknown): value is DocumentFilter {
  if (!isValidElementFilter(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check version is a positive integer if present
  if (obj.version !== undefined) {
    if (typeof obj.version !== 'number' || obj.version < 1 || !Number.isInteger(obj.version)) {
      return false;
    }
  }

  // Check minVersion is a positive integer if present
  if (obj.minVersion !== undefined) {
    if (typeof obj.minVersion !== 'number' || obj.minVersion < 1 || !Number.isInteger(obj.minVersion)) {
      return false;
    }
  }

  // Check maxVersion is a positive integer if present
  if (obj.maxVersion !== undefined) {
    if (typeof obj.maxVersion !== 'number' || obj.maxVersion < 1 || !Number.isInteger(obj.maxVersion)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a GetOptions object
 */
export function isValidGetOptions(value: unknown): value is GetOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj.hydrate !== undefined) {
    if (typeof obj.hydrate !== 'object' || obj.hydrate === null) {
      return false;
    }

    const hydrate = obj.hydrate as Record<string, unknown>;

    // All hydration options should be boolean if present
    for (const key of ['description', 'content', 'attachments']) {
      if (hydrate[key] !== undefined && typeof hydrate[key] !== 'boolean') {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate ExportOptions
 */
export function isValidExportOptions(value: unknown): value is ExportOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj.format !== undefined && !isExportFormat(obj.format)) {
    return false;
  }

  if (obj.includeDeleted !== undefined && typeof obj.includeDeleted !== 'boolean') {
    return false;
  }

  if (obj.includeDependencies !== undefined && typeof obj.includeDependencies !== 'boolean') {
    return false;
  }

  if (obj.includeEvents !== undefined && typeof obj.includeEvents !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validate ImportOptions
 */
export function isValidImportOptions(value: unknown): value is ImportOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Must have either inputPath or data
  if (obj.inputPath === undefined && obj.data === undefined) {
    return false;
  }

  if (obj.inputPath !== undefined && typeof obj.inputPath !== 'string') {
    return false;
  }

  if (obj.data !== undefined && typeof obj.data !== 'string') {
    return false;
  }

  if (obj.conflictStrategy !== undefined && !isConflictStrategy(obj.conflictStrategy)) {
    return false;
  }

  if (obj.validateFirst !== undefined && typeof obj.validateFirst !== 'boolean') {
    return false;
  }

  if (obj.dryRun !== undefined && typeof obj.dryRun !== 'boolean') {
    return false;
  }

  return true;
}

// ============================================================================
// Channel Types
// ============================================================================

import type { Channel, ChannelType, Visibility, JoinPolicy } from '@stoneforge/core';

/**
 * Filter for channel queries
 */
export interface ChannelFilter extends ElementFilter {
  /** Filter by channel type (direct or group) */
  channelType?: ChannelType;
  /** Filter by visibility */
  visibility?: Visibility;
  /** Filter by join policy */
  joinPolicy?: JoinPolicy;
  /** Filter channels containing a specific member */
  member?: EntityId;
}

/**
 * Options for adding a member to a channel
 */
export interface AddMemberOptions extends OperationOptions {
  // Future: add invitation metadata, etc.
}

/**
 * Options for removing a member from a channel
 */
export interface RemoveMemberOptions extends OperationOptions {
  /** Reason for removal */
  reason?: string;
}

/**
 * Result of a channel membership operation
 */
export interface MembershipResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The updated channel */
  channel: Channel;
  /** The entity that was added/removed */
  entityId: EntityId;
}

/**
 * Result of find-or-create direct channel operation
 */
export interface FindOrCreateDirectChannelResult {
  /** The channel (existing or newly created) */
  channel: Channel;
  /** Whether a new channel was created */
  created: boolean;
}

/**
 * Input for sending a direct message
 */
export interface SendDirectMessageInput {
  /** The recipient entity ID */
  recipient: EntityId;
  /** Reference to content Document (must be created first) */
  contentRef: DocumentId;
  /** Optional: References to attachment Documents */
  attachments?: DocumentId[];
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of sending a direct message
 */
export interface SendDirectMessageResult {
  /** The created message */
  message: Message;
  /** The channel used (existing or newly created) */
  channel: Channel;
  /** Whether a new channel was created for this message */
  channelCreated: boolean;
}

// ============================================================================
// Team Types
// ============================================================================

/**
 * Result of a team membership operation
 */
export interface TeamMembershipResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The updated team */
  team: Team;
  /** The entity that was added/removed */
  entityId: EntityId;
}

/**
 * Team metrics aggregation
 */
export interface TeamMetrics {
  /** Team identifier */
  teamId: ElementId;
  /** Number of tasks completed by team members */
  tasksCompleted: number;
  /** Number of tasks currently in progress */
  tasksInProgress: number;
  /** Number of tasks assigned to team or members */
  totalTasks: number;
  /** Tasks assigned directly to the team */
  tasksAssignedToTeam: number;
  /** Average time from task open to close (ms) */
  averageCycleTimeMs: number | null;
}

// ============================================================================
// Default Values
// ============================================================================

/** Default page size for list queries */
export const DEFAULT_PAGE_SIZE = 10000;

/** Maximum page size for list queries */
export const MAX_PAGE_SIZE = 10000;

/** Default conflict strategy for imports */
export const DEFAULT_CONFLICT_STRATEGY: ConflictStrategy = 'error';

/** Default export format */
export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'jsonl';
