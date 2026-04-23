/**
 * Linear API Response Types
 *
 * Type definitions for Linear's GraphQL API responses.
 * These types represent the subset of Linear's schema used by the sync provider.
 *
 * @see https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

// ============================================================================
// Core Entity Types
// ============================================================================

/**
 * Linear issue representation matching the fields we query.
 *
 * Priority values:
 *   0 = No priority
 *   1 = Urgent
 *   2 = High
 *   3 = Medium
 *   4 = Low
 */
export interface LinearIssue {
  /** Unique UUID identifier */
  readonly id: string;
  /** Human-readable identifier (e.g., "ENG-123") */
  readonly identifier: string;
  /** Issue title */
  readonly title: string;
  /** Issue description (markdown) */
  readonly description: string | null;
  /** Priority level (0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low) */
  readonly priority: number;
  /** URL to view the issue in Linear */
  readonly url: string;
  /** Current workflow state */
  readonly state: LinearWorkflowState;
  /** Assigned user, or null if unassigned */
  readonly assignee: LinearUser | null;
  /** Team the issue belongs to */
  readonly team: LinearTeam;
  /** Labels attached to the issue */
  readonly labels: { readonly nodes: readonly LinearLabel[] };
  /** Creation timestamp (ISO 8601) */
  readonly createdAt: string;
  /** Last update timestamp (ISO 8601) */
  readonly updatedAt: string;
  /** Archive timestamp (ISO 8601), or null if not archived */
  readonly archivedAt: string | null;
}

/**
 * Linear workflow state.
 *
 * Each team has its own set of workflow states, but every state has a `type`
 * that categorizes it into one of the standard lifecycle phases.
 */
export interface LinearWorkflowState {
  /** Unique UUID identifier */
  readonly id: string;
  /** Display name (e.g., "In Progress", "Done") */
  readonly name: string;
  /** Workflow state category */
  readonly type: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
}

/**
 * Linear team representation.
 */
export interface LinearTeam {
  /** Unique UUID identifier */
  readonly id: string;
  /** Short key used in issue identifiers (e.g., "ENG") */
  readonly key: string;
  /** Display name */
  readonly name: string;
}

/**
 * Linear user representation.
 */
export interface LinearUser {
  /** Unique UUID identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Email address */
  readonly email: string;
}

/**
 * Linear label representation.
 */
export interface LinearLabel {
  /** Unique UUID identifier */
  readonly id: string;
  /** Label name */
  readonly name: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Relay-style page info for cursor pagination.
 */
export interface LinearPageInfo {
  /** Whether there are more results after this page */
  readonly hasNextPage: boolean;
  /** Cursor to pass as `after` for the next page, or null if no more pages */
  readonly endCursor: string | null;
}

/**
 * Generic Relay-style connection type for paginated results.
 *
 * Uses `nodes` syntax (simpler than `edges`) for direct access to items.
 */
export interface LinearConnection<T> {
  /** The items in this page */
  readonly nodes: readonly T[];
  /** Pagination information */
  readonly pageInfo: LinearPageInfo;
}
