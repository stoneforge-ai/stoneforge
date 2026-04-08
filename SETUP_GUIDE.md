# Stoneforge Orchestration Setup Guide

Complete guide for running Stoneforge as your daily multi-agent development command center.

---

## Prerequisites

- **Node.js** >= 18.0.0 ([download](https://nodejs.org/))
- **Git** ([download](https://git-scm.com/))
- **Claude Code CLI** — the AI engine that powers agents (`npm install -g @anthropic-ai/claude-code`)
- **Claude MAX or Pro subscription** — sign up at [claude.ai/settings/billing](https://claude.ai/settings/billing)

> pnpm is also required but is installed automatically by `setup.sh`.

---

## Step 1: Install & Build

### Recommended: Use the setup script

```bash
git clone https://github.com/stoneforge-ai/stoneforge.git
cd stoneforge
./setup.sh
```

The script checks prerequisites, installs pnpm, downloads dependencies, builds the project, creates the `sf` command, and initializes the workspace. It takes 2-3 minutes.

### Manual install (alternative)

If you prefer to run each step yourself:

```bash
# Install pnpm if you don't have it
npm install -g pnpm@8

# Install dependencies
pnpm install

# Build all packages (core → storage → quarry → smithy → apps)
pnpm build

# Create an alias for the sf command
alias sf="node $(pwd)/packages/smithy/dist/bin/sf.js"
```

---

## Step 2: Initialize Workspace

```bash
sf init --name "my-project"
```

This creates:
- `.stoneforge/config.yaml` — configuration
- `.stoneforge/stoneforge.db` — SQLite database
- `.stoneforge/sync/` — JSONL source-of-truth files
- `.stoneforge/prompts/` — custom agent prompt overrides
- 4 default agents: `director`, `e-worker-1`, `e-worker-2`, `m-steward-1`

### Configuration (`.stoneforge/config.yaml`)

```yaml
actor: el-0000              # Default operator entity
database: stoneforge.db
sync:
  auto_export: true
  export_debounce: 1000     # ms between auto-exports
  elements_file: elements.jsonl
  dependencies_file: dependencies.jsonl
playbooks:
  paths:
    - playbooks
identity:
  mode: soft                # soft | cryptographic | hybrid
```

Environment variables override config:
- `STONEFORGE_ACTOR` — default actor ID
- `STONEFORGE_DB` — database path
- `STONEFORGE_DEMO_MODE` — use free opencode provider

---

## Step 3: Agent Team Setup

### Director (already registered by `sf init`)

```bash
sf agent show director
# ID: el-486f, Role: director, Status: idle
```

The Director plans work, creates tasks, sets priorities. It does NOT write code.

### Workers (3 ephemeral workers)

Two workers are created by `sf init`. Register additional workers:

```bash
sf agent register e-worker-3 --role worker --mode ephemeral
```

Workers execute tasks in isolated git worktrees. Each gets its own branch (`agent/{worker-name}/{task-id}-{slug}`) preventing merge conflicts.

### Merge Steward (auto-merge with test verification)

```bash
sf agent show m-steward-1
# Role: steward, Focus: merge
```

The Steward automatically:
1. Monitors completed task branches
2. Syncs branch with main, resolves conflicts
3. Reviews changes against acceptance criteria
4. Runs tests (`pnpm test`)
5. Squash-merges on pass, creates fix tasks on fail
6. Cleans up branches and worktrees

---

## Step 4: Launch the Dashboard

```bash
# Start the orchestrator server + web dashboard
sf serve

# Or with custom port
sf serve smithy --port 8080

# Development mode (hot reload)
pnpm dev:smithy
```

Open **http://localhost:3457** in your browser.

### Dashboard Sections

| Section | Purpose |
|---------|---------|
| **Overview** | Activity feed, inbox, quick editor |
| **Work** | Tasks, merge requests, plans, workflows |
| **Orchestration** | Agent status, steward activity, dispatch graph |
| **Collaborate** | Messages between agents, document library |
| **Analytics** | Metrics and progress tracking |
| **Director Panel** | Right sidebar for interactive Director control |

---

## Step 5: Start the Agents

```bash
# Start the Director (interactive mode)
sf agent start director --mode interactive

# Workers are spawned automatically by the dispatch daemon
# when tasks are available. You can also start manually:
sf agent start e-worker-1 --mode headless

# Start the Steward
sf agent start m-steward-1 --mode headless

# Stream live output from any agent
sf agent stream e-worker-1
```

---

## Daily Operations

### Adding Tasks via CLI

```bash
# Simple task
sf task create --title "Fix login redirect bug" --priority 1 --type bug

# Task with description
sf task create \
  --title "Add dark mode toggle" \
  --priority 3 \
  --type feature \
  --description "Add a toggle in Settings to switch themes. Update CSS variables."

# Task within a plan
sf plan create --title "Authentication Refactor"
sf task create --title "Extract token service" --priority 2 --plan "Authentication Refactor"
sf task create --title "Extract session service" --priority 2 --plan "Authentication Refactor"
sf plan activate <plan-id>

# Task with tags
sf task create --title "Update CI pipeline" --type chore --tag ci --tag devops
```

### Adding Tasks via Dashboard

1. Navigate to **Work > Tasks**
2. Click **+ New Task**
3. Fill in title, priority, type, description
4. Optionally attach to a plan
5. Save — the dispatch daemon will auto-assign to an available worker

### Monitor Agent Progress in Real-Time

```bash
# List all agents and their status
sf agent list

# Stream live output from a specific agent
sf agent stream e-worker-1

# View task progress
sf task list --status in_progress

# Check ready (unblocked) tasks
sf task ready

# View blocked tasks with reasons
sf task blocked

# Overall workspace stats
sf stats
```

In the dashboard: **Orchestration > Agents** shows live agent output and status.

### Configure Auto-Merge Rules

The merge steward follows rules defined in `.stoneforge/prompts/steward-merge.md`:

- **Auto-approve**: If tests pass and changes match acceptance criteria
- **Handoff**: If changes need revision, creates a handoff task with review comments
- **Conflict resolution**: Steward resolves simple conflicts; escalates ambiguous ones

To customize merge behavior, edit `.stoneforge/prompts/steward-merge.md`:

```markdown
## Review Criteria
- Code follows project conventions
- Tests pass (run `pnpm test` before merging)
- No new lint warnings
- Changes stay within task scope
```

### Cross-Agent Communication

```bash
# Director sends message to a worker
sf message send --from <director-id> --to <worker-id> --content "Clarification on task..."

# Worker checks inbox
sf inbox

# View agent's dedicated channel
sf channel show <channel-id>

# List all channels
sf channel list
```

Each agent gets a dedicated channel on registration. The Director communicates with workers through direct messages and channel broadcasts.

### Reusable Workflow Templates (Playbooks)

Create playbook files in `.stoneforge/playbooks/`:

```yaml
# .stoneforge/playbooks/feature-workflow.yaml
name: Feature Development
description: Standard feature development workflow
steps:
  - title: "Create feature branch"
    role: worker
  - title: "Implement feature"
    role: worker
  - title: "Write tests"
    role: worker
  - title: "Code review"
    role: steward
  - title: "Merge to main"
    role: steward
```

```bash
# List available playbooks
sf playbook list

# Run a playbook
sf playbook run <playbook-id>
```

---

## Architecture Reference

```
Director ──→ creates tasks, sets priorities ──→ Dispatch Daemon
Dispatch Daemon ──→ auto-assigns tasks ──→ Workers (in isolated worktrees)
Workers ──→ complete tasks, push branches ──→ Merge Steward
Merge Steward ──→ tests, reviews, squash-merges ──→ Main branch
```

### Ports

| Service | Port | URL |
|---------|------|-----|
| Quarry Server (platform) | 3456 | http://localhost:3456 |
| Smithy Server (orchestrator) | 3457 | http://localhost:3457 |
| Quarry Web (dev) | 5173 | http://localhost:5173 |
| Smithy Web (dev) | 5174 | http://localhost:5174 |

### Key CLI Commands Reference

```bash
# Workspace
sf init                          # Initialize workspace
sf serve                         # Start server + dashboard
sf stats                         # View workspace statistics

# Agents
sf agent list                    # List all agents
sf agent register <n> --role <r> # Register new agent
sf agent start <id>              # Start agent session
sf agent stop <id>               # Stop agent session
sf agent stream <id>             # Stream agent output

# Tasks
sf task create --title "..."     # Create task
sf task list --status <s>        # List by status
sf task ready                    # Show unblocked tasks
sf task blocked                  # Show blocked tasks
sf task close <id> --reason "."  # Close task
sf task assign <id> --to <eid>   # Assign task
sf show <id>                     # Show any element

# Plans
sf plan create --title "..."     # Create plan (draft)
sf plan activate <id>            # Activate plan (enables dispatch)

# Communication
sf message send --from <> --to <> --content "..."
sf inbox                         # Check inbox

# Documents
sf document create --title "..." --content "..."
sf document search "query"       # Full-text search
```

---

## Current Agent Roster

| ID | Name | Role | Status |
|----|------|------|--------|
| el-486f | director | Director | idle |
| el-66kx | e-worker-1 | Worker (ephemeral) | idle |
| el-2nfa | e-worker-2 | Worker (ephemeral) | idle |
| el-p4zm | e-worker-3 | Worker (ephemeral) | idle |
| el-4v3g | m-steward-1 | Steward (merge) | idle |

## Test Task Created

- **ID**: el-3bzo4a
- **Title**: Refactor authentication module into separate service files
- **Priority**: 2 (High)
- **Status**: open
- **Type**: feature

Start the Director and this task will be dispatched to an available worker automatically.
