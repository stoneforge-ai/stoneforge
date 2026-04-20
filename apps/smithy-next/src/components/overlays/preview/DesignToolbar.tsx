import { MousePointer2, Pencil, Square, ArrowUpRight, MessageCircle } from 'lucide-react'
import { Tooltip } from '../../Tooltip'
import type { DesignAnnotationTool } from '../../../mock-data'

interface DesignToolbarProps {
  activeTool: DesignAnnotationTool
  onToolChange: (tool: DesignAnnotationTool) => void
}

const tools: { id: DesignAnnotationTool; icon: typeof Pencil; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'comment', icon: MessageCircle, label: 'Comment' },
  { id: 'draw', icon: Pencil, label: 'Draw' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
]

export function DesignToolbar({ activeTool, onToolChange }: DesignToolbarProps) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 2, padding: 4,
      background: 'var(--color-bg)', border: '1px solid var(--color-border)',
      borderRadius: 20, boxShadow: 'var(--shadow-lg)', zIndex: 20,
    }}>
      {tools.map(tool => {
        const isActive = tool.id === activeTool
        const Icon = tool.icon
        return (
          <Tooltip key={tool.id} label={tool.label} placement="bottom">
            <button
              onClick={() => onToolChange(tool.id)}
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'var(--color-primary)' : 'none',
                border: 'none', borderRadius: 16,
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer', transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-primary)' : 'none' }}
            >
              <Icon size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
