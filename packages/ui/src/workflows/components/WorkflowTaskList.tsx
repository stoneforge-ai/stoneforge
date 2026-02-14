/**
 * @stoneforge/ui Workflow Task List
 *
 * Displays the list of tasks within a workflow.
 */

import { AlertCircle } from 'lucide-react';
import type { WorkflowTask } from '../types';
import { TASK_PRIORITY_COLORS } from '../constants';

interface WorkflowTaskListProps {
  tasks: WorkflowTask[];
  /** Base URL for task links (default: /tasks) */
  taskLinkBase?: string;
}

/**
 * Get status-based styling for task status badge
 */
function getTaskStatusStyle(status: string): string {
  switch (status) {
    case 'closed':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    case 'blocked':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    case 'in_progress':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
  }
}

export function WorkflowTaskList({
  tasks,
  taskLinkBase = '/tasks',
}: WorkflowTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div
        data-testid="workflow-tasks-empty"
        className="text-center py-8 text-gray-500 dark:text-gray-400"
      >
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
        <p className="text-sm font-medium">No tasks in this workflow</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Workflows need tasks to be useful. This state should not occur
          as workflows require at least one task to be created.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="workflow-tasks-list" className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          data-testid={`workflow-task-${task.id}`}
          className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-[var(--color-surface)] rounded-lg"
        >
          <div
            className={`w-2 h-2 rounded-full ${TASK_PRIORITY_COLORS[task.priority] || 'bg-gray-200 dark:bg-gray-700'}`}
            title={`Priority ${task.priority}`}
          />
          <a
            href={`${taskLinkBase}?selected=${task.id}`}
            className="flex-1 text-sm text-gray-900 dark:text-[var(--color-text)] truncate hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {task.title}
          </a>
          <span className={`text-xs px-2 py-0.5 rounded ${getTaskStatusStyle(task.status)}`}>
            {task.status.replace('_', ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}
