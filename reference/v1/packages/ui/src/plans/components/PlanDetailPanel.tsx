/**
 * PlanDetailPanel - Detailed view and editing panel for a single plan
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  X,
  User,
  Pencil,
  Check,
  Plus,
  Play,
  Ban,
  FileEdit,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { TaskStatusSummary } from './TaskStatusSummary';
import { PlanTaskList } from './PlanTaskList';
import { TaskPickerModal } from './TaskPickerModal';
import {
  usePlan,
  usePlanTasks,
  usePlanProgress,
  useUpdatePlan,
  useDeletePlan,
  useAddTaskToPlan,
  useRemoveTaskFromPlan,
} from '../hooks';
import { formatDate, formatRelativeTime } from '../utils';
import type { PlanType } from '../types';

interface PlanDetailPanelProps {
  planId: string;
  onClose: () => void;
  /** Optional ProgressRing component - pass as render prop for flexibility */
  renderProgressRing?: (props: { percentage: number; completed: number; total: number }) => React.ReactNode;
  /** Called when remove task is not allowed (last task). Default shows console warning. */
  onRemoveTaskNotAllowed?: () => void;
  /** Base URL for task links. Defaults to '/tasks' */
  taskLinkBase?: string;
  /** Called when plan is successfully deleted */
  onDeleteSuccess?: () => void;
  /** Called when delete fails. Default shows console error. */
  onDeleteError?: (message: string) => void;
}

interface StatusTransition {
  status: string;
  label: string;
  icon: typeof Play;
  color: string;
}

function getStatusTransitions(currentStatus: string): StatusTransition[] {
  switch (currentStatus) {
    case 'draft':
      return [{ status: 'active', label: 'Activate', icon: Play, color: 'bg-blue-500 hover:bg-blue-600' }];
    case 'active':
      return [
        { status: 'completed', label: 'Complete', icon: CheckCircle2, color: 'bg-green-500 hover:bg-green-600' },
        { status: 'cancelled', label: 'Cancel', icon: Ban, color: 'bg-red-500 hover:bg-red-600' },
      ];
    case 'completed':
    case 'cancelled':
      return [{ status: 'draft', label: 'Reopen as Draft', icon: FileEdit, color: 'bg-gray-500 hover:bg-gray-600' }];
    default:
      return [];
  }
}

