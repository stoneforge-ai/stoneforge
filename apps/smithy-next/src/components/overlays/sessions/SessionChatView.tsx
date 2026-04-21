import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bot, ArrowRightLeft,
  ChevronRight, ChevronDown, Check, X, Loader,
  File, FileEdit, Terminal, Search as SearchIcon,
} from 'lucide-react'
import type { SessionEvent, Session } from './session-types'

interface SessionChatViewProps {
  session: Session
  events: SessionEvent[]
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  scrollToEventId: string | null
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function SessionChatView({ session, events, selectedEventId, onSelectEvent, scrollToEventId }: SessionChatViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Scroll to event when triggered by timeline
  useEffect(() => {
    if (scrollToEventId) {
      const el = eventRefs.current.get(scrollToEventId)
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [scrollToEventId])

  // Auto-scroll for active sessions
  useEffect(() => {
    if (isAtBottom && session.status === 'active' && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [events.length, isAtBottom, session.status])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setIsAtBottom(true)
    }
  }, [])

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflow: 'auto' }}
      >
        {events.map(event => (
          <div
            key={event.id}
            ref={el => { if (el) eventRefs.current.set(event.id, el); else eventRefs.current.delete(event.id) }}
          >
            {event.type === 'session_start' && <SessionStartMsg session={session} />}
            {event.type === 'user_message' && <UserMsg event={event} />}
            {event.type === 'agent_message' && event.crossAgent && <CrossAgentMsg event={event} />}
            {event.type === 'agent_message' && !event.crossAgent && <AgentMsg event={event} />}
            {event.type === 'tool_call' && (
              <ToolBlock
                event={event}
                isSelected={event.id === selectedEventId}
                onClick={() => onSelectEvent(event.id)}
              />
            )}
            {event.type === 'system_message' && <SystemMsg event={event} />}
          </div>
        ))}
      </div>

      {/* "New messages below" pill */}
      {!isAtBottom && session.status === 'active' && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            padding: '4px 14px', fontSize: 11, fontWeight: 500,
            background: 'var(--color-primary)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-full)',
            cursor: 'pointer', boxShadow: 'var(--shadow-hover)',
            zIndex: 10,
          }}
        >
          New messages below
        </button>
      )}
    </div>
  )
}

// ── Session Start — matching DirectorPanel system message style ──
function SessionStartMsg({ session }: { session: Session }) {
  return (
    <div style={{ padding: '2px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 10px', fontStyle: 'italic' }}>
        Session started · {session.agent.name} · {session.agent.model} · {session.environment}
      </div>
    </div>
  )
}

// ── User Message — matching DirectorPanel UserMessageBubble ──
function UserMsg({ event }: { event: SessionEvent }) {
  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)',
          fontSize: 9, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 1,
        }}>Y</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {event.content}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Agent Message — matching DirectorPanel AgentMessageBlock ──
function AgentMsg({ event }: { event: SessionEvent }) {
  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
          fontSize: 9, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 1,
        }}>
          <Bot size={12} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {renderContent(event.content)}
        </div>
      </div>
    </div>
  )
}

// ── Cross-Agent Message — distinct visual treatment ──
function CrossAgentMsg({ event }: { event: SessionEvent }) {
  const ca = event.crossAgent!
  return (
    <div style={{ padding: '6px 12px' }}>
      <div style={{
        padding: '10px 14px',
        background: 'var(--color-primary-subtle)',
        borderLeft: '3px solid var(--color-primary)',
        borderRadius: '0 var(--radius-md) var(--radius-md) 0',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <ArrowRightLeft size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-muted)', color: 'var(--color-primary)',
            fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase',
          }}>
            agent message
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>{ca.fromAgent}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>{ca.toAgent}</span>
          {ca.channelName && (
            <>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--color-primary)', opacity: 0.8 }}>
                #{ca.channelName}
              </span>
            </>
          )}
        </div>
        {/* Message body */}
        <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.55, paddingLeft: 18 }}>
          {renderContent(event.content)}
        </div>
      </div>
    </div>
  )
}

