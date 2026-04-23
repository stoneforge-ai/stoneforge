/**
 * Workflow Query Integration Tests
 *
 * Tests for workflow-related query operations:
 * - getTasksInWorkflow: List all tasks in a workflow
 * - getReadyTasksInWorkflow: List ready tasks in a workflow
 * - getWorkflowProgress: Get progress metrics for a workflow
 * - Ephemeral filtering in ready() queries
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QuarryAPIImpl } from './quarry-api.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import type { StorageBackend } from '@stoneforge/storage';
import type { Element, ElementId, EntityId, Task, Workflow, Playbook } from '@stoneforge/core';
import {
  createTask,
  Priority,
  TaskStatus,
  createWorkflow,
  WorkflowStatus,
  DependencyType,
  createPlaybook,
  VariableType,
  createWorkflowFromPlaybook,
  computeWorkflowStatus,
} from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T extends Element>(element: T): Parameters<QuarryAPIImpl['create']>[0] {
  return element as unknown as Parameters<QuarryAPIImpl['create']>[0];
}

/**
 * Create a test task element
 */
async function createTestTask(overrides: Partial<Parameters<typeof createTask>[0]> = {}): Promise<Task> {
  return createTask({
    title: 'Test Task',
    createdBy: mockEntityId,
    ...overrides,
  });
}

/**
 * Create a test workflow element
 */
