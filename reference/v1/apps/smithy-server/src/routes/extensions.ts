/**
 * Extensions Routes
 *
 * Proxy routes for OpenVSX marketplace to avoid CORS issues.
 * Supports search, metadata retrieval, and VSIX download.
 */

import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { createLogger } from '@stoneforge/smithy';

const logger = createLogger('extensions');

/** OpenVSX API base URL - can be swapped for alternative registries */
const OPENVSX_BASE_URL = 'https://open-vsx.org';

/** Timeouts in milliseconds */
const SEARCH_METADATA_TIMEOUT = 10_000; // 10 seconds for search/metadata
const DOWNLOAD_TIMEOUT = 60_000; // 60 seconds for VSIX download

/**
 * Helper to create an AbortSignal with timeout
 */
function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

/**
 * Helper to handle fetch errors consistently
 */
function handleFetchError(error: unknown, operation: string): Response {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('timeout') || message.includes('aborted')) {
    logger.error(`Timeout during ${operation}:`, message);
    return Response.json(
      { error: { code: 'TIMEOUT', message: `Request timed out during ${operation}` } },
      { status: 504 }
    );
  }

  logger.error(`Failed to ${operation}:`, error);
  return Response.json(
    { error: { code: 'UPSTREAM_ERROR', message: `Failed to ${operation}: ${message}` } },
    { status: 502 }
  );
}

export function createExtensionsRoutes() {
  const app = new Hono();

  /**
   * GET /api/extensions/search
   *
   * Search for extensions in OpenVSX marketplace.
   * Query params are forwarded to OpenVSX API.
   *
   * @query query - Search query string
   * @query category - Filter by category (e.g., "Themes", "Languages")
   * @query size - Number of results (default 20)
   */
  app.get('/api/extensions/search', async (c) => {
    try {
      const url = new URL(c.req.url);
      const searchParams = new URLSearchParams();

      // Forward supported query parameters
      const query = url.searchParams.get('query');
      const category = url.searchParams.get('category');
      const size = url.searchParams.get('size');
      const offset = url.searchParams.get('offset');
      const sortBy = url.searchParams.get('sortBy');
      const sortOrder = url.searchParams.get('sortOrder');

      if (query) searchParams.set('query', query);
      if (category) searchParams.set('category', category);
      if (size) searchParams.set('size', size);
      if (offset) searchParams.set('offset', offset);
      if (sortBy) searchParams.set('sortBy', sortBy);
      if (sortOrder) searchParams.set('sortOrder', sortOrder);

      const openvsxUrl = `${OPENVSX_BASE_URL}/api/-/search?${searchParams.toString()}`;

      const response = await fetch(openvsxUrl, {
        signal: createTimeoutSignal(SEARCH_METADATA_TIMEOUT),
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.error(`OpenVSX search returned ${response.status}`);
        return c.json(
          { error: { code: 'UPSTREAM_ERROR', message: `OpenVSX returned ${response.status}` } },
          response.status as 400 | 404 | 500 | 502 | 503
        );
      }

      const data = await response.json();
      return c.json(data);
    } catch (error) {
      return handleFetchError(error, 'search extensions');
    }
  });

  /**
   * GET /api/extensions/:namespace/:name
   *
   * Get extension metadata from OpenVSX.
   *
   * @param namespace - Extension namespace (e.g., "dracula-theme")
   * @param name - Extension name (e.g., "theme-dracula")
   */
  app.get('/api/extensions/:namespace/:name', async (c) => {
    try {
      const { namespace, name } = c.req.param();
      const openvsxUrl = `${OPENVSX_BASE_URL}/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;

      const response = await fetch(openvsxUrl, {
        signal: createTimeoutSignal(SEARCH_METADATA_TIMEOUT),
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return c.json(
            { error: { code: 'NOT_FOUND', message: `Extension ${namespace}.${name} not found` } },
            404
          );
        }
        logger.error(`OpenVSX metadata returned ${response.status}`);
        return c.json(
          { error: { code: 'UPSTREAM_ERROR', message: `OpenVSX returned ${response.status}` } },
          response.status as 400 | 500 | 502 | 503
        );
      }

      const data = await response.json();
      return c.json(data);
    } catch (error) {
      return handleFetchError(error, 'fetch extension metadata');
    }
  });

  /**
   * GET /api/extensions/:namespace/:name/:version/download
   *
   * Download extension VSIX file as a binary stream.
   * First fetches metadata to get the download URL, then streams the VSIX.
   *
   * @param namespace - Extension namespace
   * @param name - Extension name
   * @param version - Extension version (or "latest" for the latest version)
   */
  app.get('/api/extensions/:namespace/:name/:version/download', async (c) => {
    try {
      const { namespace, name, version } = c.req.param();

      // First, fetch metadata to get the download URL
      const metadataUrl =
        version === 'latest'
          ? `${OPENVSX_BASE_URL}/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
          : `${OPENVSX_BASE_URL}/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;

      const metadataResponse = await fetch(metadataUrl, {
        signal: createTimeoutSignal(SEARCH_METADATA_TIMEOUT),
        headers: {
          Accept: 'application/json',
        },
      });

      if (!metadataResponse.ok) {
        if (metadataResponse.status === 404) {
          return c.json(
            {
              error: {
                code: 'NOT_FOUND',
                message: `Extension ${namespace}.${name}@${version} not found`,
              },
            },
            404
          );
        }
        logger.error(`OpenVSX metadata for download returned ${metadataResponse.status}`);
        return c.json(
          { error: { code: 'UPSTREAM_ERROR', message: `OpenVSX returned ${metadataResponse.status}` } },
          metadataResponse.status as 400 | 500 | 502 | 503
        );
      }

      const metadata = (await metadataResponse.json()) as {
        files?: { download?: string };
        downloads?: { universal?: string };
      };

      // Get download URL from metadata
      const downloadUrl = metadata.files?.download || metadata.downloads?.universal;
      if (!downloadUrl) {
        logger.error('No download URL in metadata:', JSON.stringify(metadata, null, 2));
        return c.json(
          { error: { code: 'NO_DOWNLOAD_URL', message: 'Extension metadata does not contain a download URL' } },
          404
        );
      }

      // Stream the VSIX file
      const downloadResponse = await fetch(downloadUrl, {
        signal: createTimeoutSignal(DOWNLOAD_TIMEOUT),
      });

      if (!downloadResponse.ok) {
        logger.error(`VSIX download returned ${downloadResponse.status}`);
        return c.json(
          { error: { code: 'DOWNLOAD_FAILED', message: `Failed to download VSIX: ${downloadResponse.status}` } },
          downloadResponse.status as 400 | 404 | 500 | 502 | 503
        );
      }

      if (!downloadResponse.body) {
        return c.json({ error: { code: 'NO_BODY', message: 'Download response has no body' } }, 502);
      }

      // Forward Content-Type and other relevant headers
      const contentType = downloadResponse.headers.get('Content-Type') || 'application/octet-stream';
      const contentLength = downloadResponse.headers.get('Content-Length');
      const contentDisposition =
        downloadResponse.headers.get('Content-Disposition') ||
        `attachment; filename="${namespace}.${name}-${version}.vsix"`;

      // Stream the response body
      return stream(c, async (streamWriter) => {
        c.header('Content-Type', contentType);
        if (contentLength) {
          c.header('Content-Length', contentLength);
        }
        c.header('Content-Disposition', contentDisposition);

        const reader = downloadResponse.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await streamWriter.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      });
    } catch (error) {
      return handleFetchError(error, 'download VSIX');
    }
  });

  return app;
}
