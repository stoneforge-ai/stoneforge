/**
 * Provider Registry — Unit Tests
 *
 * Tests for provider registration, lookup, filtering by adapter type,
 * and factory functions (createProviderRegistry, createDefaultProviderRegistry).
 */

import { describe, expect, test } from 'bun:test';
import type {
  ExternalProvider,
  TaskSyncAdapter,
  DocumentSyncAdapter,
  SyncAdapterType,
  ProviderConfig,
  ExternalTask,
  ExternalTaskInput,
  TaskFieldMapConfig,
} from '@stoneforge/core';
import type { Timestamp } from '@stoneforge/core';
import {
  ProviderRegistry,
  createProviderRegistry,
  createDefaultProviderRegistry,
  createConfiguredProviderRegistry,
} from './provider-registry.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockTaskAdapter(): TaskSyncAdapter {
  return {
    async getIssue(_project: string, _externalId: string): Promise<ExternalTask | null> {
      return null;
    },
    async listIssuesSince(_project: string, _since: Timestamp): Promise<ExternalTask[]> {
      return [];
    },
    async createIssue(_project: string, _issue: ExternalTaskInput): Promise<ExternalTask> {
      throw new Error('Not implemented');
    },
    async updateIssue(
      _project: string,
      _externalId: string,
      _updates: Partial<ExternalTaskInput>
    ): Promise<ExternalTask> {
      throw new Error('Not implemented');
    },
    getFieldMapConfig(): TaskFieldMapConfig {
      return { provider: 'mock', fields: [] };
    },
  };
}

function createMockProvider(
  name: string,
  adapters: SyncAdapterType[] = ['task'],
  taskAdapter?: TaskSyncAdapter
): ExternalProvider {
  const adapter = taskAdapter ?? createMockTaskAdapter();
  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    supportedAdapters: adapters,
    async testConnection(_config: ProviderConfig): Promise<boolean> {
      return true;
    },
    getTaskAdapter: adapters.includes('task') ? () => adapter : undefined,
    getDocumentAdapter: adapters.includes('document')
      ? () => ({} as DocumentSyncAdapter)
      : undefined,
  };
}

// ============================================================================
// ProviderRegistry
// ============================================================================

describe('ProviderRegistry', () => {
  describe('register', () => {
    test('registers a provider', () => {
      const registry = new ProviderRegistry();
      const provider = createMockProvider('github');
      registry.register(provider);
      expect(registry.has('github')).toBe(true);
    });

    test('throws when registering a provider with duplicate name', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github'));
      expect(() => registry.register(createMockProvider('github'))).toThrow(
        /already registered/
      );
    });

    test('registers multiple providers with different names', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github'));
      registry.register(createMockProvider('linear'));
      expect(registry.has('github')).toBe(true);
      expect(registry.has('linear')).toBe(true);
    });
  });

  describe('get', () => {
    test('returns the provider if registered', () => {
      const registry = new ProviderRegistry();
      const provider = createMockProvider('github');
      registry.register(provider);
      expect(registry.get('github')).toBe(provider);
    });

    test('returns undefined for unregistered provider', () => {
      const registry = new ProviderRegistry();
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('list', () => {
    test('returns empty array when no providers registered', () => {
      const registry = new ProviderRegistry();
      expect(registry.list()).toEqual([]);
    });

    test('returns all registered providers', () => {
      const registry = new ProviderRegistry();
      const github = createMockProvider('github');
      const linear = createMockProvider('linear');
      registry.register(github);
      registry.register(linear);

      const result = registry.list();
      expect(result).toHaveLength(2);
      expect(result).toContain(github);
      expect(result).toContain(linear);
    });
  });

  describe('has', () => {
    test('returns true for registered provider', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github'));
      expect(registry.has('github')).toBe(true);
    });

    test('returns false for unregistered provider', () => {
      const registry = new ProviderRegistry();
      expect(registry.has('github')).toBe(false);
    });
  });

  describe('unregister', () => {
    test('removes a registered provider and returns true', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github'));
      expect(registry.unregister('github')).toBe(true);
      expect(registry.has('github')).toBe(false);
    });

    test('returns false for unregistered provider', () => {
      const registry = new ProviderRegistry();
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    test('removes all registered providers', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github'));
      registry.register(createMockProvider('linear'));
      registry.clear();
      expect(registry.list()).toEqual([]);
      expect(registry.has('github')).toBe(false);
      expect(registry.has('linear')).toBe(false);
    });
  });

  describe('getAdaptersOfType', () => {
    test('returns matching providers with their task adapters', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github', ['task']));
      registry.register(createMockProvider('notion', ['document']));

      const taskProviders = registry.getAdaptersOfType('task');
      expect(taskProviders).toHaveLength(1);
      expect(taskProviders[0].provider.name).toBe('github');
      expect(taskProviders[0].adapter).toBeDefined();
    });

    test('returns empty array when no providers match', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('notion', ['document']));

      const taskProviders = registry.getAdaptersOfType('task');
      expect(taskProviders).toEqual([]);
    });

    test('returns multiple matching providers', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github', ['task']));
      registry.register(createMockProvider('linear', ['task']));
      registry.register(createMockProvider('notion', ['document']));

      const taskProviders = registry.getAdaptersOfType('task');
      expect(taskProviders).toHaveLength(2);
    });

    test('returns document adapters when requested', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('notion', ['document']));
      registry.register(createMockProvider('github', ['task']));

      const docProviders = registry.getAdaptersOfType('document');
      expect(docProviders).toHaveLength(1);
      expect(docProviders[0].provider.name).toBe('notion');
    });

    test('returns empty array for message type when none registered', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider('github', ['task']));

      const msgProviders = registry.getAdaptersOfType('message');
      expect(msgProviders).toEqual([]);
    });
  });
});

