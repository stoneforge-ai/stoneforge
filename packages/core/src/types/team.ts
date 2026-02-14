/**
 * Team Type - Entity collection primitive
 *
 * Teams are collections of related Entities, enabling group-based operations,
 * assignment, and organization. Entities can belong to multiple Teams, and
 * Teams can be used for task assignment, metrics aggregation, and access control.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import {
  Element,
  ElementId,
  EntityId,
  ElementType,
  Timestamp,
  createTimestamp,
  validateTags,
  validateMetadata,
} from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';
import { DocumentId } from './document.js';

// ============================================================================
// Validation Constants
// ============================================================================

/** Minimum team name length */
export const MIN_TEAM_NAME_LENGTH = 1;

/** Maximum team name length */
export const MAX_TEAM_NAME_LENGTH = 100;

/** Maximum number of members in a team */
export const MAX_TEAM_MEMBERS = 1000;

// ============================================================================
// Team ID Type
// ============================================================================

/**
 * Branded type for Team IDs (for use in references)
 */
declare const TeamIdBrand: unique symbol;
export type TeamId = ElementId & { readonly [TeamIdBrand]: typeof TeamIdBrand };

// ============================================================================
// Team Interface
// ============================================================================

/**
 * Team status values
 */
export const TeamStatus = {
  /** Active team - can accept members and tasks */
  ACTIVE: 'active',
  /** Soft-deleted team - preserved for audit trail */
  TOMBSTONE: 'tombstone',
} as const;

export type TeamStatus = (typeof TeamStatus)[keyof typeof TeamStatus];

/**
 * Team interface - extends Element with entity collection properties
 */
export interface Team extends Element {
  /** Team type is always 'team' */
  readonly type: typeof ElementType.TEAM;

  // Content
  /** Team name, 1-100 characters */
  name: string;
  /** Reference to description Document */
  descriptionRef?: DocumentId;

  // Membership
  /** Current team members (EntityIds) */
  members: EntityId[];

  // Status
  /** Team status - defaults to 'active' */
  status?: TeamStatus;

  // Soft delete fields
  /** When team was soft-deleted */
  deletedAt?: Timestamp;
  /** Entity that deleted the team */
  deletedBy?: EntityId;
  /** Reason for deletion */
  deleteReason?: string;
}

/**
 * Team with hydrated information
 */
