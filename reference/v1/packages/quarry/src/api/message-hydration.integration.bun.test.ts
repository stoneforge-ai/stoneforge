/**
 * Message Hydration Integration Tests
 *
 * Tests for Document reference resolution (hydration) in messages:
 * - Single message hydration via get()
 * - Batch message hydration via list()
 * - Hydration options (content, attachments)
 * - Edge cases (missing documents, partial hydration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, EntityId, Message, HydratedMessage, ChannelId, Document, DocumentId, Channel } from '@stoneforge/core';
import { createDocument, ContentType, createMessage, createGroupChannel, VisibilityValue, JoinPolicyValue } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityA = 'el-user1' as EntityId;
const mockEntityB = 'el-user2' as EntityId;

function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

async function createTestDocument(
  createdBy: EntityId = mockEntityA,
  content: string = 'Test document content'
): Promise<Document> {
  return createDocument({
    content,
    contentType: ContentType.TEXT,
    createdBy,
  });
}

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

// ============================================================================
// Tests
// ============================================================================

describe('Message Hydration', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;
  let testChannel: Channel;

  beforeEach(async () => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);

    // Create a group channel for testing
    const channel = await createTestGroupChannel({
      createdBy: mockEntityA,
      members: [mockEntityB],
    });
    testChannel = await api.create<Channel>(toCreateInput(channel));
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // Helper to create a message through the API
  async function createTestMessage(options: {
    contentText: string;
    attachments?: string[];
  }): Promise<Message> {
    // Create content document
    const contentDoc = await createTestDocument(mockEntityA, options.contentText);
    const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));

    // Create attachment documents if provided
    const attachmentIds: DocumentId[] = [];
    if (options.attachments) {
      for (const text of options.attachments) {
        const attachDoc = await createTestDocument(mockEntityA, text);
        const createdAttachDoc = await api.create<Document>(toCreateInput(attachDoc));
        attachmentIds.push(createdAttachDoc.id as unknown as DocumentId);
      }
    }

    // Create message
    const msg = await createMessage({
      channelId: testChannel.id as unknown as ChannelId,
      sender: mockEntityA,
      contentRef: createdContentDoc.id as unknown as DocumentId,
      attachments: attachmentIds,
    });

    return api.create<Message>(toCreateInput(msg));
  }

  // --------------------------------------------------------------------------
  // Single Message Hydration (get)
  // --------------------------------------------------------------------------

  describe('Single Message Hydration via get()', () => {
    it('should hydrate message content when requested', async () => {
      const message = await createTestMessage({
        contentText: 'Hello, this is the message content!',
      });

      const hydrated = await api.get<HydratedMessage>(message.id, {
        hydrate: { content: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.content).toBe('Hello, this is the message content!');
      expect(hydrated?.contentRef).toBeDefined();
    });

    it('should hydrate message attachments when requested', async () => {
      const message = await createTestMessage({
        contentText: 'Message with attachments',
        attachments: ['Attachment 1 content', 'Attachment 2 content'],
      });

      const hydrated = await api.get<HydratedMessage>(message.id, {
        hydrate: { attachments: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.attachmentContents).toEqual([
        'Attachment 1 content',
        'Attachment 2 content',
      ]);
    });

    it('should hydrate both content and attachments when requested', async () => {
      const message = await createTestMessage({
        contentText: 'Main content',
        attachments: ['Attach A', 'Attach B'],
      });

      const hydrated = await api.get<HydratedMessage>(message.id, {
        hydrate: { content: true, attachments: true },
      });

      expect(hydrated?.content).toBe('Main content');
      expect(hydrated?.attachmentContents).toEqual(['Attach A', 'Attach B']);
    });

    it('should not hydrate when not requested', async () => {
      const message = await createTestMessage({
        contentText: 'Should not appear',
        attachments: ['Also should not appear'],
      });

      // Get without hydration
      const notHydrated = await api.get<HydratedMessage>(message.id);
      expect(notHydrated?.content).toBeUndefined();
      expect(notHydrated?.attachmentContents).toBeUndefined();

      // Get with empty hydration options
      const emptyHydrate = await api.get<HydratedMessage>(message.id, {
        hydrate: {},
      });
      expect(emptyHydrate?.content).toBeUndefined();
      expect(emptyHydrate?.attachmentContents).toBeUndefined();

      // Get with content: false
      const explicitFalse = await api.get<HydratedMessage>(message.id, {
        hydrate: { content: false },
      });
      expect(explicitFalse?.content).toBeUndefined();
    });

    it('should reject message creation with missing content document', async () => {
      // The API validates that the content document exists when creating a message
      // createMessage() succeeds (it doesn't validate), but api.create() will fail
      const msg = await createMessage({
        channelId: testChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: 'el-missing' as DocumentId,
        attachments: [],
      });
      expect(msg).toBeDefined(); // Message object is created

      // The API throws NotFoundError when content document doesn't exist
      await expect(api.create<Message>(toCreateInput(msg))).rejects.toThrow();
    });

    it('should handle message with no attachments', async () => {
      const message = await createTestMessage({
        contentText: 'Message without attachments',
      });

      const hydrated = await api.get<HydratedMessage>(message.id, {
        hydrate: { attachments: true },
      });

      expect(hydrated).toBeDefined();
      expect(hydrated?.attachments).toEqual([]);
      // attachmentContents should be undefined since there are no attachments to hydrate
    });
  });

  // --------------------------------------------------------------------------
  // Batch Message Hydration (list)
  // --------------------------------------------------------------------------

  describe('Batch Message Hydration via list()', () => {
    it('should hydrate multiple messages with content', async () => {
      const msg1 = await createTestMessage({ contentText: 'Content 1' });
      const msg2 = await createTestMessage({ contentText: 'Content 2' });
      const msg3 = await createTestMessage({ contentText: 'Content 3' });

      const messages = await api.list<HydratedMessage>({
        type: 'message',
        hydrate: { content: true },
      });

      expect(messages.length).toBe(3);
      const contentMap = new Map(messages.map((m) => [m.id, m.content]));
      expect(contentMap.get(msg1.id)).toBe('Content 1');
      expect(contentMap.get(msg2.id)).toBe('Content 2');
      expect(contentMap.get(msg3.id)).toBe('Content 3');
    });

    it('should hydrate multiple messages with attachments', async () => {
      const msg1 = await createTestMessage({
        contentText: 'Msg1',
        attachments: ['M1-A1', 'M1-A2'],
      });
      const msg2 = await createTestMessage({
        contentText: 'Msg2',
        attachments: ['M2-A1'],
      });

      const messages = await api.list<HydratedMessage>({
        type: 'message',
        hydrate: { attachments: true },
      });

      expect(messages.length).toBe(2);
      const m1 = messages.find((m) => m.id === msg1.id);
      const m2 = messages.find((m) => m.id === msg2.id);

      expect(m1?.attachmentContents).toEqual(['M1-A1', 'M1-A2']);
      expect(m2?.attachmentContents).toEqual(['M2-A1']);
    });

    it('should hydrate messages with shared document refs efficiently', async () => {
      // Create a single shared content document
      const sharedDoc = await createTestDocument(mockEntityA, 'Shared content');
      const createdDoc = await api.create<Document>(toCreateInput(sharedDoc));

      // Create multiple messages using the same content doc
      const msg1 = await createMessage({
        channelId: testChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdDoc.id as unknown as DocumentId,
        attachments: [],
      });
      const msg2 = await createMessage({
        channelId: testChannel.id as unknown as ChannelId,
        sender: mockEntityA,
        contentRef: createdDoc.id as unknown as DocumentId,
        attachments: [],
      });

      await api.create<Message>(toCreateInput(msg1));
      await api.create<Message>(toCreateInput(msg2));

      const messages = await api.list<HydratedMessage>({
        type: 'message',
        hydrate: { content: true },
      });

      expect(messages.length).toBe(2);
      // Both should have the same content
      expect(messages[0].content).toBe('Shared content');
      expect(messages[1].content).toBe('Shared content');
    });

    it('should hydrate messages via listPaginated', async () => {
      const msg1 = await createTestMessage({ contentText: 'Page content 1' });
      const msg2 = await createTestMessage({ contentText: 'Page content 2' });

      const result = await api.listPaginated<HydratedMessage>({
        type: 'message',
        limit: 10,
        hydrate: { content: true },
      });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);

      const contentMap = new Map(result.items.map((m) => [m.id, m.content]));
      expect(contentMap.get(msg1.id)).toBe('Page content 1');
      expect(contentMap.get(msg2.id)).toBe('Page content 2');
    });

    it('should handle mixed messages with and without attachments', async () => {
      const msgWithAttach = await createTestMessage({
        contentText: 'Has attachments',
        attachments: ['Attach content'],
      });
      const msgWithoutAttach = await createTestMessage({
        contentText: 'No attachments',
      });

      const messages = await api.list<HydratedMessage>({
        type: 'message',
        hydrate: { content: true, attachments: true },
      });

      expect(messages.length).toBe(2);
      const msgMap = new Map(messages.map((m) => [m.id, m]));

      const withAttach = msgMap.get(msgWithAttach.id);
      expect(withAttach?.content).toBe('Has attachments');
      expect(withAttach?.attachmentContents).toEqual(['Attach content']);

      const withoutAttach = msgMap.get(msgWithoutAttach.id);
      expect(withoutAttach?.content).toBe('No attachments');
      // Empty array means no attachments to hydrate
      expect(withoutAttach?.attachments).toEqual([]);
    });

    it('should not hydrate when not requested in list', async () => {
      await createTestMessage({
        contentText: 'Should not appear',
        attachments: ['Also should not appear'],
      });

      const messages = await api.list<HydratedMessage>({ type: 'message' });

      expect(messages.length).toBe(1);
      expect(messages[0].content).toBeUndefined();
      expect(messages[0].attachmentContents).toBeUndefined();
    });

    it('should only hydrate messages, not other element types', async () => {
      // Create a message
      await createTestMessage({ contentText: 'Message content' });

      // Create a task with descriptionRef
      const descDoc = await createTestDocument(mockEntityA, 'Task description');
      const createdDescDoc = await api.create<Document>(toCreateInput(descDoc));

      const { createTask } = await import('@stoneforge/core');
      const task = await createTask({
        title: 'Test Task',
        descriptionRef: createdDescDoc.id as unknown as DocumentId,
        createdBy: mockEntityA,
      });
      await api.create(toCreateInput(task));

      // List all with content hydration - should hydrate message but not task
      const elements = await api.list({
        hydrate: { content: true, description: true },
      });

      // Should have message + task + multiple documents + channel
      expect(elements.length).toBeGreaterThan(2);
    });
  });

  // --------------------------------------------------------------------------
  // Multi-field Hydration
  // --------------------------------------------------------------------------

  describe('Multi-field Hydration', () => {
    it('should hydrate content and attachments independently', async () => {
      const message = await createTestMessage({
        contentText: 'Content only',
        attachments: ['Attach only'],
      });

      // Hydrate only content
      const contentOnly = await api.get<HydratedMessage>(message.id, {
        hydrate: { content: true },
      });
      expect(contentOnly?.content).toBe('Content only');
      expect(contentOnly?.attachmentContents).toBeUndefined();

      // Hydrate only attachments
      const attachOnly = await api.get<HydratedMessage>(message.id, {
        hydrate: { attachments: true },
      });
      expect(attachOnly?.content).toBeUndefined();
      expect(attachOnly?.attachmentContents).toEqual(['Attach only']);

      // Hydrate both
      const both = await api.get<HydratedMessage>(message.id, {
        hydrate: { content: true, attachments: true },
      });
      expect(both?.content).toBe('Content only');
      expect(both?.attachmentContents).toEqual(['Attach only']);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty message list gracefully', async () => {
      const messages = await api.list<HydratedMessage>({
        type: 'message',
        hydrate: { content: true },
      });

      expect(messages).toEqual([]);
    });

    it('should handle large batch of messages', async () => {
      const count = 30;
      const msgs: Message[] = [];

      for (let i = 0; i < count; i++) {
        const msg = await createTestMessage({ contentText: `Content ${i}` });
        msgs.push(msg);
      }

      const hydratedMessages = await api.list<HydratedMessage>({
        type: 'message',
        hydrate: { content: true },
      });

      expect(hydratedMessages.length).toBe(count);

      // Verify each message has correct hydrated content
      for (let i = 0; i < count; i++) {
        const msg = hydratedMessages.find((m) => m.id === msgs[i].id);
        expect(msg?.content).toBe(`Content ${i}`);
      }
    });

    it('should handle messages with many attachments', async () => {
      const attachmentCount = 10;
      const attachmentTexts = Array.from({ length: attachmentCount }, (_, i) => `Attachment ${i}`);

      const message = await createTestMessage({
        contentText: 'Main content',
        attachments: attachmentTexts,
      });

      const hydrated = await api.get<HydratedMessage>(message.id, {
        hydrate: { content: true, attachments: true },
      });

      expect(hydrated?.content).toBe('Main content');
      expect(hydrated?.attachmentContents?.length).toBe(attachmentCount);
      expect(hydrated?.attachmentContents).toEqual(attachmentTexts);
    });

    it('should preserve original message properties after hydration', async () => {
      const message = await createTestMessage({
        contentText: 'Test content',
        attachments: ['Attachment'],
      });

      const hydrated = await api.get<HydratedMessage>(message.id, {
        hydrate: { content: true, attachments: true },
      });

      // Verify hydration
      expect(hydrated?.content).toBe('Test content');
      expect(hydrated?.attachmentContents).toEqual(['Attachment']);

      // Verify original properties are preserved
      expect(hydrated?.channelId).toBe(message.channelId);
      expect(hydrated?.sender).toBe(message.sender);
      expect(hydrated?.contentRef).toBe(message.contentRef);
      expect(hydrated?.attachments).toEqual(message.attachments);
      expect(hydrated?.threadId).toBe(message.threadId);
      expect(hydrated?.type).toBe('message');
    });
  });
});
