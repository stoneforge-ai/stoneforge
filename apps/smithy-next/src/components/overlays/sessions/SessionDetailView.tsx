import { useState, useMemo, useCallback, useRef } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import type { Session, SessionEventType } from './session-types'
import { SessionDetailHeader } from './SessionDetailHeader'
import { SessionTimeline } from './SessionTimeline'
import { SessionEventList } from './SessionEventList'
import { SessionEventDetail } from './SessionEventDetail'
import { SessionAgentDetail } from './SessionAgentDetail'
import { SessionChatView } from './SessionChatView'
import { SessionMessageInput } from './SessionMessageInput'

interface SessionDetailViewProps {
  session: Session
  sessionIds: string[]
  allSessions: Session[]
  onBack: () => void
  onNavigateToSession: (sessionId: string) => void
  initialEventId?: string | null
  onEventChange?: (eventId: string | null) => void
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onResumeSession?: () => void
  /** When true, hide prev/next navigation (list handles it) */
  compact?: boolean
}

type ViewMode = 'chat' | 'transcript'

const eventTypeOptions: { value: SessionEventType | 'all'; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'user_message', label: 'User messages' },
  { value: 'agent_message', label: 'Agent messages' },
  { value: 'tool_call', label: 'Tool calls' },
  { value: 'system_message', label: 'System messages' },
]

