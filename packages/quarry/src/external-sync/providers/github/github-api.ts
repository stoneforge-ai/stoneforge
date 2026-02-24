/**
 * GitHub REST API Client
 *
 * Pure fetch-based client for GitHub issue operations.
 * Supports Personal Access Token (PAT) auth, rate limit handling,
 * and configurable base URL for GitHub Enterprise.
 *
 * No external dependencies — uses only the standard fetch API.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal type matching the fields we use from GitHub's issue response.
 * Does not attempt to type the full GitHub API response.
 */
export interface GitHubIssue {
  /** GitHub's internal issue ID */
  readonly id: number;
  /** Issue number within the repository */
  readonly number: number;
  /** Issue title */
  readonly title: string;
  /** Issue body/description (markdown) */
  readonly body: string | null;
  /** Issue state */
  readonly state: 'open' | 'closed';
  /** Labels attached to the issue */
  readonly labels: readonly GitHubLabel[];
  /** Users assigned to the issue */
  readonly assignees: readonly GitHubUser[];
  /** URL to view the issue in a browser */
  readonly html_url: string;
  /** Creation timestamp (ISO 8601) */
  readonly created_at: string;
  /** Last update timestamp (ISO 8601) */
  readonly updated_at: string;
  /** Closure timestamp (ISO 8601), null if still open */
  readonly closed_at: string | null;
}

/**
 * Minimal GitHub label representation
 */
export interface GitHubLabel {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
}

/**
 * Minimal GitHub user representation
 */
export interface GitHubUser {
  readonly login: string;
  readonly id: number;
}

/**
 * Options for listing issues
 */
export interface ListIssuesOptions {
  /** Only return issues updated after this ISO 8601 timestamp */
  since?: string;
  /** Filter by state */
  state?: 'open' | 'closed' | 'all';
  /** Results per page (max 100, default 30) */
  per_page?: number;
  /** Page number for manual pagination */
  page?: number;
}

/**
 * Input for creating a new issue
 */
export interface CreateIssueInput {
  /** Issue title (required) */
  title: string;
  /** Issue body/description */
  body?: string;
  /** Label names to attach */
  labels?: string[];
  /** Usernames to assign */
  assignees?: string[];
}

/**
 * Input for updating an existing issue
 */
export interface UpdateIssueInput {
  /** Updated title */
  title?: string;
  /** Updated body */
  body?: string;
  /** Updated state */
  state?: 'open' | 'closed';
  /** Updated label names (replaces all labels) */
  labels?: string[];
  /** Updated assignees (replaces all assignees) */
  assignees?: string[];
}

/**
 * Rate limit information parsed from GitHub response headers
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
 * Configuration for creating a GitHubApiClient
 */
export interface GitHubApiClientOptions {
  /** Personal Access Token for authentication */
  token: string;
  /** Base URL for GitHub API (default: https://api.github.com) */
  apiBaseUrl?: string;
  /** Remaining requests threshold to trigger warnings (default: 10) */
  rateLimitWarningThreshold?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Typed error for GitHub API failures.
 * Wraps fetch errors with status code, message, and rate limit info.
 */
export class GitHubApiError extends Error {
  /** HTTP status code from GitHub's response */
  readonly status: number;
  /** Human-readable error message from GitHub */
  readonly statusText: string;
  /** Rate limit information at the time of the error */
  readonly rateLimit: RateLimitInfo | null;
  /** Parsed error body from GitHub (if available) */
  readonly responseBody: Record<string, unknown> | null;

  constructor(
    message: string,
    status: number,
    statusText: string,
    rateLimit: RateLimitInfo | null = null,
    responseBody: Record<string, unknown> | null = null,
    cause?: Error
  ) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.statusText = statusText;
    this.rateLimit = rateLimit;
    this.responseBody = responseBody;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitHubApiError);
    }
  }

  /**
   * Whether this error is due to rate limiting
   */
  get isRateLimited(): boolean {
    return this.status === 403 && this.rateLimit !== null && this.rateLimit.remaining === 0;
  }

  /**
   * Whether this error is due to authentication failure
   */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /**
   * Whether this error is a not-found response
   */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * Returns a JSON-serializable representation of the error
   */
  toJSON(): {
    name: string;
    message: string;
    status: number;
    statusText: string;
    rateLimit: RateLimitInfo | null;
    responseBody: Record<string, unknown> | null;
  } {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      rateLimit: this.rateLimit,
      responseBody: this.responseBody,
    };
  }
}

