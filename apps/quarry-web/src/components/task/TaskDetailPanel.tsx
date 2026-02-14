import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, User, Tag, Clock, Link2, AlertTriangle, CheckCircle2, Eye, Pencil, Check, Loader2, Trash2, Paperclip, FileText, ChevronDown, ChevronRight, Plus, Search, Circle, ExternalLink, Users, Save, Bot, Server, Inbox } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { EntityLink } from '@stoneforge/ui/domain';
import { useEntityNavigation } from '../../hooks/useEntityNavigation';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { BlockEditor } from '../editor/BlockEditor';
import { useAllEntities } from '../../api/hooks/useAllElements';
import { type MentionEntity } from '../editor/MentionAutocomplete';

interface Dependency {
  blockedId: string;
  blockerId: string;
  type: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

interface TaskDetail {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deadline?: string;
  scheduledFor?: string;
  descriptionRef?: string;
  description?: string;
  _dependencies: Dependency[];
  _dependents: Dependency[];
}

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

function useTaskDetail(taskId: string) {
  return useQuery<TaskDetail>({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}?hydrate.description=true`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch task');
      }
      return response.json();
    },
    enabled: !!taskId,
  });
}

function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TaskDetail> }) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update task');
      }

      return response.json();
    },
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', id] });

      // Snapshot previous value
      const previousTask = queryClient.getQueryData<TaskDetail>(['tasks', id]);

      // Optimistically update the cache
      if (previousTask) {
        queryClient.setQueryData<TaskDetail>(['tasks', id], {
          ...previousTask,
          ...updates,
        });
      }

      return { previousTask };
    },
    onError: (_error, { id }, context) => {
      // Rollback on error
      if (context?.previousTask) {
        queryClient.setQueryData(['tasks', id], context.previousTask);
      }
    },
    onSettled: (_data, _error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
    },
  });
}

function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete task');
      }

      return response.json();
    },
    onSuccess: (_data, id) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

// Document type for attachments
interface AttachedDocument {
  id: string;
  type: 'document';
  title?: string;
  content?: string;
  contentType: string;
  createdAt: string;
  updatedAt: string;
}

// Hook to fetch task attachments
function useTaskAttachments(taskId: string) {
  return useQuery<AttachedDocument[]>({
    queryKey: ['tasks', taskId, 'attachments'],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/attachments`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch attachments');
      }
      return response.json();
    },
    enabled: !!taskId,
  });
}

// Hook to add attachment
function useAddAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, documentId }: { taskId: string; documentId: string }) => {
      const response = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to attach document');
      }

      return response.json();
    },
    onSuccess: (_data, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'attachments'] });
    },
  });
}

// Hook to remove attachment
function useRemoveAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, documentId }: { taskId: string; documentId: string }) => {
      const response = await fetch(`/api/tasks/${taskId}/attachments/${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove attachment');
      }

      return response.json();
    },
    onSuccess: (_data, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'attachments'] });
    },
  });
}

// Hook to fetch all documents for the picker
function useDocuments(searchQuery: string) {
  return useQuery<AttachedDocument[]>({
    queryKey: ['documents', 'search', searchQuery],
    queryFn: async () => {
      const response = await fetch('/api/documents');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch documents');
      }
      const data = await response.json();
      // Handle paginated response format
      const docs: AttachedDocument[] = data.items || data;
      // Client-side filtering by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return docs.filter(doc =>
          (doc.title?.toLowerCase().includes(query)) ||
          doc.id.toLowerCase().includes(query)
        );
      }
      return docs;
    },
  });
}

// Types for hydrated dependency tasks (TB84)
interface DependencyTask {
  id: string;
  title: string;
  status: string;
  priority: number;
}

interface HydratedDependency {
  dependencyType: string;
  task: DependencyTask;
}

interface DependencyTasksResponse {
  blockedBy: HydratedDependency[];
  blocks: HydratedDependency[];
  progress: {
    resolved: number;
    total: number;
  };
}

// Hook to fetch hydrated dependency tasks (TB84)
function useDependencyTasks(taskId: string) {
  return useQuery<DependencyTasksResponse>({
    queryKey: ['tasks', taskId, 'dependency-tasks'],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/dependency-tasks`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch dependency tasks');
      }
      return response.json();
    },
    enabled: !!taskId,
  });
}

