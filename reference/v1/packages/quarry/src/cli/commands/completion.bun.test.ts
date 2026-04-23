/**
 * Completion Command Tests
 */

import { describe, test, expect } from 'bun:test';
import { completionCommand } from './completion.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: undefined,
    actor: undefined,
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// ============================================================================
// Completion Command Tests
// ============================================================================

describe('completion command', () => {
  test('shows help when no shell specified', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Generate shell completion scripts');
    expect(result.message).toContain('bash');
    expect(result.message).toContain('zsh');
    expect(result.message).toContain('fish');
  });

  test('generates bash completion', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler(['bash'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('_stoneforge_completion');
    expect(result.message).toContain('complete -F _stoneforge_completion sf');
  });

  test('generates zsh completion', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler(['zsh'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('#compdef sf stoneforge');
    expect(result.message).toContain('_sf()');
  });

  test('generates fish completion', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler(['fish'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('complete -c sf');
    expect(result.message).toContain('complete -c stoneforge');
  });

  test('returns error for unsupported shell', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler(['powershell'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unsupported shell');
    expect(result.error).toContain('powershell');
  });

  test('handles case-insensitive shell names', async () => {
    const options = createTestOptions();

    const bashResult = await completionCommand.handler(['BASH'], options);
    expect(bashResult.exitCode).toBe(ExitCode.SUCCESS);

    const zshResult = await completionCommand.handler(['ZSH'], options);
    expect(zshResult.exitCode).toBe(ExitCode.SUCCESS);

    const fishResult = await completionCommand.handler(['Fish'], options);
    expect(fishResult.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('returns shell type in data for JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await completionCommand.handler(['bash'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(result.data).toHaveProperty('shell', 'bash');
  });
});

// ============================================================================
// Command Structure Tests
// ============================================================================

describe('completion command structure', () => {
  test('has correct name', () => {
    expect(completionCommand.name).toBe('completion');
  });

  test('has description', () => {
    expect(completionCommand.description).toBeDefined();
    expect(completionCommand.description.length).toBeGreaterThan(0);
    expect(completionCommand.description).toContain('completion');
  });

  test('has usage', () => {
    expect(completionCommand.usage).toBeDefined();
    expect(completionCommand.usage).toContain('completion');
    expect(completionCommand.usage).toContain('<shell>');
  });

  test('has help text with installation instructions', () => {
    expect(completionCommand.help).toBeDefined();
    expect(completionCommand.help).toContain('Installation');
    expect(completionCommand.help).toContain('Bash');
    expect(completionCommand.help).toContain('Zsh');
    expect(completionCommand.help).toContain('Fish');
  });

  test('has empty options array', () => {
    expect(completionCommand.options).toBeDefined();
    expect(completionCommand.options).toHaveLength(0);
  });
});

// ============================================================================
// Output Content Tests
// ============================================================================

describe('completion script content', () => {
  test('bash script contains essential elements', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler(['bash'], options);

    // These are always present regardless of registered commands
    expect(result.message).toContain('_stoneforge_completion');
    expect(result.message).toContain('global_opts');
    expect(result.message).toContain('--db');
    expect(result.message).toContain('complete -F _stoneforge_completion');
  });

  test('zsh script contains essential elements', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler(['zsh'], options);

    expect(result.message).toContain('_sf()');
    expect(result.message).toContain('_sf_commands');
    expect(result.message).toContain('commands=(');
    expect(result.message).toContain('_arguments');
  });

  test('fish script contains essential elements', async () => {
    const options = createTestOptions();
    const result = await completionCommand.handler(['fish'], options);

    // Fish scripts always have global options and header
    expect(result.message).toContain('complete -c sf');
    expect(result.message).toContain('complete -c stoneforge');
    expect(result.message).toContain('# Global options');
    expect(result.message).toContain('-l db');
    expect(result.message).toContain('-l json');
  });
});
