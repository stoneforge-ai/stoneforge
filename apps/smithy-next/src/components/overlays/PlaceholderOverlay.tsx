import { ArrowLeft } from 'lucide-react'

interface PlaceholderOverlayProps {
  title: string
  onBack: () => void
}

export function PlaceholderOverlay({ title, onBack }: PlaceholderOverlayProps) {
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)', border: 'none',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{title}</h1>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 300, color: 'var(--color-text-tertiary)', fontSize: 14,
      }}>
        {title} view — coming soon
      </div>
    </div>
  )
}
