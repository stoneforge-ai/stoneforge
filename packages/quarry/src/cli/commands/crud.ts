/**
 * CRUD Commands - Create, List, Show, Update, Delete operations
 *
 * Provides CLI commands for basic element operations:
 * - create: Create new elements (tasks, etc.)
 * - list: List elements with filtering
 * - show: Show detailed element information
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, getStatusIcon, formatEventsTable, type EventData } from '../formatter.js';
import { createTask, createDocument, ContentType, TaskStatus, TaskTypeValue, PlanStatus, type CreateTaskInput, type Priority, type Complexity, type Plan, type DocumentId, type HydratedMessage } from '@stoneforge/core';
import type { Element, ElementId, EntityId, Task, SyncDirection } from '@stoneforge/core';
import type { QuarryAPI, TaskFilter } from '../../api/types.js';
import type { PlanProgress } from '@stoneforge/core';
import type { StorageBackend } from '@stoneforge/storage';
import { createInboxService } from '../../services/inbox.js';
import { resolveDatabasePath, resolveActor, createAPI } from '../db.js';
import { getValue } from '../../config/index.js';
import { autoLinkTask } from '../../external-sync/auto-link.js';
import { tryCreateProviderForAutoLink } from './auto-link-helper.js';

// ============================================================================
// Create Command
// ============================================================================

interface CreateOptions {
  title?: string;
  name?: string; // Alias for title
  priority?: string;
  complexity?: string;
  type?: string;
  assignee?: string;
  tag?: string[];
  plan?: string;
  description?: string;
  'no-auto-link'?: boolean;
}

export const createOptions: CommandOption[] = [
  {
    name: 'title',
    short: 't',
    description: 'Title for the element (required for tasks)',
    hasValue: true,
  },
  {
    name: 'name',
    short: 'n',
    description: 'Alias for --title',
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: 'Priority level (1-5, 1=critical)',
    hasValue: true,
  },
  {
    name: 'complexity',
    short: 'c',
    description: 'Complexity level (1-5, 1=trivial)',
    hasValue: true,
  },
  {
    name: 'type',
    description: 'Task type (bug, feature, task, chore)',
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: 'Assignee entity ID',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Add a tag (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'plan',
    description: 'Plan ID or name to attach this task to',
    hasValue: true,
  },
  {
    name: 'description',
    short: 'd',
    description: 'Task description (creates a linked document)',
    hasValue: true,
  },
  {
    name: 'no-auto-link',
    description: 'Skip auto-linking to external provider even when configured',
  },
];

export async function createHandler(
  args: string[],
  options: GlobalOptions & CreateOptions
): Promise<CommandResult> {
  // First argument is the element type
  const [elementType] = args;

  if (!elementType) {
    return failure('Usage: sf task create [options]\n\nUse "sf task create --help" for options.', ExitCode.INVALID_ARGUMENTS);
  }

  // Currently only support task creation
  if (elementType !== 'task') {
    return failure(
      `Unsupported element type: ${elementType}. Currently supported: task`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  // Use --name as alias for --title
  const title = options.title ?? options.name;

  // Validate required options for task
  if (!title) {
    return failure('--title (or --name) is required for creating a task', ExitCode.INVALID_ARGUMENTS);
  }

  // Create command should create the database if it doesn't exist
  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Parse priority
    let priority: Priority | undefined;
    if (options.priority) {
      const p = parseInt(options.priority, 10);
      if (isNaN(p) || p < 1 || p > 5) {
        return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      priority = p as Priority;
    }

    // Parse complexity
    let complexity: Complexity | undefined;
    if (options.complexity) {
      const c = parseInt(options.complexity, 10);
      if (isNaN(c) || c < 1 || c > 5) {
        return failure('Complexity must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      complexity = c as Complexity;
    }

    // Parse task type
    type TaskTypeValueType = (typeof TaskTypeValue)[keyof typeof TaskTypeValue];
    let taskType: TaskTypeValueType | undefined;
    if (options.type) {
      const validTypes: string[] = Object.values(TaskTypeValue);
      if (!validTypes.includes(options.type)) {
        return failure(
          `Invalid task type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      taskType = options.type as TaskTypeValueType;
    }

    // Handle tags (may come as array if --tag is specified multiple times)
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Handle description: create a document and link it to the task
    let descriptionRef: DocumentId | undefined;
    if (options.description) {
      const docInput = {
        content: options.description,
        contentType: ContentType.MARKDOWN,
        createdBy: actor,
      };
      const newDoc = await createDocument(docInput);
      const createdDoc = await api.create(newDoc as unknown as Element & Record<string, unknown>);
      descriptionRef = createdDoc.id as DocumentId;
    }

    // Create task input (title is guaranteed non-null from validation above)
    const input: CreateTaskInput = {
      title: title!,
      createdBy: actor,
      ...(priority !== undefined && { priority }),
      ...(complexity !== undefined && { complexity }),
      ...(taskType !== undefined && { taskType }),
      ...(options.assignee && { assignee: options.assignee as EntityId }),
      ...(tags && { tags }),
      ...(descriptionRef !== undefined && { descriptionRef }),
    };

    // Create the task
    const task = await createTask(input);
    // The API's create method expects ElementInput which Task satisfies
    const created = await api.create(task as unknown as Element & Record<string, unknown>);

    // If --plan is provided, attach the task to the plan
    let planWarning: string | undefined;
    if (options.plan) {
      try {
        // First try to find by ID (if it looks like an element ID)
        let plan: Plan | null = null;
        if (options.plan.startsWith('el-') || options.plan.match(/^el[a-z0-9]+$/i)) {
          plan = await api.get<Plan>(options.plan as ElementId);
        }

        // If not found by ID, search by title
        if (!plan) {
          const plans = await api.list<Plan>({ type: 'plan' });
          plan = plans.find((p) => p.title === options.plan) ?? null;
        }

        if (!plan) {
          planWarning = `Warning: Plan not found: ${options.plan}. Task was created but not attached to a plan.`;
        } else if (plan.type !== 'plan') {
          planWarning = `Warning: ${options.plan} is not a plan (type: ${plan.type}). Task was created but not attached.`;
        } else if (plan.status === PlanStatus.CANCELLED) {
          planWarning = `Warning: Plan ${plan.id} is cancelled. Task was created but not attached.`;
        } else {
          await api.addTaskToPlan(created.id, plan.id, { actor });
        }
      } catch (attachErr) {
        const attachMessage = attachErr instanceof Error ? attachErr.message : String(attachErr);
        planWarning = `Warning: Failed to attach task to plan: ${attachMessage}. Task was created successfully.`;
      }
    }

    // Auto-link to external provider if configured and not suppressed
    let autoLinkMessage: string | undefined;
    if (!options['no-auto-link']) {
      const autoLink = getValue('externalSync.autoLink');
      const autoLinkProvider = getValue('externalSync.autoLinkProvider');

      if (autoLink && autoLinkProvider) {
        const providerResult = await tryCreateProviderForAutoLink(autoLinkProvider, options);

        if (providerResult.provider && providerResult.project) {
          const direction = getValue('externalSync.defaultDirection') as SyncDirection;
          const linkResult = await autoLinkTask({
            task: created as unknown as Task,
            api,
            provider: providerResult.provider,
            project: providerResult.project,
            direction,
          });

          if (linkResult.success && linkResult.syncState) {
            autoLinkMessage = `Linked to ${autoLinkProvider}: ${linkResult.syncState.url}`;
          } else if (!linkResult.success) {
            autoLinkMessage = `Warning: Auto-link failed: ${linkResult.error}`;
          }
        } else if (providerResult.error) {
          autoLinkMessage = `Warning: Auto-link failed: ${providerResult.error}`;
        }
      }
    }

    const messageParts = [`Created task ${created.id}`];
    if (planWarning) messageParts.push(planWarning);
    if (autoLinkMessage) messageParts.push(autoLinkMessage);
    return success(created, messageParts.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const createCommand: Command = {
  name: 'create',
  description: 'Create a new element',
  usage: 'sf create <type> [options]',
  help: `Create a new element of the specified type.

Supported types:
  task     Work item with status, priority, and assignment

Task options:
  -t, --title <text>      Task title (required)
  -d, --description <text> Task description (creates a linked document)
  -p, --priority <1-5>    Priority (1=critical, 5=minimal, default=3)
  -c, --complexity <1-5>  Complexity (1=trivial, 5=very complex, default=3)
      --type <type>       Task type: bug, feature, task, chore
  -a, --assignee <id>     Assignee entity ID
      --tag <tag>         Add a tag (can be repeated)
      --plan <id|name>    Plan ID or name to attach this task to
      --no-auto-link      Skip auto-linking to external provider

Examples:
  sf create task --title "Fix login bug" --priority 1 --type bug
  sf create task -t "Add dark mode" --tag ui --tag feature
  sf create task -t "Implement feature X" --plan el-plan123
  sf create task -t "Implement feature X" --plan "My Plan Name"
  sf create task -t "New feature" -d "Detailed description here"
  sf create task -t "Internal task" --no-auto-link`,
  options: createOptions,
  handler: createHandler as Command['handler'],
};

// ============================================================================
// List Command
// ============================================================================

interface ListOptions {
  type?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  tag?: string[];
  limit?: string;
  offset?: string;
}

export const listOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Filter by element type',
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: 'Filter by status (for tasks)',
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: 'Filter by priority (for tasks)',
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: 'Filter by assignee (for tasks)',
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
  {
    name: 'offset',
    short: 'o',
    description: 'Number of results to skip',
    hasValue: true,
  },
];

/**
 * Query the blocked_cache table to get IDs of all currently blocked elements.
 * Used to compute effective display status for tasks — open tasks with
 * unresolved blocking dependencies should display as 'blocked'.
 */
