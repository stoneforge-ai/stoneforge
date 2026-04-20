import { useState, useRef, useEffect, useMemo } from 'react'
import { GitMerge, Check, X, Clock, ChevronRight, Plus, Minus, Bot, Search, Filter, SlidersHorizontal, ArrowUpDown, ArrowDown, ArrowUp, GitPullRequest } from 'lucide-react'
import type { MergeRequestExtended, ReviewState } from './mr-types'
import { CreateMRDialog } from './CreateMRDialog'

// ── Filter types ──
type MRFilterField = 'status' | 'author' | 'label' | 'ciStatus' | 'steward'
interface MRActiveFilter { field: MRFilterField; value: string }

type MRSortField = 'created' | 'title' | 'additions' | 'filesChanged'
type MRGroupField = 'status' | 'author' | 'none'

interface MRListViewProps {
  mergeRequests: MergeRequestExtended[]
  onSelectMR: (mr: MergeRequestExtended) => void
  onCreateMR?: (mr: Partial<MergeRequestExtended>) => void
}

export function MRListView({ mergeRequests, onSelectMR, onCreateMR }: MRListViewProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [filters, setFilters] = useState<MRActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<MRGroupField>('status')
  const [sortField, setSortField] = useState<MRSortField>('created')
  const [sortAsc, setSortAsc] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Apply filters
  const filtered = useMemo(() => {
    let result = mergeRequests

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(mr =>
        mr.title.toLowerCase().includes(q) ||
        mr.branch.toLowerCase().includes(q) ||
        mr.id.toLowerCase().includes(q) ||
        mr.author.toLowerCase().includes(q) ||
        mr.labels.some(l => l.toLowerCase().includes(q))
      )
    }

    // Filters
    for (const f of filters) {
      switch (f.field) {
        case 'status':
          if (f.value === 'draft') result = result.filter(mr => mr.isDraft)
          else result = result.filter(mr => mr.status === f.value && !mr.isDraft)
          break
        case 'author':
          result = result.filter(mr => mr.author === f.value)
          break
        case 'label':
          result = result.filter(mr => mr.labels.includes(f.value))
          break
        case 'ciStatus':
          result = result.filter(mr => mr.ciStatus === f.value)
          break
        case 'steward':
          result = result.filter(mr => mr.reviewAgentStatus === f.value)
          break
      }
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'created': cmp = 0; break // keep original order (already sorted by time)
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'additions': cmp = (a.additions + a.deletions) - (b.additions + b.deletions); break
        case 'filesChanged': cmp = a.filesChanged - b.filesChanged; break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [mergeRequests, searchQuery, filters, sortField, sortAsc])

  // Group results
  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ title: 'All', dotColor: 'var(--color-text-tertiary)', items: filtered }]
    }
    if (groupBy === 'author') {
      const byAuthor = new Map<string, MergeRequestExtended[]>()
      filtered.forEach(mr => {
        if (!byAuthor.has(mr.author)) byAuthor.set(mr.author, [])
        byAuthor.get(mr.author)!.push(mr)
      })
      return [...byAuthor.entries()].map(([author, items]) => ({
        title: author, dotColor: 'var(--color-text-secondary)', items,
      }))
    }
    // Default: group by status
    const draft = filtered.filter(mr => mr.isDraft && mr.status === 'open')
    const open = filtered.filter(mr => !mr.isDraft && mr.status === 'open')
    const merged = filtered.filter(mr => mr.status === 'merged')
    const closed = filtered.filter(mr => mr.status === 'closed')
    const groups = []
    if (draft.length) groups.push({ title: 'Draft', dotColor: 'var(--color-warning)', items: draft })
    if (open.length) groups.push({ title: 'Open', dotColor: 'var(--color-success)', items: open })
    if (merged.length) groups.push({ title: 'Merged', dotColor: 'var(--color-primary)', items: merged })
    if (closed.length) groups.push({ title: 'Closed', dotColor: 'var(--color-danger)', items: closed })
    return groups
  }, [filtered, groupBy])

  const toggleFilter = (field: MRFilterField, value: string) => {
    setFilters(prev => {
      const exists = prev.findIndex(f => f.field === field && f.value === value)
      if (exists >= 0) return [...prev.slice(0, exists), ...prev.slice(exists + 1)]
      return [...prev, { field, value }]
    })
  }

  const removeFilter = (idx: number) => setFilters(prev => [...prev.slice(0, idx), ...prev.slice(idx + 1)])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Merge Requests</span>

        {/* Active filter pills — inline */}
        {filters.map((f, i) => (
          <span key={i} style={{ height: 22, padding: '0 6px 0 8px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 500 }}>
            {f.field}: {f.value}
            <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => removeFilter(i)} />
          </span>
        ))}
        {filters.length > 0 && (
          <button onClick={() => setFilters([])} style={{ height: 22, padding: '0 6px', border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>Clear all</button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search — full bar on desktop, icon on mobile */}
        <div className="mr-search-container" style={{ position: 'relative' }}>
          <div className="mr-search-desktop" style={{ display: 'flex' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
              <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search merge requests..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>}
            </div>
          </div>
          <div className="mr-search-mobile" style={{ display: 'none' }}>
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
          <button onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }} style={{ height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)', background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)', color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
            <Filter size={12} strokeWidth={1.5} /> Filter {filters.length > 0 && `(${filters.length})`}
          </button>
          {filterOpen && <MRFilterPanel mergeRequests={mergeRequests} filters={filters} onToggleFilter={toggleFilter} onClear={() => setFilters([])} onClose={() => setFilterOpen(false)} />}
        </div>

        {/* Display options */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }} style={{ height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)', background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)', color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
            <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
          </button>
          {displayOpen && <MRDisplayPanel groupBy={groupBy} onGroupByChange={setGroupBy} sortField={sortField} onSortChange={setSortField} sortAsc={sortAsc} onSortDirChange={() => setSortAsc(!sortAsc)} onClose={() => setDisplayOpen(false)} />}
        </div>

        {onCreateMR && (
          <button onClick={() => setCreateOpen(true)} style={{
            height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            <GitPullRequest size={12} strokeWidth={2} /> New MR
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>

      {/* Grouped MR list */}
      {groups.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          No merge requests match your filters
        </div>
      )}
      {groups.map(group => (
        <Section key={group.title} title={group.title} count={group.items.length} dotColor={group.dotColor}>
          {group.items.map(mr => <MRRow key={mr.id} mr={mr} onClick={() => onSelectMR(mr)} searchQuery={searchQuery} />)}
        </Section>
      ))}

      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .mr-search-desktop { display: none !important; }
          .mr-search-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mr-search-desktop { display: flex !important; }
          .mr-search-mobile { display: none !important; }
        }
      `}</style>

      {createOpen && onCreateMR && (
        <CreateMRDialog
          onClose={() => setCreateOpen(false)}
          onCreate={(partial) => { onCreateMR(partial); setCreateOpen(false) }}
        />
      )}
    </div>
  )
}

// ── Section ──
function Section({ title, count, dotColor, children }: { title: string; count: number; dotColor: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px' }}>{count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

// ── Filter Panel ──
function MRFilterPanel({ mergeRequests, filters, onToggleFilter, onClear, onClose }: {
  mergeRequests: MergeRequestExtended[]; filters: MRActiveFilter[]
  onToggleFilter: (field: MRFilterField, value: string) => void; onClear: () => void; onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<MRFilterField>('status')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const getItems = (): { value: string; label: string; count: number; isActive: boolean }[] => {
    switch (activeTab) {
      case 'status':
        return [
          { value: 'draft', label: 'Draft', count: mergeRequests.filter(m => m.isDraft).length, isActive: filters.some(f => f.field === 'status' && f.value === 'draft') },
          { value: 'open', label: 'Open', count: mergeRequests.filter(m => m.status === 'open' && !m.isDraft).length, isActive: filters.some(f => f.field === 'status' && f.value === 'open') },
          { value: 'merged', label: 'Merged', count: mergeRequests.filter(m => m.status === 'merged').length, isActive: filters.some(f => f.field === 'status' && f.value === 'merged') },
        ]
      case 'author': {
        const authors = new Map<string, number>()
        mergeRequests.forEach(m => authors.set(m.author, (authors.get(m.author) || 0) + 1))
        return [...authors.entries()].map(([a, c]) => ({ value: a, label: a, count: c, isActive: filters.some(f => f.field === 'author' && f.value === a) }))
      }
      case 'label': {
        const labels = new Map<string, number>()
        mergeRequests.forEach(m => m.labels.forEach(l => labels.set(l, (labels.get(l) || 0) + 1)))
        return [...labels.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => ({ value: l, label: l, count: c, isActive: filters.some(f => f.field === 'label' && f.value === l) }))
      }
      case 'ciStatus':
        return ['pass', 'fail', 'pending'].map(s => ({
          value: s, label: s === 'pass' ? 'Passing' : s === 'fail' ? 'Failing' : 'Pending',
          count: mergeRequests.filter(m => m.ciStatus === s).length,
          isActive: filters.some(f => f.field === 'ciStatus' && f.value === s),
        }))
      case 'steward':
        return ['approved', 'changes_requested', 'pending', 'reviewing'].map(s => ({
          value: s, label: s === 'changes_requested' ? 'Changes requested' : s.charAt(0).toUpperCase() + s.slice(1),
          count: mergeRequests.filter(m => m.reviewAgentStatus === s).length,
          isActive: filters.some(f => f.field === 'steward' && f.value === s),
        })).filter(i => i.count > 0)
      default: return []
    }
  }

  const tabs: { field: MRFilterField; label: string }[] = [
    { field: 'status', label: 'Status' },
    { field: 'author', label: 'Author' },
    { field: 'label', label: 'Labels' },
    { field: 'ciStatus', label: 'CI' },
    { field: 'steward', label: 'Reviewer' },
  ]

  return (
    <div ref={ref} style={{ position: 'absolute', top: 32, right: 0, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', minWidth: 280, maxWidth: 'calc(100vw - 32px)', boxShadow: 'var(--shadow-float)', zIndex: 1060 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 12px', gap: 8 }}>
        {filters.length > 0 && <button onClick={onClear} style={{ border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}>Clear</button>}
      </div>
      <div style={{ display: 'flex', gap: 2, padding: '0 8px 8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map(tab => {
          const tabCount = filters.filter(f => f.field === tab.field).length
          return (
            <button key={tab.field} onClick={() => setActiveTab(tab.field)} style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 'var(--radius-sm)',
              background: activeTab === tab.field ? 'var(--color-surface-active)' : 'transparent',
              color: activeTab === tab.field ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              {tab.label}
              {tabCount > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />}
            </button>
          )
        })}
      </div>
      <div style={{ padding: 4, maxHeight: 300, overflow: 'auto' }}>
        {getItems().map(item => (
          <button key={item.value} onClick={() => onToggleFilter(activeTab, item.value)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: item.isActive ? 'var(--color-primary-subtle)' : 'transparent',
            color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12,
          }}
            onMouseEnter={e => { if (!item.isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = item.isActive ? 'var(--color-primary-subtle)' : 'transparent' }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.isActive ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Display Options Panel ──
function MRDisplayPanel({ groupBy, onGroupByChange, sortField, onSortChange, sortAsc, onSortDirChange, onClose }: {
  groupBy: MRGroupField; onGroupByChange: (v: MRGroupField) => void
  sortField: MRSortField; onSortChange: (v: MRSortField) => void; sortAsc: boolean; onSortDirChange: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const groupOptions: { value: MRGroupField; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'author', label: 'Author' },
    { value: 'none', label: 'No grouping' },
  ]
  const sortOptions: { value: MRSortField; label: string }[] = [
    { value: 'created', label: 'Date created' },
    { value: 'title', label: 'Title' },
    { value: 'additions', label: 'Changes (+/-)' },
    { value: 'filesChanged', label: 'Files changed' },
  ]

  return (
    <div ref={ref} style={{ position: 'absolute', top: 32, right: 0, width: 240, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 1060, padding: '8px 0' }}>
      {/* Group by */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Group by</div>
        {groupOptions.map(opt => (
          <button key={opt.value} onClick={() => onGroupByChange(opt.value)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: groupBy === opt.value ? 'var(--color-surface-active)' : 'transparent',
            color: groupBy === opt.value ? 'var(--color-text)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12,
          }}
            onMouseEnter={e => { if (groupBy !== opt.value) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
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
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort by</span>
          <button onClick={onSortDirChange} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
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

// ── MR Row ──
const reviewStateBorderColor: Record<ReviewState, string> = {
  approved: 'var(--color-success)',
  changes_requested: 'var(--color-danger)',
  commented: 'var(--color-text-tertiary)',
  pending: 'var(--color-border)',
}

function MRRow({ mr, onClick, searchQuery }: { mr: MergeRequestExtended; onClick: () => void; searchQuery?: string }) {
  const ciColor = mr.ciStatus === 'pass' ? 'var(--color-success)' : mr.ciStatus === 'fail' ? 'var(--color-danger)' : 'var(--color-warning)'
  const CIIcon = mr.ciStatus === 'pass' ? Check : mr.ciStatus === 'fail' ? X : Clock
  const statusColor = mr.status === 'merged' ? 'var(--color-primary)' : 'var(--color-text-secondary)'

  const stewardDotColor = !mr.reviewAgentStatus ? undefined
    : mr.reviewAgentStatus === 'approved' ? 'var(--color-success)'
    : mr.reviewAgentStatus === 'changes_requested' ? 'var(--color-danger)'
    : mr.reviewAgentStatus === 'reviewing' ? 'var(--color-warning)'
    : 'var(--color-text-tertiary)'

  // Highlight search matches in title
  const highlightMatch = (text: string) => {
    if (!searchQuery?.trim()) return text
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ background: 'rgba(59,130,246,0.2)', borderRadius: 2, padding: '0 1px' }}>{text.slice(idx, idx + searchQuery.length)}</span>
        {text.slice(idx + searchQuery.length)}
      </>
    )
  }

  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)', cursor: 'pointer', transition: `all var(--duration-fast)` }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}>
      <GitMerge size={16} strokeWidth={1.5} style={{ color: statusColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)' }}>
          {mr.isDraft && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'rgba(245,158,11,0.1)', color: 'var(--color-warning)' }}>Draft</span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlightMatch(mr.title)}</span>
          <CIIcon size={13} strokeWidth={2} style={{ color: ciColor, flexShrink: 0 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          <span>{mr.id}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{mr.branch}</span>
          <span>by {mr.author}</span>
          <span>{mr.createdAt}</span>
        </div>
      </div>

      {/* Reviewer avatars */}
      {mr.reviewers.length > 0 && (
        <div style={{ display: 'flex', gap: -4, flexShrink: 0 }}>
          {mr.reviewers.slice(0, 3).map((r, i) => (
            <div key={r.name} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-surface-active)', border: `2px solid ${reviewStateBorderColor[r.state]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: 'var(--color-text-secondary)', marginLeft: i > 0 ? -4 : 0 }}>{r.avatar}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <Plus size={11} strokeWidth={2} style={{ color: 'var(--color-success)' }} /><span style={{ color: 'var(--color-success)' }}>{mr.additions}</span>
          <Minus size={11} strokeWidth={2} style={{ color: 'var(--color-danger)', marginLeft: 4 }} /><span style={{ color: 'var(--color-danger)' }}>{mr.deletions}</span>
        </div>
        {stewardDotColor && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} title={`Review Agent: ${mr.reviewAgentStatus}`}>
            <Bot size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
            <span style={{ position: 'absolute', bottom: -1, right: -1, width: 6, height: 6, borderRadius: '50%', background: stewardDotColor, border: '1px solid var(--color-bg-elevated)' }} />
          </div>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{mr.filesChanged} files</span>
        <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
      </div>
    </div>
  )
}