export function PlanDetailPanel({
  planId,
  onClose,
  renderProgressRing,
  onRemoveTaskNotAllowed,
  taskLinkBase = '/tasks',
  onDeleteSuccess,
  onDeleteError,
}: PlanDetailPanelProps) {
  const { data: plan, isLoading, isError, error } = usePlan(planId);
  const { data: tasks = [] } = usePlanTasks(planId);
  const { data: progress } = usePlanProgress(planId);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Mutations
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const addTaskToPlan = useAddTaskToPlan();
  const removeTaskFromPlan = useRemoveTaskFromPlan();

  // Initialize edited title when plan loads
  useEffect(() => {
    if (plan) {
      setEditedTitle(plan.title);
    }
  }, [plan]);

  // Exit edit mode when plan changes
  useEffect(() => {
    setIsEditMode(false);
    setShowTaskPicker(false);
    setRemovingTaskId(null);
  }, [planId]);

  const handleSaveTitle = useCallback(async () => {
    if (!plan || editedTitle.trim() === plan.title) {
      setIsEditMode(false);
      return;
    }
    try {
      await updatePlan.mutateAsync({ planId, updates: { title: editedTitle.trim() } });
      setIsEditMode(false);
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  }, [plan, editedTitle, planId, updatePlan]);

  const handleCancelEdit = useCallback(() => {
    if (plan) {
      setEditedTitle(plan.title);
    }
    setIsEditMode(false);
  }, [plan]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!plan || newStatus === plan.status) return;
    try {
      await updatePlan.mutateAsync({
        planId,
        updates: { status: newStatus as PlanType['status'] },
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }, [plan, planId, updatePlan]);

  const handleAddTask = useCallback(async (taskId: string) => {
    try {
      await addTaskToPlan.mutateAsync({ planId, taskId });
      setShowTaskPicker(false);
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  }, [planId, addTaskToPlan]);

  const handleRemoveTask = useCallback(async (taskId: string) => {
    setRemovingTaskId(taskId);
    try {
      await removeTaskFromPlan.mutateAsync({ planId, taskId });
    } catch (err) {
      console.error('Failed to remove task:', err);
    } finally {
      setRemovingTaskId(null);
    }
  }, [planId, removeTaskFromPlan]);

  const handleRemoveNotAllowed = useCallback(() => {
    if (onRemoveTaskNotAllowed) {
      onRemoveTaskNotAllowed();
    } else {
      console.warn('Cannot remove the last task. Plans must have at least one task.');
    }
  }, [onRemoveTaskNotAllowed]);

  const handleDeletePlan = useCallback(async () => {
    try {
      await deletePlan.mutateAsync(planId);
      setShowDeleteConfirm(false);
      if (onDeleteSuccess) {
        onDeleteSuccess();
      }
      onClose();
    } catch (err) {
      const message = (err as Error).message || 'Failed to delete plan';
      if (onDeleteError) {
        onDeleteError(message);
      } else {
        console.error('Failed to delete plan:', err);
      }
    }
  }, [planId, deletePlan, onDeleteSuccess, onDeleteError, onClose]);

  if (isLoading) {
    return (
      <div
        data-testid="plan-detail-loading"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Loading plan...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="plan-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white"
      >
        <div className="text-red-600 mb-2">Failed to load plan</div>
        <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div
        data-testid="plan-detail-not-found"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Plan not found</div>
      </div>
    );
  }

  const statusTransitions = getStatusTransitions(plan.status);

  return (
    <>
      <div
        data-testid="plan-detail-panel"
        className="h-full flex flex-col bg-white border-l border-gray-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            {/* Status badge */}
            <div className="mb-2">
              <StatusBadge status={plan.status} />
            </div>

            {/* Title - editable */}
            {isEditMode ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  data-testid="plan-title-input"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  className="flex-1 text-lg font-semibold text-gray-900 border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  data-testid="save-title-btn"
                  onClick={handleSaveTitle}
                  disabled={updatePlan.isPending}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                  title="Save"
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  data-testid="cancel-edit-btn"
                  onClick={handleCancelEdit}
                  className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                  title="Cancel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h2
                  data-testid="plan-detail-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {plan.title}
                </h2>
                <button
                  data-testid="edit-title-btn"
                  onClick={() => setIsEditMode(true)}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit title"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ID */}
            <div className="mt-1 text-xs text-gray-500 font-mono">
              <span data-testid="plan-detail-id">{plan.id}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              aria-label="Delete plan"
              data-testid="plan-detail-delete"
              title="Delete plan"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close panel"
              data-testid="plan-detail-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Actions */}
        {statusTransitions.length > 0 && (
          <div className="flex gap-2 p-4 border-b border-gray-200 bg-gray-50">
            {statusTransitions.map((transition) => {
              const Icon = transition.icon;
              return (
                <button
                  key={transition.status}
                  data-testid={`status-action-${transition.status}`}
                  onClick={() => handleStatusChange(transition.status)}
                  disabled={updatePlan.isPending}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white rounded ${transition.color} disabled:opacity-50`}
                >
                  <Icon className="w-4 h-4" />
                  {transition.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Progress Section with Progress Ring */}
          {progress && (
            <div className="mb-6" data-testid="plan-progress-section">
              <div className="text-sm font-medium text-gray-700 mb-4">Progress</div>
              <div className="flex flex-col items-center gap-4">
                {/* Large Progress Ring (80px) */}
                {renderProgressRing ? (
                  renderProgressRing({
                    percentage: progress.completionPercentage,
                    completed: progress.completedTasks,
                    total: progress.totalTasks,
                  })
                ) : (
                  <div
                    className="w-20 h-20 rounded-full border-4 border-blue-500 flex items-center justify-center"
                    data-testid="plan-detail-progress-ring"
                  >
                    <span className="text-xl font-bold text-blue-500">{progress.completionPercentage}%</span>
                  </div>
                )}
                {/* Task Status Summary */}
                <div className="w-full mt-2">
                  <TaskStatusSummary progress={progress} />
                </div>
              </div>
            </div>
          )}

          {/* Tasks Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-700">
                Tasks ({tasks.length})
              </div>
              <button
                data-testid="add-task-btn"
                onClick={() => setShowTaskPicker(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Task
              </button>
            </div>
            <PlanTaskList
              tasks={tasks}
              isEditMode={true}
              onRemoveTask={handleRemoveTask}
              removingTaskId={removingTaskId}
              onRemoveNotAllowed={handleRemoveNotAllowed}
              taskLinkBase={taskLinkBase}
            />
          </div>

          {/* Metadata */}
          <div className="pt-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-medium">Created:</span>
                </div>
                <span title={formatDate(plan.createdAt)}>
                  {formatRelativeTime(plan.createdAt)}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-medium">Updated:</span>
                </div>
                <span title={formatDate(plan.updatedAt)}>
                  {formatRelativeTime(plan.updatedAt)}
                </span>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <User className="w-3 h-3" />
                  <span className="font-medium">Created by:</span>
                </div>
                <span className="font-mono">{plan.createdBy}</span>
              </div>
              {plan.completedAt && (
                <div className="col-span-2">
                  <div className="flex items-center gap-1 mb-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="font-medium">Completed:</span>
                  </div>
                  <span>{formatDate(plan.completedAt)}</span>
                </div>
              )}
              {plan.cancelledAt && (
                <div className="col-span-2">
                  <div className="flex items-center gap-1 mb-1">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="font-medium">Cancelled:</span>
                  </div>
                  <span>{formatDate(plan.cancelledAt)}</span>
                  {plan.cancelReason && (
                    <p className="mt-1 text-gray-600">{plan.cancelReason}</p>
                  )}
                </div>
              )}
            </div>

            {/* Tags */}
            {plan.tags && plan.tags.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Tags
                </div>
                <div className="flex flex-wrap gap-1">
                  {plan.tags.map((tag: string) => (
                    <span
                      key={tag}
                      data-testid={`plan-tag-${tag}`}
                      className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Picker Modal */}
      {showTaskPicker && (
        <TaskPickerModal
          planId={planId}
          onClose={() => setShowTaskPicker(false)}
          onAddTask={handleAddTask}
          isAdding={addTaskToPlan.isPending}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setShowDeleteConfirm(false)}
          data-testid="delete-plan-modal"
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Plan</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete <span className="font-semibold">"{plan.title}"</span>?
                Tasks in this plan will be unlinked but not deleted.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  data-testid="delete-plan-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePlan}
                  disabled={deletePlan.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                  data-testid="delete-plan-confirm"
                >
                  {deletePlan.isPending ? 'Deleting...' : 'Delete Plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
