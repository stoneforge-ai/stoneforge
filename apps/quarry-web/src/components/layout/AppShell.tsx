import { useState, useCallback, useMemo, useEffect } from 'react';
import { Outlet, useRouterState, Link, useRouter } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { MobileDrawer, UserSelector, type ConnectionState } from '@stoneforge/ui';
import { CommandPalette } from '../navigation';
import { ThemeToggle } from '@stoneforge/ui';
import { useRealtimeEvents } from '../../api/hooks/useRealtimeEvents';
import { useQuery } from '@tanstack/react-query';
import { useGlobalKeyboardShortcuts, useKeyboardShortcut, useIsMobile, useIsTablet, GlobalQuickActionsProvider } from '../../hooks';
import {
  ChevronRight,
  LayoutDashboard,
  CheckSquare,
  ClipboardList,
  Workflow,
  MessageSquare,
  FileText,
  Users,
  UsersRound,
  Settings,
  History,
  Menu,
  Search,
  Inbox,
  Network,
} from 'lucide-react';

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  websocket?: {
    clients: number;
    broadcasting: boolean;
  };
}

function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 30000,
  });
}

function ConnectionStatus({ wsState, health }: { wsState: ConnectionState; health: ReturnType<typeof useHealth> }) {
  if (wsState === 'connecting' || wsState === 'reconnecting') {
    return (
      <div className="flex items-center gap-2 text-[var(--color-warning-text)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
        <span className="text-sm font-medium">{wsState === 'connecting' ? 'Connecting...' : 'Reconnecting...'}</span>
      </div>
    );
  }

  if (wsState === 'connected') {
    return (
      <div className="flex items-center gap-2 text-[var(--color-success-text)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
        <span className="text-sm font-medium">Live</span>
      </div>
    );
  }

  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-text-tertiary)] animate-pulse" />
        <span className="text-sm">Connecting...</span>
      </div>
    );
  }

  if (health.isError) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-danger-text)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-danger)]" />
        <span className="text-sm font-medium">Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[var(--color-warning-text)]">
      <div className="w-2 h-2 rounded-full bg-[var(--color-warning)]" />
      <span className="text-sm font-medium">Polling</span>
    </div>
  );
}

// Route metadata for breadcrumbs
interface RouteConfig {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  parent?: string;
}

const ROUTE_CONFIG: Record<string, RouteConfig> = {
  '/dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  '/dashboard/overview': { label: 'Overview', icon: LayoutDashboard },
  '/dashboard/timeline': { label: 'Timeline', icon: History },
  '/tasks': { label: 'Tasks', icon: CheckSquare },
  '/plans': { label: 'Plans', icon: ClipboardList },
  '/workflows': { label: 'Workflows', icon: Workflow },
  '/dependencies': { label: 'Dependencies', icon: Network },
  '/inbox': { label: 'Inbox', icon: Inbox },
  '/messages': { label: 'Messages', icon: MessageSquare },
  '/documents': { label: 'Documents', icon: FileText },
  '/entities': { label: 'Entities', icon: Users },
  '/teams': { label: 'Teams', icon: UsersRound },
  '/settings': { label: 'Settings', icon: Settings },
};

interface BreadcrumbItem {
  label: string;
  path: string;
  icon?: React.ComponentType<{ className?: string }>;
  isLast: boolean;
}

function useBreadcrumbs(): BreadcrumbItem[] {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return useMemo(() => {
    const breadcrumbs: BreadcrumbItem[] = [];
    let path = currentPath;

    // Build breadcrumb chain from current path going up
    const pathsToResolve: string[] = [];
    while (path) {
      const config = ROUTE_CONFIG[path];
      if (config) {
        pathsToResolve.unshift(path);
        path = config.parent || '';
      } else {
        // Try to find a parent route
        const segments = path.split('/').filter(Boolean);
        if (segments.length > 1) {
          path = '/' + segments.slice(0, -1).join('/');
        } else {
          break;
        }
      }
    }

    // Create breadcrumb items
    pathsToResolve.forEach((p, index) => {
      const config = ROUTE_CONFIG[p];
      if (config) {
        breadcrumbs.push({
          label: config.label,
          path: p,
          icon: config.icon,
          isLast: index === pathsToResolve.length - 1,
        });
      }
    });

    return breadcrumbs;
  }, [currentPath]);
}

