/**
 * ReadyTasksList - Displays tasks ready to be worked on
 * Shows up to 5 tasks with a link to view all
 */

import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { TaskCard } from '../../../components/entity';
import { useReadyTasks } from '../hooks';

export function ReadyTasksList() {
  const readyTasks = useReadyTasks();

  return (
    <div className="mt-6 sm:mt-8">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100">Ready Tasks</h3>
        <Link to="/tasks" search={{ page: 1, limit: 25, readyOnly: true }} className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          View all <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Link>
      </div>

      {readyTasks.isLoading && (
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading ready tasks...</div>
      )}

      {readyTasks.isError && (
        <div className="text-red-600 text-sm">Failed to load ready tasks</div>
      )}

      {readyTasks.data && readyTasks.data.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
          No ready tasks available. All tasks are either blocked or completed.
        </div>
      )}

      {readyTasks.data && readyTasks.data.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          {readyTasks.data.slice(0, 5).map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
          {readyTasks.data.length > 5 && (
            <Link to="/tasks" search={{ page: 1, limit: 25, readyOnly: true }} className="block text-center text-xs sm:text-sm text-blue-600 hover:text-blue-700 py-2">
              View {readyTasks.data.length - 5} more ready tasks
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
