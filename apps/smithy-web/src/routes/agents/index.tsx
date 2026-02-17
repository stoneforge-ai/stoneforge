/**
 * Agents Page - View and manage agents and stewards
 *
 * Displays agent status, capabilities, and current tasks.
 * Organized with tabs for Agents (Director + Workers), Stewards, and Graph View.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Users, Plus, Search, Crown, Wrench, Shield, Loader2, AlertCircle, RefreshCw, Network, Layers } from 'lucide-react';
import { getCurrentBinding, formatKeyBinding } from '../../lib/keyboard';
import { useAgentsByRole, useStartAgentSession, useStopAgentSession, useDeleteAgent, useDirector, useSessions } from '../../api/hooks/useAgents';
import { useTasks } from '../../api/hooks/useTasks';
import { usePools, useUpdatePool, useDeletePool } from '../../api/hooks/usePools';
import type { AgentPool } from '../../api/hooks/usePools';
import { AgentCard, CreateAgentDialog, DeleteAgentDialog, RenameAgentDialog, StartAgentDialog } from '../../components/agent';
import { PoolCard, CreatePoolDialog, EditPoolDialog } from '../../components/pool';
import { AgentWorkspaceGraph } from '../../components/agent-graph';
import type { Agent, SessionStatus, AgentRole, StewardFocus } from '../../api/types';

type TabValue = 'agents' | 'stewards' | 'pools' | 'graph';

export function AgentsPage() {
  const search = useSearch({ from: '/agents' }) as { tab?: string; selected?: string; role?: string; action?: string };
  const navigate = useNavigate();

  const currentTab = (search.tab as TabValue) || 'agents';
  const [searchQuery, setSearchQuery] = useState('');

  // Create Agent Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Create Pool Dialog state
  const [createPoolDialogOpen, setCreatePoolDialogOpen] = useState(false);

  // Edit Pool Dialog state
  const [editingPool, setEditingPool] = useState<AgentPool | null>(null);

  // Handle ?action=create from global keyboard shortcuts
  useEffect(() => {
    if (search.action === 'create') {
      setCreateDialogOpen(true);
      // Clear the action param
      navigate({
        to: '/agents',
        search: { tab: search.tab ?? 'agents', selected: search.selected, role: search.role },
        replace: true,
      });
    }
  }, [search.action, search.tab, search.selected, search.role, navigate]);
  const [createDialogRole, setCreateDialogRole] = useState<AgentRole | undefined>(undefined);
  const [createDialogStewardFocus, setCreateDialogStewardFocus] = useState<StewardFocus | undefined>(undefined);

  // Rename Agent Dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameAgent, setRenameAgent] = useState<{ id: string; name: string } | null>(null);

  // Delete Agent Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAgentInfo, setDeleteAgentInfo] = useState<{ id: string; name: string } | null>(null);

  // Start Agent Dialog state (for ephemeral workers)
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [startDialogAgent, setStartDialogAgent] = useState<{ id: string; name: string } | null>(null);

  // Track which agents have pending actions
  const [pendingStart, setPendingStart] = useState<Set<string>>(new Set());
  const [pendingStop, setPendingStop] = useState<Set<string>>(new Set());

  const {
    director,
    ephemeralWorkers,
    persistentWorkers,
    stewards,
    workers,
    isLoading,
    error,
    refetch,
  } = useAgentsByRole();

  // Fetch pools
  const { data: poolsData, isLoading: poolsLoading, refetch: refetchPools } = usePools();
  const pools = poolsData ?? [];
  const updatePoolMutation = useUpdatePool();
  const deletePoolMutation = useDeletePool();

  // Fetch tasks for the graph view
  const { data: tasksData } = useTasks({ status: 'all', limit: 100 });
  const tasks = tasksData?.tasks ?? [];

  const startSession = useStartAgentSession();
  const stopSession = useStopAgentSession();
  const deleteAgent = useDeleteAgent();

  // Get Director session status from dedicated hook (polls for updates)
  const { hasActiveSession: directorHasActiveSession } = useDirector();

  // Fetch active sessions to determine which agents are actually running
  const { data: sessionsData } = useSessions({ status: 'running' });
  const activeSessions = sessionsData?.sessions ?? [];

  // Build a map of agent IDs to their live session status
  // This is used by the graph to show accurate real-time status
  // Graph only supports: 'running' | 'idle' | 'suspended' | 'terminated' | 'starting'
  type GraphSessionStatus = 'running' | 'idle' | 'suspended' | 'terminated' | 'starting';
  const sessionStatuses = useMemo(() => {
    const statusMap = new Map<string, GraphSessionStatus>();

    // Mark all known agents as idle by default
    if (director) statusMap.set(director.id, 'idle');
    for (const worker of workers) statusMap.set(worker.id, 'idle');
    for (const steward of stewards) statusMap.set(steward.id, 'idle');

    // Override with actual session status for running sessions
    for (const session of activeSessions) {
      // Map transitional states to their closest stable state
      const status: GraphSessionStatus =
        session.status === 'terminating' ? 'terminated' : session.status;
      statusMap.set(session.agentId, status);
    }

    return statusMap;
  }, [director, workers, stewards, activeSessions]);

  // Helper to check if an agent has an active session
  const getActiveSessionStatus = (agentId: string): SessionStatus | undefined => {
    const session = activeSessions.find(s => s.agentId === agentId);
    if (session) {
      return session.status === 'running' ? 'running' : session.status === 'starting' ? 'starting' : undefined;
    }
    return undefined;
  };

  // Filter agents based on search query
  const filteredAgents = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return { director, ephemeralWorkers, persistentWorkers, stewards };

    const filter = (agents: Agent[]) =>
      agents.filter((a) => a.name.toLowerCase().includes(query));

    return {
      director: director?.name.toLowerCase().includes(query) ? director : undefined,
      ephemeralWorkers: filter(ephemeralWorkers),
      persistentWorkers: filter(persistentWorkers),
      stewards: filter(stewards),
    };
  }, [searchQuery, director, ephemeralWorkers, persistentWorkers, stewards]);

  const setTab = (tab: TabValue) => {
    navigate({
      to: '/agents',
      search: { selected: search.selected, tab, role: search.role },
    });
  };

  const handleStartAgent = async (agentId: string) => {
    setPendingStart((prev) => new Set(prev).add(agentId));
    try {
      await startSession.mutateAsync({ agentId });
    } finally {
      setPendingStart((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  // Open start dialog for ephemeral workers
  const openStartDialog = (agent: { id: string; name: string }) => {
    setStartDialogAgent(agent);
    setStartDialogOpen(true);
  };

  const closeStartDialog = () => {
    setStartDialogOpen(false);
    setStartDialogAgent(null);
  };

  // Handle starting an ephemeral agent with task assignment
  const handleStartAgentWithTask = async (agentId: string, taskId: string, initialMessage?: string) => {
    setPendingStart((prev) => new Set(prev).add(agentId));
    try {
      await startSession.mutateAsync({
        agentId,
        taskId,
        initialMessage,
      });
    } finally {
      setPendingStart((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  // Handle starting an ephemeral agent with task assignment and opening in workspace
  const handleStartAgentWithTaskAndOpen = async (agentId: string, taskId: string, initialMessage?: string) => {
    await handleStartAgentWithTask(agentId, taskId, initialMessage);
    // Navigate to workspaces page with agent selected
    navigate({ to: '/workspaces', search: { layout: 'single', agent: agentId, resumeSessionId: undefined, resumePrompt: undefined } });
  };

  // Determine if an agent is ephemeral
  const isEphemeralWorker = (agentId: string): boolean => {
    return ephemeralWorkers.some((a) => a.id === agentId);
  };

  // Start handler that routes ephemeral workers to the dialog
  const handleStartAgentOrDialog = (agentId: string) => {
    const agent = [...ephemeralWorkers, ...persistentWorkers, director].find((a) => a?.id === agentId);
    if (!agent) return;

    if (isEphemeralWorker(agentId)) {
      openStartDialog({ id: agent.id, name: agent.name });
    } else {
      handleStartAgent(agentId);
    }
  };

  const handleStopAgent = async (agentId: string) => {
    setPendingStop((prev) => new Set(prev).add(agentId));
    try {
      await stopSession.mutateAsync({ agentId, graceful: true });
    } finally {
      setPendingStop((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  const handleOpenTerminal = (agentId: string) => {
    // Navigate to workspaces page with agent selected
    navigate({ to: '/workspaces', search: { layout: 'single', agent: agentId, resumeSessionId: undefined, resumePrompt: undefined } });
  };

  const handleOpenDirectorPanel = () => {
    // Dispatch event to open the Director panel in AppShell
    window.dispatchEvent(new CustomEvent('open-director-panel'));
  };

  // Create Agent Dialog handlers
  const openCreateDialog = (role?: AgentRole, stewardFocus?: StewardFocus) => {
    setCreateDialogRole(role);
    setCreateDialogStewardFocus(stewardFocus);
    setCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setCreateDialogRole(undefined);
    setCreateDialogStewardFocus(undefined);
  };

  // Rename Agent Dialog handlers
  const openRenameDialog = (agent: { id: string; name: string }) => {
    setRenameAgent(agent);
    setRenameDialogOpen(true);
  };

  const closeRenameDialog = () => {
    setRenameDialogOpen(false);
    setRenameAgent(null);
  };

  // Delete Agent Dialog handlers
  const openDeleteDialog = (agent: { id: string; name: string }) => {
    setDeleteAgentInfo(agent);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeleteAgentInfo(null);
  };

  const handleDeleteAgent = async () => {
    if (!deleteAgentInfo) return;
    try {
      await deleteAgent.mutateAsync({ agentId: deleteAgentInfo.id });
      closeDeleteDialog();
    } catch {
      // Error handled by mutation state
    }
  };

  // Count agents by tab
  const agentCount = (director ? 1 : 0) + ephemeralWorkers.length + persistentWorkers.length;
  const stewardCount = stewards.length;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="agents-page">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <Users className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]" data-testid="agents-page-title">Agents</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage your AI agents and stewards
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent w-48 @md:w-64"
              data-testid="agents-search"
            />
          </div>
          {currentTab === 'pools' ? (
            <button
              onClick={() => setCreatePoolDialogOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
              data-testid="pools-create"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Pool</span>
            </button>
          ) : (
            <button
              onClick={() => openCreateDialog(currentTab === 'stewards' ? 'steward' : undefined)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
              data-testid="agents-create"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{currentTab === 'stewards' ? 'Create Steward' : 'Create Agent'}</span>
              <kbd className="hidden sm:inline ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">
                {formatKeyBinding(getCurrentBinding('action.createAgent'))}
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex gap-1" aria-label="Tabs">
          <button
            onClick={() => setTab('agents')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'agents'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="agents-tab-agents"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Agents
              {agentCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface-elevated)]">
                  {agentCount}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setTab('stewards')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'stewards'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="agents-tab-stewards"
          >
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Stewards
              {stewardCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface-elevated)]">
                  {stewardCount}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setTab('pools')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'pools'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="agents-tab-pools"
          >
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Pools
              {pools.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface-elevated)]">
                  {pools.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setTab('graph')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'graph'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="agents-tab-graph"
          >
            <span className="flex items-center gap-2">
              <Network className="w-4 h-4" />
              Graph
            </span>
          </button>
        </nav>
      </div>

      {/* Content */}
      {currentTab === 'graph' ? (
        // Graph tab handles its own loading/error states
        <div className="h-[600px] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <AgentWorkspaceGraph
            director={director}
            workers={workers}
            stewards={stewards}
            tasks={tasks}
            sessionStatuses={sessionStatuses}
            isLoading={isLoading}
            error={error}
            onRefresh={refetch}
          />
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mb-4" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading agents...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-danger)] rounded-lg bg-[var(--color-danger-muted)]">
          <AlertCircle className="w-12 h-12 text-[var(--color-danger)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--color-text)]">Failed to load agents</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
            {error.message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-surface)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : currentTab === 'agents' ? (
        <AgentsTab
          director={filteredAgents.director}
          directorHasActiveSession={directorHasActiveSession}
          onOpenDirectorPanel={handleOpenDirectorPanel}
          ephemeralWorkers={filteredAgents.ephemeralWorkers}
          persistentWorkers={filteredAgents.persistentWorkers}
          onStart={handleStartAgentOrDialog}
          onStop={handleStopAgent}
          onOpenTerminal={handleOpenTerminal}
          onRename={openRenameDialog}
          onDelete={openDeleteDialog}
          pendingStart={pendingStart}
          pendingStop={pendingStop}
          onCreateAgent={() => openCreateDialog()}
          getActiveSessionStatus={getActiveSessionStatus}
        />
      ) : currentTab === 'stewards' ? (
        <StewardsTab
          stewards={filteredAgents.stewards}
          onStart={handleStartAgent}
          onStop={handleStopAgent}
          onOpenTerminal={handleOpenTerminal}
          onRename={openRenameDialog}
          onDelete={openDeleteDialog}
          pendingStart={pendingStart}
          pendingStop={pendingStop}
          onCreateSteward={() => openCreateDialog('steward')}
          getActiveSessionStatus={getActiveSessionStatus}
        />
      ) : currentTab === 'pools' ? (
        <PoolsTab
          pools={pools}
          isLoading={poolsLoading}
          onCreatePool={() => setCreatePoolDialogOpen(true)}
          onEditPool={(pool) => setEditingPool(pool)}
          onToggleEnabled={(poolId, enabled) => updatePoolMutation.mutate({ id: poolId, enabled })}
          onDeletePool={(poolId) => deletePoolMutation.mutate({ id: poolId })}
          isUpdating={updatePoolMutation.isPending}
        />
      ) : null}

      {/* Create Agent Dialog */}
      <CreateAgentDialog
        isOpen={createDialogOpen}
        onClose={closeCreateDialog}
        initialRole={createDialogRole}
        initialStewardFocus={createDialogStewardFocus}
        hasDirector={!!director}
        onSuccess={() => refetch()}
      />

      {/* Create Pool Dialog */}
      <CreatePoolDialog
        isOpen={createPoolDialogOpen}
        onClose={() => setCreatePoolDialogOpen(false)}
        onSuccess={() => refetchPools()}
      />

      {/* Edit Pool Dialog */}
      {editingPool && (
        <EditPoolDialog
          isOpen={!!editingPool}
          onClose={() => setEditingPool(null)}
          pool={editingPool}
          onSuccess={() => { setEditingPool(null); refetchPools(); }}
        />
      )}

      {/* Rename Agent Dialog */}
      {renameAgent && (
        <RenameAgentDialog
          isOpen={renameDialogOpen}
          onClose={closeRenameDialog}
          agentId={renameAgent.id}
          currentName={renameAgent.name}
          onSuccess={() => refetch()}
        />
      )}

      {/* Start Agent Dialog (for ephemeral workers) */}
      {startDialogAgent && (
        <StartAgentDialog
          isOpen={startDialogOpen}
          onClose={closeStartDialog}
          agent={startDialogAgent}
          onStart={handleStartAgentWithTask}
          onStartAndOpen={handleStartAgentWithTaskAndOpen}
          isStarting={pendingStart.has(startDialogAgent.id)}
        />
      )}

      {/* Delete Agent Dialog */}
      {deleteAgentInfo && (
        <DeleteAgentDialog
          isOpen={deleteDialogOpen}
          onClose={closeDeleteDialog}
          agentName={deleteAgentInfo.name}
          onConfirm={handleDeleteAgent}
          isDeleting={deleteAgent.isPending}
        />
      )}
    </div>
  );
}

