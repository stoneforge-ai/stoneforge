/**
 * Activity API Hooks
 *
 * React Query hooks for fetching and streaming activity events.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useCallback, useState, useRef } from 'react';
import type {
  ActivityEvent,
  ActivityFilter,
  ActivityResponse,
  ActivityFilterCategory,
  SessionEvent,
} from '../types.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ============================================================================
// Query Keys
// ============================================================================

export const activityKeys = {
  all: ['activity'] as const,
  list: (filter?: ActivityFilter) => [...activityKeys.all, 'list', filter] as const,
  infinite: (filter?: ActivityFilter) => [...activityKeys.all, 'infinite', filter] as const,
  detail: (id: number) => [...activityKeys.all, 'detail', id] as const,
};

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch activity events with filtering
 */
async function fetchActivity(filter?: ActivityFilter): Promise<ActivityResponse> {
  const params = new URLSearchParams();

  if (filter?.category && filter.category !== 'all') {
    // Map category to element types
    const categoryToTypes: Record<string, string> = {
      tasks: 'task',
      agents: 'entity',
      sessions: 'entity',
      workflows: 'workflow',
    };
    const elementType = categoryToTypes[filter.category];
    if (elementType) {
      params.set('elementType', elementType);
    }
  }
  if (filter?.elementId) params.set('elementId', filter.elementId);
  if (filter?.elementType) {
    params.set('elementType', Array.isArray(filter.elementType) ? filter.elementType.join(',') : filter.elementType);
  }
  if (filter?.eventType) {
    params.set('eventType', Array.isArray(filter.eventType) ? filter.eventType.join(',') : filter.eventType);
  }
  if (filter?.actor) params.set('actor', filter.actor);
  if (filter?.after) params.set('after', filter.after);
  if (filter?.before) params.set('before', filter.before);
  if (filter?.limit) params.set('limit', String(filter.limit));
  if (filter?.offset) params.set('offset', String(filter.offset));

  const url = `${API_BASE}/api/events${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || 'Failed to fetch activity');
  }

  return response.json();
}

/**
 * Fetch a single event by ID
 */
async function fetchEvent(id: number): Promise<{ event: ActivityEvent }> {
  const response = await fetch(`${API_BASE}/api/events/${id}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || 'Failed to fetch event');
  }

  return response.json();
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to fetch activity events with filtering
 */
export function useActivity(filter?: ActivityFilter) {
  return useQuery({
    queryKey: activityKeys.list(filter),
    queryFn: () => fetchActivity(filter),
  });
}

/**
 * Hook for infinite scrolling of activity events
 */
export function useInfiniteActivity(filter?: Omit<ActivityFilter, 'offset'>) {
  const limit = filter?.limit || 20;

  return useInfiniteQuery({
    queryKey: activityKeys.infinite(filter),
    queryFn: async ({ pageParam = 0 }) => {
      return fetchActivity({ ...filter, limit, offset: pageParam });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      // Calculate total items fetched
      const totalFetched = allPages.reduce((sum, page) => sum + page.events.length, 0);
      return totalFetched;
    },
  });
}

/**
 * Hook to fetch a single event
 */
export function useEvent(id: number) {
  return useQuery({
    queryKey: activityKeys.detail(id),
    queryFn: () => fetchEvent(id),
    enabled: id > 0,
  });
}

/**
 * Hook for real-time activity streaming via SSE
 */
export function useActivityStream(category: ActivityFilterCategory = 'all') {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `${API_BASE}/api/events/stream${category !== 'all' ? `?category=${category}` : ''}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      // Clear any reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
      // Reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };

    // Handle connected event
    eventSource.addEventListener('connected', () => {
      setIsConnected(true);
    });

    // Handle session events
    eventSource.addEventListener('session_event', (e) => {
      try {
        const event = JSON.parse(e.data) as SessionEvent;
        setSessionEvents((prev) => [event, ...prev].slice(0, 100)); // Keep last 100
      } catch {
        console.error('Failed to parse session event:', e.data);
      }
    });

    // Handle heartbeat
    eventSource.addEventListener('heartbeat', () => {
      // Connection is alive
    });
  }, [category]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setIsConnected(false);
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Clear session events when category changes
  useEffect(() => {
    setSessionEvents([]);
  }, [category]);

  return {
    isConnected,
    sessionEvents,
    connect,
    disconnect,
    clearSessionEvents: () => setSessionEvents([]),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get display name for event type
 */
export function getEventTypeDisplayName(eventType: string): string {
  const displayNames: Record<string, string> = {
    created: 'Created',
    updated: 'Updated',
    closed: 'Closed',
    reopened: 'Reopened',
    deleted: 'Deleted',
    dependency_added: 'Dependency Added',
    dependency_removed: 'Dependency Removed',
    tag_added: 'Tag Added',
    tag_removed: 'Tag Removed',
    member_added: 'Member Added',
    member_removed: 'Member Removed',
    auto_blocked: 'Auto Blocked',
    auto_unblocked: 'Auto Unblocked',
  };
  return displayNames[eventType] || eventType;
}

/**
 * Get color for event type
 */
export function getEventTypeColor(eventType: string): string {
  const colors: Record<string, string> = {
    created: 'var(--color-success)',
    updated: 'var(--color-primary)',
    closed: 'var(--color-text-secondary)',
    reopened: 'var(--color-warning)',
    deleted: 'var(--color-error)',
    dependency_added: 'var(--color-info)',
    dependency_removed: 'var(--color-text-secondary)',
    tag_added: 'var(--color-info)',
    tag_removed: 'var(--color-text-secondary)',
    member_added: 'var(--color-success)',
    member_removed: 'var(--color-warning)',
    auto_blocked: 'var(--color-error)',
    auto_unblocked: 'var(--color-success)',
  };
  return colors[eventType] || 'var(--color-text-secondary)';
}

/**
 * Get icon name for event type (using lucide icons)
 */
export function getEventTypeIcon(eventType: string): string {
  const icons: Record<string, string> = {
    created: 'Plus',
    updated: 'Edit',
    closed: 'CheckCircle',
    reopened: 'RefreshCw',
    deleted: 'Trash2',
    dependency_added: 'Link',
    dependency_removed: 'Unlink',
    tag_added: 'Tag',
    tag_removed: 'Tag',
    member_added: 'UserPlus',
    member_removed: 'UserMinus',
    auto_blocked: 'Lock',
    auto_unblocked: 'Unlock',
  };
  return icons[eventType] || 'Activity';
}

/**
 * Format relative time for activity display
 */
export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
