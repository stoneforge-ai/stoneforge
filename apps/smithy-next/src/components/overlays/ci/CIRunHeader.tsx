import { useState } from 'react'
import { ArrowLeft, Check, X, Clock, Loader, Ban, SkipForward, GitBranch, GitPullRequest, Bot, RotateCcw, ChevronDown, Square, MoreHorizontal, ExternalLink, FileCode, Trash2, Zap, User } from 'lucide-react'
import type { CIRun } from './ci-types'
import { useTeamContext } from '../../../TeamContext'

interface CIRunHeaderProps {
  run: CIRun
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToAutomation?: (workflowId: string) => void
}

const statusConfig: Record<string, { icon: typeof Check; color: string; label: string }> = {
  success: { icon: Check, color: 'var(--color-success)', label: 'Success' },
  failure: { icon: X, color: 'var(--color-danger)', label: 'Failed' },
  running: { icon: Loader, color: 'var(--color-warning)', label: 'Running' },
  queued: { icon: Clock, color: 'var(--color-text-tertiary)', label: 'Queued' },
  cancelled: { icon: Ban, color: 'var(--color-text-tertiary)', label: 'Cancelled' },
  skipped: { icon: SkipForward, color: 'var(--color-text-tertiary)', label: 'Skipped' },
}

const eventLabels: Record<string, string> = {
  push: 'push',
  pull_request: 'pull request',
  schedule: 'schedule',
  manual: 'manual',
  merge_group: 'merge group',
}

