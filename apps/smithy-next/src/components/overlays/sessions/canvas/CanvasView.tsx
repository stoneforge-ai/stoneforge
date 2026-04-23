import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { AlertCircle } from 'lucide-react'
import type { Session } from '../session-types'
import { SessionDetailView } from '../SessionDetailView'
import { InfiniteCanvas, type Viewport } from './InfiniteCanvas'
import { SessionNode } from './SessionNode'
import { CanvasDockStrip } from './CanvasDockStrip'
import { CanvasToolbar } from './CanvasToolbar'
import { CanvasMinimap } from './CanvasMinimap'
import { boundingBox, layoutFor, type LayoutMode, type NodeLayout, type SizePreset, type AspectMode } from './canvas-layout'

interface CanvasViewProps {
  sessions: Session[]
  selectedSessionId: string | null
  onSelectedSessionChange: (id: string | null) => void
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onResumeSession?: (session: Session) => void
  layoutMode: LayoutMode
  sizePreset: SizePreset
  onSizePresetChange: (preset: SizePreset) => void
  aspectMode: AspectMode
  onAspectModeChange: (aspect: AspectMode) => void
  /** Monotonic counter. Each change clears all manual position/size overrides. */
  reapplyNonce: number
}

interface ContextMenuState {
  sessionId: string
  x: number
  y: number
}

