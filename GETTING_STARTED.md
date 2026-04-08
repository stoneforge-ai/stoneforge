# Getting Started with Stoneforge

Set up your multi-agent development command center.

---

## What You Need

Before starting, make sure you have these installed:

| Requirement | How to check | How to install |
|-------------|-------------|----------------|
| **Node.js 18+** | `node -v` | [nodejs.org](https://nodejs.org/) — download the LTS version |
| **Git** | `git --version` | [git-scm.com](https://git-scm.com/) |
| **Claude Code** | `claude --version` | `npm install -g @anthropic-ai/claude-code` |
| **Claude account** | Sign in to claude.ai | [claude.ai/settings/billing](https://claude.ai/settings/billing) — you need MAX or a Pro plan |

**Claude Code** is the AI coding assistant that powers Stoneforge's agents. Without it, agents can't run.

---

## Install (2 Steps)

### Step 1: Download Stoneforge

```bash
git clone https://github.com/stoneforge-ai/stoneforge.git
cd stoneforge
```

### Step 2: Run the setup script

**Mac / Linux:**
```bash
./setup.sh
```

**Windows (Command Prompt):**
```
setup.bat
```

This single script handles everything:
- Installs pnpm (the package manager Stoneforge needs)
- Downloads all dependencies
- Builds the project
- Creates the `sf` command
- Initializes your workspace with default agents

**It takes 2-3 minutes.** When it finishes, you'll see "Setup complete!"

> **Windows users:** After `setup.bat` finishes, **close your terminal and open a new one**. This is needed so Windows can find the `sf` command.

---

## Start the Dashboard

```bash
sf serve
```

Open your browser to **http://localhost:3457**

You should see the Stoneforge dashboard with these sections:
- **Tasks** — Create work for your agents
- **Agents** — See who's running (Director, Workers, Steward)
- **Activity** — Watch agents work in real-time
- **Workflows** — Combine tasks into automated processes

---

## Create Your First Task

1. Go to **Work** > **Tasks**
2. Click **+ New Task**
3. Fill in:
   - **Title**: Something like "Add dark mode toggle"
   - **Type**: Feature
   - **Priority**: 3 (Medium)
4. Click **Save**

Your agents will automatically pick it up. Watch the **Activity** page to see progress.

---

## Troubleshooting

### "sf: command not found"
The setup script creates the `sf` command. If it couldn't write to `/usr/local/bin`, use `./sf` instead (from the stoneforge directory).

### Agents aren't picking up tasks
Make sure Claude Code is installed and you're signed in:
```bash
claude --version      # Should show a version number
claude                # If not signed in, this will prompt you
```

### Dashboard won't load
Check that the server is running. Run `sf serve` and look for errors. The dashboard runs at http://localhost:3457.

### Build fails
Make sure you have Node.js 18+:
```bash
node -v   # Must be v18.x.x or higher
```

---

## Next Steps

- **[Your First Task](FIRST_TASK.md)** — Step-by-step tutorial creating and watching a task
- **[Dashboard Guide](DASHBOARD_GUIDE.md)** — Learn every feature in the web UI
- **[Setup Guide](SETUP_GUIDE.md)** — Advanced configuration (custom agents, prompts, playbooks)
