/**
 * TaskMiniCard - Compact task display for entity detail panel
 */

import type { Task } from '../types';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';

interface TaskMiniCardProps {
  task: Task;
  onClick?: (taskId: string) => void;
}

export function TaskMiniCard({ task, onClick }: TaskMiniCardProps) {
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  const handleClick = () => {
    if (onClick) {
      onClick(task.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick(task.id);
    }
  };

  return (
    <div
      className={`bg-white border border-gray-100 rounded p-2 ${
        onClick
          ? 'cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors'
          : 'hover:border-gray-200'
      }`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-testid={`task-mini-card-${task.id}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusColor}`}>
          {task.status.replace('_', ' ')}
        </span>
        <span className={`text-xs font-medium ${priorityColor}`}>P{task.priority}</span>
      </div>
      <p className="text-sm text-gray-900 line-clamp-2">{task.title}</p>
    </div>
  );
}
