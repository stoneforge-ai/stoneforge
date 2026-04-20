import { ArrowLeft, X, GitPullRequest, CircleAlert, CheckSquare } from 'lucide-react'
import type { EditorNavigationContext } from './editor-mock-data'

interface Props {
  context: EditorNavigationContext
  onBack: () => void
  onDismiss: () => void
}

const sourceIcons: Record<string, typeof GitPullRequest> = {
  mr: GitPullRequest,
  ci: CircleAlert,
  task: CheckSquare,
}

const sourceLabels: Record<string, string> = {
  mr: 'MR',
  ci: 'CI Run',
  task: 'Task',
}

export function EditorContextBar({ context, onBack, onDismiss }: Props) {
  const Icon = sourceIcons[context.type] || CheckSquare
  const label = sourceLabels[context.type] || context.type

  return (
    <div style={{
      height: 36, minHeight: 36,
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 12px',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border-subtle)',
      fontSize: 12,
    }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none',
          color: 'var(--color-text-accent)',
          cursor: 'pointer',
          fontSize: 12,
          padding: '2px 6px',
          borderRadius: 'var(--radius-sm)',
          transition: `background var(--duration-fast)`,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-subtle)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <ArrowLeft size={12} strokeWidth={1.5} />
        <span>Back to {label}</span>
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        color: 'var(--color-text-secondary)',
      }}>
        <Icon size={12} strokeWidth={1.5} />
        {context.sourceId && (
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
            {context.sourceId}
          </span>
        )}
        {context.sourceLabel && (
          <>
            <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              &ldquo;{context.sourceLabel}&rdquo;
            </span>
          </>
        )}
        {context.branch && (
          <>
            <span style={{ color: 'var(--color-text-tertiary)' }}>&middot;</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
              {context.branch}
            </span>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={onDismiss}
        title="Dismiss context"
        style={{
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          transition: `all var(--duration-fast)`,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--color-surface-hover)'
          e.currentTarget.style.color = 'var(--color-text-secondary)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'none'
          e.currentTarget.style.color = 'var(--color-text-tertiary)'
        }}
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </div>
  )
}
