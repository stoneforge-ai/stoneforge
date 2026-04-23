/**
 * React Query hook for provider metrics data
 *
 * Fetches aggregated provider/model metrics from GET /api/provider-metrics
 * with configurable time range and groupBy options. Polls every 10 seconds
 * to match existing hooks pattern.
 */

import { useQuery } from '@tanstack/react-query';
import type { ProviderMetricsResponse } from '../types';

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = '/api';

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Query Hook
// ============================================================================

export interface UseProviderMetricsOptions {
  /** Time range in days (7, 14, 30) */
  days?: number;
  /** Group by 'provider', 'model', or 'agent' */
  groupBy?: 'provider' | 'model' | 'agent';
  /** Whether to include time-series data */
  includeSeries?: boolean;
  /** Optional session ID to filter metrics to a specific session */
  sessionId?: string;
  /** Polling interval in ms (default: 5000) */
  refetchInterval?: number;
}

/**
 * Hook to fetch provider metrics with aggregated data and optional time series.
 *
 * @example
 * ```ts
 * const { data, isLoading, error } = useProviderMetrics({ days: 7, includeSeries: true });
 * // Or fetch metrics for a specific session:
 * const { data } = useProviderMetrics({ sessionId: 'session-abc' });
 * ```
 */
export function useProviderMetrics(options?: UseProviderMetricsOptions) {
  const days = options?.days ?? 7;
  const groupBy = options?.groupBy ?? 'provider';
  const includeSeries = options?.includeSeries ?? false;
  const sessionId = options?.sessionId;
  const refetchInterval = options?.refetchInterval ?? 5000;

  const params = new URLSearchParams();

  if (sessionId) {
    // Session-specific query — ignores timeRange and groupBy
    params.set('sessionId', sessionId);
  } else {
    params.set('timeRange', `${days}d`);
    params.set('groupBy', groupBy);
    if (includeSeries) {
      params.set('includeSeries', 'true');
    }
  }

  const path = `/provider-metrics?${params.toString()}`;

  return useQuery<ProviderMetricsResponse, Error>({
    queryKey: sessionId
      ? ['provider-metrics', 'session', sessionId]
      : ['provider-metrics', days, groupBy, includeSeries],
    queryFn: () => fetchApi<ProviderMetricsResponse>(path),
    refetchInterval,
  });
}
