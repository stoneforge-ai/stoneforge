/**
 * Stoneforge API Implementation
 *
 * This module provides the concrete implementation of the QuarryAPI interface,
 * connecting the type system to the storage layer with full CRUD operations.
 */

import type { StorageBackend } from '@stoneforge/storage';
import type {
  Element,
  ElementId,
  EntityId,
  ElementType,
  Timestamp,
  Task,
  HydratedTask,
  TaskStatus,
  Document,
  DocumentId,
  Dependency,
  DependencyType,
  Event,
  EventFilter,
  EventType,
  Channel,
  Message,
  MessageId,
  HydratedMessage,
  ChannelId as MessageChannelId,
  Library,
  HydratedLibrary,
  Team,
  Plan,
  Workflow,
  PlanProgress,
  Entity,
  CreateTaskInput,
  OrgChartNode,
} from '@stoneforge/core';
import {
  isDocument,
  reconstructStateAtTime,
  generateTimelineSnapshots,
  createTimestamp,
  isTask,
  TaskStatus as TaskStatusEnum,
  isPlan,
  PlanStatus as PlanStatusEnum,
  calculatePlanProgress,
  createEvent,
  LifecycleEventType,
  MembershipEventType,
  NotFoundError,
  ConflictError,
  ConstraintError,
  StorageError,
  ValidationError,
  ErrorCode,
  ChannelTypeValue,
  createDirectChannel,
  isMember,
  canModifyMembers,
  isDirectChannel,
  DirectChannelMembershipError,
  NotAMemberError,
  CannotModifyMembersError,
  createMessage,
  isMessage,
  isLibrary,
  isTeamDeleted,
  TeamStatusEnum,
  isTeamMember,
  extractMentionedNames,
  validateMentions,
  InboxSourceType,
  isWorkflow,
  WorkflowStatus as WorkflowStatusEnum,
  generateChildId,
  createTask,
  validateManager,
  getManagementChain as getManagementChainUtil,
  buildOrgChart,
  updateEntity,
  isEntityActive,
} from '@stoneforge/core';
import { BlockedCacheService, createBlockedCacheService } from '../services/blocked-cache.js';
import { PriorityService, createPriorityService } from '../services/priority-service.js';
import { InboxService, createInboxService } from '../services/inbox.js';
import { SyncService } from '../sync/service.js';
import { computeContentHashSync } from '../sync/hash.js';
import type {
  QuarryAPI,
  ElementFilter,
  TaskFilter,
  ChannelFilter,
  DocumentFilter,
  MessageFilter,
  GetOptions,
  HydrationOptions,
  BlockedTask,
  DependencyTree,
  DependencyTreeNode,
  DependencyInput,
  ListResult,
  ImportResult,
  ImportOptions,
  ExportOptions,
  SystemStats,
  ElementCountByType,
  UpdateOptions,
  DeleteOptions,
  AddTaskToPlanOptions,
  CreateTaskInPlanOptions,
  BulkCloseOptions,
  BulkDeferOptions,
  BulkReassignOptions,
  BulkTagOptions,
  BulkOperationResult,
  DeleteWorkflowOptions,
  DeleteWorkflowResult,
  GarbageCollectionOptions,
  GarbageCollectionResult,
  TaskGarbageCollectionOptions,
  TaskGarbageCollectionResult,
  TeamMembershipResult,
  TeamMetrics,
  OperationOptions,
  ReconstructedState,
  ElementTimeline,
  TimelineSnapshot,
  WorkflowProgress,
  FTSSearchOptions,
  FTSSearchResult,
} from './types.js';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type ApprovalResult,
  type AddMemberOptions,
  type RemoveMemberOptions,
  type MembershipResult,
  type FindOrCreateDirectChannelResult,
  type SendDirectMessageInput,
  type SendDirectMessageResult,
} from './types.js';
import { applyAdaptiveTopK, escapeFts5Query } from '../services/search-utils.js';
import type { EmbeddingService } from '../services/embeddings/service.js';

// ============================================================================
// Database Row Types
// ============================================================================

interface ElementRow {
  id: string;
  type: string;
  data: string;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string | null;
  [key: string]: unknown;
}

interface TagRow {
  element_id: string;
  tag: string;
  [key: string]: unknown;
}

interface DependencyRow {
  blocked_id: string;
  blocker_id: string;
  type: string;
  created_at: string;
  created_by: string;
  metadata: string | null;
  [key: string]: unknown;
}

interface EventRow {
  id: number;
  element_id: string;
  event_type: string;
  actor: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface BlockedCacheRow {
  element_id: string;
  blocked_by: string;
  reason: string | null;
  [key: string]: unknown;
}

interface CountRow {
  count: number;
  [key: string]: unknown;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Serialize an element to database format
 */
function serializeElement(element: Element): {
  id: string;
  type: string;
  data: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string | null;
} {
  // Extract base element fields and type-specific data
  const { id, type, createdAt, updatedAt, createdBy, tags, metadata, ...typeData } = element;

  // Store type-specific fields in data JSON
  const data = JSON.stringify({
    ...typeData,
    tags,
    metadata,
  });

  // Check for deletedAt (tombstone status)
  const deletedAt = 'deletedAt' in element ? (element as { deletedAt?: string }).deletedAt : null;

  // Compute content hash for conflict detection
  const { hash: contentHash } = computeContentHashSync(element);

  return {
    id,
    type,
    data,
    content_hash: contentHash,
    created_at: createdAt,
    updated_at: updatedAt,
    created_by: createdBy,
    deleted_at: deletedAt ?? null,
  };
}

/**
 * Deserialize a database row to an element
 */
function deserializeElement<T extends Element>(row: ElementRow, tags: string[]): T | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(row.data);
  } catch (error) {
    console.warn(`[stoneforge] Corrupt data for element ${row.id}, skipping:`, error);
    return null;
  }

  return {
    id: row.id as ElementId,
    type: row.type as ElementType,
    createdAt: row.created_at as Timestamp,
    updatedAt: row.updated_at as Timestamp,
    createdBy: row.created_by as EntityId,
    tags,
    metadata: data.metadata ?? {},
    ...data,
  } as T;
}

/**
 * Build WHERE clause from ElementFilter
 */
function buildWhereClause(
  filter: ElementFilter,
  params: unknown[]
): { where: string; params: unknown[] } {
  const conditions: string[] = [];

  // Type filter
  if (filter.type !== undefined) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    const placeholders = types.map(() => '?').join(', ');
    conditions.push(`e.type IN (${placeholders})`);
    params.push(...types);
  }

  // Creator filter
  if (filter.createdBy !== undefined) {
    conditions.push('e.created_by = ?');
    params.push(filter.createdBy);
  }

  // Created date filters
  if (filter.createdAfter !== undefined) {
    conditions.push('e.created_at >= ?');
    params.push(filter.createdAfter);
  }
  if (filter.createdBefore !== undefined) {
    conditions.push('e.created_at < ?');
    params.push(filter.createdBefore);
  }

  // Updated date filters
  if (filter.updatedAfter !== undefined) {
    conditions.push('e.updated_at >= ?');
    params.push(filter.updatedAfter);
  }
  if (filter.updatedBefore !== undefined) {
    conditions.push('e.updated_at < ?');
    params.push(filter.updatedBefore);
  }

  // Include deleted filter
  if (!filter.includeDeleted) {
    conditions.push('e.deleted_at IS NULL');
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  return { where, params };
}

/**
 * Build task-specific WHERE clause additions
 */
function buildTaskWhereClause(
  filter: TaskFilter,
  params: unknown[]
): { where: string; params: unknown[] } {
  const conditions: string[] = [];

  // Status filter
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    // Status is stored in data JSON, use JSON_EXTRACT
    const statusConditions = statuses.map(() => "JSON_EXTRACT(e.data, '$.status') = ?").join(' OR ');
    conditions.push(`(${statusConditions})`);
    params.push(...statuses);
  }

  // Priority filter
  if (filter.priority !== undefined) {
    const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
    const priorityConditions = priorities.map(() => "JSON_EXTRACT(e.data, '$.priority') = ?").join(' OR ');
    conditions.push(`(${priorityConditions})`);
    params.push(...priorities);
  }

  // Complexity filter
  if (filter.complexity !== undefined) {
    const complexities = Array.isArray(filter.complexity) ? filter.complexity : [filter.complexity];
    const complexityConditions = complexities.map(() => "JSON_EXTRACT(e.data, '$.complexity') = ?").join(' OR ');
    conditions.push(`(${complexityConditions})`);
    params.push(...complexities);
  }

  // Assignee filter
  if (filter.assignee !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.assignee') = ?");
    params.push(filter.assignee);
  }

  // Owner filter
  if (filter.owner !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.owner') = ?");
    params.push(filter.owner);
  }

  // Task type filter
  if (filter.taskType !== undefined) {
    const taskTypes = Array.isArray(filter.taskType) ? filter.taskType : [filter.taskType];
    const typeConditions = taskTypes.map(() => "JSON_EXTRACT(e.data, '$.taskType') = ?").join(' OR ');
    conditions.push(`(${typeConditions})`);
    params.push(...taskTypes);
  }

  // Deadline filters
  if (filter.hasDeadline !== undefined) {
    if (filter.hasDeadline) {
      conditions.push("JSON_EXTRACT(e.data, '$.deadline') IS NOT NULL");
    } else {
      conditions.push("JSON_EXTRACT(e.data, '$.deadline') IS NULL");
    }
  }
  if (filter.deadlineBefore !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.deadline') < ?");
    params.push(filter.deadlineBefore);
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '';
  return { where, params };
}

/**
 * Build channel-specific WHERE clause additions
 */
