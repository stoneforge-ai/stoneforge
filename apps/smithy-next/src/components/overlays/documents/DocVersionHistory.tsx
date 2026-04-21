import { X, Eye, Clock } from 'lucide-react'
import type { DocumentVersion } from './doc-types'

interface DocVersionHistoryProps {
  documentTitle: string
  versions: DocumentVersion[]
  viewingVersion: number | null
  onClose: () => void
  onViewVersion: (version: DocumentVersion | null) => void
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

export function DocVersionHistory({ versions, viewingVersion, onClose, onViewVersion }: DocVersionHistoryProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      borderLeft: '1px solid var(--color-border-subtle)',
      background: 'var(--color-bg-secondary)', width: 280, flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 44,
        borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
      }}>
        <Clock size={14} color="var(--color-text-secondary)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          Version History
        </span>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 'var(--radius-sm)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <X size={14} />
        </button>
      </div>

      {/* Version list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {versions.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            No version history available
          </div>
        ) : (
          versions.map((v, i) => {
            const isCurrent = i === 0
            const isViewing = viewingVersion === v.version

            return (
              <div
                key={v.version}
                style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  borderLeft: isViewing ? '2px solid var(--color-warning)' : isCurrent ? '2px solid var(--color-primary)' : '2px solid var(--color-border-subtle)',
                  marginBottom: 4,
                  background: isViewing ? 'var(--color-warning-subtle)' : 'transparent',
                  cursor: isCurrent ? 'default' : 'pointer',
                  transition: 'background var(--duration-fast)',
                }}
                onClick={() => {
                  if (!isCurrent) onViewVersion(isViewing ? null : v)
                }}
                onMouseEnter={e => {
                  if (!isCurrent && !isViewing) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'
                }}
                onMouseLeave={e => {
                  if (!isViewing) (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: isViewing ? 'var(--color-warning)' : isCurrent ? 'var(--color-primary)' : 'var(--color-text)',
                  }}>
                    v{v.version}
                  </span>
                  {isCurrent && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '1px 5px',
                      borderRadius: 'var(--radius-full)', background: 'var(--color-primary-subtle)',
                      color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      Current
                    </span>
                  )}
                  {isViewing && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '1px 5px',
                      borderRadius: 'var(--radius-full)', background: 'var(--color-warning-subtle)',
                      color: 'var(--color-warning)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      Viewing
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{timeAgo(v.updatedAt)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {v.updatedBy}
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {v.contentPreview}
                </div>
                {!isCurrent && !isViewing && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 6, fontSize: 11, color: 'var(--color-text-tertiary)',
                  }}>
                    <Eye size={10} />
                    Click to view
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
