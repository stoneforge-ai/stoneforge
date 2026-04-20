import { Zap, Eye, ShieldCheck, Bot, Check } from 'lucide-react'
import {
  WORKFLOW_PRESETS, AGENT_PROVIDERS, MODELS_BY_PROVIDER, EFFORT_LEVELS,
  type OnboardingState,
} from './onboarding-types'

interface Props {
  state: OnboardingState
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
  'auto': <Zap size={14} />,
  'review': <Eye size={14} />,
  'approve': <ShieldCheck size={14} />,
}

const SYNC_LABELS: Record<string, string> = {
  'none': 'None',
  'linear': 'Linear',
  'github': 'GitHub',
  'repo-folder': 'Repo Folder',
  'notion': 'Notion',
  'obsidian': 'Obsidian',
  'slack': 'Slack',
  'discord': 'Discord',
  'telegram': 'Telegram',
}

const MODE_LABELS: Record<string, string> = {
  'worktrees': 'Local Worktrees',
  'docker': 'Docker Container',
  'sandbox': 'Cloud Sandbox',
}

export function SummaryStep({ state }: Props) {
  const preset = WORKFLOW_PRESETS.find(p => p.id === state.workflowPreset)
  const providerName = AGENT_PROVIDERS.find(p => p.id === state.agentProvider)?.name || ''

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
        Review Configuration
      </h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 24 }}>
        Review your workspace settings before launching. You can change these later in Settings.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Workspace */}
        <SummarySection title="Workspace">
          <SummaryRow label="Workspace Preset" value={
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--color-primary)' }}>{PRESET_ICONS[state.workflowPreset]}</span>
              {preset?.name}
            </span>
          } />
          <SummaryRow label="Agent Provider" value={providerName} />
          <SummaryRow label="Default Branch" value={
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{state.defaultBranch}</code>
          } />
        </SummarySection>

        {/* Runtime */}
        <SummarySection title="Runtime">
          <SummaryRow label="Mode" value={MODE_LABELS[state.runtimeMode] || state.runtimeMode} />
          {state.runtimeMode === 'worktrees' && (
            <SummaryRow label="Worktree Path" value={
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{state.worktreePath}</code>
            } />
          )}
          {state.runtimeMode === 'docker' && (
            <SummaryRow label="Docker Image" value={
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{state.dockerImage}</code>
            } />
          )}
          {state.runtimeMode === 'sandbox' && (
            <SummaryRow label="Sandbox" value="Cloud sandbox (auto-provisioned)" />
          )}
        </SummarySection>

        {/* Agents */}
        <SummarySection title="Agents">
          {state.agents.map((agent, i) => {
            const models = MODELS_BY_PROVIDER[agent.provider]
            const modelName = models.find(m => m.id === agent.model)?.name || agent.model
            const effortName = EFFORT_LEVELS.find(e => e.id === agent.effort)?.name || agent.effort
            const agentProviderName = AGENT_PROVIDERS.find(p => p.id === agent.provider)?.name || agent.provider

            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 0',
                borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)' }}>
                  <span style={{ color: 'var(--color-primary)', display: 'flex' }}><Bot size={12} /></span>
                  {agent.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Pill>{agentProviderName}</Pill>
                  <Pill>{modelName}</Pill>
                  <Pill>{effortName}</Pill>
                </span>
              </div>
            )
          })}
        </SummarySection>

        {/* Integrations */}
        <SummarySection title="Integrations">
          <SummaryRow label="Issue Sync" value={SYNC_LABELS[state.issueSync]}
            check={state.issueSync !== 'none'} />
          <SummaryRow label="MR Sync" value={SYNC_LABELS[state.mrSync]}
            check={state.mrSync !== 'none'} />
          <SummaryRow label="Doc Sync" value={
            state.docSync === 'repo-folder' || state.docSync === 'obsidian'
              ? <span>{SYNC_LABELS[state.docSync]} <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>({state.docPath})</code></span>
              : SYNC_LABELS[state.docSync]
          } check={state.docSync !== 'none'} />
          <SummaryRow label="Notifications" value={SYNC_LABELS[state.notificationEndpoint]}
            check={state.notificationEndpoint !== 'none'} />
        </SummarySection>
      </div>
    </div>
  )
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--color-text-tertiary)',
        background: 'var(--color-surface)',
      }}>
        {title}
      </div>
      <div style={{ padding: '4px 14px 8px', background: 'var(--color-bg-elevated)' }}>
        {children}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, check }: {
  label: string; value: React.ReactNode; check?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0', fontSize: 13,
    }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
        {check && <Check size={13} style={{ color: 'var(--color-success)' }} />}
        {value}
      </span>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 'var(--radius-sm)',
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      fontSize: 11, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
