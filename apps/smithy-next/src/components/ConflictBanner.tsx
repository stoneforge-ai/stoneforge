import { AlertTriangle } from 'lucide-react'
import type { ConflictItem } from '../mock-data'
import { TEAM_MEMBERS } from '../mock-data'

interface ConflictBannerProps {
  conflicts: ConflictItem[]
  onKeepMine: (id: string) => void
  onUseTheirs: (id: string) => void
}

export function ConflictBanner({ conflicts, onKeepMine, onUseTheirs }: ConflictBannerProps) {
  if (conflicts.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {conflicts.map(conflict => {
        const remoteUser = TEAM_MEMBERS.find(m => m.id === conflict.remoteUserId)
        const remoteName = remoteUser?.name || 'Someone'

        return (
          <div
            key={conflict.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              background: 'var(--color-conflict-bg)',
              borderLeft: '3px solid var(--color-conflict-border)',
              borderBottom: '1px solid var(--color-border-subtle)',
              fontSize: 12,
            }}
          >
            <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--color-text)', lineHeight: 1.4 }}>
              <strong>Conflict:</strong> {remoteName} also changed the {conflict.property} of {conflict.entityId} to{' '}
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{conflict.remoteValue}</span>.
              {' '}Keep your value (<span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{conflict.localValue}</span>) or use theirs?
            </span>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onKeepMine(conflict.id)}
                style={{
                  height: 24, padding: '0 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: 11, fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg)'}
              >
                Keep Mine
              </button>
              <button
                onClick={() => onUseTheirs(conflict.id)}
                style={{
                  height: 24, padding: '0 10px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-primary)',
                  color: 'white',
                  fontSize: 11, fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Use Theirs
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
