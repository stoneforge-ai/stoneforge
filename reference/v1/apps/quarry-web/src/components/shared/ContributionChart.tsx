/**
 * ContributionChart - GitHub-style contribution activity grid
 *
 * TB108: Entity Contribution Chart
 * TB156: Responsive Charts & Visualizations
 * Displays a grid of squares representing daily activity levels over time.
 * On mobile: shows fewer weeks (26 weeks / 6 months) with horizontal scroll
 * Touch support: tap to show count (not just hover)
 */

import { useMemo, useState } from 'react';
import { useIsMobile, useTouchDevice } from '../../hooks';

interface ActivityDay {
  date: string;
  count: number;
}

interface ContributionChartProps {
  /** Activity data with date and count per day */
  activity: ActivityDay[];
  /** Number of days to display (default: 365) */
  days?: number;
  /** Start date (default: days ago from today) */
  startDate?: string;
  /** End date (default: today) */
  endDate?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Test ID prefix */
  testId?: string;
}

// Color intensity levels based on activity count
function getActivityLevel(count: number, max: number): number {
  if (count === 0) return 0;
  if (max <= 0) return 1;

  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

// Get CSS classes for activity level (size handled separately in render)
function getActivityClass(level: number): string {
  const baseClass = 'rounded-sm transition-colors';
  switch (level) {
    case 0:
      return `${baseClass} bg-gray-100 dark:bg-gray-800`;
    case 1:
      return `${baseClass} bg-green-200 dark:bg-green-900`;
    case 2:
      return `${baseClass} bg-green-400 dark:bg-green-700`;
    case 3:
      return `${baseClass} bg-green-500 dark:bg-green-500`;
    case 4:
      return `${baseClass} bg-green-600 dark:bg-green-400`;
    default:
      return `${baseClass} bg-gray-100 dark:bg-gray-800`;
  }
}

// Format date for tooltip display
function formatTooltipDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Get month labels for the chart
function getMonthLabels(startDate: Date, weeks: number): { label: string; weekIndex: number }[] {
  const labels: { label: string; weekIndex: number }[] = [];
  let currentMonth = -1;

  for (let weekIndex = 0; weekIndex < weeks; weekIndex++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + weekIndex * 7);
    const month = weekStart.getMonth();

    if (month !== currentMonth) {
      currentMonth = month;
      labels.push({
        label: weekStart.toLocaleDateString('en-US', { month: 'short' }),
        weekIndex,
      });
    }
  }

  return labels;
}

