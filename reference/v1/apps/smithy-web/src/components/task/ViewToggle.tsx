/**
 * ViewToggle - Toggle between list and kanban view modes
 *
 * A compact toggle button group for switching between task view modes.
 * Supports keyboard shortcuts (V L for list, V K for kanban).
 */

import { List, LayoutGrid } from 'lucide-react';
import type { ViewMode } from '../../lib/task-constants';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div
      className="flex items-center bg-[var(--color-surface-elevated)] rounded-md p-0.5 border border-[var(--color-border)]"
      data-testid="tasks-view-toggle"
    >
      <button
        onClick={() => onViewChange('list')}
        className={`inline-flex items-center justify-center px-2 py-1.5 text-sm rounded transition-all duration-200 ${
          view === 'list'
            ? 'bg-[var(--color-primary)] text-white shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }`}
        data-testid="tasks-view-list"
        aria-label="List view (V L)"
        title="List view (V L)"
      >
        <List className="w-4 h-4" />
        <span className="pl-2 hidden @sm:inline">List</span>
      </button>
      <button
        onClick={() => onViewChange('kanban')}
        className={`inline-flex items-center justify-center px-2 py-1.5 text-sm rounded transition-all duration-200 ${
          view === 'kanban'
            ? 'bg-[var(--color-primary)] text-white shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
        }`}
        data-testid="tasks-view-kanban"
        aria-label="Kanban view (V K)"
        title="Kanban view (V K)"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="pl-2 hidden @sm:inline">Kanban</span>
      </button>
    </div>
  );
}
