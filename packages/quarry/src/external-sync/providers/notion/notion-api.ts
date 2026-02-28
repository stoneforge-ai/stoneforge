/**
 * Notion REST API Client
 *
 * Pure fetch-based client for Notion page and block operations.
 * Supports Bearer token authentication, rate limit handling with Retry-After,
 * cursor-based pagination, and typed error responses.
 *
 * No external dependencies — uses only the standard fetch API.
 *
 * @see https://developers.notion.com/reference
 */

import type {
  NotionPage,
  NotionBlock,
  NotionBlockInput,
  NotionCreatePageInput,
  NotionUpdatePageInput,
  NotionDatabaseQueryResponse,
  NotionBlockChildrenResponse,
  NotionErrorResponse,
} from './notion-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for creating a NotionApiClient.
 */
export interface NotionApiClientOptions {
  /** Notion integration token (internal integration or OAuth token) */
  token: string;
  /** Notion API version header (default: "2022-06-28") */
  notionVersion?: string;
  /** Maximum number of automatic retries on 429 responses (default: 3) */
  maxRetries?: number;
  /** Rate limit warning threshold — log a warning after a 429 (default: true) */
  warnOnRateLimit?: boolean;
}

/**
 * Rate limit state tracked from 429 responses.
 */
export interface RateLimitState {
  /** Whether the client has been rate limited at least once */
  readonly wasRateLimited: boolean;
  /** The most recent Retry-After value in seconds (from last 429 response) */
  readonly lastRetryAfterSeconds: number | null;
  /** Total number of 429 responses received */
  readonly totalRateLimitHits: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Typed error for Notion API failures.
 * Wraps fetch errors with status code, Notion error code, and message.
 */
export class NotionApiError extends Error {
  /** HTTP status code from Notion's response */
  readonly status: number;
  /** Notion-specific error code (e.g., "validation_error", "object_not_found") */
  readonly code: string;
  /** Parsed error body from Notion (if available) */
  readonly responseBody: NotionErrorResponse | null;

  constructor(
    message: string,
    status: number,
    code: string = 'unknown',
    responseBody: NotionErrorResponse | null = null,
    cause?: Error
  ) {
    super(message);
    this.name = 'NotionApiError';
    this.status = status;
    this.code = code;
    this.responseBody = responseBody;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotionApiError);
    }
  }

  /**
   * Whether this error is due to rate limiting (429 Too Many Requests).
   */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /**
   * Whether this error is due to authentication failure.
   */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /**
   * Whether this error is a not-found response.
   */
  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'object_not_found';
  }

  /**
   * Whether this is a validation error.
   */
  get isValidationError(): boolean {
    return this.status === 400 || this.code === 'validation_error';
  }

  /**
   * Returns a JSON-serializable representation of the error.
   */
  toJSON(): {
    name: string;
    message: string;
    status: number;
    code: string;
    responseBody: NotionErrorResponse | null;
  } {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      responseBody: this.responseBody,
    };
  }
}

/**
 * Type guard for NotionApiError.
 */
export function isNotionApiError(error: unknown): error is NotionApiError {
  return error instanceof NotionApiError;
}

// ============================================================================
// Constants
// ============================================================================

/** Notion API base URL */
const NOTION_API_BASE = 'https://api.notion.com/v1';

/** Default Notion API version */
const DEFAULT_NOTION_VERSION = '2022-06-28';

/** Default maximum retry count for 429 responses */
const DEFAULT_MAX_RETRIES = 3;

/** Default Retry-After fallback if the header is missing (in seconds) */
const DEFAULT_RETRY_AFTER_SECONDS = 1;

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Fetch-based Notion REST API client for page and block operations.
 *
 * Features:
 * - Bearer token authentication (internal integrations or OAuth)
 * - Notion-Version header for API versioning
 * - Automatic retry on 429 (Too Many Requests) with Retry-After
 * - Cursor-based pagination for list endpoints
 * - Typed errors with Notion error codes
 *
 * @example
 * ```typescript
 * const client = new NotionApiClient({ token: 'ntn_...' });
 * const page = await client.getPage('page-uuid');
 * const blocks = await client.getBlocks('page-uuid');
 * ```
 */
export class NotionApiClient {
  private readonly token: string;
  private readonly notionVersion: string;
  private readonly maxRetries: number;
  private readonly warnOnRateLimit: boolean;

  /** Rate limit state tracked from 429 responses */
  private rateLimitState: RateLimitState = {
    wasRateLimited: false,
    lastRetryAfterSeconds: null,
    totalRateLimitHits: 0,
  };

