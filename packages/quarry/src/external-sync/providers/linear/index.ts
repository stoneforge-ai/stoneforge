/**
 * Linear Provider — exports for the Linear external sync provider
 *
 * Provides:
 * - LinearApiClient: GraphQL API client for Linear
 * - LinearTaskAdapter: TaskSyncAdapter implementation for Linear issues
 * - LinearProvider: ExternalProvider implementation (via factory functions)
 * - Field mapping utilities for priority and workflow state conversion
 * - Linear API response types
 */

// Provider factory functions
export {
  createLinearProvider,
  createLinearPlaceholderProvider,
} from './linear-provider.js';
export type { CreateLinearProviderOptions } from './linear-provider.js';

// Task adapter
export { LinearTaskAdapter } from './linear-task-adapter.js';

// Field mapping
export {
  stoneforgePriorityToLinear,
  linearPriorityToStoneforge,
  linearStateTypeToStatus,
  statusToLinearStateType,
  shouldAddBlockedLabel,
  createLinearFieldMapConfig,
  createLinearSyncFieldMapConfig,
} from './linear-field-map.js';
export type { LinearStateType } from './linear-field-map.js';

// API client
export { LinearApiClient, LinearApiError, isLinearApiError } from './linear-api.js';
export type {
  LinearApiClientOptions,
  RateLimitInfo,
  GraphQLError,
  CreateIssueInput,
  UpdateIssueInput,
} from './linear-api.js';

// Types
export type {
  LinearIssue,
  LinearTeam,
  LinearUser,
  LinearLabel,
  LinearWorkflowState,
  LinearPageInfo,
  LinearConnection,
} from './linear-types.js';
