**You are continuing work on a UI/UX prototype for Stoneforge's next-generation web dashboard (smithy-next). The prototype is a standalone React + Vite + Tailwind app at apps/smithy-next/ within the Stoneforge monorepo.**

## What this is

A complete mock UI prototype (no backend) for rethinking Stoneforge's IDE-like dashboard. It uses mock data and inline styles. The goal is to iterate on the UI/UX design before porting changes to the real app at apps/smithy-web/.

## Design direction

Linear-inspired, dark-and-light-mode, minimal/restrained aesthetic with blue accents. Inter font, 13px base, elevation-based hierarchy (no card borders), 4-6px radius. The app is an IDE for agentic software development — not a traditional SaaS dashboard.

## Architecture

**Single-page layout with 5 zones:**

```
┌──────────────────────────────────────────────────────────────────┐
│ Top Bar (44px)                                                   │
├────┬─────────────────────────────────────────┬───────────────────┤
│    │                                         │                   │
│ A  │     Main Content Area                   │  Director Panel   │
│ c  │     (Kanban default,                    │  (right sidebar,  │
│ t  │      replaced by overlays)              │   collapsible,    │
│ i  │                                         │   resizable)      │
│ v  │                                         │                   │
│ i  │                                         │                   │
│ t  │                                         │                   │
│ y  │                                         │                   │
│    │                                         │                   │
│ R  │                                         │                   │
│ a  │                                         │                   │
│ i  ├─────────────────────────────────────────┤                   │
│ l  │ Bottom Strip (30px, expands on click)   │                   │
│48px│                                         │                   │
└────┴─────────────────────────────────────────┴───────────────────┘
```

On the Tasks view, an **Active Agents Strip** sits between the Main Content and the Bottom Panel (see Zone 5b below). The Bottom Panel defaults to a 30px collapsed strip showing just a "Terminal" button. When opened, it expands upward (drag-resizable, min 100px, max 60vh). Both the Active Agents Strip and the Bottom Panel only span the Main Content column — the Director Panel extends full-height uninterrupted.

**URL routing** — parameterized paths via History API with deep-linking. `parseUrl`/`buildUrl` functions in App.tsx handle routes. Sub-page state (selected task, MR, MR tab, CI run, CI job) is encoded in the URL and restored on refresh/back/forward. Routes include `/tasks`, `/tasks/{taskId}`, `/merge-requests`, `/merge-requests/{mrId}?tab=commits`, `/ci`, `/ci/{runId}`, `/ci/{runId}/jobs/{jobId}`, `/editor`, `/automations`, `/agents`, `/runtimes`, `/preview`, `/plans`, `/messages`, `/documents`, `/metrics`, `/sessions`, `/settings`, `/workspaces`, and more.

**State management** — All state lives in App.tsx via `useState` hooks. No external state library. Key state includes: `activeView`, `tasks`, `mergeRequests`, `ciActions`, `appMode` (solo/team), `syncStatus`, `directorCollapsed`, `directorExpandState`, `terminalOpen`, `selectedTaskIds`, `selectedMRId`, `selectedMRTab`, `selectedCIRunId`, `selectedCIJobId`, `notifications`, `toasts`, `conflicts`, `incomingChanges`, `commandPaletteOpen`, `createDialogOpen`, and more.