// Hook to create a blocking task (TB84)
function useCreateBlockerTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      blockedTaskId,
      title,
      createdBy,
      priority,
    }: {
      blockedTaskId: string;
      title: string;
      createdBy: string;
      priority?: number;
    }) => {
      // First create the task
      const createResponse = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          createdBy,
          priority: priority ?? 3,
          taskType: 'task',
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error?.message || 'Failed to create blocker task');
      }

      const newTask = await createResponse.json();

      // Then create the dependency (new task blocks the target task)
      const depResponse = await fetch('/api/dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockerId: newTask.id,
          blockedId: blockedTaskId,
          type: 'blocks',
          actor: createdBy,
        }),
      });

      if (!depResponse.ok) {
        const error = await depResponse.json();
        throw new Error(error.error?.message || 'Failed to create dependency');
      }

      return newTask;
    },
    onSuccess: (_data, { blockedTaskId }) => {
      // Invalidate queries to refresh the dependency list
      queryClient.invalidateQueries({ queryKey: ['tasks', blockedTaskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', blockedTaskId, 'dependency-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
    },
  });
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'bg-red-100 text-red-800 border-red-200' },
  2: { label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  3: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  4: { label: 'Low', color: 'bg-green-100 text-green-800 border-green-200' },
  5: { label: 'Trivial', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Open', color: 'bg-blue-100 text-blue-800', icon: null },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800', icon: null },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3 h-3" /> },
  review: { label: 'Review', color: 'bg-purple-100 text-purple-800', icon: <Eye className="w-3 h-3" /> },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: null },
  deferred: { label: 'Deferred', color: 'bg-purple-100 text-purple-800', icon: null },
  backlog: { label: 'Backlog', color: 'bg-slate-100 text-slate-800', icon: <Inbox className="w-3 h-3" /> },
};

const COMPLEXITY_LABELS: Record<number, string> = {
  1: 'Trivial',
  2: 'Simple',
  3: 'Moderate',
  4: 'Complex',
  5: 'Very Complex',
};

const STATUS_OPTIONS = ['open', 'in_progress', 'blocked', 'review', 'completed', 'cancelled', 'deferred', 'backlog'];
const PRIORITY_OPTIONS = [1, 2, 3, 4, 5];
const COMPLEXITY_OPTIONS = [1, 2, 3, 4, 5];

