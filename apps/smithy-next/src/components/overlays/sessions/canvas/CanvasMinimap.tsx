import type { NodeLayout } from './canvas-layout'
import type { Session } from '../session-types'
import type { Viewport } from './InfiniteCanvas'

interface CanvasMinimapProps {
  nodes: NodeLayout[]
  sessions: Map<string, Session>
  viewport: Viewport
  viewportSize: { width: number; height: number }
  onJump: (worldX: number, worldY: number) => void
}

const WIDTH = 200
const HEIGHT = 140
const PADDING = 8

export function CanvasMinimap({
  nodes,
  sessions,
  viewport,
  viewportSize,
  onJump,
}: CanvasMinimapProps) {
  if (nodes.length === 0) return null

  // World bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + n.position.width)
    maxY = Math.max(maxY, n.position.y + n.position.height)
  }
  // Include viewport projection so users see where they are even when off-nodes.
  const vx = -viewport.panX / viewport.zoom
  const vy = -viewport.panY / viewport.zoom
  const vw = viewportSize.width / viewport.zoom
  const vh = viewportSize.height / viewport.zoom
  minX = Math.min(minX, vx)
  minY = Math.min(minY, vy)
  maxX = Math.max(maxX, vx + vw)
  maxY = Math.max(maxY, vy + vh)

  const worldWidth = maxX - minX || 1
  const worldHeight = maxY - minY || 1
  const scale = Math.min(
    (WIDTH - PADDING * 2) / worldWidth,
    (HEIGHT - PADDING * 2) / worldHeight,
  )

  const project = (x: number, y: number) => ({
    x: PADDING + (x - minX) * scale,
    y: PADDING + (y - minY) * scale,
  })

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        width: WIDTH,
        height: HEIGHT,
        background: 'var(--color-bg-elevated)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-float)',
        overflow: 'hidden',
        cursor: 'crosshair',
        zIndex: 5,
      }}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const localX = e.clientX - rect.left - PADDING
        const localY = e.clientY - rect.top - PADDING
        const worldX = minX + localX / scale
        const worldY = minY + localY / scale
        onJump(worldX, worldY)
      }}
    >
      {nodes.map((n) => {
        const s = sessions.get(n.id)
        if (!s) return null
        const p = project(n.position.x, n.position.y)
        const w = n.position.width * scale
        const h = n.position.height * scale
        const color = s.needsInput
          ? 'var(--color-warning)'
          : s.status === 'error'
            ? 'var(--color-danger)'
            : s.status === 'active'
              ? 'var(--color-success)'
              : 'var(--color-text-tertiary)'
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: Math.max(4, w),
              height: Math.max(3, h),
              background: color,
              opacity: 0.85,
              borderRadius: 2,
            }}
          />
        )
      })}
      {/* Viewport rectangle */}
      {(() => {
        const p = project(vx, vy)
        return (
          <div
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: vw * scale,
              height: vh * scale,
              border: '1px solid var(--color-primary)',
              background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
              pointerEvents: 'none',
            }}
          />
        )
      })()}
    </div>
  )
}
