/**
 * CLI Error Output Tests
 *
 * Tests for error formatting in different CLI output modes:
 * - Human (standard)
 * - Verbose
 * - Quiet
 * - JSON
 *
 * Validates that errors are properly formatted and include appropriate
 * information for each output mode as specified in api/errors.md.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getFormatter, getOutputMode } from './formatter.js';
import { failure, ExitCode, type CommandResult } from './types.js';
import { showCommand } from './commands/crud.js';
import { closeCommand } from './commands/task.js';
import type { GlobalOptions } from './types.js';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_workspace_cli_errors__');
const STONEFORGE_DIR = join(TEST_DIR, '.stoneforge');
const DB_PATH = join(STONEFORGE_DIR, 'stoneforge.db');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
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
// Formatter Error Output Tests
// ============================================================================

describe('CLI Error Output Formatting', () => {
  describe('Human Formatter (standard)', () => {
    const formatter = getFormatter('human');

    it('should format error with "Error:" prefix', () => {
      const result = failure('Element not found: el-abc123');
      const output = formatter.error(result);

      expect(output).toBe('Error: Element not found: el-abc123');
    });

    it('should handle multi-line error messages', () => {
      const result = failure('Validation failed\n- Title too long\n- Priority invalid');
      const output = formatter.error(result);

      expect(output).toBe('Error: Validation failed\n- Title too long\n- Priority invalid');
    });

    it('should handle error with special characters', () => {
      const result = failure('Invalid character in ID: <script>');
      const output = formatter.error(result);

      expect(output).toBe('Error: Invalid character in ID: <script>');
    });
  });

  describe('Verbose Formatter', () => {
    const formatter = getFormatter('verbose');

    it('should include error message and exit code', () => {
      const result = failure('Element not found: el-abc123', ExitCode.NOT_FOUND);
      const output = formatter.error(result);

      expect(output).toContain('Error: Element not found: el-abc123');
      expect(output).toContain('Code: 3');
    });

    it('should include details when available', () => {
      const result: CommandResult = {
        exitCode: ExitCode.NOT_FOUND,
        error: 'Element not found',
        data: { id: 'el-abc123', type: 'task' },
      };
      const output = formatter.error(result);

      expect(output).toContain('Error: Element not found');
      expect(output).toContain('Details:');
      expect(output).toContain('el-abc123');
    });

    it('should suggest checking application logs', () => {
      const result = failure('Something went wrong', ExitCode.GENERAL_ERROR);
      const output = formatter.error(result);

      expect(output).toContain('For more details, check the application logs');
    });

    it('should format different exit codes correctly', () => {
      const exitCodes = [
        { code: ExitCode.GENERAL_ERROR, expected: 'Code: 1' },
        { code: ExitCode.INVALID_ARGUMENTS, expected: 'Code: 2' },
        { code: ExitCode.NOT_FOUND, expected: 'Code: 3' },
        { code: ExitCode.VALIDATION, expected: 'Code: 4' },
        { code: ExitCode.PERMISSION, expected: 'Code: 5' },
      ];

      for (const { code, expected } of exitCodes) {
        const result = failure('Test error', code);
        const output = formatter.error(result);
        expect(output).toContain(expected);
      }
    });
  });

  describe('Quiet Formatter', () => {
    const formatter = getFormatter('quiet');

    it('should return only error message', () => {
      const result = failure('NOT_FOUND: el-abc123');
      const output = formatter.error(result);

      expect(output).toBe('NOT_FOUND: el-abc123');
    });

    it('should return "Error" for undefined error', () => {
      const result: CommandResult = {
        exitCode: ExitCode.GENERAL_ERROR,
        error: undefined,
      };
      const output = formatter.error(result);

      expect(output).toBe('Error');
    });

    it('should not include exit code or details', () => {
      const result: CommandResult = {
        exitCode: ExitCode.NOT_FOUND,
        error: 'Not found',
        data: { id: 'el-abc', type: 'task' },
      };
      const output = formatter.error(result);

      expect(output).toBe('Not found');
      expect(output).not.toContain('Code:');
      expect(output).not.toContain('Details:');
    });
  });

  describe('JSON Formatter', () => {
    const formatter = getFormatter('json');

    it('should return valid JSON with success:false', () => {
      const result = failure('Element not found', ExitCode.NOT_FOUND);
      const output = formatter.error(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Element not found');
      expect(parsed.exitCode).toBe(3);
    });

    it('should handle special characters in JSON', () => {
      const result = failure('Invalid: "quotes" and <brackets>');
      const output = formatter.error(result);

      // Should be valid JSON
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.error).toBe('Invalid: "quotes" and <brackets>');
    });

    it('should include all exit codes', () => {
      const exitCodes = [
        ExitCode.SUCCESS,
        ExitCode.GENERAL_ERROR,
        ExitCode.INVALID_ARGUMENTS,
        ExitCode.NOT_FOUND,
        ExitCode.VALIDATION,
        ExitCode.PERMISSION,
      ];

      for (const code of exitCodes) {
        const result = failure('Test', code);
        const output = formatter.error(result);
        const parsed = JSON.parse(output);
        expect(parsed.exitCode).toBe(code);
      }
    });
  });
});

// ============================================================================
// Output Mode Selection Tests
// ============================================================================

describe('Output Mode Selection', () => {
  it('should select json mode with --json flag', () => {
    expect(getOutputMode({ json: true })).toBe('json');
  });

  it('should select quiet mode with --quiet flag', () => {
    expect(getOutputMode({ quiet: true })).toBe('quiet');
  });

  it('should select verbose mode with --verbose flag', () => {
    expect(getOutputMode({ verbose: true })).toBe('verbose');
  });

  it('should default to human mode', () => {
    expect(getOutputMode({})).toBe('human');
  });

  it('should prefer json over quiet', () => {
    expect(getOutputMode({ json: true, quiet: true })).toBe('json');
  });

  it('should prefer json over verbose', () => {
    expect(getOutputMode({ json: true, verbose: true })).toBe('json');
  });

  it('should prefer quiet over verbose', () => {
    expect(getOutputMode({ quiet: true, verbose: true })).toBe('quiet');
  });
});

// ============================================================================
// CLI Command Error Tests
// ============================================================================

describe('CLI Command Error Handling', () => {
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

  describe('show command errors', () => {
    it('should return INVALID_ARGUMENTS for missing ID', async () => {
      const options = createTestOptions();
      const result = await showCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    });

    it('should return failure for invalid database path', async () => {
      const options = createTestOptions({ db: '/nonexistent/path/db.sqlite' });
      const result = await showCommand.handler(['el-test'], options);

      // Should fail with GENERAL_ERROR when DB can't be opened
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(result.error).toBeDefined();
    });
  });

  describe('close command errors', () => {
    it('should return INVALID_ARGUMENTS for missing task ID', async () => {
      const options = createTestOptions();
      const result = await closeCommand.handler([], options);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    });
  });
});

// ============================================================================
// Error Message Format Tests
// ============================================================================

describe('Error Message Format', () => {
  it('should follow pattern: {Subject} {problem}: {details}', () => {
    // These patterns match the spec format
    const errorMessages = [
      { error: 'Element not found: el-abc123', pattern: /\w+ not found:/ },
      { error: 'Invalid status transition: cannot move from closed to blocked', pattern: /Invalid status transition:/ },
      { error: 'Title too long: 543 characters (max 500)', pattern: /too long:/ },
    ];

    for (const { error, pattern } of errorMessages) {
      expect(error).toMatch(pattern);
    }
  });
});

// ============================================================================
// Exit Code Constants Tests
// ============================================================================

describe('Exit Code Constants', () => {
  it('should have correct values per spec', () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.GENERAL_ERROR).toBe(1);
    expect(ExitCode.INVALID_ARGUMENTS).toBe(2);
    expect(ExitCode.NOT_FOUND).toBe(3);
    expect(ExitCode.VALIDATION).toBe(4);
    expect(ExitCode.PERMISSION).toBe(5);
  });
});
