/**
 * Toolbar component for the dependency graph with search, filters, and layout controls
 */

import { useState } from 'react';
import {
  Search,
  X,
  Filter,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  Tag,
  LayoutGrid,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react';
import {
  STATUS_COLORS,
  STATUS_OPTIONS,
  DIRECTION_LABELS,
  ALGORITHM_LABELS,
} from '../constants';
import type { LayoutOptions, LayoutDirection, LayoutAlgorithm } from '../types';

interface GraphToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
  matchCount: number;
  totalCount: number;
  onClearFilters: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showEdgeLabels: boolean;
  onToggleEdgeLabels: () => void;
  layoutOptions: LayoutOptions;
  onLayoutChange: (options: Partial<LayoutOptions>) => void;
  onApplyLayout: () => void;
  isLayouting: boolean;
}

export function GraphToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  matchCount,
  totalCount,
  onClearFilters,
  onFitView,
  onZoomIn,
  onZoomOut,
  showEdgeLabels,
  onToggleEdgeLabels,
  layoutOptions,
  onLayoutChange,
  onApplyLayout,
  isLayouting,
}: GraphToolbarProps) {
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  const [showSpacingControls, setShowSpacingControls] = useState(false);
  const hasFilters = searchQuery.trim().length > 0 || statusFilter.length > 0;

  const toggleStatus = (status: string) => {
    if (statusFilter.includes(status)) {
      onStatusFilterChange(statusFilter.filter(s => s !== status));
    } else {
      onStatusFilterChange([...statusFilter, status]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 sm:mb-3" data-testid="graph-toolbar">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[150px] max-w-md">
        <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-7 sm:pl-9 pr-7 sm:pr-8 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
          data-testid="graph-search-input"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            data-testid="clear-search-button"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        )}
      </div>

      {/* Status Filter Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowStatusFilter(!showStatusFilter)}
          className={`
            flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border rounded-lg transition-colors
            ${statusFilter.length > 0
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-500 text-blue-700 dark:text-blue-300'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }
          `}
          data-testid="status-filter-button"
        >
          <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Status</span>
          {statusFilter.length > 0 && (
            <span className="bg-blue-600 text-white text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-full">
              {statusFilter.length}
            </span>
          )}
        </button>
        {showStatusFilter && (
          <div
            className="absolute top-full left-0 mt-1 w-44 sm:w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50"
            data-testid="status-filter-dropdown"
          >
            <div className="p-2 space-y-1">
              {STATUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => toggleStatus(value)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors
                    ${statusFilter.includes(value)
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50 text-gray-700'
                    }
                  `}
                  data-testid={`status-filter-option-${value}`}
                >
                  <div className={`w-3 h-3 rounded border ${STATUS_COLORS[value].bg} ${STATUS_COLORS[value].border}`} />
                  <span>{label}</span>
                  {statusFilter.includes(value) && (
                    <span className="ml-auto text-blue-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Match Count */}
      {hasFilters && (
        <span className="text-sm text-gray-500" data-testid="match-count">
          {matchCount} of {totalCount} nodes match
        </span>
      )}

      {/* Clear Filters */}
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          data-testid="clear-filters-button"
        >
          <X className="w-4 h-4" />
          Clear filters
        </button>
      )}

      {/* Layout Controls and Zoom Controls */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Auto Layout Button with Dropdown */}
        <div className="relative">
          <div className="flex items-center">
            <button
              onClick={onApplyLayout}
              disabled={isLayouting}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-sm border border-r-0 rounded-l-lg transition-colors
                ${isLayouting
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }
              `}
              title="Apply auto layout"
              data-testid="auto-layout-button"
            >
              {isLayouting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LayoutGrid className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Auto Layout</span>
            </button>
            <button
              onClick={() => setShowLayoutDropdown(!showLayoutDropdown)}
              className="px-2 py-2 border border-gray-300 rounded-r-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              data-testid="layout-options-dropdown-toggle"
              aria-label="Layout options"
              aria-expanded={showLayoutDropdown}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          {showLayoutDropdown && (
            <LayoutDropdown
              layoutOptions={layoutOptions}
              onLayoutChange={onLayoutChange}
              onApplyLayout={() => {
                onApplyLayout();
                setShowLayoutDropdown(false);
              }}
              isLayouting={isLayouting}
              showSpacingControls={showSpacingControls}
              setShowSpacingControls={setShowSpacingControls}
            />
          )}
        </div>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        {/* Edge Labels Toggle */}
        <button
          onClick={onToggleEdgeLabels}
          className={`
            p-2 rounded-lg transition-colors
            ${showEdgeLabels
              ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }
          `}
          title={showEdgeLabels ? 'Hide edge labels' : 'Show edge labels'}
          data-testid="toggle-edge-labels-button"
        >
          <Tag className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <button
          onClick={onZoomOut}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="Zoom out"
          data-testid="zoom-out-button"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={onZoomIn}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="Zoom in"
          data-testid="zoom-in-button"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onFitView}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="Fit to view"
          data-testid="fit-view-button"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Extracted layout dropdown component
interface LayoutDropdownProps {
  layoutOptions: LayoutOptions;
  onLayoutChange: (options: Partial<LayoutOptions>) => void;
  onApplyLayout: () => void;
  isLayouting: boolean;
  showSpacingControls: boolean;
  setShowSpacingControls: (show: boolean) => void;
}

function LayoutDropdown({
  layoutOptions,
  onLayoutChange,
  onApplyLayout,
  isLayouting,
  showSpacingControls,
  setShowSpacingControls,
}: LayoutDropdownProps) {
  return (
    <div
      className="absolute top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
      data-testid="layout-options-dropdown"
    >
      <div className="p-3 space-y-4">
        {/* Algorithm Selection */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Layout Algorithm
          </label>
          <div className="space-y-1">
            {(Object.entries(ALGORITHM_LABELS) as [LayoutAlgorithm, typeof ALGORITHM_LABELS[LayoutAlgorithm]][]).map(([algo, { label, description }]) => (
              <button
                key={algo}
                onClick={() => onLayoutChange({ algorithm: algo })}
                className={`
                  w-full text-left px-3 py-2 rounded-md text-sm transition-colors
                  ${layoutOptions.algorithm === algo
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    : 'hover:bg-gray-50 text-gray-700'
                  }
                `}
                data-testid={`layout-algorithm-${algo}`}
              >
                <div className="font-medium">{label}</div>
                <div className="text-xs text-gray-500">{description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Direction Selection (only for hierarchical) */}
        {layoutOptions.algorithm === 'hierarchical' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Direction
            </label>
            <div className="flex gap-1">
              {(Object.entries(DIRECTION_LABELS) as [LayoutDirection, typeof DIRECTION_LABELS[LayoutDirection]][]).map(([dir, { label, icon: Icon }]) => (
                <button
                  key={dir}
                  onClick={() => onLayoutChange({ direction: dir })}
                  className={`
                    flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-md text-sm transition-colors
                    ${layoutOptions.direction === dir
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                      : 'hover:bg-gray-50 text-gray-700 border border-gray-200'
                    }
                  `}
                  title={label}
                  data-testid={`layout-direction-${dir}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Spacing Controls */}
        <div>
          <button
            onClick={() => setShowSpacingControls(!showSpacingControls)}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
            data-testid="toggle-spacing-controls"
          >
            <SlidersHorizontal className="w-3 h-3" />
            Spacing
            <ChevronDown className={`w-3 h-3 transition-transform ${showSpacingControls ? 'rotate-180' : ''}`} />
          </button>
          {showSpacingControls && (
            <div className="mt-2 space-y-3">
              <div>
                <label className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>Node Spacing</span>
                  <span className="font-mono">{layoutOptions.nodeSpacing}px</span>
                </label>
                <input
                  type="range"
                  min="40"
                  max="200"
                  step="10"
                  value={layoutOptions.nodeSpacing}
                  onChange={(e) => onLayoutChange({ nodeSpacing: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  data-testid="node-spacing-slider"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>Rank Spacing</span>
                  <span className="font-mono">{layoutOptions.rankSpacing}px</span>
                </label>
                <input
                  type="range"
                  min="80"
                  max="300"
                  step="10"
                  value={layoutOptions.rankSpacing}
                  onChange={(e) => onLayoutChange({ rankSpacing: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  data-testid="rank-spacing-slider"
                />
              </div>
            </div>
          )}
        </div>

        {/* Apply Button */}
        <button
          onClick={onApplyLayout}
          disabled={isLayouting}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="apply-layout-button"
        >
          {isLayouting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Applying...
            </>
          ) : (
            <>
              <LayoutGrid className="w-4 h-4" />
              Apply Layout
            </>
          )}
        </button>
      </div>
    </div>
  );
}
