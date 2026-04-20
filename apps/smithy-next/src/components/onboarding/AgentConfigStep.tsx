import { useState, useRef, useEffect, type Dispatch } from 'react'
import { Bot, ChevronDown, Check, Plus, Minus } from 'lucide-react'
import {
  AGENT_PROVIDERS, MODELS_BY_PROVIDER, EFFORT_LEVELS,
  type OnboardingState, type OnboardingAction,
} from './onboarding-types'

interface Props {
  state: OnboardingState
  dispatch: Dispatch<OnboardingAction>
}

type DropdownId = `${number}-${'provider' | 'model' | 'effort'}`

export function AgentConfigStep({ state, dispatch }: Props) {
  const [openDropdown, setOpenDropdown] = useState<DropdownId | null>(null)

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
        Default Agents
      </h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 20 }}>
        Configure the compute agents for your workspace. Role definitions determine what each agent does — you can assign them later.
      </p>

      <div style={{
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: 'var(--color-text-tertiary)',
          background: 'var(--color-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--color-primary)' }}><Bot size={14} /></span>
            Agents ({state.agents.length})
          </span>
          <button
            onClick={() => dispatch({ type: 'ADD_AGENT' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer',
              textTransform: 'none', letterSpacing: 'normal', fontWeight: 500,
              transition: 'all var(--duration-fast) ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {/* Agent rows */}
        {state.agents.map((agent, idx) => {
          const providerModels = MODELS_BY_PROVIDER[agent.provider]
          const providerName = AGENT_PROVIDERS.find(p => p.id === agent.provider)?.name || agent.provider
          const modelName = providerModels.find(m => m.id === agent.model)?.name || agent.model
          const effortName = EFFORT_LEVELS.find(e => e.id === agent.effort)?.name || agent.effort
          const canRemove = state.agents.length > 1

          return (
            <div
              key={idx}
              className="onboarding-agent-row"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', gap: 12,
                borderTop: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-elevated)',
              }}
            >
              {/* Name + remove */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {canRemove && (
                  <RemoveButton onClick={() => dispatch({ type: 'REMOVE_AGENT', index: idx })} />
                )}
                <span style={{ color: 'var(--color-primary)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <Bot size={14} />
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--color-text)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {agent.name}
                </span>
              </div>

              {/* Dropdowns */}
              <div className="onboarding-agent-dropdowns" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <AgentPillDropdown
                  id={`${idx}-provider` as DropdownId}
                  label={providerName}
                  items={AGENT_PROVIDERS.map(p => ({ id: p.id, label: p.name }))}
                  value={agent.provider}
                  onChange={v => dispatch({ type: 'UPDATE_AGENT', index: idx, updates: { provider: v as any } })}
                  open={openDropdown === `${idx}-provider`}
                  onToggle={() => setOpenDropdown(openDropdown === `${idx}-provider` ? null : `${idx}-provider`)}
                  onClose={() => setOpenDropdown(null)}
                />
                <AgentPillDropdown
                  id={`${idx}-model` as DropdownId}
                  label={modelName}
                  items={providerModels.map(m => ({ id: m.id, label: m.name }))}
                  value={agent.model}
                  onChange={v => dispatch({ type: 'UPDATE_AGENT', index: idx, updates: { model: v } })}
                  open={openDropdown === `${idx}-model`}
                  onToggle={() => setOpenDropdown(openDropdown === `${idx}-model` ? null : `${idx}-model`)}
                  onClose={() => setOpenDropdown(null)}
                />
                <AgentPillDropdown
                  id={`${idx}-effort` as DropdownId}
                  label={effortName}
                  items={EFFORT_LEVELS.map(e => ({ id: e.id, label: e.name }))}
                  value={agent.effort}
                  onChange={v => dispatch({ type: 'UPDATE_AGENT', index: idx, updates: { effort: v as any } })}
                  open={openDropdown === `${idx}-effort`}
                  onToggle={() => setOpenDropdown(openDropdown === `${idx}-effort` ? null : `${idx}-effort`)}
                  onClose={() => setOpenDropdown(null)}
                  narrow
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Pill dropdown for agent config ──

function AgentPillDropdown({ label, items, value, onChange, open, onToggle, onClose, narrow }: {
  id: DropdownId
  label: string
  items: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  narrow?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          background: open ? 'var(--color-primary-subtle)' : hovered ? 'var(--color-surface-hover)' : 'var(--color-surface)',
          color: 'var(--color-text)', fontSize: 12, cursor: 'pointer',
          whiteSpace: 'nowrap',
          maxWidth: narrow ? 90 : 180,
          transition: 'all var(--duration-fast) ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <ChevronDown size={11} style={{
          color: 'var(--color-text-tertiary)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform var(--duration-fast) ease',
        }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
          overflow: 'hidden', minWidth: 140,
        }}>
          {items.map(item => {
            const isSelected = item.id === value
            return (
              <PillDropdownItem
                key={item.id}
                label={item.label}
                selected={isSelected}
                onClick={() => { onChange(item.id); onClose() }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Remove agent"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 'var(--radius-sm)',
        border: 'none', cursor: 'pointer', flexShrink: 0,
        background: hovered ? 'color-mix(in srgb, var(--color-danger) 15%, transparent)' : 'transparent',
        color: hovered ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
        transition: 'all var(--duration-fast) ease',
      }}
    >
      <Minus size={13} />
    </button>
  )
}

function PillDropdownItem({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 12,
        background: selected ? 'var(--color-primary-subtle)' : hovered ? 'var(--color-surface-hover)' : 'transparent',
        color: selected ? 'var(--color-primary)' : 'var(--color-text)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {selected && <Check size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
    </button>
  )
}
