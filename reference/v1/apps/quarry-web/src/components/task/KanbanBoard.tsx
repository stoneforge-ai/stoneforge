import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { AlertTriangle, CheckCircle2, Clock, Eye, PlayCircle, User, Filter, ArrowUpDown, Loader2, Inbox } from 'lucide-react';
import { formatCompactTime } from '../../lib/time';
import { useAllTasks, type Task } from '../../api/hooks/useAllElements';

// Storage for scroll positions keyed by column ID
const kanbanScrollPositionStore = new Map<string, number>();

interface Entity {
  id: string;
  name: string;
}

// Page-level sort config passed from parent
interface PageSort {
  field: string;
  direction: 'asc' | 'desc';
}

interface KanbanBoardProps {
  entities: Entity[];
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  searchQuery?: string;
  pageSort?: PageSort;
}

// ============================================================================
// Filter & Sort Types
// ============================================================================

// Match page-level sort fields (using snake_case for consistency with page)
type SortField = 'priority' | 'created_at' | 'updated_at' | 'deadline' | 'title' | 'complexity';
type SortDirection = 'asc' | 'desc';

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
  sortOverride: ColumnSort | null; // null = use page-level sort
}

const DEFAULT_FILTERS: ColumnFilters = {
  assignee: null,
  priority: null,
  tag: null,
};

// Sort options matching page-level sort
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'title', label: 'Title' },
  { value: 'complexity', label: 'Complexity' },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Trivial' },
];

// Column configuration - maps status values to column definitions
const COLUMNS = [
  { id: 'backlog', title: 'Backlog', status: 'backlog', color: 'bg-slate-500', icon: Inbox, iconColor: 'text-slate-600 dark:text-slate-400' },
  { id: 'open', title: 'Open', status: 'open', color: 'bg-green-500', icon: CheckCircle2, iconColor: 'text-green-600 dark:text-green-400' },
  { id: 'in-progress', title: 'In Progress', status: 'in_progress', color: 'bg-yellow-500', icon: PlayCircle, iconColor: 'text-yellow-600 dark:text-yellow-400' },
  { id: 'blocked', title: 'Blocked', status: 'blocked', color: 'bg-red-500', icon: AlertTriangle, iconColor: 'text-red-600 dark:text-red-400' },
  { id: 'review', title: 'Review', status: 'review', color: 'bg-purple-500', icon: Eye, iconColor: 'text-purple-600 dark:text-purple-400' },
  { id: 'closed', title: 'Completed', status: 'closed', color: 'bg-blue-500', icon: Clock, iconColor: 'text-blue-600 dark:text-blue-400' },
] as const;

// Hook to persist column preferences in localStorage
function useColumnPreferences(columnId: string): [ColumnPreferences, (prefs: Partial<ColumnPreferences>) => void] {
  const storageKey = `kanban-column-${columnId}-v2`; // v2 for new format with sortOverride

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
      // Always create new objects to ensure React detects the change
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

// Apply filters and sorting to tasks
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
        // Handle null deadlines - they sort last
        const aDeadline = (a as Task & { deadline?: string }).deadline;
        const bDeadline = (b as Task & { deadline?: string }).deadline;
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

// Get unique assignees from tasks
function getUniqueAssignees(tasks: Task[]): string[] {
  const assignees = new Set<string>();
  tasks.forEach((t) => {
    if (t.assignee) assignees.add(t.assignee);
  });
  return Array.from(assignees).sort();
}

// Get unique tags from tasks
function getUniqueTags(tasks: Task[]): string[] {
  const tags = new Set<string>();
  tasks.forEach((t) => {
    t.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

// ============================================================================
// Status Update Hook
// ============================================================================

function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update task');
      }

      return response.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['elements', 'tasks'] });
    },
  });
}

// ============================================================================
// Visual Constants
// ============================================================================

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

// Estimated height for each task card
const TASK_CARD_HEIGHT = 100;
const TASK_CARD_GAP = 8;

// ============================================================================
// Task Card Components
// ============================================================================

