import { Plus } from 'lucide-react'
import type { WhiteboardEntry } from '../../../mock-data'

interface WhiteboardTabBarProps {
  whiteboards: WhiteboardEntry[]
  activeWhiteboardId: string | null
  onWhiteboardChange: (whiteboardId: string) => void
  onNewWhiteboard: () => void
}

export function WhiteboardTabBar({
  whiteboards, activeWhiteboardId, onWhiteboardChange, onNewWhiteboard,
}: WhiteboardTabBarProps) {
  return (
    <div style={{
      height: 36, minHeight: 36, display: 'flex', alignItems: 'stretch',
      padding: '0 8px', borderBottom: '1px solid var(--color-border-subtle)',
      background: 'var(--color-bg-secondary)', gap: 0,
    }}>
      {whiteboards.map(wb => {
        const isActive = wb.id === activeWhiteboardId
        return (
          <button
            key={wb.id}
            onClick={() => onWhiteboardChange(wb.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 12px', background: 'none', border: 'none',
              borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 500 : 400,
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
          >
            {wb.title}
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
              {wb.createdAt}
            </span>
          </button>
        )
      })}

      {/* New whiteboard button */}
      <button
        onClick={onNewWhiteboard}
        title="New whiteboard"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, padding: 0, background: 'none', border: 'none',
          borderBottom: '2px solid transparent',
          color: 'var(--color-text-tertiary)', cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
      >
        <Plus size={14} strokeWidth={1.5} />
      </button>
    </div>
  )
}
