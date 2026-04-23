import { useState, type ReactNode } from 'react'
import { Maximize2, Minus, Plus, Map, Ruler, Check, RectangleHorizontal } from 'lucide-react'
import { SIZE_PRESETS, ASPECT_MULTIPLIERS, type SizePreset, type AspectMode } from './canvas-layout'

interface CanvasToolbarProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  minimapOn: boolean
  onToggleMinimap: () => void
  sizePreset: SizePreset
  onSizePresetChange: (preset: SizePreset) => void
  aspectMode: AspectMode
  onAspectModeChange: (aspect: AspectMode) => void
}

const SIZE_ORDER: SizePreset[] = ['compact', 'default', 'comfortable', 'large']
const ASPECT_ORDER: AspectMode[] = ['thin', 'balanced', 'wide']

export function CanvasToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  minimapOn,
  onToggleMinimap,
  sizePreset,
  onSizePresetChange,
  aspectMode,
  onAspectModeChange,
}: CanvasToolbarProps) {
  const [sizeOpen, setSizeOpen] = useState(false)
  const [aspectOpen, setAspectOpen] = useState(false)
  const current = SIZE_PRESETS[sizePreset]
  const currentAspect = ASPECT_MULTIPLIERS[aspectMode]

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        background: 'var(--color-bg-elevated)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-float)',
        zIndex: 5,
      }}
    >
      <ToolbarBtn title="Zoom out" onClick={onZoomOut}><Minus size={13} strokeWidth={1.8} /></ToolbarBtn>
      <button
        onClick={onReset}
        title="Reset zoom (0)"
        style={{
          padding: '0 8px', height: 24, minWidth: 46,
          background: 'transparent', border: 'none',
          color: 'var(--color-text-secondary)', cursor: 'pointer',
          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500,
          borderRadius: 'var(--radius-sm)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolbarBtn title="Zoom in" onClick={onZoomIn}><Plus size={13} strokeWidth={1.8} /></ToolbarBtn>
      <Divider />
      <ToolbarBtn title="Fit to view (F)" onClick={onFit}><Maximize2 size={12} strokeWidth={1.8} /></ToolbarBtn>
      <div style={{ position: 'relative' }}>
        <ToolbarBtn title={`Window size: ${current.label}`} active={sizeOpen} onClick={() => setSizeOpen(o => !o)}>
          <Ruler size={12} strokeWidth={1.8} />
        </ToolbarBtn>
        {sizeOpen && (
          <>
            <div onClick={() => setSizeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
            <div
              style={{
                position: 'absolute',
                right: 0,
                bottom: 'calc(100% + 6px)',
                minWidth: 220,
                background: 'var(--color-bg-elevated)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-float)',
                padding: 4,
                zIndex: 6,
              }}
            >
              <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
                Default window size
              </div>
              {SIZE_ORDER.map(key => {
                const opt = SIZE_PRESETS[key]
                const active = key === sizePreset
                return (
                  <button
                    key={key}
                    onClick={() => { onSizePresetChange(key); setSizeOpen(false) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
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
                    <SizeGlyph width={opt.width} height={opt.height} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{opt.label}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                      {opt.width}×{opt.height}
                    </span>
                    {active && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-text-accent)' }} />}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <ToolbarBtn title={`Aspect: ${currentAspect.label}`} active={aspectOpen} onClick={() => setAspectOpen(o => !o)}>
          <RectangleHorizontal size={12} strokeWidth={1.8} style={{ transform: aspectMode === 'thin' ? 'rotate(90deg)' : undefined }} />
        </ToolbarBtn>
        {aspectOpen && (
          <>
            <div onClick={() => setAspectOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
            <div
              style={{
                position: 'absolute',
                right: 0,
                bottom: 'calc(100% + 6px)',
                minWidth: 180,
                background: 'var(--color-bg-elevated)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-float)',
                padding: 4,
                zIndex: 6,
              }}
            >
              <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
                Aspect
              </div>
              {ASPECT_ORDER.map(key => {
                const opt = ASPECT_MULTIPLIERS[key]
                const active = key === aspectMode
                return (
                  <button
                    key={key}
                    onClick={() => { onAspectModeChange(key); setAspectOpen(false) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
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
                    <AspectGlyph mode={key} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{opt.label}</span>
                    <span style={{ flex: 1 }} />
                    {active && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-text-accent)' }} />}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
      <Divider />
      <ToolbarBtn title="Toggle minimap" active={minimapOn} onClick={onToggleMinimap}><Map size={12} strokeWidth={1.8} /></ToolbarBtn>
    </div>
  )
}

/** Rectangle glyph that mirrors the aspect ratio of each mode. */
function AspectGlyph({ mode }: { mode: AspectMode }) {
  const { w, h } = ASPECT_MULTIPLIERS[mode]
  // Normalize so the longer side is 16px
  const base = 16
  const scale = base / Math.max(w, h)
  const dw = Math.round(w * scale * 10) / 10
  const dh = Math.round(h * scale * 10) / 10
  return (
    <div
      style={{
        width: 18, height: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: dw, height: dh,
          border: '1.5px solid var(--color-text-tertiary)',
          borderRadius: 2,
        }}
      />
    </div>
  )
}

/** Tiny proportional rectangle glyph so users can eyeball each size option. */
function SizeGlyph({ width, height }: { width: number; height: number }) {
  const maxDim = 18
  const scale = maxDim / Math.max(width, height)
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  return (
    <div
      style={{
        width: 18, height: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: w, height: h,
          border: '1.5px solid var(--color-text-tertiary)',
          borderRadius: 2,
        }}
      />
    </div>
  )
}

function ToolbarBtn({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 24, height: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--color-surface-active)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: active ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: 'var(--color-border-subtle)', margin: '0 2px' }} />
}
