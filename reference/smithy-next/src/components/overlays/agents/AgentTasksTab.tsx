import { useState } from 'react'
import { GitBranch } from 'lucide-react'
import type { AgentExtended, AgentTaskRef } from './agent-types'

interface AgentTasksTabProps {
  agent: AgentExtended
  onNavigateToTask?: (taskId: string) => void
}

type TaskSort = 'recent' | 'timeSpent' | 'status'

const statusOrder: Record<string, number> = { 'in-progress': 0, open: 1, error: 2, done: 3 }
const statusColor: Record<string, string> = {
  'in-progress': 'var(--color-warning)', open: 'var(--color-primary)',
  done: 'var(--color-success)', error: 'var(--color-danger)',
}
const statusLabel: Record<string, string> = {
  'in-progress': 'In Progress', open: 'Open', done: 'Done', error: 'Error',
}

export function AgentTasksTab({ agent, onNavigateToTask }: AgentTasksTabProps) {
  const [sortBy, setSortBy] = useState<TaskSort>('recent')

  // Collect all tasks across sessions
  const allTasks: AgentTaskRef[] = agent.sessions.flatMap(s => s.tasks)

  // Deduplicate by ID
  const unique = new Map<string, AgentTaskRef>()
  allTasks.forEach(t => { if (!unique.has(t.id)) unique.set(t.id, t) })
  let tasks = [...unique.values()]

  // Sort
  if (sortBy === 'status') {
    tasks.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9))
  } else if (sortBy === 'timeSpent') {
    tasks.sort((a, b) => parseTime(b.timeSpent) - parseTime(a.timeSpent))
  }
  // 'recent' keeps insertion order (already chronological from sessions)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sort pills */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['recent', 'timeSpent', 'status'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            style={{
              height: 24, padding: '0 8px', fontSize: 11, fontWeight: 500,
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              background: sortBy === s ? 'var(--color-surface-active)' : 'var(--color-surface)',
              color: sortBy === s ? 'var(--color-text)' : 'var(--color-text-tertiary)',
            }}
          >
            {s === 'recent' ? 'Recent' : s === 'timeSpent' ? 'Time spent' : 'Status'}
          </button>
        ))}
      </div>

      {/* Tasks list */}
      {tasks.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          No tasks yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tasks.map(task => (
            <div
              key={task.id}
              onClick={() => onNavigateToTask?.(task.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                borderRadius: 'var(--radius-md)', cursor: onNavigateToTask ? 'pointer' : 'default',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: statusColor[task.status] || 'var(--color-text-tertiary)',
              }} />
              <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.title}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-full)',
                background: 'var(--color-surface)', color: statusColor[task.status] || 'var(--color-text-tertiary)',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {statusLabel[task.status] || task.status}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                {task.timeSpent}
              </span>
              {task.branch && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                  <GitBranch size={10} strokeWidth={1.5} /> {task.branch}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function parseTime(str: string): number {
  let total = 0
  const hMatch = str.match(/(\d+)h/)
  const mMatch = str.match(/(\d+)m/)
  if (hMatch) total += parseInt(hMatch[1]) * 60
  if (mMatch) total += parseInt(mMatch[1])
  return total
}
