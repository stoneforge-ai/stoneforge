/**
 * Shared Database Helpers
 *
 * Provides common database resolution and API creation functions
 * used across all CLI command modules.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GlobalOptions } from './types.js';
import { createStorage, initializeSchema, type StorageBackend } from '@stoneforge/storage';
import { createQuarryAPI } from '../api/quarry-api.js';
import type { QuarryAPI } from '../api/types.js';
import type { EntityId } from '@stoneforge/core';
import { OPERATOR_ENTITY_ID } from './commands/init.js';
import { findStoneforgeDir } from '../config/file.js';

// ============================================================================
// Constants
// ============================================================================

export const STONEFORGE_DIR = '.stoneforge';
export const DEFAULT_DB_NAME = 'stoneforge.db';
export const DEFAULT_ACTOR = OPERATOR_ENTITY_ID;

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Resolves database path from options or default location.
 *
 * @param options - Global options that may contain db path
 * @param requireExists - If true (default), only return path if database file exists.
 *                        If false, return path even if file doesn't exist (for create operations).
 */
export function resolveDatabasePath(options: GlobalOptions, requireExists: boolean = true): string | null {
  if (options.db) {
    // When db path is explicitly provided, check if it exists when required
    if (requireExists && !existsSync(options.db)) {
      return null;
    }
    return options.db;
  }

  // Find .stoneforge directory via STONEFORGE_ROOT env or walk-up search.
  // This supports agents running in git worktrees where the database
  // lives in the main workspace root, not in the worktree itself.
  const stoneforgeDir = findStoneforgeDir(process.cwd());
  if (stoneforgeDir) {
    const dbPath = join(stoneforgeDir, DEFAULT_DB_NAME);
    if (requireExists && !existsSync(dbPath)) {
      return null;
    }
    return dbPath;
  }

  return null;
}

/**
 * Gets actor from options or default
 */
export function resolveActor(options: GlobalOptions): EntityId {
  return (options.actor ?? DEFAULT_ACTOR) as EntityId;
}

/**
 * Creates an API instance from options.
 *
 * @param options - Global options containing db path and other settings
 * @param createDb - If true, create the database if it doesn't exist. Default is false.
 *                   When false, returns an error if the database file doesn't exist.
 */
export function createAPI(options: GlobalOptions, createDb: boolean = false): { api: QuarryAPI; backend: StorageBackend; error?: string } {
  // For read operations (createDb=false), require the database to exist
  // For write operations (createDb=true), allow creating a new database
  const dbPath = resolveDatabasePath(options, !createDb);
  if (!dbPath) {
    return {
      api: null as unknown as QuarryAPI,
      backend: null as unknown as StorageBackend,
      error: 'No database found. Run "sf init" to initialize a workspace, or specify --db path',
    };
  }

  try {
    // Note: SQLite doesn't properly support create: false, so we always use create: true
    // The existence check is handled above in resolveDatabasePath when createDb is false
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    return { api: createQuarryAPI(backend), backend };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      api: null as unknown as QuarryAPI,
      backend: null as unknown as StorageBackend,
      error: `Failed to open database: ${message}`,
    };
  }
}
