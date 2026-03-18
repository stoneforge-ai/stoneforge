#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# stoneforge-boss.sh
# Master controller for all Stoneforge workspaces.
# Starts, stops, monitors, and handles port conflicts.
#
# Configuration is loaded from external config files rather than hardcoded.
# See: stoneforge-boss init
# ============================================================================

BOSS_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# XDG-compliant config and state directories
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/stoneforge-boss"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/stoneforge-boss"
WORKSPACES_CONF="$CONFIG_DIR/workspaces.conf"

mkdir -p "$CONFIG_DIR" "$STATE_DIR"

# Auto-detect feed and sync scripts relative to this script
FEED_SCRIPT="${FEED_SCRIPT:-$BOSS_SCRIPT_DIR/../../apps/feed/start.sh}"
SYNC_SCRIPT="${SYNC_SCRIPT:-$BOSS_SCRIPT_DIR/../../apps/feed/sync.sh}"
FEED_DEFAULT_PORT=8080

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ---- Config Loading ----

load_workspaces() {
  WORKSPACES=()
  if [ ! -f "$WORKSPACES_CONF" ]; then
    return
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    WORKSPACES+=("$line")
  done < "$WORKSPACES_CONF"
}

load_workspaces

# ---- Helpers ----

# Safe config reader — parses KEY=VALUE without sourcing as bash
safe_read_conf() {
  local file="$1" key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//"
}

# Check if Docker (with compose) is available
has_docker() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

get_field() { echo "$1" | cut -d'|' -f"$2"; }

pid_file() { echo "$STATE_DIR/$1.pid"; }
port_file() { echo "$STATE_DIR/$1.port"; }
log_file() { echo "$STATE_DIR/$1.log"; }

is_running() {
  local pf
  pf=$(pid_file "$1")
  [ -f "$pf" ] || return 1
  local content
  content=$(cat "$pf")
  if [ "$content" = "docker" ]; then
    # Docker sentinel — check if feed container is running
    local feed_dir
    feed_dir="$(cd "$BOSS_SCRIPT_DIR/../../apps/feed" 2>/dev/null && pwd)"
    [ -n "$feed_dir" ] && docker compose -f "$feed_dir/docker-compose.yml" ps --status running 2>/dev/null | grep -q "feed" 2>/dev/null
  else
    kill -0 "$content" 2>/dev/null
  fi
}

get_pid() {
  local pf
  pf=$(pid_file "$1")
  [ -f "$pf" ] && cat "$pf" || echo ""
}

get_port() {
  local pf
  pf=$(port_file "$1")
  [ -f "$pf" ] && cat "$pf" || echo ""
}

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

find_free_port() {
  local port="$1"
  local max_tries=20
  local i=0
  while port_in_use "$port" && [ $i -lt $max_tries ]; do
    echo "[port] $port in use, trying $((port + 1))" >&2
    port=$((port + 1))
    i=$((i + 1))
  done
  if [ $i -ge $max_tries ]; then
    echo "0"
  else
    echo "$port"
  fi
}

# ---- Commands ----

cmd_init() {
  echo -e "${BOLD}Initializing stoneforge-boss configuration${NC}"
  echo ""

  mkdir -p "$CONFIG_DIR" "$STATE_DIR"

  if [ ! -f "$WORKSPACES_CONF" ]; then
    cat > "$WORKSPACES_CONF" <<'CONF'
# Stoneforge Boss — Workspace Registry
# Format: name|script_path|default_port
# Example:
# myproject|/path/to/start-sf-myproject.sh|3457
CONF
    echo -e "${GREEN}Created${NC} $WORKSPACES_CONF"
  else
    echo -e "${DIM}Already exists:${NC} $WORKSPACES_CONF"
  fi

  local sync_config="$CONFIG_DIR/sync.conf"
  if [ ! -f "$sync_config" ]; then
    cat > "$sync_config" <<'CONF'
# Sync configuration for stoneforge-boss
# SYNC_REMOTE_URL="https://your-feed.up.railway.app"
# SYNC_AUTH_TOKEN="your-secret-token"
# SYNC_INTERVAL="5"
CONF
    echo -e "${GREEN}Created${NC} $sync_config"
  else
    echo -e "${DIM}Already exists:${NC} $sync_config"
  fi

  local remote_config="$CONFIG_DIR/remote.conf"
  if [ ! -f "$remote_config" ]; then
    cat > "$remote_config" <<'CONF'
# Remote deployment configuration
# REMOTE_PROVIDER="railway"        # railway or git
# REMOTE_URL="https://your-feed.up.railway.app"
# REMOTE_AUTH_TOKEN="your-secret-token"
# GIT_REMOTE="origin"              # for git provider
CONF
    echo -e "${GREEN}Created${NC} $remote_config"
  else
    echo -e "${DIM}Already exists:${NC} $remote_config"
  fi

  echo ""
  echo "Config directory: $CONFIG_DIR"
  echo "State directory:  $STATE_DIR"
  echo ""
  echo "Next steps:"
  echo "  1. stoneforge-boss local                      # run locally"
  echo "  2. stoneforge-boss remote config <url> <token> # configure remote"
  echo "  3. stoneforge-boss remote                     # deploy + sync"
}

cmd_register() {
  local name="${1:-}"
  local script="${2:-}"
  local port="${3:-}"

  if [ -z "$name" ] || [ -z "$script" ] || [ -z "$port" ]; then
    echo "Usage: stoneforge-boss register <name> <script_path> <port>"
    echo ""
    echo "Example:"
    echo "  stoneforge-boss register myproject /path/to/start-sf-myproject.sh 3457"
    return 1
  fi

  # Check if already registered
  if [ -f "$WORKSPACES_CONF" ] && grep -q "^${name}|" "$WORKSPACES_CONF"; then
    echo -e "${YELLOW}[$name]${NC} Already registered. Updating..."
    # Remove old entry
    local tmp
    tmp=$(mktemp)
    grep -v "^${name}|" "$WORKSPACES_CONF" > "$tmp"
    mv "$tmp" "$WORKSPACES_CONF"
  fi

  echo "${name}|${script}|${port}" >> "$WORKSPACES_CONF"
  echo -e "${GREEN}[$name]${NC} Registered: $script (port $port)"

  # Reload
  load_workspaces
}

cmd_unregister() {
  local name="${1:-}"

  if [ -z "$name" ]; then
    echo "Usage: stoneforge-boss unregister <name>"
    return 1
  fi

  if [ ! -f "$WORKSPACES_CONF" ] || ! grep -q "^${name}|" "$WORKSPACES_CONF"; then
    echo -e "${RED}[$name]${NC} Not registered"
    return 1
  fi

  local tmp
  tmp=$(mktemp)
  grep -v "^${name}|" "$WORKSPACES_CONF" > "$tmp"
  mv "$tmp" "$WORKSPACES_CONF"
  echo -e "${RED}[$name]${NC} Unregistered"

  # Reload
  load_workspaces
}

