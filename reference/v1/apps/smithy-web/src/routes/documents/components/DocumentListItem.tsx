/**
 * DocumentListItem - Single draggable document in a list
 */

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { FileText, GripVertical } from 'lucide-react';
import type { DocumentType, DragData } from '../types';

interface DocumentListItemProps {
  document: DocumentType;
  isSelected?: boolean;
  onClick?: (id: string) => void;
  /** Current library ID for drag data (null if at top-level) */
  libraryId?: string | null;
  /** Whether to enable drag functionality */
  draggable?: boolean;
}

export function DocumentListItem({
  document,
  isSelected,
  onClick,
  libraryId = null,
  draggable = true,
}: DocumentListItemProps) {
  const formattedDate = new Date(document.updatedAt).toLocaleDateString();
  const title = document.title || `Document ${document.id}`;
  const documentIcon = document.metadata?.icon;

  // Set up draggable with document data
  const dragData: DragData = {
    type: 'document',
    id: document.id,
    sourceLibraryId: libraryId,
    name: title,
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `document-drag-${document.id}`,
    data: dragData,
    disabled: !draggable,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 999 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`document-item-${document.id}`}
      onClick={() => onClick?.(document.id)}
      className={`group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        isDragging
          ? 'opacity-50 border-blue-300 bg-blue-50 shadow-lg'
          : isSelected
            ? 'border-blue-300 bg-blue-50'
            : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      {/* Drag Handle */}
      {draggable && (
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`document-drag-handle-${document.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      )}

      {/* Document Icon: Show emoji from metadata, or fall back to FileText icon */}
      {documentIcon ? (
        <span
          className="w-8 h-8 flex items-center justify-center text-2xl flex-shrink-0"
          data-testid={`document-icon-${document.id}`}
        >
          {documentIcon}
        </span>
      ) : (
        <FileText className={`w-8 h-8 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-blue-400'}`} />
      )}
      <div className="flex-1 min-w-0">
        <p
          data-testid={`document-title-${document.id}`}
          className={`font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}
        >
          {title}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span data-testid={`document-type-${document.id}`}>
            {document.contentType}
          </span>
          <span>·</span>
          <span data-testid={`document-date-${document.id}`}>
            {formattedDate}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Drag overlay component for showing document preview while dragging
 */
export function DocumentDragOverlay({ data }: { data: DragData }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-blue-300 max-w-xs">
      <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {data.name}
      </span>
    </div>
  );
}
