/**
 * WebSocket Client
 *
 * A generic, configurable WebSocket client for real-time communication.
 * Supports automatic reconnection, heartbeat, channel subscriptions, and typed events.
 *
 * @example
 * ```ts
 * // Create and connect
 * const ws = new WebSocketClient({ url: 'ws://localhost:3456/ws' });
 * ws.connect();
 *
 * // Subscribe to events
 * ws.addEventListener('event', (data) => console.log(data));
 *
 * // Subscribe to channels
 * ws.subscribe(['tasks', 'messages']);
 * ```
 */

/**
 * Connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * WebSocket event with element type information
 */
export interface WebSocketEvent<T = Record<string, unknown>> {
  id: number;
  elementId: string;
  elementType: string;
  eventType: string;
  actor: string;
  oldValue: T | null;
  newValue: T | null;
  createdAt: string;
}

/**
 * Server message types
 */
interface EventMessage {
  type: 'event';
  event: WebSocketEvent;
}

interface PongMessage {
  type: 'pong';
}

interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

interface SubscribedMessage {
  type: 'subscribed';
  channels: string[];
}

interface UnsubscribedMessage {
  type: 'unsubscribed';
  channels: string[];
}

type ServerMessage =
  | EventMessage
  | PongMessage
  | ErrorMessage
  | SubscribedMessage
  | UnsubscribedMessage;

/**
 * Event listener callback
 */
export type EventListener<T = WebSocketEvent> = (event: T) => void;

/**
 * Connection state listener
 */
export type ConnectionStateListener = (state: ConnectionState) => void;

/**
 * WebSocket connection options
 */
export interface WebSocketOptions {
  /** WebSocket URL */
  url: string;
  /** Initial channels to subscribe to */
  channels?: string[];
  /** Reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Ping interval in ms (default: 30000) */
  pingInterval?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * WebSocket Client
 *
 * A generic WebSocket client with automatic reconnection,
 * channel subscriptions, and event dispatch.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private channels: Set<string> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private stateListeners: Set<ConnectionStateListener> = new Set();
  private state: ConnectionState = 'disconnected';
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private currentReconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: number;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private debug: boolean;

  constructor(options: WebSocketOptions) {
    this.url = options.url;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
    this.currentReconnectDelay = this.reconnectDelay;
    this.pingInterval = options.pingInterval ?? 30000;
    this.debug = options.debug ?? false;

    if (options.channels) {
      for (const channel of options.channels) {
        this.channels.add(channel);
      }
    }
  }

  /**
   * Log message if debug is enabled
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[ws]', ...args);
    }
  }

  /**
   * Get current connection state
   */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Get currently subscribed channels
   */
  get subscribedChannels(): string[] {
    return [...this.channels];
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setState('connecting');

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.log('Connected to server');
        this.setState('connected');
        this.currentReconnectDelay = this.reconnectDelay;

        // Subscribe to saved channels
        if (this.channels.size > 0) {
          this.sendSubscribe([...this.channels]);
        }

        // Start ping timer
        this.startPingTimer();
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = (event) => {
        this.log(`Connection closed: ${event.code} ${event.reason}`);
        this.handleDisconnect();
      };

      this.socket.onerror = (error) => {
        console.error('[ws] Connection error:', error);
      };
    } catch (error) {
      console.error('[ws] Failed to create WebSocket:', error);
      this.handleDisconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.stopPingTimer();
    this.cancelReconnect();

    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.setState('disconnected');
  }

  /**
   * Subscribe to channels
   */
  subscribe(channels: string | string[]): void {
    const channelList = Array.isArray(channels) ? channels : [channels];

    for (const channel of channelList) {
      this.channels.add(channel);
    }

    if (this.isConnected) {
      this.sendSubscribe(channelList);
    }
  }

  /**
   * Unsubscribe from channels
   */
  unsubscribe(channels: string | string[]): void {
    const channelList = Array.isArray(channels) ? channels : [channels];

    for (const channel of channelList) {
      this.channels.delete(channel);
    }

    if (this.isConnected) {
      this.send({ type: 'unsubscribe', channels: channelList });
    }
  }

  /**
   * Add event listener
   */
  addEventListener(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Add connection state listener
   */
  addStateListener(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    // Immediately notify of current state
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Send a custom message to the server
   */
  sendMessage(message: object): boolean {
    return this.send(message);
  }

  /**
   * Send a message to the server
   */
  private send(message: object): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Send subscribe message
   */
  private sendSubscribe(channels: string[]): void {
    this.send({ type: 'subscribe', channels });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ServerMessage;

      switch (message.type) {
        case 'event':
          this.dispatchEvent(message.event);
          break;

        case 'pong':
          // Ping response received
          break;

        case 'subscribed':
          this.log('Subscribed to:', message.channels.join(', '));
          break;

        case 'unsubscribed':
          this.log('Unsubscribed from:', message.channels.join(', '));
          break;

        case 'error':
          console.error('[ws] Server error:', message.code, message.message);
          break;
      }
    } catch (error) {
      console.error('[ws] Failed to parse message:', error);
    }
  }

  /**
   * Dispatch event to listeners
   */
  private dispatchEvent(event: WebSocketEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[ws] Error in event listener:', error);
      }
    }
  }

  /**
   * Set connection state and notify listeners
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      for (const listener of this.stateListeners) {
        try {
          listener(state);
        } catch (error) {
          console.error('[ws] Error in state listener:', error);
        }
      }
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.stopPingTimer();
    this.socket = null;
    this.setState('reconnecting');
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.log(`Reconnecting in ${this.currentReconnectDelay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();

      // Exponential backoff
      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * 2,
        this.maxReconnectDelay
      );
    }, this.currentReconnectDelay);
  }

  /**
   * Cancel scheduled reconnection
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Start ping timer
   */
  private startPingTimer(): void {
    this.stopPingTimer();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, this.pingInterval);
  }

  /**
   * Stop ping timer
   */
  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

/**
 * Create a WebSocket client instance
 */
export function createWebSocketClient(options: WebSocketOptions): WebSocketClient {
  return new WebSocketClient(options);
}
