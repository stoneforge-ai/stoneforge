import { useState, useRef, useMemo } from 'react'
import {
  Search, Filter, SlidersHorizontal, X, Check, Clock, Loader, Ban, SkipForward,
  GitBranch, Bot, Play, ArrowUpDown, ArrowDown, ArrowUp, MoreHorizontal, FileCode, Trash2, Zap,
} from 'lucide-react'
import type { CIAction, CIRun, CIFilterField, CIActiveFilter, CISortField, CIGroupField } from './ci-types'
import { CIFilterPanel } from './CIFilterPanel'
import { CIManualTriggerDialog } from './CIManualTriggerDialog'
import { CreateActionDialog } from './CreateActionDialog'
import { useTeamContext } from '../../../TeamContext'

interface CIRunListViewProps {
  runs: CIRun[]
  actions: CIAction[]
  onSelectRun: (run: CIRun) => void
  onCreateAction?: (action: CIAction) => void
}

const statusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Loader, queued: Clock, cancelled: Ban, skipped: SkipForward,
}
const statusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
  queued: 'var(--color-text-tertiary)', cancelled: 'var(--color-text-tertiary)', skipped: 'var(--color-text-tertiary)',
}

const eventLabels: Record<string, string> = {
  push: 'push', pull_request: 'PR', schedule: 'schedule', manual: 'manual', merge_group: 'merge',
}

