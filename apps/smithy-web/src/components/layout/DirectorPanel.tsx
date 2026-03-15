/**
 * DirectorPanel - Right sidebar panel supporting N concurrent director sessions
 * with a tabbed interface.
 *
 * CRITICAL: All DirectorTabContent instances are mounted simultaneously using
 * CSS display:none for inactive tabs. Unmounting would kill WebSocket/PTY connections.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  PanelRightClose,
  Terminal,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';
import { useDirectors } from '../../api/hooks/useAgents';
import { useAgentInboxCount } from '../../api/hooks/useAgentInbox';
import { DirectorTabBar } from './DirectorTabBar';
import { DirectorTabContent } from './DirectorTabContent';
import { CreateAgentDialog } from '../agent/CreateAgentDialog';

// Panel width constraints
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 384; // w-96
const STORAGE_KEY = 'orchestrator-director-panel-width';
const ACTIVE_TAB_STORAGE_KEY = 'orchestrator-director-active-tab';

interface DirectorPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

/**
 * Hook to fetch unread counts for all directors
 */
function useDirectorUnreadCounts(directorIds: string[]): Record<string, number> {
  // We use individual useAgentInboxCount hooks via a wrapper component pattern,
  // but for simplicity here we'll use a single approach with the first few directors.
  // Since React hooks must be called unconditionally, we use a fixed-size approach.
  const q0 = useAgentInboxCount(directorIds[0] ?? null);
  const q1 = useAgentInboxCount(directorIds[1] ?? null);
  const q2 = useAgentInboxCount(directorIds[2] ?? null);
  const q3 = useAgentInboxCount(directorIds[3] ?? null);
  const q4 = useAgentInboxCount(directorIds[4] ?? null);

  return useMemo(() => {
    const counts: Record<string, number> = {};
    const queries = [q0, q1, q2, q3, q4];
    for (let i = 0; i < directorIds.length && i < 5; i++) {
      counts[directorIds[i]] = queries[i]?.data?.count ?? 0;
    }
    return counts;
  }, [directorIds, q0.data, q1.data, q2.data, q3.data, q4.data]);
}

