/**
 * Codex Headless Provider
 *
 * Implements the HeadlessProvider interface using the Codex app-server
 * JSON-RPC protocol. Manages a shared server, creates threads, and maps
 * notifications to the AgentMessage stream.
 *
 * @module
 */

import type {
  HeadlessProvider,
  HeadlessSession,
  HeadlessSpawnOptions,
  AgentMessage,
} from '../types.js';
import { AsyncQueue } from '../opencode/async-queue.js';
import { CodexEventMapper } from './event-mapper.js';
import { serverManager } from './server-manager.js';
import type { CodexClient } from './server-manager.js';

// ============================================================================
// Codex Headless Session
// ============================================================================

class CodexHeadlessSession implements HeadlessSession {
  private client: CodexClient;
  private threadId: string;
  private eventMapper: CodexEventMapper;
  private messageQueue: AsyncQueue<AgentMessage>;
  private unsubscribe: (() => void) | null;
  private closed = false;

  constructor(client: CodexClient, threadId: string) {
    this.client = client;
    this.threadId = threadId;
    this.eventMapper = new CodexEventMapper();
    this.messageQueue = new AsyncQueue<AgentMessage>();

    // Subscribe to notifications and filter/map by thread ID
    this.unsubscribe = client.onNotification((method, params) => {
      if (this.closed) return;

      const notification = { method, params: params as any };
      const agentMessages = this.eventMapper.mapNotification(notification, this.threadId);

      for (const msg of agentMessages) {
        this.messageQueue.push(msg);
      }
    });
  }

  sendMessage(content: string): void {
    if (this.closed) return;

    // Fire-and-forget: start a new turn on the thread
    this.client.turn
      .start({
        threadId: this.threadId,
        input: [{ type: 'text' as const, text: content }],
      })
      .catch((error) => {
        this.messageQueue.push({
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
          raw: error,
        });
      });
  }

  [Symbol.asyncIterator](): AsyncIterator<AgentMessage> {
    return this.messageQueue[Symbol.asyncIterator]();
  }

  async interrupt(): Promise<void> {
    await this.client.turn.interrupt({ threadId: this.threadId });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    // Flush any remaining buffered text
    for (const msg of this.eventMapper.flush()) {
      this.messageQueue.push(msg);
    }

    this.messageQueue.close();
    this.unsubscribe?.();
    this.unsubscribe = null;
    serverManager.release();
  }

  /** Injects a synthetic system init message */
  injectInitMessage(): void {
    this.messageQueue.push({
      type: 'system',
      subtype: 'init',
      sessionId: this.threadId,
      raw: { synthetic: true, provider: 'codex' },
    });
  }

  /** Replay buffered notifications that arrived before the handler was registered */
  replayNotifications(buffered: Array<{ method: string; params: unknown }>): void {
    for (const { method, params } of buffered) {
      if (this.closed) return;
      const notification = { method, params: params as any };
      const agentMessages = this.eventMapper.mapNotification(notification, this.threadId);
      for (const msg of agentMessages) {
        this.messageQueue.push(msg);
      }
    }
  }
}

// ============================================================================
// Codex Headless Provider
// ============================================================================

/**
 * Codex headless provider using the app-server JSON-RPC protocol.
 * Manages a shared server and creates threads on demand.
 */
export class CodexHeadlessProvider implements HeadlessProvider {
  readonly name = 'codex-headless';

  async spawn(options: HeadlessSpawnOptions): Promise<HeadlessSession> {
    // 1. Acquire shared server client. Use stoneforgeRoot (project root) as the
    // server's cwd — NOT the per-session workingDirectory, which may be a
    // temporary worktree that gets deleted. The app-server is a shared
    // singleton; its cwd must be a stable directory.
    const client = await serverManager.acquire({
      cwd: options.stoneforgeRoot ?? options.workingDirectory,
      stoneforgeRoot: options.stoneforgeRoot,
    });

    let threadId: string;

    try {
      if (options.resumeSessionId) {
        // 2a. Resume: load the thread into the server and re-configure it
        const result = await client.thread.resume({
          threadId: options.resumeSessionId,
          model: options.model,
          cwd: options.workingDirectory,
          approvalPolicy: 'never',
          sandbox: 'danger-full-access',
        });
        threadId = result.thread.id;

        // Create session
        const session = new CodexHeadlessSession(client, threadId);
        session.injectInitMessage();

        // Send initial prompt as a new turn if provided
        if (options.initialPrompt) {
          session.sendMessage(options.initialPrompt);
        }

        return session;
      } else {
        // 2b. New thread: thread/start only creates the thread (does NOT run a
        // turn). We must call turn/start separately via sendMessage() to get
        // LLM output notifications.
        const result = await client.thread.start({
          model: options.model,
          cwd: options.workingDirectory,
          approvalPolicy: 'never',
          sandbox: 'danger-full-access',
        });

        if (!result?.thread?.id) {
          throw new Error('Codex thread creation failed: no thread ID returned');
        }
        threadId = result.thread.id;

        const session = new CodexHeadlessSession(client, threadId);
        session.injectInitMessage();

        // Explicitly start the first turn — thread/start does not do this
        session.sendMessage(options.initialPrompt ?? 'Hello');

        return session;
      }
    } catch (error) {
      // Release on failure
      serverManager.release();
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');
      execSync('codex --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
