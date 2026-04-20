import { useState, useRef, useCallback } from 'react'
import { X, FileCode, Plus, Trash2 } from 'lucide-react'
import type { CIAction } from './ci-types'

interface CreateActionDialogProps {
  onClose: () => void
  onCreate: (action: CIAction) => void
}

type TriggerType = 'push' | 'pull_request' | 'schedule' | 'workflow_dispatch'

interface TriggerConfig {
  type: TriggerType
  branches?: string
  cron?: string
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  push: 'Push',
  pull_request: 'Pull Request',
  schedule: 'Schedule',
  workflow_dispatch: 'Manual',
}

const DEFAULT_JOBS_YAML = `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: echo "Building..."
      - name: Test
        run: echo "Testing..."
`

// ── YAML generation ──

function generateYaml(name: string, triggers: TriggerConfig[], jobsYaml: string): string {
  const lines: string[] = []
  lines.push(`name: ${name || 'New Action'}`)

  if (triggers.length === 0) {
    lines.push('on:', '  push:', '    branches: [main]')
  } else {
    lines.push('on:')
    for (const t of triggers) {
      if (t.type === 'push' || t.type === 'pull_request') {
        const branches = t.branches?.trim() || 'main'
        lines.push(`  ${t.type}:`, `    branches: [${branches}]`)
      } else if (t.type === 'schedule') {
        lines.push('  schedule:', `    - cron: '${t.cron?.trim() || '0 0 * * *'}'`)
      } else if (t.type === 'workflow_dispatch') {
        lines.push('  workflow_dispatch:')
      }
    }
  }

  lines.push('')
  lines.push(jobsYaml.trimEnd())
  return lines.join('\n') + '\n'
}

// ── YAML parsing ──

function parseYaml(yaml: string): { name: string; triggers: TriggerConfig[]; jobsYaml: string } {
  const lines = yaml.split('\n')
  let name = ''
  const triggers: TriggerConfig[] = []
  let jobsStart = -1

  // Extract name
  const nameMatch = yaml.match(/^name:\s*(.+)/m)
  if (nameMatch) name = nameMatch[1].trim()

  // Find the on: block and jobs: block
  let inOn = false
  let currentTriggerType: TriggerType | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()

    if (/^jobs\s*:/.test(trimmed) && (line.startsWith('jobs') || line.startsWith('jobs:'))) {
      jobsStart = i
      break
    }

    if (/^on\s*:/.test(trimmed) && (line.startsWith('on') || line.startsWith('on:'))) {
      inOn = true
      continue
    }

    if (inOn) {
      // Top-level trigger (2 spaces indent)
      if (/^  \S/.test(line) && !line.startsWith('    ')) {
        const key = trimmed.replace(':', '').trim()
        if (key === 'push' || key === 'pull_request' || key === 'schedule' || key === 'workflow_dispatch') {
          currentTriggerType = key
          const existing = triggers.find(t => t.type === key)
          if (!existing) triggers.push({ type: key })
        } else {
          currentTriggerType = null
        }
      }
      // Config line (4+ spaces indent)
      else if (/^    /.test(line) && currentTriggerType) {
        if (currentTriggerType === 'push' || currentTriggerType === 'pull_request') {
          const branchMatch = trimmed.match(/branches:\s*\[(.+)\]/)
          if (branchMatch) {
            const trigger = triggers.find(t => t.type === currentTriggerType)
            if (trigger) trigger.branches = branchMatch[1].trim()
          }
        } else if (currentTriggerType === 'schedule') {
          const cronMatch = trimmed.match(/cron:\s*['"]?([^'"]+)['"]?/)
          if (cronMatch) {
            const trigger = triggers.find(t => t.type === 'schedule')
            if (trigger) trigger.cron = cronMatch[1].trim()
          }
        }
      }
      // Non-indented line ends the on: block
      else if (/^\S/.test(line) && line.trim()) {
        inOn = false
      }
    }
  }

  const jobsYaml = jobsStart >= 0 ? lines.slice(jobsStart).join('\n') : DEFAULT_JOBS_YAML
  return { name, triggers, jobsYaml }
}