/**
 * Type guard for GitHubApiError
 */
export function isGitHubApiError(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError;
}

// ============================================================================
// Rate Limit Warning Threshold
// ============================================================================

/** Default threshold of remaining requests before logging a warning */
const DEFAULT_RATE_LIMIT_WARNING_THRESHOLD = 10;

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Fetch-based GitHub REST API client for issue operations.
 *
 * Features:
 * - Personal Access Token (PAT) authentication
 * - Rate limit tracking with warnings when approaching limit
 * - Configurable base URL for GitHub Enterprise
 * - Typed errors with status code and rate limit info
 * - Automatic pagination for listing issues
 *
 * @example
 * ```typescript
 * const client = new GitHubApiClient({ token: 'ghp_...' });
 * const issue = await client.getIssue('owner', 'repo', 42);
 * const issues = await client.listIssues('owner', 'repo', { state: 'open' });
 * ```
 */
export class GitHubApiClient {
  private readonly token: string;
  private readonly apiBaseUrl: string;
  private readonly rateLimitWarningThreshold: number;

  /** Most recently observed rate limit info (updated after each request) */
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(options: GitHubApiClientOptions) {
    if (!options.token) {
      throw new Error('GitHub API token is required');
    }

    this.token = options.token;
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
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
  // Public API Methods
  // --------------------------------------------------------------------------

  /**
   * Fetch a single issue by number.
   *
   * GET /repos/{owner}/{repo}/issues/{issue_number}
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('GET', `/repos/${enc(owner)}/${enc(repo)}/issues/${issueNumber}`);
  }

  /**
   * List issues for a repository.
   *
   * GET /repos/{owner}/{repo}/issues?since=...&state=all
   *
   * When no explicit `page` is provided, this method automatically iterates
   * through all pages using the Link header and returns every matching issue.
   * When a `page` is specified, only that single page is returned.
   */
  async listIssues(
    owner: string,
    repo: string,
    options: ListIssuesOptions = {}
  ): Promise<GitHubIssue[]> {
    const params = new URLSearchParams();

    if (options.since) params.set('since', options.since);
    if (options.state) params.set('state', options.state);
    if (options.per_page) params.set('per_page', String(options.per_page));

    // If a specific page was requested, fetch only that page
    if (options.page !== undefined) {
      params.set('page', String(options.page));
      const path = `/repos/${enc(owner)}/${enc(repo)}/issues`;
      const queryString = params.toString();
      const url = queryString ? `${path}?${queryString}` : path;
      return this.request<GitHubIssue[]>('GET', url);
    }

    // Otherwise, auto-paginate through all pages
    return this.paginatedRequest<GitHubIssue>(
      `/repos/${enc(owner)}/${enc(repo)}/issues`,
      params
    );
  }

  /**
   * Create a new issue.
   *
   * POST /repos/{owner}/{repo}/issues
   */
  async createIssue(
    owner: string,
    repo: string,
    input: CreateIssueInput
  ): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(
      'POST',
      `/repos/${enc(owner)}/${enc(repo)}/issues`,
      input
    );
  }