export function CanvasView({
  sessions,
  selectedSessionId,
  onSelectedSessionChange,
  onNavigateToAgent,
  onNavigateToTask,
  onNavigateToMR,
  onNavigateToWhiteboard,
  onResumeSession,
  layoutMode,
  sizePreset,
  onSizePresetChange,
  aspectMode,
  onAspectModeChange,
  reapplyNonce,
}: CanvasViewProps) {
  // Completed sessions hidden by default; toggleable via the footnote label.
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    try { return localStorage.getItem('sf-next.canvas.show-completed') === 'true' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('sf-next.canvas.show-completed', String(showCompleted)) } catch { /* ignore */ }
  }, [showCompleted])

  const [dockVisible, setDockVisible] = useState<boolean>(() => {
    try { return localStorage.getItem('sf-next.canvas.dock-visible') !== 'false' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('sf-next.canvas.dock-visible', String(dockVisible)) } catch { /* ignore */ }
  }, [dockVisible])

  const canvasSessions = useMemo(
    () => showCompleted ? sessions : sessions.filter(s => s.status !== 'completed'),
    [sessions, showCompleted],
  )

  const completedCount = sessions.filter(s => s.status === 'completed').length

  const sessionMap = useMemo(() => {
    const m = new Map<string, Session>()
    for (const s of canvasSessions) m.set(s.id, s)
    return m
  }, [canvasSessions])

  // Auto-layout. Recomputes when the id-set changes (not on every live event).
  const sessionIds = useMemo(
    () => canvasSessions.map(s => s.id).sort().join(','),
    [canvasSessions],
  )
  const { nodes: baseNodes, frames } = useMemo(
    () => layoutFor(layoutMode, canvasSessions, sizePreset, aspectMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionIds, layoutMode, sizePreset, aspectMode],
  )

  // Allow user-overridden positions + sizes via drag / resize
  const [overrides, setOverrides] = useState<Record<string, { x?: number; y?: number; width?: number; height?: number }>>({})

  // Clear position overrides when the chosen layout changes (positions are
  // layout-specific). Size overrides are kept: users who've manually resized
  // a single window should retain their choice even when the global preset
  // changes.
  useEffect(() => {
    setOverrides(prev => {
      const next: typeof prev = {}
      for (const [id, o] of Object.entries(prev)) {
        if (o.width != null || o.height != null) next[id] = { width: o.width, height: o.height }
      }
      return next
    })
  }, [layoutMode])

  // A bump of reapplyNonce from the parent clears every manual override.
  useEffect(() => {
    setOverrides({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reapplyNonce])
  const nodes: NodeLayout[] = useMemo(() => {
    return baseNodes.map(n => {
      const override = overrides[n.id]
      if (!override) return n
      return {
        ...n,
        position: {
          x: override.x ?? n.position.x,
          y: override.y ?? n.position.y,
          width: override.width ?? n.position.width,
          height: override.height ?? n.position.height,
        },
      }
    })
  }, [baseNodes, overrides])
  const nodeById = useMemo(() => {
    const m = new Map<string, NodeLayout>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  // Viewport
  const [viewport, setViewport] = useState<Viewport>({ panX: 60, panY: 60, zoom: 1 })
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const getZoom = useCallback(() => viewportRef.current.zoom, [])
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }
    measure()
    // ResizeObserver catches drawer mount/unmount shrinks which don't fire
    // a window resize event.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null)
  const [minimapOn, setMinimapOn] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [followSessionId, setFollowSessionId] = useState<string | null>(null)
  const [steerLog, setSteerLog] = useState<Array<{ sessionId: string; text: string }>>([])
  // Tracks the last node the user explicitly "fit to canvas". When set, the
  // canvas re-centers itself as the drawer opens/closes so the focused window
  // stays optically centered. Cleared by any manual pan/zoom.
  const focusedNodeIdRef = useRef<string | null>(null)
  const DRAWER_WIDTH = 480

  // Color palettes: assign each unique director / agent a maximally-separated
  // hue using the golden angle. Users can override any entry via the context
  // menu; overrides persist in localStorage.
  const GOLDEN_ANGLE = 137.50776405
  const DIRECTOR_HUE_OFFSET = 12
  const AGENT_HUE_OFFSET = 68
  const DIRECTOR_OVERRIDES_KEY = 'sf-next.canvas.director-colors'
  const AGENT_OVERRIDES_KEY = 'sf-next.canvas.agent-colors'

  const [directorColorOverrides, setDirectorColorOverrides] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(DIRECTOR_OVERRIDES_KEY) || '{}') } catch { return {} }
  })
  const [agentColorOverrides, setAgentColorOverrides] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(AGENT_OVERRIDES_KEY) || '{}') } catch { return {} }
  })

  useEffect(() => {
    try { localStorage.setItem(DIRECTOR_OVERRIDES_KEY, JSON.stringify(directorColorOverrides)) } catch { /* ignore */ }
  }, [directorColorOverrides])
  useEffect(() => {
    try { localStorage.setItem(AGENT_OVERRIDES_KEY, JSON.stringify(agentColorOverrides)) } catch { /* ignore */ }
  }, [agentColorOverrides])

  const directorColorMap = useMemo(() => {
    const ids = Array.from(
      new Set(canvasSessions.map(s => s.linkedDirectorId).filter((v): v is string => !!v))
    ).sort()
    const m = new Map<string, string>()
    ids.forEach((id, i) => {
      const hue = (DIRECTOR_HUE_OFFSET + i * GOLDEN_ANGLE) % 360
      m.set(id, `hsl(${hue.toFixed(1)} 42% 58%)`)
    })
    return m
  }, [canvasSessions])

  const agentColorMap = useMemo(() => {
    const ids = Array.from(new Set(canvasSessions.map(s => s.agent.id))).sort()
    const m = new Map<string, string>()
    ids.forEach((id, i) => {
      const hue = (AGENT_HUE_OFFSET + i * GOLDEN_ANGLE) % 360
      m.set(id, `hsl(${hue.toFixed(1)} 40% 50%)`)
    })
    return m
  }, [canvasSessions])

  const directorColor = useCallback((directorId: string | null | undefined): string => {
    if (!directorId) return 'hsl(220 8% 48%)'
    return directorColorOverrides[directorId] ?? directorColorMap.get(directorId) ?? 'hsl(220 8% 48%)'
  }, [directorColorMap, directorColorOverrides])

  const agentColor = useCallback((agentId: string): string => {
    return agentColorOverrides[agentId] ?? agentColorMap.get(agentId) ?? 'hsl(220 8% 40%)'
  }, [agentColorMap, agentColorOverrides])

  // Hidden color inputs used to pop native color pickers from the context menu
  const directorPickerRef = useRef<HTMLInputElement | null>(null)
  const agentPickerRef = useRef<HTMLInputElement | null>(null)
  const pickerTargetRef = useRef<{ kind: 'director' | 'agent'; id: string } | null>(null)

  const openDirectorPicker = useCallback((directorId: string) => {
    pickerTargetRef.current = { kind: 'director', id: directorId }
    if (directorPickerRef.current) {
      directorPickerRef.current.value = rgbToHex(directorColor(directorId))
      directorPickerRef.current.click()
    }
  }, [directorColor])

  const openAgentPicker = useCallback((agentId: string) => {
    pickerTargetRef.current = { kind: 'agent', id: agentId }
    if (agentPickerRef.current) {
      agentPickerRef.current.value = rgbToHex(agentColor(agentId))
      agentPickerRef.current.click()
    }
  }, [agentColor])

  // Camera helpers
  const flyToWorld = useCallback((worldX: number, worldY: number, targetZoom?: number) => {
    const z = targetZoom ?? viewport.zoom
    setViewport({
      zoom: z,
      panX: viewportSize.width / 2 - worldX * z,
      panY: viewportSize.height / 2 - worldY * z,
    })
  }, [viewport.zoom, viewportSize])

  const flyToNode = useCallback((sessionId: string, targetZoom?: number) => {
    const n = nodeById.get(sessionId)
    if (!n) return
    const cx = n.position.x + n.position.width / 2
    const cy = n.position.y + n.position.height / 2
    flyToWorld(cx, cy, targetZoom)
  }, [flyToWorld, nodeById])

  const fitToView = useCallback(() => {
    if (nodes.length === 0) return
    const bb = boundingBox(nodes)
    const margin = 80
    const zoomX = viewportSize.width / (bb.width + margin * 2)
    const zoomY = viewportSize.height / (bb.height + margin * 2)
    const zoom = Math.max(0.3, Math.min(1.5, Math.min(zoomX, zoomY)))
    const panX = (viewportSize.width - bb.width * zoom) / 2 - bb.x * zoom
    const panY = (viewportSize.height - bb.height * zoom) / 2 - bb.y * zoom
    setViewport({ panX, panY, zoom })
  }, [nodes, viewportSize])

  const fitToNode = useCallback((sessionId: string) => {
    const n = nodeById.get(sessionId)
    if (!n) return
    const margin = 32
    const zoomX = viewportSize.width / (n.position.width + margin * 2)
    const zoomY = viewportSize.height / (n.position.height + margin * 2)
    const zoom = Math.max(0.3, Math.min(2.5, Math.min(zoomX, zoomY)))
    const cx = n.position.x + n.position.width / 2
    const cy = n.position.y + n.position.height / 2
    const panX = viewportSize.width / 2 - cx * zoom
    const panY = viewportSize.height / 2 - cy * zoom
    setViewport({ panX, panY, zoom })
    focusedNodeIdRef.current = sessionId
  }, [nodeById, viewportSize])

  // Follow mode — keep a session centered as sim/user actions shift layout
  useEffect(() => {
    if (!followSessionId) return
    flyToNode(followSessionId)
  }, [followSessionId, flyToNode])

  // When a focused window is in effect, shift pan so the window stays
  // optically centered as the drawer mounts (takes 480px on the right) or
  // unmounts (returns that space). Only runs while the focused flag is set.
  const prevSelectedRef = useRef<string | null>(selectedSessionId)
  useEffect(() => {
    const prev = prevSelectedRef.current
    const next = selectedSessionId
    prevSelectedRef.current = next
    if (!focusedNodeIdRef.current) return
    const wasOpen = !!prev
    const isOpen = !!next
    if (wasOpen === isOpen) return
    const deltaX = isOpen ? -DRAWER_WIDTH / 2 : DRAWER_WIDTH / 2
    setViewport(v => ({ ...v, panX: v.panX + deltaX }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isInput) return
      if (e.key === 'Escape') {
        setContextMenu(null)
        if (selectedSessionId) onSelectedSessionChange(null)
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        fitToView()
      } else if (e.key === '0') {
        e.preventDefault()
        setViewport((v) => ({ ...v, zoom: 1 }))
      } else if (e.key === '1') {
        e.preventDefault()
        setViewport((v) => ({ ...v, zoom: 0.5 }))
      } else if (e.key === '2') {
        e.preventDefault()
        setViewport((v) => ({ ...v, zoom: 1 }))
      } else if (e.key === '3') {
        e.preventDefault()
        setViewport((v) => ({ ...v, zoom: 1.5 }))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fitToView, onSelectedSessionChange, selectedSessionId])

  // Off-screen attention for needs-input
  const offScreenAttention = useMemo(() => {
    const chips: Array<{ session: Session; angle: number; x: number; y: number }> = []
    for (const s of canvasSessions) {
      if (!s.needsInput || s.status !== 'active') continue
      const n = nodeById.get(s.id)
      if (!n) continue
      const cx = n.position.x + n.position.width / 2
      const cy = n.position.y + n.position.height / 2
      const screenX = cx * viewport.zoom + viewport.panX
      const screenY = cy * viewport.zoom + viewport.panY
      const margin = 40
      const onScreen =
        screenX >= margin && screenX <= viewportSize.width - margin &&
        screenY >= margin && screenY <= viewportSize.height - margin
      if (onScreen) continue
      const edgeX = Math.max(20, Math.min(viewportSize.width - 20, screenX))
      const edgeY = Math.max(20, Math.min(viewportSize.height - 20, screenY))
      const angle = Math.atan2(screenY - viewportSize.height / 2, screenX - viewportSize.width / 2)
      chips.push({ session: s, angle, x: edgeX, y: edgeY })
    }
    return chips
  }, [canvasSessions, nodeById, viewport, viewportSize])

  const onNodeContextMenu = useCallback((e: ReactMouseEvent, sessionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeContextMenu()
    window.addEventListener('click', handler)
    window.addEventListener('wheel', handler, { passive: true })
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('wheel', handler)
    }
  }, [contextMenu, closeContextMenu])

  // Drag + resize handlers — absolute world position / size, so repeated
  // strict-mode updater invocations stay idempotent.
  const handleDrag = useCallback((sessionId: string, x: number, y: number) => {
    setOverrides(prev => ({ ...prev, [sessionId]: { ...(prev[sessionId] ?? {}), x, y } }))
  }, [])

  const handleResize = useCallback((sessionId: string, width: number, height: number) => {
    setOverrides(prev => ({ ...prev, [sessionId]: { ...(prev[sessionId] ?? {}), width, height } }))
  }, [])

  const selectedSession = selectedSessionId ? sessionMap.get(selectedSessionId) ?? sessions.find(s => s.id === selectedSessionId) ?? null : null

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {dockVisible ? (
        <CanvasDockStrip
          sessions={canvasSessions}
          onFocusSession={(id) => flyToNode(id, Math.max(viewport.zoom, 1))}
          focusedSessionId={selectedSessionId}
          hoveredSessionId={hoveredSessionId}
          onHoverSession={setHoveredSessionId}
          onClose={() => setDockVisible(false)}
        />
      ) : (
        <button
          onClick={() => setDockVisible(true)}
          title="Show session dock"
          style={{
            position: 'absolute',
            top: 6, left: '50%',
            transform: 'translateX(-50%)',
            height: 18,
            padding: '0 10px',
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--color-bg-elevated)',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            boxShadow: 'var(--shadow-hover)',
            color: 'var(--color-text-tertiary)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            zIndex: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        >
          Show session dock
        </button>
      )}

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
          background: 'var(--color-bg)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          <InfiniteCanvas
            viewport={viewport}
            onViewportChange={(v) => {
              setViewport(v)
              if (followSessionId) setFollowSessionId(null)
              // Any manual pan/zoom cancels the "focused" state so opening
              // the drawer later no longer re-centers on behalf of the user.
              focusedNodeIdRef.current = null
            }}
            outerRef={canvasRef}
            onBackgroundClick={() => {
              if (contextMenu) setContextMenu(null)
              else if (selectedSessionId) onSelectedSessionChange(null)
            }}
            worldChildren={
              frames.length > 0 ? (
                <>
                  {frames.map(f => (
                    <div
                      key={`label-${f.directorId}`}
                      style={{
                        position: 'absolute',
                        left: f.x + 4,
                        top: f.y,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-mono)',
                        pointerEvents: 'none',
                      }}
                    >
                      {f.label}
                    </div>
                  ))}
                </>
              ) : null
            }
          >
            {nodes.map((n) => {
              const session = sessionMap.get(n.id)
              if (!session) return null
              return (
                <SessionNode
                  key={n.id}
                  session={session}
                  position={n.position}
                  selected={selectedSessionId === n.id}
                  dimmed={false}
                  directorColor={directorColor(session.linkedDirectorId)}
                  agentColor={agentColor(session.agent.id)}
                  onHoverChange={(h) => setHoveredSessionId(h ? n.id : (hoveredSessionId === n.id ? null : hoveredSessionId))}
                  onContextMenu={(e) => onNodeContextMenu(e, n.id)}
                  onDragStart={() => { /* noop placeholder */ }}
                  onDrag={(x, y) => handleDrag(n.id, x, y)}
                  onDragEnd={() => { /* noop placeholder */ }}
                  onResize={(w, h) => handleResize(n.id, w, h)}
                  onSteer={(text) => setSteerLog(prev => [...prev, { sessionId: n.id, text }])}
                  onExpand={() => onSelectedSessionChange(n.id)}
                  onFitToViewport={() => fitToNode(n.id)}
                  getZoom={getZoom}
                />
              )
            })}
          </InfiniteCanvas>

          {/* Off-screen attention chips (screen-space overlay) */}
          {offScreenAttention.map((chip) => (
            <button
              key={chip.session.id}
              onClick={() => flyToNode(chip.session.id, Math.max(viewport.zoom, 1))}
              style={{
                position: 'absolute',
                left: chip.x,
                top: chip.y,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                background: 'color-mix(in srgb, var(--color-warning) 22%, var(--color-bg-elevated))',
                color: 'var(--color-warning)',
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-full)',
                fontSize: 11,
                fontWeight: 500,
                boxShadow: 'var(--shadow-float)',
                cursor: 'pointer',
                zIndex: 6,
              }}
            >
              <AlertCircle size={11} strokeWidth={2} />
              <span>{chip.session.agent.name.replace(/^Agent\s+/, '')} needs input</span>
            </button>
          ))}

          {/* Completed-session toggle footnote */}
          {completedCount > 0 && (
            <button
              onClick={() => setShowCompleted(v => !v)}
              title={showCompleted ? 'Click to hide completed' : 'Click to show completed'}
              style={{
                position: 'absolute',
                left: 16,
                top: 12,
                padding: '2px 6px',
                fontSize: 10.5,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-mono)',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                zIndex: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {completedCount} completed · {showCompleted ? 'shown' : 'hidden'}
            </button>
          )}

          <CanvasToolbar
            zoom={viewport.zoom}
            onZoomIn={() => setViewport(v => ({ ...v, zoom: Math.min(2.5, v.zoom * 1.2) }))}
            onZoomOut={() => setViewport(v => ({ ...v, zoom: Math.max(0.3, v.zoom / 1.2) }))}
            onFit={fitToView}
            onReset={() => setViewport(v => ({ ...v, zoom: 1 }))}
            minimapOn={minimapOn}
            onToggleMinimap={() => setMinimapOn(m => !m)}
            sizePreset={sizePreset}
            onSizePresetChange={onSizePresetChange}
            aspectMode={aspectMode}
            onAspectModeChange={onAspectModeChange}
          />

          {minimapOn && (
            <CanvasMinimap
              nodes={nodes}
              sessions={sessionMap}
              viewport={viewport}
              viewportSize={viewportSize}
              onJump={(x, y) => flyToWorld(x, y)}
            />
          )}

          {/* Context menu */}
          {contextMenu && (() => {
            const s = sessionMap.get(contextMenu.sessionId)
            if (!s) return null
            return (
              <div
                style={{
                  position: 'fixed',
                  left: contextMenu.x,
                  top: contextMenu.y,
                  minWidth: 180,
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-float)',
                  padding: 4,
                  zIndex: 20,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <CtxItem label="Open transcript" onClick={() => { onSelectedSessionChange(s.id); closeContextMenu() }} />
                <CtxItem
                  label={followSessionId === s.id ? 'Stop following' : 'Follow'}
                  onClick={() => { setFollowSessionId(followSessionId === s.id ? null : s.id); closeContextMenu() }}
                />
                <CtxItem label="Copy link" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/sessions/${s.id}?view=canvas`); closeContextMenu() }} />
                {s.linkedDirectorId && onNavigateToWhiteboard && (
                  <CtxItem label="Open whiteboard" onClick={() => { onNavigateToWhiteboard(s.linkedDirectorId!); closeContextMenu() }} />
                )}
                {s.linkedTaskId && onNavigateToTask && (
                  <CtxItem label={`Open ${s.linkedTaskId}`} onClick={() => { onNavigateToTask(s.linkedTaskId!); closeContextMenu() }} />
                )}
                {s.linkedMRId && onNavigateToMR && (
                  <CtxItem label={`Open ${s.linkedMRId}`} onClick={() => { onNavigateToMR(s.linkedMRId!); closeContextMenu() }} />
                )}
                <CtxDivider />
                {s.linkedDirectorId && (
                  <CtxSwatchItem
                    label={`Director color`}
                    color={directorColor(s.linkedDirectorId)}
                    onClick={() => { openDirectorPicker(s.linkedDirectorId!); closeContextMenu() }}
                  />
                )}
                <CtxSwatchItem
                  label={`Agent color`}
                  color={agentColor(s.agent.id)}
                  onClick={() => { openAgentPicker(s.agent.id); closeContextMenu() }}
                />
                {((s.linkedDirectorId && directorColorOverrides[s.linkedDirectorId]) || agentColorOverrides[s.agent.id]) && (
                  <CtxItem
                    label="Reset colors"
                    onClick={() => {
                      if (s.linkedDirectorId) {
                        setDirectorColorOverrides(prev => { const next = { ...prev }; delete next[s.linkedDirectorId!]; return next })
                      }
                      setAgentColorOverrides(prev => { const next = { ...prev }; delete next[s.agent.id]; return next })
                      closeContextMenu()
                    }}
                  />
                )}
              </div>
            )
          })()}
        </div>

        {/* Detail drawer */}
        {selectedSession && (
          <div
            style={{
              width: 480,
              flexShrink: 0,
              borderLeft: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <SessionDetailView
                session={selectedSession}
                sessionIds={canvasSessions.map(s => s.id)}
                allSessions={canvasSessions}
                onBack={() => onSelectedSessionChange(null)}
                onNavigateToSession={(id) => { onSelectedSessionChange(id); fitToNode(id) }}
                onNavigateToAgent={onNavigateToAgent}
                onNavigateToTask={onNavigateToTask}
                onNavigateToMR={onNavigateToMR}
                onNavigateToWhiteboard={onNavigateToWhiteboard}
                onResumeSession={onResumeSession ? () => onResumeSession(selectedSession) : undefined}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hidden native color pickers triggered by context menu */}
      <input
        ref={directorPickerRef}
        type="color"
        style={{ position: 'fixed', width: 0, height: 0, padding: 0, border: 'none', opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const tgt = pickerTargetRef.current
          if (tgt?.kind !== 'director') return
          setDirectorColorOverrides(prev => ({ ...prev, [tgt.id]: e.target.value }))
        }}
      />
      <input
        ref={agentPickerRef}
        type="color"
        style={{ position: 'fixed', width: 0, height: 0, padding: 0, border: 'none', opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const tgt = pickerTargetRef.current
          if (tgt?.kind !== 'agent') return
          setAgentColorOverrides(prev => ({ ...prev, [tgt.id]: e.target.value }))
        }}
      />

      {/* Dev-only steer log popover (last message) */}
      {steerLog.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--color-bg-elevated)', color: 'var(--color-text)',
          padding: '6px 12px', borderRadius: 'var(--radius-full)',
          boxShadow: 'var(--shadow-float)',
          fontSize: 11, zIndex: 30, pointerEvents: 'none',
        }}>
          Sent to {sessionMap.get(steerLog[steerLog.length - 1].sessionId)?.agent.name ?? 'agent'}: "{steerLog[steerLog.length - 1].text.slice(0, 60)}"
        </div>
      )}
    </div>
  )
}

function CtxItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--color-text)',
        fontSize: 12,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}

function CtxSwatchItem({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--color-text)',
        fontSize: 12,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          width: 12, height: 12,
          borderRadius: 3,
          background: color,
          flexShrink: 0,
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-text) 18%, transparent)',
        }}
      />
      <span>{label}</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>edit</span>
    </button>
  )
}

function CtxDivider() {
  return <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 6px' }} />
}

/**
 * Resolve an HSL / named / hex color string to a #rrggbb hex via a temporary
 * element so <input type="color"> can seed its initial value.
 */
function rgbToHex(input: string): string {
  if (/^#([0-9a-f]{6})$/i.test(input)) return input.toLowerCase()
  if (typeof document === 'undefined') return '#808080'
  const probe = document.createElement('div')
  probe.style.color = input
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  document.body.removeChild(probe)
  const m = computed.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (!m) return '#808080'
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(+m[1])}${toHex(+m[2])}${toHex(+m[3])}`
}

