/**
 * AddPaneDialog - Dialog for selecting an agent to add to the workspace
 *
 * Allows users to select from available agents to add as a new pane.
 */

import { useState } from 'react';
import { X, Search, Terminal, Radio, Bot, Users, Zap } from 'lucide-react';
import type { Agent, AgentRole, WorkerMode } from '../../api/types';
import { useAgentsByRole } from '../../api/hooks/useAgents';

export interface AddPaneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent: (agent: Agent) => void;
  /** Agents already in the workspace (to show badge) */
  existingAgentIds?: string[];
}

/** Role icons */
const roleIcons: Record<AgentRole, typeof Bot> = {
  director: Bot,
  worker: Terminal,
  steward: Radio,
};

/** Role colors */
const roleColors: Record<AgentRole, { bg: string; text: string }> = {
  director: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  worker: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  steward: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
};

interface AgentListItemProps {
  agent: Agent;
  isExisting: boolean;
  onSelect: () => void;
}

function AgentListItem({ agent, isExisting, onSelect }: AgentListItemProps) {
  const meta = agent.metadata?.agent;
  const role = meta?.agentRole ?? 'worker';
  const workerMode = role === 'worker' ? (meta as { workerMode?: WorkerMode })?.workerMode : undefined;
  const RoleIcon = roleIcons[role];
  const colors = roleColors[role];

  // Get session status
  const sessionStatus = meta?.sessionStatus;
  const isRunning = sessionStatus === 'running';

  return (
    <button
      onClick={onSelect}
      disabled={isExisting}
      className={`
        w-full flex items-center gap-3 p-3 rounded-lg text-left
        transition-colors duration-150
        ${isExisting
          ? 'opacity-50 cursor-not-allowed bg-[var(--color-surface)]'
          : 'hover:bg-[var(--color-surface-hover)] cursor-pointer'
        }
      `}
      data-testid={`agent-option-${agent.id}`}
    >
      {/* Agent icon with status */}
      <div className="relative">
        <div className={`p-2 rounded-lg ${colors.bg}`}>
          <RoleIcon className={`w-5 h-5 ${colors.text}`} />
        </div>
        {/* Running status indicator */}
        {isRunning && (
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-[var(--color-bg)]" />
        )}
      </div>

      {/* Agent info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--color-text)] truncate">
            {agent.name}
          </span>
          {isExisting && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary-muted)] text-[var(--color-primary)]">
              In workspace
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <span className="capitalize">{role}</span>
          {workerMode && (
            <>
              <span>•</span>
              <span className="capitalize flex items-center gap-1">
                {workerMode === 'ephemeral' && <Zap className="w-3 h-3" />}
                {workerMode}
              </span>
            </>
          )}
          {sessionStatus && (
            <>
              <span>•</span>
              <span className={isRunning ? 'text-green-600 dark:text-green-400' : ''}>
                {sessionStatus}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

export function AddPaneDialog({
  isOpen,
  onClose,
  onSelectAgent,
  existingAgentIds = [],
}: AddPaneDialogProps) {
  const [search, setSearch] = useState('');
  const { persistentWorkers, ephemeralWorkers, stewards, isLoading, error } = useAgentsByRole();

  if (!isOpen) return null;

  // Combine all agents for filtering (excluding Director - use Director panel instead)
  const allAgents = [
    ...persistentWorkers,
    ...ephemeralWorkers,
    ...stewards,
  ].filter((a): a is Agent => a != null);

  // Filter by search
  const filteredAgents = allAgents.filter(agent => {
    const searchLower = search.toLowerCase();
    const name = agent.name.toLowerCase();
    const role = agent.metadata?.agent?.agentRole?.toLowerCase() ?? '';
    return name.includes(searchLower) || role.includes(searchLower);
  });

  // Group agents by category (Director excluded - use Director panel instead)
  const workers = filteredAgents.filter(a => a.metadata?.agent?.agentRole === 'worker');
  const stewardAgents = filteredAgents.filter(a => a.metadata?.agent?.agentRole === 'steward');

  const handleSelect = (agent: Agent) => {
    onSelectAgent(agent);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={onClose}
        data-testid="add-pane-backdrop"
      />

      {/* Dialog */}
      <div
        className="
          fixed inset-0 z-50
          flex items-center justify-center
          p-4
          pointer-events-none
        "
      >
        <div
          className="
            w-full max-w-md
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
          "
          data-testid="add-pane-dialog"
          role="dialog"
          aria-labelledby="add-pane-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2
              id="add-pane-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              Add Terminal Pane
            </h2>
            <button
              onClick={onClose}
              className="
                p-1.5 rounded-lg
                text-[var(--color-text-tertiary)]
                hover:text-[var(--color-text)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors
              "
              aria-label="Close dialog"
              data-testid="add-pane-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                className="
                  w-full pl-10 pr-4 py-2
                  text-sm
                  bg-[var(--color-surface)]
                  border border-[var(--color-border)]
                  rounded-lg
                  placeholder:text-[var(--color-text-tertiary)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                "
                autoFocus
                data-testid="add-pane-search"
              />
            </div>
          </div>

          {/* Agent list */}
          <div className="max-h-80 overflow-y-auto p-2" data-testid="add-pane-list">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-[var(--color-text-secondary)]">
                Loading agents...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-8 text-red-500">
                Failed to load agents
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-secondary)]">
                <Users className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {search ? 'No agents match your search' : 'No agents registered'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Workers */}
                {workers.length > 0 && (
                  <div>
                    <div className="px-2 py-1 mt-2 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
                      Workers
                    </div>
                    {workers.map(agent => (
                      <AgentListItem
                        key={agent.id}
                        agent={agent}
                        isExisting={existingAgentIds.includes(agent.id)}
                        onSelect={() => handleSelect(agent)}
                      />
                    ))}
                  </div>
                )}

                {/* Stewards */}
                {stewardAgents.length > 0 && (
                  <div>
                    <div className="px-2 py-1 mt-2 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
                      Stewards
                    </div>
                    {stewardAgents.map(agent => (
                      <AgentListItem
                        key={agent.id}
                        agent={agent}
                        isExisting={existingAgentIds.includes(agent.id)}
                        onSelect={() => handleSelect(agent)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
