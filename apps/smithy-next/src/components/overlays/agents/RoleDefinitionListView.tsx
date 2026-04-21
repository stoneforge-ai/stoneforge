import { useState, useRef, useMemo } from 'react'
import { Search, X, Filter, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react'
import type { RoleDefinition, RoleDefinitionCategory } from './agent-types'

interface RoleDefinitionListViewProps {
  roleDefinitions: RoleDefinition[]
  onSelectRoleDefinition: (rd: RoleDefinition) => void
  onCreateRoleDefinition: () => void
}

const categoryBadgeColors: Record<string, { bg: string; text: string }> = {
  orchestrator: { bg: 'rgba(124,58,237,0.1)', text: '#7c3aed' },
  executor: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  reviewer: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
}

function getCategoryBadge(category?: RoleDefinitionCategory) {
  if (!category) return { bg: 'var(--color-surface)', text: 'var(--color-text-secondary)' }
  return categoryBadgeColors[category] || { bg: 'var(--color-surface)', text: 'var(--color-text-secondary)' }
}

type CategoryFilterValue = 'all' | 'orchestrator' | 'executor' | 'reviewer' | 'custom'

export function RoleDefinitionListView({ roleDefinitions, onSelectRoleDefinition, onCreateRoleDefinition }: RoleDefinitionListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>('all')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    let result = roleDefinitions

    // Category filter
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'custom') {
        result = result.filter(rd =>
          !rd.category || !['orchestrator', 'executor', 'reviewer'].includes(rd.category)
        )
      } else {
        result = result.filter(rd => rd.category === categoryFilter)
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(rd =>
        rd.name.toLowerCase().includes(q) ||
        (rd.description && rd.description.toLowerCase().includes(q))
      )
    }

    return result
  }, [roleDefinitions, searchQuery, categoryFilter])

  const categoryOptions: { value: CategoryFilterValue; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'orchestrator', label: 'Orchestrator' },
    { value: 'executor', label: 'Executor' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'custom', label: 'Custom' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Role Definitions</span>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div className="rd-search-container" style={{ position: 'relative' }}>
          <div className="rd-search-desktop" style={{ display: 'flex' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 200, height: 26, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}>
              <Search size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search roles..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text)', fontSize: 11, fontFamily: 'inherit' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} strokeWidth={2} /></button>}
            </div>
          </div>
          <div className="rd-search-mobile" style={{ display: 'none' }}>
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
        <button onClick={() => { setFilterOpen(!filterOpen); setDisplayOpen(false) }} style={{
          height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)',
          background: categoryFilter !== 'all' ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
          color: categoryFilter !== 'all' ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
        }}>
          <Filter size={12} strokeWidth={1.5} /> Filter
        </button>

        {/* Display button */}
        <button onClick={() => { setDisplayOpen(!displayOpen); setFilterOpen(false) }} style={{
          height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 'var(--radius-sm)',
          background: displayOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
          color: displayOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
        }}>
          <SlidersHorizontal size={12} strokeWidth={1.5} /> Display
        </button>

        {/* New Role Definition */}
        <button onClick={onCreateRoleDefinition} style={{
          height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          <Plus size={12} strokeWidth={1.5} /> New Role Definition
        </button>
      </div>

      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        {categoryOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setCategoryFilter(opt.value)}
            style={{
              height: 24, padding: '0 10px', fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              background: categoryFilter === opt.value ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
              color: categoryFilter === opt.value ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No role definitions found
          </div>
        )}
        {filtered.map(rd => (
          <RoleDefinitionRow key={rd.id} roleDefinition={rd} onClick={() => onSelectRoleDefinition(rd)} />
        ))}
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .rd-search-desktop { display: none !important; }
          .rd-search-mobile { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

function RoleDefinitionRow({ roleDefinition, onClick }: { roleDefinition: RoleDefinition; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const badge = getCategoryBadge(roleDefinition.category)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)', border: 'none',
        background: hovered ? 'var(--color-surface-hover)' : 'transparent',
        transition: 'background var(--duration-fast)',
        textAlign: 'left',
      }}
    >
      {/* Left side: name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
          {roleDefinition.name}
        </div>
        {roleDefinition.description && (
          <div style={{
            fontSize: 11, color: 'var(--color-text-tertiary)', maxWidth: 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {roleDefinition.description}
          </div>
        )}
      </div>

      {/* Category badge */}
      {roleDefinition.category && (
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)',
          background: badge.bg, color: badge.text, flexShrink: 0, whiteSpace: 'nowrap',
          textTransform: 'capitalize',
        }}>
          {roleDefinition.category}
        </span>
      )}

      {/* Built-in badge */}
      {roleDefinition.builtIn && (
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)',
          background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', flexShrink: 0,
        }}>
          Built-in
        </span>
      )}

      {/* Tags (up to 3) */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {roleDefinition.tags.slice(0, 3).map(tag => (
          <span key={tag} style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap',
          }}>
            {tag}
          </span>
        ))}
      </div>

      <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
    </button>
  )
}
