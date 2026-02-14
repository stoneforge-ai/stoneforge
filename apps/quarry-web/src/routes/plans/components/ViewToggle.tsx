/**
 * ViewToggle - Toggle between List and Roadmap views
 */

import { List, GanttChart } from 'lucide-react';
import type { ViewMode } from '../types';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div data-testid="view-toggle" className="flex p-0.5 bg-gray-100 rounded-lg">
      <button
        data-testid="view-toggle-list"
        onClick={() => onViewChange('list')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
          view === 'list'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="List view"
      >
        <List className="w-4 h-4" />
        List
      </button>
      <button
        data-testid="view-toggle-roadmap"
        onClick={() => onViewChange('roadmap')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
          view === 'roadmap'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="Roadmap view"
      >
        <GanttChart className="w-4 h-4" />
        Roadmap
      </button>
    </div>
  );
}
