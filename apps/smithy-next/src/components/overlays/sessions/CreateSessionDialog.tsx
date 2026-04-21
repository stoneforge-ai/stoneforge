import { useState, useEffect, useRef } from 'react'
import { X, Bot, Play, SquareKanban } from 'lucide-react'

interface AgentOption {
  id: string
  name: string
  model: string
  status: string
}

interface TaskOption {
  id: string
  title: string
}

interface CreateSessionDialogProps {
  onClose: () => void
  onCreate: (config: { agentId: string; agentName: string; taskId?: string; initialMessage?: string }) => void
  agents: AgentOption[]
  tasks?: TaskOption[]
  preselectedAgentId?: string
}

export function CreateSessionDialog({ onClose, onCreate, agents, tasks, preselectedAgentId }: CreateSessionDialogProps) {
  const [agentId, setAgentId] = useState(preselectedAgentId || agents[0]?.id || '')
  const [taskId, setTaskId] = useState('')
  const [initialMessage, setInitialMessage] = useState('')
  const messageRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!preselectedAgentId) return
    // Focus the message field when agent is pre-selected
    messageRef.current?.focus()
  }, [preselectedAgentId])

  const selectedAgent = agents.find(a => a.id === agentId)

  const handleSubmit = () => {
    if (!agentId || !selectedAgent) return
    onCreate({
      agentId,
      agentName: selectedAgent.name,
      taskId: taskId || undefined,
      initialMessage: initialMessage.trim() || undefined,
    })
    onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 440, maxWidth: '90vw', maxHeight: '80vh',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <Bot size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>New Session</span>
          <button onClick={onClose} style={closeBtnStyle}><X size={14} strokeWidth={1.5} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          {/* Agent selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Agent <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            {preselectedAgentId ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px',
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
              }}>
                <Bot size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                {selectedAgent?.name || 'Unknown agent'}
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>
                  ({selectedAgent?.model})
                </span>
              </div>
            ) : (
              <select value={agentId} onChange={e => setAgentId(e.target.value)} style={selectStyle}>
                <option value="" disabled>Select an agent...</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.model}) — {a.status}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Task selector */}
          {tasks && tasks.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                <SquareKanban size={11} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> Link to task
              </label>
              <select value={taskId} onChange={e => setTaskId(e.target.value)} style={selectStyle}>
                <option value="">None</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.id}: {t.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Initial message */}
          <div>
            <label style={labelStyle}>Initial message</label>
            <textarea
              ref={messageRef}
              value={initialMessage}
              onChange={e => setInitialMessage(e.target.value)}
              placeholder="Optional prompt for the agent to start with..."
              style={{
                width: '100%', minHeight: 80, padding: '8px 10px', resize: 'vertical',
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <button onClick={onClose} style={{
            height: 32, padding: '0 14px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!agentId}
            style={{
              height: 32, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: agentId ? 'var(--color-primary)' : 'var(--color-surface-active)',
              color: agentId ? 'white' : 'var(--color-text-tertiary)',
              cursor: agentId ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 500,
            }}
          >
            <Play size={12} strokeWidth={2} /> Start Session
          </button>
        </div>
      </div>
    </>
  )
}

const closeBtnStyle: React.CSSProperties = {
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4,
}

const selectStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px',
  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
  outline: 'none', cursor: 'pointer',
}
