/**
 * Upfront Data Loading Hooks (TB67)
 *
 * These hooks load all elements on app mount and store them in the cache.
 * Data is considered fresh indefinitely and only updated via WebSocket events.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import type { WebSocketEvent } from '@stoneforge/ui';

// ============================================================================
// Types
// ============================================================================

export interface Element {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface Task extends Element {
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // TB83: Rich task display counts
  _attachmentCount?: number;
  _blocksCount?: number;
  _blockedByCount?: number;
  // Optional description preview (from hydration)
  description?: string;
}

export interface Plan extends Element {
  type: 'plan';
  title: string;
  status: string;
  createdBy: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Workflow extends Element {
  type: 'workflow';
  title: string;
  status: string;
  ephemeral: boolean;
  playbookId?: string;
  createdBy: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Entity extends Element {
  type: 'entity';
  name: string;
  entityType: string;
  active: boolean;
  publicKey?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Document extends Element {
  type: 'document';
  title: string;
  content?: string;
  contentType: string;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Channel extends Element {
  type: 'channel';
  name: string;
  channelType: 'group' | 'direct';
  members: string[];
  createdBy: string;
  permissions: {
    visibility: 'public' | 'private';
    joinPolicy: 'open' | 'invite-only' | 'request';
    modifyMembers: string[];
  };
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Message extends Element {
  type: 'message';
  channel: string;
  sender: string;
  content?: string;
  threadId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Team extends Element {
  type: 'team';
  name: string;
  members: string[];
  createdBy: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Library extends Element {
  type: 'library';
  name: string;
  parentId?: string;
  createdBy: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AllElementsResponse {
  data: {
    task?: { items: Task[]; total: number };
    plan?: { items: Plan[]; total: number };
    workflow?: { items: Workflow[]; total: number };
    entity?: { items: Entity[]; total: number };
    document?: { items: Document[]; total: number };
    channel?: { items: Channel[]; total: number };
    message?: { items: Message[]; total: number };
    team?: { items: Team[]; total: number };
    library?: { items: Library[]; total: number };
  };
  totalElements: number;
  types: string[];
  loadedAt: string;
}

// ============================================================================
// Query Keys
// ============================================================================

export const ALL_ELEMENTS_KEY = ['elements', 'all'] as const;

// Individual element type keys for caching
export const ELEMENT_KEYS = {
  tasks: ['elements', 'tasks'] as const,
  plans: ['elements', 'plans'] as const,
  workflows: ['elements', 'workflows'] as const,
  entities: ['elements', 'entities'] as const,
  documents: ['elements', 'documents'] as const,
  channels: ['elements', 'channels'] as const,
  messages: ['elements', 'messages'] as const,
  teams: ['elements', 'teams'] as const,
  libraries: ['elements', 'libraries'] as const,
} as const;

// ============================================================================
// Fetch Function
// ============================================================================

async function fetchAllElements(): Promise<AllElementsResponse> {
  // Include task counts for TB83 Rich Task Display
  const response = await fetch('/api/elements/all?includeTaskCounts=true');
  if (!response.ok) {
    throw new Error(`Failed to fetch all elements: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================================
// Main Hook: useAllElements
// ============================================================================

/**
 * Main hook to load all elements on app mount.
 * Returns loading state and totals for progress indicator.
 */
