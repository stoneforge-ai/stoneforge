import { describe, expect, test } from 'bun:test';
import {
  Team,
  HydratedTeam,
  TeamId,
  MIN_TEAM_NAME_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  MAX_TEAM_MEMBERS,
  isValidTeamName,
  validateTeamName,
  isValidTeamId,
  validateTeamId,
  isValidMembers,
  validateMembers,
  isTeam,
  validateTeam,
  createTeam,
  CreateTeamInput,
  updateTeam,
  MembershipError,
  addMember,
  removeMember,
  isMember,
  getMemberCount,
  hasDescription,
  getTeamDisplayName,
  filterByCreator,
  filterWithDescription,
  filterWithoutDescription,
  filterByMember,
  filterWithMembers,
  filterEmpty,
  sortByName,
  sortByMemberCount,
  sortByCreationDate,
  sortByUpdateDate,
  groupByCreator,
  searchByName,
  findByName,
  findById,
  isNameUnique,
  getTeamsForEntity,
  getAllMembers,
  haveCommonMembers,
  getCommonMembers,
} from './team.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { DocumentId } from './document.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid team for testing
function createTestTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.TEAM,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    name: 'Test Team',
    members: [],
    ...overrides,
  };
}

// ============================================================================
// Validation Constants Tests
// ============================================================================

describe('Validation Constants', () => {
  test('MIN_TEAM_NAME_LENGTH is 1', () => {
    expect(MIN_TEAM_NAME_LENGTH).toBe(1);
  });

  test('MAX_TEAM_NAME_LENGTH is 100', () => {
    expect(MAX_TEAM_NAME_LENGTH).toBe(100);
  });

  test('MAX_TEAM_MEMBERS is 1000', () => {
    expect(MAX_TEAM_MEMBERS).toBe(1000);
  });
});

// ============================================================================
// isValidTeamName Tests
// ============================================================================

describe('isValidTeamName', () => {
  test('accepts valid names', () => {
    expect(isValidTeamName('A')).toBe(true); // Min length
    expect(isValidTeamName('Valid Team Name')).toBe(true);
    expect(isValidTeamName('a'.repeat(MAX_TEAM_NAME_LENGTH))).toBe(true); // Max length
  });

  test('accepts name with leading/trailing spaces (trims them)', () => {
    expect(isValidTeamName('  trimmed  ')).toBe(true);
  });

  test('rejects invalid names', () => {
    expect(isValidTeamName('')).toBe(false);
    expect(isValidTeamName('   ')).toBe(false); // Only whitespace
    expect(isValidTeamName('a'.repeat(MAX_TEAM_NAME_LENGTH + 1))).toBe(false); // Too long
    expect(isValidTeamName(null)).toBe(false);
    expect(isValidTeamName(undefined)).toBe(false);
    expect(isValidTeamName(123)).toBe(false);
  });
});