  constructor(options: NotionApiClientOptions) {
    if (!options.token) {
      throw new Error('Notion API token is required');
    }

    this.token = options.token;
    this.notionVersion = options.notionVersion ?? DEFAULT_NOTION_VERSION;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.warnOnRateLimit = options.warnOnRateLimit ?? true;
  }

  /**
   * Returns the current rate limit state.
   */
  getRateLimitState(): RateLimitState {
    return { ...this.rateLimitState };
  }

  // --------------------------------------------------------------------------
  // Public API Methods
  // --------------------------------------------------------------------------

  /**
   * Retrieve a page by ID.
   *
   * GET /pages/{page_id}
   *
   * @see https://developers.notion.com/reference/retrieve-a-page
   */
  async getPage(pageId: string): Promise<NotionPage> {
    return this.request<NotionPage>('GET', `/pages/${pageId}`);
  }

  /**
   * Retrieve all block children for a given block (or page).
   * Automatically paginates through all results.
   *
   * GET /blocks/{block_id}/children
   *
   * @see https://developers.notion.com/reference/get-block-children
   */
  async getBlocks(blockId: string): Promise<NotionBlock[]> {
    const allBlocks: NotionBlock[] = [];
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({ page_size: '100' });
      if (cursor) {
        params.set('start_cursor', cursor);
      }

      const response = await this.request<NotionBlockChildrenResponse>(
        'GET',
        `/blocks/${blockId}/children?${params.toString()}`
      );

      allBlocks.push(...response.results);

      if (!response.has_more || !response.next_cursor) {
        break;
      }

      cursor = response.next_cursor;
    }

