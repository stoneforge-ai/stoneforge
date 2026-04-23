/**
 * SortByDropdown - Sort field selector with direction toggle
 *
 * Features:
 * - Primary sort selection
 * - Secondary sort support
 * - Ascending/descending toggle
 * - Visual feedback for current selection
 */

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import type { SortField, SortDirection } from '../../lib/task-constants';
import { SORT_OPTIONS } from '../../lib/task-constants';

interface SortByDropdownProps {
  sortField: SortField;
  sortDirection: SortDirection;
  secondarySort: SortField | null;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  onSecondarySortChange: (field: SortField | null) => void;
}

export function SortByDropdown({
  sortField,
  sortDirection,
  secondarySort,
  onSortFieldChange,
  onSortDirectionChange,
  onSecondarySortChange,
}: SortByDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowSecondary(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = SORT_OPTIONS.find(opt => opt.value === sortField) || SORT_OPTIONS[0];
  const secondaryOption = secondarySort ? SORT_OPTIONS.find(opt => opt.value === secondarySort) : null;

  // Filter out the primary sort from secondary options
  const secondarySortOptions = SORT_OPTIONS.filter(opt => opt.value !== sortField);

  return (
    <div className="relative flex items-center gap-1" ref={dropdownRef}>
      {/* Main sort dropdown */}
      <button
        onClick={() => { setIsOpen(!isOpen); setShowSecondary(false); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors border border-[var(--color-border)]"
        data-testid="sort-by-dropdown"
      >
        <ArrowUpDown className="w-4 h-4" />
        <span>Sort: {selectedOption.label}</span>
        {secondaryOption && (
          <span className="text-[var(--color-text-tertiary)]">+ {secondaryOption.label}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Ascending/descending toggle */}
      <button
        onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
        className={`inline-flex items-center justify-center w-8 h-8 text-[var(--color-text-secondary)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors border border-[var(--color-border)] ${
          sortDirection === 'asc' ? 'text-[var(--color-primary)]' : ''
        }`}
        data-testid="sort-direction-toggle"
        aria-label={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
        title={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
      >
        {sortDirection === 'asc' ? (
          <ArrowUp className="w-4 h-4" />
        ) : (
          <ArrowDown className="w-4 h-4" />
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && !showSecondary && (
        <div
          className="absolute z-20 mt-1 top-full left-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-48"
          data-testid="sort-by-options"
        >
          <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] uppercase">Primary Sort</div>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSortFieldChange(option.value);
                // If secondary sort is same as new primary, clear it
                if (secondarySort === option.value) {
                  onSecondarySortChange(null);
                }
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)] flex items-center justify-between ${
                sortField === option.value ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'
              }`}
              data-testid={`sort-by-option-${option.value}`}
            >
              <span>{option.label}</span>
              {sortField === option.value && (
                <span className="text-[var(--color-primary)]">✓</span>
              )}
            </button>
          ))}
          <div className="border-t border-[var(--color-border)] mt-1 pt-1">
            <button
              onClick={() => setShowSecondary(true)}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] flex items-center justify-between"
              data-testid="sort-secondary-button"
            >
              <span>Secondary sort...</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Secondary sort submenu */}
      {isOpen && showSecondary && (
        <div
          className="absolute z-20 mt-1 top-full left-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-48"
          data-testid="sort-secondary-options"
        >
          <button
            onClick={() => setShowSecondary(false)}
            className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] flex items-center gap-1"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            <span>Back</span>
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)] uppercase">Secondary Sort</div>
          <button
            onClick={() => {
              onSecondarySortChange(null);
              setIsOpen(false);
              setShowSecondary(false);
            }}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)] flex items-center justify-between ${
              secondarySort === null ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'
            }`}
            data-testid="sort-secondary-option-none"
          >
            <span>None</span>
            {secondarySort === null && (
              <span className="text-[var(--color-primary)]">✓</span>
            )}
          </button>
          {secondarySortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSecondarySortChange(option.value);
                setIsOpen(false);
                setShowSecondary(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)] flex items-center justify-between ${
                secondarySort === option.value ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'
              }`}
              data-testid={`sort-secondary-option-${option.value}`}
            >
              <span>{option.label}</span>
              {secondarySort === option.value && (
                <span className="text-[var(--color-primary)]">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
