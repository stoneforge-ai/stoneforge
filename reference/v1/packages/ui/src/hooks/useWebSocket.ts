/**
 * WebSocket React Hook
 *
 * React hook for managing WebSocket connections with automatic cleanup.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { connectionState, lastEvent, subscribe, unsubscribe } = useWebSocket({
 *     url: 'ws://localhost:3456/ws',
 *     channels: ['tasks', 'messages'],
 *     onEvent: (event) => console.log('Event:', event),
 *   });
 *
 *   return <div>Status: {connectionState}</div>;
 * }
 * ```
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  WebSocketClient,
  type WebSocketOptions,
  type WebSocketEvent,
  type ConnectionState,
} from '../api/websocket';

/**
 * Hook options
 */
export interface UseWebSocketOptions extends Omit<WebSocketOptions, 'url'> {
  /** WebSocket URL (required) */
  url: string;
  /** Called when an event is received */
  onEvent?: (event: WebSocketEvent) => void;
  /** Called when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

/**
 * Hook return value
 */
export interface UseWebSocketResult {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether currently connected */
  isConnected: boolean;
  /** Last received event */
  lastEvent: WebSocketEvent | null;
  /** Connect to the server */
  connect: () => void;
  /** Disconnect from the server */
  disconnect: () => void;
  /** Subscribe to channels */
  subscribe: (channels: string | string[]) => void;
  /** Unsubscribe from channels */
  unsubscribe: (channels: string | string[]) => void;
  /** Send a custom message */
  sendMessage: (message: object) => boolean;
  /** Get list of subscribed channels */
  subscribedChannels: string[];
}

/**
 * React hook for WebSocket connection management
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const {
    url,
    channels,
    onEvent,
    onStateChange,
    autoConnect = true,
    ...wsOptions
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const clientRef = useRef<WebSocketClient | null>(null);

  // Create client on mount
  useEffect(() => {
    const client = new WebSocketClient({ url, channels, ...wsOptions });
    clientRef.current = client;

    // Add state listener
    const removeStateListener = client.addStateListener((state) => {
      setConnectionState(state);
      onStateChange?.(state);
    });

    // Add event listener
    const removeEventListener = client.addEventListener((event) => {
      setLastEvent(event);
      onEvent?.(event);
    });

    // Auto-connect if enabled
    if (autoConnect) {
      client.connect();
    }

    // Cleanup on unmount
    return () => {
      removeStateListener();
      removeEventListener();
      client.disconnect();
      clientRef.current = null;
    };
  }, [url]); // Only recreate on URL change

  // Update handlers when they change
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const removeEventListener = client.addEventListener((event) => {
      setLastEvent(event);
      onEvent?.(event);
    });

    return removeEventListener;
  }, [onEvent]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const removeStateListener = client.addStateListener((state) => {
      setConnectionState(state);
      onStateChange?.(state);
    });

    return removeStateListener;
  }, [onStateChange]);

  const connect = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const subscribe = useCallback((channels: string | string[]) => {
    clientRef.current?.subscribe(channels);
  }, []);

  const unsubscribe = useCallback((channels: string | string[]) => {
    clientRef.current?.unsubscribe(channels);
  }, []);

  const sendMessage = useCallback((message: object): boolean => {
    return clientRef.current?.sendMessage(message) ?? false;
  }, []);

  const subscribedChannels = clientRef.current?.subscribedChannels ?? [];

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    lastEvent,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    sendMessage,
    subscribedChannels,
  };
}

/**
 * Hook for just getting connection state without managing the connection
 * Requires a WebSocketClient to already exist.
 */
export function useWebSocketState(client: WebSocketClient | null): ConnectionState {
  const [state, setState] = useState<ConnectionState>(client?.connectionState ?? 'disconnected');

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
