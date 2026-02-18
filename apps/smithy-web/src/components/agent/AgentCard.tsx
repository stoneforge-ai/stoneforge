/**
 * AgentCard - Card component for displaying agent information
 *
 * Shows agent name, role, status, capabilities, and actions.
 */

import { useState, useRef, useEffect } from 'react';
import { Play, Square, RefreshCw, Terminal, MoreVertical, Clock, GitBranch, Pencil, Inbox, Trash2, ArrowLeftRight, Settings, Zap } from 'lucide-react';
import type { Agent, WorkerMetadata, StewardMetadata, SessionStatus } from '../../api/types';
import { AgentStatusBadge } from './AgentStatusBadge';
import { AgentRoleBadge } from './AgentRoleBadge';
import { Tooltip } from '@stoneforge/ui';
import { useAgentInboxCount } from '../../api/hooks/useAgentInbox';
import { AgentInboxDrawer } from './AgentInboxDrawer';
import { ChangeProviderDialog } from './ChangeProviderDialog';
import { getProviderLabel } from '../../lib/providers';
import { ChangeModelDialog } from './ChangeModelDialog';
import { ChangeTriggerDialog } from './ChangeTriggerDialog';

interface AgentCardProps {
  agent: Agent;
  activeSessionStatus?: SessionStatus;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onOpenTerminal?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  isStarting?: boolean;
  isStopping?: boolean;
}

