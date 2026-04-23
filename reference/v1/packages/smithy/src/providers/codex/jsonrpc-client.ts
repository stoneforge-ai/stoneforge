/**
 * Codex JSON-RPC Client
 *
 * JSON-RPC 2.0 over JSONL stdio protocol layer for communicating
 * with the Codex app-server. Handles request/response multiplexing,
 * server-initiated requests, and notification dispatch.
 *
 * Note: Codex app-server omits the "jsonrpc":"2.0" header —
 * we do not require or emit it.
 *
 * @module
 */

import type { Writable, Readable } from 'node:stream';

// ============================================================================
// Types
// ============================================================================

/** Incoming message from the Codex app-server */
interface JsonRpcMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

/** Pending request awaiting a response */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/** Handler for server-initiated notifications (no id, has method) */
export type NotificationHandler = (method: string, params: unknown) => void;

/** Handler for server-initiated requests (has both id and method) */
export type ServerRequestHandler = (id: number, method: string, params: unknown) => void;

// ============================================================================
// JSON-RPC Client
// ============================================================================

/**
 * JSON-RPC 2.0 client over JSONL stdio.
 *
 * Multiplexes incoming messages by inspecting `id` and `method` fields:
 * - Has `id` + no `method` → response → resolve/reject pending promise
 * - Has `method` + no `id` → notification → dispatch to notification handler
 * - Has both `method` + `id` → server-initiated request → dispatch to request handler
 */
export class CodexJsonRpcClient {
  private stdin: Writable;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private notificationHandler: NotificationHandler | null = null;
  private serverRequestHandler: ServerRequestHandler | null = null;
  private lineBuffer = '';
  private closed = false;

  constructor(stdin: Writable, stdout: Readable) {
    this.stdin = stdin;
    stdout.on('data', (chunk: Buffer) => {
      this.onData(chunk.toString());
    });
  }

  /** Send a request and await the response */
  request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error('Client is closed'));
    }

    const id = this.nextId++;
    const message: Record<string, unknown> = { method, id };
    if (params !== undefined) {
      message.params = params;
    }

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.writeLine(message);
    });
  }

  /** Send a notification (no response expected) */
  notify(method: string, params?: unknown): void {
    if (this.closed) return;

    const message: Record<string, unknown> = { method };
    if (params !== undefined) {
      message.params = params;
    }
    this.writeLine(message);
  }

  /** Reply to a server-initiated request */
  respond(id: number, result: unknown): void {
    if (this.closed) return;
    this.writeLine({ id, result });
  }

  /** Register a handler for server notifications */
  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  /** Register a handler for server-initiated requests */
  onServerRequest(handler: ServerRequestHandler): void {
    this.serverRequestHandler = handler;
  }

  /** Close the client, rejecting all pending requests */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    for (const [, pending] of this.pending) {
      pending.reject(new Error('Client closed'));
    }
    this.pending.clear();
    this.notificationHandler = null;
    this.serverRequestHandler = null;
  }

  // ----------------------------------------
  // Private
  // ----------------------------------------

  /** Feed stdout data for JSONL line-buffered parsing */
  private onData(chunk: string): void {
    this.lineBuffer += chunk;

    let newlineIndex: number;
    while ((newlineIndex = this.lineBuffer.indexOf('\n')) !== -1) {
      const line = this.lineBuffer.slice(0, newlineIndex).trim();
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);

      if (line.length === 0) continue;

      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch {
        // Skip malformed lines
        continue;
      }

      this.dispatch(message);
    }
  }

  private dispatch(message: JsonRpcMessage): void {
    const hasId = message.id !== undefined;
    const hasMethod = message.method !== undefined;

    if (hasId && hasMethod) {
      // Server-initiated request — has both id and method
      this.serverRequestHandler?.(message.id!, message.method!, message.params);
    } else if (hasId && !hasMethod) {
      // Response to our request
      const pending = this.pending.get(message.id!);
      if (pending) {
        this.pending.delete(message.id!);
        if (message.error) {
          pending.reject(new Error(message.error.message ?? 'RPC error'));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (hasMethod && !hasId) {
      // Server notification
      this.notificationHandler?.(message.method!, message.params);
    }
  }

  private writeLine(message: Record<string, unknown>): void {
    this.stdin.write(JSON.stringify(message) + '\n');
  }
}
