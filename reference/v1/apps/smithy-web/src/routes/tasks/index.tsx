/**
 * Tasks Page - Enhanced view with sorting, grouping, filtering, and virtualization
 *
 * Features:
 * - List view with sortable headers and grouping
 * - Kanban view with drag-and-drop
 * - Advanced filtering (status, priority, assignee)
 * - Search with fuzzy matching
 * - Pagination for list view
 * - localStorage persistence for preferences
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import {
  CheckSquare,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
  Inbox,
  UserCheck,
  Play,
  CheckCircle2,
  GitMerge,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { useTasksByStatus, useStartTask, useCompleteTask, useReopenTask, useUpdateTask, useBulkDeleteTasks, useBulkUpdateTasks } from '../../api/hooks/useTasks';
import { useAllEntities } from '../../api/hooks/useAllElements';
import {
  TaskRow,
  TaskDetailPanel,
  ReopenDialog,
  CreateTaskModal,
  SortByDropdown,
  GroupByDropdown,
  ViewToggle,
  FilterBar,
  KanbanBoard,
  BulkActionMenu,
} from '../../components/task';
import { Pagination } from '../../components/shared/Pagination';
import type { Task } from '../../api/types';
import type {
  ViewMode,
  SortField,
  SortDirection,
  GroupByField,
  FilterConfig,
  TaskGroup,
} from '../../lib/task-constants';
import {
  DEFAULT_PAGE_SIZE,
  EMPTY_FILTER,
  TABLE_COLUMNS,
} from '../../lib/task-constants';
import type { ColumnId } from '../../lib/task-constants';
import { useColumnResize } from '../../hooks/useColumnResize';
import {
  fuzzySearch,
  highlightMatches,
  taskSortCompareFn,
  groupTasks,
  createTaskFilter,
  getStoredViewMode,
  setStoredViewMode,
  getStoredSortField,
  setStoredSortField,
  getStoredSortDirection,
  setStoredSortDirection,
  getStoredSecondarySort,
  setStoredSecondarySort,
  getStoredGroupBy,
  setStoredGroupBy,
  getStoredSearch,
  setStoredSearch,
} from '../../lib/task-utils';
import { getCurrentBinding, formatKeyBinding } from '../../lib/keyboard';

type TabValue = 'all' | 'backlog' | 'unassigned' | 'assigned' | 'in_progress' | 'closed' | 'awaiting_merge';

export function TasksPage() {
  const search = useSearch({ from: '/tasks' }) as {
    selected?: string;
    page?: number;
    limit?: number;
    status?: string;
    assignee?: string;
    action?: string;
    showClosed?: boolean;
    backlog?: boolean;
  };
  const navigate = useNavigate();

  // Show closed toggle state from URL
  const showClosed = search.showClosed ?? false;

  // View and sort preferences (persisted in localStorage)
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getStoredViewMode());
  const [sortField, setSortFieldState] = useState<SortField>(() => getStoredSortField());
  const [sortDirection, setSortDirectionState] = useState<SortDirection>(() => getStoredSortDirection());
  const [secondarySort, setSecondarySortState] = useState<SortField | null>(() => getStoredSecondarySort());
  const [groupBy, setGroupByState] = useState<GroupByField>(() => getStoredGroupBy());
  const [searchQuery, setSearchQueryState] = useState(() => getStoredSearch());

  // Filters
  const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTER);

  // Pagination
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;
  const currentTab = (search.status as TabValue) || 'all';

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createWithBacklog, setCreateWithBacklog] = useState(false);
  const selectedTaskId = search.selected;

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  // Note: showBulkDeleteConfirm state moved into BulkActionMenu component

  // Column resize
  const { columnWidths, handleMouseDown: handleColumnResizeStart } = useColumnResize();

  // Handle ?action=create and ?backlog=true from global keyboard shortcuts
  useEffect(() => {
    if (search.action === 'create' || search.backlog) {
      setCreateWithBacklog(search.backlog === true);
      setIsCreateModalOpen(true);
      // Clear the action and backlog params
      navigate({
        to: '/tasks',
        search: {
          selected: search.selected,
          page: search.page ?? 1,
          limit: search.limit ?? DEFAULT_PAGE_SIZE,
          status: search.status,
          assignee: search.assignee,
          showClosed: search.showClosed,
          action: undefined,
          backlog: undefined,
        },
        replace: true,
      });
    }
  }, [search.action, search.backlog, search.selected, search.page, search.limit, search.status, search.assignee, search.showClosed, navigate]);

  // Track pending operations
  const [pendingStart, setPendingStart] = useState<Set<string>>(new Set());
  const [pendingComplete, setPendingComplete] = useState<Set<string>>(new Set());
  const [pendingReopen, setPendingReopen] = useState<Set<string>>(new Set());
  const [reopenDialogTaskId, setReopenDialogTaskId] = useState<string | null>(null);

  // Collapsed groups state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Fetch data
  const {
    backlog,
    unassigned,
    assigned,
    inProgress,
    closed,
    awaitingMerge,
    allTasks,
    isLoading,
    error,
    refetch,
  } = useTasksByStatus();

  const { data: entities } = useAllEntities();

  // Create entity name lookup map
  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (entities) {
      entities.forEach((e) => map.set(e.id, e.name));
    }
    return map;
  }, [entities]);

  // Mutations
  const startTaskMutation = useStartTask();
  const completeTaskMutation = useCompleteTask();
  const reopenTaskMutation = useReopenTask();
  const updateTaskMutation = useUpdateTask();
  const bulkDeleteMutation = useBulkDeleteTasks();
  const bulkUpdateMutation = useBulkUpdateTasks();

  // Setters with persistence
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setStoredViewMode(mode);
  }, []);

  const setSortField = useCallback((field: SortField) => {
    setSortFieldState(field);
    setStoredSortField(field);
  }, []);

  const setSortDirection = useCallback((dir: SortDirection) => {
    setSortDirectionState(dir);
    setStoredSortDirection(dir);
  }, []);

  const setSecondarySort = useCallback((field: SortField | null) => {
    setSecondarySortState(field);
    setStoredSecondarySort(field);
  }, []);

  const setGroupBy = useCallback((field: GroupByField) => {
    setGroupByState(field);
    setStoredGroupBy(field);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setStoredSearch(query);
  }, []);

  // Keyboard shortcuts for view toggle
  useEffect(() => {
    let pendingV = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        pendingV = true;
        return;
      }

      if (pendingV) {
        if (e.key === 'l' || e.key === 'L') {
          setViewMode('list');
          pendingV = false;
        } else if (e.key === 'k' || e.key === 'K') {
          setViewMode('kanban');
          pendingV = false;
        } else {
          pendingV = false;
        }
      }
    };

    const handleKeyUp = () => {
      // Reset pending state after a short delay
      setTimeout(() => {
        pendingV = false;
      }, 500);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [setViewMode]);

  // Filter tasks based on current tab
  const tabFilteredTasks = useMemo(() => {
    let tasks: Task[];
    switch (currentTab) {
      case 'backlog':
        tasks = backlog;
        break;
      case 'unassigned':
        tasks = unassigned;
        break;
      case 'assigned':
        tasks = assigned;
        break;
      case 'in_progress':
        tasks = inProgress;
        break;
      case 'closed':
        tasks = closed;
        break;
      case 'awaiting_merge':
        tasks = awaitingMerge;
        break;
      default:
        tasks = allTasks.filter((t) => t.status !== 'tombstone' && (showClosed || t.status !== 'closed'));
    }
    return tasks;
  }, [currentTab, allTasks, backlog, unassigned, assigned, inProgress, closed, awaitingMerge, showClosed]);

  // Apply filters and search
  const filteredTasks = useMemo(() => {
    const filterFn = createTaskFilter(filters, searchQuery);
    return tabFilteredTasks.filter(filterFn);
  }, [tabFilteredTasks, filters, searchQuery]);

  // Apply sorting
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      const primaryCmp = taskSortCompareFn(a, b, sortField === 'created_at' ? 'createdAt' : sortField === 'updated_at' ? 'updatedAt' : sortField, sortDirection);
      if (primaryCmp !== 0 || !secondarySort) return primaryCmp;
      return taskSortCompareFn(a, b, secondarySort === 'created_at' ? 'createdAt' : secondarySort === 'updated_at' ? 'updatedAt' : secondarySort, sortDirection);
    });
    return sorted;
  }, [filteredTasks, sortField, sortDirection, secondarySort]);

  // Pagination (list view only)
  const totalItems = sortedTasks.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedTasks = useMemo(() => {
    if (viewMode === 'kanban') return sortedTasks;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedTasks.slice(start, end);
  }, [sortedTasks, currentPage, pageSize, viewMode]);

  // Paginated grouped tasks
  const paginatedGroupedTasks = useMemo(() => {
    if (viewMode === 'kanban' || groupBy === 'none') {
      return [{ key: 'all', label: 'All Tasks', tasks: paginatedTasks }];
    }
    // For grouped view, paginate within each group
    return groupTasks(paginatedTasks, groupBy, entityNameMap);
  }, [paginatedTasks, groupBy, entityNameMap, viewMode]);

  const setTab = (tab: TabValue) => {
    setSelectedTaskIds(new Set());
    navigate({
      to: '/tasks',
      search: {
        selected: search.selected,
        page: 1, // Reset to page 1 when changing tabs
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
        status: tab === 'all' ? undefined : tab,
        assignee: search.assignee,
        showClosed: search.showClosed,
        action: undefined,
        backlog: undefined,
      },
    });
  };

  const setShowClosed = useCallback(
    (show: boolean) => {
      navigate({
        to: '/tasks',
        search: {
          selected: search.selected,
          page: search.page ?? 1,
          limit: search.limit ?? DEFAULT_PAGE_SIZE,
          status: search.status,
          assignee: search.assignee,
          showClosed: show || undefined,
          action: undefined,
          backlog: undefined,
        },
      });
    },
    [navigate, search.selected, search.page, search.limit, search.status, search.assignee]
  );

  const setPage = (page: number) => {
    navigate({
      to: '/tasks',
      search: {
        selected: search.selected,
        page,
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
        status: search.status,
        assignee: search.assignee,
        showClosed: search.showClosed,
        action: undefined,
        backlog: undefined,
      },
    });
  };

  const setPageSize = (limit: number) => {
    navigate({
      to: '/tasks',
      search: {
        selected: search.selected,
        page: 1, // Reset to page 1 when changing page size
        limit,
        status: search.status,
        assignee: search.assignee,
        showClosed: search.showClosed,
        action: undefined,
        backlog: undefined,
      },
    });
  };

  const handleSelectTask = (taskId: string) => {
    navigate({
      to: '/tasks',
      search: {
        selected: taskId,
        page: search.page ?? 1,
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
        status: search.status,
        assignee: search.assignee,
        showClosed: search.showClosed,
        action: undefined,
        backlog: undefined,
      },
    });
  };

  const handleCloseDetail = () => {
    navigate({
      to: '/tasks',
      search: {
        selected: undefined,
        page: search.page ?? 1,
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
        status: search.status,
        assignee: search.assignee,
        showClosed: search.showClosed,
        action: undefined,
        backlog: undefined,
      },
    });
  };

  const handleStartTask = async (taskId: string) => {
    setPendingStart((prev) => new Set(prev).add(taskId));
    try {
      await startTaskMutation.mutateAsync({ taskId });
    } finally {
      setPendingStart((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    setPendingComplete((prev) => new Set(prev).add(taskId));
    try {
      await completeTaskMutation.mutateAsync({ taskId });
    } finally {
      setPendingComplete((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleReopenTask = (taskId: string) => {
    setReopenDialogTaskId(taskId);
  };

  const handleConfirmReopen = async (message?: string) => {
    if (!reopenDialogTaskId) return;
    const taskId = reopenDialogTaskId;
    setReopenDialogTaskId(null);
    setPendingReopen((prev) => new Set(prev).add(taskId));
    try {
      await reopenTaskMutation.mutateAsync({ taskId, message });
    } finally {
      setPendingReopen((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleUpdateTask = async (taskId: string, updates: { status?: string; assignee?: string | null }) => {
    const updatePayload: Parameters<typeof updateTaskMutation.mutateAsync>[0] = { taskId };
    if (updates.status !== undefined) {
      updatePayload.status = updates.status as 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed';
    }
    if (updates.assignee !== undefined) {
      updatePayload.assignee = updates.assignee;
    }
    await updateTaskMutation.mutateAsync(updatePayload);
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTER);
  };

  // Selection handlers
  const handleToggleSelect = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedTaskIds((prev) => {
      const currentPageIds = paginatedTasks.map((t) => t.id);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every((id) => prev.has(id));
      if (allSelected) {
        // Deselect all on current page
        const next = new Set(prev);
        currentPageIds.forEach((id) => next.delete(id));
        return next;
      } else {
        // Select all on current page
        const next = new Set(prev);
        currentPageIds.forEach((id) => next.add(id));
        return next;
      }
    });
  }, [paginatedTasks]);

  const handleBulkDelete = async () => {
    try {
      await bulkDeleteMutation.mutateAsync({ ids: Array.from(selectedTaskIds) });
      setSelectedTaskIds(new Set());
    } catch (error) {
      console.error('Failed to bulk delete tasks:', error);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    try {
      await bulkUpdateMutation.mutateAsync({ ids: Array.from(selectedTaskIds), updates: { status } });
      setSelectedTaskIds(new Set());
    } catch (error) {
      console.error('Failed to bulk update task status:', error);
    }
  };

  const handleBulkPriorityChange = async (priority: number) => {
    try {
      await bulkUpdateMutation.mutateAsync({ ids: Array.from(selectedTaskIds), updates: { priority } });
      setSelectedTaskIds(new Set());
    } catch (error) {
      console.error('Failed to bulk update task priority:', error);
    }
  };

  const handleClearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Handler for clickable sort headers
  const handleSortChange = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        // Toggle direction if clicking the same field
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        // Set new field with sensible default direction
        setSortField(field);
        // Use desc for updated_at and priority, asc for everything else
        const defaultDesc = field === 'updated_at' || field === 'priority';
        setSortDirection(defaultDesc ? 'desc' : 'asc');
      }
    },
    [sortField, sortDirection, setSortField, setSortDirection]
  );

  // Compute select-all state for current page
  const allPageSelected = paginatedTasks.length > 0 && paginatedTasks.every((t) => selectedTaskIds.has(t.id));
  const somePageSelected = paginatedTasks.some((t) => selectedTaskIds.has(t.id));

  // Tab counts
  const counts = {
    all: allTasks.filter((t) => t.status !== 'tombstone' && (showClosed || t.status !== 'closed')).length,
    backlog: backlog.length,
    unassigned: unassigned.length,
    assigned: assigned.length,
    in_progress: inProgress.length,
    closed: closed.length,
    awaiting_merge: awaitingMerge.length,
  };

  // Count of closed tasks for the toggle badge
  const closedCount = allTasks.filter((t) => t.status === 'closed').length;

  return (
    <div className="space-y-4 animate-fade-in" data-testid="tasks-page">
      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateWithBacklog(false);
        }}
        onSuccess={(taskId) => handleSelectTask(taskId)}
        defaultToBacklog={createWithBacklog}
      />

      {/* Reopen Dialog (from row action) */}
      {reopenDialogTaskId && (
        <ReopenDialog
          taskTitle={allTasks.find((t) => t.id === reopenDialogTaskId)?.title ?? reopenDialogTaskId}
          onConfirm={handleConfirmReopen}
          onCancel={() => setReopenDialogTaskId(null)}
          isReopening={reopenTaskMutation.isPending}
        />
      )}

      {/* Task Detail Panel - Slide-over
        * The parent <main> has @container (container-type: inline-size) which
        * establishes layout containment. This makes fixed-position descendants
        * relative to <main> rather than the viewport, preventing the slide-over
        * from overlapping the director panel. The max-width is also clamped to
        * 100% of the container to handle very narrow content areas gracefully.
        */}
      {selectedTaskId && (
        <div className="fixed inset-0 z-40" data-testid="task-detail-overlay">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleCloseDetail}
          />
          {/* Panel - max-w clamped to container width to prevent overflow */}
          <div className="absolute right-0 top-0 h-full w-full max-w-[min(32rem,100%)] bg-[var(--color-surface)] shadow-xl border-l border-[var(--color-border)] animate-slide-in-right">
            <TaskDetailPanel taskId={selectedTaskId} onClose={handleCloseDetail} onNavigateToTask={handleSelectTask} />
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="space-y-3">
        {/* Top row: Title + Create button — always on the same line */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--color-primary-muted)] shrink-0">
              <CheckSquare className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-[var(--color-text)]">Tasks</h1>
              <p className="text-sm text-[var(--color-text-secondary)] truncate">
                Manage and track agent task assignments
              </p>
            </div>
          </div>
          {/* Create Button — always visible and right-aligned */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150 shrink-0"
            data-testid="tasks-create"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden @sm:inline">Create Task</span>
            <kbd className="hidden @sm:inline ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">
              {formatKeyBinding(getCurrentBinding('action.createTask'))}
            </kbd>
          </button>
        </div>
        {/* Bottom row: Search + filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[12rem] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid="tasks-search"
            />
          </div>

          {/* Sort Dropdown */}
          <SortByDropdown
            sortField={sortField}
            sortDirection={sortDirection}
            secondarySort={secondarySort}
            onSortFieldChange={setSortField}
            onSortDirectionChange={setSortDirection}
            onSecondarySortChange={setSecondarySort}
          />

          {/* Group By Dropdown (list view only) */}
          {viewMode === 'list' && (
            <GroupByDropdown
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
          )}

          {/* View Toggle */}
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
        </div>
      </div>

      {/* Filter Bar (list view only) */}
      {viewMode === 'list' && (
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          onClearFilters={handleClearFilters}
          entityNameMap={entityNameMap}
        />
      )}

      {/* Tabs (list view only - kanban has columns for same purpose) */}
      {viewMode === 'list' && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] overflow-x-auto">
          <nav className="flex gap-1 min-w-max" aria-label="Tabs">
            <TabButton
              label="All"
              value="all"
              current={currentTab}
              count={counts.all}
              icon={CheckSquare}
              onClick={() => setTab('all')}
            />
            <TabButton
              label="Backlog"
              value="backlog"
              current={currentTab}
              count={counts.backlog}
              icon={Inbox}
              onClick={() => setTab('backlog')}
            />
            <TabButton
              label="Unassigned"
              value="unassigned"
              current={currentTab}
              count={counts.unassigned}
              icon={Inbox}
              onClick={() => setTab('unassigned')}
            />
            <TabButton
              label="Assigned"
              value="assigned"
              current={currentTab}
              count={counts.assigned}
              icon={UserCheck}
              onClick={() => setTab('assigned')}
            />
            <TabButton
              label="In Progress"
              value="in_progress"
              current={currentTab}
              count={counts.in_progress}
              icon={Play}
              onClick={() => setTab('in_progress')}
            />
            <TabButton
              label="Awaiting Merge"
              value="awaiting_merge"
              current={currentTab}
              count={counts.awaiting_merge}
              icon={GitMerge}
              onClick={() => setTab('awaiting_merge')}
            />
            <TabButton
              label="Closed"
              value="closed"
              current={currentTab}
              count={counts.closed}
              icon={CheckCircle2}
              onClick={() => setTab('closed')}
            />
          </nav>

          {/* Show Closed Toggle */}
          <button
            onClick={() => setShowClosed(!showClosed)}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md ml-4 mb-1
              transition-all duration-150 ease-out border
              ${showClosed
                ? 'bg-[var(--color-success-muted)] text-[var(--color-success)] border-[var(--color-success)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
              }
            `}
            data-testid="toggle-show-closed"
          >
            {showClosed ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
            <span>Closed ({closedCount})</span>
          </button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedTaskIds.size > 0 && viewMode === 'list' && (
        <BulkActionMenu
          selectedCount={selectedTaskIds.size}
          onChangeStatus={handleBulkStatusChange}
          onChangePriority={handleBulkPriorityChange}
          onDelete={handleBulkDelete}
          onClear={handleClearSelection}
          isPending={bulkUpdateMutation.isPending}
          isDeleting={bulkDeleteMutation.isPending}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mb-4" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading tasks...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-danger)] rounded-lg bg-[var(--color-danger-muted)]">
          <AlertCircle className="w-12 h-12 text-[var(--color-danger)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--color-text)]">Failed to load tasks</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
            {error.message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-surface)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid="tasks-retry"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState searchQuery={searchQuery} currentTab={currentTab} onCreateClick={() => setIsCreateModalOpen(true)} />
      ) : viewMode === 'list' ? (
        <>
          <TaskListView
            groups={paginatedGroupedTasks}
            entityNameMap={entityNameMap}
            onStart={handleStartTask}
            onComplete={handleCompleteTask}
            onReopen={handleReopenTask}
            onSelectTask={handleSelectTask}
            pendingStart={pendingStart}
            pendingComplete={pendingComplete}
            pendingReopen={pendingReopen}
            collapsedGroups={collapsedGroups}
            onToggleCollapse={toggleGroupCollapse}
            searchQuery={searchQuery}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            selectedTaskIds={selectedTaskIds}
            onToggleSelect={handleToggleSelect}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            onToggleSelectAll={handleToggleSelectAll}
            columnWidths={columnWidths}
            onColumnResizeStart={handleColumnResizeStart}
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : (
        <KanbanBoard
          tasks={allTasks}
          entityNameMap={entityNameMap}
          selectedTaskId={selectedTaskId ?? null}
          onTaskClick={handleSelectTask}
          onUpdateTask={handleUpdateTask}
          searchQuery={searchQuery}
          pageSort={{ field: sortField, direction: sortDirection }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Tab Button Component
// ============================================================================

interface TabButtonProps {
  label: string;
  value: TabValue;
  current: TabValue;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

function TabButton({ label, value, current, count, icon: Icon, onClick }: TabButtonProps) {
  const isActive = current === value;
  return (
    <button
      onClick={onClick}
      className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        isActive
          ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
      }`}
      data-testid={`tasks-tab-${value}`}
    >
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
        {count > 0 && (
          <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface-elevated)]">
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

