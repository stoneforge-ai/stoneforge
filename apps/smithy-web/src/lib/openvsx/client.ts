/**
 * OpenVSX API Client
 *
 * Typed client for searching, browsing, and downloading extensions
 * through the backend proxy routes.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Publisher information for an extension
 */
export interface OpenVSXPublisher {
  loginName: string;
  fullName?: string;
  avatarUrl?: string;
  homepage?: string;
  provider?: string;
}

/**
 * File URLs for extension assets
 */
export interface OpenVSXFiles {
  download?: string;
  manifest?: string;
  icon?: string;
  readme?: string;
  license?: string;
  changelog?: string;
  signature?: string;
  sha256?: string;
  publicKey?: string;
  vsixmanifest?: string;
}

/**
 * Minimal extension info shown in search results
 */
export interface OpenVSXExtensionSummary {
  /** API URL for this extension */
  url: string;
  /** Extension identifier (e.g., "theme-dracula") */
  name: string;
  /** Namespace/publisher identifier (e.g., "dracula-theme") */
  namespace: string;
  /** Current version */
  version: string;
  /** Display name for UI */
  displayName?: string;
  /** Short description */
  description?: string;
  /** File URLs including download, icon, etc. */
  files: OpenVSXFiles;
  /** ISO-8601 timestamp when this version was published */
  timestamp?: string;
  /** Whether the publisher is verified */
  verified?: boolean;
  /** Total download count */
  downloadCount?: number;
  /** Whether the extension is deprecated */
  deprecated?: boolean;
  /** Average rating (0-5) */
  averageRating?: number;
}

/**
 * Full extension metadata
 */
export interface OpenVSXExtension extends OpenVSXExtensionSummary {
  /** URL to namespace API */
  namespaceUrl?: string;
  /** URL to reviews API */
  reviewsUrl?: string;
  /** URL to all versions API */
  allVersionsUrl?: string;
  /** Target platform (e.g., "universal", "win32-x64") */
  targetPlatform?: string;
  /** Publisher information */
  publishedBy?: OpenVSXPublisher;
  /** Whether this is a pre-release version */
  preRelease?: boolean;
  /** Whether this is a preview extension */
  preview?: boolean;
  /** Whether the publisher is unrelated to the namespace */
  unrelatedPublisher?: boolean;
  /** Namespace access level */
  namespaceAccess?: string;
  /** Map of version to API URL */
  allVersions?: Record<string, string>;
  /** Number of reviews */
  reviewCount?: number;
  /** Version aliases (e.g., ["latest"]) */
  versionAlias?: string[];
  /** Display name for the namespace */
  namespaceDisplayName?: string;
  /** Required VS Code engine version */
  engines?: Record<string, string>;
  /** Extension categories (e.g., ["Themes", "Languages"]) */
  categories?: string[];
  /** Extension tags/keywords */
  tags?: string[];
  /** Extension kind (e.g., "ui", "workspace") */
  extensionKind?: string[];
  /** Repository URL */
  repository?: string;
  /** Homepage URL */
  homepage?: string;
  /** Bug tracker URL */
  bugs?: string;
  /** Gallery banner color */
  galleryColor?: string;
  /** Gallery banner theme */
  galleryTheme?: string;
  /** License name */
  license?: string;
  /** Dependencies on other extensions */
  dependencies?: Array<{ namespace: string; extension: string }>;
  /** Bundled extensions */
  bundledExtensions?: Array<{ namespace: string; extension: string }>;
}

/**
 * Search response with extensions array and pagination
 */
export interface OpenVSXSearchResult {
  /** Number of skipped entries according to the search query */
  offset: number;
  /** Total number of entries that match the search query */
  totalSize: number;
  /** List of extensions matching the search */
  extensions: OpenVSXExtensionSummary[];
  /** Operation success indicator */
  success?: string;
  /** Warning message if present */
  warning?: string;
  /** Error message if present */
  error?: string;
}

/**
 * Search options for searchExtensions
 */
export interface SearchExtensionsOptions {
  /** Filter by category (e.g., "Themes", "Languages") */
  category?: string;
  /** Number of results to return (default 20) */
  size?: number;
  /** Number of results to skip (for pagination) */
  offset?: number;
  /** Sort field (e.g., "relevance", "downloadCount", "timestamp") */
  sortBy?: string;
  /** Sort order ("asc" or "desc") */
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * API error structure returned by the backend proxy
 */
export interface OpenVSXApiError {
  code: string;
  message: string;
}

/**
 * Custom error class for OpenVSX API errors
 */
export class OpenVSXError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'OpenVSXError';
  }
}

// ============================================================================
// API Client
// ============================================================================

const API_BASE = '/api';

