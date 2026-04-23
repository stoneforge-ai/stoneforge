/**
 * Plugin Executor Service
 *
 * This service executes plugins for stewards. Plugins enable custom automated
 * maintenance tasks via playbooks, scripts, or commands.
 *
 * TB-O23a: Plugin System for Stewards
 *
 * @module
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PlaybookId, Timestamp } from '@stoneforge/core';
import { createTimestamp } from '@stoneforge/core';
import type { QuarryAPI } from '@stoneforge/quarry';

// ============================================================================
// Plugin Types
// ============================================================================

/**
 * Plugin type discriminator
 */
export type PluginType = 'playbook' | 'script' | 'command';

/**
 * All valid plugin type values
 */
export const PluginTypeValues = ['playbook', 'script', 'command'] as const;

/**
 * Type guard for plugin type
 */
export function isPluginType(value: unknown): value is PluginType {
  return typeof value === 'string' && PluginTypeValues.includes(value as PluginType);
}

/**
 * Base plugin configuration shared by all plugin types
 */
interface BasePlugin {
  /** Unique name for this plugin within the steward */
  readonly name: string;
  /** Optional description of what this plugin does */
  readonly description?: string;
  /** Execution timeout in milliseconds (default: 5 minutes) */
  readonly timeout?: number;
  /** Whether to run this plugin on steward startup (default: false) */
  readonly runOnStartup?: boolean;
  /** Whether to continue executing subsequent plugins if this one fails (default: true) */
  readonly continueOnError?: boolean;
  /** Optional tags for categorizing plugins */
  readonly tags?: readonly string[];
}

/**
 * Plugin that executes a playbook
 */
export interface PlaybookPlugin extends BasePlugin {
  readonly type: 'playbook';
  /** The playbook ID to execute */
  readonly playbookId: PlaybookId;
  /** Variables to pass to the playbook */
  readonly variables?: Record<string, string>;
}

/**
 * Plugin that executes a script file
 */
export interface ScriptPlugin extends BasePlugin {
  readonly type: 'script';
  /** Path to the script (relative to workspace root or absolute) */
  readonly path: string;
  /** Arguments to pass to the script */
  readonly args?: readonly string[];
  /** Environment variables to set */
  readonly env?: Record<string, string>;
  /** Working directory (default: workspace root) */
  readonly cwd?: string;
}

/**
 * Plugin that executes a CLI command
 */
export interface CommandPlugin extends BasePlugin {
  readonly type: 'command';
  /** The command to execute (passed to shell) */
  readonly command: string;
  /** Working directory (default: workspace root) */
  readonly cwd?: string;
  /** Environment variables to set */
  readonly env?: Record<string, string>;
}

/**
 * Union type for all plugin configurations
 */
export type StewardPlugin = PlaybookPlugin | ScriptPlugin | CommandPlugin;

/**
 * Type guard for PlaybookPlugin
 */
export function isPlaybookPlugin(plugin: StewardPlugin): plugin is PlaybookPlugin {
  return plugin.type === 'playbook';
}

/**
 * Type guard for ScriptPlugin
 */
export function isScriptPlugin(plugin: StewardPlugin): plugin is ScriptPlugin {
  return plugin.type === 'script';
}

/**
 * Type guard for CommandPlugin
 */
export function isCommandPlugin(plugin: StewardPlugin): plugin is CommandPlugin {
  return plugin.type === 'command';
}

/**
 * Validates that a value is a valid StewardPlugin
 */
export function isValidPlugin(value: unknown): value is StewardPlugin {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;

  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return false;
  }

  if (!isPluginType(obj.type)) {
    return false;
  }

  switch (obj.type) {
    case 'playbook':
      return typeof obj.playbookId === 'string';
    case 'script':
      return typeof obj.path === 'string';
    case 'command':
      return typeof obj.command === 'string';
    default:
      return false;
  }
}

// ============================================================================
// Execution Result Types
// ============================================================================

/**
 * Result of executing a single plugin
 */
export interface PluginExecutionResult {
  /** Plugin name */
  readonly pluginName: string;
  /** Plugin type */
  readonly pluginType: PluginType;
  /** Whether execution succeeded */
  readonly success: boolean;
  /** Error message if failed */
  readonly error?: string;
  /** Standard output from execution */
  readonly stdout?: string;
  /** Standard error from execution */
  readonly stderr?: string;
  /** Exit code (for script/command plugins) */
  readonly exitCode?: number;
  /** Duration of execution in milliseconds */
  readonly durationMs: number;
  /** Items processed (if applicable) */
  readonly itemsProcessed?: number;
  /** Timestamp when execution started */
  readonly startedAt: Timestamp;
  /** Timestamp when execution completed */
  readonly completedAt: Timestamp;
}

