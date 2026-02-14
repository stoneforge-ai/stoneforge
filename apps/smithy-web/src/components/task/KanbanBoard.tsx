/**
 * KanbanBoard - Drag-and-drop kanban board for orchestrator tasks
 *
 * Features:
 * - @dnd-kit drag-and-drop for status changes
 * - Per-column filtering and sorting
 * - Virtualized columns for performance
 * - Orchestrator-specific columns (Unassigned, Assigned, In Progress, Closed, Awaiting Merge)
 * - Column preferences stored in localStorage
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
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
  Archive,
  Inbox,
  UserCheck,
  Play,
  CheckCircle2,
  GitMerge,
  Filter,
  ArrowUpDown,
  Clock,
  User,
} from 'lucide-react';
import type { Task, MergeStatus } from '../../api/types';
import type { SortField, SortDirection } from '../../lib/task-constants';
import { SORT_OPTIONS, PRIORITY_OPTIONS } from '../../lib/task-constants';

// Storage for scroll positions
const kanbanScrollPositionStore = new Map<string, number>();

// ============================================================================
// Types
// ============================================================================

interface ColumnFilters {
  assignee: string | null;
  priority: number | null;
  tag: string | null;
}

interface ColumnSort {
  field: SortField;
  direction: SortDirection;
}

interface ColumnPreferences {
  filters: ColumnFilters;
  sortOverride: ColumnSort | null;
}

interface TaskUpdate {
  status?: string;
  assignee?: string | null;
}

interface KanbanBoardProps {
  tasks: Task[];
  entityNameMap: Map<string, string>;
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: TaskUpdate) => void;
  searchQuery?: string;
  pageSort?: { field: string; direction: SortDirection };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FILTERS: ColumnFilters = {
  assignee: null,
  priority: null,
  tag: null,
};

const DEFAULT_PAGE_SORT: ColumnSort = {
  field: 'created_at',
  direction: 'desc',
};

// Orchestrator-specific columns
const COLUMNS = [
  { id: 'backlog', title: 'Backlog', icon: Archive, color: 'border-slate-400', iconColor: 'text-slate-500' },
  { id: 'unassigned', title: 'Unassigned', icon: Inbox, color: 'border-gray-400', iconColor: 'text-gray-500' },
  { id: 'assigned', title: 'Assigned', icon: UserCheck, color: 'border-blue-400', iconColor: 'text-blue-500' },
  { id: 'in_progress', title: 'In Progress', icon: Play, color: 'border-yellow-400', iconColor: 'text-yellow-500' },
  { id: 'awaiting_merge', title: 'Awaiting Merge', icon: GitMerge, color: 'border-purple-400', iconColor: 'text-purple-500' },
  { id: 'closed', title: 'Closed', icon: CheckCircle2, color: 'border-green-400', iconColor: 'text-green-500' },
] as const;

const TASK_CARD_HEIGHT = 120;
const TASK_CARD_GAP = 8;

const PRIORITY_COLORS: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-yellow-500',
  4: 'border-l-green-500',
  5: 'border-l-gray-400',
};

const TASK_TYPE_COLORS: Record<string, string> = {
  bug: 'bg-red-50 dark:bg-red-900/20',
  feature: 'bg-purple-50 dark:bg-purple-900/20',
  task: 'bg-blue-50 dark:bg-blue-900/20',
  chore: 'bg-gray-50 dark:bg-gray-800/50',
};

// ============================================================================
// Utility Functions
// ============================================================================

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function useColumnPreferences(columnId: string): [ColumnPreferences, (prefs: Partial<ColumnPreferences>) => void] {
  const storageKey = `orchestrator-kanban-column-${columnId}`;

  const [preferences, setPreferences] = useState<ColumnPreferences>(() => {
    if (typeof window === 'undefined') {
      return { filters: { ...DEFAULT_FILTERS }, sortOverride: null };
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          filters: { ...DEFAULT_FILTERS, ...parsed.filters },
          sortOverride: parsed.sortOverride || null,
        };
      }
    } catch {
      // Ignore parse errors
    }
    return { filters: { ...DEFAULT_FILTERS }, sortOverride: null };
  });

  const updatePreferences = useCallback((updates: Partial<ColumnPreferences>) => {
    setPreferences((prev) => {
      const next: ColumnPreferences = {
        filters: { ...prev.filters, ...(updates.filters || {}) },
        sortOverride: 'sortOverride' in updates ? updates.sortOverride ?? null : prev.sortOverride,
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [storageKey]);

  return [preferences, updatePreferences];
}

function applyFiltersAndSort(
  tasks: Task[],
  filters: ColumnFilters,
  sort: ColumnSort,
  searchQuery?: string
): Task[] {
  let result = [...tasks];

  // Apply search filter
  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    result = result.filter((t) =>
      t.title.toLowerCase().includes(lowerQuery) ||
      t.id.toLowerCase().includes(lowerQuery)
    );
  }

  // Apply filters
  if (filters.assignee) {
    result = result.filter((t) => t.assignee === filters.assignee);
  }
  if (filters.priority !== null) {
    result = result.filter((t) => t.priority === filters.priority);
  }
  if (filters.tag) {
    result = result.filter((t) => t.tags?.includes(filters.tag!));
  }

  // Apply sorting
  result.sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case 'priority':
        comparison = a.priority - b.priority;
        break;
      case 'created_at':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'updated_at':
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case 'deadline': {
        const aDeadline = a.deadline;
        const bDeadline = b.deadline;
        if (!aDeadline && !bDeadline) comparison = 0;
        else if (!aDeadline) comparison = 1;
        else if (!bDeadline) comparison = -1;
        else comparison = new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
        break;
      }
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'complexity':
        comparison = a.complexity - b.complexity;
        break;
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });

  return result;
}

function getUniqueAssignees(tasks: Task[]): string[] {
  const assignees = new Set<string>();
  tasks.forEach((t) => {
    if (t.assignee) assignees.add(t.assignee);
  });
  return Array.from(assignees).sort();
}

function getUniqueTags(tasks: Task[]): string[] {
  const tags = new Set<string>();
  tasks.forEach((t) => {
    t.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

// ============================================================================
// Task Card Components
// ============================================================================

interface TaskCardProps {
  task: Task;
  entityNameMap: Map<string, string>;
  isSelected: boolean;
  onClick: () => void;
  isDragging?: boolean;
}

function TaskCard({ task, entityNameMap, isSelected, onClick, isDragging = false }: TaskCardProps) {
  const priorityBorder = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];
  const typeColor = TASK_TYPE_COLORS[task.taskType] || '';
  const assigneeName = task.assignee ? entityNameMap.get(task.assignee) : undefined;
  const branch = task.metadata?.orchestrator?.branch;
  const mergeStatus = task.metadata?.orchestrator?.mergeStatus;

  return (
    <div
      className={`
        p-3 bg-[var(--color-surface)] rounded-lg shadow-sm border-l-4 ${priorityBorder} ${typeColor}
        cursor-pointer transition-all hover:shadow-md h-full flex flex-col
        ${isSelected ? 'ring-2 ring-[var(--color-primary)]' : 'border-t border-r border-b border-[var(--color-border)]'}
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={onClick}
      data-testid={`kanban-card-${task.id}`}
    >
      <div className="font-medium text-[var(--color-text)] text-sm mb-1 line-clamp-2 break-words">{task.title}</div>
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] mb-2">
        <span className="font-mono truncate max-w-20">{task.id.slice(0, 8)}</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-auto">
        <span className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] rounded capitalize">
          {task.taskType}
        </span>
        {assigneeName && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded truncate max-w-24">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{assigneeName}</span>
          </span>
        )}
        {branch && (
          <span className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] rounded truncate max-w-20 font-mono">
            {branch.split('/').pop()}
          </span>
        )}
        {mergeStatus && (
          <MergeStatusBadge status={mergeStatus} />
        )}
      </div>
    </div>
  );
}

function MergeStatusBadge({ status }: { status: MergeStatus }) {
  const colors: Record<MergeStatus, string> = {
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    testing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    merging: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
    merged: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    conflict: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    test_failed: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    not_applicable: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <span className={`px-1.5 py-0.5 text-xs rounded ${colors[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function SortableTaskCard({
  task,
  entityNameMap,
  isSelected,
  onClick,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="h-full" {...attributes} {...listeners}>
      <TaskCard
        task={task}
        entityNameMap={entityNameMap}
        isSelected={isSelected}
        onClick={onClick}
        isDragging={isDragging}
      />
    </div>
  );
}

// ============================================================================
// Filter/Sort Dropdown
// ============================================================================

interface FilterSortDropdownProps {
  columnId: string;
  availableAssignees: string[];
  availableTags: string[];
  preferences: ColumnPreferences;
  pageSort: ColumnSort;
  onUpdate: (updates: Partial<ColumnPreferences>) => void;
  entityNameMap: Map<string, string>;
}

function FilterSortDropdown({
  columnId,
  availableAssignees,
  availableTags,
  preferences,
  pageSort,
  onUpdate,
  entityNameMap,
}: FilterSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeFilters = [
    preferences.filters.assignee,
    preferences.filters.priority,
    preferences.filters.tag,
  ].filter(Boolean).length;

  const hasCustomSort = preferences.sortOverride !== null;
  const effectiveSort = preferences.sortOverride || pageSort;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearFilters = () => {
    onUpdate({ filters: DEFAULT_FILTERS });
  };

  const handleSortFieldChange = (field: SortField | 'page') => {
    if (field === 'page') {
      onUpdate({ sortOverride: null });
    } else {
      onUpdate({ sortOverride: { field, direction: effectiveSort.direction } });
    }
  };

  const handleSortDirectionChange = (direction: SortDirection) => {
    if (hasCustomSort && preferences.sortOverride) {
      onUpdate({ sortOverride: { ...preferences.sortOverride, direction } });
    } else {
      onUpdate({ sortOverride: { field: pageSort.field, direction } });
    }
  };

  const pageSortLabel = SORT_OPTIONS.find(opt => opt.value === pageSort.field)?.label || pageSort.field;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded transition-colors ${
          activeFilters > 0 || hasCustomSort
            ? 'text-[var(--color-primary)] bg-[var(--color-primary-muted)] hover:bg-[var(--color-primary-muted)]'
            : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
        }`}
        title="Filter & Sort"
        data-testid={`${columnId}-filter-button`}
      >
        <Filter className="w-3.5 h-3.5" />
        {(activeFilters > 0 || hasCustomSort) && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[var(--color-primary)] text-white text-[10px] rounded-full flex items-center justify-center">
            {activeFilters + (hasCustomSort ? 1 : 0)}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-20 py-2"
          data-testid={`${columnId}-filter-dropdown`}
        >
          {/* Sort Section */}
          <div className="px-3 pb-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
              <ArrowUpDown className="w-3 h-3" />
              Sort
            </div>

            <div className="mb-2">
              <select
                value={hasCustomSort ? preferences.sortOverride!.field : 'page'}
                onChange={(e) => handleSortFieldChange(e.target.value as SortField | 'page')}
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)] text-[var(--color-text)]"
                data-testid={`${columnId}-sort-field`}
              >
                <option value="page">Page sort ({pageSortLabel})</option>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => handleSortDirectionChange('asc')}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  effectiveSort.direction === 'asc'
                    ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]'
                }`}
                data-testid={`${columnId}-sort-asc`}
              >
                Ascending
              </button>
              <button
                onClick={() => handleSortDirectionChange('desc')}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  effectiveSort.direction === 'desc'
                    ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]'
                }`}
                data-testid={`${columnId}-sort-desc`}
              >
                Descending
              </button>
            </div>
          </div>

          {/* Filter Section */}
          <div className="px-3 pt-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
                <Filter className="w-3 h-3" />
                Filter
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="text-xs text-[var(--color-primary)] hover:underline"
                  data-testid={`${columnId}-clear-filters`}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Priority Filter */}
            <div className="mb-2">
              <label className="text-xs text-[var(--color-text-tertiary)] mb-1 block">Priority</label>
              <select
                value={preferences.filters.priority ?? ''}
                onChange={(e) => onUpdate({
                  filters: {
                    ...preferences.filters,
                    priority: e.target.value ? parseInt(e.target.value, 10) : null,
                  },
                })}
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)] text-[var(--color-text)]"
                data-testid={`${columnId}-filter-priority`}
              >
                <option value="">All priorities</option>
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee Filter */}
            {availableAssignees.length > 0 && (
              <div className="mb-2">
                <label className="text-xs text-[var(--color-text-tertiary)] mb-1 block">Assignee</label>
                <select
                  value={preferences.filters.assignee ?? ''}
                  onChange={(e) => onUpdate({
                    filters: {
                      ...preferences.filters,
                      assignee: e.target.value || null,
                    },
                  })}
                  className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)] text-[var(--color-text)]"
                  data-testid={`${columnId}-filter-assignee`}
                >
                  <option value="">All assignees</option>
                  {availableAssignees.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {entityNameMap.get(assignee) || assignee}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <div className="mb-1">
                <label className="text-xs text-[var(--color-text-tertiary)] mb-1 block">Tag</label>
                <select
                  value={preferences.filters.tag ?? ''}
                  onChange={(e) => onUpdate({
                    filters: {
                      ...preferences.filters,
                      tag: e.target.value || null,
                    },
                  })}
                  className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)] text-[var(--color-text)]"
                  data-testid={`${columnId}-filter-tag`}
                >
                  <option value="">All tags</option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Virtualized Column
