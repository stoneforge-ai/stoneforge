/**
 * init command - Initialize a new Stoneforge workspace
 *
 * Creates the .stoneforge/ directory with:
 * - Empty database with default operator entity
 * - Default configuration file
 * - gitignore file
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@stoneforge/storage';
import { createQuarryAPI } from '../../api/quarry-api.js';
import {
  ElementType,
  createTimestamp,
  createEntity,
  createDirectChannel,
  type Entity,
  type EntityId,
  type ElementId,
  type Channel,
  type ChannelId,
} from '@stoneforge/core';
import { EntityTypeValue, asEntityId } from '@stoneforge/core';
import { createSyncService } from '../../sync/service.js';
import { installSkillsToWorkspace } from './install.js';
import type { QuarryAPI } from '../../api/quarry-api.js';
import type { WorkflowPreset, PartialConfiguration } from '../../config/types.js';
import { VALID_WORKFLOW_PRESETS } from '../../config/types.js';
import { updateConfigFile } from '../../config/file.js';

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

const DEMO_CONFIG = `# Stoneforge Configuration (Demo Mode)
# See https://github.com/stoneforge/stoneforge for documentation
#
# Demo mode is active: all agents use opencode/minimax-m2.5-free (free tier).
# To disable demo mode, set demo_mode to false and reconfigure agents.

# Default actor for operations (optional)
# actor: my-agent

# Database path (relative to .stoneforge/)
database: stoneforge.db

# Demo mode — agents use the free opencode/minimax-m2.5-free provider
demo_mode: true

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
// Default Agents
// ============================================================================

/**
 * Agent metadata key used by the orchestrator (matches smithy's AGENT_META_KEY)
 */
const AGENT_META_KEY = 'agent';

/**
 * Default agents to create during workspace initialization.
 * These match the standard orchestration roles.
 */
export const DEFAULT_AGENTS = [
  {
    name: 'director',
    metadata: {
      agentRole: 'director',
      sessionStatus: 'idle',
      maxConcurrentTasks: 1,
    },
  },
  {
    name: 'e-worker-1',
    metadata: {
      agentRole: 'worker',
      workerMode: 'ephemeral',
      sessionStatus: 'idle',
      maxConcurrentTasks: 1,
    },
  },
  {
    name: 'e-worker-2',
    metadata: {
      agentRole: 'worker',
      workerMode: 'ephemeral',
      sessionStatus: 'idle',
      maxConcurrentTasks: 1,
    },
  },
  {
    name: 'm-steward-1',
    metadata: {
      agentRole: 'steward',
      stewardFocus: 'merge',
      triggers: [],
      sessionStatus: 'idle',
      maxConcurrentTasks: 1,
    },
  },
] as const;

/**
 * Creates default agents if they don't already exist.
 * When provider/model are specified (e.g. demo mode), they are set on each agent.
 * Returns the number of agents created (skips existing ones for idempotency).
 */
async function createDefaultAgents(
  api: QuarryAPI,
  agentOptions?: { provider?: string; model?: string }
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const agentDef of DEFAULT_AGENTS) {
    // Check if agent already exists (idempotency)
    const existing = await api.lookupEntityByName(agentDef.name);
    if (existing) {
      skipped++;
      continue;
    }

    // Build agent metadata, optionally adding provider/model
    const agentMeta: Record<string, unknown> = { ...agentDef.metadata };
    if (agentOptions?.provider) {
      agentMeta.provider = agentOptions.provider;
    }
    if (agentOptions?.model) {
      agentMeta.model = agentOptions.model;
    }

    // Create the entity with agent metadata
    const entity = await createEntity({
      name: agentDef.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: OPERATOR_ENTITY_ID,
      metadata: { [AGENT_META_KEY]: agentMeta },
    });

    const savedEntity = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
    const agentEntityId = asEntityId(savedEntity.id);

    // Create a direct channel between operator and the agent
    const channel = await createDirectChannel({
      entityA: OPERATOR_ENTITY_ID,
      entityB: agentEntityId,
      entityAName: OPERATOR_ENTITY_NAME,
      entityBName: agentDef.name,
      createdBy: OPERATOR_ENTITY_ID,
      tags: ['agent-channel'],
      metadata: {
        agentId: agentEntityId,
        agentName: agentDef.name,
        purpose: 'Agent direct messaging channel',
      },
    });

    await api.create<Channel>(
      channel as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    // Update agent metadata with channelId
    const updatedMeta = {
      ...savedEntity.metadata,
      [AGENT_META_KEY]: {
        ...agentMeta,
        channelId: channel.id as unknown as ChannelId,
      },
    };
    await api.update(savedEntity.id, { metadata: updatedMeta });

    created++;
  }

  return { created, skipped };
}