**Keyboard shortcuts** — Cmd+1-7 for primary views, Cmd+` for terminal, Cmd+K for command palette, C for create task, Escape for close overlays, Space for peek preview, X for task selection.

---

## Solo vs Team Mode (Progressive Disclosure)

The app supports two modes toggled via a pill switch in the Activity Rail:

- **Solo mode** (default, free OSS) — Single operator managing multiple AI agent sessions locally. Clean, focused experience with no cloud dependency. No presence indicators, no sync status, no team member selectors.
- **Team mode** (cloud SaaS) — Collaborative workflows with org/team/workspace model. Team features appear additively via `{isTeamMode && <TeamFeature />}`. All team features use a React context (`TeamContext`) that provides `appMode`, `currentUser`, `org`, `teamMembers`, `presence`, `syncStatus`, and helper methods.

The mode is persisted to localStorage and the toggle is always visible so both experiences can be evaluated side-by-side.

---

## Zone 1: Activity Rail (48px left sidebar)

A narrow icon-only navigation column. Top-to-bottom:

**Logo** — 32x32 Stoneforge logo at very top.

**Workspace Pips** — Up to 5 circular buttons (30x30) representing recently-opened workspaces. Each shows a single-letter icon. Active workspace has a left accent bar. Each pip has:
- A micro status bar at bottom (green=running agents, amber=in review, red=blocked)
- A completion badge (top-right) showing tasks completed since last visit
- Team mode: red error dot if workspace status is needs-attention/error
- Overflow "..." button for hidden workspaces with dropdown listing all + "New Workspace"

**Primary Navigation** — 7 icon buttons (36x36) for core views:
1. Tasks (SquareKanban) — Cmd+1
2. Merge Requests (GitMerge) — Cmd+2
3. CI/CD (CircleDot) — Cmd+3
4. Preview (Eye) — Cmd+4
5. Automations (Zap) — Cmd+5
6. Sessions (Activity) — Cmd+6
7. Agents (Bot) — Cmd+7

Active view gets a left accent bar and primary-subtle background.

**"More" Overflow** — LayoutGrid icon button, dropdown reveals secondary views: Editor, Documents, Messages, Plans, Metrics.

**Bottom Controls** (stacked vertically):
- Theme toggle — Sun/Moon icon, persists to localStorage, detects system preference
- Mode toggle — 40x18px pill with User (solo) / Users (team) icons, sliding indicator
- Settings — Gear icon
- User avatar — 28x28 circle with initials. Solo: click opens simple dropdown (Settings, Keyboard Shortcuts). Team: adds presence dot, click opens full user menu (name, email, status selector with Online/Away/Offline, Org Settings if admin, Sign Out)

---

## Zone 2: Top Bar (44px)

A horizontal strip with information density that adapts to mode.

**Left section:**
- Workspace selector — clickable pill showing workspace icon + name
- Team mode: Presence strip — overlapping 22px avatar circles (-6px margin) of team members in this workspace, max 4 then "+N", each with presence dot, tooltip shows "Sarah Chen — viewing Merge Requests". Current user excluded.
- Branch indicator — GitBranch icon + "main" text

**Right section:**
- Team mode: Sync indicator — dot + text. "Synced" (green), "Syncing..." (blue spinner), "Offline" (gray), "Sync error" (red)
- Daemon indicator (both modes) — pill showing dispatch daemon host + status dot. Green dot = running, red = error, gray = stopped. Click navigates to Runtimes page. Tooltip: "Dispatch daemon running on [name]"
- Autopilot button — Zap icon + "Auto"/"Paused", green when on, toggles autopilot
- Stop All button — Square icon, red on hover, stops all running agents. Grouped with Autopilot in a subtle background container.
- Notification bell — Bell icon with unread count badge, opens NotificationInbox dropdown
- Command Palette button — "⌘K" pill, opens global search

---

## Zone 3: Main Content Area

### Default View: Kanban Board

**Toolbar** (8px 16px padding, 13px/600 title, borderBottom):
- "Tasks" title
- Team mode: "My Tasks" / "All Tasks" segmented toggle (defaults to My Tasks, filters by assigneeUserId === currentUser.id)
- Active filter pills (removable, "Clear all" button)
- Search bar — desktop: always-visible 200px input. Mobile: icon that expands. Searches across title, id, description, assignee, labels, branch.
- Selection counter — "{N} selected" with clear button (when tasks selected via X key)
- Filter button — 26px, shows count badge, opens dropdown panel with: Priority, Assignee, Label, Status, Plan filters
- Display button — 26px, opens panel with: Group by (status/priority/assignee/label), Sort by (priority/title/estimate/updatedAt), Sort direction (asc/desc), Column visibility toggles
- View toggle — 2-button group: Kanban (grid icon) / List (list icon)
- "+ New Task" button — primary color

**Board Layout:**
- Horizontal scroll, gap=1px, 5 default columns: Backlog, To Do, In Progress, In Review, Done
- Each column: 220px flex base, shows task count badge. Header has "..." menu (Hide column) and "+" button (create task in column). Cards scroll vertically with 4px gap.
- Hidden columns: collapsible section showing count, expandable to unhide columns
- Drag-and-drop: cards can be dragged between columns to change status. Drop targets highlight.

**Task Card Anatomy:**
- Background: elevated surface, 4px radius, 10x12px padding
- Top row: clickable status icon (circle with color, opens StatusDropdown) + task ID (e.g. "SF-142") + priority bar indicator (1-4 colored bars)
- Right side of top row: concurrency claim indicator (amber AlertTriangle if `task.claimedBy` set — solo tooltip: "Director Alpha is already working on this task", team tooltip: adds "launched by Sarah")
- Title text
- Labels row — colored dot + label text pills
- Branch name — if set, git branch icon + branch text
- Sub-task progress — if subtasks exist, progress bar + "2/4" count
- Bottom row: MR status pill, CI status pill, agent session status dot, due date, assignee avatar (22px circle with initials)
- Team mode: presence dot on human assignee avatars (green/amber/gray)
- Hover: background lightens, "..." settings button appears
- Selected: primary-subtle background with outline
- Right-click: context menu with Archive, Delete, Duplicate, Add to Plan, Link MR/CI/Session, Copy as JSON/Prompt, Change status/priority/assignee

**Peek Panel** — Pressing Space on a hovered task opens a floating right-side panel showing a mini task preview. Close (X) and "Open full" (→) buttons.

**List View** — Toggleable via view switch. Groups tasks by selected field. Rows show: status icon, ID, title, priority bars, labels, assignee avatar, estimate, due date, updated at. Click opens TaskDetailOverlay.

### Overlay: Task Detail

Full-page overlay replacing the kanban. URL: `/tasks/{taskId}`.

**Header (44px):**
- Back button (ArrowLeft)
- Breadcrumb: "{ParentId} › {TaskId}"
- "..." menu: Copy link, Copy ID, Copy branch, Copy as prompt, Archive, Delete, Duplicate, Add to plan
- Position counter: "{N} / {total}" with previous/next navigation (ArrowUp/Down)

**Claim Warning Banner (both modes, conditional):**
- Shown when `task.claimedBy` is set
- AlertTriangle icon + amber-subtle background + left border
- Solo: "Director Alpha is already working on this task. Assign another agent anyway?"
- Team: "Director Alpha (launched by Sarah Chen) is working on this task. Assign your agent anyway?"
- Buttons: "Dismiss" | "Assign Anyway"

**Two-Column Layout:**

*Left column (content area):*
- Title — 22px bold, editable
- Description — placeholder "Add description..."
- Reaction + Attachment buttons
- Acceptance Criteria — "{N}/{total}" progress with colored bar, checklist items (clickable to toggle), "All passing" badge, "+ Add acceptance criteria" button. Status gating: certain statuses are disabled until criteria are met.
- Sub-Tasks — "{done}/{total}", clickable task rows (status icon + ID + title + status), "+ Add sub-tasks" button
- Dependencies — similar to sub-tasks, shows dependency chain
- Activity Feed — timestamp-ordered entries with user avatars, activity descriptions. Agent actions show "launched by [human name]" in team mode. Comment input at bottom with @mention support (Cmd+Enter to send).
- Team mode: @mentions in comments trigger autocomplete of team members, selected renders as blue pill

*Right column (properties sidebar, 280px):*
- Copy buttons row: Link, ID, Branch, Prompt (with tooltips)
- "Properties" section header
- Status pill — opens StatusDropdown
- Priority pill — opens PriorityDropdown with colored bar icons (Urgent=4 bars red, High=3 orange, Medium=2 yellow, Low=1 gray)
- Assignee pill — opens AssigneeDropdown (solo: agents + current user; team: + all team members with presence dots)
- Estimate pill — opens EstimateDropdown (1-5 complexity scale)
- Labels — multiple removable pills with colored dots
- Due Date — calendar picker if set
- Branch — branch name with link-to-editor button
- Plan — plan name with link if associated
- Creator — (team mode, human-filed tasks only) avatar + name
- Watchers — (team mode only) Eye icon, avatar stack of subscribed users, "+" to add, "Watch"/"Unwatch" toggle for current user
- Required Agent Tags — tag pills with match indicator
- Required Role Definition Tags — tag pills
- "Stoneforge" section:
  - Director Session — link with status badge (running/idle/error)
  - Agent Session — link with agent name and status
  - Worker Session — if applicable
  - Reviewer Session — if applicable
  - CI/CD — link with status
  - MR — link with status
  - Whiteboard — link if exists
  - Preview — link if exists

### Overlay: Merge Requests

Full-page overlay. URL: `/merge-requests` (list) or `/merge-requests/{mrId}?tab={tab}` (detail).

**MR List View:**
- Toolbar: search bar, active filter pills, Filter dropdown (Status/Author/Labels/CI/Reviewer), Display options (group by status/author, sort by created/title/additions/files), "+ New MR" button
- List grouped by status: Draft, Open, Merged, Closed
- Each MR row: merge icon, title (with search highlighting), CI status badge, metadata (ID, branch, author, date), reviewer avatars with colored borders (approved=green, changes-requested=red, commented=blue, pending=gray), +/- line counts, review agent status indicator, file count, chevron

**MR Detail View — 4 tabs + sidebar:**

*Header:*
- Back button, title, MR metadata (ID, branch, author, date)
- Top-right: agent/task/preview/GitHub chips as linked badges
- Tabs: Conversation (count), Commits (count), Checks (count), Files Changed (count)

*Tab 1 — Conversation:*
- Chronological timeline mixing: creation events, review submissions, comments, agent activity, commit pushes with CI status icons, merge steward actions
- Preview deployment card: status indicator (building/ready/failed), URL link
- GitHub-style Checks summary: expandable actions with status icons, job sub-rows per action. Clickable to navigate to Checks tab.
- Comment input at bottom: Rich text editor with Write/Preview tabs, markdown toolbar (H/B/I/code/link/quote/lists), keyboard shortcuts, submit review dropdown (Comment / Approve / Request Changes)
- Team mode: @mention autocomplete in comment input

*Tab 2 — Commits:*
- Commit list with expandable per-commit diffs
- Each commit: avatar, message, hash, date

*Tab 3 — Checks:*
- 2-level hierarchy: Actions → Jobs
- Each action: status icon, name, duration, expandable job list
- Each job: status icon, name, duration, expandable log viewer

*Tab 4 — Files Changed:*
- Shared FilesChangedView component with inline commenting enabled
- Toolbar: tree toggle, view mode (Unified/Split), "Hide whitespace" checkbox, viewed counter
- File tree (240px, collapsible): nested folder structure, file icons with status (A/M/D badges), viewed checkboxes, click to navigate
- Diff viewer per file: file header (status, path, +/- counts, "Viewed" checkbox), line display with old/new line numbers, +/- indicators, syntax highlighting (Prism.js, 15+ languages, dark One Dark + light GitHub themes)
- Hover "+" on lines for inline comment. Multi-line drag selection with auto-suggested code changes. Inline comment threads below lines.

*Review Sidebar (280px right):*
- Reviewers: list with avatars, review state badges (Approved/Changes Requested/Pending), presence dots
- Team mode: "Request review" button → team member dropdown
- Labels: tag pills
- Stoneforge section: linked task, director/worker agent names with links, review agent status, preview link with status
- Merge Flow: strategy dropdown (Squash/Merge commit/Rebase), delete branch checkbox, auto-merge toggle, merge gate checklist (CI checks pass, approval count, no conflicts, review agent approved), conflict banner if applicable, merge button

### Overlay: CI/CD

Full-page overlay. URL: `/ci` (list), `/ci/{runId}` (run detail), `/ci/{runId}/jobs/{jobId}` (run + job selected).

**CI Run List View:**
- Left sidebar (200px): Action list (All actions, CI, Deploy, Nightly E2E) with run counts, clicking filters the run list
- Toolbar: search, filter pills, Filter dropdown (Status/Event/Branch/Actor), Display options (group by status/action, sort by run number/duration/created), "+ New Action" button, "Run action" button (primary)
- Run list rows: animated status icon (spinner if running), action name + run number, event badge (push/PR/schedule/manual), branch, commit hash, actor avatar (with presence dot in team mode or bot icon), timestamp, job progress bar (completed/total), duration
- Per-row "..." menu: View action file, Delete run (with confirmation dialog)

**CI Run Detail View:**
- Header: back button, action name + run number, status badge, commit message, task/MR/agent chips (top-right matching MR pattern), Re-run all / Cancel / More actions (bottom-right), delete confirmation dialog
- Team mode: Deployment Approval Gates section (when `run.approvalGates`): progress bar (N/M approvals), list of who approved (avatar+name+timestamp), "Approve Deployment" button for current user
- Left sidebar (240px): "Summary" link, job list with status icons/names/durations, "Run details" section (artifacts count, action file link)
- Summary view (no job selected): progress bar, annotations panel (error/warning with file:line references), pipeline DAG (horizontal SVG with status-colored nodes and dependency edges, clickable), artifacts list with download links
- Job detail view (job selected): job header (name, runner badge, duration, "Handoff to Fix" button on failed jobs), expandable steps with inline log viewers
- Log viewer: monospace text, line numbers, search with match highlighting/prev/next navigation, copy-all, color-coded output (error=red, success=green, section headers=secondary), auto-scroll for running steps
- Handoff dialog: pre-filled error context (job name, error summary, log excerpt, related files), agent selector dropdown, editable message textarea, Send/Cancel

**Manual Trigger Dialog:**
- Action selector dropdown, branch input, dynamic dispatch inputs (string/boolean/choice types), Trigger button

### Overlay: Automations

Full-page overlay. URL: `/automations` with sub-routes for detail, create, edit, runs.

**List View:**
- Team mode: scope filter tabs — "Personal" (lock icon) / "Team" (people icon) / "All"
- Grouped by status: Active, Error, Disabled, Draft
- Each row: workflow name, description, trigger type badge (cron/event/manual/webhook), scope badge (Personal/Team), step count, last run status, total runs, created by
- Team mode: "Requires approval" badge on approval-gated workflows
- "+ New Automation" button

**Detail View:**
- Tabs: Overview, Config, Runs
- Overview: description, trigger config, step list, linked CI action
- Config: step editor canvas with visual nodes
- Runs: run history table with status, timestamp, trigger source, duration, result. Each row shows triggering user avatar + name ("Triggered by Sarah Chen" or "Triggered by schedule")
- Team mode: approval UI — approver list, manual trigger shows confirmation step

**Create/Edit View:**
- Canvas with drag-and-drop step nodes, step configuration panel, template selector, Save/Cancel

### Overlay: Agents

Full-page overlay. URL: `/agents` with sub-routes. Top-level tabs: Agents (count), Role Definitions (count), Runtimes (count).

**Agent List View:**
- Search/filter bar
- Grouped by status: Running, Idle, Error
- Each row: status dot, agent name, tags (local/fast/docker/cloud/ssh), model badge (Claude Code), runtime badge (adam-macbook/docker-local/staging-worktree/gpu-docker/gpu-cluster), session count, last activity time
- "+ New Agent" button
- Team mode: connection badges on each agent

**Agent Detail View:**
- Header: agent name, model, status, enable/disable toggle, actions dropdown
- Tabs: Overview (description, model, runtime, pool config), Sessions (active/past list with timestamps), Tasks (completed/assigned), Settings (agent config)
- Agent sidebar (200px) for quick navigation between agents

**Role Definition List:**
- Categorized list (orchestrator/executor/reviewer)
- Each: name, description preview, category badge, tags
- "+ New Role" button

**Role Definition Detail:**
- Name, description, role prompt (rich textarea), tags, category selector, custom tools, skills, hooks
- Save/Delete

### Overlay: Runtimes

Accessible via Agents overlay's "Runtimes" tab. URL: `/runtimes`.

**Daemon Host Section** (top of list):
- "Dispatch Daemon" header, current host runtime name + status badge (Running/Stopped/Error), uptime, "Stop"/"Start" button
- "Change host" button → dropdown of available runtimes with confirmation dialog ("Warning: moving the daemon will interrupt running workflows")
- Note: "The daemon orchestrates agent lifecycles. It runs on the host machine but does not use the runtime's worktree or sandbox config."

**Runtime List:**
- Each row: status dot (online/offline/error), runtime name, host name, mode badge (Worktree/Docker/Sandbox), assigned agent count, last activity
- Daemon host runtime gets a "Daemon" badge (Cpu icon, green)
- "+ New Runtime" button

**Runtime Detail:**
- Name, host, mode, status, worktree path (if applicable)
- Configuration section: assigned agents with add/remove
- "Dispatch Daemon" info section on daemon host: status, uptime, "Move daemon to another runtime" link
- Edit/Delete buttons

**Runtime Create/Edit:**
- Name input, host dropdown, mode selector (worktrees/docker/sandbox), default checkbox, worktree path, Create/Save button

### Overlay: Editor

Full-page code viewer. URL: `/editor` with optional file path and branch params.

- Header: back button, "Editor" title, file path breadcrumb, branch name
- File tree (240px): collapsible folder structure, folder/file icons, depth indentation
- Code view: line numbers, simple syntax highlighting (keywords=primary, comments=tertiary, strings=success), hover background per line

### Overlay: Preview

Multi-environment app preview. URL: `/preview` with optional tab ID.

- Toolbar: "Preview" label, read-only URL bar (protocol icon, URL, refresh button, open-in-browser button), device selector (Desktop/Tablet/Mobile/Responsive with dimensions), design mode toggle (pen icon, annotation count badge), settings button
- Tab bar (32px): scrollable tabs per environment (status dot, name, branch label, close X), "+ Add tab" button, context chips (linked task/MR badges)
- Preview area: responsive iframe with device frame, or empty state with config button
- Design mode overlay: drawing tools (line/box/freehand), color/thickness controls, handoff button (capture + send to agent), clear annotations
- Config dialog: add/edit environments (name, URL, branch)

### Overlay: Diff

Standalone diff view. URL: `/diff`.

- Header: back button, "Changes" title, task badge
- Branch info: "source-branch → main" with icons
- Stats: green additions count, red deletions count, file count
- Uses shared FilesChangedView (no commenting, no viewed tracking)

### Overlay: Plans

Plan/project management. URL: `/plans` with optional plan ID.

- List: plan cards with name, description, task count, contributors, last updated
- Detail: plan header, task board (kanban or table), timeline, scope
- Actions: edit, archive, duplicate

### Overlay: Sessions

Director session history/management. URL: `/sessions` with optional session ID.

- Session list with status, agent, timestamps, task associations
- Session detail: full conversation history, tool use blocks

### Overlay: Messages

Team messaging. URL: `/messages` with optional channel ID.

### Overlay: Documents

Document management. URL: `/documents` with optional doc ID.

### Overlay: Metrics

Analytics dashboard. URL: `/metrics` with optional tab param.

### Overlay: Settings

Workspace and team configuration. URL: `/settings`.

- Two-column layout: left nav (200px) with section icons, right content area
- **General** — General workspace settings
- **Notifications** — Event toggles (agent-completed, agent-error, mr-review, ci-failed, ci-passed, agent-needs-input), toast preferences (enable, auto-dismiss duration, position, play sound), external messaging integrations (Slack, Discord, Telegram with enable toggles and config fields)
- **Integrations** — Third-party integrations
- **Account** — Profile card (48px avatar, name, email), mode indicator ("Solo Mode" or "Connected to Toolco (Team)"), role display, team memberships, preferences (language, timezone)
- Team mode sections (appear below a divider):
  - **Organization** (Building2 icon) — Org header (avatar, name, plan badge: Free/Team/Enterprise), teams list (expandable, member counts), add team form, member management per team, workspace access
  - **Members** (Users icon) — Searchable table: avatar, name, email, role dropdown (admin/member/viewer), presence dot, remove button. "Invite member" button.
  - **Roles & Access** (Shield icon) — Access matrix: rows=workspaces, columns=teams/members, cells=access checkboxes

---

## Zone 4: Director Panel (right sidebar)

Collapsible, resizable right panel for AI agent chat sessions. The primary interface for human-agent interaction.

**Collapsed State (48px strip):**
- Expand button (PanelRightOpen icon) at top
- Vertical list of director session buttons: each shows initials in a circle with status dot (green=running, amber=idle, red=error) + unread count badge (top-right)
- Click expands panel and selects that session

**Expanded State:**

*Header tabs (44px):*
- Scrollable tab row: one tab per director session
  - Each tab: small status dot, short name (last word, e.g. "Alpha"), role definition name in smaller text, unread badge
  - Active tab highlighted
- "+" button to create new director
- Action buttons: Whiteboard (Presentation icon), Threads/sessions toggle (List icon), Expand cycle (Maximize2 → Expand → Minimize2, cycles contracted → 50% → full-width), Close (PanelRightClose)

*Session info bar (team mode):*
- Owner avatar + "Started by [name]"
- Connection badge: runtime name with colored icon (Local=Monitor/green, Remote=Cloud/blue, SSH=Terminal/amber)
- Viewer indicator: avatar stack (up to 3) + "{N} watching" label
- Lock toggle (owner only): Lock/Unlock icon. Locked shows "Read-only for team" tooltip.
- Non-owner locked sessions: disabled input with "This session is locked by [owner name]"
- Non-owner unlocked sessions: "Observing [owner]'s session" with "Request control" button

*Session controls:*
- Running: Stop + Restart buttons
- Stopped: Start button
- Inbox button with unread count

*Chat area (scrollable):*
- Message types:
  - **UserMessage** — user avatar, message text, timestamp
  - **AgentMessage** — bot avatar, response text with markdown rendering, timestamp
  - **ToolUseBlock** — collapsible block: tool name header, status badge (pending/running/success/error with duration), expandable input/output display
  - **SystemMessage** — subtle system-level messages
- Plan/Todo block: when latest message includes plan items, shows collapsible checklist with progress count
- Working indicator: animated dots + elapsed time + stop button
- Token counter: shows input (↑) and output (↓) token usage

*Input area:*
- Text input with placeholder "Ask a question or describe a task..."
- Team mode: "(@ to mention)" hint; @ triggers MentionAutocomplete dropdown
- Left: "+" button for attachments/files
- Right side controls:
  - Branch selector dropdown
  - Model selector dropdown (e.g. "Opus 4.6 1M")
  - Effort selector (High/Medium/Low)
  - Mode selector (Full Auto, etc.)
  - Mic button (voice input toggle)
  - Send button (arrow icon, or mic icon when voice mode active)

*Threads View (toggle):*
- Cross-director view aggregating all sessions
- Thread list: director name + role, thread title + preview text, duration + status, task change stats (+N added, ~N modified, -N deleted)
- Archive support per thread

*Resize:*
- Left-edge drag handle, col-resize cursor, highlights on hover/drag
- Width persisted to localStorage

**Team mode session split:**
- Solo mode: header shows "Sessions" flat list
- Team mode: two tabs — "My Sessions" (ownerId === currentUser.id, count badge) / "Team Sessions" (others, count badge)

---

## Zone 5a: Active Agents Strip (Tasks view only)

A dedicated status bar showing what each AI agent is currently doing. Only visible when `activeView === 'kanban'` (the Tasks page). Sits between the Main Content and the Bottom Panel within the main content column.

**Collapsed State (default, 30px):**
- Drag handle at top (4px) for resizing
- Left: "Agents" label + active count badge (e.g. "3 active")
- Agent entries in a horizontal row, each showing:
  - Status dot (green=running, red=error, gray=idle)
  - Agent initials badge (e.g. "AA")
  - Agent name (e.g. "Agent Alpha")
  - Status text ("working", "idle", "error")
  - In-progress task count (green label)
  - In-review task count (yellow label)
  - Blocked task count (red AlertCircle icon)
- Click or chevron toggles expanded state
- Expand/collapse persisted to localStorage

**Expanded State (drag-resizable, default 200px, min 80px, max 500px):**
- All collapsed info plus per-agent sections:
  - Total task count
  - Latest agent activity (tool execution or message snippet, max 80 chars)
  - Indented task rows under each agent showing: task ID, title, status with color coding, branch name (if in progress/review), active duration, agent/reviewer name, latest agent message (italicized)
- Task rows are clickable (navigates to task detail)
- Agent rows are clickable (opens director panel for that agent)
- Height persisted to localStorage
- Scrollable when content exceeds height

**Hides when:** No agents have assigned tasks (returns null).

---

## Zone 5b: Bottom Panel (Terminal)

**Collapsed State (30px bar):**
- "Terminal" button with Terminal icon
- Click or Cmd+` to expand

