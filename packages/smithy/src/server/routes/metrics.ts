/**
 * Provider Metrics Routes
 *
 * API endpoints for querying aggregated provider metrics
 * suitable for the web UI and CLI consumption.
 *
 * Supports:
 * - Aggregation by provider, model, task, or agent
 * - Time-series data for trend charts
 * - Cost estimation in response data
 * - Filtering by task ID or agent ID
 */

import { Hono } from 'hono';
import type { Services } from '../services.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('metrics-routes');

/**
 * Parse a time range string (e.g., '7d', '14d', '30d') to number of days.
 * Defaults to 7 if invalid.
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

const VALID_GROUP_BY = new Set(['provider', 'model', 'task', 'agent']);

export function createMetricsRoutes(services: Services) {
  const app = new Hono();

  /**
   * GET /api/provider-metrics
   *
   * Query params:
   *   - timeRange: '7d' | '14d' | '30d' (default: '7d')
   *   - groupBy: 'provider' | 'model' | 'task' | 'agent' (default: 'provider')
   *   - includeSeries: 'true' | 'false' (default: 'false') — include time-series data
   */
  app.get('/api/provider-metrics', (c) => {
    try {
      const timeRangeParam = c.req.query('timeRange');
      const groupBy = c.req.query('groupBy') || 'provider';
      const includeSeries = c.req.query('includeSeries') === 'true';

      if (!VALID_GROUP_BY.has(groupBy)) {
        return c.json(
          { error: { code: 'INVALID_PARAM', message: 'groupBy must be "provider", "model", "task", or "agent"' } },
          400
        );
      }

      const days = parseTimeRange(timeRangeParam);
      const timeRange = { days };

      let aggregated;
      switch (groupBy) {
        case 'provider':
          aggregated = services.metricsService.aggregateByProvider(timeRange);
          break;
        case 'model':
          aggregated = services.metricsService.aggregateByModel(timeRange);
          break;
        case 'task':
          aggregated = services.metricsService.aggregateByTask(timeRange);
          break;
        case 'agent':
          aggregated = services.metricsService.aggregateByAgent(timeRange);
          break;
        default:
          aggregated = services.metricsService.aggregateByProvider(timeRange);
      }

      // Compute totals
      const totals = {
        totalInputTokens: aggregated.reduce((sum, m) => sum + m.totalInputTokens, 0),
        totalOutputTokens: aggregated.reduce((sum, m) => sum + m.totalOutputTokens, 0),
        totalTokens: aggregated.reduce((sum, m) => sum + m.totalTokens, 0),
        sessionCount: aggregated.reduce((sum, m) => sum + m.sessionCount, 0),
        estimatedCost: aggregated.reduce((sum, m) => sum + m.estimatedCost, 0),
      };

      const result: {
        timeRange: { days: number; label: string };
        groupBy: string;
        metrics: typeof aggregated;
        totals: typeof totals;
        timeSeries?: ReturnType<typeof services.metricsService.getTimeSeries>;
      } = {
        timeRange: { days, label: `${days}d` },
        groupBy,
        metrics: aggregated,
        totals,
      };

      if (includeSeries && (groupBy === 'provider' || groupBy === 'model')) {
        result.timeSeries = services.metricsService.getTimeSeries(timeRange, groupBy);
      }

      return c.json(result);
    } catch (error) {
      logger.error('Failed to get provider metrics:', error);
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: String(error) } },
        500
      );
    }
  });

  /**
   * GET /api/provider-metrics/pricing
   *
   * Returns the current pricing configuration used for cost estimation.
   */
  app.get('/api/provider-metrics/pricing', (c) => {
    try {
      return c.json(services.metricsService.getPricing());
    } catch (error) {
      logger.error('Failed to get pricing config:', error);
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: String(error) } },
        500
      );
    }
  });

  return app;
}
