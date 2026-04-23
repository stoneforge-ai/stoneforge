import { useState, useEffect } from 'react'
import type { AgentExtended, RoleDefinition, Runtime } from './agents/agent-types'
import type { AgentDetailTab } from './agents/AgentDetailView'
import { AgentListView } from './agents/AgentListView'
import { AgentDetailView } from './agents/AgentDetailView'
import { CreateAgentView } from './agents/CreateAgentView'
import { AgentSidebar } from './agents/AgentSidebar'
import { RoleDefinitionListView } from './agents/RoleDefinitionListView'
import { RoleDefinitionDetailView } from './agents/RoleDefinitionDetailView'
import { RuntimeListView } from './agents/RuntimeListView'
import { RuntimeDetailView as RuntimeDetailViewNew } from './agents/RuntimeDetailView'
import { mockAgentsExtended, mockRoleDefinitions, mockRuntimes, mockHosts } from './agents/agent-mock-data'
import { mockSessions } from '../../mock-data'
import { CreateSessionDialog } from './sessions/CreateSessionDialog'
import { SessionsOverlay } from './SessionsOverlay'

type AgentsView = 'list' | 'agent-detail' | 'create-agent'
type RolesView = 'list' | 'detail' | 'create'
type RuntimesView = 'list' | 'detail' | 'create'
type TopTab = 'agents' | 'sessions' | 'roles' | 'runtimes'

