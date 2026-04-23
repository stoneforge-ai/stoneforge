/**
 * React Query hooks for agent inbox data
 *
 * Provides hooks for fetching and managing agent inbox items.
 * Agents are entities, so we use the entity inbox endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export type InboxStatus = 'unread' | 'read' | 'archived';
export type InboxSourceType = 'direct' | 'mention' | 'thread_reply';
export type InboxViewType = 'unread' | 'all' | 'archived';

export interface InboxItem {
  id: string;
  recipientId: string;
  messageId: string;
  channelId: string;
  sourceType: InboxSourceType;
  status: InboxStatus;
  readAt: string | null;
  createdAt: string;
  // Hydrated fields
  message?: {
    id: string;
    sender: string;
    contentRef: string;
    contentPreview?: string;
    fullContent?: string;
    contentType?: string;
    threadId?: string | null;
    createdAt: string;
  } | null;
  channel?: {
    id: string;
    name: string;
    channelType: 'group' | 'direct';
  } | null;
  sender?: {
    id: string;
    name: string;
    entityType: string;
    tags?: string[];
  } | null;
  attachments?: {
    id: string;
    title: string;
    content?: string;
    contentType?: string;
  }[];
  threadParent?: {
    id: string;
    sender?: {
      id: string;
      name: string;
      entityType: string;
    } | null;
    contentPreview: string;
    createdAt: string;
  } | null;
}

export interface InboxResponse {
  items: InboxItem[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface InboxCountResponse {
  count: number;
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
// Query Hooks
// ============================================================================

/**
 * Hook to fetch an agent's inbox with pagination and optional hydration
 */
export function useAgentInbox(agentId: string | null, view: InboxViewType = 'all') {
  // Determine status filter based on view
  const getStatusParam = () => {
    switch (view) {
      case 'unread':
        return 'unread';
      case 'archived':
        return 'archived';
      case 'all':
      default:
        return 'unread,read';
    }
  };

  return useQuery<InboxResponse, Error>({
    queryKey: ['agent-inbox', agentId, view],
    queryFn: () =>
      fetchApi<InboxResponse>(
        `/entities/${agentId}/inbox?limit=50&hydrate=true&status=${getStatusParam()}`
      ),
    enabled: !!agentId,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Poll every 30 seconds as fallback
  });
}

/**
 * Hook to fetch an agent's unread inbox count
 */
export function useAgentInboxCount(agentId: string | null) {
  return useQuery<InboxCountResponse, Error>({
    queryKey: ['agent-inbox-count', agentId],
    queryFn: () => fetchApi<InboxCountResponse>(`/entities/${agentId}/inbox/count`),
    enabled: !!agentId,
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 15000, // 15 seconds
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook to mark an inbox item as read/unread/archived
 */
export function useMarkInboxItem(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<InboxItem, Error, { itemId: string; status: InboxStatus }>({
    mutationFn: async ({ itemId, status }) => {
      return fetchApi<InboxItem>(`/inbox/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      // Invalidate all inbox-related queries for this agent
      queryClient.invalidateQueries({ queryKey: ['agent-inbox', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-inbox-count', agentId] });
    },
  });
}

/**
 * Hook to mark all inbox items as read for an agent
 */
export function useMarkAllInboxRead(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ markedCount: number }, Error, void>({
    mutationFn: async () => {
      return fetchApi<{ markedCount: number }>(`/entities/${agentId}/inbox/mark-all-read`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-inbox', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-inbox-count', agentId] });
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a timestamp for display
 */
export function formatInboxTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a full timestamp with date and time
 */
export function formatFullInboxTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