export function CIRunListView({ runs, actions, onSelectRun, onCreateAction }: CIRunListViewProps) {
  const [createActionOpen, setCreateActionOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [filters, setFilters] = useState<CIActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<CIGroupField>('status')
  const [sortField, setSortField] = useState<CISortField>('created')
  const [sortAsc, setSortAsc] = useState(false)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [deleteConfirmRun, setDeleteConfirmRun] = useState<CIRun | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const toggleFilter = (field: CIFilterField, value: string) => {
    setFilters(prev => {
      const exists = prev.find(f => f.field === field && f.value === value)
      if (exists) return prev.filter(f => !(f.field === field && f.value === value))
      return [...prev, { field, value }]
    })
  }

  // Filter + sort
  const filtered = useMemo(() => {
    let result = runs

    // Workflow sidebar filter
    if (selectedAction) {
      result = result.filter(r => r.action.id === selectedAction)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.action.name.toLowerCase().includes(q) ||
        r.commitMessage.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q) ||
        r.actor.toLowerCase().includes(q) ||
        `#${r.runNumber}`.includes(q)
      )
    }

    // Filters
    for (const f of filters) {
      switch (f.field) {
        case 'status': result = result.filter(r => r.status === f.value); break
        case 'event': result = result.filter(r => r.event === f.value); break
        case 'branch': result = result.filter(r => r.branch === f.value); break
        case 'actor': result = result.filter(r => r.actor === f.value); break
      }
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'runNumber': cmp = a.runNumber - b.runNumber; break
        case 'duration': cmp = (a.duration || '').localeCompare(b.duration || ''); break
        case 'created': default: cmp = b.runNumber - a.runNumber; break
      }
      return sortAsc ? -cmp : cmp
    })

    return result
  }, [runs, selectedAction, searchQuery, filters, sortField, sortAsc])

  // Group
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All runs', runs: filtered }]
    if (groupBy === 'action') {
      const groups = new Map<string, CIRun[]>()
      filtered.forEach(r => {
        const key = r.action.name
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(r)
      })
      return Array.from(groups.entries()).map(([key, runs]) => ({ key, label: key, runs }))
    }
    // Default: group by status
    const running = filtered.filter(r => r.status === 'running')
    const queued = filtered.filter(r => r.status === 'queued')
    const completed = filtered.filter(r => r.status !== 'running' && r.status !== 'queued')
    const groups: { key: string; label: string; runs: CIRun[] }[] = []
    if (running.length) groups.push({ key: 'running', label: 'Running', runs: running })
    if (queued.length) groups.push({ key: 'queued', label: 'Queued', runs: queued })
    if (completed.length) groups.push({ key: 'completed', label: 'Completed', runs: completed })
    return groups
  }, [filtered, groupBy])

  // Workflow sidebar counts
  const actionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    runs.forEach(r => counts.set(r.action.id, (counts.get(r.action.id) || 0) + 1))
    return counts
  }, [runs])

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      {/* Action sidebar */}
      <div className="ci-sidebar" style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--color-border)',
        overflow: 'auto', padding: '16px 0',
      }}>
        <div style={{ padding: '0 12px', marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Actions
          </span>
        </div>
        <SidebarItem
          label="All actions"
          count={runs.length}
          active={!selectedAction}
          onClick={() => setSelectedAction(null)}
        />
        {actions.map(wf => (
          <SidebarItem
            key={wf.id}
            label={wf.name}
            count={actionCounts.get(wf.id) || 0}
            active={selectedAction === wf.id}
            onClick={() => setSelectedAction(wf.id === selectedAction ? null : wf.id)}
          />
        ))}
      </div>

      {/* Main list */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>CI/CD</span>

          {/* Active filter pills — inline in toolbar */}
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
            <div className="ci-search-container" style={{ position: 'relative' }}>
              {/* Desktop: always-visible search bar */}
              <div className="ci-search-desktop" style={{ display: 'flex' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: 200, height: 26,
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', padding: '0 8px',
                }}>
                  <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search CI runs..."
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      <X size={11} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
              {/* Mobile: icon that expands */}
              <div className="ci-search-mobile" style={{ display: 'none' }}>
                {searchExpanded ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    width: 180, height: 26,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border-focus)',
                    borderRadius: 'var(--radius-sm)', padding: '0 8px',
                  }}>
                    <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <input
                      ref={searchInputRef}
                      autoFocus
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      onBlur={() => { if (!searchQuery) setSearchExpanded(false) }}
                      style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 12, fontFamily: 'inherit' }}
                    />
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

            {/* Filter button — labeled, matching MR list */}
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
                <CIFilterPanel runs={runs} filters={filters} onToggleFilter={toggleFilter} onClose={() => setFilterOpen(false)} />
              )}
            </div>

            {/* Display options button — labeled, matching MR list */}
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
                <DisplayPanel
                  groupBy={groupBy} onGroupBy={setGroupBy}
                  sortField={sortField} onSortField={setSortField}
                  sortAsc={sortAsc} onSortAsc={setSortAsc}
                  onClose={() => setDisplayOpen(false)}
                />
              )}
            </div>

            {onCreateAction && (
              <button onClick={() => setCreateActionOpen(true)} style={{
                height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <FileCode size={12} strokeWidth={1.5} /> New Action
              </button>
            )}

            {/* Run action */}
            <button onClick={() => setTriggerOpen(true)} style={{
              height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              <Play size={12} strokeWidth={2} /> Run action
            </button>
        </div>

        {/* Run list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>
          {grouped.map(group => (
            <div key={group.key} style={{ marginBottom: 20 }}>
              {groupBy !== 'none' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{group.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px' }}>{group.runs.length}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.runs.map(run => (
                  <RunRow key={run.id} run={run} onClick={() => onSelectRun(run)} onDeleteRun={() => setDeleteConfirmRun(run)} />
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              {searchQuery || filters.length > 0 ? 'No runs match your filters' : 'No CI runs'}
            </div>
          )}
        </div>

        {/* Responsive CSS — matching MR list pattern */}
      <style>{`
        @media (max-width: 768px) {
          .ci-search-desktop { display: none !important; }
          .ci-search-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .ci-search-desktop { display: flex !important; }
          .ci-search-mobile { display: none !important; }
        }
      `}</style>

      {/* Delete confirmation dialog */}
      {deleteConfirmRun && (
        <DeleteRunConfirmDialog
          run={deleteConfirmRun}
          onClose={() => setDeleteConfirmRun(null)}
          onConfirm={() => { console.log('Delete run', deleteConfirmRun.id); setDeleteConfirmRun(null) }}
        />
      )}

      {/* Manual trigger dialog */}
      {triggerOpen && (
        <CIManualTriggerDialog
          actions={actions}
          onClose={() => setTriggerOpen(false)}
          onTrigger={(wfId, branch, inputs) => { console.log('Trigger', wfId, branch, inputs) }}
        />
      )}

      {/* Create action dialog */}
      {createActionOpen && onCreateAction && (
        <CreateActionDialog
          onClose={() => setCreateActionOpen(false)}
          onCreate={(action) => { onCreateAction(action); setCreateActionOpen(false) }}
        />
      )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function SidebarItem({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        background: active ? 'var(--color-surface-active)' : 'transparent',
        border: 'none',
        boxShadow: active ? 'inset 2px 0 0 var(--color-primary)' : 'none',
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
        cursor: 'pointer', fontSize: 12, fontWeight: active ? 500 : 400, textAlign: 'left',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '0 5px' }}>
        {count}
      </span>
    </button>
  )
}

function RunRow({ run, onClick, onDeleteRun }: { run: CIRun; onClick: () => void; onDeleteRun: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { getUserById, isTeamMode } = useTeamContext()
  const Icon = statusIcon[run.status] || Clock
  const color = statusColor[run.status] || 'var(--color-text-tertiary)'

  const completedJobs = run.jobs.filter(j => j.status === 'success' || j.status === 'failure').length
  const totalJobs = run.jobs.length

  // Resolve actorUserId to full user for team-mode attribution
  const actorUser = run.actorUserId ? getUserById(run.actorUserId) : undefined

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
      <Icon size={16} strokeWidth={2} style={{ color, flexShrink: 0, ...(run.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{run.action.name}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>#{run.runNumber}</span>
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
            {eventLabels[run.event] || run.event}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <GitBranch size={11} strokeWidth={1.5} /> {run.branch}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{run.commit}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {run.triggeredByAgent
              ? <Bot size={10} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
              : actorUser
                ? <span style={{ position: 'relative', width: 14, height: 14, borderRadius: '50%', background: 'var(--color-surface-active)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                    {actorUser.avatar}
                    {isTeamMode && (
                      <span style={{ position: 'absolute', bottom: -1, right: -1, width: 5, height: 5, borderRadius: '50%', background: `var(--color-presence-${actorUser.presence})`, border: '1px solid var(--color-bg-elevated)' }} />
                    )}
                  </span>
                : <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--color-surface-active)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>{run.actorAvatar}</span>
            }
            {run.triggeredByAgent
              ? <>
                  {run.actor}
                  {isTeamMode && actorUser && (
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>({actorUser.name})</span>
                  )}
                </>
              : actorUser ? actorUser.name : run.actor
            }
          </span>
          <span>{run.createdAt}</span>
          {run.triggeredByWorkflowId && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-warning)' }}>
              <Zap size={10} strokeWidth={1.5} /> Workflow
            </span>
          )}
        </div>
      </div>

      {/* Right side: job progress, duration, more menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Job progress */}
        {totalJobs > 0 && run.status !== 'cancelled' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 40, height: 3, borderRadius: 1.5, background: 'var(--color-surface-active)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 1.5,
                width: `${(completedJobs / totalJobs) * 100}%`,
                background: run.status === 'failure' ? 'var(--color-danger)' : 'var(--color-success)',
              }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {completedJobs}/{totalJobs}
            </span>
          </div>
        )}

        {run.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{run.duration}</span>}

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
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', top: 28, right: 0, zIndex: 1060, width: 180, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4 }}
            >
              <button onClick={() => setMenuOpen(false)} style={menuItemStyle}>
                <FileCode size={12} strokeWidth={1.5} /> View action file
              </button>
              <button onClick={() => { setMenuOpen(false); onDeleteRun() }} style={{ ...menuItemStyle, color: 'var(--color-danger)' }}>
                <Trash2 size={12} strokeWidth={1.5} /> Delete run
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeleteRunConfirmDialog({ run, onClose, onConfirm }: { run: CIRun; onClose: () => void; onConfirm: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 400, maxWidth: '90vw',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, padding: '20px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
          Delete run?
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          Are you sure you want to delete <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{run.action.name} #{run.runNumber}</span>? This action cannot be undone.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            height: 32, padding: '0 14px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            height: 32, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 5,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-danger)', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            <Trash2 size={12} strokeWidth={1.5} /> Delete
          </button>
        </div>
      </div>
    </>
  )
}

function DisplayPanel({ groupBy, onGroupBy, sortField, onSortField, sortAsc, onSortAsc, onClose }: {
  groupBy: CIGroupField; onGroupBy: (v: CIGroupField) => void
  sortField: CISortField; onSortField: (v: CISortField) => void
  sortAsc: boolean; onSortAsc: (v: boolean) => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: 'absolute', top: 36, right: 0, zIndex: 1060,
      width: 220, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 8,
    }}>
      {/* Group by */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group by</div>
        {(['status', 'action', 'none'] as CIGroupField[]).map(g => (
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
        {([['created', 'Created'], ['runNumber', 'Run number'], ['duration', 'Duration']] as [CISortField, string][]).map(([field, label]) => (
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
  )
}


const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
  background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, textAlign: 'left' as const,
}

