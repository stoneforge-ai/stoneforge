/**
 * ResponsiveSortDropdown - Responsive sort control for data lists
 *
 * Features:
 * - Desktop: Inline sort indicator with toggle on click
 * - Mobile: Full dropdown with clear labels
 * - Touch-friendly 44px tap targets on mobile
 * - Consistent sort direction toggle behavior
 * - Dark mode support
 */

import { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronDown } from 'lucide-react';
import { useIsMobile } from '../../hooks/useBreakpoint';

export interface SortOption<T extends string = string> {
  value: T;
  label: string;
}

export interface ResponsiveSortDropdownProps<T extends string = string> {
  /** Available sort fields */
  options: SortOption<T>[];
  /** Currently selected sort field */
  sortBy: T;
  /** Sort direction */
  sortDirection: 'asc' | 'desc';
  /** Called when sort field or direction changes */
  onSortChange: (sortBy: T, direction: 'asc' | 'desc') => void;
  /** Label for accessibility */
  ariaLabel?: string;
  /** Test ID prefix */
  testId?: string;
}

export function ResponsiveSortDropdown<T extends string = string>({
  options,
  sortBy,
  sortDirection,
  onSortChange,
  ariaLabel = 'Sort by',
  testId = 'sort-dropdown',
}: ResponsiveSortDropdownProps<T>) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === sortBy) || options[0];

  const handleOptionClick = (value: T) => {
    if (value === sortBy) {
      // Same field - toggle direction
      onSortChange(value, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Different field - default to descending
      onSortChange(value, 'desc');
    }
    setIsOpen(false);
  };

  const toggleDirection = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc');
  };

  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  // Mobile layout: Full dropdown button
  if (isMobile) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-700 transition-colors touch-target"
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          data-testid={`${testId}-button`}
        >
          <ArrowUpDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="truncate max-w-[100px]">{selectedOption.label}</span>
          <SortIcon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        </button>

        {isOpen && (
          <div
            className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1"
            role="listbox"
            aria-label={ariaLabel}
            data-testid={`${testId}-menu`}
          >
            {/* Direction toggle */}
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={toggleDirection}
                className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                data-testid={`${testId}-direction`}
              >
                <span>Direction</span>
                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                  <SortIcon className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>

            {/* Sort options */}
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleOptionClick(option.value)}
                className={`flex items-center justify-between w-full px-3 py-2.5 min-h-[44px] text-sm text-left transition-colors ${
                  option.value === sortBy
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                role="option"
                aria-selected={option.value === sortBy}
                data-testid={`${testId}-option-${option.value}`}
              >
                <span>{option.label}</span>
                {option.value === sortBy && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Desktop/tablet layout: Compact dropdown
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        data-testid={`${testId}-button`}
      >
        <span className="text-gray-500 dark:text-gray-400">Sort:</span>
        <span className="font-medium">{selectedOption.label}</span>
        <SortIcon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 py-1"
          role="listbox"
          aria-label={ariaLabel}
          data-testid={`${testId}-menu`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleOptionClick(option.value)}
              className={`flex items-center justify-between w-full px-3 py-1.5 text-sm text-left transition-colors ${
                option.value === sortBy
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              role="option"
              aria-selected={option.value === sortBy}
              data-testid={`${testId}-option-${option.value}`}
            >
              <span>{option.label}</span>
              {option.value === sortBy && (
                <div className="flex items-center gap-1">
                  <SortIcon className="w-3.5 h-3.5" />
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
