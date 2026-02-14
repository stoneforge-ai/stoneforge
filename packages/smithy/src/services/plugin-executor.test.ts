/**
 * Plugin Executor Service Tests
 *
 * Tests for TB-O23a: Plugin System for Stewards
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createPluginExecutor,
  PluginExecutorImpl,
  // Types
  type StewardPlugin,
  type PlaybookPlugin,
  type ScriptPlugin,
  type CommandPlugin,
  type PluginExecutionOptions,
  type PluginExecutionResult,
  type BatchPluginExecutionResult,
  // Type guards
  isPluginType,
  isPlaybookPlugin,
  isScriptPlugin,
  isCommandPlugin,
  isValidPlugin,
  // Built-in plugins
  BuiltInPlugins,
  GcEphemeralTasksPlugin,
  CleanupStaleWorktreesPlugin,
  GcEphemeralWorkflowsPlugin,
  HealthCheckAgentsPlugin,
  getBuiltInPlugin,
  listBuiltInPlugins,
} from './plugin-executor.js';

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-executor-test-'));
  return dir;
}

function cleanup(): void {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Plugin Type Guards', () => {
  describe('isPluginType', () => {
    it('should return true for valid plugin types', () => {
      expect(isPluginType('playbook')).toBe(true);
      expect(isPluginType('script')).toBe(true);
      expect(isPluginType('command')).toBe(true);
    });

    it('should return false for invalid plugin types', () => {
      expect(isPluginType('invalid')).toBe(false);
      expect(isPluginType('')).toBe(false);
      expect(isPluginType(null)).toBe(false);
      expect(isPluginType(undefined)).toBe(false);
      expect(isPluginType(123)).toBe(false);
    });
  });

  describe('isPlaybookPlugin', () => {
    it('should identify playbook plugins', () => {
      const plugin: PlaybookPlugin = {
        type: 'playbook',
        name: 'test',
        playbookId: 'pb-123' as any,
      };
      expect(isPlaybookPlugin(plugin)).toBe(true);
    });

    it('should reject non-playbook plugins', () => {
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'test',
        command: 'echo hello',
      };
      expect(isPlaybookPlugin(plugin)).toBe(false);
    });
  });

  describe('isScriptPlugin', () => {
    it('should identify script plugins', () => {
      const plugin: ScriptPlugin = {
        type: 'script',
        name: 'test',
        path: './test.sh',
      };
      expect(isScriptPlugin(plugin)).toBe(true);
    });

    it('should reject non-script plugins', () => {
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'test',
        command: 'echo hello',
      };
      expect(isScriptPlugin(plugin)).toBe(false);
    });
  });

  describe('isCommandPlugin', () => {
    it('should identify command plugins', () => {
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'test',
        command: 'echo hello',
      };
      expect(isCommandPlugin(plugin)).toBe(true);
    });

    it('should reject non-command plugins', () => {
      const plugin: ScriptPlugin = {
        type: 'script',
        name: 'test',
        path: './test.sh',
      };
      expect(isCommandPlugin(plugin)).toBe(false);
    });
  });

  describe('isValidPlugin', () => {
    it('should validate playbook plugins', () => {
      const valid: PlaybookPlugin = {
        type: 'playbook',
        name: 'test',
        playbookId: 'pb-123' as any,
      };
      expect(isValidPlugin(valid)).toBe(true);
    });

    it('should validate script plugins', () => {
      const valid: ScriptPlugin = {
        type: 'script',
        name: 'test',
        path: './script.sh',
      };
      expect(isValidPlugin(valid)).toBe(true);
    });

    it('should validate command plugins', () => {
      const valid: CommandPlugin = {
        type: 'command',
        name: 'test',
        command: 'echo hello',
      };
      expect(isValidPlugin(valid)).toBe(true);
    });

    it('should reject plugins with missing name', () => {
      const invalid = {
        type: 'command',
        command: 'echo hello',
      };
      expect(isValidPlugin(invalid)).toBe(false);
    });

    it('should reject plugins with invalid type', () => {
      const invalid = {
        type: 'invalid',
        name: 'test',
        command: 'echo hello',
      };
      expect(isValidPlugin(invalid)).toBe(false);
    });

    it('should reject playbook plugins without playbookId', () => {
      const invalid = {
        type: 'playbook',
        name: 'test',
      };
      expect(isValidPlugin(invalid)).toBe(false);
    });

    it('should reject script plugins without path', () => {
      const invalid = {
        type: 'script',
        name: 'test',
      };
      expect(isValidPlugin(invalid)).toBe(false);
    });

    it('should reject command plugins without command', () => {
      const invalid = {
        type: 'command',
        name: 'test',
      };
      expect(isValidPlugin(invalid)).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(isValidPlugin(null)).toBe(false);
      expect(isValidPlugin(undefined)).toBe(false);
    });
  });
});

// ============================================================================
// Built-in Plugin Tests
// ============================================================================

describe('Built-in Plugins', () => {
  describe('Plugin Definitions', () => {
    it('should define gc-ephemeral-tasks plugin', () => {
      expect(GcEphemeralTasksPlugin.type).toBe('command');
      expect(GcEphemeralTasksPlugin.name).toBe('gc-ephemeral-tasks');
      expect(GcEphemeralTasksPlugin.command).toContain('sf gc workflows');
    });

    it('should define cleanup-stale-worktrees plugin', () => {
      expect(CleanupStaleWorktreesPlugin.type).toBe('command');
      expect(CleanupStaleWorktreesPlugin.name).toBe('cleanup-stale-worktrees');
      expect(CleanupStaleWorktreesPlugin.command).toContain('git worktree');
    });

    it('should define gc-ephemeral-workflows plugin', () => {
      expect(GcEphemeralWorkflowsPlugin.type).toBe('command');
      expect(GcEphemeralWorkflowsPlugin.name).toBe('gc-ephemeral-workflows');
      expect(GcEphemeralWorkflowsPlugin.command).toContain('sf gc workflows');
    });

    it('should define health-check-agents plugin', () => {
      expect(HealthCheckAgentsPlugin.type).toBe('command');
      expect(HealthCheckAgentsPlugin.name).toBe('health-check-agents');
      expect(HealthCheckAgentsPlugin.command).toContain('sf agent list');
    });
  });

  describe('getBuiltInPlugin', () => {
    it('should return built-in plugin by name', () => {
      const plugin = getBuiltInPlugin('gc-ephemeral-tasks');
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe('gc-ephemeral-tasks');
    });

    it('should return undefined for unknown plugin', () => {
      const plugin = getBuiltInPlugin('unknown-plugin');
      expect(plugin).toBeUndefined();
    });
  });

  describe('listBuiltInPlugins', () => {
    it('should list all built-in plugin names', () => {
      const names = listBuiltInPlugins();
      expect(names).toContain('gc-ephemeral-tasks');
      expect(names).toContain('cleanup-stale-worktrees');
      expect(names).toContain('gc-ephemeral-workflows');
      expect(names).toContain('health-check-agents');
      expect(names.length).toBe(4);
    });
  });

  describe('BuiltInPlugins registry', () => {
    it('should contain all built-in plugins', () => {
      expect(Object.keys(BuiltInPlugins)).toHaveLength(4);
      expect(BuiltInPlugins['gc-ephemeral-tasks']).toBeDefined();
      expect(BuiltInPlugins['cleanup-stale-worktrees']).toBeDefined();
      expect(BuiltInPlugins['gc-ephemeral-workflows']).toBeDefined();
      expect(BuiltInPlugins['health-check-agents']).toBeDefined();
    });
  });
});

// ============================================================================
// Plugin Executor Tests
// ============================================================================

describe('PluginExecutor', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup();
  });

  describe('createPluginExecutor', () => {
    it('should create a plugin executor instance', () => {
      const executor = createPluginExecutor();
      expect(executor).toBeInstanceOf(PluginExecutorImpl);
    });

    it('should accept workspaceRoot option', () => {
      const executor = createPluginExecutor({ workspaceRoot: '/tmp' });
      expect(executor).toBeInstanceOf(PluginExecutorImpl);
    });
  });

  describe('validate', () => {
    it('should validate valid command plugin', () => {
      const executor = createPluginExecutor();
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'test',
        command: 'echo hello',
      };
      const result = executor.validate(plugin);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject plugin without name', () => {
      const executor = createPluginExecutor();
      const plugin = {
        type: 'command',
        name: '',
        command: 'echo hello',
      } as CommandPlugin;
      const result = executor.validate(plugin);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject command plugin without command', () => {
      const executor = createPluginExecutor();
      const plugin = {
        type: 'command',
        name: 'test',
        command: '',
      } as CommandPlugin;
      const result = executor.validate(plugin);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid timeout', () => {
      const executor = createPluginExecutor();
      const plugin = {
        type: 'command',
        name: 'test',
        command: 'echo hello',
        timeout: -1,
      } as CommandPlugin;
      const result = executor.validate(plugin);
      expect(result.valid).toBe(false);
    });
  });

  describe('getBuiltIn', () => {
    it('should return built-in plugin', () => {
      const executor = createPluginExecutor();
      const plugin = executor.getBuiltIn('gc-ephemeral-tasks');
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe('gc-ephemeral-tasks');
    });

    it('should return undefined for unknown plugin', () => {
      const executor = createPluginExecutor();
      const plugin = executor.getBuiltIn('unknown');
      expect(plugin).toBeUndefined();
    });
  });

  describe('listBuiltIns', () => {
    it('should list all built-in plugins', () => {
      const executor = createPluginExecutor();
      const names = executor.listBuiltIns();
      expect(names).toContain('gc-ephemeral-tasks');
      expect(names.length).toBeGreaterThan(0);
    });
  });

  describe('execute - command plugin', () => {
    it('should execute a simple command', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'echo-test',
        command: 'echo "hello world"',
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(true);
      expect(result.pluginName).toBe('echo-test');
      expect(result.pluginType).toBe('command');
      expect(result.stdout).toContain('hello world');
      expect(result.exitCode).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should capture stderr', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'stderr-test',
        command: 'echo "error message" >&2',
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(true);
      expect(result.stderr).toContain('error message');
    });

    it('should report failure for non-zero exit code', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'fail-test',
        command: 'exit 1',
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('exited with code 1');
    });

    it('should use custom working directory', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir);

      const plugin: CommandPlugin = {
        type: 'command',
        name: 'cwd-test',
        command: 'pwd',
        cwd: subDir,
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(true);
      // Handle potential symlinks on macOS
      expect(result.stdout).toMatch(/subdir/);
    });

    it('should use custom environment variables', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'env-test',
        command: 'echo $TEST_VAR',
        env: { TEST_VAR: 'test_value' },
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('test_value');
    });

    it('should timeout long-running commands', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin: CommandPlugin = {
        type: 'command',
        name: 'timeout-test',
        command: 'sleep 10',
        timeout: 100, // 100ms timeout
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('execute - script plugin', () => {
    it('should execute a script file', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });

      // Create a test script
      const scriptPath = path.join(tempDir, 'test-script.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\necho "script output"', { mode: 0o755 });

      const plugin: ScriptPlugin = {
        type: 'script',
        name: 'script-test',
        path: 'test-script.sh',
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(true);
      expect(result.pluginType).toBe('script');
      expect(result.stdout).toContain('script output');
    });

    it('should pass arguments to script', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });

      const scriptPath = path.join(tempDir, 'args-script.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\necho "args: $1 $2"', { mode: 0o755 });

      const plugin: ScriptPlugin = {
        type: 'script',
        name: 'args-test',
        path: 'args-script.sh',
        args: ['arg1', 'arg2'],
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('args: arg1 arg2');
    });

    it('should fail if script not found', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin: ScriptPlugin = {
        type: 'script',
        name: 'missing-script',
        path: 'nonexistent.sh',
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Script not found');
    });

    it('should handle absolute script paths', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });

      const scriptPath = path.join(tempDir, 'absolute-script.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\necho "absolute path"', { mode: 0o755 });

      const plugin: ScriptPlugin = {
        type: 'script',
        name: 'absolute-test',
        path: scriptPath, // absolute path
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('absolute path');
    });
  });

  describe('execute - playbook plugin', () => {
    it('should fail without API', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin: PlaybookPlugin = {
        type: 'playbook',
        name: 'playbook-test',
        playbookId: 'pb-123' as any,
      };
      const result = await executor.execute(plugin);
      expect(result.success).toBe(false);
      expect(result.error).toContain('QuarryAPI');
    });
  });

  describe('execute - validation failure', () => {
    it('should fail for invalid plugin', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugin = {
        type: 'command',
        name: '',
        command: 'echo hello',
      } as CommandPlugin;
      const result = await executor.execute(plugin);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });

  describe('executeBatch', () => {
    it('should execute multiple plugins in sequence', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugins: CommandPlugin[] = [
        { type: 'command', name: 'first', command: 'echo "first"' },
        { type: 'command', name: 'second', command: 'echo "second"' },
        { type: 'command', name: 'third', command: 'echo "third"' },
      ];
      const result = await executor.executeBatch(plugins);
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.allSucceeded).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].stdout).toContain('first');
      expect(result.results[1].stdout).toContain('second');
      expect(result.results[2].stdout).toContain('third');
    });

    it('should continue on error by default', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugins: CommandPlugin[] = [
        { type: 'command', name: 'first', command: 'echo "first"' },
        { type: 'command', name: 'fail', command: 'exit 1' },
        { type: 'command', name: 'third', command: 'echo "third"' },
      ];
      const result = await executor.executeBatch(plugins);
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.allSucceeded).toBe(false);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[2].success).toBe(true);
    });

    it('should stop on error when continueOnError is false', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugins: CommandPlugin[] = [
        { type: 'command', name: 'first', command: 'echo "first"' },
        { type: 'command', name: 'fail', command: 'exit 1', continueOnError: false },
        { type: 'command', name: 'third', command: 'echo "third"' },
      ];
      const result = await executor.executeBatch(plugins);
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.allSucceeded).toBe(false);
    });

    it('should stop on error when stopOnError option is true', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugins: CommandPlugin[] = [
        { type: 'command', name: 'first', command: 'echo "first"' },
        { type: 'command', name: 'fail', command: 'exit 1' },
        { type: 'command', name: 'third', command: 'echo "third"' },
      ];
      const result = await executor.executeBatch(plugins, { stopOnError: true });
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should report total duration', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugins: CommandPlugin[] = [
        { type: 'command', name: 'first', command: 'echo "first"' },
        { type: 'command', name: 'second', command: 'echo "second"' },
      ];
      const result = await executor.executeBatch(plugins);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass options to all plugins', async () => {
      const executor = createPluginExecutor({ workspaceRoot: tempDir });
      const plugins: CommandPlugin[] = [
        { type: 'command', name: 'env1', command: 'echo $BATCH_VAR' },
        { type: 'command', name: 'env2', command: 'echo $BATCH_VAR' },
      ];
      const result = await executor.executeBatch(plugins, {
        env: { BATCH_VAR: 'batch_value' },
      });
      expect(result.allSucceeded).toBe(true);
      expect(result.results[0].stdout).toContain('batch_value');
      expect(result.results[1].stdout).toContain('batch_value');
    });
  });
});

// ============================================================================
// Integration with StewardMetadata Tests
// ============================================================================

describe('Plugin Integration with Steward', () => {
  it('should support plugins array in steward configuration', () => {
    // This test verifies the types work together
    const plugins: StewardPlugin[] = [
      GcEphemeralTasksPlugin,
      CleanupStaleWorktreesPlugin,
      {
        type: 'script',
        name: 'custom-cleanup',
        path: './scripts/cleanup.sh',
        timeout: 60000,
        runOnStartup: true,
      },
      {
        type: 'playbook',
        name: 'maintenance',
        playbookId: 'pb-maintenance-001' as any,
        variables: { env: 'production' },
      },
    ];

    // Verify all plugins are valid
    plugins.forEach(p => expect(isValidPlugin(p)).toBe(true));
  });
});