/**
 * Result of executing multiple plugins
 */
export interface BatchPluginExecutionResult {
  /** Total number of plugins */
  readonly total: number;
  /** Number of successful executions */
  readonly succeeded: number;
  /** Number of failed executions */
  readonly failed: number;
  /** Number of skipped executions */
  readonly skipped: number;
  /** Individual plugin results */
  readonly results: readonly PluginExecutionResult[];
  /** Total duration in milliseconds */
  readonly durationMs: number;
  /** Whether all plugins succeeded */
  readonly allSucceeded: boolean;
}

/**
 * Options for executing plugins
 */
export interface PluginExecutionOptions {
  /** Working directory for script/command plugins */
  readonly workspaceRoot?: string;
  /** Default timeout in milliseconds (default: 5 minutes) */
  readonly defaultTimeout?: number;
  /** Additional environment variables */
  readonly env?: Record<string, string>;
  /** Context data passed to playbook plugins */
  readonly context?: Record<string, unknown>;
  /** Whether to stop on first error (default: false) */
  readonly stopOnError?: boolean;
}

// ============================================================================
// Built-in Plugin Definitions
// ============================================================================

/**
 * Built-in plugin: Garbage collect ephemeral workflows
 */
export const GcEphemeralTasksPlugin: CommandPlugin = {
  type: 'command',
  name: 'gc-ephemeral-tasks',
  description: 'Garbage collect old ephemeral workflows (older than 24 hours)',
  command: 'sf gc workflows --age 1',
  timeout: 60000, // 1 minute
  continueOnError: true,
  tags: ['gc', 'cleanup', 'maintenance'],
};

/**
 * Built-in plugin: Cleanup stale worktrees
 */
export const CleanupStaleWorktreesPlugin: CommandPlugin = {
  type: 'command',
  name: 'cleanup-stale-worktrees',
  description: 'Clean up worktrees that have been archived or abandoned',
  // Uses git worktree prune to clean up stale worktree references
  command: 'git worktree prune',
  timeout: 60000, // 1 minute
  continueOnError: true,
  tags: ['git', 'worktree', 'cleanup'],
};

/**
 * Built-in plugin: Garbage collect ephemeral workflows
 */
export const GcEphemeralWorkflowsPlugin: CommandPlugin = {
  type: 'command',
  name: 'gc-ephemeral-workflows',
  description: 'Garbage collect old ephemeral workflows (older than 24 hours)',
  command: 'sf gc workflows --age 1',
  timeout: 60000, // 1 minute
  continueOnError: true,
  tags: ['gc', 'cleanup', 'maintenance'],
};

/**
 * Built-in plugin: Health check agents
 * This is a placeholder - actual implementation would query agent statuses
 */
export const HealthCheckAgentsPlugin: CommandPlugin = {
  type: 'command',
  name: 'health-check-agents',
  description: 'Check health status of all registered agents',
  // Uses the sf CLI to list agents and check their status
  command: 'sf agent list --json',
  timeout: 30000, // 30 seconds
  continueOnError: true,
  tags: ['health', 'agents', 'monitoring'],
};

/**
 * All built-in plugins
 */
export const BuiltInPlugins: Record<string, StewardPlugin> = {
  'gc-ephemeral-tasks': GcEphemeralTasksPlugin,
  'cleanup-stale-worktrees': CleanupStaleWorktreesPlugin,
  'gc-ephemeral-workflows': GcEphemeralWorkflowsPlugin,
  'health-check-agents': HealthCheckAgentsPlugin,
};

/**
 * Get a built-in plugin by name
 */
export function getBuiltInPlugin(name: string): StewardPlugin | undefined {
  return BuiltInPlugins[name];
}

/**
 * List all built-in plugin names
 */
export function listBuiltInPlugins(): string[] {
  return Object.keys(BuiltInPlugins);
}

// ============================================================================
// Plugin Executor Interface
// ============================================================================

/**
 * Plugin Executor service interface
 */
export interface PluginExecutor {
  /**
   * Executes a single plugin
   */
  execute(
    plugin: StewardPlugin,
    options?: PluginExecutionOptions
  ): Promise<PluginExecutionResult>;

  /**
   * Executes multiple plugins in sequence
   */
  executeBatch(
    plugins: readonly StewardPlugin[],
    options?: PluginExecutionOptions
  ): Promise<BatchPluginExecutionResult>;

  /**
   * Validates a plugin configuration
   */
  validate(plugin: StewardPlugin): { valid: boolean; errors: string[] };

  /**
   * Gets a built-in plugin by name
   */
  getBuiltIn(name: string): StewardPlugin | undefined;

