/**
 * React Query hooks for task dependencies
 *
 * Provides hooks for fetching and mutating task dependency information.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskStatus, Priority } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface DependencyTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
}

export interface DependencyInfo {
  dependencyType: string;
  task: DependencyTask;
}

export interface DependencyTasksResponse {
  blockedBy: DependencyInfo[];
  blocks: DependencyInfo[];
  progress: {
    resolved: number;
    total: number;
  };
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
// Hook
// ============================================================================

/**
 * Hook to fetch task dependencies (blocked by and blocks)
 */
export function useTaskDependencies(taskId: string | undefined) {
  return useQuery<DependencyTasksResponse, Error>({
    queryKey: ['tasks', taskId, 'dependency-tasks'],
    queryFn: () => fetchApi<DependencyTasksResponse>(`/tasks/${taskId}/dependency-tasks`),
    enabled: !!taskId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

interface AddDependencyInput {
  taskId: string;
  blockerId: string;
  type?: 'blocks' | 'parent-child' | 'awaits';
}

interface AddDependencyResponse {
  success: boolean;
  dependency: {
    blockedId: string;
    blockerId: string;
    type: string;
  };
}

/**
 * Hook to add a blocking dependency to a task
 */
export function useAddDependency() {
  const queryClient = useQueryClient();

  return useMutation<AddDependencyResponse, Error, AddDependencyInput>({
    mutationFn: async ({ taskId, blockerId, type }) => {
      return fetchApi<AddDependencyResponse>(`/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ blockerId, type }),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'dependency-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

interface RemoveDependencyInput {
  taskId: string;
  blockerId: string;
}

interface RemoveDependencyResponse {
  success: boolean;
  taskId: string;
  blockerId: string;
}

/**
 * Hook to remove a blocking dependency from a task
 */
export function useRemoveDependency() {
  const queryClient = useQueryClient();

  return useMutation<RemoveDependencyResponse, Error, RemoveDependencyInput>({
    mutationFn: async ({ taskId, blockerId }) => {
      return fetchApi<RemoveDependencyResponse>(`/tasks/${taskId}/dependencies/${blockerId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'dependency-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
