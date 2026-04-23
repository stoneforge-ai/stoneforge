/**
 * Entity Components
 *
 * Reusable card components for displaying different element types.
 * All components use design tokens for consistent styling across light/dark modes.
 *
 * Core domain components are imported from @stoneforge/ui/domain.
 * App-specific components remain local.
 */

// Re-export domain components from @stoneforge/ui
export {
  TaskCard,
  type TaskCardProps,
  EntityCard,
  type EntityCardProps,
  PlanCard,
  type PlanCardProps,
  WorkflowCard,
  type WorkflowCardProps,
  TeamCard,
  type TeamCardProps,
  TaskStatusBadge,
  type TaskStatusBadgeProps,
  TaskPriorityBadge,
  type TaskPriorityBadgeProps,
  TaskTypeBadge,
  type TaskTypeBadgeProps,
  MergeStatusBadge,
  type MergeStatusBadgeProps,
  MobileEntityCard,
  type MobileEntityCardProps,
} from '@stoneforge/ui/domain';

// Re-export types from @stoneforge/ui
export type {
  Task,
  Entity,
  Plan,
  Workflow,
  Document,
  Channel,
  Team,
  TaskStatus,
  Priority,
  TaskType,
  MergeStatus,
  EntityType,
  PlanStatus,
  WorkflowStatus,
} from '@stoneforge/ui/domain';

// App-specific components (not yet extracted to @stoneforge/ui)
export { CreateEntityModal } from './CreateEntityModal';