cmd_start() {
  local target="${1:-all}"

  # "start feed" is a shortcut
  if [ "$target" = "feed" ]; then
    cmd_feed_start
    return
  fi

  if [ ${#WORKSPACES[@]} -eq 0 ]; then
    echo -e "${YELLOW}No workspaces registered.${NC}"
    echo "Run: stoneforge-boss register <name> <script> <port>"
    echo "Or:  stoneforge-boss init"
    return
  fi

  for ws in "${WORKSPACES[@]}"; do
    local name script default_port
    name=$(get_field "$ws" 1)
    script=$(get_field "$ws" 2)
    default_port=$(get_field "$ws" 3)

    [ "$target" != "all" ] && [ "$target" != "$name" ] && continue

    if is_running "$name"; then
      echo -e "${YELLOW}[$name]${NC} Already running (PID $(get_pid "$name"), port $(get_port "$name"))"
      continue
    fi

    if [ ! -x "$script" ]; then
      echo -e "${RED}[$name]${NC} Script not found or not executable: $script"
      continue
    fi

    # Find a free port
    local port
    port=$(find_free_port "$default_port")
    if [ "$port" = "0" ]; then
      echo -e "${RED}[$name]${NC} No free port found near $default_port"
      continue
    fi
    if [ "$port" != "$default_port" ]; then
      echo -e "${YELLOW}[$name]${NC} Port $default_port busy, using $port"
    fi

    # Start in background
    local lf
    lf=$(log_file "$name")
    nohup "$script" --port "$port" > "$lf" 2>&1 &
    local pid=$!

    echo "$pid" > "$(pid_file "$name")"
    echo "$port" > "$(port_file "$name")"

    # Brief pause to check it didn't die immediately
    sleep 0.5
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "${GREEN}[$name]${NC} Started (PID $pid, port $port)"
    else
      echo -e "${RED}[$name]${NC} Failed to start. Check $(log_file "$name")"
      rm -f "$(pid_file "$name")" "$(port_file "$name")"
    fi
  done
}

cmd_stop() {
  local target="${1:-all}"

  # "stop feed" shortcut
  if [ "$target" = "feed" ]; then
    cmd_feed_stop
    return
  fi

  # "stop sync" shortcut
  if [ "$target" = "sync" ]; then
    cmd_sync_stop
    return
  fi

  # stop all includes feed and sync
  if [ "$target" = "all" ]; then
    cmd_feed_stop
    cmd_sync_stop
  fi

  for ws in "${WORKSPACES[@]}"; do
    local name
    name=$(get_field "$ws" 1)

    [ "$target" != "all" ] && [ "$target" != "$name" ] && continue

    if ! is_running "$name"; then
      echo -e "${DIM}[$name]${NC} Not running"
      rm -f "$(pid_file "$name")" "$(port_file "$name")"
      continue
    fi

    local pid
    pid=$(get_pid "$name")

    # Kill the process tree (the launcher uses exec, so this gets sf serve too)
    kill "$pid" 2>/dev/null
    # Wait briefly then force if needed
    local i=0
    while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do
      sleep 0.3
      i=$((i + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi

    rm -f "$(pid_file "$name")" "$(port_file "$name")"
    echo -e "${RED}[$name]${NC} Stopped"
  done
}

cmd_restart() {
  local target="${1:-all}"
  cmd_stop "$target"
  sleep 1
  cmd_start "$target"
}

cmd_status() {
  echo ""
  echo -e "${BOLD}  Stoneforge Boss — Workspace Status${NC}"
  echo -e "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  printf "  ${BOLD}%-15s %-10s %-8s %-7s %-40s${NC}\n" "WORKSPACE" "STATUS" "PID" "PORT" "DASHBOARD"
  echo "  $(printf '%.0s-' {1..85})"

  if [ ${#WORKSPACES[@]} -eq 0 ]; then
    echo -e "  ${DIM}No workspaces registered. Run: stoneforge-boss init${NC}"
  fi

  for ws in "${WORKSPACES[@]}"; do
    local name script default_port
    name=$(get_field "$ws" 1)
    script=$(get_field "$ws" 2)
    default_port=$(get_field "$ws" 3)

    if is_running "$name"; then
      local pid port
      pid=$(get_pid "$name")
      port=$(get_port "$name")
      printf "  ${GREEN}%-15s %-10s %-8s %-7s${NC} ${CYAN}http://localhost:%-5s${NC}\n" \
        "$name" "RUNNING" "$pid" "$port" "$port"
    else
      printf "  ${DIM}%-15s %-10s %-8s %-7s %-40s${NC}\n" \
        "$name" "STOPPED" "-" "$default_port" "-"
      # Clean stale pid files
      rm -f "$(pid_file "$name")" "$(port_file "$name")"
    fi
  done

  # Feed status
  echo "  $(printf '%.0s-' {1..85})"
  if is_running "feed"; then
    local pid port
    pid=$(get_pid "feed")
    port=$(get_port "feed")
    printf "  ${GREEN}%-15s %-10s %-8s %-7s${NC} ${CYAN}http://localhost:%-5s${NC}\n" \
      "feed" "RUNNING" "$pid" "$port" "$port"
  else
    printf "  ${DIM}%-15s %-10s %-8s %-7s %-40s${NC}\n" \
      "feed" "STOPPED" "-" "$FEED_DEFAULT_PORT" "-"
    rm -f "$(pid_file "feed")" "$(port_file "feed")"
  fi

  # Sync status
  if is_running "sync"; then
    printf "  ${GREEN}%-15s %-10s %-8s %-7s %-40s${NC}\n" \
      "sync" "RUNNING" "$(get_pid "sync")" "-" "pushing to remote feed"
  else
    printf "  ${DIM}%-15s %-10s %-8s %-7s %-40s${NC}\n" \
      "sync" "STOPPED" "-" "-" "-"
  fi
  echo ""
}

cmd_logs() {
  local target="${1:-}"
  if [ -z "$target" ]; then
    echo "Usage: stoneforge-boss logs <workspace>"
    echo "Available: feed, sync, or any registered workspace"
    return 1
  fi

  local lf
  lf=$(log_file "$target")
  if [ -f "$lf" ]; then
    tail -50 "$lf"
  else
    echo "No log file for $target"
  fi
}

cmd_dashboard() {
  # Live-updating status display
  echo -e "${BOLD}Stoneforge Boss — Live Dashboard${NC} (Ctrl+C to exit)"
  echo ""

  while true; do
    clear
    echo ""
    echo -e "${BOLD}  +===================================================+${NC}"
    echo -e "${BOLD}  |         STONEFORGE BOSS — LIVE DASHBOARD           |${NC}"
    echo -e "${BOLD}  +===================================================+${NC}"
    echo ""
    echo -e "  ${DIM}$(date '+%Y-%m-%d %H:%M:%S')  *  Refresh: 5s  *  Ctrl+C to exit${NC}"
    echo ""
    printf "  ${BOLD}%-15s %-10s %8s %7s  %-30s${NC}\n" "WORKSPACE" "STATUS" "PID" "PORT" "DASHBOARD"
    echo "  $(printf '%.0s-' {1..75})"

    local running=0 total=0

    for ws in "${WORKSPACES[@]}"; do
      local name script default_port
      name=$(get_field "$ws" 1)
      script=$(get_field "$ws" 2)
      default_port=$(get_field "$ws" 3)
      total=$((total + 1))

      if is_running "$name"; then
        local pid port
        pid=$(get_pid "$name")
        port=$(get_port "$name")
        running=$((running + 1))

        # Check if port is actually responding
        if curl -s -o /dev/null -w '' --connect-timeout 1 "http://localhost:$port" 2>/dev/null; then
          printf "  ${GREEN}*${NC} %-14s ${GREEN}%-10s${NC} %8s %7s  ${CYAN}http://localhost:%s${NC}\n" \
            "$name" "RUNNING" "$pid" "$port" "$port"
        else
          printf "  ${YELLOW}~${NC} %-14s ${YELLOW}%-10s${NC} %8s %7s  ${DIM}starting...${NC}\n" \
            "$name" "STARTING" "$pid" "$port"
        fi
      else
        printf "  ${DIM}o${NC} %-14s ${DIM}%-10s${NC} %8s %7s  ${DIM}-${NC}\n" \
          "$name" "STOPPED" "-" "$default_port"
        rm -f "$(pid_file "$name")" "$(port_file "$name")"
      fi
    done

    # Feed status in dashboard
    echo "  $(printf '%.0s-' {1..75})"
    if is_running "feed"; then
      local fpid fport
      fpid=$(get_pid "feed")
      fport=$(get_port "feed")
      if curl -s -o /dev/null -w '' --connect-timeout 1 "http://localhost:$fport" 2>/dev/null; then
        printf "  ${GREEN}*${NC} %-14s ${GREEN}%-10s${NC} %8s %7s  ${CYAN}http://localhost:%s${NC}\n" \
          "feed" "RUNNING" "$fpid" "$fport" "$fport"
      else
        printf "  ${YELLOW}~${NC} %-14s ${YELLOW}%-10s${NC} %8s %7s  ${DIM}starting...${NC}\n" \
          "feed" "STARTING" "$fpid" "$fport"
      fi
    else
      printf "  ${DIM}o${NC} %-14s ${DIM}%-10s${NC} %8s %7s  ${DIM}-${NC}\n" \
        "feed" "STOPPED" "-" "$FEED_DEFAULT_PORT"
    fi

    # Sync in dashboard
    if is_running "sync"; then
      printf "  ${GREEN}*${NC} %-14s ${GREEN}%-10s${NC} %8s %7s  ${DIM}pushing to remote${NC}\n" \
        "sync" "RUNNING" "$(get_pid "sync")" "-"
    else
      printf "  ${DIM}o${NC} %-14s ${DIM}%-10s${NC} %8s %7s  ${DIM}-${NC}\n" \
        "sync" "STOPPED" "-" "-"
    fi

    echo "  $(printf '%.0s-' {1..75})"
    echo ""
    if [ $running -eq $total ] && [ $total -gt 0 ]; then
      echo -e "  ${GREEN}All $total workspaces running${NC}"
    elif [ $running -eq 0 ]; then
      echo -e "  ${DIM}No workspaces running${NC}  *  Run: ${BOLD}stoneforge-boss start${NC}"
    else
      echo -e "  ${YELLOW}$running/$total workspaces running${NC}"
    fi

    # Show recent log lines from running workspaces
    echo ""
    echo -e "  ${BOLD}Recent Activity${NC}"
    echo "  $(printf '%.0s-' {1..75})"
    for ws in "${WORKSPACES[@]}"; do
      local name
      name=$(get_field "$ws" 1)
      if is_running "$name"; then
        local lf
        lf=$(log_file "$name")
        if [ -f "$lf" ]; then
          local last
          last=$(tail -1 "$lf" 2>/dev/null | head -c 70)
          [ -n "$last" ] && printf "  ${DIM}%-14s${NC} %s\n" "$name" "$last"
        fi
      fi
    done

    sleep 5
  done
}

# ---- Feed Service ----

# Build the STONEFORGE_URL for the feed by finding running workspace URLs
get_feed_stoneforge_url() {
  # Connect to the first running workspace
  for ws in "${WORKSPACES[@]}"; do
    local name
    name=$(get_field "$ws" 1)
    if is_running "$name"; then
      local port
      port=$(get_port "$name")
      echo "http://localhost:$port"
      return
    fi
  done
  # No workspaces running — feed runs in demo mode
  echo ""
}

cmd_feed_start() {
  if is_running "feed"; then
    echo -e "${YELLOW}[feed]${NC} Already running (PID $(get_pid "feed"), port $(get_port "feed"))"
    return
  fi

  local feed_dir
  feed_dir="$(cd "$BOSS_SCRIPT_DIR/../../apps/feed" 2>/dev/null && pwd)"

  # Prefer Docker if available and docker-compose.yml exists
  if has_docker && [ -f "$feed_dir/docker-compose.yml" ]; then
    echo -e "${CYAN}[feed]${NC} Starting via Docker Compose..."
    local lf
    lf=$(log_file "feed")

    docker compose -f "$feed_dir/docker-compose.yml" up -d --build > "$lf" 2>&1
    if [ $? -eq 0 ]; then
      echo "docker" > "$(pid_file "feed")"
      echo "${FEED_DEFAULT_PORT}" > "$(port_file "feed")"
      echo -e "${GREEN}[feed]${NC} Started via Docker (port ${FEED_DEFAULT_PORT})"
    else
      echo -e "${RED}[feed]${NC} Docker Compose failed. Check $(log_file "feed")"
    fi
    return
  fi

  # Fallback: raw node
  if [ ! -x "$FEED_SCRIPT" ]; then
    echo -e "${RED}[feed]${NC} Script not found or not executable: $FEED_SCRIPT"
    return
  fi

  local port
  port=$(find_free_port "$FEED_DEFAULT_PORT")
  if [ "$port" = "0" ]; then
    echo -e "${RED}[feed]${NC} No free port found near $FEED_DEFAULT_PORT"
    return
  fi
  if [ "$port" != "$FEED_DEFAULT_PORT" ]; then
    echo -e "${YELLOW}[feed]${NC} Port $FEED_DEFAULT_PORT busy, using $port"
  fi

  local sf_url
  sf_url=$(get_feed_stoneforge_url)

  local lf
  lf=$(log_file "feed")

  if [ -n "$sf_url" ]; then
    nohup "$FEED_SCRIPT" --port "$port" --stoneforge-url "$sf_url" > "$lf" 2>&1 &
    local mode="connected to $sf_url"
  else
    nohup "$FEED_SCRIPT" --port "$port" > "$lf" 2>&1 &
    local mode="demo mode (no workspaces running)"
  fi
  local pid=$!

  echo "$pid" > "$(pid_file "feed")"
  echo "$port" > "$(port_file "feed")"

  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${GREEN}[feed]${NC} Started (PID $pid, port $port, $mode)"
  else
    echo -e "${RED}[feed]${NC} Failed to start. Check $(log_file "feed")"
    rm -f "$(pid_file "feed")" "$(port_file "feed")"
  fi
}

cmd_feed_stop() {
  if ! is_running "feed"; then
    echo -e "${DIM}[feed]${NC} Not running"
    rm -f "$(pid_file "feed")" "$(port_file "feed")"
    return
  fi

  local pf_content
  pf_content=$(cat "$(pid_file "feed")" 2>/dev/null)

  if [ "$pf_content" = "docker" ]; then
    # Docker mode — compose down
    local feed_dir
    feed_dir="$(cd "$BOSS_SCRIPT_DIR/../../apps/feed" 2>/dev/null && pwd)"
    echo -e "${CYAN}[feed]${NC} Stopping Docker Compose..."
    docker compose -f "$feed_dir/docker-compose.yml" down 2>/dev/null
    rm -f "$(pid_file "feed")" "$(port_file "feed")"
    echo -e "${RED}[feed]${NC} Stopped (Docker)"
    return
  fi

  # Raw process mode
  local pid="$pf_content"
  kill "$pid" 2>/dev/null
  local i=0
  while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do
    sleep 0.3
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$(pid_file "feed")" "$(port_file "feed")"
  echo -e "${RED}[feed]${NC} Stopped"
}

# ---- Sync Service ----
# Pushes local Stoneforge data to the remote feed on Railway,
# pulls back comments/reactions to route to local agents.

cmd_sync_start() {
  local remote_url="${1:-}"
  local auth_token="${2:-}"
  local interval="${3:-5}"

  # Check for saved config (safe parsing, no source)
  local sync_config="$CONFIG_DIR/sync.conf"
  if [ -z "$remote_url" ] && [ -f "$sync_config" ]; then
    remote_url="$(safe_read_conf "$sync_config" "SYNC_REMOTE_URL")"
    auth_token="$(safe_read_conf "$sync_config" "SYNC_AUTH_TOKEN")"
    local conf_interval
    conf_interval="$(safe_read_conf "$sync_config" "SYNC_INTERVAL")"
    interval="${conf_interval:-5}"
  fi

  if [ -z "$remote_url" ] || [ -z "$auth_token" ]; then
    echo -e "${RED}[sync]${NC} Missing config."
    echo ""
    echo "Usage: stoneforge-boss sync start <remote-feed-url> <auth-token> [interval]"
    echo ""
    echo "Or configure in $sync_config:"
    echo '  SYNC_REMOTE_URL="https://your-feed.up.railway.app"'
    echo '  SYNC_AUTH_TOKEN="your-secret-token"'
    return 1
  fi

  if is_running "sync"; then
    echo -e "${YELLOW}[sync]${NC} Already running (PID $(get_pid "sync"))"
    return
  fi

  if [ ! -x "$SYNC_SCRIPT" ]; then
    echo -e "${RED}[sync]${NC} Sync script not found: $SYNC_SCRIPT"
    return 1
  fi

  # Collect workspace ports from registry
  local ports_csv=""
  if [ ${#WORKSPACES[@]} -gt 0 ]; then
    local port_list=()
    for ws in "${WORKSPACES[@]}"; do
      local p
      p=$(echo "$ws" | cut -d'|' -f3)
      [ -n "$p" ] && port_list+=("$p")
    done
    ports_csv=$(IFS=','; echo "${port_list[*]}")
  fi

  # Save config for future starts
  cat > "$sync_config" <<CONF
SYNC_REMOTE_URL="$remote_url"
SYNC_AUTH_TOKEN="$auth_token"
SYNC_INTERVAL="$interval"
CONF

  local lf
  lf=$(log_file "sync")

  local sync_args=(
    --remote-url "$remote_url"
    --auth-token "$auth_token"
    --interval "$interval"
  )
  [ -n "$ports_csv" ] && sync_args+=(--ports "$ports_csv")

  nohup "$SYNC_SCRIPT" "${sync_args[@]}" > "$lf" 2>&1 &
  local pid=$!

  echo "$pid" > "$(pid_file "sync")"

  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${GREEN}[sync]${NC} Started (PID $pid, every ${interval}s)"
    echo -e "  ${DIM}Ports:  ${ports_csv:-auto}${NC}"
    echo -e "  ${DIM}Remote: $remote_url${NC}"
  else
    echo -e "${RED}[sync]${NC} Failed to start. Check: $lf"
    rm -f "$(pid_file "sync")"
  fi
}

cmd_sync_stop() {
  if ! is_running "sync"; then
    echo -e "${DIM}[sync]${NC} Not running"
    rm -f "$(pid_file "sync")"
    return
  fi

  local pid
  pid=$(get_pid "sync")
  kill "$pid" 2>/dev/null
  local i=0
  while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do
    sleep 0.3
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$(pid_file "sync")"
  echo -e "${RED}[sync]${NC} Stopped"
}

# ---- Local / Remote (high-level commands) ----

# Resolve the feed directory
get_feed_dir() {
  cd "$BOSS_SCRIPT_DIR/../../apps/feed" 2>/dev/null && pwd
}

cmd_local() {
  local subcmd="${1:-up}"

  case "$subcmd" in
    up|start)
      echo ""
      echo -e "${BOLD}  Stoneforge Local${NC}"
      echo ""

      # 1. Start any registered workspaces
      if [ ${#WORKSPACES[@]} -gt 0 ]; then
        cmd_start all
      fi

      # 2. Start feed
      cmd_feed_start

      echo ""
      local feed_port
      feed_port=$(get_port "feed" 2>/dev/null)
      feed_port="${feed_port:-$FEED_DEFAULT_PORT}"
      echo -e "  ${GREEN}Feed:${NC} ${CYAN}http://localhost:${feed_port}${NC}"
      echo ""
      ;;

    down|stop)
      echo ""
      echo -e "${BOLD}  Stopping local services${NC}"
      echo ""
      cmd_feed_stop
      if [ ${#WORKSPACES[@]} -gt 0 ]; then
        cmd_stop all
      fi
      echo ""
      ;;

    restart)
      cmd_local down
      sleep 1
      cmd_local up
      ;;

    logs)
      cmd_logs "feed"
      ;;

    *)
      echo "Usage: stoneforge-boss local [up|down|restart|logs]"
      ;;
  esac
}

# Save remote + sync config files
_save_remote_config() {
  local prov="$1" url="$2" token="$3"
  local remote_config="$CONFIG_DIR/remote.conf"
  local sync_config="$CONFIG_DIR/sync.conf"

  cat > "$remote_config" <<CONF
REMOTE_PROVIDER="$prov"
REMOTE_URL="$url"
REMOTE_AUTH_TOKEN="$token"
CONF

  cat > "$sync_config" <<CONF
SYNC_REMOTE_URL="$url"
SYNC_AUTH_TOKEN="$token"
SYNC_INTERVAL="5"
CONF

  echo -e "${GREEN}[remote]${NC} Configured:"
  echo "  Provider: $prov"
  echo "  URL:      $url"
  echo "  Token:    ${token:0:8}..."
}

# Generate a random token
_generate_token() {
  # 32 hex chars
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  elif [ -r /dev/urandom ]; then
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
  else
    date +%s%N | shasum | head -c 32
  fi
}

# ---- Automated Railway Setup ----
# Creates project, links service, adds Postgres, generates domain,
# sets env vars, deploys, and saves config — all in one command.

cmd_remote_config_railway() {
  local feed_dir
  feed_dir="$(get_feed_dir)"
  local remote_config="$CONFIG_DIR/remote.conf"

  echo ""
  echo -e "${BOLD}  Railway Auto-Setup${NC}"
  echo ""

  # 1. Check CLI + login
  if ! command -v railway >/dev/null 2>&1; then
    echo -e "${RED}[railway]${NC} CLI not installed."
    echo ""
    echo "  Install:  npm i -g @railway/cli"
    echo "  Then:     stoneforge-boss remote config railway"
    return 1
  fi

  if ! railway whoami >/dev/null 2>&1; then
    echo -e "${YELLOW}[railway]${NC} Not logged in. Opening browser..."
    railway login
    if ! railway whoami >/dev/null 2>&1; then
      echo -e "${RED}[railway]${NC} Login failed."
      return 1
    fi
  fi
  local user
  user=$(railway whoami 2>/dev/null | head -1)
  echo -e "  ${GREEN}Logged in:${NC} $user"

  # 2. Check if already linked locally
  local project_name=""
  local project_id=""
  local service_name=""
  local env_id=""
  local already_linked=false
  if (cd "$feed_dir" && railway status >/dev/null 2>&1); then
    already_linked=true
    local status_output
    status_output=$(cd "$feed_dir" && railway status 2>/dev/null)
    project_name=$(echo "$status_output" | grep -i "project" | head -1 | sed 's/.*: *//')
    service_name=$(echo "$status_output" | grep -i "service" | head -1 | sed 's/.*: *//')
    echo -e "  ${GREEN}Project:${NC} $project_name (already linked)"
  fi

  # 3. If not linked, scan for existing stoneforge projects on Railway
  if [ "$already_linked" = false ]; then
    echo ""
    echo -e "  ${CYAN}Checking for existing Railway projects...${NC}"

    # Parse project list — fields: project_id|project_name|display|service_name|env_id
    local existing_projects
    existing_projects=$(railway list --json 2>/dev/null | \
      python3 -c "
import sys, json
try:
    projects = json.load(sys.stdin)
    matches = [p for p in projects if 'stoneforge' in p['name'].lower() or 'feed' in p['name'].lower()]
    for p in matches:
        svcs = p.get('services',{}).get('edges',[])
        svc_names = [s['node']['name'] for s in svcs]
        svc_name = svc_names[0] if svc_names else ''
        envs = p.get('environments',{}).get('edges',[])
        env_id = envs[0]['node']['id'] if envs else ''
        display = ', '.join(svc_names) if svc_names else 'no services'
        print(f'{p[\"id\"]}|{p[\"name\"]}|{display}|{svc_name}|{env_id}')
except:
    pass
" 2>/dev/null) || true

    if [ -n "$existing_projects" ]; then
      local count
      count=$(echo "$existing_projects" | wc -l | tr -d ' ')

      echo ""
      echo -e "  ${YELLOW}Found $count existing project(s):${NC}"
      echo ""

      local idx=1
      while IFS='|' read -r pid pname pservices; do
        printf "    ${BOLD}%d)${NC} %-25s ${DIM}(%s)${NC}\n" "$idx" "$pname" "$pservices"
        idx=$((idx + 1))
      done <<< "$existing_projects"
      printf "    ${BOLD}%d)${NC} Create new project\n" "$idx"
      echo ""

      local choice="1"
      printf "  Select [1]: " 2>/dev/null || true
      read -r choice </dev/tty 2>/dev/null || choice="1"
      choice="${choice:-1}"

      if [ "$choice" -lt "$idx" ] 2>/dev/null; then
        # User picked an existing project — extract all fields
        local selected_line
        selected_line=$(echo "$existing_projects" | sed -n "${choice}p")
        project_id=$(echo "$selected_line" | cut -d'|' -f1)
        project_name=$(echo "$selected_line" | cut -d'|' -f2)
        local service_name env_id
        service_name=$(echo "$selected_line" | cut -d'|' -f4)
        env_id=$(echo "$selected_line" | cut -d'|' -f5)

        echo ""
        echo -e "  ${CYAN}Linking to ${BOLD}$project_name${NC}${CYAN}...${NC}"

        # Build link command — railway link needs service NAME not ID
        local link_args=("--project" "$project_id")
        [ -n "$service_name" ] && link_args+=("--service" "$service_name")
        [ -n "$env_id" ] && link_args+=("--environment" "$env_id")

        if (cd "$feed_dir" && railway link "${link_args[@]}" 2>/dev/null); then
          already_linked=true
          echo -e "  ${GREEN}Linked:${NC} $project_name"
        elif (cd "$feed_dir" && railway status >/dev/null 2>&1); then
          # link printed noise but actually worked
          already_linked=true
          echo -e "  ${GREEN}Linked:${NC} $project_name"
        else
          echo -e "  ${RED}Link failed.${NC} Will create a new project instead."
        fi
      fi
      # If choice == idx or link failed, fall through to create new
    fi

    # Create new project if still not linked
    if [ "$already_linked" = false ]; then
      echo ""
      echo -e "  ${CYAN}Creating new Railway project...${NC}"
      local init_output
      init_output=$(cd "$feed_dir" && railway init --name "stoneforge-feed" --json 2>&1) || true

      if echo "$init_output" | grep -q '"id"'; then
        project_name="stoneforge-feed"
        echo -e "  ${GREEN}Created project:${NC} $project_name"
      else
        echo -e "  ${YELLOW}[railway]${NC} init returned: ${init_output:0:80}"
        echo -e "  ${YELLOW}[railway]${NC} Trying interactive link..."
        (cd "$feed_dir" && railway link 2>/dev/null </dev/tty) || true

        if (cd "$feed_dir" && railway status >/dev/null 2>&1); then
          project_name=$(cd "$feed_dir" && railway status 2>/dev/null | grep -i "project" | head -1 | sed 's/.*: *//')
          echo -e "  ${GREEN}Linked to:${NC} $project_name"
        else
          echo -e "${RED}[railway]${NC} Could not create or link a project."
          echo "  Try manually: cd apps/feed && railway link"
          return 1
        fi
      fi
    fi
  fi

  # 3b. Resolve service_name if we don't have it yet (needed for all subsequent commands)
  if [ -z "$service_name" ] && (cd "$feed_dir" && railway status >/dev/null 2>&1); then
    service_name=$(cd "$feed_dir" && railway status 2>/dev/null | grep -i "service" | head -1 | sed 's/.*: *//')
  fi
  # Build flags array to pass to all railway commands (avoids interactive prompts)
  local railway_svc_flags=()
  [ -n "$service_name" ] && railway_svc_flags+=("--service" "$service_name")

  # 4. Check for existing env vars (reuse AUTH_TOKEN if already set)
  local existing_token=""
  echo ""
  echo -e "  ${CYAN}Checking existing configuration...${NC}"
  local existing_vars
  existing_vars=$(cd "$feed_dir" && railway variable list --kv "${railway_svc_flags[@]}" 2>/dev/null) || true

  if [ -n "$existing_vars" ]; then
    existing_token=$(echo "$existing_vars" | grep "^AUTH_TOKEN=" | head -1 | sed 's/^AUTH_TOKEN=//') || true
    local existing_db
    existing_db=$(echo "$existing_vars" | grep "^DATABASE_URL=" | head -1) || true

    if [ -n "$existing_token" ]; then
      echo -e "  ${GREEN}AUTH_TOKEN:${NC} found (${existing_token:0:8}...)"
    fi
    if [ -n "$existing_db" ]; then
      echo -e "  ${GREEN}DATABASE_URL:${NC} already configured (Postgres linked)"
    fi
  fi

  # 5. Check for existing domain
  local domain_url=""
  local existing_domain
  existing_domain=$(cd "$feed_dir" && railway domain "${railway_svc_flags[@]}" 2>&1 | grep -o '[a-z0-9-]*\.up\.railway\.app' | head -1) || true

  if [ -n "$existing_domain" ]; then
    domain_url="https://$existing_domain"
    echo -e "  ${GREEN}Domain:${NC} $domain_url"
  fi

  # 6. Decide: reuse existing token or generate new one
  local auth_token
  if [ -n "$existing_token" ]; then
    echo ""
    local reuse_choice="Y"
    printf "  Use existing AUTH_TOKEN? [Y/n]: " 2>/dev/null || true
    read -r reuse_choice </dev/tty 2>/dev/null || reuse_choice="Y"
    reuse_choice="${reuse_choice:-Y}"
    if [[ "$reuse_choice" =~ ^[Yy] ]]; then
      auth_token="$existing_token"
      echo -e "  ${GREEN}Reusing${NC} existing token"
    else
      auth_token=$(_generate_token)
      echo -e "  ${GREEN}Generated${NC} new token: ${auth_token:0:8}..."
    fi
  else
    auth_token=$(_generate_token)
    echo -e "  ${GREEN}Generated${NC} auth token: ${auth_token:0:8}..."
  fi

  # 7. Add Postgres database (if not already present)
  if [ -z "$(echo "$existing_vars" | grep "^DATABASE_URL=")" ]; then
    echo ""
    echo -e "  ${CYAN}Adding Postgres database...${NC}"
    local pg_output
    pg_output=$(cd "$feed_dir" && railway add --database postgres 2>&1) || true

    if echo "$pg_output" | grep -qi "error\|already\|exists"; then
      echo -e "  ${YELLOW}Postgres:${NC} ${pg_output:0:80}"
    else
      echo -e "  ${GREEN}Postgres:${NC} added"
    fi
  fi

  # 8. Set feed password
  local feed_password=""
  local existing_password=""
  existing_password=$(echo "$existing_vars" | grep "^FEED_PASSWORD=" | head -1 | sed 's/^FEED_PASSWORD=//') || true

  if [ -n "$existing_password" ]; then
    feed_password="$existing_password"
    echo -e "  ${GREEN}Password:${NC} already set"
  else
    echo ""
    printf "  Set a login password for the feed: "
    read -r feed_password </dev/tty 2>/dev/null || feed_password="stoneforge"
    feed_password="${feed_password:-stoneforge}"
  fi

  # 9. Set env vars
  echo ""
  echo -e "  ${CYAN}Setting environment variables...${NC}"
  (cd "$feed_dir" && railway variable set \
    "AUTH_TOKEN=$auth_token" \
    "FEED_PASSWORD=$feed_password" \
    "SYNC_MODE=true" \
    "TRUST_PROXY=1" \
    "NODE_ENV=production" \
    "${railway_svc_flags[@]}" \
    --skip-deploys 2>/dev/null) || \
  (cd "$feed_dir" && railway variable set \
    "AUTH_TOKEN=$auth_token" \
    "FEED_PASSWORD=$feed_password" \
    "SYNC_MODE=true" \
    "TRUST_PROXY=1" \
    "NODE_ENV=production" \
    "${railway_svc_flags[@]}" 2>/dev/null) || true

  echo -e "  ${GREEN}Env vars set:${NC} AUTH_TOKEN, FEED_PASSWORD, SYNC_MODE, TRUST_PROXY, NODE_ENV"
  echo -e "  ${DIM}(DATABASE_URL is auto-injected by Railway Postgres plugin)${NC}"

  # 9. Generate domain if none exists
  if [ -z "$domain_url" ]; then
    echo ""
    echo -e "  ${CYAN}Generating domain...${NC}"
    local domain_output
    domain_output=$(cd "$feed_dir" && railway domain "${railway_svc_flags[@]}" --json 2>&1) || true

    # Try to extract domain from JSON output
    if echo "$domain_output" | grep -q '"domain"'; then
      domain_url=$(echo "$domain_output" | grep -o '"domain"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"domain"[[:space:]]*:[[:space:]]*"//;s/"//') || true
    fi
    # Fallback: look for a .up.railway.app URL anywhere in output
    if [ -z "$domain_url" ]; then
      domain_url=$(echo "$domain_output" | grep -o '[a-z0-9-]*\.up\.railway\.app' | head -1) || true
    fi

    if [ -n "$domain_url" ]; then
      [[ "$domain_url" == http* ]] || domain_url="https://$domain_url"
      echo -e "  ${GREEN}Domain:${NC} $domain_url"
    else
      echo -e "  ${YELLOW}Domain:${NC} could not detect — check Railway dashboard"
      echo -e "  ${DIM}$domain_output${NC}"
    fi
  fi

  # 10. Deploy
  echo ""
  echo -e "  ${CYAN}Deploying...${NC}"
  if (cd "$feed_dir" && railway up "${railway_svc_flags[@]}" --detach 2>&1); then
    echo -e "  ${GREEN}Deploy triggered.${NC}"
  else
    echo -e "  ${YELLOW}Deploy may need a manual push:${NC} cd apps/feed && railway up"
  fi

  # 11. Fallback domain detection from env vars
  if [ -z "$domain_url" ] && [ -n "$existing_vars" ]; then
    domain_url=$(echo "$existing_vars" | grep "^RAILWAY_PUBLIC_DOMAIN=" | head -1 | sed 's/^RAILWAY_PUBLIC_DOMAIN=//') || true
    [ -n "$domain_url" ] && domain_url="https://$domain_url"
  fi

  # 12. Save config
  if [ -n "$domain_url" ]; then
    echo ""
    _save_remote_config "railway" "$domain_url" "$auth_token"
  else
    echo ""
    echo -e "  ${YELLOW}[remote]${NC} Could not detect domain — saving token only."
    echo -e "  ${DIM}Run 'railway domain' in apps/feed/ and then:${NC}"
    echo -e "  ${DIM}  stoneforge-boss remote config <url> $auth_token${NC}"
  fi

  # 13. Summary
  echo ""
  echo -e "${BOLD}  ┌─────────────────────────────────────────┐${NC}"
  echo -e "${BOLD}  │  Railway Setup Complete                  │${NC}"
  echo -e "${BOLD}  ├─────────────────────────────────────────┤${NC}"
  if [ -n "$domain_url" ]; then
  echo -e "  │  ${CYAN}$domain_url${NC}"
  fi
  echo -e "  │                                         │"
  echo -e "  │  Password:   ${GREEN}${feed_password}${NC}"
  echo -e "  │  Database:   ${GREEN}PostgreSQL${NC} (Railway)       │"
  echo -e "  │  Sync mode:  ${GREEN}enabled${NC}                    │"
  echo -e "${BOLD}  └─────────────────────────────────────────┘${NC}"
  echo ""
  echo -e "  Next: ${BOLD}stoneforge-boss remote${NC}  (deploy + start sync)"
  echo ""
}

cmd_remote() {
  local subcmd="${1:-up}"
  local feed_dir
  feed_dir="$(get_feed_dir)"
  local remote_config="$CONFIG_DIR/remote.conf"

  case "$subcmd" in
    up|start|deploy)
      echo ""
      echo -e "${BOLD}  Stoneforge Remote Deploy${NC}"
      echo ""

      # Load remote config
      local provider remote_url auth_token
      if [ -f "$remote_config" ]; then
        provider="$(safe_read_conf "$remote_config" "REMOTE_PROVIDER")"
        remote_url="$(safe_read_conf "$remote_config" "REMOTE_URL")"
        auth_token="$(safe_read_conf "$remote_config" "REMOTE_AUTH_TOKEN")"
      fi
      provider="${provider:-railway}"

      case "$provider" in
        railway)
          if ! command -v railway >/dev/null 2>&1; then
            echo -e "${RED}[remote]${NC} Railway CLI not installed."
            echo ""
            echo "  Install:  npm i -g @railway/cli"
            echo "  Login:    railway login"
            echo "  Link:     cd apps/feed && railway link"
            return 1
          fi

          echo -e "${CYAN}[remote]${NC} Deploying to Railway..."
          (cd "$feed_dir" && railway up --detach)

          if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}[remote]${NC} Deploy triggered."
            # If we know the remote URL, start sync
            if [ -n "$remote_url" ] && [ -n "$auth_token" ]; then
              echo ""
              cmd_sync_start "$remote_url" "$auth_token"
            else
              echo ""
              echo -e "${DIM}  Sync not started — configure remote URL:${NC}"
              echo "  stoneforge-boss remote config <url> <auth-token>"
            fi
          else
            echo -e "${RED}[remote]${NC} Deploy failed. Run: cd apps/feed && railway up"
          fi
          ;;

        git)
          echo -e "${CYAN}[remote]${NC} Deploying via git push..."
          local remote_name
          remote_name="$(safe_read_conf "$remote_config" "GIT_REMOTE")"
          remote_name="${remote_name:-origin}"
          local branch
          branch="$(git -C "$feed_dir" rev-parse --abbrev-ref HEAD 2>/dev/null)"
          branch="${branch:-main}"

          (cd "$feed_dir" && git push "$remote_name" "$branch")

          if [ $? -eq 0 ]; then
            echo -e "${GREEN}[remote]${NC} Pushed to $remote_name/$branch"
            if [ -n "$remote_url" ] && [ -n "$auth_token" ]; then
              echo ""
              cmd_sync_start "$remote_url" "$auth_token"
            fi
          else
            echo -e "${RED}[remote]${NC} Push failed."
          fi
          ;;

        *)
          echo -e "${RED}[remote]${NC} Unknown provider: $provider"
          echo "  Supported: railway, git"
          return 1
          ;;
      esac
      echo ""
      ;;

    down|stop)
      echo ""
      echo -e "${BOLD}  Stopping remote services${NC}"
      echo ""
      cmd_sync_stop
      echo ""
      echo -e "${DIM}  Note: The remote feed keeps running. To tear it down:${NC}"
      echo -e "${DIM}  railway down   (or remove from your hosting dashboard)${NC}"
      echo ""
      ;;

    config)
      local arg1="${2:-}"

      # --- Automated Railway setup ---
      if [ "$arg1" = "railway" ]; then
        cmd_remote_config_railway
        return
      fi

      # --- Manual config: <url> <token> [provider] ---
      local url="$arg1"
      local token="${3:-}"

      if [ -z "$url" ]; then
        # Show current config
        if [ -f "$remote_config" ]; then
          echo -e "${BOLD}Remote configuration:${NC}"
          echo "  Provider:   $(safe_read_conf "$remote_config" "REMOTE_PROVIDER")"
          echo "  URL:        $(safe_read_conf "$remote_config" "REMOTE_URL")"
          echo "  Auth token: $(safe_read_conf "$remote_config" "REMOTE_AUTH_TOKEN" | head -c 8)..."
          echo ""
          echo "  Config file: $remote_config"
        else
          echo "No remote configured."
          echo ""
          echo "Usage:"
          echo "  stoneforge-boss remote config railway           # auto-setup Railway"
          echo "  stoneforge-boss remote config <url> <token>     # manual config"
        fi
        return
      fi

      if [ -z "$token" ]; then
        echo "Usage: stoneforge-boss remote config <feed-url> <auth-token> [provider]"
        return 1
      fi

      local prov="${4:-railway}"
      _save_remote_config "$prov" "$url" "$token"
      ;;

    status)
      echo ""
      echo -e "${BOLD}  Remote Status${NC}"
      echo ""
      if [ -f "$remote_config" ]; then
        local provider url
        provider="$(safe_read_conf "$remote_config" "REMOTE_PROVIDER")"
        url="$(safe_read_conf "$remote_config" "REMOTE_URL")"
        echo -e "  Provider: ${CYAN}${provider:-not set}${NC}"
        echo -e "  URL:      ${CYAN}${url:-not set}${NC}"

        if [ -n "$url" ]; then
          if curl -sf --connect-timeout 5 "${url}/api/health" >/dev/null 2>&1; then
            local health
            health=$(curl -sf --connect-timeout 5 "${url}/api/health" 2>/dev/null)
            echo -e "  Health:   ${GREEN}OK${NC}  $health"
          else
            echo -e "  Health:   ${RED}unreachable${NC}"
          fi
        fi
      else
        echo -e "  ${DIM}No remote configured.${NC}"
        echo "  Run: stoneforge-boss remote config <url> <token>"
      fi

      echo ""
      if is_running "sync"; then
        echo -e "  Sync:     ${GREEN}running${NC} (PID $(get_pid "sync"))"
      else
        echo -e "  Sync:     ${DIM}stopped${NC}"
      fi
      echo ""
      ;;

    *)
      echo "Usage: stoneforge-boss remote [up|down|config|status]"
      ;;
  esac
}