export function useAllElements() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ALL_ELEMENTS_KEY,
    queryFn: fetchAllElements,
    staleTime: Infinity, // Never consider stale - WebSocket handles updates
    gcTime: Infinity, // Never garbage collect
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on mount
    refetchOnReconnect: false, // Don't refetch on reconnect
  });

  // Populate individual caches when data loads
  const data = query.data;
  useEffect(() => {
    if (!data) return;
    // Set individual type caches
    if (data.data.task) {
      queryClient.setQueryData(ELEMENT_KEYS.tasks, data.data.task.items);
    }
    if (data.data.plan) {
      queryClient.setQueryData(ELEMENT_KEYS.plans, data.data.plan.items);
    }
    if (data.data.workflow) {
      queryClient.setQueryData(ELEMENT_KEYS.workflows, data.data.workflow.items);
    }
    if (data.data.entity) {
      queryClient.setQueryData(ELEMENT_KEYS.entities, data.data.entity.items);
    }
    if (data.data.document) {
      queryClient.setQueryData(ELEMENT_KEYS.documents, data.data.document.items);
    }
    if (data.data.channel) {
      queryClient.setQueryData(ELEMENT_KEYS.channels, data.data.channel.items);
    }
    if (data.data.message) {
      queryClient.setQueryData(ELEMENT_KEYS.messages, data.data.message.items);
    }
    if (data.data.team) {
      queryClient.setQueryData(ELEMENT_KEYS.teams, data.data.team.items);
    }
    if (data.data.library) {
      queryClient.setQueryData(ELEMENT_KEYS.libraries, data.data.library.items);
    }
  }, [data, queryClient]);

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    data: query.data,
    totalElements: data?.totalElements ?? 0,
    loadedAt: data?.loadedAt,
    refetch: query.refetch,
  };
}

// ============================================================================
// Type-Specific Hooks
// ============================================================================

/**
 * Get all tasks from cache (loaded upfront)
 */
