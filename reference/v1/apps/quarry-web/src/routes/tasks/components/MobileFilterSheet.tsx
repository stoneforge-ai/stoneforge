/**
 * Mobile Filter Sheet for Tasks
 * Full-screen filter UI for mobile devices
 */

import { MobileDetailSheet } from '../../../components/shared/MobileDetailSheet';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../constants';
import type { FilterConfig, Entity } from '../types';

interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  onClearFilters: () => void;
  entities: Entity[];
}

export function MobileFilterSheet({
  open,
  onClose,
  filters,
  onFilterChange,
  onClearFilters,
  entities,
}: MobileFilterSheetProps) {
  const activeFilterCount =
    filters.status.length + filters.priority.length + (filters.assignee ? 1 : 0);

  const handleStatusToggle = (statusValue: string) => {
    const newStatus = filters.status.includes(statusValue)
      ? filters.status.filter((s) => s !== statusValue)
      : [...filters.status, statusValue];
    onFilterChange({ ...filters, status: newStatus });
  };

  const handlePriorityToggle = (priorityValue: number) => {
    const newPriority = filters.priority.includes(priorityValue)
      ? filters.priority.filter((p) => p !== priorityValue)
      : [...filters.priority, priorityValue];
    onFilterChange({ ...filters, priority: newPriority });
  };

  const handleAssigneeChange = (assignee: string) => {
    onFilterChange({ ...filters, assignee });
  };

  const handleClearAndClose = () => {
    onClearFilters();
    onClose();
  };

  return (
    <MobileDetailSheet
      open={open}
      onClose={onClose}
      title="Filters"
      data-testid="mobile-filter-sheet"
    >
      <div className="p-4 space-y-6">
        {/* Status filter */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            Status
          </label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleStatusToggle(option.value)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors touch-target ${
                  filters.status.includes(option.value)
                    ? `${option.color} border-transparent font-medium`
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                }`}
                data-testid={`mobile-filter-status-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority filter */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            Priority
          </label>
          <div className="flex flex-wrap gap-2">
            {PRIORITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handlePriorityToggle(option.value)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors touch-target ${
                  filters.priority.includes(option.value)
                    ? `${option.color} border-transparent font-medium`
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                }`}
                data-testid={`mobile-filter-priority-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Assignee filter */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            Assignee
          </label>
          <select
            value={filters.assignee}
            onChange={(e) => handleAssigneeChange(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] touch-target"
            data-testid="mobile-filter-assignee"
          >
            <option value="">All assignees</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name || entity.id}
              </option>
            ))}
          </select>
        </div>

        {/* Clear filters button */}
        {activeFilterCount > 0 && (
          <button
            onClick={handleClearAndClose}
            className="w-full py-2.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors touch-target"
            data-testid="mobile-clear-filters"
          >
            Clear all filters ({activeFilterCount})
          </button>
        )}

        {/* Apply button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors touch-target"
          data-testid="mobile-apply-filters"
        >
          Apply Filters
        </button>
      </div>
    </MobileDetailSheet>
  );
}
