/**
 * FileContentSearch - Cmd/Ctrl+Shift+F file content search popup
 * Provides real-time search through file contents in the workspace
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from '@tanstack/react-router';
import {
  Search,
  FileCode,
  FileText,
  Loader2,
  AlertCircle,
  Settings2,
  X,
  ChevronRight,
  ChevronDown,
  CaseSensitive,
  Regex,
  WholeWord,
} from 'lucide-react';
import { useWorkspace } from '../../contexts';
import {
  useFileContentSearch,
  type FileSearchResult,
  type FileMatch,
} from '../../hooks';

// ============================================================================
// Types
// ============================================================================

interface FileContentSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// File icon helper
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

// ============================================================================
// Match Highlight Component
// ============================================================================

interface HighlightedLineProps {
  lineContent: string;
  startIndex: number;
  endIndex: number;
}

function HighlightedLine({ lineContent, startIndex, endIndex }: HighlightedLineProps) {
  const before = lineContent.slice(0, startIndex);
  const match = lineContent.slice(startIndex, endIndex);
  const after = lineContent.slice(endIndex);

  // Truncate long lines
  const maxLength = 100;
  let displayBefore = before;
  let displayAfter = after;

  if (before.length > 30) {
    displayBefore = '...' + before.slice(-27);
  }
  if (after.length > 50) {
    displayAfter = after.slice(0, 47) + '...';
  }

  // Ensure total length doesn't exceed maxLength
  const totalLength = displayBefore.length + match.length + displayAfter.length;
  if (totalLength > maxLength) {
    const excess = totalLength - maxLength;
    if (displayAfter.length > excess) {
      displayAfter = displayAfter.slice(0, displayAfter.length - excess - 3) + '...';
    }
  }

  return (
    <span className="font-mono text-xs">
      <span className="text-[var(--color-text-muted)]">{displayBefore}</span>
      <span className="bg-[var(--color-warning)]/30 text-[var(--color-text)] font-semibold px-0.5 rounded">
        {match}
      </span>
      <span className="text-[var(--color-text-muted)]">{displayAfter}</span>
    </span>
  );
}

// ============================================================================
// Search Result Item Component
// ============================================================================

interface SearchResultItemProps {
  result: FileSearchResult;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectMatch: (result: FileSearchResult, match: FileMatch) => void;
}

function SearchResultItem({
  result,
  isExpanded,
  onToggleExpand,
  onSelectMatch,
}: SearchResultItemProps) {
  const Icon = getFileIcon(result.name);
  const parentDir = result.path.includes('/')
    ? result.path.split('/').slice(0, -1).join('/')
    : '';

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      {/* File header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-hover)] transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
        )}
        <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--color-surface)] text-[var(--color-text-muted)] flex-shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text)] truncate">
              {result.name}
            </span>
            <span className="text-xs px-1.5 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded">
              {result.totalMatches} {result.totalMatches === 1 ? 'match' : 'matches'}
            </span>
          </div>
          {parentDir && (
            <div className="text-xs text-[var(--color-text-muted)] truncate">
              {parentDir}
            </div>
          )}
        </div>
      </button>

      {/* Match list */}
      {isExpanded && (
        <div className="bg-[var(--color-surface)]/50">
          {result.matches.map((match, idx) => (
            <button
              key={`${match.line}-${match.column}-${idx}`}
              onClick={() => onSelectMatch(result, match)}
              className="w-full flex items-start gap-2 px-3 py-1.5 pl-11 hover:bg-[var(--color-surface-hover)] transition-colors text-left"
            >
              <span className="text-xs text-[var(--color-text-muted)] font-mono w-8 text-right flex-shrink-0">
                {match.line}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] mr-1">:</span>
              <HighlightedLine
                lineContent={match.lineContent}
                startIndex={match.startIndex}
                endIndex={match.endIndex}
              />
            </button>
          ))}
          {result.totalMatches > result.matches.length && (
            <div className="px-3 py-1.5 pl-11 text-xs text-[var(--color-text-muted)] italic">
              +{result.totalMatches - result.matches.length} more matches...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Search Options Toggle Button
// ============================================================================

interface OptionToggleProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortLabel?: string;
}

function OptionToggle({ active, onClick, icon: Icon, label, shortLabel }: OptionToggleProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
        ${active
          ? 'bg-[var(--color-primary)] text-white'
          : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }
      `}
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
      {shortLabel && <span className="hidden sm:inline">{shortLabel}</span>}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FileContentSearch({ open, onOpenChange }: FileContentSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Get workspace state from context (server-backed, always available)
  const {
    isOpen: isWorkspaceOpen,
    workspaceName,
    isLoading: isWorkspaceLoading,
    error: workspaceError,
  } = useWorkspace();

  // File content search hook
  const {
    query,
    setQuery,
    isSearching,
    results,
    filesSearched,
    totalFiles,
    totalMatches,
    progress,
    error: searchError,
    isComplete,
    searchTime,
    options,
    setOptions,
    clearResults,
  } = useFileContentSearch();

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      clearResults();
      setExpandedFiles(new Set());
    }
  }, [open, clearResults]);

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Auto-expand results when there are few files
  useEffect(() => {
    if (results.length > 0 && results.length <= 5) {
      setExpandedFiles(new Set(results.map(r => r.path)));
    }
  }, [results]);

  // Handle file/match selection - navigate to editor
  const handleSelectMatch = useCallback(
    (result: FileSearchResult, match: FileMatch) => {
      navigate({
        to: '/editor',
        search: {
          file: result.path,
          line: match.line,
          column: match.column,
        },
      });
      onOpenChange(false);
    },
    [navigate, onOpenChange]
  );

  // Toggle file expansion
  const toggleExpand = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Toggle search options
  const toggleCaseSensitive = useCallback(() => {
    setOptions({ caseSensitive: !options.caseSensitive });
  }, [options.caseSensitive, setOptions]);

  const toggleRegex = useCallback(() => {
    setOptions({ useRegex: !options.useRegex });
  }, [options.useRegex, setOptions]);

  const toggleWholeWord = useCallback(() => {
    setOptions({ wholeWord: !options.wholeWord });
  }, [options.wholeWord, setOptions]);

  if (!open) {
    return null;
  }

  const hasQuery = query.trim().length > 0;
  const showProgress = isSearching && totalFiles > 0;
  const showResults = results.length > 0;
  const showNoResults = isComplete && hasQuery && results.length === 0 && !searchError;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search in Files"
      className="fixed inset-0 z-[var(--z-index-modal)] flex items-start justify-center pt-[10vh]"
      data-testid="file-content-search"
      shouldFilter={false}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        data-testid="file-content-search-backdrop"
      />

      {/* Dialog content */}
      <div
        className="relative w-full max-w-3xl bg-[var(--color-bg-elevated)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
        data-testid="file-content-search-dialog"
      >
        {/* Search header */}
        <div className="border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3 px-4">
            <Search className="w-5 h-5 text-[var(--color-text-muted)]" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder={isWorkspaceOpen ? 'Search in files...' : 'Open a workspace to search...'}
              className="flex-1 h-14 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none text-base"
              data-testid="file-content-search-input"
              disabled={!isWorkspaceOpen}
            />
            {isSearching && (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
            )}
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

          {/* Search options bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]/50">
            <Settings2 className="w-4 h-4 text-[var(--color-text-muted)]" />
            <OptionToggle
              active={options.caseSensitive ?? false}
              onClick={toggleCaseSensitive}
              icon={CaseSensitive}
              label="Match Case"
              shortLabel="Aa"
            />
            <OptionToggle
              active={options.wholeWord ?? false}
              onClick={toggleWholeWord}
              icon={WholeWord}
              label="Whole Word"
              shortLabel="W"
            />
            <OptionToggle
              active={options.useRegex ?? false}
              onClick={toggleRegex}
              icon={Regex}
              label="Use Regular Expression"
              shortLabel=".*"
            />
            <div className="flex-1" />
            {showProgress && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <span>
                  {filesSearched}/{totalFiles} files
                </span>
                <div className="w-16 h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-primary)] transition-all duration-200"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            )}
            {isComplete && hasQuery && !isSearching && (
              <div className="text-xs text-[var(--color-text-muted)]">
                {totalMatches} {totalMatches === 1 ? 'result' : 'results'}
                {searchTime !== null && ` in ${Math.round(searchTime)}ms`}
              </div>
            )}
          </div>
        </div>

        {/* Results list */}
        <Command.List
          className="max-h-[60vh] overflow-y-auto"
          data-testid="file-content-search-list"
        >
          {/* Workspace loading state */}
          {isWorkspaceLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
              <span className="ml-2 text-sm text-[var(--color-text-muted)]">Loading workspace...</span>
            </div>
          )}

          {/* Workspace error state */}
          {workspaceError && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-3" />
              <p className="text-sm text-[var(--color-text-secondary)]">{workspaceError}</p>
            </div>
          )}

          {/* Search error state */}
          {searchError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {/* No workspace open - loading in progress */}
          {!isWorkspaceLoading && !workspaceError && !isWorkspaceOpen && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <Loader2 className="w-12 h-12 text-[var(--color-text-muted)] mb-4 animate-spin" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Loading Workspace</h3>
              <p className="text-sm text-[var(--color-text-secondary)] max-w-xs">
                The workspace is loading from the server...
              </p>
            </div>
          )}

          {/* Empty search state */}
          {isWorkspaceOpen && !hasQuery && !isSearching && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <Search className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Search in Files</h3>
              <p className="text-sm text-[var(--color-text-secondary)] max-w-xs">
                Type to search for text across all files in your workspace.
              </p>
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <X className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">No Results Found</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                No files contain "{query}"
              </p>
            </div>
          )}

          {/* Search results */}
          {showResults && (
            <div className="divide-y divide-[var(--color-border)]">
              {results.map((result) => (
                <SearchResultItem
                  key={result.path}
                  result={result}
                  isExpanded={expandedFiles.has(result.path)}
                  onToggleExpand={() => toggleExpand(result.path)}
                  onSelectMatch={handleSelectMatch}
                />
              ))}
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
              <span>Go to line</span>
            </span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
              ⌘⇧F
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

export function useFileContentSearchShortcut() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+F or Ctrl+Shift+F to open
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        // Don't open the modal if we're on the Editor page - it has its own search panel
        if (window.location.pathname === '/editor') {
          return;
        }
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}

export default FileContentSearch;
