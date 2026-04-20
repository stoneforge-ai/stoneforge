import { useState, useRef, useCallback } from 'react'
import { X, Pencil, Trash2, Plus, ArrowLeft } from 'lucide-react'
import type { PreviewEnvironment } from '../../mock-data'

interface PreviewConfigDialogProps {
  environments: PreviewEnvironment[]
  onClose: () => void
  onSave: (environments: PreviewEnvironment[]) => void
}

export function PreviewConfigDialog({ environments, onClose, onSave }: PreviewConfigDialogProps) {
  const [envs, setEnvs] = useState<PreviewEnvironment[]>([...environments])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<Partial<PreviewEnvironment>>({})

  const editEnv = (index: number) => {
    setEditingIndex(index)
    setDraft({ ...envs[index] })
  }

  const addNew = () => {
    setEditingIndex(-1) // -1 means new
    setDraft({ id: `env-${Date.now()}`, name: '', url: 'http://localhost:', port: 3000 })
  }

  const saveDraft = () => {
    if (!draft.name?.trim() || !draft.url?.trim()) return
    const env: PreviewEnvironment = {
      id: draft.id || `env-${Date.now()}`,
      name: draft.name!.trim(),
      url: draft.url!.trim(),
      port: draft.port || 3000,
      startCommand: draft.startCommand?.trim() || undefined,
      branchFilter: draft.branchFilter?.trim() || undefined,
    }
    if (editingIndex === -1) {
      setEnvs(prev => [...prev, env])
    } else if (editingIndex !== null) {
      setEnvs(prev => prev.map((e, i) => i === editingIndex ? env : e))
    }
    setEditingIndex(null)
    setDraft({})
  }

  const deleteEnv = (index: number) => {
    setEnvs(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave(envs)
    onClose()
  }

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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          {editingIndex !== null && (
            <button
              onClick={() => { setEditingIndex(null); setDraft({}) }}
              style={{
                width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <ArrowLeft size={14} strokeWidth={1.5} />
            </button>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
            {editingIndex !== null
              ? (editingIndex === -1 ? 'Add Environment' : 'Edit Environment')
              : 'Preview Environments'}
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
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {editingIndex !== null ? (
            /* ── Edit form ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FormField label="Name" required>
                <input
                  value={draft.name || ''}
                  onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Frontend App"
                  autoFocus
                  style={inputStyle}
                />
              </FormField>
              <FormField label="URL">
                <input
                  value={draft.url || ''}
                  onChange={e => setDraft(p => ({ ...p, url: e.target.value }))}
                  placeholder="http://localhost:5174"
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </FormField>
              <FormField label="Port">
                <input
                  type="number"
                  value={draft.port || ''}
                  onChange={e => setDraft(p => ({ ...p, port: parseInt(e.target.value) || 0 }))}
                  placeholder="5174"
                  style={{ ...inputStyle, width: 100 }}
                />
              </FormField>
              <FormField label="Start Command">
                <AutoExpandTextarea
                  value={draft.startCommand || ''}
                  onChange={v => setDraft(p => ({ ...p, startCommand: v }))}
                  placeholder={"pnpm install\npnpm dev"}
                  maxRows={6}
                />
              </FormField>
              <FormField label="Branch Filter" helper="Only show for branches matching this pattern">
                <input
                  value={draft.branchFilter || ''}
                  onChange={e => setDraft(p => ({ ...p, branchFilter: e.target.value }))}
                  placeholder="feat/*"
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </FormField>
            </div>
          ) : (
            /* ── List view ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {envs.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                  No environments configured yet
                </div>
              ) : envs.map((env, i) => (
                <div
                  key={env.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{env.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {env.url} : {env.port}
                      {env.startCommand && <span style={{ marginLeft: 8 }}> {env.startCommand}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => editEnv(i)}
                    style={listBtnStyle}
                    title="Edit"
                  >
                    <Pencil size={12} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => deleteEnv(i)}
                    style={{ ...listBtnStyle, color: 'var(--color-danger)' }}
                    title="Delete"
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              <button
                onClick={addNew}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
                  background: 'none', border: 'none', color: 'var(--color-text-accent)',
                  cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500,
                  marginTop: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <Plus size={13} strokeWidth={1.5} />
                Add Environment
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px',
          borderTop: '1px solid var(--color-border-subtle)',
        }}>
          {editingIndex !== null ? (
            <>
              <button onClick={() => { setEditingIndex(null); setDraft({}) }} style={secondaryBtnStyle}>Cancel</button>
              <button
                onClick={saveDraft}
                disabled={!draft.name?.trim() || !draft.url?.trim()}
                style={{
                  ...primaryBtnStyle,
                  opacity: (!draft.name?.trim() || !draft.url?.trim()) ? 0.5 : 1,
                }}
              >
                {editingIndex === -1 ? 'Add' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={handleSave} style={primaryBtnStyle}>Save</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function FormField({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </div>
      {children}
      {helper && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 3 }}>{helper}</div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 30, padding: '0 10px',
  background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
  fontSize: 12, outline: 'none',
}

const listBtnStyle: React.CSSProperties = {
  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
  cursor: 'pointer', borderRadius: 'var(--radius-sm)',
}

const secondaryBtnStyle: React.CSSProperties = {
  height: 26, padding: '0 12px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
}

const primaryBtnStyle: React.CSSProperties = {
  height: 26, padding: '0 12px', background: 'var(--color-primary)',
  border: 'none', borderRadius: 'var(--radius-sm)',
  color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
}

const LINE_HEIGHT = 18 // ~12px font * 1.5 line-height
const TEXTAREA_PAD_Y = 10 // 5px top + 5px bottom

function AutoExpandTextarea({ value, onChange, placeholder, maxRows, minRows = 2 }: {
  value: string; onChange: (v: string) => void; placeholder: string; maxRows: number; minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const minH = minRows * LINE_HEIGHT + TEXTAREA_PAD_Y
  const maxH = maxRows * LINE_HEIGHT + TEXTAREA_PAD_Y

  const adjustHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = `${minH}px` // reset to min to measure scrollHeight
    const needed = Math.min(el.scrollHeight, maxH)
    el.style.height = `${Math.max(needed, minH)}px`
  }, [maxRows, minH, maxH])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => { onChange(e.target.value); requestAnimationFrame(adjustHeight) }}
      onFocus={adjustHeight}
      placeholder={placeholder}
      rows={minRows}
      style={{
        ...inputStyle,
        height: minH,
        minHeight: minH,
        maxHeight: maxH,
        fontFamily: 'var(--font-mono)',
        padding: '5px 10px',
        resize: 'none',
        lineHeight: `${LINE_HEIGHT}px`,
        overflow: 'auto',
      }}
    />
  )
}
