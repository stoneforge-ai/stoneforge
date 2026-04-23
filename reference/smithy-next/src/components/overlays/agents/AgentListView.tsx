import { useState, useRef, useMemo, useEffect } from 'react'
import {
  Search, Filter, SlidersHorizontal, X, Plus,
  GitBranch, Container, Box, ChevronRight, ChevronDown, ArrowDown, ArrowUp,
} from 'lucide-react'
import type {
  AgentExtended, AgentFilterField, AgentActiveFilter,
  AgentSortField, AgentGroupField,
} from './agent-types'
import { AgentFilterPanel } from './AgentFilterPanel'
import { mockSessions } from '../../../mock-data'
import { mockRuntimes } from '../runtimes/runtime-mock-data'
import type { RuntimeMode } from '../runtimes/runtime-types'
import { runtimeModeLabels, runtimeModeColors } from '../runtimes/runtime-types'

const runtimeModeIcon: Record<RuntimeMode, typeof GitBranch> = {
  worktrees: GitBranch, docker: Container, sandbox: Box,
}

function getRuntimeName(runtimeId?: string): string {
  if (!runtimeId) return 'unassigned'
  const rt = mockRuntimes.find(r => r.id === runtimeId)
  return rt?.name || runtimeId
}

function getRuntimeModeIcon(runtimeId?: string): typeof GitBranch {
  if (!runtimeId) return GitBranch
  const rt = mockRuntimes.find(r => r.id === runtimeId)
  return rt ? runtimeModeIcon[rt.mode] : GitBranch
}

interface AgentListViewProps {
  agents: AgentExtended[]
  onSelectAgent: (agent: AgentExtended) => void
  onCreateAgent: () => void
  onToggleAgentEnabled?: (agentId: string) => void
}

const statusColor: Record<string, string> = {
  running: 'var(--color-success)', idle: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)', starting: 'var(--color-warning)',
}

const groupDotColor: Record<string, string> = {
  running: 'var(--color-success)', idle: 'var(--color-text-tertiary)', error: 'var(--color-danger)',
  starting: 'var(--color-warning)',
  Anthropic: 'var(--color-primary)', OpenAI: 'var(--color-success)',
  local: 'var(--color-text-secondary)', cloud: 'var(--color-primary)',
}

