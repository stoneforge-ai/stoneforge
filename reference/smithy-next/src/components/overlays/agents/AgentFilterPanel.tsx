import { useState, useRef, useEffect } from 'react'
import type { AgentExtended, AgentFilterField, AgentActiveFilter } from './agent-types'
import { mockRuntimes } from '../runtimes/runtime-mock-data'

interface AgentFilterPanelProps {
  agents: AgentExtended[]
  filters: AgentActiveFilter[]
  onToggleFilter: (field: AgentFilterField, value: string) => void
  onClose: () => void
}

const TABS: { field: AgentFilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'environment', label: 'Runtime' },
  { field: 'model', label: 'Model' },
  { field: 'provider', label: 'Provider' },
]

export function AgentFilterPanel({ agents, filters, onToggleFilter, onClose }: AgentFilterPanelProps) {
  const [activeTab, setActiveTab] = useState<AgentFilterField>('status')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const values = getValuesForField(activeTab, agents)
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
              <FilterDot field={activeTab} value={value} />
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

function getValuesForField(field: AgentFilterField, agents: AgentExtended[]): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const agent of agents) {
    let vals: string[] = []
    switch (field) {
      case 'status': vals = [agent.status]; break
      case 'model': vals = [agent.model]; break
      case 'provider': vals = [agent.provider]; break
      case 'environment': {
        const rt = mockRuntimes.find(r => r.id === agent.runtimeId)
        vals = [rt?.name || agent.environment]
        break
      }
    }
    for (const v of vals) {
      counts.set(v, (counts.get(v) || 0) + 1)
    }
  }
  return Array.from(counts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
}

function formatValue(_field: AgentFilterField, value: string): string {
  const labels: Record<string, string> = {
    running: 'Running', idle: 'Idle', error: 'Error', starting: 'Starting',
    local: 'Local', cloud: 'Cloud',
    'claude-code': 'Claude Code', codex: 'Codex', opencode: 'OpenCode',
  }
  return labels[value] || value.charAt(0).toUpperCase() + value.slice(1)
}

function FilterDot({ field, value }: { field: AgentFilterField; value: string }) {
  if (field === 'status') {
    const color = value === 'running' ? 'var(--color-success)' : value === 'error' ? 'var(--color-danger)' : value === 'starting' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'
    return <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
  }
  return null
}
