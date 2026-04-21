import { useState, useMemo } from 'react'
import { Search, SlidersHorizontal, Filter, X, ChevronRight, FileText, FileCode, FileType, Link2, Plus, Check } from 'lucide-react'
import type { Document, Library, DocSortField } from './doc-types'

interface DocListViewProps {
  documents: Document[]
  libraries: Library[]
  selectedDocId: string | null
  selectedLibraryId: string | null
  onSelectDoc: (doc: Document) => void
  onCreateDoc: () => void
  /** When true, show a library filter in the toolbar (narrow mode, no tree sidebar) */
  showLibraryFilter?: boolean
  onLibraryChange?: (libraryId: string | null) => void
}

// ── Constants ──

const categoryLabels: Record<string, string> = {
  spec: 'Spec', prd: 'PRD', 'decision-log': 'ADR', changelog: 'Changelog',
  tutorial: 'Tutorial', 'how-to': 'How-to', explanation: 'Explanation',
  reference: 'Reference', runbook: 'Runbook', 'meeting-notes': 'Meeting Notes',
  'post-mortem': 'Post-mortem', other: 'Other',
}

const categoryColors: Record<string, string> = {
  spec: 'var(--color-primary)', prd: '#a78bfa', 'decision-log': '#f59e0b',
  changelog: 'var(--color-success)', tutorial: '#06b6d4', 'how-to': '#06b6d4',
  explanation: '#8b5cf6', reference: 'var(--color-text-secondary)', runbook: '#ef4444',
  'meeting-notes': '#6b7280', 'post-mortem': '#ef4444', other: 'var(--color-text-tertiary)',
}

const categoryDotColors: Record<string, string> = {
  spec: '#3b82f6', prd: '#a78bfa', 'decision-log': '#f59e0b',
  changelog: '#22c55e', tutorial: '#06b6d4', 'how-to': '#06b6d4',
  explanation: '#8b5cf6', reference: '#6b7280', runbook: '#ef4444',
  'meeting-notes': '#6b7280', 'post-mortem': '#ef4444', other: '#6b7280',
}

function timeAgo(dateStr: string): string {
  const now = new Date('2026-04-13')
  const then = new Date(dateStr)
  const days = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function DocIcon({ contentType, size = 16 }: { contentType: string; size?: number }) {
  const color = 'var(--color-text-tertiary)'
  if (contentType === 'json') return <FileCode size={size} color={color} strokeWidth={1.5} />
  if (contentType === 'text') return <FileType size={size} color={color} strokeWidth={1.5} />
  return <FileText size={size} color={color} strokeWidth={1.5} />
}

// ── Filter types ──

type FilterField = 'category' | 'contentType' | 'library' | 'status'
interface ActiveFilter { field: FilterField; value: string; label: string }

type GroupField = 'library' | 'category' | 'status' | 'none'

// ── Document Row ──

function DocRow({ doc, libraries, isSelected, onSelect, searchQuery }: {
  doc: Document; libraries: Library[]; isSelected: boolean; onSelect: () => void; searchQuery: string
}) {
  const library = doc.libraryId ? libraries.find(l => l.id === doc.libraryId) : null
  const parentLib = library?.parentId ? libraries.find(l => l.id === library.parentId) : null
  const libPath = parentLib ? `${parentLib.name} / ${library!.name}` : library?.name || null
  const linkCount = doc.linkedDocIds.length + doc.linkedTaskIds.length + doc.linkedMRIds.length

  // Highlight search match in title
  const renderTitle = () => {
    if (!searchQuery) return doc.title
    const idx = doc.title.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx === -1) return doc.title
    return (
      <>
        {doc.title.slice(0, idx)}
        <span style={{ background: 'var(--color-warning-subtle)', color: 'var(--color-warning)', borderRadius: 2, padding: '0 1px' }}>
          {doc.title.slice(idx, idx + searchQuery.length)}
        </span>
        {doc.title.slice(idx + searchQuery.length)}
      </>
    )
  }

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderRadius: 'var(--radius-md)', cursor: 'pointer',
        background: isSelected ? 'var(--color-primary-subtle)' : 'var(--color-bg-elevated)',
        transition: `all var(--duration-fast)`,
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-elevated)' }}
    >
      {/* Icon */}
      <DocIcon contentType={doc.contentType} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {renderTitle()}
          </span>
          {doc.status === 'archived' && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>Archived</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {libPath && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{libPath}</span>
          )}
          {libPath && <span>·</span>}
          <span>v{doc.version}</span>
          {linkCount > 0 && (
            <>
              <span>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Link2 size={10} strokeWidth={1.5} /> {linkCount}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Category badge */}
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
          background: `${categoryColors[doc.category]}15`,
          color: categoryColors[doc.category] || 'var(--color-text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap',
        }}>
          {categoryLabels[doc.category] || doc.category}
        </span>

        {/* Tags (first 2) */}
        {doc.tags.slice(0, 2).map(tag => (
          <span key={tag} style={{
            fontSize: 10, padding: '2px 5px', borderRadius: 'var(--radius-full)',
            background: 'var(--color-surface)', color: 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap',
          }} className="list-col-labels">
            {tag}
          </span>
        ))}

        {/* Author initial */}
        <div style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-surface-active)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 600, color: 'var(--color-text-secondary)',
        }}>
          {doc.createdBy.charAt(0).toUpperCase()}
        </div>

        {/* Time */}
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', minWidth: 50, textAlign: 'right' }}>
          {timeAgo(doc.updatedAt)}
        </span>

        <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
      </div>
    </div>
  )
}

