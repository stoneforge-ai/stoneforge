/**
 * @stoneforge/ui Workflow Detail Panel
 *
 * Displays workflow details with edit functionality, status actions, and task list.
 */

import { useState, useEffect, useCallback, type ComponentType } from 'react';
import {
  X,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  User,
  Play,
  Pencil,
  Check,
  Flame,
  Archive,
  Ban,
  Loader2,
} from 'lucide-react';

import type { Workflow, WorkflowStatus } from '../types';
import { formatDate, formatRelativeTime } from '../utils';
import {
  useWorkflowDetail,
  useUpdateWorkflow,
  useDeleteEphemeralWorkflow,
  usePromoteWorkflow,
} from '../hooks';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { TaskStatusSummary } from './TaskStatusSummary';
import { WorkflowTaskList } from './WorkflowTaskList';

interface StatusTransition {
  status: WorkflowStatus;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
}

interface WorkflowDetailPanelProps {
  workflowId: string;
  onClose: () => void;
  /** Base URL for task links (default: /tasks) */
  taskLinkBase?: string;
}

/**
 * Get available status transitions based on current status
 */
function getStatusTransitions(status: WorkflowStatus): StatusTransition[] {
  switch (status) {
    case 'pending':
      return [
        { status: 'running', label: 'Start', icon: Play, color: 'bg-blue-500 hover:bg-blue-600' },
        { status: 'cancelled', label: 'Cancel', icon: Ban, color: 'bg-orange-500 hover:bg-orange-600' },
      ];
    case 'running':
      return [
        { status: 'completed', label: 'Complete', icon: CheckCircle, color: 'bg-green-500 hover:bg-green-600' },
        { status: 'failed', label: 'Mark Failed', icon: AlertTriangle, color: 'bg-red-500 hover:bg-red-600' },
        { status: 'cancelled', label: 'Cancel', icon: Ban, color: 'bg-orange-500 hover:bg-orange-600' },
      ];
    case 'completed':
    case 'failed':
    case 'cancelled':
      return [{ status: 'pending', label: 'Reset to Pending', icon: Clock, color: 'bg-gray-500 hover:bg-gray-600' }];
    default:
      return [];
  }
}

