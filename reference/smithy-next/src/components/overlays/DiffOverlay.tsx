import { ArrowLeft, Plus, Minus, GitBranch, Copy } from 'lucide-react'
import { mockDiffFiles, mockTasks, type DiffFile } from '../../mock-data'
import { FilesChangedView } from '../shared/FilesChangedView'

interface DiffOverlayProps {
  context: { taskId: string; branch: string } | null
  onBack: () => void
  onOpenInEditor?: (filePath: string) => void
}

export function DiffOverlay({ context, onBack, onOpenInEditor }: DiffOverlayProps) {
  const task = context ? mockTasks.find(t => t.id === context.taskId) : null
  const branch = context?.branch || 'unknown'
  const files = mockDiffFiles
  const totalAdded = files.reduce((s, f) => s + f.additions, 0)
  const totalRemoved = files.reduce((s, f) => s + f.deletions, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button onClick={onBack} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>Changes</h1>
          {task && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>{task.id}</span>
          )}
        </div>

        {/* Branch + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitBranch size={12} strokeWidth={1.5} />
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: 11 }}>{branch}</span>
            → <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: 11 }}>main</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={11} strokeWidth={2} style={{ color: 'var(--color-success)' }} />
            <span style={{ color: 'var(--color-success)' }}>{totalAdded}</span>
            <Minus size={11} strokeWidth={2} style={{ color: 'var(--color-danger)', marginLeft: 4 }} />
            <span style={{ color: 'var(--color-danger)' }}>{totalRemoved}</span>
          </span>
          <span>{files.length} files</span>
          {task?.title && (
            <span style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
          )}
        </div>
      </div>

      {/* Diff content — shared component, no commenting */}
      <FilesChangedView files={files} onOpenInEditor={onOpenInEditor} />
    </div>
  )
}
