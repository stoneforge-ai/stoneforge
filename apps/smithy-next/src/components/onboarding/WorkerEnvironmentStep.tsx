import { useState, type Dispatch } from 'react'
import { Laptop, Container, Cloud, FolderOpen } from 'lucide-react'
import type { OnboardingState, OnboardingAction, RuntimeMode } from './onboarding-types'

interface Props {
  state: OnboardingState
  dispatch: Dispatch<OnboardingAction>
}

export function WorkerEnvironmentStep({ state, dispatch }: Props) {
  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
        Default Runtime
      </h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
        Set up your workspace's default runtime. You can add more runtimes later.
      </p>

      {/* Runtime name */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
          Runtime name
        </label>
        <input
          value={state.runtimeName}
          onChange={e => dispatch({ type: 'SET_RUNTIME_NAME', name: e.target.value })}
          placeholder="e.g. adam-macbook, team-docker"
          style={{
            width: '100%', maxWidth: 320, height: 32, padding: '0 10px', fontSize: 12, fontFamily: 'inherit',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
          }}
        />
      </div>

      <div className="onboarding-cards" style={{ display: 'flex', gap: 12 }}>
        <EnvCard
          icon={<Laptop size={20} />}
          name="Local Worktrees"
          description="Agents run on your machine using local git worktrees. Best for fast iteration and offline development."
          selected={state.runtimeMode === 'worktrees'}
          onClick={() => dispatch({ type: 'SET_RUNTIME_MODE', mode: 'worktrees' })}
        >
          {state.runtimeMode === 'worktrees' && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
                Worktree path
              </label>
              <PathInput
                value={state.worktreePath}
                onChange={v => dispatch({ type: 'SET_WORKTREE_PATH', path: v })}
                placeholder=".stoneforge/worktrees"
                icon={<FolderOpen size={13} />}
              />
            </div>
          )}
        </EnvCard>

        <EnvCard
          icon={<Container size={20} />}
          name="Docker Container"
          description="Agents run in isolated Docker containers. Best for reproducible environments and dependency isolation."
          selected={state.runtimeMode === 'docker'}
          onClick={() => dispatch({ type: 'SET_RUNTIME_MODE', mode: 'docker' as RuntimeMode })}
        >
          {state.runtimeMode === 'docker' && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
                Docker image
              </label>
              <PathInput
                value={state.dockerImage}
                onChange={v => dispatch({ type: 'SET_DOCKER_IMAGE', image: v })}
                placeholder="ghcr.io/stoneforge/worker:latest"
                icon={<Container size={13} />}
              />
            </div>
          )}
        </EnvCard>

        <EnvCard
          icon={<Cloud size={20} />}
          name="Cloud Sandbox"
          description="Agents run in cloud-hosted sandboxed environments. Best for teams wanting managed infrastructure with zero local setup."
          selected={state.runtimeMode === 'sandbox'}
          onClick={() => dispatch({ type: 'SET_RUNTIME_MODE', mode: 'sandbox' as RuntimeMode })}
        >
          {state.runtimeMode === 'sandbox' && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5, margin: 0 }}>
                Cloud sandboxes are automatically provisioned. No additional configuration needed.
              </p>
            </div>
          )}
        </EnvCard>
      </div>
    </div>
  )
}

function EnvCard({ icon, name, description, selected, onClick, children }: {
  icon: React.ReactNode; name: string; description: string
  selected: boolean; onClick: () => void; children?: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, padding: '18px 18px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
        textAlign: 'left', transition: 'all var(--duration-normal) ease',
        display: 'flex', flexDirection: 'column',
        background: selected ? 'var(--color-primary-subtle)' : hovered ? 'var(--color-surface-hover)' : 'var(--color-surface)',
        border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{name}</span>
        {selected && (
          <span style={{
            fontSize: 11, fontWeight: 500, color: 'var(--color-success)',
            background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
            padding: '1px 8px', borderRadius: 'var(--radius-full)',
          }}>selected</span>
        )}
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', margin: 0 }}>
        {description}
      </p>
      {children}
    </button>
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
