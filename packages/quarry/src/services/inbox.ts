/**
 * Inbox Service - Unified notification inbox management
 *
 * Provides CRUD operations for inbox items:
 * - addToInbox: Add a new notification to an entity's inbox
 * - getInbox: Get inbox items for an entity with optional filtering
 * - getInboxPaginated: Get inbox items with pagination and total count
 * - markAsRead: Mark an inbox item as read
 * - markAsUnread: Mark an inbox item as unread
 * - markAllAsRead: Mark all unread items as read for an entity
 * - archive: Archive an inbox item
 *
 * The service does NOT integrate with MessageService - that is handled
 * in a separate integration layer (Phase 4).
 */

import type { StorageBackend, Row } from '@stoneforge/storage';
import type { EntityId, Timestamp, ChannelId, MessageId, InboxItem, InboxFilter, CreateInboxItemInput } from '@stoneforge/core';
import {
  InboxStatus,
  InboxSourceType,
  validateInboxSourceType,
  createTimestamp,
  NotFoundError,
  ConflictError,
  ValidationError,
  ErrorCode,
} from '@stoneforge/core';

// ============================================================================
// Database Row Types
// ============================================================================

/**
 * Row type for inbox_items table queries
 */
interface InboxItemRow extends Row {
  id: string;
  recipient_id: string;
  message_id: string;
  channel_id: string;
  source_type: string;
  status: string;
  read_at: string | null;
  created_at: string;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique inbox item ID
 * Uses a simple format: inbox-{timestamp}-{random}
 */
function generateInboxItemId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `inbox-${timestamp}-${random}`;
}

// ============================================================================
// InboxService Class
// ============================================================================

/**
 * Service for managing inbox items
 */
export class InboxService {
  constructor(private readonly db: StorageBackend) {}

