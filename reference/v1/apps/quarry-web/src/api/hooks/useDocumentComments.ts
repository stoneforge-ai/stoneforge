/**
 * Document Comments Hooks (TB98)
 *
 * Provides React Query hooks for managing document comments.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface TextAnchor {
  hash: string;
  prefix: string;
  text: string;
  suffix: string;
}

export interface CommentAuthor {
  id: string;
  name: string;
  entityType?: string;
}

export interface Comment {
  id: string;
  documentId: string;
  author: CommentAuthor;
  content: string;
  anchor: TextAnchor;
  startOffset: number | null;
  endOffset: number | null;
  resolved: boolean;
  resolvedBy: CommentAuthor | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentsResponse {
  comments: Comment[];
  total: number;
}

export interface CreateCommentInput {
  authorId: string;
  content: string;
  anchor: TextAnchor;
  startOffset?: number;
  endOffset?: number;
}

export interface UpdateCommentInput {
  content?: string;
  resolved?: boolean;
  resolvedBy?: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchComments(
  documentId: string,
  includeResolved = false
): Promise<CommentsResponse> {
  const url = `/api/documents/${documentId}/comments${includeResolved ? '?includeResolved=true' : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch comments');
  }

  return response.json();
}

async function createComment(
  documentId: string,
  input: CreateCommentInput
): Promise<Comment> {
  const response = await fetch(
    `/api/documents/${documentId}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create comment');
  }

  return response.json();
}

async function updateComment(
  commentId: string,
  input: UpdateCommentInput
): Promise<Comment> {
  const response = await fetch(`/api/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update comment');
  }

  return response.json();
}

async function deleteComment(commentId: string): Promise<void> {
  const response = await fetch(`/api/comments/${commentId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to delete comment');
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch comments for a document
 */
export function useDocumentComments(
  documentId: string | null,
  includeResolved = false
) {
  return useQuery({
    queryKey: ['documents', documentId, 'comments', { includeResolved }],
    queryFn: () => fetchComments(documentId!, includeResolved),
    enabled: !!documentId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Create a new comment
 */
export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      input,
    }: {
      documentId: string;
      input: CreateCommentInput;
    }) => createComment(documentId, input),
    onSuccess: (newComment) => {
      // Invalidate comments list
      queryClient.invalidateQueries({
        queryKey: ['documents', newComment.documentId, 'comments'],
      });
    },
  });
}

/**
 * Update a comment
 */
export function useUpdateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commentId,
      input,
    }: {
      commentId: string;
      input: UpdateCommentInput;
    }) => updateComment(commentId, input),
    onSuccess: (updatedComment) => {
      // Invalidate comments list
      queryClient.invalidateQueries({
        queryKey: ['documents', updatedComment.documentId, 'comments'],
      });
    },
  });
}

/**
 * Delete a comment
 */
export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commentId,
    }: {
      commentId: string;
      documentId: string;
    }) => deleteComment(commentId),
    onSuccess: (_, { documentId }) => {
      // Invalidate comments list
      queryClient.invalidateQueries({
        queryKey: ['documents', documentId, 'comments'],
      });
    },
  });
}

/**
 * Resolve/unresolve a comment
 */
export function useResolveComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      commentId,
      resolved,
      resolvedBy,
    }: {
      commentId: string;
      documentId: string;
      resolved: boolean;
      resolvedBy?: string;
    }) => updateComment(commentId, { resolved, resolvedBy }),
    onSuccess: (updatedComment) => {
      // Invalidate comments list
      queryClient.invalidateQueries({
        queryKey: ['documents', updatedComment.documentId, 'comments'],
      });
    },
  });
}
