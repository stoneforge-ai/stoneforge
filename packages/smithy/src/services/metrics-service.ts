/**
 * Metrics Service
 *
 * Records and aggregates provider metrics for LLM usage tracking.
 * Stores data in the provider_metrics SQLite table and provides
 * aggregation queries for dashboards and CLI reporting.
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
 * Input for recording a single metric entry
 */
export interface RecordMetricInput {
  provider: string;
  model?: string;
  sessionId: string;
  taskId?: string;
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
 * Aggregated metrics for a group (provider or model)
 */
export interface AggregatedMetrics {
  /** Group key (provider name, model name, or agent ID) */
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
  /** Total duration in milliseconds (only present for agent grouping) */
  totalDurationMs?: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Number of failed sessions */
  failedCount: number;
  /** Number of rate-limited sessions */
  rateLimitedCount: number;
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
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  outcome: string;
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
   * Get aggregated metrics grouped by agent (via session_id → agent_id mapping)
   */
  aggregateByAgent(timeRange: TimeRange): AggregatedMetrics[];

  /**
   * Get time-series data for trend charts
   */
  getTimeSeries(timeRange: TimeRange, groupBy: 'provider' | 'model'): TimeSeriesPoint[];
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

// ============================================================================
// Implementation
// ============================================================================

export function createMetricsService(storage: StorageBackend): MetricsService {
  return {
    record(input: RecordMetricInput): void {
      const id = generateMetricId();
      const timestamp = new Date().toISOString();

      try {
        storage.run(
          `INSERT INTO provider_metrics (id, timestamp, provider, model, session_id, task_id, input_tokens, output_tokens, duration_ms, outcome)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            timestamp,
            input.provider,
            input.model ?? null,
            input.sessionId,
            input.taskId ?? null,
            input.inputTokens,
            input.outputTokens,
            input.durationMs,
            input.outcome,
          ]
        );

        logger.debug(`Metric recorded: ${input.provider}/${input.model ?? 'unknown'} - ${input.outcome} (${input.inputTokens + input.outputTokens} tokens)`);
      } catch (err) {
        logger.error('Failed to record metric:', err);
      }
    },

    aggregateByProvider(timeRange: TimeRange): AggregatedMetrics[] {
      const cutoff = getTimeCutoff(timeRange);

      const rows = storage.query<DbAggregateRow>(
        `SELECT
           provider AS group_key,
           COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
           COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
           COUNT(*) AS session_count,
           COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
           COALESCE(SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
           COALESCE(SUM(CASE WHEN outcome = 'rate_limited' THEN 1 ELSE 0 END), 0) AS rate_limited_count
         FROM provider_metrics
         WHERE timestamp >= ?
         GROUP BY provider
         ORDER BY total_input_tokens + total_output_tokens DESC`,
        [cutoff]
      );

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
      }));
    },

    aggregateByModel(timeRange: TimeRange): AggregatedMetrics[] {
      const cutoff = getTimeCutoff(timeRange);

      const rows = storage.query<DbAggregateRow>(
        `SELECT
           COALESCE(model, 'unknown') AS group_key,
           COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
           COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
           COUNT(*) AS session_count,
           COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
           COALESCE(SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
           COALESCE(SUM(CASE WHEN outcome = 'rate_limited' THEN 1 ELSE 0 END), 0) AS rate_limited_count
         FROM provider_metrics
         WHERE timestamp >= ?
         GROUP BY COALESCE(model, 'unknown')
         ORDER BY total_input_tokens + total_output_tokens DESC`,
        [cutoff]
      );

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
      }));
    },

    aggregateByAgent(timeRange: TimeRange): AggregatedMetrics[] {
      const cutoff = getTimeCutoff(timeRange);

      const rows = storage.query<DbAggregateRow & { total_duration_ms: number }>(
        `SELECT
           sm.agent_id AS group_key,
           COALESCE(SUM(pm.input_tokens), 0) AS total_input_tokens,
           COALESCE(SUM(pm.output_tokens), 0) AS total_output_tokens,
           COUNT(*) AS session_count,
           COALESCE(AVG(pm.duration_ms), 0) AS avg_duration_ms,
           COALESCE(SUM(pm.duration_ms), 0) AS total_duration_ms,
           COALESCE(SUM(CASE WHEN pm.outcome = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
           COALESCE(SUM(CASE WHEN pm.outcome = 'rate_limited' THEN 1 ELSE 0 END), 0) AS rate_limited_count
         FROM provider_metrics pm
         JOIN (
           SELECT DISTINCT session_id, agent_id
           FROM session_messages
         ) sm ON pm.session_id = sm.session_id
         WHERE pm.timestamp >= ?
         GROUP BY sm.agent_id
         ORDER BY total_input_tokens + total_output_tokens DESC`,
        [cutoff]
      );

      return rows.map(row => ({
        group: row.group_key,
        totalInputTokens: Number(row.total_input_tokens),
        totalOutputTokens: Number(row.total_output_tokens),
        totalTokens: Number(row.total_input_tokens) + Number(row.total_output_tokens),
        sessionCount: Number(row.session_count),
        avgDurationMs: Math.round(Number(row.avg_duration_ms)),
        totalDurationMs: Number(row.total_duration_ms),
        errorRate: Number(row.session_count) > 0
          ? Number(row.failed_count) / Number(row.session_count)
          : 0,
        failedCount: Number(row.failed_count),
        rateLimitedCount: Number(row.rate_limited_count),
      }));
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
           COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
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
      }));
    },
  };
}
