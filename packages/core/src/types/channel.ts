/**
 * Channel Type - Message containers for entity communication
 *
 * Channels are containers for messages between entities, organizing communication
 * into logical groups. They support both direct messaging (1:1) and group
 * conversations with configurable membership and permissions.
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

// ============================================================================
// Channel Type Definitions
// ============================================================================

/**
 * Channel type discriminator
 */
export const ChannelTypeValue = {
  DIRECT: 'direct',
  GROUP: 'group',
} as const;

export type ChannelType = (typeof ChannelTypeValue)[keyof typeof ChannelTypeValue];

/**
 * Channel visibility options
 */
export const VisibilityValue = {
  PUBLIC: 'public',
  PRIVATE: 'private',
} as const;

export type Visibility = (typeof VisibilityValue)[keyof typeof VisibilityValue];

/**
 * Channel join policy options
 */
export const JoinPolicyValue = {
  OPEN: 'open',
  INVITE_ONLY: 'invite-only',
  REQUEST: 'request',
} as const;

export type JoinPolicy = (typeof JoinPolicyValue)[keyof typeof JoinPolicyValue];

// ============================================================================
// Channel Permissions
// ============================================================================

/**
 * Channel permissions configuration
 */
export interface ChannelPermissions {
  /** Who can discover the channel */
  readonly visibility: Visibility;
  /** How entities join the channel */
  readonly joinPolicy: JoinPolicy;
  /** Entity IDs who can add/remove members */
  readonly modifyMembers: readonly EntityId[];
}

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Branded type for Channel IDs
 */
declare const ChannelIdBrand: unique symbol;
export type ChannelId = ElementId & { readonly [ChannelIdBrand]: typeof ChannelIdBrand };

// ============================================================================
// Validation Constants
// ============================================================================

/** Maximum channel name length */
export const MAX_CHANNEL_NAME_LENGTH = 100;

/** Minimum channel name length */
export const MIN_CHANNEL_NAME_LENGTH = 1;

/** Maximum members in a channel */
export const MAX_CHANNEL_MEMBERS = 1000;

/** Minimum members for a group channel */
export const MIN_GROUP_MEMBERS = 2;

/** Exact member count for direct channels */
export const DIRECT_CHANNEL_MEMBERS = 2;

/** Channel name pattern: alphanumeric, hyphen, underscore, colon (for direct channel names) */
const CHANNEL_NAME_PATTERN = /^[a-zA-Z0-9_:-]+$/;

// ============================================================================
// Channel Interface
// ============================================================================

/**
 * Channel interface - extends Element with message container properties
 */
export interface Channel extends Element {
  /** Channel type is always 'channel' */
  readonly type: typeof ElementType.CHANNEL;

  // Content
  /** Channel name (unique constraints vary by type) */
  readonly name: string;
  /** Channel description (optional) */
  readonly description: string | null;

  // Channel Type
  /** Direct (1:1) or Group channel */
  readonly channelType: ChannelType;

  // Membership
  /** Current channel members */
  readonly members: readonly EntityId[];

  // Permissions
  /** Access control settings */
  readonly permissions: ChannelPermissions;
}

/**
 * Channel with hydrated document references (kept as alias for backward compat)
 */
export type HydratedChannel = Channel;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a channel type value
 */
export function isValidChannelType(value: unknown): value is ChannelType {
  return (
    typeof value === 'string' &&
    Object.values(ChannelTypeValue).includes(value as ChannelType)
  );
}

/**
 * Validates channel type and throws if invalid
 */
export function validateChannelType(value: unknown): ChannelType {
  if (!isValidChannelType(value)) {
    throw new ValidationError(
      `Invalid channel type: ${value}`,
      ErrorCode.INVALID_INPUT,
      { field: 'channelType', value, expected: Object.values(ChannelTypeValue) }
    );
  }
  return value;
}

/**
 * Validates a visibility value
 */
export function isValidVisibility(value: unknown): value is Visibility {
  return (
    typeof value === 'string' &&
    Object.values(VisibilityValue).includes(value as Visibility)
  );
}

/**
 * Validates visibility and throws if invalid
 */
