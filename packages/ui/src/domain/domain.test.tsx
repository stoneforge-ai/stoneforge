/**
 * Unit tests for @stoneforge/ui domain components
 */
import { describe, expect, test } from 'bun:test';

// Import types and utilities
import {
  getPriorityConfig,
  getPriorityDisplayName,
  getPriorityColor,
  getStatusDisplayName,
  getStatusColor,
  getTaskTypeDisplayName,
  getTaskTypeColor,
  getTaskTypeStyle,
  getMergeStatusDisplayName,
  getMergeStatusColor,
  getEntityTypeConfig,
  PRIORITY_CONFIG,
  TASK_TYPE_STYLES,
  ENTITY_TYPE_CONFIG,
  type Task,
  type Entity,
  type Plan,
  type Workflow,
  type Team,
} from './types';

// Import components
import {
  TaskCard,
  EntityCard,
  PlanCard,
  WorkflowCard,
  TeamCard,
  TaskStatusBadge,
  TaskPriorityBadge,
  TaskTypeBadge,
  MergeStatusBadge,
} from './index';

describe('Domain Types Utility Functions', () => {
  describe('getPriorityConfig', () => {
    test('returns correct config for priority 1 (Critical)', () => {
      const config = getPriorityConfig(1);
      expect(config.label).toBe('Critical');
      expect(config.variant).toBe('error');
    });

    test('returns correct config for priority 2 (High)', () => {
      const config = getPriorityConfig(2);
      expect(config.label).toBe('High');
      expect(config.variant).toBe('warning');
    });

    test('returns correct config for priority 3 (Medium)', () => {
      const config = getPriorityConfig(3);
      expect(config.label).toBe('Medium');
      expect(config.variant).toBe('primary');
    });

    test('returns correct config for priority 4 (Low)', () => {
      const config = getPriorityConfig(4);
      expect(config.label).toBe('Low');
      expect(config.variant).toBe('default');
    });

    test('returns correct config for priority 5 (Trivial)', () => {
      const config = getPriorityConfig(5);
      expect(config.label).toBe('Trivial');
      expect(config.variant).toBe('outline');
    });

    test('returns default config for unknown priority', () => {
      const config = getPriorityConfig(99);
      expect(config.label).toBe('Medium');
      expect(config.variant).toBe('primary');
    });
  });

  describe('getPriorityDisplayName', () => {
    test('returns correct display name for all priorities', () => {
      expect(getPriorityDisplayName(1)).toBe('Critical');
      expect(getPriorityDisplayName(2)).toBe('High');
      expect(getPriorityDisplayName(3)).toBe('Medium');
      expect(getPriorityDisplayName(4)).toBe('Low');
      expect(getPriorityDisplayName(5)).toBe('Trivial');
    });
  });

  describe('getPriorityColor', () => {
    test('returns color classes for all priorities', () => {
      expect(getPriorityColor(1)).toContain('red');
      expect(getPriorityColor(2)).toContain('orange');
      expect(getPriorityColor(3)).toContain('blue');
      expect(getPriorityColor(4)).toContain('gray');
      expect(getPriorityColor(5)).toContain('gray');
    });
  });

  describe('getStatusDisplayName', () => {
    test('returns correct display name for all statuses', () => {
      expect(getStatusDisplayName('todo')).toBe('To Do');
      expect(getStatusDisplayName('in_progress')).toBe('In Progress');
      expect(getStatusDisplayName('blocked')).toBe('Blocked');
      expect(getStatusDisplayName('closed')).toBe('Closed');
      expect(getStatusDisplayName('cancelled')).toBe('Cancelled');
      expect(getStatusDisplayName('deferred')).toBe('Deferred');
    });

    test('returns raw status for unknown status', () => {
      expect(getStatusDisplayName('unknown')).toBe('unknown');
    });
  });

  describe('getStatusColor', () => {
    test('returns color classes for all statuses', () => {
      expect(getStatusColor('todo')).toContain('gray');
      expect(getStatusColor('in_progress')).toContain('blue');
      expect(getStatusColor('closed')).toContain('green');
      expect(getStatusColor('blocked')).toContain('red');
      expect(getStatusColor('deferred')).toContain('yellow');
    });
  });

  describe('getTaskTypeDisplayName', () => {
    test('returns correct display name for all task types', () => {
      expect(getTaskTypeDisplayName('bug')).toBe('Bug');
      expect(getTaskTypeDisplayName('feature')).toBe('Feature');
      expect(getTaskTypeDisplayName('task')).toBe('Task');
      expect(getTaskTypeDisplayName('chore')).toBe('Chore');
    });

    test('returns raw type for unknown type', () => {
      expect(getTaskTypeDisplayName('unknown')).toBe('unknown');
    });
  });

  describe('getTaskTypeColor', () => {
    test('returns color classes for all task types', () => {
      expect(getTaskTypeColor('bug')).toContain('red');
      expect(getTaskTypeColor('feature')).toContain('purple');
      expect(getTaskTypeColor('task')).toContain('blue');
      expect(getTaskTypeColor('chore')).toContain('gray');
    });
  });

  describe('getTaskTypeStyle', () => {
    test('returns border style for all task types', () => {
      expect(getTaskTypeStyle('bug')).toContain('border-l-4');
      expect(getTaskTypeStyle('feature')).toContain('border-l-4');
      expect(getTaskTypeStyle('task')).toContain('border-l-4');
      expect(getTaskTypeStyle('chore')).toContain('border-l-4');
    });

    test('returns default style for unknown type', () => {
      expect(getTaskTypeStyle('unknown')).toBe(TASK_TYPE_STYLES.task);
    });
  });

  describe('getMergeStatusDisplayName', () => {
    test('returns correct display name for all merge statuses', () => {
      expect(getMergeStatusDisplayName('pending')).toBe('Pending Merge');
      expect(getMergeStatusDisplayName('testing')).toBe('Testing');
      expect(getMergeStatusDisplayName('merging')).toBe('Merging');
      expect(getMergeStatusDisplayName('merged')).toBe('Merged');
      expect(getMergeStatusDisplayName('conflict')).toBe('Conflict');
      expect(getMergeStatusDisplayName('test_failed')).toBe('Tests Failed');
      expect(getMergeStatusDisplayName('failed')).toBe('Merge Failed');
    });
  });

  describe('getMergeStatusColor', () => {
    test('returns color classes for all merge statuses', () => {
      expect(getMergeStatusColor('pending')).toContain('purple');
      expect(getMergeStatusColor('testing')).toContain('blue');
      expect(getMergeStatusColor('merging')).toContain('yellow');
      expect(getMergeStatusColor('merged')).toContain('green');
      expect(getMergeStatusColor('conflict')).toContain('orange');
      expect(getMergeStatusColor('test_failed')).toContain('red');
      expect(getMergeStatusColor('failed')).toContain('red');
    });
  });

  describe('getEntityTypeConfig', () => {
    test('returns correct config for agent', () => {
      const config = getEntityTypeConfig('agent');
      expect(config.variant).toBe('primary');
      expect(config.bgColor).toContain('primary');
    });

    test('returns correct config for human', () => {
      const config = getEntityTypeConfig('human');
      expect(config.variant).toBe('success');
      expect(config.bgColor).toContain('success');
    });

    test('returns correct config for system', () => {
      const config = getEntityTypeConfig('system');
      expect(config.variant).toBe('warning');
      expect(config.bgColor).toContain('warning');
    });

    test('returns default config for unknown type', () => {
      const config = getEntityTypeConfig('unknown');
      expect(config.variant).toBe('warning');
    });
  });
});

