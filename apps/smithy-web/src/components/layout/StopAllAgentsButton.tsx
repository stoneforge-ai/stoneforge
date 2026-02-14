/**
 * StopAllAgentsButton - Button to stop all running agent sessions
 *
 * Displays in the header and allows stopping all running agents with one click.
 * Disabled when there are no running sessions.
 */

import { StopCircle, Loader2 } from 'lucide-react';
import { useSessions, useStopAllAgents } from '../../api/hooks';
import { Tooltip } from '@stoneforge/ui';

export function StopAllAgentsButton() {
  const stopAllAgents = useStopAllAgents();
  const { data: sessionsData } = useSessions({ status: 'starting,running' });

  const runningCount = sessionsData?.sessions?.length ?? 0;
  const hasRunningSessions = runningCount > 0;

  const handleClick = () => {
    if (stopAllAgents.isPending || !hasRunningSessions) return;
    stopAllAgents.mutate();
  };

  const tooltipContent = stopAllAgents.isPending
    ? 'Stopping all agents...'
    : hasRunningSessions
      ? `Stop all running agents (${runningCount})`
      : 'No running agents';

  return (
    <Tooltip content={tooltipContent} side="bottom">
      <button
        onClick={handleClick}
        disabled={stopAllAgents.isPending || !hasRunningSessions}
        className={`
          flex items-center gap-2 px-2.5 py-1.5 text-sm font-medium rounded-md
          transition-colors duration-150
          ${hasRunningSessions
            ? 'text-[var(--color-text-secondary)] bg-[var(--color-surface)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger-text)]'
            : 'text-[var(--color-text-tertiary)] bg-[var(--color-surface)]'
          }
          border border-[var(--color-border)]
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label={tooltipContent}
        data-testid="stop-all-agents-button"
      >
        {stopAllAgents.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <StopCircle className="w-4 h-4" />
        )}
        <span className="hidden lg:inline">
          {stopAllAgents.isPending ? 'Stopping...' : 'Stop All'}
        </span>
        {hasRunningSessions && !stopAllAgents.isPending && (
          <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-medium bg-[var(--color-danger)]/10 text-[var(--color-danger-text)] rounded-full">
            {runningCount}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
