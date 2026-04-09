# Dashboard Guide

A complete reference for navigating and using the Stoneforge dashboard.

## URL & Layout

**Main Dashboard:** http://localhost:3457

The dashboard has a **left sidebar** (navigation) and **main content area**. At the top is the **Director Panel** (right sidebar) where you can give strategic instructions.

---

## Main Sections

### 📊 Overview

**What it shows:**
- Live activity feed (tasks completed, agents working, events)
- Inbox (messages and notifications)
- Quick editor (inline code editing for urgent changes)
- System health (uptime, sync status, agent availability)

**Use when:**
- You want a quick bird's-eye view of what's happening
- You need to respond to an agent message
- You're just checking in

---

### ✅ Work

The hub for all tasks and projects.

#### Tasks
- **List view:** All tasks, filterable by status (open, in_progress, blocked, completed)
- **Kanban view:** Cards organized by status (like Trello)
- **Create:** Click **+ New Task**
  - Title (required)
  - Type: Feature, Bug, Task, Chore
  - Priority: 1 (critical) to 5 (minimal)
  - Description (optional, creates a linked document)

**Common filters:**
- Status: `open` (ready for agents), `in_progress` (someone's working), `blocked` (waiting on something)
- Assignee: Filter by agent
- Priority: 1-5

#### Plans
- **Create a plan:** Group related tasks together
  - Tasks in a plan can have dependencies
  - Plans start in "draft" mode (tasks not yet dispatched)
  - Activate the plan to let the dispatch daemon assign tasks
- **Use case:** "Q1 Feature Roadmap" with 10 related tasks
- Plans help prevent agents from grabbing incomplete dependencies

#### Merge Requests
- **Auto-generated:** When a worker finishes a task, a merge request appears here
- **Review queue:** See what's waiting to merge
- **Steward handles merging:** The Merge Steward tests and auto-merges passing MRs
- You can manually review/reject if needed

#### Workflows
- **Create from playbooks:** Choose a template (feature-development, bug-fix, refactoring)
- **Fill in variables:** e.g., `feature_name="Dark mode"`, `package="ui"`
- **Automatic expansion:** Workflow creates a sequence of ordered tasks with dependencies
- **Track progress:** See which steps are done, in progress, blocked

---

### 🤖 Orchestration

Monitor and manage your agent team.

#### Agents
- **List view:** All agents (Director, Workers, Stewards)
- **Status:** idle, running, suspended, terminated
- **Actions:**
  - **Register agent:** Add new worker or steward
  - **Start agent:** Spawn an interactive session
  - **Stop agent:** Gracefully shut down
  - **Stream output:** Watch live console output

**Agent types:**
- **Director** (1): Plans work, creates tasks, sets priorities
- **Workers** (multiple): Execute tasks in isolated git branches
- **Stewards** (1+): Merge code, fix docs, recover stuck tasks

#### Stewards
- **Tab shows:** Only Steward agents and their focus areas
- **Merge Steward:** Tests and merges completed PRs
- **Docs Steward:** Scans docs and fixes issues
- **Recovery Steward:** Cleans up orphaned tasks and worktrees

#### Pools
- **Group workers by capability:** e.g., "frontend-team", "backend-team"
- **Advanced:** Assign specific tasks to specific worker pools
- **Default:** All workers in default pool

#### Graph
- **Visualize dependencies:** See task dependency relationships as a network
- **Click nodes:** Jump to task details
- **Find blockers:** Identify what's preventing progress

---

### 💬 Collaborate

Communication and knowledge sharing.

#### Messages
- **Channels:** Topic-based discussions
  - `#general` (default)
  - `#agent-announcements` (from agents)
  - Create custom channels for teams
- **Direct messages:** Agent-to-agent or you-to-agent communication
- **Threading:** Organize long conversations
- **Triage inbox:** Route incoming agent messages

**Use case:** Agent asks a clarification question → you respond in the channel → agent picks up answer and continues working

#### Documents
- **Shared knowledge base:** Architecture docs, design decisions, runbooks
- **Versioning:** See edit history
- **FTS search:** Find anything with full-text search
- **Semantic search:** Find by meaning, not exact keywords
- **Create:** Click **+ New Document**
  - Title
  - Content (markdown)
  - Tags (optional)

**Good documents to create:**
- Architecture overview
- Coding standards
- API documentation
- Runbook for common tasks

---

### 📈 Analytics

Progress and performance metrics.

- **Task throughput:** How many tasks completed per day/week
- **Agent efficiency:** Average time per task by agent
- **Queue health:** How many tasks are blocked vs. ready
- **Time to merge:** Average time from task start to merge
- **Burndown:** Visual progress toward completion

**Use when:** You want to understand team velocity or identify bottlenecks

---

## Director Panel (Right Sidebar)

The **Director Panel** lets you give strategic instructions:

- **Tell Director goals:** "Implement user authentication system"
- **Set context:** Upload codebase docs, architecture diagrams
- **Adjust priorities:** Bump a task's priority on the fly
- **Cancel/defer tasks:** Pause work temporarily
- **Review plans:** See what the Director proposed

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` (Mac) / `Ctrl+K` (Linux/Windows) | Command palette (search tasks, jump to agent, etc.) |
| `N` | New task |
| `W` | Jump to Work section |
| `O` | Jump to Orchestration |
| `/` | Focus search |

---

## Common Workflows

### "I want to create a feature"
1. Go to **Work** → **Tasks**
2. Click **+ New Task**
3. Title: "Implement feature X"
4. Type: Feature, Priority: 2-3
5. Save → agents pick it up automatically

### "I want to batch create related tasks"
1. Go to **Work** → **Plans**
2. Click **+ New Plan**
3. Give it a name ("Dark Mode Feature", etc.)
4. In the plan, create multiple tasks
5. Add dependencies (task A blocks task B)
6. Click **Activate Plan** → dispatch daemon starts assigning tasks

### "I want to run a complex workflow"
1. Go to **Work** → **Workflows**
2. Click **+ New Workflow**
3. Choose a playbook template
4. Fill in variables
5. Save → tasks are created with automatic dependencies

### "I want to monitor progress"
1. Go to **Orchestration** → **Agents**
2. Click on a worker's name
3. Watch **live output** as they work
4. Check **Orchestration** → **Graph** to see dependency status

### "My task is taking too long"
1. Go to **Work** → **Tasks**
2. Find the task, click it
3. In the **Activity** tab, see what the agent is doing
4. If stuck, click **Send Message** to nudge the agent
5. Or go to **Orchestration** → **Agents**, find the worker, click **Stream** to see real-time output

---

## Settings

Click **⚙️** (bottom left) to configure:

- **Theme:** Light/Dark mode
- **Notifications:** Email/browser notifications for events
- **Sync:** Auto-sync interval (default: 1 second for live updates)
- **Export:** Download task data as JSON/CSV

---

## Tips & Tricks

1. **Use tags:** Tag related tasks (`#feature`, `#bug`, `#ui`) for easy filtering
2. **Add context:** Write detailed task descriptions; agents use them to understand your intent
3. **Create documents:** Write architecture docs and design specs; agents reference them
4. **Watch the activity feed:** Gives you insights into what agents are thinking
5. **Use playbooks:** Don't create tasks manually every time; use workflow playbooks for recurring patterns
6. **Monitor your agents:** Check the Agents page occasionally to ensure they're healthy
7. **Create channels:** Use channels to discuss work with your team and agents

---

## Next Steps

- **Try it:** Follow [Your First Task](FIRST_TASK.md) tutorial
- **Learn CLI:** Check [Setup Guide](SETUP_GUIDE.md) for advanced configuration
- **Deep dive:** Read [Stoneforge README](README.md) for architecture and design philosophy
