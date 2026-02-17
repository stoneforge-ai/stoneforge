import { describe, expect, test } from 'bun:test';
import {
  Channel,
  HydratedChannel,
  ChannelId,
  ChannelType,
  ChannelTypeValue,
  Visibility,
  VisibilityValue,
  JoinPolicy,
  JoinPolicyValue,
  ChannelPermissions,
  MAX_CHANNEL_NAME_LENGTH,
  MIN_CHANNEL_NAME_LENGTH,
  MAX_CHANNEL_MEMBERS,
  MIN_GROUP_MEMBERS,
  DIRECT_CHANNEL_MEMBERS,
  isValidChannelType,
  validateChannelType,
  isValidVisibility,
  validateVisibility,
  isValidJoinPolicy,
  validateJoinPolicy,
  isValidChannelName,
  validateChannelName,
  isValidChannelId,
  validateChannelId,
  isValidMemberId,
  validateMemberId,
  isValidDescription,
  validateDescription,
  isValidMembers,
  validateMembers,
  isValidModifyMembers,
  validateModifyMembers,
  isValidChannelPermissions,
  validateChannelPermissions,
  isChannel,
  isDirectChannel,
  isGroupChannel,
  validateChannel,
  generateDirectChannelName,
  parseDirectChannelName,
  createGroupChannel,
  CreateGroupChannelInput,
  createDirectChannel,
  CreateDirectChannelInput,
  DirectChannelMembershipError,
  NotAMemberError,
  CannotModifyMembersError,
  isMember,
  canModifyMembers,
  canJoin,
  isPublicChannel,
  isPrivateChannel,
  getMemberCount,
  hasDescription,
  filterByChannelType,
  filterDirectChannels,
  filterGroupChannels,
  filterByMember,
  filterByVisibility,
  filterPublicChannels,
  filterPrivateChannels,
  sortByName,
  sortByMemberCount,
  sortByCreatedAtDesc,
  groupByVisibility,
  groupByChannelType,
  findDirectChannel,
  getDirectChannelsForEntity,
  validateDirectChannelConstraints,
} from './channel.js';
import { EntityId, ElementType, Timestamp } from './element.js';
import { ValidationError, ConstraintError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid channel for testing
function createTestChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'el-chan01' as ChannelId,
    type: ElementType.CHANNEL,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-user01' as EntityId,
    tags: [],
    metadata: {},
    name: 'test-channel',
    description: null,
    channelType: ChannelTypeValue.GROUP,
    members: ['el-user01' as EntityId, 'el-user02' as EntityId],
    permissions: {
      visibility: VisibilityValue.PRIVATE,
      joinPolicy: JoinPolicyValue.INVITE_ONLY,
      modifyMembers: ['el-user01' as EntityId],
    },
    ...overrides,
  };
}

function createTestDirectChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'el-chan02' as ChannelId,
    type: ElementType.CHANNEL,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-user01' as EntityId,
    tags: [],
    metadata: {},
    name: 'el-user01:el-user02',
    description: null,
    channelType: ChannelTypeValue.DIRECT,
    members: ['el-user01' as EntityId, 'el-user02' as EntityId],
    permissions: {
      visibility: VisibilityValue.PRIVATE,
      joinPolicy: JoinPolicyValue.INVITE_ONLY,
      modifyMembers: [],
    },
    ...overrides,
  };
}

// ============================================================================
// Channel Type Validation Tests
// ============================================================================

describe('isValidChannelType', () => {
  test('accepts valid channel types', () => {
    expect(isValidChannelType('direct')).toBe(true);
    expect(isValidChannelType('group')).toBe(true);
  });

  test('rejects invalid channel types', () => {
    expect(isValidChannelType('invalid')).toBe(false);
    expect(isValidChannelType('')).toBe(false);
    expect(isValidChannelType(null)).toBe(false);
    expect(isValidChannelType(undefined)).toBe(false);
    expect(isValidChannelType(123)).toBe(false);
  });
});

describe('validateChannelType', () => {
  test('returns valid channel type', () => {
    expect(validateChannelType('direct')).toBe('direct');
    expect(validateChannelType('group')).toBe('group');
  });

  test('throws for invalid channel type', () => {
    expect(() => validateChannelType('invalid')).toThrow(ValidationError);
    try {
      validateChannelType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('channelType');
    }
  });
});

// ============================================================================
// Visibility Validation Tests
// ============================================================================

describe('isValidVisibility', () => {
  test('accepts valid visibility values', () => {
    expect(isValidVisibility('public')).toBe(true);
    expect(isValidVisibility('private')).toBe(true);
  });

  test('rejects invalid visibility values', () => {
    expect(isValidVisibility('invalid')).toBe(false);
    expect(isValidVisibility('')).toBe(false);
    expect(isValidVisibility(null)).toBe(false);
  });
});

