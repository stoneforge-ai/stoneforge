import { memo, useRef, useState, useCallback, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { AlertCircle, Maximize2, PanelRightOpen } from 'lucide-react'
import type { Session } from '../session-types'
import { SessionChatView } from '../SessionChatView'
import { SessionMessageInput } from '../SessionMessageInput'
import type { NodePosition } from './canvas-layout'

export interface NodeSize {
  width: number
  height: number
}

interface SessionNodeProps {
  session: Session
  position: NodePosition
  selected: boolean
  dimmed: boolean
  /** Tint applied to the window title bar (derived from the session's director) */
  directorColor: string
  /** Tint applied to the chat body background (derived from the session's agent) */
  agentColor: string
  /** Live zoom accessor — ref-based so changing zoom doesn't re-render the node. */
  getZoom: () => number
  onHoverChange: (hovering: boolean) => void
  onContextMenu: (e: ReactMouseEvent) => void
  onDragStart: () => void
  /** Called with the absolute new world position of the node */
  onDrag: (xWorld: number, yWorld: number) => void
  onDragEnd: () => void
  onResize: (width: number, height: number) => void
  onSteer: (text: string) => void
  /** Open the session in the side drawer. */
  onExpand: () => void
  /** Zoom / pan the canvas so this node fills the viewport. */
  onFitToViewport: () => void
}

const MIN_WIDTH = 280
const MIN_HEIGHT = 220
const HEADER_HEIGHT = 32

function statusColor(session: Session): string {
  if (session.needsInput) return 'var(--color-warning)'
  if (session.status === 'error') return 'var(--color-danger)'
  if (session.status === 'active') return 'var(--color-success)'
  return 'var(--color-text-tertiary)'
}

function SessionNodeImpl({
  session,
  position,
  selected,
  dimmed,
  directorColor,
  agentColor,
  getZoom,
  onHoverChange,
  onContextMenu,
  onDragStart,
  onDrag,
  onDragEnd,
  onResize,
  onSteer,
  onExpand,
  onFitToViewport,
}: SessionNodeProps) {
  const dragStartRef = useRef<{ clientX: number; clientY: number; originX: number; originY: number } | null>(null)
  const resizeStartRef = useRef<{ clientX: number; clientY: number; startW: number; startH: number } | null>(null)
  const [hovering, setHovering] = useState(false)

  const color = statusColor(session)
  const isNeedsInput = !!session.needsInput && session.status === 'active'
  const isError = session.status === 'error'

  const handleHeaderMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    onDragStart()
    const zoom = getZoom()
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      originX: position.x,
      originY: position.y,
    }

    const onMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return
      const dx = (ev.clientX - dragStartRef.current.clientX) / zoom
      const dy = (ev.clientY - dragStartRef.current.clientY) / zoom
      onDrag(dragStartRef.current.originX + dx, dragStartRef.current.originY + dy)
    }
    const onUp = () => {
      dragStartRef.current = null
      onDragEnd()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [onDrag, onDragStart, onDragEnd, getZoom, position.x, position.y])

  const handleResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const zoom = getZoom()
    resizeStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startW: position.width,
      startH: position.height,
    }
    const onMove = (ev: MouseEvent) => {
      if (!resizeStartRef.current) return
      const dx = (ev.clientX - resizeStartRef.current.clientX) / zoom
      const dy = (ev.clientY - resizeStartRef.current.clientY) / zoom
      const w = Math.max(MIN_WIDTH, resizeStartRef.current.startW + dx)
      const h = Math.max(MIN_HEIGHT, resizeStartRef.current.startH + dy)
      onResize(w, h)
    }
    const onUp = () => {
      resizeStartRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [position.width, position.height, onResize, getZoom])

  const borderOutline: CSSProperties = (() => {
    if (isNeedsInput) return { boxShadow: `0 0 0 2px var(--color-warning), var(--shadow-float)` }
    if (isError) return { boxShadow: `0 0 0 2px var(--color-danger), var(--shadow-hover)` }
    if (selected) return { boxShadow: `0 0 0 2px var(--color-primary), var(--shadow-float)` }
    return { boxShadow: 'var(--shadow-hover)' }
  })()

  return (
    <div
      data-session-id={session.id}
      data-needs-input={isNeedsInput ? 'true' : undefined}
      onMouseEnter={() => { setHovering(true); onHoverChange(true) }}
      onMouseLeave={() => { setHovering(false); onHoverChange(false) }}
      onContextMenu={onContextMenu}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        background: 'var(--color-bg-elevated)',
        borderRadius: 'var(--radius-md)',
        opacity: dimmed ? 0.35 : 1,
        transition: resizeStartRef.current || dragStartRef.current ? 'none' : 'opacity var(--duration-normal), box-shadow var(--duration-normal)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...borderOutline,
      }}
    >
      {/* Header (drag handle) — tinted by director */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={(e) => { e.stopPropagation(); onExpand() }}
        style={{
          height: HEADER_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px 0 12px',
          backgroundColor: 'var(--color-bg-secondary)',
          backgroundImage: `radial-gradient(ellipse 140% 180% at 0% 50%, color-mix(in srgb, ${directorColor} 22%, transparent) 0%, transparent 70%)`,
          borderBottom: `1px solid color-mix(in srgb, ${directorColor} 14%, var(--color-border))`,
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <span
          className={isNeedsInput ? 'session-needs-input-pulse' : undefined}
          style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
        />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.title}
          </span>
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              flexShrink: 0,
            }}
          >
            {session.agent.name}
          </span>
        </div>
        {isNeedsInput && (
          <span
            title="Awaiting input"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--color-warning)',
              padding: '1px 5px',
              background: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
              borderRadius: 'var(--radius-sm)',
              flexShrink: 0,
            }}
          >
            <AlertCircle size={10} strokeWidth={1.8} />
          </span>
        )}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onFitToViewport() }}
          title="Fit window to canvas"
          style={{
            width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Maximize2 size={11} strokeWidth={1.8} />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onExpand() }}
          title="Open in drawer"
          style={{
            width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <PanelRightOpen size={12} strokeWidth={1.8} />
        </button>
      </div>

      {/* Chat body — tinted by agent */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: 'var(--color-bg-elevated)',
          backgroundImage: `radial-gradient(ellipse 120% 90% at 50% 0%, color-mix(in srgb, ${agentColor} 14%, transparent) 0%, transparent 65%)`,
        }}
      >
        <SessionChatView
          session={session}
          events={session.events}
          selectedEventId={null}
          onSelectEvent={() => { /* no selection from canvas nodes */ }}
          scrollToEventId={null}
        />
      </div>

      {/* Footer: message input */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-secondary)',
        }}
      >
        <SessionMessageInput
          sessionStatus={session.status}
          onSendMessage={onSteer}
        />
      </div>

      {/* Resize handle (SE corner) */}
      <div
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 14,
          height: 14,
          cursor: 'nwse-resize',
          opacity: hovering ? 1 : 0.35,
          transition: 'opacity var(--duration-fast)',
          background: 'transparent',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ pointerEvents: 'none' }}>
          <path d="M 13 5 L 5 13 M 13 9 L 9 13 M 13 13 L 13 13" stroke="var(--color-text-tertiary)" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

/**
 * Memoize SessionNode so that pan/zoom (which only change the transform
 * wrapper above us) never re-render the chat windows. We deliberately
 * ignore callback identity: parent-level lambdas are recreated each render
 * but don't affect visible output.
 */
export const SessionNode = memo(SessionNodeImpl, (prev, next) => {
  return (
    prev.session === next.session &&
    prev.position.x === next.position.x &&
    prev.position.y === next.position.y &&
    prev.position.width === next.position.width &&
    prev.position.height === next.position.height &&
    prev.selected === next.selected &&
    prev.dimmed === next.dimmed &&
    prev.directorColor === next.directorColor &&
    prev.agentColor === next.agentColor
  )
})
