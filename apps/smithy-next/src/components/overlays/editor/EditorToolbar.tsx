import { ChevronRight, Bot, GitBranch, AlignLeft, Eye } from 'lucide-react'
import type { EditorFileContent, AgentFileChange } from './editor-mock-data'

interface Props {
  /** Full path to current file or folder */
  currentPath: string | null
  /** File content info (null when viewing a folder) */
  fileInfo: EditorFileContent | null
  /** Agent change info for the current file */
  agentChange: AgentFileChange | null
  /** Branch name */
  branch?: string | null
  /** Whether blame view is active */
  blameActive: boolean
  onToggleBlame: () => void
  /** Whether symbol outline is visible */
  outlineActive: boolean
  onToggleOutline: () => void
  /** Navigate to a folder from breadcrumb */
  onNavigateToFolder: (folderPath: string) => void
  /** Current line/column for status display */
  cursorLine?: number
  cursorCol?: number
}

export function EditorToolbar({
  currentPath, fileInfo, agentChange, branch,
  blameActive, onToggleBlame,
  outlineActive, onToggleOutline,
  onNavigateToFolder,
}: Props) {
  const segments = currentPath ? currentPath.split('/') : []

  return (
    <div style={{
      height: 32, minHeight: 32,
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '0 12px',
      borderBottom: '1px solid var(--color-border-subtle)',
      fontSize: 12,
      overflow: 'hidden',
    }}>
      {/* Breadcrumbs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        flex: 1, minWidth: 0,
        overflow: 'hidden',
      }}>
        {/* Root */}
        <button
          onClick={() => onNavigateToFolder('')}
          style={{
            background: 'none', border: 'none',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: 12,
            padding: '2px 4px', borderRadius: 'var(--radius-sm)',
            transition: `all var(--duration-fast)`,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-text-accent)'
            e.currentTarget.style.background = 'var(--color-primary-subtle)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)'
            e.currentTarget.style.background = 'none'
          }}
        >
          ~
        </button>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1
          const folderPath = segments.slice(0, i + 1).join('/')
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
              <ChevronRight size={10} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', minWidth: 10 }} />
              {isLast && fileInfo ? (
                <span style={{
                  color: 'var(--color-text)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {seg}
                </span>
              ) : (
                <button
                  onClick={() => onNavigateToFolder(folderPath)}
                  style={{
                    background: 'none', border: 'none',
                    color: isLast ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                    fontWeight: isLast ? 500 : 400,
                    cursor: 'pointer', fontSize: 12,
                    padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                    transition: `all var(--duration-fast)`,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-text-accent)'
                    e.currentTarget.style.background = 'var(--color-primary-subtle)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = isLast ? 'var(--color-text)' : 'var(--color-text-tertiary)'
                    e.currentTarget.style.background = 'none'
                  }}
                >
                  {seg}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Agent change chip */}
      {agentChange && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px',
          background: 'var(--color-primary-subtle)',
          borderRadius: 'var(--radius-full)',
          color: 'var(--color-text-accent)',
          fontSize: 11,
          whiteSpace: 'nowrap',
        }}>
          <Bot size={11} strokeWidth={1.5} />
          <span>{agentChange.agentName}</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{agentChange.changedAt}</span>
        </div>
      )}

      {/* View toggles */}
      {fileInfo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={onToggleBlame}
            title="Toggle blame view"
            style={{
              height: 24, padding: '0 6px',
              display: 'flex', alignItems: 'center', gap: 3,
              background: blameActive ? 'var(--color-surface-active)' : 'none',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: blameActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11,
              transition: `all var(--duration-fast)`,
            }}
            onMouseEnter={e => { if (!blameActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { if (!blameActive) e.currentTarget.style.background = 'none' }}
          >
            <Eye size={12} strokeWidth={1.5} />
            Blame
          </button>
          <button
            onClick={onToggleOutline}
            title="Toggle symbol outline"
            style={{
              height: 24, padding: '0 6px',
              display: 'flex', alignItems: 'center', gap: 3,
              background: outlineActive ? 'var(--color-surface-active)' : 'none',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: outlineActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 11,
              transition: `all var(--duration-fast)`,
            }}
            onMouseEnter={e => { if (!outlineActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { if (!outlineActive) e.currentTarget.style.background = 'none' }}
          >
            <AlignLeft size={12} strokeWidth={1.5} />
            Outline
          </button>
        </div>
      )}

      {/* File info / branch */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        color: 'var(--color-text-tertiary)',
        fontSize: 11, whiteSpace: 'nowrap',
      }}>
        {fileInfo && (
          <>
            <span style={{
              padding: '1px 6px',
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-sm)',
            }}>
              {fileInfo.language}
            </span>
            <span>{fileInfo.lines} lines</span>
            <span>{fileInfo.size}</span>
          </>
        )}
        {branch && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)' }}>
            <GitBranch size={11} strokeWidth={1.5} />
            {branch}
          </span>
        )}
      </div>
    </div>
  )
}
