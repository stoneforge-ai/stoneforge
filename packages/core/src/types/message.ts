/**
 * Message Type - Immutable communication records
 *
 * Messages represent persistent, immutable communication between entities within Stoneforge.
 * They function similarly to email - once sent, they cannot be edited or deleted, providing
 * a reliable audit trail of all communication.
 */

import { ValidationError, ConstraintError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import {
  Element,
  ElementId,
  EntityId,
  ElementType,
  createTimestamp,
  validateTags,
  validateMetadata,
} from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';
import { DocumentId } from './document.js';

// ============================================================================
// Message ID Type
// ============================================================================

/**
 * Branded type for Message IDs (for use in threading)
 */
declare const MessageIdBrand: unique symbol;
export type MessageId = ElementId & { readonly [MessageIdBrand]: typeof MessageIdBrand };

/**
 * Branded type for Channel IDs
 * Note: This is also exported from channel.ts for the Channel type.
 * We keep a separate definition here to avoid circular imports.
 */
declare const ChannelIdBrand: unique symbol;
export type ChannelId = ElementId & { readonly [ChannelIdBrand]: typeof ChannelIdBrand };

// ============================================================================
// Validation Constants
// ============================================================================

/** Maximum number of attachments per message */
export const MAX_ATTACHMENTS = 100;

// ============================================================================
// Message Interface
// ============================================================================

/**
 * Message interface - extends Element with immutable communication properties
 *
 * Key characteristics:
 * - Immutable: Cannot be updated or deleted after creation
 * - updatedAt always equals createdAt
 * - Content stored separately as a Document (contentRef)
 * - Supports threading via optional threadId
 */
export interface Message extends Element {
  /** Message type is always 'message' */
  readonly type: typeof ElementType.MESSAGE;

  // Location
  /** Channel containing this message (mutable for channel merge operations) */
  channelId: ChannelId;

  // Sender
  /** Entity that sent the message */
  readonly sender: EntityId;

  // Content
  /** Reference to content Document */
  readonly contentRef: DocumentId;
  /** References to attachment Documents */
  readonly attachments: readonly DocumentId[];

  // Threading
  /** Parent message for threading (null for root messages) */
  readonly threadId: MessageId | null;
}

/**
 * Message with hydrated document references
 */
export interface HydratedMessage extends Message {
  /** Hydrated content Document content */
  content?: string;
  /** Hydrated attachment Document contents */
  attachmentContents?: string[];
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a channel ID format
 */
export function isValidChannelId(value: unknown): value is ChannelId {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates channel ID and throws if invalid
 */
export function validateChannelId(value: unknown): ChannelId {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Channel ID must be a string',
      ErrorCode.INVALID_ID,
      { field: 'channelId', value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      'Channel ID has invalid format',
      ErrorCode.INVALID_ID,
      { field: 'channelId', value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as ChannelId;
}

/**
 * Validates a message ID format (for threading)
 */
export function isValidMessageId(value: unknown): value is MessageId {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates message ID and throws if invalid
 */
export function validateMessageId(value: unknown): MessageId {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Message ID must be a string',
      ErrorCode.INVALID_ID,
      { field: 'threadId', value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      'Message ID has invalid format',
      ErrorCode.INVALID_ID,
      { field: 'threadId', value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as MessageId;
}

/**
 * Validates a document ID format (for content and attachments)
 */
export function isValidMessageDocumentId(value: unknown): value is DocumentId {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates document ID and throws if invalid
 */
export function validateMessageDocumentId(value: unknown, field: string): DocumentId {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `${field} must be a string`,
      ErrorCode.INVALID_ID,
      { field, value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      `${field} has invalid format`,
      ErrorCode.INVALID_ID,
      { field, value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as DocumentId;
}

/**
 * Validates an entity ID format (for sender)
 */
export function isValidMessageSenderId(value: unknown): value is EntityId {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates entity ID and throws if invalid
 */
export function validateMessageSenderId(value: unknown, field: string): EntityId {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `${field} must be a string`,
      ErrorCode.INVALID_ID,
      { field, value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      `${field} has invalid format`,
      ErrorCode.INVALID_ID,
      { field, value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as EntityId;
}

/**
 * Validates thread ID (can be null for root messages)
 */
export function isValidThreadId(value: unknown): value is MessageId | null {
  if (value === null) {
    return true;
  }
  return isValidMessageId(value);
}

/**
 * Validates thread ID and throws if invalid
 */
export function validateThreadId(value: unknown): MessageId | null {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return null;
  }

  return validateMessageId(value);
}

/**
 * Validates attachments array
 */
export function isValidAttachments(value: unknown): value is DocumentId[] {
  if (!Array.isArray(value)) {
    return false;
  }

  if (value.length > MAX_ATTACHMENTS) {
    return false;
  }

  return value.every(isValidMessageDocumentId);
}

/**
 * Validates attachments and throws if invalid
 */
export function validateAttachments(value: unknown): DocumentId[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      'Attachments must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'attachments', value, expected: 'array' }
    );
  }

  if (value.length > MAX_ATTACHMENTS) {
    throw new ValidationError(
      `Too many attachments. Maximum is ${MAX_ATTACHMENTS}`,
      ErrorCode.INVALID_INPUT,
      { field: 'attachments', expected: `<= ${MAX_ATTACHMENTS}`, actual: value.length }
    );
  }

  return value.map((id, index) => validateMessageDocumentId(id, `attachments[${index}]`));
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Message
 */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.MESSAGE) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check message-specific properties
  if (!isValidChannelId(obj.channelId)) return false;
  if (!isValidMessageSenderId(obj.sender)) return false;
  if (!isValidMessageDocumentId(obj.contentRef)) return false;
  if (!isValidAttachments(obj.attachments)) return false;
  if (!isValidThreadId(obj.threadId)) return false;

  return true;
}

/**
 * Comprehensive validation of a message with detailed errors
 */
export function validateMessage(value: unknown): Message {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Message must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Message id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.MESSAGE) {
    throw new ValidationError(
      `Message type must be '${ElementType.MESSAGE}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.MESSAGE }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError(
      'Message createdAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdAt', value: obj.createdAt }
    );
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError(
      'Message updatedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'updatedAt', value: obj.updatedAt }
    );
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Message createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError(
      'Message tags must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'tags', value: obj.tags, expected: 'array' }
    );
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError(
      'Message metadata must be an object',
      ErrorCode.INVALID_INPUT,
      { field: 'metadata', value: obj.metadata, expected: 'object' }
    );
  }

  // Validate message-specific fields
  validateChannelId(obj.channelId);
  validateMessageSenderId(obj.sender, 'sender');
  validateMessageDocumentId(obj.contentRef, 'contentRef');
  validateAttachments(obj.attachments);
  validateThreadId(obj.threadId);

  return value as Message;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new message
 */
export interface CreateMessageInput {
  /** Channel containing this message */
  channelId: ChannelId;
  /** Entity that sent the message */
  sender: EntityId;
  /** Reference to content Document */
  contentRef: DocumentId;
  /** Optional: References to attachment Documents */
  attachments?: DocumentId[];
  /** Optional: Parent message for threading */
  threadId?: MessageId | null;
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Message with validated inputs
 *
 * Note: This creates the message data structure. The API/service layer is responsible for:
 * 1. Validating channel exists
 * 2. Validating sender is channel member
 * 3. Validating contentRef points to valid Document
 * 4. Validating attachments point to valid Documents
 * 5. Validating threadId (if present) points to message in same channel
 *
 * @param input - Message creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Message
 */
export async function createMessage(
  input: CreateMessageInput,
  config?: IdGeneratorConfig
): Promise<Message> {
  // Validate inputs
  const channelId = validateChannelId(input.channelId);
  const sender = validateMessageSenderId(input.sender, 'sender');
  const contentRef = validateMessageDocumentId(input.contentRef, 'contentRef');
  const attachments = input.attachments ? validateAttachments(input.attachments) : [];
  const threadId = validateThreadId(input.threadId ?? null);

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Generate ID using channel and sender for uniqueness
  const identifier = `${channelId}-${sender}-${now}`;
  const id = await generateId(
    { identifier, createdBy: sender },
    config
  );

  const message: Message = {
    id: id as unknown as MessageId,
    type: ElementType.MESSAGE,
    createdAt: now,
    updatedAt: now, // Always equals createdAt for immutable messages
    createdBy: sender,
    tags,
    metadata,
    channelId,
    sender,
    contentRef,
    attachments,
    threadId,
  };

  return message;
}

// ============================================================================
// Immutability Enforcement
// ============================================================================

/**
 * Error thrown when attempting to update an immutable message
 */
export class MessageImmutableError extends ConstraintError {
  constructor(messageId: string, operation: 'update' | 'delete') {
    super(
      `Cannot ${operation} message: Messages are immutable`,
      ErrorCode.IMMUTABLE,
      { field: 'id', value: messageId, operation }
    );
  }
}

/**
 * Rejects update operations on messages (immutability enforcement)
 * @throws MessageImmutableError always
 */
export function rejectMessageUpdate(messageId: string): never {
  throw new MessageImmutableError(messageId, 'update');
}

/**
 * Rejects delete operations on messages (immutability enforcement)
 * @throws MessageImmutableError always
 */
export function rejectMessageDelete(messageId: string): never {
  throw new MessageImmutableError(messageId, 'delete');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a message is a root message (not a reply)
 */
export function isRootMessage(message: Message): boolean {
  return message.threadId === null;
}

/**
 * Checks if a message is a reply (has a thread parent)
 */
export function isReply(message: Message): boolean {
  return message.threadId !== null;
}

/**
 * Checks if a message has attachments
 */
export function hasAttachments(message: Message): boolean {
  return message.attachments.length > 0;
}

/**
 * Gets the number of attachments
 */
export function getAttachmentCount(message: Message): number {
  return message.attachments.length;
}

/**
 * Checks if message was sent by a specific entity
 */
export function isSentBy(message: Message, entityId: EntityId): boolean {
  return message.sender === entityId;
}

/**
 * Checks if message is in a specific channel
 */
export function isInChannel(message: Message, channelId: ChannelId): boolean {
  return message.channelId === channelId;
}

/**
 * Checks if message is in a specific thread
 */
export function isInThread(message: Message, threadId: MessageId): boolean {
  return message.threadId === threadId;
}

/**
 * Filter messages by channel
 */
export function filterByChannel<T extends Message>(messages: T[], channelId: ChannelId): T[] {
  return messages.filter((m) => m.channelId === channelId);
}

/**
 * Filter messages by sender
 */
export function filterBySender<T extends Message>(messages: T[], sender: EntityId): T[] {
  return messages.filter((m) => m.sender === sender);
}

/**
 * Filter messages by thread (replies to a specific message)
 */
export function filterByThread<T extends Message>(messages: T[], threadId: MessageId): T[] {
  return messages.filter((m) => m.threadId === threadId);
}

/**
 * Filter root messages only (no thread parent)
 */
export function filterRootMessages<T extends Message>(messages: T[]): T[] {
  return messages.filter(isRootMessage);
}

/**
 * Filter reply messages only (has thread parent)
 */
export function filterReplies<T extends Message>(messages: T[]): T[] {
  return messages.filter(isReply);
}

/**
 * Sort messages by creation time (oldest first)
 */
export function sortByCreatedAt<T extends Message>(messages: T[]): T[] {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Sort messages by creation time (newest first)
 */
export function sortByCreatedAtDesc<T extends Message>(messages: T[]): T[] {
  return [...messages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get thread structure: root message + all replies
 * Returns messages sorted by creation time
 */
export function getThreadMessages<T extends Message>(
  messages: T[],
  rootMessageId: MessageId
): T[] {
  const inThread = messages.filter(
    (m) => m.id === rootMessageId || m.threadId === rootMessageId
  );
  return sortByCreatedAt(inThread);
}

/**
 * Group messages by channel
 */
export function groupByChannel<T extends Message>(
  messages: T[]
): Map<ChannelId, T[]> {
  const groups = new Map<ChannelId, T[]>();

  for (const message of messages) {
    const channelMessages = groups.get(message.channelId) ?? [];
    channelMessages.push(message);
    groups.set(message.channelId, channelMessages);
  }

  return groups;
}

/**
 * Group messages by sender
 */
export function groupBySender<T extends Message>(
  messages: T[]
): Map<EntityId, T[]> {
  const groups = new Map<EntityId, T[]>();

  for (const message of messages) {
    const senderMessages = groups.get(message.sender) ?? [];
    senderMessages.push(message);
    groups.set(message.sender, senderMessages);
  }

  return groups;
}

/**
 * Verify message immutability constraint: updatedAt must equal createdAt
 */
export function verifyImmutabilityConstraint(message: Message): boolean {
  return message.createdAt === message.updatedAt;
}
