import { useState, useRef } from 'react'
import { GitBranch, Container, Box, ChevronDown, X, Check, Plus, ExternalLink } from 'lucide-react'
import type { AgentExtended } from './agent-types'
import { mockRuntimes } from '../runtimes/runtime-mock-data'
import { runtimeStatusColors } from '../runtimes/runtime-types'

const runtimeModeLabels: Record<string, string> = {
  worktrees: 'Worktrees',
  docker: 'Docker',
  sandbox: 'Sandbox',
  // Legacy fallbacks for old mock data
  local: 'Worktrees',
  'local-docker': 'Docker',
  'remote-ssh': 'Sandbox',
}

const runtimeModeIcon = (mode: string) => {
  if (mode === 'worktrees' || mode === 'local') return GitBranch
  if (mode === 'docker' || mode === 'local-docker') return Container
  return Box
}

interface AgentSettingsTabProps {
  agent: AgentExtended
  onNavigateToRuntimes?: (runtimeId?: string | null) => void
}

export function AgentSettingsTab({ agent, onNavigateToRuntimes }: AgentSettingsTabProps) {
  const [name, setName] = useState(agent.name)
  const [tags, setTags] = useState<string[]>(agent.tags || [])
  const [tagInput, setTagInput] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)
  const [provider, setProvider] = useState(agent.provider)
  const [model, setModel] = useState(agent.model)
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(agent.maxConcurrentTasks ?? 1)
  const [spawnPriority, setSpawnPriority] = useState(agent.spawnPriority ?? 5)
  const [executablePath, setExecutablePath] = useState(agent.config?.executablePath || '')

  // Runtime selection
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string>(agent.runtimeId || mockRuntimes.find(r => r.isDefault)?.id || mockRuntimes[0]?.id || '')
  const [runtimeDropdownOpen, setRuntimeDropdownOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Row 1: Name + Tags */}
      <div className="settings-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <SettingsSection title="Name">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </SettingsSection>
        <SettingsSection title="Tags">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {tags.map(tag => (
              <span key={tag} style={{ fontSize: 11, padding: '3px 6px 3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {tag}
                <X size={10} strokeWidth={2} style={{ cursor: 'pointer', color: 'var(--color-text-tertiary)' }} onClick={() => setTags(prev => prev.filter(t => t !== tag))} />
              </span>
            ))}
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={e => {
                const val = e.target.value
                if (val.includes(',')) {
                  const parts = val.split(',').map(s => s.trim()).filter(s => s && !tags.includes(s))
                  if (parts.length) setTags(prev => [...prev, ...parts])
                  setTagInput('')
                } else { setTagInput(val) }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && tagInput.trim()) { const t = tagInput.trim(); if (!tags.includes(t)) setTags(prev => [...prev, t]); setTagInput(''); e.preventDefault() }
                if (e.key === 'Backspace' && !tagInput && tags.length > 0) setTags(prev => prev.slice(0, -1))
              }}
              placeholder={tags.length === 0 ? 'Add tags (comma-separated)...' : 'Add tag...'}
              style={{ flex: 1, minWidth: 100, height: 26, padding: '0 6px', fontSize: 11, background: 'transparent', border: 'none', outline: 'none', color: 'var(--color-text)', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ marginTop: -1, height: 1, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
        </SettingsSection>
      </div>

      {/* Row 2: Provider/Model + Runtime */}
      <div className="settings-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <SettingsSection title="Provider & Model">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SettingsField label="Provider">
              <select value={provider} onChange={e => { setProvider(e.target.value); const defaults: Record<string, string> = { 'claude-code': 'opus-4.6-1m', 'codex': 'gpt-5.4', 'opencode': 'gpt-5.4' }; setModel(defaults[e.target.value] || 'opus-4.6-1m') }} style={selectStyle}>
                <option value="claude-code">Claude Code</option>
                <option value="codex">OpenAI Codex</option>
                <option value="opencode">OpenCode</option>
              </select>
            </SettingsField>
            <SettingsField label="Model">
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
            </SettingsField>
          </div>
        </SettingsSection>
        <SettingsSection title="Runtime">
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 10px' }}>
            Select the runtime environment this agent will use.
          </p>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setRuntimeDropdownOpen(!runtimeDropdownOpen)}
              style={{
                width: '100%', height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {(() => {
                const rt = mockRuntimes.find(r => r.id === selectedRuntimeId)
                if (!rt) return <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Select a runtime...</span>
                const TypeIcon = runtimeModeIcon(rt.mode)
                return (
                  <>
                    <TypeIcon size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rt.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-bg-elevated)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>{runtimeModeLabels[rt.mode] || rt.mode}</span>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: runtimeStatusColors[rt.status], flexShrink: 0 }} />
                  </>
                )
              })()}
              <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            </button>

            {runtimeDropdownOpen && (
              <>
                <div onClick={() => setRuntimeDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />
                <div style={{
                  position: 'absolute', top: 38, left: 0, right: 0, zIndex: 1060,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4,
                  maxHeight: 240, overflow: 'auto',
                }}>
                  {mockRuntimes.map(rt => {
                    const TypeIcon = runtimeModeIcon(rt.mode)
                    const isSelected = rt.id === selectedRuntimeId
                    return (
                      <button
                        key={rt.id}
                        onClick={() => { setSelectedRuntimeId(rt.id); setRuntimeDropdownOpen(false) }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                          background: isSelected ? 'var(--color-surface-active)' : 'transparent',
                          border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                      >
                        <TypeIcon size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: isSelected ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: isSelected ? 500 : 400, flex: 1 }}>{rt.name}</span>
                        {rt.isDefault && (
                          <span style={{ fontSize: 9, color: 'var(--color-text-accent)', background: 'var(--color-primary-subtle)', padding: '0 4px', borderRadius: 'var(--radius-full)' }}>default</span>
                        )}
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: runtimeStatusColors[rt.status], flexShrink: 0 }} />
                        {isSelected && <Check size={12} strokeWidth={2} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
                      </button>
                    )
                  })}

                  {/* Separator + create new */}
                  <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
                  <button
                    onClick={() => { setRuntimeDropdownOpen(false); onNavigateToRuntimes?.() }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                      background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', textAlign: 'left', color: 'var(--color-text-accent)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Plus size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Create new runtime</span>
                  </button>

                  {/* Manage runtimes link */}
                  <button
                    onClick={() => { setRuntimeDropdownOpen(false); onNavigateToRuntimes?.() }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', textAlign: 'left', color: 'var(--color-text-tertiary)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <ExternalLink size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 11 }}>Manage runtimes</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </SettingsSection>
      </div>

      {/* Row 3: Concurrency + Priority (left) | Executable Path (right) */}
      <div className="settings-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <SettingsSection title="Max Concurrent Tasks / Spawn Priority">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SettingsField label="Max Concurrent Tasks">
              <input type="number" min={1} max={10} value={maxConcurrentTasks} onChange={e => setMaxConcurrentTasks(parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: '100%' }} />
            </SettingsField>
            <SettingsField label="Spawn Priority">
              <input type="number" min={0} max={100} value={spawnPriority} onChange={e => setSpawnPriority(parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '100%' }} />
            </SettingsField>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '6px 0 0' }}>Max sessions this agent can run simultaneously. Priority controls dispatch preference (higher = preferred).</p>
        </SettingsSection>
        <SettingsSection title="Executable Path">
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 6px', lineHeight: 1.4 }}>
            Override the default CLI path for non-standard installs or{' '}
            <a href="https://docs.stoneforge.ai/guides/multi-provider/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-accent)', textDecoration: 'none' }}>multi-provider mode</a>.
          </p>
          <input value={executablePath} onChange={e => setExecutablePath(e.target.value)} placeholder="e.g., claude, /usr/local/bin/claude" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
        </SettingsSection>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .settings-row-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none', width: '100%',
}

const selectStyle: React.CSSProperties = {
  height: 32, padding: '0 8px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none', width: '100%',
  cursor: 'pointer',
}
