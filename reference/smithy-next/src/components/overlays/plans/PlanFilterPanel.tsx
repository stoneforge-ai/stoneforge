import { useState, useRef, useEffect } from 'react'
import type { Plan } from '../../../mock-data'
import type { PlanFilterField, PlanActiveFilter } from './plan-types'
import { PLAN_STATUS_CONFIG } from './plan-types'

interface PlanFilterPanelProps {
  plans: Plan[]
  filters: PlanActiveFilter[]
  onToggleFilter: (field: PlanFilterField, value: string) => void
  onClose: () => void
}

const TABS: { field: PlanFilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'tag', label: 'Tags' },
  { field: 'creator', label: 'Creator' },
]

export function PlanFilterPanel({ plans, filters, onToggleFilter, onClose }: PlanFilterPanelProps) {
  const [activeTab, setActiveTab] = useState<PlanFilterField>('status')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const values = getValuesForField(activeTab, plans)
  const activeValues = filters.filter(f => f.field === activeTab).map(f => f.value)

  return (
    <div ref={panelRef} style={{
      position: 'absolute', top: 36, left: 0, zIndex: 1060,
      width: 280, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {TABS.map(tab => {
          const tabCount = filters.filter(f => f.field === tab.field).length
          return (
            <button
              key={tab.field}
              onClick={() => setActiveTab(tab.field)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
                background: activeTab === tab.field ? 'var(--color-surface-active)' : 'transparent',
                color: activeTab === tab.field ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                borderBottom: activeTab === tab.field ? '2px solid var(--color-primary)' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              {tab.label}
              {tabCount > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />}
            </button>
          )
        })}
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
              {activeTab === 'status' && <StatusDot value={value} />}
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

function getValuesForField(field: PlanFilterField, plans: Plan[]): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const plan of plans) {
    switch (field) {
      case 'status':
        counts.set(plan.status, (counts.get(plan.status) || 0) + 1)
        break
      case 'tag':
        for (const tag of plan.tags) {
          counts.set(tag, (counts.get(tag) || 0) + 1)
        }
        break
      case 'creator':
        counts.set(plan.creator, (counts.get(plan.creator) || 0) + 1)
        break
    }
  }
  return Array.from(counts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
}

function formatValue(field: PlanFilterField, value: string): string {
  if (field === 'status') {
    return PLAN_STATUS_CONFIG[value as keyof typeof PLAN_STATUS_CONFIG]?.label || value
  }
  return value
}

function StatusDot({ value }: { value: string }) {
  const color = PLAN_STATUS_CONFIG[value as keyof typeof PLAN_STATUS_CONFIG]?.color || 'var(--color-text-tertiary)'
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
}
