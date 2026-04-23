/**
 * Notion External Provider
 *
 * Implements the ExternalProvider interface for Notion.
 * Handles connection testing via the Notion API and provides a
 * DocumentSyncAdapter for bidirectional page synchronization.
 *
 * The provider uses a NotionApiClient for all API interactions.
 * Connection testing calls GET /users/me to verify the token.
 *
 * Configuration:
 * - Token: set via `sf external-sync config set-token notion ntn_xxxxx`
 * - Project (database ID): set via `sf external-sync config set-project notion <database-id>`
 *
 * @example
 * ```typescript
 * const provider = createNotionProvider({ token: 'ntn_...' });
 * const registry = createProviderRegistry();
 * registry.register(provider);
 *
 * // Test connection
 * const connected = await provider.testConnection({ provider: 'notion', token: 'ntn_...' });
 *
 * // Get document adapter
 * const adapter = provider.getDocumentAdapter();
 * const page = await adapter.getPage('database-id', 'page-id');
 * ```
 */

import type {
  ExternalProvider,
  ProviderConfig,
  SyncAdapterType,
  DocumentSyncAdapter,
  ExternalDocument,
  ExternalDocumentInput,
} from '@stoneforge/core';
import type { Timestamp } from '@stoneforge/core';
import { NotionApiClient } from './notion-api.js';
import { NotionDocumentAdapter } from './notion-document-adapter.js';

// ============================================================================
// Constants
// ============================================================================

/** Notion API base URL for connection testing */
const NOTION_API_BASE = 'https://api.notion.com/v1';

/** Default Notion API version header */
const DEFAULT_NOTION_VERSION = '2022-06-28';

// ============================================================================
// NotionProvider
// ============================================================================

/**
 * ExternalProvider implementation for Notion.
 *
 * Supports document sync only. Connection testing calls GET /users/me
 * to verify the integration token is valid.
 */
class NotionProvider implements ExternalProvider {
  readonly name = 'notion';
  readonly displayName = 'Notion';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['document'];

  private readonly documentAdapter: NotionDocumentAdapter;

  constructor(api: NotionApiClient) {
    this.documentAdapter = new NotionDocumentAdapter(api);
  }

  /**
   * Test whether the Notion connection is valid.
   *
   * Calls GET /users/me to verify the integration token has valid
   * permissions. Uses a raw fetch call (like the GitHub provider)
   * since the API client doesn't expose a user endpoint.
   *
   * @param config - Provider configuration with token to test
   * @returns true if the connection is valid, false otherwise
   */
  async testConnection(config: ProviderConfig): Promise<boolean> {
    if (!config.token) {
      return false;
    }

    try {
      const response = await fetch(`${NOTION_API_BASE}/users/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Notion-Version': DEFAULT_NOTION_VERSION,
        },
      });

      return response.ok;
    } catch {
      // Network errors, DNS failures, etc.
      return false;
    }
  }

  /**
   * Returns the Notion document sync adapter.
   *
   * @returns NotionDocumentAdapter for Notion page sync
   */
  getDocumentAdapter(): DocumentSyncAdapter {
    return this.documentAdapter;
  }
}

// ============================================================================
// Placeholder Provider
// ============================================================================

const PLACEHOLDER_MESSAGE =
  'Notion document sync adapter is not configured. Set a token via `sf external-sync config set-token notion <token>` to enable sync.';

/**
 * Placeholder DocumentSyncAdapter for Notion.
 * All methods throw to indicate they are not yet configured.
 */
class NotionPlaceholderDocumentAdapter implements DocumentSyncAdapter {
  async getPage(_project: string, _externalId: string): Promise<ExternalDocument | null> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async listPagesSince(_project: string, _since: Timestamp): Promise<ExternalDocument[]> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async createPage(
    _project: string,
    _page: ExternalDocumentInput
  ): Promise<ExternalDocument> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async updatePage(
    _project: string,
    _externalId: string,
    _updates: Partial<ExternalDocumentInput>
  ): Promise<ExternalDocument> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }
}

/**
 * Placeholder Notion ExternalProvider.
 *
 * Declares Notion as a known provider that supports document sync.
 * Connection testing always returns false (not configured).
 * The actual provider is created with createNotionProvider() when configured.
 */
class NotionPlaceholderProvider implements ExternalProvider {
  readonly name = 'notion';
  readonly displayName = 'Notion';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['document'];

  private readonly documentAdapter = new NotionPlaceholderDocumentAdapter();

  async testConnection(_config: ProviderConfig): Promise<boolean> {
    return false;
  }

  getDocumentAdapter(): DocumentSyncAdapter {
    return this.documentAdapter;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Options for creating a Notion provider.
 */
export interface CreateNotionProviderOptions {
  /** Notion integration token */
  token: string;
}

/**
 * Create a configured Notion provider.
 *
 * The provider is fully configured with the given token and ready
 * for registration in the provider registry.
 *
 * @param options - Configuration including the integration token
 * @returns A configured Notion ExternalProvider
 */
export function createNotionProvider(
  options: CreateNotionProviderOptions
): ExternalProvider {
  const api = new NotionApiClient({ token: options.token });
  return new NotionProvider(api);
}

/**
 * Create a placeholder Notion provider for registry registration.
 *
 * Similar to the GitHub and Linear placeholders — registers the provider
 * shape so the registry knows Notion is available. Connection testing
 * always returns false. All adapter methods throw descriptive errors.
 *
 * @returns A placeholder Notion ExternalProvider
 */
export function createNotionPlaceholderProvider(): ExternalProvider {
  return new NotionPlaceholderProvider();
}
