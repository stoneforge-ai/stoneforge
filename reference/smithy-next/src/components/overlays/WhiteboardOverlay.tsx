import { useState, useCallback } from 'react'
import { ArrowLeft, PenTool } from 'lucide-react'
import type { WhiteboardEntry, DesignAnnotation } from '../../mock-data'
import { WhiteboardTabBar } from './whiteboard/WhiteboardTabBar'
import { WhiteboardCanvas } from './whiteboard/WhiteboardCanvas'
import { DesignModeOverlay } from './preview/DesignModeOverlay'

interface WhiteboardOverlayProps {
  directorId: string
  directorName: string
  whiteboards: WhiteboardEntry[]
  onBack: () => void
  onDesignHandoff?: (message: string, agent: string) => void
  theme?: 'dark' | 'light'
}

export function WhiteboardOverlay({
  directorId, directorName, whiteboards, onBack, onDesignHandoff, theme,
}: WhiteboardOverlayProps) {
  const [designMode, setDesignMode] = useState(false)
  const [annotationsByWhiteboard, setAnnotationsByWhiteboard] = useState<Record<string, DesignAnnotation[]>>({})

  const [activeWhiteboardId, setActiveWhiteboardId] = useState<string>(() => {
    const active = whiteboards.find(wb => wb.active)
    return active?.id || whiteboards[0]?.id || ''
  })

  const currentAnnotations = annotationsByWhiteboard[activeWhiteboardId] || []

  const handleAnnotationsChange = useCallback((anns: DesignAnnotation[]) => {
    if (!activeWhiteboardId) return
    setAnnotationsByWhiteboard(prev => ({ ...prev, [activeWhiteboardId]: anns }))
  }, [activeWhiteboardId])

  const shortName = directorName.replace('Director ', '')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <button
          onClick={onBack}
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Whiteboard</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>—</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{shortName}</span>

        <div style={{ flex: 1 }} />

        {/* Design Mode toggle */}
        <button
          onClick={() => setDesignMode(p => !p)}
          title="Design mode"
          style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
            background: designMode ? 'var(--color-primary-subtle)' : 'none',
            border: designMode ? '1px solid var(--color-primary)' : '1px solid transparent',
            color: designMode ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500,
            transition: 'all var(--duration-fast)',
          }}
          onMouseEnter={e => { if (!designMode) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { if (!designMode) e.currentTarget.style.background = 'none' }}
        >
          <PenTool size={13} strokeWidth={1.5} />
          <span className="hidden md:inline">Feedback</span>
          {currentAnnotations.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '0 4px', borderRadius: 8,
              background: 'var(--color-danger)', color: '#fff', lineHeight: '14px',
            }}>
              {currentAnnotations.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab bar */}
      <WhiteboardTabBar
        whiteboards={whiteboards}
        activeWhiteboardId={activeWhiteboardId}
        onWhiteboardChange={setActiveWhiteboardId}
        onNewWhiteboard={() => console.log('New whiteboard for', directorId)}
      />

      {/* Canvas area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeWhiteboardId && (
          <div
            key={activeWhiteboardId}
            style={{
              position: 'absolute', inset: 0,
              pointerEvents: designMode ? 'none' : 'auto',
            }}
          >
            <WhiteboardCanvas whiteboardId={activeWhiteboardId} theme={theme} />
          </div>
        )}

        {/* Design mode overlay */}
        {designMode && activeWhiteboardId && (
          <DesignModeOverlay
            annotations={currentAnnotations}
            onAnnotationsChange={handleAnnotationsChange}
            onDesignHandoff={onDesignHandoff}
          />
        )}
      </div>
    </div>
  )
}
