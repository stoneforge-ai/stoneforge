/**
 * ActiveAgentsDashboard - Grid container rendering ActiveAgentCards
 * for all currently running agent sessions.
 */

import { useMemo, useState } from 'react';
import { useAgentsByRole, useSessions } from '../../api/hooks/useAgents.js';
import { useTasksByStatus } from '../../api/hooks/useTasks.js';
import { useActiveAgentOutputs } from '../../api/hooks/useActiveAgentOutputs.js';
import type { RunningSessionInfo } from '../../api/hooks/useActiveAgentOutputs.js';
import { useLatestSessionMessages } from '../../api/hooks/useLatestSessionMessages.js';
import { useDaemonStatus } from '../../api/hooks/useDaemon.js';
import { ActiveAgentCard } from './ActiveAgentCard.js';
import type { Agent, SessionRecord, Task } from '../../api/types.js';
import type { AgentOutput } from '../../api/hooks/useActiveAgentOutputs.js';

interface ActiveAgentsDashboardProps {
  onOpenTerminal: (agentId: string) => void;
  onOpenDirectorPanel: () => void;
  onStopAgent: (agentId: string) => Promise<void>;
}

// Role priority for sorting: director first, then workers, then stewards
const ROLE_ORDER: Record<string, number> = { director: 0, worker: 1, steward: 2 };

export function ActiveAgentsDashboard({ onOpenTerminal, onOpenDirectorPanel, onStopAgent }: ActiveAgentsDashboardProps) {
  const { allAgents } = useAgentsByRole();
  const { data: sessionsData } = useSessions({ status: 'running' });
  const { inProgress, awaitingMerge } = useTasksByStatus();
  const runningSessions = sessionsData?.sessions ?? [];

  // Build running session info for seeding initial output state
  const runningSessionInfos = useMemo<RunningSessionInfo[]>(() => {
    return runningSessions.map((s) => ({ sessionId: s.id, agentId: s.agentId }));
  }, [runningSessions]);

  const { outputByAgent } = useActiveAgentOutputs(runningSessionInfos);
  const { data: daemonStatus } = useDaemonStatus();
  const [stoppingAgents, setStoppingAgents] = useState<Set<string>>(new Set());

  // Collect session IDs for latest messages polling
  const sessionIds = useMemo(
    () => runningSessions.map((s) => s.id),
    [runningSessions]
  );
  const { latestBySession } = useLatestSessionMessages(sessionIds);

  // Build agent lookup
  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of allAgents) m.set(a.id, a);
    return m;
  }, [allAgents]);

  // Build task lookup by assignee — include both in_progress tasks (for workers)
  // and awaitingMerge tasks (for merge stewards). in_progress tasks take priority
  // so workers always see their active task rather than a previously completed one.
  const taskByAssignee = useMemo(() => {
    const m = new Map<string, Task>();
    // Add awaitingMerge tasks first (lower priority)
    for (const t of awaitingMerge) {
      if (t.assignee) m.set(t.assignee, t);
    }
    // Add in_progress tasks second so they overwrite any awaitingMerge entries
    for (const t of inProgress) {
      if (t.assignee) m.set(t.assignee, t);
    }
    return m;
  }, [inProgress, awaitingMerge]);

  // Join data and sort
  const activeAgents = useMemo(() => {
    const items: { agent: Agent; session: SessionRecord; task?: Task }[] = [];

    for (const session of runningSessions) {
      const agent = agentMap.get(session.agentId);
      if (!agent) continue;

      const task = taskByAssignee.get(agent.id);
      items.push({ agent, session, task });
    }

    // Sort by role priority
    items.sort((a, b) => {
      const aOrder = ROLE_ORDER[a.session.agentRole] ?? 1;
      const bOrder = ROLE_ORDER[b.session.agentRole] ?? 1;
      return aOrder - bOrder;
    });

    return items;
  }, [runningSessions, agentMap, taskByAssignee]);

  const handleStop = async (agentId: string) => {
    setStoppingAgents((prev) => new Set(prev).add(agentId));
    try {
      await onStopAgent(agentId);
    } finally {
      setStoppingAgents((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  if (activeAgents.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 px-4 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]"
        data-testid="active-agents-empty"
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          No agents are currently active
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
          {daemonStatus?.isRunning
            ? 'The daemon is running and will start agents when tasks are available.'
            : 'Start the daemon or launch agents manually from the Agents page.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-3 grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3"
      data-testid="active-agents-dashboard"
    >
      {activeAgents.map(({ agent, session, task }) => {
        // Choose the freshest output between SSE real-time data and polling data.
        // SSE entries can become stale (e.g. after the 100-event cap is hit),
        // so we compare timestamps to always display the most recent data.
        const sseOutput = outputByAgent.get(agent.id);
        const persisted = latestBySession[session.id];
        let effectiveOutput: AgentOutput | undefined;

        if (sseOutput && persisted?.content) {
          // Both sources have data — use whichever is more recent
          effectiveOutput = new Date(sseOutput.timestamp) >= new Date(persisted.timestamp)
            ? sseOutput
            : {
                content: persisted.content,
                timestamp: persisted.timestamp,
                eventType: persisted.type as AgentOutput['eventType'],
              };
        } else if (sseOutput) {
          effectiveOutput = sseOutput;
        } else if (persisted?.content) {
          effectiveOutput = {
            content: persisted.content,
            timestamp: persisted.timestamp,
            eventType: persisted.type as AgentOutput['eventType'],
          };
        }

        return (
          <ActiveAgentCard
            key={session.id}
            agent={agent}
            session={session}
            currentTask={task}
            lastOutput={effectiveOutput}
            onOpenTerminal={
              session.agentRole === 'director'
                ? () => onOpenDirectorPanel()
                : () => onOpenTerminal(agent.id)
            }
            onStop={handleStop}
            isStopping={stoppingAgents.has(agent.id)}
          />
        );
      })}
    </div>
  );
}
