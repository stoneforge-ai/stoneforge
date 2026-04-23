import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Loader2, Plus, ChevronLeft } from 'lucide-react';
import { TagInput } from '@stoneforge/ui';
import { useIsMobile } from '../../hooks';
import { useCurrentUser } from '../../contexts';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface CreateTaskInput {
  title: string;
  createdBy: string;
  priority?: number;
  complexity?: number;
  taskType?: string;
  assignee?: string;
  tags?: string[];
  description?: string;
  status?: string;
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (task: { id: string }) => void;
  defaultToBacklog?: boolean;
}

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create task');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all task-related queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Trivial' },
];

const COMPLEXITY_OPTIONS = [
  { value: 1, label: 'Trivial' },
  { value: 2, label: 'Simple' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Complex' },
  { value: 5, label: 'Very Complex' },
];

const TASK_TYPE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'chore', label: 'Chore' },
  { value: 'research', label: 'Research' },
  { value: 'documentation', label: 'Documentation' },
];

export function CreateTaskModal({ isOpen, onClose, onSuccess, defaultToBacklog = false }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(3);
  const [complexity, setComplexity] = useState(3);
  const [taskType, setTaskType] = useState('task');
  const [assignee, setAssignee] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [addToBacklog, setAddToBacklog] = useState(defaultToBacklog);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();
  const { data: entities } = useEntities();
  const { currentUser } = useCurrentUser();

  // Focus title input when modal opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setDescription('');
      setPriority(3);
      setComplexity(3);
      setTaskType('task');
      setAssignee('');
      setTags([]);
      setAddToBacklog(defaultToBacklog);
      createTask.reset();
    }
  }, [isOpen, defaultToBacklog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;
    if (!currentUser) return;

    const input: CreateTaskInput = {
      title: title.trim(),
      createdBy: currentUser.id,
      priority,
      complexity,
      taskType,
      status: addToBacklog ? 'backlog' : 'open',
    };

    if (assignee) {
      input.assignee = assignee;
    }

    if (tags.length > 0) {
      input.tags = tags;
    }

    if (description.trim()) {
      input.description = description.trim();
    }

    try {
      const result = await createTask.mutateAsync(input);
      onSuccess?.(result);
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // Responsive hook (TB147)
  const isMobile = useIsMobile();

  if (!isOpen) return null;

  // Mobile: Full-screen modal (TB147)
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--color-bg)]" data-testid="create-task-modal" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
            aria-label="Cancel"
            data-testid="create-task-modal-close"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="flex-1 text-lg font-semibold text-[var(--color-text)]">Create Task</h2>
          <button
            onClick={handleSubmit as unknown as () => void}
            disabled={createTask.isPending || !title.trim() || !currentUser}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors touch-target"
            data-testid="create-task-submit-mobile"
          >
            {createTask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>

        {/* Form - scrollable */}
        <form onSubmit={handleSubmit} className="p-4 pb-20 overflow-y-auto h-[calc(100vh-60px)]">
          {/* Error display */}
          {createTask.isError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {createTask.error?.message || 'Failed to create task'}
            </div>
          )}

          {/* Title */}
          <div className="mb-4">
            <label htmlFor="task-title" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              ref={titleInputRef}
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="create-task-title-input"
              required
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label htmlFor="task-description" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Description <span className="text-[var(--color-text-muted)] text-xs font-normal">(optional)</span>
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              data-testid="create-task-description-input"
            />
          </div>

          {/* Priority */}
          <div className="mb-4">
            <label htmlFor="task-priority" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Priority
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
              data-testid="create-task-priority-select"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Complexity */}
          <div className="mb-4">
            <label htmlFor="task-complexity" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Complexity
            </label>
            <select
              id="task-complexity"
              value={complexity}
              onChange={(e) => setComplexity(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
              data-testid="create-task-complexity-select"
            >
              {COMPLEXITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Task Type */}
          <div className="mb-4">
            <label htmlFor="task-type" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Type
            </label>
            <select
              id="task-type"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
              data-testid="create-task-type-select"
            >
              {TASK_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div className="mb-4">
            <label htmlFor="task-assignee" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Assignee <span className="text-[var(--color-text-muted)] text-xs font-normal">(optional)</span>
            </label>
            <select
              id="task-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
              data-testid="create-task-assignee-select"
            >
              <option value="">Unassigned</option>
              {entities?.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name} ({entity.entityType})
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Tags <span className="text-[var(--color-text-muted)] text-xs font-normal">(optional)</span>
            </label>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder="Add tags..."
            />
          </div>

          {/* Add to Backlog */}
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="task-backlog-mobile"
              checked={addToBacklog}
              onChange={(e) => setAddToBacklog(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              data-testid="create-task-backlog-checkbox"
            />
            <label htmlFor="task-backlog-mobile" className="text-sm text-[var(--color-text)]">
              Add to Backlog
            </label>
          </div>
        </form>
      </div>
    );
  }

  // Desktop: Centered modal
  return (
    <div className="fixed inset-0 z-50" data-testid="create-task-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-task-modal-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-white dark:bg-[var(--color-surface)] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create Task</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              aria-label="Close"
              data-testid="create-task-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4">
            {/* Title */}
            <div className="mb-4">
              <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                ref={titleInputRef}
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-task-title-input"
                required
              />
            </div>

            {/* Description (TB124) */}
            <div className="mb-4">
              <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 text-xs font-normal">(optional, supports Markdown)</span>
              </label>
              <textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                data-testid="create-task-description-input"
              />
            </div>

            {/* Priority & Complexity row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="task-priority" className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-priority-select"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="task-complexity" className="block text-sm font-medium text-gray-700 mb-1">
                  Complexity
                </label>
                <select
                  id="task-complexity"
                  value={complexity}
                  onChange={(e) => setComplexity(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-complexity-select"
                >
                  {COMPLEXITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Task Type & Assignee row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="task-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  id="task-type"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-type-select"
                >
                  {TASK_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="task-assignee" className="block text-sm font-medium text-gray-700 mb-1">
                  Assignee
                </label>
                <select
                  id="task-assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-assignee-select"
                >
                  <option value="">Unassigned</option>
                  {entities?.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <TagInput
                tags={tags}
                onChange={setTags}
                placeholder="Type and press comma to add tags"
                data-testid="create-task-tags-input"
              />
            </div>

            {/* Add to Backlog */}
            <div className="mb-6 flex items-center gap-2">
              <input
                type="checkbox"
                id="task-backlog"
                checked={addToBacklog}
                onChange={(e) => setAddToBacklog(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                data-testid="create-task-backlog-checkbox"
              />
              <label htmlFor="task-backlog" className="text-sm text-gray-700">
                Add to Backlog
              </label>
            </div>

            {/* Error display */}
            {createTask.isError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700" data-testid="create-task-error">
                {(createTask.error as Error)?.message || 'Failed to create task'}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                data-testid="create-task-cancel-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTask.isPending || !title.trim() || !currentUser}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="create-task-submit-button"
              >
                {createTask.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Task
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
