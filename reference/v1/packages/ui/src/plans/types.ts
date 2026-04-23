/**
 * @stoneforge/ui Plans Types
 *
 * Shared types for plan-related components and hooks.
 * These types are designed for UI components and data fetching.
 */

/**
 * Plan type for UI display
 */
export interface PlanType {
  id: string;
  type: 'plan';
  title: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  descriptionRef?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

/**
 * Plan progress metrics
 */
export interface PlanProgress {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  remainingTasks: number;
  completionPercentage: number;
}

/**
 * Plan with hydrated progress data
 */
export interface HydratedPlan extends PlanType {
  _progress?: PlanProgress;
}

/**
 * Task type for plan task lists
 */
export interface PlanTaskType {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

/**
 * View mode for plans page
 */
export type ViewMode = 'list' | 'roadmap';

/**
 * Fuzzy search result with match indices
 */
export interface FuzzySearchResult {
  matched: boolean;
  indices: number[];
}