**Expanded State:**
- Drag handle at top (4px) for resizing (min 100px, max 60vh)
- Tab strip: "dev server", "git", "docker" tabs (closable except current), "+" to add new tab
- Preview mode: auto-adds "preview: {tab-name}" tab with console output
- Close button (ChevronDown)
- Content: monospace terminal output with colored text (green=success, gray=info, cyan=links, red=errors)
- Preview console: entries filtered by level (error=red, warn=yellow)

---

## Cross-Cutting UI Systems

### Notifications

**NotificationInbox** (bell icon dropdown, 340x440px):
- Header: "Notifications" + "Mark all read" button
- Team mode: filter tabs — All / Mentions / Assigned / Reviews
- List grouped by "Today" / "Earlier"
- Each notification: unread dot, actor avatar (team) or workspace icon, message, timestamp
- Footer: "Notification settings" link
- Types with icons: agent-completed (CheckCircle/green), agent-error (XCircle/red), mr-review (GitPullRequest/blue), ci-failed (XCircle/red), ci-passed (CheckCircle/green), agent-needs-input (Clock/orange), mention (AtSign/blue), assignment (UserPlus/blue), review-request (GitPullRequest/orange), deployment-approval (Shield/orange)

**Toast Notifications** (bottom-right stack, max 3):
- Auto-dismiss: 5s for team-change type, 8s for others; pauses on hover
- Each toast: workspace icon + name + timestamp + dismiss X, actor avatar (team) or type icon + message, "Switch" button with arrow
- Team-change type: team member avatar + action description, blue accent
- Animation: slide-in from right, slide-out on dismiss

