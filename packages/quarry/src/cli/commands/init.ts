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

const DEFAULT_GITIGNORE = `# Stoneforge gitignore
*.db
*.db-journal
*.db-wal
*.db-shm
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

  // Check if already initialized
  if (existsSync(stoneforgeDir)) {
    return failure(
      `Workspace already initialized at ${stoneforgeDir}`,
      ExitCode.VALIDATION
    );
  }

  try {
    // Create .stoneforge directory
    mkdirSync(stoneforgeDir, { recursive: true });

    // Create config file
    let config = DEFAULT_CONFIG;
    if (options.actor) {
      config = config.replace('# actor: my-agent', `actor: ${options.actor}`);
    }
    writeFileSync(join(stoneforgeDir, CONFIG_FILENAME), config);

    // Create gitignore
    writeFileSync(join(stoneforgeDir, GITIGNORE_FILENAME), DEFAULT_GITIGNORE);

    // Create playbooks directory
    mkdirSync(join(stoneforgeDir, 'playbooks'), { recursive: true });

    // Create the database and operator entity
    const dbPath = join(stoneforgeDir, DEFAULT_DB_NAME);
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

    return success(
      { path: stoneforgeDir, operatorId: OPERATOR_ENTITY_ID },
      `Initialized Stoneforge workspace at ${stoneforgeDir}\nCreated default operator entity: ${OPERATOR_ENTITY_ID}`
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
