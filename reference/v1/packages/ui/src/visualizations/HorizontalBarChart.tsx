/**
 * HorizontalBarChart
 *
 * A reusable horizontal bar chart component for visualizing distributions.
 * Accepts data via props - no internal data fetching.
 */

import { useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import type {
  HorizontalBarChartProps,
  BarChartDataPoint,
  TooltipPayload,
} from './types';

// Default bar color
const DEFAULT_BAR_COLOR = 'var(--color-primary, #3b82f6)';

/**
 * Custom tooltip component
 */
function BarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload<BarChartDataPoint>[];
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-card p-2 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium text-foreground">{data.name}</p>
      <p className="text-sm text-muted-foreground">
        {data.value} item{data.value !== 1 ? 's' : ''}
        {data.percentage !== undefined && ` (${data.percentage}%)`}
      </p>
      {data.id && (
        <p className="text-xs text-muted-foreground mt-1">Click to view details</p>
      )}
    </div>
  );
}

export function HorizontalBarChart({
  data,
  title,
  barColor = DEFAULT_BAR_COLOR,
  onBarClick,
  maxBars = 10,
  testId = 'horizontal-bar-chart',
  isLoading = false,
  isError = false,
  errorMessage = 'Failed to load chart data',
  emptyMessage = 'No data to display',
  height = 192,
  isMobile = false,
  isTouchDevice = false,
  className = '',
}: HorizontalBarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Limit to maxBars and prepare display data
  const displayData = data.slice(0, maxBars).map((d) => ({
    ...d,
    displayName:
      isMobile && d.name.length > 8 ? `${d.name.slice(0, 8)}...` : d.name,
  }));

  // Handle bar click
  const handleBarClick = useCallback(
    (entry: BarChartDataPoint, index: number) => {
      if (isTouchDevice) {
        // On touch devices, first tap shows tooltip, second tap triggers action
        if (activeIndex === index) {
          onBarClick?.(entry);
        } else {
          setActiveIndex(index);
        }
      } else {
        onBarClick?.(entry);
      }
    },
    [onBarClick, isTouchDevice, activeIndex]
  );

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
  if (data.length === 0) {
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
          <BarChart data={displayData} layout="vertical">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border, #e5e7eb)"
            />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{
                fontSize: isMobile ? 9 : 10,
                fill: 'var(--color-muted-foreground, #6b7280)',
              }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              tick={{
                fontSize: isMobile ? 9 : 10,
                fill: 'var(--color-muted-foreground, #6b7280)',
              }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              width={isMobile ? 55 : 70}
            />
            <Tooltip
              content={<BarTooltip />}
              trigger={isTouchDevice ? 'click' : 'hover'}
              wrapperStyle={{ zIndex: 1000 }}
            />
            <Bar
              dataKey="value"
              fill={barColor}
              radius={[0, 4, 4, 0]}
              className={onBarClick ? 'cursor-pointer' : ''}
              onClick={(entry, index) =>
                handleBarClick(entry as unknown as BarChartDataPoint, index)
              }
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mobile: show tapped bar details with tap again hint */}
      {isMobile && activeIndex !== null && data[activeIndex] && (
        <div className="mt-2 text-center text-sm" data-testid="mobile-tooltip-bar">
          <span className="font-medium text-foreground">
            {data[activeIndex].name}
          </span>
          <span className="text-muted-foreground ml-2">
            {data[activeIndex].value} items
          </span>
          {onBarClick && (
            <p className="text-xs text-muted-foreground mt-1">
              Tap again to view details
            </p>
          )}
        </div>
      )}
    </div>
  );
}
