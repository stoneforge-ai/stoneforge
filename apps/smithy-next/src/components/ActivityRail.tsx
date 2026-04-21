import {
  SquareKanban,
  Code,
  GitMerge,
  Zap,
  Bot,
  CircleDot,
  Eye,
  Settings,
  FileText,
  MessageSquare,
  BarChart3,
  Network,
  Sun,
  Moon,
  MoreHorizontal,
  LayoutGrid,
  Plus,
  User,
  Users,
  Keyboard,
  LogOut,
  Building2,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { Tooltip } from './Tooltip'
import { PresenceDot } from './PresenceDot'
import type { WorkspaceInfo, AppMode, StoneforgeUser } from '../mock-data'

interface ActivityRailProps {
  activeView: View
  onNavigate: (view: View) => void
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
  workspaces?: WorkspaceInfo[]
  activeWorkspaceId?: string
  onSwitchWorkspace?: (id: string) => void
  onNewWorkspace?: () => void
  appMode?: AppMode
  currentUser?: StoneforgeUser
  onToggleMode?: () => void
}

type View = 'kanban' | 'whiteboard' | 'editor' | 'merge-requests' | 'ci' | 'preview' | 'sessions' | 'diff' | 'task-detail' | 'automations' | 'agents' | 'settings' | 'documents' | 'channels' | 'plans' | 'metrics' | 'workspaces'

const primaryItems: { id: View; icon: typeof SquareKanban; label: string; shortcut?: string }[] = [
  { id: 'kanban', icon: SquareKanban, label: 'Tasks', shortcut: '1' },
  { id: 'merge-requests', icon: GitMerge, label: 'Merge Requests', shortcut: '2' },
  { id: 'ci', icon: CircleDot, label: 'CI/CD', shortcut: '3' },
  { id: 'preview', icon: Eye, label: 'Preview', shortcut: '4' },
  { id: 'agents', icon: Bot, label: 'Agents', shortcut: '5' },
  { id: 'automations', icon: Zap, label: 'Automations', shortcut: '6' },
]

const secondaryItems: { id: View; icon: typeof FileText; label: string }[] = [
  { id: 'editor', icon: Code, label: 'Editor' },
  { id: 'documents', icon: FileText, label: 'Documents' },
  { id: 'channels', icon: MessageSquare, label: 'Channels' },
  { id: 'metrics', icon: BarChart3, label: 'Metrics' },
]

// Status dot: muted but readable — communicates workspace health
const statusDotColors = {
  active: 'rgba(34, 197, 94, 0.7)',       // green: agents running, all good
  'needs-attention': 'rgba(245, 158, 11, 0.75)', // amber: something finished, review needed
  error: 'rgba(239, 68, 68, 0.75)',        // red: agent failed
  idle: 'rgba(107, 107, 112, 0.35)',       // dim gray: nothing happening
} as const

// Left-bar color per status (shown on active workspace instead of blue)
const statusBarColors = {
  active: 'var(--color-primary)',
  'needs-attention': 'rgba(245, 158, 11, 0.8)',
  error: 'rgba(239, 68, 68, 0.8)',
  idle: 'var(--color-primary)',
} as const

export function ActivityRail({ activeView, onNavigate, theme, onToggleTheme, workspaces = [], activeWorkspaceId, onSwitchWorkspace, onNewWorkspace, appMode = 'solo', currentUser, onToggleMode }: ActivityRailProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [wsOverflowOpen, setWsOverflowOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const wsOverflowRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const isTeamMode = appMode === 'team'

  // Sort workspaces by most recently opened, limit to 5 visible
  const sortedWorkspaces = [...workspaces].sort((a, b) => b.lastOpened - a.lastOpened)
  const visibleWorkspaces = sortedWorkspaces.slice(0, 5)
  const overflowWorkspaces = sortedWorkspaces.slice(5)

  useEffect(() => {
    if (!moreOpen) return
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreOpen])

  useEffect(() => {
    if (!wsOverflowOpen) return
    const handler = (e: MouseEvent) => {
      if (wsOverflowRef.current && !wsOverflowRef.current.contains(e.target as Node)) {
        setWsOverflowOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [wsOverflowOpen])

  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  const isSecondaryActive = secondaryItems.some(i => i.id === activeView)

  return (
    <div
      className="activity-rail"
      style={{
        width: 48,
        minWidth: 48,
        height: '100%',
        background: 'var(--color-bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 8,
        gap: 2,
        borderRight: '1px solid var(--color-border)',
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <img src="/logo.svg" alt="Stoneforge" style={{ width: 24, height: 24, objectFit: 'contain' }} />
      </div>

      {/* Workspace pips — inset zone */}
      {workspaces.length > 0 && (
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          padding: 3,
          marginBottom: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          position: 'relative',
        }} ref={wsOverflowRef}>
          {visibleWorkspaces.map(ws => {
            const isActive = ws.id === activeWorkspaceId
            const barColor = statusBarColors[ws.status]
            const needsAttention = ws.status === 'needs-attention' || ws.status === 'error'
            const totalTasks = (ws.tasksRunning || 0) + (ws.tasksInReview || 0) + (ws.tasksBlocked || 0)
            return (
              <Tooltip
                key={ws.id}
                label={`${ws.name}${totalTasks > 0 || ws.completedSinceLastVisit > 0 ? ` — ${[ws.tasksRunning && `${ws.tasksRunning} running`, ws.tasksInReview && `${ws.tasksInReview} review`, ws.tasksBlocked && `${ws.tasksBlocked} blocked`, ws.completedSinceLastVisit && `${ws.completedSinceLastVisit} completed`].filter(Boolean).join(', ')}` : ''}${ws.status === 'needs-attention' ? ' · needs attention' : ws.status === 'error' ? ' · error' : ''}`}
                placement="right"
              >
                <button
                  onClick={() => onSwitchWorkspace?.(ws.id)}
                  style={{
                    width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none',
                    background: isActive ? 'var(--color-surface-active)' : 'var(--color-bg)',
                    color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    transition: 'all var(--duration-fast)',
                    position: 'relative',
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--color-bg)'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
                >
                  {ws.icon}
                  {/* Active indicator — left bar, colored by status */}
                  {isActive && (
                    <div style={{
                      position: 'absolute', left: -6, top: 8, bottom: 8,
                      width: 2, borderRadius: 1,
                      background: barColor,
                    }} />
                  )}
                  {/* Bottom micro-bar: segmented task status (green=running, amber=review, red=blocked) */}
                  {totalTasks > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 3, right: 3,
                      height: 2, borderRadius: 1,
                      display: 'flex', gap: 0,
                      overflow: 'hidden',
                      background: 'rgba(107, 107, 112, 0.15)',
                    }}>
                      {ws.tasksRunning > 0 && <div style={{ flex: ws.tasksRunning, background: 'rgba(34, 197, 94, 0.7)' }} />}
                      {ws.tasksInReview > 0 && <div style={{ flex: ws.tasksInReview, background: 'rgba(245, 158, 11, 0.7)' }} />}
                      {ws.tasksBlocked > 0 && <div style={{ flex: ws.tasksBlocked, background: 'rgba(239, 68, 68, 0.7)' }} />}
                    </div>
                  )}
                  {/* Team notification dot — small red dot at top-right for unread team notifications */}
                  {isTeamMode && !isActive && needsAttention && ws.completedSinceLastVisit === 0 && (
                    <div style={{
                      position: 'absolute', top: -1, right: -1,
                      width: 4, height: 4, borderRadius: '50%',
                      background: 'var(--color-danger)',
                    }} />
                  )}
                  {/* Corner badge: unseen completions since last visit */}
                  {ws.completedSinceLastVisit > 0 && !isActive && (
                    <div style={{
                      position: 'absolute', top: -4, right: -4,
                      minWidth: 13, height: 13, borderRadius: 'var(--radius-full)',
                      background: needsAttention ? 'rgb(180, 100, 0)' : 'var(--color-primary)',
                      color: 'white',
                      fontSize: 8, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 2px',
                      border: '1.5px solid var(--color-surface)',
                      animation: needsAttention ? 'ws-attention 2.5s ease-in-out infinite' : 'none',
                    }}>
                      {ws.completedSinceLastVisit}
                    </div>
                  )}
                </button>
              </Tooltip>
            )
          })}
          {/* Workspace overflow — uses ChevronsUpDown to distinguish from nav "more" */}
          <Tooltip label="More workspaces" placement="right" disabled={wsOverflowOpen}>
            <button
              onClick={() => setWsOverflowOpen(!wsOverflowOpen)}
              style={{
                width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none',
                background: wsOverflowOpen ? 'var(--color-surface-hover)' : 'transparent',
                color: 'var(--color-text-tertiary)', cursor: 'pointer',
                transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { if (!wsOverflowOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' } }}
            >
              <MoreHorizontal size={13} strokeWidth={1.5} />
            </button>
          </Tooltip>
          {wsOverflowOpen && (
            <div style={{
              position: 'absolute', left: 52, top: 0,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 4, minWidth: 200,
              boxShadow: 'var(--shadow-float)',
              zIndex: 'var(--z-dropdown)' as unknown as number,
            }}>
              {overflowWorkspaces.length > 0 && (
                <>
                  <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>More workspaces</div>
                  {overflowWorkspaces.map(ws => {
                    const dotColor = statusDotColors[ws.status]
                    return (
                      <button
                        key={ws.id}
                        onClick={() => { onSwitchWorkspace?.(ws.id); setWsOverflowOpen(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '6px 10px', border: 'none',
                          background: 'transparent', color: 'var(--color-text)',
                          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          fontSize: 12, textAlign: 'left',
                          transition: 'background var(--duration-fast)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-surface-active)', color: 'var(--color-text-secondary)',
                          fontSize: 9, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>{ws.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500 }}>{ws.name}</div>
                          {ws.repo && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{ws.repo}</div>}
                        </div>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      </button>
                    )
                  })}
                  <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
                </>
              )}
              <button
                onClick={() => { setWsOverflowOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 10px', border: 'none',
                  background: 'transparent', color: 'var(--color-text-accent)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, textAlign: 'left',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Network size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                All Workspaces
              </button>
              <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
              <button
                onClick={() => { onNewWorkspace?.(); setWsOverflowOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 10px', border: 'none',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, textAlign: 'left',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Plus size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                New Workspace
              </button>
            </div>
          )}
        </div>
      )}

      {/* Primary nav + More button — uses Grid2x2 icon to distinguish from workspace overflow */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }} ref={moreRef}>
        {primaryItems.map(item => {
          const isActive = activeView === item.id
          return (
            <RailButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              shortcut={item.shortcut}
              isActive={isActive}
              onClick={() => onNavigate(item.id)}
            />
          )
        })}
        <button
          onMouseEnter={() => setMoreOpen(true)}
          onClick={() => setMoreOpen(o => !o)}
          style={{
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: (isSecondaryActive || moreOpen) ? 'var(--color-primary-subtle)' : 'transparent',
            color: (isSecondaryActive || moreOpen) ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', transition: 'all var(--duration-fast)',
            position: 'relative',
          }}
        >
          {(isSecondaryActive || moreOpen) && (
            <div style={{ position: 'absolute', left: -6, top: 8, bottom: 8, width: 2, borderRadius: 1, background: 'var(--color-primary)' }} />
          )}
          <LayoutGrid size={18} strokeWidth={1.5} />
        </button>

        {/* More dropdown */}
        {moreOpen && (
          <div
            onMouseLeave={() => setMoreOpen(false)}
            style={{
              position: 'absolute',
              left: 52,
              top: primaryItems.length * 38,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 4,
              minWidth: 180,
              boxShadow: 'var(--shadow-float)',
              zIndex: 'var(--z-dropdown)' as unknown as number,
            }}
          >
            {secondaryItems.map(item => (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setMoreOpen(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: activeView === item.id ? 'var(--color-primary-subtle)' : 'transparent',
                  color: activeView === item.id ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                  transition: `background var(--duration-fast)`,
                }}
                onMouseEnter={e => {
                  if (activeView !== item.id) e.currentTarget.style.background = 'var(--color-surface-hover)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = activeView === item.id ? 'var(--color-primary-subtle)' : 'transparent'
                }}
              >
                <item.icon size={16} strokeWidth={1.5} />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Mode toggle + Theme toggle + Settings + User avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
        {onToggleTheme && (
          <Tooltip label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} placement="right">
            <button
              onClick={onToggleTheme}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', borderRadius: 'var(--radius-sm)',
                background: 'transparent', color: 'var(--color-text-tertiary)',
                cursor: 'pointer', transition: `all var(--duration-fast)`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
            </button>
          </Tooltip>
        )}

        <RailButton
          icon={Settings}
          label="Settings"
          isActive={activeView === 'settings'}
          onClick={() => onNavigate('settings')}
        />

        {/* User avatar */}
        {currentUser && (
          <div ref={userMenuRef} style={{ position: 'relative', marginTop: 2 }}>
            <Tooltip label={currentUser.name} placement="right" disabled={userMenuOpen}>
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: 'none',
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-text-accent)',
                  fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative',
                  transition: 'all var(--duration-fast)',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--color-primary-muted)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
              >
                {currentUser.avatar}
                {/* Presence dot — team mode only */}
                {isTeamMode && (
                  <PresenceDot
                    status={currentUser.presence}
                    size={6}
                    style={{ position: 'absolute', bottom: -1, right: -1 }}
                  />
                )}
              </button>
            </Tooltip>

            {/* User menu dropdown */}
            {userMenuOpen && (
              <div style={{
                position: 'absolute', bottom: 0, left: 40,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 4, minWidth: 200,
                boxShadow: 'var(--shadow-float)',
                zIndex: 'var(--z-dropdown)' as unknown as number,
              }}>
                {/* Name + email header */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{currentUser.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{currentUser.email}</div>
                </div>

                {/* Team mode: status selector */}
                {isTeamMode && (
                  <>
                    <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Status</div>
                    {(['online', 'away', 'offline'] as const).map(status => (
                      <button
                        key={status}
                        onClick={() => setUserMenuOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '6px 10px', border: 'none',
                          background: currentUser.presence === status ? 'var(--color-surface-hover)' : 'transparent',
                          color: 'var(--color-text)', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer', fontSize: 12, textAlign: 'left',
                          transition: 'background var(--duration-fast)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = currentUser.presence === status ? 'var(--color-surface-hover)' : 'transparent'}
                      >
                        <PresenceDot status={status} size={6} style={{ position: 'relative' }} />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </button>
                    ))}
                    <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
                  </>
                )}

                {/* Common menu items */}
                <button
                  onClick={() => { onNavigate('settings'); setUserMenuOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '6px 10px', border: 'none',
                    background: 'transparent', color: 'var(--color-text)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: 12, textAlign: 'left',
                    transition: 'background var(--duration-fast)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Settings size={14} strokeWidth={1.5} />
                  Settings
                </button>
                <button
                  onClick={() => setUserMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '6px 10px', border: 'none',
                    background: 'transparent', color: 'var(--color-text)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: 12, textAlign: 'left',
                    transition: 'background var(--duration-fast)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Keyboard size={14} strokeWidth={1.5} />
                  Keyboard Shortcuts
                </button>

                {/* Team mode: org settings + sign out */}
                {isTeamMode && (
                  <>
                    {currentUser.role === 'admin' && (
                      <button
                        onClick={() => { onNavigate('settings'); setUserMenuOpen(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '6px 10px', border: 'none',
                          background: 'transparent', color: 'var(--color-text)',
                          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          fontSize: 12, textAlign: 'left',
                          transition: 'background var(--duration-fast)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Building2 size={14} strokeWidth={1.5} />
                        Org Settings
                      </button>
                    )}
                    <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
                    <button
                      onClick={() => setUserMenuOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '6px 10px', border: 'none',
                        background: 'transparent', color: 'var(--color-danger)',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        fontSize: 12, textAlign: 'left',
                        transition: 'background var(--duration-fast)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-danger-subtle)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <LogOut size={14} strokeWidth={1.5} />
                      Sign Out
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RailButton({
  icon: Icon,
  label,
  shortcut,
  isActive,
  onClick,
  hideTooltip,
}: {
  icon: typeof SquareKanban
  label: string
  shortcut?: string
  isActive: boolean
  onClick: () => void
  hideTooltip?: boolean
}) {
  return (
    <Tooltip label={label} shortcut={shortcut ? `⌘${shortcut}` : undefined} placement="right" disabled={hideTooltip}>
      <button
        onClick={onClick}
        style={{
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: isActive ? 'var(--color-primary-subtle)' : 'transparent',
          color: isActive ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
          cursor: 'pointer',
          transition: `all var(--duration-fast)`,
          position: 'relative',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = isActive ? 'var(--color-primary-subtle)' : 'transparent'}
      >
        {isActive && (
          <div
            style={{
              position: 'absolute',
              left: -6,
              top: 8,
              bottom: 8,
              width: 2,
              borderRadius: 1,
              background: 'var(--color-primary)',
            }}
          />
        )}
        <Icon size={18} strokeWidth={1.5} />
      </button>
    </Tooltip>
  )
}
