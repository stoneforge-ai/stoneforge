import { useState } from 'react'
import { X } from 'lucide-react'
import type { AgentExtended } from './agent-types'

interface CreateAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  existingAgents: AgentExtended[]
  onCreate: (agent: AgentExtended) => void
}

function generateName(existing: AgentExtended[]): string {
  const prefix = 'agent'
  const nums = existing.filter(a => a.name.toLowerCase().startsWith(prefix)).map(a => {
    const m = a.name.match(/-(\d+)$/)
    return m ? parseInt(m[1]) : 0
  })
  return `${prefix}-${(nums.length ? Math.max(...nums) : 0) + 1}`
}

export function CreateAgentDialog({ isOpen, onClose, existingAgents, onCreate }: CreateAgentDialogProps) {
  const [provider, setProvider] = useState('claude-code')
  const [model, setModel] = useState('sonnet-4.6')
  const [name, setName] = useState(() => generateName(existingAgents))
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(2)

  const handleCreate = () => {
    const finalName = name || generateName(existingAgents)
    const newAgent: AgentExtended = {
      id: `a-new-${Date.now()}`,
      name: finalName,
      tags: [],
      model,
      provider,
      environment: 'local',
      status: 'idle',
      sessions: [],
      config: { maxTokens: 8192, temperature: 0, tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'] },
      lastActiveAt: 'Never',
      totalUptime: '0m',
      totalTasksCompleted: 0,
      errorRate: 0,
      maxConcurrentTasks,
      enabled: true,
      recentActivity: [],
    }
    onCreate(newAgent)
    handleReset()
    onClose()
  }

  const handleReset = () => {
    setProvider('claude-code')
    setModel('sonnet-4.6')
    setName(generateName(existingAgents))
    setMaxConcurrentTasks(2)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div onClick={() => { handleReset(); onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1050 }} />

      {/* Dialog */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 440, maxHeight: '80vh', background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-float)', zIndex: 1051, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>New Agent</span>
          <button onClick={() => { handleReset(); onClose() }} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name */}
            <FormField label="Name">
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
            </FormField>

            {/* Provider + Model */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Provider">
                <select value={provider} onChange={e => { setProvider(e.target.value); const defaults: Record<string, string> = { 'claude-code': 'sonnet-4.6', 'codex': 'gpt-5.4', 'opencode': 'gpt-5.4' }; setModel(defaults[e.target.value] || 'sonnet-4.6') }} style={selectStyle}>
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">OpenAI Codex</option>
                  <option value="opencode">OpenCode</option>
                </select>
              </FormField>
              <FormField label="Model">
                <select value={model} onChange={e => setModel(e.target.value)} style={selectStyle}>
                  {provider === 'claude-code' ? (
                    <>
                      <option value="opus-4.6-1m">opus-4.6-1m</option>
                      <option value="opus-4.6">opus-4.6</option>
                      <option value="sonnet-4.6">sonnet-4.6</option>
                      <option value="haiku-4.5">haiku-4.5</option>
                    </>
                  ) : (
                    <>
                      <option value="gpt-5.4">gpt-5.4</option>
                      <option value="gpt-5-mini">gpt-5-mini</option>
                    </>
                  )}
                </select>
              </FormField>
            </div>

            {/* Max Concurrent Tasks */}
            <FormField label="Max concurrent tasks">
              <input type="number" min={1} max={10} value={maxConcurrentTasks} onChange={e => setMaxConcurrentTasks(parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: 80 }} />
            </FormField>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
          <button onClick={() => { handleReset(); onClose() }} style={{
            height: 28, padding: '0 12px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            Cancel
          </button>
          <button onClick={handleCreate} style={{
            height: 28, padding: '0 14px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)', color: 'white',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            Create Agent
          </button>
        </div>
      </div>
    </>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  height: 30, padding: '0 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none', width: '100%',
}

const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 8px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none', width: '100%',
  cursor: 'pointer',
}
