import { X, User, Bot, Wrench, Info, Play, Clock, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { SessionEvent, SessionEventType } from './session-types'

interface SessionEventDetailProps {
  event: SessionEvent
  onClose: () => void
}

const typeConfig: Record<SessionEventType, { icon: typeof User; label: string; color: string }> = {
  session_start: { icon: Play, label: 'Start', color: '#a855f7' },
  user_message: { icon: User, label: 'User', color: '#ec4899' },
  agent_message: { icon: Bot, label: 'Agent', color: 'var(--color-primary)' },
  tool_call: { icon: Wrench, label: 'Tool', color: '#6b7280' },
  system_message: { icon: Info, label: 'System', color: '#9ca3af' },
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function SessionEventDetail({ event, onClose }: SessionEventDetailProps) {
  const config = typeConfig[event.type]
  const Icon = config.icon

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
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: config.color + '1a',
              color: config.color,
              fontSize: 12,
              fontWeight: 600,
            }}>
              <Icon size={12} />
              {event.toolName ?? config.label}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {event.tokensIn != null && event.tokensIn > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)' }}>
              <ArrowDownLeft size={11} /> {formatTokens(event.tokensIn)}
            </span>
          )}
          {event.tokensOut != null && event.tokensOut > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)' }}>
              <ArrowUpRight size={11} /> {formatTokens(event.tokensOut)}
            </span>
          )}
          {event.duration != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={11} /> {formatDuration(event.duration)}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{formatTimestamp(event.timestamp)}</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Title */}
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 12px' }}>
          {event.title}
        </h3>

        {/* Tool-specific sections */}
        {event.type === 'tool_call' && (
          <>
            {event.toolInput && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Input
                </div>
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
                }}>
                  {event.toolInput}
                </pre>
              </div>
            )}

            {event.toolResult && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Result
                  </span>
                  {event.toolStatus && (
                    <span style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-full)',
                      background: event.toolStatus === 'completed' ? 'var(--color-success-subtle)' : event.toolStatus === 'error' ? 'var(--color-danger-subtle)' : 'var(--color-warning-subtle)',
                      color: event.toolStatus === 'completed' ? 'var(--color-success)' : event.toolStatus === 'error' ? 'var(--color-danger)' : 'var(--color-warning)',
                    }}>
                      {event.toolStatus}
                    </span>
                  )}
                </div>
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
                  maxHeight: 400,
                  overflow: 'auto',
                }}>
                  {event.toolResult}
                </pre>
              </div>
            )}
          </>
        )}

        {/* Message content for non-tool events */}
        {event.type !== 'tool_call' && event.content && (
          <div style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {event.content}
          </div>
        )}
      </div>
    </div>
  )
}