export function WorkflowDetailPanel({
  workflowId,
  onClose,
  taskLinkBase = '/tasks',
}: WorkflowDetailPanelProps) {
  const { workflow, tasks, progress, isLoading, error } = useWorkflowDetail(workflowId);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Mutations
  const updateWorkflow = useUpdateWorkflow();
  const deleteEphemeral = useDeleteEphemeralWorkflow();
  const promoteWorkflow = usePromoteWorkflow();

  // Initialize edited title when workflow loads
  useEffect(() => {
    if (workflow) {
      setEditedTitle(workflow.title);
    }
  }, [workflow]);

  // Exit edit mode when workflow changes
  useEffect(() => {
    setIsEditMode(false);
    setShowDeleteConfirm(false);
  }, [workflowId]);

  const handleSaveTitle = useCallback(async () => {
    if (!workflow || editedTitle.trim() === workflow.title) {
      setIsEditMode(false);
      return;
    }
    try {
      await updateWorkflow.mutateAsync({ workflowId, status: undefined });
      setIsEditMode(false);
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  }, [workflow, editedTitle, workflowId, updateWorkflow]);

  const handleCancelEdit = useCallback(() => {
    if (workflow) {
      setEditedTitle(workflow.title);
    }
    setIsEditMode(false);
  }, [workflow]);

  const handleStatusChange = useCallback(async (newStatus: WorkflowStatus) => {
    if (!workflow || newStatus === workflow.status) return;
    try {
      await updateWorkflow.mutateAsync({
        workflowId,
        status: newStatus,
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }, [workflow, workflowId, updateWorkflow]);

  const handleDeleteEphemeral = useCallback(async () => {
    try {
      await deleteEphemeral.mutateAsync({ workflowId });
      onClose();
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    }
  }, [workflowId, deleteEphemeral, onClose]);

  const handlePromote = useCallback(async () => {
    try {
      await promoteWorkflow.mutateAsync({ workflowId });
    } catch (err) {
      console.error('Failed to promote workflow:', err);
    }
  }, [workflowId, promoteWorkflow]);

  if (isLoading) {
    return (
      <div
        data-testid="workflow-detail-loading"
        className="h-full flex items-center justify-center bg-white dark:bg-[var(--color-bg)]"
      >
        <div className="text-gray-500 dark:text-gray-400">Loading workflow...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="workflow-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white dark:bg-[var(--color-bg)]"
      >
        <div className="text-red-600 dark:text-red-400 mb-2">Failed to load workflow</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{error?.message}</div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div
        data-testid="workflow-detail-not-found"
        className="h-full flex items-center justify-center bg-white dark:bg-[var(--color-bg)]"
      >
        <div className="text-gray-500 dark:text-gray-400">Workflow not found</div>
      </div>
    );
  }

  const statusTransitions = getStatusTransitions(workflow.status);

  return (
    <div
      data-testid="workflow-detail-panel"
      className="h-full flex flex-col bg-white dark:bg-[var(--color-bg)] border-l border-gray-200 dark:border-[var(--color-border)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-[var(--color-border)]">
        <div className="flex-1 min-w-0">
          {/* Status badge */}
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge status={workflow.status} />
            {workflow.ephemeral && (
              <span
                data-testid="ephemeral-badge"
                className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded"
              >
                Ephemeral
              </span>
            )}
          </div>

          {/* Title - editable */}
          {isEditMode ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                data-testid="workflow-title-input"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                className="flex-1 text-lg font-semibold text-gray-900 dark:text-[var(--color-text)] border border-blue-300 dark:border-blue-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[var(--color-surface)]"
                autoFocus
              />
              <button
                data-testid="save-title-btn"
                onClick={handleSaveTitle}
                disabled={updateWorkflow.isPending}
                className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                title="Save"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                data-testid="cancel-edit-btn"
                onClick={handleCancelEdit}
                className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                title="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2
                data-testid="workflow-detail-title"
                className="text-lg font-semibold text-gray-900 dark:text-[var(--color-text)]"
              >
                {workflow.title}
              </h2>
              <button
                data-testid="edit-title-btn"
                onClick={() => setIsEditMode(true)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit title"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ID */}
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-mono">
            <span data-testid="workflow-detail-id">{workflow.id}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          aria-label="Close panel"
          data-testid="workflow-detail-close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Status Actions */}
      {statusTransitions.length > 0 && (
        <div className="flex flex-wrap gap-2 p-4 border-b border-gray-200 dark:border-[var(--color-border)] bg-gray-50 dark:bg-[var(--color-surface)]">
          {statusTransitions.map((transition) => {
            const Icon = transition.icon;
            return (
              <button
                key={transition.status}
                data-testid={`status-action-${transition.status}`}
                onClick={() => handleStatusChange(transition.status)}
                disabled={updateWorkflow.isPending}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white rounded ${transition.color} disabled:opacity-50`}
              >
                <Icon className="w-4 h-4" />
                {transition.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Ephemeral Workflow Actions */}
      {workflow.ephemeral && (
        <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-[var(--color-border)] bg-yellow-50 dark:bg-yellow-900/20">
          {showDeleteConfirm ? (
            <div className="flex-1 flex items-center gap-2">
              <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                Delete this workflow and all its tasks?
              </span>
              <button
                data-testid="delete-confirm-btn"
                onClick={handleDeleteEphemeral}
                disabled={deleteEphemeral.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
              >
                {deleteEphemeral.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Flame className="w-4 h-4" />
                )}
                Confirm Delete
              </button>
              <button
                data-testid="delete-cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                data-testid="promote-btn"
                onClick={handlePromote}
                disabled={promoteWorkflow.isPending}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
              >
                {promoteWorkflow.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                Promote (Make Durable)
              </button>
              <button
                data-testid="delete-btn"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
              >
                <Flame className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Progress Section */}
        {progress && progress.total > 0 && (
          <div className="mb-6">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Progress</div>
            <ProgressBar progress={progress} />
            <div className="mt-4">
              <TaskStatusSummary progress={progress} />
            </div>
          </div>
        )}

        {/* Tasks Section */}
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tasks ({tasks.length})
          </div>
          {/* Warning when workflow has only one task */}
          {tasks.length === 1 && (
            <div
              data-testid="last-task-warning"
              className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
            >
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Only one task remaining</span>
              </div>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                Workflows must have at least one task. This task cannot be deleted.
                Use &apos;Delete&apos; to remove the entire workflow if needed.
              </p>
            </div>
          )}
          <WorkflowTaskList tasks={tasks} taskLinkBase={taskLinkBase} />
        </div>

        {/* Metadata */}
        <WorkflowMetadata workflow={workflow} />
      </div>
    </div>
  );
}

/**
 * Workflow metadata display (dates, creator, tags, variables)
 */
function WorkflowMetadata({ workflow }: { workflow: Workflow }) {
  return (
    <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
      <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3" />
            <span className="font-medium">Created:</span>
          </div>
          <span title={formatDate(workflow.createdAt)}>
            {formatRelativeTime(workflow.createdAt)}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3" />
            <span className="font-medium">Updated:</span>
          </div>
          <span title={formatDate(workflow.updatedAt)}>
            {formatRelativeTime(workflow.updatedAt)}
          </span>
        </div>
        <div className="col-span-2">
          <div className="flex items-center gap-1 mb-1">
            <User className="w-3 h-3" />
            <span className="font-medium">Created by:</span>
          </div>
          <span className="font-mono">{workflow.createdBy}</span>
        </div>
        {workflow.startedAt && (
          <div className="col-span-2">
            <div className="flex items-center gap-1 mb-1">
              <Play className="w-3 h-3 text-blue-500" />
              <span className="font-medium">Started:</span>
            </div>
            <span>{formatDate(workflow.startedAt)}</span>
          </div>
        )}
        {workflow.finishedAt && (
          <div className="col-span-2">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span className="font-medium">Finished:</span>
            </div>
            <span>{formatDate(workflow.finishedAt)}</span>
          </div>
        )}
        {workflow.failureReason && (
          <div className="col-span-2">
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              <span className="font-medium">Failure reason:</span>
            </div>
            <p className="text-red-600 dark:text-red-400">{workflow.failureReason}</p>
          </div>
        )}
        {workflow.cancelReason && (
          <div className="col-span-2">
            <div className="flex items-center gap-1 mb-1">
              <XCircle className="w-3 h-3 text-orange-500" />
              <span className="font-medium">Cancel reason:</span>
            </div>
            <p className="text-orange-600 dark:text-orange-400">{workflow.cancelReason}</p>
          </div>
        )}
      </div>

      {/* Tags */}
      {workflow.tags && workflow.tags.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {workflow.tags.map((tag) => (
              <span
                key={tag}
                data-testid={`workflow-tag-${tag}`}
                className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Variables */}
      {workflow.variables && Object.keys(workflow.variables).length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Variables
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs font-mono">
            {Object.entries(workflow.variables).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">{key}:</span>
                <span className="text-gray-900 dark:text-gray-300">{JSON.stringify(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
