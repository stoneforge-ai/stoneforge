/**
 * Log Command - Show operation log entries
 *
 * Provides CLI access to the persistent operation log, allowing users
 * to query system events (dispatch, session, merge, rate-limit, recovery).
 *
 * Examples:
 *   sf log                           Show last 20 entries
 *   sf log --level error             Filter by level
 *   sf log --category rate-limit     Filter by category
 *   sf log --since 2h               Relative time filter
 *   sf log --task el-xxxx            Filter by task
 *   sf log --agent el-xxxx           Filter by agent
 *   sf log --limit 50               Control output count
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { createAPI } from '../db.js';

// ============================================================================
// Types
// ============================================================================

interface LogOptions {
  level?: string;
  category?: string;
  since?: string;
  task?: string;
  agent?: string;
  limit?: string;
}

// ============================================================================
// Helpers
// ============================================================================

const VALID_LEVELS = ['info', 'warn', 'error'] as const;
const VALID_CATEGORIES = ['dispatch', 'merge', 'session', 'rate-limit', 'steward', 'recovery'] as const;

/**
 * Parse a relative time string (e.g. "2h", "30m", "1d") into an ISO timestamp.
 * Falls back to treating the string as an ISO 8601 timestamp.
 */
function parseSinceValue(value: string): string {
  const relativeMatch = value.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/i);
  if (relativeMatch) {
    const amount = parseFloat(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    };
    const ms = amount * multipliers[unit];
    return new Date(Date.now() - ms).toISOString();
  }

  // Treat as ISO timestamp — validate it parses
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid --since value: "${value}". Use relative time (e.g. 2h, 30m, 1d) or ISO 8601 timestamp.`
    );
  }
  return date.toISOString();
}

/**
 * Format a timestamp for display.
 * Shows relative time for recent entries, full timestamp for older ones.
 */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 60_000) {
    return `${Math.floor(diffMs / 1000)}s ago`;
  }
  if (diffMs < 3600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }
  if (diffMs < 86400_000) {
    return `${Math.floor(diffMs / 3600_000)}h ago`;
  }

  // For older entries, show the date and time
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format a log level with consistent width and visual indicator
 */
function formatLevel(level: string): string {
  switch (level) {
    case 'error':
      return 'ERR ';
    case 'warn':
      return 'WARN';
    case 'info':
      return 'INFO';
    default:
      return level.toUpperCase().padEnd(4);
  }
}

// ============================================================================
// Command Options
// ============================================================================

const logOptions: CommandOption[] = [
  {
    name: 'level',
    description: `Filter by log level (${VALID_LEVELS.join(', ')})`,
    hasValue: true,
  },
  {
    name: 'category',
    short: 'c',
    description: `Filter by category (${VALID_CATEGORIES.join(', ')})`,
    hasValue: true,
  },
  {
    name: 'since',
    short: 's',
    description: 'Show entries since time (e.g. 2h, 30m, 1d) or ISO 8601 timestamp',
    hasValue: true,
  },
  {
    name: 'task',
    short: 't',
    description: 'Filter by task ID',
    hasValue: true,
  },
  {
    name: 'agent',
    short: 'a',
    description: 'Filter by agent ID',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of entries to show (default: 20)',
    hasValue: true,
  },
];

// ============================================================================
// Handler
// ============================================================================

async function logHandler(
  _args: string[],
  options: GlobalOptions & LogOptions
): Promise<CommandResult> {
  const { backend, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Validate level
    if (options.level && !(VALID_LEVELS as readonly string[]).includes(options.level)) {
      return failure(
        `Invalid --level: "${options.level}". Must be one of: ${VALID_LEVELS.join(', ')}`,
        ExitCode.VALIDATION
      );
    }

    // Validate category
    if (options.category && !(VALID_CATEGORIES as readonly string[]).includes(options.category)) {
      return failure(
        `Invalid --category: "${options.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        ExitCode.VALIDATION
      );
    }

    // Validate and parse limit
    let limit = 20;
    if (options.limit) {
      limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('--limit must be a positive number', ExitCode.VALIDATION);
      }
    }

    // Parse --since
    let since: string | undefined;
    if (options.since) {
      try {
        since = parseSinceValue(options.since);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return failure(msg, ExitCode.VALIDATION);
      }
    }

    // Build SQL query directly (the CLI has direct storage access)
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.level) {
      conditions.push('level = ?');
      params.push(options.level);
    }

    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    if (since) {
      conditions.push('timestamp >= ?');
      params.push(since);
    }

    if (options.task) {
      conditions.push('task_id = ?');
      params.push(options.task);
    }

    if (options.agent) {
      conditions.push('agent_id = ?');
      params.push(options.agent);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    interface LogRow {
      [key: string]: unknown;
      id: string;
      timestamp: string;
      level: string;
      category: string;
      agent_id: string | null;
      task_id: string | null;
      message: string;
      details: string | null;
    }

    const rows = backend.query<LogRow>(
      `SELECT id, timestamp, level, category, agent_id, task_id, message, details
       FROM operation_log
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT ?`,
      [...params, limit]
    );

    // Map rows to a JSON-friendly shape
    const entries = rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level,
      category: row.category,
      agentId: row.agent_id ?? undefined,
      taskId: row.task_id ?? undefined,
      message: row.message,
      details: row.details ? JSON.parse(row.details) : undefined,
    }));

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(entries);
    }

    if (mode === 'quiet') {
      const ids = entries.map((e) => e.id).join('\n');
      return success(ids);
    }

    // Human-readable output
    if (entries.length === 0) {
      return success([], 'No log entries found.');
    }

    const lines: string[] = [];
    // Show entries in reverse chronological order (newest first)
    for (const entry of entries) {
      const time = formatTimestamp(entry.timestamp);
      const level = formatLevel(entry.level);
      const cat = entry.category.padEnd(10);
      let line = `${time.padEnd(14)} ${level}  ${cat}  ${entry.message}`;

      // Append context tags
      const tags: string[] = [];
      if (entry.taskId) tags.push(`task=${entry.taskId}`);
      if (entry.agentId) tags.push(`agent=${entry.agentId}`);
      if (tags.length > 0) {
        line += `  [${tags.join(', ')}]`;
      }

      lines.push(line);
    }

    const header = `Operation Log (${entries.length} entries):\n`;
    return success(entries, header + lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to query operation log: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const logCommand: Command = {
  name: 'log',
  description: 'Show operation log entries',
  usage: 'sf log [options]',
  help: `Show persistent operation log entries for system observability.

The operation log captures key events from the orchestration system including
dispatch, session, merge, rate-limit, steward, and recovery events.

Options:
      --level <level>       Filter by level: info, warn, error
  -c, --category <cat>      Filter by category: dispatch, merge, session,
                             rate-limit, steward, recovery
  -s, --since <time>        Show entries since time. Accepts relative time
                             (e.g. 2h, 30m, 1d, 1w) or ISO 8601 timestamp
  -t, --task <id>           Filter by task ID
  -a, --agent <id>          Filter by agent ID
  -l, --limit <n>           Maximum entries to show (default: 20)

Examples:
  sf log                              Show last 20 entries
  sf log --level error                Show only errors
  sf log --category session           Show session events
  sf log --category rate-limit        Show rate limit events
  sf log --since 2h                   Show entries from last 2 hours
  sf log --since 2026-02-23T00:00:00  Show entries since specific time
  sf log --task el-xxxx               Show entries for a specific task
  sf log --agent el-xxxx              Show entries for a specific agent
  sf log --limit 50                   Show last 50 entries
  sf log --level error --since 1d     Combine filters
  sf log --json                       Output as JSON`,
  options: logOptions,
  handler: logHandler as Command['handler'],
};
