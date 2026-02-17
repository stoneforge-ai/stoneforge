/**
 * Config Command Tests
 *
 * Tests for the config CLI commands (show, set, unset).
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configCommand } from './config.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { clearConfigCache, loadConfig } from '../../config/index.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_config_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const CONFIG_PATH = join(STONEFORGE_DIR, 'config.yaml');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

function writeTestConfig(content: string): void {
  writeFileSync(CONFIG_PATH, content);
}

// ============================================================================
// Setup / Teardown
// ============================================================================

// Store original env for restoration
let originalStoneforgeRoot: string | undefined;

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });

  // Create a minimal config file
  writeTestConfig(`# Test configuration
actor: test-user
database: test.db
sync:
  auto_export: false
`);

  // Clear STONEFORGE_ROOT so tests use test directory, not main workspace
  originalStoneforgeRoot = process.env.STONEFORGE_ROOT;
  delete process.env.STONEFORGE_ROOT;

  // Clear config cache and reload from test directory
  clearConfigCache();
  // Change to test directory temporarily for config discovery
  const originalCwd = process.cwd();
  process.chdir(TEST_DIR);
  loadConfig({ skipEnv: true });
  process.chdir(originalCwd);
});

afterEach(() => {
  // Restore STONEFORGE_ROOT
  if (originalStoneforgeRoot !== undefined) {
    process.env.STONEFORGE_ROOT = originalStoneforgeRoot;
  }
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  clearConfigCache();
});

// ============================================================================
// Config Show Tests
// ============================================================================

describe('config show command', () => {
  test('shows all configuration', async () => {
    const options = createTestOptions();
    const result = await configCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('shows specific value by path', async () => {
    // Load config from test directory
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.show.handler!(['actor'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'actor',
      value: 'test-user',
      source: expect.any(String),
    });
  });

  test('shows nested value by path', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.show.handler!(['sync.autoExport'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'sync.autoExport',
      value: false,
      source: expect.any(String),
    });
  });

  test('rejects invalid configuration key', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.show.handler!(['invalidkey'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Unknown configuration key: invalidkey');
    expect(result.error).toContain('Valid keys:');
  });

  test('rejects typo in nested configuration key', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.show.handler!(['sync.autoexport'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Unknown configuration key: sync.autoexport');
  });

  test('returns JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await configCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// Config Set Tests
// ============================================================================

describe('config set command', () => {
  test('fails without path and value arguments', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with only path argument', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['actor'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('rejects invalid configuration key', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['invalidkey', 'somevalue'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Unknown configuration key: invalidkey');
    expect(result.error).toContain('Valid keys:');
    expect(result.error).toContain('actor');
    expect(result.error).toContain('database');
    expect(result.error).toContain('sync.autoExport');
  });

  test('rejects typo in nested configuration key', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['sync.autoexport', 'true'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Unknown configuration key: sync.autoexport');
  });

  test('rejects non-existent nested key', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['sync.invalidField', 'value'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Unknown configuration key: sync.invalidField');
  });

  test('sets a string value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['actor', 'new-agent'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'actor',
      value: 'new-agent',
    });
  });

  test('sets a boolean value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['sync.autoExport', 'true'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'sync.autoExport',
      value: true,
    });
  });

  test('sets a number value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['sync.exportDebounce', '1000'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'sync.exportDebounce',
      value: 1000,
    });
  });
});

// ============================================================================
// Config Unset Tests
// ============================================================================

describe('config unset command', () => {
  test('fails without path argument', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.unset.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('unsets a value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.unset.handler!(['actor'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'actor',
    });
  });

  test('rejects invalid configuration key', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.unset.handler!(['invalidkey'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Unknown configuration key: invalidkey');
    expect(result.error).toContain('Valid keys:');
  });

  test('rejects typo in configuration key', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.unset.handler!(['actorr'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Unknown configuration key: actorr');
  });
});

// ============================================================================
// Config Edit Tests
// ============================================================================

describe('config edit command', () => {
  test('has edit subcommand registered', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.edit).toBeDefined();
    expect(configCommand.subcommands!.edit.name).toBe('edit');
  });

  test('has help text for edit subcommand', () => {
    expect(configCommand.subcommands!.edit.help).toBeDefined();
    expect(configCommand.subcommands!.edit.help).toContain('Open');
    expect(configCommand.subcommands!.edit.help).toContain('editor');
  });

  test('has usage text for edit subcommand', () => {
    expect(configCommand.subcommands!.edit.usage).toBeDefined();
    expect(configCommand.subcommands!.edit.usage).toContain('edit');
  });

  test('creates config file if it does not exist', async () => {
    // Remove the config file
    rmSync(CONFIG_PATH);
    expect(existsSync(CONFIG_PATH)).toBe(false);

    const originalCwd = process.cwd();
    const originalEditor = process.env.EDITOR;
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    // Set EDITOR to 'true' which exits immediately with success
    process.env.EDITOR = 'true';

    try {
      const options = createTestOptions();
      const result = await configCommand.subcommands!.edit.handler!([], options);

      // The config file should now exist
      expect(existsSync(CONFIG_PATH)).toBe(true);
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
    } finally {
      process.chdir(originalCwd);
      if (originalEditor !== undefined) {
        process.env.EDITOR = originalEditor;
      } else {
        delete process.env.EDITOR;
      }
    }
  });

  test('opens editor with existing config file', async () => {
    const originalCwd = process.cwd();
    const originalEditor = process.env.EDITOR;
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    // Set EDITOR to 'true' which exits immediately with success
    process.env.EDITOR = 'true';

    try {
      const options = createTestOptions();
      const result = await configCommand.subcommands!.edit.handler!([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toEqual({
        editor: 'true',
        path: expect.stringContaining('config.yaml'),
      });
    } finally {
      process.chdir(originalCwd);
      if (originalEditor !== undefined) {
        process.env.EDITOR = originalEditor;
      } else {
        delete process.env.EDITOR;
      }
    }
  });

  test('respects VISUAL environment variable', async () => {
    const originalCwd = process.cwd();
    const originalEditor = process.env.EDITOR;
    const originalVisual = process.env.VISUAL;
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    // Clear EDITOR and set VISUAL
    delete process.env.EDITOR;
    process.env.VISUAL = 'true';

    try {
      const options = createTestOptions();
      const result = await configCommand.subcommands!.edit.handler!([], options);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toEqual({
        editor: 'true',
        path: expect.stringContaining('config.yaml'),
      });
    } finally {
      process.chdir(originalCwd);
      if (originalEditor !== undefined) {
        process.env.EDITOR = originalEditor;
      } else {
        delete process.env.EDITOR;
      }
      if (originalVisual !== undefined) {
        process.env.VISUAL = originalVisual;
      } else {
        delete process.env.VISUAL;
      }
    }
  });

  test('returns error when editor fails', async () => {
    const originalCwd = process.cwd();
    const originalEditor = process.env.EDITOR;
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    // Set EDITOR to 'false' which exits with failure
    process.env.EDITOR = 'false';

    try {
      const options = createTestOptions();
      const result = await configCommand.subcommands!.edit.handler!([], options);

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.error).toContain('exited with status');
    } finally {
      process.chdir(originalCwd);
      if (originalEditor !== undefined) {
        process.env.EDITOR = originalEditor;
      } else {
        delete process.env.EDITOR;
      }
    }
  });
});

// ============================================================================
// Subcommand Registration Tests
// ============================================================================

describe('config command structure', () => {
  test('has show subcommand', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.show).toBeDefined();
    expect(configCommand.subcommands!.show.name).toBe('show');
  });

  test('has set subcommand', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.set).toBeDefined();
    expect(configCommand.subcommands!.set.name).toBe('set');
  });

  test('has unset subcommand', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.unset).toBeDefined();
    expect(configCommand.subcommands!.unset.name).toBe('unset');
  });

  test('has edit subcommand', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.edit).toBeDefined();
    expect(configCommand.subcommands!.edit.name).toBe('edit');
  });

  test('default handler shows config', async () => {
    // The main config command handler should behave like config show
    const options = createTestOptions();
    const result = await configCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// Help Text Tests
// ============================================================================

describe('config command help', () => {
  test('has help text for main command', () => {
    expect(configCommand.help).toBeDefined();
    expect(configCommand.help).toContain('Manage');
  });

  test('has help text for show subcommand', () => {
    expect(configCommand.subcommands!.show.help).toBeDefined();
    expect(configCommand.subcommands!.show.help).toContain('Display');
  });

  test('has help text for set subcommand', () => {
    expect(configCommand.subcommands!.set.help).toBeDefined();
    expect(configCommand.subcommands!.set.help).toContain('Set');
  });

  test('has help text for unset subcommand', () => {
    expect(configCommand.subcommands!.unset.help).toBeDefined();
    expect(configCommand.subcommands!.unset.help).toContain('Remove');
  });

  test('has usage text for all commands', () => {
    expect(configCommand.usage).toBeDefined();
    expect(configCommand.subcommands!.show.usage).toBeDefined();
    expect(configCommand.subcommands!.set.usage).toBeDefined();
    expect(configCommand.subcommands!.unset.usage).toBeDefined();
  });
});
