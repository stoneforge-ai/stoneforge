/**
 * TaskPickerModal - Modal for searching and selecting tasks to embed in documents
 *
 * TB153: Updated with ResponsiveModal for mobile support
 *
 * Features:
 * - Search tasks by title
 * - Display task status, priority, and title
 * - Keyboard navigation (arrows, Enter, Escape)
 * - Click to select
 * - Full-screen on mobile, centered on desktop
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Loader2,
  CheckCircle,
  Circle,
  Clock,
  AlertCircle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { ResponsiveModal, useIsMobile } from '@stoneforge/ui';

interface Task {
  id: string;
  title: string;
  status: string;
  priority?: number;
}

interface TaskPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (taskId: string) => void;
  excludeIds?: string[];
}

// Status icon mapping
const statusIcons: Record<string, React.ReactNode> = {
  open: <Circle className="w-4 h-4 text-gray-400" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  blocked: <AlertCircle className="w-4 h-4 text-red-500" />,
  completed: <CheckCircle className="w-4 h-4 text-green-500" />,
  cancelled: <CheckCircle className="w-4 h-4 text-gray-400" />,
};

// Priority labels
const priorityLabels: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Trivial',
};

// Priority colors
const priorityColors: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-blue-100 text-blue-700',
  5: 'bg-gray-100 text-gray-600',
};

function useTasks(searchQuery: string) {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'search', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '50',
      });
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      const response = await fetch(`/api/tasks?${params}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();
      // API returns { data: Task[], total: number } for paginated results
      return Array.isArray(data) ? data : data.data || [];
    },
  });
}

export function TaskPickerModal({
  isOpen,
  onClose,
  onSelect,
  excludeIds = [],
}: TaskPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: tasks, isLoading } = useTasks(searchQuery);

  // Filter out excluded tasks
  const filteredTasks = tasks?.filter((task) => !excludeIds.includes(task.id)) || [];

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredTasks.length, searchQuery]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (taskId: string) => {
      onSelect(taskId);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev >= filteredTasks.length - 1 ? 0 : prev + 1
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? filteredTasks.length - 1 : prev - 1
        );
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedTask = filteredTasks[selectedIndex];
        if (selectedTask) {
          handleSelect(selectedTask.id);
        }
        return;
      }
    },
    [filteredTasks, selectedIndex, handleSelect, onClose]
  );

  const isMobile = useIsMobile();

  // Keyboard hints footer (hidden on mobile)
  const footerContent = !isMobile ? (
    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <ChevronUp className="w-3 h-3" />
          <ChevronDown className="w-3 h-3" />
          Navigate
        </span>
        <span>↵ Select</span>
        <span>Esc Close</span>
      </div>
      {filteredTasks.length > 0 && (
        <span>
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  ) : filteredTasks.length > 0 ? (
    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
      {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
    </div>
  ) : null;

  return (
    <ResponsiveModal
      open={isOpen}
      onClose={onClose}
      title="Select Task"
      size="lg"
      data-testid="task-picker-modal"
      footer={footerContent}
    >
      <div onKeyDown={handleKeyDown}>
        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search tasks..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
              data-testid="task-picker-search"
            />
          </div>
        </div>

        {/* Task List */}
        <div
          ref={listRef}
          className={`overflow-y-auto p-2 ${isMobile ? 'max-h-[calc(100vh-200px)]' : 'max-h-[300px]'}`}
          data-testid="task-picker-list"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading tasks...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No tasks match your search' : 'No tasks available'}
            </div>
          ) : (
            filteredTasks.map((task, index) => {
              const isSelected = index === selectedIndex;
              const statusIcon = statusIcons[task.status] || statusIcons.open;
              const priority = task.priority || 3;
              const priorityLabel = priorityLabels[priority] || 'Medium';
              const priorityColor = priorityColors[priority] || priorityColors[3];

              return (
                <button
                  key={task.id}
                  data-index={index}
                  data-testid={`task-picker-item-${task.id}`}
                  onClick={() => handleSelect(task.id)}
                  onMouseEnter={() => !isMobile && setSelectedIndex(index)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors touch-target ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {/* Status icon */}
                  <span className="flex-shrink-0">{statusIcon}</span>

                  {/* Title */}
                  <span className="flex-1 truncate font-medium">{task.title}</span>

                  {/* Priority badge */}
                  <span
                    className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded ${priorityColor}`}
                  >
                    {priorityLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}

export default TaskPickerModal;
