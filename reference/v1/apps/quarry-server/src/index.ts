/**
 * Stoneforge Quarry Server - Dev Entry Point
 *
 * Thin wrapper that imports startQuarryServer from @stoneforge/quarry/server.
 * Preserved for pnpm dev with hot-reload.
 */

import { startQuarryServer } from '@stoneforge/quarry/server';

startQuarryServer();