describe('validateTeamName', () => {
  test('returns trimmed valid name', () => {
    expect(validateTeamName('Valid name')).toBe('Valid name');
    expect(validateTeamName('  trimmed  ')).toBe('trimmed');
  });

  test('throws for non-string', () => {
    expect(() => validateTeamName(123)).toThrow(ValidationError);
    try {
      validateTeamName(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('name');
    }
  });

  test('throws for empty name', () => {
    expect(() => validateTeamName('')).toThrow(ValidationError);
    try {
      validateTeamName('');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });

  test('throws for name exceeding max length', () => {
    const longName = 'a'.repeat(MAX_TEAM_NAME_LENGTH + 1);
    expect(() => validateTeamName(longName)).toThrow(ValidationError);
    try {
      validateTeamName(longName);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });
});

// ============================================================================
// isValidTeamId / validateTeamId Tests
// ============================================================================

describe('isValidTeamId', () => {
  test('accepts valid team IDs', () => {
    expect(isValidTeamId('el-abc')).toBe(true);
    expect(isValidTeamId('el-abc123')).toBe(true);
    expect(isValidTeamId('el-12345678')).toBe(true);
  });

  test('rejects invalid team IDs', () => {
    expect(isValidTeamId('')).toBe(false);
    expect(isValidTeamId('abc123')).toBe(false); // Missing el- prefix
    expect(isValidTeamId('el-')).toBe(false); // Too short
    expect(isValidTeamId('el-ab')).toBe(false); // Too short (need 3 chars min)
    expect(isValidTeamId('el-123456789')).toBe(false); // Too long (max 8 chars)
    expect(isValidTeamId('el-ABC')).toBe(false); // Uppercase not allowed
    expect(isValidTeamId(null)).toBe(false);
    expect(isValidTeamId(undefined)).toBe(false);
    expect(isValidTeamId(123)).toBe(false);
  });
});

describe('validateTeamId', () => {
  test('returns valid team ID', () => {
    const id = 'el-abc123';
    expect(validateTeamId(id)).toBe(id as TeamId);
  });

  test('throws for non-string', () => {
    expect(() => validateTeamId(123)).toThrow(ValidationError);
    try {
      validateTeamId(null);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('teamId');
    }
  });

  test('throws for invalid format', () => {
    expect(() => validateTeamId('invalid')).toThrow(ValidationError);
    try {
      validateTeamId('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });
});

// ============================================================================
// isValidMembers / validateMembers Tests
// ============================================================================

describe('isValidMembers', () => {
  test('accepts valid members array', () => {
    expect(isValidMembers([])).toBe(true);
    expect(isValidMembers(['el-user1' as EntityId])).toBe(true);
    expect(isValidMembers(['el-user1' as EntityId, 'el-user2' as EntityId])).toBe(true);
  });

  test('rejects invalid members', () => {
    expect(isValidMembers(null)).toBe(false);
    expect(isValidMembers('not-array')).toBe(false);
    expect(isValidMembers([123])).toBe(false); // Non-string
    expect(isValidMembers([''])).toBe(false); // Empty string
    expect(isValidMembers(['el-user1', 'el-user1'])).toBe(false); // Duplicates
  });
});

describe('validateMembers', () => {
  test('returns valid members array', () => {
    const members = ['el-user1' as EntityId, 'el-user2' as EntityId];
    expect(validateMembers(members)).toEqual(members);
  });

  test('throws for non-array', () => {
    expect(() => validateMembers('not-array')).toThrow(ValidationError);
  });

  test('throws for invalid member in array', () => {
    expect(() => validateMembers([123])).toThrow(ValidationError);
    expect(() => validateMembers([''])).toThrow(ValidationError);
  });

  test('throws for duplicate members', () => {
    expect(() => validateMembers(['el-user1', 'el-user1'])).toThrow(ValidationError);
    try {
      validateMembers(['el-user1', 'el-user1']);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.details.duplicates).toBeDefined();
    }
  });
});

// ============================================================================
// isTeam Type Guard Tests
// ============================================================================

describe('isTeam', () => {
  test('accepts valid team', () => {
    expect(isTeam(createTestTeam())).toBe(true);
  });

  test('accepts team with members', () => {
    expect(
      isTeam(
        createTestTeam({
          members: ['el-user1' as EntityId, 'el-user2' as EntityId],
        })
      )
    ).toBe(true);
  });

  test('accepts team with optional fields', () => {
    expect(
      isTeam(
        createTestTeam({
          descriptionRef: 'el-doc123' as DocumentId,
        })
      )
    ).toBe(true);
  });

  test('accepts team with tags and metadata', () => {
    expect(
      isTeam(
        createTestTeam({
          tags: ['backend', 'agents'],
          metadata: { priority: 'high' },
        })
      )
    ).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isTeam(null)).toBe(false);
    expect(isTeam(undefined)).toBe(false);
    expect(isTeam('string')).toBe(false);
    expect(isTeam(123)).toBe(false);
  });

  test('rejects teams with missing required fields', () => {
    expect(isTeam({ ...createTestTeam(), id: undefined })).toBe(false);
    expect(isTeam({ ...createTestTeam(), type: undefined })).toBe(false);
    expect(isTeam({ ...createTestTeam(), name: undefined })).toBe(false);
    expect(isTeam({ ...createTestTeam(), members: undefined })).toBe(false);
    expect(isTeam({ ...createTestTeam(), createdBy: undefined })).toBe(false);
  });

  test('rejects teams with wrong type', () => {
    expect(isTeam({ ...createTestTeam(), type: 'task' })).toBe(false);
    expect(isTeam({ ...createTestTeam(), type: 'entity' })).toBe(false);
    expect(isTeam({ ...createTestTeam(), type: 'library' })).toBe(false);
  });

  test('rejects teams with invalid field values', () => {
    expect(isTeam({ ...createTestTeam(), name: '' })).toBe(false);
    expect(isTeam({ ...createTestTeam(), name: '   ' })).toBe(false); // Only whitespace
    expect(isTeam({ ...createTestTeam(), name: 'a'.repeat(101) })).toBe(false);
    expect(isTeam({ ...createTestTeam(), members: ['el-user1', 'el-user1'] })).toBe(false); // Duplicates
  });

  test('rejects teams with invalid optional field types', () => {
    expect(isTeam({ ...createTestTeam(), descriptionRef: 123 })).toBe(false);
  });

  test('rejects teams with invalid base fields', () => {
    expect(isTeam({ ...createTestTeam(), tags: 'not-array' })).toBe(false);
    expect(isTeam({ ...createTestTeam(), metadata: 'not-object' })).toBe(false);
    expect(isTeam({ ...createTestTeam(), metadata: null })).toBe(false);
  });
});

// ============================================================================
// validateTeam Tests
// ============================================================================

describe('validateTeam', () => {
  test('returns valid team', () => {
    const team = createTestTeam();
    expect(validateTeam(team)).toEqual(team);
  });

  test('throws for non-object', () => {
    expect(() => validateTeam(null)).toThrow(ValidationError);
    expect(() => validateTeam('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateTeam({ ...createTestTeam(), id: '' })).toThrow(ValidationError);
    expect(() => validateTeam({ ...createTestTeam(), createdBy: '' })).toThrow(ValidationError);
  });

  test('throws for wrong type value', () => {
    try {
      validateTeam({ ...createTestTeam(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('team');
    }
  });

  test('validates team-specific fields', () => {
    expect(() => validateTeam({ ...createTestTeam(), name: '' })).toThrow(ValidationError);
    expect(() => validateTeam({ ...createTestTeam(), name: 123 })).toThrow(ValidationError);
    expect(() => validateTeam({ ...createTestTeam(), members: 'not-array' })).toThrow(ValidationError);
  });

  test('validates optional field types', () => {
    expect(() =>
      validateTeam({
        ...createTestTeam(),
        descriptionRef: 123,
      })
    ).toThrow(ValidationError);
  });

  test('throws for missing createdAt', () => {
    expect(() =>
      validateTeam({
        ...createTestTeam(),
        createdAt: undefined,
      })
    ).toThrow(ValidationError);
  });

  test('throws for missing updatedAt', () => {
    expect(() =>
      validateTeam({
        ...createTestTeam(),
        updatedAt: undefined,
      })
    ).toThrow(ValidationError);
  });

  test('throws for non-array tags', () => {
    expect(() =>
      validateTeam({
        ...createTestTeam(),
        tags: 'not-array',
      })
    ).toThrow(ValidationError);
  });

  test('throws for non-object metadata', () => {
    expect(() =>
      validateTeam({
        ...createTestTeam(),
        metadata: 'not-object',
      })
    ).toThrow(ValidationError);

    expect(() =>
      validateTeam({
        ...createTestTeam(),
        metadata: null,
      })
    ).toThrow(ValidationError);

    expect(() =>
      validateTeam({
        ...createTestTeam(),
        metadata: [],
      })
    ).toThrow(ValidationError);
  });
});

// ============================================================================
// createTeam Factory Tests
// ============================================================================

describe('createTeam', () => {
  const validInput: CreateTeamInput = {
    name: 'Test Team',
    createdBy: 'el-system1' as EntityId,
  };

  test('creates team with required fields only', async () => {
    const team = await createTeam(validInput);

    expect(team.name).toBe('Test Team');
    expect(team.type).toBe(ElementType.TEAM);
    expect(team.createdBy).toBe('el-system1' as EntityId);
    expect(team.tags).toEqual([]);
    expect(team.metadata).toEqual({});
    expect(team.id).toMatch(/^el-[0-9a-z]{3,8}$/);
    expect(team.members).toEqual([]);
    expect(team.descriptionRef).toBeUndefined();
  });

  test('creates team with all optional fields', async () => {
    const team = await createTeam({
      ...validInput,
      descriptionRef: 'el-doc123' as DocumentId,
      members: ['el-user1' as EntityId, 'el-user2' as EntityId],
      tags: ['backend', 'agents'],
      metadata: { priority: 'high' },
    });

    expect(team.descriptionRef).toBe('el-doc123' as DocumentId);
    expect(team.members).toEqual(['el-user1' as EntityId, 'el-user2' as EntityId]);
    expect(team.tags).toEqual(['backend', 'agents']);
    expect(team.metadata).toEqual({ priority: 'high' });
  });

  test('trims name', async () => {
    const team = await createTeam({ ...validInput, name: '  trimmed name  ' });
    expect(team.name).toBe('trimmed name');
  });

  test('validates name', async () => {
    await expect(createTeam({ ...validInput, name: '' })).rejects.toThrow(ValidationError);
    await expect(
      createTeam({ ...validInput, name: 'a'.repeat(MAX_TEAM_NAME_LENGTH + 1) })
    ).rejects.toThrow(ValidationError);
  });

  test('validates members', async () => {
    await expect(
      createTeam({ ...validInput, members: ['el-user1', 'el-user1'] as EntityId[] })
    ).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs for different teams', async () => {
    const team1 = await createTeam(validInput);
    const team2 = await createTeam({ ...validInput, name: 'Different Name' });

    expect(team1.id).not.toBe(team2.id);
  });

  test('sets createdAt and updatedAt to current time', async () => {
    const before = new Date().toISOString();
    const team = await createTeam(validInput);
    const after = new Date().toISOString();

    expect(team.createdAt >= before).toBe(true);
    expect(team.createdAt <= after).toBe(true);
    expect(team.createdAt).toBe(team.updatedAt);
  });
});

// ============================================================================
// updateTeam Tests
// ============================================================================

describe('updateTeam', () => {
  test('updates name', () => {
    const team = createTestTeam({ name: 'Original Name' });
    const updated = updateTeam(team, { name: 'New Name' });

    expect(updated.name).toBe('New Name');
    expect(updated.updatedAt).not.toBe(team.updatedAt);
  });

  test('trims name on update', () => {
    const team = createTestTeam();
    const updated = updateTeam(team, { name: '  trimmed  ' });

    expect(updated.name).toBe('trimmed');
  });

  test('validates name on update', () => {
    const team = createTestTeam();
    expect(() => updateTeam(team, { name: '' })).toThrow(ValidationError);
    expect(() => updateTeam(team, { name: 'a'.repeat(101) })).toThrow(ValidationError);
  });

  test('adds description reference', () => {
    const team = createTestTeam();
    const updated = updateTeam(team, { descriptionRef: 'el-doc123' as DocumentId });

    expect(updated.descriptionRef).toBe('el-doc123' as DocumentId);
  });

  test('removes description reference with null', () => {
    const team = createTestTeam({ descriptionRef: 'el-doc123' as DocumentId });
    const updated = updateTeam(team, { descriptionRef: null });

    expect(updated.descriptionRef).toBeUndefined();
  });

  test('preserves other fields', () => {
    const team = createTestTeam({
      name: 'Original Name',
      tags: ['important'],
      metadata: { key: 'value' },
      members: ['el-user1' as EntityId],
    });
    const updated = updateTeam(team, { name: 'New Name' });

    expect(updated.tags).toEqual(['important']);
    expect(updated.metadata).toEqual({ key: 'value' });
    expect(updated.members).toEqual(['el-user1' as EntityId]);
    expect(updated.id).toBe(team.id);
    expect(updated.createdAt).toBe(team.createdAt);
    expect(updated.createdBy).toBe(team.createdBy);
  });

  test('updates only updatedAt when no changes', () => {
    const team = createTestTeam();
    const updated = updateTeam(team, {});

    expect(updated.name).toBe(team.name);
    expect(updated.updatedAt).not.toBe(team.updatedAt);
  });
});

// ============================================================================
// Membership Operation Tests
// ============================================================================

describe('addMember', () => {
  test('adds member to empty team', () => {
    const team = createTestTeam();
    const updated = addMember(team, 'el-user1' as EntityId);

    expect(updated.members).toEqual(['el-user1' as EntityId]);
    expect(updated.updatedAt).not.toBe(team.updatedAt);
  });

  test('adds member to team with existing members', () => {
    const team = createTestTeam({ members: ['el-user1' as EntityId] });
    const updated = addMember(team, 'el-user2' as EntityId);

    expect(updated.members).toEqual(['el-user1' as EntityId, 'el-user2' as EntityId]);
  });

  test('throws for duplicate member', () => {
    const team = createTestTeam({ members: ['el-user1' as EntityId] });

    expect(() => addMember(team, 'el-user1' as EntityId)).toThrow(MembershipError);
    try {
      addMember(team, 'el-user1' as EntityId);
    } catch (e) {
      const err = e as MembershipError;
      expect(err.details.entityId).toBe('el-user1');
      expect(err.details.teamId).toBe(team.id);
    }
  });

  test('throws for invalid entity ID', () => {
    const team = createTestTeam();

    expect(() => addMember(team, '' as EntityId)).toThrow(MembershipError);
    expect(() => addMember(team, null as unknown as EntityId)).toThrow(MembershipError);
  });

  test('preserves other team properties', () => {
    const team = createTestTeam({
      name: 'My Team',
      tags: ['important'],
    });
    const updated = addMember(team, 'el-user1' as EntityId);

    expect(updated.name).toBe('My Team');
    expect(updated.tags).toEqual(['important']);
    expect(updated.id).toBe(team.id);
  });
});

describe('removeMember', () => {
  test('removes member from team', () => {
    const team = createTestTeam({ members: ['el-user1' as EntityId, 'el-user2' as EntityId] });
    const updated = removeMember(team, 'el-user1' as EntityId);

    expect(updated.members).toEqual(['el-user2' as EntityId]);
    expect(updated.updatedAt).not.toBe(team.updatedAt);
  });

  test('removes last member from team', () => {
    const team = createTestTeam({ members: ['el-user1' as EntityId] });
    const updated = removeMember(team, 'el-user1' as EntityId);

    expect(updated.members).toEqual([]);
  });

  test('throws for non-member', () => {
    const team = createTestTeam({ members: ['el-user1' as EntityId] });

    expect(() => removeMember(team, 'el-user2' as EntityId)).toThrow(MembershipError);
    try {
      removeMember(team, 'el-user2' as EntityId);
    } catch (e) {
      const err = e as MembershipError;
      expect(err.details.entityId).toBe('el-user2');
      expect(err.details.teamId).toBe(team.id);
    }
  });

  test('throws for invalid entity ID', () => {
    const team = createTestTeam();

    expect(() => removeMember(team, '' as EntityId)).toThrow(MembershipError);
    expect(() => removeMember(team, null as unknown as EntityId)).toThrow(MembershipError);
  });
});

describe('isMember', () => {
  test('returns true for member', () => {
    const team = createTestTeam({ members: ['el-user1' as EntityId] });
    expect(isMember(team, 'el-user1' as EntityId)).toBe(true);
  });

  test('returns false for non-member', () => {
    const team = createTestTeam({ members: ['el-user1' as EntityId] });
    expect(isMember(team, 'el-user2' as EntityId)).toBe(false);
  });

  test('returns false for empty team', () => {
    const team = createTestTeam();
    expect(isMember(team, 'el-user1' as EntityId)).toBe(false);
  });
});

describe('getMemberCount', () => {
  test('returns 0 for empty team', () => {
    expect(getMemberCount(createTestTeam())).toBe(0);
  });

  test('returns correct count', () => {
    const team = createTestTeam({
      members: ['el-user1' as EntityId, 'el-user2' as EntityId, 'el-user3' as EntityId],
    });
    expect(getMemberCount(team)).toBe(3);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('hasDescription', () => {
  test('returns true when descriptionRef is present', () => {
    expect(hasDescription(createTestTeam({ descriptionRef: 'el-doc123' as DocumentId }))).toBe(
      true
    );
  });

  test('returns false when descriptionRef is absent', () => {
    expect(hasDescription(createTestTeam())).toBe(false);
  });
});

describe('getTeamDisplayName', () => {
  test('returns the team name', () => {
    expect(getTeamDisplayName(createTestTeam({ name: 'My Team' }))).toBe('My Team');
  });
});

describe('filterByCreator', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, createdBy: 'el-user1' as EntityId }),
    createTestTeam({ id: 'el-2' as ElementId, createdBy: 'el-user2' as EntityId }),
    createTestTeam({ id: 'el-3' as ElementId, createdBy: 'el-user1' as EntityId }),
  ];

  test('filters teams by creator', () => {
    const filtered = filterByCreator(teams, 'el-user1' as EntityId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });

  test('returns empty array when no matches', () => {
    expect(filterByCreator(teams, 'el-user3' as EntityId)).toEqual([]);
  });
});

describe('filterWithDescription', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, descriptionRef: 'el-doc1' as DocumentId }),
    createTestTeam({ id: 'el-2' as ElementId }),
    createTestTeam({ id: 'el-3' as ElementId, descriptionRef: 'el-doc2' as DocumentId }),
  ];

  test('filters teams with description', () => {
    const filtered = filterWithDescription(teams);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });
});

describe('filterWithoutDescription', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, descriptionRef: 'el-doc1' as DocumentId }),
    createTestTeam({ id: 'el-2' as ElementId }),
    createTestTeam({ id: 'el-3' as ElementId }),
  ];

  test('filters teams without description', () => {
    const filtered = filterWithoutDescription(teams);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(['el-2' as ElementId, 'el-3' as ElementId]);
  });
});

describe('filterByMember', () => {
  const teams: Team[] = [
    createTestTeam({
      id: 'el-1' as ElementId,
      members: ['el-user1' as EntityId, 'el-user2' as EntityId],
    }),
    createTestTeam({ id: 'el-2' as ElementId, members: ['el-user2' as EntityId] }),
    createTestTeam({ id: 'el-3' as ElementId, members: ['el-user3' as EntityId] }),
  ];

  test('filters teams by member', () => {
    const filtered = filterByMember(teams, 'el-user2' as EntityId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-2' as ElementId]);
  });

  test('returns empty array when no matches', () => {
    expect(filterByMember(teams, 'el-user4' as EntityId)).toEqual([]);
  });
});

describe('filterWithMembers', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, members: ['el-user1' as EntityId] }),
    createTestTeam({ id: 'el-2' as ElementId, members: [] }),
    createTestTeam({ id: 'el-3' as ElementId, members: ['el-user2' as EntityId] }),
  ];

  test('filters teams that have members', () => {
    const filtered = filterWithMembers(teams);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-3' as ElementId]);
  });
});

