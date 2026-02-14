/**
 * Channel list components for the Messages sidebar
 * Uses virtualization for efficient rendering of large channel lists
 */

import { Hash, Lock, Users, MessageSquare, Plus, Search } from 'lucide-react';
import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import type { Channel } from '../types';

// ============================================================================
// ChannelIcon
// ============================================================================

export function ChannelIcon({ channel }: { channel: Channel }) {
  if (channel.channelType === 'direct') {
    return <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  }
  if (channel.permissions.visibility === 'private') {
    return <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  }
  return <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />;
}

// ============================================================================
// ChannelListItem
// ============================================================================

interface ChannelListItemProps {
  channel: Channel;
  isSelected: boolean;
  onClick: () => void;
  isMobile?: boolean;
}

export function ChannelListItem({
  channel,
  isSelected,
  onClick,
  isMobile = false,
}: ChannelListItemProps) {
  return (
    <button
      data-testid={`channel-item-${channel.id}`}
      onClick={onClick}
      className={`w-full flex items-center gap-2 sm:gap-2 rounded-md text-left transition-colors touch-target ${
        isMobile ? 'px-4 py-3 gap-3' : 'px-3 py-2'
      } ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <ChannelIcon channel={channel} />
      <span className={`truncate font-medium ${isMobile ? 'text-base' : 'text-sm'}`}>
        {channel.name}
      </span>
      <span className={`ml-auto text-gray-400 ${isMobile ? 'text-sm' : 'text-xs'}`}>
        {channel.members.length}
      </span>
    </button>
  );
}

// ============================================================================
// ChannelList
// ============================================================================

// Item height constants for virtualization
const DESKTOP_ITEM_HEIGHT = 36; // px-3 py-2 = ~36px
const MOBILE_ITEM_HEIGHT = 48; // px-4 py-3 = ~48px
const SECTION_HEADER_HEIGHT = 28; // section label height

interface ChannelListProps {
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onNewChannel: () => void;
  totalChannels: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isMobile?: boolean;
}

// Type for virtualized list items (either a section header or a channel)
type ListItem =
  | { type: 'header'; label: string; key: string }
  | { type: 'channel'; channel: Channel; key: string };

export function ChannelList({
  channels,
  selectedChannelId,
  onSelectChannel,
  onNewChannel,
  totalChannels,
  searchQuery,
  onSearchChange,
  isMobile = false,
}: ChannelListProps) {
  // Separate channels into groups and direct
  const groupChannels = channels.filter((c) => c.channelType === 'group');
  const directChannels = channels.filter((c) => c.channelType === 'direct');

  // Build flat list with section headers for virtualization
  const listItems: ListItem[] = [];

  if (groupChannels.length > 0) {
    listItems.push({ type: 'header', label: 'Channels', key: 'header-group' });
    groupChannels.forEach((channel) => {
      listItems.push({ type: 'channel', channel, key: channel.id });
    });
  }

  if (directChannels.length > 0) {
    listItems.push({ type: 'header', label: 'Direct Messages', key: 'header-direct' });
    directChannels.forEach((channel) => {
      listItems.push({ type: 'channel', channel, key: channel.id });
    });
  }

  const itemHeight = isMobile ? MOBILE_ITEM_HEIGHT : DESKTOP_ITEM_HEIGHT;

  const getItemSize = (index: number) => {
    const item = listItems[index];
    return item.type === 'header' ? SECTION_HEADER_HEIGHT : itemHeight;
  };

  const renderItem = (item: ListItem) => {
    if (item.type === 'header') {
      return (
        <div
          data-testid={item.key === 'header-group' ? 'channel-group-label' : 'channel-direct-label'}
          className={`px-3 py-1 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
            isMobile ? 'text-sm' : 'text-xs'
          }`}
        >
          {item.label}
        </div>
      );
    }

    return (
      <ChannelListItem
        channel={item.channel}
        isSelected={selectedChannelId === item.channel.id}
        onClick={() => onSelectChannel(item.channel.id)}
        isMobile={isMobile}
      />
    );
  };

  return (
    <div
      data-testid="channel-list"
      className={`flex flex-col h-full bg-white dark:bg-[var(--color-bg)] ${
        isMobile ? 'w-full' : 'w-64 border-r border-[var(--color-border)]'
      }`}
    >
      <div className={`border-b border-[var(--color-border)] ${isMobile ? 'p-4 pt-2' : 'p-4'}`}>
        <div className="flex items-center justify-between mb-3">
          <h2
            className={`font-semibold text-[var(--color-text)] ${
              isMobile ? 'text-xl' : 'text-lg'
            } flex items-center gap-2`}
          >
            <MessageSquare className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-blue-500`} />
            Channels
          </h2>
          <button
            onClick={onNewChannel}
            className={`text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors ${
              isMobile ? 'p-2 touch-target' : 'p-1.5'
            }`}
            title="New Channel"
            data-testid="new-channel-button-sidebar"
          >
            <Plus className={isMobile ? 'w-6 h-6' : 'w-5 h-5'} />
          </button>
        </div>
        {/* Search box */}
        <div className="relative">
          <Search
            className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${
              isMobile ? 'left-3 w-5 h-5' : 'left-2.5 w-4 h-4'
            }`}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isMobile ? 'Search...' : 'Search channels...'}
            className={`w-full border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--color-surface)] text-[var(--color-text)] ${
              isMobile ? 'pl-10 pr-4 py-2.5 text-base' : 'pl-8 pr-3 py-1.5 text-sm'
            }`}
            data-testid="channels-search-input"
          />
        </div>
      </div>

      {/* Virtualized channel list */}
      <div className="flex-1 min-h-0">
        {channels.length === 0 ? (
          <div
            data-testid="channel-empty-state"
            className={`text-center text-gray-500 dark:text-gray-400 ${
              isMobile ? 'py-12' : 'py-8'
            }`}
          >
            <MessageSquare
              className={`mx-auto mb-3 text-gray-300 dark:text-gray-600 ${
                isMobile ? 'w-16 h-16' : 'w-12 h-12'
              }`}
            />
            <p className={isMobile ? 'text-base' : 'text-sm'}>
              {searchQuery ? 'No channels match your search' : 'No channels yet'}
            </p>
            {!searchQuery && (
              <button
                onClick={onNewChannel}
                className={`mt-3 text-blue-600 hover:text-blue-700 hover:underline ${
                  isMobile ? 'text-base py-2 px-4' : 'text-sm'
                }`}
                data-testid="new-channel-button-empty"
              >
                Create one
              </button>
            )}
          </div>
        ) : (
          <VirtualizedList
            items={listItems}
            getItemKey={(item) => item.key}
            estimateSize={getItemSize}
            renderItem={renderItem}
            overscan={10}
            className="h-full p-2"
            scrollRestoreId="channel-list"
            testId="channel-list-virtualized"
          />
        )}
      </div>

      {/* Channel count footer - hidden on mobile */}
      {!isMobile && (
        <div
          data-testid="channel-count"
          className="p-3 border-t border-gray-200 dark:border-[var(--color-border)] text-xs text-gray-500 dark:text-gray-400"
        >
          {totalChannels} {totalChannels === 1 ? 'channel' : 'channels'}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ChannelPlaceholder
// ============================================================================

export function ChannelPlaceholder({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <div
      data-testid="channel-placeholder"
      className={`flex-1 flex items-center justify-center bg-[var(--color-surface)] ${
        isMobile ? 'hidden' : ''
      }`}
    >
      <div className="text-center px-4">
        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-1">
          Select a channel
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Choose a channel from the sidebar to view messages
        </p>
      </div>
    </div>
  );
}
