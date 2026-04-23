/**
 * WebSocket Types
 *
 * Re-exported from @stoneforge/shared-routes for backwards compatibility.
 */

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
} from '@stoneforge/shared-routes';
export { getChannelForElementType, parseClientMessage } from '@stoneforge/shared-routes';