describe('filterEmpty', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, members: ['el-user1' as EntityId] }),
    createTestTeam({ id: 'el-2' as ElementId, members: [] }),
    createTestTeam({ id: 'el-3' as ElementId, members: [] }),
  ];

  test('filters empty teams', () => {
    const filtered = filterEmpty(teams);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(['el-2' as ElementId, 'el-3' as ElementId]);
  });
});

describe('sortByName', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, name: 'Zebra' }),
    createTestTeam({ id: 'el-2' as ElementId, name: 'Apple' }),
    createTestTeam({ id: 'el-3' as ElementId, name: 'Mango' }),
  ];

  test('sorts teams by name (ascending)', () => {
    const sorted = sortByName(teams, true);
    expect(sorted.map((t) => t.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  test('sorts teams by name (descending)', () => {
    const sorted = sortByName(teams, false);
    expect(sorted.map((t) => t.name)).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  test('ascending is default', () => {
    const sorted = sortByName(teams);
    expect(sorted.map((t) => t.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  test('does not mutate original array', () => {
    const original = [...teams];
    sortByName(teams);
    expect(teams).toEqual(original);
  });
});

describe('sortByMemberCount', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, members: ['el-user1' as EntityId] }),
    createTestTeam({
      id: 'el-2' as ElementId,
      members: ['el-user1' as EntityId, 'el-user2' as EntityId, 'el-user3' as EntityId],
    }),
    createTestTeam({
      id: 'el-3' as ElementId,
      members: ['el-user1' as EntityId, 'el-user2' as EntityId],
    }),
  ];

  test('sorts teams by member count (largest first by default)', () => {
    const sorted = sortByMemberCount(teams);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-2' as ElementId,
      'el-3' as ElementId,
      'el-1' as ElementId,
    ]);
  });

  test('sorts teams by member count (smallest first)', () => {
    const sorted = sortByMemberCount(teams, true);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-1' as ElementId,
      'el-3' as ElementId,
      'el-2' as ElementId,
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...teams];
    sortByMemberCount(teams);
    expect(teams).toEqual(original);
  });
});

describe('sortByCreationDate', () => {
  const teams: Team[] = [
    createTestTeam({
      id: 'el-1' as ElementId,
      createdAt: '2025-01-20T10:00:00.000Z' as Timestamp,
    }),
    createTestTeam({
      id: 'el-2' as ElementId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestTeam({
      id: 'el-3' as ElementId,
      createdAt: '2025-01-21T10:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts teams by creation date (newest first by default)', () => {
    const sorted = sortByCreationDate(teams);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-2' as ElementId, // Jan 22
      'el-3' as ElementId, // Jan 21
      'el-1' as ElementId, // Jan 20
    ]);
  });

  test('sorts teams by creation date (oldest first)', () => {
    const sorted = sortByCreationDate(teams, true);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-1' as ElementId, // Jan 20
      'el-3' as ElementId, // Jan 21
      'el-2' as ElementId, // Jan 22
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...teams];
    sortByCreationDate(teams);
    expect(teams).toEqual(original);
  });
});

describe('sortByUpdateDate', () => {
  const teams: Team[] = [
    createTestTeam({
      id: 'el-1' as ElementId,
      updatedAt: '2025-01-20T10:00:00.000Z' as Timestamp,
    }),
    createTestTeam({
      id: 'el-2' as ElementId,
      updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    }),
    createTestTeam({
      id: 'el-3' as ElementId,
      updatedAt: '2025-01-21T10:00:00.000Z' as Timestamp,
    }),
  ];

  test('sorts teams by update date (most recent first by default)', () => {
    const sorted = sortByUpdateDate(teams);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-2' as ElementId,
      'el-3' as ElementId,
      'el-1' as ElementId,
    ]);
  });

  test('sorts teams by update date (oldest first)', () => {
    const sorted = sortByUpdateDate(teams, true);
    expect(sorted.map((t) => t.id)).toEqual([
      'el-1' as ElementId,
      'el-3' as ElementId,
      'el-2' as ElementId,
    ]);
  });

  test('does not mutate original array', () => {
    const original = [...teams];
    sortByUpdateDate(teams);
    expect(teams).toEqual(original);
  });
});

