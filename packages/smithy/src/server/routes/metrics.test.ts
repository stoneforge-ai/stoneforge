/**
 * Provider Metrics Routes Tests
 *
 * Tests for GET /api/provider-metrics and GET /api/provider-metrics/pricing endpoints.
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
        totalTokens: 15000,
        sessionCount: 10,
        avgDurationMs: 5000,
        errorRate: 0.1,
        failedCount: 1,
        rateLimitedCount: 0,
        estimatedCost: 0.105,
      },
    ]),
    aggregateByModel: vi.fn().mockReturnValue([
      {
        group: 'claude-sonnet-4',
        totalInputTokens: 8000,
        totalOutputTokens: 4000,
        totalTokens: 12000,
        sessionCount: 8,
        avgDurationMs: 4500,
        errorRate: 0,
        failedCount: 0,
        rateLimitedCount: 0,
        estimatedCost: 0.084,
      },
    ]),
    aggregateByTask: vi.fn().mockReturnValue([
      {
        group: 'el-task1',
        totalInputTokens: 5000,
        totalOutputTokens: 2500,
        totalTokens: 7500,
        sessionCount: 3,
        avgDurationMs: 6000,
        errorRate: 0,
        failedCount: 0,
        rateLimitedCount: 0,
        estimatedCost: 0.0525,
      },
    ]),
    aggregateByAgent: vi.fn().mockReturnValue([
      {
        group: 'el-agent1',
        totalInputTokens: 6000,
        totalOutputTokens: 3000,
        totalTokens: 9000,
        sessionCount: 4,
        avgDurationMs: 5500,
        errorRate: 0,
        failedCount: 0,
        rateLimitedCount: 0,
        estimatedCost: 0.063,
      },
    ]),
    getTimeSeries: vi.fn().mockReturnValue([
      {
        bucket: '2026-02-22',
        group: 'claude-code',
        totalInputTokens: 5000,
        totalOutputTokens: 2500,
        sessionCount: 5,
        avgDurationMs: 4000,
        estimatedCost: 0.0525,
      },
    ]),
    estimateCost: vi.fn().mockReturnValue(0.018),
    getPricing: vi.fn().mockReturnValue({
      models: {
        '*': { inputCostPerMTok: 3, outputCostPerMTok: 15 },
        'claude-sonnet-4-20250514': { inputCostPerMTok: 3, outputCostPerMTok: 15 },
      },
    }),
  };

  return {
    metricsService,
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
    expect(body.metrics[0].estimatedCost).toBeDefined();
    expect(body.totals).toBeDefined();
    expect(body.totals.estimatedCost).toBeGreaterThan(0);
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

  it('accepts groupBy=task parameter', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?groupBy=task');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupBy).toBe('task');
    expect(body.metrics[0].group).toBe('el-task1');

    expect(services.metricsService.aggregateByTask).toHaveBeenCalledWith({ days: 7 });
  });

  it('accepts groupBy=agent parameter', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?groupBy=agent');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupBy).toBe('agent');
    expect(body.metrics[0].group).toBe('el-agent1');

    expect(services.metricsService.aggregateByAgent).toHaveBeenCalledWith({ days: 7 });
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
    expect(body.timeSeries[0].estimatedCost).toBeDefined();

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

  it('does not include time series for task/agent grouping', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics?groupBy=task&includeSeries=true');

    expect(res.status).toBe(200);
    const body = await res.json();
    // Time series only available for provider/model groupBy
    expect(body.timeSeries).toBeUndefined();
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

  it('includes totals in response', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toBeDefined();
    expect(body.totals.totalInputTokens).toBe(10000);
    expect(body.totals.totalOutputTokens).toBe(5000);
    expect(body.totals.totalTokens).toBe(15000);
    expect(body.totals.sessionCount).toBe(10);
    expect(body.totals.estimatedCost).toBeCloseTo(0.105);
  });
});

describe('GET /api/provider-metrics/pricing', () => {
  let services: Services;

  beforeEach(() => {
    services = createMockServices();
  });

  it('returns pricing configuration', async () => {
    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics/pricing');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models).toBeDefined();
    expect(body.models['*']).toBeDefined();
    expect(body.models['*'].inputCostPerMTok).toBe(3);
    expect(body.models['*'].outputCostPerMTok).toBe(15);
  });

  it('returns 500 when service throws', async () => {
    (services.metricsService.getPricing as ReturnType<typeof vi.fn>)
      .mockImplementation(() => { throw new Error('Config error'); });

    const app = createMetricsRoutes(services);
    const res = await app.request('/api/provider-metrics/pricing');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
