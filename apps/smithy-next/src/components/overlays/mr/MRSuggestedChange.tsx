import { HighlightedCode } from './syntax-highlight'

interface MRSuggestedChangeProps {
  suggestion: string
}

export function MRSuggestedChange({ suggestion }: MRSuggestedChangeProps) {
  return (
    <div style={{ marginTop: 8, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px', borderBottom: '1px solid var(--color-border-subtle)',
        background: 'rgba(34,197,94,0.04)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Suggested change</span>
        <button style={{
          fontSize: 11, fontWeight: 500, color: 'var(--color-success)',
          background: 'var(--color-success-subtle)', border: 'none',
          borderRadius: 'var(--radius-sm)', padding: '2px 8px', cursor: 'pointer',
        }}>
          Apply
        </button>
      </div>
      <HighlightedCode code={suggestion} />
    </div>
  )
}
