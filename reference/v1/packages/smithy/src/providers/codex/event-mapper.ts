/**
 * Codex Event Mapper
 *
 * Maps Codex app-server JSON-RPC notifications to the provider-agnostic
 * AgentMessage interface. Handles deduplication of tool_use/tool_result
 * events and text delta buffering.
 *
 * @module
 */

import type { AgentMessage } from '../types.js';

// ============================================================================
// Codex Notification Types
// ============================================================================

/** Item types within Codex notifications */
interface CodexCommandExecution {
  type: 'commandExecution';
  id: string;
  command?: string;
  cwd?: string;
  stdout?: string;
  exitCode?: number;
  status?: string;
}

interface CodexFileChange {
  type: 'fileChange';
  id: string;
  changes?: unknown;
  content?: string;
}

interface CodexMcpToolCall {
  type: 'mcpToolCall';
  id: string;
  tool?: string;
  arguments?: unknown;
  result?: string;
}

interface CodexAgentMessage {
  type: 'agentMessage';
  id: string;
  text?: string;
}

type CodexItem = CodexCommandExecution | CodexFileChange | CodexMcpToolCall | CodexAgentMessage;

/** Codex notification params shape */
export interface CodexNotificationParams {
  threadId?: string;
  item?: CodexItem;
  delta?: string;
  itemId?: string;
  status?: string;
  error?: { message?: string } | string;
  [key: string]: unknown;
}

/** Codex notification (JSON-RPC notification from the app-server) */
export interface CodexNotification {
  method: string;
  params?: CodexNotificationParams;
}

// ============================================================================
// Event Mapper
// ============================================================================

/**
 * Maps Codex JSON-RPC notifications to AgentMessage arrays.
 *
 * Tracks emitted tool IDs to avoid duplicate tool_use/tool_result messages.
 * Buffers streaming text deltas and emits a single accumulated `assistant`
 * message when the next non-text event arrives.
 */
export class CodexEventMapper {
  private emittedToolUses = new Set<string>();
  private emittedToolResults = new Set<string>();
  private pendingText: { itemId: string; content: string } | null = null;
  private outputBuffers = new Map<string, string>();

  /**
   * Maps a Codex notification to zero or more AgentMessages.
   *
   * @param notification - The raw Codex JSON-RPC notification
   * @param threadId - Our thread ID for filtering
   * @returns Array of AgentMessages (may be empty)
   */
  mapNotification(notification: CodexNotification, threadId: string): AgentMessage[] {
    // Filter by thread ID
    const notifThreadId = notification.params?.threadId;
    if (notifThreadId && notifThreadId !== threadId) {
      return [];
    }

    switch (notification.method) {
      case 'item/agentMessage/delta':
        return this.handleTextDelta(notification);

      case 'item/started':
        return this.handleItemStarted(notification);

      case 'item/completed':
        return this.handleItemCompleted(notification);

      case 'turn/completed':
        return this.handleTurnCompleted(notification);

      case 'item/commandExecution/outputDelta':
      case 'item/fileChange/outputDelta':
        return this.handleOutputDelta(notification);

      case 'codex/event/error':
        return this.handleServerError(notification);

      // Ignored notification types
      case 'turn/started':
      case 'item/reasoning/delta':
      case 'item/reasoning/completed':
      case 'turn/diff/updated':
      case 'turn/plan/updated':
        return [];

      default:
        return [];
    }
  }

  /** Flush any buffered text as a final assistant message. Call after stream ends. */
  flush(): AgentMessage[] {
    return this.flushPendingText();
  }

  /** Reset state for a new conversation turn */
  reset(): void {
    this.emittedToolUses.clear();
    this.emittedToolResults.clear();
    this.pendingText = null;
    this.outputBuffers.clear();
  }

  // ----------------------------------------
  // Private
  // ----------------------------------------

  private handleServerError(notification: CodexNotification): AgentMessage[] {
    const params = notification.params as Record<string, unknown> | undefined;
    const msg = params?.msg as Record<string, unknown> | undefined;
    const errorMessage = (msg?.message as string)
      ?? (params?.message as string)
      ?? 'Unknown codex server error';

    const messages = this.flushPendingText();
    messages.push({
      type: 'error',
      content: errorMessage,
      raw: notification,
    });
    return messages;
  }

  private handleOutputDelta(notification: CodexNotification): AgentMessage[] {
    const params = notification.params;
    if (!params) return [];

    const delta = params.delta;
    const itemId = params.itemId ?? params.item?.id ?? '';
    if (!delta || !itemId) return [];

    const existing = this.outputBuffers.get(itemId) ?? '';
    this.outputBuffers.set(itemId, existing + delta);
    return [];
  }

