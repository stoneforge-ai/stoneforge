/**
 * RateLimitBanner - Site-wide banner shown when the dispatch daemon is paused due to rate limits
 *
 * Displays a warning banner between the header and main content area when the daemon
 * is sleeping due to rate limits. Shows the wake-up time, a "Wake Now" button, and
 * a dismiss (X) button. Automatically reappears if a new rate limit event occurs.
 */

import { useState, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Clock, X, Loader2, Settings } from 'lucide-react';
import { useDaemonStatus, useWakeDaemon } from '../../api/hooks';

/**
 * Formats an ISO date string into a human-readable time string.
 * Shows relative time if within 60 minutes, otherwise shows absolute time.
 */
function formatWakeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'any moment now';
  }

  const diffMinutes = Math.ceil(diffMs / 60000);

  if (diffMinutes <= 1) {
    return 'in less than a minute';
  }

  if (diffMinutes < 60) {
    return `in ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
  }

  // Show absolute time for longer waits
  return `at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function RateLimitBanner() {
  const { data: status } = useDaemonStatus();
  const wakeDaemon = useWakeDaemon();

  // Track which soonestReset timestamp the user has dismissed.
  // When soonestReset changes (new rate limit event), the banner reappears.
  const [dismissedUntil, setDismissedUntil] = useState<string | null>(null);

  const isPaused = status?.rateLimit?.isPaused === true;
  const soonestReset = status?.rateLimit?.soonestReset;
  const limits = status?.rateLimit?.limits ?? [];

  // Determine if the banner was dismissed for the current sleep session
  const isDismissed = useMemo(() => {
    if (!dismissedUntil || !soonestReset) return false;
    return dismissedUntil === soonestReset;
  }, [dismissedUntil, soonestReset]);

  // Don't render anything if not rate-limited or dismissed
  if (!isPaused || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    if (soonestReset) {
      setDismissedUntil(soonestReset);
    }
  };

  const handleWakeNow = () => {
    wakeDaemon.mutate();
  };

  const wakeTimeText = soonestReset ? formatWakeTime(soonestReset) : 'soon';

  // Build executable names text from limits array
  const executableNames = limits.map((l) => l.executable);
  const rateLimitDetail = executableNames.length > 0
    ? ` — ${executableNames.join(', ')} hit ${executableNames.length === 1 ? 'its' : 'their'} rate limit${executableNames.length === 1 ? '' : 's'}.`
    : ' — rate limit reached.';

  return (
    <div
      className="flex items-center gap-3 px-4 md:px-6 py-2 bg-[var(--color-warning-bg)] border-b border-[var(--color-warning)]/30"
      role="alert"
      data-testid="rate-limit-banner"
    >
      <Clock className="w-4 h-4 text-[var(--color-warning-text)] flex-shrink-0" />

      <p className="flex-1 text-sm text-[var(--color-warning-text)]">
        <span className="font-medium">Dispatch paused</span>
        <span className="hidden sm:inline">{rateLimitDetail}</span>
        {' '}Waking {wakeTimeText}.
      </p>

      <Link
        to="/settings"
        search={{ tab: 'preferences' }}
        className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md
          text-[var(--color-warning-text)]
          hover:bg-[var(--color-warning)]/20
          border border-transparent
          transition-colors duration-150
          flex-shrink-0"
        data-testid="rate-limit-configure-button"
      >
        <Settings className="w-3 h-3" />
        <span className="hidden md:inline">Configure</span>
      </Link>

      <button
        onClick={handleWakeNow}
        disabled={wakeDaemon.isPending}
        className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md
          bg-[var(--color-warning)]/20 text-[var(--color-warning-text)]
          hover:bg-[var(--color-warning)]/30
          border border-[var(--color-warning)]/30
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          flex-shrink-0"
        data-testid="rate-limit-wake-button"
      >
        {wakeDaemon.isPending ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Waking...</span>
          </>
        ) : (
          <span>Wake Now</span>
        )}
      </button>

      <button
        onClick={handleDismiss}
        className="p-1 rounded-md text-[var(--color-warning-text)] hover:bg-[var(--color-warning)]/20 transition-colors duration-150 flex-shrink-0"
        aria-label="Dismiss rate limit banner"
        data-testid="rate-limit-dismiss-button"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
