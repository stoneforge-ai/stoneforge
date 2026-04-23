/**
 * Task selector component for choosing which task to visualize
 */

import type { Task } from '../types';

interface TaskSelectorProps {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TaskSelector({ tasks, selectedId, onSelect }: TaskSelectorProps) {
  return (
    <div className="flex lg:flex-col gap-2 lg:space-y-0 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
      {tasks.map((task) => (
        <button
          key={task.id}
          onClick={() => onSelect(task.id)}
          className={`
            text-left p-2 sm:p-3 rounded-lg border transition-colors shrink-0 lg:shrink lg:w-full
            min-w-[140px] sm:min-w-[160px] lg:min-w-0
            ${selectedId === task.id
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
            }
          `}
        >
          <div className="font-medium text-gray-900 dark:text-gray-100 text-xs sm:text-sm truncate">{task.title}</div>
          <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-mono mt-0.5 sm:mt-1 truncate">{task.id}</div>
        </button>
      ))}
    </div>
  );
}