  /**
   * Lists all built-in plugins
   */
  listBuiltIns(): string[];
}

// ============================================================================
// Plugin Executor Implementation
// ============================================================================

/**
 * Default configuration
 */
const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_OUTPUT_LENGTH = 100000; // 100KB max output capture

/**
 * Implementation of the Plugin Executor service
 */
export class PluginExecutorImpl implements PluginExecutor {
  private readonly api?: QuarryAPI;
  private readonly defaultWorkspaceRoot: string;

  constructor(options?: { api?: QuarryAPI; workspaceRoot?: string }) {
    this.api = options?.api;
    this.defaultWorkspaceRoot = options?.workspaceRoot ?? process.cwd();
  }

  async execute(
    plugin: StewardPlugin,
    options?: PluginExecutionOptions
  ): Promise<PluginExecutionResult> {
    const startedAt = createTimestamp();
    const startTime = Date.now();

    try {
      const validation = this.validate(plugin);
      if (!validation.valid) {
        return {
          pluginName: plugin.name,
          pluginType: plugin.type,
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          durationMs: Date.now() - startTime,
          startedAt,
          completedAt: createTimestamp(),
        };
      }

      switch (plugin.type) {
        case 'playbook':
          return this.executePlaybook(plugin, options, startedAt, startTime);
        case 'script':
          return this.executeScript(plugin, options, startedAt, startTime);
        case 'command':
          return this.executeCommand(plugin, options, startedAt, startTime);
      }
    } catch (error) {
      return {
        pluginName: plugin.name,
        pluginType: plugin.type,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        startedAt,
        completedAt: createTimestamp(),
      };
    }
  }

  async executeBatch(
    plugins: readonly StewardPlugin[],
    options?: PluginExecutionOptions
  ): Promise<BatchPluginExecutionResult> {
    const startTime = Date.now();
    const results: PluginExecutionResult[] = [];
    let skipped = 0;
    let shouldStop = false;

    for (const plugin of plugins) {
      if (shouldStop) {
        skipped++;
        continue;
      }

      const result = await this.execute(plugin, options);
      results.push(result);

      if (!result.success) {
        const continueOnError = plugin.continueOnError ?? true;
        if (!continueOnError || options?.stopOnError) {
          shouldStop = true;
        }
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      total: plugins.length,
      succeeded,
      failed,
      skipped,
      results,
      durationMs: Date.now() - startTime,
      allSucceeded: failed === 0 && skipped === 0,
    };
  }

  validate(plugin: StewardPlugin): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!plugin.name || typeof plugin.name !== 'string') {
      errors.push('Plugin name is required and must be a string');
    }

    if (!isPluginType(plugin.type)) {
      errors.push(`Invalid plugin type: ${plugin.type}`);
      return { valid: false, errors };
    }

    switch (plugin.type) {
      case 'playbook':
        if (!plugin.playbookId || typeof plugin.playbookId !== 'string') {
          errors.push('Playbook plugin requires a playbookId');
        }
        break;
      case 'script':
        if (!plugin.path || typeof plugin.path !== 'string') {
          errors.push('Script plugin requires a path');
        }
        break;
      case 'command':
        if (!plugin.command || typeof plugin.command !== 'string') {
          errors.push('Command plugin requires a command');
        }
        break;
    }

