/**
 * LSP Manager Service
 *
 * Manages language server processes for multi-language LSP support.
 * Spawns language servers on demand and manages their lifecycle.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Configuration for a language server
 */
export interface LanguageServerConfig {
  /** Unique identifier for the server (e.g., 'typescript', 'python') */
  id: string;
  /** Display name for the server */
  name: string;
  /** Command or path to the binary */
  command: string;
  /** Arguments to pass to the command */
  args: string[];
  /** Monaco language IDs this server handles */
  languages: string[];
  /** Check if this server's toolchain is installed */
  isAvailable: () => Promise<boolean>;
  /** Environment variables to set */
  env?: Record<string, string>;
}

/**
 * Status of a language server
 */
export interface LanguageServerStatus {
  id: string;
  name: string;
  languages: string[];
  available: boolean;
  running: boolean;
}

/**
 * Running language server instance
 */
interface RunningServer {
  config: LanguageServerConfig;
  process: ChildProcess;
  messageBuffer: Buffer;
  pendingCallbacks: Map<string, (response: unknown) => void>;
}

/**
 * Check if a command is available in PATH
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    execSync(`which ${cmd}`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a binary: check local node_modules/.bin first, then fall back to PATH.
 * Returns the resolved command string and an availability checker.
 */
function resolveBinary(name: string): { command: string; isAvailable: () => Promise<boolean> } {
  const localBin = resolve(process.cwd(), 'node_modules/.bin', name);
  if (existsSync(localBin)) {
    return { command: localBin, isAvailable: async () => true };
  }
  return { command: name, isAvailable: () => commandExists(name) };
}

/**
 * Default language server configurations
 */
function createDefaultConfigs(): LanguageServerConfig[] {
  const ts = resolveBinary('typescript-language-server');
  const css = resolveBinary('vscode-css-language-server');
  const html = resolveBinary('vscode-html-language-server');
  const json = resolveBinary('vscode-json-language-server');

  return [
    // TypeScript/JavaScript
    {
      id: 'typescript',
      name: 'TypeScript Language Server',
      command: ts.command,
      args: ['--stdio'],
      languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
      isAvailable: ts.isAvailable,
    },
    // Python (Pyright)
    {
      id: 'python',
      name: 'Pyright Language Server',
      command: 'pyright-langserver',
      args: ['--stdio'],
      languages: ['python'],
      isAvailable: () => commandExists('pyright-langserver'),
    },
    // Rust (rust-analyzer)
    {
      id: 'rust',
      name: 'Rust Analyzer',
      command: 'rust-analyzer',
      args: [],
      languages: ['rust'],
      isAvailable: () => commandExists('rust-analyzer'),
    },
    // Go (gopls)
    {
      id: 'go',
      name: 'Go Language Server',
      command: 'gopls',
      args: ['serve'],
      languages: ['go'],
      isAvailable: () => commandExists('gopls'),
    },
    // CSS
    {
      id: 'css',
      name: 'CSS Language Server',
      command: css.command,
      args: ['--stdio'],
      languages: ['css', 'scss', 'less'],
      isAvailable: css.isAvailable,
    },
    // HTML
    {
      id: 'html',
      name: 'HTML Language Server',
      command: html.command,
      args: ['--stdio'],
      languages: ['html'],
      isAvailable: html.isAvailable,
    },
    // JSON
    {
      id: 'json',
      name: 'JSON Language Server',
      command: json.command,
      args: ['--stdio'],
      languages: ['json', 'jsonc'],
      isAvailable: json.isAvailable,
    },
  ];
}

/**
 * LSP Manager
 *
 * Manages language server processes and provides access to them by language ID.
 */
export class LspManager {
  private configs: LanguageServerConfig[];
  private availabilityCache: Map<string, boolean> = new Map();
  private runningServers: Map<string, RunningServer> = new Map();
  private workspaceRoot: string;

  constructor(workspaceRoot: string, configs?: LanguageServerConfig[]) {
    this.workspaceRoot = workspaceRoot;
    this.configs = configs || createDefaultConfigs();
  }

  /**
   * Check availability of all language servers
   */
  async checkAvailability(): Promise<Map<string, boolean>> {
    const results = await Promise.all(
      this.configs.map(async (config) => {
        const available = await config.isAvailable();
        this.availabilityCache.set(config.id, available);
        return { id: config.id, available };
      })
    );

    console.log('[lsp-manager] Server availability:');
    for (const { id, available } of results) {
      const config = this.configs.find((c) => c.id === id);
      console.log(`  - ${config?.name || id}: ${available ? '✓ available' : '✗ not found'}`);
    }

    return this.availabilityCache;
  }

