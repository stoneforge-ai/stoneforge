/**
 * Task utility functions for Orchestrator Web
 *
 * Shared utility functions for task operations including search, sorting, grouping,
 * and localStorage persistence. Adapted from the standard web app with agent support.
 */

import type { Task } from '../api/types';
import type {
  ViewMode,
  SortField,
  SortDirection,
  GroupByField,
  TaskGroup,
} from './task-constants';
import {
  VIEW_MODE_STORAGE_KEY,
  GROUP_BY_STORAGE_KEY,
  SEARCH_STORAGE_KEY,
  SORT_BY_STORAGE_KEY,
  SORT_DIR_STORAGE_KEY,
  SECONDARY_SORT_STORAGE_KEY,
  COLUMN_WIDTHS_STORAGE_KEY,
  DEFAULT_COLUMN_WIDTHS,
  GROUP_BY_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './task-constants';

// ============================================================================
// Search Utilities
// ============================================================================

/**
 * Fuzzy search function that matches query characters in sequence within the title.
 * Returns match info for highlighting if matched, null otherwise.
 */
export function fuzzySearch(title: string, query: string): { matched: boolean; indices: number[] } | null {
  if (!query) return { matched: true, indices: [] };

  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const indices: number[] = [];
  let queryIdx = 0;

  for (let i = 0; i < lowerTitle.length && queryIdx < lowerQuery.length; i++) {
    if (lowerTitle[i] === lowerQuery[queryIdx]) {
      indices.push(i);
      queryIdx++;
    }
  }

  if (queryIdx === lowerQuery.length) {
    return { matched: true, indices };
  }

  return null;
}

/**
 * Highlights matched characters in a title based on match indices.
 */
export function highlightMatches(title: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return title;
  }

  const result: React.ReactNode[] = [];
  const indexSet = new Set(indices);
  let lastIndex = 0;

  for (let i = 0; i < title.length; i++) {
    if (indexSet.has(i)) {
      if (i > lastIndex) {
        result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex, i)}</span>);
      }
      result.push(
        <mark key={`match-${i}`} className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
          {title[i]}
        </mark>
      );
      lastIndex = i + 1;
    }
  }

  if (lastIndex < title.length) {
    result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex)}</span>);
  }

  return <>{result}</>;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format status for display with proper capitalization
 */
export function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// Sorting Utilities
// ============================================================================

type TaskSortField = keyof Task | 'created_at' | 'updated_at' | 'deadline' | 'complexity';

/**
 * Map sort field names to task property names (handle snake_case from legacy URLs)
 */
export function getTaskSortField(field: TaskSortField): keyof Task {
  if (field === 'created_at') return 'createdAt';
  if (field === 'updated_at') return 'updatedAt';
  return field as keyof Task;
}

/**
 * Custom sort comparison for tasks
 */
export function taskSortCompareFn(
  a: Task,
  b: Task,
  field: keyof Task | string,
  direction: 'asc' | 'desc'
): number {
  // Handle date fields specially - parse ISO strings
  if (field === 'createdAt' || field === 'updatedAt' || field === 'created_at' || field === 'updated_at') {
    const aField = field === 'created_at' ? 'createdAt' : field === 'updated_at' ? 'updatedAt' : field;
    const aDate = new Date(a[aField as 'createdAt' | 'updatedAt'] as string).getTime();
    const bDate = new Date(b[aField as 'createdAt' | 'updatedAt'] as string).getTime();
    const cmp = aDate - bDate;
    return direction === 'asc' ? cmp : -cmp;
  }

  // Handle deadline (null deadlines sort last)
  if (field === 'deadline') {
    const aDeadline = a.deadline;
    const bDeadline = b.deadline;
    if (!aDeadline && !bDeadline) return 0;
    if (!aDeadline) return direction === 'asc' ? 1 : -1;
    if (!bDeadline) return direction === 'asc' ? -1 : 1;
    const cmp = new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
    return direction === 'asc' ? cmp : -cmp;
  }

  // Handle priority (numeric, lower is higher priority)
  if (field === 'priority') {
    const cmp = (a.priority ?? 5) - (b.priority ?? 5);
    return direction === 'asc' ? cmp : -cmp;
  }

  // Handle complexity (numeric, lower is simpler)
  if (field === 'complexity') {
    const cmp = (a.complexity ?? 3) - (b.complexity ?? 3);
    return direction === 'asc' ? cmp : -cmp;
  }

  // Default string/number comparison
  const aVal = (a as unknown as Record<string, unknown>)[field as string];
  const bVal = (b as unknown as Record<string, unknown>)[field as string];

  let cmp = 0;
  if (aVal === null || aVal === undefined) cmp = 1;
  else if (bVal === null || bVal === undefined) cmp = -1;
  else if (typeof aVal === 'string' && typeof bVal === 'string') {
    cmp = aVal.localeCompare(bVal);
  } else if (typeof aVal === 'number' && typeof bVal === 'number') {
    cmp = aVal - bVal;
  } else {
    cmp = String(aVal).localeCompare(String(bVal));
  }

  return direction === 'asc' ? cmp : -cmp;
}

