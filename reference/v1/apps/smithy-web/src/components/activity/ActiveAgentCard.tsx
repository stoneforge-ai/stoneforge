/**
 * ActiveAgentCard - Per-agent live status cards for the Activity dashboard.
 *
 * Two variants:
 * - InteractiveAgentCard: For directors and persistent workers (compact single-row, no output)
 * - HeadlessAgentCard: For stewards and ephemeral workers (row + collapsible output section)
 */

import { useState, useEffect } from 'react';
import { Terminal, Square, Crown, Wrench, Shield, ChevronDown } from 'lucide-react';
import type { Agent, SessionRecord, Task } from '../../api/types.js';
import type { AgentOutput } from '../../api/hooks/useActiveAgentOutputs.js';
import { useAgentTokens, formatTokenCount, formatCost } from '../../api/hooks/useAgentTokens.js';

export interface ActiveAgentCardProps {
  agent: Agent;
  session: SessionRecord;
  currentTask?: Task;
  lastOutput?: AgentOutput;
  onOpenTerminal: (agentId: string) => void;
  onStop: (agentId: string) => void;
  isStopping: boolean;
}

// Shared constants
export const ROLE_CONFIG: Record<string, { label: string; icon: typeof Crown; color: string; borderColor: string }> = {
  director: { label: 'Director', icon: Crown, color: 'text-[var(--color-warning)]', borderColor: 'border-l-[var(--color-warning)]' },
  worker: { label: 'Worker', icon: Wrench, color: 'text-[var(--color-primary)]', borderColor: 'border-l-[var(--color-primary)]' },
  steward: { label: 'Steward', icon: Shield, color: 'text-[var(--color-info)]', borderColor: 'border-l-[var(--color-info)]' },
};

export function formatDuration(startTime: number | string): string {
  const ms = Date.now() - (typeof startTime === 'number' ? startTime : new Date(startTime).getTime());
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * Determine whether a session should use the interactive or headless card variant.
 * - Interactive: role=director OR workerMode=persistent
 * - Headless: role=steward OR (role=worker AND workerMode !== persistent)
 */
export function isInteractiveSession(session: SessionRecord): boolean {
  const role = session.agentRole || 'worker';
  if (role === 'director') return true;
  if (role === 'steward') return false;
  // role === 'worker'
  return session.workerMode === 'persistent';
}

// ── Shared sub-components ──────────────────────────────────────────────

function StatusDot({ session }: { session: SessionRecord }) {
  const isRunning = session.status === 'running';
  const isStarting = session.status === 'starting';
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        isRunning
          ? 'bg-[var(--color-success)] animate-pulse'
          : isStarting
            ? 'bg-[var(--color-warning)] animate-pulse'
            : 'bg-[var(--color-text-tertiary)]'
      }`}
    />
  );
}

function RoleBadge({ role }: { role: string }) {
  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.worker;
  const RoleIcon = roleConfig.icon;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${roleConfig.color}`}>
      <RoleIcon className="w-3 h-3" />
      {roleConfig.label}
    </span>
  );
}

function TaskInfo({ currentTask }: { currentTask?: Task }) {
  if (!currentTask) {
    return (
      <span className="text-xs text-[var(--color-text-tertiary)] italic">
        Idle — no task assigned
      </span>
    );
  }
  return (
    <span className="text-xs text-[var(--color-text-secondary)]">
      <span className="inline-block font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] mr-1.5">
        {currentTask.externalRef || currentTask.id}
      </span>
      <span className="text-[var(--color-text)]">
        {currentTask.title}
      </span>
    </span>
  );
}

