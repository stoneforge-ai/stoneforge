import { describe, expect, test } from 'bun:test';
import {
  InboxSourceType,
  InboxStatus,
  type InboxItem,
  type InboxFilter,
  type CreateInboxItemInput,
  isValidInboxSourceType,
  validateInboxSourceType,
  isValidInboxStatus,
  validateInboxStatus,
  isValidInboxItemId,
  validateInboxItemId,
  isInboxItem,
  validateInboxItem,
  filterByStatus,
  filterBySourceType,
  sortByCreatedAt,
  sortByCreatedAtAsc,
  getUnread,
  getRead,
  getArchived,
  isUnread,
  isRead,
  isArchived,
  isFromDirectMessage,
  isFromMention,
  groupByChannel,
  groupByStatus,
  groupBySourceType,
  countUnread,
} from './inbox.js';
import type { EntityId } from './element.js';
import type { MessageId, ChannelId } from './message.js';
import { ValidationError } from '../errors/error.js';

// ============================================================================
// Test Data
// ============================================================================

const testRecipientId = 'el-recipient' as EntityId;
const testMessageId = 'el-message1' as unknown as MessageId;
const testChannelId = 'el-channel1' as unknown as ChannelId;

function createTestInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'inbox-test123-abc',
    recipientId: testRecipientId,
    messageId: testMessageId,
    channelId: testChannelId,
    sourceType: InboxSourceType.DIRECT,
    status: InboxStatus.UNREAD,
    readAt: null,
    createdAt: '2025-01-22T10:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// InboxSourceType Tests
// ============================================================================