function getBlockedIds(backend: StorageBackend): Set<string> {
  try {
    const rows = backend.query<{ element_id: string }>(
      'SELECT element_id FROM blocked_cache'
    );
    return new Set(rows.map((r) => r.element_id));
  } catch {
    // blocked_cache table may not exist in all scenarios
    return new Set();
  }
}

/**
 * Compute the effective display status for an element.
 * Tasks with an 'open' stored status that appear in the blocked_cache
 * are displayed as 'blocked' instead.
 */
function getEffectiveStatus(status: string, elementId: string, blockedIds: Set<string>): string {
  if (status === 'open' && blockedIds.has(elementId)) {
    return 'blocked';
  }
  return status;
}

export async function listHandler(
  args: string[],
  options: GlobalOptions & ListOptions
): Promise<CommandResult> {
  const { api, backend, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter from options
    const filter: TaskFilter = {};

    // Type filter (can also be first positional arg)
    const typeArg = args[0] ?? options.type;
    if (typeArg) {
      filter.type = typeArg as Element['type'];
    }

    // Status filter
    if (options.status) {
      const validStatuses: string[] = Object.values(TaskStatus);
      // Also accept 'blocked' as a valid filter value (computed status)
      if (!validStatuses.includes(options.status) && options.status !== 'blocked') {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}, blocked`,
          ExitCode.VALIDATION
        );
      }
      // For 'blocked' filter, we query 'open' tasks and filter by blocked_cache below
      if (options.status !== 'blocked') {
        filter.status = options.status as (typeof TaskStatus)[keyof typeof TaskStatus];
      }
    }

    // Priority filter
    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      filter.priority = priority as 1 | 2 | 3 | 4 | 5;
    }

    // Assignee filter
    if (options.assignee) {
      filter.assignee = options.assignee as EntityId;
    }

    // Tag filter
    if (options.tag) {
      filter.tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Pagination
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    if (options.offset) {
      const offset = parseInt(options.offset, 10);
      if (isNaN(offset) || offset < 0) {
        return failure('Offset must be a non-negative number', ExitCode.VALIDATION);
      }
      filter.offset = offset;
    }

    // Query elements
    const result = await api.listPaginated<Element>(filter);

    // Get blocked element IDs for computing effective display status
    const blockedIds = getBlockedIds(backend);

    // If filtering by 'blocked' status, only show open tasks that are in blocked_cache
    let items = result.items;
    if (options.status === 'blocked') {
      items = items.filter((item) => {
        const data = item as unknown as Record<string, unknown>;
        return data.status === 'open' && blockedIds.has(item.id);
      });
    }

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((e) => e.id).join('\n'));
    }

    // Human-readable output
    if (items.length === 0) {
      return success(null, 'No elements found');
    }

    // Sort by priority ASC for tasks (P1 is highest priority, comes first)
    const sortedItems = [...items].sort((a, b) => {
      const dataA = a as unknown as Record<string, unknown>;
      const dataB = b as unknown as Record<string, unknown>;
      const priorityA = typeof dataA.priority === 'number' ? dataA.priority : 999;
      const priorityB = typeof dataB.priority === 'number' ? dataB.priority : 999;
      return priorityA - priorityB;
    });

    // Build table data with priority and assignee columns
    const headers = ['ID', 'TYPE', 'TITLE/NAME', 'STATUS', 'PRIORITY', 'ASSIGNEE', 'CREATED'];
    const rows = sortedItems.map((item) => {
      const data = item as unknown as Record<string, unknown>;
      const title = data.title ?? data.name ?? '-';
      // Compute effective display status (show 'blocked' for open tasks with unresolved dependencies)
      const effectiveStatus = data.status
        ? getEffectiveStatus(data.status as string, item.id, blockedIds)
        : null;
      const status = effectiveStatus ? `${getStatusIcon(effectiveStatus)} ${effectiveStatus}` : '-';
      const priority = typeof data.priority === 'number' ? `P${data.priority}` : '-';
      const assignee = typeof data.assignee === 'string' ? data.assignee : '-';
      const created = item.createdAt.split('T')[0];
      return [item.id, item.type, title, status, priority, assignee, created];
    });

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} elements`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list elements: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const listCommand: Command = {
  name: 'list',
  description: 'List elements',
  usage: 'sf list [type] [options]',
  help: `List elements with optional filtering.

Arguments:
  type                  Element type to list (task, document, etc.)

Options:
  -t, --type <type>     Filter by element type
  -s, --status <status> Filter by status (for tasks)
  -p, --priority <1-5>  Filter by priority (for tasks)
  -a, --assignee <id>   Filter by assignee (for tasks)
      --tag <tag>       Filter by tag (can be repeated)
  -l, --limit <n>       Maximum results (default: 50)
  -o, --offset <n>      Skip first n results

Examples:
  sf list task
  sf list task --status open
  sf list --type task --priority 1 --status in_progress
  sf list --tag urgent`,
  options: listOptions,
  handler: listHandler as Command['handler'],
};

// ============================================================================
// Show Command
// ============================================================================

interface ShowOptions {
  events?: boolean;
  'events-limit'?: string;
}

export const showOptions: CommandOption[] = [
  {
    name: 'events',
    short: 'e',
    description: 'Include recent events/history',
    hasValue: false,
  },
  {
    name: 'events-limit',
    description: 'Maximum number of events to show (default: 10)',
    hasValue: true,
  },
];

export async function showHandler(
  args: string[],
  options: GlobalOptions & ShowOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf show <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, backend, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Handle inbox item IDs (e.g., inbox-abc123)
    if (id.startsWith('inbox-')) {
      const inboxService = createInboxService(backend);
      const inboxItem = inboxService.getInboxItem(id);

      if (!inboxItem) {
        return failure(`Inbox item not found: ${id}`, ExitCode.NOT_FOUND);
      }

      // Fetch the associated message with hydrated content
      const message = await api.get<HydratedMessage>(inboxItem.messageId as unknown as ElementId, {
        hydrate: { content: true }
      });

      // Build a combined result with inbox item info and message content
      const result = {
        ...inboxItem,
        messageContent: message?.content ?? null,
        messageSender: message?.sender ?? null,
      };

      const mode = getOutputMode(options);
      const formatter = getFormatter(mode);

      if (mode === 'json') {
        return success(result);
      }

      if (mode === 'quiet') {
        return success(inboxItem.id);
      }

      // Human-readable output
      const output = formatter.element(result as unknown as Record<string, unknown>);
      return success(result, output);
    }

    // Get the element
    const element = await api.get<Element>(id as ElementId);

    if (!element) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Check if element is deleted (tombstone)
    const data = element as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    // Get events if requested
    let events: unknown[] | undefined;
    if (options.events) {
      const eventsLimit = options['events-limit'] ? parseInt(options['events-limit'], 10) : 10;
      events = await api.getEvents(id as ElementId, { limit: eventsLimit });
    }

    // Get plan progress if element is a plan
    let planProgress: PlanProgress | undefined;
    if (element.type === 'plan') {
      try {
        planProgress = await api.getPlanProgress(id as ElementId);
      } catch {
        // Ignore errors fetching progress
      }
    }

    if (mode === 'json') {
      if (events || planProgress) {
        return success({ element, ...(planProgress && { progress: planProgress }), ...(events && { events }) });
      }
      return success(element);
    }

    if (mode === 'quiet') {
      return success(element.id);
    }

    // Human-readable output - format as key-value pairs
    // Compute effective display status for tasks (show 'blocked' for open tasks with unresolved deps)
    const blockedIds = getBlockedIds(backend);
    const displayElement = { ...element as unknown as Record<string, unknown> };
    if (typeof displayElement.status === 'string') {
      displayElement.status = getEffectiveStatus(displayElement.status, element.id, blockedIds);
    }
    let output = formatter.element(displayElement);

    // Add plan progress if available
    if (planProgress) {
      output += '\n\n--- Task Progress ---\n';
      output += `Total:       ${planProgress.totalTasks}\n`;
      output += `Completed:   ${planProgress.completedTasks}\n`;
      output += `In Progress: ${planProgress.inProgressTasks}\n`;
      output += `Blocked:     ${planProgress.blockedTasks}\n`;
      output += `Ready:       ${planProgress.remainingTasks}\n`;
      output += `Progress:    ${planProgress.completionPercentage}%`;
    }

    // Add events if requested
    if (events && events.length > 0) {
      output += '\n\n--- Recent Events ---\n';
      output += formatEventsTable(events as EventData[]);
    } else if (options.events) {
      output += '\n\n--- Recent Events ---\nNo events';
    }

    return success(element, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get element: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const showCommand: Command = {
  name: 'show',
  description: 'Show element details',
  usage: 'sf show <id> [options]',
  help: `Display detailed information about an element.

Arguments:
  id    Element identifier (e.g., el-abc123) or inbox item ID (e.g., inbox-abc123)

Options:
  -e, --events            Include recent events/history
      --events-limit <n>  Maximum events to show (default: 10)

Examples:
  sf show el-abc123
  sf show el-abc123 --events
  sf show el-abc123 --events --events-limit 20
  sf show el-abc123 --json
  sf show inbox-abc123     # Show inbox item with message content`,
  options: showOptions,
  handler: showHandler as Command['handler'],
};

// ============================================================================
// Update Command
// ============================================================================

interface UpdateOptions {
  title?: string;
  priority?: string;
  complexity?: string;
  status?: string;
  assignee?: string;
  tag?: string[];
  'add-tag'?: string[];
  'remove-tag'?: string[];
}

export const updateOptions: CommandOption[] = [
  {
    name: 'title',
    short: 't',
    description: 'New title',
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: 'New priority level (1-5)',
    hasValue: true,
  },
  {
    name: 'complexity',
    short: 'c',
    description: 'New complexity level (1-5)',
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: 'New status (for tasks: open, in_progress, closed, deferred)',
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: 'New assignee (use empty string to unassign)',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Replace all tags (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'add-tag',
    description: 'Add a tag (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'remove-tag',
    description: 'Remove a tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

export async function updateHandler(
  args: string[],
  options: GlobalOptions & UpdateOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf update <id> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get existing element
    const element = await api.get<Element>(id as ElementId);
    if (!element) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Check if element is deleted (tombstone)
    const elemData = element as unknown as Record<string, unknown>;
    if (elemData.status === 'tombstone' || elemData.deletedAt) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Build updates object
    const updates: Record<string, unknown> = {};

    // Handle title
    if (options.title !== undefined) {
      updates.title = options.title;
    }

    // Handle priority (for tasks)
    if (options.priority !== undefined) {
      if (element.type !== 'task') {
        return failure('Priority can only be set on tasks', ExitCode.VALIDATION);
      }
      const p = parseInt(options.priority, 10);
      if (isNaN(p) || p < 1 || p > 5) {
        return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      updates.priority = p as Priority;
    }

    // Handle complexity (for tasks)
    if (options.complexity !== undefined) {
      if (element.type !== 'task') {
        return failure('Complexity can only be set on tasks', ExitCode.VALIDATION);
      }
      const c = parseInt(options.complexity, 10);
      if (isNaN(c) || c < 1 || c > 5) {
        return failure('Complexity must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      updates.complexity = c as Complexity;
    }

    // Handle status (for tasks)
    if (options.status !== undefined) {
      if (element.type !== 'task') {
        return failure('Status can only be set on tasks', ExitCode.VALIDATION);
      }
      const validStatuses: string[] = Object.values(TaskStatus);
      if (!validStatuses.includes(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      updates.status = options.status;
    }

    // Handle assignee (for tasks)
    if (options.assignee !== undefined) {
      if (element.type !== 'task') {
        return failure('Assignee can only be set on tasks', ExitCode.VALIDATION);
      }
      // Empty string means unassign
      updates.assignee = options.assignee === '' ? undefined : (options.assignee as EntityId);
    }

    // Handle tag operations
    let currentTags = element.tags ?? [];

    // Complete replacement with --tag
    if (options.tag !== undefined) {
      const tags = Array.isArray(options.tag) ? options.tag : [options.tag];
      currentTags = tags;
    }

    // Add tags with --add-tag
    if (options['add-tag'] !== undefined) {
      const tagsToAdd = Array.isArray(options['add-tag']) ? options['add-tag'] : [options['add-tag']];
      const tagSet = new Set(currentTags);
      for (const tag of tagsToAdd) {
        tagSet.add(tag);
      }
      currentTags = Array.from(tagSet);
    }

    // Remove tags with --remove-tag
    if (options['remove-tag'] !== undefined) {
      const tagsToRemove = Array.isArray(options['remove-tag']) ? options['remove-tag'] : [options['remove-tag']];
      const removeSet = new Set(tagsToRemove);
      currentTags = currentTags.filter(tag => !removeSet.has(tag));
    }

    // Only update tags if any tag option was used
    if (options.tag !== undefined || options['add-tag'] !== undefined || options['remove-tag'] !== undefined) {
      updates.tags = currentTags;
    }

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0) {
      return failure('No updates specified. Use --help for available options.', ExitCode.INVALID_ARGUMENTS);
    }

    // Resolve actor for audit trail
    const actor = resolveActor(options);

    // Apply the update with optimistic concurrency control
    const updated = await api.update<Element>(id as ElementId, updates, {
      actor,
      expectedUpdatedAt: element.updatedAt,
    });

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    // Human-readable output
    const output = formatter.element(updated as unknown as Record<string, unknown>);
    return success(updated, `Updated ${element.type} ${id}\n\n${output}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update element: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const updateCommand: Command = {
  name: 'update',
  description: 'Update an element',
  usage: 'sf update <id> [options]',
  help: `Update fields on an existing element.

Arguments:
  id    Element identifier (e.g., el-abc123)

Options:
  -t, --title <text>       New title
  -p, --priority <1-5>     New priority (tasks only)
  -c, --complexity <1-5>   New complexity (tasks only)
  -s, --status <status>    New status (tasks only: open, in_progress, closed, deferred)
  -a, --assignee <id>      New assignee (tasks only, empty string to unassign)
      --tag <tag>          Replace all tags (can be repeated)
      --add-tag <tag>      Add a tag (can be repeated)
      --remove-tag <tag>   Remove a tag (can be repeated)

Examples:
  sf update el-abc123 --title "New Title"
  sf update el-abc123 --priority 1 --status in_progress
  sf update el-abc123 --add-tag urgent --add-tag frontend
  sf update el-abc123 --remove-tag old-tag
  sf update el-abc123 --assignee ""  # Unassign`,
  options: updateOptions,
  handler: updateHandler as Command['handler'],
};

// ============================================================================
// Delete Command
// ============================================================================

interface DeleteOptions {
  reason?: string;
  force?: boolean;
}

export const deleteOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: 'Deletion reason',
    hasValue: true,
  },
  {
    name: 'force',
    short: 'f',
    description: 'Skip confirmation (for scripts)',
  },
];

export async function deleteHandler(
  args: string[],
  options: GlobalOptions & DeleteOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf delete <id> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get existing element to verify it exists and get its type
    const element = await api.get<Element>(id as ElementId);
    if (!element) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Check if element is already deleted (tombstone)
    const elemData = element as unknown as Record<string, unknown>;
    if (elemData.status === 'tombstone' || elemData.deletedAt) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Check if element type supports deletion
    if (element.type === 'message') {
      return failure('Messages cannot be deleted (immutable)', ExitCode.VALIDATION);
    }

    // Resolve actor for audit trail
    const actor = resolveActor(options);

    // Perform the soft delete
    await api.delete(id as ElementId, { actor, reason: options.reason });

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ id, deleted: true, type: element.type });
    }

    if (mode === 'quiet') {
      return success(id);
    }

    return success({ id, deleted: true }, `Deleted ${element.type} ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to delete element: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const deleteCommand: Command = {
  name: 'delete',
  description: 'Delete an element',
  usage: 'sf delete <id> [options]',
  help: `Soft-delete an element.

The element will be marked as deleted (tombstone) but not immediately removed.
Tombstones are retained for a configurable period (default: 30 days) to
allow sync operations to propagate deletions.

Note: Messages cannot be deleted as they are immutable.

Arguments:
  id    Element identifier (e.g., el-abc123)

Options:
  -r, --reason <text>    Deletion reason (recorded in audit trail)
  -f, --force            Skip confirmation (for scripts)

Examples:
  sf delete el-abc123
  sf delete el-abc123 --reason "Duplicate entry"
  sf delete el-abc123 -f`,
  options: deleteOptions,
  handler: deleteHandler as Command['handler'],
};