// ── Group Header ──

function GroupHeader({ title, count, dotColor }: { title: string; count: number; dotColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{title}</span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '1px 6px' }}>{count}</span>
    </div>
  )
}

// ── Filter Panel ──

function FilterPanel({ filters, onAddFilter, onClose, libraries }: {
  filters: ActiveFilter[]; onAddFilter: (f: ActiveFilter) => void; onClose: () => void; libraries: Library[]
}) {
  const [tab, setTab] = useState<FilterField>('category')

  const tabs: { key: FilterField; label: string }[] = [
    { key: 'category', label: 'Category' },
    { key: 'contentType', label: 'Type' },
    { key: 'library', label: 'Library' },
    { key: 'status', label: 'Status' },
  ]

  const items: { value: string; label: string }[] = (() => {
    switch (tab) {
      case 'category': return Object.entries(categoryLabels).map(([v, l]) => ({ value: v, label: l }))
      case 'contentType': return [{ value: 'markdown', label: 'Markdown' }, { value: 'text', label: 'Text' }, { value: 'json', label: 'JSON' }]
      case 'library': return [{ value: '__none__', label: 'No library' }, ...libraries.filter(l => l.parentId === null).map(l => ({ value: l.id, label: l.name }))]
      case 'status': return [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]
      default: return []
    }
  })()

  const activeValues = new Set(filters.filter(f => f.field === tab).map(f => f.value))

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' as any }} onClick={onClose} />
      <div style={{
        position: 'absolute', top: 32, right: 0, zIndex: 'var(--z-dropdown)' as any,
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        width: 260, overflow: 'hidden',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '6px 6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '4px 0 6px', border: 'none', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                background: tab === t.key ? 'var(--color-surface-active)' : 'transparent',
                color: tab === t.key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Items */}
        <div style={{ maxHeight: 240, overflow: 'auto', padding: 4 }}>
          {items.map(item => {
            const isActive = activeValues.has(item.value)
            return (
              <button
                key={item.value}
                onClick={() => {
                  if (!isActive) onAddFilter({ field: tab, value: item.value, label: item.label })
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '5px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                  background: isActive ? 'var(--color-primary-subtle)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                  fontSize: 12, cursor: isActive ? 'default' : 'pointer', textAlign: 'left',
                  fontFamily: 'var(--font-sans)', opacity: isActive ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isActive ? 'var(--color-primary-subtle)' : 'transparent' }}
              >
                {tab === 'category' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: categoryDotColors[item.value] || '#6b7280', flexShrink: 0 }} />
                )}
                <span style={{ flex: 1 }}>{item.label}</span>
                {isActive && <Check size={12} strokeWidth={2} />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Display Panel ──

function DisplayPanel({ groupBy, sortBy, sortAsc, onGroupChange, onSortChange, onSortDirChange, onClose }: {
  groupBy: GroupField; sortBy: DocSortField; sortAsc: boolean
  onGroupChange: (g: GroupField) => void; onSortChange: (s: DocSortField) => void; onSortDirChange: (a: boolean) => void; onClose: () => void
}) {
  const groupOptions: { value: GroupField; label: string }[] = [
    { value: 'none', label: 'No grouping' },
    { value: 'library', label: 'Library' },
    { value: 'category', label: 'Category' },
    { value: 'status', label: 'Status' },
  ]
  const sortOptions: { value: DocSortField; label: string }[] = [
    { value: 'updatedAt', label: 'Last updated' },
    { value: 'createdAt', label: 'Created' },
    { value: 'title', label: 'Title' },
  ]

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' as any }} onClick={onClose} />
      <div style={{
        position: 'absolute', top: 32, right: 0, zIndex: 'var(--z-dropdown)' as any,
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        width: 200, overflow: 'hidden',
      }}>
        {/* Group by */}
        <div style={{ padding: '8px 8px 4px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px 4px' }}>Group by</div>
          {groupOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onGroupChange(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '4px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: groupBy === opt.value ? 'var(--color-primary-subtle)' : 'transparent',
                color: groupBy === opt.value ? 'var(--color-primary)' : 'var(--color-text)',
                fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => { if (groupBy !== opt.value) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = groupBy === opt.value ? 'var(--color-primary-subtle)' : 'transparent'}
            >
              <span style={{ flex: 1 }}>{opt.label}</span>
              {groupBy === opt.value && <Check size={12} strokeWidth={2} />}
            </button>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '0 8px' }} />
        {/* Sort by */}
        <div style={{ padding: '4px 8px 8px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 4px' }}>Sort by</div>
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                if (sortBy === opt.value) onSortDirChange(!sortAsc)
                else onSortChange(opt.value)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '4px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: sortBy === opt.value ? 'var(--color-primary-subtle)' : 'transparent',
                color: sortBy === opt.value ? 'var(--color-primary)' : 'var(--color-text)',
                fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => { if (sortBy !== opt.value) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = sortBy === opt.value ? 'var(--color-primary-subtle)' : 'transparent'}
            >
              <span style={{ flex: 1 }}>{opt.label}</span>
              {sortBy === opt.value && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{sortAsc ? '↑' : '↓'}</span>}
              {sortBy === opt.value && <Check size={12} strokeWidth={2} />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Main List View ──

export function DocListView({ documents, libraries, selectedDocId, selectedLibraryId, onSelectDoc, onCreateDoc, showLibraryFilter: _showLibraryFilter, onLibraryChange }: DocListViewProps) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupField>('none')
  const [sortBy, setSortBy] = useState<DocSortField>('updatedAt')
  const [sortAsc, setSortAsc] = useState(false)

  // Collect all descendant library IDs
  const getDescendantLibIds = (libId: string): string[] => {
    const children = libraries.filter(l => l.parentId === libId)
    return [libId, ...children.flatMap(c => getDescendantLibIds(c.id))]
  }

  // Filter & sort
  const filteredDocs = useMemo(() => {
    let docs = [...documents]

    // Library scope (from tree sidebar selection)
    if (selectedLibraryId) {
      const libIds = new Set(getDescendantLibIds(selectedLibraryId))
      docs = docs.filter(d => d.libraryId && libIds.has(d.libraryId))
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q)) ||
        d.content.toLowerCase().includes(q)
      )
    }

    // Active filters
    for (const f of filters) {
      if (f.field === 'category') docs = docs.filter(d => d.category === f.value)
      if (f.field === 'contentType') docs = docs.filter(d => d.contentType === f.value)
      if (f.field === 'status') docs = docs.filter(d => d.status === f.value)
      if (f.field === 'library') {
        if (f.value === '__none__') docs = docs.filter(d => !d.libraryId)
        else {
          const libIds = new Set(getDescendantLibIds(f.value))
          docs = docs.filter(d => d.libraryId && libIds.has(d.libraryId))
        }
      }
    }

    // Sort
    docs.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'title') cmp = a.title.localeCompare(b.title)
      else if (sortBy === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt)
      else cmp = a.updatedAt.localeCompare(b.updatedAt)
      return sortAsc ? cmp : -cmp
    })

    return docs
  }, [documents, selectedLibraryId, search, filters, sortBy, sortAsc, libraries])

  // Group docs
  const groupedDocs = useMemo(() => {
    if (groupBy === 'none') return [{ key: '__all__', title: '', docs: filteredDocs, dotColor: '' }]

    const groups = new Map<string, { key: string; title: string; docs: Document[]; dotColor: string }>()

    for (const doc of filteredDocs) {
      let key: string, title: string, dotColor: string
      if (groupBy === 'library') {
        if (!doc.libraryId) { key = '__none__'; title = 'No Library'; dotColor = '#6b7280' }
        else {
          key = doc.libraryId
          const lib = libraries.find(l => l.id === doc.libraryId)
          title = lib?.name || doc.libraryId
          dotColor = '#f59e0b'
        }
      } else if (groupBy === 'category') {
        key = doc.category
        title = categoryLabels[doc.category] || doc.category
        dotColor = categoryDotColors[doc.category] || '#6b7280'
      } else {
        key = doc.status
        title = doc.status === 'active' ? 'Active' : 'Archived'
        dotColor = doc.status === 'active' ? '#22c55e' : '#6b7280'
      }

      if (!groups.has(key)) groups.set(key, { key, title, docs: [], dotColor })
      groups.get(key)!.docs.push(doc)
    }

    return Array.from(groups.values())
  }, [filteredDocs, groupBy, libraries])

  const addFilter = (f: ActiveFilter) => {
    // Don't add duplicate
    if (filters.some(ef => ef.field === f.field && ef.value === f.value)) return
    setFilters(prev => [...prev, f])
  }
  const removeFilter = (index: number) => setFilters(prev => prev.filter((_, i) => i !== index))

  const selectedLibName = selectedLibraryId ? libraries.find(l => l.id === selectedLibraryId)?.name : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg)' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          Documents
        </span>

        {/* Library scope indicator (from tree) */}
        {selectedLibName && (
          <span style={{
            height: 22, padding: '0 6px 0 8px', display: 'flex', alignItems: 'center', gap: 4,
            borderRadius: 'var(--radius-sm)', background: 'var(--color-warning-subtle)',
            color: 'var(--color-warning)', fontSize: 11, fontWeight: 500,
          }}>
            {selectedLibName}
            {onLibraryChange && (
              <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => onLibraryChange(null)} />
            )}
          </span>
        )}

        {/* Active filter pills */}
        {filters.map((f, i) => (
          <span key={`${f.field}-${f.value}`} style={{
            height: 22, padding: '0 6px 0 8px', display: 'flex', alignItems: 'center', gap: 4,
            borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)',
            color: 'var(--color-text-accent)', fontSize: 11, fontWeight: 500,
          }}>
            {f.label}
            <X size={11} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => removeFilter(i)} />
          </span>
        ))}

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', padding: '0 8px',
        }}>
          <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input
            placeholder="Search documents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit',
            }}
          />
          {search && (
            <X size={11} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0 }} onClick={() => setSearch('')} />
          )}
        </div>

        {/* Filter */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }}
            style={{
              height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: filters.length > 0 ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
              color: filters.length > 0 ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)',
            }}
          >
            <Filter size={12} strokeWidth={1.5} />
            Filter{filters.length > 0 && ` (${filters.length})`}
          </button>
          {filterOpen && (
            <FilterPanel
              filters={filters}
              onAddFilter={(f) => { addFilter(f); setFilterOpen(false) }}
              onClose={() => setFilterOpen(false)}
              libraries={libraries}
            />
          )}
        </div>

        {/* Display */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }}
            style={{
              height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
              color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)',
            }}
          >
            <SlidersHorizontal size={12} strokeWidth={1.5} />
            Display
          </button>
          {displayOpen && (
            <DisplayPanel
              groupBy={groupBy} sortBy={sortBy} sortAsc={sortAsc}
              onGroupChange={g => { setGroupBy(g); setDisplayOpen(false) }}
              onSortChange={s => { setSortBy(s); setSortAsc(false) }}
              onSortDirChange={setSortAsc}
              onClose={() => setDisplayOpen(false)}
            />
          )}
        </div>

        {/* New button */}
        <button
          onClick={onCreateDoc}
          style={{
            height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)', color: 'white',
            cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)',
          }}
        >
          <Plus size={12} strokeWidth={2} />
          New
        </button>
      </div>

      {/* ── Document List ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {filteredDocs.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <FileText size={32} strokeWidth={1} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13 }}>{search || filters.length > 0 ? 'No documents match your filters' : 'No documents yet'}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              {search || filters.length > 0 ? 'Try adjusting your search or filters' : 'Create your first document to get started'}
            </div>
          </div>
        ) : (
          groupedDocs.map(group => (
            <div key={group.key} style={{ marginBottom: groupBy !== 'none' ? 24 : 0 }}>
              {groupBy !== 'none' && (
                <GroupHeader title={group.title} count={group.docs.length} dotColor={group.dotColor} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.docs.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    libraries={libraries}
                    isSelected={selectedDocId === doc.id}
                    onSelect={() => onSelectDoc(doc)}
                    searchQuery={search}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
