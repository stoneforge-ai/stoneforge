/**
 * MessageImageAttachment - Component for attaching images to messages
 *
 * Features:
 * - File picker for image selection
 * - Drag-and-drop support
 * - Clipboard paste support
 * - Image preview before sending
 * - Remove attachment
 * - Upload progress indication
 * - Media library browser
 *
 * TB102 Implementation
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ImageIcon,
  X,
  Loader2,
  Upload,
  Grid,
  Search,
  Check,
  AlertCircle,
} from 'lucide-react';

interface MessageImageAttachmentProps {
  isOpen: boolean;
  onClose: () => void;
  onAttach: (imageUrl: string) => void;
}

interface UploadedFile {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  createdAt: string;
  modifiedAt: string;
  usageCount?: number;
}

export function MessageImageAttachment({
  isOpen,
  onClose,
  onAttach,
}: MessageImageAttachmentProps) {
  const [mode, setMode] = useState<'upload' | 'library'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; file?: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Library state
  const [libraryImages, setLibraryImages] = useState<UploadedFile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [selectedLibraryImage, setSelectedLibraryImage] = useState<UploadedFile | null>(null);

  const resetState = useCallback(() => {
    setMode('upload');
    setDragOver(false);
    setUploading(false);
    setError(null);
    setPreview(null);
    setLibrarySearch('');
    setSelectedLibraryImage(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  // Fetch library images when Library tab is active
  const fetchLibraryImages = useCallback(async () => {
    setLibraryLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/uploads');
      if (!response.ok) {
        throw new Error('Failed to load images');
      }
      const data = await response.json();
      setLibraryImages(data.files || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && mode === 'library') {
      fetchLibraryImages();
    }
  }, [isOpen, mode, fetchLibraryImages]);

  // Filter library images by search
  const filteredLibraryImages = useMemo(() => {
    if (!librarySearch.trim()) return libraryImages;
    const search = librarySearch.toLowerCase();
    return libraryImages.filter((img) => img.filename.toLowerCase().includes(search));
  }, [libraryImages, librarySearch]);

  const uploadFile = async (file: File): Promise<string | null> => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, GIF, WebP`);
      return null;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError(`File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum: 10MB`);
      return null;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      return result.url;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    // Validate immediately
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, GIF, WebP`);
      return;
    }

    // Create preview
    const previewUrl = URL.createObjectURL(file);
    setPreview({ url: previewUrl, file });
    setError(null);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFileSelect(file);
      } else {
        setError('Please drop an image file');
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleAttach = useCallback(async () => {
    if (mode === 'library') {
      if (!selectedLibraryImage) {
        setError('Please select an image');
        return;
      }
      onAttach(selectedLibraryImage.url);
      handleClose();
    } else if (preview?.file) {
      const uploadedUrl = await uploadFile(preview.file);
      if (uploadedUrl) {
        onAttach(uploadedUrl);
        handleClose();
      }
    }
  }, [mode, preview, selectedLibraryImage, onAttach, handleClose]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 z-50 ${
            mode === 'library' ? 'w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col' : 'w-full max-w-md'
          }`}
          data-testid="message-image-attachment-modal"
        >
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Attach Image
          </Dialog.Title>

          {/* Mode tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setMode('upload');
                setError(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'upload'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
              data-testid="message-image-upload-tab"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            <button
              onClick={() => {
                setMode('library');
                setError(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'library'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
              data-testid="message-image-library-tab"
            >
              <Grid className="w-4 h-4" />
              Library
            </button>
          </div>

          {/* Upload mode */}
          {mode === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone / Preview */}
              {preview ? (
                <div className="relative">
                  <img
                    src={preview.url}
                    alt="Preview"
                    className="w-full h-48 object-contain bg-gray-100 dark:bg-gray-800 rounded-lg"
                    data-testid="message-image-preview"
                  />
                  <button
                    onClick={() => setPreview(null)}
                    className="absolute top-2 right-2 p-1 bg-white dark:bg-gray-700 rounded-full shadow hover:bg-gray-100 dark:hover:bg-gray-600"
                    title="Remove"
                    data-testid="message-image-preview-remove"
                  >
                    <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  data-testid="message-image-drop-zone"
                >
                  <ImageIcon className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Drop an image here or click to browse
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    JPEG, PNG, GIF, WebP up to 10MB
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileInputChange}
                className="hidden"
                data-testid="message-image-file-input"
              />
            </div>
          )}

          {/* Library mode */}
          {mode === 'library' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search images..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="message-library-search-input"
                />
              </div>

              {/* Image grid */}
              <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[300px]">
                {libraryLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : filteredLibraryImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
                    <ImageIcon className="w-12 h-12 mb-3 opacity-50" />
                    {libraryImages.length === 0 ? (
                      <>
                        <p className="text-sm font-medium">No images uploaded yet</p>
                        <p className="text-xs mt-1">Upload images to see them here</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">No images match your search</p>
                        <p className="text-xs mt-1">Try a different search term</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-3 gap-3"
                    data-testid="message-library-image-grid"
                  >
                    {filteredLibraryImages.map((image) => (
                      <div
                        key={image.filename}
                        className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                          selectedLibraryImage?.filename === image.filename
                            ? 'border-blue-500 ring-2 ring-blue-500/30'
                            : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                        onClick={() => setSelectedLibraryImage(image)}
                        data-testid={`message-library-image-${image.filename}`}
                      >
                        <img
                          src={image.url}
                          alt={image.filename}
                          className="w-full h-24 object-cover bg-gray-100 dark:bg-gray-800"
                        />

                        {/* Selection indicator */}
                        {selectedLibraryImage?.filename === image.filename && (
                          <div className="absolute top-2 left-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}

                        {/* Hover overlay with info */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                          <p className="text-white text-xs truncate">{image.filename}</p>
                          <p className="text-white/75 text-[10px]">{formatFileSize(image.size)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected image info */}
              {selectedLibraryImage && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <img
                      src={selectedLibraryImage.url}
                      alt={selectedLibraryImage.filename}
                      className="w-12 h-12 object-cover rounded bg-gray-100 dark:bg-gray-800"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {selectedLibraryImage.filename}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(selectedLibraryImage.size)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 flex items-center gap-2"
              data-testid="message-image-error"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              data-testid="message-image-cancel-button"
            >
              Cancel
            </button>
            <button
              onClick={handleAttach}
              disabled={
                uploading ||
                (mode === 'upload' && !preview) ||
                (mode === 'library' && !selectedLibraryImage)
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="message-image-insert-button"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Attach Image'
              )}
            </button>
          </div>

          {/* Close button */}
          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MessageImageAttachment;
