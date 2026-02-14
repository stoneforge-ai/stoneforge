/**
 * MultiSelectDropdown component
 * Dropdown for selecting multiple filter options (actors, element types)
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface MultiSelectDropdownProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  testId: string;
}

export function MultiSelectDropdown({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  testId,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        data-testid={testId}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
          ${selected.length > 0
            ? 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-400'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }
        `}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
        {selected.length > 0 && (
          <span className="ml-0.5 bg-blue-600 text-white text-[10px] px-1.5 rounded-full">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && options.length > 0 && (
        <div
          className="absolute top-full left-0 mt-1 w-48 max-h-60 overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 z-50"
          data-testid={`${testId}-dropdown`}
        >
          <div className="p-1">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => toggleOption(option)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors
                  ${selected.includes(option) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}
                `}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center
                    ${selected.includes(option) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}
                  `}
                >
                  {selected.includes(option) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="truncate">{option}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
