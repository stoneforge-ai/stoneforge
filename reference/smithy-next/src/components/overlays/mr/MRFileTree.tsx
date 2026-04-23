import { useState } from 'react'
import { Check, File, Folder, ChevronDown, ChevronRight } from 'lucide-react'
import type { DiffFile } from '../../../mock-data'

interface MRFileTreeProps {
  files: DiffFile[]
  viewedFiles: Set<string>
  onToggleViewed: (path: string) => void
  activeFilePath: string | null
  onSelectFile: (path: string) => void
}

const statusColor: Record<string, string> = {
  added: 'var(--color-success)',
  modified: 'var(--color-warning)',
  deleted: 'var(--color-danger)',
}

const statusLetter: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
}

// ── Build a tree structure from flat file paths ──
interface TreeNode {
  name: string
  fullPath: string
  children: TreeNode[]
  file?: DiffFile  // leaf node
}

function buildTree(files: DiffFile[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', children: [] }

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      if (isFile) {
        current.children.push({ name: part, fullPath: file.path, children: [], file })
      } else {
        let child = current.children.find(c => c.name === part && !c.file)
        if (!child) {
          child = { name: part, fullPath: parts.slice(0, i + 1).join('/'), children: [] }
          current.children.push(child)
        }
        current = child
      }
    }
  }

  return collapseTree(root)
}

// Collapse single-child folder chains: a/b/c with one child → "a/b/c"
function collapseTree(node: TreeNode): TreeNode {
  // Recursively collapse children first
  node.children = node.children.map(collapseTree)

  // If this folder has exactly one child and it's also a folder, merge them
  if (!node.file && node.children.length === 1 && !node.children[0].file) {
    const child = node.children[0]
    return {
      name: node.name ? `${node.name}/${child.name}` : child.name,
      fullPath: child.fullPath,
      children: child.children,
    }
  }

  return node
}

export function MRFileTree({ files, viewedFiles, onToggleViewed, activeFilePath, onSelectFile }: MRFileTreeProps) {
  const tree = buildTree(files)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {tree.children.map(node => (
          <TreeNodeRow
            key={node.fullPath || node.name}
            node={node}
            depth={0}
            viewedFiles={viewedFiles}
            onToggleViewed={onToggleViewed}
            activeFilePath={activeFilePath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </div>
  )
}

function TreeNodeRow({ node, depth, viewedFiles, onToggleViewed, activeFilePath, onSelectFile }: {
  node: TreeNode; depth: number
  viewedFiles: Set<string>; onToggleViewed: (path: string) => void
  activeFilePath: string | null; onSelectFile: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isFolder = !node.file
  const paddingLeft = 12 + depth * 14

  if (isFolder) {
    return (
      <>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: `3px 8px 3px ${paddingLeft}px`,
            cursor: 'pointer', fontSize: 11, color: 'var(--color-text-tertiary)',
            transition: `background var(--duration-fast)`,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {expanded ? <ChevronDown size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} /> : <ChevronRight size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />}
          <Folder size={12} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        </div>
        {expanded && node.children.map(child => (
          <TreeNodeRow
            key={child.fullPath || child.name}
            node={child}
            depth={depth + 1}
            viewedFiles={viewedFiles}
            onToggleViewed={onToggleViewed}
            activeFilePath={activeFilePath}
            onSelectFile={onSelectFile}
          />
        ))}
      </>
    )
  }

  // File leaf node
  const file = node.file!
  const isViewed = viewedFiles.has(file.path)
  const isActive = activeFilePath === file.path

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: `4px 8px 4px ${paddingLeft}px`,
        background: isActive ? 'var(--color-surface-active)' : 'transparent',
        cursor: 'pointer', fontSize: 12,
        transition: `background var(--duration-fast)`,
      }}
      onClick={() => onSelectFile(file.path)}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => e.currentTarget.style.background = isActive ? 'var(--color-surface-active)' : 'transparent'}
    >
      {/* Viewed checkbox */}
      <div
        onClick={e => { e.stopPropagation(); onToggleViewed(file.path) }}
        style={{
          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
          border: isViewed ? 'none' : '1.5px solid var(--color-border)',
          background: isViewed ? 'var(--color-success)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {isViewed && <Check size={10} strokeWidth={3} style={{ color: 'white' }} />}
      </div>

      {/* Status letter */}
      <span style={{ fontSize: 10, fontWeight: 600, color: statusColor[file.status], width: 12, textAlign: 'center', flexShrink: 0 }}>
        {statusLetter[file.status]}
      </span>

      {/* Filename */}
      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isViewed ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        textDecoration: isViewed ? 'line-through' : 'none',
      }} title={file.path}>
        {node.name}
      </span>

      {/* +/- */}
      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', display: 'flex', gap: 4, flexShrink: 0 }}>
        {file.additions > 0 && <span style={{ color: 'var(--color-success)' }}>+{file.additions}</span>}
        {file.deletions > 0 && <span style={{ color: 'var(--color-danger)' }}>-{file.deletions}</span>}
      </span>
    </div>
  )
}
