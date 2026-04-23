/**
 * OpenCode Event Mapper
 *
 * Maps OpenCode SSE events to the provider-agnostic AgentMessage interface.
 * Handles deduplication of tool_use/tool_result events and text delta streaming.
 *
 * Types here mirror the real @opencode-ai/sdk event shapes:
 * - ToolPart.state is an object with `status` + nested `input`/`output`/`error`
 * - TextPart has `text` but delta comes from `event.properties.delta`
 * - Tool name lives in `ToolPart.tool`, not `ToolPart.name`
 *
 * @module
 */

import type { AgentMessage } from "../types.js";

// ============================================================================
// OpenCode Event Types (matching @opencode-ai/sdk v1.x)
// ============================================================================

/** Tool state objects — the `state` field on ToolPart is a discriminated union */
interface ToolStatePending {
  status: "pending";
  input: Record<string, unknown>;
}

interface ToolStateRunning {
  status: "running";
  input: Record<string, unknown>;
  title?: string;
}

interface ToolStateCompleted {
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
}

interface ToolStateError {
  status: "error";
  input: Record<string, unknown>;
  error: string;
}

type ToolState =
  | ToolStatePending
  | ToolStateRunning
  | ToolStateCompleted
  | ToolStateError;

/** Part types emitted by OpenCode */
interface TextPart {
  type: "text";
  id: string;
  sessionID: string;
  text: string;
}

interface ToolPart {
  type: "tool";
  id: string;
  sessionID: string;
  callID: string;
  tool: string;
  state: ToolState;
}

interface ReasoningPart {
  type: "reasoning";
  id: string;
  sessionID: string;
}

interface StepStartPart {
  type: "step-start";
  id: string;
  sessionID: string;
}

interface StepFinishPart {
  type: "step-finish";
  id: string;
  sessionID: string;
}

interface AgentPart {
  type: "agent";
  id: string;
  sessionID: string;
}

type OpenCodePart =
  | TextPart
  | ReasoningPart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | AgentPart;

/** OpenCode SSE event structure */
export interface OpenCodeEvent {
  type: string;
  properties?: {
    sessionID?: string;
    /** Incremental text delta (only on message.part.updated for TextPart) */
    delta?: string;
    part?: OpenCodePart & { sessionID?: string };
    info?: { id?: string };
    /** Structured error object (on session.error events) */
    error?: { message?: string; type?: string } | string;
    status?: unknown;
    [key: string]: unknown;
  };
}

// ============================================================================
// Event Mapper
// ============================================================================

/**
 * Maps OpenCode SSE events to AgentMessage arrays.
 *
 * Tracks emitted tool IDs to avoid duplicate tool_use/tool_result messages
 * when OpenCode fires multiple `message.part.updated` events for the same tool
 * as it transitions through states.
 *
 * Buffers streaming text deltas and emits a single accumulated `assistant`
 * message when the text part is complete (i.e. a non-text event arrives).
 * This matches the Claude provider behavior where each AgentMessage is a
 * complete response, not a streaming chunk.
 */
export class OpenCodeEventMapper {
  private emittedToolUses = new Set<string>();
  private emittedToolResults = new Set<string>();
  /** Buffered text content from streaming deltas, keyed by part ID */
  private pendingText: { partId: string; content: string } | null = null;

