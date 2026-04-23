import { describe, expect, test } from 'bun:test';
import {
  Message,
  HydratedMessage,
  MessageId,
  ChannelId,
  MAX_ATTACHMENTS,
  isValidChannelId,
  validateChannelId,
  isValidMessageId,
  validateMessageId,
  isValidMessageDocumentId,
  validateMessageDocumentId,
  isValidMessageSenderId,
  validateMessageSenderId,
  isValidThreadId,
  validateThreadId,
  isValidAttachments,
  validateAttachments,
  isMessage,
  validateMessage,
  createMessage,
  CreateMessageInput,
  MessageImmutableError,
  rejectMessageUpdate,
  rejectMessageDelete,
  isRootMessage,
  isReply,
  hasAttachments,
  getAttachmentCount,
  isSentBy,
  isInChannel,
  isInThread,
  filterByChannel,
  filterBySender,
  filterByThread,
  filterRootMessages,
  filterReplies,
  sortByCreatedAt,
  sortByCreatedAtDesc,
  getThreadMessages,
  groupByChannel,
  groupBySender,
  verifyImmutabilityConstraint,
} from './message.js';
import { EntityId, ElementType, Timestamp } from './element.js';
import { DocumentId } from './document.js';
import { ValidationError, ConstraintError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid message for testing
function createTestMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'el-msg123' as MessageId,
    type: ElementType.MESSAGE,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-sender1' as EntityId,
    tags: [],
    metadata: {},
    channelId: 'el-chan01' as ChannelId,
    sender: 'el-sender1' as EntityId,
    contentRef: 'el-doc001' as DocumentId,
    attachments: [],
    threadId: null,
    ...overrides,
  };
}

// ============================================================================
// Channel ID Validation Tests
// ============================================================================

describe('isValidChannelId', () => {
  test('accepts valid channel IDs', () => {
    expect(isValidChannelId('el-abc')).toBe(true);
    expect(isValidChannelId('el-abc123')).toBe(true);
    expect(isValidChannelId('el-12345678')).toBe(true);
  });

  test('rejects invalid channel IDs', () => {
    expect(isValidChannelId('el-ab')).toBe(false); // too short
    expect(isValidChannelId('el-123456789')).toBe(false); // too long
    expect(isValidChannelId('el-ABC123')).toBe(false); // uppercase
    expect(isValidChannelId('abc123')).toBe(false); // missing prefix
    expect(isValidChannelId('')).toBe(false);
    expect(isValidChannelId(null)).toBe(false);
    expect(isValidChannelId(undefined)).toBe(false);
    expect(isValidChannelId(123)).toBe(false);
    expect(isValidChannelId({})).toBe(false);
  });
});

