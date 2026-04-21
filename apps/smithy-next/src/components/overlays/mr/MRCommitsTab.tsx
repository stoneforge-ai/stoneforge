import { useState } from 'react'
import { GitCommit, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react'
import type { MRCommit } from './mr-types'
import type { DiffFile } from '../../../mock-data'
import { MRDiffViewer } from './MRDiffViewer'

interface MRCommitsTabProps {
  commits: MRCommit[]
  diffFiles: DiffFile[]
  onOpenInEditor?: (filePath: string) => void
}

export function MRCommitsTab({ commits, diffFiles, onOpenInEditor }: MRCommitsTabProps) {
  const [expandedSha, setExpandedSha] = useState<string | null>(null)

  if (commits.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        No commits yet
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {commits.map((commit, i) => {
        const isExpanded = expandedSha === commit.sha
        return (
          <div key={commit.sha} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            {/* Commit row */}
            <div
              className="mr-pad"
              onClick={() => setExpandedSha(isExpanded ? null : commit.sha)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px',
                cursor: 'pointer', transition: `background var(--duration-fast)`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {isExpanded ? <ChevronDown size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} /> : <ChevronRight size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />}

              <GitCommit size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {commit.message}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-accent)', fontSize: 11 }}>{commit.shortSha}</span>
                  <span>{commit.author}</span>
                  <span>{commit.createdAt}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, flexShrink: 0 }}>
                <span style={{ color: 'var(--color-success)' }}>+{commit.additions}</span>
                <span style={{ color: 'var(--color-danger)' }}>-{commit.deletions}</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>{commit.filesChanged} files</span>
              </div>
            </div>

            {/* Expanded: per-commit diff (showing subset of MR diff files) */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <MRDiffViewer
                  files={diffFiles.slice(0, Math.min(commit.filesChanged, diffFiles.length))}
                  viewMode="unified"
                  viewedFiles={new Set()}
                  onToggleViewed={() => {}}
                  onOpenInEditor={onOpenInEditor}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
