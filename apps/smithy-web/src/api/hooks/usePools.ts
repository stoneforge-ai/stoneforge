/**
 * usePools Hook - React Query hooks for agent pool management
 *
 * Provides hooks for:
 * - Fetching pools
 * - Creating pools
 * - Updating pools
 * - Deleting pools
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface PoolAgentTypeConfig {
  role: 'worker' | 'steward';
  workerMode?: 'ephemeral' | 'persistent';
  stewardFocus?: 'merge' | 'docs' | 'custom';
  priority?: number;
  maxSlots?: number;
}

export interface AgentPoolConfig {
  name: string;
  description?: string;
  maxSize: number;
  agentTypes: PoolAgentTypeConfig[];
  enabled: boolean;
  tags?: string[];
}

export interface AgentPoolStatus {
  activeCount: number;
  availableSlots: number;
  activeByType: Record<string, number>;
  activeAgentIds: string[];
  lastUpdatedAt: string;
}

export interface AgentPool {
  id: string;
  config: AgentPoolConfig;
  status: AgentPoolStatus;
  createdAt: string;
  createdBy: string;
}

export interface PoolsListResponse {
  pools: AgentPool[];
}

export interface PoolResponse {
  pool: AgentPool;
}

export interface CreatePoolInput {
  name: string;
  description?: string;
  maxSize: number;
  agentTypes?: PoolAgentTypeConfig[];
  enabled?: boolean;
  tags?: string[];
}

export interface UpdatePoolInput {
  description?: string;
  maxSize?: number;
  agentTypes?: PoolAgentTypeConfig[];
  enabled?: boolean;
  tags?: string[];
}

// ============================================================================
// Query Keys
// ============================================================================

export const POOLS_KEY = ['pools'];
export const poolKey = (id: string) => ['pools', id];

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function fetchPools(filter?: { enabled?: boolean; available?: boolean; tag?: string }): Promise<AgentPool[]> {
  const params = new URLSearchParams();
  if (filter?.enabled !== undefined) params.set('enabled', String(filter.enabled));
  if (filter?.available !== undefined) params.set('available', String(filter.available));
  if (filter?.tag) params.set('tag', filter.tag);

  const url = params.toString() ? `${API_BASE}/api/pools?${params}` : `${API_BASE}/api/pools`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch pools');
  const data = (await res.json()) as PoolsListResponse;
  return data.pools;
}

async function fetchPool(id: string): Promise<AgentPool> {
  const res = await fetch(`${API_BASE}/api/pools/${id}`);
  if (!res.ok) throw new Error('Failed to fetch pool');
  const data = (await res.json()) as PoolResponse;
  return data.pool;
}

async function createPool(input: CreatePoolInput): Promise<AgentPool> {
  const res = await fetch(`${API_BASE}/api/pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message ?? 'Failed to create pool');
  }
  const data = (await res.json()) as PoolResponse;
  return data.pool;
}

async function updatePool(id: string, input: UpdatePoolInput): Promise<AgentPool> {
  const res = await fetch(`${API_BASE}/api/pools/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message ?? 'Failed to update pool');
  }
  const data = (await res.json()) as PoolResponse;
  return data.pool;
}

async function deletePool(id: string, force?: boolean): Promise<void> {
  const url = force ? `${API_BASE}/api/pools/${id}?force=true` : `${API_BASE}/api/pools/${id}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message ?? 'Failed to delete pool');
  }
}

async function refreshPoolStatuses(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pools/refresh`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to refresh pool statuses');
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to fetch all pools
 */
export function usePools(filter?: { enabled?: boolean; available?: boolean; tag?: string }) {
  return useQuery({
    queryKey: [...POOLS_KEY, filter],
    queryFn: () => fetchPools(filter),
    refetchInterval: 10000, // Refresh every 10 seconds to get updated status
  });
}

/**
 * Hook to fetch a single pool
 */
export function usePool(id: string | undefined) {
  return useQuery({
    queryKey: poolKey(id ?? ''),
    queryFn: () => fetchPool(id!),
    enabled: !!id,
    refetchInterval: 5000, // Refresh every 5 seconds for status updates
  });
}

/**
 * Hook to create a pool
 */
export function useCreatePool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POOLS_KEY });
    },
  });
}

/**
 * Hook to update a pool
 */
export function useUpdatePool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePoolInput & { id: string }) => updatePool(id, input),
    onSuccess: (pool) => {
      queryClient.invalidateQueries({ queryKey: POOLS_KEY });
      queryClient.invalidateQueries({ queryKey: poolKey(pool.id) });
    },
  });
}

/**
 * Hook to delete a pool
 */
export function useDeletePool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => deletePool(id, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POOLS_KEY });
    },
  });
}

/**
 * Hook to refresh all pool statuses
 */
export function useRefreshPoolStatuses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refreshPoolStatuses,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POOLS_KEY });
    },
  });
}