// ============================================================================
// Workflow Preset Definitions
// ============================================================================

/**
 * Config values produced by each workflow preset.
 * Runtime behavior is driven by individual config values, not the preset name.
 */
export const WORKFLOW_PRESET_CONFIGS: Record<WorkflowPreset, PartialConfiguration> = {
  auto: {
    merge: {
      autoMerge: true,
      targetBranch: null,
      requireApproval: false,
    },
    workflow: { preset: 'auto' },
    agents: { permissionModel: 'unrestricted' },
  },
  review: {
    merge: {
      autoMerge: true,
      targetBranch: 'stoneforge/review',
      requireApproval: false,
    },
    workflow: { preset: 'review' },
    agents: { permissionModel: 'unrestricted' },
  },
  approve: {
    merge: {
      autoMerge: false,
      targetBranch: null,
      requireApproval: true,
    },
    workflow: { preset: 'approve' },
    agents: { permissionModel: 'restricted' },
  },
};

const PRESET_DESCRIPTIONS: Record<WorkflowPreset, string> = {
  auto: 'Agents merge directly to main. Fast iteration, no human review.',
  review: 'Agents merge to a review branch. You review and merge to main.',
  approve: 'Agents need approval for restricted actions. Merges via GitHub PRs.',
};

/**
 * Renders the preset menu to stdout with the current selection highlighted.
 */
function renderPresetMenu(
  presets: WorkflowPreset[],
  selectedIndex: number,
  isInitialRender: boolean
): void {
  const { stdout } = process;

  if (!isInitialRender) {
    // Calculate actual physical lines consumed (accounting for terminal wrapping)
    const cols = stdout.columns || 80;
    let physicalLines = 0;
    for (const p of presets) {
      const label = p.charAt(0).toUpperCase() + p.slice(1);
      const line = `    ${label.padEnd(10)}— ${PRESET_DESCRIPTIONS[p]}`;
      physicalLines += Math.ceil(line.length / cols);
    }
    // Move cursor up by the total physical line count
    stdout.write(`\x1B[${physicalLines}A`);
    // Clear from cursor to end of screen (handles any leftover wrapped content)
    stdout.write('\x1B[J');
  }

  for (let i = 0; i < presets.length; i++) {
    const p = presets[i];
    const label = p.charAt(0).toUpperCase() + p.slice(1);
    const prefix = i === selectedIndex ? '  ❯ ' : '    ';
    stdout.write(`${prefix}${label.padEnd(10)}— ${PRESET_DESCRIPTIONS[p]}\n`);
  }
}

/**
 * Prompts the user to choose a workflow preset interactively
 * using arrow-key navigation.
 */
async function promptWorkflowPreset(): Promise<WorkflowPreset> {
  const presets: WorkflowPreset[] = ['auto', 'review', 'approve'];
  let selectedIndex = 0;

  const { stdin, stdout } = process;

  return new Promise((resolve) => {
    // Print header
    stdout.write('? Choose a workflow preset:\n');

    // Hide cursor during selection
    stdout.write('\x1B[?25l');

    // Initial render
    renderPresetMenu(presets, selectedIndex, true);

    // Enable raw mode for keypress detection
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      // Show cursor
      stdout.write('\x1B[?25h');
      // Restore raw mode state
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (data: string) => {
      // Ctrl+C — exit gracefully
      if (data === '\x03') {
        cleanup();
        process.exit(0);
      }

      // Enter — confirm selection
      if (data === '\r' || data === '\n') {
        cleanup();
        resolve(presets[selectedIndex]);
        return;
      }

      // Arrow up
      if (data === '\x1B[A') {
        if (selectedIndex > 0) {
          selectedIndex--;
          renderPresetMenu(presets, selectedIndex, false);
        }
        return;
      }

      // Arrow down
      if (data === '\x1B[B') {
        if (selectedIndex < presets.length - 1) {
          selectedIndex++;
          renderPresetMenu(presets, selectedIndex, false);
        }
        return;
      }
    };

    stdin.on('data', onData);
  });
}

