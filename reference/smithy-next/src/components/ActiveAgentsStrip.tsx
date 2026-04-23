import { useState, useMemo, useCallback, useRef } from 'react'
import { Bot, ChevronUp, ChevronDown, GitBranch, AlertCircle, Check, Circle } from 'lucide-react'
import type { Task, DirectorSession } from '../mock-data'
import { mockDirectorMessages, mockTaskAgentMessages, KANBAN_COLUMNS } from '../mock-data'

interface ActiveAgentsStripProps {
  tasks: Task[]
  directors: DirectorSession[]
  onSelectTask: (taskId: string) => void
  onSelectDirector: (directorId: string) => void
}

interface DerivedAgent {
  director: DirectorSession
  assignedTasks: Task[]
  inProgressCount: number
  inReviewCount: number
  blockedCount: number
  latestActivity: string | null
}

export function ActiveAgentsStrip({ tasks, directors, onSelectTask, onSelectDirector }: ActiveAgentsStripProps) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('sf-agents-strip-expanded') === 'true' } catch { return false }
  })
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)
  const [panelHeight, setPanelHeight] = useState(() => {
    try { const h = localStorage.getItem('sf-agents-strip-height'); return h ? parseInt(h, 10) : 200 } catch { return 200 }
  })
  const [isResizing, setIsResizing] = useState(false)

  const heightRef = useRef(panelHeight)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    const startY = e.clientY
    const startHeight = heightRef.current

    const onMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY
      const h = Math.max(80, Math.min(500, startHeight + delta))
      heightRef.current = h
      setPanelHeight(h)
    }
    const onMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      try { localStorage.setItem('sf-agents-strip-height', String(heightRef.current)) } catch {}
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const toggleExpanded = () => {
    setExpanded(prev => {
      const next = !prev
      try { localStorage.setItem('sf-agents-strip-expanded', String(next)) } catch {}
      return next
    })
  }

  const agents = useMemo<DerivedAgent[]>(() => {
    return directors
      .map(director => {
        const assignedTasks = tasks.filter(t => t.assignee?.name === director.name && !t.parentId)
        const inProgressCount = assignedTasks.filter(t => t.status === 'in_progress').length
        const inReviewCount = assignedTasks.filter(t => t.status === 'in_review').length
        const blockedCount = assignedTasks.filter(t => t.blocked).length
        const messages = mockDirectorMessages[director.id]
        const lastAgentMsg = messages?.filter(m => m.type === 'agent' || m.type === 'tool').at(-1)
        const latestActivity = lastAgentMsg?.type === 'tool'
          ? `${lastAgentMsg.toolName} ${lastAgentMsg.toolInput || ''}`.trim()
          : lastAgentMsg?.content?.slice(0, 80) || null
        return { director, assignedTasks, inProgressCount, inReviewCount, blockedCount, latestActivity }
      })
      .filter(a => a.assignedTasks.length > 0)
  }, [directors, tasks])

  const activeCount = useMemo(() => {
    const activeAgents = new Set<string>()
    for (const a of agents) {
      if (a.director.status === 'running') activeAgents.add(a.director.name)
      for (const t of a.assignedTasks) {
        if (t.agentName && t.sessionStatus === 'running') activeAgents.add(t.agentName)
        if (t.reviewAgentName && t.status === 'in_review') activeAgents.add(t.reviewAgentName)
      }
    }
    return activeAgents.size
  }, [agents])

  if (agents.length === 0) return null

  const statusColor = (status: string) => {
    if (status === 'running') return 'var(--color-success)'
    if (status === 'error') return 'var(--color-danger)'
    return 'var(--color-text-tertiary)'
  }

  const sessionStatusColor = (status?: string, blocked?: boolean) => {
    if (blocked) return 'var(--color-danger)'
    if (status === 'running') return 'var(--color-success)'
    if (status === 'error') return 'var(--color-danger)'
    return 'var(--color-text-quaternary, var(--color-text-tertiary))'
  }

  return (
    <div className="active-agents-strip" style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Drag handle for resize */}
      <div
        onMouseDown={expanded ? handleResizeStart : undefined}
        style={{
          height: 4,
          cursor: expanded ? 'row-resize' : 'default',
          background: isResizing ? 'var(--color-primary)' : 'transparent',
          borderTop: '1px solid var(--color-border)',
          transition: isResizing ? 'none' : 'background 0.15s',
        }}
        onMouseEnter={e => { if (expanded) (e.currentTarget as HTMLElement).style.background = 'var(--color-border)' }}
        onMouseLeave={e => { if (!isResizing) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      />
      {/* Collapsed strip — always visible */}
      <div
        className="agents-strip-bar"
        style={{
          height: 30,
          minHeight: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px',
          background: 'var(--color-bg-secondary)',
          cursor: 'pointer',
          userSelect: 'none',
          overflowX: expanded ? 'hidden' : 'auto',
          overflowY: 'hidden',
        }}
        onClick={toggleExpanded}
      >
        <Bot size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          Agents
        </span>
        {activeCount > 0 && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--color-text-on-primary, #fff)',
            background: 'var(--color-success)',
            borderRadius: 8,
            padding: '0 5px',
            lineHeight: '16px',
            flexShrink: 0,
          }}>
            {activeCount} active
          </span>
        )}

        {/* Agent pills in collapsed mode */}
        {!expanded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 4 }}>
            {agents.map(a => (
              <div
                key={a.director.id}
                style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: statusColor(a.director.status), flexShrink: 0,
                }} />
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', fontSize: 9, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-primary-muted, var(--color-surface))',
                  color: 'var(--color-text-accent, var(--color-primary))',
                  flexShrink: 0,
                }}>
                  {a.director.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text)', fontWeight: 500 }}>
                  {a.director.name.replace('Director ', '')}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 500, borderRadius: 4, padding: '0px 4px',
                  background: a.director.status === 'running' ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                    : a.director.status === 'error' ? 'color-mix(in srgb, var(--color-danger) 15%, transparent)'
                    : 'var(--color-surface)',
                  color: statusColor(a.director.status),
                  lineHeight: '15px',
                }}>
                  {a.director.status === 'running' ? 'working' : a.director.status}
                </span>
                {a.inProgressCount > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 500 }}>
                    {a.inProgressCount} in progress
                  </span>
                )}
                {a.inReviewCount > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 500 }}>
                    {a.inReviewCount} in review
                  </span>
                )}
                {a.blockedCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--color-danger)', fontWeight: 500 }}>
                    <AlertCircle size={10} /> {a.blockedCount} blocked
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: expanded ? 1 : 0 }} />
        {expanded ? <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} /> : <ChevronUp size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          height: panelHeight,
          overflowY: 'auto',
          background: 'var(--color-bg-secondary)',
          borderTop: '1px solid var(--color-border-subtle, var(--color-border))',
          padding: '4px 0',
        }}>
          {agents.map(a => (
            <div key={a.director.id}>
              {/* Agent row */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px',
                  cursor: 'pointer',
                  background: hoveredAgent === a.director.id ? 'var(--color-surface-hover)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={() => setHoveredAgent(a.director.id)}
                onMouseLeave={() => setHoveredAgent(null)}
                onClick={() => onSelectDirector(a.director.id)}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: statusColor(a.director.status), flexShrink: 0,
                }} />
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', fontSize: 9, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-primary-muted, var(--color-surface))',
                  color: 'var(--color-text-accent, var(--color-primary))',
                  flexShrink: 0,
                }}>
                  {a.director.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>
                  {a.director.name}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 500, borderRadius: 4, padding: '1px 5px',
                  background: a.director.status === 'running' ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                    : a.director.status === 'error' ? 'color-mix(in srgb, var(--color-danger) 15%, transparent)'
                    : 'var(--color-surface)',
                  color: statusColor(a.director.status),
                }}>
                  {a.director.status === 'running' ? 'working' : a.director.status}
                </span>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  {a.assignedTasks.length} task{a.assignedTasks.length !== 1 ? 's' : ''}
                </span>
                {a.inProgressCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--color-success)', fontWeight: 500 }}>
                    {a.inProgressCount} in progress
                  </span>
                )}
                {a.inReviewCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--color-warning)', fontWeight: 500 }}>
                    {a.inReviewCount} in review
                  </span>
                )}
                {a.blockedCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--color-danger)', fontWeight: 500 }}>
                    <AlertCircle size={10} /> {a.blockedCount} blocked
                  </span>
                )}
                <div style={{ flex: 1 }} />
                {a.latestActivity && (
                  <span style={{
                    fontSize: 10, color: 'var(--color-text-tertiary)',
                    maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontStyle: 'italic',
                  }}>
                    {a.latestActivity}
                  </span>
                )}
              </div>

              {/* Task rows */}
              {a.assignedTasks.map(task => {
                const agentMsg = (task.status === 'in_progress' || task.status === 'in_review') ? mockTaskAgentMessages[task.id] : null
                return (
                  <div
                    key={task.id}
                    style={{
                      cursor: 'pointer',
                      background: hoveredTask === task.id ? 'var(--color-surface-hover)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={() => setHoveredTask(task.id)}
                    onMouseLeave={() => setHoveredTask(null)}
                    onClick={() => onSelectTask(task.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px 0 42px' }}>
                      {task.blocked ? (
                        <AlertCircle size={11} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                      ) : task.status === 'done' ? (
                        <Check size={11} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      ) : task.status === 'todo' || task.status === 'backlog' ? (
                        <Circle size={9} style={{ color: 'var(--color-text-quaternary, var(--color-text-tertiary))', flexShrink: 0 }} />
                      ) : (
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: sessionStatusColor(task.sessionStatus),
                          flexShrink: 0,
                        }} />
                      )}
                      <span style={{
                        fontSize: 11, color: 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-mono)', fontWeight: 500,
                        flexShrink: 0,
                      }}>
                        {task.id}
                      </span>
                      <span style={{
                        fontSize: 11,
                        color: task.blocked ? 'var(--color-danger)' : task.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      }}>
                        {task.title}
                      </span>
                      {task.agentName && task.sessionStatus === 'running' && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic', flexShrink: 0 }}>
                          {task.agentName}
                        </span>
                      )}
                      {task.reviewAgentName && task.status === 'in_review' && (
                        <span style={{ fontSize: 10, color: 'var(--color-warning)', fontStyle: 'italic', flexShrink: 0 }}>
                          {task.reviewAgentName}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {task.blocked && (
                        <span style={{ fontSize: 10, color: 'var(--color-danger)', fontWeight: 500, flexShrink: 0 }}>blocked</span>
                      )}
                      {(task.status === 'in_progress' || task.status === 'in_review') && task.branch && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                          fontSize: 10, color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-mono)', flexShrink: 0,
                        }}>
                          <GitBranch size={9} />{task.branch}
                        </span>
                      )}
                      {(task.status === 'in_progress' || task.status === 'in_review') && task.activeDuration && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{task.activeDuration}</span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 500, flexShrink: 0,
                        color: task.status === 'in_progress' ? 'var(--color-success)'
                          : task.status === 'in_review' ? 'var(--color-warning)'
                          : task.status === 'done' ? 'var(--color-primary)'
                          : 'var(--color-text-tertiary)',
                      }}>
                        {KANBAN_COLUMNS.find(c => c.id === task.status)?.label || task.status}
                      </span>
                    </div>
                    {agentMsg && (
                      <div style={{
                        padding: '1px 12px 3px 53px',
                        fontSize: 10, color: 'var(--color-text-tertiary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontStyle: 'italic',
                      }}>
                        {agentMsg}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
