/**
 * useImageDrop — Reusable hook for drag-and-drop and paste image uploads.
 *
 * Handles:
 *  - onDrop: extracts image files from DataTransfer, uploads via POST /api/assets/upload,
 *    and calls onImageInsert with a markdown image reference.
 *  - onPaste: checks clipboardData.items for image types, same behaviour as drop.
 *  - onDragOver / onDragLeave: manages isDragging state for visual feedback.
 *
 * Only image files (file.type.startsWith("image/")) are processed; everything
 * else is silently ignored so normal text paste/drop still works.
 */

import { useState, useCallback } from 'react';

export interface UseImageDropConfig {
  /** Called with a markdown image string to insert at the cursor. */
  onImageInsert: (markdown: string) => void;
  /** Override the upload endpoint (defaults to "/api/assets/upload"). */
  uploadUrl?: string;
}

export interface UseImageDropReturn {
  dropHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onPaste: (e: React.ClipboardEvent) => void;
  };
  isDragging: boolean;
  isUploading: boolean;
}

/**
 * Upload a single image file to the asset API and return the markdown string,
 * or null on failure.
 */
async function uploadImage(
  file: File,
  uploadUrl: string,
): Promise<string | null> {
  try {
    // Read file as base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        '',
      ),
    );

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        data: base64,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: { message?: string } }).error?.message ||
          `Upload failed: ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      path: string;
      filename: string;
      size: number;
      url: string;
    };

    // Return markdown image reference using the served URL
    return `![${file.name}](${data.url})`;
  } catch (error) {
    console.error('[useImageDrop] Image upload failed:', error);
    return null;
  }
}

/**
 * Extract image File objects from a DataTransfer (drop) or DataTransferItemList (paste).
 */
function extractImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  // Prefer items API (works for paste & drop)
  if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  } else {
    // Fallback to files list
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file.type.startsWith('image/')) {
        files.push(file);
      }
    }
  }
  return files;
}

export function useImageDrop({
  onImageInsert,
  uploadUrl = '/api/assets/upload',
}: UseImageDropConfig): UseImageDropReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsUploading(true);
      try {
        for (const file of files) {
          const markdown = await uploadImage(file, uploadUrl);
          if (markdown) {
            onImageInsert(markdown);
          }
        }
      } finally {
        setIsUploading(false);
      }
    },
    [onImageInsert, uploadUrl],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    // Check if the drag contains files (not internal pane drag)
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes('Files')) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const imageFiles = extractImageFiles(e.dataTransfer);
      if (imageFiles.length > 0) {
        // Prevent the browser from doing anything else with the files
        e.stopPropagation();
        void processFiles(imageFiles);
      }
      // If no image files, let the event propagate normally (e.g. text drop)
    },
    [processFiles],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const imageFiles = extractImageFiles(e.clipboardData);
      if (imageFiles.length > 0) {
        e.preventDefault();
        void processFiles(imageFiles);
      }
      // If no image files, let normal text paste happen
    },
    [processFiles],
  );

  return {
    dropHandlers: { onDragOver, onDragLeave, onDrop, onPaste },
    isDragging,
    isUploading,
  };
}
