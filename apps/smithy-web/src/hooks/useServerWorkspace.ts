/**
 * useServerWorkspace Hook - Server-backed Workspace Access
 *
 * Provides a hook for accessing workspace files through the orchestrator-server
 * HTTP API. This replaces the browser's File System Access API for cross-browser
 * compatibility and server-side LSP module resolution support.
 *
 * Features:
 * - Auto-load workspace tree on mount (no user gesture needed)
 * - Read directory contents from server
 * - Read individual file contents via API
 * - Write file content via API
 * - Delete files via API
 * - Rename/move files via API
 * - Full cross-browser support
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMonacoLanguage } from '../lib/language-detection';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a file or directory entry in the workspace.
 * Matches the server's FileEntry type from /api/workspace/tree.
 */
export interface FileEntry {
  /** Unique identifier for the entry (same as path) */
  id: string;
  /** Display name of the file or directory */
  name: string;
  /** Type of entry */
  type: 'file' | 'directory';
  /** Path from workspace root */
  path: string;
  /** File size in bytes (only for files) */
  size?: number;
  /** Last modified timestamp */
  lastModified?: number;
  /** Children entries (only for directories) */
  children?: FileEntry[];
}

/**
 * Result of reading a file from the server.
 */
export interface FileReadResult {
  /** The file content as text */
  content: string;
  /** The file name */
  name: string;
  /** The file path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: number;
  /** Detected language/mime type */
  language?: string;
}

/**
 * Result of writing a file to the server.
 */
export interface FileWriteResult {
  /** Whether the write was successful */
  success: boolean;
  /** The file path that was written */
  path: string;
  /** The number of bytes written */
  bytesWritten: number;
}

/**
 * Result of deleting a file from the server.
 */
export interface FileDeleteResult {
  /** Whether the delete was successful */
  success: boolean;
  /** The file path that was deleted */
  path: string;
}

/**
 * Result of creating a folder on the server.
 */
export interface FolderCreateResult {
  /** Whether the creation was successful */
  success: boolean;
  /** The folder path that was created */
  path: string;
}

/**
 * Result of renaming a file on the server.
 */
export interface FileRenameResult {
  /** Whether the rename was successful */
  success: boolean;
  /** The original file path */
  oldPath: string;
  /** The new file path */
  newPath: string;
}

/**
 * Hook return value - matches the interface consumers expect.
 */
export interface UseServerWorkspaceReturn {
  /** Always true — server is always available (no browser API check needed) */
  isSupported: true;
  /** Whether workspace tree has been loaded */
  isOpen: boolean;
  /** Workspace name (derived from root dir name in tree response) */
  workspaceName: string | null;
  /** Absolute path to the workspace root directory on the server */
  workspaceRoot: string | null;
  /** File tree entries */
  entries: FileEntry[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Load/refresh the workspace tree */
  openWorkspace: () => Promise<void>;
  /** Clear workspace state (no-op for server workspace, kept for interface compat) */
  closeWorkspace: () => void;
  /** Refresh the file tree */
  refreshTree: () => Promise<void>;
  /** Read a file by its entry */
  readFile: (entry: FileEntry) => Promise<FileReadResult>;
  /** Read a file by path */
  readFileByPath: (path: string) => Promise<FileReadResult | null>;
  /** Write file content */
  writeFile: (entry: FileEntry, content: string) => Promise<FileWriteResult>;
  /** Delete a file by path */
  deleteFile: (path: string) => Promise<FileDeleteResult>;
  /** Rename a file */
  renameFile: (oldPath: string, newPath: string) => Promise<FileRenameResult>;
  /** Create a folder (with intermediate directories) */
  createFolder: (path: string) => Promise<FolderCreateResult>;
}

// ============================================================================
// Server response types (matching workspace-files.ts routes)
// ============================================================================

interface ServerFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  children?: ServerFileEntry[];
}

interface TreeResponse {
  entries: ServerFileEntry[];
  root?: string;
  error?: { code: string; message: string };
}

interface FileResponse {
  content: string;
  name: string;
  path: string;
  size: number;
  lastModified: number;
  error?: { code: string; message: string };
}

interface WriteResponse {
  success: boolean;
  path: string;
  bytesWritten: number;
  error?: { code: string; message: string };
}

interface DeleteResponse {
  success: boolean;
  path: string;
  error?: { code: string; message: string };
}

interface RenameResponse {
  success: boolean;
  oldPath: string;
  newPath: string;
  error?: { code: string; message: string };
}

