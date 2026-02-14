import { useState, useCallback } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  CheckSquare,
  ClipboardList,
  Workflow,
  MessageSquare,
  FileText,
  Users,
  UsersRound,
  Settings,
  ChevronLeft,
  ChevronDown,
  Network,
  History,
  PanelLeftOpen,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip } from '@stoneforge/ui';
import { getCurrentBinding, useShortcutVersion } from '../../lib/keyboard';
import { useCurrentUser } from '../../contexts';

// Hook to fetch inbox unread count for the current user
function useUserInboxCount(entityId: string | null) {
  return useQuery<{ count: number }>({
    queryKey: ['inbox', entityId, 'count'],
    queryFn: async () => {
      if (!entityId) return { count: 0 };
      const params = new URLSearchParams({ entityId });
      const response = await fetch(`/api/inbox/count?${params}`);
      if (!response.ok) return { count: 0 };
      return response.json();
    },
    enabled: !!entityId,
    staleTime: 0, // Always consider data stale for real-time updates
    refetchOnWindowFocus: 'always', // Always refetch when tab becomes active (handles missed WebSocket events)
    refetchInterval: 30000, // Also poll every 30 seconds as a fallback
  });
}

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Action ID for looking up the shortcut binding via getCurrentBinding() */
  actionId?: string;
  testId?: string;
  search?: Record<string, unknown>;
  badgeKey?: 'inbox'; // Badge to show for this item
}

interface NavSection {
  id: string;
  label: string;
  icon?: LucideIcon;
  defaultExpanded?: boolean;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    defaultExpanded: true,
    items: [
      { to: '/dashboard/overview', icon: LayoutDashboard, label: 'Overview', actionId: 'nav.dashboard', testId: 'nav-dashboard' },
      { to: '/dashboard/timeline', icon: History, label: 'Timeline', actionId: 'nav.timeline', testId: 'nav-timeline', search: { page: 1, limit: 100, actor: undefined } },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    defaultExpanded: true,
    items: [
      { to: '/tasks', icon: CheckSquare, label: 'Tasks', actionId: 'nav.tasks', testId: 'nav-tasks', search: { page: 1, limit: 25 } },
      { to: '/plans', icon: ClipboardList, label: 'Plans', actionId: 'nav.plans', testId: 'nav-plans' },
      { to: '/workflows', icon: Workflow, label: 'Workflows', actionId: 'nav.workflows', testId: 'nav-workflows' },
      { to: '/dependencies', icon: Network, label: 'Dependencies', actionId: 'nav.dependencies', testId: 'nav-dependencies' },
    ],
  },
  {
    id: 'collaborate',
    label: 'Collaborate',
    defaultExpanded: true,
    items: [
      { to: '/inbox', icon: Inbox, label: 'Inbox', actionId: 'nav.inbox', testId: 'nav-inbox', search: { message: undefined }, badgeKey: 'inbox' },
      { to: '/messages', icon: MessageSquare, label: 'Messages', actionId: 'nav.messages', testId: 'nav-messages', search: { channel: undefined, message: undefined } },
      { to: '/documents', icon: FileText, label: 'Documents', actionId: 'nav.documents', testId: 'nav-documents', search: { selected: undefined, library: undefined } },
    ],
  },
  {
    id: 'organize',
    label: 'Organize',
    defaultExpanded: true,
    items: [
      { to: '/entities', icon: Users, label: 'Entities', actionId: 'nav.entities', testId: 'nav-entities', search: { selected: undefined, name: undefined, page: 1, limit: 25 } },
      { to: '/teams', icon: UsersRound, label: 'Teams', actionId: 'nav.teams', testId: 'nav-teams', search: { selected: undefined, page: 1, limit: 25 } },
    ],
  },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { to: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings' },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  /** When true, sidebar is displayed inside a mobile drawer */
  isMobileDrawer?: boolean;
}

export function Sidebar({ collapsed = false, onToggle, isMobileDrawer = false }: SidebarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { currentUser } = useCurrentUser();

  // Fetch inbox unread count for the current user (TB137)
  const { data: inboxCount } = useUserInboxCount(currentUser?.id ?? null);

  // Track shortcut changes to re-render with updated hints
  useShortcutVersion();

  // Track expanded sections - default to section's defaultExpanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() =>
    new Set(NAV_SECTIONS.filter(s => s.defaultExpanded).map(s => s.id))
  );

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const isPathActive = (path: string) => {
    // Exact match for overview and all other paths
    return currentPath === path;
  };

