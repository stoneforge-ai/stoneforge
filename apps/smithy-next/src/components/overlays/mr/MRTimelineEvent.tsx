import { useState } from 'react'
import { Check, X, GitCommit, Bot, Activity, ChevronDown, ChevronRight, ExternalLink, CheckCircle } from 'lucide-react'
import type { MRTimelineEvent as TimelineEvent, ReviewState } from './mr-types'
import { HighlightedCode } from './syntax-highlight'
import { currentUser } from '../../../mock-data'
import { useTeamContext } from '../../../TeamContext'

interface Props {
  event: TimelineEvent
  onNavigateToSession?: (sessionId: string) => void
}

const reviewStateLabel: Record<ReviewState, string> = {
  approved: 'approved',
  changes_requested: 'requested changes',
  commented: 'commented',
  pending: 'pending',
}

const reviewStateColor: Record<ReviewState, string> = {
  approved: 'var(--color-success)',
  changes_requested: 'var(--color-danger)',
  commented: 'var(--color-text-tertiary)',
  pending: 'var(--color-text-tertiary)',
}

const reviewStateBg: Record<ReviewState, string> = {
  approved: 'var(--color-success-subtle)',
  changes_requested: 'rgba(239,68,68,0.1)',
  commented: 'var(--color-surface)',
  pending: 'var(--color-surface)',
}

export function MRTimelineEventComponent({ event, onNavigateToSession }: Props) {
  switch (event.type) {
    case 'comment': return <CommentEvent event={event} />
    case 'review': return <ReviewEvent event={event} />
    case 'agent_review': return <AgentReviewEvent event={event} />
    case 'agent_activity': return <AgentActivityEvent event={event} onNavigateToSession={onNavigateToSession} />
    case 'commit_push': return <CommitPushEvent event={event} />
    case 'ci_status': return <CIStatusEvent event={event} />
    case 'status_change': return <StatusChangeEvent event={event} />
    case 'reviewer_added': return <CompactEvent event={event} text="was added as a reviewer" />
    default: return null
  }
}

function Avatar({ avatar, author, authorUserId, size = 24, bg }: { avatar: string; author: string; authorUserId?: string; size?: number; bg?: string }) {
  const { getUserById } = useTeamContext()
  const resolvedUser = authorUserId ? getUserById(authorUserId) : undefined
  const displayAvatar = resolvedUser?.avatar || avatar
  const isYou = author === currentUser.name || authorUserId === currentUser.id
  const isBot = author === 'Review Agent' || author === 'CI'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg || (isYou ? 'var(--color-primary-muted)' : isBot ? 'var(--color-surface-active)' : 'var(--color-surface-active)'),
      color: isYou ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
      fontSize: size * 0.4, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {isBot ? <Bot size={size * 0.5} strokeWidth={1.5} /> : displayAvatar}
    </div>
  )
}