describe('groupByCreator', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, createdBy: 'el-user1' as EntityId }),
    createTestTeam({ id: 'el-2' as ElementId, createdBy: 'el-user2' as EntityId }),
    createTestTeam({ id: 'el-3' as ElementId, createdBy: 'el-user1' as EntityId }),
    createTestTeam({ id: 'el-4' as ElementId, createdBy: 'el-user2' as EntityId }),
  ];

  test('groups teams by creator', () => {
    const groups = groupByCreator(teams);
    expect(groups.size).toBe(2);
    expect(groups.get('el-user1' as EntityId)?.map((t) => t.id)).toEqual([
      'el-1' as ElementId,
      'el-3' as ElementId,
    ]);
    expect(groups.get('el-user2' as EntityId)?.map((t) => t.id)).toEqual([
      'el-2' as ElementId,
      'el-4' as ElementId,
    ]);
  });

  test('returns empty map for empty array', () => {
    const groups = groupByCreator([]);
    expect(groups.size).toBe(0);
  });
});

describe('searchByName', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, name: 'Backend Agents' }),
    createTestTeam({ id: 'el-2' as ElementId, name: 'Frontend Team' }),
    createTestTeam({ id: 'el-3' as ElementId, name: 'Backend Team' }),
  ];

  test('searches teams by name (case-insensitive)', () => {
    const results = searchByName(teams, 'backend');
    expect(results).toHaveLength(2);
    expect(results.map((t) => t.name)).toEqual(['Backend Agents', 'Backend Team']);
  });

  test('returns all teams for empty query', () => {
    const results = searchByName(teams, '');
    expect(results).toHaveLength(3);
  });

  test('returns empty array when no matches', () => {
    expect(searchByName(teams, 'xyz')).toEqual([]);
  });
});

