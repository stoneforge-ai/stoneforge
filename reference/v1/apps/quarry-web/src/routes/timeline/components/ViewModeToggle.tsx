/**
 * ViewModeToggle component
 * Toggle between list and horizontal timeline views
 */

import { List, Clock } from 'lucide-react';
import type { TimelineViewMode } from '../types';

interface ViewModeToggleProps {
  mode: TimelineViewMode;
  onChange: (mode: TimelineViewMode) => void;
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5" data-testid="view-mode-toggle">
      <button
        onClick={() => onChange('list')}
        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-colors ${
          mode === 'list'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
        data-testid="view-mode-list"
      >
        <List className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        <span className="hidden xs:inline">List</span>
      </button>
      <button
        onClick={() => onChange('horizontal')}
        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-colors ${
          mode === 'horizontal'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
        data-testid="view-mode-horizontal"
      >
        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        <span className="hidden xs:inline">Timeline</span>
      </button>
    </div>
  );
}