// ============================================================================
// Agents Tab
// ============================================================================

interface AgentsTabProps {
  director?: Agent;
  directorHasActiveSession: boolean;
  onOpenDirectorPanel: () => void;
  ephemeralWorkers: Agent[];
  persistentWorkers: Agent[];
  onStart: (agentId: string) => void;
  onStop: (agentId: string) => void;
  onOpenTerminal: (agentId: string) => void;
  onRename: (agent: { id: string; name: string }) => void;
  onDelete: (agent: { id: string; name: string }) => void;
  pendingStart: Set<string>;
  pendingStop: Set<string>;
  onCreateAgent: () => void;
  getActiveSessionStatus: (agentId: string) => SessionStatus | undefined;
}

function AgentsTab({
  director,
  directorHasActiveSession,
  onOpenDirectorPanel,
  ephemeralWorkers,
  persistentWorkers,
  onStart,
  onStop,
  onOpenTerminal,
  onRename,
  onDelete,
  pendingStart,
  pendingStop,
  onCreateAgent,
  getActiveSessionStatus,
}: AgentsTabProps) {
  const hasAgents = director || ephemeralWorkers.length > 0 || persistentWorkers.length > 0;

  if (!hasAgents) {
    return (
      <EmptyState
        icon={Users}
        title="No agents yet"
        description="Create your first agent to start orchestrating AI work. Agents can work on tasks autonomously in isolated git worktrees."
        actionLabel="Create Agent"
        actionTestId="agents-create-empty"
        onAction={onCreateAgent}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Director */}
      {director && (
        <AgentSection
          title="Director"
          icon={Crown}
          description="Strategic agent that creates and assigns tasks"
        >
          <AgentCard
            agent={director}
            activeSessionStatus={directorHasActiveSession ? 'running' : undefined}
            onStart={() => onStart(director.id)}
            onStop={() => onStop(director.id)}
            onOpenTerminal={onOpenDirectorPanel}
            onRename={() => onRename({ id: director.id, name: director.name })}
            onDelete={() => onDelete({ id: director.id, name: director.name })}
            isStarting={pendingStart.has(director.id)}
            isStopping={pendingStop.has(director.id)}
          />
        </AgentSection>
      )}

      {/* Persistent Workers */}
      {persistentWorkers.length > 0 && (
        <AgentSection
          title="Persistent Workers"
          icon={Wrench}
          description="Long-lived workers that handle multiple tasks"
          count={persistentWorkers.length}
        >
          <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-4">
            {persistentWorkers.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                activeSessionStatus={getActiveSessionStatus(agent.id)}
                onStart={() => onStart(agent.id)}
                onStop={() => onStop(agent.id)}
                onOpenTerminal={() => onOpenTerminal(agent.id)}
                onRename={() => onRename({ id: agent.id, name: agent.name })}
                onDelete={() => onDelete({ id: agent.id, name: agent.name })}
                isStarting={pendingStart.has(agent.id)}
                isStopping={pendingStop.has(agent.id)}
              />
            ))}
          </div>
        </AgentSection>
      )}

      {/* Ephemeral Workers */}
      {ephemeralWorkers.length > 0 && (
        <AgentSection
          title="Ephemeral Workers"
          icon={Wrench}
          description="Short-lived workers spawned per task"
          count={ephemeralWorkers.length}
        >
          <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-4">
            {ephemeralWorkers.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                activeSessionStatus={getActiveSessionStatus(agent.id)}
                onStart={() => onStart(agent.id)}
                onStop={() => onStop(agent.id)}
                onOpenTerminal={() => onOpenTerminal(agent.id)}
                onRename={() => onRename({ id: agent.id, name: agent.name })}
                onDelete={() => onDelete({ id: agent.id, name: agent.name })}
                isStarting={pendingStart.has(agent.id)}
                isStopping={pendingStop.has(agent.id)}
              />
            ))}
          </div>
        </AgentSection>
      )}
    </div>
  );
}