describe('findByName', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, name: 'Backend Agents' }),
    createTestTeam({ id: 'el-2' as ElementId, name: 'Frontend Team' }),
  ];

  test('finds team by exact name (case-insensitive)', () => {
    const found = findByName(teams, 'backend agents');
    expect(found?.id).toBe('el-1' as ElementId);
  });

  test('returns undefined when not found', () => {
    expect(findByName(teams, 'Nonexistent')).toBeUndefined();
  });
});

describe('findById', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId }),
    createTestTeam({ id: 'el-2' as ElementId }),
  ];

  test('finds team by ID', () => {
    const found = findById(teams, 'el-1' as TeamId);
    expect(found?.id).toBe('el-1' as ElementId);
  });

  test('accepts string ID', () => {
    const found = findById(teams, 'el-2');
    expect(found?.id).toBe('el-2' as ElementId);
  });

  test('returns undefined when not found', () => {
    expect(findById(teams, 'el-999' as TeamId)).toBeUndefined();
  });
});

describe('isNameUnique', () => {
  const teams: Team[] = [
    createTestTeam({ id: 'el-1' as ElementId, name: 'Backend Agents' }),
    createTestTeam({ id: 'el-2' as ElementId, name: 'Frontend Team' }),
  ];

  test('returns true for unique name', () => {
    expect(isNameUnique(teams, 'New Team')).toBe(true);
  });

  test('returns false for duplicate name (case-insensitive)', () => {
    expect(isNameUnique(teams, 'backend agents')).toBe(false);
    expect(isNameUnique(teams, 'BACKEND AGENTS')).toBe(false);
  });

  test('excludes specific ID from check', () => {
    // Same name is allowed when updating the same team
    expect(isNameUnique(teams, 'Backend Agents', 'el-1' as TeamId)).toBe(true);
    // But not allowed if different ID
    expect(isNameUnique(teams, 'Backend Agents', 'el-2' as TeamId)).toBe(false);
  });

  test('trims name before checking', () => {
    expect(isNameUnique(teams, '  Backend Agents  ')).toBe(false);
  });
});

