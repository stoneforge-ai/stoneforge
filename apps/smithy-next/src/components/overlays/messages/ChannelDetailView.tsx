import { useState, useMemo, useRef, useEffect } from 'react'
import { ArrowLeft, Hash, Lock, Bot, Search, X } from 'lucide-react'
import type { MsgChannel, MsgMessage, MsgSessionCard, TimelineItem, TimelineFilterMode } from './message-types'
import { MessageBubble } from './MessageBubble'
import { SessionSummaryCard, CollapsedSessionGroup } from './SessionSummaryCard'
import { ChannelComposer } from './ChannelComposer'
import { ThreadPanel } from './ThreadPanel'
import { MembersPanel } from './MembersPanel'

interface ChannelDetailViewProps {
  channel: MsgChannel
  messages: MsgMessage[]
  sessionCards: MsgSessionCard[]
  onBack: () => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToTask?: (taskId: string) => void
  /** When true, shows close button instead of back arrow (split-panel mode) */
  compact?: boolean
  /** When true, thread panel renders as full-screen overlay instead of side panel */
  isMobile?: boolean
}

/** Build chronological timeline from messages + session cards + date separators */
function buildTimeline(
  messages: MsgMessage[],
  sessionCards: MsgSessionCard[],
  filterMode: TimelineFilterMode,
): TimelineItem[] {
  // Only root messages (no thread replies)
  const rootMessages = messages.filter(m => !m.threadId)

  const items: { timestamp: string; item: TimelineItem }[] = []

  if (filterMode !== 'sessions') {
    for (const msg of rootMessages) {
      items.push({ timestamp: msg.timestamp, item: { type: 'message', data: msg } })
    }
  }

  if (filterMode !== 'messages') {
    for (const card of sessionCards) {
      items.push({ timestamp: card.timestamp, item: { type: 'session-card', data: card } })
    }
  }

  // Sort chronologically
  items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  // Insert date separators
  const result: TimelineItem[] = []
  let lastDate = ''
  for (const { timestamp, item } of items) {
    const date = new Date(timestamp)
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    let label: string
    if (date.toDateString() === today.toDateString()) label = 'Today'
    else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday'
    else label = dateStr

    if (label !== lastDate) {
      result.push({ type: 'date-separator', date: label })
      lastDate = label
    }
    result.push(item)
  }

  return result
}

/** Group consecutive session cards from the same agent for collapsing */
function groupConsecutiveSessionCards(items: TimelineItem[]): (TimelineItem | { type: 'session-group'; cards: MsgSessionCard[] })[] {
  const result: (TimelineItem | { type: 'session-group'; cards: MsgSessionCard[] })[] = []
  let currentGroup: MsgSessionCard[] = []

  const flushGroup = () => {
    if (currentGroup.length >= 2) {
      // Check if any are errors — errors never collapse
      const errors = currentGroup.filter(c => c.status === 'error')
      const nonErrors = currentGroup.filter(c => c.status !== 'error')

      // Show errors individually, group the rest
      for (const err of errors) {
        result.push({ type: 'session-card', data: err })
      }
      if (nonErrors.length >= 2) {
        result.push({ type: 'session-group', cards: nonErrors })
      } else {
        for (const card of nonErrors) {
          result.push({ type: 'session-card', data: card })
        }
      }
    } else {
      for (const card of currentGroup) {
        result.push({ type: 'session-card', data: card })
      }
    }
    currentGroup = []
  }

  for (const item of items) {
    if (item.type === 'session-card') {
      const card = item.data
      if (currentGroup.length > 0 && currentGroup[0].agentEntity.id !== card.agentEntity.id) {
        flushGroup()
      }
      currentGroup.push(card)
    } else {
      flushGroup()
      result.push(item)
    }
  }
  flushGroup()

  return result
}