describe('validateVisibility', () => {
  test('returns valid visibility', () => {
    expect(validateVisibility('public')).toBe('public');
    expect(validateVisibility('private')).toBe('private');
  });

  test('throws for invalid visibility', () => {
    expect(() => validateVisibility('invalid')).toThrow(ValidationError);
    try {
      validateVisibility('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('visibility');
    }
  });
});

// ============================================================================
// Join Policy Validation Tests
// ============================================================================

describe('isValidJoinPolicy', () => {
  test('accepts valid join policies', () => {
    expect(isValidJoinPolicy('open')).toBe(true);
    expect(isValidJoinPolicy('invite-only')).toBe(true);
    expect(isValidJoinPolicy('request')).toBe(true);
  });

  test('rejects invalid join policies', () => {
    expect(isValidJoinPolicy('invalid')).toBe(false);
    expect(isValidJoinPolicy('')).toBe(false);
    expect(isValidJoinPolicy(null)).toBe(false);
  });
});

describe('validateJoinPolicy', () => {
  test('returns valid join policy', () => {
    expect(validateJoinPolicy('open')).toBe('open');
    expect(validateJoinPolicy('invite-only')).toBe('invite-only');
    expect(validateJoinPolicy('request')).toBe('request');
  });

  test('throws for invalid join policy', () => {
    expect(() => validateJoinPolicy('invalid')).toThrow(ValidationError);
    try {
      validateJoinPolicy('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('joinPolicy');
    }
  });
});

// ============================================================================
// Channel Name Validation Tests
// ============================================================================

describe('isValidChannelName', () => {
  test('accepts valid channel names', () => {
    expect(isValidChannelName('my-channel')).toBe(true);
    expect(isValidChannelName('channel_123')).toBe(true);
    expect(isValidChannelName('el-user01:el-user02')).toBe(true);
    expect(isValidChannelName('a')).toBe(true);
  });

  test('rejects empty names', () => {
    expect(isValidChannelName('')).toBe(false);
  });

  test('rejects names with invalid characters', () => {
    expect(isValidChannelName('my channel')).toBe(false); // space
    expect(isValidChannelName('channel@test')).toBe(false); // @
    expect(isValidChannelName('channel.test')).toBe(false); // .
  });

  test('rejects names that are too long', () => {
    const longName = 'a'.repeat(MAX_CHANNEL_NAME_LENGTH + 1);
    expect(isValidChannelName(longName)).toBe(false);
  });

  test('accepts names at max length', () => {
    const maxName = 'a'.repeat(MAX_CHANNEL_NAME_LENGTH);
    expect(isValidChannelName(maxName)).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(isValidChannelName(null)).toBe(false);
    expect(isValidChannelName(undefined)).toBe(false);
    expect(isValidChannelName(123)).toBe(false);
  });
});

describe('validateChannelName', () => {
  test('returns valid channel name', () => {
    expect(validateChannelName('my-channel')).toBe('my-channel');
  });

  test('throws for non-string', () => {
    expect(() => validateChannelName(null)).toThrow(ValidationError);
    try {
      validateChannelName(123);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('name');
    }
  });

  test('throws for empty name', () => {
    expect(() => validateChannelName('')).toThrow(ValidationError);
  });

  test('throws for name too long', () => {
    const longName = 'a'.repeat(MAX_CHANNEL_NAME_LENGTH + 1);
    expect(() => validateChannelName(longName)).toThrow(ValidationError);
  });

  test('throws for invalid characters', () => {
    expect(() => validateChannelName('my channel')).toThrow(ValidationError);
  });
});

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
      expect(err.details.field).toBe('id');
    }
  });

  test('throws for invalid format', () => {
    expect(() => validateChannelId('invalid')).toThrow(ValidationError);
  });
});

// ============================================================================
// Member ID Validation Tests
// ============================================================================

describe('isValidMemberId', () => {
  test('accepts valid member IDs', () => {
    expect(isValidMemberId('el-user01')).toBe(true);
    expect(isValidMemberId('el-abc')).toBe(true);
  });

  test('rejects invalid member IDs', () => {
    expect(isValidMemberId('el-ab')).toBe(false);
    expect(isValidMemberId('')).toBe(false);
    expect(isValidMemberId(null)).toBe(false);
  });
});

describe('validateMemberId', () => {
  test('returns valid member ID', () => {
    expect(validateMemberId('el-user01', 'members[0]')).toBe('el-user01' as EntityId);
  });

  test('throws with field name in error', () => {
    try {
      validateMemberId(null, 'createdBy');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_ID);
      expect(err.details.field).toBe('createdBy');
    }
  });
});

// ============================================================================
// Description Ref Validation Tests
// ============================================================================

describe('isValidDescription', () => {
  test('accepts null', () => {
    expect(isValidDescription(null)).toBe(true);
  });

  test('accepts valid strings', () => {
    expect(isValidDescription('A channel description')).toBe(true);
    expect(isValidDescription('')).toBe(true);
  });

  test('rejects non-string, non-null values', () => {
    expect(isValidDescription(123)).toBe(false);
    expect(isValidDescription(undefined)).toBe(false);
    expect(isValidDescription({})).toBe(false);
  });
});

describe('validateDescription', () => {
  test('returns null for null/undefined', () => {
    expect(validateDescription(null)).toBe(null);
    expect(validateDescription(undefined)).toBe(null);
  });

  test('returns valid string', () => {
    expect(validateDescription('A description')).toBe('A description');
  });

  test('throws for non-string', () => {
    expect(() => validateDescription(123)).toThrow(ValidationError);
  });
});

// ============================================================================
// Members Validation Tests
// ============================================================================

describe('isValidMembers', () => {
  test('accepts valid member arrays', () => {
    expect(isValidMembers(['el-user01', 'el-user02'])).toBe(true);
    expect(isValidMembers([])).toBe(true);
  });

  test('rejects non-array', () => {
    expect(isValidMembers(null)).toBe(false);
    expect(isValidMembers('el-user01')).toBe(false);
  });

  test('rejects invalid member IDs', () => {
    expect(isValidMembers(['el-user01', 'invalid'])).toBe(false);
  });

  test('rejects too many members', () => {
    const tooMany = Array(MAX_CHANNEL_MEMBERS + 1).fill('el-user01');
    expect(isValidMembers(tooMany)).toBe(false);
  });
});

describe('validateMembers', () => {
  test('returns valid members array', () => {
    expect(validateMembers(['el-user01'])).toEqual(['el-user01' as EntityId]);
  });

  test('throws for non-array', () => {
    expect(() => validateMembers(null)).toThrow(ValidationError);
  });

  test('throws for too many members', () => {
    const tooMany = Array(MAX_CHANNEL_MEMBERS + 1).fill('el-user01');
    expect(() => validateMembers(tooMany)).toThrow(ValidationError);
  });

  test('throws for invalid member ID with index', () => {
    try {
      validateMembers(['el-user01', 'invalid']);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.details.field).toBe('members[1]');
    }
  });
});

