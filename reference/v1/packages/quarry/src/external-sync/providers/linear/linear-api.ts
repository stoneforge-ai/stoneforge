/**
 * Linear GraphQL API Client
 *
 * Pure fetch-based client for Linear issue operations via GraphQL.
 * Supports API key authentication, rate limit handling, cursor pagination,
 * and typed error responses.
 *
 * No external dependencies — uses only the standard fetch API.
 *
 * @see https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

import type {
  LinearIssue,
  LinearTeam,
  LinearUser,
  LinearWorkflowState,
  LinearConnection,
} from './linear-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Rate limit information parsed from Linear response headers.
 */
export interface RateLimitInfo {
  /** Total requests allowed per hour */
  readonly limit: number;
  /** Requests remaining in the current window */
  readonly remaining: number;
  /** UTC epoch timestamp when the rate limit resets */
  readonly reset: number;
}

/**
 * GraphQL error as returned in the response `errors` array.
 */
export interface GraphQLError {
  readonly message: string;
  readonly locations?: readonly { readonly line: number; readonly column: number }[];
  readonly path?: readonly (string | number)[];
  readonly extensions?: Record<string, unknown>;
}

/**
 * Configuration for creating a LinearApiClient.
 */
export interface LinearApiClientOptions {
  /** Linear API key for authentication */
  apiKey: string;
  /** Remaining requests threshold to trigger warnings (default: 100) */
  rateLimitWarningThreshold?: number;
}

/**
 * Input for creating a new Linear issue.
 */
export interface CreateIssueInput {
  /** Team ID to create the issue in (required) */
  teamId: string;
  /** Issue title (required) */
  title: string;
  /** Issue description (markdown) */
  description?: string;
  /** Priority level (0-4) */
  priority?: number;
  /** Workflow state ID */
  stateId?: string;
  /** Assignee user ID */
  assigneeId?: string;
  /** Label IDs to attach to the issue */
  labelIds?: readonly string[];
}

/**
 * Input for updating an existing Linear issue.
 */
export interface UpdateIssueInput {
  /** Updated title */
  title?: string;
  /** Updated description (markdown) */
  description?: string;
  /** Updated priority level (0-4) */
  priority?: number;
  /** Updated workflow state ID */
  stateId?: string;
  /** Updated assignee user ID */
  assigneeId?: string;
  /** Label IDs to set on the issue (replaces all existing labels) */
  labelIds?: readonly string[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Typed error for Linear API failures.
 * Wraps fetch errors with status code, GraphQL errors, and rate limit info.
 */
export class LinearApiError extends Error {
  /** HTTP status code from Linear's response */
  readonly status: number;
  /** GraphQL errors from the response (if any) */
  readonly graphqlErrors: readonly GraphQLError[];
  /** Rate limit information at the time of the error */
  readonly rateLimit: RateLimitInfo | null;

  constructor(
    message: string,
    status: number,
    graphqlErrors: readonly GraphQLError[] = [],
    rateLimit: RateLimitInfo | null = null,
    cause?: Error
  ) {
    super(message);
    this.name = 'LinearApiError';
    this.status = status;
    this.graphqlErrors = graphqlErrors;
    this.rateLimit = rateLimit;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LinearApiError);
    }
  }

  /**
   * Whether this error is due to rate limiting.
   */
  get isRateLimited(): boolean {
    return this.status === 429 || (this.rateLimit !== null && this.rateLimit.remaining === 0);
  }

  /**
   * Whether this error is due to authentication failure.
   */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /**
   * Returns a JSON-serializable representation of the error.
   */
  toJSON(): {
    name: string;
    message: string;
    status: number;
    graphqlErrors: readonly GraphQLError[];
    rateLimit: RateLimitInfo | null;
  } {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      graphqlErrors: this.graphqlErrors,
      rateLimit: this.rateLimit,
    };
  }
}

/**
 * Type guard for LinearApiError.
 */
export function isLinearApiError(error: unknown): error is LinearApiError {
  return error instanceof LinearApiError;
}

// ============================================================================
// Constants
// ============================================================================

/** Linear GraphQL API endpoint */
const LINEAR_API_URL = 'https://api.linear.app/graphql';

/** Default threshold of remaining requests before logging a warning */
const DEFAULT_RATE_LIMIT_WARNING_THRESHOLD = 100;

