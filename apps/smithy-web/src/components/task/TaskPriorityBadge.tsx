/**
 * TaskPriorityBadge - Displays task priority with color coding
 */

import type { Priority } from '../../api/types';
import { getPriorityDisplayName, getPriorityColor } from '../../api/hooks/useTasks';
import { AlertTriangle, ArrowUp, Minus, ArrowDown, ChevronDown } from 'lucide-react';

interface TaskPriorityBadgeProps {
  priority: Priority;
  showIcon?: boolean;
  className?: string;
}

export function TaskPriorityBadge({ priority, showIcon = true, className = '' }: TaskPriorityBadgeProps) {
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

function getPriorityIcon(priority: Priority) {
  switch (priority) {
    case 1: return AlertTriangle;
    case 2: return ArrowUp;
    case 3: return Minus;
    case 4: return ArrowDown;
    case 5: return ChevronDown;
    default: return Minus;
  }
}