function Breadcrumbs() {
  const breadcrumbs = useBreadcrumbs();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs">
      <ol className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => {
          const Icon = crumb.icon;
          return (
            <li key={crumb.path} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 mx-1 text-[var(--color-text-muted)]" />
              )}
              {crumb.isLast ? (
                <span
                  className="flex items-center gap-1.5 px-2 py-1 font-semibold text-[var(--color-text)] rounded-md"
                  data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="flex items-center gap-1.5 px-2 py-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors duration-150"
                  data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * BreadcrumbsMobile - Simplified breadcrumbs for mobile header
 * Shows only the current page title
 */
function BreadcrumbsMobile() {
  const breadcrumbs = useBreadcrumbs();
  const lastCrumb = breadcrumbs[breadcrumbs.length - 1];

  if (!lastCrumb) {
    return null;
  }

  const Icon = lastCrumb.icon;

  return (
    <div
      className="flex items-center justify-center gap-1.5 text-sm font-semibold text-[var(--color-text)]"
      data-testid="breadcrumbs-mobile"
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span className="truncate max-w-[150px]">{lastCrumb.label}</span>
    </div>
  );
}

// Local storage key for sidebar collapse state (desktop only)
const SIDEBAR_COLLAPSED_KEY = 'stoneforge-sidebar-collapsed';

function useSidebarState() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  // Load initial desktop collapsed state from localStorage
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Persist desktop collapsed state
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(desktopCollapsed));
  }, [desktopCollapsed]);

  // Close mobile drawer when switching to larger viewport
  useEffect(() => {
    if (!isMobile) {
      setMobileDrawerOpen(false);
    }
  }, [isMobile]);

  return {
    isMobile,
    isTablet,
    desktopCollapsed,
    setDesktopCollapsed,
    mobileDrawerOpen,
    setMobileDrawerOpen,
  };
}

export function AppShell() {
  const {
    isMobile,
    isTablet,
    desktopCollapsed,
    setDesktopCollapsed,
    mobileDrawerOpen,
    setMobileDrawerOpen,
  } = useSidebarState();

  const health = useHealth();
  const { connectionState } = useRealtimeEvents({ channels: ['*'] });
  const router = useRouter();

  // Initialize global keyboard shortcuts (G T, G P, etc.)
  useGlobalKeyboardShortcuts();

  // Toggle sidebar with Cmd+B
  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileDrawerOpen(prev => !prev);
    } else {
      setDesktopCollapsed(prev => !prev);
    }
  }, [isMobile, setMobileDrawerOpen, setDesktopCollapsed]);
  useKeyboardShortcut('Cmd+B', toggleSidebar, 'Toggle sidebar');

  // Open mobile drawer
  const openMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(true);
  }, [setMobileDrawerOpen]);

  // Close mobile drawer
  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
  }, [setMobileDrawerOpen]);

  // Close mobile drawer on navigation
  useEffect(() => {
    const unsubscribe = router.subscribe('onResolved', () => {
      if (isMobile && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    });
    return () => unsubscribe();
  }, [router, isMobile, mobileDrawerOpen, setMobileDrawerOpen]);

  // Dynamic document title: "Quarry | {Page}"
  const routerState = useRouterState();
  useEffect(() => {
    const path = routerState.location.pathname;
    const config = ROUTE_CONFIG[path];
    document.title = config ? `Quarry | ${config.label}` : 'Quarry';
  }, [routerState.location.pathname]);

  // Calculate sidebar collapsed state based on device type
  // - Mobile: sidebar is hidden (shown as drawer)
  // - Tablet: sidebar starts collapsed
  // - Desktop: sidebar follows user preference
  const sidebarCollapsed = isMobile ? true : isTablet ? true : desktopCollapsed;

  return (
    <GlobalQuickActionsProvider>
    <div className="flex h-screen bg-[var(--color-bg)]" data-testid="app-shell">
      <CommandPalette />

      {/* Mobile: Sidebar as drawer */}
      {isMobile && (
        <MobileDrawer
          open={mobileDrawerOpen}
          onClose={closeMobileDrawer}
          data-testid="mobile-drawer"
        >
          <Sidebar
            collapsed={false}
            onToggle={closeMobileDrawer}
            isMobileDrawer
          />
        </MobileDrawer>
      )}

      {/* Tablet & Desktop: Static sidebar */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setDesktopCollapsed(!desktopCollapsed)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between h-14 px-4 md:px-6 bg-[var(--color-header-bg)] border-b border-[var(--color-header-border)]"
          data-testid="header"
        >
          {/* Mobile: Hamburger menu + centered title + search button */}
          {isMobile && (
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={openMobileDrawer}
                className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
                aria-label="Open navigation menu"
                aria-expanded={mobileDrawerOpen}
                data-testid="mobile-menu-button"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex-1 text-center">
                <BreadcrumbsMobile />
              </div>
              {/* Search button for command palette */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
                className="p-2 -mr-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
                aria-label="Search"
                data-testid="mobile-search-button"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Tablet & Desktop: Full breadcrumbs */}
          {!isMobile && <Breadcrumbs />}

          <div className="flex items-center gap-2 md:gap-4">
            {/* User selector for switching human entities */}
            {!isMobile && <UserSelector />}
            <ThemeToggle />
            {/* Only show divider and connection status on tablet+ */}
            {!isMobile && (
              <>
                <div className="h-5 w-px bg-[var(--color-border)]" />
                <ConnectionStatus wsState={connectionState} health={health} />
              </>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--color-bg)]">
          <Outlet />
        </main>
      </div>
    </div>
    </GlobalQuickActionsProvider>
  );
}
