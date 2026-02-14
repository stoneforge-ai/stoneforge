/**
 * Create Plan Modal Component
 *
 * Reusable modal for creating plans with tasks.
 * Plans must have at least one task.
 * Tasks are selected from existing tasks; use onCreateNewTask to open a separate task creation modal.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ChevronLeft, Search, Info, Loader2, Plus, Trash2, FilePlus } from 'lucide-react';
import { useCreatePlan } from '../hooks';
import type { PlanTaskType } from '../types';

interface SelectedTask {
  id: string; // Unique ID for this selection entry
  taskId: string;
  taskTitle: string;
}

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (plan: { id: string; title: string }) => void;
  /** Current user ID for createdBy field */
  currentUserId?: string;
  /** Whether using mobile layout */
  isMobile?: boolean;
  /** Called on successful creation to show toast */
  onToastSuccess?: (message: string) => void;
  /** Called on error to show toast */
  onToastError?: (message: string) => void;
  /** Called when user wants to create a new task. Opens external task creation modal. */
  onCreateNewTask?: () => void;
  /** Called by the consumer after a task is created to notify this modal */
  onTaskCreated?: (task: { id: string; title: string }) => void;
}

export function CreatePlanModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserId,
  isMobile = false,
  onToastSuccess,
  onToastError,
  onCreateNewTask,
}: CreatePlanModalProps) {
  const queryClient = useQueryClient();
  const [planTitle, setPlanTitle] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<SelectedTask[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const createPlan = useCreatePlan();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPlanTitle('');
      setSelectedTasks([]);
      setSearchQuery('');
      setDebouncedQuery('');
    }
  }, [isOpen]);

  // Debounce search for existing tasks
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Query for existing tasks
  const { data: existingTasks = [], isLoading: isLoadingTasks, refetch: refetchTasks } = useQuery<PlanTaskType[]>({
    queryKey: ['tasks', 'for-plan-creation', debouncedQuery],
    queryFn: async () => {
      const url = debouncedQuery
        ? `/api/tasks?limit=50&search=${encodeURIComponent(debouncedQuery)}`
        : '/api/tasks?limit=50';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const result = await response.json();
      // Handle different API response formats
      const allTasks = (result.tasks || result.items || result.data || (Array.isArray(result) ? result : [])) as PlanTaskType[];
      return allTasks;
    },
    enabled: isOpen,
  });

  // Filter out already selected tasks from the list
  const availableTasks = existingTasks.filter(
    (task) => !selectedTasks.some((st) => st.taskId === task.id)
  );

  // Check if at least one task is selected
  const hasValidTask = selectedTasks.length > 0;
  const canSubmit = planTitle.trim().length > 0 && hasValidTask && currentUserId;

  const selectTask = useCallback((task: PlanTaskType) => {
    setSelectedTasks((prev) => [
      ...prev,
      { id: String(Date.now()), taskId: task.id, taskTitle: task.title },
    ]);
  }, []);

  const removeTask = useCallback((selectionId: string) => {
    setSelectedTasks((prev) => prev.filter((t) => t.id !== selectionId));
  }, []);

  // Handle when a new task is created externally
  const handleTaskCreated = useCallback((task: { id: string; title: string }) => {
    // Invalidate the tasks query to refresh the list
    queryClient.invalidateQueries({ queryKey: ['tasks', 'for-plan-creation'] });
    refetchTasks();
    // Auto-select the newly created task
    setSelectedTasks((prev) => [
      ...prev,
      { id: String(Date.now()), taskId: task.id, taskTitle: task.title },
    ]);
  }, [queryClient, refetchTasks]);

  // Expose handleTaskCreated via a ref or callback pattern
  // For now, we'll use a workaround: store it on window for the parent to call
  useEffect(() => {
    if (isOpen) {
      (window as unknown as { __createPlanModalTaskCreated?: (task: { id: string; title: string }) => void }).__createPlanModalTaskCreated = handleTaskCreated;
    }
    return () => {
      delete (window as unknown as { __createPlanModalTaskCreated?: unknown }).__createPlanModalTaskCreated;
    };
  }, [isOpen, handleTaskCreated]);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      const firstTask = selectedTasks[0];
      const additionalTasks = selectedTasks.slice(1);

      const result = await createPlan.mutateAsync({
        title: planTitle.trim(),
        createdBy: currentUserId!,
        initialTaskId: firstTask.taskId,
        additionalTasks: additionalTasks.map((t) => ({ existingTaskId: t.taskId })),
      });

      onToastSuccess?.('Plan created successfully');
      onSuccess?.({ id: result.id, title: planTitle.trim() });
      onClose();
    } catch (err) {
      onToastError?.((err as Error).message || 'Failed to create plan');
    }
  };

  if (!isOpen) return null;

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--color-bg)]" data-testid="create-plan-modal">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
            aria-label="Cancel"
            data-testid="create-plan-close"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="flex-1 text-lg font-semibold text-[var(--color-text)]">Create Plan</h2>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createPlan.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors touch-target"
            data-testid="create-plan-submit"
          >
            {createPlan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="p-4 pb-20 overflow-y-auto h-[calc(100vh-60px)] space-y-4">
          {/* Plan Title */}
          <div>
            <label htmlFor="plan-title-mobile" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Plan Title *
            </label>
            <input
              id="plan-title-mobile"
              type="text"
              data-testid="plan-title-input"
              placeholder="Enter plan title..."
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Tasks Section */}
          <TasksSection
            selectedTasks={selectedTasks}
            availableTasks={availableTasks}
            isLoadingTasks={isLoadingTasks}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectTask={selectTask}
            onRemoveTask={removeTask}
            onCreateNewTask={onCreateNewTask}
            isMobile={true}
          />
        </div>
      </div>
    );
  }

  // Desktop: Centered modal
  return (
    <div
      data-testid="create-plan-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Plan</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            data-testid="create-plan-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Plan Title */}
          <div>
            <label htmlFor="plan-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Plan Title *
            </label>
            <input
              id="plan-title"
              type="text"
              data-testid="plan-title-input"
              placeholder="Enter plan title..."
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              autoFocus
            />
          </div>

          {/* Tasks Section */}
          <TasksSection
            selectedTasks={selectedTasks}
            availableTasks={availableTasks}
            isLoadingTasks={isLoadingTasks}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectTask={selectTask}
            onRemoveTask={removeTask}
            onCreateNewTask={onCreateNewTask}
            isMobile={false}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            data-testid="create-plan-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createPlan.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="create-plan-submit"
          >
            {createPlan.isPending ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tasks Section Component - handles task selection and display
 */
function TasksSection({
  selectedTasks,
  availableTasks,
  isLoadingTasks,
  searchQuery,
  onSearchChange,
  onSelectTask,
  onRemoveTask,
  onCreateNewTask,
  isMobile,
}: {
  selectedTasks: SelectedTask[];
  availableTasks: PlanTaskType[];
  isLoadingTasks: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectTask: (task: PlanTaskType) => void;
  onRemoveTask: (selectionId: string) => void;
  onCreateNewTask?: () => void;
  isMobile: boolean;
}) {
  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
      {/* Header with buttons */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Tasks ({selectedTasks.length})
          </span>
        </div>
        {onCreateNewTask && (
          <button
            onClick={onCreateNewTask}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-colors"
            data-testid="create-new-task-btn"
          >
            <FilePlus className="w-3 h-3" />
            Create New Task
          </button>
        )}
      </div>
      <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">
        Plans must have at least one task. Search and select existing tasks below.
      </p>

      {/* Selected Tasks */}
      {selectedTasks.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Selected Tasks
          </div>
          <div className="space-y-2">
            {selectedTasks.map((task, index) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">{index + 1}</span>
                  </div>
                  <span className="text-sm text-gray-900 dark:text-white truncate">{task.taskTitle}</span>
                </div>
                <button
                  onClick={() => onRemoveTask(task.id)}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  aria-label="Remove task"
                  data-testid={`remove-selected-task-${task.taskId}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          data-testid="task-search-input"
          placeholder="Search tasks by title or ID..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full pl-10 pr-4 ${isMobile ? 'py-2.5' : 'py-2'} border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
        />
      </div>

      {/* Available Tasks List */}
      <div className={`${isMobile ? 'max-h-60' : 'max-h-48'} overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800`}>
        {isLoadingTasks ? (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading tasks...
          </div>
        ) : availableTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            {searchQuery ? 'No matching tasks found' : 'No tasks available'}
            {onCreateNewTask && (
              <button
                onClick={onCreateNewTask}
                className="block mx-auto mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Create a new task
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {availableTasks.map((task: PlanTaskType) => (
              <button
                key={task.id}
                data-testid={`available-task-${task.id}`}
                onClick={() => onSelectTask(task)}
                className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${isMobile ? 'touch-target' : ''} hover:bg-gray-50 dark:hover:bg-gray-700`}
              >
                <div className="flex-shrink-0 w-5 h-5 rounded border border-gray-300 dark:border-gray-600 flex items-center justify-center">
                  <Plus className="w-3 h-3 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {task.title}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">{task.id}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Export the task created handler for external use
export function notifyPlanModalTaskCreated(task: { id: string; title: string }) {
  const handler = (window as unknown as { __createPlanModalTaskCreated?: (task: { id: string; title: string }) => void }).__createPlanModalTaskCreated;
  if (handler) {
    handler(task);
  }
}