interface MkdirResponse {
  success: boolean;
  path: string;
  error?: { code: string; message: string };
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_TREE_QUERY_KEY = ['workspace', 'tree'];
const TREE_STALE_TIME = 30000; // 30 seconds

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert server entry to client FileEntry format (adds id field).
 */
function convertServerEntry(entry: ServerFileEntry): FileEntry {
  return {
    id: entry.path,
    name: entry.name,
    type: entry.type,
    path: entry.path,
    size: entry.size,
    lastModified: entry.lastModified,
    children: entry.children?.map(convertServerEntry),
  };
}

/**
 * Derive workspace name from the root directory.
 * If entries exist, use the name of the first parent directory or the project name.
 */
function deriveWorkspaceName(entries: FileEntry[]): string | null {
  if (entries.length === 0) return null;
  // The server returns the project root, so we return a fixed name
  return 'Workspace';
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for accessing the workspace file system via server API.
 * Automatically loads the workspace tree on mount.
 */
export function useServerWorkspace(): UseServerWorkspaceReturn {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Fetch workspace tree using React Query
  const {
    data: treeData,
    isLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: WORKSPACE_TREE_QUERY_KEY,
    queryFn: async (): Promise<{ entries: FileEntry[]; root: string | null }> => {
      const response = await fetch('/api/workspace/tree');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to fetch workspace tree' } }));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }
      const data = await response.json() as TreeResponse;
      if (data.error) {
        throw new Error(data.error.message);
      }
      return {
        entries: data.entries.map(convertServerEntry),
        root: data.root ?? null,
      };
    },
    staleTime: TREE_STALE_TIME,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Compute derived state
  const entries = treeData?.entries ?? [];
  const workspaceRoot = treeData?.root ?? null;
  const isOpen = entries.length > 0;
  const workspaceName = deriveWorkspaceName(entries);

  // Update error state from query
  useEffect(() => {
    if (isError && queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Failed to load workspace');
    } else if (!isError) {
      setError(null);
    }
  }, [isError, queryError]);

  /**
   * Open/load the workspace tree (triggers a fetch).
   * This is called automatically on mount, but can be called manually.
   */
  const openWorkspace = useCallback(async () => {
    setError(null);
    try {
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace');
    }
  }, [refetch]);

  /**
   * Close the workspace (no-op for server workspace).
   * Kept for interface compatibility with FSAPI version.
   */
  const closeWorkspace = useCallback(() => {
    // For server workspace, we don't actually close - just clear cache
    queryClient.removeQueries({ queryKey: WORKSPACE_TREE_QUERY_KEY });
  }, [queryClient]);

  /**
   * Refresh the file tree.
   */
  const refreshTree = useCallback(async () => {
    setError(null);
    try {
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh workspace');
    }
  }, [refetch]);

  /**
   * Read a file's content by entry.
   */
  const readFile = useCallback(async (entry: FileEntry): Promise<FileReadResult> => {
    if (entry.type !== 'file') {
      throw new Error('Cannot read content of a directory');
    }

    const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(entry.path)}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Failed to read file' } }));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as FileResponse;
    if (data.error) {
      throw new Error(data.error.message);
    }

    return {
      content: data.content,
      name: data.name,
      path: data.path,
      size: data.size,
      lastModified: data.lastModified,
      language: getMonacoLanguage(data.name),
    };
  }, []);

  /**
   * Read a file by path.
   */
  const readFileByPath = useCallback(async (path: string): Promise<FileReadResult | null> => {
    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to read file' } }));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json() as FileResponse;
      if (data.error) {
        return null;
      }

      return {
        content: data.content,
        name: data.name,
        path: data.path,
        size: data.size,
        lastModified: data.lastModified,
        language: getMonacoLanguage(data.name),
      };
    } catch {
      return null;
    }
  }, []);

  /**
   * Write content to a file.
   */
  const writeFile = useCallback(async (entry: FileEntry, content: string): Promise<FileWriteResult> => {
    if (entry.type !== 'file') {
      throw new Error('Cannot write to a directory');
    }

    const response = await fetch('/api/workspace/file', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: entry.path,
        content,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Failed to write file' } }));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as WriteResponse;
    if (data.error) {
      throw new Error(data.error.message);
    }

    return {
      success: data.success,
      path: data.path,
      bytesWritten: data.bytesWritten,
    };
  }, []);

  /**
   * Delete a file by path.
   */
  const deleteFile = useCallback(async (path: string): Promise<FileDeleteResult> => {
    const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Failed to delete file' } }));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as DeleteResponse;
    if (data.error) {
      throw new Error(data.error.message);
    }

    // Invalidate the workspace tree query to refresh the file tree
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_TREE_QUERY_KEY });

    return {
      success: data.success,
      path: data.path,
    };
  }, [queryClient]);

  /**
   * Rename a file.
   */
  const renameFile = useCallback(async (oldPath: string, newPath: string): Promise<FileRenameResult> => {
    const response = await fetch('/api/workspace/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        oldPath,
        newPath,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Failed to rename file' } }));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as RenameResponse;
    if (data.error) {
      throw new Error(data.error.message);
    }

    // Invalidate the workspace tree query to refresh the file tree
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_TREE_QUERY_KEY });

    return {
      success: data.success,
      oldPath: data.oldPath,
      newPath: data.newPath,
    };
  }, [queryClient]);

  /**
   * Create a folder (with intermediate directories).
   */
  const createFolder = useCallback(async (path: string): Promise<FolderCreateResult> => {
    const response = await fetch('/api/workspace/mkdir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Failed to create folder' } }));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as MkdirResponse;
    if (data.error) {
      throw new Error(data.error.message);
    }

    // Invalidate the workspace tree query to refresh the file tree
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_TREE_QUERY_KEY });

    return {
      success: data.success,
      path: data.path,
    };
  }, [queryClient]);

  return {
    isSupported: true,
    isOpen,
    workspaceName,
    workspaceRoot,
    entries,
    isLoading,
    error,
    openWorkspace,
    closeWorkspace,
    refreshTree,
    readFile,
    readFileByPath,
    writeFile,
    deleteFile,
    renameFile,
    createFolder,
  };
}

export default useServerWorkspace;
