/**
 * GitHub Placeholder Provider
 *
 * Placeholder implementation of the GitHub ExternalProvider.
 * Registers the provider shape so the registry can be populated at startup.
 * The actual GitHub API integration will be implemented in a later task.
 *
 * All adapter methods throw NotImplementedError to indicate they are placeholders.
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

// ============================================================================
// Placeholder Task Adapter
// ============================================================================

const PLACEHOLDER_MESSAGE =
  'GitHub task sync adapter is not yet implemented. Configure the full GitHub provider to enable sync.';

/**
 * Placeholder TaskSyncAdapter for GitHub.
 * All methods throw to indicate they are not yet implemented.
 * Will be replaced by the real implementation in a later task.
 */
class GitHubPlaceholderTaskAdapter implements TaskSyncAdapter {
  async getIssue(_project: string, _externalId: string): Promise<ExternalTask | null> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async listIssuesSince(_project: string, _since: Timestamp): Promise<ExternalTask[]> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async createIssue(_project: string, _issue: ExternalTaskInput): Promise<ExternalTask> {
    throw new Error(PLACEHOLDER_MESSAGE);
  }

  async updateIssue(
    _project: string,
    _externalId: string,
    _updates: Partial<ExternalTaskInput>
  ): Promise<ExternalTask> {
    throw new Error(PLACEHOLDER_MESSAGE);
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

// ============================================================================
// Placeholder GitHub Provider
// ============================================================================

/**
 * Placeholder GitHub ExternalProvider.
 *
 * Declares GitHub as a known provider that supports task sync.
 * Connection testing always returns false (not configured).
 * The actual implementation will be provided in a later task.
 */
class GitHubPlaceholderProvider implements ExternalProvider {
  readonly name = 'github';
  readonly displayName = 'GitHub';
  readonly supportedAdapters: readonly SyncAdapterType[] = ['task'];

  private readonly taskAdapter = new GitHubPlaceholderTaskAdapter();

  async testConnection(_config: ProviderConfig): Promise<boolean> {
    // Placeholder: always returns false (not configured)
    return false;
  }

  getTaskAdapter(): TaskSyncAdapter {
    return this.taskAdapter;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a placeholder GitHub provider.
 *
 * The provider is registered by default in the provider registry so that
 * the system knows GitHub is an available provider. The actual API
 * integration will replace this in a later task.
 *
 * @returns A placeholder GitHub ExternalProvider
 */
export function createGitHubPlaceholderProvider(): ExternalProvider {
  return new GitHubPlaceholderProvider();
}