export function useAllTasks() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.tasks,
    queryFn: async () => {
      // Try to get from the all elements query first
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.task) {
        return allData.data.task.items;
      }
      // Fallback to fetching just tasks
      const response = await fetch('/api/tasks?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const result = await response.json();
      return result.items as Task[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all plans from cache (loaded upfront)
 */
export function useAllPlans() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.plans,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.plan) {
        return allData.data.plan.items;
      }
      const response = await fetch('/api/plans?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch plans');
      const result = await response.json();
      return result.items as Plan[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all workflows from cache (loaded upfront)
 */
export function useAllWorkflows() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.workflows,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.workflow) {
        return allData.data.workflow.items;
      }
      const response = await fetch('/api/workflows?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch workflows');
      const result = await response.json();
      return result.items as Workflow[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all entities from cache (loaded upfront)
 */
export function useAllEntities() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.entities,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.entity) {
        return allData.data.entity.items;
      }
      const response = await fetch('/api/entities?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const result = await response.json();
      return result.items as Entity[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all documents from cache (loaded upfront)
 */
export function useAllDocuments() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.documents,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.document) {
        return allData.data.document.items;
      }
      const response = await fetch('/api/documents?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch documents');
      const result = await response.json();
      return result.items as Document[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all channels from cache (loaded upfront)
 */
export function useAllChannels() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.channels,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.channel) {
        return allData.data.channel.items;
      }
      const response = await fetch('/api/channels?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch channels');
      const result = await response.json();
      return result.items as Channel[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all messages from cache (loaded upfront)
 */
export function useAllMessages() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.messages,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.message) {
        return allData.data.message.items;
      }
      const response = await fetch('/api/messages?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch messages');
      const result = await response.json();
      return result.items as Message[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all teams from cache (loaded upfront)
 */
export function useAllTeams() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.teams,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.team) {
        return allData.data.team.items;
      }
      const response = await fetch('/api/teams?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch teams');
      const result = await response.json();
      return result.items as Team[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Get all libraries from cache (loaded upfront)
 */
export function useAllLibraries() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ELEMENT_KEYS.libraries,
    queryFn: async () => {
      const allData = queryClient.getQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY);
      if (allData?.data.library) {
        return allData.data.library.items;
      }
      const response = await fetch('/api/libraries?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch libraries');
      const result = await response.json();
      return result.items as Library[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

// ============================================================================
// Cache Update Utilities
// ============================================================================

type ElementTypeMap = {
  task: Task;
  plan: Plan;
  workflow: Workflow;
  entity: Entity;
  document: Document;
  channel: Channel;
  message: Message;
  team: Team;
  library: Library;
};

type ElementTypeName = keyof ElementTypeMap;

/**
 * Get the query key for an element type
 */
function getQueryKeyForType(type: ElementTypeName): readonly string[] {
  const typeKeyMap: Record<ElementTypeName, readonly string[]> = {
    task: ELEMENT_KEYS.tasks,
    plan: ELEMENT_KEYS.plans,
    workflow: ELEMENT_KEYS.workflows,
    entity: ELEMENT_KEYS.entities,
    document: ELEMENT_KEYS.documents,
    channel: ELEMENT_KEYS.channels,
    message: ELEMENT_KEYS.messages,
    team: ELEMENT_KEYS.teams,
    library: ELEMENT_KEYS.libraries,
  };
  return typeKeyMap[type];
}

/**
 * Update an element in the cache in-place
 */
export function updateElementInCache<T extends Element>(
  queryClient: QueryClient,
  type: ElementTypeName,
  updatedElement: T
): void {
  const queryKey = getQueryKeyForType(type);

  queryClient.setQueryData<T[]>(queryKey, (old) => {
    if (!old) return [updatedElement];

    const index = old.findIndex((el) => el.id === updatedElement.id);
    if (index >= 0) {
      // Update existing
      const newData = [...old];
      newData[index] = updatedElement;
      return newData;
    } else {
      // Add new element
      return [updatedElement, ...old];
    }
  });
}

/**
 * Remove an element from the cache
 */
export function removeElementFromCache(
  queryClient: QueryClient,
  type: ElementTypeName,
  elementId: string
): void {
  const queryKey = getQueryKeyForType(type);

  // Update the individual type cache
  queryClient.setQueryData<Element[]>(queryKey, (old) => {
    if (!old) return [];
    return old.filter((el) => el.id !== elementId);
  });

  // Also update the ALL_ELEMENTS_KEY cache to keep it in sync
  // This prevents useAllElements from re-populating the individual cache with stale data
  queryClient.setQueryData<AllElementsResponse>(ALL_ELEMENTS_KEY, (old) => {
    if (!old) return old;

    const typeKey = type as keyof AllElementsResponse['data'];
    const typeData = old.data[typeKey];
    if (!typeData) return old;

    return {
      ...old,
      data: {
        ...old.data,
        [typeKey]: {
          ...typeData,
          items: typeData.items.filter((el) => el.id !== elementId),
          total: typeData.total - 1,
        },
      },
      totalElements: old.totalElements - 1,
    };
  });
}

/**
 * Handle a WebSocket event by updating the cache in-place
 * Returns true if the event was handled, false otherwise
 */
export function handleWebSocketEventInPlace(
  queryClient: QueryClient,
  event: WebSocketEvent
): boolean {
  const type = event.elementType as ElementTypeName;

  // Check if this is a type we track
  const validTypes: ElementTypeName[] = ['task', 'plan', 'workflow', 'entity', 'document', 'channel', 'message', 'team', 'library'];
  if (!validTypes.includes(type)) {
    return false;
  }

  const eventType = event.eventType;

  if (eventType === 'deleted' || eventType === 'soft-deleted') {
    // Remove from cache
    removeElementFromCache(queryClient, type, event.elementId);
    return true;
  }

  if (event.newValue && (eventType === 'created' || eventType === 'updated' || eventType.includes('status') || eventType.includes('assigned'))) {
    // Update/add in cache
    updateElementInCache(queryClient, type, event.newValue as Element);
    return true;
  }

  // For other events, let the default invalidation happen
  return false;
}

// ============================================================================
// Hook for In-Place Cache Updates
// ============================================================================

/**
 * Hook that returns a handler for processing WebSocket events in-place
 */
export function useInPlaceCacheUpdates() {
  const queryClient = useQueryClient();

  return useCallback(
    (event: WebSocketEvent) => {
      return handleWebSocketEventInPlace(queryClient, event);
    },
    [queryClient]
  );
}