export function CreateActionDialog({ onClose, onCreate }: CreateActionDialogProps) {
  const [name, setName] = useState('')
  const [fileName, setFileName] = useState('')
  const [triggers, setTriggers] = useState<TriggerConfig[]>([{ type: 'push', branches: 'main' }])
  const [jobsYaml, setJobsYaml] = useState(DEFAULT_JOBS_YAML)
  const [yaml, setYaml] = useState(() => generateYaml('', [{ type: 'push', branches: 'main' }], DEFAULT_JOBS_YAML))

  // Track who last changed state to prevent infinite sync loops
  const syncSource = useRef<'form' | 'yaml' | null>(null)

  const autoFileName = name ? `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.yml` : ''
  const effectiveFileName = fileName || autoFileName

  // Form → YAML sync
  const updateFromForm = useCallback((newName: string, newTriggers: TriggerConfig[], newJobsYaml: string) => {
    syncSource.current = 'form'
    setYaml(generateYaml(newName, newTriggers, newJobsYaml))
    // Reset after microtask so yaml onChange doesn't re-parse
    queueMicrotask(() => { syncSource.current = null })
  }, [])

  const handleNameChange = (val: string) => {
    setName(val)
    updateFromForm(val, triggers, jobsYaml)
  }

  const handleTriggersChange = (newTriggers: TriggerConfig[]) => {
    setTriggers(newTriggers)
    updateFromForm(name, newTriggers, jobsYaml)
  }

  const addTrigger = () => {
    // Pick the first unused trigger type
    const used = new Set(triggers.map(t => t.type))
    const available: TriggerType[] = ['push', 'pull_request', 'schedule', 'workflow_dispatch']
    const next = available.find(t => !used.has(t))
    if (!next) return
    const newTrigger: TriggerConfig = next === 'schedule'
      ? { type: next, cron: '0 0 * * *' }
      : next === 'workflow_dispatch'
        ? { type: next }
        : { type: next, branches: 'main' }
    handleTriggersChange([...triggers, newTrigger])
  }

  const removeTrigger = (idx: number) => {
    handleTriggersChange(triggers.filter((_, i) => i !== idx))
  }

  const updateTrigger = (idx: number, updates: Partial<TriggerConfig>) => {
    handleTriggersChange(triggers.map((t, i) => i === idx ? { ...t, ...updates } : t))
  }

  // YAML → Form sync
  const handleYamlChange = (newYaml: string) => {
    setYaml(newYaml)
    if (syncSource.current === 'form') return

    syncSource.current = 'yaml'
    const parsed = parseYaml(newYaml)
    setName(parsed.name)
    setTriggers(parsed.triggers)
    setJobsYaml(parsed.jobsYaml)
    queueMicrotask(() => { syncSource.current = null })
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    const action: CIAction = {
      id: `action-${Date.now()}`,
      name,
      fileName: effectiveFileName || `${name.toLowerCase().replace(/\s+/g, '-')}.yml`,
      path: `.github/workflows/${effectiveFileName || 'action.yml'}`,
      dispatchInputs: triggers.some(t => t.type === 'workflow_dispatch') ? [] : undefined,
    }
    onCreate(action)
    onClose()
  }

  const allTriggerTypesUsed = triggers.length >= 4

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-overlay)', zIndex: 1040 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 640, maxWidth: '90vw', maxHeight: '85vh',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
        zIndex: 1050, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <FileCode size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Create Action</span>
          <button onClick={onClose} style={closeBtnStyle}><X size={14} strokeWidth={1.5} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input
              autoFocus value={name} onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. CI, Deploy Staging, Nightly E2E"
              style={inputStyle}
            />
          </div>

          {/* File name */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>File name</label>
            <div style={{
              display: 'flex', alignItems: 'center', height: 32,
              background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', overflow: 'hidden',
            }}>
              <span style={{ padding: '0 0 0 10px', fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                .github/workflows/
              </span>
              <input
                value={fileName} onChange={e => setFileName(e.target.value)}
                placeholder={autoFileName || 'auto-generated from name'}
                style={{
                  flex: 1, height: '100%', padding: '0 10px 0 0', border: 'none', background: 'transparent',
                  fontSize: 12, color: 'var(--color-text)', outline: 'none', fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          </div>

          {/* Trigger events */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Trigger events</label>
              {!allTriggerTypesUsed && (
                <button onClick={addTrigger} style={{
                  height: 22, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 3,
                  border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
                  color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11,
                }}>
                  <Plus size={10} strokeWidth={2} /> Add
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {triggers.map((trigger, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  padding: '6px 8px', background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)',
                }}>
                  <select
                    value={trigger.type}
                    onChange={e => {
                      const newType = e.target.value as TriggerType
                      const updated: TriggerConfig = newType === 'schedule'
                        ? { type: newType, cron: '0 0 * * *' }
                        : newType === 'workflow_dispatch'
                          ? { type: newType }
                          : { type: newType, branches: 'main' }
                      updateTrigger(i, updated)
                    }}
                    style={{
                      width: 140, height: 28, padding: '0 6px',
                      border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-bg)', fontSize: 12, color: 'var(--color-text)',
                      outline: 'none', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map(t => (
                      <option key={t} value={t} disabled={t !== trigger.type && triggers.some(x => x.type === t)}>
                        {TRIGGER_LABELS[t]}
                      </option>
                    ))}
                  </select>

                  {(trigger.type === 'push' || trigger.type === 'pull_request') && (
                    <input
                      value={trigger.branches || ''}
                      onChange={e => updateTrigger(i, { branches: e.target.value })}
                      placeholder="main, develop"
                      style={{
                        flex: 1, height: 28, padding: '0 8px',
                        border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg)', fontSize: 12, color: 'var(--color-text)',
                        outline: 'none',
                      }}
                    />
                  )}

                  {trigger.type === 'schedule' && (
                    <input
                      value={trigger.cron || ''}
                      onChange={e => updateTrigger(i, { cron: e.target.value })}
                      placeholder="0 0 * * *"
                      style={{
                        flex: 1, height: 28, padding: '0 8px',
                        border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg)', fontSize: 12, color: 'var(--color-text)',
                        outline: 'none', fontFamily: 'var(--font-mono)',
                      }}
                    />
                  )}

                  {trigger.type === 'workflow_dispatch' && (
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--color-text-tertiary)', padding: '0 4px' }}>
                      Enables manual triggering via "Run action"
                    </span>
                  )}

                  <button onClick={() => removeTrigger(i)} style={{
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', background: 'none', color: 'var(--color-text-tertiary)',
                    cursor: 'pointer', borderRadius: 'var(--radius-sm)', flexShrink: 0,
                  }}>
                    <Trash2 size={11} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              {triggers.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>
                  No triggers. Click "+ Add" to add a trigger event.
                </div>
              )}
            </div>
          </div>

          {/* YAML editor */}
          <div>
            <label style={labelStyle}>YAML</label>
            <textarea
              value={yaml}
              onChange={e => handleYamlChange(e.target.value)}
              onKeyDown={e => {
                // Allow Tab to insert spaces instead of moving focus
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const target = e.target as HTMLTextAreaElement
                  const start = target.selectionStart
                  const end = target.selectionEnd
                  const newVal = yaml.substring(0, start) + '  ' + yaml.substring(end)
                  handleYamlChange(newVal)
                  // Restore cursor position after React re-render
                  requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + 2
                  })
                }
              }}
              style={{
                width: '100%', minHeight: 220, padding: '10px 12px', resize: 'vertical',
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)',
                outline: 'none', fontFamily: 'var(--font-mono)', lineHeight: 1.6, tabSize: 2,
              }}
              spellCheck={false}
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
            disabled={!name.trim()}
            style={{
              height: 32, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: name.trim() ? 'var(--color-primary)' : 'var(--color-surface-active)',
              color: name.trim() ? 'white' : 'var(--color-text-tertiary)',
              cursor: name.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 500,
            }}
          >
            <FileCode size={12} strokeWidth={2} /> Create Action
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
  outline: 'none', fontFamily: 'inherit',
}
