import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties, type RefObject, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react'

export interface Viewport {
  panX: number
  panY: number
  zoom: number
}

export interface InfiniteCanvasProps {
  viewport: Viewport
  onViewportChange: (next: Viewport) => void
  /** Optional overlay SVG rendered in screen-space (above nodes), e.g. edges. */
  worldChildren?: ReactNode
  /** Nodes rendered inside the world (pan/zoom affects them). */
  children?: ReactNode
  style?: CSSProperties
  /** Ref exposing the outer viewport div for size measurement. */
  outerRef?: RefObject<HTMLDivElement | null>
  /** Called when user background-clicks empty canvas. */
  onBackgroundClick?: () => void
}

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5

export function InfiniteCanvas({
  viewport,
  onViewportChange,
  worldChildren,
  children,
  style,
  outerRef,
  onBackgroundClick,
}: InfiniteCanvasProps) {
  const internalRef = useRef<HTMLDivElement | null>(null)
  const containerRef = outerRef ?? internalRef
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const spaceDown = useRef(false)
  const didDrag = useRef(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceDown.current) {
        spaceDown.current = true
        if (containerRef.current) containerRef.current.style.cursor = 'grab'
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false
        if (containerRef.current && !isPanning) containerRef.current.style.cursor = ''
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [containerRef, isPanning])

  const handleWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    // Zoom vs scroll priority:
    //  - Mouse wheel (discrete large ticks, deltaMode>0 or |deltaY|>=50) → always zoom canvas
    //  - Cmd/Ctrl + wheel → zoom canvas
    //  - Trackpad continuous scroll (small pixel deltas) → defer to chat if it
    //    can actually scroll in that direction; otherwise zoom.
    const target = e.target as HTMLElement
    const zoomModifier = e.metaKey || e.ctrlKey
    const isMouseWheel = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50
    if (!zoomModifier && !isMouseWheel) {
      let el: HTMLElement | null = target
      while (el && el !== e.currentTarget) {
        const overflowY = getComputedStyle(el).overflowY
        const scrollable = overflowY === 'auto' || overflowY === 'scroll'
        if (scrollable && el.scrollHeight > el.clientHeight) {
          const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1
          const canScrollUp = el.scrollTop > 0
          if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) return
          break
        }
        el = el.parentElement
      }
    }

    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top
    const worldX = (cursorX - viewport.panX) / viewport.zoom
    const worldY = (cursorY - viewport.panY) / viewport.zoom

    const scaleFactor = Math.exp(-e.deltaY * 0.0015)
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * scaleFactor))

    const nextPanX = cursorX - worldX * nextZoom
    const nextPanY = cursorY - worldY * nextZoom

    onViewportChange({ panX: nextPanX, panY: nextPanY, zoom: nextZoom })
  }, [viewport, onViewportChange, containerRef])

  const handleMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const isMiddle = e.button === 1
    const isLeft = e.button === 0
    // Pan when:
    //   - middle-click anywhere
    //   - Space+left-click anywhere (incl. over a node)
    //   - left-click on empty canvas (target not inside a session node)
    const onNode = !!(e.target as HTMLElement).closest?.('[data-session-id]')
    const wantPan = isMiddle || (isLeft && spaceDown.current) || (isLeft && !onNode)
    if (!wantPan) return
    e.preventDefault()
    setIsPanning(true)
    didDrag.current = false
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
    }
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
  }, [viewport.panX, viewport.panY, containerRef])

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panStart.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true
    onViewportChange({
      panX: panStart.current.panX + dx,
      panY: panStart.current.panY + dy,
      zoom: viewport.zoom,
    })
  }, [isPanning, onViewportChange, viewport.zoom])

  const handleMouseUp = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false)
      panStart.current = null
      if (containerRef.current) {
        containerRef.current.style.cursor = spaceDown.current ? 'grab' : ''
      }
      return
    }
    if (e.target === containerRef.current && !didDrag.current) onBackgroundClick?.()
  }, [isPanning, onBackgroundClick, containerRef])

  const transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (isPanning) {
          setIsPanning(false)
          panStart.current = null
          if (containerRef.current) containerRef.current.style.cursor = ''
        }
      }}
      onContextMenu={(e) => { if (isPanning) e.preventDefault() }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        userSelect: 'none',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {worldChildren}
        {children}
      </div>
    </div>
  )
}
