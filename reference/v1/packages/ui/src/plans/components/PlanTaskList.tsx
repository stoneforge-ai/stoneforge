/**
 * PlanTaskList - List of tasks within a plan with edit mode support
 */

import { useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { PRIORITY_COLORS } from '../constants';
import type { PlanTaskType } from '../types';

interface PlanTaskListProps {
  tasks: PlanTaskType[];
  isEditMode?: boolean;
  onRemoveTask?: (taskId: string) => void;
  removingTaskId?: string | null;
  /** Called when remove is not allowed (last task). Override to show toast, etc. */
  onRemoveNotAllowed?: () => void;
  /** Base URL for task links. Defaults to '/tasks' */
  taskLinkBase?: string;
}

export function PlanTaskList({
  tasks,
  isEditMode = false,
  onRemoveTask,
  removingTaskId,
  onRemoveNotAllowed,
  taskLinkBase = '/tasks',
}: PlanTaskListProps) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <div
        data-testid="plan-tasks-empty"
        className="text-center py-8 text-gray-500 text-sm"
      >
        No tasks in this plan
      </div>
    );
  }

  // Check if this is the last task
  const isLastTask = tasks.length === 1;

  const handleRemoveClick = (taskId: string) => {
    // Prevent removing the last task
    if (isLastTask) {
      onRemoveNotAllowed?.();
      return;
    }

    if (confirmRemoveId === taskId) {
      // Second click - confirm removal
      onRemoveTask?.(taskId);
      setConfirmRemoveId(null);
    } else {
      // First click - show confirmation
      setConfirmRemoveId(taskId);
    }
  };

  return (
    <div data-testid="plan-tasks-list" className="space-y-2">
      {/* Show warning when only one task */}
      {isLastTask && isEditMode && (
        <div
          data-testid="last-task-warning"
          className="flex items-center gap-2 p-2 mb-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>This is the only task. Plans must have at least one task.</span>
        </div>
      )}
      {tasks.map((task) => (
        <div
          key={task.id}
          data-testid={`plan-task-${task.id}`}
          className={`flex items-center gap-3 p-2 bg-gray-50 rounded-lg group ${
            confirmRemoveId === task.id ? 'bg-red-50 border border-red-200' : ''
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority] || 'bg-gray-200'}`}
            title={`Priority ${task.priority}`}
          />
          <a
            href={`${taskLinkBase}?selected=${task.id}`}
            className="flex-1 text-sm text-gray-900 truncate hover:text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {task.title}
          </a>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              task.status === 'closed'
                ? 'bg-green-100 text-green-700'
                : task.status === 'blocked'
                  ? 'bg-red-100 text-red-700'
                  : task.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
            }`}
          >
            {task.status.replace('_', ' ')}
          </span>
          {isEditMode && onRemoveTask && (
            <button
              data-testid={`remove-task-${task.id}`}
              onClick={() => handleRemoveClick(task.id)}
              disabled={removingTaskId === task.id || isLastTask}
              className={`p-1 rounded transition-colors ${
                isLastTask
                  ? 'text-gray-300 cursor-not-allowed opacity-50'
                  : confirmRemoveId === task.id
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
              } ${removingTaskId === task.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                isLastTask
                  ? 'Cannot remove - plans must have at least one task'
                  : confirmRemoveId === task.id
                    ? 'Click again to confirm removal'
                    : 'Remove from plan'
              }
            >
              {removingTaskId === task.id ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
