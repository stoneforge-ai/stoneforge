import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Folder, File, FileText, FileJson, FileCode, Search, FilePlus, FolderPlus, Bot } from 'lucide-react'
import type { EditorFileEntry } from './editor-mock-data'

interface Props {
  fileTree: EditorFileEntry[]
  activeFilePath: string | null
  onOpenFile: (path: string) => void
  onNavigateToFolder: (path: string) => void
  onRenameEntry?: (oldPath: string, newName: string) => void
  onDeleteEntry?: (path: string) => void
  clipboard?: { path: string; mode: 'copy' | 'cut' } | null
  onClipboardAction?: (path: string, mode: 'copy' | 'cut') => void
  onPaste?: (targetFolder: string) => void
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': return { icon: FileCode, color: '#3b82f6' }
    case 'js': case 'jsx': return { icon: FileCode, color: '#eab308' }
    case 'json': return { icon: FileJson, color: '#eab308' }
    case 'md': return { icon: FileText, color: '#a855f7' }
    case 'css': case 'scss': return { icon: FileCode, color: '#ec4899' }
    case 'py': return { icon: FileCode, color: '#3b82f6' }
    case 'rs': return { icon: FileCode, color: '#f97316' }
    case 'go': return { icon: FileCode, color: '#06b6d4' }
    default: return { icon: File, color: 'var(--color-text-tertiary)' }
  }
}