/**
 * Internal helper to make API requests with proper error handling
 */
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...options?.headers,
      },
    });
  } catch (error) {
    // Network error (offline, DNS failure, etc.)
    throw new OpenVSXError(
      `Network error: ${error instanceof Error ? error.message : 'Failed to connect'}`,
      'NETWORK_ERROR',
      0
    );
  }

  if (!response.ok) {
    // Try to parse error response
    let errorData: { error?: OpenVSXApiError } | null = null;
    try {
      errorData = await response.json();
    } catch {
      // Response is not JSON
    }

    const code = errorData?.error?.code || `HTTP_${response.status}`;
    const message =
      errorData?.error?.message ||
      getDefaultErrorMessage(response.status);

    throw new OpenVSXError(message, code, response.status);
  }

  return response.json();
}

/**
 * Get a user-friendly error message for HTTP status codes
 */
function getDefaultErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request parameters';
    case 404:
      return 'Extension not found';
    case 429:
      return 'Rate limit exceeded. Please try again later.';
    case 500:
      return 'Server error. Please try again later.';
    case 502:
      return 'Unable to reach extension registry';
    case 503:
      return 'Extension registry temporarily unavailable';
    case 504:
      return 'Request timed out';
    default:
      return `Request failed with status ${status}`;
  }
}

/**
 * Search for extensions in the OpenVSX marketplace
 *
 * @param query - Search query string
 * @param options - Optional search parameters
 * @returns Search results with extensions array and pagination info
 *
 * @example
 * ```ts
 * // Simple search
 * const results = await searchExtensions('theme');
 *
 * // Search with options
 * const results = await searchExtensions('python', {
 *   category: 'Languages',
 *   size: 50,
 *   sortBy: 'downloadCount',
 *   sortOrder: 'desc'
 * });
 * ```
 */
export async function searchExtensions(
  query: string,
  options?: SearchExtensionsOptions
): Promise<OpenVSXSearchResult> {
  const params = new URLSearchParams();

  if (query) {
    params.set('query', query);
  }
  if (options?.category) {
    params.set('category', options.category);
  }
  if (options?.size !== undefined) {
    params.set('size', String(options.size));
  }
  if (options?.offset !== undefined) {
    params.set('offset', String(options.offset));
  }
  if (options?.sortBy) {
    params.set('sortBy', options.sortBy);
  }
  if (options?.sortOrder) {
    params.set('sortOrder', options.sortOrder);
  }

  const queryString = params.toString();
  const path = queryString ? `/extensions/search?${queryString}` : '/extensions/search';

  return fetchApi<OpenVSXSearchResult>(path);
}

/**
 * Get full metadata for a specific extension
 *
 * @param namespace - Extension namespace (e.g., "dracula-theme")
 * @param name - Extension name (e.g., "theme-dracula")
 * @returns Full extension metadata including versions, files, etc.
 *
 * @example
 * ```ts
 * const extension = await getExtensionMetadata('dracula-theme', 'theme-dracula');
 * console.log(extension.displayName); // "Dracula Theme Official"
 * console.log(extension.downloadCount); // 230631
 * ```
 */
export async function getExtensionMetadata(
  namespace: string,
  name: string
): Promise<OpenVSXExtension> {
  return fetchApi<OpenVSXExtension>(
    `/extensions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  );
}

/**
 * Download extension VSIX file as an ArrayBuffer
 *
 * @param namespace - Extension namespace (e.g., "dracula-theme")
 * @param name - Extension name (e.g., "theme-dracula")
 * @param version - Extension version (e.g., "2.25.1" or "latest")
 * @returns ArrayBuffer containing the VSIX file data
 *
 * @example
 * ```ts
 * const vsix = await downloadVsix('dracula-theme', 'theme-dracula', 'latest');
 *
 * // Create a download link
 * const blob = new Blob([vsix], { type: 'application/vsix' });
 * const url = URL.createObjectURL(blob);
 * ```
 */
export async function downloadVsix(
  namespace: string,
  name: string,
  version: string
): Promise<ArrayBuffer> {
  const path = `/extensions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/download`;

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch (error) {
    throw new OpenVSXError(
      `Network error: ${error instanceof Error ? error.message : 'Failed to connect'}`,
      'NETWORK_ERROR',
      0
    );
  }

  if (!response.ok) {
    // Try to parse error response (proxy returns JSON errors)
    let errorData: { error?: OpenVSXApiError } | null = null;
    const contentType = response.headers.get('Content-Type');
    if (contentType?.includes('application/json')) {
      try {
        errorData = await response.json();
      } catch {
        // Response is not JSON
      }
    }

    const code = errorData?.error?.code || `HTTP_${response.status}`;
    const message =
      errorData?.error?.message ||
      getDefaultErrorMessage(response.status);

    throw new OpenVSXError(message, code, response.status);
  }

  return response.arrayBuffer();
}
