/**
 * OpenCode Server Manager (Singleton)
 *
 * Manages the lifecycle of a single shared OpenCode server process.
 * Multiple sessions share one server; ref counting shuts it down
 * when the last session releases.
 *
 * @module
 */

// ============================================================================
// Internal Types (our interface into the SDK)
// ============================================================================

/** Session object from the SDK */
export interface OpencodeSession {
  id: string;
  projectID?: string;
  directory?: string;
}

/** SDK response wrapper — all SDK methods return { data, error, request, response } */
export interface SdkResponse<T> {
  data: T | undefined;
  error?: unknown;
}

/** SSE subscribe result — returns { stream: AsyncGenerator<Event> } */
export interface SseSubscribeResult {
  stream: AsyncIterable<unknown>;
}

/** Text part input for prompts */
export interface TextPartInput {
  type: 'text';
  text: string;
}

/** Model information from OpenCode SDK */
export interface OpencodeModel {
  id: string;
  providerID?: string;
  name: string;
}

/** Provider information from OpenCode SDK (config.providers) */
export interface OpencodeProvider {
  id: string;
  name: string;
  models: Record<string, OpencodeModel>;
}

/** Response from config.providers() */
export interface ConfigProvidersResponse {
  providers: OpencodeProvider[];
  default: Record<string, string>;
}

/** Provider entry from provider.list() — includes all available providers */
export interface OpencodeProviderListItem {
  id: string;
  name: string;
  models: Record<string, OpencodeModel>;
}

/** Response from provider.list() */
export interface ProviderListResponse {
  all: OpencodeProviderListItem[];
  default: Record<string, string>;
  connected: string[];
}

/** Model specification for promptAsync */
export interface ModelSpec {
  providerID: string;
  modelID: string;
}

/** Minimal OpenCode client shape matching the real SDK response wrappers */
export interface OpencodeClient {
  session: {
    create(opts: { body: { title?: string } }): Promise<SdkResponse<OpencodeSession>>;
    get(opts: { path: { id: string } }): Promise<SdkResponse<OpencodeSession>>;
    abort(opts: { path: { id: string } }): Promise<SdkResponse<unknown>>;
    promptAsync(opts: {
      path: { id: string };
      body: { parts: TextPartInput[]; model?: ModelSpec };
    }): Promise<SdkResponse<void>>;
  };
  event: {
    subscribe(): Promise<SseSubscribeResult>;
  };
  config: {
    providers(): Promise<SdkResponse<ConfigProvidersResponse>>;
  };
  provider: {
    list(): Promise<SdkResponse<ProviderListResponse>>;
  };
}

/** Minimal OpenCode server shape */
interface OpencodeServer {
  close(): void;
}

// ============================================================================
// Server Manager
// ============================================================================

/** Default model for OpenCode provider */
const OPENCODE_DEFAULT_MODEL = 'opencode/minimax-m2.5-free';

export interface ServerManagerConfig {
  port?: number;
  cwd?: string;
  stoneforgeRoot?: string;
}

/**
 * Manages a single shared OpenCode server instance.
 *
 * - `acquire()` starts or reuses the server, increments ref count
 * - `release()` decrements ref count, stops server at zero
 * - Concurrent acquire() calls are coalesced into a single startup
 */
class OpenCodeServerManager {
  private client: OpencodeClient | null = null;
  private server: OpencodeServer | null = null;
  private refCount = 0;
  private startPromise: Promise<OpencodeClient> | null = null;

  async acquire(config?: ServerManagerConfig): Promise<OpencodeClient> {
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
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.client = null;
    this.startPromise = null;
    this.refCount = 0;
  }

  /**
   * List all available models from OpenCode providers.
   * Uses provider.list() to get the full catalog (not just configured providers).
   * Each model ID is formatted as `providerID/modelID`.
   * @returns Flattened array of models with composite IDs
   */
  async listModels(
    config?: ServerManagerConfig
  ): Promise<Array<{ id: string; displayName: string; description?: string; isDefault?: boolean; providerName?: string }>> {
    const client = await this.acquire(config);

    try {
      const response = await client.provider.list();

      if (!response.data?.all) {
        // Fallback to config.providers() if provider.list() is not available
        return this.listModelsFromConfig(client);
      }

      const models: Array<{ id: string; displayName: string; description?: string; isDefault?: boolean; providerName?: string }> = [];

      for (const provider of response.data.all) {
        if (!provider.models) continue;

        // Handle models as either a Record or an Array
        const entries: Array<[string, OpencodeModel]> = Array.isArray(provider.models)
          ? (provider.models as OpencodeModel[]).map((m) => [m.id, m] as [string, OpencodeModel])
          : Object.entries(provider.models);

        for (const [modelKey, model] of entries) {
          // Format ID as providerID/modelID
          const id = `${provider.id}/${modelKey}`;
          models.push({
            id,
            displayName: model.name || modelKey,
            description: undefined,
            providerName: provider.name || provider.id,
            ...(id === OPENCODE_DEFAULT_MODEL ? { isDefault: true } : {}),
          });
        }
      }

      return models;
    } finally {
      this.release();
    }
  }

