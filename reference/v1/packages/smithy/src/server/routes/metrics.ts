/**
 * Provider Metrics Routes
 *
 * API endpoint for querying aggregated provider metrics
 * suitable for the web UI and CLI consumption.
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

export function createMetricsRoutes(services: Services) {
  const app = new Hono();

  /**
   * GET /api/provider-metrics
   *
   * Query params:
   *   - timeRange: '7d' | '14d' | '30d' (default: '7d')
   *   - groupBy: 'provider' | 'model' | 'agent' (default: 'provider')
   *   - includeSeries: 'true' | 'false' (default: 'false') — include time-series data
   *   - sessionId: string (optional) — filter to a specific session; returns metrics for that session only
   */
  app.get('/api/provider-metrics', (c) => {
    try {
      const sessionId = c.req.query('sessionId');
      const timeRangeParam = c.req.query('timeRange');
      const groupBy = c.req.query('groupBy') || 'provider';
      const includeSeries = c.req.query('includeSeries') === 'true';

      // If sessionId is provided, return metrics for that session only
      if (sessionId) {
        const sessionMetrics = services.metricsService.getBySession(sessionId);
        const metrics = sessionMetrics ? [sessionMetrics] : [];
        const metricsWithCost = services.costService.enrichWithCosts(metrics, 'session');
        return c.json({
          timeRange: { days: 0, label: 'session' },
          groupBy: 'session',
          metrics: metricsWithCost,
        });
      }

      if (groupBy !== 'provider' && groupBy !== 'model' && groupBy !== 'agent') {
        return c.json(
          { error: { code: 'INVALID_PARAM', message: 'groupBy must be "provider", "model", or "agent"' } },
          400
        );
      }

      const days = parseTimeRange(timeRangeParam);
      const timeRange = { days };

      let aggregated;
      if (groupBy === 'agent') {
        aggregated = services.metricsService.aggregateByAgent(timeRange);
      } else if (groupBy === 'model') {
        aggregated = services.metricsService.aggregateByModel(timeRange);
      } else {
        aggregated = services.metricsService.aggregateByProvider(timeRange);
      }

      // Enrich metrics with cost breakdowns
      const metricsWithCost = services.costService.enrichWithCosts(aggregated, groupBy, timeRange);

      const result: {
        timeRange: { days: number; label: string };
        groupBy: string;
        metrics: typeof metricsWithCost;
        timeSeries?: ReturnType<typeof services.metricsService.getTimeSeries>;
      } = {
        timeRange: { days, label: `${days}d` },
        groupBy,
        metrics: metricsWithCost,
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

  return app;
}
