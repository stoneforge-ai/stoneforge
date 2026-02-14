/**
 * Task mutation hooks
 *
 * React Query hooks for task operations including bulk updates, deletes,
 * and fetching related data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Entity } from '../../lib/task-constants';

/**
 * Hook to fetch ready task IDs for filtering (TB79)
 * Returns a Set of task IDs that are currently "ready" (unblocked)
 */
export function useReadyTaskIds() {
  return useQuery<Set<string>>({
    queryKey: ['tasks', 'ready', 'ids'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      const tasks: { id: string }[] = await response.json();
      return new Set(tasks.map((t) => t.id));
    },
  });
}

/**
 * Hook to fetch entities for assignee selection
 */
export function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook for bulk updating tasks
 */
export function useBulkUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, unknown> }) => {
      const response = await fetch('/api/tasks/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update tasks');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
    },
  });
}

/**
 * Hook for bulk deleting tasks
 */
export function useBulkDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fetch('/api/tasks/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete tasks');
      }

      return response.json();
    },
    onSuccess: (_data, ids) => {
      // Remove deleted tasks from cache
      for (const id of ids) {
        queryClient.removeQueries({ queryKey: ['tasks', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
