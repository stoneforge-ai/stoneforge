/**
 * @stoneforge/ui Plans Module
 *
 * Shared types, utilities, hooks, and components for plan-related features.
 * Use this module to build plan pages in any Stoneforge app.
 *
 * Usage:
 * - Import everything: import * as Plans from '@stoneforge/ui/plans'
 * - Import types: import type { HydratedPlan, PlanProgress } from '@stoneforge/ui/plans'
 * - Import hooks: import { usePlans, usePlan } from '@stoneforge/ui/plans'
 * - Import components: import { PlanListItem, StatusBadge } from '@stoneforge/ui/plans'
 */

// Types
export type {
  PlanType,
  PlanProgress,
  HydratedPlan,
  PlanTaskType,
  ViewMode,
  FuzzySearchResult,
} from './types';

// Constants
export {
  STATUS_CONFIG,
  STATUS_BAR_COLORS,
  PRIORITY_COLORS,
  SEARCH_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY,
  SEARCH_DEBOUNCE_DELAY,
  type StatusConfig,
} from './constants';

// Utilities
export {
  getStoredSearch,
  setStoredSearch,
  getStoredViewMode,
  setStoredViewMode,
  fuzzySearch,
  highlightMatches,
  formatDate,
  formatRelativeTime,
} from './utils';

// Hooks
export {
  usePlans,
  usePlan,
  usePlanTasks,
  usePlanProgress,
  useUpdatePlan,
  useDeletePlan,
  useAddTaskToPlan,
  useRemoveTaskFromPlan,
  useAvailableTasks,
  useCreatePlan,
} from './hooks';

// Components
export {
  StatusBadge,
  StatusFilter,
  ViewToggle,
  PlanSearchBar,
  PlanListItem,
  PlanTaskList,
  TaskStatusSummary,
  TaskPickerModal,
  RoadmapView,
  PlanDetailPanel,
  MobilePlanCard,
  CreatePlanModal,
  notifyPlanModalTaskCreated,
} from './components';
