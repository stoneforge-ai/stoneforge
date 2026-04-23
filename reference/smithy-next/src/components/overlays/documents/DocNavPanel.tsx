import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, FolderOpen, Folder, FileText, FileCode, FileType, Clock, FolderClosed } from 'lucide-react'
import type { Document, Library } from './doc-types'

interface DocNavPanelProps {
  documents: Document[]
  libraries: Library[]
  selectedDocId: string | null
  selectedLibraryId: string | null
  onSelectDoc: (doc: Document) => void
  onSelectLibrary: (libraryId: string | null) => void
  recentDocIds: string[]
  style?: React.CSSProperties
}

// ── Category labels ──
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

function DocIcon({ contentType }: { contentType: string }) {
  const size = 14
  const color = 'var(--color-text-tertiary)'
  if (contentType === 'json') return <FileCode size={size} color={color} />
  if (contentType === 'text') return <FileType size={size} color={color} />
  return <FileText size={size} color={color} />
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

// ── Library Tree Item ──
function LibraryTreeItem({ library, libraries, documents, expandedIds, onToggle, onSelectLibrary, selectedLibraryId, depth = 0 }: {
  library: Library
  libraries: Library[]
  documents: Document[]
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onSelectLibrary: (id: string | null) => void
  selectedLibraryId: string | null
  depth?: number
}) {
  const childLibs = libraries.filter(l => l.parentId === library.id)
  const docCount = documents.filter(d => d.libraryId === library.id).length
  const hasChildren = childLibs.length > 0
  const isExpanded = expandedIds.has(library.id)
  const isSelected = selectedLibraryId === library.id

  return (
    <>
      <button
        onClick={() => {
          onSelectLibrary(library.id)
          if (hasChildren) onToggle(library.id)
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, width: '100%',
          padding: '4px 8px', paddingLeft: 8 + depth * 16,
          background: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
          border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          color: isSelected ? 'var(--color-text)' : 'var(--color-text-secondary)',
          fontSize: 13, textAlign: 'left', transition: 'background var(--duration-fast)',
          fontFamily: 'var(--font-sans)',
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {hasChildren ? (
          isExpanded ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : <ChevronRight size={12} style={{ flexShrink: 0 }} />
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        {isExpanded ? <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--color-warning)' }} /> : <Folder size={14} style={{ flexShrink: 0, color: 'var(--color-warning)' }} />}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{library.name}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{docCount}</span>
      </button>
      {isExpanded && childLibs.map(child => (
        <LibraryTreeItem
          key={child.id}
          library={child}
          libraries={libraries}
          documents={documents}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onSelectLibrary={onSelectLibrary}
          selectedLibraryId={selectedLibraryId}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

// ── Compact Document Row (for recents) ──
function DocRow({ doc, isSelected, onSelect }: { doc: Document; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, width: '100%',
        padding: '5px 12px', background: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
        border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        textAlign: 'left', transition: 'background var(--duration-fast)',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <DocIcon contentType={doc.contentType} />
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {doc.title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 20 }}>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.02em',
          color: categoryColors[doc.category] || 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
        }}>
          {categoryLabels[doc.category] || doc.category}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {timeAgo(doc.updatedAt)}
        </span>
      </div>
    </button>
  )
}

// ── Main Nav Panel (tree + recents only) ──
export function DocNavPanel({ documents, libraries, selectedDocId, selectedLibraryId, onSelectDoc, onSelectLibrary, recentDocIds, style }: DocNavPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(libraries.filter(l => l.parentId === null).map(l => l.id)))
  const [treeCollapsed, setTreeCollapsed] = useState(false)

  const topLevelLibraries = useMemo(() => libraries.filter(l => l.parentId === null), [libraries])

  const recentDocs = useMemo(() => {
    return recentDocIds
      .map(id => documents.find(d => d.id === id))
      .filter((d): d is Document => !!d)
      .slice(0, 5)
  }, [recentDocIds, documents])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      borderRight: '1px solid var(--color-border-subtle)',
      background: 'var(--color-bg-secondary)',
      ...style,
    }}>
      {/* ── Library Tree ── */}
      <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <button
          onClick={() => setTreeCollapsed(!treeCollapsed)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, width: '100%',
            padding: '8px 12px', background: 'transparent', border: 'none',
            color: 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {treeCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          Libraries
        </button>
        {!treeCollapsed && (
          <div style={{ padding: '0 4px 6px' }}>
            <button
              onClick={() => onSelectLibrary(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '4px 8px', background: selectedLibraryId === null ? 'var(--color-primary-subtle)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: selectedLibraryId === null ? 'var(--color-text)' : 'var(--color-text-secondary)',
                fontSize: 13, textAlign: 'left', transition: 'background var(--duration-fast)',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => { if (selectedLibraryId !== null) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (selectedLibraryId !== null) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <FileText size={14} style={{ color: 'var(--color-text-tertiary)' }} />
              All Documents
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{documents.length}</span>
            </button>
            {topLevelLibraries.map(lib => (
              <LibraryTreeItem
                key={lib.id}
                library={lib}
                libraries={libraries}
                documents={documents}
                expandedIds={expandedIds}
                onToggle={toggleExpand}
                onSelectLibrary={onSelectLibrary}
                selectedLibraryId={selectedLibraryId}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable bottom section: Recent + Library Docs ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* ── Recent Docs ── */}
        {recentDocs.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 12px', color: 'var(--color-text-tertiary)',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              <Clock size={10} />
              Recent
            </div>
            <div style={{ padding: '0 4px 4px' }}>
              {recentDocs.map(doc => (
                <DocRow key={`recent-${doc.id}`} doc={doc} isSelected={selectedDocId === doc.id} onSelect={() => onSelectDoc(doc)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Documents in scope (active library or all) ── */}
        {(() => {
          // Determine active library: use selectedLibraryId, or infer from the selected doc
          const selectedDoc = selectedDocId ? documents.find(d => d.id === selectedDocId) : null
          const activeLibId = selectedLibraryId !== undefined ? selectedLibraryId : (selectedDoc?.libraryId || null)

          const isAll = activeLibId === null
          const activeLib = activeLibId ? libraries.find(l => l.id === activeLibId) : null

          const scopedDocs = isAll
            ? [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            : documents.filter(d => d.libraryId === activeLibId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

          if (scopedDocs.length === 0) return null

          return (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 12px', color: 'var(--color-text-tertiary)',
                fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                {isAll ? <FileText size={10} /> : <FolderClosed size={10} />}
                {isAll ? 'All Documents' : activeLib!.name}
              </div>
              <div style={{ padding: '0 4px 4px' }}>
                {scopedDocs.map(doc => (
                  <DocRow key={`lib-${doc.id}`} doc={doc} isSelected={selectedDocId === doc.id} onSelect={() => onSelectDoc(doc)} />
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
