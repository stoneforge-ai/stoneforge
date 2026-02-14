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
