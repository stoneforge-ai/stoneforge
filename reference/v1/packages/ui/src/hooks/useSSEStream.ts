/**
 * SSE Stream React Hook
 *
 * React hook for managing SSE (Server-Sent Events) connections with automatic cleanup.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isConnected, connect, disconnect } = useSSEStream({
 *     url: 'http://localhost:3457/api/events/stream',
 *     eventTypes: ['session_event', 'notification'],
 *     onEvent: (type, data) => console.log(type, data),
 *   });
 *
 *   return <div>Connected: {isConnected ? 'Yes' : 'No'}</div>;
 * }
 * ```
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  SSEClient,
  type SSEOptions,
  type SSEConnectionState,
  type SSEEventData,
} from '../api/sse-client';

/**
 * Hook options
 */
export interface UseSSEStreamOptions extends Omit<SSEOptions, 'url'> {
  /** SSE endpoint URL (required) */
  url: string;
  /** Called when any event is received */
  onEvent?: (eventType: string, data: SSEEventData) => void;
  /** Called when connection state changes */
  onStateChange?: (state: SSEConnectionState) => void;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Maximum events to keep in history (default: 100) */
  maxEvents?: number;
}

/**
 * Event in the events history
 */
export interface SSEHistoryEvent {
  type: string;
  data: SSEEventData;
  timestamp: number;
}

/**
 * Hook return value
 */
export interface UseSSEStreamResult {
  /** Current connection state */
  connectionState: SSEConnectionState;
  /** Whether currently connected */
  isConnected: boolean;
  /** Recent events history */
  events: SSEHistoryEvent[];
  /** Connect to the stream */
  connect: () => void;
  /** Disconnect from the stream */
  disconnect: () => void;
  /** Clear events history */
  clearEvents: () => void;
  /** Update query parameters (will reconnect) */
  setParams: (params: Record<string, string>) => void;
}

/**
 * React hook for SSE stream management
 */
export function useSSEStream(options: UseSSEStreamOptions): UseSSEStreamResult {
  const {
    url,
    onEvent,
    onStateChange,
    autoConnect = true,
    maxEvents = 100,
    ...sseOptions
  } = options;

  const [connectionState, setConnectionState] = useState<SSEConnectionState>('disconnected');
  const [events, setEvents] = useState<SSEHistoryEvent[]>([]);
  const clientRef = useRef<SSEClient | null>(null);

  // Create client on mount
  useEffect(() => {
    const client = new SSEClient({ url, ...sseOptions });
    clientRef.current = client;

    // Add state listener
    const removeStateListener = client.addStateListener((state) => {
      setConnectionState(state);
      onStateChange?.(state);
    });

    // Add message handler
    const removeMessageHandler = client.addMessageHandler((type, data) => {
      // Add to history
      setEvents((prev) => {
        const newEvent: SSEHistoryEvent = {
          type,
          data,
          timestamp: Date.now(),
        };
        return [newEvent, ...prev].slice(0, maxEvents);
      });

      // Call user handler
      onEvent?.(type, data);
    });

    // Auto-connect if enabled
    if (autoConnect) {
      client.connect();
    }

    // Cleanup on unmount
    return () => {
      removeStateListener();
      removeMessageHandler();
      client.disconnect();
      clientRef.current = null;
    };
  }, [url]); // Only recreate on URL change

  // Update handlers when they change
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const removeHandler = client.addMessageHandler((type, data) => {
      onEvent?.(type, data);
    });

    return removeHandler;
  }, [onEvent]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const removeListener = client.addStateListener((state) => {
      setConnectionState(state);
      onStateChange?.(state);
    });

    return removeListener;
  }, [onStateChange]);

  const connect = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const setParams = useCallback((params: Record<string, string>) => {
    clientRef.current?.setParams(params);
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    events,
    connect,
    disconnect,
    clearEvents,
    setParams,
  };
}

/**
 * Hook for just getting SSE connection state
 */
export function useSSEState(client: SSEClient | null): SSEConnectionState {
  const [state, setState] = useState<SSEConnectionState>(client?.connectionState ?? 'disconnected');

  useEffect(() => {
    if (!client) {
      setState('disconnected');
      return;
    }

    const removeListener = client.addStateListener(setState);
    return removeListener;
  }, [client]);

  return state;
}