export function DirectorPanel({ collapsed = false, onToggle, isMaximized = false, onToggleMaximize }: DirectorPanelProps) {
  const { directors, isLoading } = useDirectors();

  // Active tab state persisted to localStorage
  const [activeDirectorId, setActiveDirectorId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || null;
  });

  // Agent creation dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Persist active tab
  useEffect(() => {
    if (activeDirectorId) {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeDirectorId);
    }
  }, [activeDirectorId]);

  // Auto-select first director if no active tab or active tab not found
  useEffect(() => {
    if (directors.length > 0) {
      const activeExists = directors.some((d) => d.director.id === activeDirectorId);
      if (!activeExists) {
        setActiveDirectorId(directors[0].director.id);
      }
    } else {
      setActiveDirectorId(null);
    }
  }, [directors, activeDirectorId]);

  // Director IDs for unread counts
  const directorIds = useMemo(() => directors.map((d) => d.director.id), [directors]);
  const unreadCounts = useDirectorUnreadCounts(directorIds);

  // Panel width state with localStorage persistence
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        return parsed;
      }
    }
    return DEFAULT_WIDTH;
  });

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Persist width to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: width };
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Refresh terminal when maximize state changes
  // (handled per-tab via isVisible prop changes in DirectorTabContent)

  const handleSelectDirector = useCallback((directorId: string) => {
    setActiveDirectorId(directorId);
  }, []);

  const handleCreateDirector = useCallback(() => {
    setShowCreateDialog(true);
  }, []);

  const handleCloseCreateDialog = useCallback(() => {
    setShowCreateDialog(false);
  }, []);

  const handleCreateSuccess = useCallback((agent: { id: string; name: string }) => {
    setShowCreateDialog(false);
    // Auto-select the newly created director
    setActiveDirectorId(agent.id);
  }, []);

  // Handle collapsing a maximized panel: minimize first, then collapse
  const handleCollapse = useCallback(() => {
    if (isMaximized && onToggleMaximize) {
      onToggleMaximize();
    }
    onToggle?.();
  }, [isMaximized, onToggleMaximize, onToggle]);

  // Handle clicking a specific director in collapsed sidebar
  const handleCollapsedDirectorClick = useCallback((directorId: string) => {
    setActiveDirectorId(directorId);
    onToggle?.();
  }, [onToggle]);

  // ── Collapsed view ──────────────────────────────────────────────────────

  if (collapsed) {
    const hasDirectors = directors.length > 0;

    return (
      <aside
        className="flex flex-col items-center py-3 w-12 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] gap-1"
        data-testid="director-panel-collapsed"
      >
        {hasDirectors ? (
          // Tiled per-director icons
          directors.map((info) => {
            const directorUnread = unreadCounts[info.director.id] ?? 0;
            const statusDotColor = info.error
              ? 'bg-[var(--color-danger)]'
              : info.isLoading
                ? 'bg-[var(--color-warning)]'
                : info.hasActiveSession
                  ? 'bg-[var(--color-success)]'
                  : 'bg-[var(--color-text-tertiary)]';

            return (
              <Tooltip
                key={info.director.id}
                content={info.director.name}
                side="left"
              >
                <button
                  onClick={() => handleCollapsedDirectorClick(info.director.id)}
                  className="relative p-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
                  aria-label={`Open ${info.director.name}`}
                  data-testid={`director-collapsed-${info.director.id}`}
                >
                  <Terminal className="w-5 h-5" />
                  {/* Status dot */}
                  <div
                    className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${statusDotColor}`}
                  />
                  {/* Unread badge */}
                  {directorUnread > 0 && (
                    <span
                      className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)] text-white"
                      data-testid={`director-collapsed-unread-${info.director.id}`}
                    >
                      {directorUnread > 99 ? '99+' : directorUnread}
                    </span>
                  )}
                </button>
              </Tooltip>
            );
          })
        ) : (
          // Zero-director state: (+) button to create
          <Tooltip content="Create Director" side="left">
            <button
              onClick={handleCreateDirector}
              className="p-2 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label="Create Director"
              data-testid="director-collapsed-create"
            >
              <Plus className="w-5 h-5" />
            </button>
          </Tooltip>
        )}

        {/* Create Agent Dialog */}
        <CreateAgentDialog
          isOpen={showCreateDialog}
          onClose={handleCloseCreateDialog}
          initialRole="director"
          onSuccess={handleCreateSuccess}
        />
      </aside>
    );
  }

  // ── Expanded view ───────────────────────────────────────────────────────

  return (
    <aside
      className={`
        relative flex flex-col bg-[var(--color-bg-secondary)]
        ${isMaximized ? 'flex-1' : 'border-l border-[var(--color-border)]'}
      `}
      style={isMaximized ? undefined : { width: `${width}px` }}
      data-testid="director-panel"
    >
      {/* Resize handle - hidden when maximized */}
      {!isMaximized && (
        <div
          className={`
            absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10
            hover:bg-[var(--color-primary)] hover:opacity-50
            transition-colors duration-150
            ${isResizing ? 'bg-[var(--color-primary)] opacity-50' : ''}
          `}
          onMouseDown={handleResizeStart}
          data-testid="director-panel-resize-handle"
        />
      )}

      {/* Panel Header — "Directors" label + maximize + collapse (no per-director controls) */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <span className="text-sm font-medium text-[var(--color-text)]">Directors</span>
          {directors.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
              {directors.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip content={isMaximized ? "Restore Panel" : "Maximize Panel"} side="bottom">
            <button
              onClick={onToggleMaximize}
              className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label={isMaximized ? "Restore Panel" : "Maximize Panel"}
              data-testid="director-panel-maximize"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </Tooltip>
          <Tooltip content="Collapse Panel" side="left">
            <button
              onClick={handleCollapse}
              className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label="Collapse Director Panel"
              data-testid="director-panel-collapse"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Tab Bar — shown when there are directors */}
      {directors.length > 0 && (
        <DirectorTabBar
          directors={directors}
          activeDirectorId={activeDirectorId}
          onSelectDirector={handleSelectDirector}
          onCreateDirector={handleCreateDirector}
          unreadCounts={unreadCounts}
        />
      )}

      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {directors.length === 0 ? (
          // Zero-director empty state
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {isLoading ? (
              <>
                <RefreshCw className="w-8 h-8 text-[var(--color-text-muted)] mb-3 animate-spin" />
                <p className="text-sm text-[var(--color-text-muted)]">Loading directors...</p>
              </>
            ) : (
              <>
                <div className="relative mb-5">
                  <div className="absolute inset-0 bg-[var(--color-primary)]/10 blur-xl rounded-full scale-150" />
                  <div className="
                    relative p-4 rounded-xl
                    bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-bg)]
                    border border-[var(--color-border)]
                    shadow-lg
                  ">
                    <Users className="w-8 h-8 text-[var(--color-text-muted)]" />
                  </div>
                </div>
                <h3 className="text-base font-medium text-[var(--color-text)] mb-1">
                  No Directors
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] max-w-xs mb-5">
                  Create a Director agent to start orchestrating your workspace.
                </p>
                <button
                  onClick={handleCreateDirector}
                  className="
                    inline-flex items-center gap-2
                    px-5 py-2 rounded-lg
                    bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)]
                    hover:opacity-90
                    text-white font-medium text-sm
                    shadow-lg
                    transition-all duration-200
                    hover:scale-105
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:ring-offset-2
                  "
                  data-testid="director-panel-create-btn"
                >
                  <Plus className="w-4 h-4" />
                  Create Director
                </button>
              </>
            )}
          </div>
        ) : (
          // All DirectorTabContent instances mounted simultaneously.
          // Inactive tabs use CSS hidden class (display:none) — NOT conditional rendering.
          // Unmounting would kill WebSocket/PTY connections.
          directors.map((info) => (
            <DirectorTabContent
              key={info.director.id}
              info={info}
              isVisible={info.director.id === activeDirectorId}
              unreadCount={unreadCounts[info.director.id] ?? 0}
            />
          ))
        )}
      </div>

      {/* Create Agent Dialog */}
      <CreateAgentDialog
        isOpen={showCreateDialog}
        onClose={handleCloseCreateDialog}
        initialRole="director"
        onSuccess={handleCreateSuccess}
      />
    </aside>
  );
}
