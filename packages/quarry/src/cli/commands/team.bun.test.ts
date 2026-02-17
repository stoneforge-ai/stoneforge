/**
 * Team Commands Integration Tests
 *
 * Tests for the team CLI commands:
 * - team create: Create a new team
 * - team add: Add member to team
 * - team remove: Remove member from team
 * - team list: List teams
 * - team members: List team members
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { teamCommand } from './team.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Team } from '@stoneforge/core';
import type { Element, EntityId } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_team_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// Helper to create a team and return its ID
async function createTestTeam(
  name: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const createSubCmd = teamCommand.subcommands!['create'];
  const options = createTestOptions({ name, ...extra });
  const result = await createSubCmd.handler([], options);
  return (result.data as { id: string }).id;
}

// Helper to create an entity and return its ID
async function createTestEntity(
  name: string,
  entityType: 'agent' | 'human' | 'system' = 'agent'
): Promise<string> {
  const { createQuarryAPI } = await import('../../api/quarry-api.js');
  const { createStorage, initializeSchema } = await import('@stoneforge/storage');
  const { createEntity } = await import('@stoneforge/core');
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  const api = createQuarryAPI(backend);

  const entity = await createEntity({
    name,
    entityType,
    createdBy: 'test-user' as EntityId,
  });
  const created = await api.create(entity as unknown as Element & Record<string, unknown>);
  backend.close();
  return created.id;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Team Create Command Tests
// ============================================================================

describe('team create command', () => {
  const createSubCmd = teamCommand.subcommands!['create'];

  test('creates a team with required name', async () => {
    const options = createTestOptions({ name: 'Engineering' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const team = result.data as Team;
    expect(team.id).toMatch(/^el-/);
    expect(team.name).toBe('Engineering');
    expect(team.type).toBe('team');
    expect(team.members).toEqual([]);
  });

  test('creates team with initial members', async () => {
    const options = createTestOptions({ name: 'Design', member: ['el-user1', 'el-user2'] });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const team = result.data as Team;
    expect(team.members.map(String)).toContain('el-user1');
    expect(team.members.map(String)).toContain('el-user2');
  });

  test('creates team with tags', async () => {
    const options = createTestOptions({ name: 'Backend', tag: ['engineering', 'backend'] });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const team = result.data as Team;
    expect(team.tags).toContain('engineering');
    expect(team.tags).toContain('backend');
  });

  test('fails without name', async () => {
    const options = createTestOptions();
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--name is required');
  });
});

// ============================================================================
// Team List Command Tests
// ============================================================================

describe('team list command', () => {
  const listSubCmd = teamCommand.subcommands!['list'];

  test('lists all teams', async () => {
    await createTestTeam('Team 1');
    await createTestTeam('Team 2');

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Team[]).length).toBe(2);
  });

  test('filters by member', async () => {
    await createTestTeam('Team 1', { member: ['el-user1'] });
    await createTestTeam('Team 2', { member: ['el-user2'] });

    const options = createTestOptions({ member: 'el-user1' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const teams = result.data as Team[];
    expect(teams.length).toBe(1);
    expect(teams[0].members.map(String)).toContain('el-user1');
  });

  test('respects limit option', async () => {
    await createTestTeam('Team 1');
    await createTestTeam('Team 2');
    await createTestTeam('Team 3');

    const options = createTestOptions({ limit: '2' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Team[]).length).toBe(2);
  });

  test('returns empty message when no teams', async () => {
    // Create and delete a team to initialize the database
    const teamId = await createTestTeam('Temp');
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);
    await api.delete(teamId as unknown as ElementId, {});

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No teams found');
  });
});

// ============================================================================
// Team Add Command Tests
// ============================================================================

describe('team add command', () => {
  const addSubCmd = teamCommand.subcommands!['add'];
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('adds a member to a team', async () => {
    const teamId = await createTestTeam('Engineering');
    const entityId = await createTestEntity('new-user', 'human');

    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, entityId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Added');

    // Verify member is in team
    const membersResult = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    const data = membersResult.data as { members: string[] };
    expect(data.members).toContain(entityId);
  });

  test('returns success for already existing member', async () => {
    const teamId = await createTestTeam('Engineering', { member: ['el-user1'] });

    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, 'el-user1'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already a member');
  });

  test('fails without team id and entity id', async () => {
    const options = createTestOptions();
    const result = await addSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent team', async () => {
    // Create a team first so the database exists
    await createTestTeam('Existing');

    const options = createTestOptions();
    const result = await addSubCmd.handler(['el-nonexistent', 'el-user1'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Team not found');
  });

  test('fails when adding non-existent entity ID', async () => {
    // Per spec, entity must exist before being added to team
    const teamId = await createTestTeam('Test Team');

    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, 'el-nonexistent-entity'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Entity not found: el-nonexistent-entity');
  });

  test('fails when adding non-entity element (task) to team', async () => {
    // Create the API directly to create a task
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { createTask } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create a task
    const task = await createTask({
      title: 'Test Task',
      createdBy: 'test-user' as EntityId,
    });
    const createdTask = await api.create(task as unknown as Element & Record<string, unknown>);

    // Create a team
    const teamId = await createTestTeam('Test Team');

    // Try to add the task as a team member
    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, createdTask.id], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('is not an entity');
    expect(result.error).toContain('type: task');

    backend.close();
  });

  test('fails when adding non-entity element (document) to team', async () => {
    // Create the API directly to create a document
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { createDocument, ContentType } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create a document
    const doc = await createDocument({
      contentType: ContentType.TEXT,
      content: 'Test content',
      createdBy: 'test-user' as EntityId,
    });
    const createdDoc = await api.create(doc as unknown as Element & Record<string, unknown>);

    // Create a team
    const teamId = await createTestTeam('Test Team');

    // Try to add the document as a team member
    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, createdDoc.id], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('is not an entity');
    expect(result.error).toContain('type: document');

    backend.close();
  });

  test('succeeds when adding actual entity to team', async () => {
    // Create the API directly to create an entity
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { createEntity } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create an entity (name must follow pattern: letters, numbers, hyphens, underscores)
    const entity = await createEntity({
      name: 'test-agent',
      entityType: 'agent',
      createdBy: 'test-user' as EntityId,
    });
    const createdEntity = await api.create(entity as unknown as Element & Record<string, unknown>);

    // Create a team
    const teamId = await createTestTeam('Test Team');

    // Add the entity as a team member
    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, createdEntity.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Added');

    // Verify member is in team
    const membersResult = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    const data = membersResult.data as { members: string[] };
    expect(data.members).toContain(createdEntity.id);

    backend.close();
  });
});

// ============================================================================
// Team Remove Command Tests
// ============================================================================

describe('team remove command', () => {
  const removeSubCmd = teamCommand.subcommands!['remove'];
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('removes a member from a team', async () => {
    const teamId = await createTestTeam('Engineering', { member: ['el-user1'] });

    const options = createTestOptions();
    const result = await removeSubCmd.handler([teamId, 'el-user1'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Removed');

    // Verify member is removed
    const membersResult = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    const data = membersResult.data as { members: string[] };
    expect(data.members).not.toContain('el-user1');
  });

  test('returns success for non-member', async () => {
    const teamId = await createTestTeam('Engineering');

    const options = createTestOptions();
    const result = await removeSubCmd.handler([teamId, 'el-nonmember'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('is not a member');
  });

  test('fails without team id and entity id', async () => {
    const options = createTestOptions();
    const result = await removeSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });
});

// ============================================================================
// Team Members Command Tests
// ============================================================================

describe('team members command', () => {
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('lists team members', async () => {
    const teamId = await createTestTeam('Engineering', { member: ['el-user1', 'el-user2'] });

    const options = createTestOptions();
    const result = await membersSubCmd.handler([teamId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { members: string[]; count: number };
    expect(data.members.length).toBe(2);
    expect(data.count).toBe(2);
  });

  test('returns empty message when no members', async () => {
    const teamId = await createTestTeam('Empty Team');

    const options = createTestOptions();
    const result = await membersSubCmd.handler([teamId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No members');
  });

  test('fails without team id', async () => {
    const options = createTestOptions();
    const result = await membersSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent team', async () => {
    // Create a team first so DB exists
    await createTestTeam('Existing');

    const options = createTestOptions();
    const result = await membersSubCmd.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Team not found');
  });
});

// ============================================================================
// Team Root Command Tests
// ============================================================================

describe('team root command', () => {
  test('defaults to list when no subcommand', async () => {
    await createTestTeam('Engineering');

    const options = createTestOptions();
    const result = await teamCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await teamCommand.handler(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unknown subcommand');
  });
});

// ============================================================================
// Multi-Membership E2E Tests
// ============================================================================

describe('team multi-membership scenarios', () => {
  const addSubCmd = teamCommand.subcommands!['add'];
  const listSubCmd = teamCommand.subcommands!['list'];
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('entity can belong to multiple teams', async () => {
    const team1Id = await createTestTeam('Frontend');
    const team2Id = await createTestTeam('Backend');
    const entityId = await createTestEntity('shared-user', 'agent');

    // Add entity to both teams
    await addSubCmd.handler([team1Id, entityId], createTestOptions());
    await addSubCmd.handler([team2Id, entityId], createTestOptions());

    // Check team1 members
    const team1Members = await membersSubCmd.handler([team1Id], createTestOptions({ json: true }));
    expect((team1Members.data as { members: string[] }).members).toContain(entityId);

    // Check team2 members
    const team2Members = await membersSubCmd.handler([team2Id], createTestOptions({ json: true }));
    expect((team2Members.data as { members: string[] }).members).toContain(entityId);

    // Filter by member should return both teams
    const listResult = await listSubCmd.handler([], createTestOptions({ member: entityId, json: true }));
    const teams = listResult.data as Team[];
    expect(teams.length).toBe(2);
    const teamIds = teams.map((t) => String(t.id));
    expect(teamIds).toContain(team1Id);
    expect(teamIds).toContain(team2Id);
  });

  test('removing from one team does not affect other teams', async () => {
    const team1Id = await createTestTeam('Design');
    const team2Id = await createTestTeam('UX');
    const entityId = await createTestEntity('multi-member', 'agent');

    // Add entity to both teams
    await addSubCmd.handler([team1Id, entityId], createTestOptions());
    await addSubCmd.handler([team2Id, entityId], createTestOptions());

    // Remove from team1
    const removeSubCmd = teamCommand.subcommands!['remove'];
    await removeSubCmd.handler([team1Id, entityId], createTestOptions());

    // Entity should be gone from team1
    const team1Members = await membersSubCmd.handler([team1Id], createTestOptions({ json: true }));
    expect((team1Members.data as { members: string[] }).members).not.toContain(entityId);

    // Entity should still be in team2
    const team2Members = await membersSubCmd.handler([team2Id], createTestOptions({ json: true }));
    expect((team2Members.data as { members: string[] }).members).toContain(entityId);
  });

  test('team with multiple member types (agents and humans)', async () => {
    const teamId = await createTestTeam('Hybrid Team');
    const humanId = await createTestEntity('john', 'human');
    const agentId = await createTestEntity('helper-agent', 'agent');

    // Add both types of members
    await addSubCmd.handler([teamId, humanId], createTestOptions());
    await addSubCmd.handler([teamId, agentId], createTestOptions());

    // Both should be members
    const members = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    const memberList = (members.data as { members: string[] }).members;
    expect(memberList).toContain(humanId);
    expect(memberList).toContain(agentId);
    expect(memberList.length).toBe(2);
  });
});

// ============================================================================
// Team Lifecycle E2E Tests
// ============================================================================

describe('team lifecycle scenarios', () => {
  const createSubCmd = teamCommand.subcommands!['create'];
  const addSubCmd = teamCommand.subcommands!['add'];
  const removeSubCmd = teamCommand.subcommands!['remove'];
  const deleteSubCmd = teamCommand.subcommands!['delete'];
  const membersSubCmd = teamCommand.subcommands!['members'];
  const listSubCmd = teamCommand.subcommands!['list'];

  test('complete team lifecycle: create, add, remove, delete', async () => {
    // 0. Create test entities
    const entity1Id = await createTestEntity('lifecycle-user-1', 'human');
    const entity2Id = await createTestEntity('lifecycle-user-2', 'human');
    const entity3Id = await createTestEntity('lifecycle-user-3', 'human');

    // 1. Create team
    const createResult = await createSubCmd.handler([], createTestOptions({ name: 'Lifecycle Team' }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const teamId = (createResult.data as Team).id;

    // 2. Add members
    await addSubCmd.handler([teamId, entity1Id], createTestOptions());
    await addSubCmd.handler([teamId, entity2Id], createTestOptions());
    await addSubCmd.handler([teamId, entity3Id], createTestOptions());

    // 3. Verify members
    let membersResult = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    expect((membersResult.data as { count: number }).count).toBe(3);

    // 4. Remove a member
    await removeSubCmd.handler([teamId, entity2Id], createTestOptions());
    membersResult = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    expect((membersResult.data as { count: number }).count).toBe(2);
    expect((membersResult.data as { members: string[] }).members).not.toContain(entity2Id);

    // 5. Force delete (team has members)
    const deleteResult = await deleteSubCmd.handler([teamId], createTestOptions({ force: true }));
    expect(deleteResult.exitCode).toBe(ExitCode.SUCCESS);

    // 6. Verify team no longer appears in list
    const listResult = await listSubCmd.handler([], createTestOptions({ json: true }));
    const teams = listResult.data as Team[];
    expect(teams.find((t) => t.id === teamId)).toBeUndefined();
  });

  test('team creation with initial members and tags', async () => {
    const createResult = await createSubCmd.handler(
      [],
      createTestOptions({
        name: 'Full Config Team',
        member: ['el-lead', 'el-dev1', 'el-dev2'],
        tag: ['engineering', 'core'],
      })
    );

    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const team = createResult.data as Team;
    expect(team.members.map(String)).toContain('el-lead');
    expect(team.members.map(String)).toContain('el-dev1');
    expect(team.members.map(String)).toContain('el-dev2');
    expect(team.tags).toContain('engineering');
    expect(team.tags).toContain('core');
  });

  test('deleting team without force fails when members exist', async () => {
    const teamId = await createTestTeam('Protected Team', { member: ['el-member'] });

    const deleteResult = await deleteSubCmd.handler([teamId], createTestOptions());

    expect(deleteResult.exitCode).toBe(ExitCode.VALIDATION);
    expect(deleteResult.error).toContain('member');
    expect(deleteResult.error).toContain('--force');
  });

  test('deleting empty team succeeds without force', async () => {
    const teamId = await createTestTeam('Empty Team');

    const deleteResult = await deleteSubCmd.handler([teamId], createTestOptions());

    expect(deleteResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(deleteResult.message).toContain('Deleted');
  });

  test('delete with reason is recorded', async () => {
    const teamId = await createTestTeam('Reason Team');
    const reason = 'Project completed';

    const deleteResult = await deleteSubCmd.handler(
      [teamId],
      createTestOptions({ reason })
    );

    expect(deleteResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(deleteResult.message).toContain(reason);
  });
});

// ============================================================================
// Team Task Assignment E2E Tests
// ============================================================================

describe('team task assignment workflows', () => {
  test('tasks assigned to team appear in ready query for members', async () => {
    // This test uses the API directly since CLI doesn't expose ready query with team support
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { createTeam } = await import('@stoneforge/core');
    const { createTask } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create team with members
    const team = await createTeam({
      name: 'Work Pool',
      members: ['el-worker1' as EntityId, 'el-worker2' as EntityId],
      createdBy: 'test-user' as EntityId,
    });
    const createdTeam = await api.create(team as unknown as Element & Record<string, unknown>);

    // Create task assigned to team
    const task = await createTask({
      title: 'Team Task',
      assignee: createdTeam.id as unknown as EntityId,
      createdBy: 'test-user' as EntityId,
    });
    await api.create(task as unknown as Element & Record<string, unknown>);

    // Query ready tasks for worker1
    const readyTasks = await api.ready({ assignee: 'el-worker1' as EntityId });
    expect(readyTasks.length).toBe(1);
    expect(readyTasks[0].title).toBe('Team Task');

    // Query ready tasks for worker2
    const readyTasks2 = await api.ready({ assignee: 'el-worker2' as EntityId });
    expect(readyTasks2.length).toBe(1);

    // Non-member should not see task
    const readyTasks3 = await api.ready({ assignee: 'el-outsider' as EntityId });
    expect(readyTasks3.length).toBe(0);

    backend.close();
  });

  test('member can claim task from team', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { createTeam } = await import('@stoneforge/core');
    const { createTask } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create team
    const team = await createTeam({
      name: 'Claim Pool',
      members: ['el-claimer' as EntityId],
      createdBy: 'test-user' as EntityId,
    });
    const createdTeam = await api.create(team as unknown as Element & Record<string, unknown>);

    // Create task assigned to team
    const task = await createTask({
      title: 'Claimable Task',
      assignee: createdTeam.id as unknown as EntityId,
      createdBy: 'test-user' as EntityId,
    });
    const createdTask = await api.create(task as unknown as Element & Record<string, unknown>);

    // Claim task
    const claimed = await api.claimTaskFromTeam(
      createdTask.id,
      'el-claimer' as EntityId,
      { actor: 'el-claimer' as EntityId }
    );

    expect(String(claimed.assignee)).toBe('el-claimer');
    expect(claimed.metadata?.claimedFromTeam).toBe(createdTeam.id);

    backend.close();
  });

  test('non-member cannot claim task from team', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { createTeam } = await import('@stoneforge/core');
    const { createTask } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create team
    const team = await createTeam({
      name: 'Restricted Pool',
      members: ['el-member' as EntityId],
      createdBy: 'test-user' as EntityId,
    });
    const createdTeam = await api.create(team as unknown as Element & Record<string, unknown>);

    // Create task assigned to team
    const task = await createTask({
      title: 'Protected Task',
      assignee: createdTeam.id as unknown as EntityId,
      createdBy: 'test-user' as EntityId,
    });
    const createdTask = await api.create(task as unknown as Element & Record<string, unknown>);

    // Non-member tries to claim
    await expect(
      api.claimTaskFromTeam(
        createdTask.id,
        'el-outsider' as EntityId,
        { actor: 'el-outsider' as EntityId }
      )
    ).rejects.toThrow('Entity is not a member of the assigned team');

    backend.close();
  });

  test('team metrics reflect task completion', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { createTeam } = await import('@stoneforge/core');
    const { createTask, TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create team
    const team = await createTeam({
      name: 'Metrics Team',
      members: ['el-worker' as EntityId],
      createdBy: 'test-user' as EntityId,
    });
    const createdTeam = await api.create(team as unknown as Element & Record<string, unknown>);

    // Create tasks with different statuses
    const openTask = await createTask({
      title: 'Open Task',
      assignee: 'el-worker' as EntityId,
      createdBy: 'test-user' as EntityId,
    });
    await api.create(openTask as unknown as Element & Record<string, unknown>);

    const inProgressTask = await createTask({
      title: 'In Progress Task',
      assignee: 'el-worker' as EntityId,
      status: TaskStatus.IN_PROGRESS,
      createdBy: 'test-user' as EntityId,
    });
    await api.create(inProgressTask as unknown as Element & Record<string, unknown>);

    const closedTask = await createTask({
      title: 'Closed Task',
      assignee: 'el-worker' as EntityId,
      status: TaskStatus.CLOSED,
      createdBy: 'test-user' as EntityId,
    });
    await api.create(closedTask as unknown as Element & Record<string, unknown>);

    // Get metrics
    const metrics = await api.getTeamMetrics(createdTeam.id);

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.tasksCompleted).toBe(1);
    expect(metrics.tasksInProgress).toBe(1);

    backend.close();
  });
});

// ============================================================================
// Team Output Format Tests
// ============================================================================

describe('team command output formats', () => {
  const createSubCmd = teamCommand.subcommands!['create'];
  const listSubCmd = teamCommand.subcommands!['list'];
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('list command returns JSON when --json is set', async () => {
    await createTestTeam('JSON Team');

    const options = createTestOptions({ json: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.message).toBeUndefined();
  });

  test('create command returns ID only in quiet mode', async () => {
    const options = createTestOptions({ name: 'Quiet Team', quiet: true });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });

  test('members command returns count in JSON mode', async () => {
    const teamId = await createTestTeam('Count Team', { member: ['el-a', 'el-b'] });

    const options = createTestOptions({ json: true });
    const result = await membersSubCmd.handler([teamId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { count: number }).count).toBe(2);
    expect((result.data as { members: string[] }).members.length).toBe(2);
  });
});
