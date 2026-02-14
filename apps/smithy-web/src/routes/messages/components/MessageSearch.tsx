/**
 * Message search components (TB103)
 */

import { useState, useEffect, useRef } from 'react';
import { Loader2, Search, XCircle } from 'lucide-react';
import { EntityLink } from '@stoneforge/ui/domain';
import { useMessageSearch } from '../../../api/hooks/useMessages';
import { highlightSearchMatch } from '../../../lib/message-content';
import type { MessageSearchResult } from '../types';

// ============================================================================
// MessageSearch (wrapper with input and dropdown)
// ============================================================================

interface MessageSearchProps {
  channelId: string;
  onResultClick: (result: MessageSearchResult) => void;
  isMobile?: boolean;
}

export function MessageSearch({ channelId, onResultClick, isMobile = false }: MessageSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (messageId: string) => {
    // Find the full result from the dropdown
    const result: MessageSearchResult = {
      id: messageId,
      channelId,
      sender: '',
      content: '',
      snippet: '',
      createdAt: '',
      threadId: null,
    };
    onResultClick(result);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsOpen(e.target.value.trim().length > 0);
  };

  const handleClear = () => {
    setSearchQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(searchQuery.trim().length > 0)}
          placeholder="Search messages..."
          className={`w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isMobile ? 'touch-target' : ''
          }`}
          data-testid="message-search-input"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            data-testid="message-search-clear"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
      {isOpen && (
        <MessageSearchDropdown
          searchQuery={searchQuery}
          channelId={channelId}
          onSelectResult={handleSelectResult}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// MessageSearchDropdown
// ============================================================================

interface MessageSearchDropdownProps {
  searchQuery: string;
  channelId: string;
  onSelectResult: (messageId: string) => void;
  onClose: () => void;
}

export function MessageSearchDropdown({
  searchQuery,
  channelId,
  onSelectResult,
  onClose,
}: MessageSearchDropdownProps) {
  const { data: searchResponse, isLoading } = useMessageSearch(searchQuery, channelId);
  const results = searchResponse?.results || [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelectResult(results[selectedIndex].id);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, onSelectResult, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!searchQuery.trim()) {
    return null;
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div
      data-testid="message-search-dropdown"
      className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-hidden"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6" data-testid="message-search-loading">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Searching...</span>
        </div>
      ) : results.length === 0 ? (
        <div className="py-6 text-center" data-testid="message-search-empty">
          <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No messages found</p>
          <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
          <div
            ref={resultsRef}
            className="overflow-y-auto max-h-64"
            data-testid="message-search-results"
          >
            {results.map((result, index) => (
              <button
                key={result.id}
                onClick={() => {
                  onSelectResult(result.id);
                  onClose();
                }}
                className={`w-full text-left px-3 py-2 flex items-start gap-3 transition-colors ${
                  index === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
                data-testid={`message-search-result-${result.id}`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-medium text-xs">
                    {result.sender.slice(-2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <EntityLink
                      entityRef={result.sender}
                      className="font-medium text-sm"
                    />
                    <span className="text-xs text-gray-400">{formatTime(result.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate mt-0.5">
                    {highlightSearchMatch(result.snippet, searchQuery)}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">↑</kbd>{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">↓</kbd> navigate{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Enter</kbd> select{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Esc</kbd> close
          </div>
        </>
      )}
    </div>
  );
}
