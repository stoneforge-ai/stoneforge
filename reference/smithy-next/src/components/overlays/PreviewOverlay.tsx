import { useState, useRef, useEffect, useCallback } from 'react'
import { RefreshCw, ExternalLink, Monitor, Tablet, Smartphone, Maximize, Settings, Plus, X, ChevronDown, PenTool, Terminal } from 'lucide-react'
import { Tooltip } from '../Tooltip'
import { PreviewConfigDialog } from './PreviewConfigDialog'
import { DesignModeOverlay } from './preview/DesignModeOverlay'
import type { PreviewEnvironment, PreviewTab, DevicePreset, DesignAnnotation } from '../../mock-data'
import { DEVICE_PRESETS } from '../../mock-data'

interface PreviewOverlayProps {
  onBack: () => void
  environments: PreviewEnvironment[]
  tabs: PreviewTab[]
  activeTabId: string | null
  onTabChange: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabAdd: (envId: string) => void
  onEnvironmentsChange: (envs: PreviewEnvironment[]) => void
  onTabsChange: (tabs: PreviewTab[]) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onDesignHandoff?: (message: string, agent: string) => void
  onToggleTerminal?: () => void
  terminalOpen?: boolean
}

const deviceIcon = (name: string, size: number) => {
  switch (name) {
    case 'Desktop': return <Monitor size={size} strokeWidth={1.5} />
    case 'Tablet': return <Tablet size={size} strokeWidth={1.5} />
    case 'Mobile': return <Smartphone size={size} strokeWidth={1.5} />
    default: return <Maximize size={size} strokeWidth={1.5} />
  }
}

const statusColor = (status: PreviewTab['previewStatus']) =>
  status === 'ready' ? 'var(--color-success)' : status === 'building' ? 'var(--color-warning)' : 'var(--color-danger)'

const statusLabel = (status: PreviewTab['previewStatus']) =>
  status === 'ready' ? 'Ready' : status === 'building' ? 'Building...' : 'Failed'

