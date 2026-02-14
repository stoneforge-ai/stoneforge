/**
 * React Query hooks for merge request data
 *
 * Provides hooks for fetching and managing merge requests from completed tasks.
 * Merge requests are tasks that have been completed by agents and are awaiting merge.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Task,
  TasksResponse,
  MergeStatus,
  EntityId,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export type MergeRequestFilterStatus = 'all' | 'needs_review' | 'testing' | 'conflicts' | 'merged';

export interface MergeRequestFilter {
  status?: MergeRequestFilterStatus;
  showMerged?: boolean;
  assignee?: EntityId;
}

export interface MergeRequestCounts {
  all: number;
  needsReview: number;
  testing: number;
  conflicts: number;
  merged: number;
}

export interface MergeActionResult {
  success: boolean;
  message?: string;
  taskId: string;
}

export interface TestRunResult {
  success: boolean;
  taskId: string;
  testsPassed?: number;
  testsFailed?: number;
  testsTotal?: number;
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
// Helper Functions
// ============================================================================

/**
 * Filter function to get tasks that are merge requests.
 * Active merge requests have status 'review' (awaiting merge).
 * Merged requests have status 'closed' (merge complete).
 */
function isMergeRequest(task: Task): boolean {
  const meta = task.metadata?.orchestrator;
  return (task.status === 'review' || task.status === 'closed') && !!meta?.mergeStatus;
}

/**
 * Check if a merge request matches the filter status
 */
