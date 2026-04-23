import { useState, useRef, useMemo } from 'react'
import {
  Search, Filter, SlidersHorizontal, X, Bot, Terminal, Layers, Clock, Zap,
  ArrowUpDown, ArrowDown, ArrowUp, MoreHorizontal, Copy, PowerOff, Power, Trash2, Pencil,
  Check, AlertTriangle, CircleDot, Lock, Users, ShieldCheck,
} from 'lucide-react'
import type { Workflow, WFRun, WFFilterField, WFActiveFilter, WFSortField, WFGroupField } from './wf-types'
import { WorkflowFilterPanel } from './WorkflowFilterPanel'
import { useTeamContext } from '../../../TeamContext'

interface WorkflowListViewProps {
  workflows: Workflow[]
  workflowRuns: Record<string, WFRun[]>
  onSelectWorkflow: (wf: Workflow) => void
  onCreate: () => void
}

const statusDotColor: Record<string, string> = {
  active: 'var(--color-success)', disabled: 'var(--color-text-tertiary)', error: 'var(--color-danger)', draft: 'var(--color-warning)',
}

const triggerLabels: Record<string, string> = {
  cron: 'Cron', event: 'Event', manual: 'Manual', webhook: 'Webhook',
}

const lastRunStatusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Clock,
}
const lastRunStatusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
}

function getStepTypeIcon(wf: Workflow) {
  const hasAgent = wf.steps.some(s => s.type === 'agent')
  const hasScript = wf.steps.some(s => s.type === 'script')
  if (hasAgent && hasScript) return Layers
  if (hasAgent) return Bot
  return Terminal
}

function getTriggerDisplay(wf: Workflow): string {
  if (wf.trigger.cronHumanReadable) return wf.trigger.cronHumanReadable
  if (wf.trigger.eventType) return wf.trigger.eventType.replace(/_/g, ' ')
  return triggerLabels[wf.trigger.type] || wf.trigger.type
}

