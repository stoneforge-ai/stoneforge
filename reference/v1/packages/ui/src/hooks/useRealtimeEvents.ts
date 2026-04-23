/**
 * Real-time Events Hook
 *
 * React hook for subscribing to real-time events with optional React Query cache invalidation.
 * This is a higher-level hook that wraps useWebSocket and integrates with React Query.
 *
 * @example
 * ```tsx
 * function MyApp() {
 *   const { connectionState, lastEvent } = useRealtimeEvents({
 *     url: 'ws://localhost:3456/ws',
 *     channels: ['tasks', 'messages'],
 *     // Custom query key mapping
 *     getQueryKeysForEvent: (event) => [
 *       [event.elementType + 's'],
 *       [event.elementType + 's', event.elementId],
 *     ],
 *   });
 *
 *   return <div>Status: {connectionState}</div>;
 * }
 * ```
 */

import { useCallback, useState } from 'react';
import { useWebSocket, type UseWebSocketOptions } from './useWebSocket';
import type { WebSocketEvent, ConnectionState } from '../api/websocket';

/**
 * Function that returns query keys to invalidate for a given event
 */
export type QueryKeyMapper = (event: WebSocketEvent) => string[][];

/**
 * React Query client interface (subset used by this hook)
 */
export interface QueryClient {
  invalidateQueries: (options: { queryKey: string[] }) => void;
}

/**
 * Hook options
 */
export interface UseRealtimeEventsOptions extends Omit<UseWebSocketOptions, 'onEvent' | 'onStateChange'> {
  /** React Query client for cache invalidation */
  queryClient?: QueryClient;
  /** Function to map events to query keys for invalidation */
  getQueryKeysForEvent?: QueryKeyMapper;
  /** Called when an event is received (after cache invalidation) */
  onEvent?: (event: WebSocketEvent) => void;
  /** Called when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Whether to automatically invalidate queries (default: true) */
  autoInvalidate?: boolean;
}

/**
 * Hook return value
 */
export interface UseRealtimeEventsResult {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether currently connected */
  isConnected: boolean;
  /** Last received event */
  lastEvent: WebSocketEvent | null;
}

/**
 * Default query key mapper for common element types
 */
export function defaultQueryKeyMapper(event: WebSocketEvent): string[][] {
  const keys: string[][] = [];
  const { elementType, elementId, newValue } = event;

  // Add type-specific query keys
  switch (elementType) {
    case 'task':
      keys.push(['tasks']);
      keys.push(['tasks', elementId]);
      keys.push(['tasks', 'ready']);
      keys.push(['tasks', 'blocked']);
      keys.push(['tasks', 'completed']);
      keys.push(['stats']);
      break;

    case 'plan':
      keys.push(['plans']);
      keys.push(['plans', elementId]);
      keys.push(['stats']);
      break;

    case 'workflow':
      keys.push(['workflows']);
      keys.push(['workflows', elementId]);
      keys.push(['stats']);
      break;

    case 'entity':
      keys.push(['entities']);
      keys.push(['entities', elementId]);
      keys.push(['agents']); // Agents are entities
      keys.push(['stats']);
      break;

    case 'document':
      keys.push(['documents']);
      keys.push(['documents', elementId]);
      keys.push(['stats']);
      break;

    case 'channel':
      keys.push(['channels']);
      keys.push(['channels', elementId]);
      keys.push(['stats']);
      break;

    case 'message':
      keys.push(['messages']);
      keys.push(['messages', elementId]);
      if (newValue?.channelId) {
        keys.push(['channels', String(newValue.channelId), 'messages']);
      }
      if (newValue?.channel) {
        keys.push(['channels', String(newValue.channel), 'messages']);
      }
      if (newValue?.threadId) {
        keys.push(['messages', String(newValue.threadId), 'replies']);
      }
      break;

    case 'team':
      keys.push(['teams']);
      keys.push(['teams', elementId]);
      keys.push(['stats']);
      break;

    case 'inbox-item':
      if (newValue?.recipientId) {
        const recipientId = String(newValue.recipientId);
        keys.push(['inbox', recipientId, 'unread']);
        keys.push(['inbox', recipientId, 'all']);
        keys.push(['inbox', recipientId, 'archived']);
        keys.push(['inbox', recipientId, 'count']);
        keys.push(['inbox', recipientId]);
        keys.push(['entities', recipientId, 'inbox']);
        keys.push(['entities', recipientId, 'inbox', 'count']);
        // Also invalidate agent-specific inbox hooks (used by DirectorPanel/PendingMessagesQueue)
        keys.push(['agent-inbox', recipientId, 'unread']);
        keys.push(['agent-inbox', recipientId, 'all']);
        keys.push(['agent-inbox', recipientId, 'archived']);
        keys.push(['agent-inbox', recipientId]);
        keys.push(['agent-inbox-count', recipientId]);
      }
      keys.push(['inbox']);
      break;

    case 'session':
      keys.push(['sessions']);
      keys.push(['sessions', elementId]);
      if (newValue?.agentId) {
        keys.push(['agents', String(newValue.agentId), 'sessions']);
      }
      break;

    case 'worktree':
      keys.push(['worktrees']);
      keys.push(['worktrees', elementId]);
      break;

    default:
      // For unknown types, just invalidate stats
      keys.push(['stats']);
  }

  return keys;
}

/**
 * React hook for real-time events with React Query integration
 */
export function useRealtimeEvents(options: UseRealtimeEventsOptions): UseRealtimeEventsResult {
  const {
    queryClient,
    getQueryKeysForEvent = defaultQueryKeyMapper,
    onEvent,
    onStateChange,
    autoInvalidate = true,
    ...wsOptions
  } = options;

  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);

  // Handle incoming events
  const handleEvent = useCallback(
    (event: WebSocketEvent) => {
      setLastEvent(event);

      // Invalidate relevant queries
      if (autoInvalidate && queryClient) {
        const queryKeys = getQueryKeysForEvent(event);
        for (const key of queryKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }

      // Call custom handler
      onEvent?.(event);
    },
    [autoInvalidate, queryClient, getQueryKeysForEvent, onEvent]
  );

  // Use the WebSocket hook
  const { connectionState, isConnected } = useWebSocket({
    ...wsOptions,
    onEvent: handleEvent,
    onStateChange,
  });

  return {
    connectionState,
    isConnected,
    lastEvent,
  };
}

/**
 * Create a typed realtime events hook for a specific domain
 * This is useful for creating domain-specific hooks with custom query key mapping.
 *
 * @example
 * ```ts
 * // In your app
 * const useTaskEvents = createRealtimeEventsHook({
 *   getQueryKeysForEvent: (event) => [['tasks'], ['tasks', event.elementId]],
 * });
 *
 * // Usage
 * function TaskList() {
 *   const { lastEvent } = useTaskEvents({
 *     url: 'ws://localhost:3456/ws',
 *     channels: ['tasks'],
 *   });
 * }
 * ```
 */
export function createRealtimeEventsHook(
  defaults: Partial<UseRealtimeEventsOptions>
) {
  return function useCustomRealtimeEvents(
    options: Omit<UseRealtimeEventsOptions, keyof typeof defaults> & Partial<typeof defaults>
  ): UseRealtimeEventsResult {
    return useRealtimeEvents({ ...defaults, ...options } as UseRealtimeEventsOptions);
  };
}
