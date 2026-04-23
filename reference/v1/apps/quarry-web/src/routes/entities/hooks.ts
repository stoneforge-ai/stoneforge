/**
 * Hooks for the Entities page
 * All data fetching and mutation hooks for entity-related operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Entity,
  EntityStats,
  Task,
  StoneforgeEvent,
  EntityActivity,
  EntityMentions,
  EntityHistoryResult,
  HistoryEventTypeFilter,
  InboxViewType,
  InboxItem,
  PaginatedResult,
  UpdateEntityInput,
} from './types';
import { DEFAULT_PAGE_SIZE } from './constants';
import type { EntityTypeFilter } from './types';

// Fetch single entity by ID
export function useEntity(id: string | null) {
  return useQuery<Entity>({
    queryKey: ['entities', id],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}`);
      if (!response.ok) throw new Error('Failed to fetch entity');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch entity by name (case-insensitive exact match)
export function useEntityByName(name: string | null) {
  return useQuery<Entity | null>({
    queryKey: ['entities', 'byName', name],
    queryFn: async () => {
      const response = await fetch(`/api/entities?search=${encodeURIComponent(name!)}&limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch entity');
      const result: PaginatedResult<Entity> = await response.json();
      const entity = result.items.find(
        (e) => e.name.toLowerCase() === name!.toLowerCase()
      );
      return entity ?? null;
    },
    enabled: !!name,
  });
}

// Fetch entity statistics
export function useEntityStats(id: string | null) {
  return useQuery<EntityStats>({
    queryKey: ['entities', id, 'stats'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/stats`);
      if (!response.ok) throw new Error('Failed to fetch entity stats');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch tasks assigned to entity
export function useEntityTasks(id: string | null) {
  return useQuery<Task[]>({
    queryKey: ['entities', id, 'tasks'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/tasks`);
      if (!response.ok) throw new Error('Failed to fetch entity tasks');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch recent events for entity
export function useEntityEvents(id: string | null) {
  return useQuery<StoneforgeEvent[]>({
    queryKey: ['entities', id, 'events'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/events?limit=20`);
      if (!response.ok) throw new Error('Failed to fetch entity events');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch activity data for contribution chart
export function useEntityActivity(id: string | null, days: number = 365) {
  return useQuery<EntityActivity>({
    queryKey: ['entities', id, 'activity', days],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/activity?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch entity activity');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch documents/tasks that @mention this entity
export function useEntityMentions(id: string | null) {
  return useQuery<EntityMentions>({
    queryKey: ['entities', id, 'mentions'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/mentions`);
      if (!response.ok) throw new Error('Failed to fetch entity mentions');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch entity history with pagination and event type filter
export function useEntityHistory(
  id: string | null,
  page: number = 1,
  pageSize: number = 25,
  eventType: HistoryEventTypeFilter = 'all'
) {
  const offset = (page - 1) * pageSize;

  return useQuery<EntityHistoryResult>({
    queryKey: ['entities', id, 'history', page, pageSize, eventType],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
      });

      if (eventType !== 'all') {
        params.set('eventType', eventType);
      }

      const response = await fetch(`/api/entities/${id}/history?${params}`);
      if (!response.ok) throw new Error('Failed to fetch entity history');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch entity inbox
export function useEntityInbox(id: string | null, view: InboxViewType = 'all') {
  return useQuery<PaginatedResult<InboxItem>>({
    queryKey: ['entities', id, 'inbox', view],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', hydrate: 'true' });
      if (view === 'unread') {
        params.set('status', 'unread');
      } else if (view === 'archived') {
        params.set('status', 'archived');
      } else {
        params.set('status', 'unread,read');
      }
      const response = await fetch(`/api/entities/${id}/inbox?${params}`);
      if (!response.ok) throw new Error('Failed to fetch inbox');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch unread inbox count
export function useEntityInboxCount(id: string | null) {
  return useQuery<{ count: number }>({
    queryKey: ['entities', id, 'inbox', 'count'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/inbox/count`);
      if (!response.ok) throw new Error('Failed to fetch inbox count');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch count for a specific inbox view
export function useEntityInboxViewCount(id: string | null, status: 'archived') {
  return useQuery<PaginatedResult<InboxItem>>({
    queryKey: ['entities', id, 'inbox', status, 'count'],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '1', status });
      const response = await fetch(`/api/entities/${id}/inbox?${params}`);
      if (!response.ok) throw new Error('Failed to fetch inbox count');
      return response.json();
    },
    enabled: !!id,
    select: (data) => data,
  });
}

// Mark inbox item as read/unread/archived
export function useMarkInboxRead(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: 'read' | 'unread' | 'archived' }) => {
      const response = await fetch(`/api/inbox/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update inbox item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'inbox'] });
    },
  });
}

// Mark all inbox items as read
export function useMarkAllInboxRead(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/entities/${entityId}/inbox/mark-all-read`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to mark all as read');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'inbox'] });
    },
  });
}

// Fetch all entities (for manager picker, etc.)
export function useAllEntities(search: string = '') {
  return useQuery<PaginatedResult<Entity>>({
    queryKey: ['entities', 'all', search],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '100',
        orderBy: 'name',
        orderDir: 'asc',
      });
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const response = await fetch(`/api/entities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
  });
}

// Fetch direct reports for an entity
export function useEntityDirectReports(id: string | null) {
  return useQuery<Entity[]>({
    queryKey: ['entities', id, 'reports'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/reports`);
      if (!response.ok) throw new Error('Failed to fetch direct reports');
      return response.json();
    },
    enabled: !!id,
  });
}

// Fetch management chain for an entity
export function useEntityManagementChain(id: string | null) {
  return useQuery<Entity[]>({
    queryKey: ['entities', id, 'chain'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/chain`);
      if (!response.ok) throw new Error('Failed to fetch management chain');
      return response.json();
    },
    enabled: !!id,
  });
}

// Set entity manager
export function useSetEntityManager(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (managerId: string | null) => {
      const response = await fetch(`/api/entities/${entityId}/manager`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to set manager');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'chain'] });
      queryClient.invalidateQueries({ queryKey: ['entities', undefined, 'reports'] });
    },
  });
}

// Update entity
export function useUpdateEntity(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEntityInput) => {
      const response = await fetch(`/api/entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update entity');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'stats'] });
    },
  });
}

// Reserved: Server-side paginated entities (not currently used, but available if needed)
export function usePaginatedEntities(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  typeFilter: EntityTypeFilter = 'all',
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<Entity>>({
    queryKey: ['entities', 'paginated', page, pageSize, typeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        orderBy: 'updated_at',
        orderDir: 'desc',
      });

      if (typeFilter !== 'all') {
        params.set('entityType', typeFilter);
      }

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/entities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
    enabled: false, // Disabled by default - use client-side pagination
  });
}