export function SessionDetailView({
  session, sessionIds, allSessions, onBack, onNavigateToSession,
  initialEventId, onEventChange, onNavigateToAgent, onNavigateToTask, onNavigateToMR, onNavigateToWhiteboard, onResumeSession,
  compact,
}: SessionDetailViewProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null)
  const [rightPanel, setRightPanel] = useState<'event' | 'agent' | null>(initialEventId ? 'event' : null)
  const [panelWidth, setPanelWidth] = useState(380)
  const [eventTypeFilter, setEventTypeFilter] = useState<SessionEventType | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [scrollToEventId, setScrollToEventId] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>('chat')

  // Prev/next session navigation (hidden in compact mode)
  const currentIndex = sessionIds.indexOf(session.id)
  const prevId = currentIndex > 0 ? sessionIds[currentIndex - 1] : null
  const nextId = currentIndex < sessionIds.length - 1 ? sessionIds[currentIndex + 1] : null

  // Filter events
  const filteredEvents = useMemo(() => {
    let events = session.events
    if (eventTypeFilter !== 'all') {
      events = events.filter(e => e.type === eventTypeFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      events = events.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        (e.toolName?.toLowerCase().includes(q)) ||
        (e.toolResult?.toLowerCase().includes(q))
      )
    }
    return events
  }, [session.events, eventTypeFilter, searchQuery])

  const totalDuration = useMemo(() => {
    const events = session.events
    if (events.length === 0) return 0
    return Math.max(...events.map(e => e.timestamp + (e.duration ?? 0)))
  }, [session.events])

  const handleSelectEvent = useCallback((eventId: string) => {
    setSelectedEventId(eventId)
    if (viewMode === 'transcript') {
      setRightPanel('event')
    }
    setScrollToEventId(eventId)
    onEventChange?.(eventId)
    setTimeout(() => setScrollToEventId(null), 100)
  }, [onEventChange, viewMode])

  const handleTimelineSelect = useCallback((eventId: string) => {
    setSelectedEventId(eventId)
    if (viewMode === 'transcript') {
      setRightPanel('event')
    }
    setScrollToEventId(eventId)
    onEventChange?.(eventId)
    setTimeout(() => setScrollToEventId(null), 100)
  }, [onEventChange, viewMode])

  const handleClosePanel = useCallback(() => {
    setRightPanel(null)
    setSelectedEventId(null)
    onEventChange?.(null)
  }, [onEventChange])

  const handleOpenAgentPanel = useCallback(() => {
    setRightPanel('agent')
    setSelectedEventId(null)
  }, [])

  const handleSendMessage = useCallback((message: string) => {
    // Mock: in a real app this would send to the agent session
    // For now we can just log it
    console.log('Send message to session:', session.id, message)
  }, [session.id])

  const selectedEvent = selectedEventId ? session.events.find(e => e.id === selectedEventId) : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <SessionDetailHeader
        session={session}
        onBack={onBack}
        onPrev={!compact && prevId ? () => onNavigateToSession(prevId) : undefined}
        onNext={!compact && nextId ? () => onNavigateToSession(nextId) : undefined}
        hasPrev={!compact && !!prevId}
        hasNext={!compact && !!nextId}
        onOpenAgentPanel={handleOpenAgentPanel}
        onResumeSession={onResumeSession}
        onNavigateToTask={onNavigateToTask}
        onNavigateToMR={onNavigateToMR}
        onNavigateToAgent={onNavigateToAgent}
        onNavigateToWhiteboard={onNavigateToWhiteboard}
      />

      {/* Timeline */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <SessionTimeline
          events={session.events}
          selectedEventId={selectedEventId}
          onSelectEvent={handleTimelineSelect}
          totalDuration={totalDuration}
        />
      </div>

      {/* Tabs + filter + search (below timeline) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        {/* View mode tabs */}
        <button
          onClick={() => setViewMode('transcript')}
          style={{
            fontSize: 12, fontWeight: 500, padding: '8px 14px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: viewMode === 'transcript' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            borderBottom: viewMode === 'transcript' ? '2px solid var(--color-primary)' : '2px solid transparent',
            transition: 'all var(--duration-fast)',
          }}
        >
          Transcript
        </button>
        <button
          onClick={() => setViewMode('chat')}
          style={{
            fontSize: 12, fontWeight: 500, padding: '8px 14px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: viewMode === 'chat' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            borderBottom: viewMode === 'chat' ? '2px solid var(--color-primary)' : '2px solid transparent',
            transition: 'all var(--duration-fast)',
          }}
        >
          Chat
        </button>

        {/* Event type filter (transcript mode only) */}
        {viewMode === 'transcript' && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px',
                fontSize: 12,
                background: 'none',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {eventTypeOptions.find(o => o.value === eventTypeFilter)?.label}
              <ChevronDown size={12} />
            </button>
            {filterOpen && (
              <div style={{
                position: 'absolute', left: 0, top: '100%', marginTop: 4,
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
                zIndex: 'var(--z-dropdown)', minWidth: 160, padding: 4,
              }}>
                {eventTypeOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setEventTypeFilter(opt.value); setFilterOpen(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 10px', fontSize: 12,
                      background: eventTypeFilter === opt.value ? 'var(--color-primary-subtle)' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: eventTypeFilter === opt.value ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    onMouseEnter={e => {
                      if (eventTypeFilter !== opt.value) e.currentTarget.style.background = 'var(--color-surface-hover)'
                    }}
                    onMouseLeave={e => {
                      if (eventTypeFilter !== opt.value) e.currentTarget.style.background = 'none'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Search */}
        {searchOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              style={{
                width: 200,
                padding: '4px 8px',
                fontSize: 12,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-tertiary)', padding: 4, display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', padding: 4,
              borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <Search size={16} />
          </button>
        )}
      </div>

      {/* Main area */}
      <div className="session-detail-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {viewMode === 'chat' ? (
          /* Chat view */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SessionChatView
              session={session}
              events={filteredEvents}
              selectedEventId={selectedEventId}
              onSelectEvent={handleSelectEvent}
              scrollToEventId={scrollToEventId}
            />
            <SessionMessageInput
              sessionStatus={session.status}
              onSendMessage={handleSendMessage}
              onResumeSession={onResumeSession}
            />
          </div>
        ) : (
          /* Transcript view (original) */
          <>
            <SessionEventList
              events={filteredEvents}
              selectedEventId={selectedEventId}
              onSelectEvent={handleSelectEvent}
              scrollToEventId={scrollToEventId}
            />

            {/* Right panel with drag-resize handle */}
            {(rightPanel === 'event' && selectedEvent) || rightPanel === 'agent' ? (
              <ResizablePanel width={panelWidth} onWidthChange={setPanelWidth}>
                {rightPanel === 'event' && selectedEvent && (
                  <SessionEventDetail event={selectedEvent} onClose={handleClosePanel} />
                )}
                {rightPanel === 'agent' && (
                  <SessionAgentDetail
                    agent={session.agent}
                    allSessions={allSessions}
                    onClose={handleClosePanel}
                    onNavigateToAgent={onNavigateToAgent}
                    onNavigateToSession={onNavigateToSession}
                  />
                )}
              </ResizablePanel>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function ResizablePanel({ width, onWidthChange, children }: { width: number; onWidthChange: (w: number) => void; children: React.ReactNode }) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const [hovered, setHovered] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      const newWidth = Math.max(280, Math.min(700, startWidth.current + delta))
      onWidthChange(newWidth)
    }
    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width, onWidthChange])

  return (
    <div style={{ position: 'relative', display: 'flex', flexShrink: 0, animation: 'slideIn var(--duration-normal) ease-out' }}>
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: hovered || dragging.current ? 'var(--color-primary)' : 'var(--color-border)',
          transition: hovered ? 'none' : 'background var(--duration-fast)',
          flexShrink: 0,
        }}
      />
      <div style={{ width: width - 4, minWidth: 0, height: '100%', display: 'flex', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}
