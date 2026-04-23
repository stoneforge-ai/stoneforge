/**
 * Operation Log Service
 *
 * Provides persistent, queryable operation logs for observability.
 * Writes structured log entries to the operation_log SQLite table so that
 * events survive session restarts and can be queried later via the CLI.
 *
 * Categories:
 * - dispatch: Task dispatch events, poll errors
 * - session: Session spawn/terminate/failure
 * - merge: Test results, merge outcomes
 * - rate-limit: Rate limit detection and recovery
 * - steward: Steward execution events
 * - recovery: Orphan recovery events
 *
 * @module
 */

import type { StorageBackend } from '@stoneforge/storage';

// ============================================================================
// Types
// ============================================================================

/**
 * Log levels for operation log entries
 */
export const OperationLogLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type OperationLogLevel = (typeof OperationLogLevel)[keyof typeof OperationLogLevel];

/**
 * Categories for operation log entries
 */
export const OperationLogCategory = {
  DISPATCH: 'dispatch',
  MERGE: 'merge',
  SESSION: 'session',
  RATE_LIMIT: 'rate-limit',
  STEWARD: 'steward',
  RECOVERY: 'recovery',
} as const;

export type OperationLogCategory = (typeof OperationLogCategory)[keyof typeof OperationLogCategory];

/**
 * An operation log entry as stored in the database
 */
export interface OperationLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly level: OperationLogLevel;
  readonly category: OperationLogCategory;
  readonly agentId?: string;
  readonly taskId?: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Filters for querying operation log entries
 */
export interface OperationLogFilter {
  /** Filter by log level */
  readonly level?: OperationLogLevel;
  /** Filter by category */
  readonly category?: OperationLogCategory;
  /** Filter entries after this ISO timestamp */
  readonly since?: string;
  /** Filter by task ID */
  readonly taskId?: string;
  /** Filter by agent ID */
  readonly agentId?: string;
  /** Maximum number of entries to return (default: 20) */
  readonly limit?: number;
}

/**
 * Raw row shape returned from the SQLite query
 */
interface OperationLogRow {
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

/**
 * Operation Log Service interface
 */
export interface OperationLogService {
  /**
   * Write a log entry to the operation_log table.
   *
   * @param level - Log level: 'info', 'warn', or 'error'
   * @param category - Log category: 'dispatch', 'merge', 'session', 'rate-limit', 'steward', 'recovery'
   * @param message - Human-readable message
   * @param details - Optional structured details (stored as JSON)
   */
  write(
    level: OperationLogLevel,
    category: OperationLogCategory,
    message: string,
    details?: { agentId?: string; taskId?: string } & Record<string, unknown>
  ): void;

  /**
   * Query operation log entries with optional filters.
   *
   * @param filters - Optional filters for level, category, since, task, agent, limit
   * @returns Array of matching log entries, newest first
   */
  query(filters?: OperationLogFilter): OperationLogEntry[];
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Generate a unique ID for an operation log entry.
 * Format: oplog-{timestamp}-{random}
 */
function generateLogId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `oplog-${ts}-${rand}`;
}

/**
 * Creates an OperationLogService backed by the given StorageBackend.
 *
 * @param storage - The SQLite storage backend with the operation_log table
 * @returns An OperationLogService instance
 */
export function createOperationLogService(storage: StorageBackend): OperationLogService {
  return {
    write(level, category, message, details) {
      const id = generateLogId();
      const timestamp = new Date().toISOString();
      const agentId = details?.agentId ?? null;
      const taskId = details?.taskId ?? null;

      // Build a clean details object without agentId/taskId (they have their own columns)
      let detailsJson: string | null = null;
      if (details) {
        const { agentId: _a, taskId: _t, ...rest } = details;
        if (Object.keys(rest).length > 0) {
          detailsJson = JSON.stringify(rest);
        }
      }

      storage.run(
        `INSERT INTO operation_log (id, timestamp, level, category, agent_id, task_id, message, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, timestamp, level, category, agentId, taskId, message, detailsJson]
      );
    },

    query(filters = {}) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.level) {
        conditions.push('level = ?');
        params.push(filters.level);
      }

      if (filters.category) {
        conditions.push('category = ?');
        params.push(filters.category);
      }

      if (filters.since) {
        conditions.push('timestamp >= ?');
        params.push(filters.since);
      }

      if (filters.taskId) {
        conditions.push('task_id = ?');
        params.push(filters.taskId);
      }

      if (filters.agentId) {
        conditions.push('agent_id = ?');
        params.push(filters.agentId);
      }

      const limit = filters.limit ?? 20;
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const rows = storage.query<OperationLogRow>(
        `SELECT id, timestamp, level, category, agent_id, task_id, message, details
         FROM operation_log
         ${whereClause}
         ORDER BY timestamp DESC
         LIMIT ?`,
        [...params, limit]
      );

      return rows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level as OperationLogLevel,
        category: row.category as OperationLogCategory,
        agentId: row.agent_id ?? undefined,
        taskId: row.task_id ?? undefined,
        message: row.message,
        details: row.details ? (JSON.parse(row.details) as Record<string, unknown>) : undefined,
      }));
    },
  };
}