describe('getTeamsForEntity', () => {
  const teams: Team[] = [
    createTestTeam({
      id: 'el-1' as ElementId,
      members: ['el-user1' as EntityId, 'el-user2' as EntityId],
    }),
    createTestTeam({ id: 'el-2' as ElementId, members: ['el-user2' as EntityId] }),
    createTestTeam({ id: 'el-3' as ElementId, members: ['el-user3' as EntityId] }),
  ];

  test('gets all teams for an entity', () => {
    const result = getTeamsForEntity(teams, 'el-user2' as EntityId);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['el-1' as ElementId, 'el-2' as ElementId]);
  });

  test('returns empty array for entity not in any team', () => {
    expect(getTeamsForEntity(teams, 'el-user4' as EntityId)).toEqual([]);
  });
});

describe('getAllMembers', () => {
  const teams: Team[] = [
    createTestTeam({
      members: ['el-user1' as EntityId, 'el-user2' as EntityId],
    }),
    createTestTeam({ members: ['el-user2' as EntityId, 'el-user3' as EntityId] }),
    createTestTeam({ members: ['el-user1' as EntityId] }),
  ];

  test('gets all unique members across teams', () => {
    const result = getAllMembers(teams);
    expect(result.sort()).toEqual([
      'el-user1' as EntityId,
      'el-user2' as EntityId,
      'el-user3' as EntityId,
    ]);
  });

  test('returns empty array for empty teams array', () => {
    expect(getAllMembers([])).toEqual([]);
  });

  test('returns empty array for teams with no members', () => {
    expect(getAllMembers([createTestTeam(), createTestTeam()])).toEqual([]);
  });
});