function buildChannelWhereClause(
  filter: ChannelFilter,
  params: unknown[]
): { where: string; params: unknown[] } {
  const conditions: string[] = [];

  // Channel type filter (direct or group)
  if (filter.channelType !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.channelType') = ?");
    params.push(filter.channelType);
  }

  // Visibility filter
  if (filter.visibility !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.permissions.visibility') = ?");
    params.push(filter.visibility);
  }

  // Join policy filter
  if (filter.joinPolicy !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.permissions.joinPolicy') = ?");
    params.push(filter.joinPolicy);
  }

  // Member filter - check if entity is in members array
  if (filter.member !== undefined) {
    // Using LIKE for JSON array membership check
    conditions.push("JSON_EXTRACT(e.data, '$.members') LIKE ?");
    params.push(`%"${filter.member}"%`);
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '';
  return { where, params };
}

/**
 * Build document-specific WHERE clause additions
 */
function buildDocumentWhereClause(
  filter: DocumentFilter,
  params: unknown[]
): { where: string; params: unknown[] } {
  const conditions: string[] = [];

  // Content type filter
  if (filter.contentType !== undefined) {
    const contentTypes = Array.isArray(filter.contentType) ? filter.contentType : [filter.contentType];
    const typeConditions = contentTypes.map(() => "JSON_EXTRACT(e.data, '$.contentType') = ?").join(' OR ');
    conditions.push(`(${typeConditions})`);
    params.push(...contentTypes);
  }

  // Exact version filter
  if (filter.version !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.version') = ?");
    params.push(filter.version);
  }

  // Minimum version filter (inclusive)
  if (filter.minVersion !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.version') >= ?");
    params.push(filter.minVersion);
  }

  // Maximum version filter (inclusive)
  if (filter.maxVersion !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.version') <= ?");
    params.push(filter.maxVersion);
  }

  // Category filter
  if (filter.category !== undefined) {
    const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
    const catConditions = categories.map(() => "JSON_EXTRACT(e.data, '$.category') = ?").join(' OR ');
    conditions.push(`(${catConditions})`);
    params.push(...categories);
  }

  // Status filter (default: active only)
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    const statusConditions = statuses.map(() => "JSON_EXTRACT(e.data, '$.status') = ?").join(' OR ');
    conditions.push(`(${statusConditions})`);
    params.push(...statuses);
  } else {
    // Default: only show active documents
    conditions.push("JSON_EXTRACT(e.data, '$.status') = ?");
    params.push('active');
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '';
  return { where, params };
}

/**
 * Build message-specific WHERE clause additions
 */
function buildMessageWhereClause(
  filter: MessageFilter,
  params: unknown[]
): { where: string; params: unknown[] } {
  const conditions: string[] = [];

  // Channel filter
  if (filter.channelId !== undefined) {
    const channelIds = Array.isArray(filter.channelId) ? filter.channelId : [filter.channelId];
    const channelConditions = channelIds.map(() => "JSON_EXTRACT(e.data, '$.channelId') = ?").join(' OR ');
    conditions.push(`(${channelConditions})`);
    params.push(...channelIds);
  }

  // Sender filter
  if (filter.sender !== undefined) {
    const senders = Array.isArray(filter.sender) ? filter.sender : [filter.sender];
    const senderConditions = senders.map(() => "JSON_EXTRACT(e.data, '$.sender') = ?").join(' OR ');
    conditions.push(`(${senderConditions})`);
    params.push(...senders);
  }

  // Thread filter
  if (filter.threadId !== undefined) {
    if (filter.threadId === null) {
      // Root messages only
      conditions.push("JSON_EXTRACT(e.data, '$.threadId') IS NULL");
    } else {
      // Messages in a specific thread
      conditions.push("JSON_EXTRACT(e.data, '$.threadId') = ?");
      params.push(filter.threadId);
    }
  }

  // Has attachments filter
  if (filter.hasAttachments !== undefined) {
    if (filter.hasAttachments) {
      // Has at least one attachment
      conditions.push("JSON_ARRAY_LENGTH(JSON_EXTRACT(e.data, '$.attachments')) > 0");
    } else {
      // No attachments
      conditions.push("(JSON_EXTRACT(e.data, '$.attachments') IS NULL OR JSON_ARRAY_LENGTH(JSON_EXTRACT(e.data, '$.attachments')) = 0)");
    }
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '';
  return { where, params };
}

// ============================================================================
// QuarryAPI Implementation
// ============================================================================

/**
 * Implementation of the QuarryAPI interface
 */
export class QuarryAPIImpl implements QuarryAPI {
  private blockedCache: BlockedCacheService;
  private priorityService: PriorityService;
  private syncService: SyncService;
  private inboxService: InboxService;
  private embeddingService?: EmbeddingService;
  constructor(private backend: StorageBackend) {
    this.blockedCache = createBlockedCacheService(backend);
    this.priorityService = createPriorityService(backend);
    this.syncService = new SyncService(backend);
    this.inboxService = createInboxService(backend);

    // Set up automatic status transitions for blocked/unblocked states
    this.blockedCache.setStatusTransitionCallback({
      onBlock: (elementId: ElementId, previousStatus: string) => {
        this.updateTaskStatusInternal(elementId, TaskStatusEnum.BLOCKED, previousStatus);
      },
      onUnblock: (elementId: ElementId, statusToRestore: string) => {
        this.updateTaskStatusInternal(elementId, statusToRestore as TaskStatus, null);
      },
    });
  }

  /**
   * Internal method to update task status without triggering additional blocked cache updates.
   * Used for automatic blocked/unblocked status transitions.
   */
  private updateTaskStatusInternal(
    elementId: ElementId,
    newStatus: TaskStatus,
    _previousStatus: string | null
  ): void {
    // Get current element
    const row = this.backend.queryOne<ElementRow>(
      'SELECT * FROM elements WHERE id = ?',
      [elementId]
    );

    if (!row || row.type !== 'task') {
      return;
    }

    // Parse current data
    const data = JSON.parse(row.data);
    const oldStatus = data.status;

    // Don't update if already at target status
    if (oldStatus === newStatus) {
      return;
    }

    // Update status in data
    data.status = newStatus;

    // Update timestamps based on transition
    const now = createTimestamp();
    if (newStatus === TaskStatusEnum.CLOSED && !data.closedAt) {
      data.closedAt = now;
    } else if (newStatus !== TaskStatusEnum.CLOSED && data.closedAt) {
      data.closedAt = null;
    }

    // Update in database
    this.backend.run(
      `UPDATE elements SET data = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(data), now, elementId]
    );

    // Record event for automatic status transition
    const eventType = newStatus === TaskStatusEnum.BLOCKED
      ? 'auto_blocked' as EventType
      : 'auto_unblocked' as EventType;
    const event = createEvent({
      elementId,
      eventType,
      actor: 'system:blocked-cache' as EntityId,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
    });
    this.backend.run(
      `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.elementId,
        event.eventType,
        event.actor,
        JSON.stringify(event.oldValue),
        JSON.stringify(event.newValue),
        event.createdAt,
      ]
    );

    // Mark as dirty for sync
    this.backend.markDirty(elementId);
  }

  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  async get<T extends Element>(id: ElementId, options?: GetOptions): Promise<T | null> {
    // Query the element
    const row = this.backend.queryOne<ElementRow>(
      'SELECT * FROM elements WHERE id = ?',
      [id]
    );

    if (!row) {
      return null;
    }

    // Get tags for this element
    const tagRows = this.backend.query<TagRow>(
      'SELECT tag FROM tags WHERE element_id = ?',
      [id]
    );
    const tags = tagRows.map((r) => r.tag);

    // Deserialize the element
    let element = deserializeElement<T>(row, tags);
    if (!element) return null;

    // Handle hydration if requested
    if (options?.hydrate) {
      if (isTask(element)) {
        element = await this.hydrateTask(element as unknown as Task, options.hydrate) as unknown as T;
      } else if (isMessage(element)) {
        element = await this.hydrateMessage(element as unknown as Message, options.hydrate) as unknown as T;
      } else if (isLibrary(element)) {
        element = await this.hydrateLibrary(element as unknown as Library, options.hydrate) as unknown as T;
      }
    }

    return element;
  }

  async list<T extends Element>(filter?: ElementFilter): Promise<T[]> {
    const result = await this.listPaginated<T>(filter);
    return result.items;
  }

  async listPaginated<T extends Element>(filter?: ElementFilter): Promise<ListResult<T>> {
    const effectiveFilter = filter ?? {};

    // Build base WHERE clause (params will be accumulated here)
    const params: unknown[] = [];
    const { where: baseWhere } = buildWhereClause(effectiveFilter, params);

    // Build task-specific WHERE clause if filtering tasks
    let taskWhere = '';
    if (effectiveFilter.type === 'task' || (Array.isArray(effectiveFilter.type) && effectiveFilter.type.includes('task'))) {
      const taskFilter = effectiveFilter as TaskFilter;
      const { where: tw } = buildTaskWhereClause(taskFilter, params);
      if (tw) {
        taskWhere = ` AND ${tw}`;
      }
    }

    // Build document-specific WHERE clause if filtering documents
    let documentWhere = '';
    if (effectiveFilter.type === 'document' || (Array.isArray(effectiveFilter.type) && effectiveFilter.type.includes('document'))) {
      const documentFilter = effectiveFilter as DocumentFilter;
      const { where: dw } = buildDocumentWhereClause(documentFilter, params);
      if (dw) {
        // When filtering multiple types, scope document clauses to document rows only
        const isMultiType = Array.isArray(effectiveFilter.type) && effectiveFilter.type.length > 1;
        documentWhere = isMultiType ? ` AND (e.type != 'document' OR (${dw}))` : ` AND ${dw}`;
      }
    }

    // Build message-specific WHERE clause if filtering messages
    let messageWhere = '';
    if (effectiveFilter.type === 'message' || (Array.isArray(effectiveFilter.type) && effectiveFilter.type.includes('message'))) {
      const messageFilter = effectiveFilter as MessageFilter;
      const { where: mw } = buildMessageWhereClause(messageFilter, params);
      if (mw) {
        messageWhere = ` AND ${mw}`;
      }
    }

    // Handle tag filtering
    let tagJoin = '';
    let tagWhere = '';
    if (effectiveFilter.tags && effectiveFilter.tags.length > 0) {
      // Must have ALL tags - use GROUP BY with HAVING COUNT
      tagJoin = ' JOIN tags t ON e.id = t.element_id';
      const placeholders = effectiveFilter.tags.map(() => '?').join(', ');
      tagWhere = ` AND t.tag IN (${placeholders})`;
      params.push(...effectiveFilter.tags);
    }
    if (effectiveFilter.tagsAny && effectiveFilter.tagsAny.length > 0) {
      // Must have ANY tag
      if (!tagJoin) {
        tagJoin = ' JOIN tags t ON e.id = t.element_id';
      }
      const placeholders = effectiveFilter.tagsAny.map(() => '?').join(', ');
      tagWhere += ` AND t.tag IN (${placeholders})`;
      params.push(...effectiveFilter.tagsAny);
    }

    // Count total matching elements
    const countSql = `
      SELECT COUNT(DISTINCT e.id) as count
      FROM elements e${tagJoin}
      WHERE ${baseWhere}${taskWhere}${documentWhere}${messageWhere}${tagWhere}
    `;
    const countRow = this.backend.queryOne<CountRow>(countSql, params);
    const total = countRow?.count ?? 0;

    // Build ORDER BY
    const orderBy = effectiveFilter.orderBy ?? 'created_at';
    const orderDir = effectiveFilter.orderDir ?? 'desc';
    // Map field names to SQL expressions
    // Fields on the elements table can be referenced directly
    // Fields stored in JSON data need JSON_EXTRACT
    const columnMap: Record<string, string> = {
      created_at: 'e.created_at',
      updated_at: 'e.updated_at',
      type: 'e.type',
      id: 'e.id',
      // Task-specific JSON fields
      title: "JSON_EXTRACT(e.data, '$.title')",
      status: "JSON_EXTRACT(e.data, '$.status')",
      priority: "JSON_EXTRACT(e.data, '$.priority')",
      complexity: "JSON_EXTRACT(e.data, '$.complexity')",
      taskType: "JSON_EXTRACT(e.data, '$.taskType')",
      assignee: "JSON_EXTRACT(e.data, '$.assignee')",
      owner: "JSON_EXTRACT(e.data, '$.owner')",
      // Document-specific JSON fields
      name: "JSON_EXTRACT(e.data, '$.name')",
      contentType: "JSON_EXTRACT(e.data, '$.contentType')",
      version: "JSON_EXTRACT(e.data, '$.version')",
    };
    const orderColumn = columnMap[orderBy] ?? `e.${orderBy}`;
    const orderClause = `ORDER BY ${orderColumn} ${orderDir.toUpperCase()}`;

    // Apply pagination
    const limit = Math.min(effectiveFilter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = effectiveFilter.offset ?? 0;

    // Query elements
    const sql = `
      SELECT DISTINCT e.*
      FROM elements e${tagJoin}
      WHERE ${baseWhere}${taskWhere}${documentWhere}${messageWhere}${tagWhere}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const rows = this.backend.query<ElementRow>(sql, [...params, limit, offset]);

    // Batch fetch tags for all returned elements (eliminates N+1 query issue)
    const elementIds = rows.map((row) => row.id);
    const tagsMap = this.batchFetchTags(elementIds);

    // Deserialize elements with their tags
    const items = rows.map((row) => {
      const tags = tagsMap.get(row.id) ?? [];
      return deserializeElement<T>(row, tags);
    }).filter((el): el is T => el !== null);

    // Check if tags filter requires all tags
    let filteredItems = items;
    if (effectiveFilter.tags && effectiveFilter.tags.length > 1) {
      // Filter to elements that have ALL tags
      filteredItems = items.filter((item) =>
        effectiveFilter.tags!.every((tag) => item.tags.includes(tag))
      );
    }

    // Apply hydration if requested
    let finalItems: T[] = filteredItems;
    if (effectiveFilter.hydrate) {
      // Hydrate tasks
      const tasks = filteredItems.filter((item): item is Task & T => isTask(item));
      if (tasks.length > 0) {
        const hydratedTasks = this.hydrateTasks(tasks, effectiveFilter.hydrate);
        // Create a map for efficient lookup
        const hydratedMap = new Map(hydratedTasks.map((t) => [t.id, t]));
        // Replace tasks with hydrated versions, keeping non-tasks as-is
        finalItems = filteredItems.map((item) => {
          const hydrated = hydratedMap.get(item.id);
          return hydrated ? (hydrated as unknown as T) : item;
        });
      }

      // Hydrate messages
      const messages = filteredItems.filter((item): item is Message & T => isMessage(item));
      if (messages.length > 0) {
        const hydratedMessages = this.hydrateMessages(messages, effectiveFilter.hydrate);
        // Create a map for efficient lookup
        const hydratedMsgMap = new Map(hydratedMessages.map((m) => [m.id, m]));
        // Replace messages with hydrated versions
        finalItems = finalItems.map((item) => {
          const hydrated = hydratedMsgMap.get(item.id);
          return hydrated ? (hydrated as unknown as T) : item;
        });
      }

      // Hydrate libraries
      const libraries = finalItems.filter((item): item is Library & T => isLibrary(item));
      if (libraries.length > 0) {
        const hydratedLibraries = this.hydrateLibraries(libraries, effectiveFilter.hydrate);
        // Create a map for efficient lookup
        const hydratedLibMap = new Map(hydratedLibraries.map((l) => [l.id, l]));
        // Replace libraries with hydrated versions
        finalItems = finalItems.map((item) => {
          const hydrated = hydratedLibMap.get(item.id);
          return hydrated ? (hydrated as unknown as T) : item;
        });
      }
    }

    return {
      items: finalItems,
      total,
      offset,
      limit,
      hasMore: offset + finalItems.length < total,
    };
  }

  async create<T extends Element>(input: Record<string, unknown> & { type: ElementType; createdBy: EntityId }): Promise<T> {
    // The input should already be a validated element from the factory functions
    // We just need to persist it
    const element = input as unknown as T;

    // Entity name uniqueness validation
    if (element.type === 'entity') {
      const entityData = element as unknown as { name?: string };
      if (entityData.name) {
        const existing = await this.lookupEntityByName(entityData.name);
        if (existing) {
          throw new ConflictError(
            `Entity with name "${entityData.name}" already exists`,
            ErrorCode.DUPLICATE_NAME,
            { name: entityData.name, existingId: existing.id }
          );
        }
      }
    }

    // Channel name uniqueness validation (group channels only)
    if (element.type === 'channel') {
      const channelData = element as unknown as {
        name?: string;
        channelType?: string;
        permissions?: { visibility?: string };
      };
      // Only validate group channels (direct channels have deterministic names)
      if (channelData.channelType === ChannelTypeValue.GROUP && channelData.name) {
        const visibility = channelData.permissions?.visibility ?? 'private';
        // Check for existing channel with same name and visibility scope
        const existingRow = this.backend.queryOne<ElementRow>(
          `SELECT * FROM elements
           WHERE type = 'channel'
           AND JSON_EXTRACT(data, '$.channelType') = 'group'
           AND JSON_EXTRACT(data, '$.name') = ?
           AND JSON_EXTRACT(data, '$.permissions.visibility') = ?
           AND deleted_at IS NULL`,
          [channelData.name, visibility]
        );
        if (existingRow) {
          throw new ConflictError(
            `Channel with name "${channelData.name}" already exists in ${visibility} scope`,
            ErrorCode.DUPLICATE_NAME,
            { name: channelData.name, visibility, existingId: existingRow.id }
          );
        }
      }
    }

    // Message validation (sender membership, document refs, thread integrity)
    if (element.type === 'message') {
      const messageData = element as unknown as Message;

      // 1. Validate channel exists and sender is a member
      const channelRow = this.backend.queryOne<ElementRow>(
        `SELECT * FROM elements WHERE id = ? AND deleted_at IS NULL`,
        [messageData.channelId]
      );
      if (!channelRow) {
        throw new NotFoundError(
          `Channel not found: ${messageData.channelId}`,
          ErrorCode.NOT_FOUND,
          { elementId: messageData.channelId }
        );
      }
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [channelRow.id]
      );
      const tags = tagRows.map((r) => r.tag);
      const channel = deserializeElement<Channel>(channelRow, tags);
      if (!channel) {
        throw new NotFoundError(`Channel data corrupt: ${messageData.channelId}`);
      }
      // Validate sender is a channel member
      if (!isMember(channel, messageData.sender)) {
        throw new NotAMemberError(channel.id, messageData.sender);
      }

      // 2. Validate contentRef points to a valid Document
      const contentDoc = this.backend.queryOne<ElementRow>(
        `SELECT * FROM elements WHERE id = ? AND type = 'document' AND deleted_at IS NULL`,
        [messageData.contentRef]
      );
      if (!contentDoc) {
        throw new NotFoundError(
          `Content document not found: ${messageData.contentRef}`,
          ErrorCode.DOCUMENT_NOT_FOUND,
          { elementId: messageData.contentRef, field: 'contentRef' }
        );
      }

      // 3. Validate all attachments point to valid Documents
      if (messageData.attachments && messageData.attachments.length > 0) {
        for (const attachmentId of messageData.attachments) {
          const attachmentDoc = this.backend.queryOne<ElementRow>(
            `SELECT * FROM elements WHERE id = ? AND type = 'document' AND deleted_at IS NULL`,
            [attachmentId]
          );
          if (!attachmentDoc) {
            throw new NotFoundError(
              `Attachment document not found: ${attachmentId}`,
              ErrorCode.DOCUMENT_NOT_FOUND,
              { elementId: attachmentId, field: 'attachments' }
            );
          }
        }
      }

      // 4. Validate threadId (if present) points to a message in the same channel
      if (messageData.threadId !== null) {
        const threadParent = this.backend.queryOne<ElementRow>(
          `SELECT * FROM elements WHERE id = ? AND type = 'message' AND deleted_at IS NULL`,
          [messageData.threadId]
        );
        if (!threadParent) {
          throw new NotFoundError(
            `Thread parent message not found: ${messageData.threadId}`,
            ErrorCode.NOT_FOUND,
            { elementId: messageData.threadId, field: 'threadId' }
          );
        }
        // Deserialize to check channel
        const parentTags = this.backend.query<TagRow>(
          'SELECT tag FROM tags WHERE element_id = ?',
          [threadParent.id]
        );
        const parentMessage = deserializeElement<Message>(threadParent, parentTags.map(r => r.tag));
        if (!parentMessage) {
          throw new NotFoundError(`Thread parent message data corrupt: ${messageData.threadId}`);
        }
        if (parentMessage.channelId !== messageData.channelId) {
          throw new ConstraintError(
            `Thread parent message is in a different channel`,
            ErrorCode.INVALID_PARENT,
            {
              field: 'threadId',
              threadId: messageData.threadId,
              threadChannelId: parentMessage.channelId,
              messageChannelId: messageData.channelId,
            }
          );
        }
      }
    }

    // Serialize for storage
    const serialized = serializeElement(element);

    // Insert in a transaction
    this.backend.transaction((tx) => {
      // Insert the element
      tx.run(
        `INSERT INTO elements (id, type, data, content_hash, created_at, updated_at, created_by, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          serialized.id,
          serialized.type,
          serialized.data,
          serialized.content_hash,
          serialized.created_at,
          serialized.updated_at,
          serialized.created_by,
          serialized.deleted_at,
        ]
      );

      // Insert tags
      if (element.tags.length > 0) {
        for (const tag of element.tags) {
          tx.run(
            'INSERT INTO tags (element_id, tag) VALUES (?, ?)',
            [element.id, tag]
          );
        }
      }

      // Record creation event
      const event = createEvent({
        elementId: element.id,
        eventType: 'created' as EventType,
        actor: element.createdBy,
        oldValue: null,
        newValue: element as unknown as Record<string, unknown>,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          null,
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );

      // For messages with threadId, create a replies-to dependency
      if (isMessage(element) && element.threadId !== null) {
        const now = createTimestamp();
        tx.run(
          `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            element.id,
            element.threadId,
            'replies-to',
            now,
            element.sender,
            null,
          ]
        );

        // Record dependency_added event
        const depEvent = createEvent({
          elementId: element.id,
          eventType: 'dependency_added' as EventType,
          actor: element.sender,
          oldValue: null,
          newValue: {
            blockedId: element.id,
            blockerId: element.threadId,
            type: 'replies-to',
            metadata: {},
          },
        });
        tx.run(
          `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            depEvent.elementId,
            depEvent.eventType,
            depEvent.actor,
            null,
            JSON.stringify(depEvent.newValue),
            depEvent.createdAt,
          ]
        );
      }
    });

    // Process mentions and inbox for messages
    if (isMessage(element)) {
      const messageData = element as unknown as Message;
      const messageMetadata = messageData.metadata as Record<string, unknown> | undefined;

      // Skip inbox item creation if the message has suppressInbox flag set.
      // This is used by dispatch notifications (task-assignment, task-reassignment)
      // to prevent cluttering the operator/director's inbox.
      const suppressInbox = messageMetadata?.suppressInbox === true;

      // Get the channel to determine type and members
      const channelRow = this.backend.queryOne<ElementRow>(
        `SELECT * FROM elements WHERE id = ? AND deleted_at IS NULL`,
        [messageData.channelId]
      );
      if (channelRow) {
        const channelTags = this.backend.query<TagRow>(
          'SELECT tag FROM tags WHERE element_id = ?',
          [channelRow.id]
        );
        const channel = deserializeElement<Channel>(channelRow, channelTags.map((r) => r.tag));

        if (!suppressInbox) {
          // For direct channels: Create inbox item for the OTHER member (not the sender)
          if (channel && isDirectChannel(channel)) {
            for (const memberId of channel.members) {
              // Skip the sender - they don't need an inbox item for their own message
              if (memberId !== messageData.sender) {
                try {
                  this.inboxService.addToInbox({
                    recipientId: memberId as EntityId,
                    messageId: messageData.id as unknown as MessageId,
                    channelId: messageData.channelId as unknown as MessageChannelId,
                    sourceType: InboxSourceType.DIRECT,
                    createdBy: messageData.sender,
                  });
                } catch {
                  // Ignore errors (e.g., duplicate inbox item)
                }
              }
            }
          }
        }

        // Parse and process @mentions from the content document
        const contentDocRow = this.backend.queryOne<ElementRow>(
          `SELECT * FROM elements WHERE id = ? AND type = 'document' AND deleted_at IS NULL`,
          [messageData.contentRef]
        );
        if (contentDocRow) {
          const contentDoc = deserializeElement<Document>(contentDocRow, []);
          const mentionedNames = contentDoc ? extractMentionedNames(contentDoc.content) : [];

          if (mentionedNames.length > 0) {
            // Get all entities to validate mentions against
            const entityRows = this.backend.query<ElementRow>(
              `SELECT * FROM elements WHERE type = 'entity' AND deleted_at IS NULL`,
              []
            );
            const entities: Entity[] = [];
            for (const row of entityRows) {
              const entityTags = this.backend.query<TagRow>(
                'SELECT tag FROM tags WHERE element_id = ?',
                [row.id]
              );
              const entity = deserializeElement<Entity>(row, entityTags.map((r) => r.tag));
              if (entity) entities.push(entity);
            }

            const { valid: validMentionIds } = validateMentions(mentionedNames, entities);

            // Create mentions dependencies and inbox items for each valid mention
            const now = createTimestamp();
            for (const mentionedEntityId of validMentionIds) {
              // Create 'mentions' dependency: message -> entity
              try {
                this.backend.run(
                  `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    messageData.id,
                    mentionedEntityId,
                    'mentions',
                    now,
                    messageData.sender,
                    null,
                  ]
                );
              } catch {
                // Ignore duplicate dependency errors
              }

              // Create inbox item for the mentioned entity (if not the sender)
              if (!suppressInbox && mentionedEntityId !== messageData.sender) {
                try {
                  this.inboxService.addToInbox({
                    recipientId: mentionedEntityId,
                    messageId: messageData.id as unknown as MessageId,
                    channelId: messageData.channelId as unknown as MessageChannelId,
                    sourceType: InboxSourceType.MENTION,
                    createdBy: messageData.sender,
                  });
                } catch {
                  // Ignore errors (e.g., duplicate inbox item if already added for direct message)
                }
              }
            }
          }
        }

        // For thread replies: Notify the parent message sender
        if (!suppressInbox && messageData.threadId) {
          const parentMessageRow = this.backend.queryOne<ElementRow>(
            `SELECT * FROM elements WHERE id = ? AND type = 'message' AND deleted_at IS NULL`,
            [messageData.threadId]
          );
          if (parentMessageRow) {
            const parentMessage = deserializeElement<Message>(parentMessageRow, []);
            // Notify parent message sender (if not replying to yourself)
            if (parentMessage && parentMessage.sender !== messageData.sender) {
              try {
                this.inboxService.addToInbox({
                  recipientId: parentMessage.sender as EntityId,
                  messageId: messageData.id as unknown as MessageId,
                  channelId: messageData.channelId as unknown as MessageChannelId,
                  sourceType: InboxSourceType.THREAD_REPLY,
                  createdBy: messageData.sender,
                });
              } catch {
                // Ignore errors (e.g., duplicate inbox item)
              }
            }
          }
        }
      }
    }

    // Mark as dirty for sync
    this.backend.markDirty(element.id);

    // Index document for FTS
    if (isDocument(element)) {
      this.indexDocumentForFTS(element as unknown as Document);
    }

    return element;
  }

  async update<T extends Element>(id: ElementId, updates: Partial<T>, options?: UpdateOptions): Promise<T> {
    // Get the existing element
    const existing = await this.get<T>(id);
    if (!existing) {
      throw new NotFoundError(
        `Element not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Optimistic concurrency check - fail if element was modified since it was read
    if (options?.expectedUpdatedAt && existing.updatedAt !== options.expectedUpdatedAt) {
      throw new ConflictError(
        `Element was modified by another process: ${id}. Expected updatedAt: ${options.expectedUpdatedAt}, actual: ${existing.updatedAt}`,
        ErrorCode.CONCURRENT_MODIFICATION,
        { elementId: id, expectedUpdatedAt: options.expectedUpdatedAt, actualUpdatedAt: existing.updatedAt }
      );
    }

    // Check if element is immutable (Messages cannot be updated)
    if (existing.type === 'message') {
      throw new ConstraintError(
        'Messages are immutable and cannot be updated',
        ErrorCode.IMMUTABLE,
        { elementId: id, type: 'message' }
      );
    }

    // Check if document is immutable and content is being updated
    if (isDocument(existing)) {
      const doc = existing as unknown as Document;
      if (doc.immutable && (updates as Record<string, unknown>).content !== undefined) {
        throw new ConstraintError(
          'Cannot update content of immutable document',
          ErrorCode.IMMUTABLE,
          { elementId: id, type: 'document' }
        );
      }
    }

    // Resolve actor - use provided actor or fall back to element's creator
    const actor = options?.actor ?? existing.createdBy;

    // Apply updates
    const now = createTimestamp();
    let updated: T = {
      ...existing,
      ...updates,
      id: existing.id, // Cannot change ID
      type: existing.type, // Cannot change type
      createdAt: existing.createdAt, // Cannot change creation time
      createdBy: existing.createdBy, // Cannot change creator
      updatedAt: now,
    };

    // For documents, auto-increment version and link to previous version (only on content changes)
    if (isDocument(existing)) {
      const doc = existing as Document;
      const isContentUpdate = 'content' in updates || 'contentType' in updates;
      if (isContentUpdate) {
        updated = {
          ...updated,
          version: doc.version + 1,
          previousVersionId: doc.id as unknown as DocumentId,
        } as T;
      }
    }

    // Serialize for storage
    const serialized = serializeElement(updated);

    // Update in a transaction
    this.backend.transaction((tx) => {
      // For documents, save current version to version history before updating (only on content changes)
      if (isDocument(existing) && ('content' in updates || 'contentType' in updates)) {
        const doc = existing as Document;
        // Serialize the current document data for version storage
        const versionData = JSON.stringify({
          contentType: doc.contentType,
          content: doc.content,
          version: doc.version,
          previousVersionId: doc.previousVersionId,
          createdBy: doc.createdBy,
          tags: doc.tags,
          metadata: doc.metadata,
          title: doc.title,
          category: doc.category,
          status: doc.status,
          immutable: doc.immutable,
        });
        tx.run(
          `INSERT INTO document_versions (id, version, data, created_at) VALUES (?, ?, ?, ?)`,
          [doc.id, doc.version, versionData, doc.updatedAt]
        );
      }

      // Update the element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ?, deleted_at = ?
         WHERE id = ?`,
        [serialized.data, serialized.content_hash, serialized.updated_at, serialized.deleted_at, id]
      );

      // Update tags if they changed
      if (updates.tags !== undefined) {
        // Remove old tags
        tx.run('DELETE FROM tags WHERE element_id = ?', [id]);
        // Insert new tags
        for (const tag of updated.tags) {
          tx.run('INSERT INTO tags (element_id, tag) VALUES (?, ?)', [id, tag]);
        }
      }

      // Determine the appropriate event type based on status changes
      const existingData = existing as Record<string, unknown>;
      const updatedData = updated as unknown as Record<string, unknown>;
      const oldStatus = existingData.status as string | undefined;
      const newStatus = updatedData.status as string | undefined;

      let eventType: EventType = LifecycleEventType.UPDATED;
      if (oldStatus !== newStatus && newStatus !== undefined) {
        // Handle Task status changes
        if (isTask(existing)) {
          if (newStatus === TaskStatusEnum.CLOSED) {
            // Transitioning TO closed status
            eventType = LifecycleEventType.CLOSED;
          } else if (oldStatus === TaskStatusEnum.CLOSED) {
            // Transitioning FROM closed status (reopening)
            eventType = LifecycleEventType.REOPENED;
          }
        }
        // Handle Plan status changes
        else if (isPlan(existing)) {
          if (newStatus === PlanStatusEnum.COMPLETED || newStatus === PlanStatusEnum.CANCELLED) {
            // Transitioning TO completed or cancelled status (terminal states)
            eventType = LifecycleEventType.CLOSED;
          } else if (oldStatus === PlanStatusEnum.COMPLETED || oldStatus === PlanStatusEnum.CANCELLED) {
            // Transitioning FROM completed/cancelled status (reopening/restarting)
            eventType = LifecycleEventType.REOPENED;
          }
        }
        // Handle Workflow status changes
        else if (isWorkflow(existing)) {
          const terminalStatuses = [
            WorkflowStatusEnum.COMPLETED,
            WorkflowStatusEnum.FAILED,
            WorkflowStatusEnum.CANCELLED,
          ];
          if (terminalStatuses.includes(newStatus as (typeof terminalStatuses)[number])) {
            // Transitioning TO completed, failed, or cancelled status (terminal states)
            eventType = LifecycleEventType.CLOSED;
          } else if (terminalStatuses.includes(oldStatus as (typeof terminalStatuses)[number])) {
            // Transitioning FROM a terminal status (restarting - though not normally allowed by workflow transitions)
            eventType = LifecycleEventType.REOPENED;
          }
        }
        // Handle Document status changes
        else if (isDocument(existing)) {
          if (newStatus === 'archived') {
            eventType = LifecycleEventType.CLOSED;
          } else if (oldStatus === 'archived' && newStatus === 'active') {
            eventType = LifecycleEventType.REOPENED;
          }
        }
      }

      // Record the event with the determined type
      const event = createEvent({
        elementId: id,
        eventType,
        actor,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty for sync
    this.backend.markDirty(id);

    // Check if status changed and update blocked cache
    const existingDataPost = existing as Record<string, unknown>;
    const updatedDataPost = updated as unknown as Record<string, unknown>;
    const oldStatusPost = existingDataPost.status as string | undefined;
    const newStatusPost = updatedDataPost.status as string | undefined;
    if (oldStatusPost !== newStatusPost && newStatusPost !== undefined) {
      this.blockedCache.onStatusChanged(id, oldStatusPost ?? null, newStatusPost);
    }

    // Re-index document for FTS only when content-relevant fields change
    if (isDocument(updated)) {
      const ftsRelevantUpdate = 'content' in updates || 'contentType' in updates ||
        'tags' in updates || 'category' in updates || 'metadata' in updates || 'title' in updates;
      if (ftsRelevantUpdate) {
        this.indexDocumentForFTS(updated as unknown as Document);
      }
    }

    return updated;
  }

  async delete(id: ElementId, options?: DeleteOptions): Promise<void> {
    // Get the existing element
    const existing = await this.get<Element>(id);
    if (!existing) {
      throw new NotFoundError(
        `Element not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Check if element is immutable (Messages cannot be deleted)
    if (existing.type === 'message') {
      throw new ConstraintError(
        'Messages are immutable and cannot be deleted',
        ErrorCode.IMMUTABLE,
        { elementId: id, type: 'message' }
      );
    }

    // Resolve actor - use provided actor or fall back to element's creator
    const actor = options?.actor ?? existing.createdBy;
    const reason = options?.reason;

    const now = createTimestamp();

    // Collect elements that will need cache updates BEFORE deleting dependencies
    // For `blocks` deps: when deleting the source (blocker), targets become unblocked
    const affectedTargets = this.backend.query<{ blocked_id: string }>(
      `SELECT DISTINCT blocked_id FROM dependencies WHERE blocker_id = ? AND type = 'blocks'`,
      [id]
    ).map(row => row.blocked_id as ElementId);
    // For `parent-child` and `awaits` deps: when deleting the target, sources need recheck
    const affectedSources = this.backend.query<{ blocked_id: string }>(
      `SELECT DISTINCT blocked_id FROM dependencies WHERE blocker_id = ? AND type IN ('parent-child', 'awaits')`,
      [id]
    ).map(row => row.blocked_id as ElementId);

    // Soft delete by setting deleted_at and updating status to tombstone
    this.backend.transaction((tx) => {
      // Get current data and update status
      const data = JSON.parse(
        (this.backend.queryOne<{ data: string }>('SELECT data FROM elements WHERE id = ?', [id]))?.data ?? '{}'
      );
      data.status = 'tombstone';
      data.deletedAt = now;
      data.deleteReason = reason;

      tx.run(
        `UPDATE elements SET data = ?, updated_at = ?, deleted_at = ?
         WHERE id = ?`,
        [JSON.stringify(data), now, now, id]
      );

      // Cascade delete: Remove all dependencies where this element is the source or target
      // This prevents orphan dependency records pointing to/from deleted elements
      tx.run('DELETE FROM dependencies WHERE blocked_id = ?', [id]);
      tx.run('DELETE FROM dependencies WHERE blocker_id = ?', [id]);

      // Record delete event with the resolved actor
      const event = createEvent({
        elementId: id,
        eventType: 'deleted' as EventType,
        actor,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: null,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          reason ? JSON.stringify({ reason }) : null,
          event.createdAt,
        ]
      );

      // Clean up document-specific data (inside transaction for atomicity)
      if (existing.type === 'document') {
        tx.run('DELETE FROM document_versions WHERE id = ?', [id]);
        tx.run('DELETE FROM comments WHERE document_id = ?', [id]);
        if (this.checkFTSAvailable()) {
          try {
            tx.run('DELETE FROM documents_fts WHERE document_id = ?', [id]);
          } catch (error) {
            console.warn(`[stoneforge] FTS removal failed for ${id}:`, error);
          }
        }
      }
    });

    // Mark as dirty for sync
    this.backend.markDirty(id);

    // Remove embedding (outside transaction — async/best-effort, doesn't affect DB consistency)
    if (existing.type === 'document' && this.embeddingService) {
      try {
        this.embeddingService.removeDocument(id);
      } catch (error) {
        console.warn(`[stoneforge] Embedding removal failed for ${id}:`, error);
      }
    }

    // Update blocked cache for the deleted element and all affected elements
    // This must happen AFTER the transaction so the element is already tombstoned
    this.blockedCache.removeBlocked(id);
    for (const blockerId of affectedTargets) {
      this.blockedCache.invalidateElement(blockerId);
    }
    for (const blockedId of affectedSources) {
      this.blockedCache.invalidateElement(blockedId);
    }
  }

  // --------------------------------------------------------------------------
  // Entity Operations
  // --------------------------------------------------------------------------

  async lookupEntityByName(name: string): Promise<Element | null> {
    // Query for entity with matching name in data JSON
    const row = this.backend.queryOne<ElementRow>(
      `SELECT * FROM elements
       WHERE type = 'entity'
       AND JSON_EXTRACT(data, '$.name') = ?
       AND deleted_at IS NULL`,
      [name]
    );

    if (!row) {
      return null;
    }

    // Get tags for this element
    const tagRows = this.backend.query<TagRow>(
      'SELECT tag FROM tags WHERE element_id = ?',
      [row.id]
    );
    const tags = tagRows.map((r) => r.tag);

    return deserializeElement<Element>(row, tags);
  }

  /**
   * Sets the manager (reportsTo) for an entity.
   *
   * Validates:
   * - Entity exists and is an entity type
   * - Manager entity exists and is active
   * - No self-reference (entity cannot report to itself)
   * - No circular chains
   *
   * @param entityId - The entity to set the manager for
   * @param managerId - The manager entity ID
   * @param actor - Entity performing this action (for audit trail)
   * @returns The updated entity
   */
  async setEntityManager(
    entityId: EntityId,
    managerId: EntityId,
    actor: EntityId
  ): Promise<Entity> {
    // Get the entity (cast through unknown since EntityId and ElementId are different branded types)
    const entity = await this.get<Entity>(entityId as unknown as ElementId);
    if (!entity) {
      throw new NotFoundError(
        `Entity not found: ${entityId}`,
        ErrorCode.ENTITY_NOT_FOUND,
        { elementId: entityId }
      );
    }
    if (entity.type !== 'entity') {
      throw new ConstraintError(
        `Element is not an entity: ${entityId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: entityId, actualType: entity.type, expectedType: 'entity' }
      );
    }

    // Create a getEntity function for validation
    const getEntity = (id: EntityId): Entity | null => {
      const row = this.backend.queryOne<ElementRow>(
        `SELECT * FROM elements WHERE id = ? AND type = 'entity' AND deleted_at IS NULL`,
        [id]
      );
      if (!row) return null;
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      return deserializeElement<Entity>(row, tagRows.map((r) => r.tag));
    };

    // Validate the manager assignment
    const validation = validateManager(entityId, managerId, getEntity);
    if (!validation.valid) {
      switch (validation.errorCode) {
        case 'SELF_REFERENCE':
          throw new ValidationError(
            validation.errorMessage!,
            ErrorCode.INVALID_INPUT,
            { entityId, managerId }
          );
        case 'ENTITY_NOT_FOUND':
          throw new NotFoundError(
            validation.errorMessage!,
            ErrorCode.ENTITY_NOT_FOUND,
            { elementId: managerId }
          );
        case 'ENTITY_DEACTIVATED':
          throw new ValidationError(
            validation.errorMessage!,
            ErrorCode.INVALID_INPUT,
            { entityId, managerId, reason: 'manager_deactivated' }
          );
        case 'CYCLE_DETECTED':
          throw new ConflictError(
            validation.errorMessage!,
            ErrorCode.CYCLE_DETECTED,
            { entityId, managerId, cyclePath: validation.cyclePath }
          );
      }
    }

    // Update the entity with the new reportsTo value
    const updatedEntity = updateEntity(entity, { reportsTo: managerId });

    // Save the updated entity
    await this.update<Entity>(entityId as unknown as ElementId, updatedEntity as unknown as Partial<Entity>, { actor });

    return updatedEntity;
  }

  /**
   * Clears the manager (reportsTo) for an entity.
   *
   * @param entityId - The entity to clear the manager for
   * @param actor - Entity performing this action (for audit trail)
   * @returns The updated entity
   */
  async clearEntityManager(
    entityId: EntityId,
    actor: EntityId
  ): Promise<Entity> {
    // Get the entity (cast through unknown since EntityId and ElementId are different branded types)
    const entity = await this.get<Entity>(entityId as unknown as ElementId);
    if (!entity) {
      throw new NotFoundError(
        `Entity not found: ${entityId}`,
        ErrorCode.ENTITY_NOT_FOUND,
        { elementId: entityId }
      );
    }
    if (entity.type !== 'entity') {
      throw new ConstraintError(
        `Element is not an entity: ${entityId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: entityId, actualType: entity.type, expectedType: 'entity' }
      );
    }

    // Update the entity with null reportsTo (clears it)
    const updatedEntity = updateEntity(entity, { reportsTo: null });

    // Save the updated entity
    await this.update<Entity>(entityId as unknown as ElementId, updatedEntity as unknown as Partial<Entity>, { actor });

    return updatedEntity;
  }

  /**
   * Gets all entities that report directly to a manager.
   *
   * @param managerId - The manager entity ID
   * @returns Array of entities that report to the manager
   */
  async getDirectReports(managerId: EntityId): Promise<Entity[]> {
    // Query for entities where reportsTo matches the managerId
    const rows = this.backend.query<ElementRow>(
      `SELECT * FROM elements
       WHERE type = 'entity'
       AND JSON_EXTRACT(data, '$.reportsTo') = ?
       AND deleted_at IS NULL`,
      [managerId]
    );

    // Get tags for each entity
    const entities: Entity[] = [];
    for (const row of rows) {
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      const entity = deserializeElement<Entity>(row, tagRows.map((r) => r.tag));
      if (entity) entities.push(entity);
    }

    return entities;
  }

  /**
   * Gets the management chain for an entity (from entity up to root).
   *
   * Returns an ordered array starting with the entity's direct manager
   * and ending with the root entity (an entity with no reportsTo).
   *
   * @param entityId - The entity to get the management chain for
   * @returns Array of entities in the management chain (empty if no manager)
   */
  async getManagementChain(entityId: EntityId): Promise<Entity[]> {
    // Get the entity (cast through unknown since EntityId and ElementId are different branded types)
    const entity = await this.get<Entity>(entityId as unknown as ElementId);
    if (!entity) {
      throw new NotFoundError(
        `Entity not found: ${entityId}`,
        ErrorCode.ENTITY_NOT_FOUND,
        { elementId: entityId }
      );
    }
    if (entity.type !== 'entity') {
      throw new ConstraintError(
        `Element is not an entity: ${entityId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: entityId, actualType: entity.type, expectedType: 'entity' }
      );
    }

    // Create a getEntity function
    const getEntity = (id: EntityId): Entity | null => {
      const row = this.backend.queryOne<ElementRow>(
        `SELECT * FROM elements WHERE id = ? AND type = 'entity' AND deleted_at IS NULL`,
        [id]
      );
      if (!row) return null;
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      return deserializeElement<Entity>(row, tagRows.map((r) => r.tag));
    };

    return getManagementChainUtil(entity, getEntity);
  }

  /**
   * Gets the organizational chart structure.
   *
   * @param rootId - Optional root entity ID (if not provided, returns all root entities)
   * @returns Array of org chart nodes (hierarchical structure)
   */
  async getOrgChart(rootId?: EntityId): Promise<OrgChartNode[]> {
    // Get all entities
    const rows = this.backend.query<ElementRow>(
      `SELECT * FROM elements
       WHERE type = 'entity'
       AND deleted_at IS NULL`,
      []
    );

    // Get all entities with tags
    const entities: Entity[] = [];
    for (const row of rows) {
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      const entity = deserializeElement<Entity>(row, tagRows.map((r) => r.tag));
      // Only include active entities
      if (entity && isEntityActive(entity)) {
        entities.push(entity);
      }
    }

    return buildOrgChart(entities, rootId);
  }

  // --------------------------------------------------------------------------
  // Plan Operations
  // --------------------------------------------------------------------------

  async addTaskToPlan(
    taskId: ElementId,
    planId: ElementId,
    options?: AddTaskToPlanOptions
  ): Promise<Dependency> {
    // Verify task exists and is a task
    const task = await this.get<Task>(taskId);
    if (!task) {
      throw new NotFoundError(
        `Task not found: ${taskId}`,
        ErrorCode.NOT_FOUND,
        { elementId: taskId }
      );
    }
    if (task.type !== 'task') {
      throw new ConstraintError(
        `Element is not a task: ${taskId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: taskId, actualType: task.type, expectedType: 'task' }
      );
    }

    // Verify plan exists and is a plan
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Check if task is already in any plan
    const existingParentDeps = await this.getDependencies(taskId, ['parent-child']);
    if (existingParentDeps.length > 0) {
      const existingPlanId = existingParentDeps[0].blockerId;
      throw new ConstraintError(
        `Task is already in plan: ${existingPlanId}`,
        ErrorCode.ALREADY_IN_PLAN,
        { taskId, existingPlanId }
      );
    }

    // Resolve actor
    const actor = options?.actor ?? task.createdBy;

    // Create parent-child dependency from task to plan
    const dependency = await this.addDependency({
      blockedId: taskId,
      blockerId: planId,
      type: 'parent-child',
      actor,
    });

    return dependency;
  }

  async removeTaskFromPlan(
    taskId: ElementId,
    planId: ElementId,
    actor?: EntityId
  ): Promise<void> {
    // Check if the task-plan relationship exists
    const existingDeps = await this.getDependencies(taskId, ['parent-child']);
    const hasRelation = existingDeps.some((d) => d.blockerId === planId);

    if (!hasRelation) {
      throw new NotFoundError(
        `Task ${taskId} is not in plan ${planId}`,
        ErrorCode.DEPENDENCY_NOT_FOUND,
        { taskId, planId }
      );
    }

    // Remove the parent-child dependency
    await this.removeDependency(taskId, planId, 'parent-child', actor);
  }

  async getTasksInPlan(planId: ElementId, filter?: TaskFilter): Promise<Task[]> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all elements that have parent-child dependency to this plan
    const dependents = await this.getDependents(planId, ['parent-child']);

    // If no dependents, return empty array
    if (dependents.length === 0) {
      return [];
    }

    // Fetch tasks by their IDs
    const taskIds = dependents.map((d) => d.blockedId);
    const tasks: Task[] = [];

    for (const taskId of taskIds) {
      const task = await this.get<Task>(taskId);
      if (task && task.type === 'task') {
        tasks.push(task);
      }
    }

    // Apply filters if provided
    let filteredTasks = tasks;

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filteredTasks = filteredTasks.filter((t) => statuses.includes(t.status));
    }

    if (filter?.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      filteredTasks = filteredTasks.filter((t) => priorities.includes(t.priority));
    }

    if (filter?.assignee) {
      filteredTasks = filteredTasks.filter((t) => t.assignee === filter.assignee);
    }

    if (filter?.owner) {
      filteredTasks = filteredTasks.filter((t) => t.owner === filter.owner);
    }

    if (filter?.tags && filter.tags.length > 0) {
      filteredTasks = filteredTasks.filter((t) =>
        filter.tags!.every((tag) => t.tags.includes(tag))
      );
    }

    if (filter?.includeDeleted !== true) {
      filteredTasks = filteredTasks.filter((t) => t.status !== 'tombstone');
    }

    return filteredTasks;
  }

  async getPlanProgress(planId: ElementId): Promise<PlanProgress> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan (excluding tombstones)
    const tasks = await this.getTasksInPlan(planId, { includeDeleted: false });

    // Count tasks by status
    const statusCounts: Record<string, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      deferred: 0,
      tombstone: 0,
    };

    for (const task of tasks) {
      if (task.status in statusCounts) {
        statusCounts[task.status]++;
      }
    }

    // Use the calculatePlanProgress utility
    return calculatePlanProgress(statusCounts as Record<TaskStatus, number>);
  }

  async createTaskInPlan<T extends Task = Task>(
    planId: ElementId,
    taskInput: Omit<CreateTaskInput, 'id'>,
    options?: CreateTaskInPlanOptions
  ): Promise<T> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Check plan is in valid status for adding tasks
    if (plan.status !== PlanStatusEnum.DRAFT && plan.status !== PlanStatusEnum.ACTIVE) {
      throw new ValidationError(
        `Cannot add tasks to plan in status: ${plan.status}`,
        ErrorCode.INVALID_STATUS,
        { planId, status: plan.status, allowedStatuses: ['draft', 'active'] }
      );
    }

    // Generate hierarchical ID if requested (default: true)
    const useHierarchical = options?.useHierarchicalId !== false;
    let taskId: ElementId | undefined;

    if (useHierarchical) {
      // Get next child number atomically
      const childNumber = this.backend.getNextChildNumber(planId);
      taskId = generateChildId(planId, childNumber);
    }

    // Create a properly-formed task using the createTask factory
    const taskElement = await createTask({
      ...taskInput,
      id: taskId,
    });

    const task = await this.create<T>(taskElement as unknown as Record<string, unknown> & { type: ElementType; createdBy: EntityId });

    // Create parent-child dependency
    const actor = options?.actor ?? taskInput.createdBy;
    await this.addDependency({
      blockedId: task.id,
      blockerId: planId,
      type: 'parent-child',
      actor,
    });

    return task;
  }

  // --------------------------------------------------------------------------
  // Plan Bulk Operations
  // --------------------------------------------------------------------------

  async bulkClosePlanTasks(
    planId: ElementId,
    options?: BulkCloseOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;
    const closeReason = options?.closeReason;

    for (const task of tasks) {
      // Skip tasks that are already closed or tombstoned
      if (task.status === TaskStatusEnum.CLOSED || task.status === TaskStatusEnum.TOMBSTONE) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        // Update task status to closed
        const updates: Partial<Task> = {
          status: TaskStatusEnum.CLOSED,
          closedAt: createTimestamp(),
        };
        if (closeReason) {
          updates.closeReason = closeReason;
        }

        await this.update<Task>(task.id, updates, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async bulkDeferPlanTasks(
    planId: ElementId,
    options?: BulkDeferOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;

    // Valid statuses for defer transition
    const deferableStatuses: TaskStatus[] = [TaskStatusEnum.OPEN, TaskStatusEnum.IN_PROGRESS, TaskStatusEnum.BLOCKED];

    for (const task of tasks) {
      // Skip tasks that can't be deferred
      if (!deferableStatuses.includes(task.status)) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        await this.update<Task>(task.id, { status: TaskStatusEnum.DEFERRED }, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async bulkReassignPlanTasks(
    planId: ElementId,
    newAssignee: EntityId | undefined,
    options?: BulkReassignOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;

    for (const task of tasks) {
      // Skip tasks that already have the same assignee
      if (task.assignee === newAssignee) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      // Skip tombstone tasks
      if (task.status === TaskStatusEnum.TOMBSTONE) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        await this.update<Task>(task.id, { assignee: newAssignee }, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async bulkTagPlanTasks(
    planId: ElementId,
    options: BulkTagOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Validate that at least one tag operation is specified
    if ((!options.addTags || options.addTags.length === 0) &&
        (!options.removeTags || options.removeTags.length === 0)) {
      throw new ValidationError(
        'At least one of addTags or removeTags must be specified',
        ErrorCode.INVALID_INPUT,
        { addTags: options.addTags, removeTags: options.removeTags }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;
    const tagsToAdd = options.addTags ?? [];
    const tagsToRemove = new Set(options.removeTags ?? []);

    for (const task of tasks) {
      // Skip tombstone tasks
      if (task.status === TaskStatusEnum.TOMBSTONE) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      // Calculate new tags
      const existingTags = new Set(task.tags);

      // Remove tags first
      for (const tag of tagsToRemove) {
        existingTags.delete(tag);
      }

      // Then add tags
      for (const tag of tagsToAdd) {
        existingTags.add(tag);
      }

      const newTags = Array.from(existingTags).sort();
      const oldTags = [...task.tags].sort();

      // Skip if tags haven't changed
      if (newTags.length === oldTags.length && newTags.every((t, i) => t === oldTags[i])) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        await this.update<Task>(task.id, { tags: newTags }, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Task Operations
  // --------------------------------------------------------------------------

  async ready(filter?: TaskFilter): Promise<Task[]> {
    // Extract limit to apply after sorting
    const limit = filter?.limit;

    // For team-based assignee filtering:
    // If an assignee is specified, also find tasks assigned to teams the entity belongs to
    let teamIds: ElementId[] = [];
    if (filter?.assignee) {
      // Find all teams the entity is a member of
      const teams = await this.list<Team>({ type: 'team' });
      teamIds = teams
        .filter((team) => isTeamMember(team, filter.assignee!))
        .map((team) => team.id);
    }

    // Build effective filter - remove assignee since we'll handle it manually
    const effectiveFilter: TaskFilter = {
      ...filter,
      type: 'task',
      status: [TaskStatusEnum.OPEN, TaskStatusEnum.IN_PROGRESS],
      limit: undefined, // Don't limit at DB level - we'll apply after sorting
      assignee: undefined, // Handle assignee filtering manually for team support
    };

    // Get tasks matching filter
    let tasks = await this.list<Task>(effectiveFilter);

    // Apply team-aware assignee filtering if specified
    if (filter?.assignee) {
      const validAssignees = new Set<string>([filter.assignee, ...teamIds]);
      tasks = tasks.filter((task) => task.assignee && validAssignees.has(task.assignee));
    }

    // Filter out blocked tasks
    const blockedIds = new Set(
      this.backend.query<{ element_id: string }>(
        'SELECT element_id FROM blocked_cache'
      ).map((r) => r.element_id)
    );

    // Filter out tasks whose parent plan is in DRAFT status
    // Uses a single SQL join to find task IDs that are children of draft plans
    const draftPlanTaskIds = new Set(
      this.backend.query<{ blocked_id: string }>(
        `SELECT d.blocked_id FROM dependencies d
         JOIN elements e ON d.blocker_id = e.id
         WHERE d.type = 'parent-child'
           AND e.deleted_at IS NULL
           AND e.type = 'plan'
           AND JSON_EXTRACT(e.data, '$.status') = 'draft'`
      ).map((r) => r.blocked_id)
    );

    // Defense-in-depth: filter out tasks whose parent plan is in the blocked cache.
    // Even if the blocked cache correctly marks child tasks as blocked, this provides
    // an extra safety net against edge cases in blocked cache invalidation.
    const blockedPlanTaskIds = new Set(
      this.backend.query<{ blocked_id: string }>(
        `SELECT d.blocked_id FROM dependencies d
         JOIN blocked_cache bc ON d.blocker_id = bc.element_id
         JOIN elements e ON d.blocker_id = e.id
         WHERE d.type = 'parent-child'
           AND e.deleted_at IS NULL
           AND e.type = 'plan'`
      ).map((r) => r.blocked_id)
    );

    // Get tasks that are children of ephemeral workflows (to exclude from ready list)
    // Find all ephemeral workflows
    const workflows = await this.list<Workflow>({ type: 'workflow' });
    const ephemeralWorkflowIds = new Set(
      workflows.filter((w) => w.ephemeral).map((w) => w.id)
    );

    // Find all tasks that are children of ephemeral workflows
    let ephemeralTaskIds = new Set<string>();
    if (ephemeralWorkflowIds.size > 0) {
      const deps = await this.getAllDependencies();
      for (const dep of deps) {
        if (dep.type === 'parent-child' && ephemeralWorkflowIds.has(dep.blockerId)) {
          ephemeralTaskIds.add(dep.blockedId);
        }
      }
    }

    // Filter out scheduled-for-future tasks, tasks from ephemeral workflows, and draft plan tasks
    const now = new Date();
    const includeEphemeral = filter?.includeEphemeral ?? false;
    const readyTasks = tasks.filter((task) => {
      // Not blocked
      if (blockedIds.has(task.id)) {
        return false;
      }
      // Not in a draft plan
      if (draftPlanTaskIds.has(task.id)) {
        return false;
      }
      // Not in a blocked plan (defense-in-depth)
      if (blockedPlanTaskIds.has(task.id)) {
        return false;
      }
      // Not scheduled for future
      if (task.scheduledFor && new Date(task.scheduledFor) > now) {
        return false;
      }
      // Not a child of an ephemeral workflow (unless includeEphemeral is true)
      if (!includeEphemeral && ephemeralTaskIds.has(task.id)) {
        return false;
      }
      return true;
    });

    // Calculate effective priorities based on dependency relationships
    // Tasks blocking high-priority work inherit that urgency
    const tasksWithPriority = this.priorityService.enhanceTasksWithEffectivePriority(readyTasks);

    // Sort by effective priority ascending (1 = highest/critical, 5 = lowest/minimal)
    // Secondary sort by base priority for ties
    this.priorityService.sortByEffectivePriority(tasksWithPriority);

    // Apply limit after sorting
    if (limit !== undefined) {
      return tasksWithPriority.slice(0, limit);
    }

    return tasksWithPriority;
  }

  /**
   * Get tasks in backlog (not ready for work, needs triage)
   */
  async backlog(filter?: TaskFilter): Promise<Task[]> {
    const limit = filter?.limit;

    const effectiveFilter: TaskFilter = {
      ...filter,
      type: 'task',
      status: TaskStatusEnum.BACKLOG,
      limit: undefined, // Don't limit at DB level
    };

    let tasks = await this.list<Task>(effectiveFilter);

    // Sort by priority (highest first), then by creation date (oldest first)
    tasks.sort((a, b) => {
      const priorityDiff = a.priority - b.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Apply limit after sorting
    if (limit) {
      tasks = tasks.slice(0, limit);
    }

    return tasks;
  }

  async blocked(filter?: TaskFilter): Promise<BlockedTask[]> {
    // Extract limit to apply after filtering
    const limit = filter?.limit;

    const effectiveFilter: TaskFilter = {
      ...filter,
      type: 'task',
      limit: undefined, // Don't limit at DB level - we'll apply after filtering
    };

    // Get tasks matching filter
    const tasks = await this.list<Task>(effectiveFilter);

    // Get blocked cache entries
    const blockedRows = this.backend.query<BlockedCacheRow>(
      'SELECT * FROM blocked_cache'
    );
    const blockedMap = new Map(blockedRows.map((r) => [r.element_id, r]));

    // Filter to blocked tasks and add blocking info
    const blockedTasks: BlockedTask[] = [];
    for (const task of tasks) {
      const blockInfo = blockedMap.get(task.id);
      if (blockInfo) {
        blockedTasks.push({
          ...task,
          blockedBy: blockInfo.blocked_by as ElementId,
          blockReason: blockInfo.reason ?? 'Blocked by dependency',
        });
      }
    }

    // Apply limit after filtering
    if (limit !== undefined) {
      return blockedTasks.slice(0, limit);
    }

    return blockedTasks;
  }

  // --------------------------------------------------------------------------
  // Dependency Operations
  // --------------------------------------------------------------------------

  async addDependency(dep: DependencyInput): Promise<Dependency> {
    // Verify blocked element exists
    const source = await this.get<Element>(dep.blockedId);
    if (!source) {
      throw new NotFoundError(
        `Source element not found: ${dep.blockedId}`,
        ErrorCode.NOT_FOUND,
        { elementId: dep.blockedId }
      );
    }

    // Check for existing dependency
    const existing = this.backend.queryOne<DependencyRow>(
      'SELECT * FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?',
      [dep.blockedId, dep.blockerId, dep.type]
    );
    if (existing) {
      throw new ConflictError(
        'Dependency already exists',
        ErrorCode.DUPLICATE_DEPENDENCY,
        {
          blockedId: dep.blockedId,
          blockerId: dep.blockerId,
          dependencyType: dep.type,
        }
      );
    }

    // TODO: Check for cycles (for blocking dependency types)

    // Resolve actor - use provided actor or fall back to source element's creator
    const actor = dep.actor ?? source.createdBy;

    const now = createTimestamp();
    const dependency: Dependency = {
      blockedId: dep.blockedId,
      blockerId: dep.blockerId,
      type: dep.type,
      createdAt: now,
      createdBy: actor,
      metadata: dep.metadata ?? {},
    };

    // Insert dependency and record event in a transaction
    this.backend.transaction((tx) => {
      // Insert dependency
      tx.run(
        `INSERT INTO dependencies (blocked_id, blocker_id, type, created_at, created_by, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          dependency.blockedId,
          dependency.blockerId,
          dependency.type,
          dependency.createdAt,
          dependency.createdBy,
          dependency.metadata ? JSON.stringify(dependency.metadata) : null,
        ]
      );

      // Record dependency_added event
      const event = createEvent({
        elementId: dependency.blockedId,
        eventType: 'dependency_added' as EventType,
        actor: dependency.createdBy,
        oldValue: null,
        newValue: {
          blockedId: dependency.blockedId,
          blockerId: dependency.blockerId,
          type: dependency.type,
          metadata: dependency.metadata,
        },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          null,
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Update blocked cache using the service (handles transitive blocking, gate satisfaction, etc.)
    this.blockedCache.onDependencyAdded(
      dep.blockedId,
      dep.blockerId,
      dep.type,
      dep.metadata
    );

    // Mark source as dirty
    this.backend.markDirty(dep.blockedId);

    return dependency;
  }

  async removeDependency(
    blockedId: ElementId,
    blockerId: ElementId,
    type: DependencyType,
    actor?: EntityId
  ): Promise<void> {
    // Check dependency exists and capture for event
    const existing = this.backend.queryOne<DependencyRow>(
      'SELECT * FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?',
      [blockedId, blockerId, type]
    );
    if (!existing) {
      throw new NotFoundError(
        'Dependency not found',
        ErrorCode.DEPENDENCY_NOT_FOUND,
        { blockedId, blockerId, dependencyType: type }
      );
    }

    // Get actor for event - use provided actor or fall back to the dependency creator
    const eventActor = actor ?? (existing.created_by as EntityId);

    // Remove dependency and record event in a transaction
    this.backend.transaction((tx) => {
      // Remove dependency
      tx.run(
        'DELETE FROM dependencies WHERE blocked_id = ? AND blocker_id = ? AND type = ?',
        [blockedId, blockerId, type]
      );

      // Record dependency_removed event
      const event = createEvent({
        elementId: blockedId,
        eventType: 'dependency_removed' as EventType,
        actor: eventActor,
        oldValue: {
          blockedId: existing.blocked_id,
          blockerId: existing.blocker_id,
          type: existing.type,
          metadata: existing.metadata ? JSON.parse(existing.metadata) : {},
        },
        newValue: null,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          null,
          event.createdAt,
        ]
      );
    });

    // Update blocked cache using the service (recomputes blocking state)
    this.blockedCache.onDependencyRemoved(blockedId, blockerId, type);

    // Mark source as dirty
    this.backend.markDirty(blockedId);
  }

  async getDependencies(id: ElementId, types?: DependencyType[]): Promise<Dependency[]> {
    let sql = 'SELECT * FROM dependencies WHERE blocked_id = ?';
    const params: unknown[] = [id];

    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND type IN (${placeholders})`;
      params.push(...types);
    }

    const rows = this.backend.query<DependencyRow>(sql, params);

    return rows.map((row) => ({
      blockedId: row.blocked_id as ElementId,
      blockerId: row.blocker_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at as Timestamp,
      createdBy: row.created_by as EntityId,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async getDependents(id: ElementId, types?: DependencyType[]): Promise<Dependency[]> {
    let sql = 'SELECT * FROM dependencies WHERE blocker_id = ?';
    const params: unknown[] = [id];

    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND type IN (${placeholders})`;
      params.push(...types);
    }

    const rows = this.backend.query<DependencyRow>(sql, params);

    return rows.map((row) => ({
      blockedId: row.blocked_id as ElementId,
      blockerId: row.blocker_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at as Timestamp,
      createdBy: row.created_by as EntityId,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async getDependencyTree(id: ElementId): Promise<DependencyTree> {
    const element = await this.get<Element>(id);
    if (!element) {
      throw new NotFoundError(
        `Element not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Build tree recursively (with depth limit to prevent infinite loops)
    const maxDepth = 10;
    const visited = new Set<string>();

    const buildNode = async (
      elem: Element,
      depth: number,
      direction: 'deps' | 'dependents'
    ): Promise<DependencyTreeNode> => {
      const node: DependencyTreeNode = {
        element: elem,
        dependencies: [],
        dependents: [],
      };

      if (depth >= maxDepth || visited.has(elem.id)) {
        return node;
      }
      visited.add(elem.id);

      if (direction === 'deps' || depth === 0) {
        const deps = await this.getDependencies(elem.id);
        for (const dep of deps) {
          const targetElem = await this.get<Element>(dep.blockerId);
          if (targetElem) {
            const childNode = await buildNode(targetElem, depth + 1, 'deps');
            node.dependencies.push(childNode);
          }
        }
      }

      if (direction === 'dependents' || depth === 0) {
        const dependents = await this.getDependents(elem.id);
        for (const dep of dependents) {
          const sourceElem = await this.get<Element>(dep.blockedId);
          if (sourceElem) {
            const parentNode = await buildNode(sourceElem, depth + 1, 'dependents');
            node.dependents.push(parentNode);
          }
        }
      }

      return node;
    };

    const root = await buildNode(element, 0, 'deps');

    // Calculate depths
    const countDepth = (node: DependencyTreeNode, direction: 'deps' | 'dependents'): number => {
      const children = direction === 'deps' ? node.dependencies : node.dependents;
      if (children.length === 0) return 0;
      return 1 + Math.max(...children.map((c) => countDepth(c, direction)));
    };

    const countNodes = (node: DependencyTreeNode, visited: Set<string>): number => {
      if (visited.has(node.element.id)) return 0;
      visited.add(node.element.id);
      let count = 1;
      for (const child of node.dependencies) {
        count += countNodes(child, visited);
      }
      for (const child of node.dependents) {
        count += countNodes(child, visited);
      }
      return count;
    };

    return {
      root,
      dependencyDepth: countDepth(root, 'deps'),
      dependentDepth: countDepth(root, 'dependents'),
      nodeCount: countNodes(root, new Set()),
    };
  }

  // --------------------------------------------------------------------------
  // Gate Satisfaction
  // --------------------------------------------------------------------------

  async satisfyGate(
    blockedId: ElementId,
    blockerId: ElementId,
    actor: EntityId
  ): Promise<boolean> {
    return this.blockedCache.satisfyGate(blockedId, blockerId, actor);
  }

  async recordApproval(
    blockedId: ElementId,
    blockerId: ElementId,
    approver: EntityId
  ): Promise<ApprovalResult> {
    return this.blockedCache.recordApproval(blockedId, blockerId, approver);
  }

  async removeApproval(
    blockedId: ElementId,
    blockerId: ElementId,
    approver: EntityId
  ): Promise<ApprovalResult> {
    return this.blockedCache.removeApproval(blockedId, blockerId, approver);
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  async search(query: string, filter?: ElementFilter): Promise<Element[]> {
    // Simple LIKE-based search for now
    const searchPattern = `%${query}%`;
    const params: unknown[] = [];

    // Build base WHERE clause from filter (params accumulates in place)
    const { where: filterWhere } = buildWhereClause(filter ?? {}, params);

    // Search in title (stored in data JSON)
    const sql = `
      SELECT DISTINCT e.*
      FROM elements e
      LEFT JOIN tags t ON e.id = t.element_id
      WHERE ${filterWhere}
        AND (
          JSON_EXTRACT(e.data, '$.title') LIKE ?
          OR JSON_EXTRACT(e.data, '$.content') LIKE ?
          OR t.tag LIKE ?
        )
      ORDER BY e.updated_at DESC
      LIMIT 100
    `;
    params.push(searchPattern, searchPattern, searchPattern);

    const rows = this.backend.query<ElementRow>(sql, params);

    // Fetch tags and deserialize
    const results: Element[] = [];
    for (const row of rows) {
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      const tags = tagRows.map((r) => r.tag);
      const el = deserializeElement<Element>(row, tags);
      if (el) results.push(el);
    }

    return results;
  }

  async searchChannels(query: string, filter?: ChannelFilter): Promise<Channel[]> {
    const searchPattern = `%${query}%`;
    const params: unknown[] = [];

    // Build base WHERE clause from filter (params accumulates in place)
    // Force type to 'channel'
    const channelFilter = { ...filter, type: 'channel' as const };
    const { where: filterWhere } = buildWhereClause(channelFilter, params);

    // Build channel-specific WHERE clause
    const { where: channelWhere } = buildChannelWhereClause(filter ?? {}, params);

    // Combine base and channel-specific conditions
    let fullWhere = filterWhere;
    if (channelWhere) {
      fullWhere = `${filterWhere} AND ${channelWhere}`;
    }

    // Search in channel name
    const sql = `
      SELECT DISTINCT e.*
      FROM elements e
      LEFT JOIN tags t ON e.id = t.element_id
      WHERE ${fullWhere}
        AND (
          JSON_EXTRACT(e.data, '$.name') LIKE ?
          OR t.tag LIKE ?
        )
      ORDER BY e.updated_at DESC
      LIMIT 100
    `;
    params.push(searchPattern, searchPattern);

    const rows = this.backend.query<ElementRow>(sql, params);

    // Fetch tags and deserialize
    const results: Channel[] = [];
    for (const row of rows) {
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      const tags = tagRows.map((r) => r.tag);
      const ch = deserializeElement<Channel>(row, tags);
      if (ch) results.push(ch);
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // History Operations
  // --------------------------------------------------------------------------

  async getEvents(id: ElementId, filter?: EventFilter): Promise<Event[]> {
    let sql = 'SELECT * FROM events WHERE element_id = ?';
    const params: unknown[] = [id];

    if (filter?.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND event_type IN (${placeholders})`;
      params.push(...types);
    }

    if (filter?.actor) {
      sql += ' AND actor = ?';
      params.push(filter.actor);
    }

    if (filter?.after) {
      sql += ' AND created_at > ?';
      params.push(filter.after);
    }

    if (filter?.before) {
      sql += ' AND created_at < ?';
      params.push(filter.before);
    }

    sql += ' ORDER BY created_at DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const rows = this.backend.query<EventRow>(sql, params);

    return rows.map((row) => ({
      id: row.id,
      elementId: row.element_id as ElementId,
      eventType: row.event_type as EventType,
      actor: row.actor as EntityId,
      oldValue: row.old_value ? JSON.parse(row.old_value) : null,
      newValue: row.new_value ? JSON.parse(row.new_value) : null,
      createdAt: row.created_at as Timestamp,
    }));
  }

  async listEvents(filter?: EventFilter): Promise<Event[]> {
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.elementId) {
      sql += ' AND element_id = ?';
      params.push(filter.elementId);
    }

    if (filter?.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND event_type IN (${placeholders})`;
      params.push(...types);
    }

    if (filter?.actor) {
      sql += ' AND actor = ?';
      params.push(filter.actor);
    }

    if (filter?.after) {
      sql += ' AND created_at > ?';
      params.push(filter.after);
    }

    if (filter?.before) {
      sql += ' AND created_at < ?';
      params.push(filter.before);
    }

    sql += ' ORDER BY created_at DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    if (filter?.offset) {
      sql += ' OFFSET ?';
      params.push(filter.offset);
    }

    const rows = this.backend.query<EventRow>(sql, params);

    return rows.map((row) => ({
      id: row.id,
      elementId: row.element_id as ElementId,
      eventType: row.event_type as EventType,
      actor: row.actor as EntityId,
      oldValue: row.old_value ? JSON.parse(row.old_value) : null,
      newValue: row.new_value ? JSON.parse(row.new_value) : null,
      createdAt: row.created_at as Timestamp,
    }));
  }

  async countEvents(filter?: EventFilter): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM events WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.elementId) {
      sql += ' AND element_id = ?';
      params.push(filter.elementId);
    }

    if (filter?.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND event_type IN (${placeholders})`;
      params.push(...types);
    }

    if (filter?.actor) {
      sql += ' AND actor = ?';
      params.push(filter.actor);
    }

    if (filter?.after) {
      sql += ' AND created_at > ?';
      params.push(filter.after);
    }

    if (filter?.before) {
      sql += ' AND created_at < ?';
      params.push(filter.before);
    }

    const row = this.backend.queryOne<{ count: number }>(sql, params);
    return row?.count ?? 0;
  }

  async getDocumentVersion(id: DocumentId, version: number): Promise<Document | null> {
    const current = await this.get<Document>(id as unknown as ElementId);
    if (!current) {
      throw new NotFoundError(`Document not found: ${id}`, ErrorCode.NOT_FOUND, { documentId: id });
    }
    if (current.type !== 'document') {
      throw new ValidationError(
        `Element ${id} is not a document (type: ${current.type})`,
        ErrorCode.INVALID_INPUT,
        { elementId: id, actualType: current.type, expectedType: 'document' }
      );
    }
    if (current.deletedAt) {
      throw new NotFoundError(`Document has been deleted: ${id}`, ErrorCode.NOT_FOUND, { documentId: id, deletedAt: current.deletedAt });
    }
    if (current.version === version) {
      return current;
    }

    // Look in version history
    const row = this.backend.queryOne<{ data: string; created_at: string }>(
      'SELECT data, created_at FROM document_versions WHERE id = ? AND version = ?',
      [id, version]
    );

    if (!row) {
      return null;
    }

    const data = JSON.parse(row.data);
    return {
      id: id as unknown as ElementId,
      type: 'document',
      createdAt: row.created_at,
      updatedAt: row.created_at,
      createdBy: data.createdBy,
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
      ...data,
    } as Document;
  }

  async getDocumentHistory(id: DocumentId): Promise<Document[]> {
    // Get current version
    const current = await this.get<Document>(id as unknown as ElementId);
    const results: Document[] = [];

    if (current && current.type === 'document' && !current.deletedAt) {
      results.push(current);
    }

    // Get historical versions (exclude current version to avoid duplicates)
    const rows = this.backend.query<{ version: number; data: string; created_at: string }>(
      'SELECT version, data, created_at FROM document_versions WHERE id = ? AND version != ? ORDER BY version DESC',
      [id, current?.version ?? -1]
    );

    for (const row of rows) {
      try {
        const data = JSON.parse(row.data);
        results.push({
          id: id as unknown as ElementId,
          type: 'document',
          createdAt: row.created_at,
          updatedAt: row.created_at,
          createdBy: data.createdBy,
          tags: data.tags ?? [],
          metadata: data.metadata ?? {},
          ...data,
          version: row.version,
        } as Document);
      } catch (error) {
        console.warn(`[stoneforge] Skipping corrupt version ${row.version} for ${id}:`, error);
      }
    }

    return results;
  }

  async reconstructAtTime<T extends Element = Element>(
    id: ElementId,
    asOf: Timestamp
  ): Promise<ReconstructedState<T> | null> {
    // Get all events for this element (we need them all for reconstruction)
    const events = await this.getEvents(id, {});

    if (events.length === 0) {
      throw new NotFoundError(
        `No events found for element: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Use the reconstruction utility
    const { state, eventsApplied, exists } = reconstructStateAtTime(events, asOf);

    // If the element didn't exist at that time, return null
    if (!exists || state === null) {
      return null;
    }

    // Return the reconstructed state
    return {
      element: state as T,
      asOf,
      eventsApplied,
      exists,
    };
  }

  async getElementTimeline(id: ElementId, filter?: EventFilter): Promise<ElementTimeline> {
    // Get all events for this element
    const events = await this.getEvents(id, filter);

    if (events.length === 0) {
      throw new NotFoundError(
        `No events found for element: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Get current state
    const currentState = await this.get(id);

    // Generate timeline snapshots
    const snapshotData = generateTimelineSnapshots(events);

    // Convert to the expected format
    const snapshots: TimelineSnapshot[] = snapshotData.map(({ event, state, summary }) => ({
      event,
      state,
      summary,
    }));

    return {
      elementId: id,
      currentState,
      snapshots,
      totalEvents: events.length,
    };
  }

  // --------------------------------------------------------------------------
  // Channel Operations
  // --------------------------------------------------------------------------

  async findOrCreateDirectChannel(
    entityA: EntityId,
    entityB: EntityId,
    actor: EntityId
  ): Promise<FindOrCreateDirectChannelResult> {
    // Validate actor is one of the entities
    if (actor !== entityA && actor !== entityB) {
      throw new ValidationError(
        'Actor must be one of the channel entities',
        ErrorCode.INVALID_INPUT,
        { field: 'actor', value: actor, expected: 'entityA or entityB' }
      );
    }

    // Search by members for backward compatibility with both ID-named and name-named channels
    const sortedMembers = [entityA, entityB].sort();
    const existingRow = this.backend.queryOne<ElementRow>(
      `SELECT * FROM elements
       WHERE type = 'channel'
       AND JSON_EXTRACT(data, '$.channelType') = 'direct'
       AND JSON_EXTRACT(data, '$.members[0]') = ?
       AND JSON_EXTRACT(data, '$.members[1]') = ?
       AND deleted_at IS NULL`,
      [sortedMembers[0], sortedMembers[1]]
    );

    if (existingRow) {
      // Found existing channel, return it
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [existingRow.id]
      );
      const tags = tagRows.map((r) => r.tag);
      const channel = deserializeElement<Channel>(existingRow, tags);
      if (!channel) {
        throw new StorageError(`Corrupt channel data: ${existingRow.id}`);
      }
      return { channel, created: false };
    }

    // Look up entity names for channel naming
    const entityAData = await this.get<Entity>(entityA as unknown as ElementId);
    const entityBData = await this.get<Entity>(entityB as unknown as ElementId);
    const entityAName = (entityAData as Entity | null)?.name;
    const entityBName = (entityBData as Entity | null)?.name;

    // No existing channel, create a new one with entity names
    const newChannel = await createDirectChannel({
      entityA,
      entityB,
      createdBy: actor,
      ...(entityAName && { entityAName }),
      ...(entityBName && { entityBName }),
    });

    const createdChannel = await this.create<Channel>(
      newChannel as unknown as Element & Record<string, unknown>
    );

    return { channel: createdChannel, created: true };
  }

  async addChannelMember(
    channelId: ElementId,
    entityId: EntityId,
    options?: AddMemberOptions
  ): Promise<MembershipResult> {
    // Get the channel
    const channel = await this.get<Channel>(channelId);
    if (!channel) {
      throw new NotFoundError(
        `Channel not found: ${channelId}`,
        ErrorCode.NOT_FOUND,
        { elementId: channelId }
      );
    }

    // Verify it's a channel
    if (channel.type !== 'channel') {
      throw new ConstraintError(
        `Element is not a channel: ${channelId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: channelId, actualType: channel.type, expectedType: 'channel' }
      );
    }

    // Cast to Channel type (type guard validated above)
    const typedChannel = channel as Channel;

    // Direct channels cannot have membership modified
    if (typedChannel.channelType === ChannelTypeValue.DIRECT) {
      throw new DirectChannelMembershipError(channelId, 'add');
    }

    // Get actor
    const actor = options?.actor ?? typedChannel.createdBy;

    // Check actor has permission to modify members
    if (!canModifyMembers(typedChannel, actor)) {
      throw new CannotModifyMembersError(channelId, actor);
    }

    // Check if entity is already a member
    if (isMember(typedChannel, entityId)) {
      // Already a member, return success without change
      return { success: true, channel: typedChannel, entityId };
    }

    // Add member
    const newMembers = [...typedChannel.members, entityId];
    const now = createTimestamp();

    // Update channel and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [channelId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;

      // Recompute content hash
      const updatedChannel = { ...typedChannel, members: newMembers, updatedAt: now };
      const { hash: contentHash } = computeContentHashSync(updatedChannel as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, channelId]
      );

      // Record membership event
      const event = createEvent({
        elementId: channelId,
        eventType: MembershipEventType.MEMBER_ADDED,
        actor,
        oldValue: { members: typedChannel.members },
        newValue: { members: newMembers, addedMember: entityId },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty
    this.backend.markDirty(channelId);

    // Return updated channel
    const updatedChannel = await this.get<Channel>(channelId);
    return {
      success: true,
      channel: updatedChannel!,
      entityId,
    };
  }

  async removeChannelMember(
    channelId: ElementId,
    entityId: EntityId,
    options?: RemoveMemberOptions
  ): Promise<MembershipResult> {
    // Get the channel
    const channel = await this.get<Channel>(channelId);
    if (!channel) {
      throw new NotFoundError(
        `Channel not found: ${channelId}`,
        ErrorCode.NOT_FOUND,
        { elementId: channelId }
      );
    }

    // Verify it's a channel
    if (channel.type !== 'channel') {
      throw new ConstraintError(
        `Element is not a channel: ${channelId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: channelId, actualType: channel.type, expectedType: 'channel' }
      );
    }

    // Cast to Channel type (type guard validated above)
    const typedChannel = channel as Channel;

    // Direct channels cannot have membership modified
    if (typedChannel.channelType === ChannelTypeValue.DIRECT) {
      throw new DirectChannelMembershipError(channelId, 'remove');
    }

    // Get actor
    const actor = options?.actor ?? typedChannel.createdBy;

    // Check actor has permission to modify members
    if (!canModifyMembers(typedChannel, actor)) {
      throw new CannotModifyMembersError(channelId, actor);
    }

    // Check if entity is a member
    if (!isMember(typedChannel, entityId)) {
      throw new NotAMemberError(channelId, entityId);
    }

    // Remove member
    const newMembers = typedChannel.members.filter((m) => m !== entityId);
    // Also remove from modifyMembers if present
    const newModifyMembers = typedChannel.permissions.modifyMembers.filter((m) => m !== entityId);
    const now = createTimestamp();

    // Update channel and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [channelId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;
      data.permissions = {
        ...data.permissions,
        modifyMembers: newModifyMembers,
      };

      // Recompute content hash
      const updatedChannel = {
        ...typedChannel,
        members: newMembers,
        permissions: { ...typedChannel.permissions, modifyMembers: newModifyMembers },
        updatedAt: now,
      };
      const { hash: contentHash } = computeContentHashSync(updatedChannel as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, channelId]
      );

      // Record membership event
      const event = createEvent({
        elementId: channelId,
        eventType: MembershipEventType.MEMBER_REMOVED,
        actor,
        oldValue: { members: typedChannel.members },
        newValue: {
          members: newMembers,
          removedMember: entityId,
          ...(options?.reason && { reason: options.reason }),
        },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty
    this.backend.markDirty(channelId);

    // Return updated channel
    const updatedChannel = await this.get<Channel>(channelId);
    return {
      success: true,
      channel: updatedChannel!,
      entityId,
    };
  }

  async leaveChannel(channelId: ElementId, actor: EntityId): Promise<MembershipResult> {
    // Get the channel
    const channel = await this.get<Channel>(channelId);
    if (!channel) {
      throw new NotFoundError(
        `Channel not found: ${channelId}`,
        ErrorCode.NOT_FOUND,
        { elementId: channelId }
      );
    }

    // Verify it's a channel
    if (channel.type !== 'channel') {
      throw new ConstraintError(
        `Element is not a channel: ${channelId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: channelId, actualType: channel.type, expectedType: 'channel' }
      );
    }

    // Cast to Channel type (type guard validated above)
    const typedChannel = channel as Channel;

    // Direct channels cannot be left
    if (typedChannel.channelType === ChannelTypeValue.DIRECT) {
      throw new ConstraintError(
        'Cannot leave a direct channel',
        ErrorCode.IMMUTABLE,
        { channelId, channelType: 'direct' }
      );
    }

    // Check if actor is a member
    if (!isMember(typedChannel, actor)) {
      throw new NotAMemberError(channelId, actor);
    }

    // Remove actor from members
    const newMembers = typedChannel.members.filter((m) => m !== actor);
    // Also remove from modifyMembers if present
    const newModifyMembers = typedChannel.permissions.modifyMembers.filter((m) => m !== actor);
    const now = createTimestamp();

    // Update channel and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [channelId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;
      data.permissions = {
        ...data.permissions,
        modifyMembers: newModifyMembers,
      };

      // Recompute content hash
      const updatedChannelData = {
        ...typedChannel,
        members: newMembers,
        permissions: { ...typedChannel.permissions, modifyMembers: newModifyMembers },
        updatedAt: now,
      };
      const { hash: contentHash } = computeContentHashSync(updatedChannelData as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, channelId]
      );

      // Record membership event (leaving is a special form of member_removed)
      const event = createEvent({
        elementId: channelId,
        eventType: MembershipEventType.MEMBER_REMOVED,
        actor,
        oldValue: { members: typedChannel.members },
        newValue: { members: newMembers, removedMember: actor, selfRemoval: true },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty
    this.backend.markDirty(channelId);

    // Return updated channel
    const updatedChannel = await this.get<Channel>(channelId);
    return {
      success: true,
      channel: updatedChannel!,
      entityId: actor,
    };
  }

  /**
   * Merge two group channels: move all messages from source to target,
   * merge member lists, and archive the source channel.
   *
   * Only group channels can be merged. Direct channels are rejected.
   */
  async mergeChannels(
    sourceId: ElementId,
    targetId: ElementId,
    options?: { newName?: string; actor?: EntityId }
  ): Promise<{ target: Channel; sourceArchived: boolean; messagesMoved: number }> {
    // Fetch both channels
    const source = await this.get<Channel>(sourceId);
    if (!source || source.type !== 'channel') {
      throw new NotFoundError(`Source channel not found: ${sourceId}`, ErrorCode.NOT_FOUND, { elementId: sourceId });
    }
    const target = await this.get<Channel>(targetId);
    if (!target || target.type !== 'channel') {
      throw new NotFoundError(`Target channel not found: ${targetId}`, ErrorCode.NOT_FOUND, { elementId: targetId });
    }

    const typedSource = source as Channel;
    const typedTarget = target as Channel;

    // Only group channels can be merged
    if (typedSource.channelType !== ChannelTypeValue.GROUP) {
      throw new ConstraintError('Cannot merge: source is not a group channel', ErrorCode.IMMUTABLE, { channelId: sourceId, channelType: typedSource.channelType });
    }
    if (typedTarget.channelType !== ChannelTypeValue.GROUP) {
      throw new ConstraintError('Cannot merge: target is not a group channel', ErrorCode.IMMUTABLE, { channelId: targetId, channelType: typedTarget.channelType });
    }

    const actor = options?.actor ?? typedTarget.createdBy;
    const now = createTimestamp();

    // Get all messages from source channel
    const sourceMessages = this.backend.query<ElementRow>(
      `SELECT * FROM elements
       WHERE type = 'message'
       AND JSON_EXTRACT(data, '$.channelId') = ?
       AND deleted_at IS NULL`,
      [sourceId]
    );

    // Merge members: add source members not already in target
    const targetMemberSet = new Set(typedTarget.members as readonly string[]);
    const newMembers = [...typedTarget.members];
    for (const member of typedSource.members) {
      if (!targetMemberSet.has(member)) {
        newMembers.push(member);
      }
    }

    // Merge modifyMembers similarly
    const targetModSet = new Set(typedTarget.permissions.modifyMembers as readonly string[]);
    const newModifyMembers = [...typedTarget.permissions.modifyMembers];
    for (const mod of typedSource.permissions.modifyMembers) {
      if (!targetModSet.has(mod)) {
        newModifyMembers.push(mod);
      }
    }

    const newName = options?.newName ?? typedTarget.name;

    // Execute everything in a transaction
    this.backend.transaction((tx) => {
      // 1. Move messages: update channelId in each message's data
      for (const msgRow of sourceMessages) {
        const msgData = JSON.parse(msgRow.data);
        msgData.channelId = targetId;
        tx.run(
          `UPDATE elements SET data = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(msgData), now, msgRow.id]
        );
      }

      // 2. Update inbox_items channel_id for moved messages
      const messageIds = sourceMessages.map((m) => m.id);
      if (messageIds.length > 0) {
        const placeholders = messageIds.map(() => '?').join(',');
        tx.run(
          `UPDATE inbox_items SET channel_id = ? WHERE message_id IN (${placeholders})`,
          [targetId, ...messageIds]
        );
      }

      // 3. Update target channel: merged members, optional rename
      const targetRow = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [targetId]
      );
      if (targetRow) {
        const targetData = JSON.parse(targetRow.data);
        targetData.members = newMembers;
        targetData.permissions = {
          ...targetData.permissions,
          modifyMembers: newModifyMembers,
        };
        if (options?.newName) {
          targetData.name = newName;
        }

        const updatedTarget = {
          ...typedTarget,
          members: newMembers,
          permissions: { ...typedTarget.permissions, modifyMembers: newModifyMembers },
          name: newName,
          updatedAt: now,
        };
        const { hash: contentHash } = computeContentHashSync(updatedTarget as unknown as Element);

        tx.run(
          `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(targetData), contentHash, now, targetId]
        );
      }

      // 4. Archive source channel (soft delete)
      tx.run(
        `UPDATE elements SET deleted_at = ? WHERE id = ?`,
        [now, sourceId]
      );

      // 5. Record merge event on target
      const event = createEvent({
        elementId: targetId as unknown as ElementId,
        eventType: LifecycleEventType.UPDATED,
        actor,
        oldValue: { members: typedTarget.members, name: typedTarget.name },
        newValue: {
          members: newMembers,
          name: newName,
          mergedFrom: sourceId,
          messagesMoved: sourceMessages.length,
        },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [event.elementId, event.eventType, event.actor, JSON.stringify(event.oldValue), JSON.stringify(event.newValue), event.createdAt]
      );
    });

    // Mark both as dirty
    this.backend.markDirty(sourceId);
    this.backend.markDirty(targetId);

    // Return updated target
    const updatedTarget = await this.get<Channel>(targetId);
    return {
      target: updatedTarget!,
      sourceArchived: true,
      messagesMoved: sourceMessages.length,
    };
  }

  /**
   * Send a direct message to another entity
   *
   * This is a convenience method that:
   * 1. Finds or creates the direct channel between sender and recipient
   * 2. Creates and sends the message in that channel
   *
   * @param sender - The entity sending the message
   * @param input - The message input including recipient, contentRef, etc.
   * @returns The created message and channel information
   */
  async sendDirectMessage(
    sender: EntityId,
    input: SendDirectMessageInput
  ): Promise<SendDirectMessageResult> {
    // Find or create the direct channel
    const { channel, created: channelCreated } = await this.findOrCreateDirectChannel(
      sender,
      input.recipient,
      sender
    );

    // Create the message
    const message = await createMessage({
      channelId: channel.id as unknown as MessageChannelId,
      sender,
      contentRef: input.contentRef,
      attachments: input.attachments,
      tags: input.tags,
      metadata: input.metadata,
    });

    // Persist the message (membership validation happens in create)
    const createdMessage = await this.create<Message>(
      message as unknown as Message & Record<string, unknown>
    );

    return {
      message: createdMessage,
      channel,
      channelCreated,
    };
  }

  // --------------------------------------------------------------------------
  // Workflow Operations
  // --------------------------------------------------------------------------

  async deleteWorkflow(
    workflowId: ElementId,
    options?: DeleteWorkflowOptions
  ): Promise<DeleteWorkflowResult> {
    // Get the workflow
    const workflow = await this.get<Workflow>(workflowId);
    if (!workflow) {
      throw new NotFoundError(`Workflow not found: ${workflowId}`, ErrorCode.NOT_FOUND, { id: workflowId });
    }

    if (workflow.type !== 'workflow') {
      throw new ValidationError(
        `Element ${workflowId} is not a workflow (type: ${workflow.type})`,
        ErrorCode.INVALID_INPUT,
        { field: 'workflowId', value: workflowId }
      );
    }

    const wasEphemeral = workflow.ephemeral ?? false;

    // Get all dependencies to find tasks
    const allDependencies = await this.getAllDependencies();

    // Find task IDs that are children of this workflow
    const taskIds: ElementId[] = [];
    for (const dep of allDependencies) {
      if (dep.type === 'parent-child' && dep.blockerId === workflowId) {
        taskIds.push(dep.blockedId);
      }
    }

    // Find all dependencies involving the workflow or its tasks
    const elementIds = new Set([workflowId, ...taskIds]);
    const depsToDelete = allDependencies.filter(
      (dep) => elementIds.has(dep.blockedId) || elementIds.has(dep.blockerId)
    );

    // Delete dependencies first
    for (const dep of depsToDelete) {
      try {
        await this.removeDependency(dep.blockedId, dep.blockerId, dep.type, options?.actor);
      } catch {
        // Ignore errors for dependencies that don't exist
      }
    }

    // Delete tasks
    for (const taskId of taskIds) {
      try {
        // Hard delete via SQL since this is a destructive delete
        this.backend.run('DELETE FROM elements WHERE id = ?', [taskId]);
        this.backend.run('DELETE FROM tags WHERE element_id = ?', [taskId]);
        this.backend.run('DELETE FROM events WHERE element_id = ?', [taskId]);
      } catch {
        // Ignore errors for tasks that don't exist
      }
    }

    // Delete the workflow itself
    this.backend.run('DELETE FROM elements WHERE id = ?', [workflowId]);
    this.backend.run('DELETE FROM tags WHERE element_id = ?', [workflowId]);
    this.backend.run('DELETE FROM events WHERE element_id = ?', [workflowId]);

    return {
      workflowId,
      tasksDeleted: taskIds.length,
      dependenciesDeleted: depsToDelete.length,
      wasEphemeral,
    };
  }

  async garbageCollectWorkflows(options: GarbageCollectionOptions): Promise<GarbageCollectionResult> {
    const now = Date.now();
    const result: GarbageCollectionResult = {
      workflowsDeleted: 0,
      tasksDeleted: 0,
      dependenciesDeleted: 0,
      deletedWorkflowIds: [],
    };

    // Find all ephemeral workflows in terminal state
    const workflows = await this.list<Workflow>({ type: 'workflow' });
    const candidates: Workflow[] = [];

    for (const workflow of workflows) {
      // Must be ephemeral
      if (!workflow.ephemeral) continue;

      // Must be in terminal state
      const terminalStatuses = ['completed', 'failed', 'cancelled'];
      if (!terminalStatuses.includes(workflow.status)) continue;

      // Must have finished
      if (!workflow.finishedAt) continue;

      // Must be old enough
      const finishedTime = new Date(workflow.finishedAt).getTime();
      const age = now - finishedTime;
      if (age < options.maxAgeMs) continue;

      candidates.push(workflow);
    }

    // Apply limit if specified
    const toDelete = options.limit ? candidates.slice(0, options.limit) : candidates;

    // If dry run, just return what would be deleted
    if (options.dryRun) {
      // Count what would be deleted
      const allDeps = await this.getAllDependencies();
      for (const workflow of toDelete) {
        result.deletedWorkflowIds.push(workflow.id);
        result.workflowsDeleted++;

        // Count tasks
        for (const dep of allDeps) {
          if (dep.type === 'parent-child' && dep.blockerId === workflow.id) {
            result.tasksDeleted++;
          }
        }
      }
      return result;
    }

    // Actually delete
    for (const workflow of toDelete) {
      const deleteResult = await this.deleteWorkflow(workflow.id);
      result.workflowsDeleted++;
      result.tasksDeleted += deleteResult.tasksDeleted;
      result.dependenciesDeleted += deleteResult.dependenciesDeleted;
      result.deletedWorkflowIds.push(workflow.id);
    }

    return result;
  }

  async garbageCollectTasks(_options: TaskGarbageCollectionOptions): Promise<TaskGarbageCollectionResult> {
    // Tasks no longer have an ephemeral property - only workflows can be ephemeral.
    // Tasks belonging to ephemeral workflows are garbage collected via garbageCollectWorkflows().
    // This method is now a no-op for backwards compatibility.
    return {
      tasksDeleted: 0,
      dependenciesDeleted: 0,
      deletedTaskIds: [],
    };
  }

  async getTasksInWorkflow(workflowId: ElementId, filter?: TaskFilter): Promise<Task[]> {
    // Verify workflow exists
    const workflow = await this.get<Workflow>(workflowId);
    if (!workflow) {
      throw new NotFoundError(
        `Workflow not found: ${workflowId}`,
        ErrorCode.NOT_FOUND,
        { elementId: workflowId }
      );
    }
    if (workflow.type !== 'workflow') {
      throw new ConstraintError(
        `Element is not a workflow: ${workflowId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: workflowId, actualType: workflow.type, expectedType: 'workflow' }
      );
    }

    // Get all elements that have parent-child dependency to this workflow
    const dependents = await this.getDependents(workflowId, ['parent-child']);

    // If no dependents, return empty array
    if (dependents.length === 0) {
      return [];
    }

    // Fetch tasks by their IDs
    const taskIds = dependents.map((d) => d.blockedId);
    const tasks: Task[] = [];

    for (const taskId of taskIds) {
      const task = await this.get<Task>(taskId);
      if (task && task.type === 'task') {
        tasks.push(task);
      }
    }

    // Apply filters if provided
    let filteredTasks = tasks;

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filteredTasks = filteredTasks.filter((t) => statuses.includes(t.status));
    }

    if (filter?.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      filteredTasks = filteredTasks.filter((t) => priorities.includes(t.priority));
    }

    if (filter?.assignee) {
      filteredTasks = filteredTasks.filter((t) => t.assignee === filter.assignee);
    }

    if (filter?.owner) {
      filteredTasks = filteredTasks.filter((t) => t.owner === filter.owner);
    }

    if (filter?.tags && filter.tags.length > 0) {
      filteredTasks = filteredTasks.filter((t) =>
        filter.tags!.every((tag) => t.tags.includes(tag))
      );
    }

    if (filter?.includeDeleted !== true) {
      filteredTasks = filteredTasks.filter((t) => t.status !== 'tombstone');
    }

    return filteredTasks;
  }

  async getReadyTasksInWorkflow(workflowId: ElementId, filter?: TaskFilter): Promise<Task[]> {
    // Get all tasks in the workflow
    const tasks = await this.getTasksInWorkflow(workflowId, {
      ...filter,
      status: [TaskStatusEnum.OPEN, TaskStatusEnum.IN_PROGRESS],
    });

    // Filter out blocked tasks
    const blockedIds = new Set(
      this.backend.query<{ element_id: string }>(
        'SELECT element_id FROM blocked_cache'
      ).map((r) => r.element_id)
    );

    // Filter out scheduled-for-future tasks
    const now = new Date();
    const readyTasks = tasks.filter((task) => {
      // Not blocked
      if (blockedIds.has(task.id)) {
        return false;
      }
      // Not scheduled for future
      if (task.scheduledFor && new Date(task.scheduledFor) > now) {
        return false;
      }
      return true;
    });

    // Calculate effective priorities and sort
    const tasksWithPriority = this.priorityService.enhanceTasksWithEffectivePriority(readyTasks);
    this.priorityService.sortByEffectivePriority(tasksWithPriority);

    // Apply limit after sorting
    if (filter?.limit !== undefined) {
      return tasksWithPriority.slice(0, filter.limit);
    }

    return tasksWithPriority;
  }

  async getWorkflowProgress(workflowId: ElementId): Promise<WorkflowProgress> {
    // Verify workflow exists
    const workflow = await this.get<Workflow>(workflowId);
    if (!workflow) {
      throw new NotFoundError(
        `Workflow not found: ${workflowId}`,
        ErrorCode.NOT_FOUND,
        { elementId: workflowId }
      );
    }
    if (workflow.type !== 'workflow') {
      throw new ConstraintError(
        `Element is not a workflow: ${workflowId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: workflowId, actualType: workflow.type, expectedType: 'workflow' }
      );
    }

    // Get all tasks in the workflow (excluding tombstones)
    const tasks = await this.getTasksInWorkflow(workflowId, { includeDeleted: false });

    // Count tasks by status
    const statusCounts: Record<string, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      deferred: 0,
      tombstone: 0,
    };

    for (const task of tasks) {
      if (task.status in statusCounts) {
        statusCounts[task.status]++;
      }
    }

    // Get blocked and ready counts
    const blockedIds = new Set(
      this.backend.query<{ element_id: string }>(
        'SELECT element_id FROM blocked_cache'
      ).map((r) => r.element_id)
    );

    const taskIds = new Set(tasks.map((t) => t.id));
    const blockedCount = [...blockedIds].filter((id) => taskIds.has(id as ElementId)).length;

    // Ready = open/in_progress, not blocked, not scheduled for future
    const now = new Date();
    const readyCount = tasks.filter((task) => {
      if (task.status !== TaskStatusEnum.OPEN && task.status !== TaskStatusEnum.IN_PROGRESS) {
        return false;
      }
      if (blockedIds.has(task.id)) {
        return false;
      }
      if (task.scheduledFor && new Date(task.scheduledFor) > now) {
        return false;
      }
      return true;
    }).length;

    // Calculate completion percentage
    const total = tasks.length;
    const completed = statusCounts.closed;
    const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      workflowId,
      totalTasks: total,
      statusCounts,
      completionPercentage,
      readyTasks: readyCount,
      blockedTasks: blockedCount,
    };
  }

  /**
   * Get tasks in a workflow ordered by execution order (topological sort).
   *
   * Tasks are ordered such that blockers come before the tasks they block.
   * This represents the order in which tasks should be executed.
   *
   * @param workflowId - The workflow ID
   * @param filter - Optional filter to apply to tasks
   * @returns Tasks in execution order (topological sort based on blocks dependencies)
   */
  async getOrderedTasksInWorkflow(workflowId: ElementId, filter?: TaskFilter): Promise<Task[]> {
    // Get all tasks in the workflow
    const tasks = await this.getTasksInWorkflow(workflowId, filter);

    if (tasks.length === 0) {
      return [];
    }

    // Build task lookup
    const taskById = new Map<string, Task>();
    for (const task of tasks) {
      taskById.set(task.id, task);
    }

    // Get blocks dependencies between tasks in this workflow
    const taskIds = tasks.map((t) => t.id);
    const taskIdSet = new Set(taskIds);

    // Query blocks dependencies where both source and target are in this workflow
    const placeholders = taskIds.map(() => '?').join(', ');
    const deps = this.backend.query<{ blocker_id: string; blocked_id: string }>(
      `SELECT blocker_id, blocked_id FROM dependencies
       WHERE type = 'blocks'
       AND blocker_id IN (${placeholders})
       AND blocked_id IN (${placeholders})`,
      [...taskIds, ...taskIds]
    );

    // Build adjacency list: blockedBy[taskId] = list of tasks that block it
    const blockedBy = new Map<string, string[]>();
    for (const task of tasks) {
      blockedBy.set(task.id, []);
    }

    for (const dep of deps) {
      // In blocks dependency: blocked_id = blocked, blocker_id = blocker (blocked waits for blocker)
      // So blocked_id is blocked by blocker_id
      if (taskIdSet.has(dep.blocker_id as ElementId) && taskIdSet.has(dep.blocked_id as ElementId)) {
        const current = blockedBy.get(dep.blocked_id) ?? [];
        current.push(dep.blocker_id);
        blockedBy.set(dep.blocked_id, current);
      }
    }

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    for (const task of tasks) {
      inDegree.set(task.id, (blockedBy.get(task.id) ?? []).length);
    }

    // Start with tasks that have no blockers
    const queue: string[] = [];
    for (const task of tasks) {
      if (inDegree.get(task.id) === 0) {
        queue.push(task.id);
      }
    }

    // Sort queue by priority for consistent ordering of tasks at same level
    queue.sort((a, b) => {
      const taskA = taskById.get(a)!;
      const taskB = taskById.get(b)!;
      return taskA.priority - taskB.priority;
    });

    const result: Task[] = [];
    const processed = new Set<string>();

    while (queue.length > 0) {
      const taskId = queue.shift()!;
      if (processed.has(taskId)) {
        continue;
      }
      processed.add(taskId);

      const task = taskById.get(taskId);
      if (task) {
        result.push(task);
      }

      // Find tasks that were blocked by this one (this task is blocker_id = blocker)
      // and reduce their in-degree
      for (const dep of deps) {
        // dep.blocker_id = blocker, dep.blocked_id = blocked (blocked waits for blocker)
        // If this task is the blocker (blocker_id), the blocked task (blocked_id) can progress
        if (dep.blocker_id === taskId && !processed.has(dep.blocked_id)) {
          const newDegree = (inDegree.get(dep.blocked_id) ?? 1) - 1;
          inDegree.set(dep.blocked_id, newDegree);
          if (newDegree === 0) {
            queue.push(dep.blocked_id);
            // Re-sort queue by priority
            queue.sort((a, b) => {
              const taskA = taskById.get(a)!;
              const taskB = taskById.get(b)!;
              return taskA.priority - taskB.priority;
            });
          }
        }
      }
    }

    // If there are remaining tasks (cycle detected or isolated), append them by priority
    for (const task of tasks) {
      if (!processed.has(task.id)) {
        result.push(task);
      }
    }

    return result;
  }

  /**
   * Get all dependencies from storage
   */
  private async getAllDependencies(): Promise<Dependency[]> {
    const rows = this.backend.query<DependencyRow>('SELECT * FROM dependencies');
    return rows.map((row) => ({
      blockedId: row.blocked_id as ElementId,
      blockerId: row.blocker_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at as Timestamp,
      createdBy: row.created_by as EntityId,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    }));
  }

  // --------------------------------------------------------------------------
  // Document Convenience Methods
  // --------------------------------------------------------------------------

  async archiveDocument(id: ElementId): Promise<Document> {
    const doc = await this.get<Document>(id);
    if (!doc || doc.type !== 'document') {
      throw new NotFoundError(
        `Document not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }
    return this.update<Document>(id, { status: 'archived' } as Partial<Document>);
  }

  async unarchiveDocument(id: ElementId): Promise<Document> {
    const doc = await this.get<Document>(id);
    if (!doc || doc.type !== 'document') {
      throw new NotFoundError(
        `Document not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }
    return this.update<Document>(id, { status: 'active' } as Partial<Document>);
  }

  // --------------------------------------------------------------------------
  // Embedding Service Registration
  // --------------------------------------------------------------------------

  registerEmbeddingService(service: EmbeddingService): void {
    this.embeddingService = service;
  }

  // --------------------------------------------------------------------------
  // FTS Availability Check
  // --------------------------------------------------------------------------

  private checkFTSAvailable(): boolean {
    try {
      const row = this.backend.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents_fts'`
      );
      return !!row;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // FTS Index Maintenance
  // --------------------------------------------------------------------------

  /**
   * Index a document in the FTS5 virtual table for full-text search.
   * Called after document creation and update.
   */
  private indexDocumentForFTS(doc: Document): void {
    if (!this.checkFTSAvailable()) return;
    try {
      const title = doc.title ?? '';
      // Remove existing entry first (idempotent)
      this.backend.run(
        `DELETE FROM documents_fts WHERE document_id = ?`,
        [doc.id]
      );
      // Insert new entry
      this.backend.run(
        `INSERT INTO documents_fts (document_id, title, content, tags, category)
         VALUES (?, ?, ?, ?, ?)`,
        [
          doc.id,
          title,
          doc.content,
          doc.tags.join(' '),
          doc.category,
        ]
      );
    } catch (error) {
      console.warn(`[stoneforge] FTS index failed for ${doc.id}:`, error);
    }

    // Auto-embed if embedding service is registered
    if (this.embeddingService) {
      const text = `${doc.title ?? ''} ${doc.content}`.trim();
      this.embeddingService.indexDocument(doc.id, text).catch((error) => {
        console.warn(`[stoneforge] Embedding index failed for ${doc.id}:`, error);
      });
    }
  }

  // --------------------------------------------------------------------------
  // FTS Reindex
  // --------------------------------------------------------------------------

  /**
   * Reindex all documents in the FTS5 virtual table.
   * Does NOT create version history entries — safe for bulk reindex.
   */
  reindexAllDocumentsFTS(): { indexed: number; errors: number } {
    const docs = this.backend.query<ElementRow>(
      `SELECT * FROM elements WHERE type = 'document' AND deleted_at IS NULL`
    );
    let indexed = 0;
    let errors = 0;
    for (const row of docs) {
      try {
        const data = JSON.parse(row.data);
        const doc: Document = {
          id: row.id as ElementId,
          type: 'document',
          createdAt: row.created_at as Timestamp,
          updatedAt: row.updated_at as Timestamp,
          createdBy: row.created_by as EntityId,
          tags: data.tags ?? [],
          metadata: data.metadata ?? {},
          content: data.content ?? '',
          contentType: data.contentType ?? 'text',
          version: data.version ?? 1,
          previousVersionId: data.previousVersionId ?? null,
          category: data.category ?? 'other',
          status: data.status ?? 'active',
          title: data.title,
          immutable: data.immutable ?? false,
        };
        this.indexDocumentForFTS(doc);
        indexed++;
      } catch {
        errors++;
      }
    }
    return { indexed, errors };
  }

  /**
   * Reindex imported documents after sync completes.
   * Called internally after import operations.
   */
  private reindexDocumentsAfterImport(): void {
    this.reindexAllDocumentsFTS();
  }

  // --------------------------------------------------------------------------
  // FTS5 Full-Text Search
  // --------------------------------------------------------------------------

  async searchDocumentsFTS(query: string, options: FTSSearchOptions = {}): Promise<FTSSearchResult[]> {
    const {
      category,
      status,
      hardCap = 50,
      elbowSensitivity = 1.5,
      minResults = 1,
    } = options;

    // Check FTS table availability
    if (!this.checkFTSAvailable()) {
      throw new StorageError(
        'FTS5 search is unavailable: the documents_fts table does not exist. Run schema migrations to enable full-text search.',
        ErrorCode.DATABASE_ERROR,
      );
    }

    const escaped = escapeFts5Query(query);
    if (!escaped) return [];

    try {
      // Build FTS5 query with BM25 ranking and snippet generation
      // BM25 returns negative scores (more negative = more relevant)
      let sql = `
        SELECT
          f.document_id,
          bm25(documents_fts) AS score,
          snippet(documents_fts, 2, '<mark>', '</mark>', '...', 40) AS snippet
        FROM documents_fts f
        JOIN elements e ON f.document_id = e.id
        WHERE documents_fts MATCH ?
          AND e.deleted_at IS NULL
      `;
      const params: unknown[] = [escaped];

      // Category filter
      if (category !== undefined) {
        const categories = Array.isArray(category) ? category : [category];
        sql += ` AND f.category IN (${categories.map(() => '?').join(',')})`;
        params.push(...categories);
      }

      // Status filter (default: active only)
      if (status !== undefined) {
        const statuses = Array.isArray(status) ? status : [status];
        sql += ` AND JSON_EXTRACT(e.data, '$.status') IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      } else {
        sql += ` AND JSON_EXTRACT(e.data, '$.status') = ?`;
        params.push('active');
      }

      sql += ` ORDER BY score LIMIT ?`;
      params.push(hardCap);

      const rows = this.backend.query<{
        document_id: string;
        score: number;
        snippet: string;
      }>(sql, params);

      if (rows.length === 0) return [];

      // Hydrate documents
      const results: FTSSearchResult[] = [];
      for (const row of rows) {
        const doc = await this.get<Document>(row.document_id as ElementId);
        if (doc) {
          results.push({
            document: doc,
            // Negate score so higher = more relevant for adaptive top-K
            score: -row.score,
            snippet: row.snippet,
          });
        }
      }

      // Apply adaptive top-K elbow detection
      const scored = results.map((r) => ({ item: r, score: r.score }));
      const filtered = applyAdaptiveTopK(scored, {
        sensitivity: elbowSensitivity,
        minResults,
        maxResults: hardCap,
      });

      return filtered.map((f) => f.item);
    } catch (error) {
      // Re-throw typed errors (e.g., StorageError from FTS check)
      if (error instanceof StorageError || error instanceof NotFoundError) {
        throw error;
      }
      // Other errors (e.g., malformed query syntax) — log and return empty
      console.warn('[stoneforge] FTS search error:', error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Sync Operations
  // --------------------------------------------------------------------------

  async export(options?: ExportOptions): Promise<string | void> {
    // Use SyncService for export functionality
    const { elements, dependencies } = this.syncService.exportToString({
      includeEphemeral: false, // API export excludes ephemeral by default
      includeDependencies: options?.includeDependencies ?? true,
    });

    // Build combined JSONL string
    let jsonl = elements;
    if (options?.includeDependencies !== false && dependencies) {
      jsonl = jsonl + (jsonl && dependencies ? '\n' : '') + dependencies;
    }

    if (options?.outputPath) {
      // Write to file using SyncService's file-based export
      const result = await this.syncService.export({
        outputDir: options.outputPath,
        full: true,
        includeEphemeral: false,
      });
      // Return void for file-based export
      return;
    }

    return jsonl;
  }

  async import(options: ImportOptions): Promise<ImportResult> {
    // Use SyncService for import functionality
    let elementsContent = '';
    let dependenciesContent = '';

    // Handle input data - either from file path or raw data string
    if (options.data) {
      // Parse raw JSONL data - separate elements from dependencies
      // Elements have `id` and `type`, dependencies have `blockedId` and `blockerId`
      const lines = options.data.split('\n').filter((line) => line.trim());
      const elementLines: string[] = [];
      const dependencyLines: string[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.blockedId && parsed.blockerId) {
            // This is a dependency
            dependencyLines.push(line);
          } else if (parsed.id) {
            // This is an element
            elementLines.push(line);
          }
        } catch {
          // Invalid JSON - add to elements to let SyncService report the error
          elementLines.push(line);
        }
      }

      elementsContent = elementLines.join('\n');
      dependenciesContent = dependencyLines.join('\n');
    } else if (options.inputPath) {
      // Use file-based import via SyncService
      const syncResult = await this.syncService.import({
        inputDir: options.inputPath,
        dryRun: options.dryRun ?? false,
        force: options.conflictStrategy === 'overwrite',
      });

      // Convert SyncService result to API ImportResult format
      const apiResult = this.convertSyncImportResult(syncResult, options.dryRun ?? false);
      if (!options.dryRun) {
        this.reindexDocumentsAfterImport();
      }
      return apiResult;
    }

    // For raw data import, use SyncService's string-based import
    const syncResult = this.syncService.importFromStrings(
      elementsContent,
      dependenciesContent,
      {
        dryRun: options.dryRun ?? false,
        force: options.conflictStrategy === 'overwrite',
      }
    );

    const apiResult = this.convertSyncImportResult(syncResult, options.dryRun ?? false);
    if (!options.dryRun) {
      this.reindexDocumentsAfterImport();
    }
    return apiResult;
  }

  /**
   * Convert SyncService ImportResult to API ImportResult format
   */
  private convertSyncImportResult(
    syncResult: {
      elementsImported: number;
      elementsSkipped?: number;
      dependenciesImported: number;
      dependenciesSkipped?: number;
      conflicts: Array<{
        elementId: ElementId;
        resolution: string;
        localHash?: string;
        remoteHash?: string;
      }>;
      errors: Array<{
        line: number;
        file: string;
        message: string;
        content?: string;
      }>;
    },
    dryRun: boolean
  ): ImportResult {
    // Convert conflicts to API format
    const conflicts = syncResult.conflicts.map((c) => ({
      elementId: c.elementId,
      conflictType: 'exists' as const,
      details: `Resolved via ${c.resolution}`,
    }));

    // Convert errors to string format
    const errors = syncResult.errors.map((e) =>
      `${e.file}:${e.line}: ${e.message}${e.content ? ` (${e.content.substring(0, 50)}...)` : ''}`
    );

    return {
      success: syncResult.errors.length === 0,
      elementsImported: syncResult.elementsImported,
      dependenciesImported: syncResult.dependenciesImported,
      eventsImported: 0, // Events are not imported via sync
      conflicts,
      errors,
      dryRun,
    };
  }

  // --------------------------------------------------------------------------
  // Team Operations
  // --------------------------------------------------------------------------

  async addTeamMember(
    teamId: ElementId,
    entityId: EntityId,
    options?: { actor?: EntityId }
  ): Promise<TeamMembershipResult> {
    // Get the team
    const team = await this.get<Team>(teamId);
    if (!team) {
      throw new NotFoundError(
        `Team not found: ${teamId}`,
        ErrorCode.NOT_FOUND,
        { elementId: teamId }
      );
    }

    // Verify it's a team
    if (team.type !== 'team') {
      throw new ConstraintError(
        `Element is not a team: ${teamId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: teamId, actualType: team.type, expectedType: 'team' }
      );
    }

    // Check if team is deleted
    if (isTeamDeleted(team)) {
      throw new ConstraintError(
        'Cannot add member to a deleted team',
        ErrorCode.IMMUTABLE,
        { teamId, status: team.status }
      );
    }

    // Check if entity is already a member
    if (isTeamMember(team, entityId)) {
      // Already a member, return success without change
      return { success: true, team, entityId };
    }

    // Add member
    const newMembers = [...team.members, entityId];
    const actor = options?.actor ?? team.createdBy;
    const now = createTimestamp();

    // Update team and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [teamId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;

      // Recompute content hash
      const updatedTeam = { ...team, members: newMembers, updatedAt: now };
      const { hash: contentHash } = computeContentHashSync(updatedTeam as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, teamId]
      );

      // Record membership event
      const event = createEvent({
        elementId: teamId,
        eventType: MembershipEventType.MEMBER_ADDED,
        actor,
        oldValue: { members: team.members },
        newValue: { members: newMembers, addedMember: entityId },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty
    this.backend.markDirty(teamId);

    // Return updated team
    const updatedTeam = await this.get<Team>(teamId);
    return {
      success: true,
      team: updatedTeam!,
      entityId,
    };
  }

  async removeTeamMember(
    teamId: ElementId,
    entityId: EntityId,
    options?: { actor?: EntityId; reason?: string }
  ): Promise<TeamMembershipResult> {
    // Get the team
    const team = await this.get<Team>(teamId);
    if (!team) {
      throw new NotFoundError(
        `Team not found: ${teamId}`,
        ErrorCode.NOT_FOUND,
        { elementId: teamId }
      );
    }

    // Verify it's a team
    if (team.type !== 'team') {
      throw new ConstraintError(
        `Element is not a team: ${teamId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: teamId, actualType: team.type, expectedType: 'team' }
      );
    }

    // Check if team is deleted
    if (isTeamDeleted(team)) {
      throw new ConstraintError(
        'Cannot remove member from a deleted team',
        ErrorCode.IMMUTABLE,
        { teamId, status: team.status }
      );
    }

    // Check if entity is a member
    if (!isTeamMember(team, entityId)) {
      throw new ConstraintError(
        `Entity is not a member of this team`,
        ErrorCode.MEMBER_REQUIRED,
        { teamId, entityId }
      );
    }

    // Remove member
    const newMembers = team.members.filter((m) => m !== entityId);
    const actor = options?.actor ?? team.createdBy;
    const now = createTimestamp();

    // Update team and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [teamId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;

      // Recompute content hash
      const updatedTeam = { ...team, members: newMembers, updatedAt: now };
      const { hash: contentHash } = computeContentHashSync(updatedTeam as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, teamId]
      );

      // Record membership event
      const event = createEvent({
        elementId: teamId,
        eventType: MembershipEventType.MEMBER_REMOVED,
        actor,
        oldValue: { members: team.members },
        newValue: {
          members: newMembers,
          removedMember: entityId,
          ...(options?.reason && { reason: options.reason }),
        },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty
    this.backend.markDirty(teamId);

    // Return updated team
    const updatedTeam = await this.get<Team>(teamId);
    return {
      success: true,
      team: updatedTeam!,
      entityId,
    };
  }

  async getTasksForTeam(teamId: ElementId, options?: TaskFilter): Promise<Task[]> {
    // Get the team
    const team = await this.get<Team>(teamId);
    if (!team) {
      throw new NotFoundError(
        `Team not found: ${teamId}`,
        ErrorCode.NOT_FOUND,
        { elementId: teamId }
      );
    }

    // Verify it's a team
    if (team.type !== 'team') {
      throw new ConstraintError(
        `Element is not a team: ${teamId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: teamId, actualType: team.type, expectedType: 'team' }
      );
    }

    // Build assignee list: team ID + all member IDs
    const assignees = [teamId, ...team.members];

    // Get all tasks and filter by assignee
    const tasks = await this.list<Task>({ type: 'task', ...options });

    // Filter to tasks assigned to team or any member
    return tasks.filter(
      (task) => task.assignee && assignees.includes(task.assignee)
    );
  }

  async claimTaskFromTeam(
    taskId: ElementId,
    entityId: EntityId,
    options?: OperationOptions
  ): Promise<Task> {
    // Get the task
    const task = await this.get<Task>(taskId);
    if (!task) {
      throw new NotFoundError(
        `Task not found: ${taskId}`,
        ErrorCode.NOT_FOUND,
        { elementId: taskId }
      );
    }

    // Verify it's a task
    if (task.type !== 'task') {
      throw new ConstraintError(
        `Element is not a task: ${taskId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: taskId, actualType: task.type, expectedType: 'task' }
      );
    }

    // Check if task is assigned to a team
    if (!task.assignee) {
      throw new ValidationError(
        'Task has no assignee to claim from',
        ErrorCode.MISSING_REQUIRED_FIELD,
        { taskId, field: 'assignee' }
      );
    }

    // Get the team to verify the task is team-assigned
    const team = await this.get<Team>(task.assignee as unknown as ElementId);
    if (!team || team.type !== 'team') {
      throw new ConstraintError(
        'Task is not assigned to a team',
        ErrorCode.TYPE_MISMATCH,
        { taskId, currentAssignee: task.assignee, expectedType: 'team' }
      );
    }

    // Check if entity is a member of the team
    if (!isTeamMember(team, entityId)) {
      throw new ConstraintError(
        'Entity is not a member of the assigned team',
        ErrorCode.MEMBER_REQUIRED,
        { taskId, teamId: team.id, entityId }
      );
    }

    // Update task assignee to the claiming entity
    const actor = options?.actor ?? entityId;
    const updated = await this.update<Task>(
      taskId,
      {
        assignee: entityId,
        // Optionally preserve the team reference in metadata
        metadata: {
          ...task.metadata,
          claimedFromTeam: team.id,
          claimedAt: createTimestamp(),
        },
      },
      { actor }
    );

    return updated;
  }

  async getTeamMetrics(teamId: ElementId): Promise<TeamMetrics> {
    // Get the team
    const team = await this.get<Team>(teamId);
    if (!team) {
      throw new NotFoundError(
        `Team not found: ${teamId}`,
        ErrorCode.NOT_FOUND,
        { elementId: teamId }
      );
    }

    // Verify it's a team
    if (team.type !== 'team') {
      throw new ConstraintError(
        `Element is not a team: ${teamId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: teamId, actualType: team.type, expectedType: 'team' }
      );
    }

    // Get tasks for team
    const tasks = await this.getTasksForTeam(teamId);

    // Calculate metrics
    let tasksCompleted = 0;
    let tasksInProgress = 0;
    let tasksAssignedToTeam = 0;
    let totalCycleTimeMs = 0;
    let completedWithCycleTime = 0;

    for (const task of tasks) {
      if (task.assignee === (teamId as unknown as EntityId)) {
        tasksAssignedToTeam++;
      }

      if (task.status === TaskStatusEnum.CLOSED) {
        tasksCompleted++;
        // Calculate cycle time if closedAt exists
        if (task.closedAt) {
          const createdAt = new Date(task.createdAt).getTime();
          const closedAt = new Date(task.closedAt).getTime();
          totalCycleTimeMs += closedAt - createdAt;
          completedWithCycleTime++;
        }
      } else if (task.status === TaskStatusEnum.IN_PROGRESS) {
        tasksInProgress++;
      }
    }

    const averageCycleTimeMs =
      completedWithCycleTime > 0 ? Math.round(totalCycleTimeMs / completedWithCycleTime) : null;

    return {
      teamId,
      tasksCompleted,
      tasksInProgress,
      totalTasks: tasks.length,
      tasksAssignedToTeam,
      averageCycleTimeMs,
    };
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  async stats(): Promise<SystemStats> {
    const now = createTimestamp();

    // Count elements by type
    const typeCounts = this.backend.query<{ type: string; count: number }>(
      "SELECT type, COUNT(*) as count FROM elements WHERE deleted_at IS NULL GROUP BY type"
    );
    const elementsByType: ElementCountByType = {};
    let totalElements = 0;
    for (const row of typeCounts) {
      elementsByType[row.type as ElementType] = row.count;
      totalElements += row.count;
    }

    // Count dependencies
    const depCount = this.backend.queryOne<CountRow>(
      'SELECT COUNT(*) as count FROM dependencies'
    );
    const totalDependencies = depCount?.count ?? 0;

    // Count events
    const eventCount = this.backend.queryOne<CountRow>(
      'SELECT COUNT(*) as count FROM events'
    );
    const totalEvents = eventCount?.count ?? 0;

    // Count ready tasks
    const readyTasks = await this.ready();

    // Count blocked tasks
    const blockedCount = this.backend.queryOne<CountRow>(
      'SELECT COUNT(*) as count FROM blocked_cache'
    );
    const blockedTasks = blockedCount?.count ?? 0;

    // Get database size
    const stats = this.backend.getStats();

    return {
      totalElements,
      elementsByType,
      totalDependencies,
      totalEvents,
      readyTasks: readyTasks.length,
      blockedTasks,
      databaseSize: stats.fileSize,
      computedAt: now,
    };
  }

  // --------------------------------------------------------------------------
  // Batch Fetch Helpers
  // --------------------------------------------------------------------------

  /**
   * Batch fetch tags for multiple elements by their IDs.
   * Returns a map of element ID to array of tags for efficient lookup.
   * This eliminates N+1 query issues when fetching tags for multiple elements.
   */
  private batchFetchTags(elementIds: string[]): Map<string, string[]> {
    if (elementIds.length === 0) {
      return new Map();
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(elementIds)];

    // Build query with placeholders
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const sql = `SELECT element_id, tag FROM tags WHERE element_id IN (${placeholders})`;

    const rows = this.backend.query<TagRow>(sql, uniqueIds);

    // Group tags by element ID
    const tagsMap = new Map<string, string[]>();
    for (const id of uniqueIds) {
      tagsMap.set(id, []);
    }
    for (const row of rows) {
      const tags = tagsMap.get(row.element_id);
      if (tags) {
        tags.push(row.tag);
      }
    }

    return tagsMap;
  }

  // --------------------------------------------------------------------------
  // Hydration Helpers
  // --------------------------------------------------------------------------

  private async hydrateTask(task: Task, options: HydrationOptions): Promise<HydratedTask> {
    const hydrated: HydratedTask = { ...task };

    if (options.description && task.descriptionRef) {
      const doc = await this.get<Document>(task.descriptionRef as unknown as ElementId);
      if (doc) {
        hydrated.description = doc.content;
      }
    }

    return hydrated;
  }

  /**
   * Batch fetch documents by their IDs.
   * Returns a map of document ID to document for efficient lookup.
   */
  private batchFetchDocuments(documentIds: ElementId[]): Map<ElementId, Document> {
    if (documentIds.length === 0) {
      return new Map();
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(documentIds)];

    // Build query with placeholders
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const sql = `SELECT * FROM elements WHERE id IN (${placeholders}) AND type = 'document'`;

    const rows = this.backend.query<ElementRow>(sql, uniqueIds);

    // Batch fetch tags for all documents (eliminates N+1 query issue)
    const elementIds = rows.map((row) => row.id);
    const tagsMap = this.batchFetchTags(elementIds);

    // Convert to map
    const documentMap = new Map<ElementId, Document>();
    for (const row of rows) {
      const tags = tagsMap.get(row.id) ?? [];
      const doc = deserializeElement<Document>(row, tags);
      if (doc) documentMap.set(doc.id, doc);
    }

    return documentMap;
  }

  /**
   * Batch hydrate tasks with their document references.
   * Collects all document IDs, fetches them in a single query, then populates.
   */
  private hydrateTasks(tasks: Task[], options: HydrationOptions): HydratedTask[] {
    if (tasks.length === 0) {
      return [];
    }

    // Collect all document IDs to fetch
    const documentIds: ElementId[] = [];
    for (const task of tasks) {
      if (options.description && task.descriptionRef) {
        documentIds.push(task.descriptionRef as unknown as ElementId);
      }
    }

    // Batch fetch all documents
    const documentMap = this.batchFetchDocuments(documentIds);

    // Hydrate each task
    const hydrated: HydratedTask[] = tasks.map((task) => {
      const result: HydratedTask = { ...task };

      if (options.description && task.descriptionRef) {
        const doc = documentMap.get(task.descriptionRef as unknown as ElementId);
        if (doc) {
          result.description = doc.content;
        }
      }

      return result;
    });

    return hydrated;
  }

  /**
   * Hydrate a single message with its document references.
   * Resolves contentRef -> content and attachments -> attachmentContents.
   */
  private async hydrateMessage(message: Message, options: HydrationOptions): Promise<HydratedMessage> {
    const hydrated: HydratedMessage = { ...message };

    if (options.content && message.contentRef) {
      const doc = await this.get<Document>(message.contentRef as unknown as ElementId);
      if (doc) {
        hydrated.content = doc.content;
      }
    }

    if (options.attachments && message.attachments && message.attachments.length > 0) {
      const attachmentContents: string[] = [];
      for (const attachmentId of message.attachments) {
        const doc = await this.get<Document>(attachmentId as unknown as ElementId);
        if (doc) {
          attachmentContents.push(doc.content);
        }
      }
      hydrated.attachmentContents = attachmentContents;
    }

    return hydrated;
  }

  /**
   * Batch hydrate messages with their document references.
   * Collects all document IDs, fetches them in a single query, then populates.
   */
  private hydrateMessages(messages: Message[], options: HydrationOptions): HydratedMessage[] {
    if (messages.length === 0) {
      return [];
    }

    // Collect all document IDs to fetch
    const documentIds: ElementId[] = [];
    for (const message of messages) {
      if (options.content && message.contentRef) {
        documentIds.push(message.contentRef as unknown as ElementId);
      }
      if (options.attachments && message.attachments) {
        for (const attachmentId of message.attachments) {
          documentIds.push(attachmentId as unknown as ElementId);
        }
      }
    }

    // Batch fetch all documents
    const documentMap = this.batchFetchDocuments(documentIds);

    // Hydrate each message
    const hydrated: HydratedMessage[] = messages.map((message) => {
      const result: HydratedMessage = { ...message };

      if (options.content && message.contentRef) {
        const doc = documentMap.get(message.contentRef as unknown as ElementId);
        if (doc) {
          result.content = doc.content;
        }
      }

      if (options.attachments && message.attachments && message.attachments.length > 0) {
        const attachmentContents: string[] = [];
        for (const attachmentId of message.attachments) {
          const doc = documentMap.get(attachmentId as unknown as ElementId);
          if (doc) {
            attachmentContents.push(doc.content);
          }
        }
        result.attachmentContents = attachmentContents;
      }

      return result;
    });

    return hydrated;
  }

  /**
   * Hydrate a single library with its document references.
   * Resolves descriptionRef -> description.
   */
  private async hydrateLibrary(library: Library, options: HydrationOptions): Promise<HydratedLibrary> {
    const hydrated: HydratedLibrary = { ...library };

    if (options.description && library.descriptionRef) {
      const doc = await this.get<Document>(library.descriptionRef as unknown as ElementId);
      if (doc) {
        hydrated.description = doc.content;
      }
    }

    return hydrated;
  }

  /**
   * Batch hydrate libraries with their document references.
   * Collects all document IDs, fetches them in a single query, then populates.
   */
  private hydrateLibraries(libraries: Library[], options: HydrationOptions): HydratedLibrary[] {
    if (libraries.length === 0) {
      return [];
    }

    // Collect all document IDs to fetch
    const documentIds: ElementId[] = [];
    for (const library of libraries) {
      if (options.description && library.descriptionRef) {
        documentIds.push(library.descriptionRef as unknown as ElementId);
      }
    }

    // Batch fetch all documents
    const documentMap = this.batchFetchDocuments(documentIds);

    // Hydrate each library
    const hydrated: HydratedLibrary[] = libraries.map((library) => {
      const result: HydratedLibrary = { ...library };

      if (options.description && library.descriptionRef) {
        const doc = documentMap.get(library.descriptionRef as unknown as ElementId);
        if (doc) {
          result.description = doc.content;
        }
      }

      return result;
    });

    return hydrated;
  }

  // --------------------------------------------------------------------------
  // Cache Management (Internal)
  // --------------------------------------------------------------------------

  /**
   * Rebuild the blocked cache from scratch.
   *
   * Use this for:
   * - Initial population after migration
   * - Recovery from cache corruption
   * - Periodic consistency checks
   *
   * @returns Statistics about the rebuild
   */
  rebuildBlockedCache(): { elementsChecked: number; elementsBlocked: number; durationMs: number } {
    return this.blockedCache.rebuild();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new QuarryAPI instance
 *
 * @param backend - The storage backend to use
 * @returns A new QuarryAPI instance
 */
export function createQuarryAPI(backend: StorageBackend): QuarryAPI {
  return new QuarryAPIImpl(backend);
}
