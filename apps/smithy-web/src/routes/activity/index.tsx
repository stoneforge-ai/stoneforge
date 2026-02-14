/**
 * Activity Page - Command center for the orchestrator
 *
 * Answers: "What is actively happening?" and "What has been accomplished?"
 * with the ability to jump to workspaces or stop agents directly.
 */

import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Activity as ActivityIcon, RefreshCw, Radio, WifiOff } from 'lucide-react';
import { useKeyboardShortcut } from '@stoneforge/ui';
import { getCurrentBinding, formatKeyBinding } from '../../lib/keyboard';
import { useActivityStream } from '../../api/hooks/useActivity.js';
import { useStopAgentSession } from '../../api/hooks/useAgents.js';
import { useDaemonStatus } from '../../api/hooks/useDaemon.js';
import {
  SystemStatusBar,
  ActiveAgentsDashboard,
  RecentCompletions,
  CollapsibleActivityFeed,
} from '../../components/activity/index.js';

export function ActivityPage() {
  const navigate = useNavigate();
  const { isConnected } = useActivityStream('all');
  const { data: daemonStatus } = useDaemonStatus();
  const stopSession = useStopAgentSession();

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  useKeyboardShortcut(
    getCurrentBinding('action.refreshActivity'),
    handleRefresh,
    'Refresh Activity'
  );

  const handleOpenTerminal = useCallback(
    (agentId: string) => {
      navigate({ to: '/workspaces', search: { layout: 'single', agent: agentId, resumeSessionId: undefined, resumePrompt: undefined } });
    },
    [navigate]
  );

  const handleOpenDirectorPanel = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-director-panel'));
  }, []);

  const handleStopAgent = useCallback(
    async (agentId: string) => {
      await stopSession.mutateAsync({ agentId, graceful: true });
    },
    [stopSession]
  );

  return (
    <div className="space-y-6 animate-fade-in" data-testid="activity-page">
      {/* Page header */}
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <ActivityIcon className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Activity</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Command center for agent orchestration
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
              isConnected
                ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]'
                : 'bg-[var(--color-error-muted)] text-[var(--color-error)]'
            }`}
            data-testid="activity-connection-status"
          >
            {isConnected ? (
              <>
                <Radio className="w-3 h-3" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                Offline
              </>
            )}
          </div>

          {/* Daemon status */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
              daemonStatus?.isRunning
                ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)]'
            }`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                daemonStatus?.isRunning ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-tertiary)]'
              }`}
            />
            Daemon
          </div>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            data-testid="activity-refresh"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
            <kbd className="ml-1 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] px-1 py-0.5 rounded border border-[var(--color-border)]">
              {formatKeyBinding(getCurrentBinding('action.refreshActivity'))}
            </kbd>
          </button>
        </div>
      </div>

      {/* Section 1: System Status Bar */}
      <SystemStatusBar />

      {/* Section 2: Active Agents Dashboard */}
      <div>
        <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          Active Agents
        </h2>
        <ActiveAgentsDashboard
          onOpenTerminal={handleOpenTerminal}
          onOpenDirectorPanel={handleOpenDirectorPanel}
          onStopAgent={handleStopAgent}
        />
      </div>

      {/* Section 3: Recent Completions */}
      <RecentCompletions />

      {/* Section 4: Activity Feed (collapsed by default) */}
      <CollapsibleActivityFeed />
    </div>
  );
}
