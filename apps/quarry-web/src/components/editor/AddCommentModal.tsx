/**
 * AddCommentModal - Modal for adding a new comment to selected text (TB98)
 *
 * Features:
 * - Shows the selected text preview
 * - Text input for comment content
 * - Cancel/Save actions
 */

import { useState, useEffect, useRef } from 'react';
import { X, MessageSquare } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface AddCommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  onSubmit: (content: string) => void;
  isSubmitting?: boolean;
}

export function AddCommentModal({
  isOpen,
  onClose,
  selectedText,
  onSubmit,
  isSubmitting = false,
}: AddCommentModalProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset content when modal opens
  useEffect(() => {
    if (isOpen) {
      setContent('');
      // Focus textarea after modal animation
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onSubmit(content.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Cmd/Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (content.trim()) {
        onSubmit(content.trim());
      }
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 p-0"
          data-testid="add-comment-modal"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-gray-500" />
              <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Add Comment
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-4 space-y-4">
              {/* Selected text preview */}
              <div className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 dark:border-yellow-600 text-sm text-gray-700 dark:text-gray-300">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Selected text:
                </div>
                <div className="italic line-clamp-3">
                  "{selectedText}"
                </div>
              </div>

              {/* Comment input */}
              <div>
                <label
                  htmlFor="comment-content"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Your comment
                </label>
                <textarea
                  ref={textareaRef}
                  id="comment-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write your comment..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  data-testid="comment-input"
                />
                <div className="text-xs text-gray-400 mt-1">
                  Press Cmd+Enter to submit
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!content.trim() || isSubmitting}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                data-testid="comment-submit"
              >
                {isSubmitting ? 'Adding...' : 'Add Comment'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default AddCommentModal;
