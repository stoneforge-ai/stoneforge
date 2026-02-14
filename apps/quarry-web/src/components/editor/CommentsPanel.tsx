/**
 * CommentsPanel - Side panel for viewing and managing document comments (TB98)
 *
 * Features:
 * - List all comments for a document
 * - Show comment author, content, timestamp
 * - Resolve/unresolve comments
 * - Toggle to show/hide resolved comments
 * - Click comment to scroll to highlighted text in editor
 */

import { useState } from 'react';
import {
  MessageSquare,
  CheckCircle,
  Circle,
  MoreVertical,
  Trash2,
  Eye,
  EyeOff,
  User,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  useDocumentComments,
  useResolveComment,
  useDeleteComment,
  type Comment,
} from '../../api/hooks/useDocumentComments';
import { formatCompactTime } from '../../lib/time';

interface CommentsPanelProps {
  documentId: string;
  onCommentClick?: (comment: Comment) => void;
  currentUserId?: string;
}

function CommentItem({
  comment,
  onResolve,
  onDelete,
  onClick,
  currentUserId,
}: {
  comment: Comment;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  onClick: () => void;
  currentUserId?: string;
}) {
  const isAuthor = currentUserId === comment.author.id;

  return (
    <div
      className={`p-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
        comment.resolved ? 'opacity-60' : ''
      }`}
      onClick={onClick}
      data-testid={`comment-item-${comment.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </div>
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {comment.author.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              {formatCompactTime(comment.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Resolve/unresolve button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onResolve(!comment.resolved);
            }}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={comment.resolved ? 'Unresolve' : 'Resolve'}
            data-testid={`comment-resolve-${comment.id}`}
          >
            {comment.resolved ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <Circle className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {/* More actions dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                data-testid={`comment-menu-${comment.id}`}
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[120px] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 p-1 z-50"
                sideOffset={5}
              >
                {isAuthor && (
                  <DropdownMenu.Item
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-600 dark:text-red-400 rounded cursor-pointer outline-none hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </DropdownMenu.Item>
                )}
                {!isAuthor && (
                  <DropdownMenu.Item
                    disabled
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-400 rounded cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete (author only)
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Comment text */}
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
        {comment.content}
      </p>

      {/* Quoted text preview */}
      <div className="mt-2 px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 dark:border-yellow-600 text-xs text-gray-600 dark:text-gray-400 truncate">
        "{comment.anchor.text.slice(0, 80)}{comment.anchor.text.length > 80 ? '...' : ''}"
      </div>

      {/* Resolved by indicator */}
      {comment.resolved && comment.resolvedBy && (
        <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle className="w-3 h-3" />
          Resolved by {comment.resolvedBy.name}
          {comment.resolvedAt && (
            <span className="text-gray-400">
              {' '}
              - {formatCompactTime(comment.resolvedAt)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({
  documentId,
  onCommentClick,
  currentUserId,
}: CommentsPanelProps) {
  const [showResolved, setShowResolved] = useState(false);

  const { data, isLoading, error } = useDocumentComments(
    documentId,
    showResolved
  );
  const resolveComment = useResolveComment();
  const deleteComment = useDeleteComment();

  const comments = data?.comments || [];
  const unresolvedCount = comments.filter((c) => !c.resolved).length;
  const resolvedCount = comments.filter((c) => c.resolved).length;

  const handleResolve = (comment: Comment, resolved: boolean) => {
    resolveComment.mutate({
      commentId: comment.id,
      documentId: comment.documentId,
      resolved,
      resolvedBy: currentUserId,
    });
  };

  const handleDelete = (comment: Comment) => {
    if (window.confirm('Are you sure you want to delete this comment?')) {
      deleteComment.mutate({
        commentId: comment.id,
        documentId: comment.documentId,
      });
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700"
      data-testid="comments-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Comments
          </span>
          {unresolvedCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              {unresolvedCount}
            </span>
          )}
        </div>

        {/* Show resolved toggle */}
        <button
          onClick={() => setShowResolved(!showResolved)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          data-testid="toggle-resolved"
        >
          {showResolved ? (
            <>
              <EyeOff className="w-3 h-3" />
              Hide resolved
            </>
          ) : (
            <>
              <Eye className="w-3 h-3" />
              Show resolved ({resolvedCount})
            </>
          )}
        </button>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center text-gray-500">
            Loading comments...
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-500">
            Failed to load comments
          </div>
        )}

        {!isLoading && !error && comments.length === 0 && (
          <div className="p-4 text-center text-gray-500" data-testid="no-comments">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No comments yet</p>
            <p className="text-xs mt-1">
              Select text and click "Comment" to add one
            </p>
          </div>
        )}

        {!isLoading &&
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onResolve={(resolved) => handleResolve(comment, resolved)}
              onDelete={() => handleDelete(comment)}
              onClick={() => onCommentClick?.(comment)}
              currentUserId={currentUserId}
            />
          ))}
      </div>
    </div>
  );
}

export default CommentsPanel;
