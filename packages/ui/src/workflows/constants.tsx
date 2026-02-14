/**
 * @stoneforge/ui Workflows Module Constants
 *
 * Status configuration, colors, and icons for workflow visualization.
 */

import {
  Clock,
  Play,
  CheckCircle,
  XCircle,
  Ban,
  type LucideIcon,
} from 'lucide-react';
import type { WorkflowStatus } from './types';

/**
 * Configuration for workflow status display
 */
export interface WorkflowStatusConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Status configuration map
 */
export const WORKFLOW_STATUS_CONFIG: Record<WorkflowStatus, WorkflowStatusConfig> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    borderColor: 'border-gray-300 dark:border-gray-700',
  },
  running: {
    label: 'Running',
    icon: Play,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-700',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300 dark:border-red-700',
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
  },
};

/**
 * Progress bar segment colors
 */
export const PROGRESS_COLORS = {
  completed: 'bg-green-500',
  inProgress: 'bg-blue-500',
  blocked: 'bg-red-400',
  open: 'bg-gray-300 dark:bg-gray-600',
} as const;

/**
 * Task type labels
 */
export const TASK_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'chore', label: 'Chore' },
] as const;

/**
 * Priority labels
 */
export const PRIORITIES = [
  { value: 5, label: '5 - Critical' },
  { value: 4, label: '4 - High' },
  { value: 3, label: '3 - Medium' },
  { value: 2, label: '2 - Low' },
  { value: 1, label: '1 - Lowest' },
] as const;

/**
 * Complexity labels
 */
export const COMPLEXITIES = [
  { value: 1, label: '1 - Trivial' },
  { value: 2, label: '2 - Simple' },
  { value: 3, label: '3 - Medium' },
  { value: 4, label: '4 - Complex' },
  { value: 5, label: '5 - Very Complex' },
] as const;

/**
 * Variable type labels
 */
export const VARIABLE_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
] as const;

/**
 * Step type options
 */
export const STEP_TYPES = [
  { value: 'task', label: 'Task', description: 'Agent-executed task' },
  { value: 'function', label: 'Function', description: 'Execute code directly' },
] as const;

/**
 * Function runtime options
 */
export const FUNCTION_RUNTIMES = [
  { value: 'typescript', label: 'TypeScript', description: 'Execute TypeScript/JavaScript code' },
  { value: 'python', label: 'Python', description: 'Execute Python code' },
  { value: 'shell', label: 'Shell', description: 'Execute shell commands' },
] as const;

/**
 * Status filter options for workflow list
 */
export const STATUS_FILTER_OPTIONS = [
  { value: null, label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

/**
 * Task priority colors
 */
export const TASK_PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-200',
  2: 'bg-blue-200',
  3: 'bg-yellow-200',
  4: 'bg-orange-200',
  5: 'bg-red-200',
};
