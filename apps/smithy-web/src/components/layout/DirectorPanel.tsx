/**
 * DirectorPanel - Right sidebar panel supporting N concurrent director sessions
 * with a tabbed interface.
 *
 * CRITICAL: All DirectorTabContent instances are mounted simultaneously using
 * CSS display:none for inactive tabs. Unmounting would kill WebSocket/PTY connections.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PanelRightClose,
  Terminal,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Users,
  Pickaxe,
  Mail,
  Play,
  Square,
  RotateCcw,
  GitBranch,
  Check,
  X,
} from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';
import { useDirectors, useDeleteAgent, useStopAgentSession, useStartAgentSession, useChangeTargetBranch } from '../../api/hooks/useAgents';
import { useAgentInboxCount } from '../../api/hooks/useAgentInbox';
import { DirectorTabBar } from './DirectorTabBar';
import { DirectorTabContent } from './DirectorTabContent';
import { CreateAgentDialog } from '../agent/CreateAgentDialog';
import { DeleteAgentDialog } from '../agent/DeleteAgentDialog';

// Panel width constraints
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 384; // w-96
const STORAGE_KEY = 'orchestrator-director-panel-width';
const ACTIVE_TAB_STORAGE_KEY = 'orchestrator-director-active-tab';
const TAB_ORDER_STORAGE_KEY = 'orchestrator-director-tab-order';

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

/**
 * Load stored tab order from localStorage
 */
function loadTabOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(TAB_ORDER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

/**
 * Save tab order to localStorage
 */
function saveTabOrder(order: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TAB_ORDER_STORAGE_KEY, JSON.stringify(order));
}

/**
 * Sort directors according to stored order.
 * - Directors in stored order keep their stored position.
 * - New directors (not in stored order) appear at the end.
 * - Removed directors are pruned from stored order.
 */
function sortDirectorsByStoredOrder<T extends { director: { id: string } }>(
  directors: T[],
  storedOrder: string[]
): { sorted: T[]; cleanedOrder: string[] } {
  const directorIds = new Set(directors.map((d) => d.director.id));

  // Prune stored order of IDs that no longer exist
  const cleanedOrder = storedOrder.filter((id) => directorIds.has(id));

  // Directors in stored order
  const ordered: T[] = [];
  for (const id of cleanedOrder) {
    const d = directors.find((dir) => dir.director.id === id);
    if (d) ordered.push(d);
  }

  // New directors not in stored order
  const orderedSet = new Set(cleanedOrder);
  for (const d of directors) {
    if (!orderedSet.has(d.director.id)) {
      ordered.push(d);
      cleanedOrder.push(d.director.id);
    }
  }

  return { sorted: ordered, cleanedOrder };
}

// ============================================================================
// Collapsed Sidebar Context Menu
// ============================================================================

interface CollapsedContextMenuState {
  directorId: string;
  x: number;
  y: number;
}

function CollapsedContextMenu({
  menu,
  onClose,
  onDelete,
}: {
  menu: CollapsedContextMenuState;
  onClose: () => void;
  onDelete: (directorId: string) => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-50 min-w-[160px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg py-1"
        style={{ left: menu.x, top: menu.y }}
        data-testid="director-collapsed-context-menu"
      >
        <button
          className="flex items-center w-full px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          onClick={() => {
            onDelete(menu.directorId);
            onClose();
          }}
          data-testid="director-collapsed-context-delete"
        >
          Delete Director
        </button>
      </div>
    </>
  );
}

// ============================================================================
// Sortable Collapsed Director Icon
// ============================================================================