export function AgentListView({ agents, onSelectAgent, onCreateAgent, onToggleAgentEnabled }: AgentListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [filters, setFilters] = useState<AgentActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<AgentGroupField>('status')
  const [sortField, setSortField] = useState<AgentSortField>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const toggleFilter = (field: AgentFilterField, value: string) => {
    setFilters(prev => {
      const exists = prev.find(f => f.field === field && f.value === value)
      if (exists) return prev.filter(f => !(f.field === field && f.value === value))
      return [...prev, { field, value }]
    })
  }

  // Filter + sort
  const filtered = useMemo(() => {
    let result = agents

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.provider.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      )
    }

    for (const f of filters) {
      switch (f.field) {
        case 'status': result = result.filter(a => a.status === f.value); break
        case 'environment': result = result.filter(a => getRuntimeName(a.runtimeId) === f.value); break
        case 'model': result = result.filter(a => a.model === f.value); break
        case 'provider': result = result.filter(a => a.provider === f.value); break
      }
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'status': {
          const order = { running: 0, starting: 1, error: 2, idle: 3 }
          cmp = (order[a.status] ?? 9) - (order[b.status] ?? 9)
          break
        }
        case 'lastActive': cmp = 0; break
        case 'sessions': cmp = b.sessions.length - a.sessions.length; break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [agents, searchQuery, filters, sortField, sortAsc])

  // Group
  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ title: 'All agents', dotColor: 'var(--color-text-tertiary)', items: filtered }]

    if (groupBy === 'status') {
      const running = filtered.filter(a => a.status === 'running' || a.status === 'starting')
      const idle = filtered.filter(a => a.status === 'idle')
      const error = filtered.filter(a => a.status === 'error')
      const groups: { title: string; dotColor: string; items: AgentExtended[] }[] = []
      if (running.length) groups.push({ title: 'Running', dotColor: 'var(--color-success)', items: running })
      if (idle.length) groups.push({ title: 'Idle', dotColor: 'var(--color-text-tertiary)', items: idle })
      if (error.length) groups.push({ title: 'Error', dotColor: 'var(--color-danger)', items: error })
      return groups
    }

    if (groupBy === 'provider') {
      const byProvider = new Map<string, AgentExtended[]>()
      filtered.forEach(a => {
        if (!byProvider.has(a.provider)) byProvider.set(a.provider, [])
        byProvider.get(a.provider)!.push(a)
      })
      return [...byProvider.entries()].map(([provider, items]) => ({
        title: provider, dotColor: groupDotColor[provider] || 'var(--color-text-secondary)', items,
      }))
    }

    if (groupBy === 'environment') {
      const byRuntime = new Map<string, AgentExtended[]>()
      filtered.forEach(a => {
        const name = getRuntimeName(a.runtimeId)
        if (!byRuntime.has(name)) byRuntime.set(name, [])
        byRuntime.get(name)!.push(a)
      })
      return [...byRuntime.entries()].map(([name, items]) => ({
        title: name, dotColor: groupDotColor[name] || 'var(--color-text-secondary)', items,
      }))
    }

    return [{ title: 'All agents', dotColor: 'var(--color-text-tertiary)', items: filtered }]
  }, [filtered, groupBy])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Agents</span>

        {/* Active filter pills */}
        {filters.map(f => (
          <span key={`${f.field}-${f.value}`} style={{
            height: 22, padding: '0 6px 0 8px', display: 'flex', alignItems: 'center', gap: 4,
            borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 500,
          }}>
            {f.field}: {f.value}
            <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => toggleFilter(f.field, f.value)} />
          </span>
        ))}
        {filters.length > 0 && (
          <button onClick={() => setFilters([])} style={{ height: 22, padding: '0 6px', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>Clear all</button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div className="agent-search-container" style={{ position: 'relative' }}>
          <div className="agent-search-desktop" style={{ display: 'flex' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
              <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search agents..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>}
            </div>
          </div>
          <div className="agent-search-mobile" style={{ display: 'none' }}>
            {searchExpanded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 180, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border-focus)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
                <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                <input ref={searchInputRef} autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." onBlur={() => { if (!searchQuery) setSearchExpanded(false) }} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
                <button onClick={() => { setSearchQuery(''); setSearchExpanded(false) }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>
              </div>
            ) : (
              <button onClick={() => setSearchExpanded(true)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <Search size={13} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* Filter button */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)',
            background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
            color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <Filter size={12} strokeWidth={1.5} /> Filter {filters.length > 0 && `(${filters.length})`}
          </button>
          {filterOpen && <AgentFilterPanel agents={agents} filters={filters} onToggleFilter={toggleFilter} onClose={() => setFilterOpen(false)} />}
        </div>

        {/* Display options */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)',
            background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
            color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
          </button>
          {displayOpen && <DisplayPanel groupBy={groupBy} onGroupByChange={setGroupBy} sortField={sortField} onSortChange={setSortField} sortAsc={sortAsc} onSortDirChange={() => setSortAsc(!sortAsc)} onClose={() => setDisplayOpen(false)} />}
        </div>

        {/* New Agent */}
        <button onClick={onCreateAgent} style={{
          height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          <Plus size={12} strokeWidth={1.5} /> New Agent
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>
        {groups.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No agents match your filters
          </div>
        )}
        {groups.map(group => (
          <Section key={group.title} title={group.title} count={group.items.length} dotColor={group.dotColor}>
            {group.items.map(agent => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onClick={() => onSelectAgent(agent)}
                onToggleEnabled={() => onToggleAgentEnabled?.(agent.id)}
              />
            ))}
          </Section>
        ))}
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 900px) {
          .agent-row-lastactive { display: none !important; }
          .agent-row-sessions { display: none !important; }
        }
        @media (max-width: 768px) {
          .agent-search-desktop { display: none !important; }
          .agent-search-mobile { display: flex !important; }
          .agent-row-model { display: none !important; }
          .agent-row-env { display: none !important; }
          .agent-row-runtime { display: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ──

function Section({ title, count, children }: { title: string; count: number; dotColor?: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ marginBottom: 24 }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 8, cursor: 'pointer' }}>
        <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform var(--duration-fast)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px' }}>{count}</span>
      </div>
      {!collapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>}
    </div>
  )
}

function AgentRow({ agent, onClick, onToggleEnabled }: {
  agent: AgentExtended; onClick: () => void;
  onToggleEnabled?: () => void;
}) {
  const [hovered, setHovered] = useState(false)
  const RuntimeIcon = getRuntimeModeIcon(agent.runtimeId)
  const runtimeName = getRuntimeName(agent.runtimeId)
  const sessionCount = mockSessions.filter(s => s.agent.name === agent.name || s.agent.id === agent.id).length

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
        cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)',
        background: hovered ? 'var(--color-surface-hover)' : 'transparent',
        transition: `background var(--duration-fast)`,
        opacity: agent.enabled ? 1 : 0.5,
      }}
    >
      {/* Status dot */}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: agent.enabled ? (statusColor[agent.status] || 'var(--color-text-tertiary)') : 'var(--color-text-tertiary)', flexShrink: 0 }} />

      {/* Name */}
      <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1, minWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agent.name}
      </span>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {agent.tags.slice(0, 2).map(tag => (
          <span key={tag} style={{
            fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-full)',
            background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
            whiteSpace: 'nowrap',
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Provider badge */}
      <span className="agent-row-env" style={{
        fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-full)',
        flexShrink: 0, whiteSpace: 'nowrap',
        background: agent.provider === 'claude-code' ? 'rgba(217, 119, 6, 0.12)' : agent.provider === 'codex' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
        color: agent.provider === 'claude-code' ? '#d97706' : agent.provider === 'codex' ? '#10b981' : '#6366f1',
      }}>
        {agent.provider === 'claude-code' ? 'Claude Code' : agent.provider === 'codex' ? 'Codex' : agent.provider === 'opencode' ? 'OpenCode' : agent.provider}
      </span>

      {/* Model */}
      <span className="agent-row-model" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120, flexShrink: 0 }}>
        {agent.model}
      </span>

      {/* Runtime */}
      <span className="agent-row-runtime" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, maxWidth: 120, overflow: 'hidden' }}>
        <RuntimeIcon size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{runtimeName}</span>
      </span>

      {/* Sessions count */}
      <span className="agent-row-sessions" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
        {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
      </span>

      {/* Last active */}
      <span className="agent-row-lastactive" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, minWidth: 55, textAlign: 'right' }}>
        {agent.lastActiveAt}
      </span>

      {/* Enable/disable toggle */}
      <button
        onClick={e => { e.stopPropagation(); onToggleEnabled?.() }}
        title={agent.enabled ? 'Disable agent' : 'Enable agent'}
        style={{
          width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: agent.enabled ? 'var(--color-success)' : 'var(--color-surface-active)',
          position: 'relative', transition: 'background var(--duration-fast)',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: agent.enabled ? 16 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white', transition: 'left var(--duration-fast)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }} />
      </button>

      <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
    </div>
  )
}


