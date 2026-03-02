/**
 * Metrics Command - Show provider metrics
 *
 * Displays LLM provider usage metrics including token counts,
 * estimated costs, session counts, and error rates.
 *
 * Supports grouping by provider, model, task, or agent.
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { createAPI } from '../db.js';
import type { StorageBackend } from '@stoneforge/storage';

// ============================================================================
// Types
// ============================================================================

interface AggregateRow {
  [key: string]: unknown;
  group_key: string;
  total_input_tokens: number;
  total_output_tokens: number;
  session_count: number;
  avg_duration_ms: number;
  failed_count: number;
  rate_limited_count: number;
  total_estimated_cost: number;
}

interface MetricsSummary {
  timeRange: { days: number; label: string };
  groupBy: string;
  metrics: Array<{
    group: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    sessionCount: number;
    avgDurationMs: number;
    errorRate: number;
    failedCount: number;
    rateLimitedCount: number;
    estimatedCost: number;
  }>;
  totals: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    sessionCount: number;
    estimatedCost: number;
  };
}

type GroupByOption = 'provider' | 'model' | 'task' | 'agent';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a time range string (e.g., '7d', '14d', '30d') to number of days.
 */
function parseTimeRange(value: string | undefined): number {
  if (!value) return 7;
  const match = value.match(/^(\d+)d$/);
  if (match) {
    const days = parseInt(match[1], 10);
    if (days > 0 && days <= 365) return days;
  }
  return 7;
}

/**
 * Format a number with thousands separators
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format milliseconds as human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format cost as a dollar amount
 */
function formatCost(cost: number): string {
  if (cost < 0.01) return '$0.00';
  return `$${cost.toFixed(2)}`;
}

/**
 * Query aggregated metrics directly from the database.
 * Uses the estimated_cost column stored at recording time.
 */
function queryMetrics(
  backend: StorageBackend,
  days: number,
  groupBy: GroupByOption,
  providerFilter?: string,
  taskFilter?: string,
  agentFilter?: string
): AggregateRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  let groupExpr: string;
  switch (groupBy) {
    case 'model':
      groupExpr = "COALESCE(model, 'unknown')";
      break;
    case 'task':
      groupExpr = "COALESCE(task_id, 'unassigned')";
      break;
    case 'agent':
      groupExpr = "COALESCE(agent_id, 'unknown')";
      break;
    default:
      groupExpr = 'provider';
  }

  const conditions: string[] = ['timestamp >= ?'];
  const params: unknown[] = [cutoffStr];

  if (providerFilter) {
    conditions.push('provider = ?');
    params.push(providerFilter);
  }
  if (taskFilter) {
    conditions.push('task_id = ?');
    params.push(taskFilter);
  }
  if (agentFilter) {
    conditions.push('agent_id = ?');
    params.push(agentFilter);
  }

  // For task/agent views, exclude rows without the relevant ID
  if (groupBy === 'task') {
    conditions.push('task_id IS NOT NULL');
  }
  if (groupBy === 'agent') {
    conditions.push('agent_id IS NOT NULL');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  return backend.query<AggregateRow>(
    `SELECT
       ${groupExpr} AS group_key,
       COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
       COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
       COUNT(*) AS session_count,
       COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
       COALESCE(SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
       COALESCE(SUM(CASE WHEN outcome = 'rate_limited' THEN 1 ELSE 0 END), 0) AS rate_limited_count,
       COALESCE(SUM(estimated_cost), 0) AS total_estimated_cost
     FROM provider_metrics
     ${whereClause}
     GROUP BY group_key
     ORDER BY total_estimated_cost DESC`,
    params
  );
}

// ============================================================================
// Handler
// ============================================================================

