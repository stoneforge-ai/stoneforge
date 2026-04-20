import { Folder, File, FileText, FileJson, FileCode, ChevronUp, Bot } from 'lucide-react'
import type { EditorFileEntry } from './editor-mock-data'

interface Props {
  entries: EditorFileEntry[]
  currentPath: string
  onOpenFile: (path: string) => void
  onNavigateToFolder: (path: string) => void
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
    default: return { icon: File, color: 'var(--color-text-tertiary)' }
  }
}

export function EditorFolderView({ entries, currentPath, onOpenFile, onNavigateToFolder }: Props) {
  // Sort: folders first, then files alphabetically
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // Find if there's a README.md
  const readme = sorted.find(e => e.type === 'file' && e.name.toLowerCase() === 'readme.md')

  // Collect agent activity summary
  const agentFiles = sorted.filter(e => e.agentModified)
  const agentAuthors = [...new Set(agentFiles.map(e => e.lastCommitAuthor).filter(Boolean))]

  // Parent path for ".." navigation
  const parentPath = currentPath.includes('/')
    ? currentPath.split('/').slice(0, -1).join('/')
    : ''

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 24px' }}>
        {/* Agent activity banner */}
        {agentFiles.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: 'var(--color-primary-subtle)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 12,
            fontSize: 12,
          }}>
            <Bot size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {agentAuthors.join(', ')} modified {agentFiles.length} file{agentFiles.length > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* File table */}
        <div style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {/* Parent directory row */}
          {currentPath && (
            <div
              onClick={() => onNavigateToFolder(parentPath)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--color-border-subtle)',
                transition: `background var(--duration-fast)`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ChevronUp size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>..</span>
            </div>
          )}

          {/* File/folder rows */}
          {sorted.map(entry => {
            const isFolder = entry.type === 'folder'
            const { icon: EntryIcon, color: iconColor } = isFolder
              ? { icon: Folder, color: '#d97706' }
              : getFileIcon(entry.name)

            return (
              <div
                key={entry.path}
                onClick={() => isFolder ? onNavigateToFolder(entry.path) : onOpenFile(entry.path)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr minmax(200px, 2fr) 100px 28px',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  transition: `background var(--duration-fast)`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <EntryIcon size={15} strokeWidth={1.5} style={{ color: iconColor, minWidth: 15 }} />
                  <span style={{
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                    color: isFolder ? 'var(--color-text)' : 'var(--color-text)',
                    fontWeight: isFolder ? 500 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {entry.name}
                  </span>
                </div>

                {/* Last commit message */}
                <span style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {entry.lastCommitMessage || ''}
                </span>

                {/* Last commit date */}
                <span style={{
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                  whiteSpace: 'nowrap',
                  textAlign: 'right',
                }}>
                  {entry.lastCommitDate || ''}
                </span>

                {/* Agent indicator */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {entry.agentModified && (
                    <Bot size={13} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
                  )}
                </div>
              </div>
            )
          })}

          {sorted.length === 0 && (
            <div style={{
              padding: '24px 16px', textAlign: 'center',
              color: 'var(--color-text-tertiary)', fontSize: 13,
            }}>
              Empty directory
            </div>
          )}
        </div>

        {/* README preview */}
        {readme && (
          <div style={{
            marginTop: 16,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface)',
              fontSize: 12, fontWeight: 500,
              color: 'var(--color-text-secondary)',
            }}>
              README.md
            </div>
            <div style={{
              padding: '16px',
              fontSize: 13, lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
              maxHeight: 300, overflow: 'hidden',
              position: 'relative',
            }}>
              <div style={{ fontFamily: 'var(--font-sans)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>
                  Stoneforge
                </div>
                <p style={{ margin: '8px 0' }}>Agentic software development platform.</p>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginTop: 16, marginBottom: 8 }}>
                  Quick Start
                </div>
                <pre style={{
                  background: 'var(--color-surface)',
                  padding: 12, borderRadius: 'var(--radius-sm)',
                  fontSize: 12, fontFamily: 'var(--font-mono)',
                  overflow: 'auto',
                }}>
{`# Install dependencies
pnpm install

# Start development server
pnpm dev`}
                </pre>
              </div>
              {/* Fade overlay */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
                background: 'linear-gradient(transparent, var(--color-bg))',
              }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