describe('InboxSourceType', () => {
  test('has correct values', () => {
    expect(InboxSourceType.DIRECT).toBe('direct');
    expect(InboxSourceType.MENTION).toBe('mention');
  });

  describe('isValidInboxSourceType', () => {
    test('returns true for valid source types', () => {
      expect(isValidInboxSourceType('direct')).toBe(true);
      expect(isValidInboxSourceType('mention')).toBe(true);
    });

    test('returns false for invalid source types', () => {
      expect(isValidInboxSourceType('invalid')).toBe(false);
      expect(isValidInboxSourceType('')).toBe(false);
      expect(isValidInboxSourceType(null)).toBe(false);
      expect(isValidInboxSourceType(undefined)).toBe(false);
      expect(isValidInboxSourceType(123)).toBe(false);
    });
  });

  describe('validateInboxSourceType', () => {
    test('returns valid source type', () => {
      expect(validateInboxSourceType('direct')).toBe('direct');
      expect(validateInboxSourceType('mention')).toBe('mention');
    });

    test('throws for invalid source type', () => {
      expect(() => validateInboxSourceType('invalid')).toThrow(ValidationError);
      expect(() => validateInboxSourceType(null)).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// InboxStatus Tests
// ============================================================================

describe('InboxStatus', () => {
  test('has correct values', () => {
    expect(InboxStatus.UNREAD).toBe('unread');
    expect(InboxStatus.READ).toBe('read');
    expect(InboxStatus.ARCHIVED).toBe('archived');
  });

  describe('isValidInboxStatus', () => {
    test('returns true for valid statuses', () => {
      expect(isValidInboxStatus('unread')).toBe(true);
      expect(isValidInboxStatus('read')).toBe(true);
      expect(isValidInboxStatus('archived')).toBe(true);
    });

    test('returns false for invalid statuses', () => {
      expect(isValidInboxStatus('invalid')).toBe(false);
      expect(isValidInboxStatus('')).toBe(false);
      expect(isValidInboxStatus(null)).toBe(false);
      expect(isValidInboxStatus(undefined)).toBe(false);
    });
  });

  describe('validateInboxStatus', () => {
    test('returns valid status', () => {
      expect(validateInboxStatus('unread')).toBe('unread');
      expect(validateInboxStatus('read')).toBe('read');
      expect(validateInboxStatus('archived')).toBe('archived');
    });

    test('throws for invalid status', () => {
      expect(() => validateInboxStatus('invalid')).toThrow(ValidationError);
      expect(() => validateInboxStatus(null)).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Inbox Item ID Tests
// ============================================================================

describe('Inbox Item ID', () => {
  describe('isValidInboxItemId', () => {
    test('returns true for valid IDs', () => {
      expect(isValidInboxItemId('inbox-abc123')).toBe(true);
      expect(isValidInboxItemId('inbox-test-item-1')).toBe(true);
      expect(isValidInboxItemId('inbox-abc123-def456')).toBe(true);
    });

    test('returns false for invalid IDs', () => {
      expect(isValidInboxItemId('')).toBe(false);
      expect(isValidInboxItemId('notinbox-123')).toBe(false);
      expect(isValidInboxItemId('inbox')).toBe(false);
      expect(isValidInboxItemId(123)).toBe(false);
      expect(isValidInboxItemId(null)).toBe(false);
    });
  });

  describe('validateInboxItemId', () => {
    test('returns valid ID', () => {
      expect(validateInboxItemId('inbox-abc123')).toBe('inbox-abc123');
    });

    test('throws for non-string', () => {
      expect(() => validateInboxItemId(123)).toThrow(ValidationError);
      expect(() => validateInboxItemId(null)).toThrow(ValidationError);
    });

    test('throws for invalid format', () => {
      expect(() => validateInboxItemId('invalid')).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// InboxItem Type Guard Tests
// ============================================================================

describe('isInboxItem', () => {
  test('returns true for valid inbox item', () => {
    const item = createTestInboxItem();
    expect(isInboxItem(item)).toBe(true);
  });

  test('returns true with readAt timestamp', () => {
    const item = createTestInboxItem({
      status: InboxStatus.READ,
      readAt: '2025-01-22T11:00:00.000Z',
    });
    expect(isInboxItem(item)).toBe(true);
  });

  test('returns false for null', () => {
    expect(isInboxItem(null)).toBe(false);
  });

  test('returns false for non-object', () => {
    expect(isInboxItem('string')).toBe(false);
    expect(isInboxItem(123)).toBe(false);
  });

  test('returns false for missing fields', () => {
    expect(isInboxItem({})).toBe(false);
    expect(isInboxItem({ id: 'inbox-123' })).toBe(false);
  });

  test('returns false for invalid sourceType', () => {
    const item = createTestInboxItem({ sourceType: 'invalid' as any });
    expect(isInboxItem(item)).toBe(false);
  });

  test('returns false for invalid status', () => {
    const item = createTestInboxItem({ status: 'invalid' as any });
    expect(isInboxItem(item)).toBe(false);
  });
});

// ============================================================================
// validateInboxItem Tests
// ============================================================================

describe('validateInboxItem', () => {
  test('returns valid inbox item', () => {
    const item = createTestInboxItem();
    expect(validateInboxItem(item)).toEqual(item);
  });

  test('throws for null', () => {
    expect(() => validateInboxItem(null)).toThrow(ValidationError);
  });

  test('throws for missing id', () => {
    const item = createTestInboxItem({ id: '' as any });
    expect(() => validateInboxItem(item)).toThrow(ValidationError);
  });

  test('throws for missing recipientId', () => {
    const item = createTestInboxItem({ recipientId: '' as any });
    expect(() => validateInboxItem(item)).toThrow(ValidationError);
  });

  test('throws for missing messageId', () => {
    const item = createTestInboxItem({ messageId: '' as any });
    expect(() => validateInboxItem(item)).toThrow(ValidationError);
  });

  test('throws for missing channelId', () => {
    const item = createTestInboxItem({ channelId: '' as any });
    expect(() => validateInboxItem(item)).toThrow(ValidationError);
  });

  test('throws for invalid sourceType', () => {
    const item = createTestInboxItem({ sourceType: 'invalid' as any });
    expect(() => validateInboxItem(item)).toThrow(ValidationError);
  });

  test('throws for invalid status', () => {
    const item = createTestInboxItem({ status: 'invalid' as any });
    expect(() => validateInboxItem(item)).toThrow(ValidationError);
  });

  test('throws for invalid readAt (not null or string)', () => {
    const item = createTestInboxItem({ readAt: 123 as any });
    expect(() => validateInboxItem(item)).toThrow(ValidationError);
  });
});

// ============================================================================
// Filter Utility Tests
// ============================================================================

describe('filterByStatus', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', status: InboxStatus.UNREAD }),
    createTestInboxItem({ id: 'inbox-2', status: InboxStatus.READ }),
    createTestInboxItem({ id: 'inbox-3', status: InboxStatus.ARCHIVED }),
    createTestInboxItem({ id: 'inbox-4', status: InboxStatus.UNREAD }),
  ];

  test('filters by single status', () => {
    const result = filterByStatus(items, InboxStatus.UNREAD);
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.status === InboxStatus.UNREAD)).toBe(true);
  });

  test('filters by multiple statuses', () => {
    const result = filterByStatus(items, [InboxStatus.UNREAD, InboxStatus.READ]);
    expect(result).toHaveLength(3);
  });

  test('returns empty array when no match', () => {
    const unreadItems = items.filter((i) => i.status === InboxStatus.UNREAD);
    const result = filterByStatus(unreadItems, InboxStatus.ARCHIVED);
    expect(result).toHaveLength(0);
  });
});

describe('filterBySourceType', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', sourceType: InboxSourceType.DIRECT }),
    createTestInboxItem({ id: 'inbox-2', sourceType: InboxSourceType.MENTION }),
    createTestInboxItem({ id: 'inbox-3', sourceType: InboxSourceType.DIRECT }),
  ];

  test('filters by single source type', () => {
    const result = filterBySourceType(items, InboxSourceType.DIRECT);
    expect(result).toHaveLength(2);
  });

  test('filters by multiple source types', () => {
    const result = filterBySourceType(items, [InboxSourceType.DIRECT, InboxSourceType.MENTION]);
    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// Sort Utility Tests
// ============================================================================

describe('sortByCreatedAt', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', createdAt: '2025-01-22T10:00:00.000Z' }),
    createTestInboxItem({ id: 'inbox-2', createdAt: '2025-01-22T12:00:00.000Z' }),
    createTestInboxItem({ id: 'inbox-3', createdAt: '2025-01-22T11:00:00.000Z' }),
  ];

  test('sorts by creation time descending (newest first)', () => {
    const result = sortByCreatedAt(items);
    expect(result[0].id).toBe('inbox-2');
    expect(result[1].id).toBe('inbox-3');
    expect(result[2].id).toBe('inbox-1');
  });

  test('does not mutate original array', () => {
    const original = [...items];
    sortByCreatedAt(items);
    expect(items).toEqual(original);
  });
});

describe('sortByCreatedAtAsc', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', createdAt: '2025-01-22T10:00:00.000Z' }),
    createTestInboxItem({ id: 'inbox-2', createdAt: '2025-01-22T12:00:00.000Z' }),
    createTestInboxItem({ id: 'inbox-3', createdAt: '2025-01-22T11:00:00.000Z' }),
  ];

  test('sorts by creation time ascending (oldest first)', () => {
    const result = sortByCreatedAtAsc(items);
    expect(result[0].id).toBe('inbox-1');
    expect(result[1].id).toBe('inbox-3');
    expect(result[2].id).toBe('inbox-2');
  });
});

// ============================================================================
// Status Helper Tests
// ============================================================================

describe('getUnread', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', status: InboxStatus.UNREAD }),
    createTestInboxItem({ id: 'inbox-2', status: InboxStatus.READ }),
    createTestInboxItem({ id: 'inbox-3', status: InboxStatus.UNREAD }),
  ];

  test('returns only unread items', () => {
    const result = getUnread(items);
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.status === InboxStatus.UNREAD)).toBe(true);
  });
});

describe('getRead', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', status: InboxStatus.UNREAD }),
    createTestInboxItem({ id: 'inbox-2', status: InboxStatus.READ }),
  ];

  test('returns only read items', () => {
    const result = getRead(items);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(InboxStatus.READ);
  });
});

describe('getArchived', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', status: InboxStatus.UNREAD }),
    createTestInboxItem({ id: 'inbox-2', status: InboxStatus.ARCHIVED }),
  ];

  test('returns only archived items', () => {
    const result = getArchived(items);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(InboxStatus.ARCHIVED);
  });
});

// ============================================================================
// Status Predicate Tests
// ============================================================================

describe('isUnread', () => {
  test('returns true for unread items', () => {
    const item = createTestInboxItem({ status: InboxStatus.UNREAD });
    expect(isUnread(item)).toBe(true);
  });

  test('returns false for read items', () => {
    const item = createTestInboxItem({ status: InboxStatus.READ });
    expect(isUnread(item)).toBe(false);
  });
});

describe('isRead', () => {
  test('returns true for read items', () => {
    const item = createTestInboxItem({ status: InboxStatus.READ });
    expect(isRead(item)).toBe(true);
  });

  test('returns false for unread items', () => {
    const item = createTestInboxItem({ status: InboxStatus.UNREAD });
    expect(isRead(item)).toBe(false);
  });
});

describe('isArchived', () => {
  test('returns true for archived items', () => {
    const item = createTestInboxItem({ status: InboxStatus.ARCHIVED });
    expect(isArchived(item)).toBe(true);
  });

  test('returns false for unread items', () => {
    const item = createTestInboxItem({ status: InboxStatus.UNREAD });
    expect(isArchived(item)).toBe(false);
  });
});

// ============================================================================
// Source Type Predicate Tests
// ============================================================================

describe('isFromDirectMessage', () => {
  test('returns true for direct message items', () => {
    const item = createTestInboxItem({ sourceType: InboxSourceType.DIRECT });
    expect(isFromDirectMessage(item)).toBe(true);
  });

  test('returns false for mention items', () => {
    const item = createTestInboxItem({ sourceType: InboxSourceType.MENTION });
    expect(isFromDirectMessage(item)).toBe(false);
  });
});

describe('isFromMention', () => {
  test('returns true for mention items', () => {
    const item = createTestInboxItem({ sourceType: InboxSourceType.MENTION });
    expect(isFromMention(item)).toBe(true);
  });

  test('returns false for direct message items', () => {
    const item = createTestInboxItem({ sourceType: InboxSourceType.DIRECT });
    expect(isFromMention(item)).toBe(false);
  });
});

// ============================================================================
// Grouping Tests
// ============================================================================

describe('groupByChannel', () => {
  const channel1 = 'el-channel1' as unknown as ChannelId;
  const channel2 = 'el-channel2' as unknown as ChannelId;

  const items = [
    createTestInboxItem({ id: 'inbox-1', channelId: channel1 }),
    createTestInboxItem({ id: 'inbox-2', channelId: channel2 }),
    createTestInboxItem({ id: 'inbox-3', channelId: channel1 }),
  ];

  test('groups items by channel', () => {
    const groups = groupByChannel(items);
    expect(groups.size).toBe(2);
    expect(groups.get(channel1)).toHaveLength(2);
    expect(groups.get(channel2)).toHaveLength(1);
  });
});

describe('groupByStatus', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', status: InboxStatus.UNREAD }),
    createTestInboxItem({ id: 'inbox-2', status: InboxStatus.READ }),
    createTestInboxItem({ id: 'inbox-3', status: InboxStatus.UNREAD }),
  ];

  test('groups items by status', () => {
    const groups = groupByStatus(items);
    expect(groups.size).toBe(2);
    expect(groups.get(InboxStatus.UNREAD)).toHaveLength(2);
    expect(groups.get(InboxStatus.READ)).toHaveLength(1);
  });
});

describe('groupBySourceType', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', sourceType: InboxSourceType.DIRECT }),
    createTestInboxItem({ id: 'inbox-2', sourceType: InboxSourceType.MENTION }),
    createTestInboxItem({ id: 'inbox-3', sourceType: InboxSourceType.DIRECT }),
  ];

  test('groups items by source type', () => {
    const groups = groupBySourceType(items);
    expect(groups.size).toBe(2);
    expect(groups.get(InboxSourceType.DIRECT)).toHaveLength(2);
    expect(groups.get(InboxSourceType.MENTION)).toHaveLength(1);
  });
});

// ============================================================================
// Count Tests
// ============================================================================

describe('countUnread', () => {
  const items = [
    createTestInboxItem({ id: 'inbox-1', status: InboxStatus.UNREAD }),
    createTestInboxItem({ id: 'inbox-2', status: InboxStatus.READ }),
    createTestInboxItem({ id: 'inbox-3', status: InboxStatus.UNREAD }),
    createTestInboxItem({ id: 'inbox-4', status: InboxStatus.ARCHIVED }),
  ];

  test('counts unread items', () => {
    expect(countUnread(items)).toBe(2);
  });

  test('returns 0 for empty array', () => {
    expect(countUnread([])).toBe(0);
  });

  test('returns 0 when no unread items', () => {
    const readItems = items.filter((i) => i.status !== InboxStatus.UNREAD);
    expect(countUnread(readItems)).toBe(0);
  });
});