function ElapsedAndTokens({ session, agentId }: { session: SessionRecord; agentId: string }) {
  const [elapsed, setElapsed] = useState('');
  const startTime = session.startedAt || session.createdAt;
  const { tokens: agentTokens } = useAgentTokens(agentId, session.id);

  useEffect(() => {
    setElapsed(formatDuration(startTime));
    const interval = setInterval(() => setElapsed(formatDuration(startTime)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
      <span className="text-xs text-[var(--color-text-secondary)] font-mono">
        {elapsed}
      </span>
      {agentTokens && agentTokens.totalTokens > 0 && (() => {
        const tooltipParts = [
          `Input: ${agentTokens.inputTokens.toLocaleString()}`,
          `Output: ${agentTokens.outputTokens.toLocaleString()}`,
        ];
        if (agentTokens.cacheReadTokens > 0) {
          tooltipParts.push(`Cache Read: ${agentTokens.cacheReadTokens.toLocaleString()}`);
        }
        if (agentTokens.cacheCreationTokens > 0) {
          tooltipParts.push(`Cache Creation: ${agentTokens.cacheCreationTokens.toLocaleString()}`);
        }
        if (agentTokens.estimatedCost != null && agentTokens.estimatedCost > 0) {
          tooltipParts.push(`Est. Cost: ${formatCost(agentTokens.estimatedCost)}`);
        }
        const hasCacheIndicator = agentTokens.inputTokens > 0
          && agentTokens.cacheReadTokens / agentTokens.inputTokens > 0.1;
        return (
          <span
            className="text-[10px] font-mono text-[var(--color-text-tertiary)]"
            title={tooltipParts.join(' | ')}
            data-testid="agent-card-token-usage"
          >
            {formatTokenCount(agentTokens.inputTokens)} in / {formatTokenCount(agentTokens.outputTokens)} out
            {hasCacheIndicator && (
              <span className="ml-1 text-[var(--color-success)]" title="High cache hit rate">⚡</span>
            )}
          </span>
        );
      })()}
    </div>
  );
}

function ActionButtons({
  agent,
  role,
  onOpenTerminal,
  onStop,
  isStopping,
}: {
  agent: Agent;
  role: string;
  onOpenTerminal: (agentId: string) => void;
  onStop: (agentId: string) => void;
  isStopping: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
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
  );
}

// ── InteractiveAgentCard ───────────────────────────────────────────────

/**
 * Compact single-row card for directors and persistent workers.
 * No last-output section (data is unreliable for interactive sessions).
 */
export function InteractiveAgentCard({
  agent,
  session,
  currentTask,
  onOpenTerminal,
  onStop,
  isStopping,
}: ActiveAgentCardProps) {
  const role = session.agentRole || agent.metadata?.agent?.agentRole || 'worker';
  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.worker;

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border border-[var(--color-border)] border-l-2 ${roleConfig.borderColor} bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150`}
      data-testid={`active-agent-card-${agent.id}`}
    >
      {/* Left zone: Status + name + role */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusDot session={session} />
        <span className="font-semibold text-sm text-[var(--color-text)]">
          {agent.name}
        </span>
        <RoleBadge role={role} />
      </div>

      {/* Center zone: Task info */}
      <div className="flex-1 min-w-0">
        <TaskInfo currentTask={currentTask} />
      </div>

      {/* Right zone: Elapsed + tokens + actions */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <ElapsedAndTokens session={session} agentId={agent.id} />
        <ActionButtons
          agent={agent}
          role={role}
          onOpenTerminal={onOpenTerminal}
          onStop={onStop}
          isStopping={isStopping}
        />
      </div>
    </div>
  );
}

// ── HeadlessAgentCard ──────────────────────────────────────────────────

/**
 * Two-part card for stewards and ephemeral workers:
 * info row on top, expandable output section below.
 */
export function HeadlessAgentCard({
  agent,
  session,
  currentTask,
  lastOutput,
  onOpenTerminal,
  onStop,
  isStopping,
}: ActiveAgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const role = session.agentRole || agent.metadata?.agent?.agentRole || 'worker';
  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.worker;
  const isRunning = session.status === 'running';
  const isStarting = session.status === 'starting';

  const outputContent = lastOutput?.content
    ? lastOutput.content
    : isStarting
      ? 'starting...'
      : isRunning
        ? 'working...'
        : 'idle...';

  return (
    <div
      className={`flex flex-col rounded-lg border border-[var(--color-border)] border-l-2 ${roleConfig.borderColor} bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150`}
      data-testid={`active-agent-card-${agent.id}`}
    >
      {/* Top row */}
      <div className="flex items-center gap-4 p-4">
        {/* Left zone: Status + name + role */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusDot session={session} />
          <span className="font-semibold text-sm text-[var(--color-text)]">
            {agent.name}
          </span>
          <RoleBadge role={role} />
        </div>

        {/* Center zone: Task info */}
        <div className="flex-1 min-w-0">
          <TaskInfo currentTask={currentTask} />
        </div>

        {/* Right zone: Elapsed + tokens + actions + chevron */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <ElapsedAndTokens session={session} agentId={agent.id} />
          <ActionButtons
            agent={agent}
            role={role}
            onOpenTerminal={onOpenTerminal}
            onStop={onStop}
            isStopping={isStopping}
          />
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center justify-center w-8 h-8 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            aria-label={expanded ? 'Collapse output' : 'Expand output'}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Bottom section: Collapsible output */}
      <div
        className="px-4 pb-4 -mt-1 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
          {expanded ? (
            <div className="max-h-60 overflow-y-auto">
              <span className="text-xs font-mono text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
                {outputContent}
              </span>
            </div>
          ) : (
            <div className="relative">
              <span className="text-xs font-mono text-[var(--color-text-secondary)] line-clamp-2">
                {outputContent}
              </span>
              {lastOutput?.content && lastOutput.content.length > 120 && (
                <span className="text-[10px] text-[var(--color-text-tertiary)] mt-1 block">
                  Click to show more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Default export: delegates to correct variant ───────────────────────

/**
 * Wrapper component that delegates to the appropriate card variant
 * based on the session's role and worker mode.
 */
export function ActiveAgentCard(props: ActiveAgentCardProps) {
  if (isInteractiveSession(props.session)) {
    return <InteractiveAgentCard {...props} />;
  }
  return <HeadlessAgentCard {...props} />;
}
