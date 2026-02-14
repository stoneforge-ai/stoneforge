/**
 * Codex Server Manager (Singleton)
 *
 * Manages the lifecycle of a single shared Codex app-server process.
 * Multiple sessions share one server; ref counting shuts it down
 * when the last session releases.
 *
 * Communicates via JSON-RPC 2.0 over JSONL stdio.
 *
 * @module
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { CodexJsonRpcClient } from './jsonrpc-client.js';
import type { NotificationHandler } from './jsonrpc-client.js';

// ============================================================================
// Client Interface
// ============================================================================

/** Model information returned by the Codex app-server */
export interface CodexModelInfo {
  id: string;
  name?: string;
  description?: string;
}

/** Typed facade over the JSON-RPC client for Codex app-server operations */
export interface CodexClient {
  model: {
    list(params?: { limit?: number }): Promise<{ models?: CodexModelInfo[]; data?: CodexModelInfo[] }>;
  };
  thread: {
    start(params: {
      model?: string;
      cwd?: string;
      approvalPolicy?: string;
      sandbox?: string;
    }): Promise<{ thread: { id: string } }>;
    resume(params: {
      threadId: string;
      model?: string;
      cwd?: string;
      approvalPolicy?: string;
      sandbox?: string;
    }): Promise<{ thread: { id: string } }>;
    read(params: { threadId: string }): Promise<{ thread: { id: string } }>;
  };
  turn: {
    start(params: {
      threadId: string;
      input: Array<{ type: 'text'; text: string }>;
    }): Promise<void>;
    interrupt(params: { threadId: string }): Promise<void>;
  };
  onNotification(handler: NotificationHandler): () => void;
  respondToServer(id: number, result: unknown): void;
  close(): void;
}

// ============================================================================
// Server Manager
// ============================================================================

export interface ServerManagerConfig {
  cwd?: string;
  stoneforgeRoot?: string;
}

/**
 * Manages a single shared Codex app-server instance.
 *
 * - `acquire()` starts or reuses the server, increments ref count
 * - `release()` decrements ref count, stops server at zero
 * - Concurrent acquire() calls are coalesced into a single startup
 */
class CodexServerManager {
  private client: CodexClient | null = null;
  private process: ChildProcess | null = null;
  private rpcClient: CodexJsonRpcClient | null = null;
  private refCount = 0;
  private startPromise: Promise<CodexClient> | null = null;

  async acquire(config?: ServerManagerConfig): Promise<CodexClient> {
    this.refCount++;

    if (this.client) {
      return this.client;
    }

    // Coalesce concurrent startup requests
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startServer(config);

    try {
      const client = await this.startPromise;
      return client;
    } catch (error) {
      this.refCount--;
      this.startPromise = null;
      throw error;
    }
  }

  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.shutdown();
    }
  }

  shutdown(): void {
    if (this.rpcClient) {
      this.rpcClient.close();
      this.rpcClient = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.client = null;
    this.startPromise = null;
    this.refCount = 0;
  }

  private async startServer(config?: ServerManagerConfig): Promise<CodexClient> {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    if (config?.stoneforgeRoot) {
      env.STONEFORGE_ROOT = config.stoneforgeRoot;
    }

    const child = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: config?.cwd,
      env,
    });

    // Wait for the process to confirm stdio is ready, or fail with a
    // descriptive error if the binary is missing / not executable.
    // Note: ENOENT can mean the binary OR the cwd doesn't exist.
    await new Promise<void>((resolve, reject) => {
      child.on('error', (err) => {
        const detail = config?.cwd ? ` (cwd: ${config.cwd})` : '';
        reject(new Error(`Failed to spawn codex app-server${detail}: ${err.message}`));
      });
      child.on('spawn', () => resolve());
    });

    if (!child.stdin || !child.stdout) {
      child.kill();
      throw new Error('Failed to spawn codex app-server: stdio not available');
    }

    const rpcClient = new CodexJsonRpcClient(child.stdin, child.stdout);

    // Pipe stderr to debug logging
    child.stderr?.on('data', () => {
      // Debug: stderr output consumed to prevent backpressure
    });

    // Monitor process exit
    child.on('exit', () => {
      rpcClient.close();
      this.process = null;
      this.rpcClient = null;
      this.client = null;
      this.startPromise = null;
    });

    // Send initialize handshake
    await rpcClient.request('initialize', {
      clientInfo: { name: 'stoneforge', title: 'Stoneforge', version: '0.1.0' },
    });

    // Send initialized notification
    rpcClient.notify('initialized');

    // Register auto-approval handler for requestApproval server requests
    rpcClient.onServerRequest((id, method, _params) => {
      if (method === 'requestApproval') {
        rpcClient.respond(id, { decision: 'accept' });
      }
    });

    this.process = child;
    this.rpcClient = rpcClient;

    // Build typed client facade
    const notificationHandlers = new Set<NotificationHandler>();

    rpcClient.onNotification((method, params) => {
      for (const handler of notificationHandlers) {
        handler(method, params);
      }
    });

    const client: CodexClient = {
      model: {
        list: (params) => rpcClient.request('model/list', params ?? {}) as Promise<{ models?: CodexModelInfo[]; data?: CodexModelInfo[] }>,
      },
      thread: {
        start: (params) => rpcClient.request('thread/start', params) as Promise<{ thread: { id: string } }>,
        resume: (params) => rpcClient.request('thread/resume', params) as Promise<{ thread: { id: string } }>,
        read: (params) => rpcClient.request('thread/read', params) as Promise<{ thread: { id: string } }>,
      },
      turn: {
        start: (params) => rpcClient.request('turn/start', params) as Promise<void>,
        interrupt: (params) => rpcClient.request('turn/interrupt', params) as Promise<void>,
      },
      onNotification: (handler) => {
        notificationHandlers.add(handler);
        return () => { notificationHandlers.delete(handler); };
      },
      respondToServer: (id, result) => rpcClient.respond(id, result),
      close: () => rpcClient.close(),
    };

    this.client = client;
    this.startPromise = null;

    return client;
  }
}

/** Singleton instance */
export const serverManager = new CodexServerManager();
