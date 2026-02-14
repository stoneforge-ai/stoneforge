/**
 * Task-related constants and type definitions for Orchestrator Web
 *
 * Adapted from the standard web app with orchestrator-specific statuses and metadata.
 */

import type { Task, TaskStatus, Priority, TaskTypeValue } from '../api/types';

// Re-export Task type for convenience
export type { Task, TaskStatus, Priority, TaskTypeValue };

// ============================================================================
// Types
// ============================================================================

export type ViewMode = 'list' | 'kanban';
export type SortDirection = 'asc' | 'desc';
export type SortField = 'title' | 'status' | 'priority' | 'taskType' | 'assignee' | 'created_at' | 'updated_at' | 'deadline' | 'complexity';
export type GroupByField = 'none' | 'status' | 'priority' | 'assignee' | 'taskType' | 'tags';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface FilterConfig {
  status: string[];
  priority: number[];
  assignee: string;
}

export interface TaskGroup {
  key: string;
  label: string;
  color?: string;
  tasks: Task[];
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_PAGE_SIZE = 25;
export const SEARCH_DEBOUNCE_DELAY = 300;
export const TASK_ROW_HEIGHT = 60;

// Local storage keys (prefixed with orchestrator-)
export const VIEW_MODE_STORAGE_KEY = 'orchestrator-tasks.viewMode';
export const GROUP_BY_STORAGE_KEY = 'orchestrator-tasks.groupBy';
export const SEARCH_STORAGE_KEY = 'orchestrator-tasks.search';
export const SORT_BY_STORAGE_KEY = 'orchestrator-tasks.sortBy';
export const SORT_DIR_STORAGE_KEY = 'orchestrator-tasks.sortDir';
export const SECONDARY_SORT_STORAGE_KEY = 'orchestrator-tasks.secondarySort';
export const COLUMN_WIDTHS_STORAGE_KEY = 'orchestrator-tasks.columnWidths';

// Column definitions for the task table
export type ColumnId = 'checkbox' | 'title' | 'status' | 'priority' | 'taskType' | 'assignee' | 'branch' | 'updatedAt' | 'actions';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  resizable: boolean;
  sortField?: SortField;
}

export const TABLE_COLUMNS: ColumnDef[] = [
  { id: 'checkbox', label: '', defaultWidth: 40, minWidth: 40, resizable: false },
  { id: 'title', label: 'Task', defaultWidth: 300, minWidth: 120, resizable: true, sortField: 'title' },
  { id: 'status', label: 'Status', defaultWidth: 140, minWidth: 80, resizable: true, sortField: 'status' },
  { id: 'priority', label: 'Priority', defaultWidth: 100, minWidth: 70, resizable: true, sortField: 'priority' },
  { id: 'taskType', label: 'Type', defaultWidth: 90, minWidth: 60, resizable: true, sortField: 'taskType' },
  { id: 'assignee', label: 'Assignee', defaultWidth: 140, minWidth: 80, resizable: true, sortField: 'assignee' },
  { id: 'branch', label: 'Branch', defaultWidth: 160, minWidth: 80, resizable: true },
  { id: 'updatedAt', label: 'Updated', defaultWidth: 100, minWidth: 70, resizable: true, sortField: 'updated_at' },
  { id: 'actions', label: 'Actions', defaultWidth: 100, minWidth: 60, resizable: false },
];

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = Object.fromEntries(
  TABLE_COLUMNS.map(col => [col.id, col.defaultWidth])
);

export const EMPTY_FILTER: FilterConfig = {
  status: [],
  priority: [],
  assignee: '',
};

// Orchestrator-specific status options
export const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
  { value: 'review', label: 'Review', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200' },
  { value: 'deferred', label: 'Deferred', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200' },
  { value: 'backlog', label: 'Backlog', color: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  { value: 'closed', label: 'Closed', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' },
] as const;

export const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
  { value: 2, label: 'High', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' },
  { value: 3, label: 'Medium', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200' },
  { value: 4, label: 'Low', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' },
  { value: 5, label: 'Trivial', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
] as const;

export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'title', label: 'Title' },
  { value: 'complexity', label: 'Complexity' },
];

export const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'taskType', label: 'Type' },
  { value: 'tags', label: 'Tags' },
];

export const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200' },
  2: { label: 'High', color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200' },
  3: { label: 'Medium', color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200' },
  4: { label: 'Low', color: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200' },
  5: { label: 'Trivial', color: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200' },
};

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  in_progress: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
  blocked: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
  review: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200',
  deferred: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200',
  backlog: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  closed: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
  tombstone: 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
};

// Orchestrator-specific kanban columns
export const KANBAN_COLUMNS = [
  { id: 'backlog', title: 'Backlog', status: 'backlog', filter: null, color: 'border-slate-400' },
  { id: 'unassigned', title: 'Unassigned', status: 'open', filter: 'unassigned', color: 'border-gray-400' },
  { id: 'assigned', title: 'Assigned', status: 'open', filter: 'assigned', color: 'border-blue-400' },
  { id: 'in_progress', title: 'In Progress', status: 'in_progress', filter: null, color: 'border-yellow-400' },
  { id: 'awaiting_merge', title: 'Awaiting Merge', status: 'review', filter: null, color: 'border-purple-400' },
  { id: 'closed', title: 'Closed', status: 'closed', filter: null, color: 'border-green-400' },
] as const;

// Task type options
export const TASK_TYPE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'chore', label: 'Chore' },
] as const;

// Merge status options
export const MERGE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-gray-100 text-gray-800' },
  { value: 'testing', label: 'Testing', color: 'bg-blue-100 text-blue-800' },
  { value: 'merging', label: 'Merging', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'merged', label: 'Merged', color: 'bg-green-100 text-green-800' },
  { value: 'conflict', label: 'Conflict', color: 'bg-red-100 text-red-800' },
  { value: 'test_failed', label: 'Test Failed', color: 'bg-red-100 text-red-800' },
  { value: 'failed', label: 'Failed', color: 'bg-red-100 text-red-800' },
] as const;
