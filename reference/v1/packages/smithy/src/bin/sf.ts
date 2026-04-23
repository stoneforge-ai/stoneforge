#!/usr/bin/env node
/**
 * Stoneforge CLI Entry Point (re-exported from @stoneforge/quarry)
 *
 * This allows `bun install -g @stoneforge/smithy` to register the `sf` command
 * system-wide, since npm/bun only links binaries from directly installed packages.
 *
 * We pre-register the smithy server loader so that quarry's `sf serve` command
 * can find it without relying on `import('@stoneforge/smithy/server')`, which
 * fails under pnpm's strict module isolation (quarry can't resolve smithy).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '@stoneforge/quarry/cli';
import { cliPlugin } from '../cli/plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pre-register smithy components so quarry can find them without dynamic import.
// This avoids failures under pnpm's strict module isolation where quarry
// can't resolve @stoneforge/smithy via `import('@stoneforge/smithy')`.
(globalThis as Record<string, unknown>).__stoneforge_smithy = {
  loadServer: () => import('../server/index.js'),
  webRoot: resolve(__dirname, '../../web'),
  cliPlugin,
};

main();