describe('validateChannelId', () => {
  test('returns valid channel ID', () => {
    expect(validateChannelId('el-abc123')).toBe('el-abc123' as ChannelId);
  });

  test('throws for non-string', () => {
    expect(() => validateChannelId(123)).toThrow(ValidationError);
    try {
      validateChannelId(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
      expect(err.details.field).toBe('channelId');
    }
  });

  test('throws for invalid format', () => {
    expect(() => validateChannelId('invalid')).toThrow(ValidationError);
    expect(() => validateChannelId('el-AB')).toThrow(ValidationError);
  });
});

// ============================================================================
// Message ID Validation Tests
// ============================================================================

describe('isValidMessageId', () => {
  test('accepts valid message IDs', () => {
    expect(isValidMessageId('el-msg')).toBe(true);
    expect(isValidMessageId('el-msg123')).toBe(true);
    expect(isValidMessageId('el-12345678')).toBe(true);
  });

  test('rejects invalid message IDs', () => {
    expect(isValidMessageId('el-ab')).toBe(false);
    expect(isValidMessageId('el-123456789')).toBe(false);
    expect(isValidMessageId('')).toBe(false);
    expect(isValidMessageId(null)).toBe(false);
    expect(isValidMessageId(undefined)).toBe(false);
  });
});

describe('validateMessageId', () => {
  test('returns valid message ID', () => {
    expect(validateMessageId('el-msg123')).toBe('el-msg123' as MessageId);
  });

  test('throws for invalid input', () => {
    expect(() => validateMessageId(123)).toThrow(ValidationError);
    expect(() => validateMessageId('invalid')).toThrow(ValidationError);
  });
});

// ============================================================================
// Document ID Validation Tests
// ============================================================================

describe('isValidMessageDocumentId', () => {
  test('accepts valid document IDs', () => {
    expect(isValidMessageDocumentId('el-doc')).toBe(true);
    expect(isValidMessageDocumentId('el-doc123')).toBe(true);
  });

  test('rejects invalid document IDs', () => {
    expect(isValidMessageDocumentId('el-ab')).toBe(false);
    expect(isValidMessageDocumentId('')).toBe(false);
    expect(isValidMessageDocumentId(null)).toBe(false);
  });
});

describe('validateMessageDocumentId', () => {
  test('returns valid document ID', () => {
    expect(validateMessageDocumentId('el-doc123', 'contentRef')).toBe('el-doc123' as DocumentId);
  });

  test('throws with field name in error', () => {
    try {
      validateMessageDocumentId(null, 'contentRef');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
      expect(err.details.field).toBe('contentRef');
    }
  });
});

// ============================================================================
// Entity ID Validation Tests
// ============================================================================

describe('isValidMessageSenderId', () => {
  test('accepts valid entity IDs', () => {
    expect(isValidMessageSenderId('el-ent')).toBe(true);
    expect(isValidMessageSenderId('el-user123')).toBe(true);
  });

  test('rejects invalid entity IDs', () => {
    expect(isValidMessageSenderId('el-ab')).toBe(false);
    expect(isValidMessageSenderId('')).toBe(false);
    expect(isValidMessageSenderId(null)).toBe(false);
  });
});

describe('validateMessageSenderId', () => {
  test('returns valid entity ID', () => {
    expect(validateMessageSenderId('el-user123', 'sender')).toBe('el-user123' as EntityId);
  });

  test('throws with field name in error', () => {
    try {
      validateMessageSenderId(null, 'sender');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.details.field).toBe('sender');
    }
  });
});

// ============================================================================
// Thread ID Validation Tests
// ============================================================================

describe('isValidThreadId', () => {
  test('accepts null for root messages', () => {
    expect(isValidThreadId(null)).toBe(true);
  });

  test('accepts valid message ID for replies', () => {
    expect(isValidThreadId('el-msg123')).toBe(true);
  });

  test('rejects invalid values', () => {
    expect(isValidThreadId('invalid')).toBe(false);
    expect(isValidThreadId(123)).toBe(false);
  });
});

describe('validateThreadId', () => {
  test('returns null for null or undefined', () => {
    expect(validateThreadId(null)).toBe(null);
    expect(validateThreadId(undefined)).toBe(null);
  });

  test('returns valid message ID', () => {
    expect(validateThreadId('el-msg123')).toBe('el-msg123' as MessageId);
  });

  test('throws for invalid message ID', () => {
    expect(() => validateThreadId('invalid')).toThrow(ValidationError);
  });
});

// ============================================================================
// Attachments Validation Tests
// ============================================================================

describe('isValidAttachments', () => {
  test('accepts empty array', () => {
    expect(isValidAttachments([])).toBe(true);
  });

  test('accepts valid document IDs', () => {
    expect(isValidAttachments(['el-doc123', 'el-doc456'])).toBe(true);
  });

  test('rejects non-array', () => {
    expect(isValidAttachments(null)).toBe(false);
    expect(isValidAttachments(undefined)).toBe(false);
    expect(isValidAttachments('el-doc123')).toBe(false);
  });

  test('rejects invalid document IDs in array', () => {
    expect(isValidAttachments(['el-doc123', 'invalid'])).toBe(false);
  });

  test('rejects too many attachments', () => {
    const tooMany = Array(MAX_ATTACHMENTS + 1).fill('el-doc123');
    expect(isValidAttachments(tooMany)).toBe(false);
  });

  test('accepts maximum attachments', () => {
    const maxAttachments = Array(MAX_ATTACHMENTS).fill('el-doc123');
    expect(isValidAttachments(maxAttachments)).toBe(true);
  });
});

