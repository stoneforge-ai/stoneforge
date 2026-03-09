# Stoneforge CLI Functions Reference

Complete reference of every CLI command available in the `sf` (stoneforge) CLI, located in `packages/quarry/src/cli/commands/`.

## Global Options

All commands accept these global options:

| Option | Short | Description |
|--------|-------|-------------|
| `--db <path>` | | Database file path |
| `--actor <name>` | | Actor name for operations |
| `--from <name>` | | Alias for `--actor` |
| `--sign-key <key>` | | Private key for signing (base64 PKCS8) |
| `--sign-key-file <path>` | | Path to file containing private key |
| `--json` | | Output in JSON format |
| `--quiet` | `-q` | Minimal output (IDs only) |
| `--verbose` | `-v` | Enable debug output |
| `--help` | `-h` | Show help |
| `--version` | `-V` | Show version |

---

## Command Aliases

| Alias | Resolves To |
|-------|-------------|
| `add`, `new` | `create` |
| `rm`, `remove` | `delete` |
| `ls` | `list` |
| `s`, `get` | `show` |
| `todo`, `tasks` | `ready` |
| `done`, `complete` | `close` |
| `st` | `status` |
| `dep` | `dependency` |
| `msg` | `message` |
| `doc` | `document` |

---

## 1. Workspace & System Commands

### `sf init`
**File:** `init.ts`
**Description:** Initialize a new Stoneforge workspace in the current directory.

Creates `.stoneforge/` directory containing config.yaml, SQLite database, .gitignore, and playbooks directory. Creates a default operator entity (`el-0000`) and default agents (director, 2 ephemeral workers, 1 merge steward). If existing JSONL sync files are present (e.g., after cloning), imports them automatically. Installs Claude skills to `.claude/skills/`. Creates `AGENTS.md` at workspace root if not present.

| Option | Description |
|--------|-------------|
| `--name <name>` | Workspace name (optional) |
| `--actor <actor>` | Default actor for operations |
| `--demo` | Enable demo mode with free opencode/minimax-m2.5-free provider (no API keys required) |

### `sf reset`
**File:** `reset.ts`
**Description:** Reset a Stoneforge workspace.

Drops and reinitializes the database. With `--full`, deletes everything and reinitializes from scratch. With `--server`, sends a stop request to the smithy server.

