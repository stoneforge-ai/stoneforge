/**
 * useFileContentSearch Hook - Server-backed File Content Search
 *
 * Provides a hook for searching through file contents in the workspace
 * using the orchestrator-server search API.
 *
 * Features:
 * - Debounced search input
 * - Server-side search for better performance
 * - Regex support (optional)
 * - Case sensitivity toggle
 * - Whole word matching
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDebounce } from './useDebounce';
import { useWorkspace } from '../contexts';

// ============================================================================
// Constants
// ============================================================================

/** Default debounce delay in milliseconds */
export const SEARCH_DEBOUNCE_DELAY = 300;

/** Maximum number of matches to return per file (server-side default) */
export const MAX_MATCHES_PER_FILE = 20;

/** Maximum total matches to return (server-side default) */
export const MAX_TOTAL_MATCHES = 200;

// ============================================================================
// Types
// ============================================================================

/**
 * A single match within a file
 */
export interface FileMatch {
  /** Line number (1-indexed) */
  line: number;
  /** Column position (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Full line content */
  lineContent: string;
  /** Start position of match in line */
  startIndex: number;
  /** End position of match in line */
  endIndex: number;
}

/**
 * Search result for a single file
 */
export interface FileSearchResult {
  /** File path from workspace root */
  path: string;
  /** File name */
  name: string;
  /** All matches in this file */
  matches: FileMatch[];
  /** Total matches in file (may be more than returned if truncated) */
  totalMatches: number;
}

/**
 * Overall search state
 */
export interface FileContentSearchState {
  /** Current search query */
  query: string;
  /** Debounced search query (actual search is performed with this) */
  debouncedQuery: string;
  /** Whether a search is currently in progress */
  isSearching: boolean;
  /** Search results */
  results: FileSearchResult[];
  /** Total number of files searched */
  filesSearched: number;
  /** Total number of files to search */
  totalFiles: number;
  /** Total number of matches found */
  totalMatches: number;
  /** Search progress (0-1) */
  progress: number;
  /** Error message if search failed */
  error: string | null;
  /** Whether search is complete */
  isComplete: boolean;
  /** Time taken to complete search (ms) */
  searchTime: number | null;
}

/**
 * Search options
 */
export interface FileContentSearchOptions {
  /** Whether search is case sensitive (default: false) */
  caseSensitive?: boolean;
  /** Whether to use regex (default: false) */
  useRegex?: boolean;
  /** Whether to search whole words only (default: false) */
  wholeWord?: boolean;
  /** File extensions to include (e.g., ['ts', 'tsx', 'js']) */
  includeExtensions?: string[];
  /** File extensions to exclude */
  excludeExtensions?: string[];
  /** Debounce delay in ms (default: SEARCH_DEBOUNCE_DELAY) */
  debounceDelay?: number;
}

/**
 * Hook return value
 */
export interface UseFileContentSearchReturn extends FileContentSearchState {
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Cancel any ongoing search */
  cancelSearch: () => void;
  /** Clear results and reset state */
  clearResults: () => void;
  /** Current search options */
  options: FileContentSearchOptions;
  /** Update search options */
  setOptions: (options: Partial<FileContentSearchOptions>) => void;
}

// ============================================================================
// Server Response Types
// ============================================================================

interface ServerSearchMatch {
  line: number;
  column: number;
  length: number;
  lineContent: string;
}

interface ServerSearchFileResult {
  path: string;
  matches: ServerSearchMatch[];
}

