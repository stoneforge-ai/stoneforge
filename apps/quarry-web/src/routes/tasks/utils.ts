/**
 * Utility functions for the Tasks page
 * Re-exports shared utilities from lib
 */

export {
  fuzzySearch,
  highlightMatches,
  formatStatus,
  getTaskSortField,
  taskSortCompareFn,
  groupTasks,
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
} from '../../lib/task-utils';
