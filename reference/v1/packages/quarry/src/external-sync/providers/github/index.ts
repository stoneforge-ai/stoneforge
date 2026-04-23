/**
 * GitHub Provider — exports for the GitHub external sync provider
 *
 * Exports the full GitHub provider implementation, task adapter,
 * field mapping configuration, and API client.
 */

// Provider factories
export { createGitHubProvider, createGitHubPlaceholderProvider } from './github-provider.js';

// Task adapter
export { GitHubTaskAdapter, getDefaultLabelColor } from './github-task-adapter.js';

// Field mapping configuration
export {
  GITHUB_FIELD_MAP_CONFIG,
  GITHUB_PRIORITY_LABELS,
  GITHUB_TASK_TYPE_LABELS,
  GITHUB_SYNC_LABEL_PREFIX,
  statusToGitHubState,
  gitHubStateToStatus,
} from './github-field-map.js';

// API client (re-export for convenience)
export { GitHubApiClient, GitHubApiError, isGitHubApiError } from './github-api.js';
export type {
  GitHubIssue,
  GitHubLabel,
  GitHubUser,
  GitHubApiClientOptions,
  ListIssuesOptions,
  CreateIssueInput,
  CreateLabelInput,
  UpdateIssueInput,
  RateLimitInfo,
} from './github-api.js';
