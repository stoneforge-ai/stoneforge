/**
 * ViewToggle - Toggle between list and kanban view modes
 *
 * A compact toggle button group for switching between task view modes.
 * Supports keyboard shortcuts (V L for list, V K for kanban).
 */

import { List, LayoutGrid } from "lucide-react";
import type { ViewMode } from "../../lib/task-constants";

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div
      className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5"
      data-testid="view-toggle"
    >
      <button
        onClick={() => onViewChange("list")}
        className={`inline-flex items-center justify-center px-2 py-1.5 sm:py-1 text-sm rounded transition-all duration-200 touch-target ${
          view === "list"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        }`}
        data-testid="view-toggle-list"
        aria-label="List view (V L)"
        title="List view (V L)"
      >
        <List className="w-4 h-4 sm:w-4 sm:h-4" />
        <span className="pl-2">List</span>
      </button>
      <button
        onClick={() => onViewChange("kanban")}
        className={`inline-flex items-center justify-center px-2 py-1.5 sm:py-1 text-sm rounded transition-all duration-200 touch-target ${
          view === "kanban"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        }`}
        data-testid="view-toggle-kanban"
        aria-label="Kanban view (V K)"
        title="Kanban view (V K)"
      >
        <LayoutGrid className="w-4 h-4 sm:w-4 sm:h-4" />
        <span className="pl-2">Kanban</span>
      </button>
    </div>
  );
}
