/**
 * ChannelHeader - Shared channel header component
 *
 * A flexible channel header component that can be used in both the standard
 * web app and the orchestrator web app. Uses render props for custom actions.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import {
  Hash,
  Lock,
  Users,
  ChevronLeft,
  Search,
  XCircle,
  Settings,
  UserCog,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface ChannelHeaderChannel {
  id: string;
  name: string;
  channelType: 'direct' | 'group';
  members: string[];
  permissions?: {
    visibility?: 'public' | 'private';
  };
}

export interface ChannelHeaderProps {
  /** Channel data to display */
  channel: ChannelHeaderChannel;

  /** Whether the header is displayed on mobile */
  isMobile?: boolean;

  /** Callback when back button is clicked (mobile only) */
  onBack?: () => void;

  /** Callback when members/settings button is clicked */
  onOpenMembers?: () => void;

  /** Custom icon component to render instead of default channel icon */
  renderIcon?: (channel: ChannelHeaderChannel) => ReactNode;

  /** Custom actions to render in the header (e.g., search, settings) */
  renderActions?: (props: {
    channel: ChannelHeaderChannel;
    isMobile: boolean;
  }) => ReactNode;

  /** Whether to show the member count below the channel name */
  showMemberCount?: boolean;

  /** Label for members button (default: "{count} members") */
  membersButtonLabel?: (count: number) => string;

  /** Whether to use Settings icon instead of UserCog for members button */
  useSettingsIcon?: boolean;
}

export interface ChannelSearchInputProps {
  /** Current search query */
  searchQuery: string;

  /** Callback when search query changes */
  onSearchChange: (query: string) => void;

  /** Callback when search is cleared or escaped */
  onClear: () => void;

  /** Placeholder text */
  placeholder?: string;

  /** Whether the input is on mobile */
  isMobile?: boolean;

  /** Ref for the input element */
  inputRef?: React.RefObject<HTMLInputElement>;

  /** Additional className */
  className?: string;
}

// ============================================================================
// ChannelIcon
// ============================================================================

export function ChannelIcon({
  channel,
  className = 'w-5 h-5',
}: {
  channel: ChannelHeaderChannel;
  className?: string;
}) {
  if (channel.channelType === 'direct') {
    return <Users className={`text-gray-400 ${className}`} />;
  }

  if (channel.permissions?.visibility === 'private') {
    return <Lock className={`text-gray-400 ${className}`} />;
  }

  return <Hash className={`text-gray-400 ${className}`} />;
}

// ============================================================================
// ChannelSearchInput
// ============================================================================

export function ChannelSearchInput({
  searchQuery,
  onSearchChange,
  onClear,
  placeholder = 'Search messages...',
  isMobile = false,
  inputRef,
  className = '',
}: ChannelSearchInputProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || localRef;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClear();
      ref.current?.blur();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Search
        className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 ${
          isMobile ? 'w-4 h-4' : 'w-4 h-4'
        }`}
      />
      <input
        ref={ref}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--color-surface)] text-[var(--color-text)] ${
          isMobile
            ? 'pl-10 pr-10 py-2.5 text-base'
            : 'pl-8 pr-8 py-1.5 text-sm'
        }`}
        data-testid="channel-search-input"
      />
      {searchQuery && (
        <button
          onClick={() => {
            onClear();
            ref.current?.focus();
          }}
          className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ${
            isMobile ? 'right-3' : 'right-2'
          }`}
          data-testid="channel-search-clear"
        >
          <XCircle className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// ChannelHeader
// ============================================================================

export function ChannelHeader({
  channel,
  isMobile = false,
  onBack,
  onOpenMembers,
  renderIcon,
  renderActions,
  showMemberCount = false,
  membersButtonLabel,
  useSettingsIcon = false,
}: ChannelHeaderProps) {
  const memberCount = channel.members?.length || 0;
  const defaultMembersLabel = (count: number) =>
    `${count} ${count === 1 ? 'member' : 'members'}`;

  const IconComponent = useSettingsIcon ? Settings : UserCog;

  return (
    <div
      data-testid="channel-header"
      className={`border-b border-[var(--color-border)] bg-[var(--color-bg)] ${
        isMobile ? 'px-2 py-2' : 'px-4 py-3'
      }`}
    >
      <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-2 sm:gap-3'}`}>
        {/* Mobile back button */}
        {isMobile && onBack && (
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
            data-testid="channel-back-button"
            aria-label="Back to channels"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Channel icon */}
        {renderIcon ? (
          renderIcon(channel)
        ) : (
          <ChannelIcon
            channel={channel}
            className={isMobile ? 'w-4 h-4' : 'w-5 h-5'}
          />
        )}

        {/* Channel name */}
        <h3
          data-testid="channel-name"
          className={`font-medium text-[var(--color-text)] truncate ${
            isMobile ? 'text-base' : showMemberCount ? 'text-lg font-semibold' : ''
          }`}
        >
          {channel.name}
        </h3>

        {/* Member count - inline after channel name */}
        {onOpenMembers && !isMobile && (
          <button
            onClick={onOpenMembers}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
            data-testid="channel-members-button"
          >
            <IconComponent className="w-4 h-4" />
            {(membersButtonLabel || defaultMembersLabel)(memberCount)}
          </button>
        )}

        {/* Spacer pushes actions to the right */}
        <div className="flex-1" />

        {/* Custom actions (search, etc.) */}
        {renderActions?.({ channel, isMobile })}

        {/* Mobile members button */}
        {onOpenMembers && isMobile && (
          <button
            onClick={onOpenMembers}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
            data-testid="channel-members-button"
            aria-label="View members"
          >
            {useSettingsIcon ? (
              <Settings className="w-5 h-5" />
            ) : (
              <Users className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// useChannelSearch - Hook for managing channel search state
// ============================================================================

export interface UseChannelSearchOptions {
  /** Callback when a search result is selected */
  onResultSelect?: (messageId: string) => void;

  /** Whether to enable keyboard shortcut (Cmd/Ctrl + F) */
  enableKeyboardShortcut?: boolean;
}

export interface UseChannelSearchReturn {
  /** Current search query */
  searchQuery: string;

  /** Set search query */
  setSearchQuery: (query: string) => void;

  /** Whether search dropdown is open */
  isSearchOpen: boolean;

  /** Set whether search dropdown is open */
  setIsSearchOpen: (open: boolean) => void;

  /** Ref for the search input */
  searchInputRef: React.RefObject<HTMLInputElement | null>;

  /** Handle search result selection */
  handleResultSelect: (messageId: string) => void;

  /** Clear search */
  clearSearch: () => void;
}

export function useChannelSearch(
  options: UseChannelSearchOptions = {}
): UseChannelSearchReturn {
  const { onResultSelect, enableKeyboardShortcut = true } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleResultSelect = useCallback(
    (messageId: string) => {
      setSearchQuery('');
      setIsSearchOpen(false);
      onResultSelect?.(messageId);
    },
    [onResultSelect]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearchOpen(false);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + F
  useEffect(() => {
    if (!enableKeyboardShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcut]);

  return {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    searchInputRef,
    handleResultSelect,
    clearSearch,
  };
}

export default ChannelHeader;
