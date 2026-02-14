/**
 * Message composer components for sending messages
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Send,
  X,
  Paperclip,
  FileText,
  Loader2,
  Search,
  ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MessageRichComposer,
  type MessageRichComposerRef,
} from '@stoneforge/ui';
import { MessageImageAttachment } from '@stoneforge/ui';
import { TaskPickerModal } from '../../../components/editor/TaskPickerModal';
import { DocumentPickerModal } from '../../../components/editor/DocumentPickerModal';
import { EmojiPickerModal } from '../../../components/editor/EmojiPickerModal';
import type { MessageEmbedCallbacks } from '@stoneforge/ui';
import { useCurrentUser } from '../../../contexts';
import { useSendMessage, useDocuments, useEntities } from '../../../api/hooks/useMessages';
import type { Channel, AttachedDocument, ImageAttachment } from '../types';

// ============================================================================
// MessageAttachmentPicker
// ============================================================================

interface MessageAttachmentPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (doc: AttachedDocument) => void;
  selectedIds: string[];
}

export function MessageAttachmentPicker({
  isOpen,
  onClose,
  onSelect,
  selectedIds,
}: MessageAttachmentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: documents, isLoading } = useDocuments(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const availableDocs = documents?.filter((doc) => !selectedIds.includes(doc.id)) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="message-attachment-picker"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[60vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Attach Document</h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              data-testid="attachment-picker-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="attachment-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : availableDocs.length === 0 ? (
            <div className="text-center py-8 text-gray-500" data-testid="attachment-picker-empty">
              {documents?.length === 0
                ? 'No documents available'
                : searchQuery
                  ? 'No documents match your search'
                  : 'All documents are already attached'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelect(doc)}
                  className="w-full flex items-center gap-3 p-3 text-left bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"
                  data-testid={`attachment-option-${doc.id}`}
                >
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {doc.title || 'Untitled Document'}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="font-mono">{doc.id}</span>
                      <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                        {doc.contentType}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MessageComposer
// ============================================================================

interface MessageComposerProps {
  channelId: string;
  channel: Channel | undefined;
  isMobile?: boolean;
}

export function MessageComposer({ channelId, channel, isMobile = false }: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<AttachedDocument[]>([]);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  // TB127: Slash command picker states
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const sendMessage = useSendMessage();
  const editorRef = useRef<MessageRichComposerRef>(null);
  const dropZoneRef = useRef<HTMLFormElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { currentUser } = useCurrentUser();

  // Fetch entities for @mention autocomplete
  const { data: entities = [] } = useEntities();

  // Focus editor when channel changes
  useEffect(() => {
    editorRef.current?.focus();
  }, [channelId]);

  // TB127: Embed callbacks for slash commands
  const embedCallbacks = useMemo<MessageEmbedCallbacks>(
    () => ({
      onTaskEmbed: () => setShowTaskPicker(true),
      onDocumentEmbed: () => setShowDocumentPicker(true),
      onEmojiInsert: () => setShowEmojiPicker(true),
    }),
    []
  );

  // TB127: Handle task selection from picker - insert text reference
  const handleTaskSelect = useCallback((taskId: string) => {
    // Insert task reference as text that will be rendered by TB128
    setContent((prev) => prev + `#task:${taskId}`);
    setShowTaskPicker(false);
    editorRef.current?.focus();
  }, []);

  // TB127: Handle document selection from picker - insert text reference
  const handleDocumentSelect = useCallback((documentId: string) => {
    // Insert document reference as text that will be rendered by TB128
    setContent((prev) => prev + `#doc:${documentId}`);
    setShowDocumentPicker(false);
    editorRef.current?.focus();
  }, []);

  // TB127: Handle emoji selection from picker
  const handleEmojiSelect = useCallback((emoji: string) => {
    setContent((prev) => prev + emoji);
    setShowEmojiPicker(false);
    editorRef.current?.focus();
  }, []);

  const handleAddAttachment = (doc: AttachedDocument) => {
    setAttachments((prev) => [...prev, doc]);
    setShowPicker(false);
  };

  const handleRemoveAttachment = (docId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== docId));
  };

  // TB102: Handle image attachment
  const handleAddImageAttachment = (imageUrl: string) => {
    // Extract filename from URL
    const filename = imageUrl.split('/').pop() || 'image';
    setImageAttachments((prev) => [...prev, { url: imageUrl, filename }]);
    setShowImagePicker(false);
  };

  const handleRemoveImageAttachment = (url: string) => {
    setImageAttachments((prev) => prev.filter((a) => a.url !== url));
  };

  // TB102: Upload image file
  const uploadImageFile = async (file: File): Promise<string | null> => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Invalid file type: ${file.type}`);
      return null;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return null;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      return result.url;
    } catch {
      toast.error('Failed to upload image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // TB102: Handle image paste from clipboard
  const handleImagePaste = async (file: File) => {
    const url = await uploadImageFile(file);
    if (url) {
      handleAddImageAttachment(url);
      toast.success('Image attached');
    }
  };

  // TB102: Handle drag and drop images
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const url = await uploadImageFile(file);
      if (url) {
        handleAddImageAttachment(url);
        toast.success('Image attached');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleSubmit = async () => {
    // Allow sending with only images (no text required if images attached)
    const hasContent = content.trim().length > 0;
    const hasImages = imageAttachments.length > 0;
    const hasAttachments = attachments.length > 0;

    if (!hasContent && !hasImages && !hasAttachments) return;
    if (!channel || !currentUser) return;

    const sender = currentUser.id;

    try {
      // Include image URLs in the message content using Markdown
      let finalContent = content.trim();

      // Append image URLs as markdown images
      if (imageAttachments.length > 0) {
        const imageMarkdown = imageAttachments
          .map((img) => `![${img.filename || 'image'}](${img.url})`)
          .join('\n');
        finalContent = finalContent ? `${finalContent}\n\n${imageMarkdown}` : imageMarkdown;
      }

      await sendMessage.mutateAsync({
        channelId,
        sender,
        content: finalContent,
        attachmentIds: attachments.map((a) => a.id),
      });
      setContent('');
      setAttachments([]);
      setImageAttachments([]);
      editorRef.current?.clear();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  const hasAnyAttachments = attachments.length > 0 || imageAttachments.length > 0;
  const canSend = content.trim() || hasAnyAttachments;

  return (
    <>
      <form
        ref={dropZoneRef}
        data-testid="message-composer"
        onSubmit={handleFormSubmit}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-t border-[var(--color-border)] bg-[var(--color-bg)] relative ${
          isMobile ? 'p-2' : 'p-4'
        } ${dragOver ? 'ring-2 ring-blue-500 ring-inset bg-blue-50 dark:bg-blue-900/30' : ''}`}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50/90 dark:bg-blue-900/80 z-10 pointer-events-none">
            <div className="flex flex-col items-center text-blue-600 dark:text-blue-400">
              <ImageIcon className={isMobile ? 'w-6 h-6 mb-1' : 'w-8 h-8 mb-2'} />
              <span className={`font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>
                Drop image here
              </span>
            </div>
          </div>
        )}

        {/* TB102: Image attachments preview */}
        {imageAttachments.length > 0 && (
          <div
            className={`flex flex-wrap mb-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}
            data-testid="message-image-attachments-preview"
          >
            {imageAttachments.map((img) => (
              <div
                key={img.url}
                className="relative group"
                data-testid={`image-attachment-preview-${img.filename}`}
              >
                <img
                  src={img.url}
                  alt={img.filename || 'Attached image'}
                  className={`object-cover rounded-lg border border-[var(--color-border)] ${
                    isMobile ? 'w-14 h-14' : 'w-20 h-20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImageAttachment(img.url)}
                  className={`absolute -top-1 -right-1 bg-red-500 text-white rounded-full transition-opacity ${
                    isMobile ? 'p-0.5 opacity-100' : 'p-1 opacity-0 group-hover:opacity-100'
                  }`}
                  data-testid={`remove-image-attachment-${img.filename}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Attached documents preview */}
        {attachments.length > 0 && (
          <div
            className={`flex flex-wrap mb-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}
            data-testid="message-attachments-preview"
          >
            {attachments.map((doc) => (
              <div
                key={doc.id}
                className={`flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-md ${
                  isMobile ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
                }`}
                data-testid={`attachment-preview-${doc.id}`}
              >
                <FileText className={`text-gray-400 ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                <span className={`truncate ${isMobile ? 'max-w-[100px]' : 'max-w-[150px]'}`}>
                  {doc.title || 'Untitled'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(doc.id)}
                  className="p-0.5 text-gray-400 hover:text-red-500"
                  data-testid={`remove-attachment-${doc.id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`flex items-end ${isMobile ? 'gap-1' : 'gap-2'}`}>
          {/* TB102: Image attachment button - collapsed to icon on mobile */}
          <button
            type="button"
            onClick={() => setShowImagePicker(true)}
            disabled={uploadingImage}
            className={`text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors self-end disabled:opacity-50 ${
              isMobile ? 'p-2 touch-target' : 'p-2 mb-1'
            }`}
            data-testid="message-image-attach-button"
            title="Attach image"
          >
            {uploadingImage ? (
              <Loader2 className={isMobile ? 'w-5 h-5 animate-spin' : 'w-5 h-5 animate-spin'} />
            ) : (
              <ImageIcon className={isMobile ? 'w-5 h-5' : 'w-5 h-5'} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className={`text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors self-end ${
              isMobile ? 'p-2 touch-target' : 'p-2 mb-1'
            }`}
            data-testid="message-attach-button"
            title="Attach document"
          >
            <Paperclip className={isMobile ? 'w-5 h-5' : 'w-5 h-5'} />
          </button>
          <div className="flex-1 min-w-0">
            <MessageRichComposer
              ref={editorRef}
              content={content}
              onChange={setContent}
              onSubmit={handleSubmit}
              onImagePaste={handleImagePaste}
              channelName={channel?.name}
              disabled={sendMessage.isPending}
              maxHeight={isMobile ? 120 : 180}
              minHeight={isMobile ? 44 : 60}
              embedCallbacks={embedCallbacks}
              mentionEntities={entities}
            />
          </div>
          <button
            type="submit"
            data-testid="message-send-button"
            disabled={!canSend || sendMessage.isPending}
            className={`bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center self-end ${
              isMobile ? 'p-2.5 touch-target' : 'px-4 py-2 gap-2 mb-1'
            }`}
          >
            <Send className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
            <span className="sr-only">Send</span>
          </button>
        </div>
        {sendMessage.isError && (
          <p
            data-testid="message-send-error"
            className={`mt-2 text-red-500 ${isMobile ? 'text-xs' : 'text-sm'}`}
          >
            {sendMessage.error?.message || 'Failed to send message. Please try again.'}
          </p>
        )}
      </form>

      <MessageAttachmentPicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleAddAttachment}
        selectedIds={attachments.map((a) => a.id)}
      />

      {/* TB102: Image attachment modal */}
      <MessageImageAttachment
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onAttach={handleAddImageAttachment}
      />

      {/* TB127: Task picker modal for slash commands */}
      <TaskPickerModal
        isOpen={showTaskPicker}
        onClose={() => setShowTaskPicker(false)}
        onSelect={handleTaskSelect}
      />

      {/* TB127: Document picker modal for slash commands */}
      <DocumentPickerModal
        isOpen={showDocumentPicker}
        onClose={() => setShowDocumentPicker(false)}
        onSelect={handleDocumentSelect}
      />

      {/* TB127: Emoji picker modal for slash commands */}
      <EmojiPickerModal
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
      />
    </>
  );
}
