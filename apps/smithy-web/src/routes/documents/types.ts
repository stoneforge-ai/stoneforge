/**
 * Types for the Documents page
 */

export interface LibraryType {
  id: string;
  name: string;
  type: 'library';
  descriptionRef?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  parentId: string | null;
  metadata?: {
    sortIndex?: number;
    [key: string]: unknown;
  };
}

export interface LibraryTreeNode extends LibraryType {
  children: LibraryTreeNode[];
}

export interface FlatLibraryItem {
  node: LibraryTreeNode;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export interface DocumentType {
  id: string;
  type: 'document';
  title?: string;
  content?: string;
  contentType: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  metadata?: {
    icon?: string;
    [key: string]: unknown;
  };
}

export interface LibraryWithChildren extends LibraryType {
  _subLibraries?: LibraryType[];
  _documents?: DocumentType[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface DocumentLinks {
  outgoing: DocumentType[];
  incoming: DocumentType[];
}

export interface DocumentSearchResult {
  id: string;
  title: string;
  contentType: string;
  matchType: 'title' | 'content' | 'both';
  snippet?: string;
  updatedAt: string;
}

export interface DocumentSearchResponse {
  results: DocumentSearchResult[];
  query: string;
}

/**
 * Drag-and-drop types
 */
export type DragItemType = 'document' | 'library';

export interface DragData {
  type: DragItemType;
  id: string;
  /** For documents: current library ID (null if at top-level) */
  sourceLibraryId?: string | null;
  /** For libraries: current parent ID (null if root) */
  sourceParentId?: string | null;
  /** Display name for drag overlay */
  name: string;
}

export interface DropTarget {
  type: 'library' | 'all-documents' | 'root';
  id: string | null;
}

export interface MoveOperation {
  dragData: DragData;
  dropTarget: DropTarget;
}

/**
 * React-arborist tree node type
 * Used to represent both libraries and documents in the tree
 */
export interface ArboristTreeNode {
  id: string;
  name: string;
  /** 'library' or 'document' */
  nodeType: 'library' | 'document';
  /** Original data for library or document */
  data: LibraryType | DocumentType;
  children?: ArboristTreeNode[];
}

/**
 * Move result for API responses
 */
export interface MoveDocumentResult {
  documentId: string;
  libraryId: string | null;
  previousLibraryId: string | null;
}

export interface MoveLibraryResult {
  libraryId: string;
  parentId: string | null;
  previousParentId: string | null;
}