export interface HydratedTeam extends Team {
  /** Hydrated description Document content */
  description?: string;
  /** Number of members (for display) */
  memberCount?: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a team name
 */
export function isValidTeamName(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length >= MIN_TEAM_NAME_LENGTH && trimmed.length <= MAX_TEAM_NAME_LENGTH;
}

/**
 * Validates team name and throws if invalid
 */
export function validateTeamName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Team name must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'string' }
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(
      'Team name cannot be empty',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'name', value }
    );
  }

  if (trimmed.length > MAX_TEAM_NAME_LENGTH) {
    throw new ValidationError(
      `Team name exceeds maximum length of ${MAX_TEAM_NAME_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', expected: `<= ${MAX_TEAM_NAME_LENGTH} characters`, actual: trimmed.length }
    );
  }

  return trimmed;
}

/**
 * Validates a team ID format
 */
export function isValidTeamId(value: unknown): value is TeamId {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic ID format check (el-{hash})
  return /^el-[0-9a-z]{3,8}$/.test(value);
}

/**
 * Validates team ID and throws if invalid
 */
export function validateTeamId(value: unknown): TeamId {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Team ID must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'teamId', value, expected: 'string' }
    );
  }

  if (!/^el-[0-9a-z]{3,8}$/.test(value)) {
    throw new ValidationError(
      'Team ID has invalid format',
      ErrorCode.INVALID_INPUT,
      { field: 'teamId', value, expected: 'el-{3-8 base36 chars}' }
    );
  }

  return value as TeamId;
}

/**
 * Validates a members array
 */
export function isValidMembers(value: unknown): value is EntityId[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length > MAX_TEAM_MEMBERS) {
    return false;
  }
  // Check all members are strings
  if (!value.every((m) => typeof m === 'string' && m.length > 0)) {
    return false;
  }
  // Check for duplicates
  const unique = new Set(value);
  if (unique.size !== value.length) {
    return false;
  }
  return true;
}

/**
 * Validates members array and throws if invalid
 */
export function validateMembers(value: unknown): EntityId[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      'Members must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'members', value, expected: 'array' }
    );
  }

  if (value.length > MAX_TEAM_MEMBERS) {
    throw new ValidationError(
      `Team exceeds maximum of ${MAX_TEAM_MEMBERS} members`,
      ErrorCode.INVALID_INPUT,
      { field: 'members', expected: `<= ${MAX_TEAM_MEMBERS}`, actual: value.length }
    );
  }

  // Check each member is a valid EntityId
  for (let i = 0; i < value.length; i++) {
    const member = value[i];
    if (typeof member !== 'string' || member.length === 0) {
      throw new ValidationError(
        `Member at index ${i} must be a non-empty string`,
        ErrorCode.INVALID_INPUT,
        { field: `members[${i}]`, value: member, expected: 'non-empty string' }
      );
    }
  }

  // Check for duplicates
  const unique = new Set(value);
  if (unique.size !== value.length) {
    const duplicates = value.filter((m, i) => value.indexOf(m) !== i);
    throw new ValidationError(
      'Duplicate members are not allowed',
      ErrorCode.INVALID_INPUT,
      { field: 'members', duplicates }
    );
  }

  return value as EntityId[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Team
 */
export function isTeam(value: unknown): value is Team {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.TEAM) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check required team-specific properties
  if (!isValidTeamName(obj.name)) return false;
  if (!isValidMembers(obj.members)) return false;

  // Check optional properties have correct types when present
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string') return false;

  return true;
}

/**
 * Comprehensive validation of a team with detailed errors
 */
export function validateTeam(value: unknown): Team {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Team must be an object', ErrorCode.INVALID_INPUT, {
      value,
    });
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Team id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.TEAM) {
    throw new ValidationError(
      `Team type must be '${ElementType.TEAM}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.TEAM }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError('Team createdAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'createdAt',
      value: obj.createdAt,
    });
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError('Team updatedAt is required', ErrorCode.MISSING_REQUIRED_FIELD, {
      field: 'updatedAt',
      value: obj.updatedAt,
    });
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Team createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError('Team tags must be an array', ErrorCode.INVALID_INPUT, {
      field: 'tags',
      value: obj.tags,
      expected: 'array',
    });
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError('Team metadata must be an object', ErrorCode.INVALID_INPUT, {
      field: 'metadata',
      value: obj.metadata,
      expected: 'object',
    });
  }

  // Validate team-specific required fields
  validateTeamName(obj.name);
  validateMembers(obj.members);

  // Validate optional fields types
  if (obj.descriptionRef !== undefined && typeof obj.descriptionRef !== 'string') {
    throw new ValidationError(
      'Team descriptionRef must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'descriptionRef', value: obj.descriptionRef, expected: 'string' }
    );
  }

  return value as Team;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new team
 */
export interface CreateTeamInput {
  /** Team name, 1-100 characters */
  name: string;
  /** Reference to the entity that created this team */
  createdBy: EntityId;
  /** Optional: Reference to description Document */
  descriptionRef?: DocumentId;
  /** Optional: Initial members */
  members?: EntityId[];
  /** Optional: tags */
  tags?: string[];
  /** Optional: metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Team with validated inputs
 *
 * @param input - Team creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Team
 */
export async function createTeam(
  input: CreateTeamInput,
  config?: IdGeneratorConfig
): Promise<Team> {
  // Validate required fields
  const name = validateTeamName(input.name);

  // Validate members if provided
  const members = input.members ? validateMembers(input.members) : [];

  // Validate tags and metadata
  const tags = input.tags ? validateTags(input.tags) : [];
  const metadata = input.metadata ? validateMetadata(input.metadata) : {};

  const now = createTimestamp();

  // Generate ID using name
  const id = await generateId({ identifier: name, createdBy: input.createdBy }, config);

  const team: Team = {
    id,
    type: ElementType.TEAM,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags,
    metadata,
    name,
    members,
    ...(input.descriptionRef !== undefined && { descriptionRef: input.descriptionRef }),
  };

  return team;
}

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Input for updating a team
 */
export interface UpdateTeamInput {
  /** New name (optional) */
  name?: string;
  /** New description reference (optional, use null to remove) */
  descriptionRef?: DocumentId | null;
}

/**
 * Updates a team with new values
 *
 * @param team - The current team
 * @param input - Update input
 * @returns The updated team
 */
export function updateTeam(team: Team, input: UpdateTeamInput): Team {
  const updates: Partial<Team> = {
    updatedAt: createTimestamp(),
  };

  if (input.name !== undefined) {
    updates.name = validateTeamName(input.name);
  }

  if (input.descriptionRef === null) {
    // Remove description reference
    const { descriptionRef: _, ...rest } = team;
    return { ...rest, ...updates } as Team;
  } else if (input.descriptionRef !== undefined) {
    updates.descriptionRef = input.descriptionRef;
  }

  return { ...team, ...updates };
}

// ============================================================================
// Membership Operations
// ============================================================================

/**
 * Error thrown when member operation fails
 */
export class MembershipError extends ValidationError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, ErrorCode.INVALID_INPUT, details);
    this.name = 'MembershipError';
  }
}