async function metricsHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { backend, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const days = parseTimeRange(options.range as string | undefined);
    const providerFilter = options.provider as string | undefined;
    const taskFilter = options.task as string | undefined;
    const agentFilter = options.agent as string | undefined;

    const groupByRaw = options['group-by'] as string | undefined;
    let groupBy: GroupByOption = 'provider';
    if (groupByRaw === 'model' || groupByRaw === 'task' || groupByRaw === 'agent') {
      groupBy = groupByRaw;
    }

    const rows = queryMetrics(backend, days, groupBy, providerFilter, taskFilter, agentFilter);

    const metrics = rows.map(row => ({
      group: row.group_key,
      totalInputTokens: Number(row.total_input_tokens),
      totalOutputTokens: Number(row.total_output_tokens),
      totalTokens: Number(row.total_input_tokens) + Number(row.total_output_tokens),
      sessionCount: Number(row.session_count),
      avgDurationMs: Math.round(Number(row.avg_duration_ms)),
      errorRate: Number(row.session_count) > 0
        ? Number(row.failed_count) / Number(row.session_count)
        : 0,
      failedCount: Number(row.failed_count),
      rateLimitedCount: Number(row.rate_limited_count),
      estimatedCost: Number(row.total_estimated_cost),
    }));

    const totals = {
      totalInputTokens: metrics.reduce((sum, m) => sum + m.totalInputTokens, 0),
      totalOutputTokens: metrics.reduce((sum, m) => sum + m.totalOutputTokens, 0),
      totalTokens: metrics.reduce((sum, m) => sum + m.totalTokens, 0),
      sessionCount: metrics.reduce((sum, m) => sum + m.sessionCount, 0),
      estimatedCost: metrics.reduce((sum, m) => sum + m.estimatedCost, 0),
    };

    const summary: MetricsSummary = {
      timeRange: { days, label: `${days}d` },
      groupBy,
      metrics,
      totals,
    };

    // Build human-readable output
    const lines: string[] = [];
    const groupLabels: Record<GroupByOption, string> = {
      provider: 'Provider',
      model: 'Model',
      task: 'Task',
      agent: 'Agent',
    };
    const groupLabel = groupLabels[groupBy];

    lines.push(`Provider Metrics (last ${days} days)`);
    const filters: string[] = [];
    if (providerFilter) filters.push(`provider: ${providerFilter}`);
    if (taskFilter) filters.push(`task: ${taskFilter}`);
    if (agentFilter) filters.push(`agent: ${agentFilter}`);
    if (filters.length > 0) {
      lines.push(`Filtered by ${filters.join(', ')}`);
    }
    lines.push('');

    if (metrics.length === 0) {
      lines.push('No metrics recorded for the selected time range.');
      return success(summary, lines.join('\n'));
    }

    // Summary totals
    lines.push('Summary:');
    lines.push(`  Total tokens:     ${formatNumber(totals.totalTokens)}`);
    lines.push(`  Input tokens:     ${formatNumber(totals.totalInputTokens)}`);
    lines.push(`  Output tokens:    ${formatNumber(totals.totalOutputTokens)}`);
    lines.push(`  Sessions:         ${formatNumber(totals.sessionCount)}`);
    lines.push(`  Estimated cost:   ${formatCost(totals.estimatedCost)}`);
    lines.push('');

    // Per-group breakdown
    lines.push(`By ${groupLabel}:`);
    lines.push('');

    for (const m of metrics) {
      lines.push(`  ${m.group}`);
      lines.push(`    Tokens:      ${formatNumber(m.totalTokens)} (in: ${formatNumber(m.totalInputTokens)}, out: ${formatNumber(m.totalOutputTokens)})`);
      lines.push(`    Sessions:    ${formatNumber(m.sessionCount)}`);
      lines.push(`    Avg duration: ${formatDuration(m.avgDurationMs)}`);
      lines.push(`    Error rate:  ${(m.errorRate * 100).toFixed(1)}% (${m.failedCount} failed, ${m.rateLimitedCount} rate limited)`);
      lines.push(`    Est. cost:   ${formatCost(m.estimatedCost)}`);
      lines.push('');
    }

    return success(summary, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get metrics: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Options
// ============================================================================

const metricsOptions: CommandOption[] = [
  {
    name: 'range',
    short: 'r',
    description: 'Time range (e.g., 7d, 14d, 30d)',
    hasValue: true,
  },
  {
    name: 'provider',
    short: 'p',
    description: 'Filter by provider name',
    hasValue: true,
  },
  {
    name: 'group-by',
    short: 'g',
    description: 'Group by: provider (default), model, task, or agent',
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
];

// ============================================================================
// Command Definition
// ============================================================================

export const metricsCommand: Command = {
  name: 'metrics',
  description: 'Show provider metrics and usage statistics',
  usage: 'sf metrics [options]',
  help: `Show LLM provider usage metrics including token counts, estimated costs,
session counts, average duration, and error rates.

Options:
  --range, -r      Time range (e.g., 7d, 14d, 30d). Default: 7d
  --provider, -p   Filter by provider name (e.g., claude-code)
  --group-by, -g   Group by: provider (default), model, task, or agent
  --task, -t       Filter by task ID
  --agent, -a      Filter by agent ID

Examples:
  sf metrics                         Show metrics for last 7 days
  sf metrics --range 30d             Show metrics for last 30 days
  sf metrics --provider claude-code  Filter by provider
  sf metrics --group-by model        Group by model
  sf metrics --group-by task         Show per-task cost breakdown
  sf metrics --group-by agent        Show per-agent cost breakdown
  sf metrics --task el-abc123        Show metrics for a specific task
  sf metrics --agent el-xyz789       Show metrics for a specific agent
  sf metrics --json                  Output as JSON`,
  handler: metricsHandler,
  options: metricsOptions,
};
