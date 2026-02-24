/**
 * Provider Registry — manages ExternalProvider registrations
 *
 * Provides a central registry for external sync providers (GitHub, Linear, etc.).
 * Supports registration, lookup by name, listing all providers, and querying
 * providers by adapter type.
 *
 * Usage:
 * ```typescript
 * import { createProviderRegistry } from '@stoneforge/quarry';
 *
 * const registry = createProviderRegistry();
 * registry.register(myProvider);
 * const github = registry.get('github');
 * const taskProviders = registry.getAdaptersOfType('task');
 * ```
 */

import type {
  ExternalProvider,
  SyncAdapterType,
  TaskSyncAdapter,
  DocumentSyncAdapter,
  MessageSyncAdapter,
} from '@stoneforge/core';
import { createGitHubPlaceholderProvider } from './providers/github/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result from getAdaptersOfType — a provider and its adapter for the requested type
 */
export interface ProviderAdapterEntry {
  readonly provider: ExternalProvider;
  readonly adapter: TaskSyncAdapter | DocumentSyncAdapter | MessageSyncAdapter;
}

// ============================================================================
// ProviderRegistry
// ============================================================================

/**
 * Registry for external sync providers.
 *
 * Manages registration and lookup of ExternalProvider instances.
 * Providers are keyed by their `name` property (e.g., 'github', 'linear').
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, ExternalProvider>();

  /**
   * Register a provider.
   *
   * @param provider - The provider to register
   * @throws Error if a provider with the same name is already registered
   */
  register(provider: ExternalProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(
        `Provider '${provider.name}' is already registered. ` +
          `Unregister it first or use a different name.`
      );
    }
    this.providers.set(provider.name, provider);
  }

  /**
   * Look up a provider by name.
   *
   * @param name - The provider name (e.g., 'github')
   * @returns The provider, or undefined if not found
   */
  get(name: string): ExternalProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * List all registered providers.
   *
   * @returns Array of all registered providers
   */
  list(): ExternalProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Find all providers that support a given adapter type, and return
   * the provider paired with its adapter for that type.
   *
   * @param type - The adapter type to filter by ('task', 'document', 'message')
   * @returns Array of { provider, adapter } for all matching providers
   */
  getAdaptersOfType(type: SyncAdapterType): ProviderAdapterEntry[] {
    const results: ProviderAdapterEntry[] = [];

    for (const provider of this.providers.values()) {
      if (!provider.supportedAdapters.includes(type)) {
        continue;
      }

      const adapter = getAdapterByType(provider, type);
      if (adapter) {
        results.push({ provider, adapter });
      }
    }

    return results;
  }

  /**
   * Check if a provider is registered.
   *
   * @param name - The provider name
   * @returns true if the provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Unregister a provider by name.
   *
   * @param name - The provider name to remove
   * @returns true if the provider was removed, false if not found
   */
  unregister(name: string): boolean {
    return this.providers.delete(name);
  }

  /**
   * Remove all registered providers.
   */
  clear(): void {
    this.providers.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the adapter from a provider for a given adapter type.
 */
function getAdapterByType(
  provider: ExternalProvider,
  type: SyncAdapterType
): TaskSyncAdapter | DocumentSyncAdapter | MessageSyncAdapter | undefined {
  switch (type) {
    case 'task':
      return provider.getTaskAdapter?.();
    case 'document':
      return provider.getDocumentAdapter?.();
    case 'message':
      return provider.getMessageAdapter?.();
    default:
      return undefined;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new ProviderRegistry instance.
 *
 * @returns A new, empty ProviderRegistry
 */
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}

/**
 * Create a ProviderRegistry with default providers registered.
 *
 * Registers the GitHub placeholder provider by default.
 * The actual GitHub provider implementation will replace this in a later task.
 *
 * @returns A ProviderRegistry with default providers
 */
export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(createGitHubPlaceholderProvider());
  return registry;
}
