import { useState } from 'react'
import { Bot, GitBranch, SquareKanban, Clock, FileText, TestTube2, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import type { MsgSessionCard } from './message-types'

interface SessionSummaryCardProps {
  card: MsgSessionCard
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToTask?: (taskId: string) => void
}

const statusColors: Record<string, string> = {
  completed: 'var(--color-success)',
  error: 'var(--color-danger)',
  running: 'var(--color-primary)',
}

const statusLabels: Record<string, string> = {
  completed: 'completed a session',
  error: 'session failed',
  running: 'working on a session',
}

export function SessionSummaryCard({ card, onNavigateToSession, onNavigateToTask }: SessionSummaryCardProps) {
  const isError = card.status === 'error'
  const isRunning = card.status === 'running'
  const borderColor = statusColors[card.status] || statusColors.completed
  const time = new Date(card.timestamp)
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      margin: '4px 16px',
      padding: '8px 12px',
      background: isError ? 'var(--color-danger-subtle)' : 'var(--color-bg-elevated)',
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 'var(--radius-sm)',
      fontSize: 12,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Bot size={13} style={{ color: borderColor, flexShrink: 0 }} />
        {isRunning && (
          <span className="session-status-pulse" style={{
            width: 6, height: 6, borderRadius: '50%',
            background: borderColor, flexShrink: 0,
          }} />
        )}
        <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          {card.agentEntity.name}
        </span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>
          {statusLabels[card.status]}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
          {timeStr}
        </span>
      </div>

      {/* Metadata row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
        flexWrap: 'wrap',
      }}>
        {/* Task chip */}
        {card.taskTitle && (
          <button
            onClick={() => card.taskId && onNavigateToTask?.(card.taskId)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 6px',
              background: 'var(--color-surface)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 11, color: 'var(--color-text-accent)',
              cursor: card.taskId ? 'pointer' : 'default',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <SquareKanban size={10} />
            {card.taskId && <span>{card.taskId}:</span>} {card.taskTitle}
          </button>
        )}

        {/* Branch */}
        {card.branch && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 6px',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11, color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-mono)',
            maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <GitBranch size={10} style={{ flexShrink: 0 }} /> {card.branch}
          </span>
        )}

        {/* Duration */}
        {card.duration && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-mono)',
          }}>
            <Clock size={10} /> {card.duration}
          </span>
        )}

        {/* Files changed */}
        {card.filesChanged != null && card.filesChanged > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, color: 'var(--color-text-tertiary)',
          }}>
            <FileText size={10} /> {card.filesChanged} file{card.filesChanged !== 1 ? 's' : ''}
          </span>
        )}

        {/* Tests added */}
        {card.testsAdded != null && card.testsAdded > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, color: 'var(--color-success)',
          }}>
            <TestTube2 size={10} /> +{card.testsAdded} test{card.testsAdded !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* View session link */}
      <button
        onClick={() => onNavigateToSession?.(card.sessionId)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          marginTop: 6, padding: '2px 0',
          background: 'none', border: 'none',
          color: 'var(--color-primary)', fontSize: 11, fontWeight: 500,
          cursor: 'pointer',
        }}
        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
      >
        {isRunning ? 'View live' : 'View session'} <ArrowRight size={11} />
      </button>
    </div>
  )
}

// ── Collapsed Session Group ──
interface CollapsedSessionGroupProps {
  cards: MsgSessionCard[]
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToTask?: (taskId: string) => void
}

export function CollapsedSessionGroup({ cards, onNavigateToSession, onNavigateToTask }: CollapsedSessionGroupProps) {
  const [expanded, setExpanded] = useState(false)
  const agent = cards[0].agentEntity
  const completed = cards.filter(c => c.status === 'completed').length
  const errored = cards.filter(c => c.status === 'error').length
  const running = cards.filter(c => c.status === 'running').length

  const parts: string[] = []
  if (completed) parts.push(`${completed} completed`)
  if (errored) parts.push(`${errored} error`)
  if (running) parts.push(`${running} running`)

  const first = new Date(cards[0].timestamp)
  const last = new Date(cards[cards.length - 1].timestamp)
  const timeRange = `${first.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} \u2013 ${last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  if (expanded) {
    return (
      <div>
        <button
          onClick={() => setExpanded(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', width: '100%',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--color-text-tertiary)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <ChevronDown size={12} />
          <Bot size={12} style={{ color: '#a78bfa' }} />
          <span>{agent.name} — {cards.length} sessions ({parts.join(', ')})</span>
          <span style={{ marginLeft: 'auto' }}>{timeRange}</span>
        </button>
        {cards.map(card => (
          <SessionSummaryCard
            key={card.id}
            card={card}
            onNavigateToSession={onNavigateToSession}
            onNavigateToTask={onNavigateToTask}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => setExpanded(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 16px', width: '100%',
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 11, color: 'var(--color-text-tertiary)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      <ChevronRight size={12} />
      <Bot size={12} style={{ color: '#a78bfa' }} />
      <span>{agent.name} — {cards.length} sessions ({parts.join(', ')})</span>
      <span style={{ marginLeft: 'auto' }}>{timeRange}</span>
    </button>
  )
}
