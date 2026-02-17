/**
 * LSP Manager Service
 *
 * Manages language server processes for multi-language LSP support.
 * Spawns language servers on demand and manages their lifecycle.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createLogger } from '@stoneforge/smithy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = createLogger('lsp-manager');

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
 * Get the path to node_modules/.bin for locally installed binaries
 */
function getLocalBinPath(): string {
  // Navigate from src/services to the package root, then to node_modules/.bin
  return resolve(__dirname, '../../node_modules/.bin');
}

/**
 * Default language server configurations
 */
function createDefaultConfigs(): LanguageServerConfig[] {
  const localBin = getLocalBinPath();

  return [
    // TypeScript/JavaScript
    {
      id: 'typescript',
      name: 'TypeScript Language Server',
      command: resolve(localBin, 'typescript-language-server'),
      args: ['--stdio'],
      languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
      isAvailable: async () => existsSync(resolve(localBin, 'typescript-language-server')),
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
      command: resolve(localBin, 'vscode-css-language-server'),
      args: ['--stdio'],
      languages: ['css', 'scss', 'less'],
      isAvailable: async () => existsSync(resolve(localBin, 'vscode-css-language-server')),
    },
    // HTML
    {
      id: 'html',
      name: 'HTML Language Server',
      command: resolve(localBin, 'vscode-html-language-server'),
      args: ['--stdio'],
      languages: ['html'],
      isAvailable: async () => existsSync(resolve(localBin, 'vscode-html-language-server')),
    },
    // JSON
    {
      id: 'json',
      name: 'JSON Language Server',
      command: resolve(localBin, 'vscode-json-language-server'),
      args: ['--stdio'],
      languages: ['json', 'jsonc'],
      isAvailable: async () => existsSync(resolve(localBin, 'vscode-json-language-server')),
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

    logger.info('Server availability:');
    for (const { id, available } of results) {
      const config = this.configs.find((c) => c.id === id);
      logger.debug(`  - ${config?.name || id}: ${available ? '✓ available' : '✗ not found'}`);
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
      logger.debug(`No language server configured for: ${languageId}`);
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
      logger.debug(`Server not available: ${config.name}`);
      return null;
    }

    logger.info(`Starting ${config.name}...`);

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
        logger.error(`Failed to spawn ${config.name}`);
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
        logger.debug(`${config.name} stderr:`, data.toString());
      });

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        logger.debug(`${config.name} exited with code ${code}, signal ${signal}`);
        this.runningServers.delete(config.id);
      });

      childProcess.on('error', (error) => {
        logger.error(`${config.name} error:`, error);
        this.runningServers.delete(config.id);
      });

      logger.info(`${config.name} started (pid: ${childProcess.pid})`);
      return childProcess;
    } catch (error) {
      logger.error(`Error starting ${config.name}:`, error);
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

    logger.info(`Stopping ${running.config.name}...`);
    running.process.kill();
    this.runningServers.delete(serverId);
  }

  /**
   * Stop all running language servers
   */
  stopAll(): void {
    logger.info('Stopping all language servers...');
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
