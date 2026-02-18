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
| `sf task create`   | Create task          |
| `sf task list`     | List tasks           |
| `sf show <id>`     | Show element details |
| `sf update <id>`   | Update element       |
| `sf delete <id>`   | Delete element       |

```bash
# Create task
sf task create --title "Fix bug" --priority 2 --type bug

# Create task with description (creates a linked document)
sf task create --title "Add login" -d "Implement OAuth login with Google and GitHub providers"

# List tasks
sf task list --status open

# Show element
sf show abc123

# Update element
sf update abc123 --status closed

# Delete element
sf delete abc123
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

| Alias              | Maps to   |
| ------------------ | --------- |
| `add`, `new`       | `create`  |
| `rm`, `remove`     | `delete`  |
| `ls`               | `list`    |
| `s`, `get`         | `show`    |
| `todo`, `tasks`    | `ready`   |
| `done`, `complete` | `close`   |
| `st`               | `status`  |

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
| `sf task assign <task> <entity>` | Assign task                        |
| `sf task defer <id>`             | Defer task                         |
| `sf task undefer <id>`           | Remove deferral                    |
| `sf task describe <id>`          | Set or show task description       |

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
| `-t, --type <type>`     | Filter by element type                                                                                                       |
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

**Semantics:** `sf dependency add --type=blocks A B` means A (blocked) is blocked BY B (blocker).

## Entity Commands

| Command                                    | Description          |
| ------------------------------------------ | -------------------- |
| `sf entity register <name>`                | Register new entity  |
| `sf entity list`                           | List entities        |
| `sf entity set-manager <entity> <manager>` | Set manager          |
| `sf entity clear-manager <entity>`         | Clear manager        |
| `sf entity reports <manager>`              | Get direct reports   |
| `sf entity chain <entity>`                 | Get management chain |

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
| `sf document reindex`                 | Reindex documents for FTS5 search             |

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
| `-r, --replyTo <msg>`   | Message ID to reply to (auto-sets channel, thread, swaps sender/recipient in DM) |
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

## Team Commands

| Command                          | Description   |
| -------------------------------- | ------------- |
| `sf team create`                 | Create team   |
| `sf team list`                   | List teams    |
| `sf team add <team> <entity>`    | Add member    |
| `sf team remove <team> <entity>` | Remove member |
| `sf team members <id>`           | List members  |

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

| Command            | Description       |
| ------------------ | ----------------- |
| `sf export`        | Export to JSONL   |
| `sf import`        | Import from JSONL |
| `sf status`        | Show sync status  |

```bash
# Export dirty elements
sf export

# Full export
sf export --full

# Import from default sync directory
sf import

# Import from specific directory
sf import --input /path/to/sync

# Force import (remote always wins)
sf import --force
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

## Admin Commands

| Command      | Description           |
| ------------ | --------------------- |
| `sf doctor`  | Database health check |
| `sf migrate` | Run migrations        |

```bash
# Health check
sf doctor -v

# Dry run migrations
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

| Option       | Description                                |
| ------------ | ------------------------------------------ |
| `-f, --force` | Skip confirmation prompt                   |
| `--full`      | Delete everything and reinitialize         |

```bash
# Reset workspace (preserves config)
sf reset

# Skip confirmation
sf reset --force

# Full reset (deletes .stoneforge and reinitializes)
sf reset --full --force
```

**Default reset** removes the database, sync files, uploads, and worktrees but preserves `.stoneforge/config.yaml`. **Full reset** deletes the entire `.stoneforge/` folder and reinitializes.

## History Command

```bash
sf history <id> [options]

Options:
  --type <type>      Filter by event type
  --actor <name>     Filter by actor
  --after <date>     Events after date
  --before <date>    Events before date
  --format <fmt>     Output format (timeline/table)
  -l, --limit <n>    Maximum number of events to return
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
| `-f, --focus <focus>`     | Filter by steward focus: merge, health, reminder, ops, docs    |
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
| `-f, --focus <focus>` | Steward focus: merge, health, reminder, ops, docs       |
| `-t, --maxTasks <n>`  | Maximum concurrent tasks (default: 1)                   |
| `--tags <tags>`       | Comma-separated tags                                    |
| `--reportsTo <id>`    | Manager entity ID (for workers/stewards)                |
| `--roleDef <id>`      | Role definition document ID                             |
| `--trigger <cron>`    | Steward cron trigger (e.g., "0 2 \* \* \*")             |
| `--provider <name>`   | Agent provider (e.g., claude, opencode)                 |
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
- `worker:ephemeral:100:5:claude:claude-sonnet-4-20250514` — With provider and model
- `steward:merge` — Merge stewards
- `steward:docs:80` — Docs stewards with priority 80
- `steward:merge:100:2:opencode` — Merge stewards with provider only

The optional `provider` and `model` fields allow specifying which AI provider and model each agent type should use. If omitted, the system default is used. Note: the `--help` text shows a shorter format (`role[:mode|focus][:priority][:maxSlots]`), but the `[:provider][:model]` fields are fully supported in the implementation.

```bash
sf pool create default --size 5
sf pool create workers --size 10 -t worker:ephemeral -t worker:persistent
sf pool create merge-pool --size 2 -t steward:merge:100
sf pool create production --size 20 --tags "prod,critical"
sf pool create gpu-pool --size 5 -t worker:ephemeral:100:5:claude:claude-sonnet-4-20250514
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
sf pool update workers -t worker:ephemeral:100:5:claude:claude-sonnet-4-20250514
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

| Command            | Description              |
| ------------------ | ------------------------ |
| `sf daemon start`  | Start the dispatch daemon |
| `sf daemon stop`   | Stop the dispatch daemon  |
| `sf daemon status` | Show daemon status        |

| Option                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `-s, --server <url>`   | Orchestrator server URL (default: http://localhost:3456)|
| `-f, --force`          | Skip confirmation (for stop)                           |

```bash
sf daemon start
sf daemon status
sf daemon stop
sf daemon stop --force
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
| `sf task complete <id>`                    | Complete task and create merge request (OPEN/IN_PROGRESS only) |
| `sf task sync <id>`                        | Sync task branch with main             |
| `sf task merge <id>`                       | Squash-merge task branch and close it  |
| `sf task reject <id>`                      | Mark merge as failed and reopen task   |
| `sf task merge-status <id> <status>`       | Update the merge status of a task      |

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
