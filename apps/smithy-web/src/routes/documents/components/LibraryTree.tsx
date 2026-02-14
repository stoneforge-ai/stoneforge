/**
 * LibraryTree - Tree sidebar using react-arborist for drag-and-drop
 */

import { useRef, useMemo, useCallback, useState, useEffect, createContext, useContext } from 'react';
import { Tree, NodeApi, NodeRendererProps } from 'react-arborist';
import { useDroppable } from '@dnd-kit/core';
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
import { DocumentSearchBar } from './DocumentSearchBar';
import { buildLibraryTree } from '../utils';
import { LIBRARY_ITEM_HEIGHT } from '../constants';
import type { LibraryType, LibraryTreeNode, DragData } from '../types';

/**
 * Context for passing delete handler to tree nodes
 */
const LibraryTreeContext = createContext<{
  onDeleteLibrary?: (id: string) => void;
}>({});

/**
 * Data structure for react-arborist tree nodes
 */
interface TreeNodeData {
  id: string;
  name: string;
  nodeType: 'library';
  parentId: string | null;
  data: LibraryType;
  children?: TreeNodeData[];
}

/**
 * Convert LibraryTreeNode to react-arborist compatible format
 */
function toArboristData(nodes: LibraryTreeNode[]): TreeNodeData[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    nodeType: 'library' as const,
    parentId: node.parentId,
    data: node,
    children: node.children.length > 0 ? toArboristData(node.children) : undefined,
  }));
}

/**
 * LibraryTreeNode renderer for react-arborist
 */
