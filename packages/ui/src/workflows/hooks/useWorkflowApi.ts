/**
 * @stoneforge/ui Workflows API Hooks
 *
 * React Query hooks for workflow and playbook data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  WorkflowStatus,
  WorkflowFilter,
  WorkflowsResponse,
  WorkflowResponse,
  WorkflowTasksResponse,
  WorkflowProgress,
  PlaybookFilter,
  PlaybooksResponse,
  PlaybookResponse,
  VariableType,
  TaskTypeValue,
  Priority,
  Complexity,
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
// Workflow Query Hooks
// ============================================================================

/**
 * Hook to fetch all workflows with optional filters
 */
export function useWorkflows(filter?: WorkflowFilter) {
  const params = new URLSearchParams();
  if (filter?.status && filter.status !== 'all') params.set('status', filter.status);
  if (filter?.playbookId) params.set('playbookId', filter.playbookId);
  if (filter?.ephemeral !== undefined) params.set('ephemeral', String(filter.ephemeral));
  if (filter?.limit) params.set('limit', String(filter.limit));

  const queryString = params.toString();
  const path = queryString ? `/workflows?${queryString}` : '/workflows';

  return useQuery<WorkflowsResponse, Error>({
    queryKey: ['workflows', filter],
    queryFn: () => fetchApi<WorkflowsResponse>(path),
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

/**
 * Hook to fetch a single workflow by ID
 */
export function useWorkflow(workflowId: string | undefined | null) {
  return useQuery<WorkflowResponse, Error>({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchApi<WorkflowResponse>(`/workflows/${workflowId}`),
    enabled: !!workflowId,
  });
}

/**
 * Hook to fetch tasks belonging to a workflow with progress metrics
 */
export function useWorkflowTasks(workflowId: string | undefined | null) {
  return useQuery<WorkflowTasksResponse, Error>({
    queryKey: ['workflow-tasks', workflowId],
    queryFn: () => fetchApi<WorkflowTasksResponse>(`/workflows/${workflowId}/tasks`),
    enabled: !!workflowId,
    refetchInterval: 5000, // Poll every 5 seconds for real-time progress updates
  });
}

/**
 * Hook to fetch workflow progress metrics
 */
export function useWorkflowProgress(workflowId: string | undefined | null) {
  return useQuery<WorkflowProgress, Error>({
    queryKey: ['workflow-progress', workflowId],
    queryFn: () => fetchApi<WorkflowProgress>(`/workflows/${workflowId}/progress`),
    enabled: !!workflowId,
    refetchInterval: 5000,
  });
}

/**
 * Hook to get workflow detail with tasks and progress (combined)
 */
export function useWorkflowDetail(workflowId: string | undefined | null) {
  const workflowQuery = useWorkflow(workflowId);
  const tasksQuery = useWorkflowTasks(workflowId);

  return {
    workflow: workflowQuery.data?.workflow,
    tasks: tasksQuery.data?.tasks ?? [],
    progress: tasksQuery.data?.progress ?? {
      total: 0,
      completed: 0,
      inProgress: 0,
      blocked: 0,
      open: 0,
      percentage: 0,
    },
    dependencies: tasksQuery.data?.dependencies ?? [],
    isLoading: workflowQuery.isLoading || tasksQuery.isLoading,
    error: workflowQuery.error || tasksQuery.error,
    refetch: async () => {
      await workflowQuery.refetch();
      await tasksQuery.refetch();
    },
  };
}

/**
 * Hook to get workflows grouped by status
 */
export function useWorkflowsByStatus() {
  const { data, isLoading, error, refetch } = useWorkflows();

  const workflows = data?.workflows ?? [];

  const pending = workflows.filter(w => w.status === 'pending');
  const running = workflows.filter(w => w.status === 'running');
  const completed = workflows.filter(w => w.status === 'completed');
  const failed = workflows.filter(w => w.status === 'failed');
  const cancelled = workflows.filter(w => w.status === 'cancelled');
  const active = workflows.filter(w => w.status === 'pending' || w.status === 'running');
  const terminal = workflows.filter(w => ['completed', 'failed', 'cancelled'].includes(w.status));

  return {
    pending,
    running,
    completed,
    failed,
    cancelled,
    active,
    terminal,
    allWorkflows: workflows,
    total: data?.total ?? workflows.length,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get workflow counts by status
 */
export function useWorkflowCounts() {
  const { allWorkflows, isLoading, error } = useWorkflowsByStatus();

  const counts = {
    all: allWorkflows.length,
    pending: allWorkflows.filter(w => w.status === 'pending').length,
    running: allWorkflows.filter(w => w.status === 'running').length,
    completed: allWorkflows.filter(w => w.status === 'completed').length,
    failed: allWorkflows.filter(w => w.status === 'failed').length,
    cancelled: allWorkflows.filter(w => w.status === 'cancelled').length,
    active: allWorkflows.filter(w => w.status === 'pending' || w.status === 'running').length,
    terminal: allWorkflows.filter(w => ['completed', 'failed', 'cancelled'].includes(w.status)).length,
  };

  return { counts, isLoading, error };
}

// ============================================================================
// Workflow Mutation Hooks
// ============================================================================

interface CreateWorkflowInput {
  title: string;
  descriptionRef?: string;
  playbookId?: string;
  ephemeral?: boolean;
  variables?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Hook to create a new workflow
 */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, CreateWorkflowInput>({
    mutationFn: async (input: CreateWorkflowInput) => {
      return fetchApi<WorkflowResponse>('/workflows', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

interface UpdateWorkflowInput {
  workflowId: string;
  status?: WorkflowStatus;
  failureReason?: string;
  cancelReason?: string;
}

/**
 * Hook to update a workflow's status
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, UpdateWorkflowInput>({
    mutationFn: async ({ workflowId, ...updates }) => {
      return fetchApi<WorkflowResponse>(`/workflows/${workflowId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

/**
 * Hook to start a workflow (transition to running)
 */
export function useStartWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, { workflowId: string }>({
    mutationFn: async ({ workflowId }) => {
      return fetchApi<WorkflowResponse>(`/workflows/${workflowId}/start`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

/**
 * Hook to cancel a workflow
 */
export function useCancelWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, { workflowId: string; reason?: string }>({
    mutationFn: async ({ workflowId, reason }) => {
      return fetchApi<WorkflowResponse>(`/workflows/${workflowId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

/**
 * Hook to delete a workflow
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { workflowId: string }>({
    mutationFn: async ({ workflowId }) => {
      return fetchApi(`/workflows/${workflowId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

/**
 * Hook to delete an ephemeral workflow and all its tasks
 */
export function useDeleteEphemeralWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { workflowId: string; force?: boolean }>({
    mutationFn: async ({ workflowId, force = false }) => {
      const url = force ? `/workflows/${workflowId}?force=true` : `/workflows/${workflowId}`;
      return fetchApi(url, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

/**
 * Hook to promote an ephemeral workflow (make it durable)
 */
export function usePromoteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, { workflowId: string }>({
    mutationFn: async ({ workflowId }) => {
      return fetchApi<WorkflowResponse>(`/workflows/${workflowId}/promote`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

// ============================================================================
// Playbook Query Hooks
// ============================================================================

/**
 * Hook to fetch all playbooks with optional filters
 */
export function usePlaybooks(filter?: PlaybookFilter) {
  const params = new URLSearchParams();
  if (filter?.name) params.set('name', filter.name);
  if (filter?.limit) params.set('limit', String(filter.limit));

  const queryString = params.toString();
  const path = queryString ? `/playbooks?${queryString}` : '/playbooks';

  return useQuery<PlaybooksResponse, Error>({
    queryKey: ['playbooks', filter],
    queryFn: () => fetchApi<PlaybooksResponse>(path),
    refetchInterval: 30000, // Poll every 30 seconds (playbooks change less frequently)
  });
}

/**
 * Hook to fetch a single playbook by ID
 */
export function usePlaybook(playbookId: string | undefined | null) {
  return useQuery<PlaybookResponse, Error>({
    queryKey: ['playbook', playbookId],
    queryFn: () => fetchApi<PlaybookResponse>(`/playbooks/${playbookId}`),
    enabled: !!playbookId,
  });
}

// ============================================================================
// Playbook Mutation Hooks
// ============================================================================

interface PlaybookStepInput {
  id: string;
  title: string;
  description?: string;
  taskType?: TaskTypeValue;
  priority?: Priority;
  complexity?: Complexity;
  assignee?: string;
  dependsOn?: string[];
  condition?: string;
}

interface PlaybookVariableInput {
  name: string;
  description?: string;
  type: VariableType;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

interface CreatePlaybookInput {
  name: string;
  title: string;
  descriptionRef?: string;
  steps: PlaybookStepInput[];
  variables: PlaybookVariableInput[];
  extends?: string[];
  tags?: string[];
}

/**
 * Hook to create a new playbook
 */
export function useCreatePlaybook() {
  const queryClient = useQueryClient();

  return useMutation<PlaybookResponse, Error, CreatePlaybookInput>({
    mutationFn: async (input: CreatePlaybookInput) => {
      return fetchApi<PlaybookResponse>('/playbooks', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
  });
}

interface UpdatePlaybookInput {
  playbookId: string;
  title?: string;
  steps?: PlaybookStepInput[];
  variables?: PlaybookVariableInput[];
  extends?: string[];
  descriptionRef?: string;
  tags?: string[];
}

/**
 * Hook to update a playbook
 */
export function useUpdatePlaybook() {
  const queryClient = useQueryClient();

  return useMutation<PlaybookResponse, Error, UpdatePlaybookInput>({
    mutationFn: async ({ playbookId, ...updates }) => {
      return fetchApi<PlaybookResponse>(`/playbooks/${playbookId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: (_, { playbookId }) => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['playbook', playbookId] });
    },
  });
}

/**
 * Hook to delete a playbook
 */
export function useDeletePlaybook() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { playbookId: string }>({
    mutationFn: async ({ playbookId }) => {
      return fetchApi(`/playbooks/${playbookId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
  });
}

interface CreateFromPlaybookInput {
  playbookId: string;
  title?: string;
  variables?: Record<string, unknown>;
  ephemeral?: boolean;
}

/**
 * Hook to create a workflow from a playbook template
 */
export function useCreateFromPlaybook() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, CreateFromPlaybookInput>({
    mutationFn: async ({ playbookId, ...input }) => {
      return fetchApi<WorkflowResponse>('/workflows', {
        method: 'POST',
        body: JSON.stringify({ playbookId, ...input }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
