/**
 * WebSocket Types
 *
 * Message types and interfaces for the WebSocket event-subscription protocol.
 */

import type { Event } from '@stoneforge/core';

/**
 * Valid subscription channels
 */
export type SubscriptionChannel =
  | 'tasks'
  | 'plans'
  | 'workflows'
  | 'entities'
  | 'documents'
  | 'channels'
  | 'messages'
  | 'teams'
  | 'inbox'
  | '*' // Wildcard - all events
  | `messages:${string}` // Channel-specific messages
  | `inbox:${string}`; // Entity-specific inbox

/**
 * Client -> Server message types
 */
export type ClientMessageType = 'subscribe' | 'unsubscribe' | 'ping';

/**
 * Client -> Server messages
 */
export interface SubscribeMessage {
  type: 'subscribe';
  channels: SubscriptionChannel[];
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  channels: SubscriptionChannel[];
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

/**
 * Server -> Client message types
 */
export type ServerMessageType = 'event' | 'pong' | 'error' | 'subscribed' | 'unsubscribed';

/**
 * Extended event with element type information
 */
export interface WebSocketEvent extends Omit<Event, 'id'> {
  id: number;
  elementType: string;
}

/**
 * Event broadcast message
 */
export interface EventMessage {
  type: 'event';
  event: WebSocketEvent;
}

/**
 * Pong response
 */
export interface PongMessage {
  type: 'pong';
}

/**
 * Error message
 */
export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

/**
 * Subscription confirmation
 */
export interface SubscribedMessage {
  type: 'subscribed';
  channels: SubscriptionChannel[];
}

/**
 * Unsubscription confirmation
 */
export interface UnsubscribedMessage {
  type: 'unsubscribed';
  channels: SubscriptionChannel[];
}

export type ServerMessage =
  | EventMessage
  | PongMessage
  | ErrorMessage
  | SubscribedMessage
  | UnsubscribedMessage;

/**
 * Map element types to subscription channels
 */
export function getChannelForElementType(elementType: string): SubscriptionChannel | null {
  switch (elementType) {
    case 'task':
      return 'tasks';
    case 'plan':
      return 'plans';
    case 'workflow':
      return 'workflows';
    case 'entity':
      return 'entities';
    case 'document':
      return 'documents';
    case 'channel':
      return 'channels';
    case 'message':
      return 'messages';
    case 'team':
      return 'teams';
    case 'inbox-item':
      return 'inbox';
    default:
      return null;
  }
}

/**
 * Parse a client message from JSON
 */
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    if (parsed.type === 'ping') {
      return { type: 'ping' };
    }

    if (parsed.type === 'subscribe' && Array.isArray(parsed.channels)) {
      return {
        type: 'subscribe',
        channels: parsed.channels.filter((c: unknown) => typeof c === 'string'),
      };
    }

    if (parsed.type === 'unsubscribe' && Array.isArray(parsed.channels)) {
      return {
        type: 'unsubscribe',
        channels: parsed.channels.filter((c: unknown) => typeof c === 'string'),
      };
    }

    return null;
  } catch {
    return null;
  }
}
