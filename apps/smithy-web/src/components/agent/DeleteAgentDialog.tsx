/**
 * DeleteAgentDialog - Confirmation dialog for deleting an agent
 */

import { useEffect } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

export interface DeleteAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteAgentDialog({
  isOpen,
  onClose,
  agentName,
  onConfirm,
  isDeleting,
}: DeleteAgentDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="delete-agent-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={() => !isDeleting && onClose()} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-danger-muted)] flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-[var(--color-danger)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Delete Agent</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Are you sure you want to delete{' '}
              <span className="font-medium text-[var(--color-text)]">"{agentName}"</span>? This action
              cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            data-testid="delete-agent-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] rounded-md hover:opacity-90 disabled:opacity-50"
            data-testid="delete-agent-confirm-btn"
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
