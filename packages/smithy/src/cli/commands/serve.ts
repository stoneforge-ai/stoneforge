/**
 * serve smithy command - Start the Stoneforge smithy server and web dashboard
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Command definition for `sf serve smithy`
 */
export const serveSmithyCommand = {
  name: 'serve smithy',
  description: 'Start the Stoneforge orchestrator server and dashboard',
  usage: 'sf serve smithy [options]',
  options: [
    { name: 'port', short: 'p', description: 'Port to listen on', hasValue: true, defaultValue: '3457' },
    { name: 'host', short: 'H', description: 'Host to bind to', hasValue: true, defaultValue: 'localhost' },
  ],
  handler: async (_args: string[], options: Record<string, unknown>) => {
    try {
      const { startSmithyServer } = await import('../../server/index.js');

      const port = options.port ? parseInt(String(options.port), 10) : 3457;
      const host = options.host ? String(options.host) : 'localhost';

      // Look for pre-built web assets
      const webRoot = resolve(__dirname, '../../../web');
      const hasWebAssets = existsSync(webRoot);

      await startSmithyServer({
        port,
        host,
        dbPath: options.db ? String(options.db) : undefined,
        webRoot: hasWebAssets ? webRoot : undefined,
      });

      console.log(`[orchestrator] Smithy server running at http://${host}:${port}`);

      // Keep the process alive — never resolve so main() doesn't call process.exit()
      return await new Promise<never>(() => {});
    } catch (error) {
      return {
        exitCode: 1,
        error: `Failed to start smithy server: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Command definition for bare `sf serve` (aliases to `sf serve smithy`)
 */
export const serveCommand = {
  name: 'serve',
  description: 'Start the Stoneforge server (aliases to serve smithy when installed)',
  usage: 'sf serve [options]',
  options: serveSmithyCommand.options,
  handler: serveSmithyCommand.handler,
};
