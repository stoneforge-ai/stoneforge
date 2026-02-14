/**
 * @stoneforge/ui Workflow Status Filter
 *
 * Filter tabs for filtering workflows by status.
 */

import { STATUS_FILTER_OPTIONS } from '../constants';

interface StatusFilterProps {
  selectedStatus: string | null;
  onStatusChange: (status: string | null) => void;
}

export function StatusFilter({
  selectedStatus,
  onStatusChange,
}: StatusFilterProps) {
  return (
    <div data-testid="workflow-status-filter" className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {STATUS_FILTER_OPTIONS.map((status) => (
        <button
          key={status.value ?? 'all'}
          data-testid={`workflow-status-filter-${status.value ?? 'all'}`}
          onClick={() => onStatusChange(status.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selectedStatus === status.value
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
}
