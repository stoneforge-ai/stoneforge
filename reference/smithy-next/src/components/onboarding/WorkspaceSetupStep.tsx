import { useState, useRef, useEffect, type Dispatch } from 'react'
import { Zap, Eye, ShieldCheck, ChevronDown, Search, Check, GitBranch } from 'lucide-react'
import {
  WORKFLOW_PRESETS, AGENT_PROVIDERS, MOCK_BRANCHES,
  type OnboardingState, type OnboardingAction, type WorkflowPreset, type AgentProviderType,
} from './onboarding-types'

interface Props {
  state: OnboardingState
  dispatch: Dispatch<OnboardingAction>
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
  'zap': <Zap size={18} />,
  'eye': <Eye size={18} />,
  'shield-check': <ShieldCheck size={18} />,
}

export function WorkspaceSetupStep({ state, dispatch }: Props) {
  const [providerOpen, setProviderOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const providerRef = useRef<HTMLDivElement>(null)
  const branchRef = useRef<HTMLDivElement>(null)
  const branchInputRef = useRef<HTMLInputElement>(null)

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) setProviderOpen(false)
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (branchOpen && branchInputRef.current) branchInputRef.current.focus()
  }, [branchOpen])

  const filteredBranches = MOCK_BRANCHES.filter(b =>
    b.toLowerCase().includes(branchSearch.toLowerCase())
  )

  const providerName = AGENT_PROVIDERS.find(p => p.id === state.agentProvider)?.name || ''

  return (
    <div>
      {/* Section: Workflow Preset */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
          Workspace Preset
        </h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
          Controls how agents merge code and what permissions they have
        </p>

        <div className="onboarding-cards" style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          {WORKFLOW_PRESETS.map(preset => {
            const selected = state.workflowPreset === preset.id
            return (
              <PresetCard
                key={preset.id}
                icon={PRESET_ICONS[preset.icon]}
                name={preset.name}
                description={preset.description}
                selected={selected}
                recommended={preset.id === 'review'}
                onClick={() => dispatch({ type: 'SET_WORKFLOW_PRESET', preset: preset.id as WorkflowPreset })}
              />
            )
          })}
        </div>
      </div>

      {/* Row: Provider + Branch */}
      <div className="onboarding-fields-row" style={{ display: 'flex', gap: 16 }}>
        {/* Agent Provider */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Agent Provider
          </label>
          <div ref={providerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setProviderOpen(p => !p); setBranchOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                color: 'var(--color-text)', fontSize: 13, cursor: 'pointer',
                transition: 'border-color var(--duration-fast) ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border-hover, var(--color-text-tertiary))')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              <span>{providerName}</span>
              <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)', transform: providerOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-fast) ease' }} />
            </button>
            {providerOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
                overflow: 'hidden',
              }}>
                {AGENT_PROVIDERS.map(p => (
                  <DropdownItem
                    key={p.id}
                    label={p.name}
                    selected={state.agentProvider === p.id}
                    onClick={() => {
                      dispatch({ type: 'SET_AGENT_PROVIDER', provider: p.id as AgentProviderType })
                      setProviderOpen(false)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Default Branch */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Default Branch
          </label>
          <div ref={branchRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setBranchOpen(p => !p); setProviderOpen(false); setBranchSearch('') }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                color: 'var(--color-text)', fontSize: 13, cursor: 'pointer',
                transition: 'border-color var(--duration-fast) ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border-hover, var(--color-text-tertiary))')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GitBranch size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                {state.defaultBranch}
              </span>
              <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)', transform: branchOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-fast) ease' }} />
            </button>
            {branchOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' }}>
                    <Search size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <input
                      ref={branchInputRef}
                      value={branchSearch}
                      onChange={e => setBranchSearch(e.target.value)}
                      placeholder="Search branches..."
                      style={{
                        border: 'none', background: 'none', outline: 'none', width: '100%',
                        color: 'var(--color-text)', fontSize: 12,
                      }}
                    />
                  </div>
                </div>
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  {filteredBranches.map(branch => (
                    <DropdownItem
                      key={branch}
                      label={branch}
                      selected={state.defaultBranch === branch}
                      onClick={() => {
                        dispatch({ type: 'SET_BRANCH', branch })
                        setBranchOpen(false)
                      }}
                      mono
                    />
                  ))}
                  {filteredBranches.length === 0 && (
                    <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      No matching branches
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ──

function PresetCard({ icon, name, description, selected, recommended, onClick }: {
  icon: React.ReactNode; name: string; description: string; selected: boolean; recommended?: boolean; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {recommended && (
        <div style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1, fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
          color: '#fff', background: 'var(--color-primary)',
          padding: '2px 10px', borderRadius: 'var(--radius-full)',
          whiteSpace: 'nowrap',
        }}>
          Recommended
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%', flex: 1, padding: '16px 18px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          textAlign: 'left', transition: 'all var(--duration-normal) ease',
          background: selected ? 'var(--color-primary-subtle)' : hovered ? 'var(--color-surface-hover)' : 'var(--color-surface)',
          border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{name}</span>
          {selected && (
            <span style={{
              fontSize: 11, fontWeight: 500, color: 'var(--color-success)',
              background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
              padding: '1px 8px', borderRadius: 'var(--radius-full)',
            }}>current</span>
          )}
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', margin: 0 }}>
          {description}
        </p>
      </button>
    </div>
  )
}

function DropdownItem({ label, selected, onClick, mono }: {
  label: string; selected: boolean; onClick: () => void; mono?: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 13,
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        background: selected ? 'var(--color-primary-subtle)' : hovered ? 'var(--color-surface-hover)' : 'transparent',
        color: selected ? 'var(--color-primary)' : 'var(--color-text)',
      }}
    >
      {label}
      {selected && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
    </button>
  )
}