  /**
   * Fallback: list models from config.providers() (only configured providers).
   */
  private async listModelsFromConfig(
    client: OpencodeClient
  ): Promise<Array<{ id: string; displayName: string; description?: string; isDefault?: boolean; providerName?: string }>> {
    const response = await client.config.providers();

    if (!response.data?.providers) {
      return [];
    }

    const models: Array<{ id: string; displayName: string; description?: string; isDefault?: boolean; providerName?: string }> = [];

    for (const provider of response.data.providers) {
      if (!provider.models) continue;

      const entries: Array<[string, OpencodeModel]> = Array.isArray(provider.models)
        ? (provider.models as OpencodeModel[]).map((m) => [m.id, m] as [string, OpencodeModel])
        : Object.entries(provider.models);

      for (const [modelKey, model] of entries) {
        const id = `${provider.id}/${modelKey}`;
        models.push({
          id,
          displayName: model.name || modelKey,
          description: undefined,
          providerName: provider.name || provider.id,
          ...(id === OPENCODE_DEFAULT_MODEL ? { isDefault: true } : {}),
        });
      }
    }

    return models;
  }

  private async startServer(config?: ServerManagerConfig): Promise<OpencodeClient> {
    const { spawn } = await import('node:child_process');
    const createOpencodeClient = await this.loadSDKClient();

    // Build env with our overrides — passed directly to spawn(), no process.env mutation
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      OPENCODE_PERMISSION: JSON.stringify({ '*': 'allow' }),
      OPENCODE_CLIENT: 'stoneforge',
    };
    if (config?.stoneforgeRoot) {
      env.STONEFORGE_ROOT = config.stoneforgeRoot;
    }

    // Build opencode config for OPENCODE_CONFIG_CONTENT
    const opencodeConfig: Record<string, unknown> = {};
    if (config?.cwd) {
      opencodeConfig.wd = config.cwd;
    }
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify(opencodeConfig);

    // Use port 0 to let opencode pick a free port, or use configured port
    const port = config?.port ?? 0;
    const hostname = '127.0.0.1';
    const args = ['serve', `--hostname=${hostname}`, `--port=${port}`];

    // Spawn opencode directly — bypassing the SDK's createOpencode/createOpencodeServer
    // so we can pass `cwd` to the child process. The SDK does not support cwd.
    const proc = spawn('opencode', args, {
      cwd: config?.cwd, // THE KEY FIX: set the process working directory
      env, // Pass our full env directly — no process.env mutation needed
    });

    // Parse server URL from stdout (same logic as SDK's createOpencodeServer)
    const timeout = 10000;
    const url = await new Promise<string>((resolve, reject) => {
      const id = setTimeout(() => {
        reject(new Error(`Timeout waiting for opencode server to start after ${timeout}ms`));
      }, timeout);

      let output = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('opencode server listening')) {
            const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
            if (!match) {
              clearTimeout(id);
              reject(new Error(`Failed to parse server url from output: ${line}`));
              return;
            }
            clearTimeout(id);
            resolve(match[1]);
            return;
          }
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      proc.on('exit', (code: number | null) => {
        clearTimeout(id);
        let msg = `opencode server exited with code ${code}`;
        if (output.trim()) {
          msg += `\nServer output: ${output}`;
        }
        reject(new Error(msg));
      });

      proc.on('error', (error: Error) => {
        clearTimeout(id);
        reject(error);
      });
    });

    // Use SDK's createOpencodeClient for the HTTP client (that part works fine)
    const client = createOpencodeClient({ baseUrl: url });

    this.client = client as unknown as OpencodeClient;
    this.server = { close: () => proc.kill() } as unknown as OpencodeServer;
    this.startPromise = null;

    return this.client;
  }

  /**
   * Load the SDK's createOpencodeClient function.
   * We only need the HTTP client from the SDK — server spawning is handled directly.
   */
  private async loadSDKClient(): Promise<(opts: { baseUrl: string }) => unknown> {
    try {
      const sdk = await import('@opencode-ai/sdk');
      return sdk.createOpencodeClient as (opts: { baseUrl: string }) => unknown;
    } catch {
      throw new Error(
        'OpenCode SDK is not installed. Install it with: npm install @opencode-ai/sdk'
      );
    }
  }
}

/** Singleton instance */
export const serverManager = new OpenCodeServerManager();
