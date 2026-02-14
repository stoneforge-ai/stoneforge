/**
 * Event Broadcaster
 *
 * Singleton service for broadcasting events to connected WebSocket clients.
 * Uses a polling mechanism to check for new events in the database.
 */

import type { QuarryLikeAPI } from '../types.js';
import type { WebSocketEvent } from './types.js';

/**
 * Database event row structure
 */
interface EventRow {
  id: number;
  element_id: string;
  event_type: string;
  actor: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

/**
 * Listener callback for events
 */
export type EventListener = (event: WebSocketEvent) => void;

/**
 * Event Broadcaster Service
 *
 * Polls the database for new events and broadcasts them to listeners.
 */
export class EventBroadcaster {
  private api: QuarryLikeAPI;
  private listeners: Set<EventListener> = new Set();
  private lastEventId: number = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;

  constructor(api: QuarryLikeAPI, pollIntervalMs: number = 500) {
    this.api = api;
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Add a listener for events
   */
  addListener(listener: EventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: EventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Get the number of active listeners
   */
  get listenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Start polling for events
   */
  async start(): Promise<void> {
    if (this.pollInterval) {
      return;
    }

    // Initialize last event ID from database
    await this.initializeLastEventId();

    // Start polling
    this.pollInterval = setInterval(() => {
      this.pollForEvents().catch((err) => {
        console.error('[ws] Error polling for events:', err);
      });
    }, this.pollIntervalMs);

    console.log(`[ws] Event broadcaster started (polling every ${this.pollIntervalMs}ms)`);
  }

  /**
   * Stop polling for events
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[ws] Event broadcaster stopped');
    }
  }

  /**
   * Initialize the last event ID from the database
   */
  private async initializeLastEventId(): Promise<void> {
    try {
      // Access the backend through the API's internal structure
      // The API stores the backend, but we need to get it indirectly
      const backend = (this.api as unknown as { backend: { query: (sql: string) => EventRow[] } }).backend;
      const rows = backend.query('SELECT MAX(id) as id FROM events');
      if (rows.length > 0 && rows[0].id) {
        this.lastEventId = rows[0].id;
      }
    } catch (err) {
      console.error('[ws] Error initializing last event ID:', err);
    }
  }

  /**
   * Poll for new events and broadcast them
   */
  private async pollForEvents(): Promise<void> {
    if (this.listeners.size === 0) {
      return;
    }

    try {
      // Access the backend through the API
      const backend = (this.api as unknown as { backend: { query: (sql: string, params: unknown[]) => EventRow[] } }).backend;

      // Query for events newer than our last known event
      const events = backend.query(
        'SELECT e.*, el.type as element_type FROM events e LEFT JOIN elements el ON e.element_id = el.id WHERE e.id > ? ORDER BY e.id ASC LIMIT 100',
        [this.lastEventId]
      ) as (EventRow & { element_type: string | null })[];

      for (const event of events) {
        const wsEvent: WebSocketEvent = {
          id: event.id,
          elementId: event.element_id as import('@stoneforge/core').ElementId,
          eventType: event.event_type as import('@stoneforge/core').EventType,
          actor: event.actor as import('@stoneforge/core').EntityId,
          oldValue: event.old_value ? JSON.parse(event.old_value) : null,
          newValue: event.new_value ? JSON.parse(event.new_value) : null,
          createdAt: event.created_at as import('@stoneforge/core').Timestamp,
          elementType: event.element_type ?? 'unknown',
        };

        // Broadcast to all listeners
        for (const listener of this.listeners) {
          try {
            listener(wsEvent);
          } catch (err) {
            console.error('[ws] Error in event listener:', err);
          }
        }

        // Update last event ID
        if (event.id > this.lastEventId) {
          this.lastEventId = event.id;
        }
      }
    } catch (err) {
      console.error('[ws] Error polling for events:', err);
    }
  }
}

/**
 * Singleton broadcaster instance
 */
let broadcaster: EventBroadcaster | null = null;

/**
 * Initialize the event broadcaster with an API instance
 */
export function initializeBroadcaster(api: QuarryLikeAPI, pollIntervalMs?: number): EventBroadcaster {
  if (!broadcaster) {
    broadcaster = new EventBroadcaster(api, pollIntervalMs);
  }
  return broadcaster;
}

/**
 * Get the broadcaster instance
 */
export function getBroadcaster(): EventBroadcaster | null {
  return broadcaster;
}
