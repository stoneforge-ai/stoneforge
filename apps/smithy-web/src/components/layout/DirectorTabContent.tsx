/**
 * DirectorTabContent - Terminal, idle overlay, session controls, and PendingMessagesQueue
 * for a single director agent.
 *
 * Extracted from DirectorPanel to support multiple concurrent director tabs.
 * CRITICAL: This component must stay mounted (use CSS hidden, not conditional rendering)
 * to preserve WebSocket/PTY connections.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Play,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  CirclePause,
} from 'lucide-react';
import { XTerminal, type TerminalStatus, type XTerminalHandle } from '../terminal';
import { useStartAgentSession, useStopAgentSession, useResumeAgentSession, type DirectorInfo } from '../../api/hooks/useAgents';
import { PendingMessagesQueue } from './PendingMessagesQueue';

interface DirectorTabContentProps {
  info: DirectorInfo;
  isVisible: boolean;
  showMessagesQueue: boolean;
  onTerminalReady: (sendInput: (text: string) => void) => void;
}

export function DirectorTabContent({ info, isVisible, showMessagesQueue, onTerminalReady }: DirectorTabContentProps) {
  const { director, hasActiveSession, hasResumableSession, error } = info;
  const lastResumableSession = info.lastResumableSession as { providerSessionId?: string } | null;

  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('disconnected');
  const [resumeError, setResumeError] = useState<string | null>(null);
  const terminalRef = useRef<XTerminalHandle>(null);

  const startSession = useStartAgentSession();
  const stopSession = useStopAgentSession();
  const resumeSession = useResumeAgentSession();

  // Session control handlers
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

  const handleTerminalStatusChange = useCallback((newStatus: TerminalStatus) => {
    setTerminalStatus(newStatus);
  }, []);

  // Auto-refresh terminal on connection
  useEffect(() => {
    if (terminalStatus === 'connected') {
      const timer = setTimeout(() => {
        terminalRef.current?.refresh();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [terminalStatus]);

  // Refresh terminal when tab becomes visible to fix auto-fit
  useEffect(() => {
    if (isVisible && terminalStatus === 'connected') {
      const timer = setTimeout(() => {
        terminalRef.current?.refresh();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible, terminalStatus]);

  const handleSendCommand = useCallback((command: string) => {
    terminalRef.current?.sendInput(command);
  }, []);

  // Notify parent when terminal sendInput is available
  useEffect(() => {
    if (terminalStatus === 'connected' && terminalRef.current) {
      onTerminalReady((text: string) => {
        terminalRef.current?.sendInput(text);
      });
    }
  }, [terminalStatus, onTerminalReady]);

  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden ${isVisible ? '' : 'hidden'}`}
      data-testid={`director-tab-content-${director.id}`}
    >
      {/* Main content — messages queue + terminal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Pending Messages Queue */}
        {showMessagesQueue && (
          <div
            className="border-b border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden"
            style={{ height: '280px', minHeight: '200px' }}
            data-testid={`pending-messages-container-${director.id}`}
          >
            <PendingMessagesQueue
              directorId={director.id}
              hasActiveSession={hasActiveSession}
              onSendCommand={handleSendCommand}
            />
          </div>
        )}

        {/* Terminal Area */}
        <div className="flex-1 p-2 overflow-hidden" data-testid={`director-terminal-container-${director.id}`}>
          <div className="h-full rounded-lg bg-[#1a1a1a] border border-[var(--color-border)] flex flex-col overflow-hidden">
            {/* Terminal body */}
            <div className="flex-1 overflow-hidden relative">
              {error ? (
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
                    agentId={director.id}
                    onStatusChange={handleTerminalStatusChange}
                    theme="dark"
                    fontSize={12}
                    autoFit={true}
                    interactive={true}
                    autoFocus={isVisible}
                    controlsResize={true}
                    data-testid={`director-xterminal-${director.id}`}
                  />

                  {/* Idle/Shutting down overlay */}
                  {(!hasActiveSession || stopSession.isPending) && (
                    <div
                      className="
                        absolute inset-0 z-10
                        flex flex-col items-center justify-center
                        bg-[#1a1a1a]/95 backdrop-blur-sm
                      "
                      data-testid={`director-idle-overlay-${director.id}`}
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
                            <div className="flex flex-col items-center gap-3">
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
                                data-testid={`director-overlay-resume-btn-${director.id}`}
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
                                data-testid={`director-overlay-new-session-btn-${director.id}`}
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

                              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                                Resume picks up where your last session left off
                              </p>
                            </div>
                          ) : (
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
                              data-testid={`director-overlay-start-btn-${director.id}`}
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
    </div>
  );
}

export default DirectorTabContent;
