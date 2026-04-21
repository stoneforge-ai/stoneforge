import { useState } from 'react'
import { Check, Circle, AlertTriangle, GitMerge, ChevronDown } from 'lucide-react'
import type { MergeRequestExtended, MergeStrategy } from './mr-types'

interface MRMergeFlowProps {
  mr: MergeRequestExtended
}

const strategyLabels: Record<MergeStrategy, string> = {
  merge: 'Merge commit',
  squash: 'Squash and merge',
  rebase: 'Rebase and merge',
}

export function MRMergeFlow({ mr }: MRMergeFlowProps) {
  const [strategy, setStrategy] = useState<MergeStrategy>(mr.mergeStrategy)
  const [autoMerge, setAutoMerge] = useState(mr.autoMergeEnabled)
  const [strategyOpen, setStrategyOpen] = useState(false)

  const allRequiredPassed = mr.mergeGates.filter(g => g.required).every(g => g.passed)
  const isMerged = mr.status === 'merged'
  const isClosed = mr.status === 'closed'

  if (isMerged) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <GitMerge size={16} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-primary)' }}>Merged</span>
      </div>
    )
  }

  if (isClosed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <GitMerge size={16} strokeWidth={2} style={{ color: 'var(--color-danger)' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-danger)' }}>Closed</span>
      </div>
    )
  }

  return (
    <div>
      {/* Merge gates checklist */}
      <div style={{ marginBottom: 12 }}>
        {mr.mergeGates.map((gate, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            {gate.passed ? (
              <Check size={13} strokeWidth={2} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            ) : (
              <Circle size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 12, color: gate.passed ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>
              {gate.label}
            </span>
            {gate.required && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>(required)</span>
            )}
          </div>
        ))}
      </div>

      {/* Conflict warning */}
      {mr.hasConflicts && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 12,
          background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <AlertTriangle size={13} strokeWidth={2} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-warning)' }}>Merge conflicts</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>This branch has conflicts with {mr.targetBranch}</div>
          </div>
        </div>
      )}

      {/* Draft state */}
      {mr.isDraft ? (
        <button style={{
          width: '100%', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', cursor: 'pointer',
          fontSize: 12, fontWeight: 500,
        }}>
          Mark ready for review
        </button>
      ) : (
        <>
          {/* Merge strategy dropdown */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <button
              onClick={() => setStrategyOpen(!strategyOpen)}
              style={{
                width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12,
              }}
            >
              {strategyLabels[strategy]}
              <ChevronDown size={12} strokeWidth={1.5} />
            </button>
            {strategyOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setStrategyOpen(false)} />
                <div style={{
                  position: 'absolute', bottom: 34, left: 0, right: 0, zIndex: 100,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--shadow-float)',
                }}>
                  {(['merge', 'squash', 'rebase'] as MergeStrategy[]).map(s => (
                    <button
                      key={s}
                      onClick={() => { setStrategy(s); setStrategyOpen(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                        background: strategy === s ? 'var(--color-surface-active)' : 'transparent',
                        border: 'none', cursor: 'pointer', fontSize: 12,
                        color: strategy === s ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      }}
                      onMouseEnter={e => { if (strategy !== s) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                      onMouseLeave={e => { if (strategy !== s) e.currentTarget.style.background = 'transparent' }}
                    >
                      {strategy === s && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />}
                      <span style={{ marginLeft: strategy === s ? 0 : 20 }}>{strategyLabels[s]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Auto-merge toggle */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoMerge}
              onChange={e => setAutoMerge(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--color-primary)' }}
            />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Enable auto-merge</div>
              {autoMerge && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Will merge when all checks pass</div>
              )}
            </div>
          </label>

          {/* Merge button */}
          <button
            disabled={!allRequiredPassed}
            style={{
              width: '100%', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: allRequiredPassed ? 'var(--color-primary)' : 'var(--color-surface)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: allRequiredPassed ? 'white' : 'var(--color-text-tertiary)',
              cursor: allRequiredPassed ? 'pointer' : 'default',
              opacity: allRequiredPassed ? 1 : 0.6,
              fontSize: 12, fontWeight: 500,
            }}
            title={allRequiredPassed ? undefined : 'Required checks must pass before merging'}
          >
            <GitMerge size={13} strokeWidth={2} />
            {strategyLabels[strategy]}
          </button>
        </>
      )}
    </div>
  )
}
