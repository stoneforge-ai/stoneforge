import { useState } from 'react'
import {
  ArrowLeft, Pencil, Trash2,
  GitBranch, Container, Cloud, Bot, X, Monitor,
  Wifi, WifiOff, Plus, Terminal, Copy, Check, ChevronDown,
} from 'lucide-react'
import type { Runtime, RuntimeMode, Host, SandboxTier } from './agent-types'
import {
  hostStatusColors, tunnelStatusColors, runtimeModeLabels, runtimeModeColors,
  sandboxTierLabels, runtimeStatusColors,
} from '../runtimes/runtime-types'

interface RuntimeDetailViewProps {
  runtime: Runtime
  hosts: Host[]
  isNew?: boolean
  onBack: () => void
  onSave?: (updated: Runtime) => void
  onDelete?: (id: string) => void
}

const modeIcons: Record<RuntimeMode, typeof GitBranch> = {
  worktrees: GitBranch,
  docker: Container,
  sandbox: Cloud,
}

const modeCardConfig: { mode: RuntimeMode; icon: typeof GitBranch; label: string; description: string }[] = [
  { mode: 'worktrees', icon: GitBranch, label: 'Worktree', description: 'Git worktrees on the host filesystem' },
  { mode: 'docker', icon: Container, label: 'Docker', description: 'Docker containers on the host' },
  { mode: 'sandbox', icon: Cloud, label: 'Sandbox', description: 'Ephemeral cloud environments, provisioned on demand' },
]

const inputStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none', width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
}

const codeBlockStyle: React.CSSProperties = {
  padding: '8px 12px', background: 'var(--color-surface)',
  borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)',
  fontSize: 12, color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border-subtle)', wordBreak: 'break-all',
}

export function RuntimeDetailView({ runtime, hosts, isNew, onBack, onSave, onDelete }: RuntimeDetailViewProps) {
  const [editing, setEditing] = useState(!!isNew)
  const [draft, setDraft] = useState<Runtime>({ ...runtime })

  const handleStartEdit = () => {
    setDraft({ ...runtime })
    setEditing(true)
  }

  const handleCancel = () => {
    if (isNew) {
      onBack()
    } else {
      setEditing(false)
    }
  }

  const handleSave = () => {
    onSave?.(draft)
    setEditing(false)
  }

  const updateDraft = (partial: Partial<Runtime>) => {
    setDraft(prev => ({ ...prev, ...partial }))
  }

  if (editing) {
    return <EditMode draft={draft} hosts={hosts} updateDraft={updateDraft} onCancel={handleCancel} onSave={handleSave} isNew={!!isNew} />
  }

  return <ViewMode runtime={runtime} hosts={hosts} onBack={onBack} onEdit={handleStartEdit} onDelete={onDelete} />
}

// ── View Mode ──

