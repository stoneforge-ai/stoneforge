import { useState } from 'react'
import { X, Play, GitBranch } from 'lucide-react'
import type { CIAction } from './ci-types'

interface CIManualTriggerDialogProps {
  actions: CIAction[]
  onClose: () => void
  onTrigger: (actionId: string, branch: string, inputs: Record<string, string>) => void
}

export function CIManualTriggerDialog({ actions, onClose, onTrigger }: CIManualTriggerDialogProps) {
  // Only show actions with dispatch inputs (or all if none have them)
  const dispatchable = actions.filter(w => w.dispatchInputs && w.dispatchInputs.length > 0)
  const available = dispatchable.length > 0 ? dispatchable : actions

  const [selectedAction, setSelectedAction] = useState(available[0])
  const [branch, setBranch] = useState('main')
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    selectedAction.dispatchInputs?.forEach(inp => {
      if (inp.default) defaults[inp.name] = inp.default
    })
    return defaults
  })

  const handleActionChange = (wfId: string) => {
    const wf = available.find(w => w.id === wfId)
    if (!wf) return
    setSelectedAction(wf)
    // Reset inputs to defaults
    const defaults: Record<string, string> = {}
    wf.dispatchInputs?.forEach(inp => {
      if (inp.default) defaults[inp.name] = inp.default
    })
    setInputs(defaults)
  }

  const handleSubmit = () => {
    onTrigger(selectedAction.id, branch, inputs)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />

      {/* Dialog */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 440, maxWidth: '90vw', maxHeight: '80vh',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <Play size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Run action</span>
          <button onClick={onClose} style={closeBtnStyle}><X size={14} strokeWidth={1.5} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
          {/* Action selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Action</label>
            <select
              value={selectedAction.id}
              onChange={e => handleActionChange(e.target.value)}
              style={selectStyle}
            >
              {available.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.fileName})</option>
              ))}
            </select>
          </div>

          {/* Branch */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              <GitBranch size={11} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> Branch
            </label>
            <input
              value={branch}
              onChange={e => setBranch(e.target.value)}
              style={inputStyle}
              placeholder="main"
            />
          </div>

          {/* Dispatch inputs */}
          {selectedAction.dispatchInputs && selectedAction.dispatchInputs.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Inputs
              </div>
              {selectedAction.dispatchInputs.map(inp => (
                <div key={inp.name} style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>
                    {inp.name}
                    {inp.required && <span style={{ color: 'var(--color-danger)', marginLeft: 2 }}>*</span>}
                  </label>
                  {inp.description && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{inp.description}</div>
                  )}
                  {inp.type === 'boolean' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <div
                        onClick={() => setInputs(prev => ({ ...prev, [inp.name]: prev[inp.name] === 'true' ? 'false' : 'true' }))}
                        style={{
                          width: 32, height: 18, borderRadius: 9, padding: 2,
                          background: inputs[inp.name] === 'true' ? 'var(--color-primary)' : 'var(--color-surface-active)',
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%', background: 'white',
                          transform: inputs[inp.name] === 'true' ? 'translateX(14px)' : 'translateX(0)',
                          transition: 'transform 0.15s',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {inputs[inp.name] === 'true' ? 'true' : 'false'}
                      </span>
                    </label>
                  ) : inp.type === 'choice' && inp.options ? (
                    <select
                      value={inputs[inp.name] || ''}
                      onChange={e => setInputs(prev => ({ ...prev, [inp.name]: e.target.value }))}
                      style={selectStyle}
                    >
                      {inp.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={inputs[inp.name] || ''}
                      onChange={e => setInputs(prev => ({ ...prev, [inp.name]: e.target.value }))}
                      placeholder={inp.default || ''}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <button onClick={onClose} style={{
            height: 32, padding: '0 14px', border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            Cancel
          </button>
          <button onClick={handleSubmit} style={{
            height: 32, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)', color: 'white',
            cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}>
            <Play size={12} strokeWidth={2} /> Run action
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

const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 10px',
  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
  outline: 'none', fontFamily: 'var(--font-mono)',
}

const selectStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px',
  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
  outline: 'none', cursor: 'pointer',
}