| Option | Short | Description |
|--------|-------|-------------|
| `--force` | `-f` | Skip confirmation prompt |
| `--full` | | Delete everything and reinitialize |
| `--server <url>` | `-s` | Orchestrator server URL (default: http://localhost:3456) |

### `sf help`
**File:** `help.ts`
**Description:** Show help information. Dynamically generates categorized help text from all registered commands including plugin commands.

### `sf version`
**File:** `help.ts`
**Description:** Show the current stoneforge version.

---

## 2. CRUD Commands (Elements)

### `sf create <type> [options]`
**File:** `crud.ts`
**Description:** Create a new element. Currently supports `task` type.

| Option | Short | Description |
|--------|-------|-------------|
| `--title <text>` | `-t` | Task title (required) |
| `--name <text>` | `-n` | Alias for --title |
| `--priority <1-5>` | `-p` | Priority (1=critical, 5=minimal) |
| `--complexity <1-5>` | `-c` | Complexity (1=trivial, 5=very complex) |
| `--type <type>` | | Task type: bug, feature, task, chore |
| `--assignee <id>` | `-a` | Assignee entity ID |
| `--tag <tag>` | | Add a tag (repeatable) |
| `--plan <id\|name>` | | Plan ID or name to attach task to |
| `--description <text>` | `-d` | Task description (creates linked document) |
| `--no-auto-link` | | Skip auto-linking to external provider |

### `sf list [type] [options]`
**File:** `crud.ts`
**Description:** List elements with optional filtering. Sorts tasks by priority (P1 first). Computes effective "blocked" display status from the blocked_cache.

| Option | Short | Description |
|--------|-------|-------------|
| `--type <type>` | `-t` | Filter by element type |
| `--status <status>` | `-s` | Filter by status (including computed `blocked`) |
| `--priority <1-5>` | `-p` | Filter by priority |
| `--assignee <id>` | `-a` | Filter by assignee |
| `--tag <tag>` | | Filter by tag (repeatable, AND logic) |
| `--limit <n>` | `-l` | Maximum results |
| `--offset <n>` | `-o` | Skip first n results |

### `sf show <id> [options]`
**File:** `crud.ts`
**Description:** Show detailed element information. Supports element IDs (`el-*`) and inbox item IDs (`inbox-*`). For plans, includes task progress. Computes effective blocked status.

| Option | Short | Description |
|--------|-------|-------------|
| `--events` | `-e` | Include recent events/history |
| `--events-limit <n>` | | Max events to show (default: 10) |

### `sf update <id> [options]`
**File:** `crud.ts`
**Description:** Update fields on an existing element. Uses optimistic concurrency control.

| Option | Short | Description |
|--------|-------|-------------|
| `--title <text>` | `-t` | New title |
| `--priority <1-5>` | `-p` | New priority (tasks only) |
| `--complexity <1-5>` | `-c` | New complexity (tasks only) |
| `--status <status>` | `-s` | New status (tasks: open, in_progress, blocked, deferred, backlog, review, closed, tombstone) |
| `--assignee <id>` | `-a` | New assignee (empty string to unassign) |
| `--description <text>` | `-d` | Update description |
| `--metadata <json>` | | JSON metadata to merge (null values remove keys) |
| `--tag <tag>` | | Replace all tags (repeatable) |
| `--add-tag <tag>` | | Add a tag (repeatable) |
| `--remove-tag <tag>` | | Remove a tag (repeatable) |

### `sf delete <id> [options]`
**File:** `crud.ts`
**Description:** Soft-delete an element (tombstone). Messages cannot be deleted (immutable).

| Option | Short | Description |
|--------|-------|-------------|
| `--reason <text>` | `-r` | Deletion reason (audit trail) |
| `--force` | `-f` | Skip confirmation |

---

## 3. Task Commands

### `sf task` (parent command)
**File:** `task.ts`
**Description:** Task management parent. Contains subcommands: create, list, show, update, delete, ready, blocked, backlog, close, reopen, assign, defer, undefer, describe, activate.

### `sf ready` / `sf task ready`
**Description:** List tasks ready for work (open, not blocked, not deferred, not scheduled for future).

| Option | Short | Description |
|--------|-------|-------------|
| `--assignee <id>` | `-a` | Filter by assignee |
| `--priority <1-5>` | `-p` | Filter by priority |
| `--type <type>` | `-t` | Filter by task type |
| `--limit <n>` | `-l` | Maximum results |

### `sf backlog` / `sf task backlog`
**Description:** List tasks in backlog (open tasks in the backlog, sorted by priority).

| Option | Short | Description |
|--------|-------|-------------|
| `--priority <1-5>` | `-p` | Filter by priority |
| `--limit <n>` | `-l` | Maximum results |

### `sf blocked` / `sf task blocked`
**Description:** List blocked tasks with blocking reasons. Shows which dependencies are unresolved.

| Option | Short | Description |
|--------|-------|-------------|
| `--assignee <id>` | `-a` | Filter by assignee |
| `--priority <1-5>` | `-p` | Filter by priority |
| `--limit <n>` | `-l` | Maximum results |

### `sf close <id>` / `sf task close <id>`
**Description:** Close a task. Validates the status transition is valid.

| Option | Short | Description |
|--------|-------|-------------|
| `--reason <text>` | `-r` | Close reason |

### `sf reopen <id>` / `sf task reopen <id>`
**Description:** Reopen a closed task. Sets status back to open.

| Option | Short | Description |
|--------|-------|-------------|
| `--message <text>` | `-m` | Message to append to the task description explaining why it was reopened |

### `sf assign <id> <assignee>` / `sf task assign`
**Description:** Assign a task to an entity.

| Option | Description |
|--------|-------------|
| `--unassign` | Remove assignment |

### `sf defer <id>` / `sf task defer <id>`
**Description:** Defer a task (sets status to deferred).

| Option | Description |
|--------|-------------|
| `--until <date>` | Schedule for date (ISO format) |

### `sf undefer <id>` / `sf task undefer <id>`
**Description:** Remove deferral from a task (sets status back to open).

### `sf task describe <id>`
**Description:** Set or show task description. Creates or updates a linked description document.

| Option | Short | Description |
|--------|-------|-------------|
| `--content <text>` | `-c` | Description content |
| `--file <path>` | `-f` | Read description from file |
| `--show` | `-s` | Show current description |
| `--append` | | Append to existing description |

### `sf task activate <id>`
**Description:** Move a task from backlog to open status.

### `sf task list`
**Description:** List tasks with filtering. Supports `--ready` flag for dispatch-ready tasks.

| Option | Description |
|--------|-------------|
| `--ready` | Show only dispatch-ready tasks |
| `--status <status>` | Filter by status |
| (inherits list options) | |

---

## 4. Dependency Commands

### `sf dependency` / `sf dep` (parent)
**File:** `dep.ts`
**Description:** Manage dependencies between elements.

### `sf dependency add <blocked> <blocker> --type <type>`
**Description:** Add a dependency. `blocked` is the waiting element, `blocker` must complete first.

| Option | Short | Description |
|--------|-------|-------------|
| `--type <type>` | `-t` | Dependency type (required) |
| `--metadata <json>` | `-m` | JSON metadata |

**Dependency types:**
- **Blocking:** `blocks`, `parent-child`, `awaits`
- **Associative:** `relates-to`, `references`, `supersedes`, `duplicates`, `caused-by`, `validates`, `mentions`
- **Attribution:** `authored-by`, `assigned-to`, `approved-by`
- **Threading:** `replies-to`

### `sf dependency remove <blocked> <blocker> --type <type>`
**Description:** Remove a dependency between two elements.

### `sf dependency list <id>`
**Description:** List dependencies of an element.

| Option | Short | Description |
|--------|-------|-------------|
| `--type <type>` | `-t` | Filter by type |
| `--direction <dir>` | `-d` | `out`, `in`, or `both` (default) |

### `sf dependency tree <id>`
**Description:** Show full dependency tree for an element (both upstream and downstream).

| Option | Short | Description |
|--------|-------|-------------|
| `--depth <n>` | `-d` | Max depth (default: 5) |

---

## 5. Plan Commands

### `sf plan` (parent)
**File:** `plan.ts`
**Description:** Manage plans (task collections). Default: lists plans.

### `sf plan create --title <title>`
**Description:** Create a new plan.

| Option | Short | Description |
|--------|-------|-------------|
| `--title <text>` | `-t` | Plan title (required) |
| `--status <status>` | `-s` | Initial status: draft (default) or active |
| `--tag <tag>` | | Add tag (repeatable) |

### `sf plan list`
**Description:** List plans with optional filtering.

| Option | Short | Description |
|--------|-------|-------------|
| `--status <status>` | `-s` | Filter: draft, active, completed, cancelled |
| `--tag <tag>` | | Filter by tag |
| `--limit <n>` | `-l` | Maximum results |

### `sf plan show <id>`
**Description:** Show plan details with progress metrics.

| Option | Short | Description |
|--------|-------|-------------|
| `--tasks` | `-t` | Include task list |

### `sf plan activate <id>`
**Description:** Transition a plan from draft to active.

### `sf plan complete <id>`
**Description:** Transition a plan from active to completed.

### `sf plan cancel <id>`
**Description:** Cancel a draft or active plan.

| Option | Short | Description |
|--------|-------|-------------|
| `--reason <text>` | `-r` | Cancellation reason |

### `sf plan add-task <plan-id> <task-id>`
**Description:** Add an existing task to a plan.

### `sf plan remove-task <plan-id> <task-id>`
**Description:** Remove a task from a plan.

### `sf plan tasks <plan-id>`
**Description:** List tasks belonging to a plan.

| Option | Short | Description |
|--------|-------|-------------|
| `--status <status>` | `-s` | Filter by task status |
| `--limit <n>` | `-l` | Maximum results |

### `sf plan auto-complete`
**Description:** Scan active plans and auto-complete those where all tasks are closed. Idempotent and safe.

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without changes |

---

## 6. Workflow Commands

### `sf workflow` (parent)
**File:** `workflow.ts`
**Description:** Manage workflows (executable task sequences instantiated from playbooks).

### `sf workflow create <playbook>`
**Description:** Instantiate a playbook into a workflow. Resolves playbook by name or ID.

| Option | Short | Description |
|--------|-------|-------------|
| `--var <name=value>` | | Set variable (repeatable) |
| `--ephemeral` | `-e` | Create as ephemeral (not synced) |
| `--title <text>` | `-t` | Override workflow title |

### `sf workflow list`
**Description:** List workflows with filtering.

| Option | Short | Description |
|--------|-------|-------------|
| `--status <status>` | `-s` | Filter: pending, running, completed, failed, cancelled |
| `--ephemeral` | | Show only ephemeral workflows |
| `--durable` | | Show only durable workflows |
| `--limit <n>` | `-l` | Maximum results |

### `sf workflow show <id>`
**Description:** Show workflow details with progress.

### `sf workflow tasks <id>`
**Description:** List tasks in a workflow.

| Option | Short | Description |
|--------|-------|-------------|
| `--ready` | | Show only ready tasks |
| `--status <status>` | `-s` | Filter by status |
| `--limit <n>` | `-l` | Maximum results |

### `sf workflow progress <id>`
**Description:** Show workflow progress metrics (completion percentage, task counts).

### `sf workflow delete <id>`
**Description:** Delete a workflow and all its tasks.

| Option | Short | Description |
|--------|-------|-------------|
| `--force` | `-f` | Force delete even for durable workflows |

### `sf workflow promote <id>`
**Description:** Promote an ephemeral workflow to durable (will be synced to JSONL).

### `sf workflow gc`
**Description:** Garbage collect old ephemeral workflows.

| Option | Short | Description |
|--------|-------|-------------|
| `--age <days>` | `-a` | Max age in days (default: 7) |
| `--dry-run` | | Preview without deleting |

---

## 7. Playbook Commands

### `sf playbook` (parent)
**File:** `playbook.ts`
**Description:** Manage playbooks (workflow templates).

### `sf playbook list`
**Description:** List available playbooks.

| Option | Short | Description |
|--------|-------|-------------|
| `--limit <n>` | `-l` | Maximum results |

### `sf playbook show <name-or-id>`
**Description:** Show playbook details.

| Option | Short | Description |
|--------|-------|-------------|
| `--steps` | `-s` | Include step definitions |
| `--variables` | | Include variable definitions |

### `sf playbook validate <name-or-id>`
**Description:** Validate playbook structure and create-time variables.

| Option | Description |
|--------|-------------|
| `--var <name=value>` | Set variable for create-time validation (repeatable) |
| `--create` | Perform create-time validation |

### `sf playbook create`
**Description:** Create a new playbook from CLI options.

| Option | Short | Description |
|--------|-------|-------------|
| `--name <name>` | `-n` | Playbook name (unique identifier, required) |
| `--title <title>` | `-t` | Display name (required) |
| `--step <spec>` | | Add step (`id:title[:dependsOn,...]`, repeatable) |
| `--variable <spec>` | | Add variable (`name:type[:default][:required]`, repeatable) |
| `--extends <name>` | | Extend another playbook (repeatable) |
| `--tag <tag>` | | Add tag (repeatable) |

---

## 8. Message Commands

### `sf message` / `sf msg` (parent)
**File:** `message.ts`
**Description:** Send and manage messages. Messages are immutable.

### `sf message send`
**Description:** Send a message to a channel, entity (DM), or as a reply.

| Option | Short | Description |
|--------|-------|-------------|
| `--channel <id>` | `-c` | Channel to send to |
| `--to <entity>` | `-T` | Entity ID for DM (finds/creates DM channel) |
| `--reply-to <msg>` | `-r` | Message ID to reply to (auto-sets channel, thread, swaps sender/recipient in DM) |
| `--content <text>` | `-m` | Message content |
| `--file <path>` | | Read content from file |
| `--thread <id>` | `-t` | Reply to message (thread) |
| `--attachment <id>` | `-a` | Attach document (repeatable) |
| `--tag <tag>` | | Add tag (repeatable) |

### `sf message reply <message-id>`
**Description:** Reply to a message (shorthand for `send --reply-to`). Auto-swaps sender/recipient in DM channels.

| Option | Short | Description |
|--------|-------|-------------|
| `--content <text>` | `-m` | Message content |
| `--file <path>` | | Read content from file |
| `--attachment <id>` | `-a` | Attach document (repeatable) |
| `--tag <tag>` | | Add tag (repeatable) |

### `sf message list --channel <id>`
**Description:** List messages in a channel.

| Option | Short | Description |
|--------|-------|-------------|
| `--channel <id>` | `-c` | Channel (required) |
| `--sender <id>` | `-s` | Filter by sender |
| `--limit <n>` | `-l` | Maximum messages |
| `--root-only` | `-r` | Show only root messages (no replies) |

### `sf message thread <message-id>`
**Description:** View a message thread (root message and all replies).

| Option | Short | Description |
|--------|-------|-------------|
| `--limit <n>` | `-l` | Maximum messages |

---

## 9. Inbox Commands

### `sf inbox` (parent)
**File:** `inbox.ts`
**Description:** Manage entity inbox notifications. Default: lists inbox items.

### `sf inbox [entity]` / `sf inbox list [entity]`
**Description:** List inbox items for an entity.

| Option | Short | Description |
|--------|-------|-------------|
| `--all` | | Include read and archived items |
| `--status <status>` | `-s` | Filter: unread, read, or archived |
| `--limit <n>` | `-l` | Maximum items |
| `--full` | `-F` | Show complete message content |

### `sf inbox read <inbox-item-id>`
**Description:** Mark an inbox item as read.

### `sf inbox read-all <entity>`
**Description:** Mark all inbox items as read for an entity.

### `sf inbox unread <inbox-item-id>`
**Description:** Mark an inbox item as unread.

### `sf inbox archive <inbox-item-id>`
**Description:** Archive an inbox item.

### `sf inbox count <entity>`
**Description:** Get unread inbox count for an entity.

---

## 10. Channel Commands

### `sf channel` (parent)
**File:** `channel.ts`
**Description:** Manage channels (message containers).

### `sf channel create`
**Description:** Create a new channel (group or direct).

| Option | Short | Description |
|--------|-------|-------------|
| `--name <name>` | `-n` | Channel name (required for group) |
| `--description <text>` | `-D` | Channel description |
| `--type <type>` | `-t` | Channel type: group (default) or direct |
| `--visibility <vis>` | | public or private (default) |
| `--policy <policy>` | `-p` | Join policy: open, invite-only (default), or request |
| `--member <id>` | `-m` | Add member (repeatable) |
| `--direct <entity>` | | Create direct channel with entity |
| `--tag <tag>` | | Add tag (repeatable) |

### `sf channel list`
**Description:** List channels.

| Option | Short | Description |
|--------|-------|-------------|
| `--type <type>` | `-t` | Filter: group or direct |
| `--member <id>` | `-m` | Filter by member entity |
| `--limit <n>` | `-l` | Maximum results |

### `sf channel join <channel-id>`
**Description:** Join a channel.

### `sf channel leave <channel-id>`
**Description:** Leave a channel.

### `sf channel members <channel-id>`
**Description:** List channel members.

### `sf channel add <channel-id> <entity-id>`
**Description:** Add a member to a channel.

### `sf channel remove <channel-id> <entity-id>`
**Description:** Remove a member from a channel.

### `sf channel merge`
**Description:** Merge two group channels (source is archived, messages go to target).

| Option | Short | Description |
|--------|-------|-------------|
| `--source <id>` | `-s` | Source channel (will be archived, required) |
| `--target <id>` | `-t` | Target channel (receives messages, required) |
| `--name <name>` | `-n` | Optional new name for target channel |

---

## 11. Document Commands

### `sf document` / `sf doc` (parent)
**File:** `document.ts`
**Description:** Manage documents (versioned content).

### `sf document create`
**Description:** Create a new document.

| Option | Short | Description |
|--------|-------|-------------|
| `--title <title>` | | Document title |
| `--content <text>` | `-c` | Document content |
| `--file <path>` | `-f` | Read content from file |
| `--type <type>` | `-t` | Content type: text, markdown, json (default: text) |
| `--category <cat>` | | Category (spec, prd, reference, tutorial, etc.) |
| `--tag <tag>` | | Add tag (repeatable) |
| `--metadata <json>` | `-m` | JSON metadata |

### `sf document list`
**Description:** List documents.

| Option | Short | Description |
|--------|-------|-------------|
| `--limit <n>` | `-l` | Maximum results |
| `--type <type>` | `-t` | Filter by content type |
| `--category <cat>` | | Filter by category |
| `--status <status>` | | Filter: active, archived |
| `--all` | `-a` | Include archived documents |

### `sf document show <id>`
**Description:** Show document details and content.

| Option | Description |
|--------|-------------|
| `--doc-version <n>` | Show specific version |

### `sf document update <id>`
**Description:** Update document content (creates a new version).

| Option | Short | Description |
|--------|-------|-------------|
| `--content <text>` | `-c` | New content |
| `--file <path>` | `-f` | Read new content from file |
| `--metadata <json>` | | Updated metadata |

### `sf document history <id>`
**Description:** Show document version history.

| Option | Short | Description |
|--------|-------|-------------|
| `--limit <n>` | `-l` | Maximum versions |

### `sf document rollback <id> <version>`
**Description:** Rollback document to a previous version.

### `sf document search <query>`
**Description:** Full-text search documents.

| Option | Short | Description |
|--------|-------|-------------|
| `--category <cat>` | | Filter by category |
| `--status <status>` | | Filter by status |
| `--limit <n>` | `-l` | Maximum results |

### `sf document reindex`
**Description:** Rebuild full-text search index.

### `sf document archive <id>`
**Description:** Archive a document.

### `sf document unarchive <id>`
**Description:** Unarchive a document.

### `sf document delete <id>`
**Description:** Delete a document (soft-delete).

| Option | Short | Description |
|--------|-------|-------------|
| `--reason <text>` | `-r` | Reason for deletion |
| `--force` | `-f` | Skip confirmation |

---

## 12. Docs Commands (Documentation Infrastructure)

### `sf docs` (parent)
**File:** `docs.ts`
**Description:** Documentation infrastructure commands for managing the workspace Documentation library and directory.

### `sf docs init`
**Description:** Bootstrap the Documentation library and Documentation Directory document. Creates the library and directory if they don't exist.

### `sf docs add <doc-id> [doc-id...]`
**Description:** Add one or more documents to the Documentation library.

### `sf docs dir`
**Description:** Show the Documentation Directory document.

| Option | Description |
|--------|-------------|
| `--content` | Include the full document content in output |

---

## 13. Library Commands

### `sf library` (parent)
**File:** `library.ts`
**Description:** Manage libraries (document collections).

### `sf library create --name <name>`
**Description:** Create a new library.

| Option | Short | Description |
|--------|-------|-------------|
| `--name <name>` | `-n` | Library name (required) |
| `--tag <tag>` | | Add tag (repeatable) |

### `sf library list`
**Description:** List libraries.

| Option | Short | Description |
|--------|-------|-------------|
| `--limit <n>` | `-l` | Maximum results |

### `sf library add <library-id> <doc-id>`
**Description:** Add a document to a library.

### `sf library remove <library-id> <doc-id>`
**Description:** Remove a document from a library.

### `sf library docs <library-id>`
**Description:** List documents in a library.

### `sf library nest <child-id> <parent-id>`
**Description:** Nest a library under another (create hierarchy).

### `sf library stats <library-id>`
**Description:** Show library statistics.

### `sf library roots`
**Description:** List root libraries (not nested under other libraries).

### `sf library delete <library-id>`
**Description:** Delete a library.

| Option | Short | Description |
|--------|-------|-------------|
| `--force` | `-f` | Force deletion even if library has contents |

---

## 14. Entity Commands

### `sf entity` (parent)
**File:** `entity.ts`
**Description:** Manage entities (agents, humans, systems). Default: lists entities.

### `sf entity register <name>`
**Description:** Register a new entity.

| Option | Short | Description |
|--------|-------|-------------|
| `--type <type>` | `-t` | Entity type: agent (default), human, or system |
| `--public-key <key>` | | Base64-encoded Ed25519 public key |
| `--tag <tag>` | | Add tag (repeatable) |

### `sf entity list`
**Description:** List all registered entities.

| Option | Short | Description |
|--------|-------|-------------|
| `--type <type>` | `-t` | Filter: agent, human, or system |
| `--limit <n>` | `-l` | Maximum results |

### `sf entity set-manager <entity> <manager>`
**Description:** Set an entity's manager. Validates no self-reference or circular chains.

### `sf entity clear-manager <entity>`
**Description:** Clear an entity's manager.

### `sf entity reports <manager>`
**Description:** List direct reports for a manager.

### `sf entity chain <entity>`
**Description:** Show management chain for an entity (entity -> manager -> ... -> root).

---

## 15. Team Commands

### `sf team` (parent)
**File:** `team.ts`
**Description:** Manage teams (entity collections).

### `sf team create --name <name>`
**Description:** Create a new team.

| Option | Short | Description |
|--------|-------|-------------|
| `--name <name>` | `-n` | Team name (required) |
| `--member <id>` | `-m` | Add member (repeatable) |
| `--tag <tag>` | | Add tag (repeatable) |

### `sf team list`
**Description:** List teams.

| Option | Short | Description |
|--------|-------|-------------|
| `--member <id>` | `-m` | Filter by member |
| `--limit <n>` | `-l` | Maximum results |

### `sf team add <team-id> <entity-id>`
**Description:** Add member to team.

### `sf team remove <team-id> <entity-id>`
**Description:** Remove member from team.

### `sf team members <team-id>`
**Description:** List team members.

### `sf team delete <team-id>`
**Description:** Delete a team (soft delete).

| Option | Short | Description |
|--------|-------|-------------|
| `--reason <text>` | `-r` | Reason for deletion |
| `--force` | `-f` | Skip confirmation for teams with members |

---

## 16. Sync Commands

### `sf sync` (parent)
**File:** `sync.ts`
**Description:** JSONL sync commands (export, import, status).

### `sf export`
**Description:** Export elements to JSONL files. Incremental by default (only dirty elements).

| Option | Short | Description |
|--------|-------|-------------|
| `--output <dir>` | `-o` | Output directory (default: .stoneforge/sync) |
| `--full` | `-f` | Full export (ignore dirty tracking) |
| `--include-ephemeral` | | Include ephemeral elements |

### `sf import`
**Description:** Import elements from JSONL files. Uses Last-Write-Wins merge strategy.

| Option | Short | Description |
|--------|-------|-------------|
| `--input <dir>` | `-i` | Input directory (default: .stoneforge/sync) |
| `--dry-run` | `-n` | Preview without importing |
| `--force` | `-f` | Force import (remote always wins) |

### `sf status`
**Description:** Show sync status (dirty element count, total elements, sync directory status).

---

## 17. External Sync Commands

### `sf external-sync` (parent)
**File:** `external-sync.ts`
**Description:** Sync with external services (GitHub Issues, Linear, etc.).

### `sf external-sync link <elementId> <url-or-external-id>`
**Description:** Link a local element to an external issue or page.

| Option | Short | Description |
|--------|-------|-------------|
| `--provider <name>` | `-p` | Provider name (default: github) |
| `--type <type>` | `-t` | Element type: task or document (default: task) |

### `sf external-sync unlink <element-id>`
**Description:** Unlink a local element from an external service.

### `sf external-sync link-all`
**Description:** Link all unlinked elements to an external provider.

| Option | Short | Description |
|--------|-------|-------------|
| `--provider <name>` | `-p` | Provider to link to (required) |
| `--project <name>` | | Override default project |
| `--status <status>` | `-s` | Only link elements with this status (repeatable) |
| `--dry-run` | `-n` | Preview without linking |
| `--batch-size <n>` | `-b` | Concurrency limit (default: 10) |
| `--force` | `-f` | Re-link already linked elements |
| `--type <type>` | `-t` | Element type: task or document (default: task) |
| `--no-library` | | Include documents not in any library |

### `sf external-sync unlink-all`
**Description:** Unlink all linked elements.

| Option | Description |
|--------|-------------|
| `--provider <name>` | Only unlink from this provider |
| `--type <type>` | Element type: task, document, or all |
| `--dry-run` | Preview without unlinking |

### `sf external-sync push`
**Description:** Push local changes to external service.

| Option | Description |
|--------|-------------|
| `--all` | Push all linked elements |
| `--force` | Push regardless of change detection |
| `--type <type>` | Element type: task, document, or all |
| `--no-library` | Include documents not in any library |

### `sf external-sync pull`
**Description:** Pull changes from external service.

| Option | Description |
|--------|-------------|
| `--provider <name>` | Provider to pull from |
| `--discover` | Discover new issues not yet linked |
| `--type <type>` | Element type: task, document, or all |

### `sf external-sync sync`
**Description:** Bidirectional sync with external service.

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without changes |
| `--type <type>` | Element type: task, document, or all |

### `sf external-sync resolve <element-id>`
**Description:** Resolve sync conflicts.

| Option | Short | Description |
|--------|-------|-------------|
| `--keep <local\|remote>` | `-k` | Which version to keep |

### `sf external-sync status`
**Description:** Show external sync state (linked counts, providers, conflicts, cursors).

### `sf external-sync config`
**Description:** Show current provider configuration.

### `sf external-sync config set-token <provider> <token>`
**Description:** Set authentication token for a provider.

### `sf external-sync config set-project <provider> <project>`
**Description:** Set default project for a provider.

### `sf external-sync config set-auto-link <provider>`
**Description:** Enable auto-link with a provider (new tasks auto-create external issues).

| Option | Description |
|--------|-------------|
| `--type <type>` | Type of auto-link: task or document (default: task) |

### `sf external-sync config disable-auto-link`
**Description:** Disable auto-link.

| Option | Description |
|--------|-------------|
| `--type <type>` | Type to disable: task, document, or all (default: all) |

---

## 18. Identity Commands

### `sf identity` (parent)
**File:** `identity.ts`
**Description:** Manage identity settings. Without subcommand, shows current identity (same as whoami).

### `sf whoami`
**Description:** Show current actor identity (name, source, mode, verification status).

### `sf identity mode [mode]`
**Description:** Show or set identity mode (soft, cryptographic, hybrid).

### `sf identity sign`
**Description:** Sign data using an Ed25519 private key.

| Option | Short | Description |
|--------|-------|-------------|
| `--data <string>` | `-d` | Data to sign |
| `--file <path>` | `-f` | File to sign |
| `--hash <hash>` | | Pre-computed SHA256 hash |

### `sf identity verify`
**Description:** Verify an Ed25519 signature.

| Option | Short | Description |
|--------|-------|-------------|
| `--signature <sig>` | `-s` | Signature (base64, required) |
| `--public-key <key>` | `-k` | Public key (base64, required) |
| `--signed-at <time>` | | Timestamp (ISO 8601, required) |
| `--data <string>` | `-d` | Original data |
| `--file <path>` | `-f` | File with original data |
| `--hash <hash>` | | Request hash |

### `sf identity keygen`
**Description:** Generate a new Ed25519 keypair.

### `sf identity hash`
**Description:** Compute SHA256 hash of data.

| Option | Short | Description |
|--------|-------|-------------|
| `--data <string>` | `-d` | Data to hash |
| `--file <path>` | `-f` | File to hash |

---

## 19. Config Commands

### `sf config` (parent)
**File:** `config.ts`
**Description:** Manage configuration. Default: shows all config.

### `sf config show [path]`
**Description:** Display current configuration (all or specific key).

### `sf config set <path> <value>`
**Description:** Set a configuration value. Parses as JSON if possible, otherwise string.

### `sf config unset <path>`
**Description:** Remove a configuration value (falls back to default).

### `sf config edit`
**Description:** Open config file in default editor ($EDITOR > $VISUAL > platform default).

---

## 20. History & Event Commands

### `sf history <id>`
**File:** `history.ts`
**Description:** Show event history/timeline for an element.

| Option | Short | Description |
|--------|-------|-------------|
| `--limit <n>` | `-l` | Max events (default: 50) |
| `--type <type>` | `-t` | Filter by event type |
| `--actor <actor>` | `-a` | Filter by actor |
| `--after <time>` | | Events after this time (ISO 8601) |
| `--before <time>` | | Events before this time (ISO 8601) |
| `--format <fmt>` | `-f` | Output format: timeline (default) or table |

---

## 21. Operation Log

### `sf log`
**File:** `log.ts`
**Description:** Show persistent operation log entries for system observability.

| Option | Short | Description |
|--------|-------|-------------|
| `--level <level>` | | Filter: info, warn, error |
| `--category <cat>` | `-c` | Filter: dispatch, merge, session, rate-limit, steward, recovery |
| `--since <time>` | `-s` | Relative time (2h, 30m, 1d) or ISO timestamp |
| `--task <id>` | `-t` | Filter by task ID |
| `--agent <id>` | `-a` | Filter by agent ID |
| `--limit <n>` | `-l` | Max entries (default: 20) |

---

## 22. Admin Commands

### `sf stats`
**File:** `stats.ts`
**Description:** Show workspace statistics (element counts by type, ready/blocked tasks, dependencies, events, database size).

### `sf metrics`
**File:** `metrics.ts`
**Description:** Show provider metrics and usage statistics.

| Option | Short | Description |
|--------|-------|-------------|
| `--range <range>` | `-r` | Time range (e.g., 7d, 14d, 30d) |
| `--provider <name>` | `-p` | Filter by provider |
| `--group-by <field>` | `-g` | Group by: provider (default) or model |

### `sf doctor`
**File:** `admin.ts`
**Description:** Check system health and diagnose issues. Checks workspace, database, schema, integrity, foreign keys, blocked cache, storage, and runtime health (rate limits, stuck tasks, merge queue, error rate, agent pool via smithy-server API).

| Option | Description |
|--------|-------------|
| `--fix` | Automatically repair detected issues (FK violations, blocked cache) |

### `sf migrate`
**File:** `admin.ts`
**Description:** Run database schema migrations.

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview migrations without applying |

### `sf gc` (parent)
**File:** `gc.ts`
**Description:** Garbage collect old ephemeral data.

### `sf gc tasks`
**Description:** Garbage collect old tasks (deprecated -- now a no-op; use `sf gc workflows`).

### `sf gc workflows`
**Description:** Delete old ephemeral workflows in terminal state (completed, failed, cancelled) and their child tasks.

| Option | Short | Description |
|--------|-------|-------------|
| `--age <days>` | `-a` | Max age in days (default: 1) |
| `--limit <n>` | `-l` | Maximum workflows to delete |
| `--dry-run` | | Preview without deleting |

---

## 23. Embeddings Commands

### `sf embeddings` (parent)
**File:** `embeddings.ts`
**Description:** Manage document embeddings for semantic search.

### `sf embeddings install`
**Description:** Download the local embedding model.

### `sf embeddings status`
**Description:** Show embedding configuration and model availability.

### `sf embeddings reindex`
**Description:** Re-embed all documents.

### `sf embeddings search <query>`
**Description:** Semantic search (for testing).

---

## 24. Shell & Utility Commands

### `sf completion [shell]`
**File:** `completion.ts`
**Description:** Generate shell completion scripts for bash, zsh, or fish.

### `sf alias`
**File:** `alias.ts`
**Description:** Show all registered command aliases.

### `sf install`
**File:** `install.ts`
**Description:** Install stoneforge extensions.

#### `sf install skills`
**Description:** Install Claude skills to `.claude/skills/`.

| Option | Short | Description |
|--------|-------|-------------|
| `--force` | `-f` | Overwrite existing skill files |

### `sf serve <server-type>`
**File:** `serve.ts`
**Description:** Start a Stoneforge server (smithy or quarry).

| Option | Short | Description |
|--------|-------|-------------|
| `--port <port>` | `-p` | Port to listen on |
| `--host <host>` | `-H` | Host to bind to (default: localhost) |

---

## CLI Architecture

- **Entry point:** `packages/quarry/src/cli/runner.ts` -- `main()` registers all commands and runs the CLI.
- **Parser:** `packages/quarry/src/cli/parser.ts` -- Parses argv into commands, args, global options, and command options. Supports `--option=value`, combined short options (`-qv`), `--` separator, kebab-to-camelCase conversion, and shell escape handling.
- **Formatter:** `packages/quarry/src/cli/formatter.ts` -- Output modes: human-readable (tables, trees), JSON, and quiet (IDs only).
- **Plugin system:** `packages/quarry/src/cli/plugin-types.ts`, `plugin-loader.ts`, `plugin-registry.ts` -- Supports discovering and registering third-party CLI plugins.
- **Database helper:** `packages/quarry/src/cli/db.ts` -- Resolves database path, creates API instances.
- **Command suggestions:** `packages/quarry/src/cli/suggest.ts` -- "Did you mean?" suggestions for mistyped commands.
