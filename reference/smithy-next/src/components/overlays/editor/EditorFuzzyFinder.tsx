import { useState, useRef, useEffect, useMemo } from 'react'
import { File, FileCode, FileJson, FileText, Folder } from 'lucide-react'
import { flattenFileTree, mockEditorFileTree, type EditorFileEntry } from './editor-mock-data'

interface Props {
  visible: boolean
  onClose: () => void
  onOpenFile: (path: string) => void
  onNavigateToFolder: (path: string) => void
}

function getEntryIcon(entry: EditorFileEntry) {
  if (entry.type === 'folder') return { icon: Folder, color: '#d97706' }
  const ext = entry.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': return { icon: FileCode, color: '#3b82f6' }
    case 'js': case 'jsx': return { icon: FileCode, color: '#eab308' }
    case 'json': return { icon: FileJson, color: '#eab308' }
    case 'md': return { icon: FileText, color: '#a855f7' }
    default: return { icon: File, color: 'var(--color-text-tertiary)' }
  }
}

export function EditorFuzzyFinder({ visible, onClose, onOpenFile, onNavigateToFolder }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allEntries = useMemo(() => flattenFileTree(mockEditorFileTree), [])

  const filtered = useMemo(() => {
    if (!query.trim()) return allEntries.filter(e => e.type === 'file').slice(0, 20)
    const lower = query.toLowerCase()
    return allEntries
      .filter(e => e.name.toLowerCase().includes(lower) || e.path.toLowerCase().includes(lower))
      .sort((a, b) => {
        // Prioritize name matches over path matches
        const aName = a.name.toLowerCase().indexOf(lower)
        const bName = b.name.toLowerCase().indexOf(lower)
        if (aName !== -1 && bName === -1) return -1
        if (aName === -1 && bName !== -1) return 1
        return 0
      })
      .slice(0, 20)
  }, [query, allEntries])

  useEffect(() => {
    if (visible) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [visible])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && filtered[selectedIndex]) {
      const entry = filtered[selectedIndex]
      if (entry.type === 'folder') onNavigateToFolder(entry.path)
      else onOpenFile(entry.path)
      onClose()
    }
  }

  if (!visible) return null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'var(--color-bg-overlay)',
          zIndex: 'var(--z-command)' as any,
        }}
        onClick={onClose}
      />

      {/* Finder dialog */}
      <div style={{
        position: 'fixed',
        top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 520, maxWidth: '90vw',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-float)',
        zIndex: 'var(--z-command)' as any,
        overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{ padding: '12px 12px 8px' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files by name..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%', height: 36,
              padding: '0 12px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13, color: 'var(--color-text)',
              outline: 'none',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-border-focus)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={{
          maxHeight: 320, overflow: 'auto',
          padding: '0 4px 4px',
        }}>
          {filtered.map((entry, i) => {
            const { icon: EntryIcon, color } = getEntryIcon(entry)
            const isSelected = i === selectedIndex
            const dirPath = entry.path.includes('/')
              ? entry.path.split('/').slice(0, -1).join('/')
              : ''

            return (
              <button
                key={entry.path}
                onClick={() => {
                  if (entry.type === 'folder') onNavigateToFolder(entry.path)
                  else onOpenFile(entry.path)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px',
                  background: isSelected ? 'var(--color-surface-active)' : 'transparent',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  textAlign: 'left', cursor: 'pointer',
                  transition: `background var(--duration-fast)`,
                }}
              >
                <EntryIcon size={15} strokeWidth={1.5} style={{ color, minWidth: 15 }} />
                <span style={{
                  fontSize: 13, color: 'var(--color-text)',
                  fontWeight: 500,
                }}>
                  {entry.name}
                </span>
                {dirPath && (
                  <span style={{
                    fontSize: 11, color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    flex: 1,
                  }}>
                    {dirPath}
                  </span>
                )}
              </button>
            )
          })}

          {filtered.length === 0 && (
            <div style={{
              padding: 16, textAlign: 'center',
              color: 'var(--color-text-tertiary)', fontSize: 12,
            }}>
              No files match &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </>
  )
}
