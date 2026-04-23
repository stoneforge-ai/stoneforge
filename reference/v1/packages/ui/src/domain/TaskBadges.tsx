import * as React from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  ChevronDown,
  Bug,
  Sparkles,
  CircleDot,
  Wrench,
} from 'lucide-react';
import type { TaskStatus, Priority, TaskType, MergeStatus } from './types';
import {
  getStatusDisplayName,
  getStatusColor,
  getPriorityDisplayName,
  getPriorityColor,
  getTaskTypeDisplayName,
  getTaskTypeColor,
  getMergeStatusDisplayName,
  getMergeStatusColor,
} from './types';

/**
 * TaskStatusBadge - Displays task status with color coding
 *
 * Always shows the task's actual status. Merge status indicators are handled
 * separately by the consuming components (TaskRow, TaskCard).
 */

export interface TaskStatusBadgeProps {
  status: TaskStatus | string;
  mergeStatus?: MergeStatus;
  className?: string;
}

export function TaskStatusBadge({
  status,
  className = '',
}: TaskStatusBadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(status)} ${className}`}
      data-testid="task-status-badge"
    >
      {getStatusDisplayName(status)}
    </span>
  );
}

TaskStatusBadge.displayName = 'TaskStatusBadge';

/**
 * TaskPriorityBadge - Displays task priority with color coding and optional icon
 */

export interface TaskPriorityBadgeProps {
  priority: Priority | number;
  showIcon?: boolean;
  className?: string;
}

/**
 * Get the icon component for a priority value
 */
function getPriorityIcon(priority: Priority | number): typeof AlertTriangle {
  switch (priority) {
    case 1:
      return AlertTriangle;
    case 2:
      return ArrowUp;
    case 3:
      return Minus;
    case 4:
      return ArrowDown;
    case 5:
      return ChevronDown;
    default:
      return Minus;
  }
}

export function TaskPriorityBadge({
  priority,
  showIcon = true,
  className = '',
}: TaskPriorityBadgeProps): React.ReactElement {
  const Icon = getPriorityIcon(priority);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getPriorityColor(priority)} ${className}`}
      data-testid="task-priority-badge"
    >
      {showIcon && <Icon className="w-3 h-3" />}
      {getPriorityDisplayName(priority)}
    </span>
  );
}

TaskPriorityBadge.displayName = 'TaskPriorityBadge';

/**
 * TaskTypeBadge - Displays task type with icon and color
 */

export interface TaskTypeBadgeProps {
  taskType: TaskType | string;
  className?: string;
}

/**
 * Get the icon component for a task type
 */
function getTaskTypeIcon(taskType: TaskType | string): typeof Bug {
  switch (taskType) {
    case 'bug':
      return Bug;
    case 'feature':
      return Sparkles;
    case 'task':
      return CircleDot;
    case 'chore':
      return Wrench;
    default:
      return CircleDot;
  }
}

export function TaskTypeBadge({
  taskType,
  className = '',
}: TaskTypeBadgeProps): React.ReactElement {
  const Icon = getTaskTypeIcon(taskType);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${getTaskTypeColor(taskType)} ${className}`}
      data-testid="task-type-badge"
    >
      <Icon className="w-3 h-3" />
      {getTaskTypeDisplayName(taskType)}
    </span>
  );
}

TaskTypeBadge.displayName = 'TaskTypeBadge';

/**
 * MergeStatusBadge - Displays merge status with color coding
 *
 * A standalone badge for displaying merge status in orchestrator contexts.
 */

export interface MergeStatusBadgeProps {
  status: MergeStatus;
  className?: string;
}

export function MergeStatusBadge({
  status,
  className = '',
}: MergeStatusBadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 text-xs font-medium rounded-full ${getMergeStatusColor(status)} ${className}`}
      data-testid="merge-status-badge"
    >
      {getMergeStatusDisplayName(status)}
    </span>
  );
}

MergeStatusBadge.displayName = 'MergeStatusBadge';
