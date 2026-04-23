/**
 * BulkActionMenu - Actions menu for bulk task operations
 *
 * Features:
 * - Bulk status change
 * - Bulk priority change
 * - Bulk delete with confirmation
 * - Selection count display
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Loader2, Trash2 } from 'lucide-react';
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

  // Track if deletion was in progress to detect completion
  const wasDeleting = useRef(false);

  // Close delete confirm when deletion completes (transitions from true to false)
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

  const handleConfirmDelete = () => {
    onDelete();
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200"
      data-testid="bulk-action-menu"
    >
      <span className="text-sm font-medium text-blue-700" data-testid="bulk-selected-count">
        {selectedCount} selected
      </span>

      {/* Status dropdown */}
      <div className="relative" ref={statusRef}>
        <button
          onClick={() => { setIsPriorityOpen(false); setIsStatusOpen(!isStatusOpen); }}
          disabled={isPending || isDeleting}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid="bulk-status-button"
        >
          Set Status
          <ChevronDown className="w-3 h-3" />
        </button>
        {isStatusOpen && (
          <div
            className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-32"
            data-testid="bulk-status-options"
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChangeStatus(option.value);
                  setIsStatusOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                data-testid={`bulk-status-option-${option.value}`}
              >
                {option.label}
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
          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid="bulk-priority-button"
        >
          Set Priority
          <ChevronDown className="w-3 h-3" />
        </button>
        {isPriorityOpen && (
          <div
            className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-32"
            data-testid="bulk-priority-options"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChangePriority(option.value);
                  setIsPriorityOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                data-testid={`bulk-priority-option-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete button */}
      {!showDeleteConfirm ? (
        <button
          onClick={handleDeleteClick}
          disabled={isPending || isDeleting}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm text-red-600 bg-white border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
          data-testid="bulk-delete-button"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      ) : (
        <div className="inline-flex items-center gap-2 px-2 py-1 bg-red-50 border border-red-300 rounded" data-testid="bulk-delete-confirm">
          <span className="text-sm text-red-700">Delete {selectedCount} tasks?</span>
          <button
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="px-2 py-0.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
            data-testid="bulk-delete-confirm-button"
          >
            {isDeleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              'Confirm'
            )}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            disabled={isDeleting}
            className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            data-testid="bulk-delete-cancel-button"
          >
            Cancel
          </button>
        </div>
      )}

      {isPending && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}

      {/* Clear selection */}
      <button
        onClick={onClear}
        disabled={isDeleting}
        className="ml-auto p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
        data-testid="bulk-clear-selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
