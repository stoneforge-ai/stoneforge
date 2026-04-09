# Getting Started with Stoneforge

Set up your multi-agent development command center.

---

## What You Need

| Requirement | How to install |
|-------------|----------------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org/) — download the LTS version, run the installer |
| **Claude Code** | Open a terminal and run: `npm install -g @anthropic-ai/claude-code` |
| **Claude account** | Sign up at [claude.ai](https://claude.ai/) — you need a MAX or Pro plan |

---

## Option A: Download Pre-Built (Easiest — Windows)

1. Go to the [Releases page](https://github.com/stoneforge-ai/stoneforge/releases)
2. Download **stoneforge-windows.zip**
3. Extract the ZIP to a folder (right-click > Extract All)
4. Double-click **launch.bat**
5. The dashboard opens automatically in your browser

**That's it.** No terminal, no build, no git.

---

## Option B: Install from Source (Mac / Linux / Windows)

### Step 1: Download

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

The script installs dependencies, builds the project, and creates the `sf` command. Takes 2-3 minutes.

> **Windows users:** After setup.bat finishes, close your terminal and open a new one.

### Step 3: Launch

**Mac / Linux:**
```bash
sf serve
```

**Windows:** Double-click **launch.bat** in the stoneforge folder.

Open **http://localhost:3457** in your browser.

---

## Create Your First Task

1. Go to **Work** > **Tasks** in the dashboard
2. Click **+ New Task**
3. Fill in:
   - **Title**: Something like "Add dark mode toggle"
   - **Type**: Feature
   - **Priority**: 3 (Medium)
4. Click **Save**

Your agents will automatically pick it up. Watch the **Activity** page to see progress.

---

## Troubleshooting

### Dashboard doesn't open
Make sure Node.js is installed. Go to [nodejs.org](https://nodejs.org/), download and install the LTS version.

### Agents aren't picking up tasks
Claude Code must be installed and signed in. Open a terminal and run:
```
claude --version
claude
```
The second command will prompt you to sign in if needed.

### "sf: command not found" (Mac/Linux)
Run `./sf serve` instead (with `./` in front), from the stoneforge folder.

---

## Next Steps

- **[Your First Task](FIRST_TASK.md)** — Step-by-step tutorial
- **[Dashboard Guide](DASHBOARD_GUIDE.md)** — Learn every feature in the web UI
- **[Setup Guide](SETUP_GUIDE.md)** — Advanced configuration (custom agents, prompts, playbooks)
