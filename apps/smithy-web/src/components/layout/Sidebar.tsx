/**
 * Sidebar - Orchestrator navigation sidebar
 * Left column with navigation to all orchestrator pages
 */

import { useState, useCallback } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  CheckSquare,
  ClipboardList,
  Users,
  LayoutGrid,
  Workflow,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronDown,
  PanelLeftOpen,
  Inbox,
  MessageSquare,
  FileText,
  FileCode,
  GitMerge,
  type LucideIcon,
} from 'lucide-react';
import { useShortcutVersion, Tooltip } from '@stoneforge/ui';
import { getCurrentBinding, formatKeyBinding } from '../../lib/keyboard';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  testId?: string;
  search?: Record<string, unknown>;
  /** Action ID for keyboard shortcut (matches DEFAULT_SHORTCUTS keys) */
  actionId?: string;
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
    id: 'overview',
    label: 'Overview',
    defaultExpanded: true,
    items: [
      { to: '/activity', icon: Activity, label: 'Activity', testId: 'nav-activity', actionId: 'nav.activity' },
      { to: '/inbox', icon: Inbox, label: 'Inbox', testId: 'nav-inbox', search: { message: undefined }, actionId: 'nav.inbox' },
      { to: '/editor', icon: FileCode, label: 'Editor', testId: 'nav-editor', actionId: 'nav.editor' },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    defaultExpanded: true,
    items: [
      { to: '/tasks', icon: CheckSquare, label: 'Tasks', testId: 'nav-tasks', actionId: 'nav.tasks' },
      { to: '/merge-requests', icon: GitMerge, label: 'Merge Requests', testId: 'nav-merge-requests', actionId: 'nav.mergeRequests' },
      { to: '/plans', icon: ClipboardList, label: 'Plans', testId: 'nav-plans', actionId: 'nav.plans' },
      { to: '/workflows', icon: Workflow, label: 'Workflows', testId: 'nav-workflows', actionId: 'nav.workflows' },
    ],
  },
  {
    id: 'orchestration',
    label: 'Orchestration',
    defaultExpanded: true,
    items: [
      { to: '/agents', icon: Users, label: 'Agents', testId: 'nav-agents', actionId: 'nav.agents' },
      { to: '/workspaces', icon: LayoutGrid, label: 'Workspaces', testId: 'nav-workspaces', actionId: 'nav.workspaces' },
    ],
  },
  {
    id: 'collaborate',
    label: 'Collaborate',
    defaultExpanded: true,
    items: [
      { to: '/messages', icon: MessageSquare, label: 'Messages', testId: 'nav-messages', search: { channel: undefined, message: undefined }, actionId: 'nav.messages' },
      { to: '/documents', icon: FileText, label: 'Documents', testId: 'nav-documents', search: { selected: undefined, library: undefined }, actionId: 'nav.documents' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    defaultExpanded: true,
    items: [
      { to: '/metrics', icon: BarChart3, label: 'Metrics', testId: 'nav-metrics', actionId: 'nav.metrics' },
    ],
  },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { to: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings', actionId: 'nav.settings' },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  isMobileDrawer?: boolean;
}

export function Sidebar({ collapsed = false, onToggle, isMobileDrawer = false }: SidebarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Subscribe to shortcut changes for hot-reload
  useShortcutVersion();

  // Track expanded sections
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
    return currentPath === path || currentPath.startsWith(path + '/');
  };

  const renderNavItem = (item: NavItem, inSection: boolean = false) => {
    const isActive = isPathActive(item.to);
    const Icon = item.icon;

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
        <div className="relative flex-shrink-0">
          <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--color-sidebar-item-text-active)]' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'}`} />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.actionId && (
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                {formatKeyBinding(getCurrentBinding(item.actionId))}
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
      return (
        <div key={section.id} className="space-y-0.5">
          {section.items.map((item) => renderNavItem(item, false))}
        </div>
      );
    }

    return (
      <div key={section.id} className="mb-2" data-testid={`nav-section-${section.id}`}>
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

      {/* Expand button */}
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

      {/* Keyboard hint */}
      {showExpandedState && !isMobileDrawer && (
        <div className="px-4 py-2 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-sidebar-border)]">
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] font-mono">⌘K</kbd>
          {' '}for commands
        </div>
      )}
    </aside>
  );
}