describe('Domain Constants', () => {
  describe('PRIORITY_CONFIG', () => {
    test('has entries for priorities 1-5', () => {
      expect(PRIORITY_CONFIG[1]).toBeDefined();
      expect(PRIORITY_CONFIG[2]).toBeDefined();
      expect(PRIORITY_CONFIG[3]).toBeDefined();
      expect(PRIORITY_CONFIG[4]).toBeDefined();
      expect(PRIORITY_CONFIG[5]).toBeDefined();
    });
  });

  describe('TASK_TYPE_STYLES', () => {
    test('has entries for all task types', () => {
      expect(TASK_TYPE_STYLES.bug).toBeDefined();
      expect(TASK_TYPE_STYLES.feature).toBeDefined();
      expect(TASK_TYPE_STYLES.task).toBeDefined();
      expect(TASK_TYPE_STYLES.chore).toBeDefined();
    });
  });

  describe('ENTITY_TYPE_CONFIG', () => {
    test('has entries for all entity types', () => {
      expect(ENTITY_TYPE_CONFIG.agent).toBeDefined();
      expect(ENTITY_TYPE_CONFIG.human).toBeDefined();
      expect(ENTITY_TYPE_CONFIG.system).toBeDefined();
    });
  });
});

describe('Domain Component Exports', () => {
  test('TaskCard is exported', () => {
    expect(TaskCard).toBeDefined();
    expect(typeof TaskCard).toBe('object'); // forwardRef returns object
  });

  test('EntityCard is exported', () => {
    expect(EntityCard).toBeDefined();
    expect(typeof EntityCard).toBe('object');
  });

  test('PlanCard is exported', () => {
    expect(PlanCard).toBeDefined();
    expect(typeof PlanCard).toBe('object');
  });

  test('WorkflowCard is exported', () => {
    expect(WorkflowCard).toBeDefined();
    expect(typeof WorkflowCard).toBe('object');
  });

  test('TeamCard is exported', () => {
    expect(TeamCard).toBeDefined();
    expect(typeof TeamCard).toBe('object');
  });

  test('TaskStatusBadge is exported', () => {
    expect(TaskStatusBadge).toBeDefined();
    expect(typeof TaskStatusBadge).toBe('function');
  });

  test('TaskPriorityBadge is exported', () => {
    expect(TaskPriorityBadge).toBeDefined();
    expect(typeof TaskPriorityBadge).toBe('function');
  });

  test('TaskTypeBadge is exported', () => {
    expect(TaskTypeBadge).toBeDefined();
    expect(typeof TaskTypeBadge).toBe('function');
  });

  test('MergeStatusBadge is exported', () => {
    expect(MergeStatusBadge).toBeDefined();
    expect(typeof MergeStatusBadge).toBe('function');
  });
});

