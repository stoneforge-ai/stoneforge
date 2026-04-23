/**
 * Hook to fetch the latest displayable message for active sessions.
 *
 * Polls the batch endpoint `/api/sessions/latest-messages` to retrieve
 * the most recent message content per session. This is used by ActiveAgentCards
 * to show what each agent is currently doing (e.g. "Reading file src/index.ts")
 * instead of generic "working..." text.
 */

import { useQuery } from '@tanstack/react-query';

export interface LatestSessionMessage {
  content?: string;
  toolName?: string;
  type: string;
  timestamp: string;
  agentId: string;
}

interface LatestMessagesResponse {
  messages: Record<string, LatestSessionMessage>;
}

const API_BASE = '/api';

/**
 * Fetch the latest displayable messages for a batch of session IDs.
 */
async function fetchLatestMessages(sessionIds: string[]): Promise<LatestMessagesResponse> {
  if (sessionIds.length === 0) {
    return { messages: {} };
  }

  const response = await fetch(
    `${API_BASE}/sessions/latest-messages?sessionIds=${sessionIds.join(',')}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch latest messages: HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Hook that polls for the latest displayable message per active session.
 *
 * @param sessionIds - Array of active session IDs to fetch messages for
 * @returns Map from sessionId to latest message content string
 */
export function useLatestSessionMessages(sessionIds: string[]) {
  // Sort IDs to stabilize the query key (avoid unnecessary refetches)
  const sortedIds = [...sessionIds].sort();
  const queryKey = ['sessions', 'latest-messages', sortedIds];

  const { data, isLoading, error } = useQuery<LatestMessagesResponse>({
    queryKey,
    queryFn: () => fetchLatestMessages(sortedIds),
    enabled: sortedIds.length > 0,
    refetchInterval: 2000, // Poll every 2 seconds for responsive status updates
    staleTime: 1000, // Consider data fresh for 1 second
  });

  return {
    /** Map from sessionId to latest message content */
    latestBySession: data?.messages ?? {},
    isLoading,
    error,
  };
}
