/**
 * PendingMessagesQueue - Shows pending messages destined for the Director
 *
 * Displays a queue of unread inbox items for the Director agent.
 * Allows the operator to manually trigger inbox reading.
 */

import { useMemo, useCallback } from "react";
import {
  Mail,
  Send,
  Clock,
  User,
  RefreshCw,
  Inbox,
  CheckCheck,
  Play,
} from "lucide-react";
import { Tooltip } from "@stoneforge/ui";
import {
  useAgentInbox,
  useMarkAllInboxRead,
  formatInboxTime,
  type InboxItem,
} from "../../api/hooks/useAgentInbox";
import { useRealtimeEvents } from "../../api/hooks/useRealtimeEvents";
import { renderMessageContent } from "../../lib/message-content";

interface PendingMessagesQueueProps {
  /** Director agent ID */
  directorId: string | null;
  /** Whether the director has an active session */
  hasActiveSession: boolean;
  /** Callback to send command to director terminal */
  onSendCommand?: (command: string) => void;
  /** Test ID for testing */
  "data-testid"?: string;
}

export function PendingMessagesQueue({
  directorId,
  hasActiveSession,
  onSendCommand,
  "data-testid": testId = "pending-messages-queue",
}: PendingMessagesQueueProps) {
  // Subscribe to real-time inbox updates for the director
  useRealtimeEvents({
    channels: directorId ? [`inbox:${directorId}`] : [],
    autoInvalidate: true,
  });

  // Fetch unread inbox items for the director
  const {
    data: inboxData,
    isLoading,
    error,
    refetch,
  } = useAgentInbox(directorId, "unread");
  const markAllRead = useMarkAllInboxRead(directorId ?? "");

  // Filter to only show unread messages
  const pendingMessages = useMemo(() => {
    if (!inboxData?.items) return [];
    return inboxData.items.filter((item) => item.status === "unread");
  }, [inboxData?.items]);

  // Handle process button click - tells the director agent to check and process its inbox
  const handleProcessMessages = useCallback(() => {
    if (!hasActiveSession) {
      console.warn("Cannot process messages: Director has no active session");
      return;
    }

    // Send a natural language instruction to the director agent to check its inbox
    onSendCommand?.("Check your inbox and process the pending messages");
    // Send carriage return after a small delay to ensure it registers as the submit action
    setTimeout(() => {
      onSendCommand?.("\r");
    }, 200);
  }, [hasActiveSession, onSendCommand]);

  // Handle process single message - sends targeted command to director terminal
  const handleProcessSingle = useCallback(
    (inboxItemId: string) => {
      if (!hasActiveSession) {
        console.warn("Cannot process message: Director has no active session");
        return;
      }

      const command = `Process inbox item ${inboxItemId} — read it with \`sf show ${inboxItemId}\` and handle it. Do not process other inbox messages.`;
      onSendCommand?.(command);
      // Send carriage return after a small delay to ensure it registers as the submit action
      setTimeout(() => {
        onSendCommand?.("\r");
      }, 200);
    },
    [hasActiveSession, onSendCommand],
  );

  // Handle mark all as read
  const handleMarkAllRead = useCallback(async () => {
    if (!directorId) return;
    try {
      await markAllRead.mutateAsync();
    } catch (err) {
      console.error("Failed to mark all messages as read:", err);
    }
  }, [directorId, markAllRead]);

  // Render empty state
  if (!directorId) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-4 text-center"
        data-testid={testId}
      >
        <Inbox className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
        <p className="text-sm text-[var(--color-text-muted)]">
          No Director agent
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-4"
        data-testid={testId}
      >
        <RefreshCw className="w-6 h-6 text-[var(--color-text-muted)] animate-spin" />
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          Loading messages...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-4 text-center"
        data-testid={testId}
      >
        <p className="text-sm text-[var(--color-danger)]">
          Failed to load messages
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-xs text-[var(--color-primary)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid={testId}>
      {/* Header with actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <span className="text-sm font-medium text-[var(--color-text)]">
            Pending Messages
          </span>
          {pendingMessages.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-[var(--color-primary)] text-white">
              {pendingMessages.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {pendingMessages.length > 0 && (
            <>
              <Tooltip content="Mark all as read" side="bottom">
                <button
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending}
                  className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                  aria-label="Mark all as read"
                  data-testid="mark-all-read-btn"
                >
                  {markAllRead.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4" />
                  )}
                </button>
              </Tooltip>
              <Tooltip
                content={
                  hasActiveSession
                    ? "Process messages"
                    : "Start director session first"
                }
                side="bottom"
              >
                <button
                  onClick={handleProcessMessages}
                  disabled={!hasActiveSession}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Process messages"
                  data-testid="process-messages-btn"
                >
                  <Send className="w-3.5 h-3.5" />
                  Process
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto">
        {pendingMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <Inbox className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">
              No pending messages
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              Messages will appear here when received
            </p>
          </div>
        ) : (
          <ul
            className="divide-y divide-[var(--color-border)]"
            data-testid="messages-list"
          >
            {pendingMessages.map((item) => (
              <MessageItem
                key={item.id}
                item={item}
                hasActiveSession={hasActiveSession}
                onProcessSingle={handleProcessSingle}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Individual message item in the queue
 */
function MessageItem({
  item,
  hasActiveSession,
  onProcessSingle,
}: {
  item: InboxItem;
  hasActiveSession: boolean;
  onProcessSingle: (inboxItemId: string) => void;
}) {
  const senderName = item.sender?.name ?? item.message?.sender ?? "Unknown";
  const contentPreview =
    item.message?.contentPreview ?? item.message?.fullContent ?? "";
  const timestamp = item.createdAt;
  const channelName = item.channel?.name;
  const sourceType = item.sourceType;

  const handleProcess = useCallback(() => {
    onProcessSingle(item.id);
  }, [item.id, onProcessSingle]);

  return (
    <li
      className="px-3 py-2.5 hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
      data-testid="message-item"
    >
      <div className="flex items-start gap-2">
        {/* Sender icon */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
          <User className="w-4 h-4 text-[var(--color-primary)]" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row: sender, channel, time, process button */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-[var(--color-text)] truncate">
              {senderName}
            </span>
            {channelName && (
              <span className="text-xs text-[var(--color-text-tertiary)] truncate">
                #{channelName}
              </span>
            )}
            {sourceType === "mention" && (
              <span className="px-1 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400">
                @mention
              </span>
            )}
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              <span className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatInboxTime(timestamp)}
              </span>
              {/* Process single message button */}
              <Tooltip
                content={hasActiveSession ? 'Process this message' : 'Start director session first'}
                side="left"
              >
                <button
                  onClick={handleProcess}
                  disabled={!hasActiveSession}
                  className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-md text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Process message ${item.id}`}
                  data-testid="process-single-message-btn"
                >
                  <Play className="w-3 h-3" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Message content preview */}
          <div className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
            {renderMessageContent(contentPreview)}
          </div>
        </div>
      </div>
    </li>
  );
}

export default PendingMessagesQueue;
