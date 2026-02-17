/**
 * Team Membership Integration Tests
 *
 * Tests for team membership and task operations:
 * - addTeamMember (with event recording)
 * - removeTeamMember (with event recording)
 * - getTasksForTeam
 * - claimTaskFromTeam
 * - getTeamMetrics
 * - Team-based assignee filtering in ready()
 * - Team deletion (soft delete)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Task, Team } from '@stoneforge/core';
import { createTeam, isDeleted, createTask, TaskStatus, MembershipEventType } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityA = 'el-user1' as EntityId;
const mockEntityB = 'el-user2' as EntityId;
const mockEntityC = 'el-user3' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

/**
 * Create a test team
 */
async function createTestTeam(
  overrides: Partial<Parameters<typeof createTeam>[0]> = {}
): Promise<Team> {
  return createTeam({
    name: 'Test Team',
    createdBy: mockEntityA,
    members: [],
    ...overrides,
  });
}

/**
 * Create a test task
 */
async function createTestTask(
  overrides: Partial<Parameters<typeof createTask>[0]> = {}
): Promise<Task> {
  return createTask({
    title: 'Test Task',
    createdBy: mockEntityA,
    ...overrides,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Team Membership Operations', () => {
  let backend: StorageBackend;
  let api: QuarryAPIImpl;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new QuarryAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // --------------------------------------------------------------------------
  // addTeamMember Tests
  // --------------------------------------------------------------------------

  describe('addTeamMember()', () => {
    it('should add a member to a team with event recording', async () => {
      const team = await createTestTeam();
      const created = await api.create(toCreateInput(team));

      const result = await api.addTeamMember(
        created.id,
        mockEntityB,
        { actor: mockEntityA }
      );

      expect(result.success).toBe(true);
      expect(result.team.members).toContain(mockEntityB);
      expect(result.entityId).toBe(mockEntityB);

      // Verify event was recorded
      const events = await api.getEvents(created.id);
      const memberAddedEvent = events.find(
        (e) => e.eventType === MembershipEventType.MEMBER_ADDED
      );
      expect(memberAddedEvent).toBeDefined();
      expect(memberAddedEvent?.actor).toBe(mockEntityA);
      expect((memberAddedEvent?.newValue as { addedMember: string })?.addedMember).toBe(mockEntityB);
    });

    it('should return success without change if entity is already a member', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const created = await api.create(toCreateInput(team));

      const result = await api.addTeamMember(
        created.id,
        mockEntityB,
        { actor: mockEntityA }
      );

      expect(result.success).toBe(true);
      expect(result.team.members).toContain(mockEntityB);
      expect(result.team.members.length).toBe(1);
    });

    it('should throw NotFoundError if team does not exist', async () => {
      await expect(
        api.addTeamMember('el-nonexistent' as ElementId, mockEntityB)
      ).rejects.toThrow('Team not found');
    });

    it('should throw ConstraintError if team is deleted', async () => {
      const team = await createTestTeam();
      const created = await api.create(toCreateInput(team));

      // Soft delete the team
      await api.delete(created.id, { actor: mockEntityA });

      await expect(
        api.addTeamMember(created.id, mockEntityB)
      ).rejects.toThrow('Cannot add member to a deleted team');
    });
  });

  // --------------------------------------------------------------------------
  // removeTeamMember Tests
  // --------------------------------------------------------------------------

  describe('removeTeamMember()', () => {
    it('should remove a member from a team with event recording', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const created = await api.create(toCreateInput(team));

      const result = await api.removeTeamMember(
        created.id,
        mockEntityB,
        { actor: mockEntityA, reason: 'Left the project' }
      );

      expect(result.success).toBe(true);
      expect(result.team.members).not.toContain(mockEntityB);
      expect(result.entityId).toBe(mockEntityB);

      // Verify event was recorded
      const events = await api.getEvents(created.id);
      const memberRemovedEvent = events.find(
        (e) => e.eventType === MembershipEventType.MEMBER_REMOVED
      );
      expect(memberRemovedEvent).toBeDefined();
      expect(memberRemovedEvent?.actor).toBe(mockEntityA);
      const newValue = memberRemovedEvent?.newValue as { removedMember: string; reason?: string };
      expect(newValue?.removedMember).toBe(mockEntityB);
      expect(newValue?.reason).toBe('Left the project');
    });

    it('should throw ConstraintError if entity is not a member', async () => {
      const team = await createTestTeam();
      const created = await api.create(toCreateInput(team));

      await expect(
        api.removeTeamMember(created.id, mockEntityB)
      ).rejects.toThrow('Entity is not a member of this team');
    });

    it('should throw ConstraintError if team is deleted', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const created = await api.create(toCreateInput(team));

      await api.delete(created.id, { actor: mockEntityA });

      await expect(
        api.removeTeamMember(created.id, mockEntityB)
      ).rejects.toThrow('Cannot remove member from a deleted team');
    });
  });

  // --------------------------------------------------------------------------
  // getTasksForTeam Tests
  // --------------------------------------------------------------------------

  describe('getTasksForTeam()', () => {
    it('should return tasks assigned directly to the team', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Create task assigned to team
      const task = await createTestTask({
        assignee: createdTeam.id as unknown as EntityId,
      });
      await api.create(toCreateInput(task));

      const tasks = await api.getTasksForTeam(createdTeam.id);

      expect(tasks.length).toBe(1);
      // Assignee comparison - IDs may differ in format
      expect(tasks[0].assignee).toBe(createdTeam.id as unknown as EntityId);
    });

    it('should return tasks assigned to team members', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Create task assigned to a team member
      const task = await createTestTask({ assignee: mockEntityB });
      await api.create(toCreateInput(task));

      const tasks = await api.getTasksForTeam(createdTeam.id);

      expect(tasks.length).toBe(1);
      expect(tasks[0].assignee).toBe(mockEntityB);
    });

    it('should return both team-assigned and member-assigned tasks', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Task assigned to team
      const task1 = await createTestTask({
        title: 'Team Task',
        assignee: createdTeam.id as unknown as EntityId,
      });
      await api.create(toCreateInput(task1));

      // Task assigned to member
      const task2 = await createTestTask({
        title: 'Member Task',
        assignee: mockEntityB,
      });
      await api.create(toCreateInput(task2));

      const tasks = await api.getTasksForTeam(createdTeam.id);

      expect(tasks.length).toBe(2);
    });

    it('should throw NotFoundError if team does not exist', async () => {
      await expect(
        api.getTasksForTeam('el-nonexistent' as ElementId)
      ).rejects.toThrow('Team not found');
    });
  });

  // --------------------------------------------------------------------------
  // claimTaskFromTeam Tests
  // --------------------------------------------------------------------------

  describe('claimTaskFromTeam()', () => {
    it('should transfer task assignee from team to claiming member', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Create task assigned to team
      const task = await createTestTask({
        assignee: createdTeam.id as unknown as EntityId,
      });
      const createdTask = await api.create(toCreateInput(task));

      const claimed = await api.claimTaskFromTeam(
        createdTask.id,
        mockEntityB,
        { actor: mockEntityB }
      );

      expect(claimed.assignee).toBe(mockEntityB);
      expect(claimed.metadata?.claimedFromTeam).toBe(createdTeam.id);
    });

    it('should throw ValidationError if task has no assignee', async () => {
      const task = await createTestTask();
      const createdTask = await api.create(toCreateInput(task));

      await expect(
        api.claimTaskFromTeam(createdTask.id, mockEntityB)
      ).rejects.toThrow('Task has no assignee to claim from');
    });

    it('should throw ConstraintError if task is not assigned to a team', async () => {
      const task = await createTestTask({ assignee: mockEntityA });
      const createdTask = await api.create(toCreateInput(task));

      await expect(
        api.claimTaskFromTeam(createdTask.id, mockEntityB)
      ).rejects.toThrow('Task is not assigned to a team');
    });

    it('should throw ConstraintError if entity is not a team member', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      const task = await createTestTask({
        assignee: createdTeam.id as unknown as EntityId,
      });
      const createdTask = await api.create(toCreateInput(task));

      await expect(
        api.claimTaskFromTeam(createdTask.id, mockEntityC)
      ).rejects.toThrow('Entity is not a member of the assigned team');
    });
  });

  // --------------------------------------------------------------------------
  // getTeamMetrics Tests
  // --------------------------------------------------------------------------

  describe('getTeamMetrics()', () => {
    it('should return aggregated metrics for a team', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Create tasks with different statuses
      const task1 = await createTestTask({
        title: 'Closed Task',
        assignee: mockEntityB,
        status: TaskStatus.CLOSED,
      });
      await api.create(toCreateInput(task1));

      const task2 = await createTestTask({
        title: 'In Progress Task',
        assignee: mockEntityB,
        status: TaskStatus.IN_PROGRESS,
      });
      await api.create(toCreateInput(task2));

      const task3 = await createTestTask({
        title: 'Team Assigned Task',
        assignee: createdTeam.id as unknown as EntityId,
      });
      await api.create(toCreateInput(task3));

      const metrics = await api.getTeamMetrics(createdTeam.id);

      expect(metrics.teamId).toBe(createdTeam.id);
      expect(metrics.totalTasks).toBe(3);
      expect(metrics.tasksCompleted).toBe(1);
      expect(metrics.tasksInProgress).toBe(1);
      expect(metrics.tasksAssignedToTeam).toBe(1);
    });

    it('should return null average cycle time when no closed tasks with closedAt', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Task marked closed but without closedAt timestamp
      const task = await createTestTask({
        title: 'Closed Task',
        assignee: mockEntityB,
        status: TaskStatus.CLOSED,
      });
      await api.create(toCreateInput(task));

      const metrics = await api.getTeamMetrics(createdTeam.id);

      // Without closedAt, cycle time cannot be calculated
      expect(metrics.averageCycleTimeMs).toBeNull();
    });

    it('should return null average cycle time when no tasks', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      const metrics = await api.getTeamMetrics(createdTeam.id);

      expect(metrics.averageCycleTimeMs).toBeNull();
    });

    it('should throw NotFoundError if team does not exist', async () => {
      await expect(
        api.getTeamMetrics('el-nonexistent' as ElementId)
      ).rejects.toThrow('Team not found');
    });
  });

  // --------------------------------------------------------------------------
  // Team-based Ready Tasks Filtering Tests
  // --------------------------------------------------------------------------

  describe('ready() with team-based filtering', () => {
    it('should include tasks assigned to teams the entity belongs to', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Create task assigned to team
      const task = await createTestTask({
        assignee: createdTeam.id as unknown as EntityId,
      });
      await api.create(toCreateInput(task));

      // Filter by entityB (who is a team member)
      const readyTasks = await api.ready({ assignee: mockEntityB });

      expect(readyTasks.length).toBe(1);
    });

    it('should include both personal and team tasks', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Task assigned to team
      const task1 = await createTestTask({
        title: 'Team Task',
        assignee: createdTeam.id as unknown as EntityId,
      });
      await api.create(toCreateInput(task1));

      // Task assigned directly to entity
      const task2 = await createTestTask({
        title: 'Personal Task',
        assignee: mockEntityB,
      });
      await api.create(toCreateInput(task2));

      const readyTasks = await api.ready({ assignee: mockEntityB });

      expect(readyTasks.length).toBe(2);
    });

    it('should not include team tasks for non-members', async () => {
      const team = await createTestTeam({ members: [mockEntityB] });
      const createdTeam = await api.create(toCreateInput(team));

      // Task assigned to team
      const task = await createTestTask({
        assignee: createdTeam.id as unknown as EntityId,
      });
      await api.create(toCreateInput(task));

      // Filter by entityC (who is NOT a team member)
      const readyTasks = await api.ready({ assignee: mockEntityC });

      expect(readyTasks.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Team Deletion Tests
  // --------------------------------------------------------------------------

  describe('Team deletion (soft delete)', () => {
    it('should soft delete a team', async () => {
      const team = await createTestTeam();
      const created = await api.create(toCreateInput(team));

      await api.delete(created.id, { actor: mockEntityA, reason: 'No longer needed' });

      // Team should still be retrievable but marked as deleted
      const deleted = await api.get<Team>(created.id);
      expect(deleted).toBeDefined();
      expect(isDeleted(deleted!)).toBe(true);
    });

    it('should not include deleted teams in list queries by default', async () => {
      const team = await createTestTeam();
      const created = await api.create(toCreateInput(team));

      await api.delete(created.id, { actor: mockEntityA });

      // Team should not appear in list queries
      const teams = await api.list<Team>({ type: 'team' });
      const found = teams.find((t) => t.id === created.id);
      expect(found).toBeUndefined();
    });

    it('should include deleted teams in list when includeDeleted is true', async () => {
      const team = await createTestTeam();
      const created = await api.create(toCreateInput(team));

      await api.delete(created.id, { actor: mockEntityA });

      // Team should appear with includeDeleted option
      const teams = await api.list<Team>({ type: 'team', includeDeleted: true });
      const found = teams.find((t) => t.id === created.id);
      expect(found).toBeDefined();
    });

    it('should record deletion event', async () => {
      const team = await createTestTeam();
      const created = await api.create(toCreateInput(team));

      await api.delete(created.id, { actor: mockEntityA, reason: 'Test deletion' });

      // Check for deletion event
      const events = await api.getEvents(created.id);
      const deleteEvent = events.find((e) => e.eventType === 'deleted');
      expect(deleteEvent).toBeDefined();
      expect(deleteEvent?.actor).toBe(mockEntityA);
    });
  });
});
