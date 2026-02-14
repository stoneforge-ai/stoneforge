/**
 * StartAgentDialog - Dialog for starting an ephemeral agent with task assignment
 *
 * Provides a form for:
 * - Selecting or creating a task to assign to the agent
 * - Optionally adding an initial message for additional context
 */

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Loader2,
  AlertCircle,
  Play,
  Plus,
  ChevronDown,
  ListTodo,
  ExternalLink,
} from 'lucide-react';
import { useTasks, useCreateTask } from '../../api/hooks/useTasks';
import type { Task, Priority } from '../../api/types';

export interface StartAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agent: { id: string; name: string };
  onStart: (agentId: string, taskId: string, initialMessage?: string) => Promise<void>;
  /** Called when user clicks "Start & Open" - should start agent and navigate to workspace */
  onStartAndOpen?: (agentId: string, taskId: string, initialMessage?: string) => Promise<void>;
  isStarting?: boolean;
}

interface NewTaskForm {
  title: string;
  priority: Priority;
}

const defaultNewTaskForm: NewTaskForm = {
  title: '',
  priority: 3, // Medium priority
};

export function StartAgentDialog({
  isOpen,
  onClose,
  agent,
  onStart,
  onStartAndOpen,
  isStarting = false,
}: StartAgentDialogProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [initialMessage, setInitialMessage] = useState('');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState<NewTaskForm>(defaultNewTaskForm);
  const [error, setError] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<'start' | 'startAndOpen' | null>(null);

  // Fetch unassigned tasks
  const { data: tasksData, isLoading: tasksLoading } = useTasks({
    assignment: 'unassigned',
  });
  const createTask = useCreateTask();

  // Filter to unassigned, non-closed tasks
  const availableTasks = useMemo(() => {
    const tasks = tasksData?.tasks ?? [];
    return tasks.filter(
      (t: Task) => !t.assignee && t.status !== 'closed' && t.status !== 'tombstone'
    );
  }, [tasksData]);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTaskId('');
      setInitialMessage('');
      setShowNewTaskForm(false);
      setNewTaskForm(defaultNewTaskForm);
      setError(null);
      setStartMode(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent, mode: 'start' | 'startAndOpen' = 'start') => {
    e.preventDefault();
    setError(null);
    setStartMode(mode);

    let taskId = selectedTaskId;

    // If creating a new task, do that first
    if (showNewTaskForm) {
      const trimmedTitle = newTaskForm.title.trim();
      if (!trimmedTitle) {
        setError('Task title is required');
        setStartMode(null);
        return;
      }

      try {
        const result = await createTask.mutateAsync({
          title: trimmedTitle,
          priority: newTaskForm.priority,
        });
        taskId = result.task.id;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create task');
        setStartMode(null);
        return;
      }
    }

    if (!taskId) {
      setError('Please select or create a task');
      setStartMode(null);
      return;
    }

    try {
      const handler = mode === 'startAndOpen' && onStartAndOpen ? onStartAndOpen : onStart;
      await handler(agent.id, taskId, initialMessage.trim() || undefined);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start agent');
      setStartMode(null);
    }
  };

  const handleTaskSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__new__') {
      setShowNewTaskForm(true);
      setSelectedTaskId('');
    } else {
      setShowNewTaskForm(false);
      setSelectedTaskId(value);
    }
  };

  const isValid = showNewTaskForm ? newTaskForm.title.trim().length > 0 : selectedTaskId.length > 0;
  const isSubmitting = isStarting || createTask.isPending || startMode !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="start-agent-backdrop"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="
            w-full max-w-md
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
          "
          data-testid="start-agent-dialog"
          role="dialog"
          aria-labelledby="start-agent-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2
              id="start-agent-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              Start Agent: {agent.name}
            </h2>
            <button
              onClick={handleClose}
              className="
                p-1.5 rounded-lg
                text-[var(--color-text-tertiary)]
                hover:text-[var(--color-text)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors
              "
              aria-label="Close dialog"
              data-testid="start-agent-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Task selection */}
            <div className="space-y-2">
              <label htmlFor="task-select" className="text-sm font-medium text-[var(--color-text)]">
                Task <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Select an unassigned task or create a new one for this agent to work on.
              </p>
              <div className="relative">
                <select
                  id="task-select"
                  value={showNewTaskForm ? '__new__' : selectedTaskId}
                  onChange={handleTaskSelectChange}
                  disabled={tasksLoading}
                  className="
                    w-full px-3 py-2 pr-8
                    text-sm
                    bg-[var(--color-surface)]
                    border border-[var(--color-border)]
                    rounded-lg
                    appearance-none
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                    disabled:opacity-50
                  "
                  data-testid="task-select"
                >
                  <option value="">
                    {tasksLoading ? 'Loading tasks...' : 'Select a task...'}
                  </option>
                  {availableTasks.map((task: Task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                  <option value="__new__">+ Create new task</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
              </div>
            </div>

            {/* New task form (inline) */}
            {showNewTaskForm && (
              <div className="space-y-3 p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                  <Plus className="w-4 h-4" />
                  New Task
                </div>
                <div className="space-y-1">
                  <label htmlFor="new-task-title" className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="new-task-title"
                    type="text"
                    value={newTaskForm.title}
                    onChange={e => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter task title"
                    className="
                      w-full px-3 py-2
                      text-sm
                      bg-[var(--color-bg)]
                      border border-[var(--color-border)]
                      rounded-lg
                      placeholder:text-[var(--color-text-tertiary)]
                      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                    "
                    autoFocus
                    data-testid="new-task-title"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="new-task-priority" className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Priority
                  </label>
                  <div className="relative">
                    <select
                      id="new-task-priority"
                      value={newTaskForm.priority}
                      onChange={e => setNewTaskForm(prev => ({ ...prev, priority: parseInt(e.target.value, 10) as Priority }))}
                      className="
                        w-full px-3 py-2 pr-8
                        text-sm
                        bg-[var(--color-bg)]
                        border border-[var(--color-border)]
                        rounded-lg
                        appearance-none
                        focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                      "
                      data-testid="new-task-priority"
                    >
                      <option value={1}>Critical (P1)</option>
                      <option value={2}>High (P2)</option>
                      <option value={3}>Medium (P3)</option>
                      <option value={4}>Low (P4)</option>
                      <option value={5}>Minimal (P5)</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Initial message (optional) */}
            <div className="space-y-1">
              <label htmlFor="initial-message" className="text-sm font-medium text-[var(--color-text)]">
                Initial Message <span className="text-[var(--color-text-tertiary)]">(optional)</span>
              </label>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Additional context or instructions for the agent.
              </p>
              <textarea
                id="initial-message"
                value={initialMessage}
                onChange={e => setInitialMessage(e.target.value)}
                placeholder="e.g., Focus on the API endpoints first..."
                rows={3}
                className="
                  w-full px-3 py-2
                  text-sm
                  bg-[var(--color-surface)]
                  border border-[var(--color-border)]
                  rounded-lg
                  placeholder:text-[var(--color-text-tertiary)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                  resize-none
                "
                data-testid="initial-message"
              />
            </div>

            {/* Selected task preview */}
            {selectedTaskId && !showNewTaskForm && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <ListTodo className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="text-blue-700 dark:text-blue-300 truncate">
                  {availableTasks.find((t: Task) => t.id === selectedTaskId)?.title ?? 'Selected task'}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="
                  px-4 py-2
                  text-sm font-medium
                  text-[var(--color-text-secondary)]
                  hover:text-[var(--color-text)]
                  hover:bg-[var(--color-surface-hover)]
                  rounded-lg
                  transition-colors
                "
                data-testid="start-agent-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isValid}
                className="
                  flex items-center gap-2
                  px-4 py-2
                  text-sm font-medium
                  text-[var(--color-text-secondary)]
                  border border-[var(--color-border)]
                  hover:bg-[var(--color-surface-hover)]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  rounded-lg
                  transition-colors
                "
                data-testid="start-agent-submit"
              >
                {isSubmitting && startMode === 'start' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {createTask.isPending ? 'Creating task...' : 'Starting...'}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start
                  </>
                )}
              </button>
              {onStartAndOpen && (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, 'startAndOpen')}
                  disabled={isSubmitting || !isValid}
                  className="
                    flex items-center gap-2
                    px-4 py-2
                    text-sm font-medium
                    text-white
                    bg-green-600
                    hover:bg-green-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    rounded-lg
                    transition-colors
                  "
                  data-testid="start-agent-submit-and-open"
                >
                  {isSubmitting && startMode === 'startAndOpen' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {createTask.isPending ? 'Creating task...' : 'Starting...'}
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Start & Open
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