  /**
   * Update an existing issue.
   *
   * PATCH /repos/{owner}/{repo}/issues/{issue_number}
   */
  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    updates: UpdateIssueInput
  ): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(
      'PATCH',
      `/repos/${enc(owner)}/${enc(repo)}/issues/${issueNumber}`,
      updates
    );
  }

  // --------------------------------------------------------------------------
  // Internal: HTTP Request Handling
  // --------------------------------------------------------------------------

  /**
   * Performs a single HTTP request to the GitHub API.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new GitHubApiError(
        `Network error requesting ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
        0,
        'Network Error',
        null,
        null,
        err instanceof Error ? err : undefined
      );
    }

    // Parse rate limit headers from every response
    const rateLimit = parseRateLimitHeaders(response.headers);
    if (rateLimit) {
      this.lastRateLimit = rateLimit;
      this.checkRateLimitWarning(rateLimit, method, path);
    }

    if (!response.ok) {
      await this.handleErrorResponse(response, rateLimit, method, path);
    }

    return (await response.json()) as T;
  }

  /**
   * Performs a paginated request, following Link headers to collect all pages.
   */
  private async paginatedRequest<T>(
    basePath: string,
    params: URLSearchParams
  ): Promise<T[]> {
    const allItems: T[] = [];

    // Start at page 1 if not set
    if (!params.has('page')) {
      params.set('page', '1');
    }
    // Default to 100 per page for efficiency if not set
    if (!params.has('per_page')) {
      params.set('per_page', '100');
    }

    let nextUrl: string | null = `${this.apiBaseUrl}${basePath}?${params.toString()}`;

    while (nextUrl) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };

      let response: Response;
      try {
        response = await fetch(nextUrl, { method: 'GET', headers });
      } catch (err) {
        throw new GitHubApiError(
          `Network error during paginated request to ${nextUrl}: ${err instanceof Error ? err.message : String(err)}`,
          0,
          'Network Error',
          null,
          null,
          err instanceof Error ? err : undefined
        );
      }

      const rateLimit = parseRateLimitHeaders(response.headers);
      if (rateLimit) {
        this.lastRateLimit = rateLimit;
        this.checkRateLimitWarning(rateLimit, 'GET', basePath);
      }

      if (!response.ok) {
        await this.handleErrorResponse(response, rateLimit, 'GET', basePath);
      }

      const items = (await response.json()) as T[];
      allItems.push(...items);

      // Parse Link header for next page
      nextUrl = parseLinkHeaderNext(response.headers.get('Link'));
    }

    return allItems;
  }

  // --------------------------------------------------------------------------
  // Internal: Error and Rate Limit Handling
  // --------------------------------------------------------------------------

  /**
   * Handles non-OK responses by throwing a GitHubApiError.
   */
  private async handleErrorResponse(
    response: Response,
    rateLimit: RateLimitInfo | null,
    method: string,
    path: string
  ): Promise<never> {
    let responseBody: Record<string, unknown> | null = null;
    let errorMessage: string;

    try {
      responseBody = (await response.json()) as Record<string, unknown>;
      errorMessage =
        typeof responseBody.message === 'string'
          ? responseBody.message
          : `GitHub API error: ${response.status} ${response.statusText}`;
    } catch {
      errorMessage = `GitHub API error: ${response.status} ${response.statusText}`;
    }

    // Special messaging for rate limit exhaustion
    if (response.status === 403 && rateLimit && rateLimit.remaining === 0) {
      const resetDate = new Date(rateLimit.reset * 1000);
      errorMessage = `GitHub API rate limit exhausted. Resets at ${resetDate.toISOString()} (${rateLimit.reset}). ${errorMessage}`;
    }

    throw new GitHubApiError(
      `${method} ${path} failed: ${errorMessage}`,
      response.status,
      response.statusText,
      rateLimit,
      responseBody
    );
  }

  /**
   * Logs a warning when rate limit is approaching exhaustion.
   */
  private checkRateLimitWarning(
    rateLimit: RateLimitInfo,
    method: string,
    path: string
  ): void {
    if (rateLimit.remaining <= this.rateLimitWarningThreshold && rateLimit.remaining > 0) {
      const resetDate = new Date(rateLimit.reset * 1000);
      console.warn(
        `[GitHubApiClient] Rate limit warning: ${rateLimit.remaining}/${rateLimit.limit} requests remaining. ` +
          `Resets at ${resetDate.toISOString()}. ` +
          `Triggered by ${method} ${path}`
      );
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * URI-encodes a path segment for safe inclusion in URLs.
 */
function enc(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Parses rate limit information from GitHub response headers.
 * Returns null if the headers are not present.
 */
function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');

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

/**
 * Parses the GitHub Link header to find the "next" page URL.
 * Returns null if there is no next page.
 *
 * The Link header format is:
 *   <https://api.github.com/...?page=2>; rel="next", <https://api.github.com/...?page=5>; rel="last"
 */
function parseLinkHeaderNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  const links = linkHeader.split(',');
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// Export utility functions for testing
export { parseRateLimitHeaders, parseLinkHeaderNext };