  /**
   * Maps an OpenCode SSE event to zero or more AgentMessages.
   *
   * @param event - The raw OpenCode SSE event
   * @param sessionId - Our session ID for filtering
   * @returns Array of AgentMessages (may be empty)
   */
  mapEvent(event: OpenCodeEvent, sessionId: string): AgentMessage[] {
    // Filter events by session ID
    const eventSessionId = this.extractSessionId(event);
    if (eventSessionId && eventSessionId !== sessionId) {
      return [];
    }

    switch (event.type) {
      case "message.part.updated":
        return this.mapPartUpdated(event);

      case "session.idle": {
        // Flush buffered text before emitting result
        const messages = this.flushPendingText();
        messages.push({
          type: "result",
          subtype: "success",
          raw: event,
        });
        return messages;
      }

      case "session.error": {
        const messages = this.flushPendingText();
        messages.push({
          type: "error",
          content: this.extractErrorMessage(event.properties?.error),
          raw: event,
        });
        return messages;
      }

      // Internal state events - no AgentMessage needed
      case "session.status":
      case "message.updated":
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
  }

  // ----------------------------------------
  // Private
  // ----------------------------------------

  private extractSessionId(event: OpenCodeEvent): string | undefined {
    return (
      event.properties?.sessionID ??
      event.properties?.part?.sessionID ??
      event.properties?.info?.id
    );
  }

  private extractErrorMessage(error: unknown): string {
    if (!error) return "Unknown session error";
    if (typeof error === "string") return error;
    if (typeof error === "object" && error !== null) {
      const obj = error as Record<string, unknown>;
      if (typeof obj.message === "string") return obj.message;
      if (typeof obj.type === "string") return obj.type;
    }
    return String(error);
  }

  private flushPendingText(): AgentMessage[] {
    if (!this.pendingText || !this.pendingText.content) {
      this.pendingText = null;
      return [];
    }
    const msg: AgentMessage = {
      type: "assistant",
      content: this.pendingText.content,
      raw: null,
    };
    this.pendingText = null;
    return [msg];
  }

  private mapPartUpdated(event: OpenCodeEvent): AgentMessage[] {
    const part = event.properties?.part;
    if (!part) return [];

    switch (part.type) {
      case "text":
        return this.bufferTextPart(part as TextPart, event);

      case "tool": {
        // Flush buffered text before emitting tool events
        const messages = this.flushPendingText();
        messages.push(...this.mapToolPart(part as ToolPart, event));
        return messages;
      }

      // Non-text parts flush any buffered text
      case "reasoning":
      case "step-start":
      case "step-finish":
      case "agent":
        return this.flushPendingText();

      default:
        return this.flushPendingText();
    }
  }

  private bufferTextPart(part: TextPart, event: OpenCodeEvent): AgentMessage[] {
    const delta = event.properties?.delta;
    const messages: AgentMessage[] = [];

    // If a different text part starts, flush the previous one
    if (this.pendingText && this.pendingText.partId !== part.id) {
      messages.push(...this.flushPendingText());
    }

    if (delta) {
      // Append incremental delta to buffer
      if (this.pendingText) {
        this.pendingText.content += delta;
      } else {
        this.pendingText = { partId: part.id, content: delta };
      }
    } else if (part.text) {
      // Full text replacement (no delta available)
      this.pendingText = { partId: part.id, content: part.text };
    }

    return messages;
  }

  private mapToolPart(part: ToolPart, event: OpenCodeEvent): AgentMessage[] {
    const partId = part.id;
    if (!partId) return [];

    const status = part.state?.status;
    const messages: AgentMessage[] = [];

    // Emit tool_use once when running (pending state often has empty input {})
    // Also emit on completed/error if we never saw running state
    if (!this.emittedToolUses.has(partId) && status !== "pending") {
      this.emittedToolUses.add(partId);
      messages.push({
        type: "tool_use",
        tool: {
          name: part.tool,
          id: partId,
          input: part.state?.input,
        },
        raw: event,
      });
    }

    // Emit tool_result once when completed or error
    if (
      (status === "completed" || status === "error") &&
      !this.emittedToolResults.has(partId)
    ) {
      this.emittedToolResults.add(partId);
      const resultContent =
        status === "error"
          ? ((part.state as ToolStateError).error ?? "Tool error")
          : ((part.state as ToolStateCompleted).output ?? "");
      messages.push({
        type: "tool_result",
        content: resultContent,
        tool: { id: partId },
        raw: event,
      });
    }

    return messages;
  }
}
