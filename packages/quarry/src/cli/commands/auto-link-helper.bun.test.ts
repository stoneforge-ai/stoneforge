/**
 * Auto-Link Helper & CLI Integration Tests
 *
 * Tests that auto-linking is wired into the CLI task creation flow:
 * - Auto-links when config is enabled and provider is configured
 * - Skips auto-linking with --no-auto-link flag
 * - Auto-link failures don't break task creation
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_auto_link_workspace__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions(overrides: Partial<GlobalOptions & Record<string, unknown>> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(STONEFORGE_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Tests: --no-auto-link flag
// ============================================================================

describe('create command with --no-auto-link', () => {
  test('creates task successfully when --no-auto-link is set', async () => {
    const options = createTestOptions({
      title: 'Internal Task',
      'no-auto-link': true,
    });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(data.title).toBe('Internal Task');
    expect(data.type).toBe('task');
    expect(data.status).toBe('open');
    // Output should say "Created task" and NOT mention any link
    expect(result.message).toContain('Created task');
    expect(result.message).not.toContain('Linked to');
  });

  test('creates task without auto-link when config is disabled', async () => {
    // By default, autoLink is false, so auto-link should not happen
    const options = createTestOptions({
      title: 'Regular Task',
    });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(data.title).toBe('Regular Task');
    // Should not mention any link since autoLink defaults to false
    expect(result.message).toContain('Created task');
    expect(result.message).not.toContain('Linked to');
  });
});

// ============================================================================
// Tests: Auto-link with mocked config
// ============================================================================

describe('create command auto-link integration', () => {
  test('shows auto-link warning when config enabled but provider not configured', async () => {
    // Mock getValue to return auto-link enabled with a provider
    const configModule = await import('../../config/index.js');
    const getValueSpy = spyOn(configModule, 'getValue');
    getValueSpy.mockImplementation(((path: string) => {
      if (path === 'externalSync.autoLink') return true;
      if (path === 'externalSync.autoLinkProvider') return 'github';
      if (path === 'externalSync.defaultDirection') return 'bidirectional';
      return undefined;
    }) as typeof configModule.getValue);

    const options = createTestOptions({
      title: 'Auto-link Test Task',
    });
    const result = await createCommand.handler(['task'], options);

    // Task should still be created even if auto-link setup fails
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(result.message).toContain('Created task');
    // Should have a warning about auto-link failure
    expect(result.message).toContain('Warning: Auto-link failed');

    getValueSpy.mockRestore();
  });

  test('skips auto-link when --no-auto-link flag overrides enabled config', async () => {
    // Mock getValue to return auto-link enabled
    const configModule = await import('../../config/index.js');
    const getValueSpy = spyOn(configModule, 'getValue');
    getValueSpy.mockImplementation(((path: string) => {
      if (path === 'externalSync.autoLink') return true;
      if (path === 'externalSync.autoLinkProvider') return 'github';
      if (path === 'externalSync.defaultDirection') return 'bidirectional';
      return undefined;
    }) as typeof configModule.getValue);

    const options = createTestOptions({
      title: 'No Auto-link Task',
      'no-auto-link': true,
    });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    // Should NOT attempt auto-link due to --no-auto-link
    expect(result.message).toContain('Created task');
    expect(result.message).not.toContain('Linked to');
    expect(result.message).not.toContain('Auto-link failed');

    getValueSpy.mockRestore();
  });

  test('skips auto-link when autoLink is false even without --no-auto-link', async () => {
    const configModule = await import('../../config/index.js');
    const getValueSpy = spyOn(configModule, 'getValue');
    getValueSpy.mockImplementation(((path: string) => {
      if (path === 'externalSync.autoLink') return false;
      if (path === 'externalSync.autoLinkProvider') return 'github';
      return undefined;
    }) as typeof configModule.getValue);

    const options = createTestOptions({
      title: 'Disabled Auto-link Task',
    });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Created task');
    expect(result.message).not.toContain('Linked to');
    expect(result.message).not.toContain('Auto-link failed');

    getValueSpy.mockRestore();
  });

  test('skips auto-link when autoLinkProvider is not set', async () => {
    const configModule = await import('../../config/index.js');
    const getValueSpy = spyOn(configModule, 'getValue');
    getValueSpy.mockImplementation(((path: string) => {
      if (path === 'externalSync.autoLink') return true;
      if (path === 'externalSync.autoLinkProvider') return undefined;
      return undefined;
    }) as typeof configModule.getValue);

    const options = createTestOptions({
      title: 'No Provider Task',
    });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Created task');
    expect(result.message).not.toContain('Linked to');
    expect(result.message).not.toContain('Auto-link failed');

    getValueSpy.mockRestore();
  });
});

// ============================================================================
// Tests: Auto-link helper
// ============================================================================

describe('tryCreateProviderForAutoLink', () => {
  test('returns error when provider has no token configured', async () => {
    const { tryCreateProviderForAutoLink } = await import('./auto-link-helper.js');

    // First create a task to ensure the test DB exists
    const createOpts = createTestOptions({ title: 'Dummy task for DB creation' });
    await createCommand.handler(['task'], createOpts);

    const result = await tryCreateProviderForAutoLink('github', {
      db: DB_PATH,
      json: false,
      quiet: false,
      verbose: false,
      help: false,
      version: false,
    } as GlobalOptions);

    // Should return an error (no token configured for github in this fresh DB)
    expect(result.provider).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain('no token configured');
  });

  test('returns error for unsupported provider', async () => {
    const { tryCreateProviderForAutoLink } = await import('./auto-link-helper.js');

    // First create a task to ensure the test DB exists
    const createOpts = createTestOptions({ title: 'Dummy task for DB creation' });
    await createCommand.handler(['task'], createOpts);

    const result = await tryCreateProviderForAutoLink('unknown-provider', {
      db: DB_PATH,
      json: false,
      quiet: false,
      verbose: false,
      help: false,
      version: false,
    } as GlobalOptions);

    // Should return an error about unsupported provider or no token
    expect(result.provider).toBeUndefined();
    expect(result.error).toBeDefined();
  });
});