describe('validateAttachments', () => {
  test('returns valid attachments array', () => {
    expect(validateAttachments(['el-doc123'])).toEqual(['el-doc123' as DocumentId]);
  });

  test('returns empty array for empty input', () => {
    expect(validateAttachments([])).toEqual([]);
  });

  test('throws for non-array', () => {
    expect(() => validateAttachments(null)).toThrow(ValidationError);
    try {
      validateAttachments('not-array');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('attachments');
    }
  });

  test('throws for too many attachments', () => {
    const tooMany = Array(MAX_ATTACHMENTS + 1).fill('el-doc123');
    expect(() => validateAttachments(tooMany)).toThrow(ValidationError);
  });

  test('throws for invalid document ID with index', () => {
    try {
      validateAttachments(['el-doc123', 'invalid']);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.details.field).toBe('attachments[1]');
    }
  });
});

// ============================================================================
// isMessage Type Guard Tests
// ============================================================================

describe('isMessage', () => {
  test('accepts valid message', () => {
    expect(isMessage(createTestMessage())).toBe(true);
  });

  test('accepts message with attachments', () => {
    expect(
      isMessage(
        createTestMessage({
          attachments: ['el-att001' as DocumentId, 'el-att002' as DocumentId],
        })
      )
    ).toBe(true);
  });

  test('accepts message with threadId (reply)', () => {
    expect(
      isMessage(createTestMessage({ threadId: 'el-parent1' as MessageId }))
    ).toBe(true);
  });

  test('accepts message with tags and metadata', () => {
    expect(
      isMessage(
        createTestMessage({
          tags: ['important', 'urgent'],
          metadata: { priority: 'high' },
        })
      )
    ).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage(undefined)).toBe(false);
    expect(isMessage('string')).toBe(false);
    expect(isMessage(123)).toBe(false);
  });

  test('rejects messages with missing fields', () => {
    expect(isMessage({ ...createTestMessage(), id: undefined })).toBe(false);
    expect(isMessage({ ...createTestMessage(), type: undefined })).toBe(false);
    expect(isMessage({ ...createTestMessage(), channelId: undefined })).toBe(false);
    expect(isMessage({ ...createTestMessage(), sender: undefined })).toBe(false);
    expect(isMessage({ ...createTestMessage(), contentRef: undefined })).toBe(false);
    expect(isMessage({ ...createTestMessage(), attachments: undefined })).toBe(false);
  });

  test('rejects messages with wrong type', () => {
    expect(isMessage({ ...createTestMessage(), type: 'task' })).toBe(false);
    expect(isMessage({ ...createTestMessage(), type: 'document' })).toBe(false);
  });

  test('rejects messages with invalid channelId', () => {
    expect(isMessage({ ...createTestMessage(), channelId: 'invalid' })).toBe(false);
  });

  test('rejects messages with invalid sender', () => {
    expect(isMessage({ ...createTestMessage(), sender: 'invalid' })).toBe(false);
  });

  test('rejects messages with invalid contentRef', () => {
    expect(isMessage({ ...createTestMessage(), contentRef: 'invalid' })).toBe(false);
  });

  test('rejects messages with invalid attachments', () => {
    expect(isMessage({ ...createTestMessage(), attachments: ['invalid'] })).toBe(false);
  });

  test('rejects messages with invalid threadId', () => {
    expect(isMessage({ ...createTestMessage(), threadId: 'invalid' })).toBe(false);
  });
});

// ============================================================================
// validateMessage Tests
// ============================================================================

