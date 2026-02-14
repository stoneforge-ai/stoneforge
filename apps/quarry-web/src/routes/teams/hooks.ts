/**
 * Hooks for the Teams page
 * All data fetching and mutation hooks for team-related operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Team, Entity, TeamStats, UpdateTeamInput, PaginatedResult } from './types';
import { DEFAULT_PAGE_SIZE } from './constants';

/**
 * Reserved for future server-side pagination if needed
 */
export function usePaginatedTeams(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<Team>>({
    queryKey: ['teams', 'paginated', page, pageSize, searchQuery],
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

      const response = await fetch(`/api/teams?${params}`);
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
    enabled: false, // Disabled by default - use client-side pagination
  });
}

/**
 * Fetch a single team by ID
 */
export function useTeam(id: string | null) {
  return useQuery<Team>({
    queryKey: ['teams', id],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${id}`);
      if (!response.ok) throw new Error('Failed to fetch team');
      return response.json();
    },
    enabled: !!id,
  });
}

/**
 * Fetch team members as entity objects
 */
export function useTeamMembers(id: string | null) {
  return useQuery<Entity[]>({
    queryKey: ['teams', id, 'members'],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${id}/members`);
      if (!response.ok) throw new Error('Failed to fetch team members');
      return response.json();
    },
    enabled: !!id,
  });
}

/**
 * Fetch team statistics (task counts, workload distribution)
 */
export function useTeamStats(id: string | null) {
  return useQuery<TeamStats>({
    queryKey: ['teams', id, 'stats'],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${id}/stats`);
      if (!response.ok) throw new Error('Failed to fetch team stats');
      return response.json();
    },
    enabled: !!id,
  });
}

/**
 * Update team (name, tags, members)
 */
export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTeamInput }) => {
      const response = await fetch(`/api/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update team');
      }

      return response.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams', id] });
      queryClient.invalidateQueries({ queryKey: ['teams', id, 'members'] });
    },
  });
}

/**
 * Delete a team (soft delete - marks as tombstone)
 */
export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/teams/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete team');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

/**
 * Fetch all entities (for member picker)
 */
export function useAllEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities', 'all'],
    queryFn: async () => {
      // Fetch all entities with a high limit for the member picker
      const response = await fetch('/api/entities?limit=1000');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}
