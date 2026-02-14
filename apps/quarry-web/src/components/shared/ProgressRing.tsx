/**
 * Progress Ring Component (TB86)
 *
 * A circular progress indicator that displays completion percentage.
 * Features:
 * - Percentage number displayed in center
 * - Color-coded: green (healthy), yellow (at-risk), red (behind)
 * - Supports multiple sizes: mini (32px), small (48px), medium (64px), large (80px)
 */


export interface ProgressRingProps {
  /** Percentage complete (0-100) */
  percentage: number;
  /** Size of the ring: mini (32px), small (48px), medium (64px), large (80px) */
  size?: 'mini' | 'small' | 'medium' | 'large';
  /** Custom size in pixels (overrides size prop) */
  customSize?: number;
  /** Show percentage text in center */
  showPercentage?: boolean;
  /** Progress health status for color coding */
  status?: 'healthy' | 'at-risk' | 'behind';
  /** Override: automatically determine status from percentage */
  autoStatus?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Test ID for Playwright tests */
  testId?: string;
}

// Size configurations
const SIZE_CONFIG = {
  mini: { size: 32, strokeWidth: 3, fontSize: 8 },
  small: { size: 48, strokeWidth: 4, fontSize: 10 },
  medium: { size: 64, strokeWidth: 5, fontSize: 12 },
  large: { size: 80, strokeWidth: 6, fontSize: 14 },
};

// Color configurations based on status
const STATUS_COLORS = {
  healthy: {
    stroke: 'var(--color-success, #22c55e)',
    text: 'text-green-600',
    background: 'var(--color-success-muted, #dcfce7)',
  },
  'at-risk': {
    stroke: 'var(--color-warning, #eab308)',
    text: 'text-yellow-600',
    background: 'var(--color-warning-muted, #fef9c3)',
  },
  behind: {
    stroke: 'var(--color-error, #ef4444)',
    text: 'text-red-600',
    background: 'var(--color-error-muted, #fee2e2)',
  },
};

/**
 * Determines the status based on percentage
 * - healthy: >= 50% or 100%
 * - at-risk: 25-49%
 * - behind: < 25%
 */
function getAutoStatus(percentage: number): 'healthy' | 'at-risk' | 'behind' {
  if (percentage >= 50 || percentage === 100) return 'healthy';
  if (percentage >= 25) return 'at-risk';
  return 'behind';
}

export function ProgressRing({
  percentage,
  size = 'medium',
  customSize,
  showPercentage = true,
  status,
  autoStatus = true,
  className = '',
  testId = 'progress-ring',
}: ProgressRingProps) {
  // Get size configuration
  const sizeConfig = SIZE_CONFIG[size];
  const diameter = customSize || sizeConfig.size;
  const strokeWidth = customSize
    ? Math.max(3, Math.round(customSize / 12))
    : sizeConfig.strokeWidth;
  const fontSize = customSize
    ? Math.max(8, Math.round(customSize / 5))
    : sizeConfig.fontSize;

  // Calculate SVG values
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedPercentage = Math.max(0, Math.min(100, percentage));
  const strokeDashoffset = circumference - (normalizedPercentage / 100) * circumference;

  // Determine status color
  const effectiveStatus = status || (autoStatus ? getAutoStatus(normalizedPercentage) : 'healthy');
  const colors = STATUS_COLORS[effectiveStatus];

  // Center point
  const center = diameter / 2;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      data-testid={testId}
      data-percentage={normalizedPercentage}
      data-status={effectiveStatus}
      style={{ width: diameter, height: diameter }}
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border, #e5e7eb)"
          strokeWidth={strokeWidth}
          data-testid={`${testId}-background`}
        />
        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500 ease-out"
          data-testid={`${testId}-progress`}
        />
      </svg>
      {/* Center text */}
      {showPercentage && (
        <span
          className={`absolute font-semibold ${colors.text}`}
          style={{ fontSize: `${fontSize}px` }}
          data-testid={`${testId}-text`}
        >
          {Math.round(normalizedPercentage)}%
        </span>
      )}
    </div>
  );
}

/**
 * Progress Ring with additional breakdown info (for plan detail panels)
 */
export interface ProgressRingWithBreakdownProps extends Omit<ProgressRingProps, 'showPercentage'> {
  /** Number of completed items */
  completed: number;
  /** Total number of items */
  total: number;
  /** Label for the items (e.g., "tasks") */
  itemLabel?: string;
}

export function ProgressRingWithBreakdown({
  percentage,
  completed,
  total,
  itemLabel = 'tasks',
  size = 'large',
  ...props
}: ProgressRingWithBreakdownProps) {
  return (
    <div className="flex flex-col items-center gap-2" data-testid="progress-ring-breakdown">
      <ProgressRing
        percentage={percentage}
        size={size}
        showPercentage={true}
        {...props}
      />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground" data-testid="progress-breakdown-count">
          {completed} of {total} {itemLabel}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="progress-breakdown-remaining">
          {total - completed} remaining
        </p>
      </div>
    </div>
  );
}