describe('Domain Type Definitions', () => {
  test('Task type is properly structured', () => {
    const task: Task = {
      id: 'task-123',
      type: 'task',
      title: 'Test Task',
      status: 'todo',
      priority: 3,
      complexity: 1,
      taskType: 'task',
      tags: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(task.id).toBe('task-123');
    expect(task.type).toBe('task');
    expect(task.status).toBe('todo');
  });

  test('Entity type is properly structured', () => {
    const entity: Entity = {
      id: 'entity-123',
      type: 'entity',
      name: 'Test Entity',
      entityType: 'agent',
      active: true,
      tags: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(entity.id).toBe('entity-123');
    expect(entity.entityType).toBe('agent');
  });

  test('Plan type is properly structured', () => {
    const plan: Plan = {
      id: 'plan-123',
      type: 'plan',
      title: 'Test Plan',
      status: 'active',
      tasks: ['task-1', 'task-2'],
      tags: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(plan.id).toBe('plan-123');
    expect(plan.status).toBe('active');
  });

  test('Workflow type is properly structured', () => {
    const workflow: Workflow = {
      id: 'workflow-123',
      type: 'workflow',
      title: 'Test Workflow',
      status: 'active',
      ephemeral: false,
      playbookId: 'playbook-1',
      tags: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(workflow.id).toBe('workflow-123');
    expect(workflow.ephemeral).toBe(false);
  });

  test('Team type is properly structured', () => {
    const team: Team = {
      id: 'team-123',
      type: 'team',
      name: 'Test Team',
      members: ['user-1', 'user-2'],
      status: 'active',
      tags: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(team.id).toBe('team-123');
    expect(team.members).toHaveLength(2);
  });
});