export function validateVisibility(value: unknown): Visibility {
  if (!isValidVisibility(value)) {
    throw new ValidationError(
      `Invalid visibility: ${value}`,
      ErrorCode.INVALID_INPUT,
      { field: 'visibility', value, expected: Object.values(VisibilityValue) }
    );
  }
  return value;
}

/**
 * Validates a join policy value
 */
export function isValidJoinPolicy(value: unknown): value is JoinPolicy {
  return (
    typeof value === 'string' &&
    Object.values(JoinPolicyValue).includes(value as JoinPolicy)
  );
}

/**
 * Validates join policy and throws if invalid
 */
export function validateJoinPolicy(value: unknown): JoinPolicy {
  if (!isValidJoinPolicy(value)) {
    throw new ValidationError(
      `Invalid join policy: ${value}`,
      ErrorCode.INVALID_INPUT,
      { field: 'joinPolicy', value, expected: Object.values(JoinPolicyValue) }
    );
  }
  return value;
}

/**
 * Validates a channel name
 */
export function isValidChannelName(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length < MIN_CHANNEL_NAME_LENGTH || value.length > MAX_CHANNEL_NAME_LENGTH) {
    return false;
  }
  return CHANNEL_NAME_PATTERN.test(value);
}

/**
 * Validates channel name and throws if invalid
 */
export function validateChannelName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Channel name must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'string' }
    );
  }

  if (value.length < MIN_CHANNEL_NAME_LENGTH) {
    throw new ValidationError(
      'Channel name cannot be empty',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value }
    );
  }

  if (value.length > MAX_CHANNEL_NAME_LENGTH) {
    throw new ValidationError(
      `Channel name exceeds maximum length of ${MAX_CHANNEL_NAME_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', expected: `<= ${MAX_CHANNEL_NAME_LENGTH}`, actual: value.length }
    );
  }

  if (!CHANNEL_NAME_PATTERN.test(value)) {
    throw new ValidationError(
      'Channel name contains invalid characters. Only alphanumeric, hyphen, underscore, and colon allowed',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'alphanumeric, hyphen, underscore, colon' }
    );
  }

  return value;
}

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
      { field: 'id', value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      'Channel ID has invalid format',
      ErrorCode.INVALID_ID,
      { field: 'id', value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as ChannelId;
}

/**
 * Validates an entity ID format (for members)
 */
export function isValidMemberId(value: unknown): value is EntityId {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates entity ID and throws if invalid
 */
export function validateMemberId(value: unknown, field: string): EntityId {
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
 * Validates a description value
 */
export function isValidDescription(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  return typeof value === 'string';
}

/**
 * Validates description and throws if invalid
 */
export function validateDescription(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(
      'Description must be a string or null',
      ErrorCode.INVALID_INPUT,
      { field: 'description', value, expected: 'string or null' }
    );
  }

  return value;
}

/**
 * Validates members array
 */
export function isValidMembers(value: unknown): value is EntityId[] {
  if (!Array.isArray(value)) {
    return false;
  }

  if (value.length > MAX_CHANNEL_MEMBERS) {
    return false;
  }

  return value.every(isValidMemberId);
}

/**
 * Validates members and throws if invalid
 */
export function validateMembers(value: unknown): EntityId[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      'Members must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'members', value, expected: 'array' }
    );
  }

  if (value.length > MAX_CHANNEL_MEMBERS) {
    throw new ValidationError(
      `Too many members. Maximum is ${MAX_CHANNEL_MEMBERS}`,
      ErrorCode.INVALID_INPUT,
      { field: 'members', expected: `<= ${MAX_CHANNEL_MEMBERS}`, actual: value.length }
    );
  }

  return value.map((id, index) => validateMemberId(id, `members[${index}]`));
}

/**
 * Validates modifyMembers array (entities who can modify membership)
 */
export function isValidModifyMembers(value: unknown): value is EntityId[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(isValidMemberId);
}

/**
 * Validates modifyMembers and throws if invalid
 */
export function validateModifyMembers(value: unknown): EntityId[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      'modifyMembers must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'modifyMembers', value, expected: 'array' }
    );
  }

  return value.map((id, index) => validateMemberId(id, `modifyMembers[${index}]`));
}

/**
 * Validates channel permissions object
 */
export function isValidChannelPermissions(value: unknown): value is ChannelPermissions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (!isValidVisibility(obj.visibility)) return false;
  if (!isValidJoinPolicy(obj.joinPolicy)) return false;
  if (!isValidModifyMembers(obj.modifyMembers)) return false;

  return true;
}

/**
 * Validates permissions and throws if invalid
 */
export function validateChannelPermissions(value: unknown): ChannelPermissions {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Permissions must be an object',
      ErrorCode.INVALID_INPUT,
      { field: 'permissions', value, expected: 'object' }
    );
  }

  const obj = value as Record<string, unknown>;

  const visibility = validateVisibility(obj.visibility);
  const joinPolicy = validateJoinPolicy(obj.joinPolicy);
  const modifyMembers = validateModifyMembers(obj.modifyMembers);

  return { visibility, joinPolicy, modifyMembers };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Channel
 */
export function isChannel(value: unknown): value is Channel {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.CHANNEL) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check channel-specific properties
  if (!isValidChannelName(obj.name)) return false;
  if (!isValidDescription(obj.description)) return false;
  if (!isValidChannelType(obj.channelType)) return false;
  if (!isValidMembers(obj.members)) return false;
  if (!isValidChannelPermissions(obj.permissions)) return false;

  return true;
}

/**
 * Type guard to check if a channel is a direct channel
 */
export function isDirectChannel(channel: Channel): boolean {
  return channel.channelType === ChannelTypeValue.DIRECT;
}

/**
 * Type guard to check if a channel is a group channel
 */
export function isGroupChannel(channel: Channel): boolean {
  return channel.channelType === ChannelTypeValue.GROUP;
}

/**
 * Comprehensive validation of a channel with detailed errors
 */
export function validateChannel(value: unknown): Channel {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Channel must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Channel id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.CHANNEL) {
    throw new ValidationError(
      `Channel type must be '${ElementType.CHANNEL}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.CHANNEL }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError(
      'Channel createdAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdAt', value: obj.createdAt }
    );
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError(
      'Channel updatedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'updatedAt', value: obj.updatedAt }
    );
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Channel createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError(
      'Channel tags must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'tags', value: obj.tags, expected: 'array' }
    );
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError(
      'Channel metadata must be an object',
      ErrorCode.INVALID_INPUT,
      { field: 'metadata', value: obj.metadata, expected: 'object' }
    );
  }

  // Validate channel-specific fields
  validateChannelName(obj.name);
  validateDescription(obj.description);
  validateChannelType(obj.channelType);
  validateMembers(obj.members);
  validateChannelPermissions(obj.permissions);

  return value as Channel;
}

