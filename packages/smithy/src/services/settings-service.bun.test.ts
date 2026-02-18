/**
 * Settings Service Unit Tests
 *
 * Tests for the SettingsService backed by SQLite.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createSettingsService, type SettingsService, type ServerAgentDefaults, SETTING_KEYS } from './settings-service.js';

describe('SettingsService', () => {
  let service: SettingsService;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = `/tmp/settings-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    const storage = createStorage({ path: testDbPath });
    initializeSchema(storage);
    service = createSettingsService(storage);
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('getSetting / setSetting', () => {
    test('returns undefined for non-existent key', () => {
      const result = service.getSetting('non-existent');
      expect(result).toBeUndefined();
    });

    test('stores and retrieves a string value', () => {
      service.setSetting('myKey', 'hello');
      const result = service.getSetting('myKey');
      expect(result).toBeDefined();
      expect(result!.key).toBe('myKey');
      expect(result!.value).toBe('hello');
      expect(result!.updatedAt).toBeDefined();
    });

    test('stores and retrieves an object value', () => {
      const obj = { foo: 'bar', baz: 42 };
      service.setSetting('objKey', obj);
      const result = service.getSetting('objKey');
      expect(result).toBeDefined();
      expect(result!.value).toEqual(obj);
    });

    test('upserts on duplicate key', () => {
      service.setSetting('key', 'first');
      service.setSetting('key', 'second');
      const result = service.getSetting('key');
      expect(result!.value).toBe('second');
    });

    test('updates timestamp on upsert', () => {
      service.setSetting('key', 'first');
      const first = service.getSetting('key')!;
      // Small delay to ensure timestamps differ
      service.setSetting('key', 'second');
      const second = service.getSetting('key')!;
      expect(second.updatedAt).toBeDefined();
      // Timestamps should be valid ISO dates
      expect(new Date(first.updatedAt).getTime()).not.toBeNaN();
      expect(new Date(second.updatedAt).getTime()).not.toBeNaN();
    });
  });

  describe('deleteSetting', () => {
    test('returns false for non-existent key', () => {
      const result = service.deleteSetting('non-existent');
      expect(result).toBe(false);
    });

    test('deletes and returns true for existing key', () => {
      service.setSetting('toDelete', 'value');
      const result = service.deleteSetting('toDelete');
      expect(result).toBe(true);
      expect(service.getSetting('toDelete')).toBeUndefined();
    });
  });

  describe('getAgentDefaults', () => {
    test('returns default empty object when no setting exists', () => {
      const defaults = service.getAgentDefaults();
      expect(defaults).toEqual({ defaultExecutablePaths: {} });
    });

    test('returns stored agent defaults', () => {
      const agentDefaults: ServerAgentDefaults = {
        defaultExecutablePaths: {
          claude: '/usr/local/bin/claude-dev',
          codex: '/opt/codex/bin/codex',
        },
      };
      service.setSetting(SETTING_KEYS.AGENT_DEFAULTS, agentDefaults);
      const result = service.getAgentDefaults();
      expect(result).toEqual(agentDefaults);
    });

    test('handles malformed data gracefully', () => {
      // Store something that doesn't match the expected shape
      service.setSetting(SETTING_KEYS.AGENT_DEFAULTS, { unexpected: true });
      const result = service.getAgentDefaults();
      expect(result).toEqual({ defaultExecutablePaths: {} });
    });

    test('returns stored fallbackChain', () => {
      const agentDefaults: ServerAgentDefaults = {
        defaultExecutablePaths: { claude: '/usr/local/bin/claude-dev' },
        fallbackChain: ['claude', 'codex', '/opt/backup/agent'],
      };
      service.setSetting(SETTING_KEYS.AGENT_DEFAULTS, agentDefaults);
      const result = service.getAgentDefaults();
      expect(result.fallbackChain).toEqual(['claude', 'codex', '/opt/backup/agent']);
    });

    test('returns undefined fallbackChain when not set (backward compatible)', () => {
      service.setSetting(SETTING_KEYS.AGENT_DEFAULTS, {
        defaultExecutablePaths: { claude: '/path' },
      });
      const result = service.getAgentDefaults();
      expect(result.fallbackChain).toBeUndefined();
    });

    test('filters non-string entries from fallbackChain on read', () => {
      // Directly store malformed data to test read-side validation
      service.setSetting(SETTING_KEYS.AGENT_DEFAULTS, {
        defaultExecutablePaths: {},
        fallbackChain: ['valid', 42, null, 'also-valid'],
      });
      const result = service.getAgentDefaults();
      expect(result.fallbackChain).toEqual(['valid', 'also-valid']);
    });

    test('ignores non-array fallbackChain on read', () => {
      service.setSetting(SETTING_KEYS.AGENT_DEFAULTS, {
        defaultExecutablePaths: {},
        fallbackChain: 'not-an-array',
      });
      const result = service.getAgentDefaults();
      expect(result.fallbackChain).toBeUndefined();
    });
  });

  describe('setAgentDefaults', () => {
    test('stores and returns validated agent defaults', () => {
      const input: ServerAgentDefaults = {
        defaultExecutablePaths: {
          claude: '/path/to/claude',
        },
      };
      const result = service.setAgentDefaults(input);
      expect(result).toEqual(input);
    });

    test('subsequent GET returns the updated value', () => {
      service.setAgentDefaults({
        defaultExecutablePaths: { claude: '/path/to/claude' },
      });
      const retrieved = service.getAgentDefaults();
      expect(retrieved.defaultExecutablePaths.claude).toBe('/path/to/claude');
    });

    test('filters out non-string values in defaultExecutablePaths', () => {
      const input = {
        defaultExecutablePaths: {
          claude: '/valid/path',
          invalid: 42 as unknown as string,
          alsoInvalid: null as unknown as string,
        },
      };
      const result = service.setAgentDefaults(input);
      expect(result.defaultExecutablePaths).toEqual({ claude: '/valid/path' });
    });

    test('handles empty defaultExecutablePaths', () => {
      const result = service.setAgentDefaults({ defaultExecutablePaths: {} });
      expect(result).toEqual({ defaultExecutablePaths: {} });
    });

    test('overwrites previous agent defaults', () => {
      service.setAgentDefaults({
        defaultExecutablePaths: { claude: '/old/path' },
      });
      service.setAgentDefaults({
        defaultExecutablePaths: { codex: '/new/path' },
      });
      const result = service.getAgentDefaults();
      expect(result.defaultExecutablePaths).toEqual({ codex: '/new/path' });
      expect(result.defaultExecutablePaths.claude).toBeUndefined();
    });

    test('stores and retrieves fallbackChain', () => {
      const result = service.setAgentDefaults({
        defaultExecutablePaths: { claude: '/path' },
        fallbackChain: ['claude', 'codex'],
      });
      expect(result.fallbackChain).toEqual(['claude', 'codex']);
      const retrieved = service.getAgentDefaults();
      expect(retrieved.fallbackChain).toEqual(['claude', 'codex']);
    });

    test('filters out non-string entries from fallbackChain', () => {
      const result = service.setAgentDefaults({
        defaultExecutablePaths: {},
        fallbackChain: ['valid', 123 as unknown as string, null as unknown as string, 'also-valid'],
      });
      expect(result.fallbackChain).toEqual(['valid', 'also-valid']);
    });

    test('ignores non-array fallbackChain value', () => {
      const result = service.setAgentDefaults({
        defaultExecutablePaths: {},
        fallbackChain: 'not-an-array' as unknown as string[],
      });
      expect(result.fallbackChain).toBeUndefined();
    });

    test('does not include fallbackChain when not provided', () => {
      const result = service.setAgentDefaults({
        defaultExecutablePaths: { claude: '/path' },
      });
      expect(result.fallbackChain).toBeUndefined();
    });

    test('stores empty fallbackChain array', () => {
      const result = service.setAgentDefaults({
        defaultExecutablePaths: {},
        fallbackChain: [],
      });
      expect(result.fallbackChain).toEqual([]);
    });
  });

  describe('persistence', () => {
    test('settings survive re-creating service with same database', () => {
      // Write with first service instance
      service.setAgentDefaults({
        defaultExecutablePaths: { claude: '/persisted/path' },
      });

      // Create new service pointing to same DB
      const storage2 = createStorage({ path: testDbPath });
      const service2 = createSettingsService(storage2);

      const result = service2.getAgentDefaults();
      expect(result.defaultExecutablePaths.claude).toBe('/persisted/path');
    });
  });
});
