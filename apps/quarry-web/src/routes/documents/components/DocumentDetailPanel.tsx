/**
 * DocumentDetailPanel - Shows full document content and metadata with edit support
 */

import { useState, useMemo } from 'react';
import {
  X,
  User,
  Clock,
  Edit3,
  Save,
  XCircle,
  History,
  Eye,
  Maximize2,
  Minimize2,
  Expand,
  Shrink,
  Copy,
  MessageSquare,
  Smile,
} from 'lucide-react';
import { DocumentTagInput } from '@stoneforge/ui/documents';
import { useAllEntities } from '../../../api/hooks/useAllElements';
import { EmojiPickerModal } from '../../../components/editor/EmojiPickerModal';
import { BlockEditor } from '../../../components/editor/BlockEditor';
import { AddCommentModal } from '../../../components/editor/AddCommentModal';
import { CommentsPanel } from '../../../components/editor/CommentsPanel';
import type { MentionEntity } from '../../../components/editor/MentionAutocomplete';
import { useCreateComment, useDocumentComments, type Comment } from '../../../api/hooks/useDocumentComments';
import { createTextAnchor, findAnchorPosition, getPlainTextForAnchoring } from '../../../lib/anchors';
import {
  useDocument,
  useUpdateDocument,
  useCloneDocument,
  useDocumentVersion,
} from '../hooks';
import { CONTENT_TYPE_CONFIG } from '../constants';
import { formatDate, formatRelativeTime } from '../utils';
import { DocumentRenderer } from './DocumentRenderer';
import { VersionHistorySidebar } from './VersionHistorySidebar';
import { LinkedDocumentsSection } from './DocumentLinkComponents';
import type { DocumentType } from '../types';

interface DocumentDetailPanelProps {
  documentId: string;
  onClose: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isFullscreen?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  onDocumentCloned?: (document: { id: string }) => void;
  libraryId?: string | null;
  onNavigateToDocument?: (id: string) => void;
  isMobile?: boolean;
}

