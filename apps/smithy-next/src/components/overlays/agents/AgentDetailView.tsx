import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowLeft, Bot, Play, Square, MoreHorizontal, Cpu, GitBranch, Container, Box } from 'lucide-react'
import type { AgentExtended } from './agent-types'
import { mockSessions } from '../../../mock-data'
import { mockRuntimes } from '../runtimes/runtime-mock-data'
import type { RuntimeMode } from '../runtimes/runtime-types'
import { runtimeModeColors } from '../runtimes/runtime-types'

const runtimeModeIcon: Record<RuntimeMode, typeof GitBranch> = {
  worktrees: GitBranch, docker: Container, sandbox: Box,
}

import { AgentOverviewTab } from './AgentOverviewTab'
import { AgentSessionsTab } from './AgentSessionsTab'
import { AgentTasksTab } from './AgentTasksTab'
import { AgentSettingsTab } from './AgentSettingsTab'

export type AgentDetailTab = 'overview' | 'sessions' | 'tasks' | 'settings'

interface AgentDetailViewProps {
  agent: AgentExtended
  onBack: () => void
  initialTab?: AgentDetailTab
  onTabChange?: (tab: AgentDetailTab) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onDuplicateAgent?: (agent: AgentExtended) => void
  onCreateSession?: (agentId: string) => void
  onNavigateToRuntimes?: (runtimeId?: string | null) => void
  onToggleEnabled?: () => void
}

const statusColor: Record<string, string> = {
  running: 'var(--color-success)', idle: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)', starting: 'var(--color-warning)',
}

export function AgentDetailView({ agent, onBack, initialTab, onTabChange, onNavigateToTask, onNavigateToSession, onDuplicateAgent, onCreateSession, onNavigateToRuntimes, onToggleEnabled }: AgentDetailViewProps) {
  const [activeTab, setActiveTab] = useState<AgentDetailTab>(initialTab || 'overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleTabChange = (tab: AgentDetailTab) => {
    setActiveTab(tab)
    onTabChange?.(tab)
  }

  const agentSessions = useMemo(() => {
    return mockSessions.filter(s => s.agent.name === agent.name || s.agent.id === agent.id)
  }, [agent.name, agent.id])

  const totalTasks = agent.sessions.reduce((sum, s) => {
    const unique = new Set(s.tasks.map(t => t.id))
    return sum + unique.size
  }, 0)

  const agentRuntime = mockRuntimes.find(r => r.id === agent.runtimeId)
  const RuntimeIcon = agentRuntime ? runtimeModeIcon[agentRuntime.mode] : GitBranch

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px 0', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        {/* Top row: back + name + status + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={onBack} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0,
          }}>
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
          <Bot size={15} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.name}
          </h1>

          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[agent.status] || 'var(--color-text-tertiary)' }} />
            <span style={{ fontSize: 11, color: statusColor[agent.status] || 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'capitalize' }}>
              {agent.status}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {/* Enable/disable toggle */}
            {onToggleEnabled && (
              <button
                onClick={onToggleEnabled}
                title={agent.enabled ? 'Disable agent' : 'Enable agent'}
                style={{
                  width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: agent.enabled ? 'var(--color-success)' : 'var(--color-surface-active)',
                  position: 'relative', transition: 'background var(--duration-fast)',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: agent.enabled ? 16 : 2,
                  width: 14, height: 14, borderRadius: '50%',
                  background: 'white', transition: 'left var(--duration-fast)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }} />
              </button>
            )}
            {onCreateSession && (
              <button onClick={() => onCreateSession(agent.id)} style={{
                height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <Play size={11} strokeWidth={2} /> New Session
              </button>
            )}
            {agent.status === 'running' ? (
              <button style={{
                height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-danger)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <Square size={11} strokeWidth={1.5} /> Stop
              </button>
            ) : (
              <button style={{
                height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
                color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <Play size={11} strokeWidth={2} /> Start
              </button>
            )}

            {/* More menu */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-tertiary)', cursor: 'pointer',
                }}
              >
                <MoreHorizontal size={13} strokeWidth={1.5} />
              </button>
              {menuOpen && (
                <div ref={menuRef} style={{
                  position: 'absolute', top: 32, right: 0, zIndex: 1060,
                  width: 160, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)', padding: 4,
                }}>
                  <MenuItem label="Duplicate Agent" onClick={() => { setMenuOpen(false); onDuplicateAgent?.(agent) }} />
                  <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />
                  <MenuItem label="Delete" danger onClick={() => setMenuOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {agent.tags.length > 0 && agent.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface-active)', color: 'var(--color-text-secondary)' }}>
              {tag}
            </span>
          ))}
          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Cpu size={10} strokeWidth={1.5} /> {agent.model}
          </span>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', gap: 4, background: agentRuntime ? runtimeModeColors[agentRuntime.mode].bg : 'var(--color-surface)', color: agentRuntime ? runtimeModeColors[agentRuntime.mode].text : 'var(--color-text-tertiary)' }}>
            <RuntimeIcon size={10} strokeWidth={1.5} /> {agentRuntime?.name || agent.environment}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {([
            { key: 'overview' as const, label: 'Overview' },
            { key: 'sessions' as const, label: `Sessions (${agentSessions.length})` },
            { key: 'tasks' as const, label: `Tasks (${totalTasks})` },
            { key: 'settings' as const, label: 'Settings' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              style={{
                padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: 'transparent',
                color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'overview' && (
          <AgentOverviewTab agent={agent} onNavigateToTask={onNavigateToTask} onNavigateToSession={onNavigateToSession} />
        )}
        {activeTab === 'sessions' && (
          <AgentSessionsTab agent={agent} onNavigateToTask={onNavigateToTask} onNavigateToSession={onNavigateToSession} />
        )}
        {activeTab === 'tasks' && (
          <AgentTasksTab agent={agent} onNavigateToTask={onNavigateToTask} />
        )}
        {activeTab === 'settings' && (
          <AgentSettingsTab agent={agent} onNavigateToRuntimes={onNavigateToRuntimes} />
        )}
      </div>
    </div>
  )
}

function MenuItem({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontSize: 12, textAlign: 'left',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {label}
    </button>
  )
}
