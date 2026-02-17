/**
 * Plan Commands - Collection command interface for plans
 *
 * Provides CLI commands for plan operations:
 * - plan create: Create a new plan
 * - plan list: List plans with filtering
 * - plan show: Show plan details with progress
 * - plan activate: Activate a plan (draft -> active)
 * - plan complete: Complete a plan (active -> completed)
 * - plan cancel: Cancel a plan
 * - plan add-task: Add a task to a plan
 * - plan remove-task: Remove a task from a plan
 * - plan tasks: List tasks in a plan
 * - plan auto-complete: Auto-complete active plans where all tasks are closed
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, getStatusIcon } from '../formatter.js';
import { createPlan, PlanStatus, canAutoComplete, TaskStatus, type CreatePlanInput, type Plan } from '@stoneforge/core';
import type { Task } from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI, TaskFilter } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Plan Create Command
// ============================================================================

interface PlanCreateOptions {
  title?: string;
  status?: string;
  tag?: string[];
}

const planCreateOptions: CommandOption[] = [
  {
    name: 'title',
    short: 't',
    description: 'Plan title (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'status',
    short: 's',
    description: 'Initial status (draft, active). Default: draft',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Add a tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

async function planCreateHandler(
  _args: string[],
  options: GlobalOptions & PlanCreateOptions
): Promise<CommandResult> {
  if (!options.title) {
    return failure('--title is required for creating a plan', ExitCode.INVALID_ARGUMENTS);
  }

  // Validate status if provided
  if (options.status) {
    const validStatuses: PlanStatus[] = [PlanStatus.DRAFT, PlanStatus.ACTIVE];
    if (!validStatuses.includes(options.status as PlanStatus)) {
      return failure(
        `Invalid initial status: ${options.status}. Must be one of: draft, active`,
        ExitCode.VALIDATION
      );
    }
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    const input: CreatePlanInput = {
      title: options.title,
      createdBy: actor,
      status: (options.status as PlanStatus) ?? PlanStatus.DRAFT,
      ...(tags && { tags }),
    };

    const plan = await createPlan(input);
    const created = await api.create(plan as unknown as Element & Record<string, unknown>);

    return success(created, `Created plan ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create plan: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planCreateCommand: Command = {
  name: 'create',
  description: 'Create a new plan',
  usage: 'sf plan create --title <title> [options]',
  help: `Create a new plan to organize related tasks.

Options:
  -t, --title <text>    Plan title (required)
  -s, --status <status> Initial status: draft (default) or active
      --tag <tag>       Add a tag (can be repeated)

Examples:
  sf plan create --title "Q1 Feature Roadmap"
  sf plan create -t "Sprint 3" --status active
  sf plan create --title "Bug Backlog" --tag urgent --tag backend`,
  options: planCreateOptions,
  handler: planCreateHandler as Command['handler'],
};

// ============================================================================
// Plan List Command
// ============================================================================

interface PlanListOptions {
  status?: string;
  tag?: string[];
  limit?: string;
}

const planListOptions: CommandOption[] = [
  {
    name: 'status',
    short: 's',
    description: 'Filter by status (draft, active, completed, cancelled)',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Filter by tag (can be repeated for AND)',
    hasValue: true,
    array: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function planListHandler(
  _args: string[],
  options: GlobalOptions & PlanListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'plan',
    };

    // Status filter
    if (options.status) {
      const validStatuses = Object.values(PlanStatus);
      if (!validStatuses.includes(options.status as PlanStatus)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status;
    }

    // Tag filter
    if (options.tag) {
      filter.tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Plan>(filter);

    // Post-filter by status since the API doesn't filter by status for plans
    let items = result.items;
    if (options.status) {
      items = items.filter((p) => p.status === options.status);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((p) => p.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No plans found');
    }

    // Build table with progress info
    const headers = ['ID', 'TITLE', 'STATUS', 'PROGRESS', 'CREATED'];
    const rows: string[][] = [];

    for (const plan of items) {
      // Get progress for each plan
      let progressStr = '-';
      try {
        const progress = await api.getPlanProgress(plan.id);
        progressStr = `${progress.completionPercentage}% (${progress.completedTasks}/${progress.totalTasks})`;
      } catch {
        // Ignore progress fetch errors
      }

      const status = `${getStatusIcon(plan.status)} ${plan.status}`;
      const created = plan.createdAt.split('T')[0];
      rows.push([plan.id, plan.title, status, progressStr, created]);
    }

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} plans`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list plans: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planListCommand: Command = {
  name: 'list',
  description: 'List plans',
  usage: 'sf plan list [options]',
  help: `List plans with optional filtering.

Options:
  -s, --status <status> Filter by status: draft, active, completed, cancelled
      --tag <tag>       Filter by tag (can be repeated)
  -l, --limit <n>       Maximum results

Examples:
  sf plan list
  sf plan list --status active
  sf plan list --tag sprint --tag q1`,
  options: planListOptions,
  handler: planListHandler as Command['handler'],
};

// ============================================================================
// Plan Show Command
// ============================================================================

interface PlanShowOptions {
  tasks?: boolean;
}

const planShowOptions: CommandOption[] = [
  {
    name: 'tasks',
    short: 't',
    description: 'Include task list',
    hasValue: false,
  },
];

async function planShowHandler(
  args: string[],
  options: GlobalOptions & PlanShowOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf plan show <id>\nExample: sf plan show el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(`Plan not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(`Element ${id} is not a plan (type: ${plan.type})`, ExitCode.VALIDATION);
    }

    // Get progress
    const progress = await api.getPlanProgress(id as ElementId);

    // Get tasks if requested
    let tasks: Task[] | undefined;
    if (options.tasks) {
      tasks = await api.getTasksInPlan(id as ElementId);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success({ plan, progress, ...(tasks && { tasks }) });
    }

    if (mode === 'quiet') {
      return success(plan.id);
    }

    // Human-readable output
    let output = formatter.element(plan as unknown as Record<string, unknown>);

    // Add progress section
    output += '\n\n--- Task Progress ---\n';
    output += `Total:       ${progress.totalTasks}\n`;
    output += `Completed:   ${progress.completedTasks}\n`;
    output += `In Progress: ${progress.inProgressTasks}\n`;
    output += `Blocked:     ${progress.blockedTasks}\n`;
    output += `Ready:       ${progress.remainingTasks}\n`;
    output += `Progress:    ${progress.completionPercentage}%`;

    // Add tasks section if requested
    if (tasks && tasks.length > 0) {
      output += '\n\n--- Tasks ---\n';
      const taskHeaders = ['ID', 'TITLE', 'STATUS', 'PRIORITY'];
      const taskRows = tasks.map((t) => [
        t.id,
        t.title.length > 40 ? t.title.substring(0, 37) + '...' : t.title,
        `${getStatusIcon(t.status)} ${t.status}`,
        `P${t.priority ?? 3}`,
      ]);
      output += formatter.table(taskHeaders, taskRows);
    } else if (options.tasks) {
      output += '\n\n--- Tasks ---\nNo tasks';
    }

    return success({ plan, progress }, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to show plan: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planShowCommand: Command = {
  name: 'show',
  description: 'Show plan details',
  usage: 'sf plan show <id> [options]',
  help: `Display detailed information about a plan including progress.

Arguments:
  id    Plan identifier (e.g., el-abc123)

Options:
  -t, --tasks    Include list of tasks in the plan

Examples:
  sf plan show el-abc123
  sf plan show el-abc123 --tasks
  sf plan show el-abc123 --json`,
  options: planShowOptions,
  handler: planShowHandler as Command['handler'],
};

// ============================================================================
// Plan Activate Command
// ============================================================================

async function planActivateHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf plan activate <id>\nExample: sf plan activate el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(`Plan not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(`Element ${id} is not a plan (type: ${plan.type})`, ExitCode.VALIDATION);
    }

    if (plan.status === PlanStatus.ACTIVE) {
      return success(plan, `Plan ${id} is already active`);
    }

    if (plan.status !== PlanStatus.DRAFT) {
      return failure(
        `Cannot activate plan: current status is '${plan.status}'. Only draft plans can be activated.`,
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);
    const updated = await api.update<Plan>(id as ElementId, { status: PlanStatus.ACTIVE }, { actor });

    return success(updated, `Activated plan ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to activate plan: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planActivateCommand: Command = {
  name: 'activate',
  description: 'Activate a draft plan',
  usage: 'sf plan activate <id>',
  help: `Transition a plan from draft to active status.

Arguments:
  id    Plan identifier

Examples:
  sf plan activate el-abc123`,
  handler: planActivateHandler as Command['handler'],
};

// ============================================================================
// Plan Complete Command
// ============================================================================

async function planCompleteHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf plan complete <id>\nExample: sf plan complete el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(`Plan not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(`Element ${id} is not a plan (type: ${plan.type})`, ExitCode.VALIDATION);
    }

    if (plan.status === PlanStatus.COMPLETED) {
      return success(plan, `Plan ${id} is already completed`);
    }

    if (plan.status !== PlanStatus.ACTIVE) {
      return failure(
        `Cannot complete plan: current status is '${plan.status}'. Only active plans can be completed.`,
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);
    const now = new Date().toISOString();
    const updated = await api.update<Plan>(
      id as ElementId,
      { status: PlanStatus.COMPLETED, completedAt: now },
      { actor }
    );

    return success(updated, `Completed plan ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to complete plan: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planCompleteCommand: Command = {
  name: 'complete',
  description: 'Complete an active plan',
  usage: 'sf plan complete <id>',
  help: `Transition a plan from active to completed status.

Arguments:
  id    Plan identifier

Examples:
  sf plan complete el-abc123`,
  handler: planCompleteHandler as Command['handler'],
};

// ============================================================================
// Plan Cancel Command
// ============================================================================

interface PlanCancelOptions {
  reason?: string;
}

const planCancelOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: 'Cancellation reason',
    hasValue: true,
  },
];

async function planCancelHandler(
  args: string[],
  options: GlobalOptions & PlanCancelOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf plan cancel <id>\nExample: sf plan cancel el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const plan = await api.get<Plan>(id as ElementId);

    if (!plan) {
      return failure(`Plan not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (plan.type !== 'plan') {
      return failure(`Element ${id} is not a plan (type: ${plan.type})`, ExitCode.VALIDATION);
    }

    if (plan.status === PlanStatus.CANCELLED) {
      return success(plan, `Plan ${id} is already cancelled`);
    }

    if (plan.status === PlanStatus.COMPLETED) {
      return failure(
        `Cannot cancel plan: current status is '${plan.status}'. Completed plans cannot be cancelled.`,
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);
    const now = new Date().toISOString();
    const updates: Partial<Plan> = {
      status: PlanStatus.CANCELLED,
      cancelledAt: now,
    };
    if (options.reason) {
      updates.cancelReason = options.reason;
    }

    const updated = await api.update<Plan>(id as ElementId, updates, { actor });

    return success(updated, `Cancelled plan ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to cancel plan: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planCancelCommand: Command = {
  name: 'cancel',
  description: 'Cancel a plan',
  usage: 'sf plan cancel <id> [options]',
  help: `Cancel a draft or active plan.

Arguments:
  id    Plan identifier

Options:
  -r, --reason <text>    Cancellation reason

Examples:
  sf plan cancel el-abc123
  sf plan cancel el-abc123 --reason "Requirements changed"`,
  options: planCancelOptions,
  handler: planCancelHandler as Command['handler'],
};

// ============================================================================
// Plan Add Task Command
// ============================================================================

async function planAddTaskHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [planId, taskId] = args;

  if (!planId || !taskId) {
    return failure('Usage: sf plan add-task <plan-id> <task-id>\nExample: sf plan add-task el-plan123 el-task456', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify plan exists
    const plan = await api.get<Plan>(planId as ElementId);
    if (!plan) {
      return failure(`Plan not found: ${planId}`, ExitCode.NOT_FOUND);
    }
    if (plan.type !== 'plan') {
      return failure(`Element ${planId} is not a plan (type: ${plan.type})`, ExitCode.VALIDATION);
    }
    if (plan.status === PlanStatus.CANCELLED) {
      return failure(
        `Cannot add task to plan with status 'cancelled'`,
        ExitCode.VALIDATION
      );
    }

    // Verify task exists
    const task = await api.get<Task>(taskId as ElementId);
    if (!task) {
      return failure(`Task not found: ${taskId}`, ExitCode.NOT_FOUND);
    }
    if (task.type !== 'task') {
      return failure(`Element ${taskId} is not a task (type: ${task.type})`, ExitCode.VALIDATION);
    }

    const actor = resolveActor(options);
    await api.addTaskToPlan(taskId as ElementId, planId as ElementId, { actor });

    return success({ planId, taskId }, `Added task ${taskId} to plan ${planId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to add task to plan: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planAddTaskCommand: Command = {
  name: 'add-task',
  description: 'Add a task to a plan',
  usage: 'sf plan add-task <plan-id> <task-id>',
  help: `Add an existing task to a plan.

Arguments:
  plan-id    Plan identifier
  task-id    Task identifier to add

Examples:
  sf plan add-task el-plan123 el-task456`,
  handler: planAddTaskHandler as Command['handler'],
};

// ============================================================================
// Plan Remove Task Command
// ============================================================================

async function planRemoveTaskHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [planId, taskId] = args;

  if (!planId || !taskId) {
    return failure('Usage: sf plan remove-task <plan-id> <task-id>\nExample: sf plan remove-task el-plan123 el-task456', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    await api.removeTaskFromPlan(taskId as ElementId, planId as ElementId, actor);

    return success({ planId, taskId }, `Removed task ${taskId} from plan ${planId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to remove task from plan: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planRemoveTaskCommand: Command = {
  name: 'remove-task',
  description: 'Remove a task from a plan',
  usage: 'sf plan remove-task <plan-id> <task-id>',
  help: `Remove a task from a plan.

Arguments:
  plan-id    Plan identifier
  task-id    Task identifier to remove

Examples:
  sf plan remove-task el-plan123 el-task456`,
  handler: planRemoveTaskHandler as Command['handler'],
};

// ============================================================================
// Plan Tasks Command
// ============================================================================

interface PlanTasksOptions {
  status?: string;
  limit?: string;
}

const planTasksOptions: CommandOption[] = [
  {
    name: 'status',
    short: 's',
    description: 'Filter by task status',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function planTasksHandler(
  args: string[],
  options: GlobalOptions & PlanTasksOptions
): Promise<CommandResult> {
  const [planId] = args;

  if (!planId) {
    return failure('Usage: sf plan tasks <plan-id>\nExample: sf plan tasks el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: TaskFilter = {};

    if (options.status) {
      filter.status = options.status as TaskFilter['status'];
    }

    let limit: number | undefined;
    if (options.limit) {
      limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
    }

    let tasks = await api.getTasksInPlan(planId as ElementId, filter);

    // Apply limit (since getTasksInPlan doesn't support pagination directly)
    if (limit !== undefined && tasks.length > limit) {
      tasks = tasks.slice(0, limit);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    if (tasks.length === 0) {
      return success(null, 'No tasks in plan');
    }

    const headers = ['ID', 'TITLE', 'STATUS', 'PRIORITY', 'ASSIGNEE'];
    const rows = tasks.map((t) => [
      t.id,
      t.title.length > 40 ? t.title.substring(0, 37) + '...' : t.title,
      `${getStatusIcon(t.status)} ${t.status}`,
      `P${t.priority ?? 3}`,
      t.assignee ?? '-',
    ]);

    const table = formatter.table(headers, rows);
    return success(tasks, table + `\n${tasks.length} task(s)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list plan tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planTasksCommand: Command = {
  name: 'tasks',
  description: 'List tasks in a plan',
  usage: 'sf plan tasks <plan-id> [options]',
  help: `List tasks belonging to a plan.

Arguments:
  plan-id    Plan identifier

Options:
  -s, --status <status>  Filter by status
  -l, --limit <n>        Maximum results

Examples:
  sf plan tasks el-abc123
  sf plan tasks el-abc123 --status open`,
  options: planTasksOptions,
  handler: planTasksHandler as Command['handler'],
};

// ============================================================================
// Plan Auto-Complete Command
// ============================================================================

interface PlanAutoCompleteOptions {
  dryRun?: boolean;
}

const planAutoCompleteOptions: CommandOption[] = [
  {
    name: 'dry-run',
    description: 'Show what would be auto-completed without making changes',
    hasValue: false,
  },
];

async function planAutoCompleteHandler(
  _args: string[],
  options: GlobalOptions & PlanAutoCompleteOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  const isDryRun = !!(options as Record<string, unknown>)['dry-run'] || !!options.dryRun;

  try {
    const actor = resolveActor(options);

    // 1. List all active plans
    const allPlans = await api.list<Plan>({ type: 'plan' });
    const activePlans = allPlans.filter((p) => p.status === PlanStatus.ACTIVE);

    if (activePlans.length === 0) {
      return success(
        { checked: 0, autoCompleted: [], skipped: [], dryRun: isDryRun },
        'No active plans found. Nothing to do.'
      );
    }

    // 2. Check each active plan for auto-completion eligibility
    const autoCompleted: Array<{ id: string; title: string }> = [];
    const skipped: Array<{ id: string; title: string; reason: string }> = [];

    for (const plan of activePlans) {
      try {
        // Get tasks and build status counts
        const tasks = await api.getTasksInPlan(plan.id, { includeDeleted: false });

        const statusCounts: Record<string, number> = {
          [TaskStatus.OPEN]: 0,
          [TaskStatus.IN_PROGRESS]: 0,
          [TaskStatus.BLOCKED]: 0,
          [TaskStatus.CLOSED]: 0,
          [TaskStatus.DEFERRED]: 0,
          [TaskStatus.TOMBSTONE]: 0,
        };

        for (const task of tasks) {
          if (task.status in statusCounts) {
            statusCounts[task.status]++;
          }
        }

        // 3. Check if plan can be auto-completed
        if (canAutoComplete(statusCounts as Record<TaskStatus, number>)) {
          if (!isDryRun) {
            const now = new Date().toISOString();
            await api.update<Plan>(
              plan.id,
              { status: PlanStatus.COMPLETED, completedAt: now },
              { actor }
            );
          }
          autoCompleted.push({ id: plan.id, title: plan.title });
        } else {
          const nonClosed = tasks.filter((t) => t.status !== TaskStatus.CLOSED);
          const reason =
            tasks.length === 0
              ? 'no tasks'
              : `${nonClosed.length} non-closed task(s)`;
          skipped.push({ id: plan.id, title: plan.title, reason });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        skipped.push({ id: plan.id, title: plan.title, reason: `error: ${message}` });
      }
    }

    // 4. Build summary output
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ checked: activePlans.length, autoCompleted, skipped, dryRun: isDryRun });
    }

    const prefix = isDryRun ? '[DRY RUN] ' : '';
    let output = `${prefix}Plan auto-complete sweep\n`;
    output += `${'─'.repeat(40)}\n`;
    output += `Checked:        ${activePlans.length} active plan(s)\n`;
    output += `Auto-completed: ${autoCompleted.length}\n`;

    if (autoCompleted.length > 0) {
      output += `\n${isDryRun ? 'Would auto-complete' : 'Auto-completed'}:\n`;
      for (const plan of autoCompleted) {
        output += `  ✓ ${plan.id}  ${plan.title}\n`;
      }
    }

    if (autoCompleted.length === 0) {
      output += `\nNo plans eligible for auto-completion.`;
    }

    return success(
      { checked: activePlans.length, autoCompleted, skipped, dryRun: isDryRun },
      output
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to run auto-complete sweep: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const planAutoCompleteCommand: Command = {
  name: 'auto-complete',
  description: 'Auto-complete active plans where all tasks are closed',
  usage: 'sf plan auto-complete [options]',
  help: `Scan all active plans and transition those with all tasks closed to completed status.

This command is idempotent and safe to run at any time. It serves as both a
backfill tool for stuck plans and an ongoing maintenance command.

Options:
      --dry-run    Show what would be auto-completed without making changes

Examples:
  sf plan auto-complete
  sf plan auto-complete --dry-run
  sf plan auto-complete --json`,
  options: planAutoCompleteOptions,
  handler: planAutoCompleteHandler as Command['handler'],
};

// ============================================================================
// Plan Root Command
// ============================================================================

export const planCommand: Command = {
  name: 'plan',
  description: 'Manage plans (task collections)',
  usage: 'sf plan <subcommand> [options]',
  help: `Manage plans - collections of related tasks.

Subcommands:
  create        Create a new plan
  list          List plans
  show          Show plan details with progress
  activate      Activate a draft plan
  complete      Complete an active plan
  cancel        Cancel a plan
  add-task      Add a task to a plan
  remove-task   Remove a task from a plan
  tasks         List tasks in a plan
  auto-complete Sweep active plans and auto-complete eligible ones

Examples:
  sf plan create --title "Q1 Roadmap"
  sf plan list --status active
  sf plan show el-abc123 --tasks
  sf plan activate el-abc123
  sf plan add-task el-plan123 el-task456
  sf plan auto-complete --dry-run`,
  subcommands: {
    create: planCreateCommand,
    list: planListCommand,
    show: planShowCommand,
    activate: planActivateCommand,
    complete: planCompleteCommand,
    cancel: planCancelCommand,
    'add-task': planAddTaskCommand,
    'remove-task': planRemoveTaskCommand,
    tasks: planTasksCommand,
    'auto-complete': planAutoCompleteCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: planCreateCommand,
    add: planCreateCommand,
    ls: planListCommand,
    get: planShowCommand,
    view: planShowCommand,
    sweep: planAutoCompleteCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return planListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(planCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf plan --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