// ============================================================================
// Grouping Utilities
// ============================================================================

/**
 * Group tasks by the specified field
 * Uses agents instead of entities for assignee lookup
 */
export function groupTasks(tasks: Task[], groupBy: GroupByField, entityNameMap: Map<string, string>): TaskGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All Tasks', tasks }];
  }

  const groups: Map<string, Task[]> = new Map();

  for (const task of tasks) {
    let keys: string[];

    switch (groupBy) {
      case 'status':
        keys = [task.status];
        break;
      case 'priority':
        keys = [String(task.priority)];
        break;
      case 'assignee':
        keys = [task.assignee || 'unassigned'];
        break;
      case 'taskType':
        keys = [task.taskType || 'task'];
        break;
      case 'tags':
        keys = task.tags.length > 0 ? task.tags : ['untagged'];
        break;
      default:
        keys = ['other'];
    }

    for (const key of keys) {
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(task);
    }
  }

  const result: TaskGroup[] = [];

  if (groupBy === 'status') {
    const statusOrder = ['open', 'in_progress', 'blocked', 'review', 'deferred', 'closed', 'tombstone'];
    for (const status of statusOrder) {
      if (groups.has(status)) {
        const option = STATUS_OPTIONS.find(o => o.value === status);
        result.push({
          key: status,
          label: option?.label || formatStatus(status),
          color: option?.color,
          tasks: groups.get(status)!,
        });
      }
    }
    for (const [key, groupTasks] of groups) {
      if (!statusOrder.includes(key)) {
        result.push({
          key,
          label: formatStatus(key),
          tasks: groupTasks,
        });
      }
    }
  } else if (groupBy === 'priority') {
    const priorityOrder = [1, 2, 3, 4, 5];
    for (const priority of priorityOrder) {
      const key = String(priority);
      if (groups.has(key)) {
        const option = PRIORITY_OPTIONS.find(o => o.value === priority);
        result.push({
          key,
          label: option?.label || `Priority ${priority}`,
          color: option?.color,
          tasks: groups.get(key)!,
        });
      }
    }
  } else if (groupBy === 'assignee') {
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === 'unassigned') return -1;
      if (b === 'unassigned') return 1;
      const nameA = entityNameMap.get(a) || a;
      const nameB = entityNameMap.get(b) || b;
      return nameA.localeCompare(nameB);
    });
    for (const key of sortedKeys) {
      const agentName = key === 'unassigned' ? 'Unassigned' : (entityNameMap.get(key) || key);
      result.push({
        key,
        label: agentName,
        tasks: groups.get(key)!,
      });
    }
  } else if (groupBy === 'taskType') {
    const typeOrder = ['task', 'bug', 'feature', 'chore'];
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const aIdx = typeOrder.indexOf(a);
      const bIdx = typeOrder.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.localeCompare(b);
    });
    for (const key of sortedKeys) {
      result.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        tasks: groups.get(key)!,
      });
    }
  } else if (groupBy === 'tags') {
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === 'untagged') return -1;
      if (b === 'untagged') return 1;
      return a.localeCompare(b);
    });
    for (const key of sortedKeys) {
      result.push({
        key,
        label: key === 'untagged' ? 'Untagged' : key,
        tasks: groups.get(key)!,
      });
    }
  }

  return result;
}