    return allBlocks;
  }

  /**
   * Create a new page in a database or as a child of another page.
   *
   * POST /pages
   *
   * @see https://developers.notion.com/reference/post-page
   */
  async createPage(
    databaseId: string,
    properties: Record<string, unknown>,
    children?: readonly NotionBlockInput[]
  ): Promise<NotionPage> {
    const body: NotionCreatePageInput = {
      parent: { database_id: databaseId },
      properties,
      ...(children && children.length > 0 ? { children } : {}),
    };

    return this.request<NotionPage>('POST', '/pages', body);
  }

  /**
   * Update page properties.
   *
   * PATCH /pages/{page_id}
   *
   * @see https://developers.notion.com/reference/patch-page
   */
  async updatePage(
    pageId: string,
    properties: Record<string, unknown>
  ): Promise<NotionPage> {
    const body: NotionUpdatePageInput = { properties };
    return this.request<NotionPage>('PATCH', `/pages/${pageId}`, body);
  }

  /**
   * Replace all content blocks of a page.
   *
   * This is a two-step operation:
   * 1. Delete all existing top-level block children
   * 2. Append new block children
   *
   * CAUTION: This is not atomic. If step 2 fails, the page will be empty.
   *
   * @see https://developers.notion.com/reference/delete-a-block
   * @see https://developers.notion.com/reference/patch-block-children
   */
  async updatePageContent(
    pageId: string,
    blocks: readonly NotionBlockInput[]
  ): Promise<NotionBlock[]> {
    // Step 1: Get existing blocks and delete them
    const existingBlocks = await this.getBlocks(pageId);

    for (const block of existingBlocks) {
      await this.request<void>('DELETE', `/blocks/${block.id}`);
    }

    // Step 2: Append new blocks
    if (blocks.length === 0) {
      return [];
    }

    const response = await this.request<NotionBlockChildrenResponse>(
      'PATCH',
      `/blocks/${pageId}/children`,
      { children: blocks }
    );

    return [...response.results];
  }

  /**
   * Query a database with optional filter and cursor-based pagination.
   *
   * POST /databases/{database_id}/query
   *
   * When no cursor is provided and the result has more pages, this method
   * returns only the first page. Callers can use `next_cursor` to fetch
   * additional pages, or use `queryDatabaseAll()` to auto-paginate.
   *
   * @see https://developers.notion.com/reference/post-database-query
   */
  async queryDatabase(
    databaseId: string,
    filter?: Record<string, unknown>,
    cursor?: string
  ): Promise<NotionDatabaseQueryResponse> {
    const body: Record<string, unknown> = {
      page_size: 100,
    };

    if (filter) {
      body.filter = filter;
    }

    if (cursor) {
      body.start_cursor = cursor;
    }

    return this.request<NotionDatabaseQueryResponse>(
      'POST',
      `/databases/${databaseId}/query`,
      body
    );
  }

  /**
   * Query a database and automatically paginate through all results.
   *
   * This is a convenience wrapper around `queryDatabase()` that follows
   * `next_cursor` until all pages have been fetched.
   *
   * @param databaseId - The database to query.
   * @param filter - Optional Notion filter object.
   * @returns All pages matching the query.
   */
  async queryDatabaseAll(
    databaseId: string,
    filter?: Record<string, unknown>
  ): Promise<NotionPage[]> {
    const allPages: NotionPage[] = [];
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await this.queryDatabase(databaseId, filter, cursor);
      allPages.push(...response.results);

      if (!response.has_more || !response.next_cursor) {
        break;
      }

      cursor = response.next_cursor;
    }

    return allPages;
  }

  // --------------------------------------------------------------------------
  // Internal: HTTP Request Handling
  // --------------------------------------------------------------------------

  /**
   * Performs an HTTP request to the Notion API with automatic retry on 429.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: NotionApiError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(method, path, body);
      } catch (err) {
        if (err instanceof NotionApiError && err.isRateLimited && attempt < this.maxRetries) {
          // Rate limit state is already tracked by handleErrorResponse.
          // Extract retry delay from the tracked state.
          const retryAfter = this.rateLimitState.lastRetryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;

          if (this.warnOnRateLimit) {
            console.warn(
              `[NotionApiClient] Rate limited on ${method} ${path}. ` +
                `Retrying in ${retryAfter}s (attempt ${attempt + 1}/${this.maxRetries}).`
            );
          }

          await sleep(retryAfter * 1000);
          lastError = err;
          continue;
        }

        throw err;
      }
    }

    // Should not reach here, but just in case
    throw lastError ?? new NotionApiError('Max retries exceeded', 429, 'rate_limited');
  }

  /**
   * Executes a single HTTP request to the Notion API (no retry logic).
   */
  private async executeRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${NOTION_API_BASE}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': this.notionVersion,
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
      throw new NotionApiError(
        `Network error requesting ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
        0,
        'network_error',
        null,
        err instanceof Error ? err : undefined
      );
    }

    if (!response.ok) {
      await this.handleErrorResponse(response, method, path);
    }

    // DELETE responses may have no body (204 No Content)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  // --------------------------------------------------------------------------
  // Internal: Error Handling
  // --------------------------------------------------------------------------

  /**
   * Handles non-OK responses by throwing a NotionApiError.
   */
  private async handleErrorResponse(
    response: Response,
    method: string,
    path: string
  ): Promise<never> {
    let responseBody: NotionErrorResponse | null = null;
    let errorMessage: string;
    let errorCode = 'unknown';

    try {
      responseBody = (await response.json()) as NotionErrorResponse;
      errorMessage = responseBody.message ?? `Notion API error: ${response.status}`;
      errorCode = responseBody.code ?? 'unknown';
    } catch {
      errorMessage = `Notion API error: ${response.status} ${response.statusText}`;
    }

    // Enrich rate limit error with Retry-After info
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        errorMessage = `Rate limited. Retry after ${retryAfter}s. ${errorMessage}`;
      }

      // Track the rate limit hit
      const retryAfterSeconds = retryAfter
        ? parseInt(retryAfter, 10)
        : DEFAULT_RETRY_AFTER_SECONDS;

      this.rateLimitState = {
        wasRateLimited: true,
        lastRetryAfterSeconds: isNaN(retryAfterSeconds)
          ? DEFAULT_RETRY_AFTER_SECONDS
          : retryAfterSeconds,
        totalRateLimitHits: this.rateLimitState.totalRateLimitHits + 1,
      };
    }

    throw new NotionApiError(
      `${method} ${path} failed: ${errorMessage}`,
      response.status,
      errorCode,
      responseBody
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parses the Retry-After value from a NotionApiError's response body or falls back to default.
 */
function parseRetryAfterFromError(err: NotionApiError): number {
  // The Retry-After header is already parsed into the error message;
  // try to extract it. This is a best-effort parse.
  const match = err.message.match(/Retry after (\d+)s/);
  if (match) {
    const seconds = parseInt(match[1], 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds;
    }
  }

  return err.responseBody?.status === 429
    ? DEFAULT_RETRY_AFTER_SECONDS
    : DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Promise-based sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Export utility functions for testing
export { sleep, parseRetryAfterFromError };
