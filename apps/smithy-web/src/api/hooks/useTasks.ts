/**
 * React Query hooks for task data
 *
 * Provides hooks for fetching and mutating task data from the orchestrator API.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TasksResponse,
  TaskResponse,
  TaskFilter,
  TaskStatus,
  Priority,
  TaskTypeValue,
  EntityId,
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
 * Hook to fetch all tasks with optional filters
 */
export function useTasks(filter?: TaskFilter) {
  const params = new URLSearchParams();
  if (filter?.status && filter.status !== 'all') params.set('status', filter.status);
  if (filter?.assignment && filter.assignment !== 'all') params.set('assignment', filter.assignment);
  if (filter?.assignee) params.set('assignee', filter.assignee);
  if (filter?.priority) params.set('priority', String(filter.priority));
  if (filter?.taskType) params.set('taskType', filter.taskType);
  if (filter?.ephemeral !== undefined) params.set('ephemeral', String(filter.ephemeral));
  if (filter?.page) params.set('page', String(filter.page));
  if (filter?.limit) params.set('limit', String(filter.limit));

  const queryString = params.toString();
  const path = queryString ? `/tasks?${queryString}` : '/tasks';

  return useQuery<TasksResponse, Error>({
    queryKey: ['tasks', filter],
    queryFn: () => fetchApi<TasksResponse>(path),
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

/**
 * Hook to fetch a single task by ID
 */
export function useTask(taskId: string | undefined) {
  return useQuery<TaskResponse, Error>({
    queryKey: ['task', taskId],
    queryFn: () => fetchApi<TaskResponse>(`/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

// ============================================================================
// Derived Data Hooks
// ============================================================================

/**
 * Hook to get tasks grouped by status for kanban view
 */
export function useTasksByStatus() {
  const { data, isLoading, error, refetch } = useTasks();

  const tasks = data?.tasks ?? [];

  // Group tasks by status
  // Note: 'assigned' includes all tasks with an assignee (including in_progress and review)
  // while in_progress and awaitingMerge are more specific status-based views
  const backlog = tasks.filter(t => t.status === 'backlog');
  const unassigned = tasks.filter(t => !t.assignee && (t.status === 'open' || t.status === 'blocked' || t.status === 'deferred'));
  // Assigned includes all non-backlog tasks with an assignee (regardless of status)
  // This includes open, blocked, deferred, in_progress, and review tasks
  const assigned = tasks.filter(t => t.assignee && t.status !== 'backlog' && t.status !== 'closed' && t.status !== 'tombstone');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const blocked = tasks.filter(t => t.status === 'blocked');
  const closed = tasks.filter(t => t.status === 'closed');
  // Include tasks with 'review' status OR closed tasks with a pending merge status
  const awaitingMerge = tasks.filter(t => {
    // Tasks with 'review' status are always awaiting merge
    if (t.status === 'review') return true;
    // Closed tasks with a non-merged status are also awaiting merge
    const meta = t.metadata?.orchestrator;
    return t.status === 'closed' && meta?.mergeStatus && meta.mergeStatus !== 'merged';
  });
  const merged = tasks.filter(t => {
    const meta = t.metadata?.orchestrator;
    return t.status === 'closed' && meta?.mergeStatus === 'merged';
  });

  return {
    backlog,
    unassigned,
    assigned,
    inProgress,
    blocked,
    closed,
    awaitingMerge,
    merged,
    allTasks: tasks,
    total: data?.total ?? tasks.length,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get task counts by status for tab badges
 */
export function useTaskCounts() {
  const { allTasks, isLoading, error } = useTasksByStatus();

  const counts = {
    all: allTasks.length,
    unassigned: allTasks.filter(t => !t.assignee && (t.status === 'open' || t.status === 'blocked' || t.status === 'deferred')).length,
    assigned: allTasks.filter(t => t.assignee && t.status !== 'backlog' && t.status !== 'closed' && t.status !== 'tombstone').length,
    inProgress: allTasks.filter(t => t.status === 'in_progress').length,
    blocked: allTasks.filter(t => t.status === 'blocked').length,
    closed: allTasks.filter(t => t.status === 'closed').length,
    awaitingMerge: allTasks.filter(t => {
      // Tasks with 'review' status are always awaiting merge
      if (t.status === 'review') return true;
      // Closed tasks with a non-merged status are also awaiting merge
      const meta = t.metadata?.orchestrator;
      return t.status === 'closed' && meta?.mergeStatus && meta.mergeStatus !== 'merged';
    }).length,
  };

  return { counts, isLoading, error };
}

// ============================================================================
// Mutation Hooks
// ============================================================================

interface CreateTaskInput {
  title: string;
  createdBy?: EntityId;
  description?: string;
  acceptanceCriteria?: string;
  priority?: Priority;
  complexity?: number;
  taskType?: TaskTypeValue;
  assignee?: EntityId;
  owner?: EntityId;
  deadline?: string;
  scheduledFor?: string;
  tags?: string[];
  status?: TaskStatus;
}

/**
 * Hook to create a new task
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, CreateTaskInput>({
    mutationFn: async (input: CreateTaskInput) => {
      return fetchApi<TaskResponse>('/tasks', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  complexity?: number;
  assignee?: EntityId | null;
  owner?: EntityId | null;
  deadline?: string | null;
  closeReason?: string;
  tags?: string[];
}

export interface UpdateMergeStatusInput {
  taskId: string;
  mergeStatus: 'pending' | 'testing' | 'merging' | 'merged' | 'conflict' | 'test_failed' | 'failed' | 'not_applicable';
}

/**
 * Hook to update a task
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, UpdateTaskInput>({
    mutationFn: async ({ taskId, ...updates }) => {
      return fetchApi<TaskResponse>(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * Hook to assign a task to an agent
 */
export function useAssignTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, { taskId: string; agentId: EntityId | null }>({
    mutationFn: async ({ taskId, agentId }) => {
      return fetchApi<TaskResponse>(`/tasks/${taskId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ agentId }),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * Hook to start working on a task (set to in_progress)
 */
export function useStartTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, { taskId: string }>({
    mutationFn: async ({ taskId }) => {
      return fetchApi<TaskResponse>(`/tasks/${taskId}/start`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * Hook to complete a task (set to closed)
 */
export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, { taskId: string; closeReason?: string }>({
    mutationFn: async ({ taskId, closeReason }) => {
      return fetchApi<TaskResponse>(`/tasks/${taskId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ closeReason }),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * Hook to reopen a closed task
 */
export function useReopenTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, { taskId: string; message?: string }>({
    mutationFn: async ({ taskId, message }) => {
      return fetchApi<TaskResponse>(`/tasks/${taskId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * Hook to reset a task to open status, clearing assignee and all work-in-progress data
 */
export function useResetTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, { taskId: string }>({
    mutationFn: async ({ taskId }) => {
      return fetchApi<TaskResponse>(`/tasks/${taskId}/reset`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * Hook to update merge status
 */
export function useUpdateMergeStatus() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, UpdateMergeStatusInput>({
    mutationFn: async ({ taskId, mergeStatus }) => {
      return fetchApi<TaskResponse>(`/tasks/${taskId}/merge-status`, {
        method: 'PATCH',
        body: JSON.stringify({ mergeStatus }),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });
}

/**
 * Hook to delete a task (soft-delete)
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { taskId: string; reason?: string }>({
    mutationFn: async ({ taskId, reason }) => {
      return fetchApi(`/tasks/${taskId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to bulk delete tasks (soft-delete)
 */
export function useBulkDeleteTasks() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; results: { id: string; success: boolean; error?: string }[] },
    Error,
    { ids: string[] }
  >({
    mutationFn: async ({ ids }) => {
      return fetchApi('/tasks/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ============================================================================
// Attachment Hooks
// ============================================================================

export interface AttachedDocument {
  id: string;
  type: 'document';
  title?: string;
  content?: string;
  contentType: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook to fetch task attachments
 */
export function useTaskAttachments(taskId: string | undefined) {
  return useQuery<AttachedDocument[], Error>({
    queryKey: ['tasks', taskId, 'attachments'],
    queryFn: () => fetchApi<AttachedDocument[]>(`/tasks/${taskId}/attachments`),
    enabled: !!taskId,
  });
}

/**
 * Hook to add attachment to a task
 */
export function useAddAttachment() {
  const queryClient = useQueryClient();

  return useMutation<AttachedDocument, Error, { taskId: string; documentId: string }>({
    mutationFn: async ({ taskId, documentId }) => {
      return fetchApi<AttachedDocument>(`/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({ documentId }),
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'attachments'] });
    },
  });
}

/**
 * Hook to remove attachment from a task
 */
export function useRemoveAttachment() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { taskId: string; documentId: string }>({
    mutationFn: async ({ taskId, documentId }) => {
      return fetchApi(`/tasks/${taskId}/attachments/${documentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'attachments'] });
    },
  });
}

interface DocumentsResponse {
  items: AttachedDocument[];
  total: number;
}

/**
 * Hook to fetch all documents for the attachment picker
 */
export function useDocumentsForAttachment(searchQuery?: string) {
  return useQuery<AttachedDocument[], Error>({
    queryKey: ['documents', 'search', searchQuery],
    queryFn: async () => {
      const data = await fetchApi<DocumentsResponse>('/documents');
      const docs = data.items || [];
      // Client-side filtering by search query
      if (searchQuery?.trim()) {
        const query = searchQuery.toLowerCase();
        return docs.filter(doc =>
          (doc.title?.toLowerCase().includes(query)) ||
          doc.id.toLowerCase().includes(query)
        );
      }
      return docs;
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get display name for task status
 */
export function getStatusDisplayName(status: TaskStatus): string {
  switch (status) {
    case 'open': return 'Open';
    case 'in_progress': return 'In Progress';
    case 'blocked': return 'Blocked';
    case 'deferred': return 'Deferred';
    case 'closed': return 'Closed';
    case 'tombstone': return 'Deleted';
    default: return status;
  }
}

/**
 * Get display name for priority
 */
export function getPriorityDisplayName(priority: Priority): string {
  switch (priority) {
    case 1: return 'Critical';
    case 2: return 'High';
    case 3: return 'Medium';
    case 4: return 'Low';
    case 5: return 'Minimal';
    default: return `P${priority}`;
  }
}

/**
 * Get display name for task type
 */
export function getTaskTypeDisplayName(taskType: TaskTypeValue): string {
  switch (taskType) {
    case 'bug': return 'Bug';
    case 'feature': return 'Feature';
    case 'task': return 'Task';
    case 'chore': return 'Chore';
    default: return taskType;
  }
}

/**
 * Get status color class
 */
export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'open': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 'in_progress': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    case 'blocked': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 'deferred': return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    case 'closed': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    case 'tombstone': return 'text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-900/30';
    default: return 'text-gray-600 bg-gray-100';
  }
}

/**
 * Get priority color class
 */
export function getPriorityColor(priority: Priority): string {
  switch (priority) {
    case 1: return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 2: return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30';
    case 3: return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    case 4: return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 5: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    default: return 'text-gray-600 bg-gray-100';
  }
}
