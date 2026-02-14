/**
 * Inbox Type - Unified notification inbox for entities
 *
 * The inbox system provides a centralized view of notifications for entities.
 * Items are added to the inbox when:
 * - A message is sent directly to the entity (via direct channel)
 * - A message mentions the entity (via @mention in content)
 * - A reply is added to a thread the entity started
 *
 * Inbox items track read/unread status and can be archived.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import type { EntityId, Timestamp } from './element.js';
import type { MessageId, ChannelId } from './message.js';
import type { Message } from './message.js';
import type { Channel } from './channel.js';
import type { Entity } from './entity.js';

// ============================================================================
// Inbox Source Type
// ============================================================================

/**
 * Source of the inbox notification
 */
export const InboxSourceType = {
  /** Direct message to the entity via a direct channel */
  DIRECT: 'direct',
  /** Entity was mentioned in a message */
  MENTION: 'mention',
  /** Reply to a thread the entity started */
  THREAD_REPLY: 'thread_reply',
} as const;

export type InboxSourceType = (typeof InboxSourceType)[keyof typeof InboxSourceType];

// ============================================================================
// Inbox Status
// ============================================================================

/**
 * Status of an inbox item
 */
export const InboxStatus = {
  /** Item has not been read */
  UNREAD: 'unread',
  /** Item has been read */
  READ: 'read',
  /** Item has been archived */
  ARCHIVED: 'archived',
} as const;

export type InboxStatus = (typeof InboxStatus)[keyof typeof InboxStatus];

// ============================================================================
// Inbox Item Interface
// ============================================================================

/**
 * An inbox item representing a notification for an entity
 */
export interface InboxItem {
  /** Unique identifier for the inbox item */
  readonly id: string;
  /** Entity receiving the notification */
  readonly recipientId: EntityId;
  /** Message that triggered the notification */
  readonly messageId: MessageId;
  /** Channel containing the message */
  readonly channelId: ChannelId;
  /** How the entity received this notification */
  readonly sourceType: InboxSourceType;
  /** Current status of the inbox item */
  readonly status: InboxStatus;
  /** When the item was read (null if unread/archived without reading) */
  readonly readAt: Timestamp | null;
  /** When the inbox item was created */
  readonly createdAt: Timestamp;
}

/**
 * Inbox item with hydrated references
 */
export interface HydratedInboxItem extends InboxItem {
  /** The referenced message */
  message?: Message;
  /** The channel containing the message */
  channel?: Channel;
  /** The sender of the message */
  sender?: Entity;
}

// ============================================================================
// Inbox Filter
// ============================================================================

/**
 * Filter options for querying inbox items
 */
export interface InboxFilter {
  /** Filter by status (single or multiple) */
  status?: InboxStatus | InboxStatus[];
  /** Filter by source type (single or multiple) */
  sourceType?: InboxSourceType | InboxSourceType[];
  /** Filter by channel */
  channelId?: ChannelId;
  /** Only items created after this timestamp */
  after?: Timestamp;
  /** Only items created before this timestamp */
  before?: Timestamp;
  /** Maximum number of items to return */
  limit?: number;
  /** Number of items to skip for pagination */
  offset?: number;
}

// ============================================================================
// Create Inbox Item Input
// ============================================================================

/**
 * Input for creating a new inbox item
 */
export interface CreateInboxItemInput {
  /** Entity receiving the notification */
  recipientId: EntityId;
  /** Message that triggered the notification */
  messageId: MessageId;
  /** Channel containing the message */
  channelId: ChannelId;
  /** How the entity received this notification */
  sourceType: InboxSourceType;
  /** Entity creating the inbox item (usually the system or message sender) */
  createdBy: EntityId;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates an inbox source type value
 */
export function isValidInboxSourceType(value: unknown): value is InboxSourceType {
  return (
    typeof value === 'string' &&
    Object.values(InboxSourceType).includes(value as InboxSourceType)
  );
}

/**
 * Validates inbox source type and throws if invalid
 */
export function validateInboxSourceType(value: unknown): InboxSourceType {
  if (!isValidInboxSourceType(value)) {
    throw new ValidationError(
      `Invalid inbox source type: ${value}`,
      ErrorCode.INVALID_INPUT,
      { field: 'sourceType', value, expected: Object.values(InboxSourceType) }
    );
  }
  return value;
}

/**
 * Validates an inbox status value
 */
export function isValidInboxStatus(value: unknown): value is InboxStatus {
  return (
    typeof value === 'string' &&
    Object.values(InboxStatus).includes(value as InboxStatus)
  );
}

/**
 * Validates inbox status and throws if invalid
 */
export function validateInboxStatus(value: unknown): InboxStatus {
  if (!isValidInboxStatus(value)) {
    throw new ValidationError(
      `Invalid inbox status: ${value}`,
      ErrorCode.INVALID_INPUT,
      { field: 'status', value, expected: Object.values(InboxStatus) }
    );
  }
  return value;
}

/**
 * Validates an inbox item ID format
 */
export function isValidInboxItemId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Inbox item IDs use a simple format: inbox-{uuid or similar}
  return /^inbox-[0-9a-z-]+$/.test(value);
}

/**
 * Validates inbox item ID and throws if invalid
 */
export function validateInboxItemId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Inbox item ID must be a string',
      ErrorCode.INVALID_ID,
      { field: 'id', value, expected: 'string' }
    );
  }

  if (!isValidInboxItemId(value)) {
    throw new ValidationError(
      'Inbox item ID has invalid format',
      ErrorCode.INVALID_ID,
      { field: 'id', value, expected: 'inbox-{alphanumeric}' }
    );
  }

  return value;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid InboxItem
 */
