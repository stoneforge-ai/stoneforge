import { useState } from 'react'
import { LayoutGrid, AlertCircle, Users, Check, ChevronDown } from 'lucide-react'
import type { LayoutMode } from './canvas-layout'

export const LAYOUT_OPTIONS: Array<{ value: LayoutMode; label: string; description: string; Icon: typeof Users }> = [
  { value: 'cluster', label: 'Cluster by director', description: 'Group sessions by their director', Icon: Users },
  { value: 'grid', label: 'Grid', description: 'Uniform 3-column grid', Icon: LayoutGrid },
  { value: 'status-stack', label: 'Stack by status', description: 'Triage columns: input needed · error · active', Icon: AlertCircle },
]

interface CanvasLayoutPickerProps {
  mode: LayoutMode
  onChange: (mode: LayoutMode) => void
  onReapply: () => void
  /** Render as a compact icon-only button ("floating toolbar" style). */
  compact?: boolean
}

export function CanvasLayoutPicker({ mode, onChange, onReapply, compact }: CanvasLayoutPickerProps) {
  const [open, setOpen] = useState(false)
  const current = LAYOUT_OPTIONS.find(o => o.value === mode) ?? LAYOUT_OPTIONS[0]
  const CurrentIcon = current.Icon

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Layout: ${current.label}`}
        style={
          compact
            ? {
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: open ? 'var(--color-surface-active)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: open ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
              }
            : {
                height: 26,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: open ? 'var(--color-surface-active)' : 'var(--color-surface)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: open ? 'var(--color-text)' : 'var(--color-text-secondary)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
              }
        }
        onMouseEnter={(e) => { if (!open && !compact) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={(e) => { if (!open && !compact) e.currentTarget.style.background = 'var(--color-surface)' }}
      >
        <CurrentIcon size={compact ? 12 : 13} strokeWidth={1.6} />
        {!compact && <>{current.label}<ChevronDown size={11} strokeWidth={1.6} style={{ opacity: 0.7 }} /></>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
          <div
            style={{
              position: 'absolute',
              right: compact ? 0 : undefined,
              left: compact ? undefined : 0,
              bottom: compact ? 'calc(100% + 6px)' : undefined,
              top: compact ? undefined : 'calc(100% + 4px)',
              minWidth: 240,
              background: 'var(--color-bg-elevated)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-float)',
              padding: 4,
              zIndex: 6,
            }}
          >
            <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
              Auto-layout
            </div>
            {LAYOUT_OPTIONS.map(opt => {
              const OptIcon = opt.Icon
              const active = opt.value === mode
              return (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: active ? 'var(--color-surface-active)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  <OptIcon size={13} strokeWidth={1.6} style={{ color: active ? 'var(--color-text-accent)' : 'var(--color-text-secondary)', marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>{opt.description}</div>
                  </div>
                  {active && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-text-accent)', marginTop: 2, flexShrink: 0 }} />}
                </button>
              )
            })}
            <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 6px' }} />
            <button
              onClick={() => { onReapply(); setOpen(false) }}
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
              Re-apply current layout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
