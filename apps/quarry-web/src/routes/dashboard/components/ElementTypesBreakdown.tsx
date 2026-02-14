/**
 * ElementTypesBreakdown - Grid display of element counts by type
 * Shows counts for each element type with appropriate icons
 */

import { Activity } from 'lucide-react';
import { ELEMENT_TYPE_ICONS } from '../constants';
import type { StatsResponse } from '../types';

interface ElementTypesBreakdownProps {
  elementsByType: StatsResponse['elementsByType'];
}

export function ElementTypesBreakdown({ elementsByType }: ElementTypesBreakdownProps) {
  if (!elementsByType || Object.keys(elementsByType).length === 0) {
    return null;
  }

  return (
    <div className="mt-6 sm:mt-8">
      <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">Elements by Type</h3>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Object.entries(elementsByType).map(([type, count]) => {
            const Icon = ELEMENT_TYPE_ICONS[type] || Activity;
            return (
              <div key={type} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{count}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">
                    {type === 'entity' ? 'Entities' : type === 'library' ? 'Libraries' : `${type}s`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
