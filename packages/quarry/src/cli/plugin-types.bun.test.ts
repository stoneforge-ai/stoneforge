/**
 * CLI Plugin Types Tests
 */

import { describe, it, expect } from 'bun:test';
import { isValidCLIPlugin, isValidPluginsConfig } from './plugin-types.js';
import { success } from './types.js';

describe('isValidCLIPlugin', () => {
  it('should validate a minimal valid plugin', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [],
    };
    expect(isValidCLIPlugin(plugin)).toBe(true);
  });

  it('should validate a plugin with commands', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [
        {
          name: 'test-cmd',
          description: 'Test command',
          usage: 'sf test-cmd',
          handler: () => success(),
        },
      ],
    };
    expect(isValidCLIPlugin(plugin)).toBe(true);
  });

  it('should validate a plugin with aliases', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [],
      aliases: {
        shortcut: 'long command',
      },
    };
    expect(isValidCLIPlugin(plugin)).toBe(true);
  });

  it('should validate a plugin with init function', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [],
      init: async () => {},
    };
    expect(isValidCLIPlugin(plugin)).toBe(true);
  });

  it('should reject null', () => {
    expect(isValidCLIPlugin(null)).toBe(false);
  });

  it('should reject non-object', () => {
    expect(isValidCLIPlugin('not-an-object')).toBe(false);
    expect(isValidCLIPlugin(123)).toBe(false);
    expect(isValidCLIPlugin(undefined)).toBe(false);
  });

  it('should reject plugin with missing name', () => {
    const plugin = {
      version: '1.0.0',
      commands: [],
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with empty name', () => {
    const plugin = {
      name: '',
      version: '1.0.0',
      commands: [],
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with missing version', () => {
    const plugin = {
      name: 'test-plugin',
      commands: [],
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with empty version', () => {
    const plugin = {
      name: 'test-plugin',
      version: '',
      commands: [],
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with non-array commands', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: 'not-an-array',
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with invalid command', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [{ invalid: true }],
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with invalid aliases type', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [],
      aliases: 'not-an-object',
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with non-string alias values', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [],
      aliases: {
        shortcut: 123,
      },
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should reject plugin with non-function init', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [],
      init: 'not-a-function',
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });

  it('should validate plugin with subcommands', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [
        {
          name: 'parent',
          description: 'Parent command',
          usage: 'sf parent <subcommand>',
          handler: () => success(),
          subcommands: {
            child: {
              name: 'child',
              description: 'Child command',
              usage: 'sf parent child',
              handler: () => success(),
            },
          },
        },
      ],
    };
    expect(isValidCLIPlugin(plugin)).toBe(true);
  });

  it('should reject plugin with invalid subcommand', () => {
    const plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [
        {
          name: 'parent',
          description: 'Parent command',
          usage: 'sf parent <subcommand>',
          handler: () => success(),
          subcommands: {
            child: { invalid: true },
          },
        },
      ],
    };
    expect(isValidCLIPlugin(plugin)).toBe(false);
  });
});

describe('isValidPluginsConfig', () => {
  it('should validate valid config with packages', () => {
    const config = {
      packages: ['@org/plugin1', 'plugin2'],
    };
    expect(isValidPluginsConfig(config)).toBe(true);
  });

  it('should validate config with empty packages array', () => {
    const config = {
      packages: [],
    };
    expect(isValidPluginsConfig(config)).toBe(true);
  });

  it('should reject null', () => {
    expect(isValidPluginsConfig(null)).toBe(false);
  });

  it('should reject non-object', () => {
    expect(isValidPluginsConfig('not-an-object')).toBe(false);
    expect(isValidPluginsConfig(123)).toBe(false);
  });

  it('should reject config with missing packages', () => {
    expect(isValidPluginsConfig({})).toBe(false);
  });

  it('should reject config with non-array packages', () => {
    const config = {
      packages: 'not-an-array',
    };
    expect(isValidPluginsConfig(config)).toBe(false);
  });

  it('should reject config with non-string package names', () => {
    const config = {
      packages: [123, null],
    };
    expect(isValidPluginsConfig(config)).toBe(false);
  });

  it('should reject config with empty string package name', () => {
    const config = {
      packages: ['valid-package', ''],
    };
    expect(isValidPluginsConfig(config)).toBe(false);
  });
});
