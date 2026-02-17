/**
 * Stoneforge Smithy Server - Dev Entry Point
 *
 * Thin wrapper that imports startSmithyServer from @stoneforge/smithy/server.
 * Preserved for pnpm dev with hot-reload.
 */

import { startSmithyServer } from '@stoneforge/smithy/server';
import { createLogger, getLogLevel } from '@stoneforge/smithy';

const logger = createLogger('orchestrator');

startSmithyServer().catch((err) => {
  logger.error('Fatal error during startup:', err);
  process.exit(1);
});
