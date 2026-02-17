/**
 * Server Configuration
 *
 * Centralized configuration for the orchestrator server.
 */

import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('orchestrator');

export const PORT = parseInt(process.env.ORCHESTRATOR_PORT || process.env.PORT || '3457', 10);
export const HOST = process.env.HOST || 'localhost';

export const PROJECT_ROOT = process.cwd();
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, '.stoneforge/stoneforge.db');
export const DB_PATH = process.env.STONEFORGE_DB_PATH || DEFAULT_DB_PATH;

export const UPLOAD_DIR = '/tmp/stoneforge-terminal-uploads';

export const CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175', // Test port
  'http://127.0.0.1:5175', // Test port
];

/**
 * Resolves the path to the Claude CLI executable.
 *
 * Resolution order:
 * 1. CLAUDE_PATH environment variable
 * 2. `which claude` output
 * 3. Common installation locations
 * 4. Fallback to 'claude'
 */
export function getClaudePath(): string {
  if (process.env.CLAUDE_PATH) {
    return process.env.CLAUDE_PATH;
  }

  try {
    const result = execSync('which claude', { encoding: 'utf-8', timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // Continue to fallbacks
  }

  const commonPaths = [
    `${process.env.HOME}/.local/bin/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  logger.warn('Claude CLI not found, falling back to PATH resolution');
  return 'claude';
}