function matchesFilterStatus(task: Task, filterStatus: MergeRequestFilterStatus, showMerged: boolean): boolean {
  const mergeStatus = task.metadata?.orchestrator?.mergeStatus;
  if (!mergeStatus) return false;

  // Don't show merged items unless explicitly requested
  if (mergeStatus === 'merged' && !showMerged) return false;

  switch (filterStatus) {
    case 'all':
      return true;
    case 'needs_review':
      // pending or test_failed need human review
      return mergeStatus === 'pending' || mergeStatus === 'test_failed';
    case 'testing':
      // testing or merging are transient states
      return mergeStatus === 'testing' || mergeStatus === 'merging';
    case 'conflicts':
      return mergeStatus === 'conflict' || mergeStatus === 'failed';
    case 'merged':
      return mergeStatus === 'merged';
    default:
      return true;
  }
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook to fetch all merge requests with optional filters
 */
export function useMergeRequests(filter?: MergeRequestFilter) {
  return useQuery<Task[], Error>({
    queryKey: ['merge-requests', filter],
    queryFn: async () => {
      // Fetch tasks in review status (active merge requests)
      // and closed status (merged requests, shown when showMerged is toggled)
      const [reviewData, closedData] = await Promise.all([
        fetchApi<TasksResponse>('/tasks?status=review'),
        fetchApi<TasksResponse>('/tasks?status=closed'),
      ]);
      const allTasks = [...reviewData.tasks, ...closedData.tasks];
      let mergeRequests = allTasks.filter(isMergeRequest);

      // Apply filter status
      const filterStatus = filter?.status || 'all';
      const showMerged = filter?.showMerged ?? false;
      mergeRequests = mergeRequests.filter(task =>
        matchesFilterStatus(task, filterStatus, showMerged)
      );

      // Apply assignee filter
      if (filter?.assignee) {
        mergeRequests = mergeRequests.filter(task => task.assignee === filter.assignee);
      }

      // Sort by updated date (most recent first)
      mergeRequests.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return mergeRequests;
    },
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

/**
 * Hook to fetch a single merge request (task) by ID
 */
export function useMergeRequest(taskId: string | undefined) {
  return useQuery<Task, Error>({
    queryKey: ['merge-request', taskId],
    queryFn: async () => {
      const data = await fetchApi<{ task: Task }>(`/tasks/${taskId}`);
      return data.task;
    },
    enabled: !!taskId,
  });
}

/**
 * Hook to get merge request counts for filter badges
 */
export function useMergeRequestCounts() {
  const { data: allTasks, isLoading, error } = useQuery<Task[], Error>({
    queryKey: ['merge-requests', 'counts'],
    queryFn: async () => {
      const [reviewData, closedData] = await Promise.all([
        fetchApi<TasksResponse>('/tasks?status=review'),
        fetchApi<TasksResponse>('/tasks?status=closed'),
      ]);
      const allTasks = [...reviewData.tasks, ...closedData.tasks];
      return allTasks.filter(isMergeRequest);
    },
    refetchInterval: 10000,
  });

  const tasks = allTasks ?? [];

  const counts: MergeRequestCounts = {
    all: tasks.filter(t => t.metadata?.orchestrator?.mergeStatus !== 'merged').length,
    needsReview: tasks.filter(t => {
      const status = t.metadata?.orchestrator?.mergeStatus;
      return status === 'pending' || status === 'test_failed';
    }).length,
    testing: tasks.filter(t => {
      const status = t.metadata?.orchestrator?.mergeStatus;
      return status === 'testing' || status === 'merging';
    }).length,
    conflicts: tasks.filter(t => {
      const status = t.metadata?.orchestrator?.mergeStatus;
      return status === 'conflict' || status === 'failed';
    }).length,
    merged: tasks.filter(t => t.metadata?.orchestrator?.mergeStatus === 'merged').length,
  };

  return { counts, isLoading, error };
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to trigger merge action on a task
 */
export function useMergeMutation() {
  const queryClient = useQueryClient();

  return useMutation<MergeActionResult, Error, { taskId: string }>({
    mutationFn: async ({ taskId }) => {
      return fetchApi<MergeActionResult>(`/tasks/${taskId}/merge`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['merge-requests'] });
      queryClient.invalidateQueries({ queryKey: ['merge-request', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to trigger test run on a task
 */
export function useRunTestsMutation() {
  const queryClient = useQueryClient();

  return useMutation<TestRunResult, Error, { taskId: string }>({
    mutationFn: async ({ taskId }) => {
      return fetchApi<TestRunResult>(`/tasks/${taskId}/run-tests`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['merge-requests'] });
      queryClient.invalidateQueries({ queryKey: ['merge-request', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to create a fix task for failed tests or conflicts
 */
export function useCreateFixTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ task: Task }, Error, { taskId: string; reason: string }>({
    mutationFn: async ({ taskId, reason }) => {
      return fetchApi<{ task: Task }>(`/tasks/${taskId}/create-fix-task`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merge-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get display name for merge status
 */
export function getMergeStatusDisplayName(status: MergeStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'testing':
      return 'Running Tests';
    case 'merging':
      return 'Merging';
    case 'merged':
      return 'Merged';
    case 'conflict':
      return 'Conflict';
    case 'test_failed':
      return 'Tests Failed';
    case 'failed':
      return 'Failed';
    case 'not_applicable':
      return 'No Merge Needed';
    default:
      return status;
  }
}

/**
 * Get color classes for merge status
 */
export function getMergeStatusColor(status: MergeStatus): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case 'pending':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-500',
      };
    case 'testing':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-500',
      };
    case 'merging':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-600',
      };
    case 'merged':
      return {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-400',
        border: 'border-green-500',
      };
    case 'conflict':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-500',
      };
    case 'test_failed':
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        text: 'text-orange-700 dark:text-orange-400',
        border: 'border-orange-500',
      };
    case 'failed':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-600',
      };
    case 'not_applicable':
      return {
        bg: 'bg-gray-100 dark:bg-gray-800/50',
        text: 'text-gray-500 dark:text-gray-400',
        border: 'border-gray-400',
      };
    default:
      return {
        bg: 'bg-gray-100 dark:bg-gray-900/30',
        text: 'text-gray-700 dark:text-gray-400',
        border: 'border-gray-500',
      };
  }
}

/**
 * Check if a merge request can be merged
 */
export function canMerge(task: Task): boolean {
  const status = task.metadata?.orchestrator?.mergeStatus;
  return status === 'pending';
}

/**
 * Check if tests can be run on a merge request
 */
export function canRunTests(task: Task): boolean {
  const status = task.metadata?.orchestrator?.mergeStatus;
  return status === 'pending' || status === 'test_failed';
}

/**
 * Check if a fix task can be created
 */
export function canCreateFixTask(task: Task): boolean {
  const status = task.metadata?.orchestrator?.mergeStatus;
  return status === 'conflict' || status === 'test_failed' || status === 'failed';
}

// ============================================================================
// Status Update & Delete Mutations
// ============================================================================

/**
 * Hook to update merge request status
 */
export function useUpdateMergeStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ task: Task }, Error, { taskId: string; mergeStatus: MergeStatus }>({
    mutationFn: async ({ taskId, mergeStatus }) => {
      // Update the task's orchestrator.mergeStatus metadata
      return fetchApi<{ task: Task }>(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          mergeStatus,
        }),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['merge-requests'] });
      queryClient.invalidateQueries({ queryKey: ['merge-request', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to delete a merge request (soft delete)
 */
export function useDeleteMergeRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { taskId: string; reason?: string }>({
    mutationFn: async ({ taskId, reason }) => {
      return fetchApi<{ success: boolean }>(`/tasks/${taskId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merge-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Get available merge status options for status update dropdown
 */
export function getAvailableMergeStatuses(): { value: MergeStatus; label: string }[] {
  return [
    { value: 'pending', label: 'Pending Merge' },
    { value: 'testing', label: 'Testing' },
    { value: 'merging', label: 'Merging' },
    { value: 'merged', label: 'Merged' },
    { value: 'conflict', label: 'Conflict' },
    { value: 'test_failed', label: 'Tests Failed' },
    { value: 'failed', label: 'Merge Failed' },
    { value: 'not_applicable', label: 'No Merge Needed' },
  ];
}
