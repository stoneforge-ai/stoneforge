/**
 * DaemonToggle - Autopilot toggle for dispatch daemon control
 *
 * Displays autopilot status and allows starting/stopping the dispatch daemon.
 * Shows in the header next to other controls.
 */

import { Play, Square, Loader2, AlertCircle } from 'lucide-react';
import { useDaemonStatus, useStartDaemon, useStopDaemon } from '../../api/hooks';
import { Tooltip } from '@stoneforge/ui';

export function DaemonToggle() {
  const { data: status, isLoading, isError } = useDaemonStatus();
  const startDaemon = useStartDaemon();
  const stopDaemon = useStopDaemon();

  const isMutating = startDaemon.isPending || stopDaemon.isPending;

  const handleToggle = () => {
    if (isMutating) return;

    if (status?.isRunning) {
      stopDaemon.mutate();
    } else {
      startDaemon.mutate();
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-[var(--color-text-tertiary)]">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  // Error state or daemon not available
  if (isError || !status?.available) {
    return (
      <Tooltip content={status?.reason || 'Daemon unavailable'} side="bottom">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[var(--color-text-tertiary)] cursor-not-allowed">
          <AlertCircle className="w-4 h-4" />
          <span className="hidden lg:inline text-sm">Autopilot</span>
        </div>
      </Tooltip>
    );
  }

  const isRunning = status.isRunning;
  const tooltipContent = isRunning
    ? 'Stop autopilot'
    : 'Start autopilot';

  return (
    <Tooltip content={tooltipContent} side="bottom">
      <button
        onClick={handleToggle}
        disabled={isMutating}
        className={`
          flex items-center gap-2 px-2.5 py-1.5 text-sm font-medium rounded-md
          transition-colors duration-150
          ${isRunning
            ? 'text-[var(--color-success-text)] bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/20'
            : 'text-[var(--color-text-secondary)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
          }
          border border-[var(--color-border)]
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label={tooltipContent}
        data-testid="daemon-toggle"
      >
        {isMutating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isRunning ? (
          <Square className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        <span className="hidden lg:inline">
          {isMutating
            ? (isRunning ? 'Stopping...' : 'Starting...')
            : (isRunning ? 'Autopilot' : 'Autopilot')
          }
        </span>
        {/* Status indicator dot */}
        <div
          className={`w-2 h-2 rounded-full ${
            isRunning ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-tertiary)]'
          }`}
        />
      </button>
    </Tooltip>
  );
}
