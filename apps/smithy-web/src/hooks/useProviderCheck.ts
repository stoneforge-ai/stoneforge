/**
 * useProviderCheck Hook
 *
 * Detects uninstalled providers used by registered agents.
 * Cross-references agent metadata with provider availability data
 * and exposes a verify function for re-checking individual providers.
 */

import { useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgents, useProviders } from '../api/hooks/useAgents';
import type { Agent, ProviderInfo } from '../api/types';

// ============================================================================
// Types
// ============================================================================

export interface MissingProvider {
  /** Provider name (e.g. 'claude-code') */
  name: string;
  /** Human-readable install instructions (may contain newlines) */
  installInstructions: string;
  /** Agents that depend on this provider */
  agents: Agent[];
}

export interface UseProviderCheckReturn {
  /** Providers that are used by at least one agent but not available */
  missingProviders: MissingProvider[];
  /** Providers that are currently installed and available (for change-provider UI) */
  availableProviders: ProviderInfo[];
  /** Whether agent or provider data is still loading */
  isLoading: boolean;
  /** Refetch both agents and providers */
  refetch: () => void;
  /** Verify a single provider and update state on success */
  verifyProvider: (name: string) => Promise<ProviderInfo>;
  /** Whether a specific provider is currently being verified */
  isVerifying: (name: string) => boolean;
}

// ============================================================================
// API
// ============================================================================

const API_BASE = '/api';

async function verifyProviderApi(name: string): Promise<ProviderInfo> {
  const response = await fetch(`${API_BASE}/providers/${encodeURIComponent(name)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }
  return response.json();
}

// ============================================================================
// Hook
// ============================================================================

const DEFAULT_PROVIDER = 'claude-code';

export function useProviderCheck(): UseProviderCheckReturn {
  const queryClient = useQueryClient();
  const { data: agentsData, isLoading: agentsLoading, refetch: refetchAgents } = useAgents();
  const { data: providersData, isLoading: providersLoading, refetch: refetchProviders } = useProviders();

  // Track which providers are currently being verified
  const verifyMutation = useMutation<
    ProviderInfo,
    Error,
    string,
    unknown
  >({
    mutationFn: verifyProviderApi,
    onSuccess: (result) => {
      // Update the providers cache with the fresh availability data
      queryClient.setQueryData<{ providers: ProviderInfo[] }>(['providers'], (old) => {
        if (!old) return old;
        return {
          ...old,
          providers: old.providers.map((p) =>
            p.name === result.name ? { ...p, available: result.available } : p
          ),
        };
      });
    },
  });

  const missingProviders = useMemo(() => {
    const agents = agentsData?.agents ?? [];
    const providers = providersData?.providers ?? [];

    if (agents.length === 0 || providers.length === 0) {
      return [];
    }

    // Build a map of provider name -> ProviderInfo
    const providerMap = new Map<string, ProviderInfo>();
    for (const p of providers) {
      providerMap.set(p.name, p);
    }

    // Group agents by their provider
    const agentsByProvider = new Map<string, Agent[]>();
    for (const agent of agents) {
      const providerName = agent.metadata?.agent?.provider || DEFAULT_PROVIDER;
      const existing = agentsByProvider.get(providerName) ?? [];
      existing.push(agent);
      agentsByProvider.set(providerName, existing);
    }

    // Find providers that are used but not available
    const missing: MissingProvider[] = [];
    for (const [providerName, providerAgents] of agentsByProvider) {
      const providerInfo = providerMap.get(providerName);
      // If provider info exists and it's not available, it's missing
      if (providerInfo && !providerInfo.available) {
        missing.push({
          name: providerInfo.name,
          installInstructions: providerInfo.installInstructions,
          agents: providerAgents,
        });
      }
    }

    return missing;
  }, [agentsData?.agents, providersData?.providers]);

  const availableProviders = useMemo(() => {
    const providers = providersData?.providers ?? [];
    return providers.filter((p) => p.available);
  }, [providersData?.providers]);

  const refetch = useCallback(() => {
    refetchAgents();
    refetchProviders();
  }, [refetchAgents, refetchProviders]);

  const verifyProvider = useCallback(
    (name: string) => verifyMutation.mutateAsync(name),
    [verifyMutation]
  );

  const isVerifying = useCallback(
    (name: string) => verifyMutation.isPending && verifyMutation.variables === name,
    [verifyMutation.isPending, verifyMutation.variables]
  );

  return {
    missingProviders,
    availableProviders,
    isLoading: agentsLoading || providersLoading,
    refetch,
    verifyProvider,
    isVerifying,
  };
}
