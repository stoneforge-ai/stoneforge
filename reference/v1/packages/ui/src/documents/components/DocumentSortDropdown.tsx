/**
 * DocumentSortDropdown - Sort dropdown with direction toggle
 */

import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronDown } from 'lucide-react';
import type { DocumentSortField, SortDirection } from '../types';
import { DOCUMENT_SORT_OPTIONS } from '../constants';
import { getDefaultDirection } from '../utils';

interface DocumentSortDropdownProps {
  sortField: DocumentSortField;
  sortDirection: SortDirection;
  onSortFieldChange: (field: DocumentSortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
}

export function DocumentSortDropdown({
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
}: DocumentSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentOption = DOCUMENT_SORT_OPTIONS.find((o) => o.value === sortField);

  const handleFieldChange = (field: DocumentSortField) => {
    if (field === sortField) {
      // If same field, toggle direction
      onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, use its default direction
      onSortFieldChange(field);
      onSortDirectionChange(getDefaultDirection(field));
    }
    setIsOpen(false);
  };

  const toggleDirection = () => {
    onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className="flex items-center gap-1" data-testid="document-sort-dropdown">
      {/* Sort field dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
          data-testid="sort-field-trigger"
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>Sort: {currentOption?.label || 'Updated'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <>
            {/* Backdrop to close dropdown */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute left-0 top-full mt-1 w-40 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
              {DOCUMENT_SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleFieldChange(option.value)}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  data-testid={`sort-option-${option.value}`}
                >
                  <span>{option.label}</span>
                  {sortField === option.value && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Direction toggle button */}
      <button
        onClick={toggleDirection}
        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        data-testid="sort-direction-toggle"
      >
        {sortDirection === 'asc' ? (
          <ArrowUp className="w-4 h-4" />
        ) : (
          <ArrowDown className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
