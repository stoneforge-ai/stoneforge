/**
 * AppShell - Main application layout wrapper
 *
 * Provides a flexible layout structure with:
 * - Left sidebar (configurable, collapsible)
 * - Header with breadcrumbs and app-specific content
 * - Main content area
 * - Optional right panel (for orchestrator-web's director panel)
 *
 * Features:
 * - Responsive design (mobile, tablet, desktop)
 * - Mobile drawer for sidebar
 * - Keyboard shortcuts for sidebar toggle
 * - Flexible header slots for app-specific content
 */

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useIsMobile, useIsTablet } from '../hooks/useBreakpoint';
import { MobileDrawer } from './MobileDrawer';
import {
  Menu,
  Search,
} from 'lucide-react';

export interface AppShellProps {
  /** Sidebar content (typically a Sidebar component) */
  sidebar: ReactNode;
  /** Sidebar for mobile drawer (can be same as sidebar with isMobileDrawer prop) */
  mobileSidebar?: ReactNode;
  /** Header left content (typically breadcrumbs) */
  headerLeft?: ReactNode;
  /** Header right content (theme toggle, user selector, etc.) */
  headerRight?: ReactNode;
  /** Main content area */
  children: ReactNode;
  /** Optional right panel (e.g., director panel in orchestrator) */
  rightPanel?: ReactNode;
  /** Whether sidebar starts collapsed on desktop (default: false) */
  defaultSidebarCollapsed?: boolean;
  /** LocalStorage key for sidebar collapsed state (default: 'app-sidebar-collapsed') */
  sidebarStorageKey?: string;
  /** Callback when sidebar collapsed state changes */
  onSidebarToggle?: (collapsed: boolean) => void;
  /** Mobile header title (shown when mobile drawer closed) */
  mobileTitle?: ReactNode;
  /** Show search button on mobile (triggers custom event 'open-command-palette') */
  showMobileSearch?: boolean;
  /** Test ID prefix */
  testId?: string;
  /** Additional className for root element */
  className?: string;
  /** Content before the layout (e.g., command palette portal) */
  beforeContent?: ReactNode;
  /** Content after the layout */
  afterContent?: ReactNode;
}

/**
 * Hook to manage sidebar collapsed state with localStorage persistence
 */
export function useSidebarState(options: {
  storageKey?: string;
  defaultCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
}) {
  const {
    storageKey = 'app-sidebar-collapsed',
    defaultCollapsed = false,
    onToggle,
  } = options;

  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  // Load initial desktop collapsed state from localStorage
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === 'undefined') return defaultCollapsed;
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === 'true' : defaultCollapsed;
  });

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Persist desktop collapsed state
  useEffect(() => {
    localStorage.setItem(storageKey, String(desktopCollapsed));
    onToggle?.(desktopCollapsed);
  }, [desktopCollapsed, storageKey, onToggle]);

  // Close mobile drawer when switching to larger viewport
  useEffect(() => {
    if (!isMobile) {
      setMobileDrawerOpen(false);
    }
  }, [isMobile]);

  // Toggle function works differently based on device
  const toggle = useCallback(() => {
    if (isMobile) {
      setMobileDrawerOpen(prev => !prev);
    } else {
      setDesktopCollapsed(prev => !prev);
    }
  }, [isMobile]);

  // Calculate effective collapsed state based on device type
  // - Mobile: sidebar is hidden (shown as drawer)
  // - Tablet: sidebar starts collapsed
  // - Desktop: sidebar follows user preference
  const effectiveCollapsed = isMobile ? true : isTablet ? true : desktopCollapsed;

  return {
    isMobile,
    isTablet,
    collapsed: effectiveCollapsed,
    desktopCollapsed,
    setDesktopCollapsed,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    openMobileDrawer: () => setMobileDrawerOpen(true),
    closeMobileDrawer: () => setMobileDrawerOpen(false),
    toggle,
  };
}

export function AppShell({
  sidebar,
  mobileSidebar,
  headerLeft,
  headerRight,
  children,
  rightPanel,
  defaultSidebarCollapsed = false,
  sidebarStorageKey = 'app-sidebar-collapsed',
  onSidebarToggle,
  mobileTitle,
  showMobileSearch = true,
  testId = 'app-shell',
  className = '',
  beforeContent,
  afterContent,
}: AppShellProps) {
  const {
    isMobile,
    mobileDrawerOpen,
    openMobileDrawer,
    closeMobileDrawer,
  } = useSidebarState({
    storageKey: sidebarStorageKey,
    defaultCollapsed: defaultSidebarCollapsed,
    onToggle: onSidebarToggle,
  });

  const handleSearchClick = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  return (
    <div className={`flex h-screen bg-[var(--color-bg)] ${className}`} data-testid={testId}>
      {beforeContent}

      {/* Mobile: Sidebar as drawer */}
      {isMobile && (
        <MobileDrawer
          open={mobileDrawerOpen}
          onClose={closeMobileDrawer}
          data-testid={`${testId}-mobile-drawer`}
        >
          {mobileSidebar || sidebar}
        </MobileDrawer>
      )}

      {/* Tablet & Desktop: Static sidebar */}
      {!isMobile && sidebar}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between h-14 px-4 md:px-6 bg-[var(--color-header-bg)] border-b border-[var(--color-header-border)]"
          data-testid={`${testId}-header`}
        >
          {/* Mobile: Hamburger menu + centered title + search button */}
          {isMobile ? (
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={openMobileDrawer}
                className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
                aria-label="Open navigation menu"
                aria-expanded={mobileDrawerOpen}
                data-testid={`${testId}-mobile-menu-button`}
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex-1 text-center">
                {mobileTitle}
              </div>
              {showMobileSearch && (
                <button
                  onClick={handleSearchClick}
                  className="p-2 -mr-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
                  aria-label="Search"
                  data-testid={`${testId}-mobile-search-button`}
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
            </div>
          ) : (
            /* Tablet & Desktop: Full header content */
            <>{headerLeft}</>
          )}

          {/* Header right content (always visible, but apps can customize what shows on mobile) */}
          {!isMobile && headerRight && (
            <div className="flex items-center gap-2 md:gap-4">
              {headerRight}
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--color-bg)]" data-testid={`${testId}-main`}>
          {children}
        </main>
      </div>

      {/* Optional right panel (hidden on mobile) */}
      {!isMobile && rightPanel}

      {afterContent}
    </div>
  );
}