// Delete confirmation dialog component
function DeleteConfirmDialog({
  isOpen,
  taskTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  isOpen: boolean;
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isDeleting) {
          onCancel();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="delete-confirm-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isDeleting && onCancel()}
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Delete Task</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-900">"{taskTitle}"</span>?
              This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            data-testid="delete-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
            data-testid="delete-confirm-button"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

// Mini status badge for sub-issue display (TB84)
const SUB_ISSUE_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  open: { icon: <Circle className="w-3 h-3" />, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  in_progress: { icon: <CircleDot className="w-3 h-3" />, color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  blocked: { icon: <AlertTriangle className="w-3 h-3" />, color: 'text-red-600', bgColor: 'bg-red-50' },
  closed: { icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-green-600', bgColor: 'bg-green-50' },
  completed: { icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-green-600', bgColor: 'bg-green-50' },
  tombstone: { icon: <X className="w-3 h-3" />, color: 'text-gray-500', bgColor: 'bg-gray-50' },
  cancelled: { icon: <X className="w-3 h-3" />, color: 'text-gray-500', bgColor: 'bg-gray-50' },
  deferred: { icon: <Clock className="w-3 h-3" />, color: 'text-purple-600', bgColor: 'bg-purple-50' },
  backlog: { icon: <Inbox className="w-3 h-3" />, color: 'text-slate-600', bgColor: 'bg-slate-50' },
};

// CircleDot icon component for in_progress status
function CircleDot({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

// Single sub-issue card component (TB84)
function SubIssueCard({
  task,
  dependencyType: _dependencyType,
  onClick,
}: {
  task: DependencyTask;
  dependencyType: string;
  onClick: () => void;
}) {
  const statusConfig = SUB_ISSUE_STATUS_CONFIG[task.status] || SUB_ISSUE_STATUS_CONFIG.open;
  const priorityConfig = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const isResolved = ['closed', 'completed', 'tombstone', 'cancelled', 'failed'].includes(task.status);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 p-2 rounded-lg border transition-colors text-left ${
        isResolved
          ? 'bg-gray-50 border-gray-200 opacity-70 hover:opacity-100'
          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
      }`}
      data-testid={`sub-issue-${task.id}`}
    >
      {/* Status icon */}
      <span className={`flex-shrink-0 ${statusConfig.color}`} title={task.status}>
        {statusConfig.icon}
      </span>

      {/* Task title */}
      <span
        className={`flex-1 text-sm truncate ${
          isResolved ? 'text-gray-500 line-through' : 'text-gray-900'
        }`}
        title={task.title}
      >
        {task.title}
      </span>

      {/* Priority badge (compact) */}
      <span
        className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded ${priorityConfig.color}`}
        title={`Priority: ${priorityConfig.label}`}
      >
        P{task.priority}
      </span>

      {/* Navigate icon */}
      <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
    </button>
  );
}

// Create Blocker Modal Component (TB84)
function CreateBlockerModal({
  isOpen,
  onClose,
  onSubmit,
  isCreating,
  blockedTaskTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, priority: number) => void;
  isCreating: boolean;
  blockedTaskTitle: string;
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(3);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setPriority(3);
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isCreating) {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isCreating, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSubmit(title.trim(), priority);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="create-blocker-modal"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isCreating && onClose()}
      />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Create Blocker Task</h3>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          This will create a new task that blocks:{' '}
          <span className="font-medium text-gray-900">"{blockedTaskTitle}"</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Blocker Task Title
            </label>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isCreating}
              data-testid="blocker-title-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((p) => {
                const config = PRIORITY_LABELS[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    disabled={isCreating}
                    className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
                      priority === p
                        ? `${config.color} ring-2 ring-blue-500`
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                    data-testid={`blocker-priority-${p}`}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !title.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              data-testid="create-blocker-submit"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Blocker
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Dependency Sub-Issues Section Component (TB84)
function DependencySubIssues({
  taskId,
  taskTitle,
  taskCreatedBy,
}: {
  taskId: string;
  taskTitle: string;
  taskCreatedBy: string;
}) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useDependencyTasks(taskId);
  const createBlocker = useCreateBlockerTask();
  const [isBlockedByExpanded, setIsBlockedByExpanded] = useState(true);
  const [isBlocksExpanded, setIsBlocksExpanded] = useState(true);
  const [showCreateBlocker, setShowCreateBlocker] = useState(false);

  const handleNavigateToTask = (id: string) => {
    navigate({ to: '/tasks', search: { page: 1, limit: 25, selected: id } });
  };

  const handleCreateBlocker = (title: string, priority: number) => {
    createBlocker.mutate(
      {
        blockedTaskId: taskId,
        title,
        createdBy: taskCreatedBy,
        priority,
      },
      {
        onSuccess: () => {
          setShowCreateBlocker(false);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="mt-4" data-testid="dependency-sub-issues-loading">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading dependencies...
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return null;
  }

  const hasBlockedBy = data.blockedBy.length > 0;
  const hasBlocks = data.blocks.length > 0;

  if (!hasBlockedBy && !hasBlocks) {
    return (
      <div className="mt-4" data-testid="dependency-sub-issues-section">
        {/* Show create blocker button even when no dependencies */}
        <button
          onClick={() => setShowCreateBlocker(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors w-full"
          data-testid="create-blocker-btn"
        >
          <Plus className="w-4 h-4" />
          Create Blocker Task
        </button>
        <CreateBlockerModal
          isOpen={showCreateBlocker}
          onClose={() => setShowCreateBlocker(false)}
          onSubmit={handleCreateBlocker}
          isCreating={createBlocker.isPending}
          blockedTaskTitle={taskTitle}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4" data-testid="dependency-sub-issues-section">
      {/* Blocked By Section */}
      {hasBlockedBy && (
        <div>
          <button
            onClick={() => setIsBlockedByExpanded(!isBlockedByExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700 w-full"
            data-testid="blocked-by-toggle"
          >
            {isBlockedByExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <Link2 className="w-3 h-3" />
            Blocked By ({data.progress.resolved} of {data.progress.total} resolved)
          </button>
          {isBlockedByExpanded && (
            <div className="space-y-1.5 ml-4" data-testid="blocked-by-list">
              {data.blockedBy.map((dep) => (
                <SubIssueCard
                  key={dep.task.id}
                  task={dep.task}
                  dependencyType={dep.dependencyType}
                  onClick={() => handleNavigateToTask(dep.task.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Blocks Section */}
      {hasBlocks && (
        <div>
          <button
            onClick={() => setIsBlocksExpanded(!isBlocksExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700 w-full"
            data-testid="blocks-toggle"
          >
            {isBlocksExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <Link2 className="w-3 h-3" />
            Blocks ({data.blocks.length})
          </button>
          {isBlocksExpanded && (
            <div className="space-y-1.5 ml-4" data-testid="blocks-list">
              {data.blocks.map((dep) => (
                <SubIssueCard
                  key={dep.task.id}
                  task={dep.task}
                  dependencyType={dep.dependencyType}
                  onClick={() => handleNavigateToTask(dep.task.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Blocker Button */}
      <button
        onClick={() => setShowCreateBlocker(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors w-full"
        data-testid="create-blocker-btn"
      >
        <Plus className="w-4 h-4" />
        Create Blocker Task
      </button>

      <CreateBlockerModal
        isOpen={showCreateBlocker}
        onClose={() => setShowCreateBlocker(false)}
        onSubmit={handleCreateBlocker}
        isCreating={createBlocker.isPending}
        blockedTaskTitle={taskTitle}
      />
    </div>
  );
}

// Document Picker Modal Component
function DocumentPickerModal({
  isOpen,
  onClose,
  onSelect,
  alreadyAttachedIds,
  isAttaching,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (documentId: string) => void;
  alreadyAttachedIds: string[];
  isAttaching: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: documents, isLoading } = useDocuments(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isAttaching) {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isAttaching, onClose]);

  if (!isOpen) return null;

  const availableDocs = documents?.filter(doc => !alreadyAttachedIds.includes(doc.id)) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="document-picker-modal"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isAttaching && onClose()}
      />
      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Attach Document</h3>
            <button
              onClick={onClose}
              disabled={isAttaching}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              data-testid="document-picker-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="document-picker-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : availableDocs.length === 0 ? (
            <div className="text-center py-8 text-gray-500" data-testid="document-picker-empty">
              {documents?.length === 0
                ? 'No documents available'
                : searchQuery
                ? 'No documents match your search'
                : 'All documents are already attached'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelect(doc.id)}
                  disabled={isAttaching}
                  className="w-full flex items-center gap-3 p-3 text-left bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  data-testid={`document-picker-item-${doc.id}`}
                >
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {doc.title || 'Untitled Document'}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="font-mono">{doc.id}</span>
                      <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                        {doc.contentType}
                      </span>
                    </div>
                  </div>
                  {isAttaching && (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to get first line of content for preview
function getContentPreview(content?: string): string {
  if (!content) return '';
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
}

// Helper to render content based on content type
function renderDocumentContent(content: string, contentType: string): React.ReactNode {
  if (contentType === 'json') {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2);
      return (
        <pre className="text-xs font-mono bg-gray-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
          {formatted}
        </pre>
      );
    } catch {
      return <pre className="text-xs font-mono bg-gray-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">{content}</pre>;
    }
  }

  if (contentType === 'markdown') {
    return (
      <MarkdownRenderer
        content={content}
        className="text-sm text-gray-700 dark:text-gray-300"
        testId="attachment-markdown-content"
      />
    );
  }

  // Default: plain text
  return (
    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">{content}</pre>
  );
}

// Expandable Document Card Component
function ExpandableDocumentCard({
  doc,
  onRemove,
  isRemoving,
}: {
  doc: AttachedDocument;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const preview = getContentPreview(doc.content);

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden"
      data-testid={`attachment-item-${doc.id}`}
    >
      {/* Header - always visible */}
      <div className="flex items-center gap-2 p-2 bg-gray-50 group">
        {/* Expand/Collapse button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
          data-testid={`attachment-expand-${doc.id}`}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </button>
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <a
              href={`/documents?selected=${doc.id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate"
              data-testid={`attachment-link-${doc.id}`}
            >
              {doc.title || 'Untitled Document'}
            </a>
            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] flex-shrink-0">
              {doc.contentType}
            </span>
          </div>
          {!isExpanded && preview && (
            <div className="text-xs text-gray-500 truncate mt-0.5" data-testid={`attachment-preview-${doc.id}`}>
              {preview}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          aria-label="Remove attachment"
          data-testid={`attachment-remove-${doc.id}`}
        >
          {isRemoving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && doc.content && (
        <div className="p-3 border-t border-gray-200 bg-white" data-testid={`attachment-content-${doc.id}`}>
          {renderDocumentContent(doc.content, doc.contentType)}
        </div>
      )}

      {/* Expanded but no content */}
      {isExpanded && !doc.content && (
        <div className="p-3 border-t border-gray-200 bg-white text-sm text-gray-500 italic" data-testid={`attachment-content-${doc.id}`}>
          No content available
        </div>
      )}
    </div>
  );
}

// Attachments Section Component
function AttachmentsSection({
  taskId,
}: {
  taskId: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const { data: attachments, isLoading } = useTaskAttachments(taskId);
  const addAttachment = useAddAttachment();
  const removeAttachment = useRemoveAttachment();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleAttach = (documentId: string) => {
    addAttachment.mutate(
      { taskId, documentId },
      {
        onSuccess: () => setShowPicker(false),
      }
    );
  };

  const handleRemove = (documentId: string) => {
    setRemovingId(documentId);
    removeAttachment.mutate(
      { taskId, documentId },
      {
        onSettled: () => setRemovingId(null),
      }
    );
  };

  const alreadyAttachedIds = attachments?.map(a => a.id) || [];

  return (
    <div className="mb-6" data-testid="attachments-section">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700"
        data-testid="attachments-toggle"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <Paperclip className="w-3 h-3" />
        Attachments ({attachments?.length || 0})
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading attachments...
            </div>
          ) : attachments && attachments.length > 0 ? (
            attachments.map((doc) => (
              <ExpandableDocumentCard
                key={doc.id}
                doc={doc}
                onRemove={() => handleRemove(doc.id)}
                isRemoving={removingId === doc.id}
              />
            ))
          ) : (
            <div className="text-sm text-gray-500" data-testid="attachments-empty">
              No documents attached
            </div>
          )}

          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors w-full"
            data-testid="attach-document-btn"
          >
            <Plus className="w-4 h-4" />
            Attach Document
          </button>
        </div>
      )}

      <DocumentPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleAttach}
        alreadyAttachedIds={alreadyAttachedIds}
        isAttaching={addAttachment.isPending}
      />
    </div>
  );
}

// Task Description Section with editing support (TB124)
function TaskDescriptionSection({
  description,
  onUpdate,
  isUpdating,
}: {
  taskId?: string; // Reserved for future use
  description?: string;
  onUpdate: (description: string) => void;
  isUpdating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description || '');
  const [isExpanded, setIsExpanded] = useState(true);

  // Get entities for @mention autocomplete
  const { data: entitiesData } = useAllEntities();
  const mentionEntities: MentionEntity[] = useMemo(() => {
    if (!entitiesData) return [];
    return entitiesData.map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.entityType,
    }));
  }, [entitiesData]);

  // Reset edit state when description changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditedDescription(description || '');
    }
  }, [description, isEditing]);

  const handleSave = useCallback(() => {
    if (editedDescription !== (description || '')) {
      onUpdate(editedDescription);
    }
    setIsEditing(false);
  }, [editedDescription, description, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditedDescription(description || '');
    setIsEditing(false);
  }, [description]);

  const hasDescription = description && description.trim().length > 0;

  return (
    <div className="mb-6" data-testid="task-description-section">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700"
        data-testid="description-toggle"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <FileText className="w-3 h-3" />
        Description
        {!hasDescription && (
          <span className="text-xs text-gray-400 normal-case tracking-normal font-normal">(none)</span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {isEditing ? (
            <>
              <BlockEditor
                content={editedDescription}
                contentType="markdown"
                onChange={setEditedDescription}
                placeholder="Add a description with @mentions..."
                mentionEntities={mentionEntities}
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  data-testid="description-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isUpdating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                  data-testid="description-save-btn"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </>
                  )}
                </button>
              </div>
            </>
          ) : hasDescription ? (
            <div
              onClick={() => setIsEditing(true)}
              className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all group"
              data-testid="task-description-content"
            >
              <MarkdownRenderer
                content={description}
                className="text-gray-700 dark:text-gray-300"
                testId="task-description-markdown"
              />
              <div className="mt-2 flex items-center gap-1 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="w-3 h-3" />
                Click to edit
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors w-full"
              data-testid="add-description-btn"
            >
              <Plus className="w-4 h-4" />
              Add Description
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Extract @mentions from markdown content (TB112)
// Entity names can contain letters, numbers, hyphens, and underscores
function extractMentions(content?: string): string[] {
  if (!content) return [];
  const mentionRegex = /@([\w-]+)/g;
  const matches: string[] = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    if (!matches.includes(match[1])) {
      matches.push(match[1]);
    }
  }
  return matches;
}

// Mentioned Entities Section (TB112)
function MentionedEntitiesSection({
  description,
}: {
  description?: string;
}) {
  const { data: entitiesData } = useAllEntities();
  const [isExpanded, setIsExpanded] = useState(true);
  const { onNavigate, renderProfileLink } = useEntityNavigation();

  // Collect all mentions from description
  const mentionedNames = useMemo(() => {
    return extractMentions(description);
  }, [description]);

  // Match mention names to actual entities
  const mentionedEntities = useMemo(() => {
    if (!entitiesData || mentionedNames.length === 0) return [];
    return entitiesData.filter((entity) =>
      mentionedNames.some(
        (name) => name.toLowerCase() === entity.name.toLowerCase()
      )
    );
  }, [entitiesData, mentionedNames]);

  if (mentionedEntities.length === 0) {
    return null;
  }

  return (
    <div className="mb-6" data-testid="mentioned-entities-section">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700"
        data-testid="mentioned-entities-toggle"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <Users className="w-3 h-3" />
        Mentioned Entities ({mentionedEntities.length})
      </button>

      {isExpanded && (
        <div className="flex flex-wrap gap-2" data-testid="mentioned-entities-list">
          {mentionedEntities.map((entity) => (
            <EntityLink
              key={entity.id}
              entityRef={entity.id}
              showIcon
              showHoverCard
              navigable
              onNavigate={onNavigate}
              renderProfileLink={renderProfileLink}
              data-testid={`mentioned-entity-${entity.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Inline editable title component
function EditableTitle({
  value,
  onSave,
  isUpdating,
}: {
  value: string;
  onSave: (value: string) => void;
  isUpdating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    if (editValue.trim() && editValue !== value) {
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 text-lg font-semibold text-gray-900 border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="task-title-input"
        />
        {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h2
        className="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600"
        onClick={() => setIsEditing(true)}
        data-testid="task-detail-title"
      >
        {value}
      </h2>
      <button
        onClick={() => setIsEditing(true)}
        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded transition-opacity"
        aria-label="Edit title"
        data-testid="task-title-edit-button"
      >
        <Pencil className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  );
}

// Valid status transitions (mirrors core package STATUS_TRANSITIONS)
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  backlog: ['open', 'deferred', 'closed', 'completed', 'cancelled'],
  open: ['in_progress', 'blocked', 'deferred', 'backlog', 'closed', 'completed', 'cancelled'],
  in_progress: ['open', 'blocked', 'deferred', 'review', 'closed', 'completed', 'cancelled'],
  blocked: ['open', 'in_progress', 'deferred', 'closed', 'completed', 'cancelled'],
  deferred: ['open', 'in_progress', 'backlog'],
  review: ['closed', 'in_progress', 'completed', 'cancelled'],
  closed: ['open'],
  completed: ['open'],
  cancelled: ['open'],
};

// Status dropdown component
function StatusDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: string;
  onSave: (value: string) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options to only show valid transitions from current status
  const validTransitions = VALID_STATUS_TRANSITIONS[value] || [];
  const availableOptions = STATUS_OPTIONS.filter(
    (statusOption) => statusOption === value || validTransitions.includes(statusOption)
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const status = STATUS_CONFIG[value] || STATUS_CONFIG.open;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded cursor-pointer hover:ring-2 hover:ring-blue-300 ${status.color}`}
        disabled={isUpdating}
        data-testid="task-status-dropdown"
      >
        {status.icon}
        {status.label}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[120px]" data-testid="task-status-options">
          {availableOptions.map((statusOption) => {
            const config = STATUS_CONFIG[statusOption] || STATUS_CONFIG.open;
            return (
              <button
                key={statusOption}
                onClick={() => {
                  if (statusOption !== value) {
                    onSave(statusOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${statusOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-status-option-${statusOption}`}
              >
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${config.color}`}>
                  {config.icon}
                  {config.label}
                </span>
                {statusOption === value && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Priority dropdown component
function PriorityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: number;
  onSave: (value: number) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const priority = PRIORITY_LABELS[value] || PRIORITY_LABELS[3];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-0.5 text-xs font-medium rounded border cursor-pointer hover:ring-2 hover:ring-blue-300 ${priority.color}`}
        disabled={isUpdating}
        data-testid="task-priority-dropdown"
      >
        {priority.label}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1 inline" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[100px]" data-testid="task-priority-options">
          {PRIORITY_OPTIONS.map((priorityOption) => {
            const config = PRIORITY_LABELS[priorityOption] || PRIORITY_LABELS[3];
            return (
              <button
                key={priorityOption}
                onClick={() => {
                  if (priorityOption !== value) {
                    onSave(priorityOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${priorityOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-priority-option-${priorityOption}`}
              >
                <span className={`px-2 py-0.5 rounded border ${config.color}`}>
                  {config.label}
                </span>
                {priorityOption === value && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Complexity dropdown component
function ComplexityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: number;
  onSave: (value: number) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const complexity = COMPLEXITY_LABELS[value] || COMPLEXITY_LABELS[3];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm text-gray-900 cursor-pointer hover:text-blue-600 hover:underline"
        disabled={isUpdating}
        data-testid="task-complexity-dropdown"
      >
        {complexity}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1 inline" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[100px]" data-testid="task-complexity-options">
          {COMPLEXITY_OPTIONS.map((complexityOption) => {
            const label = COMPLEXITY_LABELS[complexityOption] || COMPLEXITY_LABELS[3];
            return (
              <button
                key={complexityOption}
                onClick={() => {
                  if (complexityOption !== value) {
                    onSave(complexityOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center justify-between ${complexityOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-complexity-option-${complexityOption}`}
              >
                <span>{label}</span>
                {complexityOption === value && <Check className="w-3 h-3 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Entity type icons for assignee dropdown
const ENTITY_TYPE_ICONS: Record<string, { icon: typeof User; color: string }> = {
  agent: { icon: Bot, color: 'text-purple-600' },
  human: { icon: User, color: 'text-blue-600' },
  system: { icon: Server, color: 'text-gray-600' },
};

// Assignee dropdown component
function AssigneeDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value?: string;
  onSave: (value: string | null) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: entities } = useAllEntities();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Filter entities based on search query
  const filteredEntities = useMemo(() => {
    if (!entities) return [];
    const activeEntities = entities.filter(e => e.active !== false);
    if (!searchQuery.trim()) return activeEntities;
    const query = searchQuery.toLowerCase();
    return activeEntities.filter(e =>
      e.name.toLowerCase().includes(query) ||
      e.entityType.toLowerCase().includes(query)
    );
  }, [entities, searchQuery]);

  // Get current assignee entity
  const currentAssignee = useMemo(() => {
    if (!value || !entities) return null;
    return entities.find(e => e.id === value) ?? null;
  }, [value, entities]);

  const displayText = currentAssignee?.name ?? 'Unassigned';
  const entityTypeConfig = currentAssignee
    ? ENTITY_TYPE_ICONS[currentAssignee.entityType] ?? ENTITY_TYPE_ICONS.human
    : null;
  const IconComponent = entityTypeConfig?.icon ?? User;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-sm rounded cursor-pointer hover:ring-2 hover:ring-blue-300 transition-colors ${
          currentAssignee
            ? 'text-gray-900 bg-gray-50 hover:bg-gray-100'
            : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
        }`}
        disabled={isUpdating}
        data-testid="task-assignee-dropdown"
      >
        <IconComponent className={`w-3.5 h-3.5 ${entityTypeConfig?.color ?? 'text-gray-400'}`} />
        <span className={currentAssignee ? '' : 'italic'}>{displayText}</span>
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
      </button>
      {isOpen && (
        <div
          className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px] max-w-[280px]"
          data-testid="task-assignee-options"
        >
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entities..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="assignee-search-input"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {/* Unassigned option */}
            <button
              onClick={() => {
                if (value) {
                  onSave(null);
                }
                setIsOpen(false);
                setSearchQuery('');
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                !value ? 'bg-blue-50' : ''
              }`}
              data-testid="assignee-option-unassigned"
            >
              <User className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-500 italic">Unassigned</span>
              {!value && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
            </button>

            {/* Divider */}
            <div className="border-t border-gray-100 my-1" />

            {/* Entity options */}
            {filteredEntities.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500 text-center">
                {searchQuery ? 'No entities match your search' : 'No entities available'}
              </div>
            ) : (
              filteredEntities.map((entity) => {
                const typeConfig = ENTITY_TYPE_ICONS[entity.entityType] ?? ENTITY_TYPE_ICONS.human;
                const EntityIcon = typeConfig.icon;
                const isSelected = entity.id === value;

                return (
                  <button
                    key={entity.id}
                    onClick={() => {
                      if (!isSelected) {
                        onSave(entity.id);
                      }
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                    data-testid={`assignee-option-${entity.id}`}
                  >
                    <EntityIcon className={`w-3.5 h-3.5 ${typeConfig.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{entity.name}</div>
                      <div className="text-gray-500 capitalize">{entity.entityType}</div>
                    </div>
                    {isSelected && <Check className="w-3 h-3 text-blue-600 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading, isError, error } = useTaskDetail(taskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [updateField, setUpdateField] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { onNavigate, renderProfileLink } = useEntityNavigation();

  const handleUpdate = (updates: Partial<TaskDetail>, fieldName: string) => {
    setUpdateField(fieldName);
    updateTask.mutate(
      { id: taskId, updates },
      {
        onSettled: () => setUpdateField(null),
      }
    );
  };

  const handleDelete = () => {
    deleteTask.mutate(taskId, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        onClose();
      },
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="task-detail-loading">
        <div className="text-gray-500">Loading task...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex flex-col items-center justify-center" data-testid="task-detail-error">
        <div className="text-red-600 mb-2">Failed to load task</div>
        <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="task-detail-not-found">
        <div className="text-gray-500">Task not found</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white" data-testid="task-detail-panel">
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        taskTitle={task.title}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isDeleting={deleteTask.isPending}
      />

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusDropdown
              value={task.status}
              onSave={(status) => handleUpdate({ status }, 'status')}
              isUpdating={updateField === 'status'}
            />
            <PriorityDropdown
              value={task.priority}
              onSave={(priority) => handleUpdate({ priority }, 'priority')}
              isUpdating={updateField === 'priority'}
            />
          </div>
          <EditableTitle
            value={task.title}
            onSave={(title) => handleUpdate({ title }, 'title')}
            isUpdating={updateField === 'title'}
          />
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-mono">
            <span data-testid="task-detail-id">{task.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            aria-label="Delete task"
            data-testid="task-delete-button"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Close panel"
            data-testid="task-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Type</div>
            <div className="text-sm text-gray-900 capitalize">{task.taskType}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Complexity</div>
            <ComplexityDropdown
              value={task.complexity}
              onSave={(complexity) => handleUpdate({ complexity }, 'complexity')}
              isUpdating={updateField === 'complexity'}
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <User className="w-3 h-3" />
              Assignee
            </div>
            <AssigneeDropdown
              value={task.assignee}
              onSave={(assignee) => handleUpdate({ assignee } as unknown as Partial<TaskDetail>, 'assignee')}
              isUpdating={updateField === 'assignee'}
            />
          </div>
          {task.owner && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Owner</div>
              <div className="text-sm">
                <EntityLink
                  entityRef={task.owner}
                  showIcon
                  showHoverCard
                  navigable
                  onNavigate={onNavigate}
                  renderProfileLink={renderProfileLink}
                  data-testid="task-detail-owner-link"
                />
              </div>
            </div>
          )}
          {task.deadline && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Deadline
              </div>
              <div className="text-sm text-gray-900">{formatDate(task.deadline)}</div>
            </div>
          )}
          {task.scheduledFor && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Scheduled For
              </div>
              <div className="text-sm text-gray-900">{formatDate(task.scheduledFor)}</div>
            </div>
          )}
        </div>

        {/* Tags */}
        {task.tags.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description - editable with @mentions (TB124) */}
        <TaskDescriptionSection
          taskId={taskId}
          description={task.description}
          onUpdate={(description) => handleUpdate({ description }, 'description')}
          isUpdating={updateField === 'description'}
        />

        {/* Mentioned Entities - collected from description (TB112) */}
        <MentionedEntitiesSection
          description={task.description}
        />

        {/* Attachments */}
        <AttachmentsSection taskId={taskId} />

        {/* Dependencies as Sub-Issues (TB84) */}
        <DependencySubIssues
          taskId={taskId}
          taskTitle={task.title}
          taskCreatedBy={task.createdBy}
        />

        {/* Timestamps */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div>
              <span className="font-medium">Created:</span>{' '}
              <span title={formatDate(task.createdAt)}>{formatRelativeTime(task.createdAt)}</span>
            </div>
            <div>
              <span className="font-medium">Updated:</span>{' '}
              <span title={formatDate(task.updatedAt)}>{formatRelativeTime(task.updatedAt)}</span>
            </div>
            <div>
              <span className="font-medium">Created by:</span>{' '}
              <EntityLink
                entityRef={task.createdBy}
                showHoverCard
                navigable
                onNavigate={onNavigate}
                renderProfileLink={renderProfileLink}
                data-testid="task-detail-creator-link"
              />
            </div>
          </div>
        </div>

        {/* Update error display */}
        {updateTask.isError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" data-testid="task-update-error">
            Failed to update task: {(updateTask.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}
