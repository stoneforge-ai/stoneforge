/**
 * Types for the Plans page
 * Page-specific types for plan-related operations
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

export interface PlanProgress {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  remainingTasks: number;
  completionPercentage: number;
}

export interface HydratedPlan extends PlanType {
  _progress?: PlanProgress;
}

export interface TaskType {
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

export type ViewMode = 'list' | 'roadmap';

export interface FuzzySearchResult {
  matched: boolean;
  indices: number[];
}
