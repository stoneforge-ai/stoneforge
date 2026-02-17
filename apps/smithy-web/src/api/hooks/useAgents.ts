/**
 * React Query hooks for agent data
 *
 * Provides hooks for fetching and mutating agent data from the orchestrator API.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AgentRole,
  AgentsResponse,
  AgentResponse,
  AgentStatusResponse,
  SessionsResponse,
  SessionMessagesResponse,
  CreateAgentInput,
  ProvidersResponse,
  ProviderModelsResponse,
  StewardTrigger,
} from '../types';

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
 * Hook to fetch all agents
 */
export function useAgents(role?: AgentRole) {
  return useQuery<AgentsResponse, Error>({
    queryKey: ['agents', role],
    queryFn: () => fetchApi<AgentsResponse>(role ? `/agents?role=${role}` : '/agents'),
  });
}

/**
 * Hook to fetch available providers
 */
export function useProviders() {
  return useQuery<ProvidersResponse, Error>({
    queryKey: ['providers'],
    queryFn: () => fetchApi<ProvidersResponse>('/providers'),
    staleTime: 60_000, // Cache for 1 minute (providers change rarely)
  });
}

/**
 * Hook to fetch models available for a specific provider
 * @param providerName - The provider name (e.g., 'claude', 'openai')
 */
export function useProviderModels(providerName: string | undefined) {
  return useQuery<ProviderModelsResponse, Error>({
    queryKey: ['provider-models', providerName],
    queryFn: () => fetchApi<ProviderModelsResponse>(`/providers/${providerName}/models`),
    enabled: !!providerName,
    staleTime: 60_000, // Cache for 1 minute (models don't change often)
  });
}

/**
 * Hook to fetch a single agent by ID
 */
export function useAgent(agentId: string | undefined) {
  return useQuery<AgentResponse, Error>({
    queryKey: ['agent', agentId],
    queryFn: () => fetchApi<AgentResponse>(`/agents/${agentId}`),
    enabled: !!agentId,
  });
}

/**
 * Hook to fetch agent status (session info)
 */
export function useAgentStatus(agentId: string | undefined) {
  return useQuery<AgentStatusResponse, Error>({
    queryKey: ['agent-status', agentId],
    queryFn: () => fetchApi<AgentStatusResponse>(`/agents/${agentId}/status`),
    enabled: !!agentId,
    refetchInterval: 5000, // Poll every 5 seconds for status updates
  });
}

/**
 * Hook to fetch all sessions
 */
