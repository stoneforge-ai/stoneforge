import { useState } from 'react'
import { X, Send, Bot } from 'lucide-react'
import type { DesignAnnotation } from '../../../mock-data'

interface DesignHandoffDialogProps {
  annotations: DesignAnnotation[]
  linkedTaskId?: string
  onClose: () => void
  onSend: (message: string, agent: string) => void
}

const AGENTS = [
  { name: 'Director Alpha', id: 'dir-1' },
  { name: 'Director Beta', id: 'dir-2' },
  { name: 'Director Gamma', id: 'dir-3' },
]

function buildMessage(annotations: DesignAnnotation[], linkedTaskId?: string): string {
  const lines = [
    `Design feedback — ${annotations.length} annotation${annotations.length !== 1 ? 's' : ''}`,
    '',
  ]
  if (linkedTaskId) lines.push(`Related task: ${linkedTaskId}`, '')
  annotations.forEach((ann, i) => {
    const prefix = `[${i + 1}] ${ann.tool}`
    lines.push(ann.comment ? `${prefix}: ${ann.comment}` : prefix)
  })
  lines.push('', 'Please review and address these design issues.')
  return lines.join('\n')
}

export function DesignHandoffDialog({ annotations, linkedTaskId, onClose, onSend }: DesignHandoffDialogProps) {
  const [message, setMessage] = useState(() => buildMessage(annotations, linkedTaskId))
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0].name)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 520, maxWidth: '90vw', maxHeight: '80vh',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
            Send Design Feedback
          </span>
          <button
            onClick={onClose}
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Agent selector */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Send to
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {AGENTS.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.name)}
                  style={{
                    height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                    background: selectedAgent === agent.name ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                    border: selectedAgent === agent.name ? '1px solid var(--color-primary)' : '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: selectedAgent === agent.name ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                    cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  }}
                >
                  <Bot size={12} strokeWidth={1.5} />
                  {agent.name}
                </button>
              ))}
              {linkedTaskId && (
                <button
                  onClick={() => setSelectedAgent(`Task ${linkedTaskId}`)}
                  style={{
                    height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                    background: selectedAgent.startsWith('Task') ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                    border: selectedAgent.startsWith('Task') ? '1px solid var(--color-primary)' : '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: selectedAgent.startsWith('Task') ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                    cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  }}
                >
                  Task {linkedTaskId}
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          <div style={{
            display: 'flex', gap: 8, padding: '8px 10px',
            background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
            fontSize: 11, color: 'var(--color-text-secondary)',
          }}>
            <span style={{ fontWeight: 500 }}>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
            <span style={{ color: 'var(--color-border)' }}>|</span>
            <span>{[...new Set(annotations.map(a => a.tool))].join(', ')}</span>
          </div>

          {/* Message */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Message
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              style={{
                width: '100%', minHeight: 160, padding: 12,
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)', fontSize: 12, lineHeight: 1.6,
                color: 'var(--color-text)', fontFamily: 'var(--font-mono)',
                outline: 'none', resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px',
          borderTop: '1px solid var(--color-border-subtle)',
        }}>
          <button
            onClick={onClose}
            style={{
              height: 26, padding: '0 12px', background: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSend(message, selectedAgent); onClose() }}
            disabled={!message.trim()}
            style={{
              height: 26, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5,
              background: message.trim() ? 'var(--color-primary)' : 'var(--color-surface-active)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: message.trim() ? '#fff' : 'var(--color-text-tertiary)',
              fontSize: 12, fontWeight: 500, cursor: message.trim() ? 'pointer' : 'default',
            }}
          >
            <Send size={12} strokeWidth={1.5} />
            Send Feedback
          </button>
        </div>
      </div>
    </>
  )
}