// ============================================================================
// Factory Functions
// ============================================================================

describe('createProviderRegistry', () => {
  test('creates an empty registry', () => {
    const registry = createProviderRegistry();
    expect(registry).toBeInstanceOf(ProviderRegistry);
    expect(registry.list()).toEqual([]);
  });
});

describe('createDefaultProviderRegistry', () => {
  test('creates a registry with default providers', () => {
    const registry = createDefaultProviderRegistry();
    expect(registry).toBeInstanceOf(ProviderRegistry);
    expect(registry.has('github')).toBe(true);
    expect(registry.has('linear')).toBe(true);
  });

  test('default providers include task adapter support', () => {
    const registry = createDefaultProviderRegistry();
    const github = registry.get('github');
    expect(github).toBeDefined();
    expect(github!.supportedAdapters).toContain('task');
  });

  test('default GitHub provider is a placeholder that throws on adapter use', () => {
    const registry = createDefaultProviderRegistry();
    const github = registry.get('github')!;
    const adapter = github.getTaskAdapter!();
    expect(adapter.getIssue('owner/repo', '1')).rejects.toThrow(/not configured/);
  });

  test('default Linear provider is a placeholder that throws on adapter use', () => {
    const registry = createDefaultProviderRegistry();
    const linear = registry.get('linear')!;
    const adapter = linear.getTaskAdapter!();
    expect(adapter.getIssue('team', '1')).rejects.toThrow(/not.*configured/);
  });
});

// ============================================================================
// createConfiguredProviderRegistry
// ============================================================================

describe('createConfiguredProviderRegistry', () => {
  test('creates a registry with both providers when no configs have tokens', () => {
    const registry = createConfiguredProviderRegistry([]);
    expect(registry).toBeInstanceOf(ProviderRegistry);
    expect(registry.has('github')).toBe(true);
    expect(registry.has('linear')).toBe(true);
  });

  test('keeps placeholder when config has no token', () => {
    const registry = createConfiguredProviderRegistry([
      { provider: 'github' },
    ]);
    const github = registry.get('github')!;
    // Placeholder adapter should throw on use
    const adapter = github.getTaskAdapter!();
    expect(adapter.getIssue('owner/repo', '1')).rejects.toThrow(/not configured/);
  });

  test('replaces GitHub placeholder with configured provider when token is set', () => {
    const registry = createConfiguredProviderRegistry([
      { provider: 'github', token: 'ghp_test123', defaultProject: 'owner/repo' },
    ]);
    const github = registry.get('github')!;
    expect(github).toBeDefined();
    expect(github.name).toBe('github');
    // A configured provider should NOT throw the placeholder message
    // (it will throw a network error instead since the token is fake, but not "not configured")
    const adapter = github.getTaskAdapter!();
    expect(adapter.getIssue('owner/repo', '1')).rejects.not.toThrow(/not configured/);
  });

  test('replaces Linear placeholder with configured provider when token is set', () => {
    const registry = createConfiguredProviderRegistry([
      { provider: 'linear', token: 'lin_api_test123' },
    ]);
    const linear = registry.get('linear')!;
    expect(linear).toBeDefined();
    expect(linear.name).toBe('linear');
    // A configured provider should NOT throw the placeholder message
    const adapter = linear.getTaskAdapter!();
    expect(adapter.getIssue('team', '1')).rejects.not.toThrow(/not configured/);
  });

  test('replaces only providers with tokens, keeps others as placeholders', () => {
    const registry = createConfiguredProviderRegistry([
      { provider: 'github', token: 'ghp_test123', defaultProject: 'owner/repo' },
      { provider: 'linear' }, // no token
    ]);
    // GitHub should be configured (not placeholder)
    const github = registry.get('github')!;
    const githubAdapter = github.getTaskAdapter!();
    expect(githubAdapter.getIssue('owner/repo', '1')).rejects.not.toThrow(/not configured/);

    // Linear should still be placeholder
    const linear = registry.get('linear')!;
    const linearAdapter = linear.getTaskAdapter!();
    expect(linearAdapter.getIssue('team', '1')).rejects.toThrow(/not.*configured/);
  });

  test('ignores unknown provider names gracefully', () => {
    const registry = createConfiguredProviderRegistry([
      { provider: 'unknown-provider', token: 'some_token' },
    ]);
    // Known providers should still be placeholders
    expect(registry.has('github')).toBe(true);
    expect(registry.has('linear')).toBe(true);
    // Unknown provider should not be registered
    expect(registry.has('unknown-provider')).toBe(false);
  });

  test('handles multiple configs for the same provider (last wins)', () => {
    // The second config for github should replace the first
    const registry = createConfiguredProviderRegistry([
      { provider: 'github', token: 'ghp_first', defaultProject: 'owner/repo1' },
    ]);
    const github = registry.get('github')!;
    expect(github).toBeDefined();
    expect(github.name).toBe('github');
  });
});
