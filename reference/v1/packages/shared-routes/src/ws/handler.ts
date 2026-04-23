/**
 * WebSocket Handler Utilities
 *
 * Pure functions for event subscription filtering.
 */

import type { WebSocketEvent, SubscriptionChannel } from './types.js';
import { getChannelForElementType } from './types.js';

/**
 * Check if a client should receive an event based on their subscriptions
 */
export function shouldReceiveEvent(
  subscriptions: Set<SubscriptionChannel>,
  event: WebSocketEvent
): boolean {
  // Wildcard subscription receives all events
  if (subscriptions.has('*')) {
    return true;
  }

  // Check for element type channel
  const channel = getChannelForElementType(event.elementType);
  if (channel && subscriptions.has(channel)) {
    return true;
  }

  // Check for channel-specific message subscription
  // For messages, also check messages:${channelId} subscriptions
  if (event.elementType === 'message' && event.newValue) {
    const channelId = (event.newValue as Record<string, unknown>).channel as string | undefined;
    if (channelId && subscriptions.has(`messages:${channelId}` as SubscriptionChannel)) {
      return true;
    }
  }

  // Check for entity-specific inbox subscription
  // For inbox items, also check inbox:${recipientId} subscriptions
  if (event.elementType === 'inbox-item' && event.newValue) {
    const recipientId = (event.newValue as Record<string, unknown>).recipientId as string | undefined;
    if (recipientId && subscriptions.has(`inbox:${recipientId}` as SubscriptionChannel)) {
      return true;
    }
  }

  return false;
}