// ============================================================================
// Filter Utilities
// ============================================================================

/**
 * Create a filter function for tasks based on filter configuration
 */
export function createTaskFilter(
  filters: { status: string[]; priority: number[]; assignee: string },
  searchQuery: string
): (task: Task) => boolean {
  const query = searchQuery.toLowerCase().trim();

  return (task: Task) => {
    // Status filter
    if (filters.status.length > 0 && !filters.status.includes(task.status)) {
      return false;
    }

    // Priority filter
    if (filters.priority.length > 0 && !filters.priority.includes(task.priority)) {
      return false;
    }

    // Assignee filter
    if (filters.assignee && task.assignee !== filters.assignee) {
      return false;
    }

    // Search filter
    if (query) {
      const titleMatch = task.title.toLowerCase().includes(query);
      const idMatch = task.id.toLowerCase().includes(query);
      const tagMatch = task.tags.some(tag => tag.toLowerCase().includes(query));
      if (!titleMatch && !idMatch && !tagMatch) {
        return false;
      }
    }

    return true;
  };
}

// ============================================================================
// LocalStorage Persistence
// ============================================================================

export function getStoredSearch(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SEARCH_STORAGE_KEY) || '';
}

export function setStoredSearch(search: string): void {
  if (typeof window === 'undefined') return;
  if (search) {
    localStorage.setItem(SEARCH_STORAGE_KEY, search);
  } else {
    localStorage.removeItem(SEARCH_STORAGE_KEY);
  }
}

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list';
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'kanban' ? 'kanban' : 'list';
}

export function setStoredViewMode(mode: ViewMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

export function getStoredGroupBy(): GroupByField {
  if (typeof window === 'undefined') return 'none';
  const stored = localStorage.getItem(GROUP_BY_STORAGE_KEY);
  if (stored && GROUP_BY_OPTIONS.some(opt => opt.value === stored)) {
    return stored as GroupByField;
  }
  return 'none';
}

export function setStoredGroupBy(groupBy: GroupByField): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GROUP_BY_STORAGE_KEY, groupBy);
}

export function getStoredSortField(): SortField {
  if (typeof window === 'undefined') return 'created_at';
  const stored = localStorage.getItem(SORT_BY_STORAGE_KEY);
  if (stored && SORT_OPTIONS.some(opt => opt.value === stored)) {
    return stored as SortField;
  }
  return 'created_at';
}

export function setStoredSortField(field: SortField): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SORT_BY_STORAGE_KEY, field);
}

export function getStoredSortDirection(): SortDirection {
  if (typeof window === 'undefined') return 'desc';
  const stored = localStorage.getItem(SORT_DIR_STORAGE_KEY);
  return stored === 'asc' ? 'asc' : 'desc';
}

export function setStoredSortDirection(dir: SortDirection): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SORT_DIR_STORAGE_KEY, dir);
}

export function getStoredSecondarySort(): SortField | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(SECONDARY_SORT_STORAGE_KEY);
  if (stored && SORT_OPTIONS.some(opt => opt.value === stored)) {
    return stored as SortField;
  }
  return null;
}

export function setStoredSecondarySort(field: SortField | null): void {
  if (typeof window === 'undefined') return;
  if (field) {
    localStorage.setItem(SECONDARY_SORT_STORAGE_KEY, field);
  } else {
    localStorage.removeItem(SECONDARY_SORT_STORAGE_KEY);
  }
}

export function getStoredColumnWidths(): Record<string, number> {
  if (typeof window === 'undefined') return { ...DEFAULT_COLUMN_WIDTHS };
  const stored = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Merge with defaults so any new columns get their default width
      return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
    } catch {
      return { ...DEFAULT_COLUMN_WIDTHS };
    }
  }
  return { ...DEFAULT_COLUMN_WIDTHS };
}

export function setStoredColumnWidths(widths: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
}