// ============================================================================
// Command Options
// ============================================================================

interface InitOptions {
  name?: string;
  actor?: string;
  demo?: boolean;
  preset?: string;
}

// ============================================================================
// Demo Mode Constants
// ============================================================================

const DEMO_PROVIDER = 'opencode';
const DEMO_MODEL = 'opencode/minimax-m2.5-free';

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

    const isDemo = options.demo === true;

    // Determine workflow preset
    let selectedPreset: WorkflowPreset | undefined;
    if (options.preset) {
      const presetLower = options.preset.toLowerCase();
      if (!VALID_WORKFLOW_PRESETS.includes(presetLower as WorkflowPreset)) {
        return failure(
          `Invalid preset '${options.preset}'. Must be one of: ${VALID_WORKFLOW_PRESETS.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      selectedPreset = presetLower as WorkflowPreset;
    } else if (process.stdin.isTTY) {
      // Interactive prompt only when running in a terminal
      selectedPreset = await promptWorkflowPreset();
    }

    // Create config file (skip if already present)
    const configPath = join(stoneforgeDir, CONFIG_FILENAME);
    if (!existsSync(configPath)) {
      let config = isDemo ? DEMO_CONFIG : DEFAULT_CONFIG;
      if (options.name) {
        // Insert workspace name at the top of the config, after the header comment
        config = config.replace(
          '# Default actor for operations (optional)',
          `# Workspace name\nname: ${options.name}\n\n# Default actor for operations (optional)`
        );
      }
      if (options.actor) {
        config = config.replace('# actor: my-agent', `actor: ${options.actor}`);
      }
      writeFileSync(configPath, config);
    }

    // Apply workflow preset config values to config file
    if (selectedPreset) {
      const presetConfig = WORKFLOW_PRESET_CONFIGS[selectedPreset];
      updateConfigFile(configPath, presetConfig);
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

    // Create default agents (director, workers, steward)
    // In demo mode, configure all agents with the free opencode/minimax-m2.5-free provider
    const agentResult = await createDefaultAgents(
      api,
      isDemo ? { provider: DEMO_PROVIDER, model: DEMO_MODEL } : undefined
    );

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

    // Build polished, branded output
    const isTTY = process.stdout.isTTY;
    const bold = isTTY ? '\x1b[1m' : '';
    const dim = isTTY ? '\x1b[2m' : '';
    const green = isTTY ? '\x1b[32m' : '';
    const cyan = isTTY ? '\x1b[36m' : '';
    const yellow = isTTY ? '\x1b[33m' : '';
    const reset = isTTY ? '\x1b[0m' : '';

    const relativePath = relative(workDir, stoneforgeDir) + '/';
    const agentNames = DEFAULT_AGENTS.map(a => a.name).join(', ');

    // Concise preset descriptions for the summary display
    const PRESET_SHORT: Record<WorkflowPreset, string> = {
      auto: 'Fast iteration, no human review',
      review: 'You review and merge to main',
      approve: 'Agents need approval, merges via PRs',
    };

    const lines: string[] = [];

    // Branding
    lines.push('');
    lines.push(`  ${cyan}⛏  Stoneforge${reset}`);
    lines.push('');

    // Success indicator
    const initLabel = partialInit ? 'Workspace initialized from existing files' : 'Workspace initialized';
    lines.push(`  ${green}✔${reset} ${bold}${initLabel}${reset}`);
    lines.push('');

    // Key-value summary
    const labelWidth = 11; // "Preset" is longest meaningful label
    const pad = (label: string) => `  ${dim}${label.padEnd(labelWidth)}${reset}`;

    if (options.name) {
      lines.push(`${pad('Name')}${options.name}`);
    }
    if (selectedPreset) {
      lines.push(`${pad('Preset')}${bold}${selectedPreset}${reset} ${dim}— ${PRESET_SHORT[selectedPreset]}${reset}`);
    }
    lines.push(`${pad('Agents')}${agentNames}`);
    if (skillsInstalled > 0) {
      lines.push(`${pad('Skills')}${skillsInstalled} installed`);
    } else if (skillsMessage.includes('skipped')) {
      lines.push(`${pad('Skills')}already installed`);
    } else if (skillsMessage.includes('skipped') === false && skillsMessage.includes('failed')) {
      lines.push(`${pad('Skills')}${yellow}installation failed${reset}`);
    }
    if (agentsMdCreated) {
      lines.push(`${pad('AGENTS.md')}created at workspace root`);
    }
    if (importMessage) {
      lines.push(`${pad('Imported')}${importMessage.replace(/^\n?Imported\s*/, '')}`);
    }
    lines.push(`${pad('Path')}${relativePath}`);

    // Warnings for skipped agents
    if (agentResult.skipped > 0) {
      lines.push('');
      lines.push(`  ${dim}${agentResult.skipped} existing agent(s) skipped${reset}`);
    }

    // Skills warnings
    if (skillsMessage.includes('Warning:')) {
      const warningText = skillsMessage.replace(/^\n?Warning:\s*/, '');
      lines.push(`  ${yellow}⚠${reset} ${dim}${warningText}${reset}`);
    }

    // Demo mode notice
    if (isDemo) {
      lines.push('');
      lines.push(`  ${yellow}🎮 Demo mode active${reset}`);
      lines.push(`  ${dim}All agents use the free ${DEMO_MODEL} provider — no API keys required.${reset}`);
      lines.push(`  ${dim}Disable with demo_mode: false in .stoneforge/config.yaml${reset}`);
    }

    // Next steps
    lines.push('');
    lines.push(`  ${bold}Next steps:${reset}`);
    lines.push(`    Run ${cyan}sf serve${reset} to start the dashboard`);
    lines.push(`    Run ${cyan}sf help${reset}  for available commands`);
    lines.push('');

    return success(
      { path: stoneforgeDir, operatorId: OPERATOR_ENTITY_ID, agentsMdCreated, skillsInstalled, agentsCreated: agentResult.created, demoMode: isDemo, name: options.name, preset: selectedPreset },
      lines.join('\n')
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
  usage: 'sf init [--name <name>] [--actor <actor>] [--demo] [--preset auto|review|approve]',
  help: `Initialize a new Stoneforge workspace in the current directory.

Creates a .stoneforge/ directory containing:
  - config.yaml     Default configuration file
  - stoneforge.db    SQLite database with default operator entity
  - .gitignore      Git ignore patterns for database files
  - playbooks/      Directory for playbook definitions

The database is created with a default "operator" entity (el-0000) that serves
as the default actor for CLI operations and web applications.

Default agents are automatically created:
  - director        Director agent for task management
  - e-worker-1      Ephemeral worker agent
  - e-worker-2      Ephemeral worker agent
  - m-steward-1     Merge steward agent

Re-running init is safe — existing agents are not duplicated.

Workflow presets configure merge and agent permission behavior:
  Auto    — Agents merge directly to main. Fast iteration, no human review.
  Review  — Agents merge to a review branch. You review and merge to main.
  Approve — Agents need approval for restricted actions. Merges via GitHub PRs.

Options:
  --name    Set the workspace name (stored in config.yaml).
  --preset  Set workflow preset (auto, review, approve). Skips interactive prompt.
  --demo    Enable demo mode. Configures all agents to use the free
            opencode/minimax-m2.5-free provider (no API keys required).`,
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
    {
      name: 'preset',
      description: 'Workflow preset (auto, review, approve)',
      hasValue: true,
    },
    {
      name: 'demo',
      description: 'Enable demo mode with free opencode/minimax-m2.5-free provider',
      hasValue: false,
    },
  ],
  handler: initHandler as Command['handler'],
};