  private handleTextDelta(notification: CodexNotification): AgentMessage[] {
    const params = notification.params;
    if (!params) return [];

    const delta = params.delta;
    const itemId = params.itemId ?? params.item?.id ?? '';

    if (!delta) return [];

    // If a different item starts, flush the previous one
    const messages: AgentMessage[] = [];
    if (this.pendingText && this.pendingText.itemId !== itemId) {
      messages.push(...this.flushPendingText());
    }

    if (this.pendingText) {
      this.pendingText.content += delta;
    } else {
      this.pendingText = { itemId, content: delta };
    }

    return messages;
  }

  private handleItemStarted(notification: CodexNotification): AgentMessage[] {
    const item = notification.params?.item;
    if (!item || !item.id) return [];

    // Flush buffered text before tool events
    const messages = this.flushPendingText();

    if (item.type === 'commandExecution') {
      if (!this.emittedToolUses.has(item.id)) {
        this.emittedToolUses.add(item.id);
        messages.push({
          type: 'tool_use',
          tool: {
            name: 'commandExecution',
            id: item.id,
            input: { command: item.command, cwd: item.cwd },
          },
          raw: notification,
        });
      }
    } else if (item.type === 'fileChange') {
      if (!this.emittedToolUses.has(item.id)) {
        this.emittedToolUses.add(item.id);
        messages.push({
          type: 'tool_use',
          tool: {
            name: 'fileChange',
            id: item.id,
            input: { changes: item.changes },
          },
          raw: notification,
        });
      }
    } else if (item.type === 'mcpToolCall') {
      if (!this.emittedToolUses.has(item.id)) {
        this.emittedToolUses.add(item.id);
        messages.push({
          type: 'tool_use',
          tool: {
            name: item.tool ?? 'mcpToolCall',
            id: item.id,
            input: item.arguments,
          },
          raw: notification,
        });
      }
    }

    return messages;
  }

  private handleItemCompleted(notification: CodexNotification): AgentMessage[] {
    const item = notification.params?.item;
    if (!item || !item.id) return [];

    // Only process tool item types — ignore agentMessage, userMessage, etc.
    if (item.type !== 'commandExecution' && item.type !== 'fileChange' && item.type !== 'mcpToolCall') {
      return [];
    }

    // Flush buffered text before tool results
    const messages = this.flushPendingText();

    // Emit tool_use if we haven't yet (skipped from started)
    if (!this.emittedToolUses.has(item.id)) {
      this.emittedToolUses.add(item.id);
      if (item.type === 'commandExecution') {
        messages.push({
          type: 'tool_use',
          tool: {
            name: 'commandExecution',
            id: item.id,
            input: { command: item.command, cwd: item.cwd },
          },
          raw: notification,
        });
      } else if (item.type === 'fileChange') {
        messages.push({
          type: 'tool_use',
          tool: {
            name: 'fileChange',
            id: item.id,
            input: { changes: item.changes },
          },
          raw: notification,
        });
      } else if (item.type === 'mcpToolCall') {
        messages.push({
          type: 'tool_use',
          tool: {
            name: item.tool ?? 'mcpToolCall',
            id: item.id,
            input: item.arguments,
          },
          raw: notification,
        });
      }
    }

    // Emit tool_result
    if (!this.emittedToolResults.has(item.id)) {
      this.emittedToolResults.add(item.id);

      const buffered = this.outputBuffers.get(item.id);
      this.outputBuffers.delete(item.id);

      let content = '';
      if (item.type === 'commandExecution') {
        content = buffered ?? item.stdout ?? `exit code: ${item.exitCode ?? 0}`;
      } else if (item.type === 'fileChange') {
        content = buffered ?? item.content ?? '';
      } else if (item.type === 'mcpToolCall') {
        content = item.result ?? '';
      }

      messages.push({
        type: 'tool_result',
        content,
        tool: { id: item.id },
        raw: notification,
      });
    }

    return messages;
  }

  private handleTurnCompleted(notification: CodexNotification): AgentMessage[] {
    const messages = this.flushPendingText();
    const status = notification.params?.status;

    if (status === 'failed') {
      const errorMsg = this.extractErrorMessage(notification.params?.error);
      messages.push({
        type: 'error',
        content: errorMsg,
        raw: notification,
      });
    } else if (status === 'interrupted') {
      messages.push({
        type: 'result',
        subtype: 'interrupted',
        raw: notification,
      });
    } else {
      // 'completed' or any other status
      messages.push({
        type: 'result',
        subtype: 'success',
        raw: notification,
      });
    }

    return messages;
  }

  private flushPendingText(): AgentMessage[] {
    if (!this.pendingText || !this.pendingText.content) {
      this.pendingText = null;
      return [];
    }
    const msg: AgentMessage = {
      type: 'assistant',
      content: this.pendingText.content,
      raw: null,
    };
    this.pendingText = null;
    return [msg];
  }

  private extractErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null) {
      const obj = error as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
    }
    return String(error);
  }
}