interface SearchResponse {
  results: ServerSearchFileResult[];
  totalMatches: number;
  truncated: boolean;
  error?: { code: string; message: string };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get file name from path
 */
function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Convert server search result to client format
 */
function convertServerResult(serverResult: ServerSearchFileResult): FileSearchResult {
  const name = getFileName(serverResult.path);
  const matches: FileMatch[] = serverResult.matches.map((m) => ({
    line: m.line,
    column: m.column,
    matchedText: m.lineContent.slice(m.column - 1, m.column - 1 + m.length),
    lineContent: m.lineContent,
    startIndex: m.column - 1,
    endIndex: m.column - 1 + m.length,
  }));

  return {
    path: serverResult.path,
    name,
    matches,
    totalMatches: serverResult.matches.length,
  };
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: FileContentSearchState = {
  query: '',
  debouncedQuery: '',
  isSearching: false,
  results: [],
  filesSearched: 0,
  totalFiles: 0,
  totalMatches: 0,
  progress: 0,
  error: null,
  isComplete: false,
  searchTime: null,
};

const defaultOptions: FileContentSearchOptions = {
  caseSensitive: false,
  useRegex: false,
  wholeWord: false,
  includeExtensions: undefined,
  excludeExtensions: undefined,
  debounceDelay: SEARCH_DEBOUNCE_DELAY,
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for searching file contents via server API
 */
export function useFileContentSearch(
  initialOptions: FileContentSearchOptions = {}
): UseFileContentSearchReturn {
  const { isOpen } = useWorkspace();
  const [state, setState] = useState<FileContentSearchState>(initialState);
  const [options, setOptionsState] = useState<FileContentSearchOptions>({
    ...defaultOptions,
    ...initialOptions,
  });

  // Track abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce the query
  const debouncedQuery = useDebounce(state.query, options.debounceDelay ?? SEARCH_DEBOUNCE_DELAY);

  // Update debouncedQuery in state when it changes
  useEffect(() => {
    setState(prev => ({ ...prev, debouncedQuery }));
  }, [debouncedQuery]);

  /**
   * Set search query
   */
  const setQuery = useCallback((query: string) => {
    setState(prev => ({
      ...prev,
      query,
      isComplete: false,
    }));
  }, []);

  /**
   * Cancel ongoing search
   */
  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isSearching: false,
      isComplete: true,
    }));
  }, []);

  /**
   * Clear results and reset state
   */
  const clearResults = useCallback(() => {
    cancelSearch();
    setState(initialState);
  }, [cancelSearch]);

  /**
   * Update search options
   */
  const setOptions = useCallback((newOptions: Partial<FileContentSearchOptions>) => {
    setOptionsState(prev => ({ ...prev, ...newOptions }));
  }, []);

  /**
   * Perform the search when debouncedQuery changes
   */
  useEffect(() => {
    // Cancel any previous search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't search if no query or workspace not open
    if (!debouncedQuery.trim() || !isOpen) {
      setState(prev => ({
        ...prev,
        results: [],
        isSearching: false,
        filesSearched: 0,
        totalFiles: 0,
        totalMatches: 0,
        progress: 0,
        error: null,
        isComplete: !debouncedQuery.trim(),
        searchTime: null,
      }));
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const runSearch = async () => {
      const startTime = performance.now();

      setState(prev => ({
        ...prev,
        isSearching: true,
        results: [],
        filesSearched: 0,
        totalFiles: 0,
        totalMatches: 0,
        progress: 0,
        error: null,
        isComplete: false,
        searchTime: null,
      }));

      try {
        // Build include/exclude patterns from extensions
        let includePattern: string | undefined;
        let excludePattern: string | undefined;

        if (options.includeExtensions && options.includeExtensions.length > 0) {
          includePattern = `*.{${options.includeExtensions.join(',')}}`;
        }

        if (options.excludeExtensions && options.excludeExtensions.length > 0) {
          excludePattern = `*.{${options.excludeExtensions.join(',')}}`;
        }

        const response = await fetch('/api/workspace/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: debouncedQuery,
            isRegex: options.useRegex ?? false,
            caseSensitive: options.caseSensitive ?? false,
            wholeWord: options.wholeWord ?? false,
            includePattern,
            excludePattern,
            maxResults: MAX_TOTAL_MATCHES,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: { message: 'Search failed' } }));
          throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json() as SearchResponse;

        if (data.error) {
          throw new Error(data.error.message);
        }

        const results = data.results.map(convertServerResult);
        const endTime = performance.now();

        setState(prev => ({
          ...prev,
          results,
          filesSearched: results.length,
          totalFiles: results.length,
          totalMatches: data.totalMatches,
          progress: 1,
          isSearching: false,
          isComplete: true,
          searchTime: endTime - startTime,
          error: data.truncated ? `Search stopped: Maximum ${MAX_TOTAL_MATCHES} matches reached` : null,
        }));
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const endTime = performance.now();
        setState(prev => ({
          ...prev,
          isSearching: false,
          isComplete: true,
          searchTime: endTime - startTime,
          error: error instanceof Error ? error.message : 'Search failed',
        }));
      }
    };

    runSearch();

    // Cleanup
    return () => {
      abortController.abort();
    };
  }, [debouncedQuery, isOpen, options.caseSensitive, options.useRegex, options.wholeWord, options.includeExtensions, options.excludeExtensions]);

  return {
    ...state,
    setQuery,
    cancelSearch,
    clearResults,
    options,
    setOptions,
  };
}

export default useFileContentSearch;
