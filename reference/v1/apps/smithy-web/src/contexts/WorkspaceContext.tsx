/**
 * WorkspaceContext - Global context for server-backed workspace file access
 *
 * Provides access to the workspace file system via the orchestrator-server API,
 * allowing components to browse, read, and write files from the project workspace.
 */

import { createContext, useContext, ReactNode } from 'react';
import {
  useServerWorkspace,
  type UseServerWorkspaceReturn,
  type FileEntry,
  type FileReadResult,
  type FileWriteResult,
  type FileDeleteResult,
  type FileRenameResult,
  type FolderCreateResult,
} from '../hooks/useServerWorkspace';

// ============================================================================
// Context
// ============================================================================

const WorkspaceContext = createContext<UseServerWorkspaceReturn | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface WorkspaceProviderProps {
  children: ReactNode;
}

/**
 * Provider component for workspace file system access
 */
export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const serverWorkspace = useServerWorkspace();

  return (
    <WorkspaceContext.Provider value={serverWorkspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the workspace file system context
 *
 * @throws Error if used outside of WorkspaceProvider
 */
export function useWorkspace(): UseServerWorkspaceReturn {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }

  return context;
}

// ============================================================================
// Re-exports for convenience
// Maintain backwards compatibility by exporting FileEntry as FileSystemEntry alias
// ============================================================================

/** @deprecated Use FileEntry instead */
export type FileSystemEntry = FileEntry;

export type { FileEntry, FileReadResult, FileWriteResult, FileDeleteResult, FileRenameResult, FolderCreateResult, UseServerWorkspaceReturn };
