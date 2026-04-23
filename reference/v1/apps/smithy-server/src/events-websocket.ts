/**
 * Events WebSocket Handler
 *
 * Handles WebSocket connections for the event-subscription protocol.
 * Clients can subscribe to channels (tasks, messages, etc.) and receive
 * real-time event updates from the EventBroadcaster.
 */

import type {
  SubscriptionChannel,
  ServerMessage,
  WebSocketEvent,
} from '@stoneforge/shared-routes';
import {
  parseClientMessage,
  getBroadcaster,
  shouldReceiveEvent,
} from '@stoneforge/shared-routes';
import { createLogger } from '@stoneforge/smithy';
import type { EventListener } from '@stoneforge/shared-routes';
import type { ServerWebSocket } from './types.js';

/**
 * Client data stored with each event-subscription WebSocket connection
 */
export interface EventsWSClientData {
  id: string;
  wsType: 'events';
  subscriptions: Set<SubscriptionChannel>;
  eventListener: EventListener;
}

/**
 * Track active event-subscription WebSocket connections
 */
const logger = createLogger('orchestrator:events-ws');

const eventsClients = new Map<string, ServerWebSocket<EventsWSClientData>>();

function generateClientId(): string {
  return `events-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function sendToClient(ws: ServerWebSocket<EventsWSClientData>, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    logger.error('Error sending message to client:', err);
  }
}

/**
 * Handle a new event-subscription WebSocket connection
 */
export function handleEventsWSOpen(ws: ServerWebSocket<EventsWSClientData>): void {
  const clientId = generateClientId();
  const subscriptions = new Set<SubscriptionChannel>();

  const eventListener: EventListener = (event: WebSocketEvent) => {
    if (shouldReceiveEvent(subscriptions, event)) {
      sendToClient(ws, { type: 'event', event });
    }
  };

  ws.data = {
    id: clientId,
    wsType: 'events',
    subscriptions,
    eventListener,
  };

  const broadcaster = getBroadcaster();
  if (broadcaster) {
    broadcaster.addListener(eventListener);
  }

  eventsClients.set(clientId, ws);
  logger.debug(`Client connected: ${clientId}`);
}

/**
 * Handle an event-subscription WebSocket message
 */
export function handleEventsWSMessage(ws: ServerWebSocket<EventsWSClientData>, message: string | Buffer): void {
  const msg = typeof message === 'string' ? message : message.toString();
  const parsed = parseClientMessage(msg);

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
      sendToClient(ws, { type: 'subscribed', channels: parsed.channels });
      logger.debug(`Client ${ws.data.id} subscribed to: ${parsed.channels.join(', ')}`);
      break;
    }

    case 'unsubscribe': {
      for (const channel of parsed.channels) {
        ws.data.subscriptions.delete(channel);
      }
      sendToClient(ws, { type: 'unsubscribed', channels: parsed.channels });
      logger.debug(`Client ${ws.data.id} unsubscribed from: ${parsed.channels.join(', ')}`);
      break;
    }
  }
}

/**
 * Handle event-subscription WebSocket close
 */
export function handleEventsWSClose(ws: ServerWebSocket<EventsWSClientData>): void {
  const { id, eventListener } = ws.data;

  const broadcaster = getBroadcaster();
  if (broadcaster) {
    broadcaster.removeListener(eventListener);
  }

  eventsClients.delete(id);
  logger.debug(`Client disconnected: ${id}`);
}
