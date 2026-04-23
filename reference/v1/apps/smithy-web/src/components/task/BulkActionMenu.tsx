/**
 * BulkActionMenu - Actions menu for bulk task operations
 *
 * Features:
 * - Bulk status change via dropdown
 * - Bulk priority change via dropdown
 * - Bulk delete with confirmation
 * - Selection count display and clear button
 * - Loading state while bulk operations are pending
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../lib/task-constants';

interface BulkActionMenuProps {
  selectedCount: number;
  onChangeStatus: (status: string) => void;
  onChangePriority: (priority: number) => void;
  onDelete: () => void;
  onClear: () => void;
  isPending: boolean;
  isDeleting: boolean;
}

export function BulkActionMenu({
  selectedCount,
  onChangeStatus,
  onChangePriority,
  onDelete,
  onClear,
  isPending,
  isDeleting,
}: BulkActionMenuProps) {
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false);
      }
      if (priorityRef.current && !priorityRef.current.contains(event.target as Node)) {
        setIsPriorityOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track if deletion was in progress to detect completion and auto-close confirm
  const wasDeleting = useRef(false);

  useEffect(() => {
    if (isDeleting) {
      wasDeleting.current = true;
    } else if (wasDeleting.current && showDeleteConfirm) {
      wasDeleting.current = false;
      setShowDeleteConfirm(false);
    }
  }, [isDeleting, showDeleteConfirm]);

  const handleDeleteClick = () => {
    setIsStatusOpen(false);
    setIsPriorityOpen(false);
    setShowDeleteConfirm(true);
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 bg-[var(--color-primary-muted)] border border-[var(--color-primary)] rounded-lg"
      data-testid="bulk-actions-bar"
    >
      <div className="flex items-center gap-3">
        {/* Selection count */}
        <span className="text-sm font-medium text-[var(--color-primary)]">
          {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
        </span>

        {/* Clear selection */}
        <button
          onClick={onClear}
          disabled={isDeleting}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors flex items-center gap-1 disabled:opacity-50"
          data-testid="bulk-clear-selection"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      <div className="flex items-center gap-2">
        {isPending && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />}

        {/* Status dropdown */}
        <div className="relative" ref={statusRef}>
          <button
            onClick={() => { setIsPriorityOpen(false); setIsStatusOpen(!isStatusOpen); }}
            disabled={isPending || isDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
            data-testid="bulk-status-button"
          >
            Set Status
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {isStatusOpen && (
            <div
              className="absolute right-0 z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[10rem]"
              data-testid="bulk-status-options"
            >
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChangeStatus(option.value);
                    setIsStatusOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  data-testid={`bulk-status-option-${option.value}`}
                >
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${option.color}`}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority dropdown */}
        <div className="relative" ref={priorityRef}>
          <button
            onClick={() => { setIsStatusOpen(false); setIsPriorityOpen(!isPriorityOpen); }}
            disabled={isPending || isDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
            data-testid="bulk-priority-button"
          >
            Set Priority
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {isPriorityOpen && (
            <div
              className="absolute right-0 z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[10rem]"
              data-testid="bulk-priority-options"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChangePriority(option.value);
                    setIsPriorityOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  data-testid={`bulk-priority-option-${option.value}`}
                >
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${option.color}`}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete button / Confirmation */}
        {!showDeleteConfirm ? (
          <button
            onClick={handleDeleteClick}
            disabled={isPending || isDeleting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-md transition-colors disabled:opacity-50"
            data-testid="bulk-delete-button"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm text-red-600 dark:text-red-400">
              Delete {selectedCount}?
            </span>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="px-2 py-0.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
              data-testid="bulk-delete-confirm"
            >
              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="px-2 py-0.5 text-xs font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
              data-testid="bulk-delete-cancel"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
