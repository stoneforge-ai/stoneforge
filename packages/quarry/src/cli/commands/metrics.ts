/**
 * Metrics Command - Show provider metrics
 *
 * Displays LLM provider usage metrics including token counts,
 * estimated costs, session counts, and error rates.
 *
 * Cost estimates use per-model pricing from @stoneforge/core's
 * model pricing configuration, covering all 4 token categories.
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { createAPI } from '../db.js';
import type { StorageBackend } from '@stoneforge/storage';
import {
  type CostBreakdown,
  calculateCost,
  calculateCostFromPricing,
  lookupModelPricing,
} from '@stoneforge/core';

// ============================================================================
// Types
// ============================================================================

interface AggregateRow {
  [key: string]: unknown;
  group_key: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  session_count: number;
  avg_duration_ms: number;
  failed_count: number;
  rate_limited_count: number;
}

/** Per-model token breakdown for cost aggregation within a group */
interface ModelTokenRow {
  [key: string]: unknown;
  group_key: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

interface MetricsSummary {
  timeRange: { days: number; label: string };
  groupBy: string;
  metrics: Array<{
    group: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    totalTokens: number;
    sessionCount: number;
    avgDurationMs: number;
    errorRate: number;
    failedCount: number;
    rateLimitedCount: number;
    estimatedCost: CostBreakdown;
  }>;
  totals: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    sessionCount: number;
    estimatedCost: CostBreakdown;
  };
}

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
 * Query aggregated metrics directly from the database
 */
function queryMetrics(
  backend: StorageBackend,
  days: number,
  groupBy: 'provider' | 'model',
  providerFilter?: string
): AggregateRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const groupExpr = groupBy === 'provider' ? 'provider' : "COALESCE(model, 'unknown')";
  const params: unknown[] = [cutoffStr];

  let whereClause = 'WHERE timestamp >= ?';
  if (providerFilter) {
    whereClause += ' AND provider = ?';
    params.push(providerFilter);
  }

  return backend.query<AggregateRow>(
    `SELECT
       ${groupExpr} AS group_key,
       COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
       COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
       COALESCE(SUM(cache_read_tokens), 0) AS total_cache_read_tokens,
       COALESCE(SUM(cache_creation_tokens), 0) AS total_cache_creation_tokens,
       COUNT(*) AS session_count,
       COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
       COALESCE(SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
       COALESCE(SUM(CASE WHEN outcome = 'rate_limited' THEN 1 ELSE 0 END), 0) AS rate_limited_count
     FROM provider_metrics
     ${whereClause}
     GROUP BY group_key
     ORDER BY total_input_tokens + total_output_tokens DESC`,
    params
  );
}

/**
 * Compute cost breakdown for a model-grouped metric using model pricing lookup.
 */
function computeModelGroupCost(modelName: string, row: AggregateRow): CostBreakdown {
  const result = calculateCost(
    modelName,
    '',
    Number(row.total_input_tokens),
    Number(row.total_output_tokens),
    Number(row.total_cache_read_tokens),
    Number(row.total_cache_creation_tokens)
  );
  return {
    inputCost: result.inputCost,
    outputCost: result.outputCost,
    cacheReadCost: result.cacheReadCost,
    cacheCreationCost: result.cacheCreationCost,
    totalCost: result.totalCost,
  };
}

/**
 * Compute cost breakdown for a provider-grouped metric by querying
 * per-model token breakdowns from the database.
 */
function computeProviderGroupCost(
  backend: StorageBackend,
  providerName: string,
  cutoffStr: string
): CostBreakdown {
  const rows = backend.query<ModelTokenRow>(
    `SELECT
       provider AS group_key,
       COALESCE(model, 'unknown') AS model,
       COALESCE(SUM(input_tokens), 0) AS input_tokens,
       COALESCE(SUM(output_tokens), 0) AS output_tokens,
       COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
       COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
     FROM provider_metrics
     WHERE timestamp >= ? AND provider = ?
     GROUP BY provider, model`,
    [cutoffStr, providerName]
  );

  let totalInputCost = 0;
  let totalOutputCost = 0;
  let totalCacheReadCost = 0;
  let totalCacheCreationCost = 0;

  for (const row of rows) {
    const model = String(row.model ?? 'unknown');
    const { pricing } = lookupModelPricing(model);
    const cost = calculateCostFromPricing(
      pricing,
      Number(row.input_tokens),
      Number(row.output_tokens),
      Number(row.cache_read_tokens),
      Number(row.cache_creation_tokens)
    );
    totalInputCost += cost.inputCost;
    totalOutputCost += cost.outputCost;
    totalCacheReadCost += cost.cacheReadCost;
    totalCacheCreationCost += cost.cacheCreationCost;
  }

  return {
    inputCost: totalInputCost,
    outputCost: totalOutputCost,
    cacheReadCost: totalCacheReadCost,
    cacheCreationCost: totalCacheCreationCost,
    totalCost: totalInputCost + totalOutputCost + totalCacheReadCost + totalCacheCreationCost,
  };
}