**Conflict Banner** (inline, below TopBar, team mode only):
- AlertTriangle icon (amber) + conflict description + entity ID + local vs remote values in bold
- "Keep Mine" button (outline) + "Use Theirs" button (primary blue)
- Background: amber 6% opacity, left border: amber 30%
- Multiple conflicts stack vertically

### Command Palette (Cmd+K)

- Centered overlay (480px wide) with search input at top
- Three sections: NAVIGATION (views with Cmd+N shortcuts), TASKS (dynamic search, up to 6 matches by ID or title), ACTIONS (Create task, New workspace, Toggle terminal, Toggle theme)
- Arrow Up/Down to navigate, Enter to select, Escape to close
- Auto-scrolls active item into view

### Create Task Dialog

- Centered modal (640px, max 90vw, max 80vh) with backdrop
- Fullscreen toggle button
- Header: "SF › New task" breadcrumb
- Title input (18px bold, autofocus)
- Description textarea (multi-line, min 120px)
- Property pills row: Status, Priority, Assignee, "..." for more (Labels)
- Footer: attachment button, "Create more" toggle, "Create task" button (disabled without title)
- Enter creates (Shift+Enter for newline in description)

### Property Dropdowns (shared across cards, list rows, task detail, create dialog)

- **StatusDropdown** — All kanban columns, icons with status colors, search input, keyboard shortcuts 1-5, disabled/gated statuses show "Gated" badge
- **PriorityDropdown** — Urgent (4 bars, red), High (3, orange), Medium (2, yellow), Low (1, gray)
- **AssigneeDropdown** — Solo: agents + current user. Team: + all team members with presence dots. "No assignee" option. Optional task count badges.
- **LabelDropdown** — Multi-select checkboxes, search, color dots
- **EstimateDropdown** — 1-5 complexity scale, "No estimate" option

