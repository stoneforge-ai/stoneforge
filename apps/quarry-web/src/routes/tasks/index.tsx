/**
 * Tasks Route
 *
 * Main tasks page with list/kanban views, filtering, sorting, grouping,
 * bulk actions, and task detail panel.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import {
  Plus,
  CheckSquare,
  X,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

// Hooks
import {
  useDebounce,
  useIsMobile,
  useIsTablet,
  useGlobalQuickActions,
  useShortcutVersion,
} from "../../hooks";
import {
  usePaginatedData,
  createTaskFilter,
  type SortConfig as PaginatedSortConfig,
} from "../../hooks/usePaginatedData";
import { useDeepLink } from "../../hooks/useDeepLink";
import {
  useAllTasks,
  useReadyTaskIds,
  useEntities,
  useBulkUpdate,
  useBulkDelete,
} from "./hooks";

// Components
import { PageHeader, Pagination } from "../../components/shared";
import { ElementNotFound } from "../../components/shared/ElementNotFound";
import { MobileDetailSheet } from "../../components/shared/MobileDetailSheet";
import { TaskDetailPanel } from "../../components/task/TaskDetailPanel";
import { KanbanBoard } from "../../components/task/KanbanBoard";
import { MobileTaskCard } from "../../components/task/MobileTaskCard";
import { ViewToggle } from "../../components/task/ViewToggle";
import { TaskSearchBar } from "../../components/task/TaskSearchBar";
import { SortByDropdown } from "../../components/task/SortByDropdown";
import { GroupByDropdown } from "../../components/task/GroupByDropdown";
import { BulkActionMenu } from "../../components/task/BulkActionMenu";
import { FilterBar } from "../../components/task/FilterBar";
import { ListView, GroupedListView } from "../../components/task/TaskListView";
import { MobileFilterSheet } from "./components";

// Utils & Constants
import { getCurrentBinding } from "../../lib/keyboard";
import {
  fuzzySearch,
  groupTasks,
  getTaskSortField,
  taskSortCompareFn,
  getStoredSearch,
  setStoredSearch,
  getStoredViewMode,
  setStoredViewMode,
  getStoredGroupBy,
  setStoredGroupBy,
  getStoredSortField,
  setStoredSortField,
  getStoredSortDirection,
  setStoredSortDirection,
  getStoredSecondarySort,
  setStoredSecondarySort,
} from "./utils";
import type {
  Task,
  ViewMode,
  SortField,
  SortDirection,
  GroupByField,
  FilterConfig,
} from "./types";
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_DELAY,
  EMPTY_FILTER,
} from "./constants";

export function TasksPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/tasks" });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;
  const selectedFromUrl = search.selected ?? null;
  const readyOnly = search.readyOnly ?? false;
  const assigneeFromUrl = search.assignee ?? "";

  // Sort configuration - use internal field names and localStorage
  const [sortField, setSortField] = useState<SortField>(getStoredSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    getStoredSortDirection,
  );
  const [secondarySort, setSecondarySort] = useState<SortField | null>(
    getStoredSecondarySort,
  );

  // Initialize filters from URL if assignee is provided
  const [filters, setFilters] = useState<FilterConfig>(() => ({
    ...EMPTY_FILTER,
    assignee: assigneeFromUrl,
  }));
  const [groupBy, setGroupBy] = useState<GroupByField>(getStoredGroupBy);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>(getStoredSearch);
  const debouncedSearch = useDebounce(searchQuery, SEARCH_DEBOUNCE_DELAY);

  // Data fetching hooks
  const { data: allTasks, isLoading: isTasksLoading } = useAllTasks();
  const bulkUpdate = useBulkUpdate();
  const bulkDelete = useBulkDelete();
  const entities = useEntities();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    selectedFromUrl,
  );

  // Fetch ready task IDs when readyOnly filter is active
  const { data: readyTaskIds, isLoading: isReadyTasksLoading } =
    useReadyTaskIds();

  // Create filter function for client-side filtering (includes search)
  const filterFn = useMemo(() => {
    const baseFilter = createTaskFilter({
      status: filters.status,
      priority: filters.priority,
      assignee: filters.assignee,
    });

    return (task: Task) => {
      // Apply search filter first
      if (debouncedSearch) {
        const searchResult = fuzzySearch(task.title, debouncedSearch);
        if (!searchResult || !searchResult.matched) return false;
      }

      // Apply readyOnly filter if enabled
      if (readyOnly && readyTaskIds) {
        if (!readyTaskIds.has(task.id)) return false;
      }

      // Apply base filter if exists
      if (baseFilter && !baseFilter(task)) return false;

      return true;
    };
  }, [
    filters.status,
    filters.priority,
    filters.assignee,
    readyOnly,
    readyTaskIds,
    debouncedSearch,
  ]);

  // Create sort config using internal field names
  const sortConfig = useMemo(
    (): PaginatedSortConfig<Task> => ({
      field: getTaskSortField(sortField),
      direction: sortDirection,
    }),
    [sortField, sortDirection],
  );

  // Create a combined sort function that handles secondary sorting
  const combinedSortCompareFn = useCallback(
    (
      a: Task,
      b: Task,
      field: keyof Task | string,
      direction: "asc" | "desc",
    ): number => {
      const primaryResult = taskSortCompareFn(a, b, field, direction);

      if (primaryResult === 0 && secondarySort) {
        const secondaryField = getTaskSortField(secondarySort);
        return taskSortCompareFn(a, b, secondaryField, direction);
      }

      return primaryResult;
    },
    [secondarySort],
  );

  // Client-side pagination with filtering and sorting
  const paginatedData = usePaginatedData<Task>({
    data: allTasks as Task[] | undefined,
    page: currentPage,
    pageSize,
    filterFn,
    sort: sortConfig,
    sortCompareFn: combinedSortCompareFn,
  });

  // Deep-link navigation
  const deepLink = useDeepLink({
    data: allTasks as Task[] | undefined,
    selectedId: selectedFromUrl,
    currentPage,
    pageSize,
    getId: (task) => task.id,
    routePath: "/tasks",
    rowTestIdPrefix: "task-row-",
    autoNavigate: true,
    highlightDelay: 200,
  });

  // Sync selectedTaskId with URL parameter
  useEffect(() => {
    if (selectedFromUrl) {
      setSelectedTaskId(selectedFromUrl);
    }
  }, [selectedFromUrl]);

  // Sync assignee filter with URL parameter
  useEffect(() => {
    if (assigneeFromUrl !== filters.assignee) {
      setFilters((prev) => ({ ...prev, assignee: assigneeFromUrl }));
    }
  }, [assigneeFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Responsive hooks
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  // Global quick actions for C T shortcut
  const { openCreateTaskModal } = useGlobalQuickActions();
  useShortcutVersion();

  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Handle view mode changes and persist to localStorage
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setStoredViewMode(mode);
  }, []);

  // Handle group by changes and persist to localStorage
  const handleGroupByChange = useCallback(
    (newGroupBy: GroupByField) => {
      setGroupBy(newGroupBy);
      setStoredGroupBy(newGroupBy);
      navigate({
        to: "/tasks",
        search: {
          page: 1,
          limit: pageSize,
          readyOnly: readyOnly ? true : undefined,
        },
      });
    },
    [navigate, pageSize, readyOnly],
  );

  // Handle sort field changes and persist to localStorage
  const handleSortFieldChange = useCallback(
    (field: SortField) => {
      setSortField(field);
      setStoredSortField(field);
      navigate({
        to: "/tasks",
        search: {
          page: 1,
          limit: pageSize,
          readyOnly: readyOnly ? true : undefined,
        },
      });
    },
    [navigate, pageSize, readyOnly],
  );

  // Handle sort direction changes and persist to localStorage
  const handleSortDirectionChange = useCallback(
    (direction: SortDirection) => {
      setSortDirection(direction);
      setStoredSortDirection(direction);
      navigate({
        to: "/tasks",
        search: {
          page: 1,
          limit: pageSize,
          readyOnly: readyOnly ? true : undefined,
        },
      });
    },
    [navigate, pageSize, readyOnly],
  );

  // Handle secondary sort changes and persist to localStorage
  const handleSecondarySortChange = useCallback(
    (field: SortField | null) => {
      setSecondarySort(field);
      setStoredSecondarySort(field);
      navigate({
        to: "/tasks",
        search: {
          page: 1,
          limit: pageSize,
          readyOnly: readyOnly ? true : undefined,
        },
      });
    },
    [navigate, pageSize, readyOnly],
  );

  // Handle search changes and persist to localStorage
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setStoredSearch(query);
      navigate({
        to: "/tasks",
        search: {
          page: 1,
          limit: pageSize,
          readyOnly: readyOnly ? true : undefined,
        },
      });
    },
    [navigate, pageSize, readyOnly],
  );

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setStoredSearch("");
    navigate({
      to: "/tasks",
      search: {
        page: 1,
        limit: pageSize,
        readyOnly: readyOnly ? true : undefined,
      },
    });
  }, [navigate, pageSize, readyOnly]);

  // Keyboard shortcuts for view toggle (V L = list, V K = kanban)
  useEffect(() => {
    let lastKey = "";
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const now = Date.now();
      const key = e.key.toLowerCase();

      if (key === "v") {
        lastKey = "v";
        lastKeyTime = now;
        return;
      }

      if (lastKey === "v" && now - lastKeyTime < 500) {
        if (key === "l") {
          e.preventDefault();
          handleViewModeChange("list");
        } else if (key === "k") {
          e.preventDefault();
          handleViewModeChange("kanban");
        }
      }

      lastKey = "";
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleViewModeChange]);

  // Extract task items from client-side paginated data
  const taskItems = paginatedData.items;
  const totalItems = paginatedData.filteredTotal;
  const totalPages = paginatedData.totalPages;
  const isLoading =
    isTasksLoading ||
    paginatedData.isLoading ||
    (readyOnly && isReadyTasksLoading);

  // Group tasks if grouping is enabled
  const taskGroups = useMemo(() => {
    return groupTasks(taskItems, groupBy, entities.data ?? []);
  }, [taskItems, groupBy, entities.data]);

  // Handle task click - update URL with selected task
  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    navigate({
      to: "/tasks",
      search: { page: currentPage, limit: pageSize, selected: taskId },
    });
  };

  const handleCloseDetail = () => {
    setSelectedTaskId(null);
    navigate({ to: "/tasks", search: { page: currentPage, limit: pageSize } });
  };

  const handleTaskCheck = (taskId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (taskItems.length === 0) return;

    const allSelected = taskItems.every((t) => selectedIds.has(t.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(taskItems.map((t) => t.id)));
    }
  };

  const handlePageChange = (page: number) => {
    navigate({
      to: "/tasks",
      search: {
        page,
        limit: pageSize,
        readyOnly: readyOnly ? true : undefined,
      },
    });
    setSelectedIds(new Set());
  };

  const handlePageSizeChange = (newPageSize: number) => {
    navigate({
      to: "/tasks",
      search: {
        page: 1,
        limit: newPageSize,
        readyOnly: readyOnly ? true : undefined,
      },
    });
    setSelectedIds(new Set());
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      const newDirection = sortDirection === "desc" ? "asc" : "desc";
      setSortDirection(newDirection);
      setStoredSortDirection(newDirection);
    } else {
      setSortField(field);
      setStoredSortField(field);
      setSortDirection("desc");
      setStoredSortDirection("desc");
    }
    navigate({
      to: "/tasks",
      search: {
        page: 1,
        limit: pageSize,
        readyOnly: readyOnly ? true : undefined,
      },
    });
  };

  const handleFilterChange = (newFilters: FilterConfig) => {
    setFilters(newFilters);
    navigate({
      to: "/tasks",
      search: {
        page: 1,
        limit: pageSize,
        readyOnly: readyOnly ? true : undefined,
        assignee: newFilters.assignee || undefined,
      },
    });
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTER);
    navigate({
      to: "/tasks",
      search: {
        page: 1,
        limit: pageSize,
        readyOnly: readyOnly ? true : undefined,
      },
    });
  };

  const handleClearReadyOnly = () => {
    navigate({ to: "/tasks", search: { page: 1, limit: pageSize } });
  };

  const handleBulkStatusChange = (status: string) => {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates: { status } },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  };

  const handleBulkPriorityChange = (priority: number) => {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates: { priority } },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  };

  const handleBulkDelete = () => {
    const idsToDelete = Array.from(selectedIds);
    if (selectedTaskId && idsToDelete.includes(selectedTaskId)) {
      setSelectedTaskId(null);
    }
    bulkDelete.mutate(idsToDelete, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const activeFilterCount =
    filters.status.length +
    filters.priority.length +
    (filters.assignee ? 1 : 0);

  return (
    <div className="flex h-full" data-testid="tasks-page">
      {/* Mobile Filter Sheet */}
      {isMobile && (
        <MobileFilterSheet
          open={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          entities={entities.data ?? []}
        />
      )}

      {/* Task List */}
      <div
        className={`flex flex-col ${selectedTaskId && !isMobile ? "w-1/2" : "w-full"} transition-all duration-200 ${selectedTaskId && isMobile ? "hidden" : ""}`}
      >
        {/* Header */}
        <PageHeader
          title="Tasks"
          icon={CheckSquare}
          iconColor="text-blue-500"
          bordered
          actions={[
            {
              label: "Create Task",
              shortLabel: "Create",
              icon: Plus,
              onClick: openCreateTaskModal,
              shortcut: getCurrentBinding("action.createTask"),
              testId: "create-task-button",
            },
          ]}
          testId="tasks-header"
        >
          {/* Search and controls */}
          <div className="space-y-3">
            <TaskSearchBar
              value={searchQuery}
              onChange={handleSearchChange}
              onClear={handleClearSearch}
              compact={isMobile}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 w-full">
                {!isMobile && !isTablet && (
                  <SortByDropdown
                    sortField={sortField}
                    sortDirection={sortDirection}
                    secondarySort={secondarySort}
                    onSortFieldChange={handleSortFieldChange}
                    onSortDirectionChange={handleSortDirectionChange}
                    onSecondarySortChange={handleSecondarySortChange}
                  />
                )}
                {viewMode === "list" && !isMobile && !isTablet && (
                  <GroupByDropdown
                    groupBy={groupBy}
                    onGroupByChange={handleGroupByChange}
                  />
                )}

                <div className="ml-auto">
                  <ViewToggle
                    view={viewMode}
                    onViewChange={handleViewModeChange}
                  />
                </div>
              </div>
              {isMobile && (
                <button
                  onClick={() => setMobileFilterOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors touch-target ${
                    activeFilterCount > 0
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                  }`}
                  data-testid="mobile-filter-button"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </PageHeader>

        {/* Bulk Action Menu */}
        {selectedIds.size > 0 && viewMode === "list" && !isMobile && (
          <BulkActionMenu
            selectedCount={selectedIds.size}
            onChangeStatus={handleBulkStatusChange}
            onChangePriority={handleBulkPriorityChange}
            onDelete={handleBulkDelete}
            onClear={handleClearSelection}
            isPending={bulkUpdate.isPending}
            isDeleting={bulkDelete.isPending}
          />
        )}

        {/* Filter Bar */}
        {!isMobile && viewMode === "list" && (
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            entities={entities.data ?? []}
          />
        )}

        {/* Ready Tasks Filter Chip */}
        {readyOnly && (
          <div
            className="px-4 py-2 border-b border-gray-200 bg-blue-50"
            data-testid="ready-filter-chip"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                Ready tasks only
              </span>
              <button
                onClick={handleClearReadyOnly}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                data-testid="clear-ready-filter"
              >
                <X className="w-3 h-3" />
                Clear filter
              </button>
            </div>
          </div>
        )}

        <div
          className="flex-1 overflow-auto"
          data-testid="tasks-view-container"
        >
          {isLoading && (
            <div className="p-4 text-gray-500">Loading tasks...</div>
          )}

          {!isLoading && viewMode === "list" && (
            <div className="animate-fade-in" data-testid="list-view-content">
              {isMobile ? (
                <div data-testid="mobile-list-view">
                  {taskItems.map((task) => (
                    <MobileTaskCard
                      key={task.id}
                      task={task}
                      isSelected={selectedTaskId === task.id}
                      isChecked={selectedIds.has(task.id)}
                      onCheck={(checked) => handleTaskCheck(task.id, checked)}
                      onClick={() => handleTaskClick(task.id)}
                      searchQuery={debouncedSearch}
                    />
                  ))}
                  {taskItems.length === 0 && (
                    <div className="p-8 text-center text-[var(--color-text-muted)]">
                      No tasks found
                    </div>
                  )}
                </div>
              ) : groupBy === "none" ? (
                <ListView
                  tasks={taskItems}
                  selectedTaskId={selectedTaskId}
                  selectedIds={selectedIds}
                  onTaskClick={handleTaskClick}
                  onTaskCheck={handleTaskCheck}
                  onSelectAll={handleSelectAll}
                  sort={{ field: sortField, direction: sortDirection }}
                  onSort={handleSort}
                  searchQuery={debouncedSearch}
                  entities={entities.data ?? []}
                />
              ) : (
                <GroupedListView
                  groups={taskGroups}
                  selectedTaskId={selectedTaskId}
                  selectedIds={selectedIds}
                  onTaskClick={handleTaskClick}
                  onTaskCheck={handleTaskCheck}
                  sort={{ field: sortField, direction: sortDirection }}
                  onSort={handleSort}
                  searchQuery={debouncedSearch}
                  entities={entities.data ?? []}
                />
              )}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}

          {!isLoading && viewMode === "kanban" && (
            <div
              className="animate-fade-in h-full"
              data-testid="kanban-view-content"
            >
              <KanbanBoard
                entities={entities.data ?? []}
                selectedTaskId={selectedTaskId}
                onTaskClick={handleTaskClick}
                searchQuery={debouncedSearch}
                pageSort={{ field: sortField, direction: sortDirection }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Panel - Desktop */}
      {selectedTaskId && !isMobile && (
        <div
          className="w-1/2 border-l border-gray-200 dark:border-gray-700"
          data-testid="task-detail-container"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Task"
              elementId={selectedTaskId}
              backRoute="/tasks"
              backLabel="Back to Tasks"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <TaskDetailPanel
              taskId={selectedTaskId}
              onClose={handleCloseDetail}
            />
          )}
        </div>
      )}

      {/* Task Detail Panel - Mobile */}
      {selectedTaskId && isMobile && (
        <MobileDetailSheet
          open={!!selectedTaskId}
          onClose={handleCloseDetail}
          title="Task Details"
          data-testid="mobile-task-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Task"
              elementId={selectedTaskId}
              backRoute="/tasks"
              backLabel="Back to Tasks"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <TaskDetailPanel
              taskId={selectedTaskId}
              onClose={handleCloseDetail}
            />
          )}
        </MobileDetailSheet>
      )}

      {/* Mobile Floating Action Button */}
      {isMobile && !selectedTaskId && (
        <button
          onClick={openCreateTaskModal}
          className="fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg z-40 touch-target"
          aria-label="Create new task"
          data-testid="mobile-create-task-fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// Default export for route
export default TasksPage;
