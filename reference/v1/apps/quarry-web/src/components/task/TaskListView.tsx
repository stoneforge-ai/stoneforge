/**
 * TaskListView - List view components for tasks
 *
 * Components:
 * - ListView: Flat list with optional virtualization
 * - GroupedListView: List with collapsible group sections
 * - TaskRow: Individual task row
 * - SortableHeaderCell: Column header with sort controls
 * - GroupHeader: Collapsible group section header
 */

import { useState, useMemo } from 'react';
import { CheckSquare, Square, ArrowUp, ArrowDown, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { VirtualizedList } from '../shared/VirtualizedList';
import { formatRelativeTime } from '../../lib/time';
import { fuzzySearch, highlightMatches, formatStatus } from '../../lib/task-utils';
import type { Task, TaskGroup, SortConfig, SortField, Entity } from '../../lib/task-constants';
import { TASK_ROW_HEIGHT, PRIORITY_LABELS, STATUS_COLORS } from '../../lib/task-constants';

// ============================================================================
// TaskRow Component
// ============================================================================

interface TaskRowProps {
  task: Task;
  isSelected: boolean;
  isChecked: boolean;
  onCheck: (checked: boolean) => void;
  onClick: () => void;
  isOdd: boolean;
  searchQuery?: string;
  entities?: Entity[];
}

export function TaskRow({
  task,
  isSelected,
  isChecked,
  onCheck,
  onClick,
  isOdd,
  searchQuery,
  entities = [],
}: TaskRowProps) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  // Compute highlighted title based on search query
  const highlightedTitle = useMemo(() => {
    if (!searchQuery) return task.title;
    const searchResult = fuzzySearch(task.title, searchQuery);
    if (searchResult && searchResult.indices.length > 0) {
      return highlightMatches(task.title, searchResult.indices);
    }
    return task.title;
  }, [task.title, searchQuery]);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheck(!isChecked);
  };

  return (
    <div
      className={`flex items-center border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/40'
          : isOdd
            ? 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
            : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
      style={{ height: TASK_ROW_HEIGHT }}
    >
      <div className="px-2 py-3 w-10 flex-shrink-0">
        <button
          onClick={handleCheckboxClick}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          data-testid={`task-checkbox-${task.id}`}
          aria-label={isChecked ? `Deselect task: ${task.title}` : `Select task: ${task.title}`}
        >
          {isChecked ? (
            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <Square className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          )}
        </button>
      </div>
      <div className="flex-1 min-w-[200px] px-4 py-3">
        <div className="font-medium text-gray-900 dark:text-gray-100 truncate" data-testid={`task-title-${task.id}`}>{highlightedTitle}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{task.id}</div>
      </div>
      <div className="w-28 px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded whitespace-nowrap ${statusColor}`}>
          {formatStatus(task.status)}
        </span>
      </div>
      <div className="w-28 px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded ${priority.color}`}>
          {priority.label}
        </span>
      </div>
      <div className="w-28 px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize truncate">
        {task.taskType}
      </div>
      <div className="w-32 px-4 py-3 text-sm text-gray-600 dark:text-gray-400 truncate">
        {task.assignee ? (
          <Link
            to="/entities"
            search={{ selected: task.assignee, name: undefined, page: 1, limit: 25 }}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
            onClick={(e) => e.stopPropagation()}
            data-testid={`task-assignee-link-${task.id}`}
          >
            {entities.find((e) => e.id === task.assignee)?.name || task.assignee}
          </Link>
        ) : (
          '-'
        )}
      </div>
      <div className="w-32 px-4 py-3">
        <div className="flex gap-1">
          {task.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded truncate max-w-[60px]">
              {tag}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">+{task.tags.length - 2}</span>
          )}
        </div>
      </div>
      <div className="w-28 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 truncate" title={new Date(task.createdAt).toLocaleString()}>
        {formatRelativeTime(task.createdAt)}
      </div>
    </div>
  );
}

// ============================================================================
// SortableHeaderCell Component
// ============================================================================

interface SortableHeaderCellProps {
  label: string;
  field: SortField;
  currentSort: SortConfig;
  onSort: (field: SortField) => void;
}

export function SortableHeaderCell({
  label,
  field,
  currentSort,
  onSort,
}: SortableHeaderCellProps) {
  const isActive = currentSort.field === field;

  return (
    <button
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 select-none w-full flex items-center gap-1 transition-colors"
      onClick={() => onSort(field)}
      data-testid={`sort-header-${field}`}
    >
      <span>{label}</span>
      {isActive ? (
        currentSort.direction === 'asc' ? (
          <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        ) : (
          <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        )
      ) : (
        <ArrowUpDown className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
      )}
    </button>
  );
}

// ============================================================================
// GroupHeader Component
// ============================================================================