export function EditorExplorerPanel({
  fileTree, activeFilePath, onOpenFile, onNavigateToFolder,
  onRenameEntry, onDeleteEntry, clipboard, onClipboardAction, onPaste,
}: Props) {
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(['packages', 'packages/smithy', 'packages/smithy/src', 'packages/smithy/src/auth', 'apps'])
  )

  const toggleFolder = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const matchesFilter = (entry: EditorFileEntry): boolean => {
    if (!filter) return true
    const lowerFilter = filter.toLowerCase()
    if (entry.name.toLowerCase().includes(lowerFilter)) return true
    if (entry.children) return entry.children.some(matchesFilter)
    return false
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with search + actions */}
      <div style={{
        padding: '8px 8px 4px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 4px',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Explorer
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button title="New File" style={{
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              <FilePlus size={13} strokeWidth={1.5} />
            </button>
            <button title="New Folder" style={{
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              <FolderPlus size={13} strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={12} strokeWidth={1.5} style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--color-text-tertiary)',
          }} />
          <input
            type="text"
            placeholder="Filter files..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: '100%', height: 26,
              padding: '0 8px 0 26px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11, color: 'var(--color-text)',
              outline: 'none',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-border-focus)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          />
        </div>
      </div>

      {/* File tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {fileTree.filter(matchesFilter).map(entry => (
          <TreeItem
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={expanded}
            onToggle={toggleFolder}
            activeFilePath={activeFilePath}
            onOpenFile={onOpenFile}
            onNavigateToFolder={onNavigateToFolder}
            onRenameEntry={onRenameEntry}
            onDeleteEntry={onDeleteEntry}
            clipboard={clipboard}
            onClipboardAction={onClipboardAction}
            onPaste={onPaste}
            filter={filter}
            matchesFilter={matchesFilter}
          />
        ))}
      </div>
    </div>
  )
}

// ── Shared context menu rendering ──

interface ContextMenuItem {
  label: string
  action: () => void
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
}

function ContextMenu({ items, position, onClose }: {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
}) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' as any }}
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
      />
      <div style={{
        position: 'fixed',
        left: position.x, top: position.y,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '4px 0',
        boxShadow: 'var(--shadow-float)',
        zIndex: 'var(--z-dropdown)' as any,
        minWidth: 200,
      }}>
        {items.map((item, idx) => {
          if (item.separator) {
            return <div key={idx} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
          }
          return (
            <button
              key={item.label}
              onClick={() => { if (!item.disabled) { item.action(); onClose() } }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%',
                padding: '6px 12px',
                background: 'none', border: 'none',
                fontSize: 12,
                color: item.disabled ? 'var(--color-text-tertiary)' : item.danger ? 'var(--color-danger)' : 'var(--color-text)',
                textAlign: 'left', cursor: item.disabled ? 'default' : 'pointer',
                opacity: item.disabled ? 0.5 : 1,
                transition: `background var(--duration-fast)`,
              }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = 'var(--color-surface-active)' }}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 16 }}>{item.shortcut}</span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ── Delete confirmation dialog ──

function DeleteDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 'var(--z-modal)' as any }} onClick={onCancel} />
      <div style={{
        position: 'fixed', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 380, background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
        padding: 20, boxShadow: 'var(--shadow-float)',
        zIndex: 'var(--z-modal)' as any,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
          Delete &ldquo;{name}&rdquo;?
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          This action cannot be undone. The file will be permanently deleted.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: '6px 12px', fontSize: 12, background: 'var(--color-surface)', border: 'none',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '6px 12px', fontSize: 12, background: 'var(--color-danger)', border: 'none',
            borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer',
          }}>Delete</button>
        </div>
      </div>
    </>
  )
}

// ── Tree item ──

function TreeItem({ entry, depth, expanded, onToggle, activeFilePath, onOpenFile, onNavigateToFolder, onRenameEntry, onDeleteEntry, clipboard, onClipboardAction, onPaste, filter, matchesFilter }: {
  entry: EditorFileEntry
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  activeFilePath: string | null
  onOpenFile: (path: string) => void
  onNavigateToFolder: (path: string) => void
  onRenameEntry?: (oldPath: string, newName: string) => void
  onDeleteEntry?: (path: string) => void
  clipboard?: { path: string; mode: 'copy' | 'cut' } | null
  onClipboardAction?: (path: string, mode: 'copy' | 'cut') => void
  onPaste?: (targetFolder: string) => void
  filter: string
  matchesFilter: (e: EditorFileEntry) => boolean
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const isFolder = entry.type === 'folder'
  const isExpanded = expanded.has(entry.path)
  const isActive = entry.path === activeFilePath
  const isCut = clipboard?.path === entry.path && clipboard.mode === 'cut'

  if (filter && !matchesFilter(entry)) return null

  const handleClick = () => {
    if (isRenaming) return
    if (isFolder) {
      onToggle(entry.path)
    } else {
      onOpenFile(entry.path)
    }
  }

  const handleDoubleClick = () => {
    if (isFolder) {
      onNavigateToFolder(entry.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const startRename = () => {
    setIsRenaming(true)
    // For files, select name without extension. For folders, select all.
    const name = entry.name
    setRenameValue(name)
  }

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      // Select filename without extension
      const dotIdx = entry.type === 'file' ? entry.name.lastIndexOf('.') : -1
      if (dotIdx > 0) {
        renameInputRef.current.setSelectionRange(0, dotIdx)
      } else {
        renameInputRef.current.select()
      }
    }
  }, [isRenaming, entry.name, entry.type])

  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== entry.name) {
      onRenameEntry?.(entry.path, trimmed)
    }
    setIsRenaming(false)
  }

  const parentPath = entry.path.includes('/') ? entry.path.split('/').slice(0, -1).join('/') : ''

  const { icon: EntryIcon, color: iconColor } = isFolder
    ? { icon: Folder, color: '#d97706' }
    : getFileIcon(entry.name)

  // Build context menu items
  const menuItems: ContextMenuItem[] = isFolder ? [
    { label: 'Open Folder', action: () => onNavigateToFolder(entry.path) },
    { label: 'Expand/Collapse', action: () => onToggle(entry.path) },
    { label: '', action: () => {}, separator: true },
    { label: 'Cut', action: () => onClipboardAction?.(entry.path, 'cut'), shortcut: '⌘X' },
    { label: 'Copy', action: () => onClipboardAction?.(entry.path, 'copy'), shortcut: '⌘C' },
    { label: 'Paste', action: () => onPaste?.(entry.path), shortcut: '⌘V', disabled: !clipboard },
    { label: '', action: () => {}, separator: true },
    { label: 'Copy Path', action: () => navigator.clipboard?.writeText(entry.path) },
    { label: 'Copy Relative Path', action: () => navigator.clipboard?.writeText(entry.path) },
    { label: '', action: () => {}, separator: true },
    { label: 'Rename', action: startRename, shortcut: 'F2' },
    { label: 'Delete', action: () => setDeleteConfirm(true), danger: true, shortcut: 'Del' },
  ] : [
    { label: 'Open', action: () => onOpenFile(entry.path) },
    { label: '', action: () => {}, separator: true },
    { label: 'Cut', action: () => onClipboardAction?.(entry.path, 'cut'), shortcut: '⌘X' },
    { label: 'Copy', action: () => onClipboardAction?.(entry.path, 'copy'), shortcut: '⌘C' },
    { label: 'Paste', action: () => onPaste?.(parentPath), shortcut: '⌘V', disabled: !clipboard },
    { label: '', action: () => {}, separator: true },
    { label: 'Copy Path', action: () => navigator.clipboard?.writeText(entry.path) },
    { label: 'Copy Relative Path', action: () => navigator.clipboard?.writeText(entry.path) },
    { label: 'Copy Name', action: () => navigator.clipboard?.writeText(entry.name) },
    { label: '', action: () => {}, separator: true },
    { label: 'Rename', action: startRename, shortcut: 'F2' },
    { label: 'Delete', action: () => setDeleteConfirm(true), danger: true, shortcut: 'Del' },
  ]

  return (
    <>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px',
          paddingLeft: 8 + depth * 14,
          cursor: 'pointer',
          fontSize: 12,
          color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
          background: isActive ? 'var(--color-primary-subtle)' : 'transparent',
          borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
          opacity: isCut ? 0.5 : 1,
          transition: `background var(--duration-fast)`,
        }}
        onMouseEnter={e => {
          if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)'
        }}
        onMouseLeave={e => {
          if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-primary-subtle)' : 'transparent'
        }}
      >
        {isFolder ? (
          isExpanded ? <ChevronDown size={12} strokeWidth={1.5} style={{ minWidth: 12 }} /> : <ChevronRight size={12} strokeWidth={1.5} style={{ minWidth: 12 }} />
        ) : (
          <span style={{ width: 12, minWidth: 12 }} />
        )}
        <EntryIcon size={14} strokeWidth={1.5} style={{ color: iconColor, minWidth: 14 }} />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, minWidth: 0,
              padding: '0 4px', height: 18,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border-focus)',
              borderRadius: 2,
              fontSize: 12, color: 'var(--color-text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <span style={{
            flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {entry.name}
          </span>
        )}
        {entry.agentModified && !isRenaming && (
          <Bot size={11} strokeWidth={1.5} style={{ color: 'var(--color-primary)', minWidth: 11 }} />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu items={menuItems} position={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <DeleteDialog
          name={entry.name}
          onConfirm={() => { onDeleteEntry?.(entry.path); setDeleteConfirm(false) }}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}

      {isFolder && isExpanded && entry.children?.filter(matchesFilter).map(child => (
        <TreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          activeFilePath={activeFilePath}
          onOpenFile={onOpenFile}
          onNavigateToFolder={onNavigateToFolder}
          onRenameEntry={onRenameEntry}
          onDeleteEntry={onDeleteEntry}
          clipboard={clipboard}
          onClipboardAction={onClipboardAction}
          onPaste={onPaste}
          filter={filter}
          matchesFilter={matchesFilter}
        />
      ))}
    </>
  )
}