// ============================================================================
// Direct Channel Naming
// ============================================================================

/**
 * Generates a deterministic name for a direct channel between two entities
 *
 * Algorithm:
 * 1. Take both entity IDs
 * 2. Sort alphabetically
 * 3. Join with colon separator
 *
 * This ensures:
 * - Only one direct channel per entity pair
 * - Idempotent creation (find or create)
 * - Easy lookup by participant IDs
 */
export function generateDirectChannelName(entityA: EntityId, entityB: EntityId): string {
  const sorted = [entityA, entityB].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

/**
 * Parses entity IDs from a direct channel name
 * Returns null if not a valid direct channel name format
 */
export function parseDirectChannelName(name: string): [EntityId, EntityId] | null {
  const parts = name.split(':');
  if (parts.length !== 2) {
    return null;
  }

  if (!isValidMemberId(parts[0]) || !isValidMemberId(parts[1])) {
    return null;
  }

  return [parts[0] as EntityId, parts[1] as EntityId];
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new group channel
 */
export interface CreateGroupChannelInput {
  /** Channel name */
  name: string;
  /** Channel creator (will be added to members and modifyMembers) */
  createdBy: EntityId;
  /** Initial members (creator automatically included) */
  members?: EntityId[];
  /** Optional: Channel description */
  description?: string | null;
  /** Optional: Channel visibility */
  visibility?: Visibility;
  /** Optional: Join policy */
  joinPolicy?: JoinPolicy;
  /** Optional: Entities who can modify membership (creator automatically included) */
  modifyMembers?: EntityId[];
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new group Channel with validated inputs
 */
export async function createGroupChannel(
  input: CreateGroupChannelInput,
  config?: IdGeneratorConfig
): Promise<Channel> {
  // Validate name
  const name = validateChannelName(input.name);

  // Validate creator
  const createdBy = validateMemberId(input.createdBy, 'createdBy');

  // Build members list (ensure creator is included)
  let members = input.members ? validateMembers(input.members) : [];
  if (!members.includes(createdBy)) {
    members = [createdBy, ...members];
  }

  // Validate minimum members for group
  if (members.length < MIN_GROUP_MEMBERS) {
    throw new ValidationError(
      `Group channel requires at least ${MIN_GROUP_MEMBERS} members`,
      ErrorCode.INVALID_INPUT,
      { field: 'members', expected: `>= ${MIN_GROUP_MEMBERS}`, actual: members.length }
    );
  }

  // Validate description
  const description = validateDescription(input.description ?? null);

  // Build permissions
  const visibility = input.visibility ? validateVisibility(input.visibility) : VisibilityValue.PRIVATE;
  const joinPolicy = input.joinPolicy ? validateJoinPolicy(input.joinPolicy) : JoinPolicyValue.INVITE_ONLY;

  // Build modifyMembers (ensure creator is included)
  let modifyMembers = input.modifyMembers ? validateModifyMembers(input.modifyMembers) : [];
  if (!modifyMembers.includes(createdBy)) {
    modifyMembers = [createdBy, ...modifyMembers];
  }

  const permissions: ChannelPermissions = {
    visibility,
    joinPolicy,
    modifyMembers,
  };

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Generate ID
  const identifier = `${name}-${createdBy}-${now}`;
  const id = await generateId(
    { identifier, createdBy },
    config
  );

  const channel: Channel = {
    id: id as unknown as ChannelId,
    type: ElementType.CHANNEL,
    createdAt: now,
    updatedAt: now,
    createdBy,
    tags,
    metadata,
    name,
    description,
    channelType: ChannelTypeValue.GROUP,
    members,
    permissions,
  };

  return channel;
}

/**
 * Input for creating a direct channel
 */
export interface CreateDirectChannelInput {
  /** First entity */
  entityA: EntityId;
  /** Second entity */
  entityB: EntityId;
  /** Creator (must be one of the entities) */
  createdBy: EntityId;
  /** Optional: Display name for first entity (used for channel name) */
  entityAName?: string;
  /** Optional: Display name for second entity (used for channel name) */
  entityBName?: string;
  /** Optional: Channel description */
  description?: string | null;
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new direct Channel with validated inputs
 *
 * Direct channels have:
 * - Exactly 2 members, immutable
 * - Deterministic name (sorted entity IDs joined by colon)
 * - Always private visibility
 * - Always invite-only join policy
 */
export async function createDirectChannel(
  input: CreateDirectChannelInput,
  config?: IdGeneratorConfig
): Promise<Channel> {
  // Validate entities
  const entityA = validateMemberId(input.entityA, 'entityA');
  const entityB = validateMemberId(input.entityB, 'entityB');
  const createdBy = validateMemberId(input.createdBy, 'createdBy');

  // Validate entities are different
  if (entityA === entityB) {
    throw new ValidationError(
      'Direct channel requires two different entities',
      ErrorCode.INVALID_INPUT,
      { field: 'entityB', value: entityB, expected: 'different from entityA' }
    );
  }

  // Validate creator is one of the entities
  if (createdBy !== entityA && createdBy !== entityB) {
    throw new ValidationError(
      'Creator must be one of the channel entities',
      ErrorCode.INVALID_INPUT,
      { field: 'createdBy', value: createdBy, expected: 'entityA or entityB' }
    );
  }

  // Generate channel name - use entity names if provided, otherwise use IDs
  const nameA = input.entityAName ?? entityA;
  const nameB = input.entityBName ?? entityB;
  const sortedNames = [nameA, nameB].sort();
  const name = `${sortedNames[0]}:${sortedNames[1]}`;

  // Build members (sorted for consistency)
  const members = [entityA, entityB].sort() as EntityId[];

  // Validate description
  const description = validateDescription(input.description ?? null);

  // Direct channels have fixed permissions
  const permissions: ChannelPermissions = {
    visibility: VisibilityValue.PRIVATE,
    joinPolicy: JoinPolicyValue.INVITE_ONLY,
    modifyMembers: [], // No one can modify direct channel membership
  };

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Generate ID using the deterministic name for consistency
  const identifier = `direct-${name}`;
  const id = await generateId(
    { identifier, createdBy },
    config
  );

  const channel: Channel = {
    id: id as unknown as ChannelId,
    type: ElementType.CHANNEL,
    createdAt: now,
    updatedAt: now,
    createdBy,
    tags,
    metadata,
    name,
    description,
    channelType: ChannelTypeValue.DIRECT,
    members,
    permissions,
  };

  return channel;
}

// ============================================================================
// Membership Validation Errors
// ============================================================================

/**
 * Error thrown when attempting to modify direct channel membership
 */
export class DirectChannelMembershipError extends ConstraintError {
  constructor(channelId: string, operation: 'add' | 'remove') {
    super(
      `Cannot ${operation} member from direct channel: Membership is immutable`,
      ErrorCode.IMMUTABLE,
      { field: 'members', value: channelId, operation }
    );
  }
}

/**
 * Error thrown when entity is not a channel member
 */
export class NotAMemberError extends ConstraintError {
  constructor(channelId: string, entityId: string) {
    super(
      `Entity is not a member of the channel`,
      ErrorCode.MEMBER_REQUIRED,
      { field: 'members', channel: channelId, entity: entityId }
    );
  }
}

/**
 * Error thrown when entity lacks permission to modify membership
 */
export class CannotModifyMembersError extends ConstraintError {
  constructor(channelId: string, actorId: string) {
    super(
      `Entity does not have permission to modify channel membership`,
      ErrorCode.MEMBER_REQUIRED,
      { field: 'modifyMembers', channel: channelId, actor: actorId }
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if an entity is a member of a channel
 */
export function isMember(channel: Channel, entityId: EntityId): boolean {
  return channel.members.includes(entityId);
}

/**
 * Checks if an entity can modify channel membership
 */
export function canModifyMembers(channel: Channel, entityId: EntityId): boolean {
  // Direct channels cannot have membership modified
  if (channel.channelType === ChannelTypeValue.DIRECT) {
    return false;
  }
  return channel.permissions.modifyMembers.includes(entityId);
}

/**
 * Checks if an entity can join a channel (based on join policy)
 */
export function canJoin(channel: Channel, entityId: EntityId): boolean {
  // Already a member
  if (isMember(channel, entityId)) {
    return false;
  }

  // Direct channels cannot be joined
  if (channel.channelType === ChannelTypeValue.DIRECT) {
    return false;
  }

  // Check join policy
  switch (channel.permissions.joinPolicy) {
    case JoinPolicyValue.OPEN:
      // Open channels: anyone can join if public
      return channel.permissions.visibility === VisibilityValue.PUBLIC;
    case JoinPolicyValue.REQUEST:
      // Request channels: can request to join (approval needed separately)
      return true;
    case JoinPolicyValue.INVITE_ONLY:
      // Invite only: must be added by modifier
      return false;
    default:
      return false;
  }
}

/**
 * Checks if a channel is public
 */
export function isPublicChannel(channel: Channel): boolean {
  return channel.permissions.visibility === VisibilityValue.PUBLIC;
}

/**
 * Checks if a channel is private
 */
export function isPrivateChannel(channel: Channel): boolean {
  return channel.permissions.visibility === VisibilityValue.PRIVATE;
}

/**
 * Gets the member count
 */
export function getMemberCount(channel: Channel): number {
  return channel.members.length;
}

/**
 * Checks if a channel has a description
 */
export function hasDescription(channel: Channel): boolean {
  return channel.description !== null;
}

/**
 * Filter channels by type
 */
export function filterByChannelType<T extends Channel>(channels: T[], channelType: ChannelType): T[] {
  return channels.filter((c) => c.channelType === channelType);
}

/**
 * Filter direct channels only
 */
export function filterDirectChannels<T extends Channel>(channels: T[]): T[] {
  return channels.filter((c) => c.channelType === ChannelTypeValue.DIRECT);
}

/**
 * Filter group channels only
 */
export function filterGroupChannels<T extends Channel>(channels: T[]): T[] {
  return channels.filter((c) => c.channelType === ChannelTypeValue.GROUP);
}

/**
 * Filter channels by member (channels containing a specific entity)
 */
export function filterByMember<T extends Channel>(channels: T[], entityId: EntityId): T[] {
  return channels.filter((c) => c.members.includes(entityId));
}

/**
 * Filter channels by visibility
 */
export function filterByVisibility<T extends Channel>(channels: T[], visibility: Visibility): T[] {
  return channels.filter((c) => c.permissions.visibility === visibility);
}

/**
 * Filter public channels
 */
export function filterPublicChannels<T extends Channel>(channels: T[]): T[] {
  return channels.filter(isPublicChannel);
}

/**
 * Filter private channels
 */
export function filterPrivateChannels<T extends Channel>(channels: T[]): T[] {
  return channels.filter(isPrivateChannel);
}

/**
 * Sort channels by name alphabetically
 */
export function sortByName<T extends Channel>(channels: T[]): T[] {
  return [...channels].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sort channels by member count (descending)
 */
export function sortByMemberCount<T extends Channel>(channels: T[]): T[] {
  return [...channels].sort((a, b) => b.members.length - a.members.length);
}

/**
 * Sort channels by creation time (newest first)
 */
export function sortByCreatedAtDesc<T extends Channel>(channels: T[]): T[] {
  return [...channels].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Group channels by visibility
 */
export function groupByVisibility<T extends Channel>(
  channels: T[]
): Map<Visibility, T[]> {
  const groups = new Map<Visibility, T[]>();

  for (const channel of channels) {
    const visibility = channel.permissions.visibility;
    const channelGroup = groups.get(visibility) ?? [];
    channelGroup.push(channel);
    groups.set(visibility, channelGroup);
  }

  return groups;
}

/**
 * Group channels by type
 */
export function groupByChannelType<T extends Channel>(
  channels: T[]
): Map<ChannelType, T[]> {
  const groups = new Map<ChannelType, T[]>();

  for (const channel of channels) {
    const channelGroup = groups.get(channel.channelType) ?? [];
    channelGroup.push(channel);
    groups.set(channel.channelType, channelGroup);
  }

  return groups;
}

/**
 * Find a direct channel between two entities
 */
export function findDirectChannel<T extends Channel>(
  channels: T[],
  entityA: EntityId,
  entityB: EntityId
): T | undefined {
  const sortedMembers = [entityA, entityB].sort();
  return channels.find(
    (c) =>
      c.channelType === ChannelTypeValue.DIRECT &&
      c.members.length === 2 &&
      c.members[0] === sortedMembers[0] &&
      c.members[1] === sortedMembers[1]
  );
}

/**
 * Get all direct channels for an entity
 */
export function getDirectChannelsForEntity<T extends Channel>(
  channels: T[],
  entityId: EntityId
): T[] {
  return channels.filter(
    (c) => c.channelType === ChannelTypeValue.DIRECT && c.members.includes(entityId)
  );
}

/**
 * Validates direct channel constraints (exactly 2 members, immutable)
 */
export function validateDirectChannelConstraints(channel: Channel): boolean {
  if (channel.channelType !== ChannelTypeValue.DIRECT) {
    return true; // Not a direct channel, skip validation
  }

  // Must have exactly 2 members
  if (channel.members.length !== DIRECT_CHANNEL_MEMBERS) {
    return false;
  }

  // Must be private
  if (channel.permissions.visibility !== VisibilityValue.PRIVATE) {
    return false;
  }

  // Must be invite-only
  if (channel.permissions.joinPolicy !== JoinPolicyValue.INVITE_ONLY) {
    return false;
  }

  // No one can modify members
  if (channel.permissions.modifyMembers.length !== 0) {
    return false;
  }

  return true;
}
