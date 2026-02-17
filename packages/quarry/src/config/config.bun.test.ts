/**
 * Configuration System Tests
 *
 * Comprehensive tests for configuration loading, validation, and access.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  // Types
  type Configuration,
  type PartialConfiguration,
  type ConfigPath,

  // Defaults
  DEFAULT_CONFIG,
  getDefaultConfig,
  ONE_SECOND,
  ONE_MINUTE,
  ONE_HOUR,
  ONE_DAY,
  MIN_EXPORT_DEBOUNCE,

  // Duration
  parseDuration,
  parseDurationValue,
  tryParseDuration,
  formatDuration,
  formatDurationHuman,
  isDurationString,
  validateDurationRange,

  // Validation
  isValidActor,
  validateActor,
  isValidDatabase,
  validateDatabase,
  isValidJsonlFilename,
  validateJsonlFilename,
  validatePlaybookPaths,
  validateConfiguration,
  validateConfigurationSafe,
  validatePartialConfiguration,

  // Merge
  deepMerge,
  mergeConfiguration,
  mergeConfigurations,
  createConfiguration,
  cloneConfiguration,
  diffConfigurations,
  configurationsEqual,

  // File
  parseYamlConfig,
  convertYamlToConfig,
  convertConfigToYaml,
  serializeConfigToYaml,
  expandPath,
  expandPlaybookPaths,

  // Environment
  parseEnvBoolean,
  isEnvBoolean,
  parseEnvDuration,
  loadEnvConfig,
  getEnvVarInfo,

  // Config API
  loadConfig,
  getConfig,
  clearConfigCache,
  getValue,
  getValueFromConfig,
  EnvVars,
} from './index.js';

import { IdentityMode } from '../systems/identity.js';
import { ValidationError } from '@stoneforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestConfig(): Configuration {
  return {
    actor: 'test-agent',
    database: 'test.db',
    sync: {
      autoExport: false,
      exportDebounce: 1000,
      elementsFile: 'test-elements.jsonl',
      dependenciesFile: 'test-deps.jsonl',
    },
    playbooks: {
      paths: ['/test/playbooks'],
    },
    tombstone: {
      ttl: 14 * ONE_DAY,
      minTtl: 3 * ONE_DAY,
    },
    identity: {
      mode: IdentityMode.CRYPTOGRAPHIC,
      timeTolerance: 10 * ONE_MINUTE,
    },
    plugins: {
      packages: [],
    },
  };
}

// ============================================================================
// Duration Tests
// ============================================================================

describe('Duration Parsing', () => {
  describe('parseDuration', () => {
    test('parses milliseconds', () => {
      expect(parseDuration('500ms')).toBe(500);
      expect(parseDuration('0ms')).toBe(0);
      expect(parseDuration('1ms')).toBe(1);
    });

    test('parses seconds', () => {
      expect(parseDuration('1s')).toBe(1000);
      expect(parseDuration('5s')).toBe(5000);
      expect(parseDuration('60s')).toBe(60000);
    });

    test('parses minutes', () => {
      expect(parseDuration('1m')).toBe(60000);
      expect(parseDuration('5m')).toBe(300000);
    });

    test('parses hours', () => {
      expect(parseDuration('1h')).toBe(3600000);
      expect(parseDuration('24h')).toBe(86400000);
    });

    test('parses days', () => {
      expect(parseDuration('1d')).toBe(86400000);
      expect(parseDuration('30d')).toBe(2592000000);
    });

    test('parses decimal values', () => {
      expect(parseDuration('1.5s')).toBe(1500);
      expect(parseDuration('0.5m')).toBe(30000);
    });

    test('throws on invalid format', () => {
      expect(() => parseDuration('invalid')).toThrow(ValidationError);
      expect(() => parseDuration('500')).toThrow(ValidationError);
      expect(() => parseDuration('ms500')).toThrow(ValidationError);
      expect(() => parseDuration('5x')).toThrow(ValidationError);
    });
  });

  describe('parseDurationValue', () => {
    test('parses string values', () => {
      expect(parseDurationValue('5m')).toBe(300000);
    });

    test('passes through number values', () => {
      expect(parseDurationValue(5000)).toBe(5000);
    });

    test('rounds decimal numbers', () => {
      expect(parseDurationValue(5000.7)).toBe(5001);
    });

    test('throws on negative numbers', () => {
      expect(() => parseDurationValue(-1)).toThrow(ValidationError);
    });

    test('throws on non-finite numbers', () => {
      expect(() => parseDurationValue(Infinity)).toThrow(ValidationError);
      expect(() => parseDurationValue(NaN)).toThrow(ValidationError);
    });
  });

  describe('tryParseDuration', () => {
    test('returns duration for valid values', () => {
      expect(tryParseDuration('5m')).toBe(300000);
      expect(tryParseDuration(5000)).toBe(5000);
    });

    test('returns undefined for invalid values', () => {
      expect(tryParseDuration('invalid')).toBeUndefined();
      expect(tryParseDuration(-1)).toBeUndefined();
      expect(tryParseDuration(null)).toBeUndefined();
    });
  });

  describe('isDurationString', () => {
    test('returns true for valid duration strings', () => {
      expect(isDurationString('500ms')).toBe(true);
      expect(isDurationString('5s')).toBe(true);
      expect(isDurationString('5m')).toBe(true);
      expect(isDurationString('24h')).toBe(true);
      expect(isDurationString('30d')).toBe(true);
    });

    test('returns false for invalid values', () => {
      expect(isDurationString('invalid')).toBe(false);
      expect(isDurationString('500')).toBe(false);
      expect(isDurationString(500)).toBe(false);
    });
  });

  describe('formatDuration', () => {
    test('formats to milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1)).toBe('1ms');
    });

    test('formats to seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(1000)).toBe('1s');
    });

    test('formats to minutes', () => {
      expect(formatDuration(300000)).toBe('5m');
    });

    test('formats to hours', () => {
      expect(formatDuration(3600000)).toBe('1h');
    });

    test('formats to days', () => {
      expect(formatDuration(86400000)).toBe('1d');
    });

    test('throws on negative values', () => {
      expect(() => formatDuration(-1)).toThrow(ValidationError);
    });
  });

  describe('formatDurationHuman', () => {
    test('formats fractional values', () => {
      expect(formatDurationHuman(1500)).toBe('1.5s');
      expect(formatDurationHuman(90000)).toBe('1.5m');
    });

    test('formats whole values without decimals', () => {
      expect(formatDurationHuman(1000)).toBe('1s');
      expect(formatDurationHuman(60000)).toBe('1m');
    });

    test('formats zero', () => {
      expect(formatDurationHuman(0)).toBe('0ms');
    });
  });

  describe('validateDurationRange', () => {
    test('returns value in range', () => {
      expect(validateDurationRange(500, 100, 1000, 'test')).toBe(500);
    });

    test('throws on value below minimum', () => {
      expect(() => validateDurationRange(50, 100, 1000, 'test')).toThrow(ValidationError);
    });

    test('throws on value above maximum', () => {
      expect(() => validateDurationRange(1500, 100, 1000, 'test')).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation', () => {
  describe('isValidActor', () => {
    test('accepts valid actors', () => {
      expect(isValidActor('agent')).toBe(true);
      expect(isValidActor('agent-1')).toBe(true);
      expect(isValidActor('agent_test')).toBe(true);
      expect(isValidActor('Agent123')).toBe(true);
    });

    test('rejects invalid actors', () => {
      expect(isValidActor('')).toBe(false);
      expect(isValidActor('agent name')).toBe(false);
      expect(isValidActor('agent.name')).toBe(false);
      expect(isValidActor(123)).toBe(false);
    });
  });

  describe('validateActor', () => {
    test('returns valid actor', () => {
      expect(validateActor('my-agent')).toBe('my-agent');
    });

    test('throws on empty actor', () => {
      expect(() => validateActor('')).toThrow(ValidationError);
    });

    test('throws on invalid characters', () => {
      expect(() => validateActor('agent name')).toThrow(ValidationError);
    });
  });

  describe('isValidDatabase', () => {
    test('accepts valid database names', () => {
      expect(isValidDatabase('stoneforge.db')).toBe(true);
      expect(isValidDatabase('test.db')).toBe(true);
    });

    test('rejects invalid database names', () => {
      expect(isValidDatabase('')).toBe(false);
      expect(isValidDatabase('stoneforge')).toBe(false);
      expect(isValidDatabase('path/to/file.db')).toBe(false);
    });
  });

  describe('validateDatabase', () => {
    test('returns valid database name', () => {
      expect(validateDatabase('stoneforge.db')).toBe('stoneforge.db');
    });

    test('throws on missing .db extension', () => {
      expect(() => validateDatabase('stoneforge')).toThrow(ValidationError);
    });

    test('throws on path separator', () => {
      expect(() => validateDatabase('path/to.db')).toThrow(ValidationError);
    });
  });

  describe('isValidJsonlFilename', () => {
    test('accepts valid filenames', () => {
      expect(isValidJsonlFilename('elements.jsonl')).toBe(true);
      expect(isValidJsonlFilename('test-data.jsonl')).toBe(true);
    });

    test('rejects invalid filenames', () => {
      expect(isValidJsonlFilename('')).toBe(false);
      expect(isValidJsonlFilename('elements.json')).toBe(false);
      expect(isValidJsonlFilename('path/to/file.jsonl')).toBe(false);
    });
  });

  describe('validatePlaybookPaths', () => {
    test('accepts valid paths array', () => {
      expect(validatePlaybookPaths(['/path/one', '/path/two'])).toEqual(['/path/one', '/path/two']);
    });

    test('throws on non-array', () => {
      expect(() => validatePlaybookPaths('not-array')).toThrow(ValidationError);
    });

    test('throws on non-string element', () => {
      expect(() => validatePlaybookPaths(['/path', 123])).toThrow(ValidationError);
    });

    test('throws on empty string element', () => {
      expect(() => validatePlaybookPaths(['/path', ''])).toThrow(ValidationError);
    });
  });

  describe('validateConfiguration', () => {
    test('accepts valid configuration', () => {
      const config = createTestConfig();
      expect(() => validateConfiguration(config)).not.toThrow();
    });

    test('rejects non-object', () => {
      expect(() => validateConfiguration(null)).toThrow(ValidationError);
      expect(() => validateConfiguration('string')).toThrow(ValidationError);
    });

    test('rejects missing required fields', () => {
      expect(() => validateConfiguration({})).toThrow(ValidationError);
    });

    test('validates nested fields', () => {
      const config = getDefaultConfig();
      config.sync.exportDebounce = 50; // Below minimum
      expect(() => validateConfiguration(config)).toThrow(ValidationError);
    });
  });

  describe('validateConfigurationSafe', () => {
    test('returns valid result for valid config', () => {
      const config = createTestConfig();
      const result = validateConfigurationSafe(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('returns invalid result with errors for invalid config', () => {
      const result = validateConfigurationSafe({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validatePartialConfiguration', () => {
    test('accepts valid partial config', () => {
      expect(() => validatePartialConfiguration({ actor: 'test' })).not.toThrow();
    });

    test('throws on invalid partial values', () => {
      expect(() => validatePartialConfiguration({ actor: '' })).toThrow(ValidationError);
    });

    test('validates tombstone cross-field constraint', () => {
      expect(() =>
        validatePartialConfiguration({
          tombstone: { ttl: 1000, minTtl: 2000 }, // ttl < minTtl
        })
      ).toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Default Configuration Tests
// ============================================================================

describe('Defaults', () => {
  describe('DEFAULT_CONFIG', () => {
    test('has all required fields', () => {
      expect(DEFAULT_CONFIG.database).toBe('stoneforge.db');
      expect(DEFAULT_CONFIG.sync).toBeDefined();
      expect(DEFAULT_CONFIG.playbooks).toBeDefined();
      expect(DEFAULT_CONFIG.tombstone).toBeDefined();
      expect(DEFAULT_CONFIG.identity).toBeDefined();
    });

    test('has correct default values', () => {
      expect(DEFAULT_CONFIG.actor).toBeUndefined();
      expect(DEFAULT_CONFIG.sync.autoExport).toBe(true);
      expect(DEFAULT_CONFIG.sync.exportDebounce).toBe(5 * ONE_MINUTE);
      expect(DEFAULT_CONFIG.identity.mode).toBe(IdentityMode.SOFT);
    });
  });

  describe('getDefaultConfig', () => {
    test('returns a new copy each time', () => {
      const a = getDefaultConfig();
      const b = getDefaultConfig();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    test('modifications do not affect other copies', () => {
      const a = getDefaultConfig();
      const b = getDefaultConfig();
      a.actor = 'modified';
      expect(b.actor).toBeUndefined();
    });
  });
});

// ============================================================================
// Merge Tests
// ============================================================================

describe('Merge', () => {
  describe('deepMerge', () => {
    test('merges simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      expect(deepMerge(target, source)).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('merges nested objects', () => {
      const target = { a: { x: 1, y: 2 } };
      const source = { a: { y: 3, z: 4 } };
      expect(deepMerge(target, source)).toEqual({ a: { x: 1, y: 3, z: 4 } });
    });

    test('replaces arrays', () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [4, 5] };
      expect(deepMerge(target, source)).toEqual({ items: [4, 5] });
    });

    test('skips undefined values', () => {
      const target = { a: 1, b: 2 };
      const source = { a: undefined, c: 3 };
      expect(deepMerge(target, source)).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('mergeConfiguration', () => {
    test('merges partial config into base', () => {
      const base = getDefaultConfig();
      const partial: PartialConfiguration = { actor: 'new-agent' };
      const result = mergeConfiguration(base, partial);
      expect(result.actor).toBe('new-agent');
      expect(result.database).toBe(base.database);
    });

    test('merges nested config', () => {
      const base = getDefaultConfig();
      const partial: PartialConfiguration = {
        sync: { autoExport: false },
      };
      const result = mergeConfiguration(base, partial);
      expect(result.sync.autoExport).toBe(false);
      expect(result.sync.exportDebounce).toBe(base.sync.exportDebounce);
    });
  });

  describe('mergeConfigurations', () => {
    test('merges multiple partials in order', () => {
      const base = getDefaultConfig();
      const first: PartialConfiguration = { actor: 'first' };
      const second: PartialConfiguration = { actor: 'second', database: 'new.db' };
      const result = mergeConfigurations(base, first, second);
      expect(result.actor).toBe('second');
      expect(result.database).toBe('new.db');
    });
  });

  describe('createConfiguration', () => {
    test('returns defaults when no partial', () => {
      const result = createConfiguration();
      expect(result).toEqual(getDefaultConfig());
    });

    test('merges partial into defaults', () => {
      const result = createConfiguration({ actor: 'test' });
      expect(result.actor).toBe('test');
      expect(result.database).toBe('stoneforge.db');
    });
  });

  describe('cloneConfiguration', () => {
    test('creates a deep copy', () => {
      const original = createTestConfig();
      const cloned = cloneConfiguration(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.sync).not.toBe(original.sync);
      expect(cloned.playbooks.paths).not.toBe(original.playbooks.paths);
    });
  });

  describe('diffConfigurations', () => {
    test('returns empty diff for equal configs', () => {
      const config = createTestConfig();
      const diff = diffConfigurations(config, cloneConfiguration(config));
      expect(Object.keys(diff)).toHaveLength(0);
    });

    test('returns differences', () => {
      const a = createTestConfig();
      const b = cloneConfiguration(a);
      b.actor = 'different';
      b.sync.autoExport = true;
      const diff = diffConfigurations(a, b);
      expect(diff.actor).toBe('different');
      expect(diff.sync?.autoExport).toBe(true);
    });
  });

  describe('configurationsEqual', () => {
    test('returns true for equal configs', () => {
      const a = createTestConfig();
      const b = cloneConfiguration(a);
      expect(configurationsEqual(a, b)).toBe(true);
    });

    test('returns false for different configs', () => {
      const a = createTestConfig();
      const b = cloneConfiguration(a);
      b.actor = 'different';
      expect(configurationsEqual(a, b)).toBe(false);
    });
  });
});

// ============================================================================
// YAML Tests
// ============================================================================

describe('YAML Handling', () => {
  describe('parseYamlConfig', () => {
    test('parses valid YAML', () => {
      const yaml = 'actor: test\ndatabase: test.db';
      const result = parseYamlConfig(yaml);
      expect(result.actor).toBe('test');
      expect(result.database).toBe('test.db');
    });

    test('returns empty object for empty YAML', () => {
      expect(parseYamlConfig('')).toEqual({});
    });

    test('throws on invalid YAML', () => {
      expect(() => parseYamlConfig(':::invalid')).toThrow(ValidationError);
    });

    test('throws on non-object YAML', () => {
      expect(() => parseYamlConfig('- item1\n- item2')).toThrow(ValidationError);
    });
  });

  describe('convertYamlToConfig', () => {
    test('converts snake_case to camelCase', () => {
      const yaml = {
        actor: 'test',
        sync: {
          auto_export: false,
          export_debounce: '5m',
        },
        identity: {
          time_tolerance: '10m',
        },
      };
      const result = convertYamlToConfig(yaml);
      expect(result.actor).toBe('test');
      expect(result.sync?.autoExport).toBe(false);
      expect(result.sync?.exportDebounce).toBe(300000);
      expect(result.identity?.timeTolerance).toBe(600000);
    });

    test('parses duration strings', () => {
      const yaml = {
        tombstone: {
          ttl: '30d',
          min_ttl: '7d',
        },
      };
      const result = convertYamlToConfig(yaml);
      expect(result.tombstone?.ttl).toBe(30 * ONE_DAY);
      expect(result.tombstone?.minTtl).toBe(7 * ONE_DAY);
    });

    test('throws on invalid identity mode', () => {
      const yaml = { identity: { mode: 'invalid' } };
      expect(() => convertYamlToConfig(yaml)).toThrow(ValidationError);
    });
  });

  describe('convertConfigToYaml', () => {
    test('converts camelCase to snake_case', () => {
      const config = createTestConfig();
      const yaml = convertConfigToYaml(config);
      expect(yaml.actor).toBe('test-agent');
      expect(yaml.sync?.auto_export).toBe(false);
      expect(yaml.sync?.export_debounce).toBe(1000);
      expect(yaml.identity?.time_tolerance).toBe(10 * ONE_MINUTE);
    });
  });

  describe('serializeConfigToYaml', () => {
    test('produces valid YAML string', () => {
      const config = createTestConfig();
      const yaml = serializeConfigToYaml(config);
      expect(yaml).toContain('actor: test-agent');
      expect(yaml).toContain('database: test.db');
    });
  });
});

// ============================================================================
// Path Expansion Tests
// ============================================================================

describe('Path Expansion', () => {
  describe('expandPath', () => {
    test('expands ~ to home directory', () => {
      const home = os.homedir();
      expect(expandPath('~/test')).toBe(path.join(home, 'test'));
      expect(expandPath('~/.stoneforge')).toBe(path.join(home, '.stoneforge'));
    });

    test('expands ~ alone', () => {
      expect(expandPath('~')).toBe(os.homedir());
    });

    test('leaves other paths unchanged', () => {
      expect(expandPath('/absolute/path')).toBe('/absolute/path');
      expect(expandPath('relative/path')).toBe('relative/path');
    });
  });

  describe('expandPlaybookPaths', () => {
    test('expands all paths', () => {
      const home = os.homedir();
      const paths = ['~/playbooks', '/absolute/path'];
      const result = expandPlaybookPaths(paths);
      expect(result).toEqual([path.join(home, 'playbooks'), '/absolute/path']);
    });
  });
});

// ============================================================================
// Environment Variable Tests
// ============================================================================

describe('Environment Variables', () => {
  describe('parseEnvBoolean', () => {
    test('parses truthy values', () => {
      expect(parseEnvBoolean('true')).toBe(true);
      expect(parseEnvBoolean('TRUE')).toBe(true);
      expect(parseEnvBoolean('1')).toBe(true);
      expect(parseEnvBoolean('yes')).toBe(true);
      expect(parseEnvBoolean('on')).toBe(true);
    });

    test('parses falsy values', () => {
      expect(parseEnvBoolean('false')).toBe(false);
      expect(parseEnvBoolean('FALSE')).toBe(false);
      expect(parseEnvBoolean('0')).toBe(false);
      expect(parseEnvBoolean('no')).toBe(false);
      expect(parseEnvBoolean('off')).toBe(false);
    });

    test('returns undefined for invalid values', () => {
      expect(parseEnvBoolean('maybe')).toBeUndefined();
      expect(parseEnvBoolean('')).toBeUndefined();
      expect(parseEnvBoolean(undefined)).toBeUndefined();
    });
  });

  describe('isEnvBoolean', () => {
    test('returns true for recognized values', () => {
      expect(isEnvBoolean('true')).toBe(true);
      expect(isEnvBoolean('false')).toBe(true);
      expect(isEnvBoolean('1')).toBe(true);
    });

    test('returns false for unrecognized values', () => {
      expect(isEnvBoolean('maybe')).toBe(false);
      expect(isEnvBoolean(undefined)).toBe(false);
    });
  });

  describe('parseEnvDuration', () => {
    test('parses number strings', () => {
      expect(parseEnvDuration('5000')).toBe(5000);
    });

    test('parses duration strings', () => {
      expect(parseEnvDuration('5m')).toBe(300000);
    });

    test('returns undefined for invalid values', () => {
      expect(parseEnvDuration('invalid')).toBeUndefined();
      expect(parseEnvDuration(undefined)).toBeUndefined();
    });
  });

  describe('loadEnvConfig', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // Restore environment
      Object.keys(EnvVars).forEach((key) => {
        const envVar = (EnvVars as Record<string, string>)[key];
        if (originalEnv[envVar] === undefined) {
          delete process.env[envVar];
        } else {
          process.env[envVar] = originalEnv[envVar];
        }
      });
    });

    test('loads actor from env', () => {
      process.env[EnvVars.ACTOR] = 'env-agent';
      const config = loadEnvConfig();
      expect(config.actor).toBe('env-agent');
    });

    test('loads database from env', () => {
      process.env[EnvVars.DATABASE] = 'env.db';
      const config = loadEnvConfig();
      expect(config.database).toBe('env.db');
    });

    test('loads auto export from env', () => {
      process.env[EnvVars.SYNC_AUTO_EXPORT] = 'false';
      const config = loadEnvConfig();
      expect(config.sync?.autoExport).toBe(false);
    });

    test('loads identity mode from env', () => {
      process.env[EnvVars.IDENTITY_MODE] = 'cryptographic';
      const config = loadEnvConfig();
      expect(config.identity?.mode).toBe(IdentityMode.CRYPTOGRAPHIC);
    });

    test('ignores invalid identity mode', () => {
      process.env[EnvVars.IDENTITY_MODE] = 'invalid';
      const config = loadEnvConfig();
      expect(config.identity?.mode).toBeUndefined();
    });

    test('ignores empty values', () => {
      process.env[EnvVars.ACTOR] = '';
      const config = loadEnvConfig();
      expect(config.actor).toBeUndefined();
    });
  });

  describe('getEnvVarInfo', () => {
    test('returns info for all env vars', () => {
      const info = getEnvVarInfo();
      expect(info.length).toBeGreaterThan(0);
      expect(info.some((i) => i.name === EnvVars.ACTOR)).toBe(true);
      expect(info.some((i) => i.name === EnvVars.DATABASE)).toBe(true);
    });
  });
});

// ============================================================================
// Configuration API Tests
// ============================================================================

describe('Configuration API', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  describe('getValueFromConfig', () => {
    test('gets top-level values', () => {
      const config = createTestConfig();
      expect(getValueFromConfig(config, 'actor')).toBe('test-agent');
      expect(getValueFromConfig(config, 'database')).toBe('test.db');
    });

    test('gets nested values', () => {
      const config = createTestConfig();
      expect(getValueFromConfig(config, 'sync.autoExport')).toBe(false);
      expect(getValueFromConfig(config, 'identity.mode')).toBe(IdentityMode.CRYPTOGRAPHIC);
    });
  });

  describe('loadConfig', () => {
    test('returns default config when no files/env', () => {
      const config = loadConfig({ skipEnv: true });
      expect(config.database).toBe('stoneforge.db');
    });

    test('applies CLI overrides', () => {
      const config = loadConfig({
        skipEnv: true,
        cliOverrides: { actor: 'cli-agent' },
      });
      expect(config.actor).toBe('cli-agent');
    });
  });

  describe('getConfig', () => {
    test('returns cached config on subsequent calls', () => {
      const first = getConfig();
      const second = getConfig();
      expect(first).toEqual(second);
    });

    test('returns clone, not original', () => {
      const first = getConfig();
      first.actor = 'modified';
      const second = getConfig();
      expect(second.actor).not.toBe('modified');
    });
  });

  describe('clearConfigCache', () => {
    test('clears the cache', () => {
      getConfig(); // Populate cache
      clearConfigCache();
      // Next call should reload
      const config = loadConfig({ skipEnv: true, cliOverrides: { actor: 'new-agent' } });
      expect(config.actor).toBe('new-agent');
    });
  });

  describe('getValue', () => {
    beforeEach(() => {
      clearConfigCache();
      // Load with defaults only (skip file to avoid project config interference)
      loadConfig({ skipEnv: true, skipFile: true, cliOverrides: { actor: 'test-agent' } });
    });

    test('gets top-level values', () => {
      expect(getValue('actor')).toBe('test-agent');
      expect(getValue('database')).toBe('stoneforge.db');
    });

    test('gets nested values', () => {
      expect(getValue('sync.autoExport')).toBe(true);
      expect(getValue('identity.mode')).toBe(IdentityMode.SOFT);
    });
  });
});

// ============================================================================
// Time Constant Tests
// ============================================================================

describe('Time Constants', () => {
  test('ONE_SECOND is correct', () => {
    expect(ONE_SECOND).toBe(1000);
  });

  test('ONE_MINUTE is correct', () => {
    expect(ONE_MINUTE).toBe(60 * 1000);
  });

  test('ONE_HOUR is correct', () => {
    expect(ONE_HOUR).toBe(60 * 60 * 1000);
  });

  test('ONE_DAY is correct', () => {
    expect(ONE_DAY).toBe(24 * 60 * 60 * 1000);
  });
});

// ============================================================================
// Validation Constants Tests
// ============================================================================

describe('Validation Constants', () => {
  test('MIN_EXPORT_DEBOUNCE is reasonable', () => {
    expect(MIN_EXPORT_DEBOUNCE).toBeGreaterThanOrEqual(100);
  });

  test('default export debounce meets minimum', () => {
    expect(DEFAULT_CONFIG.sync.exportDebounce).toBeGreaterThanOrEqual(MIN_EXPORT_DEBOUNCE);
  });

  test('default tombstone ttl is greater than minTtl', () => {
    expect(DEFAULT_CONFIG.tombstone.ttl).toBeGreaterThan(DEFAULT_CONFIG.tombstone.minTtl);
  });
});
