import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal, Plus, X, ChevronDown } from 'lucide-react'
import type { PreviewTab, PreviewConsoleEntry } from '../mock-data'

type View = 'kanban' | 'whiteboard' | 'editor' | 'merge-requests' | 'ci' | 'preview' | 'sessions' | 'diff' | 'task-detail' | 'automations' | 'agents' | 'runtimes' | 'settings' | 'documents' | 'channels' | 'plans' | 'metrics' | 'workspaces'

interface BottomPanelProps {
  open: boolean
  onToggle: () => void
  activeView?: View
  activePreviewTab?: PreviewTab | null
  previewConsoleEntries?: PreviewConsoleEntry[]
}

const baseTabs = [
  { id: 't1', label: 'dev server' },
  { id: 't2', label: 'git' },
  { id: 't3', label: 'docker' },
]

export function BottomPanel({ open, onToggle, activeView, activePreviewTab, previewConsoleEntries }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState('t1')
  const [height, setHeight] = useState(240)

  // ── Drag resize ──
  const dragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (!open) return
    e.preventDefault()
    dragging.current = true
    dragStartY.current = e.clientY
    dragStartHeight.current = height
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [open, height])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = dragStartY.current - e.clientY
      const next = Math.max(100, Math.min(dragStartHeight.current + delta, window.innerHeight * 0.6))
      setHeight(next)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Build dynamic tab list
  const showPreviewConsole = activeView === 'preview' && activePreviewTab
  const previewTabId = 'preview-console'
  const tabs = showPreviewConsole
    ? [...baseTabs, { id: previewTabId, label: `preview: ${activePreviewTab.name}` }]
    : baseTabs

  // Auto-switch to preview console when entering Preview page
  useEffect(() => {
    if (showPreviewConsole) {
      setActiveTab(previewTabId)
    } else if (activeTab === previewTabId) {
      setActiveTab('t1')
    }
  }, [showPreviewConsole]) // eslint-disable-line react-hooks/exhaustive-deps

  const consoleColorForLevel = (level: PreviewConsoleEntry['level']) => {
    switch (level) {
      case 'error': return 'var(--color-danger)'
      case 'warn': return 'var(--color-warning)'
      default: return 'var(--color-text-tertiary)'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Drag handle — only when open */}
      {open && (
        <div
          onMouseDown={onDragStart}
          style={{
            height: 4, cursor: 'row-resize', flexShrink: 0,
            borderTop: '1px solid var(--color-border)',
            background: 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary)')}
          onMouseLeave={e => { if (!dragging.current) e.currentTarget.style.background = 'transparent' }}
        />
      )}

      {/* Tab strip / title bar */}
      <div
        onClick={e => {
          // When closed: click anywhere to open
          // When open: click on empty space (the bar itself, not buttons) to close
          if (!open) { onToggle(); return }
          if (e.target === e.currentTarget) onToggle()
        }}
        style={{
          height: 30, minHeight: 30,
          display: 'flex', alignItems: 'center',
          padding: '0 8px',
          borderTop: open ? 'none' : '1px solid var(--color-border)',
          background: 'var(--color-bg-secondary)',
          gap: 2,
          cursor: open ? 'default' : 'pointer',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'var(--color-bg-secondary)' }}
      >
        {/* Terminal label */}
        <button
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{
            height: 22, padding: '0 10px',
            display: 'flex', alignItems: 'center', gap: 5,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: open ? 'var(--color-surface-active)' : 'transparent',
            color: open ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            cursor: 'pointer',
            fontSize: 11, fontWeight: 500,
            transition: 'all var(--duration-fast)',
          }}
        >
          <Terminal size={12} strokeWidth={1.5} />
          Terminal
        </button>

        {/* Session tabs — only when open */}
        {open && (
          <>
            <div style={{ width: 1, height: 14, background: 'var(--color-border)', margin: '0 4px' }} />
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={e => { e.stopPropagation(); setActiveTab(tab.id) }}
                style={{
                  height: 22, padding: '0 8px',
                  borderRadius: 'var(--radius-sm)', border: 'none',
                  background: tab.id === activeTab ? 'var(--color-primary-subtle)' : 'transparent',
                  color: tab.id === activeTab ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
                  cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all var(--duration-fast)',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (tab.id !== activeTab) e.currentTarget.style.background = 'var(--color-surface-hover)'
                }}
                onMouseLeave={e => {
                  if (tab.id !== activeTab) e.currentTarget.style.background = 'transparent'
                }}
              >
                {tab.label}
                {tab.id === activeTab && tab.id !== previewTabId && (
                  <X size={10} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} onClick={e => e.stopPropagation()} />
                )}
              </button>
            ))}
            <button
              onClick={e => e.stopPropagation()}
              style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
            >
              <Plus size={11} strokeWidth={1.5} />
            </button>

            {/* Spacer — clicking this closes the panel */}
            <div style={{ flex: 1 }} />

            {/* Close button */}
            <button
              onClick={e => { e.stopPropagation(); onToggle() }}
              style={{
                width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
                cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              title="Close panel"
            >
              <ChevronDown size={12} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Terminal content — only when open */}
      {open && (
        <div
          style={{
            height,
            minHeight: 100,
            maxHeight: '60vh',
            background: 'var(--color-bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
            }}
          >
            {activeTab === previewTabId && previewConsoleEntries ? (
              /* Preview console output */
              <>
                {previewConsoleEntries.map((entry, i) => (
                  <div key={i} style={{ color: consoleColorForLevel(entry.level) }}>
                    [{entry.timestamp}] {entry.message}
                  </div>
                ))}
              </>
            ) : (
              /* Default terminal output */
              <>
                <div><span style={{ color: 'var(--color-success)' }}>~/stoneforge $</span> pnpm dev</div>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  <div>VITE v6.2.0  ready in 342 ms</div>
                  <div></div>
                  <div>  ➜  Local:   <span style={{ color: 'var(--color-primary)' }}>http://localhost:5174/</span></div>
                  <div>  ➜  Network: <span style={{ color: 'var(--color-text-tertiary)' }}>use --host to expose</span></div>
                  <div></div>
                  <div>[14:32:15] hmr update /src/components/layout/AppShell.tsx</div>
                  <div>[14:32:18] hmr update /src/styles/tokens.css</div>
                  <div style={{ color: 'var(--color-success)' }}>[14:33:02] page reload /src/main.tsx</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                  <span style={{ color: 'var(--color-success)' }}>~/stoneforge $</span>
                  <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--color-text-secondary)', opacity: 0.7 }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
