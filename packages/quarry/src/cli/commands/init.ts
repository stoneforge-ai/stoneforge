/**
 * init command - Initialize a new Stoneforge workspace
 *
 * Creates the .stoneforge/ directory with:
 * - Empty database with default operator entity
 * - Default configuration file
 * - gitignore file
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import {
  ElementType,
  createTimestamp,
  type Entity,
  type EntityId,
  type ElementId,
} from '@stoneforge/core';
import { EntityTypeValue } from '@stoneforge/core';
import { createSyncService } from '../../sync/service.js';

// ============================================================================
// Constants
// ============================================================================

const STONEFORGE_DIR = '.stoneforge';
const CONFIG_FILENAME = 'config.yaml';
const GITIGNORE_FILENAME = '.gitignore';
const DEFAULT_DB_NAME = 'stoneforge.db';

/**
 * Default operator entity ID - used as the CLI user and default actor
 */
export const OPERATOR_ENTITY_ID = 'el-0000' as EntityId;

/**
 * Default operator entity name
 */
export const OPERATOR_ENTITY_NAME = 'operator';

// ============================================================================
// Default Content
// ============================================================================

const DEFAULT_CONFIG = `# Stoneforge Configuration
# See https://github.com/stoneforge/stoneforge for documentation

# Default actor for operations (optional)
# actor: my-agent

# Database path (relative to .stoneforge/)
database: stoneforge.db

# Sync settings
sync:
  auto_export: false
  elements_file: elements.jsonl
  dependencies_file: dependencies.jsonl

# Playbook search paths
playbooks:
  paths:
    - playbooks

# Identity settings
identity:
  mode: soft
`;

const DEFAULT_GITIGNORE = `# Runtime data
*.db
*.db-journal
*.db-wal
*.db-shm
daemon-state.json
`;

// ============================================================================
// Command Options
// ============================================================================

interface InitOptions {
  name?: string;
  actor?: string;
}

// ============================================================================
// Handler
// ============================================================================

async function initHandler(
  _args: string[],
  options: GlobalOptions & InitOptions
): Promise<CommandResult> {
  const workDir = process.cwd();
  const stoneforgeDir = join(workDir, STONEFORGE_DIR);

  const dbPath = join(stoneforgeDir, DEFAULT_DB_NAME);
  const dirExists = existsSync(stoneforgeDir);
  const dbExists = dirExists && existsSync(dbPath);

  // Fully initialized — directory and database both exist
  if (dirExists && dbExists) {
    return failure(
      `Workspace already initialized at ${stoneforgeDir}`,
      ExitCode.VALIDATION
    );
  }

  // Partial init: directory exists (e.g. cloned repo) but no database
  const partialInit = dirExists && !dbExists;

  try {
    // Create .stoneforge directory (skip if already present)
    if (!dirExists) {
      mkdirSync(stoneforgeDir, { recursive: true });
    }

    // Create config file (skip if already present)
    const configPath = join(stoneforgeDir, CONFIG_FILENAME);
    if (!existsSync(configPath)) {
      let config = DEFAULT_CONFIG;
      if (options.actor) {
        config = config.replace('# actor: my-agent', `actor: ${options.actor}`);
      }
      writeFileSync(configPath, config);
    }

    // Create gitignore (skip if already present)
    const gitignorePath = join(stoneforgeDir, GITIGNORE_FILENAME);
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, DEFAULT_GITIGNORE);
    }

    // Create playbooks directory (skip if already present)
    const playbooksDir = join(stoneforgeDir, 'playbooks');
    if (!existsSync(playbooksDir)) {
      mkdirSync(playbooksDir, { recursive: true });
    }

    // Create the database and operator entity
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createQuarryAPI(backend);

    // Create the default operator entity (el-0000)
    const now = createTimestamp();
    const operatorEntity: Entity = {
      id: OPERATOR_ENTITY_ID as unknown as ElementId,
      type: ElementType.ENTITY,
      createdAt: now,
      updatedAt: now,
      createdBy: OPERATOR_ENTITY_ID,
      tags: [],
      metadata: {},
      name: OPERATOR_ENTITY_NAME,
      entityType: EntityTypeValue.HUMAN,
    };

    await api.create(operatorEntity as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Import from JSONL files if they exist (common after cloning a repo)
    let importMessage = '';
    if (partialInit) {
      const elementsJsonl = join(stoneforgeDir, 'elements.jsonl');
      const depsJsonl = join(stoneforgeDir, 'dependencies.jsonl');
      if (existsSync(elementsJsonl) || existsSync(depsJsonl)) {
        const syncService = createSyncService(backend);
        const importResult = syncService.importSync({ inputDir: stoneforgeDir });
        importMessage = `\nImported ${importResult.elementsImported} element(s) and ${importResult.dependenciesImported} dependency(ies) from JSONL files`;
      }
    }

    const baseMessage = partialInit
      ? `Initialized Stoneforge workspace from existing files at ${stoneforgeDir}`
      : `Initialized Stoneforge workspace at ${stoneforgeDir}`;

    return success(
      { path: stoneforgeDir, operatorId: OPERATOR_ENTITY_ID },
      `${baseMessage}\nCreated default operator entity: ${OPERATOR_ENTITY_ID}${importMessage}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to initialize workspace: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const initCommand: Command = {
  name: 'init',
  description: 'Initialize a new Stoneforge workspace',
  usage: 'sf init [--name <name>] [--actor <actor>]',
  help: `Initialize a new Stoneforge workspace in the current directory.

Creates a .stoneforge/ directory containing:
  - config.yaml     Default configuration file
  - stoneforge.db    SQLite database with default operator entity
  - .gitignore      Git ignore patterns for database files
  - playbooks/      Directory for playbook definitions

The database is created with a default "operator" entity (el-0000) that serves
as the default actor for CLI operations and web applications.`,
  options: [
    {
      name: 'name',
      description: 'Workspace name (optional)',
      hasValue: true,
    },
    {
      name: 'actor',
      description: 'Default actor for operations',
      hasValue: true,
    },
  ],
  handler: initHandler as Command['handler'],
};
