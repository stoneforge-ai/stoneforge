import { useState, useMemo } from 'react'
import { Clock, GitBranch, ExternalLink, FileText, Cpu } from 'lucide-react'
import type { AgentExtended } from './agent-types'
import type { Session } from '../sessions/session-types'
import { mockSessions } from '../../../mock-data'
import { useTeamContext } from '../../../TeamContext'
import { UserAvatar } from '../../UserAvatar'

interface AgentSessionsTabProps {
  agent: AgentExtended
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
}

type SessionFilter = 'all' | 'active' | 'completed' | 'error'

const statusColor: Record<string, string> = {
  active: 'var(--color-success)', completed: 'var(--color-text-tertiary)', error: 'var(--color-danger)',
}

export function AgentSessionsTab({ agent, onNavigateToTask, onNavigateToSession }: AgentSessionsTabProps) {
  const [filter, setFilter] = useState<SessionFilter>('all')
  const { isTeamMode } = useTeamContext()

  // Filter global mockSessions by agent name match
  const agentSessions = useMemo(() => {
    return mockSessions.filter(s => s.agent.name === agent.name || s.agent.id === agent.id)
  }, [agent.name, agent.id])

  // Build a map of embedded session IDs → launchedByUserId for attribution
  const sessionLauncherMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of agent.sessions) {
      if (s.launchedByUserId) map.set(s.id, s.launchedByUserId)
    }
    return map
  }, [agent.sessions])

  const sessions = filter === 'all' ? agentSessions : agentSessions.filter(s => s.status === filter)

  const counts = {
    all: agentSessions.length,
    active: agentSessions.filter(s => s.status === 'active').length,
    completed: agentSessions.filter(s => s.status === 'completed').length,
    error: agentSessions.filter(s => s.status === 'error').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['all', 'active', 'completed', 'error'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              height: 24, padding: '0 8px', fontSize: 11, fontWeight: 500,
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              background: filter === f ? 'var(--color-surface-active)' : 'var(--color-surface)',
              color: filter === f ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} {counts[f] > 0 && `(${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          {filter === 'all' ? 'No sessions yet' : `No ${filter} sessions`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sessions.map(session => (
            <SessionRow
              key={session.id}
              session={session}
              launchedByUserId={sessionLauncherMap.get(session.id) || agent.ownerUserId}
              isTeamMode={isTeamMode}
              onNavigateToSession={onNavigateToSession}
              onNavigateToTask={onNavigateToTask}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionRow({ session, launchedByUserId, isTeamMode, onNavigateToSession, onNavigateToTask }: {
  session: Session
  launchedByUserId?: string
  isTeamMode?: boolean
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToTask?: (taskId: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const { getUserById } = useTeamContext()
  const launcherUser = launchedByUserId ? getUserById(launchedByUserId) : undefined

  return (
    <div
      onClick={() => onNavigateToSession?.(session.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        cursor: onNavigateToSession ? 'pointer' : 'default',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: hovered ? 'var(--color-surface-hover)' : 'transparent',
        transition: `background var(--duration-fast)`,
      }}
    >
      {/* Status dot */}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[session.status] || 'var(--color-text-tertiary)', flexShrink: 0 }} />

      {/* Owner avatar */}
      {launcherUser && (
        <UserAvatar user={launcherUser} size={20} showPresence={isTeamMode} />
      )}

      {/* Title + metadata */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {/* Team mode: "Started by [name]" */}
          {isTeamMode && launcherUser && (
            <span>Started by {launcherUser.name}</span>
          )}
          <span>{session.startedAt}</span>
          {session.linkedBranch && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <GitBranch size={10} strokeWidth={1.5} /> {session.linkedBranch}
            </span>
          )}
          {session.linkedTaskId && (
            <span
              onClick={(e) => { e.stopPropagation(); onNavigateToTask?.(session.linkedTaskId!) }}
              style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', color: 'var(--color-primary)' }}
            >
              <FileText size={10} strokeWidth={1.5} /> {session.linkedTaskId}
            </span>
          )}
        </div>
      </div>

      {/* Duration */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        <Clock size={11} strokeWidth={1.5} /> {session.duration}
      </div>

      {/* Tokens */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        <Cpu size={10} strokeWidth={1.5} />
        <span>↑{formatTokens(session.tokensIn)}</span>
        <span>↓{formatTokens(session.tokensOut)}</span>
      </div>

      {/* Files count */}
      {session.files && session.files.length > 0 && (
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
          {session.files.length} files
        </span>
      )}

      {/* Link indicator */}
      {onNavigateToSession && (
        <ExternalLink size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, opacity: hovered ? 1 : 0, transition: `opacity var(--duration-fast)` }} />
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
