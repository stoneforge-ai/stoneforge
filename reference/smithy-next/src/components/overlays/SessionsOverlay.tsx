import { useState, useCallback, useEffect, useRef } from 'react'
import type { Session, SessionEvent, ToolName } from './sessions/session-types'
import { SessionListView } from './sessions/SessionListView'
import { SessionDetailView } from './sessions/SessionDetailView'
import { CreateSessionDialog } from './sessions/CreateSessionDialog'

// ── Simulated live messages for active sessions ──
const simulatedMessages: { type: SessionEvent['type']; content: string; toolName?: ToolName; toolInput?: string; toolResult?: string; toolStatus?: 'completed' | 'error' }[] = [
  { type: 'tool_call', content: 'Reading file', toolName: 'Read', toolInput: 'src/auth/token-manager.ts', toolResult: 'Token manager loaded — 342 lines, exports TokenManager class with refresh, validate, revoke methods', toolStatus: 'completed' },
  { type: 'agent_message', content: 'The token manager already handles refresh flows. I need to add OIDC discovery support and update the session module to use the new provider.' },
  { type: 'tool_call', content: 'Writing OIDC discovery', toolName: 'Write', toolInput: 'src/auth/oidc-discovery.ts', toolResult: 'Created oidc-discovery.ts — 128 lines with fetchConfiguration(), validateIssuer(), and caching', toolStatus: 'completed' },
  { type: 'tool_call', content: 'Searching for session references', toolName: 'Grep', toolInput: 'createSession|startSession', toolResult: 'Found 8 matches across 4 files:\n  src/auth/session.ts:23\n  src/auth/session.ts:67\n  src/api/routes/auth.ts:45\n  tests/auth.test.ts:12', toolStatus: 'completed' },
  { type: 'agent_message', content: 'Found the session creation points. Now updating the session module to integrate OIDC token validation before creating sessions.' },
  { type: 'tool_call', content: 'Editing session module', toolName: 'Edit', toolInput: 'src/auth/session.ts', toolResult: 'Added OIDC token validation in createSession(), updated imports, added OIDCSessionOptions type', toolStatus: 'completed' },
  { type: 'tool_call', content: 'Running test suite', toolName: 'Bash', toolInput: 'pnpm test -- --filter auth', toolResult: '✓ 12 tests passed\n✓ 3 snapshots updated\n  Duration: 4.2s', toolStatus: 'completed' },
  { type: 'agent_message', content: 'All auth tests passing. The OIDC discovery and session integration is complete. Moving on to the migration subtask.' },
  { type: 'tool_call', content: 'Reading migration config', toolName: 'Read', toolInput: 'src/config/auth.ts', toolResult: 'Auth config loaded — contains provider settings, token TTLs, and feature flags', toolStatus: 'completed' },
  { type: 'tool_call', content: 'Scanning for legacy auth usage', toolName: 'Glob', toolInput: 'src/**/*.ts', toolResult: 'Found 47 TypeScript files in src/', toolStatus: 'completed' },
  { type: 'agent_message', content: 'Identified 3 files still using the legacy auth provider. Creating a migration plan to update them incrementally.' },
  { type: 'tool_call', content: 'Writing migration script', toolName: 'Write', toolInput: 'scripts/migrate-auth.ts', toolResult: 'Created migration script — handles provider swap, token format conversion, and rollback', toolStatus: 'completed' },
]

interface SessionsOverlayProps {
  sessions: Session[]
  onBack: () => void
  initialSessionId?: string | null
  initialEventId?: string | null
  onSessionChange?: (sessionId: string | null, eventId: string | null) => void
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onResumeSession?: (session: Session) => void
  agents?: Array<{ id: string; name: string; model: string; status: string }>
  tasks?: Array<{ id: string; title: string }>
  onCreateSession?: (config: { agentId: string; agentName: string; taskId?: string; initialMessage?: string }) => void
}

