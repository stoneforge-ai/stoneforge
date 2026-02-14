/**
 * TaskTypeBadge - Displays task type with icon
 */

import type { TaskTypeValue } from '../../api/types';
import { getTaskTypeDisplayName } from '../../api/hooks/useTasks';
import { Bug, Sparkles, CircleDot, Wrench } from 'lucide-react';

interface TaskTypeBadgeProps {
  taskType: TaskTypeValue;
  className?: string;
}

export function TaskTypeBadge({ taskType, className = '' }: TaskTypeBadgeProps) {
  const Icon = getTaskTypeIcon(taskType);
  const colorClass = getTaskTypeColor(taskType);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${colorClass} ${className}`}
      data-testid="task-type-badge"
    >
      <Icon className="w-3 h-3" />
      {getTaskTypeDisplayName(taskType)}
    </span>
  );
}

function getTaskTypeIcon(taskType: TaskTypeValue) {
  switch (taskType) {
    case 'bug': return Bug;
    case 'feature': return Sparkles;
    case 'task': return CircleDot;
    case 'chore': return Wrench;
    default: return CircleDot;
  }
}

function getTaskTypeColor(taskType: TaskTypeValue): string {
  switch (taskType) {
    case 'bug': return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/20';
    case 'feature': return 'text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/20';
    case 'task': return 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20';
    case 'chore': return 'text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-800/50';
    default: return 'text-gray-700 bg-gray-50';
  }
}