  /**
   * Get the config for a specific language ID
   */
  getConfigForLanguage(languageId: string): LanguageServerConfig | undefined {
    return this.configs.find((config) => config.languages.includes(languageId));
  }

  /**
   * Get the server ID for a language ID
   */
  getServerIdForLanguage(languageId: string): string | undefined {
    const config = this.getConfigForLanguage(languageId);
    return config?.id;
  }

  /**
   * Check if a language server is available
   */
  async isServerAvailable(serverId: string): Promise<boolean> {
    if (this.availabilityCache.has(serverId)) {
      return this.availabilityCache.get(serverId)!;
    }

    const config = this.configs.find((c) => c.id === serverId);
    if (!config) return false;

    const available = await config.isAvailable();
    this.availabilityCache.set(serverId, available);
    return available;
  }

  /**
   * Start a language server for a given language
   */
  async startServer(languageId: string): Promise<ChildProcess | null> {
    const config = this.getConfigForLanguage(languageId);
    if (!config) {
      console.log(`[lsp-manager] No language server configured for: ${languageId}`);
      return null;
    }

    // Check if already running
    if (this.runningServers.has(config.id)) {
      const running = this.runningServers.get(config.id)!;
      if (!running.process.killed) {
        return running.process;
      }
      // Process was killed, clean up
      this.runningServers.delete(config.id);
    }

    // Check availability
    const available = await this.isServerAvailable(config.id);
    if (!available) {
      console.log(`[lsp-manager] Server not available: ${config.name}`);
      return null;
    }

    console.log(`[lsp-manager] Starting ${config.name}...`);

    try {
      const childProcess = spawn(config.command, config.args, {
        cwd: this.workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...config.env,
        },
      });

      if (!childProcess.pid) {
        console.error(`[lsp-manager] Failed to spawn ${config.name}`);
        return null;
      }

      const runningServer: RunningServer = {
        config,
        process: childProcess,
        messageBuffer: Buffer.alloc(0),
        pendingCallbacks: new Map(),
      };

      this.runningServers.set(config.id, runningServer);

      // Handle stderr for debugging
      childProcess.stderr?.on('data', (data: Buffer) => {
        console.log(`[lsp-manager] ${config.name} stderr:`, data.toString());
      });

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        console.log(`[lsp-manager] ${config.name} exited with code ${code}, signal ${signal}`);
        this.runningServers.delete(config.id);
      });

      childProcess.on('error', (error) => {
        console.error(`[lsp-manager] ${config.name} error:`, error);
        this.runningServers.delete(config.id);
      });

      console.log(`[lsp-manager] ${config.name} started (pid: ${childProcess.pid})`);
      return childProcess;
    } catch (error) {
      console.error(`[lsp-manager] Error starting ${config.name}:`, error);
      return null;
    }
  }

  /**
   * Get a running server for a language
   */
  getServerForLanguage(languageId: string): ChildProcess | null {
    const config = this.getConfigForLanguage(languageId);
    if (!config) return null;

    const running = this.runningServers.get(config.id);
    if (!running || running.process.killed) return null;

    return running.process;
  }

  /**
   * Stop a specific language server
   */
  stopServer(serverId: string): void {
    const running = this.runningServers.get(serverId);
    if (!running) return;

    console.log(`[lsp-manager] Stopping ${running.config.name}...`);
    running.process.kill();
    this.runningServers.delete(serverId);
  }

  /**
   * Stop all running language servers
   */
  stopAll(): void {
    console.log('[lsp-manager] Stopping all language servers...');
    for (const [serverId] of this.runningServers) {
      this.stopServer(serverId);
    }
  }

  /**
   * Get status of all language servers
   */
  async getStatus(): Promise<LanguageServerStatus[]> {
    // Ensure availability is checked
    if (this.availabilityCache.size === 0) {
      await this.checkAvailability();
    }

    return this.configs.map((config) => ({
      id: config.id,
      name: config.name,
      languages: config.languages,
      available: this.availabilityCache.get(config.id) || false,
      running: this.runningServers.has(config.id) && !this.runningServers.get(config.id)!.process.killed,
    }));
  }

  /**
   * Get workspace root path
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}

/**
 * Create an LSP manager instance
 */
export function createLspManager(workspaceRoot: string): LspManager {
  return new LspManager(workspaceRoot);
}
