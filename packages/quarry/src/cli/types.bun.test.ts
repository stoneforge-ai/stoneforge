/**
 * CLI Types Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  OutputMode,
  DEFAULT_GLOBAL_OPTIONS,
  ExitCode,
  success,
  failure,
  type GlobalOptions,
  type Command,
  type CommandOption,
  type CommandResult,
  type ParsedCommandLine,
} from './types.js';

describe('OutputMode', () => {
  it('should have human mode', () => {
    expect(OutputMode.HUMAN).toBe('human');
  });

  it('should have json mode', () => {
    expect(OutputMode.JSON).toBe('json');
  });

  it('should have quiet mode', () => {
    expect(OutputMode.QUIET).toBe('quiet');
  });
});

describe('DEFAULT_GLOBAL_OPTIONS', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_GLOBAL_OPTIONS.db).toBeUndefined();
    expect(DEFAULT_GLOBAL_OPTIONS.actor).toBeUndefined();
    expect(DEFAULT_GLOBAL_OPTIONS.json).toBe(false);
    expect(DEFAULT_GLOBAL_OPTIONS.quiet).toBe(false);
    expect(DEFAULT_GLOBAL_OPTIONS.verbose).toBe(false);
    expect(DEFAULT_GLOBAL_OPTIONS.help).toBe(false);
    expect(DEFAULT_GLOBAL_OPTIONS.version).toBe(false);
  });

  it('should be a complete GlobalOptions object', () => {
    const opts: GlobalOptions = DEFAULT_GLOBAL_OPTIONS;
    expect(opts).toBeDefined();
  });
});

describe('ExitCode', () => {
  it('should have success code 0', () => {
    expect(ExitCode.SUCCESS).toBe(0);
  });

  it('should have general error code 1', () => {
    expect(ExitCode.GENERAL_ERROR).toBe(1);
  });

  it('should have invalid arguments code 2', () => {
    expect(ExitCode.INVALID_ARGUMENTS).toBe(2);
  });

  it('should have not found code 3', () => {
    expect(ExitCode.NOT_FOUND).toBe(3);
  });

  it('should have validation error code 4', () => {
    expect(ExitCode.VALIDATION).toBe(4);
  });

  it('should have permission error code 5', () => {
    expect(ExitCode.PERMISSION).toBe(5);
  });
});

describe('success', () => {
  it('should create result with exit code 0', () => {
    const result = success();
    expect(result.exitCode).toBe(0);
  });

  it('should include data when provided', () => {
    const data = { id: 'el-abc123' };
    const result = success(data);
    expect(result.data).toEqual(data);
  });

  it('should include message when provided', () => {
    const result = success(undefined, 'Operation completed');
    expect(result.message).toBe('Operation completed');
  });

  it('should include both data and message', () => {
    const data = { id: 'el-abc123' };
    const result = success(data, 'Created element');
    expect(result.exitCode).toBe(0);
    expect(result.data).toEqual(data);
    expect(result.message).toBe('Created element');
  });

  it('should not have error field', () => {
    const result = success({ id: 'el-abc' }, 'Done');
    expect(result.error).toBeUndefined();
  });
});

describe('failure', () => {
  it('should create result with default exit code 1', () => {
    const result = failure('Something went wrong');
    expect(result.exitCode).toBe(1);
    expect(result.error).toBe('Something went wrong');
  });

  it('should accept custom exit code', () => {
    const result = failure('Not found', ExitCode.NOT_FOUND);
    expect(result.exitCode).toBe(3);
    expect(result.error).toBe('Not found');
  });

  it('should not have data or message fields', () => {
    const result = failure('Error');
    expect(result.data).toBeUndefined();
    expect(result.message).toBeUndefined();
  });
});

describe('Type interfaces', () => {
  it('should allow creating CommandOption', () => {
    const opt: CommandOption = {
      name: 'title',
      short: 't',
      description: 'Task title',
      hasValue: true,
      required: true,
      defaultValue: undefined,
    };
    expect(opt.name).toBe('title');
    expect(opt.short).toBe('t');
    expect(opt.hasValue).toBe(true);
    expect(opt.required).toBe(true);
  });

  it('should allow creating minimal CommandOption', () => {
    const opt: CommandOption = {
      name: 'verbose',
      description: 'Enable verbose output',
    };
    expect(opt.name).toBe('verbose');
    expect(opt.short).toBeUndefined();
    expect(opt.hasValue).toBeUndefined();
    expect(opt.required).toBeUndefined();
  });

  it('should allow creating Command', () => {
    const cmd: Command = {
      name: 'test',
      description: 'Test command',
      usage: 'sf test',
      handler: () => success(),
    };
    expect(cmd.name).toBe('test');
    expect(cmd.description).toBe('Test command');
    expect(cmd.usage).toBe('sf test');
  });

  it('should allow creating Command with subcommands', () => {
    const subCmd: Command = {
      name: 'sub',
      description: 'Subcommand',
      usage: 'sf test sub',
      handler: () => success(),
    };
    const cmd: Command = {
      name: 'test',
      description: 'Test command',
      usage: 'sf test <subcommand>',
      handler: () => success(),
      subcommands: { sub: subCmd },
    };
    expect(cmd.subcommands?.sub.name).toBe('sub');
  });

  it('should allow creating CommandResult', () => {
    const result: CommandResult = {
      exitCode: 0,
      data: { id: 'el-abc' },
      message: 'Success',
    };
    expect(result.exitCode).toBe(0);
    expect(result.data).toEqual({ id: 'el-abc' });
  });

  it('should allow creating ParsedCommandLine', () => {
    const parsed: ParsedCommandLine = {
      command: ['dependency', 'add'],
      args: ['el-abc', 'el-xyz'],
      options: { ...DEFAULT_GLOBAL_OPTIONS },
      commandOptions: { type: 'blocks' },
    };
    expect(parsed.command).toEqual(['dependency', 'add']);
    expect(parsed.args).toEqual(['el-abc', 'el-xyz']);
    expect(parsed.commandOptions.type).toBe('blocks');
  });
});