// ============================================================================
// Sortable Header Component
// ============================================================================

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSortField: SortField;
  currentSortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  width?: number;
  resizable?: boolean;
  columnId?: ColumnId;
  onResizeStart?: (e: React.MouseEvent, columnId: ColumnId) => void;
}

function SortableHeader({
  label,
  field,
  currentSortField,
  currentSortDirection,
  onSortChange,
  width,
  resizable,
  columnId,
  onResizeStart,
}: SortableHeaderProps) {
  const isActive = currentSortField === field;

  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider relative"
      style={width != null ? { width: `${width}px`, minWidth: `${width}px` } : undefined}
    >
      <button
        onClick={() => onSortChange(field)}
        className="flex items-center gap-1 cursor-pointer hover:text-[var(--color-text)] transition-colors group"
      >
        <span>{label}</span>
        {isActive ? (
          currentSortDirection === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-[var(--color-primary)]" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>
      {resizable && columnId && onResizeStart && (
        <ResizeHandle columnId={columnId} onResizeStart={onResizeStart} />
      )}
    </th>
  );
}

// ============================================================================
// Resize Handle Component
// ============================================================================

interface ResizeHandleProps {
  columnId: ColumnId;
  onResizeStart: (e: React.MouseEvent, columnId: ColumnId) => void;
}

function ResizeHandle({ columnId, onResizeStart }: ResizeHandleProps) {
  return (
    <div
      className="absolute top-0 right-0 w-2 h-full cursor-col-resize group/resize z-10 select-none"
      onMouseDown={(e) => onResizeStart(e, columnId)}
      onClick={(e) => e.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnId} column`}
      data-testid={`column-resize-handle-${columnId}`}
    >
      <div className="absolute right-0 top-0 w-[2px] h-full bg-transparent group-hover/resize:bg-[var(--color-primary)] transition-colors" />
    </div>
  );
}

// ============================================================================
// List View with Grouping
// ============================================================================

interface TaskListViewProps {
  groups: TaskGroup[];
  entityNameMap: Map<string, string>;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onReopen: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  pendingStart: Set<string>;
  pendingComplete: Set<string>;
  pendingReopen: Set<string>;
  collapsedGroups: Set<string>;
  onToggleCollapse: (groupKey: string) => void;
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleSelectAll: () => void;
  columnWidths: Record<string, number>;
  onColumnResizeStart: (e: React.MouseEvent, columnId: ColumnId) => void;
}

function TaskListView({
  groups,
  entityNameMap,
  onStart,
  onComplete,
  onReopen,
  onSelectTask,
  pendingStart,
  pendingComplete,
  pendingReopen,
  collapsedGroups,
  onToggleCollapse,
  searchQuery,
  sortField,
  sortDirection,
  onSortChange,
  selectedTaskIds,
  onToggleSelect,
  allPageSelected,
  somePageSelected,
  onToggleSelectAll,
  columnWidths,
  onColumnResizeStart,
}: TaskListViewProps) {
  const showGroups = groups.length > 1 || (groups.length === 1 && groups[0].key !== 'all');

  // Build colgroup for fixed column widths
  const colDefs = TABLE_COLUMNS;

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full"
          style={{ tableLayout: 'fixed' }}
          data-testid="tasks-table"
        >
          <colgroup>
            {colDefs.map((col) => (
              <col
                key={col.id}
                style={{
                  width: `${columnWidths[col.id] ?? col.defaultWidth}px`,
                  minWidth: `${col.minWidth}px`,
                }}
              />
            ))}
          </colgroup>
          <thead className="bg-[var(--color-surface-elevated)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="pl-4 pr-1 py-3" style={{ width: `${columnWidths.checkbox ?? 40}px` }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                  onChange={onToggleSelectAll}
                  className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                  data-testid="task-select-all-checkbox"
                  aria-label="Select all tasks"
                />
              </th>
              <SortableHeader
                label="Task"
                field="title"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSortChange={onSortChange}
                width={columnWidths.title}
                resizable
                columnId="title"
                onResizeStart={onColumnResizeStart}
              />
              <SortableHeader
                label="Status"
                field="status"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSortChange={onSortChange}
                width={columnWidths.status}
                resizable
                columnId="status"
                onResizeStart={onColumnResizeStart}
              />
              <SortableHeader
                label="Priority"
                field="priority"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSortChange={onSortChange}
                width={columnWidths.priority}
                resizable
                columnId="priority"
                onResizeStart={onColumnResizeStart}
              />
              <SortableHeader
                label="Type"
                field="taskType"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSortChange={onSortChange}
                width={columnWidths.taskType}
                resizable
                columnId="taskType"
                onResizeStart={onColumnResizeStart}
              />
              <SortableHeader
                label="Assignee"
                field="assignee"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSortChange={onSortChange}
                width={columnWidths.assignee}
                resizable
                columnId="assignee"
                onResizeStart={onColumnResizeStart}
              />
              <th
                className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider relative"
                style={{ width: `${columnWidths.branch ?? 160}px` }}
              >
                Branch
                <ResizeHandle columnId="branch" onResizeStart={onColumnResizeStart} />
              </th>
              <SortableHeader
                label="Updated"
                field="updated_at"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSortChange={onSortChange}
                width={columnWidths.updatedAt}
                resizable
                columnId="updatedAt"
                onResizeStart={onColumnResizeStart}
              />
              <th
                className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                style={{ width: `${columnWidths.actions ?? 100}px` }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-[var(--color-surface)]">
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                entityNameMap={entityNameMap}
                onStart={onStart}
                onComplete={onComplete}
                onReopen={onReopen}
                onSelectTask={onSelectTask}
                pendingStart={pendingStart}
                pendingComplete={pendingComplete}
                pendingReopen={pendingReopen}
                showHeader={showGroups}
                isCollapsed={collapsedGroups.has(group.key)}
                onToggleCollapse={() => onToggleCollapse(group.key)}
                searchQuery={searchQuery}
                selectedTaskIds={selectedTaskIds}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface GroupSectionProps {
  group: TaskGroup;
  entityNameMap: Map<string, string>;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onReopen: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  pendingStart: Set<string>;
  pendingComplete: Set<string>;
  pendingReopen: Set<string>;
  showHeader: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  searchQuery: string;
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
}

function GroupSection({
  group,
  entityNameMap,
  onStart,
  onComplete,
  onReopen,
  onSelectTask,
  pendingStart,
  pendingComplete,
  pendingReopen,
  showHeader,
  isCollapsed,
  onToggleCollapse,
  searchQuery,
  selectedTaskIds,
  onToggleSelect,
}: GroupSectionProps) {
  return (
    <>
      {showHeader && (
        <tr className="bg-[var(--color-surface-elevated)] border-t border-b border-[var(--color-border)]">
          <td colSpan={9}>
            <button
              onClick={onToggleCollapse}
              className="w-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <span className={group.color ? `px-2 py-0.5 rounded text-xs ${group.color}` : ''}>
                {group.label}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                ({group.tasks.length})
              </span>
            </button>
          </td>
        </tr>
      )}
      {!isCollapsed &&
        group.tasks.map((task) => {
          const matchInfo = searchQuery ? fuzzySearch(task.title, searchQuery) : null;
          return (
            <TaskRow
              key={task.id}
              task={task}
              assigneeName={task.assignee ? entityNameMap.get(task.assignee) : undefined}
              onStart={() => onStart(task.id)}
              onComplete={() => onComplete(task.id)}
              onReopen={() => onReopen(task.id)}
              onClick={() => onSelectTask(task.id)}
              isStarting={pendingStart.has(task.id)}
              isCompleting={pendingComplete.has(task.id)}
              isReopening={pendingReopen.has(task.id)}
              highlightedTitle={matchInfo?.indices ? highlightMatches(task.title, matchInfo.indices) : undefined}
              isSelected={selectedTaskIds.has(task.id)}
              onToggleSelect={onToggleSelect}
            />
          );
        })}
    </>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  searchQuery: string;
  currentTab: TabValue;
  onCreateClick: () => void;
}

function EmptyState({ searchQuery, currentTab, onCreateClick }: EmptyStateProps) {
  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
        <Search className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)]">No matching tasks</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
          No tasks found matching &quot;{searchQuery}&quot;. Try a different search term.
        </p>
      </div>
    );
  }

  const emptyMessages: Record<TabValue, { title: string; description: string }> = {
    all: {
      title: 'No tasks yet',
      description: 'Create your first task to get started. Tasks can be assigned to agents and tracked through completion.',
    },
    backlog: {
      title: 'No backlog tasks',
      description: 'No tasks are currently in the backlog. Create a task with backlog status to see it here.',
    },
    unassigned: {
      title: 'No unassigned tasks',
      description: 'All tasks have been assigned to agents. Create a new task or unassign an existing one.',
    },
    assigned: {
      title: 'No assigned tasks',
      description: 'No tasks are currently assigned and waiting to start. Assign a task to an agent to see it here.',
    },
    in_progress: {
      title: 'No tasks in progress',
      description: 'No agents are currently working on tasks. Start a task to see it here.',
    },
    closed: {
      title: 'No completed tasks',
      description: 'No tasks have been completed yet. Keep working on those tasks!',
    },
    awaiting_merge: {
      title: 'No tasks awaiting merge',
      description: 'No completed tasks are waiting to be merged. Completed task branches will appear here.',
    },
  };

  const { title, description } = emptyMessages[currentTab];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
      <CheckSquare className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
      <h3 className="text-lg font-medium text-[var(--color-text)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
        {description}
      </p>
      {currentTab === 'all' && (
        <button
          onClick={onCreateClick}
          className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          data-testid="tasks-create-empty"
        >
          <Plus className="w-4 h-4" />
          Create Task
        </button>
      )}
    </div>
  );
}
