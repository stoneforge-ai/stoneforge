/**
 * DeleteTeamConfirmModal - Confirmation dialog for team deletion
 */

import { Loader2, Trash2 } from 'lucide-react';

interface DeleteTeamConfirmModalProps {
  teamName: string;
  isDeleting: boolean;
  error: Error | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteTeamConfirmModal({
  teamName,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}: DeleteTeamConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50" data-testid="delete-team-confirm-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Team?</h3>
          <p className="text-sm text-gray-500 mb-4">
            Are you sure you want to delete <strong>{teamName}</strong>? This action cannot be undone.
          </p>
          {error && (
            <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {error.message}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              data-testid="delete-team-cancel"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
              data-testid="delete-team-confirm"
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
    </div>
  );
}
