/**
 * Hooks for the Tasks page
 * Re-exports shared hooks used by the tasks route
 */

// Re-export task-related hooks for convenience
export { useAllTasks } from '../../api/hooks/useAllElements';
export {
  useReadyTaskIds,
  useEntities,
  useBulkUpdate,
  useBulkDelete,
} from '../../api/hooks/useTaskMutations';