  const renderNavItem = (item: NavItem, inSection: boolean = false) => {
    const isActive = isPathActive(item.to);
    const Icon = item.icon;

    // Get badge count for items that have badges (TB137)
    let badgeCount: number | undefined;
    if (item.badgeKey === 'inbox' && inboxCount?.count && inboxCount.count > 0) {
      badgeCount = inboxCount.count;
    }

    return (
      <Link
        key={item.to}
        to={item.to}
        search={item.search}
        data-testid={item.testId}
        className={`
          group relative flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md
          transition-all duration-150 ease-out
          ${inSection && !collapsed ? 'ml-3' : ''}
          ${isActive
            ? 'bg-[var(--color-sidebar-item-active)] text-[var(--color-sidebar-item-text-active)]'
            : 'text-[var(--color-sidebar-item-text)] hover:bg-[var(--color-sidebar-item-hover)] hover:text-[var(--color-text)]'
          }
          ${collapsed ? 'justify-center px-2' : ''}
        `}
        title={collapsed ? item.label : undefined}
      >
        {/* Active indicator bar */}
        {isActive && !collapsed && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--color-primary)] rounded-r-full"
            data-testid="active-indicator"
          />
        )}
        {/* Icon with optional badge dot when collapsed */}
        <div className="relative flex-shrink-0">
          <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--color-sidebar-item-text-active)]' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'}`} />
          {/* Badge dot when collapsed (TB137) */}
          {collapsed && badgeCount !== undefined && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500"
              data-testid={`${item.testId}-badge-dot`}
            />
          )}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {/* Badge count when expanded (TB137) */}
            {badgeCount !== undefined && (
              <span
                className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full"
                data-testid={`${item.testId}-badge`}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
            {!badgeCount && item.actionId && (
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                {getCurrentBinding(item.actionId)}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  const renderSection = (section: NavSection) => {
    const isExpanded = expandedSections.has(section.id);
    const hasActiveItem = section.items.some(item => isPathActive(item.to));
    const SectionIcon = section.icon;

    if (collapsed) {
      // In collapsed mode, show items directly without sections
      return (
        <div key={section.id} className="space-y-0.5">
          {section.items.map((item) => renderNavItem(item, false))}
        </div>
      );
    }

    return (
      <div key={section.id} className="mb-2" data-testid={`nav-section-${section.id}`}>
        {/* Section header */}
        <button
          onClick={() => toggleSection(section.id)}
          className={`
            w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider
            text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]
            transition-colors duration-150 rounded-md hover:bg-[var(--color-sidebar-item-hover)]
            ${hasActiveItem ? 'text-[var(--color-text-secondary)]' : ''}
          `}
          data-testid={`section-toggle-${section.id}`}
        >
          {SectionIcon && <SectionIcon className="w-3.5 h-3.5" />}
          <span className="flex-1 text-left">{section.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
          />
        </button>

        {/* Section items with animation */}
        <div
          className={`
            mt-1 space-y-0.5 overflow-hidden transition-all duration-200 ease-out
            ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
          `}
        >
          {section.items.map((item) => renderNavItem(item, true))}
        </div>
      </div>
    );
  };

  // When in mobile drawer, always show expanded and hide collapse controls
  const showCollapsedState = collapsed && !isMobileDrawer;
  const showExpandedState = !collapsed || isMobileDrawer;

  return (
    <aside
      className={`
        flex flex-col bg-[var(--color-sidebar-bg)]
        transition-all duration-200 ease-out
        ${isMobileDrawer ? 'w-full h-full border-none' : 'border-r border-[var(--color-sidebar-border)]'}
        ${!isMobileDrawer && collapsed ? 'w-16' : !isMobileDrawer ? 'w-60' : ''}
      `}
      data-testid="sidebar"
    >
      {/* Logo / Header */}
      <div className={`flex items-center justify-between h-14 px-4 border-b border-[var(--color-sidebar-border)] ${isMobileDrawer ? 'pr-12' : ''}`}>
        {showExpandedState && (
          <div className="flex items-center gap-2.5 ml-1">
            <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
            <span className="text-xl font-semibold tracking-wide text-[var(--color-text)]" style={{ fontFamily: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif" }}>stoneforge</span>
          </div>
        )}
        {showCollapsedState && (
          <img src="/logo.png" alt="Stoneforge" className="w-7 h-7 object-contain mx-auto" />
        )}
        {/* Collapse button in header - visible when expanded on desktop/tablet, hidden on mobile drawer */}
        {showExpandedState && !isMobileDrawer && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] transition-colors duration-150"
            aria-label="Collapse sidebar"
            aria-expanded="true"
            data-testid="sidebar-toggle"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">
        {NAV_SECTIONS.map(renderSection)}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2 py-3 border-t border-[var(--color-sidebar-border)] space-y-0.5">
        {BOTTOM_NAV_ITEMS.map((item) => renderNavItem(item, false))}
      </div>

      {/* Expand button - visible when collapsed on desktop/tablet, hidden on mobile */}
      {showCollapsedState && !isMobileDrawer && (
        <div className="px-2 py-3 border-t border-[var(--color-sidebar-border)]">
          <Tooltip content="Expand sidebar" shortcut="⌘B" side="right">
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center p-2 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1 focus:ring-offset-[var(--color-sidebar-bg)]"
              aria-label="Expand sidebar"
              aria-expanded="false"
              data-testid="sidebar-expand-button"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Keyboard hint - hide on mobile drawer (no keyboard shortcuts on mobile) */}
      {showExpandedState && !isMobileDrawer && (
        <div className="px-4 py-2 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-sidebar-border)]">
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] font-mono">⌘K</kbd>
          {' '}for commands
        </div>
      )}
    </aside>
  );
}
