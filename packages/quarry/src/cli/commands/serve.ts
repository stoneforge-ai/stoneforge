/**
 * serve command - Start a Stoneforge server
 *
 * Usage:
 *   sf serve           - Start smithy (if installed) or quarry
 *   sf serve quarry    - Start the quarry server
 *   sf serve smithy    - Start the smithy server
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { failure, ExitCode } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function quarryWebRoot(): string | undefined {
  const webRoot = resolve(__dirname, '../../../web');
  return existsSync(webRoot) ? webRoot : undefined;
}

function smithyWebRoot(): string | undefined {
  try {
    // import.meta.resolve returns a file:// URL for the smithy package entry
    const smithyUrl = import.meta.resolve('@stoneforge/smithy');
    const smithyPath = fileURLToPath(smithyUrl);
    // From smithy's entry (dist/index.js or src/index.ts), go up to package root + /web
    const webRoot = resolve(dirname(smithyPath), '../web');
    if (existsSync(webRoot)) return webRoot;
    // Try one more level up (for src/index.ts → ../../web)
    const webRoot2 = resolve(dirname(smithyPath), '../../web');
    if (existsSync(webRoot2)) return webRoot2;
  } catch {
    // smithy not installed
  }
  return undefined;
}

async function startQuarry(options: GlobalOptions): Promise<CommandResult> {
  const { startQuarryServer } = await import('../../server/index.js');

  const port = options.port ? parseInt(String(options.port), 10) : 3456;
  const host = options.host ? String(options.host) : 'localhost';

  startQuarryServer({
    port,
    host,
    dbPath: options.db ? String(options.db) : undefined,
    webRoot: quarryWebRoot(),
  });

  console.log(`[stoneforge] Quarry server running at http://${host}:${port}`);
  return await new Promise<never>(() => {});
}

async function startSmithy(options: GlobalOptions): Promise<CommandResult> {
  let startSmithyServer: (opts: Record<string, unknown>) => Promise<unknown>;
  try {
    const mod = await import('@stoneforge/smithy/server');
    startSmithyServer = mod.startSmithyServer;
  } catch {
    return failure(
      'Smithy is not installed. Install @stoneforge/smithy to use `sf serve smithy`.',
      ExitCode.GENERAL_ERROR
    );
  }

  const port = options.port ? parseInt(String(options.port), 10) : 3457;
  const host = options.host ? String(options.host) : 'localhost';

  await startSmithyServer({
    port,
    host,
    dbPath: options.db ? String(options.db) : undefined,
    webRoot: smithyWebRoot(),
  });

  console.log(`[orchestrator] Smithy server running at http://${host}:${port}`);
  return await new Promise<never>(() => {});
}

export const serveCommand: Command = {
  name: 'serve',
  description: 'Start a Stoneforge server (smithy, quarry)',
  usage: 'sf serve [quarry|smithy] [options]',
  options: [
    { name: 'port', short: 'p', description: 'Port to listen on', hasValue: true },
    { name: 'host', short: 'H', description: 'Host to bind to', hasValue: true, defaultValue: 'localhost' },
  ],
  handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
    const target = args[0];

    try {
      if (target === 'quarry') {
        return await startQuarry(options);
      }

      if (target === 'smithy') {
        return await startSmithy(options);
      }

      if (target) {
        return failure(
          `Unknown server target: ${target}. Use 'quarry' or 'smithy'.`,
          ExitCode.INVALID_ARGUMENTS
        );
      }

      // No target specified — try smithy first, fall back to quarry
      try {
        await import('@stoneforge/smithy/server');
        return await startSmithy(options);
      } catch {
        return await startQuarry(options);
      }
    } catch (error) {
      return failure(
        `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
        ExitCode.GENERAL_ERROR
      );
    }
  },
};
