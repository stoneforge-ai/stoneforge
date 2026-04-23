import { X } from 'lucide-react'
import type { Session } from '../session-types'

interface CanvasDockStripProps {
  sessions: Session[]
  onFocusSession: (sessionId: string) => void
  focusedSessionId: string | null
  hoveredSessionId: string | null
  onHoverSession: (sessionId: string | null) => void
  onClose: () => void
}

function statusColor(session: Session): string {
  if (session.needsInput) return 'var(--color-warning)'
  if (session.status === 'error') return 'var(--color-danger)'
  if (session.status === 'active') return 'var(--color-success)'
  return 'var(--color-text-tertiary)'
}

function urgency(session: Session): number {
  if (session.needsInput) return 0
  if (session.status === 'error') return 1
  if (session.status === 'active') return 2
  return 3
}

export function CanvasDockStrip({
  sessions,
  onFocusSession,
  focusedSessionId,
  hoveredSessionId,
  onHoverSession,
  onClose,
}: CanvasDockStripProps) {
  const sorted = [...sessions].sort((a, b) => urgency(a) - urgency(b))
  const needsInputCount = sessions.filter(s => s.needsInput).length
  const errorCount = sessions.filter(s => s.status === 'error').length
  const activeCount = sessions.filter(s => s.status === 'active' && !s.needsInput).length

  return (
    <div
      style={{
        height: 32,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 16,
        paddingRight: 4,
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-secondary)',
      }}
    >
      {/* Summary counts — fixed on the left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        {needsInputCount > 0 && (
          <span style={{ color: 'var(--color-warning)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
            {needsInputCount} needs input
          </span>
        )}
        {errorCount > 0 && (
          <span style={{ color: 'var(--color-danger)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
            {errorCount} error{errorCount !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{activeCount} active</span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--color-border-subtle)', flexShrink: 0 }} />

      {/* Session tabs — horizontally scrollable */}
      <div
        className="canvas-dock-scroller"
        onWheel={(e) => {
          // Translate vertical wheel to horizontal scroll so mouse users can
          // browse the session row without holding shift.
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: 1,
          minWidth: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 1,
        }}
      >
        {sorted.map((s) => {
          const color = statusColor(s)
          const isFocused = s.id === focusedSessionId
          const isHovered = s.id === hoveredSessionId
          const isNeedsInput = !!s.needsInput && s.status === 'active'
          return (
            <button
              key={s.id}
              title={`${s.title} — ${s.agent.name}${s.needsInput ? ' (awaiting input)' : ''}`}
              onClick={() => onFocusSession(s.id)}
              onMouseEnter={() => onHoverSession(s.id)}
              onMouseLeave={() => onHoverSession(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 6px',
                background: isFocused ? 'var(--color-surface-active)' : isHovered ? 'var(--color-surface-hover)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                flexShrink: 0,
                color: 'var(--color-text-secondary)',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span
                className={isNeedsInput ? 'session-needs-input-pulse' : undefined}
                style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
              />
              <span style={{ whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-sans)' }}>
                {s.title}
              </span>
            </button>
          )
        })}
      </div>

      {/* Close button — fixed on the right */}
      <button
        onClick={onClose}
        title="Hide session dock"
        style={{
          width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none',
          color: 'var(--color-text-tertiary)', cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <X size={12} strokeWidth={1.8} />
      </button>
    </div>
  )
}