// ============================================================================
// Permissions Validation Tests
// ============================================================================

describe('isValidChannelPermissions', () => {
  test('accepts valid permissions', () => {
    const permissions: ChannelPermissions = {
      visibility: VisibilityValue.PRIVATE,
      joinPolicy: JoinPolicyValue.INVITE_ONLY,
      modifyMembers: ['el-user01' as EntityId],
    };
    expect(isValidChannelPermissions(permissions)).toBe(true);
  });

  test('rejects non-object', () => {
    expect(isValidChannelPermissions(null)).toBe(false);
    expect(isValidChannelPermissions('invalid')).toBe(false);
  });

  test('rejects invalid visibility', () => {
    expect(
      isValidChannelPermissions({
        visibility: 'invalid',
        joinPolicy: 'open',
        modifyMembers: [],
      })
    ).toBe(false);
  });

  test('rejects invalid joinPolicy', () => {
    expect(
      isValidChannelPermissions({
        visibility: 'public',
        joinPolicy: 'invalid',
        modifyMembers: [],
      })
    ).toBe(false);
  });
});

describe('validateChannelPermissions', () => {
  test('returns valid permissions', () => {
    const permissions = {
      visibility: 'public',
      joinPolicy: 'open',
      modifyMembers: ['el-user01'],
    };
    const result = validateChannelPermissions(permissions);
    expect(result.visibility).toBe('public');
    expect(result.joinPolicy).toBe('open');
    expect(result.modifyMembers).toEqual(['el-user01' as EntityId]);
  });

  test('throws for non-object', () => {
    expect(() => validateChannelPermissions(null)).toThrow(ValidationError);
  });
});

// ============================================================================
// isChannel Type Guard Tests
// ============================================================================

describe('isChannel', () => {
  test('accepts valid channel', () => {
    expect(isChannel(createTestChannel())).toBe(true);
  });

  test('accepts valid direct channel', () => {
    expect(isChannel(createTestDirectChannel())).toBe(true);
  });

  test('accepts channel with description', () => {
    expect(
      isChannel(
        createTestChannel({ description: 'A test channel description' })
      )
    ).toBe(true);
  });

  test('accepts channel with tags and metadata', () => {
    expect(
      isChannel(
        createTestChannel({
          tags: ['important'],
          metadata: { key: 'value' },
        })
      )
    ).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isChannel(null)).toBe(false);
    expect(isChannel(undefined)).toBe(false);
    expect(isChannel('string')).toBe(false);
    expect(isChannel(123)).toBe(false);
  });

  test('rejects channels with missing fields', () => {
    expect(isChannel({ ...createTestChannel(), id: undefined })).toBe(false);
    expect(isChannel({ ...createTestChannel(), type: undefined })).toBe(false);
    expect(isChannel({ ...createTestChannel(), name: undefined })).toBe(false);
    expect(isChannel({ ...createTestChannel(), channelType: undefined })).toBe(false);
    expect(isChannel({ ...createTestChannel(), members: undefined })).toBe(false);
    expect(isChannel({ ...createTestChannel(), permissions: undefined })).toBe(false);
  });

  test('rejects channels with wrong type', () => {
    expect(isChannel({ ...createTestChannel(), type: 'task' })).toBe(false);
    expect(isChannel({ ...createTestChannel(), type: 'message' })).toBe(false);
  });

  test('rejects channels with invalid name', () => {
    expect(isChannel({ ...createTestChannel(), name: '' })).toBe(false);
    expect(isChannel({ ...createTestChannel(), name: 'invalid name' })).toBe(false);
  });

  test('rejects channels with invalid channelType', () => {
    expect(isChannel({ ...createTestChannel(), channelType: 'invalid' })).toBe(false);
  });

  test('rejects channels with invalid members', () => {
    expect(isChannel({ ...createTestChannel(), members: ['invalid'] })).toBe(false);
  });

  test('rejects channels with invalid permissions', () => {
    expect(
      isChannel({
        ...createTestChannel(),
        permissions: { visibility: 'invalid', joinPolicy: 'open', modifyMembers: [] },
      })
    ).toBe(false);
  });
});

describe('isDirectChannel', () => {
  test('returns true for direct channel', () => {
    expect(isDirectChannel(createTestDirectChannel())).toBe(true);
  });

  test('returns false for group channel', () => {
    expect(isDirectChannel(createTestChannel())).toBe(false);
  });
});

describe('isGroupChannel', () => {
  test('returns true for group channel', () => {
    expect(isGroupChannel(createTestChannel())).toBe(true);
  });

  test('returns false for direct channel', () => {
    expect(isGroupChannel(createTestDirectChannel())).toBe(false);
  });
});

// ============================================================================
// validateChannel Tests
// ============================================================================