function LibraryNode({
  node,
  style,
  dragHandle,
}: NodeRendererProps<TreeNodeData>) {
  const { onDeleteLibrary } = useContext(LibraryTreeContext);
  const isSelected = node.isSelected;
  const isExpanded = node.isOpen;
  const hasChildren = !node.isLeaf;

  // Make this node a drop target for @dnd-kit external documents
  const { isOver, setNodeRef } = useDroppable({
    id: `library-drop-${node.id}`,
    data: {
      type: 'library',
      id: node.id,
      name: node.data.name,
    },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`library-tree-item-${node.id}`}
      style={style}
      className={`relative ${isOver ? 'ring-2 ring-blue-400 ring-inset rounded' : ''}`}
    >
      <div
        ref={dragHandle}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          node.select();
          node.activate();
        }}
      >
        {/* Expand/Collapse Toggle */}
        <button
          data-testid={`library-toggle-${node.id}`}
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          aria-label={hasChildren ? (isExpanded ? `Collapse ${node.data.name}` : `Expand ${node.data.name}`) : 'No children'}
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
          {node.data.name}
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
            aria-label={`Delete ${node.data.name}`}
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
  onMoveLibrary?: (libraryId: string, newParentId: string | null, index?: number) => void;
  onReorderLibrary?: (libraryId: string, newIndex: number) => void;
  onDropDocument?: (documentId: string, libraryId: string) => void;
  onDeleteLibrary?: (id: string) => void;
  activeDragData?: DragData | null;
  isMobile?: boolean;
  /** When true, uses container query responsive width (w-48 / @3xl/docs:w-64) instead of fixed w-64 */
  compact?: boolean;
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
  onMoveLibrary,
  onReorderLibrary,
  onDeleteLibrary,
  activeDragData,
  isMobile = false,
  compact = false,
}: LibraryTreeProps) {
  const treeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(400);

  // Measure container height for react-arborist
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTreeHeight(entry.contentRect.height);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Build tree structure from flat list
  const treeNodes = useMemo(() => buildLibraryTree(libraries), [libraries]);

  // Convert to react-arborist format
  const arboristData = useMemo(() => toArboristData(treeNodes), [treeNodes]);

  // Convert expandedIds Set to OpenMap for react-arborist
  const initialOpenState = useMemo(() => {
    const openMap: Record<string, boolean> = {};
    for (const id of expandedIds) {
      openMap[id] = true;
    }
    return openMap;
  }, [expandedIds]);

  // Handle tree node selection
  const handleSelect = useCallback(
    (nodes: NodeApi<TreeNodeData>[]) => {
      if (nodes.length > 0) {
        onSelectLibrary(nodes[0].id);
      }
    },
    [onSelectLibrary]
  );

  // Handle tree node activation (click)
  const handleActivate = useCallback(
    (node: NodeApi<TreeNodeData>) => {
      onSelectLibrary(node.id);
    },
    [onSelectLibrary]
  );

  // Handle toggle expand/collapse
  const handleToggle = useCallback(
    (id: string) => {
      onToggleExpand(id);
    },
    [onToggleExpand]
  );

  // Handle library move (drag within tree)
  const handleMove = useCallback(
    async ({
      dragIds,
      parentId,
      parentNode,
      dragNodes,
      index,
    }: {
      dragIds: string[];
      dragNodes: NodeApi<TreeNodeData>[];
      parentId: string | null;
      parentNode: NodeApi<TreeNodeData> | null;
      index: number;
    }) => {
      const libraryId = dragIds[0];
      if (!libraryId) return;

      // Prevent moving to self
      if (libraryId === parentId) return;

      // Prevent circular nesting (moving to descendant)
      const dragNode = dragNodes[0];
      if (dragNode && parentNode && dragNode.isAncestorOf(parentNode)) {
        console.warn('Cannot move library to its own descendant');
        return;
      }

      // Check if this is a reorder within the same parent
      const currentParentId = dragNodes[0]?.data.parentId ?? null;

      if (currentParentId === parentId) {
        // Same parent - reorder only
        if (onReorderLibrary) {
          onReorderLibrary(libraryId, index);
        }
      } else {
        // Different parent - move with index
        if (onMoveLibrary) {
          onMoveLibrary(libraryId, parentId, index);
        }
      }
    },
    [onMoveLibrary, onReorderLibrary]
  );

  // Validate drops - prevent circular nesting
  const disableDrop = useCallback(
    ({
      parentNode,
      dragNodes,
    }: {
      parentNode: NodeApi<TreeNodeData>;
      dragNodes: NodeApi<TreeNodeData>[];
      index: number;
    }) => {
      // Check if any drag node is an ancestor of the parent
      for (const dragNode of dragNodes) {
        if (dragNode.isAncestorOf(parentNode)) {
          return true; // Disable drop (circular nesting)
        }
        // Also prevent dropping on self
        if (dragNode.id === parentNode.id) {
          return true;
        }
      }
      return false;
    },
    []
  );

  // All Documents droppable target
  const { isOver: isOverAllDocs, setNodeRef: setAllDocsRef } = useDroppable({
    id: 'all-documents-drop',
    data: {
      type: 'all-documents',
      id: null,
    },
  });

  // Show drag indicator when document is being dragged over
  const showDragIndicator = activeDragData?.type === 'document';

  // Context value for passing delete handler to tree nodes
  const contextValue = useMemo(() => ({ onDeleteLibrary }), [onDeleteLibrary]);

  return (
    <LibraryTreeContext.Provider value={contextValue}>
    <div
      data-testid="library-tree"
      className={`${isMobile ? 'w-full' : compact ? 'w-48 @3xl/docs:w-64 border-r border-gray-200 dark:border-[var(--color-border)]' : 'w-64 border-r border-gray-200 dark:border-[var(--color-border)]'} bg-white dark:bg-[var(--color-bg)] flex flex-col h-full`}
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
        {/* All Documents option - always visible outside tree */}
        <div className={`${isMobile ? 'p-2 pb-0' : 'p-2 pb-0'}`}>
          <button
            ref={setAllDocsRef}
            onClick={() => onSelectLibrary(null)}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-3' : 'px-3 py-2'} rounded-md text-left text-sm mb-2 transition-all ${
              selectedLibraryId === null
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            } ${isMobile ? 'touch-target' : ''} ${
              isOverAllDocs && showDragIndicator ? 'ring-2 ring-blue-400' : ''
            }`}
            data-testid="all-documents-button"
          >
            <FileText className="w-4 h-4" />
            All Documents
            {isOverAllDocs && showDragIndicator && (
              <span className="ml-auto text-xs text-blue-500">Drop to remove from library</span>
            )}
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
          <div
            ref={containerRef}
            data-testid="library-list"
            className="flex-1 overflow-hidden px-2"
          >
            <Tree<TreeNodeData>
              ref={treeRef}
              data={arboristData}
              width="100%"
              height={treeHeight}
              rowHeight={isMobile ? 44 : LIBRARY_ITEM_HEIGHT}
              indent={16}
              paddingTop={4}
              paddingBottom={4}
              initialOpenState={initialOpenState}
              selection={selectedLibraryId ?? undefined}
              onSelect={handleSelect}
              onActivate={handleActivate}
              onToggle={handleToggle}
              onMove={handleMove}
              disableDrop={disableDrop}
              disableMultiSelection
              openByDefault={false}
            >
              {LibraryNode}
            </Tree>
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
    </LibraryTreeContext.Provider>
  );
}
