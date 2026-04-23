import { useState } from "react";
import { GitBranch, Square, Zap, Cpu } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { NotificationInbox } from "./NotificationInbox";
import { SyncIndicator } from "./SyncIndicator";
import { PresenceStrip } from "./PresenceStrip";
import type { WorkspaceInfo, NotificationItem, AppMode, SyncStatus, StoneforgeUser, PresenceEntry, WorkspaceDaemonState } from "../mock-data";
import { mockHosts } from "./overlays/runtimes/runtime-mock-data";

type View =
  | "kanban"
  | "whiteboard"
  | "editor"
  | "merge-requests"
  | "ci"
  | "preview"
  | "sessions"
  | "diff"
  | "task-detail"
  | "automations"
  | "agents"
  | "runtimes"
  | "settings"
  | "documents"
  | "channels"
  | "plans"
  | "metrics"
  | "workspaces";

interface TopBarProps {
  activeView: View;
  onOpenSearch: () => void;
  activeWorkspace?: WorkspaceInfo;
  workspaces?: WorkspaceInfo[];
  onSwitchWorkspace?: (id: string) => void;
  notifications?: NotificationItem[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onNavigateToSettings?: () => void;
  appMode?: AppMode;
  syncStatus?: SyncStatus;
  workspacePresence?: StoneforgeUser[];
  presence?: PresenceEntry[];
  daemonState?: WorkspaceDaemonState | null;
  onNavigateToRuntimes?: () => void;
}

export function TopBar({
  activeView,
  onOpenSearch,
  activeWorkspace,
  workspaces = [],
  onSwitchWorkspace,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onNavigateToSettings,
  appMode = 'solo',
  syncStatus = 'synced',
  workspacePresence = [],
  presence = [],
  daemonState,
  onNavigateToRuntimes,
}: TopBarProps) {
  const isTeamMode = appMode === 'team'
  const daemonHost = daemonState ? mockHosts.find(h => h.id === daemonState.hostId) : null
  const daemonDotColor = daemonState?.status === 'running' ? 'var(--color-success)' : daemonState?.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'
  return (
    <div
      style={{
        height: 44,
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        gap: 12,
      }}
    >
      {/* Left: Workspace + Branch */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Passive workspace label — switching happens via Activity Rail */}
        {activeWorkspace && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 8px 4px 0",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "var(--radius-sm)",
                background: "var(--color-surface-active)",
                color: "var(--color-text-secondary)",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {activeWorkspace.icon}
            </span>
            <span className="workspace-name">{activeWorkspace.name}</span>
          </div>
        )}

        {/* Who's here — team mode presence strip */}
        {isTeamMode && workspacePresence.length > 0 && (
          <PresenceStrip users={workspacePresence} presence={presence} />
        )}

        <div
          className="topbar-branch"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            overflow: "hidden",
            flexShrink: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              color: "var(--color-text-secondary)",
              fontSize: 12,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <GitBranch size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 150,
              }}
            >
              main
            </span>
          </div>
        </div>
      </div>

      {/* Right: Action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Sync status — team mode only */}
        {isTeamMode && <SyncIndicator status={syncStatus} />}

        {/* Daemon indicator (both modes) */}
        {daemonState && (
          <Tooltip label={`Dispatch daemon ${daemonState.status} on ${daemonHost?.name || 'unknown'}${daemonState.status !== 'running' ? ' — autonomous workflows paused' : ''}`}>
            <button
              onClick={() => onNavigateToRuntimes?.()}
              style={{
                height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5,
                border: 'none', borderRadius: 'var(--radius-sm)',
                background: daemonState.status === 'error' ? 'var(--color-danger-subtle)' : 'var(--color-surface)',
                color: daemonState.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
                cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: `all var(--duration-fast)`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = daemonState.status === 'error' ? 'var(--color-danger-subtle)' : 'var(--color-surface-hover)'
                e.currentTarget.style.color = daemonState.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-secondary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = daemonState.status === 'error' ? 'var(--color-danger-subtle)' : 'var(--color-surface)'
                e.currentTarget.style.color = daemonState.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: daemonDotColor, flexShrink: 0 }} />
              <Cpu size={11} strokeWidth={1.5} />
              <span className="topbar-btn-label">{daemonHost?.name || 'daemon'}</span>
            </button>
          </Tooltip>
        )}

        {/* Autopilot + Stop — grouped with subtle background */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 3px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
          }}
        >
          <AutopilotButton />
          <StopAllButton />
        </div>

        {/* Notification inbox */}
        <NotificationInbox
          notifications={notifications}
          workspaces={workspaces}
          onMarkRead={(id) => onMarkNotificationRead?.(id)}
          onMarkAllRead={() => onMarkAllNotificationsRead?.()}
          onSwitch={(id) => {
            onSwitchWorkspace?.(id);
          }}
          onOpenSettings={() => onNavigateToSettings?.()}
          isTeamMode={isTeamMode}
        />

        {/* Command palette */}
        <Tooltip label="Command palette" shortcut="⌘K">
          <button
            onClick={onOpenSearch}
            style={{
              height: 22,
              padding: "0 8px",
              marginLeft: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
              color: "var(--color-text-tertiary)",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 500,
              transition: "all var(--duration-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-text-tertiary)";
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.color = "var(--color-text-tertiary)";
            }}
          >
            <span style={{ fontSize: 12 }}>⌘</span>K
          </button>
        </Tooltip>
      </div>
    </div>
  );
}


function AutopilotButton() {
  const [on, setOn] = useState(true);
  return (
    <Tooltip
      label={
        on ? "Autopilot on — click to pause" : "Autopilot off — click to resume"
      }
    >
      <button
        onClick={() => setOn(!on)}
        style={{
          height: 26,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          border: "none",
          borderRadius: "var(--radius-sm)",
          background: on ? "rgba(34,197,94,0.1)" : "var(--color-surface)",
          color: on ? "var(--color-success)" : "var(--color-text-tertiary)",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 500,
          transition: `all var(--duration-fast)`,
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = on
            ? "rgba(34,197,94,0.15)"
            : "var(--color-surface-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = on
            ? "rgba(34,197,94,0.1)"
            : "var(--color-surface)")
        }
      >
        <Zap size={12} strokeWidth={1.5} />
        <span className="topbar-btn-label">{on ? "Auto" : "Paused"}</span>
      </button>
    </Tooltip>
  );
}

function StopAllButton() {
  return (
    <Tooltip label="Stop all agents">
      <button
        style={{
          height: 26,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          border: "none",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-surface)",
          color: "var(--color-text-tertiary)",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 500,
          transition: `all var(--duration-fast)`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--color-danger)";
          e.currentTarget.style.background = "var(--color-danger-subtle)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--color-text-tertiary)";
          e.currentTarget.style.background = "var(--color-surface)";
        }}
      >
        <Square size={11} strokeWidth={2} />
        <span className="topbar-btn-label">Stop all</span>
      </button>
    </Tooltip>
  );
}

