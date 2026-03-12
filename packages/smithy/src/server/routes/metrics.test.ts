/**
 * Provider Metrics Routes Tests
 *
 * Tests for GET /api/provider-metrics endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Services } from '../services.js';
import { createMetricsRoutes } from './metrics.js';

// ============================================================================
// Mock Services Factory
// ============================================================================

function createMockServices() {
  const metricsService = {
    record: vi.fn(),
    aggregateByProvider: vi.fn().mockReturnValue([
      {
        group: 'claude-code',
        totalInputTokens: 10000,
        totalOutputTokens: 5000,
        totalCacheReadTokens: 3000,
        totalCacheCreationTokens: 500,
        totalTokens: 15000,
        sessionCount: 10,
        avgDurationMs: 5000,
        errorRate: 0.1,
        failedCount: 1,
        rateLimitedCount: 0,
      },
    ]),
    aggregateByModel: vi.fn().mockReturnValue([
      {
        group: 'claude-sonnet-4',
        totalInputTokens: 8000,
        totalOutputTokens: 4000,
        totalCacheReadTokens: 2000,
        totalCacheCreationTokens: 400,
        totalTokens: 12000,
        sessionCount: 8,
        avgDurationMs: 4500,
        errorRate: 0,
        failedCount: 0,
        rateLimitedCount: 0,
      },
    ]),
    aggregateByAgent: vi.fn().mockReturnValue([
      {
        group: 'el-w1',
        totalInputTokens: 12000,
        totalOutputTokens: 6000,
        totalCacheReadTokens: 4000,
        totalCacheCreationTokens: 800,
        totalTokens: 18000,
        sessionCount: 5,
        avgDurationMs: 6000,
        totalDurationMs: 30000,
        errorRate: 0,
        failedCount: 0,
        rateLimitedCount: 0,
      },
      {
        group: 'el-w2',
        totalInputTokens: 3000,
        totalOutputTokens: 1500,
        totalCacheReadTokens: 1000,
        totalCacheCreationTokens: 200,
        totalTokens: 4500,
        sessionCount: 2,
        avgDurationMs: 4000,
        totalDurationMs: 8000,
        errorRate: 0.5,
        failedCount: 1,
        rateLimitedCount: 0,
      },
    ]),
    getBySession: vi.fn().mockReturnValue({
      group: 'session-abc',
      totalInputTokens: 2000,
      totalOutputTokens: 1000,
      totalCacheReadTokens: 600,
      totalCacheCreationTokens: 150,
      totalTokens: 3000,
      sessionCount: 1,
      avgDurationMs: 5000,
      errorRate: 0,
      failedCount: 0,
      rateLimitedCount: 0,
    }),
    getTimeSeries: vi.fn().mockReturnValue([
      {
        bucket: '2026-02-22',
        group: 'claude-code',
        totalInputTokens: 5000,
        totalOutputTokens: 2500,
        sessionCount: 5,
        avgDurationMs: 4000,
      },
    ]),
  };

  const costService = {
    calculateCost: vi.fn().mockReturnValue({
      inputCost: 0.03,
      outputCost: 0.075,
      cacheReadCost: 0.001,
      cacheCreationCost: 0.002,
      totalCost: 0.108,
    }),
    enrichWithCosts: vi.fn().mockImplementation((metrics: Array<Record<string, unknown>>) =>
      metrics.map(m => ({
        ...m,
        estimatedCost: {
          inputCost: 0.03,
          outputCost: 0.075,
          cacheReadCost: 0.001,
          cacheCreationCost: 0.002,
          totalCost: 0.108,
        },
      }))
    ),
  };

  return {
    metricsService,
    costService,
  } as unknown as Services;
}

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/provider-metrics', () => {
  let services: Services;

  beforeEach(() => {
    services = createMockServices();
  });

  it('returns aggregated metrics with default parameters', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeRange).toEqual({ days: 7, label: '7d' });
    expect(body.groupBy).toBe('provider');
    expect(body.metrics).toHaveLength(1);
    expect(body.metrics[0].group).toBe('claude-code');
    expect(body.timeSeries).toBeUndefined();

    expect(services.metricsService.aggregateByProvider).toHaveBeenCalledWith({ days: 7 });
  });

  it('accepts timeRange parameter', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?timeRange=30d');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeRange).toEqual({ days: 30, label: '30d' });

    expect(services.metricsService.aggregateByProvider).toHaveBeenCalledWith({ days: 30 });
  });

  it('accepts groupBy=model parameter', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?groupBy=model');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupBy).toBe('model');
    expect(body.metrics[0].group).toBe('claude-sonnet-4');

    expect(services.metricsService.aggregateByModel).toHaveBeenCalledWith({ days: 7 });
  });

  it('accepts groupBy=agent parameter', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?groupBy=agent');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupBy).toBe('agent');
    expect(body.metrics).toHaveLength(2);
    expect(body.metrics[0].group).toBe('el-w1');
    expect(body.metrics[0].totalInputTokens).toBe(12000);
    expect(body.metrics[0].totalOutputTokens).toBe(6000);
    expect(body.metrics[0].sessionCount).toBe(5);
    expect(body.metrics[0].totalDurationMs).toBe(30000);
    expect(body.metrics[1].group).toBe('el-w2');

    expect(services.metricsService.aggregateByAgent).toHaveBeenCalledWith({ days: 7 });
  });

  it('does not include time series for groupBy=agent', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?groupBy=agent&includeSeries=true');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupBy).toBe('agent');
    expect(body.timeSeries).toBeUndefined();

    expect(services.metricsService.getTimeSeries).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid groupBy parameter', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?groupBy=invalid');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PARAM');
  });

  it('includes time series when includeSeries=true', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?includeSeries=true');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeSeries).toBeDefined();
    expect(body.timeSeries).toHaveLength(1);
    expect(body.timeSeries[0].bucket).toBe('2026-02-22');

    expect(services.metricsService.getTimeSeries).toHaveBeenCalledWith({ days: 7 }, 'provider');
  });

  it('does not include time series by default', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeSeries).toBeUndefined();

    expect(services.metricsService.getTimeSeries).not.toHaveBeenCalled();
  });

  it('defaults to 7d for invalid timeRange', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?timeRange=invalid');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeRange.days).toBe(7);
  });

  it('returns 500 when service throws', async () => {
    (services.metricsService.aggregateByProvider as ReturnType<typeof vi.fn>)
      .mockImplementation(() => { throw new Error('DB error'); });

    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns session-specific metrics when sessionId is provided', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?sessionId=session-abc');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timeRange).toEqual({ days: 0, label: 'session' });
    expect(body.groupBy).toBe('session');
    expect(body.metrics).toHaveLength(1);
    expect(body.metrics[0].group).toBe('session-abc');
    expect(body.metrics[0].totalInputTokens).toBe(2000);
    expect(body.metrics[0].totalOutputTokens).toBe(1000);

    expect(services.metricsService.getBySession).toHaveBeenCalledWith('session-abc');
    // Should NOT call aggregate methods
    expect(services.metricsService.aggregateByProvider).not.toHaveBeenCalled();
    expect(services.metricsService.aggregateByAgent).not.toHaveBeenCalled();
  });

  it('returns empty metrics array when sessionId has no data', async () => {
    (services.metricsService.getBySession as ReturnType<typeof vi.fn>)
      .mockReturnValue(null);

    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?sessionId=session-unknown');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics).toHaveLength(0);
  });
});
