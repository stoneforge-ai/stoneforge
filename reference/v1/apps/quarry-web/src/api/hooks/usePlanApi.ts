/**
 * Plan API Hooks - React Query hooks for plan operations
 *
 * Centralized API hooks for fetching and mutating plan data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HydratedPlan, PlanProgress, PlanType, TaskType } from '../../routes/plans/types';

/**
 * Hook to fetch plans with optional status filter and progress hydration
 */
export function usePlans(status?: string) {
  return useQuery<HydratedPlan[]>({
    queryKey: ['plans', status, 'with-progress'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('hydrate.progress', 'true');
      if (status) {
        params.set('status', status);
      }
      const response = await fetch(`/api/plans?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }
      return response.json();
    },
  });
}

/**
 * Hook to fetch a single plan by ID with progress hydration
 */
export function usePlan(planId: string | null) {
  return useQuery<HydratedPlan>({
    queryKey: ['plans', planId],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}?hydrate.progress=true`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

/**
 * Hook to fetch tasks belonging to a plan
 */
export function usePlanTasks(planId: string | null) {
  return useQuery<TaskType[]>({
    queryKey: ['plans', planId, 'tasks'],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}/tasks`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan tasks');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

/**
 * Hook to fetch progress statistics for a plan
 */
export function usePlanProgress(planId: string | null) {
  return useQuery<PlanProgress>({
    queryKey: ['plans', planId, 'progress'],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}/progress`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan progress');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

/**
 * Hook to update a plan
 */
export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, updates }: { planId: string; updates: Partial<PlanType> }) => {
      const response = await fetch(`/api/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update plan');
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId] });
    },
  });
}

/**
 * Hook to add a task to a plan
 */
export function useAddTaskToPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, taskId }: { planId: string; taskId: string }) => {
      const response = await fetch(`/api/plans/${planId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to add task to plan');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'progress'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId] });
    },
  });
}

/**
 * Hook to remove a task from a plan
 */
export function useRemoveTaskFromPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, taskId }: { planId: string; taskId: string }) => {
      const response = await fetch(`/api/plans/${planId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove task from plan');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'progress'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId] });
    },
  });
}

/**
 * Hook to fetch tasks not currently in a plan (for task picker)
 */
export function useAvailableTasks(planId: string | null, searchQuery: string) {
  return useQuery<TaskType[]>({
    queryKey: ['tasks', 'available', planId, searchQuery],
    queryFn: async () => {
      if (!planId) return [];

      // Get all tasks not in this plan
      const tasksResponse = await fetch('/api/tasks');
      if (!tasksResponse.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const allTasks = await tasksResponse.json() as TaskType[];

      // Get tasks already in the plan
      const planTasksResponse = await fetch(`/api/plans/${planId}/tasks`);
      if (!planTasksResponse.ok) {
        throw new Error('Failed to fetch plan tasks');
      }
      const planTasks = await planTasksResponse.json() as TaskType[];
      const planTaskIds = new Set(planTasks.map(t => t.id));

      // Filter to only tasks not in plan
      let available = allTasks.filter(t => !planTaskIds.has(t.id));

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        available = available.filter(t =>
          t.title.toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query)
        );
      }

      return available.slice(0, 50); // Limit results
    },
    enabled: !!planId,
  });
}