/**
 * Adds a member to a team
 *
 * @param team - The team to modify
 * @param entityId - The entity to add
 * @returns The updated team
 * @throws MembershipError if entity is already a member
 */
export function addMember(team: Team, entityId: EntityId): Team {
  if (typeof entityId !== 'string' || entityId.length === 0) {
    throw new MembershipError('Entity ID must be a non-empty string', {
      field: 'entityId',
      value: entityId,
    });
  }

  if (team.members.includes(entityId)) {
    throw new MembershipError('Entity is already a member of this team', {
      teamId: team.id,
      entityId,
    });
  }

  if (team.members.length >= MAX_TEAM_MEMBERS) {
    throw new MembershipError(`Team has reached maximum capacity of ${MAX_TEAM_MEMBERS} members`, {
      teamId: team.id,
      currentCount: team.members.length,
      maxCount: MAX_TEAM_MEMBERS,
    });
  }

  return {
    ...team,
    members: [...team.members, entityId],
    updatedAt: createTimestamp(),
  };
}

/**
 * Removes a member from a team
 *
 * @param team - The team to modify
 * @param entityId - The entity to remove
 * @returns The updated team
 * @throws MembershipError if entity is not a member
 */
export function removeMember(team: Team, entityId: EntityId): Team {
  if (typeof entityId !== 'string' || entityId.length === 0) {
    throw new MembershipError('Entity ID must be a non-empty string', {
      field: 'entityId',
      value: entityId,
    });
  }

  if (!team.members.includes(entityId)) {
    throw new MembershipError('Entity is not a member of this team', {
      teamId: team.id,
      entityId,
    });
  }

  return {
    ...team,
    members: team.members.filter((m) => m !== entityId),
    updatedAt: createTimestamp(),
  };
}

/**
 * Checks if an entity is a member of a team
 */
export function isMember(team: Team, entityId: EntityId): boolean {
  return team.members.includes(entityId);
}

/**
 * Gets the member count of a team
 */
