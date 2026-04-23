/**
 * API hooks for the Messages feature
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { removeElementFromCache } from './useAllElements';
import type {
  Channel,
  Message,
  AttachedDocument,
  Entity,
  MessageSearchResponse,
  PaginatedResult,
} from '../../routes/messages/types';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CHANNEL_PAGE_SIZE = 50;
export const SEARCH_DEBOUNCE_DELAY = 300;

// ============================================================================
// Channel Hooks
// ============================================================================

/**
 * Hook to fetch a single channel by ID
 */
export function useChannel(channelId: string | null) {
  return useQuery<Channel>({
    queryKey: ['channels', channelId],
    queryFn: async () => {
      if (!channelId) throw new Error('No channel selected');
      const response = await fetch(`/api/channels/${channelId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch channel');
      }
      return response.json();
    },
    enabled: !!channelId,
  });
}

/**
 * Hook for server-side paginated channels
 * Reserved for future use if needed
 */
export function useChannelsPaginated(
  page: number = 1,
  pageSize: number = DEFAULT_CHANNEL_PAGE_SIZE,
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<Channel>>({
    queryKey: ['channels', 'paginated', page, pageSize, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        orderBy: 'updated_at',
        orderDir: 'desc',
      });

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/channels?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch channels');
      }
      return response.json();
    },
  });
}

// ============================================================================
// Message Hooks
// ============================================================================

/**
 * Hook to fetch all messages for a channel up-front
 * Uses virtualization in the UI to handle large message lists efficiently
 */
export function useChannelMessages(channelId: string | null) {
  return useQuery<Message[]>({
    queryKey: ['channels', channelId, 'messages'],
    queryFn: async () => {
      if (!channelId) throw new Error('No channel selected');
      // Load all messages up-front with limit=10000 for virtualization
      const response = await fetch(
        `/api/channels/${channelId}/messages?limit=10000&hydrate.content=true`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      return response.json();
    },
    enabled: !!channelId,
  });
}

/**
 * Hook to send a message
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      sender,
      content,
      threadId,
      attachmentIds,
    }: {
      channelId: string;
      sender: string;
      content: string;
      threadId?: string;
      attachmentIds?: string[];
    }) => {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, sender, content, threadId, attachmentIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to send message');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId, 'messages'],
      });
      // Also invalidate thread replies if this was a threaded message
      if (variables.threadId) {
        queryClient.invalidateQueries({
          queryKey: ['messages', variables.threadId, 'replies'],
        });
      }
    },
  });
}

/**
 * Hook to fetch all thread replies up-front
 * Uses virtualization in the UI to handle large reply lists efficiently
 */
export function useThreadReplies(threadId: string | null) {
  return useQuery<Message[]>({
    queryKey: ['messages', threadId, 'replies'],
    queryFn: async () => {
      if (!threadId) throw new Error('No thread selected');
      // Load all replies up-front with limit=10000 for virtualization
      const response = await fetch(
        `/api/messages/${threadId}/replies?limit=10000&hydrate.content=true`
      );
      if (!response.ok) {
        // If the endpoint doesn't exist yet, return empty array
        return [];
      }
      return response.json();
    },
    enabled: !!threadId,
  });
}

/**
 * Hook to delete a channel
 */
export function useDeleteChannel() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { channelId: string; actor: string }>({
    mutationFn: async ({ channelId, actor }) => {
      const response = await fetch(
        `/api/channels/${channelId}?actor=${encodeURIComponent(actor)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete channel');
      }
      return response.json();
    },
    onSuccess: (_, { channelId }) => {
      // Directly remove the channel from the in-memory cache for immediate UI update
      // This is required because useAllChannels uses staleTime: Infinity
      removeElementFromCache(queryClient, 'channel', channelId);

      // Also invalidate other channel-related caches
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channels', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'members'] });
    },
  });
}

/**
 * Hook to search messages within a channel (TB103)
 */
export function useMessageSearch(query: string, channelId: string | null) {
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_DELAY);

  return useQuery<MessageSearchResponse>({
    queryKey: ['messages', 'search', debouncedQuery, channelId],
    queryFn: async () => {
      if (!debouncedQuery.trim()) {
        return { results: [], query: '' };
      }
      const params = new URLSearchParams({
        q: debouncedQuery,
        limit: '50',
      });
      if (channelId) {
        params.set('channelId', channelId);
      }
      const response = await fetch(`/api/messages/search?${params}`);
      if (!response.ok) {
        throw new Error('Failed to search messages');
      }
      return response.json();
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
}

// ============================================================================
// Document & Entity Hooks
// ============================================================================

/**
 * Hook to fetch documents for the attachment picker
 */
export function useDocuments(searchQuery: string) {
  return useQuery<AttachedDocument[]>({
    queryKey: ['documents', 'search', searchQuery],
    queryFn: async () => {
      const response = await fetch('/api/documents');
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      const data = await response.json();
      // Handle paginated response format
      const docs: AttachedDocument[] = data.items || data;
      // Client-side filtering by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return docs.filter(
          (doc) =>
            doc.title?.toLowerCase().includes(query) ||
            doc.id.toLowerCase().includes(query)
        );
      }
      return docs;
    },
  });
}

/**
 * Hook to fetch entities (for @mention autocomplete and operator selection)
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
  });
}
