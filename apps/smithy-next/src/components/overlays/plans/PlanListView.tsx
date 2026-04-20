import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Search, Filter, SlidersHorizontal, LayoutGrid, List, X, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { mockTasks, type Plan } from '../../../mock-data'
import { PlanFilterPanel } from './PlanFilterPanel'
import { PLAN_STATUS_CONFIG, PLAN_KANBAN_COLUMNS } from './plan-types'
import type { PlanActiveFilter, PlanFilterField, PlanSortField, PlanGroupField, PlanViewMode } from './plan-types'

interface PlanListViewProps {
  plans: Plan[]
  onSelectPlan: (plan: Plan) => void
}

// ── Progress helpers ──

function getPlanProgress(plan: Plan) {
  const tasks = plan.linkedTaskIds.map(id => mockTasks.find(t => t.id === id)).filter(Boolean)
  const total = tasks.length
  const done = tasks.filter(t => t!.status === 'done').length
  const inProgress = tasks.filter(t => t!.status === 'in_progress' || t!.status === 'in_review').length
  const blocked = tasks.filter(t => (t as any).blocked).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return { total, done, inProgress, blocked, pct }
}

// ── Main Component ──

export function PlanListView({ plans, onSelectPlan }: PlanListViewProps) {
  const [viewMode, setViewMode] = useState<PlanViewMode>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [filters, setFilters] = useState<PlanActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<PlanGroupField>('status')
  const [sortField, setSortField] = useState<PlanSortField>('updated')
  const [sortAsc, setSortAsc] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const filterBtnRef = useRef<HTMLDivElement>(null)
  const displayBtnRef = useRef<HTMLDivElement>(null)

  const toggleFilter = useCallback((field: PlanFilterField, value: string) => {
    setFilters(prev => {
      const exists = prev.some(f => f.field === field && f.value === value)
      if (exists) return prev.filter(f => !(f.field === field && f.value === value))
      return [...prev, { field, value }]
    })
  }, [])

  // Filter + Search + Sort
  const processed = useMemo(() => {
    let result = [...plans]

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        p.creator.toLowerCase().includes(q)
      )
    }

    // Filters
    for (const f of filters) {
      switch (f.field) {
        case 'status': result = result.filter(p => p.status === f.value); break
        case 'tag': result = result.filter(p => p.tags.includes(f.value)); break
        case 'creator': result = result.filter(p => p.creator === f.value); break
      }
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'updated': cmp = plans.indexOf(a) - plans.indexOf(b); break // mock order proxy
        case 'progress': cmp = getPlanProgress(a).pct - getPlanProgress(b).pct; break
        case 'taskCount': cmp = a.linkedTaskIds.length - b.linkedTaskIds.length; break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [plans, searchQuery, filters, sortField, sortAsc])

  // Grouping (list mode only)
  const groups = useMemo(() => {
    if (viewMode === 'kanban' || groupBy === 'none') return [{ label: 'All', plans: processed }]
    const map: Record<string, Plan[]> = {}
    for (const p of processed) {
      const key = groupBy === 'status' ? p.status : p.creator
      if (!map[key]) map[key] = []
      map[key].push(p)
    }
    // Maintain a sensible order
    if (groupBy === 'status') {
      const order: Plan['status'][] = ['active', 'draft', 'completed', 'cancelled']
      return order.filter(s => map[s]).map(s => ({
        label: PLAN_STATUS_CONFIG[s].label,
        plans: map[s],
      }))
    }
    return Object.entries(map).map(([label, plans]) => ({ label, plans }))
  }, [processed, groupBy, viewMode])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Plans</span>

        {/* Active filter pills */}
        {filters.map((f, i) => (
          <span key={i} style={{
            height: 22, padding: '0 6px 0 8px', display: 'flex', alignItems: 'center', gap: 4,
            borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)',
            color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 500,
          }}>
            {f.field}: {f.value}
            <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => toggleFilter(f.field, f.value)} />
          </span>
        ))}
        {filters.length > 0 && (
          <button onClick={() => setFilters([])} style={{
            height: 22, padding: '0 6px', border: 'none', background: 'none',
            color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11,
          }}>
            Clear all
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search (desktop) */}
        <div className="search-desktop" style={{ display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
          <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search plans..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>}
        </div>

        {/* Search (mobile) */}
        <div className="search-mobile" style={{ display: 'none' }}>
          {searchExpanded ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 180, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
              <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input ref={searchRef} autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onBlur={() => { if (!searchQuery) setSearchExpanded(false) }} placeholder="Search..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>}
            </div>
          ) : (
            <button onClick={() => setSearchExpanded(true)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
              <Search size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Filter button */}
        <div ref={filterBtnRef} style={{ position: 'relative' }}>
          <button onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
            color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <Filter size={12} strokeWidth={1.5} /> Filter {filters.length > 0 && `(${filters.length})`}
          </button>
          {filterOpen && (
            <PlanFilterPanel
              plans={plans}
              filters={filters}
              onToggleFilter={toggleFilter}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>

        {/* Display options button */}
        <div ref={displayBtnRef} style={{ position: 'relative' }}>
          <button onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
          }}>
            <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
          </button>
          {displayOpen && (
            <DisplayPanel
              groupBy={groupBy} onGroupByChange={setGroupBy}
              sortField={sortField} onSortChange={setSortField}
              sortAsc={sortAsc} onSortDirChange={() => setSortAsc(!sortAsc)}
              isKanban={viewMode === 'kanban'}
              onClose={() => setDisplayOpen(false)}
            />
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          {([
            { mode: 'list' as const, icon: List, label: 'List' },
            { mode: 'kanban' as const, icon: LayoutGrid, label: 'Board' },
          ] as const).map(({ mode, icon: Icon, label }) => (
            <button key={mode} onClick={() => setViewMode(mode)} title={`${label} view`} style={{
              width: 28, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: viewMode === mode ? 'var(--color-surface-active)' : 'transparent',
              color: viewMode === mode ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', transition: `all var(--duration-fast)`,
            }}
              onMouseEnter={e => { if (viewMode !== mode) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = viewMode === mode ? 'var(--color-surface-active)' : 'transparent' }}
            >
              <Icon size={14} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {viewMode === 'kanban' ? (
          <PlanKanbanView plans={processed} onSelectPlan={onSelectPlan} />
        ) : (
          <PlanListContent groups={groups} onSelectPlan={onSelectPlan} />
        )}
      </div>
    </div>
  )
}

// ── List Content ──

function PlanListContent({ groups, onSelectPlan }: { groups: { label: string; plans: Plan[] }[]; onSelectPlan: (p: Plan) => void }) {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {groups.map(g => (
        <div key={g.label}>
          {groups.length > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 1,
              borderBottom: '1px solid var(--color-border-subtle)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{g.label}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px', fontWeight: 500 }}>{g.plans.length}</span>
            </div>
          )}
          {g.plans.map(plan => (
            <PlanRow key={plan.id} plan={plan} onClick={() => onSelectPlan(plan)} />
          ))}
        </div>
      ))}
      {groups.every(g => g.plans.length === 0) && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          No plans match your filters
        </div>
      )}
    </div>
  )
}

function PlanRow({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  const progress = getPlanProgress(plan)
  const statusCfg = PLAN_STATUS_CONFIG[plan.status]

  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
      border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
      borderBottom: '1px solid var(--color-border-subtle)',
      transition: 'background var(--duration-fast)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Status dot */}
      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: statusCfg.color }} />

      {/* Name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {plan.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
          {plan.description}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--color-surface)', overflow: 'hidden' }}>
          <div style={{ width: `${progress.pct}%`, height: '100%', borderRadius: 2, background: progress.pct === 100 ? 'var(--color-success)' : 'var(--color-primary)', transition: 'width var(--duration-normal)' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', minWidth: 28 }}>
          {progress.pct}%
        </span>
      </div>

      {/* Task count */}
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        {progress.done}/{progress.total}
      </span>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {plan.tags.slice(0, 2).map(tag => (
          <span key={tag} style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-tertiary)',
          }}>
            {tag}
          </span>
        ))}
        {plan.tags.length > 2 && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>+{plan.tags.length - 2}</span>
        )}
      </div>

      {/* Updated */}
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
        {plan.updatedAt}
      </span>
    </button>
  )
}

