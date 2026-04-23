import { useState } from 'react'
import { X, Wrench, Bot, Send } from 'lucide-react'
import type { CIHandoffContext } from './ci-types'

interface CIHandoffDialogProps {
  context: CIHandoffContext
  onClose: () => void
  onSend: (message: string, agent: string) => void
}

const AGENTS = [
  { id: 'agent-1', name: 'Director Alpha' },
  { id: 'agent-2', name: 'Director Beta' },
  { id: 'agent-3', name: 'Director Gamma' },
]

export function CIHandoffDialog({ context, onClose, onSend }: CIHandoffDialogProps) {
  const defaultMessage = buildDefaultMessage(context)
  const [message, setMessage] = useState(defaultMessage)
  const [selectedAgent, setSelectedAgent] = useState(AGENTS[0].name)

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />

      {/* Dialog */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 520, maxWidth: '90vw', maxHeight: '80vh',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <Wrench size={14} strokeWidth={1.5} style={{ color: 'var(--color-danger)' }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
            Handoff to Fix
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {context.jobName}
          </span>
          <button onClick={onClose} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
          {/* Agent selector */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Assign to
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {AGENTS.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px',
                    background: selectedAgent === agent.name ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: selectedAgent === agent.name ? 'white' : 'var(--color-text-secondary)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  }}
                >
                  <Bot size={12} strokeWidth={1.5} /> {agent.name}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Handoff message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              style={{
                width: '100%', minHeight: 180, padding: 12,
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)', fontSize: 12, lineHeight: 1.6,
                color: 'var(--color-text)', fontFamily: 'var(--font-mono)',
                resize: 'vertical', outline: 'none',
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
            onClick={() => { onSend(message, selectedAgent); onClose() }}
            disabled={!message.trim()}
            style={{
              height: 32, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: message.trim() ? 'var(--color-primary)' : 'var(--color-surface-active)',
              color: message.trim() ? 'white' : 'var(--color-text-tertiary)',
              cursor: message.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 500,
            }}
          >
            <Send size={12} strokeWidth={1.5} /> Send Handoff
          </button>
        </div>
      </div>
    </>
  )
}

function buildDefaultMessage(ctx: CIHandoffContext): string {
  const lines = [
    `CI job "${ctx.jobName}" failed.`,
    '',
  ]
  if (ctx.failedStep) lines.push(`Failed step: ${ctx.failedStep}`)
  if (ctx.errorSummary) lines.push(`Error: ${ctx.errorSummary}`)
  if (ctx.logExcerpt.length > 0) {
    lines.push('', 'Log excerpt:', ...ctx.logExcerpt.map(l => `  ${l}`))
  }
  if (ctx.relatedFiles.length > 0) {
    lines.push('', 'Related files:', ...ctx.relatedFiles.map(f => `  ${f}`))
  }
  lines.push('', 'Please investigate and fix this failure.')
  return lines.join('\n')
}
