/**
 * Agent Inbox Drawer Component
 *
 * Displays an agent's inbox in a slide-over drawer.
 * Shows direct messages and mentions received by the agent.
 */

import { useState } from 'react';
import {
  X,
  Inbox,
  Mail,
  Archive,
  CheckCheck,
  RefreshCw,
  AtSign,
  MessageSquare,
  Bot,
  User,
  Server,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  useAgentInbox,
  useAgentInboxCount,
  useMarkInboxItem,
  useMarkAllInboxRead,
  formatInboxTime,
  formatFullInboxTime,
  type InboxItem,
  type InboxViewType,
} from '../../api/hooks/useAgentInbox';

// ============================================================================
// Helper Functions
// ============================================================================

function getAvatarIcon(entityType?: string, size: 'sm' | 'md' = 'sm') {
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
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
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
    case 'human':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
    case 'system':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

// ============================================================================
// Sub-components
// ============================================================================

interface InboxItemRowProps {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
}

function InboxItemRow({ item, isSelected, onSelect }: InboxItemRowProps) {
  const isUnread = item.status === 'unread';
  const senderName = item.sender?.name ?? 'Unknown';
  const senderType = item.sender?.entityType ?? 'agent';
  const messagePreview = item.message?.contentPreview ?? '';
  const firstLine = messagePreview.split('\n')[0]?.slice(0, 60) || '';

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors border-b border-gray-100 dark:border-gray-800 ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
          : isUnread
          ? 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          : 'bg-gray-50/50 dark:bg-gray-900/50 hover:bg-gray-100/50 dark:hover:bg-gray-800/30'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors(senderType)}`}
      >
        {getAvatarIcon(senderType, 'sm')}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm truncate ${
              isUnread
                ? 'font-medium text-gray-900 dark:text-gray-100'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {senderName}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatInboxTime(item.createdAt)}
            </span>
            {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500" />}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-medium rounded ${
              item.sourceType === 'mention'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}
          >
            {item.sourceType === 'mention' ? (
              <AtSign className="w-2.5 h-2.5" />
            ) : (
              <MessageSquare className="w-2.5 h-2.5" />
            )}
          </span>
          {firstLine && (
            <p
              className={`text-xs truncate ${
                isUnread ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-500'
              }`}
            >
              {firstLine}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

interface InboxDetailPanelProps {
  item: InboxItem;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onRestore: () => void;
  isPending: boolean;
}

function InboxDetailPanel({
  item,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onRestore,
  isPending,
}: InboxDetailPanelProps) {
  const isUnread = item.status === 'unread';
  const isArchived = item.status === 'archived';
  const senderName = item.sender?.name ?? 'Unknown';
  const senderType = item.sender?.entityType ?? 'agent';
  const channelName = item.channel?.name ?? 'Unknown channel';
  const messageContent = item.message?.fullContent ?? item.message?.contentPreview ?? '';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${getAvatarColors(senderType)}`}
            >
              {getAvatarIcon(senderType, 'md')}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{senderName}</p>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span>#{channelName}</span>
                <span>·</span>
                <span
                  className={`inline-flex items-center gap-0.5 px-1 py-0.5 font-medium rounded ${
                    item.sourceType === 'mention'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}
                >
                  {item.sourceType === 'mention' ? (
                    <>
                      <AtSign className="w-2.5 h-2.5" />
                      Mention
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-2.5 h-2.5" />
                      Direct
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : isArchived ? (
              <button
                onClick={onRestore}
                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                title="Restore"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            ) : (
              <>
                {isUnread ? (
                  <button
                    onClick={onMarkRead}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    title="Mark as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={onMarkUnread}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    title="Mark as unread"
                  >
                    <Mail className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onArchive}
                  className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                  title="Archive"
                >
                  <Archive className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {formatFullInboxTime(item.createdAt)}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {messageContent || <span className="text-gray-400 italic">No content</span>}
        </div>
      </div>
    </div>
  );
}

function EmptyInboxState({ view }: { view: InboxViewType }) {
  const messages: Record<InboxViewType, { title: string; subtitle: string }> = {
    unread: { title: 'No unread messages', subtitle: 'All caught up!' },
    all: { title: 'No messages', subtitle: 'This agent has no messages yet' },
    archived: { title: 'No archived messages', subtitle: 'Archive messages to see them here' },
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-6">
      <Inbox className="w-10 h-10 mb-2" />
      <p className="text-sm font-medium">{messages[view].title}</p>
      <p className="text-xs mt-1">{messages[view].subtitle}</p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface AgentInboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
}

export function AgentInboxDrawer({ isOpen, onClose, agentId, agentName }: AgentInboxDrawerProps) {
  const [view, setView] = useState<InboxViewType>('unread');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const { data: inboxData, isLoading, error, refetch } = useAgentInbox(agentId, view);
  const { data: countData } = useAgentInboxCount(agentId);
  const markItem = useMarkInboxItem(agentId);
  const markAllRead = useMarkAllInboxRead(agentId);

  const selectedItem = inboxData?.items.find((item) => item.id === selectedItemId);
  const unreadCount = countData?.count ?? 0;

  const handleMarkRead = (itemId: string) => {
    markItem.mutate({ itemId, status: 'read' });
  };

  const handleMarkUnread = (itemId: string) => {
    markItem.mutate({ itemId, status: 'unread' });
  };

  const handleArchive = (itemId: string) => {
    markItem.mutate({ itemId, status: 'archived' });
    if (selectedItemId === itemId) {
      setSelectedItemId(null);
    }
  };

  const handleRestore = (itemId: string) => {
    markItem.mutate({ itemId, status: 'read' });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Inbox className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Inbox: {agentName}
              </h2>
              {unreadCount > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
              >
                {markAllRead.isPending ? 'Marking...' : 'Mark all read'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {(['unread', 'all', 'archived'] as InboxViewType[]).map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setSelectedItemId(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                view === v
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {v === 'unread' ? 'Unread' : v === 'all' ? 'All' : 'Archived'}
              {v === 'unread' && unreadCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}

          <button
            onClick={() => refetch()}
            className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {error ? (
            <div className="flex-1 flex items-center justify-center text-red-500 dark:text-red-400 p-6">
              <p className="text-sm">Failed to load inbox: {error.message}</p>
            </div>
          ) : isLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !inboxData?.items.length ? (
            <EmptyInboxState view={view} />
          ) : (
            <>
              {/* List */}
              <div className="w-2/5 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                {inboxData.items.map((item) => (
                  <InboxItemRow
                    key={item.id}
                    item={item}
                    isSelected={selectedItemId === item.id}
                    onSelect={() => setSelectedItemId(item.id)}
                  />
                ))}
              </div>

              {/* Detail */}
              <div className="flex-1 overflow-hidden">
                {selectedItem ? (
                  <InboxDetailPanel
                    item={selectedItem}
                    onMarkRead={() => handleMarkRead(selectedItem.id)}
                    onMarkUnread={() => handleMarkUnread(selectedItem.id)}
                    onArchive={() => handleArchive(selectedItem.id)}
                    onRestore={() => handleRestore(selectedItem.id)}
                    isPending={markItem.isPending}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                    <ChevronRight className="w-8 h-8 mb-2" />
                    <p className="text-sm">Select a message to view</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default AgentInboxDrawer;
