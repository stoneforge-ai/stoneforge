import { useState, useRef, useEffect, useMemo } from 'react'
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Bot,
  CheckCircle2,
  AlertCircle,
  GitPullRequest,
  CircleDot,
  Clock,
  Search,
  Filter,
  SlidersHorizontal,
  X,
  Check,
} from 'lucide-react'
import type { WorkspaceInfo, WorkspaceActivity } from '../../mock-data'
import { mockWorkspaceActivity, mockWorkspaceThreads } from '../../mock-data'

interface WorkspacesOverlayProps {
  onBack: () => void
  workspaces: WorkspaceInfo[]
  activeWorkspaceId: string
  onSwitchWorkspace: (id: string) => void
  onNewWorkspace?: () => void
}

type SortField = 'activity' | 'status' | 'name' | 'agents'
type FilterTab = 'status' | 'agents'

const STATUS_OPTIONS: { value: WorkspaceInfo['status']; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'var(--color-success)' },
  { value: 'needs-attention', label: 'Needs attention', color: 'var(--color-warning)' },
  { value: 'error', label: 'Error', color: 'var(--color-danger)' },
  { value: 'idle', label: 'Idle', color: 'var(--color-text-tertiary)' },
]

const AGENT_OPTIONS = [
  { value: 'running', label: 'Has running agents' },
  { value: 'none', label: 'No running agents' },
]

