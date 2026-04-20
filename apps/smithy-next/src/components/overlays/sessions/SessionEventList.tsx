import { useRef, useEffect } from 'react'
import { User, Bot, Wrench, Info, Play, Clock, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { SessionEvent, SessionEventType } from './session-types'

interface SessionEventListProps {
  events: SessionEvent[]
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  /** Set by timeline click to trigger scroll-into-view */
  scrollToEventId: string | null
}

const typeConfig: Record<SessionEventType, { icon: typeof User; label: string; color: string; bg: string }> = {
  session_start: { icon: Play, label: 'Running', color: '#a855f7', bg: '#a855f71a' },
  user_message: { icon: User, label: 'User', color: '#ec4899', bg: '#ec48991a' },
  agent_message: { icon: Bot, label: 'Agent', color: 'var(--color-primary)', bg: 'var(--color-primary-subtle)' },
  tool_call: { icon: Wrench, label: 'Tool', color: '#6b7280', bg: '#6b72801a' },
  system_message: { icon: Info, label: 'System', color: '#9ca3af', bg: '#9ca3af1a' },
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

export function SessionEventList({ events, selectedEventId, onSelectEvent, scrollToEventId }: SessionEventListProps) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll to event when triggered by timeline click
  useEffect(() => {
    if (scrollToEventId) {
      const el = rowRefs.current.get(scrollToEventId)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [scrollToEventId])

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '4px 0' }}>
        {events.map(event => {
          const config = typeConfig[event.type]
          const Icon = config.icon
          const isSelected = event.id === selectedEventId

          return (
            <div
              key={event.id}
              ref={el => { if (el) rowRefs.current.set(event.id, el); else rowRefs.current.delete(event.id) }}
              onClick={() => onSelectEvent(event.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                cursor: 'pointer',
                background: isSelected ? 'var(--color-surface)' : 'transparent',
                boxShadow: isSelected ? `inset 2px 0 0 var(--color-primary)` : undefined,
                transition: 'background var(--duration-fast)',
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-hover)'
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.background = 'transparent'
              }}
            >
              {/* Type badge */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: config.bg,
                color: config.color,
                fontSize: 12,
                fontWeight: 500,
                minWidth: 56,
                flexShrink: 0,
              }}>
                <Icon size={12} />
                {event.toolName ?? config.label}
              </span>

              {/* Title */}
              <span style={{
                flex: 1,
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {event.title}
              </span>

              {/* Metadata */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12,
                color: 'var(--color-text-tertiary)',
                flexShrink: 0,
              }}>
                {(event.tokensIn != null && event.tokensIn > 0 || event.tokensOut != null && event.tokensOut > 0) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {event.tokensIn != null && event.tokensIn > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <ArrowDownLeft size={10} />{formatTokens(event.tokensIn)}
                      </span>
                    )}
                    {event.tokensIn != null && event.tokensIn > 0 && event.tokensOut != null && event.tokensOut > 0 && ' / '}
                    {event.tokensOut != null && event.tokensOut > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <ArrowUpRight size={10} />{formatTokens(event.tokensOut)}
                      </span>
                    )}
                  </span>
                )}
                {event.duration != null && event.duration > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={11} /> {formatDuration(event.duration)}
                  </span>
                )}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 32, textAlign: 'right' }}>
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
