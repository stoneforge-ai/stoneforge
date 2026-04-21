import { useState, useRef, useCallback, useEffect } from 'react'
import type { DesignAnnotation, DesignAnnotationTool } from '../../../mock-data'
import { DesignToolbar } from './DesignToolbar'
import { AnnotationThread } from './AnnotationThread'
import { DesignHandoffDialog } from './DesignHandoffDialog'

interface DesignModeOverlayProps {
  annotations: DesignAnnotation[]
  onAnnotationsChange: (annotations: DesignAnnotation[]) => void
  linkedTaskId?: string
  onDesignHandoff?: (message: string, agent: string) => void
}

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6']

function nextColor(annotations: DesignAnnotation[]): string {
  return COLORS[annotations.length % COLORS.length]
}

export function DesignModeOverlay({
  annotations, onAnnotationsChange, linkedTaskId, onDesignHandoff,
}: DesignModeOverlayProps) {
  const [activeTool, setActiveTool] = useState<DesignAnnotationTool>('comment')
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [handoffOpen, setHandoffOpen] = useState(false)

  // Drawing state
  const svgRef = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([])
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

  // Comment input state
  const [commentInput, setCommentInput] = useState<{ x: number; y: number; annotationId: string } | null>(null)
  const [commentText, setCommentText] = useState('')
  const commentRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (commentInput && commentRef.current) commentRef.current.focus()
  }, [commentInput])

  const getNormalized = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
  }, [])

  const getPixel = (norm: { x: number; y: number }, svgRect: DOMRect) => ({
    x: norm.x * svgRect.width,
    y: norm.y * svgRect.height,
  })

  const createAnnotation = useCallback((partial: Partial<DesignAnnotation>): DesignAnnotation => ({
    id: `da-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tool: activeTool,
    comment: '',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    color: nextColor(annotations),
    ...partial,
  }), [activeTool, annotations])

  const saveComment = useCallback(() => {
    if (!commentInput) return
    onAnnotationsChange(annotations.map(a =>
      a.id === commentInput.annotationId ? { ...a, comment: commentText } : a
    ))
    setCommentInput(null)
    setCommentText('')
  }, [commentInput, commentText, annotations, onAnnotationsChange])

  const cancelComment = useCallback(() => {
    if (!commentInput) return
    // If comment is empty, remove the annotation entirely
    if (!commentText.trim()) {
      onAnnotationsChange(annotations.filter(a => a.id !== commentInput.annotationId))
    }
    setCommentInput(null)
    setCommentText('')
  }, [commentInput, commentText, annotations, onAnnotationsChange])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (commentInput) return
    if (activeTool === 'select') return
    const pt = getNormalized(e)

    if (activeTool === 'comment') {
      const ann = createAnnotation({ points: [pt] })
      onAnnotationsChange([...annotations, ann])
      setCommentInput({ x: e.clientX, y: e.clientY, annotationId: ann.id })
      setCommentText('')
      return
    }

    if (activeTool === 'draw') {
      setDrawing(true)
      setCurrentPoints([pt])
      return
    }

    if (activeTool === 'rectangle' || activeTool === 'arrow') {
      setDrawing(true)
      setDragStart(pt)
      setCurrentRect({ x: pt.x, y: pt.y, w: 0, h: 0 })
      return
    }
  }, [activeTool, commentInput, getNormalized, createAnnotation, annotations, onAnnotationsChange])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return
    const pt = getNormalized(e)

    if (activeTool === 'draw') {
      setCurrentPoints(prev => [...prev, pt])
      return
    }

    if (dragStart && (activeTool === 'rectangle' || activeTool === 'arrow')) {
      setCurrentRect({
        x: Math.min(dragStart.x, pt.x),
        y: Math.min(dragStart.y, pt.y),
        w: Math.abs(pt.x - dragStart.x),
        h: Math.abs(pt.y - dragStart.y),
      })
    }
  }, [drawing, activeTool, dragStart, getNormalized])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawing) return
    setDrawing(false)

    if (activeTool === 'draw' && currentPoints.length > 1) {
      const ann = createAnnotation({ points: currentPoints })
      onAnnotationsChange([...annotations, ann])
      setCommentInput({ x: e.clientX, y: e.clientY, annotationId: ann.id })
      setCommentText('')
    }

    if ((activeTool === 'rectangle') && currentRect && currentRect.w > 0.01) {
      const ann = createAnnotation({ rect: currentRect })
      onAnnotationsChange([...annotations, ann])
      setCommentInput({ x: e.clientX, y: e.clientY, annotationId: ann.id })
      setCommentText('')
    }

    if (activeTool === 'arrow' && dragStart) {
      const pt = getNormalized(e)
      if (Math.abs(pt.x - dragStart.x) > 0.01 || Math.abs(pt.y - dragStart.y) > 0.01) {
        const ann = createAnnotation({ points: [dragStart, pt] })
        onAnnotationsChange([...annotations, ann])
        setCommentInput({ x: e.clientX, y: e.clientY, annotationId: ann.id })
        setCommentText('')
      }
    }

    setCurrentPoints([])
    setCurrentRect(null)
    setDragStart(null)
  }, [drawing, activeTool, currentPoints, currentRect, dragStart, createAnnotation, annotations, onAnnotationsChange, getNormalized])

  const deleteAnnotation = useCallback((id: string) => {
    onAnnotationsChange(annotations.filter(a => a.id !== id))
    if (activeAnnotationId === id) setActiveAnnotationId(null)
  }, [annotations, activeAnnotationId, onAnnotationsChange])

  const svgRect = svgRef.current?.getBoundingClientRect()

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
      {/* SVG annotation layer */}
      <svg
        ref={svgRef}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          cursor: activeTool === 'select' ? 'default' :
                  activeTool === 'comment' ? 'crosshair' :
                  activeTool === 'draw' ? 'crosshair' : 'crosshair',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Rendered annotations */}
        {annotations.map((ann, i) => (
          <AnnotationShape key={ann.id} annotation={ann} index={i} svgRef={svgRef}
            isActive={ann.id === activeAnnotationId}
            onClick={() => setActiveAnnotationId(ann.id)}
          />
        ))}

        {/* Current drawing in progress */}
        {drawing && activeTool === 'draw' && currentPoints.length > 1 && svgRect && (
          <polyline
            points={currentPoints.map(p => `${p.x * svgRect.width},${p.y * svgRect.height}`).join(' ')}
            fill="none" stroke={nextColor(annotations)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          />
        )}
        {drawing && (activeTool === 'rectangle') && currentRect && svgRect && (
          <rect
            x={currentRect.x * svgRect.width} y={currentRect.y * svgRect.height}
            width={currentRect.w * svgRect.width} height={currentRect.h * svgRect.height}
            fill="none"
            stroke={nextColor(annotations)} strokeWidth={2}
          />
        )}
        {drawing && activeTool === 'arrow' && dragStart && currentRect && svgRect && (() => {
          const pt = { x: dragStart.x + (currentRect.x > dragStart.x ? currentRect.w : -currentRect.w),
                       y: dragStart.y + (currentRect.y > dragStart.y ? currentRect.h : -currentRect.h) }
          return (
            <line
              x1={dragStart.x * svgRect.width} y1={dragStart.y * svgRect.height}
              x2={(dragStart.x + (currentRect.w * (currentRect.x >= dragStart.x ? 1 : -1))) * svgRect.width}
              y2={(dragStart.y + (currentRect.h * (currentRect.y >= dragStart.y ? 1 : -1))) * svgRect.height}
              stroke={nextColor(annotations)} strokeWidth={2} markerEnd={`url(#arrowhead-${nextColor(annotations).replace('#', '')})`}
            />
          )
        })()}

        {/* Arrow markers — one per color */}
        <defs>
          {COLORS.map(c => (
            <marker key={c} id={`arrowhead-${c.replace('#', '')}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={c} />
            </marker>
          ))}
        </defs>
      </svg>

      {/* Floating toolbar */}
      <DesignToolbar activeTool={activeTool} onToolChange={setActiveTool} />

      {/* Comment input popup */}
      {commentInput && (
        <div style={{
          position: 'fixed',
          left: Math.min(commentInput.x + 8, window.innerWidth - 260),
          top: Math.min(commentInput.y + 8, window.innerHeight - 120),
          width: 240, padding: 8,
          background: 'var(--color-bg)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 30,
        }}>
          <textarea
            ref={commentRef}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveComment() }
              if (e.key === 'Escape') cancelComment()
            }}
            style={{
              width: '100%', minHeight: 48, padding: 8,
              background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', fontSize: 12, lineHeight: 1.4,
              color: 'var(--color-text)', outline: 'none', resize: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
            <button onClick={cancelComment} style={{
              height: 22, padding: '0 8px', background: 'none', border: 'none',
              color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={saveComment} style={{
              height: 22, padding: '0 8px', background: 'var(--color-primary)', border: 'none',
              borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}>Save</button>
          </div>
        </div>
      )}

      {/* Annotation thread */}
      <AnnotationThread
        annotations={annotations}
        activeAnnotationId={activeAnnotationId}
        onSelectAnnotation={setActiveAnnotationId}
        onDeleteAnnotation={deleteAnnotation}
        onClearAll={() => { onAnnotationsChange([]); setActiveAnnotationId(null) }}
        onSendToAgent={() => setHandoffOpen(true)}
      />

      {/* Handoff dialog */}
      {handoffOpen && (
        <DesignHandoffDialog
          annotations={annotations}
          linkedTaskId={linkedTaskId}
          onClose={() => setHandoffOpen(false)}
          onSend={(msg, agent) => {
            onDesignHandoff?.(msg, agent)
            setHandoffOpen(false)
          }}
        />
      )}
    </div>
  )
}

/* Renders a single annotation as SVG shapes */
function AnnotationShape({ annotation: ann, index, svgRef, isActive, onClick }: {
  annotation: DesignAnnotation; index: number; svgRef: React.RefObject<SVGSVGElement | null>
  isActive: boolean; onClick: () => void
}) {
  const svg = svgRef.current
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  const color = ann.color || '#ef4444'
  const strokeW = isActive ? 3 : 2

  return (
    <g onClick={e => { e.stopPropagation(); onClick() }} style={{ cursor: 'pointer' }}>
      {/* Comment pin */}
      {ann.tool === 'comment' && ann.points?.[0] && (() => {
        const px = ann.points[0].x * rect.width
        const py = ann.points[0].y * rect.height
        return (
          <>
            <circle cx={px} cy={py} r={isActive ? 13 : 11} fill={color} opacity={0.9} />
            <text x={px} y={py + 4} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600}>
              {index + 1}
            </text>
          </>
        )
      })()}

      {/* Freehand draw */}
      {ann.tool === 'draw' && ann.points && ann.points.length > 1 && (
        <>
          <polyline
            points={ann.points.map(p => `${p.x * rect.width},${p.y * rect.height}`).join(' ')}
            fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round"
            opacity={isActive ? 1 : 0.8}
          />
          {/* Number badge at first point */}
          <circle cx={ann.points[0].x * rect.width} cy={ann.points[0].y * rect.height} r={9} fill={color} />
          <text x={ann.points[0].x * rect.width} y={ann.points[0].y * rect.height + 3.5}
            textAnchor="middle" fill="#fff" fontSize={9} fontWeight={600}>{index + 1}</text>
        </>
      )}

      {/* Rectangle */}
      {ann.tool === 'rectangle' && ann.rect && (
        <>
          <rect
            x={ann.rect.x * rect.width} y={ann.rect.y * rect.height}
            width={ann.rect.w * rect.width} height={ann.rect.h * rect.height}
            fill="none"
            stroke={color} strokeWidth={strokeW}
            opacity={isActive ? 1 : 0.8}
          />
          {/* Number badge at top-left */}
          <circle cx={ann.rect.x * rect.width} cy={ann.rect.y * rect.height} r={9} fill={color} />
          <text x={ann.rect.x * rect.width} y={ann.rect.y * rect.height + 3.5}
            textAnchor="middle" fill="#fff" fontSize={9} fontWeight={600}>{index + 1}</text>
        </>
      )}

      {/* Arrow */}
      {ann.tool === 'arrow' && ann.points && ann.points.length === 2 && (
        <>
          <line
            x1={ann.points[0].x * rect.width} y1={ann.points[0].y * rect.height}
            x2={ann.points[1].x * rect.width} y2={ann.points[1].y * rect.height}
            stroke={color} strokeWidth={strokeW} markerEnd={`url(#arrowhead-${color.replace('#', '')})`}
            opacity={isActive ? 1 : 0.8}
          />
          {/* Number badge at start */}
          <circle cx={ann.points[0].x * rect.width} cy={ann.points[0].y * rect.height} r={9} fill={color} />
          <text x={ann.points[0].x * rect.width} y={ann.points[0].y * rect.height + 3.5}
            textAnchor="middle" fill="#fff" fontSize={9} fontWeight={600}>{index + 1}</text>
        </>
      )}
    </g>
  )
}
