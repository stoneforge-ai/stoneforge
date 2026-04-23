import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Loader2, Plus, FileText } from 'lucide-react';
import { TagInput } from '@stoneforge/ui';
import { useCurrentUser } from '../../contexts';

interface Library {
  id: string;
  name: string;
}

interface CreateDocumentInput {
  title: string;
  contentType: string;
  content: string;
  createdBy: string;
  tags?: string[];
  libraryId?: string;
}

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (document: { id: string }) => void;
  defaultLibraryId?: string;
  isMobile?: boolean;
}

function useLibraries() {
  return useQuery<Library[]>({
    queryKey: ['libraries'],
    queryFn: async () => {
      const response = await fetch('/api/libraries');
      if (!response.ok) throw new Error('Failed to fetch libraries');
      return response.json();
    },
  });
}

function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDocumentInput) => {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create document');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all document-related queries
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

const CONTENT_TYPE_OPTIONS = [
  { value: 'text', label: 'Plain Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
];

export function CreateDocumentModal({
  isOpen,
  onClose,
  onSuccess,
  defaultLibraryId,
  isMobile = false,
}: CreateDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState('markdown');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [libraryId, setLibraryId] = useState(defaultLibraryId || '');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const createDocument = useCreateDocument();
  const { data: libraries } = useLibraries();
  const { currentUser } = useCurrentUser();

  // Focus title input when modal opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setContentType('markdown');
      setContent('');
      setTags([]);
      setLibraryId(defaultLibraryId || '');
      createDocument.reset();
    }
  }, [isOpen, defaultLibraryId]);

  // Set default libraryId when libraries load
  useEffect(() => {
    if (defaultLibraryId) {
      setLibraryId(defaultLibraryId);
    }
  }, [defaultLibraryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;
    if (!currentUser) return;

    const input: CreateDocumentInput = {
      title: title.trim(),
      contentType,
      content,
      createdBy: currentUser.id,
    };

    if (tags.length > 0) {
      input.tags = tags;
    }

    if (libraryId) {
      input.libraryId = libraryId;
    }

    try {
      const result = await createDocument.mutateAsync(input);
      onSuccess?.(result);
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex ${isMobile ? 'items-end' : 'items-start justify-center overflow-y-auto py-8'}`} data-testid="create-document-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-document-modal-backdrop"
      />

      {/* Dialog - full screen on mobile */}
      <div className={`relative w-full ${isMobile ? 'h-full' : 'max-w-lg mx-4'}`}>
        <div className={`bg-white dark:bg-[var(--color-bg)] ${isMobile ? 'h-full flex flex-col rounded-t-xl' : 'rounded-xl'} shadow-2xl border border-gray-200 dark:border-[var(--color-border)] overflow-hidden`}>
          {/* Header */}
          <div className={`flex items-center justify-between ${isMobile ? 'px-4 py-4' : 'px-4 py-3'} border-b border-gray-200 dark:border-[var(--color-border)]`}>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-[var(--color-text)]">Create Document</h2>
            </div>
            <button
              onClick={onClose}
              className={`${isMobile ? 'p-2 touch-target' : 'p-1'} text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded`}
              aria-label="Close"
              data-testid="create-document-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form - scrollable on mobile */}
          <form onSubmit={handleSubmit} className={`${isMobile ? 'flex-1 overflow-y-auto' : ''} p-4`}>
            {/* Title */}
            <div className="mb-4">
              <label htmlFor="document-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                ref={titleInputRef}
                id="document-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title..."
                className={`w-full px-3 ${isMobile ? 'py-3' : 'py-2'} border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                data-testid="create-document-title-input"
                required
              />
            </div>

            {/* Content Type */}
            <div className="mb-4">
              <label htmlFor="document-content-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Content Type
              </label>
              <select
                id="document-content-type"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className={`w-full px-3 ${isMobile ? 'py-3' : 'py-2'} border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                data-testid="create-document-content-type-select"
              >
                {CONTENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Library */}
            <div className="mb-4">
              <label htmlFor="document-library" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Library (optional)
              </label>
              <select
                id="document-library"
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
                className={`w-full px-3 ${isMobile ? 'py-3' : 'py-2'} border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                data-testid="create-document-library-select"
              >
                <option value="">No library</option>
                {libraries?.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Content */}
            <div className="mb-4">
              <label htmlFor="document-content" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Initial Content
              </label>
              <textarea
                id="document-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  contentType === 'json'
                    ? '{\n  "key": "value"\n}'
                    : contentType === 'markdown'
                    ? '# Heading\n\nStart writing...'
                    : 'Start writing...'
                }
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${isMobile ? 'min-h-[150px]' : ''}`}
                data-testid="create-document-content-textarea"
                rows={isMobile ? 8 : 6}
              />
            </div>

            {/* Tags */}
            <div className={`${isMobile ? 'mb-4' : 'mb-6'}`}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tags
              </label>
              <TagInput
                tags={tags}
                onChange={setTags}
                placeholder="Type and press comma to add tags"
                data-testid="create-document-tags-input"
              />
            </div>

            {/* Error display */}
            {createDocument.isError && (
              <div
                className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300"
                data-testid="create-document-error"
              >
                {(createDocument.error as Error)?.message || 'Failed to create document'}
              </div>
            )}

            {/* Actions - sticky at bottom on mobile */}
            <div className={`${isMobile ? 'sticky bottom-0 pt-4 pb-safe bg-white dark:bg-[var(--color-bg)] border-t border-gray-200 dark:border-[var(--color-border)] -mx-4 px-4' : ''} flex items-center ${isMobile ? 'flex-col gap-3' : 'justify-end gap-3'}`}>
              {isMobile ? (
                <>
                  <button
                    type="submit"
                    disabled={createDocument.isPending || !title.trim() || !currentUser}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
                    data-testid="create-document-submit-button"
                  >
                    {createDocument.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create Document
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors touch-target"
                    data-testid="create-document-cancel-button"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                    data-testid="create-document-cancel-button"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createDocument.isPending || !title.trim() || !currentUser}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="create-document-submit-button"
                  >
                    {createDocument.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create Document
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
