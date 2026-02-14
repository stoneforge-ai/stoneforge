/**
 * API hooks for the Documents page
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../hooks';
import type {
  LibraryType,
  LibraryWithChildren,
  DocumentType,
  PaginatedResult,
  DocumentLinks,
  DocumentSearchResponse,
  MoveDocumentResult,
  MoveLibraryResult,
} from './types';
import { SEARCH_DEBOUNCE_DELAY, DEFAULT_PAGE_SIZE } from './constants';

/**
 * Hook to search documents by title and content
 */
export function useDocumentSearch(query: string) {
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_DELAY);

  return useQuery<DocumentSearchResponse>({
    queryKey: ['documents', 'search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) {
        return { results: [], query: '' };
      }
      const response = await fetch(`/api/documents/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`);
      if (!response.ok) {
        throw new Error('Failed to search documents');
      }
      return response.json();
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch all libraries (no pagination - loads all upfront)
 */
export function useLibraries() {
  return useQuery<LibraryType[]>({
    queryKey: ['libraries'],
    queryFn: async () => {
      const response = await fetch('/api/libraries?limit=10000&hydrate.description=true');
      if (!response.ok) {
        throw new Error('Failed to fetch libraries');
      }
      const data = await response.json();
      // Handle both array response and paginated response { items: [...] }
      return Array.isArray(data) ? data : (data.items || []);
    },
  });
}

/**
 * Hook to fetch a single library by ID
 */
export function useLibrary(libraryId: string | null) {
  return useQuery<LibraryWithChildren>({
    queryKey: ['libraries', libraryId],
    queryFn: async () => {
      if (!libraryId) throw new Error('No library selected');
      const response = await fetch(`/api/libraries/${libraryId}?hydrate.description=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch library');
      }
      return response.json();
    },
    enabled: !!libraryId,
  });
}

/**
 * Hook to fetch documents in a library
 */
export function useLibraryDocuments(libraryId: string | null) {
  return useQuery<DocumentType[]>({
    queryKey: ['libraries', libraryId, 'documents'],
    queryFn: async () => {
      if (!libraryId) throw new Error('No library selected');
      const response = await fetch(`/api/libraries/${libraryId}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!libraryId,
  });
}

/**
 * Hook for server-side paginated documents (reserved for future use)
 */
export function usePaginatedDocuments(
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE,
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<DocumentType>>({
    queryKey: ['documents', 'paginated', page, pageSize, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        orderBy: 'updated_at',
        orderDir: 'desc',
      });

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
  });
}

/**
 * Hook to fetch a single document by ID
 */
export function useDocument(documentId: string | null) {
  return useQuery<DocumentType>({
    queryKey: ['documents', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('No document selected');
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document');
      }
      return response.json();
    },
    enabled: !!documentId,
  });
}

/**
 * Hook to update a document
 */
export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<DocumentType, 'title' | 'content' | 'contentType' | 'tags' | 'metadata'>>;
    }) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update document');
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

/**
 * Hook to fetch document versions
 */
export function useDocumentVersions(documentId: string | null) {
  return useQuery<DocumentType[]>({
    queryKey: ['documents', documentId, 'versions'],
    queryFn: async () => {
      if (!documentId) throw new Error('No document selected');
      const response = await fetch(`/api/documents/${documentId}/versions`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document versions');
      }
      return response.json();
    },
    enabled: !!documentId,
  });
}

/**
 * Hook to fetch a specific document version
 */
