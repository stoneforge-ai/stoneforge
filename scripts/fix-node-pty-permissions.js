#!/usr/bin/env node
/**
 * Fix node-pty spawn-helper permissions
 *
 * pnpm sometimes loses execute permissions on native binaries when extracting
 * packages. The spawn-helper binary in node-pty needs execute permission for
 * PTY spawning to work on macOS/Linux.
 *
 * This script runs as a postinstall hook to ensure the permissions are correct.
 */

import { chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const spawnHelperPaths = [
  'node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper',
  'node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-x64/spawn-helper',
  // Add future versions as needed using glob pattern fallback
];

async function fixPermissions() {
  const allPaths = [...spawnHelperPaths];

  for (const relativePath of allPaths) {
    const fullPath = join(rootDir, relativePath);
    if (existsSync(fullPath)) {
      try {
        await chmod(fullPath, 0o755);
        console.log(`[postinstall] Fixed permissions: ${relativePath}`);
      } catch (error) {
        console.warn(`[postinstall] Could not fix permissions for ${relativePath}:`, error.message);
      }
    }
  }

  // Glob fallback for any version of node-pty
  try {
    const { globSync } = await import('glob');
    const pattern = join(rootDir, 'node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/*/spawn-helper');
    const matches = globSync(pattern);

    for (const match of matches) {
      if (!allPaths.some(p => match.endsWith(p.replace('node_modules/', '')))) {
        try {
          await chmod(match, 0o755);
          console.log(`[postinstall] Fixed permissions: ${match.replace(rootDir + '/', '')}`);
        } catch (error) {
          console.warn(`[postinstall] Could not fix permissions for ${match}:`, error.message);
        }
      }
    }
  } catch {
    // glob not available, that's fine - hardcoded paths should cover most cases
  }
}

fixPermissions().catch(console.error);