function ViewMode({ runtime: rt, hosts, onBack, onEdit, onDelete }: {
  runtime: Runtime; hosts: Host[]; onBack: () => void; onEdit: () => void; onDelete?: (id: string) => void
}) {
  const dotColor = runtimeStatusColors[rt.status] || 'var(--color-text-tertiary)'
  const statusLabel = rt.status.charAt(0).toUpperCase() + rt.status.slice(1)
  const ModeIcon = modeIcons[rt.mode] || GitBranch
  const host = hosts.find(h => h.id === rt.hostId)
  const modeColor = runtimeModeColors[rt.mode]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <button onClick={onBack} style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-sm)',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>

        <ModeIcon size={16} strokeWidth={1.5} style={{ color: modeColor.text }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{rt.name}</span>

        <span style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12, fontWeight: 500, color: dotColor,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
          {statusLabel}
        </span>

        <span style={{
          fontSize: 10, fontWeight: 500, padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          background: modeColor.bg, color: modeColor.text,
        }}>
          {runtimeModeLabels[rt.mode]}
        </span>

        <div style={{ flex: 1 }} />

        <button onClick={onEdit} style={{
          height: 26, fontSize: 12, padding: '0 10px',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--color-text-secondary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Pencil size={12} strokeWidth={1.5} /> Edit
        </button>

        <button onClick={() => onDelete?.(rt.id)} style={{
          height: 26, fontSize: 12, padding: '0 10px',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--color-danger)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Trash2 size={12} strokeWidth={1.5} /> Delete
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Host */}
        {host && (
          <div>
            <div style={labelStyle}>Host</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-subtle)',
            }}>
              {host.managed
                ? <Cloud size={16} strokeWidth={1.5} style={{ color: '#a855f7', flexShrink: 0 }} />
                : <Monitor size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              }
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{host.name}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: hostStatusColors[host.status] }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {host.managed
                    ? [host.region, host.activeSandboxCount !== undefined ? `${host.activeSandboxCount} active` : null].filter(Boolean).join(' · ')
                    : [host.os, host.arch].filter(Boolean).join(' · ')
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mode-specific config */}
        <div>
          <div style={labelStyle}>
            {rt.mode === 'worktrees' ? 'Worktree Path'
              : rt.mode === 'docker' ? 'Docker Image'
              : 'Sandbox Configuration'}
          </div>
          {rt.mode === 'sandbox' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rt.sandboxTier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 40 }}>Tier</span>
                  <span style={{
                    fontSize: 12, fontWeight: 500, padding: '3px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(168, 85, 247, 0.08)', color: '#a855f7',
                  }}>
                    {sandboxTierLabels[rt.sandboxTier] || rt.sandboxTier}
                  </span>
                </div>
              )}
              {rt.sandboxBaseImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 40 }}>Image</span>
                  <span style={codeBlockStyle}>{rt.sandboxBaseImage}</span>
                </div>
              )}
              {!rt.sandboxTier && !rt.sandboxBaseImage && (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Default configuration</div>
              )}
            </div>
          ) : (
            <div style={codeBlockStyle}>
              {rt.mode === 'worktrees' ? (rt.worktreePath || '—') : (rt.dockerImage || '—')}
            </div>
          )}
        </div>

        {/* Status grid */}
        <div>
          <div style={labelStyle}>Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <StatusItem label="Assigned Agents">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bot size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{rt.assignedAgentCount}</span>
              </div>
            </StatusItem>
            <StatusItem label="Last Health Check">
              <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{rt.lastHealthCheck || '—'}</span>
            </StatusItem>
          </div>
        </div>

        {/* Error/status message */}
        {rt.statusMessage && (
          <div style={{
            padding: 10, borderRadius: 'var(--radius-sm)',
            background: rt.status === 'error' ? 'color-mix(in srgb, var(--color-danger) 8%, transparent)' : 'rgba(124,58,237,0.05)',
            border: `1px solid ${rt.status === 'error' ? 'color-mix(in srgb, var(--color-danger) 20%, transparent)' : 'rgba(124,58,237,0.15)'}`,
            fontSize: 12, color: rt.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          }}>
            {rt.statusMessage}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

// ── Edit Mode (mode-first flow) ──

const providerOptions: { id: string; name: string; description: string }[] = [
  { id: 'stoneforge', name: 'Stoneforge Cloud', description: 'Managed sandbox and Docker environments' },
  { id: 'e2b', name: 'E2B', description: 'Code interpreter sandboxes' },
  { id: 'modal', name: 'Modal', description: 'Serverless GPU and CPU compute' },
  { id: 'fly', name: 'Fly.io', description: 'Global edge containers' },
  { id: 'daytona', name: 'Daytona', description: 'Standardized dev environments' },
]

function EditMode({ draft, hosts, updateDraft, onCancel, onSave, isNew }: {
  draft: Runtime; hosts: Host[]
  updateDraft: (partial: Partial<Runtime>) => void
  onCancel: () => void; onSave: () => void; isNew: boolean
}) {
  const [showAddHost, setShowAddHost] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [addProviderSelected, setAddProviderSelected] = useState('')
  const [addProviderRegion, setAddProviderRegion] = useState('us-east-1')
  const [addProviderKey, setAddProviderKey] = useState('')

  // Filter hosts based on selected mode
  const hostsForMode = hosts.filter(h => {
    if (draft.mode === 'worktrees') return !h.managed  // worktrees only on user-managed hosts
    if (draft.mode === 'docker') return h.capabilities.includes('docker')
    if (draft.mode === 'sandbox') return h.capabilities.includes('sandbox')
    return true
  })

  // Auto-select first valid host when mode changes
  const selectedHost = hosts.find(h => h.id === draft.hostId)
  const hostValidForMode = selectedHost && hostsForMode.some(h => h.id === selectedHost.id)


  const handleModeChange = (mode: RuntimeMode) => {
    setShowAddHost(false)
    setAddProviderSelected('')
    const filtered = hosts.filter(h => {
      if (mode === 'worktrees') return !h.managed
      if (mode === 'docker') return h.capabilities.includes('docker')
      if (mode === 'sandbox') return h.capabilities.includes('sandbox')
      return true
    })
    const firstHost = filtered[0]
    updateDraft({
      mode,
      hostId: firstHost?.id || '',
      // Reset mode-specific fields
      worktreePath: mode === 'worktrees' ? (draft.worktreePath || '.stoneforge/worktrees') : undefined,
      dockerImage: mode === 'docker' ? (draft.dockerImage || 'ghcr.io/stoneforge/worker:latest') : undefined,
      sandboxTier: mode === 'sandbox' ? ('medium' as SandboxTier) : undefined,
      sandboxBaseImage: undefined,
    })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button onClick={onCancel} style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-sm)', flexShrink: 0,
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
          {isNew ? (draft.name || 'New Runtime') : (draft.name || 'Edit Runtime')}
        </span>
        <button onClick={onCancel} style={{
          height: 26, fontSize: 12, padding: '0 10px',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--color-text-secondary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <X size={12} strokeWidth={1.5} /> Cancel
        </button>
        <button onClick={onSave} disabled={!draft.name.trim() || !hostValidForMode} style={{
          height: 26, fontSize: 12, fontWeight: 500, padding: '0 12px',
          background: (draft.name.trim() && hostValidForMode) ? 'var(--color-primary)' : 'var(--color-surface)',
          color: (draft.name.trim() && hostValidForMode) ? 'white' : 'var(--color-text-tertiary)',
          borderRadius: 'var(--radius-sm)', border: 'none',
          cursor: (draft.name.trim() && hostValidForMode) ? 'pointer' : 'not-allowed',
          opacity: (draft.name.trim() && hostValidForMode) ? 1 : 0.6,
        }}>
          {isNew ? 'Create' : 'Save'}
        </button>
      </div>

      {/* Form */}
      <div style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Name */}
        <div>
          <div style={labelStyle}>Name</div>
          <input
            autoFocus
            value={draft.name}
            onChange={e => updateDraft({ name: e.target.value })}
            placeholder="e.g. adam-macbook, cloud-sandbox"
            style={inputStyle}
          />
        </div>

        {/* Step 1: Mode selector */}
        <div>
          <div style={labelStyle}>Execution Mode</div>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>
            Choose how agents run in this runtime.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {modeCardConfig.map(card => {
              const Icon = card.icon
              const selected = draft.mode === card.mode
              const color = runtimeModeColors[card.mode]
              return (
                <button
                  key={card.mode}
                  onClick={() => { if (isNew || draft.mode === card.mode) handleModeChange(card.mode); else if (!isNew) handleModeChange(card.mode) }}
                  style={{
                    padding: 12,
                    border: `1.5px solid ${selected ? color.text : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    background: selected ? color.bg : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Icon size={20} strokeWidth={1.5} style={{
                      color: selected ? color.text : 'var(--color-text-tertiary)',
                    }} />
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 500, marginTop: 6,
                    color: selected ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {card.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 2: Host selector (filtered by mode) */}
        <div>
          <div style={labelStyle}>Host</div>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>
            {draft.mode === 'sandbox'
              ? 'Select the cloud provider for this sandbox.'
              : draft.mode === 'docker'
                ? 'Select the machine or cloud provider to run Docker containers.'
                : 'Select the machine to run worktrees on.'}
            {!isNew && <span style={{ fontStyle: 'italic' }}> Host cannot be changed after creation.</span>}
          </p>

          {/* Host cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hostsForMode.map(host => {
              const isSelected = host.id === draft.hostId
              const TunnelIcon = host.tunnelStatus === 'connected' ? Wifi : WifiOff
              return (
                <button
                  key={host.id}
                  onClick={() => { if (isNew) updateDraft({ hostId: host.id }) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)', textAlign: 'left',
                    cursor: isNew ? 'pointer' : 'default',
                    background: isSelected ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                    border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    opacity: !isNew && !isSelected ? 0.5 : 1,
                  }}
                >
                  {host.managed
                    ? <Cloud size={16} strokeWidth={1.5} style={{ color: isSelected ? '#a855f7' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    : <Monitor size={16} strokeWidth={1.5} style={{ color: isSelected ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{host.name}</span>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: hostStatusColors[host.status] }} />
                      {!host.managed && host.tunnelStatus !== 'connected' && (
                        <span style={{ fontSize: 10, color: tunnelStatusColors[host.tunnelStatus!], display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <TunnelIcon size={10} strokeWidth={1.5} /> {host.tunnelStatus}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {host.managed
                        ? [host.region, host.activeSandboxCount !== undefined ? `${host.activeSandboxCount} active sandboxes` : null].filter(Boolean).join(' · ')
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

            {/* Add host / Connect provider action */}
            {isNew && (
              <>
                <button
                  onClick={() => setShowAddHost(!showAddHost)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)', textAlign: 'left', cursor: 'pointer',
                    background: 'transparent', border: '1px dashed var(--color-border)',
                    color: 'var(--color-text-accent)', fontSize: 12, fontWeight: 500,
                  }}
                >
                  <Plus size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {draft.mode === 'worktrees' ? 'Register a host' :
                    draft.mode === 'sandbox' ? 'Connect a provider' :
                      'Register a host or connect a provider'}
                  <div style={{ flex: 1 }} />
                  <ChevronDown size={12} strokeWidth={1.5} style={{ transform: showAddHost ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>

                {/* Expandable add panel */}
                {showAddHost && (
                  <div style={{
                    padding: 14, borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
                    display: 'flex', flexDirection: 'column', gap: 14,
                  }}>
                    {/* Register a host (for worktrees/docker) */}
                    {(draft.mode === 'worktrees' || draft.mode === 'docker') && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <Terminal size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-secondary)' }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>Register a host</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 8px', lineHeight: 1.4 }}>
                          Run this command on the machine you want to connect. The host will appear here automatically.
                        </p>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)',
                          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)',
                        }}>
                          <code style={{ flex: 1, wordBreak: 'break-all' }}>stoneforge host connect --workspace ws-1</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText('stoneforge host connect --workspace ws-1'); setCopiedCommand(true); setTimeout(() => setCopiedCommand(false), 2000) }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                              color: copiedCommand ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                              display: 'flex', flexShrink: 0,
                            }}
                          >
                            {copiedCommand ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Divider between host and provider (docker mode shows both) */}
                    {draft.mode === 'docker' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>or</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
                      </div>
                    )}

                    {/* Connect a cloud provider (for sandbox/docker) */}
                    {(draft.mode === 'sandbox' || draft.mode === 'docker') && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <Cloud size={13} strokeWidth={1.5} style={{ color: '#a855f7' }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>Connect a provider</span>
                        </div>

                        {/* Provider picker */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                          {providerOptions.map(p => {
                            const selected = addProviderSelected === p.id
                            return (
                              <button
                                key={p.id}
                                onClick={() => setAddProviderSelected(selected ? '' : p.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                  borderRadius: 'var(--radius-sm)', textAlign: 'left', cursor: 'pointer',
                                  background: selected ? 'rgba(168, 85, 247, 0.06)' : 'var(--color-bg)',
                                  border: `1px solid ${selected ? '#a855f7' : 'var(--color-border-subtle)'}`,
                                }}
                              >
                                <Cloud size={13} strokeWidth={1.5} style={{ color: selected ? '#a855f7' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{p.name}</div>
                                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{p.description}</div>
                                </div>
                                {selected && (
                                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7' }} />
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        {/* Config fields (show when provider selected) */}
                        {addProviderSelected && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Region</div>
                              <input
                                value={addProviderRegion}
                                onChange={e => setAddProviderRegion(e.target.value)}
                                placeholder="us-east-1"
                                style={{ ...inputStyle, height: 28, fontSize: 11 }}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>API Key</div>
                              <input
                                type="password"
                                value={addProviderKey}
                                onChange={e => setAddProviderKey(e.target.value)}
                                placeholder="sk-..."
                                style={{ ...inputStyle, height: 28, fontSize: 11, fontFamily: 'var(--font-mono)' }}
                              />
                            </div>
                            <button
                              disabled={!addProviderKey.trim()}
                              style={{
                                height: 28, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                background: addProviderKey.trim() ? '#a855f7' : 'var(--color-surface)',
                                color: addProviderKey.trim() ? 'white' : 'var(--color-text-tertiary)',
                                border: 'none', borderRadius: 'var(--radius-sm)',
                                cursor: addProviderKey.trim() ? 'pointer' : 'not-allowed',
                                fontSize: 11, fontWeight: 500, alignSelf: 'flex-start',
                                opacity: addProviderKey.trim() ? 1 : 0.6,
                              }}
                            >
                              <Plus size={11} strokeWidth={2} /> Connect
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Step 3: Mode-specific config */}
        <div>
          {draft.mode === 'worktrees' && (
            <>
              <div style={labelStyle}>Worktree Path</div>
              <input
                value={draft.worktreePath || ''}
                onChange={e => updateDraft({ worktreePath: e.target.value })}
                placeholder=".stoneforge/worktrees"
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              />
            </>
          )}
          {draft.mode === 'docker' && (
            <>
              <div style={labelStyle}>Docker Image</div>
              <input
                value={draft.dockerImage || ''}
                onChange={e => updateDraft({ dockerImage: e.target.value })}
                placeholder="ghcr.io/stoneforge/worker:latest"
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              />
            </>
          )}
          {draft.mode === 'sandbox' && (
            <>
              <div style={labelStyle}>Sandbox Tier</div>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>
                Resource allocation for each sandbox instance.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {(['small', 'medium', 'large', 'gpu'] as SandboxTier[]).map(tier => {
                  const selected = draft.sandboxTier === tier
                  return (
                    <button
                      key={tier}
                      onClick={() => updateDraft({ sandboxTier: tier })}
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
              <div style={{ marginTop: 12 }}>
                <div style={labelStyle}>Base Image (optional)</div>
                <input
                  value={draft.sandboxBaseImage || ''}
                  onChange={e => updateDraft({ sandboxBaseImage: e.target.value })}
                  placeholder="Default sandbox image"
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
