/**
 * TaskSearchBar - Search input for filtering tasks
 *
 * Features:
 * - Fuzzy search support
 * - Keyboard shortcuts (/ to focus, Escape to clear)
 * - Clear button
 * - Compact mode for mobile
 */

import { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface TaskSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  compact?: boolean;
}

export function TaskSearchBar({
  value,
  onChange,
  onClear,
  compact = false,
}: TaskSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle Escape key to clear search and / to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear search on Escape when input is focused
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        e.preventDefault();
        onClear();
        inputRef.current?.blur();
      }
      // Focus search on / when not in an input/textarea
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClear]);

  return (
    <div className={`relative ${compact ? 'w-full' : 'flex-1 max-w-md'}`} data-testid="task-search-container">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={compact ? "Search..." : "Search tasks... (Press / to focus)"}
        className="w-full pl-9 pr-8 py-2 sm:py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        data-testid="task-search-input"
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-target"
          data-testid="task-search-clear"
          aria-label="Clear search (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
