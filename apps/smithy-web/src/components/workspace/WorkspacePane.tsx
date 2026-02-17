/**
 * WorkspacePane - A single pane in the workspace terminal multiplexer
 *
 * Renders either an interactive terminal (XTerminal) for persistent workers
 * or a stream viewer for ephemeral workers.
 */

import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { X, Maximize2, Minimize2, MoreVertical, Terminal, Radio, Play, Square, RefreshCw, CirclePause, AlertCircle, ArrowLeftRight, RotateCw, MessageSquare, MessageSquareOff, History } from 'lucide-react';
import type { WorkspacePane as WorkspacePaneType, PaneStatus } from './types';
import { XTerminal, type XTerminalHandle } from '../terminal/XTerminal';
import { StreamViewer } from './StreamViewer';
import { TerminalInput } from './TerminalInput';
import { Tooltip } from '@stoneforge/ui';
import { SessionHistoryModal } from './SessionHistoryModal';
import { useAgentStatus, useStartAgentSession, useStopAgentSession, useInterruptAgentSession, useResumeAgentSession } from '../../api/hooks/useAgents';

export interface WorkspacePaneProps {
  pane: WorkspacePaneType;
  isActive: boolean;
  isMaximized: boolean;
  /** Whether the pane is in Single (tabbed) mode */
  isSingleMode?: boolean;
  /** Whether dragging is enabled for this pane */
  draggable?: boolean;
  onClose: () => void;
  onMaximize: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  onStatusChange: (status: PaneStatus) => void;
  /** Drag event handlers - applied to header only (drag source, not drop target) */
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

/** Methods exposed via ref */
export interface WorkspacePaneHandle {
  /** Refresh the terminal by re-fitting to current dimensions */
  refresh: () => void;
}

/** Status indicator colors */
const statusColors: Record<PaneStatus, string> = {
  disconnected: 'bg-gray-400',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
};

/** Status text */
const statusText: Record<PaneStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Error',
};

/** Role badge styles */
const roleBadgeStyles: Record<string, { bg: string; text: string; icon: typeof Terminal }> = {
  director: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', icon: Terminal },
  worker: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: Terminal },
  steward: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: Radio },
};

