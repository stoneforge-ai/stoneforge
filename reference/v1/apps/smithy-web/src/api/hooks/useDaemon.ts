/**
 * React Query hooks for dispatch daemon control
 *
 * Provides hooks for fetching daemon status, starting/stopping the daemon, and waking it from rate-limit pauses.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface DaemonStatusResponse {
  isRunning: boolean;
  available: boolean;
  reason?: string;
  serverManaged: boolean;
  config?: {
    pollIntervalMs: number;
    workerAvailabilityPollEnabled: boolean;
    inboxPollEnabled: boolean;
    stewardTriggerPollEnabled: boolean;
    workflowTaskPollEnabled: boolean;
    directorInboxForwardingEnabled: boolean;
  };
  rateLimit?: {
    isPaused: boolean;
    limits: Array<{ executable: string; resetsAt: string }>;
    soonestReset?: string;
  };
}

export interface DaemonStartResponse {
  success: boolean;
  isRunning: boolean;
  alreadyRunning: boolean;
  serverManaged: boolean;
  message?: string;
}

export interface DaemonStopResponse {
  success: boolean;
  isRunning: boolean;
  wasRunning: boolean;
  wasServerManaged: boolean;
  message?: string;
}

export interface DaemonWakeResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch daemon status
 */
export function useDaemonStatus() {
  return useQuery<DaemonStatusResponse, Error>({
    queryKey: ['daemon-status'],
    queryFn: () => fetchApi<DaemonStatusResponse>('/daemon/status'),
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to start the dispatch daemon
 */
export function useStartDaemon() {
  const queryClient = useQueryClient();

  return useMutation<DaemonStartResponse, Error>({
    mutationFn: async () => {
      return fetchApi<DaemonStartResponse>('/daemon/start', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daemon-status'] });
    },
  });
}

/**
 * Hook to stop the dispatch daemon
 */
export function useStopDaemon() {
  const queryClient = useQueryClient();

  return useMutation<DaemonStopResponse, Error>({
    mutationFn: async () => {
      return fetchApi<DaemonStopResponse>('/daemon/stop', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daemon-status'] });
    },
  });
}

/**
 * Hook to wake the daemon from a rate-limit pause
 */
export function useWakeDaemon() {
  const queryClient = useQueryClient();

  return useMutation<DaemonWakeResponse, Error>({
    mutationFn: async () => {
      return fetchApi<DaemonWakeResponse>('/daemon/wake', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daemon-status'] });
    },
  });
}

/**
 * Hook to update daemon configuration
 */
export function useUpdateDaemonConfig() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; config: DaemonStatusResponse['config'] }, Error, { directorInboxForwardingEnabled?: boolean }>({
    mutationFn: async (config) => {
      return fetchApi('/daemon/config', {
        method: 'PATCH',
        body: JSON.stringify(config),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daemon-status'] });
    },
  });
}