interface GroupHeaderProps {
  group: TaskGroup;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function GroupHeader({
  group,
  isCollapsed,
  onToggle,
}: GroupHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-150 border-b border-gray-200 transition-colors"
      data-testid={`group-header-${group.key}`}
    >
      <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
        <ChevronRight className="w-4 h-4 text-gray-500" />
      </span>
      {group.color && (
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${group.color}`}>
          {group.label}
        </span>
      )}
      {!group.color && (
        <span className="text-sm font-medium text-gray-700">{group.label}</span>
      )}
      <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full" data-testid={`group-count-${group.key}`}>
        {group.tasks.length}
      </span>
    </button>
  );
}

// ============================================================================
// TableHeader Component
// ============================================================================

interface TableHeaderProps {
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: () => void;
  sort: SortConfig;
  onSort: (field: SortField) => void;
}

function TableHeader({ allSelected, someSelected, onSelectAll, sort, onSort }: TableHeaderProps) {
  return (
    <div className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
      <div className="flex items-center" data-testid="tasks-list-header">
        <div className="px-2 py-3 w-10 flex-shrink-0">
          <button
            onClick={onSelectAll}
            className="p-1 hover:bg-gray-200 rounded"
            data-testid="task-select-all"
            aria-label={allSelected ? 'Deselect all tasks' : 'Select all tasks'}
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : someSelected ? (
              <div className="w-4 h-4 border-2 border-blue-600 rounded flex items-center justify-center">
                <div className="w-2 h-0.5 bg-blue-600" />
              </div>
            ) : (
              <Square className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-[200px]">
          <SortableHeaderCell label="Task" field="title" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Status" field="status" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Priority" field="priority" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Type" field="taskType" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-32">
          <SortableHeaderCell label="Assignee" field="assignee" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Tags
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Created" field="created_at" currentSort={sort} onSort={onSort} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ListView Component
// ============================================================================

interface ListViewProps {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedIds: Set<string>;
  onTaskClick: (taskId: string) => void;
  onTaskCheck: (taskId: string, checked: boolean) => void;
  onSelectAll: () => void;
  sort: SortConfig;
  onSort: (field: SortField) => void;
  containerHeight?: number;
  searchQuery?: string;
  entities?: Entity[];
}

export function ListView({
  tasks,
  selectedTaskId,
  selectedIds,
  onTaskClick,
  onTaskCheck,
  onSelectAll,
  sort,
  onSort,
  containerHeight,
  searchQuery,
  entities = [],
}: ListViewProps) {
  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  if (tasks.length === 0) {
    return (
      <div data-testid="tasks-list-view">
        <TableHeader
          allSelected={allSelected}
          someSelected={someSelected}
          onSelectAll={onSelectAll}
          sort={sort}
          onSort={onSort}
        />
        <div className="p-6 text-center text-gray-500">
          No tasks found.
        </div>
      </div>
    );
  }

  // Use virtualization for large lists (more than 50 items)
  const useVirtualization = tasks.length > 50;

  if (useVirtualization) {
    return (
      <div data-testid="tasks-list-view">
        <TableHeader
          allSelected={allSelected}
          someSelected={someSelected}
          onSelectAll={onSelectAll}
          sort={sort}
          onSort={onSort}
        />
        <VirtualizedList
          items={tasks}
          getItemKey={(task) => task.id}
          estimateSize={TASK_ROW_HEIGHT}
          scrollRestoreId="tasks-list"
          height={containerHeight ? containerHeight - 48 : 'calc(100% - 48px)'}
          className="flex-1"
          testId="virtualized-task-list"
          renderItem={(task, index) => (
            <TaskRow
              task={task}
              isSelected={task.id === selectedTaskId}
              isChecked={selectedIds.has(task.id)}
              onCheck={(checked) => onTaskCheck(task.id, checked)}
              onClick={() => onTaskClick(task.id)}
              isOdd={index % 2 === 1}
              searchQuery={searchQuery}
              entities={entities}
            />
          )}
        />
      </div>
    );
  }

  // Standard rendering for small lists
  return (
    <div data-testid="tasks-list-view">
      <TableHeader
        allSelected={allSelected}
        someSelected={someSelected}
        onSelectAll={onSelectAll}
        sort={sort}
        onSort={onSort}
      />
      <div className="bg-white">
        {tasks.map((task, index) => (
          <TaskRow
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
            isChecked={selectedIds.has(task.id)}
            onCheck={(checked) => onTaskCheck(task.id, checked)}
            onClick={() => onTaskClick(task.id)}
            isOdd={index % 2 === 1}
            searchQuery={searchQuery}
            entities={entities}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// GroupedListView Component
// ============================================================================

interface GroupedListViewProps {
  groups: TaskGroup[];
  selectedTaskId: string | null;
  selectedIds: Set<string>;
  onTaskClick: (taskId: string) => void;
  onTaskCheck: (taskId: string, checked: boolean) => void;
  sort: SortConfig;
  onSort: (field: SortField) => void;
  searchQuery?: string;
  entities?: Entity[];
}

export function GroupedListView({
  groups,
  selectedTaskId,
  selectedIds,
  onTaskClick,
  onTaskCheck,
  sort,
  searchQuery,
  onSort,
  entities = [],
}: GroupedListViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const allTasks = groups.flatMap(g => g.tasks);
  const allSelected = allTasks.length > 0 && allTasks.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  const handleSelectAll = () => {
    // This will be handled by the parent
  };

  if (allTasks.length === 0) {
    return (
      <div data-testid="tasks-grouped-list-view">
        <TableHeader
          allSelected={allSelected}
          someSelected={someSelected}
          onSelectAll={handleSelectAll}
          sort={sort}
          onSort={onSort}
        />
        <div className="p-6 text-center text-gray-500">
          No tasks found.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="tasks-grouped-list-view">
      <TableHeader
        allSelected={allSelected}
        someSelected={someSelected}
        onSelectAll={handleSelectAll}
        sort={sort}
        onSort={onSort}
      />
      <div className="bg-white">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          return (
            <div key={group.key} data-testid={`task-group-${group.key}`}>
              <GroupHeader
                group={group}
                isCollapsed={isCollapsed}
                onToggle={() => toggleGroup(group.key)}
              />
              {!isCollapsed && (
                <div>
                  {group.tasks.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isSelected={task.id === selectedTaskId}
                      isChecked={selectedIds.has(task.id)}
                      onCheck={(checked) => onTaskCheck(task.id, checked)}
                      onClick={() => onTaskClick(task.id)}
                      isOdd={index % 2 === 1}
                      searchQuery={searchQuery}
                      entities={entities}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
