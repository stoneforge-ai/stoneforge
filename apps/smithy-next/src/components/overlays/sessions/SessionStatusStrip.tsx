import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { Session } from './session-types'

interface SessionStatusStripProps {
  sessions: Session[]
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function SessionStatusStrip({ sessions }: SessionStatusStripProps) {
  const activeCount = sessions.filter(s => s.status === 'active').length
  const errorCount = sessions.filter(s => s.status === 'error').length
  const completedCount = sessions.filter(s => s.status === 'completed').length
  const totalIn = sessions.reduce((sum, s) => sum + s.tokensIn, 0)
  const totalOut = sessions.reduce((sum, s) => sum + s.tokensOut, 0)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      padding: '0 16px',
      height: 36,
      borderBottom: '1px solid var(--color-border-subtle)',
      flexShrink: 0,
    }}>
      {/* Active */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)',
      }}>
        <span className="session-status-pulse" style={{
          width: 8, height: 8, borderRadius: '50%',
          background: activeCount > 0 ? 'var(--color-success)' : 'var(--color-text-quaternary)',
          flexShrink: 0,
        }} />
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{activeCount}</span>
        active
      </div>

      {/* Errors — only show if > 0 */}
      {errorCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--color-danger)',
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{errorCount}</span>
          error{errorCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Completed */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--color-text-quaternary)',
          flexShrink: 0,
        }} />
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{completedCount}</span>
        completed
      </div>

      <div style={{ flex: 1 }} />

      {/* Total tokens */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <ArrowDownLeft size={10} />{formatTokens(totalIn)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <ArrowUpRight size={10} />{formatTokens(totalOut)}
        </span>
      </div>
    </div>
  )
}
