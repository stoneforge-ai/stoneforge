/**
 * EditorSearchPanel - VSCode-style file content search sidebar panel
 *
 * A persistent, always-accessible search panel in the Editor sidebar
 * that provides real-time file content search with result navigation.
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Search,
  FileCode,
  FileText,
  Loader2,
  AlertCircle,
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

export interface EditorSearchPanelProps {
  /** Callback when a search result is selected */
  onSelectResult: (path: string, line: number, column: number) => void;
  /** Optional class name */
  className?: string;
}

export interface EditorSearchPanelRef {
  /** Focus the search input */
  focus: () => void;
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
  const maxLength = 60;
  let displayBefore = before;
  let displayAfter = after;

  if (before.length > 20) {
    displayBefore = '...' + before.slice(-17);
  }
  if (after.length > 30) {
    displayAfter = after.slice(0, 27) + '...';
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
    <span className="font-mono text-xs leading-relaxed">
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

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0" data-testid={`search-result-${result.path}`}>
      {/* File header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors text-left"
        data-testid={`search-result-header-${result.path}`}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
        <span className="text-xs font-medium text-[var(--color-text)] truncate flex-1">
          {result.name}
        </span>
        <span className="text-xs px-1 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded flex-shrink-0">
          {result.totalMatches}
        </span>
      </button>

      {/* Match list */}
      {isExpanded && (
        <div className="bg-[var(--color-surface)]/50">
          {result.matches.map((match, idx) => (
            <button
              key={`${match.line}-${match.column}-${idx}`}
              onClick={() => onSelectMatch(result, match)}
              className="w-full flex items-start gap-1.5 px-2 py-1 pl-7 hover:bg-[var(--color-surface-hover)] transition-colors text-left"
              data-testid={`search-match-${result.path}-${match.line}`}
            >
              <span className="text-xs text-[var(--color-text-muted)] font-mono w-6 text-right flex-shrink-0">
                {match.line}
              </span>
              <HighlightedLine
                lineContent={match.lineContent}
                startIndex={match.startIndex}
                endIndex={match.endIndex}
              />
            </button>
          ))}
          {result.totalMatches > result.matches.length && (
            <div className="px-2 py-1 pl-7 text-xs text-[var(--color-text-muted)] italic">
              +{result.totalMatches - result.matches.length} more...
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
}

function OptionToggle({ active, onClick, icon: Icon, label }: OptionToggleProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center justify-center w-6 h-6 rounded transition-colors
        ${active
          ? 'bg-[var(--color-primary)] text-white'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }
      `}
      title={label}
      data-testid={`search-option-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export const EditorSearchPanel = forwardRef<EditorSearchPanelRef, EditorSearchPanelProps>(
  function EditorSearchPanel({ onSelectResult, className = '' }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

    // Get workspace state from context (server-backed, always available)
    const {
      isOpen: isWorkspaceOpen,
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

    // Expose focus method via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }), []);

    // Auto-expand results when there are few files
    useEffect(() => {
      if (results.length > 0 && results.length <= 3) {
        setExpandedFiles(new Set(results.map(r => r.path)));
      }
    }, [results]);

    // Handle file/match selection - call parent callback
    const handleSelectMatch = useCallback(
      (result: FileSearchResult, match: FileMatch) => {
        onSelectResult(result.path, match.line, match.column);
      },
      [onSelectResult]
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

    // Clear search
    const handleClear = useCallback(() => {
      clearResults();
      setExpandedFiles(new Set());
      inputRef.current?.focus();
    }, [clearResults]);

    const hasQuery = query.trim().length > 0;
    const showProgress = isSearching && totalFiles > 0;
    const showResults = results.length > 0;
    const showNoResults = isComplete && hasQuery && results.length === 0 && !searchError;

    return (
      <div
        className={`flex flex-col h-full overflow-hidden ${className}`}
        data-testid="editor-search-panel"
      >
        {/* Search input area */}
        <div className="flex-shrink-0 p-2 border-b border-[var(--color-border)] space-y-2">
          {/* Search input with clear button */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isWorkspaceOpen ? 'Search...' : 'Open workspace...'}
              className="w-full h-7 pl-7 pr-7 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
              disabled={!isWorkspaceOpen}
              data-testid="editor-search-input"
            />
            {hasQuery && (
              <button
                onClick={handleClear}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                title="Clear search"
                data-testid="editor-search-clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isSearching && (
              <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
            )}
          </div>

          {/* Search options */}
          <div className="flex items-center gap-1">
            <OptionToggle
              active={options.caseSensitive ?? false}
              onClick={toggleCaseSensitive}
              icon={CaseSensitive}
              label="Match Case"
            />
            <OptionToggle
              active={options.wholeWord ?? false}
              onClick={toggleWholeWord}
              icon={WholeWord}
              label="Whole Word"
            />
            <OptionToggle
              active={options.useRegex ?? false}
              onClick={toggleRegex}
              icon={Regex}
              label="Use Regex"
            />
          </div>

          {/* Progress indicator */}
          {showProgress && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <div className="flex-1 h-1 bg-[var(--color-surface)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-primary)] transition-all duration-200"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="flex-shrink-0">{filesSearched}/{totalFiles}</span>
            </div>
          )}

          {/* Results summary */}
          {isComplete && hasQuery && !isSearching && (
            <div className="text-xs text-[var(--color-text-muted)]">
              {totalMatches} {totalMatches === 1 ? 'result' : 'results'} in {results.length} {results.length === 1 ? 'file' : 'files'}
              {searchTime !== null && ` (${Math.round(searchTime)}ms)`}
            </div>
          )}
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto" data-testid="editor-search-results">
          {/* Workspace loading state */}
          {isWorkspaceLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
            </div>
          )}

          {/* Workspace error state */}
          {workspaceError && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-3">
              <AlertCircle className="w-6 h-6 text-[var(--color-danger)] mb-2" />
              <p className="text-xs text-[var(--color-text-secondary)]">{workspaceError}</p>
            </div>
          )}

          {/* Search error state */}
          {searchError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {/* No workspace loaded yet */}
          {!isWorkspaceLoading && !workspaceError && !isWorkspaceOpen && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-3">
              <Loader2 className="w-8 h-8 text-[var(--color-text-muted)] mb-3 animate-spin" />
              <h4 className="text-sm font-medium text-[var(--color-text)] mb-1">Loading...</h4>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Workspace is loading
              </p>
            </div>
          )}

          {/* Empty search state */}
          {isWorkspaceOpen && !hasQuery && !isSearching && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-3">
              <Search className="w-8 h-8 text-[var(--color-text-muted)] mb-3" />
              <h4 className="text-sm font-medium text-[var(--color-text)] mb-1">Search Files</h4>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Type to search in all files
              </p>
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-3">
              <X className="w-8 h-8 text-[var(--color-text-muted)] mb-3" />
              <h4 className="text-sm font-medium text-[var(--color-text)] mb-1">No Results</h4>
              <p className="text-xs text-[var(--color-text-secondary)]">
                No files contain "{query}"
              </p>
            </div>
          )}

          {/* Search results */}
          {showResults && (
            <div>
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
        </div>
      </div>
    );
  }
);

export default EditorSearchPanel;