/**
 * Sum multiple CostBreakdown objects into a single total.
 */
function sumCosts(costs: CostBreakdown[]): CostBreakdown {
  const result: CostBreakdown = {
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheCreationCost: 0,
    totalCost: 0,
  };
  for (const c of costs) {
    result.inputCost += c.inputCost;
    result.outputCost += c.outputCost;
    result.cacheReadCost += c.cacheReadCost;
    result.cacheCreationCost += c.cacheCreationCost;
    result.totalCost += c.totalCost;
  }
  return result;
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
    const groupBy = (options['group-by'] as string | undefined) === 'model' ? 'model' : 'provider';

    const rows = queryMetrics(backend, days, groupBy, providerFilter);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    const metrics = rows.map(row => {
      const estimatedCost = groupBy === 'model'
        ? computeModelGroupCost(row.group_key, row)
        : computeProviderGroupCost(backend, row.group_key, cutoffStr);

      return {
        group: row.group_key,
        totalInputTokens: Number(row.total_input_tokens),
        totalOutputTokens: Number(row.total_output_tokens),
        totalCacheReadTokens: Number(row.total_cache_read_tokens),
        totalCacheCreationTokens: Number(row.total_cache_creation_tokens),
        totalTokens: Number(row.total_input_tokens) + Number(row.total_output_tokens),
        sessionCount: Number(row.session_count),
        avgDurationMs: Math.round(Number(row.avg_duration_ms)),
        errorRate: Number(row.session_count) > 0
          ? Number(row.failed_count) / Number(row.session_count)
          : 0,
        failedCount: Number(row.failed_count),
        rateLimitedCount: Number(row.rate_limited_count),
        estimatedCost,
      };
    });

    const totalCost = sumCosts(metrics.map(m => m.estimatedCost));

    const totals = {
      totalInputTokens: metrics.reduce((sum, m) => sum + m.totalInputTokens, 0),
      totalOutputTokens: metrics.reduce((sum, m) => sum + m.totalOutputTokens, 0),
      totalTokens: metrics.reduce((sum, m) => sum + m.totalTokens, 0),
      sessionCount: metrics.reduce((sum, m) => sum + m.sessionCount, 0),
      estimatedCost: totalCost,
    };

    const summary: MetricsSummary = {
      timeRange: { days, label: `${days}d` },
      groupBy,
      metrics,
      totals,
    };

    // Build human-readable output
    const lines: string[] = [];
    const groupLabel = groupBy === 'provider' ? 'Provider' : 'Model';

    lines.push(`Provider Metrics (last ${days} days)`);
    if (providerFilter) {
      lines.push(`Filtered by provider: ${providerFilter}`);
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
    lines.push(`  Estimated cost:   ${formatCost(totals.estimatedCost.totalCost)}`);
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
      lines.push(`    Est. cost:   ${formatCost(m.estimatedCost.totalCost)} (in: ${formatCost(m.estimatedCost.inputCost)}, out: ${formatCost(m.estimatedCost.outputCost)}, cache: ${formatCost(m.estimatedCost.cacheReadCost + m.estimatedCost.cacheCreationCost)})`);
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
    description: 'Group by: provider (default) or model',
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
  --range, -r    Time range (e.g., 7d, 14d, 30d). Default: 7d
  --provider, -p Filter by provider name (e.g., claude-code)
  --group-by, -g Group by: provider (default) or model

Examples:
  sf metrics                  Show metrics for last 7 days
  sf metrics --range 30d      Show metrics for last 30 days
  sf metrics --provider claude-code  Filter by provider
  sf metrics --group-by model        Group by model
  sf metrics --json           Output as JSON`,
  handler: metricsHandler,
  options: metricsOptions,
};
