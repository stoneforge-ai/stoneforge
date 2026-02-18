/**
 * Claude Headless Provider
 *
 * Implements the HeadlessProvider interface using the @anthropic-ai/claude-agent-sdk.
 * Extracted from the original spawner.ts to enable provider abstraction.
 *
 * @module
 */

import { spawn as cpSpawn } from 'node:child_process';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { Query as SDKQuery, SDKMessage, SDKUserMessage, Options as SDKOptions, SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import type {
  HeadlessProvider,
  HeadlessSession,
  HeadlessSpawnOptions,
  AgentMessage,
  ProviderSessionId,
} from '../types.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Shell-quotes a string for safe inclusion in a bash command.
 */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ============================================================================
// SDK Input Queue
// ============================================================================

/**
 * Message queue for SDK streaming input mode.
 * Allows pushing messages that will be sent to the SDK query.
 */
class SDKInputQueue implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = [];
  private waitingResolve: ((result: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;
  private sessionId = '';

  setSessionId(id: string): void {
    this.sessionId = id;
  }

  push(content: string): void {
    if (this.closed) return;

    const message: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: content,
      },
      parent_tool_use_id: null,
      session_id: this.sessionId,
    };

    if (this.waitingResolve) {
      this.waitingResolve({ value: message, done: false });
      this.waitingResolve = null;
    } else {
      this.queue.push(message);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waitingResolve) {
      this.waitingResolve({ value: undefined as unknown as SDKUserMessage, done: true });
      this.waitingResolve = null;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
        }
        return new Promise((resolve) => {
          this.waitingResolve = resolve;
        });
      },
    };
  }
}

// ============================================================================
// Claude Headless Session
// ============================================================================

/**
 * A running Claude SDK headless session.
 */
class ClaudeHeadlessSession implements HeadlessSession {
  private inputQueue: SDKInputQueue;
  private sdkQuery: SDKQuery;
  private messageIterator: AsyncIterator<AgentMessage>;
  private sessionId: ProviderSessionId | undefined;
  private closed = false;

  constructor(inputQueue: SDKInputQueue, sdkQuery: SDKQuery) {
    this.inputQueue = inputQueue;
    this.sdkQuery = sdkQuery;
    this.messageIterator = this.createMessageIterator();
  }

  sendMessage(content: string): void {
    this.inputQueue.push(content);
  }

  [Symbol.asyncIterator](): AsyncIterator<AgentMessage> {
    return this.messageIterator;
  }

  async interrupt(): Promise<void> {
    await this.sdkQuery.interrupt();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.inputQueue.close();
  }

  getSessionId(): ProviderSessionId | undefined {
    return this.sessionId;
  }

  private async *createMessageIterator(): AsyncGenerator<AgentMessage> {
    let resumeErrorDetected = false;
    try {
      for await (const message of this.sdkQuery) {
        if (this.closed) break;

        const subtype = 'subtype' in message ? (message as { subtype?: string }).subtype : undefined;

        // Check for resume failure (session not found)
        if (message.type === 'result' && subtype === 'error_during_execution') {
          const resultMsg = message as { errors?: string[] };
          const errors = resultMsg.errors || [];
          const sessionNotFoundError = errors.find(e => e.includes('No conversation found with session ID'));
          if (sessionNotFoundError) {
            resumeErrorDetected = true;
          }
        }

        // Extract session ID from system init message
        if (message.type === 'system' && subtype === 'init') {
          this.sessionId = (message as { session_id?: string }).session_id;
          if (this.sessionId) {
            this.inputQueue.setSessionId(this.sessionId);
          }
        }

        const agentMessages = this.convertSDKMessage(message);
        for (const agentMessage of agentMessages) {
          yield agentMessage;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Interrupt - just stop iterating
        return;
      }
      if (!resumeErrorDetected) {
        yield {
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
          raw: error,
        };
      }
    }
  }

  /**
   * Converts an SDK message into one or more AgentMessages.
   *
   * A single SDK assistant/user message may contain multiple content blocks
   * (text, tool_use, tool_result). We decompose these into separate
   * AgentMessages so downstream consumers see the same event types they
   * saw before the provider abstraction (text as assistant/user, tool blocks
   * as tool_use/tool_result). Messages with no meaningful content are dropped.
   */
  private convertSDKMessage(message: SDKMessage): AgentMessage[] {
    switch (message.type) {
      case 'system':
        return [{
          type: 'system',
          subtype: 'subtype' in message ? (message as { subtype?: string }).subtype : undefined,
          sessionId: 'session_id' in message ? (message as { session_id?: string }).session_id : undefined,
          raw: message,
        }];

      case 'assistant':
        return this.decomposeContentBlocks('assistant', message);

      case 'user':
        return this.decomposeContentBlocks('user', message);

      case 'result':
        return [{
          type: 'result',
          subtype: 'subtype' in message ? (message as { subtype?: string }).subtype : undefined,
          content: 'result' in message ? (message as { result?: string }).result : undefined,
          raw: message,
        }];

      default:
        return [];
    }
  }

  /**
   * Decomposes an SDK assistant or user message into individual AgentMessages.
   *
   * Content blocks are mapped as follows:
   * - text blocks → message of the original type (assistant/user) with text content
   * - tool_use blocks → tool_use message
   * - tool_result blocks → tool_result message
   *
   * If no content blocks produce output, the message is dropped entirely
   * (no empty assistant/user events are emitted).
   */
  private decomposeContentBlocks(
    messageType: 'assistant' | 'user',
    message: SDKMessage
  ): AgentMessage[] {
    const apiMessage = (message as { message?: unknown }).message;
    if (!apiMessage || typeof apiMessage !== 'object') return [];

    const msg = apiMessage as { content?: unknown; role?: string };
    const results: AgentMessage[] = [];

    // Handle simple string content
    if (typeof msg.content === 'string') {
      if (msg.content.length > 0) {
        results.push({ type: messageType, content: msg.content, raw: message });
      }
      return results;
    }

    // Handle array of content blocks
    if (!Array.isArray(msg.content)) return [];

    const textParts: string[] = [];

    for (const block of msg.content) {
      if (typeof block !== 'object' || block === null || !('type' in block)) continue;

      const typed = block as {
        type: string;
        text?: string;
        name?: string;
        id?: string;
        input?: unknown;
        tool_use_id?: string;
        content?: unknown;
      };

      switch (typed.type) {
        case 'text':
          if (typeof typed.text === 'string' && typed.text.length > 0) {
            textParts.push(typed.text);
          }
          break;

        case 'tool_use':
          results.push({
            type: 'tool_use',
            tool: {
              name: typed.name,
              id: typed.id,
              input: typed.input,
            },
            raw: message,
          });
          break;

        case 'tool_result':
          results.push({
            type: 'tool_result',
            content: typeof typed.content === 'string' ? typed.content : undefined,
            tool: { id: typed.tool_use_id },
            raw: message,
          });
          break;
      }
    }

    // Emit text as the original message type (assistant/user)
    if (textParts.length > 0) {
      // Insert text message first, before tool messages
      results.unshift({
        type: messageType,
        content: textParts.join(''),
        raw: message,
      });
    }

    return results;
  }
}

// ============================================================================
// Claude Headless Provider
// ============================================================================

/**
 * Claude headless provider using @anthropic-ai/claude-agent-sdk.
 */
export class ClaudeHeadlessProvider implements HeadlessProvider {
  readonly name = 'claude-headless';
  private readonly executablePath?: string;

