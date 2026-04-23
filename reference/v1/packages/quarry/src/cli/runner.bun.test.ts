/**
 * CLI Runner Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  registerCommand,
  getCommand,
  getAllCommands,
  run,
} from './runner.js';
import { success, failure, ExitCode, type Command } from './types.js';

// Track console output for tests
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  consoleOutput = [];
  consoleErrors = [];
  console.log = (...args) => consoleOutput.push(args.join(' '));
  console.error = (...args) => consoleErrors.push(args.join(' '));
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

describe('registerCommand', () => {
  it('should register a command', () => {
    const cmd: Command = {
      name: 'test-register',
      description: 'Test command',
      usage: 'sf test-register',
      handler: () => success(),
    };
    registerCommand(cmd);
    expect(getCommand('test-register')).toBe(cmd);
  });
});

describe('getCommand', () => {
  it('should return undefined for unregistered command', () => {
    expect(getCommand('nonexistent-command')).toBeUndefined();
  });
});

describe('getAllCommands', () => {
  it('should return all registered commands', () => {
    const commands = getAllCommands();
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });
});

describe('run', () => {
  describe('help and version', () => {
    it('should show help with no arguments', async () => {
      const exitCode = await run([]);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(consoleOutput.some(line => line.includes('Stoneforge'))).toBe(true);
    });

    it('should show help with --help flag', async () => {
      const exitCode = await run(['--help']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(consoleOutput.some(line => line.includes('Usage'))).toBe(true);
    });

    it('should show help with -h flag', async () => {
      const exitCode = await run(['-h']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(consoleOutput.some(line => line.includes('Stoneforge'))).toBe(true);
    });

    it('should show version with --version flag', async () => {
      const exitCode = await run(['--version']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(consoleOutput.some(line => line.includes('stoneforge v'))).toBe(true);
    });

    it('should show version with -V flag', async () => {
      const exitCode = await run(['-V']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(consoleOutput.some(line => line.includes('stoneforge v'))).toBe(true);
    });
  });

  describe('unknown command', () => {
    it('should return error for unknown command', async () => {
      const exitCode = await run(['unknown-command']);
      expect(exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
      expect(consoleErrors.some(line => line.includes('Unknown command'))).toBe(true);
    });
  });

  describe('command execution', () => {
    it('should execute registered command', async () => {
      const handler = mock(() => success({ result: 'test' }, 'Test completed'));
      const cmd: Command = {
        name: 'test-exec',
        description: 'Test execution',
        usage: 'sf test-exec',
        handler,
      };
      registerCommand(cmd);

      const exitCode = await run(['test-exec']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(handler).toHaveBeenCalled();
    });

    it('should pass arguments to handler', async () => {
      let receivedArgs: string[] = [];
      const cmd: Command = {
        name: 'test-args',
        description: 'Test args',
        usage: 'sf test-args',
        handler: (args) => {
          receivedArgs = args;
          return success();
        },
      };
      registerCommand(cmd);

      await run(['test-args', 'el-abc123', 'el-xyz456']);
      expect(receivedArgs).toEqual(['el-abc123', 'el-xyz456']);
    });

    it('should pass options to handler', async () => {
      let receivedOptions: unknown;
      const cmd: Command = {
        name: 'test-options',
        description: 'Test options',
        usage: 'sf test-options',
        handler: (_args, opts) => {
          receivedOptions = opts;
          return success();
        },
      };
      registerCommand(cmd);

      await run(['test-options', '--json', '--verbose']);
      expect((receivedOptions as { json: boolean }).json).toBe(true);
      expect((receivedOptions as { verbose: boolean }).verbose).toBe(true);
    });

    it('should handle command failure', async () => {
      const cmd: Command = {
        name: 'test-fail',
        description: 'Test failure',
        usage: 'sf test-fail',
        handler: () => failure('Something went wrong', ExitCode.GENERAL_ERROR),
      };
      registerCommand(cmd);

      const exitCode = await run(['test-fail']);
      expect(exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(consoleErrors.some(line => line.includes('Something went wrong'))).toBe(true);
    });

    it('should handle async handlers', async () => {
      const cmd: Command = {
        name: 'test-async',
        description: 'Test async',
        usage: 'sf test-async',
        handler: async () => {
          await Promise.resolve();
          return success({ async: true });
        },
      };
      registerCommand(cmd);

      const exitCode = await run(['test-async']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
    });
  });

  describe('subcommands', () => {
    it('should execute subcommand', async () => {
      const subHandler = mock(() => success(undefined, 'Sub executed'));
      const cmd: Command = {
        name: 'test-parent',
        description: 'Parent command',
        usage: 'sf test-parent <subcommand>',
        handler: () => success(undefined, 'Parent executed'),
        subcommands: {
          child: {
            name: 'child',
            description: 'Child command',
            usage: 'sf test-parent child',
            handler: subHandler,
          },
        },
      };
      registerCommand(cmd);

      const exitCode = await run(['test-parent', 'child']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(subHandler).toHaveBeenCalled();
    });

    it('should execute parent when no matching subcommand', async () => {
      const parentHandler = mock(() => success(undefined, 'Parent executed'));
      const cmd: Command = {
        name: 'test-parent2',
        description: 'Parent command',
        usage: 'sf test-parent2',
        handler: parentHandler,
        subcommands: {
          child: {
            name: 'child',
            description: 'Child command',
            usage: 'sf test-parent2 child',
            handler: () => success(),
          },
        },
      };
      registerCommand(cmd);

      // When given a non-subcommand arg, it treats it as an argument
      await run(['test-parent2', 'el-abc123']);
      expect(parentHandler).toHaveBeenCalled();
    });
  });

  describe('output modes', () => {
    it('should output JSON with --json flag', async () => {
      const cmd: Command = {
        name: 'test-json',
        description: 'Test JSON',
        usage: 'sf test-json',
        handler: () => success({ id: 'el-abc123' }),
      };
      registerCommand(cmd);

      await run(['test-json', '--json']);
      const output = consoleOutput.join('');
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.data.id).toBe('el-abc123');
    });

    it('should output minimal with --quiet flag', async () => {
      const cmd: Command = {
        name: 'test-quiet',
        description: 'Test quiet',
        usage: 'sf test-quiet',
        handler: () => success({ id: 'el-abc123' }),
      };
      registerCommand(cmd);

      await run(['test-quiet', '--quiet']);
      expect(consoleOutput[0]).toBe('el-abc123');
    });
  });

  describe('error handling', () => {
    it('should handle parse errors gracefully', async () => {
      const exitCode = await run(['--invalid-unknown-flag']);
      expect(exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
      expect(consoleErrors.some(line => line.includes('Unknown option'))).toBe(true);
    });

    it('should handle handler exceptions', async () => {
      const cmd: Command = {
        name: 'test-throw',
        description: 'Test throw',
        usage: 'sf test-throw',
        handler: () => {
          throw new Error('Handler error');
        },
      };
      registerCommand(cmd);

      const exitCode = await run(['test-throw']);
      expect(exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect(consoleErrors.some(line => line.includes('Handler error'))).toBe(true);
    });
  });

  describe('command-specific help', () => {
    it('should show command help with --help after command', async () => {
      const cmd: Command = {
        name: 'test-cmd-help',
        description: 'Test command help',
        usage: 'sf test-cmd-help [options]',
        help: 'Detailed help for test command',
        handler: () => success(),
      };
      registerCommand(cmd);

      const exitCode = await run(['test-cmd-help', '--help']);
      expect(exitCode).toBe(ExitCode.SUCCESS);
      expect(consoleOutput.some(line => line.includes('Test command help'))).toBe(true);
    });
  });

  describe('command options with values', () => {
    it('should not treat option values as positional args', async () => {
      let receivedArgs: string[] = [];
      let receivedOptions: Record<string, unknown> = {};
      const cmd: Command = {
        name: 'test-opt-values',
        description: 'Test option values',
        usage: 'sf test-opt-values <id> [options]',
        options: [
          { name: 'reason', short: 'r', description: 'A reason', hasValue: true },
        ],
        handler: (args, opts) => {
          receivedArgs = args;
          receivedOptions = opts as Record<string, unknown>;
          return success();
        },
      };
      registerCommand(cmd);

      await run(['test-opt-values', 'el-abc123', '--reason', 'Test reason']);
      expect(receivedArgs).toEqual(['el-abc123']);
      expect(receivedOptions.reason).toBe('Test reason');
    });

    it('should not treat short option values as positional args', async () => {
      let receivedArgs: string[] = [];
      let receivedOptions: Record<string, unknown> = {};
      const cmd: Command = {
        name: 'test-short-opt',
        description: 'Test short option',
        usage: 'sf test-short-opt <id> [options]',
        options: [
          { name: 'message', short: 'm', description: 'A message', hasValue: true },
        ],
        handler: (args, opts) => {
          receivedArgs = args;
          receivedOptions = opts as Record<string, unknown>;
          return success();
        },
      };
      registerCommand(cmd);

      await run(['test-short-opt', 'el-xyz456', '-m', 'Hello world']);
      expect(receivedArgs).toEqual(['el-xyz456']);
      expect(receivedOptions.message).toBe('Hello world');
    });

    it('should handle option values with equals syntax', async () => {
      let receivedArgs: string[] = [];
      let receivedOptions: Record<string, unknown> = {};
      const cmd: Command = {
        name: 'test-equals-opt',
        description: 'Test equals syntax',
        usage: 'sf test-equals-opt <id> [options]',
        options: [
          { name: 'name', short: 'n', description: 'A name', hasValue: true },
        ],
        handler: (args, opts) => {
          receivedArgs = args;
          receivedOptions = opts as Record<string, unknown>;
          return success();
        },
      };
      registerCommand(cmd);

      await run(['test-equals-opt', 'el-test123', '--name=MyValue']);
      expect(receivedArgs).toEqual(['el-test123']);
      expect(receivedOptions.name).toBe('MyValue');
    });

    it('should handle multiple option values correctly', async () => {
      let receivedArgs: string[] = [];
      let receivedOptions: Record<string, unknown> = {};
      const cmd: Command = {
        name: 'test-multi-opts',
        description: 'Test multiple options',
        usage: 'sf test-multi-opts <id> [options]',
        options: [
          { name: 'title', short: 't', description: 'Title', hasValue: true },
          { name: 'priority', short: 'p', description: 'Priority', hasValue: true },
        ],
        handler: (args, opts) => {
          receivedArgs = args;
          receivedOptions = opts as Record<string, unknown>;
          return success();
        },
      };
      registerCommand(cmd);

      await run(['test-multi-opts', 'el-multi', '--title', 'My Title', '-p', '1']);
      expect(receivedArgs).toEqual(['el-multi']);
      expect(receivedOptions.title).toBe('My Title');
      expect(receivedOptions.priority).toBe('1');
    });
  });
});
