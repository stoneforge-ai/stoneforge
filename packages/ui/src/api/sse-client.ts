/**
 * SSE (Server-Sent Events) Client
 *
 * A generic, configurable SSE client for real-time streaming.
 * Supports automatic reconnection, typed events, and multiple event handlers.
 *
 * @example
 * ```ts
 * // Create and connect
 * const sse = new SSEClient({ url: 'http://localhost:3457/api/events/stream' });
 * sse.connect();
 *
 * // Listen to specific events
 * sse.addEventListener('session_event', (data) => console.log(data));
 * sse.addEventListener('notification', (data) => console.log(data));
 *
 * // Listen to all events
 * sse.addMessageHandler((event, data) => console.log(event, data));
 * ```
 */

/**
 * Connection state
 */
export type SSEConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * SSE event data (generic, parsed from JSON)
 */
export type SSEEventData = Record<string, unknown>;

/**
 * Event listener for specific event types
 */
export type SSEEventListener<T = SSEEventData> = (data: T) => void;

/**
 * Generic message handler for all events
 */
export type SSEMessageHandler = (eventType: string, data: SSEEventData) => void;

/**
 * Connection state listener
 */
export type SSEStateListener = (state: SSEConnectionState) => void;

/**
 * SSE connection options
 */
export interface SSEOptions {
  /** SSE endpoint URL */
  url: string;
  /** Reconnect delay in ms (default: 5000) */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Query parameters to append to URL */
  params?: Record<string, string>;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Custom event types to listen for (default: ['connected', 'heartbeat']) */
  eventTypes?: string[];
}

/**
 * SSE Client
 *
 * A generic SSE client with automatic reconnection,
 * typed event handling, and state management.
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private url: string;
  private params: Record<string, string>;
  private eventListeners: Map<string, Set<SSEEventListener>> = new Map();
  private messageHandlers: Set<SSEMessageHandler> = new Set();
  private stateListeners: Set<SSEStateListener> = new Set();
  private state: SSEConnectionState = 'disconnected';
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private currentReconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private debug: boolean;
  private eventTypes: string[];

  constructor(options: SSEOptions) {
    this.url = options.url;
    this.params = options.params ?? {};
    this.reconnectDelay = options.reconnectDelay ?? 5000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
    this.currentReconnectDelay = this.reconnectDelay;
    this.debug = options.debug ?? false;
    this.eventTypes = options.eventTypes ?? ['connected', 'heartbeat'];
  }

  /**
   * Log message if debug is enabled
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[sse]', ...args);
    }
  }

  /**
   * Get current connection state
   */
  get connectionState(): SSEConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Build the full URL with query parameters
   */
  private buildUrl(): string {
    const urlParams = new URLSearchParams(this.params);
    const queryString = urlParams.toString();
    return queryString ? `${this.url}?${queryString}` : this.url;
  }

  /**
   * Connect to the SSE stream
   */
  connect(): void {
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      return;
    }

    this.setState('connecting');

    try {
      const url = this.buildUrl();
      this.log('Connecting to', url);

      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.log('Connected');
        this.setState('connected');
        this.currentReconnectDelay = this.reconnectDelay;

        // Clear any pending reconnect
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.eventSource.onerror = () => {
        this.log('Connection error');
        this.eventSource?.close();
        this.handleDisconnect();
      };

      // Listen for built-in event types
      for (const eventType of this.eventTypes) {
        this.eventSource.addEventListener(eventType, (e) => {
          this.handleEvent(eventType, e);
        });
      }

      // Also handle any dynamically registered event types
      for (const eventType of this.eventListeners.keys()) {
        if (!this.eventTypes.includes(eventType)) {
          this.eventSource.addEventListener(eventType, (e) => {
            this.handleEvent(eventType, e);
          });
        }
      }
    } catch (error) {
      console.error('[sse] Failed to create EventSource:', error);
      this.handleDisconnect();
    }
  }

  /**
   * Disconnect from the SSE stream
   */
  disconnect(): void {
    this.cancelReconnect();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setState('disconnected');
  }

  /**
   * Update query parameters (will reconnect if connected)
   */
  setParams(params: Record<string, string>): void {
    this.params = params;
    if (this.isConnected) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Add event listener for a specific event type
   */
  addEventListener<T = SSEEventData>(eventType: string, listener: SSEEventListener<T>): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());

      // If already connected, add listener to EventSource
      if (this.eventSource && !this.eventTypes.includes(eventType)) {
        this.eventSource.addEventListener(eventType, (e) => {
          this.handleEvent(eventType, e);
        });
      }
    }

    const listeners = this.eventListeners.get(eventType)!;
    listeners.add(listener as SSEEventListener);

    return () => {
      listeners.delete(listener as SSEEventListener);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    };
  }

  /**
   * Add generic message handler for all events
   */
  addMessageHandler(handler: SSEMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Add connection state listener
   */
  addStateListener(listener: SSEStateListener): () => void {
    this.stateListeners.add(listener);
    // Immediately notify of current state
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Handle incoming event
   */
  private handleEvent(eventType: string, event: MessageEvent): void {
    let data: SSEEventData;

    try {
      data = event.data ? JSON.parse(event.data) : {};
    } catch {
      // If not valid JSON, wrap the raw data
      data = { raw: event.data };
    }

    // Handle special events
    if (eventType === 'connected') {
      this.setState('connected');
    }

    // Dispatch to type-specific listeners
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`[sse] Error in ${eventType} listener:`, error);
        }
      }
    }

    // Dispatch to generic handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(eventType, data);
      } catch (error) {
        console.error('[sse] Error in message handler:', error);
      }
    }
  }

  /**
   * Set connection state and notify listeners
   */
  private setState(state: SSEConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      for (const listener of this.stateListeners) {
        try {
          listener(state);
        } catch (error) {
          console.error('[sse] Error in state listener:', error);
        }
      }
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.eventSource = null;
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
}

/**
 * Create an SSE client instance
 */
export function createSSEClient(options: SSEOptions): SSEClient {
  return new SSEClient(options);
}
