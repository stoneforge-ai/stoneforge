/**
 * @stoneforge/ui Task Status Summary
 *
 * Displays task counts by status in a grid layout.
 */

import { CheckCircle, AlertCircle, ListTodo, Play } from 'lucide-react';
import type { WorkflowProgress } from '../types';

interface TaskStatusSummaryProps {
  progress: WorkflowProgress;
  layout?: 'grid' | 'inline';
}

export function TaskStatusSummary({
  progress,
  layout = 'grid',
}: TaskStatusSummaryProps) {
  // Support both progress formats
  const completed = progress.completed ?? progress.statusCounts?.['closed'] ?? 0;
  const inProgressCount = progress.inProgress ?? progress.statusCounts?.['in_progress'] ?? 0;
  const blockedCount = progress.blocked ?? progress.blockedTasks ?? 0;
  const openCount = progress.open ?? progress.readyTasks ?? 0;
  const total = progress.total ?? progress.totalTasks ?? 0;

  const items = [
    {
      label: 'Total',
      count: total,
      icon: ListTodo,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-gray-800',
    },
    {
      label: 'Completed',
      count: completed,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/30',
    },
    {
      label: 'In Progress',
      count: inProgressCount,
      icon: Play,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    },
    {
      label: 'Blocked',
      count: blockedCount,
      icon: AlertCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/30',
    },
  ];

  // Open count is available but not always displayed
  // It can be accessed via progress.open for custom displays
  void openCount;

  if (layout === 'inline') {
    return (
      <div data-testid="workflow-task-status-summary" className="flex flex-wrap gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${item.bgColor}`}
          >
            <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
            <span className={`text-sm font-medium ${item.color}`}>{item.count}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="workflow-task-status-summary" className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`p-3 rounded-lg ${item.bgColor}`}
          data-testid={`stat-card-${item.label.toLowerCase().replace(' ', '-')}`}
        >
          <div className="flex items-center gap-2">
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <span className={`text-xl font-semibold ${item.color}`}>{item.count}</span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
