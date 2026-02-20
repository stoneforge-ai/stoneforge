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
import { installSkillsToWorkspace } from './install.js';

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
  auto_export: true
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

export const DEFAULT_AGENTS_MD = `# AGENTS.md

Context and instructions for AI coding agents working in this Stoneforge workspace.

## Quick Start

| I need...                  | Where to look                              |
| -------------------------- | ------------------------------------------ |
| Project documentation      | Check your project's \`docs/\` directory   |
| Core type details          | \`sf show <id>\` or workspace docs         |
| CLI commands               | \`sf help\` or \`sf <command> --help\`     |
| Architecture overview      | Check your project's \`docs/\` directory   |

---

## Core Concepts

### Element Types

- **Core Types**: Task, Message, Document, Entity
- **Collection Types**: Plan, Workflow, Playbook, Channel, Library, Team
- **All inherit from Element** (id, type, timestamps, tags, metadata, createdBy)

### Dual Storage Model

- **SQLite**: Fast queries, indexes, FTS — the **cache**
- **JSONL**: Git-tracked, append-only — the **source of truth**

### Dependencies

- **Blocking types**: \`blocks\`, \`awaits\`, \`parent-child\` — affect task status
- **Non-blocking**: \`relates-to\`, \`mentions\`, \`references\` — informational only
- \`blocked\` status is **computed** from dependencies, never set directly

### Agent Roles (Orchestrator)

- **Director**: Owns task backlog, spawns workers, makes strategic decisions
- **Worker**: Executes assigned tasks (ephemeral or persistent)
- **Steward**: Handles code merges, documentation scanning and fixes

---

## CLI Usage

\`\`\`bash
sf task ready         # List ready tasks
sf task blocked       # List blocked tasks
sf show <id>          # Show element details
sf task create --title "..." --priority 3 --type feature
sf dependency add --type=blocks <blocked-id> <blocker-id>
sf task close <id> --reason "..."
sf stats              # View progress stats
\`\`\`

---

## Critical Gotchas

1. **\`blocked\` is computed** — Never set \`status: 'blocked'\` directly; it's derived from dependencies
2. **\`blocks\` direction** — \`sf dependency add --type=blocks A B\` means A is blocked BY B (B completes first)
3. **Messages need \`contentRef\`** — \`sendDirectMessage()\` requires a \`DocumentId\`, not raw text
4. **\`sortByEffectivePriority()\` mutates** — Returns same array reference, modifies in place
5. **SQLite is cache** — JSONL is the source of truth; SQLite can be rebuilt
6. **No auto cycle detection** — \`api.addDependency()\` doesn't check cycles; use \`DependencyService.detectCycle()\`
7. **FTS not indexed on import** — After \`sf import\`, run \`sf document reindex\` to rebuild search index
8. **\`relates-to\` is bidirectional** — Query both directions: \`getDependencies()\` AND \`getDependents()\`
9. **Closed/tombstone always wins** — In merge conflicts, these statuses take precedence
10. **Dirty tracking** — All mutations through QuarryAPI; never modify SQLite directly

---

## Implementation Guidelines

### Type Safety

- Use branded types: \`ElementId\`, \`TaskId\`, \`EntityId\`, \`DocumentId\`
- Implement type guards: \`isTask()\`, \`isElement()\`, etc.
- Use \`asEntityId()\`, \`asElementId()\` casts only at trust boundaries

### Storage Operations

- All mutations through \`QuarryAPI\` — never modify SQLite directly
- Dirty tracking marks elements for incremental export
- Content hashing enables merge conflict detection

### Testing

- Tests colocated with source: \`*.test.ts\` next to \`*.ts\`
- Integration tests use real SQLite (\`:memory:\` or temp files)

### Error Handling

- Use \`StoneforgeError\` with appropriate \`ErrorCode\`
- CLI formats errors based on output mode (standard, verbose, quiet)

---

## Agent Orchestration Overview

The orchestrator manages AI agent lifecycles for multi-agent task execution:

\`\`\`
Director → creates tasks, assigns priorities → dispatches to Workers
Workers  → execute tasks in git worktrees → update status, handoff
Stewards → merge completed work, documentation scanning and fixes
\`\`\`

Override built-in agent prompts by placing files in \`.stoneforge/prompts/\`.

---

## Commit Guidelines

- Create commits after completing features, refactors, or significant changes
- Only commit files you changed
- Use conventional commit format: \`feat:\`, \`fix:\`, \`chore:\`, \`docs:\`
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

    // Create AGENTS.md at workspace root (skip if AGENTS.md or CLAUDE.md already exists)
    const agentsMdPath = join(workDir, 'AGENTS.md');
    const claudeMdPath = join(workDir, 'CLAUDE.md');
    let agentsMdCreated = false;
    if (!existsSync(agentsMdPath) && !existsSync(claudeMdPath)) {
      writeFileSync(agentsMdPath, DEFAULT_AGENTS_MD);
      agentsMdCreated = true;
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
      const syncDir = join(stoneforgeDir, 'sync');
      const elementsJsonl = join(syncDir, 'elements.jsonl');
      const depsJsonl = join(syncDir, 'dependencies.jsonl');
      if (existsSync(elementsJsonl) || existsSync(depsJsonl)) {
        const syncService = createSyncService(backend);
        const importResult = syncService.importSync({ inputDir: syncDir });
        importMessage = `\nImported ${importResult.elementsImported} element(s) and ${importResult.dependenciesImported} dependency(ies) from JSONL files`;
      }
    }

    // Install skills (non-fatal if it fails)
    let skillsMessage = '';
    let skillsInstalled = 0;
    try {
      const skillsResult = installSkillsToWorkspace(workDir);
      if (skillsResult) {
        skillsInstalled = skillsResult.installed.length;
        if (skillsResult.installed.length > 0) {
          skillsMessage = `\nInstalled ${skillsResult.installed.length} skill(s) to ${skillsResult.targetDir}`;
        } else if (skillsResult.skipped.length > 0) {
          skillsMessage = `\nSkills already installed (${skillsResult.skipped.length} skill(s) skipped)`;
        }
        if (skillsResult.errors.length > 0) {
          skillsMessage += `\nWarning: Failed to install ${skillsResult.errors.length} skill(s)`;
        }
      } else {
        skillsMessage = '\nSkills installation skipped (no skills source found)';
      }
    } catch (skillsErr) {
      const skillsErrMsg = skillsErr instanceof Error ? skillsErr.message : String(skillsErr);
      skillsMessage = `\nWarning: Skills installation failed: ${skillsErrMsg}`;
    }

    const baseMessage = partialInit
      ? `Initialized Stoneforge workspace from existing files at ${stoneforgeDir}`
      : `Initialized Stoneforge workspace at ${stoneforgeDir}`;

    const agentsMdMessage = agentsMdCreated
      ? '\nCreated AGENTS.md at workspace root'
      : '';

    return success(
      { path: stoneforgeDir, operatorId: OPERATOR_ENTITY_ID, agentsMdCreated, skillsInstalled },
      `${baseMessage}\nCreated default operator entity: ${OPERATOR_ENTITY_ID}${agentsMdMessage}${importMessage}${skillsMessage}`
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