export function AgentCard({
  agent,
  activeSessionStatus,
  onStart,
  onStop,
  onRestart,
  onOpenTerminal,
  onRename,
  onDelete,
  isStarting,
  isStopping,
}: AgentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [changeProviderOpen, setChangeProviderOpen] = useState(false);
  const [changeModelOpen, setChangeModelOpen] = useState(false);
  const [changeTriggersOpen, setChangeTriggersOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch inbox count for the agent
  const { data: inboxCountData } = useAgentInboxCount(agent.id);
  const unreadCount = inboxCountData?.count ?? 0;

  const agentMeta = agent.metadata?.agent;
  const isRunning = activeSessionStatus === 'running' || activeSessionStatus === 'starting';
  const canStart = !isRunning && !isStarting;
  const canStop = isRunning && !isStopping;

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Extract role-specific metadata
  const workerMeta = agentMeta?.agentRole === 'worker' ? (agentMeta as WorkerMetadata) : null;
  const stewardMeta = agentMeta?.agentRole === 'steward' ? (agentMeta as StewardMetadata) : null;

  return (
    <div
      className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] transition-colors duration-150"
      data-testid={`agent-card-${agent.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-semibold text-[var(--color-text)] truncate"
              data-testid={`agent-name-${agent.id}`}
            >
              {agent.name}
            </h3>
            <AgentStatusBadge
              status={activeSessionStatus ?? 'idle'}
              size="sm"
              showLabel={false}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <AgentRoleBadge
              role={agentMeta?.agentRole ?? 'worker'}
              workerMode={workerMeta?.workerMode}
              stewardFocus={stewardMeta?.stewardFocus}
              size="sm"
            />
            <span
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-tertiary)] border border-[var(--color-border)]"
              data-testid={`agent-provider-${agent.id}`}
            >
              {getProviderLabel(agentMeta?.provider || 'claude').toLowerCase()}
            </span>
            {agentMeta?.model && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-tertiary)] border border-[var(--color-border)]"
                data-testid={`agent-model-${agent.id}`}
              >
                {agentMeta.model}
              </span>
            )}
          </div>
          {agentMeta?.executablePath && (
            <div
              className="mt-1 text-xs text-[var(--color-text-tertiary)] font-mono truncate"
              data-testid={`agent-executable-path-${agent.id}`}
              title={agentMeta.executablePath}
            >
              Path: {agentMeta.executablePath}
            </div>
          )}
        </div>

        {/* Actions dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid={`agent-menu-${agent.id}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div
              className="
                absolute right-0 top-full mt-1 z-20
                min-w-36 py-1 rounded-md shadow-lg
                bg-[var(--color-bg)] border border-[var(--color-border)]
              "
              data-testid={`agent-menu-dropdown-${agent.id}`}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRename?.();
                }}
                className="
                  w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm
                  text-[var(--color-text-secondary)]
                  hover:bg-[var(--color-surface-hover)]
                  hover:text-[var(--color-text)]
                "
                data-testid={`agent-rename-${agent.id}`}
              >
                <Pencil className="w-3.5 h-3.5" />
                Rename agent
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setChangeProviderOpen(true);
                }}
                className="
                  w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm
                  text-[var(--color-text-secondary)]
                  hover:bg-[var(--color-surface-hover)]
                  hover:text-[var(--color-text)]
                  whitespace-nowrap
                "
                data-testid={`agent-change-provider-${agent.id}`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Change provider
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setChangeModelOpen(true);
                }}
                className="
                  w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm
                  text-[var(--color-text-secondary)]
                  hover:bg-[var(--color-surface-hover)]
                  hover:text-[var(--color-text)]
                  whitespace-nowrap
                "
                data-testid={`agent-change-model-${agent.id}`}
              >
                <Settings className="w-3.5 h-3.5" />
                Change model
              </button>
              {stewardMeta && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setChangeTriggersOpen(true);
                  }}
                  className="
                    w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm
                    text-[var(--color-text-secondary)]
                    hover:bg-[var(--color-surface-hover)]
                    hover:text-[var(--color-text)]
                    whitespace-nowrap
                  "
                  data-testid={`agent-change-triggers-${agent.id}`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Change triggers
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete?.();
                }}
                className="
                  w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm
                  text-[var(--color-danger)]
                  hover:bg-[var(--color-surface-hover)]
                "
                data-testid={`agent-delete-${agent.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete agent
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Worker-specific info */}
      {workerMeta?.branch && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="truncate font-mono text-xs">{workerMeta.branch}</span>
        </div>
      )}

      {/* Steward-specific info */}
      {stewardMeta?.lastExecutedAt && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          <Clock className="w-3.5 h-3.5" />
          <span>Last run: {formatRelativeTime(stewardMeta.lastExecutedAt)}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-2">
        {canStart && onStart && (
          <Tooltip content="Start agent">
            <button
              onClick={onStart}
              disabled={isStarting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-white bg-[var(--color-success)] rounded-md hover:bg-[var(--color-success-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`agent-start-${agent.id}`}
            >
              <Play className="w-3.5 h-3.5" />
              {isStarting ? 'Starting...' : 'Start'}
            </button>
          </Tooltip>
        )}
        {canStop && onStop && (
          <Tooltip content="Stop agent">
            <button
              onClick={onStop}
              disabled={isStopping}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] rounded-md hover:bg-[var(--color-danger-muted-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`agent-stop-${agent.id}`}
            >
              <Square className="w-3.5 h-3.5" />
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          </Tooltip>
        )}
        {isRunning && onOpenTerminal && (
          <Tooltip content="Open in Workspace">
            <button
              onClick={onOpenTerminal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-elevated)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
              data-testid={`agent-terminal-${agent.id}`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Open
            </button>
          </Tooltip>
        )}

        {/* Inbox button */}
        <Tooltip content={unreadCount > 0 ? `${unreadCount} unread messages` : 'View inbox'}>
          <button
            onClick={() => setInboxOpen(true)}
            className="relative p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid={`agent-inbox-${agent.id}`}
          >
            <Inbox className="w-4 h-4" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center text-[10px] font-medium text-white bg-blue-500 rounded-full px-0.5"
                data-testid={`agent-inbox-badge-${agent.id}`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </Tooltip>

        {onRestart && (
          <Tooltip content="Restart agent">
            <button
              onClick={onRestart}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
              data-testid={`agent-restart-${agent.id}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Inbox Drawer */}
      <AgentInboxDrawer
        isOpen={inboxOpen}
        onClose={() => setInboxOpen(false)}
        agentId={agent.id}
        agentName={agent.name}
      />

      {/* Change Provider Dialog */}
      <ChangeProviderDialog
        isOpen={changeProviderOpen}
        onClose={() => setChangeProviderOpen(false)}
        agentId={agent.id}
        currentProvider={agentMeta?.provider ?? 'claude'}
        currentExecutablePath={agentMeta?.executablePath}
      />

      {/* Change Model Dialog */}
      <ChangeModelDialog
        isOpen={changeModelOpen}
        onClose={() => setChangeModelOpen(false)}
        agentId={agent.id}
        currentModel={agentMeta?.model}
        currentProvider={agentMeta?.provider ?? 'claude'}
      />

      {/* Change Triggers Dialog (steward only) */}
      {stewardMeta && (
        <ChangeTriggerDialog
          isOpen={changeTriggersOpen}
          onClose={() => setChangeTriggersOpen(false)}
          agentId={agent.id}
          currentTriggers={stewardMeta.triggers ?? []}
        />
      )}
    </div>
  );
}

/**
 * Format a timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
