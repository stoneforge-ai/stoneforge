/**
 * Workflow Commands - Collection command interface for workflows
 *
 * Provides CLI commands for workflow operations:
 * - workflow create: Instantiate a playbook into a workflow
 * - workflow list: List workflows with filtering
 * - workflow show: Show workflow details
 * - workflow tasks: List tasks in a workflow
 * - workflow progress: Show workflow progress metrics
 * - workflow delete: Delete ephemeral workflow and tasks
 * - workflow promote: Promote ephemeral to durable
 * - workflow gc: Garbage collect old ephemeral workflows
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, getStatusIcon } from '../formatter.js';
import {
  createWorkflow,
  WorkflowStatus,
  promoteWorkflow,
  filterGarbageCollectionByAge,
  type Workflow,
  type CreateWorkflowInput,
} from '@stoneforge/core';
import type { Element, ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import { suggestCommands } from '../suggest.js';
import { resolveActor, createAPI } from '../db.js';

// ============================================================================
// Constants
// ============================================================================

// Default GC age: 7 days in milliseconds
const DEFAULT_GC_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// Workflow Create Command
// ============================================================================

interface WorkflowCreateOptions {
  var?: string | string[];
  ephemeral?: boolean;
  title?: string;
}

const workflowCreateOptions: CommandOption[] = [
  {
    name: 'var',
    description: 'Set variable (name=value, can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'ephemeral',
    short: 'e',
    description: 'Create as ephemeral (not synced)',
    hasValue: false,
  },
  {
    name: 'title',
    short: 't',
    description: 'Override workflow title',
    hasValue: true,
  },
];

async function workflowCreateHandler(
  args: string[],
  options: GlobalOptions & WorkflowCreateOptions
): Promise<CommandResult> {
  const [playbookNameOrId] = args;

  if (!playbookNameOrId) {
    return failure('Usage: sf workflow create <playbook> [options]\nExample: sf workflow create deploy --var env=prod', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Parse variables
    const variables: Record<string, unknown> = {};
    if (options.var) {
      const varArgs = Array.isArray(options.var) ? options.var : [options.var];
      for (const varArg of varArgs) {
        const eqIndex = varArg.indexOf('=');
        if (eqIndex === -1) {
          return failure(
            `Invalid variable format: ${varArg}. Use name=value`,
            ExitCode.VALIDATION
          );
        }
        const name = varArg.slice(0, eqIndex);
        const value = varArg.slice(eqIndex + 1);
        variables[name] = value;
      }
    }

    // For now, create a workflow directly
    // TODO: When playbook instantiation is implemented, look up playbook and create workflow
    const title = options.title || `Workflow from ${playbookNameOrId}`;

    const input: CreateWorkflowInput = {
      title,
      createdBy: actor,
      ephemeral: options.ephemeral ?? false,
      variables,
      // playbookId would be set here when playbook lookup is implemented
    };

    const workflow = await createWorkflow(input);
    const created = await api.create(workflow as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created workflow ${created.id}${options.ephemeral ? ' (ephemeral)' : ''}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowCreateCommand: Command = {
  name: 'create',
  description: 'Instantiate a playbook into a workflow',
  usage: 'sf workflow create <playbook> [options]',
  help: `Create a workflow by instantiating a playbook template.

Arguments:
  playbook    Playbook name or ID to instantiate

Options:
      --var <name=value>  Set variable (can be repeated)
  -e, --ephemeral         Create as ephemeral (not synced to JSONL)
  -t, --title <text>      Override workflow title

Examples:
  sf workflow create deploy --var env=prod --var version=1.2
  sf workflow create sprint-setup --ephemeral
  sf workflow create deploy --title "Production Deploy v1.2"`,
  options: workflowCreateOptions,
  handler: workflowCreateHandler as Command['handler'],
};

// ============================================================================
// Workflow List Command
// ============================================================================

interface WorkflowListOptions {
  status?: string;
  ephemeral?: boolean;
  durable?: boolean;
  limit?: string;
}

const workflowListOptions: CommandOption[] = [
  {
    name: 'status',
    short: 's',
    description: 'Filter by status (pending, running, completed, failed, cancelled)',
    hasValue: true,
  },
  {
    name: 'ephemeral',
    short: 'e',
    description: 'Show only ephemeral workflows',
    hasValue: false,
  },
  {
    name: 'durable',
    short: 'd',
    description: 'Show only durable workflows',
    hasValue: false,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function workflowListHandler(
  _args: string[],
  options: GlobalOptions & WorkflowListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'workflow',
    };

    // Status filter
    if (options.status) {
      const validStatuses = Object.values(WorkflowStatus);
      if (!validStatuses.includes(options.status as WorkflowStatus)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Workflow>(filter);

    // Post-filter
    let items = result.items;

    // Status filter
    if (options.status) {
      items = items.filter((w) => w.status === options.status);
    }

    // Ephemeral/durable filter
    if (options.ephemeral && !options.durable) {
      items = items.filter((w) => w.ephemeral);
    } else if (options.durable && !options.ephemeral) {
      items = items.filter((w) => !w.ephemeral);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((w) => w.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No workflows found');
    }

    // Build table
    const headers = ['ID', 'TITLE', 'STATUS', 'MODE', 'CREATED'];
    const rows = items.map((w) => [
      w.id,
      w.title.length > 40 ? w.title.substring(0, 37) + '...' : w.title,
      `${getStatusIcon(w.status)} ${w.status}`,
      w.ephemeral ? 'ephemeral' : 'durable',
      w.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} workflows`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list workflows: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowListCommand: Command = {
  name: 'list',
  description: 'List workflows',
  usage: 'sf workflow list [options]',
  help: `List workflows with optional filtering.

Options:
  -s, --status <status>  Filter by status: pending, running, completed, failed, cancelled
  -e, --ephemeral        Show only ephemeral workflows
  -d, --durable          Show only durable workflows
  -l, --limit <n>        Maximum results

Examples:
  sf workflow list
  sf workflow list --status running
  sf workflow list --ephemeral`,
  options: workflowListOptions,
  handler: workflowListHandler as Command['handler'],
};

// ============================================================================
// Workflow Show Command
// ============================================================================

async function workflowShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf workflow show <id>\nExample: sf workflow show el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(`Element ${id} is not a workflow (type: ${workflow.type})`, ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(workflow);
    }

    if (mode === 'quiet') {
      return success(workflow.id);
    }

    // Human-readable output
    let output = formatter.element(workflow as unknown as Record<string, unknown>);

    // Add workflow-specific info
    output += '\n\n--- Workflow Info ---\n';
    output += `Mode:      ${workflow.ephemeral ? 'ephemeral' : 'durable'}\n`;
    if (workflow.playbookId) {
      output += `Playbook:  ${workflow.playbookId}\n`;
    }
    if (workflow.startedAt) {
      output += `Started:   ${workflow.startedAt}\n`;
    }
    if (workflow.finishedAt) {
      output += `Finished:  ${workflow.finishedAt}\n`;
    }
    if (workflow.failureReason) {
      output += `Failure:   ${workflow.failureReason}\n`;
    }
    if (workflow.cancelReason) {
      output += `Cancelled: ${workflow.cancelReason}\n`;
    }

    // Show variables if any
    const varKeys = Object.keys(workflow.variables);
    if (varKeys.length > 0) {
      output += '\n--- Variables ---\n';
      for (const key of varKeys) {
        output += `${key}: ${JSON.stringify(workflow.variables[key])}\n`;
      }
    }

    return success(workflow, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to show workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowShowCommand: Command = {
  name: 'show',
  description: 'Show workflow details',
  usage: 'sf workflow show <id>',
  help: `Display detailed information about a workflow.

Arguments:
  id    Workflow identifier (e.g., el-abc123)

Examples:
  sf workflow show el-abc123
  sf workflow show el-abc123 --json`,
  handler: workflowShowHandler as Command['handler'],
};

// ============================================================================
// Workflow Tasks Command
// ============================================================================

interface WorkflowTasksOptions {
  ready?: boolean;
  status?: string;
  limit?: string;
}

const workflowTasksOptions: CommandOption[] = [
  {
    name: 'ready',
    short: 'r',
    description: 'Show only ready tasks (not blocked, not scheduled for future)',
    hasValue: false,
  },
  {
    name: 'status',
    short: 's',
    description: 'Filter by status (open, in_progress, blocked, closed, deferred)',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function workflowTasksHandler(
  args: string[],
  options: GlobalOptions & WorkflowTasksOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf workflow tasks <id>\nExample: sf workflow tasks el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {};

    // Status filter
    if (options.status) {
      const validStatuses = ['open', 'in_progress', 'blocked', 'closed', 'deferred', 'tombstone'];
      if (!validStatuses.includes(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status;
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get tasks based on --ready flag
    const tasks = options.ready
      ? await api.getReadyTasksInWorkflow(id as ElementId, filter)
      : await api.getTasksInWorkflow(id as ElementId, filter);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    if (tasks.length === 0) {
      return success(null, options.ready ? 'No ready tasks in workflow' : 'No tasks in workflow');
    }

    // Build table
    const headers = ['ID', 'TITLE', 'STATUS', 'PRIORITY', 'ASSIGNEE'];
    const rows = tasks.map((t) => [
      t.id,
      t.title.length > 40 ? t.title.substring(0, 37) + '...' : t.title,
      `${getStatusIcon(t.status)} ${t.status}`,
      `P${t.priority}`,
      t.assignee ?? '-',
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${tasks.length} task(s)`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list workflow tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowTasksCommand: Command = {
  name: 'tasks',
  description: 'List tasks in a workflow',
  usage: 'sf workflow tasks <id> [options]',
  help: `List all tasks that belong to a workflow.

Arguments:
  id    Workflow identifier (e.g., el-abc123)

Options:
  -r, --ready          Show only ready tasks (not blocked, not scheduled for future)
  -s, --status <s>     Filter by status: open, in_progress, blocked, closed, deferred
  -l, --limit <n>      Maximum results

Examples:
  sf workflow tasks el-abc123
  sf workflow tasks el-abc123 --ready
  sf workflow tasks el-abc123 --status open
  sf workflow tasks el-abc123 --json`,
  options: workflowTasksOptions,
  handler: workflowTasksHandler as Command['handler'],
};

// ============================================================================
// Workflow Progress Command
// ============================================================================

async function workflowProgressHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf workflow progress <id>\nExample: sf workflow progress el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const progress = await api.getWorkflowProgress(id as ElementId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(progress);
    }

    if (mode === 'quiet') {
      return success(`${progress.completionPercentage}%`);
    }

    // Human-readable output
    let output = `Workflow Progress: ${id}\n\n`;
    output += `Total Tasks:   ${progress.totalTasks}\n`;
    output += `Completion:    ${progress.completionPercentage}%\n`;
    output += `Ready Tasks:   ${progress.readyTasks}\n`;
    output += `Blocked Tasks: ${progress.blockedTasks}\n\n`;
    output += '--- Status Breakdown ---\n';

    const statusOrder = ['open', 'in_progress', 'blocked', 'closed', 'deferred'];
    for (const status of statusOrder) {
      const count = progress.statusCounts[status] ?? 0;
      if (count > 0) {
        output += `${getStatusIcon(status)} ${status}: ${count}\n`;
      }
    }

    // Visual progress bar
    const barWidth = 30;
    const filled = Math.round((progress.completionPercentage / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    output += `\n[${bar}] ${progress.completionPercentage}%`;

    return success(progress, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get workflow progress: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowProgressCommand: Command = {
  name: 'progress',
  description: 'Show workflow progress metrics',
  usage: 'sf workflow progress <id>',
  help: `Display progress metrics for a workflow.

Shows task status counts, completion percentage, and ready/blocked task counts.

Arguments:
  id    Workflow identifier (e.g., el-abc123)

Examples:
  sf workflow progress el-abc123
  sf workflow progress el-abc123 --json`,
  handler: workflowProgressHandler as Command['handler'],
};

// ============================================================================
// Workflow Delete Command
// ============================================================================

interface WorkflowDeleteOptions {
  force?: boolean;
}

const workflowDeleteOptions: CommandOption[] = [
  {
    name: 'force',
    short: 'f',
    description: 'Force delete even for durable workflows',
    hasValue: false,
  },
];

async function workflowDeleteHandler(
  args: string[],
  options: GlobalOptions & WorkflowDeleteOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf workflow delete <id>\nExample: sf workflow delete el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(`Element ${id} is not a workflow (type: ${workflow.type})`, ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (!workflow.ephemeral && !options.force) {
      return failure(
        `Workflow ${id} is durable. Use --force to delete anyway, or 'sf delete ${id}' for soft delete.`,
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);

    // Use deleteWorkflow API to delete workflow and all its tasks
    const result = await api.deleteWorkflow(id as ElementId, { actor });

    return success(
      result,
      `Deleted workflow ${id}: ${result.tasksDeleted} task(s), ${result.dependenciesDeleted} dependency(ies) deleted`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to delete workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowDeleteCommand: Command = {
  name: 'delete',
  description: 'Delete workflow and all its tasks',
  usage: 'sf workflow delete <id>',
  help: `Delete a workflow and all its tasks immediately (hard delete).

By default, only ephemeral workflows can be deleted. Use --force to delete
durable workflows as well.

Arguments:
  id    Workflow identifier

Options:
  -f, --force    Force delete even for durable workflows

Examples:
  sf workflow delete el-abc123
  sf workflow delete el-abc123 --force`,
  options: workflowDeleteOptions,
  handler: workflowDeleteHandler as Command['handler'],
};

// ============================================================================
// Workflow Promote Command
// ============================================================================

async function workflowPromoteHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf workflow promote <id>\nExample: sf workflow promote el-abc123', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(`Element ${id} is not a workflow (type: ${workflow.type})`, ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (!workflow.ephemeral) {
      return success(workflow, `Workflow ${id} is already durable`);
    }

    const actor = resolveActor(options);

    // Use the promoteWorkflow function to get updated values
    const promoted = promoteWorkflow(workflow);

    // Update in database
    const updated = await api.update<Workflow>(
      id as ElementId,
      { ephemeral: promoted.ephemeral },
      { actor }
    );

    return success(updated, `Promoted workflow ${id} to durable`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to promote workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowPromoteCommand: Command = {
  name: 'promote',
  description: 'Promote ephemeral workflow to durable',
  usage: 'sf workflow promote <id>',
  help: `Promote an ephemeral workflow to durable so it gets synced to JSONL.

After promoting, the workflow and its tasks will be included in exports
and git sync.

Arguments:
  id    Workflow identifier

Examples:
  sf workflow promote el-abc123`,
  handler: workflowPromoteHandler as Command['handler'],
};

// ============================================================================
// Workflow GC Command
// ============================================================================

interface WorkflowGcOptions {
  age?: string;
  dryRun?: boolean;
}

const workflowGcOptions: CommandOption[] = [
  {
    name: 'age',
    short: 'a',
    description: `Maximum age in days (default: ${DEFAULT_GC_AGE_DAYS})`,
    hasValue: true,
  },
  {
    name: 'dry-run',
    description: 'Show what would be deleted without deleting',
    hasValue: false,
  },
];

async function workflowGcHandler(
  _args: string[],
  options: GlobalOptions & WorkflowGcOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Parse age
    let ageDays = DEFAULT_GC_AGE_DAYS;
    if (options.age) {
      ageDays = parseInt(options.age, 10);
      if (isNaN(ageDays) || ageDays < 0) {
        return failure('Age must be a non-negative number', ExitCode.VALIDATION);
      }
    }

    const maxAgeMs = ageDays * MS_PER_DAY;

    // Check if dry run by getting eligible workflows first
    if (options.dryRun) {
      // Get all workflows for preview
      const allWorkflows = await api.list<Workflow>({ type: 'workflow' });

      // Filter to those eligible for GC
      const eligible = filterGarbageCollectionByAge(allWorkflows, maxAgeMs);

      if (eligible.length === 0) {
        return success({ deleted: 0 }, 'No workflows eligible for garbage collection');
      }

      const mode = getOutputMode(options);
      const formatter = getFormatter(mode);

      if (mode === 'json') {
        return success({ wouldDelete: eligible.map((w) => w.id), count: eligible.length });
      }

      if (mode === 'quiet') {
        return success(eligible.map((w) => w.id).join('\n'));
      }

      const headers = ['ID', 'TITLE', 'STATUS', 'FINISHED'];
      const rows = eligible.map((w) => [
        w.id,
        w.title.length > 40 ? w.title.substring(0, 37) + '...' : w.title,
        w.status,
        w.finishedAt ? w.finishedAt.split('T')[0] : '-',
      ]);

      const table = formatter.table(headers, rows);
      return success(
        { wouldDelete: eligible.map((w) => w.id), count: eligible.length },
        `Would delete ${eligible.length} workflow(s):\n${table}`
      );
    }

    // Use garbageCollectWorkflows API
    const gcResult = await api.garbageCollectWorkflows({
      maxAgeMs,
      dryRun: false,
    });

    if (gcResult.workflowsDeleted === 0) {
      return success({ deleted: 0 }, 'No workflows eligible for garbage collection');
    }

    return success(
      gcResult,
      `Garbage collected ${gcResult.workflowsDeleted} workflow(s), ${gcResult.tasksDeleted} task(s), ${gcResult.dependenciesDeleted} dependency(ies)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to garbage collect: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowGcCommand: Command = {
  name: 'gc',
  description: 'Garbage collect old ephemeral workflows',
  usage: 'sf workflow gc [options]',
  help: `Delete old ephemeral workflows that have reached a terminal state.

Workflows are eligible for garbage collection if they are:
- Ephemeral (not durable)
- In a terminal state (completed, failed, or cancelled)
- Older than the specified age

Options:
  -a, --age <days>   Maximum age in days (default: ${DEFAULT_GC_AGE_DAYS})
      --dry-run      Show what would be deleted without deleting

Examples:
  sf workflow gc
  sf workflow gc --age 30
  sf workflow gc --dry-run`,
  options: workflowGcOptions,
  handler: workflowGcHandler as Command['handler'],
};

// ============================================================================
// Workflow Root Command
// ============================================================================

export const workflowCommand: Command = {
  name: 'workflow',
  description: 'Manage workflows (executable task sequences)',
  usage: 'sf workflow <subcommand> [options]',
  help: `Manage workflows - executable sequences of tasks.

Workflows can be instantiated from playbook templates or created ad-hoc.
They support both durable (synced) and ephemeral (temporary) modes.

Subcommands:
  create     Instantiate a playbook into a workflow
  list       List workflows
  show       Show workflow details
  tasks      List tasks in a workflow
  progress   Show workflow progress metrics
  delete     Delete ephemeral workflow and tasks
  promote    Promote ephemeral to durable
  gc         Garbage collect old ephemeral workflows

Examples:
  sf workflow create deploy --var env=prod
  sf workflow list --status running
  sf workflow show el-abc123
  sf workflow tasks el-abc123
  sf workflow tasks el-abc123 --ready
  sf workflow progress el-abc123
  sf workflow delete el-abc123
  sf workflow promote el-abc123
  sf workflow gc --age 30`,
  subcommands: {
    create: workflowCreateCommand,
    list: workflowListCommand,
    show: workflowShowCommand,
    tasks: workflowTasksCommand,
    progress: workflowProgressCommand,
    delete: workflowDeleteCommand,
    promote: workflowPromoteCommand,
    gc: workflowGcCommand,
    // Aliases (hidden from --help via dedup in getCommandHelp)
    new: workflowCreateCommand,
    add: workflowCreateCommand,
    ls: workflowListCommand,
    rm: workflowDeleteCommand,
    get: workflowShowCommand,
    view: workflowShowCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return workflowListHandler(args, options);
    }
    // Show "did you mean?" for unknown subcommands
    const subNames = Object.keys(workflowCommand.subcommands!);
    const suggestions = suggestCommands(args[0], subNames);
    let msg = `Unknown subcommand: ${args[0]}`;
    if (suggestions.length > 0) {
      msg += `\n\nDid you mean?\n${suggestions.map(s => `  ${s}`).join('\n')}`;
    }
    msg += '\n\nRun "sf workflow --help" to see available subcommands.';
    return failure(msg, ExitCode.INVALID_ARGUMENTS);
  },
};
