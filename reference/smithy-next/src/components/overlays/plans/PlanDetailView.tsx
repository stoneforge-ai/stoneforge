import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, CheckCircle, FileEdit, Circle, ExternalLink, Presentation, MoreHorizontal, ChevronDown, AlertCircle, Clock, GitBranch, Activity, Tag, User, Calendar, ChevronRight } from 'lucide-react'
import { mockTasks, mockWhiteboards, currentUser, type Plan, type Task } from '../../../mock-data'
import { PLAN_STATUS_CONFIG } from './plan-types'
import type { PlanStatus } from './plan-types'

interface PlanDetailViewProps {
  plan: Plan
  onBack: () => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onNavigateToTasksBoard?: (planId: string, planName: string) => void
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'var(--color-danger)',
  high: 'var(--color-warning)',
  medium: 'var(--color-primary)',
  low: 'var(--color-text-tertiary)',
}

const STATUS_TRANSITIONS: Record<PlanStatus, { value: PlanStatus; label: string }[]> = {
  draft: [{ value: 'active', label: 'Activate' }],
  active: [{ value: 'completed', label: 'Complete' }, { value: 'cancelled', label: 'Cancel' }],
  completed: [{ value: 'draft', label: 'Reopen as Draft' }],
  cancelled: [{ value: 'draft', label: 'Reopen as Draft' }],
}

// Mock activity data for the plan
function getMockActivity(plan: Plan) {
  const activities = [
    { id: '1', type: 'task_completed' as const, text: 'SF-142-1 marked as done', agent: 'Director Alpha', time: '30 min ago' },
    { id: '2', type: 'task_started' as const, text: 'SF-142-2 moved to in progress', agent: 'Director Alpha', time: '45 min ago' },
    { id: '3', type: 'plan_activated' as const, text: 'Plan activated', agent: 'Director Alpha', time: '2 hr ago' },
    { id: '4', type: 'task_added' as const, text: 'SF-142-2 added to plan', agent: currentUser.name, time: '3 hr ago' },
  ]
  return plan.status === 'draft' ? activities.slice(2) : activities
}

