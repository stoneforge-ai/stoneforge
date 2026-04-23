import { useState, useEffect, useCallback, useRef } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useIsMobile } from '../../hooks';
import {
  LayoutDashboard,
  CheckSquare,
  Folder,
  Workflow,
  MessageSquare,
  FileText,
  Users,
  UsersRound,
  Settings,
  Network,
  History,
  Search,
  Command as CommandIcon,
  Loader2,
  Inbox,
  ChevronLeft,
  X,
  type LucideIcon,
} from 'lucide-react';

// TB103: Message search types for command palette
interface MessageSearchResult {
  id: string;
  channelId: string;
  sender: string;
  content: string;
  snippet: string;
  createdAt: string;
  threadId: string | null;
}

interface MessageSearchResponse {
  results: MessageSearchResult[];
  query: string;
}

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Hook to search messages globally (TB103)
function useGlobalMessageSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery<MessageSearchResponse>({
    queryKey: ['messages', 'search', 'global', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) {
        return { results: [], query: '' };
      }
      const params = new URLSearchParams({
        q: debouncedQuery,
        limit: '10',
      });
      const response = await fetch(`/api/messages/search?${params}`);
      if (!response.ok) {
        throw new Error('Failed to search messages');
      }
      return response.json();
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30000,
  });
}

interface CommandItem {
  id: string;
  label: string;
  icon: LucideIcon;
  action: () => void;
  shortcut?: string;
  group: string;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'commands' | 'messages'>('commands');
  const [searchQuery, setSearchQuery] = useState(''); // For message search
  const [commandSearch, setCommandSearch] = useState(''); // For command search (cmdk)
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // TB103: Global message search
  const { data: messageSearchResponse, isLoading: isSearchingMessages } = useGlobalMessageSearch(
    mode === 'messages' ? searchQuery : ''
  );
  const messageResults = messageSearchResponse?.results || [];

  // Reset mode and search when closing
  useEffect(() => {
    if (!open) {
      setMode('commands');
      setSearchQuery('');
      setCommandSearch('');
    }
  }, [open]);