export function PreviewOverlay({
  environments, tabs, activeTabId, onTabChange, onTabClose, onTabAdd,
  onEnvironmentsChange, onTabsChange, onNavigateToTask, onNavigateToMR, onDesignHandoff, onToggleTerminal, terminalOpen,
}: PreviewOverlayProps) {
  const [configOpen, setConfigOpen] = useState(false)
  const [designMode, setDesignMode] = useState(false)
  const [annotations, setAnnotations] = useState<DesignAnnotation[]>([])
  const [selectedDevice, setSelectedDevice] = useState<DevicePreset>(DEVICE_PRESETS[0])
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false)
  const [addDropdownOpen, setAddDropdownOpen] = useState(false)
  const deviceRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLDivElement>(null)
  const tabScrollRef = useRef<HTMLDivElement>(null)
  const previewAreaRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [tabsOverflow, setTabsOverflow] = useState(false)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || null

  // Measure preview container
  useEffect(() => {
    if (!previewAreaRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    ro.observe(previewAreaRef.current)
    return () => ro.disconnect()
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (deviceRef.current && !deviceRef.current.contains(e.target as Node)) setDeviceDropdownOpen(false)
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Detect tab overflow
  const checkTabOverflow = useCallback(() => {
    const el = tabScrollRef.current
    if (!el) return
    setTabsOverflow(el.scrollWidth > el.clientWidth)
  }, [])

  useEffect(() => {
    checkTabOverflow()
    const el = tabScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(checkTabOverflow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs.length, checkTabOverflow])

  // Compute device frame dimensions
  const isResponsive = selectedDevice.width === 0
  const frameWidth = isResponsive ? containerSize.width : selectedDevice.width
  const frameHeight = isResponsive ? containerSize.height : selectedDevice.height
  const needsScale = !isResponsive && (selectedDevice.width > containerSize.width - 32 || selectedDevice.height > containerSize.height - 32)
  const scale = needsScale
    ? Math.min((containerSize.width - 32) / selectedDevice.width, (containerSize.height - 32) / selectedDevice.height, 1)
    : 1

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)',
        position: 'relative', zIndex: 10,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Preview</span>

        {/* URL bar (readonly) */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
          padding: '4px 10px', marginLeft: 8,
        }}>
          <input
            value={activeTab?.url || ''}
            readOnly
            placeholder="No preview open"
            style={{
              flex: 1, background: 'none', border: 'none',
              color: activeTab ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
              fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
        </div>

        {/* Refresh */}
        <IconBtn title="Refresh"><RefreshCw size={14} strokeWidth={1.5} /></IconBtn>

        {/* Open in browser */}
        <IconBtn title="Open in browser" onClick={() => activeTab && window.open(activeTab.url, '_blank')}>
          <ExternalLink size={14} strokeWidth={1.5} />
        </IconBtn>

        {/* Device selector */}
        <div ref={deviceRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDeviceDropdownOpen(p => !p)}
            style={{
              height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
              background: deviceDropdownOpen ? 'var(--color-primary-subtle)' : 'none',
              border: 'none',
              color: deviceDropdownOpen ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500,
            }}
          >
            {deviceIcon(selectedDevice.name, 13)}
            <span className="hidden md:inline">{selectedDevice.name}</span>
            <ChevronDown className="hidden md:inline" size={10} strokeWidth={1.5} />
          </button>
          {deviceDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', padding: 4, minWidth: 180,
              boxShadow: 'var(--shadow-lg)', zIndex: 100,
            }}>
              {DEVICE_PRESETS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => { setSelectedDevice(preset); setDeviceDropdownOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    background: preset.name === selectedDevice.name ? 'var(--color-primary-subtle)' : 'none',
                    border: 'none',
                    color: preset.name === selectedDevice.name ? 'var(--color-text-accent)' : 'var(--color-text)',
                    cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 12,
                  }}
                >
                  {deviceIcon(preset.name, 14)}
                  <span>{preset.name}</span>
                  {preset.width > 0 && (
                    <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                      {preset.width} x {preset.height}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Viewport size indicator */}
        {!isResponsive && (
          <span className="hidden md:inline" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {selectedDevice.width} x {selectedDevice.height}
          </span>
        )}

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
          <span className="hidden md:inline">Design</span>
          {annotations.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '0 4px', borderRadius: 8,
              background: 'var(--color-danger)', color: '#fff', lineHeight: '14px',
            }}>
              {annotations.length}
            </span>
          )}
        </button>

        {/* Settings */}
        <IconBtn title="Preview settings" onClick={() => setConfigOpen(true)}>
          <Settings size={14} strokeWidth={1.5} />
        </IconBtn>
      </div>

      {/* ── Tab bar ── */}
      {(tabs.length > 0 || environments.length > 0) && (
        <div className="overflow-x-auto" style={{
          height: 32, minHeight: 32, display: 'flex', alignItems: 'center',
          padding: '0 8px', borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-secondary)', gap: 0,
          scrollbarWidth: 'none',
        }}>
          <div
            ref={tabScrollRef}
            style={{
              display: 'flex', alignItems: 'stretch', gap: 0,
              overflowX: 'auto', overflowY: 'hidden',
              flex: tabsOverflow ? 1 : 'none',
              scrollbarWidth: 'none',
              height: '100%',
            }}
          >
            {tabs.map(tab => {
              const isActive = tab.id === (activeTab?.id)
              return (
                <button
                  key={tab.id}
                  className="flex flex-wrap md:flex-nowrap items-center gap-x-1.5 gap-y-0 px-3 shrink-0 cursor-pointer whitespace-nowrap"
                  onClick={() => onTabChange(tab.id)}
                  style={{
                    background: 'none', border: 'none', borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                    color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                    fontSize: 12, fontWeight: isActive ? 500 : 400,
                    transition: 'all var(--duration-fast)',
                    padding: '4px 12px',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget.style.color = 'var(--color-text-secondary)') }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget.style.color = 'var(--color-text-tertiary)') }}
                >
                  <span className="flex items-center gap-1.5">
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: statusColor(tab.previewStatus), flexShrink: 0,
                    }} />
                    <span>{tab.name}</span>
                  </span>
                  {tab.branch && (
                    <span className="hidden md:inline" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      ({tab.branch})
                    </span>
                  )}
                  <span
                    onClick={e => { e.stopPropagation(); onTabClose(tab.id) }}
                    style={{
                      width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)', opacity: isActive ? 1 : 0,
                      transition: 'opacity var(--duration-fast)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <X size={10} strokeWidth={1.5} />
                  </span>
                </button>
              )
            })}
          </div>

          {/* Add tab button — sits right after last tab, or pinned at right edge when tabs overflow */}
          <div ref={addRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Tooltip label="Open preview" placement="bottom">
              <button
                onClick={() => setAddDropdownOpen(p => !p)}
                style={{
                  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
                  cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                  transition: 'all var(--duration-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <Plus size={13} strokeWidth={1.5} />
              </button>
            </Tooltip>
            {addDropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: 4, minWidth: 200,
                boxShadow: 'var(--shadow-lg)', zIndex: 100,
              }}>
                {environments.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    No environments configured
                  </div>
                ) : environments.map(env => (
                  <button
                    key={env.id}
                    onClick={() => { onTabAdd(env.id); setAddDropdownOpen(false) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                      background: 'none', border: 'none', color: 'var(--color-text)',
                      cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 12, textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <Monitor size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{env.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {env.url}
                      </div>
                    </div>
                  </button>
                ))}
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
                <button
                  onClick={() => { setAddDropdownOpen(false); setConfigOpen(true) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
                    cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 12,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <Settings size={12} strokeWidth={1.5} />
                  <span>Configure environments...</span>
                </button>
              </div>
            )}
          </div>

          {/* Right side — spacer + context chips + terminal button */}
          <div style={{ flex: 1 }} />

          {activeTab && (activeTab.linkedTaskId || activeTab.linkedMRId) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', flexShrink: 0, fontSize: 11 }}>
              {activeTab.linkedTaskId && (
                <button
                  onClick={() => onNavigateToTask?.(activeTab.linkedTaskId!)}
                  style={{
                    padding: '2px 7px', borderRadius: 'var(--radius-sm)', lineHeight: '16px',
                    background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-accent)',
                    cursor: 'pointer', fontWeight: 500, fontSize: 11,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
                >
                  {activeTab.linkedTaskId}
                </button>
              )}
              {activeTab.linkedMRId && (
                <button
                  onClick={() => onNavigateToMR?.(activeTab.linkedMRId!)}
                  style={{
                    padding: '2px 7px', borderRadius: 'var(--radius-sm)', lineHeight: '16px',
                    background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-accent)',
                    cursor: 'pointer', fontWeight: 500, fontSize: 11,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
                >
                  {activeTab.linkedMRId}
                </button>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: statusColor(activeTab.previewStatus), fontSize: 11 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor(activeTab.previewStatus) }} />
                {statusLabel(activeTab.previewStatus)}
              </span>
            </div>
          )}

          {/* Toggle terminal */}
          <Tooltip label={terminalOpen ? 'Close terminal' : 'Open in terminal'} placement="bottom">
            <button
              onClick={onToggleTerminal}
              style={{
                width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: terminalOpen ? 'var(--color-primary-subtle)' : 'none',
                border: 'none', color: terminalOpen ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
                cursor: 'pointer', borderRadius: 'var(--radius-sm)', flexShrink: 0, marginRight: 4,
              }}
              onMouseEnter={e => { if (!terminalOpen) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (!terminalOpen) e.currentTarget.style.background = 'none' }}
            >
              <Terminal size={13} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
      )}

      {/* ── Preview area ── */}
      <div
        ref={previewAreaRef}
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: 'var(--color-bg-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {!activeTab ? (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            color: 'var(--color-text-tertiary)',
          }}>
            <Monitor size={40} strokeWidth={1} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>No preview environments open</div>
            <div style={{ fontSize: 12 }}>
              {environments.length > 0
                ? 'Click + to open a preview tab'
                : 'Configure a preview environment to get started'}
            </div>
            <button
              onClick={() => setConfigOpen(true)}
              style={{
                marginTop: 4, height: 28, padding: '0 14px',
                background: 'var(--color-primary)', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {environments.length > 0 ? 'Open a preview' : 'Configure environments'}
            </button>
          </div>
        ) : isResponsive ? (
          /* Full-bleed preview */
          <div style={{
            width: '100%', height: '100%',
            background: 'var(--color-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              <Monitor size={32} strokeWidth={1} style={{ opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{activeTab.url}</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Preview iframe</div>
            </div>
          </div>
        ) : (
          /* Framed device preview */
          <div style={{
            width: frameWidth, height: frameHeight,
            transform: needsScale ? `scale(${scale})` : undefined,
            transformOrigin: 'center center',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 6,
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{activeTab.url}</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                {selectedDevice.name} ({selectedDevice.width} x {selectedDevice.height})
              </div>
            </div>
          </div>
        )}

        {/* Design mode overlay */}
        {designMode && activeTab && (
          <DesignModeOverlay
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
            linkedTaskId={activeTab.linkedTaskId}
            onDesignHandoff={onDesignHandoff}
          />
        )}
      </div>

      {/* Config dialog */}
      {configOpen && (
        <PreviewConfigDialog
          environments={environments}
          onClose={() => setConfigOpen(false)}
          onSave={onEnvironmentsChange}
        />
      )}
    </div>
  )
}

/* Small icon button helper */
function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <Tooltip label={title}>
      <button
        onClick={onClick}
        style={{
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
          cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          transition: 'all var(--duration-fast)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {children}
      </button>
    </Tooltip>
  )
}
