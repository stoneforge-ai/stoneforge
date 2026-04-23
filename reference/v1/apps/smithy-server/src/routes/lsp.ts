/**
 * LSP Routes
 *
 * HTTP routes for LSP status and configuration.
 */

import { Hono } from 'hono';
import type { LspManager } from '../services/lsp-manager.js';

export function createLspRoutes(lspManager: LspManager) {
  const app = new Hono();

  /**
   * GET /api/lsp/status
   *
   * Get the status of all language servers, including availability and running state.
   */
  app.get('/api/lsp/status', async (c) => {
    const servers = await lspManager.getStatus();
    return c.json({
      servers,
      workspaceRoot: lspManager.getWorkspaceRoot(),
    });
  });

  /**
   * POST /api/lsp/start/:language
   *
   * Start a language server for the specified language.
   */
  app.post('/api/lsp/start/:language', async (c) => {
    const { language } = c.req.param();
    const process = await lspManager.startServer(language);

    if (!process) {
      return c.json(
        { error: `Failed to start language server for ${language}` },
        400
      );
    }

    return c.json({
      success: true,
      language,
      serverId: lspManager.getServerIdForLanguage(language),
    });
  });

  /**
   * POST /api/lsp/stop/:serverId
   *
   * Stop a running language server.
   */
  app.post('/api/lsp/stop/:serverId', (c) => {
    const { serverId } = c.req.param();
    lspManager.stopServer(serverId);
    return c.json({ success: true, serverId });
  });

  return app;
}
