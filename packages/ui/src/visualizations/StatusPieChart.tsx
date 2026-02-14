/**
 * StatusPieChart
 *
 * A reusable donut/pie chart component for visualizing status distributions.
 * Accepts data via props - no internal data fetching.
 */

import { useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type {
  StatusPieChartProps,
  PieChartDataPoint,
  TooltipPayload,
} from './types';

// Default colors for chart segments
const DEFAULT_COLORS = ['#3b82f6', '#eab308', '#ef4444', '#22c55e', '#8b5cf6', '#06b6d4'];

/**
 * Custom tooltip component
 */
function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload<PieChartDataPoint>[];
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-card p-2 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium text-foreground">{data.name}</p>
      <p className="text-sm text-muted-foreground">{data.value} items</p>
    </div>
  );
}

/**
 * Get color for a data point
 */
function getColor(
  dataPoint: PieChartDataPoint,
  index: number,
  colors?: StatusPieChartProps['colors']
): string {
  // Use explicit color on data point first
  if (dataPoint.color) return dataPoint.color;

  // Try color map with key or name
  if (colors?.colorMap) {
    const key = dataPoint.key || dataPoint.name.toLowerCase().replace(/\s+/g, '_');
    if (colors.colorMap[key]) return colors.colorMap[key];
  }

  // Use default colors array
  const colorArray = colors?.defaultColors || DEFAULT_COLORS;
  return colorArray[index % colorArray.length];
}

export function StatusPieChart({
  data,
  colors,
  title,
  testId = 'status-pie-chart',
  isLoading = false,
  isError = false,
  errorMessage = 'Failed to load chart data',
  emptyMessage = 'No data to display',
  height = 192,
  innerRadius,
  outerRadius,
  showLabels = true,
  isMobile = false,
  isTouchDevice = false,
  onLegendClick,
  className = '',
}: StatusPieChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Handle touch interactions for mobile tooltips
  const handlePieClick = useCallback(
    (_: unknown, index: number) => {
      if (isTouchDevice) {
        setActiveIndex(activeIndex === index ? null : index);
      }
    },
    [isTouchDevice, activeIndex]
  );

  const handleLegendClick = useCallback(
    (dataPoint: PieChartDataPoint) => {
      if (onLegendClick) {
        const key = dataPoint.key || dataPoint.name.toLowerCase().replace(/\s+/g, '_');
        onLegendClick(key);
      }
    },
    [onLegendClick]
  );

  // Calculate responsive radius values
  const calcInnerRadius = innerRadius ?? (isMobile ? 30 : 35);
  const calcOuterRadius = outerRadius ?? (isMobile ? 50 : 60);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`bg-card rounded-lg shadow-sm p-4 sm:p-6 border border-border ${className}`}
        data-testid={testId}
      >
        {title && (
          <h4 className="text-xs sm:text-sm font-medium text-foreground mb-3 sm:mb-4">
            {title}
          </h4>
        )}
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="animate-pulse text-muted-foreground text-sm">
            Loading chart...
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className={`bg-card rounded-lg shadow-sm p-4 sm:p-6 border border-border ${className}`}
        data-testid={testId}
      >
        {title && (
          <h4 className="text-xs sm:text-sm font-medium text-foreground mb-3 sm:mb-4">
            {title}
          </h4>
        )}
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-error text-sm">{errorMessage}</div>
        </div>
      </div>
    );
  }

  // Empty state
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);
  if (totalValue === 0 || data.length === 0) {
    return (
      <div
        className={`bg-card rounded-lg shadow-sm p-4 sm:p-6 border border-border ${className}`}
        data-testid={testId}
      >
        {title && (
          <h4 className="text-xs sm:text-sm font-medium text-foreground mb-3 sm:mb-4">
            {title}
          </h4>
        )}
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-muted-foreground text-sm">{emptyMessage}</div>
        </div>
      </div>
    );
  }

  // On mobile, hide pie labels to prevent overlap and rely on legend
  const shouldShowLabels = showLabels && !isMobile;

  return (
    <div
      className={`bg-card rounded-lg shadow-sm p-4 sm:p-6 border border-border ${className}`}
      data-testid={testId}
    >
      {title && (
        <h4 className="text-xs sm:text-sm font-medium text-foreground mb-3 sm:mb-4">
          {title}
        </h4>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={calcInnerRadius}
              outerRadius={calcOuterRadius}
              dataKey="value"
              labelLine={false}
              label={
                shouldShowLabels
                  ? ({ name, percent }: { name: string; percent?: number }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  : undefined
              }
              onClick={handlePieClick}
              className={isTouchDevice ? 'cursor-pointer' : ''}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getColor(entry, index, colors)}
                  data-testid={`chart-segment-${entry.key || entry.name.toLowerCase().replace(/\s+/g, '-')}`}
                  stroke={activeIndex === index ? 'var(--color-foreground)' : undefined}
                  strokeWidth={activeIndex === index ? 2 : 0}
                />
              ))}
            </Pie>
            <Tooltip
              content={<PieTooltip />}
              trigger={isTouchDevice ? 'click' : 'hover'}
              wrapperStyle={{ zIndex: 1000 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Mobile: show active segment details */}
      {isMobile && activeIndex !== null && data[activeIndex] && (
        <div className="mt-2 text-center text-sm text-foreground" data-testid="mobile-tooltip">
          <span className="font-medium">{data[activeIndex].name}</span>
          <span className="text-muted-foreground ml-2">
            {data[activeIndex].value} items
          </span>
        </div>
      )}

      {/* Legend */}
      <div
        className="mt-3 sm:mt-4 flex justify-center gap-2 sm:gap-4 flex-wrap"
        data-testid="chart-legend"
      >
        {data.map((entry, index) => (
          <button
            key={entry.key || entry.name}
            onClick={() => handleLegendClick(entry)}
            className={`flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[28px] px-1 ${
              activeIndex === index ? 'text-foreground font-medium' : ''
            } ${onLegendClick ? 'cursor-pointer' : 'cursor-default'}`}
            data-testid={`legend-${entry.key || entry.name.toLowerCase().replace(/\s+/g, '-')}`}
            onTouchStart={() => isTouchDevice && setActiveIndex(index)}
            disabled={!onLegendClick}
          >
            <span
              className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: getColor(entry, index, colors) }}
            />
            <span className="truncate">
              {entry.name}: {entry.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
