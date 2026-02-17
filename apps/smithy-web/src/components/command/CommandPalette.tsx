/**
 * CommandPalette - Cmd+K palette for quick navigation and actions
 * Uses cmdk library for fuzzy search and keyboard navigation
 */

import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { useRouter } from '@tanstack/react-router';
import {
  Activity,
  CheckSquare,
  Users,
  LayoutGrid,
  Workflow,
  BarChart3,
  Settings,
  Plus,
  Play,
  Square,
  ArrowRight,
  Search,
  Bot,
  Wrench,
  Clock,
  GitBranch,
  GitMerge,
  ClipboardList,
  RefreshCw,
  FileText,
  Terminal,
  Moon,
  Sun,
  Monitor,
  Maximize2,
} from 'lucide-react';

// Command types
type CommandCategory =
  | 'navigation'
  | 'tasks'
  | 'agents'
  | 'workflows'
  | 'actions'
  | 'settings';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Category labels and icons
const CATEGORY_CONFIG: Record<CommandCategory, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  navigation: { label: 'Navigation', icon: ArrowRight },
  tasks: { label: 'Tasks', icon: CheckSquare },
  agents: { label: 'Agents', icon: Bot },
  workflows: { label: 'Workflows', icon: Workflow },
  actions: { label: 'Quick Actions', icon: Play },
  settings: { label: 'Settings', icon: Settings },
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // Navigate helper
  const navigateTo = useCallback(
    (path: string, search?: Record<string, string>) => {
      router.navigate({ to: path, search });
      onOpenChange(false);
    },
    [router, onOpenChange]
  );

  // Theme toggle helper
  const setTheme = useCallback((theme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    localStorage.setItem('theme', theme);

    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', isDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
    onOpenChange(false);
  }, [onOpenChange]);

  // Define all commands
  const commands: CommandItem[] = [
    // Navigation commands
    {
      id: 'nav-activity',
      label: 'Go to Activity',
      description: 'View real-time activity feed',
      category: 'navigation',
      icon: Activity,
      keywords: ['home', 'feed', 'events', 'activity'],
      action: () => navigateTo('/activity'),
      shortcut: 'G A',
    },
    {
      id: 'nav-tasks',
      label: 'Go to Tasks',
      description: 'View and manage tasks',
      category: 'navigation',
      icon: CheckSquare,
      keywords: ['tasks', 'todos', 'work', 'items'],
      action: () => navigateTo('/tasks'),
      shortcut: 'G T',
    },
    {
      id: 'nav-agents',
      label: 'Go to Agents',
      description: 'View and manage agents',
      category: 'navigation',
      icon: Users,
      keywords: ['agents', 'workers', 'director', 'steward'],
      action: () => navigateTo('/agents'),
      shortcut: 'G E',
    },
    {
      id: 'nav-stewards',
      label: 'Go to Stewards',
      description: 'View steward agents',
      category: 'navigation',
      icon: Wrench,
      keywords: ['stewards', 'automation', 'merge', 'docs'],
      action: () => navigateTo('/agents', { tab: 'stewards' }),
    },
    {
      id: 'nav-workspaces',
      label: 'Go to Workspaces',
      description: 'Terminal multiplexer view',
      category: 'navigation',
      icon: LayoutGrid,
      keywords: ['workspaces', 'terminal', 'multiplexer', 'panes'],
      action: () => navigateTo('/workspaces'),
      shortcut: 'G W',
    },
    {
      id: 'nav-workflows',
      label: 'Go to Workflows',
      description: 'View workflow templates',
      category: 'navigation',
      icon: Workflow,
      keywords: ['workflows', 'templates', 'playbooks'],
      action: () => navigateTo('/workflows'),
      shortcut: 'G F',
    },
    {
      id: 'nav-metrics',
      label: 'Go to Metrics',
      description: 'View performance metrics',
      category: 'navigation',
      icon: BarChart3,
      keywords: ['metrics', 'analytics', 'stats', 'performance', 'dashboard'],
      action: () => navigateTo('/metrics'),
      shortcut: 'G M',
    },
    {
      id: 'nav-settings',
      label: 'Go to Settings',
      description: 'App preferences and configuration',
      category: 'navigation',
      icon: Settings,
      keywords: ['settings', 'preferences', 'config', 'options'],
      action: () => navigateTo('/settings'),
      shortcut: 'G S',
    },
    {
      id: 'nav-plans',
      label: 'Go to Plans',
      description: 'View and manage plans',
      category: 'navigation',
      icon: ClipboardList,
      keywords: ['plans', 'roadmap', 'milestones', 'goals'],
      action: () => navigateTo('/plans'),
      shortcut: 'G P',
    },
    {
      id: 'nav-merge-requests',
      label: 'Go to Merge Requests',
      description: 'Review and merge agent work',
      category: 'navigation',
      icon: GitMerge,
      keywords: ['merge', 'requests', 'pr', 'pull', 'review', 'git'],
      action: () => navigateTo('/merge-requests'),
      shortcut: 'G R',
    },

    // Task commands
    {
      id: 'task-create',
      label: 'Create Task',
      description: 'Create a new task',
      category: 'tasks',
      icon: Plus,
      keywords: ['create', 'new', 'task', 'add'],
      action: () => navigateTo('/tasks', { action: 'create' }),
      shortcut: 'C T',
    },
    {
      id: 'task-unassigned',
      label: 'View Unassigned Tasks',
      description: 'Tasks waiting for assignment',
      category: 'tasks',
      icon: Clock,
      keywords: ['unassigned', 'pending', 'queue', 'backlog'],
      action: () => navigateTo('/tasks', { status: 'unassigned' }),
    },
    {
      id: 'task-in-progress',
      label: 'View In Progress Tasks',
      description: 'Tasks currently being worked on',
      category: 'tasks',
      icon: Play,
      keywords: ['progress', 'active', 'working', 'running'],
      action: () => navigateTo('/tasks', { status: 'in_progress' }),
    },
    {
      id: 'task-awaiting-merge',
      label: 'View Awaiting Merge',
      description: 'Tasks ready for merge review',
      category: 'tasks',
      icon: GitBranch,
      keywords: ['merge', 'review', 'pr', 'pull request', 'awaiting'],
      action: () => navigateTo('/tasks', { status: 'awaiting_merge' }),
    },

    // Agent commands
    {
      id: 'agent-create',
      label: 'Create Agent',
      description: 'Register a new agent',
      category: 'agents',
      icon: Plus,
      keywords: ['create', 'new', 'agent', 'worker', 'register'],
      action: () => navigateTo('/agents', { action: 'create' }),
      shortcut: 'C A',
    },
    {
      id: 'agent-create-steward',
      label: 'Create Steward',
      description: 'Create a new steward agent',
      category: 'agents',
      icon: Wrench,
      keywords: ['create', 'steward', 'automation', 'merge', 'docs'],
      action: () => navigateTo('/agents', { tab: 'stewards', action: 'create' }),
    },
    {
      id: 'agent-start-all',
      label: 'Start All Agents',
      description: 'Start all registered agents',
      category: 'agents',
      icon: Play,
      keywords: ['start', 'all', 'agents', 'boot'],
      action: () => {
        // This would trigger an API call - for now just navigate
        navigateTo('/agents');
      },
    },
    {
      id: 'agent-stop-all',
      label: 'Stop All Agents',
      description: 'Stop all running agents',
      category: 'agents',
      icon: Square,
      keywords: ['stop', 'all', 'agents', 'halt', 'shutdown'],
      action: () => {
        // This would trigger an API call - for now just navigate
        navigateTo('/agents');
      },
    },

    // Workflow commands
    {
      id: 'workflow-templates',
      label: 'View Templates',
      description: 'Browse workflow templates',
      category: 'workflows',
      icon: FileText,
      keywords: ['templates', 'playbooks', 'workflows'],
      action: () => navigateTo('/workflows', { tab: 'templates' }),
    },
    {
      id: 'workflow-active',
      label: 'View Active Workflows',
      description: 'Running workflow instances',
      category: 'workflows',
      icon: RefreshCw,
      keywords: ['active', 'running', 'workflows', 'instances'],
      action: () => navigateTo('/workflows', { tab: 'active' }),
    },

    // Quick actions
    {
      id: 'action-refresh',
      label: 'Refresh Data',
      description: 'Refresh all data from server',
      category: 'actions',
      icon: RefreshCw,
      keywords: ['refresh', 'reload', 'sync', 'update'],
      action: () => {
        window.location.reload();
      },
      shortcut: 'R',
    },
    {
      id: 'action-open-terminal',
      label: 'Open Director Terminal',
      description: 'Open the Director terminal panel',
      category: 'actions',
      icon: Terminal,
      keywords: ['terminal', 'director', 'console', 'cli'],
      action: () => {
        // Toggle director panel - dispatch custom event
        window.dispatchEvent(new CustomEvent('toggle-director-panel'));
        onOpenChange(false);
      },
      shortcut: 'T',
    },
    {
      id: 'action-maximize-director',
      label: 'Maximize Director Panel',
      description: 'Toggle maximize/restore the Director panel',
      category: 'actions',
      icon: Maximize2,
      keywords: ['maximize', 'fullscreen', 'director', 'terminal', 'restore', 'minimize'],
      action: () => {
        window.dispatchEvent(new CustomEvent('maximize-director-panel'));
        onOpenChange(false);
      },
    },

    // Settings commands
    {
      id: 'settings-preferences',
      label: 'Preferences',
      description: 'User preferences',
      category: 'settings',
      icon: Settings,
      keywords: ['preferences', 'settings', 'options'],
      action: () => navigateTo('/settings', { tab: 'preferences' }),
    },
    {
      id: 'settings-workspace',
      label: 'Workspace Settings',
      description: 'Workspace configuration',
      category: 'settings',
      icon: LayoutGrid,
      keywords: ['workspace', 'config', 'settings'],
      action: () => navigateTo('/settings', { tab: 'workspace' }),
    },
    {
      id: 'theme-light',
      label: 'Switch to Light Theme',
      description: 'Use light color theme',
      category: 'settings',
      icon: Sun,
      keywords: ['light', 'theme', 'bright', 'day'],
      action: () => setTheme('light'),
    },
    {
      id: 'theme-dark',
      label: 'Switch to Dark Theme',
      description: 'Use dark color theme',
      category: 'settings',
      icon: Moon,
      keywords: ['dark', 'theme', 'night'],
      action: () => setTheme('dark'),
    },
    {
      id: 'theme-system',
      label: 'Use System Theme',
      description: 'Follow system color preference',
      category: 'settings',
      icon: Monitor,
      keywords: ['system', 'theme', 'auto', 'automatic'],
      action: () => setTheme('system'),
    },
  ];

  // Group commands by category
  const groupedCommands = commands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<CommandCategory, CommandItem[]>
  );

  // Category order for display
  const categoryOrder: CommandCategory[] = [
    'navigation',
    'tasks',
    'agents',
    'workflows',
    'actions',
    'settings',
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="fixed inset-0 z-[var(--z-index-modal)] flex items-start justify-center pt-[20vh]"
      data-testid="command-palette"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        data-testid="command-palette-backdrop"
      />

      {/* Dialog content */}
      <div
        className="relative w-full max-w-lg bg-[var(--color-bg-elevated)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
        data-testid="command-palette-dialog"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)]">
          <Search className="w-5 h-5 text-[var(--color-text-muted)]" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command or search..."
            className="flex-1 h-14 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none text-base"
            data-testid="command-palette-input"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <Command.List
          className="max-h-[400px] overflow-y-auto p-2"
          data-testid="command-palette-list"
        >
          <Command.Empty className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            No results found.
          </Command.Empty>

          {categoryOrder.map((category) => {
            const items = groupedCommands[category];
            if (!items || items.length === 0) return null;

            const config = CATEGORY_CONFIG[category];

            return (
              <Command.Group
                key={category}
                heading={config.label}
                className="mb-2"
                data-testid={`command-group-${category}`}
              >
                <div className="px-2 py-1.5 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                  {config.label}
                </div>
                {items.map((cmd) => (
                  <CommandItemComponent
                    key={cmd.id}
                    command={cmd}
                    onSelect={() => cmd.action()}
                  />
                ))}
              </Command.Group>
            );
          })}
        </Command.List>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↵
              </kbd>
              <span>Select</span>
            </span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
              ⌘K
            </kbd>
            {' '}to open
          </div>
        </div>
      </div>
    </Command.Dialog>
  );
}

// Individual command item component
function CommandItemComponent({
  command,
  onSelect,
}: {
  command: CommandItem;
  onSelect: () => void;
}) {
  const Icon = command.icon;

  return (
    <Command.Item
      value={[command.label, command.description, ...(command.keywords || [])].join(' ')}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] data-[selected=true]:bg-[var(--color-surface-selected)] data-[selected=true]:text-[var(--color-text)] transition-colors duration-100"
      data-testid={`command-item-${command.id}`}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-surface)] text-[var(--color-text-muted)]">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{command.label}</div>
        {command.description && (
          <div className="text-xs text-[var(--color-text-muted)] truncate">
            {command.description}
          </div>
        )}
      </div>
      {command.shortcut && (
        <kbd className="hidden sm:block px-2 py-1 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded">
          {command.shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}

// Hook for global keyboard shortcut
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}

export default CommandPalette;
