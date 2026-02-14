/**
 * @stoneforge/ui Workflows Module Utilities
 *
 * Utility functions for workflow data formatting and manipulation.
 */

import type { Workflow, WorkflowStatus } from './types';
import { WORKFLOW_STATUS_CONFIG } from './constants';

/**
 * Get display name for workflow status
 */
export function getWorkflowStatusDisplayName(status: WorkflowStatus): string {
  return WORKFLOW_STATUS_CONFIG[status]?.label ?? status;
}

/**
 * Get status color class for workflow
 */
export function getWorkflowStatusColor(status: WorkflowStatus): string {
  const config = WORKFLOW_STATUS_CONFIG[status];
  if (config) {
    return `${config.color} ${config.bgColor}`;
  }
  return 'text-gray-600 bg-gray-100';
}

/**
 * Get progress percentage for a workflow
 */
export function getWorkflowProgress(workflow: Workflow): number {
  switch (workflow.status) {
    case 'pending':
      return 0;
    case 'running':
      return 50; // Could be computed from task progress in the future
    case 'completed':
    case 'failed':
    case 'cancelled':
      return 100;
    default:
      return 0;
  }
}

/**
 * Format workflow duration
 */
export function formatWorkflowDuration(workflow: Workflow): string | undefined {
  if (!workflow.startedAt) return undefined;

  const start = new Date(workflow.startedAt).getTime();
  const end = workflow.finishedAt
    ? new Date(workflow.finishedAt).getTime()
    : Date.now();

  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`;
  if (durationMs < 3600000) return `${Math.round(durationMs / 60000)}m`;
  return `${Math.round(durationMs / 3600000)}h`;
}

/**
 * Format relative time from a timestamp
 */
export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Format date to readable string
 */
export function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Check if workflow is in a terminal state
 */
export function isWorkflowTerminal(status: WorkflowStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/**
 * Check if workflow is active (not terminal)
 */
export function isWorkflowActive(status: WorkflowStatus): boolean {
  return status === 'pending' || status === 'running';
}

/**
 * Generate a step ID
 */
export function generateStepId(): string {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