All dropdowns use portal-based positioning with viewport clamping.

### Shared Components

- **PresenceDot** — 6px colored circle (green=online, amber=away, gray=offline) with 1.5px border for contrast
- **UserAvatar** — Initials circle, 22px default, blue bg for current user, surface-active for others. Optional PresenceDot at bottom-right (27% of avatar size)
- **AvatarStack** — Overlapping avatars (-6px margin), max 4 then "+N" overflow badge, 2px border for separation
- **PresenceStrip** — Who's-here avatar stack for TopBar, maps users to presence entries, tooltips show view labels
- **SyncIndicator** — Status dot + label text, spinning Loader2 icon for syncing state
- **ConnectionBadge** — Pill with icon + text: Local (Monitor/green), Remote (Cloud/blue), SSH (Terminal/amber), 12% color opacity background
- **ConflictBanner** — Amber warning bar with property conflict details and resolution buttons
- **MentionAutocomplete** — Hook-based @mention system: detects `/@(\w*)$/` pattern, filters team members, arrow/enter/escape keyboard navigation, renders portal dropdown with avatar + name + role badge
- **FilesChangedView** — Shared diff viewer with file tree, unified/split modes, optional commenting/viewed tracking. Used by both MR Files Changed tab and DiffOverlay.

---

## Design Token System

