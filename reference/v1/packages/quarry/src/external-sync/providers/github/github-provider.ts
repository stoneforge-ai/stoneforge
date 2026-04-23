/**
 * GitHub Provider
 *
 * Full implementation of the GitHub ExternalProvider.
 * Handles connection testing via the GitHub API and provides
 * a TaskSyncAdapter for bidirectional task/issue synchronization.
 *
 * The provider uses a lazy-initialized GitHubTaskAdapter that
 * requires a ProviderConfig with a valid token before use.
 *
 * Also exports the placeholder provider for backward compatibility
 * with systems that register the provider before configuration.
 */

import type {
  ExternalProvider,
  ProviderConfig,
  SyncAdapterType,
  TaskSyncAdapter,
  ExternalTask,
  ExternalTaskInput,
  TaskFieldMapConfig,
} from '@stoneforge/core';
import type { Timestamp } from '@stoneforge/core';
import { GitHubTaskAdapter } from './github-task-adapter.js';

// ============================================================================
// GitHub Provider (Full Implementation)
// ============================================================================

/**
 * GitHub ExternalProvider implementation.
 *
 * Provides connection testing and a TaskSyncAdapter for GitHub Issues.
 * The task adapter is created on demand with the configured token.
 *
 * Usage:
 * ```typescript
 * const provider = createGitHubProvider({ token: 'ghp_...' });
 * const connected = await provider.testConnection(config);
 * const adapter = provider.getTaskAdapter();
 * ```
 */
class GitHubProvider implements ExternalProvider {
  readonly name = 'github';
  readonly displayName = 'GitHub';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['task'];

  private taskAdapter: GitHubTaskAdapter | null = null;
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;

    // Initialize the task adapter if a token is available
    if (config.token) {
      this.taskAdapter = new GitHubTaskAdapter({
        token: config.token,
        apiBaseUrl: config.apiBaseUrl,
      });
    }
  }

  /**
   * Test whether the GitHub connection is valid by calling GET /user.
   *
   * This verifies that the configured token is valid and has the
   * necessary permissions to access the GitHub API.
   *
   * @param config - Provider configuration with token to test
   * @returns true if the connection is valid, false otherwise
   */
  async testConnection(config: ProviderConfig): Promise<boolean> {
    if (!config.token) {
      return false;
    }

    const baseUrl = (config.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');

    try {
      const response = await fetch(`${baseUrl}/user`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      return response.ok;
    } catch {
      // Network errors, DNS failures, etc.
      return false;
    }
  }

  /**
   * Returns the GitHubTaskAdapter instance.
   *
   * The adapter is initialized with the token from the provider config.
   * Throws if no token was configured (provider not yet set up).
   *
   * @returns GitHubTaskAdapter for GitHub Issues sync
   * @throws Error if no token is configured
   */
  getTaskAdapter(): TaskSyncAdapter {
    if (!this.taskAdapter) {
      throw new Error(
        'GitHub provider is not configured. Set a token via provider config before using the task adapter.'
      );
    }
    return this.taskAdapter;
  }
}

// ============================================================================
// Placeholder Provider (Backward Compatibility)
// ============================================================================

/**
 * Placeholder TaskSyncAdapter for GitHub.
 * All methods throw to indicate they are not yet implemented.
 * Used when the provider is registered without configuration.
 */
class GitHubPlaceholderTaskAdapter implements TaskSyncAdapter {
  private static readonly PLACEHOLDER_MESSAGE =
    'GitHub task sync adapter is not configured. Set a token via provider config to enable sync.';

  async getIssue(_project: string, _externalId: string): Promise<ExternalTask | null> {
    throw new Error(GitHubPlaceholderTaskAdapter.PLACEHOLDER_MESSAGE);
  }

  async listIssuesSince(_project: string, _since: Timestamp): Promise<ExternalTask[]> {
    throw new Error(GitHubPlaceholderTaskAdapter.PLACEHOLDER_MESSAGE);
  }

  async createIssue(_project: string, _issue: ExternalTaskInput): Promise<ExternalTask> {
    throw new Error(GitHubPlaceholderTaskAdapter.PLACEHOLDER_MESSAGE);
  }

  async updateIssue(
    _project: string,
    _externalId: string,
    _updates: Partial<ExternalTaskInput>
  ): Promise<ExternalTask> {
    throw new Error(GitHubPlaceholderTaskAdapter.PLACEHOLDER_MESSAGE);
  }

  getFieldMapConfig(): TaskFieldMapConfig {
    return {
      provider: 'github',
      fields: [
        {
          localField: 'title',
          externalField: 'title',
          direction: 'bidirectional',
        },
        {
          localField: 'descriptionRef',
          externalField: 'body',
          direction: 'bidirectional',
          toExternal: 'hydrateDescription',
          toLocal: 'createDescriptionDoc',
        },
        {
          localField: 'status',
          externalField: 'state',
          direction: 'bidirectional',
          toExternal: 'statusToGitHubState',
          toLocal: 'gitHubStateToStatus',
        },
        {
          localField: 'tags',
          externalField: 'labels',
          direction: 'bidirectional',
        },
        {
          localField: 'priority',
          externalField: 'labels',
          direction: 'bidirectional',
          toExternal: 'priorityToLabel',
          toLocal: 'labelToPriority',
        },
        {
          localField: 'taskType',
          externalField: 'labels',
          direction: 'bidirectional',
          toExternal: 'taskTypeToLabel',
          toLocal: 'labelToTaskType',
        },
        {
          localField: 'assignee',
          externalField: 'assignees',
          direction: 'bidirectional',
        },
      ],
    };
  }
}

/**
 * Placeholder GitHub ExternalProvider.
 *
 * Used when the provider is registered in the registry before configuration.
 * Connection testing always returns false. The task adapter throws on all operations.
 */
class GitHubPlaceholderProvider implements ExternalProvider {
  readonly name = 'github';
  readonly displayName = 'GitHub';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['task'];

  private readonly taskAdapter = new GitHubPlaceholderTaskAdapter();

  async testConnection(_config: ProviderConfig): Promise<boolean> {
    return false;
  }

  getTaskAdapter(): TaskSyncAdapter {
    return this.taskAdapter;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a configured GitHub provider.
 *
 * The provider is ready to use for sync operations when a valid
 * token is provided in the config. The task adapter is initialized
 * immediately with the provided credentials.
 *
 * @param config - Provider configuration with token and optional apiBaseUrl
 * @returns A fully configured GitHub ExternalProvider
 */
export function createGitHubProvider(config: ProviderConfig): ExternalProvider {
  return new GitHubProvider(config);
}

/**
 * Create a placeholder GitHub provider.
 *
 * The provider is registered by default in the provider registry so that
 * the system knows GitHub is an available provider. Connection testing
 * always returns false and all adapter methods throw until configured.
 *
 * @returns A placeholder GitHub ExternalProvider
 */
export function createGitHubPlaceholderProvider(): ExternalProvider {
  return new GitHubPlaceholderProvider();
}
