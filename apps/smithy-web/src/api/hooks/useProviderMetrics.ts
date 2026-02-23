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
  /** Group by 'provider' or 'model' */
  groupBy?: 'provider' | 'model';
  /** Whether to include time-series data */
  includeSeries?: boolean;
}

/**
 * Hook to fetch provider metrics with aggregated data and optional time series.
 *
 * @example
 * ```ts
 * const { data, isLoading, error } = useProviderMetrics({ days: 7, includeSeries: true });
 * ```
 */
export function useProviderMetrics(options?: UseProviderMetricsOptions) {
  const days = options?.days ?? 7;
  const groupBy = options?.groupBy ?? 'provider';
  const includeSeries = options?.includeSeries ?? false;

  const params = new URLSearchParams();
  params.set('timeRange', `${days}d`);
  params.set('groupBy', groupBy);
  if (includeSeries) {
    params.set('includeSeries', 'true');
  }

  const path = `/provider-metrics?${params.toString()}`;

  return useQuery<ProviderMetricsResponse, Error>({
    queryKey: ['provider-metrics', days, groupBy, includeSeries],
    queryFn: () => fetchApi<ProviderMetricsResponse>(path),
    refetchInterval: 10000, // Poll every 10 seconds (matches useTasks pattern)
  });
}