  // Handle message result selection
  const handleSelectMessage = useCallback((result: MessageSearchResult) => {
    setOpen(false);
    navigate({
      to: '/messages',
      search: { channel: result.channelId, message: result.id },
    });
    // Add a small delay before scrolling to message
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-testid="message-${result.id}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.classList.add('bg-yellow-100', 'ring-2', 'ring-yellow-300');
        setTimeout(() => {
          messageElement.classList.remove('bg-yellow-100', 'ring-2', 'ring-yellow-300');
        }, 2000);
      }
    }, 500);
  }, [navigate]);

  // Build the navigation commands
  const commands: CommandItem[] = [
    // Dashboard section
    {
      id: 'nav-dashboard',
      label: 'Go to Dashboard',
      icon: LayoutDashboard,
      action: () => navigate({ to: '/dashboard' }),
      shortcut: 'G H',
      group: 'Dashboard',
      keywords: ['overview', 'home'],
    },
    {
      id: 'nav-timeline',
      label: 'Go to Timeline',
      icon: History,
      action: () => navigate({ to: '/dashboard/timeline', search: { page: 1, limit: 100, actor: undefined, startTime: undefined, endTime: undefined } }),
      shortcut: 'G L',
      group: 'Dashboard',
      keywords: ['events', 'history', 'activity'],
    },
    // Work section
    {
      id: 'nav-tasks',
      label: 'Go to Tasks',
      icon: CheckSquare,
      action: () => navigate({ to: '/tasks', search: { page: 1, limit: 25 } }),
      shortcut: 'G T',
      group: 'Work',
      keywords: ['todo', 'items', 'list'],
    },
    {
      id: 'nav-plans',
      label: 'Go to Plans',
      icon: Folder,
      action: () => navigate({ to: '/plans' }),
      shortcut: 'G P',
      group: 'Work',
      keywords: ['epic', 'project', 'collection'],
    },
    {
      id: 'nav-workflows',
      label: 'Go to Workflows',
      icon: Workflow,
      action: () => navigate({ to: '/workflows' }),
      shortcut: 'G W',
      group: 'Work',
      keywords: ['automation', 'create', 'playbook'],
    },
    {
      id: 'nav-dependencies',
      label: 'Go to Dependencies',
      icon: Network,
      action: () => navigate({ to: '/dependencies' }),
      shortcut: 'G G',
      group: 'Work',
      keywords: ['graph', 'blocks', 'relationships'],
    },
    // Collaborate section
    {
      id: 'nav-inbox',
      label: 'Go to Inbox',
      icon: Inbox,
      action: () => navigate({ to: '/inbox', search: { message: undefined } }),
      shortcut: 'G I',
      group: 'Collaborate',
      keywords: ['notifications', 'unread', 'mentions', 'direct messages'],
    },
    {
      id: 'nav-messages',
      label: 'Go to Messages',
      icon: MessageSquare,
      action: () => navigate({ to: '/messages', search: { channel: undefined, message: undefined } }),
      shortcut: 'G M',
      group: 'Collaborate',
      keywords: ['chat', 'channels', 'communication'],
    },
    {
      id: 'search-messages',
      label: 'Search Messages',
      icon: Search,
      action: () => {
        setMode('messages');
        setSearchQuery('');
        setTimeout(() => inputRef.current?.focus(), 0);
      },
      group: 'Collaborate',
      keywords: ['find', 'message', 'content', 'search'],
    },
    {
      id: 'nav-documents',
      label: 'Go to Documents',
      icon: FileText,
      action: () => navigate({ to: '/documents', search: { selected: undefined, library: undefined } }),
      shortcut: 'G D',
      group: 'Collaborate',
      keywords: ['files', 'notes', 'library'],
    },
    // Organize section
    {
      id: 'nav-entities',
      label: 'Go to Entities',
      icon: Users,
      action: () => navigate({ to: '/entities', search: { selected: undefined, name: undefined, page: 1, limit: 25 } }),
      shortcut: 'G E',
      group: 'Organize',
      keywords: ['people', 'agents', 'humans'],
    },
    {
      id: 'nav-teams',
      label: 'Go to Teams',
      icon: UsersRound,
      action: () => navigate({ to: '/teams', search: { selected: undefined, page: 1, limit: 25 } }),
      shortcut: 'G R',
      group: 'Organize',
      keywords: ['groups', 'members'],
    },
    // Settings
    {
      id: 'nav-settings',
      label: 'Go to Settings',
      icon: Settings,
      action: () => navigate({ to: '/settings' }),
      group: 'Settings',
      keywords: ['preferences', 'config'],
    },
  ];

  // Group commands by their group
  const groupedCommands = commands.reduce((acc, cmd) => {
    if (!acc[cmd.group]) {
      acc[cmd.group] = [];
    }
    acc[cmd.group].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  const groupOrder = ['Dashboard', 'Work', 'Collaborate', 'Organize', 'Settings'];

  // Handle keyboard shortcut to open command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for custom event to open command palette (for mobile search button)
  useEffect(() => {
    const handleOpenCommandPalette = () => {
      setOpen(true);
    };

    window.addEventListener('open-command-palette', handleOpenCommandPalette);
    return () => window.removeEventListener('open-command-palette', handleOpenCommandPalette);
  }, []);

  const handleSelect = useCallback((command: CommandItem) => {
    // For commands that switch mode, don't close
    if (command.id === 'search-messages') {
      command.action();
      return;
    }
    setOpen(false);
    command.action();
  }, []);

  // Format time for message results
  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (!open) {
    return null;
  }

  // Mobile: Full-screen command palette with touch-friendly layout
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 bg-[var(--color-bg)]"
        data-testid="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {mode === 'messages' ? (
          // TB103: Mobile Message Search Mode
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <button
                onClick={() => setMode('commands')}
                className="p-2 -ml-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
                data-testid="message-search-back"
                aria-label="Back to commands"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
                <MessageSquare className="w-4 h-4" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 py-2 text-base bg-transparent outline-none placeholder:text-[var(--color-text-muted)] text-[var(--color-text)]"
                data-testid="command-palette-message-search-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (searchQuery) {
                      setSearchQuery('');
                    } else {
                      setMode('commands');
                    }
                  }
                }}
              />
              <button
                onClick={() => setOpen(false)}
                className="p-2 -mr-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Message Results */}
            <div className="flex-1 overflow-y-auto p-2" data-testid="command-palette-message-results">
              {isSearchingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
                  <span className="ml-2 text-[var(--color-text-muted)]">Searching...</span>
                </div>
              ) : !searchQuery.trim() ? (
                <div className="py-10 text-center">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                  <div className="text-[var(--color-text-tertiary)] text-sm">Type to search messages</div>
                  <div className="text-[var(--color-text-muted)] text-xs mt-1">Search across all channels</div>
                </div>
              ) : messageResults.length === 0 ? (
                <div className="py-10 text-center">
                  <Search className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                  <div className="text-[var(--color-text-tertiary)] text-sm">No messages found</div>
                  <div className="text-[var(--color-text-muted)] text-xs mt-1">Try a different search term</div>
                </div>
              ) : (
                <div className="space-y-1">
                  {messageResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectMessage(result)}
                      className="w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors hover:bg-[var(--color-surface-selected)] active:bg-[var(--color-surface-selected)] min-h-[56px] touch-target"
                      data-testid={`command-palette-message-${result.id}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 font-medium text-sm">
                          {result.sender.slice(-2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-[var(--color-text)]">{result.sender}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">{formatMessageTime(result.createdAt)}</span>
                        </div>
                        <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mt-0.5">
                          {result.snippet}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          // Mobile Commands Mode
          <Command
            className="flex flex-col h-full"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <button
                onClick={() => setOpen(false)}
                className="p-2 -ml-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
                data-testid="command-palette-close-mobile"
                aria-label="Close"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
                <Search className="w-5 h-5" />
              </div>
              <Command.Input
                value={commandSearch}
                onValueChange={setCommandSearch}
                placeholder="Search commands..."
                className="flex-1 py-2 text-base bg-transparent outline-none placeholder:text-[var(--color-text-muted)] text-[var(--color-text)]"
                data-testid="command-palette-input"
                autoFocus
              />
            </div>

            {/* Command List */}
            <Command.List className="flex-1 overflow-y-auto p-2" data-testid="command-palette-list-mobile">
                <Command.Empty className="py-10 text-center">
                  <div className="text-[var(--color-text-tertiary)] text-sm">No results found.</div>
                  <div className="text-[var(--color-text-muted)] text-xs mt-1">Try a different search term</div>
                </Command.Empty>

                {groupOrder.map((group) => {
                  const items = groupedCommands[group];
                  if (!items) return null;

                  return (
                    <Command.Group
                      key={group}
                      heading={group}
                      className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--color-text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                    >
                      {items.map((cmd) => {
                        const Icon = cmd.icon;
                        return (
                          <Command.Item
                            key={cmd.id}
                            value={`${cmd.label} ${cmd.keywords?.join(' ') || ''}`}
                            onSelect={() => handleSelect(cmd)}
                            className="flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer text-[var(--color-text-secondary)] transition-colors duration-100 aria-selected:bg-[var(--color-surface-selected)] aria-selected:text-[var(--color-text)] group min-h-[52px] touch-target"
                            data-testid={`command-item-${cmd.id}`}
                          >
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--color-surface-hover)] group-aria-selected:bg-[var(--color-primary-muted)] transition-colors">
                              <Icon className="w-5 h-5 text-[var(--color-text-tertiary)] group-aria-selected:text-[var(--color-primary-text)]" />
                            </div>
                            <span className="flex-1 font-medium text-base">{cmd.label}</span>
                            {/* Hide keyboard shortcuts on mobile */}
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  );
                })}
              </Command.List>
          </Command>
        )}
      </div>
    );
  }

  // Desktop/Tablet: Centered modal command palette
  return (
    <div className="fixed inset-0 z-50" data-testid="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm"
        onClick={() => setOpen(false)}
        data-testid="command-palette-backdrop"
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl px-4">
        {mode === 'messages' ? (
          // TB103: Message Search Mode
          <div className="bg-[var(--color-surface)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden">
            {/* Search header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
              <button
                onClick={() => setMode('commands')}
                className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded transition-colors"
                data-testid="message-search-back"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
                <MessageSquare className="w-4 h-4" />
                <Search className="w-5 h-5" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all messages..."
                className="w-full py-1 text-lg bg-transparent outline-none placeholder:text-[var(--color-text-muted)] text-[var(--color-text)]"
                data-testid="command-palette-message-search-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (searchQuery) {
                      setSearchQuery('');
                    } else {
                      setMode('commands');
                    }
                  }
                }}
              />
              <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-md border border-[var(--color-border-secondary)]">
                esc
              </kbd>
            </div>

            {/* Message Results */}
            <div className="max-h-[400px] overflow-y-auto p-2" data-testid="command-palette-message-results">
              {isSearchingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
                  <span className="ml-2 text-[var(--color-text-muted)]">Searching...</span>
                </div>
              ) : !searchQuery.trim() ? (
                <div className="py-10 text-center">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                  <div className="text-[var(--color-text-tertiary)] text-sm">Type to search messages</div>
                  <div className="text-[var(--color-text-muted)] text-xs mt-1">Search across all channels</div>
                </div>
              ) : messageResults.length === 0 ? (
                <div className="py-10 text-center">
                  <Search className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                  <div className="text-[var(--color-text-tertiary)] text-sm">No messages found</div>
                  <div className="text-[var(--color-text-muted)] text-xs mt-1">Try a different search term</div>
                </div>
              ) : (
                <div className="space-y-1">
                  {messageResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectMessage(result)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-[var(--color-surface-selected)]"
                      data-testid={`command-palette-message-${result.id}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 font-medium text-xs">
                          {result.sender.slice(-2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-[var(--color-text)]">{result.sender}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">{formatMessageTime(result.createdAt)}</span>
                        </div>
                        <p className="text-sm text-[var(--color-text-secondary)] truncate mt-0.5">
                          {result.snippet}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">↵</kbd>
                to select
                <span className="mx-2">·</span>
                <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">esc</kbd>
                to go back
              </span>
            </div>
          </div>
        ) : (
          // Commands Mode
          <Command
            className="bg-[var(--color-surface)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
          >
            {/* Search header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
                <CommandIcon className="w-4 h-4" />
                <Search className="w-5 h-5" />
              </div>
              <Command.Input
                placeholder="Search commands..."
                className="w-full py-1 text-lg bg-transparent outline-none placeholder:text-[var(--color-text-muted)] text-[var(--color-text)]"
                data-testid="command-palette-input"
                autoFocus
              />
              <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-md border border-[var(--color-border-secondary)]">
                esc
              </kbd>
            </div>

            <Command.List className="max-h-[400px] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center">
                <div className="text-[var(--color-text-tertiary)] text-sm">No results found.</div>
                <div className="text-[var(--color-text-muted)] text-xs mt-1">Try a different search term</div>
              </Command.Empty>

              {groupOrder.map((group) => {
                const items = groupedCommands[group];
                if (!items) return null;

                return (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--color-text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {items.map((cmd) => {
                      const Icon = cmd.icon;
                      return (
                        <Command.Item
                          key={cmd.id}
                          value={`${cmd.label} ${cmd.keywords?.join(' ') || ''}`}
                          onSelect={() => handleSelect(cmd)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[var(--color-text-secondary)] transition-colors duration-100 aria-selected:bg-[var(--color-surface-selected)] aria-selected:text-[var(--color-text)] group"
                          data-testid={`command-item-${cmd.id}`}
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-surface-hover)] group-aria-selected:bg-[var(--color-primary-muted)] transition-colors">
                            <Icon className="w-4 h-4 text-[var(--color-text-tertiary)] group-aria-selected:text-[var(--color-primary-text)]" />
                          </div>
                          <span className="flex-1 font-medium">{cmd.label}</span>
                          {cmd.shortcut && (
                            <div className="flex items-center gap-1">
                              {cmd.shortcut.split(' ').map((key, i) => (
                                <kbd
                                  key={i}
                                  className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded border border-[var(--color-border-secondary)] min-w-[20px] text-center"
                                >
                                  {key}
                                </kbd>
                              ))}
                            </div>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                );
              })}
            </Command.List>

            {/* Footer hint */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">↑</kbd>
                  <kbd className="px-1 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">↓</kbd>
                  to navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">↵</kbd>
                  to select
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">⌘K</kbd>
                to toggle
              </span>
            </div>
          </Command>
        )}
      </div>
    </div>
  );
}
