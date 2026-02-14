/**
 * QuickFileOpen - Ctrl/Cmd+P quick file open popup
 * Provides fuzzy search for files in the workspace using the server API
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from '@tanstack/react-router';
import {
  Search,
  FileCode,
  FileText,
  Loader2,
  AlertCircle,
  File,
  ChevronRight,
} from 'lucide-react';
import { useWorkspace, type FileEntry } from '../../contexts';

// ============================================================================
// Types
// ============================================================================

interface QuickFileOpenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FlattenedFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  depth: number;
}

// ============================================================================
// File icon helpers
// ============================================================================

function getFileIcon(filename: string): React.ComponentType<{ className?: string }> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const codeExtensions = new Set([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts',
    'json', 'jsonc', 'json5',
    'py', 'pyw', 'pyx',
    'go', 'rs', 'java', 'kt', 'kts',
    'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx',
    'cs', 'php', 'rb', 'swift', 'r',
    'lua', 'pl', 'pm', 'ex', 'exs', 'erl', 'hrl',
    'clj', 'cljs', 'scala', 'vue', 'svelte', 'astro',
    'html', 'htm', 'css', 'scss', 'sass', 'less',
    'yaml', 'yml', 'toml', 'xml', 'svg',
    'sql', 'graphql', 'gql',
    'sh', 'bash', 'zsh', 'fish', 'ps1',
    'dockerfile', 'makefile', 'cmake',
  ]);

  if (codeExtensions.has(ext)) {
    return FileCode;
  }
  return FileText;
}

function getLanguageLabel(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const labels: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    md: 'Markdown',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sql: 'SQL',
    sh: 'Shell',
    toml: 'TOML',
  };
  return labels[ext] || null;
}

// ============================================================================
// Flatten file tree for search
// ============================================================================

function flattenFileTree(entries: FileEntry[], depth = 0): FlattenedFile[] {
  const result: FlattenedFile[] = [];

  for (const entry of entries) {
    result.push({
      id: entry.id,
      name: entry.name,
      path: entry.path,
      type: entry.type,
      depth,
    });

    if (entry.children && entry.children.length > 0) {
      result.push(...flattenFileTree(entry.children, depth + 1));
    }
  }

  return result;
}

// ============================================================================
// Main component
// ============================================================================

export function QuickFileOpen({ open, onOpenChange }: QuickFileOpenProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Get workspace state from context (server-backed, always available)
  const {
    isOpen: isWorkspaceOpen,
    workspaceName,
    entries,
    isLoading,
    error,
  } = useWorkspace();

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Flatten file tree for searching
  const flattenedFiles = useMemo(() => {
    if (!isWorkspaceOpen || entries.length === 0) {
      return [];
    }
    // Only include files, not directories
    return flattenFileTree(entries).filter((f) => f.type === 'file');
  }, [isWorkspaceOpen, entries]);

  // Handle file selection - navigate to editor page with the file selected
  const handleSelectFile = useCallback(
    (file: FlattenedFile) => {
      // Navigate to the editor page with the file path in the URL
      navigate({
        to: '/editor',
        search: { file: file.path },
      });
      onOpenChange(false);
    },
    [navigate, onOpenChange]
  );

  // Get parent directory for display
  const getParentDir = (path: string): string => {
    const parts = path.split('/');
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/');
  };

  if (!open) {
    return null;
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Quick File Open"
      className="fixed inset-0 z-[var(--z-index-modal)] flex items-start justify-center pt-[15vh]"
      data-testid="quick-file-open"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        data-testid="quick-file-open-backdrop"
      />

      {/* Dialog content */}
      <div
        className="relative w-full max-w-2xl bg-[var(--color-bg-elevated)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
        data-testid="quick-file-open-dialog"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)]">
          <Search className="w-5 h-5 text-[var(--color-text-muted)]" />
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={isWorkspaceOpen ? 'Search files by name...' : 'Open a workspace to search files...'}
            className="flex-1 h-14 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none text-base"
            data-testid="quick-file-open-input"
            disabled={!isWorkspaceOpen}
          />
          <div className="flex items-center gap-2">
            {workspaceName && (
              <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2 py-1 rounded max-w-[120px] truncate">
                {workspaceName}
              </span>
            )}
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded">
              ESC
            </kbd>
          </div>
        </div>

        {/* File list */}
        <Command.List
          className="max-h-[400px] overflow-y-auto"
          data-testid="quick-file-open-list"
        >
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
              <span className="ml-2 text-sm text-[var(--color-text-muted)]">Loading workspace...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-3" />
              <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
            </div>
          )}

          {/* No workspace loaded yet */}
          {!isLoading && !error && !isWorkspaceOpen && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <Loader2 className="w-12 h-12 text-[var(--color-text-muted)] mb-4 animate-spin" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Loading Workspace</h3>
              <p className="text-sm text-[var(--color-text-secondary)] max-w-xs">
                The workspace is loading from the server...
              </p>
            </div>
          )}

          {/* Empty state - workspace open but no files */}
          {!isLoading && !error && isWorkspaceOpen && flattenedFiles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <File className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">No Files Found</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                The workspace doesn't contain any readable files.
              </p>
            </div>
          )}

          {/* No search results */}
          {!isLoading && !error && isWorkspaceOpen && flattenedFiles.length > 0 && (
            <Command.Empty className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              No files match your search.
            </Command.Empty>
          )}

          {/* File results */}
          {!isLoading && !error && isWorkspaceOpen && flattenedFiles.length > 0 && (
            <div className="p-2">
              {flattenedFiles.map((file) => {
                const Icon = getFileIcon(file.name);
                const parentDir = getParentDir(file.path);
                const langLabel = getLanguageLabel(file.name);

                return (
                  <Command.Item
                    key={file.id}
                    value={`${file.name} ${file.path}`}
                    onSelect={() => handleSelectFile(file)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] data-[selected=true]:bg-[var(--color-surface-selected)] data-[selected=true]:text-[var(--color-text)] transition-colors duration-100"
                    data-testid={`quick-file-item-${file.id}`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{file.name}</span>
                        {langLabel && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-surface)] text-[var(--color-text-muted)] rounded">
                            {langLabel}
                          </span>
                        )}
                      </div>
                      {parentDir && (
                        <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                          <ChevronRight className="w-3 h-3" />
                          <span>{parentDir}</span>
                        </div>
                      )}
                    </div>
                  </Command.Item>
                );
              })}
            </div>
          )}
        </Command.List>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↵
              </kbd>
              <span>Open file</span>
            </span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
              ⌘P
            </kbd>
            {' '}to toggle
          </div>
        </div>
      </div>
    </Command.Dialog>
  );
}

// ============================================================================
// Hook for global keyboard shortcut
// ============================================================================

export function useQuickFileOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+P or Ctrl+P to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}

export default QuickFileOpen;
