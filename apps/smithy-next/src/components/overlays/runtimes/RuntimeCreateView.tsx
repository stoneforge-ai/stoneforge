import { useState } from 'react'
import {
  ArrowLeft, GitBranch, Container, Cloud, FolderOpen, Save,
  Square, CheckSquare, Monitor, Wifi, WifiOff,
} from 'lucide-react'
import type { RuntimeMode, Host, SandboxTier } from './runtime-types'
import { runtimeModeLabels, runtimeModeColors, hostStatusColors, tunnelStatusColors, sandboxTierLabels } from './runtime-types'

interface RuntimeCreateViewProps {
  onBack: () => void
  hosts: Host[]
  editingRuntime?: {
    id: string
    name: string
    hostId: string
    mode: RuntimeMode
    isDefault: boolean
    worktreePath?: string
    dockerImage?: string
    sandboxTier?: SandboxTier
    sandboxBaseImage?: string
  } | null
}

export function RuntimeCreateView({ onBack, hosts, editingRuntime }: RuntimeCreateViewProps) {
  const isEdit = !!editingRuntime
  const [name, setName] = useState(editingRuntime?.name || '')
  const [selectedMode, setSelectedMode] = useState<RuntimeMode>(editingRuntime?.mode || 'worktrees')
  const [selectedHostId, setSelectedHostId] = useState(editingRuntime?.hostId || '')
  const [isDefault, setIsDefault] = useState(editingRuntime?.isDefault || false)
  const [worktreePath, setWorktreePath] = useState(editingRuntime?.worktreePath || '.stoneforge/worktrees')
  const [dockerImage, setDockerImage] = useState(editingRuntime?.dockerImage || 'ghcr.io/stoneforge/worker:latest')
  const [sandboxTier, setSandboxTier] = useState<SandboxTier>(editingRuntime?.sandboxTier || 'medium')
  const [sandboxBaseImage, setSandboxBaseImage] = useState(editingRuntime?.sandboxBaseImage || '')

  // Filter hosts based on selected mode
  const hostsForMode = hosts.filter(h => {
    if (selectedMode === 'worktrees') return !h.managed
    if (selectedMode === 'docker') return h.capabilities.includes('docker')
    if (selectedMode === 'sandbox') return h.capabilities.includes('sandbox')
    return true
  })

  // Auto-select first valid host when not set or invalid
  const hostValid = hostsForMode.some(h => h.id === selectedHostId)
  if (!hostValid && hostsForMode.length > 0 && !selectedHostId) {
    // Will be set on first render
  }

  const handleModeChange = (mode: RuntimeMode) => {
    setSelectedMode(mode)
    const filtered = hosts.filter(h => {
      if (mode === 'worktrees') return !h.managed
      if (mode === 'docker') return h.capabilities.includes('docker')
      if (mode === 'sandbox') return h.capabilities.includes('sandbox')
      return true
    })
    if (filtered.length > 0 && !filtered.some(h => h.id === selectedHostId)) {
      setSelectedHostId(filtered[0].id)
    }
  }

  // Initialize host selection on first render
  useState(() => {
    if (!selectedHostId && hostsForMode.length > 0) {
      setSelectedHostId(hostsForMode[0].id)
    }
  })

  const canSave = name.trim().length > 0 && hostValid

  const handleSave = () => {
    if (!canSave) return
    onBack()
  }

  const modeCards: { mode: RuntimeMode; icon: typeof GitBranch; label: string; description: string }[] = [
    { mode: 'worktrees', icon: GitBranch, label: 'Worktree', description: 'Git worktrees on the host filesystem.' },
    { mode: 'docker', icon: Container, label: 'Docker', description: 'Docker containers on the host.' },
    { mode: 'sandbox', icon: Cloud, label: 'Sandbox', description: 'Ephemeral cloud environments, provisioned on demand.' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-tertiary)', cursor: 'pointer',
        }}>
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          {isEdit ? 'Edit Runtime' : 'New Runtime'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onBack} style={{
          height: 28, padding: '0 12px', border: '1px solid var(--color-border)',
          background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}>Cancel</button>
        <button onClick={handleSave} disabled={!canSave} style={{
          height: 28, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5,
          background: canSave ? 'var(--color-primary)' : 'var(--color-surface)',
          border: 'none', borderRadius: 'var(--radius-sm)',
          color: canSave ? 'white' : 'var(--color-text-tertiary)',
          cursor: canSave ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 500,
          opacity: canSave ? 1 : 0.6,
        }}>
          <Save size={12} strokeWidth={1.5} /> {isEdit ? 'Save' : 'Create'}
        </button>
      </div>

      {/* Form body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', maxWidth: 720 }}>
        {/* Name */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Name
          </label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. adam-macbook, cloud-sandbox"
            style={{
              width: '100%', height: 34, padding: '0 10px', fontSize: 13, fontFamily: 'inherit',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-border-focus)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          />
        </div>

        {/* Step 1: Mode selector */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            Execution Mode
          </label>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
            Choose how agents run in this runtime.
          </p>
          <div className="rt-create-mode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {modeCards.map(card => {
              const selected = selectedMode === card.mode
              const color = runtimeModeColors[card.mode]
              return (
                <ModeCard
                  key={card.mode}
                  icon={<card.icon size={20} />}
                  name={card.label}
                  description={card.description}
                  selected={selected}
                  accentColor={color.text}
                  accentBg={color.bg}
                  onClick={() => handleModeChange(card.mode)}
                />
              )
            })}
          </div>
        </div>

        {/* Step 2: Host selector (filtered by mode) */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            Host
          </label>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>
            {selectedMode === 'sandbox'
              ? 'Select the cloud provider for this sandbox.'
              : selectedMode === 'docker'
                ? 'Select the machine or cloud provider to run Docker containers.'
                : 'Select the machine to run worktrees on.'}
            {isEdit && <span style={{ fontStyle: 'italic' }}> Host cannot be changed after creation.</span>}
          </p>
          {hostsForMode.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {selectedMode === 'sandbox' ? 'No cloud providers connected.' :
                  selectedMode === 'docker' ? 'No hosts with Docker capability.' :
                    'No hosts connected.'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {hostsForMode.map(host => {
                const isSelected = host.id === selectedHostId
                const TunnelIcon = host.tunnelStatus === 'connected' ? Wifi : WifiOff
                return (
                  <button
                    key={host.id}
                    onClick={() => { if (!isEdit) setSelectedHostId(host.id) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)', textAlign: 'left',
                      cursor: isEdit ? 'default' : 'pointer',
                      background: isSelected ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                      border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      opacity: isEdit && !isSelected ? 0.5 : 1,
                      transition: 'all var(--duration-fast) ease',
                    }}
                  >
                    {host.managed
                      ? <Cloud size={16} strokeWidth={1.5} style={{ color: isSelected ? '#a855f7' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                      : <Monitor size={16} strokeWidth={1.5} style={{ color: isSelected ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{host.name}</span>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: hostStatusColors[host.status] }} />
                        {!host.managed && host.tunnelStatus !== 'connected' && (
                          <span style={{ fontSize: 10, color: tunnelStatusColors[host.tunnelStatus!], display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <TunnelIcon size={10} strokeWidth={1.5} /> {host.tunnelStatus}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {host.managed
                          ? [host.region, host.activeSandboxCount !== undefined ? `${host.activeSandboxCount} active` : null].filter(Boolean).join(' · ')
                          : [host.os, host.arch, ...(host.capabilities || [])].filter(Boolean).join(' · ')
                        }
                      </div>
                    </div>
                    {isSelected && (
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--color-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' }} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Step 3: Mode-specific config */}
        <div style={{ marginBottom: 24 }}>
          {selectedMode === 'worktrees' && (
            <div>
              <FieldLabel>Worktree path</FieldLabel>
              <PathInput value={worktreePath} onChange={setWorktreePath} placeholder=".stoneforge/worktrees" icon={<FolderOpen size={13} />} />
            </div>
          )}
          {selectedMode === 'docker' && (
            <div>
              <FieldLabel>Docker image</FieldLabel>
              <PathInput value={dockerImage} onChange={setDockerImage} placeholder="ghcr.io/stoneforge/worker:latest" icon={<Container size={13} />} />
            </div>
          )}
          {selectedMode === 'sandbox' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <FieldLabel>Sandbox tier</FieldLabel>
                <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>
                  Resource allocation for each sandbox instance.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {(['small', 'medium', 'large', 'gpu'] as SandboxTier[]).map(tier => {
                    const selected = sandboxTier === tier
                    return (
                      <button
                        key={tier}
                        onClick={() => setSandboxTier(tier)}
                        style={{
                          padding: '8px 10px', textAlign: 'left',
                          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          background: selected ? 'rgba(168, 85, 247, 0.08)' : 'var(--color-surface)',
                          border: `1px solid ${selected ? '#a855f7' : 'var(--color-border)'}`,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 500, color: selected ? '#a855f7' : 'var(--color-text)' }}>
                          {tier.charAt(0).toUpperCase() + tier.slice(1)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                          {sandboxTierLabels[tier]}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <FieldLabel>Base image (optional)</FieldLabel>
                <PathInput value={sandboxBaseImage} onChange={setSandboxBaseImage} placeholder="Default sandbox image" icon={<Cloud size={13} />} />
              </div>
            </div>
          )}
        </div>

        {/* Set as default */}
        <div style={{ marginBottom: 24 }}>
          <Checkbox
            checked={isDefault}
            onChange={setIsDefault}
            label="Set as workspace default runtime — new agents will use this runtime by default"
          />
        </div>
      </div>

      {/* Responsive */}
      <style>{`
        @media (max-width: 768px) {
          .rt-create-mode-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function ModeCard({ icon, name, description, selected, accentColor, accentBg, onClick }: {
  icon: React.ReactNode; name: string; description: string
  selected: boolean; accentColor: string; accentBg: string; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, padding: 18, borderRadius: 'var(--radius-md)', cursor: 'pointer',
        textAlign: 'left', transition: 'all var(--duration-normal) ease',
        display: 'flex', flexDirection: 'column',
        background: selected ? accentBg : hovered ? 'var(--color-surface-hover)' : 'var(--color-surface)',
        border: `1.5px solid ${selected ? accentColor : 'var(--color-border)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: selected ? accentColor : 'var(--color-text-secondary)' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{name}</span>
        {selected && (
          <span style={{
            fontSize: 11, fontWeight: 500, color: accentColor,
            background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
            padding: '1px 8px', borderRadius: 'var(--radius-full)',
          }}>selected</span>
        )}
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', margin: 0 }}>
        {description}
      </p>
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
      {children}
    </label>
  )
}

function PathInput({ value, onChange, placeholder, icon }: {
  value: string; onChange: (v: string) => void; placeholder: string; icon: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, display: 'flex' }}>{icon}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          border: 'none', background: 'none', outline: 'none', width: '100%',
          color: 'var(--color-text)', fontSize: 12,
          fontFamily: 'var(--font-mono)',
        }}
      />
    </div>
  )
}

function Checkbox({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer',
        padding: '4px 0',
      }}
    >
      <span style={{
        color: checked ? 'var(--color-primary)' : hovered ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
        flexShrink: 0, display: 'flex', marginTop: 0,
        transition: 'color var(--duration-fast) ease',
      }}>
        {checked ? <CheckSquare size={15} /> : <Square size={15} />}
      </span>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
        {label}
      </span>
    </div>
  )
}
