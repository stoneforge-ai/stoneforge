/**
 * Popout Terminal Page
 *
 * A standalone page for displaying an agent terminal in a popped-out window.
 * This page renders without the AppShell layout for a clean terminal experience.
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearch } from '@tanstack/react-router';
import { XTerminal } from '../../components/terminal/XTerminal';
import { StreamViewer } from '../../components/workspace/StreamViewer';
import { useAgent, useAgentStatus, useStartAgentSession, useStopAgentSession } from '../../api/hooks/useAgents';
import { Terminal, Radio, Play, Square, RefreshCw, AlertCircle, LogIn } from 'lucide-react';
import { WORKSPACE_CHANNEL_NAME, type WorkspaceChannelMessage } from '../../components/workspace/types';
import type { AgentRole, WorkerMode } from '../../api/types';

/** Status indicator colors */
const statusColors = {
  disconnected: 'bg-gray-400',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
};

/** Role badge styles */
const roleBadgeStyles: Record<string, { bg: string; text: string; icon: typeof Terminal }> = {
  director: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', icon: Terminal },
  worker: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: Terminal },
  steward: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: Radio },
};

export function PopoutTerminalPage() {
  const search = useSearch({ from: '/popout/terminal' });
  const agentId = search.agent as string | undefined;
  const paneType = (search.type as 'terminal' | 'stream') || 'terminal';
  // Get pane info from URL params (for pop back in functionality)
  const urlAgentName = search.name as string | undefined;
  const urlAgentRole = search.role as AgentRole | undefined;
  const urlWorkerMode = search.mode as WorkerMode | undefined;

  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  const { data: agentData, isLoading: agentLoading, error: agentError } = useAgent(agentId);
  const { data: statusData } = useAgentStatus(agentId);
  const startSession = useStartAgentSession();
  const stopSession = useStopAgentSession();

  const agent = agentData?.agent;
  const hasActiveSession = statusData?.hasActiveSession ?? false;
  // Use URL params as fallback if agent data not loaded yet
  const agentRole = agent?.metadata?.agent?.agentRole || urlAgentRole || 'worker';
  const agentName = agent?.name || urlAgentName || 'Unknown Agent';
  const workerMode = (agent?.metadata?.agent as { workerMode?: string })?.workerMode || urlWorkerMode;

  // Set window title based on agent
  useEffect(() => {
    if (agentName && agentName !== 'Unknown Agent') {
      document.title = `Stoneforge | ${agentName} - Terminal`;
    }
    return () => {
      document.title = 'Stoneforge';
    };
  }, [agentName]);

  const handleStartSession = async () => {
    if (!agentId) return;
    try {
      await startSession.mutateAsync({
        agentId,
        interactive: paneType === 'terminal',
      });
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const handleStopSession = async () => {
    if (!agentId) return;
    try {
      await stopSession.mutateAsync({ agentId, graceful: true });
    } catch (err) {
      console.error('Failed to stop session:', err);
    }
  };

  // Pop back in: send message to main window and close this window
  const handlePopBackIn = useCallback(() => {
    if (!agentId) return;

    const message: WorkspaceChannelMessage = {
      type: 'pop-back-in',
      pane: {
        agentId,
        agentName,
        agentRole: agentRole as AgentRole,
        workerMode: workerMode as WorkerMode | undefined,
        paneType,
      },
    };

    // Send message to main window via BroadcastChannel
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();

    // Close this popout window
    window.close();
  }, [agentId, agentName, agentRole, workerMode, paneType]);

  // Loading state
  if (agentLoading && !urlAgentName) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#1a1a1a]">
        <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading agent...</span>
        </div>
      </div>
    );
  }

  // Error or no agent (but allow if we have URL params)
  if (!agentId || (agentError && !urlAgentName)) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#1a1a1a] p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h1 className="text-lg font-medium text-white mb-2">Agent Not Found</h1>
        <p className="text-sm text-[var(--color-text-muted)] text-center max-w-md mb-6">
          {!agentId ? 'No agent ID provided.' : 'The specified agent could not be found.'}
        </p>
        <button
          onClick={() => window.close()}
          className="
            inline-flex items-center gap-2
            px-4 py-2 rounded-lg
            bg-[var(--color-surface)] border border-[var(--color-border)]
            text-[var(--color-text)]
            hover:bg-[var(--color-surface-hover)]
            transition-colors
          "
        >
          Close Window
        </button>
      </div>
    );
  }

  const roleStyle = roleBadgeStyles[agentRole] || roleBadgeStyles.worker;
  const RoleIcon = roleStyle.icon;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a1a]">
      {/* Header */}
      <div className="
        flex items-center justify-between
        px-4 py-2
        border-b border-[var(--color-border)]
        bg-[var(--color-surface)]
      ">
        {/* Left: Agent info */}
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              hasActiveSession ? statusColors[connectionStatus] : 'bg-gray-400'
            }`}
            title={hasActiveSession ? connectionStatus : 'Session not running'}
          />

          {/* Role badge */}
          <span className={`
            inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium
            ${roleStyle.bg} ${roleStyle.text}
          `}>
            <RoleIcon className="w-3.5 h-3.5" />
            {agentRole}
          </span>

          {/* Agent name */}
          <span className="text-sm font-mono text-[var(--color-text)]">
            {agentName}
          </span>

          {/* Worker mode badge */}
          {workerMode && (
            <span className="
              px-2 py-1 rounded text-xs
              bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)]
            ">
              {workerMode}
            </span>
          )}

        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Pop back in button */}
          <button
            onClick={handlePopBackIn}
            className="
              inline-flex items-center gap-1.5
              px-3 py-1.5 rounded-md
              bg-[var(--color-surface-hover)] hover:bg-[var(--color-border)]
              text-[var(--color-text-secondary)] text-sm font-medium
              transition-colors
              border border-[var(--color-border)]
            "
            title="Return to Workspaces"
          >
            <LogIn className="w-3.5 h-3.5" />
            Pop back in
          </button>

          {/* Session controls */}
          {!hasActiveSession ? (
            <button
              onClick={handleStartSession}
              disabled={startSession.isPending}
              className="
                inline-flex items-center gap-1.5
                px-3 py-1.5 rounded-md
                bg-green-600 hover:bg-green-500
                text-white text-sm font-medium
                transition-colors
                disabled:opacity-50
              "
            >
              {startSession.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Start
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStopSession}
              disabled={stopSession.isPending}
              className="
                inline-flex items-center gap-1.5
                px-3 py-1.5 rounded-md
                bg-red-600 hover:bg-red-500
                text-white text-sm font-medium
                transition-colors
                disabled:opacity-50
              "
            >
              {stopSession.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 min-h-0 relative">
        {paneType === 'terminal' ? (
          <XTerminal
            agentId={agentId}
            onStatusChange={setConnectionStatus}
            interactive={true}
            autoFocus={true}
            controlsResize={true}
          />
        ) : (
          <StreamViewer
            agentId={agentId}
            agentName={agentName}
            onStatusChange={setConnectionStatus}
          />
        )}

        {/* Idle overlay when session not running */}
        {!hasActiveSession && (
          <div
            className="
              absolute inset-0 z-10
              flex flex-col items-center justify-center
              bg-[#1a1a1a]/95 backdrop-blur-sm
            "
          >
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-[var(--color-primary)]/20 blur-xl rounded-full scale-150" />
              <div className="
                relative p-4 rounded-2xl
                bg-gradient-to-br from-[#252525] to-[#1a1a1a]
                border border-[#333]
                shadow-lg
              ">
                <Terminal className="w-10 h-10 text-[var(--color-text-muted)]" />
              </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-1">
                Session Idle
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] max-w-xs px-4">
                Start a session to interact with {agentName}.
              </p>
            </div>

            <button
              onClick={handleStartSession}
              disabled={startSession.isPending}
              className="
                inline-flex items-center gap-2.5
                px-6 py-2.5 rounded-lg
                bg-gradient-to-r from-green-600 to-green-500
                hover:from-green-500 hover:to-green-400
                text-white font-medium text-sm
                shadow-lg shadow-green-500/25
                transition-all duration-200
                hover:scale-105 hover:shadow-green-500/40
                disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:ring-offset-2 focus:ring-offset-[#1a1a1a]
              "
            >
              {startSession.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Session
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
