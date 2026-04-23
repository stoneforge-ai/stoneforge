import { useState, useEffect, useRef, useCallback } from 'react'
import {
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  Expand,
  Plus,
  Send,
  Square,
  Play,
  RotateCcw,
  Mail,
  MessageSquare,
  Archive,
  Clock,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Loader,
  File,
  FileEdit,
  Terminal,
  Search,
  Bot,
  Mic,
  CircleStop,
  List,
  GitFork,
  GitBranch,
  Pencil,
  Copy,
  Undo2,
  Image,
  Zap,
  Shield,
  Sparkles,
  ListChecks,
  Presentation,
  Lock,
  Unlock,
  Eye,
} from 'lucide-react'
import { Tooltip } from './Tooltip'
import { AvatarStack } from './AvatarStack'
import { UserAvatar } from './UserAvatar'
import { useMentionAutocomplete, MentionDropdown } from './MentionAutocomplete'
import { useTeamContext } from '../TeamContext'
import type { DirectorSession, DirectorMessage, WorkspaceInfo, WorkspaceThread } from '../mock-data'
import { mockDirectorMessages, mockWorkspaceThreads } from '../mock-data'
import { mockRuntimes } from './overlays/runtimes/runtime-mock-data'
import { mockRoleDefinitions } from './overlays/agents/agent-mock-data'
import { Monitor, Cloud } from 'lucide-react'

// ── Mock thread data ──
interface DirectorThread {
  id: string
  title: string
  preview: string
  createdAt: string
  duration: string
  status: 'completed' | 'running' | 'error'
  tasksAdded: number
  tasksModified: number
  tasksDeleted: number
  archived: boolean
}

const mockThreads: Record<string, DirectorThread[]> = {
  'dir-1': [
    { id: 't1', title: 'Implement OAuth2 PKCE flow', preview: 'Working on PKCE challenge generation and token exchange...', createdAt: '2 min ago', duration: '14m', status: 'running', tasksAdded: 2, tasksModified: 1, tasksDeleted: 0, archived: false },
    { id: 't2', title: 'Refactor agent pool connections', preview: 'Extracted ConnectionManager pattern with health checks', createdAt: '1 day ago', duration: '45m', status: 'completed', tasksAdded: 1, tasksModified: 3, tasksDeleted: 1, archived: false },
    { id: 't3', title: 'SQLite WAL migration setup', preview: 'Setting up database migration scripts...', createdAt: '5 min ago', duration: '3m', status: 'running', tasksAdded: 1, tasksModified: 0, tasksDeleted: 0, archived: false },
    { id: 't4', title: 'Fix auth token refresh logic', preview: 'Resolved race condition in concurrent refresh calls', createdAt: '3 days ago', duration: '22m', status: 'completed', tasksAdded: 0, tasksModified: 2, tasksDeleted: 0, archived: false },
  ],
  'dir-2': [
    { id: 't5', title: 'WebSocket reconnection', preview: 'Added exponential backoff with jitter for reconnection', createdAt: '15 min ago', duration: '28m', status: 'completed', tasksAdded: 0, tasksModified: 1, tasksDeleted: 0, archived: false },
    { id: 't6', title: 'Fix PTY resize propagation', preview: 'Propagating resize events to PTY subprocess', createdAt: '1 hr ago', duration: '12m', status: 'error', tasksAdded: 0, tasksModified: 1, tasksDeleted: 0, archived: false },
    { id: 't7', title: 'Rate limit banner', preview: 'Added countdown timer and auto-dismiss', createdAt: '2 days ago', duration: '35m', status: 'completed', tasksAdded: 1, tasksModified: 0, tasksDeleted: 0, archived: false },
  ],
  'dir-3': [
    { id: 't8', title: 'SSH tunnel connection', preview: 'Attempting to establish SSH connection to cloud worker...', createdAt: '30 min ago', duration: '5m', status: 'error', tasksAdded: 0, tasksModified: 0, tasksDeleted: 0, archived: false },
  ],
}

type ExpandState = 'contracted' | 'expanded' | 'full'

interface DirectorPanelProps {
  directors: DirectorSession[]
  collapsed: boolean
  onToggleCollapse: () => void
  expandState: ExpandState
  onCycleExpand: () => void
  externalActiveId?: string | null
  onNavigateToWhiteboard?: (directorId: string) => void
  workspaces?: WorkspaceInfo[]
  activeWorkspaceId?: string
  onSwitchWorkspace?: (id: string) => void
}

const DEFAULT_WIDTH_LG = 480
const DEFAULT_WIDTH_SM = 380
const MIN_WIDTH = 320
const MAX_WIDTH = 800

function getDefaultWidth() {
  return window.innerWidth <= 900 ? DEFAULT_WIDTH_SM : DEFAULT_WIDTH_LG
}

