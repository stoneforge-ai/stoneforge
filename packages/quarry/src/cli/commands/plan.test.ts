/**
 * Plan Commands Integration Tests
 *
 * Tests for the plan-specific CLI commands:
 * - plan create: Create a new plan
 * - plan list: List plans with filtering
 * - plan show: Show plan details with progress
 * - plan activate: Activate a draft plan
 * - plan complete: Complete an active plan
 * - plan cancel: Cancel a plan
 * - plan add-task: Add a task to a plan
 * - plan remove-task: Remove a task from a plan
 * - plan tasks: List tasks in a plan
 * - plan auto-complete: Auto-complete stale plans
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { planCommand } from './plan.js';
import { createCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Plan } from '@stoneforge/core';
import { PlanStatus } from '@stoneforge/core';
import type { Task } from '@stoneforge/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_plan_workspace__');
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

// Helper to create a plan and return its ID
async function createTestPlan(
  title: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const options = createTestOptions({ title, ...extra });
  const createSubCmd = planCommand.subcommands!['create'];
  const result = await createSubCmd.handler([], options);
  return (result.data as { id: string }).id;
}

// Helper to create a task and return its ID
async function createTestTask(
  title: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const options = createTestOptions({ title, ...extra });
  const result = await createCommand.handler(['task'], options);
  return (result.data as { id: string }).id;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Plan Create Command Tests
// ============================================================================

describe('plan create command', () => {
  const createSubCmd = planCommand.subcommands!['create'];

  test('creates a plan with required title', async () => {
    const options = createTestOptions({ title: 'Test Plan' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const plan = result.data as Plan;
    expect(plan.id).toMatch(/^el-/);
    expect(plan.title).toBe('Test Plan');
    expect(plan.status).toBe(PlanStatus.DRAFT);
    expect(plan.type).toBe('plan');
  });

  test('creates plan with active status', async () => {
    const options = createTestOptions({ title: 'Active Plan', status: 'active' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.data as Plan;
    expect(plan.status).toBe(PlanStatus.ACTIVE);
  });

  test('creates plan with tags', async () => {
    const options = createTestOptions({ title: 'Tagged Plan', tag: ['sprint', 'q1'] });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.data as Plan;
    expect(plan.tags).toContain('sprint');
    expect(plan.tags).toContain('q1');
  });

  test('fails without title', async () => {
    const options = createTestOptions();
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--title is required');
  });

  test('fails with invalid initial status', async () => {
    const options = createTestOptions({ title: 'Bad Status', status: 'completed' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid initial status');
  });
});

// ============================================================================
// Plan List Command Tests
// ============================================================================

describe('plan list command', () => {
  const listSubCmd = planCommand.subcommands!['list'];

  test('lists all plans', async () => {
    await createTestPlan('Plan 1');
    await createTestPlan('Plan 2');

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Plan[]).length).toBe(2);
  });

  test('filters by status', async () => {
    await createTestPlan('Draft Plan');
    await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions({ status: 'draft' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plans = result.data as Plan[];
    expect(plans.length).toBe(1);
    expect(plans[0].status).toBe(PlanStatus.DRAFT);
  });

  test('filters by tags', async () => {
    await createTestPlan('Tagged Plan', { tag: ['priority'] });
    await createTestPlan('Other Plan');

    const options = createTestOptions({ tag: 'priority' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plans = result.data as Plan[];
    expect(plans.length).toBe(1);
    expect(plans[0].tags).toContain('priority');
  });

  test('respects limit option', async () => {
    await createTestPlan('Plan 1');
    await createTestPlan('Plan 2');
    await createTestPlan('Plan 3');

    const options = createTestOptions({ limit: '2' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Plan[]).length).toBe(2);
  });

  test('returns empty message when no plans match filter', async () => {
    // Create a plan so database exists, then filter to find none
    await createTestPlan('Test Plan', { tag: ['test'] });

    // Filter by a tag that doesn't exist
    const options = createTestOptions({ tag: 'nonexistent' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No plans found');
  });

  test('returns JSON in JSON mode', async () => {
    await createTestPlan('JSON Test');

    const options = createTestOptions({ json: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plans = result.data as Plan[];
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBe(1);
  });

  test('fails with invalid status', async () => {
    // Create a plan first so the database exists
    await createTestPlan('Test Plan');

    const options = createTestOptions({ status: 'invalid' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid status');
  });
});

// ============================================================================
// Plan Show Command Tests
// ============================================================================

describe('plan show command', () => {
  const showSubCmd = planCommand.subcommands!['show'];

  test('shows plan details with progress', async () => {
    const planId = await createTestPlan('Detailed Plan');

    const options = createTestOptions();
    const result = await showSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    // Should have plan and progress
    const data = result.data as { plan: Plan; progress: { totalTasks: number } };
    expect(data.plan.id).toBe(planId);
    expect(data.progress).toBeDefined();
    expect(data.progress.totalTasks).toBe(0);
  });

  test('includes tasks when requested', async () => {
    const planId = await createTestPlan('Plan with Tasks');

    // Add tasks to plan
    const addTaskSubCmd = planCommand.subcommands!['add-task'];
    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    const options = createTestOptions({ tasks: true, json: true });
    const result = await showSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { plan: Plan; tasks: Task[] };
    expect(data.tasks).toBeDefined();
    expect(data.tasks.length).toBe(2);
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await showSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent plan', async () => {
    // Create a plan first so the database exists
    await createTestPlan('Existing Plan');

    const options = createTestOptions();
    const result = await showSubCmd.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails when element is not a plan', async () => {
    const taskId = await createTestTask('Not a plan');

    const options = createTestOptions();
    const result = await showSubCmd.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('is not a plan');
  });
});

// ============================================================================
// Plan Activate Command Tests
// ============================================================================

describe('plan activate command', () => {
  const activateSubCmd = planCommand.subcommands!['activate'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('activates a draft plan', async () => {
    const planId = await createTestPlan('Draft Plan');

    const options = createTestOptions();
    const result = await activateSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Activated');

    // Verify status change
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const data = showResult.data as { plan: Plan };
    expect(data.plan.status).toBe(PlanStatus.ACTIVE);
  });

  test('returns success message for already active plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions();
    const result = await activateSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already active');
  });

  test('fails for completed plan', async () => {
    const planId = await createTestPlan('Test Plan', { status: 'active' });

    // Complete the plan first
    const completeSubCmd = planCommand.subcommands!['complete'];
    await completeSubCmd.handler([planId], createTestOptions());

    const options = createTestOptions();
    const result = await activateSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot activate');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await activateSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });
});

// ============================================================================
// Plan Complete Command Tests
// ============================================================================

describe('plan complete command', () => {
  const completeSubCmd = planCommand.subcommands!['complete'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('completes an active plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions();
    const result = await completeSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Completed');

    // Verify status change
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const data = showResult.data as { plan: Plan };
    expect(data.plan.status).toBe(PlanStatus.COMPLETED);
    expect(data.plan.completedAt).toBeDefined();
  });

  test('returns success for already completed plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });
    await completeSubCmd.handler([planId], createTestOptions());

    const result = await completeSubCmd.handler([planId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already completed');
  });

  test('fails for draft plan', async () => {
    const planId = await createTestPlan('Draft Plan');

    const options = createTestOptions();
    const result = await completeSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot complete');
  });
});

// ============================================================================
// Plan Cancel Command Tests
// ============================================================================

describe('plan cancel command', () => {
  const cancelSubCmd = planCommand.subcommands!['cancel'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('cancels a draft plan', async () => {
    const planId = await createTestPlan('Draft Plan');

    const options = createTestOptions({ reason: 'Requirements changed' });
    const result = await cancelSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Cancelled');

    // Verify status change
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const data = showResult.data as { plan: Plan };
    expect(data.plan.status).toBe(PlanStatus.CANCELLED);
    expect(data.plan.cancelledAt).toBeDefined();
    expect(data.plan.cancelReason).toBe('Requirements changed');
  });

  test('cancels an active plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions();
    const result = await cancelSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Cancelled');
  });

  test('returns success for already cancelled plan', async () => {
    const planId = await createTestPlan('Draft Plan');
    await cancelSubCmd.handler([planId], createTestOptions());

    const result = await cancelSubCmd.handler([planId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already cancelled');
  });

  test('fails for completed plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });
    const completeSubCmd = planCommand.subcommands!['complete'];
    await completeSubCmd.handler([planId], createTestOptions());

    const result = await cancelSubCmd.handler([planId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot cancel');
  });
});

// ============================================================================
// Plan Add Task Command Tests
// ============================================================================

describe('plan add-task command', () => {
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];

  test('adds a task to a plan', async () => {
    const planId = await createTestPlan('Test Plan');
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions();
    const result = await addTaskSubCmd.handler([planId, taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Added task');

    // Verify task is in plan
    const tasksResult = await tasksSubCmd.handler([planId], createTestOptions({ json: true }));
    const tasks = tasksResult.data as Task[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(taskId);
  });

  test('fails without plan id and task id', async () => {
    const options = createTestOptions();
    const result = await addTaskSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error ?? '').toContain('Usage');
  });

  test('fails for non-existent plan', async () => {
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions();
    const result = await addTaskSubCmd.handler(['el-nonexistent', taskId], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error ?? '').toContain('Plan not found');
  });

  test('fails for non-existent task', async () => {
    const planId = await createTestPlan('Test Plan');

    const options = createTestOptions();
    const result = await addTaskSubCmd.handler([planId, 'el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error ?? '').toContain('Task not found');
  });

  test('fails for cancelled plan', async () => {
    const cancelSubCmd = planCommand.subcommands!['cancel'];

    // Create a plan and cancel it
    const planId = await createTestPlan('Cancelled Plan');
    await cancelSubCmd.handler([planId], createTestOptions());

    // Try to add a task to the cancelled plan
    const taskId = await createTestTask('Test Task');
    const result = await addTaskSubCmd.handler([planId, taskId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error ?? '').toContain("Cannot add task to plan with status 'cancelled'");
  });
});

// ============================================================================
// Plan Remove Task Command Tests
// ============================================================================

describe('plan remove-task command', () => {
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const removeTaskSubCmd = planCommand.subcommands!['remove-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];

  test('removes a task from a plan', async () => {
    const planId = await createTestPlan('Test Plan');
    const taskId = await createTestTask('Test Task');

    // Add task first
    await addTaskSubCmd.handler([planId, taskId], createTestOptions());

    // Remove task
    const options = createTestOptions();
    const result = await removeTaskSubCmd.handler([planId, taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Removed task');

    // Verify task is removed
    const tasksResult = await tasksSubCmd.handler([planId], createTestOptions({ json: true }));
    const tasks = tasksResult.data as Task[];
    expect(tasks.length).toBe(0);
  });

  test('fails without plan id and task id', async () => {
    const options = createTestOptions();
    const result = await removeTaskSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });
});

// ============================================================================
// Plan Tasks Command Tests
// ============================================================================

describe('plan tasks command', () => {
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];

  test('lists tasks in a plan', async () => {
    const planId = await createTestPlan('Test Plan');
    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    const options = createTestOptions();
    const result = await tasksSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as Task[];
    expect(tasks.length).toBe(2);
  });

  test('respects limit option', async () => {
    const planId = await createTestPlan('Test Plan');
    await addTaskSubCmd.handler([planId, await createTestTask('Task 1')], createTestOptions());
    await addTaskSubCmd.handler([planId, await createTestTask('Task 2')], createTestOptions());
    await addTaskSubCmd.handler([planId, await createTestTask('Task 3')], createTestOptions());

    const options = createTestOptions({ limit: '2' });
    const result = await tasksSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Task[]).length).toBe(2);
  });

  test('returns empty message when no tasks', async () => {
    const planId = await createTestPlan('Empty Plan');

    const options = createTestOptions();
    const result = await tasksSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No tasks');
  });

  test('fails without plan id', async () => {
    const options = createTestOptions();
    const result = await tasksSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });
});

// ============================================================================
// Plan Root Command Tests
// ============================================================================

describe('plan root command', () => {
  test('defaults to list when no subcommand', async () => {
    await createTestPlan('Test Plan');

    const options = createTestOptions();
    const result = await planCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await planCommand.handler(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error ?? '').toContain('Unknown subcommand');
  });
});

// ============================================================================
// Plan Lifecycle E2E Tests
// ============================================================================

describe('plan lifecycle scenarios', () => {
  const createSubCmd = planCommand.subcommands!['create'];
  const showSubCmd = planCommand.subcommands!['show'];
  const activateSubCmd = planCommand.subcommands!['activate'];
  const completeSubCmd = planCommand.subcommands!['complete'];
  const cancelSubCmd = planCommand.subcommands!['cancel'];
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const removeTaskSubCmd = planCommand.subcommands!['remove-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];

  test('complete plan lifecycle: draft → active → complete', async () => {
    // 1. Create plan in draft status
    const createResult = await createSubCmd.handler([], createTestOptions({ title: 'Lifecycle Plan' }));
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const planId = (createResult.data as Plan).id;
    expect((createResult.data as Plan).status).toBe(PlanStatus.DRAFT);

    // 2. Add tasks to plan
    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');
    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    // 3. Verify tasks are in plan
    const tasksResult = await tasksSubCmd.handler([planId], createTestOptions({ json: true }));
    expect((tasksResult.data as Task[]).length).toBe(2);

    // 4. Activate the plan
    const activateResult = await activateSubCmd.handler([planId], createTestOptions());
    expect(activateResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(activateResult.message).toContain('Activated');

    // 5. Verify plan is now active
    const showActiveResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    expect((showActiveResult.data as { plan: Plan }).plan.status).toBe(PlanStatus.ACTIVE);

    // 6. Complete the plan
    const completeResult = await completeSubCmd.handler([planId], createTestOptions());
    expect(completeResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(completeResult.message).toContain('Completed');

    // 7. Verify plan is completed with timestamp
    const showCompletedResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const completedPlan = (showCompletedResult.data as { plan: Plan }).plan;
    expect(completedPlan.status).toBe(PlanStatus.COMPLETED);
    expect(completedPlan.completedAt).toBeDefined();
  });

  test('plan lifecycle: draft → active → cancel', async () => {
    // 1. Create and activate plan
    const planId = await createTestPlan('Cancel Test Plan');
    await activateSubCmd.handler([planId], createTestOptions());

    // 2. Verify plan is active
    let showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    expect((showResult.data as { plan: Plan }).plan.status).toBe(PlanStatus.ACTIVE);

    // 3. Cancel the plan with reason
    const cancelResult = await cancelSubCmd.handler([planId], createTestOptions({ reason: 'Project priorities changed' }));
    expect(cancelResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(cancelResult.message).toContain('Cancelled');

    // 4. Verify plan is cancelled with reason
    showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const cancelledPlan = (showResult.data as { plan: Plan }).plan;
    expect(cancelledPlan.status).toBe(PlanStatus.CANCELLED);
    expect(cancelledPlan.cancelledAt).toBeDefined();
    expect(cancelledPlan.cancelReason).toBe('Project priorities changed');
  });

  test('plan lifecycle: draft → cancel → restart (draft)', async () => {
    // 1. Create plan
    const createResult = await createSubCmd.handler([], createTestOptions({ title: 'Restart Plan' }));
    const planId = (createResult.data as Plan).id;

    // 2. Cancel the draft plan
    await cancelSubCmd.handler([planId], createTestOptions());
    let showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    expect((showResult.data as { plan: Plan }).plan.status).toBe(PlanStatus.CANCELLED);

    // 3. Restart the plan (not currently supported via CLI, testing API directly)
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Update status back to draft (restart)
    await api.update(planId as unknown as ElementId, { status: PlanStatus.DRAFT });

    showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    expect((showResult.data as { plan: Plan }).plan.status).toBe(PlanStatus.DRAFT);

    backend.close();
  });

  test('reopen completed plan', async () => {
    // 1. Create and complete a plan
    const planId = await createTestPlan('Reopen Plan', { status: 'active' });
    await completeSubCmd.handler([planId], createTestOptions());

    // 2. Verify completed
    let showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    expect((showResult.data as { plan: Plan }).plan.status).toBe(PlanStatus.COMPLETED);

    // 3. Reopen the plan (via API)
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    await api.update(planId as unknown as ElementId, { status: PlanStatus.ACTIVE });

    showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    expect((showResult.data as { plan: Plan }).plan.status).toBe(PlanStatus.ACTIVE);

    backend.close();
  });
});

// ============================================================================
// Plan Progress Tracking E2E Tests
// ============================================================================

describe('plan progress tracking scenarios', () => {
  const showSubCmd = planCommand.subcommands!['show'];
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const removeTaskSubCmd = planCommand.subcommands!['remove-task'];

  test('progress updates as tasks are added and completed', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');

    // Create plan
    const planId = await createTestPlan('Progress Plan');

    // Initial progress should be 0
    let showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    let progress = (showResult.data as { progress: { totalTasks: number; completionPercentage: number } }).progress;
    expect(progress.totalTasks).toBe(0);
    expect(progress.completionPercentage).toBe(0);

    // Add tasks
    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');
    const task3Id = await createTestTask('Task 3');
    const task4Id = await createTestTask('Task 4');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task3Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task4Id], createTestOptions());

    // Progress should be 0% (4 tasks, none complete)
    showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    progress = (showResult.data as { progress: { totalTasks: number; completionPercentage: number } }).progress;
    expect(progress.totalTasks).toBe(4);
    expect(progress.completionPercentage).toBe(0);

    // Complete 2 tasks via API
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    await api.update(task1Id as unknown as ElementId, { status: TaskStatus.CLOSED });
    await api.update(task2Id as unknown as ElementId, { status: TaskStatus.CLOSED });

    // Progress should be 50%
    showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    progress = (showResult.data as { progress: { totalTasks: number; completionPercentage: number; completedTasks: number } }).progress;
    expect(progress.completedTasks).toBe(2);
    expect(progress.completionPercentage).toBe(50);

    // Complete remaining tasks
    await api.update(task3Id as unknown as ElementId, { status: TaskStatus.CLOSED });
    await api.update(task4Id as unknown as ElementId, { status: TaskStatus.CLOSED });

    // Progress should be 100%
    showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    progress = (showResult.data as { progress: { completionPercentage: number; completedTasks: number } }).progress;
    expect(progress.completedTasks).toBe(4);
    expect(progress.completionPercentage).toBe(100);

    backend.close();
  });

  test('progress updates when task is removed from plan', async () => {
    // Create plan with tasks
    const planId = await createTestPlan('Remove Task Progress');

    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    // Complete one task
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    await api.update(task1Id as unknown as ElementId, { status: TaskStatus.CLOSED });

    // Progress should be 50%
    let showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    let progress = (showResult.data as { progress: { completionPercentage: number } }).progress;
    expect(progress.completionPercentage).toBe(50);

    // Remove the incomplete task
    await removeTaskSubCmd.handler([planId, task2Id], createTestOptions());

    // Progress should now be 100% (only completed task remains)
    showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    progress = (showResult.data as { progress: { totalTasks: number; completionPercentage: number } }).progress;
    expect(progress.totalTasks).toBe(1);
    expect(progress.completionPercentage).toBe(100);

    backend.close();
  });

  test('progress tracks blocked and in-progress tasks', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create plan
    const planId = await createTestPlan('Mixed Status Plan');

    // Create tasks with different statuses
    const task1Id = await createTestTask('Open Task');
    const task2Id = await createTestTask('In Progress Task');
    const task3Id = await createTestTask('Blocked Task');
    const task4Id = await createTestTask('Completed Task');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task3Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task4Id], createTestOptions());

    // Update statuses
    await api.update(task2Id as unknown as ElementId, { status: TaskStatus.IN_PROGRESS });
    await api.update(task3Id as unknown as ElementId, { status: TaskStatus.BLOCKED });
    await api.update(task4Id as unknown as ElementId, { status: TaskStatus.CLOSED });

    // Check progress
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const progress = (showResult.data as { progress: {
      totalTasks: number;
      completedTasks: number;
      inProgressTasks: number;
      blockedTasks: number;
      remainingTasks: number;
      completionPercentage: number;
    } }).progress;

    expect(progress.totalTasks).toBe(4);
    expect(progress.completedTasks).toBe(1);
    expect(progress.inProgressTasks).toBe(1);
    expect(progress.blockedTasks).toBe(1);
    expect(progress.remainingTasks).toBe(1); // open task
    expect(progress.completionPercentage).toBe(25);

    backend.close();
  });
});

// ============================================================================
// Plan Task Management E2E Tests
// ============================================================================

describe('plan task management scenarios', () => {
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const removeTaskSubCmd = planCommand.subcommands!['remove-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('task can be moved between plans', async () => {
    const plan1Id = await createTestPlan('Plan 1');
    const plan2Id = await createTestPlan('Plan 2');
    const taskId = await createTestTask('Movable Task');

    // Add task to plan 1
    await addTaskSubCmd.handler([plan1Id, taskId], createTestOptions());

    // Verify task is in plan 1
    let tasksResult = await tasksSubCmd.handler([plan1Id], createTestOptions({ json: true }));
    expect((tasksResult.data as Task[]).map((t) => t.id)).toContain(taskId);

    // Remove from plan 1
    await removeTaskSubCmd.handler([plan1Id, taskId], createTestOptions());

    // Verify task is no longer in plan 1
    tasksResult = await tasksSubCmd.handler([plan1Id], createTestOptions({ json: true }));
    expect((tasksResult.data as Task[]).length).toBe(0);

    // Add task to plan 2
    const addResult = await addTaskSubCmd.handler([plan2Id, taskId], createTestOptions());
    expect(addResult.exitCode).toBe(ExitCode.SUCCESS);

    // Verify task is in plan 2
    tasksResult = await tasksSubCmd.handler([plan2Id], createTestOptions({ json: true }));
    expect((tasksResult.data as Task[]).map((t) => t.id)).toContain(taskId);
  });

  test('cannot add task to multiple plans simultaneously', async () => {
    const plan1Id = await createTestPlan('Plan A');
    const plan2Id = await createTestPlan('Plan B');
    const taskId = await createTestTask('Single Plan Task');

    // Add task to plan 1
    await addTaskSubCmd.handler([plan1Id, taskId], createTestOptions());

    // Try to add same task to plan 2 - should fail
    const addResult = await addTaskSubCmd.handler([plan2Id, taskId], createTestOptions());
    expect(addResult.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(addResult.error).toContain('already');
  });

  test('adding multiple tasks to a plan preserves order', async () => {
    const planId = await createTestPlan('Ordered Plan');

    // Create and add tasks in order
    const taskIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const taskId = await createTestTask(`Task ${i}`);
      taskIds.push(taskId);
      await addTaskSubCmd.handler([planId, taskId], createTestOptions());
    }

    // Get tasks from plan
    const tasksResult = await tasksSubCmd.handler([planId], createTestOptions({ json: true }));
    const tasks = tasksResult.data as Task[];
    expect(tasks.length).toBe(5);

    // Verify all tasks are present
    for (const taskId of taskIds) {
      expect(tasks.map((t) => t.id)).toContain(taskId);
    }
  });

  test('hierarchical task creation with createTaskInPlan', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create plan
    const planId = await createTestPlan('Hierarchical Plan');

    // Create tasks in plan using API (generates hierarchical IDs)
    const task1 = await api.createTaskInPlan(planId as unknown as ElementId, {
      title: 'Subtask 1',
      createdBy: 'test-user' as import('../../types/element.js').EntityId,
    });

    const task2 = await api.createTaskInPlan(planId as unknown as ElementId, {
      title: 'Subtask 2',
      createdBy: 'test-user' as import('../../types/element.js').EntityId,
    });

    // Verify hierarchical IDs
    expect(task1.id).toBe(`${planId}.1`);
    expect(task2.id).toBe(`${planId}.2`);

    // Verify tasks appear in plan
    const tasksResult = await tasksSubCmd.handler([planId], createTestOptions({ json: true }));
    const tasks = tasksResult.data as Task[];
    expect(tasks.length).toBe(2);
    expect(tasks.map((t) => t.id)).toContain(task1.id);
    expect(tasks.map((t) => t.id)).toContain(task2.id);

    backend.close();
  });
});

// ============================================================================
// Plan with Multiple Status Transitions E2E Tests
// ============================================================================

describe('plan status transition validation scenarios', () => {
  const showSubCmd = planCommand.subcommands!['show'];
  const activateSubCmd = planCommand.subcommands!['activate'];
  const completeSubCmd = planCommand.subcommands!['complete'];
  const cancelSubCmd = planCommand.subcommands!['cancel'];

  test('cannot complete a draft plan', async () => {
    const planId = await createTestPlan('Draft Plan');

    const completeResult = await completeSubCmd.handler([planId], createTestOptions());
    expect(completeResult.exitCode).toBe(ExitCode.VALIDATION);
    expect(completeResult.error).toContain('Cannot complete');
  });

  test('cannot activate a completed plan', async () => {
    const planId = await createTestPlan('Complete Then Activate', { status: 'active' });
    await completeSubCmd.handler([planId], createTestOptions());

    const activateResult = await activateSubCmd.handler([planId], createTestOptions());
    expect(activateResult.exitCode).toBe(ExitCode.VALIDATION);
    expect(activateResult.error).toContain('Cannot activate');
  });

  test('cannot cancel a completed plan', async () => {
    const planId = await createTestPlan('Complete Then Cancel', { status: 'active' });
    await completeSubCmd.handler([planId], createTestOptions());

    const cancelResult = await cancelSubCmd.handler([planId], createTestOptions());
    expect(cancelResult.exitCode).toBe(ExitCode.VALIDATION);
    expect(cancelResult.error).toContain('Cannot cancel');
  });

  test('already active plan returns success message', async () => {
    const planId = await createTestPlan('Already Active', { status: 'active' });

    const activateResult = await activateSubCmd.handler([planId], createTestOptions());
    expect(activateResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(activateResult.message).toContain('already active');
  });

  test('already completed plan returns success message', async () => {
    const planId = await createTestPlan('Already Completed', { status: 'active' });
    await completeSubCmd.handler([planId], createTestOptions());

    const completeResult = await completeSubCmd.handler([planId], createTestOptions());
    expect(completeResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(completeResult.message).toContain('already completed');
  });

  test('already cancelled plan returns success message', async () => {
    const planId = await createTestPlan('Already Cancelled');
    await cancelSubCmd.handler([planId], createTestOptions());

    const cancelResult = await cancelSubCmd.handler([planId], createTestOptions());
    expect(cancelResult.exitCode).toBe(ExitCode.SUCCESS);
    expect(cancelResult.message).toContain('already cancelled');
  });
});

// ============================================================================
// Plan Auto-Complete Command Tests
// ============================================================================

describe('plan auto-complete command', () => {
  const autoCompleteSubCmd = planCommand.subcommands!['auto-complete'];
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('auto-completes active plan where all tasks are closed', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create active plan with tasks
    const planId = await createTestPlan('Auto-Complete Plan', { status: 'active' });
    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    // Close all tasks
    await api.update(task1Id as unknown as ElementId, { status: TaskStatus.CLOSED });
    await api.update(task2Id as unknown as ElementId, { status: TaskStatus.CLOSED });

    backend.close();

    // Run auto-complete
    const result = await autoCompleteSubCmd.handler([], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { checked: number; autoCompleted: Array<{ id: string }> };
    expect(data.autoCompleted.length).toBe(1);
    expect(data.autoCompleted[0].id).toBe(planId);

    // Verify plan is now completed
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const plan = (showResult.data as { plan: Plan }).plan;
    expect(plan.status).toBe(PlanStatus.COMPLETED);
    expect(plan.completedAt).toBeDefined();
  });

  test('does not auto-complete plan with non-closed tasks', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create active plan with mixed-status tasks
    const planId = await createTestPlan('Mixed Plan', { status: 'active' });
    const task1Id = await createTestTask('Closed Task');
    const task2Id = await createTestTask('Open Task');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    // Close only one task
    await api.update(task1Id as unknown as ElementId, { status: TaskStatus.CLOSED });

    backend.close();

    // Run auto-complete
    const result = await autoCompleteSubCmd.handler([], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { checked: number; autoCompleted: Array<{ id: string }> };
    expect(data.autoCompleted.length).toBe(0);

    // Verify plan is still active
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const plan = (showResult.data as { plan: Plan }).plan;
    expect(plan.status).toBe(PlanStatus.ACTIVE);
  });

  test('returns clean message when no active plans exist', async () => {
    // Create a draft plan (not active) so DB exists
    await createTestPlan('Draft Plan');

    const result = await autoCompleteSubCmd.handler([], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No active plans');
  });

  test('is idempotent - running again after completion does nothing', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create active plan with closed tasks
    const planId = await createTestPlan('Idempotent Plan', { status: 'active' });
    const taskId = await createTestTask('Done Task');
    await addTaskSubCmd.handler([planId, taskId], createTestOptions());
    await api.update(taskId as unknown as ElementId, { status: TaskStatus.CLOSED });

    backend.close();

    // First run - should auto-complete
    const result1 = await autoCompleteSubCmd.handler([], createTestOptions());
    expect(result1.exitCode).toBe(ExitCode.SUCCESS);
    const data1 = result1.data as { autoCompleted: Array<{ id: string }> };
    expect(data1.autoCompleted.length).toBe(1);

    // Second run - nothing to do
    const result2 = await autoCompleteSubCmd.handler([], createTestOptions());
    expect(result2.exitCode).toBe(ExitCode.SUCCESS);
    const data2 = result2.data as { checked: number; autoCompleted: Array<{ id: string }> };
    expect(data2.checked).toBe(0);
    expect(data2.autoCompleted.length).toBe(0);
  });

  test('dry-run shows eligible plans without completing them', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create active plan with closed tasks
    const planId = await createTestPlan('Dry Run Plan', { status: 'active' });
    const taskId = await createTestTask('Done Task');
    await addTaskSubCmd.handler([planId, taskId], createTestOptions());
    await api.update(taskId as unknown as ElementId, { status: TaskStatus.CLOSED });

    backend.close();

    // Run with dry-run
    const result = await autoCompleteSubCmd.handler([], createTestOptions({ 'dry-run': true }));

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { autoCompleted: Array<{ id: string }>; dryRun: boolean };
    expect(data.dryRun).toBe(true);
    expect(data.autoCompleted.length).toBe(1);

    // Verify plan is still active (not completed)
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const plan = (showResult.data as { plan: Plan }).plan;
    expect(plan.status).toBe(PlanStatus.ACTIVE);
  });

  test('auto-completes multiple eligible plans', async () => {
    const { createQuarryAPI } = await import('../../api/quarry-api.js');
    const { createStorage, initializeSchema } = await import('@stoneforge/storage');
    const { TaskStatus } = await import('@stoneforge/core');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create multiple active plans with closed tasks
    const plan1Id = await createTestPlan('Plan A', { status: 'active' });
    const plan2Id = await createTestPlan('Plan B', { status: 'active' });
    const plan3Id = await createTestPlan('Plan C (not ready)', { status: 'active' });

    const task1Id = await createTestTask('Task A');
    const task2Id = await createTestTask('Task B');
    const task3Id = await createTestTask('Task C');

    await addTaskSubCmd.handler([plan1Id, task1Id], createTestOptions());
    await addTaskSubCmd.handler([plan2Id, task2Id], createTestOptions());
    await addTaskSubCmd.handler([plan3Id, task3Id], createTestOptions());

    // Close tasks for plan 1 and 2 only
    await api.update(task1Id as unknown as ElementId, { status: TaskStatus.CLOSED });
    await api.update(task2Id as unknown as ElementId, { status: TaskStatus.CLOSED });

    backend.close();

    // Run auto-complete
    const result = await autoCompleteSubCmd.handler([], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { checked: number; autoCompleted: Array<{ id: string }>; skipped: Array<{ id: string }> };
    expect(data.checked).toBe(3);
    expect(data.autoCompleted.length).toBe(2);
    expect(data.skipped.length).toBe(1);
  });

  test('sweep alias also works', () => {
    const sweepSubCmd = planCommand.subcommands!['sweep'];
    expect(sweepSubCmd).toBeDefined();
    expect(sweepSubCmd.name).toBe('auto-complete');
  });

  test('returns JSON in JSON mode', async () => {
    // Create a draft plan so the database exists
    await createTestPlan('Draft Plan');

    const result = await autoCompleteSubCmd.handler([], createTestOptions({ json: true }));

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { checked: number; autoCompleted: unknown[]; plans: unknown[] };
    expect(data.checked).toBe(0);
    expect(data.autoCompleted).toBeDefined();
  });

  test('does not auto-complete plan with no tasks', async () => {
    // Create active plan with no tasks
    await createTestPlan('Empty Plan', { status: 'active' });

    // Run auto-complete
    const result = await autoCompleteSubCmd.handler([], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { autoCompleted: Array<{ id: string }> };
    expect(data.autoCompleted.length).toBe(0);
  });
});
