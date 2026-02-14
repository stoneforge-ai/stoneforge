/**
 * LibraryTree - Virtualized library tree sidebar
 */

import { useMemo, useCallback } from 'react';
import {
  Library,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  FolderPlus,
  Plus,
  Trash2,
} from 'lucide-react';
import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import { DocumentSearchBar } from './DocumentSearchBar';
import { buildLibraryTree, flattenLibraryTree } from '../utils';
import { LIBRARY_ITEM_HEIGHT } from '../constants';
import type { LibraryType, FlatLibraryItem } from '../types';

/**
 * Flat library item for virtualized rendering
 */
function FlatLibraryTreeItem({
  item,
  selectedLibraryId,
  onSelect,
  onToggleExpand,
  onDeleteLibrary,
}: {
  item: FlatLibraryItem;
  selectedLibraryId: string | null;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onDeleteLibrary?: (id: string) => void;
}) {
  const { node, level, hasChildren, isExpanded } = item;
  const isSelected = selectedLibraryId === node.id;

  return (
    <div data-testid={`library-tree-item-${node.id}`}>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/Collapse Toggle */}
        <button
          data-testid={`library-toggle-${node.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
          className="p-0.5 hover:bg-gray-200 rounded"
          aria-label={hasChildren ? (isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`) : 'No children'}
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )
          ) : (
            <span className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        {/* Library Icon */}
        {isExpanded && hasChildren ? (
          <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        )}

        {/* Library Name */}
        <span
          data-testid={`library-name-${node.id}`}
          className="text-sm font-medium truncate flex-1"
        >
          {node.name}
        </span>

        {/* Delete Button - visible on hover */}
        {onDeleteLibrary && (
          <button
            data-testid={`delete-library-button-${node.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteLibrary(node.id);
            }}
            className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-all"
            title="Delete Library"
            aria-label={`Delete ${node.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface LibraryTreeProps {
  libraries: LibraryType[];
  selectedLibraryId: string | null;
  expandedIds: Set<string>;
  onSelectLibrary: (id: string | null) => void;
  onToggleExpand: (id: string) => void;
  onNewDocument: () => void;
  onNewLibrary: () => void;
  onSelectDocument: (documentId: string) => void;
  onDeleteLibrary?: (id: string) => void;
  isMobile?: boolean;
}

export function LibraryTree({
  libraries,
  selectedLibraryId,
  expandedIds,
  onSelectLibrary,
  onToggleExpand,
  onNewDocument,
  onNewLibrary,
  onSelectDocument,
  onDeleteLibrary,
  isMobile = false,
}: LibraryTreeProps) {
  // Build tree structure from flat list
  const treeNodes = useMemo(() => buildLibraryTree(libraries), [libraries]);

  // Flatten tree for virtualization based on expanded state
  const flatItems = useMemo(
    () => flattenLibraryTree(treeNodes, expandedIds),
    [treeNodes, expandedIds]
  );

  // Render a single flat library item
  const renderLibraryItem = useCallback(
    (item: FlatLibraryItem, _index: number) => (
      <FlatLibraryTreeItem
        item={item}
        selectedLibraryId={selectedLibraryId}
        onSelect={onSelectLibrary}
        onToggleExpand={onToggleExpand}
        onDeleteLibrary={onDeleteLibrary}
      />
    ),
    [selectedLibraryId, onSelectLibrary, onToggleExpand, onDeleteLibrary]
  );

  return (
    <div
      data-testid="library-tree"
      className={`${isMobile ? 'w-full' : 'w-64 border-r border-gray-200'} bg-white dark:bg-[var(--color-bg)] flex flex-col h-full`}
    >
      <div className={`${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-gray-900 dark:text-[var(--color-text)] flex items-center gap-2`}>
            <Library className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-500`} />
            Libraries
          </h2>
          {/* Hide action buttons on mobile - we have FABs instead */}
          {!isMobile && (
            <div className="flex items-center gap-1">
              <button
                onClick={onNewLibrary}
                className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors"
                title="New Library"
                data-testid="new-library-button-sidebar"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                onClick={onNewDocument}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                title="Create Document"
                data-testid="new-document-button-sidebar"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {/* Document Search Bar */}
        <DocumentSearchBar onSelectDocument={onSelectDocument} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* All Documents option - always visible outside virtualized list */}
        <div className={`${isMobile ? 'p-2 pb-0' : 'p-2 pb-0'}`}>
          <button
            onClick={() => onSelectLibrary(null)}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-3' : 'px-3 py-2'} rounded-md text-left text-sm mb-2 ${
              selectedLibraryId === null
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            } ${isMobile ? 'touch-target' : ''}`}
            data-testid="all-documents-button"
          >
            <FileText className="w-4 h-4" />
            All Documents
          </button>
        </div>

        {libraries.length === 0 ? (
          <div
            data-testid="library-empty-state"
            className="text-center py-8 text-gray-500 dark:text-gray-400"
          >
            <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">No libraries yet</p>
            <button
              onClick={onNewLibrary}
              className="mt-2 text-sm text-purple-600 dark:text-purple-400 hover:underline"
              data-testid="new-library-button-empty"
            >
              Create one
            </button>
          </div>
        ) : (
          <div data-testid="library-list" className="flex-1 overflow-hidden px-2">
            <VirtualizedList
              items={flatItems}
              getItemKey={(item) => item.node.id}
              estimateSize={isMobile ? 44 : LIBRARY_ITEM_HEIGHT}
              renderItem={renderLibraryItem}
              overscan={5}
              className="h-full"
              scrollRestoreId="library-tree-scroll"
              testId="virtualized-library-list"
              renderEmpty={() => (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                  No libraries to display
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* Library count - hidden on mobile */}
      {!isMobile && (
        <div
          data-testid="library-count"
          className="p-3 border-t border-gray-200 dark:border-[var(--color-border)] text-xs text-gray-500 dark:text-gray-400"
        >
          {libraries.length} {libraries.length === 1 ? 'library' : 'libraries'}
        </div>
      )}
    </div>
  );
}
