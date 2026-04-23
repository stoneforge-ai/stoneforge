import { useState, useRef, useEffect } from 'react'
import type { CIFilterField, CIActiveFilter, CIRun } from './ci-types'

interface CIFilterPanelProps {
  runs: CIRun[]
  filters: CIActiveFilter[]
  onToggleFilter: (field: CIFilterField, value: string) => void
  onClose: () => void
}

const TABS: { field: CIFilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'event', label: 'Event' },
  { field: 'branch', label: 'Branch' },
  { field: 'actor', label: 'Actor' },
]

export function CIFilterPanel({ runs, filters, onToggleFilter, onClose }: CIFilterPanelProps) {
  const [activeTab, setActiveTab] = useState<CIFilterField>('status')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Collect values for current tab
  const values = getValuesForField(activeTab, runs)
  const activeValues = filters.filter(f => f.field === activeTab).map(f => f.value)

  return (
    <div ref={panelRef} style={{
      position: 'absolute', top: 36, left: 0, zIndex: 1060,
      width: 280, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {TABS.map(tab => (
          <button
            key={tab.field}
            onClick={() => setActiveTab(tab.field)}
            style={{
              flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
              background: activeTab === tab.field ? 'var(--color-surface-active)' : 'transparent',
              color: activeTab === tab.field ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              borderBottom: activeTab === tab.field ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Values */}
      <div style={{ padding: 4, maxHeight: 240, overflow: 'auto' }}>
        {values.map(({ value, count }) => {
          const isActive = activeValues.includes(value)
          return (
            <button
              key={value}
              onClick={() => onToggleFilter(activeTab, value)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: isActive ? 'var(--color-surface-active)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                fontSize: 12, textAlign: 'left',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <StatusDot field={activeTab} value={value} />
              <span style={{ flex: 1 }}>{formatValue(activeTab, value)}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '0 5px' }}>
                {count}
              </span>
            </button>
          )
        })}
        {values.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>No values</div>
        )}
      </div>
    </div>
  )
}

function getValuesForField(field: CIFilterField, runs: CIRun[]): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const run of runs) {
    let val: string
    switch (field) {
      case 'status': val = run.status; break
      case 'event': val = run.event; break
      case 'branch': val = run.branch; break
      case 'actor': val = run.actor; break
      default: val = run.action.name; break
    }
    counts.set(val, (counts.get(val) || 0) + 1)
  }
  return Array.from(counts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
}

function formatValue(field: CIFilterField, value: string): string {
  if (field === 'event') {
    return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  if (field === 'status') {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
  return value
}

function StatusDot({ field, value }: { field: CIFilterField; value: string }) {
  if (field !== 'status') return null
  const color = value === 'success' ? 'var(--color-success)' : value === 'failure' ? 'var(--color-danger)' : value === 'running' ? 'var(--color-warning)' : value === 'cancelled' ? 'var(--color-text-tertiary)' : 'var(--color-text-tertiary)'
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
}