cmd_help() {
  echo ""
  echo -e "${BOLD}stoneforge-boss${NC} — Master controller for Stoneforge workspaces"
  echo ""
  echo "Usage: stoneforge-boss <command> [args]"
  echo ""
  echo -e "${BOLD}Quick start:${NC}"
  echo "  local                Start feed + workspaces locally"
  echo "  local stop           Stop everything local"
  echo "  remote config railway    Auto-setup Railway (project + Postgres + domain)"
  echo "  remote               Deploy to Railway and start sync"
  echo "  remote stop          Stop sync daemon"
  echo "  remote config <url> <token>  Manual remote config"
  echo ""
  echo -e "${BOLD}Setup:${NC}"
  echo "  init                 Create config files"
  echo "  register <name> <script> <port>   Add a workspace"
  echo "  unregister <name>    Remove a workspace"
  echo ""
  echo -e "${BOLD}Granular:${NC}"
  echo "  start [name]         Start workspace(s)"
  echo "  stop [name]          Stop workspace(s)"
  echo "  restart [name]       Restart workspace(s)"
  echo "  feed [start|stop]    Control the feed service"
  echo "  sync start [url] [token]  Start sync daemon"
  echo "  sync stop            Stop sync daemon"
  echo ""
  echo -e "${BOLD}Monitor:${NC}"
  echo "  status               Show all services"
  echo "  remote status        Check remote health + sync"
  echo "  dashboard            Live-updating CLI dashboard"
  echo "  logs <name>          Show recent logs"
  echo ""

  if [ ${#WORKSPACES[@]} -gt 0 ]; then
    echo "Registered workspaces:"
    for ws in "${WORKSPACES[@]}"; do
      local name default_port
      name=$(get_field "$ws" 1)
      default_port=$(get_field "$ws" 3)
      printf "  %-15s port %s\n" "$name" "$default_port"
    done
    printf "  %-15s port %s  (social feed UI)\n" "feed" "$FEED_DEFAULT_PORT"
  else
    echo -e "${DIM}No workspaces registered. Run: stoneforge-boss init${NC}"
  fi
  echo ""
}

# ---- Main ----

case "${1:-help}" in
  # High-level commands
  local)     cmd_local "${2:-up}" ;;
  remote)
    case "${2:-up}" in
      up|start|deploy) cmd_remote up ;;
      down|stop)       cmd_remote down ;;
      config)          cmd_remote config "${3:-}" "${4:-}" "${5:-}" ;;
      status)          cmd_remote status ;;
      *) echo "Usage: stoneforge-boss remote [up|down|config|status]" ;;
    esac
    ;;

  # Setup
  init)      cmd_init ;;
  register)  cmd_register "${2:-}" "${3:-}" "${4:-}" ;;
  unregister) cmd_unregister "${2:-}" ;;

  # Granular control
  start)     cmd_start "${2:-all}" ;;
  stop)      cmd_stop "${2:-all}" ;;
  restart)   cmd_restart "${2:-all}" ;;
  status)    cmd_status ;;
  feed)
    case "${2:-start}" in
      start) cmd_feed_start ;;
      stop)  cmd_feed_stop ;;
      restart) cmd_feed_stop; sleep 1; cmd_feed_start ;;
      *) echo "Usage: stoneforge-boss feed [start|stop|restart]" ;;
    esac
    ;;
  sync)
    case "${2:-}" in
      start) cmd_sync_start "${3:-}" "${4:-}" "${5:-5}" ;;
      stop)  cmd_sync_stop ;;
      *) echo "Usage: stoneforge-boss sync [start <url> <token> [interval]|stop]" ;;
    esac
    ;;

  # Monitor
  dashboard) cmd_dashboard ;;
  logs)      cmd_logs "${2:-}" ;;
  help|--help|-h) cmd_help ;;
  *)
    echo "Unknown command: $1"
    cmd_help
    exit 1
    ;;
esac