// ── Display Panel ──

function DisplayPanel({ groupBy, onGroupByChange, sortField, onSortChange, sortAsc, onSortDirChange, onClose }: {
  groupBy: AgentGroupField; onGroupByChange: (g: AgentGroupField) => void;
  sortField: AgentSortField; onSortChange: (s: AgentSortField) => void;
  sortAsc: boolean; onSortDirChange: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const groupOptions: { value: AgentGroupField; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'provider', label: 'Provider' }, { value: 'environment', label: 'Runtime' },
    { value: 'none', label: 'None' },
  ]
  const sortOptions: { value: AgentSortField; label: string }[] = [
    { value: 'name', label: 'Name' }, { value: 'status', label: 'Status' },
    { value: 'lastActive', label: 'Last active' }, { value: 'sessions', label: 'Sessions' },
  ]

  return (
    <div ref={panelRef} style={{
      position: 'absolute', top: 36, right: 0, zIndex: 1060,
      width: 220, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 4px 6px' }}>Group by</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {groupOptions.map(opt => (
          <button key={opt.value} onClick={() => onGroupByChange(opt.value)} style={{
            height: 24, padding: '0 8px', fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            background: groupBy === opt.value ? 'var(--color-surface-active)' : 'var(--color-surface)',
            color: groupBy === opt.value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 4px 6px' }}>Sort by</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {sortOptions.map(opt => (
          <button key={opt.value} onClick={() => {
            if (sortField === opt.value) onSortDirChange()
            else onSortChange(opt.value)
          }} style={{
            height: 24, padding: '0 8px', fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3,
            background: sortField === opt.value ? 'var(--color-surface-active)' : 'var(--color-surface)',
            color: sortField === opt.value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
          }}>
            {opt.label}
            {sortField === opt.value && (sortAsc ? <ArrowUp size={10} strokeWidth={1.5} /> : <ArrowDown size={10} strokeWidth={1.5} />)}
          </button>
        ))}
      </div>
    </div>
  )
}