// ============================================================================
// Stewards Tab
// ============================================================================

interface StewardsTabProps {
  stewards: Agent[];
  onStart: (agentId: string) => void;
  onStop: (agentId: string) => void;
  onOpenTerminal: (agentId: string) => void;
  onRename: (agent: { id: string; name: string }) => void;
  onDelete: (agent: { id: string; name: string }) => void;
  pendingStart: Set<string>;
  pendingStop: Set<string>;
  onCreateSteward: () => void;
  getActiveSessionStatus: (agentId: string) => SessionStatus | undefined;
}

function StewardsTab({ stewards, onStart, onStop, onOpenTerminal, onRename, onDelete, pendingStart, pendingStop, onCreateSteward, getActiveSessionStatus }: StewardsTabProps) {
  if (stewards.length === 0) {
    return (
      <EmptyState
        icon={Shield}
        title="No stewards yet"
        description="Create stewards to automate maintenance tasks like merging branches and scanning documentation."
        actionLabel="Create Steward"
        actionTestId="stewards-create-empty"
        onAction={onCreateSteward}
      />
    );
  }

  // Group stewards by focus
  const stewardsByFocus = stewards.reduce(
    (acc, steward) => {
      const meta = steward.metadata?.agent;
      const focus = meta?.agentRole === 'steward' ? (meta as { stewardFocus?: string })?.stewardFocus : 'merge';
      if (!acc[focus ?? 'merge']) acc[focus ?? 'merge'] = [];
      acc[focus ?? 'merge'].push(steward);
      return acc;
    },
    {} as Record<string, Agent[]>
  );

  const focusLabels: Record<string, string> = {
    merge: 'Merge Stewards',
    docs: 'Docs Stewards',
  };

  return (
    <div className="space-y-8">
      {Object.entries(stewardsByFocus).map(([focus, agents]) => (
        <AgentSection
          key={focus}
          title={focusLabels[focus] ?? focus}
          icon={Shield}
          count={agents.length}
        >
          <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                activeSessionStatus={getActiveSessionStatus(agent.id)}
                onStart={() => onStart(agent.id)}
                onStop={() => onStop(agent.id)}
                onOpenTerminal={() => onOpenTerminal(agent.id)}
                onRename={() => onRename({ id: agent.id, name: agent.name })}
                onDelete={() => onDelete({ id: agent.id, name: agent.name })}
                isStarting={pendingStart.has(agent.id)}
                isStopping={pendingStop.has(agent.id)}
              />
            ))}
          </div>
        </AgentSection>
      ))}
    </div>
  );
}

