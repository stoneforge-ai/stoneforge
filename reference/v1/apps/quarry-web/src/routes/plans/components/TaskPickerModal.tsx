/**
 * TaskPickerModal - Modal for adding tasks to a plan
 */

import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { useAvailableTasks } from '../../../api/hooks/usePlanApi';
import { PRIORITY_COLORS } from '../constants';

interface TaskPickerModalProps {
  planId: string;
  onClose: () => void;
  onAddTask: (taskId: string) => void;
  isAdding: boolean;
}

export function TaskPickerModal({
  planId,
  onClose,
  onAddTask,
  isAdding,
}: TaskPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const { data: availableTasks = [], isLoading } = useAvailableTasks(planId, debouncedQuery);

  return (
    <div
      data-testid="task-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Add Task to Plan</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            data-testid="task-picker-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              data-testid="task-picker-search"
              placeholder="Search tasks by title or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading tasks...</div>
          ) : availableTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No matching tasks found' : 'All tasks are already in this plan'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableTasks.map((task) => (
                <button
                  key={task.id}
                  data-testid={`task-picker-item-${task.id}`}
                  onClick={() => onAddTask(task.id)}
                  disabled={isAdding}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 rounded-lg text-left transition-colors disabled:opacity-50"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority] || 'bg-gray-200'}`}
                    title={`Priority ${task.priority}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{task.title}</div>
                    <div className="text-xs text-gray-500 font-mono">{task.id}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
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
                  <Plus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
