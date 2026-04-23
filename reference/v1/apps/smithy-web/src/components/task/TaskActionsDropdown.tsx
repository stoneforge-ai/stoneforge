/**
 * TaskActionsDropdown - Dropdown menu for task row actions
 *
 * Features:
 * - Delete action with confirmation dialog
 * - Extensible for future actions
 */

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type { Task } from '../../api/types';
import { useDeleteTask } from '../../api/hooks/useTasks';

interface TaskActionsDropdownProps {
  task: Task;
  /** Callback when task is deleted */
  onDeleted?: () => void;
}

export function TaskActionsDropdown({ task, onDeleted }: TaskActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const deleteTaskMutation = useDeleteTask();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close modal on escape
  useEffect(() => {
    if (!showDeleteConfirm) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDeleteConfirm(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showDeleteConfirm]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTaskMutation.mutateAsync({ taskId: task.id });
      setShowDeleteConfirm(false);
      onDeleted?.();
    } catch (error) {
      // Error is handled by the mutation
      console.error('Failed to delete task:', error);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!isOpen && buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              setMenuPosition({ top: rect.bottom, left: rect.right });
            }
            setIsOpen(!isOpen);
          }}
          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)] rounded transition-colors"
          data-testid="task-row-menu"
          aria-label="Task actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {isOpen && menuPosition && (
          <div
            className="fixed z-30 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-36"
            style={{ top: menuPosition.top, left: menuPosition.left, transform: 'translateX(-100%)' }}
            data-testid="task-actions-menu"
          >
            <button
              onClick={handleDeleteClick}
              className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
              data-testid="task-action-delete"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50"
          onClick={handleCancelDelete}
          data-testid="delete-confirm-modal"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Dialog */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--color-surface)] rounded-xl shadow-2xl border border-[var(--color-border)]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--color-text)]">Delete Task</h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                <div className="p-3 bg-[var(--color-surface-elevated)] rounded-md border border-[var(--color-border)]">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate" title={task.title}>
                    {task.title}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)] font-mono mt-1">
                    {task.id}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-b-xl flex items-center justify-end gap-3">
                <button
                  onClick={handleCancelDelete}
                  disabled={deleteTaskMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors disabled:opacity-50"
                  data-testid="delete-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteTaskMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                  data-testid="delete-confirm"
                >
                  {deleteTaskMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
