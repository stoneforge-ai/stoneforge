/**
 * Message Mapper
 *
 * Maps SDK message types to the existing SpawnedSessionEvent format
 * for backward compatibility with the orchestrator's event handling.
 *
 * SDK Message Type Mappings:
 * | SDK Message Type      | Current Event Type |
 * |-----------------------|-------------------|
 * | SDKAssistantMessage   | assistant         |
 * | SDKUserMessage        | user              |
 * | tool_use content      | tool_use          |
 * | tool_result content   | tool_result       |
 * | SDKSystemMessage      | system            |
 * | SDKResultMessage      | result            |
 *
 * @module
 */

import { createTimestamp } from '@stoneforge/core';
import type { Timestamp } from '@stoneforge/core';
import type { SpawnedSessionEvent, StreamJsonEventType } from './spawner.js';

// ============================================================================
// SDK Message Types (Placeholder definitions until actual SDK is available)
// ============================================================================

/**
 * Base SDK message interface
 */
export interface SDKMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * SDK assistant message
 */
export interface SDKAssistantMessage extends SDKMessage {
  type: 'assistant';
  content: string | SDKContentBlock[];
}

/**
 * SDK user message
 */
export interface SDKUserMessage extends SDKMessage {
  type: 'user';
  content: string;
}

/**
 * SDK system message
 */
export interface SDKSystemMessage extends SDKMessage {
  type: 'system';
  subtype?: string;
  session_id?: string;
  message?: string;
}

/**
 * SDK result message (completion)
 */
export interface SDKResultMessage extends SDKMessage {
  type: 'result';
  result?: string;
  status?: string;
}

/**
 * SDK error message
 */
export interface SDKErrorMessage extends SDKMessage {
  type: 'error';
  error: string;
  message?: string;
}

/**
 * SDK content block (for structured content like tool use)
 */
export interface SDKContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

// Union type for all SDK messages
export type AnySDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKSystemMessage
  | SDKResultMessage
  | SDKErrorMessage;

// ============================================================================
// Mapper Functions
// ============================================================================

/**
 * Maps an SDK message to a SpawnedSessionEvent.
 *
 * @param sdkMessage - The SDK message to map
 * @returns The mapped SpawnedSessionEvent
 */
export function mapSDKMessageToEvent(sdkMessage: AnySDKMessage): SpawnedSessionEvent {
  const receivedAt = createTimestamp();

  switch (sdkMessage.type) {
    case 'assistant':
      return mapAssistantMessage(sdkMessage, receivedAt);

    case 'user':
      return mapUserMessage(sdkMessage, receivedAt);

    case 'system':
      return mapSystemMessage(sdkMessage, receivedAt);

    case 'result':
      return mapResultMessage(sdkMessage, receivedAt);

    case 'error':
      return mapErrorMessage(sdkMessage, receivedAt);

    default:
      // Unknown message type - pass through as raw
      return {
        type: ((sdkMessage as SDKMessage).type || 'system') as StreamJsonEventType,
        receivedAt,
        raw: sdkMessage as unknown as SpawnedSessionEvent['raw'],
      };
  }
}

/**
 * Maps an SDK assistant message to SpawnedSessionEvent.
 * Assistant messages may contain text or tool_use blocks.
 */
function mapAssistantMessage(
  message: SDKAssistantMessage,
  receivedAt: Timestamp
): SpawnedSessionEvent {
  // If content is a string, it's simple text
  if (typeof message.content === 'string') {
    return {
      type: 'assistant',
      receivedAt,
      raw: {
        type: 'assistant',
        message: message.content,
      },
      message: message.content,
    };
  }

  // Content is an array of content blocks
  const blocks = message.content;

  // Find text content
  const textBlocks = blocks.filter((b) => b.type === 'text');
  const textContent = textBlocks.map((b) => b.text || '').join('\n');

  // Find tool_use blocks
  const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');

  if (toolUseBlocks.length > 0) {
    // Return tool_use event for the first tool use block
    // (In practice, Claude typically uses one tool at a time)
    const toolBlock = toolUseBlocks[0];
    return {
      type: 'tool_use',
      receivedAt,
      raw: {
        type: 'tool_use',
        tool: toolBlock.name,
        tool_use_id: toolBlock.id,
        tool_input: toolBlock.input,
        message: textContent || undefined,
      },
      message: textContent || undefined,
      tool: {
        name: toolBlock.name,
        id: toolBlock.id,
        input: toolBlock.input,
      },
    };
  }

  // No tool use, return as assistant message
  return {
    type: 'assistant',
    receivedAt,
    raw: {
      type: 'assistant',
      message: textContent,
    },
    message: textContent,
  };
}

/**
 * Maps an SDK user message to SpawnedSessionEvent.
 */
function mapUserMessage(
  message: SDKUserMessage,
  receivedAt: Timestamp
): SpawnedSessionEvent {
  return {
    type: 'user',
    receivedAt,
    raw: {
      type: 'user',
      message: message.content,
    },
    message: message.content,
  };
}

/**
 * Maps an SDK system message to SpawnedSessionEvent.
 */
function mapSystemMessage(
  message: SDKSystemMessage,
  receivedAt: Timestamp
): SpawnedSessionEvent {
  return {
    type: 'system',
    subtype: message.subtype,
    receivedAt,
    raw: {
      type: 'system',
      subtype: message.subtype,
      session_id: message.session_id,
      message: message.message,
    },
    message: message.message,
  };
}

/**
 * Maps an SDK result message to SpawnedSessionEvent.
 */
function mapResultMessage(
  message: SDKResultMessage,
  receivedAt: Timestamp
): SpawnedSessionEvent {
  return {
    type: 'result',
    receivedAt,
    raw: {
      type: 'result',
      result: message.result,
    },
    message: message.result,
  };
}

/**
 * Maps an SDK error message to SpawnedSessionEvent.
 */
function mapErrorMessage(
  message: SDKErrorMessage,
  receivedAt: Timestamp
): SpawnedSessionEvent {
  return {
    type: 'error',
    receivedAt,
    raw: {
      type: 'error',
      error: message.error,
      message: message.message,
    },
    message: message.message || message.error,
  };
}

// ============================================================================
// Content Block Mappers
// ============================================================================

/**
 * Maps a tool_result content block to SpawnedSessionEvent.
 */
export function mapToolResultToEvent(
  toolUseId: string,
  content: string,
  isError: boolean = false,
  receivedAt: Timestamp = createTimestamp()
): SpawnedSessionEvent {
  return {
    type: 'tool_result',
    receivedAt,
    raw: {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      is_error: isError,
    },
    message: content,
    tool: {
      id: toolUseId,
    },
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Maps an array of SDK messages to SpawnedSessionEvents.
 *
 * @param messages - Array of SDK messages
 * @returns Array of mapped events
 */
export function mapSDKMessagesToEvents(messages: AnySDKMessage[]): SpawnedSessionEvent[] {
  return messages.map(mapSDKMessageToEvent);
}
