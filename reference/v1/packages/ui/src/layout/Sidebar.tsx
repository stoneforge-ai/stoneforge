/**
 * Sidebar - Configurable navigation sidebar
 *
 * A collapsible sidebar component that can be customized with different
 * navigation items, sections, and branding.
 *
 * Features:
 * - Collapsible/expandable state
 * - Section grouping with expand/collapse
 * - Active state indicators
 * - Badge support for notification counts
 * - Mobile drawer mode
 * - Keyboard shortcut hints
 * - Customizable logo and branding
 */

import { useState, useCallback, type ReactNode, type ComponentType } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip } from '../components/Tooltip';

/**
 * Navigation item configuration
 */
export interface NavItem {
  /** Unique identifier for the item */
  id: string;
  /** Route path */
  to: string;
  /** Icon component */
  icon: LucideIcon | ComponentType<{ className?: string }>;
  /** Display label */
  label: string;
  /** Keyboard shortcut display (e.g., "⌘T") */
  shortcut?: string;
  /** Test ID for e2e testing */
  testId?: string;
  /** Route search params */
  search?: Record<string, unknown>;
  /** Badge count to display (e.g., inbox unread count) */
  badgeCount?: number;
}

/**
 * Navigation section configuration
 */
export interface NavSection {
  /** Unique identifier for the section */
  id: string;
  /** Section header label */
  label: string;
  /** Optional section icon */
  icon?: LucideIcon | ComponentType<{ className?: string }>;
  /** Whether section starts expanded (default: true) */
  defaultExpanded?: boolean;
  /** Navigation items in this section */
  items: NavItem[];
}

/**
 * Logo/branding configuration
 */
export interface SidebarBranding {
  /** Logo letter or short text */
  logoText: string;
  /** App name */
  appName: string;
  /** Gradient colors for logo background (Tailwind classes) */
  logoGradient?: string;
}

export interface SidebarProps {
  /** Whether sidebar is collapsed (shows only icons) */
  collapsed?: boolean;
  /** Callback when collapse toggle is clicked */
  onToggle?: () => void;
  /** Whether displayed inside a mobile drawer (hides collapse controls) */
  isMobileDrawer?: boolean;
  /** Navigation sections with items */
  sections: NavSection[];
  /** Bottom navigation items (e.g., Settings) */
  bottomItems?: NavItem[];
  /** Logo/branding configuration */
  branding?: SidebarBranding;
  /** Current active path */
  currentPath: string;
  /** Custom link component (for router integration) */
  LinkComponent: ComponentType<{
    to: string;
    search?: Record<string, unknown>;
    children: ReactNode;
    className?: string;
    title?: string;
    'data-testid'?: string;
  }>;
  /** Keyboard command hint (e.g., "⌘K for commands") */
  keyboardHint?: string;
  /** Tooltip for expand button (when collapsed) */
  expandTooltip?: { content: string; shortcut?: string };
  /** Path matching function (default: exact match) */
  isPathActive?: (itemPath: string, currentPath: string) => boolean;
}

// Default branding
const DEFAULT_BRANDING: SidebarBranding = {
  logoText: 'E',
  appName: 'Stoneforge',
  logoGradient: 'from-[var(--color-primary)] to-[var(--color-accent-500)]',
};

// Default path matching: exact match
const defaultIsPathActive = (itemPath: string, currentPath: string) => {
  return currentPath === itemPath;
};

export function Sidebar({
  collapsed = false,
  onToggle,
  isMobileDrawer = false,
  sections,
  bottomItems = [],
  branding = DEFAULT_BRANDING,
  currentPath,
  LinkComponent,
  keyboardHint = '⌘K for commands',
  expandTooltip = { content: 'Expand sidebar', shortcut: '⌘B' },
  isPathActive = defaultIsPathActive,
}: SidebarProps) {
  // Track expanded sections - default to section's defaultExpanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() =>
    new Set(sections.filter(s => s.defaultExpanded !== false).map(s => s.id))
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

  const renderNavItem = (item: NavItem, inSection: boolean = false) => {
    const isActive = isPathActive(item.to, currentPath);
    const Icon = item.icon;

    return (
      <LinkComponent
        key={item.id}
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
          {/* Badge dot when collapsed */}
          {collapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500"
              data-testid={`${item.testId}-badge-dot`}
            />
          )}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {/* Badge count when expanded */}
            {item.badgeCount !== undefined && item.badgeCount > 0 && (
              <span
                className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full"
                data-testid={`${item.testId}-badge`}
              >
                {item.badgeCount > 99 ? '99+' : item.badgeCount}
              </span>
            )}
            {!item.badgeCount && item.shortcut && (
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                {item.shortcut}
              </span>
            )}
          </>
        )}
      </LinkComponent>
    );
  };

  const renderSection = (section: NavSection) => {
    const isExpanded = expandedSections.has(section.id);
    const hasActiveItem = section.items.some(item => isPathActive(item.to, currentPath));
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
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${branding.logoGradient} flex items-center justify-center shadow-sm`}>
              <span className="text-white text-sm font-bold">{branding.logoText}</span>
            </div>
            <span className="text-base font-semibold text-[var(--color-text)]">{branding.appName}</span>
          </div>
        )}
        {showCollapsedState && (
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${branding.logoGradient} flex items-center justify-center mx-auto shadow-sm`}>
            <span className="text-white text-sm font-bold">{branding.logoText}</span>
          </div>
        )}
        {/* Collapse button in header - visible when expanded on desktop/tablet, hidden on mobile drawer */}
        {showExpandedState && !isMobileDrawer && onToggle && (
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
        {sections.map(renderSection)}
      </nav>

      {/* Bottom Navigation */}
      {bottomItems.length > 0 && (
        <div className="px-2 py-3 border-t border-[var(--color-sidebar-border)] space-y-0.5">
          {bottomItems.map((item) => renderNavItem(item, false))}
        </div>
      )}

      {/* Expand button - visible when collapsed on desktop/tablet, hidden on mobile */}
      {showCollapsedState && !isMobileDrawer && onToggle && (
        <div className="px-2 py-3 border-t border-[var(--color-sidebar-border)]">
          <Tooltip content={expandTooltip.content} shortcut={expandTooltip.shortcut} side="right">
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
      {showExpandedState && !isMobileDrawer && keyboardHint && (
        <div className="px-4 py-2 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-sidebar-border)]">
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] font-mono">{keyboardHint.split(' ')[0]}</kbd>
          {' '}{keyboardHint.split(' ').slice(1).join(' ')}
        </div>
      )}
    </aside>
  );
}
