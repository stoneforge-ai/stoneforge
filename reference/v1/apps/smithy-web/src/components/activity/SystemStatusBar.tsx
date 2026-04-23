/**
 * SystemStatusBar - Compact row of stat pills showing system pulse at a glance
 */

import { Activity, CheckCircle, GitPullRequest, Users } from 'lucide-react';
import { useSessions } from '../../api/hooks/useAgents.js';
import { useTasksByStatus } from '../../api/hooks/useTasks.js';
import { useDaemonStatus } from '../../api/hooks/useDaemon.js';

export function SystemStatusBar() {
  const { data: sessionsData } = useSessions({ status: 'running' });
  const { inProgress, awaitingMerge, closed } = useTasksByStatus();
  const { data: daemonStatus } = useDaemonStatus();

  const activeAgentCount = sessionsData?.sessions?.length ?? 0;

  return (
    <div
      className="flex items-center gap-3 flex-wrap"
      data-testid="system-status-bar"
    >
      <StatusPill
        icon={<Users className="w-3.5 h-3.5" />}
        label="Active Agents"
        value={activeAgentCount}
        color={activeAgentCount > 0 ? 'primary' : 'muted'}
      />
      <StatusPill
        icon={<Activity className="w-3.5 h-3.5" />}
        label="In Progress"
        value={inProgress.length}
        color={inProgress.length > 0 ? 'warning' : 'muted'}
      />
      <StatusPill
        icon={<GitPullRequest className="w-3.5 h-3.5" />}
        label="In Review"
        value={awaitingMerge.length}
        color={awaitingMerge.length > 0 ? 'info' : 'muted'}
      />
      <StatusPill
        icon={<CheckCircle className="w-3.5 h-3.5" />}
        label="Completed"
        value={closed.length}
        color="muted"
      />
      <div className="ml-auto flex items-center gap-1.5 text-xs">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            daemonStatus?.isRunning
              ? 'bg-[var(--color-success)] animate-pulse'
              : 'bg-[var(--color-error)]'
          }`}
        />
        <span className="text-[var(--color-text-secondary)]">
          {daemonStatus?.isRunning ? 'Daemon Running' : 'Daemon Stopped'}
        </span>
      </div>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'primary' | 'warning' | 'info' | 'muted';
}) {
  const colorClasses: Record<typeof color, string> = {
    primary: 'text-[var(--color-primary)] bg-[var(--color-primary-muted)]',
    warning: 'text-[var(--color-warning)] bg-[var(--color-warning-muted)]',
    info: 'text-[var(--color-info)] bg-[var(--color-info-muted)]',
    muted: 'text-[var(--color-text-secondary)] bg-[var(--color-surface)]',
  };

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--color-border)] ${colorClasses[color]}`}
    >
      {icon}
      <span>{value}</span>
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
    </div>
  );
}
