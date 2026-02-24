/**
 * Linear External Provider
 *
 * Implements the ExternalProvider interface for Linear.
 * Handles connection validation and provides access to the LinearTaskAdapter.
 *
 * Architecture:
 * - Provider handles auth configuration and connection testing
 * - Task adapter handles issue CRUD operations and field mapping
 * - API client handles GraphQL requests and rate limiting
 *
 * @example
 * ```typescript
 * const provider = createLinearProvider({ apiKey: 'lin_api_...' });
 * const registry = createProviderRegistry();
 * registry.register(provider);
 *
 * // Test connection
 * const connected = await provider.testConnection({ provider: 'linear', token: 'lin_api_...' });
 *
 * // Get task adapter
 * const adapter = provider.getTaskAdapter();
 * const issues = await adapter.listIssuesSince('ENG', '2024-01-01T00:00:00Z');
 * ```
 */

import type {
  ExternalProvider,
  ProviderConfig,
  SyncAdapterType,
  TaskSyncAdapter,
} from '@stoneforge/core';

import { LinearApiClient } from './linear-api.js';
import { LinearTaskAdapter } from './linear-task-adapter.js';

// ============================================================================
// LinearProvider
// ============================================================================

/**
 * ExternalProvider implementation for Linear.
 *
 * Supports task sync only. Connection testing uses the getViewer() API call
 * to verify the API key is valid.
 */
class LinearProvider implements ExternalProvider {
  readonly name = 'linear';
  readonly displayName = 'Linear';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['task'];

  private readonly taskAdapter: LinearTaskAdapter;

  constructor(api: LinearApiClient) {
    this.taskAdapter = new LinearTaskAdapter(api);
  }

  /**
   * Test whether the connection to Linear is valid.
   *
   * Calls getViewer() to verify the API key works. The config parameter
   * provides the token for providers that are configured dynamically,
   * but this provider was constructed with a client already.
   *
   * @param _config - Provider configuration (token is already set in client)
   * @returns true if the connection is valid, false otherwise
   */
  async testConnection(_config: ProviderConfig): Promise<boolean> {
    try {
      // Use a temporary client if config provides a different token,
      // or fall back to testing the existing adapter's connection
      const viewer = await this.getApiClient().getViewer();
      return viewer !== null && viewer !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Returns the task sync adapter.
   */
  getTaskAdapter(): TaskSyncAdapter {
    return this.taskAdapter;
  }

  /**
   * Access the underlying API client (used internally for connection testing).
   */
  private getApiClient(): LinearApiClient {
    // The API client is encapsulated in the task adapter.
    // For connection testing, we construct a minimal client inline.
    // This is a workaround; in the full implementation, the provider
    // would hold a direct reference to the client.
    return (this.taskAdapter as unknown as { api: LinearApiClient }).api;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Options for creating a Linear provider.
 */
export interface CreateLinearProviderOptions {
  /** Linear API key for authentication */
  apiKey: string;
}

/**
 * Create a Linear ExternalProvider.
 *
 * The provider is fully configured with the given API key and ready
 * for registration in the provider registry.
 *
 * @param options - Configuration including the API key
 * @returns A configured Linear ExternalProvider
 */
export function createLinearProvider(options: CreateLinearProviderOptions): ExternalProvider {
  const api = new LinearApiClient({ apiKey: options.apiKey });
  return new LinearProvider(api);
}

/**
 * Create a placeholder Linear provider for registry registration.
 *
 * Similar to the GitHub placeholder — registers the provider shape so the
 * registry knows Linear is available. Connection testing always returns false.
 * The actual provider is created with createLinearProvider() when configured.
 */
export function createLinearPlaceholderProvider(): ExternalProvider {
  return new LinearPlaceholderProvider();
}

// ============================================================================
// Placeholder Provider (for default registry)
// ============================================================================

const PLACEHOLDER_MESSAGE =
  'Linear task sync adapter is not yet configured. Set a Linear API key to enable sync.';

/**
 * Placeholder TaskSyncAdapter for Linear.
 * All methods throw to indicate they are not yet configured.
 */
class LinearPlaceholderTaskAdapter implements TaskSyncAdapter {
  async getIssue(_project: string, _externalId: string): Promise<null> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async listIssuesSince(_project: string, _since: string): Promise<never[]> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async createIssue(_project: string, _issue: unknown): Promise<never> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async updateIssue(_project: string, _externalId: string, _updates: unknown): Promise<never> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  getFieldMapConfig() {
    // Return the field map config even in placeholder mode
    // so the system can introspect the mapping shape
    return {
      provider: 'linear',
      fields: [
        {
          localField: 'title',
          externalField: 'title',
          direction: 'bidirectional' as const,
        },
        {
          localField: 'status',
          externalField: 'state',
          direction: 'bidirectional' as const,
        },
        {
          localField: 'priority',
          externalField: 'priority',
          direction: 'bidirectional' as const,
        },
      ],
    };
  }
}

/**
 * Placeholder Linear ExternalProvider.
 * Declares Linear as a known provider that supports task sync.
 * Connection testing always returns false (not configured).
 */
class LinearPlaceholderProvider implements ExternalProvider {
  readonly name = 'linear';
  readonly displayName = 'Linear';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['task'];

  private readonly taskAdapter = new LinearPlaceholderTaskAdapter();

  async testConnection(_config: ProviderConfig): Promise<boolean> {
    return false;
  }

  getTaskAdapter(): TaskSyncAdapter {
    return this.taskAdapter;
  }
}