export function PlanDetailView({ plan, onBack, onNavigateToTask, onNavigateToWhiteboard, onNavigateToTasksBoard }: PlanDetailViewProps) {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusMenuOpen(false)
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const linkedTasks = plan.linkedTaskIds.map(id => mockTasks.find(t => t.id === id)).filter(Boolean) as Task[]
  const whiteboard = plan.whiteboardId ? mockWhiteboards.find(wb => wb.id === plan.whiteboardId) : null
  const statusCfg = PLAN_STATUS_CONFIG[plan.status]
  const transitions = STATUS_TRANSITIONS[plan.status]
  const activities = getMockActivity(plan)

  // Progress
  const total = linkedTasks.length
  const done = linkedTasks.filter(t => t.status === 'done').length
  const inProgress = linkedTasks.filter(t => t.status === 'in_progress' || t.status === 'in_review').length
  const blocked = linkedTasks.filter(t => (t as any).blocked).length
  const remaining = total - done - inProgress
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Unique assignees
  const assignees = linkedTasks
    .map(t => t.assignee)
    .filter((a, i, arr) => a && arr.findIndex(x => x?.name === a.name) === i) as { name: string; avatar: string }[]

  // Active branches (deduplicated)
  const branches = [...new Set(linkedTasks.map(t => t.branch).filter(Boolean))] as string[]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <button onClick={onBack} style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent',
          color: 'var(--color-text-tertiary)', cursor: 'pointer',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Plans</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.name}</span>

        <div style={{ flex: 1 }} />

        {/* Status dropdown */}
        <div ref={statusRef} style={{ position: 'relative' }}>
          <button onClick={() => { setStatusMenuOpen(!statusMenuOpen); setMoreMenuOpen(false) }} style={{
            height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', cursor: 'pointer',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusCfg.color }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{statusCfg.label}</span>
            <ChevronDown size={11} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)' }} />
          </button>
          {statusMenuOpen && transitions.length > 0 && (
            <div style={{
              position: 'absolute', top: 30, right: 0, minWidth: 160,
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 1060, padding: 4,
            }}>
              {transitions.map(t => (
                <button key={t.value} onClick={() => setStatusMenuOpen(false)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
                  border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent',
                  color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: PLAN_STATUS_CONFIG[t.value].color }} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* More menu */}
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button onClick={() => { setMoreMenuOpen(!moreMenuOpen); setStatusMenuOpen(false) }} style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            color: 'var(--color-text-tertiary)', cursor: 'pointer',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
          >
            <MoreHorizontal size={14} strokeWidth={1.5} />
          </button>
          {moreMenuOpen && (
            <div style={{
              position: 'absolute', top: 30, right: 0, minWidth: 140,
              background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', zIndex: 1060, padding: 4,
            }}>
              <button onClick={() => setMoreMenuOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
                border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent',
                color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Edit plan
              </button>
              <button onClick={() => setMoreMenuOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
                border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent',
                color: 'var(--color-danger)', cursor: 'pointer', fontSize: 12,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Delete plan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Body: Main content + Sidebar ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Main Content ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', minWidth: 0 }}>
          {/* Header */}
          <div style={{ marginBottom: 4 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', margin: 0, lineHeight: 1.3 }}>{plan.name}</h2>
          </div>

          {/* Description */}
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '12px 0 24px' }}>
            {plan.description}
          </p>

          {/* Progress */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--color-surface)', marginBottom: 8 }}>
              {done > 0 && (
                <div style={{ width: `${(done / total) * 100}%`, background: 'var(--color-success)', transition: 'width var(--duration-normal)' }} />
              )}
              {inProgress > 0 && (
                <div style={{ width: `${(inProgress / total) * 100}%`, background: 'var(--color-primary)', transition: 'width var(--duration-normal)' }} />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
              <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {done} of {total} tasks completed ({pct}%)
              </span>
              <div style={{ flex: 1 }} />
              {done > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-success)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
                  {done} done
                </span>
              )}
              {inProgress > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-primary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />
                  {inProgress} in progress
                </span>
              )}
              {blocked > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-danger)' }}>
                  <AlertCircle size={11} strokeWidth={2} />
                  {blocked} blocked
                </span>
              )}
              {remaining > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-tertiary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-tertiary)' }} />
                  {remaining} remaining
                </span>
              )}
            </div>
          </div>

          {/* Tasks */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tasks ({total})
              </div>
              <div style={{ flex: 1 }} />
              {onNavigateToTasksBoard && (
                <button onClick={() => onNavigateToTasksBoard(plan.id, plan.name)} style={{
                  display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
                  color: 'var(--color-text-accent)', cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: 0,
                }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Open in Tasks board <ExternalLink size={11} strokeWidth={2} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {linkedTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => onNavigateToTask?.(task.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    background: 'var(--color-bg-elevated)', border: 'none',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                    transition: 'background var(--duration-fast)', width: '100%',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                >
                  {task.status === 'done'
                    ? <CheckCircle size={13} strokeWidth={1.5} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                    : task.status === 'in_progress' || task.status === 'in_review'
                      ? <FileEdit size={13} strokeWidth={1.5} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      : <Circle size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{task.id}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{task.title}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLORS[task.priority] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  {task.assignee && (
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)', fontSize: 9, fontWeight: 600, flexShrink: 0,
                    }}>
                      {task.assignee.avatar}
                    </span>
                  )}
                  {(task as any).blocked && (
                    <AlertCircle size={12} strokeWidth={2} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div style={{
          width: 280, minWidth: 280, flexShrink: 0,
          borderLeft: '1px solid var(--color-border)',
          overflow: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 16, flex: 1 }}>
            {/* Properties */}
            <SidebarSection title="Properties">
              <PropertyRow icon={<Activity size={12} strokeWidth={1.5} />} label="Status">
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusCfg.color }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{statusCfg.label}</span>
                </span>
              </PropertyRow>
              <PropertyRow icon={<User size={12} strokeWidth={1.5} />} label="Creator">
                <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{plan.creator}</span>
              </PropertyRow>
              <PropertyRow icon={<Calendar size={12} strokeWidth={1.5} />} label="Created">
                <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{plan.createdAt}</span>
              </PropertyRow>
              <PropertyRow icon={<Clock size={12} strokeWidth={1.5} />} label="Updated">
                <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{plan.updatedAt}</span>
              </PropertyRow>
              {plan.tags.length > 0 && (
                <PropertyRow icon={<Tag size={12} strokeWidth={1.5} />} label="Tags">
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {plan.tags.map(tag => (
                      <span key={tag} style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </PropertyRow>
              )}
            </SidebarSection>

            {/* Progress summary */}
            <SidebarSection title="Progress">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <MiniStat value={total} label="tasks" />
                <MiniStat value={done} label="done" color="var(--color-success)" />
                <MiniStat value={inProgress} label="active" color="var(--color-primary)" />
                {blocked > 0 && <MiniStat value={blocked} label="blocked" color="var(--color-danger)" />}
              </div>
              {/* Mini progress bar */}
              <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--color-surface)', marginTop: 8 }}>
                {done > 0 && <div style={{ width: `${(done / total) * 100}%`, background: 'var(--color-success)' }} />}
                {inProgress > 0 && <div style={{ width: `${(inProgress / total) * 100}%`, background: 'var(--color-primary)' }} />}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, textAlign: 'center' }}>
                {pct}% complete
              </div>
            </SidebarSection>

            {/* Agents working on this plan */}
            {assignees.length > 0 && (
              <SidebarSection title="Agents">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assignees.map(a => (
                    <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--color-primary-muted)', color: 'var(--color-text-accent)', fontSize: 9, fontWeight: 600, flexShrink: 0,
                      }}>
                        {a.avatar}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                          {linkedTasks.filter(t => t.assignee?.name === a.name).length} task{linkedTasks.filter(t => t.assignee?.name === a.name).length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      {linkedTasks.some(t => t.assignee?.name === a.name && (t.status === 'in_progress' || t.status === 'in_review')) && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} title="Active" />
                      )}
                    </div>
                  ))}
                </div>
              </SidebarSection>
            )}

            {/* Branches */}
            {branches.length > 0 && (
              <SidebarSection title="Branches">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {branches.map(branch => (
                    <div key={branch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <GitBranch size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {branch}
                      </span>
                    </div>
                  ))}
                </div>
              </SidebarSection>
            )}

            {/* Linked resources */}
            <SidebarSection title="Resources">
              {whiteboard && (
                <button
                  onClick={() => {
                    if (whiteboard.directorId && onNavigateToWhiteboard) onNavigateToWhiteboard(whiteboard.directorId)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 10px', background: 'var(--color-bg-elevated)',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', textAlign: 'left', marginBottom: 4,
                    transition: 'background var(--duration-fast)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                >
                  <Presentation size={13} strokeWidth={1.5} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{whiteboard.title}</span>
                  <ChevronRight size={11} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                </button>
              )}
              {onNavigateToTasksBoard && (
                <button
                  onClick={() => onNavigateToTasksBoard(plan.id, plan.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 10px', background: 'var(--color-bg-elevated)',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background var(--duration-fast)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                >
                  <ExternalLink size={13} strokeWidth={1.5} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text)', flex: 1 }}>Tasks board</span>
                  <ChevronRight size={11} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                </button>
              )}
              {!whiteboard && !onNavigateToTasksBoard && (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No linked resources</div>
              )}
            </SidebarSection>

            {/* Activity feed */}
            <SidebarSection title="Activity">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {activities.map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', gap: 8, position: 'relative', paddingBottom: i < activities.length - 1 ? 12 : 0 }}>
                    {/* Timeline line */}
                    {i < activities.length - 1 && (
                      <div style={{
                        position: 'absolute', left: 5, top: 12, bottom: 0, width: 1,
                        background: 'var(--color-border-subtle)',
                      }} />
                    )}
                    {/* Dot */}
                    <div style={{
                      width: 11, height: 11, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      background: a.type === 'task_completed' ? 'var(--color-success)'
                        : a.type === 'task_started' ? 'var(--color-primary)'
                          : a.type === 'plan_activated' ? 'var(--color-warning)'
                            : 'var(--color-text-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-bg-elevated)' }} />
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
                        {a.text}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                        {a.agent} · {a.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SidebarSection>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sidebar helpers ──

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function PropertyRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 72, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function MiniStat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '6px 10px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)',
      flex: '1 0 0', minWidth: 48,
    }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: color || 'var(--color-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{label}</span>
    </div>
  )
}