function CommentEvent({ event }: { event: TimelineEvent }) {
  const c = event.comment!
  const { getUserById } = useTeamContext()
  const resolvedUser = event.authorUserId ? getUserById(event.authorUserId) : undefined
  const displayName = resolvedUser?.name || event.author
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 0' }}>
      <Avatar avatar={event.avatar} author={event.author} authorUserId={event.authorUserId} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{displayName}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>commented</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{event.createdAt}</span>
          {c.isResolved && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-success)' }}><CheckCircle size={11} strokeWidth={2} /> Resolved</span>}
        </div>
        {c.file && (
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
            {c.file}{c.line ? `:${c.line}` : ''}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
          {c.content}
        </div>
      </div>
    </div>
  )
}

function ReviewEvent({ event }: { event: TimelineEvent }) {
  const r = event.review!
  const [expanded, setExpanded] = useState(false)
  const { getUserById } = useTeamContext()
  const resolvedUser = event.authorUserId ? getUserById(event.authorUserId) : undefined
  const displayName = resolvedUser?.name || event.author
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 0' }}>
      <Avatar avatar={event.avatar} author={event.author} authorUserId={event.authorUserId} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{displayName}</span>
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 'var(--radius-full)', background: reviewStateBg[r.state], color: reviewStateColor[r.state], fontWeight: 500 }}>
            {reviewStateLabel[r.state]}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{event.createdAt}</span>
        </div>
        {r.body && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, padding: 12, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: r.comments?.length ? 8 : 0 }}>
            {r.body}
          </div>
        )}
        {r.comments && r.comments.length > 0 && (
          <div>
            <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {r.comments.length} inline comment{r.comments.length > 1 ? 's' : ''}
            </button>
            {expanded && r.comments.map((ic, i) => (
              <div key={i} style={{ marginTop: 6, padding: 10, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--color-border)' }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{ic.file}:{ic.line}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{ic.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentReviewEvent({ event }: { event: TimelineEvent }) {
  const ms = event.agentReview!
  const [expanded, setExpanded] = useState(true)
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 0' }}>
      <Avatar avatar="AZ" author="Review Agent" bg="rgba(59,130,246,0.15)" />
      <div style={{ flex: 1, minWidth: 0, background: 'rgba(59,130,246,0.04)', borderLeft: '3px solid var(--color-primary)', borderRadius: '0 var(--radius-md) var(--radius-md) 0', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>Review Agent</span>
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 'var(--radius-full)', background: reviewStateBg[ms.state], color: reviewStateColor[ms.state], fontWeight: 500 }}>
            {reviewStateLabel[ms.state]}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{event.createdAt}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: ms.comments?.length ? 8 : 0 }}>
          {ms.summary}
        </div>
        {ms.comments && ms.comments.length > 0 && (
          <div>
            <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {ms.comments.length} inline comment{ms.comments.length > 1 ? 's' : ''}
            </button>
            {expanded && ms.comments.map((ic, i) => (
              <div key={i} style={{ marginTop: 6, padding: 10, background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--color-primary)' }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{ic.file}:{ic.line}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{ic.content}</div>
                {ic.suggestion && (
                  <div style={{ marginTop: 8, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--color-border-subtle)', background: 'rgba(34,197,94,0.04)' }}>
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Suggested change</span>
                      <button style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-success)', background: 'var(--color-success-subtle)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '2px 8px', cursor: 'pointer' }}>Apply</button>
                    </div>
                    <HighlightedCode code={ic.suggestion} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentActivityEvent({ event, onNavigateToSession }: { event: TimelineEvent; onNavigateToSession?: (id: string) => void }) {
  const a = event.agentActivity!
  const { isTeamMode, getUserById } = useTeamContext()
  // Resolve launcher for agent actions in team mode
  const launcherUser = event.authorUserId ? getUserById(event.authorUserId) : undefined
  const isAgent = event.author.startsWith('Director') || event.author.startsWith('Agent') || event.author.startsWith('Worker')
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0' }}>
      <Avatar avatar={event.avatar} author={event.author} authorUserId={event.authorUserId} size={20} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderLeft: '2px solid var(--color-success)', paddingLeft: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{event.author}</span>
        {isTeamMode && isAgent && launcherUser && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            launched by {launcherUser.name}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{a.action}</span>
        {a.sessionId && onNavigateToSession && (
          <button onClick={() => onNavigateToSession(a.sessionId!)} style={{ fontSize: 11, color: 'var(--color-text-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0 }}>
            View session <ExternalLink size={9} strokeWidth={1.5} />
          </button>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{event.createdAt}</span>
      </div>
    </div>
  )
}

function CommitPushEvent({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false)
  const commits = event.commits!
  const { getUserById } = useTeamContext()
  const resolvedUser = event.authorUserId ? getUserById(event.authorUserId) : undefined
  const displayName = resolvedUser?.name || event.author
  const ciColor = event.commitCiStatus === 'pass' ? 'var(--color-success)' : event.commitCiStatus === 'fail' ? 'var(--color-danger)' : event.commitCiStatus === 'running' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'
  const CIStatusIcon = event.commitCiStatus === 'pass' ? Check : event.commitCiStatus === 'fail' ? X : event.commitCiStatus === 'running' ? Activity : null
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0' }}>
      <Avatar avatar={event.avatar} author={event.author} authorUserId={event.authorUserId} size={20} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GitCommit size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{displayName}</span>
          <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 12, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            pushed {commits.length} commit{commits.length > 1 ? 's' : ''}
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          {CIStatusIcon && (
            <span title={`CI ${event.commitCiStatus}`} style={{ display: 'flex', alignItems: 'center', cursor: event.commitCiRunId ? 'pointer' : 'default' }}>
              <CIStatusIcon size={12} strokeWidth={2} style={{ color: ciColor }} />
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{event.createdAt}</span>
        </div>
        {expanded && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {commits.map(c => (
              <div key={c.sha} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-accent)' }}>{c.shortSha}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{c.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CIStatusEvent({ event }: { event: TimelineEvent }) {
  const ci = event.ciStatus!
  const color = ci.status === 'pass' ? 'var(--color-success)' : ci.status === 'fail' ? 'var(--color-danger)' : ci.status === 'running' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'
  const Icon = ci.status === 'pass' ? Check : ci.status === 'fail' ? X : Activity
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={13} strokeWidth={2} style={{ color }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        <span style={{ fontWeight: 500, color }}>{ci.jobName}</span> — {ci.status === 'pass' ? 'passed' : ci.status === 'fail' ? 'failed' : ci.status === 'running' ? 'running' : 'queued'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{event.createdAt}</span>
    </div>
  )
}

function StatusChangeEvent({ event }: { event: TimelineEvent }) {
  const sc = event.statusChange!
  const { getUserById } = useTeamContext()
  const resolvedUser = event.authorUserId ? getUserById(event.authorUserId) : undefined
  const displayName = resolvedUser?.name || event.author
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <Avatar avatar={event.avatar} author={event.author} authorUserId={event.authorUserId} size={20} />
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{displayName}</span> changed status from <span style={{ fontWeight: 500 }}>{sc.from}</span> to <span style={{ fontWeight: 500, color: sc.to === 'merged' ? 'var(--color-primary)' : 'var(--color-text)' }}>{sc.to}</span>
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{event.createdAt}</span>
    </div>
  )
}

function CompactEvent({ event, text }: { event: TimelineEvent; text: string }) {
  const { getUserById } = useTeamContext()
  const resolvedUser = event.authorUserId ? getUserById(event.authorUserId) : undefined
  const displayName = resolvedUser?.name || event.author
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <Avatar avatar={event.avatar} author={event.author} authorUserId={event.authorUserId} size={20} />
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{displayName}</span> {text}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{event.createdAt}</span>
    </div>
  )
}
