/**
 * Task-related constants and type definitions
 *
 * Shared types and constants used across task components and the tasks route.
 */

// ============================================================================
// Types
// ============================================================================

export interface Task {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  metadata?: {
    manualOrder?: number;
    [key: string]: unknown;
  };
}

export interface Entity {
  id: string;
  name: string;
}

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

// Local storage keys
export const VIEW_MODE_STORAGE_KEY = 'tasks.viewMode';
export const GROUP_BY_STORAGE_KEY = 'tasks.groupBy';
export const SEARCH_STORAGE_KEY = 'tasks.search';
export const SORT_BY_STORAGE_KEY = 'tasks.sortBy';
export const SORT_DIR_STORAGE_KEY = 'tasks.sortDir';
export const SECONDARY_SORT_STORAGE_KEY = 'tasks.secondarySort';

export const EMPTY_FILTER: FilterConfig = {
  status: [],
  priority: [],
  assignee: '',
};

export const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'bg-green-100 text-green-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'blocked', label: 'Blocked', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'review', label: 'Review', color: 'bg-purple-100 text-purple-800' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-800' },
  { value: 'deferred', label: 'Deferred', color: 'bg-purple-100 text-purple-800' },
  { value: 'backlog', label: 'Backlog', color: 'bg-slate-100 text-slate-700' },
] as const;

export const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical', color: 'bg-red-100 text-red-800' },
  { value: 2, label: 'High', color: 'bg-orange-100 text-orange-800' },
  { value: 3, label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  { value: 4, label: 'Low', color: 'bg-green-100 text-green-800' },
  { value: 5, label: 'Trivial', color: 'bg-gray-100 text-gray-800' },
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
  open: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
  in_progress: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
  blocked: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
  review: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200',
  completed: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
  cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  closed: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  backlog: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
};
