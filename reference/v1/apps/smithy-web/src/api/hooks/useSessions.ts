/**
 * useSessions - React hooks for session management
 *
 * Provides hooks for managing agent sessions, including stopping all agents.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface StopAllAgentsResponse {
  success: boolean;
  stoppedCount: number;
  failedCount?: number;
  message?: string;
  results?: { sessionId: string; agentId: string; success: boolean; error?: string }[];
}

const API_BASE = '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Hook to stop all running agent sessions.
 */
export function useStopAllAgents() {
  const queryClient = useQueryClient();

  return useMutation<StopAllAgentsResponse, Error>({
    mutationFn: async () => {
      return fetchApi<StopAllAgentsResponse>('/sessions/stop-all', {
        method: 'POST',
        body: JSON.stringify({ graceful: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
