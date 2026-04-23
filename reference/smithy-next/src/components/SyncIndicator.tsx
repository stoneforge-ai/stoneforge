import { Loader2 } from 'lucide-react'
import type { SyncStatus } from '../mock-data'

interface SyncIndicatorProps {
  status: SyncStatus
}

const config: Record<SyncStatus, { label: string; color: string; spinning?: boolean }> = {
  synced: { label: 'Synced', color: 'var(--color-sync-active)' },
  syncing: { label: 'Syncing...', color: 'var(--color-sync-syncing)', spinning: true },
  offline: { label: 'Offline', color: 'var(--color-sync-offline)' },
  error: { label: 'Sync error', color: 'var(--color-sync-error)' },
}

export function SyncIndicator({ status }: SyncIndicatorProps) {
  const { label, color, spinning } = config[status]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        fontSize: 11,
        color,
        fontWeight: 500,
      }}
    >
      {spinning ? (
        <Loader2 size={10} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <div style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }} />
      )}
      {label}
    </div>
  )
}