export function WorkflowListView({ workflows, workflowRuns, onSelectWorkflow, onCreate }: WorkflowListViewProps) {
  const { isTeamMode } = useTeamContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [filters, setFilters] = useState<WFActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<WFGroupField>('status')
  const [sortField, setSortField] = useState<WFSortField>('lastRun')
  const [sortAsc, setSortAsc] = useState(false)
  const [scopeFilter, setScopeFilter] = useState<'all' | 'personal' | 'team'>('all')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const toggleFilter = (field: WFFilterField, value: string) => {
    setFilters(prev => {
      const exists = prev.find(f => f.field === field && f.value === value)
      if (exists) return prev.filter(f => !(f.field === field && f.value === value))
      return [...prev, { field, value }]
    })
  }

  const filtered = useMemo(() => {
    let result = workflows

    // Scope filter (team-mode only)
    if (isTeamMode && scopeFilter !== 'all') {
      result = result.filter(wf => wf.scope === scopeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(wf =>
        wf.name.toLowerCase().includes(q) ||
        (wf.description || '').toLowerCase().includes(q) ||
        wf.tags.some(t => t.toLowerCase().includes(q))
      )
    }

    for (const f of filters) {
      switch (f.field) {
        case 'status': result = result.filter(wf => wf.status === f.value); break
        case 'trigger': result = result.filter(wf => wf.trigger.type === f.value); break
        case 'tag': result = result.filter(wf => wf.tags.includes(f.value)); break
      }
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'totalRuns': cmp = a.totalRuns - b.totalRuns; break
        case 'created': cmp = a.createdAt.localeCompare(b.createdAt); break
        case 'lastRun': default: cmp = (a.lastRunAt || '').localeCompare(b.lastRunAt || ''); break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [workflows, searchQuery, filters, sortField, sortAsc, isTeamMode, scopeFilter])

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All automations', items: filtered }]
    if (groupBy === 'trigger') {
      const groups = new Map<string, Workflow[]>()
      filtered.forEach(wf => {
        const key = triggerLabels[wf.trigger.type] || wf.trigger.type
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(wf)
      })
      return Array.from(groups.entries()).map(([key, items]) => ({ key, label: key, items }))
    }
    // Default: group by status
    const active = filtered.filter(wf => wf.status === 'active')
    const errored = filtered.filter(wf => wf.status === 'error')
    const disabled = filtered.filter(wf => wf.status === 'disabled')
    const draft = filtered.filter(wf => wf.status === 'draft')
    const groups: { key: string; label: string; items: Workflow[] }[] = []
    if (active.length) groups.push({ key: 'active', label: 'Active', items: active })
    if (errored.length) groups.push({ key: 'error', label: 'Error', items: errored })
    if (disabled.length) groups.push({ key: 'disabled', label: 'Disabled', items: disabled })
    if (draft.length) groups.push({ key: 'draft', label: 'Draft', items: draft })
    return groups
  }, [filtered, groupBy])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Automations</span>

        {/* Scope filter tabs (team-mode only) */}
        {isTeamMode && (
          <div style={{ display: 'flex', gap: 1, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: 1 }}>
            {([
              { key: 'personal' as const, label: 'Personal', icon: Lock },
              { key: 'team' as const, label: 'Team', icon: Users },
              { key: 'all' as const, label: 'All', icon: null },
            ]).map(({ key, label, icon: ScopeIcon }) => (
              <button key={key} onClick={() => setScopeFilter(key)} style={{
                height: 22, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontSize: 11, fontWeight: 500,
                background: scopeFilter === key ? 'var(--color-bg-elevated)' : 'transparent',
                color: scopeFilter === key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                boxShadow: scopeFilter === key ? 'var(--shadow-sm)' : 'none',
              }}>
                {ScopeIcon && <ScopeIcon size={10} strokeWidth={1.5} />}
                {label}
              </button>
            ))}
          </div>
        )}

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

        {/* Search — desktop */}
        <div className="wf-search-container" style={{ position: 'relative' }}>
          <div className="wf-search-desktop" style={{ display: 'flex' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26,
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', padding: '0 8px',
            }}>
              <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search automations..."
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={11} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
          {/* Mobile: icon expands */}
          <div className="wf-search-mobile" style={{ display: 'none' }}>
            {searchExpanded ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, width: 180, height: 26,
                background: 'var(--color-surface)', border: '1px solid var(--color-border-focus)',
                borderRadius: 'var(--radius-sm)', padding: '0 8px',
              }}>
                <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                <input ref={searchInputRef} autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  onBlur={() => { if (!searchQuery) setSearchExpanded(false) }}
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 12, fontFamily: 'inherit' }} />
                <button onClick={() => { setSearchQuery(''); setSearchExpanded(false) }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button onClick={() => setSearchExpanded(true)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                <Search size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* Filter */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
            color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <Filter size={12} strokeWidth={1.5} /> Filter {filters.length > 0 && `(${filters.length})`}
          </button>
          {filterOpen && (
            <WorkflowFilterPanel workflows={workflows} filters={filters} onToggleFilter={toggleFilter} onClose={() => setFilterOpen(false)} />
          )}
        </div>

        {/* Display */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
            color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
          </button>
          {displayOpen && (
            <DisplayPanel groupBy={groupBy} onGroupBy={setGroupBy} sortField={sortField} onSortField={setSortField}
              sortAsc={sortAsc} onSortAsc={setSortAsc} onClose={() => setDisplayOpen(false)} />
          )}
        </div>

        {/* New automation */}
        <button onClick={onCreate} style={{
          height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          <Zap size={12} strokeWidth={2} /> New automation
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>
        {grouped.map(group => (
          <div key={group.key} style={{ marginBottom: 20 }}>
            {groupBy !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{group.label}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px' }}>{group.items.length}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map(wf => (
                <WorkflowRow key={wf.id} workflow={wf} onClick={() => onSelectWorkflow(wf)} />
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            {searchQuery || filters.length > 0 ? 'No automations match your filters' : 'No automations yet'}
          </div>
        )}
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .wf-search-desktop { display: none !important; }
          .wf-search-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .wf-search-desktop { display: flex !important; }
          .wf-search-mobile { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function WorkflowRow({ workflow: wf, onClick }: { workflow: Workflow; onClick: () => void }) {
  const { isTeamMode } = useTeamContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const TypeIcon = getStepTypeIcon(wf)
  const dotColor = statusDotColor[wf.status]

  const StatusIndicator = wf.status === 'error' ? AlertTriangle : null
  const LastRunIcon = wf.lastRunStatus ? lastRunStatusIcon[wf.lastRunStatus] : null
  const lastRunColor = wf.lastRunStatus ? lastRunStatusColor[wf.lastRunStatus] : undefined

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)',
        cursor: 'pointer', transition: `all var(--duration-fast)`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
    >
      {/* Icon + status dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <TypeIcon size={16} strokeWidth={1.5} style={{ color: wf.steps.some(s => s.type === 'agent') ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }} />
        <div style={{
          position: 'absolute', bottom: -2, right: -2, width: 7, height: 7, borderRadius: '50%',
          background: dotColor, border: '1.5px solid var(--color-bg-elevated)',
        }} />
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{wf.name}</span>
          {StatusIndicator && <StatusIndicator size={12} strokeWidth={2} style={{ color: 'var(--color-danger)' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={10} strokeWidth={1.5} /> {getTriggerDisplay(wf)}
          </span>
          <span>{wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}</span>
          {wf.linkedCIActionId && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-text-accent)' }}>
              <CircleDot size={10} strokeWidth={1.5} /> CI
            </span>
          )}
          {isTeamMode && wf.approvalRequired && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-warning)' }}>
              <ShieldCheck size={10} strokeWidth={1.5} /> Approval
            </span>
          )}
          {isTeamMode && wf.scope && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {wf.scope === 'personal' ? <Lock size={9} strokeWidth={1.5} /> : <Users size={9} strokeWidth={1.5} />}
              {wf.scope === 'personal' ? 'Personal' : 'Team'}
            </span>
          )}
          {wf.lastRunAt && <span>Last: {wf.lastRunAt}</span>}
          <span>{wf.totalRuns} run{wf.totalRuns !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Last run status */}
      {LastRunIcon && (
        <LastRunIcon size={14} strokeWidth={2} style={{ color: lastRunColor, flexShrink: 0 }} />
      )}

      {/* More menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-active)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <MoreHorizontal size={14} strokeWidth={1.5} />
        </button>
        {menuOpen && (
          <>
            <div onClick={e => { e.stopPropagation(); setMenuOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
            <div onClick={e => e.stopPropagation()} style={{
              position: 'absolute', top: 28, right: 0, zIndex: 1060, width: 180,
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4,
            }}>
              <MenuItem icon={Pencil} label="Edit" onClick={() => setMenuOpen(false)} />
              <MenuItem icon={Copy} label="Duplicate" onClick={() => setMenuOpen(false)} />
              <MenuItem icon={wf.status === 'active' ? PowerOff : Power} label={wf.status === 'active' ? 'Disable' : 'Enable'} onClick={() => setMenuOpen(false)} />
              <MenuItem icon={Trash2} label="Delete" color="var(--color-danger)" onClick={() => setMenuOpen(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, color, onClick }: { icon: typeof Check; label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
      color: color || 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, textAlign: 'left' as const,
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={12} strokeWidth={1.5} /> {label}
    </button>
  )
}

function DisplayPanel({ groupBy, onGroupBy, sortField, onSortField, sortAsc, onSortAsc, onClose }: {
  groupBy: WFGroupField; onGroupBy: (v: WFGroupField) => void
  sortField: WFSortField; onSortField: (v: WFSortField) => void
  sortAsc: boolean; onSortAsc: (v: boolean) => void
  onClose: () => void
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
      <div style={{
        position: 'absolute', top: 36, right: 0, zIndex: 1060,
        width: 220, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 8,
      }}>
        {/* Group by */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group by</div>
          {(['status', 'trigger', 'none'] as WFGroupField[]).map(g => (
            <button key={g} onClick={() => { onGroupBy(g); onClose() }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
              background: groupBy === g ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: groupBy === g ? 'var(--color-text)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
            }}>
              {g === 'none' ? 'None' : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>

        {/* Sort by */}
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort by</div>
          {([['lastRun', 'Last run'], ['name', 'Name'], ['totalRuns', 'Total runs'], ['created', 'Created']] as [WFSortField, string][]).map(([field, label]) => (
            <button key={field} onClick={() => {
              if (sortField === field) onSortAsc(!sortAsc)
              else { onSortField(field); onSortAsc(false) }
            }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px',
              background: sortField === field ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: sortField === field ? 'var(--color-text)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
            }}>
              {sortField === field
                ? (sortAsc ? <ArrowUp size={11} strokeWidth={1.5} /> : <ArrowDown size={11} strokeWidth={1.5} />)
                : <ArrowUpDown size={11} strokeWidth={1.5} style={{ opacity: 0.3 }} />
              }
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
