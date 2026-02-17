/**
 * DirectorPanel - Right sidebar panel for Director agent terminal
 * Collapsible panel that shows the Director agent's interactive terminal
 * and a pending messages queue for operator-controlled inbox reading.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  PanelRightClose,
  Terminal,
  Circle,
  Play,
  Square,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  CirclePause,
  Pickaxe,
  Mail,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';
import { XTerminal, type TerminalStatus, type XTerminalHandle } from '../terminal';
import { useDirector, useStartAgentSession, useStopAgentSession, useResumeAgentSession } from '../../api/hooks/useAgents';
import { useAgentInboxCount } from '../../api/hooks/useAgentInbox';
import { PendingMessagesQueue } from './PendingMessagesQueue';

// Panel width constraints
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 384; // w-96
const STORAGE_KEY = 'orchestrator-director-panel-width';

type DirectorStatus = 'idle' | 'running' | 'error' | 'connecting' | 'no-director';

interface DirectorPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export function DirectorPanel({ collapsed = false, onToggle, isMaximized = false, onToggleMaximize }: DirectorPanelProps) {
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('disconnected');
  const [showMessagesQueue, setShowMessagesQueue] = useState(false);
  const { director, hasActiveSession, hasResumableSession, lastResumableSession, isLoading, error } = useDirector();
  const startSession = useStartAgentSession();
  const stopSession = useStopAgentSession();
  const resumeSession = useResumeAgentSession();
  const [resumeError, setResumeError] = useState<string | null>(null);
  const terminalRef = useRef<XTerminalHandle>(null);

  // Get unread message count for the director
  const { data: inboxCountData } = useAgentInboxCount(director?.id ?? null);

  // Panel width state with localStorage persistence
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        return parsed;
      }
    }
    return DEFAULT_WIDTH;
  });

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Persist width to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: width };
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    // Set cursor on body during resize for smooth dragging
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      // Since panel is on right side, dragging left increases width
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Derive the director status from various sources
  const getStatus = (): DirectorStatus => {
    if (error || terminalStatus === 'error') return 'error';
    if (isLoading || terminalStatus === 'connecting') return 'connecting';
    if (!director) return 'no-director';
    if (hasActiveSession && terminalStatus === 'connected') return 'running';
    return 'idle';
  };

  const status = getStatus();

  const statusColor = {
    idle: 'text-[var(--color-text-tertiary)]',
    running: 'text-[var(--color-success)]',
    error: 'text-[var(--color-danger)]',
    connecting: 'text-[var(--color-warning)]',
    'no-director': 'text-[var(--color-text-muted)]',
  }[status];

  const statusLabel = {
    idle: 'Idle',
    running: 'Running',
    error: 'Error',
    connecting: 'Connecting...',
    'no-director': 'No Director',
  }[status];

  const handleStartSession = useCallback(async () => {
    if (!director?.id) return;
    setResumeError(null);
    try {
      const dims = terminalRef.current?.getDimensions();
      await startSession.mutateAsync({
        agentId: director.id,
        ...(dims && { cols: dims.cols, rows: dims.rows }),
      });
    } catch (err) {
      console.error('Failed to start director session:', err);
    }
  }, [director?.id, startSession]);

  const handleResumeSession = useCallback(async () => {
    if (!director?.id || !lastResumableSession?.providerSessionId) return;
    setResumeError(null);
    try {
      await resumeSession.mutateAsync({
        agentId: director.id,
        providerSessionId: lastResumableSession.providerSessionId,
      });
    } catch (err) {
      console.error('Failed to resume director session:', err);
      setResumeError(err instanceof Error ? err.message : 'Resume failed');
    }
  }, [director?.id, lastResumableSession?.providerSessionId, resumeSession]);

  const handleStopSession = useCallback(async () => {
    if (!director?.id) return;
    try {
      await stopSession.mutateAsync({ agentId: director.id, graceful: true });
    } catch (err) {
      console.error('Failed to stop director session:', err);
    }
  }, [director?.id, stopSession]);

  const handleRestartSession = useCallback(async () => {
    if (!director?.id) return;
    try {
      await stopSession.mutateAsync({ agentId: director.id, graceful: true });
      const dims = terminalRef.current?.getDimensions();
      await startSession.mutateAsync({
        agentId: director.id,
        ...(dims && { cols: dims.cols, rows: dims.rows }),
      });
    } catch (err) {
      console.error('Failed to restart director session:', err);
    }
  }, [director?.id, stopSession, startSession]);

  const handleTerminalStatusChange = useCallback((newStatus: TerminalStatus) => {
    setTerminalStatus(newStatus);
  }, []);

  // Auto-refresh terminal on connection to fix rendering issues during startup
  // This triggers the resize-cycle trick (shrink then restore) which sends SIGWINCH
  // to the shell and forces a proper redraw of the terminal content.
  useEffect(() => {
    if (terminalStatus === 'connected') {
      const timer = setTimeout(() => {
        terminalRef.current?.refresh();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [terminalStatus]);

  // Refresh terminal when maximize state changes to allow auto-fit to recalculate
  useEffect(() => {
    if (terminalStatus === 'connected') {
      const timer = setTimeout(() => {
        terminalRef.current?.refresh();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMaximized, terminalStatus]);

  const handleSiftBacklog = useCallback(() => {
    if (!terminalRef.current) return;
    // Send the command text first
    terminalRef.current.sendInput('Use your sift-backlog skill');
    // Send carriage return after a small delay to ensure it registers as the submit action
    setTimeout(() => {
      terminalRef.current?.sendInput('\r');
    }, 200);
  }, []);

  // Toggle messages queue visibility
  const handleToggleMessagesQueue = useCallback(() => {
    setShowMessagesQueue((prev) => !prev);
  }, []);

  // Send command to director terminal
  const handleSendCommand = useCallback((command: string) => {
    terminalRef.current?.sendInput(command);
  }, []);

  // Unread message count
  const unreadCount = inboxCountData?.count ?? 0;

  // Handle collapsing a maximized panel: minimize first, then collapse
  const handleCollapse = useCallback(() => {
    if (isMaximized && onToggleMaximize) {
      onToggleMaximize();
    }
    onToggle?.();
  }, [isMaximized, onToggleMaximize, onToggle]);

  if (collapsed) {
    return (
      <aside
        className="flex flex-col items-center py-3 w-12 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
        data-testid="director-panel-collapsed"
      >
        <Tooltip content="Open Director Panel" side="left">
          <button
            onClick={onToggle}
            className="relative p-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            aria-label="Open Director Panel"
            data-testid="director-panel-expand"
          >
            <Terminal className="w-5 h-5" />
            {/* Status indicator dot */}
            <Circle
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 fill-current ${statusColor}`}
            />
            {/* Unread messages indicator badge */}
            {unreadCount > 0 && (
              <span
                className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)] text-white"
                data-testid="director-panel-collapsed-unread-badge"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside
      className={`
        relative flex flex-col bg-[var(--color-bg-secondary)]
        ${isMaximized ? 'flex-1' : 'border-l border-[var(--color-border)]'}
      `}
      style={isMaximized ? undefined : { width: `${width}px` }}
      data-testid="director-panel"
    >
      {/* Resize handle - hidden when maximized */}
      {!isMaximized && (
        <div
          className={`
            absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10
            hover:bg-[var(--color-primary)] hover:opacity-50
            transition-colors duration-150
            ${isResizing ? 'bg-[var(--color-primary)] opacity-50' : ''}
          `}
          onMouseDown={handleResizeStart}
          data-testid="director-panel-resize-handle"
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <span className="text-sm font-medium text-[var(--color-text)]">Director</span>
          <span className={`flex items-center gap-1 text-xs ${statusColor}`}>
            <Circle className="w-2 h-2 fill-current" />
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Sift Backlog Button - left-most action when session is active */}
          {hasActiveSession && (
            <Tooltip content="Sift Backlog" side="bottom">
              <button
                onClick={handleSiftBacklog}
                className="p-1.5 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
                aria-label="Sift Backlog"
                data-testid="director-sift-backlog"
              >
                <Pickaxe className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
          {/* Pending Messages Queue Toggle */}
          {director && (
            <Tooltip
              content={showMessagesQueue ? 'Hide pending messages' : 'Show pending messages'}
              side="bottom"
            >
              <button
                onClick={handleToggleMessagesQueue}
                className={`relative p-1.5 rounded-md transition-colors duration-150 ${
                  showMessagesQueue
                    ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
                aria-label={showMessagesQueue ? 'Hide pending messages' : 'Show pending messages'}
                data-testid="toggle-messages-queue"
              >
                <Mail className="w-4 h-4" />
                {/* Unread count badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[var(--color-primary)] text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </Tooltip>
          )}
          {/* Session Controls */}
          {director && (
            <>
              {!hasActiveSession ? (
                <Tooltip content="Start Director Session" side="bottom">
                  <button
                    onClick={handleStartSession}
                    disabled={startSession.isPending}
                    className="p-1.5 rounded-md text-[var(--color-success)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                    aria-label="Start Director Session"
                    data-testid="director-start-session"
                  >
                    {startSession.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                </Tooltip>
              ) : (
                <>
                  <Tooltip content="Restart Director Session" side="bottom">
                    <button
                      onClick={handleRestartSession}
                      disabled={stopSession.isPending || startSession.isPending}
                      className="p-1.5 rounded-md text-[var(--color-warning)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                      aria-label="Restart Director Session"
                      data-testid="director-restart-session"
                    >
                      {(stopSession.isPending || startSession.isPending) ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip content="Stop Director Session" side="bottom">
                    <button
                      onClick={handleStopSession}
                      disabled={stopSession.isPending}
                      className="p-1.5 rounded-md text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                      aria-label="Stop Director Session"
                      data-testid="director-stop-session"
                    >
                      {stopSession.isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </Tooltip>
                </>
              )}
            </>
          )}
          <Tooltip content={isMaximized ? "Restore Panel" : "Maximize Panel"} side="bottom">
            <button
              onClick={onToggleMaximize}
              className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label={isMaximized ? "Restore Panel" : "Maximize Panel"}
              data-testid="director-panel-maximize"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </Tooltip>
          <Tooltip content="Collapse Panel" side="left">
            <button
              onClick={handleCollapse}
              className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label="Collapse Director Panel"
              data-testid="director-panel-collapse"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main Content Area - Terminal or Messages Queue */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Pending Messages Queue - slides in from top when visible */}
        {showMessagesQueue && (
          <div
            className="border-b border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden"
            style={{ height: '280px', minHeight: '200px' }}
            data-testid="pending-messages-container"
          >
            <PendingMessagesQueue
              directorId={director?.id ?? null}
              hasActiveSession={hasActiveSession}
              onSendCommand={handleSendCommand}
            />
          </div>
        )}

        {/* Terminal Area */}
        <div className="flex-1 p-2 overflow-hidden" data-testid="director-terminal-container">
          <div className="h-full rounded-lg bg-[#1a1a1a] border border-[var(--color-border)] flex flex-col overflow-hidden">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[#252525]">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${hasActiveSession ? 'bg-green-500' : 'bg-red-500 opacity-50'}`} />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-50" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-50" />
              </div>
              <span className="text-xs text-gray-400 font-mono">
                {director?.name ?? 'director'}
              </span>
            </div>
          </div>

          {/* Terminal body */}
          <div className="flex-1 overflow-hidden relative">
            {status === 'no-director' || (isLoading && !director) ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                {isLoading ? (
                  <>
                    <RefreshCw className="w-8 h-8 text-[var(--color-text-muted)] mb-2 animate-spin" />
                    <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
                    <p className="text-sm text-[var(--color-text-muted)]">No Director agent found</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                      Register a Director agent to use this terminal
                    </p>
                  </>
                )}
              </div>
            ) : status === 'error' && error ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-2" />
                <p className="text-sm text-[var(--color-danger)]">Connection Error</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  {error.message}
                </p>
              </div>
            ) : (
              <>
                <XTerminal
                  ref={terminalRef}
                  agentId={director?.id}
                  onStatusChange={handleTerminalStatusChange}
                  theme="dark"
                  fontSize={12}
                  autoFit={true}
                  interactive={true}
                  autoFocus={true}
                  controlsResize={true}
                  data-testid="director-xterminal"
                />

                {/* Idle/Shutting down overlay */}
                {director && (!hasActiveSession || stopSession.isPending) && (
                  <div
                    className="
                      absolute inset-0 z-10
                      flex flex-col items-center justify-center
                      bg-[#1a1a1a]/95 backdrop-blur-sm
                    "
                    data-testid="director-idle-overlay"
                  >
                    {stopSession.isPending ? (
                      // Shutting down state
                      <>
                        <div className="relative mb-5">
                          <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full scale-150" />
                          <div className="
                            relative p-3 rounded-xl
                            bg-gradient-to-br from-[#252525] to-[#1a1a1a]
                            border border-[#333]
                            shadow-lg
                          ">
                            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                          </div>
                        </div>

                        <div className="text-center mb-5">
                          <h3 className="text-base font-medium text-[var(--color-text)] mb-1">
                            Shutting Down
                          </h3>
                          <p className="text-xs text-[var(--color-text-muted)] max-w-xs px-4">
                            Gracefully stopping the session...
                          </p>
                        </div>

                        {/* Pulsing dots animation */}
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                        </div>
                      </>
                    ) : (
                      // Idle state
                      <>
                        <div className="relative mb-5">
                          <div className="absolute inset-0 bg-[var(--color-primary)]/20 blur-xl rounded-full scale-150" />
                          <div className="
                            relative p-3 rounded-xl
                            bg-gradient-to-br from-[#252525] to-[#1a1a1a]
                            border border-[#333]
                            shadow-lg
                          ">
                            <CirclePause className="w-8 h-8 text-[var(--color-text-muted)]" />
                          </div>
                        </div>

                        <div className="text-center mb-5">
                          <h3 className="text-base font-medium text-[var(--color-text)] mb-1">
                            Director Idle
                          </h3>
                          <p className="text-xs text-[var(--color-text-muted)] max-w-xs px-4">
                            {hasResumableSession
                              ? 'Resume your previous session or start fresh.'
                              : 'Start a session to interact with the Director agent.'}
                          </p>
                        </div>

                        {/* Resume error message */}
                        {resumeError && (
                          <div className="mb-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400 max-w-xs text-center">
                            {resumeError}
                          </div>
                        )}

                        {hasResumableSession ? (
                          // Two-button layout when resumable session exists
                          <div className="flex flex-col items-center gap-3">
                            {/* Resume button - primary action */}
                            <button
                              onClick={handleResumeSession}
                              disabled={resumeSession.isPending || startSession.isPending}
                              className="
                                inline-flex items-center gap-2
                                px-5 py-2 rounded-lg
                                bg-gradient-to-r from-green-600 to-green-500
                                hover:from-green-500 hover:to-green-400
                                text-white font-medium text-sm
                                shadow-lg shadow-green-500/25
                                transition-all duration-200
                                hover:scale-105 hover:shadow-green-500/40
                                disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed
                                focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:ring-offset-2 focus:ring-offset-[#1a1a1a]
                              "
                              data-testid="director-overlay-resume-btn"
                            >
                              {resumeSession.isPending ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  Resuming...
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-4 h-4" />
                                  Resume Session
                                </>
                              )}
                            </button>

                            {/* New Session button - secondary action */}
                            <button
                              onClick={handleStartSession}
                              disabled={startSession.isPending || resumeSession.isPending}
                              className="
                                inline-flex items-center gap-2
                                px-4 py-1.5 rounded-md
                                border border-[#444] hover:border-[#555]
                                text-[var(--color-text-secondary)] text-xs
                                hover:text-[var(--color-text)]
                                transition-all duration-200
                                disabled:opacity-50 disabled:cursor-not-allowed
                                focus:outline-none focus:ring-2 focus:ring-[#444]/50 focus:ring-offset-2 focus:ring-offset-[#1a1a1a]
                              "
                              data-testid="director-overlay-new-session-btn"
                            >
                              {startSession.isPending ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Starting...
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3" />
                                  New Session
                                </>
                              )}
                            </button>

                            {/* Caption */}
                            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                              Resume picks up where your last session left off
                            </p>
                          </div>
                        ) : (
                          // Single button when no resumable session
                          <button
                            onClick={handleStartSession}
                            disabled={startSession.isPending}
                            className="
                              inline-flex items-center gap-2
                              px-5 py-2 rounded-lg
                              bg-gradient-to-r from-green-600 to-green-500
                              hover:from-green-500 hover:to-green-400
                              text-white font-medium text-sm
                              shadow-lg shadow-green-500/25
                              transition-all duration-200
                              hover:scale-105 hover:shadow-green-500/40
                              disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed
                              focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:ring-offset-2 focus:ring-offset-[#1a1a1a]
                            "
                            data-testid="director-overlay-start-btn"
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
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        </div>
      </div>
    </aside>
  );
}