describe('validateMessage', () => {
  test('returns valid message', () => {
    const msg = createTestMessage();
    expect(validateMessage(msg)).toEqual(msg);
  });

  test('throws for non-object', () => {
    expect(() => validateMessage(null)).toThrow(ValidationError);
    expect(() => validateMessage('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateMessage({ ...createTestMessage(), id: '' })).toThrow(
      ValidationError
    );
    expect(() => validateMessage({ ...createTestMessage(), createdBy: '' })).toThrow(
      ValidationError
    );
  });

  test('throws for wrong type value', () => {
    try {
      validateMessage({ ...createTestMessage(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('message');
    }
  });

  test('validates message-specific fields', () => {
    expect(() =>
      validateMessage({ ...createTestMessage(), channelId: 'invalid' })
    ).toThrow(ValidationError);
    expect(() =>
      validateMessage({ ...createTestMessage(), sender: 'invalid' })
    ).toThrow(ValidationError);
    expect(() =>
      validateMessage({ ...createTestMessage(), contentRef: 'invalid' })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// createMessage Factory Tests
// ============================================================================

describe('createMessage', () => {
  const validInput: CreateMessageInput = {
    channelId: 'el-chan01' as ChannelId,
    sender: 'el-sender1' as EntityId,
    contentRef: 'el-doc001' as DocumentId,
  };

  test('creates message with required fields', async () => {
    const msg = await createMessage(validInput);

    expect(msg.type).toBe(ElementType.MESSAGE);
    expect(msg.channelId).toBe('el-chan01' as ChannelId);
    expect(msg.sender).toBe('el-sender1' as EntityId);
    expect(msg.contentRef).toBe('el-doc001' as DocumentId);
    expect(msg.createdBy).toBe('el-sender1' as EntityId); // createdBy equals sender
    expect(msg.attachments).toEqual([]);
    expect(msg.threadId).toBe(null);
    expect(msg.tags).toEqual([]);
    expect(msg.metadata).toEqual({});
    expect(msg.id).toMatch(/^el-[0-9a-z]{3,8}$/);
  });

  test('creates message with attachments', async () => {
    const msg = await createMessage({
      ...validInput,
      attachments: ['el-att001' as DocumentId, 'el-att002' as DocumentId],
    });

    expect(msg.attachments).toEqual(['el-att001' as DocumentId, 'el-att002' as DocumentId]);
  });

  test('creates message with threadId (reply)', async () => {
    const msg = await createMessage({
      ...validInput,
      threadId: 'el-parent1' as MessageId,
    });

    expect(msg.threadId).toBe('el-parent1' as MessageId);
  });

  test('creates message with optional fields', async () => {
    const msg = await createMessage({
      ...validInput,
      tags: ['urgent', 'support'],
      metadata: { department: 'engineering' },
    });

    expect(msg.tags).toEqual(['urgent', 'support']);
    expect(msg.metadata).toEqual({ department: 'engineering' });
  });

  test('sets createdAt and updatedAt to same time (immutability)', async () => {
    const msg = await createMessage(validInput);

    expect(msg.createdAt).toBe(msg.updatedAt);
  });

  test('validates channelId', async () => {
    await expect(
      createMessage({ ...validInput, channelId: 'invalid' as ChannelId })
    ).rejects.toThrow(ValidationError);
  });

  test('validates sender', async () => {
    await expect(
      createMessage({ ...validInput, sender: 'invalid' as EntityId })
    ).rejects.toThrow(ValidationError);
  });

  test('validates contentRef', async () => {
    await expect(
      createMessage({ ...validInput, contentRef: 'invalid' as DocumentId })
    ).rejects.toThrow(ValidationError);
  });

  test('validates attachments', async () => {
    await expect(
      createMessage({ ...validInput, attachments: ['invalid' as DocumentId] })
    ).rejects.toThrow(ValidationError);
  });

  test('validates threadId', async () => {
    await expect(
      createMessage({ ...validInput, threadId: 'invalid' as MessageId })
    ).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs for different messages', async () => {
    const msg1 = await createMessage(validInput);
    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 1));
    const msg2 = await createMessage(validInput);

    expect(msg1.id).not.toBe(msg2.id);
  });
});

// ============================================================================
// Immutability Enforcement Tests
// ============================================================================

describe('MessageImmutableError', () => {
  test('creates error for update operation', () => {
    const error = new MessageImmutableError('el-msg123', 'update');

    expect(error).toBeInstanceOf(ConstraintError);
    expect(error.code).toBe(ErrorCode.IMMUTABLE);
    expect(error.message).toContain('update');
    expect(error.message).toContain('immutable');
    expect(error.details.operation).toBe('update');
    expect(error.details.value).toBe('el-msg123');
  });

  test('creates error for delete operation', () => {
    const error = new MessageImmutableError('el-msg123', 'delete');

    expect(error.message).toContain('delete');
    expect(error.details.operation).toBe('delete');
  });
});

describe('rejectMessageUpdate', () => {
  test('always throws MessageImmutableError', () => {
    expect(() => rejectMessageUpdate('el-msg123')).toThrow(MessageImmutableError);

    try {
      rejectMessageUpdate('el-msg123');
    } catch (e) {
      const err = e as MessageImmutableError;
      expect(err.details.operation).toBe('update');
    }
  });
});

describe('rejectMessageDelete', () => {
  test('always throws MessageImmutableError', () => {
    expect(() => rejectMessageDelete('el-msg123')).toThrow(MessageImmutableError);

    try {
      rejectMessageDelete('el-msg123');
    } catch (e) {
      const err = e as MessageImmutableError;
      expect(err.details.operation).toBe('delete');
    }
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isRootMessage', () => {
  test('returns true for message without threadId', () => {
    expect(isRootMessage(createTestMessage({ threadId: null }))).toBe(true);
  });

  test('returns false for message with threadId', () => {
    expect(
      isRootMessage(createTestMessage({ threadId: 'el-parent1' as MessageId }))
    ).toBe(false);
  });
});

describe('isReply', () => {
  test('returns true for message with threadId', () => {
    expect(isReply(createTestMessage({ threadId: 'el-parent1' as MessageId }))).toBe(
      true
    );
  });

  test('returns false for message without threadId', () => {
    expect(isReply(createTestMessage({ threadId: null }))).toBe(false);
  });
});

describe('hasAttachments', () => {
  test('returns true when message has attachments', () => {
    expect(
      hasAttachments(
        createTestMessage({ attachments: ['el-att001' as DocumentId] })
      )
    ).toBe(true);
  });

  test('returns false when message has no attachments', () => {
    expect(hasAttachments(createTestMessage({ attachments: [] }))).toBe(false);
  });
});

describe('getAttachmentCount', () => {
  test('returns correct count', () => {
    expect(getAttachmentCount(createTestMessage({ attachments: [] }))).toBe(0);
    expect(
      getAttachmentCount(
        createTestMessage({
          attachments: ['el-att001' as DocumentId, 'el-att002' as DocumentId],
        })
      )
    ).toBe(2);
  });
});

describe('isSentBy', () => {
  test('returns true for matching sender', () => {
    expect(
      isSentBy(
        createTestMessage({ sender: 'el-user01' as EntityId }),
        'el-user01' as EntityId
      )
    ).toBe(true);
  });

  test('returns false for non-matching sender', () => {
    expect(
      isSentBy(
        createTestMessage({ sender: 'el-user01' as EntityId }),
        'el-user02' as EntityId
      )
    ).toBe(false);
  });
});

describe('isInChannel', () => {
  test('returns true for matching channel', () => {
    expect(
      isInChannel(
        createTestMessage({ channelId: 'el-chan01' as ChannelId }),
        'el-chan01' as ChannelId
      )
    ).toBe(true);
  });

  test('returns false for non-matching channel', () => {
    expect(
      isInChannel(
        createTestMessage({ channelId: 'el-chan01' as ChannelId }),
        'el-chan02' as ChannelId
      )
    ).toBe(false);
  });
});

describe('isInThread', () => {
  test('returns true for matching thread', () => {
    expect(
      isInThread(
        createTestMessage({ threadId: 'el-msg001' as MessageId }),
        'el-msg001' as MessageId
      )
    ).toBe(true);
  });

  test('returns false for non-matching thread', () => {
    expect(
      isInThread(
        createTestMessage({ threadId: 'el-msg001' as MessageId }),
        'el-msg002' as MessageId
      )
    ).toBe(false);
  });

  test('returns false for root message', () => {
    expect(
      isInThread(createTestMessage({ threadId: null }), 'el-msg001' as MessageId)
    ).toBe(false);
  });
});

// ============================================================================
// Filter Function Tests
// ============================================================================

describe('filterByChannel', () => {
  const messages: Message[] = [
    createTestMessage({ id: 'el-msg001' as MessageId, channelId: 'el-chan01' as ChannelId }),
    createTestMessage({ id: 'el-msg002' as MessageId, channelId: 'el-chan02' as ChannelId }),
    createTestMessage({ id: 'el-msg003' as MessageId, channelId: 'el-chan01' as ChannelId }),
  ];

  test('filters messages by channel', () => {
    const filtered = filterByChannel(messages, 'el-chan01' as ChannelId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(['el-msg001' as MessageId, 'el-msg003' as MessageId]);
  });

  test('returns empty array for non-matching channel', () => {
    expect(filterByChannel(messages, 'el-chan99' as ChannelId)).toEqual([]);
  });

  test('handles empty input', () => {
    expect(filterByChannel([], 'el-chan01' as ChannelId)).toEqual([]);
  });
});

describe('filterBySender', () => {
  const messages: Message[] = [
    createTestMessage({ id: 'el-msg001' as MessageId, sender: 'el-user01' as EntityId }),
    createTestMessage({ id: 'el-msg002' as MessageId, sender: 'el-user02' as EntityId }),
    createTestMessage({ id: 'el-msg003' as MessageId, sender: 'el-user01' as EntityId }),
  ];

  test('filters messages by sender', () => {
    const filtered = filterBySender(messages, 'el-user01' as EntityId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(['el-msg001' as MessageId, 'el-msg003' as MessageId]);
  });

  test('returns empty array for non-matching sender', () => {
    expect(filterBySender(messages, 'el-user99' as EntityId)).toEqual([]);
  });
});

describe('filterByThread', () => {
  const messages: Message[] = [
    createTestMessage({ id: 'el-msg001' as MessageId, threadId: null }),
    createTestMessage({
      id: 'el-msg002' as MessageId,
      threadId: 'el-msg001' as MessageId,
    }),
    createTestMessage({
      id: 'el-msg003' as MessageId,
      threadId: 'el-msg001' as MessageId,
    }),
    createTestMessage({
      id: 'el-msg004' as MessageId,
      threadId: 'el-other1' as MessageId,
    }),
  ];

  test('filters replies to a specific thread', () => {
    const filtered = filterByThread(messages, 'el-msg001' as MessageId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(['el-msg002' as MessageId, 'el-msg003' as MessageId]);
  });

  test('returns empty array for thread with no replies', () => {
    expect(filterByThread(messages, 'el-msg002' as MessageId)).toEqual([]);
  });
});

describe('filterRootMessages', () => {
  const messages: Message[] = [
    createTestMessage({ id: 'el-msg001' as MessageId, threadId: null }),
    createTestMessage({
      id: 'el-msg002' as MessageId,
      threadId: 'el-msg001' as MessageId,
    }),
    createTestMessage({ id: 'el-msg003' as MessageId, threadId: null }),
  ];

  test('filters only root messages', () => {
    const filtered = filterRootMessages(messages);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(['el-msg001' as MessageId, 'el-msg003' as MessageId]);
  });
});

describe('filterReplies', () => {
  const messages: Message[] = [
    createTestMessage({ id: 'el-msg001' as MessageId, threadId: null }),
    createTestMessage({
      id: 'el-msg002' as MessageId,
      threadId: 'el-msg001' as MessageId,
    }),
    createTestMessage({ id: 'el-msg003' as MessageId, threadId: null }),
    createTestMessage({
      id: 'el-msg004' as MessageId,
      threadId: 'el-msg001' as MessageId,
    }),
  ];

  test('filters only reply messages', () => {
    const filtered = filterReplies(messages);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(['el-msg002' as MessageId, 'el-msg004' as MessageId]);
  });
});

// ============================================================================
// Sort Function Tests
// ============================================================================

describe('sortByCreatedAt', () => {
  const messages: Message[] = [
    createTestMessage({
      id: 'el-msg002' as MessageId,
      createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
    }),
    createTestMessage({
      id: 'el-msg001' as MessageId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestMessage({
      id: 'el-msg003' as MessageId,
      createdAt: '2025-01-22T14:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts messages by creation time (oldest first)', () => {
    const sorted = sortByCreatedAt(messages);
    expect(sorted.map((m) => m.id)).toEqual(['el-msg001' as MessageId, 'el-msg002' as MessageId, 'el-msg003' as MessageId]);
  });

  test('does not modify original array', () => {
    const original = [...messages];
    sortByCreatedAt(messages);
    expect(messages).toEqual(original);
  });
});

describe('sortByCreatedAtDesc', () => {
  const messages: Message[] = [
    createTestMessage({
      id: 'el-msg002' as MessageId,
      createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
    }),
    createTestMessage({
      id: 'el-msg001' as MessageId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestMessage({
      id: 'el-msg003' as MessageId,
      createdAt: '2025-01-22T14:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts messages by creation time (newest first)', () => {
    const sorted = sortByCreatedAtDesc(messages);
    expect(sorted.map((m) => m.id)).toEqual(['el-msg003' as MessageId, 'el-msg002' as MessageId, 'el-msg001' as MessageId]);
  });
});

// ============================================================================
// Thread Structure Tests
// ============================================================================

describe('getThreadMessages', () => {
  const messages: Message[] = [
    createTestMessage({
      id: 'el-root01' as MessageId,
      threadId: null,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestMessage({
      id: 'el-reply2' as MessageId,
      threadId: 'el-root01' as MessageId,
      createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
    }),
    createTestMessage({
      id: 'el-reply1' as MessageId,
      threadId: 'el-root01' as MessageId,
      createdAt: '2025-01-22T11:00:00.000Z' as Timestamp,
    }),
    createTestMessage({
      id: 'el-other1' as MessageId,
      threadId: null,
      createdAt: '2025-01-22T09:00:00.000Z' as Timestamp,
    }),
  ];

  test('returns root and all replies sorted by creation time', () => {
    const thread = getThreadMessages(messages, 'el-root01' as MessageId);
    expect(thread).toHaveLength(3);
    expect(thread.map((m) => m.id)).toEqual(['el-root01' as MessageId, 'el-reply1' as MessageId, 'el-reply2' as MessageId]);
  });

  test('returns only root when no replies exist', () => {
    const thread = getThreadMessages(messages, 'el-other1' as MessageId);
    expect(thread).toHaveLength(1);
    expect(thread[0].id).toBe('el-other1' as MessageId);
  });

  test('returns empty array for non-existent thread', () => {
    const thread = getThreadMessages(messages, 'el-nonexistent' as MessageId);
    expect(thread).toEqual([]);
  });
});

// ============================================================================
// Grouping Function Tests
// ============================================================================

describe('groupByChannel', () => {
  const messages: Message[] = [
    createTestMessage({ id: 'el-msg001' as MessageId, channelId: 'el-chan01' as ChannelId }),
    createTestMessage({ id: 'el-msg002' as MessageId, channelId: 'el-chan02' as ChannelId }),
    createTestMessage({ id: 'el-msg003' as MessageId, channelId: 'el-chan01' as ChannelId }),
  ];

  test('groups messages by channel', () => {
    const groups = groupByChannel(messages);

    expect(groups.size).toBe(2);
    expect(groups.get('el-chan01' as ChannelId)?.map((m) => m.id)).toEqual([
      'el-msg001' as MessageId,
      'el-msg003' as MessageId,
    ]);
    expect(groups.get('el-chan02' as ChannelId)?.map((m) => m.id)).toEqual([
      'el-msg002' as MessageId,
    ]);
  });

  test('handles empty input', () => {
    const groups = groupByChannel([]);
    expect(groups.size).toBe(0);
  });
});

describe('groupBySender', () => {
  const messages: Message[] = [
    createTestMessage({ id: 'el-msg001' as MessageId, sender: 'el-user01' as EntityId }),
    createTestMessage({ id: 'el-msg002' as MessageId, sender: 'el-user02' as EntityId }),
    createTestMessage({ id: 'el-msg003' as MessageId, sender: 'el-user01' as EntityId }),
  ];

  test('groups messages by sender', () => {
    const groups = groupBySender(messages);

    expect(groups.size).toBe(2);
    expect(groups.get('el-user01' as EntityId)?.map((m) => m.id)).toEqual([
      'el-msg001' as MessageId,
      'el-msg003' as MessageId,
    ]);
    expect(groups.get('el-user02' as EntityId)?.map((m) => m.id)).toEqual([
      'el-msg002' as MessageId,
    ]);
  });
});

// ============================================================================
// Immutability Constraint Tests
// ============================================================================

describe('verifyImmutabilityConstraint', () => {
  test('returns true when createdAt equals updatedAt', () => {
    const msg = createTestMessage({
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    });
    expect(verifyImmutabilityConstraint(msg)).toBe(true);
  });

  test('returns false when timestamps differ', () => {
    const msg = createTestMessage({
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      updatedAt: '2025-01-22T11:00:00.000Z' as Timestamp,
    });
    expect(verifyImmutabilityConstraint(msg)).toBe(false);
  });
});

// ============================================================================
// HydratedMessage Tests
// ============================================================================

describe('HydratedMessage', () => {
  test('extends Message with optional content fields', () => {
    const hydrated: HydratedMessage = {
      ...createTestMessage(),
      content: 'Hello, world!',
      attachmentContents: ['File 1 content', 'File 2 content'],
    };

    expect(hydrated.content).toBe('Hello, world!');
    expect(hydrated.attachmentContents).toEqual(['File 1 content', 'File 2 content']);
    expect(isMessage(hydrated)).toBe(true);
  });

  test('allows undefined hydrated fields', () => {
    const hydrated: HydratedMessage = {
      ...createTestMessage(),
    };

    expect(hydrated.content).toBeUndefined();
    expect(hydrated.attachmentContents).toBeUndefined();
  });
});

// ============================================================================
// Edge Cases and Property-Based Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles message with maximum attachments', async () => {
    const attachments = Array(MAX_ATTACHMENTS)
      .fill(null)
      .map((_, i) => `el-att${String(i).padStart(3, '0')}` as DocumentId);

    const msg = await createMessage({
      channelId: 'el-chan01' as ChannelId,
      sender: 'el-sender1' as EntityId,
      contentRef: 'el-doc001' as DocumentId,
      attachments,
    });

    expect(msg.attachments).toHaveLength(MAX_ATTACHMENTS);
  });

  test('handles unicode in metadata', async () => {
    const msg = await createMessage({
      channelId: 'el-chan01' as ChannelId,
      sender: 'el-sender1' as EntityId,
      contentRef: 'el-doc001' as DocumentId,
      metadata: { greeting: '你好世界 🌍' },
    });

    expect(msg.metadata).toEqual({ greeting: '你好世界 🌍' });
  });

  test('created message is valid according to type guard', async () => {
    const msg = await createMessage({
      channelId: 'el-chan01' as ChannelId,
      sender: 'el-sender1' as EntityId,
      contentRef: 'el-doc001' as DocumentId,
      attachments: ['el-att001' as DocumentId],
      threadId: 'el-parent1' as MessageId,
      tags: ['important'],
      metadata: { key: 'value' },
    });

    expect(isMessage(msg)).toBe(true);
    expect(verifyImmutabilityConstraint(msg)).toBe(true);
  });
});

describe('Property-based tests', () => {
  test('all created messages satisfy immutability constraint', async () => {
    const inputs: CreateMessageInput[] = [
      {
        channelId: 'el-chan01' as ChannelId,
        sender: 'el-user01' as EntityId,
        contentRef: 'el-doc001' as DocumentId,
      },
      {
        channelId: 'el-chan02' as ChannelId,
        sender: 'el-user02' as EntityId,
        contentRef: 'el-doc002' as DocumentId,
        attachments: ['el-att001' as DocumentId],
      },
      {
        channelId: 'el-chan03' as ChannelId,
        sender: 'el-user03' as EntityId,
        contentRef: 'el-doc003' as DocumentId,
        threadId: 'el-parent1' as MessageId,
      },
    ];

    for (const input of inputs) {
      const msg = await createMessage(input);
      expect(verifyImmutabilityConstraint(msg)).toBe(true);
      expect(isMessage(msg)).toBe(true);
    }
  });

  test('root messages never have threadId', async () => {
    const msg = await createMessage({
      channelId: 'el-chan01' as ChannelId,
      sender: 'el-user01' as EntityId,
      contentRef: 'el-doc001' as DocumentId,
    });

    expect(isRootMessage(msg)).toBe(true);
    expect(isReply(msg)).toBe(false);
  });

  test('reply messages always have threadId', async () => {
    const msg = await createMessage({
      channelId: 'el-chan01' as ChannelId,
      sender: 'el-user01' as EntityId,
      contentRef: 'el-doc001' as DocumentId,
      threadId: 'el-parent1' as MessageId,
    });

    expect(isRootMessage(msg)).toBe(false);
    expect(isReply(msg)).toBe(true);
  });
});

describe('Sender and createdBy relationship', () => {
  test('createdBy equals sender for created messages', async () => {
    const msg = await createMessage({
      channelId: 'el-chan01' as ChannelId,
      sender: 'el-user01' as EntityId,
      contentRef: 'el-doc001' as DocumentId,
    });

    expect(msg.createdBy).toBe(msg.sender);
  });
});