describe('haveCommonMembers', () => {
  test('returns true when teams have common members', () => {
    const teamA = createTestTeam({
      members: ['el-user1' as EntityId, 'el-user2' as EntityId],
    });
    const teamB = createTestTeam({
      members: ['el-user2' as EntityId, 'el-user3' as EntityId],
    });
    expect(haveCommonMembers(teamA, teamB)).toBe(true);
  });

  test('returns false when teams have no common members', () => {
    const teamA = createTestTeam({ members: ['el-user1' as EntityId] });
    const teamB = createTestTeam({ members: ['el-user2' as EntityId] });
    expect(haveCommonMembers(teamA, teamB)).toBe(false);
  });

  test('returns false for empty teams', () => {
    const teamA = createTestTeam();
    const teamB = createTestTeam();
    expect(haveCommonMembers(teamA, teamB)).toBe(false);
  });
});

describe('getCommonMembers', () => {
  test('gets common members between teams', () => {
    const teamA = createTestTeam({
      members: ['el-user1' as EntityId, 'el-user2' as EntityId, 'el-user3' as EntityId],
    });
    const teamB = createTestTeam({
      members: ['el-user2' as EntityId, 'el-user3' as EntityId, 'el-user4' as EntityId],
    });
    const common = getCommonMembers(teamA, teamB);
    expect(common.sort()).toEqual(['el-user2' as EntityId, 'el-user3' as EntityId]);
  });

  test('returns empty array when no common members', () => {
    const teamA = createTestTeam({ members: ['el-user1' as EntityId] });
    const teamB = createTestTeam({ members: ['el-user2' as EntityId] });
    expect(getCommonMembers(teamA, teamB)).toEqual([]);
  });

  test('returns empty array for empty teams', () => {
    const teamA = createTestTeam();
    const teamB = createTestTeam();
    expect(getCommonMembers(teamA, teamB)).toEqual([]);
  });
});

// ============================================================================
// Edge Cases and Property-Based Tests
// ============================================================================