// Day labels for the chart (S M T W T F S)
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export function ContributionChart({
  activity,
  days = 365,
  startDate,
  endDate,
  isLoading = false,
  testId = 'contribution-chart',
}: ContributionChartProps) {
  const isMobile = useIsMobile();
  const isTouchDevice = useTouchDevice();
  const [tooltipData, setTooltipData] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  const [touchSelectedDay, setTouchSelectedDay] = useState<{ date: string; count: number } | null>(null);

  // On mobile, show fewer weeks (26 weeks = ~6 months) for better display
  const effectiveDays = isMobile ? Math.min(days, 182) : days;

  // Build the chart data structure
  const chartData = useMemo(() => {
    // Calculate date range - use effectiveDays for mobile responsiveness
    const end = endDate ? new Date(endDate + 'T00:00:00') : new Date();
    end.setHours(0, 0, 0, 0);

    const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(end);
    if (!startDate) {
      start.setDate(start.getDate() - effectiveDays + 1);
    }
    start.setHours(0, 0, 0, 0);

    // Create a map of date -> count
    const activityMap = new Map<string, number>();
    for (const day of activity) {
      activityMap.set(day.date, day.count);
    }

    // Find max activity for color scaling
    const maxActivity = activity.length > 0
      ? Math.max(...activity.map(d => d.count))
      : 0;

    // Generate weeks array (each week is an array of 7 days)
    const weeks: { date: string; count: number; level: number; dayOfWeek: number }[][] = [];

    // Find the Sunday on or before the start date
    const current = new Date(start);
    const startDayOfWeek = current.getDay();
    current.setDate(current.getDate() - startDayOfWeek);

    while (current <= end) {
      const week: { date: string; count: number; level: number; dayOfWeek: number }[] = [];

      for (let day = 0; day < 7; day++) {
        const dateStr = current.toISOString().split('T')[0];
        const count = activityMap.get(dateStr) || 0;
        const isInRange = current >= start && current <= end;

        week.push({
          date: dateStr,
          count: isInRange ? count : -1, // -1 means outside range
          level: isInRange ? getActivityLevel(count, maxActivity) : -1,
          dayOfWeek: day,
        });

        current.setDate(current.getDate() + 1);
      }

      weeks.push(week);
    }

    // Get month labels
    const monthLabels = getMonthLabels(new Date(start.getTime() - startDayOfWeek * 24 * 60 * 60 * 1000), weeks.length);

    // Calculate total activity
    const totalActivity = activity.reduce((sum, d) => sum + d.count, 0);

    return {
      weeks,
      monthLabels,
      maxActivity,
      totalActivity,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [activity, effectiveDays, startDate, endDate]);

  const handleMouseEnter = (
    e: React.MouseEvent,
    date: string,
    count: number
  ) => {
    if (!isTouchDevice) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipData({
        date,
        count,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
  };

  const handleMouseLeave = () => {
    if (!isTouchDevice) {
      setTooltipData(null);
    }
  };

  // Handle touch/click for mobile - tap to select, tap elsewhere to dismiss
  const handleDayClick = (
    e: React.MouseEvent | React.TouchEvent,
    date: string,
    count: number
  ) => {
    if (isTouchDevice) {
      e.stopPropagation();
      // Toggle selection on tap
      if (touchSelectedDay?.date === date) {
        setTouchSelectedDay(null);
        setTooltipData(null);
      } else {
        setTouchSelectedDay({ date, count });
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setTooltipData({
          date,
          count,
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      }
    }
  };

  // Clear touch selection when tapping outside
  const handleContainerClick = () => {
    if (isTouchDevice && touchSelectedDay) {
      setTouchSelectedDay(null);
      setTooltipData(null);
    }
  };

  if (isLoading) {
    return (
      <div
        className="animate-pulse"
        data-testid={`${testId}-loading`}
      >
        <div className="h-28 bg-gray-100 dark:bg-gray-800 rounded"></div>
      </div>
    );
  }

  return (
    <div
      className="relative"
      data-testid={testId}
      onClick={handleContainerClick}
    >
      {/* Month labels - smaller text on mobile */}
      <div className="flex ml-6 sm:ml-8 mb-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
        {chartData.monthLabels.map((label, idx) => (
          <div
            key={idx}
            className="absolute"
            style={{ left: `${label.weekIndex * (isMobile ? 12 : 16) + (isMobile ? 24 : 32)}px` }}
          >
            {label.label}
          </div>
        ))}
      </div>

      <div className="flex mt-4">
        {/* Day labels - smaller on mobile */}
        <div className="flex flex-col gap-0.5 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 pr-1">
          {DAY_LABELS.map((label, idx) => (
            <div
              key={idx}
              className="flex items-center justify-end"
              style={{ width: isMobile ? '20px' : '28px', height: isMobile ? '10px' : '12px' }}
            >
              {/* On mobile, only show M, W, F for compactness */}
              {isMobile ? (label === 'Mon' ? 'M' : label === 'Wed' ? 'W' : label === 'Fri' ? 'F' : '') : label}
            </div>
          ))}
        </div>

        {/* Grid of contribution squares - smaller squares on mobile, scrollable */}
        <div
          className="flex gap-0.5 overflow-x-auto pb-2 -mb-2"
          data-testid={`${testId}-grid`}
          style={{ scrollbarWidth: 'thin' }}
        >
          {chartData.weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-0.5">
              {week.map((day, dayIdx) => (
                day.level === -1 ? (
                  // Outside date range - render empty/invisible square
                  <div
                    key={dayIdx}
                    className={`${isMobile ? 'w-[10px] h-[10px]' : 'w-3 h-3'} rounded-sm bg-transparent`}
                    data-testid={`${testId}-day-empty`}
                  />
                ) : (
                  <div
                    key={dayIdx}
                    className={`${getActivityClass(day.level)} ${isMobile ? 'w-[10px] h-[10px]' : 'w-3 h-3'} rounded-sm cursor-pointer hover:ring-1 hover:ring-gray-400 dark:hover:ring-gray-500 ${
                      touchSelectedDay?.date === day.date ? 'ring-2 ring-blue-500' : ''
                    }`}
                    data-testid={`${testId}-day-${day.date}`}
                    data-date={day.date}
                    data-count={day.count}
                    data-level={day.level}
                    onMouseEnter={(e) => handleMouseEnter(e, day.date, day.count)}
                    onMouseLeave={handleMouseLeave}
                    onClick={(e) => handleDayClick(e, day.date, day.count)}
                  />
                )
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend - stacked on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-3">
        <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400" data-testid={`${testId}-total`}>
          {chartData.totalActivity} contributions {isMobile ? '(6 months)' : 'in the last year'}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mr-1">Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`${getActivityClass(level)} ${isMobile ? 'w-[10px] h-[10px]' : 'w-3 h-3'}`}
              title={level === 0 ? 'No activity' : `Activity level ${level}`}
            />
          ))}
          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 ml-1">More</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltipData && (
        <div
          className="fixed z-50 px-2 py-1 text-xs bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded shadow-lg pointer-events-none"
          style={{
            left: tooltipData.x,
            top: tooltipData.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
          data-testid={`${testId}-tooltip`}
        >
          <div className="font-medium">
            {tooltipData.count === 0
              ? 'No contributions'
              : `${tooltipData.count} contribution${tooltipData.count !== 1 ? 's' : ''}`}
          </div>
          <div className="text-gray-300 dark:text-gray-600">
            {formatTooltipDate(tooltipData.date)}
          </div>
        </div>
      )}
    </div>
  );
}

export default ContributionChart;
