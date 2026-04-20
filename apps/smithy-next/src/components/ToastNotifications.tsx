import { useState, useEffect, useCallback } from 'react'
import { X, ArrowRight, CheckCircle2, AlertCircle, GitPullRequest, CircleDot, MessageCircle, Users } from 'lucide-react'
import type { WorkspaceInfo } from '../mock-data'
import { TEAM_MEMBERS } from '../mock-data'

export interface ToastItem {
  id: string
  workspaceId: string
  type: 'agent-completed' | 'agent-error' | 'mr-review' | 'ci-failed' | 'ci-passed' | 'agent-needs-input' | 'team-change'
  message: string
  timestamp: string
  actorId?: string
}

interface ToastNotificationsProps {
  toasts: ToastItem[]
  workspaces: WorkspaceInfo[]
  onDismiss: (id: string) => void
  onSwitch: (workspaceId: string) => void
}

const typeConfig: Record<ToastItem['type'], { icon: typeof CheckCircle2; color: string; label: string }> = {
  'agent-completed': { icon: CheckCircle2, color: 'var(--color-success)', label: 'Completed' },
  'agent-error': { icon: AlertCircle, color: 'var(--color-danger)', label: 'Error' },
  'mr-review': { icon: GitPullRequest, color: 'var(--color-primary)', label: 'Review' },
  'ci-failed': { icon: CircleDot, color: 'var(--color-danger)', label: 'CI Failed' },
  'ci-passed': { icon: CircleDot, color: 'var(--color-success)', label: 'CI Passed' },
  'agent-needs-input': { icon: MessageCircle, color: 'var(--color-warning)', label: 'Input Needed' },
  'team-change': { icon: Users, color: 'var(--color-primary)', label: 'Team Update' },
}

export function ToastNotifications({ toasts, workspaces, onDismiss, onSwitch }: ToastNotificationsProps) {
  const visible = toasts.slice(0, 3)

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {visible.map(toast => (
        <ToastCard
          key={toast.id}
          toast={toast}
          workspace={workspaces.find(w => w.id === toast.workspaceId)}
          onDismiss={() => onDismiss(toast.id)}
          onSwitch={() => onSwitch(toast.workspaceId)}
        />
      ))}
    </div>
  )
}

function ToastCard({ toast, workspace, onDismiss, onSwitch }: {
  toast: ToastItem
  workspace?: WorkspaceInfo
  onDismiss: () => void
  onSwitch: () => void
}) {
  const [hovering, setHovering] = useState(false)
  const [exiting, setExiting] = useState(false)

  const handleDismiss = useCallback(() => {
    setExiting(true)
    setTimeout(onDismiss, 200)
  }, [onDismiss])

  // Auto-dismiss: 5s for team-change, 8s otherwise. Pause on hover.
  useEffect(() => {
    if (hovering) return
    const delay = toast.type === 'team-change' ? 5000 : 8000
    const timer = setTimeout(handleDismiss, delay)
    return () => clearTimeout(timer)
  }, [hovering, handleDismiss, toast.type])

  const config = typeConfig[toast.type]
  const Icon = config.icon
  const actor = toast.type === 'team-change' && toast.actorId
    ? TEAM_MEMBERS.find(m => m.id === toast.actorId)
    : undefined

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        width: 340,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-float)',
        padding: '12px 14px',
        pointerEvents: 'auto',
        animation: exiting ? 'toastExit 200ms ease-in forwards' : 'toastEnter 300ms ease-out',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateX(100%)' : 'none',
        transition: 'opacity 200ms, transform 200ms',
      }}
    >
      {/* Header: workspace + dismiss */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 20, height: 20, borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface-active)', color: 'var(--color-text-secondary)',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {workspace?.icon || '?'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', flex: 1 }}>
          {workspace?.name || 'Unknown'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{toast.timestamp}</span>
        <button
          onClick={handleDismiss}
          style={{
            width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            transition: 'all var(--duration-fast)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        {actor ? (
          <span style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
            background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)',
            fontSize: 8, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {actor.avatar}
          </span>
        ) : (
          <Icon size={14} strokeWidth={1.5} style={{ color: config.color, flexShrink: 0, marginTop: 1 }} />
        )}
        <span style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.5 }}>
          {toast.message}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={() => { onSwitch(); handleDismiss() }}
          style={{
            height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 500,
            transition: 'all var(--duration-fast)',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Switch <ArrowRight size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
