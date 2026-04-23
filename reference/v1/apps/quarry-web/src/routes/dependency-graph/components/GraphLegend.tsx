/**
 * Legend component for the dependency graph showing status and edge type colors
 */

import { STATUS_COLORS, EDGE_TYPE_COLORS } from '../constants';

export function GraphLegend() {
  return (
    <div className="mt-3 sm:mt-4 space-y-2 overflow-x-auto pb-1 -mb-1">
      {/* Status Legend */}
      <div className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
        <span className="font-medium shrink-0">Status:</span>
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1 shrink-0">
            <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded border ${colors.bg} ${colors.border}`} />
            <span className="capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
      {/* Edge Type Legend - hidden on small screens */}
      <div className="hidden sm:flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex-wrap" data-testid="edge-type-legend">
        <span className="font-medium shrink-0">Edge Types:</span>
        {Object.entries(EDGE_TYPE_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1 sm:gap-1.5 shrink-0" data-testid={`edge-legend-${type}`}>
            <div
              className="w-3 sm:w-4 h-0.5"
              style={{ backgroundColor: colors.stroke }}
            />
            <span className="capitalize">{type.replace('-', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
