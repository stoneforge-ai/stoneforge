import { useState, useRef, useEffect } from 'react'
import type { Session, SessionFilterField, SessionActiveFilter } from './session-types'

interface SessionFilterPanelProps {
  sessions: Session[]
  filters: SessionActiveFilter[]
  onToggleFilter: (field: SessionFilterField, value: string) => void
  onClose: () => void
}

const tabs: { field: SessionFilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'agent', label: 'Agent' },
  { field: 'environment', label: 'Environment' },
]

const statusColors: Record<string, string> = {
  active: 'var(--color-success)',
  completed: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)',
}

export function SessionFilterPanel({ sessions, filters, onToggleFilter, onClose }: SessionFilterPanelProps) {
  const [activeTab, setActiveTab] = useState<SessionFilterField>('status')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Collect unique values with counts for the active tab
  const values: { value: string; count: number }[] = []
  const seen = new Set<string>()
  for (const s of sessions) {
    let v = ''
    if (activeTab === 'status') v = s.status
    else if (activeTab === 'agent') v = s.agent.name
    else if (activeTab === 'environment') v = s.environment
    if (!seen.has(v)) {
      seen.add(v)
      values.push({ value: v, count: sessions.filter(s2 => {
        if (activeTab === 'status') return s2.status === v
        if (activeTab === 'agent') return s2.agent.name === v
        return s2.environment === v
      }).length })
    }
  }

  return (
    <div ref={panelRef} style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-float)',
      zIndex: 'var(--z-dropdown)',
      minWidth: 240,
      overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map(tab => {
          const isActive = tab.field === activeTab
          return (
            <button
              key={tab.field}
              onClick={() => setActiveTab(tab.field)}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 500,
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Values */}
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {values.map(({ value, count }) => {
          const isSelected = filters.some(f => f.field === activeTab && f.value === value)
          return (
            <button
              key={value}
              onClick={() => onToggleFilter(activeTab, value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontSize: 13,
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-hover)'
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.background = 'transparent'
              }}
            >
              {activeTab === 'status' && (
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: statusColors[value] ?? 'var(--color-text-tertiary)',
                  flexShrink: 0,
                }} />
              )}
              <span style={{ flex: 1, textTransform: activeTab === 'status' || activeTab === 'environment' ? 'capitalize' : undefined }}>
                {value}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
