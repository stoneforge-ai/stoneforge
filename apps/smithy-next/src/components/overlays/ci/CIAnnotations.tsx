import { useState } from 'react'
import { XCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react'
import type { CIAnnotation } from './ci-types'

interface CIAnnotationsProps {
  annotations: CIAnnotation[]
}

export function CIAnnotations({ annotations }: CIAnnotationsProps) {
  const [expanded, setExpanded] = useState(true)

  if (annotations.length === 0) return null

  const errors = annotations.filter(a => a.level === 'error')
  const warnings = annotations.filter(a => a.level === 'warning')
  const notices = annotations.filter(a => a.level === 'notice')

  const parts: string[] = []
  if (errors.length) parts.push(`${errors.length} error${errors.length > 1 ? 's' : ''}`)
  if (warnings.length) parts.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`)
  if (notices.length) parts.push(`${notices.length} notice${notices.length > 1 ? 's' : ''}`)

  return (
    <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: errors.length > 0 ? 'var(--color-danger-subtle)' : 'var(--color-warning-subtle)',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        {errors.length > 0
          ? <XCircle size={13} strokeWidth={1.5} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          : <AlertTriangle size={13} strokeWidth={1.5} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
        }
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{parts.join(', ')}</span>
        {expanded
          ? <ChevronDown size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
          : <ChevronRight size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        }
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: '4px 0' }}>
          {[...errors, ...warnings, ...notices].map((a, i) => (
            <AnnotationRow key={i} annotation={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function AnnotationRow({ annotation }: { annotation: CIAnnotation }) {
  const Icon = annotation.level === 'error' ? XCircle : annotation.level === 'warning' ? AlertTriangle : Info
  const color = annotation.level === 'error' ? 'var(--color-danger)' : annotation.level === 'warning' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 12px' }}>
      <Icon size={12} strokeWidth={1.5} style={{ color, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.4 }}>{annotation.message}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {annotation.file && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              {annotation.file}{annotation.line ? `:${annotation.line}` : ''}
            </span>
          )}
          <span>{annotation.jobName}{annotation.stepName ? ` › ${annotation.stepName}` : ''}</span>
        </div>
      </div>
    </div>
  )
}