  // --------------------------------------------------------------------------
  // Schema Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize the inbox_items table schema
   * Should be called during database setup
   *
   * Note: In production, use migrations instead of this method.
   * This is provided for testing and standalone service usage.
   */
  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inbox_items (
        id TEXT PRIMARY KEY,
        recipient_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('direct', 'mention', 'thread_reply')),
        status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
        read_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(recipient_id, message_id)
      )
    `);

    // Create indexes for efficient lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inbox_recipient_status
      ON inbox_items(recipient_id, status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inbox_recipient_created
      ON inbox_items(recipient_id, created_at DESC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inbox_message
      ON inbox_items(message_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inbox_recipient_channel
      ON inbox_items(recipient_id, channel_id)
    `);
  }

  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  /**
   * Add a new item to an entity's inbox
   *
   * @param input - Inbox item creation input
   * @returns The created inbox item
   * @throws ValidationError if input is invalid
   * @throws ConflictError if inbox item already exists for this recipient/message
   */
  addToInbox(input: CreateInboxItemInput): InboxItem {
    // Validate inputs
    if (!input.recipientId || typeof input.recipientId !== 'string') {
      throw new ValidationError(
        'recipientId is required',
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: 'recipientId', value: input.recipientId }
      );
    }

    if (!input.messageId || typeof input.messageId !== 'string') {
      throw new ValidationError(
        'messageId is required',
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: 'messageId', value: input.messageId }
      );
    }

    if (!input.channelId || typeof input.channelId !== 'string') {
      throw new ValidationError(
        'channelId is required',
        ErrorCode.MISSING_REQUIRED_FIELD,
        { field: 'channelId', value: input.channelId }
      );
    }

    validateInboxSourceType(input.sourceType);

    const id = generateInboxItemId();
    const now = createTimestamp();

    const inboxItem: InboxItem = {
      id,
      recipientId: input.recipientId,
      messageId: input.messageId,
      channelId: input.channelId,
      sourceType: input.sourceType,
      status: InboxStatus.UNREAD,
      readAt: null,
      createdAt: now,
    };

    // Insert into database
    try {
      this.db.run(
        `INSERT INTO inbox_items (id, recipient_id, message_id, channel_id, source_type, status, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inboxItem.id,
          inboxItem.recipientId,
          inboxItem.messageId,
          inboxItem.channelId,
          inboxItem.sourceType,
          inboxItem.status,
          inboxItem.readAt,
          inboxItem.createdAt,
        ]
      );
    } catch (error) {
      // Check for duplicate key error
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new ConflictError(
          `Inbox item already exists for recipient ${input.recipientId} and message ${input.messageId}`,
          ErrorCode.ALREADY_EXISTS,
          { recipientId: input.recipientId, messageId: input.messageId }
        );
      }
      throw error;
    }

    return inboxItem;
  }

  // --------------------------------------------------------------------------
  // Read
  // --------------------------------------------------------------------------

  /**
   * Get inbox items for a recipient with optional filtering
   *
   * @param recipientId - Entity to get inbox for
   * @param filter - Optional filter criteria
   * @returns Array of inbox items
   */
  getInbox(recipientId: EntityId, filter?: InboxFilter): InboxItem[] {
    const { sql, params } = this.buildFilterQuery(recipientId, filter);
    const rows = this.db.query<InboxItemRow>(sql, params);
    return rows.map((row) => this.rowToInboxItem(row));
  }

  /**
   * Get inbox items with pagination info
   *
   * @param recipientId - Entity to get inbox for
   * @param filter - Optional filter criteria (limit and offset used for pagination)
   * @returns Object with items and total count
   */
  getInboxPaginated(
    recipientId: EntityId,
    filter?: InboxFilter
  ): { items: InboxItem[]; total: number } {
    // Get total count first (without limit/offset)
    const countFilter = { ...filter, limit: undefined, offset: undefined };
    const { sql: countSql, params: countParams } = this.buildFilterQuery(
      recipientId,
      countFilter,
      true
    );
    const countResult = this.db.queryOne<{ count: number }>(countSql, countParams);
    const total = countResult?.count ?? 0;

    // Get paginated items
    const items = this.getInbox(recipientId, filter);

    return { items, total };
  }

  /**
   * Get the count of unread inbox items for a recipient
   *
   * @param recipientId - Entity to get unread count for
   * @returns Number of unread items
   */
  getUnreadCount(recipientId: EntityId): number {
    const result = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM inbox_items
       WHERE recipient_id = ? AND status = ?`,
      [recipientId, InboxStatus.UNREAD]
    );
    return result?.count ?? 0;
  }

  /**
   * Get a single inbox item by ID
   *
   * @param id - Inbox item ID
   * @returns The inbox item or null if not found
   */
  getInboxItem(id: string): InboxItem | null {
    const row = this.db.queryOne<InboxItemRow>(
      `SELECT id, recipient_id, message_id, channel_id, source_type, status, read_at, created_at
       FROM inbox_items WHERE id = ?`,
      [id]
    );

    return row ? this.rowToInboxItem(row) : null;
  }

  // --------------------------------------------------------------------------
  // Update
  // --------------------------------------------------------------------------

  /**
   * Mark an inbox item as read
   *
   * @param itemId - Inbox item ID to mark as read
   * @returns The updated inbox item
   * @throws NotFoundError if inbox item doesn't exist
   */
  markAsRead(itemId: string): InboxItem {
    const now = createTimestamp();

    const result = this.db.run(
      `UPDATE inbox_items
       SET status = ?, read_at = ?
       WHERE id = ? AND status = ?`,
      [InboxStatus.READ, now, itemId, InboxStatus.UNREAD]
    );

    if (result.changes === 0) {
      // Check if item exists
      const existing = this.getInboxItem(itemId);
      if (!existing) {
        throw new NotFoundError(
          `Inbox item not found: ${itemId}`,
          ErrorCode.NOT_FOUND,
          { id: itemId }
        );
      }
      // Item exists but was already read or archived - return as-is
      return existing;
    }

    return this.getInboxItem(itemId)!;
  }

  /**
   * Mark multiple inbox items as read in a single operation.
   *
   * @param itemIds - Inbox item IDs to mark as read
   * @returns Number of items actually marked as read
   */
  markAsReadBatch(itemIds: string[]): number {
    if (itemIds.length === 0) return 0;

    const now = createTimestamp();
    const placeholders = itemIds.map(() => '?').join(', ');
    const result = this.db.run(
      `UPDATE inbox_items
       SET status = ?, read_at = ?
       WHERE id IN (${placeholders}) AND status = ?`,
      [InboxStatus.READ, now, ...itemIds, InboxStatus.UNREAD]
    );

    return result.changes;
  }

  /**
   * Mark an inbox item as unread
   *
   * @param itemId - Inbox item ID to mark as unread
   * @returns The updated inbox item
   * @throws NotFoundError if inbox item doesn't exist
   */
  markAsUnread(itemId: string): InboxItem {
    const result = this.db.run(
      `UPDATE inbox_items
       SET status = ?, read_at = NULL
       WHERE id = ? AND status != ?`,
      [InboxStatus.UNREAD, itemId, InboxStatus.ARCHIVED]
    );

    if (result.changes === 0) {
      // Check if item exists
      const existing = this.getInboxItem(itemId);
      if (!existing) {
        throw new NotFoundError(
          `Inbox item not found: ${itemId}`,
          ErrorCode.NOT_FOUND,
          { id: itemId }
        );
      }
      // Item exists but was already unread or archived - return as-is
      return existing;
    }

    return this.getInboxItem(itemId)!;
  }

  /**
   * Mark all unread inbox items as read for a recipient
   *
   * @param recipientId - Entity to mark all items as read for
   * @returns Number of items marked as read
   */
  markAllAsRead(recipientId: EntityId): number {
    const now = createTimestamp();

    const result = this.db.run(
      `UPDATE inbox_items
       SET status = ?, read_at = ?
       WHERE recipient_id = ? AND status = ?`,
      [InboxStatus.READ, now, recipientId, InboxStatus.UNREAD]
    );

    return result.changes;
  }

  /**
   * Archive an inbox item
   *
   * @param itemId - Inbox item ID to archive
   * @returns The updated inbox item
   * @throws NotFoundError if inbox item doesn't exist
   */
  archive(itemId: string): InboxItem {
    const result = this.db.run(
      `UPDATE inbox_items
       SET status = ?
       WHERE id = ?`,
      [InboxStatus.ARCHIVED, itemId]
    );

    if (result.changes === 0) {
      throw new NotFoundError(
        `Inbox item not found: ${itemId}`,
        ErrorCode.NOT_FOUND,
        { id: itemId }
      );
    }

    return this.getInboxItem(itemId)!;
  }

  // --------------------------------------------------------------------------
  // Query
  // --------------------------------------------------------------------------

  /**
   * Get inbox items for a specific channel
   *
   * @param recipientId - Entity to get inbox for
   * @param channelId - Channel to filter by
   * @returns Array of inbox items for the channel
   */
  getInboxByChannel(recipientId: EntityId, channelId: ChannelId): InboxItem[] {
    return this.getInbox(recipientId, { channelId });
  }

  // --------------------------------------------------------------------------
  // Delete (for internal use / cascade)
  // --------------------------------------------------------------------------

  /**
   * Delete inbox items by message ID (for cascade deletion)
   *
   * @param messageId - Message ID to delete inbox items for
   * @returns Number of items deleted
   */
  deleteByMessage(messageId: string): number {
    const result = this.db.run(
      `DELETE FROM inbox_items WHERE message_id = ?`,
      [messageId]
    );
    return result.changes;
  }

  /**
   * Delete all inbox items for a recipient
   *
   * @param recipientId - Entity to delete inbox items for
   * @returns Number of items deleted
   */
  deleteByRecipient(recipientId: EntityId): number {
    const result = this.db.run(
      `DELETE FROM inbox_items WHERE recipient_id = ?`,
      [recipientId]
    );
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Build a SQL query from filter options
   */
  private buildFilterQuery(
    recipientId: EntityId,
    filter?: InboxFilter,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['recipient_id = ?'];
    const params: unknown[] = [recipientId];

    if (filter) {
      // Status filter
      if (filter.status !== undefined) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (statuses.length === 1) {
          conditions.push('status = ?');
          params.push(statuses[0]);
        } else if (statuses.length > 1) {
          const placeholders = statuses.map(() => '?').join(',');
          conditions.push(`status IN (${placeholders})`);
          params.push(...statuses);
        }
      }

      // Source type filter
      if (filter.sourceType !== undefined) {
        const types = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
        if (types.length === 1) {
          conditions.push('source_type = ?');
          params.push(types[0]);
        } else if (types.length > 1) {
          const placeholders = types.map(() => '?').join(',');
          conditions.push(`source_type IN (${placeholders})`);
          params.push(...types);
        }
      }

      // Channel filter
      if (filter.channelId !== undefined) {
        conditions.push('channel_id = ?');
        params.push(filter.channelId);
      }

      // After timestamp filter
      if (filter.after !== undefined) {
        conditions.push('created_at > ?');
        params.push(filter.after);
      }

      // Before timestamp filter
      if (filter.before !== undefined) {
        conditions.push('created_at < ?');
        params.push(filter.before);
      }
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM inbox_items WHERE ${whereClause}`,
        params,
      };
    }

    let sql = `SELECT id, recipient_id, message_id, channel_id, source_type, status, read_at, created_at
               FROM inbox_items
               WHERE ${whereClause}
               ORDER BY created_at DESC`;

    // Pagination
    if (filter?.limit !== undefined) {
      sql += ` LIMIT ?`;
      params.push(filter.limit);

      // OFFSET only works with LIMIT in SQLite
      if (filter?.offset !== undefined) {
        sql += ` OFFSET ?`;
        params.push(filter.offset);
      }
    } else if (filter?.offset !== undefined) {
      // If only offset is specified, use a large limit
      sql += ` LIMIT -1 OFFSET ?`;
      params.push(filter.offset);
    }

    return { sql, params };
  }

  /**
   * Convert a database row to an InboxItem object
   */
  private rowToInboxItem(row: InboxItemRow): InboxItem {
    return {
      id: row.id,
      recipientId: row.recipient_id as EntityId,
      messageId: row.message_id as unknown as MessageId,
      channelId: row.channel_id as ChannelId,
      sourceType: row.source_type as InboxSourceType,
      status: row.status as InboxStatus,
      readAt: row.read_at as Timestamp | null,
      createdAt: row.created_at as Timestamp,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new InboxService instance
 */
export function createInboxService(db: StorageBackend): InboxService {
  return new InboxService(db);
}
