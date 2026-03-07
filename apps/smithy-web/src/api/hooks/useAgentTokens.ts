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
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Number of sessions included in the count */
  sessionCount: number;
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
 * Hook to get token usage for a specific agent.
 *
 * @param agentId - The agent ID to get metrics for, or undefined to skip fetching
 * @returns Token usage data for the agent, loading state, and any error
 */
export function useAgentTokens(agentId: string | undefined) {
  const { data, isLoading, error } = useProviderMetrics({
    days: 7,
    groupBy: 'agent',
  });

  if (!agentId || !data?.metrics) {
    return { tokens: null, isLoading, error };
  }

  const agentMetrics = data.metrics.find((m) => m.group === agentId);

  if (!agentMetrics) {
    return { tokens: null, isLoading, error };
  }

  const tokens: AgentTokenUsage = {
    inputTokens: agentMetrics.totalInputTokens,
    outputTokens: agentMetrics.totalOutputTokens,
    totalTokens: agentMetrics.totalTokens,
    sessionCount: agentMetrics.sessionCount,
  };

  return { tokens, isLoading, error };
}
