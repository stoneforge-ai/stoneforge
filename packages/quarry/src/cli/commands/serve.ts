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

/**
 * Pre-registered smithy loader set by packages/smithy/src/bin/sf.ts.
 * This bypasses module resolution issues under pnpm's strict isolation,
 * where quarry cannot resolve @stoneforge/smithy at runtime.
 */
interface SmithyRegistration {
  loadServer: () => Promise<{ startSmithyServer: (opts: Record<string, unknown>) => Promise<unknown> }>;
  webRoot: string;
}

function getSmithyRegistration(): SmithyRegistration | undefined {
  return (globalThis as Record<string, unknown>).__stoneforge_smithy as SmithyRegistration | undefined;
}

function smithyWebRoot(): string | undefined {
  // Check pre-registered path from smithy's sf.js entry point
  const reg = getSmithyRegistration();
  if (reg && existsSync(reg.webRoot)) return reg.webRoot;

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
    // smithy not installed and not pre-registered
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

  // Try pre-registered loader first (set by smithy's sf.js entry point),
  // then fall back to dynamic import for standalone quarry installs.
  const reg = getSmithyRegistration();
  if (reg) {
    const mod = await reg.loadServer();
    startSmithyServer = mod.startSmithyServer;
  } else {
    try {
      // @ts-ignore — smithy is an optional runtime dependency, may not be installed
      const mod = await import('@stoneforge/smithy/server');
      startSmithyServer = mod.startSmithyServer;
    } catch {
      return failure(
        'Smithy is not installed. Install @stoneforge/smithy to use `sf serve smithy`.',
        ExitCode.GENERAL_ERROR
      );
    }
  }

  const port = options.port ? parseInt(String(options.port), 10) : 3457;
  const host = options.host ? String(options.host) : 'localhost';

  const result = await startSmithyServer({
    port,
    host,
    dbPath: options.db ? String(options.db) : undefined,
    webRoot: smithyWebRoot(),
  });

  const actualPort = (result && typeof result === 'object' && 'port' in result) ? (result as { port: number }).port : port;
  console.log(`[orchestrator] Smithy server running at http://${host}:${actualPort}`);
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
      if (getSmithyRegistration()) {
        return await startSmithy(options);
      }
      try {
        // @ts-ignore — smithy is an optional runtime dependency, may not be installed
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