describe('validateChannel', () => {
  test('returns valid channel', () => {
    const channel = createTestChannel();
    expect(validateChannel(channel)).toEqual(channel);
  });

  test('throws for non-object', () => {
    expect(() => validateChannel(null)).toThrow(ValidationError);
    expect(() => validateChannel('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateChannel({ ...createTestChannel(), id: '' })).toThrow(
      ValidationError
    );
    expect(() => validateChannel({ ...createTestChannel(), createdBy: '' })).toThrow(
      ValidationError
    );
  });

  test('throws for wrong type value', () => {
    try {
      validateChannel({ ...createTestChannel(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('channel');
    }
  });
});

// ============================================================================
// Direct Channel Naming Tests
// ============================================================================

describe('generateDirectChannelName', () => {
  test('generates deterministic name with sorted IDs', () => {
    expect(
      generateDirectChannelName('el-user02' as EntityId, 'el-user01' as EntityId)
    ).toBe('el-user01:el-user02');
    expect(
      generateDirectChannelName('el-user01' as EntityId, 'el-user02' as EntityId)
    ).toBe('el-user01:el-user02');
  });

  test('produces same result regardless of order', () => {
    const name1 = generateDirectChannelName('el-abc123' as EntityId, 'el-xyz789' as EntityId);
    const name2 = generateDirectChannelName('el-xyz789' as EntityId, 'el-abc123' as EntityId);
    expect(name1).toBe(name2);
  });
});

describe('parseDirectChannelName', () => {
  test('parses valid direct channel name', () => {
    const result = parseDirectChannelName('el-user01:el-user02');
    expect(result).toEqual(['el-user01' as EntityId, 'el-user02' as EntityId]);
  });

  test('returns null for invalid format', () => {
    expect(parseDirectChannelName('invalid')).toBe(null);
    expect(parseDirectChannelName('el-user01')).toBe(null);
    expect(parseDirectChannelName('a:b:c')).toBe(null);
  });

  test('returns null for invalid entity IDs', () => {
    expect(parseDirectChannelName('invalid:el-user01')).toBe(null);
    expect(parseDirectChannelName('el-user01:invalid')).toBe(null);
  });
});

// ============================================================================
// createGroupChannel Factory Tests
// ============================================================================

describe('createGroupChannel', () => {
  const validInput: CreateGroupChannelInput = {
    name: 'test-channel',
    createdBy: 'el-user01' as EntityId,
    members: ['el-user02' as EntityId],
  };

  test('creates group channel with required fields', async () => {
    const channel = await createGroupChannel(validInput);

    expect(channel.type).toBe(ElementType.CHANNEL);
    expect(channel.channelType).toBe(ChannelTypeValue.GROUP);
    expect(channel.name).toBe('test-channel');
    expect(channel.createdBy).toBe('el-user01' as EntityId);
    expect(channel.members).toContain('el-user01' as EntityId);
    expect(channel.members).toContain('el-user02' as EntityId);
    expect(channel.permissions.visibility).toBe(VisibilityValue.PRIVATE);
    expect(channel.permissions.joinPolicy).toBe(JoinPolicyValue.INVITE_ONLY);
    expect(channel.permissions.modifyMembers).toContain('el-user01' as EntityId);
    expect(channel.id).toMatch(/^el-[0-9a-z]{3,8}$/);
  });

  test('automatically includes creator in members', async () => {
    const channel = await createGroupChannel({
      name: 'test-channel',
      createdBy: 'el-user01' as EntityId,
      members: ['el-user02' as EntityId],
    });

    expect(channel.members).toContain('el-user01' as EntityId);
  });

  test('does not duplicate creator in members', async () => {
    const channel = await createGroupChannel({
      name: 'test-channel',
      createdBy: 'el-user01' as EntityId,
      members: ['el-user01' as EntityId, 'el-user02' as EntityId],
    });

    expect(channel.members.filter((m) => m === 'el-user01')).toHaveLength(1);
  });

  test('automatically includes creator in modifyMembers', async () => {
    const channel = await createGroupChannel(validInput);

    expect(channel.permissions.modifyMembers).toContain('el-user01' as EntityId);
  });

  test('creates channel with custom visibility', async () => {
    const channel = await createGroupChannel({
      ...validInput,
      visibility: VisibilityValue.PUBLIC,
    });

    expect(channel.permissions.visibility).toBe(VisibilityValue.PUBLIC);
  });

  test('creates channel with custom joinPolicy', async () => {
    const channel = await createGroupChannel({
      ...validInput,
      joinPolicy: JoinPolicyValue.OPEN,
    });

    expect(channel.permissions.joinPolicy).toBe(JoinPolicyValue.OPEN);
  });

  test('creates channel with description', async () => {
    const channel = await createGroupChannel({
      ...validInput,
      description: 'A group channel description',
    });

    expect(channel.description).toBe('A group channel description');
  });

  test('creates channel with tags and metadata', async () => {
    const channel = await createGroupChannel({
      ...validInput,
      tags: ['important'],
      metadata: { key: 'value' },
    });

    expect(channel.tags).toEqual(['important']);
    expect(channel.metadata).toEqual({ key: 'value' });
  });

  test('validates minimum members for group', async () => {
    await expect(
      createGroupChannel({
        name: 'test-channel',
        createdBy: 'el-user01' as EntityId,
        members: [], // Only creator will be added, which is < 2
      })
    ).rejects.toThrow(ValidationError);
  });

  test('validates channel name', async () => {
    await expect(
      createGroupChannel({ ...validInput, name: '' })
    ).rejects.toThrow(ValidationError);
  });

  test('validates createdBy', async () => {
    await expect(
      createGroupChannel({ ...validInput, createdBy: 'invalid' as EntityId })
    ).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs', async () => {
    const channel1 = await createGroupChannel(validInput);
    await new Promise((resolve) => setTimeout(resolve, 1));
    const channel2 = await createGroupChannel(validInput);

    expect(channel1.id).not.toBe(channel2.id);
  });
});

// ============================================================================
// createDirectChannel Factory Tests
// ============================================================================

describe('createDirectChannel', () => {
  const validInput: CreateDirectChannelInput = {
    entityA: 'el-user01' as EntityId,
    entityB: 'el-user02' as EntityId,
    createdBy: 'el-user01' as EntityId,
  };

  test('creates direct channel with required fields', async () => {
    const channel = await createDirectChannel(validInput);

    expect(channel.type).toBe(ElementType.CHANNEL);
    expect(channel.channelType).toBe(ChannelTypeValue.DIRECT);
    expect(channel.name).toBe('el-user01:el-user02');
    expect(channel.members).toHaveLength(2);
    expect(channel.members).toContain('el-user01' as EntityId);
    expect(channel.members).toContain('el-user02' as EntityId);
    expect(channel.permissions.visibility).toBe(VisibilityValue.PRIVATE);
    expect(channel.permissions.joinPolicy).toBe(JoinPolicyValue.INVITE_ONLY);
    expect(channel.permissions.modifyMembers).toHaveLength(0);
  });

  test('generates deterministic name', async () => {
    const channel1 = await createDirectChannel({
      entityA: 'el-user01' as EntityId,
      entityB: 'el-user02' as EntityId,
      createdBy: 'el-user01' as EntityId,
    });

    const channel2 = await createDirectChannel({
      entityA: 'el-user02' as EntityId,
      entityB: 'el-user01' as EntityId,
      createdBy: 'el-user02' as EntityId,
    });

    expect(channel1.name).toBe(channel2.name);
  });

  test('rejects same entity for both sides', async () => {
    await expect(
      createDirectChannel({
        entityA: 'el-user01' as EntityId,
        entityB: 'el-user01' as EntityId,
        createdBy: 'el-user01' as EntityId,
      })
    ).rejects.toThrow(ValidationError);
  });

  test('rejects creator not being one of the entities', async () => {
    await expect(
      createDirectChannel({
        entityA: 'el-user01' as EntityId,
        entityB: 'el-user02' as EntityId,
        createdBy: 'el-user03' as EntityId,
      })
    ).rejects.toThrow(ValidationError);
  });

  test('creates channel with description', async () => {
    const channel = await createDirectChannel({
      ...validInput,
      description: 'A direct channel description',
    });

    expect(channel.description).toBe('A direct channel description');
  });

  test('creates channel with tags and metadata', async () => {
    const channel = await createDirectChannel({
      ...validInput,
      tags: ['dm'],
      metadata: { priority: 'high' },
    });

    expect(channel.tags).toEqual(['dm']);
    expect(channel.metadata).toEqual({ priority: 'high' });
  });

  test('validates entityA', async () => {
    await expect(
      createDirectChannel({ ...validInput, entityA: 'invalid' as EntityId })
    ).rejects.toThrow(ValidationError);
  });

  test('validates entityB', async () => {
    await expect(
      createDirectChannel({ ...validInput, entityB: 'invalid' as EntityId })
    ).rejects.toThrow(ValidationError);
  });
});

// ============================================================================
// Error Class Tests
// ============================================================================

describe('DirectChannelMembershipError', () => {
  test('creates error for add operation', () => {
    const error = new DirectChannelMembershipError('el-chan01', 'add');

    expect(error).toBeInstanceOf(ConstraintError);
    expect(error.code).toBe(ErrorCode.IMMUTABLE);
    expect(error.message).toContain('add');
    expect(error.message).toContain('immutable');
    expect(error.details.operation).toBe('add');
  });

  test('creates error for remove operation', () => {
    const error = new DirectChannelMembershipError('el-chan01', 'remove');

    expect(error.message).toContain('remove');
    expect(error.details.operation).toBe('remove');
  });
});

describe('NotAMemberError', () => {
  test('creates error with channel and entity info', () => {
    const error = new NotAMemberError('el-chan01', 'el-user01');

    expect(error).toBeInstanceOf(ConstraintError);
    expect(error.code).toBe(ErrorCode.MEMBER_REQUIRED);
    expect(error.details.channel).toBe('el-chan01');
    expect(error.details.entity).toBe('el-user01');
  });
});

describe('CannotModifyMembersError', () => {
  test('creates error with channel and actor info', () => {
    const error = new CannotModifyMembersError('el-chan01', 'el-user01');

    expect(error).toBeInstanceOf(ConstraintError);
    expect(error.code).toBe(ErrorCode.MEMBER_REQUIRED);
    expect(error.details.channel).toBe('el-chan01');
    expect(error.details.actor).toBe('el-user01');
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isMember', () => {
  test('returns true for channel member', () => {
    const channel = createTestChannel();
    expect(isMember(channel, 'el-user01' as EntityId)).toBe(true);
    expect(isMember(channel, 'el-user02' as EntityId)).toBe(true);
  });

  test('returns false for non-member', () => {
    const channel = createTestChannel();
    expect(isMember(channel, 'el-user03' as EntityId)).toBe(false);
  });
});

describe('canModifyMembers', () => {
  test('returns true for modifier', () => {
    const channel = createTestChannel();
    expect(canModifyMembers(channel, 'el-user01' as EntityId)).toBe(true);
  });

  test('returns false for non-modifier', () => {
    const channel = createTestChannel();
    expect(canModifyMembers(channel, 'el-user02' as EntityId)).toBe(false);
  });

  test('returns false for direct channel', () => {
    const channel = createTestDirectChannel();
    expect(canModifyMembers(channel, 'el-user01' as EntityId)).toBe(false);
  });
});

describe('canJoin', () => {
  test('returns false for existing member', () => {
    const channel = createTestChannel();
    expect(canJoin(channel, 'el-user01' as EntityId)).toBe(false);
  });

  test('returns false for direct channel', () => {
    const channel = createTestDirectChannel();
    expect(canJoin(channel, 'el-user03' as EntityId)).toBe(false);
  });

  test('returns true for open public channel', () => {
    const channel = createTestChannel({
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: ['el-user01' as EntityId],
      },
    });
    expect(canJoin(channel, 'el-user03' as EntityId)).toBe(true);
  });

  test('returns false for open private channel', () => {
    const channel = createTestChannel({
      permissions: {
        visibility: VisibilityValue.PRIVATE,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: ['el-user01' as EntityId],
      },
    });
    expect(canJoin(channel, 'el-user03' as EntityId)).toBe(false);
  });

  test('returns true for request channel', () => {
    const channel = createTestChannel({
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.REQUEST,
        modifyMembers: ['el-user01' as EntityId],
      },
    });
    expect(canJoin(channel, 'el-user03' as EntityId)).toBe(true);
  });

  test('returns false for invite-only channel', () => {
    const channel = createTestChannel();
    expect(canJoin(channel, 'el-user03' as EntityId)).toBe(false);
  });
});

describe('isPublicChannel', () => {
  test('returns true for public channel', () => {
    const channel = createTestChannel({
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    });
    expect(isPublicChannel(channel)).toBe(true);
  });

  test('returns false for private channel', () => {
    expect(isPublicChannel(createTestChannel())).toBe(false);
  });
});

describe('isPrivateChannel', () => {
  test('returns true for private channel', () => {
    expect(isPrivateChannel(createTestChannel())).toBe(true);
  });

  test('returns false for public channel', () => {
    const channel = createTestChannel({
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    });
    expect(isPrivateChannel(channel)).toBe(false);
  });
});

describe('getMemberCount', () => {
  test('returns correct member count', () => {
    expect(getMemberCount(createTestChannel())).toBe(2);
    expect(
      getMemberCount(
        createTestChannel({
          members: ['el-user01' as EntityId, 'el-user02' as EntityId, 'el-user03' as EntityId],
        })
      )
    ).toBe(3);
  });
});

describe('hasDescription', () => {
  test('returns true when has description', () => {
    const channel = createTestChannel({
      description: 'A test description',
    });
    expect(hasDescription(channel)).toBe(true);
  });

  test('returns false when no description', () => {
    expect(hasDescription(createTestChannel())).toBe(false);
  });
});

// ============================================================================
// Filter Function Tests
// ============================================================================

describe('filterByChannelType', () => {
  const channels: Channel[] = [
    createTestChannel({ id: 'el-chan01' as ChannelId }),
    createTestDirectChannel({ id: 'el-chan02' as ChannelId }),
    createTestChannel({ id: 'el-chan03' as ChannelId }),
  ];

  test('filters by channel type', () => {
    const groups = filterByChannelType(channels, ChannelTypeValue.GROUP);
    expect(groups).toHaveLength(2);
    expect(groups.map((c) => c.id)).toEqual(['el-chan01' as ChannelId, 'el-chan03' as ChannelId]);
  });
});

describe('filterDirectChannels', () => {
  const channels: Channel[] = [
    createTestChannel({ id: 'el-chan01' as ChannelId }),
    createTestDirectChannel({ id: 'el-chan02' as ChannelId }),
  ];

  test('filters direct channels', () => {
    const direct = filterDirectChannels(channels);
    expect(direct).toHaveLength(1);
    expect(direct[0].id).toBe('el-chan02' as ChannelId);
  });
});

describe('filterGroupChannels', () => {
  const channels: Channel[] = [
    createTestChannel({ id: 'el-chan01' as ChannelId }),
    createTestDirectChannel({ id: 'el-chan02' as ChannelId }),
  ];

  test('filters group channels', () => {
    const groups = filterGroupChannels(channels);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('el-chan01' as ChannelId);
  });
});

describe('filterByMember', () => {
  const channels: Channel[] = [
    createTestChannel({
      id: 'el-chan01' as ChannelId,
      members: ['el-user01' as EntityId, 'el-user02' as EntityId],
    }),
    createTestChannel({
      id: 'el-chan02' as ChannelId,
      members: ['el-user02' as EntityId, 'el-user03' as EntityId],
    }),
    createTestChannel({
      id: 'el-chan03' as ChannelId,
      members: ['el-user01' as EntityId],
    }),
  ];

  test('filters channels by member', () => {
    const result = filterByMember(channels, 'el-user01' as EntityId);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['el-chan01' as ChannelId, 'el-chan03' as ChannelId]);
  });

  test('returns empty for non-member', () => {
    expect(filterByMember(channels, 'el-user99' as EntityId)).toEqual([]);
  });
});

describe('filterByVisibility', () => {
  const channels: Channel[] = [
    createTestChannel({
      id: 'el-chan01' as ChannelId,
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    }),
    createTestChannel({ id: 'el-chan02' as ChannelId }),
    createTestChannel({
      id: 'el-chan03' as ChannelId,
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    }),
  ];

  test('filters by visibility', () => {
    const publicChannels = filterByVisibility(channels, VisibilityValue.PUBLIC);
    expect(publicChannels).toHaveLength(2);
    expect(publicChannels.map((c) => c.id)).toEqual(['el-chan01' as ChannelId, 'el-chan03' as ChannelId]);
  });
});

describe('filterPublicChannels', () => {
  const channels: Channel[] = [
    createTestChannel({
      id: 'el-chan01' as ChannelId,
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    }),
    createTestChannel({ id: 'el-chan02' as ChannelId }),
  ];

  test('filters public channels', () => {
    const result = filterPublicChannels(channels);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('el-chan01' as ChannelId);
  });
});

describe('filterPrivateChannels', () => {
  const channels: Channel[] = [
    createTestChannel({
      id: 'el-chan01' as ChannelId,
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    }),
    createTestChannel({ id: 'el-chan02' as ChannelId }),
  ];

  test('filters private channels', () => {
    const result = filterPrivateChannels(channels);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('el-chan02' as ChannelId);
  });
});

// ============================================================================
// Sort Function Tests
// ============================================================================

describe('sortByName', () => {
  const channels: Channel[] = [
    createTestChannel({ id: 'el-chan01' as ChannelId, name: 'zeta' }),
    createTestChannel({ id: 'el-chan02' as ChannelId, name: 'alpha' }),
    createTestChannel({ id: 'el-chan03' as ChannelId, name: 'beta' }),
  ];

  test('sorts by name alphabetically', () => {
    const sorted = sortByName(channels);
    expect(sorted.map((c) => c.name)).toEqual(['alpha', 'beta', 'zeta']);
  });

  test('does not modify original array', () => {
    const original = [...channels];
    sortByName(channels);
    expect(channels).toEqual(original);
  });
});

describe('sortByMemberCount', () => {
  const channels: Channel[] = [
    createTestChannel({
      id: 'el-chan01' as ChannelId,
      members: ['el-user01' as EntityId, 'el-user02' as EntityId],
    }),
    createTestChannel({
      id: 'el-chan02' as ChannelId,
      members: [
        'el-user01' as EntityId,
        'el-user02' as EntityId,
        'el-user03' as EntityId,
        'el-user04' as EntityId,
      ],
    }),
    createTestChannel({
      id: 'el-chan03' as ChannelId,
      members: ['el-user01' as EntityId, 'el-user02' as EntityId, 'el-user03' as EntityId],
    }),
  ];

  test('sorts by member count descending', () => {
    const sorted = sortByMemberCount(channels);
    expect(sorted.map((c) => c.id)).toEqual(['el-chan02' as ChannelId, 'el-chan03' as ChannelId, 'el-chan01' as ChannelId]);
  });
});

describe('sortByCreatedAtDesc', () => {
  const channels: Channel[] = [
    createTestChannel({
      id: 'el-chan01' as ChannelId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestChannel({
      id: 'el-chan02' as ChannelId,
      createdAt: '2025-01-22T14:00:00.000Z' as Timestamp,
    }),
    createTestChannel({
      id: 'el-chan03' as ChannelId,
      createdAt: '2025-01-22T12:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts by creation time descending', () => {
    const sorted = sortByCreatedAtDesc(channels);
    expect(sorted.map((c) => c.id)).toEqual(['el-chan02' as ChannelId, 'el-chan03' as ChannelId, 'el-chan01' as ChannelId]);
  });
});

// ============================================================================
// Grouping Function Tests
// ============================================================================

describe('groupByVisibility', () => {
  const channels: Channel[] = [
    createTestChannel({
      id: 'el-chan01' as ChannelId,
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    }),
    createTestChannel({ id: 'el-chan02' as ChannelId }),
    createTestChannel({
      id: 'el-chan03' as ChannelId,
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    }),
  ];

  test('groups by visibility', () => {
    const groups = groupByVisibility(channels);

    expect(groups.size).toBe(2);
    expect(groups.get(VisibilityValue.PUBLIC)?.map((c) => c.id)).toEqual([
      'el-chan01' as ChannelId,
      'el-chan03' as ChannelId,
    ]);
    expect(groups.get(VisibilityValue.PRIVATE)?.map((c) => c.id)).toEqual(['el-chan02' as ChannelId]);
  });

  test('handles empty input', () => {
    const groups = groupByVisibility([]);
    expect(groups.size).toBe(0);
  });
});

describe('groupByChannelType', () => {
  const channels: Channel[] = [
    createTestChannel({ id: 'el-chan01' as ChannelId }),
    createTestDirectChannel({ id: 'el-chan02' as ChannelId }),
    createTestChannel({ id: 'el-chan03' as ChannelId }),
  ];

  test('groups by channel type', () => {
    const groups = groupByChannelType(channels);

    expect(groups.size).toBe(2);
    expect(groups.get(ChannelTypeValue.GROUP)?.map((c) => c.id)).toEqual([
      'el-chan01' as ChannelId,
      'el-chan03' as ChannelId,
    ]);
    expect(groups.get(ChannelTypeValue.DIRECT)?.map((c) => c.id)).toEqual(['el-chan02' as ChannelId]);
  });
});

// ============================================================================
// Direct Channel Lookup Tests
// ============================================================================

describe('findDirectChannel', () => {
  const channels: Channel[] = [
    createTestChannel({ id: 'el-chan01' as ChannelId }),
    createTestDirectChannel({
      id: 'el-chan02' as ChannelId,
      name: 'el-user01:el-user02',
    }),
    createTestDirectChannel({
      id: 'el-chan03' as ChannelId,
      name: 'el-user01:el-user03',
    }),
  ];

  test('finds direct channel between two entities', () => {
    const result = findDirectChannel(
      channels,
      'el-user01' as EntityId,
      'el-user02' as EntityId
    );
    expect(result?.id).toBe('el-chan02' as ChannelId);
  });

  test('finds channel regardless of entity order', () => {
    const result = findDirectChannel(
      channels,
      'el-user02' as EntityId,
      'el-user01' as EntityId
    );
    expect(result?.id).toBe('el-chan02' as ChannelId);
  });

  test('returns undefined for non-existent direct channel', () => {
    const result = findDirectChannel(
      channels,
      'el-user02' as EntityId,
      'el-user03' as EntityId
    );
    expect(result).toBeUndefined();
  });
});

describe('getDirectChannelsForEntity', () => {
  const channels: Channel[] = [
    createTestChannel({ id: 'el-chan01' as ChannelId }),
    createTestDirectChannel({
      id: 'el-chan02' as ChannelId,
      name: 'el-user01:el-user02',
      members: ['el-user01' as EntityId, 'el-user02' as EntityId],
    }),
    createTestDirectChannel({
      id: 'el-chan03' as ChannelId,
      name: 'el-user01:el-user03',
      members: ['el-user01' as EntityId, 'el-user03' as EntityId],
    }),
    createTestDirectChannel({
      id: 'el-chan04' as ChannelId,
      name: 'el-user02:el-user03',
      members: ['el-user02' as EntityId, 'el-user03' as EntityId],
    }),
  ];

  test('gets all direct channels for an entity', () => {
    const result = getDirectChannelsForEntity(channels, 'el-user01' as EntityId);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['el-chan02' as ChannelId, 'el-chan03' as ChannelId]);
  });

  test('returns empty for entity with no direct channels', () => {
    const result = getDirectChannelsForEntity(channels, 'el-user99' as EntityId);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Direct Channel Constraints Tests
// ============================================================================

describe('validateDirectChannelConstraints', () => {
  test('returns true for valid direct channel', () => {
    expect(validateDirectChannelConstraints(createTestDirectChannel())).toBe(true);
  });

  test('returns true for group channel (skip validation)', () => {
    expect(validateDirectChannelConstraints(createTestChannel())).toBe(true);
  });

  test('returns false for direct channel with wrong member count', () => {
    const channel = createTestDirectChannel({
      members: ['el-user01' as EntityId],
    });
    expect(validateDirectChannelConstraints(channel)).toBe(false);
  });

  test('returns false for direct channel with public visibility', () => {
    const channel = createTestDirectChannel({
      permissions: {
        visibility: VisibilityValue.PUBLIC,
        joinPolicy: JoinPolicyValue.INVITE_ONLY,
        modifyMembers: [],
      },
    });
    expect(validateDirectChannelConstraints(channel)).toBe(false);
  });

  test('returns false for direct channel with open join policy', () => {
    const channel = createTestDirectChannel({
      permissions: {
        visibility: VisibilityValue.PRIVATE,
        joinPolicy: JoinPolicyValue.OPEN,
        modifyMembers: [],
      },
    });
    expect(validateDirectChannelConstraints(channel)).toBe(false);
  });

  test('returns false for direct channel with modifyMembers', () => {
    const channel = createTestDirectChannel({
      permissions: {
        visibility: VisibilityValue.PRIVATE,
        joinPolicy: JoinPolicyValue.INVITE_ONLY,
        modifyMembers: ['el-user01' as EntityId],
      },
    });
    expect(validateDirectChannelConstraints(channel)).toBe(false);
  });
});

// ============================================================================
// HydratedChannel Tests
// ============================================================================

describe('HydratedChannel', () => {
  test('is an alias for Channel', () => {
    const channel: HydratedChannel = createTestChannel({ description: 'A test channel' });

    expect(channel.description).toBe('A test channel');
    expect(isChannel(channel)).toBe(true);
  });

  test('description defaults to null', () => {
    const channel: HydratedChannel = createTestChannel();

    expect(channel.description).toBe(null);
  });
});

// ============================================================================
// Edge Cases and Property-Based Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles channel name at max length', async () => {
    const maxName = 'a'.repeat(MAX_CHANNEL_NAME_LENGTH);
    const channel = await createGroupChannel({
      name: maxName,
      createdBy: 'el-user01' as EntityId,
      members: ['el-user02' as EntityId],
    });

    expect(channel.name).toBe(maxName);
  });

  test('handles unicode in metadata', async () => {
    const channel = await createGroupChannel({
      name: 'test-channel',
      createdBy: 'el-user01' as EntityId,
      members: ['el-user02' as EntityId],
      metadata: { greeting: '你好世界' },
    });

    expect(channel.metadata).toEqual({ greeting: '你好世界' });
  });

  test('created group channel is valid according to type guard', async () => {
    const channel = await createGroupChannel({
      name: 'test-channel',
      createdBy: 'el-user01' as EntityId,
      members: ['el-user02' as EntityId, 'el-user03' as EntityId],
      description: 'A channel description',
      visibility: VisibilityValue.PUBLIC,
      joinPolicy: JoinPolicyValue.OPEN,
      tags: ['important'],
      metadata: { key: 'value' },
    });

    expect(isChannel(channel)).toBe(true);
    expect(isGroupChannel(channel)).toBe(true);
  });

  test('created direct channel is valid according to type guard', async () => {
    const channel = await createDirectChannel({
      entityA: 'el-user01' as EntityId,
      entityB: 'el-user02' as EntityId,
      createdBy: 'el-user01' as EntityId,
      tags: ['dm'],
      metadata: { priority: 'high' },
    });

    expect(isChannel(channel)).toBe(true);
    expect(isDirectChannel(channel)).toBe(true);
    expect(validateDirectChannelConstraints(channel)).toBe(true);
  });
});

describe('Property-based tests', () => {
  test('all created group channels have creator in members', async () => {
    const inputs: CreateGroupChannelInput[] = [
      {
        name: 'channel-1',
        createdBy: 'el-user01' as EntityId,
        members: ['el-user02' as EntityId],
      },
      {
        name: 'channel-2',
        createdBy: 'el-user01' as EntityId,
        members: ['el-user01' as EntityId, 'el-user02' as EntityId],
      },
      {
        name: 'channel-3',
        createdBy: 'el-user01' as EntityId,
        members: [],
        // Note: This will fail because < 2 members, but we're testing the pattern
      },
    ];

    for (const input of inputs.slice(0, 2)) {
      const channel = await createGroupChannel(input);
      expect(channel.members).toContain(input.createdBy);
      expect(isChannel(channel)).toBe(true);
    }
  });

  test('all direct channels have exactly 2 members', async () => {
    const inputs: CreateDirectChannelInput[] = [
      {
        entityA: 'el-user01' as EntityId,
        entityB: 'el-user02' as EntityId,
        createdBy: 'el-user01' as EntityId,
      },
      {
        entityA: 'el-abc123' as EntityId,
        entityB: 'el-xyz789' as EntityId,
        createdBy: 'el-abc123' as EntityId,
      },
    ];

    for (const input of inputs) {
      const channel = await createDirectChannel(input);
      expect(channel.members).toHaveLength(DIRECT_CHANNEL_MEMBERS);
      expect(validateDirectChannelConstraints(channel)).toBe(true);
    }
  });

  test('direct channel names are always sorted', async () => {
    const pairs = [
      ['el-user02', 'el-user01'],
      ['el-xyz789', 'el-abc123'],
      ['el-charlie', 'el-alpha'],
    ];

    for (const [a, b] of pairs) {
      const channel = await createDirectChannel({
        entityA: a as EntityId,
        entityB: b as EntityId,
        createdBy: a as EntityId,
      });

      const [first, second] = channel.name.split(':');
      expect(first < second).toBe(true);
    }
  });
});
