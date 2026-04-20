import { useState } from 'react'
import { ArrowLeft, Plus, Trash2, Check, X, Clock, Lock, Users } from 'lucide-react'
import type { Workflow, WFStep, WFAgentStep, WFScriptStep, WFTriggerType, WFVariable } from './wf-types'
import { WorkflowStepCard } from './WorkflowStepCard'
import { useTeamContext } from '../../../TeamContext'

const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 10px', border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', outline: 'none',
  color: 'var(--color-text)', fontSize: 13, fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.5,
}

function autoResize(el: HTMLTextAreaElement, maxRows: number) {
  el.style.height = 'auto'
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
  const maxHeight = lineHeight * maxRows + 18
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
}

const addBtnStyle: React.CSSProperties = {
  height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
  cursor: 'pointer', fontSize: 11, fontWeight: 500,
}

interface WorkflowCreateViewProps {
  workflow?: Workflow | null  // null = create mode, set = edit mode
  onBack: () => void
  allWorkflows?: Workflow[]
  onSelectWorkflow?: (wf: Workflow) => void
}

const statusDotColor: Record<string, string> = {
  active: 'var(--color-success)', disabled: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)', draft: 'var(--color-warning)',
}
const lastRunIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Clock,
}
const lastRunColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
}

const defaultAgentStep: WFAgentStep = {
  id: '', name: '', type: 'agent', roleDefinitionId: '', tools: [],
  retryCount: 1, retryDelaySeconds: 10, timeoutSeconds: 120,
}

const defaultScriptStep: WFScriptStep = {
  id: '', name: '', type: 'script', runtime: 'nodejs', code: '',
  retryCount: 0, retryDelaySeconds: 0, timeoutSeconds: 60,
}

const cronPresets = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
  { label: 'Monthly (1st)', value: '0 0 1 * *' },
]

const eventTypes = [
  { value: 'pr_created', label: 'PR created' },
  { value: 'merge_to_main', label: 'Merge to main' },
  { value: 'dependency_pr', label: 'Dependency PR' },
  { value: 'issue_created', label: 'Issue created' },
  { value: 'release_published', label: 'Release published' },
]