export function DirectorPanel({ directors, collapsed, onToggleCollapse, expandState, onCycleExpand, externalActiveId, onNavigateToWhiteboard, workspaces = [], activeWorkspaceId, onSwitchWorkspace }: DirectorPanelProps) {
  const { isTeamMode, currentUser, getUserById, teamMembers } = useTeamContext()
  const [activeId, setActiveId] = useState(directors[0]?.id || '')
  const [viewMode, setViewMode] = useState<'chat' | 'threads'>('chat')
  const [archivedThreads, setArchivedThreads] = useState<Set<string>>(new Set())
  const [inputValue, setInputValue] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [sessionLocks, setSessionLocks] = useState<Record<string, boolean>>(() => {
    const locks: Record<string, boolean> = {}
    directors.forEach(d => { if (d.locked) locks[d.id] = true })
    return locks
  })
  const [selectedBranch, setSelectedBranch] = useState('main')
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const branchBtnRef = useRef<HTMLButtonElement>(null)
  const branchDropdownRef = useRef<HTMLDivElement>(null)
  // Input toolbar state
  const [selectedModel, setSelectedModel] = useState('Opus 4.6 1M')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [selectedEffort, setSelectedEffort] = useState('High')
  const [effortDropdownOpen, setEffortDropdownOpen] = useState(false)
  const [selectedMode, setSelectedMode] = useState('Full Auto')
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [skillsHovered, setSkillsHovered] = useState(false)
  const mention = useMentionAutocomplete({
    value: inputValue, onChange: setInputValue,
    teamMembers, currentUserId: currentUser.id, isTeamMode,
  })
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const effortMenuRef = useRef<HTMLDivElement>(null)
  const [hasCustomWidth] = useState(() => !!localStorage.getItem('sf-director-width'))
  const [panelWidthState, setPanelWidthState] = useState(() => {
    const saved = localStorage.getItem('sf-director-width')
    return saved ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(saved, 10))) : getDefaultWidth()
  })
  const [didResize, setDidResize] = useState(hasCustomWidth)
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (externalActiveId && directors.some(d => d.id === externalActiveId)) {
      setActiveId(externalActiveId)
      setViewMode('chat')
    }
  }, [externalActiveId, directors])

  // Mock branches
  const [customBranches, setCustomBranches] = useState<string[]>([])
  const mockBranches = [
    { name: 'main', isDefault: true },
    { name: 'feat/oauth2-pkce', pr: 'MR-42' },
    { name: 'fix/ws-reconnect', pr: 'MR-39' },
    { name: 'feat/agent-sessions' },
    { name: 'fix/pty-resize', pr: 'MR-41' },
    { name: 'feat/dark-mode-tokens' },
    { name: 'refactor/auth-middleware' },
    { name: 'feat/preview-environments', pr: 'MR-38' },
    ...customBranches.map(name => ({ name })),
  ]

  // Close branch dropdown on outside click
  useEffect(() => {
    if (!branchDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (branchDropdownRef.current?.contains(e.target as Node)) return
      if (branchBtnRef.current?.contains(e.target as Node)) return
      setBranchDropdownOpen(false)
      setBranchSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [branchDropdownOpen])

  // Close input toolbar dropdowns on outside click
  useEffect(() => {
    const anyOpen = plusMenuOpen || modeDropdownOpen || modelDropdownOpen || effortDropdownOpen
    if (!anyOpen) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (plusMenuOpen && !plusMenuRef.current?.contains(t)) setPlusMenuOpen(false)
      if (modeDropdownOpen && !modeMenuRef.current?.contains(t)) setModeDropdownOpen(false)
      if (modelDropdownOpen && !modelMenuRef.current?.contains(t)) setModelDropdownOpen(false)
      if (effortDropdownOpen && !effortMenuRef.current?.contains(t)) setEffortDropdownOpen(false)
      setSkillsHovered(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [plusMenuOpen, modeDropdownOpen, modelDropdownOpen, effortDropdownOpen])

  // Drag-to-resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = panelWidthState

    const onMouseMove = (e: MouseEvent) => {
      // Dragging left border: moving left = bigger panel
      const delta = startX - e.clientX
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta))
      setPanelWidthState(newWidth)
      setDidResize(true)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Persist
      const el = panelRef.current
      if (el) {
        const w = parseInt(getComputedStyle(el).width, 10)
        localStorage.setItem('sf-director-width', String(w))
      }
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [panelWidthState])

  const activeDirector = directors.find(d => d.id === activeId)
  const isFull = expandState === 'full'
  const isExpanded = expandState === 'expanded'
  const panelWidth = collapsed ? 48 : panelWidthState
  // Aggregate threads across all directors
  const allThreads = directors.flatMap(dir =>
    (mockThreads[dir.id] || [])
      .filter(t => !t.archived && !archivedThreads.has(t.id))
      .map(t => ({ ...t, directorName: dir.name, directorId: dir.id }))
  )
  const messages = mockDirectorMessages[activeId] || []

  if (collapsed) {
    return (
      <div className="director-panel director-collapsed" style={{ width: 48, minWidth: 48, height: '100%', background: 'var(--color-bg-secondary)', borderLeft: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 4 }}>
        <Tooltip label="Expand director panel" placement="left">
          <button onClick={onToggleCollapse} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all var(--duration-fast)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <PanelRightOpen size={16} strokeWidth={1.5} />
          </button>
        </Tooltip>
        <div style={{ width: 20, height: 1, background: 'var(--color-border)' }} />
        {directors.map(dir => (
          <Tooltip key={dir.id} label={dir.name} placement="left">
            <div onClick={() => { setActiveId(dir.id); onToggleCollapse() }} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: dir.id === activeId ? 'var(--color-primary-subtle)' : 'transparent', cursor: 'pointer', position: 'relative', color: dir.id === activeId ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, transition: 'all var(--duration-fast)' }}
              onMouseEnter={e => { if (dir.id !== activeId) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => e.currentTarget.style.background = dir.id === activeId ? 'var(--color-primary-subtle)' : 'transparent'}
            >
            {dir.name.split(' ').map(w => w[0]).join('')}
            <StatusDotSmall status={dir.status} />
            {dir.unreadCount > 0 && <span style={{ position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: 'var(--color-primary)', color: 'white', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{dir.unreadCount}</span>}
            </div>
          </Tooltip>
        ))}
      </div>
    )
  }

  return (
    <div ref={panelRef} className={`director-panel director-expanded ${expandState === 'contracted' && !didResize ? 'w-[380px] lg:w-[480px] min-w-[380px] lg:min-w-[480px]' : ''}`} style={{
      ...(isFull ? { width: '100%', minWidth: 0, flex: 1 } : isExpanded ? { width: '50%', minWidth: 0 } : expandState === 'contracted' && didResize ? { width: panelWidthState, minWidth: panelWidthState } : {}),
      height: '100%', background: 'var(--color-bg-secondary)', borderLeft: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* Resize handle — only in contracted mode */}
      {expandState === 'contracted' && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute', left: -2, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10,
            background: isResizing ? 'var(--color-primary)' : 'transparent',
            transition: isResizing ? 'none' : 'background 0.15s',
          }}
          onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = 'var(--color-border)' }}
          onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = 'transparent' }}
        />
      )}

      {/* Header tabs */}
      <div style={{ height: 44, minHeight: 44, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border)', padding: '0 4px 0 8px', gap: 0 }}>
        {/* Tabs + adjacent (+) button */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 0 }}>
          {/* Scrollable tabs */}
          <div style={{ overflow: 'hidden', minWidth: 0, flexShrink: 1 }}>
            <div style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="director-tabs-scroll">
              {directors.map(dir => {
                const roleDef = mockRoleDefinitions.find(rd => rd.id === dir.roleDefinitionId)
                return (
                <button key={dir.id} onClick={() => { setActiveId(dir.id); setViewMode('chat') }} style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: 'none', background: dir.id === activeId ? 'var(--color-surface-active)' : 'transparent', color: dir.id === activeId ? 'var(--color-text)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: `all var(--duration-fast)`, flexShrink: 0 }}
                  onMouseEnter={e => { if (dir.id !== activeId) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { if (dir.id !== activeId) e.currentTarget.style.background = 'transparent' }}
                >
                  <StatusDotSmall status={dir.status} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
                    <span>{dir.name.split(' ')[1]}</span>
                    {roleDef && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>{roleDef.name}</span>}
                  </div>
                  {dir.unreadCount > 0 && <span style={{ minWidth: 16, height: 16, borderRadius: 'var(--radius-full)', background: 'var(--color-primary)', color: 'white', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{dir.unreadCount}</span>}
                </button>
                )
              })}
            </div>
          </div>
          {/* (+) button — always adjacent to last tab */}
          <Tooltip label="New director">
            <button style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', flexShrink: 0, transition: 'all var(--duration-fast)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            ><Plus size={14} strokeWidth={1.5} /></button>
          </Tooltip>
        </div>
        {/* Action buttons: whiteboard, sessions, expand, collapse */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <Tooltip label="Open whiteboard">
            <button onClick={() => onNavigateToWhiteboard?.(activeId)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all var(--duration-fast)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Presentation size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
          <Tooltip label={viewMode === 'threads' ? 'Back to chat' : 'View sessions'}>
            <button onClick={() => setViewMode(viewMode === 'threads' ? 'chat' : 'threads')} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: viewMode === 'threads' ? 'var(--color-primary-subtle)' : 'none', border: 'none', color: viewMode === 'threads' ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all var(--duration-fast)' }}
              onMouseEnter={e => { if (viewMode !== 'threads') e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => e.currentTarget.style.background = viewMode === 'threads' ? 'var(--color-primary-subtle)' : 'transparent'}
            >
              <List size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
          {/* 3-state expand cycle: contracted → expanded (50%) → full-width */}
          <Tooltip label={isFull ? 'Contract panel' : isExpanded ? 'Expand to full width' : 'Expand panel'}>
            <button
              onClick={onCycleExpand}
              style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (isFull || isExpanded) ? 'var(--color-primary-subtle)' : 'none', border: 'none', color: (isFull || isExpanded) ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all var(--duration-fast)' }}
              onMouseEnter={e => { if (!isFull && !isExpanded) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => e.currentTarget.style.background = (isFull || isExpanded) ? 'var(--color-primary-subtle)' : 'transparent'}
            >
              {isFull ? <Minimize2 size={14} strokeWidth={1.5} /> : isExpanded ? <Expand size={14} strokeWidth={1.5} /> : <Maximize2 size={14} strokeWidth={1.5} />}
            </button>
          </Tooltip>
          <Tooltip label="Close panel">
            <button onClick={onToggleCollapse} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all var(--duration-fast)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <PanelRightClose size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Session controls — hidden when viewing threads */}
      {activeDirector && viewMode !== 'threads' && (() => {
        const isOwner = activeDirector.ownerId === currentUser.id
        const isLocked = sessionLocks[activeDirector.id] ?? false
        const ownerUser = getUserById(activeDirector.ownerId)
        const viewerUsers = (activeDirector.viewers || []).map(id => getUserById(id)).filter((u): u is NonNullable<typeof u> => !!u)

        return (
          <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            {/* 7.2: Session header — owner, connection badge, viewers */}
            {isTeamMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                {/* Owner avatar + name */}
                {ownerUser && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserAvatar user={ownerUser} size={22} showPresence />
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Started by <strong style={{ fontWeight: 600, color: 'var(--color-text)' }}>{ownerUser.name}</strong></span>
                  </div>
                )}
                {/* Runtime badge — shows runtime name instead of generic connection type */}
                {(() => {
                  const runtime = activeDirector.runtimeId ? mockRuntimes.find(r => r.id === activeDirector.runtimeId) : undefined
                  const connType = activeDirector.connectionType
                  const RuntimeIcon = connType === 'ssh' ? Terminal : connType === 'remote' ? Cloud : Monitor
                  const color = connType === 'ssh' ? 'var(--color-connection-ssh)' : connType === 'remote' ? 'var(--color-connection-remote)' : 'var(--color-connection-local)'
                  return (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '1px 6px', borderRadius: 'var(--radius-full)',
                      fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-mono)',
                      color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                      lineHeight: '18px',
                    }}>
                      <RuntimeIcon size={11} />
                      {runtime?.name || connType}
                    </span>
                  )
                })()}
                <div style={{ flex: 1 }} />
                {/* 7.4: Viewer indicator — avatar stack */}
                {viewerUsers.length > 0 && (
                  <Tooltip label={viewerUsers.map(u => u.name).join(', ') + (viewerUsers.length === 1 ? ' is watching' : ' are watching')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AvatarStack users={viewerUsers} max={3} size={18} showPresence />
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{viewerUsers.length} watching</span>
                    </div>
                  </Tooltip>
                )}
                {/* 7.3: Session lock control — owner only */}
                {isOwner && (
                  <Tooltip label={isLocked ? 'Unlock session for team' : 'Lock session to read-only'}>
                    <button
                      onClick={() => setSessionLocks(prev => ({ ...prev, [activeDirector.id]: !isLocked }))}
                      style={{
                        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isLocked ? 'var(--color-warning-subtle)' : 'none',
                        border: '1px solid',
                        borderColor: isLocked ? 'var(--color-warning)' : 'var(--color-border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        color: isLocked ? 'var(--color-warning)' : 'var(--color-text-tertiary)',
                        cursor: 'pointer', transition: 'all var(--duration-fast)',
                      }}
                      onMouseEnter={e => { if (!isLocked) { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
                      onMouseLeave={e => { if (!isLocked) { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' } }}
                    >
                      {isLocked ? <Lock size={12} strokeWidth={1.5} /> : <Unlock size={12} strokeWidth={1.5} />}
                    </button>
                  </Tooltip>
                )}
                {/* Non-owner sees lock indicator */}
                {!isOwner && isLocked && (
                  <Tooltip label={`Read-only for team — locked by ${ownerUser?.name || 'owner'}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-warning-subtle)', color: 'var(--color-warning)', fontSize: 10, fontWeight: 500 }}>
                      <Lock size={10} strokeWidth={1.5} /> Locked
                    </div>
                  </Tooltip>
                )}
              </div>
            )}
            {/* Action buttons row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px' }}>
              {activeDirector.status === 'running' ? (
                <><SessionButton icon={Square} label="Stop" color="var(--color-danger)" /><SessionButton icon={RotateCcw} label="Restart" /></>
              ) : (
                <SessionButton icon={Play} label="Start" color="var(--color-success)" />
              )}
              <div style={{ flex: 1 }} />
              <SessionButton icon={Mail} label="Inbox" badge={activeDirector.unreadCount || undefined} />
            </div>
          </div>
        )
      })()}

      {/* Content */}
      {viewMode === 'threads' ? (
        <CrossWorkspaceThreadsView
          currentWorkspaceThreads={allThreads}
          directors={directors}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectThread={(t) => { setActiveId(t.directorId); setViewMode('chat') }}
          onArchive={id => setArchivedThreads(prev => new Set([...prev, id]))}
          onSwitchWorkspace={id => onSwitchWorkspace?.(id)}
        />
      ) : (
        <>
          {/* Chat message area */}
          <ChatMessageArea messages={messages} director={activeDirector} onNavigateToWhiteboard={onNavigateToWhiteboard} />

          {/* Plan/Todo list — fixed above working indicator */}
          {(() => {
            const planMsg = [...messages].reverse().find(m => m.planItems && m.planItems.length > 0)
            if (!planMsg) return null
            return <PlanTodoBlock title={planMsg.planTitle || 'Plan'} items={planMsg.planItems!} />
          })()}

          {/* Working indicator — fixed above input */}
          {activeDirector?.status === 'running' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)' }}>
              <div className="director-working-dots" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-primary)', animation: 'directorDot 1.4s ease-in-out infinite', animationDelay: '0s' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-primary)', animation: 'directorDot 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-primary)', animation: 'directorDot 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Working...</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>
                <span>14s</span>
                <span style={{ opacity: 0.3 }}>·</span>
                <span>↑ 1.8k</span>
              </div>
              <Tooltip label="Stop agent">
                <button
                  style={{
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)',
                    cursor: 'pointer', transition: `all var(--duration-fast)`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-danger)'; e.currentTarget.style.color = 'var(--color-danger)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  <Square size={10} strokeWidth={2} />
                </button>
              </Tooltip>
            </div>
          )}

          {/* 7.5: Read-only state for non-owner sessions (team-mode) */}
          {isTeamMode && activeDirector && activeDirector.ownerId !== currentUser.id ? (
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '12px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                background: 'var(--color-surface)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
              }}>
                <Eye size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flex: 1 }}>
                  {sessionLocks[activeDirector.id]
                    ? 'This session is locked — read only'
                    : `Observing ${getUserById(activeDirector.ownerId)?.name || 'owner'}'s session`
                  }
                </span>
                {!sessionLocks[activeDirector.id] && (
                  <button style={{
                    height: 24, padding: '0 8px', fontSize: 11, fontWeight: 500,
                    background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    transition: 'all var(--duration-fast)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--color-primary-subtle)'}
                  >
                    Request control
                  </button>
                )}
              </div>
            </div>
          ) : (
          /* Token counter + Input */
          <div style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            {/* Branch selector + context stats — above input */}
            <div style={{ padding: '6px 12px 0', display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', position: 'relative' }}>
              <button
                ref={branchBtnRef}
                onClick={() => { setBranchDropdownOpen(v => !v); setBranchSearch('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px',
                  background: branchDropdownOpen ? 'var(--color-surface)' : 'none',
                  border: '1px solid', borderColor: branchDropdownOpen ? 'var(--color-border)' : 'var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: branchDropdownOpen ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  cursor: 'pointer', transition: `all var(--duration-fast)`, lineHeight: 1,
                }}
                onMouseEnter={e => { if (!branchDropdownOpen) { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
                onMouseLeave={e => { if (!branchDropdownOpen) { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' } }}
              >
                <GitBranch size={10} strokeWidth={1.5} />
                {selectedBranch}
                <ChevronDown size={8} strokeWidth={1.5} style={{ transform: branchDropdownOpen ? 'rotate(180deg)' : 'none', transition: `transform var(--duration-fast)` }} />
              </button>
              {/* Branch dropdown */}
              {branchDropdownOpen && (
                <div
                  ref={branchDropdownRef}
                  style={{
                    position: 'absolute', bottom: '100%', left: 12, marginBottom: 4,
                    width: 240, maxHeight: 280, display: 'flex', flexDirection: 'column',
                    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
                    zIndex: 100, overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '8px 8px 4px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={12} strokeWidth={1.5} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                      <input
                        autoFocus
                        value={branchSearch}
                        onChange={e => setBranchSearch(e.target.value)}
                        placeholder="Find a branch..."
                        style={{
                          width: '100%', height: 28, padding: '0 8px 0 26px',
                          background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)',
                          fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none',
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border-subtle)'}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setBranchDropdownOpen(false); setBranchSearch('') }
                          if (e.key === 'Enter' && branchSearch.trim() && !mockBranches.some(b => b.name === branchSearch.trim())) {
                            const name = branchSearch.trim()
                            setCustomBranches(prev => [...prev, name])
                            setSelectedBranch(name)
                            setBranchDropdownOpen(false)
                            setBranchSearch('')
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ overflowY: 'auto', padding: '2px 4px 6px' }}>
                    {mockBranches
                      .filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                      .map(branch => {
                        const isActive = branch.name === selectedBranch
                        return (
                          <button
                            key={branch.name}
                            onClick={() => { setSelectedBranch(branch.name); setBranchDropdownOpen(false); setBranchSearch('') }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                              padding: '5px 8px', background: isActive ? 'var(--color-primary-subtle)' : 'none',
                              border: 'none', borderRadius: 'var(--radius-sm)',
                              color: isActive ? 'var(--color-text-accent)' : 'var(--color-text-primary)',
                              fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                              textAlign: 'left', transition: `background var(--duration-fast)`,
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none' }}
                          >
                            {isActive ? <Check size={11} strokeWidth={2} style={{ flexShrink: 0 }} /> : <span style={{ width: 11, flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{branch.name}</span>
                            {branch.isDefault && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', padding: '0 4px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)' }}>default</span>}
                            {branch.pr && <span style={{ fontSize: 9, color: 'var(--color-text-accent)', padding: '0 4px', background: 'var(--color-primary-subtle)', borderRadius: 'var(--radius-sm)' }}>{branch.pr}</span>}
                          </button>
                        )
                      })}
                    {branchSearch.trim() && !mockBranches.some(b => b.name === branchSearch.trim()) && (
                      <>
                        {mockBranches.filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase())).length > 0 && (
                          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 8px' }} />
                        )}
                        <button
                          onClick={() => {
                            const name = branchSearch.trim()
                            setCustomBranches(prev => [...prev, name])
                            setSelectedBranch(name)
                            setBranchDropdownOpen(false)
                            setBranchSearch('')
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                            padding: '5px 8px', background: 'none',
                            border: 'none', borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text-accent)', fontSize: 11, fontFamily: 'var(--font-mono)',
                            cursor: 'pointer', textAlign: 'left', transition: `background var(--duration-fast)`,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-subtle)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <Plus size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                          <span>Create <strong>{branchSearch.trim()}</strong></span>
                        </button>
                      </>
                    )}
                    {mockBranches.filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase())).length === 0 && !branchSearch.trim() && (
                      <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>No branches found</div>
                    )}
                  </div>
                </div>
              )}
              <span style={{ marginLeft: 'auto' }}>Context: 24k</span>
            </div>
            <div style={{ padding: '6px 12px 8px', position: 'relative' }}>
              {/* Recording indicator */}
              {isRecording ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 56, background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-danger)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Listening...</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>0:03</span>
                  <button
                    onClick={() => setIsRecording(false)}
                    style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-danger)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer' }}
                  >
                    <Square size={10} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <AutoExpandTextarea
                    value={inputValue}
                    onChange={v => mention.handleChange(v)}
                    onKeyDown={mention.handleKeyDown}
                    placeholder={isTeamMode ? 'Ask a question or describe a task... (@ to mention)' : 'Ask a question or describe a task...'}
                  />
                  {mention.showDropdown && (
                    <MentionDropdown
                      members={mention.filteredMembers}
                      activeIndex={mention.mentionIndex}
                      onSelect={mention.insertMention}
                      onHover={mention.setMentionIndex}
                      position="above"
                    />
                  )}
                  {/* Embedded toolbar — bottom of textarea */}
                  <div style={{
                    position: 'absolute', bottom: 4, left: 4, right: 4,
                    display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px',
                    pointerEvents: 'auto',
                  }}>
                    {/* ── Left side ── */}
                    {/* (+) Plus menu */}
                    <div ref={plusMenuRef} style={{ position: 'relative' }}>
                      <ToolbarBtn title="Add" onClick={() => { setPlusMenuOpen(v => !v); setModeDropdownOpen(false); setModelDropdownOpen(false); setEffortDropdownOpen(false); setSkillsHovered(false) }} active={plusMenuOpen}>
                        <Plus size={14} strokeWidth={1.5} />
                      </ToolbarBtn>
                      {plusMenuOpen && (
                        <div style={{
                          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
                          width: 200, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 120, overflow: 'visible',
                        }}>
                          <div style={{ padding: '4px' }}>
                            <MenuRow icon={Image} label="Add files or photos" onClick={() => setPlusMenuOpen(false)} />
                            <div
                              style={{ position: 'relative' }}
                              onMouseEnter={() => setSkillsHovered(true)}
                              onMouseLeave={() => setSkillsHovered(false)}
                            >
                              <MenuRow icon={Zap} label="Skills" suffix={<ChevronRight size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />} />
                              {skillsHovered && (
                                <div style={{
                                  position: 'absolute', left: '100%', bottom: -4, marginLeft: 2,
                                  width: 170, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 130, padding: '4px',
                                }}>
                                  {['commit', 'review-pr', 'debug', 'simplify', 'visual-qa', 'clean-typescript'].map(s => (
                                    <MenuRow key={s} icon={Sparkles} label={`/${s}`} onClick={() => { setPlusMenuOpen(false); setSkillsHovered(false) }} mono />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Mode selector */}
                    <div ref={modeMenuRef} style={{ position: 'relative' }}>
                      <ToolbarBtn title="Mode" onClick={() => { setModeDropdownOpen(v => !v); setPlusMenuOpen(false); setModelDropdownOpen(false); setEffortDropdownOpen(false); setSkillsHovered(false) }} active={modeDropdownOpen}>
                        <Shield size={12} strokeWidth={1.5} />
                        <span style={{ fontSize: 10, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedMode}</span>
                        <ChevronDown size={8} strokeWidth={1.5} />
                      </ToolbarBtn>
                      {modeDropdownOpen && (
                        <div style={{
                          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
                          width: 240, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 120, padding: '4px',
                        }}>
                          {([
                            { label: 'Full Auto', desc: 'Full permissions to make changes' },
                            { label: 'Ask Permissions', desc: 'Always ask before making changes' },
                            { label: 'Plan Mode', desc: 'Create a plan before making changes' },
                          ] as const).map(m => (
                            <button
                              key={m.label}
                              onClick={() => { setSelectedMode(m.label); setModeDropdownOpen(false) }}
                              style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '6px 8px',
                                background: selectedMode === m.label ? 'var(--color-primary-subtle)' : 'none',
                                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                                transition: `background var(--duration-fast)`,
                              }}
                              onMouseEnter={e => { if (selectedMode !== m.label) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                              onMouseLeave={e => { if (selectedMode !== m.label) e.currentTarget.style.background = 'none' }}
                            >
                              {selectedMode === m.label ? <Check size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-text-accent)' }} /> : <span style={{ width: 12, flexShrink: 0 }} />}
                              <div>
                                <div style={{ fontSize: 12, color: selectedMode === m.label ? 'var(--color-text-accent)' : 'var(--color-text-primary)', fontWeight: 500 }}>{m.label}</div>
                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{m.desc}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Spacer ── */}
                    <div style={{ flex: 1 }} />

                    {/* Model selector */}
                    <div ref={modelMenuRef} style={{ position: 'relative' }}>
                      <ToolbarBtn title="Model" onClick={() => { setModelDropdownOpen(v => !v); setPlusMenuOpen(false); setModeDropdownOpen(false); setEffortDropdownOpen(false); setSkillsHovered(false) }} active={modelDropdownOpen}>
                        <span style={{ fontSize: 10 }}>{selectedModel}</span>
                        <ChevronDown size={8} strokeWidth={1.5} />
                      </ToolbarBtn>
                      {modelDropdownOpen && (
                        <div style={{
                          position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                          width: 160, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 120, padding: '4px',
                        }}>
                          {['Opus 4.6 1M', 'Sonnet 4.6', 'Haiku 4.5'].map(m => (
                            <SelectRow key={m} label={m} selected={selectedModel === m} onClick={() => { setSelectedModel(m); setModelDropdownOpen(false) }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Effort selector */}
                    <div ref={effortMenuRef} style={{ position: 'relative' }}>
                      <ToolbarBtn title="Effort" onClick={() => { setEffortDropdownOpen(v => !v); setPlusMenuOpen(false); setModeDropdownOpen(false); setModelDropdownOpen(false); setSkillsHovered(false) }} active={effortDropdownOpen}>
                        <span style={{ fontSize: 10 }}>{selectedEffort}</span>
                        <ChevronDown size={8} strokeWidth={1.5} />
                      </ToolbarBtn>
                      {effortDropdownOpen && (
                        <div style={{
                          position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                          width: 120, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 120, padding: '4px',
                        }}>
                          {['Max', 'High', 'Medium', 'Low'].map(e => (
                            <SelectRow key={e} label={e} selected={selectedEffort === e} onClick={() => { setSelectedEffort(e); setEffortDropdownOpen(false) }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Send / Mic button */}
                    {inputValue.trim() ? (
                      <ToolbarBtn title="Send" onClick={() => {}} accent>
                        <Send size={13} strokeWidth={1.5} />
                      </ToolbarBtn>
                    ) : (
                      <ToolbarBtn title="Voice input" onClick={() => setIsRecording(true)}>
                        <Mic size={13} strokeWidth={1.5} />
                      </ToolbarBtn>
                    )}
                  </div>
                </div>
              )}
            </div>
            <style>{`
              @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
              @keyframes directorDot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
            `}</style>
          </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Chat Message Area ──
function ChatMessageArea({ messages, director, onNavigateToWhiteboard }: { messages: DirectorMessage[]; director?: DirectorSession; onNavigateToWhiteboard?: (directorId: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinnedMsg, setPinnedMsg] = useState<DirectorMessage | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const userMessages = messages.filter(m => m.type === 'user')

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top
      let lastAbove: DirectorMessage | null = null

      for (const msg of userMessages) {
        const el = container.querySelector(`[data-msg-id="${msg.id}"]`)
        if (!el) continue
        const elTop = el.getBoundingClientRect().top
        if (elTop <= containerTop) {
          lastAbove = msg
        }
      }

      setPinnedMsg(lastAbove)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [userMessages])

  const initials = director?.name.split(' ').map(w => w[0]).join('') || 'D'

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Pinned user message — click to scroll to it */}
      {pinnedMsg && (
        <div
          onClick={() => {
            if (scrollRef.current) {
              const el = scrollRef.current.querySelector(`[data-msg-id="${pinnedMsg.id}"]`) as HTMLElement | null
              if (el) {
                scrollRef.current.scrollTop = el.offsetTop
              }
            }
          }}
          style={{
            zIndex: 5,
            background: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-subtle)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            flexShrink: 0,
            cursor: 'pointer',
            transition: 'background var(--duration-fast)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
        >
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)', fontSize: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>Y</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--color-text)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {pinnedMsg.content}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {messages.map(msg => {
          switch (msg.type) {
            case 'user': return <UserMessageBubble key={msg.id} msg={msg} />
            case 'agent': return <AgentMessageBlock key={msg.id} msg={msg} initials={initials} />
            case 'tool': return <ToolUseBlock key={msg.id} msg={msg} />
            case 'cross-agent': return <CrossAgentMessageBlock key={msg.id} msg={msg} />
            case 'system': return msg.whiteboardId
              ? <WhiteboardCard key={msg.id} msg={msg} onNavigate={() => onNavigateToWhiteboard?.(director?.id || '')} />
              : <SystemMessageLine key={msg.id} msg={msg} />
            default: return null
          }
        })}
      </div>
    </div>
  )
}

// ── User Message ──
function UserMessageBubble({ msg }: { msg: DirectorMessage }) {
  return (
    <div data-msg-id={msg.id} style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>Y</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>{msg.content}</div>
        </div>
      </div>
      {/* Action buttons — below the bubble */}
      <div style={{ display: 'flex', gap: 2, marginTop: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
        <UserMsgAction icon={Undo2} tooltip="Rollback to here" />
        <UserMsgAction icon={GitFork} tooltip="Fork from here" />
        <UserMsgAction icon={Pencil} tooltip="Edit message" />
        <UserMsgAction icon={Copy} tooltip="Copy message" />
      </div>
    </div>
  )
}

function UserMsgAction({ icon: Icon, tooltip }: { icon: typeof GitFork; tooltip: string }) {
  return (
    <Tooltip label={tooltip}>
      <button style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', opacity: 0.5, transition: 'all var(--duration-fast)' }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'transparent' }}
      >
        <Icon size={12} strokeWidth={1.5} />
      </button>
    </Tooltip>
  )
}

// ── Agent Message ──
function AgentMessageBlock({ msg, initials }: { msg: DirectorMessage; initials: string }) {
  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          <Bot size={12} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {msg.content}
        </div>
      </div>
    </div>
  )
}

// ── Tool Use Block ──
function ToolUseBlock({ msg }: { msg: DirectorMessage }) {
  const [expanded, setExpanded] = useState(false)

  const toolIcon: Record<string, typeof File> = { Read: File, Write: File, Edit: FileEdit, Bash: Terminal, Grep: Search }
  const Icon = toolIcon[msg.toolName || ''] || Terminal
  const statusColor = msg.toolStatus === 'completed' ? 'var(--color-success)' : msg.toolStatus === 'error' ? 'var(--color-danger)' : 'var(--color-warning)'
  const StatusIcon = msg.toolStatus === 'completed' ? Check : msg.toolStatus === 'error' ? X : Loader

  return (
    <div style={{ padding: '2px 12px' }}>
      <div style={{ borderLeft: '2px solid var(--color-border)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', overflow: 'hidden' }}>
        {/* Header */}
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            cursor: 'pointer', fontSize: 12,
            transition: `background var(--duration-fast)`,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {expanded ? <ChevronDown size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} /> : <ChevronRight size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />}
          <Icon size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{msg.toolName}</span>
          <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{msg.toolInput}</span>
          <StatusIcon size={12} strokeWidth={2} style={{ color: statusColor, flexShrink: 0, ...(msg.toolStatus === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
          {msg.toolDuration && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{msg.toolDuration}</span>}
        </div>

        {/* Expanded result */}
        {expanded && msg.toolResult && (
          <div style={{ padding: '6px 10px 8px', background: 'var(--color-bg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap', borderTop: '1px solid var(--color-border-subtle)' }}>
            {msg.toolResult}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Cross-Agent Message ──
function CrossAgentMessageBlock({ msg }: { msg: DirectorMessage }) {
  return (
    <div style={{ padding: '4px 12px' }}>
      <div style={{
        padding: '8px 12px',
        background: 'var(--color-primary-subtle)',
        borderRadius: 'var(--radius-md)',
        borderLeft: '2px solid var(--color-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 'var(--radius-full)', background: 'var(--color-primary-muted)', color: 'var(--color-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            cross-agent
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>{msg.fromAgent}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>{msg.toAgent}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{msg.timestamp}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.5 }}>{msg.content}</div>
        {msg.channelName && (
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }}>
              View in Channel: {msg.channelName}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── System Message ──
function SystemMessageLine({ msg }: { msg: DirectorMessage }) {
  return (
    <div style={{ padding: '2px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 10px', fontStyle: 'italic' }}>
        {msg.content}
      </div>
    </div>
  )
}

// ── Whiteboard Card (in chat timeline) ──
function WhiteboardCard({ msg, onNavigate }: { msg: DirectorMessage; onNavigate: () => void }) {
  return (
    <div style={{ padding: '4px 12px' }}>
      <div
        onClick={onNavigate}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'background var(--duration-fast)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
      >
        <Presentation size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{msg.content}</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{msg.timestamp}</div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 500 }}>View</span>
      </div>
    </div>
  )
}

// ── Cross-Workspace Threads View ──
function CrossWorkspaceThreadsView({
  currentWorkspaceThreads,
  directors,
  workspaces,
  activeWorkspaceId,
  onSelectThread,
  onArchive,
  onSwitchWorkspace,
}: {
  currentWorkspaceThreads: (DirectorThread & { directorName: string; directorId: string })[]
  directors: DirectorSession[]
  workspaces: WorkspaceInfo[]
  activeWorkspaceId?: string
  onSelectThread: (t: DirectorThread & { directorId: string }) => void
  onArchive: (id: string) => void
  onSwitchWorkspace: (id: string) => void
}) {
  const { isTeamMode, currentUser, getUserById } = useTeamContext()
  const [expandedWs, setExpandedWs] = useState<string | null>(null)
  const [sessionTab, setSessionTab] = useState<'my' | 'team'>('my')

  // Get threads for other workspaces
  const otherWorkspaces = workspaces.filter(w => w.id !== activeWorkspaceId)
  const otherWorkspaceThreads = otherWorkspaces
    .map(ws => ({
      workspace: ws,
      threads: mockWorkspaceThreads.filter(t => t.workspaceId === ws.id),
    }))
    .filter(g => g.threads.length > 0)

  // 7.1: Split threads by ownership in team mode
  const getDirectorOwner = (directorId: string) => directors.find(d => d.id === directorId)?.ownerId
  const myThreads = currentWorkspaceThreads.filter(t => getDirectorOwner(t.directorId) === currentUser.id)
  const teamThreads = currentWorkspaceThreads.filter(t => getDirectorOwner(t.directorId) !== currentUser.id)
  const visibleThreads = isTeamMode ? (sessionTab === 'my' ? myThreads : teamThreads) : currentWorkspaceThreads

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 7.1: Session split tabs (team-mode only) */}
      {isTeamMode ? (
        <div style={{ display: 'flex', gap: 0, padding: '6px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          {([
            { key: 'my' as const, label: 'My Sessions', count: myThreads.length },
            { key: 'team' as const, label: 'Team Sessions', count: teamThreads.length },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setSessionTab(tab.key)}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: sessionTab === tab.key ? 'var(--color-surface-active)' : 'transparent',
                color: sessionTab === tab.key ? 'var(--color-text)' : 'var(--color-text-secondary)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { if (sessionTab !== tab.key) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (sessionTab !== tab.key) e.currentTarget.style.background = 'transparent' }}
            >
              {tab.label}
              <span style={{
                minWidth: 16, height: 16, borderRadius: 'var(--radius-full)',
                background: sessionTab === tab.key ? 'var(--color-primary)' : 'var(--color-surface)',
                color: sessionTab === tab.key ? 'white' : 'var(--color-text-tertiary)',
                fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>{tab.count}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Sessions</span>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Current workspace threads */}
      {visibleThreads.length === 0 && otherWorkspaceThreads.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
          {isTeamMode ? (sessionTab === 'my' ? 'No sessions started by you' : 'No team sessions') : 'No sessions'}
        </div>
      )}
      {visibleThreads.map(thread => {
        const threadOwner = isTeamMode ? getUserById(getDirectorOwner(thread.directorId) || '') : undefined
        return (
          <div key={thread.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', transition: `background var(--duration-fast)` }}
            onClick={() => onSelectThread(thread)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: thread.status === 'running' ? 'var(--color-success)' : thread.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.title}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{thread.createdAt}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{thread.preview}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Agent name */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  <Bot size={9} strokeWidth={1.5} />
                  {thread.directorName}
                </span>
                {/* Team mode: show owner avatar+name */}
                {isTeamMode && threadOwner && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                    <UserAvatar user={threadOwner} size={14} showPresence />
                    {threadOwner.name}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)' }}><Clock size={10} strokeWidth={1.5} />{thread.duration}</span>
                {thread.tasksAdded > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-subtle)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>+{thread.tasksAdded}</span>}
                {thread.tasksModified > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: 'var(--color-warning)', background: 'var(--color-warning-subtle)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>~{thread.tasksModified}</span>}
              </div>
            </div>
            <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, marginTop: 3 }} />
          </div>
        )
      })}

      {/* Other workspace accordion sections */}
      {otherWorkspaceThreads.length > 0 && (
        <div style={{ borderTop: currentWorkspaceThreads.length > 0 ? '2px solid var(--color-border)' : 'none' }}>
          {otherWorkspaceThreads.map(({ workspace: ws, threads }) => {
            const isOpen = expandedWs === ws.id
            const statusColor = ws.status === 'active' ? 'var(--color-success)' : ws.status === 'needs-attention' ? 'var(--color-warning)' : ws.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)'
            const runningCount = threads.filter(t => t.status === 'running').length

            return (
              <div key={ws.id}>
                {/* Accordion header */}
                <button
                  onClick={() => setExpandedWs(isOpen ? null : ws.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '8px 12px',
                    background: isOpen ? 'var(--color-surface)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--color-border-subtle)',
                    color: 'var(--color-text-secondary)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, textAlign: 'left',
                    transition: 'background var(--duration-fast)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = isOpen ? 'var(--color-surface)' : 'transparent'}
                >
                  <ChevronDown size={11} strokeWidth={1.5} style={{
                    color: 'var(--color-text-tertiary)', flexShrink: 0,
                    transform: isOpen ? 'none' : 'rotate(-90deg)',
                    transition: 'transform var(--duration-fast)',
                  }} />
                  <span style={{
                    width: 18, height: 18, borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-active)', color: 'var(--color-text-secondary)',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{ws.icon}</span>
                  <span style={{ flex: 1 }}>{ws.name}</span>
                  {runningCount > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-subtle)', padding: '1px 6px', borderRadius: 'var(--radius-full)' }}>
                      {runningCount} running
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                    {threads.length}
                  </span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                </button>

                {/* Accordion body */}
                {isOpen && threads.map(thread => (
                  <div key={thread.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 12px 8px 24px',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                    background: 'var(--color-surface)',
                    transition: 'background var(--duration-fast)',
                  }}
                    onClick={() => {
                      onSwitchWorkspace(ws.id)
                      setExpandedWs(null)
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: thread.status === 'running' ? 'var(--color-success)' : thread.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.title}</span>
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{thread.createdAt}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{thread.preview}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)' }}><Bot size={9} strokeWidth={1.5} />{thread.agentName}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)' }}><Clock size={9} strokeWidth={1.5} />{thread.duration}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, marginTop: 3 }} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}

// ── Thread List View ──
function ThreadListView({ threads, onSelectThread, onArchive }: { threads: (DirectorThread & { directorName: string; directorId: string })[]; onSelectThread: (t: DirectorThread & { directorId: string }) => void; onArchive: (id: string) => void }) {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {threads.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No sessions</div>}
      {threads.map(thread => (
        <div key={thread.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', transition: `background var(--duration-fast)` }}
          onClick={() => onSelectThread(thread)}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: thread.status === 'running' ? 'var(--color-success)' : thread.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.title}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{thread.createdAt}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{thread.preview}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Bot size={9} strokeWidth={1.5} />
              {thread.directorName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-tertiary)' }}><Clock size={10} strokeWidth={1.5} />{thread.duration}</span>
              {thread.tasksAdded > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-subtle)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>+{thread.tasksAdded}</span>}
              {thread.tasksModified > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: 'var(--color-warning)', background: 'var(--color-warning-subtle)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>~{thread.tasksModified}</span>}
              {thread.tasksDeleted > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: 'var(--color-danger)', background: 'var(--color-danger-subtle)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>-{thread.tasksDeleted}</span>}
              <div style={{ flex: 1 }} />
              <Tooltip label="Archive session">
                <button onClick={e => { e.stopPropagation(); onArchive(thread.id) }} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', opacity: 0.5, transition: 'all var(--duration-fast)' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'none' }}
                ><Archive size={12} strokeWidth={1.5} /></button>
              </Tooltip>
            </div>
          </div>
          <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, marginTop: 3 }} />
        </div>
      ))}
    </div>
  )
}

// ── Shared ──
function StatusDotSmall({ status }: { status: DirectorSession['status'] }) {
  const color = status === 'running' ? 'var(--color-success)' : status === 'error' ? 'var(--color-danger)' : status === 'connecting' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'
  return <div style={{ position: 'absolute', top: -1, left: -1, width: 8, height: 8, borderRadius: '50%', background: color, border: '1.5px solid var(--color-bg-secondary)' }} />
}

// ── Auto-expanding Textarea ──
function AutoExpandTextarea({ value, onChange, placeholder, onKeyDown }: { value: string; onChange: (v: string) => void; placeholder: string; onKeyDown?: (e: React.KeyboardEvent) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [manualHeight, setManualHeight] = useState<number | null>(null)
  const lastAutoHeight = useRef<number>(0)
  const lineHeight = 20 // ~13px font * 1.5 line-height
  const minRows = 2
  const maxRows = 16
  const defaultHeight = lineHeight * minRows + 46 // 8px top + 38px bottom padding
  const maxHeight = lineHeight * maxRows + 46

  // Reset manual height when value is cleared (message sent)
  useEffect(() => {
    if (value === '') setManualHeight(null)
  }, [value])

  // Auto-expand only when no manual height is set
  useEffect(() => {
    const el = textareaRef.current
    if (!el || manualHeight !== null) return
    el.style.height = defaultHeight + 'px'
    const scrollH = el.scrollHeight
    const newHeight = Math.min(Math.max(scrollH, defaultHeight), maxHeight)
    el.style.height = newHeight + 'px'
    lastAutoHeight.current = newHeight
  }, [value, manualHeight])

  const currentHeight = manualHeight ?? defaultHeight

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = textareaRef.current?.offsetHeight ?? currentHeight

    const onPointerMove = (ev: PointerEvent) => {
      // Dragging up (negative delta) = bigger, dragging down = smaller
      const delta = startY - ev.clientY
      const newHeight = Math.min(Math.max(startHeight + delta, defaultHeight), maxHeight)
      setManualHeight(newHeight)
      if (textareaRef.current) textareaRef.current.style.height = newHeight + 'px'
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }, [currentHeight, defaultHeight, maxHeight])

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={minRows}
        style={{
          width: '100%', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
          padding: '8px 12px 38px', color: 'var(--color-text)', fontSize: 13, lineHeight: '20px', outline: 'none',
          resize: 'none', minHeight: defaultHeight, overflow: 'auto',
          fontFamily: 'var(--font-sans)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          boxSizing: 'border-box',
        }}
      />
      {/* Custom top-right resize handle */}
      <div
        onPointerDown={handleDragStart}
        style={{
          position: 'absolute', top: 2, right: 4,
          width: 16, height: 10, cursor: 'ns-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.3, transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
        title="Drag to resize"
      >
        <svg width="10" height="5" viewBox="0 0 10 5" fill="none">
          <line x1="1" y1="1" x2="9" y2="1" stroke="var(--color-text-tertiary)" strokeWidth="1" strokeLinecap="round" />
          <line x1="3" y1="3.5" x2="7" y2="3.5" stroke="var(--color-text-tertiary)" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

/* ── Plan / Todo List block ── */
function PlanTodoBlock({ title, items }: { title: string; items: { label: string; checked: boolean }[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const doneCount = items.filter(i => i.checked).length

  return (
    <div style={{ borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)' }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 12px',
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)',
          fontSize: 11, fontWeight: 600, textAlign: 'left',
        }}
      >
        <ListChecks size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {doneCount}/{items.length}
        </span>
        <ChevronDown size={10} strokeWidth={1.5} style={{
          color: 'var(--color-text-tertiary)', flexShrink: 0,
          transform: collapsed ? 'rotate(-90deg)' : 'none',
          transition: `transform var(--duration-fast)`,
        }} />
      </button>
      {/* Items */}
      {!collapsed && (
        <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 0' }}>
              <div style={{
                width: 14, height: 14, marginTop: 1, borderRadius: 3, flexShrink: 0,
                border: item.checked ? 'none' : '1.5px solid var(--color-border)',
                background: item.checked ? 'var(--color-primary)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.checked && <Check size={10} strokeWidth={2.5} style={{ color: 'white' }} />}
              </div>
              <span style={{
                fontSize: 12, lineHeight: '16px',
                color: item.checked ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                textDecoration: item.checked ? 'line-through' : 'none',
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Input toolbar helpers ── */
function ToolbarBtn({ children, title, onClick, active, accent }: { children: React.ReactNode; title: string; onClick?: () => void; active?: boolean; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        height: 26, display: 'flex', alignItems: 'center', gap: 3, padding: '0 6px',
        background: accent ? 'var(--color-primary)' : active ? 'var(--color-surface-hover)' : 'none',
        border: 'none', borderRadius: 'var(--radius-sm)',
        color: accent ? 'white' : 'var(--color-text-tertiary)',
        cursor: 'pointer', fontSize: 11, transition: `all var(--duration-fast)`,
      }}
      onMouseEnter={e => { if (!accent && !active) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { if (!accent && !active) e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

function MenuRow({ icon: Icon, label, onClick, suffix, mono }: { icon: typeof Plus; label: string; onClick?: () => void; suffix?: React.ReactNode; mono?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
        background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
        color: 'var(--color-text-primary)', fontSize: 12,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        cursor: 'pointer', textAlign: 'left', transition: `background var(--duration-fast)`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      <Icon size={13} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--color-text-tertiary)' }} />
      <span style={{ flex: 1 }}>{label}</span>
      {suffix}
    </button>
  )
}

function SelectRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 8px',
        background: selected ? 'var(--color-primary-subtle)' : 'none',
        border: 'none', borderRadius: 'var(--radius-sm)',
        color: selected ? 'var(--color-text-accent)' : 'var(--color-text-primary)',
        fontSize: 12, cursor: 'pointer', textAlign: 'left',
        transition: `background var(--duration-fast)`,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'none' }}
    >
      {selected ? <Check size={11} strokeWidth={2} style={{ flexShrink: 0 }} /> : <span style={{ width: 11, flexShrink: 0 }} />}
      {label}
    </button>
  )
}

function SessionButton({ icon: Icon, label, color, badge }: { icon: typeof Play; label: string; color?: string; badge?: number }) {
  return (
    <Tooltip label={label}>
      <button style={{ height: 26, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)', color: color || 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: `all var(--duration-fast)`, position: 'relative' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
      >
        <Icon size={13} strokeWidth={1.5} />{label}
        {badge !== undefined && badge > 0 && <span style={{ minWidth: 14, height: 14, borderRadius: 'var(--radius-full)', background: 'var(--color-primary)', color: 'white', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{badge}</span>}
      </button>
    </Tooltip>
  )
}
