/**
 * Task Components for Orchestrator Web
 *
 * Badge components are re-exported from @stoneforge/ui/domain.
 * TaskCard and TaskRow remain local as they have orchestrator-specific features.
 */

// Re-export badge components from @stoneforge/ui
export {
  TaskStatusBadge,
  type TaskStatusBadgeProps,
  TaskPriorityBadge,
  type TaskPriorityBadgeProps,
  TaskTypeBadge,
  type TaskTypeBadgeProps,
  MergeStatusBadge,
  type MergeStatusBadgeProps,
} from '@stoneforge/ui/domain';

// Re-export types from @stoneforge/ui
export type {
  TaskStatus,
  Priority,
  TaskType,
  MergeStatus,
} from '@stoneforge/ui/domain';

// Orchestrator-specific components (have action buttons, orchestrator metadata)
export { TaskCard } from './TaskCard';
export { TaskRow } from './TaskRow';
export { TaskDetailPanel, ReopenDialog } from './TaskDetailPanel';
export { CreateTaskModal } from './CreateTaskModal';
export { TaskDependencySection } from './TaskDependencySection';

// New enhanced task components
export { SortByDropdown } from './SortByDropdown';
export { GroupByDropdown } from './GroupByDropdown';
export { ViewToggle } from './ViewToggle';
export { FilterBar } from './FilterBar';
export { KanbanBoard } from './KanbanBoard';
export { TaskActionsDropdown } from './TaskActionsDropdown';
export { BulkActionMenu } from './BulkActionMenu';
