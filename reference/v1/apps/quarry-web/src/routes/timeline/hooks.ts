/**
 * Custom hooks for the Timeline page
 * Data fetching and event management
 */

import { useQuery } from '@tanstack/react-query';
import type { Event, EventFilterState } from './types';
import { ALL_EVENT_TYPES, MAX_EAGER_LOAD_EVENTS } from './constants';

/**
 * Hook for eager loading all events.
 * Fetches total count first, then all events in one request for client-side pagination.
 */
export function useAllEvents(filter: EventFilterState) {
  // Build query params for filtering (no pagination)
  const buildQueryParams = () => {
    const queryParams = new URLSearchParams();

    // Add event type filter
    if (filter.eventTypes.length > 0 && filter.eventTypes.length < ALL_EVENT_TYPES.length) {
      queryParams.set('eventType', filter.eventTypes.join(','));
    }

    // Add actor filter (first selected actor for server-side filtering)
    if (filter.actors.length === 1) {
      queryParams.set('actor', filter.actors[0]);
    }

    return queryParams.toString();
  };

  // First, get the total count
  const countQuery = useQuery<{ count: number }>({
    queryKey: ['events', 'count', filter.eventTypes, filter.actors],
    queryFn: async () => {
      const queryString = buildQueryParams();
      const url = queryString ? `/api/events/count?${queryString}` : '/api/events/count';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch event count');
      return response.json();
    },
    staleTime: 30000, // Cache count for 30 seconds
  });

  // Then fetch all events (up to MAX_EAGER_LOAD_EVENTS)
  const eventsQuery = useQuery<Event[]>({
    queryKey: ['events', 'all', filter.eventTypes, filter.actors],
    queryFn: async () => {
      const queryParams = new URLSearchParams();

      if (filter.eventTypes.length > 0 && filter.eventTypes.length < ALL_EVENT_TYPES.length) {
        queryParams.set('eventType', filter.eventTypes.join(','));
      }
      if (filter.actors.length === 1) {
        queryParams.set('actor', filter.actors[0]);
      }

      // Fetch all events (up to limit)
      queryParams.set('limit', MAX_EAGER_LOAD_EVENTS.toString());

      const url = `/api/events?${queryParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
    enabled: countQuery.isSuccess, // Only fetch after we have the count
    staleTime: 30000, // Cache events for 30 seconds
    refetchInterval: 30000, // Refresh every 30 seconds for live updates
  });

  return {
    events: eventsQuery.data ?? [],
    totalCount: countQuery.data?.count ?? 0,
    isLoading: countQuery.isLoading || eventsQuery.isLoading,
    isFetching: eventsQuery.isFetching,
    isError: countQuery.isError || eventsQuery.isError,
    error: countQuery.error || eventsQuery.error,
  };
}
