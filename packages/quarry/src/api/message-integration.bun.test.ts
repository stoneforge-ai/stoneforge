/**
 * Message Integration Tests
 *
 * Tests for message integration with channels:
 * - Sender membership validation
 * - sendDirectMessage helper
 * - Auto-create direct channels
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, EntityId, Channel, Message, Document, ChannelId, DocumentId, MessageId, HydratedMessage } from '@stoneforge/core';
import {
  createGroupChannel,
  createDirectChannel,
  ChannelTypeValue,
  VisibilityValue,
  JoinPolicyValue,
  NotAMemberError,
  createMessage,
  createDocument,
  NotFoundError,
} from '@stoneforge/core';

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

/**
 * Create a test group channel
 */
async function createTestGroupChannel(
  overrides: Partial<Parameters<typeof createGroupChannel>[0]> = {}
): Promise<Channel> {
  return createGroupChannel({
    name: 'test-channel',
    createdBy: mockEntityA,
    members: [mockEntityB],
    visibility: VisibilityValue.PRIVATE,
    joinPolicy: JoinPolicyValue.INVITE_ONLY,
    ...overrides,
  });
}

/**
 * Create a test document for message content
 */
async function createTestDocument(
  createdBy: EntityId = mockEntityA,
  content: string = 'Test message content'
): Promise<Document> {
  return createDocument({
    content,
    contentType: 'text',
    createdBy,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Message Integration', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;

  beforeEach(async () => {
    // Create in-memory storage
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);
  });

  afterEach(() => {
    backend.close();
  });

  // --------------------------------------------------------------------------
  // Sender Membership Validation
  // --------------------------------------------------------------------------

  describe('Sender Membership Validation', () => {
    it('should allow message creation when sender is a channel member', async () => {
      // Create a group channel with A as creator and B as member
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a document for the message content
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Create a message from member A (creator is automatically a member)
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdDoc.id as unknown as DocumentId,
      });

      // Should succeed
      const createdMessage = await api.create<Message>(toCreateInput(message));
      expect(createdMessage).toBeDefined();
      expect(createdMessage.channelId).toBe(createdChannel.id);
      expect(createdMessage.sender).toBe(mockEntityA);
    });

    it('should reject message creation when sender is not a channel member', async () => {
      // Create a group channel with A as creator and B as member (C is NOT a member)
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a document for the message content
      const doc = await createTestDocument(mockEntityC);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Try to create a message from non-member C
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityC,
        contentRef: createdDoc.id as unknown as DocumentId,
      });

      // Should throw NotAMemberError
      await expect(api.create<Message>(toCreateInput(message))).rejects.toThrow(NotAMemberError);
    });

    it('should reject message creation when channel does not exist', async () => {
      // Create a document for the message content
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Try to create a message for a non-existent channel
      const message = await createMessage({
        channelId: 'el-xyz123' as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdDoc.id as unknown as DocumentId,
      });

      // Should throw NotFoundError
      await expect(api.create<Message>(toCreateInput(message))).rejects.toThrow(NotFoundError);
    });

    it('should allow message from any member in direct channel', async () => {
      // Create a direct channel between A and B
      const channel = await createDirectChannel({
        entityA: mockEntityA,
        entityB: mockEntityB,
        createdBy: mockEntityA,
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a document for the message content
      const doc = await createTestDocument(mockEntityB);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Create a message from member B (the other party in direct channel)
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: createdDoc.id as unknown as DocumentId,
      });

      // Should succeed
      const createdMessage = await api.create<Message>(toCreateInput(message));
      expect(createdMessage).toBeDefined();
      expect(createdMessage.sender).toBe(mockEntityB);
    });
  });

  // --------------------------------------------------------------------------
  // sendDirectMessage Helper
  // --------------------------------------------------------------------------

  describe('sendDirectMessage', () => {
    it('should create channel and message for first direct message', async () => {
      // Create a document for the message content
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Send a direct message from A to B
      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as DocumentId,
      });

      // Should create a new channel
      expect(result.channelCreated).toBe(true);
      expect(result.channel).toBeDefined();
      expect(result.channel.channelType).toBe(ChannelTypeValue.DIRECT);
      expect(result.channel.members).toContain(mockEntityA);
      expect(result.channel.members).toContain(mockEntityB);

      // Should create the message
      expect(result.message).toBeDefined();
      expect(result.message.sender).toBe(mockEntityA);
      expect(result.message.channelId).toBe(result.channel.id);
    });

    it('should reuse existing channel for subsequent direct messages', async () => {
      // Create first document
      const doc1 = await createTestDocument(mockEntityA, 'First message');
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));

      // Send first direct message
      const result1 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc1.id as unknown as DocumentId,
      });
      expect(result1.channelCreated).toBe(true);

      // Create second document
      const doc2 = await createTestDocument(mockEntityA, 'Second message');
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));

      // Send second direct message
      const result2 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc2.id as unknown as DocumentId,
      });

      // Should reuse existing channel
      expect(result2.channelCreated).toBe(false);
      expect(result2.channel.id).toBe(result1.channel.id);
    });

    it('should allow recipient to reply using sendDirectMessage', async () => {
      // A sends message to B
      const doc1 = await createTestDocument(mockEntityA);
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const result1 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc1.id as unknown as DocumentId,
      });

      // B replies to A (recipient is now A)
      const doc2 = await createTestDocument(mockEntityB);
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));
      const result2 = await api.sendDirectMessage(mockEntityB, {
        recipient: mockEntityA,
        contentRef: createdDoc2.id as unknown as DocumentId,
      });

      // Should use same channel (deterministic naming)
      expect(result2.channel.id).toBe(result1.channel.id);
      expect(result2.channelCreated).toBe(false);
      expect(result2.message.sender).toBe(mockEntityB);
    });

    it('should include attachments in direct message', async () => {
      // Create content and attachment documents
      const contentDoc = await createTestDocument(mockEntityA, 'Message with attachment');
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));

      const attachmentDoc = await createTestDocument(mockEntityA, 'Attachment content');
      const createdAttachmentDoc = await api.create<Document>(toCreateInput(attachmentDoc));

      // Send direct message with attachment
      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdContentDoc.id as unknown as DocumentId,
        attachments: [createdAttachmentDoc.id as unknown as DocumentId],
      });

      expect(result.message.attachments).toHaveLength(1);
      expect(result.message.attachments[0]).toBe(createdAttachmentDoc.id);
    });

    it('should include tags and metadata in direct message', async () => {
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as DocumentId,
        tags: ['important', 'urgent'],
        metadata: { priority: 'high' },
      });

      expect(result.message.tags).toEqual(['important', 'urgent']);
      expect(result.message.metadata).toEqual({ priority: 'high' });
    });
  });

  // --------------------------------------------------------------------------
  // Auto-create Direct Channels
  // --------------------------------------------------------------------------

  describe('Auto-create Direct Channels', () => {
    it('should auto-create channel with correct permissions', async () => {
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as DocumentId,
      });

      // Direct channels should be private and invite-only
      expect(result.channel.permissions.visibility).toBe(VisibilityValue.PRIVATE);
      expect(result.channel.permissions.joinPolicy).toBe(JoinPolicyValue.INVITE_ONLY);
      expect(result.channel.permissions.modifyMembers).toHaveLength(0);
    });

    it('should generate deterministic channel name', async () => {
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as DocumentId,
      });

      // Channel name should be sorted entity IDs joined by colon
      const expectedName = [mockEntityA, mockEntityB].sort().join(':');
      expect(result.channel.name).toBe(expectedName);
    });

    it('should work regardless of sender/recipient order', async () => {
      // A messages B
      const doc1 = await createTestDocument(mockEntityA);
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const result1 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc1.id as unknown as DocumentId,
      });

      // Later, B messages A (same pair, different order)
      const doc2 = await createTestDocument(mockEntityB);
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));
      const result2 = await api.sendDirectMessage(mockEntityB, {
        recipient: mockEntityA,
        contentRef: createdDoc2.id as unknown as DocumentId,
      });

      // Both should use the same channel
      expect(result1.channel.name).toBe(result2.channel.name);
      expect(result1.channel.id).toBe(result2.channel.id);
    });
  });

  // --------------------------------------------------------------------------
  // Document Reference Validation
  // --------------------------------------------------------------------------

  describe('Document Reference Validation', () => {
    it('should reject message creation when contentRef document does not exist', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Try to create a message with non-existent contentRef
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: 'el-abc123' as unknown as DocumentId,
      });

      // Should throw NotFoundError for document
      await expect(api.create<Message>(toCreateInput(message))).rejects.toThrow(NotFoundError);
    });

    it('should reject message creation when attachment document does not exist', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a valid content document
      const contentDoc = await createTestDocument(mockEntityA);
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));

      // Try to create a message with non-existent attachment
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdContentDoc.id as unknown as DocumentId,
        attachments: ['el-xyz789' as unknown as DocumentId],
      });

      // Should throw NotFoundError for attachment document
      await expect(api.create<Message>(toCreateInput(message))).rejects.toThrow(NotFoundError);
    });

    it('should accept message with valid contentRef and attachments', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create content and attachment documents
      const contentDoc = await createTestDocument(mockEntityA, 'Message content');
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));
      const attachmentDoc = await createTestDocument(mockEntityA, 'Attachment content');
      const createdAttachmentDoc = await api.create<Document>(toCreateInput(attachmentDoc));

      // Create message with valid refs
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdContentDoc.id as unknown as DocumentId,
        attachments: [createdAttachmentDoc.id as unknown as DocumentId],
      });

      // Should succeed
      const createdMessage = await api.create<Message>(toCreateInput(message));
      expect(createdMessage).toBeDefined();
      expect(createdMessage.contentRef).toBe(createdContentDoc.id);
      expect(createdMessage.attachments).toHaveLength(1);
      expect(createdMessage.attachments[0]).toBe(createdAttachmentDoc.id);
    });
  });

  // --------------------------------------------------------------------------
  // Thread Integrity Validation
  // --------------------------------------------------------------------------

  describe('Thread Integrity Validation', () => {
    it('should reject reply when threadId message does not exist', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a valid content document
      const contentDoc = await createTestDocument(mockEntityA);
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));

      // Try to create a message replying to non-existent thread parent
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdContentDoc.id as unknown as DocumentId,
        threadId: 'el-noexist' as unknown as MessageId,
      });

      // Should throw NotFoundError for thread parent
      await expect(api.create<Message>(toCreateInput(message))).rejects.toThrow(NotFoundError);
    });

    it('should reject reply when threadId message is in a different channel', async () => {
      // Create two group channels
      const channel1 = await createTestGroupChannel({
        name: 'channel-1',
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel1 = await api.create<Channel>(toCreateInput(channel1));

      const channel2 = await createTestGroupChannel({
        name: 'channel-2',
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel2 = await api.create<Channel>(toCreateInput(channel2));

      // Create a root message in channel 1
      const rootDoc = await createTestDocument(mockEntityA, 'Root message');
      const createdRootDoc = await api.create<Document>(toCreateInput(rootDoc));
      const rootMessage = await createMessage({
        channelId: createdChannel1.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdRootDoc.id as unknown as DocumentId,
      });
      const createdRootMessage = await api.create<Message>(toCreateInput(rootMessage));

      // Try to create a reply in channel 2 referencing message in channel 1
      const replyDoc = await createTestDocument(mockEntityA, 'Reply message');
      const createdReplyDoc = await api.create<Document>(toCreateInput(replyDoc));
      const replyMessage = await createMessage({
        channelId: createdChannel2.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdReplyDoc.id as unknown as DocumentId,
        threadId: createdRootMessage.id as unknown as MessageId,
      });

      // Should throw ConstraintError for cross-channel threading
      await expect(api.create<Message>(toCreateInput(replyMessage))).rejects.toThrow(
        'Thread parent message is in a different channel'
      );
    });

    it('should allow valid thread reply in same channel', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a root message
      const rootDoc = await createTestDocument(mockEntityA, 'Root message');
      const createdRootDoc = await api.create<Document>(toCreateInput(rootDoc));
      const rootMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdRootDoc.id as unknown as DocumentId,
      });
      const createdRootMessage = await api.create<Message>(toCreateInput(rootMessage));

      // Create a reply in the same channel
      const replyDoc = await createTestDocument(mockEntityB, 'Reply message');
      const createdReplyDoc = await api.create<Document>(toCreateInput(replyDoc));
      const replyMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: createdReplyDoc.id as unknown as DocumentId,
        threadId: createdRootMessage.id as unknown as MessageId,
      });

      // Should succeed
      const createdReplyMessage = await api.create<Message>(toCreateInput(replyMessage));
      expect(createdReplyMessage).toBeDefined();
      expect(createdReplyMessage.threadId).toBe(createdRootMessage.id);
    });
  });

  // --------------------------------------------------------------------------
  // Message Hydration
  // --------------------------------------------------------------------------

  describe('Message Hydration', () => {
    it('should hydrate message content on get()', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create content document with specific content
      const contentDoc = await createTestDocument(mockEntityA, 'Hydrated content text');
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));

      // Create message
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdContentDoc.id as unknown as DocumentId,
      });
      const createdMessage = await api.create<Message>(toCreateInput(message));

      // Fetch with hydration
      const hydratedMessage = await api.get<Message>(createdMessage.id, {
        hydrate: { content: true },
      }) as HydratedMessage;

      expect(hydratedMessage).toBeDefined();
      expect(hydratedMessage.content).toBe('Hydrated content text');
    });

    it('should hydrate message attachments on get()', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create content and attachment documents
      const contentDoc = await createTestDocument(mockEntityA, 'Message content');
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));
      const attachment1 = await createTestDocument(mockEntityA, 'Attachment 1 content');
      const createdAttachment1 = await api.create<Document>(toCreateInput(attachment1));
      const attachment2 = await createTestDocument(mockEntityA, 'Attachment 2 content');
      const createdAttachment2 = await api.create<Document>(toCreateInput(attachment2));

      // Create message with attachments
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdContentDoc.id as unknown as DocumentId,
        attachments: [
          createdAttachment1.id as unknown as DocumentId,
          createdAttachment2.id as unknown as DocumentId,
        ],
      });
      const createdMessage = await api.create<Message>(toCreateInput(message));

      // Fetch with attachment hydration
      const hydratedMessage = await api.get<Message>(createdMessage.id, {
        hydrate: { attachments: true },
      }) as HydratedMessage;

      expect(hydratedMessage).toBeDefined();
      expect(hydratedMessage.attachmentContents).toHaveLength(2);
      expect(hydratedMessage.attachmentContents).toContain('Attachment 1 content');
      expect(hydratedMessage.attachmentContents).toContain('Attachment 2 content');
    });

    it('should hydrate both content and attachments on get()', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create content and attachment documents
      const contentDoc = await createTestDocument(mockEntityA, 'The main content');
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));
      const attachmentDoc = await createTestDocument(mockEntityA, 'The attachment');
      const createdAttachmentDoc = await api.create<Document>(toCreateInput(attachmentDoc));

      // Create message
      const message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdContentDoc.id as unknown as DocumentId,
        attachments: [createdAttachmentDoc.id as unknown as DocumentId],
      });
      const createdMessage = await api.create<Message>(toCreateInput(message));

      // Fetch with full hydration
      const hydratedMessage = await api.get<Message>(createdMessage.id, {
        hydrate: { content: true, attachments: true },
      }) as HydratedMessage;

      expect(hydratedMessage.content).toBe('The main content');
      expect(hydratedMessage.attachmentContents).toHaveLength(1);
      expect(hydratedMessage.attachmentContents![0]).toBe('The attachment');
    });

    it('should hydrate messages in list()', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create content documents
      const contentDoc1 = await createTestDocument(mockEntityA, 'Message 1 content');
      const createdContentDoc1 = await api.create<Document>(toCreateInput(contentDoc1));
      const contentDoc2 = await createTestDocument(mockEntityB, 'Message 2 content');
      const createdContentDoc2 = await api.create<Document>(toCreateInput(contentDoc2));

      // Create messages
      const message1 = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdContentDoc1.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(message1));

      const message2 = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: createdContentDoc2.id as unknown as DocumentId,
      });
      await api.create<Message>(toCreateInput(message2));

      // List with hydration
      const messages = await api.list<Message>({
        type: 'message',
        hydrate: { content: true },
      }) as HydratedMessage[];

      expect(messages).toHaveLength(2);
      const contents = messages.map((m) => m.content);
      expect(contents).toContain('Message 1 content');
      expect(contents).toContain('Message 2 content');
    });
  });

  // --------------------------------------------------------------------------
  // Replies-To Dependency Creation
  // --------------------------------------------------------------------------

  describe('Replies-To Dependency Creation', () => {
    it('should create replies-to dependency when message has threadId', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a root message
      const rootDoc = await createTestDocument(mockEntityA, 'Root message');
      const createdRootDoc = await api.create<Document>(toCreateInput(rootDoc));
      const rootMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdRootDoc.id as unknown as DocumentId,
      });
      const createdRootMessage = await api.create<Message>(toCreateInput(rootMessage));

      // Create a reply message
      const replyDoc = await createTestDocument(mockEntityB, 'Reply message');
      const createdReplyDoc = await api.create<Document>(toCreateInput(replyDoc));
      const replyMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: createdReplyDoc.id as unknown as DocumentId,
        threadId: createdRootMessage.id as unknown as MessageId,
      });
      const createdReplyMessage = await api.create<Message>(toCreateInput(replyMessage));

      // Check that the replies-to dependency was created
      const dependencies = await api.getDependencies(createdReplyMessage.id);
      const repliesToDep = dependencies.find((d) => d.type === 'replies-to');

      expect(repliesToDep).toBeDefined();
      expect(repliesToDep!.blockedId).toBe(createdReplyMessage.id);
      expect(repliesToDep!.blockerId).toBe(createdRootMessage.id);
    });

    it('should not create replies-to dependency when message has no threadId', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a root message (no threadId)
      const rootDoc = await createTestDocument(mockEntityA, 'Root message');
      const createdRootDoc = await api.create<Document>(toCreateInput(rootDoc));
      const rootMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdRootDoc.id as unknown as DocumentId,
      });
      const createdRootMessage = await api.create<Message>(toCreateInput(rootMessage));

      // Check that no replies-to dependency exists
      const dependencies = await api.getDependencies(createdRootMessage.id);
      const repliesToDep = dependencies.find((d) => d.type === 'replies-to');

      expect(repliesToDep).toBeUndefined();
    });

    it('should record dependency_added event when creating replies-to dependency', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a root message
      const rootDoc = await createTestDocument(mockEntityA, 'Root message');
      const createdRootDoc = await api.create<Document>(toCreateInput(rootDoc));
      const rootMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdRootDoc.id as unknown as DocumentId,
      });
      const createdRootMessage = await api.create<Message>(toCreateInput(rootMessage));

      // Create a reply message
      const replyDoc = await createTestDocument(mockEntityB, 'Reply message');
      const createdReplyDoc = await api.create<Document>(toCreateInput(replyDoc));
      const replyMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: createdReplyDoc.id as unknown as DocumentId,
        threadId: createdRootMessage.id as unknown as MessageId,
      });
      const createdReplyMessage = await api.create<Message>(toCreateInput(replyMessage));

      // Check that the dependency_added event was recorded
      const events = await api.getEvents(createdReplyMessage.id);
      const depAddedEvent = events.find((e) => e.eventType === 'dependency_added');

      expect(depAddedEvent).toBeDefined();
      expect(depAddedEvent!.actor).toBe(mockEntityB);
      expect(depAddedEvent!.newValue).toEqual({
        blockedId: createdReplyMessage.id,
        blockerId: createdRootMessage.id,
        type: 'replies-to',
        metadata: {},
      });
    });

    it('should allow querying dependents to find replies to a message', async () => {
      // Create a group channel
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a root message
      const rootDoc = await createTestDocument(mockEntityA, 'Root message');
      const createdRootDoc = await api.create<Document>(toCreateInput(rootDoc));
      const rootMessage = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdRootDoc.id as unknown as DocumentId,
      });
      const createdRootMessage = await api.create<Message>(toCreateInput(rootMessage));

      // Create two replies
      const reply1Doc = await createTestDocument(mockEntityB, 'Reply 1');
      const createdReply1Doc = await api.create<Document>(toCreateInput(reply1Doc));
      const reply1Message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityB,
        contentRef: createdReply1Doc.id as unknown as DocumentId,
        threadId: createdRootMessage.id as unknown as MessageId,
      });
      const createdReply1 = await api.create<Message>(toCreateInput(reply1Message));

      const reply2Doc = await createTestDocument(mockEntityA, 'Reply 2');
      const createdReply2Doc = await api.create<Document>(toCreateInput(reply2Doc));
      const reply2Message = await createMessage({
        channelId: createdChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdReply2Doc.id as unknown as DocumentId,
        threadId: createdRootMessage.id as unknown as MessageId,
      });
      const createdReply2 = await api.create<Message>(toCreateInput(reply2Message));

      // Query dependents of the root message to find all replies
      const dependents = await api.getDependents(createdRootMessage.id, ['replies-to']);

      expect(dependents).toHaveLength(2);
      const replyIds = dependents.map((d) => d.blockedId);
      expect(replyIds).toContain(createdReply1.id);
      expect(replyIds).toContain(createdReply2.id);
    });
  });
});