export function isInboxItem(value: unknown): value is InboxItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (typeof obj.id !== 'string') return false;
  if (typeof obj.recipientId !== 'string') return false;
  if (typeof obj.messageId !== 'string') return false;
  if (typeof obj.channelId !== 'string') return false;
  if (!isValidInboxSourceType(obj.sourceType)) return false;
  if (!isValidInboxStatus(obj.status)) return false;
  if (obj.readAt !== null && typeof obj.readAt !== 'string') return false;
  if (typeof obj.createdAt !== 'string') return false;

  return true;
}

/**
 * Comprehensive validation of an inbox item with detailed errors
 */
export function validateInboxItem(value: unknown): InboxItem {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Inbox item must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate id
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Inbox item id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  // Validate recipientId
  if (typeof obj.recipientId !== 'string' || obj.recipientId.length === 0) {
    throw new ValidationError(
      'Inbox item recipientId is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'recipientId', value: obj.recipientId }
    );
  }

  // Validate messageId
  if (typeof obj.messageId !== 'string' || obj.messageId.length === 0) {
    throw new ValidationError(
      'Inbox item messageId is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'messageId', value: obj.messageId }
    );
  }

  // Validate channelId
  if (typeof obj.channelId !== 'string' || obj.channelId.length === 0) {
    throw new ValidationError(
      'Inbox item channelId is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'channelId', value: obj.channelId }
    );
  }

  // Validate sourceType
  validateInboxSourceType(obj.sourceType);

  // Validate status
  validateInboxStatus(obj.status);

  // Validate readAt (can be null)
  if (obj.readAt !== null && typeof obj.readAt !== 'string') {
    throw new ValidationError(
      'Inbox item readAt must be a string or null',
      ErrorCode.INVALID_INPUT,
      { field: 'readAt', value: obj.readAt, expected: 'string or null' }
    );
  }

  // Validate createdAt
  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError(
      'Inbox item createdAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdAt', value: obj.createdAt }
    );
  }

  return value as InboxItem;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Filter inbox items by status
 */
export function filterByStatus<T extends InboxItem>(
  items: T[],
  status: InboxStatus | InboxStatus[]
): T[] {
  const statuses = Array.isArray(status) ? status : [status];
  return items.filter((item) => statuses.includes(item.status));
}

/**
 * Filter inbox items by source type
 */
export function filterBySourceType<T extends InboxItem>(
  items: T[],
  sourceType: InboxSourceType | InboxSourceType[]
): T[] {
  const types = Array.isArray(sourceType) ? sourceType : [sourceType];
  return items.filter((item) => types.includes(item.sourceType));
}

/**
 * Sort inbox items by creation time (newest first)
 */
export function sortByCreatedAt<T extends InboxItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Sort inbox items by creation time (oldest first)
 */
export function sortByCreatedAtAsc<T extends InboxItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Get unread inbox items
 */
export function getUnread<T extends InboxItem>(items: T[]): T[] {
  return items.filter((item) => item.status === InboxStatus.UNREAD);
}

/**
 * Get read inbox items
 */
export function getRead<T extends InboxItem>(items: T[]): T[] {
  return items.filter((item) => item.status === InboxStatus.READ);
}

/**
 * Get archived inbox items
 */
export function getArchived<T extends InboxItem>(items: T[]): T[] {
  return items.filter((item) => item.status === InboxStatus.ARCHIVED);
}

/**
 * Check if an inbox item is unread
 */
export function isUnread(item: InboxItem): boolean {
  return item.status === InboxStatus.UNREAD;
}

/**
 * Check if an inbox item is read
 */
export function isRead(item: InboxItem): boolean {
  return item.status === InboxStatus.READ;
}

/**
 * Check if an inbox item is archived
 */
export function isArchived(item: InboxItem): boolean {
  return item.status === InboxStatus.ARCHIVED;
}

/**
 * Check if inbox item came from a direct message
 */
export function isFromDirectMessage(item: InboxItem): boolean {
  return item.sourceType === InboxSourceType.DIRECT;
}

/**
 * Check if inbox item came from a mention
 */
export function isFromMention(item: InboxItem): boolean {
  return item.sourceType === InboxSourceType.MENTION;
}

/**
 * Check if inbox item came from a thread reply
 */
export function isFromThreadReply(item: InboxItem): boolean {
  return item.sourceType === InboxSourceType.THREAD_REPLY;
}

/**
 * Group inbox items by channel
 */
export function groupByChannel<T extends InboxItem>(
  items: T[]
): Map<ChannelId, T[]> {
  const groups = new Map<ChannelId, T[]>();

  for (const item of items) {
    const channelItems = groups.get(item.channelId) ?? [];
    channelItems.push(item);
    groups.set(item.channelId, channelItems);
  }

  return groups;
}

/**
 * Group inbox items by status
 */
export function groupByStatus<T extends InboxItem>(
  items: T[]
): Map<InboxStatus, T[]> {
  const groups = new Map<InboxStatus, T[]>();

  for (const item of items) {
    const statusItems = groups.get(item.status) ?? [];
    statusItems.push(item);
    groups.set(item.status, statusItems);
  }

  return groups;
}

/**
 * Group inbox items by source type
 */
export function groupBySourceType<T extends InboxItem>(
  items: T[]
): Map<InboxSourceType, T[]> {
  const groups = new Map<InboxSourceType, T[]>();

  for (const item of items) {
    const sourceItems = groups.get(item.sourceType) ?? [];
    sourceItems.push(item);
    groups.set(item.sourceType, sourceItems);
  }

  return groups;
}

/**
 * Count unread items
 */
export function countUnread(items: InboxItem[]): number {
  return items.filter((item) => item.status === InboxStatus.UNREAD).length;
}