export function SessionsOverlay({
  sessions, onBack,
  initialSessionId, initialEventId, onSessionChange,
  onNavigateToAgent, onNavigateToTask, onNavigateToMR, onNavigateToWhiteboard, onResumeSession,
  agents, tasks, onCreateSession,
}: SessionsOverlayProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  // Live sessions with simulated updates for active ones
  const [liveSessions, setLiveSessions] = useState<Session[]>(sessions)
  const simIndexRef = useRef<Map<string, number>>(new Map())

  // Initialize each active session at a different offset so they show different messages
  useEffect(() => {
    const active = sessions.filter(s => s.status === 'active')
    active.forEach((s, i) => {
      if (!simIndexRef.current.has(s.id)) simIndexRef.current.set(s.id, i * 4)
    })
  }, [sessions])

  useEffect(() => {
    const activeSessions = liveSessions.filter(s => s.status === 'active')
    if (activeSessions.length === 0) return

    const interval = setInterval(() => {
      setLiveSessions(prev => prev.map(session => {
        if (session.status !== 'active') return session

        // Get next simulated message index for this session
        const idx = simIndexRef.current.get(session.id) ?? 0
        const msg = simulatedMessages[idx % simulatedMessages.length]
        simIndexRef.current.set(session.id, idx + 1)

        const lastEvent = session.events[session.events.length - 1]
        const nextTimestamp = (lastEvent?.timestamp ?? 0) + 3000 + Math.random() * 5000

        const newEvent: SessionEvent = {
          id: `ev-sim-${session.id}-${Date.now()}-${idx}`,
          type: msg.type,
          title: msg.content.slice(0, 60),
          content: msg.content,
          timestamp: nextTimestamp,
          duration: msg.toolName ? 1000 + Math.random() * 4000 : undefined,
          toolName: msg.toolName,
          toolInput: msg.toolInput,
          toolResult: msg.toolResult,
          toolStatus: msg.toolStatus,
          tokensIn: 800 + Math.floor(Math.random() * 3000),
          tokensOut: msg.type === 'agent_message' ? 200 + Math.floor(Math.random() * 1000) : 0,
        }

        return {
          ...session,
          events: [...session.events, newEvent],
          tokensIn: session.tokensIn + (newEvent.tokensIn ?? 0),
          tokensOut: session.tokensOut + (newEvent.tokensOut ?? 0),
        }
      }))
    }, 4000) // New message every 4 seconds

    return () => clearInterval(interval)
  }, [liveSessions.filter(s => s.status === 'active').length]) // Re-run if active count changes

  const [selectedSession, setSelectedSession] = useState<Session | null>(
    initialSessionId ? liveSessions.find(s => s.id === initialSessionId) ?? null : null
  )

  // Keep selectedSession in sync with liveSessions updates
  useEffect(() => {
    if (selectedSession) {
      const updated = liveSessions.find(s => s.id === selectedSession.id)
      if (updated && updated !== selectedSession) setSelectedSession(updated)
    }
  }, [liveSessions, selectedSession])
  const [detailWidth, setDetailWidth] = useState(65) // percentage
  const containerRef = useRef<HTMLDivElement>(null)

  // Escape to close detail panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedSession) {
        e.preventDefault()
        setSelectedSession(null)
        onSessionChange?.(null, null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedSession, onSessionChange])

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(session)
    onSessionChange?.(session.id, null)
  }, [onSessionChange])

  const handleCloseDetail = useCallback(() => {
    setSelectedSession(null)
    onSessionChange?.(null, null)
  }, [onSessionChange])

  const handleEventChange = useCallback((eventId: string | null) => {
    if (selectedSession) {
      onSessionChange?.(selectedSession.id, eventId)
    }
  }, [selectedSession, onSessionChange])

  const handleNavigateToSession = useCallback((sessionId: string) => {
    const s = liveSessions.find(ss => ss.id === sessionId)
    if (s) {
      setSelectedSession(s)
      onSessionChange?.(s.id, null)
    }
  }, [liveSessions, onSessionChange])

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
      const newWidth = Math.min(80, Math.max(45, startDetailWidth + deltaPercent))
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

  // Check if we should use mobile layout (no split)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Mobile: full-page detail with back button
  if (isMobile && selectedSession) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <SessionDetailView
          session={selectedSession}
          sessionIds={liveSessions.map(s => s.id)}
          allSessions={liveSessions}
          onBack={handleCloseDetail}
          onNavigateToSession={handleNavigateToSession}
          initialEventId={initialEventId}
          onEventChange={handleEventChange}
          onNavigateToAgent={onNavigateToAgent}
          onNavigateToTask={onNavigateToTask}
          onNavigateToMR={onNavigateToMR}
          onNavigateToWhiteboard={onNavigateToWhiteboard}
          onResumeSession={onResumeSession ? () => onResumeSession(selectedSession) : undefined}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Session list (always visible) */}
      <div style={{
        width: selectedSession ? `${100 - detailWidth}%` : '100%',
        minWidth: selectedSession ? 280 : undefined,
        height: '100%',
        overflow: 'hidden',
        transition: selectedSession ? 'width var(--duration-normal) ease-out' : 'none',
        flexShrink: 0,
      }}>
        <SessionListView
          sessions={liveSessions}
          onSelectSession={handleSelectSession}
          selectedSessionId={selectedSession?.id ?? null}
          compact={!!selectedSession}
          onCreateSession={onCreateSession && agents ? () => setCreateDialogOpen(true) : undefined}
        />
      </div>

      {/* Right: Detail panel (slide-in) */}
      {selectedSession && (
        <>
          {/* Resize handle */}
          <ResizeHandle onMouseDown={handleResizeStart} />

          <div style={{
            width: `${detailWidth}%`,
            height: '100%',
            overflow: 'hidden',
            animation: 'slideInRight var(--duration-normal) ease-out',
            flexShrink: 0,
          }}>
            <SessionDetailView
              session={selectedSession}
              sessionIds={sessions.map(s => s.id)}
              allSessions={sessions}
              onBack={handleCloseDetail}
              onNavigateToSession={handleNavigateToSession}
              initialEventId={initialEventId}
              onEventChange={handleEventChange}
              onNavigateToAgent={onNavigateToAgent}
              onNavigateToTask={onNavigateToTask}
              onNavigateToMR={onNavigateToMR}
              onNavigateToWhiteboard={onNavigateToWhiteboard}
              onResumeSession={onResumeSession ? () => onResumeSession(selectedSession) : undefined}
              compact
            />
          </div>
        </>
      )}

      {createDialogOpen && agents && (
        <CreateSessionDialog
          agents={agents}
          tasks={tasks}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={(config) => {
            const newSession: Session = {
              id: `sess-${Date.now().toString(36)}`,
              title: config.initialMessage
                ? config.initialMessage.slice(0, 60) + (config.initialMessage.length > 60 ? '...' : '')
                : `Session with ${config.agentName}`,
              agent: {
                id: config.agentId,
                name: config.agentName,
                version: '1.0',
                status: 'active',
                model: 'sonnet-4.6',
                provider: 'claude-code',
                rolePrompt: '',
                recentSessions: [],
              },
              status: 'active',
              startedAt: 'just now',
              duration: '0s',
              tokensIn: 0,
              tokensOut: 0,
              environment: 'local',
              linkedTaskId: config.taskId,
              events: [
                { id: `ev-${Date.now()}`, type: 'session_start', title: 'Session started', content: 'Session initialized', timestamp: 0, duration: 500 },
                ...(config.initialMessage ? [{
                  id: `ev-${Date.now() + 1}`, type: 'user_message' as const, title: config.initialMessage.slice(0, 40),
                  content: config.initialMessage, timestamp: 500, duration: 800,
                }] : []),
              ],
            }
            setLiveSessions(prev => [newSession, ...prev])
            setSelectedSession(newSession)
            onSessionChange?.(newSession.id, null)
            onCreateSession?.(config)
            setCreateDialogOpen(false)
          }}
        />
      )}
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
