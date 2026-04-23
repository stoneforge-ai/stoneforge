import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AgentExtended } from './agent-types'

interface AgentSidebarProps {
  agents: AgentExtended[]
  selectedAgentId: string
  onSelectAgent: (agent: AgentExtended) => void
}

const statusColor: Record<string, string> = {
  running: 'var(--color-success)', idle: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)', starting: 'var(--color-warning)',
}

export function AgentSidebar({ agents, selectedAgentId, onSelectAgent }: AgentSidebarProps) {
  const running = agents.filter(a => a.status === 'running' || a.status === 'starting')
  const idle = agents.filter(a => a.status === 'idle')
  const error = agents.filter(a => a.status === 'error')

  return (
    <div className="agent-sidebar" style={{
      width: 200, flexShrink: 0, borderRight: '1px solid var(--color-border)',
      overflow: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '10px 12px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border-subtle)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
        Agents
      </div>
      <div style={{ padding: '12px 0' }}>
        {running.length > 0 && <SidebarSection title="Running" agents={running} selectedId={selectedAgentId} onSelect={onSelectAgent} />}
        {idle.length > 0 && <SidebarSection title="Idle" agents={idle} selectedId={selectedAgentId} onSelect={onSelectAgent} />}
        {error.length > 0 && <SidebarSection title="Error" agents={error} selectedId={selectedAgentId} onSelect={onSelectAgent} />}
      </div>
    </div>
  )
}

function SidebarSection({ title, agents, selectedId, onSelect }: { title: string; agents: AgentExtended[]; selectedId: string; onSelect: (a: AgentExtended) => void }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', cursor: 'pointer' }}
      >
        <ChevronDown size={10} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform var(--duration-fast)' }} />
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
      </div>
      {!collapsed && agents.map(agent => {
        const isActive = agent.id === selectedId
        return (
          <div
            key={agent.id}
            onClick={() => onSelect(agent)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              cursor: 'pointer',
              background: isActive ? 'var(--color-surface-active)' : 'transparent',
              boxShadow: isActive ? 'inset 2px 0 0 var(--color-primary)' : 'none',
              transition: 'background var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-surface-active)' : 'transparent' }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor[agent.status] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.name}
            </span>
            {(agent.maxConcurrentTasks ?? 1) > 1 && (
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>x{agent.maxConcurrentTasks}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
