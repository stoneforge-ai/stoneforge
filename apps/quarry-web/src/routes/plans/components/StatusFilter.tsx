/**
 * StatusFilter - Tab-based filter for plan statuses
 */

interface StatusFilterProps {
  selectedStatus: string | null;
  onStatusChange: (status: string | null) => void;
}

const STATUSES = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export function StatusFilter({ selectedStatus, onStatusChange }: StatusFilterProps) {
  return (
    <div data-testid="status-filter" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {STATUSES.map((status) => (
        <button
          key={status.value ?? 'all'}
          data-testid={`status-filter-${status.value ?? 'all'}`}
          onClick={() => onStatusChange(status.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selectedStatus === status.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
}
