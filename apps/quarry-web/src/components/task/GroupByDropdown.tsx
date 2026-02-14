/**
 * GroupByDropdown - Group tasks by field selector
 *
 * Features:
 * - Group by status, priority, assignee, type, or tags
 * - Visual feedback for current selection
 */

import { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown } from 'lucide-react';
import type { GroupByField } from '../../lib/task-constants';
import { GROUP_BY_OPTIONS } from '../../lib/task-constants';

interface GroupByDropdownProps {
  groupBy: GroupByField;
  onGroupByChange: (groupBy: GroupByField) => void;
}

export function GroupByDropdown({
  groupBy,
  onGroupByChange,
}: GroupByDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = GROUP_BY_OPTIONS.find(opt => opt.value === groupBy) || GROUP_BY_OPTIONS[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        data-testid="group-by-dropdown"
      >
        <Layers className="w-4 h-4" />
        <span>Group: {selectedOption.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div
          className="absolute z-20 mt-1 right-0 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-40"
          data-testid="group-by-options"
        >
          {GROUP_BY_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onGroupByChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${
                groupBy === option.value ? 'text-blue-600 font-medium' : 'text-gray-700'
              }`}
              data-testid={`group-by-option-${option.value}`}
            >
              <span>{option.label}</span>
              {groupBy === option.value && (
                <span className="text-blue-600">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