// ============================================================================

interface VirtualizedKanbanColumnProps {
  columnId: string;
  title: string;
  color: string;
  icon: React.ReactNode;
  tasks: Task[];
  entityNameMap: Map<string, string>;
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  isDragActive: boolean;
  preferences: ColumnPreferences;
  pageSort: ColumnSort;
  onUpdatePreferences: (updates: Partial<ColumnPreferences>) => void;
  availableAssignees: string[];
  availableTags: string[];
}

function VirtualizedKanbanColumn({
  columnId,
  title,
  color,
  icon,
  tasks,
  entityNameMap,
  selectedTaskId,
  onTaskClick,
  isDragActive,
  preferences,
  pageSort,
  onUpdatePreferences,
  availableAssignees,
  availableTags,
}: VirtualizedKanbanColumnProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const taskIds = tasks.map(t => t.id);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRestoreId = `kanban-column-${columnId}`;

  const hasActiveFilters = preferences.filters.assignee || preferences.filters.priority !== null || preferences.filters.tag;

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: columnId,
  });

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TASK_CARD_HEIGHT,
    gap: TASK_CARD_GAP,
    overscan: 5,
    getItemKey: (index) => tasks[index].id,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    (parentRef as { current: HTMLDivElement | null }).current = node;
    setDroppableRef(node);
  }, [setDroppableRef]);

  useEffect(() => {
    if (scrollRestoreId && parentRef.current) {
      const savedPosition = kanbanScrollPositionStore.get(scrollRestoreId);
      if (savedPosition !== undefined && savedPosition > 0) {
        requestAnimationFrame(() => {
          virtualizer.scrollToOffset(savedPosition);
        });
      }
    }
  }, [scrollRestoreId]);

  useEffect(() => {
    return () => {
      if (scrollRestoreId && parentRef.current) {
        const currentOffset = virtualizer.scrollOffset;
        if (currentOffset !== null && currentOffset > 0) {
          kanbanScrollPositionStore.set(scrollRestoreId, currentOffset);
        }
      }
    };
  }, [scrollRestoreId, virtualizer]);

  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      const offset = virtualizer.scrollOffset;
      if (scrollRestoreId && offset !== null && offset > 0) {
        kanbanScrollPositionStore.set(scrollRestoreId, offset);
      }
    }, 100);
  }, [virtualizer, scrollRestoreId]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`flex flex-col flex-1 min-w-[280px] bg-[var(--color-surface-elevated)] rounded-lg border-t-4 ${color} h-full`}
      data-testid={`kanban-column-${columnId}`}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface-elevated)] z-10 rounded-t-lg">
        {icon}
        <span className="font-medium text-[var(--color-text)] text-sm">{title}</span>
        <span
          className="px-2 py-0.5 text-xs bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-full"
          data-testid={`kanban-column-${columnId}-count`}
        >
          {tasks.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <FilterSortDropdown
            columnId={columnId}
            availableAssignees={availableAssignees}
            availableTags={availableTags}
            preferences={preferences}
            pageSort={pageSort}
            onUpdate={onUpdatePreferences}
            entityNameMap={entityNameMap}
          />
        </div>
      </div>

      {/* Virtualized Cards Container */}
      <div
        ref={setRefs}
        className={`flex-1 overflow-y-auto p-2 pt-3 ${
          isOver && isDragActive ? 'bg-[var(--color-primary-muted)]' : ''
        }`}
        data-testid={`kanban-column-${columnId}-scroll`}
        onScroll={handleScroll}
      >
        {tasks.length === 0 ? (
          <div className="p-4 text-center text-[var(--color-text-tertiary)] text-sm h-32 flex items-center justify-center">
            {hasActiveFilters ? 'No matching tasks' : 'No tasks'}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
            }}
          >
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {virtualItems.map((virtualItem) => {
                const task = tasks[virtualItem.index];
                return (
                  <div
                    key={task.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    data-index={virtualItem.index}
                  >
                    <SortableTaskCard
                      task={task}
                      entityNameMap={entityNameMap}
                      isSelected={task.id === selectedTaskId}
                      onClick={() => onTaskClick(task.id)}
                    />
                  </div>
                );
              })}
            </SortableContext>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Kanban Board Component
// ============================================================================

export function KanbanBoard({
  tasks,
  entityNameMap,
  selectedTaskId,
  onTaskClick,
  onUpdateTask,
  searchQuery,
  pageSort,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Convert page-level sort to ColumnSort format
  const normalizedPageSort = useMemo((): ColumnSort => {
    if (!pageSort) return DEFAULT_PAGE_SORT;
    const field = pageSort.field as SortField;
    if (SORT_OPTIONS.some(opt => opt.value === field)) {
      return { field, direction: pageSort.direction };
    }
    return DEFAULT_PAGE_SORT;
  }, [pageSort?.field, pageSort?.direction]);

  // Column preferences
  const [backlogPrefs, setBacklogPrefs] = useColumnPreferences('backlog');
  const [unassignedPrefs, setUnassignedPrefs] = useColumnPreferences('unassigned');
  const [assignedPrefs, setAssignedPrefs] = useColumnPreferences('assigned');
  const [inProgressPrefs, setInProgressPrefs] = useColumnPreferences('in_progress');
  const [closedPrefs, setClosedPrefs] = useColumnPreferences('closed');
  const [awaitingMergePrefs, setAwaitingMergePrefs] = useColumnPreferences('awaiting_merge');

  // Collect unique assignees and tags
  const allAssignees = useMemo(() => getUniqueAssignees(tasks || []), [tasks]);
  const allTags = useMemo(() => getUniqueTags(tasks || []), [tasks]);

  // Group tasks by orchestrator-specific columns
  const tasksByColumn = useMemo(() => {
    const groups: Record<string, Task[]> = {
      backlog: [],
      unassigned: [],
      assigned: [],
      in_progress: [],
      closed: [],
      awaiting_merge: [],
    };

    for (const task of tasks) {
      // Skip tombstone tasks
      if (task.status === 'tombstone') continue;

      const mergeStatus = task.metadata?.orchestrator?.mergeStatus;

      if (task.status === 'backlog') {
        groups.backlog.push(task);
      } else if (task.status === 'review') {
        // Tasks with 'review' status go to awaiting_merge
        groups.awaiting_merge.push(task);
      } else if (task.status === 'closed') {
        // Check if awaiting merge
        if (mergeStatus && mergeStatus !== 'merged') {
          groups.awaiting_merge.push(task);
        } else {
          groups.closed.push(task);
        }
      } else if (task.status === 'in_progress') {
        groups.in_progress.push(task);
      } else if (task.status === 'open' || task.status === 'blocked' || task.status === 'deferred') {
        if (task.assignee) {
          groups.assigned.push(task);
        } else {
          groups.unassigned.push(task);
        }
      }
    }

    return groups;
  }, [tasks]);

  // Apply filters and sorting to each column
  const filteredBacklog = useMemo(
    () => applyFiltersAndSort(tasksByColumn.backlog, backlogPrefs.filters, backlogPrefs.sortOverride || normalizedPageSort, searchQuery),
    [tasksByColumn.backlog, backlogPrefs.filters, backlogPrefs.sortOverride, normalizedPageSort, searchQuery]
  );

  const filteredUnassigned = useMemo(
    () => applyFiltersAndSort(tasksByColumn.unassigned, unassignedPrefs.filters, unassignedPrefs.sortOverride || normalizedPageSort, searchQuery),
    [tasksByColumn.unassigned, unassignedPrefs.filters, unassignedPrefs.sortOverride, normalizedPageSort, searchQuery]
  );

  const filteredAssigned = useMemo(
    () => applyFiltersAndSort(tasksByColumn.assigned, assignedPrefs.filters, assignedPrefs.sortOverride || normalizedPageSort, searchQuery),
    [tasksByColumn.assigned, assignedPrefs.filters, assignedPrefs.sortOverride, normalizedPageSort, searchQuery]
  );

  const filteredInProgress = useMemo(
    () => applyFiltersAndSort(tasksByColumn.in_progress, inProgressPrefs.filters, inProgressPrefs.sortOverride || normalizedPageSort, searchQuery),
    [tasksByColumn.in_progress, inProgressPrefs.filters, inProgressPrefs.sortOverride, normalizedPageSort, searchQuery]
  );

  const filteredClosed = useMemo(
    () => applyFiltersAndSort(tasksByColumn.closed, closedPrefs.filters, closedPrefs.sortOverride || normalizedPageSort, searchQuery),
    [tasksByColumn.closed, closedPrefs.filters, closedPrefs.sortOverride, normalizedPageSort, searchQuery]
  );

  const filteredAwaitingMerge = useMemo(
    () => applyFiltersAndSort(tasksByColumn.awaiting_merge, awaitingMergePrefs.filters, awaitingMergePrefs.sortOverride || normalizedPageSort, searchQuery),
    [tasksByColumn.awaiting_merge, awaitingMergePrefs.filters, awaitingMergePrefs.sortOverride, normalizedPageSort, searchQuery]
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks?.find(t => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !tasks) return;

    const taskId = active.id as string;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Determine the target column
    let targetColumnId: string | null = null;

    // Check if dropped over a task
    const overTask = tasks.find(t => t.id === over.id);
    if (overTask) {
      // Find which column the over task is in
      for (const [colId, colTasks] of Object.entries(tasksByColumn)) {
        if (colTasks.some(t => t.id === over.id)) {
          targetColumnId = colId;
          break;
        }
      }
    } else if (COLUMNS.some(c => c.id === over.id)) {
      targetColumnId = over.id as string;
    }

    if (targetColumnId) {
      // Build the update based on target column
      const updates: TaskUpdate = {};

      // Map column to status
      const statusMap: Record<string, string> = {
        backlog: 'backlog',
        unassigned: 'open',
        assigned: 'open',
        in_progress: 'in_progress',
        closed: 'closed',
        awaiting_merge: 'closed',
      };

      const newStatus = statusMap[targetColumnId];
      if (newStatus && newStatus !== task.status) {
        updates.status = newStatus;
      }

      // Handle assignee changes for unassigned column
      if (targetColumnId === 'unassigned' && task.assignee) {
        // Moving to unassigned - remove the assignee
        updates.assignee = null;
      }

      // Only call update if there are changes
      if (Object.keys(updates).length > 0) {
        onUpdateTask(taskId, updates);
      }
    }
  };

  const isDragActive = activeTask !== null;

  const columnData = [
    { id: 'backlog', prefs: backlogPrefs, setPrefs: setBacklogPrefs, tasks: filteredBacklog },
    { id: 'unassigned', prefs: unassignedPrefs, setPrefs: setUnassignedPrefs, tasks: filteredUnassigned },
    { id: 'assigned', prefs: assignedPrefs, setPrefs: setAssignedPrefs, tasks: filteredAssigned },
    { id: 'in_progress', prefs: inProgressPrefs, setPrefs: setInProgressPrefs, tasks: filteredInProgress },
    { id: 'awaiting_merge', prefs: awaitingMergePrefs, setPrefs: setAwaitingMergePrefs, tasks: filteredAwaitingMerge },
    { id: 'closed', prefs: closedPrefs, setPrefs: setClosedPrefs, tasks: filteredClosed },
  ];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-320px)]"
        data-testid="kanban-board"
      >
        {COLUMNS.map((column, index) => {
          const Icon = column.icon;
          const { prefs, setPrefs, tasks: columnTasks } = columnData[index];

          return (
            <VirtualizedKanbanColumn
              key={column.id}
              columnId={column.id}
              title={column.title}
              color={column.color}
              icon={<Icon className={`w-4 h-4 ${column.iconColor}`} />}
              tasks={columnTasks}
              entityNameMap={entityNameMap}
              selectedTaskId={selectedTaskId}
              onTaskClick={onTaskClick}
              isDragActive={isDragActive}
              preferences={prefs}
              pageSort={normalizedPageSort}
              onUpdatePreferences={setPrefs}
              availableAssignees={allAssignees}
              availableTags={allTags}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskCard
            task={activeTask}
            entityNameMap={entityNameMap}
            isSelected={false}
            onClick={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
