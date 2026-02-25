# CLI Reference

**Entry point:** `packages/quarry/src/bin/sf.ts`
**Commands:** `packages/quarry/src/cli/commands/`

## Installation

```bash
# From project root
bun link

# Or use directly
bun packages/quarry/src/bin/sf.ts
```

## Global Flags

| Flag                       | Description                         |
| -------------------------- | ----------------------------------- |
| `--help, -h`               | Show help                           |
| `--version, -V`            | Show version                        |
| `--json`                   | Output as JSON                      |
| `--quiet, -q`              | Minimal output (IDs only)           |
| `--verbose, -v`            | Enable debug output                 |
| `--actor <name>`           | Specify acting entity               |
| `--from <name>`            | Alias for `--actor`                 |
| `--db <path>`              | Override database path              |
| `--sign-key <key>`         | Private key for signing (base64 PKCS8) |
| `--sign-key-file <path>`   | Path to file containing private key |

## Basic Commands

| Command         | Description                       |
| --------------- | --------------------------------- |
| `sf init`       | Initialize .stoneforge directory  |
| `sf help`       | Show help                         |
| `sf version`    | Show version                      |
| `sf stats`      | Show statistics                   |
| `sf whoami`     | Show current actor                |
| `sf serve`      | Start a Stoneforge server         |
| `sf completion` | Generate shell completion scripts |
| `sf alias`      | Show command aliases              |
| `sf install`    | Install stoneforge extensions     |

## CRUD Commands

| Command            | Description          |
| ------------------ | -------------------- |
| `sf create <type>` | Create a new element |
| `sf list [type]`   | List elements        |
| `sf show <id>`     | Show element details |
| `sf update <id>`   | Update element       |
| `sf delete <id>`   | Delete element       |
| `sf task create`   | Create task          |
| `sf task list`     | List tasks           |

```bash
# Create task (via top-level create)
sf create task --title "Fix bug" --priority 2 --type bug

# Create task (via task subcommand)
sf task create --title "Fix bug" --priority 2 --type bug

# Create task with description (creates a linked document)
sf task create --title "Add login" -d "Implement OAuth login with Google and GitHub providers"

# List elements
sf list task
sf list task --status open

# List tasks (via task subcommand)
sf task list --status open

# Show element
sf show abc123

# Update element
sf update abc123 --status closed

# Delete element
sf delete abc123
```

#### create

Create a new element of the specified type. Currently supports task creation.

```bash
sf create <type> [options]
```

| Option                    | Description                                   |
| ------------------------- | --------------------------------------------- |
| `-t, --title <text>`      | Title for the element (required for tasks)    |
| `-n, --name <text>`       | Alias for `--title`                           |
| `-d, --description <text>`| Task description (creates a linked document)  |
| `-p, --priority <1-5>`    | Priority level (1=critical, 5=minimal)        |
| `-c, --complexity <1-5>`  | Complexity level (1=trivial, 5=very complex)  |
| `--type <type>`           | Task type: bug, feature, task, chore          |
| `-a, --assignee <id>`     | Assignee entity ID                            |
| `--tag <tag>`             | Add a tag (can be repeated)                   |
| `--plan <id\|name>`       | Plan ID or name to attach this task to        |
| `--no-auto-link`          | Skip auto-linking to external provider        |

```bash
sf create task --title "Fix login bug" --priority 1 --type bug
sf create task -t "Add dark mode" --tag ui --tag feature
sf create task -t "New feature" -d "Detailed description here"
sf create task -t "Implement feature X" --plan "My Plan Name"
sf create task -t "Internal task" --no-auto-link
```

#### list

List elements with optional filtering.

```bash
sf list [type] [options]
```

| Option                  | Description                          |
| ----------------------- | ------------------------------------ |
| `-t, --type <type>`     | Filter by element type               |
| `-s, --status <status>` | Filter by status (for tasks)         |
| `-p, --priority <1-5>`  | Filter by priority (for tasks)       |
| `-a, --assignee <id>`   | Filter by assignee (for tasks)       |
| `--tag <tag>`           | Filter by tag (can be repeated for AND) |
| `-l, --limit <n>`       | Maximum results (default: 50)        |
| `-o, --offset <n>`      | Skip first n results (for pagination) |

```bash
sf list task
sf list task --status open
sf list --type task --priority 1 --status in_progress
sf list --tag urgent
sf list task --limit 20 --offset 40
```

#### show

Display detailed information about an element.

```bash
sf show <id> [options]
```

| Option                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `-e, --events`         | Include recent events/history            |
| `--events-limit <n>`   | Maximum events to show (default: 10)     |

```bash
sf show el-abc123
sf show el-abc123 --events
sf show el-abc123 --events --events-limit 20
sf show el-abc123 --json
sf show inbox-abc123     # Show inbox item with message content
```

#### update

Update fields on an existing element.

```bash
sf update <id> [options]
```

| Option                  | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `-t, --title <text>`    | New title                                          |
| `-p, --priority <1-5>`  | New priority (tasks only)                          |
| `-c, --complexity <1-5>`| New complexity (tasks only)                        |
| `-s, --status <status>` | New status (tasks only: open, in_progress, closed, deferred) |
| `-a, --assignee <id>`   | New assignee (tasks only, empty string to unassign) |
| `--tag <tag>`           | Replace all tags (can be repeated)                 |
| `--add-tag <tag>`       | Add a tag (can be repeated)                        |
| `--remove-tag <tag>`    | Remove a tag (can be repeated)                     |

```bash
sf update el-abc123 --title "New Title"
sf update el-abc123 --priority 1 --status in_progress
sf update el-abc123 --add-tag urgent --add-tag frontend
sf update el-abc123 --remove-tag old-tag
sf update el-abc123 --assignee ""  # Unassign
```

#### delete

Soft-delete an element. The element is marked as deleted (tombstone) but not immediately removed.

```bash
sf delete <id> [options]
```

| Option                | Description                              |
| --------------------- | ---------------------------------------- |
| `-r, --reason <text>` | Deletion reason (recorded in audit trail) |
| `-f, --force`         | Skip confirmation (for scripts)          |

Note: Messages cannot be deleted as they are immutable.

```bash
sf delete el-abc123
sf delete el-abc123 --reason "Duplicate entry"
sf delete el-abc123 -f
```

## Init Command

Initialize a new Stoneforge workspace in the current directory.

```bash
sf init [options]
```

| Option            | Description                      |
| ----------------- | -------------------------------- |
| `--name <name>`   | Workspace name (optional)        |
| `--actor <actor>`  | Default actor for operations    |

Creates a `.stoneforge/` directory containing:
- `config.yaml` — Default configuration file
- `stoneforge.db` — SQLite database with default operator entity (`el-0000`)
- `.gitignore` — Git ignore patterns for database files
- `playbooks/` — Directory for playbook definitions
- `AGENTS.md` — Agent context file at workspace root (if no `AGENTS.md` or `CLAUDE.md` exists)

If the `.stoneforge/` directory already exists (e.g., after cloning a repo) but no database is present, `sf init` will create the database and auto-import from any existing JSONL sync files. Claude skills are also installed automatically during init.

```bash
# Initialize a new workspace
sf init

# Initialize with a specific default actor
sf init --actor my-agent
```

## Stats Command

Show statistics about the Stoneforge workspace.

```bash
sf stats [options]
```

Displays element counts by type, ready/blocked task counts, dependency and event counts, and database size.

```bash
# Show all statistics
sf stats

# Output as JSON
sf stats --json
```

## Serve Command

Start a Stoneforge server. Supports starting either the quarry (core) or smithy (orchestrator) server.

```bash
sf serve [quarry|smithy] [options]
```

| Option         | Description                          |
| -------------- | ------------------------------------ |
| `-p, --port <port>` | Port to listen on                |
| `-H, --host <host>` | Host to bind to                  |

```bash
# Start the quarry server
sf serve quarry

# Start the smithy orchestrator server
sf serve smithy

# Start on a specific port
sf serve quarry --port 8080

# Bind to a specific host
sf serve quarry --host 0.0.0.0 --port 3000
```

## Completion Command

Generate shell completion scripts for bash, zsh, or fish.

```bash
sf completion <shell>
```

| Argument | Description                          |
| -------- | ------------------------------------ |
| `shell`  | Shell type: `bash`, `zsh`, or `fish` |

```bash
# Generate bash completions
sf completion bash

# Generate zsh completions
sf completion zsh

# Generate fish completions
sf completion fish
```

**Installation:**

```bash
# Bash — add to ~/.bashrc or ~/.bash_profile:
source <(sf completion bash)
# Or save to a file:
sf completion bash > ~/.local/share/bash-completion/completions/sf

# Zsh — add to ~/.zshrc:
source <(sf completion zsh)
# Or save to a file in your fpath:
sf completion zsh > ~/.zsh/completions/_sf

# Fish — save to completions directory:
sf completion fish > ~/.config/fish/completions/sf.fish
```

## Alias Command

Display all available command aliases. Aliases provide shorter or more intuitive names for existing commands.

```bash
sf alias
```

**Built-in aliases:**

| Alias              | Maps to      |
| ------------------ | ------------ |
| `add`, `new`       | `create`     |
| `rm`, `remove`     | `delete`     |
| `ls`               | `list`       |
| `s`, `get`         | `show`       |
| `todo`, `tasks`    | `ready`      |
| `done`, `complete` | `close`      |
| `st`               | `status`     |
| `dep`              | `dependency` |
| `msg`              | `message`    |
| `doc`              | `document`   |

**Plugin aliases** (available when the orchestrator plugin is loaded):

| Alias              | Maps to      |
| ------------------ | ------------ |
| `agents`           | `agent list` |
| `pools`            | `pool list`  |

```bash
# Show all aliases
sf alias

# Output as JSON
sf alias --json
```