export function useSessions(filters?: { agentId?: string; role?: AgentRole; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.agentId) params.set('agentId', filters.agentId);
  if (filters?.role) params.set('role', filters.role);
  if (filters?.status) params.set('status', filters.status);

  const queryString = params.toString();
  const path = queryString ? `/sessions?${queryString}` : '/sessions';

  return useQuery<SessionsResponse, Error>({
    queryKey: ['sessions', filters],
    queryFn: () => fetchApi<SessionsResponse>(path),
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

/**
 * Fetch messages for a session (non-hook version for direct calls)
 */
export async function fetchSessionMessages(sessionId: string): Promise<SessionMessagesResponse> {
  return fetchApi<SessionMessagesResponse>(`/sessions/${sessionId}/messages`);
}

// ============================================================================
// Derived Data Hooks
// ============================================================================

/**
 * Hook to get agents separated by role (workers vs stewards)
 */
export function useAgentsByRole() {
  const { data, isLoading, error, refetch } = useAgents();

  // Memoize the derived data to prevent re-creating arrays on each render
  const result = useMemo(() => {
    const agents = data?.agents ?? [];

    const director = agents.find(a => a.metadata?.agent?.agentRole === 'director');
    const workers = agents.filter(a => a.metadata?.agent?.agentRole === 'worker');
    const stewards = agents.filter(a => a.metadata?.agent?.agentRole === 'steward');

    // Separate workers by mode
    const ephemeralWorkers = workers.filter(a => {
      const meta = a.metadata?.agent;
      return meta?.agentRole === 'worker' && (meta as { workerMode?: string })?.workerMode === 'ephemeral';
    });
    const persistentWorkers = workers.filter(a => {
      const meta = a.metadata?.agent;
      return meta?.agentRole === 'worker' && (meta as { workerMode?: string })?.workerMode === 'persistent';
    });

    return {
      director,
      workers,
      ephemeralWorkers,
      persistentWorkers,
      stewards,
      allAgents: agents,
    };
  }, [data?.agents]);

  return {
    ...result,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get the Director agent with status
 * Combines agent data and status for the Director agent panel
 */
export function useDirector() {
  const { director, isLoading: agentsLoading, error: agentsError, refetch: refetchAgents } = useAgentsByRole();

  const {
    data: statusData,
    isLoading: statusLoading,
    error: statusError
  } = useAgentStatus(director?.id);

  // Find the most recent session with a providerSessionId (resumable)
  const lastResumableSession = useMemo(() => {
    const history = statusData?.recentHistory ?? [];
    return history.find((h) => !!h.providerSessionId) ?? null;
  }, [statusData?.recentHistory]);

  const hasResumableSession = lastResumableSession !== null;

  return {
    director,
    hasActiveSession: statusData?.hasActiveSession ?? false,
    activeSession: statusData?.activeSession ?? null,
    recentHistory: statusData?.recentHistory ?? [],
    lastResumableSession,
    hasResumableSession,
    isLoading: agentsLoading || statusLoading,
    error: agentsError || statusError,
    refetch: refetchAgents,
  };
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to create a new agent
 * Note: Agent creation is done via the AgentRegistry on the server side.
 * This will need a dedicated endpoint once we add agent creation UI.
 */
export function useCreateAgent() {
  const queryClient = useQueryClient();

  return useMutation<AgentResponse, Error, CreateAgentInput>({
    mutationFn: async (input: CreateAgentInput) => {
      // Determine the endpoint based on role
      const endpoint = '/agents';
      return fetchApi<AgentResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      // Invalidate agents list to refetch
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

/**
 * Hook to start an agent session
 */
export function useStartAgentSession() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; session: unknown },
    Error,
    {
      agentId: string;
      taskId?: string;
      initialPrompt?: string;
      initialMessage?: string;
      interactive?: boolean;
      cols?: number;
      rows?: number;
    }
  >({
    mutationFn: async ({ agentId, taskId, initialPrompt, initialMessage, interactive, cols, rows }) => {
      return fetchApi(`/agents/${agentId}/start`, {
        method: 'POST',
        body: JSON.stringify({ taskId, initialPrompt, initialMessage, interactive, cols, rows }),
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to stop an agent session
 */
export function useStopAgentSession() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { agentId: string; graceful?: boolean }>({
    mutationFn: async ({ agentId, graceful }) => {
      return fetchApi(`/agents/${agentId}/stop`, {
        method: 'POST',
        body: JSON.stringify({ graceful }),
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * Hook to interrupt a running agent session
 */
export function useInterruptAgentSession() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { agentId: string }>({
    mutationFn: async ({ agentId }) => {
      return fetchApi(`/agents/${agentId}/interrupt`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-status', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * Hook to resume an agent session
 */
export function useResumeAgentSession() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; session: unknown }, Error, { agentId: string; providerSessionId?: string; resumePrompt?: string }>({
    mutationFn: async ({ agentId, providerSessionId, resumePrompt }) => {
      return fetchApi(`/agents/${agentId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ providerSessionId, resumePrompt }),
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status', agentId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * Hook to rename an agent
 */
export function useRenameAgent() {
  const queryClient = useQueryClient();

  return useMutation<AgentResponse, Error, { agentId: string; name: string }>({
    mutationFn: async ({ agentId, name }) => {
      return fetchApi<AgentResponse>(`/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });
}

/**
 * Hook to change an agent's provider
 */
export function useChangeAgentProvider() {
  const queryClient = useQueryClient();

  return useMutation<AgentResponse, Error, { agentId: string; provider: string }>({
    mutationFn: async ({ agentId, provider }) => {
      return fetchApi<AgentResponse>(`/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ provider }),
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });
}

/**
 * Hook to change an agent's model
 */
export function useChangeAgentModel() {
  const queryClient = useQueryClient();

  return useMutation<AgentResponse, Error, { agentId: string; model: string | null }>({
    mutationFn: async ({ agentId, model }) => {
      return fetchApi<AgentResponse>(`/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ model }),
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });
}

/**
 * Hook to change a steward agent's triggers
 */
export function useChangeAgentTriggers() {
  const queryClient = useQueryClient();

  return useMutation<AgentResponse, Error, { agentId: string; triggers: StewardTrigger[] }>({
    mutationFn: async ({ agentId, triggers }) => {
      return fetchApi<AgentResponse>(`/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ triggers }),
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });
}

/**
 * Hook to delete an agent
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { agentId: string }>({
    mutationFn: async ({ agentId }) => {
      return fetchApi(`/agents/${agentId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

// ============================================================================
// Operator (Human Entity) Hooks
// ============================================================================

/**
 * Operator entity as returned by the entities API
 */
export interface Operator {
  id: string;
  name: string;
  entityType: 'human';
}

interface OperatorsResponse {
  items: Operator[];
}

/**
 * Hook to fetch all operators (human entities) for task assignment
 * Operators are human users who can be assigned tasks
 */
export function useOperators() {
  return useQuery<OperatorsResponse, Error>({
    queryKey: ['operators'],
    queryFn: () => fetchApi<OperatorsResponse>('/entities?entityType=human&limit=100'),
  });
}