describe('Edge cases', () => {
  test('handles maximum name length', async () => {
    const maxName = 'a'.repeat(MAX_TEAM_NAME_LENGTH);
    const team = await createTeam({
      name: maxName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(team.name).toBe(maxName);
  });

  test('handles unicode in name', async () => {
    const unicodeName = '团队 🤖 チーム';
    const team = await createTeam({
      name: unicodeName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(team.name).toBe(unicodeName);
  });

  test('handles emoji in name', async () => {
    const emojiName = '🤖 Agent Pool 🎯';
    const team = await createTeam({
      name: emojiName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(team.name).toBe(emojiName);
  });

  test('handles minimum name length', async () => {
    const minName = 'A';
    const team = await createTeam({
      name: minName,
      createdBy: 'el-system1' as EntityId,
    });
    expect(team.name).toBe(minName);
  });
});

describe('HydratedTeam interface', () => {
  test('HydratedTeam extends Team with hydrated fields', () => {
    const hydratedTeam: HydratedTeam = {
      ...createTestTeam(),
      descriptionRef: 'el-doc1' as DocumentId,
      description: 'Full description content',
      memberCount: 5,
    };

    expect(hydratedTeam.description).toBe('Full description content');
    expect(hydratedTeam.memberCount).toBe(5);
    expect(isTeam(hydratedTeam)).toBe(true); // Base team validation still works
  });

  test('HydratedTeam works without optional fields', () => {
    const hydratedTeam: HydratedTeam = {
      ...createTestTeam(),
    };

    expect(hydratedTeam.description).toBeUndefined();
    expect(hydratedTeam.memberCount).toBeUndefined();
    expect(isTeam(hydratedTeam)).toBe(true);
  });
});

describe('Update scenarios', () => {
  test('update name only', () => {
    const team = createTestTeam({ name: 'Original' });
    const updated = updateTeam(team, { name: 'Updated' });

    expect(updated.name).toBe('Updated');
    expect(updated.descriptionRef).toBeUndefined();
  });

  test('add description to team without one', () => {
    const team = createTestTeam();
    const updated = updateTeam(team, { descriptionRef: 'el-doc1' as DocumentId });

    expect(updated.descriptionRef).toBe('el-doc1' as DocumentId);
    expect(updated.name).toBe(team.name);
  });

  test('change description reference', () => {
    const team = createTestTeam({ descriptionRef: 'el-doc1' as DocumentId });
    const updated = updateTeam(team, { descriptionRef: 'el-doc2' as DocumentId });

    expect(updated.descriptionRef).toBe('el-doc2' as DocumentId);
  });

  test('update multiple fields at once', () => {
    const team = createTestTeam({ name: 'Original' });
    const updated = updateTeam(team, {
      name: 'New Name',
      descriptionRef: 'el-doc1' as DocumentId,
    });

    expect(updated.name).toBe('New Name');
    expect(updated.descriptionRef).toBe('el-doc1' as DocumentId);
  });
});

describe('Membership workflow', () => {
  test('add then remove member', () => {
    let team = createTestTeam();
    team = addMember(team, 'el-user1' as EntityId);
    expect(team.members).toEqual(['el-user1' as EntityId]);

    team = removeMember(team, 'el-user1' as EntityId);
    expect(team.members).toEqual([]);
  });

  test('add multiple members', () => {
    let team = createTestTeam();
    team = addMember(team, 'el-user1' as EntityId);
    team = addMember(team, 'el-user2' as EntityId);
    team = addMember(team, 'el-user3' as EntityId);
    expect(team.members).toHaveLength(3);
  });

  test('remove members in different order', () => {
    let team = createTestTeam({
      members: ['el-user1' as EntityId, 'el-user2' as EntityId, 'el-user3' as EntityId],
    });
    team = removeMember(team, 'el-user2' as EntityId);
    expect(team.members).toEqual(['el-user1' as EntityId, 'el-user3' as EntityId]);
  });
});

describe('Filter and sort combinations', () => {
  const teams: Team[] = [
    createTestTeam({
      id: 'el-1' as ElementId,
      name: 'Beta',
      createdBy: 'el-user1' as EntityId,
      createdAt: '2025-01-20T10:00:00.000Z' as Timestamp,
      members: ['el-member1' as EntityId],
    }),
    createTestTeam({
      id: 'el-2' as ElementId,
      name: 'Alpha',
      createdBy: 'el-user2' as EntityId,
      createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
      members: ['el-member1' as EntityId, 'el-member2' as EntityId],
    }),
    createTestTeam({
      id: 'el-3' as ElementId,
      name: 'Gamma',
      createdBy: 'el-user1' as EntityId,
      createdAt: '2025-01-21T10:00:00.000Z' as Timestamp,
      members: [],
    }),
  ];

  test('filter by creator then sort by name', () => {
    const filtered = filterByCreator(teams, 'el-user1' as EntityId);
    const sorted = sortByName(filtered, true);

    expect(sorted.map((t) => t.name)).toEqual(['Beta', 'Gamma']);
  });

  test('filter by member then sort by member count', () => {
    const filtered = filterByMember(teams, 'el-member1' as EntityId);
    const sorted = sortByMemberCount(filtered);

    expect(sorted.map((t) => t.id)).toEqual(['el-2' as ElementId, 'el-1' as ElementId]);
  });

  test('sort then search', () => {
    const sorted = sortByCreationDate(teams);
    const results = searchByName(sorted, 'a');

    // Should find Alpha, Beta, Gamma (all contain 'a')
    expect(results).toHaveLength(3);
    // Order should be preserved from sort (newest first)
    expect(results[0].name).toBe('Alpha'); // Jan 22
    expect(results[1].name).toBe('Gamma'); // Jan 21
    expect(results[2].name).toBe('Beta'); // Jan 20
  });
});

describe('Empty collection handling', () => {
  test('filter on empty array returns empty array', () => {
    expect(filterByCreator([], 'el-user1' as EntityId)).toEqual([]);
    expect(filterWithDescription([])).toEqual([]);
    expect(filterWithoutDescription([])).toEqual([]);
    expect(filterByMember([], 'el-user1' as EntityId)).toEqual([]);
    expect(filterWithMembers([])).toEqual([]);
    expect(filterEmpty([])).toEqual([]);
  });

  test('sort on empty array returns empty array', () => {
    expect(sortByName([])).toEqual([]);
    expect(sortByMemberCount([])).toEqual([]);
    expect(sortByCreationDate([])).toEqual([]);
    expect(sortByUpdateDate([])).toEqual([]);
  });

  test('search on empty array returns empty array', () => {
    expect(searchByName([], 'test')).toEqual([]);
  });

  test('find on empty array returns undefined', () => {
    expect(findByName([], 'test')).toBeUndefined();
    expect(findById([], 'el-1' as TeamId)).toBeUndefined();
  });

  test('isNameUnique on empty array returns true', () => {
    expect(isNameUnique([], 'Any Name')).toBe(true);
  });

  test('getTeamsForEntity on empty array returns empty array', () => {
    expect(getTeamsForEntity([], 'el-user1' as EntityId)).toEqual([]);
  });
});

describe('MembershipError', () => {
  test('is instance of ValidationError', () => {
    const error = new MembershipError('test', { field: 'test' });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('MembershipError');
    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
  });
});
