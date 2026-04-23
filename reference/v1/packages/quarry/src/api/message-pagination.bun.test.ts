/**
 * Message Pagination Tests
 *
 * Tests for message-specific query filters (MessageFilter):
 * - Filter by channelId
 * - Filter by sender
 * - Filter by threadId (root messages vs replies)
 * - Filter by hasAttachments
 * - Pagination with limit/offset
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, EntityId, Channel, Message, MessageId, ChannelId, Document, DocumentId } from '@stoneforge/core';
import type { MessageFilter } from './types.js';
import { createGroupChannel, VisibilityValue, JoinPolicyValue, createMessage, createDocument } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityA = 'el-user1' as EntityId;
const mockEntityB = 'el-user2' as EntityId;
const mockEntityC = 'el-user3' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Message Pagination', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;
  let channelA: Channel;
  let channelB: Channel;
  let contentDocA: Document;
  let contentDocB: Document;
  let attachmentDoc: Document;

  beforeEach(async () => {
    // Create in-memory storage
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);

    // Create two test channels with all test users as members
    const channelAData = await createGroupChannel({
      name: 'channel-a',
      createdBy: mockEntityA,
      members: [mockEntityB, mockEntityC],
      visibility: VisibilityValue.PRIVATE,
      joinPolicy: JoinPolicyValue.INVITE_ONLY,
    });
    const channelBData = await createGroupChannel({
      name: 'channel-b',
      createdBy: mockEntityA,
      members: [mockEntityB, mockEntityC],
      visibility: VisibilityValue.PRIVATE,
      joinPolicy: JoinPolicyValue.INVITE_ONLY,
    });
    channelA = await api.create<Channel>(toCreateInput(channelAData));
    channelB = await api.create<Channel>(toCreateInput(channelBData));

    // Create documents for message content
    const docA = await createDocument({
      content: 'Content from A',
      contentType: 'text',
      createdBy: mockEntityA,
    });
    const docB = await createDocument({
      content: 'Content from B',
      contentType: 'text',
      createdBy: mockEntityB,
    });
    const attachDoc = await createDocument({
      content: 'Attachment content',
      contentType: 'text',
      createdBy: mockEntityA,
    });
    contentDocA = await api.create<Document>(toCreateInput(docA));
    contentDocB = await api.create<Document>(toCreateInput(docB));
    attachmentDoc = await api.create<Document>(toCreateInput(attachDoc));
  });

  afterEach(() => {
    backend.close();
  });

  // --------------------------------------------------------------------------
  // Filter by channelId
  // --------------------------------------------------------------------------

  describe('filter by channelId', () => {
    it('should filter messages by single channelId', async () => {
      // Create messages in both channels
      const msg1 = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const msg2 = await createMessage({
        channelId: channelB.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg1));
      await api.create<Message>(toCreateInput(msg2));

      // Query messages in channelA only
      const result = await api.listPaginated<Message>({
        type: 'message',
        channelId: channelA.id as unknown as ChannelId,
      } as MessageFilter);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].channelId).toBe(channelA.id);
      expect(result.total).toBe(1);
    });

    it('should filter messages by multiple channelIds', async () => {
      // Create messages in channel A
      const msg1 = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const msg2 = await createMessage({
        channelId: channelB.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg1));
      await api.create<Message>(toCreateInput(msg2));

      // Query messages in both channels
      const result = await api.listPaginated<Message>({
        type: 'message',
        channelId: [channelA.id as unknown as ChannelId, channelB.id as unknown as ChannelId],
      } as MessageFilter);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Filter by sender
  // --------------------------------------------------------------------------

  describe('filter by sender', () => {
    it('should filter messages by single sender', async () => {
      // Create messages from different senders
      const msg1 = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const msg2 = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg1));
      await api.create<Message>(toCreateInput(msg2));

      // Query messages from entityA only
      const result = await api.listPaginated<Message>({
        type: 'message',
        sender: mockEntityA,
      } as MessageFilter);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].sender).toBe(mockEntityA);
    });

    it('should filter messages by multiple senders', async () => {
      // Create messages from three senders
      const msg1 = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const msg2 = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
      });
      const msg3 = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityC,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg1));
      await api.create<Message>(toCreateInput(msg2));
      await api.create<Message>(toCreateInput(msg3));

      // Query messages from entityA and entityB
      const result = await api.listPaginated<Message>({
        type: 'message',
        sender: [mockEntityA, mockEntityB],
      } as MessageFilter);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Filter by threadId
  // --------------------------------------------------------------------------

  describe('filter by threadId', () => {
    it('should filter for root messages only (threadId = null)', async () => {
      // Create a root message
      const rootMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const createdRoot = await api.create<Message>(toCreateInput(rootMsgData));

      // Create a reply
      const replyMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
        threadId: createdRoot.id as unknown as MessageId,
      });
      await api.create<Message>(toCreateInput(replyMsgData));

      // Query root messages only
      const result = await api.listPaginated<Message>({
        type: 'message',
        threadId: null,
      } as MessageFilter);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].threadId).toBeNull();
    });

    it('should filter for messages in a specific thread', async () => {
      // Create a root message
      const rootMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const createdRoot = await api.create<Message>(toCreateInput(rootMsgData));

      // Create replies in the thread
      const reply1Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
        threadId: createdRoot.id as unknown as MessageId,
      });
      const reply2Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
        threadId: createdRoot.id as unknown as MessageId,
      });
      await api.create<Message>(toCreateInput(reply1Data));
      await api.create<Message>(toCreateInput(reply2Data));

      // Query messages in the thread
      const result = await api.listPaginated<Message>({
        type: 'message',
        threadId: createdRoot.id as unknown as MessageId,
      } as MessageFilter);

      expect(result.items).toHaveLength(2);
      expect(result.items.every((m) => m.threadId === createdRoot.id)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Filter by hasAttachments
  // --------------------------------------------------------------------------

  describe('filter by hasAttachments', () => {
    it('should filter for messages with attachments', async () => {
      // Create a message without attachments
      const noAttachMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
        attachments: [],
      });
      await api.create<Message>(toCreateInput(noAttachMsgData));

      // Create a message with attachments
      const withAttachMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
        attachments: [attachmentDoc.id as unknown as DocumentId],
      });
      await api.create<Message>(toCreateInput(withAttachMsgData));

      // Query messages with attachments
      const result = await api.listPaginated<Message>({
        type: 'message',
        hasAttachments: true,
      } as MessageFilter);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].attachments.length).toBeGreaterThan(0);
    });

    it('should filter for messages without attachments', async () => {
      // Create a message without attachments
      const noAttachMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
        attachments: [],
      });
      await api.create<Message>(toCreateInput(noAttachMsgData));

      // Create a message with attachments
      const withAttachMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
        attachments: [attachmentDoc.id as unknown as DocumentId],
      });
      await api.create<Message>(toCreateInput(withAttachMsgData));

      // Query messages without attachments
      const result = await api.listPaginated<Message>({
        type: 'message',
        hasAttachments: false,
      } as MessageFilter);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].attachments.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Pagination
  // --------------------------------------------------------------------------

  describe('pagination', () => {
    it('should paginate messages with limit and offset', async () => {
      // Create 5 messages
      for (let i = 0; i < 5; i++) {
        const msgData = await createMessage({
          channelId: channelA.id as unknown as ChannelId,
          sender: mockEntityA,
          contentRef: contentDocA.id as unknown as DocumentId,
        });
        await api.create<Message>(toCreateInput(msgData));
      }

      // Query first page (2 items)
      const page1 = await api.listPaginated<Message>({
        type: 'message',
        channelId: channelA.id as unknown as ChannelId,
        limit: 2,
        offset: 0,
      } as MessageFilter);

      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.hasMore).toBe(true);

      // Query second page
      const page2 = await api.listPaginated<Message>({
        type: 'message',
        channelId: channelA.id as unknown as ChannelId,
        limit: 2,
        offset: 2,
      } as MessageFilter);

      expect(page2.items).toHaveLength(2);
      expect(page2.offset).toBe(2);
      expect(page2.hasMore).toBe(true);

      // Query third page (only 1 remaining)
      const page3 = await api.listPaginated<Message>({
        type: 'message',
        channelId: channelA.id as unknown as ChannelId,
        limit: 2,
        offset: 4,
      } as MessageFilter);

      expect(page3.items).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it('should order messages by created_at descending by default', async () => {
      // Create messages - they will have the same or ascending timestamps
      const msg1Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const created1 = await api.create<Message>(toCreateInput(msg1Data));

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));

      const msg2Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const created2 = await api.create<Message>(toCreateInput(msg2Data));

      // Query messages (default order is desc)
      const result = await api.listPaginated<Message>({
        type: 'message',
        channelId: channelA.id as unknown as ChannelId,
      } as MessageFilter);

      expect(result.items).toHaveLength(2);
      // Most recent first (desc order) - created2 was created after created1
      expect(result.items[0].createdAt >= result.items[1].createdAt).toBe(true);
    });

    it('should support ascending order', async () => {
      // Create messages
      const msg1Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg1Data));

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));

      const msg2Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg2Data));

      // Query messages in ascending order
      const result = await api.listPaginated<Message>({
        type: 'message',
        channelId: channelA.id as unknown as ChannelId,
        orderDir: 'asc',
      } as MessageFilter);

      expect(result.items).toHaveLength(2);
      // Oldest first (asc order)
      expect(result.items[0].createdAt <= result.items[1].createdAt).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Combined filters
  // --------------------------------------------------------------------------

  describe('combined filters', () => {
    it('should combine channelId and sender filters', async () => {
      // Create messages from entityA in channelA
      const msg1Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg1Data));

      // Create messages from entityB in channelA
      const msg2Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg2Data));

      // Create messages from entityA in channelB
      const msg3Data = await createMessage({
        channelId: channelB.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(msg3Data));

      // Query messages from entityA in channelA only
      const result = await api.listPaginated<Message>({
        type: 'message',
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
      } as MessageFilter);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].channelId).toBe(channelA.id);
      expect(result.items[0].sender).toBe(mockEntityA);
    });

    it('should combine threadId with other filters', async () => {
      // Create a root message
      const rootMsgData = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
      });
      const createdRoot = await api.create<Message>(toCreateInput(rootMsgData));

      // Create replies from different senders
      const reply1Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: contentDocA.id as unknown as DocumentId,
        threadId: createdRoot.id as unknown as MessageId,
      });
      const reply2Data = await createMessage({
        channelId: channelA.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: contentDocB.id as unknown as DocumentId,
        threadId: createdRoot.id as unknown as MessageId,
      });
      await api.create<Message>(toCreateInput(reply1Data));
      await api.create<Message>(toCreateInput(reply2Data));

      // Query replies from entityA only
      const result = await api.listPaginated<Message>({
        type: 'message',
        threadId: createdRoot.id as unknown as MessageId,
        sender: mockEntityA,
      } as MessageFilter);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].sender).toBe(mockEntityA);
      expect(result.items[0].threadId).toBe(createdRoot.id);
    });
  });
});