// ============================================================================
// Pools Tab
// ============================================================================

interface PoolsTabProps {
  pools: AgentPool[];
  isLoading: boolean;
  onCreatePool: () => void;
  onEditPool: (pool: AgentPool) => void;
  onToggleEnabled: (poolId: string, enabled: boolean) => void;
  onDeletePool: (poolId: string) => void;
  isUpdating: boolean;
}

function PoolsTab({ pools, isLoading, onCreatePool, onEditPool, onToggleEnabled, onDeletePool, isUpdating }: PoolsTabProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mb-4" />
        <p className="text-sm text-[var(--color-text-secondary)]">Loading pools...</p>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No pools yet"
        description="Create agent pools to control the maximum number of agents running concurrently. Pools help manage resource usage and agent scheduling."
        actionLabel="Create Pool"
        actionTestId="pools-create-empty"
        onAction={onCreatePool}
      />
    );
  }

  return (
    <div className="space-y-8">
      <AgentSection
        title="Agent Pools"
        icon={Layers}
        description="Pools control how many agents can run concurrently"
        count={pools.length}
      >
        <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-4">
          {pools.map((pool) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              onEdit={() => onEditPool(pool)}
              onToggleEnabled={(enabled) => onToggleEnabled(pool.id, enabled)}
              onDelete={() => onDeletePool(pool.id)}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      </AgentSection>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

interface AgentSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  count?: number;
  children: React.ReactNode;
}

function AgentSection({ title, icon: Icon, description, count, children }: AgentSectionProps) {
  return (
    <section data-testid={`agent-section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-[var(--color-text-secondary)]" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
        {count !== undefined && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]">
            {count}
          </span>
        )}
      </div>
      {description && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">{description}</p>
      )}
      {children}
    </section>
  );
}

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel: string;
  actionTestId: string;
  onAction?: () => void;
}

function EmptyState({ icon: Icon, title, description, actionLabel, actionTestId, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
      <Icon className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
      <h3 className="text-lg font-medium text-[var(--color-text)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
        {description}
      </p>
      <button
        onClick={onAction}
        className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
        data-testid={actionTestId}
      >
        <Plus className="w-4 h-4" />
        {actionLabel}
      </button>
    </div>
  );
}