### Colors (CSS custom properties, dark + light variants)

**Core palette:**
- Background: `--color-bg` (dark: #0d0d0d, light: #ffffff), `--color-bg-secondary` (#111113 / #fafafa), `--color-bg-elevated` (#161618 / #f7f7f8)
- Surface: `--color-surface` (#141416 / #f5f5f7), `--color-surface-hover`, `--color-surface-active`
- Primary: `--color-primary` (#3b82f6), `--color-primary-hover` (#2563eb), `--color-primary-subtle` (8% opacity), `--color-primary-muted` (15% opacity)
- Text: `--color-text` (#ebebeb / #111113), `--color-text-secondary` (#a0a0a5 / #6b6b70), `--color-text-tertiary` (#6b6b70 / #9b9ba0), `--color-text-accent`
- Status: `--color-success` (#22c55e), `--color-warning` (#f59e0b), `--color-danger` (#ef4444)
- Borders: `--color-border`, `--color-border-subtle`, `--color-border-focus`

**Team mode tokens:**
- Presence: `--color-presence-online` (#22c55e), `--color-presence-away` (#f59e0b), `--color-presence-offline` (#6b6b70), plus `-subtle` variants (15% opacity)
- Sync: `--color-sync-active`, `--color-sync-syncing`, `--color-sync-offline`, `--color-sync-error`
- Conflict: `--color-conflict-bg` (amber 6%), `--color-conflict-border` (amber 30%)
- Mention: `--color-mention-bg`, `--color-mention-text`
- Connection: `--color-connection-local` (green), `--color-connection-remote` (blue), `--color-connection-ssh` (amber)

### Spacing & Sizing
- Border radius: `--radius-sm` (4px), `--radius-md` (6px), `--radius-full` (9999px)
- Transitions: `--duration-fast` (100ms), `--duration-normal` (150ms), `--duration-slow` (200ms)
- Z-index layers: dropdown (1000), overlay (1040), modal (1050), command palette (1080)
- Font: Inter, 13px base, monospace for code/IDs

### Responsive Breakpoints
- **≤1200px** — Status indicators go icon-only (no labels)
- **≤900px (tablet)** — Hide secondary columns (labels, due, updated); stack task detail vertically; hide activity text in bottom bar
- **≤768px (mobile)** — Peek panel full-width; director panel full-width when expanded; activity rail narrows to 40px; hide active agents strip
- **≤500px (small)** — Hide estimate & status columns in list view; toolbar wraps to 2 rows

### Animations
- `directorDot` — 1.4s pulse for working indicator
- `ws-attention` — 2.5s pulse for workspace error state
- `agentTagPulse` — 2s pulse for unmatched agent tags
- `spin` — 1s linear infinite for loading spinners
- `slideIn`, `slideInRight` — slide + fade for panels
- `commandPaletteIn` — centered scale + opacity for command palette
- `toastEnter/toastExit` — slide from right for toast notifications
- `sessionPulse` — 2s opacity pulse for session status
- `pulse-ring` — outer glow ring effect

---

## Data Model Summary

### Core Entities

**Task** — id, title, description, status (backlog/todo/in_progress/in_review/done), priority (urgent/high/medium/low), assignee (name+avatar), labels[], estimate (1-5), dueDate, parentId, subTaskIds[], acceptanceCriteria[], branch, agentName, agentSessionId, reviewAgentName, reviewAgentSessionId, sessionStatus, ciStatus, mrStatus, blocked, activeDuration, updatedAt, planId, planName, whiteboardId, dependencyIds[], requiredAgentTags[], roleDefinitionId, requiredRoleDefinitionTags[]. Team fields: creatorId, assigneeUserId, watchers[], launchedBy, claimedBy.

**MergeRequestExtended** — id, title, description, branch, targetBranch, author, status (open/merged/closed), isDraft, ciStatus, reviewers[] (name, avatar, state), additions, deletions, filesChanged, createdAt, labels[]. Stoneforge fields: createdByAgent, agentSessionId, linkedTaskId, previewUrl, previewStatus, reviewAgentStatus/Name/SessionId, mergeStrategy, autoMergeEnabled, hasConflicts, mergeGates[]. Team: authorUserId, requestedReviewerIds[].

**CIRun** — id, runNumber, action, status, event (push/pull_request/schedule/manual/merge_group), branch, commit, commitMessage, actor, actorAvatar, createdAt, duration, jobs[] (name, status, steps[], annotations[]), artifacts[]. Stoneforge fields: triggeredByAgent/AgentId, linkedTaskId, linkedMRId, triggeredByWorkflowId/Name. Team: actorUserId, approvalGates.

**Workflow** — id, name, description, status (active/disabled/error/draft), steps[] (agent/script), trigger (cron/event/manual/webhook), variables[], totalRuns, lastRunAt/Status, createdBy, tags[], linkedCIActionId. Team: createdByUserId, scope (personal/team), approvalRequired, approvalUsers[].

**AgentExtended** — id, name, tags[], model, provider, environment (local/cloud), runtimeId, status (running/idle/error/starting), sessions[], config, lastActiveAt, totalUptime, totalTasksCompleted, errorRate, maxConcurrentTasks, spawnPriority, enabled, recentActivity[]. Team: ownerUserId.

**Runtime** — id, name, hostId, mode (worktrees/docker/sandbox), isDefault, status (online/offline/error/provisioning), worktreePath, dockerImage, sandboxTier, assignedAgentCount, assignedAgentIds[].

**RoleDefinition** — id, name, description, rolePrompt, systemPromptOverride, tags[], category, defaultTools[], customTools[], skills[], hooks[], builtIn, createdAt, updatedAt.

**DirectorSession** — id, name, agentId, roleDefinitionId, status (running/idle/error/connecting), unreadCount, lastMessage. Team: ownerId, connectionType (local/remote/ssh), runtimeId, viewers[], locked.

**StoneforgeUser** — id, name, avatar (initials), email, role (admin/member/viewer), presence (online/away/offline).

**StoneforgeOrg** — id, name, plan (free/team/enterprise), members[], teams[].

**WorkspaceInfo** — id, name, icon, repo, status (active/idle/needs-attention/error), agentCount, runningAgents, task metrics (running/review/blocked/completedSinceLastVisit). Team: teamId, accessUserIds[].

**WorkspaceDaemonState** — hostId, status (running/stopped/error), startedAt, uptimeSeconds.

---

## Interaction Patterns

**Unified parent page headers** — All parent/list pages (Tasks, Merge Requests, CI/CD, Automations, Agents, Preview) share the same toolbar pattern: no back button, `8px 16px` padding, `13px/600` title, `borderBottom: 1px solid var(--color-border-subtle)`, `26px` button heights, inline filter pills. Sub-pages (MR detail, CI run detail, Task detail) have back buttons.

**Dropdown positioning** — All dropdowns use portal-based rendering, z-index 1060, click-outside-to-close, viewport edge clamping.

**Team-mode demo timers** — When toggling to team mode, useEffect timers fire: 7s sync pulse (syncing → synced), 12s incoming change toast, 20s conflict item. Timers clear on mode switch or unmount.

**State gating** — Task statuses can be gated by acceptance criteria (shows "Gated" badge with disabled state). Merge flow gates: CI checks, approval count, no conflicts, review agent approved.

**Agent-task lifecycle** — Tasks link to director sessions, worker sessions, reviewer sessions, CI runs, MRs, and preview environments. The "Stoneforge" section in task detail shows the full execution chain. The dispatch daemon (one per workspace) orchestrates autonomous agent lifecycles from a designated runtime host.
