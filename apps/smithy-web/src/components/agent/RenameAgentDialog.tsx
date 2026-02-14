/**
 * RenameAgentDialog - Dialog for renaming an agent
 */

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Pencil } from 'lucide-react';
import { useRenameAgent } from '../../api/hooks/useAgents';

export interface RenameAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  currentName: string;
  onSuccess?: () => void;
}

export function RenameAgentDialog({
  isOpen,
  onClose,
  agentId,
  currentName,
  onSuccess,
}: RenameAgentDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const renameAgent = useRenameAgent();

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError(null);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (trimmedName === currentName) {
      handleClose();
      return;
    }

    try {
      await renameAgent.mutateAsync({ agentId, name: trimmedName });
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename agent');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="rename-agent-backdrop"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="
            w-full max-w-sm
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
          "
          data-testid="rename-agent-dialog"
          role="dialog"
          aria-labelledby="rename-agent-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2
              id="rename-agent-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              Rename Agent
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
              data-testid="rename-agent-close"
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

            {/* Name input */}
            <div className="space-y-1">
              <label htmlFor="agent-new-name" className="text-sm font-medium text-[var(--color-text)]">
                New Name
              </label>
              <input
                id="agent-new-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter new name"
                className="
                  w-full px-3 py-2
                  text-sm
                  bg-[var(--color-surface)]
                  border border-[var(--color-border)]
                  rounded-lg
                  placeholder:text-[var(--color-text-tertiary)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                "
                autoFocus
                data-testid="rename-agent-input"
              />
            </div>

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
                data-testid="rename-agent-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renameAgent.isPending || !name.trim()}
                className="
                  flex items-center gap-2
                  px-4 py-2
                  text-sm font-medium
                  text-white
                  bg-[var(--color-primary)]
                  hover:bg-[var(--color-primary-hover)]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  rounded-lg
                  transition-colors
                "
                data-testid="rename-agent-submit"
              >
                {renameAgent.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Renaming...
                  </>
                ) : (
                  <>
                    <Pencil className="w-4 h-4" />
                    Rename
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