async function createTestWorkflow(overrides: Partial<Parameters<typeof createWorkflow>[0]> = {}): Promise<Workflow> {
  return createWorkflow({
    title: 'Test Workflow',
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Workflow Query Integration', () => {
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

  // ==========================================================================
  // getTasksInWorkflow Tests
  // ==========================================================================

  describe('getTasksInWorkflow', () => {
    it('should return empty array for workflow with no tasks', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const tasks = await api.getTasksInWorkflow(workflow.id);
      expect(tasks).toHaveLength(0);
    });

    it('should return tasks linked to workflow via parent-child dependency', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Link tasks to workflow
      await api.addDependency({
        blockedId: task1.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: task2.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const tasks = await api.getTasksInWorkflow(workflow.id);
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.id)).toContain(task1.id);
      expect(tasks.map((t) => t.id)).toContain(task2.id);
    });

    it('should filter tasks by status', async () => {
      // Use a completed workflow so tasks aren't blocked by parent
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      const createdWorkflow = await api.create(toCreateInput(workflow));

      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });
      const createdOpenTask = await api.create(toCreateInput(openTask));
      const createdClosedTask = await api.create(toCreateInput(closedTask));

      await api.addDependency({
        blockedId: createdOpenTask.id,
        blockerId: createdWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: createdClosedTask.id,
        blockerId: createdWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const openTasks = await api.getTasksInWorkflow(createdWorkflow.id, { status: TaskStatus.OPEN });
      expect(openTasks).toHaveLength(1);
      expect(openTasks[0].id).toBe(createdOpenTask.id);

      const closedTasks = await api.getTasksInWorkflow(createdWorkflow.id, { status: TaskStatus.CLOSED });
      expect(closedTasks).toHaveLength(1);
      expect(closedTasks[0].id).toBe(createdClosedTask.id);
    });

    it('should filter tasks by priority', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const highPriorityTask = await createTestTask({ title: 'High Priority', priority: Priority.CRITICAL });
      const lowPriorityTask = await createTestTask({ title: 'Low Priority', priority: Priority.MINIMAL });
      await api.create(toCreateInput(highPriorityTask));
      await api.create(toCreateInput(lowPriorityTask));

      await api.addDependency({
        blockedId: highPriorityTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: lowPriorityTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const criticalTasks = await api.getTasksInWorkflow(workflow.id, { priority: Priority.CRITICAL });
      expect(criticalTasks).toHaveLength(1);
      expect(criticalTasks[0].id).toBe(highPriorityTask.id);
    });

    it('should filter tasks by assignee', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const assignedTask = await createTestTask({ title: 'Assigned', assignee: 'user:alice' as EntityId });
      const unassignedTask = await createTestTask({ title: 'Unassigned' });
      await api.create(toCreateInput(assignedTask));
      await api.create(toCreateInput(unassignedTask));

      await api.addDependency({
        blockedId: assignedTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: unassignedTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const aliceTasks = await api.getTasksInWorkflow(workflow.id, { assignee: 'user:alice' as EntityId });
      expect(aliceTasks).toHaveLength(1);
      expect(aliceTasks[0].id).toBe(assignedTask.id);
    });

    it('should throw NotFoundError for non-existent workflow', async () => {
      await expect(api.getTasksInWorkflow('el-nonexistent' as ElementId)).rejects.toThrow('Workflow not found');
    });

    it('should throw ConstraintError for non-workflow element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(api.getTasksInWorkflow(task.id)).rejects.toThrow('is not a workflow');
    });

    it('should exclude tombstone tasks by default', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const activeTask = await createTestTask({ title: 'Active Task' });
      const tombstoneTask = await createTestTask({ title: 'Tombstone Task', status: TaskStatus.TOMBSTONE });
      await api.create(toCreateInput(activeTask));
      await api.create(toCreateInput(tombstoneTask));

      await api.addDependency({
        blockedId: activeTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: tombstoneTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const tasks = await api.getTasksInWorkflow(workflow.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(activeTask.id);
    });

    it('should include tombstone tasks when includeDeleted is true', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const activeTask = await createTestTask({ title: 'Active Task' });
      const tombstoneTask = await createTestTask({ title: 'Tombstone Task', status: TaskStatus.TOMBSTONE });
      await api.create(toCreateInput(activeTask));
      await api.create(toCreateInput(tombstoneTask));

      await api.addDependency({
        blockedId: activeTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: tombstoneTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const tasks = await api.getTasksInWorkflow(workflow.id, { includeDeleted: true });
      expect(tasks).toHaveLength(2);
    });
  });

  // ==========================================================================
  // getReadyTasksInWorkflow Tests
  // ==========================================================================

  describe('getReadyTasksInWorkflow', () => {
    it('should return only open/in_progress tasks that are not blocked', async () => {
      // Use a completed workflow so tasks aren't blocked by parent status
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const readyTask = await createTestTask({ title: 'Ready Task', status: TaskStatus.OPEN });
      const blockerTask = await createTestTask({ title: 'Blocker Task', status: TaskStatus.OPEN });
      const blockedTask = await createTestTask({ title: 'Blocked Task', status: TaskStatus.OPEN });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(readyTask));
      await api.create(toCreateInput(blockerTask));
      await api.create(toCreateInput(blockedTask));
      await api.create(toCreateInput(closedTask));

      // Link all tasks to workflow
      for (const task of [readyTask, blockerTask, blockedTask, closedTask]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      // Add blocking dependency: blockerTask blocks blockedTask - blockedTask waits for blockerTask to close
      await api.addDependency({
        blockerId: blockerTask.id,
        blockedId: blockedTask.id,
        type: DependencyType.BLOCKS,
      });

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id);
      expect(readyTasks).toHaveLength(2);
      expect(readyTasks.map((t) => t.id)).toContain(readyTask.id);
      expect(readyTasks.map((t) => t.id)).toContain(blockerTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(blockedTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(closedTask.id);
    });

    it('should filter out tasks scheduled for the future', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const nowTask = await createTestTask({ title: 'Now Task' });
      const futureTask = await createTestTask({
        title: 'Future Task',
        scheduledFor: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
      });

      await api.create(toCreateInput(nowTask));
      await api.create(toCreateInput(futureTask));

      await api.addDependency({
        blockedId: nowTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: futureTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].id).toBe(nowTask.id);
    });

    it('should respect limit filter', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create 5 tasks
      for (let i = 0; i < 5; i++) {
        const task = await createTestTask({ title: `Task ${i}`, priority: Priority.MEDIUM });
        await api.create(toCreateInput(task));
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id, { limit: 2 });
      expect(readyTasks).toHaveLength(2);
    });

    it('should sort by priority', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const lowTask = await createTestTask({ title: 'Low Priority', priority: Priority.MINIMAL });
      const highTask = await createTestTask({ title: 'High Priority', priority: Priority.CRITICAL });

      await api.create(toCreateInput(lowTask));
      await api.create(toCreateInput(highTask));

      await api.addDependency({
        blockedId: lowTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: highTask.id,
        blockerId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id);
      // Higher priority should come first (lower number = higher priority)
      expect(readyTasks).toHaveLength(2);
      expect(readyTasks[0].priority).toBeLessThanOrEqual(readyTasks[1].priority);
    });
  });

  // ==========================================================================
  // getWorkflowProgress Tests
  // ==========================================================================

  describe('getWorkflowProgress', () => {
    it('should return correct progress for empty workflow', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const progress = await api.getWorkflowProgress(workflow.id);
      expect(progress.workflowId).toBe(workflow.id);
      expect(progress.totalTasks).toBe(0);
      expect(progress.completionPercentage).toBe(0);
      expect(progress.readyTasks).toBe(0);
      expect(progress.blockedTasks).toBe(0);
    });

    it('should calculate correct completion percentage', async () => {
      // Use completed workflow so tasks statuses are preserved
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create 4 tasks: 2 closed, 2 open
      const closedTask1 = await createTestTask({ title: 'Closed 1', status: TaskStatus.CLOSED });
      const closedTask2 = await createTestTask({ title: 'Closed 2', status: TaskStatus.CLOSED });
      const openTask1 = await createTestTask({ title: 'Open 1', status: TaskStatus.OPEN });
      const openTask2 = await createTestTask({ title: 'Open 2', status: TaskStatus.OPEN });

      for (const task of [closedTask1, closedTask2, openTask1, openTask2]) {
        await api.create(toCreateInput(task));
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      const progress = await api.getWorkflowProgress(workflow.id);
      expect(progress.totalTasks).toBe(4);
      expect(progress.completionPercentage).toBe(50); // 2/4 = 50%
      expect(progress.statusCounts.closed).toBe(2);
      expect(progress.statusCounts.open).toBe(2);
    });

    it('should count ready and blocked tasks correctly', async () => {
      // Use completed workflow
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const readyTask = await createTestTask({ title: 'Ready Task', status: TaskStatus.OPEN });
      const blockerTask = await createTestTask({ title: 'Blocker Task', status: TaskStatus.OPEN });
      const blockedTask = await createTestTask({ title: 'Blocked Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(readyTask));
      await api.create(toCreateInput(blockerTask));
      await api.create(toCreateInput(blockedTask));

      for (const task of [readyTask, blockerTask, blockedTask]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      // Add blocking dependency: blockerTask blocks blockedTask - blockedTask waits for blockerTask to close
      await api.addDependency({
        blockerId: blockerTask.id,
        blockedId: blockedTask.id,
        type: DependencyType.BLOCKS,
      });

      const progress = await api.getWorkflowProgress(workflow.id);
      expect(progress.totalTasks).toBe(3);
      expect(progress.readyTasks).toBe(2); // readyTask and blockerTask
      expect(progress.blockedTasks).toBe(1); // blockedTask
    });

    it('should throw NotFoundError for non-existent workflow', async () => {
      await expect(api.getWorkflowProgress('el-nonexistent' as ElementId)).rejects.toThrow('Workflow not found');
    });
  });

  // ==========================================================================
  // Ephemeral Filtering Tests
  // ==========================================================================

  describe('Ephemeral Filtering', () => {
    it('should exclude ephemeral workflow tasks from ready() by default', async () => {
      // Create an ephemeral workflow
      const ephemeralWorkflow = await createTestWorkflow({
        title: 'Ephemeral Workflow',
        ephemeral: true,
        status: WorkflowStatus.COMPLETED, // Completed so tasks aren't blocked
      });
      await api.create(toCreateInput(ephemeralWorkflow));

      // Create a durable workflow
      const durableWorkflow = await createTestWorkflow({
        title: 'Durable Workflow',
        ephemeral: false,
        status: WorkflowStatus.COMPLETED,
      });
      await api.create(toCreateInput(durableWorkflow));

      // Create tasks for each workflow
      const ephemeralTask = await createTestTask({ title: 'Ephemeral Task' });
      const durableTask = await createTestTask({ title: 'Durable Task' });
      const standaloneTask = await createTestTask({ title: 'Standalone Task' });

      await api.create(toCreateInput(ephemeralTask));
      await api.create(toCreateInput(durableTask));
      await api.create(toCreateInput(standaloneTask));

      // Link tasks to workflows
      await api.addDependency({
        blockedId: ephemeralTask.id,
        blockerId: ephemeralWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        blockedId: durableTask.id,
        blockerId: durableWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Check ready() without includeEphemeral
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(ephemeralTask.id);
      expect(readyTasks.map((t) => t.id)).toContain(durableTask.id);
      expect(readyTasks.map((t) => t.id)).toContain(standaloneTask.id);
    });

    it('should include ephemeral workflow tasks when includeEphemeral is true', async () => {
      // Create an ephemeral workflow
      const ephemeralWorkflow = await createTestWorkflow({
        title: 'Ephemeral Workflow',
        ephemeral: true,
        status: WorkflowStatus.COMPLETED, // Completed so tasks aren't blocked
      });
      await api.create(toCreateInput(ephemeralWorkflow));

      // Create a task for the ephemeral workflow
      const ephemeralTask = await createTestTask({ title: 'Ephemeral Task' });
      await api.create(toCreateInput(ephemeralTask));

      await api.addDependency({
        blockedId: ephemeralTask.id,
        blockerId: ephemeralWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Check ready() with includeEphemeral
      const readyTasks = await api.ready({ includeEphemeral: true });
      expect(readyTasks.map((t) => t.id)).toContain(ephemeralTask.id);
    });
  });

  // ==========================================================================
  // Full Create Flow Integration Tests
  // ==========================================================================

  describe('Full Create Flow Integration', () => {
    /**
     * Helper to create a test playbook
     */
    async function createTestPlaybook(
      overrides: Partial<Parameters<typeof createPlaybook>[0]> = {}
    ): Promise<Playbook> {
      return createPlaybook({
        name: 'test_playbook',
        title: 'Test Playbook',
        createdBy: mockEntityId,
        steps: [],
        variables: [],
        ...overrides,
      });
    }

    /**
     * Helper to persist create result to database
     */
    async function persistCreateResult(
      createResult: Awaited<ReturnType<typeof createWorkflowFromPlaybook>>
    ): Promise<void> {
      // Create workflow
      await api.create(toCreateInput(createResult.workflow));

      // Create tasks
      for (const { task } of createResult.tasks) {
        await api.create(toCreateInput(task));
      }

      // Create parent-child dependencies
      for (const dep of createResult.parentChildDependencies) {
        await api.addDependency({
          blockedId: dep.blockedId,
          blockerId: dep.blockerId,
          type: dep.type,
        });
      }

      // Create blocks dependencies - createWorkflowFromPlaybook uses correct semantics:
      // blockerId=blocker, blockedId=blocked (blocked waits for blocker to close)
      for (const dep of createResult.blocksDependencies) {
        await api.addDependency({
          blockerId: dep.blockerId,  // blocker task
          blockedId: dep.blockedId,  // blocked task (waits for blocker)
          type: dep.type,
        });
      }
    }

    it('should create workflow with steps and persist to database', async () => {
      const playbook = await createTestPlaybook({
        title: 'Deployment Pipeline',
        steps: [
          { id: 'setup', title: 'Setup Environment' },
          { id: 'build', title: 'Build Application' },
          { id: 'test', title: 'Run Tests' },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Verify workflow was created
      const workflow = await api.get(createResult.workflow.id);
      expect(workflow.type).toBe('workflow');
      expect(workflow.title).toBe('Deployment Pipeline');

      // Verify all tasks were created
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.title)).toContain('Setup Environment');
      expect(tasks.map((t) => t.title)).toContain('Build Application');
      expect(tasks.map((t) => t.title)).toContain('Run Tests');
    });

    it('should create workflow with dependencies and verify blocked/ready tasks', async () => {
      const playbook = await createTestPlaybook({
        title: 'Sequential Pipeline',
        steps: [
          { id: 'setup', title: 'Setup' },
          { id: 'build', title: 'Build', dependsOn: ['setup'] },
          { id: 'test', title: 'Test', dependsOn: ['build'] },
          { id: 'deploy', title: 'Deploy', dependsOn: ['test'] },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Verify dependency chain
      expect(createResult.blocksDependencies).toHaveLength(3);

      // Update workflow to COMPLETED so tasks aren't blocked by parent-child dependency
      await api.update(createResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Get ready tasks - only 'setup' should be ready (others blocked by step dependencies)
      const readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('Setup');

      // Get progress
      const progress = await api.getWorkflowProgress(createResult.workflow.id);
      expect(progress.totalTasks).toBe(4);
      expect(progress.readyTasks).toBe(1);
      expect(progress.blockedTasks).toBe(3);
    });

    it('should create workflow with variables and verify substitution in persisted data', async () => {
      const playbook = await createTestPlaybook({
        title: 'Deploy {{environment}}',
        variables: [
          { name: 'environment', type: VariableType.STRING, required: true },
          { name: 'version', type: VariableType.STRING, required: false, default: '1.0.0' },
        ],
        steps: [
          { id: 'deploy', title: 'Deploy {{version}} to {{environment}}' },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: { environment: 'production', version: '2.0.0' },
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Verify workflow title has substitution
      const workflow = await api.get(createResult.workflow.id);
      expect(workflow.title).toBe('Deploy production');

      // Verify task title has substitution
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks[0].title).toBe('Deploy 2.0.0 to production');

      // Verify variables stored in workflow
      expect((workflow as Workflow).variables).toEqual({ environment: 'production', version: '2.0.0' });
    });

    it('should create workflow with conditions and verify filtered steps are not persisted', async () => {
      const playbook = await createTestPlaybook({
        title: 'Conditional Pipeline',
        variables: [
          { name: 'runTests', type: VariableType.BOOLEAN, required: false, default: true },
          { name: 'runLint', type: VariableType.BOOLEAN, required: false, default: false },
        ],
        steps: [
          { id: 'build', title: 'Build' },
          { id: 'test', title: 'Run Tests', condition: '{{runTests}}' },
          { id: 'lint', title: 'Run Linting', condition: '{{runLint}}' },
          { id: 'deploy', title: 'Deploy' },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: { runTests: true, runLint: false },
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Verify skipped steps
      expect(createResult.skippedSteps).toEqual(['lint']);

      // Verify only non-skipped tasks were created
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.title)).toContain('Build');
      expect(tasks.map((t) => t.title)).toContain('Run Tests');
      expect(tasks.map((t) => t.title)).toContain('Deploy');
      expect(tasks.map((t) => t.title)).not.toContain('Run Linting');
    });

    it('should create ephemeral workflow and verify ephemeral filtering', async () => {
      const playbook = await createTestPlaybook({
        title: 'Ephemeral Test',
        steps: [{ id: 'step1', title: 'Ephemeral Task' }],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
        ephemeral: true,
      });

      await persistCreateResult(createResult);

      // Verify workflow is ephemeral
      const workflow = await api.get(createResult.workflow.id) as Workflow;
      expect(workflow.ephemeral).toBe(true);

      // Update workflow status to COMPLETED so tasks aren't blocked by parent-child
      await api.update(createResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Ephemeral tasks should not appear in regular ready() query
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(createResult.tasks[0].task.id);

      // But should appear with includeEphemeral flag
      const allReadyTasks = await api.ready({ includeEphemeral: true });
      expect(allReadyTasks.map((t) => t.id)).toContain(createResult.tasks[0].task.id);
    });

    it('should create workflow and verify hierarchical task IDs', async () => {
      const playbook = await createTestPlaybook({
        title: 'Hierarchical IDs Test',
        steps: [
          { id: 'step1', title: 'First Step' },
          { id: 'step2', title: 'Second Step' },
          { id: 'step3', title: 'Third Step' },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Verify hierarchical IDs
      const workflowId = createResult.workflow.id;
      expect(createResult.tasks[0].task.id).toBe(`${workflowId}.1`);
      expect(createResult.tasks[1].task.id).toBe(`${workflowId}.2`);
      expect(createResult.tasks[2].task.id).toBe(`${workflowId}.3`);

      // Verify tasks are queryable by their hierarchical IDs
      for (const { task } of createResult.tasks) {
        const retrieved = await api.get(task.id);
        expect(retrieved).toBeDefined();
        expect(retrieved.id).toBe(task.id);
      }
    });

    it('should create workflow with task priority and complexity from steps', async () => {
      const playbook = await createTestPlaybook({
        title: 'Priority Test',
        steps: [
          { id: 'critical', title: 'Critical Task', priority: 1, complexity: 5 },
          { id: 'normal', title: 'Normal Task', priority: 3, complexity: 2 },
          { id: 'minimal', title: 'Minimal Task', priority: 5, complexity: 1 },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Update workflow status to COMPLETED so tasks aren't blocked by parent-child
      await api.update(createResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Verify priority and complexity were set
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);

      const criticalTask = tasks.find((t) => t.title === 'Critical Task');
      expect(criticalTask?.priority).toBe(1);
      expect(criticalTask?.complexity).toBe(5);

      const normalTask = tasks.find((t) => t.title === 'Normal Task');
      expect(normalTask?.priority).toBe(3);
      expect(normalTask?.complexity).toBe(2);

      const minimalTask = tasks.find((t) => t.title === 'Minimal Task');
      expect(minimalTask?.priority).toBe(5);
      expect(minimalTask?.complexity).toBe(1);

      // Verify priority ordering in ready tasks
      const readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      // Should be sorted by priority (lower number = higher priority)
      expect(readyTasks[0].title).toBe('Critical Task');
    });

    it('should create workflow and track workflow status through task completion', async () => {
      const playbook = await createTestPlaybook({
        title: 'Status Tracking Test',
        steps: [
          { id: 'step1', title: 'First Task' },
          { id: 'step2', title: 'Second Task' },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Initial status should be pending
      let workflow = (await api.get(createResult.workflow.id)) as Workflow;
      expect(workflow.status).toBe(WorkflowStatus.PENDING);

      // Get task IDs
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);

      // Start first task (in_progress)
      await api.update(tasks[0].id, { status: TaskStatus.IN_PROGRESS });

      // Compute workflow status - should be RUNNING
      const tasksAfterStart = await api.getTasksInWorkflow(createResult.workflow.id);
      let computedStatus = computeWorkflowStatus(workflow, tasksAfterStart);
      expect(computedStatus).toBe(WorkflowStatus.RUNNING);

      // Close first task
      await api.update(tasks[0].id, { status: TaskStatus.CLOSED });

      // Update workflow to running status
      await api.update(createResult.workflow.id, { status: WorkflowStatus.RUNNING });
      workflow = (await api.get(createResult.workflow.id)) as Workflow;

      // Close second task
      await api.update(tasks[1].id, { status: TaskStatus.CLOSED });

      // Compute workflow status - should now be COMPLETED
      const tasksAfterComplete = await api.getTasksInWorkflow(createResult.workflow.id);
      computedStatus = computeWorkflowStatus(workflow, tasksAfterComplete);
      expect(computedStatus).toBe(WorkflowStatus.COMPLETED);
    });

    it('should create workflow with parallel tasks (diamond dependency pattern)', async () => {
      // Diamond pattern: start -> parallel1, parallel2 -> end
      const playbook = await createTestPlaybook({
        title: 'Diamond Pattern',
        steps: [
          { id: 'start', title: 'Start' },
          { id: 'parallel1', title: 'Parallel Task 1', dependsOn: ['start'] },
          { id: 'parallel2', title: 'Parallel Task 2', dependsOn: ['start'] },
          { id: 'end', title: 'End', dependsOn: ['parallel1', 'parallel2'] },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Verify dependencies (should have 4: start->p1, start->p2, p1->end, p2->end)
      expect(createResult.blocksDependencies).toHaveLength(4);

      // Update workflow to COMPLETED so tasks aren't blocked by parent-child
      await api.update(createResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Initially only 'start' should be ready
      let readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('Start');

      // Close 'start' task
      const startTask = createResult.tasks.find((t) => t.stepId === 'start')!;
      await api.update(startTask.task.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Now both parallel tasks should be ready
      readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      expect(readyTasks).toHaveLength(2);
      expect(readyTasks.map((t) => t.title)).toContain('Parallel Task 1');
      expect(readyTasks.map((t) => t.title)).toContain('Parallel Task 2');

      // Close one parallel task
      const parallel1 = createResult.tasks.find((t) => t.stepId === 'parallel1')!;
      await api.update(parallel1.task.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // 'end' should still be blocked
      readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('Parallel Task 2');

      // Close other parallel task
      const parallel2 = createResult.tasks.find((t) => t.stepId === 'parallel2')!;
      await api.update(parallel2.task.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Now 'end' should be ready
      readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('End');
    });

    it('should create workflow with assignee from step', async () => {
      const playbook = await createTestPlaybook({
        title: 'Assigned Tasks',
        variables: [
          { name: 'reviewer', type: VariableType.STRING, required: true },
        ],
        steps: [
          { id: 'dev', title: 'Development', assignee: 'user:developer' },
          { id: 'review', title: 'Review', assignee: '{{reviewer}}' },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: { reviewer: 'user:senior-dev' },
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);

      const devTask = tasks.find((t) => t.title === 'Development');
      expect(devTask?.assignee).toBe('user:developer');

      const reviewTask = tasks.find((t) => t.title === 'Review');
      expect(reviewTask?.assignee).toBe('user:senior-dev');
    });

    it('should create workflow with tags and metadata', async () => {
      const playbook = await createTestPlaybook({
        title: 'Tagged Workflow',
        steps: [{ id: 'step1', title: 'Task' }],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
        tags: ['deployment', 'production', 'v2-release'],
        metadata: { region: 'us-east-1', team: 'platform' },
      });

      await persistCreateResult(createResult);

      const workflow = (await api.get(createResult.workflow.id)) as Workflow;
      expect(workflow.tags).toEqual(['deployment', 'production', 'v2-release']);
      expect(workflow.metadata).toEqual({ region: 'us-east-1', team: 'platform' });
    });

    it('should handle workflow progress with mixed task statuses', async () => {
      const playbook = await createTestPlaybook({
        title: 'Progress Tracking',
        steps: [
          { id: 'step1', title: 'Task 1' },
          { id: 'step2', title: 'Task 2' },
          { id: 'step3', title: 'Task 3' },
          { id: 'step4', title: 'Task 4' },
        ],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistCreateResult(createResult);

      // Update workflow to COMPLETED so we can modify task statuses freely
      await api.update(createResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Set different statuses: 2 closed, 1 open, 1 in_progress
      await api.update(createResult.tasks[0].task.id, { status: TaskStatus.CLOSED } as Partial<Task>);
      await api.update(createResult.tasks[1].task.id, { status: TaskStatus.CLOSED } as Partial<Task>);
      await api.update(createResult.tasks[2].task.id, { status: TaskStatus.IN_PROGRESS } as Partial<Task>);
      // Task 4 stays open

      const progress = await api.getWorkflowProgress(createResult.workflow.id);
      expect(progress.totalTasks).toBe(4);
      expect(progress.completionPercentage).toBe(50); // 2/4
      expect(progress.statusCounts.closed).toBe(2);
      expect(progress.statusCounts.open).toBe(1);
      expect(progress.statusCounts.in_progress).toBe(1);
    });
  });

  // ==========================================================================
  // Playbook Inheritance Integration Tests
  // ==========================================================================

  describe('Playbook Inheritance Integration', () => {
    /**
     * Helper to create a test playbook (duplicated for this describe block)
     */
    async function createTestPlaybookWithInheritance(
      overrides: Partial<Parameters<typeof createPlaybook>[0]> = {}
    ): Promise<Playbook> {
      return createPlaybook({
        name: 'test_playbook',
        title: 'Test Playbook',
        createdBy: mockEntityId,
        steps: [],
        variables: [],
        ...overrides,
      });
    }

    /**
     * Helper to persist create result to database (duplicated for this describe block)
     */
    async function persistCreateResultWithInheritance(
      createResult: Awaited<ReturnType<typeof createWorkflowFromPlaybook>>
    ): Promise<void> {
      // Create workflow
      await api.create(toCreateInput(createResult.workflow));

      // Create tasks
      for (const { task } of createResult.tasks) {
        await api.create(toCreateInput(task));
      }

      // Create parent-child dependencies
      for (const dep of createResult.parentChildDependencies) {
        await api.addDependency({
          blockedId: dep.blockedId,
          blockerId: dep.blockerId,
          type: dep.type,
        });
      }

      // Create blocks dependencies - createWorkflowFromPlaybook uses correct semantics:
      // blockerId=blocker, blockedId=blocked (blocked waits for blocker to close)
      for (const dep of createResult.blocksDependencies) {
        await api.addDependency({
          blockerId: dep.blockerId,  // blocker task
          blockedId: dep.blockedId,  // blocked task (waits for blocker)
          type: dep.type,
        });
      }
    }

    /**
     * Create a playbook loader from an array of playbooks
     */
    function createTestLoader(playbooks: Playbook[]): (name: string) => Playbook | undefined {
      return (name: string) => playbooks.find(p => p.name.toLowerCase() === name.toLowerCase());
    }

    it('should create workflow with inherited steps from parent playbook', async () => {
      // Create parent playbook with base steps
      const parentPlaybook = await createTestPlaybookWithInheritance({
        name: 'base_pipeline',
        title: 'Base Pipeline',
        steps: [
          { id: 'setup', title: 'Setup Environment' },
          { id: 'build', title: 'Build', dependsOn: ['setup'] },
        ],
        variables: [
          { name: 'environment', type: VariableType.STRING, required: true },
        ],
      });

      // Create child playbook that extends parent and adds more steps
      // Note: dependsOn can only reference steps in the same playbook at creation time
      // Cross-inheritance dependencies are validated during create/resolution
      const childPlaybook = await createTestPlaybookWithInheritance({
        name: 'extended_pipeline',
        title: 'Extended Pipeline for {{environment}}',
        extends: ['base_pipeline'],
        steps: [
          { id: 'test', title: 'Run Tests' },
          { id: 'deploy', title: 'Deploy to {{environment}}', dependsOn: ['test'] },
        ],
        variables: [
          { name: 'region', type: VariableType.STRING, required: false, default: 'us-east-1' },
        ],
      });

      const loader = createTestLoader([parentPlaybook, childPlaybook]);

      const createResult = await createWorkflowFromPlaybook({
        playbook: childPlaybook,
        variables: { environment: 'production' },
        createdBy: mockEntityId,
        playbookLoader: loader,
      });

      await persistCreateResultWithInheritance(createResult);

      // Verify workflow title was substituted
      expect(createResult.workflow.title).toBe('Extended Pipeline for production');

      // Verify all 4 steps were created (2 from parent + 2 from child)
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(4);
      expect(tasks.map(t => t.title)).toContain('Setup Environment');
      expect(tasks.map(t => t.title)).toContain('Build');
      expect(tasks.map(t => t.title)).toContain('Run Tests');
      expect(tasks.map(t => t.title)).toContain('Deploy to production');

      // Verify variables from both playbooks were resolved
      expect(createResult.resolvedVariables.environment).toBe('production');
      expect(createResult.resolvedVariables.region).toBe('us-east-1');
    });

    it('should create workflow where child overrides parent variables and steps', async () => {
      // Parent playbook with a step and variable
      const parentPlaybook = await createTestPlaybookWithInheritance({
        name: 'parent_deploy',
        title: 'Parent Deployment',
        steps: [
          { id: 'deploy', title: 'Deploy version {{version}}', priority: 5 },
        ],
        variables: [
          { name: 'version', type: VariableType.STRING, required: false, default: '1.0.0' },
        ],
      });

      // Child overrides the variable default and the step
      const childPlaybook = await createTestPlaybookWithInheritance({
        name: 'child_deploy',
        title: 'Child Deployment',
        extends: ['parent_deploy'],
        steps: [
          { id: 'deploy', title: 'Deploy version {{version}} with hotfix', priority: 1 },
        ],
        variables: [
          { name: 'version', type: VariableType.STRING, required: false, default: '2.0.0' },
        ],
      });

      const loader = createTestLoader([parentPlaybook, childPlaybook]);

      const createResult = await createWorkflowFromPlaybook({
        playbook: childPlaybook,
        variables: {},
        createdBy: mockEntityId,
        playbookLoader: loader,
      });

      await persistCreateResultWithInheritance(createResult);

      // Should only have 1 task (child overrides parent's step with same ID)
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Deploy version 2.0.0 with hotfix');
      expect(tasks[0].priority).toBe(1);

      // Child's default should be used
      expect(createResult.resolvedVariables.version).toBe('2.0.0');
    });

    it('should create workflow with deep inheritance chain (grandparent → parent → child)', async () => {
      const grandparentPlaybook = await createTestPlaybookWithInheritance({
        name: 'grandparent',
        title: 'Grandparent',
        steps: [
          { id: 'init', title: 'Initialize' },
        ],
        variables: [
          { name: 'base_var', type: VariableType.STRING, required: false, default: 'gp_value' },
        ],
      });

      const parentPlaybook = await createTestPlaybookWithInheritance({
        name: 'parent',
        title: 'Parent',
        extends: ['grandparent'],
        steps: [
          { id: 'middle', title: 'Middle Step' },
        ],
        variables: [
          { name: 'parent_var', type: VariableType.NUMBER, required: false, default: 42 },
        ],
      });

      const childPlaybook = await createTestPlaybookWithInheritance({
        name: 'child',
        title: 'Child',
        extends: ['parent'],
        steps: [
          { id: 'final', title: 'Final Step' },
        ],
        variables: [
          { name: 'child_var', type: VariableType.BOOLEAN, required: false, default: true },
        ],
      });

      const loader = createTestLoader([grandparentPlaybook, parentPlaybook, childPlaybook]);

      const createResult = await createWorkflowFromPlaybook({
        playbook: childPlaybook,
        variables: {},
        createdBy: mockEntityId,
        playbookLoader: loader,
      });

      await persistCreateResultWithInheritance(createResult);

      // Verify all 3 steps from the inheritance chain
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.title)).toContain('Initialize');
      expect(tasks.map(t => t.title)).toContain('Middle Step');
      expect(tasks.map(t => t.title)).toContain('Final Step');

      // Verify all variables from inheritance chain
      expect(createResult.resolvedVariables.base_var).toBe('gp_value');
      expect(createResult.resolvedVariables.parent_var).toBe(42);
      expect(createResult.resolvedVariables.child_var).toBe(true);

      // Update workflow to COMPLETED so tasks aren't blocked by parent-child
      await api.update(createResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // All 3 tasks should be ready since there are no inter-step dependencies
      const readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      expect(readyTasks).toHaveLength(3);
    });

    it('should create workflow with diamond inheritance pattern', async () => {
      // Diamond: base → [mixin1, mixin2] → child
      const basePlaybook = await createTestPlaybookWithInheritance({
        name: 'base',
        title: 'Base',
        steps: [
          { id: 'base_step', title: 'Base Step' },
        ],
        variables: [
          { name: 'shared', type: VariableType.STRING, required: false, default: 'base' },
        ],
      });

      const mixin1Playbook = await createTestPlaybookWithInheritance({
        name: 'mixin1',
        title: 'Mixin 1',
        extends: ['base'],
        steps: [
          { id: 'mixin1_step', title: 'Mixin 1 Step' },
        ],
        variables: [
          { name: 'shared', type: VariableType.STRING, required: false, default: 'mixin1' },
        ],
      });

      const mixin2Playbook = await createTestPlaybookWithInheritance({
        name: 'mixin2',
        title: 'Mixin 2',
        extends: ['base'],
        steps: [
          { id: 'mixin2_step', title: 'Mixin 2 Step' },
        ],
        variables: [
          { name: 'shared', type: VariableType.STRING, required: false, default: 'mixin2' },
        ],
      });

      const childPlaybook = await createTestPlaybookWithInheritance({
        name: 'diamond_child',
        title: 'Diamond Child',
        extends: ['mixin1', 'mixin2'],
        steps: [
          { id: 'child_step', title: 'Child Step' },
        ],
      });

      const loader = createTestLoader([basePlaybook, mixin1Playbook, mixin2Playbook, childPlaybook]);

      const createResult = await createWorkflowFromPlaybook({
        playbook: childPlaybook,
        variables: {},
        createdBy: mockEntityId,
        playbookLoader: loader,
      });

      await persistCreateResultWithInheritance(createResult);

      // Verify all 4 steps (base once + mixin1 + mixin2 + child)
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(4);
      expect(tasks.map(t => t.title)).toContain('Base Step');
      expect(tasks.map(t => t.title)).toContain('Mixin 1 Step');
      expect(tasks.map(t => t.title)).toContain('Mixin 2 Step');
      expect(tasks.map(t => t.title)).toContain('Child Step');

      // mixin2 comes after mixin1, so its override should win
      expect(createResult.resolvedVariables.shared).toBe('mixin2');
    });

    it('should create workflow with inherited conditions that filter steps', async () => {
      const parentPlaybook = await createTestPlaybookWithInheritance({
        name: 'conditional_parent',
        title: 'Conditional Parent',
        steps: [
          { id: 'always', title: 'Always Run' },
          { id: 'optional', title: 'Optional Step', condition: '{{includeOptional}}' },
        ],
        variables: [
          { name: 'includeOptional', type: VariableType.BOOLEAN, required: false, default: false },
        ],
      });

      const childPlaybook = await createTestPlaybookWithInheritance({
        name: 'conditional_child',
        title: 'Conditional Child',
        extends: ['conditional_parent'],
        steps: [
          { id: 'child_step', title: 'Child Step' },
        ],
      });

      const loader = createTestLoader([parentPlaybook, childPlaybook]);

      // Create with includeOptional = false (default)
      const createResult = await createWorkflowFromPlaybook({
        playbook: childPlaybook,
        variables: {},
        createdBy: mockEntityId,
        playbookLoader: loader,
      });

      await persistCreateResultWithInheritance(createResult);

      // Should have 2 tasks (always + child_step), optional should be skipped
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.title)).toContain('Always Run');
      expect(tasks.map(t => t.title)).toContain('Child Step');
      expect(tasks.map(t => t.title)).not.toContain('Optional Step');

      expect(createResult.skippedSteps).toContain('optional');
    });

    it('should create workflow with steps from both parent and child', async () => {
      // Test simpler case: parent and child each have their own steps
      const parentPlaybook = await createTestPlaybookWithInheritance({
        name: 'dep_parent',
        title: 'Dependency Parent',
        steps: [
          { id: 'parent_step', title: 'Parent Step' },
        ],
      });

      const childPlaybook = await createTestPlaybookWithInheritance({
        name: 'dep_child',
        title: 'Dependency Child',
        extends: ['dep_parent'],
        steps: [
          { id: 'child_step', title: 'Child Step' },
        ],
      });

      const loader = createTestLoader([parentPlaybook, childPlaybook]);

      const createResult = await createWorkflowFromPlaybook({
        playbook: childPlaybook,
        variables: {},
        createdBy: mockEntityId,
        playbookLoader: loader,
      });

      await persistCreateResultWithInheritance(createResult);

      // Verify both steps were created
      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.title)).toContain('Parent Step');
      expect(tasks.map(t => t.title)).toContain('Child Step');

      // Update workflow to COMPLETED so tasks aren't blocked by parent-child
      await api.update(createResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Both steps should be ready (no inter-step dependencies)
      const readyTasks = await api.getReadyTasksInWorkflow(createResult.workflow.id);
      expect(readyTasks).toHaveLength(2);
    });

    it('should create workflow with inherited assignee variable substitution', async () => {
      const parentPlaybook = await createTestPlaybookWithInheritance({
        name: 'assignee_parent',
        title: 'Assignee Parent',
        steps: [
          { id: 'task', title: 'Assigned Task', assignee: '{{defaultAssignee}}' },
        ],
        variables: [
          { name: 'defaultAssignee', type: VariableType.STRING, required: false, default: 'user:default' },
        ],
      });

      const childPlaybook = await createTestPlaybookWithInheritance({
        name: 'assignee_child',
        title: 'Assignee Child',
        extends: ['assignee_parent'],
        variables: [
          // Override the default assignee
          { name: 'defaultAssignee', type: VariableType.STRING, required: false, default: 'user:team-lead' },
        ],
      });

      const loader = createTestLoader([parentPlaybook, childPlaybook]);

      const createResult = await createWorkflowFromPlaybook({
        playbook: childPlaybook,
        variables: {},
        createdBy: mockEntityId,
        playbookLoader: loader,
      });

      await persistCreateResultWithInheritance(createResult);

      const tasks = await api.getTasksInWorkflow(createResult.workflow.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].assignee).toBe('user:team-lead');
    });
  });

  // ==========================================================================
  // getOrderedTasksInWorkflow Tests
  // ==========================================================================

  describe('getOrderedTasksInWorkflow', () => {
    it('should return empty array for workflow with no tasks', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const orderedTasks = await api.getOrderedTasksInWorkflow(workflow.id);
      expect(orderedTasks).toHaveLength(0);
    });

    it('should return tasks in topological order (blockers first)', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create tasks
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      const task3 = await createTestTask({ title: 'Task 3' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      // Link all tasks to workflow
      for (const task of [task1, task2, task3]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      // Create linear dependency chain: task1 blocks task2, task2 blocks task3
      // task1 -> task2 -> task3 (task2 waits for task1, task3 waits for task2)
      await api.addDependency({
        blockerId: task1.id,
        blockedId: task2.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockerId: task2.id,
        blockedId: task3.id,
        type: DependencyType.BLOCKS,
      });

      const orderedTasks = await api.getOrderedTasksInWorkflow(workflow.id);
      expect(orderedTasks).toHaveLength(3);
      // Tasks should be in order: task1 (blocker) first, then task2, then task3
      expect(orderedTasks[0].id).toBe(task1.id);
      expect(orderedTasks[1].id).toBe(task2.id);
      expect(orderedTasks[2].id).toBe(task3.id);
    });

    it('should return tasks for diamond dependency pattern in correct order', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Diamond: start -> [middle1, middle2] -> end
      const start = await createTestTask({ title: 'Start', priority: Priority.MEDIUM });
      const middle1 = await createTestTask({ title: 'Middle 1', priority: Priority.HIGH }); // Priority 2
      const middle2 = await createTestTask({ title: 'Middle 2', priority: Priority.MEDIUM }); // Priority 3
      const end = await createTestTask({ title: 'End', priority: Priority.MEDIUM });

      await api.create(toCreateInput(start));
      await api.create(toCreateInput(middle1));
      await api.create(toCreateInput(middle2));
      await api.create(toCreateInput(end));

      // Link all tasks to workflow
      for (const task of [start, middle1, middle2, end]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      // Create diamond dependencies
      // start blocks middle1 and middle2 (they wait for start to close)
      // middle1 and middle2 block end (end waits for both to close)
      await api.addDependency({
        blockerId: start.id,
        blockedId: middle1.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockerId: start.id,
        blockedId: middle2.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockerId: middle1.id,
        blockedId: end.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        blockerId: middle2.id,
        blockedId: end.id,
        type: DependencyType.BLOCKS,
      });

      const orderedTasks = await api.getOrderedTasksInWorkflow(workflow.id);
      expect(orderedTasks).toHaveLength(4);

      // Start should be first
      expect(orderedTasks[0].id).toBe(start.id);

      // Middle1 and middle2 should come before end
      const middleIndex1 = orderedTasks.findIndex((t) => t.id === middle1.id);
      const middleIndex2 = orderedTasks.findIndex((t) => t.id === middle2.id);
      const endIndex = orderedTasks.findIndex((t) => t.id === end.id);

      expect(middleIndex1).toBeLessThan(endIndex);
      expect(middleIndex2).toBeLessThan(endIndex);

      // End should be last
      expect(orderedTasks[3].id).toBe(end.id);
    });

    it('should sort independent tasks by priority', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create independent tasks with different priorities
      const lowPriority = await createTestTask({ title: 'Low Priority', priority: Priority.MINIMAL }); // 5
      const highPriority = await createTestTask({ title: 'High Priority', priority: Priority.CRITICAL }); // 1
      const mediumPriority = await createTestTask({ title: 'Medium Priority', priority: Priority.MEDIUM }); // 3

      await api.create(toCreateInput(lowPriority));
      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(mediumPriority));

      // Link all tasks to workflow (no blocks dependencies between them)
      for (const task of [lowPriority, highPriority, mediumPriority]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      const orderedTasks = await api.getOrderedTasksInWorkflow(workflow.id);
      expect(orderedTasks).toHaveLength(3);

      // Should be sorted by priority (lower number = higher priority)
      expect(orderedTasks[0].priority).toBe(Priority.CRITICAL);
      expect(orderedTasks[1].priority).toBe(Priority.MEDIUM);
      expect(orderedTasks[2].priority).toBe(Priority.MINIMAL);
    });

    it('should respect filters when ordering tasks', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create tasks with different statuses
      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });
      const inProgressTask = await createTestTask({ title: 'In Progress', status: TaskStatus.IN_PROGRESS });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(closedTask));
      await api.create(toCreateInput(inProgressTask));

      // Link all tasks to workflow
      for (const task of [openTask, closedTask, inProgressTask]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      // Filter only open tasks
      const orderedOpenTasks = await api.getOrderedTasksInWorkflow(workflow.id, {
        status: TaskStatus.OPEN,
      });
      expect(orderedOpenTasks).toHaveLength(1);
      expect(orderedOpenTasks[0].id).toBe(openTask.id);

      // Filter open and in_progress tasks
      const orderedActiveTasks = await api.getOrderedTasksInWorkflow(workflow.id, {
        status: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
      });
      expect(orderedActiveTasks).toHaveLength(2);
    });

    it('should throw NotFoundError for non-existent workflow', async () => {
      await expect(
        api.getOrderedTasksInWorkflow('el-nonexistent' as ElementId)
      ).rejects.toThrow('Workflow not found');
    });

    it('should throw ConstraintError for non-workflow element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(api.getOrderedTasksInWorkflow(task.id)).rejects.toThrow('is not a workflow');
    });

    it('should handle created workflow with sequential dependencies', async () => {
      const playbook = await createPlaybook({
        name: 'sequential_pipeline',
        title: 'Sequential Pipeline',
        createdBy: mockEntityId,
        steps: [
          { id: 'step1', title: 'Step 1' },
          { id: 'step2', title: 'Step 2', dependsOn: ['step1'] },
          { id: 'step3', title: 'Step 3', dependsOn: ['step2'] },
          { id: 'step4', title: 'Step 4', dependsOn: ['step3'] },
        ],
        variables: [],
      });

      const createResult = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      // Persist the create result
      await api.create(toCreateInput(createResult.workflow));
      for (const { task } of createResult.tasks) {
        await api.create(toCreateInput(task));
      }
      for (const dep of createResult.parentChildDependencies) {
        await api.addDependency({
          blockedId: dep.blockedId,
          blockerId: dep.blockerId,
          type: dep.type,
        });
      }
      // Blocks dependencies: createWorkflowFromPlaybook uses correct semantics
      // blockerId=blocker, blockedId=blocked (blocked waits for blocker to close)
      for (const dep of createResult.blocksDependencies) {
        await api.addDependency({
          blockerId: dep.blockerId,  // blocker task
          blockedId: dep.blockedId,  // blocked task (waits for blocker)
          type: dep.type,
        });
      }

      const orderedTasks = await api.getOrderedTasksInWorkflow(createResult.workflow.id);
      expect(orderedTasks).toHaveLength(4);

      // Verify the order matches the step sequence
      expect(orderedTasks[0].title).toBe('Step 1');
      expect(orderedTasks[1].title).toBe('Step 2');
      expect(orderedTasks[2].title).toBe('Step 3');
      expect(orderedTasks[3].title).toBe('Step 4');
    });

    it('should handle workflow with no dependencies (all tasks are independent)', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create tasks without dependencies between them
      const task1 = await createTestTask({ title: 'Task A', priority: Priority.MEDIUM });
      const task2 = await createTestTask({ title: 'Task B', priority: Priority.HIGH });
      const task3 = await createTestTask({ title: 'Task C', priority: Priority.LOW });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      // Link all tasks to workflow (no blocks dependencies)
      for (const task of [task1, task2, task3]) {
        await api.addDependency({
          blockedId: task.id,
          blockerId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      const orderedTasks = await api.getOrderedTasksInWorkflow(workflow.id);
      expect(orderedTasks).toHaveLength(3);

      // With no dependencies, should be ordered by priority
      expect(orderedTasks[0].priority).toBeLessThanOrEqual(orderedTasks[1].priority);
      expect(orderedTasks[1].priority).toBeLessThanOrEqual(orderedTasks[2].priority);
    });
  });
});
