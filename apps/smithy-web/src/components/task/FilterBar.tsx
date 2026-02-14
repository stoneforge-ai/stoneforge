/**
 * FilterBar - Collapsible filter controls for task list
 *
 * Features:
 * - Filter by status, priority, assignee
 * - Collapsible filter panel
 * - Active filter chips
 * - Clear all filters
 */

import { useState } from 'react';
import { Filter, ChevronDown, XCircle, X } from 'lucide-react';
import type { FilterConfig } from '../../lib/task-constants';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../lib/task-constants';
interface FilterBarProps {
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  onClearFilters: () => void;
  entityNameMap: Map<string, string>;
}

export function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  entityNameMap,
}: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasActiveFilters = filters.status.length > 0 || filters.priority.length > 0 || filters.assignee !== '';
  const activeFilterCount = filters.status.length + filters.priority.length + (filters.assignee ? 1 : 0);

  const toggleStatus = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    onFilterChange({ ...filters, status: newStatus });
  };

  const togglePriority = (priority: number) => {
    const newPriority = filters.priority.includes(priority)
      ? filters.priority.filter(p => p !== priority)
      : [...filters.priority, priority];
    onFilterChange({ ...filters, priority: newPriority });
  };

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]" data-testid="filter-bar">
      {/* Filter toggle button */}
      <div className="px-4 py-2 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          data-testid="filter-toggle"
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-[var(--color-primary-muted)] text-[var(--color-primary)] rounded-full">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            data-testid="clear-filters"
          >
            <XCircle className="w-4 h-4" />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {/* Expanded filter options */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-tertiary)] uppercase mb-1.5">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleStatus(option.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    filters.status.includes(option.value)
                      ? `${option.color} border-transparent font-medium`
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]'
                  }`}
                  data-testid={`filter-status-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority filter */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-tertiary)] uppercase mb-1.5">Priority</label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => togglePriority(option.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    filters.priority.includes(option.value)
                      ? `${option.color} border-transparent font-medium`
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]'
                  }`}
                  data-testid={`filter-priority-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee filter */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-tertiary)] uppercase mb-1.5">Assignee</label>
            <select
              value={filters.assignee}
              onChange={(e) => onFilterChange({ ...filters, assignee: e.target.value })}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] bg-[var(--color-input-bg)] text-[var(--color-text)]"
              data-testid="filter-assignee"
            >
              <option value="">All assignees</option>
              {Array.from(entityNameMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>
                  {name || id}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active filter chips (shown when collapsed) */}
      {!isExpanded && hasActiveFilters && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {filters.status.map((status) => {
            const option = STATUS_OPTIONS.find(o => o.value === status);
            return (
              <span
                key={status}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${option?.color || 'bg-gray-100 text-gray-800'}`}
              >
                {option?.label || status}
                <button
                  onClick={() => toggleStatus(status)}
                  className="hover:opacity-70"
                  aria-label={`Remove ${option?.label || status} filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {filters.priority.map((priority) => {
            const option = PRIORITY_OPTIONS.find(o => o.value === priority);
            return (
              <span
                key={priority}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${option?.color || 'bg-gray-100 text-gray-800'}`}
              >
                {option?.label || priority}
                <button
                  onClick={() => togglePriority(priority)}
                  className="hover:opacity-70"
                  aria-label={`Remove ${option?.label || priority} filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {filters.assignee && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[var(--color-surface)] text-[var(--color-text)]">
              Assignee: {entityNameMap.get(filters.assignee) || filters.assignee}
              <button
                onClick={() => onFilterChange({ ...filters, assignee: '' })}
                className="hover:opacity-70"
                aria-label="Remove assignee filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
