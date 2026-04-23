/**
 * Hook to fetch per-agent token usage from the provider metrics API.
 *
 * Wraps useProviderMetrics with groupBy='agent' and extracts the metrics
 * for a specific agent ID. React Query's shared cache ensures that multiple
 * panes calling this hook don't trigger duplicate API requests.
 */

import { useProviderMetrics } from './useProviderMetrics';

export interface AgentTokenUsage {
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens consumed */
  outputTokens: number;
  /** Cache read input tokens */
  cacheReadTokens: number;
  /** Cache creation input tokens */
  cacheCreationTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Number of sessions included in the count */
  sessionCount: number;
  /** Estimated total cost in USD (if available) */
  estimatedCost?: number;
}

/**
 * Format a token count into a compact human-readable string.
 * e.g. 500 -> '500', 1200 -> '1.2k', 1500000 -> '1.5M'
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 100_000) {
    const k = count / 1000;
    // Show one decimal for < 10k, none for >= 10k
    return k < 10 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`;
  }
  if (count < 1_000_000) {
    return `${Math.round(count / 1000)}k`;
  }
  const m = count / 1_000_000;
  return m < 10 ? `${m.toFixed(1)}M` : `${Math.round(m)}M`;
}

/**
 * Format a cost value as USD.
 * - 0: "$0.00"
 * - < $0.01: "< $0.01"
 * - < $100: "$X.XX"
 * - >= $100: "$XXX"
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return '< $0.01';
  if (cost < 100) return `$${cost.toFixed(2)}`;
  return `$${Math.round(cost)}`;
}

/**
 * Hook to get token usage for a specific agent.
 *
 * When a sessionId is provided, returns token usage for that session only.
 * This ensures workspace pane headers show tokens for the current active session
 * rather than aggregated tokens across all past sessions.
 *
 * @param agentId - The agent ID to get metrics for, or undefined to skip fetching
 * @param sessionId - Optional session ID to filter to a specific session
 * @returns Token usage data for the agent, loading state, and any error
 */
export function useAgentTokens(agentId: string | undefined, sessionId?: string) {
  // When sessionId is provided, query metrics for that specific session
  // Otherwise fall back to agent-level aggregation (7-day window)
  const { data, isLoading, error } = useProviderMetrics(
    sessionId
      ? { sessionId }
      : { days: 7, groupBy: 'agent' }
  );

  if (!agentId || !data?.metrics) {
    return { tokens: null, isLoading, error };
  }

  // When querying by session, the API returns at most one entry
  // When querying by agent, find the entry matching the agent ID
  const metrics = sessionId
    ? data.metrics[0]
    : data.metrics.find((m) => m.group === agentId);

  if (!metrics) {
    return { tokens: null, isLoading, error };
  }

  const tokens: AgentTokenUsage = {
    inputTokens: metrics.totalInputTokens,
    outputTokens: metrics.totalOutputTokens,
    cacheReadTokens: metrics.totalCacheReadTokens ?? 0,
    cacheCreationTokens: metrics.totalCacheCreationTokens ?? 0,
    totalTokens: metrics.totalTokens,
    sessionCount: metrics.sessionCount,
    estimatedCost: metrics.estimatedCost?.totalCost,
  };

  return { tokens, isLoading, error };
}
