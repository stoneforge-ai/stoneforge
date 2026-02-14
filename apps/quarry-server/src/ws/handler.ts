/**
 * WebSocket Handler
 *
 * Handles WebSocket connections, message parsing, and subscription management.
 */

import type { ServerWebSocket } from 'bun';
import type { WebSocketEvent, SubscriptionChannel, ServerMessage } from './types.js';
import { parseClientMessage } from './types.js';
import { getBroadcaster, type EventListener } from './broadcaster.js';
import { shouldReceiveEvent } from '@stoneforge/shared-routes';

/**
 * Client data stored with each WebSocket connection
 */
export interface ClientData {
  id: string;
  subscriptions: Set<SubscriptionChannel>;
  eventListener: EventListener;
}

/**
 * Track active WebSocket connections
 */
const clients = new Map<string, ServerWebSocket<ClientData>>();

/**
 * Generate a unique client ID
 */
function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Send a message to a specific client
 */
function sendToClient(ws: ServerWebSocket<ClientData>, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    console.error('[ws] Error sending message to client:', err);
  }
}

/**
 * Handle a new WebSocket connection
 */
export function handleOpen(ws: ServerWebSocket<ClientData>): void {
  const clientId = generateClientId();
  const subscriptions = new Set<SubscriptionChannel>();

  // Create event listener for this client
  const eventListener: EventListener = (event) => {
    if (shouldReceiveEvent(subscriptions, event)) {
      sendToClient(ws, {
        type: 'event',
        event,
      });
    }
  };

  // Store client data
  ws.data = {
    id: clientId,
    subscriptions,
    eventListener,
  };

  // Register listener with broadcaster
  const broadcaster = getBroadcaster();
  if (broadcaster) {
    broadcaster.addListener(eventListener);
  }

  // Track this client
  clients.set(clientId, ws);

  console.log(`[ws] Client connected: ${clientId}`);
}

/**
 * Handle WebSocket message from client
 */
export function handleMessage(ws: ServerWebSocket<ClientData>, data: string | Buffer): void {
  const message = typeof data === 'string' ? data : data.toString();
  const parsed = parseClientMessage(message);

  if (!parsed) {
    sendToClient(ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Could not parse message',
    });
    return;
  }

  switch (parsed.type) {
    case 'ping':
      sendToClient(ws, { type: 'pong' });
      break;

    case 'subscribe': {
      for (const channel of parsed.channels) {
        ws.data.subscriptions.add(channel);
      }
      sendToClient(ws, {
        type: 'subscribed',
        channels: parsed.channels,
      });
      console.log(`[ws] Client ${ws.data.id} subscribed to: ${parsed.channels.join(', ')}`);
      break;
    }

    case 'unsubscribe': {
      for (const channel of parsed.channels) {
        ws.data.subscriptions.delete(channel);
      }
      sendToClient(ws, {
        type: 'unsubscribed',
        channels: parsed.channels,
      });
      console.log(`[ws] Client ${ws.data.id} unsubscribed from: ${parsed.channels.join(', ')}`);
      break;
    }
  }
}

/**
 * Handle WebSocket connection close
 */
export function handleClose(ws: ServerWebSocket<ClientData>): void {
  const { id, eventListener } = ws.data;

  // Unregister listener from broadcaster
  const broadcaster = getBroadcaster();
  if (broadcaster) {
    broadcaster.removeListener(eventListener);
  }

  // Remove from tracking
  clients.delete(id);

  console.log(`[ws] Client disconnected: ${id}`);
}

/**
 * Handle WebSocket error
 */
export function handleError(ws: ServerWebSocket<ClientData>, error: Error): void {
  console.error(`[ws] Client ${ws.data?.id ?? 'unknown'} error:`, error.message);
}

/**
 * Get the number of connected clients
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcastToAll(message: ServerMessage): void {
  for (const client of clients.values()) {
    sendToClient(client, message);
  }
}

/**
 * Broadcast an inbox event to subscribed clients
 * Sends to clients subscribed to 'inbox', 'inbox:${recipientId}', or '*'
 */
export function broadcastInboxEvent(
  itemId: string,
  recipientId: string,
  eventType: 'created' | 'updated' | 'deleted',
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  actor?: string
): void {
  const event: WebSocketEvent = {
    id: Date.now(), // Use timestamp as pseudo-ID since inbox events aren't in events table
    elementId: itemId as import('@stoneforge/core').ElementId,
    elementType: 'inbox-item',
    eventType: eventType as import('@stoneforge/core').EventType,
    actor: (actor || 'system') as import('@stoneforge/core').EntityId,
    oldValue,
    newValue: { ...newValue, recipientId }, // Include recipientId for entity-specific subscriptions
    createdAt: new Date().toISOString() as import('@stoneforge/core').Timestamp,
  };

  const message: ServerMessage = {
    type: 'event',
    event,
  };

  for (const client of clients.values()) {
    if (shouldReceiveEvent(client.data.subscriptions, event)) {
      sendToClient(client, message);
    }
  }
}