export function WorkspacesOverlay({ onBack, workspaces, activeWorkspaceId, onSwitchWorkspace, onNewWorkspace }: WorkspacesOverlayProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set())
  const [filterAgents, setFilterAgents] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('activity')
  const [sortAsc, setSortAsc] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('status')
  const [displayOpen, setDisplayOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLDivElement>(null)

  // Close panels on outside click
  useEffect(() => {
    if (!filterOpen && !displayOpen) return
    const handler = (e: MouseEvent) => {
      if (filterOpen && filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
      if (displayOpen && displayRef.current && !displayRef.current.contains(e.target as Node)) setDisplayOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen, displayOpen])

  const activeFilterCount = filterStatuses.size + filterAgents.size

  // Build filter pills
  const filterPills: { field: string; value: string; onRemove: () => void }[] = useMemo(() => {
    const pills: { field: string; value: string; onRemove: () => void }[] = []
    filterStatuses.forEach(s => {
      const label = STATUS_OPTIONS.find(o => o.value === s)?.label || s
      pills.push({ field: 'Status', value: label, onRemove: () => setFilterStatuses(prev => { const n = new Set(prev); n.delete(s); return n }) })
    })
    filterAgents.forEach(a => {
      const label = AGENT_OPTIONS.find(o => o.value === a)?.label || a
      pills.push({ field: 'Agents', value: label, onRemove: () => setFilterAgents(prev => { const n = new Set(prev); n.delete(a); return n }) })
    })
    return pills
  }, [filterStatuses, filterAgents])

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...workspaces]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(ws => ws.name.toLowerCase().includes(q) || (ws.repo && ws.repo.toLowerCase().includes(q)))
    }

    // Filter: status
    if (filterStatuses.size > 0) {
      result = result.filter(ws => filterStatuses.has(ws.status))
    }

    // Filter: agents
    if (filterAgents.size > 0) {
      result = result.filter(ws => {
        if (filterAgents.has('running') && ws.runningAgents > 0) return true
        if (filterAgents.has('none') && ws.runningAgents === 0) return true
        return false
      })
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'status') {
        const order = { active: 0, 'needs-attention': 1, error: 2, idle: 3 }
        cmp = (order[a.status] ?? 4) - (order[b.status] ?? 4)
      } else if (sortField === 'agents') {
        cmp = b.runningAgents - a.runningAgents
      } else {
        cmp = b.lastOpened - a.lastOpened
      }
      return sortAsc ? -cmp : cmp
    })

    return result
  }, [workspaces, searchQuery, filterStatuses, filterAgents, sortField, sortAsc])

  // Status counts for filter panel
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    workspaces.forEach(ws => { counts[ws.status] = (counts[ws.status] || 0) + 1 })
    return counts
  }, [workspaces])

  const agentCounts = useMemo(() => {
    let running = 0, none = 0
    workspaces.forEach(ws => { if (ws.runningAgents > 0) running++; else none++ })
    return { running, none }
  }, [workspaces])

  const clearAllFilters = () => { setFilterStatuses(new Set()); setFilterAgents(new Set()) }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Unified toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Workspaces</span>

        {/* Active filter pills */}
        {filterPills.map((pill, i) => (
          <span key={i} style={{
            height: 22, padding: '0 6px 0 8px', display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--color-primary-subtle)', borderRadius: 'var(--radius-sm)',
            fontSize: 11, color: 'var(--color-text-accent)', fontWeight: 500,
          }}>
            {pill.field}: {pill.value}
            <X size={10} strokeWidth={2} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={pill.onRemove} />
          </span>
        ))}
        {filterPills.length > 1 && (
          <button onClick={clearAllFilters} style={{
            height: 22, padding: '0 6px', border: 'none', background: 'none',
            color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer',
          }}>Clear all</button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 26,
          padding: '0 8px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)', background: 'var(--color-surface)',
          width: 200, flexShrink: 0,
        }}>
          <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search workspaces..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--color-text)', fontSize: 11, minWidth: 0,
            }}
          />
          {searchQuery && (
            <X size={10} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0 }}
              onClick={() => setSearchQuery('')} />
          )}
        </div>

        {/* Filter button */}
        <div ref={filterRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setFilterOpen(o => !o); setDisplayOpen(false) }}
            style={{
              height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: activeFilterCount > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
              color: activeFilterCount > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500,
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!activeFilterCount) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { if (!activeFilterCount) e.currentTarget.style.background = 'var(--color-surface)' }}
          >
            <Filter size={12} strokeWidth={1.5} />
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>

          {/* Filter panel */}
          {filterOpen && (
            <div style={{
              position: 'absolute', top: 30, right: 0, zIndex: 1060,
              minWidth: 280, maxWidth: 'calc(100vw - 32px)',
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
              overflow: 'hidden',
            }}>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
                {(['status', 'agents'] as FilterTab[]).map(tab => {
                  const isActive = filterTab === tab
                  const hasFilters = tab === 'status' ? filterStatuses.size > 0 : filterAgents.size > 0
                  return (
                    <button key={tab} onClick={() => setFilterTab(tab)} style={{
                      flex: 1, height: 32, border: 'none',
                      background: isActive ? 'var(--color-surface-active)' : 'transparent',
                      color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                      fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      transition: 'all var(--duration-fast)', textTransform: 'capitalize',
                    }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-surface-active)' : 'transparent' }}
                    >
                      {tab}
                      {hasFilters && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-primary)' }} />}
                    </button>
                  )
                })}
              </div>

              {/* Tab content */}
              <div style={{ padding: 4, maxHeight: 300, overflowY: 'auto' }}>
                {filterTab === 'status' && STATUS_OPTIONS.map(opt => {
                  const checked = filterStatuses.has(opt.value)
                  const count = statusCounts[opt.value] || 0
                  return (
                    <button key={opt.value} onClick={() => {
                      setFilterStatuses(prev => {
                        const n = new Set(prev)
                        if (n.has(opt.value)) n.delete(opt.value); else n.add(opt.value)
                        return n
                      })
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
                      background: checked ? 'var(--color-primary-subtle)' : 'transparent',
                      color: 'var(--color-text)', cursor: 'pointer', fontSize: 12,
                      textAlign: 'left', transition: 'background var(--duration-fast)',
                    }}
                      onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = checked ? 'var(--color-primary-subtle)' : 'transparent' }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{opt.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{count}</span>
                    </button>
                  )
                })}
                {filterTab === 'agents' && AGENT_OPTIONS.map(opt => {
                  const checked = filterAgents.has(opt.value)
                  const count = opt.value === 'running' ? agentCounts.running : agentCounts.none
                  return (
                    <button key={opt.value} onClick={() => {
                      setFilterAgents(prev => {
                        const n = new Set(prev)
                        if (n.has(opt.value)) n.delete(opt.value); else n.add(opt.value)
                        return n
                      })
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
                      background: checked ? 'var(--color-primary-subtle)' : 'transparent',
                      color: 'var(--color-text)', cursor: 'pointer', fontSize: 12,
                      textAlign: 'left', transition: 'background var(--duration-fast)',
                    }}
                      onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = checked ? 'var(--color-primary-subtle)' : 'transparent' }}
                    >
                      <Bot size={12} strokeWidth={1.5} style={{ color: opt.value === 'running' ? 'var(--color-success)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{opt.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Display button */}
        <div ref={displayRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setDisplayOpen(o => !o); setFilterOpen(false) }}
            style={{
              height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
              color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500,
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!displayOpen) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { if (!displayOpen) e.currentTarget.style.background = displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)' }}
          >
            <SlidersHorizontal size={12} strokeWidth={1.5} />
            Display
          </button>

          {/* Display panel */}
          {displayOpen && (
            <div style={{
              position: 'absolute', top: 30, right: 0, zIndex: 1060,
              width: 240,
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
              padding: '8px',
            }}>
              {/* Sort by */}
              <div style={{ padding: '4px 6px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Sort by</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 2px 8px' }}>
                {([
                  { value: 'activity', label: 'Activity' },
                  { value: 'status', label: 'Status' },
                  { value: 'name', label: 'Name' },
                  { value: 'agents', label: 'Agents' },
                ] as { value: SortField; label: string }[]).map(opt => {
                  const isActive = sortField === opt.value
                  return (
                    <button key={opt.value} onClick={() => {
                      if (sortField === opt.value) setSortAsc(a => !a)
                      else { setSortField(opt.value); setSortAsc(false) }
                    }} style={{
                      height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'var(--color-surface-active)' : 'transparent',
                      color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                      cursor: 'pointer', fontSize: 11, fontWeight: 500,
                      transition: 'all var(--duration-fast)',
                    }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-surface-active)' : 'transparent' }}
                    >
                      {opt.label}
                      {isActive && (sortAsc ? <ArrowUp size={10} strokeWidth={2} /> : <ArrowDown size={10} strokeWidth={2} />)}
                    </button>
                  )
                })}
              </div>

              {/* Sort direction */}
              <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '8px 2px 2px' }}>
                <button onClick={() => setSortAsc(a => !a)} style={{
                  height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5,
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  transition: 'all var(--duration-fast)',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {sortAsc ? <ArrowUp size={11} strokeWidth={2} /> : <ArrowDown size={11} strokeWidth={2} />}
                  {sortAsc ? 'Ascending' : 'Descending'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16,
        }}>
          {filtered.map(ws => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              activity={mockWorkspaceActivity.filter(a => a.workspaceId === ws.id).slice(0, 4)}
              threadCount={mockWorkspaceThreads.filter(t => t.workspaceId === ws.id).length}
              runningThreads={mockWorkspaceThreads.filter(t => t.workspaceId === ws.id && t.status === 'running').length}
              onSwitch={() => onSwitchWorkspace(ws.id)}
            />
          ))}

          {/* Add workspace card */}
          <div
            onClick={onNewWorkspace}
            style={{
              minHeight: 200,
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8,
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
          >
            <Plus size={20} strokeWidth={1.5} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Add Workspace</span>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No workspaces match your filters
          </div>
        )}
      </div>
    </div>
  )
}

function WorkspaceCard({ workspace, isActive, activity, threadCount, runningThreads, onSwitch }: {
  workspace: WorkspaceInfo
  isActive: boolean
  activity: WorkspaceActivity[]
  threadCount: number
  runningThreads: number
  onSwitch: () => void
}) {
  const borderColor = workspace.status === 'active' ? 'var(--color-success)' : workspace.status === 'needs-attention' ? 'var(--color-warning)' : workspace.status === 'error' ? 'var(--color-danger)' : 'var(--color-border)'
  const statusLabel = workspace.status === 'active' ? 'Active' : workspace.status === 'needs-attention' ? 'Needs attention' : workspace.status === 'error' ? 'Error' : 'Idle'
  const statusBg = workspace.status === 'active' ? 'var(--color-success-subtle)' : workspace.status === 'needs-attention' ? 'var(--color-warning-subtle)' : workspace.status === 'error' ? 'var(--color-danger-subtle)' : 'var(--color-surface)'

  const activityIcon: Record<WorkspaceActivity['type'], { icon: typeof CheckCircle2; color: string }> = {
    'agent-completed': { icon: CheckCircle2, color: 'var(--color-success)' },
    'agent-started': { icon: Bot, color: 'var(--color-primary)' },
    'agent-error': { icon: AlertCircle, color: 'var(--color-danger)' },
    'mr-opened': { icon: GitPullRequest, color: 'var(--color-primary)' },
    'ci-passed': { icon: CircleDot, color: 'var(--color-success)' },
    'ci-failed': { icon: CircleDot, color: 'var(--color-danger)' },
  }

  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      borderRadius: 'var(--radius-md)',
      borderLeft: `3px solid ${borderColor}`,
      overflow: 'hidden',
      transition: 'box-shadow var(--duration-fast)',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-hover)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface-active)', color: 'var(--color-text-secondary)',
          fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{workspace.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{workspace.name}</span>
            {isActive && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-primary-subtle)', padding: '1px 6px', borderRadius: 'var(--radius-full)' }}>Current</span>}
          </div>
          {workspace.repo && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{workspace.repo}</div>}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          background: statusBg,
          color: borderColor,
        }}>{statusLabel}</span>
      </div>

      {/* Agent status strip */}
      {workspace.runningAgents > 0 && (
        <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Array.from({ length: Math.min(workspace.runningAgents, 3) }).map((_, i) => {
            const progress = 30 + Math.random() * 50
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bot size={10} strokeWidth={1.5} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                <div style={{ flex: 1, height: 3, background: 'var(--color-surface)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: 'var(--color-success)', borderRadius: 2, transition: 'width 1s' }} />
                </div>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{Math.round(progress)}%</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent activity */}
      <div style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        {activity.length > 0 ? activity.slice(0, 3).map(a => {
          const config = activityIcon[a.type]
          const Icon = config.icon
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 16px', fontSize: 11,
              borderBottom: '1px solid var(--color-border-subtle)',
            }}>
              <Icon size={10} strokeWidth={1.5} style={{ color: config.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</span>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{a.timestamp}</span>
            </div>
          )
        }) : (
          <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>No recent activity</div>
        )}
      </div>

      {/* Footer: stats + actions */}
      <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Bot size={10} strokeWidth={1.5} /> {workspace.agentCount} agent{workspace.agentCount !== 1 ? 's' : ''}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={10} strokeWidth={1.5} /> {threadCount} thread{threadCount !== 1 ? 's' : ''}
          </span>
          {runningThreads > 0 && <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{runningThreads} running</span>}
        </div>

        <button
          onClick={onSwitch}
          style={{
            height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
            background: isActive ? 'var(--color-surface)' : 'var(--color-primary)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            color: isActive ? 'var(--color-text-tertiary)' : 'white',
            cursor: isActive ? 'default' : 'pointer',
            fontSize: 11, fontWeight: 500,
            transition: 'all var(--duration-fast)',
            opacity: isActive ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.opacity = '1' }}
          disabled={isActive}
        >
          {isActive ? 'Current' : 'Switch'} {!isActive && <ArrowRight size={11} strokeWidth={2} />}
        </button>
      </div>
    </div>
  )
}
