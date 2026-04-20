import { Bot, FileCode, GitPullRequest, ChevronRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { AgentSession } from './editor-mock-data'

interface Props {
  sessions: AgentSession[]
  onOpenFile: (path: string) => void
}

export function EditorAgentChangesPanel({ sessions, onOpenFile }: Props) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set([sessions[0]?.sessionId]))

  const toggleSession = (id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 12px',
        fontSize: 11, fontWeight: 600,
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Agent Changes
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 8px' }}>
        {sessions.map(session => {
          const isExpanded = expandedSessions.has(session.sessionId)
          const totalAdded = session.filesChanged.reduce((sum, f) => sum + f.additions, 0)
          const totalDeleted = session.filesChanged.reduce((sum, f) => sum + f.deletions, 0)

          return (
            <div key={session.sessionId}>
              {/* Session header */}
              <button
                onClick={() => toggleSession(session.sessionId)}
                style={{
                  width: '100%',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '8px 12px',
                  background: 'none', border: 'none',
                  textAlign: 'left', cursor: 'pointer',
                  transition: `background var(--duration-fast)`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  {isExpanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'var(--color-primary-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Bot size={11} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', flex: 1 }}>
                    {session.agentName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {session.timestamp}
                  </span>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  paddingLeft: 32,
                  fontSize: 11, color: 'var(--color-text-tertiary)',
                }}>
                  <span>{session.taskId}: {session.taskTitle}</span>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  paddingLeft: 32,
                  fontSize: 11,
                }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {session.filesChanged.length} file{session.filesChanged.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: 'var(--color-success)' }}>+{totalAdded}</span>
                  {totalDeleted > 0 && <span style={{ color: 'var(--color-danger)' }}>-{totalDeleted}</span>}
                  {session.mrId && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-text-accent)' }}>
                      <GitPullRequest size={11} strokeWidth={1.5} />
                      {session.mrId}
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded file list */}
              {isExpanded && (
                <div style={{ background: 'var(--color-surface)' }}>
                  {session.filesChanged.map(file => {
                    const fileName = file.path.split('/').pop()
                    return (
                      <button
                        key={file.path}
                        onClick={() => onOpenFile(file.path)}
                        style={{
                          width: '100%',
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 12px 4px 44px',
                          background: 'none', border: 'none',
                          fontSize: 12, textAlign: 'left', cursor: 'pointer',
                          transition: `background var(--duration-fast)`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <FileCode size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', minWidth: 13 }} />
                        <span style={{
                          flex: 1, color: 'var(--color-text-secondary)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {fileName}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-success)' }}>+{file.additions}</span>
                        {file.deletions > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>-{file.deletions}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 8,
            color: 'var(--color-text-tertiary)',
          }}>
            <Bot size={28} strokeWidth={1} />
            <span style={{ fontSize: 12 }}>No agent changes</span>
          </div>
        )}
      </div>
    </div>
  )
}
