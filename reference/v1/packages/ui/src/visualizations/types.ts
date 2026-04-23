/**
 * Visualization Types
 *
 * Data-driven types for chart components that don't depend on
 * app-specific domain types.
 */

/**
 * Generic data point for pie/donut charts
 */
export interface PieChartDataPoint {
  /** Display label for the segment */
  name: string;
  /** Numeric value */
  value: number;
  /** Optional key for color mapping */
  key?: string;
  /** Optional custom color */
  color?: string;
}

/**
 * Generic data point for line/trend charts
 */
export interface LineChartDataPoint {
  /** X-axis label */
  label: string;
  /** Numeric value */
  value: number;
  /** Optional date string for more precise X-axis */
  date?: string;
}

/**
 * Generic data point for bar charts
 */
export interface BarChartDataPoint {
  /** Bar label (Y-axis for horizontal, X-axis for vertical) */
  name: string;
  /** Numeric value */
  value: number;
  /** Optional secondary value for stacked bars */
  secondaryValue?: number;
  /** Optional unique identifier for click handling */
  id?: string;
  /** Optional percentage value */
  percentage?: number;
}

/**
 * Chart loading/error state
 */
export type ChartState = 'loading' | 'error' | 'empty' | 'ready';

/**
 * Color configuration for charts
 */
export interface ChartColors {
  /** Map of keys to color values */
  colorMap?: Record<string, string>;
  /** Default colors for segments without explicit color */
  defaultColors?: string[];
  /** Primary color for single-color charts */
  primaryColor?: string;
}

/**
 * Common props for all chart components
 */
export interface BaseChartProps {
  /** Chart title */
  title?: string;
  /** Test ID for the chart container */
  testId?: string;
  /** Whether to show the chart in a loading state */
  isLoading?: boolean;
  /** Whether to show the chart in an error state */
  isError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Empty state message */
  emptyMessage?: string;
  /** Height of the chart area in pixels */
  height?: number;
  /** Whether component is rendered on mobile */
  isMobile?: boolean;
  /** Whether device supports touch */
  isTouchDevice?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Pie/Donut chart specific props
 */
export interface StatusPieChartProps extends BaseChartProps {
  /** Chart data points */
  data: PieChartDataPoint[];
  /** Color configuration */
  colors?: ChartColors;
  /** Inner radius for donut style (0 for full pie) */
  innerRadius?: number;
  /** Outer radius */
  outerRadius?: number;
  /** Whether to show percentage labels */
  showLabels?: boolean;
  /** Legend click handler (receives data point key or name) */
  onLegendClick?: (key: string) => void;
}

/**
 * Line/Trend chart specific props
 */
export interface TrendLineChartProps extends BaseChartProps {
  /** Chart data points */
  data: LineChartDataPoint[];
  /** Line color */
  lineColor?: string;
  /** Whether to show grid lines */
  showGrid?: boolean;
  /** Whether to show dots on line */
  showDots?: boolean;
  /** Total count to display in header */
  total?: number;
}

/**
 * Bar chart specific props
 */
export interface HorizontalBarChartProps extends BaseChartProps {
  /** Chart data points */
  data: BarChartDataPoint[];
  /** Bar color */
  barColor?: string;
  /** Bar click handler (receives data point) */
  onBarClick?: (dataPoint: BarChartDataPoint) => void;
  /** Maximum number of bars to show */
  maxBars?: number;
}

/**
 * Tooltip payload type from recharts
 */
export interface TooltipPayload<T> {
  payload: T;
  value?: number;
}