export function useDocumentVersion(documentId: string | null, version: number | null) {
  return useQuery<DocumentType>({
    queryKey: ['documents', documentId, 'versions', version],
    queryFn: async () => {
      if (!documentId || !version) throw new Error('No document or version selected');
      const response = await fetch(`/api/documents/${documentId}/versions/${version}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document version');
      }
      return response.json();
    },
    enabled: !!documentId && !!version,
  });
}

/**
 * Hook to restore a document version
 */
export function useRestoreDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const response = await fetch(`/api/documents/${id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to restore document version');
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id, 'versions'] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

/**
 * Hook to clone a document
 */
export function useCloneDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      createdBy,
      title,
      libraryId,
    }: {
      id: string;
      createdBy: string;
      title?: string;
      libraryId?: string;
    }) => {
      const response = await fetch(`/api/documents/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy, title, libraryId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to clone document');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

/**
 * Hook to fetch document links
 */
export function useDocumentLinks(documentId: string | null) {
  return useQuery<DocumentLinks>({
    queryKey: ['documents', documentId, 'links'],
    queryFn: async () => {
      if (!documentId) throw new Error('No document selected');
      const response = await fetch(`/api/documents/${documentId}/links`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document links');
      }
      return response.json();
    },
    enabled: !!documentId,
  });
}

/**
 * Hook to add a link between documents
 */
export function useAddDocumentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ blockedId, targetDocumentId }: { blockedId: string; targetDocumentId: string }) => {
      const response = await fetch(`/api/documents/${blockedId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDocumentId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to link document');
      }

      return response.json();
    },
    onSuccess: (_data, { blockedId, targetDocumentId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents', blockedId, 'links'] });
      queryClient.invalidateQueries({ queryKey: ['documents', targetDocumentId, 'links'] });
    },
  });
}

/**
 * Hook to remove a link between documents
 */
export function useRemoveDocumentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ blockedId, blockerId }: { blockedId: string; blockerId: string }) => {
      const response = await fetch(`/api/documents/${blockedId}/links/${blockerId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove document link');
      }

      return response.json();
    },
    onSuccess: (_data, { blockedId, blockerId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents', blockedId, 'links'] });
      queryClient.invalidateQueries({ queryKey: ['documents', blockerId, 'links'] });
    },
  });
}

/**
 * Hook to fetch all documents for the link picker (no pagination - loads all upfront)
 */
export function useAllDocumentsForPicker() {
  return useQuery<DocumentType[]>({
    queryKey: ['documents', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/documents?limit=10000');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch documents');
      }
      const data = await response.json();
      return data.items || data;
    },
  });
}

/**
 * Hook to move a document to a library
 */
export function useMoveDocumentToLibrary() {
  const queryClient = useQueryClient();

  return useMutation<
    MoveDocumentResult,
    Error,
    { documentId: string; libraryId: string; actor?: string }
  >({
    mutationFn: async ({ documentId, libraryId, actor }) => {
      const response = await fetch(`/api/documents/${documentId}/library`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId, actor }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to move document');
      }

      return response.json();
    },
    onSuccess: (_data, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

/**
 * Hook to remove a document from its library (move to top-level)
 */
export function useRemoveDocumentFromLibrary() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; documentId: string; removedFromLibrary: string },
    Error,
    { documentId: string }
  >({
    mutationFn: async ({ documentId }) => {
      const response = await fetch(`/api/documents/${documentId}/library`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove document from library');
      }

      return response.json();
    },
    onSuccess: (_data, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

/**
 * Hook to move a library to a new parent (or root level)
 */
export function useMoveLibraryToParent() {
  const queryClient = useQueryClient();

  return useMutation<
    MoveLibraryResult,
    Error,
    { libraryId: string; parentId: string | null; index?: number; actor?: string }
  >({
    mutationFn: async ({ libraryId, parentId, index, actor }) => {
      const response = await fetch(`/api/libraries/${libraryId}/parent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, index, actor }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to move library');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

/**
 * Hook to reorder a library within its current parent
 */
export function useReorderLibrary() {
  const queryClient = useQueryClient();

  return useMutation<
    { libraryId: string; index: number; parentId: string | null },
    Error,
    { libraryId: string; index: number }
  >({
    mutationFn: async ({ libraryId, index }) => {
      const response = await fetch(`/api/libraries/${libraryId}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to reorder library');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}
