/**
 * MergeRequestManageDropdown - Dropdown menu for managing merge request status and deletion
 *
 * Features:
 * - Status update dropdown with available status options
 * - Delete option with confirmation modal
 * - Click-outside to close
 */

import { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Ban,
  Trash2,
  Loader2,
  ChevronRight,
  FlaskConical,
  GitMerge,
  CircleX,
} from 'lucide-react';
import type { Task, MergeStatus } from '../../api/types';
import {
  useUpdateMergeStatusMutation,
  useDeleteMergeRequestMutation,
  getAvailableMergeStatuses,
} from '../../api/hooks/useMergeRequests';

interface MergeRequestManageDropdownProps {
  task: Task;
  onDeleted?: () => void;
}

export function MergeRequestManageDropdown({
  task,
  onDeleted,
}: MergeRequestManageDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const updateStatusMutation = useUpdateMergeStatusMutation();
  const deleteMutation = useDeleteMergeRequestMutation();

  const currentStatus = task.metadata?.orchestrator?.mergeStatus;

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowStatusSubmenu(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowStatusSubmenu(false);
        setShowDeleteConfirm(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Clean up close timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmenuMouseEnter = () => {
    clearTimeout(closeTimeoutRef.current);
    setShowStatusSubmenu(true);
  };

  const handleSubmenuMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => setShowStatusSubmenu(false), 150);
  };

  const handleStatusChange = async (newStatus: MergeStatus) => {
    try {
      await updateStatusMutation.mutateAsync({
        taskId: task.id,
        mergeStatus: newStatus,
      });
      setIsOpen(false);
      setShowStatusSubmenu(false);
    } catch (error) {
      console.error('Failed to update merge status:', error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({
        taskId: task.id,
        reason: 'Deleted via merge request page',
      });
      setShowDeleteConfirm(false);
      setIsOpen(false);
      onDeleted?.();
    } catch (error) {
      console.error('Failed to delete merge request:', error);
    }
  };

  const getStatusIcon = (status: MergeStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'testing':
        return <FlaskConical className="w-4 h-4 text-blue-500" />;
      case 'merging':
        return <GitMerge className="w-4 h-4 text-blue-600" />;
      case 'merged':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'conflict':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'test_failed':
        return <CircleX className="w-4 h-4 text-orange-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'not_applicable':
        return <Ban className="w-4 h-4 text-gray-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const statuses = getAvailableMergeStatuses();

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
          aria-label="Manage merge request"
          data-testid="merge-request-manage-btn"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 py-1"
            data-testid="merge-request-manage-menu"
          >
            {/* Change Status */}
            <div
              className="relative"
              onMouseEnter={handleSubmenuMouseEnter}
              onMouseLeave={handleSubmenuMouseLeave}
            >
              <button
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStatusSubmenu(!showStatusSubmenu);
                }}
                data-testid="change-status-btn"
              >
                <span>Change Status</span>
                <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              </button>

              {/* Status Submenu */}
              {showStatusSubmenu && (
                <div
                  className="absolute left-full top-0 ml-1 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1"
                  data-testid="status-submenu"
                  onMouseEnter={handleSubmenuMouseEnter}
                  onMouseLeave={handleSubmenuMouseLeave}
                >
                  {statuses.map((status) => (
                    <button
                      key={status.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(status.value);
                      }}
                      disabled={currentStatus === status.value || updateStatusMutation.isPending}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        currentStatus === status.value
                          ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                          : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                      } disabled:opacity-50`}
                      data-testid={`status-option-${status.value}`}
                    >
                      {updateStatusMutation.isPending &&
                      updateStatusMutation.variables?.mergeStatus === status.value ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        getStatusIcon(status.value)
                      )}
                      <span>{status.label}</span>
                      {currentStatus === status.value && (
                        <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-[var(--color-primary)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="my-1 border-t border-[var(--color-border)]" />

            {/* Delete */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              data-testid="delete-merge-request-btn"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteMergeRequestDialog
          task={task}
          isDeleting={deleteMutation.isPending}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

interface DeleteMergeRequestDialogProps {
  task: Task;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteMergeRequestDialog({
  task,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteMergeRequestDialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDeleting, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="delete-merge-request-dialog"
    >
      <div className="absolute inset-0 bg-black/50" onClick={() => !isDeleting && onCancel()} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-danger-muted)] flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-[var(--color-danger)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Delete Merge Request</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Are you sure you want to delete the merge request for{' '}
              <span className="font-medium text-[var(--color-text)]">"{task.title}"</span>? This
              action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            data-testid="delete-merge-request-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] rounded-md hover:opacity-90 disabled:opacity-50"
            data-testid="delete-merge-request-confirm-btn"
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