  constructor(executablePath?: string) {
    this.executablePath = executablePath;
  }

  async spawn(options: HeadlessSpawnOptions): Promise<HeadlessSession> {
    const initialPrompt = options.initialPrompt ?? 'You are an AI agent. Await further instructions.';

    // Build environment
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...options.environmentVariables,
    };
    if (options.stoneforgeRoot) {
      env.STONEFORGE_ROOT = options.stoneforgeRoot;
    }

    // Create input queue for streaming input mode
    const inputQueue = new SDKInputQueue();

    // Build SDK options
    const sdkOptions: SDKOptions = {
      cwd: options.workingDirectory,
      env,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    };

    // When a custom executable path is configured, use spawnClaudeCodeProcess to
    // route through a login shell. This ensures shell functions and aliases defined
    // in the user's profile (e.g. "claude2" as a bash function) are available.
    // When using the default 'claude', let the SDK handle spawning normally.
    if (this.executablePath && this.executablePath !== 'claude') {
      const customExecutable = this.executablePath;
      sdkOptions.spawnClaudeCodeProcess = (spawnOpts: SpawnOptions): SpawnedProcess => {
        // Build a shell command string from the custom executable + SDK args
        const shellCommand = [shellQuote(customExecutable), ...spawnOpts.args.map(shellQuote)].join(' ');

        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd.exe' : '/bin/bash';
        const shellArgs = isWindows
          ? ['/c', shellCommand]
          : ['-l', '-c', shellCommand];

        const child = cpSpawn(shell, shellArgs, {
          cwd: spawnOpts.cwd,
          env: spawnOpts.env as NodeJS.ProcessEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Wire the abort signal to kill the spawned process
        if (spawnOpts.signal) {
          if (spawnOpts.signal.aborted) {
            child.kill('SIGTERM');
          } else {
            spawnOpts.signal.addEventListener('abort', () => {
              child.kill('SIGTERM');
            }, { once: true });
          }
        }

        // ChildProcess satisfies SpawnedProcess interface
        return child as unknown as SpawnedProcess;
      };
    }

    // Pass model if specified
    if (options.model) {
      sdkOptions.model = options.model;
    }

    // Resume if we have a session ID
    if (options.resumeSessionId) {
      sdkOptions.resume = options.resumeSessionId;
      inputQueue.setSessionId(options.resumeSessionId);
    }

    // Create the SDK query
    const queryResult = sdkQuery({
      prompt: inputQueue,
      options: sdkOptions,
    });

    const session = new ClaudeHeadlessSession(inputQueue, queryResult);

    // Push the initial prompt to start the conversation
    inputQueue.push(initialPrompt);

    return session;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if the SDK can be imported
      await import('@anthropic-ai/claude-agent-sdk');
      return true;
    } catch {
      return false;
    }
  }
}
