/**
 * ActiveAgentCard - Per-agent live status card for the Activity dashboard
 */

import { useState, useEffect } from 'react';
import { Terminal, Square, Crown, Wrench, Shield } from 'lucide-react';
import type { Agent, SessionRecord, Task } from '../../api/types.js';
import type { AgentOutput } from '../../api/hooks/useActiveAgentOutputs.js';

export interface ActiveAgentCardProps {
  agent: Agent;
  session: SessionRecord;
  currentTask?: Task;
  lastOutput?: AgentOutput;
  onOpenTerminal: (agentId: string) => void;
  onStop: (agentId: string) => void;
  isStopping: boolean;
}

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  director: { label: 'Director', icon: Crown, color: 'text-[var(--color-warning)]' },
  worker: { label: 'Worker', icon: Wrench, color: 'text-[var(--color-primary)]' },
  steward: { label: 'Steward', icon: Shield, color: 'text-[var(--color-info)]' },
};

function formatDuration(startTime: number | string): string {
  const ms = Date.now() - (typeof startTime === 'number' ? startTime : new Date(startTime).getTime());
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function ActiveAgentCard({
  agent,
  session,
  currentTask,
  lastOutput,
  onOpenTerminal,
  onStop,
  isStopping,
}: ActiveAgentCardProps) {
  const [elapsed, setElapsed] = useState('');
  const startTime = session.startedAt || session.createdAt;

  // Live-updating duration
  useEffect(() => {
    setElapsed(formatDuration(startTime));
    const interval = setInterval(() => setElapsed(formatDuration(startTime)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const role = session.agentRole || agent.metadata?.agent?.agentRole || 'worker';
  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.worker;
  const RoleIcon = roleConfig.icon;
  const isRunning = session.status === 'running';
  const isStarting = session.status === 'starting';

  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
      data-testid={`active-agent-card-${agent.id}`}
    >
      {/* Row 1: Status dot + name + role badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            isRunning
              ? 'bg-[var(--color-success)] animate-pulse'
              : isStarting
                ? 'bg-[var(--color-warning)] animate-pulse'
                : 'bg-[var(--color-text-tertiary)]'
          }`}
        />
        <span className="font-semibold text-sm text-[var(--color-text)] truncate">
          {agent.name}
        </span>
        <span
          className={`flex items-center gap-1 ml-auto text-xs font-medium ${roleConfig.color}`}
        >
          <RoleIcon className="w-3 h-3" />
          {roleConfig.label}
        </span>
      </div>

      {/* Row 2: Task info */}
      <div className="text-xs text-[var(--color-text-secondary)] truncate">
        {currentTask ? (
          <>
            Working on:{' '}
            <span className="font-medium text-[var(--color-text)]">
              {currentTask.externalRef || currentTask.id}
            </span>{' '}
            <span className="text-[var(--color-text-secondary)]">
              {currentTask.title}
            </span>
          </>
        ) : (
          <span className="text-[var(--color-text-tertiary)]">No task assigned</span>
        )}
      </div>

      {/* Row 3: Last output (bordered block) + duration */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
          <span className="text-xs font-mono text-[var(--color-text-secondary)] line-clamp-3">
            {lastOutput?.content
              ? lastOutput.content
              : isStarting
                ? 'starting...'
                : isRunning
                  ? 'working...'
                  : 'idle...'}
          </span>
        </div>
        <span className="text-xs text-[var(--color-text-secondary)] font-mono flex-shrink-0 pt-2">
          {elapsed}
        </span>
      </div>

      {/* Row 4: Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onOpenTerminal(agent.id)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
        >
          <Terminal className="w-3 h-3" />
          {role === 'director' ? 'Open Panel' : 'Open Terminal'}
        </button>
        <button
          onClick={() => onStop(agent.id)}
          disabled={isStopping}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-[var(--color-border)] text-[var(--color-error)] hover:bg-[var(--color-error-muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
        >
          <Square className="w-3 h-3" />
          {isStopping ? 'Stopping...' : 'Stop'}
        </button>
      </div>
    </div>
  );
}
