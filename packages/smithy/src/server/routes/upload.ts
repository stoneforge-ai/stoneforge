/**
 * Terminal Upload Routes
 *
 * File upload endpoint for terminal drag-and-drop support.
 */

import { resolve, extname } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { UPLOAD_DIR } from '../config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('orchestrator');

export function createUploadRoutes() {
  const app = new Hono();

  // POST /api/terminal/upload
  app.post('/api/terminal/upload', async (c) => {
    try {
      await mkdir(UPLOAD_DIR, { recursive: true });

      const timestamp = Date.now();
      const randomSuffix = randomBytes(4).toString('hex');

      const body = (await c.req.json()) as { filename?: string; data?: string };

      if (!body.data) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'No file data provided' } }, 400);
      }

      const buffer = Buffer.from(body.data, 'base64');
      const originalName = body.filename || `file-${timestamp}`;

      const ext = extname(originalName);
      const nameWithoutExt = ext ? originalName.slice(0, -ext.length) : originalName;
      const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFilename = `${timestamp}-${randomSuffix}-${sanitizedName}${ext}`;
      const filePath = resolve(UPLOAD_DIR, uniqueFilename);

      await writeFile(filePath, buffer);

      return c.json({ path: filePath, filename: originalName, size: buffer.length });
    } catch (error) {
      logger.error('Failed to upload file:', error);
      return c.json({ error: { code: 'UPLOAD_FAILED', message: String(error) } }, 500);
    }
  });

  return app;
}
