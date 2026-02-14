/**
 * FilterTabs - Entity type filter tabs
 */

import { FILTER_TABS } from '../constants';
import type { EntityTypeFilter } from '../types';

interface FilterTabsProps {
  selected: EntityTypeFilter;
  onChange: (value: EntityTypeFilter) => void;
  counts: Record<EntityTypeFilter, number>;
}

export function FilterTabs({ selected, onChange, counts }: FilterTabsProps) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg" data-testid="entity-filter-tabs">
      {FILTER_TABS.map((tab) => {
        const Icon = tab.icon;
        const isSelected = selected === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isSelected
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            data-testid={`entity-filter-${tab.value}`}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.label}</span>
            <span
              className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                isSelected ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {counts[tab.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
