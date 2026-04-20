import { ArrowLeft, GitMerge, Bot, ExternalLink, File, MessageSquare, GitCommit, ShieldCheck, Eye, Github } from 'lucide-react'
import type { MergeRequestExtended, MRDetailTab, MRTimelineEvent, MRCommit, MRCheck } from './mr-types'

interface MRHeaderProps {
  mr: MergeRequestExtended
  activeTab: MRDetailTab
  onTabChange: (tab: MRDetailTab) => void
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToAgents?: () => void
  onNavigateToPreview?: (mrId: string) => void
  timeline: MRTimelineEvent[]
  commits: MRCommit[]
  checks: MRCheck[]
  diffFileCount: number
}

export function MRHeader({ mr, activeTab, onTabChange, onBack, onNavigateToTask, onNavigateToSession, onNavigateToAgents, onNavigateToPreview, timeline, commits, checks, diffFileCount }: MRHeaderProps) {
  const statusColor = mr.status === 'open'
    ? (mr.isDraft ? 'var(--color-warning)' : 'var(--color-success)')
    : mr.status === 'merged' ? 'var(--color-primary)' : 'var(--color-danger)'
  const statusBg = mr.status === 'open'
    ? (mr.isDraft ? 'rgba(245,158,11,0.1)' : 'var(--color-success-subtle)')
    : mr.status === 'merged' ? 'var(--color-primary-subtle)' : 'rgba(239,68,68,0.1)'
  const statusLabel = mr.isDraft ? 'Draft' : mr.status === 'open' ? 'Open' : mr.status === 'merged' ? 'Merged' : 'Closed'

  const tabs: { key: MRDetailTab; label: string; icon: typeof File; count: number }[] = [
    { key: 'conversation', label: 'Conversation', icon: MessageSquare, count: timeline.length },
    { key: 'commits', label: 'Commits', icon: GitCommit, count: commits.length },
    { key: 'checks', label: 'Checks', icon: ShieldCheck, count: checks.length },
    { key: 'files', label: 'Files Changed', icon: File, count: diffFileCount },
  ]

  return (
    <div className="mr-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
      {/* Top row: back + ID + status + links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button onClick={onBack} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{mr.id}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: statusBg, color: statusColor, fontWeight: 500 }}>
          <GitMerge size={11} strokeWidth={2} />
          {statusLabel}
        </span>

        <div style={{ flex: 1 }} />

        {/* Task ID link (always visible, full text) */}
        {mr.linkedTaskId && (
          <button
            onClick={() => onNavigateToTask?.(mr.linkedTaskId!)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-accent)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
          >
            {mr.linkedTaskId}
            <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
          </button>
        )}

        {/* Agent link (label hidden on mobile, icon always visible) */}
        {mr.createdByAgent && (
          <button
            onClick={() => onNavigateToAgents?.()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
          >
            <Bot size={12} strokeWidth={1.5} />
            <span className="mr-header-links">{mr.createdByAgent.replace('Director ', 'Agent ')}</span>
          </button>
        )}

        {/* View Preview button */}
        {mr.previewUrl && mr.previewStatus === 'ready' && (
          <button
            onClick={() => onNavigateToPreview?.(mr.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500,
              padding: '3px 10px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)', border: 'none',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              transition: `all var(--duration-fast)`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <Eye size={12} strokeWidth={1.5} />
            <span className="mr-header-links">Preview</span>
          </button>
        )}

        {/* View on GitHub */}
        <a
          href={`https://github.com/stoneforge/stoneforge/pull/${mr.id.replace('MR-', '')}`}
          target="_blank"
          rel="noopener"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500,
            padding: '3px 10px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', border: 'none',
            color: 'var(--color-text-secondary)', cursor: 'pointer', textDecoration: 'none',
            transition: `all var(--duration-fast)`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
        >
          <Github size={12} strokeWidth={1.5} />
          <span className="mr-header-links">GitHub</span>
        </a>
      </div>

      {/* Title */}
      <h1 className="mr-header-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>{mr.title}</h1>

      {/* Meta row */}
      <div className="mr-header-meta" style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--color-text-tertiary)', flexWrap: 'wrap', marginBottom: 14 }}>
        <span>
          {mr.author} wants to merge{' '}
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: 11 }}>{mr.branch}</span>
          {' '}into{' '}
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: 11 }}>{mr.targetBranch}</span>
        </span>
        {mr.additions + mr.deletions > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--color-success)' }}>+{mr.additions}</span>
            <span style={{ color: 'var(--color-danger)' }}>-{mr.deletions}</span>
          </span>
        )}
        {mr.filesChanged > 0 && <span>{mr.filesChanged} files</span>}
        <span>{mr.createdAt}</span>
      </div>

      {/* Tabs — labels hidden on mobile, icons always visible */}
      <div style={{ display: 'flex', gap: 2 }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              style={{
                padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: isActive ? 'var(--color-surface-active)' : 'transparent',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: `all var(--duration-fast)`,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={13} strokeWidth={1.5} />
              <span className="mr-tab-label">{tab.label}</span>
              <span style={{ fontSize: 10, color: isActive ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: 'var(--radius-full)', padding: '0px 5px', minWidth: 16, textAlign: 'center' }}>{tab.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
