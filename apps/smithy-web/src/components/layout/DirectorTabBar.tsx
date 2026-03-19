/**
 * DirectorTabBar - Horizontal tab bar for switching between director sessions
 *
 * Shows one tab per director agent with name, status dot, and unread badge.
 * Includes a (+) button to open the agent creation modal with director role pre-selected.
 * Supports drag-and-drop reordering and right-click context menu for deletion.
 */

import { useCallback, useState } from 'react';
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
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Circle, Plus } from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';
import type { DirectorInfo } from '../../api/hooks/useAgents';

interface DirectorTabBarProps {
  directors: DirectorInfo[];
  activeDirectorId: string | null;
  onSelectDirector: (directorId: string) => void;
  onCreateDirector: () => void;
  onReorder: (orderedIds: string[]) => void;
  onDeleteDirector: (directorId: string) => void;
  unreadCounts: Record<string, number>;
}

function getStatusColor(info: DirectorInfo): string {
  if (info.error) return 'text-[var(--color-danger)]';
  if (info.isLoading) return 'text-[var(--color-warning)]';
  if (info.hasActiveSession) return 'text-[var(--color-success)]';
  return 'text-[var(--color-text-tertiary)]';
}

function getStatusDotFill(info: DirectorInfo): string {
  if (info.error) return 'fill-[var(--color-danger)]';
  if (info.isLoading) return 'fill-[var(--color-warning)]';
  if (info.hasActiveSession) return 'fill-[var(--color-success)]';
  return 'fill-[var(--color-text-tertiary)]';
}

function getStatusLabel(info: DirectorInfo): string {
  if (info.error) return 'Error';
  if (info.isLoading) return 'Connecting';
  if (info.hasActiveSession) return 'Running';
  return 'Idle';
}

// ============================================================================
// Context Menu
// ============================================================================

interface ContextMenuState {
  directorId: string;
  x: number;
  y: number;
}

function DirectorContextMenu({
  menu,
  onClose,
  onDelete,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onDelete: (directorId: string) => void;
}) {
  return (
    <>
      {/* Backdrop to dismiss */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-50 min-w-[160px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg py-1"
        style={{ left: menu.x, top: menu.y }}
        data-testid="director-tab-context-menu"
      >
        <button
          className="flex items-center w-full px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          onClick={() => {
            onDelete(menu.directorId);
            onClose();
          }}
          data-testid="director-tab-context-delete"
        >
          Delete Director
        </button>
      </div>
    </>
  );
}

// ============================================================================
// Tab Component (used for both regular rendering and drag overlay)
// ============================================================================

function DirectorTabInner({
  info,
  isActive,
  unreadCount,
  statusLabel,
  isDragging = false,
}: {
  info: DirectorInfo;
  isActive: boolean;
  unreadCount: number;
  statusLabel: string;
  isDragging?: boolean;
}) {
  const statusColor = getStatusColor(info);
  const statusFill = getStatusDotFill(info);

  return (
    <div
      className={`
        relative flex items-center gap-1.5 px-3 py-1.5 rounded-t-md
        text-sm font-medium transition-colors duration-150
        flex-shrink-0 cursor-pointer
        ${isActive
          ? 'text-[var(--color-text)] border-b-2 border-[var(--color-primary)] bg-[var(--color-surface-hover)]'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }
        ${isDragging ? 'opacity-50' : ''}
      `}
      title={`${info.director.name} — ${statusLabel} — ${
        info.director.metadata?.agent?.agentRole === 'director' && info.director.metadata.agent.targetBranch
          ? info.director.metadata.agent.targetBranch
          : 'auto'
      }`}
    >
      {/* Status dot */}
      <Circle className={`w-2 h-2 flex-shrink-0 ${statusColor} ${statusFill}`} />

      {/* Director name (truncated) */}
      <span className="truncate max-w-[120px]">
        {info.director.name}
      </span>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span
          className="flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)] text-white flex-shrink-0"
          data-testid={`director-tab-unread-${info.director.id}`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Sortable Tab Wrapper
// ============================================================================

function SortableDirectorTab({
  info,
  isActive,
  unreadCount,
  statusLabel,
  onSelect,
  onContextMenu,
}: {
  info: DirectorInfo;
  isActive: boolean;
  unreadCount: number;
  statusLabel: string;
  onSelect: (id: string) => void;
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

  const handleClick = useCallback(() => {
    onSelect(info.director.id);
  }, [info.director.id, onSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, info.director.id);
  }, [info.director.id, onContextMenu]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      data-testid={`director-tab-${info.director.id}`}
    >
      <DirectorTabInner
        info={info}
        isActive={isActive}
        unreadCount={unreadCount}
        statusLabel={statusLabel}
        isDragging={isDragging}
      />
    </div>
  );
}

// ============================================================================
// Main TabBar Component
// ============================================================================

export function DirectorTabBar({
  directors,
  activeDirectorId,
  onSelectDirector,
  onCreateDirector,
  onReorder,
  onDeleteDirector,
  unreadCounts,
}: DirectorTabBarProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const draggedDirector = draggedId ? directors.find((d) => d.director.id === draggedId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggedId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = directors.findIndex((d) => d.director.id === active.id);
    const newIndex = directors.findIndex((d) => d.director.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = directors.map((d) => d.director.id);
    const [movedId] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, movedId);

    onReorder(newOrder);
  }, [directors, onReorder]);

  const handleContextMenu = useCallback((e: React.MouseEvent, directorId: string) => {
    setContextMenu({ directorId, x: e.clientX, y: e.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu on Escape
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && contextMenu) {
      setContextMenu(null);
    }
  }, [contextMenu]);

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 bg-[var(--color-bg-secondary)]"
      data-testid="director-tab-bar"
      role="tablist"
      aria-label="Director tabs"
      onKeyDown={handleKeyDown}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={directors.map((d) => d.director.id)}
          strategy={horizontalListSortingStrategy}
        >
          {directors.map((info) => {
            const isActive = info.director.id === activeDirectorId;
            const unread = unreadCounts[info.director.id] ?? 0;
            const statusLabel = getStatusLabel(info);

            return (
              <SortableDirectorTab
                key={info.director.id}
                info={info}
                isActive={isActive}
                unreadCount={unread}
                statusLabel={statusLabel}
                onSelect={onSelectDirector}
                onContextMenu={handleContextMenu}
              />
            );
          })}
        </SortableContext>

        <DragOverlay>
          {draggedDirector && (
            <DirectorTabInner
              info={draggedDirector}
              isActive={draggedDirector.director.id === activeDirectorId}
              unreadCount={unreadCounts[draggedDirector.director.id] ?? 0}
              statusLabel={getStatusLabel(draggedDirector)}
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Create director button */}
      <Tooltip content="Create Director" side="bottom">
        <button
          onClick={onCreateDirector}
          className="flex-shrink-0 p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
          aria-label="Create Director"
          data-testid="director-tab-create"
        >
          <Plus className="w-4 h-4" />
        </button>
      </Tooltip>

      {/* Context Menu */}
      {contextMenu && (
        <DirectorContextMenu
          menu={contextMenu}
          onClose={handleCloseContextMenu}
          onDelete={onDeleteDirector}
        />
      )}
    </div>
  );
}

export default DirectorTabBar;
