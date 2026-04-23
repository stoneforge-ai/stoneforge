/**
 * Inbox-related components for entity detail panel
 * Includes: InboxTimePeriodHeader, InboxMessageListItem, InboxMessageContent, InboxMessageEmptyState
 */

import {
  Bot,
  User,
  Server,
  AtSign,
  MessageSquare,
  Inbox,
  CheckCheck,
  Mail,
  Archive,
  RefreshCw,
  Reply,
  Loader2,
  ChevronRight,
  Calendar,
  FileText,
  Paperclip,
  CornerUpLeft,
} from 'lucide-react';
import type { InboxItem } from '../types';
import type { TimePeriod } from '../../../lib';
import { TIME_PERIOD_LABELS, formatCompactTime } from '../../../lib';

// Avatar helpers
function getAvatarIcon(entityType?: string, size: 'sm' | 'md' = 'sm') {
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-5 h-5';
  switch (entityType) {
    case 'agent':
      return <Bot className={sizeClass} />;
    case 'human':
      return <User className={sizeClass} />;
    case 'system':
      return <Server className={sizeClass} />;
    default:
      return <User className={sizeClass} />;
  }
}

function getAvatarColors(entityType?: string) {
  switch (entityType) {
    case 'agent':
      return 'bg-purple-100 text-purple-600';
    case 'human':
      return 'bg-blue-100 text-blue-600';
    case 'system':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Time period sticky header for inbox list grouping
 */
export function InboxTimePeriodHeader({ period }: { period: TimePeriod }) {
  return (
    <div
      className="sticky top-0 z-10 px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex items-center gap-2"
      data-testid={`inbox-time-period-${period}`}
    >
      <Calendar className="w-3 h-3 text-gray-500" />
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {TIME_PERIOD_LABELS[period]}
      </span>
    </div>
  );
}

/**
 * Compact message list item for the left side of split layout
 */
interface InboxMessageListItemProps {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
  formattedTime?: string;
}

export function InboxMessageListItem({
  item,
  isSelected,
  onSelect,
  formattedTime,
}: InboxMessageListItemProps) {
  const isUnread = item.status === 'unread';
  const displayTime = formattedTime ?? formatCompactTime(item.createdAt);
  const senderName = item.sender?.name ?? 'Unknown';
  const senderType = item.sender?.entityType ?? 'agent';
  const messagePreview = item.message?.contentPreview ?? '';
  const firstLine = messagePreview.split('\n')[0]?.slice(0, 50) || '';

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors border-b border-gray-100 ${
        isSelected
          ? 'bg-blue-50 border-l-2 border-l-blue-500'
          : isUnread
          ? 'bg-white hover:bg-gray-50'
          : 'bg-gray-50/50 hover:bg-gray-100/50'
      }`}
      data-testid={`inbox-list-item-${item.id}`}
    >
      {/* Avatar */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors(senderType)}`}>
        {getAvatarIcon(senderType, 'sm')}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${isUnread ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
            {senderName}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-400" data-testid={`inbox-list-item-time-${item.id}`}>{displayTime}</span>
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500" data-testid={`inbox-list-item-unread-${item.id}`} />
            )}
          </div>
        </div>
        {firstLine && (
          <p className={`text-xs truncate ${isUnread ? 'text-gray-600' : 'text-gray-500'}`}>
            {firstLine}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Full message content panel for the right side of split layout
 */
interface InboxMessageContentProps {
  item: InboxItem;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onRestore: () => void;
  isPending: boolean;
  onNavigateToMessage: () => void;
  onNavigateToEntity: (entityId: string) => void;
  onReply?: () => void;
}

export function InboxMessageContent({
  item,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onRestore,
  isPending,
  onNavigateToMessage,
  onNavigateToEntity,
  onReply,
}: InboxMessageContentProps) {
  const isUnread = item.status === 'unread';
  const isArchived = item.status === 'archived';

  const formatFullTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatAbsoluteTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return '';
  };

  const senderName = item.sender?.name ?? 'Unknown';
  const senderType = item.sender?.entityType ?? 'agent';
  const senderId = item.sender?.id ?? item.message?.sender;
  const channelName = item.channel?.name ?? item.channelId;
  const messageContent = item.message?.fullContent ?? item.message?.contentPreview ?? '';
  const contentType = item.message?.contentType ?? 'text';

  const relativeTime = formatRelativeTime(item.createdAt);
  const hasAttachments = item.attachments && item.attachments.length > 0;
  const hasThreadParent = item.threadParent !== null && item.threadParent !== undefined;

  return (
    <div className="h-full flex flex-col" data-testid={`inbox-message-content-${item.id}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Sender Avatar - clickable */}
            <button
              onClick={() => senderId && onNavigateToEntity(senderId)}
              className={`w-10 h-10 rounded-full flex items-center justify-center ${getAvatarColors(senderType)} hover:ring-2 hover:ring-blue-300 transition-all`}
              data-testid={`inbox-content-avatar-${item.id}`}
            >
              {getAvatarIcon(senderType, 'md')}
            </button>
            <div>
              {/* Sender Name - clickable */}
              <button
                onClick={() => senderId && onNavigateToEntity(senderId)}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline"
                data-testid={`inbox-content-sender-${item.id}`}
              >
                {senderName}
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {/* Channel - clickable */}
                <button
                  onClick={onNavigateToMessage}
                  className="hover:text-blue-600 hover:underline"
                  data-testid={`inbox-content-channel-${item.id}`}
                >
                  #{channelName}
                </button>
                <span>•</span>
                {/* Source badge */}
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded ${
                    item.sourceType === 'mention'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {item.sourceType === 'mention' ? (
                    <>
                      <AtSign className="w-3 h-3" />
                      Mention
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-3 h-3" />
                      Direct
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <>
                {!isArchived && onReply && (
                  <button
                    onClick={onReply}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Reply"
                    data-testid={`inbox-content-reply-${item.id}`}
                  >
                    <Reply className="w-4 h-4" />
                  </button>
                )}
                {isArchived ? (
                  <button
                    onClick={onRestore}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                    title="Restore"
                    data-testid={`inbox-content-restore-${item.id}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    {isUnread ? (
                      <button
                        onClick={onMarkRead}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Mark as read"
                        data-testid={`inbox-content-mark-read-${item.id}`}
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={onMarkUnread}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Mark as unread"
                        data-testid={`inbox-content-mark-unread-${item.id}`}
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={onArchive}
                      className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                      title="Archive"
                      data-testid={`inbox-content-archive-${item.id}`}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div
          className="mt-2 text-xs text-gray-500 cursor-help"
          title={formatAbsoluteTime(item.createdAt)}
          data-testid={`inbox-content-time-${item.id}`}
        >
          {formatFullTime(item.createdAt)}
          {relativeTime && <span className="ml-1">({relativeTime})</span>}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {/* Thread context - show parent message if this is a reply */}
        {hasThreadParent && item.threadParent && (
          <div
            className="mx-4 mt-4 p-3 bg-gray-50 border-l-4 border-gray-300 rounded-r"
            data-testid={`inbox-content-thread-context-${item.id}`}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <CornerUpLeft className="w-3 h-3" />
              <span>Reply to</span>
            </div>
            <div className="flex items-start gap-2">
              <button
                onClick={() => item.threadParent?.sender?.id && onNavigateToEntity(item.threadParent.sender.id)}
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors(item.threadParent.sender?.entityType)} hover:ring-2 hover:ring-blue-300 transition-all`}
                data-testid={`inbox-content-thread-parent-avatar-${item.id}`}
              >
                {getAvatarIcon(item.threadParent.sender?.entityType, 'sm')}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => item.threadParent?.sender?.id && onNavigateToEntity(item.threadParent.sender.id)}
                  className="text-xs font-medium text-gray-700 hover:text-blue-600 hover:underline"
                  data-testid={`inbox-content-thread-parent-sender-${item.id}`}
                >
                  {item.threadParent.sender?.name ?? 'Unknown'}
                </button>
                <p
                  className="text-xs text-gray-500 truncate mt-0.5"
                  data-testid={`inbox-content-thread-parent-preview-${item.id}`}
                >
                  {item.threadParent.contentPreview || 'No content'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Message Content */}
        <div className="p-4">
          <div
            className={`prose prose-sm max-w-none text-gray-700 ${
              contentType === 'markdown' ? 'whitespace-pre-wrap' : 'whitespace-pre-wrap'
            }`}
            data-testid={`inbox-content-body-${item.id}`}
          >
            {messageContent || <span className="text-gray-400 italic">No content</span>}
          </div>
        </div>

        {/* Attachments section */}
        {hasAttachments && (
          <div
            className="px-4 pb-4"
            data-testid={`inbox-content-attachments-${item.id}`}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <Paperclip className="w-3 h-3" />
              <span>{item.attachments!.length} attachment{item.attachments!.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-2">
              {item.attachments!.map((attachment) => (
                <div
                  key={attachment.id}
                  className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  data-testid={`inbox-content-attachment-${attachment.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium text-gray-700 truncate"
                          data-testid={`inbox-content-attachment-title-${attachment.id}`}
                        >
                          {attachment.title}
                        </p>
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded"
                          data-testid={`inbox-content-attachment-type-${attachment.id}`}
                        >
                          {attachment.contentType ?? 'text'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {attachment.content && (
                    <div
                      className="mt-2 text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap"
                      data-testid={`inbox-content-attachment-preview-${attachment.id}`}
                    >
                      {attachment.content.substring(0, 200)}
                      {attachment.content.length > 200 && '...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer - View in channel link */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onNavigateToMessage}
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
          data-testid={`inbox-content-view-in-channel-${item.id}`}
        >
          View in channel
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Empty state for message content panel when no message is selected
 */
export function InboxMessageEmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400" data-testid="inbox-content-empty">
      <Inbox className="w-12 h-12 mb-3" />
      <p className="text-sm font-medium">Select a message</p>
      <p className="text-xs mt-1">Choose a message from the list to view its content</p>
      <p className="text-xs mt-3 text-gray-300">Tip: Use J/K keys to navigate</p>
    </div>
  );
}
