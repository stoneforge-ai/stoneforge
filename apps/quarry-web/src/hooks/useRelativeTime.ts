/**
 * Hook for displaying and updating relative times
 * TB94: Inbox Time-Ago Indicator
 *
 * Provides automatic updates for relative time displays with smart intervals:
 * - Recent items (< 1 hour): update every minute
 * - Today: update every 5 minutes
 * - Older: update every hour
 */

import { useState, useEffect, useCallback } from 'react';
import { formatRelativeTime, formatCompactTime, getSmartUpdateInterval } from '../lib/time';

/**
 * Hook that returns a formatted relative time string and keeps it updated
 *
 * @param date - The date to format
 * @param compact - If true, uses compact format (e.g., "5m" instead of "5m ago")
 * @returns The formatted relative time string
 */
export function useRelativeTime(
  date: Date | string | null | undefined,
  compact = false
): string {
  const [formattedTime, setFormattedTime] = useState(() => {
    if (!date) return '';
    return compact ? formatCompactTime(date) : formatRelativeTime(date);
  });

  useEffect(() => {
    if (!date) {
      setFormattedTime('');
      return;
    }

    // Format immediately
    const format = () => {
      setFormattedTime(compact ? formatCompactTime(date) : formatRelativeTime(date));
    };
    format();

    // Set up interval based on how old the date is
    const interval = getSmartUpdateInterval([date]);
    const timer = setInterval(format, interval);

    return () => clearInterval(timer);
  }, [date, compact]);

  return formattedTime;
}

/**
 * Hook that triggers a re-render at smart intervals for a list of dates
 * Use this when you have multiple dates and want them all to update together
 *
 * @param dates - Array of dates in the list
 * @returns A trigger value that changes when times should be updated
 */
export function useRelativeTimeUpdater(dates: (Date | string)[]): number {
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (dates.length === 0) return;

    const interval = getSmartUpdateInterval(dates);
    const timer = setInterval(() => {
      setTrigger((prev) => prev + 1);
    }, interval);

    return () => clearInterval(timer);
  }, [dates]);

  return trigger;
}

/**
 * Hook that provides a function to format relative times, with auto-updating
 * The returned function will always use the current time for calculations
 *
 * @returns Object with format functions and update trigger
 */
export function useRelativeTimeFormatter() {
  const [, setUpdateCount] = useState(0);

  // Force a re-render every minute for the most responsive updates
  useEffect(() => {
    const timer = setInterval(() => {
      setUpdateCount((prev) => prev + 1);
    }, 60000); // 1 minute

    return () => clearInterval(timer);
  }, []);

  const format = useCallback((date: Date | string | null | undefined): string => {
    if (!date) return '';
    return formatRelativeTime(date);
  }, []);

  const formatCompact = useCallback((date: Date | string | null | undefined): string => {
    if (!date) return '';
    return formatCompactTime(date);
  }, []);

  return { format, formatCompact };
}