function SortableCollapsedDirectorIcon({
  info,
  unreadCount,
  onClick,
  onContextMenu,
}: {
  info: { director: { id: string; name: string }; error?: unknown; isLoading: boolean; hasActiveSession: boolean };
  unreadCount: number;
  onClick: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, directorId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: info.director.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const statusDotColor = info.error
    ? 'bg-[var(--color-danger)]'
    : info.isLoading
      ? 'bg-[var(--color-warning)]'
      : info.hasActiveSession
        ? 'bg-[var(--color-success)]'
        : 'bg-[var(--color-text-tertiary)]';

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Tooltip content={info.director.name} side="left">
        <button
          onClick={() => onClick(info.director.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(e, info.director.id);
          }}
          className={`relative p-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 ${isDragging ? 'opacity-50' : ''}`}
          aria-label={`Open ${info.director.name}`}
          data-testid={`director-collapsed-${info.director.id}`}
        >
          <Terminal className="w-5 h-5" />
          {/* Status dot */}
          <div
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${statusDotColor}`}
          />
          {/* Unread badge */}
          {unreadCount > 0 && (
            <span
              className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)] text-white"
              data-testid={`director-collapsed-unread-${info.director.id}`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Tooltip>
    </div>
  );
}

// ============================================================================
// Collapsed Director Icon (static, used in DragOverlay)
// ============================================================================

function CollapsedDirectorIconOverlay({
  info,
  unreadCount,
}: {
  info: { director: { id: string; name: string }; error?: unknown; isLoading: boolean; hasActiveSession: boolean };
  unreadCount: number;
}) {
  const statusDotColor = info.error
    ? 'bg-[var(--color-danger)]'
    : info.isLoading
      ? 'bg-[var(--color-warning)]'
      : info.hasActiveSession
        ? 'bg-[var(--color-success)]'
        : 'bg-[var(--color-text-tertiary)]';

  return (
    <div className="relative p-2 rounded-md text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)]">
      <Terminal className="w-5 h-5" />
      <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${statusDotColor}`} />
      {unreadCount > 0 && (
        <span className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)] text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Main DirectorPanel Component
// ============================================================================

export function DirectorPanel({ collapsed = false, onToggle, isMaximized = false, onToggleMaximize }: DirectorPanelProps) {
  const { directors: rawDirectors, isLoading } = useDirectors();
  const deleteAgentMutation = useDeleteAgent();
  const stopSessionMutation = useStopAgentSession();
  const startSessionMutation = useStartAgentSession();
  const changeTargetBranchMutation = useChangeTargetBranch();

  // Tab order state
  const [tabOrder, setTabOrder] = useState<string[]>(loadTabOrder);

  // Sort directors by stored order
  const { sorted: directors, cleanedOrder } = useMemo(
    () => sortDirectorsByStoredOrder(rawDirectors, tabOrder),
    [rawDirectors, tabOrder]
  );

  // Sync cleaned order back to state/storage when directors change
  useEffect(() => {
    if (cleanedOrder.join(',') !== tabOrder.join(',')) {
      setTabOrder(cleanedOrder);
      saveTabOrder(cleanedOrder);
    }
  }, [cleanedOrder, tabOrder]);

  // Active tab state persisted to localStorage
  const [activeDirectorId, setActiveDirectorId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || null;
  });

  // Agent creation dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    directorId: string;
    directorName: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Collapsed sidebar context menu
  const [collapsedContextMenu, setCollapsedContextMenu] = useState<CollapsedContextMenuState | null>(null);

  // Collapsed sidebar drag state
  const [collapsedDraggedId, setCollapsedDraggedId] = useState<string | null>(null);

  // Lifted messages queue state (keyed by director ID)
  const [messagesQueueVisible, setMessagesQueueVisible] = useState<Record<string, boolean>>({});

  // Branch indicator popover state
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [branchInputValue, setBranchInputValue] = useState('');
  const branchPopoverRef = useRef<HTMLDivElement>(null);

  // Close branch popover on click outside
  useEffect(() => {
    if (!branchPopoverOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (branchPopoverRef.current && !branchPopoverRef.current.contains(e.target as Node)) {
        setBranchPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [branchPopoverOpen]);

  // Terminal sendInput callbacks (keyed by director ID)
  const terminalSendInputRefs = useRef<Record<string, (text: string) => void>>({});

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

  // Listen for select-director-tab event (relayed from AppShell when
  // open-director-panel includes a specific directorId)
  useEffect(() => {
    const handleSelectTab = (e: Event) => {
      const detail = (e as CustomEvent<{ directorId: string }>).detail;
      if (detail?.directorId) {
        setActiveDirectorId(detail.directorId);
      }
    };
    window.addEventListener('select-director-tab', handleSelectTab);
    return () => window.removeEventListener('select-director-tab', handleSelectTab);
  }, []);

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

  // Messages queue toggle for a specific director
  const handleToggleMessagesQueue = useCallback((directorId: string) => {
    setMessagesQueueVisible((prev) => ({
      ...prev,
      [directorId]: !prev[directorId],
    }));
  }, []);

  // Terminal ready callback — stores sendInput for a director
  const handleTerminalReady = useCallback((directorId: string, sendInput: (text: string) => void) => {
    terminalSendInputRefs.current[directorId] = sendInput;
  }, []);

  // Sift backlog for active director
  const handleSiftBacklog = useCallback(() => {
    if (!activeDirectorId) return;
    const sendInput = terminalSendInputRefs.current[activeDirectorId];
    if (!sendInput) return;
    sendInput('Use your sift-backlog skill');
    setTimeout(() => {
      terminalSendInputRefs.current[activeDirectorId]?.('\r');
    }, 200);
  }, [activeDirectorId]);

  // Session controls for active director
  const handleStartActiveSession = useCallback(async () => {
    if (!activeDirectorId) return;
    try {
      await startSessionMutation.mutateAsync({ agentId: activeDirectorId });
    } catch (err) {
      console.error('Failed to start director session:', err);
    }
  }, [activeDirectorId, startSessionMutation]);

  const handleStopActiveSession = useCallback(async () => {
    if (!activeDirectorId) return;
    try {
      await stopSessionMutation.mutateAsync({ agentId: activeDirectorId, graceful: true });
    } catch (err) {
      console.error('Failed to stop director session:', err);
    }
  }, [activeDirectorId, stopSessionMutation]);

  const handleRestartActiveSession = useCallback(async () => {
    if (!activeDirectorId) return;
    try {
      await stopSessionMutation.mutateAsync({ agentId: activeDirectorId, graceful: true });
      await startSessionMutation.mutateAsync({ agentId: activeDirectorId });
    } catch (err) {
      console.error('Failed to restart director session:', err);
    }
  }, [activeDirectorId, stopSessionMutation, startSessionMutation]);

  // Handle clicking a specific director in collapsed sidebar
  const handleCollapsedDirectorClick = useCallback((directorId: string) => {
    setActiveDirectorId(directorId);
    onToggle?.();
  }, [onToggle]);

  // ── Reorder callback ──────────────────────────────────────────────────────

  const handleReorder = useCallback((orderedIds: string[]) => {
    setTabOrder(orderedIds);
    saveTabOrder(orderedIds);
  }, []);

  // ── Delete director flow ──────────────────────────────────────────────────

  const handleDeleteDirectorRequest = useCallback((directorId: string) => {
    const director = directors.find((d) => d.director.id === directorId);
    if (!director) return;
    setDeleteDialog({
      directorId,
      directorName: director.director.name,
    });
  }, [directors]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog) return;
    const { directorId } = deleteDialog;

    setIsDeleting(true);
    try {
      // Stop the session first if running
      const director = directors.find((d) => d.director.id === directorId);
      if (director?.hasActiveSession) {
        try {
          await stopSessionMutation.mutateAsync({ agentId: directorId, graceful: true });
        } catch {
          // Continue with deletion even if stop fails
        }
      }

      // Delete the agent
      await deleteAgentMutation.mutateAsync({ agentId: directorId });

      // Remove from tab order
      const newOrder = tabOrder.filter((id) => id !== directorId);
      setTabOrder(newOrder);
      saveTabOrder(newOrder);

      // Auto-select next tab
      if (activeDirectorId === directorId) {
        const currentIndex = directors.findIndex((d) => d.director.id === directorId);
        const remaining = directors.filter((d) => d.director.id !== directorId);
        if (remaining.length > 0) {
          // Pick the next tab, or the previous if we were at the end
          const nextIndex = Math.min(currentIndex, remaining.length - 1);
          setActiveDirectorId(remaining[nextIndex].director.id);
        } else {
          setActiveDirectorId(null);
        }
      }

      setDeleteDialog(null);
    } catch (error) {
      console.error('Failed to delete director:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteDialog, directors, activeDirectorId, tabOrder, deleteAgentMutation, stopSessionMutation]);

  const handleDeleteClose = useCallback(() => {
    if (!isDeleting) {
      setDeleteDialog(null);
    }
  }, [isDeleting]);

  // ── Collapsed sidebar DnD ─────────────────────────────────────────────────

  const collapsedSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const collapsedDraggedDirector = collapsedDraggedId
    ? directors.find((d) => d.director.id === collapsedDraggedId)
    : null;

  const handleCollapsedDragStart = useCallback((event: DragStartEvent) => {
    setCollapsedDraggedId(event.active.id as string);
  }, []);

  const handleCollapsedDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setCollapsedDraggedId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = directors.findIndex((d) => d.director.id === active.id);
    const newIndex = directors.findIndex((d) => d.director.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = directors.map((d) => d.director.id);
    const [movedId] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, movedId);

    handleReorder(newOrder);
  }, [directors, handleReorder]);

  const handleCollapsedContextMenu = useCallback((e: React.MouseEvent, directorId: string) => {
    setCollapsedContextMenu({ directorId, x: e.clientX, y: e.clientY });
  }, []);

  const handleCloseCollapsedContextMenu = useCallback(() => {
    setCollapsedContextMenu(null);
  }, []);

  // ── Collapsed view ──────────────────────────────────────────────────────

  if (collapsed) {
    const hasDirectors = directors.length > 0;

    return (
      <aside
        className="flex flex-col items-center py-3 w-12 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] gap-1"
        data-testid="director-panel-collapsed"
      >
        {hasDirectors ? (
          <DndContext
            sensors={collapsedSensors}
            collisionDetection={closestCenter}
            onDragStart={handleCollapsedDragStart}
            onDragEnd={handleCollapsedDragEnd}
          >
            <SortableContext
              items={directors.map((d) => d.director.id)}
              strategy={verticalListSortingStrategy}
            >
              {directors.map((info) => (
                <SortableCollapsedDirectorIcon
                  key={info.director.id}
                  info={info}
                  unreadCount={unreadCounts[info.director.id] ?? 0}
                  onClick={handleCollapsedDirectorClick}
                  onContextMenu={handleCollapsedContextMenu}
                />
              ))}
            </SortableContext>

            <DragOverlay>
              {collapsedDraggedDirector && (
                <CollapsedDirectorIconOverlay
                  info={collapsedDraggedDirector}
                  unreadCount={unreadCounts[collapsedDraggedDirector.director.id] ?? 0}
                />
              )}
            </DragOverlay>
          </DndContext>
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

        {/* Collapsed context menu */}
        {collapsedContextMenu && (
          <CollapsedContextMenu
            menu={collapsedContextMenu}
            onClose={handleCloseCollapsedContextMenu}
            onDelete={handleDeleteDirectorRequest}
          />
        )}

        {/* Create Agent Dialog */}
        <CreateAgentDialog
          isOpen={showCreateDialog}
          onClose={handleCloseCreateDialog}
          initialRole="director"
          onSuccess={handleCreateSuccess}
        />

        {/* Delete Agent Dialog */}
        <DeleteAgentDialog
          isOpen={deleteDialog !== null}
          onClose={handleDeleteClose}
          agentName={deleteDialog?.directorName ?? ''}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
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

      {/* Combined header row — tabs (left, scrollable) + active director actions + panel actions (right) */}
      <div className="flex items-center h-10 bg-[var(--color-bg-secondary)]" data-testid="director-panel-header">
        {/* Left side: scrollable tabs */}
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          {directors.length > 0 && (
            <DirectorTabBar
              directors={directors}
              activeDirectorId={activeDirectorId}
              onSelectDirector={handleSelectDirector}
              onCreateDirector={handleCreateDirector}
              onReorder={handleReorder}
              onDeleteDirector={handleDeleteDirectorRequest}
              unreadCounts={unreadCounts}
            />
          )}
        </div>

        {/* Right side: active director actions + separator + panel actions */}
        <div className="flex-shrink-0 flex items-center gap-0.5 px-2">
          {/* Active director action buttons */}
          {activeDirectorId && (() => {
            const activeInfo = directors.find((d) => d.director.id === activeDirectorId);
            if (!activeInfo) return null;
            const activeUnread = unreadCounts[activeDirectorId] ?? 0;

            return (
              <>
                {/* Branch Indicator */}
                {(() => {
                  const meta = activeInfo.director.metadata?.agent;
                  const currentBranch = meta?.agentRole === 'director' && 'targetBranch' in meta
                    ? (meta as { targetBranch?: string }).targetBranch ?? null
                    : null;
                  const displayBranch = currentBranch || 'auto';

                  return (
                    <div className="relative">
                      <Tooltip content={`Target branch: ${displayBranch}`} side="bottom">
                        <button
                          onClick={() => {
                            setBranchInputValue(currentBranch ?? '');
                            setBranchPopoverOpen((prev) => !prev);
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium
                            bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]
                            hover:text-[var(--color-text)] hover:bg-[var(--color-border)]
                            transition-colors duration-150 cursor-pointer max-w-[120px]"
                          aria-label={`Target branch: ${displayBranch}`}
                          data-testid={`director-branch-indicator-${activeDirectorId}`}
                        >
                          <GitBranch className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{displayBranch}</span>
                        </button>
                      </Tooltip>

                      {/* Branch edit popover */}
                      {branchPopoverOpen && (
                        <div
                          ref={branchPopoverRef}
                          className="absolute top-full right-0 mt-1 z-50 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg p-2 min-w-[200px]"
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setBranchPopoverOpen(false);
                            }
                          }}
                        >
                          <label className="block text-[10px] font-medium text-[var(--color-text-tertiary)] mb-1">
                            Target Branch
                          </label>
                          <input
                            type="text"
                            value={branchInputValue}
                            onChange={(e) => setBranchInputValue(e.target.value)}
                            placeholder="auto-detect"
                            autoFocus
                            className="w-full px-2 py-1 text-xs rounded-md border border-[var(--color-border)]
                              bg-[var(--color-bg-primary)] text-[var(--color-text)]
                              placeholder:text-[var(--color-text-tertiary)]
                              focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newVal = branchInputValue.trim() || null;
                                changeTargetBranchMutation.mutate(
                                  { agentId: activeDirectorId!, targetBranch: newVal },
                                  { onSuccess: () => setBranchPopoverOpen(false) }
                                );
                              }
                            }}
                            data-testid={`director-branch-input-${activeDirectorId}`}
                          />
                          <div className="flex items-center gap-1 mt-1.5">
                            <button
                              onClick={() => {
                                const newVal = branchInputValue.trim() || null;
                                changeTargetBranchMutation.mutate(
                                  { agentId: activeDirectorId!, targetBranch: newVal },
                                  { onSuccess: () => setBranchPopoverOpen(false) }
                                );
                              }}
                              disabled={changeTargetBranchMutation.isPending}
                              className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium rounded-md
                                bg-[var(--color-primary)] text-white hover:opacity-90
                                transition-colors duration-150 disabled:opacity-50"
                              data-testid={`director-branch-save-${activeDirectorId}`}
                            >
                              <Check className="w-3 h-3" />
                              Save
                            </button>
                            <button
                              onClick={() => {
                                changeTargetBranchMutation.mutate(
                                  { agentId: activeDirectorId!, targetBranch: null },
                                  {
                                    onSuccess: () => {
                                      setBranchInputValue('');
                                      setBranchPopoverOpen(false);
                                    },
                                  }
                                );
                              }}
                              disabled={changeTargetBranchMutation.isPending}
                              className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium rounded-md
                                text-[var(--color-text-secondary)] hover:text-[var(--color-text)]
                                hover:bg-[var(--color-surface-hover)]
                                transition-colors duration-150 disabled:opacity-50"
                              data-testid={`director-branch-clear-${activeDirectorId}`}
                            >
                              <X className="w-3 h-3" />
                              Clear
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Separator between branch indicator and action buttons */}
                <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />

                {/* Sift Backlog Button — only when active director has a session */}
                {activeInfo.hasActiveSession && (
                  <Tooltip content="Sift Backlog" side="bottom">
                    <button
                      onClick={handleSiftBacklog}
                      className="p-1 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
                      aria-label="Sift Backlog"
                      data-testid={`director-sift-backlog-${activeDirectorId}`}
                    >
                      <Pickaxe className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                )}

                {/* Messages Queue Toggle */}
                <Tooltip
                  content={messagesQueueVisible[activeDirectorId] ? 'Hide pending messages' : 'Show pending messages'}
                  side="bottom"
                >
                  <button
                    onClick={() => handleToggleMessagesQueue(activeDirectorId)}
                    className={`relative p-1 rounded-md transition-colors duration-150 ${
                      messagesQueueVisible[activeDirectorId]
                        ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                    }`}
                    aria-label={messagesQueueVisible[activeDirectorId] ? 'Hide pending messages' : 'Show pending messages'}
                    data-testid={`toggle-messages-queue-${activeDirectorId}`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {activeUnread > 0 && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 text-[9px] font-bold rounded-full bg-[var(--color-primary)] text-white">
                        {activeUnread > 99 ? '99+' : activeUnread}
                      </span>
                    )}
                  </button>
                </Tooltip>

                {/* Session Controls */}
                {!activeInfo.hasActiveSession ? (
                  <Tooltip content="Start Session" side="bottom">
                    <button
                      onClick={handleStartActiveSession}
                      disabled={startSessionMutation.isPending}
                      className="p-1 rounded-md text-[var(--color-success)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                      aria-label="Start Session"
                      data-testid={`director-start-${activeDirectorId}`}
                    >
                      {startSessionMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </Tooltip>
                ) : (
                  <>
                    <Tooltip content="Restart Session" side="bottom">
                      <button
                        onClick={handleRestartActiveSession}
                        disabled={stopSessionMutation.isPending || startSessionMutation.isPending}
                        className="p-1 rounded-md text-[var(--color-warning)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                        aria-label="Restart Session"
                        data-testid={`director-restart-${activeDirectorId}`}
                      >
                        {(stopSessionMutation.isPending || startSessionMutation.isPending) ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </Tooltip>
                    <Tooltip content="Stop Session" side="bottom">
                      <button
                        onClick={handleStopActiveSession}
                        disabled={stopSessionMutation.isPending}
                        className="p-1 rounded-md text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                        aria-label="Stop Session"
                        data-testid={`director-stop-${activeDirectorId}`}
                      >
                        {stopSessionMutation.isPending ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </Tooltip>
                  </>
                )}
              </>
            );
          })()}

          {/* Separator */}
          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

          {/* Panel actions: maximize + collapse */}
          <Tooltip content={isMaximized ? "Restore Panel" : "Maximize Panel"} side="bottom">
            <button
              onClick={onToggleMaximize}
              className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label={isMaximized ? "Restore Panel" : "Maximize Panel"}
              data-testid="director-panel-maximize"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </Tooltip>
          <Tooltip content="Collapse Panel" side="left">
            <button
              onClick={handleCollapse}
              className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label="Collapse Director Panel"
              data-testid="director-panel-collapse"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

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
              showMessagesQueue={!!messagesQueueVisible[info.director.id]}
              onTerminalReady={(sendInput) => handleTerminalReady(info.director.id, sendInput)}
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

      {/* Delete Agent Dialog */}
      <DeleteAgentDialog
        isOpen={deleteDialog !== null}
        onClose={handleDeleteClose}
        agentName={deleteDialog?.directorName ?? ''}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </aside>
  );
}
