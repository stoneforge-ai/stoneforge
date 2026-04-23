/**
 * Messages Page - Slack-style messaging interface
 *
 * Features:
 * - Channel list sidebar with virtualized rendering
 * - Channel selection
 * - Message display (TB17)
 * - Message composer (TB18)
 * - Threading (TB19)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { CreateChannelModal } from '@stoneforge/ui';
import { useAllChannels } from '../../api/hooks/useAllElements';
import { createChannelFilter } from '../../hooks/usePaginatedData';
import { useCurrentUser } from '../../contexts';
import { useRealtimeEvents } from '../../api/hooks/useRealtimeEvents';
import type { WebSocketEvent } from '@stoneforge/ui';

import { ChannelList, ChannelPlaceholder } from './components/ChannelList';
import { ChannelView } from './components/ChannelView';
import type { Channel } from '../../api/hooks/useAllElements';

// ============================================================================
// MessagesPage
// ============================================================================

export function MessagesPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/messages' });
  const isMobile = useIsMobile();
  const { currentUser } = useCurrentUser();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    search.channel ?? null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Use ref to track current user ID to avoid stale closure issues in WebSocket callbacks
  const currentUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);

  // Real-time event handling for new messages
  const handleMessageEvent = useCallback(
    (event: WebSocketEvent) => {
      if (event.elementType === 'message' && event.eventType === 'created') {
        const msgChannelId = event.newValue?.channelId as string | undefined;
        const msgSender = event.newValue?.sender as string | undefined;
        // Don't show toast for messages sent by the current user
        if (msgSender && currentUserIdRef.current && msgSender === currentUserIdRef.current) {
          return;
        }
        // Show toast for new messages in the currently selected channel
        if (msgChannelId && msgChannelId === selectedChannelId) {
          toast.info('New message received', {
            description: 'The conversation has been updated',
            duration: 3000,
          });
        }
      }
    },
    [selectedChannelId]
  );

  // Subscribe to messages channel for real-time updates
  useRealtimeEvents({
    channels: selectedChannelId ? [`messages:${selectedChannelId}`, 'messages'] : ['messages'],
    onEvent: handleMessageEvent,
  });

  // Load all channels up-front
  const { data: allChannels, isLoading: isChannelsLoading, isError } = useAllChannels();

  // Create filter function for client-side filtering
  const filterFn = useMemo(() => {
    return createChannelFilter({ search: searchQuery });
  }, [searchQuery]);

  // Filter channels client-side and sort by updatedAt desc
  const filteredChannels = useMemo(() => {
    if (!allChannels) return [];
    const filtered = filterFn ? (allChannels as Channel[]).filter(filterFn) : (allChannels as Channel[]);
    return [...filtered].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [allChannels, filterFn]);

  const totalChannels = allChannels?.length ?? 0;

  // Sync selected channel from URL on mount and when search changes
  useEffect(() => {
    if (search.channel && search.channel !== selectedChannelId) {
      setSelectedChannelId(search.channel);
    }
    if (!search.channel && selectedChannelId) {
      setSelectedChannelId(null);
    }
  }, [search.channel]);

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    navigate({
      to: '/messages',
      search: { channel: channelId, message: undefined },
    });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleChannelCreated = (channel: { id: string }) => {
    setSelectedChannelId(channel.id);
    navigate({
      to: '/messages',
      search: { channel: channel.id, message: undefined },
    });
  };

  // Handle back navigation on mobile
  const handleMobileBack = () => {
    setSelectedChannelId(null);
    navigate({
      to: '/messages',
      search: { channel: undefined, message: undefined },
    });
  };

  // Handle channel deletion - navigate away from deleted channel
  const handleChannelDeleted = useCallback(() => {
    setSelectedChannelId(null);
    navigate({
      to: '/messages',
      search: { channel: undefined, message: undefined },
    });
    toast.success('Channel deleted', {
      description: 'The channel has been permanently deleted',
      duration: 3000,
    });
  }, [navigate]);

  if (isError) {
    return (
      <div data-testid="messages-page-error" className="flex items-center justify-center h-full">
        <div className="text-center px-4">
          <p className="text-red-500 mb-2">Failed to load channels</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  // Mobile: Two-screen navigation pattern
  // - When no channel selected: show full-screen channel list
  // - When channel selected: show full-screen channel view with back button
  if (isMobile) {
    return (
      <div data-testid="messages-page" className="flex flex-col h-full relative">
        {/* Mobile: Show channel list when no channel selected */}
        {!selectedChannelId && (
          <>
            {isChannelsLoading ? (
              <div
                data-testid="channels-loading"
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-gray-500 dark:text-gray-400">Loading channels...</div>
              </div>
            ) : (
              <ChannelList
                channels={filteredChannels}
                selectedChannelId={selectedChannelId}
                onSelectChannel={handleSelectChannel}
                onNewChannel={() => setIsCreateModalOpen(true)}
                totalChannels={totalChannels}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                isMobile={true}
              />
            )}

            {/* Mobile FAB for creating new channel */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-30 touch-target"
              data-testid="mobile-create-channel-fab"
              aria-label="Create new channel"
            >
              <Plus className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Mobile: Show channel view when channel selected */}
        {selectedChannelId && (
          <ChannelView
            channelId={selectedChannelId}
            isMobile={true}
            onBack={handleMobileBack}
            onChannelDeleted={handleChannelDeleted}
          />
        )}

        <CreateChannelModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleChannelCreated}
        />
      </div>
    );
  }

  // Desktop: Side-by-side layout
  return (
    <div data-testid="messages-page" className="flex h-full">
      {isChannelsLoading ? (
        <div
          data-testid="channels-loading"
          className="w-64 border-r border-[var(--color-border)] flex items-center justify-center"
        >
          <div className="text-gray-500 dark:text-gray-400">Loading channels...</div>
        </div>
      ) : (
        <ChannelList
          channels={filteredChannels}
          selectedChannelId={selectedChannelId}
          onSelectChannel={handleSelectChannel}
          onNewChannel={() => setIsCreateModalOpen(true)}
          totalChannels={totalChannels}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          isMobile={false}
        />
      )}

      {selectedChannelId ? (
        <ChannelView
          channelId={selectedChannelId}
          isMobile={false}
          onChannelDeleted={handleChannelDeleted}
        />
      ) : (
        <ChannelPlaceholder isMobile={false} />
      )}

      <CreateChannelModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleChannelCreated}
      />
    </div>
  );
}