/** Common issue fields fragment for GraphQL queries */
const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  url
  state {
    id
    name
    type
  }
  assignee {
    id
    name
    email
  }
  team {
    id
    key
    name
  }
  labels {
    nodes {
      id
      name
    }
  }
  createdAt
  updatedAt
  archivedAt
`;

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Fetch-based Linear GraphQL API client for issue operations.
 *
 * Features:
 * - API key authentication (no Bearer prefix)
 * - Rate limit tracking with warnings when approaching limit
 * - Typed errors with GraphQL error details
 * - Relay-style cursor pagination
 * - Partial error handling (data + errors)
 *
 * @example
 * ```typescript
 * const client = new LinearApiClient({ apiKey: 'lin_api_...' });
 * const viewer = await client.getViewer();
 * const issues = await client.listIssuesSince('ENG', '2024-01-01T00:00:00Z');
 * ```
 */
export class LinearApiClient {
  private readonly apiKey: string;
  private readonly rateLimitWarningThreshold: number;

  /** Most recently observed rate limit info (updated after each request) */
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(options: LinearApiClientOptions) {
    if (!options.apiKey) {
      throw new Error('Linear API key is required');
    }

    this.apiKey = options.apiKey;
    this.rateLimitWarningThreshold =
      options.rateLimitWarningThreshold ?? DEFAULT_RATE_LIMIT_WARNING_THRESHOLD;
  }

  /**
   * Returns the most recently observed rate limit info, or null if no requests have been made.
   */
  getRateLimit(): RateLimitInfo | null {
    return this.lastRateLimit;
  }

  // --------------------------------------------------------------------------
  // Core GraphQL Method
  // --------------------------------------------------------------------------

  /**
   * Performs a GraphQL request to the Linear API.
   *
   * Handles authentication, rate limit parsing, and error responses.
   * For 200 responses that include both `data` and `errors`, it logs warnings
   * for partial errors but returns the data.
   *
   * @throws {LinearApiError} On network errors, non-200 responses, or responses with only errors.
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(LINEAR_API_URL, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new LinearApiError(
        `Network error requesting Linear API: ${err instanceof Error ? err.message : String(err)}`,
        0,
        [],
        null,
        err instanceof Error ? err : undefined
      );
    }

    // Parse rate limit headers from every response
    const rateLimit = parseRateLimitHeaders(response.headers);
    if (rateLimit) {
      this.lastRateLimit = rateLimit;
      this.checkRateLimitWarning(rateLimit);
    }

    // Handle non-200 HTTP responses
    if (!response.ok) {
      let errorMessage: string;
      let graphqlErrors: GraphQLError[] = [];

      try {
        const body = (await response.json()) as { errors?: GraphQLError[]; message?: string };
        graphqlErrors = body.errors ?? [];
        errorMessage =
          graphqlErrors.length > 0
            ? graphqlErrors.map((e) => e.message).join('; ')
            : body.message ?? `Linear API error: ${response.status} ${response.statusText}`;
      } catch {
        errorMessage = `Linear API error: ${response.status} ${response.statusText}`;
      }

      // Special messaging for rate limit exhaustion
      if (response.status === 429 || (rateLimit && rateLimit.remaining === 0)) {
        const resetDate = rateLimit ? new Date(rateLimit.reset * 1000).toISOString() : 'unknown';
        errorMessage = `Linear API rate limit exhausted. Resets at ${resetDate}. ${errorMessage}`;
      }

      throw new LinearApiError(
        `Linear GraphQL request failed: ${errorMessage}`,
        response.status,
        graphqlErrors,
        rateLimit
      );
    }

    // Parse JSON response
    let body: { data?: T; errors?: GraphQLError[] };
    try {
      body = (await response.json()) as { data?: T; errors?: GraphQLError[] };
    } catch (err) {
      throw new LinearApiError(
        `Failed to parse Linear API response as JSON: ${err instanceof Error ? err.message : String(err)}`,
        response.status,
        [],
        rateLimit,
        err instanceof Error ? err : undefined
      );
    }

    // Handle GraphQL errors
    if (body.errors && body.errors.length > 0) {
      if (!body.data) {
        // Complete failure — no data returned
        throw new LinearApiError(
          `Linear GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`,
          response.status,
          body.errors,
          rateLimit
        );
      }

      // Partial errors — data exists alongside errors. Log warning but return data.
      console.warn(
        `[LinearApiClient] Partial GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`
      );
    }

    if (!body.data) {
      throw new LinearApiError(
        'Linear API returned a response with no data',
        response.status,
        body.errors ?? [],
        rateLimit
      );
    }

    return body.data;
  }

  // --------------------------------------------------------------------------
  // Public API Methods
  // --------------------------------------------------------------------------

  /**
   * Fetch the authenticated user's identity.
   * Useful for testing the API connection.
   *
   * @returns Viewer info with id, name, and email.
   */
  async getViewer(): Promise<{ id: string; name: string; email: string }> {
    const query = `
      query Viewer {
        viewer {
          id
          name
          email
        }
      }
    `;

    const data = await this.graphql<{ viewer: { id: string; name: string; email: string } }>(
      query
    );
    return data.viewer;
  }

  /**
   * List all teams accessible to the authenticated user.
   *
   * @returns Array of teams with id, key, and name.
   */
  async getTeams(): Promise<LinearTeam[]> {
    const query = `
      query Teams {
        teams {
          nodes {
            id
            key
            name
          }
        }
      }
    `;

    const data = await this.graphql<{ teams: { nodes: LinearTeam[] } }>(query);
    return data.teams.nodes;
  }

  /**
   * Fetch all workflow states for a specific team.
   * Needed for mapping between Linear state types and Stoneforge statuses.
   *
   * @param teamId - UUID of the team.
   * @returns Array of workflow states.
   */
  async getTeamWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
    const query = `
      query TeamWorkflowStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      team: { states: { nodes: LinearWorkflowState[] } };
    }>(query, { teamId });

    return data.team.states.nodes;
  }

  /**
   * Fetch all labels (issue labels) in the workspace.
   * Labels in Linear are workspace-scoped and can be filtered by team.
   *
   * @returns Array of all labels with id and name.
   */
  async getLabels(): Promise<{ id: string; name: string }[]> {
    const query = `
      query IssueLabels {
        issueLabels {
          nodes {
            id
            name
          }
        }
      }
    `;

    const data = await this.graphql<{
      issueLabels: { nodes: { id: string; name: string }[] };
    }>(query);

    return data.issueLabels.nodes;
  }

  /**
   * Create a new label in the workspace, optionally associated with a team.
   *
   * @param name - Label name (e.g., "blocked")
   * @param teamId - Optional team ID to associate the label with
   * @returns The created label with id and name.
   */
  async createLabel(
    name: string,
    teamId?: string
  ): Promise<{ id: string; name: string }> {
    const query = `
      mutation CreateLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel {
            id
            name
          }
        }
      }
    `;

    const input: Record<string, string> = { name };
    if (teamId) {
      input.teamId = teamId;
    }

    const data = await this.graphql<{
      issueLabelCreate: { success: boolean; issueLabel: { id: string; name: string } };
    }>(query, { input });

    if (!data.issueLabelCreate.success) {
      throw new LinearApiError(
        `Linear issueLabelCreate mutation returned success: false for label "${name}"`,
        200,
        [],
        this.lastRateLimit
      );
    }

    return data.issueLabelCreate.issueLabel;
  }

  /**
   * Fetch a single issue by UUID or identifier (e.g., "ENG-123").
   *
   * @param issueId - UUID or human-readable identifier.
   * @returns The issue, or null if not found.
   */
  async getIssue(issueId: string): Promise<LinearIssue | null> {
    const query = `
      query Issue($issueId: String!) {
        issue(id: $issueId) {
          ${ISSUE_FIELDS}
        }
      }
    `;

    try {
      const data = await this.graphql<{ issue: LinearIssue | null }>(query, { issueId });
      return data.issue;
    } catch (err) {
      // Linear returns errors for not-found issues rather than null
      if (err instanceof LinearApiError && err.graphqlErrors.length > 0) {
        const notFound = err.graphqlErrors.some(
          (e) =>
            e.message.toLowerCase().includes('not found') ||
            e.extensions?.code === 'RESOURCE_NOT_FOUND'
        );
        if (notFound) {
          return null;
        }
      }
      throw err;
    }
  }

  /**
   * List issues for a team updated since a given timestamp.
   * Automatically paginates through all results using cursor pagination.
   *
   * @param teamKey - Team key (e.g., "ENG").
   * @param since - ISO 8601 timestamp. Only issues updated at or after this time are returned.
   * @returns Array of all matching issues.
   */
  async listIssuesSince(teamKey: string, since: string): Promise<LinearIssue[]> {
    const query = `
      query ListIssues($teamKey: String!, $since: DateTimeOrDuration!, $after: String) {
        issues(
          filter: {
            team: { key: { eq: $teamKey } }
            updatedAt: { gte: $since }
          }
          first: 50
          after: $after
        ) {
          nodes {
            ${ISSUE_FIELDS}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const allIssues: LinearIssue[] = [];
    let after: string | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const variables: Record<string, unknown> = { teamKey, since };
      if (after) {
        variables.after = after;
      }

      const data = await this.graphql<{ issues: LinearConnection<LinearIssue> }>(query, variables);

      allIssues.push(...data.issues.nodes);

      if (!data.issues.pageInfo.hasNextPage) {
        break;
      }

      after = data.issues.pageInfo.endCursor;
    }

    return allIssues;
  }

  /**
   * Create a new issue in Linear.
   *
   * @param input - Issue creation input (teamId and title required).
   * @returns The created issue.
   */
  async createIssue(input: CreateIssueInput): Promise<LinearIssue> {
    const query = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            ${ISSUE_FIELDS}
          }
        }
      }
    `;

    const data = await this.graphql<{
      issueCreate: { success: boolean; issue: LinearIssue };
    }>(query, { input });

    if (!data.issueCreate.success) {
      throw new LinearApiError(
        'Linear issueCreate mutation returned success: false',
        200,
        [],
        this.lastRateLimit
      );
    }

    return data.issueCreate.issue;
  }

  /**
   * Update an existing issue in Linear.
   *
   * @param issueId - UUID of the issue to update.
   * @param input - Fields to update.
   * @returns The updated issue.
   */
  async updateIssue(issueId: string, input: UpdateIssueInput): Promise<LinearIssue> {
    const query = `
      mutation UpdateIssue($issueId: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $issueId, input: $input) {
          success
          issue {
            ${ISSUE_FIELDS}
          }
        }
      }
    `;

    const data = await this.graphql<{
      issueUpdate: { success: boolean; issue: LinearIssue };
    }>(query, { issueId, input });

    if (!data.issueUpdate.success) {
      throw new LinearApiError(
        'Linear issueUpdate mutation returned success: false',
        200,
        [],
        this.lastRateLimit
      );
    }

    return data.issueUpdate.issue;
  }

  // --------------------------------------------------------------------------
  // Internal: Rate Limit Handling
  // --------------------------------------------------------------------------

  /**
   * Logs a warning when rate limit is approaching exhaustion.
   */
  private checkRateLimitWarning(rateLimit: RateLimitInfo): void {
    if (rateLimit.remaining <= this.rateLimitWarningThreshold && rateLimit.remaining > 0) {
      const resetDate = new Date(rateLimit.reset * 1000);
      console.warn(
        `[LinearApiClient] Rate limit warning: ${rateLimit.remaining}/${rateLimit.limit} requests remaining. ` +
          `Resets at ${resetDate.toISOString()}.`
      );
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parses rate limit information from Linear response headers.
 *
 * Linear uses these headers:
 * - X-RateLimit-Requests-Limit
 * - X-RateLimit-Requests-Remaining
 * - X-RateLimit-Requests-Reset (epoch seconds)
 *
 * Also checks standard headers as fallback:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 *
 * @returns Parsed rate limit info, or null if headers are not present.
 */
function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  // Try Linear-specific headers first
  let limit = headers.get('X-RateLimit-Requests-Limit');
  let remaining = headers.get('X-RateLimit-Requests-Remaining');
  let reset = headers.get('X-RateLimit-Requests-Reset');

  // Fall back to standard headers
  if (limit === null || remaining === null || reset === null) {
    limit = headers.get('X-RateLimit-Limit');
    remaining = headers.get('X-RateLimit-Remaining');
    reset = headers.get('X-RateLimit-Reset');
  }

  if (limit === null || remaining === null || reset === null) {
    return null;
  }

  const parsedLimit = parseInt(limit, 10);
  const parsedRemaining = parseInt(remaining, 10);
  const parsedReset = parseInt(reset, 10);

  if (isNaN(parsedLimit) || isNaN(parsedRemaining) || isNaN(parsedReset)) {
    return null;
  }

  return {
    limit: parsedLimit,
    remaining: parsedRemaining,
    reset: parsedReset,
  };
}

// Export utility function for testing
export { parseRateLimitHeaders };