export function DocumentDetailPanel({
  documentId,
  onClose,
  isExpanded = false,
  onToggleExpand,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  onDocumentCloned,
  libraryId,
  onNavigateToDocument,
  isMobile = false,
}: DocumentDetailPanelProps) {
  const { data: document, isLoading, isError, error } = useDocument(documentId);
  const updateDocument = useUpdateDocument();
  const cloneDocument = useCloneDocument();
  const createComment = useCreateComment();
  const { data: entitiesData } = useAllEntities();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState<number | null>(null);

  // Comments state
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [pendingComment, setPendingComment] = useState<{
    selectedText: string;
    from: number;
    to: number;
  } | null>(null);
  const { data: commentsData } = useDocumentComments(documentId);
  const commentCount = commentsData?.comments.filter((c: Comment) => !c.resolved).length || 0;

  // Document icon/emoji state
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Convert entities to mention format for @mention autocomplete
  const mentionEntities: MentionEntity[] = useMemo(() => {
    if (!entitiesData) return [];
    return entitiesData.map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.entityType,
    }));
  }, [entitiesData]);

  // Fetch the previewing version content
  const { data: previewDocument } = useDocumentVersion(
    previewingVersion ? documentId : null,
    previewingVersion
  );

  // Initialize edit state when entering edit mode
  const handleStartEdit = () => {
    if (document) {
      setEditedContent(document.content || '');
      setEditedTitle(document.title || '');
      setIsEditing(true);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent('');
    setEditedTitle('');
  };

  // Save changes
  const handleSave = async () => {
    if (!document) return;

    const updates: Partial<Pick<DocumentType, 'title' | 'content'>> = {};

    if (editedTitle !== (document.title || '')) {
      updates.title = editedTitle;
    }
    if (editedContent !== (document.content || '')) {
      updates.content = editedContent;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await updateDocument.mutateAsync({ id: documentId, updates });
        setIsEditing(false);
      } catch {
        // Error handling is done by the mutation
      }
    } else {
      setIsEditing(false);
    }
  };

  // Handle comment from bubble menu
  const handleComment = (selectedText: string, from: number, to: number) => {
    setPendingComment({ selectedText, from, to });
    setCommentModalOpen(true);
  };

  // Submit comment
  const handleSubmitComment = async (content: string) => {
    if (!document || !pendingComment) return;

    const plainText = getPlainTextForAnchoring(document.content || '', document.contentType);
    const anchor = createTextAnchor(
      plainText,
      pendingComment.from,
      pendingComment.to
    );

    try {
      await createComment.mutateAsync({
        documentId: document.id,
        input: {
          authorId: 'el-0000', // TODO: Use actual current user ID
          content,
          anchor,
          startOffset: pendingComment.from,
          endOffset: pendingComment.to,
        },
      });
      setCommentModalOpen(false);
      setPendingComment(null);
      setShowCommentsPanel(true);
    } catch {
      // Error handling done by mutation
    }
  };

  // Handle clicking a comment to scroll to its position
  const handleCommentClick = (comment: Comment) => {
    const plainText = getPlainTextForAnchoring(document?.content || '', document?.contentType || 'text');
    const match = findAnchorPosition(comment.anchor, plainText);
    if (match) {
      // TODO: Scroll to position in editor
      console.log('Comment position:', match.startOffset, match.endOffset);
    }
  };

  // Clone document
  const handleClone = async () => {
    if (!document) return;

    try {
      const clonedDoc = await cloneDocument.mutateAsync({
        id: documentId,
        createdBy: document.createdBy,
        libraryId: libraryId || undefined,
      });
      if (clonedDoc?.id && onDocumentCloned) {
        onDocumentCloned({ id: clonedDoc.id });
      }
    } catch {
      // Error handling is done by the mutation
    }
  };

  // Set document icon/emoji
  const handleSetIcon = async (emoji: string) => {
    if (!document) return;

    try {
      await updateDocument.mutateAsync({
        id: documentId,
        updates: {
          metadata: {
            ...document.metadata,
            icon: emoji,
          },
        },
      });
      setShowIconPicker(false);
    } catch {
      // Error handling is done by the mutation
    }
  };

  // Remove document icon
  const handleRemoveIcon = async () => {
    if (!document) return;

    try {
      const newMetadata = { ...document.metadata };
      delete newMetadata.icon;
      await updateDocument.mutateAsync({
        id: documentId,
        updates: {
          metadata: newMetadata,
        },
      });
    } catch {
      // Error handling is done by the mutation
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="document-detail-loading"
        className="h-full flex items-center justify-center bg-white dark:bg-[var(--color-bg)]"
      >
        <div className="text-gray-500 dark:text-gray-400">Loading document...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="document-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white dark:bg-[var(--color-bg)] px-4"
      >
        <div className="text-red-600 dark:text-red-400 mb-2">Failed to load document</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div
        data-testid="document-detail-not-found"
        className="h-full flex items-center justify-center bg-white dark:bg-[var(--color-bg)]"
      >
        <div className="text-gray-500 dark:text-gray-400">Document not found</div>
      </div>
    );
  }

  const title = document.title || `Document ${document.id}`;
  const typeConfig = CONTENT_TYPE_CONFIG[document.contentType] || CONTENT_TYPE_CONFIG.text;

  return (
    <div
      data-testid="document-detail-panel"
      className={`h-full flex flex-col bg-white dark:bg-[var(--color-bg)] ${isMobile ? '' : 'border-l border-gray-200 dark:border-[var(--color-border)]'}`}
    >
      {/* Header */}
      <div className={`flex items-start justify-between ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}>
        <div className="flex-1 min-w-0">
          {/* Content type badge */}
          <div className="flex items-center gap-2 mb-2">
            <span
              data-testid="document-detail-type"
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${typeConfig.color}`}
            >
              {typeConfig.icon}
              {typeConfig.label}
            </span>
            {document.version !== undefined && (
              <span
                data-testid="document-detail-version"
                className="text-xs text-gray-500"
              >
                v{document.version}
              </span>
            )}
          </div>

          {/* Title with Document Icon */}
          <div className="flex items-center gap-2">
            {/* Document Icon/Emoji - clickable to open picker */}
            <button
              onClick={() => setShowIconPicker(true)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors group"
              title={document.metadata?.icon ? 'Change icon' : 'Add icon'}
              data-testid="document-icon-button"
            >
              {document.metadata?.icon ? (
                <span className="text-2xl" data-testid="document-detail-icon">
                  {document.metadata.icon}
                </span>
              ) : (
                <Smile className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
              )}
            </button>

            {/* Title */}
            {isEditing ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                data-testid="document-title-input"
                className="text-lg font-semibold text-gray-900 flex-1 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Document title"
              />
            ) : (
              <h2
                data-testid="document-detail-title"
                className="text-lg font-semibold text-gray-900 truncate"
              >
                {title}
              </h2>
            )}

            {/* Remove icon button - only shown when icon exists */}
            {document.metadata?.icon && (
              <button
                onClick={handleRemoveIcon}
                className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                title="Remove icon"
                data-testid="document-remove-icon-button"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* ID */}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-mono">
            <span data-testid="document-detail-id">{document.id}</span>
          </div>

          {/* Metadata - Created, Created By, Updated */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1" title={formatDate(previewingVersion !== null && previewDocument ? previewDocument.createdAt : document.createdAt)}>
              <Clock className="w-3 h-3" />
              <span>Created {formatRelativeTime(previewingVersion !== null && previewDocument ? previewDocument.createdAt : document.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1" title={formatDate(previewingVersion !== null && previewDocument ? previewDocument.updatedAt : document.updatedAt)}>
              <Clock className="w-3 h-3" />
              <span>Updated {formatRelativeTime(previewingVersion !== null && previewDocument ? previewDocument.updatedAt : document.updatedAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="font-mono">{document.createdBy}</span>
            </div>
          </div>
        </div>

        {/* Action buttons - simplified on mobile */}
        <div className={`flex items-center ${isMobile ? 'gap-0.5' : 'gap-1'} ml-2`}>
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateDocument.isPending}
                data-testid="document-save-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30 rounded disabled:opacity-50`}
                aria-label="Save changes"
                title="Save (Cmd+S)"
              >
                <Save className="w-5 h-5" />
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={updateDocument.isPending}
                data-testid="document-cancel-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded disabled:opacity-50`}
                aria-label="Cancel editing"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEdit}
                disabled={previewingVersion !== null}
                data-testid="document-edit-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Edit document"
                title={previewingVersion !== null ? 'Exit preview to edit' : 'Edit document'}
              >
                <Edit3 className="w-5 h-5" />
              </button>
              {/* Hide clone and history buttons on mobile for cleaner UI */}
              {!isMobile && (
                <>
                  <button
                    onClick={handleClone}
                    disabled={cloneDocument.isPending || previewingVersion !== null}
                    data-testid="document-clone-button"
                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Clone document"
                    title={previewingVersion !== null ? 'Exit preview to clone' : 'Clone document'}
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                    data-testid="document-history-button"
                    className={`p-1.5 rounded ${
                      showVersionHistory
                        ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    aria-label={showVersionHistory ? 'Hide version history' : 'Show version history'}
                    title="Version history"
                  >
                    <History className="w-5 h-5" />
                  </button>
                </>
              )}
              {/* Comments button - show on mobile too */}
              <button
                onClick={() => setShowCommentsPanel(!showCommentsPanel)}
                data-testid="document-comments-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} rounded relative ${
                  showCommentsPanel
                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                aria-label={showCommentsPanel ? 'Hide comments' : 'Show comments'}
                title="Comments"
              >
                <MessageSquare className="w-5 h-5" />
                {commentCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                    {commentCount > 9 ? '9+' : commentCount}
                  </span>
                )}
              </button>
            </>
          )}
          {/* Expand button - hide on mobile */}
          {!isMobile && onToggleExpand && !isFullscreen && (
            <button
              onClick={onToggleExpand}
              data-testid="document-expand-button"
              className={`p-1.5 rounded ${
                isExpanded
                  ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              aria-label={isExpanded ? 'Collapse document' : 'Expand document'}
              title={isExpanded ? 'Show document list' : 'Hide document list'}
            >
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          )}
          {/* Fullscreen/Focus mode button - hide on mobile */}
          {!isMobile && isFullscreen ? (
            <button
              onClick={onExitFullscreen}
              data-testid="document-fullscreen-button"
              className="p-1.5 rounded text-blue-600 bg-blue-50 dark:bg-blue-900/30"
              aria-label="Exit fullscreen"
              title="Exit fullscreen (Escape)"
            >
              <Shrink className="w-5 h-5" />
            </button>
          ) : (
            !isMobile && onEnterFullscreen && (
              <button
                onClick={onEnterFullscreen}
                data-testid="document-fullscreen-button"
                className="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Enter fullscreen"
                title="Focus mode (fullscreen)"
              >
                <Expand className="w-5 h-5" />
              </button>
            )
          )}
          {/* Close button - hide on mobile since MobileDetailSheet has its own */}
          {!isMobile && (
            <button
              onClick={isFullscreen ? onExitFullscreen : onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Close panel'}
              data-testid="document-detail-close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {updateDocument.isError && (
        <div
          data-testid="document-update-error"
          className={`${isMobile ? 'mx-3' : 'mx-4'} mt-2 p-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded`}
        >
          {updateDocument.error?.message || 'Failed to save document'}
        </div>
      )}

      {/* Main content area with optional version history sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-3' : 'p-4'}`}>
          {/* Preview banner */}
          {previewingVersion !== null && previewDocument && (
            <div
              data-testid="document-preview-banner"
              className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-800">
                  Previewing version {previewingVersion}
                </span>
              </div>
              <button
                onClick={() => setPreviewingVersion(null)}
                data-testid="exit-preview-button"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Exit Preview
              </button>
            </div>
          )}

          {/* Document Content */}
          <div data-testid="document-content" className="mb-6">
            {isEditing ? (
              <BlockEditor
                content={editedContent}
                contentType={document.contentType}
                onChange={setEditedContent}
                onSave={handleSave}
                placeholder="Start writing..."
                onComment={handleComment}
                mentionEntities={mentionEntities}
              />
            ) : (
              <DocumentRenderer
                content={previewingVersion !== null && previewDocument ? previewDocument.content || '' : document.content || ''}
                contentType={previewingVersion !== null && previewDocument ? previewDocument.contentType : document.contentType}
              />
            )}
          </div>

          {/* Tags - editable, only show for current version, not preview */}
          {!previewingVersion && (
            <div className="mb-6">
              <DocumentTagInput
                tags={document.tags || []}
                onTagsChange={async (newTags: string[]) => {
                  try {
                    await updateDocument.mutateAsync({
                      id: documentId,
                      updates: { tags: newTags },
                    });
                  } catch {
                    // Error handling is done by the mutation
                  }
                }}
                disabled={updateDocument.isPending}
              />
            </div>
          )}

          {/* Linked Documents - only show for current version, not preview */}
          {!previewingVersion && onNavigateToDocument && (
            <LinkedDocumentsSection
              documentId={documentId}
              onNavigateToDocument={onNavigateToDocument}
            />
          )}
        </div>

        {/* Version History Sidebar */}
        {showVersionHistory && (
          <VersionHistorySidebar
            documentId={documentId}
            currentVersion={document.version || 1}
            onPreviewVersion={setPreviewingVersion}
            previewingVersion={previewingVersion}
            onClose={() => {
              setShowVersionHistory(false);
              setPreviewingVersion(null);
            }}
          />
        )}

        {/* Comments Panel */}
        {showCommentsPanel && (
          <div className="w-80 flex-shrink-0 border-l border-gray-200 h-full overflow-hidden">
            <CommentsPanel
              documentId={documentId}
              onCommentClick={handleCommentClick}
              currentUserId="el-0000" // TODO: Use actual current user ID
            />
          </div>
        )}
      </div>

      {/* Add Comment Modal */}
      <AddCommentModal
        isOpen={commentModalOpen}
        onClose={() => {
          setCommentModalOpen(false);
          setPendingComment(null);
        }}
        selectedText={pendingComment?.selectedText || ''}
        onSubmit={handleSubmitComment}
        isSubmitting={createComment.isPending}
      />

      {/* Document Icon Picker Modal */}
      <EmojiPickerModal
        isOpen={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        onSelect={handleSetIcon}
      />
    </div>
  );
}
