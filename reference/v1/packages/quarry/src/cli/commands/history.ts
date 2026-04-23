/**
 * History Command - Show event history/timeline for elements
 *
 * Provides CLI commands for viewing element history:
 * - history: Show event timeline for an element
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode, formatEventsTable, formatTimeline, type EventData } from '../formatter.js';
import type { ElementId, EntityId } from '@stoneforge/core';
import type { QuarryAPI } from '../../api/types.js';
import type { EventFilter, EventType } from '@stoneforge/core';
import { createAPI } from '../db.js';

// ============================================================================
// History Command
// ============================================================================

interface HistoryOptions {
  limit?: string;
  type?: string;
  actor?: string;
  after?: string;
  before?: string;
  format?: string;
}

const historyOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of events to show (default: 50)',
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: 'Filter by event type (created, updated, closed, reopened, deleted, dependency_added, dependency_removed)',
    hasValue: true,
  },
  {
    name: 'actor',
    short: 'a',
    description: 'Filter by actor',
    hasValue: true,
  },
  {
    name: 'after',
    description: 'Show events after this timestamp (ISO 8601)',
    hasValue: true,
  },
  {
    name: 'before',
    description: 'Show events before this timestamp (ISO 8601)',
    hasValue: true,
  },
  {
    name: 'format',
    short: 'f',
    description: 'Output format: timeline or table (default: timeline)',
    hasValue: true,
  },
];

async function historyHandler(
  args: string[],
  options: GlobalOptions & HistoryOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: sf history <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build event filter
    const filter: EventFilter = {};

    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    } else {
      filter.limit = 50; // Default limit
    }

    if (options.type) {
      // Validate event type
      const validTypes = [
        'created', 'updated', 'closed', 'reopened', 'deleted',
        'dependency_added', 'dependency_removed',
        'tag_added', 'tag_removed',
        'member_added', 'member_removed',
      ];
      if (!validTypes.includes(options.type)) {
        return failure(
          `Invalid event type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.eventType = options.type as EventType;
    }

    if (options.actor) {
      filter.actor = options.actor as EntityId;
    }

    if (options.after) {
      filter.after = options.after;
    }

    if (options.before) {
      filter.before = options.before;
    }

    // Get events - api is guaranteed to be defined since we checked for error above
    const events = await api!.getEvents(id as ElementId, filter);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(events);
    }

    if (mode === 'quiet') {
      // Just return count in quiet mode
      return success(events.length.toString());
    }

    // Determine format (timeline or table)
    const format = options.format || 'timeline';
    if (format !== 'timeline' && format !== 'table') {
      return failure('Format must be "timeline" or "table"', ExitCode.VALIDATION);
    }

    // Human-readable output
    if (events.length === 0) {
      return success([], 'No events found');
    }

    let output: string;
    if (format === 'table') {
      output = formatEventsTable(events as EventData[]);
    } else {
      output = formatTimeline(events as EventData[]);
    }

    const header = `History for ${id} (${events.length} events):\n\n`;
    return success(events, header + output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get history: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const historyCommand: Command = {
  name: 'history',
  description: 'Show event history for an element',
  usage: 'sf history <id> [options]',
  help: `Display the event history/timeline for an element.

Shows all recorded events including creates, updates, status changes,
dependency changes, and more.

Arguments:
  id    Element identifier (e.g., el-abc123)

Options:
  -l, --limit <n>       Maximum events to show (default: 50)
  -t, --type <type>     Filter by event type
  -a, --actor <actor>   Filter by actor
      --after <time>    Show events after this time (ISO 8601)
      --before <time>   Show events before this time (ISO 8601)
  -f, --format <fmt>    Output format: timeline or table (default: timeline)

Event types:
  created, updated, closed, reopened, deleted,
  dependency_added, dependency_removed

Examples:
  sf history el-abc123
  sf history el-abc123 --limit 10
  sf history el-abc123 --type updated
  sf history el-abc123 --actor user:alice
  sf history el-abc123 --format table
  sf history el-abc123 --after 2024-01-01
  sf history el-abc123 --json`,
  options: historyOptions,
  handler: historyHandler as Command['handler'],
};
