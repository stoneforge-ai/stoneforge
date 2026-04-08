# Your First AI-Powered Workflow

Learn how to create and execute your first multi-agent task — entirely through the web dashboard.

## Before You Start

Make sure these are all true before continuing:

- [ ] You ran `./setup.sh` (see [Getting Started](GETTING_STARTED.md))
- [ ] Claude Code is installed: run `claude --version` in your terminal
- [ ] You're signed in to Claude: run `claude` and follow the prompts if needed
- [ ] The server is running: run `sf serve` in a terminal (leave it open)
- [ ] Dashboard is open: go to **http://localhost:3457** in your browser

If any of these fail, see [Getting Started — Troubleshooting](GETTING_STARTED.md#troubleshooting).

---

## Scenario: Add Dark Mode to Your App

We'll walk through creating a feature task and watching your agent team execute it.

### Step 1: Open the Dashboard

Go to **http://localhost:3457** in your browser. You should see the Stoneforge dashboard.

### Step 2: Create the Task

1. Click **Work** → **Tasks**
2. Click **+ New Task** (top right)
3. Fill in the form:
   - **Title:** `Add dark mode toggle to settings page`
   - **Type:** Feature
   - **Priority:** 3 (Medium)
   - **Description:** _(optional)_ `Add a toggle switch in the Settings page that lets users switch between light and dark themes. Update the color variables in tailwind.config.js and save the preference to localStorage.`

4. Click **Save**

You've now created task `el-xxxxx` (ID will be shown). Your agents see this immediately.

### Step 3: Watch the Dispatch Happen

Go to **Orchestration** → **Agents**

- Your **Director** agent plans the work and breaks it down
- An **Ephemeral Worker** (e.g., `e-worker-1`) picks up the task automatically
- Status changes: `open` → `assigned` → `in_progress`

### Step 4: Monitor in Real-Time

Click on the worker's name to see **live output**. You'll see:
- Worker checking out a git branch
- Analyzing your codebase
- Writing implementation code
- Running tests
- Committing and pushing changes

### Step 5: Review & Merge (Steward)

When the worker finishes:
1. The **Merge Steward** (`m-steward-1`) automatically runs tests
2. If tests pass → squash-merges to main branch automatically
3. Task status changes to `merged`

Go to **Work** → **Merge Requests** to see the auto-merged PR.

### Step 6: Check Your Code

In your repo, you'll see:
- New branch: `agent/e-worker-1/el-xxxxx-add-dark-mode`
- Changes already merged to main
- Commit message from the worker with context

## Understanding What Happened

| Step | Who | What |
|------|-----|------|
| You create task | You | Define the work |
| Director plans | Director agent | Breaks down into smaller tasks if needed |
| Worker executes | Worker agent | Writes code, tests, commits |
| Steward reviews | Merge Steward | Tests code, auto-merges if passing |

All of this happened **automatically** without you writing code or merging anything.

## Multiple Tasks in Parallel

Want to see the power? Create 3 tasks at once:

1. Create **Task A:** "Implement feature flag system"
2. Create **Task B:** "Add analytics tracking"
3. Create **Task C:** "Refactor auth service"

Each worker picks up a different task. All 3 execute **in parallel**. Watch them in real-time on the **Orchestration** → **Agents** page.

The **Merge Steward** handles merging them in the right order without conflicts—even if both tasks edit the same file.

## Creating Workflows (Advanced)

For more complex work with dependencies, use **Workflows**:

1. Go to **Work** → **Workflows**
2. Click **+ New Workflow**
3. Choose a playbook template:
   - `feature-development` — Planned feature work
   - `bug-fix` — Reproduce → fix → verify
   - `refactoring` — Audit → refactor → validate
4. Fill in variables (e.g., `feature_name="Dark Mode"`, `package="ui"`)
5. Click **Create**

The workflow creates a sequence of tasks with dependencies. Workers execute them in order, and the Steward ensures proper merging.

## Key Takeaway

The dashboard is your **control center**. You:
- Click to create work
- Watch real-time progress
- Don't touch the CLI

Your agents handle everything else.

---

---

## Troubleshooting

### Task stays "open" and no agent picks it up

1. **Is Claude Code installed?** Run `claude --version` in your terminal. If not found, install it: `npm install -g @anthropic-ai/claude-code`
2. **Are you signed in?** Run `claude` — it will prompt you to sign in if needed.
3. **Are agents registered?** Run `sf agent list` in a new terminal. You should see a director, workers, and a steward.
4. **Is the Director running?** The Director needs to be started first. In the dashboard, go to the **Director Panel** (right sidebar) and start it, or run `sf agent start director` in your terminal.

### Dashboard is blank or won't load

Make sure `sf serve` is still running in your terminal. If it crashed, restart it.

### Worker seems stuck

Click on the worker's name in **Orchestration** > **Agents** to see its live output. If it's genuinely stuck, you can stop it with `sf agent stop <id>` and the task will be re-dispatched to another worker.

---

**Next:** [Explore the Dashboard](DASHBOARD_GUIDE.md) to learn all available features.
