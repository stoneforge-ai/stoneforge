import { useState, useRef } from 'react'
import type { SessionEvent, SessionEventType } from './session-types'

interface SessionTimelineProps {
  events: SessionEvent[]
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  totalDuration: number
}

const typeColors: Record<SessionEventType, string> = {
  session_start: '#a855f7',
  user_message: '#ec4899',
  agent_message: 'var(--color-primary)',
  tool_call: '#6b7280',
  system_message: '#9ca3af',
}

const typeLabels: Record<SessionEventType, string> = {
  session_start: 'Start',
  user_message: 'User',
  agent_message: 'Agent',
  tool_call: 'Tool',
  system_message: 'System',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function SessionTimeline({ events, selectedEventId, onSelectEvent, totalDuration }: SessionTimelineProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const eventsWithDuration = events.filter(e => (e.duration ?? 0) > 0 || e.type === 'system_message')
  const effectiveTotal = totalDuration || Math.max(...events.map(e => e.timestamp + (e.duration ?? 0)), 1)

  const handleMouseEnter = (e: React.MouseEvent, eventId: string) => {
    setHoveredId(eventId)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: -8 })
    }
  }

  const hoveredEvent = hoveredId ? events.find(ev => ev.id === hoveredId) : null

  return (
    <div ref={containerRef} style={{ position: 'relative', padding: '0 16px' }}>
      <div style={{
        display: 'flex',
        height: 32,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        background: 'var(--color-surface)',
        gap: 1,
      }}>
        {eventsWithDuration.map(event => {
          const duration = event.duration ?? 200
          const flexGrow = Math.max(duration / effectiveTotal, 0.005)
          const isSelected = event.id === selectedEventId
          const isHovered = event.id === hoveredId

          return (
            <div
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              onMouseEnter={(e) => handleMouseEnter(e, event.id)}
              onMouseMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (rect) setTooltipPos({ x: e.clientX - rect.left, y: -8 })
              }}
              onMouseLeave={() => { setHoveredId(null); setTooltipPos(null) }}
              style={{
                flex: `${flexGrow} 0 4px`,
                background: typeColors[event.type],
                opacity: isSelected ? 1 : isHovered ? 0.85 : 0.65,
                cursor: 'pointer',
                transition: 'opacity var(--duration-fast)',
                boxShadow: isSelected ? 'inset 0 0 0 2px var(--color-text)' : undefined,
                borderRadius: isSelected ? 2 : undefined,
              }}
            />
          )
        })}
      </div>

      {/* Tooltip */}
      {hoveredEvent && tooltipPos && (
        <div style={{
          position: 'absolute',
          left: tooltipPos.x,
          top: tooltipPos.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 10px',
          fontSize: 12,
          whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-float)',
          zIndex: 'var(--z-tooltip)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: typeColors[hoveredEvent.type],
            flexShrink: 0,
          }} />
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            {hoveredEvent.toolName ?? typeLabels[hoveredEvent.type]}
          </span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            {hoveredEvent.title}
          </span>
          {hoveredEvent.duration != null && (
            <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {formatDuration(hoveredEvent.duration)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