    if (plugin.timeout !== undefined) {
      if (typeof plugin.timeout !== 'number' || plugin.timeout <= 0) {
        errors.push('Timeout must be a positive number');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getBuiltIn(name: string): StewardPlugin | undefined {
    return getBuiltInPlugin(name);
  }

  listBuiltIns(): string[] {
    return listBuiltInPlugins();
  }

  // ----------------------------------------
  // Private Execution Methods
  // ----------------------------------------

  private async executePlaybook(
    plugin: PlaybookPlugin,
    _options: PluginExecutionOptions | undefined,
    startedAt: Timestamp,
    startTime: number
  ): Promise<PluginExecutionResult> {
    // Playbook execution requires the API
    if (!this.api) {
      return {
        pluginName: plugin.name,
        pluginType: 'playbook',
        success: false,
        error: 'Playbook execution requires QuarryAPI to be provided',
        durationMs: Date.now() - startTime,
        startedAt,
        completedAt: createTimestamp(),
      };
    }

    try {
      // Look up the playbook
      const playbook = await this.api.get(plugin.playbookId);
      if (!playbook) {
        return {
          pluginName: plugin.name,
          pluginType: 'playbook',
          success: false,
          error: `Playbook not found: ${plugin.playbookId}`,
          durationMs: Date.now() - startTime,
          startedAt,
          completedAt: createTimestamp(),
        };
      }

      // For now, we'll just report that the playbook was found
      // Full playbook execution would require the create workflow system
      return {
        pluginName: plugin.name,
        pluginType: 'playbook',
        success: true,
        stdout: `Playbook ${plugin.playbookId} found. Full execution requires workflow system.`,
        durationMs: Date.now() - startTime,
        startedAt,
        completedAt: createTimestamp(),
      };
    } catch (error) {
      return {
        pluginName: plugin.name,
        pluginType: 'playbook',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        startedAt,
        completedAt: createTimestamp(),
      };
    }
  }

  private async executeScript(
    plugin: ScriptPlugin,
    options: PluginExecutionOptions | undefined,
    startedAt: Timestamp,
    startTime: number
  ): Promise<PluginExecutionResult> {
    const workspaceRoot = options?.workspaceRoot ?? this.defaultWorkspaceRoot;
    const cwd = plugin.cwd ?? workspaceRoot;
    const timeout = plugin.timeout ?? options?.defaultTimeout ?? DEFAULT_TIMEOUT;

    // Resolve script path
    const scriptPath = path.isAbsolute(plugin.path)
      ? plugin.path
      : path.join(workspaceRoot, plugin.path);

    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      return {
        pluginName: plugin.name,
        pluginType: 'script',
        success: false,
        error: `Script not found: ${scriptPath}`,
        durationMs: Date.now() - startTime,
        startedAt,
        completedAt: createTimestamp(),
      };
    }

    // Build environment
    const env = {
      ...process.env,
      ...options?.env,
      ...plugin.env,
    };

    // Build command
    const args = plugin.args ?? [];
    const command = `"${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`.trim();

    return this.runShellCommand(
      plugin.name,
      'script',
      command,
      cwd,
      env,
      timeout,
      startedAt,
      startTime
    );
  }

  private async executeCommand(
    plugin: CommandPlugin,
    options: PluginExecutionOptions | undefined,
    startedAt: Timestamp,
    startTime: number
  ): Promise<PluginExecutionResult> {
    const workspaceRoot = options?.workspaceRoot ?? this.defaultWorkspaceRoot;
    const cwd = plugin.cwd ?? workspaceRoot;
    const timeout = plugin.timeout ?? options?.defaultTimeout ?? DEFAULT_TIMEOUT;

    // Build environment
    const env = {
      ...process.env,
      ...options?.env,
      ...plugin.env,
    };

    return this.runShellCommand(
      plugin.name,
      'command',
      plugin.command,
      cwd,
      env,
      timeout,
      startedAt,
      startTime
    );
  }

  private async runShellCommand(
    pluginName: string,
    pluginType: PluginType,
    command: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeout: number,
    startedAt: Timestamp,
    startTime: number
  ): Promise<PluginExecutionResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(command, {
        shell: true,
        cwd,
        env,
        detached: true,
      });

      const killProcessGroup = (signal: NodeJS.Signals) => {
        try {
          // Kill the entire process group (shell + all children)
          process.kill(-child.pid!, signal);
        } catch {
          // Fallback to killing just the child
          try { child.kill(signal); } catch {}
        }
      };

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        killProcessGroup('SIGTERM');
        // Force kill after grace period in case SIGTERM is ignored
        setTimeout(() => killProcessGroup('SIGKILL'), 500);
      }, timeout);

      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= MAX_OUTPUT_LENGTH) {
          stdout += chunk;
        }
      });

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= MAX_OUTPUT_LENGTH) {
          stderr += chunk;
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        resolve({
          pluginName,
          pluginType,
          success: false,
          error: error.message,
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
          durationMs: Date.now() - startTime,
          startedAt,
          completedAt: createTimestamp(),
        });
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);

        if (timedOut) {
          resolve({
            pluginName,
            pluginType,
            success: false,
            error: `Execution timed out after ${timeout}ms`,
            stdout: stdout.trim() || undefined,
            stderr: stderr.trim() || undefined,
            exitCode: code ?? undefined,
            durationMs: Date.now() - startTime,
            startedAt,
            completedAt: createTimestamp(),
          });
          return;
        }

        const success = code === 0;
        resolve({
          pluginName,
          pluginType,
          success,
          error: success ? undefined : `Command exited with code ${code}`,
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
          exitCode: code ?? undefined,
          durationMs: Date.now() - startTime,
          startedAt,
          completedAt: createTimestamp(),
        });
      });
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a PluginExecutor instance
 */
export function createPluginExecutor(options?: {
  api?: QuarryAPI;
  workspaceRoot?: string;
}): PluginExecutor {
  return new PluginExecutorImpl(options);
}
