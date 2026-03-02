/**
 * Metrics Service
 *
 * Records and aggregates provider metrics for LLM usage tracking.
 * Stores data in the provider_metrics SQLite table and provides
 * aggregation queries for dashboards and CLI reporting.
 *
 * Features:
 * - Per-session token and cost recording
 * - Configurable model pricing for cost estimation
 * - Aggregation by provider, model, task, or agent
 * - Time-series data for trend charts
 * - Per-task and per-agent cost attribution
 */

import type { StorageBackend } from '@stoneforge/storage';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('metrics-service');

// ============================================================================
// Types
// ============================================================================

/**
 * Outcome of a provider session
 */
export type MetricOutcome = 'completed' | 'failed' | 'rate_limited' | 'handoff';

/**
 * Pricing for a specific model (per million tokens)
 */
export interface ModelPricing {
  /** Cost per million input tokens in USD */
  inputCostPerMTok: number;
  /** Cost per million output tokens in USD */
  outputCostPerMTok: number;
}

/**
 * Pricing configuration for cost estimation.
 * Keys are model name patterns (exact match or '*' for default).
 */
export interface PricingConfig {
  /** Model-specific pricing. Key is model name or '*' for default fallback. */
  models: Record<string, ModelPricing>;
}

/**
 * Default pricing configuration.
 * Uses approximate Claude pricing as the default.
 */
export const DEFAULT_PRICING: PricingConfig = {
  models: {
    // Claude Sonnet 4 pricing
    'claude-sonnet-4-20250514': { inputCostPerMTok: 3, outputCostPerMTok: 15 },
    // Claude Opus 4 pricing
    'claude-opus-4-20250514': { inputCostPerMTok: 15, outputCostPerMTok: 75 },
    // Claude Haiku 3.5 pricing
    'claude-3-5-haiku-20241022': { inputCostPerMTok: 0.80, outputCostPerMTok: 4 },
    // Default fallback — approximate Sonnet pricing
    '*': { inputCostPerMTok: 3, outputCostPerMTok: 15 },
  },
};

/**
 * Input for recording a single metric entry
 */
export interface RecordMetricInput {
  provider: string;
  model?: string;
  sessionId: string;
  taskId?: string;
  agentId?: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  outcome: MetricOutcome;
}

/**
 * Time range for aggregation queries
 */
export interface TimeRange {
  /** Number of days to look back (e.g., 7, 14, 30) */
  days: number;
}

/**
 * Aggregated metrics for a group (provider, model, task, or agent)
 */
export interface AggregatedMetrics {
  /** Group key (provider name, model name, task ID, or agent ID) */
  group: string;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Number of sessions */
  sessionCount: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Number of failed sessions */
  failedCount: number;
  /** Number of rate-limited sessions */
  rateLimitedCount: number;
  /** Estimated cost in USD */
  estimatedCost: number;
}

/**
 * A single time-series data point
 */
export interface TimeSeriesPoint {
  /** Time bucket (ISO 8601 date string) */
  bucket: string;
  /** Group key (provider or model name) */
  group: string;
  /** Total input tokens in this bucket */
  totalInputTokens: number;
  /** Total output tokens in this bucket */
  totalOutputTokens: number;
  /** Number of sessions in this bucket */
  sessionCount: number;
  /** Average duration in milliseconds for this bucket */
  avgDurationMs: number;
  /** Estimated cost in USD for this bucket */
  estimatedCost: number;
}

/**
 * Database row type for provider_metrics
 */
interface DbMetricRow {
  [key: string]: unknown;
  id: string;
  timestamp: string;
  provider: string;
  model: string | null;
  session_id: string;
  task_id: string | null;
  agent_id: string | null;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  outcome: string;
  estimated_cost: number | null;
}

/**
 * Database row for aggregation queries
 */
interface DbAggregateRow {
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

/**
 * Database row for time-series queries
 */
interface DbTimeSeriesRow {
  [key: string]: unknown;
  bucket: string;
  group_key: string;
  total_input_tokens: number;
  total_output_tokens: number;
  session_count: number;
  avg_duration_ms: number;
  total_estimated_cost: number;
}

// ============================================================================
// Interface
// ============================================================================

export interface MetricsService {
  /**
   * Record a provider metric entry
   */
  record(input: RecordMetricInput): void;

  /**
   * Get aggregated metrics grouped by provider
   */
  aggregateByProvider(timeRange: TimeRange): AggregatedMetrics[];

  /**
   * Get aggregated metrics grouped by model
   */
  aggregateByModel(timeRange: TimeRange): AggregatedMetrics[];

  /**
   * Get aggregated metrics grouped by task
   */
  aggregateByTask(timeRange: TimeRange): AggregatedMetrics[];

  /**
   * Get aggregated metrics grouped by agent
   */
  aggregateByAgent(timeRange: TimeRange): AggregatedMetrics[];

  /**
   * Get time-series data for trend charts
   */
  getTimeSeries(timeRange: TimeRange, groupBy: 'provider' | 'model'): TimeSeriesPoint[];

  /**
   * Estimate cost for given token counts and model
   */
  estimateCost(inputTokens: number, outputTokens: number, model?: string): number;

  /**
   * Get the current pricing configuration
   */
  getPricing(): PricingConfig;
}

// ============================================================================
// Helpers
// ============================================================================

function generateMetricId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `pm-${timestamp}-${random}`;
}

function getTimeCutoff(timeRange: TimeRange): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - timeRange.days);
  return cutoff.toISOString();
}

/**
 * Determine the appropriate time bucket size based on the time range.
 * Uses SQLite date functions for grouping.
 */