export function getMemberCount(team: Team): number {
  return team.members.length;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a team has a description reference
 */
export function hasDescription(team: Team): boolean {
  return team.descriptionRef !== undefined;
}

/**
 * Gets a display string for team name
 */
export function getTeamDisplayName(team: Team): string {
  return team.name;
}

/**
 * Filter teams by creator
 */
export function filterByCreator<T extends Team>(teams: T[], createdBy: EntityId): T[] {
  return teams.filter((t) => t.createdBy === createdBy);
}

/**
 * Filter teams that have a description
 */
export function filterWithDescription<T extends Team>(teams: T[]): T[] {
  return teams.filter((t) => t.descriptionRef !== undefined);
}

/**
 * Filter teams that don't have a description
 */
export function filterWithoutDescription<T extends Team>(teams: T[]): T[] {
  return teams.filter((t) => t.descriptionRef === undefined);
}

/**
 * Filter teams by member (returns teams that contain the given entity)
 */
export function filterByMember<T extends Team>(teams: T[], entityId: EntityId): T[] {
  return teams.filter((t) => t.members.includes(entityId));
}

/**
 * Filter teams that have any members
 */
export function filterWithMembers<T extends Team>(teams: T[]): T[] {
  return teams.filter((t) => t.members.length > 0);
}

/**
 * Filter teams that are empty (no members)
 */
export function filterEmpty<T extends Team>(teams: T[]): T[] {
  return teams.filter((t) => t.members.length === 0);
}

/**
 * Sort teams by name (alphabetically)
 */
export function sortByName<T extends Team>(teams: T[], ascending = true): T[] {
  return [...teams].sort((a, b) => {
    const comparison = a.name.localeCompare(b.name);
    return ascending ? comparison : -comparison;
  });
}

/**
 * Sort teams by member count
 */
export function sortByMemberCount<T extends Team>(teams: T[], ascending = false): T[] {
  return [...teams].sort((a, b) => {
    const comparison = b.members.length - a.members.length;
    return ascending ? -comparison : comparison;
  });
}

/**
 * Sort teams by creation date (newest first)
 */
export function sortByCreationDate<T extends Team>(teams: T[], ascending = false): T[] {
  return [...teams].sort((a, b) => {
    const comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return ascending ? -comparison : comparison;
  });
}

/**
 * Sort teams by update date (most recently updated first)
 */
export function sortByUpdateDate<T extends Team>(teams: T[], ascending = false): T[] {
  return [...teams].sort((a, b) => {
    const comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return ascending ? -comparison : comparison;
  });
}

/**
 * Group teams by creator
 */
export function groupByCreator<T extends Team>(teams: T[]): Map<EntityId, T[]> {
  const groups = new Map<EntityId, T[]>();
  for (const team of teams) {
    const existing = groups.get(team.createdBy) ?? [];
    groups.set(team.createdBy, [...existing, team]);
  }
  return groups;
}

/**
 * Search teams by name (case-insensitive contains match)
 */
export function searchByName<T extends Team>(teams: T[], query: string): T[] {
  const lowerQuery = query.toLowerCase();
  return teams.filter((t) => t.name.toLowerCase().includes(lowerQuery));
}

/**
 * Find a team by exact name match (case-insensitive)
 */
export function findByName<T extends Team>(teams: T[], name: string): T | undefined {
  const lowerName = name.toLowerCase();
  return teams.find((t) => t.name.toLowerCase() === lowerName);
}

/**
 * Find a team by ID
 */
export function findById<T extends Team>(teams: T[], id: TeamId | string): T | undefined {
  return teams.find((t) => t.id === id);
}

/**
 * Check if a team name is unique within a collection
 */
export function isNameUnique(teams: Team[], name: string, excludeId?: TeamId | string): boolean {
  const lowerName = name.toLowerCase().trim();
  return !teams.some(
    (t) => t.name.toLowerCase() === lowerName && t.id !== excludeId
  );
}

/**
 * Get all teams that an entity belongs to
 */
export function getTeamsForEntity<T extends Team>(teams: T[], entityId: EntityId): T[] {
  return teams.filter((t) => t.members.includes(entityId));
}

/**
 * Get all unique members across multiple teams
 */
export function getAllMembers(teams: Team[]): EntityId[] {
  const members = new Set<EntityId>();
  for (const team of teams) {
    for (const member of team.members) {
      members.add(member);
    }
  }
  return Array.from(members);
}

/**
 * Check if two teams have any common members
 */
export function haveCommonMembers(teamA: Team, teamB: Team): boolean {
  return teamA.members.some((m) => teamB.members.includes(m));
}

/**
 * Get common members between two teams
 */
export function getCommonMembers(teamA: Team, teamB: Team): EntityId[] {
  return teamA.members.filter((m) => teamB.members.includes(m));
}

// ============================================================================
// Soft Delete Functions
// ============================================================================

/**
 * Input for soft deleting a team
 */
export interface DeleteTeamInput {
  /** Entity performing the deletion */
  deletedBy: EntityId;
  /** Reason for deletion */
  deleteReason?: string;
}

/**
 * Soft deletes a team (marks as tombstone)
 *
 * @param team - The team to delete
 * @param input - Deletion input
 * @returns The soft-deleted team
 * @throws ValidationError if team is already deleted
 */
export function softDeleteTeam(team: Team, input: DeleteTeamInput): Team {
  if (isDeleted(team)) {
    throw new ValidationError(
      'Team is already deleted',
      ErrorCode.INVALID_INPUT,
      { teamId: team.id, currentStatus: team.status }
    );
  }

  const now = createTimestamp();

  return {
    ...team,
    status: TeamStatus.TOMBSTONE,
    deletedAt: now,
    deletedBy: input.deletedBy,
    ...(input.deleteReason !== undefined && { deleteReason: input.deleteReason }),
    updatedAt: now,
  };
}

/**
 * Checks if a team is soft-deleted (tombstone)
 */
export function isDeleted(team: Team): boolean {
  return team.status === TeamStatus.TOMBSTONE;
}

/**
 * Checks if a team is active (not deleted)
 */
export function isActive(team: Team): boolean {
  return team.status !== TeamStatus.TOMBSTONE;
}

/**
 * Filter teams to only active (non-deleted)
 */
export function filterActive<T extends Team>(teams: T[]): T[] {
  return teams.filter((t) => t.status !== TeamStatus.TOMBSTONE);
}

/**
 * Filter teams to only deleted (tombstone)
 */
export function filterDeleted<T extends Team>(teams: T[]): T[] {
  return teams.filter((t) => t.status === TeamStatus.TOMBSTONE);
}
