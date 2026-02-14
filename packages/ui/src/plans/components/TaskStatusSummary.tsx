/**
 * TaskStatusSummary - Grid display of task status counts
 */

import { CheckCircle2, CircleDot, AlertCircle, ListTodo } from 'lucide-react';
import type { PlanProgress } from '../types';

interface TaskStatusSummaryProps {
  progress: PlanProgress;
}

export function TaskStatusSummary({ progress }: TaskStatusSummaryProps) {
  const items = [
    {
      label: 'Completed',
      count: progress.completedTasks,
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    },
    {
      label: 'In Progress',
      count: progress.inProgressTasks,
      icon: <CircleDot className="w-4 h-4 text-blue-500" />,
    },
    {
      label: 'Blocked',
      count: progress.blockedTasks,
      icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    },
    {
      label: 'Remaining',
      count: progress.remainingTasks,
      icon: <ListTodo className="w-4 h-4 text-gray-400" />,
    },
  ];

  return (
    <div data-testid="task-status-summary" className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
        >
          {item.icon}
          <div>
            <div className="text-lg font-semibold text-gray-900">{item.count}</div>
            <div className="text-xs text-gray-500">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
