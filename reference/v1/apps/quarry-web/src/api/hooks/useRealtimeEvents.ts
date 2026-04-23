/**
 * Real-time Events Hook
 *
 * Thin wrapper around @stoneforge/ui's useRealtimeEvents that derives
 * the WebSocket URL from the current window location and connects
 * to the standard server's /ws endpoint.
 */

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRealtimeEvents as useRealtimeEventsBase,
  defaultQueryKeyMapper,
  type UseRealtimeEventsOptions as BaseOptions,
  type UseRealtimeEventsResult,
} from '@stoneforge/ui';
import type { WebSocketEvent, ConnectionState } from '@stoneforge/ui';

export type { WebSocketEvent, ConnectionState };

/**
 * Hook options — same consumer-facing API as before
 */
export interface UseRealtimeEventsOptions {
  channels?: string[];
  onEvent?: (event: WebSocketEvent) => void;
  onStateChange?: (state: ConnectionState) => void;
  autoInvalidate?: boolean;
}

/**
 * Derive the WebSocket URL for the events endpoint.
 * In development, Vite's proxy forwards /ws to the standard server.
 * In production, use the same host as the page.
 */
function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Hook for subscribing to real-time events
 *
 * Wraps @stoneforge/ui's useRealtimeEvents with app-specific defaults:
 * - WebSocket URL derived from window.location → /ws
 * - React Query integration via useQueryClient()
 * - Default query key mapping via defaultQueryKeyMapper
 */
export function useRealtimeEvents(options: UseRealtimeEventsOptions = {}): {
  connectionState: ConnectionState;
  lastEvent: WebSocketEvent | null;
} {
  const {
    channels = ['*'],
    onEvent,
    onStateChange,
    autoInvalidate = true,
  } = options;

  const queryClient = useQueryClient();
  const url = useMemo(() => getWsUrl(), []);

  const baseOptions: BaseOptions = {
    url,
    channels,
    onEvent,
    onStateChange,
    autoInvalidate,
    queryClient,
    getQueryKeysForEvent: defaultQueryKeyMapper,
  };

  const result: UseRealtimeEventsResult = useRealtimeEventsBase(baseOptions);

  return {
    connectionState: result.connectionState,
    lastEvent: result.lastEvent,
  };
}