// ── Tool Call — matching DirectorPanel ToolUseBlock ──
function ToolBlock({ event, isSelected, onClick }: { event: SessionEvent; isSelected: boolean; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false)

  const toolIcon: Record<string, typeof File> = { Read: File, Write: File, Edit: FileEdit, Bash: Terminal, Grep: SearchIcon, Glob: SearchIcon }
  const Icon = toolIcon[event.toolName || ''] || Terminal
  const statusColor = event.toolStatus === 'completed' ? 'var(--color-success)' : event.toolStatus === 'error' ? 'var(--color-danger)' : 'var(--color-warning)'
  const StatusIcon = event.toolStatus === 'completed' ? Check : event.toolStatus === 'error' ? X : Loader

  return (
    <div style={{ padding: '2px 12px' }}>
      <div style={{
        borderLeft: '2px solid var(--color-border)',
        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        overflow: 'hidden',
        background: isSelected ? 'var(--color-surface-active)' : undefined,
      }}>
        {/* Header */}
        <div
          onClick={() => { setExpanded(!expanded); onClick() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            cursor: 'pointer', fontSize: 12,
            transition: 'background var(--duration-fast)',
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.parentElement!.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.parentElement!.style.background = isSelected ? 'var(--color-surface-active)' : '' }}
        >
          {expanded
            ? <ChevronDown size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            : <ChevronRight size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          }
          <Icon size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{event.toolName}</span>
          <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {event.toolInput}
          </span>
          <StatusIcon
            size={12} strokeWidth={2}
            style={{
              color: statusColor, flexShrink: 0,
              ...(event.toolStatus === 'running' ? { animation: 'spin 1s linear infinite' } : {}),
            }}
          />
          {event.duration != null && (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {formatDuration(event.duration)}
            </span>
          )}
        </div>

        {/* Expanded result */}
        {expanded && event.toolResult && (
          <div style={{
            padding: '6px 10px 8px',
            background: 'var(--color-bg-secondary)',
            fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5,
            color: event.toolStatus === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
            whiteSpace: 'pre-wrap', borderTop: '1px solid var(--color-border-subtle)',
          }}>
            {event.toolResult}
          </div>
        )}
      </div>
    </div>
  )
}

// ── System Message — matching DirectorPanel SystemMessageLine ──
function SystemMsg({ event }: { event: SessionEvent }) {
  return (
    <div style={{ padding: '2px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 10px', fontStyle: 'italic' }}>
        {event.content}
      </div>
    </div>
  )
}

// ── Content renderer — simple markdown-like formatting ──
function renderContent(content: string) {
  const lines = content.split('\n')
  return lines.map((line, i) => {
    // Bold headers
    if (line.startsWith('**') && line.endsWith('**')) {
      return <div key={i} style={{ fontWeight: 600, color: 'var(--color-text)', marginTop: i > 0 ? 8 : 0 }}>{line.replace(/\*\*/g, '')}</div>
    }
    // Inline bold
    if (line.includes('**')) {
      const parts = line.split(/(\*\*.*?\*\*)/)
      return (
        <div key={i}>
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} style={{ color: 'var(--color-text)' }}>{part.slice(2, -2)}</strong>
              : <span key={j}>{renderInlineCode(part)}</span>
          )}
        </div>
      )
    }
    // List items
    if (line.startsWith('- ')) {
      return <div key={i} style={{ paddingLeft: 16, position: 'relative' }}><span style={{ position: 'absolute', left: 4 }}>·</span>{renderInlineCode(line.slice(2))}</div>
    }
    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+/)
    if (numMatch) {
      return <div key={i} style={{ paddingLeft: 20, position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: 'var(--color-text-tertiary)', fontSize: 12 }}>{numMatch[1]}.</span>{renderInlineCode(line.slice(numMatch[0].length))}</div>
    }
    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />
    return <div key={i}>{renderInlineCode(line)}</div>
  })
}

function renderInlineCode(text: string) {
  if (!text.includes('`')) return text
  const parts = text.split(/(`[^`]+`)/)
  return parts.map((part, i) =>
    part.startsWith('`') && part.endsWith('`')
      ? <code key={i} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--color-surface)', padding: '1px 5px', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-accent)' }}>{part.slice(1, -1)}</code>
      : <span key={i}>{part}</span>
  )
}
