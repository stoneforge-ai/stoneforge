/**
 * Asset Routes
 *
 * Upload and serve image assets from .stoneforge/assets/.
 * Assets are git-tracked and persistent across workspace sessions.
 */

import { resolve, extname } from 'node:path';
import { writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { PROJECT_ROOT } from '../config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('orchestrator');

/**
 * Directory where uploaded assets are stored (relative to workspace root).
 */
const ASSETS_DIR_NAME = '.stoneforge/assets';

/**
 * Allowed image extensions for upload validation.
 */
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

/**
 * MIME types for serving images with correct Content-Type headers.
 */
const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Maximum upload size (10MB).
 */
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * Validates that a filename is safe (no directory traversal).
 * Returns true if the filename is safe, false otherwise.
 */
function isSafeFilename(filename: string): boolean {
  // Reject filenames containing path separators or parent directory references
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  // Reject empty filenames or filenames that are just dots
  if (!filename || filename === '.' || filename === '..') {
    return false;
  }
  return true;
}

export function createAssetRoutes() {
  const app = new Hono();
  const workspaceRoot = PROJECT_ROOT;
  const assetsDir = resolve(workspaceRoot, ASSETS_DIR_NAME);

  // POST /api/assets/upload — Upload an image asset
  app.post('/api/assets/upload', async (c) => {
    try {
      const body = (await c.req.json()) as { filename?: string; data?: string };

      if (!body.data) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'No file data provided' } }, 400);
      }

      if (!body.filename) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'No filename provided' } }, 400);
      }

      // Validate the file extension is an allowed image type
      const ext = extname(body.filename).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
        return c.json(
          {
            error: {
              code: 'INVALID_FILE_TYPE',
              message: `File type '${ext || 'unknown'}' is not allowed. Allowed types: ${[...ALLOWED_IMAGE_EXTENSIONS].join(', ')}`,
            },
          },
          400
        );
      }

      // Decode the base64 data
      const buffer = Buffer.from(body.data, 'base64');

      // Check file size
      if (buffer.length > MAX_UPLOAD_SIZE) {
        return c.json(
          { error: { code: 'FILE_TOO_LARGE', message: `File exceeds maximum size of ${MAX_UPLOAD_SIZE} bytes` } },
          400
        );
      }

      // Generate unique filename: {timestamp}-{random-hex}-{sanitized-original-name}.{ext}
      const timestamp = Date.now();
      const randomSuffix = randomBytes(4).toString('hex');
      const nameWithoutExt = ext ? body.filename.slice(0, -ext.length) : body.filename;
      const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFilename = `${timestamp}-${randomSuffix}-${sanitizedName}${ext}`;

      // Ensure assets directory exists
      await mkdir(assetsDir, { recursive: true });

      // Save file
      const filePath = resolve(assetsDir, uniqueFilename);
      await writeFile(filePath, buffer);

      // Build response
      const relativePath = `${ASSETS_DIR_NAME}/${uniqueFilename}`;
      const url = `/api/assets/${uniqueFilename}`;

      return c.json({
        path: relativePath,
        filename: uniqueFilename,
        size: buffer.length,
        url,
      });
    } catch (error) {
      logger.error('Failed to upload asset:', error);
      return c.json({ error: { code: 'UPLOAD_FAILED', message: String(error) } }, 500);
    }
  });

  // GET /api/assets/:filename — Serve an uploaded asset
  app.get('/api/assets/:filename', async (c) => {
    try {
      const filename = c.req.param('filename');

      // Validate filename to prevent directory traversal
      if (!isSafeFilename(filename)) {
        return c.json({ error: { code: 'INVALID_FILENAME', message: 'Invalid filename' } }, 400);
      }

      const filePath = resolve(assetsDir, filename);

      // Double-check the resolved path is still within the assets directory
      if (!filePath.startsWith(assetsDir)) {
        return c.json({ error: { code: 'INVALID_FILENAME', message: 'Invalid filename' } }, 400);
      }

      // Check if file exists
      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) {
          return c.json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } }, 404);
        }
      } catch {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } }, 404);
      }

      // Determine content type
      const ext = extname(filename).toLowerCase();
      const contentType = IMAGE_MIME_TYPES[ext] || 'application/octet-stream';

      // Read and serve the file
      const content = await readFile(filePath);

      return c.body(content, 200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    } catch (error) {
      logger.error('Failed to serve asset:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}