function TaskCard({
  task,
  entities,
  isSelected,
  onClick,
  isDragging = false,
}: {
  task: Task;
  entities: Entity[];
  isSelected: boolean;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const priorityBorder = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];
  const typeColor = TASK_TYPE_COLORS[task.taskType] || '';
  const assigneeName = task.assignee
    ? entities.find(e => e.id === task.assignee)?.name || task.assignee
    : null;

  return (
    <div
      className={`
        p-3 bg-white dark:bg-neutral-700 rounded-lg shadow-sm border-l-4 ${priorityBorder} ${typeColor}
        cursor-pointer transition-all hover:shadow-md h-full flex flex-col
        ${isSelected ? 'ring-2 ring-blue-500' : 'border-t border-r border-b border-t-gray-200 border-r-gray-200 border-b-gray-200 dark:border-t-neutral-600 dark:border-r-neutral-600 dark:border-b-neutral-600'}
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={onClick}
      data-testid={`kanban-card-${task.id}`}
    >
      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1 line-clamp-2 break-words">{task.title}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
        <span className="font-mono truncate max-w-20">{task.id}</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatCompactTime(task.createdAt)}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-auto">
        <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-neutral-600 text-gray-600 dark:text-gray-300 rounded capitalize">
          {task.taskType}
        </span>
        {assigneeName && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded truncate max-w-24">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{assigneeName}</span>
          </span>
        )}
        {task.tags.slice(0, 1).map((tag) => (
          <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-neutral-600 text-gray-700 dark:text-gray-300 rounded truncate max-w-16">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  entities,
  isSelected,
  onClick,
}: {
  task: Task;
  entities: Entity[];
  isSelected: boolean;
  onClick: () => void;
}) {
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
        entities={entities}
        isSelected={isSelected}
        onClick={onClick}
        isDragging={isDragging}
      />
    </div>
  );
}

// ============================================================================
// Filter & Sort Dropdown Component
// ============================================================================

interface FilterSortDropdownProps {
  columnId: string;
  availableAssignees: string[];
  availableTags: string[];
  preferences: ColumnPreferences;
  pageSort: ColumnSort;
  onUpdate: (updates: Partial<ColumnPreferences>) => void;
}

function FilterSortDropdown({
  columnId,
  availableAssignees,
  availableTags,
  preferences,
  pageSort,
  onUpdate,
}: FilterSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Count active filters
  const activeFilters = [
    preferences.filters.assignee,
    preferences.filters.priority,
    preferences.filters.tag,
  ].filter(Boolean).length;

  // Check if using custom column sort
  const hasCustomSort = preferences.sortOverride !== null;

  // The effective sort being used
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
      // Clear custom sort, use page-level sort
      onUpdate({ sortOverride: null });
    } else {
      // Set custom sort for this column
      onUpdate({ sortOverride: { field, direction: effectiveSort.direction } });
    }
  };

  const handleSortDirectionChange = (direction: SortDirection) => {
    if (hasCustomSort && preferences.sortOverride) {
      onUpdate({ sortOverride: { ...preferences.sortOverride, direction } });
    } else {
      // If using page sort, set a custom sort with the new direction
      onUpdate({ sortOverride: { field: pageSort.field, direction } });
    }
  };

  // Get label for current sort
  const pageSortLabel = SORT_OPTIONS.find(opt => opt.value === pageSort.field)?.label || pageSort.field;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded transition-colors ${
          activeFilters > 0 || hasCustomSort
            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        title="Filter & Sort"
        data-testid={`${columnId}-filter-button`}
      >
        <Filter className="w-3.5 h-3.5" />
        {(activeFilters > 0 || hasCustomSort) && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center">
            {activeFilters + (hasCustomSort ? 1 : 0)}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg z-20 py-2"
          data-testid={`${columnId}-filter-dropdown`}
        >
          {/* Sort Section */}
          <div className="px-3 pb-2 border-b border-gray-100 dark:border-neutral-700">
            <div className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              <ArrowUpDown className="w-3 h-3" />
              Sort
            </div>

            {/* Sort Field Dropdown */}
            <div className="mb-2">
              <select
                value={hasCustomSort ? preferences.sortOverride!.field : 'page'}
                onChange={(e) => handleSortFieldChange(e.target.value as SortField | 'page')}
                className="w-full text-xs border border-gray-200 dark:border-neutral-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100"
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

            {/* Sort Direction */}
            <div className="flex gap-1">
              <button
                onClick={() => handleSortDirectionChange('asc')}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  effectiveSort.direction === 'asc'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-600'
                }`}
                data-testid={`${columnId}-sort-asc`}
              >
                Ascending
              </button>
              <button
                onClick={() => handleSortDirectionChange('desc')}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  effectiveSort.direction === 'desc'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-600'
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
              <div className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <Filter className="w-3 h-3" />
                Filter
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  data-testid={`${columnId}-clear-filters`}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Priority Filter */}
            <div className="mb-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Priority</label>
              <select
                value={preferences.filters.priority ?? ''}
                onChange={(e) => onUpdate({
                  filters: {
                    ...preferences.filters,
                    priority: e.target.value ? parseInt(e.target.value, 10) : null,
                  },
                })}
                className="w-full text-xs border border-gray-200 dark:border-neutral-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100"
                data-testid={`${columnId}-filter-priority`}
              >
                <option value="">All priorities</option>
                {PRIORITY_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee Filter */}
            {availableAssignees.length > 0 && (
              <div className="mb-2">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Assignee</label>
                <select
                  value={preferences.filters.assignee ?? ''}
                  onChange={(e) => onUpdate({
                    filters: {
                      ...preferences.filters,
                      assignee: e.target.value || null,
                    },
                  })}
                  className="w-full text-xs border border-gray-200 dark:border-neutral-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100"
                  data-testid={`${columnId}-filter-assignee`}
                >
                  <option value="">All assignees</option>
                  {availableAssignees.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <div className="mb-1">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Tag</label>
                <select
                  value={preferences.filters.tag ?? ''}
                  onChange={(e) => onUpdate({
                    filters: {
                      ...preferences.filters,
                      tag: e.target.value || null,
                    },
                  })}
                  className="w-full text-xs border border-gray-200 dark:border-neutral-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100"
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
// Virtualized Column Component
// ============================================================================

interface VirtualizedKanbanColumnProps {
  columnId: string;
  title: string;
  color: string;
  icon: React.ReactNode;
  tasks: Task[];
  totalCount: number;
  entities: Entity[];
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  isDragActive: boolean;
  preferences: ColumnPreferences;
  pageSort: ColumnSort;
  onUpdatePreferences: (updates: Partial<ColumnPreferences>) => void;
  availableAssignees: string[];
  availableTags: string[];
  isLoading?: boolean;
}

function VirtualizedKanbanColumn({
  columnId,
  title,
  color,
  icon,
  tasks,
  totalCount,
  entities,
  selectedTaskId,
  onTaskClick,
  isDragActive,
  preferences,
  pageSort,
  onUpdatePreferences,
  availableAssignees,
  availableTags,
  isLoading,
}: VirtualizedKanbanColumnProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const taskIds = tasks.map(t => t.id);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRestoreId = `kanban-column-${columnId}`;

  // Make the column a droppable zone for @dnd-kit
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: columnId,
  });

  // Use virtualization for efficient rendering
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TASK_CARD_HEIGHT,
    gap: TASK_CARD_GAP,
    overscan: 5,
    getItemKey: (index) => tasks[index].id,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Combine refs for both droppable and scroll parent
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    (parentRef as { current: HTMLDivElement | null }).current = node;
    setDroppableRef(node);
  }, [setDroppableRef]);

  // Restore scroll position on mount
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

  // Save scroll position on unmount
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

  // Handle scroll events to save position
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="flex flex-col flex-1 min-w-64 bg-gray-50 dark:bg-neutral-800 rounded-lg h-full"
      data-testid={`kanban-column-${columnId}`}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-neutral-700 sticky top-0 bg-gray-50 dark:bg-neutral-800 z-10">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        {icon}
        <span className="font-medium text-gray-700 dark:text-gray-200 text-sm">{title}</span>
        <span
          className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 rounded-full"
          data-testid={`kanban-column-${columnId}-count`}
        >
          {tasks.length < totalCount ? `${tasks.length}/${totalCount}` : totalCount}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <FilterSortDropdown
            columnId={columnId}
            availableAssignees={availableAssignees}
            availableTags={availableTags}
            preferences={preferences}
            pageSort={pageSort}
            onUpdate={onUpdatePreferences}
          />
        </div>
      </div>

      {/* Virtualized Cards Container */}
      <div
        ref={setRefs}
        className={`flex-1 overflow-y-auto p-2 pt-3 ${
          isOver && isDragActive ? 'bg-blue-50 dark:bg-blue-950' : ''
        }`}
        data-testid={`kanban-column-${columnId}-scroll`}
        onScroll={handleScroll}
      >
        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}
        {!isLoading && tasks.length === 0 && (
          <div className="p-4 text-center text-gray-400 dark:text-gray-500 text-sm h-32 flex items-center justify-center">
            {totalCount > 0 ? 'No matching tasks' : 'No tasks'}
          </div>
        )}
        {!isLoading && tasks.length > 0 && (
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
                      entities={entities}
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

// Default page sort when not provided
const DEFAULT_PAGE_SORT: ColumnSort = {
  field: 'created_at',
  direction: 'desc',
};

export function KanbanBoard({ entities, selectedTaskId, onTaskClick, searchQuery, pageSort }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const updateTaskStatus = useUpdateTaskStatus();

  // Use the same data source as the list view
  const { data: allTasks, isLoading } = useAllTasks();

  // Convert page-level sort to ColumnSort format
  const normalizedPageSort = useMemo((): ColumnSort => {
    if (!pageSort) return DEFAULT_PAGE_SORT;
    // Map page field names to our field names (they should match now)
    const field = pageSort.field as SortField;
    // Validate the field is one we support
    if (SORT_OPTIONS.some(opt => opt.value === field)) {
      return { field, direction: pageSort.direction };
    }
    return DEFAULT_PAGE_SORT;
  }, [pageSort?.field, pageSort?.direction]);

  // Column preferences
  const [backlogPrefs, setBacklogPrefs] = useColumnPreferences('backlog');
  const [openPrefs, setOpenPrefs] = useColumnPreferences('open');
  const [inProgressPrefs, setInProgressPrefs] = useColumnPreferences('in-progress');
  const [blockedPrefs, setBlockedPrefs] = useColumnPreferences('blocked');
  const [reviewPrefs, setReviewPrefs] = useColumnPreferences('review');
  const [closedPrefs, setClosedPrefs] = useColumnPreferences('closed');

  // Compute effective sort for each column (sortOverride or pageSort)
  const backlogEffectiveSort = backlogPrefs.sortOverride || normalizedPageSort;
  const openEffectiveSort = openPrefs.sortOverride || normalizedPageSort;
  const inProgressEffectiveSort = inProgressPrefs.sortOverride || normalizedPageSort;
  const blockedEffectiveSort = blockedPrefs.sortOverride || normalizedPageSort;
  const reviewEffectiveSort = reviewPrefs.sortOverride || normalizedPageSort;
  const closedEffectiveSort = closedPrefs.sortOverride || normalizedPageSort;

  // Collect unique assignees and tags from all tasks
  const allAssignees = useMemo(() => getUniqueAssignees(allTasks || []), [allTasks]);
  const allTags = useMemo(() => getUniqueTags(allTasks || []), [allTasks]);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    if (!allTasks) return { backlog: [], open: [], in_progress: [], blocked: [], review: [], closed: [] };

    const groups: Record<string, Task[]> = {
      backlog: [],
      open: [],
      in_progress: [],
      blocked: [],
      review: [],
      closed: [],
    };

    for (const task of allTasks) {
      const status = task.status;
      if (status in groups) {
        groups[status].push(task);
      }
    }

    return groups;
  }, [allTasks]);

  // Compute unfiltered counts per column (respects search query but not per-column filters)
  const totalCounts = useMemo(() => {
    const countForColumn = (columnTasks: Task[]) => {
      if (!searchQuery) return columnTasks.length;
      const lowerQuery = searchQuery.toLowerCase();
      return columnTasks.filter((t) =>
        t.title.toLowerCase().includes(lowerQuery) ||
        t.id.toLowerCase().includes(lowerQuery)
      ).length;
    };
    return {
      backlog: countForColumn(tasksByStatus.backlog),
      open: countForColumn(tasksByStatus.open),
      in_progress: countForColumn(tasksByStatus.in_progress),
      blocked: countForColumn(tasksByStatus.blocked),
      review: countForColumn(tasksByStatus.review),
      closed: countForColumn(tasksByStatus.closed),
    };
  }, [tasksByStatus, searchQuery]);

  // Apply filters and sorting to each column
  // Use primitive values in dependencies to ensure proper memoization
  const filteredBacklogTasks = useMemo(
    () => applyFiltersAndSort(tasksByStatus.backlog, backlogPrefs.filters, backlogEffectiveSort, searchQuery),
    [tasksByStatus.backlog, backlogPrefs.filters.assignee, backlogPrefs.filters.priority, backlogPrefs.filters.tag, backlogEffectiveSort.field, backlogEffectiveSort.direction, searchQuery]
  );

  const filteredOpenTasks = useMemo(
    () => applyFiltersAndSort(tasksByStatus.open, openPrefs.filters, openEffectiveSort, searchQuery),
    [tasksByStatus.open, openPrefs.filters.assignee, openPrefs.filters.priority, openPrefs.filters.tag, openEffectiveSort.field, openEffectiveSort.direction, searchQuery]
  );

  const filteredInProgressTasks = useMemo(
    () => applyFiltersAndSort(tasksByStatus.in_progress, inProgressPrefs.filters, inProgressEffectiveSort, searchQuery),
    [tasksByStatus.in_progress, inProgressPrefs.filters.assignee, inProgressPrefs.filters.priority, inProgressPrefs.filters.tag, inProgressEffectiveSort.field, inProgressEffectiveSort.direction, searchQuery]
  );

  const filteredBlockedTasks = useMemo(
    () => applyFiltersAndSort(tasksByStatus.blocked, blockedPrefs.filters, blockedEffectiveSort, searchQuery),
    [tasksByStatus.blocked, blockedPrefs.filters.assignee, blockedPrefs.filters.priority, blockedPrefs.filters.tag, blockedEffectiveSort.field, blockedEffectiveSort.direction, searchQuery]
  );

  const filteredReviewTasks = useMemo(
    () => applyFiltersAndSort(tasksByStatus.review, reviewPrefs.filters, reviewEffectiveSort, searchQuery),
    [tasksByStatus.review, reviewPrefs.filters.assignee, reviewPrefs.filters.priority, reviewPrefs.filters.tag, reviewEffectiveSort.field, reviewEffectiveSort.direction, searchQuery]
  );

  const filteredClosedTasks = useMemo(
    () => applyFiltersAndSort(tasksByStatus.closed, closedPrefs.filters, closedEffectiveSort, searchQuery),
    [tasksByStatus.closed, closedPrefs.filters.assignee, closedPrefs.filters.priority, closedPrefs.filters.tag, closedEffectiveSort.field, closedEffectiveSort.direction, searchQuery]
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

  // Map column IDs to target statuses
  const COLUMN_STATUS_MAP: Record<string, string> = {
    'backlog': 'backlog',
    'open': 'open',
    'in-progress': 'in_progress',
    'blocked': 'blocked',
    'review': 'review',
    'closed': 'closed',
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = allTasks?.find(t => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !allTasks) return;

    const taskId = active.id as string;
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    // Determine the target column
    let targetColumnId: string | null = null;

    // Check if dropped over a task - find which column that task is in
    const overTask = allTasks.find(t => t.id === over.id);
    if (overTask) {
      // Map status to column ID
      const statusToColumnMap: Record<string, string> = {
        'backlog': 'backlog',
        'open': 'open',
        'in_progress': 'in-progress',
        'blocked': 'blocked',
        'review': 'review',
        'closed': 'closed',
      };
      targetColumnId = statusToColumnMap[overTask.status] || null;
    } else {
      // Dropped directly on a column
      if (Object.keys(COLUMN_STATUS_MAP).includes(over.id as string)) {
        targetColumnId = over.id as string;
      }
    }

    if (targetColumnId) {
      const targetStatus = COLUMN_STATUS_MAP[targetColumnId];
      if (targetStatus && targetStatus !== task.status) {
        updateTaskStatus.mutate({ id: taskId, status: targetStatus });
      }
    }
  };

  const isDragActive = activeTask !== null;

  const columnPrefsMap = {
    backlog: { prefs: backlogPrefs, setPrefs: setBacklogPrefs, tasks: filteredBacklogTasks, totalCount: totalCounts.backlog },
    open: { prefs: openPrefs, setPrefs: setOpenPrefs, tasks: filteredOpenTasks, totalCount: totalCounts.open },
    'in-progress': { prefs: inProgressPrefs, setPrefs: setInProgressPrefs, tasks: filteredInProgressTasks, totalCount: totalCounts.in_progress },
    blocked: { prefs: blockedPrefs, setPrefs: setBlockedPrefs, tasks: filteredBlockedTasks, totalCount: totalCounts.blocked },
    review: { prefs: reviewPrefs, setPrefs: setReviewPrefs, tasks: filteredReviewTasks, totalCount: totalCounts.review },
    closed: { prefs: closedPrefs, setPrefs: setClosedPrefs, tasks: filteredClosedTasks, totalCount: totalCounts.closed },
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 p-4 overflow-x-auto h-full"
        data-testid="kanban-board"
      >
        {COLUMNS.map((column) => {
          const Icon = column.icon;
          const { prefs, setPrefs, tasks, totalCount } = columnPrefsMap[column.id as keyof typeof columnPrefsMap];

          return (
            <VirtualizedKanbanColumn
              key={column.id}
              columnId={column.id}
              title={column.title}
              color={column.color}
              icon={<Icon className={`w-4 h-4 ${column.iconColor}`} />}
              tasks={tasks}
              totalCount={totalCount}
              entities={entities}
              selectedTaskId={selectedTaskId}
              onTaskClick={onTaskClick}
              isDragActive={isDragActive}
              preferences={prefs}
              pageSort={normalizedPageSort}
              onUpdatePreferences={setPrefs}
              availableAssignees={allAssignees}
              availableTags={allTags}
              isLoading={isLoading}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskCard
            task={activeTask}
            entities={entities}
            isSelected={false}
            onClick={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
