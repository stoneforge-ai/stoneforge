/**
 * SessionHistoryModal - Display past chat sessions for an agent
 *
 * Shows a list of past sessions that can be selected to view their transcript.
 */

import { useState, useEffect, useMemo } from 'react';
import { X, History, Clock, ChevronRight, MessageSquare, Trash2, Eye } from 'lucide-react';
import type { SessionRecord } from '../../api/types';
import type { StreamEvent } from './types';
import { fetchSessionMessages } from '../../api/hooks/useAgents';
import { TranscriptViewer, TranscriptEvent, messageToStreamEvent } from '../shared/TranscriptViewer';

// Re-export for backward compatibility
export { TranscriptViewer, TranscriptEvent, messageToStreamEvent };

// Storage key prefix for session transcripts
const SESSION_STORAGE_PREFIX = 'stoneforge-session-transcript-';
const MAX_STORED_SESSIONS = 50;

export interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  sessions: SessionRecord[];
  /** Called when user wants to view a session's transcript (can be resumed by sending a message) */
  onViewSession?: (sessionId: string, providerSessionId?: string) => void;
}

/** Get transcript from localStorage */
export function getSessionTranscript(sessionId: string): StreamEvent[] {
  try {
    const stored = localStorage.getItem(`${SESSION_STORAGE_PREFIX}${sessionId}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error('[SessionHistory] Failed to load transcript:', err);
  }
  return [];
}

/** Save transcript to localStorage (only if there are events) */
export function saveSessionTranscript(sessionId: string, events: StreamEvent[]): void {
  // Don't save empty transcripts
  if (events.length === 0) {
    return;
  }
  try {
    localStorage.setItem(`${SESSION_STORAGE_PREFIX}${sessionId}`, JSON.stringify(events));
    cleanupOldTranscripts();
  } catch (err) {
    console.error('[SessionHistory] Failed to save transcript:', err);
  }
}

/** Remove old transcripts to prevent localStorage from growing too large */
function cleanupOldTranscripts(): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(SESSION_STORAGE_PREFIX));
    if (keys.length > MAX_STORED_SESSIONS) {
      // Sort by key (which includes session ID) and remove oldest
      const toRemove = keys.slice(0, keys.length - MAX_STORED_SESSIONS);
      toRemove.forEach(key => localStorage.removeItem(key));
    }
  } catch (err) {
    console.error('[SessionHistory] Failed to cleanup transcripts:', err);
  }
}

/** Clear a specific session transcript */
function clearSessionTranscript(sessionId: string): void {
  try {
    localStorage.removeItem(`${SESSION_STORAGE_PREFIX}${sessionId}`);
  } catch (err) {
    console.error('[SessionHistory] Failed to clear transcript:', err);
  }
}

/** Format session date for display */
function formatSessionDate(timestamp: number | string | undefined): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  if (isToday) {
    return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Extract task title from a prompt that contains task assignment text */
function extractTaskTitle(text: string): string | null {
  // Look for "**Title**: {title}" pattern in the prompt
  const titleMatch = text.match(/\*\*Title\*\*:\s*(.+?)(?:\n|$)/);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }
  // Also try without markdown: "Title: {title}"
  const plainTitleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/);
  if (plainTitleMatch?.[1]) {
    return plainTitleMatch[1].trim();
  }
  return null;
}

/** Extract task ID from a prompt that contains task assignment text */
function extractTaskId(text: string): string | null {
  // Look for "**Task ID**: {id}" pattern in the prompt
  const idMatch = text.match(/\*\*Task ID\*\*:\s*(.+?)(?:\n|$)/);
  if (idMatch?.[1]) {
    return idMatch[1].trim();
  }
  // Also try without markdown: "Task ID: {id}"
  const plainIdMatch = text.match(/Task ID:\s*(.+?)(?:\n|$)/);
  if (plainIdMatch?.[1]) {
    return plainIdMatch[1].trim();
  }
  return null;
}

/** Get the first meaningful text content from an event */
function getEventText(event: StreamEvent): string | undefined {
  // Check content field first
  if (event.content?.trim()) {
    const content = event.content.trim();
    // If this looks like a task assignment prompt, extract just the title
    if (content.includes('You have been assigned the following task')) {
      const title = extractTaskTitle(content);
      if (title) {
        return title;
      }
    }
    return content;
  }
  // Check toolInput for tool_use events - might contain the task description
  if (event.type === 'tool_use' && event.toolInput) {
    const input = typeof event.toolInput === 'string'
      ? event.toolInput
      : JSON.stringify(event.toolInput);
    if (input.trim()) {
      return input.trim();
    }
  }
  // Check toolOutput for tool_result events
  if (event.type === 'tool_result' && event.toolOutput?.trim()) {
    return event.toolOutput.trim();
  }
  return undefined;
}

/** Extract task name from worktree path, or first meaningful message from transcript */
function extractSessionName(session: SessionRecord, transcript: StreamEvent[]): string {
  // Try to extract from worktree (format: usually contains task info)
  if (session.worktree) {
    // Extract the last part of the worktree path
    const parts = session.worktree.split('/');
    const worktreeName = parts[parts.length - 1];
    // Clean up common prefixes - only use if it's not a generic worktree name
    if (worktreeName && !worktreeName.startsWith('worktree-')) {
      return worktreeName.replace(/-/g, ' ');
    }
  }

  // Try to get the first user message from the transcript
  const firstUserMessage = transcript.find(e => e.type === 'user');
  const userText = firstUserMessage ? getEventText(firstUserMessage) : undefined;
  if (userText) {
    if (userText.length > 100) {
      return userText.slice(0, 100) + '...';
    }
    return userText;
  }

  // Try to get the first assistant message as fallback (might describe the task)
  const firstAssistantMessage = transcript.find(e => e.type === 'assistant');
  const assistantText = firstAssistantMessage ? getEventText(firstAssistantMessage) : undefined;
  if (assistantText) {
    // Take first line or sentence
    const firstLine = assistantText.split('\n')[0].split('.')[0];
    if (firstLine.length > 100) {
      return firstLine.slice(0, 100) + '...';
    }
    if (firstLine.length > 0) {
      return firstLine;
    }
  }

  // Try any event with meaningful text as a last resort
  for (const event of transcript) {
    if (event.type === 'system' || event.type === 'error') continue;
    const text = getEventText(event);
    if (text) {
      const firstLine = text.split('\n')[0];
      if (firstLine.length > 100) {
        return firstLine.slice(0, 100) + '...';
      }
      if (firstLine.length > 0) {
        return firstLine;
      }
    }
  }

  // Last fallback to formatted date
  const date = new Date(session.startedAt || session.createdAt);
  return `Session from ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

interface SessionItemProps {
  session: SessionRecord;
  transcript: StreamEvent[];
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onOpen?: () => void;
}

function SessionItem({ session, transcript, isSelected, onClick, onDelete, onOpen }: SessionItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const sessionName = extractSessionName(session, transcript);
  const formattedDate = formatSessionDate(session.startedAt || session.createdAt);

  // Extract task ID from the first user message if it contains task assignment
  const taskId = useMemo(() => {
    const firstUserMessage = transcript.find(e => e.type === 'user' && e.content);
    if (firstUserMessage?.content?.includes('You have been assigned the following task')) {
      return extractTaskId(firstUserMessage.content);
    }
    return null;
  }, [transcript]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div
      className={`
        group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors
        ${isSelected
          ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30'
          : 'hover:bg-[var(--color-surface-hover)] border border-transparent'
        }
      `}
      onClick={onClick}
      data-testid={`session-item-${session.id}`}
    >
      <div className="flex-shrink-0">
        <MessageSquare className={`w-4 h-4 ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>
          {sessionName}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Clock className="w-3 h-3" />
          <span>{formattedDate}</span>
          {taskId && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-mono">
              {taskId}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleConfirmDelete}
              className="px-2 py-0.5 text-xs rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={handleCancelDelete}
              className="px-2 py-0.5 text-xs rounded bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            {onOpen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-text-muted)] hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                title="Open session"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleDeleteClick}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete transcript"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`} />
          </>
        )}
      </div>
    </div>
  );
}

export function SessionHistoryModal({
  isOpen,
  onClose,
  agentName,
  sessions,
  onViewSession,
}: SessionHistoryModalProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [transcriptCache, setTranscriptCache] = useState<Record<string, StreamEvent[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Load transcripts for all sessions on mount - fetch from server first, fallback to localStorage
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setIsLoading(true);

    async function loadTranscripts() {
      const cache: Record<string, StreamEvent[]> = {};

      // Load transcripts for all sessions in parallel
      await Promise.all(
        sessions.map(async (session) => {
          try {
            // First try to fetch from server
            const response = await fetchSessionMessages(session.id);
            if (!cancelled && response.messages && response.messages.length > 0) {
              cache[session.id] = response.messages.map(messageToStreamEvent);
              return;
            }
          } catch (err) {
            // Server fetch failed, try localStorage fallback
            console.debug('[SessionHistory] Server fetch failed, trying localStorage:', err);
          }

          // Fall back to localStorage (for backwards compatibility)
          if (!cancelled) {
            cache[session.id] = getSessionTranscript(session.id);
          }
        })
      );

      if (!cancelled) {
        setTranscriptCache(cache);
        // Don't auto-select a session - start with full-width list
        setSelectedSessionId(null);
        setIsLoading(false);
      }
    }

    loadTranscripts();

    return () => {
      cancelled = true;
    };
  }, [isOpen, sessions]);

  // Filter to only sessions with transcripts, and group by providerSessionId
  // When multiple sessions share the same providerSessionId (from resume), show only the most recent one
  const sessionsWithTranscripts = useMemo(() => {
    const withTranscripts = sessions.filter(s => (transcriptCache[s.id]?.length || 0) > 0);

    // Group by providerSessionId - sessions with same providerSessionId are the same conversation
    const grouped = new Map<string, SessionRecord>();
    for (const session of withTranscripts) {
      const key = session.providerSessionId || session.id; // Use id as fallback if no providerSessionId
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, session);
      } else {
        // Keep the most recent session (by startedAt or createdAt)
        const existingTime = existing.startedAt || existing.createdAt;
        const sessionTime = session.startedAt || session.createdAt;
        const existingMs = typeof existingTime === 'number' ? existingTime : new Date(existingTime).getTime();
        const sessionMs = typeof sessionTime === 'number' ? sessionTime : new Date(sessionTime).getTime();
        if (sessionMs > existingMs) {
          grouped.set(key, session);
        }
      }
    }

    return Array.from(grouped.values());
  }, [sessions, transcriptCache]);

  const selectedTranscript = useMemo(() => {
    if (!selectedSessionId) return [];
    return transcriptCache[selectedSessionId] || [];
  }, [selectedSessionId, transcriptCache]);

  const handleDeleteTranscript = (sessionId: string) => {
    clearSessionTranscript(sessionId);
    setTranscriptCache(prev => ({
      ...prev,
      [sessionId]: []
    }));
    // If we deleted the selected session, deselect it
    if (sessionId === selectedSessionId) {
      setSelectedSessionId(null);
    }
  };

  if (!isOpen) return null;

  const hasSelectedSession = selectedSessionId !== null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" data-testid="session-history-modal">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl h-[70%] max-h-[500px] bg-[var(--color-bg)] rounded-xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Session History
            </h2>
            <span className="text-sm text-[var(--color-text-muted)]">
              — {agentName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid="session-history-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] p-6">
              <History className="w-12 h-12 mb-3 opacity-50 animate-pulse" />
              <p className="text-sm">Loading session history...</p>
            </div>
          ) : sessionsWithTranscripts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] p-6">
              <History className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">No session history available</p>
              <p className="text-xs mt-1">Sessions will appear here after you start using this agent</p>
            </div>
          ) : (
            <>
              {/* Session list - full width when no session selected */}
              <div className={`${hasSelectedSession ? 'w-72 border-r border-[var(--color-border)]' : 'flex-1'} overflow-y-auto p-2 flex-shrink-0`}>
                {sessionsWithTranscripts.map(session => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    transcript={transcriptCache[session.id] || []}
                    isSelected={session.id === selectedSessionId}
                    onClick={() => setSelectedSessionId(session.id)}
                    onDelete={() => handleDeleteTranscript(session.id)}
                    onOpen={onViewSession ? () => onViewSession(session.id, session.providerSessionId) : undefined}
                  />
                ))}
              </div>

              {/* Transcript viewer - only shown when a session is selected */}
              {hasSelectedSession && (() => {
                const selectedSession = sessionsWithTranscripts.find(s => s.id === selectedSessionId);
                return (
                  <div className="flex-1 min-w-0 bg-[var(--color-bg-secondary)] flex flex-col">
                    {/* Transcript header with close button */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                      <span className="text-sm font-medium text-[var(--color-text)] truncate">
                        {extractSessionName(selectedSession!, selectedTranscript)}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {onViewSession && (
                          <button
                            onClick={() => {
                              onViewSession(selectedSession!.id, selectedSession!.providerSessionId);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            title="Open this session (send a message to resume)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Open
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedSessionId(null)}
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                          title="Close transcript"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0">
                      <TranscriptViewer events={selectedTranscript} />
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