function getTimeBucketExpression(timeRange: TimeRange): string {
  if (timeRange.days <= 7) {
    // Daily buckets for 7 days or less
    return "date(timestamp)";
  } else if (timeRange.days <= 30) {
    // Daily buckets for up to 30 days
    return "date(timestamp)";
  } else {
    // Weekly buckets for longer ranges
    return "date(timestamp, 'weekday 0', '-6 days')";
  }
}

/**
 * Calculate estimated cost based on token counts and model pricing.
 */
export function calculateEstimatedCost(
  inputTokens: number,
  outputTokens: number,
  model: string | undefined,
  pricing: PricingConfig
): number {
  // Look up model-specific pricing, fall back to default
  const modelPricing = (model && pricing.models[model]) || pricing.models['*'];
  if (!modelPricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * modelPricing.inputCostPerMTok;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.outputCostPerMTok;
  return inputCost + outputCost;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Creates a MetricsService with optional custom pricing configuration.
 */
export function createMetricsService(
  storage: StorageBackend,
  pricing: PricingConfig = DEFAULT_PRICING
): MetricsService {

  function buildAggregateQuery(
    groupExpr: string,
    cutoff: string,
    extraWhere?: string,
    extraParams?: unknown[]
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [cutoff];
    let whereClause = 'WHERE timestamp >= ?';
    if (extraWhere) {
      whereClause += ` AND ${extraWhere}`;
      if (extraParams) params.push(...extraParams);
    }

    const sql = `SELECT
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
         ORDER BY total_estimated_cost DESC`;

    return { sql, params };
  }

  function mapAggregateRows(rows: DbAggregateRow[]): AggregatedMetrics[] {
    return rows.map(row => ({
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
  }

  return {
    record(input: RecordMetricInput): void {
      const id = generateMetricId();
      const timestamp = new Date().toISOString();
      const estimatedCost = calculateEstimatedCost(
        input.inputTokens,
        input.outputTokens,
        input.model,
        pricing
      );

      try {
        storage.run(
          `INSERT INTO provider_metrics (id, timestamp, provider, model, session_id, task_id, agent_id, input_tokens, output_tokens, duration_ms, outcome, estimated_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            timestamp,
            input.provider,
            input.model ?? null,
            input.sessionId,
            input.taskId ?? null,
            input.agentId ?? null,
            input.inputTokens,
            input.outputTokens,
            input.durationMs,
            input.outcome,
            estimatedCost,
          ]
        );

        logger.debug(
          `Metric recorded: ${input.provider}/${input.model ?? 'unknown'} - ${input.outcome} ` +
          `(${input.inputTokens + input.outputTokens} tokens, est. $${estimatedCost.toFixed(4)})`
        );
      } catch (err) {
        logger.error('Failed to record metric:', err);
      }
    },

    aggregateByProvider(timeRange: TimeRange): AggregatedMetrics[] {
      const cutoff = getTimeCutoff(timeRange);
      const { sql, params } = buildAggregateQuery('provider', cutoff);
      const rows = storage.query<DbAggregateRow>(sql, params);
      return mapAggregateRows(rows);
    },

    aggregateByModel(timeRange: TimeRange): AggregatedMetrics[] {
      const cutoff = getTimeCutoff(timeRange);
      const { sql, params } = buildAggregateQuery("COALESCE(model, 'unknown')", cutoff);
      const rows = storage.query<DbAggregateRow>(sql, params);
      return mapAggregateRows(rows);
    },

    aggregateByTask(timeRange: TimeRange): AggregatedMetrics[] {
      const cutoff = getTimeCutoff(timeRange);
      const { sql, params } = buildAggregateQuery(
        "COALESCE(task_id, 'unassigned')",
        cutoff,
        'task_id IS NOT NULL'
      );
      const rows = storage.query<DbAggregateRow>(sql, params);
      return mapAggregateRows(rows);
    },

    aggregateByAgent(timeRange: TimeRange): AggregatedMetrics[] {
      const cutoff = getTimeCutoff(timeRange);
      const { sql, params } = buildAggregateQuery(
        "COALESCE(agent_id, 'unknown')",
        cutoff,
        'agent_id IS NOT NULL'
      );
      const rows = storage.query<DbAggregateRow>(sql, params);
      return mapAggregateRows(rows);
    },

    getTimeSeries(timeRange: TimeRange, groupBy: 'provider' | 'model'): TimeSeriesPoint[] {
      const cutoff = getTimeCutoff(timeRange);
      const bucketExpr = getTimeBucketExpression(timeRange);
      const groupExpr = groupBy === 'provider' ? 'provider' : "COALESCE(model, 'unknown')";

      const rows = storage.query<DbTimeSeriesRow>(
        `SELECT
           ${bucketExpr} AS bucket,
           ${groupExpr} AS group_key,
           COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
           COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
           COUNT(*) AS session_count,
           COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
           COALESCE(SUM(estimated_cost), 0) AS total_estimated_cost
         FROM provider_metrics
         WHERE timestamp >= ?
         GROUP BY bucket, group_key
         ORDER BY bucket ASC, group_key ASC`,
        [cutoff]
      );

      return rows.map(row => ({
        bucket: row.bucket,
        group: row.group_key,
        totalInputTokens: Number(row.total_input_tokens),
        totalOutputTokens: Number(row.total_output_tokens),
        sessionCount: Number(row.session_count),
        avgDurationMs: Math.round(Number(row.avg_duration_ms)),
        estimatedCost: Number(row.total_estimated_cost),
      }));
    },

    estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
      return calculateEstimatedCost(inputTokens, outputTokens, model, pricing);
    },

    getPricing(): PricingConfig {
      return pricing;
    },
  };
}
