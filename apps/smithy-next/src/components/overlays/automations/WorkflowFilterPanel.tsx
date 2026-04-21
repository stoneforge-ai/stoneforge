import { useState } from 'react'
import type { Workflow, WFFilterField } from './wf-types'

interface WorkflowFilterPanelProps {
  workflows: Workflow[]
  filters: { field: WFFilterField; value: string }[]
  onToggleFilter: (field: WFFilterField, value: string) => void
  onClose: () => void
}

type Tab = 'status' | 'trigger' | 'tag'

export function WorkflowFilterPanel({ workflows, filters, onToggleFilter, onClose }: WorkflowFilterPanelProps) {
  const [tab, setTab] = useState<Tab>('status')

  const isActive = (field: WFFilterField, value: string) =>
    filters.some(f => f.field === field && f.value === value)

  const statusCounts = { active: 0, disabled: 0, error: 0, draft: 0 }
  const triggerCounts: Record<string, number> = {}
  const tagCounts: Record<string, number> = {}

  workflows.forEach(wf => {
    statusCounts[wf.status]++
    const tt = wf.trigger.type
    triggerCounts[tt] = (triggerCounts[tt] || 0) + 1
    wf.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1 })
  })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
      <div style={{
        position: 'absolute', top: 36, right: 0, zIndex: 1060,
        width: 240, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', overflow: 'hidden',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
          {(['status', 'trigger', 'tag'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500,
              background: tab === t ? 'var(--color-surface-active)' : 'transparent',
              color: tab === t ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              textTransform: 'capitalize',
            }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 8 }}>
          {tab === 'status' && Object.entries(statusCounts).map(([val, count]) => (
            <FilterButton key={val} label={val} count={count} active={isActive('status', val)} onClick={() => onToggleFilter('status', val)} />
          ))}

          {tab === 'trigger' && Object.entries(triggerCounts).map(([val, count]) => (
            <FilterButton key={val} label={val} count={count} active={isActive('trigger', val)} onClick={() => onToggleFilter('trigger', val)} />
          ))}

          {tab === 'tag' && Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([val, count]) => (
            <FilterButton key={val} label={val} count={count} active={isActive('tag', val)} onClick={() => onToggleFilter('tag', val)} />
          ))}
        </div>
      </div>
    </>
  )
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
      background: active ? 'var(--color-primary-subtle)' : 'transparent',
      border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
      color: active ? 'var(--color-text-accent)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
    }}>
      <span style={{ flex: 1, textTransform: 'capitalize' }}>{label}</span>
      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '0 5px' }}>
        {count}
      </span>
    </button>
  )
}