// ── Kanban View ──

function PlanKanbanView({ plans, onSelectPlan }: { plans: Plan[]; onSelectPlan: (p: Plan) => void }) {
  return (
    <div style={{ display: 'flex', gap: 1, height: '100%', overflow: 'auto', background: 'var(--color-border-subtle)' }}>
      {PLAN_KANBAN_COLUMNS.map(status => {
        const columnPlans = plans.filter(p => p.status === status)
        const cfg = PLAN_STATUS_CONFIG[status]
        return (
          <div key={status} style={{ flex: '1 0 220px', minWidth: 220, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
            {/* Column header */}
            <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{cfg.label}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px', fontWeight: 500 }}>{columnPlans.length}</span>
            </div>

            {/* Cards */}
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {columnPlans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onClick={() => onSelectPlan(plan)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PlanCard({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  const progress = getPlanProgress(plan)

  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '10px 12px', border: 'none', textAlign: 'left',
      background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)',
      cursor: 'pointer', transition: 'box-shadow var(--duration-fast)',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-hover)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {plan.name}
      </div>

      {/* Description snippet */}
      <div style={{
        fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4, marginBottom: 8,
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {plan.description}
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--color-surface)', overflow: 'hidden' }}>
          <div style={{ width: `${progress.pct}%`, height: '100%', borderRadius: 2, background: progress.pct === 100 ? 'var(--color-success)' : 'var(--color-primary)', transition: 'width var(--duration-normal)' }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {progress.done}/{progress.total}
        </span>
      </div>

      {/* Tags */}
      {plan.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {plan.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)', color: 'var(--color-text-tertiary)',
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// ── Display Options Panel ──

function DisplayPanel({ groupBy, onGroupByChange, sortField, onSortChange, sortAsc, onSortDirChange, isKanban, onClose }: {
  groupBy: PlanGroupField; onGroupByChange: (g: PlanGroupField) => void
  sortField: PlanSortField; onSortChange: (s: PlanSortField) => void
  sortAsc: boolean; onSortDirChange: () => void
  isKanban: boolean; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect_clickOutside(ref, onClose)

  const groupOptions: { value: PlanGroupField; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'creator', label: 'Creator' },
    { value: 'none', label: 'No grouping' },
  ]

  const sortOptions: { value: PlanSortField; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'updated', label: 'Updated' },
    { value: 'progress', label: 'Progress' },
    { value: 'taskCount', label: 'Task count' },
  ]

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 32, right: 0, width: 240,
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 1060, padding: '8px 0',
    }}>
      {/* Group by */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Group by {isKanban && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(board uses status)</span>}
        </div>
        {groupOptions.map(opt => (
          <button key={opt.value} onClick={() => onGroupByChange(opt.value)} disabled={isKanban} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: groupBy === opt.value ? 'var(--color-surface-active)' : 'transparent',
            color: isKanban ? 'var(--color-text-tertiary)' : groupBy === opt.value ? 'var(--color-text)' : 'var(--color-text-secondary)',
            cursor: isKanban ? 'default' : 'pointer', fontSize: 12, opacity: isKanban ? 0.5 : 1,
          }}
            onMouseEnter={e => { if (!isKanban && groupBy !== opt.value) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = groupBy === opt.value ? 'var(--color-surface-active)' : 'transparent' }}
          >
            {groupBy === opt.value && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />}
            <span style={{ marginLeft: groupBy === opt.value ? 0 : 20 }}>{opt.label}</span>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />

      {/* Sort by */}
      <div style={{ padding: '8px 12px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sort by
          </span>
          <button onClick={onSortDirChange} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)',
            display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
          }}>
            {sortAsc ? <ArrowUp size={10} strokeWidth={2} /> : <ArrowDown size={10} strokeWidth={2} />}
            {sortAsc ? 'Asc' : 'Desc'}
          </button>
        </div>
        {sortOptions.map(opt => (
          <button key={opt.value} onClick={() => onSortChange(opt.value)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: sortField === opt.value ? 'var(--color-surface-active)' : 'transparent',
            color: sortField === opt.value ? 'var(--color-text)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12,
          }}
            onMouseEnter={e => { if (sortField !== opt.value) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = sortField === opt.value ? 'var(--color-surface-active)' : 'transparent' }}
          >
            {sortField === opt.value && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />}
            <span style={{ marginLeft: sortField === opt.value ? 0 : 20 }}>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Utility hook ──

function useEffect_clickOutside(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose])
}
