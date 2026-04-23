import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCircle2, AlertCircle, GitPullRequest, CircleDot, MessageCircle, Settings, AtSign, UserPlus, Shield } from 'lucide-react'
import { Tooltip } from './Tooltip'
import { TEAM_MEMBERS } from '../mock-data'
import type { NotificationItem, WorkspaceInfo } from '../mock-data'

interface NotificationInboxProps {
  notifications: NotificationItem[]
  workspaces: WorkspaceInfo[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onSwitch: (workspaceId: string) => void
  onOpenSettings: () => void
  isTeamMode?: boolean
}

const typeIcon: Record<NotificationItem['type'], { icon: typeof CheckCircle2; color: string }> = {
  'agent-completed': { icon: CheckCircle2, color: 'var(--color-success)' },
  'agent-error': { icon: AlertCircle, color: 'var(--color-danger)' },
  'mr-review': { icon: GitPullRequest, color: 'var(--color-primary)' },
  'ci-failed': { icon: CircleDot, color: 'var(--color-danger)' },
  'ci-passed': { icon: CircleDot, color: 'var(--color-success)' },
  'agent-needs-input': { icon: MessageCircle, color: 'var(--color-warning)' },
  'mention': { icon: AtSign, color: 'var(--color-primary)' },
  'assignment': { icon: UserPlus, color: 'var(--color-primary)' },
  'review-request': { icon: GitPullRequest, color: 'var(--color-warning)' },
  'deployment-approval': { icon: Shield, color: 'var(--color-warning)' },
}

type FilterTab = 'all' | 'mentions' | 'assigned' | 'reviews'

const filterTabConfig: { id: FilterTab; label: string; types: NotificationItem['type'][] }[] = [
  { id: 'all', label: 'All', types: [] },
  { id: 'mentions', label: 'Mentions', types: ['mention'] },
  { id: 'assigned', label: 'Assigned', types: ['assignment'] },
  { id: 'reviews', label: 'Reviews', types: ['review-request', 'deployment-approval'] },
]

export function NotificationInbox({ notifications, workspaces, onMarkRead, onMarkAllRead, onSwitch, onOpenSettings, isTeamMode = false }: NotificationInboxProps) {
  const [open, setOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const ref = useRef<HTMLDivElement>(null)

  // Team-only notification types — hidden in solo mode
  const teamOnlyTypes: NotificationItem['type'][] = ['mention', 'assignment', 'review-request', 'deployment-approval']
  const modeFiltered = isTeamMode ? notifications : notifications.filter(n => !teamOnlyTypes.includes(n.type))
  const unreadCount = modeFiltered.filter(n => !n.read).length

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Apply active tab filter on top of mode-filtered list
  const activeTabConfig = filterTabConfig.find(t => t.id === activeFilter)
  const filtered = activeFilter === 'all'
    ? modeFiltered
    : modeFiltered.filter(n => activeTabConfig?.types.includes(n.type))

  // Group notifications: today vs earlier
  const today: NotificationItem[] = []
  const earlier: NotificationItem[] = []
  for (const n of filtered) {
    if (n.timestamp.includes('min') || n.timestamp.includes('hr') || n.timestamp === 'just now') {
      today.push(n)
    } else {
      earlier.push(n)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Tooltip label="Notifications" placement="bottom">
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: open ? 'var(--color-primary-subtle)' : 'transparent',
            color: open ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', position: 'relative',
            transition: 'all var(--duration-fast)',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
        >
          <Bell size={15} strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              minWidth: 14, height: 14, borderRadius: 'var(--radius-full)',
              background: 'var(--color-danger)', color: 'white',
              fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
            }}>
              {unreadCount}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <div style={{
          position: 'absolute', top: 36, right: 0,
          width: 340, maxHeight: 440,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-float)',
          zIndex: 1060,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '10px 12px',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => { onMarkAllRead(); }}
                style={{
                  background: 'none', border: 'none', color: 'var(--color-primary)',
                  fontSize: 11, cursor: 'pointer', fontWeight: 500,
                  padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-subtle)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Team mode: filter tabs */}
          {isTeamMode && (
            <div style={{
              display: 'flex', gap: 0, padding: '0 8px',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}>
              {filterTabConfig.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  style={{
                    padding: '6px 8px',
                    border: 'none', background: 'none',
                    color: activeFilter === tab.id ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                    fontSize: 11, fontWeight: 500,
                    cursor: 'pointer',
                    borderBottom: activeFilter === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                    transition: 'all var(--duration-fast)',
                  }}
                  onMouseEnter={e => { if (activeFilter !== tab.id) e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  onMouseLeave={e => { if (activeFilter !== tab.id) e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Notification list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                <Bell size={24} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
                <div>No notifications</div>
              </div>
            ) : (
              <>
                {today.length > 0 && (
                  <>
                    <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Today
                    </div>
                    {today.map(n => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        workspace={workspaces.find(w => w.id === n.workspaceId)}
                        isTeamMode={isTeamMode}
                        onClick={() => {
                          onMarkRead(n.id)
                          onSwitch(n.workspaceId)
                          setOpen(false)
                        }}
                      />
                    ))}
                  </>
                )}
                {earlier.length > 0 && (
                  <>
                    <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Earlier
                    </div>
                    {earlier.map(n => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        workspace={workspaces.find(w => w.id === n.workspaceId)}
                        isTeamMode={isTeamMode}
                        onClick={() => {
                          onMarkRead(n.id)
                          onSwitch(n.workspaceId)
                          setOpen(false)
                        }}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '6px 12px' }}>
            <button
              onClick={() => { onOpenSettings(); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
                fontSize: 11, cursor: 'pointer', padding: '4px 0',
                transition: 'color var(--duration-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
            >
              <Settings size={12} strokeWidth={1.5} />
              Notification settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ notification, workspace, isTeamMode = false, onClick }: {
  notification: NotificationItem
  workspace?: WorkspaceInfo
  isTeamMode?: boolean
  onClick: () => void
}) {
  const config = typeIcon[notification.type]
  const Icon = config.icon
  const actor = isTeamMode && notification.actorId
    ? TEAM_MEMBERS.find(m => m.id === notification.actorId)
    : undefined

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px',
        cursor: 'pointer',
        background: notification.read ? 'transparent' : 'var(--color-primary-subtle)',
        transition: 'background var(--duration-fast)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = notification.read ? 'transparent' : 'var(--color-primary-subtle)'}
    >
      {/* Unread dot */}
      <div style={{
        width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0,
        background: notification.read ? 'transparent' : 'var(--color-primary)',
      }} />

      {/* Actor avatar (team mode) or workspace icon (solo mode) */}
      {actor ? (
        <span
          style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)',
            fontSize: 8, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            marginTop: 1,
          }}
          title={actor.name}
        >
          {actor.avatar}
        </span>
      ) : (
        <span style={{
          width: 20, height: 20, borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface-active)', color: 'var(--color-text-secondary)',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          marginTop: 1,
        }}>
          {workspace?.icon || '?'}
        </span>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: 'var(--color-text)', lineHeight: 1.4,
          fontWeight: notification.read ? 400 : 500,
        }}>
          {notification.message}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <Icon size={10} strokeWidth={1.5} style={{ color: config.color }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{notification.timestamp}</span>
        </div>
      </div>
    </div>
  )
}
