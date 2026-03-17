#!/usr/bin/env bash
set -euo pipefail

# stoneforge-feed sync — runs on the Mac, pushes local Stoneforge data to remote feed
# Usage: sync.sh --remote-url <url> --auth-token <token> [--interval <seconds>]

REMOTE_URL=""
AUTH_TOKEN=""
INTERVAL=5
STONEFORGE_PORTS=()
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/stoneforge-boss"

while [[ $# -gt 0 ]]; do
  case $1 in
    --remote-url) REMOTE_URL="$2"; shift 2 ;;
    --auth-token) AUTH_TOKEN="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --ports) STONEFORGE_PORTS=(); IFS=',' read -ra STONEFORGE_PORTS <<< "$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$REMOTE_URL" ] || [ -z "$AUTH_TOKEN" ]; then
  echo "Usage: sync.sh --remote-url <feed-url> --auth-token <token>"
  echo "  --interval  Sync interval in seconds (default: 5)"
  echo "  --ports     Comma-separated Stoneforge ports (auto-detected from workspaces.conf)"
  exit 1
fi

# Auto-discover ports from workspaces.conf if not provided
if [ ${#STONEFORGE_PORTS[@]} -eq 0 ] && [ -f "$CONFIG_DIR/workspaces.conf" ]; then
  while IFS='|' read -r _name _script port; do
    [[ "$_name" =~ ^[[:space:]]*# ]] && continue
    [ -z "$port" ] && continue
    STONEFORGE_PORTS+=("$port")
  done < "$CONFIG_DIR/workspaces.conf"
fi

# Fallback to default port if still empty
if [ ${#STONEFORGE_PORTS[@]} -eq 0 ]; then
  STONEFORGE_PORTS=(3456)
fi

echo "[sync] Remote feed: $REMOTE_URL"
echo "[sync] Stoneforge ports: ${STONEFORGE_PORTS[*]}"
echo "[sync] Interval: ${INTERVAL}s"
echo ""

# Track what we've already pushed (source_id dedup)
declare -A SEEN_IDS

# POST to remote feed with Bearer auth
feed_post() {
  curl -sf -X POST "$REMOTE_URL$1" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "$2" 2>/dev/null || echo ""
}

# Collect posts from a single Stoneforge workspace
collect_from_workspace() {
  local port="$1"
  local base="http://localhost:$port"
  local posts="[]"

  # Check if workspace is alive
  if ! curl -sf -o /dev/null "$base/api/health" 2>/dev/null; then
    return
  fi

  # Get agents for this workspace
  local agents_raw
  agents_raw=$(curl -sf "$base/api/agents" 2>/dev/null) || true
  local agents_arr
  agents_arr=$(echo "$agents_raw" | jq '[(.agents // [])[] | {id: .id, name: (.name // .id), role: (.metadata.agent.agentRole // "worker")}]' 2>/dev/null) || agents_arr="[]"

  # Build agent lookup
  local agent_lookup
  agent_lookup=$(echo "$agents_arr" | jq 'map({(.id): .}) | add // {}' 2>/dev/null) || agent_lookup="{}"

  # Get recent tasks (all statuses — shows what agents are doing)
  local tasks_raw
  tasks_raw=$(curl -sf "$base/api/tasks?limit=50" 2>/dev/null) || true

  if [ -n "$tasks_raw" ] && command -v jq &>/dev/null; then
    local task_posts
    task_posts=$(echo "$tasks_raw" | jq --argjson agents "$agent_lookup" --arg port "$port" '
      (.tasks // []) | map(
        select(.updatedAt != null) |
        {
          agent_id: (.metadata.orchestrator.assignedAgent // .assignee // "system"),
          agent_name: (
            if (.metadata.orchestrator.assignedAgent // .assignee) then
              ($agents[.metadata.orchestrator.assignedAgent // .assignee].name // .assignee // "Agent")
            else "System" end
          ),
          agent_role: (
            if (.metadata.orchestrator.assignedAgent // .assignee) then
              ($agents[.metadata.orchestrator.assignedAgent // .assignee].role // "worker")
            else "system" end
          ),
          agent_avatar: "",
          content: (
            if .status == "closed" then "\u2705 Completed: " + (.title // "task")
            elif .status == "in_progress" then "\u{1F527} Working: " + (.title // "task")
            elif .status == "review" then "\u{1F50D} Review: " + (.title // "task")
            elif .status == "open" then "\u{1F4CB} Queued: " + (.title // "task")
            else (.status // "?") + ": " + (.title // "task")
            end
          ),
          image_url: null,
          source_type: (if .status == "closed" then "task" elif .status == "in_progress" then "tool" else "message" end),
          source_id: ("task-" + $port + "-" + .id),
          mentions: null
        }
      )
    ' 2>/dev/null) || task_posts="[]"

    posts=$(echo "$posts" "$task_posts" | jq -s 'add // []' 2>/dev/null) || true
  fi

  # Output posts and agents
  echo "$posts" | jq -c --argjson agents "$agents_arr" '{posts: ., agents: $agents}' 2>/dev/null
}

# Main sync push — collects from all workspaces, deduplicates, pushes
sync_push() {
  local all_posts="[]"
  local all_agents="[]"

  for port in "${STONEFORGE_PORTS[@]}"; do
    local result
    result=$(collect_from_workspace "$port") || continue
    [ -z "$result" ] && continue

    local wp
    wp=$(echo "$result" | jq '.posts // []' 2>/dev/null) || continue
    local wa
    wa=$(echo "$result" | jq '.agents // []' 2>/dev/null) || wa="[]"

    all_posts=$(echo "$all_posts" "$wp" | jq -s 'add // []' 2>/dev/null) || true
    all_agents=$(echo "$all_agents" "$wa" | jq -s 'add | unique_by(.id) // []' 2>/dev/null) || true
  done

  # Filter out already-seen posts
  local new_posts
  new_posts=$(echo "$all_posts" | jq '[.[] | select(.source_id != null)]' 2>/dev/null) || new_posts="[]"
  local count
  count=$(echo "$new_posts" | jq 'length' 2>/dev/null) || count=0

  if [ "$count" = "0" ]; then
    return
  fi

  # Push to remote
  local payload
  payload=$(jq -n --argjson posts "$new_posts" --argjson agents "$all_agents" \
    '{posts: $posts, agents: $agents}' 2>/dev/null) || return

  local result
  result=$(feed_post "/api/sync/push" "$payload")
  if [ -n "$result" ]; then
    local created
    created=$(echo "$result" | jq -r '.created // 0' 2>/dev/null)
    [ "$created" != "0" ] && echo "[sync] pushed $created new posts from ${#STONEFORGE_PORTS[@]} workspaces"
  fi
}

# --- Main loop ---
echo "[sync] starting sync loop..."
while true; do
  sync_push
  sleep "$INTERVAL"
done
