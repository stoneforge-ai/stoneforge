import { useMemo } from 'react'
import { Activity, Clock, CheckCircle, AlertTriangle, GitBranch, Zap, ExternalLink, FileText } from 'lucide-react'
import type { AgentExtended } from './agent-types'
import { mockSessions } from '../../../mock-data'

interface AgentOverviewTabProps {
  agent: AgentExtended
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
}

const eventTypeIcon: Record<string, typeof Activity> = {
  session_started: Activity, session_stopped: Clock, task_completed: CheckCircle,
  task_started: Activity, error: AlertTriangle, config_changed: Zap,
}
const eventTypeColor: Record<string, string> = {
  session_started: 'var(--color-primary)', session_stopped: 'var(--color-text-tertiary)',
  task_completed: 'var(--color-success)', task_started: 'var(--color-primary)',
  error: 'var(--color-danger)', config_changed: 'var(--color-warning)',
}

export function AgentOverviewTab({ agent, onNavigateToTask, onNavigateToSession }: AgentOverviewTabProps) {
  const activeSession = agent.sessions.find(s => s.status === 'active')

  const recentSessions = useMemo(() => {
    return mockSessions.filter(s => s.agent.name === agent.name || s.agent.id === agent.id).slice(0, 3)
  }, [agent.name, agent.id])

  // Collect unique tasks across all embedded sessions
  const recentTasks = useMemo(() => {
    const seen = new Set<string>()
    const tasks: typeof agent.sessions[0]['tasks'] = []
    for (const session of agent.sessions) {
      for (const task of session.tasks) {
        if (!seen.has(task.id)) { seen.add(task.id); tasks.push(task) }
      }
    }
    return tasks.slice(0, 5)
  }, [agent.sessions])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <MetricCard label="Sessions" value={String(agent.sessions.length)} />
        <MetricCard label="Tasks completed" value={String(agent.totalTasksCompleted)} />
        <MetricCard label="Total uptime" value={agent.totalUptime} />
        <MetricCard label="Error rate" value={`${agent.errorRate}%`} color={agent.errorRate > 5 ? 'var(--color-danger)' : undefined} />
      </div>

      {/* Capacity */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <SectionTitle>Capacity</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Max concurrent:</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{agent.maxConcurrentTasks ?? 1}</span>
            </div>
            {agent.spawnPriority != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Priority:</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{agent.spawnPriority}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {agent.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {agent.tags.map(tag => (
                <span key={tag} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active session */}
      {activeSession && (
        <div>
          <SectionTitle>Active Session</SectionTitle>
          <div style={{
            padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>Running for {activeSession.duration}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>· {activeSession.tasksCompleted} tasks completed</span>
            </div>
            {activeSession.tasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {activeSession.tasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => onNavigateToTask?.(task.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: onNavigateToTask ? 'pointer' : 'default', fontSize: 12 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: task.status === 'in-progress' ? 'var(--color-warning)' : task.status === 'done' ? 'var(--color-success)' : task.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
                    }} />
                    <span style={{ color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, flexShrink: 0 }}>{task.timeSpent}</span>
                    {task.branch && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-text-tertiary)', fontSize: 11, flexShrink: 0 }}>
                        <GitBranch size={10} strokeWidth={1.5} /> {task.branch}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div>
        <SectionTitle>Recent Sessions</SectionTitle>
        {recentSessions.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No sessions yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentSessions.map(session => (
              <div
                key={session.id}
                onClick={() => onNavigateToSession?.(session.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px',
                  cursor: onNavigateToSession ? 'pointer' : 'default',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: session.status === 'active' ? 'var(--color-success)' : session.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    <span>{session.startedAt}</span>
                    {session.linkedBranch && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><GitBranch size={9} strokeWidth={1.5} /> {session.linkedBranch}</span>}
                    {session.linkedTaskId && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-primary)' }}><FileText size={9} strokeWidth={1.5} /> {session.linkedTaskId}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} strokeWidth={1.5} /> {session.duration}</span>
                {onNavigateToSession && <ExternalLink size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Tasks */}
      <div>
        <SectionTitle>Recent Tasks</SectionTitle>
        {recentTasks.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No tasks yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentTasks.map(task => (
              <div
                key={task.id}
                onClick={() => onNavigateToTask?.(task.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px',
                  cursor: onNavigateToTask ? 'pointer' : 'default',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: task.status === 'in-progress' ? 'var(--color-warning)' : task.status === 'done' ? 'var(--color-success)' : task.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
                }} />
                <span style={{ fontSize: 12, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface)', color: task.status === 'in-progress' ? 'var(--color-warning)' : task.status === 'done' ? 'var(--color-success)' : 'var(--color-text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {task.status === 'in-progress' ? 'In Progress' : task.status === 'done' ? 'Done' : task.status === 'error' ? 'Error' : 'Open'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{task.timeSpent}</span>
                {task.branch && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}><GitBranch size={9} strokeWidth={1.5} /> {task.branch}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div>
        <SectionTitle>Recent Activity</SectionTitle>
        {agent.recentActivity.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No recent activity</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {agent.recentActivity.map(event => {
              const Icon = eventTypeIcon[event.type] || Activity
              const color = eventTypeColor[event.type] || 'var(--color-text-tertiary)'
              return (
                <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                  <Icon size={13} strokeWidth={1.5} style={{ color, flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1, lineHeight: 1.4 }}>{event.message}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{event.timestamp}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>{children}</div>
}
