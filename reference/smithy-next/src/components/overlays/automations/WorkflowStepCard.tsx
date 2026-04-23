import { useState, useRef, useEffect } from 'react'
import { Bot, Terminal, ChevronDown, ChevronRight, RotateCcw, Clock, Trash2, GripVertical, Check } from 'lucide-react'
import type { WFStep, WFAgentStep, WFScriptStep, WFScriptRuntime } from './wf-types'
import { mockAgentsExtended, mockRoleDefinitions } from '../agents/agent-mock-data'
import { Tooltip } from '../../Tooltip'

interface WorkflowStepCardProps {
  step: WFStep
  index: number
  mode: 'view' | 'edit'
  onChange?: (step: WFStep) => void
  onDelete?: () => void
  focused?: boolean
}

const runtimeLabels: Record<WFScriptRuntime, string> = {
  shell: 'Shell', python: 'Python', nodejs: 'Node.js', typescript: 'TypeScript',
}

export function WorkflowStepCard({ step, index, mode, onChange, onDelete, focused }: WorkflowStepCardProps) {
  const [expanded, setExpanded] = useState(mode === 'edit' || !!focused)
  const cardRef = useRef<HTMLDivElement>(null)

  // When focused externally (e.g. pipeline click), expand and scroll into view
  useEffect(() => {
    if (focused) {
      setExpanded(true)
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (mode === 'view') {
      setExpanded(false)
    }
  }, [focused, mode])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const isAgent = step.type === 'agent'
  const Icon = isAgent ? Bot : Terminal
  const borderColor = isAgent ? 'var(--color-primary)' : 'var(--color-border)'

  const updateStep = (updates: Partial<WFStep>) => {
    onChange?.({ ...step, ...updates } as WFStep)
  }

  return (
    <div ref={cardRef} style={{
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg-elevated)',
      borderLeft: `3px solid ${borderColor}`, overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => mode === 'view' && setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          cursor: mode === 'view' ? 'pointer' : 'default',
        }}
      >
        {mode === 'edit' && (
          <GripVertical size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', cursor: 'grab', flexShrink: 0 }} />
        )}

        <span style={{
          width: 20, height: 20, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', flexShrink: 0,
        }}>
          {index + 1}
        </span>

        <Icon size={14} strokeWidth={1.5} style={{ color: isAgent ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />

        {mode === 'edit' ? (
          <input
            value={step.name}
            onChange={e => updateStep({ name: e.target.value })}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 13, fontWeight: 500, color: 'var(--color-text)', fontFamily: 'inherit',
            }}
            placeholder="Step name"
          />
        ) : (
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{step.name}</span>
        )}

        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
          background: isAgent ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
          color: isAgent ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
          fontWeight: 500, textTransform: 'uppercase', flexShrink: 0,
        }}>
          {isAgent ? 'Agent' : 'Script'}
        </span>

        {mode === 'view' && (
          expanded
            ? <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
            : <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        )}

        {mode === 'edit' && onDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} style={{
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-tertiary)', cursor: 'pointer',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = 'var(--color-danger-subtle)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'none' }}
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Content */}
      {(expanded || mode === 'edit') && (
        <div style={{ padding: '0 12px 12px', paddingLeft: mode === 'edit' ? 52 : 48 }}>
          {isAgent ? (
            <AgentStepContent step={step as WFAgentStep} mode={mode} onChange={onChange} />
          ) : (
            <ScriptStepContent step={step as WFScriptStep} mode={mode} onChange={onChange} />
          )}

          {/* Retry / timeout info */}
          {mode === 'view' && (step.retryCount > 0 || step.timeoutSeconds > 0) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {step.retryCount > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <RotateCcw size={10} strokeWidth={1.5} /> Retry {step.retryCount}x ({step.retryDelaySeconds}s delay)
                </span>
              )}
              {step.timeoutSeconds > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} strokeWidth={1.5} /> Timeout {step.timeoutSeconds}s
                </span>
              )}
            </div>
          )}

          {/* Advanced settings (edit mode) */}
          {mode === 'edit' && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setAdvancedOpen(!advancedOpen)} style={{
                display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
                color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', padding: 0,
              }}>
                {advancedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                Advanced
              </button>
              {advancedOpen && (
                <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  <FieldGroup label="Retries">
                    <input type="number" min={0} max={5} value={step.retryCount}
                      onChange={e => onChange?.({ ...step, retryCount: Number(e.target.value) } as WFStep)}
                      style={inputStyle} />
                  </FieldGroup>
                  <FieldGroup label="Retry delay (s)">
                    <input type="number" min={0} value={step.retryDelaySeconds}
                      onChange={e => onChange?.({ ...step, retryDelaySeconds: Number(e.target.value) } as WFStep)}
                      style={inputStyle} />
                  </FieldGroup>
                  <FieldGroup label="Timeout (s)">
                    <input type="number" min={0} value={step.timeoutSeconds}
                      onChange={e => onChange?.({ ...step, timeoutSeconds: Number(e.target.value) } as WFStep)}
                      style={inputStyle} />
                  </FieldGroup>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgentStepContent({ step, mode, onChange }: { step: WFAgentStep; mode: 'view' | 'edit'; onChange?: (s: WFStep) => void }) {
  const [rdPickerOpen, setRdPickerOpen] = useState(false)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedRd = mockRoleDefinitions.find(rd => rd.id === step.roleDefinitionId)
  const tags = step.requiredAgentTags || []
  const hasMatchingAgent = tags.length === 0 || mockAgentsExtended.some(a => a.enabled && tags.every(t => a.tags.includes(t)))

  const openPicker = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPickerPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    setRdPickerOpen(true)
  }

  if (mode === 'view') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Role Definition:</span>
          {selectedRd ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px',
              borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
            }}>
              <Bot size={10} strokeWidth={1.5} />
              {selectedRd.name}
              {selectedRd.category && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{selectedRd.category}</span>}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>None selected</span>
          )}
          {tags.length > 0 && (
            <Tooltip label={`Required agent tags: ${tags.join(', ')}`}>
              <span className={hasMatchingAgent ? undefined : 'agent-tag-pulse'} style={{
                width: 18, height: 18, borderRadius: '50%',
                background: hasMatchingAgent ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: hasMatchingAgent ? '#22c55e' : '#ef4444',
                fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {tags.length}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FieldGroup label="Role Definition">
        <div style={{ position: 'relative' }}>
          <button ref={triggerRef} onClick={() => rdPickerOpen ? setRdPickerOpen(false) : openPicker()} style={{
            ...inputStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ color: selectedRd ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
              {selectedRd ? selectedRd.name : 'Select role definition...'}
            </span>
            <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
          </button>
          {rdPickerOpen && pickerPos && (
            <>
              <div onClick={() => setRdPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
              <div style={{
                position: 'fixed', top: pickerPos.top, left: pickerPos.left, width: pickerPos.width,
                zIndex: 1060, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
                maxHeight: 280, overflow: 'auto', padding: 4,
              }}>
                {mockRoleDefinitions.map(rd => {
                  const selected = step.roleDefinitionId === rd.id
                  return (
                    <button key={rd.id} onClick={() => { onChange?.({ ...step, roleDefinitionId: rd.id }); setRdPickerOpen(false) }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      background: selected ? 'var(--color-primary-subtle)' : 'transparent',
                      border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                    }}
                      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: selected ? 500 : 400 }}>
                          {rd.name}
                          {rd.builtIn && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>built-in</span>}
                        </div>
                        {rd.description && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{rd.description}</div>}
                      </div>
                      {rd.category && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>
                          {rd.category}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </FieldGroup>
      <FieldGroup label="Required Agent Tags (optional)">
        <input value={tags.join(', ')} onChange={e => onChange?.({ ...step, requiredAgentTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          style={inputStyle} placeholder="e.g. fast, local, gpu" />
        {tags.length > 0 && !hasMatchingAgent && (
          <div style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 4 }}>
            ⚠ No enabled agent matches these tags
          </div>
        )}
      </FieldGroup>
    </div>
  )
}

function ScriptStepContent({ step, mode, onChange }: { step: WFScriptStep; mode: 'view' | 'edit'; onChange?: (s: WFStep) => void }) {
  if (mode === 'view') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Runtime:</span>
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-text-secondary)', fontWeight: 500,
          }}>
            {runtimeLabels[step.runtime]}
          </span>
        </div>
        <div style={{
          padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
          fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)',
          lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden',
          tabSize: 2,
        }}>
          {step.code}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FieldGroup label="Runtime">
        <select value={step.runtime} onChange={e => onChange?.({ ...step, runtime: e.target.value as WFScriptRuntime })}
          style={{ ...inputStyle, width: 160 }}>
          <option value="shell">Shell</option>
          <option value="nodejs">Node.js</option>
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
        </select>
      </FieldGroup>
      <FieldGroup label="Code">
        <textarea value={step.code} onChange={e => onChange?.({ ...step, code: e.target.value })}
          rows={4} style={{ ...textareaStyle, fontFamily: 'var(--font-mono)', tabSize: 2 }}
          onInput={e => autoResize(e.currentTarget, 12)}
          ref={el => { if (el && step.code) autoResize(el, 12) }}
          placeholder="Enter the script code..." />
      </FieldGroup>
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 28, padding: '0 8px', border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', outline: 'none',
  color: 'var(--color-text)', fontSize: 12, fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: 'auto', padding: '8px 8px', resize: 'vertical', lineHeight: 1.5,
}

function autoResize(el: HTMLTextAreaElement, maxRows: number) {
  el.style.height = 'auto'
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18
  const maxHeight = lineHeight * maxRows + 16
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
}
