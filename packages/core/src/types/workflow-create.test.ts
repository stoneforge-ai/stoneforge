/**
 * Tests for Workflow Creation
 *
 * Tests the workflow instantiation ("creation from playbook") functionality including:
 * - Auto-completion/failure detection
 * - Playbook loading and inheritance resolution
 * - Variable resolution and condition evaluation
 * - Task creation and dependency wiring
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { EntityId } from './element.js';
import type { Task, CreateTaskInput } from './task.js';
import { TaskStatus, DEFAULT_PRIORITY, DEFAULT_COMPLEXITY, DEFAULT_TASK_TYPE, createTask } from './task.js';
import type { Playbook, PlaybookStep, PlaybookVariable, ResolvedVariables } from './playbook.js';
import { createPlaybook, VariableType } from './playbook.js';
import type { Workflow } from './workflow.js';
import { WorkflowStatus, createWorkflow } from './workflow.js';
import { DependencyType } from './dependency.js';
import {
  shouldAutoComplete,
  shouldAutoFail,
  shouldAutoStart,
  computeWorkflowStatus,
  createWorkflowFromPlaybook,
  validateCreateWorkflow,
  type CreateWorkflowFromPlaybookInput,
  type CreateWorkflowOptions,
} from './workflow-create.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_ENTITY: EntityId = 'entity-test' as EntityId;

async function createTestWorkflow(
  overrides: Partial<Parameters<typeof createWorkflow>[0]> = {}
): Promise<Workflow> {
  return createWorkflow({
    title: 'Test Workflow',
    createdBy: TEST_ENTITY,
    ephemeral: false,
    ...overrides,
  });
}

async function createTestTask(
  overrides: Partial<CreateTaskInput> = {}
): Promise<Task> {
  return createTask({
    title: 'Test Task',
    createdBy: TEST_ENTITY,
    ...overrides,
  });
}

async function createTestPlaybook(
  overrides: Partial<Parameters<typeof createPlaybook>[0]> = {}
): Promise<Playbook> {
  return createPlaybook({
    name: 'test_playbook',
    title: 'Test Playbook',
    createdBy: TEST_ENTITY,
    steps: [],
    variables: [],
    ...overrides,
  });
}

// ============================================================================
// Auto-Completion Tests
// ============================================================================

describe('shouldAutoComplete', () => {
  it('should return false for pending workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.PENDING });
    const tasks = [await createTestTask({ status: TaskStatus.CLOSED })];

    expect(shouldAutoComplete(workflow, tasks)).toBe(false);
  });

  it('should return false for completed workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
    const tasks = [await createTestTask({ status: TaskStatus.CLOSED })];

    expect(shouldAutoComplete(workflow, tasks)).toBe(false);
  });

  it('should return false for failed workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.FAILED });
    const tasks = [await createTestTask({ status: TaskStatus.CLOSED })];

    expect(shouldAutoComplete(workflow, tasks)).toBe(false);
  });

  it('should return false for cancelled workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.CANCELLED });
    const tasks = [await createTestTask({ status: TaskStatus.CLOSED })];

    expect(shouldAutoComplete(workflow, tasks)).toBe(false);
  });

  it('should return false when no tasks', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });

    expect(shouldAutoComplete(workflow, [])).toBe(false);
  });

  it('should return false when any task is not closed', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.OPEN }),
    ];

    expect(shouldAutoComplete(workflow, tasks)).toBe(false);
  });

  it('should return false when any task is in_progress', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.IN_PROGRESS }),
    ];

    expect(shouldAutoComplete(workflow, tasks)).toBe(false);
  });

  it('should return true when all tasks are closed and workflow is running', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.CLOSED }),
    ];

    expect(shouldAutoComplete(workflow, tasks)).toBe(true);
  });

  it('should return true with single closed task', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [await createTestTask({ status: TaskStatus.CLOSED })];

    expect(shouldAutoComplete(workflow, tasks)).toBe(true);
  });
});

// ============================================================================
// Auto-Failure Tests
// ============================================================================

describe('shouldAutoFail', () => {
  it('should return false for completed workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
    const tasks = [await createTestTask({ status: TaskStatus.TOMBSTONE })];

    expect(shouldAutoFail(workflow, tasks)).toBe(false);
  });

  it('should return false for failed workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.FAILED });
    const tasks = [await createTestTask({ status: TaskStatus.TOMBSTONE })];

    expect(shouldAutoFail(workflow, tasks)).toBe(false);
  });

  it('should return false for cancelled workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.CANCELLED });
    const tasks = [await createTestTask({ status: TaskStatus.TOMBSTONE })];

    expect(shouldAutoFail(workflow, tasks)).toBe(false);
  });

  it('should return false when no tasks are tombstoned', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.OPEN }),
      await createTestTask({ status: TaskStatus.IN_PROGRESS }),
      await createTestTask({ status: TaskStatus.CLOSED }),
    ];

    expect(shouldAutoFail(workflow, tasks)).toBe(false);
  });

  it('should return true for pending workflow with tombstoned task', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.PENDING });
    const tasks = [
      await createTestTask({ status: TaskStatus.OPEN }),
      await createTestTask({ status: TaskStatus.TOMBSTONE }),
    ];

    expect(shouldAutoFail(workflow, tasks)).toBe(true);
  });

  it('should return true for running workflow with tombstoned task', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.TOMBSTONE }),
    ];

    expect(shouldAutoFail(workflow, tasks)).toBe(true);
  });

  it('should return true when any task is tombstoned', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.TOMBSTONE }),
    ];

    expect(shouldAutoFail(workflow, tasks)).toBe(true);
  });
});

// ============================================================================
// Auto-Start Tests
// ============================================================================

describe('shouldAutoStart', () => {
  it('should return false for running workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [await createTestTask({ status: TaskStatus.IN_PROGRESS })];

    expect(shouldAutoStart(workflow, tasks)).toBe(false);
  });

  it('should return false for completed workflow', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
    const tasks = [await createTestTask({ status: TaskStatus.IN_PROGRESS })];

    expect(shouldAutoStart(workflow, tasks)).toBe(false);
  });

  it('should return false when no tasks are in progress', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.PENDING });
    const tasks = [
      await createTestTask({ status: TaskStatus.OPEN }),
      await createTestTask({ status: TaskStatus.CLOSED }),
    ];

    expect(shouldAutoStart(workflow, tasks)).toBe(false);
  });

  it('should return true for pending workflow with in_progress task', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.PENDING });
    const tasks = [
      await createTestTask({ status: TaskStatus.OPEN }),
      await createTestTask({ status: TaskStatus.IN_PROGRESS }),
    ];

    expect(shouldAutoStart(workflow, tasks)).toBe(true);
  });
});

// ============================================================================
// computeWorkflowStatus Tests
// ============================================================================

describe('computeWorkflowStatus', () => {
  it('should return FAILED if any task is tombstoned (priority)', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.TOMBSTONE }),
    ];

    expect(computeWorkflowStatus(workflow, tasks)).toBe(WorkflowStatus.FAILED);
  });

  it('should return RUNNING for pending workflow with in_progress task', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.PENDING });
    const tasks = [
      await createTestTask({ status: TaskStatus.IN_PROGRESS }),
      await createTestTask({ status: TaskStatus.OPEN }),
    ];

    expect(computeWorkflowStatus(workflow, tasks)).toBe(WorkflowStatus.RUNNING);
  });

  it('should return COMPLETED when all tasks are closed', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.CLOSED }),
      await createTestTask({ status: TaskStatus.CLOSED }),
    ];

    expect(computeWorkflowStatus(workflow, tasks)).toBe(WorkflowStatus.COMPLETED);
  });

  it('should return undefined when no status change is needed', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.RUNNING });
    const tasks = [
      await createTestTask({ status: TaskStatus.OPEN }),
      await createTestTask({ status: TaskStatus.IN_PROGRESS }),
    ];

    expect(computeWorkflowStatus(workflow, tasks)).toBeUndefined();
  });

  it('should return undefined for terminal workflow states', async () => {
    const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
    const tasks = [await createTestTask({ status: TaskStatus.OPEN })];

    expect(computeWorkflowStatus(workflow, tasks)).toBeUndefined();
  });
});

// ============================================================================
// createWorkflowFromPlaybook Tests
// ============================================================================

describe('createWorkflowFromPlaybook', () => {
  describe('validation', () => {
    it('should throw when playbook is missing', async () => {
      await expect(
        createWorkflowFromPlaybook({
          playbook: null as unknown as Playbook,
          variables: {},
          createdBy: TEST_ENTITY,
        })
      ).rejects.toThrow('Playbook is required');
    });

    it('should throw when createdBy is missing', async () => {
      const playbook = await createTestPlaybook();
      await expect(
        createWorkflowFromPlaybook({
          playbook,
          variables: {},
          createdBy: '' as EntityId,
        })
      ).rejects.toThrow('createdBy is required');
    });

    it('should throw when variables is not an object', async () => {
      const playbook = await createTestPlaybook();
      await expect(
        createWorkflowFromPlaybook({
          playbook,
          variables: 'invalid' as unknown as Record<string, unknown>,
          createdBy: TEST_ENTITY,
        })
      ).rejects.toThrow('variables must be an object');
    });
  });

  describe('basic creation', () => {
    it('should create workflow with no steps', async () => {
      const playbook = await createTestPlaybook({
        title: 'Empty Playbook',
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.workflow).toBeDefined();
      expect(result.workflow.title).toBe('Empty Playbook');
      expect(result.workflow.status).toBe(WorkflowStatus.PENDING);
      expect(result.workflow.ephemeral).toBe(false);
      expect(result.workflow.playbookId).toBe(playbook.id);
      expect(result.tasks).toHaveLength(0);
      expect(result.blocksDependencies).toHaveLength(0);
      expect(result.parentChildDependencies).toHaveLength(0);
    });

    it('should create workflow with custom title', async () => {
      const playbook = await createTestPlaybook({
        title: 'Original Title',
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
        title: 'Custom Title',
      });

      expect(result.workflow.title).toBe('Custom Title');
    });

    it('should create ephemeral workflow when specified', async () => {
      const playbook = await createTestPlaybook();

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
        ephemeral: true,
      });

      expect(result.workflow.ephemeral).toBe(true);
    });

    it('should apply tags and metadata', async () => {
      const playbook = await createTestPlaybook();

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' },
      });

      expect(result.workflow.tags).toEqual(['tag1', 'tag2']);
      expect(result.workflow.metadata).toEqual({ key: 'value' });
    });
  });

  describe('task creation', () => {
    it('should create tasks for each step', async () => {
      const playbook = await createTestPlaybook({
        steps: [
          { id: 'step1', title: 'First Step' },
          { id: 'step2', title: 'Second Step' },
          { id: 'step3', title: 'Third Step' },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks).toHaveLength(3);
      expect(result.tasks[0].task.title).toBe('First Step');
      expect(result.tasks[1].task.title).toBe('Second Step');
      expect(result.tasks[2].task.title).toBe('Third Step');
    });

    it('should generate hierarchical task IDs', async () => {
      const playbook = await createTestPlaybook({
        steps: [
          { id: 'step1', title: 'Step One' },
          { id: 'step2', title: 'Step Two' },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      const workflowId = result.workflow.id;
      expect(result.tasks[0].task.id).toBe(`${workflowId}.1`);
      expect(result.tasks[1].task.id).toBe(`${workflowId}.2`);
    });

    it('should apply step priority and complexity', async () => {
      const playbook = await createTestPlaybook({
        steps: [
          { id: 'step1', title: 'Step', priority: 1, complexity: 5 },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.priority).toBe(1);
      expect(result.tasks[0].task.complexity).toBe(5);
    });

    it('should apply default priority and complexity when not specified', async () => {
      const playbook = await createTestPlaybook({
        steps: [{ id: 'step1', title: 'Step' }],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.priority).toBe(DEFAULT_PRIORITY);
      expect(result.tasks[0].task.complexity).toBe(DEFAULT_COMPLEXITY);
    });

    it('should apply step task type', async () => {
      const playbook = await createTestPlaybook({
        steps: [{ id: 'step1', title: 'Step', taskType: 'bug' }],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.taskType).toBe('bug');
    });

    it('should create parent-child dependencies', async () => {
      const playbook = await createTestPlaybook({
        steps: [
          { id: 'step1', title: 'Step 1' },
          { id: 'step2', title: 'Step 2' },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.parentChildDependencies).toHaveLength(2);
      expect(result.parentChildDependencies[0].type).toBe(DependencyType.PARENT_CHILD);
      expect(result.parentChildDependencies[0].blockedId).toBe(result.tasks[0].task.id);
      expect(result.parentChildDependencies[0].blockerId).toBe(result.workflow.id);
    });
  });

  describe('variable substitution', () => {
    it('should substitute variables in task titles', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'taskName', type: VariableType.STRING, required: true },
        ],
        steps: [{ id: 'step1', title: 'Task: {{taskName}}' }],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: { taskName: 'My Important Task' },
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.title).toBe('Task: My Important Task');
    });

    it('should use default values for optional variables', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'version', type: VariableType.STRING, required: false, default: '1.0.0' },
        ],
        steps: [{ id: 'step1', title: 'Deploy version {{version}}' }],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.title).toBe('Deploy version 1.0.0');
    });

    it('should throw when required variable is missing', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'requiredVar', type: VariableType.STRING, required: true },
        ],
        steps: [{ id: 'step1', title: 'Task with {{requiredVar}}' }],
      });

      await expect(
        createWorkflowFromPlaybook({
          playbook,
          variables: {},
          createdBy: TEST_ENTITY,
        })
      ).rejects.toThrow("Required variable 'requiredVar' was not provided");
    });

    it('should substitute variables in workflow title', async () => {
      const playbook = await createTestPlaybook({
        title: 'Workflow for {{project}}',
        variables: [
          { name: 'project', type: VariableType.STRING, required: true },
        ],
        steps: [],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: { project: 'Stoneforge' },
        createdBy: TEST_ENTITY,
      });

      expect(result.workflow.title).toBe('Workflow for Stoneforge');
    });

    it('should store resolved variables in workflow', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'env', type: VariableType.STRING, required: true },
          { name: 'debug', type: VariableType.BOOLEAN, required: false, default: false },
        ],
        steps: [],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: { env: 'production' },
        createdBy: TEST_ENTITY,
      });

      expect(result.workflow.variables).toEqual({ env: 'production', debug: false });
      expect(result.resolvedVariables).toEqual({ env: 'production', debug: false });
    });
  });

  describe('condition evaluation', () => {
    it('should filter out steps with false conditions', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'includeOptional', type: VariableType.BOOLEAN, required: false, default: false },
        ],
        steps: [
          { id: 'always', title: 'Always included' },
          { id: 'optional', title: 'Optional step', condition: '{{includeOptional}}' },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].task.title).toBe('Always included');
      expect(result.skippedSteps).toEqual(['optional']);
    });

    it('should include steps with true conditions', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'includeOptional', type: VariableType.BOOLEAN, required: false, default: false },
        ],
        steps: [
          { id: 'always', title: 'Always included' },
          { id: 'optional', title: 'Optional step', condition: '{{includeOptional}}' },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: { includeOptional: true },
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.skippedSteps).toEqual([]);
    });

    it('should handle negation conditions', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'skipCleanup', type: VariableType.BOOLEAN, required: false, default: false },
        ],
        steps: [
          { id: 'main', title: 'Main task' },
          { id: 'cleanup', title: 'Cleanup', condition: '!{{skipCleanup}}' },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: { skipCleanup: true },
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].task.title).toBe('Main task');
    });

    it('should handle equality conditions', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'env', type: VariableType.STRING, required: true },
        ],
        steps: [
          { id: 'always', title: 'Always' },
          { id: 'prod_only', title: 'Production Only', condition: '{{env}} == production' },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: { env: 'staging' },
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.skippedSteps).toEqual(['prod_only']);
    });
  });

  describe('dependency wiring', () => {
    it('should create blocks dependencies from dependsOn', async () => {
      const playbook = await createTestPlaybook({
        steps: [
          { id: 'setup', title: 'Setup' },
          { id: 'build', title: 'Build', dependsOn: ['setup'] },
          { id: 'test', title: 'Test', dependsOn: ['build'] },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.blocksDependencies).toHaveLength(2);

      // setup blocks build
      const setupBlocksBuild = result.blocksDependencies.find(
        (d) => d.blockerId === result.tasks[0].task.id && d.blockedId === result.tasks[1].task.id
      );
      expect(setupBlocksBuild).toBeDefined();
      expect(setupBlocksBuild?.type).toBe(DependencyType.BLOCKS);

      // build blocks test
      const buildBlocksTest = result.blocksDependencies.find(
        (d) => d.blockerId === result.tasks[1].task.id && d.blockedId === result.tasks[2].task.id
      );
      expect(buildBlocksTest).toBeDefined();
    });

    it('should handle multiple dependencies', async () => {
      const playbook = await createTestPlaybook({
        steps: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
          { id: 'c', title: 'C', dependsOn: ['a', 'b'] },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.blocksDependencies).toHaveLength(2);
    });

    it('should skip dependencies for filtered steps', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'skipB', type: VariableType.BOOLEAN, required: false, default: true },
        ],
        steps: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B', condition: '!{{skipB}}' },
          { id: 'c', title: 'C', dependsOn: ['b'] },
        ],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      // B is skipped, so C has no dependencies
      expect(result.tasks).toHaveLength(2);
      expect(result.blocksDependencies).toHaveLength(0);
    });
  });

  describe('assignee handling', () => {
    it('should set assignee from step', async () => {
      const playbook = await createTestPlaybook({
        steps: [{ id: 'step1', title: 'Step', assignee: 'entity-alice' }],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.assignee).toBe('entity-alice');
    });

    it('should substitute variables in assignee', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'assignTo', type: VariableType.STRING, required: true },
        ],
        steps: [{ id: 'step1', title: 'Step', assignee: '{{assignTo}}' }],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: { assignTo: 'entity-bob' },
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.assignee).toBe('entity-bob');
    });

    it('should not set assignee when empty after substitution', async () => {
      const playbook = await createTestPlaybook({
        variables: [
          { name: 'assignTo', type: VariableType.STRING, required: false, default: '' },
        ],
        steps: [{ id: 'step1', title: 'Step', assignee: '{{assignTo}}' }],
      });

      const result = await createWorkflowFromPlaybook({
        playbook,
        variables: {},
        createdBy: TEST_ENTITY,
      });

      expect(result.tasks[0].task.assignee).toBeUndefined();
    });
  });
});

// ============================================================================
// validateCreateWorkflow Tests
// ============================================================================

describe('validateCreateWorkflow', () => {
  it('should return valid=true for valid input', async () => {
    const playbook = await createTestPlaybook({
      variables: [
        { name: 'name', type: VariableType.STRING, required: true },
      ],
      steps: [{ id: 'step1', title: 'Hello {{name}}' }],
    });

    const result = await validateCreateWorkflow(playbook, { name: 'World' });

    expect(result.valid).toBe(true);
    expect(result.resolvedVariables).toEqual({ name: 'World' });
    expect(result.includedSteps).toHaveLength(1);
    expect(result.skippedSteps).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('should return valid=false when required variable is missing', async () => {
    const playbook = await createTestPlaybook({
      variables: [
        { name: 'required', type: VariableType.STRING, required: true },
      ],
      steps: [],
    });

    const result = await validateCreateWorkflow(playbook, {});

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Required variable 'required' was not provided");
  });

  it('should return skipped steps for filtered conditions', async () => {
    const playbook = await createTestPlaybook({
      variables: [
        { name: 'include', type: VariableType.BOOLEAN, required: false, default: false },
      ],
      steps: [
        { id: 'always', title: 'Always' },
        { id: 'conditional', title: 'Conditional', condition: '{{include}}' },
      ],
    });

    const result = await validateCreateWorkflow(playbook, {});

    expect(result.valid).toBe(true);
    expect(result.includedSteps).toHaveLength(1);
    expect(result.skippedSteps).toEqual(['conditional']);
  });

  it('should validate variable substitution in templates', async () => {
    const playbook = await createTestPlaybook({
      steps: [{ id: 'step1', title: 'Use {{undefined_var}}' }],
    });

    const result = await validateCreateWorkflow(playbook, {});

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unresolved variable');
  });
});