export function WorkflowCreateView({ workflow, onBack, allWorkflows, onSelectWorkflow }: WorkflowCreateViewProps) {
  const { isTeamMode } = useTeamContext()
  const isEdit = !!workflow
  const [name, setName] = useState(workflow?.name || '')
  const [description, setDescription] = useState(workflow?.description || '')
  const [tagsInput, setTagsInput] = useState(workflow?.tags.join(', ') || '')
  const [steps, setSteps] = useState<WFStep[]>(workflow?.steps || [])
  const [triggerType, setTriggerType] = useState<WFTriggerType>(workflow?.trigger.type || 'manual')
  const [cronExpression, setCronExpression] = useState(workflow?.trigger.cronExpression || '0 9 * * 1-5')
  const [eventType, setEventType] = useState(workflow?.trigger.eventType || 'pr_created')
  const [variables, setVariables] = useState<WFVariable[]>(workflow?.variables || [])
  const [scope, setScope] = useState<'personal' | 'team'>(workflow?.scope || 'team')

  let nextId = steps.length + 1

  const addStep = (type: 'agent' | 'script') => {
    const id = `new-${nextId++}`
    const step = type === 'agent'
      ? { ...defaultAgentStep, id, name: `Step ${steps.length + 1}` }
      : { ...defaultScriptStep, id, name: `Step ${steps.length + 1}` }
    setSteps([...steps, step])
  }

  const updateStep = (index: number, step: WFStep) => {
    const updated = [...steps]
    updated[index] = step
    setSteps(updated)
  }

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index))
  }

  const addVariable = () => {
    setVariables([...variables, { name: '', type: 'string', default: '', description: '', required: false }])
  }

  const updateVariable = (index: number, updates: Partial<WFVariable>) => {
    const updated = [...variables]
    updated[index] = { ...updated[index], ...updates }
    setVariables(updated)
  }

  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index))
  }

  // Cron human readable preview
  const cronPreview = cronPresets.find(p => p.value === cronExpression)?.label || cronExpression

  const showSidebar = isEdit && allWorkflows && allWorkflows.length > 1

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Workflow navigation sidebar (edit mode only) */}
      {showSidebar && (
        <div className="wf-nav-sidebar" style={{
          width: 200, flexShrink: 0, borderRight: '1px solid var(--color-border)',
          overflow: 'auto', padding: '16px 0',
        }}>
          <div style={{ padding: '0 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Automations
            </span>
          </div>
          <button
            onClick={onBack}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              background: 'transparent', border: 'none',
              color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <ArrowLeft size={11} strokeWidth={1.5} />
            All automations
          </button>
          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '6px 12px' }} />
          {allWorkflows!.map(wf => {
            const isActive = wf.id === workflow?.id
            const dotColor = statusDotColor[wf.status]
            const RunIcon = wf.lastRunStatus ? lastRunIcon[wf.lastRunStatus] : null
            const runColor = wf.lastRunStatus ? lastRunColor[wf.lastRunStatus] : undefined
            return (
              <button
                key={wf.id}
                onClick={() => onSelectWorkflow?.(wf)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                  background: isActive ? 'var(--color-surface-active)' : 'transparent',
                  border: 'none',
                  boxShadow: isActive ? 'inset 2px 0 0 var(--color-primary)' : 'none',
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 500 : 400, textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-surface-active)' : 'transparent' }}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</span>
                {RunIcon && <RunIcon size={11} strokeWidth={2} style={{ color: runColor, flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)' }}>
        <button onClick={onBack} style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-secondary)', cursor: 'pointer',
        }}>
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
          {isEdit ? `Edit: ${workflow.name}` : 'New automation'}
        </span>
        <button style={{
          height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          Save draft
        </button>
        <button style={{
          height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>
          {isEdit ? 'Save changes' : 'Save & activate'}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ── Name & Description ── */}
          <FormSection title="Details">
            <FieldGroup label="Name">
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Automation name" />
            </FieldGroup>
            <FieldGroup label="Description">
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={2} style={{ ...textareaStyle }}
                onInput={e => autoResize(e.currentTarget, 6)}
                placeholder="What does this automation do?" />
            </FieldGroup>
            <FieldGroup label="Tags">
              <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} style={inputStyle}
                placeholder="daily, slack, standup (comma-separated)" />
            </FieldGroup>
          </FormSection>

          {/* ── Visibility (team-mode only) ── */}
          {isTeamMode && (
            <FormSection title="Visibility">
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'personal' as const, label: 'Personal', icon: Lock, desc: 'Only you can edit' },
                  { key: 'team' as const, label: 'Team', icon: Users, desc: 'Team members can edit' },
                ] as const).map(({ key, label, icon: ScopeIcon, desc }) => (
                  <button key={key} onClick={() => setScope(key)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    border: scope === key ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: scope === key ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                  }}>
                    <ScopeIcon size={14} strokeWidth={1.5} style={{ color: scope === key ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: scope === key ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>{label}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </FormSection>
          )}

          {/* ── Steps ── */}
          <FormSection title="Steps" action={
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => addStep('agent')} style={addBtnStyle}>
                <Plus size={11} strokeWidth={2} /> Agent step
              </button>
              <button onClick={() => addStep('script')} style={addBtnStyle}>
                <Plus size={11} strokeWidth={2} /> Script step
              </button>
            </div>
          }>
            {steps.length === 0 ? (
              <div style={{
                padding: 32, textAlign: 'center', borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 13,
              }}>
                Add your first step to get started
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {steps.map((step, i) => (
                  <WorkflowStepCard
                    key={step.id}
                    step={step}
                    index={i}
                    mode="edit"
                    onChange={s => updateStep(i, s)}
                    onDelete={() => removeStep(i)}
                  />
                ))}
              </div>
            )}
          </FormSection>

          {/* ── Trigger ── */}
          <FormSection title="Trigger">
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {(['manual', 'cron', 'event', 'webhook'] as WFTriggerType[]).map(t => (
                <button key={t} onClick={() => setTriggerType(t)} style={{
                  height: 28, padding: '0 12px', border: 'none', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500, textTransform: 'capitalize',
                  background: triggerType === t ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                  color: triggerType === t ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
                }}>
                  {t}
                </button>
              ))}
            </div>

            {triggerType === 'cron' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FieldGroup label="Cron expression">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={cronExpression} onChange={e => setCronExpression(e.target.value)}
                      style={{ ...inputStyle, width: 180, fontFamily: 'var(--font-mono)' }} placeholder="0 9 * * 1-5" />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{cronPreview}</span>
                  </div>
                </FieldGroup>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {cronPresets.map(p => (
                    <button key={p.value} onClick={() => setCronExpression(p.value)} style={{
                      height: 22, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                      background: cronExpression === p.value ? 'var(--color-surface-active)' : 'var(--color-surface)',
                      color: cronExpression === p.value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                      cursor: 'pointer', fontSize: 10, fontWeight: 500,
                    }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {triggerType === 'event' && (
              <FieldGroup label="Event type">
                <select value={eventType} onChange={e => setEventType(e.target.value)}
                  style={{ ...inputStyle, width: 220 }}>
                  {eventTypes.map(e => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </FieldGroup>
            )}

            {triggerType === 'manual' && (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>
                This automation can only be triggered manually via the "Run" button.
              </div>
            )}

            {triggerType === 'webhook' && (
              <FieldGroup label="Webhook URL">
                <div style={{
                  ...inputStyle, display: 'flex', alignItems: 'center', padding: '0 8px',
                  color: 'var(--color-text-tertiary)', background: 'var(--color-surface)',
                }}>
                  https://api.stoneforge.dev/webhooks/wf/{workflow?.id || 'new'}
                </div>
              </FieldGroup>
            )}
          </FormSection>

          {/* ── Variables ── */}
          <FormSection title="Variables" action={
            <button onClick={addVariable} style={addBtnStyle}>
              <Plus size={11} strokeWidth={2} /> Add variable
            </button>
          }>
            {variables.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>
                No variables defined. Variables can be referenced in steps as {'{{vars.name}}'}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {variables.map((v, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10,
                    background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={v.name} onChange={e => updateVariable(i, { name: e.target.value })}
                          style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }} placeholder="name" />
                        <select value={v.type} onChange={e => updateVariable(i, { type: e.target.value as WFVariable['type'] })}
                          style={{ ...inputStyle, width: 100 }}>
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="enum">enum</option>
                        </select>
                        <input value={v.default || ''} onChange={e => updateVariable(i, { default: e.target.value })}
                          style={{ ...inputStyle, flex: 1 }} placeholder="default value" />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input value={v.description || ''} onChange={e => updateVariable(i, { description: e.target.value })}
                          style={{ ...inputStyle, flex: 1 }} placeholder="description" />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-tertiary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={v.required} onChange={e => updateVariable(i, { required: e.target.checked })} />
                          Required
                        </label>
                      </div>
                    </div>
                    <button onClick={() => removeVariable(i)} style={{
                      width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0, marginTop: 2,
                    }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* Bottom spacer */}
          <div style={{ height: 40 }} />
        </div>
      </div>
      </div>
    </div>
  )
}

function FormSection({ title, action, children }: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{title}</span>
        <div style={{ flex: 1 }} />
        {action}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
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

