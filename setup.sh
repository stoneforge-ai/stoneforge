#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Stoneforge Setup Script
# One command to install, build, and initialize Stoneforge.
#
# Usage:
#   git clone https://github.com/stoneforge-ai/stoneforge.git
#   cd stoneforge
#   ./setup.sh
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[info]${NC}  $1"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $1"; }
fail()  { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Stoneforge Setup               ║${NC}"
echo -e "${BOLD}║  Multi-Agent Orchestration Platform   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# --------------------------------------------------------------------------
# Step 1: Check Node.js
# --------------------------------------------------------------------------
info "Checking Node.js..."

if ! command -v node &>/dev/null; then
  fail "Node.js is not installed.
  Install it from: https://nodejs.org/
  You need version 18 or higher."
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js version 18+ required. You have $(node -v).
  Update from: https://nodejs.org/"
fi
ok "Node.js $(node -v)"

# --------------------------------------------------------------------------
# Step 2: Check git
# --------------------------------------------------------------------------
info "Checking git..."

if ! command -v git &>/dev/null; then
  fail "Git is not installed.
  Install it from: https://git-scm.com/"
fi
ok "git $(git --version | awk '{print $3}')"

# --------------------------------------------------------------------------
# Step 3: Install pnpm (if needed)
# --------------------------------------------------------------------------
info "Checking pnpm..."

if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing..."
  npm install -g pnpm@8
  if ! command -v pnpm &>/dev/null; then
    fail "Failed to install pnpm. Try manually: npm install -g pnpm"
  fi
fi
ok "pnpm $(pnpm --version)"

# --------------------------------------------------------------------------
# Step 4: Install dependencies
# --------------------------------------------------------------------------
info "Installing dependencies (this may take a minute)..."
pnpm install --reporter=silent 2>&1 | tail -3
ok "Dependencies installed"

# --------------------------------------------------------------------------
# Step 5: Build all packages
# --------------------------------------------------------------------------
info "Building packages (this may take 1-2 minutes)..."
pnpm build 2>&1 | tail -3
ok "Build complete"

# --------------------------------------------------------------------------
# Step 6: Create sf command
# --------------------------------------------------------------------------
info "Setting up sf command..."

SF_BIN="$(pwd)/packages/smithy/dist/bin/sf.js"

if [ ! -f "$SF_BIN" ]; then
  fail "Build did not produce sf CLI at $SF_BIN"
fi

# Create a wrapper script in a standard location
SF_WRAPPER="/usr/local/bin/sf"
if [ -w "/usr/local/bin" ]; then
  cat > "$SF_WRAPPER" << WRAPPER
#!/usr/bin/env bash
exec node "$SF_BIN" "\$@"
WRAPPER
  chmod +x "$SF_WRAPPER"
  ok "sf command installed to /usr/local/bin/sf"
else
  # Fall back to creating in the repo
  SF_WRAPPER="$(pwd)/sf"
  cat > "$SF_WRAPPER" << WRAPPER
#!/usr/bin/env bash
exec node "$SF_BIN" "\$@"
WRAPPER
  chmod +x "$SF_WRAPPER"
  warn "Could not write to /usr/local/bin (no permissions)."
  warn "Created ./sf wrapper instead. Add to your PATH or run: sudo ./setup.sh"
  ok "sf command available at ./sf"
fi

# --------------------------------------------------------------------------
# Step 7: Initialize workspace
# --------------------------------------------------------------------------
info "Initializing Stoneforge workspace..."

if [ -f ".stoneforge/stoneforge.db" ]; then
  ok "Workspace already initialized"
else
  node "$SF_BIN" init 2>&1 | head -5
  ok "Workspace initialized"
fi

# --------------------------------------------------------------------------
# Step 8: Check for Claude Code (optional but recommended)
# --------------------------------------------------------------------------
echo ""
if command -v claude &>/dev/null; then
  ok "Claude Code CLI detected"
else
  warn "Claude Code is NOT installed."
  echo ""
  echo -e "  Agents need Claude Code to run. Install it:"
  echo ""
  echo -e "    ${BOLD}npm install -g @anthropic-ai/claude-code${NC}"
  echo ""
  echo -e "  Then sign in with your Claude account."
  echo -e "  Get a subscription at: https://claude.ai/settings/billing"
  echo ""
fi

# --------------------------------------------------------------------------
# Done!
# --------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo -e "  ${BOLD}Start the dashboard:${NC}"
echo ""
echo -e "    sf serve"
echo ""
echo -e "  Then open ${BOLD}http://localhost:3457${NC} in your browser."
echo ""
echo -e "  ${BOLD}What's next:${NC}"
echo -e "  1. Open the dashboard"
echo -e "  2. Go to Work → Tasks → + New Task"
echo -e "  3. Create a task and watch your agents work"
echo ""
echo -e "  Read more: ${BLUE}GETTING_STARTED.md${NC}"
echo ""
