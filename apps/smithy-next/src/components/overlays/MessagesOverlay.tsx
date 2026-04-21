import { useState, useCallback, useEffect, useRef } from 'react'
import type { MsgChannel, MsgMessage, MsgSessionCard, MsgEntity } from './messages/message-types'
import { ChannelListView } from './messages/ChannelListView'
import { ChannelDetailView } from './messages/ChannelDetailView'

interface MessagesOverlayProps {
  channels: MsgChannel[]
  messages: MsgMessage[]
  sessionCards: MsgSessionCard[]
  entities: MsgEntity[]
  onBack: () => void
  initialChannelId?: string | null
  onChannelChange?: (channelId: string | null) => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToTask?: (taskId: string) => void
}

/**
 * Responsive breakpoints:
 *  - < 768px  (mobile):  full-page list OR full-page detail (no split)
 *  - 768–1099px (narrow): full-page list OR full-page detail (no split, detail gets back button)
 *  - >= 1100px (wide):   split-panel (sidebar + detail side-by-side)
 */

export function MessagesOverlay({
  channels: initialChannels, messages, sessionCards, entities,
  initialChannelId, onChannelChange,
  onNavigateToSession, onNavigateToTask,
}: MessagesOverlayProps) {
  const channels = initialChannels
  const [selectedChannel, setSelectedChannel] = useState<MsgChannel | null>(
    initialChannelId ? channels.find(ch => ch.id === initialChannelId) ?? null : null
  )
  const [detailWidth, setDetailWidth] = useState(76) // percentage
  const containerRef = useRef<HTMLDivElement>(null)

  // Responsive breakpoints
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  useEffect(() => {
    const check = () => setViewportWidth(window.innerWidth)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const showSplitPanel = viewportWidth >= 1100

  // Escape to close detail panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedChannel) {
        e.preventDefault()
        setSelectedChannel(null)
        onChannelChange?.(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedChannel, onChannelChange])

  const handleSelectChannel = useCallback((channel: MsgChannel) => {
    setSelectedChannel(channel)
    onChannelChange?.(channel.id)
  }, [onChannelChange])

  const handleCloseDetail = useCallback(() => {
    setSelectedChannel(null)
    onChannelChange?.(null)
  }, [onChannelChange])

  // Resize handle for detail panel
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const startX = e.clientX
    const containerWidth = container.getBoundingClientRect().width
    const startDetailWidth = detailWidth

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX
      const deltaPercent = (delta / containerWidth) * 100
      const newWidth = Math.min(85, Math.max(60, startDetailWidth + deltaPercent))
      setDetailWidth(newWidth)
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [detailWidth])

  // Get channel-specific data
  const channelMessages = selectedChannel ? messages.filter(m => m.channelId === selectedChannel.id) : []
  const channelSessionCards = selectedChannel ? sessionCards.filter(sc => sc.channelId === selectedChannel.id) : []

  // ── Mobile / Narrow: full-page detail with back button (no split) ──
  if (!showSplitPanel && selectedChannel) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <ChannelDetailView
          channel={selectedChannel}
          messages={channelMessages}
          sessionCards={channelSessionCards}
          onBack={handleCloseDetail}
          onNavigateToSession={onNavigateToSession}
          onNavigateToTask={onNavigateToTask}
          isMobile
        />
      </div>
    )
  }

  // ── No channel selected: full-width list ──
  if (!selectedChannel) {
    return (
      <ChannelListView
        channels={channels}
        entities={entities}
        onSelectChannel={handleSelectChannel}
      />
    )
  }

  // ── Wide: split-panel (sidebar + detail) ──
  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Channel list */}
      <div style={{
        width: `${100 - detailWidth}%`,
        minWidth: 220,
        height: '100%',
        overflow: 'hidden',
        transition: 'width var(--duration-normal) ease-out',
        flexShrink: 0,
      }}>
        <ChannelListView
          channels={channels}
          entities={entities}
          onSelectChannel={handleSelectChannel}
          selectedChannelId={selectedChannel.id}
          compact
        />
      </div>

      {/* Resize handle */}
      <ResizeHandle onMouseDown={handleResizeStart} />

      {/* Right: Channel detail */}
      <div style={{
        width: `${detailWidth}%`,
        height: '100%',
        overflow: 'hidden',
        animation: 'slideInRight var(--duration-normal) ease-out',
        flexShrink: 0,
      }}>
        <ChannelDetailView
          channel={selectedChannel}
          messages={channelMessages}
          sessionCards={channelSessionCards}
          onBack={handleCloseDetail}
          onNavigateToSession={onNavigateToSession}
          onNavigateToTask={onNavigateToTask}
          compact
        />
      </div>
    </div>
  )
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 4,
        cursor: 'col-resize',
        background: hovered ? 'var(--color-primary)' : 'var(--color-border)',
        transition: hovered ? 'none' : 'background var(--duration-fast)',
        flexShrink: 0,
      }}
    />
  )
}
