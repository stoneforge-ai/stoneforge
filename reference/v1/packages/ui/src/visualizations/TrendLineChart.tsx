/**
 * TrendLineChart
 *
 * A reusable line chart component for visualizing trends over time.
 * Accepts data via props - no internal data fetching.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import type { TrendLineChartProps, LineChartDataPoint, TooltipPayload } from './types';

// Default line color
const DEFAULT_LINE_COLOR = 'var(--color-success, #22c55e)';

/**
 * Custom tooltip component
 */
function LineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload<LineChartDataPoint>[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-card p-2 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-sm text-muted-foreground">{payload[0].value} completed</p>
    </div>
  );
}

export function TrendLineChart({
  data,
  title,
  lineColor = DEFAULT_LINE_COLOR,
  showGrid = true,
  showDots = true,
  total,
  testId = 'trend-line-chart',
  isLoading = false,
  isError = false,
  errorMessage = 'Failed to load chart data',
  emptyMessage = 'No data to display',
  height = 192,
  isMobile = false,
  isTouchDevice = false,
  className = '',
}: TrendLineChartProps) {
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
          <span className="hidden sm:inline">{title}</span>
          <span className="sm:hidden">
            {title.length > 20 ? `${title.slice(0, 20)}...` : title}
          </span>
          {total !== undefined && total > 0 && (
            <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs font-normal text-muted-foreground">
              Total: {total}
            </span>
          )}
        </h4>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border, #e5e7eb)"
              />
            )}
            <XAxis
              dataKey="label"
              tick={{
                fontSize: isMobile ? 9 : 10,
                fill: 'var(--color-muted-foreground, #6b7280)',
              }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              interval={isMobile ? 1 : 0}
            />
            <YAxis
              allowDecimals={false}
              tick={{
                fontSize: isMobile ? 9 : 10,
                fill: 'var(--color-muted-foreground, #6b7280)',
              }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              width={isMobile ? 25 : 30}
            />
            <Tooltip
              content={<LineTooltip />}
              trigger={isTouchDevice ? 'click' : 'hover'}
              wrapperStyle={{ zIndex: 1000 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={
                showDots
                  ? {
                      fill: lineColor,
                      strokeWidth: 0,
                      r: isMobile ? 4 : 3,
                    }
                  : false
              }
              activeDot={{
                r: isMobile ? 6 : 5,
                fill: lineColor,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
