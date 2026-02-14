/**
 * Stoneforge Smithy Server - Dev Entry Point
 *
 * Thin wrapper that imports startSmithyServer from @stoneforge/smithy/server.
 * Preserved for pnpm dev with hot-reload.
 */

import { startSmithyServer } from '@stoneforge/smithy/server';

startSmithyServer().catch((err) => {
  console.error('[orchestrator] Fatal error during startup:', err);
  process.exit(1);
});
