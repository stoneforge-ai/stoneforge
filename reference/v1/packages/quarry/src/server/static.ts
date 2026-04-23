/**
 * Static File Serving Middleware
 *
 * Serves pre-built web UI assets from a webRoot directory.
 * Falls back to index.html for client-side routing (SPA catch-all).
 * Reusable by both quarry and smithy servers.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import type { Hono } from 'hono';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
};

/**
 * Register static file serving middleware on a Hono app.
 * Only registers if the webRoot directory exists.
 *
 * API routes (/api/*) and WebSocket routes (/ws*) are NOT intercepted.
 * All other GET requests are served from the webRoot directory,
 * with SPA fallback to index.html for unmatched paths.
 */
export function registerStaticMiddleware(app: Hono, webRoot: string): void {
  if (!existsSync(webRoot)) {
    return;
  }

  const indexPath = resolve(webRoot, 'index.html');
  const hasIndex = existsSync(indexPath);

  console.log(`[static] Serving web assets from ${webRoot}`);

  app.get('*', (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip API and WebSocket routes
    if (path.startsWith('/api/') || path.startsWith('/ws')) {
      return next();
    }

    // Try to serve the exact file
    const filePath = resolve(webRoot, path === '/' ? 'index.html' : path.slice(1));

    // Prevent directory traversal
    if (!filePath.startsWith(webRoot)) {
      return next();
    }

    if (existsSync(filePath)) {
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = readFileSync(filePath);
      return c.body(content, 200, { 'Content-Type': contentType });
    }

    // SPA fallback: serve index.html for non-file paths
    if (hasIndex && !extname(path)) {
      const content = readFileSync(indexPath);
      return c.body(content, 200, { 'Content-Type': 'text/html' });
    }

    return next();
  });
}