interface AgentsOverlayProps {
  onBack: () => void
  onNavigateToWhiteboard?: (directorId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToSession?: (sessionId: string) => void
  onNavigateToRuntimes?: (runtimeId?: string | null) => void
  onNavigateToMR?: (mrId: string) => void
  initialAgentId?: string | null
  initialPoolId?: string | null
  initialTab?: string | null
  initialCreate?: boolean
  initialSessionId?: string | null
  initialSessionEventId?: string | null
  onAgentChange?: (agentId: string | null, tab: string | null) => void
  onPoolChange?: (poolId: string | null) => void
  onCreateChange?: (creating: boolean) => void
  onSessionChange?: (sessionId: string | null, eventId: string | null) => void
  onCreateSession?: (config: { agentId: string; agentName: string; taskId?: string; initialMessage?: string }) => void
  tasks?: Array<{ id: string; title: string }>
}

export function AgentsOverlay({ onBack: _onBack, onNavigateToWhiteboard, onNavigateToTask, onNavigateToSession, onNavigateToRuntimes, onNavigateToMR, initialAgentId, initialTab, initialCreate, initialSessionId, initialSessionEventId, onAgentChange, onCreateChange, onSessionChange, onCreateSession, tasks }: AgentsOverlayProps) {
  const [agents, setAgents] = useState<AgentExtended[]>(mockAgentsExtended)
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>(mockRoleDefinitions)
  const [runtimes, setRuntimes] = useState<Runtime[]>(mockRuntimes)
  const [createSessionOpen, setCreateSessionOpen] = useState(false)
  const [preselectedAgentId, setPreselectedAgentId] = useState<string | null>(null)
  const [topTab, setTopTab] = useState<TopTab>(() => {
    if (initialTab === 'sessions') return 'sessions'
    if (initialTab === 'runtimes') return 'runtimes'
    if (initialTab === 'roles') return 'roles'
    return 'agents'
  })

  // ── Agents tab state ──
  const [agentsView, setAgentsView] = useState<AgentsView>(() => {
    if (initialCreate) return 'create-agent'
    if (initialAgentId) return 'agent-detail'
    return 'list'
  })
  const [selectedAgent, setSelectedAgent] = useState<AgentExtended | null>(() => {
    if (initialAgentId) return mockAgentsExtended.find(a => a.id === initialAgentId) || null
    return null
  })

  // Sync tab when initialTab prop changes (e.g. daemon badge click while already on agents page)
  // Only switch topTab for top-level tabs (runtimes, roles, sessions),
  // NOT when an agent-detail sub-tab happens to be called 'sessions'
  useEffect(() => {
    // If an agent is currently selected, 'sessions' means the agent-detail sessions tab, not top-level
    if (initialTab === 'sessions' && !selectedAgent) setTopTab('sessions')
    else if (initialTab === 'runtimes') setTopTab('runtimes')
    else if (initialTab === 'roles') setTopTab('roles')
  }, [initialTab, selectedAgent])

  // ── Role Definitions tab state ──
  const [rolesView, setRolesView] = useState<RolesView>('list')
  const [selectedRoleDefinition, setSelectedRoleDefinition] = useState<RoleDefinition | null>(null)

  // ── Runtimes tab state ──
  const [runtimesView, setRuntimesView] = useState<RuntimesView>('list')
  const [selectedRuntime, setSelectedRuntime] = useState<Runtime | null>(null)

  // ── Sessions tab state ──
  const [sessionsSelectedId, setSessionsSelectedId] = useState<string | null>(initialSessionId ?? null)

  // ── Agent handlers ──
  const handleSelectAgent = (agent: AgentExtended) => {
    setSelectedAgent(agent)
    setAgentsView('agent-detail')
    onAgentChange?.(agent.id, null)
  }
  const handleAgentBack = () => {
    setSelectedAgent(null)
    setAgentsView('list')
    onAgentChange?.(null, null)
  }
  const handleTabChange = (tab: AgentDetailTab) => {
    onAgentChange?.(selectedAgent?.id || null, tab)
  }
  const handleToggleAgentEnabled = (agentId: string) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, enabled: !a.enabled } : a))
    if (selectedAgent?.id === agentId) {
      setSelectedAgent(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)
    }
  }
  const handleCreateAgentStart = () => {
    setAgentsView('create-agent')
    onCreateChange?.(true)
  }
  const handleCreateAgentBack = () => {
    setAgentsView('list')
    onCreateChange?.(false)
  }
  const handleCreateAgent = (newAgent: AgentExtended) => {
    setAgents(prev => [...prev, newAgent])
  }

  // ── Role Definition handlers ──
  const handleSelectRoleDefinition = (rd: RoleDefinition) => {
    setSelectedRoleDefinition(rd)
    setRolesView('detail')
  }
  const handleRoleDefinitionBack = () => {
    setSelectedRoleDefinition(null)
    setRolesView('list')
  }
  const handleCreateRoleDefinitionStart = () => {
    // Create a blank role definition for the create view
    const newRd: RoleDefinition = {
      id: `rd-new-${Date.now()}`,
      name: '',
      description: '',
      rolePrompt: '',
      tags: [],
      category: 'executor',
      builtIn: false,
      createdAt: 'just now',
      updatedAt: 'just now',
    }
    setSelectedRoleDefinition(newRd)
    setRolesView('create')
  }
  const handleSaveRoleDefinition = (updated: RoleDefinition) => {
    setRoleDefinitions(prev => {
      const idx = prev.findIndex(rd => rd.id === updated.id)
      if (idx >= 0) return prev.map(rd => rd.id === updated.id ? updated : rd)
      return [...prev, updated]
    })
    setSelectedRoleDefinition(updated)
    setRolesView('detail')
  }
  const handleDeleteRoleDefinition = (id: string) => {
    setRoleDefinitions(prev => prev.filter(rd => rd.id !== id))
    setSelectedRoleDefinition(null)
    setRolesView('list')
  }

  // ── Runtime handlers ──
  const handleSelectRuntime = (rt: Runtime) => {
    setSelectedRuntime(rt)
    setRuntimesView('detail')
  }
  const handleRuntimeBack = () => {
    setSelectedRuntime(null)
    setRuntimesView('list')
  }
  const handleCreateRuntimeStart = () => {
    const firstUserHost = mockHosts.find(h => !h.managed)
    const newRt: Runtime = {
      id: `rt-new-${Date.now()}`,
      name: '',
      hostId: firstUserHost?.id || mockHosts[0]?.id || '',
      mode: 'worktrees',
      isDefault: false,
      status: 'offline',
      createdAt: 'just now',
      worktreePath: '.stoneforge/worktrees',
      assignedAgentCount: 0,
      assignedAgentIds: [],
    }
    setSelectedRuntime(newRt)
    setRuntimesView('create')
  }
  const handleSaveRuntime = (updated: Runtime) => {
    setRuntimes(prev => {
      const idx = prev.findIndex(rt => rt.id === updated.id)
      if (idx >= 0) return prev.map(rt => rt.id === updated.id ? updated : rt)
      return [...prev, updated]
    })
    setSelectedRuntime(updated)
    setRuntimesView('detail')
  }
  const handleDeleteRuntime = (id: string) => {
    setRuntimes(prev => prev.filter(rt => rt.id !== id))
    setSelectedRuntime(null)
    setRuntimesView('list')
  }

  // ── Render ──
  const renderView = () => {
    // ── Role Definitions tab ──
    if (topTab === 'roles') {
      if ((rolesView === 'detail' || rolesView === 'create') && selectedRoleDefinition) {
        const showSidebar = rolesView === 'detail'
        const categoryBadgeColors: Record<string, { bg: string; text: string }> = {
          orchestrator: { bg: 'rgba(124,58,237,0.1)', text: '#7c3aed' },
          executor: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
          reviewer: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
        }
        return (
          <div style={{ display: 'flex', height: '100%' }}>
            {showSidebar && (
              <div style={{ width: 200, borderRight: '1px solid var(--color-border)', overflow: 'auto', flexShrink: 0 }}>
                <div style={{ padding: '10px 12px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border-subtle)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  Role Definitions
                </div>
                {roleDefinitions.map(rd => {
                  const badge = categoryBadgeColors[rd.category || ''] || { bg: 'var(--color-surface)', text: 'var(--color-text-secondary)' }
                  return (
                    <button
                      key={rd.id}
                      onClick={() => handleSelectRoleDefinition(rd)}
                      style={{
                        width: '100%', padding: '7px 12px', border: 'none', textAlign: 'left', cursor: 'pointer',
                        background: rd.id === selectedRoleDefinition.id ? 'var(--color-surface-active)' : 'transparent',
                        boxShadow: rd.id === selectedRoleDefinition.id ? 'inset 2px 0 0 var(--color-primary)' : 'none',
                        fontSize: 12, color: 'var(--color-text)', borderBottom: '1px solid var(--color-border-subtle)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.name}</span>
                      {rd.category && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 'var(--radius-full)', background: badge.bg, color: badge.text, flexShrink: 0 }}>
                          {rd.category}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <RoleDefinitionDetailView
                roleDefinition={selectedRoleDefinition}
                onBack={handleRoleDefinitionBack}
                onSave={handleSaveRoleDefinition}
                onDelete={handleDeleteRoleDefinition}
                isNew={rolesView === 'create'}
              />
            </div>
          </div>
        )
      }
      return (
        <RoleDefinitionListView
          roleDefinitions={roleDefinitions}
          onSelectRoleDefinition={handleSelectRoleDefinition}
          onCreateRoleDefinition={handleCreateRoleDefinitionStart}
        />
      )
    }

    // ── Runtimes tab ──
    if (topTab === 'runtimes') {
      if ((runtimesView === 'detail' || runtimesView === 'create') && selectedRuntime) {
        const showSidebar = runtimesView === 'detail'
        const isNew = runtimesView === 'create'
        const statusDotColors: Record<string, string> = {
          online: 'var(--color-success)',
          offline: 'var(--color-text-tertiary)',
          error: 'var(--color-danger)',
          provisioning: 'var(--color-warning)',
        }
        return (
          <div style={{ display: 'flex', height: '100%' }}>
            {showSidebar && (
              <div style={{ width: 200, borderRight: '1px solid var(--color-border)', overflow: 'auto', flexShrink: 0 }}>
                <div style={{ padding: '10px 12px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border-subtle)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  Runtimes
                </div>
                {runtimes.map(rt => (
                  <button
                    key={rt.id}
                    onClick={() => handleSelectRuntime(rt)}
                    style={{
                      width: '100%', padding: '7px 12px', border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: rt.id === selectedRuntime.id ? 'var(--color-surface-active)' : 'transparent',
                      boxShadow: rt.id === selectedRuntime.id ? 'inset 2px 0 0 var(--color-primary)' : 'none',
                      fontSize: 12, color: 'var(--color-text)', borderBottom: '1px solid var(--color-border-subtle)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDotColors[rt.status] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rt.name || '(new runtime)'}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <RuntimeDetailViewNew
                runtime={selectedRuntime}
                hosts={mockHosts}
                isNew={isNew}
                onBack={handleRuntimeBack}
                onSave={handleSaveRuntime}
                onDelete={handleDeleteRuntime}
              />
            </div>
          </div>
        )
      }
      return (
        <RuntimeListView
          runtimes={runtimes}
          onSelectRuntime={handleSelectRuntime}
          onCreateRuntime={handleCreateRuntimeStart}
        />
      )
    }

    // ── Sessions tab ──
    if (topTab === 'sessions') {
      return (
        <SessionsOverlay
          sessions={mockSessions}
          onBack={() => { setTopTab('agents'); setSessionsSelectedId(null) }}
          initialSessionId={initialSessionId}
          initialEventId={initialSessionEventId}
          onSessionChange={(sessionId, eventId) => {
            setSessionsSelectedId(sessionId)
            onSessionChange?.(sessionId, eventId)
          }}
          onNavigateToAgent={(agentId) => {
            const agent = agents.find(a => a.id === agentId)
            if (agent) {
              setTopTab('agents')
              setSessionsSelectedId(null)
              handleSelectAgent(agent)
            }
          }}
          onNavigateToTask={onNavigateToTask}
          onNavigateToMR={onNavigateToMR}
          onNavigateToWhiteboard={onNavigateToWhiteboard}
          onResumeSession={(session) => {
            if (session.linkedDirectorId) {
              onNavigateToWhiteboard?.(session.linkedDirectorId)
            }
          }}
          agents={agents.map(a => ({ id: a.id, name: a.name, model: a.model, status: a.status }))}
          tasks={tasks}
          onCreateSession={onCreateSession}
        />
      )
    }

    // ── Agents tab ──
    switch (agentsView) {
      case 'agent-detail':
        if (!selectedAgent) { setAgentsView('list'); return null }
        return (
          <div style={{ display: 'flex', height: '100%' }}>
            <AgentSidebar
              agents={agents}
              selectedAgentId={selectedAgent.id}
              onSelectAgent={handleSelectAgent}
            />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <AgentDetailView
                agent={selectedAgent}
                onBack={handleAgentBack}
                initialTab={(initialTab as AgentDetailTab) || undefined}
                onTabChange={handleTabChange}
                onNavigateToTask={onNavigateToTask}
                onNavigateToSession={(sessionId) => {
                  setTopTab('sessions')
                  setSessionsSelectedId(sessionId)
                  onSessionChange?.(sessionId, null)
                }}
                onNavigateToWhiteboard={onNavigateToWhiteboard}
                onNavigateToRuntimes={onNavigateToRuntimes}
                onToggleEnabled={() => handleToggleAgentEnabled(selectedAgent.id)}
                onCreateSession={onCreateSession ? (agentId) => { setPreselectedAgentId(agentId); setCreateSessionOpen(true) } : undefined}
                onDuplicateAgent={(agent) => {
                  const dup: AgentExtended = {
                    ...agent,
                    id: `a-dup-${Date.now()}`,
                    name: `${agent.name}-copy`,
                    status: 'idle',
                    sessions: [],
                    lastActiveAt: 'Never',
                    totalUptime: '0m',
                    totalTasksCompleted: 0,
                    errorRate: 0,
                    recentActivity: [],
                  }
                  setAgents(prev => [...prev, dup])
                  setSelectedAgent(dup)
                  onAgentChange?.(dup.id, null)
                }}
              />
            </div>
          </div>
        )

      case 'create-agent':
        return (
          <CreateAgentView
            existingAgents={agents}
            onCreate={handleCreateAgent}
            onBack={handleCreateAgentBack}
            onNavigateToRuntimes={onNavigateToRuntimes}
          />
        )

      default:
        return (
          <AgentListView
            agents={agents}
            onSelectAgent={handleSelectAgent}
            onCreateAgent={handleCreateAgentStart}
            onToggleAgentEnabled={handleToggleAgentEnabled}
          />
        )
    }
  }

  // Show top tabs when on list views (hide when in detail/create for any tab)
  const isInSubView =
    (topTab === 'agents' && agentsView !== 'list') ||
    (topTab === 'sessions' && sessionsSelectedId !== null) ||
    (topTab === 'roles' && rolesView !== 'list') ||
    (topTab === 'runtimes' && runtimesView !== 'list')
  const showTopTabs = !isInSubView

  return (
    <>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {showTopTabs && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, padding: '0 16px' }}>
            {([
              { key: 'agents' as const, label: `Agents (${agents.length})` },
              { key: 'sessions' as const, label: `Sessions (${mockSessions.length})` },
              { key: 'roles' as const, label: `Role Definitions (${roleDefinitions.length})` },
              { key: 'runtimes' as const, label: `Runtimes (${runtimes.length})` },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setTopTab(tab.key)
                  // Reset sub-views when switching tabs
                  if (tab.key === 'agents') { setAgentsView('list'); setSelectedAgent(null); onAgentChange?.(null, null) }
                  if (tab.key === 'sessions') { setSessionsSelectedId(null); onSessionChange?.(null, null) }
                  if (tab.key === 'roles') { setRolesView('list'); setSelectedRoleDefinition(null); onAgentChange?.(null, 'roles') }
                  if (tab.key === 'runtimes') { setRuntimesView('list'); setSelectedRuntime(null); onAgentChange?.(null, 'runtimes') }
                }}
                style={{
                  padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: 'transparent',
                  color: topTab === tab.key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                  borderBottom: topTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {renderView()}
        </div>
      </div>
      {createSessionOpen && (
        <CreateSessionDialog
          agents={agents.map(a => ({ id: a.id, name: a.name, model: a.model, status: a.status }))}
          tasks={tasks}
          preselectedAgentId={preselectedAgentId || undefined}
          onClose={() => { setCreateSessionOpen(false); setPreselectedAgentId(null) }}
          onCreate={(config) => {
            onCreateSession?.(config)
            setCreateSessionOpen(false)
            setPreselectedAgentId(null)
          }}
        />
      )}
    </>
  )
}
