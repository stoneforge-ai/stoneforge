/**
 * WebSocket Module
 *
 * Shared types, broadcaster, and handler utilities for the event-subscription WebSocket protocol.
 */

// Types and helpers
export type {
  SubscriptionChannel,
  ClientMessageType,
  SubscribeMessage,
  UnsubscribeMessage,
  PingMessage,
  ClientMessage,
  ServerMessageType,
  WebSocketEvent,
  EventMessage,
  PongMessage,
  ErrorMessage,
  SubscribedMessage,
  UnsubscribedMessage,
  ServerMessage,
} from './types.js';
export { getChannelForElementType, parseClientMessage } from './types.js';

// Broadcaster
export { EventBroadcaster, initializeBroadcaster, getBroadcaster } from './broadcaster.js';
export type { EventListener } from './broadcaster.js';

// Handler utilities
export { shouldReceiveEvent } from './handler.js';
