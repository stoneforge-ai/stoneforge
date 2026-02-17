#!/usr/bin/env node
/**
 * Fix node-pty spawn-helper permissions
 *
 * Package managers sometimes lose execute permissions on native binaries.
 * The spawn-helper binary in node-pty needs execute permission for PTY
 * spawning to work on macOS/Linux.
 *
 * Uses require.resolve to find node-pty regardless of package manager
 * (npm, pnpm, yarn, bun).
 *
 * Runs as a postinstall hook from both the smithy package (for NPM consumers)
 * and the monorepo root (for local development).
 */

const { chmodSync, existsSync } = require('node:fs');
const { join, dirname } = require('node:path');

if (process.platform === 'win32') {
  process.exit(0);
}

let nodePtyDir;
try {
  const pkgPath = require.resolve('node-pty/package.json');
  nodePtyDir = dirname(pkgPath);
} catch {
  // node-pty not installed — nothing to fix
  process.exit(0);
}

const prebuildsDir = join(nodePtyDir, 'prebuilds');
if (!existsSync(prebuildsDir)) {
  process.exit(0);
}

const { readdirSync } = require('node:fs');
let fixed = 0;

for (const platformDir of readdirSync(prebuildsDir, { withFileTypes: true })) {
  if (!platformDir.isDirectory()) continue;
  const helperPath = join(prebuildsDir, platformDir.name, 'spawn-helper');
  if (existsSync(helperPath)) {
    try {
      chmodSync(helperPath, 0o755);
      fixed++;
      console.log(`[postinstall] Fixed permissions: node-pty/prebuilds/${platformDir.name}/spawn-helper`);
    } catch (err) {
      console.warn(`[postinstall] Could not fix permissions for ${helperPath}: ${err.message}`);
    }
  }
}

if (fixed === 0) {
  console.log('[postinstall] No spawn-helper binaries found to fix');
}