export const WorkspacePane = forwardRef<WorkspacePaneHandle, WorkspacePaneProps>(function WorkspacePane({
  pane,
  isActive,
  isMaximized,
  isSingleMode = false,
  draggable = false,
  onClose,
  onMaximize,
  onMinimize,
  onFocus,
  onStatusChange,
  onDragStart,
  onDragEnd,
}, ref) {
  const [showMenu, setShowMenu] = useState(false);
  const [showTextbox, setShowTextbox] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Track the current session ID, persisting even after session ends for transcript display
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  // Track the provider session ID for resuming (separate from internal session ID)
  const [currentProviderSessionId, setCurrentProviderSessionId] = useState<string | undefined>(undefined);
  // Track if we're viewing a session that has ended (for showing transcript without overlay)
  const [viewingEndedSession, setViewingEndedSession] = useState(false);
  const terminalRef = useRef<XTerminalHandle>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  // Session status and controls for workers (not director - that has its own panel)
  const { data: statusData } = useAgentStatus(pane.agentRole !== 'director' ? pane.agentId : undefined);
  const startSession = useStartAgentSession();
  const stopSession = useStopAgentSession();
  const interruptSession = useInterruptAgentSession();
  const resumeSession = useResumeAgentSession();

  const hasActiveSession = statusData?.hasActiveSession ?? false;

  // Update currentSessionId and providerSessionId when active session changes
  useEffect(() => {
    if (statusData?.activeSession?.id) {
      setCurrentSessionId(statusData.activeSession.id);
      setCurrentProviderSessionId(statusData.activeSession.providerSessionId);
      setViewingEndedSession(false);
    } else if (currentSessionId && !hasActiveSession) {
      // Session just ended, keep the IDs for transcript display and potential resume
      setViewingEndedSession(true);
    }
  }, [statusData?.activeSession?.id, statusData?.activeSession?.providerSessionId, hasActiveSession, currentSessionId]);

  const handleStartSession = useCallback(async () => {
    try {
      const dims = terminalRef.current?.getDimensions();
      await startSession.mutateAsync({
        agentId: pane.agentId,
        interactive: pane.paneType === 'terminal',
        ...(dims && { cols: dims.cols, rows: dims.rows }),
      });
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  }, [pane.agentId, pane.paneType, startSession]);

  const handleStopSession = useCallback(async () => {
    try {
      await stopSession.mutateAsync({ agentId: pane.agentId, graceful: true });
      // After explicit stop, reset to idle state instead of showing the dead terminal
      setCurrentSessionId(undefined);
      setCurrentProviderSessionId(undefined);
      setViewingEndedSession(false);
    } catch (err) {
      console.error('Failed to stop session:', err);
    }
  }, [pane.agentId, stopSession]);

  // View a session's transcript (can be resumed by sending a message)
  const handleViewSession = useCallback((sessionId: string, providerSessionId?: string) => {
    setCurrentSessionId(sessionId);
    setCurrentProviderSessionId(providerSessionId);
    setViewingEndedSession(true);
    setShowHistory(false);
  }, []);

  // Resume a session when user sends a message from the chat input
  const handleResumeWithMessage = useCallback(async (providerSessionId: string, message: string) => {
    try {
      setViewingEndedSession(false);
      await resumeSession.mutateAsync({
        agentId: pane.agentId,
        providerSessionId,
        resumePrompt: message,
      });
    } catch (err) {
      console.error('Failed to resume session:', err);
      // Don't try to start a fresh session - the issue is likely with the stored providerSessionId
      setViewingEndedSession(true);
      throw err;
    }
  }, [pane.agentId, resumeSession]);

  // Use ref to avoid recreating callback when onStatusChange prop changes
  // This prevents WebSocket reconnection loops caused by inline arrow functions in parent
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Escape key handler for interrupting active sessions
  useEffect(() => {
    if (!isFocused || !hasActiveSession || pane.agentRole === 'director') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !interruptSession.isPending) {
        e.preventDefault();
        e.stopPropagation();
        interruptSession.mutate({ agentId: pane.agentId });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, hasActiveSession, pane.agentId, pane.agentRole, interruptSession]);

  const handleStatusChange = useCallback((status: 'disconnected' | 'connecting' | 'connected' | 'error') => {
    onStatusChangeRef.current(status);
  }, []);

  // Refresh the terminal (re-fits to current dimensions)
  const handleRefresh = useCallback(() => {
    terminalRef.current?.refresh();
  }, []);

  // Send input to the terminal (for persistent worker textbox)
  const handleSendTerminalInput = useCallback((message: string) => {
    // Send the message, then send carriage return as a separate message to execute
    terminalRef.current?.sendInput(message);
    terminalRef.current?.sendInput('\r');
  }, []);

  // Toggle textbox visibility
  const handleToggleTextbox = useCallback(() => {
    setShowTextbox(prev => !prev);
    setShowMenu(false);
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    refresh: handleRefresh,
  }), [handleRefresh]);

  const roleStyle = roleBadgeStyles[pane.agentRole] || roleBadgeStyles.worker;
  const RoleIcon = roleStyle.icon;

  return (
    <div
      ref={paneRef}
      tabIndex={0}
      className={`
        flex flex-col h-full
        rounded-lg border overflow-hidden
        transition-all duration-150
        ${isActive
          ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30'
          : 'border-[var(--color-border)]'
        }
        bg-[var(--color-bg-secondary)]
        focus:outline-none
      `}
      onClick={onFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      data-testid={`workspace-pane-${pane.id}`}
      data-pane-id={pane.id}
      data-agent-id={pane.agentId}
      data-pane-type={pane.paneType}
    >
      {/* Pane Header */}
      <div
        className={`
          flex items-center justify-between
          px-3 py-2
          border-b border-[var(--color-border)]
          bg-[var(--color-surface)]
          ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
        `}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        data-testid="pane-header"
      >
        {/* Left: Agent info */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Status indicator - shows agent session status, not just connection status */}
          <div
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              pane.agentRole === 'director'
                ? statusColors[pane.status]  // Director uses its own panel for session management
                : hasActiveSession
                  ? statusColors[pane.status]  // Agent running: show connection status
                  : 'bg-gray-400'  // Agent not running: always grey
            }`}
            title={
              pane.agentRole === 'director'
                ? statusText[pane.status]
                : hasActiveSession
                  ? statusText[pane.status]
                  : 'Session not running'
            }
          />

          {/* Role badge */}
          <span className={`
            inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0
            ${roleStyle.bg} ${roleStyle.text}
          `}>
            <RoleIcon className="w-3 h-3" />
            {pane.agentRole}
          </span>

          {/* Agent name */}
          <span
            className="text-sm font-mono text-[var(--color-text)] truncate"
            title={pane.agentName}
          >
            {pane.agentName}
          </span>

          {/* Worker mode badge */}
          {pane.workerMode && (
            <span className="
              px-1.5 py-0.5 rounded text-xs
              bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)]
              flex-shrink-0
            ">
              {pane.workerMode}
            </span>
          )}

        </div>

        {/* Right: Window controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Session controls for workers (not director) */}
          {pane.agentRole !== 'director' && (
            <>
              {!hasActiveSession ? (
                <Tooltip content="Start Session" side="bottom">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartSession();
                    }}
                    disabled={startSession.isPending}
                    className="
                      p-1 rounded
                      text-green-600 dark:text-green-400
                      hover:bg-[var(--color-surface-hover)]
                      transition-colors
                      disabled:opacity-50
                    "
                    title="Start Session"
                    data-testid="pane-start-session"
                  >
                    {startSession.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content="Stop Session" side="bottom">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStopSession();
                    }}
                    disabled={stopSession.isPending}
                    className="
                      p-1 rounded
                      text-red-600 dark:text-red-400
                      hover:bg-[var(--color-surface-hover)]
                      transition-colors
                      disabled:opacity-50
                    "
                    title="Stop Session"
                    data-testid="pane-stop-session"
                  >
                    {stopSession.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </Tooltip>
              )}
            </>
          )}

          {/* Maximize/Minimize button (hidden in single/tabbed mode) */}
          {!isSingleMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                isMaximized ? onMinimize() : onMaximize();
              }}
              className="
                p-1 rounded
                text-[var(--color-text-tertiary)]
                hover:text-[var(--color-text)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors
              "
              title={isMaximized ? 'Restore' : 'Maximize'}
              data-testid="pane-maximize-btn"
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* More menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="
                p-1 rounded
                text-[var(--color-text-tertiary)]
                hover:text-[var(--color-text)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors
              "
              title="More options"
              data-testid="pane-menu-btn"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div
                  className="
                    absolute right-0 top-full mt-1 z-20
                    min-w-40 py-1 rounded-md shadow-lg
                    bg-[var(--color-bg)] border border-[var(--color-border)]
                  "
                  data-testid="pane-menu"
                >
                  {/* Refresh button - refreshes terminal by re-fitting to container */}
                  {pane.paneType === 'terminal' && pane.agentRole !== 'director' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        handleRefresh();
                      }}
                      className="
                        w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
                        text-[var(--color-text-secondary)]
                        hover:bg-[var(--color-surface-hover)]
                      "
                    >
                      <RotateCw className="w-4 h-4" />
                      Refresh
                    </button>
                  )}
                  {/* Show/Hide textbox - for persistent workers */}
                  {pane.paneType === 'terminal' && pane.agentRole !== 'director' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTextbox();
                      }}
                      className="
                        w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
                        text-[var(--color-text-secondary)]
                        hover:bg-[var(--color-surface-hover)]
                      "
                      data-testid="pane-toggle-textbox"
                    >
                      {showTextbox ? (
                        <>
                          <MessageSquareOff className="w-4 h-4" />
                          Hide textbox
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" />
                          Show textbox
                        </>
                      )}
                    </button>
                  )}
                  {/* View history - for ephemeral workers and stewards */}
                  {(pane.workerMode === 'ephemeral' || pane.agentRole === 'steward') && pane.agentRole !== 'director' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        setShowHistory(true);
                      }}
                      className="
                        w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
                        text-[var(--color-text-secondary)]
                        hover:bg-[var(--color-surface-hover)]
                      "
                      data-testid="pane-view-history"
                    >
                      <History className="w-4 h-4" />
                      View history
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      // Build popout URL with pane info for "pop back in" functionality
                      const params = new URLSearchParams({
                        agent: pane.agentId,
                        type: pane.paneType,
                        name: pane.agentName,
                        role: pane.agentRole,
                        ...(pane.workerMode && { mode: pane.workerMode }),
                      });
                      const popoutUrl = `/popout/terminal?${params.toString()}`;
                      // Open terminal in a new window
                      window.open(
                        popoutUrl,
                        `terminal-${pane.agentId}`,
                        'width=800,height=600,menubar=no,toolbar=no,location=no,status=no'
                      );
                      // Remove pane from workspace
                      onClose();
                    }}
                    className="
                      w-full px-3 py-1.5 text-left text-sm flex items-center gap-2
                      text-[var(--color-text-secondary)]
                      hover:bg-[var(--color-surface-hover)]
                    "
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    Pop out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="
              p-1 rounded
              text-[var(--color-text-tertiary)]
              hover:text-red-500
              hover:bg-red-50 dark:hover:bg-red-900/20
              transition-colors
            "
            title="Close pane"
            data-testid="pane-close-btn"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col" data-testid="pane-content">
        {pane.agentRole === 'director' ? (
          // Director has a dedicated panel - show message instead of terminal
          <div className="flex flex-col items-center justify-center flex-1 p-6 text-center bg-[#1a1a1a]">
            <Terminal className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
            <p className="text-sm text-[var(--color-text-secondary)] mb-2">
              Director Terminal
            </p>
            <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
              Use the Director panel on the right for interactive terminal access.
            </p>
          </div>
        ) : pane.paneType === 'terminal' ? (
          <>
            <div className="flex-1 min-h-0">
              <XTerminal
                ref={terminalRef}
                agentId={pane.agentId}
                onStatusChange={handleStatusChange}
                interactive={true}
                autoFocus={true}
                controlsResize={true}
                data-testid={`terminal-${pane.id}`}
              />
            </div>
            {/* Textbox for persistent workers */}
            {showTextbox && (
              <TerminalInput
                isConnected={pane.status === 'connected' && hasActiveSession}
                onSend={handleSendTerminalInput}
                connectedPlaceholder="Type a command..."
                disconnectedPlaceholder="Start session to send commands"
                data-testid={`textbox-${pane.id}`}
              />
            )}
          </>
        ) : (
          <StreamViewer
            agentId={pane.agentId}
            agentName={pane.agentName}
            sessionId={currentSessionId}
            providerSessionId={currentProviderSessionId}
            hasActiveSession={hasActiveSession}
            onResumeWithMessage={handleResumeWithMessage}
            onStatusChange={handleStatusChange}
            data-testid={`stream-${pane.id}`}
          />
        )}

        {/* Idle/Stopped/Shutting down overlay for non-director agents */}
        {/* Don't show overlay when viewing an ended session or resuming (so transcript remains visible during transitions) */}
        {pane.agentRole !== 'director' && (!hasActiveSession || stopSession.isPending) && !viewingEndedSession && !resumeSession.isPending && (
          <div
            className="
              absolute inset-0 z-10
              flex flex-col items-center justify-center
              bg-[#1a1a1a]/95 backdrop-blur-sm
              overflow-y-auto p-3
            "
            data-testid="pane-idle-overlay"
          >
            {stopSession.isPending ? (
              // Shutting down state
              <>
                <div className="relative mb-3">
                  <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full scale-150" />
                  <div className="
                    relative p-2.5 rounded-xl
                    bg-gradient-to-br from-[#252525] to-[#1a1a1a]
                    border border-[#333]
                    shadow-lg
                  ">
                    <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
                  </div>
                </div>

                <div className="text-center mb-3">
                  <h3 className="text-base font-medium text-[var(--color-text)] mb-0.5">
                    Shutting Down
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] max-w-[280px] px-2">
                    Gracefully stopping the session...
                  </p>
                </div>

                {/* Pulsing dots animation */}
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                </div>
              </>
            ) : (
              // Idle/Error state
              <>
                {/* Glow effect behind icon */}
                <div className="relative mb-3 flex-shrink-0">
                  <div className="absolute inset-0 bg-[var(--color-primary)]/20 blur-xl rounded-full scale-150" />
                  <div className="
                    relative p-2.5 rounded-xl
                    bg-gradient-to-br from-[#252525] to-[#1a1a1a]
                    border border-[#333]
                    shadow-lg
                  ">
                    {pane.status === 'error' ? (
                      <AlertCircle className="w-7 h-7 text-red-400" />
                    ) : (
                      <CirclePause className="w-7 h-7 text-[var(--color-text-muted)]" />
                    )}
                  </div>
                </div>

                {/* Status text */}
                <div className="text-center mb-3 flex-shrink-0">
                  <h3 className="text-base font-medium text-[var(--color-text)] mb-0.5">
                    {pane.status === 'error' ? 'Session Error' : 'Session Idle'}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] max-w-[280px] px-2">
                    {pane.status === 'error'
                      ? 'The agent session encountered an error.'
                      : `Start a session to interact with ${pane.agentName}.`
                    }
                  </p>
                </div>

                {/* Start button */}
                <button
                  onClick={handleStartSession}
                  disabled={startSession.isPending}
                  className="
                    inline-flex items-center gap-2 flex-shrink-0
                    px-4 py-2 rounded-lg
                    bg-gradient-to-r from-green-600 to-green-500
                    hover:from-green-500 hover:to-green-400
                    text-white font-medium text-sm
                    shadow-lg shadow-green-500/25
                    transition-all duration-200
                    hover:scale-105 hover:shadow-green-500/40
                    disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed
                    focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:ring-offset-2 focus:ring-offset-[#1a1a1a]
                  "
                  data-testid="pane-overlay-start-btn"
                >
                  {startSession.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Start Session
                    </>
                  )}
                </button>

                {/* Agent info badge */}
                <div className="
                  mt-3 px-2.5 py-1 rounded-full flex-shrink-0
                  bg-[#252525] border border-[#333]
                  text-[10px] text-[var(--color-text-tertiary)]
                ">
                  {pane.workerMode === 'persistent' ? 'Persistent Worker' : 'Ephemeral Worker'} • {pane.paneType === 'terminal' ? 'Interactive' : 'Stream'}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Session History Modal - for ephemeral workers and stewards */}
      {(pane.workerMode === 'ephemeral' || pane.agentRole === 'steward') && (
        <SessionHistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          agentId={pane.agentId}
          agentName={pane.agentName}
          sessions={statusData?.recentHistory ?? []}
          onViewSession={handleViewSession}
        />
      )}
    </div>
  );
});