export function CIRunHeader({ run, onBack, onNavigateToTask, onNavigateToMR, onNavigateToAutomation }: CIRunHeaderProps) {
  const [rerunOpen, setRerunOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const { getUserById, isTeamMode } = useTeamContext()
  const actorUser = run.actorUserId ? getUserById(run.actorUserId) : undefined
  const sc = statusConfig[run.status] || statusConfig.queued
  const StatusIcon = sc.icon
  const hasFailed = run.jobs.some(j => j.status === 'failure')
  const isActive = run.status === 'running' || run.status === 'queued'

  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)', padding: '12px 16px' }}>
      {/* Top row: back + status + name + spacer + link chips (matching MR header) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button onClick={onBack} style={backBtnStyle}><ArrowLeft size={14} strokeWidth={1.5} /></button>
        <StatusIcon size={16} strokeWidth={2} style={{ color: sc.color, flexShrink: 0, ...(run.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          {run.action.name} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--color-text-secondary)' }}>#{run.runNumber}</span>
        </h1>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 500, background: sc.color === 'var(--color-success)' ? 'var(--color-success-subtle)' : sc.color === 'var(--color-danger)' ? 'var(--color-danger-subtle)' : sc.color === 'var(--color-warning)' ? 'var(--color-warning-subtle)' : 'var(--color-surface)', color: sc.color }}>
          {sc.label}
        </span>

        <div style={{ flex: 1 }} />

        {/* Task ID link — top right, matching MR header pattern */}
        {run.linkedTaskId && (
          <button
            onClick={() => onNavigateToTask?.(run.linkedTaskId!)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-accent)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
          >
            {run.linkedTaskId}
            <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
          </button>
        )}

        {/* MR link — top right */}
        {run.linkedMRId && (
          <button
            onClick={() => onNavigateToMR?.(run.linkedMRId!)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <GitPullRequest size={12} strokeWidth={1.5} />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{run.linkedMRId}</span>
          </button>
        )}

        {/* Agent link — top right */}
        {run.triggeredByAgent && (
          <button
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
          >
            <Bot size={12} strokeWidth={1.5} />
            {run.triggeredByAgent}
          </button>
        )}

        {/* Automation workflow link — top right */}
        {run.triggeredByWorkflowId && (
          <button
            onClick={() => onNavigateToAutomation?.(run.triggeredByWorkflowId!)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <Zap size={12} strokeWidth={1.5} style={{ color: 'var(--color-warning)' }} />
            {run.triggeredByWorkflowName || 'Workflow'}
          </button>
        )}
      </div>

      {/* Title: commit message */}
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8, lineHeight: 1.4 }}>
        {run.commitMessage}
      </div>

      {/* Metadata + action buttons row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {eventLabels[run.event] || run.event}
        </span>

        {/* Actor attribution */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {run.triggeredByAgent ? (
            <>
              <Bot size={12} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
              <span>{run.actor}</span>
              {isTeamMode && actorUser && (
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>({actorUser.name})</span>
              )}
            </>
          ) : actorUser ? (
            <>
              <span style={{ position: 'relative', width: 16, height: 16, borderRadius: '50%', background: 'var(--color-surface-active)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                {actorUser.avatar}
                {isTeamMode && (
                  <span style={{ position: 'absolute', bottom: -1, right: -1, width: 5, height: 5, borderRadius: '50%', background: `var(--color-presence-${actorUser.presence})`, border: '1px solid var(--color-bg)' }} />
                )}
              </span>
              <span>{actorUser.name}</span>
            </>
          ) : (
            <>
              <User size={12} strokeWidth={1.5} />
              <span>{run.actor}</span>
            </>
          )}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GitBranch size={12} strokeWidth={1.5} /> {run.branch}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{run.commit}</span>
        <span>{run.createdAt}</span>
        {run.duration && <span>· {run.duration}</span>}

        <div style={{ flex: 1 }} />
        {/* Re-run dropdown */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex' }}>
            <button style={{ ...actionBtnStyle, borderRadius: hasFailed ? 'var(--radius-sm) 0 0 var(--radius-sm)' : 'var(--radius-sm)' }}>
              <RotateCcw size={12} strokeWidth={1.5} /> Re-run all
            </button>
            {hasFailed && (
              <button
                onClick={() => setRerunOpen(!rerunOpen)}
                style={{ ...actionBtnStyle, padding: '0 6px', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', boxShadow: 'inset 1px 0 0 var(--color-border-subtle)' }}
              >
                <ChevronDown size={11} strokeWidth={1.5} />
              </button>
            )}
          </div>
          {rerunOpen && (
            <div style={{ position: 'absolute', top: 32, right: 0, zIndex: 1060, width: 180, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4 }}>
              <button onClick={() => setRerunOpen(false)} style={menuItemStyle}>
                <RotateCcw size={12} strokeWidth={1.5} /> Re-run failed jobs
              </button>
            </div>
          )}
        </div>

        {isActive && (
          <button style={actionBtnStyle}>
            <Square size={12} strokeWidth={1.5} /> Cancel
          </button>
        )}

        {/* More menu */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMoreOpen(!moreOpen)} style={actionBtnStyle}>
            <MoreHorizontal size={14} strokeWidth={1.5} />
          </button>
          {moreOpen && (
            <div style={{ position: 'absolute', top: 32, right: 0, zIndex: 1060, width: 200, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4 }}>
              <button onClick={() => setMoreOpen(false)} style={menuItemStyle}>
                <FileCode size={12} strokeWidth={1.5} /> View action file
              </button>
              <button onClick={() => { setMoreOpen(false); setDeleteConfirm(true) }} style={{ ...menuItemStyle, color: 'var(--color-danger)' }}>
                <Trash2 size={12} strokeWidth={1.5} /> Delete run
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <>
          <div onClick={() => setDeleteConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 400, maxWidth: '90vw',
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
            zIndex: 1050, padding: '20px',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
              Delete run?
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Are you sure you want to delete <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{run.action.name} #{run.runNumber}</span>? This action cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleteConfirm(false)} style={{
                height: 32, padding: '0 14px', border: 'none', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                Cancel
              </button>
              <button onClick={() => { console.log('Delete run', run.id); setDeleteConfirm(false) }} style={{
                height: 32, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 5,
                border: 'none', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-danger)', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <Trash2 size={12} strokeWidth={1.5} /> Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const backBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
}

const actionBtnStyle: React.CSSProperties = {
  height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
  background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
}

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
  background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, textAlign: 'left',
}
