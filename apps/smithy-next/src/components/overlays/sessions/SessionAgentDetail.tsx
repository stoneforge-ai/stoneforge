import { X, ExternalLink, Clock } from 'lucide-react'
import type { SessionAgent, Session } from './session-types'

interface SessionAgentDetailProps {
  agent: SessionAgent
  allSessions: Session[]
  onClose: () => void
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToSession?: (sessionId: string) => void
}

const statusColors: Record<string, string> = {
  active: 'var(--color-success)',
  completed: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)',
}

export function SessionAgentDetail({ agent, allSessions, onClose, onNavigateToAgent, onNavigateToSession }: SessionAgentDetailProps) {
  // Get recent sessions for this agent from the full sessions list
  const agentSessions = allSessions.filter(s => s.agent.id === agent.id).slice(0, 5)

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{agent.name}</span>
            <span style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: agent.status === 'active' ? 'var(--color-success-subtle)' : agent.status === 'error' ? 'var(--color-danger-subtle)' : 'var(--color-surface)',
              color: agent.status === 'active' ? 'var(--color-success)' : agent.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
              fontWeight: 500,
            }}>
              {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', padding: 4,
              borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Agent ID & version */}
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{agent.id}</span>
          <span>v{agent.version}</span>
        </div>

        {/* Model info */}
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 12 }}>
          <span>Model <strong style={{ fontWeight: 500 }}>{agent.model}</strong></span>
          <span>Provider <strong style={{ fontWeight: 500 }}>{agent.provider}</strong></span>
        </div>

        {/* View agent details link */}
        {onNavigateToAgent && (
          <button
            onClick={() => onNavigateToAgent(agent.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-primary)', fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 4, padding: 0,
            }}
          >
            View agent details <ExternalLink size={11} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Role prompt */}
        <section>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
            Role prompt
          </h4>
          <pre style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            border: '1px solid var(--color-border-subtle)',
            maxHeight: 280,
            overflow: 'auto',
            lineHeight: 1.5,
          }}>
            {agent.rolePrompt}
          </pre>
        </section>

        {/* Recent sessions */}
        <section>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
            Recent sessions
            <span style={{
              fontSize: 11, fontWeight: 400, marginLeft: 6,
              color: 'var(--color-text-tertiary)',
            }}>
              {agentSessions.length}
            </span>
          </h4>
          {agentSessions.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No sessions</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {agentSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => onNavigateToSession?.(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Status dot */}
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: statusColors[s.status],
                    flexShrink: 0,
                  }} />
                  {/* Title */}
                  <span style={{
                    flex: 1,
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.title}
                  </span>
                  {/* Duration + time ago */}
                  <span style={{
                    fontSize: 11, color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                  }}>
                    {s.duration}
                  </span>
                  <span style={{
                    fontSize: 11, color: 'var(--color-text-tertiary)',
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 2,
                  }}>
                    <Clock size={10} /> {s.startedAt}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
