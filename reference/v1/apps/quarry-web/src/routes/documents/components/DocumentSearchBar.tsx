/**
 * DocumentSearchBar - Full-text search across document titles and content
 */

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, FileText } from 'lucide-react';
import { useDocumentSearch } from '../hooks';
import { highlightMatches } from '../utils';

interface DocumentSearchBarProps {
  onSelectDocument: (documentId: string) => void;
}

export function DocumentSearchBar({ onSelectDocument }: DocumentSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchData, isLoading, isFetching } = useDocumentSearch(query);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts: / to focus, Escape to clear/close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        event.preventDefault();
        if (query) {
          setQuery('');
        } else {
          setIsOpen(false);
          inputRef.current?.blur();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleSelectResult = (documentId: string) => {
    onSelectDocument(documentId);
    setQuery('');
    setIsOpen(false);
  };

  const showDropdown = isOpen && query.trim().length > 0;
  const results = searchData?.results || [];
  const showLoading = (isLoading || isFetching) && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative" data-testid="document-search-container">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.trim() && setIsOpen(true)}
          placeholder="Search docs... (/)"
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid="document-search-input"
          aria-label="Search documents"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
            data-testid="document-search-clear"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
          data-testid="document-search-results"
        >
          {showLoading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </div>
          )}

          {!showLoading && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-500 text-center" data-testid="document-search-no-results">
              No documents found for "{query}"
            </div>
          )}

          {!showLoading && results.length > 0 && (
            <div data-testid="document-search-results-list">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectResult(result.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:bg-gray-50 focus:outline-none"
                  data-testid={`document-search-result-${result.id}`}
                >
                  {/* Title with highlight */}
                  <div className="font-medium text-gray-900 text-sm truncate">
                    <FileText className="inline w-4 h-4 text-blue-400 mr-1.5" />
                    {highlightMatches(result.title, query)}
                  </div>

                  {/* Content snippet with highlight */}
                  {result.snippet && (
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2" data-testid={`document-search-snippet-${result.id}`}>
                      {highlightMatches(result.snippet, query)}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span className={`px-1.5 py-0.5 rounded ${
                      result.matchType === 'content' ? 'bg-yellow-100 text-yellow-700' :
                      result.matchType === 'both' ? 'bg-green-100 text-green-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {result.matchType === 'title' ? 'Title match' :
                       result.matchType === 'content' ? 'Content match' : 'Title & content'}
                    </span>
                    <span>{result.contentType}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
