import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  InboxService,
  createInboxService,
} from './inbox.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { EntityId, MessageId, ChannelId } from '@stoneforge/core';
import { InboxStatus, InboxSourceType, NotFoundError, ConflictError, ValidationError } from '@stoneforge/core';

// ============================================================================
// Test Setup
// ============================================================================

describe('InboxService', () => {
  let db: StorageBackend;
  let service: InboxService;

  // Test data
  const recipientId = 'el-recipient' as EntityId;
  const recipientId2 = 'el-recipient2' as EntityId;
  const senderId = 'el-sender' as EntityId;
  const messageId1 = 'el-message1' as unknown as MessageId;
  const messageId2 = 'el-message2' as unknown as MessageId;
  const messageId3 = 'el-message3' as unknown as MessageId;
  const channelId1 = 'el-channel1' as unknown as ChannelId;
  const channelId2 = 'el-channel2' as unknown as ChannelId;

  beforeEach(() => {
    // Create in-memory database for each test
    db = createStorage({ path: ':memory:' });
    service = createInboxService(db);
    service.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Schema Initialization
  // ==========================================================================

  describe('initSchema', () => {
    test('creates inbox_items table', () => {
      // Table should already exist from beforeEach
      const tables = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_items'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('inbox_items');
    });

    test('creates indexes', () => {
      const indexes = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_inbox%'"
      );
      expect(indexes.length).toBeGreaterThanOrEqual(3);
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_inbox_recipient_status');
      expect(indexNames).toContain('idx_inbox_recipient_created');
      expect(indexNames).toContain('idx_inbox_message');
    });

    test('is idempotent', () => {
      // Should not throw when called again
      expect(() => service.initSchema()).not.toThrow();
    });
  });

  // ==========================================================================
  // Add to Inbox
  // ==========================================================================

  describe('addToInbox', () => {
    test('creates a new inbox item', () => {
      const item = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      expect(item.id).toBeDefined();
      expect(item.id).toMatch(/^inbox-/);
      expect(item.recipientId).toBe(recipientId);
      expect(item.messageId).toBe(messageId1);
      expect(item.channelId).toBe(channelId1);
      expect(item.sourceType).toBe(InboxSourceType.DIRECT);
      expect(item.status).toBe(InboxStatus.UNREAD);
      expect(item.readAt).toBeNull();
      expect(item.createdAt).toBeDefined();
    });

    test('creates inbox item with mention source type', () => {
      const item = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.MENTION,
        createdBy: senderId,
      });

      expect(item.sourceType).toBe(InboxSourceType.MENTION);
    });

    test('throws ConflictError for duplicate recipient/message', () => {
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      expect(() =>
        service.addToInbox({
          recipientId,
          messageId: messageId1,
          channelId: channelId1,
          sourceType: InboxSourceType.MENTION,
          createdBy: senderId,
        })
      ).toThrow(ConflictError);
    });

    test('allows same message for different recipients', () => {
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      // Should not throw - different recipient
      const item = service.addToInbox({
        recipientId: recipientId2,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      expect(item.recipientId).toBe(recipientId2);
    });

    test('validates recipientId', () => {
      expect(() =>
        service.addToInbox({
          recipientId: '' as EntityId,
          messageId: messageId1,
          channelId: channelId1,
          sourceType: InboxSourceType.DIRECT,
          createdBy: senderId,
        })
      ).toThrow(ValidationError);
    });

    test('validates messageId', () => {
      expect(() =>
        service.addToInbox({
          recipientId,
          messageId: '' as unknown as MessageId,
          channelId: channelId1,
          sourceType: InboxSourceType.DIRECT,
          createdBy: senderId,
        })
      ).toThrow(ValidationError);
    });

    test('validates channelId', () => {
      expect(() =>
        service.addToInbox({
          recipientId,
          messageId: messageId1,
          channelId: '' as unknown as ChannelId,
          sourceType: InboxSourceType.DIRECT,
          createdBy: senderId,
        })
      ).toThrow(ValidationError);
    });

    test('validates sourceType', () => {
      expect(() =>
        service.addToInbox({
          recipientId,
          messageId: messageId1,
          channelId: channelId1,
          sourceType: 'invalid' as InboxSourceType,
          createdBy: senderId,
        })
      ).toThrow(ValidationError);
    });
  });

  // ==========================================================================
  // Get Inbox
  // ==========================================================================

  describe('getInbox', () => {
    beforeEach(() => {
      // Set up test data
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId2,
        channelId: channelId1,
        sourceType: InboxSourceType.MENTION,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId3,
        channelId: channelId2,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId: recipientId2,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
    });

    test('gets all inbox items for recipient', () => {
      const items = service.getInbox(recipientId);
      expect(items).toHaveLength(3);
    });

    test('returns empty array for recipient with no inbox items', () => {
      const items = service.getInbox('el-nonexistent' as EntityId);
      expect(items).toEqual([]);
    });

    test('orders by createdAt descending', () => {
      const items = service.getInbox(recipientId);
      // Items should be ordered newest first
      for (let i = 0; i < items.length - 1; i++) {
        const current = new Date(items[i].createdAt).getTime();
        const next = new Date(items[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    test('filters by status', () => {
      // Mark one as read
      const items = service.getInbox(recipientId);
      service.markAsRead(items[0].id);

      const unreadItems = service.getInbox(recipientId, { status: InboxStatus.UNREAD });
      expect(unreadItems).toHaveLength(2);

      const readItems = service.getInbox(recipientId, { status: InboxStatus.READ });
      expect(readItems).toHaveLength(1);
    });

    test('filters by multiple statuses', () => {
      const items = service.getInbox(recipientId);
      service.markAsRead(items[0].id);
      service.archive(items[1].id);

      const result = service.getInbox(recipientId, {
        status: [InboxStatus.UNREAD, InboxStatus.READ],
      });
      expect(result).toHaveLength(2);
    });

    test('filters by sourceType', () => {
      const directItems = service.getInbox(recipientId, {
        sourceType: InboxSourceType.DIRECT,
      });
      expect(directItems).toHaveLength(2);

      const mentionItems = service.getInbox(recipientId, {
        sourceType: InboxSourceType.MENTION,
      });
      expect(mentionItems).toHaveLength(1);
    });

    test('filters by channelId', () => {
      const channel1Items = service.getInbox(recipientId, { channelId: channelId1 });
      expect(channel1Items).toHaveLength(2);

      const channel2Items = service.getInbox(recipientId, { channelId: channelId2 });
      expect(channel2Items).toHaveLength(1);
    });

    test('applies limit', () => {
      const items = service.getInbox(recipientId, { limit: 2 });
      expect(items).toHaveLength(2);
    });

    test('applies offset', () => {
      const allItems = service.getInbox(recipientId);
      const offsetItems = service.getInbox(recipientId, { offset: 1 });
      expect(offsetItems).toHaveLength(2);
      expect(offsetItems[0].id).toBe(allItems[1].id);
    });

    test('applies limit and offset together', () => {
      const items = service.getInbox(recipientId, { limit: 1, offset: 1 });
      expect(items).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Get Inbox Paginated
  // ==========================================================================

  describe('getInboxPaginated', () => {
    beforeEach(() => {
      // Create 5 items
      for (let i = 1; i <= 5; i++) {
        service.addToInbox({
          recipientId,
          messageId: `el-message${i}` as unknown as MessageId,
          channelId: channelId1,
          sourceType: InboxSourceType.DIRECT,
          createdBy: senderId,
        });
      }
    });

    test('returns items and total count', () => {
      const result = service.getInboxPaginated(recipientId, { limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    test('returns correct total with filters', () => {
      // Mark 2 items as read
      const items = service.getInbox(recipientId);
      service.markAsRead(items[0].id);
      service.markAsRead(items[1].id);

      const result = service.getInboxPaginated(recipientId, {
        status: InboxStatus.UNREAD,
        limit: 10,
      });
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    test('handles offset correctly', () => {
      const result = service.getInboxPaginated(recipientId, { limit: 2, offset: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
    });
  });

  // ==========================================================================
  // Get Unread Count
  // ==========================================================================

  describe('getUnreadCount', () => {
    beforeEach(() => {
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId2,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
    });

    test('returns count of unread items', () => {
      expect(service.getUnreadCount(recipientId)).toBe(2);
    });

    test('returns 0 for recipient with no items', () => {
      expect(service.getUnreadCount('el-nonexistent' as EntityId)).toBe(0);
    });

    test('decreases when items are marked as read', () => {
      const items = service.getInbox(recipientId);
      service.markAsRead(items[0].id);
      expect(service.getUnreadCount(recipientId)).toBe(1);
    });
  });

  // ==========================================================================
  // Get Inbox Item
  // ==========================================================================

  describe('getInboxItem', () => {
    test('returns inbox item by ID', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      const item = service.getInboxItem(created.id);
      expect(item).not.toBeNull();
      expect(item!.id).toBe(created.id);
      expect(item!.recipientId).toBe(recipientId);
    });

    test('returns null for non-existent ID', () => {
      const item = service.getInboxItem('inbox-nonexistent');
      expect(item).toBeNull();
    });
  });

  // ==========================================================================
  // Mark As Read
  // ==========================================================================

  describe('markAsRead', () => {
    test('marks item as read', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      const updated = service.markAsRead(created.id);

      expect(updated.status).toBe(InboxStatus.READ);
      expect(updated.readAt).not.toBeNull();
    });

    test('throws NotFoundError for non-existent item', () => {
      expect(() => service.markAsRead('inbox-nonexistent')).toThrow(NotFoundError);
    });

    test('returns item unchanged if already read', () => {
      // Use unique IDs to avoid UNIQUE constraint conflicts with other tests
      const uniqueMessageId = `el-msg-${crypto.randomUUID().substring(0, 8)}` as unknown as MessageId;
      const uniqueChannelId = `el-chan-${crypto.randomUUID().substring(0, 8)}` as unknown as ChannelId;
      const created = service.addToInbox({
        recipientId,
        messageId: uniqueMessageId,
        channelId: uniqueChannelId,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      const first = service.markAsRead(created.id);
      const second = service.markAsRead(created.id);

      expect(second.readAt).toBe(first.readAt);
    });

    test('does not update archived items', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      service.archive(created.id);
      const result = service.markAsRead(created.id);

      expect(result.status).toBe(InboxStatus.ARCHIVED);
    });
  });

  // ==========================================================================
  // Mark As Unread
  // ==========================================================================

  describe('markAsUnread', () => {
    test('marks item as unread', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      service.markAsRead(created.id);
      const updated = service.markAsUnread(created.id);

      expect(updated.status).toBe(InboxStatus.UNREAD);
      expect(updated.readAt).toBeNull();
    });

    test('throws NotFoundError for non-existent item', () => {
      expect(() => service.markAsUnread('inbox-nonexistent')).toThrow(NotFoundError);
    });

    test('returns item unchanged if already unread', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      const result = service.markAsUnread(created.id);
      expect(result.status).toBe(InboxStatus.UNREAD);
    });

    test('does not update archived items', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      service.archive(created.id);
      const result = service.markAsUnread(created.id);

      expect(result.status).toBe(InboxStatus.ARCHIVED);
    });
  });

  // ==========================================================================
  // Mark All As Read
  // ==========================================================================

  describe('markAllAsRead', () => {
    beforeEach(() => {
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId2,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId3,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
    });

    test('marks all unread items as read', () => {
      const count = service.markAllAsRead(recipientId);

      expect(count).toBe(3);
      expect(service.getUnreadCount(recipientId)).toBe(0);
    });

    test('returns 0 if no unread items', () => {
      service.markAllAsRead(recipientId);
      const count = service.markAllAsRead(recipientId);

      expect(count).toBe(0);
    });

    test('only affects specified recipient', () => {
      service.addToInbox({
        recipientId: recipientId2,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      service.markAllAsRead(recipientId);

      expect(service.getUnreadCount(recipientId)).toBe(0);
      expect(service.getUnreadCount(recipientId2)).toBe(1);
    });

    test('does not affect archived items', () => {
      const items = service.getInbox(recipientId);
      service.archive(items[0].id);

      const count = service.markAllAsRead(recipientId);

      expect(count).toBe(2);
    });
  });

  // ==========================================================================
  // Archive
  // ==========================================================================

  describe('archive', () => {
    test('archives an item', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      const updated = service.archive(created.id);

      expect(updated.status).toBe(InboxStatus.ARCHIVED);
    });

    test('throws NotFoundError for non-existent item', () => {
      expect(() => service.archive('inbox-nonexistent')).toThrow(NotFoundError);
    });

    test('can archive read items', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      service.markAsRead(created.id);
      const updated = service.archive(created.id);

      expect(updated.status).toBe(InboxStatus.ARCHIVED);
    });

    test('archived items not included in unread count', () => {
      const created = service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      expect(service.getUnreadCount(recipientId)).toBe(1);
      service.archive(created.id);
      expect(service.getUnreadCount(recipientId)).toBe(0);
    });
  });

  // ==========================================================================
  // Get Inbox By Channel
  // ==========================================================================

  describe('getInboxByChannel', () => {
    beforeEach(() => {
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId2,
        channelId: channelId2,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId3,
        channelId: channelId1,
        sourceType: InboxSourceType.MENTION,
        createdBy: senderId,
      });
    });

    test('returns items for specific channel', () => {
      const items = service.getInboxByChannel(recipientId, channelId1);
      expect(items).toHaveLength(2);
      items.forEach((item) => {
        expect(item.channelId).toBe(channelId1);
      });
    });

    test('returns empty array for channel with no items', () => {
      const items = service.getInboxByChannel(
        recipientId,
        'el-nonexistent' as unknown as ChannelId
      );
      expect(items).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Delete Operations
  // ==========================================================================

  describe('deleteByMessage', () => {
    test('deletes all inbox items for a message', () => {
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId: recipientId2,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId2,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      const count = service.deleteByMessage(messageId1 as string);

      expect(count).toBe(2);
      expect(service.getInbox(recipientId)).toHaveLength(1);
      expect(service.getInbox(recipientId2)).toHaveLength(0);
    });

    test('returns 0 when no items to delete', () => {
      const count = service.deleteByMessage('el-nonexistent');
      expect(count).toBe(0);
    });
  });

  describe('deleteByRecipient', () => {
    test('deletes all inbox items for a recipient', () => {
      service.addToInbox({
        recipientId,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId,
        messageId: messageId2,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });
      service.addToInbox({
        recipientId: recipientId2,
        messageId: messageId1,
        channelId: channelId1,
        sourceType: InboxSourceType.DIRECT,
        createdBy: senderId,
      });

      const count = service.deleteByRecipient(recipientId);

      expect(count).toBe(2);
      expect(service.getInbox(recipientId)).toHaveLength(0);
      expect(service.getInbox(recipientId2)).toHaveLength(1);
    });

    test('returns 0 when no items to delete', () => {
      const count = service.deleteByRecipient('el-nonexistent' as EntityId);
      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('createInboxService', () => {
    test('creates service instance', () => {
      const newService = createInboxService(db);
      expect(newService).toBeInstanceOf(InboxService);
    });
  });
});

// ============================================================================
// Migration Tests
// ============================================================================

describe('Inbox Schema Migration', () => {
  let db: StorageBackend;

  beforeEach(() => {
    db = createStorage({ path: ':memory:' });
  });

  afterEach(() => {
    db.close();
  });

  test('migration creates inbox_items table with correct columns', () => {
    // Import and run migrations
    
    initializeSchema(db);

    // Check columns
    const columns = db.query<{ name: string; type: string; notnull: number }>(
      'PRAGMA table_info(inbox_items)'
    );

    const columnMap = new Map(columns.map((c) => [c.name, c]));

    expect(columnMap.has('id')).toBe(true);
    expect(columnMap.has('recipient_id')).toBe(true);
    expect(columnMap.has('message_id')).toBe(true);
    expect(columnMap.has('channel_id')).toBe(true);
    expect(columnMap.has('source_type')).toBe(true);
    expect(columnMap.has('status')).toBe(true);
    expect(columnMap.has('read_at')).toBe(true);
    expect(columnMap.has('created_at')).toBe(true);

    // Check NOT NULL constraints
    expect(columnMap.get('recipient_id')!.notnull).toBe(1);
    expect(columnMap.get('message_id')!.notnull).toBe(1);
    expect(columnMap.get('channel_id')!.notnull).toBe(1);
    expect(columnMap.get('source_type')!.notnull).toBe(1);
    expect(columnMap.get('status')!.notnull).toBe(1);
    expect(columnMap.get('created_at')!.notnull).toBe(1);
    expect(columnMap.get('read_at')!.notnull).toBe(0); // NULL allowed
  });

  test('migration creates indexes', () => {
    
    initializeSchema(db);

    const indexes = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='inbox_items'"
    );

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_inbox_recipient_status');
    expect(indexNames).toContain('idx_inbox_recipient_created');
    expect(indexNames).toContain('idx_inbox_message');
  });

  test('unique constraint on recipient_id + message_id', () => {
    
    initializeSchema(db);

    // First, create a fake message in elements table to satisfy foreign key
    db.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['el-message', 'message', '{}', new Date().toISOString(), new Date().toISOString(), 'el-sender']
    );

    // Insert first item
    db.run(
      `INSERT INTO inbox_items (id, recipient_id, message_id, channel_id, source_type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['inbox-1', 'el-recipient', 'el-message', 'el-channel', 'direct', 'unread', new Date().toISOString()]
    );

    // Try to insert duplicate - should throw due to unique constraint
    expect(() =>
      db.run(
        `INSERT INTO inbox_items (id, recipient_id, message_id, channel_id, source_type, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['inbox-2', 'el-recipient', 'el-message', 'el-channel', 'mention', 'unread', new Date().toISOString()]
      )
    ).toThrow(); // Unique constraint error (message varies by backend)
  });

  test('check constraint on source_type', () => {
    
    initializeSchema(db);

    expect(() =>
      db.run(
        `INSERT INTO inbox_items (id, recipient_id, message_id, channel_id, source_type, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['inbox-1', 'el-recipient', 'el-message', 'el-channel', 'invalid', 'unread', new Date().toISOString()]
      )
    ).toThrow(/CHECK constraint failed/);
  });

  test('check constraint on status', () => {
    
    initializeSchema(db);

    expect(() =>
      db.run(
        `INSERT INTO inbox_items (id, recipient_id, message_id, channel_id, source_type, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['inbox-1', 'el-recipient', 'el-message', 'el-channel', 'direct', 'invalid', new Date().toISOString()]
      )
    ).toThrow(/CHECK constraint failed/);
  });
});
