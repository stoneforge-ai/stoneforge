import { useState } from 'react'
import { Pencil, Square, ArrowUpRight, MessageCircle, X, Send, MousePointer2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { DesignAnnotation, DesignAnnotationTool } from '../../../mock-data'

interface AnnotationThreadProps {
  annotations: DesignAnnotation[]
  activeAnnotationId: string | null
  onSelectAnnotation: (id: string) => void
  onDeleteAnnotation: (id: string) => void
  onClearAll: () => void
  onSendToAgent: () => void
}

const toolIcon: Record<DesignAnnotationTool, typeof Pencil> = {
  select: MousePointer2, draw: Pencil, rectangle: Square,
  arrow: ArrowUpRight, comment: MessageCircle,
}

const toolLabel: Record<DesignAnnotationTool, string> = {
  select: 'Selection', draw: 'Drawing', rectangle: 'Rectangle',
  arrow: 'Arrow', comment: 'Comment',
}

export function AnnotationThread({
  annotations, activeAnnotationId, onSelectAnnotation, onDeleteAnnotation, onClearAll, onSendToAgent,
}: AnnotationThreadProps) {
  const [minimized, setMinimized] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  if (annotations.length === 0) return null

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: minimized ? 32 : 200, display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)',
      zIndex: 20, transition: 'height var(--duration-fast)',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          borderBottom: minimized ? 'none' : '1px solid var(--color-border-subtle)', flexShrink: 0,
          cursor: 'pointer',
        }}
        onClick={() => setMinimized(p => !p)}
      >
        {minimized
          ? <ChevronUp size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
          : <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>
          Design Feedback
        </span>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 10,
          background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
        }}>
          {annotations.length}
        </span>
        <div style={{ flex: 1 }} />

        {/* Clear button */}
        <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setConfirmClear(true)}
            style={{
              height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.borderColor = 'var(--color-danger)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)' }}
          >
            <Trash2 size={11} strokeWidth={1.5} />
            Clear
          </button>
          {confirmClear && (
            <div style={{
              position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', padding: 12, minWidth: 200,
              boxShadow: 'var(--shadow-lg)', zIndex: 30,
            }}>
              <div style={{ fontSize: 12, color: 'var(--color-text)', marginBottom: 8 }}>
                Clear all {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}?
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmClear(false)}
                  style={{
                    height: 24, padding: '0 10px', background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text)', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onClearAll(); setConfirmClear(false) }}
                  style={{
                    height: 24, padding: '0 10px', background: 'var(--color-danger)',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={e => { e.stopPropagation(); onSendToAgent() }}
          style={{
            height: 24, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Send size={11} strokeWidth={1.5} />
          Send to Agent
        </button>
      </div>

      {/* Annotation list — hidden when minimized */}
      {!minimized && (
        <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
          {annotations.map((ann, i) => {
            const Icon = toolIcon[ann.tool]
            const isActive = ann.id === activeAnnotationId
            return (
              <div
                key={ann.id}
                onClick={() => onSelectAnnotation(ann.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: isActive ? 'var(--color-primary-subtle)' : 'none',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-primary-subtle)' : 'none' }}
              >
                {/* Number badge */}
                <span style={{
                  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', background: ann.color || 'var(--color-danger)',
                  color: '#fff', fontSize: 10, fontWeight: 600, flexShrink: 0, marginTop: 1,
                }}>
                  {i + 1}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <Icon size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                      {toolLabel[ann.tool]}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                      {ann.timestamp}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--color-text)', lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {ann.comment || <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>No comment</span>}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); onDeleteAnnotation(ann.id) }}
                  style={{
                    width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
                    cursor: 'pointer', borderRadius: 'var(--radius-sm)', flexShrink: 0, opacity: 0.5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-danger)' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