export function ChannelDetailView({
  channel, messages, sessionCards, onBack,
  onNavigateToSession, onNavigateToTask, compact, isMobile,
}: ChannelDetailViewProps) {
  const [filterMode, setFilterMode] = useState<TimelineFilterMode>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [threadMessageId, setThreadMessageId] = useState<string | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Build timeline
  const timeline = useMemo(
    () => buildTimeline(messages, sessionCards, filterMode),
    [messages, sessionCards, filterMode],
  )

  // Group consecutive session cards
  const groupedTimeline = useMemo(
    () => groupConsecutiveSessionCards(timeline),
    [timeline],
  )

  // Search filtering
  const filteredTimeline = useMemo(() => {
    if (!searchQuery.trim()) return groupedTimeline
    const q = searchQuery.toLowerCase()
    return groupedTimeline.filter(item => {
      if (item.type === 'message') {
        return item.data.content.toLowerCase().includes(q) ||
          item.data.sender.name.toLowerCase().includes(q)
      }
      if (item.type === 'session-card') {
        return item.data.taskTitle?.toLowerCase().includes(q) ||
          item.data.agentEntity.name.toLowerCase().includes(q)
      }
      if (item.type === 'session-group') {
        return item.cards.some(c =>
          c.taskTitle?.toLowerCase().includes(q) ||
          c.agentEntity.name.toLowerCase().includes(q)
        )
      }
      return true // date separators
    })
  }, [groupedTimeline, searchQuery])

  // Thread data
  const threadParent = threadMessageId ? messages.find(m => m.id === threadMessageId) : null
  const threadReplies = threadMessageId ? messages.filter(m => m.threadId === threadMessageId) : []

  // Scroll to bottom on initial load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView()
  }, [channel.id])

  // Focus search input
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const label = channel.name
  const hasAgents = channel.members.some(m => m.entityType === 'agent')

  const filterOptions: { value: TimelineFilterMode; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'messages', label: 'Messages' },
    { value: 'sessions', label: 'Sessions' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', position: 'relative' }}>
      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {!compact && (
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
          )}

          {/* Channel icon */}
          {hasAgents
            ? <Bot size={15} style={{ color: '#a78bfa' }} />
            : channel.visibility === 'private'
              ? <Lock size={15} style={{ color: 'var(--color-text-tertiary)' }} />
              : <Hash size={15} style={{ color: 'var(--color-text-tertiary)' }} />
          }

          <div style={{
            flex: 1, minWidth: 0, overflow: 'hidden',
            whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{label}</span>
            {channel.description && (
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                {channel.description}
              </span>
            )}
          </div>

          {/* Member avatars — clickable to open members panel */}
          <button
            onClick={() => { setMembersOpen(!membersOpen); if (!membersOpen) setThreadMessageId(null) }}
            style={{
              display: 'flex', alignItems: 'center',
              background: membersOpen ? 'var(--color-surface-active)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)',
              padding: '3px 6px', cursor: 'pointer',
              transition: 'background var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!membersOpen) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = membersOpen ? 'var(--color-surface-active)' : 'transparent' }}
            title="View members"
          >
            {channel.members.slice(0, 3).map((m, idx) => (
              <div key={m.id} style={{
                width: 22, height: 22, borderRadius: '50%',
                background: m.entityType === 'agent' ? 'rgba(167, 139, 250, 0.15)' : 'var(--color-surface)',
                border: '2px solid var(--color-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 600,
                color: m.entityType === 'agent' ? '#a78bfa' : 'var(--color-text-secondary)',
                marginLeft: idx > 0 ? -6 : 0,
              }}>
                {m.entityType === 'agent' ? <Bot size={10} /> : m.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
            ))}
            {channel.members.length > 3 && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 2 }}>
                +{channel.members.length - 3}
              </span>
            )}
          </button>

          {/* Search toggle */}
          <button
            onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery('') }}
            style={{
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: searchOpen ? 'var(--color-surface-active)' : 'var(--color-surface)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: searchOpen ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {searchOpen ? <X size={13} /> : <Search size={13} />}
          </button>

          {/* Close button (split-panel mode) */}
          {compact && (
            <button
              onClick={onBack}
              title="Close channel"
              style={{
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-surface)', border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter toolbar + search bar */}
        {(sessionCards.length > 0 || searchOpen) && (
          <div style={{
            padding: '6px 16px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {/* Timeline filter pills */}
            {sessionCards.length > 0 && (
              <div style={{ display: 'flex', gap: 2, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
                {filterOptions.map(opt => (
                  <button key={opt.value} onClick={() => setFilterMode(opt.value)} style={{
                    padding: '3px 10px', fontSize: 11, fontWeight: 500,
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: filterMode === opt.value ? 'var(--color-bg)' : 'transparent',
                    color: filterMode === opt.value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                    boxShadow: filterMode === opt.value ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Search input */}
            {searchOpen && (
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={13} style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--color-text-tertiary)',
                }} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
                  style={{
                    width: '100%', padding: '4px 8px 4px 28px', fontSize: 12,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                    outline: 'none', height: 26,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Message timeline */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filteredTimeline.map((item, i) => {
            if (item.type === 'date-separator') {
              return (
                <div key={`sep-${item.date}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '16px 16px 8px',
                }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                    {item.date}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
                </div>
              )
            }

            if (item.type === 'message') {
              return (
                <MessageBubble
                  key={item.data.id}
                  message={item.data}
                  onOpenThread={setThreadMessageId}
                />
              )
            }

            if (item.type === 'session-card') {
              return (
                <SessionSummaryCard
                  key={item.data.id}
                  card={item.data}
                  onNavigateToSession={onNavigateToSession}
                  onNavigateToTask={onNavigateToTask}
                />
              )
            }

            if (item.type === 'session-group') {
              return (
                <CollapsedSessionGroup
                  key={`group-${item.cards[0].id}`}
                  cards={item.cards}
                  onNavigateToSession={onNavigateToSession}
                  onNavigateToTask={onNavigateToTask}
                />
              )
            }

            return null
          })}

          {filteredTimeline.length === 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--color-text-tertiary)', fontSize: 13,
            }}>
              {searchQuery ? 'No messages match your search' : 'No messages yet. Start the discussion.'}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <ChannelComposer onSend={(content) => {
          console.log('Send message:', content, 'to channel:', channel.id)
        }} />
      </div>

      {/* Thread panel — full overlay on mobile, side panel on desktop */}
      {threadParent && !membersOpen && (
        isMobile ? (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'var(--color-bg)',
            display: 'flex', flexDirection: 'column',
          }}>
            <ThreadPanel
              parentMessage={threadParent}
              replies={threadReplies}
              onClose={() => setThreadMessageId(null)}
              onSendReply={(content) => {
                console.log('Send reply:', content, 'to thread:', threadParent.id)
              }}
              fullWidth
            />
          </div>
        ) : (
          <ThreadPanel
            parentMessage={threadParent}
            replies={threadReplies}
            onClose={() => setThreadMessageId(null)}
            onSendReply={(content) => {
              console.log('Send reply:', content, 'to thread:', threadParent.id)
            }}
          />
        )
      )}

      {/* Members panel — full overlay on mobile, side panel on desktop */}
      {membersOpen && (
        isMobile ? (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'var(--color-bg)',
            display: 'flex', flexDirection: 'column',
          }}>
            <MembersPanel
              members={channel.members}
              onClose={() => setMembersOpen(false)}
              fullWidth
            />
          </div>
        ) : (
          <MembersPanel
            members={channel.members}
            onClose={() => setMembersOpen(false)}
          />
        )
      )}
    </div>
  )
}