Plugins can register additional aliases. See [CLI Plugins](#cli-plugins) for details.

## Install Command

Install stoneforge extensions to the workspace.

```bash
sf install <subcommand> [options]
```

| Subcommand | Description                          |
| ---------- | ------------------------------------ |
| `skills`   | Install Claude skills to `.claude/skills/` |

#### install skills

Install Claude skills files to the workspace's `.claude/skills/` directory.

| Option          | Description                  |
| --------------- | ---------------------------- |
| `-f, --force`   | Overwrite existing skill files |

```bash
# Install Claude skills
sf install skills

# Overwrite existing skills
sf install skills --force
```

## Task Commands

| Command                          | Description                        |
| -------------------------------- | ---------------------------------- |
| `sf task ready`                  | List ready (unblocked, open) tasks |
| `sf task blocked`                | List blocked tasks                 |
| `sf task backlog`                | List backlog tasks                 |
| `sf task activate <id>`          | Move a task from backlog to open   |
| `sf task close <id>`             | Close task                         |
| `sf task reopen <id>`            | Reopen task                        |
| `sf task show <id>`              | Show task details                  |
| `sf task update <id>`            | Update task fields                 |
| `sf task delete <id>`            | Delete task                        |
| `sf task assign <task> <entity>` | Assign task                        |
| `sf task defer <id>`             | Defer task                         |
| `sf task undefer <id>`           | Remove deferral                    |
| `sf task describe <id>`          | Set or show task description       |

**Top-level convenience commands:** Common task operations are also available as top-level commands (without the `task` prefix):

| Top-level Command           | Equivalent                   |
| --------------------------- | ---------------------------- |
| `sf ready`                  | `sf task ready`              |
| `sf blocked`                | `sf task blocked`            |
| `sf backlog`                | `sf task backlog`            |
| `sf close <id>`             | `sf task close <id>`         |
| `sf reopen <id>`            | `sf task reopen <id>`        |
| `sf assign <task> <entity>` | `sf task assign <task> <entity>` |
| `sf defer <id>`             | `sf task defer <id>`         |
| `sf undefer <id>`           | `sf task undefer <id>`       |

```bash
# List ready tasks
sf task ready

# Close with reason
sf task close abc123 --reason "Fixed in commit xyz"

# Assign task
sf task assign abc123 worker-1

# Set task description
sf task describe el-abc123 --content "Implement login feature"
sf task describe el-abc123 --file description.md

# Show task description
sf task describe el-abc123 --show
```

#### task ready

List ready (unblocked, open) tasks.

| Option                 | Description                       |
| ---------------------- | --------------------------------- |
| `-a, --assignee <id>`  | Filter by assignee                |
| `-p, --priority <1-5>` | Filter by priority                |
| `-t, --type <type>`    | Filter by task type (bug, feature, task, chore) |
| `-l, --limit <n>`      | Maximum results                   |

```bash
sf task ready
sf task ready --assignee alice
sf task ready --priority 1
sf task ready --type bug --limit 10
```

#### task backlog

List backlog tasks.

| Option                 | Description                       |
| ---------------------- | --------------------------------- |
| `-p, --priority <1-5>` | Filter by priority                |
| `-l, --limit <n>`      | Maximum results                   |

```bash
sf task backlog
sf task backlog --priority 1 --limit 20
```

#### task blocked

List blocked tasks.

| Option                 | Description                       |
| ---------------------- | --------------------------------- |
| `-a, --assignee <id>`  | Filter by assignee                |
| `-p, --priority <1-5>` | Filter by priority                |
| `-l, --limit <n>`      | Maximum results                   |

```bash
sf task blocked
sf task blocked --assignee alice --priority 1
```

#### task close

Close a task.

| Option                | Description              |
| --------------------- | ------------------------ |
| `-r, --reason <text>` | Reason for closing       |

```bash
sf task close abc123
sf task close abc123 --reason "Fixed in commit xyz"
```

#### task reopen

Reopen a closed task.

| Option                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `-m, --message <text>` | Message to append to task description        |

```bash
sf task reopen abc123
sf task reopen abc123 --message "Reopening — issue not fully resolved"
```

#### task assign

Assign a task to an entity.

| Option           | Description                       |
| ---------------- | --------------------------------- |
| `-u, --unassign` | Remove assignment instead         |

```bash
sf task assign abc123 worker-1
sf task assign abc123 worker-1 --unassign
```

#### task defer

Defer a task until a future date.

| Option             | Description                        |
| ------------------ | ---------------------------------- |
| `--until <date>`   | Date to defer until (ISO format)   |

```bash
sf task defer abc123 --until 2025-06-01
sf task undefer abc123
```

#### task describe

Set or show a task's description. Descriptions are stored as versioned documents.

| Option                 | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `-c, --content <text>` | Description content (inline)                        |
| `-f, --file <path>`    | Read description from file                          |
| `-s, --show`           | Show current description instead of setting         |
| `--append`             | Append to existing description instead of replacing |

```bash
# Set description inline
sf task describe el-abc123 --content "Implement the login feature with OAuth support"

# Set description from file
sf task describe el-abc123 --file specs/login.md

# Show current description
sf task describe el-abc123 --show

# Append to existing description
sf task describe el-abc123 --append --content "Additional implementation notes"
sf task describe el-abc123 --append -f additional-notes.md
```

#### task list

List tasks with optional filtering.

| Option                  | Description                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `-s, --status <status>` | Filter by status                                                                                                             |
| `--ready`               | Show only dispatch-ready tasks (accounts for blocked cache, draft plans, scheduled-for-future, ephemeral workflows, and plan-level blocking). Mutually exclusive with `--status`. |
| `-t, --type <type>`     | Filter by task type (bug, feature, task, chore). Only effective with `--ready`; in standard list mode, the type is implicitly `task`. |
| `-p, --priority <1-5>`  | Filter by priority                                                                                                           |
| `-a, --assignee <id>`   | Filter by assignee                                                                                                           |
| `--tag <tag>`           | Filter by tag (can be repeated for AND logic)                                                                                |
| `-l, --limit <n>`       | Maximum results (default: 50)                                                                                                |
| `-o, --offset <n>`      | Skip first n results (for pagination)                                                                                        |

```bash
# List all tasks
sf task list

# Filter by status
sf task list --status open

# Show dispatch-ready tasks (more precise than --status open)
sf task list --ready

# Ready tasks assigned to a specific agent
sf task list --ready --assignee alice

# Filter by priority and status
sf task list --priority 1 --status in_progress

# Filter by type
sf task list --type bug

# Filter by tag
sf task list --tag frontend --tag urgent

# Paginate results
sf task list --status open --limit 20 --offset 40
```

## Dependency Commands

| Command                   | Description          |
| ------------------------- | -------------------- |
| `sf dependency add`       | Add dependency       |
| `sf dependency remove`    | Remove dependency    |
| `sf dependency list <id>` | List dependencies    |
| `sf dependency tree <id>` | Show dependency tree |

```bash
# Add blocking dependency
# A is blocked BY B (B must complete first)
sf dependency add --type=blocks A B

# Remove dependency
sf dependency remove A B --type=blocks

# List dependencies
sf dependency list abc123 -d out     # Outgoing
sf dependency list abc123 -d in      # Incoming
sf dependency list abc123 -d both    # Both

# Show tree
sf dependency tree abc123
```

#### dependency add

Add a dependency between two elements.

| Option                 | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `-t, --type <type>`    | Dependency type (required): blocks, parent-child, awaits, relates-to, references, supersedes, duplicates, caused-by, validates, mentions, authored-by, assigned-to, approved-by, replies-to |
| `-m, --metadata <json>` | JSON metadata to attach to the dependency            |

```bash
sf dependency add --type=blocks A B
sf dependency add --type=relates-to A B --metadata '{"reason": "data dependency"}'
```

**Semantics:** `sf dependency add --type=blocks A B` means A (blocked) is blocked BY B (blocker).

#### dependency list

List dependencies for an element.

| Option                    | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `-t, --type <type>`       | Filter by dependency type                        |
| `-d, --direction <dir>`   | Direction: out, in, or both (default: both)      |

```bash
sf dependency list abc123
sf dependency list abc123 -d out
sf dependency list abc123 -d in --type blocks
```

#### dependency tree

Show dependency tree for an element.

| Option              | Description                       |
| ------------------- | --------------------------------- |
| `-d, --depth <n>`   | Maximum tree depth (default: 5)   |

```bash
sf dependency tree abc123
sf dependency tree abc123 --depth 3
```

## Entity Commands

| Command                                    | Description          |
| ------------------------------------------ | -------------------- |
| `sf entity register <name>`                | Register new entity  |
| `sf entity list`                           | List entities        |
| `sf entity set-manager <entity> <manager>` | Set manager          |
| `sf entity clear-manager <entity>`         | Clear manager        |
| `sf entity reports <manager>`              | Get direct reports   |
| `sf entity chain <entity>`                 | Get management chain |

#### entity register

Register a new entity.

| Option                    | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `-t, --type <type>`       | Entity type: agent, human, or system (default: agent) |
| `--public-key <key>`      | Base64-encoded Ed25519 public key                   |
| `--tag <tag>`             | Add tag (can be repeated)                           |

```bash
sf entity register alice
sf entity register alice --type human
sf entity register bot-1 --type agent --tag worker --tag deploy
sf entity register svc --type system --public-key "base64key..."
```

#### entity list

List registered entities.

| Option                | Description                       |
| --------------------- | --------------------------------- |
| `-t, --type <type>`   | Filter by entity type             |
| `-l, --limit <n>`     | Maximum results                   |

```bash
sf entity list
sf entity list --type agent
sf entity list --type human --limit 10
```

## Document Commands

| Command                               | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| `sf document create`                  | Create document                               |
| `sf document list`                    | List documents                                |
| `sf document search <query>`          | Full-text search documents                    |
| `sf document show <id>`               | Show document                                 |
| `sf document update <id>`             | Update document content (creates new version) |
| `sf document history <id>`            | Show version history                          |
| `sf document rollback <id> <version>` | Rollback to version                           |
| `sf document archive <id>`            | Archive document                              |
| `sf document unarchive <id>`          | Unarchive document                            |
| `sf document delete <id>`             | Delete document (soft-delete via tombstone)    |
| `sf document reindex`                 | Reindex documents for FTS5 search             |

#### document create

Create a new document.

| Option                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `--title <text>`        | Document title                                 |
| `-c, --content <text>`  | Document content (inline)                      |
| `-f, --file <path>`     | Read content from file                         |
| `-t, --type <type>`     | Document type: text, markdown, or json         |
| `--category <cat>`      | Document category                              |
| `--tag <tag>`           | Add tag (can be repeated)                      |
| `-m, --metadata <json>` | JSON metadata                                  |

#### document list

List documents.

| Option                   | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `-l, --limit <n>`        | Maximum results                                       |
| `-t, --type <type>`      | Filter by document type                               |
| `--category <cat>`       | Filter by category                                    |
| `--status <status>`      | Filter by status: active or archived                  |
| `-a, --all`              | Include archived documents                            |

#### document show

Show document content.

| Option                    | Description                       |
| ------------------------- | --------------------------------- |
| `-V, --doc-version <ver>` | Show specific version             |

#### document search

Full-text search documents.

| Option                   | Description                       |
| ------------------------ | --------------------------------- |
| `--category <cat>`       | Filter by category                |
| `--status <status>`      | Filter by status                  |
| `-l, --limit <n>`        | Maximum results                   |

#### document history

Show version history for a document.

| Option              | Description                       |
| ------------------- | --------------------------------- |
| `-l, --limit <n>`   | Maximum results                   |

```bash
# Create document with category
sf document create --title "API Spec" --category spec

# List documents (active only by default)
sf document list
sf document list --category spec
sf document list --status archived
sf document list --all                    # Include archived

# Full-text search documents
sf document search "API authentication"
sf document search "migration" --category spec
sf document search "config" --limit 5

# Update document content (creates new version)
sf document update el-doc123 --content "Updated content"
sf document update el-doc123 --file updated-spec.md

# Archive / unarchive
sf document archive abc123
sf document unarchive abc123

# Delete document (soft-delete)
sf document delete el-doc123
sf document delete el-doc123 --reason "outdated"

# Reindex FTS5
sf document reindex
```

#### document update

Update a document's content, creating a new version. Documents are versioned - each update preserves history.

| Option                    | Description                       |
| ------------------------- | --------------------------------- |
| `-c, --content <text>`    | New content (inline)              |
| `-f, --file <path>`       | Read new content from file        |
| `-m, --metadata <json>`   | JSON metadata to merge            |

```bash
sf document update el-doc123 --content "New content here"
sf document update el-doc123 --file path/to/updated.md
sf document update el-doc123 --metadata '{"reviewer": "alice"}'
```

#### document delete

Delete a document via soft-delete (tombstone). The document's content is preserved but marked as deleted.

| Option                  | Description              |
| ----------------------- | ------------------------ |
| `-r, --reason <text>`   | Reason for deletion      |
| `-f, --force`           | Skip confirmation        |

```bash
sf document delete el-doc123
sf document delete el-doc123 --reason "outdated"
sf document delete el-doc123 --force
```

## Embeddings Commands

| Command                        | Description                    |
| ------------------------------ | ------------------------------ |
| `sf embeddings install`        | Install local embedding model  |
| `sf embeddings status`         | Show embedding model status    |
| `sf embeddings reindex`        | Rebuild document embeddings    |
| `sf embeddings search <query>` | Semantic search over documents |

```bash
# Install the local embedding model
sf embeddings install

# Check status
sf embeddings status

# Rebuild embeddings index
sf embeddings reindex

# Search documents by semantic similarity
sf embeddings search "authentication flow"
```

## Plan Commands

| Command                           | Description                       |
| --------------------------------- | --------------------------------- |
| `sf plan create`                  | Create plan (defaults to draft)   |
| `sf plan list`                    | List plans                        |
| `sf plan show <id>`               | Show plan details                 |
| `sf plan activate <id>`           | Activate plan (enables dispatch)  |
| `sf plan complete <id>`           | Mark completed                    |
| `sf plan cancel <id>`             | Cancel plan                       |
| `sf plan add-task <id> <task>`    | Add task to plan                  |
| `sf plan remove-task <id> <task>` | Remove task                       |
| `sf plan tasks <id>`              | List tasks in plan                |
| `sf plan auto-complete`           | Auto-complete active plans        |

#### plan create

Create a new plan.

| Option                  | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `-t, --title <text>`    | Plan title (required)                               |
| `-s, --status <status>` | Initial status: draft (default) or active           |
| `--tag <tag>`           | Add tag (can be repeated)                           |

```bash
sf plan create --title "Feature X"
sf plan create --title "Hotfix" --status active
sf plan create --title "Q3 Roadmap" --tag roadmap --tag q3
```

#### plan list

List plans.

| Option                  | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `-s, --status <status>` | Filter by status: draft, active, completed, cancelled |
| `--tag <tag>`           | Filter by tag (can be repeated for AND logic)       |
| `-l, --limit <n>`       | Maximum results                                     |

```bash
sf plan list
sf plan list --status active
sf plan list --tag roadmap --limit 10
```

#### plan show

Show plan details, optionally including its task list.

| Option           | Description              |
| ---------------- | ------------------------ |
| `-t, --tasks`    | Include task list        |

```bash
sf plan show el-abc123
sf plan show el-abc123 --tasks
sf plan show el-abc123 --json
```

#### plan auto-complete

Auto-complete active plans where all tasks are closed. Scans all active plans and transitions those with all tasks in a closed state to completed status.

This command is idempotent and safe to run at any time. It serves as both a backfill tool for stuck plans and an ongoing maintenance command.

| Option      | Description                                           |
| ----------- | ----------------------------------------------------- |
| `--dry-run` | Show what would be auto-completed without making changes |

```bash
# Auto-complete eligible plans
sf plan auto-complete

# Preview what would be completed
sf plan auto-complete --dry-run

# With JSON output
sf plan auto-complete --json
```

#### plan cancel

Cancel a plan.

| Option                | Description              |
| --------------------- | ------------------------ |
| `-r, --reason <text>` | Reason for cancellation  |

```bash
sf plan cancel el-plan123
sf plan cancel el-plan123 --reason "Superseded by new plan"
```

#### plan tasks

List tasks belonging to a plan.

| Option                  | Description                       |
| ----------------------- | --------------------------------- |
| `-s, --status <status>` | Filter by task status             |
| `-l, --limit <n>`       | Maximum results                   |

```bash
sf plan tasks el-plan123
sf plan tasks el-plan123 --status open
sf plan tasks el-plan123 --status closed --limit 10
```

### Draft Plan Workflow

Plans default to `draft` status. **Tasks in draft plans are NOT dispatchable** — the dispatch daemon will not assign them to workers. This prevents premature dispatch before dependencies are set.

```bash
# 1. Create plan (defaults to draft)
sf plan create --title "Feature X"

# 2. Create tasks in the plan (not yet dispatchable)
sf task create --title "Task 1" --plan "Feature X"
sf task create --title "Task 2" --plan "Feature X"

# 3. Set dependencies between tasks
sf dependency add el-task2 el-task1 --type blocks

# 4. Activate plan (tasks become dispatchable)
sf plan activate <plan-id>
```

**Important:** Always use plans when creating tasks with dependencies to avoid race conditions with the dispatch daemon.

## Workflow Commands

| Command                         | Description               |
| ------------------------------- | ------------------------- |
| `sf workflow create <playbook>` | Instantiate from playbook |
| `sf workflow list`              | List workflows            |
| `sf workflow show <id>`         | Show details              |
| `sf workflow tasks <id>`        | List tasks                |
| `sf workflow progress <id>`     | Show progress             |
| `sf workflow delete <id>`       | Delete ephemeral          |
| `sf workflow promote <id>`      | Promote to durable        |
| `sf workflow gc`                | Garbage collect           |

#### workflow list

List workflows.

| Option                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `-s, --status <status>` | Filter by status                         |
| `-e, --ephemeral`       | Show only ephemeral workflows            |
| `-d, --durable`         | Show only durable workflows              |
| `-l, --limit <n>`       | Maximum results                          |

```bash
sf workflow list
sf workflow list --status running
sf workflow list --ephemeral
sf workflow list --durable --limit 10
```

#### workflow tasks

List tasks in a workflow.

| Option                  | Description                       |
| ----------------------- | --------------------------------- |
| `-r, --ready`           | Show only ready tasks             |
| `-s, --status <status>` | Filter by task status             |
| `-l, --limit <n>`       | Maximum results                   |

```bash
sf workflow tasks el-wf123
sf workflow tasks el-wf123 --ready
sf workflow tasks el-wf123 --status open --limit 20
```

#### workflow delete

Delete a workflow.

| Option          | Description                                   |
| --------------- | --------------------------------------------- |
| `-f, --force`   | Required for deleting durable workflows       |

```bash
sf workflow delete el-wf123
sf workflow delete el-wf123 --force
```

#### workflow create

Instantiate a playbook into a workflow.

| Option                  | Description                               |
| ----------------------- | ----------------------------------------- |
| `--var <name=value>`    | Set variable (can be repeated)            |
| `-e, --ephemeral`       | Create as ephemeral (not synced to JSONL) |
| `-t, --title <text>`    | Override workflow title                   |

```bash
# Instantiate workflow
sf workflow create my-playbook --var name=value

# Create as ephemeral (not persisted to sync)
sf workflow create deploy --ephemeral

# Override the workflow title
sf workflow create deploy --title "Production Deploy v1.2"

# Combine options
sf workflow create deploy --var env=prod --var version=1.2 --ephemeral
```

#### workflow gc

Garbage collect old ephemeral workflows. Deletes workflows that are in a terminal state (completed, failed, or cancelled) and older than the specified age.

| Option              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `-a, --age <days>`  | Maximum age in days (default: 7)                 |
| `--dry-run`         | Show what would be deleted without deleting      |

```bash
# Garbage collect (default 7 days)
sf workflow gc --age 14

# Preview deletions
sf workflow gc --dry-run
```

**Note:** See also [`sf gc workflows`](#gc-commands) which provides the same functionality with different defaults (1 day) and an additional `--limit` flag. See the [GC Commands](#gc-commands) section for details on when to use each.

## Inbox Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `sf inbox <agent-id>`   | List inbox items with message preview |
| `sf inbox read <id>`    | Mark as read                         |
| `sf inbox read-all <entity>` | Mark all as read for entity     |
| `sf inbox unread <id>`  | Mark as unread                       |
| `sf inbox archive <id>` | Archive item                         |
| `sf inbox count <entity>` | Count unread for entity            |
| `sf show <inbox-id>`    | Show inbox item with full content    |

#### inbox list

List inbox items with message content preview.

| Option                   | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `-a, --all`              | Include read and archived items (default: unread only) |
| `-s, --status <status>`  | Filter by status: unread, read, or archived          |
| `-l, --limit <n>`        | Maximum number of items to return                    |
| `-F, --full`             | Show complete message content instead of truncated   |

```bash
# List unread inbox items with message preview
sf inbox alice

# Show full message content
sf inbox alice --full

# Include all items (read, archived)
sf inbox alice --all

# Show single inbox item with full content
sf show inbox-abc123
```

## Channel Commands

| Command                           | Description                                             |
| --------------------------------- | ------------------------------------------------------- |
| `sf channel create`               | Create channel (`--description, -D` to set description) |
| `sf channel list`                 | List channels                                           |
| `sf channel join <id>`            | Join channel                                            |
| `sf channel leave <id>`           | Leave channel                                           |
| `sf channel members <id>`         | List members                                            |
| `sf channel add <ch> <entity>`    | Add member                                              |
| `sf channel remove <ch> <entity>` | Remove member                                           |
| `sf channel merge`                | Merge two channels                                      |

#### channel create

| Option                     | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `-n, --name <name>`        | Channel name (required for group channels)       |
| `-D, --description <text>` | Channel description                              |
| `-t, --type <type>`        | Channel type: group (default) or direct          |
| `-V, --visibility <vis>`   | Visibility: public or private (default)          |
| `-p, --policy <policy>`    | Join policy: open, invite-only (default), or request |
| `-m, --member <id>`        | Add member (can be repeated)                     |
| `-d, --direct <entity>`    | Create direct channel with entity (for --type direct) |
| `--tag <tag>`              | Add tag (can be repeated)                        |

```bash
sf channel create --name general --description "General discussion"
sf channel create --name private-ops -V private -p invite-only
sf channel create --type direct --direct el-user123
sf channel create --name team --member el-a --member el-b
```

#### channel list

List channels.

| Option                | Description                              |
| --------------------- | ---------------------------------------- |
| `-t, --type <type>`   | Filter by type: group or direct          |
| `-m, --member <id>`   | Filter by member                         |
| `-l, --limit <n>`     | Maximum results                          |

```bash
sf channel list
sf channel list --type group
sf channel list --member alice --limit 10
```

#### channel merge

Merge all messages from a source channel into a target channel. Both channels must be group channels. The source channel is archived after the merge.

```bash
sf channel merge --source <id> --target <id> [--name <new-name>]
```

| Option                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `-s, --source <id>`     | Source channel ID (required)             |
| `-t, --target <id>`     | Target channel ID (required)             |
| `-n, --name <new-name>` | Optional new name for the merged channel |

```bash
# Merge source into target
sf channel merge --source el-ch111 --target el-ch222

# Merge and rename the target channel
sf channel merge -s el-ch111 -t el-ch222 --name "combined-channel"
```

## Message Commands

| Command                  | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `sf message send`        | Send message to channel, entity, or as reply       |
| `sf message reply <id>`  | Reply to a message (shorthand for send --reply-to) |
| `sf message thread <id>` | View thread messages                               |
| `sf message list`        | List messages                                      |

#### message send

| Option                  | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `-c, --channel <id>`    | Channel to send to                                                               |
| `-T, --to <entity>`     | Entity to send DM to (finds or creates DM channel)                               |
| `-r, --reply-to <msg>`  | Message ID to reply to (auto-sets channel, thread, swaps sender/recipient in DM) |
| `-m, --content <text>`  | Message content                                                                  |
| `--file <path>`         | Read content from file                                                           |
| `-t, --thread <id>`     | Reply to message (creates thread)                                                |
| `-a, --attachment <id>` | Attach document (can be repeated)                                                |
| `--tag <tag>`           | Add tag (can be repeated)                                                        |

```bash
# Send to channel
sf message send --channel el-abc123 --content "Hello!"

# Send DM to entity (finds or creates DM channel)
sf message send --to el-user456 -m "Direct message"

# Send DM with explicit sender
sf --from agent-1 message send --to agent-2 -m "Message from agent-1"

# Reply to a message (auto-swaps sender/recipient in DM)
sf message send --reply-to el-msg789 -m "Reply to your message"
```

#### message reply

Shorthand for `sf message send --reply-to`. Automatically sets channel and thread from the replied-to message. In DM channels, sender/recipient are swapped unless `--from` is specified.

| Option                  | Description                       |
| ----------------------- | --------------------------------- |
| `-m, --content <text>`  | Message content                   |
| `--file <path>`         | Read content from file            |
| `-a, --attachment <id>` | Attach document (can be repeated) |
| `--tag <tag>`           | Add tag (can be repeated)         |

```bash
sf message reply el-msg123 --content "Thanks for the update!"
sf --from bot message reply el-msg123 -m "Automated response"
```

#### message list

List messages in a channel.

| Option                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `-c, --channel <id>`   | Channel ID (required)                    |
| `-s, --sender <id>`    | Filter by sender                         |
| `-r, --root-only`      | Show only root messages (no replies)     |
| `-l, --limit <n>`      | Maximum results                          |

```bash
sf message list --channel el-ch123
sf message list --channel el-ch123 --sender alice --limit 20
```

#### message thread

View thread messages for a message.

| Option              | Description                       |
| ------------------- | --------------------------------- |
| `-l, --limit <n>`   | Maximum results                   |

```bash
sf message thread el-msg123
sf message thread el-msg123 --limit 50
```

## Team Commands

| Command                          | Description   |
| -------------------------------- | ------------- |
| `sf team create`                 | Create team   |
| `sf team list`                   | List teams    |
| `sf team add <team> <entity>`    | Add member    |
| `sf team remove <team> <entity>` | Remove member |
| `sf team members <id>`           | List members  |
| `sf team delete <id>`            | Delete team   |

#### team create

Create a new team.

| Option                | Description                       |
| --------------------- | --------------------------------- |
| `-n, --name <name>`   | Team name (required)              |
| `-m, --member <id>`   | Add member (can be repeated)      |
| `--tag <tag>`         | Add tag (can be repeated)         |

```bash
sf team create --name "Backend Team"
sf team create --name "Frontend" --member alice --member bob --tag frontend
```

#### team list

List teams.

| Option                | Description                       |
| --------------------- | --------------------------------- |
| `-m, --member <id>`   | Filter by member                  |
| `-l, --limit <n>`     | Maximum results                   |

```bash
sf team list
sf team list --member alice
sf team list --limit 10
```

#### team delete

Delete a team.

| Option                | Description              |
| --------------------- | ------------------------ |
| `-r, --reason <text>` | Reason for deletion      |
| `-f, --force`         | Skip confirmation for teams with members |

```bash
sf team delete el-team123
sf team delete el-team123 --reason "Team dissolved" --force
```

## Library Commands

| Command                              | Description                      |
| ------------------------------------ | -------------------------------- |
| `sf library create`                  | Create a new library             |
| `sf library list`                    | List libraries                   |
| `sf library roots`                   | List root libraries              |
| `sf library docs <id>`              | List documents in a library      |
| `sf library stats <id>`             | Show library statistics          |
| `sf library add <lib> <doc>`        | Add document to library          |
| `sf library remove <lib> <doc>`     | Remove document from library     |
| `sf library nest <child> <parent>`  | Nest a library under another     |
| `sf library delete <id>`            | Delete a library                 |

#### library create

Create a new library.

| Option                | Description                       |
| --------------------- | --------------------------------- |
| `-n, --name <name>`   | Library name (required)           |
| `--tag <tag>`         | Add tag (can be repeated)         |

#### library list

List libraries.

| Option              | Description                       |
| ------------------- | --------------------------------- |
| `-l, --limit <n>`   | Maximum results                   |

#### library delete

Delete a library.

| Option          | Description                       |
| --------------- | --------------------------------- |
| `-f, --force`   | Force deletion even if library has contents |

```bash
# Create a library
sf library create --name "API Documentation"
sf library create -n "Design Docs" --tag design --tag frontend

# List all libraries
sf library list

# List root libraries (not nested)
sf library roots

# Manage documents in a library
sf library add el-lib123 el-doc456
sf library remove el-lib123 el-doc456
sf library docs el-lib123

# Create hierarchy
sf library nest el-sub123 el-parent456

# Delete
sf library delete el-lib123
sf library delete el-lib123 --force
```

## Docs Commands

Convenience shortcuts for documentation infrastructure.

| Command                           | Description                                           |
| --------------------------------- | ----------------------------------------------------- |
| `sf docs init`                    | Bootstrap Documentation library and directory         |
| `sf docs add <doc-id> [doc-id2]`  | Add document(s) to the Documentation library          |
| `sf docs dir`                     | Show the Documentation Directory document             |

#### docs init

Idempotently finds or creates the Documentation library and a Documentation Directory document (reference category). Running multiple times produces the same result without duplicates.

```bash
sf docs init
sf docs init --json
sf docs init --quiet
```

#### docs add

Add one or more documents to the Documentation library. The library must exist (run `sf docs init` first).

| Argument | Description |
|----------|-------------|
| `<doc-id>` | One or more document identifiers to add |

```bash
sf docs add el-doc123
sf docs add el-doc123 el-doc456 el-doc789
sf docs add el-doc123 --json
```

#### docs dir

Find and display the Documentation Directory document. Shows the ID and title of the directory. Use `--content` to also display the full markdown content. The Documentation Directory must exist (run `sf docs init` first).

| Option | Description |
|--------|-------------|
| `--content` | Include the full document content in output |

```bash
sf docs dir
sf docs dir --content
sf docs dir --json
sf docs dir --quiet
```

---

## Playbook Commands

| Command                             | Description                                    |
| ----------------------------------- | ---------------------------------------------- |
| `sf playbook list`                  | List playbooks                                 |
| `sf playbook show <name\|id>`       | Show playbook details                          |
| `sf playbook validate <name\|id>`   | Validate playbook structure and variables      |
| `sf playbook create`                | Create a new playbook                          |

```bash
# List all playbooks
sf playbook list
sf playbook list --limit 10

# Show playbook details
sf playbook show deploy
sf playbook show el-abc123 --steps --variables

# Validate playbook structure
sf playbook validate deploy
sf playbook validate deploy --create
sf playbook validate deploy --var env=production --var debug=true

# Create a new playbook
sf playbook create --name deploy --title "Deployment Process"
sf playbook create -n deploy -t "Deploy" -s "build:Build app" -s "test:Run tests:build"
sf playbook create -n deploy -t "Deploy" -v "env:string" -v "debug:boolean:false:false"
```

#### playbook show

| Option               | Description              |
| -------------------- | ------------------------ |
| `-s, --steps`        | Include step definitions |
| `-v, --variables`    | Include variable definitions |

#### playbook validate

| Option                   | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `--var <name=value>`     | Set variable for create-time validation (can be repeated) |
| `-c, --create`           | Perform create-time validation                           |

#### playbook create

| Option                    | Description                                                |
| ------------------------- | ---------------------------------------------------------- |
| `-n, --name <name>`       | Playbook name (unique identifier, required)               |
| `-t, --title <title>`     | Playbook title (display name, required)                   |
| `-s, --step <spec>`       | Add step (format: `id:title[:dependsOn,...]`, repeatable) |
| `-v, --variable <spec>`   | Add variable (format: `name:type[:default][:required]`, repeatable) |
| `-e, --extends <name>`    | Extend playbook (can be repeated)                         |
| `--tag <tag>`             | Add tag (can be repeated)                                 |

## Sync Commands

Sync commands manage the JSONL-based import/export workflow. These commands are also available under the `sf sync` parent command.

| Command            | Description       |
| ------------------ | ----------------- |
| `sf export`        | Export to JSONL   |
| `sf import`        | Import from JSONL |
| `sf status`        | Show sync status  |
| `sf sync export`   | Export to JSONL (alias)   |
| `sf sync import`   | Import from JSONL (alias) |
| `sf sync status`   | Show sync status (alias)  |

#### export

| Option                    | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `-o, --output <dir>`      | Output directory (default: `.stoneforge/sync`)    |
| `-f, --full`              | Full export (ignore dirty tracking)                |
| `--include-ephemeral`     | Include ephemeral elements (excluded by default)   |

#### import

| Option                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `-i, --input <dir>`     | Input directory (default: `.stoneforge/sync`)        |
| `-n, --dry-run`         | Show what would be imported without making changes   |
| `-f, --force`           | Force import (remote always wins)                    |

```bash
# Export dirty elements
sf export

# Full export
sf export --full

# Include ephemeral elements
sf export --include-ephemeral

# Import from default sync directory
sf import

# Preview import changes
sf import --dry-run

# Import from specific directory
sf import --input /path/to/sync

# Force import (remote always wins)
sf import --force
```

## External Sync Commands

Manage bidirectional synchronization between Stoneforge and external services (GitHub Issues, Linear, etc.).

**Source:** `packages/quarry/src/cli/commands/external-sync.ts`

| Command                                                        | Description                  |
| -------------------------------------------------------------- | ---------------------------- |
| `sf external-sync config`                                      | Show provider configuration  |
| `sf external-sync config set-token <provider> <token>`         | Store auth token             |
| `sf external-sync config set-project <provider> <project>`     | Set default project          |
| `sf external-sync config set-auto-link <provider>`             | Enable auto-link with a provider |
| `sf external-sync config disable-auto-link`                    | Disable auto-link            |
| `sf external-sync link <taskId> <url-or-issue-number>`         | Link task to external issue  |
| `sf external-sync unlink <taskId>`                             | Remove external link         |
| `sf external-sync push [taskId...]`                            | Push linked task(s)          |
| `sf external-sync push --all`                                  | Push all linked tasks        |
| `sf external-sync pull`                                        | Pull changes from external   |
| `sf external-sync sync [--dry-run]`                            | Bidirectional sync           |
| `sf external-sync status`                                      | Show sync state              |
| `sf external-sync resolve <taskId> --keep local\|remote`       | Resolve sync conflict        |

```bash
# Configure a provider
sf external-sync config set-token github ghp_xxxxxxxxxxxx
sf external-sync config set-project github my-org/my-repo
sf external-sync config set-auto-link github
sf external-sync config disable-auto-link

# Link a task to an external issue
sf external-sync link el-abc123 https://github.com/org/repo/issues/42
sf external-sync link el-abc123 42

# Push/pull/sync
sf external-sync push el-abc123
sf external-sync push --all
sf external-sync pull
sf external-sync sync --dry-run

# Check status and resolve conflicts
sf external-sync status
sf external-sync resolve el-abc123 --keep local
```

#### external-sync config

Show current external sync provider configuration. Displays enabled status, conflict strategy, default direction, poll interval, and configured providers. Tokens are masked in output for security.

```bash
sf external-sync config
sf external-sync config --json
```

#### external-sync config set-token

Store an authentication token for an external sync provider. The token is stored in the local SQLite database (not git-tracked).

| Argument   | Description                                |
| ---------- | ------------------------------------------ |
| `provider` | Provider name (e.g., `github`, `linear`)   |
| `token`    | Authentication token                       |

```bash
sf external-sync config set-token github ghp_xxxxxxxxxxxx
sf external-sync config set-token linear lin_api_xxxxxxxxxxxx
```

#### external-sync config set-project

Set the default project (e.g., `owner/repo`) for an external sync provider. This is used when linking tasks with bare issue numbers instead of full URLs.

| Argument   | Description                                           |
| ---------- | ----------------------------------------------------- |
| `provider` | Provider name (e.g., `github`, `linear`)              |
| `project`  | Project identifier (e.g., `owner/repo` for GitHub)    |

```bash
sf external-sync config set-project github my-org/my-repo
sf external-sync config set-project linear MY-PROJECT
```

#### external-sync config set-auto-link

Enable auto-link for new tasks with the specified provider. When auto-link is enabled, newly created Stoneforge tasks will automatically get a corresponding external issue created and linked. Use the `--no-auto-link` flag on `sf create` to skip auto-linking for individual tasks.

| Argument   | Description                              |
| ---------- | ---------------------------------------- |
| `provider` | Provider name (`github` or `linear`)     |

```bash
sf external-sync config set-auto-link github
sf external-sync config set-auto-link linear
```

#### external-sync config disable-auto-link

Disable auto-link for new tasks. Clears the auto-link provider and disables automatic external issue creation.

```bash
sf external-sync config disable-auto-link
```

#### external-sync link

Link a Stoneforge task to an external issue. Sets the task's `externalRef` and `_externalSync` metadata. If given a bare issue number, constructs the URL from the provider's default project.

| Argument          | Description                        |
| ----------------- | ---------------------------------- |
| `taskId`          | Stoneforge task ID                 |
| `url-or-number`   | Full URL or bare issue number      |

| Option                  | Description                          |
| ----------------------- | ------------------------------------ |
| `-p, --provider <name>` | Provider name (default: `github`)   |

```bash
sf external-sync link el-abc123 https://github.com/org/repo/issues/42
sf external-sync link el-abc123 42
sf external-sync link el-abc123 42 --provider github
```

#### external-sync unlink

Remove the external link from a Stoneforge task. Clears the task's `externalRef` field and `_externalSync` metadata.

| Argument | Description        |
| -------- | ------------------ |
| `taskId` | Stoneforge task ID |

```bash
sf external-sync unlink el-abc123
```

#### external-sync push

Push linked tasks to their external service. If specific task IDs are given, pushes only those tasks. With `--all`, pushes every task that has an external link.

| Argument    | Description                                      |
| ----------- | ------------------------------------------------ |
| `taskId...` | One or more task IDs to push (optional with `--all`) |

| Option        | Description            |
| ------------- | ---------------------- |
| `-a, --all`   | Push all linked tasks  |

```bash
sf external-sync push el-abc123
sf external-sync push el-abc123 el-def456
sf external-sync push --all
```

**Note:** Push requires a running sync daemon or server to execute the actual sync operations.

#### external-sync pull

Pull changes from external services for all linked tasks. Optionally discover new issues not yet linked to Stoneforge tasks.

| Option                    | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `-p, --provider <name>`   | Pull from specific provider (default: all configured) |
| `-d, --discover`          | Discover new unlinked issues                     |

```bash
sf external-sync pull
sf external-sync pull --provider github
sf external-sync pull --discover
```

**Note:** Pull requires a running sync daemon or server to execute the actual sync operations.

#### external-sync sync

Run bidirectional sync between Stoneforge and external services. Performs both push and pull operations. In dry-run mode, reports what would change without making any modifications.

| Option          | Description                                      |
| --------------- | ------------------------------------------------ |
| `-n, --dry-run` | Show what would change without making changes    |

```bash
sf external-sync sync
sf external-sync sync --dry-run
```

#### external-sync status

Show the current external sync state. Displays linked task count, configured providers, pending conflicts, last sync cursors, and poll interval.

```bash
sf external-sync status
sf external-sync status --json
```

#### external-sync resolve

Resolve a sync conflict by choosing which version to keep. Tasks with sync conflicts are tagged with `sync-conflict`. This command resolves the conflict by keeping either the local or remote version, removes the `sync-conflict` tag, and records the resolution in metadata.

| Argument | Description                     |
| -------- | ------------------------------- |
| `taskId` | Task ID with a sync conflict   |

| Option                    | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `-k, --keep <version>`    | Which version to keep: `local` or `remote` (required) |

```bash
sf external-sync resolve el-abc123 --keep local
sf external-sync resolve el-abc123 --keep remote
```

## Config Commands

| Command                        | Description    |
| ------------------------------ | -------------- |
| `sf config show [key]`         | Show config    |
| `sf config set <path> <value>` | Set value      |
| `sf config unset <path>`       | Remove key     |
| `sf config edit`               | Open in editor |

```bash
sf config show
sf config show actor
sf config set actor my-agent
sf config unset actor
```

## Identity Commands

| Command                           | Description           |
| --------------------------------- | --------------------- |
| `sf identity whoami`              | Show current identity |
| `sf identity keygen`              | Generate keypair      |
| `sf identity sign`                | Sign data             |
| `sf identity verify`              | Verify signature      |
| `sf identity hash`                | Compute hash          |
| `sf identity mode [mode]`         | Show/set mode         |

Without a subcommand, `sf identity` shows the current actor identity (same as `sf whoami`).

#### identity sign

Sign data using an Ed25519 private key. The signature is computed over: `actor|signedAt|requestHash`.

| Option                     | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `-d, --data <string>`      | Data to sign (will be hashed)                      |
| `-f, --file <path>`        | File containing data to sign                       |
| `--hash <hash>`            | Pre-computed SHA256 hash (hex)                     |

The private key is resolved from (in priority order):
1. `--sign-key <key>` global flag (direct base64 PKCS8 key)
2. `--sign-key-file <path>` global flag (path to key file)
3. `STONEFORGE_SIGN_KEY` environment variable
4. `STONEFORGE_SIGN_KEY_FILE` environment variable

```bash
sf identity sign --data "hello world" --sign-key <key> --actor alice
sf identity sign --file request.json --sign-key-file ~/.stoneforge/private.key
sf identity sign --hash abc123... --actor alice
```

#### identity verify

Verify an Ed25519 signature against data. The signature must have been computed over: `actor|signedAt|requestHash`.

| Option                     | Description                                  |
| -------------------------- | -------------------------------------------- |
| `-s, --signature <sig>`    | Signature to verify (base64, required)       |
| `-k, --public-key <key>`   | Public key to verify against (base64, required) |
| `--signed-at <time>`       | Timestamp when signed (ISO 8601, required)   |
| `-d, --data <string>`      | Original data that was signed                |
| `-f, --file <path>`        | File containing original data                |
| `--hash <hash>`            | Request hash that was signed                 |

One of `--data`, `--file`, or `--hash` is required.

```bash
sf identity verify --signature <sig> --public-key <key> --signed-at 2024-01-01T00:00:00Z --data "hello" --actor alice
sf identity verify -s <sig> -k <key> --signed-at <time> --hash abc123... --actor alice
```

#### identity hash

Compute a SHA256 hash of data for use in signing.

| Option                | Description        |
| --------------------- | ------------------ |
| `-d, --data <string>` | Data to hash       |
| `-f, --file <path>`   | File to hash       |

One of `--data` or `--file` is required.

```bash
sf identity hash --data "hello world"
sf identity hash --file request.json
```

#### identity keygen

Generate a new Ed25519 keypair for cryptographic identity.

```bash
sf identity keygen
sf identity keygen --json
sf identity keygen --quiet  # Returns just the public key
```

#### identity mode

Show or set the identity verification mode.

| Argument | Description                                      |
| -------- | ------------------------------------------------ |
| `[mode]` | Mode to set: `soft`, `cryptographic`, or `hybrid` |

Without an argument, shows the current mode. With an argument, sets the mode.

- **soft** — Name-based identity without verification (default)
- **cryptographic** — Key-based identity with signature verification
- **hybrid** — Accepts both verified and unverified actors

```bash
sf identity mode                # Show current mode
sf identity mode soft           # Set to soft mode
sf identity mode cryptographic  # Set to cryptographic mode
```

## Admin Commands

| Command      | Description                            |
| ------------ | -------------------------------------- |
| `sf doctor`  | Check system health and diagnose issues|
| `sf migrate` | Run database migrations                |

### Doctor

Check system health and diagnose issues.

```bash
sf doctor [options]
```

Performs diagnostic checks in two categories:

**Database health:**

| Check            | Description                                               |
| ---------------- | --------------------------------------------------------- |
| workspace        | Verifies `.stoneforge/` directory exists                  |
| database         | Checks that the database file exists                      |
| connection       | Verifies the database can be opened                       |
| schema_version   | Checks schema version is current                          |
| schema_tables    | Validates all expected tables are present                 |
| integrity        | Runs SQLite `PRAGMA integrity_check`                      |
| foreign_keys     | Validates foreign key constraints (`PRAGMA foreign_key_check`) |
| blocked_cache    | Checks blocked cache consistency (orphaned entries, missing cache entries) |
| storage          | Reports database file size                                |

**Runtime health** (via smithy-server, skipped if unavailable):

| Check            | Description                                               |
| ---------------- | --------------------------------------------------------- |
| rate_limits      | Which executables are rate-limited, when they reset       |
| stuck_tasks      | Tasks with high resumeCount and no active session         |
| merge_queue      | Tasks stuck in testing/merging                            |
| error_rate       | Recent errors from operation log                          |
| agent_pool       | Pool utilization and active sessions                      |

Each check reports a status: `[OK]`, `[WARN]`, or `[ERROR]`. The command exits with a non-zero exit code if any errors are found.

| Option    | Description                                                     |
| --------- | --------------------------------------------------------------- |
| `--fix`   | Automatically repair detected issues (FK violations, blocked cache) |

Use `--verbose` to see detailed diagnostic information for each check.
Use `--fix` to automatically repair detected issues: deletes orphaned rows that violate foreign key constraints and rebuilds the blocked cache from the dependency graph.

```bash
# Run all diagnostics
sf doctor

# Show detailed information
sf doctor --verbose

# Diagnose and fix issues
sf doctor --fix

# Output as JSON
sf doctor --json
```

### Migrate

Run database migrations to update the schema.

```bash
sf migrate [options]
```

| Option      | Description                                              |
| ----------- | -------------------------------------------------------- |
| `--dry-run` | Show what migrations would be applied without running them |

Migrations are run automatically when needed, but this command can be used to manually trigger migration, check what migrations are pending, or verify migration status.

```bash
# Run pending migrations
sf migrate

# Preview migrations without applying
sf migrate --dry-run
```

## GC Commands

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `sf gc workflows`   | Garbage collect ephemeral workflows|
| `sf gc tasks`       | _(deprecated, no-op)_              |

#### gc workflows

Garbage collect old ephemeral workflows. Only workflows in a terminal state (completed, failed, cancelled) are eligible. Deleting a workflow also deletes all tasks that belong to it.

| Option              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `-a, --age <days>`  | Maximum age in days (default: **1**)             |
| `-l, --limit <n>`   | Maximum number of workflows to delete            |
| `--dry-run`         | Show what would be deleted without deleting      |

```bash
# Garbage collect old workflows (default: 1 day old)
sf gc workflows

# Custom age threshold
sf gc workflows --age 7

# Preview what would be deleted
sf gc workflows --dry-run

# Limit number of deletions
sf gc workflows --limit 10
```

#### `sf gc workflows` vs `sf workflow gc`

Both commands garbage collect ephemeral workflows, but differ in defaults and available options:

| Feature         | `sf gc workflows`         | `sf workflow gc`          |
| --------------- | ------------------------- | ------------------------- |
| Default age     | **1 day**                 | **7 days**                |
| `--limit` flag  | Yes                       | No                        |
| `--dry-run`     | Yes                       | Yes                       |
| `--age`         | Yes                       | Yes                       |

**When to use each:**
- Use `sf gc workflows` for aggressive, frequent cleanup (e.g., cron jobs) — its 1-day default and `--limit` flag make it suitable for automated maintenance.
- Use `sf workflow gc` for manual or less frequent cleanup — its 7-day default is more conservative.

## Reset Command

| Command    | Description                 |
| ---------- | --------------------------- |
| `sf reset` | Reset a Stoneforge workspace |

| Option              | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `-f, --force`       | Skip confirmation prompt                             |
| `--full`            | Delete everything and reinitialize                   |
| `-s, --server <url>`| Server URL for remote reset (default: http://localhost:3456) |

```bash
# Reset workspace (preserves config)
sf reset

# Skip confirmation
sf reset --force

# Full reset (deletes .stoneforge and reinitializes)
sf reset --full --force

# Reset with server URL
sf reset --server http://localhost:8080
```

**Default reset** removes the database, sync files, uploads, and worktrees but preserves `.stoneforge/config.yaml`. **Full reset** deletes the entire `.stoneforge/` folder and reinitializes.

## History Command

```bash
sf history <id> [options]

Options:
  -t, --type <type>      Filter by event type
  -a, --actor <name>     Filter by actor
  --after <date>         Events after date
  --before <date>        Events before date
  -f, --format <fmt>     Output format (timeline/table)
  -l, --limit <n>        Maximum number of events to return (default: 50)
```

## CLI Plugins

The CLI supports plugins to extend functionality. Plugins can register new commands and aliases.

### Plugin Discovery

Plugins are discovered from two sources:

1. **Known packages** - First-party packages like `@stoneforge/smithy` are auto-discovered if installed
2. **Config-based** - User-specified packages in `.stoneforge/config.yaml`

```yaml
# .stoneforge/config.yaml
plugins:
  packages:
    - my-custom-plugin
    - @company/internal-tools
```

### Creating a Plugin

A plugin must export a `cliPlugin` object:

```typescript
// my-plugin/src/index.ts
import type { CLIPlugin } from "@stoneforge/quarry/cli";

export const cliPlugin: CLIPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  commands: [myCommand],
  aliases: {
    shortcut: "my-command subcommand",
  },
};
```

### Plugin Precedence

- Built-in commands always take priority over plugin commands
- If multiple plugins define the same command, the first loaded wins
- **Subcommand merging**: When a plugin provides a command with the same name as an existing command, and both have subcommands, the subcommands are merged instead of skipping the entire plugin command. This allows plugins to extend built-in commands with additional subcommands.
- Subcommand conflicts (same subcommand name in both) are skipped with a warning
- Top-level command conflicts (no subcommands to merge) are logged as warnings

## Orchestrator Commands (Plugin)

These commands are provided by `@stoneforge/smithy`:

### Agent Commands

| Command                    | Description                              |
| -------------------------- | ---------------------------------------- |
| `sf agent list`            | List registered agents                   |
| `sf agent show <id>`       | Show agent details                       |
| `sf agent register <name>` | Register a new agent                     |
| `sf agent start <id>`      | Start a Claude Code process for an agent |
| `sf agent stop <id>`       | Stop an agent session                    |
| `sf agent stream <id>`     | Get agent channel for streaming          |

#### agent list

List registered agents with optional filters.

| Option                    | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `-r, --role <role>`       | Filter by role: director, worker, steward                      |
| `-s, --status <status>`   | Filter by session status: idle, running, suspended, terminated |
| `-m, --workerMode <mode>` | Filter by worker mode: ephemeral, persistent                   |
| `-f, --focus <focus>`     | Filter by steward focus: merge, docs, recovery, custom         |
| `--reportsTo <id>`        | Filter by manager entity ID                                    |
| `--hasSession`            | Filter to agents with active sessions                          |

```bash
sf agent list
sf agent list --role worker
sf agent list --role worker --workerMode ephemeral
sf agent list --status running
sf agent list --role steward --focus merge
sf agent list --hasSession
```

#### agent register

Register a new orchestrator agent.

| Option                | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `-r, --role <role>`   | Agent role: director, worker, steward (required)        |
| `-m, --mode <mode>`   | Worker mode: ephemeral, persistent (default: ephemeral) |
| `-f, --focus <focus>` | Steward focus: merge, docs, recovery, custom            |
| `-t, --maxTasks <n>`  | Maximum concurrent tasks (default: 1)                   |
| `--tags <tags>`       | Comma-separated tags                                    |
| `--reportsTo <id>`    | Manager entity ID (for workers/stewards)                |
| `--roleDef <id>`      | Role definition document ID                             |
| `--trigger <cron>`    | Steward cron trigger (e.g., "0 2 \* \* \*")             |
| `--provider <name>`   | Agent provider (e.g., claude-code, opencode)            |
| `--model <model>`     | LLM model to use (e.g., claude-sonnet-4-5-20250929)     |

```bash
sf agent register MyWorker --role worker --mode ephemeral
sf agent register MainDirector --role director
sf agent register MergeSteward --role steward --focus merge
sf agent register MyWorker --role worker --tags "frontend,urgent"
sf agent register TeamWorker --role worker --reportsTo el-director123
sf agent register DocsSteward --role steward --focus docs --trigger "0 9 * * *"
sf agent register OcWorker --role worker --provider opencode
sf agent register MyWorker --role worker --model claude-sonnet-4-5-20250929
```

#### agent start

Start a Claude Code process for an agent.

| Option                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `-p, --prompt <text>`   | Initial prompt to send to the agent                  |
| `-m, --mode <mode>`     | Start mode: headless, interactive                    |
| `-r, --resume <id>`     | Provider session ID to resume                        |
| `-w, --workdir <path>`  | Working directory for the agent                      |
| `--cols <n>`            | Terminal columns for interactive mode (default: 120) |
| `--rows <n>`            | Terminal rows for interactive mode (default: 30)     |
| `--timeout <ms>`        | Timeout in milliseconds (default: 120000)            |
| `-e, --env <KEY=VALUE>` | Environment variable to set                          |
| `-t, --taskId <id>`     | Task ID to assign to this agent                      |
| `--stream`              | Stream agent output after starting                   |
| `--provider <name>`     | Override agent provider for this session              |
| `--model <model>`       | Override model for this session                       |

```bash
sf agent start el-abc123
sf agent start el-abc123 --mode interactive
sf agent start el-abc123 --mode interactive --cols 160 --rows 40
sf agent start el-abc123 --prompt "Start working on your assigned tasks"
sf agent start el-abc123 --resume previous-session-id
sf agent start el-abc123 --workdir /path/to/project
sf agent start el-abc123 --env MY_VAR=value
sf agent start el-abc123 --taskId el-task456
sf agent start el-abc123 --stream
sf agent start el-abc123 --provider opencode
sf agent start el-abc123 --model claude-opus-4-6
```

#### agent stop

Stop an agent session.

| Option                | Description                       |
| --------------------- | --------------------------------- |
| `-g, --graceful`      | Graceful shutdown (default: true) |
| `--no-graceful`       | Force immediate shutdown          |
| `-r, --reason <text>` | Reason for stopping the agent     |

```bash
sf agent stop el-abc123
sf agent stop el-abc123 --reason "Task completed"
sf agent stop el-abc123 --no-graceful
```

#### agent stream

Get the channel ID for an agent to stream messages.

```bash
sf agent stream el-abc123
```

### Dispatch Commands

| Command                      | Description                            |
| ---------------------------- | -------------------------------------- |
| `sf dispatch <task> <agent>` | Dispatch task to specific agent        |

| Option                  | Description                             |
| ----------------------- | --------------------------------------- |
| `-b, --branch <name>`   | Git branch to assign                    |
| `-w, --worktree <path>` | Git worktree path                       |
| `-s, --session <id>`    | Session ID (for dispatch)               |
| `-m, --markAsStarted`   | Mark the task as started after dispatch |

```bash
# Dispatch task to specific agent
sf dispatch el-task123 el-agent1

# Dispatch with branch assignment
sf dispatch el-task123 el-agent1 --branch feature/my-task

# Dispatch and mark as started
sf dispatch el-task123 el-agent1 --markAsStarted
```

### Pool Commands

| Command                   | Description                          |
| ------------------------- | ------------------------------------ |
| `sf pool list`            | List agent pools                     |
| `sf pool show <id\|name>` | Show pool details                    |
| `sf pool create <name>`   | Create a new agent pool              |
| `sf pool update <id\|name>` | Update pool configuration          |
| `sf pool delete <id\|name>` | Delete an agent pool               |
| `sf pool status <id\|name>` | Show pool status with active agents|
| `sf pool refresh`         | Refresh pool status from sessions    |

Agent pools limit the maximum number of agents running concurrently. The dispatch daemon respects pool limits when spawning agents.

#### pool list

List all agent pools.

| Option                  | Description                        |
| ----------------------- | ---------------------------------- |
| `-e, --enabled`         | Only show enabled pools            |
| `-a, --available`       | Only show pools with available slots |
| `-t, --tag <tag>`       | Filter by tag                      |

```bash
sf pool list
sf pool list --enabled
sf pool list --available
sf pool list --tag production
```

#### pool show

Show detailed information about an agent pool.

```bash
sf pool show default
sf pool show el-abc123
```

#### pool create

Create a new agent pool.

| Option                       | Description                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `-s, --size <n>`             | Maximum pool size (default: 5)                                |
| `-d, --description <text>`   | Pool description                                              |
| `-t, --agentType <config>`   | Agent type config (can repeat). Format: `role[:mode\|focus][:priority][:maxSlots][:provider][:model]` |
| `--tags <tags>`              | Comma-separated tags                                          |
| `--disabled`                 | Create pool in disabled state                                 |

**Agent Type Format:**
- `worker` — All workers with default settings
- `worker:ephemeral` — Ephemeral workers only
- `worker:ephemeral:100` — Ephemeral workers with priority 100
- `worker:persistent:50:3` — Persistent workers, priority 50, max 3 slots
- `worker:ephemeral:100:5:claude-code:claude-sonnet-4-20250514` — With provider and model
- `steward:merge` — Merge stewards
- `steward:docs:80` — Docs stewards with priority 80
- `steward:merge:100:2:opencode` — Merge stewards with provider only

The optional `provider` and `model` fields allow specifying which AI provider and model each agent type should use. If omitted, the system default is used. Note: the `--help` text shows a shorter format (`role[:mode|focus][:priority][:maxSlots]`), but the `[:provider][:model]` fields are fully supported in the implementation.

```bash
sf pool create default --size 5
sf pool create workers --size 10 -t worker:ephemeral -t worker:persistent
sf pool create merge-pool --size 2 -t steward:merge:100
sf pool create production --size 20 --tags "prod,critical"
sf pool create gpu-pool --size 5 -t worker:ephemeral:100:5:claude-code:claude-sonnet-4-20250514
```

#### pool update

Update an agent pool configuration.

| Option                       | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| `-s, --size <n>`             | Maximum pool size                                |
| `-d, --description <text>`   | Pool description                                 |
| `-t, --agentType <config>`   | Agent type config (replaces existing, can repeat). Format: `role[:mode\|focus][:priority][:maxSlots][:provider][:model]` |
| `--tags <tags>`              | Comma-separated tags (replaces existing)         |
| `--enable`                   | Enable the pool                                  |
| `--disable`                  | Disable the pool                                 |

```bash
sf pool update default --size 10
sf pool update workers --enable
sf pool update merge-pool --disable
sf pool update production --description "Production agent pool"
sf pool update workers -t worker:ephemeral:100:5:claude-code:claude-sonnet-4-20250514
```

#### pool delete

Delete an agent pool.

| Option          | Description                       |
| --------------- | --------------------------------- |
| `-f, --force`   | Delete even if agents are active  |

```bash
sf pool delete old-pool
sf pool delete el-abc123 --force
```

#### pool status

Show the current status of an agent pool including active agents.

```bash
sf pool status default
sf pool status el-abc123
```

#### pool refresh

Refresh the status of all agent pools based on current sessions.

```bash
sf pool refresh
```

---

### Daemon Commands

| Command            | Description                           |
| ------------------ | ------------------------------------- |
| `sf daemon start`  | Start the dispatch daemon             |
| `sf daemon stop`   | Stop the dispatch daemon              |
| `sf daemon status` | Show daemon status (incl. rate limit) |
| `sf daemon sleep`  | Pause dispatch until a specified time |
| `sf daemon wake`   | Immediately resume dispatch           |

| Option                  | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `-s, --server <url>`    | Orchestrator server URL (default: http://localhost:3457) |
| `-f, --force`           | Skip confirmation (for stop)                            |
| `-u, --until <time>`    | Sleep until a specific time (for sleep)                 |
| `-d, --duration <secs>` | Sleep for a duration in seconds (for sleep)             |

```bash
sf daemon start
sf daemon status
sf daemon stop
sf daemon stop --force

# Pause dispatch until a specific time
sf daemon sleep --until "3am"
sf daemon sleep --until "Feb 22 at 9:30am"
sf daemon sleep --until "tomorrow at 3pm"

# Pause dispatch for a duration (seconds)
sf daemon sleep --duration 3600

# Immediately resume dispatch (clear rate limits)
sf daemon wake
```

---

### Merge Command

| Command    | Description                                      |
| ---------- | ------------------------------------------------ |
| `sf merge` | Squash-merge a branch into the default branch    |

Squash-merge a source branch into the default branch (master/main). Used by persistent workers and docs stewards to merge their work.

| Option                    | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `-b, --branch <name>`     | Source branch to merge (default: current branch)   |
| `-i, --into <name>`       | Target branch (default: master/main auto-detected) |
| `-m, --message <text>`    | Commit message (default: "Merge \<branch\>")       |
| `--cleanup`               | Delete source branch and worktree after merge      |

```bash
# Squash-merge current branch into master
sf merge

# With a descriptive commit message
sf merge --message "feat: implement user authentication"

# Merge a specific branch
sf merge --branch feature/xyz --into main

# Merge and clean up (used by docs steward)
sf merge --cleanup --message "docs: automated documentation fixes"
```

### Orchestrator Task Commands

| Command                                    | Description                            |
| ------------------------------------------ | -------------------------------------- |
| `sf task handoff <id>`                     | Hand off task to another agent         |
| `sf task complete <id>`                    | Complete task and create merge request (task must not be CLOSED/REVIEW) |
| `sf task sync <id>`                        | Sync task branch with main             |
| `sf task merge <id>`                       | Squash-merge task branch and close it  |
| `sf task reject <id>`                      | Mark merge as failed and reopen task   |
| `sf task merge-status <id> <status>`       | Update the merge status of a task      |

#### task complete

Complete a task and create a merge request. The task must not be in CLOSED or REVIEW status.

| Option                    | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `-s, --summary <text>`    | Summary of the completed work                        |
| `-c, --commitHash <hash>` | Commit hash for the completed work                   |
| `--no-mr`                 | Skip merge request creation                          |
| `--mr-title <text>`       | Custom merge request title                           |
| `--mr-body <text>`        | Custom merge request body                            |
| `-b, --baseBranch <name>` | Base branch for the merge request (default: main)    |

```bash
sf task complete el-abc123
sf task complete el-abc123 --summary "Implemented OAuth login"
sf task complete el-abc123 --no-mr
sf task complete el-abc123 --mr-title "feat: OAuth login" --baseBranch main
```

#### task handoff

Hand off a task to another agent.

| Option                    | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `-m, --message <text>`    | Handoff message for the next agent                   |
| `-b, --branch <name>`     | Branch associated with the task                      |
| `-w, --worktree <path>`   | Worktree path for the task                           |
| `-s, --sessionId <id>`    | Session ID of the agent handing off (defaults to `STONEFORGE_SESSION_ID` env var or auto-generated) |

```bash
sf task handoff el-abc123
sf task handoff el-abc123 --message "Auth module done, needs tests"
sf task handoff el-abc123 --branch feature/auth --worktree /path/to/worktree
```

#### task merge

Squash-merge a task's branch into the target branch and close it. The task must be in REVIEW status with an associated branch.

This command:
1. Validates the task is in REVIEW status with a branch
2. Squash-merges the branch into the target branch (auto-detected)
3. Pushes to remote
4. Atomically sets merge status to `merged` and closes the task
5. Cleans up the source branch (local + remote) and worktree

| Option                 | Description          |
| ---------------------- | -------------------- |
| `-s, --summary <text>` | Summary of the merge |

```bash
sf task merge el-abc123
sf task merge el-abc123 --summary "All tests passing"
```

#### task reject

Mark a task merge as failed and reopen it.

| Option                 | Description                     |
| ---------------------- | ------------------------------- |
| `-r, --reason <text>`  | Reason for rejection (required) |
| `-m, --message <text>` | Handoff message for next worker |

```bash
sf task reject el-abc123 --reason "Tests failed"
sf task reject el-abc123 --reason "Tests failed" --message "Fix flaky test in auth.test.ts"
```

#### task merge-status

Update the merge status of a task. Useful when the merge steward gets stuck or when a branch is manually merged outside the normal workflow.

| Argument   | Description                     |
| ---------- | ------------------------------- |
| `<id>`     | Task identifier                 |
| `<status>` | New merge status                |

Valid status values:
- `pending` - Task completed, awaiting merge
- `testing` - Steward is running tests on the branch
- `merging` - Tests passed, merge in progress
- `merged` - Successfully merged (**terminal** — also closes the task)
- `conflict` - Merge conflict detected
- `test_failed` - Tests failed, needs attention
- `failed` - Merge failed for other reason
- `not_applicable` - No merge needed, e.g. fix already on master (**terminal** — also closes the task)

Terminal statuses (`merged`, `not_applicable`) atomically set the task to CLOSED in a single API call.

```bash
sf task merge-status el-abc123 merged
sf task merge-status el-abc123 pending
sf task merge-status el-abc123 not_applicable
```

#### task sync

Sync a task's branch with the main branch (master/main).

This command:
1. Looks up the task's worktree path and branch from metadata
2. Runs `git fetch origin` in the worktree
3. Attempts `git merge origin/main` (or `origin/master`)
4. Reports success, conflicts, or errors

Typically run by the dispatch daemon before spawning a merge steward, or by the steward during review if master advances.

| Argument    | Description             |
| ----------- | ----------------------- |
| `<task-id>` | Task identifier to sync |

```bash
# Sync a task branch with main
sf task sync el-abc123

# Sync with JSON output (useful for automation)
sf task sync el-abc123 --json
```

**JSON output format:**

```json
{
  "success": true,
  "conflicts": [],
  "message": "human-readable status",
  "worktreePath": "/path/to/worktree",
  "branch": "agent/bob/el-123-feature"
}
```

When conflicts are detected, the `conflicts` array lists the affected files and `success` is `false`.

### Log Command

Show persistent operation log entries for system observability.

```bash
sf log [options]
```

The operation log captures key events from the orchestration system including dispatch, session, merge, rate-limit, steward, and recovery events.

| Option                   | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `--level <level>`        | Filter by level: `info`, `warn`, `error`                                 |
| `-c, --category <cat>`   | Filter by category: `dispatch`, `merge`, `session`, `rate-limit`, `steward`, `recovery` |
| `-s, --since <time>`     | Show entries since time — relative (e.g., `2h`, `30m`, `1d`, `1w`) or ISO 8601 timestamp |
| `-t, --task <id>`        | Filter by task ID                                                        |
| `-a, --agent <id>`       | Filter by agent ID                                                       |
| `-l, --limit <n>`        | Maximum entries to show (default: 20)                                    |

```bash
# Show last 20 entries
sf log

# Show only errors
sf log --level error

# Show session events
sf log --category session

# Show entries from last 2 hours
sf log --since 2h

# Filter by task
sf log --task el-xxxx

# Combine filters
sf log --level error --since 1d

# Output as JSON
sf log --json
```

### Metrics Command

Show LLM provider usage metrics including token counts, estimated costs, session counts, average duration, and error rates.

```bash
sf metrics [options]
```

| Option                    | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `-r, --range <range>`     | Time range (e.g., `7d`, `14d`, `30d`). Default: `7d` |
| `-p, --provider <name>`   | Filter by provider name (e.g., `claude-code`)  |
| `-g, --group-by <group>`  | Group by: `provider` (default) or `model`      |

```bash
# Show metrics for last 7 days
sf metrics

# Show metrics for last 30 days
sf metrics --range 30d

# Filter by provider
sf metrics --provider claude-code

# Group by model
sf metrics --group-by model

# Output as JSON
sf metrics --json
```

## Short IDs

The CLI supports short IDs (minimum unique prefix):

```bash
# Full ID
sf show el-a1b2c3d4e5f6

# Short ID (if unique)
sf show a1b2
```

## Task Status Values

| Status        | Description                                  |
| ------------- | -------------------------------------------- |
| `open`        | Available for work                           |
| `in_progress` | Currently being worked on                    |
| `blocked`     | Waiting on a dependency                      |
| `deferred`    | Deliberately postponed                       |
| `backlog`     | Not ready for work, needs triage             |
| `review`      | Work complete, awaiting merge/review         |
| `closed`      | Completed and merged                         |
| `tombstone`   | Soft-deleted                                 |

## Priority Values

| Value | Level    |
| ----- | -------- |
| 1     | Critical |
| 2     | High     |
| 3     | Medium   |
| 4     | Low      |
| 5     | Minimal  |

## JSON Output

Use `--json` for machine-readable output:

```bash
sf task list --status open --json | jq '.[] | .title'
```

## Examples

```bash
# Create and assign a task
sf task create --title "Implement auth" --priority 2 --type feature
sf task create --title "Fix bug" -d "Steps to reproduce: 1. Login 2. Click settings"
sf task assign abc123 worker-1

# Add blocking dependency
sf dependency add --type=blocks task1 task2

# Check ready tasks
sf task ready

# Close with reason
sf task close abc123 --reason "Completed"

# Export changes
sf export

# Show sync status
sf status
```
