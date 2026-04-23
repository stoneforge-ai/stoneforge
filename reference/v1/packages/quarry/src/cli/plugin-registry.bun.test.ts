/**
 * CLI Plugin Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  registerPluginCommands,
  registerAllPlugins,
  logConflictWarnings,
  getPluginCommandSummary,
} from './plugin-registry.js';
import { registerCommand, getCommand } from './runner.js';
import { success } from './types.js';
import type { CLIPlugin } from './plugin-types.js';
import type { Command } from './types.js';

// Track console output for tests
let consoleErrors: string[] = [];
const originalError = console.error;

beforeEach(() => {
  consoleErrors = [];
  console.error = (...args: unknown[]) => consoleErrors.push(args.map(String).join(' '));
});

afterEach(() => {
  console.error = originalError;
});

// Helper to create unique test command names to avoid conflicts
let testCommandCounter = 0;
function uniqueCommandName(prefix: string): string {
  return `${prefix}-${Date.now()}-${testCommandCounter++}`;
}

describe('registerPluginCommands', () => {
  it('should register plugin commands', () => {
    const commandName = uniqueCommandName('reg-test');
    const plugin: CLIPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Test command',
          usage: `sf ${commandName}`,
          handler: () => success(),
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    expect(result.pluginName).toBe('test-plugin');
    expect(result.registeredCommands).toContain(commandName);
    expect(result.skippedCommands).toHaveLength(0);
    expect(getCommand(commandName)).toBeDefined();
  });

  it('should skip commands that conflict with existing commands', () => {
    // First register a command directly
    const commandName = uniqueCommandName('conflict-test');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command',
      usage: `sf ${commandName}`,
      handler: () => success(),
    };
    registerCommand(existingCommand);

    // Now try to register a plugin with the same command name
    const plugin: CLIPlugin = {
      name: 'conflict-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Conflicting command',
          usage: `sf ${commandName}`,
          handler: () => success(),
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    expect(result.registeredCommands).not.toContain(commandName);
    expect(result.skippedCommands.length).toBe(1);
    expect(result.skippedCommands[0].commandName).toBe(commandName);
    expect(result.skippedCommands[0].success).toBe(false);
    expect(result.skippedCommands[0].conflictReason).toContain('already registered');
  });

  it('should register plugin aliases', () => {
    const commandName = uniqueCommandName('alias-test');
    const aliasName = uniqueCommandName('alias-shortcut');
    const plugin: CLIPlugin = {
      name: 'alias-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Test command',
          usage: `sf ${commandName}`,
          handler: () => success(),
        },
      ],
      aliases: {
        [aliasName]: commandName,
      },
    };

    const result = registerPluginCommands(plugin);

    expect(result.registeredAliases).toContain(aliasName);
    expect(result.skippedAliases).toHaveLength(0);
  });

  it('should skip aliases that conflict with existing commands', () => {
    // First register a command
    const commandName = uniqueCommandName('alias-conflict-cmd');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command',
      usage: `sf ${commandName}`,
      handler: () => success(),
    };
    registerCommand(existingCommand);

    // Try to create an alias with the same name
    const otherCommandName = uniqueCommandName('alias-conflict-target');
    const plugin: CLIPlugin = {
      name: 'alias-conflict-plugin',
      version: '1.0.0',
      commands: [
        {
          name: otherCommandName,
          description: 'Other command',
          usage: `sf ${otherCommandName}`,
          handler: () => success(),
        },
      ],
      aliases: {
        [commandName]: otherCommandName, // Alias conflicts with existing command
      },
    };

    const result = registerPluginCommands(plugin);

    expect(result.registeredAliases).not.toContain(commandName);
    expect(result.skippedAliases).toContain(commandName);
  });

  it('should log verbose output when enabled', () => {
    const commandName = uniqueCommandName('verbose-test');
    const plugin: CLIPlugin = {
      name: 'verbose-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Test command',
          usage: `sf ${commandName}`,
          handler: () => success(),
        },
      ],
    };

    registerPluginCommands(plugin, { verbose: true });

    expect(consoleErrors.some(e => e.includes('[plugin:verbose-plugin]'))).toBe(true);
    expect(consoleErrors.some(e => e.includes(`Registered command '${commandName}'`))).toBe(true);
  });
});

describe('registerAllPlugins', () => {
  it('should register multiple plugins', async () => {
    const cmd1Name = uniqueCommandName('multi-plugin-1');
    const cmd2Name = uniqueCommandName('multi-plugin-2');

    const plugins: CLIPlugin[] = [
      {
        name: 'plugin-1',
        version: '1.0.0',
        commands: [
          {
            name: cmd1Name,
            description: 'Command 1',
            usage: `sf ${cmd1Name}`,
            handler: () => success(),
          },
        ],
      },
      {
        name: 'plugin-2',
        version: '1.0.0',
        commands: [
          {
            name: cmd2Name,
            description: 'Command 2',
            usage: `sf ${cmd2Name}`,
            handler: () => success(),
          },
        ],
      },
    ];

    const results = await registerAllPlugins(plugins);

    expect(results).toHaveLength(2);
    expect(results[0].pluginName).toBe('plugin-1');
    expect(results[1].pluginName).toBe('plugin-2');
    expect(getCommand(cmd1Name)).toBeDefined();
    expect(getCommand(cmd2Name)).toBeDefined();
  });

  it('should call plugin init function', async () => {
    let initCalled = false;
    const cmdName = uniqueCommandName('init-test');

    const plugins: CLIPlugin[] = [
      {
        name: 'init-plugin',
        version: '1.0.0',
        commands: [
          {
            name: cmdName,
            description: 'Test',
            usage: `sf ${cmdName}`,
            handler: () => success(),
          },
        ],
        init: async () => {
          initCalled = true;
        },
      },
    ];

    await registerAllPlugins(plugins);

    expect(initCalled).toBe(true);
  });

  it('should continue registration if init fails', async () => {
    const cmdName = uniqueCommandName('init-fail-test');

    const plugins: CLIPlugin[] = [
      {
        name: 'failing-init-plugin',
        version: '1.0.0',
        commands: [
          {
            name: cmdName,
            description: 'Test',
            usage: `sf ${cmdName}`,
            handler: () => success(),
          },
        ],
        init: async () => {
          throw new Error('Init failed');
        },
      },
    ];

    const results = await registerAllPlugins(plugins);

    expect(results).toHaveLength(1);
    expect(results[0].registeredCommands).toContain(cmdName);
    expect(consoleErrors.some(e => e.includes('Init failed'))).toBe(true);
  });

  it('should give precedence to earlier plugins', async () => {
    const sharedName = uniqueCommandName('precedence-test');

    const plugins: CLIPlugin[] = [
      {
        name: 'first-plugin',
        version: '1.0.0',
        commands: [
          {
            name: sharedName,
            description: 'First plugin command',
            usage: `sf ${sharedName}`,
            handler: () => success({ from: 'first' }),
          },
        ],
      },
      {
        name: 'second-plugin',
        version: '1.0.0',
        commands: [
          {
            name: sharedName,
            description: 'Second plugin command',
            usage: `sf ${sharedName}`,
            handler: () => success({ from: 'second' }),
          },
        ],
      },
    ];

    const results = await registerAllPlugins(plugins);

    // First plugin should have registered the command
    expect(results[0].registeredCommands).toContain(sharedName);
    // Second plugin should have skipped it
    expect(results[1].skippedCommands.some(s => s.commandName === sharedName)).toBe(true);
  });
});

describe('logConflictWarnings', () => {
  it('should log warnings for skipped commands', () => {
    const results = [
      {
        pluginName: 'test-plugin',
        registeredCommands: [],
        skippedCommands: [
          {
            commandName: 'skipped-cmd',
            success: false,
            conflictReason: 'Command already registered',
          },
        ],
        registeredAliases: [],
        skippedAliases: [],
      },
    ];

    logConflictWarnings(results);

    expect(consoleErrors.some(e => e.includes('[plugin:test-plugin]'))).toBe(true);
    expect(consoleErrors.some(e => e.includes('Command already registered'))).toBe(true);
  });

  it('should log warnings for skipped aliases', () => {
    const results = [
      {
        pluginName: 'alias-plugin',
        registeredCommands: [],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: ['alias1', 'alias2'],
      },
    ];

    logConflictWarnings(results);

    expect(consoleErrors.some(e => e.includes('[plugin:alias-plugin]'))).toBe(true);
    expect(consoleErrors.some(e => e.includes('Skipped 2 alias'))).toBe(true);
  });

  it('should not log anything when no conflicts', () => {
    const results = [
      {
        pluginName: 'clean-plugin',
        registeredCommands: ['cmd1', 'cmd2'],
        skippedCommands: [],
        registeredAliases: ['alias1'],
        skippedAliases: [],
      },
    ];

    logConflictWarnings(results);

    expect(consoleErrors).toHaveLength(0);
  });
});

describe('subcommand merging', () => {
  it('should merge subcommands when both commands have subcommands', () => {
    // First register a command with subcommands
    const commandName = uniqueCommandName('merge-base');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command',
      usage: `sf ${commandName}`,
      handler: () => success(),
      subcommands: {
        existing: {
          name: 'existing',
          description: 'Existing subcommand',
          usage: `sf ${commandName} existing`,
          handler: () => success(),
        },
      },
    };
    registerCommand(existingCommand);

    // Now try to register a plugin with the same command name but different subcommands
    const plugin: CLIPlugin = {
      name: 'merge-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Plugin command',
          usage: `sf ${commandName}`,
          handler: () => success(),
          subcommands: {
            newSub: {
              name: 'newSub',
              description: 'New subcommand from plugin',
              usage: `sf ${commandName} newSub`,
              handler: () => success(),
            },
          },
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    // Should have merged the subcommand
    expect(result.registeredCommands).toContain(`${commandName} (subcommands: newSub)`);
    // The existing command should now have both subcommands
    const updatedCommand = getCommand(commandName);
    expect(updatedCommand?.subcommands?.existing).toBeDefined();
    expect(updatedCommand?.subcommands?.newSub).toBeDefined();
  });

  it('should skip conflicting subcommands while merging others', () => {
    const commandName = uniqueCommandName('partial-merge');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command',
      usage: `sf ${commandName}`,
      handler: () => success(),
      subcommands: {
        shared: {
          name: 'shared',
          description: 'Shared subcommand',
          usage: `sf ${commandName} shared`,
          handler: () => success(),
        },
      },
    };
    registerCommand(existingCommand);

    const plugin: CLIPlugin = {
      name: 'partial-merge-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Plugin command',
          usage: `sf ${commandName}`,
          handler: () => success(),
          subcommands: {
            shared: {
              name: 'shared',
              description: 'Plugin shared subcommand',
              usage: `sf ${commandName} shared`,
              handler: () => success(),
            },
            unique: {
              name: 'unique',
              description: 'Unique subcommand',
              usage: `sf ${commandName} unique`,
              handler: () => success(),
            },
          },
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    // Should have merged the unique subcommand
    expect(result.registeredCommands).toContain(`${commandName} (subcommands: unique)`);
    // Should have recorded the skipped subcommand
    const skipped = result.skippedCommands.find(s => s.commandName === commandName);
    expect(skipped?.subcommandsMerged?.merged).toContain('unique');
    expect(skipped?.subcommandsMerged?.skipped).toContain('shared');
  });

  it('should not warn when subcommands are successfully merged', () => {
    const commandName = uniqueCommandName('no-warn-merge');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command',
      usage: `sf ${commandName}`,
      handler: () => success(),
      subcommands: {
        existing: {
          name: 'existing',
          description: 'Existing subcommand',
          usage: `sf ${commandName} existing`,
          handler: () => success(),
        },
      },
    };
    registerCommand(existingCommand);

    const plugin: CLIPlugin = {
      name: 'no-warn-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Plugin command',
          usage: `sf ${commandName}`,
          handler: () => success(),
          subcommands: {
            newSub: {
              name: 'newSub',
              description: 'New subcommand',
              usage: `sf ${commandName} newSub`,
              handler: () => success(),
            },
          },
        },
      ],
    };

    const result = registerPluginCommands(plugin);
    consoleErrors = []; // Clear any previous output
    logConflictWarnings([result]);

    // Should not have logged any warnings
    expect(consoleErrors).toHaveLength(0);
  });

  it('should still skip entirely when existing command has no subcommands', () => {
    const commandName = uniqueCommandName('no-sub-existing');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command without subcommands',
      usage: `sf ${commandName}`,
      handler: () => success(),
    };
    registerCommand(existingCommand);

    const plugin: CLIPlugin = {
      name: 'has-sub-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Plugin command with subcommands',
          usage: `sf ${commandName}`,
          handler: () => success(),
          subcommands: {
            sub: {
              name: 'sub',
              description: 'Subcommand',
              usage: `sf ${commandName} sub`,
              handler: () => success(),
            },
          },
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    // Should have skipped the entire command
    expect(result.skippedCommands.some(s => s.commandName === commandName && s.conflictReason?.includes('already registered'))).toBe(true);
    expect(result.registeredCommands).not.toContain(commandName);
  });

  it('should still skip entirely when plugin command has no subcommands', () => {
    const commandName = uniqueCommandName('no-sub-plugin');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command with subcommands',
      usage: `sf ${commandName}`,
      handler: () => success(),
      subcommands: {
        sub: {
          name: 'sub',
          description: 'Subcommand',
          usage: `sf ${commandName} sub`,
          handler: () => success(),
        },
      },
    };
    registerCommand(existingCommand);

    const plugin: CLIPlugin = {
      name: 'no-sub-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Plugin command without subcommands',
          usage: `sf ${commandName}`,
          handler: () => success(),
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    // Should have skipped the entire command
    expect(result.skippedCommands.some(s => s.commandName === commandName && s.conflictReason?.includes('already registered'))).toBe(true);
  });
});

describe('getPluginCommandSummary', () => {
  it('should return summary of registered commands', () => {
    const results = [
      {
        pluginName: 'plugin-1',
        registeredCommands: ['cmd1', 'cmd2'],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: [],
      },
      {
        pluginName: 'plugin-2',
        registeredCommands: ['cmd3'],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: [],
      },
    ];

    const summary = getPluginCommandSummary(results);

    expect(summary.get('plugin-1')).toEqual(['cmd1', 'cmd2']);
    expect(summary.get('plugin-2')).toEqual(['cmd3']);
  });

  it('should exclude plugins with no registered commands', () => {
    const results = [
      {
        pluginName: 'empty-plugin',
        registeredCommands: [],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: [],
      },
    ];

    const summary = getPluginCommandSummary(results);

    expect(summary.has('empty-plugin')).toBe(false);
    expect(summary.size).toBe(0);
  });
});
