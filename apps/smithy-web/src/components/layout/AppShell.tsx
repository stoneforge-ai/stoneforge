/**
 * AppShell - Main layout wrapper for Orchestrator web app
 * Three-column layout: Sidebar | Main Content | Director Panel
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Outlet, useRouterState, Link, useRouter } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { MobileDrawer, UserSelector } from '@stoneforge/ui';
import { DirectorPanel } from './DirectorPanel';
import { DaemonToggle } from './DaemonToggle';
import { StopAllAgentsButton } from './StopAllAgentsButton';
import { ThemeToggle } from '@stoneforge/ui';
import { NotificationCenter } from '../notification';
import { CommandPalette, useCommandPalette, QuickFileOpen, useQuickFileOpen, FileContentSearch, useFileContentSearchShortcut } from '../command';
import { useQuery } from '@tanstack/react-query';
import { useNotifications } from '../../api/hooks/useNotifications';
import { useGlobalKeyboardShortcuts } from '../../hooks';
import { useIsMobile, useIsTablet } from '@stoneforge/ui';
import {
  ChevronRight,
  Activity,
  CheckSquare,
  Users,
  LayoutGrid,
  Workflow,
  BarChart3,
  Settings,
  Menu,
  Search,
  Command,
  Inbox,
  MessageSquare,
  FileText,
  FileCode,
  ClipboardList,
  GitMerge,
} from 'lucide-react';

// Health check hook
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

// Connection status indicator
function ConnectionStatus({ health }: { health: ReturnType<typeof useHealth> }) {
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
    <div className="flex items-center gap-2 text-[var(--color-success-text)]">
      <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
      <span className="text-sm font-medium">Connected</span>
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
  '/activity': { label: 'Activity', icon: Activity },
  '/tasks': { label: 'Tasks', icon: CheckSquare },
  '/merge-requests': { label: 'Merge Requests', icon: GitMerge },
  '/plans': { label: 'Plans', icon: ClipboardList },
  '/agents': { label: 'Agents', icon: Users },
  '/workspaces': { label: 'Workspaces', icon: LayoutGrid },
  '/workflows': { label: 'Workflows', icon: Workflow },
  '/metrics': { label: 'Metrics', icon: BarChart3 },
  '/settings': { label: 'Settings', icon: Settings },
  // Collaborate section
  '/inbox': { label: 'Inbox', icon: Inbox },
  '/messages': { label: 'Messages', icon: MessageSquare },
  '/documents': { label: 'Documents', icon: FileText },
  '/editor': { label: 'Editor', icon: FileCode },
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

    // Build breadcrumb chain from current path
    const pathsToResolve: string[] = [];
    while (path) {
      const config = ROUTE_CONFIG[path];
      if (config) {
        pathsToResolve.unshift(path);
        path = config.parent || '';
      } else {
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
                  className="flex items-center gap-1.5 px-2 py-1 font-normal text-[var(--color-text)] rounded-md"
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

function BreadcrumbsMobile() {
  const breadcrumbs = useBreadcrumbs();
  const lastCrumb = breadcrumbs[breadcrumbs.length - 1];

  if (!lastCrumb) {
    return null;
  }

  const Icon = lastCrumb.icon;

  return (
    <div
      className="flex items-center justify-center gap-1.5 text-sm font-normal text-[var(--color-text)]"
      data-testid="breadcrumbs-mobile"
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span className="truncate max-w-[150px]">{lastCrumb.label}</span>
    </div>
  );
}

// Local storage keys
const SIDEBAR_COLLAPSED_KEY = 'orchestrator-sidebar-collapsed';
const DIRECTOR_COLLAPSED_KEY = 'orchestrator-director-collapsed';
const DIRECTOR_MAXIMIZED_KEY = 'orchestrator-director-maximized';

function useSidebarState() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(desktopCollapsed));
  }, [desktopCollapsed]);

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

function useDirectorPanelState() {
  const isMobile = useIsMobile();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    // Default to collapsed on initial load
    const stored = localStorage.getItem(DIRECTOR_COLLAPSED_KEY);
    return stored === null ? true : stored === 'true';
  });

  const [isMaximized, setIsMaximized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DIRECTOR_MAXIMIZED_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(DIRECTOR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(DIRECTOR_MAXIMIZED_KEY, String(isMaximized));
  }, [isMaximized]);

  // Always collapse on mobile
  const effectiveCollapsed = isMobile ? true : collapsed;

  return {
    collapsed: effectiveCollapsed,
    setCollapsed,
    isMaximized: isMobile ? false : isMaximized,
    setIsMaximized,
    isMobile,
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

  const {
    collapsed: directorCollapsed,
    setCollapsed: setDirectorCollapsed,
    isMaximized: directorMaximized,
    setIsMaximized: setDirectorMaximized,
  } = useDirectorPanelState();

  const health = useHealth();
  const router = useRouter();

  // Notification system
  const {
    notifications,
    unreadCount,
    isConnected: notificationsConnected,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearAll,
  } = useNotifications();

  // Command palette
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } = useCommandPalette();

  // Quick file open (Ctrl/Cmd+P)
  const { open: quickFileOpenOpen, setOpen: setQuickFileOpenOpen } = useQuickFileOpen();

  // File content search (Cmd/Ctrl+Shift+F)
  const { open: fileContentSearchOpen, setOpen: setFileContentSearchOpen } = useFileContentSearchShortcut();

  // Toggle sidebar (works for both mobile drawer and desktop sidebar)
  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileDrawerOpen(prev => !prev);
    } else {
      setDesktopCollapsed(prev => !prev);
    }
  }, [isMobile, setMobileDrawerOpen, setDesktopCollapsed]);

  const toggleDirectorPanel = useCallback(() => {
    setDirectorCollapsed(prev => !prev);
  }, [setDirectorCollapsed]);

  const toggleDirectorMaximize = useCallback(() => {
    // If panel is collapsed and we're toggling maximize, uncollapse it first
    if (directorCollapsed) {
      setDirectorCollapsed(false);
    }
    setDirectorMaximized(prev => !prev);
  }, [directorCollapsed, setDirectorCollapsed, setDirectorMaximized]);

  // Open command palette
  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, [setCommandPaletteOpen]);

  // Initialize global keyboard shortcuts (G T, G A, Cmd+B, Cmd+D, Cmd+Shift+D, etc.)
  useGlobalKeyboardShortcuts({
    onToggleSidebar: toggleSidebar,
    onToggleDirector: toggleDirectorPanel,
    onToggleDirectorMaximize: toggleDirectorMaximize,
    onOpenCommandPalette: openCommandPalette,
  });

  const openMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(true);
  }, [setMobileDrawerOpen]);

  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
  }, [setMobileDrawerOpen]);

  // Listen for toggle-director-panel event from command palette
  useEffect(() => {
    const handleToggleDirector = () => {
      setDirectorCollapsed(prev => !prev);
    };
    window.addEventListener('toggle-director-panel', handleToggleDirector);
    return () => window.removeEventListener('toggle-director-panel', handleToggleDirector);
  }, [setDirectorCollapsed]);

  // Listen for maximize-director-panel event from command palette
  useEffect(() => {
    const handleMaximizeDirector = () => {
      toggleDirectorMaximize();
    };
    window.addEventListener('maximize-director-panel', handleMaximizeDirector);
    return () => window.removeEventListener('maximize-director-panel', handleMaximizeDirector);
  }, [toggleDirectorMaximize]);

  // Listen for open-director-panel event (e.g., from Agents page "Open" button)
  useEffect(() => {
    const handleOpenDirector = () => {
      setDirectorCollapsed(false);
    };
    window.addEventListener('open-director-panel', handleOpenDirector);
    return () => window.removeEventListener('open-director-panel', handleOpenDirector);
  }, [setDirectorCollapsed]);

  // Close mobile drawer on navigation
  useEffect(() => {
    const unsubscribe = router.subscribe('onResolved', () => {
      if (isMobile && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    });
    return () => unsubscribe();
  }, [router, isMobile, mobileDrawerOpen, setMobileDrawerOpen]);

  // Dynamic document title: "Stoneforge | {Page}"
  const routerState = useRouterState();
  useEffect(() => {
    const path = routerState.location.pathname;
    const config = ROUTE_CONFIG[path];
    document.title = config ? `Stoneforge | ${config.label}` : 'Stoneforge';
  }, [routerState.location.pathname]);

  const sidebarCollapsed = isMobile ? true : isTablet ? true : desktopCollapsed;

  return (
    <div className="flex h-screen bg-[var(--color-bg)]" data-testid="app-shell">
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

      {/* Tablet & Desktop: Static sidebar - hidden when director panel is maximized */}
      {!isMobile && !(directorMaximized && !directorCollapsed) && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setDesktopCollapsed(!desktopCollapsed)}
        />
      )}

      {/* Main content area - hidden when director panel is maximized */}
      <div className={`flex flex-col min-w-0 ${directorMaximized && !directorCollapsed ? 'hidden' : 'flex-1'}`}>
        {/* Header */}
        <header
          className="h-14 bg-[var(--color-header-bg)] border-b border-[var(--color-header-border)] overflow-x-auto scrollbar-hide"
          data-testid="header"
        >
          <div className="flex items-center justify-between h-full px-4 md:px-6 min-w-max">
            {/* Mobile: Hamburger menu + centered title + search button */}
            {isMobile && (
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={openMobileDrawer}
                  className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target flex-shrink-0"
                  aria-label="Open navigation menu"
                  aria-expanded={mobileDrawerOpen}
                  data-testid="mobile-menu-button"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex-1 text-center whitespace-nowrap">
                  <BreadcrumbsMobile />
                </div>
                <button
                  className="p-2 -mr-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target flex-shrink-0"
                  aria-label="Search"
                  data-testid="mobile-search-button"
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Tablet & Desktop: Full breadcrumbs */}
            {!isMobile && (
              <div className="flex-shrink-0 whitespace-nowrap">
                <Breadcrumbs />
              </div>
            )}

            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
              {/* Command palette trigger - hidden on mobile */}
              {!isMobile && (
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 whitespace-nowrap"
                  aria-label="Open command palette"
                  data-testid="command-palette-trigger"
                >
                  <Search className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:inline">Search...</span>
                  <kbd className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded">
                    <Command className="w-3 h-3" />K
                  </kbd>
                </button>
              )}
              {/* User selector for switching human entities */}
              {!isMobile && <UserSelector />}
              {/* Daemon toggle for dispatch daemon control */}
              {!isMobile && <DaemonToggle />}
              {/* Stop all running agents button */}
              {!isMobile && <StopAllAgentsButton />}
              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadCount}
                isConnected={notificationsConnected}
                onMarkAsRead={markAsRead}
                onMarkAllAsRead={markAllAsRead}
                onDismiss={dismissNotification}
                onClearAll={clearAll}
                onOpenSettings={() => router.navigate({ to: '/settings', search: { tab: 'preferences' } })}
              />
              <ThemeToggle />
              {!isMobile && (
                <>
                  <div className="h-5 w-px bg-[var(--color-border)] flex-shrink-0" />
                  <ConnectionStatus health={health} />
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        {/*
         * Container query context (@container) enables child components to use
         * container-width-based breakpoints (@sm:, @md:, @lg:, @xl:) instead of
         * viewport-width-based ones (sm:, md:, lg:, xl:). This is critical for
         * correct responsive behavior when the director panel is open, as the
         * main content area is narrower than the viewport.
         *
         * Tailwind v4 natively supports container queries:
         *   - @container on parent → sets container-type: inline-size
         *   - @sm:, @md:, @lg:, @xl: on children → respond to container width
         */}
        <main className="flex-1 overflow-y-auto p-4 @md:p-6 bg-[var(--color-bg)] @container">
          <Outlet />
        </main>
      </div>

      {/* Director Panel (right sidebar) - hidden on mobile */}
      {!isMobile && (
        <DirectorPanel
          collapsed={directorCollapsed}
          onToggle={toggleDirectorPanel}
          isMaximized={directorMaximized}
          onToggleMaximize={toggleDirectorMaximize}
        />
      )}

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      {/* Quick File Open (Cmd+P) */}
      <QuickFileOpen
        open={quickFileOpenOpen}
        onOpenChange={setQuickFileOpenOpen}
      />

      {/* File Content Search (Cmd+Shift+F) */}
      <FileContentSearch
        open={fileContentSearchOpen}
        onOpenChange={setFileContentSearchOpen}
      />
    </div>
  );
}
