/**
 * API Client
 *
 * A simple, configurable HTTP API client with common patterns for REST APIs.
 * Supports typed responses, error handling, and request interceptors.
 *
 * @example
 * ```ts
 * const api = new ApiClient({ baseUrl: 'http://localhost:3456' });
 *
 * // GET request
 * const tasks = await api.get<Task[]>('/api/tasks');
 *
 * // POST request
 * const newTask = await api.post<Task>('/api/tasks', { title: 'New Task' });
 *
 * // With query parameters
 * const filtered = await api.get<Task[]>('/api/tasks', { status: 'ready' });
 * ```
 */

/**
 * API error with status code and message
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly data?: unknown
  ) {
    const message = data && typeof data === 'object' && 'message' in data
      ? String((data as { message: unknown }).message)
      : statusText;
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Request options
 */
export interface RequestOptions {
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request timeout in ms */
  timeout?: number;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

/**
 * API client options
 */
export interface ApiClientOptions {
  /** Base URL for all requests */
  baseUrl: string;
  /** Default headers to include with all requests */
  defaultHeaders?: Record<string, string>;
  /** Default timeout in ms (default: 30000) */
  defaultTimeout?: number;
  /** Request interceptor */
  onRequest?: (url: string, init: RequestInit) => RequestInit | Promise<RequestInit>;
  /** Response interceptor */
  onResponse?: (response: Response) => Response | Promise<Response>;
  /** Error interceptor */
  onError?: (error: ApiError) => ApiError | Promise<ApiError>;
}

/**
 * API Client
 *
 * A simple HTTP client with typed responses and error handling.
 */
export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;
  private onRequest?: ApiClientOptions['onRequest'];
  private onResponse?: ApiClientOptions['onResponse'];
  private onError?: ApiClientOptions['onError'];

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.defaultHeaders,
    };
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.onRequest = options.onRequest;
    this.onResponse = options.onResponse;
    this.onError = options.onError;
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(path: string, params?: RequestOptions['params']): string {
    const url = new URL(path, this.baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Make a request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);

    let init: RequestInit = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
      signal: options?.signal,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    // Apply request interceptor
    if (this.onRequest) {
      init = await this.onRequest(url, init);
    }

    // Create timeout if not already aborted
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (!init.signal) {
      init.signal = controller.signal;
    }

    try {
      let response = await fetch(url, init);
      clearTimeout(timeoutId);

      // Apply response interceptor
      if (this.onResponse) {
        response = await this.onResponse(response);
      }

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          // Response is not JSON
        }

        let error = new ApiError(response.status, response.statusText, errorData);

        // Apply error interceptor
        if (this.onError) {
          error = await this.onError(error);
        }

        throw error;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      // Parse response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json() as T;
      }

      return await response.text() as unknown as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(408, 'Request Timeout');
      }

      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string, params?: RequestOptions['params'], options?: Omit<RequestOptions, 'params'>): Promise<T> {
    return this.request<T>('GET', path, undefined, { ...options, params });
  }

  /**
   * POST request
   */
  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * PATCH request
   */
  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

/**
 * Create an API client instance
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
