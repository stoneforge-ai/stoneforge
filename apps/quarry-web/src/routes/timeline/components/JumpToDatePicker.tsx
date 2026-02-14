/**
 * JumpToDatePicker component
 * Date picker for jumping to a specific date in the timeline
 */

import { useRef } from 'react';
import { Calendar, X } from 'lucide-react';
import { formatDate } from '../utils';

interface JumpToDatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
}

export function JumpToDatePicker({ value, onChange }: JumpToDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <button
        onClick={() => inputRef.current?.showPicker?.()}
        data-testid="jump-to-date-button"
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
          ${value
            ? 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-400'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }
        `}
      >
        <Calendar className="w-3.5 h-3.5" />
        {value ? formatDate(value) : 'Jump to date'}
        {value && (
          <X
            className="w-3 h-3 ml-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          />
        )}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute opacity-0 w-0 h-0"
        data-testid="jump-to-date-input"
        aria-label="Jump to date"
      />
    </div>
  );
}
